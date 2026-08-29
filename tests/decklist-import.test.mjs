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

test('parser prihvata Moxfield/Arena oznake, dva commandera i ignoriše sideboard', () => {
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
  assert.equal(parsed.ignored.length, 1);
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

test('svaka od 300 generičkih Oracle batch karata može ući u legalan 100-card custom deck i CardInst', () => {
  const MTG = loadEngine();
  for (const name of batchNames(MTG)) {
    const imported = MTG.importCommanderDeck(deckText('Ashling, the Limitless', [name]), { name: `Probe — ${name}` });
    assert.equal(imported.ok, true, `${name}: ${imported.errors.map(error => error.message).join('; ')}`);
    assert.equal(imported.interactions.ready, true, `${name}: interactions`);
    const game = new MTG.Game({ seed: 3, paced: false, maxTurns: 2 });
    const player = game.addPlayer('Probe', imported.deck, null, true);
    game.buildDeck(player, imported.deck, MTG.DEFS, imported.commanders);
    const instance = player.library.find(card => card.name === name);
    assert.ok(instance, `${name}: CardInst in imported deck`);
    assert.equal(instance.def.oracle, MTG.CARD_CATALOG[name].oracleText, `${name}: exact Oracle survives deck import`);
  }
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
