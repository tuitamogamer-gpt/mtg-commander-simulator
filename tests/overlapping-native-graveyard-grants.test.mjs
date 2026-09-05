import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function fixture(role, restoredGame) {
  const g = restoredGame || new M.Game({seed: 951121, paced: false});
  const a = g.players[0] || g.addPlayer('Actor', {name: 'Test'}, null, role === 'ai');
  const b = g.players[1] || g.addPlayer('Opponent', {name: 'Test'}, null, false);
  g.turnPlayer = a; g.turnNo = 30; g.phase = 'main1'; g.step = 'main';
  g.priorityRound = async () => {};
  const trace = [];
  const answer = q => q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
    : q.type === 'chooseOption' ? q.options[0]?.key
    : q.type === 'chooseManaSources' ? {cards: q.suggested}
    : q.type === 'orderTriggers' ? q.triggers
    : q.type === 'priority' ? {kind: 'pass'} : null;
  const ai = new M.AIController(a, {difficulty: 'easy', style: 'opportunist'});
  a.controller = {decide: async (game, q) => {
    trace.push(q); return role === 'ai' ? ai.decide(game, q) : answer(q);
  }};
  b.controller = {decide: async (game, q) => answer(q)};
  const put = (name, zone = 'library', owner = a) => {
    assert.ok(M.DEFS[name], name);
    const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone;
    if (zone === 'battlefield') g.battlefield.push(c); else owner[zone].push(c);
    return c;
  };
  if (!restoredGame) for (const p of [a,b]) for (let i = 0; i < 12; i++) put('Forest', 'library', p);
  return {g,a,b,put,trace};
}
const clearMana = p => {for (const key of Object.keys(p.pool)) p.pool[key] = 0;};
async function settle(g) {
  let n = 0;
  while (g.pendingTriggers.length || g.stack.length) {
    assert.ok(++n < 80, 'bounded trigger/Stack completion');
    await g.flushTriggers(); if (g.stack.length) await g.resolveTop();
  }
}
async function cast(f, name, target, player = f.a) {
  const card = f.put(name, 'hand', player);
  for (const key of Object.keys(player.pool)) player.pool[key] = 20;
  const decide = player.controller.decide;
  player.controller.decide = async (game,q) => q.type === 'chooseTargets' && target && q.candidates.includes(target)
    ? [target] : decide(game,q);
  assert.equal(await f.g.castSpell(player,card),true, `${name}: paid cast`);
  player.controller.decide = decide;
  await settle(f.g); return card;
}

