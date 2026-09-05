import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { collectReservedOracleCards, createImportPlan, moduleSource } from '../scripts/import-oracle-batch.mjs';
import { parseProvenanceArgs, verifyOracleBatchProvenance } from '../scripts/verify-oracle-batch-provenance.mjs';

const PIN = 'a'.repeat(64);
const BULK = {
  type: 'oracle_cards', id: 'provenance-fixture', updated_at: '2026-08-30T09:01:56.964+00:00',
  description: 'Offline provenance regression fixture', sha256: PIN,
};

function sourceCard(name, overrides = {}) {
  const id = name.toLowerCase().replaceAll(' ', '-');
  return {
    name, oracle_id: `oracle-${id}`, id: `print-${id}`, layout: 'normal',
    games: ['paper'], legalities: { commander: 'legal' },
    mana_cost: '{1}{G}', type_line: 'Creature — Human', oracle_text: '',
    power: '2', toughness: '2', color_identity: ['G'], colors: ['G'], keywords: [],
    set: 'tst', set_name: 'Provenance Tests', collector_number: id, rarity: 'common',
    released_at: '2026-08-30', scryfall_uri: `https://example.invalid/${id}`,
    ...overrides,
  };
}

function fixture() {
  const legacy = sourceCard('Legacy Fixture');
  const manual = sourceCard('Reserved Fixture');
  const sourceCards = [
    legacy, manual,
    sourceCard('Aven Fixture', { oracle_text: 'Flying', keywords: ['Flying'] }),
    sourceCard('Beacon Fixture', { oracle_text: 'When this creature enters, draw a card.' }),
    sourceCard('Civic Fixture'),
    sourceCard('Departure Fixture', {
      oracle_text: "When this creature enters, return up to one other target creature you control to its owner's hand.",
    }),
  ];
  const manualPlan = createImportPlan({ cards: [manual], bulk: BULK, baseNames: new Set(), limit: 1, sequence: 99 });
  const manualReports = [{ id: 'manual-fixture', cards: manualPlan.report.cards }];
  const reports = [];
  let state;
  for (const sequence of [27, 28]) {
    const plan = createImportPlan({
      cards: sourceCards, bulk: BULK, state, baseNames: new Set([legacy.name]),
      reservations: collectReservedOracleCards(manualReports), limit: 2, sequence,
      generatedAt: '2026-08-30T19:20:14.852Z',
    });
    reports.push(JSON.parse(JSON.stringify(plan.report)));
    state = plan.nextState;
  }
  return {
    sourceCards, bulk: { ...BULK }, reports, manualReports, state,
    legacyCards: { [legacy.name]: { name: legacy.name } },
    runtimeSources: new Map(reports.map(report => [report.id, moduleSource(report)])),
    appSource: reports.map(report => `import './oracle-batches/batch-${String(report.sequence).padStart(4, '0')}.js';`).join('\n'),
    first: 27, last: 28, batchSize: 2, expectedCards: 4,
  };
}

test('provenance verifier recompiles every full row and produces deterministic cohort/catalog digests without mutation', () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = verifyOracleBatchProvenance(input);
  assert.equal(result.ok, true);
  assert.equal(result.verifiedRows, 4);
  assert.equal(result.batches, 2);
  assert.equal(result.source.rows, 6);
  assert.equal(result.catalogNames, 6);
  assert.equal(result.historicalQueueStatisticsReplayed, false);
  assert.equal(result.batchResults.every(batch => batch.rows === 2), true);
  const namesAndIds = input.reports.flatMap(report => report.cards)
    .map(row => `${row.oracleId}\t${row.raw.name}`).sort().join('\n');
  assert.equal(result.selectedCatalogSha256, createHash('sha256').update(namesAndIds).digest('hex'));
  assert.match(result.normalizedCohortSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(verifyOracleBatchProvenance(input), result, 'same inputs produce identical proof');
  assert.deepEqual(input, before, 'verification does not repair or mutate the source, state, reports, or runtime modules');
});

