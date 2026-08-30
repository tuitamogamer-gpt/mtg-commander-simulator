import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectReservedOracleCards,
  createImportPlan,
  moduleSource,
  runOracleImport,
  semanticClass,
  validateLimit,
  validateManaCost,
  writeImportPlanAtomic,
} from '../scripts/import-oracle-batch.mjs';

const SNAPSHOT_A = '2026-08-29T21:01:52.466+00:00';
const SNAPSHOT_B = '2026-08-30T21:01:52.466+00:00';
const GENERATED_AT = '2026-08-30T22:00:00.000Z';

function oracleCard(name, oracleId, overrides = {}) {
  return Object.assign({
    name,
    id: `scryfall-${oracleId}`,
    oracle_id: oracleId,
    layout: 'normal',
    games: ['paper'],
    legalities: { commander: 'legal' },
    type_line: 'Creature',
    oracle_text: '',
    mana_cost: '{1}',
    power: '1',
    toughness: '1',
    color_identity: [],
    colors: [],
    keywords: [],
    set: 'tst',
    set_name: 'Importer Tests',
    collector_number: oracleId,
    rarity: 'common',
    released_at: '2026-08-30',
    scryfall_uri: `https://scryfall.com/card/tst/${oracleId}`,
  }, overrides);
}

function bulk(updatedAt = SNAPSHOT_A) {
  return {
    type: 'oracle_cards',
    id: 'bulk-oracle-test',
    name: 'Oracle Cards',
    updated_at: updatedAt,
    description: 'Offline Oracle fixture',
  };
}

function state(overrides = {}) {
  return Object.assign({
    schemaVersion: 1,
    strategy: 'commander-legal-paper-semantic-queue-v2',
    batchSize: 100,
    source: { bulkUpdatedAt: SNAPSHOT_A },
    batches: [],
    importedOracleIds: [],
    importedNames: [],
  }, overrides);
}

function plan(overrides = {}) {
  return createImportPlan(Object.assign({
    cards: [oracleCard('Free Card', 'free-id')],
    bulk: bulk(),
    state: state(),
    baseNames: new Set(),
    reservations: collectReservedOracleCards([]),
    limit: 1,
    sequence: 14,
    generatedAt: GENERATED_AT,
  }, overrides));
}

function allFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else found.push(absolute);
    }
  };
  visit(directory);
  return found;
}

function importerWorkspace() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-import-wrapper-'));
  const sourceDirectory = path.join(directory, 'src');
  const reportDirectory = path.join(directory, 'reports', 'oracle-import');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.mkdirSync(reportDirectory, { recursive: true });
  fs.writeFileSync(path.join(sourceDirectory, 'data.js'),
    `var MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = ${JSON.stringify({ cards: {}, decks: [] })};\n`);
  fs.writeFileSync(path.join(reportDirectory, 'state.json'), `${JSON.stringify(state(), null, 2)}\n`);
  return directory;
}

function tracingFs(calls) {
  return new Proxy(fs, {
    get(target, property) {
      const value = target[property];
      if (typeof value !== 'function') return value;
      return (...args) => {
        calls.push(String(property));
        return value.apply(target, args);
      };
    },
  });
}

test('snapshot drift je odbijen bez opt-in-a, a prihvaćen snapshot ulazi u plan bez mreže', () => {
  assert.throws(() => plan({ bulk: bulk(SNAPSHOT_B) }), /snapshot changed/);

  const unchanged = plan();
  assert.equal(unchanged.report.source.bulkUpdatedAt, SNAPSHOT_A);
  assert.equal(unchanged.nextState.source.bulkUpdatedAt, SNAPSHOT_A);

  const accepted = plan({ bulk: bulk(SNAPSHOT_B), acceptNewSnapshot: true });
  assert.equal(accepted.report.source.bulkUpdatedAt, SNAPSHOT_B);
  assert.equal(accepted.nextState.source.bulkUpdatedAt, SNAPSHOT_B);
});

