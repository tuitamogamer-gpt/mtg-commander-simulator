import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function fixture() {
  const g = new M.Game({seed: 101314, paced: false});
  const f = {g};
  const decide = async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.sacrifice && q.from.includes(f.sacrifice) ? [f.sacrifice] : q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    throw Error('Unhandled source-isolation choice: ' + q.type);
  };
  f.a = g.addPlayer('You', {name: 'Pending source isolation'}, {decide}, false);
  f.b = g.addPlayer('AI Wolf', {name: 'Pending source isolation'}, {decide}, true);
  g.turnPlayer = f.a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main';
  // These activations occur inside an existing native priority session, so
  // their stack objects remain pending while an opponent evaluates a response.
  g._prioritySessionActive = true;
  f.add = (name, zone = 'battlefield', owner = f.a) => {
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
    g.recalc(); return card;
  };
  for (const player of g.players) for (let n = 0; n < 6; n++) f.add('Forest', 'library', player);
  f.response = f.add('Opt', 'hand', f.b);
  f.responseLand = f.add('Island', 'battlefield', f.b);
  return f;
}

async function suspend(f, name = 'Greater Gargadon') {
  const card = f.add(name, 'hand');
  const land = f.add(name === 'Greater Gargadon' ? 'Mountain' : 'Island');
  const entry = f.g.activatableList(f.a).find(row => row.card === card && row.suspend);
  assert.ok(entry, 'the printed Suspend special action is actually payable');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(land.tapped, true);
  assert.equal(card.zone, 'exile');
  assert.equal(card.counters.time, card.def.suspend.n);
  return card;
}

async function equip(f) {
  const host = f.add('Grizzly Bears'), equipment = f.add('Bonesplitter'), land = f.add('Wastes');
  const entry = f.g.activatableList(f.a).find(row => row.card === equipment && row.equip);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(land.tapped, true, 'the live Equip activation pays its actual cost');
  assert.equal(equipment.attachedTo, null, 'attachment waits for resolution');
  return {host, equipment};
}

async function settle(game) {
  for (let n = 0; game.stack.length && n < 20; n++) await game.resolveTop();
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
}

async function responseSnapshot(f) {
  const before = aiIsolationFingerprint(f.g), clock = M.currentOracleTimestamp();
  assert.ok(f.g.castableList(f.b).some(row => row.card === f.response), 'a native opponent response is legal and payable');
  const result = await M.simulateAction(f.g, {kind: 'cast', card: f.response, from: 'hand'}, {playerId: f.b.idx, seed: 101315});
  assert.equal(result.applied, true);
  assert.equal(result.error, null);
  assert.equal(aiIsolationFingerprint(f.g), before, 'response search leaves every live source, counter, attachment and zone unchanged');
  assert.equal(M.currentOracleTimestamp(), clock);
  assert.equal(f.response.zone, 'hand');
  assert.equal(f.responseLand.tapped, false);
  assert.equal(result.state.byIid(f.response.iid).zone, 'graveyard');
  assertGameStateInvariants(result.state, 'fully resolved response snapshot');
  return result.state;
}

for (const removal of ['upkeep', 'Gargadon sacrifice']) test(`pending ${removal} removes a time counter only in the AI snapshot`, async () => {
  const f = fixture(), card = await suspend(f);
  if (removal === 'upkeep') await f.g.runUpkeepStepV90(f.a);
  else {
    f.sacrifice = f.add('Grizzly Bears');
    const entry = f.g.activatableList(f.a).find(row => row.card === card && row.cdkGargadon);
    assert.ok(entry);
    assert.equal(await f.g.activateAbility(f.a, entry), true);
    assert.equal(f.sacrifice.zone, 'graveyard', 'the sacrifice is paid before the counter ability resolves');
  }
  assert.equal(card.counters.time, 10);
  for (let n = 0; n < 2; n++) {
    const clone = await responseSnapshot(f), copiedCard = clone.byIid(card.iid);
    assert.equal(copiedCard.counters.time, 9);
    assert.equal(copiedCard.meta.suspended, 9);
    assert.equal(card.counters.time, 10, 'repeated hypothetical responses cannot advance the real suspended card');
  }
  await settle(f.g);
  assert.equal(card.counters.time, 9);
  assert.equal(card.meta.suspended, 9);
  assertGameStateInvariants(f.g);
});

