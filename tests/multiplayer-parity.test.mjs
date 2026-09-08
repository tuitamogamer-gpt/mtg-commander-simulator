import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { loadEngine } from './helpers/load-engine.mjs';
import * as server from '../logic.js';
const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function table() {
  const game = new M.Game({ seed: 19, paced: false });
  const host = game.addPlayer('Host', { name: 'Host deck' }, null, false);
  const guest = game.addPlayer('Guest', { name: 'Guest deck' }, null, false);
  host.onlineSeat = 0; guest.onlineSeat = 2;
  game.turnPlayer = guest; game.phase = 'main1';
  const card = (name, player = guest, zone = 'battlefield') => {
    const c = new M.CardInst(M.DEFS[name], player); c.zone = zone; c.sick = false;
    if (zone === 'battlefield') game.battlefield.push(c); else player[zone].push(c);
    game.recalc(); return c;
  };
  return { game, host, guest, card };
}
function room() {
  const L = M.onlineGameLogic;
  let state = L.setup(['host', 'guest'], { playerCount: 2 });
  for (const [id, deckId] of [['host', 'Abzan Armor'], ['guest', 'Elven Council']]) state = L.applyAction(state, { type: 'configure', deckId }, id);
  state = L.applyAction(state, { type: 'start', seed: 71 }, 'host');
  return { L, state };
}

test('standalone server room contract is generated from the exact browser version', () => {
  execFileSync(process.execPath, ['scripts/sync-online-room.mjs', '--check']);
  const { L, state } = room();
  assert.equal(server.setup(['host']).protocolVersion, M.ONLINE_PROTOCOL_VERSION);
  assert.deepEqual(server.viewFor(plain(state), 'guest'), plain(L.viewFor(state, 'guest')));
  assert.equal(L.viewFor(state, 'guest').settings.seed, null, 'shuffle seed stays on the authority');
});

test('lands and artifacts never acquire creature P/T while actual animated land characteristics round trip', () => {
  const { game, guest, card } = table();
  const forest = card('Forest'), ring = card('Sol Ring');
  let view = M.onlineGameViewFor(game, guest);
  for (const c of view.battlefield) assert.equal(c.power, undefined);
  forest.cur.types.push('Creature'); forest.cur.power = 5; forest.cur.toughness = 6; forest.damage = 2;
  view = M.onlineGameViewFor(game, guest);
  const model = new M.OnlineArenaView(); model.update(plain(view), 2);
  const animated = model.byIid(forest.iid);
  assert.equal(animated.is('Creature'), true); assert.equal(animated.power, 5); assert.equal(animated.toughness, 6); assert.equal(animated.damage, 2);
  assert.equal(model.byIid(ring.iid).is('Creature'), false);
  assert.equal(model.viewer.onlineSeat, 2); assert.equal(model.viewer.idx, guest.idx);
});

test('full view round trip retains public zones, mana, commander damage and stable entity identities', () => {
  const { game, host, guest, card } = table();
  const ring = card('Sol Ring'), cmd = card('Dwynen, Gilt-Leaf Daen', guest, 'command');
  cmd.commander = true; cmd.cmdCasts = 2; guest.commanders.push(cmd);
  guest.commanderDamage[cmd.iid] = 12; guest.pool.G = 3;
  card('Arcane Signet', host, 'hand'); card('Forest', guest, 'library');
  const model = new M.OnlineArenaView(); model.update(plain(M.onlineGameViewFor(game, guest)), 2);
  const priorPlayer = model.viewer, priorCard = model.byIid(ring.iid);
  assert.equal(model.viewer.pool.G, 3); assert.equal(model.viewer.commanderDamage[cmd.iid], 12);
  assert.equal(model.viewer.commanders[0].cmdCasts, 2);
  assert.equal(model.players[0].hand[0].name, 'Hidden card');
  assert.equal(model.viewer.library[0].name, 'Hidden card');
  ring.tapped = true; model.update(plain(M.onlineGameViewFor(game, guest)), 2);
  assert.equal(model.viewer, priorPlayer); assert.equal(model.byIid(ring.iid), priorCard); assert.equal(priorCard.tapped, true);
  assert.equal(typeof model.castSpell, 'undefined', 'the view has no rules execution engine');
});

