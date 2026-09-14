import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine(), plain = value => JSON.parse(JSON.stringify(value));
runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
  MTG: M, document: {readyState: 'loading', addEventListener() {}},
  window: {addEventListener() {}}, console, setTimeout, clearTimeout,
  localStorage: {getItem() {return null;}, setItem() {}},
});

for (const role of ['human', 'ai']) test(`radiation survives a save and still mills and removes life (${role})`, async () => {
  const f = context(M, role);
  f.a.counters.energy = 3; f.a.counters.experience = 2;
  await M.POM.rad({g: f.game, you: f.a}, f.a, 4);
  put(M, f.game, f.a, 'Grizzly Bears', 'library');
  const saved = plain(M.captureGameState(f.game)), fresh = context(M, role);
  assert.equal(saved.players[0].counters.rad, 4);
  M.restoreGameState(fresh.game, saved);
  assert.deepEqual(plain(fresh.a.counters), {energy: 3, experience: 2, rad: 4});
  await fresh.game.emit('precombatMain', {player: fresh.a});
  await settle(fresh.game);
  assert.equal(fresh.a.graveyard.length, 4);
  assert.equal(fresh.a.life, 39);
  assert.equal(fresh.a.counters.rad, 3);
});

test('radiation is part of the save fingerprint; old saves default to zero and malformed counts are rejected', () => {
  const f = context(M), before = M.gameStateFingerprint(f.game);
  f.a.counters.rad = 2;
  assert.notEqual(M.gameStateFingerprint(f.game), before);
  const saved = plain(M.captureGameState(f.game)), fresh = context(M);
  delete saved.players[0].counters.rad;
  fresh.a.counters.rad = 9;
  M.restoreGameState(fresh.game, saved);
  assert.equal(fresh.a.counters.rad || 0, 0);
  for (const value of [-1, 1.5, '4', Number.MAX_SAFE_INTEGER + 1]) {
    saved.players[0].counters.rad = value;
    assert.throws(() => M.restoreGameState(fresh.game, saved), /rad counters/);
  }
});

async function ringTable() {
  const f = context(M), bearer = put(M, f.game, f.a, 'Grizzly Bears');
  const first = put(M, f.game, f.b, 'Grizzly Bears'), second = put(M, f.game, f.b, 'Llanowar Elves');
  for (let i = 0; i < 3; i++) await M.E7.ringTempts(f.game, f.a);
  return {...f, bearer, first, second};
}
async function block(f, blockers) {
  for (const blocker of blockers) await f.game.emit('becomesBlockedByCreature', {attacker: f.bearer, blocker, blockers});
  await f.game.emit('becomesBlocked', {attacker: f.bearer, blockers});
}

test('The Ring creates one trigger for each blocker, so countering one saves only that blocker', async () => {
  const f = await ringTable();
  await block(f, [f.first, f.second]);
  await f.game.flushTriggers();
  assert.equal(f.game.stack.length, 2);
  f.game.stack.pop(); // Counter one of the two independent Ring triggers.
  await settle(f.game);
  await f.game.emit('endCombat', {player: f.a}); await settle(f.game);
  assert.equal([f.first, f.second].filter(c => c.zone === 'graveyard').length, 1);
  assert.equal([f.first, f.second].filter(c => c.zone === 'battlefield').length, 1);
});

test('actual combat sacrifices both surviving Ring blockers even after the bearer dies', async () => {
  const f = context(M), bearer = put(M, f.game, f.a, 'Grizzly Bears');
  const blockers = [put(M, f.game, f.b, 'Aegis Turtle'), put(M, f.game, f.b, 'Arachnoid')];
  for (let i = 0; i < 3; i++) await M.E7.ringTempts(f.game, f.a);
  const human = f.a.controller, opponent = f.b.controller;
  f.a.controller = {decide: (g, q) => q.type === 'attackers' ? [{card: bearer, target: f.b}] : human.decide(g, q)};
  f.b.controller = {decide: (g, q) => q.type === 'blockers' ? blockers.map(blocker => ({blocker, attacker: bearer})) : opponent.decide(g, q)};
  f.game.priorityRound = () => settle(f.game);
  await f.game.combatPhase(f.a); await settle(f.game);
  assert.ok(blockers.every(card => card.zone === 'graveyard'), 'high-toughness blockers are sacrificed at end of combat');
  assert.equal(bearer.zone, 'graveyard', 'the bearer dying does not stop its already-triggered Ring abilities');
});

