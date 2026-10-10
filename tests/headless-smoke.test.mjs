import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants } from './helpers/game-state-invariants.mjs';

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
  // Separate processes can split the long sweep without changing any deck's
  // original index, opponents, seed, or completion assertions. Default: all.
  const shardCount = Number(process.env.HEADLESS_SHARD_COUNT || 1);
  const shardIndex = Number(process.env.HEADLESS_SHARD_INDEX || 0);
  assert.ok(Number.isSafeInteger(shardCount) && shardCount >= 1 && shardCount <= decks.length, 'valid headless shard count');
  assert.ok(Number.isSafeInteger(shardIndex) && shardIndex >= 0 && shardIndex < shardCount, 'valid headless shard index');
  for (let index = 0; index < decks.length; index++) {
    if (index % shardCount !== shardIndex) continue;
    if(process.env.HEADLESS_PROGRESS)console.log(`Deck smoke ${index+1}/${decks.length}: ${decks[index]}`);
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
    const positions = game.players.map(player => ({seat: player.idx + 1, deck: player.deckName, isAI: player.isAI}));
    let checkpoints = 0;
    const boundaryFailures = [];
    game.onTurnCheckpoint = () => {
      checkpoints++;
      try { assertGameStateInvariants(game, `${decks[index]}: completed turn ${game.turnNo}`); }
      catch (error) { boundaryFailures.push(error.message); }
    };
    await game.start();
    assert.ok(game.gameOver, `${decks[index]}: partija nije završila`);
    assert.ok(game.winner, `${decks[index]}: nema pobjednika u smoke partiji`);
    assert.ok(game.turnNo < game.maxTurns, `${decks[index]}: dostignut je vještački turn limit`);
    assert.equal(game.pendingTriggers.length, 0, `${decks[index]}: ostali pending triggeri`);
    assert.deepEqual(boundaryFailures, [], `${decks[index]}: turn boundaries preserve native game-state invariants`);
    assertGameStateInvariants(game, `${decks[index]}: completed match`);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false, `${decks[index]}: no native AI fallback decisions`);
    assert.equal(game.log.some(row => /AI V2 fallback/i.test(row.msg)), false, `${decks[index]}: no native AI fallback warnings`);
    if(process.env.HEADLESS_PROGRESS)console.log(`Finished ${decks[index]}: turn ${game.turnNo}, winner ${game.winner.name}`);
    if(process.env.HEADLESS_PROGRESS)console.log(JSON.stringify({deckIndex:index,seed:11_081+index,positions,
      turns:game.turnNo,checkpoints,winnerSeat:game.winner.idx+1,winnerDeck:game.winner.deckName,
      survivingSeats:game.alivePlayers().map(player=>player.idx+1)}));
  }
});
