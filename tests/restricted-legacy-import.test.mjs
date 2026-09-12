import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {loadEngine} from './helpers/load-engine.mjs';
const M = loadEngine();
const source = JSON.parse(fs.readFileSync(new URL('../reports/cards/restricted-legacy-2026-09-10/source-cards.json', import.meta.url), 'utf8'));
const names = source.cards.map(c => c.name).sort();
const list = ['Commander', '1 Nelly Borca, Impulsive Accuser *CMDR*', '', 'Deck',
  ...names.filter(n => n !== 'Nelly Borca, Impulsive Accuser').map(n => '1 ' + n), '41 Plains', '41 Mountain'].join('\n');

test('all eighteen cards and four legendary commander portraits use the recorded local artwork', () => {
  const report = JSON.parse(fs.readFileSync(new URL('../reports/cards/restricted-legacy-2026-09-10/images.json', import.meta.url), 'utf8'));
  assert.equal(report.images.length, 22);
  for (const row of report.images) {
    const actual = M.cardImageURL(row.name, row.variant === 'art_crop' ? 'art' : undefined);
    assert.equal(actual, row.path); assert.ok(!actual.includes('card-back'));
    const bytes = fs.readFileSync(new URL('../' + actual.replace(/^\.\//, ''), import.meta.url));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), row.outputSha256);
  }
});

test('exactly the eighteen recorded native cards gain import eligibility without adding definitions or built-in decks', () => {
  M.initData(M.RAW_DATA);
  assert.equal(names.length, 18); assert.deepEqual(Object.keys(M.REVIEWED_LEGACY_IMPORTS).sort(), names);
  assert.equal(Object.keys(M.DEFS).length, 21385); assert.equal(Object.keys(M.DECKS).length, 140);
  assert.equal(M.DECKS['Blame Game'], undefined);
  for (const row of source.cards) {
    const review = M.REVIEWED_LEGACY_IMPORTS[row.name], catalog = M.CARD_CATALOG[row.name];
    assert.equal(review.oracleId, row.oracle_id); assert.equal(review.sourceSha256, source.sourceSha256);
    assert.equal(catalog.deckImportEligible, true); assert.equal(catalog.legacyImportReview, 'restricted-legacy-2026-09-10');
    assert.deepEqual(JSON.parse(JSON.stringify(M.parseCost(catalog.manaCost))), JSON.parse(JSON.stringify(M.parseCost(row.mana_cost || ''))));
    assert.deepEqual(Array.from(catalog.colorIdentity).sort(), row.color_identity.slice().sort());
  }
  assert.equal(Object.values(M.CARD_CATALOG).filter(c => c.deckImportEligible).length, 21385);
});

test('unreviewed inactive native cards remain blocked by the general import gate', () => {
  const reviews = M.REVIEWED_LEGACY_IMPORTS;
  try {
    M.REVIEWED_LEGACY_IMPORTS = Object.freeze({}); M.buildCardCatalog(M.RAW_DATA, M.DEFS);
    assert.deepEqual(Object.values(M.CARD_CATALOG).filter(c => !c.deckImportEligible).map(c => c.name).sort(), names);
    assert.equal(M.importCommanderDeck(list).ok, false);
  } finally {M.REVIEWED_LEGACY_IMPORTS = reviews; M.buildCardCatalog(M.RAW_DATA, M.DEFS);}
});

test('all eighteen cards import together, persist, reload and build a canonical 100-card deck', () => {
  const result = M.importCommanderDeck(list, {name: 'Reviewed Native Eighteen'});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const record = M.createImportedDeckRecord(result, {id: 'deck-reviewed-native-eighteen', now: '2026-09-10T22:00:00.000Z'});
  const values = new Map(), storage = {getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v)};
  M.upsertGuestImportedDeck(record, {storage}); M.initData(M.RAW_DATA);
  const library = M.loadGuestImportedDeckLibrary({storage}); assert.equal(library.entries[0].ready, true);
  const checked = M.validateImportedDeckRecord(library.entries[0].record); assert.equal(checked.ok, true);
  const game = new M.Game({seed: 18, paced: false}); const p = game.addPlayer('Reviewed deck', checked.deck, null, false);
  game.buildDeck(p, checked.deck, M.DEFS, checked.commanders);
  assert.equal(p.library.length, 99); assert.equal(p.command.length, 1);
  const builtNames = new Set([...p.library, ...p.command].map(c => c.name));
  assert.ok(names.every(name => builtNames.has(name)));
  M.removeGuestImportedDeck(record.id, {storage}); M.initData(M.RAW_DATA);
});

test('the original Blame Game list can be imported as a custom deck while remaining excluded from built-ins', () => {
  const original = M.RAW_DATA.decks.find(d => d.name === 'Blame Game'); assert.ok(original);
  const text = ['Commander', '1 ' + original.commander + ' *CMDR*', '', 'Deck',
    ...original.cards.filter(c => c.name !== original.commander).map(c => c.n + ' ' + c.name)].join('\n');
  const imported = M.importCommanderDeck(text, {name: 'Reviewed Nelly Custom'});
  assert.equal(imported.ok, true, JSON.stringify(imported.errors));
  assert.equal(M.DECKS['Blame Game'], undefined);
});
