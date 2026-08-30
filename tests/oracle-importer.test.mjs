import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

import {
  collectReservedOracleCards,
  createImportPlan,
  fetchOracleCardsFromGzip,
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
  assert.throws(() => plan({
    bulk: bulk(SNAPSHOT_B),
    acceptNewSnapshot: true,
    expectedSnapshot: SNAPSHOT_A,
  }), new RegExp(`expected exactly ${SNAPSHOT_A.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  const unchanged = plan({ expectedSnapshot: SNAPSHOT_A });
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

test('semantic gate odbija djelimične, kompleksne i dinamičke Oracle tekstove', () => {
  const cases = [
    [oracleCard('Partial Creature', 'partial', {
      oracle_text: 'Flying\nWhenever this creature attacks, if you control an artifact, draw a card.',
    }), 'oracle-needs-explicit-semantics'],
    [oracleCard('Complex Layout', 'complex', { layout: 'transform' }), 'complex-layout'],
    [oracleCard('Dynamic Body', 'dynamic', { power: '*', toughness: '*' }), 'dynamic-power-toughness'],
    [oracleCard('Unknown Permanent', 'walker', {
      type_line: 'Planeswalker', power: undefined, toughness: undefined, loyalty: '3', oracle_text: '',
    }), 'noncreature-needs-explicit-semantics'],
  ];

  for (const [card, reason] of cases) {
    assert.deepEqual(semanticClass(card), { reason }, card.name);
  }
});

test('v4 combat statics stay fail-closed while another-target and your-turn contracts remain exact', () => {
  for (const oracle_text of [
    'This creature can block an additional creature each combat.',
    'This creature can block any number of creatures.',
    "This creature can't be blocked by more than one creature.",
    "This creature can't attack or block alone.",
    'This creature must be blocked if able.',
  ]) {
    assert.deepEqual(
      semanticClass(oracleCard(`Unsupported ${oracle_text}`, `unsupported-${oracle_text}`, { oracle_text })),
      { reason: 'oracle-needs-explicit-semantics' },
      oracle_text,
    );
  }

  const yourTurn = semanticClass(oracleCard('Daylight Beast', 'daylight-beast', {
    oracle_text: 'During your turn, this creature gets +2/+0.',
  }));
  assert.equal(yourTurn.implementation[0].kind, 'generic-static');
  assert.equal(yourTurn.implementation[0].yourTurnOnly, true);
  assert.equal(yourTurn.implementation[0].power, 2);

  const another = semanticClass(oracleCard('Other Mentor', 'other-mentor', {
    oracle_text: 'When this creature enters, put one +1/+1 counter on another target creature you control.',
  }));
  assert.equal(another.implementation[0].targets[0].excludeSelf, true);

  const recursion = semanticClass(oracleCard('Other Salvager', 'other-salvager', {
    oracle_text: 'When this creature dies, return another target artifact card from your graveyard to your hand.',
  }));
  assert.equal(recursion.implementation[0].targets[0].excludeSelf, true);
});

test('spell parser prihvata samo potpuno prepoznat tekst i v4 čuva više ciljnih operacija', () => {
  const accepted = semanticClass(oracleCard('Multiline Spell', 'multi', {
    type_line: 'Sorcery', power: undefined, toughness: undefined,
    oracle_text: 'Draw two cards.\nYou gain 2 life.', mana_cost: '{2}{U}',
  }));
  assert.equal(accepted.semanticClass, 'spell-template');
  assert.deepEqual(accepted.implementation, [
    { kind: 'spell-draw', n: 2, contract: 'spell-draw' },
    { kind: 'spell-life-gain', n: 2, contract: 'spell-life-gain' },
  ]);

  const twoTarget = semanticClass(oracleCard('Two Target Spell', 'two-target-multi', {
    type_line: 'Instant', power: undefined, toughness: undefined,
    oracle_text: 'Destroy target creature.\nTap target creature.', mana_cost: '{2}{U}',
  }));
  assert.equal(twoTarget.semanticClass, 'spell-v4-template');
  assert.equal(twoTarget.implementation[0].kind, 'spell-v4');
  assert.equal(twoTarget.implementation[0].targets.length, 2);
  assert.deepEqual(twoTarget.implementation[0].effects.map(effect => effect.kind), ['destroy', 'tap']);

  const rejected = [
    oracleCard('Conditional Spell', 'conditional-multi', {
      type_line: 'Sorcery', power: undefined, toughness: undefined,
      oracle_text: 'Draw two cards.\nIf you control a creature, you gain 2 life.', mana_cost: '{2}{U}',
    }),
    oracleCard('Partial Spell', 'partial-multi', {
      type_line: 'Sorcery', power: undefined, toughness: undefined,
      oracle_text: 'Draw two cards.\nCreate a token.', mana_cost: '{2}{U}',
    }),
  ];
  for (const card of rejected) {
    assert.deepEqual(semanticClass(card), { reason: 'spell-needs-explicit-semantics' }, card.name);
  }
});

test('spell-pump parser razlikuje +X i -X, čuva signed descriptor i fail-closed odbija malformed X', () => {
  const plus = semanticClass(oracleCard('Positive X Pump', 'positive-x-pump', {
    type_line: 'Instant', power: undefined, toughness: undefined,
    oracle_text: 'Target creature gets +X/+0 until end of turn.', mana_cost: '{X}{R}',
  }));
  assert.equal(plus.semanticClass, 'spell-template');
  assert.deepEqual(plus.implementation, [{
    kind: 'spell-pump', power: 'X', toughness: 0, keywords: [], controller: 'any',
    attacking: false, contract: 'spell-pump',
  }]);

  const negativeCard = oracleCard('Negative X Pump', 'negative-x-pump', {
    type_line: 'Instant', power: undefined, toughness: undefined,
    oracle_text: 'Target creature gets -X/-0 until end of turn.', mana_cost: '{X}{B}',
  });
  const minus = semanticClass(negativeCard);
  assert.equal(minus.semanticClass, 'spell-template');
  assert.equal(minus.implementation[0].power, '-X', 'negative X is never normalized into a positive X');
  assert.equal(Object.is(minus.implementation[0].toughness, -0), true, 'parser preserves the printed negative-zero token');
  assert.deepEqual(Object.assign({}, minus.implementation[0], { toughness: 0 }), {
    kind: 'spell-pump', power: '-X', toughness: 0, keywords: [], controller: 'any',
    attacking: false, contract: 'spell-pump',
  });

  const generated = plan({ cards: [negativeCard] });
  assert.equal(generated.report.cards[0].implementation[0].power, '-X');
  assert.match(moduleSource(generated.report), /"power": "-X"/,
    'generated runtime descriptor retains the signed X instead of silently changing its meaning');

  for (const [index, text] of [
    'Target creature gets X/+0 until end of turn.',
    'Target creature gets +Y/+0 until end of turn.',
    'Target creature gets +-X/+0 until end of turn.',
    'Target creature gets --X/-0 until end of turn.',
    'Target creature gets -X/X until end of turn.',
    'Target creature gets -X/-X until end of turn.',
  ].entries()) {
    const malformed = semanticClass(oracleCard(`Malformed X Pump ${index}`, `malformed-x-pump-${index}`, {
      type_line: 'Instant', power: undefined, toughness: undefined,
      oracle_text: text, mana_cost: '{X}{B}',
    }));
    assert.deepEqual(malformed, { reason: 'spell-needs-explicit-semantics' }, text);
  }
});

test('spell modifier parser je fail-closed za flashback, rebound, suspend, convoke, cascade, storm i cycling', () => {
  const cases = [
    {
      name: 'Flashback Spell', line: 'Flashback {2}{U}',
      operation: { kind: 'mechanic-flashback', cost: '{2}{U}', speed: 'sorcery', contract: 'mechanic-flashback' },
      malformed: 'Flashback {S}',
    },
    {
      name: 'Rebound Spell', line: 'Rebound',
      operation: { kind: 'mechanic-rebound', contract: 'mechanic-rebound' },
      malformed: 'Rebound.',
    },
    {
      name: 'Suspend Spell', line: 'Suspend 3—{1}{U}',
      operation: { kind: 'mechanic-suspend', n: 3, cost: '{1}{U}', contract: 'mechanic-suspend' },
      malformed: 'Suspend 0—{1}{U}',
    },
    {
      name: 'Convoke Spell', line: 'Convoke',
      operation: { kind: 'mechanic-convoke', contract: 'mechanic-convoke' },
      malformed: 'Convoke.',
    },
    {
      name: 'Cascade Spell', line: 'Cascade',
      operation: { kind: 'mechanic-cascade', contract: 'mechanic-cascade' },
      malformed: 'Cascade 2',
    },
    {
      name: 'Storm Spell', line: 'Storm',
      operation: { kind: 'mechanic-storm', contract: 'mechanic-storm' },
      malformed: 'Storm.',
    },
    {
      name: 'Cycling Spell', line: 'Cycling {2}',
      operation: { kind: 'cycling', cost: '{2}', contract: 'cycling-ability' },
      malformed: 'Cycling {S}',
    },
  ];

  for (const [index, entry] of cases.entries()) {
    const exact = semanticClass(oracleCard(entry.name, `modifier-${index}`, {
      type_line: 'Sorcery', power: undefined, toughness: undefined,
      oracle_text: `Draw a card.\n${entry.line}`, mana_cost: '{2}{U}',
    }));
    assert.equal(exact.semanticClass, 'spell-template', entry.name);
    assert.deepEqual(exact.implementation, [
      { kind: 'spell-draw', n: 1, contract: 'spell-draw' },
      entry.operation,
    ], entry.name);

    const malformed = semanticClass(oracleCard(`${entry.name} Malformed`, `modifier-bad-${index}`, {
      type_line: 'Sorcery', power: undefined, toughness: undefined,
      oracle_text: `Draw a card.\n${entry.malformed}`, mana_cost: '{2}{U}',
    }));
    assert.deepEqual(malformed, { reason: 'spell-needs-explicit-semantics' }, `${entry.name} malformed`);
  }
});

test('morph, disguise i composite keyword/protection parser prihvataju samo tačnu gramatiku', () => {
  const cases = [
    {
      card: oracleCard('Morph Adept', 'morph', { oracle_text: 'Morph {2}{U}' }),
      keywords: [],
      operation: { kind: 'mechanic-morph', cost: '{2}{U}', contract: 'mechanic-morph' },
    },
    {
      card: oracleCard('Disguise Adept', 'disguise', { oracle_text: 'Disguise {2}{U}' }),
      keywords: [],
      operation: { kind: 'mechanic-disguise', cost: '{2}{U}', contract: 'mechanic-disguise' },
    },
    {
      card: oracleCard('Protected Adept', 'composite-protection', {
        oracle_text: 'Flying, protection from white',
      }),
      keywords: ['flying'],
      operation: { kind: 'protection-from', from: 'white', contract: 'protection-static' },
    },
  ];
  for (const entry of cases) {
    const result = semanticClass(entry.card);
    assert.equal(result.semanticClass, 'creature-template', entry.card.name);
    assert.deepEqual(result.implementedKeywords, entry.keywords, entry.card.name);
    assert.deepEqual(result.implementation, [entry.operation], entry.card.name);
  }

  const twoTreasures = semanticClass(oracleCard('Two Treasures', 'two-treasures', {
    oracle_text: 'When Two Treasures enters, create two Treasure tokens.',
  }));
  assert.equal(twoTreasures.semanticClass, 'creature-template');
  assert.deepEqual(twoTreasures.implementation, [{
    kind: 'generic-trigger',
    event: 'etb',
    effects: [{ action: 'token-key', who: 'you', n: 2, tokenKey: 'treasure' }],
    targets: [],
    optional: false,
    contract: 'generic-trigger-effect',
    eventFilter: 'self',
  }]);

  const rejected = [
    oracleCard('Bad Morph', 'bad-morph', { oracle_text: 'Morph {S}' }),
    oracleCard('Bad Disguise', 'bad-disguise', { oracle_text: 'Disguise 2{U}' }),
    oracleCard('Bad Protection', 'bad-protection', { oracle_text: 'Flying, protection from creatures' }),
    oracleCard('Partial Composite', 'partial-composite', {
      oracle_text: 'Flying, protection from white, whenever this creature attacks, draw a card.',
    }),
  ];
  for (const card of rejected) {
    assert.deepEqual(semanticClass(card), { reason: 'oracle-needs-explicit-semantics' }, card.name);
  }
});

test('devoid i uncounterable parser su tačni i odbijaju parafraze', () => {
  const exact = semanticClass(oracleCard('Void Formula', 'void-formula', {
    type_line: 'Instant', power: undefined, toughness: undefined,
    oracle_text: "Devoid\nThis spell can't be countered.\nDraw a card.", mana_cost: '{2}{U}',
  }));
  assert.equal(exact.semanticClass, 'spell-template');
  assert.deepEqual(exact.implementation, [
    { kind: 'mechanic-devoid', contract: 'mechanic-devoid' },
    { kind: 'mechanic-uncounterable', contract: 'mechanic-uncounterable' },
    { kind: 'spell-draw', n: 1, contract: 'spell-draw' },
  ]);

  for (const [name, line] of [
    ['Devoid Punctuation', 'Devoid.'],
    ['Uncounterable Paraphrase', 'This spell cannot be countered.'],
  ]) {
    assert.deepEqual(semanticClass(oracleCard(name, name.toLowerCase().replaceAll(' ', '-'), {
      type_line: 'Instant', power: undefined, toughness: undefined,
      oracle_text: `${line}\nDraw a card.`, mana_cost: '{2}{U}',
    })), { reason: 'spell-needs-explicit-semantics' }, name);
  }
});

test('novi creature trigger parser mapira oba loot reda, optional, Treasure, discard, dies-life i noncreature counter', () => {
  const cases = [
    {
      name: 'Discard First', text: 'When Discard First enters, discard a card. If you do, draw a card.',
      operation: { kind: 'etb-loot', order: 'discard-draw', optional: false, contract: 'etb-loot' },
    },
    {
      name: 'Optional Discard', text: 'When Optional Discard enters, you may discard a card. If you do, draw a card.',
      operation: { kind: 'etb-loot', order: 'discard-draw', optional: true, contract: 'etb-loot' },
    },
    {
      name: 'Draw First', text: 'When Draw First enters, draw a card, then discard a card.',
      operation: { kind: 'etb-loot', order: 'draw-discard', optional: false, contract: 'etb-loot' },
    },
    {
      name: 'Treasure Maker', text: 'When Treasure Maker enters, create a Treasure token.',
      operation: { kind: 'etb-treasure', n: 1, contract: 'etb-treasure' },
    },
    {
      name: 'Table Discarder', text: 'When Table Discarder enters, each opponent discards a card.',
      operation: { kind: 'etb-each-opponent-discard', n: 1, contract: 'etb-each-opponent-discard' },
    },
    {
      name: 'Death Healer', text: 'When Death Healer dies, you gain 3 life.',
      operation: { kind: 'dies-life-gain', n: 3, contract: 'dies-life-gain' },
    },
    {
      name: 'Spell Grower',
      text: 'Whenever you cast a noncreature spell, put a +1/+1 counter on Spell Grower.',
      operation: {
        kind: 'noncreature-cast-counter-self', counter: '+1/+1', n: 1,
        contract: 'noncreature-cast-counter-self',
      },
    },
  ];

  for (const [index, entry] of cases.entries()) {
    const result = semanticClass(oracleCard(entry.name, `creature-trigger-${index}`, { oracle_text: entry.text }));
    assert.equal(result.semanticClass, 'creature-template', entry.name);
    assert.deepEqual(result.implementation, [entry.operation], entry.name);
    assert.deepEqual(result.oracleContracts, [entry.operation.contract], entry.name);
  }

  const rejected = [
    oracleCard('Loose Loot', 'loose-loot', {
      oracle_text: 'When Loose Loot enters, you may discard a card, then draw a card.',
    }),
    oracleCard('Everyone Discards', 'everyone-discards', {
      oracle_text: 'When Everyone Discards enters, each player discards a card.',
    }),
    oracleCard('Conditional Death', 'conditional-death', {
      oracle_text: 'When Conditional Death dies, if it was attacking, you gain 3 life.',
    }),
    oracleCard('Broad Grower', 'broad-grower', {
      oracle_text: 'Whenever you cast a spell, put a +1/+1 counter on Broad Grower.',
    }),
  ];
  for (const card of rejected) {
    assert.deepEqual(semanticClass(card), { reason: 'oracle-needs-explicit-semantics' }, card.name);
  }
});

test('isti source feed odbija duplikat imena i Oracle ID-a prije izbora batcha', () => {
  const result = plan({
    limit: 3,
    cards: [
      oracleCard('Duplicate Name', 'name-original'),
      oracleCard('Duplicate Name', 'name-alias'),
      oracleCard('Oracle Original', 'shared-oracle-id'),
      oracleCard('Oracle Alias', 'shared-oracle-id'),
      oracleCard('Unique Card', 'unique-id'),
    ],
  });

  assert.equal(result.report.catalogSummary.deferredByReason['duplicate-in-source-feed'], 2);
  assert.deepEqual(result.report.catalogSummary.deferredExamples['duplicate-in-source-feed'], [
    'Duplicate Name',
    'Oracle Alias',
  ]);
  assert.deepEqual(result.report.cards.map(entry => entry.raw.name), [
    'Duplicate Name',
    'Oracle Original',
    'Unique Card',
  ]);
  assert.equal(new Set(result.report.cards.map(entry => entry.raw.name)).size, 3);
  assert.equal(new Set(result.report.cards.map(entry => entry.oracleId)).size, 3);
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

    await assert.rejects(
      runOracleImport([
        '--limit=1', '--batch=14', '--accept-new-snapshot', `--expected-snapshot=${SNAPSHOT_A}`,
      ], dependencies),
      /expected exactly/,
      'wrapper forwards an exact snapshot pin to the plan gate');

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
    assert.equal(fetchCalls, 4, 'two rejected plans, one dry-run and one write each use injected fetch');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('pinned gzip loader verifies SHA-256 and preserves exact snapshot provenance', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-pinned-source-'));
  const sourceFile = path.join(directory, 'oracle.jsonl.gz');
  try {
    const payload = `${JSON.stringify(oracleCard('Pinned Card', 'pinned-card'))}\n`;
    const compressed = gzipSync(payload);
    fs.writeFileSync(sourceFile, compressed);
    const sha256 = createHash('sha256').update(compressed).digest('hex');
    const loaded = await fetchOracleCardsFromGzip(sourceFile, bulk(), sha256.toUpperCase());
    assert.equal(loaded.cards.length, 1);
    assert.equal(loaded.cards[0].name, 'Pinned Card');
    assert.equal(loaded.bulk.updated_at, SNAPSHOT_A);
    assert.equal(loaded.bulk.sha256, sha256);
    await assert.rejects(
      fetchOracleCardsFromGzip(sourceFile, bulk(), '0'.repeat(64)),
      /SHA-256 mismatch/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('runOracleImport reads a pinned local gzip without network and records checksum', async () => {
  const directory = importerWorkspace();
  const sourceFile = path.join(directory, 'oracle.jsonl.gz');
  try {
    const compressed = gzipSync(`${JSON.stringify(oracleCard('Pinned Wrapper Card', 'pinned-wrapper'))}\n`);
    fs.writeFileSync(sourceFile, compressed);
    const sha256 = createHash('sha256').update(compressed).digest('hex');
    const result = await runOracleImport([
      '--limit=1', '--batch=14', `--source-file=${sourceFile}`,
      '--source-bulk-id=bulk-oracle-test', `--source-updated-at=${SNAPSHOT_A}`,
      `--source-sha256=${sha256}`, `--expected-snapshot=${SNAPSHOT_A}`,
    ], {
      root: directory,
      now: () => GENERATED_AT,
      console: { log: () => {} },
    });
    assert.equal(result.report.cards[0].raw.name, 'Pinned Wrapper Card');
    assert.equal(result.report.source.bulkSha256, sha256);
    assert.equal(result.nextState.source.bulkSha256, sha256);
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
