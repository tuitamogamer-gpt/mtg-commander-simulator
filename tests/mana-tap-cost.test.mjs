import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

// Tapping other permanents is an additional cost of a mana ability. It has to
// be reserved with the rest of a payment plan: one tap can never fund two
// costs, and a permanent reserved elsewhere is not available to it.

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function board(MTG, seed = 91) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 3 });
  const player = game.addPlayer('P', { name: 'P' }, {
    decide: async (g, q) => (q.type === 'chooseCards' ? (q.from || []).slice(0, q.min ?? 1)
      : q.type === 'chooseOption' ? q.options?.[0]?.key : null),
  }, false);
  game.addPlayer('O', { name: 'O' }, { decide: async () => ({ kind: 'pass' }) }, false);
  game.turnPlayer = player;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = 'main';
  for (const color of COLORS) { player.pool[color] = 0; player.coloredOnlyPool[color] = 0; }
  player.poolMeta = [];
  return { game, player };
}

function permanent(MTG, game, player, def, counters) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield';
  card.sick = false;
  if (counters) Object.assign(card.counters, counters);
  game.battlefield.push(card);
  game.recalc();
  return card;
}

// The exact shape the importer compiles for the Jaspera Sentinel family.
function tapper(name) {
  return {
    name, cost: '{G}', super: [], types: ['Creature'], subtypes: ['Elf'],
    power: '0', toughness: '1', kws: [], oracle: '',
    mana: {
      cost: { tap: true, tapPermanents: { n: 1, filter: (game, candidate) => candidate.is('Creature') } },
      possibleProduce: [{ ANY: 1 }], produce: [{ ANY: 1 }],
    },
  };
}

function elves(name) {
  return {
    name, cost: '{G}', super: [], types: ['Creature'], subtypes: ['Elf'],
    power: '1', toughness: '1', kws: [], oracle: '',
    mana: { cost: { tap: true }, possibleProduce: [{ G: 1 }], produce: [{ G: 1 }] },
  };
}

test('a tapped creature cannot fund both its own mana ability and a tap cost', async () => {
  const MTG = loadEngine();
  const { game, player } = board(MTG);
  const sentinel = permanent(MTG, game, player, tapper('Tap Sentinel'));
  const helper = permanent(MTG, game, player, elves('Mana Elves'));
  const spell = new MTG.CardInst({
    name: 'Two Mana Spell', cost: '{G}{G}', super: [], types: ['Sorcery'], subtypes: [], kws: [], oracle: '',
  }, player);

  assert.equal(game.canPayMana(player, MTG.parseCost('{G}{G}'), { card: spell }), false,
    'a board that can legally make one mana cannot pay two');
  assert.equal(await game.payMana(player, MTG.parseCost('{G}{G}'), { card: spell }), false,
    'the payment fails instead of producing mana that was never paid for');
  assert.equal(sentinel.tapped, false, 'a failed payment leaves nothing tapped');
  assert.equal(helper.tapped, false, 'a failed payment leaves nothing tapped');
  assert.equal(COLORS.reduce((sum, color) => sum + player.pool[color], 0), 0,
    'a failed payment floats no mana');
});

test('one tap cost is paid and the source produces its mana', async () => {
  const MTG = loadEngine();
  const { game, player } = board(MTG, 92);
  const sentinel = permanent(MTG, game, player, tapper('Tap Sentinel'));
  const helper = permanent(MTG, game, player, elves('Mana Elves'));
  const spell = new MTG.CardInst({
    name: 'One Mana Spell', cost: '{W}', super: [], types: ['Sorcery'], subtypes: [], kws: [], oracle: '',
  }, player);

  assert.equal(await game.payMana(player, MTG.parseCost('{W}'), { card: spell }), true,
    'the tap cost is payable with a second creature on the battlefield');
  assert.equal(sentinel.tapped, true, 'the source taps for its own cost');
  assert.equal(helper.tapped, true, 'the additional cost actually taps a creature');
});

test('a permanent reserved by the caller is not consumed as a tap cost', async () => {
  const MTG = loadEngine();
  const { game, player } = board(MTG, 93);
  const sentinel = permanent(MTG, game, player, tapper('Tap Sentinel'));
  const reserved = permanent(MTG, game, player, elves('Reserved Elves'));
  const spell = new MTG.CardInst({
    name: 'One Mana Spell', cost: '{W}', super: [], types: ['Sorcery'], subtypes: [], kws: [], oracle: '',
  }, player);

  assert.equal(await game.payMana(player, MTG.parseCost('{W}'), { card: spell }, { excludeCards: [reserved] }), false,
    'the only legal tap target is reserved for a cost outside this payment');
  assert.equal(reserved.tapped, false, 'the reserved creature is left untapped for its own cost');
  assert.equal(sentinel.tapped, false, 'nothing is tapped when the cost cannot be paid');
});
