import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect} from '../scripts/oracle-v8-linked.mjs';
import {extensionTarget} from '../scripts/oracle-extensions-v8.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const pair = (target, optional = false, plural = false) =>
  `When this creature enters, ${optional ? 'you may ' : ''}exile ${target}.\nWhen this creature leaves the battlefield, return the exiled card${plural ? 's' : ''} to the battlefield under ${plural ? "their owners'" : "its owner's"} control.`;
const definitions = [
  ['Artifacts', 'Enchantment', 'When this enchantment enters, exile all artifacts your opponents control until this enchantment leaves the battlefield.'],
  ['Lockdown', 'Enchantment', 'When this enchantment enters, exile each nonland permanent with mana value 2 or less until this enchantment leaves the battlefield.'],
  ['Power', 'Artifact', 'When this artifact enters, exile all creatures with power 5 or greater until this artifact leaves the battlefield.'],
  ['Any', 'Creature', 'When this creature enters, you may exile any number of other creatures you control until this creature leaves the battlefield.'],
  ['Until', 'Creature', 'When this creature enters, exile another target creature until this creature leaves the battlefield.'],
  ['Until Ability', 'Artifact', '{1}: Exile target creature until this artifact leaves the battlefield.'],
  ['Everything Ability', 'Artifact', '{1}: Exile all nonland permanents until this artifact leaves the battlefield.'],
  ['Blocker', 'Creature', 'Whenever this creature becomes blocked by a creature, exile that creature until this creature leaves the battlefield.'],
  ['Ring', 'Enchantment', pair('another target nonland permanent').replaceAll('this creature', 'this enchantment')],
  ['Hunter', 'Creature', pair('another target creature', true)],
  ['Butcher', 'Creature', pair('another target creature')],
  ['Land', 'Creature', pair('target land')],
  ['Lands', 'Creature', pair('two target lands', false, true)],
  ['Group Pair', 'Creature', pair('all other permanents you control', false, true)],
  ['Tapped Pair', 'Creature', pair('all lands', false, true).replace('battlefield under', 'battlefield tapped under')],
  ['Chosen Land', 'Creature', pair('a land you control')],
  ['Storage', 'Artifact', '{1}: Exile target creature you control.\nSacrifice this artifact: Return each creature card exiled with this artifact to the battlefield under your control.'],
  ['Storage Owner', 'Artifact', '{1}, {T}: Exile target creature you control.\n{1}, {T}, Sacrifice this artifact: Return each creature card exiled with this artifact to the battlefield under its owner\'s control.'],
  ['Vault', 'Artifact', '{1}: Exile target creature you control.\n{1}: Exile target creature you don\'t control.\nWhen this artifact is put into a graveyard from the battlefield, return all cards exiled with it to the battlefield under their owners\' control.'],
  ['Grave Collector', 'Creature', 'Whenever this creature attacks, exile target creature card from your graveyard.\nWhen this creature dies, put all cards exiled with it onto the battlefield.'],
  ['Hand Return', 'Creature', pair('another target creature').replace("to the battlefield under its owner's control", "to its owner's hand")],
  ['Grave Return', 'Creature', pair('target creature card from a graveyard').replace("to the battlefield under its owner's control", "to its owner's graveyard")],
  ['Fade Pair', 'Enchantment', 'Fading 2\nRemove a fade counter from this enchantment: Exile target land.\nWhen this enchantment leaves the battlefield, each player returns to the battlefield all cards they own exiled with it.'],
];

