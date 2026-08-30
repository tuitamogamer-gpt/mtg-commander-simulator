import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function deckText(extra = 'Sol Ring') {
  return [
    'Commander',
    '1 Ashling, the Limitless *CMDR*',
    '',
    'Deck',
    `1 ${extra}`,
    '20 Plains',
    '20 Island',
    '20 Swamp',
    '19 Mountain',
    '19 Forest',
  ].join('\n');
}

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function recordFor(MTG, name, id) {
  const imported = MTG.importCommanderDeck(deckText(), { name });
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  return MTG.createImportedDeckRecord(imported, {
    id,
    now: '2026-08-30T05:00:00.000Z',
  });
}

test('guest My Library survives engine reload and starts from canonical rows without another paste', () => {
  const MTG = loadEngine();
  const storage = new FakeStorage();
  const record = recordFor(MTG, 'Persistent Oracle Lab', 'deck-persistent-oracle-lab');

  MTG.upsertGuestImportedDeck(record, { storage });
  assert.equal(MTG.DECKS[record.name]?.custom, true);
  assert.equal(MTG.getImportedDeckLibrary().entries[0].ready, true);

  MTG.initData(MTG.RAW_DATA);
  assert.equal(MTG.DECKS[record.name], undefined, 'runtime reset removes transient registration');
  const rehydrated = MTG.loadGuestImportedDeckLibrary({ storage });
  assert.equal(rehydrated.source, 'guest');
  assert.equal(rehydrated.entries.length, 1);
  assert.equal(rehydrated.entries[0].ready, true);
  assert.equal(MTG.DECKS[record.name]?.custom, true, 'canonical library record re-registers the deck');

  const latest = MTG.validateImportedDeckRecord(rehydrated.entries[0].record);
  assert.equal(latest.ok, true);
  const game = new MTG.Game({ seed: 17, paced: false, maxTurns: 2 });
  const player = game.addPlayer('Library player', latest.deck, null, false);
  game.buildDeck(player, latest.deck, MTG.DEFS, latest.commanders);
  assert.equal(player.command[0].name, 'Ashling, the Limitless');
  assert.equal(player.library.length, 99);

  assert.equal(MTG.removeGuestImportedDeck(record.id, { storage }), true);
  MTG.initData(MTG.RAW_DATA);
  assert.equal(MTG.loadGuestImportedDeckLibrary({ storage }).entries.length, 0);
  assert.equal(MTG.DECKS[record.name], undefined);
});

test('hiding the library during an active game preserves its runtime custom deck registration', () => {
  const MTG = loadEngine();
  const storage = new FakeStorage();
  const record = recordFor(MTG, 'Active Custom Table', 'deck-active-custom-table');
  MTG.upsertGuestImportedDeck(record, { storage });

  const hidden = MTG.hideImportedDeckLibrary({ source: 'loading' });
  assert.equal(hidden.source, 'loading');
  assert.equal(hidden.error, null);
  assert.equal(hidden.entries.length, 0);
  assert.equal(MTG.DECKS[record.name]?.custom, true);

  MTG.clearImportedDeckLibraryRegistrations();
  assert.equal(MTG.DECKS[record.name], undefined, 'hidden registrations remain tracked for later cleanup');
});

test('unsupported, malformed and built-in-collision decks never mutate storage or runtime', () => {
  const MTG = loadEngine();
  MTG.initData(MTG.RAW_DATA);
  const storage = new FakeStorage();
  const baseline = recordFor(MTG, 'Safe Library Deck', 'deck-safe-library-deck');
  MTG.upsertGuestImportedDeck(baseline, { storage });
  const before = storage.getItem(MTG.IMPORTED_LIBRARY_KEY);

  const unsupported = structuredClone(baseline);
  unsupported.id = 'deck-unsupported-card';
  unsupported.name = 'Unsupported Library Deck';
  unsupported.cards = unsupported.cards.map(row => row.name === 'Sol Ring' ? { ...row, name: 'Agitator Ant' } : row);
  const unsupportedValidation = MTG.validateImportedDeckRecord(unsupported);
  assert.equal(unsupportedValidation.ok, false);
  assert.ok(unsupportedValidation.errors.some(error => error.code === 'engine-unsupported' && error.card === 'Agitator Ant'));
  assert.throws(() => MTG.upsertGuestImportedDeck(unsupported, { storage }), /certified|supported/i);
  assert.equal(storage.getItem(MTG.IMPORTED_LIBRARY_KEY), before);
  assert.equal(MTG.DECKS[unsupported.name], undefined);

  const collision = recordFor(MTG, 'Quick Draw', 'deck-built-in-collision');
  assert.throws(() => MTG.upsertGuestImportedDeck(collision, { storage }), /built-in deck/i);
  assert.equal(storage.getItem(MTG.IMPORTED_LIBRARY_KEY), before);
  assert.equal(MTG.DECKS['Quick Draw'].custom, undefined);

  const malformed = { ...baseline, id: 'bad', cards: baseline.cards.slice(0, 2) };
  assert.throws(() => MTG.upsertGuestImportedDeck(malformed, { storage }));
  assert.equal(storage.getItem(MTG.IMPORTED_LIBRARY_KEY), before);
});