test('flat i wrapped reservations blokiraju i ime i Oracle ID uz legacy/state kolizije', () => {
  const reservations = collectReservedOracleCards([
    { cards: [{ oracleId: 'flat-id', raw: { name: 'Flat Name' } }] },
    { batch: { cards: [{ oracleId: 'wrapped-id', raw: { name: 'Wrapped Name' } }] } },
  ]);
  assert.deepEqual([...reservations.names].sort(), ['Flat Name', 'Wrapped Name']);
  assert.deepEqual([...reservations.ids].sort(), ['flat-id', 'wrapped-id']);

  const cards = [
    oracleCard('Legacy Name', 'legacy-new-id'),
    oracleCard('State Name', 'state-name-new-id'),
    oracleCard('State ID Alias', 'state-id'),
    oracleCard('Flat Name', 'flat-name-new-id'),
    oracleCard('Flat ID Alias', 'flat-id'),
    oracleCard('Wrapped Name', 'wrapped-name-new-id'),
    oracleCard('Wrapped ID Alias', 'wrapped-id'),
    oracleCard('Free Card', 'free-id'),
  ];
  const result = plan({
    cards,
    baseNames: new Set(['Legacy Name']),
    reservations,
    state: state({ importedNames: ['State Name'], importedOracleIds: ['state-id'] }),
  });

  assert.deepEqual(result.report.cards.map(entry => entry.raw.name), ['Free Card']);
  assert.equal(result.report.catalogSummary.deferredByReason['already-in-legacy-engine'], 1);
  assert.equal(result.report.catalogSummary.deferredByReason['already-imported-batch'], 6);
});

test('semantic gate odbija djelimične, kompleksne, dinamičke i višelinijske Oracle tekstove', () => {
  const cases = [
    [oracleCard('Partial Creature', 'partial', { oracle_text: 'Flying\nWhenever this creature attacks, draw a card.' }), 'oracle-needs-explicit-semantics'],
    [oracleCard('Complex Layout', 'complex', { layout: 'transform' }), 'complex-layout'],
    [oracleCard('Dynamic Body', 'dynamic', { power: '*', toughness: '*' }), 'dynamic-power-toughness'],
    [oracleCard('Multiline Spell', 'multi', {
      type_line: 'Sorcery', power: undefined, toughness: undefined,
      oracle_text: 'Draw two cards.\nYou gain 2 life.', mana_cost: '{2}{U}',
    }), 'spell-needs-explicit-semantics'],
    [oracleCard('Unknown Permanent', 'walker', {
      type_line: 'Planeswalker', power: undefined, toughness: undefined, loyalty: '3', oracle_text: '',
    }), 'noncreature-needs-explicit-semantics'],
  ];

  for (const [card, reason] of cases) {
    assert.deepEqual(semanticClass(card), { reason }, card.name);
  }
});

test('limit i sequence validacija odbijaju nevalidan input i duplikat prije planiranja', () => {
  for (const value of [0, 501, 1.5, 'nope']) {
    assert.throws(() => validateLimit(value), /integer from 1 to 500/);
  }
  assert.equal(validateLimit('100'), 100);
  assert.throws(() => plan({ sequence: 0 }), /positive integer/);
  assert.throws(() => plan({
    state: state({ batches: [{ id: 'oracle-0014', sequence: 14 }] }),
  }), /oracle-0014 already exists/);
  assert.throws(() => plan({
    sequence: 14,
    state: state({ batches: [{ id: 'legacy-label', sequence: 14 }] }),
  }), /oracle-0014 already exists/);
});