const fixtures = definitions.map(([name, type, oracle], index) => {
  const card = {name: 'V8 Linked ' + name, type_line: type, layout: 'normal', mana_cost: '{2}{W}', oracle_text: oracle, power: '2', toughness: '3'};
  const semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, `${name}: ${semantic.reason}`);
  return {position: index + 1, oracleId: 'v8-linked-' + index, scryfallId: 'v8-linked-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle, types: [type], subtypes: [], super: [], _ci: ['W'], ...(type === 'Creature' ? {power: '2', toughness: '3'} : {})},
    catalog: {typeLine: type, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-v8-linked-test', sequence: 9998, cards: fixtures});
M.initData(M.RAW_DATA);

function context(role = 'human', fullPriority = false) {
  const state = {}, trace = [];
  let a;
  const human = {decide: async (game, query) => {
    if (query.type === 'priority' || query.type === 'main') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return state.targets?.(query) ??
      [...query.candidates].sort((x, y) => Number(x.ctrl === a) - Number(y.ctrl === a)).slice(0, query.min || 1);
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return state.option?.(query) ?? (state.decline
      ? query.options.find(option => ['no', 'decline'].includes(option.key))?.key ?? query.options.at(-1).key
      : query.options.find(option => ['yes', 'stay'].includes(option.key))?.key ?? query.options[0].key);
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    if (query.type === 'chooseX') return query.min || 0;
    return [];
  }};
  const game = new M.Game({seed: 127607, paced: false});
  a = game.addPlayer('A', {name: 'A'}, human, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, human, false);
  const c = game.addPlayer('C', {name: 'C'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {const answer = await decide(g, query); trace.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
  if (!fullPriority) game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  return {game, a, b, c, state, trace};
}

function creature(name, extra = {}) {
  return {name, cost: '{1}{G}', oracle: '', types: ['Creature'], subtypes: [], super: [], power: '6', toughness: '6', kws: [], ...extra};
}
function put(game, player, name, zone = 'battlefield') {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[name] : name, player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') {game.battlefield.push(card); game.recalc();} else player[zone].push(card);
  return card;
}
async function settle(game) {
  for (let n = 0; n < 80 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, {resolve = true, pilot = false} = {}) {
  const {game, a} = ctx, source = put(game, a, 'V8 Linked ' + name, 'hand');
  a.pool.W = 1; a.pool.C = 2;
  if (pilot) {
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase,
      casts: game.castableList(a), acts: game.activatableList(a), lands: []});
    assert.equal(action.kind, 'cast', JSON.stringify(game.aiDecisionLog?.at(-1)));
    assert.equal(action.card, source); assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.castSpell(a, source, {from: 'hand'}), true);
  assert.equal(a.pool.W + a.pool.C, 0, 'the ordinary cast pays the printed cost');
  if (resolve) await settle(game);
  return source;
}
async function enterWithPendingTrigger(ctx, name) {
  const source = await cast(ctx, name, {resolve: false});
  assert.equal(ctx.game.stack.at(-1).kind, 'spell');
  await ctx.game.resolveTop(); await ctx.game.flushTriggers();
  assert.equal(source.zone, 'battlefield'); assert.ok(ctx.game.stack.some(row => row.kind === 'trigger'));
  return source;
}
async function activate(ctx, source, index = 0, {resolve = true, player = ctx.a, mana = 1} = {}) {
  player.pool.C = mana;
  const entry = ctx.game.activatableList(player).find(row => row.card === source && row.idx === index);
  assert.ok(entry, `ability ${index} should be available`);
  assert.equal(await ctx.game.activateAbility(player, entry), true);
  assert.equal(player.pool.C, 0, 'the activation pays its ordinary mana cost');
  if (resolve) await settle(ctx.game);
}
function observeReturns(game, cards) {
  const rows = [], emit = game.emit.bind(game);
  game.emit = async (name, data) => {
    if (name === 'etb' && cards.includes(data.card)) rows.push({card: data.card, together: cards.every(card => card.zone === 'battlefield')});
    return emit(name, data);
  };
  return rows;
}

test('v8 linked grammar registers both halves and keeps unsupported pairs closed', () => {
  for (const name of ['Ring', 'Hunter', 'Butcher', 'Land', 'Lands']) {
    const fixture = fixtures.find(row => row.raw.name === 'V8 Linked ' + name);
    const actions = fixture.implementation.flatMap(op => op.effects || []).map(effect => effect.action);
    assert.ok(actions.includes('linked-exile'), name); assert.ok(actions.includes('linked-return'), name);
    assert.equal(actions.includes('exile'), false, 'an ordinary exile cannot masquerade as linked acquisition');
  }
  const card = {name: 'Closed Pair', oracle_text: pair('another target creature')};
  for (const oracle of [card.oracle_text.replace("its owner's", 'your'), card.oracle_text.replace('to the battlefield under its owner\'s control', "to its owner's hand"), card.oracle_text + '\n{1}: Exile target artifact.']) {
    assert.equal(extensionEffect({...card, oracle_text: oracle}, 'Return the exiled card to the battlefield under its owner\'s control.', {target: extensionTarget}), null);
  }
  for (const text of ['Exile all creatures until target enchantment leaves the battlefield.', 'Exile all creatures until this creature leaves the battlefield, then draw a card.']) {
    assert.equal(extensionEffect(card, text, {target: extensionTarget}), null);
  }
});

for (const role of ['human', 'ai']) {
  test(`v8 linked ${role}: group artifact exile checks opponents and returns to owners immediately`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx;
    const own = put(game, a, 'Sol Ring'), first = put(game, b, 'Sol Ring'), second = put(game, c, 'Sol Ring');
    const unaffected = put(game, b, 'Grizzly Bears'), source = await cast(ctx, 'Artifacts');
    assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'exile');
    assert.equal(own.zone, 'battlefield'); assert.equal(unaffected.zone, 'battlefield');
    assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false, 'group exile does not target');
    const events = observeReturns(game, [first, second]);
    await game.move(source, 'graveyard');
    assert.equal(first.zone, 'battlefield'); assert.equal(first.ctrl, b); assert.equal(second.ctrl, c);
    assert.equal(game.stack.length, 0, 'an until return is not a triggered ability');
    assert.equal(events.length, 2); assert.ok(events.every(row => row.together), 'all returned permanents enter together');
  });
  test(`v8 linked ${role}: mana-value group excludes lands and uses the battlefield value`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    const own = put(game, a, 'Sol Ring'), enemy = put(game, b, 'Grizzly Bears'), land = put(game, b, 'Forest');
    const costly = put(game, b, creature('Linked Costly', {cost: '{6}'}));
    const source = await cast(ctx, 'Lockdown');
    assert.equal(own.zone, 'exile'); assert.equal(enemy.zone, 'exile'); assert.equal(land.zone, 'battlefield'); assert.equal(costly.zone, 'battlefield');
    assert.equal(source.zone, 'battlefield'); await game.move(source, 'hand');
    assert.equal(own.zone, 'battlefield'); assert.equal(enemy.zone, 'battlefield');
  });
  test(`v8 linked ${role}: a power threshold is evaluated when the trigger resolves`, async () => {
    const ctx = context(role), {game, b} = ctx;
    const first = put(game, b, 'Grizzly Bears'), second = put(game, b, creature('Linked Large'));
    const source = await enterWithPendingTrigger(ctx, 'Power');
    M.E.pumpUntilEOT(game, first, 3, 0); M.E.pumpUntilEOT(game, second, -3, 0);
    await settle(game); assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'battlefield');
    await game.move(source, 'graveyard'); assert.equal(first.zone, 'battlefield'); assert.equal(first.power, 2);
  });
  test(`v8 linked ${role}: an until source leaving before resolution cannot exile or blink victims`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, 'Sol Ring');
    const version = victim.zoneVersion, source = await enterWithPendingTrigger(ctx, 'Artifacts');
    await game.move(source, 'hand'); await settle(game);
    assert.equal(victim.zone, 'battlefield'); assert.equal(victim.zoneVersion, version);
    assert.equal((game.oracleExileDurations || []).length, 0);
  });
  test(`v8 linked ${role}: changing control of source or victim never changes the returning owner`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx, victim = put(game, b, 'Sol Ring');
    victim.ctrl = c; game.recalc(); const source = await cast(ctx, 'Artifacts');
    assert.equal(victim.zone, 'exile'); source.ctrl = c; game.recalc(); await game.move(source, 'graveyard');
    assert.equal(victim.ctrl, b); assert.equal(source.owner, a); assert.equal(victim.zone, 'battlefield');
  });
  test(`v8 linked ${role}: exiled cards that leave and reenter exile are new objects`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, 'Sol Ring');
    const source = await cast(ctx, 'Artifacts');
    await game.move(victim, 'hand'); await game.move(victim, 'exile');
    await game.move(source, 'graveyard'); assert.equal(victim.zone, 'exile');
  });
  test(`v8 linked ${role}: true linked ETB/LTB uses the Stack and returns the stolen card to its owner`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx, victim = put(game, b, creature('Linked Threat'));
    victim.ctrl = c; game.recalc(); const source = await cast(ctx, 'Butcher');
    assert.equal(victim.zone, 'exile'); source.ctrl = c; game.recalc(); await game.move(source, 'graveyard');
    assert.equal(victim.zone, 'exile', 'paired return waits for its LTB trigger');
    await settle(game); assert.equal(victim.zone, 'battlefield'); assert.equal(victim.ctrl, b); assert.equal(source.owner, a);
  });
  test(`v8 linked ${role}: the LTB-before-ETB ordering leaves the later exiled card in exile`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, creature('Linked Late Threat'));
    const source = await enterWithPendingTrigger(ctx, 'Butcher');
    await game.move(source, 'graveyard'); await game.flushTriggers();
    assert.equal(game.stack.length, 2); await game.resolveTop();
    assert.equal(victim.zone, 'battlefield'); await settle(game);
    assert.equal(victim.zone, 'exile', 'old printed pair has no until-duration guard');
  });
  test(`v8 linked ${role}: a targeted linked ability rejects a blinked target`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, creature('Linked Blink Threat'));
    const source = await enterWithPendingTrigger(ctx, 'Butcher');
    await game.move(victim, 'exile'); await game.move(victim, 'battlefield', {ctrl: b});
    await settle(game); assert.equal(victim.zone, 'battlefield'); assert.equal((game.oracleLinkedExiles || []).length, 0);
    await game.move(source, 'graveyard'); await settle(game); assert.equal(victim.zone, 'battlefield');
  });
  test(`v8 linked ${role}: a normal paid activation handles a source inside its own simultaneous exile group`, async () => {
    const ctx = context(role), {game, a, b} = ctx, victim = put(game, b, 'Sol Ring');
    const source = await cast(ctx, 'Everything Ability'), oldSource = source.zoneVersion, oldVictim = victim.zoneVersion;
    const events = observeReturns(game, [source, victim]); a.pool.C = 1;
    const entry = game.activatableList(a).find(row => row.card === source); assert.ok(entry);
    assert.equal(await game.activateAbility(a, entry), true); assert.equal(a.pool.C, 0); await settle(game);
    assert.equal(source.zone, 'battlefield'); assert.equal(victim.zone, 'battlefield');
    assert.equal(source.zoneVersion, oldSource + 2); assert.equal(victim.zoneVersion, oldVictim + 2);
    assert.equal(events.length, 2); assert.ok(events.every(row => row.together));
    assert.equal((game.oracleExileDurations || []).length, 0);
  });
  test(`v8 linked ${role}: simultaneous source departures make separate until returns simultaneous`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx;
    const first = put(game, b, creature('Linked First')), one = await cast(ctx, 'Until');
    const second = put(game, c, creature('Linked Second')), two = await cast(ctx, 'Until');
    assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'exile');
    const events = observeReturns(game, [first, second]); await game.destroyMany([one, two]);
    assert.equal(first.zone, 'battlefield'); assert.equal(second.zone, 'battlefield');
    assert.equal(one.zone, 'graveyard'); assert.equal(two.zone, 'graveyard');
    assert.equal(game.creatures(a).length, 0); assert.equal(events.length, 2); assert.ok(events.every(row => row.together));
  });
  test(`v8 linked ${role}: per-blocker event objects and versions remain independent`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    const first = put(game, b, creature('Linked Blocker One')), second = put(game, b, creature('Linked Blocker Two'));
    const source = await cast(ctx, 'Blocker'); source.attacking = b; source.blockedBy = [first, second]; source.wasBlocked = true;
    for (const blocker of [first, second]) await game.emit('becomesBlockedByCreature', {attacker: source, blocker, blockers: source.blockedBy});
    await game.flushTriggers(); await game.move(second, 'hand'); await game.move(second, 'battlefield', {ctrl: b});
    await settle(game); assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'battlefield'); assert.equal(source.ctrl, a);
    await game.move(source, 'graveyard'); assert.equal(first.zone, 'battlefield');
  });
}