async function overlappingFixture(role, order) {
  const f = fixture(role);
  for (const name of order === 'Kotis first'
    ? ['Kotis, Sibsig Champion', 'Exploration Broodship']
    : ['Exploration Broodship', 'Kotis, Sibsig Champion']) {
    const card = await cast(f, name);
    f[name === 'Exploration Broodship' ? 'ship' : 'kotis'] = card;
  }
  const stationer = await cast(f, 'Gigantosaurus'), decide = f.a.controller.decide;
  f.a.controller.decide = async (g, q) => q.type === 'chooseCards' && q.from.includes(stationer)
    ? [stationer] : decide(g, q);
  const station = f.g.activatableList(f.a).find(entry => entry.card === f.ship && entry.ability?.label.startsWith('Station'));
  assert.ok(station);
  assert.equal(await f.g.activateAbility(f.a, station), true);
  f.a.controller.decide = decide;
  await settle(f.g);
  assert.ok(f.ship.counters.charge >= 8);
  assert.equal(stationer.tapped, true);
  f.card = f.put('Groundskeeper', 'graveyard');
  f.fodder = Array.from({length: 4}, () => f.put('Forest', 'graveyard'));
  f.land = f.put('Forest', 'battlefield');
  f.g.recalc();
  assert.ok(f.card.meta._kotisGrant && f.card.meta._broodshipGrant);
  return f;
}
function assertPrintedDefinition(card) {
  assert.equal(card.def, M.DEFS.Groundskeeper, 'restore the exact executable printed definition');
  assert.equal(card.meta._kotisGrant, undefined);
  assert.equal(card.meta._broodshipGrant, undefined);
}
async function reanimateAndKill(f) {
  await cast(f, 'Zombify', f.card);
  assert.equal(f.card.zone, 'battlefield');
  assertPrintedDefinition(f.card);
  await cast(f, 'Disenchant', f.ship);
  await cast(f, 'Murder', f.kotis);
  await cast(f, 'Murder', f.card);
  assert.equal(f.card.zone, 'graveyard');
  assertPrintedDefinition(f.card);
  assert.equal(f.g.castableList(f.a).some(entry => entry.card === f.card), false,
    'neither departed source leaves a phantom graveyard cast offer');
  assert.ok(!f.g.aiDecisionLog?.some(entry => entry.fallback));
}
for (const role of ['human', 'ai']) for (const order of ['Kotis first', 'Broodship first']) {
  test(`${role}: overlapping grants (${order}) fully expire through paid reanimation and death`, async () => {
    await reanimateAndKill(await overlappingFixture(role, order));
  });
}
for (const order of ['Kotis first', 'Broodship first']) {
  test(`ai: repeated recalculation with both grants (${order}) pays one selected permission`, async () => {
    const f = await overlappingFixture('ai', order);
    for (let i = 0; i < 8; i++) f.g.recalc();
    clearMana(f.a); f.a.pool.G = 1;
    const flag = order === 'Kotis first' ? 'broodship' : 'kotis';
    const offer = f.g.castableList(f.a).find(entry => entry.card === f.card && entry.alt?.[flag]);
    assert.ok(offer);
    assert.equal(await f.g.castSpell(f.a, f.card, {from: offer.from, alt: offer.alt}), true);
    const object = f.g.stack.find(entry => entry.card === f.card);
    assert.equal(object.manaSpent, 1);
    assert.equal(!!object.castOpts.flashback, false);
    assert.equal(f.fodder.filter(card => card.zone === 'exile').length, flag === 'kotis' ? 3 : 0);
    assert.equal(f.land.zone, flag === 'broodship' ? 'graveyard' : 'battlefield');
    assert.equal(f.trace.filter(q => q.prompt?.startsWith('Kotis:')).length, flag === 'kotis' ? 1 : 0);
    assert.equal(f.trace.filter(q => q.prompt?.startsWith('Exploration Broodship: sacrifice')).length, flag === 'broodship' ? 1 : 0);
    await settle(f.g);
    assert.equal(f.card.zone, 'battlefield');
    assertPrintedDefinition(f.card);
  });
}
test('overlapping grants preserve executable definitions in faithful AI clones and JSON saves', async () => {
  const original = await overlappingFixture('ai', 'Kotis first');
  const snapshot = M.captureGameState(original.g);
  assert.ok(snapshot, JSON.stringify(M.gameStateSnapshotBlockers(original.g)));
  const wire = JSON.stringify(snapshot);
  assert.equal(wire.includes('_nativeGraveyardGrant'), false, 'runtime definition links do not enter save data');
  const clone = M.cloneGameForAISimulation(original.g, 771);
  const restored = fixture('ai');
  M.restoreGameState(restored.g, JSON.parse(wire));
  for (const [route, game] of [['AI clone', clone], ['JSON restore', restored.g]]) {
    const f = fixture('ai', game);
    f.card = game.byIid(original.card.iid);
    f.kotis = game.byIid(original.kotis.iid);
    f.ship = game.byIid(original.ship.iid);
    assert.notEqual(f.card, original.card, route + ': independent card objects');
    assert.ok(f.card.meta._kotisGrant && f.card.meta._broodshipGrant, route + ': both source grants survive');
    assert.equal(M.nativeGraveyardBaseDefinition(f.card.def), M.DEFS.Groundskeeper);
    await reanimateAndKill(f);
    assert.equal(original.card.zone, 'graveyard', route + ': original remains untouched');
    assert.equal(original.kotis.zone, 'battlefield');
    assert.equal(original.ship.zone, 'battlefield');
    assert.ok(original.card.meta._kotisGrant && original.card.meta._broodshipGrant);
  }
});
