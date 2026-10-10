import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const random = M.mulberry32(101026704);
const available = Object.keys(M.DECKS).sort();
const decks = [];
while (decks.length < 4) {
  const next = available[Math.floor(random() * available.length)];
  if (!decks.includes(next)) decks.push(next);
}
const progress = record => {
  if (process.env.MATCH_AUDIT_PROGRESS) fs.appendFileSync(process.env.MATCH_AUDIT_PROGRESS, JSON.stringify({timestamp: new Date().toISOString(), ...record}) + '\n');
};

for (let seat = 0; seat < 4; seat++) test(`Four seeded random native decks finish with designated player at starting seat ${seat + 1}`, {timeout: 90_000}, async t => {
  let game, seed;
  // The normal loader randomizes seats. Select a reproducible seed yielding
  // each position rather than rewriting players or the turn order.
  for (seed = 101026710; seed < 101026810; seed++) {
    game = M.newGame({humanDeck: decks[0], aiDecks: decks.slice(1), aiStyles: ['balanced','balanced','balanced'],
      difficulty: 'normal', seed, maxTurns: 200, paced: false,
      onEvent: event => {if (event.type === 'log' && event.cls === 'warn') progress({event: 'warning', seed, message: event.msg});}});
    if (game.players.find(player => player.onlineSeat === 0).idx === seat) break;
  }
  assert.ok(seed < 101026810, 'seed search finds the requested natural starting position');
  const positions = game.players.map(player => ({seat: player.idx + 1, name: player.name, deck: player.deckName, isAI: player.isAI}));
  progress({event: 'start', seed, positions});
  const boundaries = [];
  let checkpoints = 0;
  game.onTurnCheckpoint = () => {
    checkpoints++;
    progress({event: 'checkpoint', seed, turn: game.turnNo, activeSeat: game.turnPlayer?.idx, life: game.players.map(player => player.life)});
    try {assertGameStateInvariants(game, `seed ${seed}, turn ${game.turnNo}`);}
    catch (error) {boundaries.push(error.message);}
  };
  await game.start();
  progress({event: 'completed', seed, turns: game.turnNo, winner: game.winner?.name});
  assert.equal(game.gameOver, true);
  assert.ok(game.winner, 'the match has a winner');
  assert.ok(game.turnNo < game.maxTurns, 'the match ends naturally before the artificial turn limit');
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false,
    'all decisions use the native AI policy');
  assert.equal(game.log.some(row => /AI V2 fallback/i.test(row.msg)), false,
    'the completed match has no AI fallback warnings');
  assert.deepEqual(boundaries, [], 'all completed-turn boundaries preserve card, zone, controller, counter and mana invariants');
  assertGameStateInvariants(game, `completed seed ${seed}`);
  assert.ok(checkpoints > 1);
  t.diagnostic(JSON.stringify({seed, positions, turns: game.turnNo, checkpoints, winner: game.winner.name,
    winnerSeat: game.winner.idx + 1, winnerDeck: game.winner.deckName, survivingSeats: game.alivePlayers().map(player => player.idx + 1)}));
});
