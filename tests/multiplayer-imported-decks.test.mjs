import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import * as serverLogic from '../logic.js';
import { createCommanderLiveServer, createMemoryRoomStore } from '../api/ws.js';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const clone = value => JSON.parse(JSON.stringify(value));
const record = {
  schema: 'commander-deck/v1', id: 'deck-live-import-0001', name: 'Guest Forest Workshop',
  commanders: ['Dwynen, Gilt-Leaf Daen'],
  cards: [
    { name: 'Dwynen, Gilt-Leaf Daen', n: 1, section: 'Commander' },
    { name: 'Sol Ring', n: 1, section: 'Main' },
    { name: 'Forest', n: 98, section: 'Main' },
  ],
};
const implementations = [
  ['server room', serverLogic],
  ['browser room', {
    setup: (...args) => MTG.onlineGameLogic.setup(...args),
    validateAction: (state, playerId, action) => MTG.onlineGameLogic.validateAction(state, action, playerId),
    applyAction: (state, playerId, action) => MTG.onlineGameLogic.applyAction(state, action, playerId),
    viewFor: (...args) => MTG.onlineGameLogic.viewFor(...args),
  }],
];

for (const [label, logic] of implementations) {
  test(`${label}: canonical guest list reaches only its owner and the host and clears on deck change`, () => {
    let state = logic.setup(['host', 'owner', 'other'], { playerCount: 3 });
    const action = { type: 'configure', deckId: record.name, deckRecord: { ...clone(record), ignoredMetadata: 'not-card-rules' }, commanderNames: record.commanders };
    assert.equal(logic.validateAction(state, 'owner', action).ok, true);
    state = logic.applyAction(state, 'owner', action);
    assert.deepEqual(clone(state.seats[1].deckRecord), record);
    for (const viewer of ['host', 'owner']) {
      assert.deepEqual(clone(logic.viewFor(state, viewer).seats[1].deckRecord), record);
    }
    for (const viewer of ['other', 'unseated']) {
      const seat = logic.viewFor(state, viewer).seats[1];
      assert.equal(seat.deckImported, true);
      assert.equal(seat.deckRecord, null);
    }
    const exposed = logic.viewFor(state, 'host');
    exposed.seats[1].deckRecord.cards[2].n = 1;
    assert.equal(state.seats[1].deckRecord.cards[2].n, 98, 'views cannot mutate the stored list');
    state = logic.applyAction(state, 'owner', { type: 'configure', deckId: 'Elven Council' });
    assert.equal(state.seats[1].deckRecord, null);
    assert.equal(logic.viewFor(state, 'host').seats[1].deckImported, false);
  });

  test(`${label}: malformed or mismatched imported lists are rejected before changing a seat`, () => {
    const state = logic.setup(['host', 'owner'], { playerCount: 2 });
    const invalid = [
      { ...record, schema: 'arbitrary-code/v1' },
      { ...record, id: 'bad-id' },
      { ...record, commanders: [] },
      { ...record, commanders: [...record.commanders, ...record.commanders] },
      { ...record, cards: record.cards.map(row => ({ ...row, n: String(row.n) })) },
      { ...record, cards: record.cards.map(row => ({ ...row, n: row.n === 98 ? 97 : row.n })) },
      { ...record, cards: record.cards.map(row => ({ ...row, section: 'Main' })) },
      { ...record, cards: [...record.cards.slice(0, 2), { name: 'Forest', n: 49, section: 'Main' }, { name: 'forest', n: 49, section: 'Main' }] },
      { ...record, cards: [...record.cards, { name: 'Extra', n: 0, section: 'Main' }] },
      { ...record, cards: [{ ...record.cards[0] }, ...Array.from({ length: 99 }, (_, index) => ({ name: `${index}-${'界'.repeat(150)}`, n: 1, section: 'Main' }))] },
    ];
    for (const deckRecord of invalid) {
      assert.equal(logic.validateAction(state, 'owner', { type: 'configure', deckId: record.name, deckRecord }).ok, false);
    }
    assert.equal(logic.validateAction(state, 'owner', { type: 'configure', deckId: 'Another deck', deckRecord: record }).ok, false);
    assert.equal(state.seats[1].deckId, null);
    assert.equal(state.seats[1].deckRecord, null);
  });
}

