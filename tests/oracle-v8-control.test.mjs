import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const fixtures = [
  ['Creature', 'Enchantment — Aura', 'Enchant creature\nYou control enchanted creature.'],
  ['Permanent', 'Enchantment — Aura', 'Enchant permanent\nYou control enchanted permanent.'],
  ['Artifact', 'Enchantment — Aura', 'Enchant artifact\nYou control enchanted artifact.'],
  ['Enchantment', 'Enchantment — Aura', 'Enchant enchantment\nYou control enchanted enchantment.'],
  ['Land', 'Enchantment — Aura', 'Enchant land\nYou control enchanted land.'],
  ['Buff', 'Enchantment — Aura', 'Enchant creature\nYou control enchanted creature.\nEnchanted creature gets +2/+2 and has flying.'],
  ['Temporary', 'Sorcery', 'Gain control of target creature until end of turn.'],
  ['Lasting', 'Sorcery', 'Gain control of target permanent.'],
].map(([name, type, oracle], i) => {
  const card = {name: 'V8 Control ' + name, type_line: type, layout: 'normal', mana_cost: '{2}{U}', oracle_text: oracle};
  const semantics = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantics.semanticClass, card.name + ': ' + semantics.reason);
  return {position: i + 1, oracleId: 'v8-control-' + i, scryfallId: 'v8-control-print-' + i, ...semantics,
    raw: {name: card.name, cost: card.mana_cost, oracle, types: [type.split(' — ')[0]], subtypes: type.includes('Aura') ? ['Aura'] : [], super: [], _ci: ['U']},
    catalog: {typeLine: type, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-v8-control-test', sequence: 9994, cards: fixtures});
M.initData(M.RAW_DATA);

function context(role = 'human', fullPriority = false) {
  const state = {}, trace = [];
  const human = {decide: async (game, query) => {
    if (query.type === 'priority' || query.type === 'main') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return state.targets?.(query) ?? query.candidates.slice(0, query.min || query.max || 1);
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.options.find(option => ['yes', 'stay'].includes(option.key))?.key ?? query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    if (query.type === 'chooseX') return query.min || 0;
    return [];
  }};
  const game = new M.Game({seed: 127613, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, {...human}, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, {...human}, false), c = game.addPlayer('C', {name: 'C'}, {...human}, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  for (const player of game.players) {
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (g, query) => {const result = await decide(g, query); trace.push({player, query, result}); return result;};
  }
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
  if (!fullPriority) game.priorityRound = async () => {};
  game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  return {game, a, b, c, state, trace};
}
function model(name = 'Control Model', extras = {}) {
  return {name, cost: '{4}{G}', oracle: '', types: ['Creature'], subtypes: ['Dragon'], super: [], power: '6', toughness: '7', kws: [], ...extras};
}
function put(game, player, name, zone = 'battlefield') {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[name] : name, player);
  assert.ok(card.def, String(name)); card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') {game.battlefield.push(card); game.recalc();} else player[zone].push(card);
  return card;
}
async function settle(game) {
  for (let n = 0; n < 100 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, player = ctx.a, {resolve = true, pilot = false} = {}) {
  const {game} = ctx, source = put(game, player, 'V8 Control ' + name, 'hand');
  game.turnPlayer = player; game.phase = 'main1'; player.pool.U = 1; player.pool.C = 2;
  if (pilot) {
    const action = await player.controller.decide(game, {type: 'main', player, phase: game.phase,
      casts: game.castableList(player), acts: game.activatableList(player), lands: []});
    assert.equal(action.kind, 'cast', JSON.stringify(game.aiDecisionLog?.at(-1))); assert.equal(action.card, source);
    assert.equal(await game.performAction(player, action), true);
  } else assert.equal(await game.castSpell(player, source, {from: 'hand'}), true);
  assert.equal(player.pool.U + player.pool.C, 0, 'printed mana was paid');
  if (resolve) await settle(game);
  return source;
}
function target(ctx, card) {ctx.state.targets = query => query.candidates.includes(card) ? [card] : query.candidates.slice(0, query.min || 1);}
async function turn(ctx, player) {
  for (const p of ctx.game.players) for (let n = 0; n < 3; n++) put(ctx.game, p, 'Forest', 'library');
  ctx.game.mainPhase = async () => {}; ctx.game.combatPhase = async () => {};
  ctx.game.turnPlayer = player; await ctx.game.runTurn();
}

test('v8 Aura control grammar is exact and leaves unsupported text deferred', () => {
  const valid = fixtures.find(entry => entry.raw.name === 'V8 Control Creature');
  assert.ok(valid.implementation.some(op => op.kind === 'aura-control-v8'));
  for (const oracle_text of ['Enchant creature\nYou control enchanted banana.', 'Enchant creature\nYou control enchanted creature until end of turn.', 'Enchant creature\nYou control enchanted creature and win the game.']) {
    assert.equal(semanticClass({name: 'Closed Control', layout: 'normal', type_line: 'Enchantment — Aura', oracle_text}, {compilerVersion: 8}).semanticClass, undefined);
  }
});

for (const role of ['human', 'ai']) {
  test(`v8 Aura control ${role}: paid cast changes control, buffs its host and restores the previous controller`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx, host = put(game, c, model());
    host.ctrl = b; game.recalc(); host.tapped = true; host.sick = false; host.attacking = a;
    const aura = await cast(ctx, 'Buff');
    assert.equal(aura.zone, 'battlefield'); assert.equal(aura.attachedTo, host.iid); assert.equal(host.ctrl, a);
    assert.equal(host.owner, c); assert.equal(host.sick, true); assert.equal(host.attacking, null); assert.equal(host.tapped, true);
    assert.equal(host.power, 8); assert.equal(host.kw('flying'), true);
    await game.move(aura, 'graveyard'); await settle(game);
    assert.equal(host.ctrl, b, 'entry owner is not substituted for a prior lasting controller');
    assert.equal(host.power, 6); assert.equal(host.kw('flying'), false);
  });
  test(`v8 Aura control ${role}: a stale cast target does not enchant its new battlefield incarnation`, async () => {
    const ctx = context(role), {game, b} = ctx, host = put(game, b, model());
    const aura = await cast(ctx, 'Creature', ctx.a, {resolve: false});
    await game.move(host, 'exile'); await game.move(host, 'battlefield', {ctrl: b}); await settle(game);
    assert.equal(aura.zone, 'graveyard'); assert.equal(host.ctrl, b); assert.equal(host.attachments.includes(aura.iid), false);
  });
  test(`v8 Aura control ${role}: a stolen Aura continuously transfers its enchanted creature`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx, host = put(game, c, model());
    const first = await cast(ctx, 'Creature'); target(ctx, first);
    const second = await cast(ctx, 'Enchantment', b);
    assert.equal(first.ctrl, b); assert.equal(host.ctrl, b, 'dependent control effect uses the Aura current controller');
    await game.move(second, 'graveyard'); await settle(game); assert.equal(first.ctrl, a); assert.equal(host.ctrl, a);
    await game.move(first, 'graveyard'); await settle(game); assert.equal(host.ctrl, c);
  });
}

test('v8 Aura control competing timestamps reveal each older still-active effect', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  const first = await cast(ctx, 'Creature'), second = await cast(ctx, 'Creature', c);
  assert.equal(host.ctrl, c); await game.move(second, 'graveyard'); await settle(game); assert.equal(host.ctrl, a);
  await game.move(first, 'graveyard'); await settle(game); assert.equal(host.ctrl, b);
});

test('v8 Aura control moving an Aura creates a new timestamp but same-host attachment does nothing', async () => {
  const ctx = context(), {game, a, b, c} = ctx, firstHost = put(game, b, model('Control First')), secondHost = put(game, b, model('Control Second'));
  target(ctx, firstHost); const first = await cast(ctx, 'Creature'); target(ctx, secondHost); const second = await cast(ctx, 'Creature', c);
  await game.attach(first, secondHost); assert.equal(firstHost.ctrl, b); assert.equal(secondHost.ctrl, a);
  target(ctx, secondHost); await cast(ctx, 'Lasting', c); assert.equal(secondHost.ctrl, c);
  await game.attach(first, secondHost); assert.equal(secondHost.ctrl, c, 'a no-op attachment cannot acquire a newer timestamp');
  await game.attach(first, firstHost); await game.attach(first, secondHost); assert.equal(secondHost.ctrl, a);
  await game.move(first, 'graveyard'); await settle(game); assert.equal(secondHost.ctrl, c); assert.equal(second.zone, 'battlefield');
});

test('v8 Aura control an older temporary theft expires underneath a newer Aura', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  await cast(ctx, 'Temporary', c); assert.equal(host.ctrl, c); const aura = await cast(ctx, 'Creature'); assert.equal(host.ctrl, a);
  await turn(ctx, c); assert.equal(host.ctrl, a); await game.move(aura, 'graveyard'); await settle(game); assert.equal(host.ctrl, b);
});

test('v8 Aura control a newer temporary theft expires to the Aura rather than the owner', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  const aura = await cast(ctx, 'Creature'); await cast(ctx, 'Temporary', c); assert.equal(host.ctrl, c);
  await turn(ctx, c); assert.equal(host.ctrl, a); await game.move(aura, 'graveyard'); await settle(game); assert.equal(host.ctrl, b);
});

