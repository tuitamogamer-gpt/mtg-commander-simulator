import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

// A split storage land pays one counter per mana it adds. The automatic mana
// solver banks the first option that covers a payment, so the printed options
// have to start at the cheapest removal or the surplus counters are destroyed.

const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function board(MTG, seed = 61) {
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

function permanent(MTG, game, player, name, counters) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'battlefield';
  card.sick = false;
  if (counters) Object.assign(card.counters, counters);
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function spell(MTG, player, cost) {
  return new MTG.CardInst({
    name: 'Payment Target', cost, super: [], types: ['Sorcery'], subtypes: [], kws: [], oracle: '',
  }, player);
}

test('a split storage land removes only the counters the payment needs', async () => {
  const MTG = loadEngine();
  const { game, player } = board(MTG);
  const steppe = permanent(MTG, game, player, 'Saltcrusted Steppe', { storage: 4 });
  // Only the storage land can make green or white here, so the payment has to
  // come out of its counters; the Islands cover the printed {1} activation.
  for (let index = 0; index < 3; index++) permanent(MTG, game, player, 'Island');

  assert.equal(await game.payMana(player, MTG.parseCost('{G}'), { card: spell(MTG, player, '{G}') }), true,
    'one of the printed colors pays a single pip');
  assert.equal(steppe.counters.storage, 3, 'exactly one counter is spent for one mana');
  assert.equal(COLORS.reduce((sum, color) => sum + player.pool[color], 0), 0,
    'no surplus mana is floated from counters the payment never needed');
});

test('a split storage land can still pay across both printed colors', async () => {
  const MTG = loadEngine();
  const { game, player } = board(MTG, 62);
  const steppe = permanent(MTG, game, player, 'Saltcrusted Steppe', { storage: 4 });
  for (let index = 0; index < 3; index++) permanent(MTG, game, player, 'Island');

  assert.equal(await game.payMana(player, MTG.parseCost('{G}{W}'), { card: spell(MTG, player, '{G}{W}') }), true,
    'the removal is split freely between the two printed colors');
  assert.equal(steppe.counters.storage, 2, 'one counter per mana added');
});