test('a developed four-human table fits the room payload limit without losing permanent data', () => {
  const { game, host, guest } = table();
  for (let n = 0; n < 2; n++) game.addPlayer('Human ' + n, {}, null, false).onlineSeat = n ? 3 : 1;
  for (let n = 0; n < 200; n++) {
    const card = new M.CardInst(M.DEFS[n % 2 ? 'Sol Ring' : 'Wall of Omens'], game.players[n % 4]);
    card.zone = 'battlefield'; game.battlefield.push(card);
  }
  game.recalc();
  const views = Object.fromEntries(game.players.map(player => [player.onlineSeat, M.onlineGameViewFor(game, player)]));
  assert.ok(Buffer.byteLength(JSON.stringify(views)) < 2_000_000, 'all four complete views fit the existing room limit');
  for (const player of [host, guest]) {
    const model = new M.OnlineArenaView(); model.update(plain(views[player.onlineSeat]), player.onlineSeat);
    assert.equal(model.battlefield.length, 200);
    assert.equal(model.battlefield.filter(card => card.is('Creature') && card.toughness === 4).length, 100);
  }
});

test('scry and library selections disclose decision cards only to their choosing player', () => {
  const { game, host, guest, card } = table();
  const secret = card('Swords to Plowshares', guest, 'library');
  assert.equal(JSON.stringify(M.onlineGameViewFor(game, host)).includes(secret.name), false);
  assert.equal(JSON.stringify(M.onlineGameViewFor(game, guest)).includes(secret.name), false);
  for (const q of [{ type: 'scry', cards: [secret] }, { type: 'chooseCards', from: [secret], min: 1, max: 1 }]) {
    const d = M.onlineDecisionDescriptor(game, q, guest, q.type);
    assert.equal(d.choices[0].name, secret.name);
    const model = new M.OnlineArenaView(); model.update(plain(M.onlineGameViewFor(game, guest)), 2);
    const decoded = model.decision(plain(d));
    assert.equal((decoded.cards || decoded.from)[0].name, secret.name);
    const inspected = (decoded.cards || decoded.from)[0];
    model.update(plain(M.onlineGameViewFor(game, guest)), 2);
    assert.equal(model.byIid(secret.iid), inspected, 'active private choices keep their entity identity across sync');
    assert.equal(inspected.name, secret.name);
    model.currentQuestion = null;
    model.update(plain(M.onlineGameViewFor(game, guest)), 2);
    assert.equal(inspected.name, 'Hidden card', 'a former sheet reference loses temporary inspection permission');
    assert.equal(model.byIid(secret.iid), null);
  }
});

test('an active question cannot restore stale public tap state or counters over a newer snapshot', () => {
  const { game, guest, card } = table();
  const creature = card('Wall of Omens');
  const q = { type: 'chooseCards', from: [creature], min: 0, max: 1 };
  const descriptor = M.onlineDecisionDescriptor(game, q, guest, 'public-choice');
  const model = new M.OnlineArenaView(); model.update(plain(M.onlineGameViewFor(game, guest)), 2);
  const choice = model.decision(plain(descriptor)).from[0];
  creature.tapped = true; creature.counters['+1/+1'] = 2; game.recalc();
  model.update(plain(M.onlineGameViewFor(game, guest)), 2);
  assert.equal(model.currentQuestion.from[0], choice);
  assert.equal(choice.tapped, true); assert.equal(choice.power, 2); assert.equal(choice.toughness, 6);
  model.decision(plain(descriptor));
  assert.equal(choice.tapped, true, 'even a delayed descriptor preserves the latest public state');
});

