import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function setup(isAI = false) {
  const game = new MTG.Game({ seed: 91026, paced: false });
  const controller = { decide: async (g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseOption') return q.options[0]?.key;
    return [];
  } };
  const player = game.addPlayer('Caster', { name: 'Sunburst' }, controller, isAI);
  game.addPlayer('Opponent', { name: 'Opponent' }, controller, true);
  game.turnPlayer = player;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player };
}

function put(game, player, name, zone = 'hand') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  card.sick = false;
  (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
  game.recalc();
  return card;
}

async function settle(game) {
  for (let n = 0; n < 50; n++) {
    await game.flushTriggers();
    if (!game.stack.length) { await game.checkSBA(); return; }
    await game.resolveTop();
  }
  assert.fail('stack did not settle');
}

for (const isAI of [false, true]) {
  for (const [name, colors, kind] of [
    ['Etched Oracle', ['W', 'U', 'B', 'R'], '+1/+1'],
    ['Crystalline Crawler', ['W', 'U', 'B', 'R'], '+1/+1'],
    ['Pentad Prism', ['W', 'U'], 'charge'],
  ]) {
    test(`${isAI ? 'AI' : 'human'}: ${name} keeps spent colors through resolution, but not reanimation`, async () => {
      const { game, player } = setup(isAI);
      for (const color of colors) player.pool[color] = 1;
      const card = put(game, player, name);
      assert.equal(await game.castSpell(player, card, { from: 'hand' }), true);
      await settle(game);
      assert.deepEqual(Array.from(card.castMeta.paymentColors).sort(), colors.slice().sort());
      assert.equal(card.zone, 'battlefield');
      assert.equal(card.counters[kind], colors.length);
      await game.move(card, 'graveyard');
      await game.move(card, 'battlefield');
      await settle(game);
      assert.equal(card.castMeta, null);
      assert.equal(card.counters[kind] || 0, 0);
      assert.equal(card.zone, name === 'Etched Oracle' ? 'graveyard' : 'battlefield');
    });
  }
}

test('Etched Oracle survives auto-payment with Empowered Autogenerator and three land colors', async () => {
  const { game, player } = setup();
  const generator = put(game, player, 'Empowered Autogenerator', 'battlefield');
  for (const name of ['Island', 'Swamp', 'Mountain']) put(game, player, name, 'battlefield');
  const card = put(game, player, 'Etched Oracle');
  assert.equal(await game.castSpell(player, card, { from: 'hand' }), true);
  await settle(game);
  assert.equal(generator.counters.charge, 1);
  assert.equal(generator.tapped, true);
  assert.equal(card.zone, 'battlefield');
  assert.equal(card.counters['+1/+1'], 4);
  assert.equal(card.toughness, 4);
});

test('Etched Oracle gets one counter for repeated blue mana, zero for colorless or a free cast', async () => {
  for (const mode of ['blue', 'colorless', 'free']) {
    const { game, player } = setup();
    player.pool[mode === 'blue' ? 'U' : 'C'] = 4;
    const card = put(game, player, 'Etched Oracle');
    const opts = mode === 'free' ? { from: 'hand', alt: { free: true } } : { from: 'hand' };
    assert.equal(await game.castSpell(player, card, opts), true);
    await settle(game);
    assert.equal(card.zone, mode === 'blue' ? 'battlefield' : 'graveyard');
    assert.equal(card.counters['+1/+1'] || 0, mode === 'blue' ? 1 : 0);
    if (mode === 'free') assert.equal(player.pool.C, 4);
  }
});

test('a Pentad Prism spell copy does not inherit the original payment', async () => {
  const { game, player } = setup();
  game.priorityRound = async () => {};
  player.pool.W = 1;
  player.pool.U = 1;
  const prism = put(game, player, 'Pentad Prism');
  assert.equal(await game.castSpell(player, prism, { from: 'hand' }), true);
  const spell = game.stack.find(entry => entry.card === prism);
  assert.ok(spell);
  await game.copySpell(spell, player, { mayNewTargets: false });
  await settle(game);
  const copy = game.bf().find(card => card.isToken && card.name === prism.name);
  assert.ok(copy);
  assert.equal(copy.counters.charge || 0, 0);
  assert.equal(prism.counters.charge, 2);
});

test('recasting the same Oracle for free does not reuse its earlier payment', async () => {
  const { game, player } = setup();
  player.pool.U = 4;
  const card = put(game, player, 'Etched Oracle');
  assert.equal(await game.castSpell(player, card, { from: 'hand' }), true);
  await settle(game);
  assert.equal(card.counters['+1/+1'], 1);
  await game.move(card, 'hand');
  assert.equal(await game.castSpell(player, card, { from: 'hand', free: true }), true);
  await settle(game);
  assert.equal(card.castMeta.paymentColors.length, 0);
  assert.equal(card.zone, 'graveyard');
});
