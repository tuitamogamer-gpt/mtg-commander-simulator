import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const catalog = Object.entries(MTG.DECKS).filter(([, deck]) => !deck.custom).map(([name, deck]) =>
  MTG.deckExplorerRecord(name, deck, MTG.DECK_META[name], MTG.defaultCommanders(deck, MTG.DEFS)));
const names = result => Array.from(result.matches, entry => entry.name);

test('every precon is reachable exactly once across pages, including the last partial page', () => {
  const first = MTG.browseDecks(catalog);
  const reached = [];
  for (let page = 1; page <= first.pages; page++) {
    const result = MTG.browseDecks(catalog, { deckPage: page });
    assert.ok(result.entries.length > 0 && result.entries.length <= 24);
    reached.push(...result.entries.map(entry => entry.name));
  }
  assert.equal(reached.length, catalog.length);
  assert.equal(new Set(reached).size, catalog.length);
  assert.deepEqual(reached, catalog.map(entry => entry.name).sort((a, b) => a.localeCompare(b)));
});

test('search finds either partner, accent-free names, set names and multiword themes', () => {
  assert.ok(names(MTG.browseDecks(catalog, { search: 'Sam Loyal' })).includes('Food and Fellowship'));
  assert.ok(names(MTG.browseDecks(catalog, { search: 'Michelangelo' })).includes('Turtle Power'));
  assert.ok(names(MTG.browseDecks(catalog, { search: 'eowyn' })).includes('Riders of Rohan'));
  assert.ok(names(MTG.browseDecks(catalog, { search: 'hEnZie "Toolbox"' })).includes('Riveteers Rampage'));
  assert.ok(names(MTG.browseDecks(catalog, { search: 'Warhammer 40,000' })).includes('Necron Dynasties'));
  assert.ok(names(MTG.browseDecks(catalog, { search: 'graveyard land' })).includes("Nature's Vengeance"));
});

test('colorless means an empty color identity, while colored filters include multicolor decks', () => {
  const result = MTG.browseDecks(catalog, { color: 'C' });
  assert.ok(names(result).includes('Eldrazi Unbound'));
  assert.ok(!names(result).includes('Eldrazi Incursion'));
  assert.ok(result.matches.every(entry => entry.colors.length === 0));
  assert.ok(names(MTG.browseDecks(catalog, { color: 'U' })).includes('Eldrazi Incursion'));
});

test('older release years and combined filters narrow the entire catalog before pagination', () => {
  assert.equal(MTG.browseDecks(catalog, { year: '2014' }).total, 5);
  const result = MTG.browseDecks(catalog, { year: '2014', color: 'U', search: 'teferi' });
  assert.deepEqual(names(result), ['Peer Through Time']);
  assert.equal(result.pages, 1);
});

test('favorites and recently played work across pages without changing a selected seat', () => {
  const filters = { deck: 'Turtle Power', deckPage: 7, favoritesOnly: true, favorites: new Set(['World Shaper', 'Arcane Maelstrom']) };
  const result = MTG.browseDecks(catalog, filters);
  assert.deepEqual(names(result), ['Arcane Maelstrom', 'World Shaper']);
  assert.equal(result.page, 1);
  assert.equal(filters.deck, 'Turtle Power');
  assert.equal(filters.deckPage, 7, 'browsing must not mutate caller state');
  const recent = MTG.browseDecks(catalog, { deckSort: 'recent' }, ['World Shaper', 'Turtle Power']);
  assert.deepEqual(Array.from(recent.entries.slice(0, 2), entry => entry.name), ['World Shaper', 'Turtle Power']);
});

test('shrinking and empty results clamp the page, and larger catalogs remain fully reachable', () => {
  const expanded = Array.from({ length: 527 }, (_, index) => ({ ...catalog[0], name: `Deck ${String(index).padStart(3, '0')}` }));
  const last = MTG.browseDecks(expanded, { deckPage: 999 });
  assert.equal(last.pages, 22);
  assert.equal(last.page, 22);
  assert.equal(last.start, 505);
  assert.equal(last.end, 527);
  assert.equal(last.entries.length, 23);
  const empty = MTG.browseDecks(catalog, { deckPage: 999, search: 'this-deck-does-not-exist' });
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.start, 0);
  assert.equal(empty.end, 0);
  assert.equal(empty.entries.length, 0);
  const newest = MTG.browseDecks(catalog, { deckSort: 'newest' });
  assert.equal(Number(newest.entries[0].year), Math.max(...catalog.map(entry => Number(entry.year))));
});
