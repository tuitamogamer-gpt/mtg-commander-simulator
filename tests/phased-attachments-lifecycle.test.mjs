import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { untapStep } from './helpers/oracle-phasing-proof.mjs';

const M = loadEngine();
function setup(role = 'human') {
  const state = {}, trace = [], events = [];
  const human = { decide: async (_g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return state.targets ? state.targets.filter(card => q.candidates.includes(card)) : q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseCards') return state.cards ? state.cards.filter(card => q.from.includes(card)) : q.from.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    return q.options?.find(option => option.key === 'yes')?.key || q.options?.[0]?.key;
  } };
  const game = new M.Game({ seed: 70226, paced: false });
  const a = game.addPlayer('You', {}, human, role === 'ai'), b = game.addPlayer('Opponent', {}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, q) => { const result = await decide(g, q); trace.push({ q, result }); return result; };
  const emit = game.emit.bind(game);
  game.emit = async (kind, data) => { events.push({ kind, data }); return emit(kind, data); };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {};
  const put = (name, player = a, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], name);
    const card = new M.CardInst(M.DEFS[name], player); card.zone = zone; card.sick = false;
    if (zone === 'battlefield') { game.battlefield.push(card); game.recalc(); } else player[zone].push(card);
    return card;
  };
  return { game, a, b, state, trace, events, put };
}
async function settle(ctx) {
  for (let n = 0; n < 25 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); n++) {
    await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.equal(ctx.game.stack.length + ctx.game.pendingTriggers.length, 0);
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, player = ctx.a) {
  const card = ctx.put(name, player, 'hand');
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 10;
  assert.equal(await ctx.game.castSpell(player, card, { from: 'hand' }), true, name + ': actual paid cast');
  assert.ok(Object.values(player.pool).reduce((a, b) => a + b, 0) < 60);
  return card;
}
async function protectAttachment(ctx, name) {
  const host = ctx.put('Grizzly Bears', ctx.b), attachment = ctx.put(name);
  await ctx.game.attach(attachment, host);
  ctx.game.addCounters(attachment, 'charge', 2);
  ctx.state.targets = [attachment];
  await cast(ctx, 'Disenchant', ctx.b);
  await cast(ctx, 'Clever Concealment');
  await ctx.game.resolveTop();
  assert.equal(attachment.phasedOut, true); assert.equal(host.phasedOut, false);
  assert.ok(ctx.trace.some(row => row.q.type === 'chooseTargets' && row.result.includes(attachment)));
  await settle(ctx);
  assert.equal(attachment.zone, 'battlefield', 'Disenchant cannot find its phased target');
  return { host, attachment };
}
for (const role of ['human', 'ai']) {
  for (const effect of ['Wake the Past', 'Assault Formation']) test(`${role}: ${effect}'s actual temporary permission expires during cleanup while its creature is phased`, async () => {
    const ctx = setup(role), {game, a, b, put, state} = ctx;
    const host = put(effect === 'Wake the Past' ? 'Myr Retriever' : 'Wall of Omens', a, effect === 'Wake the Past' ? 'graveyard' : 'battlefield');
    const formation = effect === 'Assault Formation' ? put(effect) : null;
    for (const player of [a, b]) for (let n = 0; n < 10; n++) put('Forest', player, 'library');
    state.targets = [host]; let played = false;
    game.mainPhase = async () => {
      if (played) return; played = true;
      if (formation) {
        a.pool.G = 1;
        const ability = game.activatableList(a).find(entry => entry.card === formation && entry.ability?.label === 'Defender can attack');
        assert.ok(ability); assert.equal(await game.activateAbility(a, ability), true); await settle(ctx);
        assert.equal(a.pool.G, 0); assert.equal(host.meta.canAttackDefender, true);
      } else {
        await cast(ctx, effect); await settle(ctx); assert.equal(host.zone, 'battlefield'); assert.equal(host.kw('haste'), true);
      }
      await cast(ctx, 'Clever Concealment'); await settle(ctx); assert.equal(host.phasedOut, true);
    };
    game.combatPhase = async () => {}; await game.runTurn(); assert.equal(played, true);
    assert.equal(host.phasedOut, true);
    assert.equal(!!host.meta[formation ? 'canAttackDefender' : 'tempHaste'], false, 'printed this-turn permission expires on the absent object');
    await untapStep(game, a); await game.checkSBA();
    assert.equal(host.zone, 'battlefield'); assert.equal(host.phasedOut, false);
    if (formation) {assert.equal(host.kw('defender'), true); assert.equal(game.canAttackAtAll(host), false);}
    else assert.equal(host.kw('haste'), false);
  });
  test(`${role}: real cleanup removes damage while phased and Giant Growth expires, so the returning creature survives`, async () => {
    const ctx = setup(role), {game, a, b, put, state} = ctx, host = put('Grizzly Bears');
    for (const player of [a, b]) for (let n = 0; n < 10; n++) put('Forest', player, 'library');
    game.addCounters(host, 'charge', 2); const version = host.zoneVersion; state.targets = [host];
    game.turnPlayer = b; let played = false;
    game.mainPhase = async () => {
      if (played) return; played = true;
      await cast(ctx, 'Giant Growth'); await settle(ctx);
      await cast(ctx, 'Lightning Bolt', b); await settle(ctx);
      assert.equal(host.power, 5); assert.equal(host.damage, 3); assert.equal(host.zone, 'battlefield');
      await cast(ctx, 'Clever Concealment'); await settle(ctx);
      assert.equal(host.phasedOut, true); assert.equal(host.damage, 3, 'phasing itself does not remove marked damage');
    };
    game.combatPhase = async () => {};
    await game.runTurn(); assert.equal(played, true); assert.equal(game.phase, 'cleanup');
    assert.equal(host.phasedOut, true); assert.equal(host.damage, 0); assert.equal(host.counters.charge, 2);
    await untapStep(game, a); await game.checkSBA(); await settle(ctx);
    assert.equal(host.phasedOut, false); assert.equal(host.zone, 'battlefield'); assert.equal(host.zoneVersion, version);
    assert.equal(host.power, 2); assert.equal(host.toughness, 2); assert.equal(host.damage, 0);
  });
  test(`${role}: a stale normal, mana, equip or loyalty activation cannot use a source protected by Clever Concealment`, async () => {
    const ctx = setup(role), {game, a, state} = ctx;
    for (const name of ['Liquimetal Torque', 'Shivan Dragon', 'Bonesplitter', 'Garruk Wildspeaker']) {
      const source = await cast(ctx, name); await settle(ctx); source.sick = false;
      if (name === 'Bonesplitter') ctx.put('Grizzly Bears');
      const offered = game.activatableList(a).find(entry => entry.card === source && (name !== 'Liquimetal Torque' || entry.manaAbility));
      assert.ok(offered, name + ': real offered activation');
      state.targets = [source]; await cast(ctx, 'Clever Concealment'); await settle(ctx);
      assert.equal(source.phasedOut, true, name);
      const pool = {...a.pool}, counters = {...source.counters};
      assert.equal(await game.activateAbility(a, offered), false, name + ': stale entry is rejected');
      assert.deepEqual({...a.pool}, pool); assert.deepEqual({...source.counters}, counters);
      assert.equal(source.tapped, false); assert.equal(game.stack.length, 0);
    }
  });
  test(`${role}: a real Lightning Rager sacrifice already on the Stack cannot sacrifice a phased token or trigger Mayhem Devil`, async () => {
    const ctx = setup(role), { game, a, b, state } = ctx;
    game.turnPlayer = b; await cast(ctx, 'Rite of the Raging Storm', b); await settle(ctx); game.turnPlayer = a;
    ctx.put('Mayhem Devil', b);
    await game.emit('upkeep', { player: a }); await settle(ctx);
    const token = game.creatures(a).find(card => card.name === 'Lightning Rager'); assert.ok(token);
    await game.emit('endStep', { player: a }); await game.flushTriggers();
    assert.ok(game.stack.some(row => row.srcCard === token || row.ctx?.src === token), 'actual printed end-step sacrifice uses Stack');
    state.targets = [token]; await cast(ctx, 'Clever Concealment'); await game.resolveTop();
    assert.equal(token.phasedOut, true); ctx.events.length = 0;
    await settle(ctx);
    assert.equal(token.zone, 'battlefield'); assert.equal(token.phasedOut, true); assert.equal(a.life, 40);
    assert.equal(ctx.events.filter(event => event.kind === 'sacrificed').length, 0, 'failed sacrifice creates no event');
    game.phaseInFor(a); await game.emit('endStep', { player: a }); await settle(ctx);
    assert.equal(token.zone, 'ceased'); assert.equal(ctx.events.filter(event => event.kind === 'sacrificed').length, 1, 'the next real end step sacrifices the returned token');
  });
  for (const name of ['Rancor', 'Bonesplitter']) test(`${role}: directly phased ${name} survives its host's death and returns unattached at its own untap`, async () => {
    const ctx = setup(role), { game, a, state } = ctx;
    const { host, attachment } = await protectAttachment(ctx, name), version = attachment.zoneVersion;
    ctx.events.length = 0; state.targets = [host];
    await cast(ctx, 'Murder'); await settle(ctx);
    assert.equal(host.zone, 'graveyard'); assert.equal(attachment.zone, 'battlefield'); assert.equal(attachment.phasedOut, true);
    assert.equal(attachment.zoneVersion, version); assert.equal(attachment.counters.charge, 2);
    assert.equal(ctx.events.some(event => event.data.card === attachment), false, 'host death does not emit premature Aura death/leave triggers');
    assert.equal(game.phaseInFor(ctx.b).length, 0);
    assert.equal(game.phaseInFor(a).includes(attachment), true); assert.equal(attachment.attachedTo, null);
    assert.equal(ctx.events.some(event => event.kind === 'attached' || event.kind === 'unattached'), false);
    await game.checkSBA();
    if (name === 'Rancor') {
      assert.equal(attachment.zone, 'graveyard'); assert.equal(game.pendingTriggers.filter(trigger => trigger.src === attachment).length, 1);
      await settle(ctx); assert.equal(attachment.zone, 'hand', 'Rancor returns only after its phase-in Aura SBA');
    } else { assert.equal(attachment.zone, 'battlefield'); assert.equal(attachment.counters.charge, 2); }
  });
  for (const name of ['Rancor', 'Bonesplitter']) test(`${role}: phased ${name} does not attach to the new object after its host blinks`, async () => {
    const ctx = setup(role), { game, a } = ctx, { host, attachment } = await protectAttachment(ctx, name);
    const version = host.zoneVersion;
    await game.move(host, 'exile'); await game.putPermanentOntoBattlefield(host, ctx.b);
    assert.ok(host.zoneVersion > version); assert.equal(attachment.zone, 'battlefield'); assert.equal(attachment.phasedOut, true);
    game.phaseInFor(a); assert.equal(attachment.attachedTo, null); assert.equal(host.attachments.includes(attachment.iid), false);
    await game.checkSBA(); await settle(ctx);
    assert.equal(attachment.zone, name === 'Rancor' ? 'hand' : 'battlefield'); assert.equal(host.power, 2);
  });
  test(`${role}: Clever Concealment recursively phases nested attachments with the host's return, preserving tokens and counters`, async () => {
    const ctx = setup(role), { game, a, b, put, state } = ctx;
    const host = put('Grizzly Bears'), equipment = put('Bonesplitter', b), aura = put('Indestructibility', b);
    host.isToken = true; game.addCounters(host, '+1/+1', 2);
    await game.attach(equipment, host); await game.attach(aura, equipment);
    const versions = [host, equipment, aura].map(card => card.zoneVersion); state.targets = [host]; ctx.events.length = 0;
    await cast(ctx, 'Clever Concealment'); await settle(ctx);
    for (const card of [host, equipment, aura]) assert.equal(card.phasedOut, true, card.name);
    assert.equal(game.phaseInFor(b).length, 0, 'indirect attachment does not return during its own controller untap');
    const returned = game.phaseInFor(a); assert.equal(returned.length, 3);
    assert.deepEqual([host, equipment, aura].map(card => card.zoneVersion), versions);
    assert.equal(host.counters['+1/+1'], 2); assert.equal(host.isToken, true); assert.equal(host.power, 6);
    assert.equal(equipment.attachedTo, host.iid); assert.equal(aura.attachedTo, equipment.iid);
    assert.equal(equipment.kw('indestructible'), true);
    assert.equal(ctx.events.some(event => ['attached', 'unattached', 'etb', 'dies', 'leave'].includes(event.kind) && [host, equipment, aura].includes(event.data.card || event.data.att)), false);
  });
}

