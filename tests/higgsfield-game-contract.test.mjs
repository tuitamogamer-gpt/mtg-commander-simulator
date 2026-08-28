import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as gameLogic from '../logic.js';

function configuredState() {
  const room = { state: gameLogic.setup(['host-id', 'guest-2', 'guest-3', 'guest-4'], { playerCount: 4 }) };
  const act = (playerId, action) => {
    assert.equal(gameLogic.validateAction(room.state, playerId, action).ok, true);
    room.state = gameLogic.applyAction(room.state, playerId, action);
  };
  act('host-id', { type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  act('guest-2', { type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true });
  act('guest-3', { type: 'configure', deckId: 'Doom Prevails', commanderNames: ['Doctor Doom, King of Latveria'], ready: true });
  act('guest-4', { type: 'configure', deckId: 'Turtle Power', commanderNames: ['Heroes in a Half Shell'], ready: true });
  room.act = act;
  return room;
}

test('legacy Higgsfield module exports the exact six-function room contract', async () => {
  assert.deepEqual(gameLogic.meta, { game: 'Commander Live', minPlayers: 2, maxPlayers: 4 });
  for (const name of ['setup', 'validateAction', 'applyAction', 'isGameOver', 'viewFor']) {
    assert.equal(typeof gameLogic[name], 'function', `${name} export`);
  }
  const source = await readFile(new URL('../logic.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bset(?:Timeout|Interval)\s*\(/);
});

test('legacy room accepts four humans with no bots and starts deterministically', () => {
  const room = configuredState();
  assert.deepEqual(room.state.seats.map(seat => seat.kind), ['human', 'human', 'human', 'human']);
  assert.equal(gameLogic.validateAction(room.state, 'guest-2', { type: 'start', seed: 7 }).ok, false);
  room.act('host-id', { type: 'start', seed: 7 });
  assert.equal(room.state.phase, 'running');
  assert.equal(room.state.settings.seed, 7);
  assert.deepEqual(gameLogic.isGameOver(room.state), { over: false });
});

test('legacy room keeps all human snapshots private and validates a Player 4 decision', () => {
  const room = configuredState();
  room.act('host-id', { type: 'start', seed: 9 });
  room.act('host-id', { type: 'sync', views: {
    0: { hand: ['host-secret'] }, 1: { hand: ['player-2-secret'] },
    2: { hand: ['player-3-secret'] }, 3: { hand: ['player-4-secret'] },
  } });
  room.act('host-id', {
    type: 'decisionRequest',
    decision: { id: 'vote-4', seat: 3, type: 'chooseOption', legal: { kind: 'token', tokens: ['fellowship', 'mordor'] } },
  });
  assert.deepEqual(gameLogic.viewFor(room.state, 'host-id').gameView.hand, ['host-secret']);
  assert.deepEqual(gameLogic.viewFor(room.state, 'guest-4').gameView.hand, ['player-4-secret']);
  assert.equal(gameLogic.viewFor(room.state, 'host-id').pendingDecision, null);
  assert.equal(gameLogic.viewFor(room.state, 'guest-2').pendingDecision, null);
  assert.equal(gameLogic.viewFor(room.state, 'guest-4').pendingDecision.id, 'vote-4');
  assert.equal(gameLogic.validateAction(room.state, 'guest-4', {
    type: 'decisionResponse', decisionId: 'vote-4', response: 'invalid',
  }).ok, false);
});

test('legacy room reports the winning seat through the platform game-over result', () => {
  const room = configuredState();
  room.act('host-id', { type: 'start', seed: 11 });
  room.act('host-id', { type: 'finish', winnerSeat: 3 });
  assert.deepEqual(gameLogic.isGameOver(room.state), {
    over: true,
    winner: 'guest-4',
    winnerSeat: 3,
  });
});