for (const timing of ['before Ring resolution', 'after Ring resolution', 'after end-combat triggering']) {
  test(`The Ring does not sacrifice a blinked blocker (${timing})`, async () => {
    const f = await ringTable(); await block(f, [f.first]);
    if (timing !== 'before Ring resolution') await settle(f.game);
    if (timing === 'after end-combat triggering') await f.game.emit('endCombat', {player: f.a});
    await f.game.move(f.first, 'exile'); await f.game.putPermanentOntoBattlefield(f.first, f.b);
    await settle(f.game);
    if (timing !== 'after end-combat triggering') {
      await f.game.emit('endCombat', {player: f.a}); await settle(f.game);
    }
    assert.equal(f.first.zone, 'battlefield');
  });
}

test('a phased-out blocker is not sacrificed by The Ring', async () => {
  const f = await ringTable(); await block(f, [f.first]); await settle(f.game);
  f.first.phasedOut = true;
  await f.game.emit('endCombat', {player: f.a}); await settle(f.game);
  assert.equal(f.first.zone, 'battlefield');
});

for (const method of ['layer', 'native assignment']) test(`losing control clears Ring-bearer status (${method})`, async () => {
  const f = await ringTable();
  if (method === 'layer') M.OracleV8Control.gain(f.game, f.bearer, f.b);
  else f.bearer.ctrl = f.b;
  f.game.recalc();
  assert.equal(f.bearer.ctrl, f.b);
  assert.equal(!!f.bearer.meta.ringBearer, false);
  assert.equal(M.E7.ringBearer(f.game, f.b), null);
  M.OracleV8Control.gain(f.game, f.bearer, f.a); f.game.recalc();
  assert.equal(!!f.bearer.meta.ringBearer, false, 'returning control does not choose a new bearer');
  assert.equal(f.a.ringLevel, 3);
});

test('choosing a new Ring-bearer clears the designation on the phased-out old bearer', async () => {
  const f = await ringTable(); f.bearer.phasedOut = true;
  const next = put(M, f.game, f.a, 'Llanowar Elves');
  await M.E7.ringTempts(f.game, f.a);
  f.bearer.phasedOut = false; f.game.recalc();
  assert.equal(!!f.bearer.meta.ringBearer, false);
  assert.equal(next.meta.ringBearer, true);
  assert.equal(M.E7.ringBearer(f.game, f.a), next);
});

test('Ring choice details reach Live with the current level, bearer and legal creatures', async () => {
  const f = await ringTable(); f.game.players.forEach((p, i) => {p.onlineSeat = i;});
  let question;
  f.a.controller = {decide: async (game, q) => {question = q; return [f.bearer];}};
  await M.E7.ringTempts(f.game, f.a);
  const descriptor = M.onlineDecisionDescriptor(f.game, question, f.a, 'ring-bearer');
  const view = new M.OnlineArenaView(); view.update(plain(M.onlineGameViewFor(f.game, f.a)), 0);
  const remote = view.decision(plain(descriptor));
  assert.deepEqual(plain(remote.ringChoice), {level: 4, currentBearer: f.bearer.iid});
  assert.deepEqual(Array.from(remote.from, card => card.iid), [f.bearer.iid]);
  assert.deepEqual(M.hydrateOnlineDecision(f.game, question, descriptor, [`c:${f.bearer.iid}`]), [f.bearer]);
});