test('look and reveal option steps retain authorized card art without granting general library access', () => {
  const { game, host, guest, card } = table();
  const secret = card('Swords to Plowshares', guest, 'library');
  for (const kind of ['ponder', 'reefLand', 'heraldReveal', 'explore', 'elvenFarsight', 'putLand', 'nyamiTop', 'clashPlace', 'unrelated']) {
    const q = { type: 'chooseOption', options: [{ key: 'keep', label: 'Keep' }], aiHint: { kind, card: secret, top: [secret] } };
    const d = M.onlineDecisionDescriptor(game, q, guest, kind);
    const model = new M.OnlineArenaView(); model.update(plain(M.onlineGameViewFor(game, guest)), 2);
    assert.equal(model.decision(plain(d)).aiHint.card.name, kind === 'unrelated' ? 'Hidden card' : secret.name);
    assert.equal(JSON.stringify(M.onlineGameViewFor(game, host)).includes(secret.name), false);
  }
});

test('every living human receives public reviews, while private looks reach only their controller', async () => {
  const { game, host, guest, card } = table();
  const observer = game.addPlayer('Observer', {}, null, false);
  const bot = game.addPlayer('Bot', {}, null, true);
  const eliminated = game.addPlayer('Eliminated', {}, null, false); eliminated.lost = true;
  const decisions = [];
  for (const player of game.players) player.controller = { decide: async (g, q) => { decisions.push([player.name, q.type]); return null; } };
  game.paced = true;
  const attacker = card('Llanowar Elves', host); attacker.attacking = guest;
  await game.reviewCombatWithHuman({ attackingPlayer: host, attackers: [attacker] });
  assert.deepEqual(decisions, [[host.name, 'combatReview'], [guest.name, 'combatReview'], [observer.name, 'combatReview']]);
  decisions.length = 0;
  await game.reviewGlobalEffectWithHuman({ targets: [guest, bot], title: 'Public effect' });
  assert.equal(decisions.length, 3);
  decisions.length = 0;
  const secret = card('Ponder', guest, 'library');
  await game.revealToHuman({ ctrl: guest, cards: [secret], kind: 'look' });
  assert.deepEqual(decisions, [[guest.name, 'cardReveal']]);
  decisions.length = 0;
  await game.revealToHuman({ ctrl: guest, cards: [secret], kind: 'reveal' });
  assert.deepEqual(decisions, [[host.name, 'cardReveal'], [observer.name, 'cardReveal']]);
});

test('a human can abort and recast in the same main phase, paying only for the completed cast', async () => {
  const { game, host, guest, card } = table();
  const source = card('Swords to Plowshares', guest, 'hand'), target = card('Llanowar Elves', host);
  guest.pool.W = 1;
  let choices = 0, mains = 0;
  host.controller = { decide: async () => ({ kind: 'pass' }) };
  guest.controller = { decide: async (g, q) => {
    if (q.type === 'main') {
      if (++mains > 2) return { kind: 'done' };
      const entry = q.casts.find(entry => entry.card === source);
      assert.ok(entry, 'cancelled cast must remain available to a human');
      if (mains === 2) { assert.equal(guest.pool.W, 1); assert.equal(source.zone, 'hand'); }
      return { kind: 'cast', ...entry };
    }
    if (q.type === 'chooseTargets') return ++choices === 1 ? { kind: 'cancel' } : [target];
    return { kind: 'pass' };
  } };
  await game.mainPhase(guest);
  assert.equal(choices, 2); assert.equal(source.zone, 'graveyard'); assert.equal(target.zone, 'exile'); assert.equal(guest.pool.W, 0);
});

test('tap corrections accept booleans and reject integer or string substitutes on both room implementations', () => {
  const { L, state } = room();
  for (const value of [true, false]) assert.equal(L.validateAction(state, { type: 'manualAction', action: { type: 'setTapped', cardToken: 'c:1', value } }, 'guest').ok, true);
  for (const value of [1, 'true']) assert.equal(L.validateAction(state, { type: 'manualAction', action: { type: 'setTapped', cardToken: 'c:1', value } }, 'guest').ok, false);
});

