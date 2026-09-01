import test from 'node:test';
import assert from 'node:assert/strict';
import {createImportPlan, semanticClass} from '../scripts/import-oracle-batch.mjs';
import {extensionLine} from '../scripts/oracle-v8-mayhem.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const source = (name, oracle_text, type_line, mana_cost, color) => ({
  name, oracle_text, type_line, mana_cost, layout: 'normal',
  oracle_id: 'v8-mayhem-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  id: 'v8-mayhem-print-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  games: ['paper'], legalities: {commander: 'legal'}, color_identity: [color],
});
const sources = [
  source('V8 Mayhem Slash', 'Target creature gets -5/-5 until end of turn.\nMayhem {1}{B}', 'Instant', '{3}{B}', 'B'),
  source('V8 Mayhem Bolt', 'V8 Mayhem Bolt deals 4 damage to target creature.\nMayhem {1}{R}', 'Sorcery', '{2}{R}', 'R'),
];
const plan = createImportPlan({cards: sources, bulk: {updated_at: '2026-09-01T00:00:00Z'}, sequence: 9964,
  limit: sources.length, compilerVersion: 8});
assert.equal(plan.report.cards.length, sources.length);
const M = loadEngine();
M.registerOracleBatch(plan.report); M.initData(M.RAW_DATA);

