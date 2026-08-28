import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createCommanderLiveServer, createMemoryRoomStore } from '../api/ws.js';

function socketHarness(url, playerId) {
  const ws = new WebSocket(url);
  const opened = once(ws, 'open');
  const messages = [];
  const waiters = new Set();
  ws.on('message', data => {
    const message = JSON.parse(String(data));
    messages.push(message);
    for (const waiter of waiters) {
      if (!waiter.predicate(message)) continue;
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    }
  });
  const waitFor = (predicate, timeout = 3000) => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`Timed out waiting for WebSocket message. Received: ${JSON.stringify(messages.slice(-3))}`));
      }, timeout);
      waiters.add(waiter);
    });
  };
  return {
    ws, messages, waitFor,
    opened: () => opened,
    async join() {
      await opened;
      ws.send(JSON.stringify({ type: 'join', playerId }));
      return waitFor(message => message.type === 'state' && message.view && message.view.you !== null);
    },
    async act(action) {
      const revision = messages.filter(message => message.type === 'state' && message.view)
        .reduce((max, message) => Math.max(max, message.view.revision), -1);
      ws.send(JSON.stringify({ type: 'action', action }));
      const error = waitFor(message => message.type === 'error', 3000).then(message => ({ error: message }));
      const state = waitFor(message => message.type === 'state' && message.view && message.view.revision > revision, 3000)
        .then(message => ({ state: message }));
      const result = await Promise.race([error, state]);
      if (result.error) throw new Error(result.error.error);
      return result.state;
    },
    close() { ws.close(); },
  };
}

test('Vercel room serves four human seats, four private views, and Player 4 decisions through real WebSockets', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = '0123456789abcdef0123456789abcdef';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const clients = [
    socketHarness(`${base}&create=1&players=4`, 'p-host-00000001'),
    socketHarness(base, 'p-guest-0000002'),
    socketHarness(base, 'p-guest-0000003'),
    socketHarness(base, 'p-guest-0000004'),
  ];
  const [host, player2, player3, player4] = clients;
  t.after(async () => {
    clients.forEach(client => client.ws.terminate());
    await new Promise(resolve => server.close(resolve));
  });

  for (let seat = 0; seat < clients.length; seat++) {
    const joined = await clients[seat].join();
    assert.equal(joined.view.you, seat);
    assert.equal(joined.view.settings.playerCount, 4);
    assert.deepEqual(joined.view.seats.map(item => item.kind), ['human', 'human', 'human', 'human']);
    assert.equal('playerId' in joined.view.seats[seat], false);
  }

  const configurations = [
    ['Abzan Armor', ['Felothar the Steadfast']],
    ['Elven Council', ['Galadriel, Elven-Queen']],
    ['Doom Prevails', ['Doctor Doom, King of Latveria']],
    ['Turtle Power', ['Heroes in a Half Shell']],
  ];
  for (let seat = 0; seat < clients.length; seat++) {
    await clients[seat].act({
      type: 'configure', deckId: configurations[seat][0], commanderNames: configurations[seat][1], ready: true,
    });
  }
  await host.act({ type: 'configureSettings', sumPartnerDamage: true });
  const started = await host.act({ type: 'start', seed: 240828 });
  assert.equal(started.view.phase, 'running');
  assert.equal(started.view.settings.seed, 240828);
  assert.equal(started.view.settings.sumPartnerDamage, true);

  await host.act({ type: 'sync', views: {
    0: { hand: ['host-secret'], battlefield: [], players: [], stack: [] },
    1: { hand: ['player-2-secret'], battlefield: [], players: [], stack: [] },
    2: { hand: ['player-3-secret'], battlefield: [], players: [], stack: [] },
    3: { hand: ['player-4-secret'], battlefield: [], players: [], stack: [] },
  } });
  for (let seat = 0; seat < clients.length; seat++) {
    const privateState = await clients[seat].waitFor(message => message.type === 'state' && message.view.gameView?.hand?.[0] === `${seat === 0 ? 'host' : `player-${seat + 1}`}-secret`);
    assert.equal(privateState.view.gameView.hand.length, 1);
    for (let other = 0; other < clients.length; other++) {
      if (other === seat) continue;
      assert.doesNotMatch(JSON.stringify(privateState.view), new RegExp(`${other === 0 ? 'host' : `player-${other + 1}`}-secret`));
    }
  }

  await host.act({
    type: 'decisionRequest',
    decision: { id: 'player-4-choice', seat: 3, type: 'chooseOption', prompt: 'Choose', legal: { kind: 'token', tokens: ['yes', 'no'] } },
  });
  const player4Decision = await player4.waitFor(message => message.type === 'state' && message.view.pendingDecision?.id === 'player-4-choice');
  assert.equal(player4Decision.view.pendingDecision.seat, 3);
  assert.equal(player2.messages.at(-1).view.pendingDecision, null);
  await player4.act({ type: 'decisionResponse', decisionId: 'player-4-choice', response: 'yes' });
  const hostDecision = await host.waitFor(message => message.type === 'state' && message.view.lastDecision?.id === 'player-4-choice');
  assert.equal(hostDecision.view.lastDecision.seat, 3);

  await player3.act({ type: 'manualAction', action: { type: 'setLife', playerSeat: 2, value: 23 } });
  const hostManual = await host.waitFor(message => message.type === 'state' && message.view.pendingManualAction?.action?.value === 23);
  assert.equal(hostManual.view.pendingManualAction.seat, 2);
  assert.doesNotMatch(JSON.stringify(player2.messages.at(-1)?.view || {}), /pendingManualAction.*setLife/);
  await host.act({ type: 'manualAck', manualId: hostManual.view.pendingManualAction.id, ok: true, message: 'Player 3 life = 23' });
  const player3Manual = await player3.waitFor(message => message.type === 'state' && message.view.lastManualAction?.message === 'Player 3 life = 23');
  assert.equal(player3Manual.view.lastManualAction.ok, true);

  player4.close();
  const paused = await host.waitFor(message => message.type === 'state' && message.view.phase === 'paused');
  assert.equal(paused.view.pause.seat, 3);
});