test('full-row comparison rejects changes beyond Oracle text even when report and runtime agree with each other', () => {
  const corruptions = [
    row => { row.raw.cost = '{9}'; },
    row => { row.raw.power = '9'; },
    row => { row.raw.oracle = 'Flying'; },
    row => { row.raw._ci = ['R']; },
    row => { row.raw.extraUncertifiedField = true; },
    row => { row.catalog.typeLine = 'Artifact'; },
    row => { row.catalog.scryfallUri += '?altered'; },
    row => { row.catalog.keywords = ['Haste']; },
    row => { row.implementedKeywords = ['flying']; },
    row => { row.implementation = []; },
    row => { row.oracleContracts = ['forged-contract']; },
    row => { row.rulesCore += ' Additional forged effect.'; },
    row => { row.semanticClass = 'keyword-only'; },
    row => { row.extraUncertifiedField = true; },
  ];
  for (const corrupt of corruptions) {
    const input = fixture();
    const report = input.reports[0];
    corrupt(report.cards[1]);
    input.runtimeSources.set(report.id, moduleSource(report));
    assert.throws(() => verifyOracleBatchProvenance(input), /full normalized source\/compiler row/);
  }
});

test('a missing or duplicate pinned Oracle ID fails instead of skipping a card or choosing the first match', () => {
  for (const duplicate of [false, true]) {
    const input = fixture();
    const id = input.reports[0].cards[0].oracleId;
    if (duplicate) input.sourceCards.push(structuredClone(input.sourceCards.find(card => card.oracle_id === id)));
    else input.sourceCards = input.sourceCards.filter(card => card.oracle_id !== id);
    assert.throws(() => verifyOracleBatchProvenance(input), /exactly one pinned source Oracle ID/);
  }
});

test('unsupported or no-longer-paper/legal source rows cannot reduce the claimed verified cohort', () => {
  for (const corrupt of [
    card => { card.mana_cost = '{Q}'; },
    card => { card.games = ['arena']; },
    card => { card.legalities.commander = 'banned'; },
  ]) {
    const input = fixture();
    corrupt(input.sourceCards.find(card => card.oracle_id === input.reports[0].cards[0].oracleId));
    assert.throws(() => verifyOracleBatchProvenance(input), /Only 1 cards match the certified semantic subset/);
  }
});

test('catalog duplicate IDs, print IDs, names, manual overlap, and known legacy collisions fail', () => {
  for (const corrupt of [
    input => { input.reports[1].cards[0].oracleId = input.reports[0].cards[0].oracleId; },
    input => { input.reports[1].cards[0].scryfallId = input.reports[0].cards[0].scryfallId; },
    input => { input.reports[1].cards[0].raw.name = input.reports[0].cards[0].raw.name; },
    input => { input.manualReports[0].cards[0].oracleId = input.reports[0].cards[0].oracleId; },
    input => { input.legacyCards[input.reports[0].cards[0].raw.name] = {}; },
    input => { input.legacyCards['Legacy Fixture']._oracleId = input.reports[0].cards[0].oracleId; },
  ]) {
    const input = fixture();
    corrupt(input);
    assert.throws(() => verifyOracleBatchProvenance(input), /duplicate|collision/);
  }
});

test('state and runtime registration omissions, duplicates, order, and batch metadata fail closed', () => {
  for (const corrupt of [
    input => { input.state.importedNames.pop(); },
    input => { input.state.importedOracleIds.push(input.state.importedOracleIds[0]); },
    input => { input.state.batches[0].sourceUpdatedAt = 'wrong-snapshot'; },
    input => { input.state.batches[0].firstName = 'Wrong First Name'; },
    input => { input.state.source.bulkSha256 = 'b'.repeat(64); },
    input => { input.state.updatedAt = 'wrong-timestamp'; },
    input => { input.state.compilerVersion = 99; },
    input => { input.appSource = input.appSource.split('\n')[0]; },
    input => { input.appSource += `\n${input.appSource.split('\n')[0]}`; },
    input => { input.appSource = input.appSource.split('\n').reverse().join('\n'); },
  ]) {
    const input = fixture();
    corrupt(input);
    assert.throws(() => verifyOracleBatchProvenance(input), /state|runtime app registrations/);
  }
});

