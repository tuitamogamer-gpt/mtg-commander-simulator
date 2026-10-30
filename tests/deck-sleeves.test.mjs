import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Player tools and deck sleeves in a sandbox without a DOM or canvas.
function sleeves() {
  const values = new Map();
  const DEFS = {
    'Jean-Luc Picard, Luminary': { identity: ['W', 'U', 'R'] },
    'Worf, Defiant Commander': { identity: ['R', 'W', 'B'] },
    'Frodo, Adventurous Hobbit': { identity: ['W', 'B'] },
    'Sam, Loyal Attendant': { identity: ['G', 'W'] },
    'Zhulodok, Void Gorger': { identity: [] },
  };
  const sandbox = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    MTG: {
      DECKS: { 'Federation Fleet': { name: 'Federation Fleet', commander: 'Jean-Luc Picard, Luminary' } },
      DEFS, mv: cost => Number(cost) || 0,
      cardColorIdentity: def => def?.identity || [],
      cardImageURL: (name, variant) => `./art/${encodeURIComponent(name)}.${variant}`,
    },
  };
  for (const file of ['player-tools.js', 'deck-sleeves.js'])
    vm.runInNewContext(readFileSync(new URL(`../src/modules/${file}`, import.meta.url), 'utf8'), sandbox);
  return { U: sandbox.MTG };
}
// Arrays from the sandbox belong to another realm.
const plain = value => JSON.parse(JSON.stringify(value));
const seat = (game, idx, names, extra = {}) => {
  const player = { idx, game, commanders: names.map(name => ({ name })), ...extra };
  game.players.push(player);
  return player;
};

test('each deck gets its own sleeve from its public commanders and color identity', () => {
  const { U } = sleeves();
  const game = { players: [] };
  const picard = seat(game, 0, ['Jean-Luc Picard, Luminary']);
  const worf = seat(game, 1, ['Worf, Defiant Commander']);
  const hobbits = seat(game, 2, ['Frodo, Adventurous Hobbit', 'Sam, Loyal Attendant']);
  const eldrazi = seat(game, 3, ['Zhulodok, Void Gorger']);
  const specs = game.players.map(player => U.deckSleeveSpec(player));
  assert.equal(new Set(specs.map(spec => spec.key)).size, 4);
  assert.deepEqual(plain(specs[0].colors), ['W', 'U', 'R']);
  assert.deepEqual(plain(specs[1].colors), ['W', 'B', 'R'], 'colors follow WUBRG order');
  assert.deepEqual(plain(specs[2].commanders), ['Frodo, Adventurous Hobbit', 'Sam, Loyal Attendant'], 'partners share the medallion');
  assert.deepEqual(plain(specs[2].colors), ['W', 'B', 'G']);
  assert.deepEqual(plain(specs[3].colors), ['C'], 'a colorless deck has a neutral stone');
  assert.deepEqual(plain(specs[0].arts), ['./art/Jean-Luc%20Picard%2C%20Luminary.art']);
  assert.ok(specs.every(spec => spec.frame.id === 'obsidian'), 'the chosen design is every sleeve\'s frame');
  // Without a canvas the plain design stands in, never a card's own art.
  for (const player of [picard, worf, hobbits, eldrazi]) assert.equal(U.deckBackURL(player), './assets/cardbacks/obsidian.webp');
  assert.equal(U.deckBackURL(null), './assets/cardbacks/obsidian.webp');
});

test('a deck sleeve follows the design choice and separates two copies of one deck', () => {
  const { U } = sleeves();
  const game = { players: [] };
  const first = seat(game, 0, ['Jean-Luc Picard, Luminary']);
  const other = seat(game, 1, ['Worf, Defiant Commander']);
  const mirror = seat(game, 2, ['Jean-Luc Picard, Luminary']);
  assert.equal(U.deckSleeveSpec(first).frame.id, 'obsidian');
  assert.equal(U.deckSleeveSpec(other).frame.id, 'obsidian');
  assert.equal(U.deckSleeveSpec(mirror).frame.id, 'astral', 'the later copy takes the next design');
  U.selectCardBack('ember');
  assert.equal(U.deckSleeveSpec(first).frame.id, 'ember');
  assert.equal(U.deckSleeveSpec(mirror).frame.id, 'obsidian');
  assert.notEqual(U.deckSleeveSpec(first).key, U.deckSleeveSpec(mirror).key);
});

test('a sleeve is fixed by the deck, not by what is visible later', () => {
  const { U } = sleeves();
  const game = { players: [] };
  const recorded = seat(game, 0, ['Jean-Luc Picard, Luminary'], { commanderNames: ['Jean-Luc Picard, Luminary'], colorIdentity: ['W', 'U', 'R'] });
  const before = U.deckSleeveSpec(recorded).key;
  // A guest sees a face-down commander as a hidden card; the sleeve stays.
  recorded.commanders = [{ name: 'Hidden card' }];
  recorded.commanderNames = [];
  assert.equal(U.deckSleeveSpec(recorded).key, before);
  const guest = seat(game, 1, [], { deckName: 'Federation Fleet' });
  guest.commanders = [{ name: 'Hidden card' }];
  assert.deepEqual(plain(U.deckSleeveSpec(guest).commanders), ['Jean-Luc Picard, Luminary'], 'the deck record fills in');
  assert.equal(U.deckSleeveSpec({ idx: 3, commanders: [] }), null, 'no deck, no sleeve');
});
