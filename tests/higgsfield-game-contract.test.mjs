import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as gameLogic from '../logic.js';

function configuredState() {
  const room = { state: gameLogic.setup(['host-id', 'guest-id']) };
  const act = (playerId, action) => {
    assert.equal(gameLogic.validateAction(room.state, playerId, action).ok, true);
    room.state = gameLogic.applyAction(room.state, playerId, action);
  };
  act('host-id', { type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  act('guest-id', { type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true });
  act('host-id', { type: 'configureBot', seat: 2, deckId: 'Doom Prevails', aiStyle: 'balanced' });
  act('host-id', { type: 'configureBot', seat: 3, deckId: 'Turtle Power', aiStyle: 'balanced' });
  room.act = act;
  return room;
}

test('legacy Higgsfield module exports the exact six-function room contract', async () => {
  assert.deepEqual(gameLogic.meta, { game: 'Commander Live', minPlayers: 2, maxPlayers: 2 });
  for (const name of ['setup', 'validateAction', 'applyAction', 'isGameOver', 'viewFor']) {
    assert.equal(typeof gameLogic[name], 'function', `${name} export`);
  }
  const source = await readFile(new URL('../logic.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\bset(?:Timeout|Interval)\s*\(/);
});

test('legacy room accepts only two humans plus two bots and starts deterministically', () => {
  const room = configuredState();
  assert.deepEqual(room.state.seats.map(seat => seat.kind), ['human', 'human', 'bot', 'bot']);
  assert.equal(gameLogic.validateAction(room.state, 'guest-id', { type: 'start', seed: 7 }).ok, false);
  room.act('host-id', { type: 'start', seed: 7 });
  assert.equal(room.state.phase, 'running');
  assert.equal(room.state.settings.seed, 7);
  assert.deepEqual(gameLogic.isGameOver(room.state), { over: false });
});

test('legacy room keeps host and guest snapshots private and validates decisions', () => {
  const room = configuredState();
  room.act('host-id', { type: 'start', seed: 9 });
  room.act('host-id', { type: 'sync', views: { 0: { hand: ['host-secret'] }, 1: { hand: ['guest-secret'] } } });
  room.act('host-id', {
    type: 'decisionRequest',
    decision: { id: 'vote-1', seat: 1, type: 'chooseOption', legal: { kind: 'token', tokens: ['fellowship', 'mordor'] } },
  });
  assert.deepEqual(gameLogic.viewFor(room.state, 'host-id').gameView.hand, ['host-secret']);
  assert.deepEqual(gameLogic.viewFor(room.state, 'guest-id').gameView.hand, ['guest-secret']);
  assert.equal(gameLogic.viewFor(room.state, 'host-id').pendingDecision, null);
  assert.equal(gameLogic.viewFor(room.state, 'guest-id').pendingDecision.id, 'vote-1');
  assert.equal(gameLogic.validateAction(room.state, 'guest-id', {
    type: 'decisionResponse', decisionId: 'vote-1', response: 'invalid',
  }).ok, false);
});

test('legacy room reports the winning seat through the platform game-over result', () => {
  const room = configuredState();
  room.act('host-id', { type: 'start', seed: 11 });
  room.act('host-id', { type: 'finish', winnerSeat: 1 });
  assert.deepEqual(gameLogic.isGameOver(room.state), {
    over: true,
    winner: 'guest-id',
    winnerSeat: 1,
  });
});