test('v8 linked: a source blink cannot let its old until trigger exile a fresh victim', async () => {
  const ctx = context(), {game, a, b} = ctx, victim = put(game, b, 'Sol Ring');
  const source = await enterWithPendingTrigger(ctx, 'Artifacts');
  await game.move(source, 'exile'); await game.move(source, 'battlefield', {ctrl: a}); await game.flushTriggers();
  assert.equal(game.stack.length, 2); await game.counterStackObject(game.stack.at(-1)); await settle(game);
  assert.equal(victim.zone, 'battlefield'); assert.equal(victim.zoneVersion, 0);
});

test('v8 linked: the same source object can hold independent old and new printed-pair incarnations', async () => {
  const ctx = context(), {game, a, b, c, state} = ctx;
  const first = put(game, b, creature('Linked Old')), second = put(game, c, creature('Linked New'));
  state.targets = q => q.candidates.includes(first) ? [first] : q.candidates.slice(0, 1);
  const source = await enterWithPendingTrigger(ctx, 'Butcher');
  await game.move(source, 'exile'); await game.flushTriggers(); await game.resolveTop();
  state.targets = q => q.candidates.includes(second) ? [second] : q.candidates.slice(0, 1);
  await game.move(source, 'battlefield', {ctrl: a}); await settle(game);
  assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'exile');
  await game.move(source, 'graveyard'); await settle(game);
  assert.equal(second.zone, 'battlefield'); assert.equal(first.zone, 'exile', 'new LTB cannot return old-incarnation acquisition');
});