test('entire runtime bytes, snapshot identity, summary counts, and every requested batch are verified', () => {
  for (const [corrupt, expected] of [
    [input => { input.runtimeSources.set('oracle-0027', `${input.runtimeSources.get('oracle-0027')}\n// Unrecorded change\n`); }, /byte parity/],
    [input => { input.runtimeSources.delete('oracle-0028'); }, /runtime module exists/],
    [input => { input.bulk.sha256 = 'b'.repeat(64); }, /source provenance/],
    [input => { input.bulk.updated_at = '2026-08-29T00:00:00Z'; }, /source provenance/],
    [input => { input.reports[0].catalogSummary.oracleRows++; }, /oracleRows summary/],
    [input => { input.reports.pop(); }, /every requested batch/],
    [input => { input.reports[0].cards.pop(); }, /complete batch/],
    [input => { input.expectedCards = 3; }, /every complete batch/],
  ]) {
    const input = fixture();
    corrupt(input);
    assert.throws(() => verifyOracleBatchProvenance(input), expected);
  }
});

test('read-only CLI requires a pinned digest, exact cohort and known options, with no network/write fallback', () => {
  const args = ['--source-file=/tmp/pinned.jsonl.gz', `--source-sha256=${PIN}`];
  assert.deepEqual(parseProvenanceArgs(args), {
    sourceFile: '/tmp/pinned.jsonl.gz', sourceSha256: PIN, first: 27, last: 46, expectedCards: 2000,
  });
  for (const invalid of [
    [], [args[0]], [args[1]], [...args, '--write'], [...args, '--network'],
    [...args, '--first=27.5'], [...args, '--first=47'], [...args, '--expected-cards=1999'],
    [...args, args[0]], ['--source-file=/tmp/pinned.jsonl.gz', '--source-sha256=invalid'],
  ]) assert.throws(() => parseProvenanceArgs(invalid));
});

test('Time Lord compatibility is explicit, source-bound, and preserves strict frozen bytes and every unrelated field', () => {
  const historic = JSON.parse(fs.readFileSync(new URL('../reports/oracle-import/batch-0144.json', import.meta.url))).cards.find(row => row.raw.name === 'Time Lord Regeneration');
  const card = sourceCard(historic.raw.name, {
    oracle_text: historic.raw.oracle, type_line: historic.catalog.typeLine,
    mana_cost: historic.raw.cost, power: undefined, toughness: undefined,
    colors: ['U'], color_identity: ['U'],
  });
  const plan = createImportPlan({cards:[card],bulk:BULK,baseNames:new Set(),limit:1,sequence:27});
  assert.equal(plan.report.cards[0].implementation[0].targets[0].subtype,'Time Lord');
  const report = structuredClone(plan.report);
  report.cards[0].implementation = JSON.parse(JSON.stringify(report.cards[0].implementation).replaceAll('"subtype":"Time Lord"','"subtype":"Lord"'));
  const input = {sourceCards:[card],bulk:{...BULK},reports:[report],manualReports:[],state:plan.nextState,legacyCards:{},
    runtimeSources:new Map([[report.id,moduleSource(report)]]),appSource:"import './oracle-batches/batch-0027.js';",
    first:27,last:27,batchSize:1,expectedCards:1};
  const before=structuredClone(input),result=verifyOracleBatchProvenance(input);
  assert.deepEqual(result.semanticCompatibilityNormalizations,[{batch:report.id,name:card.name,oracleId:card.oracle_id,kind:'Time Lord single subtype'}]);
  assert.deepEqual(input,before);
  const changed=structuredClone(input);
  changed.reports[0].cards[0].implementation[0].targets[0].controller='any';
  changed.runtimeSources.set(report.id,moduleSource(changed.reports[0]));
  assert.throws(()=>verifyOracleBatchProvenance(changed),/full normalized source\/compiler row/);
  const wrongBytes=structuredClone(input);
  wrongBytes.runtimeSources.set(report.id,wrongBytes.runtimeSources.get(report.id)+'\n');
  assert.throws(()=>verifyOracleBatchProvenance(wrongBytes),/byte parity/);
});
