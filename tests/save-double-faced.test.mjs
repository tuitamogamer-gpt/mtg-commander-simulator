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

for (const payLife of [false, true]) test(`Fell Mire keeps its back face, land drop and ${payLife ? 'paid life' : 'tapped entry'} after Continue`, async () => {
  const create = () => {
    const game = new MTG.Game({seed: 731, paced: false});
    const controller = {decide: async (_game, question) => {
      if (question.type === 'priority') return {kind: 'pass'};
      if (question.type === 'chooseOption') return question.options.find(option =>
        payLife ? /pay 3 life/i.test(option.label) : /tapped/i.test(option.label))?.key;
      throw new Error(`Unexpected Fell Mire choice: ${question.type}`);
    }};
    const player = game.addPlayer('You', {name: 'Fell Mire save'}, controller, false);
    game.addPlayer('Rival', {name: 'Fell Mire witness'}, controller, false);
    game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
    return {game, player};
  };
  const {game, player} = create();
  const card = new MTG.CardInst(MTG.DEFS['Fell the Profane // Fell Mire'], player);
  card.zone = 'hand'; player.hand.push(card);
  assert.equal(await game.playLand(player, card, {oracleFace: 'back'}), true);
  assert.equal(card.name, 'Fell Mire'); assert.equal(card.tapped, !payLife);
  assert.equal(player.life, payLife ? 37 : 40); assert.equal(player.landsPlayed, 1);
  const snapshot = MTG.captureGameState(game); assert.ok(snapshot, MTG.gameStateSnapshotBlockers(game).join(', '));
  const next = create(); MTG.restoreGameState(next.game, JSON.parse(JSON.stringify(snapshot)));
  const restored = next.game.byIid(card.iid);
  assert.equal(restored.name, 'Fell Mire'); assert.equal(restored.oracleFace, 'back');
  assert.equal(restored.is('Land'), true); assert.equal(restored.tapped, !payLife);
  assert.equal(next.player.life, player.life); assert.equal(next.player.landsPlayed, 1);
  if (payLife) {
    const source = next.game.manaSources(next.player).find(row => row.card === restored); assert.ok(source);
    assert.equal(await next.game.activateAbility(next.player, {card: restored, manaAbility: true, manaSource: source}), true);
    assert.equal(next.player.pool.B, 1);
  }
  await next.game.move(restored, 'hand');
  assert.equal(restored.oracleFace, 'front'); assert.equal(restored.name, 'Fell the Profane');
});