test('v8 linked: copies of one acquisition return every linked card in a single ETB batch', async () => {
  const ctx = context(), {game, b, c, state} = ctx;
  const first = put(game, b, creature('Linked Copy One')), second = put(game, c, creature('Linked Copy Two'));
  state.targets = () => [first]; const source = await enterWithPendingTrigger(ctx, 'Butcher');
  state.targets = () => [second]; assert.ok(await game.copyStackAbility(game.stack.at(-1), ctx.a, {mayNewTargets: true}));
  await settle(game); assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'exile');
  const events = observeReturns(game, [first, second]); await game.move(source, 'graveyard'); await settle(game);
  assert.equal(events.length, 2); assert.ok(events.every(row => row.together));
});

test('v8 linked: partial target legality exiles and returns only the still legal land', async () => {
  const ctx = context(), {game, b, c} = ctx, first = put(game, b, 'Forest'), second = put(game, c, 'Island');
  const source = await enterWithPendingTrigger(ctx, 'Lands');
  await game.move(second, 'hand'); await settle(game);
  assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'hand');
  await game.move(source, 'graveyard'); await settle(game);
  assert.equal(first.zone, 'battlefield'); assert.equal(first.ctrl, b); assert.equal(second.zone, 'hand');
});

test('v8 linked: optional acquisition locks targets before the resolution-time refusal', async () => {
  const ctx = context(), {game, b, state, trace} = ctx, victim = put(game, b, creature('Linked Declined'));
  const source = await enterWithPendingTrigger(ctx, 'Hunter');
  assert.ok(trace.some(row => row.query.type === 'chooseTargets')); state.decline = true;
  await settle(game); assert.equal(victim.zone, 'battlefield'); assert.equal((game.oracleLinkedExiles || []).length, 0);
  await game.move(source, 'graveyard'); await settle(game); assert.equal(victim.zone, 'battlefield');
});

