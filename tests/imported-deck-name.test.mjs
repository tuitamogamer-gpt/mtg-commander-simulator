import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const ashlingText = [
  'Commander',
  '1 Ashling, the Limitless *CMDR*',
  'Deck',
  '1 Sol Ring',
  '20 Plains',
  '20 Island',
  '20 Swamp',
  '19 Mountain',
  '19 Forest',
].join('\n');

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function engine(t) {
  const M = loadEngine();
  M.hydrateImportedDeckLibrary([], { source: 'guest' });
  t.after(() => M.hydrateImportedDeckLibrary([], { source: 'guest' }));
  return M;
}

function importDeck(M, name, text = ashlingText, options = {}) {
  const validation = M.importCommanderDeck(text, { ...options, ...(name === undefined ? {} : { name }) });
  assert.equal(validation.ok, true, validation.errors.map(error => error.message).join('\n'));
  return validation;
}

function recordFor(M, name) {
  return M.createImportedDeckRecord(importDeck(M, name));
}

function saveFresh(M, storage, validation) {
  const name = M.availableImportedDeckName(validation.deck.name);
  const named = M.validateImportedDeck(validation.parsed, { name, commanders: validation.commanders });
  assert.equal(named.ok, true, named.errors.map(error => error.message).join('\n'));
  return M.upsertGuestImportedDeck(M.createImportedDeckRecord(named), { storage });
}

test('repeated unnamed Commander imports save under distinct names and identifiers without replacing the first', t => {
  const M = engine(t);
  const storage = new FakeStorage();
  const validation = importDeck(M);
  const first = saveFresh(M, storage, validation);
  const firstSnapshot = JSON.stringify(first);
  const registeredFirst = M.DECKS[first.name];
  const beforeAllocation = JSON.stringify(M.getImportedDeckLibrary());

  assert.equal(first.name, 'Imported — Ashling, the Limitless');
  assert.equal(M.availableImportedDeckName(validation.deck.name), `${first.name} (2)`);
  assert.equal(JSON.stringify(M.getImportedDeckLibrary()), beforeAllocation, 'allocating a display name is read-only');
  assert.equal(M.DECKS[first.name], registeredFirst, 'allocation preserves the original runtime registration');

  const second = saveFresh(M, storage, importDeck(M));
  assert.equal(second.name, `${first.name} (2)`);
  assert.notEqual(second.id, first.id);
  assert.equal(JSON.stringify(M.getImportedDeckLibraryEntry(first.id).record), firstSnapshot);
  assert.equal(JSON.stringify(second.cards), JSON.stringify(first.cards));
  assert.equal(M.getImportedDeckLibrary().entries.length, 2);
  assert.ok(M.getImportedDeckLibrary().entries.every(entry => entry.ready));
});

test('explicit duplicate names receive a suffix while free names retain their spelling', t => {
  const M = engine(t);
  const storage = new FakeStorage();
  const first = M.upsertGuestImportedDeck(recordFor(M, 'Ninja Library'), { storage });
  const second = saveFresh(M, storage, importDeck(M, 'Ninja Library'));
  assert.equal(second.name, 'Ninja Library (2)');
  assert.notEqual(second.id, first.id);
  assert.equal(M.availableImportedDeckName('Another Ninja Library'), 'Another Ninja Library');
  assert.equal(JSON.stringify(M.getImportedDeckLibraryEntry(first.id).record), JSON.stringify(first));
});

test('name allocation detects case, NFKC and punctuation equivalents used by the guest library', t => {
  const M = engine(t);
  M.hydrateImportedDeckLibrary([
    recordFor(M, 'Shadow Library'),
    recordFor(M, 'Ninja’s   Library'),
  ], { source: 'guest' });
  assert.equal(M.availableImportedDeckName('shadow library'), 'shadow library (2)');
  assert.equal(M.availableImportedDeckName('ＳＨＡＤＯＷ ＬＩＢＲＡＲＹ'), 'ＳＨＡＤＯＷ ＬＩＢＲＡＲＹ (2)');
  assert.equal(M.availableImportedDeckName("ninja's library"), "ninja's library (2)");
});