for (const pending of ['last counter removal', 'last counter cast']) test(`pending Suspend ${pending} casts in the cloned game and later in the real game`, async () => {
  const f = fixture(), card = await suspend(f, 'Ancestral Vision');
  for (let n = 0; n < 3; n++) { await f.g.runUpkeepStepV90(f.a); await settle(f.g); }
  assert.equal(card.counters.time, 1);
  await f.g.runUpkeepStepV90(f.a);
  if (pending === 'last counter cast') {
    await f.g.resolveTop();
    assert.equal(card.counters.time, 0);
    assert.ok(f.g.stack.some(row => row.name.includes('Suspend: cast')));
  }
  const clone = await responseSnapshot(f);
  assert.equal(clone.byIid(card.iid).zone, 'graveyard');
  assert.equal(clone.players[f.a.idx].hand.length, 3, 'the mandatory suspended spell resolves its printed draw');
  assert.equal(card.zone, 'exile');
  assert.equal(f.a.hand.length, 0);
  await settle(f.g);
  assert.equal(card.zone, 'graveyard');
  assert.equal(f.a.hand.length, 3, 'real resolution still casts the card exactly once');
  assertGameStateInvariants(f.g);
});

test('a pending Equip response snapshot attaches its own equipment without changing the live host', async () => {
  const f = fixture(), {host, equipment} = await equip(f);
  const clone = await responseSnapshot(f);
  assert.equal(clone.byIid(equipment.iid).attachedTo, host.iid);
  assert.ok(clone.byIid(host.iid).attachments.includes(equipment.iid));
  assert.equal(clone.byIid(host.iid).power, 4);
  assert.equal(host.power, 2);
  assert.equal(equipment.attachedTo, null);
  await settle(f.g);
  assert.equal(equipment.attachedTo, host.iid);
  assert.equal(host.power, 4);
  assertGameStateInvariants(f.g);
});

test('a copied Equip uses its actual controller’s target while retaining the physical equipment owner', async () => {
  const f = fixture(), {host, equipment} = await equip(f), otherHost = f.add('Grizzly Bears', 'battlefield', f.b);
  const original = f.g.stack.at(-1);
  const copied = await f.g.copyStackAbility(original, f.b, {forceTarget: otherHost});
  assert.ok(copied, 'the opponent-controlled copy may target that controller’s creature');
  await f.g.resolveTop();
  assert.equal(equipment.owner, f.a);
  assert.equal(equipment.ctrl, f.a);
  assert.equal(equipment.attachedTo, otherHost.iid);
  assert.equal(otherHost.power, 4);
  assert.equal(host.power, 2);
  await settle(f.g);
  assert.equal(equipment.attachedTo, host.iid, 'the original Equip then resolves using its own controller and target');
  assert.equal(host.power, 4);
  assert.equal(otherHost.power, 2);
  assertGameStateInvariants(f.g);
});

test('a copied last-counter Suspend cast cannot cast the same card twice', async () => {
  const f = fixture(), card = await suspend(f, 'Ancestral Vision');
  for (let n = 0; n < 3; n++) { await f.g.runUpkeepStepV90(f.a); await settle(f.g); }
  await f.g.runUpkeepStepV90(f.a);
  await f.g.resolveTop();
  const original = f.g.stack.at(-1);
  assert.ok(original.name.includes('Suspend: cast'));
  assert.ok(await f.g.copyStackAbility(original, f.a));
  const clone = await responseSnapshot(f);
  assert.equal(clone.byIid(card.iid).zone, 'graveyard');
  assert.equal(clone.players[f.a.idx].hand.length, 3);
  await settle(f.g);
  assert.equal(card.owner, f.a);
  assert.equal(card.zone, 'graveyard');
  assert.equal(f.a.hand.length, 3);
  assertGameStateInvariants(f.g);
});

for (const changed of ['source', 'target']) test(`pending Equip cannot use a blinked ${changed} incarnation in either game`, async () => {
  const f = fixture(), {host, equipment} = await equip(f), card = changed === 'source' ? equipment : host;
  await f.g.move(card, 'exile'); await f.g.move(card, 'battlefield', {ctrl: f.a});
  const clone = await responseSnapshot(f);
  assert.equal(clone.byIid(equipment.iid).attachedTo, null);
  assert.equal(clone.byIid(host.iid).power, 2);
  await settle(f.g);
  assert.equal(equipment.attachedTo, null);
  assert.equal(host.power, 2);
  assertGameStateInvariants(f.g);
});

test('a pending Suspend upkeep cannot remove a counter from a newly suspended incarnation', async () => {
  const f = fixture(), card = await suspend(f);
  await f.g.runUpkeepStepV90(f.a);
  await f.g.move(card, 'hand');
  const jhoira = f.add('Jhoira of the Ghitu');
  f.add('Wastes'); f.add('Wastes');
  const entry = f.g.activatableList(f.a).find(row => row.card === jhoira);
  assert.ok(entry);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.resolveTop();
  assert.equal(card.zone, 'exile');
  assert.equal(card.counters.time, 4, 'a paid Jhoira activation creates a new suspended incarnation');
  const clone = await responseSnapshot(f);
  assert.equal(clone.byIid(card.iid).counters.time, 4);
  await settle(f.g);
  assert.equal(card.counters.time, 4);
  assertGameStateInvariants(f.g);
});
