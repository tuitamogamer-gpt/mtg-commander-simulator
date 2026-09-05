import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchOracleCardsFromGzip, semanticClass } from './import-oracle-batch.mjs';
import { loadEngine } from '../tests/helpers/load-engine.mjs';

// A read-only runtime inventory and a reproducible comparison with the pinned
// Oracle feed. This script never imports cards or grants support certification.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sorted = values => [...values].sort(compare);
const options = new Map();
let check = false;
let fresh = false;
for (const argument of process.argv.slice(2)) {
  if (argument === '--check') { assert.equal(check, false, 'duplicate --check'); check = true; continue; }
  if (argument === '--fresh') { assert.equal(fresh, false, 'duplicate --fresh'); fresh = true; continue; }
  const match = /^--(source-file|source-sha256)=(.+)$/.exec(argument);
  assert.ok(match, `Unknown argument: ${argument}`);
  assert.equal(options.has(match[1]), false, `Duplicate --${match[1]}`);
  options.set(match[1], match[2]);
}
assert.ok(options.get('source-file'), 'Usage: node scripts/export-card-catalog.mjs --source-file=/path/oracle.jsonl.gz --source-sha256=<sha256> [--check] [--fresh]');

const state = JSON.parse(read('reports/oracle-import/state.json'));
const source = state.source;
const expectedHash = options.get('source-sha256');
assert.equal(expectedHash, source.bulkSha256, 'Source SHA-256 must match the current import state');
const { cards } = await fetchOracleCardsFromGzip(options.get('source-file'), {
  type: source.bulkType, id: source.bulkId, updated_at: source.bulkUpdatedAt,
}, expectedHash);
const inUniverse = card => card.games?.includes('paper') && card.legalities?.commander === 'legal';
const universe = cards.filter(inUniverse);
const byId = new Map(cards.map(card => [card.oracle_id, card]));
assert.equal(byId.size, cards.length, 'Pinned source must have unique Oracle IDs');
assert.equal(new Set(universe.map(card => card.name)).size, universe.length, 'Comparison universe must have unique canonical names');

function index(values, key) {
  const result = new Map();
  for (const value of values) for (const name of key(value)) {
    const entries = result.get(name) || [];
    if (!entries.includes(value)) entries.push(value);
    result.set(name, entries);
  }
  return result;
}
const universeNames = index(universe, card => [card.name]);
const universeFaces = index(universe, card => (card.card_faces || []).map(face => face.name));
const allNames = index(cards, card => [card.name]);
function sourceMatch(entry) {
  if (entry.oracleId) {
    const card = byId.get(entry.oracleId);
    assert.ok(card, `Imported Oracle ID absent from pinned source: ${entry.name}`);
    return { card, match: 'oracle-id' };
  }
  for (const [entries, match] of [
    [universeNames.get(entry.name), 'canonical-name'],
    [universeFaces.get(entry.name), 'face-name'],
    [allNames.get(entry.name), 'canonical-name-outside-universe'],
  ]) {
    if (!entries?.length) continue;
    assert.equal(entries.length, 1, `Ambiguous ${match} in pinned source: ${entry.name}`);
    return { card: entries[0], match };
  }
  return { card: null, match: 'not-found-in-pinned-source' };
}

