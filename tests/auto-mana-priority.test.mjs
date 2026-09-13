import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
function setup() {
  const game = new M.Game({ seed: 91326, paced: false });
  const player = game.addPlayer('You', { name: 'Mana priorities' }, { decide: async () => null }, false);
  game.addPlayer('Opponent', { name: 'Opponent' }, { decide: async () => null }, true);
  game.turnPlayer = player; game.turnNo = 4; game.phase = 'main1';
  const put = (name, extra) => {
    const def = extra ? { name, cost: '', super: [], types: ['Artifact'], subtypes: [], kws: [], oracle: '', ...extra } : M.DEFS[name];
    assert.ok(def, name);
    const card = new M.CardInst(def, player);
    card.zone = 'battlefield'; card.ctrl = player; card.sick = false;
    game.battlefield.push(card); game.recalc();
    return card;
  };
  const treasure = () => put('Priority Treasure', {
    subtypes: ['Treasure'], mana: { cost: { tap: true, sacSelf: true }, produce: [{ ANY: 1 }] },
  });
  const solve = cost => game.manaSolve(player, M.parseCost(cost));
  const pay = (cost, opts) => game.payMana(player, M.parseCost(cost), null, opts);
  return { game, player, put, treasure, solve, pay };
}
const used = solution => Array.from(solution.plan, step => step.src?.card).filter(Boolean);

test('auto mana pays with lands and leaves a 3/3 mana creature, rocks and Treasure available', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'); elf.counters['+1/+1'] = 2;
  const ring = f.put('Sol Ring'), treasure = f.treasure();
  const lands = [f.put('Forest'), f.put('Forest'), f.put('Mountain')];
  assert.equal(elf.power, 3);
  assert.deepEqual(used(f.solve('{2}{G}')), lands);
  assert.equal(await f.pay('{2}{G}'), true);
  assert.ok(lands.every(card => card.tapped));
  assert.equal(elf.tapped, false); assert.equal(ring.tapped, false);
  assert.equal(treasure.zone, 'battlefield');
});

test('flexible lands precede a fixed-color mana creature regardless of battlefield order', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves');
  const land = f.put('Flexible land', { types: ['Land'], mana: { cost: { tap: true }, produce: [{ ANY: 1 }] } });
  assert.equal(await f.pay('{G}'), true);
  assert.equal(land.tapped, true); assert.equal(elf.tapped, false);
});

test('lands cover their matching colors and generic mana before Treasure fills a missing color', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'), treasure = f.treasure();
  const forest = f.put('Forest'), mountain = f.put('Mountain');
  assert.deepEqual(used(f.solve('{1}{G}{U}')), [forest, mountain, treasure]);
  assert.equal(await f.pay('{1}{G}{U}'), true);
  assert.equal(treasure.zone, 'graveyard'); assert.equal(elf.tapped, false);
});

test('Treasure pays before a creature even though Treasure is sacrificed', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'), treasure = f.treasure();
  assert.equal(await f.pay('{G}'), true);
  assert.equal(treasure.zone, 'graveyard'); assert.equal(elf.tapped, false);
});

test('mana rocks supply the shortfall after lands and before a creature', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'), ring = f.put('Sol Ring');
  const forest = f.put('Forest');
  assert.deepEqual(used(f.solve('{2}{G}')), [forest, ring]);
  assert.equal(await f.pay('{2}{G}'), true);
  assert.equal(elf.tapped, false);
});

test('an artifact converter is considered before falling back to a colored mana creature', async () => {
  const f = setup();
  const dork = f.put('Blue mana creature', { types: ['Creature'], power: 3, toughness: 3,
    mana: { cost: { tap: true }, produce: [{ U: 1 }] } });
  const signet = f.put('Azorius Signet');
  const plains = f.put('Plains');
  assert.deepEqual(used(f.solve('{W}{U}')), [plains, signet]);
  assert.equal(await f.pay('{W}{U}'), true);
  assert.equal(dork.tapped, false);
});

test('a creature is used when it is the only way to supply a required color', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'), mountain = f.put('Mountain');
  assert.equal(await f.pay('{1}{G}'), true);
  assert.equal(elf.tapped, true); assert.equal(mountain.tapped, true);
});

