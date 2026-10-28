import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
import * as server from '../logic.js';

const M = loadEngine(), wire = value => JSON.parse(JSON.stringify(value));
function room() {
  const L = M.onlineGameLogic;
  let state = L.setup(['host', 'guest'], {playerCount: 2});
  for (const [id, deckId] of [['host', 'Abzan Armor'], ['guest', 'Elven Council']])
    state = L.applyAction(state, {type: 'configure', deckId}, id);
  return wire(L.applyAction(state, {type: 'start', seed: 71}, 'host'));
}
function table() {
  const g = new M.Game({seed: 77, paced: true}); g.pace = async () => {};
  const host = g.addPlayer('Host', {name: 'Wipe host'}, null, false);
  const guest = g.addPlayer('Guest', {name: 'Wipe guest'}, null, false);
  host.onlineSeat = 0; guest.onlineSeat = 1;
  host.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (['effectReview', 'cardReveal', 'threatAlert'].includes(q.type)) return null;
    throw Error('Unexpected host decision: ' + q.type);
  }};
  g.turnPlayer = host; g.turnNo = 8; g.phase = 'main1'; g.step = 'main';
  const put = (name, owner = host, zone = 'battlefield') => {
    const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone; c.sick = false;
    (zone === 'battlefield' ? g.battlefield : owner[zone]).push(c); return c;
  };
  return {g, host, guest, put};
}

for (const [spell, count, tokens] of [
  ['Blasphemous Act', 8, false],
  ['Blasphemous Act', 32, true],
  ['Wrath of God', 16, false],
  ['Chain Reaction', 16, true],
]) test(`${spell}: ${count + 1} simultaneous deaths fit Live limits and retain remote trigger order`, async () => {
  const {g, host, guest, put} = table(), artist = put('Blood Artist', guest), creatures = [artist];
  for (let i = 0; i < count; i++) {const c = put('Grizzly Bears', i % 2 ? guest : host); c.isToken = tokens; creatures.push(c);}
  let requests = 0, ordered, original;
  const model = new M.OnlineArenaView();
  guest.controller = M.remoteControllerFor(guest, {requestDecision: async payload => {
    const descriptor = wire(payload.descriptor), q = payload.question;
    const views = Object.fromEntries([host, guest].map(p => [p.onlineSeat, wire(M.onlineGameViewFor(g, p))]));
    assert.deepEqual(server.validateAction(room(), 'host', {type: 'sync', views}), {ok: true});
    assert.deepEqual(server.validateAction(room(), 'host', {type: 'decisionRequest', decision: descriptor}), {ok: true});
    model.update(views[guest.onlineSeat], guest.onlineSeat);
    const displayed = model.decision(descriptor);
    if (q.type === 'orderTriggers') {
      requests++; original = q.triggers.slice();
      assert.equal(displayed.triggers.length, count + 1, 'every simultaneous death remains a separate trigger');
      assert.ok(JSON.stringify(descriptor).length < 100_000, 'public ordering metadata stays well below the transport limits');
      assert.ok(displayed.triggers.every(tr => tr.src === model.byIid(artist.iid)));
      assert.deepEqual(wire(displayed.triggers.map(tr => tr.triggerOrigin)), wire(q.triggers.map(tr => tr.triggerOrigin)));
      assert.ok(displayed.triggers.every(tr => tr.name === 'Drain 1' && !('data' in tr) && !('sourceMeta' in tr)));
      ordered = q.triggers.slice().reverse();
      model.currentQuestion = null;
      return displayed.triggers.map((_tr, index) => `t:${index}`).reverse();
    }
    model.currentQuestion = null;
    if (q.type === 'priority') return 'pass';
    if (q.type === 'chooseTargets') return [`p:${host.idx}`];
    if (['effectReview', 'cardReveal', 'threatAlert'].includes(q.type)) return null;
    throw Error('Unexpected guest decision: ' + q.type);
  }});
  const remote = guest.controller;
  guest.controller = {decide: async (game, q) => {
    const answer = await remote.decide(game, q);
    if (q.type === 'orderTriggers') {
      assert.deepEqual(Array.from(answer), Array.from(ordered), 'wire indices hydrate to the exact original trigger objects');
      assert.ok(q.triggers.every((tr, index) => tr === original[index]), 'presentation leaves the engine question unchanged');
    }
    return answer;
  }};
  g.recalc(); const card = put(spell, host, 'hand'); host.pool.R = 9; host.pool.W = 4;
  assert.equal(await g.castSpell(host, card, {from: 'hand'}), true);
  assert.equal(requests, 1); assert.equal(card.zone, 'graveyard');
  assert.ok(creatures.every(c => c.zone !== 'battlefield'));
  assert.equal(host.life, 40 - count - 1); assert.equal(guest.life, 40 + count + 1);
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  assertGameStateInvariants(g);
});

