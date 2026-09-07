import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as server from '../logic.js';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const decks = ['Abzan Armor', 'Elven Council', 'Doom Prevails', 'Turtle Power'];
const browser = {
  setup: MTG.onlineGameLogic.setup,
  validateAction: (s, p, a) => MTG.onlineGameLogic.validateAction(s, a, p),
  applyAction: (s, p, a) => MTG.onlineGameLogic.applyAction(s, a, p),
  viewFor: MTG.onlineGameLogic.viewFor,
};
for (const [name, logic] of [['server', server], ['browser', browser]]) {
  test(`${name}: every 2–4 seat human/bot combination retains ownership, readiness and private decisions`, () => {
    for (let count = 2; count <= 4; count++) for (let mask = 0; mask < 2 ** (count - 1); mask++) {
      let state = logic.setup(['host'], { playerCount: count });
      const act = (action, player = 'host') => {
        assert.equal(logic.validateAction(state, player, action).ok, true, JSON.stringify(action));
        state = logic.applyAction(state, player, action);
      };
      for (let seat = 0; seat < count; seat++) {
        const bot = seat > 0 && !!(mask & (1 << (seat - 1)));
        if (bot) act({ type: 'configureSeat', seat, kind: 'bot' });
        else if (seat > 0) {
          // The WebSocket server assigns the connection before room actions.
          state.seats[seat].playerId = `guest-${seat}`;
          state.seats[seat].connected = true;
        }
        act({ type: 'configure', seat, deckId: decks[seat], ready: true }, bot || seat === 0 ? 'host' : `guest-${seat}`);
      }
      act({ type: 'start', seed: 42 });
      const humans = state.seats.filter(seat => seat.kind === 'human');
      act({ type: 'sync', views: Object.fromEntries(humans.map(seat => [seat.seat, { hand: [`private-${seat.seat}`] }])) });
      assert.deepEqual(Object.keys(state.views), Array.from(humans, seat => String(seat.seat)));
      for (const seat of humans) {
        const view = logic.viewFor(state, seat.playerId);
        assert.deepEqual(Array.from(view.gameView.hand), [`private-${seat.seat}`]);
        assert.equal(view.seats[seat.seat].occupied, true);
      }
      for (const seat of state.seats.slice(1)) {
        const action = { type: 'decisionRequest', decision: { id: `d-${seat.seat}`, seat: seat.seat, legal: { kind: 'ack' } } };
        assert.equal(logic.validateAction(state, 'host', action).ok, seat.kind === 'human');
        if (seat.kind === 'human') {
          act(action);
          assert.equal(logic.viewFor(state, seat.playerId).pendingDecision.id, action.decision.id);
          act({ type: 'decisionResponse', decisionId: action.decision.id, response: 'ok' }, seat.playerId);
          act({ type: 'decisionAck', decisionId: action.decision.id });
        }
      }
      assert.equal(logic.validateAction(state, 'host', { type: 'configureSeat', seat: 1, kind: 'bot' }).ok, false);
    }
  });
  test(`${name}: only host changes empty seats; disconnected human ownership is preserved`, () => {
    let state = logic.setup(['host', 'guest'], { playerCount: 2 });
    assert.equal(logic.validateAction(state, 'guest', { type: 'resizeRoom', playerCount: 4 }).ok, false);
    state = logic.applyAction(state, 'host', { type: 'resizeRoom', playerCount: 4 });
    state.seats[3].playerId = 'away';
    assert.equal(logic.validateAction(state, 'host', { type: 'configureSeat', seat: 3, kind: 'bot' }).ok, false);
    assert.equal(logic.validateAction(state, 'host', { type: 'configureSeat', seat: 0, kind: 'bot' }).ok, false);
    assert.equal(logic.validateAction(state, 'host', { type: 'resizeRoom', playerCount: 2 }).ok, false);
    state = logic.applyAction(state, 'host', { type: 'configureSeat', seat: 2, kind: 'bot' });
    assert.equal(logic.validateAction(state, 'guest', { type: 'configure', seat: 2, deckId: decks[2] }).ok, false);
    assert.equal(logic.validateAction(state, 'host', { type: 'configure', seat: 1, deckId: decks[2] }).ok, false);
    state = logic.applyAction(state, 'host', { type: 'configureSeat', seat: 2, kind: 'human' });
    assert.equal(state.seats[2].ready, false);
    assert.equal(state.seats[2].connected, false);
    assert.equal(state.seats[2].aiStyle, null);
  });
}

