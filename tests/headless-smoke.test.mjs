import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

test('seeded games allocate card identities locally instead of inheriting process history', () => {
  const MTG = loadEngine();
  const first = new MTG.Game({ seed: 1, paced: false, maxTurns: 1 });
  const firstPlayer = first.addPlayer('First', { name: 'First' }, null, false);
  const firstCard = new MTG.CardInst(MTG.DEFS.Forest, firstPlayer);
  for (let index = 0; index < 250; index++) new MTG.CardInst(MTG.DEFS.Forest, firstPlayer);

  const second = new MTG.Game({ seed: 1, paced: false, maxTurns: 1 });
  const secondPlayer = second.addPlayer('Second', { name: 'Second' }, null, false);
  const secondCard = new MTG.CardInst(MTG.DEFS.Forest, secondPlayer);
  assert.equal(firstCard.iid, 1);
  assert.equal(secondCard.iid, 1, 'a prior game cannot perturb deterministic AI tie-break identities');
});

test('svaki deck može završiti jednu determinističku četveroigračku smoke partiju', { timeout: 60_000 }, async () => {
  const MTG = loadEngine();
  const decks = Object.keys(MTG.DECKS);
  for (let index = 0; index < decks.length; index++) {
    const opponents = [1, 2, 3].map(offset => decks[(index + offset) % decks.length]);
    const game = MTG.newGame({
      humanDeck: decks[index],
      aiDecks: opponents,
      aiStyles: ['balanced', 'balanced', 'balanced'],
      difficulty: 'normal',
      seed: 11_081 + index,
      maxTurns: 200,
      paced: false,
    });
    await game.start();
    assert.ok(game.gameOver, `${decks[index]}: partija nije završila`);
    assert.ok(game.winner, `${decks[index]}: nema pobjednika u smoke partiji`);
    assert.ok(game.turnNo < game.maxTurns, `${decks[index]}: dostignut je vještački turn limit`);
    assert.equal(game.pendingTriggers.length, 0, `${decks[index]}: ostali pending triggeri`);
  }
});