function definition(name, extra = {}) {
  return {name, cost: '{1}{G}', types: ['Creature'], subtypes: [], super: [], oracle: '', kws: [],
    power: '4', toughness: '4', ...extra};
}
function put(game, player, value, zone = 'battlefield') {
  const card = new M.CardInst(typeof value === 'string' ? M.DEFS[value] : value, player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  game.recalc(); return card;
}
function context(role = 'human') {
  const trace = [], state = {};
  const human = {decide: async (game, query) => {
    if (query.type === 'priority' || query.type === 'main') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return state.targets?.(query) ?? query.candidates.slice(0, query.min ?? 1);
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.min ?? 1);
    if (query.type === 'chooseOption') return state.option?.(query) ?? query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'chooseX') return query.min || 0;
    if (query.type === 'orderTriggers') return query.triggers;
    return [];
  }};
  const game = new M.Game({seed: 127818, paced: false});
  const a = game.addPlayer('Mayhem A', {name: 'Mayhem A'}, human, role === 'ai');
  const b = game.addPlayer('Mayhem B', {name: 'Mayhem B'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (current, query) => {const answer = await decide(current, query); trace.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  for (const player of [a, b]) for (let index = 0; index < 20; index++) put(game, player, 'Forest', 'library');
  return {game, a, b, state, trace, role};
}
function mana(player, amounts = {}) {
  for (const color of Object.keys(player.pool)) player.pool[color] = 0;
  Object.assign(player.pool, amounts);
}
const pool = player => Object.values(player.pool).reduce((sum, amount) => sum + amount, 0);
async function settle(game) {
  for (let guard = 0; guard < 80 && (game.stack.length || game.pendingTriggers.length); guard++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function discardForMayhem(ctx, name) {
  const card = put(ctx.game, ctx.a, name, 'hand'), before = card.zoneVersion;
  await ctx.game.discard(ctx.a, [card]);
  assert.equal(card.zone, 'graveyard'); assert.equal(card.zoneVersion, before + 1);
  assert.equal(card.meta._discardedTurn, ctx.game.turnNo); assert.equal(card.meta._discardedBy, ctx.a);
  assert.equal(card.meta._discardedZoneVersion, card.zoneVersion);
  return card;
}
function mayhemOffer(ctx, card) {
  const offers = ctx.game.castableList(ctx.a).filter(row => row.card === card);
  assert.equal(offers.length, 1); const offer = offers[0];
  assert.equal(offer.from, 'graveyard'); assert.equal(offer.alt.mayhem, true);
  assert.equal(offer.alt.altCostStr, card.def.mayhem.cost); assert.equal(offer.alt.speed, card.def.mayhem.speed);
  return offer;
}
async function paidCast(ctx, name, amounts, {ai = false} = {}) {
  const card = await discardForMayhem(ctx, name), target = put(ctx.game, ctx.b, definition(name + ' target'));
  if (ai && name === 'V8 Mayhem Slash') {
    ctx.game.turnPlayer = ctx.b; ctx.game.phase = 'combat'; ctx.game.step = 'declareAttackers';
    target.attacking = ctx.a;
  }
  mana(ctx.a, amounts); const offer = mayhemOffer(ctx, card), before = pool(ctx.a);
  if (ai) {
    const priority = name === 'V8 Mayhem Slash';
    const action = await ctx.a.controller.decide(ctx.game, {type: priority ? 'priority' : 'main', player: ctx.a, phase: ctx.game.phase,
      casts: ctx.game.castableList(ctx.a), acts: ctx.game.activatableList(ctx.a), lands: [], stack: ctx.game.stack});
    assert.equal(action.kind, 'cast', JSON.stringify(ctx.game.aiDecisionLog?.at(-1)));
    assert.equal(action.card, card); assert.equal(action.alt.mayhem, true);
    assert.equal(await ctx.game.performAction(ctx.a, action), true);
  } else assert.equal(await ctx.game.castSpell(ctx.a, card, {from: offer.from, alt: offer.alt}), true);
  assert.equal(pool(ctx.a), 0); assert.equal(before, 2, 'only the two-mana Mayhem cost was available');
  const spell = ctx.game.stack.find(row => row.card === card);
  assert.ok(spell); assert.equal(spell.from, 'graveyard'); assert.equal(spell.castOpts.mayhem, true);
  assert.equal(spell.castOpts.altCostStr, card.def.mayhem.cost); assert.equal(card.zone, 'stack');
  await settle(ctx.game);
  assert.equal(card.zone, 'graveyard', 'Mayhem resolves to the graveyard rather than exile');
  assert.equal(ctx.game.castableList(ctx.a).some(row => row.card === card), false, 'the post-resolution object was not discarded');
  assert.notEqual(target.zone, 'battlefield', 'the selected opposing creature received the real spell effect');
  return {card, target};
}

test('v8 Mayhem grammar is exact, typed, costed, and fail-closed', () => {
  assert.deepEqual(extensionLine({type_line: 'Instant'}, 'Mayhem {1}{B}'), {
    kind: 'mechanic-mayhem-v8', cost: '{1}{B}', speed: 'instant', contract: 'mechanic-mayhem-v8',
  });
  assert.deepEqual(extensionLine({type_line: 'Kindred Sorcery — Goblin'}, 'Mayhem {2}{B/R}'), {
    kind: 'mechanic-mayhem-v8', cost: '{2}{B/R}', speed: 'sorcery', contract: 'mechanic-mayhem-v8',
  });
  for (const [type_line, line] of [
    ['Creature — Goblin', 'Mayhem {R}'], ['Artifact', 'Mayhem {2}'], ['Land', 'Mayhem'],
    ['Instant', 'Mayhem'], ['Instant', 'Mayhem {S}'], ['Instant', 'Mayhem {1}{B}.'],
    ['Instant', 'Mayhem {1}{B} and draw a card'], ['Instant Sorcery', 'Mayhem {1}'],
  ]) assert.equal(extensionLine({type_line}, line), null, `${type_line}: ${line}`);
  const unsupported = {...sources[0], oracle_text: sources[0].oracle_text.replace('Mayhem {1}{B}', 'Mayhem {S}')};
  assert.equal(semanticClass(unsupported, {compilerVersion: 8}).semanticClass, undefined);
  const slashEntry = plan.report.cards.find(entry => entry.raw.name === 'V8 Mayhem Slash');
  const descriptor = slashEntry.implementation.find(operation => operation.kind === 'mechanic-mayhem-v8');
  assert.ok(descriptor); assert.equal(M.DEFS['V8 Mayhem Slash'].mayhem.cost, '{1}{B}');
  assert.equal(M.DEFS['V8 Mayhem Slash'].oracleMayhemV8, true);
  assert.throws(() => M.OracleV8Mayhem.compile({}, {...descriptor, prose: 'trust me'}, slashEntry), /invalid closed descriptor/);
  assert.throws(() => M.OracleV8Mayhem.compile({}, {...descriptor, speed: 'sorcery'}, slashEntry), /type\/speed mismatch/);
  assert.throws(() => M.OracleV8Mayhem.compile({mayhem: {}}, descriptor, slashEntry), /duplicate Mayhem/);
});

for (const role of ['human', 'ai']) for (const fixture of [
  {name: 'V8 Mayhem Slash', mana: {B: 1, C: 1}},
  {name: 'V8 Mayhem Bolt', mana: {R: 1, C: 1}},
]) test(`v8 Mayhem ${role}: ${fixture.name} is discarded, offered, paid, cast, and resolved normally`, async () => {
  const ctx = context(role); await paidCast(ctx, fixture.name, fixture.mana, {ai: role === 'ai'});
  if (role === 'ai') {
    assert.ok(ctx.trace.some(row => ['main', 'chooseTargets'].includes(row.query.type)));
    assert.equal(ctx.game.aiDecisionLog.some(row => row.fallback), false);
  }
});

test('v8 Mayhem enforces Instant and Sorcery timing in offers and direct casts', async () => {
  const instant = context(), instantCard = await discardForMayhem(instant, 'V8 Mayhem Slash');
  put(instant.game, instant.b, definition('Mayhem instant timing target'));
  instant.game.turnPlayer = instant.b; instant.game.phase = 'combat'; instant.game.step = 'declareAttackers';
  mana(instant.a, {B: 1, C: 1}); const instantOffer = mayhemOffer(instant, instantCard);
  assert.equal(await instant.game.castSpell(instant.a, instantCard, {from: instantOffer.from, alt: instantOffer.alt}), true);
  await instant.game.counterStackObject(instant.game.stack.at(-1));
  assert.equal(instantCard.zone, 'graveyard', 'a countered Mayhem spell is not exiled');

  for (const setup of ['opponent-turn', 'combat', 'occupied-stack']) {
    const ctx = context(), card = await discardForMayhem(ctx, 'V8 Mayhem Bolt'); mana(ctx.a, {R: 1, C: 1});
    if (setup === 'opponent-turn') ctx.game.turnPlayer = ctx.b;
    if (setup === 'combat') {ctx.game.phase = 'combat'; ctx.game.step = 'declareAttackers';}
    if (setup === 'occupied-stack') ctx.game.stack.push({kind: 'ability', name: 'Timing fixture', ctrl: ctx.b, ctx: {}, run: async () => {}});
    assert.equal(ctx.game.castableList(ctx.a).some(row => row.card === card), false, setup);
    assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'graveyard', alt: M.OracleV8Mayhem.alternative(card.def)}), false, setup);
    assert.equal(card.zone, 'graveyard'); assert.equal(pool(ctx.a), 2);
  }
});

test('v8 Mayhem rejects forged permissions, stale turns, wrong players, and changed zone objects', async () => {
  const forged = async (mutate, alt = null) => {
    const ctx = context(), card = await discardForMayhem(ctx, 'V8 Mayhem Bolt'); mana(ctx.a, {R: 1, C: 1});
    await mutate(ctx, card); const before = pool(ctx.a);
    const option = alt?.(card) || M.OracleV8Mayhem.alternative(card.def);
    assert.equal(await ctx.game.castSpell(ctx.a, card, {from: option.from || 'graveyard', alt: option}), false);
    assert.equal(pool(ctx.a), before); assert.notEqual(card.zone, 'stack'); return {ctx, card};
  };
  {
    const ctx = context(), card = put(ctx.game, ctx.a, 'V8 Mayhem Bolt', 'graveyard'); mana(ctx.a, {R: 1, C: 1});
    assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'graveyard', alt: {mayhem: true, altCostStr: '{1}{R}', speed: 'sorcery'}}), false);
    assert.equal(card.zone, 'graveyard'); assert.equal(pool(ctx.a), 2);
  }
  await forged(async ctx => {ctx.game.turnNo++;});
  await forged(async (ctx, card) => {await ctx.game.move(card, 'hand'); await ctx.game.move(card, 'graveyard');});
  await forged(async () => {}, card => ({...M.OracleV8Mayhem.alternative(card.def), altCostStr: '{R}'}));
  await forged(async () => {}, card => ({...M.OracleV8Mayhem.alternative(card.def), speed: 'instant'}));
  await forged(async () => {}, card => ({...M.OracleV8Mayhem.alternative(card.def), free: true}));
  const ctx = context(), card = await discardForMayhem(ctx, 'V8 Mayhem Bolt'); mana(ctx.b, {R: 1, C: 1});
  assert.equal(await ctx.game.castSpell(ctx.b, card, {from: 'graveyard', alt: M.OracleV8Mayhem.alternative(card.def)}), false);
  assert.equal(card.zone, 'graveyard'); assert.equal(pool(ctx.b), 2);
});

test('v8 Mayhem keeps both countered and fully fizzled spells in the graveyard without renewing permission', async () => {
  for (const outcome of ['counter', 'fizzle']) {
    const ctx = context(), card = await discardForMayhem(ctx, 'V8 Mayhem Slash');
    const target = put(ctx.game, ctx.b, definition('Mayhem ' + outcome)); mana(ctx.a, {B: 1, C: 1});
    const offer = mayhemOffer(ctx, card); assert.equal(await ctx.game.castSpell(ctx.a, card, {from: offer.from, alt: offer.alt}), true);
    const spell = ctx.game.stack.find(row => row.card === card); assert.ok(spell);
    if (outcome === 'counter') assert.equal(await ctx.game.counterStackObject(spell), true);
    else {await ctx.game.move(target, 'hand'); await ctx.game.resolveTop();}
    await settle(ctx.game); assert.equal(card.zone, 'graveyard'); assert.equal(ctx.a.exile.includes(card), false);
    assert.equal(ctx.game.castableList(ctx.a).some(row => row.card === card), false);
  }
});