test('v8 linked: any-number exile is a non-target choice and can take a proper subset', async () => {
  const ctx = context(), {game, a, b, state, trace} = ctx;
  const first = put(game, a, 'Grizzly Bears'), second = put(game, a, 'Grizzly Bears'), enemy = put(game, b, 'Grizzly Bears');
  state.cards = q => q.from.includes(first) ? [first] : [];
  const source = await cast(ctx, 'Any');
  assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'battlefield'); assert.equal(enemy.zone, 'battlefield');
  assert.equal(trace.some(row => row.query.type === 'chooseTargets'), false);
  await game.move(source, 'graveyard'); assert.equal(first.zone, 'battlefield');
});

test('v8 linked: a real hard AI selects, pays and resolves its printed linked removal through normal priority', async () => {
  const ctx = context('ai', true), {game, b, trace} = ctx;
  const victim = put(game, b, creature('Linked AI Threat', {power: '9', toughness: '9'}));
  await cast(ctx, 'Ring', {pilot: true});
  assert.equal(victim.zone, 'exile'); assert.ok(trace.some(row => row.query.type === 'main'));
  assert.ok(trace.some(row => row.query.type === 'chooseTargets'));
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
});

for (const role of ['human', 'ai']) {
  test(`v8 linked ${role}: a non-target group pair returns lands and other permanents together`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    const land = put(game, a, 'Forest'), creature = put(game, a, 'Grizzly Bears'), enemy = put(game, b, 'Sol Ring');
    const source = await cast(ctx, 'Group Pair');
    assert.equal(land.zone, 'exile'); assert.equal(creature.zone, 'exile'); assert.equal(enemy.zone, 'battlefield');
    const events = observeReturns(game, [land, creature]); await game.move(source, 'hand');
    assert.equal(land.zone, 'exile'); await settle(game);
    assert.equal(events.length, 2); assert.ok(events.every(row => row.together));
  });
  test(`v8 linked ${role}: an exact non-target land choice never becomes a targeting query`, async () => {
    const ctx = context(role), {game, a, b, trace} = ctx;
    const land = put(game, a, 'Forest'), other = put(game, a, 'Forest'), enemy = put(game, b, 'Forest');
    const source = await cast(ctx, 'Chosen Land');
    assert.equal([land, other].filter(card => card.zone === 'exile').length, 1); assert.equal(enemy.zone, 'battlefield');
    assert.equal(trace.some(row => row.query.type === 'chooseTargets'), false);
    const query = trace.find(row => row.query.type === 'chooseCards'); assert.equal(query.query.min, 1); assert.equal(query.query.max, 1);
    await game.move(source, 'graveyard'); await settle(game); assert.ok([land, other].every(card => card.zone === 'battlefield'));
  });
  test(`v8 linked ${role}: a paid sacrificial return uses the captured old source and current ability controller`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx;
    const victim = put(game, b, creature('Linked Stored')); victim.ctrl = a; game.recalc();
    const source = await cast(ctx, 'Storage'); await activate(ctx, source);
    assert.equal(victim.zone, 'exile'); source.ctrl = c; game.recalc();
    await activate(ctx, source, 1, {player: c, mana: 0});
    assert.equal(source.zone, 'graveyard'); assert.equal(victim.zone, 'battlefield'); assert.equal(victim.ctrl, c); assert.equal(victim.owner, b);
  });
  test(`v8 linked ${role}: an explicit owner return differs from the ability controller and pays tap plus sacrifice`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    const victim = put(game, b, creature('Linked Owner Stored')); victim.ctrl = a; game.recalc();
    const source = await cast(ctx, 'Storage Owner'); await activate(ctx, source); assert.equal(source.tapped, true);
    game.untap(source); await activate(ctx, source, 1);
    assert.equal(source.zone, 'graveyard'); assert.equal(victim.ctrl, b); assert.equal(victim.zone, 'battlefield');
  });
  test(`v8 linked ${role}: two printed acquisitions share the exact same death return`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx;
    const own = put(game, a, creature('Linked Vault Own')), enemy = put(game, b, creature('Linked Vault Enemy'));
    const source = await cast(ctx, 'Vault'); await activate(ctx, source, 0); await activate(ctx, source, 1);
    assert.equal(own.zone, 'exile'); assert.equal(enemy.zone, 'exile'); source.ctrl = c; game.recalc();
    await game.move(source, 'graveyard'); assert.equal(own.zone, 'exile'); await settle(game);
    assert.equal(own.ctrl, a); assert.equal(enemy.ctrl, b); assert.equal(own.zone, 'battlefield'); assert.equal(enemy.zone, 'battlefield');
  });
  test(`v8 linked ${role}: a public graveyard acquisition returns under the resolving controller`, async () => {
    const ctx = context(role), {game, a, b} = ctx, victim = put(game, a, creature('Linked Grave Victim'), 'graveyard');
    const source = await cast(ctx, 'Grave Collector'); source.attacking = b;
    await game.emit('attacks', {card: source, player: a, defender: b}); await settle(game);
    assert.equal(victim.zone, 'exile'); source.ctrl = b; game.recalc(); await game.move(source, 'graveyard'); await settle(game);
    assert.equal(victim.zone, 'battlefield'); assert.equal(victim.ctrl, b); assert.equal(victim.owner, a);
  });
  test(`v8 linked ${role}: a fade counter is actually paid and fading eventually triggers the linked return`, async () => {
    const ctx = context(role), {game, a, b} = ctx, land = put(game, b, 'Forest');
    const source = await cast(ctx, 'Fade Pair'); assert.equal(source.counters.fade, 2);
    await activate(ctx, source, 0, {mana: 0}); assert.equal(source.counters.fade, 1); assert.equal(land.zone, 'exile');
    await game.emit('upkeep', {player: a}); await settle(game);
    assert.equal(source.counters.fade, 0); assert.equal(source.zone, 'battlefield');
    assert.equal(game.activatableList(a).some(row => row.card === source), false, 'no further counter can be paid');
    await game.emit('upkeep', {player: a}); await settle(game);
    assert.equal(source.zone, 'graveyard'); assert.equal(land.zone, 'battlefield'); assert.equal(land.ctrl, b);
  });
}

