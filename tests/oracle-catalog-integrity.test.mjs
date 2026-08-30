import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRawData } from '../scripts/source-audit.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, 'reports', 'oracle-import');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, 'en'));
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return sorted(repeated);
}

function intersection(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return sorted(new Set([...left].filter(value => rightSet.has(value))));
}

function assertExactSet(actual, expected, label) {
  assert.deepEqual(sorted(new Set(actual)), sorted(new Set(expected)), label);
}

function genericSequence(value) {
  const match = /^oracle-(\d{4})$/.exec(String(value));
  return match ? Number(match[1]) : null;
}

test('Oracle catalog is a duplicate-free, provenance-preserving union', () => {
  const MTG = loadEngine();
  const state = readJson('reports/oracle-import/state.json');
  const sauronReport = readJson('reports/oracle-import/sauron-dark-lord-cards.json');
  const appSource = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const legacyRaw = extractRawData(fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8'));

  const reportFiles = fs.readdirSync(reportDir)
    .filter(file => /^batch-\d{4}\.json$/.test(file))
    .sort();
  const reports = reportFiles.map(file => ({ file, report: readJson(`reports/oracle-import/${file}`) }));
  const runtimeBatches = Array.from(MTG.ORACLE_BATCHES);
  const runtimeGeneric = runtimeBatches
    .filter(batch => genericSequence(batch.id) !== null)
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  const runtimeManual = runtimeBatches.filter(batch => batch.id === 'moxfield-sauron-dark-lord');
  const stateBatches = [...state.batches].sort((left, right) => Number(left.sequence) - Number(right.sequence));

  const configuredTotal = process.env.ORACLE_EXPECTED_GENERIC_CARDS;
  const expectedGenericCards = configuredTotal === undefined || configuredTotal === ''
    ? state.importedOracleIds.length
    : Number(configuredTotal);
  assert.ok(Number.isInteger(expectedGenericCards) && expectedGenericCards >= 0,
    'ORACLE_EXPECTED_GENERIC_CARDS must be a non-negative integer');
  assert.equal(expectedGenericCards % 100, 0,
    'ORACLE_EXPECTED_GENERIC_CARDS must describe complete 100-card batches');
  const expectedBatchCount = expectedGenericCards / 100;
  const expectedSequences = Array.from({ length: expectedBatchCount }, (_, index) => index + 1);

  const appOracleImports = [...appSource.matchAll(/import\s+['"]\.\/oracle-batches\/([^'"]+\.js)['"];?/g)]
    .map(match => match[1]);
  const appGenericSequences = appOracleImports
    .map(file => /^batch-(\d{4})\.js$/.exec(file))
    .filter(Boolean)
    .map(match => Number(match[1]));
  const reportSequences = reports.map(({ file, report }) => {
    const fileSequence = Number(/^batch-(\d{4})\.json$/.exec(file)[1]);
    assert.equal(report.id, `oracle-${String(fileSequence).padStart(4, '0')}`, `${file}: canonical id`);
    assert.equal(Number(report.sequence), fileSequence, `${file}: canonical sequence`);
    return fileSequence;
  });
  const runtimeSequences = runtimeGeneric.map(batch => {
    assert.equal(Number(batch.sequence), genericSequence(batch.id), `${batch.id}: id/sequence parity`);
    return Number(batch.sequence);
  });
  const stateSequences = stateBatches.map(batch => {
    assert.equal(Number(batch.sequence), genericSequence(batch.id), `${batch.id}: state id/sequence parity`);
    return Number(batch.sequence);
  });

  assert.deepEqual(reportSequences, expectedSequences, 'generic reports have contiguous sequences');
  assert.deepEqual(runtimeSequences, expectedSequences, 'runtime generic batches have contiguous sequences');
  assert.deepEqual(stateSequences, expectedSequences, 'state generic batches have contiguous sequences');
  assert.deepEqual(appGenericSequences, expectedSequences, 'src/app.js imports every generic batch once and in order');
  assert.equal(appOracleImports.filter(file => file === 'sauron-dark-lord.js').length, 1,
    'src/app.js imports the Sauron reservation batch exactly once');
  assert.equal(state.batchSize, 100, 'state batch size remains 100');
  assert.equal(reports.length, expectedBatchCount, 'generic report count');
  assert.equal(runtimeGeneric.length, expectedBatchCount, 'runtime generic batch count');
  assert.equal(stateBatches.length, expectedBatchCount, 'state generic batch count');

  const runtimeById = new Map(runtimeGeneric.map(batch => [batch.id, batch]));
  const stateById = new Map(stateBatches.map(batch => [batch.id, batch]));
  const reportEntries = [];

  for (const { file, report } of reports) {
    const runtime = runtimeById.get(report.id);
    const stateBatch = stateById.get(report.id);
    assert.ok(runtime, `${report.id}: loaded by runtime`);
    assert.ok(stateBatch, `${report.id}: present in state`);
    assert.equal(report.cards.length, 100, `${report.id}: report contains exactly 100 cards`);
    assert.equal(runtime.cards.length, 100, `${report.id}: runtime contains exactly 100 cards`);
    assert.equal(stateBatch.count, 100, `${report.id}: state records exactly 100 cards`);
    assert.equal(runtime.generatedAt, report.generatedAt, `${report.id}: runtime generatedAt provenance`);
    assert.equal(stateBatch.generatedAt, report.generatedAt, `${report.id}: state generatedAt provenance`);
    assert.equal(report.source.provider, 'Scryfall', `${report.id}: source provider`);
    assert.equal(report.source.bulkType, 'oracle_cards', `${report.id}: source bulk type`);
    assert.ok(report.source.bulkId, `${report.id}: source bulk id`);
    assert.ok(report.source.bulkUpdatedAt, `${report.id}: source snapshot timestamp`);
    assert.equal(stateBatch.sourceUpdatedAt, report.source.bulkUpdatedAt,
      `${report.id}: state points to the report snapshot`);
    assert.equal(JSON.stringify(runtime.source), JSON.stringify(report.source),
      `${report.id}: runtime/report source provenance parity`);
    assert.equal(JSON.stringify(runtime.cards), JSON.stringify(report.cards),
      `${report.id}: runtime/report card payload parity`);
    assert.equal(stateBatch.firstName, report.cards[0].raw.name, `${report.id}: state first card`);
    assert.equal(stateBatch.lastName, report.cards.at(-1).raw.name, `${report.id}: state last card`);

    report.cards.forEach((entry, index) => {
      const name = entry.raw && entry.raw.name;
      const runtimeRaw = MTG.RAW_DATA.cards[name];
      const catalog = MTG.CARD_CATALOG[name];
      assert.equal(entry.position, index + 1, `${report.id}/${name}: contiguous card position`);
      assert.ok(name && name === name.trim(), `${report.id}: canonical non-empty card name`);
      assert.equal(entry.raw._oracleId, entry.oracleId, `${report.id}/${name}: raw Oracle id`);
      assert.equal(entry.raw._scryfallId, entry.scryfallId, `${report.id}/${name}: raw Scryfall id`);
      assert.equal(runtimeRaw && runtimeRaw.name, name, `${report.id}/${name}: canonical runtime raw card`);
      assert.equal(runtimeRaw && runtimeRaw._oracleBatch, report.id, `${report.id}/${name}: runtime batch provenance`);
      assert.equal(runtimeRaw && runtimeRaw._oracleId, entry.oracleId, `${report.id}/${name}: runtime Oracle id`);
      assert.equal(runtimeRaw && runtimeRaw._scryfallId, entry.scryfallId, `${report.id}/${name}: runtime Scryfall id`);
      assert.equal(runtimeRaw && runtimeRaw.oracle, entry.raw.oracle, `${report.id}/${name}: exact Oracle text`);
      assert.ok(MTG.DEFS[name], `${report.id}/${name}: canonical engine definition`);
      assert.equal(catalog && catalog.name, name, `${report.id}/${name}: canonical catalog card`);
      assert.equal(catalog && catalog.engineBatch, report.id, `${report.id}/${name}: catalog batch provenance`);
      assert.equal(catalog && catalog.oracleId, entry.oracleId, `${report.id}/${name}: catalog Oracle id`);
      assert.equal(catalog && catalog.scryfallId, entry.scryfallId, `${report.id}/${name}: catalog Scryfall id`);
      assert.equal(catalog && catalog.engineStatus, 'certified', `${report.id}/${name}: catalog certification`);
      reportEntries.push(entry);
    });
  }

  assert.equal(reportEntries.length, expectedGenericCards, 'configured generic card total');
  const genericNames = reportEntries.map(entry => entry.raw.name);
  const genericOracleIds = reportEntries.map(entry => entry.oracleId);
  const genericScryfallIds = reportEntries.map(entry => entry.scryfallId);
  assert.deepEqual(duplicates(genericNames), [], 'generic card names are unique');
  assert.deepEqual(duplicates(genericOracleIds), [], 'generic Oracle ids are unique');
  assert.deepEqual(duplicates(genericScryfallIds), [], 'generic Scryfall ids are unique');
  assertExactSet(state.importedNames, genericNames, 'state importedNames is the exact generic report union');
  assertExactSet(state.importedOracleIds, genericOracleIds,
    'state importedOracleIds is the exact generic report union');
  assert.equal(state.importedNames.length, expectedGenericCards, 'state importedNames has no duplicates or omissions');
  assert.equal(state.importedOracleIds.length, expectedGenericCards,
    'state importedOracleIds has no duplicates or omissions');

  assert.equal(runtimeManual.length, 1, 'one Sauron manual reservation batch is loaded');
  const manualBatch = runtimeManual[0];
  const reservationBatch = sauronReport.batch;
  assert.ok(reservationBatch && Array.isArray(reservationBatch.cards), 'Sauron report contains reservation cards');
  assert.equal(reservationBatch.id, 'moxfield-sauron-dark-lord', 'canonical Sauron reservation id');
  assert.equal(reservationBatch.source.provider, 'Scryfall', 'Sauron card provenance provider');
  assert.equal(reservationBatch.source.deckProvider, 'Moxfield', 'Sauron deck provenance provider');
  assert.ok(reservationBatch.source.deckUrl, 'Sauron deck provenance URL');
  assert.equal(JSON.stringify(manualBatch), JSON.stringify(reservationBatch),
    'Sauron runtime batch exactly matches its reservation report');
  assert.equal(sauronReport.importedCount, reservationBatch.cards.length, 'Sauron reservation count parity');
  const manualNames = reservationBatch.cards.map(entry => entry.raw.name);
  const manualOracleIds = reservationBatch.cards.map(entry => entry.oracleId);
  const manualScryfallIds = reservationBatch.cards.map(entry => entry.scryfallId);
  assertExactSet(sauronReport.importedNames, manualNames, 'Sauron importedNames is the exact reservation union');
  for (const entry of reservationBatch.cards) {
    const name = entry.raw.name;
    const runtimeRaw = MTG.RAW_DATA.cards[name];
    const catalog = MTG.CARD_CATALOG[name];
    assert.equal(entry.raw._oracleId, entry.oracleId, `${name}: reserved raw Oracle id`);
    assert.equal(entry.raw._scryfallId, entry.scryfallId, `${name}: reserved raw Scryfall id`);
    assert.equal(runtimeRaw && runtimeRaw._oracleBatch, reservationBatch.id, `${name}: reserved runtime provenance`);
    assert.equal(runtimeRaw && runtimeRaw._oracleId, entry.oracleId, `${name}: reserved runtime Oracle id`);
    assert.equal(runtimeRaw && runtimeRaw._scryfallId, entry.scryfallId, `${name}: reserved runtime Scryfall id`);
    assert.equal(catalog && catalog.engineBatch, reservationBatch.id, `${name}: reserved catalog provenance`);
    assert.equal(catalog && catalog.oracleId, entry.oracleId, `${name}: reserved catalog Oracle id`);
    assert.equal(catalog && catalog.scryfallId, entry.scryfallId, `${name}: reserved catalog Scryfall id`);
  }

  const allNames = genericNames.concat(manualNames);
  const allOracleIds = genericOracleIds.concat(manualOracleIds);
  const allScryfallIds = genericScryfallIds.concat(manualScryfallIds);
  assert.deepEqual(duplicates(allNames), [], 'all Oracle catalog names are unique');
  assert.deepEqual(duplicates(allOracleIds), [], 'all Oracle catalog Oracle ids are unique');
  assert.deepEqual(duplicates(allScryfallIds), [], 'all Oracle catalog Scryfall ids are unique');

  const legacyNames = new Set(Object.keys(legacyRaw.cards || {}));
  assert.deepEqual(intersection(genericNames, legacyNames), [], 'generic cards never overlap legacy raw names');
  assert.deepEqual(intersection(manualNames, legacyNames), [], 'manual Sauron cards never overlap legacy raw names');
  assert.deepEqual(intersection(genericNames, new Set(manualNames)), [], 'generic and manual names never overlap');
  assert.deepEqual(intersection(genericOracleIds, new Set(manualOracleIds)), [],
    'generic and manual Oracle ids never overlap');
  assert.deepEqual(intersection(genericScryfallIds, new Set(manualScryfallIds)), [],
    'generic and manual Scryfall ids never overlap');

  const diagnosticRows = reportEntries
    .map(entry => `${entry.oracleId}\t${entry.raw.name}`)
    .sort();
  const digest = createHash('sha256').update(diagnosticRows.join('\n')).digest('hex');
  assert.match(digest, /^[0-9a-f]{64}$/, 'diagnostic catalog SHA-256');
  console.log(`ORACLE_CATALOG_INTEGRITY genericCards=${expectedGenericCards} ` +
    `genericBatches=${expectedBatchCount} manualReservations=${manualNames.length} sha256=${digest}`);
});
