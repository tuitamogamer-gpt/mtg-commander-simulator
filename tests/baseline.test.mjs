import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSource, extractMainScript, extractRawData, readSource } from '../scripts/source-audit.mjs';

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

test('commander svakog decka postoji u listi i raw bazi', () => {
  for (const deck of raw.decks) {
    assert.ok(deck.cards.some(card => card.name === deck.commander), `${deck.name}: commander nije u decku`);
    assert.ok(raw.cards[deck.commander], `${deck.name}: commander nema raw definiciju`);
  }
});

test('raw snapshot čuva 21 deck, a proizvod koristi certifikovani set od 20', () => {
  assert.equal(raw.decks.length, 21);
  assert.equal(report.deckRows.length, 20);
  assert.deepEqual(report.excludedDeckRows.map(deck => deck.name), ['Blame Game']);
});
