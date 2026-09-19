import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function table() {
  const game = new M.Game({seed: 1202, paced: false});
  const controller = {decide: async (g, q) => {
    if (q.type === 'chooseTargets') return [q.candidates.find(card => card.name === 'Grizzly Bears') || q.candidates[0]];
    if (q.type === 'chooseX') return Math.min(2, q.max);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    return {kind: 'pass'};
  }};
  const player = game.addPlayer('You', {name: 'Test'}, controller, false);
  game.addPlayer('Rival', {name: 'Test'}, controller, false);
  game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
    return card;
  };
  return {game, player, put};
}
async function settle(game) {
  while (game.stack.length || game.pendingTriggers.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
    await game.checkSBA();
  }
}
function restore(game) {
  const state = M.captureGameState(game);
  assert.ok(state, M.gameStateSnapshotBlockers(game).join(', '));
  const next = table().game;
  M.restoreGameState(next, JSON.parse(JSON.stringify(state)));
  assert.equal(M.gameStateFingerprint(next), M.gameStateFingerprint(game));
  return next;
}

for (const name of ['Braingeyser', "Maestro's Gift"]) {
  test(`prepared ${name} survives a JSON save and resolves with its real rules`, async () => {
    const {game, put} = table();
    const source = put(name === 'Braingeyser' ? 'Dirgur Focusmage' : 'Inspired Skypainter');
    const target = put('Grizzly Bears');
    for (let i = 0; i < 8; i++) put('Forest', 'library');
    const prepared = M.E.prepareSpell(game, source, M.E.preparedSpellDefinitions[name]);
    game.recalc();
    const next = restore(game), player = next.players[0], copy = next.byIid(prepared.iid);
    assert.equal(copy.isCopySpell, true);
    player.pool.C = 4; player.pool.U = 2; player.pool.R = 1;
    assert.ok(next.castableList(player).some(row => row.card === copy));
    assert.equal(await next.castSpell(player, copy, {from: 'exile', xVal: 2}), true);
    await settle(next);
    assert.equal(copy.zone, 'ceased', 'a cast prepared copy never becomes a physical graveyard card');
    assert.equal(next.byIid(source.iid).meta.prepared, false);
    if (name === 'Braingeyser') assert.equal(player.hand.length, 2);
    else {
      const token = next.bf().find(card => card.isToken && card.name === target.name);
      assert.ok(token); assert.equal(token.kw('haste'), true);
    }
    const removed = restore(game), removedCopy = removed.byIid(prepared.iid);
    await removed.move(removed.byIid(source.iid), 'hand');
    assert.equal(removedCopy.zone, 'ceased', 'leaving source removes the restored prepared copy');
  });
}

test('Storm of Souls preserves Spirit, flying and base stats in a save and expires on a blink', async () => {
  const {game, player, put} = table();
  const bear = put('Grizzly Bears', 'graveyard');
  const storm = put('Storm of Souls', 'hand');
  player.pool.C = 4; player.pool.W = 2; game.recalc();
  assert.equal(await game.castSpell(player, storm, {from: 'hand'}), true);
  await settle(game);
  game.addCounters(bear, '+1/+1', 2); game.recalc();
  const next = restore(game), spirit = next.byIid(bear.iid);
  assert.equal(spirit.power, 3); assert.equal(spirit.toughness, 3);
  assert.equal(spirit.kw('flying'), true); assert.equal(spirit.hasSub('Spirit'), true);
  assert.equal(spirit.hasSub('Bear'), true);
  await next.move(spirit, 'hand');
  await next.putPermanentOntoBattlefield(spirit, next.players[0]);
  await settle(next);
  assert.equal(spirit.power, 2); assert.equal(spirit.toughness, 2);
  assert.equal(spirit.kw('flying'), false); assert.equal(spirit.hasSub('Spirit'), false);
});

test('token copy exceptions survive saving and copying the restored token again', async () => {
  const {game, player, put} = table();
  const hydra = put('Primordial Hydra');
  hydra.counters['+1/+1'] = 4; game.recalc();
  const [copy] = await game.copyPermanentToken(hydra, player, {modPT: [7, 7], copyKeywords: ['flying']});
  await settle(game);
  const next = restore(game), restored = next.byIid(copy.iid);
  assert.equal(restored.power, 7); assert.equal(restored.toughness, 7);
  assert.equal(restored.kw('flying'), true);
  const [again] = await next.copyPermanentToken(restored, next.players[0]);
  await settle(next);
  assert.equal(again.power, 7); assert.equal(again.toughness, 7);
  assert.equal(again.kw('flying'), true);
});

test('phased-out permanents retain their last visible characteristics after restoring', () => {
  const {game, player, put} = table();
  const woman = put('Invisible Woman'); game.recalc();
  game.phaseOut(woman, player);
  const next = restore(game), restored = next.byIid(woman.iid);
  assert.equal(restored.phasedOut, true);
  assert.equal(restored.power, 3); assert.equal(restored.toughness, 3);
  assert.equal(next.bf().includes(restored), false, 'the phased object is still absent for game rules');
});
