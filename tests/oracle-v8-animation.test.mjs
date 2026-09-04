import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionEffect} from '../scripts/oracle-v8-permanents.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const MTG = loadEngine();
const sources = [
  ['Land', "{1}: Until end of turn, this land becomes a 3/4 blue and green Elemental creature with vigilance. It's still a land.", 'Land — Forest'],
  ['Artifact', '{1}: This artifact becomes a 4/5 Bird artifact creature with flying until end of turn.', 'Artifact — Equipment'],
  ['Replace', '{1}: This enchantment becomes a 3/4 Beast creature until end of turn.', 'Enchantment'],
  ['Keep', '{1}: This enchantment becomes a 4/5 Beast creature with trample in addition to its other types until end of turn.', 'Enchantment'],
  ['All', "{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land.", 'Land'],
  ['Vehicle', '{1}: This Vehicle becomes an artifact creature until end of turn.', 'Artifact — Vehicle'],
  ['Count', "{1}: Until end of turn, target Forest becomes an X/X Treefolk creature in addition to its other types, where X is the number of Elves you control.", 'Creature — Elf'],
  ['Target', "{1}: Until end of turn, target land becomes a 1/1 Elemental creature with haste. It's still a land.", 'Creature — Elf'],
  ['X', '{X}: This artifact becomes an X/X Construct artifact creature until end of turn.', 'Artifact'],
  ['Persistent', "{1}: This land becomes a 3/3 creature with vigilance and all creature types. It's still a land.", 'Land'],
  ['Loss', '{1}: Until end of turn, this artifact becomes a 2/1 Construct artifact creature with flying.\n{1}: Until end of turn, this artifact becomes a 3/2 Construct artifact creature and loses flying.', 'Artifact'],
  ['Infect', "{1}: Until end of turn, this land becomes a 1/1 Phyrexian creature with flying and infect. It's still a land.", 'Land'],
  ['God', "Indestructible\nAs long as your devotion to blue is less than five, this creature isn't a creature.", 'Enchantment Creature — God', '{1}{U}'],
  ['Hybrid God', "Indestructible\nAs long as your devotion to blue and black is less than seven, this creature isn't a creature.", 'Enchantment Creature — God', '{U}{B}'],
  ['Conditional Vehicle', "Flying\n{1}: Put a fire counter on this Vehicle.\nAs long as this Vehicle has three or more fire counters on it, it's an artifact creature.", 'Artifact — Vehicle'],
];
const input = ([name, oracle_text, type_line = 'Artifact', mana_cost]) => ({name: 'Animation ' + name, oracle_text, type_line,
  layout: 'normal', mana_cost: mana_cost ?? (type_line.startsWith('Land') ? '' : '{2}'), power: '6', toughness: '7'});
const entries = sources.map((args, index) => {
  const card = input(args), semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return {position: index + 1, oracleId: 'animation-' + index, scryfallId: 'animation-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: card.type_line.split(' — ')[0].split(' '),
      subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], super: [], power: card.power, toughness: card.toughness, _ci: []},
    catalog: {typeLine: card.type_line, commanderLegality: 'legal'}};
});
MTG.registerOracleBatch({id: 'oracle-animation-fixtures', sequence: 9987, cards: entries}); MTG.initData(MTG.RAW_DATA);