test('name allocation uses the first unoccupied suffix and reserves built-in deck names', t => {
  const M = engine(t);
  M.hydrateImportedDeckLibrary([
    recordFor(M, 'Ninja Lab'),
    recordFor(M, 'Ninja Lab (2)'),
    recordFor(M, 'Ninja Lab (4)'),
  ], { source: 'guest' });
  const builtIn = M.DECKS['Quick Draw'];
  assert.ok(builtIn && !builtIn.custom);
  assert.equal(M.availableImportedDeckName('Ninja Lab'), 'Ninja Lab (3)');
  assert.equal(M.availableImportedDeckName('Quick Draw'), 'Quick Draw (2)');
  assert.equal(M.DECKS['Quick Draw'], builtIn);
});

test('suffixes fit within the 80-character saved-name limit, including after truncation collides', t => {
  const M = engine(t);
  const base = 'N'.repeat(80);
  M.hydrateImportedDeckLibrary([
    recordFor(M, base),
    recordFor(M, `${base.slice(0, 76)} (2)`),
  ], { source: 'guest' });
  const name = M.availableImportedDeckName(base);
  assert.equal(name, `${base.slice(0, 76)} (3)`);
  assert.equal(name.length, 80);
  assert.equal(M.validateImportedDeckRecord(recordFor(M, name)).ok, true);
});

test('unavailable saved entries still reserve their names and allocation does not modify quarantined data', t => {
  const M = engine(t);
  const unavailable = recordFor(M, 'Quarantined Ninja');
  unavailable.cards.find(row => row.name === 'Sol Ring').name = 'Definitely Not A Magic Card';
  M.hydrateImportedDeckLibrary([unavailable], { source: 'account' });
  assert.equal(M.getImportedDeckLibrary().entries[0].ready, false);
  assert.equal(M.DECKS[unavailable.name], undefined);
  const snapshot = JSON.stringify(M.getImportedDeckLibrary());
  assert.equal(M.availableImportedDeckName(unavailable.name), `${unavailable.name} (2)`);
  assert.equal(JSON.stringify(M.getImportedDeckLibrary()), snapshot);
  assert.equal(M.DECKS[unavailable.name], undefined);
});

test('the supplied Yuriko list resolves all 100 cards and two fresh imports preserve the earlier deck', t => {
  const M = engine(t);
  const text = fs.readFileSync(new URL('./fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
  const commander = "Yuriko, the Tiger's Shadow";
  const validation = importDeck(M, undefined, text, { commanders: [commander] });
  assert.equal(validation.summary.inputCards, 100);
  assert.equal(validation.summary.resolvedCards, 100);
  assert.equal(validation.summary.unresolvedCards, 0);
  assert.equal(validation.summary.engineCertified, validation.summary.uniqueCards);
  assert.deepEqual(Array.from(validation.commanders), [commander]);
  assert.ok(validation.deck.cards.some(row => row.name === M.resolveDeckCardName('Consign/Oblivion')));

  const rows = M.parseDeckText(text).cards;
  for (const row of rows) {
    const canonical = M.resolveDeckCardName(row.name);
    assert.ok(canonical, `${row.name} resolves, including printed front-face names`);
    assert.ok(validation.deck.cards.some(card => card.name === canonical), `${row.name} is preserved as its canonical engine card`);
  }

  const storage = new FakeStorage();
  const first = saveFresh(M, storage, validation);
  const firstSnapshot = JSON.stringify(first);
  const second = saveFresh(M, storage, validation);
  assert.equal(second.name, `${first.name} (2)`);
  assert.notEqual(second.id, first.id);
  assert.equal(JSON.stringify(second.cards), JSON.stringify(first.cards));
  assert.equal(JSON.stringify(M.getImportedDeckLibraryEntry(first.id).record), firstSnapshot);
  assert.ok(M.getImportedDeckLibrary().entries.every(entry => entry.ready));
  assert.equal(M.getImportedDeckLibrary().entries.length, 2);
});