test('ordinary mutation APIs treat phased references as absent, while off-battlefield counters still work', async () => {
  const { game, a, b, put, events } = setup(), card = put('Grizzly Bears'), source = put('Shivan Dragon', b);
  game.addCounters(card, 'shield', 1); game.addCounters(card, 'stun', 1); game.addCounters(card, 'charge', 2);
  card.tapped = true; card.regenShield = 1; game.phaseOut(card, a); events.length = 0;
  assert.equal(game.canSacrifice(card), false); assert.equal(await game.sacrifice(a, card), false); assert.equal(await game.sacrificeMany(a, [card]), 0);
  assert.equal(await game.destroy(card), false); await game.destroyMany([card]);
  assert.equal(await game.damageCreature(source, card, 3), 0); assert.equal(card.damage, 0);
  assert.equal(game.untap(card), false); assert.equal(card.tapped, true); assert.equal(card.counters.stun, 1);
  game.addCounters(card, 'charge', 3); game.removeCounters(card, 'charge', 1);
  assert.equal(card.counters.charge, 2); assert.equal(card.counters.shield, 1); assert.equal(card.regenShield, 1); assert.equal(events.length, 0);
  game.phaseInFor(a); card.tapped = false; game.phaseOut(card, a); assert.equal(game.tap(card), false); assert.equal(card.tapped, false);
  const suspended = put('Forest', a, 'exile'); game.addCounters(suspended, 'time', 2); game.removeCounters(suspended, 'time', 1); assert.equal(suspended.counters.time, 1);
});

