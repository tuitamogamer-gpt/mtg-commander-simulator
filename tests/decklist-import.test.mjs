import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function batchNames(MTG) {
  return MTG.ORACLE_BATCHES
    .flatMap(batch => batch.cards)
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => entry.raw.name);
}

function deckText(commander, extras, basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
  const remaining = 99 - extras.length;
  const counts = basics.map((name, index) => ({
    name,
    n: Math.floor(remaining / basics.length) + (index < remaining % basics.length ? 1 : 0),
  })).filter(entry => entry.n > 0);
  return [
    'Commander',
    `1 ${commander} *CMDR*`,
    '',
    'Deck',
    ...extras.map((name, index) => `1 ${name}${index % 2 ? '' : ' (TST) 001'}`),
    ...counts.map(entry => `${entry.n} ${entry.name}`),
  ].join('\n');
}

test('parser prihvata Moxfield/Arena oznake, dva commandera i zadržava sideboard izvan glavnog decka', () => {
  const MTG = loadEngine();
  const parsed = MTG.parseDeckText(`
Commanders:
1x Leonardo, the Balance (PIP) 1 *CMDR*
1 Michelangelo, the Heart [TMT:2] [Commander]
Deck
1 Sol Ring (C21) 263 *F*
97 Wastes
Sideboard
1 Black Lotus
`);
  assert.deepEqual(Array.from(parsed.commanders), ['Leonardo, the Balance', 'Michelangelo, the Heart']);
  assert.equal(parsed.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(parsed.cards.some(entry => entry.name === 'Sol Ring'), true);
  assert.equal(parsed.cards.some(entry => entry.name === 'Black Lotus'), false);
  assert.deepEqual(Array.from(parsed.auxiliaryV87.outsideGame), ['Black Lotus']);
});

test('pasted Commander deck prolazi tek nakon size, singleton, commander, color i engine gateova', () => {
  const MTG = loadEngine();
  const extras = batchNames(MTG).slice(0, 59);
  const imported = MTG.importCommanderDeck(deckText('Ashling, the Limitless', extras), { name: 'Oracle Combination Lab' });
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  assert.equal(imported.summary.inputCards, 100);
  assert.equal(imported.summary.resolvedCards, 100);
  assert.equal(imported.summary.engineCertified, imported.summary.uniqueCards);
  assert.equal(imported.interactions.ready, true);
  assert.equal(imported.interactions.batchCards, 59);
  assert.ok(imported.interactions.contracts.some(contract => contract.id === 'creature-casting'));
  assert.ok(imported.interactions.combinations.includes('flying-vs-reach'));

  const deck = MTG.registerImportedDeck(imported);
  assert.equal(MTG.DECKS[deck.name].custom, true);
  assert.equal(MTG.DECK_META[deck.name].style, 'Imported decklist');
  const game = new MTG.Game({ seed: 8293, paced: false, maxTurns: 10 });
  const player = game.addPlayer('Importer', deck, null, true);
  player.chosenCommanders = imported.commanders;
  game.buildDeck(player, deck, MTG.DEFS);
  assert.equal(player.command.length, 1);
  assert.equal(player.library.length, 99);
  assert.equal(player.command[0].name, 'Ashling, the Limitless');
  for (const name of extras) assert.ok(player.library.some(card => card.name === name), `${name}: built into library`);
});

test('svaka generička Oracle batch karta ulazi u svoj glavni ili supplementary dio legalnog custom decka', t => {
  const MTG = loadEngine();
  const auxiliaryNames = {
    attractions: Object.keys(MTG.DEFS).filter(name => MTG.DEFS[name].attractionLightsV87),
    stickers: Object.keys(MTG.DEFS).filter(name => MTG.DEFS[name].stickerSheetV87),
  };
  const counts = {main: 0, attractions: 0, stickers: 0};
  for (const name of batchNames(MTG)) {
    const def = MTG.DEFS[name];
    const field = def?.stickerSheetV87 ? 'stickers' : def?.attractionLightsV87 ? 'attractions' : null;
    let text = deckText('Ashling, the Limitless', [name]);
    if (name === 'Cryptic Spires') text = text.replace(/^(1 Cryptic Spires[^\n]*)$/m, '$1 [colors=W,U]');
    if (field) {
      const wrongSection = MTG.importCommanderDeck(text);
      assert.equal(wrongSection.ok, false, `${name}: supplementary cards cannot occupy a main-deck slot`);
      assert.ok(wrongSection.errors.some(error => error.code === 'auxiliary-main' && error.card === name),
        `${name}: explicit supplementary-section error`);
      const rows = [name, ...auxiliaryNames[field].filter(other => other !== name).slice(0, 9)];
      assert.equal(rows.length, 10, `${name}: ten distinct supplementary names`);
      text = deckText('Ashling, the Limitless', []) + '\n\n' +
        (field === 'stickers' ? 'Sticker sheets' : 'Attractions') + '\n' + rows.map(row => '1 ' + row).join('\n');
    }
    const imported = MTG.importCommanderDeck(text, { name: `Probe — ${name}` });
    assert.equal(imported.ok, true, `${name}: ${imported.errors.map(error => error.message).join('; ')}`);
    assert.equal(imported.interactions.ready, true, `${name}: interactions`);
    assert.equal(imported.summary.inputCards, 100, `${name}: main deck remains exactly 100 cards`);
    const game = new MTG.Game({ seed: 3, paced: false, maxTurns: 2 });
    const player = game.addPlayer('Probe', imported.deck, null, true);
    game.buildDeck(player, imported.deck, MTG.DEFS, imported.commanders);
    assert.equal(player.library.length, 99, `${name}: main library size`);
    counts[field || 'main']++;
    if (field === 'stickers') {
      assert.ok(player.stickerSheetsV87.includes(name), `${name}: native brought-sheet list`);
      assert.equal(player.availableStickerSheetsV87.length, 3, `${name}: native random three-sheet selection`);
      assert.equal(new Set(player.availableStickerSheetsV87).size, 3);
      assert.ok(player.availableStickerSheetsV87.every(sheet => player.stickerSheetsV87.includes(sheet)));
      assert.ok(MTG.OracleV87.sheets.has(name), `${name}: executable native sheet registry`);
      assert.equal(player.library.some(card => card.def.name === name), false);
      continue;
    }
    const printed = MTG.DEFS[name] && MTG.DEFS[name].name;
    const zone = field === 'attractions' ? player.attractionDeckV87 : player.library;
    const instance = zone.find(card => card.name === name || card.name === printed);
    assert.ok(instance, `${name}: CardInst in correct imported deck zone`);
    if (field === 'attractions') {
      assert.equal(instance.zone, 'command');assert.equal(instance.attractionBackV87, true);
      assert.equal(player.attractionDeckV87.length, 10);
      assert.equal(player.library.includes(instance), false);
    }
    assert.equal(instance.def.oracle, MTG.CARD_CATALOG[name].oracleText, `${name}: exact Oracle survives deck import`);
  }
  t.diagnostic(JSON.stringify({genericNames: Object.values(counts).reduce((a, b) => a + b, 0), ...counts}));
});

test('import odbija pogrešnu veličinu, duplikat, off-color, lažnog commandera i nepoznatu kartu', () => {
  const MTG = loadEngine();
  const tooSmall = MTG.importCommanderDeck(deckText('Ashling, the Limitless', []).replace('20 Plains', '19 Plains'));
  assert.ok(tooSmall.errors.some(error => error.code === 'deck-size'));

  const duplicate = MTG.importCommanderDeck(deckText('Ashling, the Limitless', ['Sol Ring'])
    .replace('1 Sol Ring (TST) 001', '2 Sol Ring (TST) 001')
    .replace('20 Plains', '19 Plains'));
  assert.ok(duplicate.errors.some(error => error.code === 'singleton' && error.card === 'Sol Ring'));

  const offColor = MTG.importCommanderDeck(deckText('Black Widow, Natasha Romanoff', ['A.I.M. Bot'], ['Mountain']));
  assert.ok(offColor.errors.some(error => error.code === 'invalid-commanders' && /outside/i.test(error.message)));

  const fakeCommander = MTG.importCommanderDeck(deckText('A.I.M. Bot', [], ['Island']));
  assert.ok(fakeCommander.errors.some(error => error.code === 'invalid-commanders' && /cannot be a commander/i.test(error.message)));

  const unknown = MTG.importCommanderDeck(deckText('Ashling, the Limitless', ['Definitely Not A Magic Card']));
  assert.ok(unknown.errors.some(error => error.code === 'unknown-card'));
  assert.ok(unknown.errors.some(error => error.code === 'interaction-unsupported') === false);

  const reviewedLegacy = MTG.importCommanderDeck(deckText('Ashling, the Limitless', ['Boros Reckoner']));
  assert.equal(reviewedLegacy.ok, true, 'individually reviewed legacy card can be imported');
  assert.equal(MTG.CARD_CATALOG['Boros Reckoner'].engineStatus, 'certified-legacy', 'legacy definition remains available to engine scripts');
  assert.equal(MTG.CARD_CATALOG['Boros Reckoner'].legacyImportReview, 'restricted-legacy-2026-09-10');
});

test('arbitrary imported combination deck završava determinističku lokal-AI partiju bez zaostalih triggera', { timeout: 30_000 }, async () => {
  const MTG = loadEngine();
  const extras = batchNames(MTG).filter(name => {
    if (name === 'Black Widow, Natasha Romanoff') return false;
    const ci = MTG.CARD_CATALOG[name].colorIdentity || [];
    return ci.every(color => ['R'].includes(color));
  }).slice(0, 45);
  const imported = MTG.importCommanderDeck(deckText('Black Widow, Natasha Romanoff', extras, ['Mountain']), {
    name: 'Black Widow Oracle Import Smoke',
    register: true,
  });
  assert.equal(imported.ok, true, imported.errors.map(error => error.message).join('\n'));
  const game = MTG.newGame({
    humanDeck: imported.deck.name,
    humanCommanders: imported.commanders,
    aiDecks: ['Quick Draw', 'Abzan Armor', 'Elven Council'],
    aiStyles: ['balanced', 'balanced', 'balanced'],
    difficulty: 'normal',
    seed: 829300,
    maxTurns: 220,
    paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal(game.log.some(entry => /AI V2 fallback/i.test(entry.msg)), false);
});
