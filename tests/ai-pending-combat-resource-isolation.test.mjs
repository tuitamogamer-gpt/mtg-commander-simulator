import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const g = new M.Game({seed: 101332, paced: false}), f = {g};
  const decide = async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers') return f.attackers?.(q) || [];
    if (q.type === 'blockers') return [];
    if (q.type === 'chooseTargets') return f.target && q.candidates.includes(f.target) ? [f.target] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.aiHint?.kind === 'searchLand' ? 1 : q.min || 0);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    throw Error('Unhandled combat-resource choice: ' + q.type);
  };
  [f.a, f.b, f.c] = ['You', 'AI Wolf', 'AI Raven'].map((name, i) => g.addPlayer(name, {name: 'Combat resource isolation'}, {decide}, i > 0));
  g.turnPlayer = f.a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main';
  g._prioritySessionActive = true;
  f.add = (name, zone = 'battlefield', player = f.a) => {
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else player[zone].push(card);
    g.recalc(); return card;
  };
  for (const player of g.players) for (let n = 0; n < 8; n++) f.add('Forest', 'library', player);
  f.opt = f.add('Opt', 'hand', f.b);
  f.responseLand = f.add('Island', 'battlefield', f.b);
  return f;
}

async function settle(g) {
  for (let n = 0; g.stack.length && n < 30; n++) await g.resolveTop();
  assert.equal(g.stack.length, 0);
  assert.equal(g.pendingTriggers.length, 0);
}

async function response(f) {
  const before = aiIsolationFingerprint(f.g), clock = M.currentOracleTimestamp();
  const monarch = f.g.monarch, initiative = f.g.initiative;
  assert.ok(f.g.castableList(f.b).some(row => row.card === f.opt), 'the opponent response is currently legal and payable');
  const result = await M.simulateAction(f.g, {kind: 'cast', card: f.opt, from: 'hand'}, {playerId: f.b.idx, seed: 101333});
  assert.equal(result.applied, true, result.error?.stack); assert.equal(result.error, null);
  assert.equal(aiIsolationFingerprint(f.g), before);
  assert.equal(f.g.monarch, monarch); assert.equal(f.g.initiative, initiative);
  assert.equal(M.currentOracleTimestamp(), clock);
  assert.equal(f.opt.zone, 'hand'); assert.equal(f.responseLand.tapped, false);
  assert.equal(result.state.byIid(f.opt.iid).zone, 'graveyard');
  if (result.state.monarch) assert.ok(result.state.players.includes(result.state.monarch), 'the simulated monarch belongs to the simulated game');
  if (result.state.initiative) assert.ok(result.state.players.includes(result.state.initiative), 'the simulated initiative holder belongs to the simulated game');
  assertGameStateInvariants(result.state);
  return result.state;
}

async function dashed(f) {
  const card = f.add('Ragavan, Nimble Pilferer', 'hand');
  const lands = [f.add('Mountain'), f.add('Wastes')];
  const entry = f.g.castableList(f.a).find(row => row.card === card && row.alt?.dash);
  assert.ok(entry);
  assert.equal(await f.g.castSpell(f.a, card, {from: entry.from, alt: entry.alt}), true);
  assert.ok(lands.every(land => land.tapped));
  await settle(f.g);
  assert.equal(card.zone, 'battlefield'); assert.equal(card.kw('haste'), true);
  return card;
}

async function endStep(f) {
  f.g.phase = 'end'; f.g.step = 'endStep';
  await f.g.emit('endStep', {player: f.a}); await f.g.flushTriggers();
  assert.ok(f.g.stack.some(row => row.name.includes('Dash: return to hand')));
}

for (const copied of [false, true]) test(`pending ${copied ? 'opponent-copied ' : ''}Dash returns only the simulated card, then the real owner’s card`, async () => {
  const f = fixture(), card = await dashed(f);
  await endStep(f);
  if (copied) assert.ok(await f.g.copyStackAbility(f.g.stack.at(-1), f.c));
  const clone = await response(f), simulated = clone.byIid(card.iid);
  assert.equal(simulated.zone, 'hand');
  assert.ok(clone.players[f.a.idx].hand.includes(simulated));
  assert.equal(clone.battlefield.includes(card), false);
  assert.equal(card.zone, 'battlefield'); assert.equal(f.a.hand.includes(card), false);
  await settle(f.g);
  assert.equal(card.zone, 'hand'); assert.ok(f.a.hand.includes(card));
  assert.equal(f.g.battlefield.includes(card), false);
  assert.equal(card.owner, f.a); assert.equal(card.ctrl, f.a);
  assertGameStateInvariants(f.g);
});

