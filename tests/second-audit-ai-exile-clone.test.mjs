import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function controllerFor(observations) {
  return {decide: async (game, q) => {
    if (q.type === 'priority') {
      for (const row of game.stack.filter(r => r.kind === 'trigger' && r.srcCard?.name === "Kaya, Spirits' Justice")) {
        if (!observations.triggers.has(row)) {
          observations.triggers.add(row);
          observations.groupedExileCounts.push(row.ctx.data.v92ExileEvents.length);
        }
      }
      await observations.onPending?.(game, q);
      return {kind: 'pass'};
    }
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(r => r.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(r => r.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native exile clone question: ' + q.type);
  }};
}

function table() {
  const g = new M.Game({seed: 101026151, paced: false, difficulty: 'hard', maxTurns: 30});
  const a = g.addPlayer('Exile clone caster', {name: 'Native clone audit'}, null, false);
  const b = g.addPlayer('Opponent', {name: 'Native clone opponent'}, null, false);
  const observations = {triggers: new Set(), groupedExileCounts: []};
  const controller = controllerFor(observations);
  a.controller = controller; b.controller = controller;
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  for (const p of [a, b]) for (let i = 0; i < 12; i++) put(g, p, 'Forest', 'library');
  return {g, a, b, observations};
}

function put(g, p, name, zone = 'hand') {
  assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
  const c = new M.CardInst(M.DEFS[name], p); c.zone = zone;
  if (zone === 'battlefield') { c.sick = false; g.battlefield.push(c); } else p[zone].push(c);
  g.recalc(); return c;
}

async function cast(g, p, name) {
  const c = put(g, p, name), offer = g.castableList(p).find(r => r.card === c);
  assert.ok(offer, 'native paid offer: ' + name);
  assert.equal(await g.castSpell(p, c, {from: offer.from, alt: offer.alt}), true);
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  return c;
}

async function primeExileBatch() {
  const f = table();
  for (const name of [...Array(10).fill('Plains'), 'Swamp', 'Swamp', 'Forest', 'Forest', 'Forest', 'Forest']) put(f.g, f.a, name, 'battlefield');
  const bear = await cast(f.g, f.a, 'Grizzly Bears');
  await cast(f.g, f.a, 'Sunfall');
  assert.equal(bear.zone, 'exile');
  assert.equal(typeof f.g.v92ExileBatches?.get, 'function', 'actual paid Sunfall initializes native grouped exile history');
  assert.equal(WeakMap.prototype.has.call(f.g.v92ExileBatches, {}), false, 'the live cache has native WeakMap storage');
  const incubator = f.g.bf().find(c => c.ctrl === f.a && c.hasSub('Incubator'));
  assert.ok(incubator); assert.equal(incubator.is('Creature'), false);
  for (const c of f.g.lands(f.a)) await f.g.untap(c);
  return {...f, bear, incubator};
}

async function resolveSecondBatch(g, p, observations) {
  const kaya = await cast(g, p, "Kaya, Spirits' Justice");
  const creatures = [await cast(g, p, 'Grizzly Bears'), await cast(g, p, 'Grizzly Bears')];
  const manaBefore = g.lands(p).filter(c => !c.tapped).length;
  const wipe = await cast(g, p, 'Sunfall');
  assert.equal(kaya.zone, 'battlefield'); assert.equal(wipe.zone, 'graveyard');
  assert.equal(creatures.every(c => c.zone === 'exile'), true);
  assert.equal(g.lands(p).filter(c => !c.tapped).length, manaBefore - 5, 'the second native wipe pays five mana');
  assert.equal(observations.triggers.size, 1, 'Kaya observes the new simultaneous group exactly once');
  assert.deepEqual(observations.groupedExileCounts, [2]);
  assert.equal((g.aiDecisionLog || []).some(r => r.fallback), false);
  assertGameStateInvariants(g, 'native AI exile clone');
}

test('ordinary live paid Sunfalls preserve native Kaya simultaneous exile grouping', async () => {
  const f = await primeExileBatch();
  await resolveSecondBatch(f.g, f.a, f.observations);
});

test('public AI clone can pay a new Sunfall after a genuine prior native exile group', async () => {
  const f = await primeExileBatch();
  const originalUntapped = f.g.lands(f.a).filter(c => !c.tapped).length;
  const originalExiled = f.a.exile.map(c => c.iid);
  const clone = M.cloneGameForAISimulation(f.g, 101026152), caster = clone.players.find(p => p.idx === f.a.idx);
  assert.equal(typeof clone.v92ExileBatches?.get, 'function');
  assert.equal(clone.v92ExileBatches === f.g.v92ExileBatches, false, 'the mutable transient cache belongs to the simulation');
  await resolveSecondBatch(clone, caster, f.observations);
  assert.equal(f.g.lands(f.a).filter(c => !c.tapped).length, originalUntapped);
  assert.deepEqual(f.a.exile.map(c => c.iid), originalExiled);
  assert.equal(f.g.bf().some(c => c.name === "Kaya, Spirits' Justice"), false);
  assertGameStateInvariants(f.g, 'native original after independent AI exile clone');
});

test('public AI clone preserves an already announced Kaya exile group and its exact cloned source objects', async () => {
  const f = await primeExileBatch(); let verified = false;
  f.observations.onPending = async (game, q) => {
    const original = game.stack.find(row => row.kind === 'trigger' && row.srcCard?.name === "Kaya, Spirits' Justice");
    if (!original || verified) return;
    verified = true;
    const clone = M.cloneGameForAISimulation(game, 101026153);
    const copied = clone.stack.find(row => row.kind === 'trigger' && row.srcCard?.iid === original.srcCard.iid);
    assert.ok(copied);
    assert.equal(copied === original, false);
    assert.equal(copied.srcCard === clone.byIid(original.srcCard.iid), true);
    assert.equal(copied.ctx.sourceZoneVersion, copied.srcCard.zoneVersion);
    const events = copied.ctx.data.v92ExileEvents;
    assert.equal(events.length, 2);
    assert.equal(events === original.ctx.data.v92ExileEvents, false);
    for (const [index, event] of events.entries()) {
      assert.equal(event.card === clone.byIid(event.card.iid), true);
      assert.equal(event.card === original.ctx.data.v92ExileEvents[index].card, false);
      assert.equal(event.v92ExileEvents === events, true, 'one exact cloned simultaneous group remains shared');
    }
    const observations = {triggers: new Set(), groupedExileCounts: []};
    for (const player of clone.players) player.controller = controllerFor(observations);
    await clone.priorityRound(clone.turnPlayer);
    assert.equal(observations.triggers.size, 1);
    assert.deepEqual(observations.groupedExileCounts, [2]);
    assert.equal(clone.stack.length, 0); assert.equal(clone.pendingTriggers.length, 0);
    assert.equal(game.stack.includes(original), true, 'the original pending trigger was not resolved by its clone');
    assertGameStateInvariants(clone, 'native pending Kaya group clone');
  };
  await resolveSecondBatch(f.g, f.a, f.observations);
  assert.equal(verified, true);
});
