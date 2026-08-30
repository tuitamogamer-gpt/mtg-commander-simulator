import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function nextCohortDeckText(MTG) {
  const names = MTG.ORACLE_BATCHES
    .filter(batch => batch.sequence >= 27 && batch.sequence <= 46)
    .flatMap(batch => batch.cards.map(entry => entry.raw.name));
  assert.equal(names.length, 2000);
  assert.ok(names.includes('Sliver Hivelord'), 'the pinned cohort supplies a five-color commander');
  const main = names.filter(name => name !== 'Sliver Hivelord').slice(0, 99);
  assert.equal(new Set(main).size, 99);
  return [
    'Commander',
    '1 Sliver Hivelord *CMDR*',
    '',
    'Deck',
    ...main.map(name => `1 ${name}`),
  ].join('\n');
}

test('a 100-card deck made only from batches 0027-0046 imports, persists, and reloads without another paste', () => {
  const MTG = loadEngine();
  MTG.initData(MTG.RAW_DATA);
  const imported = MTG.importCommanderDeck(nextCohortDeckText(MTG), {
    name: 'Oracle V4 Next 2000 Library',
  });
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  assert.equal(imported.summary.inputCards, 100);
  assert.equal(imported.summary.resolvedCards, 100);
  assert.equal(imported.summary.engineCertified, 100);
  assert.equal(imported.interactions.ready, true);
  assert.equal(imported.interactions.batchCards, 100);
  assert.deepEqual(Array.from(imported.commanders), ['Sliver Hivelord']);

  const record = MTG.createImportedDeckRecord(imported, {
    id: 'deck-v4-next-2000-library',
    now: '2026-08-30T23:30:00.000Z',
  });
  const storage = new FakeStorage();
  MTG.upsertGuestImportedDeck(record, { storage });
  const savedPayload = storage.getItem(MTG.IMPORTED_LIBRARY_KEY);
  assert.ok(savedPayload);

  MTG.initData(MTG.RAW_DATA);
  assert.equal(MTG.DECKS[record.name], undefined, 'transient custom registration is cleared');
  const reloaded = MTG.loadGuestImportedDeckLibrary({ storage });
  assert.equal(reloaded.entries.length, 1);
  assert.equal(reloaded.entries[0].ready, true);
  assert.equal(reloaded.entries[0].record.id, record.id);

  const latest = MTG.validateImportedDeckRecord(reloaded.entries[0].record);
  assert.equal(latest.ok, true);
  const game = new MTG.Game({ seed: 460027, paced: false, maxTurns: 2 });
  const player = game.addPlayer('V4 library pilot', latest.deck, null, false);
  game.buildDeck(player, latest.deck, MTG.DEFS, latest.commanders);
  assert.equal(player.command[0].name, 'Sliver Hivelord');
  assert.equal(player.library.length, 99);
  assert.equal(player.library.every(card => {
    const sequence = Number((MTG.CARD_CATALOG[card.name].engineBatch || '').replace('oracle-', ''));
    return sequence >= 27 && sequence <= 46;
  }), true, 'every library card comes from the new cohort');

  const unsupported = structuredClone(reloaded.entries[0].record);
  unsupported.id = 'deck-v4-unsupported-mutation';
  unsupported.name = 'Oracle V4 Unsupported Mutation';
  const replaceIndex = unsupported.cards.findIndex(row => row.name !== 'Sliver Hivelord');
  unsupported.cards[replaceIndex] = { ...unsupported.cards[replaceIndex], name: 'Agitator Ant' };
  assert.equal(MTG.validateImportedDeckRecord(unsupported).ok, false);
  assert.throws(() => MTG.upsertGuestImportedDeck(unsupported, { storage }), /certified|supported/i);
  assert.equal(storage.getItem(MTG.IMPORTED_LIBRARY_KEY), savedPayload,
    'failed import cannot mutate the persisted library');
});
