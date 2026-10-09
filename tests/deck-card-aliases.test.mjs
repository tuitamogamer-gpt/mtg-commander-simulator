import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';

const screenshot = [
  ['Balin’s Tomb', 'Ancient Tomb', '23467047-6dba-4498-b783-1ebc4f74b8c2'],
  ['Erebor Heirloom', 'Fellwar Stone', '95560508-7ac9-4be9-8a3f-3c7d5b52807b'],
  ['Glittering Caves of Aglarond', 'Gemstone Caverns', 'c0adbddc-b070-4c5f-afe0-0474c72a9251'],
  ['Porom’s Silence Magic', 'Silence', '8aed54cb-d1bb-45ad-adbe-38e55d84ff31'],
  ['The Blades of Chaos Bond', 'Rite of Flame', '8a2e53f9-8100-488f-8504-b59e9bd1cc29'],
  ['Unseat the Usurper', "Praetor's Grasp", '6d56aeb1-0a50-46b6-abdb-cd6575a98dc3'],
  ['Wear/Tear', 'Wear // Tear', '9842734c-1eac-4509-a731-4c22017ae586'],
];
const deckText = extras => ['Commander', '1 Ashling, the Limitless', 'Deck',
  ...extras.map(name => `1 ${name}`), `${99 - extras.length} Plains`].join('\n');

function isolatedCatalog(cards, aliases) {
  const MTG = {CARD_CATALOG: Object.fromEntries(cards.map(card => [card.name, card])),
    DEFS: Object.fromEntries(cards.map(card => [card.name, {name: card.name}])),
    DECK_CARD_ALIASES: aliases};
  vm.runInNewContext(fs.readFileSync(new URL('../src/modules/deck-import.js', import.meta.url), 'utf8'), {MTG});
  return MTG;
}

test('all seven screenshot names import through their existing exact card identities', () => {
  const MTG = loadEngine();
  for (const [alias, name, oracleId] of screenshot) {
    assert.equal(MTG.resolveDeckCardName(alias), name);
    const generated = MTG.DECK_CARD_ALIASES.cards.find(row => row.name === name);
    assert.equal(generated?.oracleId || MTG.CARD_CATALOG[name].oracleId, oracleId);
    assert.equal(MTG.DEFS[alias], undefined, 'a printing alias must not create a second gameplay definition');
  }
  const imported = MTG.importCommanderDeck(deckText(screenshot.map(row => row[0])));
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  assert.equal(imported.summary.resolvedCards, 100);
  for (const [, name] of screenshot) assert.ok(imported.deck.cards.some(card => card.name === name));
});

test('single and double split separators and actual DFC flavor face names resolve to the whole card', () => {
  const MTG = loadEngine();
  for (const name of ['Wear/Tear', 'Wear / Tear', 'wear//tear', 'WEAR // TEAR'])
    assert.equal(MTG.resolveDeckCardName(name), 'Wear // Tear');
  for (const name of ['Dracula, Lord of Blood', 'Dracula, Lord of Bats', 'Dracula, Lord of Blood/Dracula, Lord of Bats'])
    assert.equal(MTG.resolveDeckCardName(name), 'Voldaren Bloodcaster // Bloodbat Summoner');
  assert.equal(MTG.resolveDeckCardName('Unseat the Usurpe'), null, 'no approximate name guessing');
});

test('canonical and flavor names share the actual Commander singleton and color gates', () => {
  const MTG = loadEngine();
  const duplicate = MTG.importCommanderDeck(deckText(['Ancient Tomb', 'Balin’s Tomb']));
  assert.ok(duplicate.errors.some(error => error.code === 'singleton' && error.card === 'Ancient Tomb'));
  assert.equal(duplicate.summary.unresolvedCards, 0);
  const offColor = MTG.importCommanderDeck(deckText(['Unseat the Usurper'])
    .replace('Ashling, the Limitless', 'Black Widow, Natasha Romanoff').replace('Plains', 'Mountain'));
  assert.equal(offColor.ok, false);
  assert.ok(offColor.errors.some(error => error.code === 'invalid-commanders' && /outside/i.test(error.message)));
});

test('distinct runtime names of a proven single Oracle identity canonicalize together', () => {
  const MTG = isolatedCatalog([{name: 'Front', oracleId: 'one'}, {name: 'Back', oracleId: 'one'}],
    {cards: [{name: 'Front', oracleId: 'one', runtimeNames: ['Front', 'Back'], aliases: ['Printed front', 'Printed back']}], unavailable: []});
  for (const name of ['Front', 'Back', 'back', 'Printed front', 'Printed back']) assert.equal(MTG.resolveDeckCardName(name), 'Front');
});