function put(ctx, name, owner = ctx.a, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, owner);
  card.zone = zone; card.ctrl = owner; card.sick = false;
  if (zone === 'battlefield') { ctx.game.battlefield.push(card); ctx.game.recalc(); } else owner[zone].push(card);
  return card;
}
function setup(role) {
  const state = {}, trace = [], human = {decide: async (game, query) => {
    if (query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return query.candidates.includes(state.target) ? [state.target] : query.candidates.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.options.find(x => x.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'chooseX') return 4;
    if (['attackers', 'blockers'].includes(query.type)) return [];
    return null;
  }};
  const game = new MTG.Game({seed: 149, paced: false}), a = game.addPlayer('A', {name: 'A'}, human, role === 'ai'), b = game.addPlayer('B', {name: 'B'}, human, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, q) => {const result = await decide(g, q); trace.push({query: q, result}); return result;};
  game.turnNo = 5; game.turnPlayer = a; game.phase = 'main1'; game.step = 'main';
  return {game, a, b, state, trace};
}
async function settle(ctx) {
  for (let i = 0; i < 40 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); i++) {await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop();}
  assert.equal(ctx.game.stack.length + ctx.game.pendingTriggers.length, 0);
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function activate(ctx, card, index = 0) {
  ctx.a.pool.C = 10;
  const actions = ctx.game.activatableList(ctx.a).filter(action => action.card === card);
  assert.ok(actions[index], card.name + ': legal activation');
  assert.equal(await ctx.game.activateAbility(ctx.a, actions[index]), true); await settle(ctx);
}
async function cleanup(ctx) {
  for (const player of [ctx.a, ctx.b]) for (let i = 0; i < 3; i++) put(ctx, 'Forest', player, 'library');
  ctx.game.mainPhase = async () => {}; ctx.game.combatPhase = async () => {}; await ctx.game.runTurn();
}
const same = (values, expected) => assert.deepEqual([...values].sort(), expected.slice().sort());

for (const role of ['human', 'ai']) {
  test(role + ': real activation preserves land types and mana, applies before counters, and ends at cleanup', async () => {
    const ctx = setup(role), land = put(ctx, 'Animation Land'); ctx.game.addCounters(land, '+1/+1', 2);
    await activate(ctx, land);
    same(land.cur.types, ['Land', 'Creature']); same(land.cur.subtypes, ['Forest', 'Elemental']); same(land.colors, ['U', 'G']);
    assert.equal(land.power, 5); assert.equal(land.toughness, 6); assert.equal(land.kw('vigilance'), true);
    const mana = ctx.game.manaSources(ctx.a, null); assert.ok(mana.some(ability => ability.card === land));
    await cleanup(ctx); assert.equal(land.is('Creature'), false); same(land.cur.subtypes, ['Forest']); same(land.colors, []);
    assert.equal(land.kw('vigilance'), false); assert.equal(land.counters['+1/+1'], 2);
  });
  test(role + ': timestamped animation base stats respect earlier and later Lignify without regranting removed keywords', async () => {
    const ctx = setup(role), artifact = put(ctx, 'Animation Artifact');
    await activate(ctx, artifact); const aura = put(ctx, 'Lignify'); await ctx.game.attach(aura, artifact);
    assert.equal(artifact.power, 0); assert.equal(artifact.toughness, 4); assert.equal(artifact.kw('flying'), false); assert.equal(artifact.hasSub('Bird'), false);
    const stamp = aura.timestamp; await ctx.game.attach(aura, artifact); assert.equal(aura.timestamp, stamp, 'remaining attached to the same object does not get a new timestamp');
    const second = put(ctx, 'Animation Target');
    // Use a land already made into a creature for an actual later targeting effect.
    const land = put(ctx, 'Animation Land'); await activate(ctx, land); await ctx.game.attach(aura, land);
    ctx.state.target = land;
    await activate(ctx, second);
    assert.equal(land.power, 1); assert.equal(land.toughness, 1); assert.equal(land.kw('haste'), true); assert.equal(land.kw('vigilance'), false);
    assert.equal(land.hasSub('Treefolk'), true); assert.equal(land.hasSub('Elemental'), true);
  });
  test(role + ': type retention, replacement, and all-type animation preserve their distinct rules', async () => {
    const ctx = setup(role), keep = put(ctx, 'Animation Keep'), replace = put(ctx, 'Animation Replace'), all = put(ctx, 'Animation All');
    await activate(ctx, keep); await activate(ctx, replace); await activate(ctx, all);
    assert.equal(keep.is('Enchantment'), true); assert.equal(replace.is('Enchantment'), false); assert.equal(replace.is('Creature'), true);
    assert.equal(all.hasSub('Elf'), true); assert.equal(all.hasSub('Dragon'), true);
    const aura = put(ctx, 'Lignify'); await ctx.game.attach(aura, all); assert.equal(all.hasSub('Elf'), false);
    await ctx.game.move(aura, 'graveyard'); assert.equal(all.hasSub('Elf'), true);
    await cleanup(ctx); assert.equal(all.hasSub('Elf'), false); assert.equal(replace.is('Enchantment'), true);
  });
  test(role + ': artifact animation replaces creature subtypes while retaining Equipment and earlier card types', async () => {
    const ctx = setup(role), artifact = put(ctx, 'Animation Artifact');
    artifact.def = {...artifact.def, types: ['Artifact', 'Creature', 'Enchantment'], subtypes: ['Equipment', 'Elf'], changeling: true}; ctx.game.recalc();
    await activate(ctx, artifact);
    same(artifact.cur.types, ['Artifact', 'Creature', 'Enchantment']); same(artifact.cur.subtypes, ['Equipment', 'Bird']);
    assert.equal(artifact.hasSub('Elf'), false); assert.equal(artifact.hasSub('Dragon'), false);
  });
  test(role + ': Vehicle animation retains printed stats, and control changes preserve the same incarnation', async () => {
    const ctx = setup(role), vehicle = put(ctx, 'Animation Vehicle'); ctx.game.addCounters(vehicle, '+1/+1', 1);
    await activate(ctx, vehicle); assert.equal(vehicle.power, 7); assert.equal(vehicle.toughness, 8); assert.equal(vehicle.hasSub('Vehicle'), true);
    MTG.OracleV8Control.gain(ctx.game, vehicle, ctx.b); ctx.game.recalc(); assert.equal(vehicle.ctrl === ctx.b, true); assert.equal(vehicle.power, 7); assert.equal(vehicle.is('Creature'), true);
    await ctx.game.move(vehicle, 'hand'); await ctx.game.putPermanentOntoBattlefield(vehicle, ctx.b);
    assert.equal(vehicle.is('Creature'), false); assert.equal(vehicle.counters['+1/+1'] || 0, 0);
  });
  test(role + ': X values lock at resolution, animation overrides a CDA, and multiple base setters use timestamps', async () => {
    const ctx = setup(role), source = put(ctx, 'Animation Count'), forest = put(ctx, 'Forest'); ctx.state.target = forest;
    put(ctx, 'Llanowar Elves'); await activate(ctx, source); assert.equal(forest.power, 2);
    put(ctx, 'Llanowar Elves'); ctx.game.recalc(); assert.equal(forest.power, 2);
    ctx.game.addOracleBasePT(forest, {power: 8, toughness: 9, temporary: true}); assert.equal(forest.power, 8);
    await activate(ctx, source); assert.equal(forest.power, 3); assert.equal(forest.toughness, 3);
    const artifact = put(ctx, 'Animation Artifact'); artifact.def = {...artifact.def, cdaPower: () => 12, cdaToughness: () => 13}; ctx.game.recalc();
    await activate(ctx, artifact); assert.equal(artifact.power, 4); assert.equal(artifact.toughness, 5);
  });
  test(role + ': omitted duration persists through cleanup but never through a blink, and later flying removal wins', async () => {
    const ctx = setup(role), land = put(ctx, 'Animation Persistent'); await activate(ctx, land); await cleanup(ctx);
    assert.equal(land.is('Creature'), true); assert.equal(land.hasSub('Elf'), true);
    await ctx.game.move(land, 'hand'); await ctx.game.putPermanentOntoBattlefield(land, ctx.a); assert.equal(land.is('Creature'), false);
    const artifact = put(ctx, 'Animation Loss'); await activate(ctx, artifact); assert.equal(artifact.kw('flying'), true);
    await activate(ctx, artifact, 1); assert.equal(artifact.kw('flying'), false); assert.equal(artifact.power, 3); assert.equal(artifact.toughness, 2);
  });
  test(role + ': paid X and infect animation use actual payment and both damage destinations', async () => {
    const ctx = setup(role), variable = put(ctx, 'Animation X'); await activate(ctx, variable);
    const paid = 10 - ctx.a.pool.C; assert.ok(paid > 0); assert.equal(variable.power, paid); assert.equal(variable.toughness, paid);
    const infect = put(ctx, 'Animation Infect'); await activate(ctx, infect);
    await ctx.game.damagePlayer(infect, ctx.b, 1); assert.equal(ctx.b.poison, 1); assert.equal(ctx.b.life, 40);
    const bear = put(ctx, 'Grizzly Bears', ctx.b); await ctx.game.damageCreature(infect, bear, 1);
    assert.equal(bear.counters['-1/-1'], 1); assert.equal(bear.damage, 0);
    await cleanup(ctx); assert.equal(infect.kw('infect'), false);
  });
  test(role + ': a newly entered land obeys creature summoning sickness until a later haste animation', async () => {
    const ctx = setup(role), land = put(ctx, 'Animation Land', ctx.a, 'hand'); await ctx.game.putPermanentOntoBattlefield(land, ctx.a);
    assert.ok(ctx.game.manaSources(ctx.a, null).some(action => action.card === land)); await activate(ctx, land);
    assert.equal(ctx.game.manaSources(ctx.a, null).some(action => action.card === land), false);
    const source = put(ctx, 'Animation Target'); ctx.state.target = land; await activate(ctx, source);
    assert.equal(land.kw('haste'), true); assert.ok(ctx.game.manaSources(ctx.a, null).some(action => action.card === land));
  });
  test(role + ': conditional God type counts its own cost and hybrid symbols once, and follows controller changes', async () => {
    const ctx = setup(role), god = put(ctx, 'Animation Hybrid God'); assert.equal(god.is('Creature'), false); assert.equal(god.is('Enchantment'), true);
    assert.equal(god.hasSub('God'), false); assert.equal(god.kw('indestructible'), true);
    const support = put(ctx, {name: 'Hybrid devotion', types: ['Enchantment'], subtypes: [], cost: '{U/B}{U/B}{U/B}{U/B}'});
    assert.equal(ctx.game.devotion(ctx.a, ['U', 'B']), 6); assert.equal(god.is('Creature'), false);
    const extra = put(ctx, {name: 'Extra devotion', types: ['Enchantment'], subtypes: [], cost: '{U}'});
    assert.equal(god.is('Creature'), true); assert.equal(god.hasSub('God'), true);
    ctx.game.addCounters(god, '+1/+1', 1); assert.equal(god.power, 7);
    MTG.OracleV8Control.gain(ctx.game, god, ctx.b); ctx.game.recalc(); assert.equal(god.is('Creature'), false); assert.equal(god.counters['+1/+1'], 1);
    MTG.OracleV8Control.gain(ctx.game, support, ctx.b); MTG.OracleV8Control.gain(ctx.game, extra, ctx.b); ctx.game.recalc();
    assert.equal(god.is('Creature'), true); assert.equal(god.power, 7);
  });
  test(role + ': conditional type precedes ability removal and resolves paid Vehicle counter activations at the threshold', async () => {
    const ctx = setup(role), god = put(ctx, 'Animation God'), support = put(ctx, {name: 'Blue devotion', types: ['Enchantment'], subtypes: [], cost: '{U}{U}{U}{U}'});
    assert.equal(god.is('Creature'), true); const aura = put(ctx, 'Lignify'); await ctx.game.attach(aura, god);
    assert.equal(god.power, 0); assert.equal(god.toughness, 4); assert.equal(god.kw('indestructible'), false);
    await ctx.game.move(support, 'graveyard'); assert.equal(god.is('Creature'), false, 'layer4 type change still applies before layer6 ability loss');
    const vehicle = put(ctx, 'Animation Conditional Vehicle');
    for (let count = 1; count <= 3; count++) {await activate(ctx, vehicle); assert.equal(vehicle.counters.fire, count); assert.equal(vehicle.is('Creature'), count === 3);}
    assert.equal(vehicle.power, 6); assert.equal(vehicle.toughness, 7); assert.equal(vehicle.hasSub('Vehicle'), true);
    ctx.game.removeCounters(vehicle, 'fire', 1); assert.equal(vehicle.is('Creature'), false); assert.equal(vehicle.kw('flying'), true);
  });
}

test('animation parsing rejects unbound values, unknown duration, partial abilities and noncreature subtypes', () => {
  for (const oracle of [
    '{1}: Until your next turn, this artifact becomes a 2/2 Bird artifact creature.',
    '{1}: This artifact becomes an X/X Bird artifact creature until end of turn, where X is a secret value.',
    '{1}: Until end of turn, this artifact becomes a 2/2 Bird artifact creature with flying and an unknown ability.',
    '{1}: This artifact becomes an artifact creature until end of turn.',
    '{1}: This artifact becomes a 2/2 Bird artifact creature until end of turn except on Tuesdays.',
  ]) assert.equal(semanticClass(input(['Reject', oracle]), {compilerVersion: 8}).semanticClass, undefined, oracle);
  assert.equal(extensionEffect(input(['Reject', '']), 'Until end of turn, this artifact becomes a 2/2 Island artifact creature.', {}), null);
});
