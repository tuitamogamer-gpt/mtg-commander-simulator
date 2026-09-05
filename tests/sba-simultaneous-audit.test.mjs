import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { assertGameStateInvariants, assertRecalculationStable } from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture(role = 'human') {
  const g = new M.Game({seed: 90521, paced: false});
  const decide = async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseOption') return q.options.find(o => o.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? q.count ?? 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min ?? 0);
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  };
  const p = g.addPlayer('SBA player', {name: 'SBA fixture'}, {decide}, role === 'ai');
  const o = g.addPlayer('Opponent', {name: 'Opponent fixture'}, {decide}, false);
  if (role === 'ai') p.controller = new M.AIController(p, {difficulty: 'hard', style: 'balanced'});
  g.turnPlayer = p; g.turnNo = 5; g.phase = 'main1'; g.step = 'main'; g.priorityRound = async () => {};
  return {g, p, o};
}
function put(f, name, owner = f.p, zone = 'battlefield') {
  assert.ok(M.DEFS[name], `real catalog card ${name}`);
  const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone; c.sick = false;
  (zone === 'battlefield' ? f.g.battlefield : owner[zone]).push(c); f.g.recalc(); return c;
}
async function settle(g) {
  for (let n = 0; n < 60 && (g.stack.length || g.pendingTriggers.length); n++) {
    await g.flushTriggers(); if (g.stack.length) await g.resolveTop();
  }
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  assertGameStateInvariants(g); assertRecalculationStable(g);
}
for (const role of ['human', 'ai']) {
  test(`Black Sun's Zenith ${role}: lethal counter cancellation preserves the pre-SBA Undying counter`, async () => {
    const f = fixture(role), {g, p} = f, ghoul = put(f, 'Butcher Ghoul');
    g.addCounters(ghoul, '+1/+1', 1);
    const spell = put(f, "Black Sun's Zenith", p, 'hand'); Object.assign(p.pool, {C: 2, B: 2});
    assert.equal(await g.castSpell(p, spell, {from: 'hand', xVal: 2}), true);
    await settle(g);
    assert.equal(ghoul.zone, 'graveyard', 'the +1/+1 counter present before lethal SBA prevents Undying');
    const lki = ghoul.battlefieldLKI.get(0);
    assert.equal(lki.counters['+1/+1'], 1); assert.equal(lki.counters['-1/-1'], 2);
    assert.equal(spell.zone, 'library'); assert.equal(p.pool.C + p.pool.B, 0);
  });
  test(`Pyroclasm ${role}: Blood Artist sees all simultaneous lethal creatures in either battlefield order`, async () => {
    for (const artistFirst of [true, false]) {
      const f = fixture(role), {g, p, o} = f;
      const artist = artistFirst ? put(f, 'Blood Artist') : null;
      const bear = put(f, 'Grizzly Bears', o);
      const source = artist || put(f, 'Blood Artist');
      const spell = put(f, 'Pyroclasm', p, 'hand'); Object.assign(p.pool, {C: 1, R: 1});
      assert.equal(await g.castSpell(p, spell, {from: 'hand'}), true);
      await g.resolveTop();
      assert.equal(g.stack.filter(s => s.kind === 'trigger' && s.srcCard === source).length, 2,
        'one Blood Artist trigger for itself and one for the other creature');
      assert.equal(source.zone, 'graveyard'); assert.equal(bear.zone, 'graveyard');
      await settle(g);
    }
  });
  test(`Pyroclasm ${role}: simultaneous Dauthi Voidwalker death still replaces its opponent's graveyard`, async () => {
    const f = fixture(role), {g, p, o} = f, walker = put(f, 'Dauthi Voidwalker'), bear = put(f, 'Grizzly Bears', o);
    const spell = put(f, 'Pyroclasm', p, 'hand'); Object.assign(p.pool, {C: 1, R: 1});
    assert.equal(await g.castSpell(p, spell, {from: 'hand'}), true); await settle(g);
    assert.equal(walker.zone, 'graveyard'); assert.equal(bear.zone, 'exile'); assert.equal(bear.counters.void, 1);
  });
  test(`counter cancellation ${role}: a survivor can regain Undying before a later death`, async () => {
    const f = fixture(role), {g} = f, ghoul = put(f, 'Butcher Ghoul');
    g.addCounters(ghoul, '+1/+1', 1); g.addCounters(ghoul, '-1/-1', 1); await g.checkSBA();
    assert.equal(ghoul.zone, 'battlefield'); assert.equal(ghoul.counters['+1/+1'], 0);
    await g.destroy(ghoul); await settle(g);
    assert.equal(ghoul.zone, 'battlefield'); assert.equal(ghoul.counters['+1/+1'], 1);
  });
}
for (const role of ['human', 'ai']) {
  test(`pre-SBA state ${role}: a dying Elesh Norn cannot save an already zero-toughness opponent`, async () => {
    const f = fixture(role), {g, o} = f, norn = put(f, 'Elesh Norn, Grand Cenobite'), artist = put(f, 'Blood Artist', o);
    norn.damage = norn.toughness;
    assert.ok(artist.toughness <= 0);
    await g.checkSBA(); await g.flushTriggers();
    assert.equal(norn.zone, 'graveyard'); assert.equal(artist.zone, 'graveyard');
    assert.equal(g.stack.filter(s => s.srcCard === artist).length, 2, 'both deaths belong to the same SBA event');
    await settle(g);
  });
  test(`repeated SBA passes ${role}: deaths caused by losing a lord form a later event`, async () => {
    const f = fixture(role), {g} = f, artist = put(f, 'Blood Artist'), lord = put(f, 'Undead Warchief'), zombie = put(f, 'Butcher Ghoul');
    artist.damage = 1; lord.damage = lord.toughness; zombie.damage = 1;
    assert.equal(zombie.toughness, 2);
    await g.checkSBA(); await g.flushTriggers();
    assert.equal(artist.zone, 'graveyard'); assert.equal(lord.zone, 'graveyard'); assert.equal(zombie.zone, 'graveyard');
    assert.equal(g.stack.filter(s => s.srcCard === artist).length, 2, 'Blood Artist left before the second SBA event');
    await settle(g); assert.equal(zombie.zone, 'battlefield', 'its first actual death may still trigger Undying');
  });
  test(`lethal damage ${role}: Persist uses counters before cancellation during that same SBA`, async () => {
    const f = fixture(role), {g} = f, elite = put(f, 'Safehold Elite');
    g.addCounters(elite, '-1/-1', 1); g.addCounters(elite, '+1/+1', 1); elite.damage = elite.toughness;
    await g.checkSBA(); await settle(g);
    assert.equal(elite.zone, 'graveyard', 'the pre-death -1/-1 counter prevents Persist');
    assert.equal(elite.battlefieldLKI.get(0).counters['-1/-1'], 1);
  });
  test(`legend and lethal SBA ${role}: legendary death observer sees both simultaneous departures`, async () => {
    const f = fixture(role), {g, p, o} = f, konrad = put(f, 'Syr Konrad, the Grim'), copy = put(f, 'Syr Konrad, the Grim');
    const bear = put(f, 'Grizzly Bears', o); bear.damage = bear.toughness;
    await g.checkSBA(); await g.flushTriggers();
    const departed = konrad.zone === 'graveyard' ? konrad : copy;
    assert.equal([konrad, copy].filter(c => c.zone === 'battlefield').length, 1);
    assert.equal(g.stack.filter(s => s.srcCard === departed).length, 1, 'departing legend sees the other creature die');
    await settle(g);
  });
}
