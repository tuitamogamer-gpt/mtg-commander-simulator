import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createImportPlan, fetchOracleCardsFromGzip, moduleSource } from './import-oracle-batch.mjs';
import { extractRawData } from './source-audit.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const batchId = sequence => `oracle-${String(sequence).padStart(4, '0')}`;
const batchFile = sequence => `batch-${String(sequence).padStart(4, '0')}`;
const normalized = value => JSON.parse(JSON.stringify(value));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const sorted = values => [...values].sort();

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert.ok(typeof value === 'string' && value.length, `${label}: nonempty string required`);
    assert.equal(seen.has(value), false, `${label}: duplicate ${value}`);
    seen.add(value);
  }
  return seen;
}

function catalogHash(rows) {
  return sha256(rows.map(row => `${row.oracleId}\t${row.raw.name}`).sort().join('\n'));
}

// Pure verifier: all comparison data is supplied by the caller. This does not
// fetch, write, repair, reselect, or silently skip an unsupported manifest row.
// The CLI first hashes the compressed pinned source before calling this.
export function verifyOracleBatchProvenance({
  sourceCards, bulk, reports, manualReports = [], legacyCards = {}, state,
  runtimeSources, appSource, first = 27, last = 46, batchSize = 100,
  expectedCards = (last - first + 1) * batchSize,
}) {
  assert.ok(Number.isInteger(first) && first > 0 && Number.isInteger(last) && last >= first,
    'batch range must contain positive contiguous integers');
  assert.ok(Number.isInteger(batchSize) && batchSize > 0 && batchSize <= 500, 'invalid batch size');
  assert.equal(expectedCards, (last - first + 1) * batchSize, 'expected card count must cover every complete batch');
  assert.match(bulk.sha256 || '', /^[a-f0-9]{64}$/, 'verified pinned source SHA-256 is required');
  assert.equal(bulk.type, 'oracle_cards');
  assert.ok(bulk.id && bulk.updated_at, 'pinned bulk metadata is required');

  const allReports = [...reports].sort((left, right) => left.sequence - right.sequence);
  unique(allReports.map(report => report.id), 'generic report ids');
  for (const report of allReports) {
    assert.ok(Number.isInteger(report.sequence) && report.sequence > 0, `${report.id}: sequence`);
    assert.equal(report.id, batchId(report.sequence), `${report.id}: canonical batch id`);
    assert.equal(report.cards.length, batchSize, `${report.id}: complete batch`);
    report.cards.forEach((row, index) => assert.equal(row.position, index + 1, `${report.id}: row position`));
  }
  const selected = allReports.filter(report => report.sequence >= first && report.sequence <= last);
  assert.deepEqual(selected.map(report => report.sequence),
    Array.from({ length: last - first + 1 }, (_, index) => first + index), 'every requested batch must be present');
  const selectedRows = selected.flatMap(report => report.cards);
  assert.equal(selectedRows.length, expectedCards, 'every requested row must be verified');

  const genericRows = allReports.flatMap(report => report.cards);
  const manualRows = manualReports.flatMap(report => report.cards);
  const union = [...genericRows, ...manualRows];
  const unionNames = unique(union.map(row => row.raw.name), 'catalog names');
  unique(union.map(row => row.oracleId), 'catalog Oracle ids');
  unique(union.map(row => row.scryfallId), 'catalog Scryfall ids');
  for (const name of Object.keys(legacyCards)) {
    assert.equal(unionNames.has(name), false, `legacy/catalog name collision: ${name}`);
  }
  const knownLegacyIds = new Set(Object.values(legacyCards).map(card => card._oracleId).filter(Boolean));
  for (const row of union) {
    assert.equal(knownLegacyIds.has(row.oracleId), false, `legacy/catalog Oracle id collision: ${row.raw.name}`);
  }

  assert.equal(state.batchSize, batchSize, 'state batch size');
  unique(state.importedNames, 'state names');
  unique(state.importedOracleIds, 'state Oracle ids');
  assert.deepEqual(sorted(state.importedNames), sorted(genericRows.map(row => row.raw.name)), 'state name union');
  assert.deepEqual(sorted(state.importedOracleIds), sorted(genericRows.map(row => row.oracleId)), 'state Oracle id union');
  unique(state.batches.map(batch => batch.id), 'state batch ids');
  assert.deepEqual(sorted(state.batches.map(batch => batch.id)), sorted(allReports.map(report => report.id)),
    'state batch union');
  const latestReport = allReports.at(-1);
  assert.deepEqual(state.source, latestReport.source, 'state latest snapshot provenance');
  assert.equal(state.updatedAt, latestReport.generatedAt, 'state latest update provenance');
  assert.equal(state.compilerVersion, latestReport.selectionPolicy.compilerVersion, 'state latest compiler version');
  for (const report of allReports) {
    const recorded = state.batches.find(batch => batch.id === report.id);
    assert.deepEqual(recorded, {
      id: report.id, sequence: report.sequence, generatedAt: report.generatedAt,
      sourceUpdatedAt: report.source.bulkUpdatedAt, count: report.cards.length,
      firstName: report.cards[0].raw.name, lastName: report.cards.at(-1).raw.name,
    }, `${report.id}: complete state batch record`);
  }
  const registered = [...appSource.matchAll(/import\s+['"]\.\/oracle-batches\/batch-(\d{4})\.js['"];?/g)]
    .map(match => Number(match[1]));
  assert.deepEqual(registered, allReports.map(report => report.sequence), 'runtime app registrations are complete, unique, and ordered');

  // A Scryfall Oracle feed may legitimately contain several objects with the
  // same English name (for example tokens). Resolve strictly by Oracle ID,
  // require one source object for each requested ID, then compare the full row.
  const byOracleId = new Map();
  for (const card of sourceCards) {
    const rows = byOracleId.get(card.oracle_id) || [];
    rows.push(card);
    byOracleId.set(card.oracle_id, rows);
  }
  const paperCards = sourceCards.filter(card => card.games?.includes('paper'));
  const commanderLegalCards = paperCards.filter(card => card.legalities?.commander === 'legal');
  const batchResults = [];
  for (const report of selected) {
    const originalCards = report.cards.map(row => {
      const candidates = byOracleId.get(row.oracleId) || [];
      assert.equal(candidates.length, 1, `${report.id}/${row.raw.name}: exactly one pinned source Oracle ID`);
      return candidates[0];
    });
    // Limit recompilation to the recorded cohort, not today's entire queue:
    // historical ready/deferred queue statistics are not current semantics.
    // Every row still runs through the production importer's complete raw,
    // catalog, legality, keyword, Oracle-contract and implementation compiler.
    const compiled = createImportPlan({
      cards: originalCards, bulk, baseNames: new Set(), sequence: report.sequence,
      limit: report.cards.length, generatedAt: report.generatedAt,
      compilerVersion: report.selectionPolicy.compilerVersion,
    }).report;
    for (const field of ['schemaVersion', 'id', 'sequence', 'generatedAt', 'source', 'selectionPolicy']) {
      assert.deepEqual(report[field], normalized(compiled[field]), `${report.id}: ${field} provenance`);
    }
    const expectedRows = normalized(compiled.cards);
    report.cards.forEach((row, index) => {
      assert.deepEqual(row, expectedRows[index], `${report.id}/${row.raw.name}: full normalized source/compiler row`);
    });
    for (const [field, expected] of Object.entries({
      oracleRows: sourceCards.length, paperCards: paperCards.length,
      commanderLegalCards: commanderLegalCards.length, legacyEngineCards: Object.keys(legacyCards).length,
      selected: report.cards.length, selectedBySemanticClass: compiled.catalogSummary.selectedBySemanticClass,
    })) assert.deepEqual(report.catalogSummary[field], expected, `${report.id}: ${field} summary`);
    const runtime = runtimeSources.get(report.id);
    assert.equal(typeof runtime, 'string', `${report.id}: runtime module exists`);
    assert.equal(runtime, moduleSource(report), `${report.id}: entire runtime module/report byte parity`);
    batchResults.push({ id: report.id, rows: report.cards.length,
      normalizedRowsSha256: sha256(JSON.stringify(canonical(report.cards))), runtimeSha256: sha256(runtime) });
  }
  return {
    ok: true, first, last, batches: selected.length, verifiedRows: selectedRows.length,
    source: { sha256: bulk.sha256, bulkId: bulk.id, updatedAt: bulk.updated_at, rows: sourceCards.length },
    compilerVersion: selected[0].selectionPolicy.compilerVersion,
    genericCards: genericRows.length, manualCards: manualRows.length, legacyCards: Object.keys(legacyCards).length,
    knownLegacyOracleIds: knownLegacyIds.size,
    catalogNames: union.length + Object.keys(legacyCards).length,
    selectedCatalogSha256: catalogHash(selectedRows), genericCatalogSha256: catalogHash(genericRows),
    oracleUnionCatalogSha256: catalogHash(union),
    normalizedCohortSha256: sha256(JSON.stringify(canonical(selected.map(report => ({ id: report.id, cards: report.cards }))))),
    historicalQueueStatisticsReplayed: false,
    batchResults,
  };
}

export function parseProvenanceArgs(args) {
  const values = new Map();
  for (const argument of args) {
    const match = /^--(source-file|source-sha256|first|last|expected-cards)=(.+)$/.exec(argument);
    assert.ok(match, `unknown or incomplete argument: ${argument}`);
    assert.equal(values.has(match[1]), false, `duplicate argument: --${match[1]}`);
    values.set(match[1], match[2]);
  }
  assert.ok(values.get('source-file'), '--source-file is required; no network fallback is allowed');
  assert.match(values.get('source-sha256') || '', /^[a-f0-9]{64}$/i, '--source-sha256 is required');
  const first = Number(values.get('first') ?? 27);
  const last = Number(values.get('last') ?? 46);
  const expectedCards = Number(values.get('expected-cards') ?? (last - first + 1) * 100);
  assert.ok(Number.isInteger(first) && first > 0 && Number.isInteger(last) && last >= first, 'invalid batch range');
  assert.equal(expectedCards, (last - first + 1) * 100, 'expected-cards must cover every complete 100-card batch');
  return { sourceFile: values.get('source-file'), sourceSha256: values.get('source-sha256').toLowerCase(), first, last, expectedCards };
}

export async function runProvenanceVerification(args = process.argv.slice(2)) {
  const options = parseProvenanceArgs(args);
  const reportDir = path.join(workspaceRoot, 'reports', 'oracle-import');
  const files = fs.readdirSync(reportDir).filter(file => file.endsWith('.json') && file !== 'state.json').sort();
  const reports = [];
  const manualReports = [];
  for (const file of files) {
    const report = JSON.parse(fs.readFileSync(path.join(reportDir, file), 'utf8'));
    const match = /^batch-(\d{4})\.json$/.exec(file);
    if (match) {
      assert.equal(report.sequence, Number(match[1]), `${file}: filename/sequence parity`);
      reports.push(report);
    } else if (report.batch && Array.isArray(report.batch.cards)) manualReports.push(report.batch);
  }
  const firstReport = reports.find(report => report.sequence === options.first);
  assert.ok(firstReport, `missing requested ${batchId(options.first)}`);
  const source = firstReport.source;
  const { bulk, cards } = await fetchOracleCardsFromGzip(options.sourceFile, {
    type: source.bulkType, id: source.bulkId, updated_at: source.bulkUpdatedAt, description: source.bulkDescription,
  }, options.sourceSha256);
  const runtimeSources = new Map(reports.filter(report => report.sequence >= options.first && report.sequence <= options.last)
    .map(report => [report.id, fs.readFileSync(path.join(workspaceRoot, 'src', 'oracle-batches', `${batchFile(report.sequence)}.js`), 'utf8')]));
  const result = verifyOracleBatchProvenance({
    sourceCards: cards, bulk, reports, manualReports, runtimeSources,
    legacyCards: extractRawData(fs.readFileSync(path.join(workspaceRoot, 'src', 'data.js'), 'utf8')).cards,
    state: JSON.parse(fs.readFileSync(path.join(reportDir, 'state.json'), 'utf8')),
    appSource: fs.readFileSync(path.join(workspaceRoot, 'src', 'app.js'), 'utf8'),
    first: options.first, last: options.last, expectedCards: options.expectedCards,
  });
  result.compilerFiles = Object.fromEntries(['scripts/import-oracle-batch.mjs', 'scripts/oracle-spell-v4.mjs', 'scripts/oracle-extensions-v5.mjs', 'scripts/oracle-extensions-v6.mjs', 'scripts/oracle-extensions-v7.mjs', 'scripts/oracle-flavor-words.json', 'scripts/oracle-subtypes.mjs']
    .map(file => [file, sha256(fs.readFileSync(path.join(workspaceRoot, file)))]));
  result.compilerSha256 = sha256(Object.entries(result.compilerFiles).map(([file, digest]) => `${file}\t${digest}`).join('\n'));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runProvenanceVerification().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(`Oracle batch provenance verification failed: ${error.message}`);
    process.exitCode = 1;
  });
}