function graveyardTable(role = 'human') {
  const f = context(M, role, 2);
  const first = put(M, f.game, f.b, 'Grizzly Bears', 'graveyard');
  const second = put(M, f.game, f.b, 'Llanowar Elves', 'graveyard');
  const other = put(M, f.game, f.others[1], 'Grizzly Bears', 'graveyard');
  const spell = put(M, f.game, f.a, 'Waste Management', 'hand');
  const spec = f.game.spellTargetSpecs(spell, {}, f.a)[0];
  const q = {type: 'chooseTargets', spec, src: spell, candidates: [first, other, second], min: 0, max: 2, aiHint: spec.aiHint};
  return {...f, first, second, other, spell, q};
}

test('Waste Management rejects cross-graveyard UI picks and explains the remaining legal zone', () => {
  const f = graveyardTable(), ui = Object.create(M.UI.prototype);
  ui.game = f.game; ui.me = f.a; ui.pending = {q: f.q, sel: [f.first]}; ui.render = () => {};
  assert.equal(ui.isCandidate(f.second), true);
  assert.equal(ui.isCandidate(f.other), false);
  ui.pickCandidate(f.other);
  assert.deepEqual(ui.pending.sel, [f.first]);
  assert.equal(ui.targetZoneCandidates(f.other.owner, 'graveyard').length, 0);
  ui.removeTargetCandidate(f.first);
  assert.equal(ui.isCandidate(f.other), true);
});

for (const difficulty of ['easy', 'normal', 'hard']) test(`Waste Management AI chooses from just one graveyard (${difficulty})`, async () => {
  const f = graveyardTable('ai');
  f.a.controller = new M.AIController(f.a, {difficulty, style: 'balanced'});
  const answer = await f.a.controller.decide(f.game, f.q);
  assert.ok(answer.length > 0);
  assert.equal(new Set(answer.map(c => c.owner)).size, 1);
  const actions = M.generateLegalActions(M.createBotPlayerView(f.game, f.a, f.q), {difficulty});
  assert.ok(actions.every(action => new Set((action.picks || []).map(c => c.owner)).size <= 1));
  const legacy = f.a.controller.chooseTargets(f.game, f.q);
  assert.equal(new Set(legacy.map(c => c.owner)).size, 1);
  f.a.pool.B = 1; f.a.pool.C = 2;
  assert.equal(await f.game.castSpell(f.a, f.spell, {from: 'hand'}), true);
  await settle(f.game);
  assert.ok(f.game.creatures(f.a).some(c => c.hasSub('Rogue')), 'the legal cast resolves and makes Rogues');
});

test('Live rejects a same-graveyard violation before committing a decision', () => {
  const f = graveyardTable(); f.game.players.forEach((p, i) => {p.onlineSeat = i;});
  const descriptor = M.onlineDecisionDescriptor(f.game, f.q, f.a, 'same-graveyard');
  assert.throws(() => M.hydrateOnlineDecision(f.game, f.q, descriptor, [`c:${f.first.iid}`, `c:${f.other.iid}`]), /same graveyard/);
  assert.deepEqual(M.hydrateOnlineDecision(f.game, f.q, descriptor, [`c:${f.first.iid}`, `c:${f.second.iid}`]), [f.first, f.second]);
  const view = new M.OnlineArenaView(); view.update(plain(M.onlineGameViewFor(f.game, f.a)), 0);
  const q = view.decision(plain(descriptor)), ui = Object.create(M.UI.prototype);
  ui.game = view; ui.me = view.players[0]; ui.pending = {q, sel: [q.candidates.find(card => card.iid === f.first.iid)]};
  assert.equal(ui.isCandidate(q.candidates.find(card => card.iid === f.other.iid)), false);
  assert.equal(ui.isCandidate(q.candidates.find(card => card.iid === f.second.iid)), true);
});

test('mandatory targets must be available within one graveyard', () => {
  const f = graveyardTable(), spec = {...f.q.spec, min: 3, count: 3};
  assert.equal(f.game.canChooseTargets([spec], f.spell, f.a), false);
});
