import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const source = JSON.parse(fs.readFileSync(new URL('../reports/decks/blame-game-2026-09-19/decklist.json', import.meta.url)));
const entries = cards => Array.from(cards, c => [c.name, c.n]).sort(([a], [b]) => a.localeCompare(b));

test('Blame Game exposes the complete original 100-card list with local art and native rules', () => {
  const deck = M.DECKS['Blame Game'];
  assert.ok(deck);
  assert.equal(deck.commander, source.commander);
  assert.deepEqual(entries(deck.cards), entries(source.cards));
  assert.equal(deck.cards.reduce((n, c) => n + c.n, 0), 100);
  assert.equal(Object.keys(M.DECKS).length, 170);
  assert.equal(M.CATALOG_SUMMARY.decks, 170);
  assert.equal(M.EXCLUDED_DECKS.size, 0);
  for (const {name} of deck.cards) {
    assert.ok(M.DEFS[name] && !M.DEFS[name].autoScripted && !M.DEFS[name].simplified, name);
    assert.equal(M.CARD_CATALOG[name].deckImportEligible, true, name);
    assert.ok(fs.existsSync(M.cardImageURL(name)), name + ': local art');
  }
  assert.ok(fs.existsSync(M.cardImageURL(deck.commander, 'art')));
});

test('Blame Game has a dedicated guide, legal key cards and a complete AI strategy', () => {
  const deck = M.DECKS['Blame Game'], guide = M.DECK_GUIDES[deck.name], profile = M.DECK_AI_PROFILES[deck.name];
  assert.equal(M.DECK_GUIDE_ROUTES[guide.route].length, 3);
  assert.equal(guide.keys.length, 3);
  for (const name of guide.keys) assert.ok(deck.cards.some(c => c.name === name), name);
  assert.match(guide.tip, /only one opponent/);
  assert.ok(profile.protectedPieces.includes(deck.commander));
  assert.equal(M.AI_DECK_PROFILE_HINTS[deck.name].commanderImportance, 1.5);
  assert.ok(profile.importantEngines.length && profile.finishers.length);
});

for (const commander of ['Nelly Borca, Impulsive Accuser', 'Feather, Radiant Arbiter']) {
  test(`the original built-in supports ${commander} without changing its 100 cards`, () => {
    const deck = M.DECKS['Blame Game'];
    const game = new M.Game({seed: 919, paced: false});
    const player = game.addPlayer('Blame Game', deck, null, false);
    game.buildDeck(player, deck, M.DEFS, [commander]);
    assert.equal(player.command.length, 1);
    assert.equal(player.command[0].name, commander);
    assert.equal(player.library.length, 99);
    const counts = new Map();
    for (const card of [...player.command, ...player.library]) counts.set(card.name, (counts.get(card.name) || 0) + 1);
    assert.deepEqual([...counts].sort(([a], [b]) => a.localeCompare(b)), entries(source.cards));
  });
}
