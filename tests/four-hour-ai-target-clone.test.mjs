import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({seed: 10102693, paced: false, maxTurns: 10});
  const players = ['Caster', 'Recipient', 'Third', 'Fourth'].map(name => g.addPlayer(name, {name: 'Native AI target groups'}, null, false));
  const [a, b] = players, f = {g, a, b};
  f.install = (game, choices = {}) => {
    for (const p of game.players) p.controller = {decide: async (current, q) => {
      if (q.type === 'priority') return choices.priority?.(p, q) ?? {kind: 'pass'};
      if (q.type === 'chooseTargets') return choices.targets?.(p, q) ?? [game.players[b.idx]];
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
      if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
      if (q.type === 'chooseX') return q.min ?? 0;
      if (q.type === 'chooseManaSources') return {cards: q.suggested};
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'scry') return {top: q.cards, bottom: []};
      if (q.type === 'main') return {kind: 'done'};
      if (['cardReveal', 'combatReview'].includes(q.type)) return null;
      if (['attackers', 'blockers'].includes(q.type)) return [];
      throw Error('Unhandled native AI target-group choice: ' + q.type);
    }};
  };
  f.install(g);
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'battlefield', p = a) => {
    assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], p);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else p[zone].push(card);
    g.recalc(); return card;
  };
  f.lands = names => names.map(name => f.put(name));
  for (const p of players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  return f;
}

async function cast(g, p, card) {
  const offer = g.castableList(p).find(row => row.card === card);
  assert.ok(offer, 'native paid cast offer: ' + card.name);
  assert.equal(await g.castSpell(p, card, {from: offer.from, alt: offer.alt}), true);
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  assertGameStateInvariants(g, card.name); assertRecalculationStable(g, card.name);
}

for (const simulate of [false, true]) {
  test(`paid targeted Bolt after an earlier target group in ${simulate ? 'the public AI clone' : 'the live game'}`, async () => {
    const f = table(), first = f.put('Lightning Bolt', 'hand'), second = f.put('Lightning Bolt', 'hand');
    const mana = f.lands(['Mountain', 'Mountain']);
    await cast(f.g, f.a, first);
    assert.equal(f.b.life, 37); assert.equal(first.zone, 'graveyard');
    assert.equal(mana.filter(card => card.tapped).length, 1);
    assert.ok(f.g.v83TargetGroups, 'the actual first cast initializes the native identity cache');
    const g = simulate ? M.cloneGameForAISimulation(f.g, 10102694) : f.g;
    f.install(g);
    const caster = g.players[f.a.idx], recipient = g.players[f.b.idx];
    await cast(g, caster, g.byIid(second.iid));
    assert.equal(recipient.life, 34); assert.equal(caster.life, 40);
    assert.equal(g.byIid(second.iid).zone, 'graveyard');
    assert.equal(mana.filter(card => g.byIid(card.iid).tapped).length, 2, 'both native red costs are paid');
    if (simulate) {
      assert.equal(f.b.life, 37); assert.equal(second.zone, 'hand');
      assert.equal(mana.filter(card => card.tapped).length, 1, 'simulation does not spend live mana');
    }
  });
}

for (const simulate of [false, true]) {
  test(`Psychic Battle deduplicates three native targets ${simulate ? 'across a pending-group AI clone and a new paid response' : 'in a live paid Seeds of Strength'}`, async () => {
    const f = table(), battle = f.put('Psychic Battle', 'hand');
    const battleMana = f.lands(['Island', 'Island', 'Forest', 'Forest', 'Forest']);
    await cast(f.g, f.a, battle);
    assert.ok(battleMana.every(card => card.tapped));
    const bears = Array.from({length: 3}, () => f.put('Grizzly Bears'));
    const seeds = f.put('Seeds of Strength', 'hand'), bolt = f.put('Lightning Bolt', 'hand');
    const spellMana = f.lands(['Plains', 'Forest', 'Mountain']);
    let targetIndex = 0, clone, originalGroup;
    const originalTriggers = new Set();
    f.install(f.g, {
      targets: (p, q) => q.src?.iid === seeds.iid ? [bears[targetIndex++]] : [f.b],
      priority: (p, q) => {
        for (const row of q.stack.filter(row => row.kind === 'trigger' && row.srcCard?.iid === battle.iid)) {
          originalTriggers.add(row);
          if (!originalGroup) originalGroup = row.ctx.data.targetContext;
          if (simulate && !clone) clone = M.cloneGameForAISimulation(f.g, 10102695);
        }
      },
    });
    await cast(f.g, f.a, seeds);
    assert.equal(targetIndex, 3, 'the printed spell chooses three different native creatures');
    assert.equal(originalTriggers.size, 1, 'three target events from one native context produce one Psychic Battle trigger');
    assert.equal(f.g.v83TargetGroups.has(originalGroup), true, 'the seen key is the actual pending stack trigger targetContext');
    assert.ok(spellMana.slice(0, 2).every(card => card.tapped));
    assert.ok(bears.every(card => card.power === 3 && card.toughness === 3));
    if (!simulate) return;
    assert.ok(clone, 'public clone captures an actual paid spell and its already announced grouped trigger');
    const clonedPending = clone.stack.filter(row => row.kind === 'trigger' && row.srcCard?.iid === battle.iid);
    assert.equal(clonedPending.length, 1, 'the previously announced trigger is preserved once');
    assert.equal(clonedPending[0].ctx.data.targetContext.so.card.iid, seeds.iid, 'the existing group still identifies its paid stack spell');
    assert.equal(clonedPending[0].ctx.data.targetContext.so === clone.stack.find(row => row.kind === 'spell' && row.card?.iid === seeds.iid), true, 'the pending group identifies the actual cloned stack object');
    const clonedBolt = clone.byIid(bolt.iid), clonedCaster = clone.players[f.a.idx];
    const cloneTriggers = new Set(clonedPending);
    let responded = false;
    f.install(clone, {
      priority: (p, q) => {
        for (const row of q.stack.filter(row => row.kind === 'trigger' && row.srcCard?.iid === battle.iid)) cloneTriggers.add(row);
        if (p === clonedCaster && !responded) {
          const offer = q.casts.find(row => row.card === clonedBolt);
          if (offer) {responded = true; return {kind: 'cast', card: clonedBolt, from: offer.from, alt: offer.alt};}
        }
      },
    });
    await clone.priorityRound(clone.turnPlayer);
    assert.equal(responded, true); assert.equal(clonedBolt.zone, 'graveyard');
    assert.equal(clone.players[f.b.idx].life, 37);
    assert.equal(clone.byIid(spellMana[2].iid).tapped, true);
    assert.equal(cloneTriggers.size, 2, 'one existing grouped trigger plus one newly paid Bolt group, with no replayed old announcement');
    assert.equal(clone.stack.length, 0); assert.equal(clone.pendingTriggers.length, 0);
    assert.ok(bears.every(card => clone.byIid(card.iid).power === 3));
    assert.equal(f.b.life, 40); assert.equal(bolt.zone, 'hand'); assert.equal(spellMana[2].tapped, false);
    assertGameStateInvariants(clone, 'pending grouped AI clone'); assertRecalculationStable(clone, 'pending grouped AI clone');
  });
}