test('simultaneous phasing gives indirect precedence in either target order and never reschedules an already phased attachment', async () => {
  for (const reverse of [false, true]) {
    const { game, a, b, put } = setup(), host = put('Grizzly Bears'), equipment = put('Bonesplitter', b);
    await game.attach(equipment, host);
    game.phaseOutMany(reverse ? [equipment, host] : [host, equipment]);
    assert.equal(game.phaseInFor(b).length, 0); assert.equal(game.phaseInFor(a).length, 2);
    game.phaseOut(equipment, b); game.phaseOut(host, a);
    assert.equal(equipment.meta.phaseIndirect, undefined);
    assert.equal(game.phaseInFor(a).length, 1); assert.equal(equipment.phasedOut, true);
    assert.equal(game.phaseInFor(b).length, 1); assert.equal(equipment.attachedTo, host.iid);
  }
});

test('actual Clever Concealment and Ripples of Potential resolve selected attachment-first permanents as one phasing event', async () => {
  for (const name of ['Clever Concealment', 'Ripples of Potential']) {
    const ctx = setup(), { game, a, put, state } = ctx, host = put('Grizzly Bears'), equipment = put('Bonesplitter');
    await game.attach(equipment, host);
    if (name === 'Ripples of Potential') { game.addCounters(host, '+1/+1', 1); game.addCounters(equipment, 'charge', 1); }
    state.targets = state.cards = [equipment, host];
    await cast(ctx, name); await settle(ctx);
    assert.equal(host.phasedOut, true); assert.equal(equipment.phasedOut, true);
    assert.equal(equipment.meta.phaseIndirect.iid, host.iid, name + ': host selected second still makes the attachment indirect');
    assert.equal(game.phaseInFor(a).length, 2);
    if (name === 'Ripples of Potential') { assert.equal(host.counters['+1/+1'], 2); assert.equal(equipment.counters.charge, 2); }
  }
});