test('Live trigger ordering preserves mixed provenance, identical names and a delayed source with no origin', () => {
  const {g, host, guest, put} = table(), source = put('Blood Artist', guest);
  const triggers = [
    {name: 'Drain 1', src: source, ctrl: guest, triggerOrigin: {event: 'dies', source: {name: source.name}, index: 1, total: 2, nativeCount: 1}},
    {name: 'Drain 1', src: source, ctrl: guest, triggerOrigin: {event: 'dies', source: {name: source.name}, index: 2, total: 2, nativeCount: 1, addedBy: {name: 'Teysa Karlov'}}},
    {name: 'Delayed effect', src: null, ctrl: guest},
  ];
  g.recalc();
  const q = {type: 'orderTriggers', player: guest, triggers, prompt: 'Order triggers'};
  const descriptor = wire(M.onlineDecisionDescriptor(g, q, guest, 'mixed'));
  const model = new M.OnlineArenaView(); model.update(wire(M.onlineGameViewFor(g, guest)), guest.onlineSeat);
  const displayed = model.decision(descriptor);
  assert.equal(displayed.triggers.length, 3);
  assert.notEqual(displayed.triggers[0], displayed.triggers[1], 'same-name abilities keep distinct index identities');
  assert.equal(displayed.triggers[2].name, 'Delayed effect'); assert.equal(displayed.triggers[2].src, null);
  assert.equal(displayed.triggers[2].triggerOrigin, undefined);
  assert.deepEqual(wire(displayed.triggers.map(tr => tr.triggerOrigin)), wire(triggers.map(tr => tr.triggerOrigin)));
  assert.deepEqual(server.validateAction(room(), 'host', {type: 'decisionRequest', decision: descriptor}), {ok: true});
  assert.equal(host.life, 40);
});

test('a large wipe keeps the following optional death-trigger choice within Live limits', async () => {
  const {g, host, guest, put} = table(), solemn = put('Solemn Simulacrum', guest);
  const drawn = put('Island', guest, 'library');
  for (let i = 0; i < 64; i++) {const c = put('Grizzly Bears', i % 2 ? guest : host); c.isToken = true;}
  let optionalChoices = 0;
  guest.controller = M.remoteControllerFor(guest, {requestDecision: async payload => {
    const descriptor = wire(payload.descriptor), q = payload.question;
    assert.deepEqual(server.validateAction(room(), 'host', {type: 'decisionRequest', decision: descriptor}), {ok: true});
    if (q.type === 'chooseOption') {
      optionalChoices++;
      assert.ok(JSON.stringify(descriptor).length < 20_000);
      const model = new M.OnlineArenaView(); model.update(wire(payload.view), guest.onlineSeat);
      const displayed = model.decision(descriptor);
      assert.equal(displayed.data.card, model.byIid(solemn.iid), 'the optional-choice card remains visible');
      assert.deepEqual(Object.keys(displayed.data), ['card']);
      assert.ok(q.data.snap && q.data.oracleBatchEventsV9, 'the authoritative rules event is unchanged');
      return 'yes';
    }
    if (q.type === 'priority') return 'pass';
    if (['effectReview', 'cardReveal', 'threatAlert'].includes(q.type)) return null;
    throw Error('Unexpected optional-trigger decision: ' + q.type);
  }});
  g.recalc(); const wipe = put('Blasphemous Act', host, 'hand'); host.pool.R = 9;
  assert.equal(await g.castSpell(host, wipe, {from: 'hand'}), true);
  assert.equal(optionalChoices, 1); assert.equal(drawn.zone, 'hand');
  assert.equal(guest.hand[0], drawn); assert.equal(solemn.zone, 'graveyard');
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  assertGameStateInvariants(g);
});