test('v8 control later lasting theft survives the expiry of stacked temporary effects', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  await cast(ctx, 'Temporary'); await cast(ctx, 'Temporary', c); await cast(ctx, 'Lasting');
  assert.equal(host.ctrl, a); await turn(ctx, c); assert.equal(host.ctrl, a);
  assert.equal(game.untilEffects.filter(effect => effect.layeredControl && effect.expires === 'eot').length, 0);
});

test('v8 Aura control a blinked host loses both the Aura and every old control effect', async () => {
  const ctx = context(), {game, b, c} = ctx, host = put(game, b, model());
  await cast(ctx, 'Lasting', c); const aura = await cast(ctx, 'Creature');
  await game.move(host, 'exile'); await game.move(host, 'battlefield', {ctrl: b}); await settle(game);
  assert.equal(host.ctrl, b); assert.equal(aura.zone, 'graveyard'); assert.equal(host.attachments.length, 0);
  assert.equal(game.untilEffects.some(effect => effect.layeredControl && effect.iid === host.iid), false);
});

test('v8 Aura control direct legacy assignments compose with Aura effects without rewriting ownership', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  host.ctrl = c; game.recalc(); const aura = await cast(ctx, 'Creature'); assert.equal(host.ctrl, a);
  await game.move(aura, 'graveyard'); await settle(game); assert.equal(host.ctrl, c); assert.equal(host.owner, b);
  const next = await cast(ctx, 'Creature'); host.sick = false; host.ctrl = b; game.recalc();
  assert.equal(host.ctrl, b); assert.equal(host.sick, true);
  await game.move(next, 'graveyard'); await settle(game); assert.equal(host.ctrl, b);
});