test('engine preserves interleaved online seats and instantiates genuine local AI controllers', () => {
  const controller = { decide: async () => false };
  for (const botSeats of [[1, 2, 3], [1, 3], [2]]) {
    const game = MTG.newGame({
      humanDeck: decks[0], humanController: () => controller,
      remoteHumans: [1, 2, 3].filter(seat => !botSeats.includes(seat)).map(seat => ({ onlineSeat: seat, deck: decks[seat], controller })),
      aiDecks: botSeats.map(seat => decks[seat]), aiSeats: botSeats, aiStyles: botSeats.map(() => 'balanced'), seed: 32, paced: false,
    });
    assert.equal(game.players.length, 4);
    for (const player of game.players) {
      assert.equal(player.deckName, decks[player.onlineSeat]);
      assert.equal(player.isAI, botSeats.includes(player.onlineSeat));
      if (player.isAI) assert.equal(typeof player.controller.decide, 'function');
    }
  }
});

function transportHarness(actionAcks) {
  let socket;
  class FakeSocket {
    constructor() { socket = this; this.sent = []; }
    send(value) { this.sent.push(JSON.parse(value)); }
    receive(value) { this.onmessage({ data: JSON.stringify(value) }); }
    close() {}
  }
  const storage = new Map();
  const context = vm.createContext({
    URL, URLSearchParams, crypto: globalThis.crypto, Uint8Array, setTimeout, clearTimeout,
    location: new URL('http://localhost/?room=test-live-room-0001'), history: { replaceState() {} },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) },
    window: { addEventListener() {}, removeEventListener() {} }, WebSocket: FakeSocket,
  });
  vm.runInContext(fs.readFileSync(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8'), context);
  const client = context.MTG.createHiggsfieldRoomClient({ create: true });
  socket.onopen();
  const state = (revision, type, seat = 0) => socket.receive({ type: 'state', status: 'playing', actionAcks,
    view: { revision, you: 0, phase: 'running', seats: [{ seat: 0, connected: true }], lastEvent: { type, seat } } });
  state(1, 'connected');
  return { socket, client, state };
}
for (const acks of [false, true]) test(`transport ${acks ? 'explicit' : 'legacy'} acknowledgment ignores unrelated and stale broadcasts`, async () => {
  const { socket, client, state } = transportHarness(acks);
  let resolved = false;
  const pending = client.dispatch({ type: 'sync', views: {} }).then(() => { resolved = true; });
  state(2, 'configure', 1);
  await Promise.resolve();
  assert.equal(resolved, false, 'another player cannot complete this request');
  state(3, 'sync');
  if (acks) {
    await Promise.resolve();
    assert.equal(resolved, false, 'server confirms the exact request separately');
    socket.receive({ type: 'actionAck', requestId: 'wrong-id' });
    await Promise.resolve();
    assert.equal(resolved, false);
    socket.receive({ type: 'actionAck', requestId: socket.sent.at(-1).requestId });
  }
  await pending;
  state(2, 'configure', 1);
  assert.equal(client.current().revision, 3, 'older publication cannot roll the table back');
  client.close();
});

test('local bots wait for the room to resume before deciding and before returning a computed move', async () => {
  let emit;
  let latest = { phase: 'paused', seats: [{ connected: true }, { connected: false }] };
  const bridge = MTG.onlineHostBridge({ current: () => latest, subscribe: callback => { emit = view => { latest = view; callback(view); }; }, dispatch: async () => {} });
  let calls = 0, finish;
  const controller = bridge.gateController({ decide: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  let returned = false;
  const decision = controller.decide({}, {}).then(value => { returned = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0);
  emit({ phase: 'running', seats: [{ connected: true }, { connected: true }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  emit({ phase: 'paused', seats: [{ connected: true }, { connected: false }] });
  finish('computed-move');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(returned, false);
  emit({ phase: 'running', seats: [{ connected: true }, { connected: true }] });
  assert.equal(await decision, 'computed-move');
});