test('v8 linked: the printed tapped return is visible to every co-entrant ETB event', async () => {
  const ctx = context(), {game, a, b} = ctx, first = put(game, a, 'Forest'), second = put(game, b, 'Island');
  const source = await cast(ctx, 'Tapped Pair');
  const events = observeReturns(game, [first, second]); await game.move(source, 'graveyard'); await settle(game);
  assert.equal(first.tapped, true); assert.equal(second.tapped, true); assert.ok(events.every(row => row.together));
});

test('v8 linked: an activated acquisition can resolve after a sacrificial return without borrowing another incarnation', async () => {
  const ctx = context(), {game, a} = ctx, victim = put(game, a, creature('Linked Sacrifice Ordering'));
  const source = await cast(ctx, 'Storage');
  await activate(ctx, source, 0, {resolve: false}); await activate(ctx, source, 1, {resolve: false, mana: 0});
  assert.equal(source.zone, 'graveyard'); await game.resolveTop(); assert.equal(victim.zone, 'battlefield'); await settle(game);
  assert.equal(victim.zone, 'exile');
});

test('v8 linked: two identically named sources never return each other\'s linked cards', async () => {
  const ctx = context(), {game, b, c} = ctx;
  const first = put(game, b, creature('Linked Instance One')), one = await cast(ctx, 'Butcher');
  const second = put(game, c, creature('Linked Instance Two')), two = await cast(ctx, 'Butcher');
  await game.move(one, 'graveyard'); await settle(game);
  assert.equal(first.zone, 'battlefield'); assert.equal(second.zone, 'exile');
  await game.move(two, 'graveyard'); await settle(game); assert.equal(second.zone, 'battlefield');
});