test('the real turn loop skips the entire phase-in event with a skipped untap, then returns and untaps the cohort', async () => {
  const ctx = setup(), { game, a, b, put } = ctx, host = put('Grizzly Bears'), equipment = put('Bonesplitter', b);
  await game.attach(equipment, host); host.tapped = true; equipment.tapped = true;
  game.phaseOut(host, a); a.skipUntapOnce = true;
  for (let n = 0; n < 5; n++) put('Forest', a, 'library');
  game.mainPhase = async () => {}; game.combatPhase = async () => {};
  await game.runTurn(); assert.equal(host.phasedOut, true); assert.equal(equipment.phasedOut, true); assert.equal(host.tapped, true);
  game.turnPlayer = a; await game.runTurn();
  assert.equal(host.phasedOut, false); assert.equal(equipment.phasedOut, false);
  assert.equal(host.tapped, false); assert.equal(equipment.tapped, true, 'opponent-owned equipment phases in but does not untap during your untap');
});

test('phase-out is absent from ordinary move and attachment effects; returning remembers the same host through control changes', async () => {
  const { game, a, b, put } = setup(), host = put('Grizzly Bears'), other = put('Llanowar Elves'), equipment = put('Bonesplitter');
  await game.attach(equipment, host); game.phaseOut(equipment, a);
  await game.move(equipment, 'graveyard'); assert.equal(equipment.zone, 'battlefield');
  assert.equal(await game.attach(equipment, other), false); assert.equal(await game.attach(other, equipment), false);
  host.ctrl = b; game.phaseInFor(a); assert.equal(equipment.attachedTo, host.iid); assert.equal(host.ctrl, b);
});

