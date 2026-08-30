import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function makeGame(seed, life = 40) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 2, difficulty: 'hard' });
  const player = game.addPlayer('Mana solver payer', { name: 'Mana solver payer' }, null, true);
  game.addPlayer('Mana solver opponent', { name: 'Mana solver opponent' }, {
    decide: async () => ({ kind: 'pass' }),
  }, false);
  player.life = life;
  for (const color of COLORS) {
    player.pool[color] = 0;
    player.coloredOnlyPool[color] = 0;
  }
  player.poolMeta = [];
  game.turnPlayer = player;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player };
}

function definition(name, extras = {}) {
  return Object.assign({
    name,
    cost: '{1}',
    super: [],
    types: ['Artifact'],
    subtypes: [],
    oracle: '',
    kws: [],
  }, extras);
}

function permanent(game, player, def) {
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function converter(game, player, name, activationMana, produce) {
  return permanent(game, player, definition(name, {
    mana: {
      cost: { tap: true, mana: activationMana },
      produce: [produce],
    },
  }));
}

function paymentFor(player, name, cost) {
  const card = new MTG.CardInst(definition(name, {
    cost,
    types: ['Instant'],
    resolve: async () => {},
  }), player);
  return { card, castOpts: {} };
}

function poolTotal(player) {
  return COLORS.reduce((total, color) => total + (Number(player.pool[color]) || 0), 0);
}

test('converter outputs cannot circularly finance both activation costs from an empty pool', async () => {
  const { game, player } = makeGame(840101);
  const converterA = converter(game, player, 'Circular converter A', '{C}', { R: 1, U: 1 });
  const converterB = converter(game, player, 'Circular converter B', '{1}', { C: 1, R: 1, G: 1 });
  const cost = MTG.parseCost('{3}');
  const payment = paymentFor(player, 'Circular destination', '{3}');

  assert.equal(game.manaSolve(player, cost, payment), null,
    'neither converter can be the first activation without already available mana');
  assert.equal(game.canPayMana(player, cost, payment), false);
  assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), false);
  assert.equal(converterA.tapped, false, 'failed preflight does not tap converter A');
  assert.equal(converterB.tapped, false, 'failed preflight does not tap converter B');
  assert.equal(poolTotal(player), 0, 'failed circular plan creates no mana');
});

test('the same converter graph succeeds only when an initial mana unit seeds the real activation order', async () => {
  const { game, player } = makeGame(840102);
  player.pool.C = 1;
  const converterA = converter(game, player, 'Seeded converter A', '{C}', { R: 1, U: 1 });
  const converterB = converter(game, player, 'Seeded converter B', '{1}', { C: 1, R: 1, G: 1 });
  const cost = MTG.parseCost('{4}');
  const payment = paymentFor(player, 'Seeded destination', '{4}');

  const solution = game.manaSolve(player, cost, payment);
  assert.ok(solution, 'one floating colorless mana can start the acyclic converter chain');
  assert.deepEqual(Array.from(solution.plan, step => step.src && step.src.card.name).filter(Boolean),
    ['Seeded converter A', 'Seeded converter B']);
  assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), true);
  assert.equal(converterA.tapped, true);
  assert.equal(converterB.tapped, true);
  assert.equal(poolTotal(player), 0, 'the seed and every produced mana unit pay the exact four-mana cost');
});

test('floating pool backtracks across a hybrid pip before the fixed white pip', async () => {
  const { game, player } = makeGame(840103);
  player.pool.W = 1;
  player.pool.U = 1;
  const cost = MTG.parseCost('{W/U}{W}');
  const payment = paymentFor(player, 'Hybrid floating destination', '{W/U}{W}');

  const solution = game.manaSolve(player, cost, payment);
  assert.ok(solution);
  assert.equal(solution.plan.length, 0, 'no battlefield source is needed');
  assert.equal(solution.usedPool.W, 1, 'white is reserved for the fixed white pip');
  assert.equal(solution.usedPool.U, 1, 'blue pays the hybrid pip');
  assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), true);
  assert.equal(player.pool.W, 0);
  assert.equal(player.pool.U, 0);
});

test('floating pool backtracks to life for Phyrexian mana and preserves black for the fixed pip', async () => {
  const { game, player } = makeGame(840104, 2);
  player.pool.B = 1;
  const cost = MTG.parseCost('{B/P}{B}');
  const payment = paymentFor(player, 'Phyrexian floating destination', '{B/P}{B}');

  const solution = game.manaSolve(player, cost, payment);
  assert.ok(solution);
  assert.equal(solution.usedPool.B, 1, 'the only black mana pays the fixed black pip');
  assert.equal(solution.plan.filter(step => step.phyrexianLife === 2).length, 1,
    'the overlapping Phyrexian pip is paid with exactly two life');
  assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), true);
  assert.equal(player.pool.B, 0);
  assert.equal(player.life, 0);
  assert.equal(payment.phyrexianLifePaid, 1);
});

test('large any-combination X source stays bounded and pays a five-color cost exactly', async () => {
  const { game, player } = makeGame(840105);
  const source = permanent(game, player, definition('Large any-combination source', {
    types: ['Creature'],
    power: '1', toughness: '1',
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 12 }] },
  }));
  const cost = MTG.parseCost('{7}{W}{U}{B}{R}{G}');
  const payment = paymentFor(player, 'Large any-combination destination', '{7}{W}{U}{B}{R}{G}');

  const solution = game.manaSolve(player, cost, payment);
  assert.ok(solution, 'the high-output source is solved without permutation growth');
  assert.equal(solution.plan.length, 1);
  assert.equal(solution.plan[0].src.card, source);
  assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), true);
  assert.equal(source.tapped, true);
  assert.equal(poolTotal(player), 0);
});

test('Arbor Adherent produces all X mana in one chosen color', async () => {
  const { game, player } = makeGame(840106);
  const adherent = permanent(game, player, MTG.DEFS['Arbor Adherent']);
  permanent(game, player, definition('Ten-toughness reference', {
    types: ['Creature'], power: '0', toughness: '10',
  }));
  const payment = paymentFor(player, 'Arbor destination', '{7}{W}');
  const sources = game.manaSources(player, payment, { includeRestricted: true })
    .filter(source => source.card === adherent && source.produce.some(option => Number(option.W) === 10));

  assert.equal(sources.length, 1);
  assert.equal(sources[0].produce.some(option => option.ANY), false);
  assert.equal(await game.payMana(player, MTG.parseCost('{7}{W}'), payment, { isSpell: true }), true);
  assert.equal(adherent.tapped, true);
  assert.equal(player.pool.W, 2, 'the unused mana remains the same chosen color');
  assert.equal(COLORS.filter(color => color !== 'W').reduce((sum, color) => sum + player.pool[color], 0), 0);
});
