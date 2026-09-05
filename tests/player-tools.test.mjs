import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function tools() {
  const values = new Map();
  const sandbox = {
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    MTG: { DECKS: { Alpha: {}, Beta: {}, Imported: { custom: true } }, mv: cost => Number(cost) || 0 },
  };
  vm.runInNewContext(readFileSync(new URL('../src/modules/player-tools.js', import.meta.url), 'utf8'), sandbox);
  return { U: sandbox.MTG, sandbox, values };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('corrupt or unavailable browser storage cannot prevent player tools from loading', () => {
  const { U, values, sandbox } = tools();
  values.set('mtgPlayerPreferences', '{bad json');
  assert.equal(U.playerPreferences().deckView, 'gallery');
  values.set('mtgPlayerPreferences', JSON.stringify({ handSort: 'script', speed: 'turbo', contrast: 'true', arenaBackground: 'https://untrusted.test/image', arenaDim: '75' }));
  assert.equal(U.playerPreferences().handSort, 'draw');
  assert.equal(U.playerPreferences().speed, 'normal');
  assert.equal(U.playerPreferences().contrast, false);
  assert.equal(U.playerPreferences().arenaBackground, 'table');
  assert.equal(U.playerPreferences().arenaDim, 30);
  U.savePlayerPreferences({ arenaBackground: 'moonlit-grove', arenaDim: 100 });
  assert.equal(U.playerPreferences().arenaBackground, 'moonlit-grove');
  assert.equal(U.playerPreferences().arenaDim, 75);
  U.savePlayerPreferences({ arenaDim: -10 });
  assert.equal(U.playerPreferences().arenaDim, 0);
  sandbox.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  assert.equal(U.playerPreferences().handSize, 'standard');
  assert.equal(U.savePlayerPreferences({ handSize: 'large' }), false);
});

test('saved pods preserve seats and rules without storing a seed, game state, or another account library', () => {
  const { U, sandbox } = tools();
  const state = { deck: 'Alpha', commanders: ['Commander'], ai: 2, aiDecks: ['Beta', '', ''], aiStyles: ['balanced'], difficulty: 'hard', diplomacyEnabled: true, seed: '0', hand: ['Secret'], resumeSave: { private: true } };
  assert.equal(U.savePod('Weekly table', state), true);
  const saved = plain(U.savedPods()[0].setup);
  assert.equal(saved.ai, 2);
  assert.equal(saved.difficulty, 'hard');
  assert.equal(saved.diplomacyEnabled, true);
  assert.equal(saved.aiDecks[0], 'Beta');
  assert.equal('seed' in saved, false);
  assert.equal('hand' in saved, false);
  assert.equal('resumeSave' in saved, false);
  sandbox.MTGAccount = { user: { id: 'other-account' } };
  assert.equal(U.savedPods().length, 0);
  sandbox.MTGAccount = null;
  assert.equal(U.savedPods().length, 1);
  assert.equal(U.removePod('Weekly table'), true);
  assert.equal(U.savedPods().length, 0);
  const corrupt = U.podSnapshot({ ai: 2.8, aiDecks: 'Beta', aiStyles: [{ code: 'ignored' }], diplomacyEnabled: 'false' });
  assert.equal(corrupt.ai, 2);
  assert.deepEqual(plain(corrupt.aiDecks), ['', '', '']);
  assert.equal(corrupt.aiStyles[0], 'random');
  assert.equal(corrupt.diplomacyEnabled, false);
  for (let i = 0; i < 6; i++) assert.equal(U.savePod(`Pod ${i}`, state), true);
  assert.equal(U.savePod('Seventh pod', state), false);
  assert.equal(U.savedPods().length, 6);
  assert.equal(U.savedPods().some(pod => pod.name === 'Pod 0'), true, 'saving never silently removes an older pod');
  assert.equal(U.savePod('Pod 0', state), true, 'an existing pod can be updated at the limit');
});

test('recent decks are unique and never expose an imported list on the shared landing page', () => {
  const { U } = tools();
  U.rememberDeck('Alpha'); U.rememberDeck('Beta'); U.rememberDeck('Alpha'); U.rememberDeck('Imported');
  assert.deepEqual(plain(U.recentDecks()), ['Alpha', 'Beta']);
});

test('sorting a hand never changes engine order or card identities', () => {
  const { U } = tools();
  const cards = [
    { name: 'Z spell', mv: 4, def: { types: ['Instant'] } },
    { name: 'Basic land', mv: 0, def: { types: ['Land'] } },
    { name: 'A creature', mv: 2, def: { types: ['Creature'] } },
  ];
  const original = cards.slice();
  assert.deepEqual(U.sortHandForDisplay(cards, 'mana').map(card => card.name), ['Basic land', 'A creature', 'Z spell']);
  assert.deepEqual(U.sortHandForDisplay(cards, 'name').map(card => card.name), ['A creature', 'Basic land', 'Z spell']);
  assert.deepEqual(cards, original);
  assert.equal(U.sortHandForDisplay(cards, 'type')[2], cards[0]);
});

test('card search reads only visible zones and excludes opponents face-down and foretold identities', () => {
  const { U } = tools();
  const viewer = { name: 'You', hand: [], command: [], graveyard: [], exile: [] };
  const opponent = { name: 'Opponent', command: [], graveyard: [], exile: [] };
  Object.defineProperty(opponent, 'hand', { get() { throw new Error('private hand read'); } });
  Object.defineProperty(opponent, 'library', { get() { throw new Error('private library read'); } });
  const card = (name, owner, zone, extra = {}) => ({ name, owner, ctrl: owner, zone, def: { types: ['Creature'] }, ...extra });
  viewer.hand.push(card('Own spell', viewer, 'hand'));
  opponent.graveyard.push(card('Public graveyard', opponent, 'graveyard'));
  opponent.exile.push(card('Secret foretold card', opponent, 'exile', { meta: { foretold: true } }));
  const faceDown = card('Secret creature', opponent, 'battlefield', { faceDown: true });
  const battlefield = card('Visible creature', opponent, 'battlefield');
  const game = { players: [viewer, opponent], bf: () => [faceDown, battlefield], stack: [{ card: battlefield }] };
  const result = U.searchableCards(game, viewer);
  assert.deepEqual(plain(result.map(item => item.card.name)), ['Own spell', 'Visible creature', 'Public graveyard']);
  assert.ok(!result.some(item => item.text.includes('secret')));
});

test('mana curve weights quantities, excludes lands and groups seven-plus mana cards', () => {
  const { U } = tools();
  U.DEFS = { Land: { types: ['Land'] }, Two: { types: ['Creature'], cost: '2' }, Eight: { types: ['Sorcery'], cost: '8' } };
  const result = U.deckManaCurve({ cards: [{ name: 'Land', n: 4 }, { name: 'Two', n: 2 }, { name: 'Eight', n: 1 }] });
  assert.equal(result.lands, 4);
  assert.equal(result.spells, 3);
  assert.equal(result.average, 4);
  assert.deepEqual(plain(result.bins), [0, 0, 2, 0, 0, 0, 0, 1]);
});
