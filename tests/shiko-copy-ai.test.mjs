import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function add(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function setup(difficulty = 'hard', paced = false) {
  const game = new MTG.Game({ seed: 84260, difficulty, paced });
  game.speedFactor = 0;
  const player = game.addPlayer('Jeskai', { name: 'Jeskai Striker' }, null, true);
  player.deckName = 'Jeskai Striker';
  player.controller = new MTG.AIController(player, { difficulty, style: 'balanced' });
  const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, { decide: async () => ({ kind: 'pass' }) }, false);
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  const shiko = add(game, player, 'Shiko and Narset, Unified');
  return { game, player, opponent, shiko };
}

async function settle(game) {
  for (let n = 0; n < 40 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}

async function secondSpell(f, name) {
  const first = add(f.game, f.player, 'Sol Ring', 'hand');
  assert.equal(await f.game.castSpell(f.player, first, { from: 'hand', alt: { free: true } }), true);
  await settle(f.game);
  const card = add(f.game, f.player, name, 'hand');
  assert.equal(await f.game.castSpell(f.player, card, { from: 'hand', alt: { free: true } }), true);
  const original = f.game.stack.find(row => row.card === card && row.kind === 'spell');
  await f.game.resolveTop();
  const copy = f.game.stack.find(row => row.card === card && row.isCopy);
  assert.ok(copy, 'Shiko flurry makes a real stack copy');
  return { card, original, copy };
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const paced of [false, true]) {
    test(`${difficulty} ${paced ? 'interactive' : 'headless'} Shiko AI sends Pongify copies to separate opponents' creatures`, async () => {
      const f = setup(difficulty, paced);
      const creatures = [add(f.game, f.opponent, 'Air Elemental'), add(f.game, f.opponent, 'Colossal Dreadmaw')];
      const { original, copy } = await secondSpell(f, 'Pongify');
      assert.ok(creatures.includes(original.targets[0]));
      assert.ok(creatures.includes(copy.targets[0]));
      assert.notEqual(copy.targets[0]?.iid, original.targets[0]?.iid);
      assert.equal(copy.targetMode, 'new');
      await settle(f.game);
      assert.ok(creatures.every(card => card.zone === 'graveyard'));
      assert.equal(f.game.creatures(f.opponent).filter(card => card.isToken).length, 2);
      assert.equal(f.shiko.zone, 'battlefield');
    });
  }

  test(`${difficulty} Shiko retains Pongify's target when the alternatives are friendly or indestructible`, async () => {
    const f = setup(difficulty);
    const victim = add(f.game, f.opponent, 'Air Elemental');
    const own = add(f.game, f.player, 'Colossal Dreadmaw');
    const indestructible = add(f.game, f.opponent, 'Darksteel Colossus');
    const { original, copy } = await secondSpell(f, 'Pongify');
    assert.equal(original.targets[0]?.iid, victim.iid);
    assert.equal(copy.targets[0]?.iid, victim.iid);
    assert.equal(copy.targetMode, 'same');
    await settle(f.game);
    assert.equal(victim.zone, 'graveyard');
    assert.equal(own.zone, 'battlefield');
    assert.equal(indestructible.zone, 'battlefield');
    assert.equal(f.shiko.zone, 'battlefield');
    assert.equal(f.game.creatures(f.opponent).filter(card => card.isToken).length, 1);
  });
}

test('Shiko also spreads exile and bounce spells', async () => {
  for (const [name, zone] of [['Swords to Plowshares', 'exile'], ['Unsummon', 'hand']]) {
    const f = setup();
    const creatures = [add(f.game, f.opponent, 'Air Elemental'), add(f.game, f.opponent, 'Colossal Dreadmaw')];
    const { original, copy } = await secondSpell(f, name);
    assert.notEqual(copy.targets[0]?.iid, original.targets[0]?.iid, name);
    await settle(f.game);
    assert.ok(creatures.every(card => card.zone === zone), name);
  }
});

test('damage copies keep focusing a creature that needs both hits', async () => {
  const f = setup();
  const victim = add(f.game, f.opponent, 'Air Elemental');
  add(f.game, f.opponent, 'Colossal Dreadmaw');
  const bolt = add(f.game, f.player, 'Lightning Bolt', 'hand');
  const ai = f.player.controller;
  f.player.controller = { decide: (game, query) => query.type === 'chooseTargets' ? [victim] : ai.decide(game, query) };
  assert.equal(await f.game.castSpell(f.player, bolt, { from: 'hand', alt: { free: true } }), true);
  f.player.controller = ai;
  const original = f.game.stack.find(row => row.card === bolt);
  const copy = await f.game.copySpell(original, f.player, { mayNewTargets: true });
  assert.equal(copy.targets[0]?.iid, victim.iid);
  await settle(f.game);
  assert.equal(victim.zone, 'graveyard');
});

test('a human can still keep the same Pongify target despite a useful alternative', async () => {
  const f = setup();
  const victim = add(f.game, f.opponent, 'Air Elemental');
  add(f.game, f.opponent, 'Colossal Dreadmaw');
  const prompts = [];
  f.player.isAI = false;
  f.player.controller = { decide: async (_, query) => {
    if (query.type === 'chooseTargets') return [victim];
    if (query.aiHint?.kind === 'newTargets') { prompts.push(query); return 'no'; }
    return query.options?.[0]?.key;
  } };
  const { original, copy } = await secondSpell(f, 'Pongify');
  assert.equal(prompts.length, 1);
  assert.equal(copy.targets[0]?.iid, original.targets[0]?.iid);
  assert.equal(copy.targetMode, 'same');
});
