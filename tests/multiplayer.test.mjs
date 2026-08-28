import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const LIVE_PLAYERS = [
  { id: 'host', name: 'Host', deckId: 'Abzan Armor', commanders: ['Felothar the Steadfast'] },
  { id: 'guest-2', name: 'Player 2', deckId: 'Elven Council', commanders: ['Galadriel, Elven-Queen'] },
  { id: 'guest-3', name: 'Player 3', deckId: 'Doom Prevails', commanders: ['Doctor Doom, King of Latveria'] },
  { id: 'guest-4', name: 'Player 4', deckId: 'Turtle Power', commanders: ['Heroes in a Half Shell'] },
];

function configuredRoom(MTG, playerCount = 4) {
  const L = MTG.onlineGameLogic;
  let state = L.setup(['host'], { playerCount });
  for (const player of LIVE_PLAYERS.slice(1, playerCount)) {
    state = L.applyAction(state, { type: 'join', name: player.name }, player.id);
  }
  for (const player of LIVE_PLAYERS.slice(0, playerCount)) {
    state = L.applyAction(state, {
      type: 'configure', deckId: player.deckId, commanderNames: player.commanders, name: player.name, ready: true,
    }, player.id);
  }
  return state;
}

test('online room supports two, three, or four human seats with no bots', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  assert.equal(L.meta().minPlayers, 2);
  assert.equal(L.meta().maxPlayers, 4);
  for (const playerCount of [2, 3, 4]) {
    const state = L.setup(['host'], { playerCount });
    assert.equal(state.seats.length, playerCount);
    assert.ok(state.seats.every(seat => seat.kind === 'human' && seat.aiStyle === null));
    assert.equal(state.settings.playerCount, playerCount);
    assert.deepEqual(Object.keys(state.views), Array.from({ length: playerCount }, (_, seat) => String(seat)));
  }
});

test('only host starts after every selected human seat is connected with a different deck', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = configuredRoom(MTG, 4);
  assert.equal(L.validateAction(state, { type: 'start', seed: 42 }, 'guest-2').ok, false);
  assert.equal(L.validateAction(state, { type: 'start', seed: 42 }, 'host').ok, true);
  state = L.applyAction(state, {
    type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true,
  }, 'guest-4');
  assert.match(L.validateAction(state, { type: 'start', seed: 42 }, 'host').error, /different deck/i);
});

test('room filters all four private snapshots and validates remote decision ownership by seat', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = configuredRoom(MTG, 4);
  state = L.applyAction(state, { type: 'start', seed: 42 }, 'host');
  state = L.applyAction(state, { type: 'sync', views: {
    0: { hand: ['host-only'] }, 1: { hand: ['player-2-only'] },
    2: { hand: ['player-3-only'] }, 3: { hand: ['player-4-only'] },
  } }, 'host');
  const decision = {
    id: 'd4', seat: 3, type: 'chooseOption', prompt: 'Choose',
    legal: { kind: 'token', tokens: ['yes', 'no'] },
  };
  state = L.applyAction(state, { type: 'decisionRequest', decision }, 'host');
  const hostView = L.viewFor(state, 'host');
  const player4View = L.viewFor(state, 'guest-4');
  assert.deepEqual(Array.from(hostView.gameView.hand), ['host-only']);
  assert.deepEqual(Array.from(player4View.gameView.hand), ['player-4-only']);
  assert.equal(hostView.pendingDecision, null);
  assert.equal(L.viewFor(state, 'guest-2').pendingDecision, null);
  assert.equal(player4View.pendingDecision.id, 'd4');
  assert.equal(L.validateAction(state, { type: 'decisionResponse', decisionId: 'd4', response: 'yes' }, 'guest-3').ok, false);
  state = L.applyAction(state, { type: 'decisionResponse', decisionId: 'd4', response: 'yes' }, 'guest-4');
  assert.equal(L.viewFor(state, 'host').lastDecision.seat, 3);
  assert.equal(L.viewFor(state, 'host').lastDecision.response, 'yes');
});

test('disconnect pauses a four-human room and host resumes only after every player reconnects', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = L.applyAction(configuredRoom(MTG, 4), { type: 'start', seed: 42 }, 'host');
  state = L.applyAction(state, { type: 'presence', connected: false }, 'guest-3');
  assert.equal(state.phase, 'paused');
  assert.equal(state.pause.seat, 2);
  assert.equal(L.validateAction(state, { type: 'resume' }, 'host').ok, false);
  state = L.applyAction(state, { type: 'reconnect' }, 'guest-3');
  state = L.applyAction(state, { type: 'resume' }, 'host');
  assert.equal(state.phase, 'running');
});

