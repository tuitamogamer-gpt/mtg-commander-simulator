import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {extractRawData} from '../scripts/source-audit.mjs';
import {buildIntake, sourceDir, parseOfficialDecklists, preserveBaseline, registerImport, precons} from '../scripts/import-star-trek-precons.mjs';
import {verifyImport} from '../scripts/verify-star-trek-import.mjs';

const M = loadEngine();
const initial = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));
const raw = () => extractRawData(fs.readFileSync(new URL('../src/data.js', import.meta.url), 'utf8'));

test('four exact official Star Trek precons preserve all earlier cards and remain honest preview imports', () => {
  const result = verifyImport(M);
  assert.deepEqual(result.current, {decks: 180, definitions: 32273, eligible: 32272});
  assert.equal(result.existingRawDefinitionsPreserved, 3934);
  assert.equal(result.existingRawDeckRecordsPreserved, 176);
  assert.deepEqual(result.sourceLists.map(deck => deck.previewCards), [37, 34, 38, 34]);
});

test('official decklist parsing requires every deck, its printed commander and exactly 100 cards', () => {
  const html = fs.readFileSync(sourceDir + '/official-decklists.html', 'utf8');
  assert.equal(parseOfficialDecklists(html).length, 4);
  assert.throws(() => parseOfficialDecklists(html.replace('deck-title="Landing Party"', 'deck-title="Unknown Deck"')), /Official list missing/);
  assert.throws(() => parseOfficialDecklists(html.replace(/(<main-deck>\s*)The Borg Queen/, '$1Locutus of Borg')), /commander differs/);
  const decks = parseOfficialDecklists(html);
  for (const deck of decks) assert.equal(deck.cards.reduce((sum, card) => sum + card.n, 0), 100);
});

test('registration rejects missing native support and any mutation to an existing card or precon', () => {
  const intake = buildIntake(M);
  assert.throws(() => registerImport(raw(), {SCRIPTS: {}}, intake, initial), /Native implementation missing/);
  const changedCard = raw(); changedCard.cards['Sol Ring'].oracle = 'Invented substitute';
  assert.throws(() => preserveBaseline(changedCard, initial), /Existing raw cards changed/);
  const changedDeck = raw(); changedDeck.decks[0].cards[0].n += 1;
  assert.throws(() => preserveBaseline(changedDeck, initial), /Existing precons changed/);
  const changedNew = raw(); changedNew.cards['The Borg Queen'].oracle += '\nInvented text.';
  assert.throws(() => registerImport(changedNew, M, intake, initial), /Existing imported definition differs/);
});

test('new definitions have exactly one owner and retain the pinned Oracle text', () => {
  const intake = buildIntake(M), seen = new Set();
  for (const deck of precons) {
    const assignment = JSON.parse(fs.readFileSync(sourceDir + '/assignments-' + deck.owner + '.json'));
    assert.equal(assignment.deck, deck.name);
    assert.equal(assignment.ownedCount, assignment.cards.length);
    for (const card of assignment.cards) {
      assert.equal(seen.has(card.canonicalName), false, card.canonicalName);
      seen.add(card.canonicalName);
      assert.deepEqual(card.raw, intake.oracle.get(card.canonicalName).raw);
    }
  }
  assert.equal(seen.size, 137);
});