test('v8 Aura control a dependency loop uses stable timestamp order', async () => {
  const ctx = context(), {game, b, c} = ctx;
  const host = put(game, c, model('Control Enchantment Model', {types: ['Enchantment'], subtypes: [], power: undefined, toughness: undefined}));
  target(ctx, host); const first = await cast(ctx, 'Enchantment'); target(ctx, first); const second = await cast(ctx, 'Enchantment', b);
  await game.attach(first, second);
  for (let n = 0; n < 10; n++) {game.recalc(); assert.equal(first.ctrl, b); assert.equal(second.ctrl, b);}
  assert.equal(host.ctrl, c, 'moving the first Aura releases the former host');
});

test('v8 Aura control real hard AI selects an opposing creature and resolves a paid theft', async () => {
  const ctx = context('ai', true), {game, a, b} = ctx, host = put(game, b, model());
  let stackSeen = false; const resolve = game.resolveTop.bind(game);
  game.resolveTop = async () => {stackSeen ||= game.stack.at(-1)?.kind === 'spell'; return resolve();};
  await cast(ctx, 'Creature', a, {pilot: true});
  assert.equal(host.ctrl, a); assert.equal(stackSeen, true); assert.ok(ctx.trace.some(row => row.query.type === 'chooseTargets'));
});