test('v8 linked: a death-only return does not trigger when the source goes to hand', async () => {
  const ctx = context(), {game, a} = ctx, victim = put(game, a, creature('Linked Nondeath'));
  const source = await cast(ctx, 'Vault'); await activate(ctx, source); await game.move(source, 'hand'); await settle(game);
  assert.equal(victim.zone, 'exile'); assert.equal(game.stack.length, 0);
});

test('v8 linked: hand and graveyard return destinations preserve owner and exact object identity', async () => {
  for (const [name, from, to] of [['Hand Return', 'battlefield', 'hand'], ['Grave Return', 'graveyard', 'graveyard']]) {
    const ctx = context(), {game, b} = ctx, victim = put(game, b, creature('Linked Destination'), from);
    const source = await cast(ctx, name); assert.equal(victim.zone, 'exile');
    await game.move(source, 'graveyard'); await settle(game); assert.equal(victim.zone, to); assert.ok(b[to].includes(victim));
  }
});

test('v8 linked: tokens cease and a commander choosing the command zone cannot return from another zone', async () => {
  const ctx = context(), {game, b, state} = ctx;
  const token = put(game, b, creature('Linked Token', {types: ['Artifact', 'Creature']})); token.isToken = true;
  const commander = put(game, b, creature('Linked Commander', {types: ['Artifact', 'Creature']})); commander.commander = true;
  state.option = query => query.options.some(option => option.key === 'cz') ? 'cz' : undefined;
  const source = await cast(ctx, 'Artifacts');
  assert.equal(token.zone, 'ceased'); assert.equal(commander.zone, 'command');
  await game.move(source, 'graveyard'); assert.equal(token.zone, 'ceased'); assert.equal(commander.zone, 'command');
});

// CR 303.4f-g and Eerie Ultimatum's official release ruling: a noncast Aura
// cannot choose something that is entering in the same simultaneous batch.
test('v8 linked: an Aura without a pre-existing legal host stays in exile during a simultaneous return', async () => {
  const ctx = context(), {game, a} = ctx;
  const host = put(game, a, 'Grizzly Bears'), aura = put(game, a, 'Rancor'); await game.attach(aura, host);
  const source = await cast(ctx, 'Lockdown'); assert.equal(host.zone, 'exile'); assert.equal(aura.zone, 'exile');
  await game.move(source, 'graveyard'); await settle(game);
  assert.equal(host.zone, 'battlefield'); assert.equal(aura.zone, 'exile'); assert.equal(host.attachments.length, 0);
});

test('v8 linked: an Aura can instead choose a pre-existing hexproof host without targeting', async () => {
  const ctx = context(), {game, a, b, state, trace} = ctx;
  const host = put(game, a, 'Grizzly Bears'), aura = put(game, a, 'Rancor'); await game.attach(aura, host);
  const source = await cast(ctx, 'Lockdown');
  const other = put(game, b, creature('Linked Pre-existing Host', {cost: '{5}', kws: ['hexproof']}));
  state.cards = query => query.from.includes(other) ? [other] : [];
  await game.move(source, 'graveyard'); await settle(game);
  assert.equal(host.zone, 'battlefield'); assert.equal(aura.zone, 'battlefield'); assert.equal(aura.attachedTo, other.iid);
  const choice = trace.find(row => row.query.aiHint?.kind === 'auraHost');
  assert.ok(choice); assert.equal(choice.query.from.includes(host), false, 'the returning creature cannot be offered');
  assert.equal(choice.query.from.includes(other), true, 'hexproof does not prohibit a nontargeted attachment choice');
});

