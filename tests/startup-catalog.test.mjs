// The page opens the table with the cards of built-in decks only
// (src/app-startup.js) and loads the rest of the card collection when an
// imported deck needs it. Tools and every other test load src/app.js, the
// complete collection in its original order. These tests hold the two
// together: the generated files are current, a table that starts with the
// subset has every built-in deck, and a collection completed later is the
// same collection, card for card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildStartupCatalog, staleStartupCatalog } from '../scripts/build-startup-catalog.mjs';
import { loadEngine, loadStartupEngine } from './helpers/load-engine.mjs';

// How one definition differs from another: object keys, values, function
// bodies and function properties. Symbols are made per load and are skipped.
function differences(a, b, path, out, seen = new Set()) {
  if (out.length >= 20) return out;
  const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array'
    : typeof value === 'object' ? Object.prototype.toString.call(value).slice(8, -1) : typeof value;
  const ka = kind(a), kb = kind(b);
  if (ka !== kb) { out.push(`${path}: ${ka} / ${kb}`); return out; }
  if (ka === 'symbol') return out;
  if (ka === 'function') {
    if (a.toString() !== b.toString()) out.push(`${path}: function body`);
    if (Object.keys(a).sort().join() !== Object.keys(b).sort().join()) out.push(`${path}: function properties`);
    return out;
  }
  if (ka === 'array' || ka === 'Object') {
    if (seen.has(a)) return out;
    seen.add(a);
    if (ka === 'array') {
      if (a.length !== b.length) out.push(`${path}: length ${a.length} / ${b.length}`);
      else a.forEach((item, index) => differences(item, b[index], `${path}[${index}]`, out, seen));
      return out;
    }
    for (const key of Object.keys(b)) if (!(key in a)) out.push(`${path}.${key}: only when completed later`);
    for (const key of Object.keys(a)) {
      if (!(key in b)) out.push(`${path}.${key}: only in the original order`);
      else differences(a[key], b[key], `${path}.${key}`, out, seen);
    }
    return out;
  }
  if (ka === 'Set' || ka === 'Map') { if (a.size !== b.size) out.push(`${path}: size`); return out; }
  if (ka === 'RegExp') { if (String(a) !== String(b)) out.push(`${path}: pattern`); return out; }
  if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${String(a).slice(0, 40)} / ${String(b).slice(0, 40)}`);
  return out;
}

test('the generated startup files are current', () => {
  assert.deepEqual(staleStartupCatalog(), [], 'run: npm run build:startup');
  const { output, summary } = buildStartupCatalog();
  assert.ok(summary.startupCards >= summary.fromDecks && summary.fromDecks > 0);
  assert.ok(summary.deferredCards > summary.startupCards * 5, 'most of the collection loads on demand');
  // The page's entry imports the startup list, never the complete one.
  const entry = fs.readFileSync(new URL('../src/public-entry.js', import.meta.url), 'utf8');
  assert.match(entry, /import\('\.\/app-startup\.js'\)/);
  assert.doesNotMatch(entry, /import\('\.\/app\.js'\)/);
  // The startup list keeps every module of src/app.js, in order, and no batch.
  const modules = source => [...source.matchAll(/^import '(.+?)';$/gm)].map(match => match[1]);
  const app = modules(fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'));
  const startup = modules(output.get('src/app-startup.js'));
  assert.deepEqual(startup.filter(item => !item.startsWith('./oracle-startup/')), app.filter(item => !item.startsWith('./oracle-batches/')));
  assert.equal(startup.some(item => item.startsWith('./oracle-batches/')), false);
  assert.deepEqual(modules(output.get('src/oracle-catalog-full.js')), app.filter(item => item.startsWith('./oracle-batches/')));
});

test('the startup table has every built-in deck, and the same cards as the complete one', () => {
  const full = loadEngine();
  const { MTG } = loadStartupEngine();
  assert.equal(MTG.oracleCatalogComplete(), false);
  assert.deepEqual(Object.keys(MTG.DECKS), Object.keys(full.DECKS));
  const missing = [];
  for (const deck of Object.values(MTG.DECKS)) {
    for (const name of [deck.commander, deck.partner, ...deck.cards.map(row => row.name)]) {
      if (name && !MTG.DEFS[name]) missing.push(`${deck.name}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], 'every card of every built-in deck is loaded at startup');
  assert.ok(Object.keys(MTG.DEFS).length < Object.keys(full.DEFS).length / 3, 'the startup table holds a fraction of the collection');
  // What is loaded is what the complete collection has for the same card.
  const differing = [];
  for (const name of Object.keys(MTG.DEFS)) {
    const found = differences(full.SCRIPTS[name], MTG.SCRIPTS[name], 'script', []);
    differences(full.DEFS[name], MTG.DEFS[name], 'definition', found);
    if (found.length) differing.push(`${name}: ${found.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(differing.slice(0, 10), []);
  // A game with built-in decks is built without the rest.
  const game = MTG.newGame({ humanDeck: 'Quick Draw', aiDecks: ['Elven Council', 'Eternal Might', 'Squirreled Away'],
    aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', seed: 11081, maxTurns: 1, paced: false });
  assert.equal(game.players.length, 4);
  assert.ok(game.players.every(player => player.library.length + player.hand.length + player.command.length === 100));
});

test('an imported list is never checked against the startup subset', async () => {
  const { MTG, complete } = loadStartupEngine();
  // A real card that no built-in deck uses.
  const full = loadEngine();
  const outside = Object.keys(full.DEFS).find(name => !MTG.DEFS[name] && full.CARD_CATALOG[name].deckImportEligible);
  assert.ok(outside, 'the collection has cards outside the startup subset');
  assert.equal(MTG.CARD_CATALOG[outside], undefined);
  assert.throws(() => MTG.validateImportedDeck({ cards: [{ name: outside, n: 1 }], commanders: [], ignored: [] }, {}),
    /not loaded yet/);
  assert.throws(() => MTG.importCommanderDeck(`1 ${outside}`, { register: false }), /not loaded yet/);
  // The page asks once; in this harness the batches are registered directly.
  MTG.loadFullOracleCatalog = async () => { throw new Error('this harness completes the catalog itself'); };
  assert.equal(complete(), true);
  assert.equal(MTG.oracleCatalogComplete(), true);
  assert.equal(await MTG.ensureFullCatalog(), false, 'nothing left to load');
  assert.ok(MTG.DEFS[outside] && MTG.CARD_CATALOG[outside].deckImportEligible);
  const checked = MTG.validateImportedDeck({ cards: [{ name: outside, n: 1 }], commanders: [], ignored: [] }, {});
  assert.equal(checked.errors.some(issue => /not loaded yet/.test(issue.message)), false);
  assert.equal(checked.errors.some(issue => issue.code === 'unsupported-card' || /not supported|unknown card/i.test(issue.message) && issue.message.includes(outside)), false,
    `the card is known once the collection is complete: ${JSON.stringify(checked.errors.slice(0, 3))}`);
});

test('a collection completed later is the same collection, card for card', () => {
  const full = loadEngine();
  const { MTG, complete } = loadStartupEngine();
  // Definitions that exist before completion keep their identity: cards in
  // play point at them.
  const before = new Map(Object.entries(MTG.DEFS));
  complete();
  for (const [name, definition] of before) assert.equal(MTG.DEFS[name], definition, `${name} keeps its definition object`);
  assert.deepEqual(Object.keys(MTG.DEFS).sort(), Object.keys(full.DEFS).sort());
  assert.deepEqual(Object.keys(MTG.SCRIPTS).sort(), Object.keys(full.SCRIPTS).sort());
  assert.deepEqual(Object.keys(MTG.CARD_CATALOG).sort(), Object.keys(full.CARD_CATALOG).sort());
  // A batch that arrives later compiles as it did in its original place among
  // the modules, and gets the revisions of the modules that came after it.
  const differing = [];
  for (const name of Object.keys(full.DEFS)) {
    const found = differences(full.SCRIPTS[name], MTG.SCRIPTS[name], 'script', []);
    differences(full.DEFS[name], MTG.DEFS[name], 'definition', found);
    differences(full.CARD_CATALOG[name], MTG.CARD_CATALOG[name], 'catalog', found);
    if (found.length) differing.push(`${name}: ${found.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(differing.slice(0, 10), [], `${differing.length} cards differ`);
});