for (const beforeTrigger of [true, false]) test(`Dash ignores a new incarnation blinked ${beforeTrigger ? 'before' : 'after'} its end-step trigger is placed`, async () => {
  const f = fixture(), card = await dashed(f);
  if (!beforeTrigger) await endStep(f);
  await f.g.move(card, 'exile'); await f.g.move(card, 'battlefield', {ctrl: f.c});
  if (beforeTrigger) await endStep(f);
  const clone = await response(f);
  assert.equal(clone.byIid(card.iid).zone, 'battlefield');
  assert.equal(clone.byIid(card.iid).ctrl, clone.players[f.c.idx]);
  await settle(f.g);
  assert.equal(card.zone, 'battlefield'); assert.equal(card.ctrl, f.c);
  assertGameStateInvariants(f.g);
});

async function transfer(f, resource) {
  if (resource === 'monarch') await f.g.becomeMonarch(f.b);
  else { await f.g.takeInitiative(f.b); await f.g.flushTriggers(); await settle(f.g); }
  const creature = f.add('Grizzly Bears');
  f.g.phase = 'combat'; f.g.step = 'damage';
  await f.g.damagePlayer(creature, f.b, 1, {combat: true}); await f.g.flushTriggers();
  const trigger = f.g.stack.at(-1);
  assert.equal(trigger.ctrl, f.b, 'the source-less inherent ability belongs to the previous holder');
  assert.equal(trigger.srcCard == null, true); assert.equal(trigger.ctx.src == null, true);
  return {creature, trigger};
}

async function steal(f, creature) {
  f.target = creature;
  const ray = f.add('Ray of Command', 'hand', f.c);
  const lands = Array.from({length: 4}, () => f.add('Island', 'battlefield', f.c));
  const entry = f.g.castableList(f.c).find(row => row.card === ray);
  assert.ok(entry);
  assert.equal(await f.g.castSpell(f.c, ray, {from: entry.from, alt: entry.alt}), true);
  await f.g.resolveTop();
  assert.ok(lands.every(land => land.tapped));
  assert.equal(creature.ctrl, f.c);
  f.target = null;
}

for (const resource of ['monarch', 'initiative']) test(`pending combat ${resource} transfer uses clone-local participants and native effects`, async () => {
  const f = fixture(); await transfer(f, resource);
  const clone = await response(f);
  assert.equal(clone[resource], clone.players[f.a.idx]);
  if (resource === 'initiative') {
    assert.equal(clone.players[f.a.idx].afcDungeon.key, 'undercity');
    assert.equal(clone.players[f.a.idx].afcDungeon.path.length, 1);
    assert.equal(f.a.afcDungeon, undefined);
  }
  assert.equal(f.g[resource], f.b);
  await settle(f.g);
  assert.equal(f.g[resource], f.a);
  assertGameStateInvariants(f.g);
});

for (const departure of ['still present', 'dies after theft', 'blinks after theft']) test(`monarch uses current controller or original incarnation LKI when the damaging creature ${departure}`, async () => {
  const f = fixture(), {creature} = await transfer(f, 'monarch');
  await steal(f, creature);
  if (departure !== 'still present') {
    await f.g.sacrifice(f.c, creature);
    if (departure === 'blinks after theft') await f.g.move(creature, 'battlefield', {ctrl: f.a});
  }
  const clone = await response(f);
  assert.equal(clone.monarch, clone.players[f.c.idx]);
  await settle(f.g);
  assert.equal(f.g.monarch, f.c);
  assertGameStateInvariants(f.g);
});

test('a blinked damaging creature’s new controller does not replace its original incarnation LKI', async () => {
  const f = fixture(), {creature} = await transfer(f, 'monarch');
  await f.g.move(creature, 'exile'); await f.g.move(creature, 'battlefield', {ctrl: f.c});
  const clone = await response(f);
  assert.equal(clone.monarch, clone.players[f.a.idx]);
  await settle(f.g);
  assert.equal(f.g.monarch, f.a);
  assertGameStateInvariants(f.g);
});