test('v8 linked: a paid Mirage Mirror copy cannot regain an expired copied pair link', async () => {
  const ctx = context(), {game, a, b, c, state} = ctx;
  for (const player of [a, b, c]) for (let i = 0; i < 6; i++) put(game, player, 'Forest', 'library');
  const storage = await cast(ctx, 'Storage'), mirror = put(game, a, 'Mirage Mirror');
  const victim = put(game, a, creature('Linked Copied Acquisition'));
  let acted = false;
  game.mainPhase = async () => {
    if (acted) return; acted = true;
    state.targets = () => [storage]; await activate(ctx, mirror, 0, {mana: 2});
    assert.equal(mirror.name, storage.name);
    state.targets = () => [victim]; await activate(ctx, mirror);
    assert.equal(victim.zone, 'exile');
  };
  game.combatPhase = async () => {};
  await game.runTurn(); assert.equal(mirror.name, 'Mirage Mirror', 'ordinary cleanup ends the first copy effect');
  state.targets = () => [storage]; await activate(ctx, mirror, 0, {mana: 2});
  await activate(ctx, mirror, 1, {mana: 0});
  assert.equal(mirror.zone, 'graveyard'); assert.equal(victim.zone, 'exile', 'a newly acquired copy of the pair has a fresh link');
});

test('v8 linked: a queued copied acquisition retains its original copy lifetime after another copy assignment', async () => {
  const ctx = context(), {game, a, state} = ctx;
  const storage = await cast(ctx, 'Storage'), mirror = put(game, a, 'Mirage Mirror');
  const first = put(game, a, creature('Linked Copy Lifetime First')), second = put(game, a, creature('Linked Copy Lifetime Second'));
  state.targets = () => [storage]; await activate(ctx, mirror, 0, {mana: 2, resolve: false});
  await activate(ctx, mirror, 0, {mana: 2, resolve: false});
  await game.resolveTop();
  state.targets = () => [first]; await activate(ctx, mirror, 0, {resolve: false});
  await game.resolveTop(); assert.equal(first.zone, 'exile');
  await settle(game); // The older queued Mirror ability installs a new copy of the same definition.
  state.targets = () => [second]; await activate(ctx, mirror);
  await activate(ctx, mirror, 1, {mana: 0});
  assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'battlefield');
});

test('v8 linked: a still-active copied pair survives paying its own sacrifice cost', async () => {
  const ctx = context(), {game, a, state} = ctx;
  const storage = await cast(ctx, 'Storage'), mirror = put(game, a, 'Mirage Mirror'), victim = put(game, a, creature('Linked Active Copy'));
  state.targets = () => [storage]; await activate(ctx, mirror, 0, {mana: 2});
  state.targets = () => [victim]; await activate(ctx, mirror);
  await activate(ctx, mirror, 1, {mana: 0});
  assert.equal(victim.zone, 'battlefield'); assert.equal(mirror.zone, 'graveyard');
});

test('v8 linked: a native printed pair keeps its separate link after temporary copied characteristics end', async () => {
  const ctx = context(), {game, a} = ctx, victim = put(game, a, creature('Linked Native Pair'));
  const source = await cast(ctx, 'Storage'); await activate(ctx, source);
  const printed = source.def, copied = M.DEFS['Sol Ring'];
  source.isCopyOf = copied; source.def = {...copied}; game.recalc();
  source.isCopyOf = null; source.def = printed; game.recalc();
  await activate(ctx, source, 1, {mana: 0}); assert.equal(victim.zone, 'battlefield');
});

test('v8 linked: a copied token source uses its leaving snapshot after the token ceases', async () => {
  const ctx = context(), {game, a, b, c} = ctx;
  const first = put(game, b, creature('Linked Original Target')), source = await cast(ctx, 'Butcher');
  const second = put(game, c, creature('Linked Token Target'));
  const [copy] = await game.copyPermanentToken(source, a); await settle(game);
  assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'exile');
  await game.move(copy, 'graveyard'); await settle(game);
  assert.equal(copy.zone, 'ceased'); assert.equal(first.zone, 'exile'); assert.equal(second.zone, 'battlefield');
});