const MTG = loadEngine();
const names = sorted(Object.keys(MTG.CARD_CATALOG));
assert.deepEqual(names, sorted(Object.keys(MTG.DEFS)), 'Catalog/engine definition parity');
assert.deepEqual(names, sorted(Object.keys(MTG.RAW_DATA.cards)), 'Catalog/raw definition parity');
const runtimeGeneric = MTG.ORACLE_BATCHES.filter(batch => /^oracle-\d{4}$/.test(batch.id));
assert.deepEqual(sorted(runtimeGeneric.flatMap(batch => batch.cards.map(row => row.raw.name))), sorted(state.importedNames), 'Runtime/import state name parity');
assert.deepEqual(sorted(runtimeGeneric.flatMap(batch => batch.cards.map(row => row.oracleId))), sorted(state.importedOracleIds), 'Runtime/import state Oracle ID parity');
const represented = new Map();
const imported = names.map(name => {
  const entry = MTG.CARD_CATALOG[name];
  const { card, match } = sourceMatch(entry);
  if (card) {
    const entries = represented.get(card.oracle_id) || [];
    entries.push(name);
    represented.set(card.oracle_id, entries);
  }
  return {
    name,
    engine_source: entry.engineBatch || 'legacy',
    deck_import_eligible: entry.deckImportEligible,
    engine_status: entry.engineStatus,
    semantic_class: entry.semanticClass,
    mana_cost: entry.manaCost,
    type_line: entry.typeLine,
    color_identity: entry.colorIdentity.join(''),
    oracle_id: card?.oracle_id || '',
    source_name: card?.name || '',
    source_match: match,
    in_comparison_universe: !!card && !!inUniverse(card),
    source_commander_legality: card?.legalities?.commander || '',
    source_games: (card?.games || []).join(','),
  };
});

// Cache only whole-card classification results for this exact compressed feed
// and compiler. Runtime inventory and source hashing still run on every call.
// Include all script sources/JSON so grammar tables and transitive modules are
// covered; exclude this presentation/export script from classifier identity.
const classifierFiles = sorted(sourceFiles('scripts').filter(file => file !== 'scripts/export-card-catalog.mjs'));
const classifierFilesSha256 = hash(classifierFiles.map(file => `${file}\t${hash(read(file))}`).join('\n'));
const cacheIdentity = { schemaVersion: 1, sourceSha256: expectedHash, classifierVersion: state.compilerVersion, classifierFilesSha256 };
const cachePath = path.join(root, 'output/card-catalog', `classifications-${hash(JSON.stringify(cacheIdentity))}.json`);
const classifications = new Map();
if (!fresh && fs.existsSync(cachePath)) {
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  assert.deepEqual(cache.identity, cacheIdentity, 'Classification cache identity mismatch');
  assert.equal(cache.rowsSha256, hash(JSON.stringify(cache.rows)), 'Classification cache content mismatch');
  for (const row of cache.rows) {
    assert.ok(byId.has(row.oracleId), `Cache Oracle ID is not in the pinned source: ${row.oracleId}`);
    assert.equal(classifications.has(row.oracleId), false, `Duplicate cache Oracle ID: ${row.oracleId}`);
    assert.ok((typeof row.semanticClass === 'string' && row.semanticClass && row.reason === null) ||
      (row.semanticClass === null && typeof row.reason === 'string' && row.reason), 'Invalid cached classification');
    classifications.set(row.oracleId, row);
  }
}
const remaining = [];
const reasons = new Map();
const absent = universe.filter(card => !represented.has(card.oracle_id)).sort((left, right) => compare(left.name, right.name) || compare(left.oracle_id, right.oracle_id));
let cacheHits = 0;
for (const card of absent) {
  const cached = classifications.get(card.oracle_id);
  const compiled = cached || semanticClass(card, { compilerVersion: state.compilerVersion });
  if (cached) cacheHits += 1;
  else classifications.set(card.oracle_id, { oracleId: card.oracle_id, semanticClass: compiled.semanticClass || null, reason: compiled.semanticClass ? null : compiled.reason });
  const status = compiled.semanticClass ? 'parser-eligible-unimported' : 'deferred';
  const reason = compiled.semanticClass ? 'requires-import-and-executable-proof' : compiled.reason;
  assert.ok(reason, `${card.name}: remaining card needs an explicit reason`);
  reasons.set(reason, (reasons.get(reason) || 0) + 1);
  remaining.push({
    name: card.name, oracle_id: card.oracle_id, mana_cost: card.mana_cost || '',
    type_line: card.type_line, color_identity: (card.color_identity || []).join(''),
    layout: card.layout, status, reason, semantic_class: compiled.semanticClass || '',
  });
  if (remaining.length % 1000 === 0 || remaining.length === absent.length) {
    console.error(`Catalog classifications: ${remaining.length}/${absent.length} (${cacheHits} cached)`);
  }
}
if (!check) {
  const rows = [...classifications.values()].sort((left, right) => compare(left.oracleId, right.oracleId));
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify({ identity: cacheIdentity, rowsSha256: hash(JSON.stringify(rows)), rows }) + '\n');
}

