import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Checkpoints must survive double-faced cards: they are catalogued under
// "Front // Back", while the object on the battlefield may show either face.
const MTG = loadEngine();

function setup() {
  const other = Object.keys(MTG.DECKS).find(name => name !== 'From Cute to Brute' && !MTG.DECKS[name].custom);
  return {
    humanDeck: 'From Cute to Brute', aiDecks: [other], aiStyles: ['balanced'],
    difficulty: 'normal', seed: 30926, maxTurns: 30, paced: false,
  };
}

test('a deck with double-faced cards can be saved and restored', async () => {
  const options = setup();
  const game = MTG.newGame(options);
  const you = game.players.find(player => player.deckName === 'From Cute to Brute');
  assert.ok([...you.library, ...you.command].some(card => card.oracleFaces), 'the deck contains double-faced cards');

  const pathway = you.library.find(card => card.oracleFaces?.canonicalName === 'Barkchannel Pathway // Tidechannel Pathway');
  assert.ok(pathway);
  you.library.splice(you.library.indexOf(pathway), 1);
  pathway.zone = 'battlefield'; pathway.ctrl = you; pathway.sick = false;
  game.battlefield.push(pathway);
  assert.ok(MTG.OracleV8Faces.setFace(pathway, 'back'));

  const source = you.library.at(-1);
  await MTG.BOM.incubate({ g: game, src: source, you, sourceZoneVersion: source.zoneVersion }, 3);
  const egg = game.bf().find(card => card.hasSub('Incubator'));
  assert.ok(egg);
  assert.ok(MTG.OracleV8Faces.setFace(egg, 'back'), 'the Incubator transforms into its Phyrexian face');
  // Checkpoints are written between turns, when an active player exists.
  game.turnPlayer = you; game.turnNo = 6;
  game.recalc();
  assert.equal(pathway.name, 'Tidechannel Pathway');
  assert.equal(egg.is('Creature'), true);

  const snapshot = MTG.captureGameState(game);
  assert.ok(snapshot, game.log.at(-1)?.msg);
  const restored = MTG.newGame(options);
  MTG.restoreGameState(restored, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(MTG.gameStateFingerprint(restored), MTG.gameStateFingerprint(game));

  const restoredPathway = restored.battlefield.find(card => card.iid === pathway.iid);
  assert.equal(restoredPathway.name, 'Tidechannel Pathway');
  assert.equal(restoredPathway.oracleFace, 'back');
  const restoredEgg = restored.battlefield.find(card => card.iid === egg.iid);
  assert.equal(restoredEgg.is('Creature'), true, 'the transformed token stays transformed');
  assert.equal(restoredEgg.counters['+1/+1'], 3);
  assert.equal(restoredEgg.power, 3);
});