test('mana-cost gate odbija nepoznat ili malformed simbol prije semantičke certifikacije', () => {
  for (const cost of ['{1}{S}', '{Q}', '{1}{W', '1{W}']) {
    assert.equal(validateManaCost(cost), false, cost);
    assert.deepEqual(semanticClass(oracleCard(`Bad ${cost}`, `bad-${cost}`, { mana_cost: cost })),
      { reason: 'unsupported-mana-cost' });
  }
  for (const cost of ['', '{0}', '{X}{R}{R}', '{W/U}', '{W/P}', '{2/R}', '{C}', '{WU}']) {
    assert.equal(validateManaCost(cost), true, cost || 'empty cost');
  }
});

test('runOracleImport povezuje dry-run/write argumente i sve injected dependency putanje', async () => {
  const directory = importerWorkspace();
  try {
    const ioCalls = [];
    const logs = [];
    const writeSteps = [];
    let fetchCalls = 0;
    const dependencies = {
      root: directory,
      fs: tracingFs(ioCalls),
      fetchOracleCards: async () => {
        fetchCalls++;
        return { bulk: bulk(SNAPSHOT_B), cards: [oracleCard('Wrapper Card', 'wrapper-id')] };
      },
      now: () => GENERATED_AT,
      console: { log: message => logs.push(message) },
      beforeWriteStep: step => writeSteps.push(step),
    };

    await assert.rejects(
      runOracleImport(['--limit=1', '--batch=14'], dependencies),
      /snapshot changed/,
      'wrapper forwards missing snapshot opt-in to the plan gate');

    const dryRun = await runOracleImport([
      '--limit=1', '--batch=14', '--accept-new-snapshot',
    ], dependencies);
    assert.equal(dryRun.id, 'oracle-0014');
    assert.equal(dryRun.sequence, 14);
    assert.equal(dryRun.report.cards.length, 1, '--limit reaches the planner');
    assert.equal(dryRun.report.generatedAt, GENERATED_AT, 'injected clock reaches report');
    assert.equal(dryRun.report.source.bulkUpdatedAt, SNAPSHOT_B, 'accepted injected snapshot reaches report');
    assert.equal(fs.existsSync(path.join(directory, 'src', 'oracle-batches', 'batch-0014.js')), false);
    assert.equal(fs.existsSync(path.join(directory, 'reports', 'oracle-import', 'batch-0014.json')), false);
    assert.equal(writeSteps.length, 0, 'dry-run never enters the writer');
    assert.ok(logs.some(message => message.includes('Batch oracle-0014: 1 cards')),
      'injected logger receives dry-run summary');
    assert.ok(ioCalls.includes('readFileSync') && ioCalls.includes('readdirSync'),
      'injected filesystem is used for state/data/reservation reads');

    logs.length = 0;
    const written = await runOracleImport([
      '--write', '--limit=1', '--batch=15', '--accept-new-snapshot',
    ], dependencies);
    const modulePath = path.join(directory, 'src', 'oracle-batches', 'batch-0015.js');
    const reportPath = path.join(directory, 'reports', 'oracle-import', 'batch-0015.json');
    const statePath = path.join(directory, 'reports', 'oracle-import', 'state.json');
    assert.equal(fs.readFileSync(modulePath, 'utf8'), moduleSource(written.report));
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')), written.report);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), written.nextState);
    assert.deepEqual(writeSteps, [
      'write-module-temp', 'write-report-temp', 'write-state-temp',
      'rename-module', 'rename-report', 'rename-state',
    ], 'beforeWriteStep is forwarded through every atomic writer stage');
    assert.equal(logs.filter(message => message.startsWith('Wrote ')).length, 3,
      'injected logger receives all write destinations');
    assert.equal(fetchCalls, 3, 'one rejected plan, one dry-run and one write each use injected fetch');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runOracleImport write preflight odbija postojeći module ili report prije fetcha', async t => {
  for (const existing of ['module', 'report']) {
    await t.test(existing, async () => {
      const directory = importerWorkspace();
      try {
        const modulePath = path.join(directory, 'src', 'oracle-batches', 'batch-0014.js');
        const reportPath = path.join(directory, 'reports', 'oracle-import', 'batch-0014.json');
        const existingPath = existing === 'module' ? modulePath : reportPath;
        fs.mkdirSync(path.dirname(existingPath), { recursive: true });
        fs.writeFileSync(existingPath, 'sentinel');
        let fetchCalls = 0;
        await assert.rejects(runOracleImport(['--write', '--limit=1', '--batch=14'], {
          root: directory,
          fetchOracleCards: async () => {
            fetchCalls++;
            return { bulk: bulk(), cards: [oracleCard('Should Not Fetch', 'no-fetch')] };
          },
          console: { log: () => {} },
        }), /output already exists/);
        assert.equal(fetchCalls, 0, `${existing}: preflight runs before fetch`);
        assert.equal(fs.readFileSync(existingPath, 'utf8'), 'sentinel', `${existing}: existing output is untouched`);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test('atomic writer rollbacka svaki injected failure i tek zadnjim renameom mijenja state', async t => {
  const stages = [
    'write-module-temp',
    'write-report-temp',
    'write-state-temp',
    'rename-module',
    'rename-report',
    'rename-state',
  ];

  for (const stage of stages) {
    await t.test(stage, () => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-importer-'));
      try {
        const modulePath = path.join(directory, 'src', 'oracle-batches', 'batch-0014.js');
        const reportPath = path.join(directory, 'reports', 'oracle-import', 'batch-0014.json');
        const statePath = path.join(directory, 'reports', 'oracle-import', 'state.json');
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        const oldState = '{"sentinel":"old-state"}\n';
        fs.writeFileSync(statePath, oldState);
        const result = plan();

        assert.throws(() => writeImportPlanAtomic({
          modulePath, reportPath, statePath, report: result.report, nextState: result.nextState,
        }, {
          beforeStep: current => {
            if (current === stage) throw new Error(`injected ${stage}`);
          },
        }), new RegExp(`injected ${stage}`));

        assert.equal(fs.existsSync(modulePath), false, `${stage}: no orphan runtime module`);
        assert.equal(fs.existsSync(reportPath), false, `${stage}: no orphan report`);
        assert.equal(fs.readFileSync(statePath, 'utf8'), oldState, `${stage}: original state preserved`);
        assert.deepEqual(allFiles(directory).filter(file => file.endsWith('.tmp')), [], `${stage}: temps cleaned`);
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});

test('atomic writer uspješno objavljuje runtime/report paritet i ne prepisuje postojeći output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-importer-'));
  try {
    const modulePath = path.join(directory, 'src', 'oracle-batches', 'batch-0014.js');
    const reportPath = path.join(directory, 'reports', 'oracle-import', 'batch-0014.json');
    const statePath = path.join(directory, 'reports', 'oracle-import', 'state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{"sentinel":"old-state"}\n');
    const result = plan();

    writeImportPlanAtomic({
      modulePath, reportPath, statePath, report: result.report, nextState: result.nextState,
    });
    assert.equal(fs.readFileSync(modulePath, 'utf8'), moduleSource(result.report));
    assert.deepEqual(JSON.parse(fs.readFileSync(reportPath, 'utf8')), result.report);
    assert.deepEqual(JSON.parse(fs.readFileSync(statePath, 'utf8')), result.nextState);
    assert.deepEqual(allFiles(directory).filter(file => file.endsWith('.tmp')), []);

    const moduleBefore = fs.readFileSync(modulePath, 'utf8');
    const stateBefore = fs.readFileSync(statePath, 'utf8');
    assert.throws(() => writeImportPlanAtomic({
      modulePath, reportPath, statePath, report: result.report, nextState: result.nextState,
    }), /output already exists/);
    assert.equal(fs.readFileSync(modulePath, 'utf8'), moduleBefore);
    assert.equal(fs.readFileSync(statePath, 'utf8'), stateBefore);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