test('Vercel room enforces the host-selected count and the setup keeps solo play separate', async t => {
  const store = createMemoryRoomStore();
  const server = createCommanderLiveServer({ store });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const room = 'fedcba9876543210fedcba9876543210';
  const base = `ws://127.0.0.1:${address.port}/api/ws?room=${room}`;
  const host = socketHarness(`${base}&create=1&players=3`, 'p-host-00000002');
  const player2 = socketHarness(base, 'p-guest-0000005');
  const player3 = socketHarness(base, 'p-guest-0000006');
  const intruder = socketHarness(base, 'p-fourth-0000007');
  t.after(async () => {
    host.ws.terminate(); player2.ws.terminate(); player3.ws.terminate(); intruder.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  const joined = await host.join();
  assert.equal(joined.view.seats.length, 3);
  await player2.join();
  await player3.join();
  await intruder.opened();
  intruder.ws.send(JSON.stringify({ type: 'join', playerId: 'p-fourth-0000007' }));
  const rejected = await intruder.waitFor(message => message.type === 'error');
  assert.match(rejected.error, /3-player room is full/i);

  const main = await readFile(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  const multiplayer = await readFile(new URL('../src/modules/multiplayer.js', import.meta.url), 'utf8');
  const lobby = await readFile(new URL('../src/modules/multiplayer-ui.js', import.meta.url), 'utf8');
  assert.match(main, /Solo table<\/strong><small>You \+ 1-3 AI V2 bots/);
  assert.match(main, /2–4 humans · no bots/);
  assert.match(main, /livePlayers: 2/);
  assert.match(multiplayer, /players=\$\{playerCount\}/);
  assert.match(multiplayer, /\/api\/ws\?room=/);
  assert.match(lobby, /All \$\{playerCount\} players ready/);
  assert.doesNotMatch(lobby, /configureBot|LOCAL AI V2/);
});
