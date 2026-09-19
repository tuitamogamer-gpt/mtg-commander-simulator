import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';

const dir = new URL('../reports/decks/blame-game-2026-09-19/', import.meta.url);
const output = new URL('../output/blame-game-2026-09-19/', import.meta.url);
const officialURL = 'https://magic.wizards.com/en/news/announcements/murders-at-karlov-manor-commander-decklists';
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const canonical = name => name.replace(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&#x27;', "'").replaceAll('’', "'").replace(/^Ransom Note \(Accusations\)$/, 'Ransom Note').trim();
const entries = cards => Array.from(cards, c => [canonical(c.name), c.n]).sort(([a], [b]) => a.localeCompare(b));
async function get(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(60_000)});
  assert.ok(response.ok, `${url}: ${response.status}`);
  return response.text();
}

fs.mkdirSync(dir, {recursive: true});
fs.mkdirSync(output, {recursive: true});
if (process.argv.includes('--sources')) {
  const [html, indexText] = await Promise.all([get(officialURL), get('https://mtgjson.com/api/v5/DeckList.json')]);
  const entry = JSON.parse(indexText).data.find(d => d.name === 'Blame Game' && d.code === 'MKC');
  assert.ok(entry, 'MTGJSON Blame Game entry');
  const mtgjsonURL = `https://mtgjson.com/api/v5/decks/${entry.fileName}.json`;
  const jsonText = await get(mtgjsonURL), json = JSON.parse(jsonText);
  const counts = new Map();
  for (const c of [...json.data.commander, ...json.data.mainBoard]) counts.set(canonical(c.name), (counts.get(canonical(c.name)) || 0) + c.count);
  const cards = [...counts].map(([name, n]) => ({name, n}));
  const section = /<deck-list deck-title="Blame Game"[^>]*>\s*<main-deck>(.*?)<\/main-deck>/s.exec(html);
  assert.ok(section, 'Official Nelly decklist section');
  const official = new Map();
  for (const m of section[1].matchAll(/^[ \t]*(\d+)\s*(\D.+)$/gm)) {
    const name = canonical(m[2]); official.set(name, (official.get(name) || 0) + Number(m[1]));
  }
  if (!official.has('Nelly Borca, Impulsive Accuser')) official.set('Nelly Borca, Impulsive Accuser', 1);
  assert.deepEqual(entries(cards), entries([...official].map(([name, n]) => ({name, n}))), 'Official / MTGJSON lists');
  assert.equal(cards.reduce((n, c) => n + c.n, 0), 100);
  fs.writeFileSync(new URL('official.html', output), html);
  fs.writeFileSync(new URL('mtgjson.json', output), jsonText);
  const source = {retrievedOn: '2026-09-19', name: 'Blame Game', commander: 'Nelly Borca, Impulsive Accuser', set: 'MKC', cards,
    source: {official: officialURL, officialSha256: sha(html), mtgjson: mtgjsonURL, mtgjsonSha256: sha(jsonText), mtgjsonSnapshot: json.meta.date,
      normalization: 'The official Ransom Note (Accusations) label is the Ransom Note card identity.'}};
  fs.writeFileSync(new URL('decklist.json', dir), JSON.stringify(source, null, 2) + '\n');
  fs.writeFileSync(new URL('blame-game.txt', dir), 'Commander\n1 ' + source.commander + '\n\nDeck\n' + cards.filter(c => c.name !== source.commander).map(c => `${c.n} ${c.name}`).join('\n') + '\n');
}

const M = loadEngine(), source = JSON.parse(fs.readFileSync(new URL('decklist.json', dir)));
const deck = M.DECKS[source.name];
assert.ok(deck, 'Blame Game is selectable');
assert.equal(deck.commander, source.commander);
assert.deepEqual(entries(deck.cards), entries(source.cards), 'Built-in / verified source lists');
for (const {name} of deck.cards) {
  assert.ok(M.DEFS[name], name + ': definition');
  assert.equal(M.CARD_CATALOG[name].deckImportEligible, true, name + ': import');
  assert.ok(fs.existsSync(M.cardImageURL(name)), name + ': local card image');
}
assert.ok(M.DECK_GUIDES[deck.name] && M.AI_DECK_PROFILE_HINTS[deck.name]);
assert.ok(fs.existsSync(M.cardImageURL(deck.commander, 'art')), 'Commander art');
console.log(JSON.stringify({decks: Object.keys(M.DECKS).length, definitions: Object.keys(M.DEFS).length,
  importable: Object.values(M.CARD_CATALOG).filter(c => c.deckImportEligible).length,
  cards: deck.cards.reduce((n, c) => n + c.n, 0), distinctCards: deck.cards.length, sourceMatch: true}));