test('target cancellation round trips without spending mana or moving the source', () => {
  const { game, host, guest, card } = table();
  const spell = card('Swords to Plowshares', guest, 'hand'); guest.pool.W = 1;
  const q = { type: 'chooseTargets', candidates: [host], min: 1, max: 1, cancelable: true, card: spell };
  const descriptor = M.onlineDecisionDescriptor(game, q, guest, 'cancel');
  assert.equal(descriptor.ui.cancelable, true);
  assert.equal(M.hydrateOnlineDecision(game, q, descriptor, { kind: 'cancel' }).kind, 'cancel');
  assert.equal(guest.pool.W, 1); assert.equal(spell.zone, 'hand');
  q.cancelable = false;
  assert.throws(() => M.hydrateOnlineDecision(game, q, M.onlineDecisionDescriptor(game, q, guest, 'required'), { kind: 'cancel' }));
});

test('direct drag casts carry an authoritative action-target pair and preserve the quick target', () => {
  const { game, host, guest, card } = table();
  const spell = card('Swords to Plowshares', guest, 'hand'), target = card('Llanowar Elves', host), wrong = card('Sol Ring', host);
  guest.pool.W = 1;
  const q = { type: 'main', player: guest, casts: game.castableList(guest), acts: [], lands: [] };
  const d = M.onlineDecisionDescriptor(game, q, guest, 'drag');
  const action = d.actions.find(action => action.card?.iid === spell.iid).token;
  const response = { action, quickTarget: `c:${target.iid}` };
  assert.equal(M.validateOnlineDecisionResponse(d.legal, response).ok, true);
  assert.equal(M.hydrateOnlineDecision(game, q, d, response).quickTarget, target);
  assert.equal(M.validateOnlineDecisionResponse(d.legal, { action, quickTarget: `c:${wrong.iid}` }).ok, false);
});

test('a rejected stale guest action refreshes the decision instead of stopping the engine', async () => {
  const { game, guest, card } = table();
  const source = card('Sol Ring', guest, 'hand'); guest.pool.C = 1;
  const q = { type: 'main', player: guest, casts: game.castableList(guest), acts: [], lands: [] };
  let requests = 0, firstId;
  const controller = M.remoteControllerFor(guest, { requestDecision: async payload => {
    if (++requests === 1) {
      firstId = payload.id;
      const response = payload.descriptor.actions.find(action => action.card?.iid === source.iid).token;
      game.lastResortMove(source, 'graveyard');
      return response;
    }
    assert.notEqual(payload.id, firstId);
    assert.match(payload.descriptor.error, /changed zones/);
    assert.equal(payload.descriptor.actions.some(action => action.card?.iid === source.iid), false);
    return 'done';
  } });
  assert.equal((await controller.decide(game, q)).kind, 'done');
  assert.equal(requests, 2); assert.equal(guest.pool.C, 1);
});

test('decision references cannot follow a card through leave-and-return or target a replaced Stack object', () => {
  const { game, host, guest, card } = table();
  const permanent = card('Sol Ring');
  const q = { type: 'chooseTargets', candidates: [permanent], min: 1, max: 1 };
  const d = M.onlineDecisionDescriptor(game, q, guest, 'zone');
  permanent.zoneVersion++;
  assert.throws(() => M.hydrateOnlineDecision(game, q, d, [`c:${permanent.iid}`]), /changed zones/);
  const old = { name: 'Old spell', ctrl: host, kind: 'spell', targets: [] }; game.stack.push(old);
  const stackQ = { type: 'chooseTargets', candidates: [old], min: 1, max: 1 };
  const stackD = M.onlineDecisionDescriptor(game, stackQ, guest, 'stack');
  const id = stackD.choices[0].token;
  game.stack[0] = { name: 'Replacement spell', ctrl: host, kind: 'spell', targets: [] };
  assert.notEqual(M.onlineStackToken(game.stack[0]), id);
  assert.throws(() => M.hydrateOnlineDecision(game, stackQ, stackD, [id]), /no longer present/);
});