test('v8 Aura control phasing keeps timestamps and exact battlefield lifetimes', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  const aura = await cast(ctx, 'Creature'), stamp = aura.meta.oracleAuraControlAttachment.stamp, version = host.zoneVersion;
  assert.equal(game.phaseOut(aura, a), true); assert.equal(host.ctrl, b);
  game.phaseInFor(a); assert.equal(host.ctrl, a); assert.equal(aura.meta.oracleAuraControlAttachment.stamp, stamp);
  await cast(ctx, 'Temporary', c); assert.equal(host.ctrl, c);
  assert.equal(game.phaseOut(host, c), true); assert.equal(aura.phasedOut, true);
  game.phaseInFor(c); assert.equal(host.ctrl, c); assert.equal(host.zoneVersion, version);
  await turn(ctx, c); assert.equal(host.ctrl, a); assert.equal(aura.meta.oracleAuraControlAttachment.stamp, stamp);
});

test('v8 Aura control AI snapshots retain isolated controllers and layered control records', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  const aura = await cast(ctx, 'Creature'); await cast(ctx, 'Temporary', c);
  const clone = M.cloneGameForAISimulation(game, 613), copiedHost = clone.byIid(host.iid), copiedAura = clone.byIid(aura.iid);
  clone.recalc(); assert.equal(copiedHost.ctrl, clone.players[c.idx]); assert.notEqual(copiedHost.ctrl, c);
  clone.untilEffects = clone.untilEffects.filter(effect => effect.expires !== 'eot'); clone.recalc();
  assert.equal(copiedHost.ctrl, clone.players[a.idx]); assert.equal(host.ctrl, c);
  await clone.move(copiedAura, 'graveyard'); clone.recalc(); assert.equal(copiedHost.ctrl, clone.players[b.idx]);
  assert.equal(aura.zone, 'battlefield'); assert.equal(host.ctrl, c);
});

test('v8 Aura control a blinked Aura gets a new object and overrides later lasting theft', async () => {
  const ctx = context(), {game, a, b, c} = ctx, host = put(game, b, model());
  const aura = await cast(ctx, 'Creature'); await cast(ctx, 'Lasting', c); assert.equal(host.ctrl, c);
  const oldVersion = aura.zoneVersion; await game.move(aura, 'exile');
  ctx.state.cards = query => query.from.includes(host) ? [host] : query.from.slice(0, 1);
  assert.equal(await game.putPermanentOntoBattlefield(aura, a), true); await settle(game);
  assert.ok(aura.zoneVersion > oldVersion); assert.equal(host.ctrl, a);
  await game.move(aura, 'graveyard'); await settle(game); assert.equal(host.ctrl, c);
});

test('v8 Aura control portable decision replay reconstructs control metadata without saving live references', async () => {
  async function play(records = null) {
    const ctx = context(), {game, a, b, c} = ctx, timeline = []; let cursor = 0;
    for (const player of game.players) {
      const decide = player.controller.decide.bind(player.controller);
      player.controller.decide = async (g, query) => {
        if (records) return M.restoreSaveDecision(query, player, records[cursor++]);
        const response = await decide(g, query); timeline.push(M.recordSaveDecision(query, player, response)); return response;
      };
    }
    const host = put(game, b, model()), aura = await cast(ctx, 'Creature'); await cast(ctx, 'Temporary', c);
    const controlled = {controller: host.ctrl.idx, owner: host.owner.idx,
      clock: game.oracleControlClock, sourceStamp: aura.meta.oracleAuraControlAttachment.stamp,
      layers: game.untilEffects.filter(effect => effect.layeredControl).map(effect => [effect.kind, effect.to.idx, effect.timestamp, effect.expires])};
    await turn(ctx, c); assert.equal(host.ctrl, a);
    await game.move(aura, 'graveyard'); await settle(game); assert.equal(host.ctrl, b);
    if (records) assert.equal(cursor, records.length);
    return {timeline, controlled};
  }
  const first = await play(), serialized = JSON.parse(JSON.stringify(first.timeline)), resumed = await play(serialized);
  assert.ok(serialized.length); assert.deepEqual(resumed.controlled, first.controlled);
});