function csv(rows) {
  assert.ok(rows.length, 'CSV inventory must not be empty');
  const keys = Object.keys(rows[0]);
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [keys.map(quote).join(','), ...rows.map(row => keys.map(key => quote(row[key])).join(','))].join('\n') + '\n';
}
function sourceFiles(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relative = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sourceFiles(relative) : /\.(?:js|mjs|json)$/.test(relative) ? [relative] : [];
  });
}
const inputFiles = sorted([
  ...sourceFiles('src'), ...sourceFiles('scripts'), ...sourceFiles('reports/oracle-import'),
  'tests/helpers/load-engine.mjs',
]);
const inputHashes = Object.fromEntries(inputFiles.map(file => [file, hash(read(file))]));
const artifacts = new Map([
  ['docs/catalog/imported-cards.csv', csv(imported)],
  ['docs/catalog/remaining-cards.csv', csv(remaining)],
]);
const representedEligible = universe.filter(card => represented.has(card.oracle_id)).length;
const eligibleEntries = imported.filter(entry => entry.deck_import_eligible).length;
const ready = remaining.filter(entry => entry.status === 'parser-eligible-unimported');
const unmatched = imported.filter(entry => entry.source_match === 'not-found-in-pinned-source');
const outside = imported.filter(entry => entry.source_name && !entry.in_comparison_universe);
const aliases = [...represented].filter(([, entries]) => entries.length > 1).map(([id, entries]) => ({
  oracleId: id, sourceName: byId.get(id).name, runtimeNames: sorted(entries),
})).sort((left, right) => compare(left.sourceName, right.sourceName));
assert.equal(representedEligible + remaining.length, universe.length, 'Every source-universe Oracle ID must be represented or remaining');
const summary = {
  schemaVersion: 1,
  inventoryAsOfImportState: state.updatedAt,
  source: { ...source, compressedBytes: fs.statSync(options.get('source-file')).size },
  comparisonUniverse: { filter: "games includes 'paper' AND legalities.commander equals 'legal'", unit: 'distinct Oracle ID', sourceRows: cards.length, paperRows: cards.filter(card => card.games?.includes('paper')).length, oracleIds: universe.length },
  counts: {
    runtimeDefinitions: imported.length,
    genericOracleCards: state.importedNames.length,
    genericBatches: runtimeGeneric.length,
    manualOracleCards: MTG.ORACLE_BATCHES.filter(batch => !/^oracle-\d{4}$/.test(batch.id)).reduce((sum, batch) => sum + batch.cards.length, 0),
    legacyDefinitions: imported.filter(entry => entry.engine_source === 'legacy').length,
    deckImportEligibleDefinitions: eligibleEntries,
    deckImportRestrictedDefinitions: imported.length - eligibleEntries,
    representedUniverseOracleIds: representedEligible,
    remainingUniverseOracleIds: remaining.length,
    parserEligibleUnimported: ready.length,
    deferred: remaining.length - ready.length,
    runtimeEntriesWithoutSnapshotMatch: unmatched.length,
    runtimeEntriesOutsideComparisonUniverse: outside.length,
  },
  remainingByReason: Object.fromEntries([...reasons].sort(([left], [right]) => compare(left, right))),
  parserEligibleUnimportedNames: ready.map(entry => entry.name),
  runtimeNamesWithoutSnapshotMatch: unmatched.map(entry => entry.name),
  runtimeNamesOutsideComparisonUniverse: outside.map(entry => ({ name: entry.name, sourceName: entry.source_name, sourceCommanderLegality: entry.source_commander_legality, sourceGames: entry.source_games.split(',') })),
  multipleRuntimeNamesForOneOracleId: aliases,
  runtimeNamesRestrictedFromDeckImport: imported.filter(entry => !entry.deck_import_eligible).map(entry => entry.name),
  classifierVersion: state.compilerVersion,
  classifierFilesSha256,
  inputFilesSha256: hash(Object.entries(inputHashes).map(([file, digest]) => `${file}\t${digest}`).join('\n')),
  artifactSha256: Object.fromEntries([...artifacts].map(([file, content]) => [file, hash(content)])),
  notes: [
    'Names and face names associate legacy definitions with the pinned feed; these associations do not verify exact Oracle semantics or every face.',
    'Represented Oracle IDs include runtime face aliases and import-restricted legacy cards. Consult deck_import_eligible for actual arbitrary-deck availability.',
    'engine_status values are project catalog markers, not a promise of exhaustive Magic rules or multiplayer correctness.',
    'A parser-eligible unimported card still requires a recorded import, executable human/local-AI proof and release checks.',
    'The comparison does not cover later cards, later legality changes, or source objects excluded by the explicit paper/Commander filter.',
  ],
};
artifacts.set('docs/catalog/summary.json', JSON.stringify(summary, null, 2) + '\n');
const number = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const reasonTable = [...reasons].sort((left, right) => right[1] - left[1] || compare(left[0], right[0])).map(([reason, count]) => `| \`${reason}\` | ${number(count)} |`).join('\n');
const doc = `# Card catalog and remaining imports

This inventory is generated from the application runtime and the pinned Scryfall Oracle feed. It describes the repository's card catalog, not a promise that every Magic card or interaction is implemented.

## Download the complete lists

- [Imported/runtime cards](catalog/imported-cards.csv): every runtime definition, its source batch, engine marker, and whether arbitrary deck import permits it.
- [Remaining cards](catalog/remaining-cards.csv): every paper, Commander-legal Oracle ID in the pinned source that has no matched runtime definition, with its current compiler reason.
- [Machine-readable summary](catalog/summary.json): exact counts, snapshot metadata, hashes, exceptional names, and restricted legacy cards.

CSV files are UTF-8, sorted by card name without locale-specific collation, and use quoted fields. Counts are unique runtime names or unique Oracle IDs as indicated; they are not counts of printings, deck copies, or test cases.

## Current inventory

Last recorded import: **${state.updatedAt}**.

| Measure | Count |
| --- | ---: |
| Runtime card definitions | ${number(imported.length)} |
| Generic Oracle imports (${runtimeGeneric.length} batches of 100) | ${number(state.importedNames.length)} |
| Dedicated/manual Oracle imports | ${number(summary.counts.manualOracleCards)} |
| Legacy definitions | ${number(summary.counts.legacyDefinitions)} |
| Definitions allowed in arbitrary deck imports | ${number(eligibleEntries)} |
| Legacy definitions restricted from arbitrary deck imports | ${number(imported.length - eligibleEntries)} |
| Paper, Commander-legal source Oracle IDs | ${number(universe.length)} |
| Source Oracle IDs represented by a runtime name or face alias | ${number(representedEligible)} |
| Source Oracle IDs still absent from the runtime | ${number(remaining.length)} |
| Of those: parser-eligible but not imported | ${number(ready.length)} |
| Of those: deferred by the current semantic compiler | ${number(remaining.length - ready.length)} |

**Availability is explicit.** A row with \`deck_import_eligible=false\` exists internally but is blocked for arbitrary deck imports: the legacy catalog includes cards from inactive built-in decks. The importer also validates the whole deck. Presence in this CSV alone does not make any proposed deck legal or launch-ready.

**Certification has a defined limit.** \`certified\` and \`certified-legacy\` are internal catalog markers. Strict certification, source provenance, controlled human/local-AI execution, regression tests, and browser checks provide different evidence; none proves every multiplayer permutation. A parser match never grants support by itself.

## What “remaining” means

The comparison universe is exactly \`games.includes('paper') && legalities.commander === 'legal'\` in the pinned feed, deduplicated by Oracle ID. It excludes later releases, later Oracle or legality changes, rows not marked for paper, tokens, and other source objects that fail that filter. The feed has ${number(cards.length)} source rows and ${number(summary.comparisonUniverse.paperRows)} rows marked for paper.

Imported Oracle batches match by their recorded Oracle ID. Legacy definitions match first by an exact source name, then by a face name within the comparison universe. Face matching is an inventory association, not proof that every side or transition is fully implemented. Multiple runtime names can refer to one Oracle ID, so runtime totals and source totals differ. The summary lists ${aliases.length} such groups, ${unmatched.length} runtime names without a pinned-source match, and ${outside.length} matched runtime names outside the comparison universe. Those exceptions remain visible in the imported CSV and are not silently counted as missing source cards.

Current parser-eligible, unimported names: ${ready.length ? ready.map(entry => '\`' + entry.name + '\`').join(', ') : 'none'}. These still need an import record and executable proof. The importer defaults to complete 100-card batches; a smaller queue is not a reason to relax its safeguards.

| Current remaining reason | Cards |
| --- | ---: |
${reasonTable}

These are compiler queue reasons, not a claim that each card is impossible to implement. The complete per-card list is in [remaining-cards.csv](catalog/remaining-cards.csv).

## Source and regeneration

- Provider: Scryfall \`oracle_cards\` bulk feed.
- Bulk ID: \`${source.bulkId}\`.
- Pinned update: **${source.bulkUpdatedAt}**.
- Compressed source SHA-256: \`${source.bulkSha256}\`.
- Current semantic compiler: **v${state.compilerVersion}**.

The original compressed snapshot is intentionally not committed. Use the same archived \`.jsonl.gz\` file and hash. A current download from [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data) may have different contents; it cannot reproduce this historical inventory. The exporter fails on a missing source, mismatched SHA-256, duplicate/ambiguous identity, or catalog/state mismatch, and makes no network requests.

\`\`\`sh
node scripts/export-card-catalog.mjs \\
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \\
  --source-sha256=${source.bulkSha256}

# Recompute and fail if any committed catalog artifact is stale:
node scripts/export-card-catalog.mjs \\
  --source-file=/absolute/path/to/oracle-pinned.jsonl.gz \\
  --source-sha256=${source.bulkSha256} \\
  --check
\`\`\`

The exporter writes this document and \`docs/catalog/*.csv\` / \`summary.json\`; \`--check\` writes nothing. It fingerprints the runtime, compiler scripts, and import manifests, and records CSV hashes. It never writes engine data or imports a card. Regenerate after card imports or changes to the classifier; validate source provenance and execute the relevant gameplay tests before release.

The first classification pass can take several minutes. Successful exports keep a local cache under ignored \`output/card-catalog/\`, keyed to the exact source SHA-256 and compiler-file hashes. Each run still validates the compressed source and rebuilds the runtime inventory. Unchanged whole-card classifications may reuse that cache; \`--fresh\` forces every remaining card through the compiler again. Cache checksums detect accidental corruption, and the cache is not committed or needed to regenerate from scratch.

The generic import implementation is [import-oracle-batch.mjs](../scripts/import-oracle-batch.mjs), its state is [state.json](../reports/oracle-import/state.json), and the runtime eligibility rules are in [oracle-catalog.js](../src/modules/oracle-catalog.js). Historical reports elsewhere in the repository describe their dated cohorts; this generated inventory is the current catalog index.
`;
artifacts.set('docs/card-catalog.md', doc);
for (const [relative, content] of artifacts) {
  if (check) assert.equal(read(relative), content, `${relative} is stale; regenerate the card catalog`);
  else {
    fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    fs.writeFileSync(path.join(root, relative), content);
  }
}
console.log(JSON.stringify({ mode: check ? 'check' : 'write', ...summary.counts, artifacts: [...artifacts.keys()] }, null, 2));