test('mana preview checks the authoritative solver without tapping or spending resources', () => {
  const { game, guest, card } = table();
  const forest = card('Forest'), ring = card('Sol Ring');
  const spell = card('Arcane Signet', guest, 'hand');
  const q = { type: 'chooseManaSources', player: guest, forSpell: { card: spell }, cost: M.parseCost('{2}'), opts: {}, candidates: [forest, ring], suggested: [ring], sources: game.manaSources(guest) };
  const d = M.onlineDecisionDescriptor(game, q, guest, 'mana');
  assert.ok(d.ui.cost); assert.ok(d.ui.sources.length); assert.ok(d.ui.suggested.length);
  assert.equal(M.onlineDecisionPreview(game, q, d, { cards: [`c:${forest.iid}`] }).valid, false);
  assert.equal(M.onlineDecisionPreview(game, q, d, { cards: [`c:${ring.iid}`] }).valid, true);
  assert.equal(forest.tapped, false); assert.equal(ring.tapped, false); assert.equal(guest.pool.C, 0);
});

test('multi-block assignments carry capacity and reject duplicate pairs', () => {
  const { game, host, guest, card } = table();
  const blocker = card('Wall of Omens'), a = card('Llanowar Elves', host), b = card('Elvish Mystic', host);
  const original = game.blockerCapacity.bind(game); game.blockerCapacity = c => c === blocker ? 2 : original(c);
  const q = { type: 'blockers', potential: [blocker], attackers: [a, b] };
  const d = M.onlineDecisionDescriptor(game, q, guest, 'blocks');
  const pairs = [a, b].map(attacker => ({ left: `c:${blocker.iid}`, right: `c:${attacker.iid}` }));
  assert.equal(M.validateOnlineDecisionResponse(d.legal, pairs).ok, true);
  assert.equal(M.validateOnlineDecisionResponse(d.legal, [pairs[0], pairs[0]]).ok, false);
  assert.equal(M.hydrateOnlineDecision(game, q, d, pairs).length, 2);
});

test('preview requests are private, scoped to the current decision, and cannot be used by other seats', () => {
  const { L } = room(); let { state } = room();
  const d = { id: 'mana', seat: 1, type: 'chooseManaSources', legal: { kind: 'mana', tokens: ['c:7'] } };
  state = L.applyAction(state, { type: 'decisionRequest', decision: d }, 'host');
  const request = { type: 'decisionPreview', decisionId: d.id, previewId: 'preview:1', response: { cards: ['c:7'] } };
  assert.equal(L.validateAction(state, request, 'host').ok, false);
  state = L.applyAction(state, request, 'guest');
  assert.equal(L.viewFor(state, 'guest').pendingPreview, null);
  assert.equal(L.viewFor(state, 'host').pendingPreview.id, 'preview:1');
  state = L.applyAction(state, { type: 'previewAck', previewId: 'preview:1', result: { valid: true } }, 'host');
  assert.equal(L.viewFor(state, 'guest').lastPreview.result.valid, true);
  assert.equal(L.viewFor(state, 'host').lastPreview, null);
  state = L.applyAction(state, { type: 'decisionResponse', decisionId: 'mana', response: { auto: true }, manaMode: 'manual' }, 'guest');
  assert.equal(L.validateAction(state, request, 'guest').ok, false);
  assert.equal(L.viewFor(state, 'host').lastDecision.manaMode, 'manual');
});

test('unknown decisions fail explicitly and never become a generic acknowledgement', () => {
  const { game, guest } = table();
  assert.throws(() => M.onlineDecisionDescriptor(game, { type: 'newUnimplementedDecision' }, guest, 'unknown'), /cannot present/);
});
