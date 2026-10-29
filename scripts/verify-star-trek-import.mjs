import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData} from './source-audit.mjs';
import {buildIntake, sourceDir, precons, preserveBaseline, registerImport, rawOracle, sha, releaseDate} from './import-star-trek-precons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function verifyImport(M = loadEngine()) {
  const intake = buildIntake(M), initial = JSON.parse(fs.readFileSync(sourceDir + '/intake.json'));
  const source = fs.readFileSync(path.join(root, 'src/data.js'), 'utf8'), raw = extractRawData(source), preserved = preserveBaseline(raw, initial);
  assert.equal(intake.newNames.length, 0, 'every published card has a runtime definition');
  assert.equal(intake.names.length, 302);
  assert.equal(initial.newCards, 137);
  assert.equal(initial.reusedCards, 165);
  assert.equal(Object.keys(raw.cards).length, initial.baselineRawCards + 137);
  assert.equal(raw.decks.length, initial.baselineDecks + 4);
  const assignments = precons.flatMap(deck => JSON.parse(fs.readFileSync(sourceDir + '/assignments-' + deck.owner + '.json')).cards.map(card => card.canonicalName));
  assert.equal(assignments.length, 137);
  assert.equal(new Set(assignments).size, 137, 'card ownership is disjoint');
  assert.deepEqual(assignments.toSorted(), initial.newNames.toSorted());
  for (const name of initial.newNames) {
    const oracle = intake.oracle.get(name), catalog = M.CARD_CATALOG[name];
    assert.equal(JSON.stringify(raw.cards[name]), JSON.stringify(rawOracle(oracle)), name + ': exact raw Oracle');
    assert.ok(M.SCRIPTS[name] && !M.SCRIPTS[name].autoScripted && !M.SCRIPTS[name].simplified, name + ': native implementation');
    assert.equal(!!M.DEFS[name].simplified, false, name + ': full definition');
    assert.equal(catalog.oracleId, oracle.oracleId, name + ': Oracle identity');
    assert.equal(catalog.scryfallId, oracle.scryfallId, name + ': printing identity');
    assert.equal(catalog.deckImportEligible, true, name + ': simulator import eligibility');
    assert.equal(catalog.commanderLegality, 'not_legal', name + ': preview retains Scryfall legality');
    assert.equal(catalog.releasedAt, releaseDate, name + ': release date');
  }
  const sourceLists = intake.decks.map(deck => {
    const {source: provenance, ...expected} = deck;
    assert.equal(JSON.stringify(raw.decks.find(row => row.name === deck.name)), JSON.stringify(expected), deck.name + ': exact original list');
    const text = fs.readFileSync(sourceDir + '/' + provenance.export, 'utf8');
    const imported = M.validateImportedDeck(M.parseDeckText(text), {name: deck.name});
    assert.equal(imported.ok, true, deck.name + ': ' + JSON.stringify(imported.errors));
    const previewWarnings = imported.warnings.filter(warning => warning.code === 'commander-legality');
    const previews = deck.cards.filter(card => intake.oracle.get(card.name).commanderLegality === 'not_legal').length;
    assert.equal(previewWarnings.length, previews, deck.name + ': honest preview warnings');
    return {name: deck.name, commander: deck.commander, total: 100, official: provenance.official,
      independentDecklistStatus: provenance.independentDecklistStatus, exportSha256: provenance.sha256, previewCards: previews, importAccepted: true};
  });
  const cloned = JSON.parse(JSON.stringify(raw));
  registerImport(cloned, M, intake, initial);
  assert.equal(JSON.stringify(cloned), JSON.stringify(raw), 'repeated registration is idempotent');
  const serialized = "'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = " + JSON.stringify(cloned) + ';\n';
  assert.equal(sha(serialized), sha(source), 'repeated import preserves exact data file bytes');
  assert.equal(Object.keys(M.DEFS).length, initial.baselineCards + 137);
  assert.equal(Object.keys(M.DECKS).length, initial.baselineDecks + 4);
  return {passed: true, generatedAt: new Date().toISOString(), releaseDate, status: 'preview', physicalCards: 400,
    uniqueNames: 302, reusedNames: 165, newNativeNames: 137, sourceLists,
    existingRawDefinitionsPreserved: preserved.cards, existingRawDeckRecordsPreserved: preserved.decks,
    nativeRawDefinitions: Object.keys(raw.cards).length, allNewOracleDefinitionsMatch: true, assignmentsDisjoint: true,
    allPreviewLegalityRetained: true, idempotentDataSha256: sha(source),
    current: {decks: Object.keys(M.DECKS).length, definitions: Object.keys(M.DEFS).length, eligible: Object.values(M.CARD_CATALOG).filter(card => card.deckImportEligible).length}};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyImport();
  fs.writeFileSync(sourceDir + '/source-validation.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