test('saved records require strict canonical Commander rows and control-free bounded text', () => {
  const MTG = loadEngine();
  MTG.initData(MTG.RAW_DATA);
  const baseline = recordFor(MTG, 'Strict Record Probe', 'deck-strict-record-probe');
  const cases = [
    {
      label: 'untrimmed deck name',
      code: 'library-name',
      mutate(record) { record.name = ` ${record.name}`; },
    },
    {
      label: 'control character in deck name',
      code: 'library-name',
      mutate(record) { record.name += '\u007f'; },
    },
    {
      label: 'control character in commander name',
      code: 'library-commanders',
      mutate(record) { record.commanders[0] += '\u0007'; },
    },
    {
      label: 'overlong commander name',
      code: 'library-commanders',
      mutate(record) { record.commanders[0] = 'C'.repeat(161); },
    },
    {
      label: 'duplicate commander name',
      code: 'library-commanders',
      mutate(record) { record.commanders.push(record.commanders[0]); },
    },
    {
      label: 'untrimmed card name',
      code: 'library-card-row',
      mutate(record) { record.cards.find(row => row.name === 'Sol Ring').name += ' '; },
    },
    {
      label: 'control character in card name',
      code: 'library-card-row',
      mutate(record) { record.cards.find(row => row.name === 'Sol Ring').name += '\u0001'; },
    },
    {
      label: 'overlong card name',
      code: 'library-card-row',
      mutate(record) { record.cards.find(row => row.name === 'Sol Ring').name = 'C'.repeat(161); },
    },
    {
      label: 'listed commander moved to Main',
      code: 'library-commander-row',
      mutate(record) { record.cards.find(row => row.name === record.commanders[0]).section = 'Main'; },
    },
    {
      label: 'unlisted card placed in Commander',
      code: 'library-unexpected-commander',
      mutate(record) { record.cards.find(row => row.name === 'Sol Ring').section = 'Commander'; },
    },
  ];

  for (const probe of cases) {
    const record = structuredClone(baseline);
    probe.mutate(record);
    const validation = MTG.validateImportedDeckRecord(record);
    assert.equal(validation.ok, false, probe.label);
    assert.ok(validation.errors.some(error => error.code === probe.code), `${probe.label}: expected ${probe.code}`);
  }
});

test('corrupt guest envelopes and id-less records can be reset or removed without throwing', () => {
  const MTG = loadEngine();
  MTG.initData(MTG.RAW_DATA);
  const storage = new FakeStorage();
  const valid = recordFor(MTG, 'Corrupt Record Survivor', 'deck-corrupt-record-survivor');

  storage.setItem(MTG.IMPORTED_LIBRARY_KEY, JSON.stringify({
    schema: MTG.IMPORTED_LIBRARY_SCHEMA,
    records: [null, 7, { schema: MTG.IMPORTED_DECK_SCHEMA, name: 'Missing identity' }, valid],
  }));
  const loaded = MTG.loadGuestImportedDeckLibrary({ storage });
  assert.equal(loaded.entries.length, 4);
  assert.deepEqual(Array.from(loaded.entries, entry => entry.ready), [false, false, false, true]);
  assert.doesNotThrow(() => MTG.removeGuestImportedDeck('', { storage }));
  const afterCorruptRemoval = MTG.readGuestImportedDeckRecords(storage);
  assert.equal(afterCorruptRemoval.ok, true);
  assert.deepEqual(Array.from(afterCorruptRemoval.records, record => record.id), [valid.id]);
  assert.equal(MTG.getImportedDeckLibrary().entries.length, 1);
  assert.equal(MTG.getImportedDeckLibrary().entries[0].ready, true);

  storage.setItem(MTG.IMPORTED_LIBRARY_KEY, JSON.stringify({ schema: 'unknown-library/v9', records: null }));
  assert.equal(MTG.loadGuestImportedDeckLibrary({ storage }).error, 'Saved deck library uses an unsupported format.');
  assert.equal(MTG.removeGuestImportedDeck('', { storage }), true);
  assert.deepEqual(JSON.parse(storage.getItem(MTG.IMPORTED_LIBRARY_KEY)), {
    schema: MTG.IMPORTED_LIBRARY_SCHEMA,
    records: [],
  });
  assert.equal(MTG.getImportedDeckLibrary().entries.length, 0);
});

test('rehydration quarantines stale decks and failed writes preserve the prior library', () => {
  const MTG = loadEngine();
  MTG.initData(MTG.RAW_DATA);
  const storage = new FakeStorage();
  const baseline = recordFor(MTG, 'Stale Gate Probe', 'deck-stale-gate-probe');
  MTG.upsertGuestImportedDeck(baseline, { storage });
  const before = storage.getItem(MTG.IMPORTED_LIBRARY_KEY);

  const originalEligibility = MTG.CARD_CATALOG['Sol Ring'].deckImportEligible;
  MTG.CARD_CATALOG['Sol Ring'].deckImportEligible = false;
  const stale = MTG.loadGuestImportedDeckLibrary({ storage });
  assert.equal(stale.entries[0].ready, false);
  assert.ok(stale.entries[0].issues.some(error => error.code === 'engine-unsupported'));
  assert.equal(MTG.DECKS[baseline.name], undefined, 'stale deck is visible but never registered');
  MTG.CARD_CATALOG['Sol Ring'].deckImportEligible = originalEligibility;
  MTG.loadGuestImportedDeckLibrary({ storage });
  assert.equal(MTG.DECKS[baseline.name]?.custom, true);

  const failingStorage = {
    getItem: key => storage.getItem(key),
    setItem() { throw new Error('quota denied'); },
  };
  const another = recordFor(MTG, 'Write Failure Probe', 'deck-write-failure-probe');
  assert.throws(() => MTG.upsertGuestImportedDeck(another, { storage: failingStorage }), /quota denied/);
  assert.equal(storage.getItem(MTG.IMPORTED_LIBRARY_KEY), before);
  assert.equal(MTG.DECKS[baseline.name]?.custom, true);
  assert.equal(MTG.DECKS[another.name], undefined);
});
