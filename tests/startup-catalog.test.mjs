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

// Everything else the modules and the compiler leave on MTG: registries,
// tables and helpers, compared member by member. A registry that a card
// writes into when it compiles must end up the same however the card arrived.
function surroundingsDifferences(full, MTG, skip) {
  const kind = value => value === null ? 'null' : Array.isArray(value) ? 'array'
    : typeof value === 'object' ? Object.prototype.toString.call(value).slice(8, -1) : typeof value;
  const out = [], seen = new Set();
  const walk = (a, b, path, depth) => {
    if (out.length >= 20) return;
    const ka = kind(a), kb = kind(b);
    if (ka !== kb) { out.push(`${path}: ${ka} / ${kb}`); return; }
    if (ka === 'function') {
      if (a.toString() !== b.toString()) { out.push(`${path}: function body`); return; }
      const members = Object.keys(a);
      if (members.sort().join() !== Object.keys(b).sort().join()) out.push(`${path}: function properties`);
      else if (depth < 6) for (const key of members) walk(a[key], b[key], `${path}.${key}`, depth + 1);
    } else if (ka === 'array') {
      if (seen.has(a)) return;
      seen.add(a);
      if (a.length !== b.length) out.push(`${path}: length ${a.length} / ${b.length}`);
      else if (depth < 6) a.forEach((item, index) => walk(item, b[index], `${path}[${index}]`, depth + 1));
    } else if (ka === 'Object') {
      if (seen.has(a)) return;
      seen.add(a);
      const mine = Object.keys(a), theirs = new Set(Object.keys(b)), own = new Set(mine);
      const missing = mine.filter(key => !theirs.has(key)), extra = [...theirs].filter(key => !own.has(key));
      if (missing.length || extra.length) {
        out.push(`${path}: ${mine.length} / ${theirs.size} keys; only in the original order: ${missing.slice(0, 4).join(', ')}; only when completed later: ${extra.slice(0, 4).join(', ')}`);
      }
      if (depth < 6) for (const key of mine) if (theirs.has(key)) walk(a[key], b[key], `${path}.${key}`, depth + 1);
    } else if (ka === 'Map' || ka === 'Set') {
      const names = collection => new Set([...(ka === 'Map' ? collection.keys() : collection)].filter(key => typeof key === 'string'));
      const mine = names(a), theirs = names(b);
      if (a.size !== b.size) out.push(`${path}: ${ka} size ${a.size} / ${b.size}`);
      else if ([...mine].some(key => !theirs.has(key))) out.push(`${path}: ${ka} members`);
    } else if (ka === 'RegExp') {
      if (String(a) !== String(b)) out.push(`${path}: pattern`);
    } else if (['string', 'number', 'boolean', 'bigint', 'undefined', 'null'].includes(ka)) {
      if (a !== b && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${String(a).slice(0, 40)} / ${String(b).slice(0, 40)}`);
    }
    // Symbols, weak collections and other instances are made per load.
  };
  for (const key of Object.keys(full)) {
    if (skip.has(key)) continue;
    if (!(key in MTG)) out.push(`MTG.${key}: only in the original order`);
    else walk(full[key], MTG[key], `MTG.${key}`, 0);
  }
  for (const key of Object.keys(MTG)) if (!(key in full) && !skip.has(key)) out.push(`MTG.${key}: only when completed later`);
  return out;
}

// A compiled script points at operations of its batch entry: the same
// objects, not copies. For every card, which of its entry's operations the
// script and the definition hold, as a string of 1 and 0.
function sharedOperations(MTG) {
  const shared = new Map();
  const reachable = (root, found, depth) => {
    if (!root || typeof root !== 'object' && typeof root !== 'function' || found.has(root) || depth > 5) return;
    found.add(root);
    for (const value of Array.isArray(root) ? root : Object.values(root)) reachable(value, found, depth + 1);
  };
  for (const batch of MTG.ORACLE_BATCHES) {
    for (const entry of batch.cards) {
      const found = new Set();
      reachable(MTG.SCRIPTS[entry.raw.name], found, 0);
      reachable(MTG.DEFS[entry.raw.name], found, 0);
      const operations = (entry.implementation || []).flatMap(operation => [operation, ...Object.values(operation).flat().filter(value => value && typeof value === 'object')]);
      shared.set(entry.raw.name, operations.map(operation => found.has(operation) ? 1 : 0).join(''));
    }
  }
  return shared;
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
  // The page asks once and every caller gets the same answer.
  const [first, second] = await Promise.all([MTG.ensureFullCatalog(), MTG.ensureFullCatalog()]);
  assert.deepEqual([first, second], [true, true]);
  assert.equal(complete(), false, 'already complete');
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
  // The same cards in the same order: a list made from the definitions, such
  // as a choice of card names, reads the same however the catalog was loaded.
  assert.deepEqual(Object.keys(MTG.DEFS), Object.keys(full.DEFS));
  assert.deepEqual(Object.keys(MTG.DB.cards), Object.keys(full.DB.cards));
  assert.deepEqual(Object.keys(MTG.CARD_CATALOG), Object.keys(full.CARD_CATALOG));
  assert.deepEqual(Array.from(MTG.ORACLE_BATCHES, batch => batch.id), Array.from(full.ORACLE_BATCHES, batch => batch.id));
  assert.deepEqual(Object.keys(MTG.SCRIPTS).sort(), Object.keys(full.SCRIPTS).sort());
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
  // And so is everything else on MTG. A card that compiles later writes into
  // the registries of its original place among the modules; a later module
  // may have replaced one since (MTG.E.preparedSpellDefinitions), and the
  // entry must still reach the registry that the game reads today.
  assert.ok(Object.keys(full.E.preparedSpellDefinitions).some(key => !key.startsWith('oracle-v10:')) &&
    Object.keys(full.E.preparedSpellDefinitions).filter(key => key.startsWith('oracle-v10:')).length > 40,
    'the fixture has a registry that cards and a later module both fill');
  assert.deepEqual(surroundingsDifferences(full, MTG,
    new Set(['SCRIPTS', 'DEFS', 'CARD_CATALOG', 'DB', 'RAW_DATA', 'ORACLE_BATCHES', 'DECKS', 'loadFullOracleCatalog'])), []);
  // The batches hold the entries that the scripts were compiled from, also
  // for the cards that were registered with a startup subset: a script points
  // at its entry's operations, and tools find a card's rules by them.
  const expected = sharedOperations(full), actual = sharedOperations(MTG);
  assert.ok([...expected.values()].filter(row => row.includes('1')).length > 1000, 'many scripts hold operations of their entries');
  const unshared = [...expected].filter(([name, row]) => actual.get(name) !== row).map(([name, row]) => `${name}: ${row} / ${actual.get(name)}`);
  assert.deepEqual(unshared.slice(0, 10), [], `${unshared.length} cards hold other operation objects than their batch entries`);
});

test('an effect that offers every card name completes the collection first', async () => {
  // "Choose a card name" lists the loaded definitions. Offered from the
  // startup subset, the list would depend on how the page was opened, and a
  // saved game would not replay in another session.
  const namesOffered = async MTG => {
    const game = new MTG.Game({ seed: 3, paced: false });
    let offered = null;
    const player = game.addPlayer('You', { name: 'Test' }, { decide: async (g, q) => { offered = Array.from(q.options, option => option.key); return q.options[0].key; } }, false);
    const source = new MTG.CardInst(MTG.DEFS['Sol Ring'], player);
    await MTG.OracleV20Spells.chooseName({ g: game, you: player, src: source }, 'nonland');
    return offered;
  };
  const expected = await namesOffered(loadEngine());
  const { MTG } = loadStartupEngine();
  assert.equal(MTG.oracleCatalogComplete(), false);
  const offered = await namesOffered(MTG);
  assert.equal(MTG.oracleCatalogComplete(), true, 'the choice loaded the rest of the collection');
  assert.ok(offered.length > 20000);
  assert.deepEqual(offered, expected);
});

test('a saved table and a problem report with an imported deck are read from the complete collection', async () => {
  // Made by a page that had the complete collection: a real 100-card list.
  const full = loadEngine();
  const name = 'Startup Yuriko archive';
  const text = fs.readFileSync(new URL('./fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
  const imported = full.importCommanderDeck(text, { name, commanders: ["Yuriko, the Tiger's Shadow"] });
  assert.equal(imported.ok, true);
  full.hydrateImportedDeckLibrary([full.createImportedDeckRecord(imported, { id: 'deck-startup-catalog-yuriko' })], { source: 'guest' });
  const setup = { deck: name, commanders: ["Yuriko, the Tiger's Shadow"], ai: 1, aiDecks: ['Elven Council'], aiStyles: ['balanced'], seed: '31' };
  const save = JSON.stringify(full.buildAccountSave({ turnNo: 1 }, setup, [], 'match-startup-catalog-0001'));
  full.hydrateImportedDeckLibrary([], { source: 'guest' });
  delete full.DECKS[name]; delete full.DECK_META[name];
  const report = JSON.stringify({ schema: full.PROBLEM_REPORT_SCHEMA, description: 'imported deck',
    diagnostics: { reproduction: { mode: 'solo' }, checkpoint: { turn: 1 } }, replay: JSON.parse(save) });

  // Read by a page that opened with the startup subset.
  const { MTG } = loadStartupEngine();
  const outside = JSON.parse(save).setup.importedDecks[0].cards.filter(row => !MTG.DEFS[row.name]);
  assert.ok(outside.length > 0, 'the list has cards that no built-in deck uses');
  assert.throws(() => MTG.validateAccountSave(JSON.parse(save)), /not loaded yet/);
  assert.throws(() => MTG.parseProblemReport(report), /not loaded yet/);
  assert.equal(MTG.DECKS[name], undefined, 'a refused save registers nothing');
  await MTG.ensureFullCatalog();
  assert.equal(MTG.parseProblemReport(report).save.setup.deck, name);
  assert.equal(MTG.validateAccountSave(JSON.parse(save)).setup.deck, name);
  assert.ok(outside.every(row => MTG.DEFS[row.name]));

  // The page asks for the collection before it reads either: Continue from
  // the profile or the device, and a report chosen in Diagnostics.
  const entry = fs.readFileSync(new URL('../src/public-entry.js', import.meta.url), 'utf8');
  const loader = entry.slice(entry.indexOf('setGameLoader('));
  assert.ok(loader.indexOf('ensureFullCatalog()') > 0 && loader.indexOf('ensureFullCatalog()') < loader.indexOf('resumeAccountSave(save'));
  const main = fs.readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  const chosen = main.slice(main.indexOf('importFile.onchange'));
  assert.ok(chosen.indexOf('await MTG.ensureFullCatalog()') > 0 &&
    chosen.indexOf('await MTG.ensureFullCatalog()') < chosen.indexOf('MTG.parseProblemReport(contents)'));
});