test('needing one mana creature for green does not tap a second one instead of an available Signet', async () => {
  const f = setup();
  const elves = [f.put('Llanowar Elves'), f.put('Llanowar Elves')];
  const plains = f.put('Plains'), signet = f.put('Azorius Signet');
  assert.equal(await f.pay('{2}{G}'), true);
  assert.equal(plains.tapped, true); assert.equal(signet.tapped, true);
  assert.equal(elves.filter(card => card.tapped).length, 1);
});

test('color allocation backtracks to preserve every creature beyond the one needed for red', async () => {
  const f = setup();
  const land = f.put('Green or blue land', { types: ['Land'], mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] } });
  const rock = f.put('Green rock', { mana: { cost: { tap: true }, produce: [{ G: 1 }] } });
  const blue = f.put('Blue creature', { types: ['Creature'], power: 3, toughness: 3, mana: { cost: { tap: true }, produce: [{ U: 1 }] } });
  const red = f.put('Red creature', { types: ['Creature'], power: 3, toughness: 3, mana: { cost: { tap: true }, produce: [{ R: 1 }] } });
  assert.equal(await f.pay('{G}{U}{R}'), true);
  assert.equal(land.tapped, true); assert.equal(rock.tapped, true); assert.equal(red.tapped, true);
  assert.equal(blue.tapped, false);
});

test('granted mana on a creature and artifact creatures stay in the creature group', async () => {
  const f = setup();
  const bear = f.put('Grizzly Bears');
  const myr = f.put('Mana Myr', { types: ['Artifact', 'Creature'], power: 3, toughness: 3,
    mana: { cost: { tap: true }, produce: [{ G: 1 }] } });
  f.put('Grant mana', { types: ['Enchantment'], grantMana: {
    filter: (game, card) => card === bear, produce: [{ G: 1 }],
  } });
  const forest = f.put('Forest'), treasure = f.treasure();
  assert.equal(await f.pay('{G}{G}'), true);
  assert.equal(forest.tapped, true); assert.equal(treasure.zone, 'graveyard');
  assert.equal(bear.tapped, false); assert.equal(myr.tapped, false);
});

test('floating mana is spent before any permanent is tapped', async () => {
  const f = setup();
  f.player.pool.G = 1;
  const forest = f.put('Forest'), elf = f.put('Llanowar Elves');
  assert.equal(await f.pay('{G}'), true);
  assert.equal(f.player.pool.G, 0);
  assert.equal(forest.tapped, false); assert.equal(elf.tapped, false);
});

test('an animated land is preserved as a creature while Treasure pays its color', async () => {
  const f = setup();
  const land = f.put('Forest'), treasure = f.treasure();
  land.cur.types.push('Creature'); land.cur.power = 3; land.cur.toughness = 3;
  assert.equal(await f.pay('{G}'), true);
  assert.equal(treasure.zone, 'graveyard'); assert.equal(land.tapped, false);
});

test('manual selection can explicitly keep a land and tap a creature', async () => {
  const f = setup();
  const elf = f.put('Llanowar Elves'), forest = f.put('Forest');
  f.player.manualMana = true;
  f.player.controller = { decide: async (game, q) => {
    assert.equal(q.type, 'chooseManaSources');
    assert.deepEqual(Array.from(q.suggested), [forest]);
    return [elf];
  } };
  assert.equal(await f.pay('{G}', { isSpell: true }), true);
  assert.equal(elf.tapped, true); assert.equal(forest.tapped, false);
});

test('priorities preserve restricted-mana legality and failures leave the board untouched', async () => {
  const f = setup();
  const land = f.put('Creature-only land', { types: ['Land'], mana: {
    cost: { tap: true }, produce: [{ G: 1 }], restrict: (game, spell) => spell.card.is('Creature'),
  } });
  const treasure = f.treasure();
  const spell = new M.CardInst(M.DEFS['Giant Growth'], f.player);
  assert.equal(await f.game.payMana(f.player, M.parseCost('{G}'), { card: spell }), true);
  assert.equal(land.tapped, false); assert.equal(treasure.zone, 'graveyard');
  assert.equal(await f.game.payMana(f.player, M.parseCost('{U}'), { card: spell }), false);
  assert.equal(land.tapped, false);
});
