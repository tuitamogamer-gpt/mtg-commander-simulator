import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');

function harness() {
  const button = () => ({ attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
  const cloud = button(), next = button();
  const state = { favorites: new Set(), deck: 'Elven Council', search: 'elven', deckPage: 2,
    aiDecks: ['Quick Draw'], difficulty: 'hard', favoritesOnly: true };
  let stored = '[]', writes = 0, accountChange;
  const filters = [];
  const context = vm.createContext({ state, head: { isConnected: true }, root: { dataset: { appView: 'setup' } },
    window: { addEventListener(_name, callback) { accountChange = callback; } },
    localStorage: { getItem: () => stored, setItem: (_key, value) => { stored = value; } },
    deckCatalog: [{ name: 'Quick Draw', element: { querySelector: () => cloud } },
      { name: 'Elven Council', element: { querySelector: () => next } }],
    filterDecks: options => filters.push(options), refreshSetupFavorites: null,
    MTGAccount: { syncLocalFavorites() { writes++; } }, entryInitialized: false, MTG: {},
    favorite: next, name: 'Elven Council' });
  const hookStart = source.indexOf('    const refreshFavorites = () =>');
  const hookEnd = source.indexOf("    deckBrowseBar.querySelector('.decksort')", hookStart);
  assert.ok(hookStart >= 0 && hookEnd > hookStart);
  vm.runInContext(source.slice(hookStart, hookEnd), context);
  const eventStart = source.lastIndexOf("  window.addEventListener('mtg:account-change',");
  vm.runInContext(source.slice(eventStart, source.indexOf("  if (document.readyState === 'loading')", eventStart)), context);
  const clickStart = source.indexOf('      favorite.onclick = () =>');
  vm.runInContext(source.slice(clickStart, source.indexOf('      card.onclick =', clickStart)), context);
  return { context, state, cloud, next, filters, accountChange,
    stored: value => { if (value !== undefined) stored = value; return stored; }, writes: () => writes };
}

test('account hydration refreshes current Setup stars and filters without resetting choices', () => {
  const f = harness();
  f.stored('["Quick Draw"]');
  f.accountChange();
  assert.equal(f.cloud.attributes['aria-pressed'], 'true');
  assert.equal(f.cloud.textContent, '★');
  assert.equal(f.cloud.attributes['aria-label'], 'Remove Quick Draw from favorites');
  assert.equal(f.next.attributes['aria-pressed'], 'false');
  assert.deepEqual([...f.state.favorites], ['Quick Draw']);
  assert.equal(f.filters.at(-1).resetPage, false);
  assert.deepEqual({ deck: f.state.deck, search: f.state.search, page: f.state.deckPage,
    ai: f.state.aiDecks, difficulty: f.state.difficulty, favoritesOnly: f.state.favoritesOnly },
  { deck: 'Elven Council', search: 'elven', page: 2, ai: ['Quick Draw'], difficulty: 'hard', favoritesOnly: true });
  assert.equal(f.writes(), 0, 'session hydration does not write favorites');
});

test('the real star callback reads the latest collection before writing an explicit edit', () => {
  const f = harness();
  f.stored('["Quick Draw"]');
  f.next.onclick();
  assert.deepEqual(JSON.parse(f.stored()), ['Quick Draw', 'Elven Council']);
  assert.equal(f.cloud.attributes['aria-pressed'], 'true');
  assert.equal(f.next.attributes['aria-pressed'], 'true');
  assert.equal(f.writes(), 1);
});

test('favorites refresh ignores detached Setup, the main menu, and an active table', () => {
  for (const deactivate of [f => { f.context.head.isConnected = false; },
    f => { f.context.root.dataset.appView = 'home'; }, f => { f.context.window._game = {}; }]) {
    const f = harness();
    f.stored('["Quick Draw"]');
    deactivate(f);
    f.accountChange();
    assert.equal(f.filters.length, 0);
    assert.equal(f.state.favorites.size, 0);
    assert.equal(f.writes(), 0);
  }
});

test('unavailable or invalid favorites storage does not discard the current Setup collection', () => {
  for (const malformed of ['{', '{}']) {
    const f = harness();
    f.state.favorites.add('Elven Council');
    f.stored(malformed);
    f.accountChange();
    assert.deepEqual([...f.state.favorites], ['Elven Council']);
    assert.equal(f.filters.length, 0);
  }
});
