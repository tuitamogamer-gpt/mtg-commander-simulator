import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function configuredRoom(MTG) {
  const L = MTG.onlineGameLogic;
  let state = L.setup(['host'], { botDecks: ['Doom Prevails', 'Turtle Power'] });
  state = L.applyAction(state, { type: 'join', name: 'Friend' }, 'guest');
  state = L.applyAction(state, { type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true }, 'host');
  state = L.applyAction(state, { type: 'configure', deckId: 'Most Wanted', commanderNames: ['Olivia, Opulent Outlaw'], ready: true }, 'guest');
  return state;
}

test('online room has exactly two human seats and two locked local AI seats', () => {
  const MTG = loadEngine();
  const state = MTG.onlineGameLogic.setup(['host']);
  assert.deepEqual(Array.from(state.seats, seat => seat.kind), ['human', 'human', 'bot', 'bot']);
  assert.equal(state.seats[0].role, 'host');
  assert.equal(state.seats[1].role, 'guest');
  assert.ok(state.seats.slice(2).every(seat => seat.connected && seat.ready));
  assert.equal(MTG.onlineGameLogic.meta().maxPlayers, 2);
});

test('only host starts and all four seats require distinct decks', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = configuredRoom(MTG);
  assert.equal(L.validateAction(state, { type: 'start', seed: 42 }, 'guest').ok, false);
  assert.equal(L.validateAction(state, { type: 'start', seed: 42 }, 'host').ok, true);
  state = L.applyAction(state, { type: 'configureBot', seat: 2, deckId: 'Elven Council' }, 'host');
  assert.match(L.validateAction(state, { type: 'start', seed: 42 }, 'host').error, /different decks/i);
});

test('room filters host and guest snapshots and validates remote decision ownership', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = configuredRoom(MTG);
  state = L.applyAction(state, { type: 'start', seed: 42 }, 'host');
  state = L.applyAction(state, { type: 'sync', views: { 0: { hand: ['host-only'] }, 1: { hand: ['guest-only'] } } }, 'host');
  const decision = { id: 'd1', seat: 1, type: 'chooseOption', prompt: 'Choose', legal: { kind: 'token', tokens: ['yes', 'no'] } };
  state = L.applyAction(state, { type: 'decisionRequest', decision }, 'host');
  const hostView = L.viewFor(state, 'host');
  const guestView = L.viewFor(state, 'guest');
  assert.deepEqual(Array.from(hostView.gameView.hand), ['host-only']);
  assert.deepEqual(Array.from(guestView.gameView.hand), ['guest-only']);
  assert.equal(hostView.pendingDecision, null);
  assert.equal(guestView.pendingDecision.id, 'd1');
  assert.equal(L.validateAction(state, { type: 'decisionResponse', decisionId: 'd1', response: 'maybe' }, 'guest').ok, false);
  assert.equal(L.validateAction(state, { type: 'decisionResponse', decisionId: 'd1', response: 'yes' }, 'host').ok, false);
  state = L.applyAction(state, { type: 'decisionResponse', decisionId: 'd1', response: 'yes' }, 'guest');
  assert.equal(L.viewFor(state, 'host').lastDecision.response, 'yes');
  assert.equal(L.viewFor(state, 'guest').lastDecision, null);
});

test('disconnect pauses a running room and host resumes only after both humans reconnect', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = L.applyAction(configuredRoom(MTG), { type: 'start', seed: 42 }, 'host');
  state = L.applyAction(state, { type: 'presence', connected: false }, 'guest');
  assert.equal(state.phase, 'paused');
  assert.equal(state.pause.seat, 1);
  assert.equal(L.validateAction(state, { type: 'resume' }, 'host').ok, false);
  state = L.applyAction(state, { type: 'reconnect' }, 'guest');
  state = L.applyAction(state, { type: 'resume' }, 'host');
  assert.equal(state.phase, 'running');
});

test('assignment validation rejects a globally visible but illegal card-target pair', () => {
  const MTG = loadEngine();
  const legal = {
    kind: 'assignments', left: ['c:1'], right: ['p:1', 'p:2'],
    pairs: ['c:1|p:1'], required: [], min: 0, max: 1,
  };
  assert.equal(MTG.validateOnlineDecisionResponse(legal, [{ left: 'c:1', right: 'p:2' }]).ok, false);
  assert.equal(MTG.validateOnlineDecisionResponse(legal, [{ left: 'c:1', right: 'p:1' }]).ok, true);
});

test('remote controller sends a private view and hydrates tokens back into engine objects', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 7, paced: false });
  const remote = game.addPlayer('Player 2', { name: 'Remote deck' }, null, false);
  remote.onlineSeat = 1;
  const opponent = game.addPlayer('Opponent', { name: 'Other deck' }, null, true);
  opponent.onlineSeat = 2;
  const own = new MTG.CardInst(Object.assign({}, MTG.DEFS['Sol Ring']), remote);
  own.zone = 'hand'; remote.hand.push(own);
  const hidden = new MTG.CardInst(Object.assign({}, MTG.DEFS['Arcane Signet']), opponent);
  hidden.zone = 'hand'; opponent.hand.push(hidden);
  let payload;
  remote.controller = MTG.remoteControllerFor(remote, {
    async requestDecision(request) {
      payload = request;
      return request.descriptor.options[1].token;
    },
  });
  const answer = await remote.controller.decide(game, {
    type: 'chooseOption', prompt: 'Choose one',
    options: [{ key: 'a', label: 'First' }, { key: 'b', label: 'Second' }],
  });
  assert.equal(answer, 'b');
  assert.equal(payload.view.players.find(player => player.seat === 1).hand[0].name, 'Sol Ring');
  assert.equal(payload.view.players.find(player => player.seat === 2).hand, undefined);
  assert.equal(payload.view.players.find(player => player.seat === 2).handCount, 1);
});

test('newGame supports Player 2 plus exactly two deterministic AI V2 controllers', () => {
  const MTG = loadEngine();
  const first = 'Doom Prevails';
  const second = 'Elven Council';
  const bots = MTG.selectOnlineBotDecks([first, second], ['Turtle Power', 'Most Wanted'], MTG.mulberry32(3));
  const controller = { decide: async () => false };
  const game = MTG.newGame({
    humanDeck: first,
    humanController: () => controller,
    remoteHuman: { deck: second, name: 'Friend', controller: () => controller },
    aiDecks: bots,
    aiStyles: ['balanced', 'balanced'],
    seed: 3,
    difficulty: 'normal',
    paced: false,
  });
  assert.equal(game.players.length, 4);
  assert.equal(game.players.filter(player => !player.isAI).length, 2);
  assert.equal(game.players.filter(player => player.isAI).length, 2);
  assert.ok(game.players.filter(player => player.isAI).every(player => player.controller instanceof MTG.AIController));
  assert.deepEqual(new Set(game.players.map(player => player.deckName)).size, 4);
});