for (const resource of ['monarch', 'initiative']) test(`copying the source-less ${resource} transfer changes ability control without redirecting its beneficiary`, async () => {
  const f = fixture(), {creature, trigger} = await transfer(f, resource);
  if (resource === 'initiative') await steal(f, creature);
  assert.ok(await f.g.copyStackAbility(trigger, f.c));
  const clone = await response(f);
  assert.equal(clone[resource], clone.players[f.a.idx]);
  if (resource === 'initiative') assert.equal(clone.players[f.a.idx].afcDungeon.path.length, 2);
  await settle(f.g);
  assert.equal(f.g[resource], f.a);
  if (resource === 'initiative') assert.equal(f.a.afcDungeon.path.length, 2);
  assertGameStateInvariants(f.g);
});

test('simultaneous combat damage from two creatures creates one initiative transfer for that player', async () => {
  const f = fixture();
  await f.g.takeInitiative(f.b); await f.g.flushTriggers(); await settle(f.g);
  const creatures = [f.add('Grizzly Bears'), f.add('Grizzly Bears')];
  f.attackers = q => creatures.filter(card => q.eligible.includes(card)).map(card => ({card, target: f.b}));
  await f.g.combatPhase(f.a);
  const transfers = f.g.stack.filter(row => row.name === 'Take the initiative after combat damage');
  assert.equal(transfers.length, 1);
  assert.equal(f.b.life, 36);
  const clone = await response(f);
  assert.equal(clone.initiative, clone.players[f.a.idx]);
  assert.equal(clone.players[f.a.idx].afcDungeon.path.length, 1);
  await settle(f.g);
  assert.equal(f.a.afcDungeon.path.length, 1);
  assertGameStateInvariants(f.g);
});

test('monarch still uses the same permanent’s current controller after it stops being a creature', async () => {
  const f = fixture();
  await f.g.becomeMonarch(f.b);
  const animation = f.add('March of the Machines'), creature = f.add('Sol Ring');
  assert.equal(creature.is('Creature'), true);
  f.g.phase = 'combat'; f.g.step = 'damage';
  await f.g.damagePlayer(creature, f.b, 1, {combat: true}); await f.g.flushTriggers();
  await steal(f, creature);
  f.target = animation;
  const naturalize = f.add('Naturalize', 'hand', f.c);
  f.add('Forest', 'battlefield', f.c); f.add('Forest', 'battlefield', f.c);
  const entry = f.g.castableList(f.c).find(row => row.card === naturalize);
  assert.ok(entry);
  assert.equal(await f.g.castSpell(f.c, naturalize, {from: entry.from, alt: entry.alt}), true);
  await f.g.resolveTop(); f.target = null;
  assert.equal(animation.zone, 'graveyard');
  assert.equal(creature.is('Creature'), false);
  const clone = await response(f);
  assert.equal(clone.monarch, clone.players[f.c.idx]);
  await settle(f.g);
  assert.equal(f.g.monarch, f.c);
  assertGameStateInvariants(f.g);
});

test('simulated combat crown transfer releases a native Palace Jailer duration without releasing the live card', async () => {
  const f = fixture(), jailed = f.add('Grizzly Bears'), jailer = f.add('Palace Jailer', 'hand', f.b);
  f.g.turnPlayer = f.b;
  for (let n = 0; n < 4; n++) f.add('Plains', 'battlefield', f.b);
  f.target = jailed;
  const entry = f.g.castableList(f.b).find(row => row.card === jailer);
  assert.ok(entry);
  assert.equal(await f.g.castSpell(f.b, jailer, {from: entry.from, alt: entry.alt}), true);
  await settle(f.g); f.target = null;
  assert.equal(f.g.monarch, f.b); assert.equal(jailed.zone, 'exile');
  f.responseLand = f.add('Island', 'battlefield', f.b);
  f.g.turnPlayer = f.a; f.g.phase = 'combat'; f.g.step = 'damage';
  const attacker = f.add('Grizzly Bears');
  await f.g.damagePlayer(attacker, f.b, 1, {combat: true}); await f.g.flushTriggers();
  const clone = await response(f);
  assert.equal(clone.monarch, clone.players[f.a.idx]);
  assert.equal(clone.byIid(jailed.iid).zone, 'battlefield');
  assert.equal(jailed.zone, 'exile');
  await settle(f.g);
  assert.equal(f.g.monarch, f.a); assert.equal(jailed.zone, 'battlefield');
  assertGameStateInvariants(f.g);
});
