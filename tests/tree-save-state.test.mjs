import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function table() {
  const controller = { decide: async (game, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 1);
    if (q.type === 'orderTriggers') return q.triggers;
    return [];
  } };
  const game = new MTG.Game({ seed: 904, paced: false, maxTurns: 30 });
  const owner = game.addPlayer('Tree owner', { name: 'Blight Curse' }, controller, false);
  const opponent = game.addPlayer('Opponent', { name: 'Diagnostic' }, controller, true);
  game.turnPlayer = owner;
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  return { game, owner, opponent };
}

async function exchangedTree() {
  const state = table();
  const { game, owner } = state;
  const tree = new MTG.CardInst(MTG.DEFS['Tree of Perdition'], owner);
  tree.zone = 'hand';
  owner.hand.push(tree);
  await game.move(tree, 'battlefield');
  tree.sick = false;
  game.recalc();
  const entry = game.activatableList(owner).find(row => row.card === tree && row.ability);
  assert.ok(entry, 'Tree can actually activate');
  assert.equal(await game.activateAbility(owner, entry), true);
  for (let i = 0; i < 20 && (game.stack.length || game.pendingTriggers.length); i++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0);
  assert.equal(tree.toughness, 40);
  assert.equal(state.opponent.life, 13);
  return { ...state, tree };
}

test('actual Tree exchange remains saveable and restores exact toughness, marked damage and counters', async () => {
  const { game, tree } = await exchangedTree();
  await game.damageCreature(null, tree, 6);
  await game.addM1(tree, 2);
  assert.equal(tree.toughness, 38);
  assert.deepEqual(Array.from(MTG.gameStateSnapshotBlockers(game)), []);
  const snapshot = MTG.captureGameState(game);
  assert.ok(snapshot, 'persistent base toughness must not block every future checkpoint');
  assert.equal(snapshot.basePTEffects.length, 1);
  const fresh = table().game;
  MTG.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
  const restored = fresh.byIid(tree.iid);
  assert.equal(restored.toughness, 38);
  assert.equal(restored.power, -2);
  assert.equal(restored.damage, 6);
  assert.equal(restored.zoneVersion, tree.zoneVersion);
  assert.equal(fresh.players[1].life, 13);
  assert.equal(MTG.gameStateFingerprint(fresh), MTG.gameStateFingerprint(game));
});

test('resumed Tree loses exchanged toughness on a zone change and stale effects do not block another save', async () => {
  const { game, tree } = await exchangedTree();
  const fresh = table().game;
  MTG.restoreGameState(fresh, JSON.parse(JSON.stringify(MTG.captureGameState(game))));
  const restored = fresh.byIid(tree.iid);
  await fresh.move(restored, 'exile');
  await fresh.move(restored, 'battlefield');
  assert.ok(restored.zoneVersion > tree.zoneVersion);
  assert.equal(restored.toughness, 13, 'new object must not inherit an old layer 7b effect');
  const next = MTG.captureGameState(fresh);
  assert.ok(next);
  assert.equal(next.basePTEffects.length, 0, 'do not carry obsolete object-version effects into a new save');
  const again = table().game;
  MTG.restoreGameState(again, JSON.parse(JSON.stringify(next)));
  assert.equal(again.byIid(tree.iid).toughness, 13);
});

test('only finite plain base-setting effect data is portable; closures and unknown fields still block', async () => {
  const { game } = await exchangedTree();
  const effect = game.untilEffects.find(item => item.kind === 'oracleBasePT');
  for (const mutation of [
    { apply() {} }, { unknown: 1 }, { toughness: Infinity }, { power: NaN },
    { zoneVersion: -1 }, { timestamp: 'later' }, { timestamp: Number.MAX_SAFE_INTEGER }, { keywords: [() => {}] },
    { keywords: Array(33).fill('trample') }, { keywords: ['x'.repeat(65)] },
    { expires: 'untilTurnOf' },
  ]) {
    const bad = { ...effect, ...mutation };
    game.untilEffects = [bad];
    assert.equal(MTG.captureGameState(game), null, `refuse ${Object.keys(mutation).join(',')}`);
    assert.match(MTG.gameStateSnapshotBlockers(game).join(' '), /lasting effect/);
  }
  game.untilEffects = [effect];
  assert.ok(MTG.captureGameState(game));
  const snapshot = MTG.captureGameState(game);
  snapshot.basePTEffects[0].zoneVersion = -1;
  assert.throws(() => MTG.restoreGameState(table().game, snapshot), /base power\/toughness/);
  const badEffectClock = JSON.parse(JSON.stringify(MTG.captureGameState(game)));
  badEffectClock.basePTEffects[0].timestamp = Number.MAX_SAFE_INTEGER;
  assert.throws(() => MTG.restoreGameState(table().game, badEffectClock), /base power\/toughness/);
  const badCardClock = JSON.parse(JSON.stringify(MTG.captureGameState(game)));
  badCardClock.cards[0].timestamp = Number.MAX_SAFE_INTEGER;
  assert.throws(() => MTG.restoreGameState(table().game, badCardClock), /card timestamps/);
  MTG.reserveTimestamp(Number.MAX_SAFE_INTEGER);
  game.addOracleBasePT(game.bf()[0], { toughness: 20 });
  const firstTimestamp = game.untilEffects.at(-1).timestamp;
  game.addOracleBasePT(game.bf()[0], { toughness: 21 });
  assert.ok(Number.isSafeInteger(game.untilEffects.at(-1).timestamp));
  assert.ok(game.untilEffects.at(-1).timestamp > firstTimestamp);
});

test('older format-2 states without base-setting effects still restore', async () => {
  const { game, tree } = await exchangedTree();
  game.untilEffects.length = 0;
  game.recalc();
  const snapshot = MTG.captureGameState(game);
  delete snapshot.basePTEffects;
  const fresh = table().game;
  MTG.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(fresh.byIid(tree.iid).toughness, 13);
});

test('a new base-setting effect after resume is newer than all restored timestamps', async () => {
  const { game, tree } = await exchangedTree();
  const snapshot = JSON.parse(JSON.stringify(MTG.captureGameState(game)));
  // Model a save from a long prior process whose timestamp clock is much
  // further ahead than the fresh engine running this test.
  for (const card of snapshot.cards) card.timestamp = (card.timestamp || 0) + 1_000_000;
  for (const effect of snapshot.basePTEffects) effect.timestamp += 1_000_000;
  const previousMax = Math.max(...snapshot.cards.map(card => card.timestamp), ...snapshot.basePTEffects.map(effect => effect.timestamp));
  const fresh = table().game;
  MTG.restoreGameState(fresh, snapshot);
  const restored = fresh.byIid(tree.iid);
  assert.equal(restored.toughness, 40);
  fresh.addOracleBasePT(restored, { power: 5, toughness: 10 });
  assert.ok(fresh.untilEffects.at(-1).timestamp > previousMax, 'new effects must stay newer than restored permanent/effect timestamps');
  assert.equal(restored.power, 5);
  assert.equal(restored.toughness, 10, 'later layer 7b effect wins after resume');
});