function socketClient(url, playerId) {
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
  const waitFor = predicate => {
    const existing = messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error('Timed out waiting for imported-deck room state.'));
      }, 5000);
      waiters.add(waiter);
    });
  };
  return {
    ws, messages, waitFor,
    async join() {
      await opened;
      ws.send(JSON.stringify({ type: 'join', playerId }));
      return waitFor(message => message.type === 'state' && message.view?.you !== null);
    },
    async act(action) {
      const revision = messages.filter(message => message.type === 'state')
        .reduce((max, message) => Math.max(max, message.view.revision), -1);
      ws.send(JSON.stringify({ type: 'action', action }));
      const message = await waitFor(message => message.type === 'error' ||
        (message.type === 'state' && message.view.revision > revision &&
          message.view.lastEvent?.type === action.type && message.view.lastEvent?.seat === message.view.you));
      assert.notEqual(message.type, 'error', message.error);
      return message;
    },
  };
}

test('real WebSockets carry a guest-only imported deck into host validation, deck construction and paid Stack resolution', async t => {
  const server = createCommanderLiveServer({ store: createMemoryRoomStore() });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `ws://127.0.0.1:${server.address().port}/api/ws?room=guest-import-launch-0001`;
  const clients = [];
  t.after(async () => {
    clients.forEach(client => client.ws.terminate());
    await new Promise(resolve => server.close(resolve));
    delete MTG.DECKS[record.name];
    delete MTG.DECK_META[record.name];
  });
  for (let seat = 0; seat < 3; seat++) {
    const client = socketClient(base + (seat === 0 ? '&create=1&players=3' : ''), `launch-import-player-${seat}`);
    clients.push(client);
    assert.equal((await client.join()).view.you, seat);
  }
  const [host, owner, other] = clients;
  assert.equal(MTG.DECKS[record.name], undefined, 'the host has never registered the guest list');
  const validated = MTG.validateImportedDeckRecord(record);
  assert.equal(validated.ok, true, validated.errors.map(error => error.message).join('\n'));
  await host.act({ type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true });
  const ownerState = await owner.act({ type: 'configure', deckId: record.name, deckRecord: record, commanderNames: record.commanders, ready: true });
  assert.deepEqual(ownerState.view.seats[1].deckRecord, record);
  const hostState = await host.waitFor(message => message.type === 'state' && message.view.seats[1].deckImported);
  const otherState = await other.waitFor(message => message.type === 'state' && message.view.seats[1].deckImported);
  assert.deepEqual(hostState.view.seats[1].deckRecord, record);
  assert.equal(otherState.view.seats[1].deckRecord, null);
  assert.doesNotMatch(JSON.stringify(otherState), /Sol Ring|"cards"/);
  await other.act({ type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true });
  const running = (await host.act({ type: 'start', seed: 9052026 })).view;
  assert.equal(running.phase, 'running');
  const adopted = MTG.adoptImportedDeckRecord(running.seats[1].deckRecord);
  assert.equal(adopted.ok, true, adopted.error);

  const controller = { decide: async (_game, query) => query.type === 'priority' ? { kind: 'pass' } : null };
  const game = new MTG.Game({ seed: running.settings.seed, paced: false });
  const guest = game.addPlayer('Guest', MTG.DECKS[record.name], controller, false);
  guest.chosenCommanders = record.commanders.slice();
  game.buildDeck(guest, guest.deck, MTG.DEFS);
  game.addPlayer('Host', { name: 'Priority witness' }, controller, false);
  assert.equal(guest.library.length + guest.command.length, 100);
  assert.equal(guest.command[0].name, record.commanders[0]);
  const take = name => guest.library.splice(guest.library.findIndex(card => card.name === name), 1)[0];
  const land = take('Forest');
  land.zone = 'battlefield'; land.tapped = false; game.battlefield.push(land);
  const spell = take('Sol Ring');
  spell.zone = 'hand'; guest.hand.push(spell);
  game.turnPlayer = guest; game.turnNo = 2; game.phase = 'main1'; game.recalc();
  const stackSizes = [];
  game.onEvent = event => { if (event.type === 'stack') stackSizes.push(game.stack.length); };
  const cast = game.castableList(guest).find(entry => entry.card === spell);
  assert.ok(cast, 'the guest imported spell is legally payable');
  assert.equal(await game.castSpell(guest, spell, cast), true);
  assert.equal(land.tapped, true, 'the real cast spent available mana');
  assert.ok(stackSizes.includes(1), 'the spell entered the normal Stack');
  assert.equal(spell.zone, 'battlefield');
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
});