test('ambiguous playable aliases fail closed while exact canonical names and art inserts remain distinct', () => {
  const MTG = isolatedCatalog([{name: 'Alpha', oracleId: 'one'}, {name: 'Beta', oracleId: 'two'}], {cards: [
    {name: 'Alpha', oracleId: 'one', aliases: ['Shared', 'Art title']},
    {name: 'Beta', oracleId: 'two', aliases: ['Shared', 'Alpha']},
  ], unavailable: [{name: 'Unimplemented', oracleId: 'three', aliases: ['Shared']},
    {name: 'Art title', oracleId: 'art', deckCard: false, aliases: []}]});
  assert.equal(MTG.resolveDeckCardName('Shared'), null);
  assert.equal(MTG.resolveDeckCardName('ALPHA'), 'Alpha');
  assert.equal(MTG.resolveDeckCardName('Art title'), 'Alpha');
});

test('source aliases require matching IDs or the recorded native identity and refresh after catalog replacement', () => {
  const MTG = isolatedCatalog([{name: 'Alpha', oracleId: 'wrong'}, {name: 'Native', manaCost: '{2}', typeLine: 'Artifact'}], {cards: [
    {name: 'Alpha', oracleId: 'one', aliases: ['Printed Alpha']},
    {name: 'Native', oracleId: 'native-one', aliases: ['Printed Native'], nativeIdentities: [{name: 'Native', manaCost: '{3}', typeLine: 'Artifact'}]},
  ], unavailable: []});
  assert.equal(MTG.resolveDeckCardName('Printed Alpha'), null);
  assert.equal(MTG.resolveDeckCardName('Printed Native'), null);
  MTG.CARD_CATALOG = {...MTG.CARD_CATALOG, Alpha: {name: 'Alpha', oracleId: 'one'}, Native: {name: 'Native', manaCost: '{3}', typeLine: 'Artifact'}};
  assert.equal(MTG.resolveDeckCardName('Printed Alpha'), 'Alpha');
  assert.equal(MTG.resolveDeckCardName('Printed Native'), 'Native');
});

test('known unavailable digital and banned identities are identified without granting gameplay support', () => {
  const MTG = loadEngine();
  const digital = MTG.DECK_CARD_ALIASES.unavailable.find(row => row.deckCard !== false && row.games.includes('arena') && !row.games.includes('paper'));
  assert.ok(digital);
  const input = MTG.importCommanderDeck(deckText([digital.name]));
  assert.ok(input.errors.some(error => error.code === 'known-unavailable-card' && error.card === digital.name));
  assert.equal(MTG.resolveDeckCardName(digital.name), null);
  const banned = MTG.importCommanderDeck(deckText(['White Tower of Ecthelion']));
  assert.ok(banned.errors.some(error => error.code === 'known-unavailable-card' && /Karakas/.test(error.message) && /banned/.test(error.message)));
  const standalone = MTG.importCommanderDeck(deckText(['Ancestral Recall']));
  assert.ok(standalone.errors.some(error => error.code === 'known-unavailable-card' && /banned/.test(error.message)));
  assert.equal(MTG.resolveDeckCardName('Emeritus of Ideation // Ancestral Recall'), 'Emeritus of Ideation // Ancestral Recall');
});

test('a shared foreign printing name reports ambiguity instead of an unknown card or guessed identity', () => {
  const MTG = loadEngine();
  assert.equal(MTG.resolveDeckCardName('El Potro'), null);
  const imported = MTG.importCommanderDeck(deckText(['El Potro']));
  assert.ok(imported.errors.some(error => error.code === 'ambiguous-card-name' && error.card === 'El Potro'));
  assert.equal(imported.errors.some(error => error.code === 'unknown-card'), false);
});

test('complete alias provenance includes digital printings and foreign printed names with pinned source hashes', () => {
  const MTG = loadEngine();
  const report = JSON.parse(fs.readFileSync(new URL('../reports/deck-import/name-aliases-2026-10-09.json', import.meta.url), 'utf8'));
  assert.equal(report.counts.oracleRows, 38_708);
  assert.equal(report.counts.printingRows, 118_602);
  assert.equal(report.counts.printingsWithoutOracleIdentity, 0);
  assert.equal(report.source.oracle.sha256, '0ca0d50138e5cf10e8d713e1169ebf2ffc928caaaae71292e0e62a793d1348be');
  assert.equal(report.source.printings.sha256, 'd8e1f9730bd76d593a58100d3dbb3645a0d9182420c4835584c83ee89ef51227');
  assert.deepEqual(JSON.parse(JSON.stringify(MTG.DECK_CARD_ALIASES.counts)), report.counts);
  assert.ok(report.evidence.some(row => row.games?.includes('arena') && !row.games.includes('paper')));
  assert.ok(report.evidence.some(row => row.lang && row.lang !== 'en'));
});