test('Player 4 can request a validated Last Resort correction without exposing its payload to other guests', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = L.applyAction(configuredRoom(MTG, 4), { type: 'start', seed: 42 }, 'host');
  const request = { type: 'manualAction', action: { type: 'setLife', playerSeat: 2, value: 23 } };
  assert.equal(L.validateAction(state, request, 'guest-4').ok, true);
  state = L.applyAction(state, request, 'guest-4');
  const hostView = L.viewFor(state, 'host');
  assert.equal(JSON.stringify(hostView.pendingManualAction.action), JSON.stringify(request.action));
  assert.equal(hostView.pendingManualAction.seat, 3);
  assert.equal(L.viewFor(state, 'guest-2').pendingManualAction, null);
  state = L.applyAction(state, {
    type: 'manualAck', manualId: hostView.pendingManualAction.id, ok: true, message: 'Player 3 life = 23',
  }, 'host');
  assert.equal(L.viewFor(state, 'guest-4').lastManualAction.message, 'Player 3 life = 23');
  assert.equal(L.viewFor(state, 'guest-2').lastManualAction, null);
});

test('host room settings preserve the selected Commander damage rule', () => {
  const MTG = loadEngine();
  const L = MTG.onlineGameLogic;
  let state = configuredRoom(MTG, 3);
  assert.equal(L.validateAction(state, { type: 'configureSettings', sumPartnerDamage: true }, 'guest-2').ok, false);
  state = L.applyAction(state, { type: 'configureSettings', sumPartnerDamage: true }, 'host');
  assert.equal(state.settings.sumPartnerDamage, true);
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
  game.lastResortPaused = true;
  const remote = game.addPlayer('Player 4', { name: 'Remote deck' }, null, false);
  remote.onlineSeat = 3;
  const opponent = game.addPlayer('Opponent', { name: 'Other deck' }, null, false);
  opponent.onlineSeat = 2;
  const own = new MTG.CardInst(Object.assign({}, MTG.DEFS['Sol Ring']), remote);
  own.zone = 'hand'; remote.hand.push(own);
  const hidden = new MTG.CardInst(Object.assign({}, MTG.DEFS['Arcane Signet']), opponent);
  hidden.zone = 'hand'; opponent.hand.push(hidden);
  const facedownExile = new MTG.CardInst(Object.assign({}, MTG.DEFS['Swords to Plowshares']), opponent);
  facedownExile.zone = 'exile'; facedownExile.faceDown = true; opponent.exile.push(facedownExile);
  const publicExile = new MTG.CardInst(Object.assign({}, MTG.DEFS['Sol Ring']), opponent);
  publicExile.zone = 'exile'; opponent.exile.push(publicExile);
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
  assert.equal(payload.descriptor.seat, 3);
  assert.equal(payload.view.players.find(player => player.seat === 3).hand[0].name, 'Sol Ring');
  assert.equal(payload.view.players.find(player => player.seat === 2).hand, undefined);
  assert.equal(payload.view.players.find(player => player.seat === 2).handCount, 1);
  assert.equal(payload.view.players.find(player => player.seat === 2).exile[0].name, 'Hidden card');
  assert.equal(payload.view.players.find(player => player.seat === 2).exile[1].name, 'Sol Ring');
});

test('newGame supports four human controllers and no AI seats', () => {
  const MTG = loadEngine();
  const controller = { decide: async () => false };
  const game = MTG.newGame({
    humanDeck: 'Abzan Armor', humanController: () => controller,
    remoteHumans: LIVE_PLAYERS.slice(1).map(player => ({
      deck: player.deckId, name: player.name, commanders: player.commanders, controller: () => controller,
    })),
    aiDecks: [], aiStyles: [], seed: 3, difficulty: 'normal', paced: false,
  });
  assert.equal(game.players.length, 4);
  assert.equal(game.players.filter(player => !player.isAI).length, 4);
  assert.equal(game.players.filter(player => player.isAI).length, 0);
  assert.deepEqual(new Set(game.players.map(player => player.onlineSeat)), new Set([0, 1, 2, 3]));
  assert.equal(new Set(game.players.map(player => player.deckName)).size, 4);
});

test('Vercel room invite restores the private share token, room code, and selected player count', () => {
  const MTG = loadEngine();
  const invite = new URL(MTG.onlineRoomShareUrl(
    'https://commander-live.vercel.app/?commander_share=private-token&onlineSmoke=host&noise=1#debug',
    'room-42', 4,
  ));
  assert.equal(invite.searchParams.get('_vercel_share'), 'private-token');
  assert.equal(invite.searchParams.get('room'), 'room-42');
  assert.equal(invite.searchParams.get('players'), '4');
  assert.equal(invite.searchParams.has('onlineSmoke'), false);
  assert.equal(invite.searchParams.has('noise'), false);
  assert.equal(invite.hash, '');
});
