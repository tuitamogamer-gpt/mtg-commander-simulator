import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSource, extractMainScript, extractRawData, readSource } from '../scripts/source-audit.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const source = readSource();
const raw = extractRawData(source);
const report = auditSource(source);

test('aplikacijski JavaScript se može izdvojiti', () => {
  assert.ok(extractMainScript(source).length > 250_000);
});

test('svaki ugrađeni deck ima tačno 100 karata', () => {
  for (const deck of report.deckRows) assert.equal(deck.total, 100, deck.name);
});

test('svaka karta ugrađenih deckova ima raw definiciju', () => {
  for (const deck of report.deckRows) assert.deepEqual(deck.missingDefinitions, [], deck.name);
});

test('commander svakog decka postoji u listi i kompletnom katalogu, uključujući Oracle batch karte', () => {
  const MTG=loadEngine();
  for (const deck of raw.decks) {
    assert.ok(deck.cards.some(card => card.name === deck.commander), `${deck.name}: commander nije u decku`);
    assert.ok(MTG.RAW_DATA.cards[deck.commander]&&MTG.DEFS[deck.commander], `${deck.name}: commander nema definiciju u katalogu`);
  }
});

test('raw snapshot čuva 131 deckova, a proizvod koristi certifikovani set od 130', () => {
  assert.equal(raw.decks.length, 131);
  assert.equal(report.deckRows.length, 130);
  assert.deepEqual(report.excludedDeckRows.map(deck => deck.name), ['Blame Game']);
});