test('JSON save/load and AI simulation preserve the return seat, nested indirect cohort and old host incarnation', async () => {
  const ctx = setup(), { game, a, b, put } = ctx, host = put('Grizzly Bears'), equipment = put('Bonesplitter', b), aura = put('Indestructibility', b);
  await game.attach(equipment, host); await game.attach(aura, equipment); game.phaseOut(host, a);
  const snapshot = M.captureGameState(game); assert.ok(snapshot);
  const fresh = setup().game; M.restoreGameState(fresh, JSON.parse(JSON.stringify(snapshot)));
  assert.equal(fresh.phaseInFor(fresh.players[1]).length, 0); assert.equal(fresh.phaseInFor(fresh.players[0]).length, 3);
  assert.equal(fresh.byIid(equipment.iid).attachedTo, host.iid); assert.equal(fresh.byIid(aura.iid).attachedTo, equipment.iid);
  const clone = M.cloneGameForAISimulation(game, 52); assert.equal(clone.phaseInFor(clone.players[0]).length, 3);
  assert.equal(host.phasedOut, true); assert.equal(equipment.phasedOut, true); assert.equal(aura.phasedOut, true);
  game.phaseInFor(a); game.phaseOut(equipment, b); await game.move(host, 'exile'); await game.putPermanentOntoBattlefield(host, a);
  const next = M.captureGameState(game); assert.ok(next); const restored = setup().game;
  M.restoreGameState(restored, JSON.parse(JSON.stringify(next))); assert.equal(restored.phaseInFor(restored.players[1]).length, 2);
  assert.equal(restored.byIid(equipment.iid).attachedTo, null); assert.equal(restored.byIid(aura.iid).attachedTo, equipment.iid);
});
