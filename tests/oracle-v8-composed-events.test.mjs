import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const cards = [
  ['While', 'Whenever this creature attacks while you control a creature with power 4 or greater, this creature gets +2/+2 until end of turn.', 'Creature'],
  ['Cycle', 'Cycling {1}\nWhen you cycle this card and when this creature dies, you gain 1 life.', 'Creature'],
  ['Shrine', 'At the beginning of your upkeep and whenever you cast a green spell, put a charge counter on this artifact.', 'Artifact'],
  ['Pair', 'Whenever another creature you control enters or dies, you gain 1 life.', 'Creature'],
  ['First Attack', 'Whenever this creature attacks for the first time each turn, you gain 1 life.', 'Creature'],
  ['First Damage', 'Double strike\nWhenever this creature deals combat damage to a player for the first time each turn, you gain 1 life.', 'Creature'],
].map(([name, oracle_text, type_line], index) => {
  const card = {name: 'Composed Proof ' + name, oracle_text, type_line, power: '1', toughness: '20', mana_cost: '{1}', layout: 'normal'}, parsed = semanticClass(card, {compilerVersion: 8});
  assert.ok(parsed.semanticClass, name + ': ' + parsed.reason);
  return {position: index + 1, oracleId: 'composed-' + index, scryfallId: 'composed-print-' + index, ...parsed,
    raw: {name: card.name, cost: card.mana_cost, oracle: oracle_text, types: [type_line], subtypes: [], super: [], power: '1', toughness: '20', _ci: []}, catalog: {typeLine: type_line, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-composed-fixtures', sequence: 9985, cards}); M.initData(M.RAW_DATA);
const fixture = (name, extra = {}) => ({name, cost: '{1}', types: ['Creature'], subtypes: ['Bear'], super: [], power: '4', toughness: '20', kws: [], oracle: '', ...extra});
function put(ctx, name, player = ctx.a, zone = 'battlefield') {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[name] : name, player); card.ctrl = player; card.zone = zone; card.sick = false;
  if (zone === 'battlefield') {ctx.game.battlefield.push(card); ctx.game.recalc();} else player[zone].push(card); return card;
}
function setup(role) {
  const choice = {attackers: []}, human = {async decide(g, q) {if (q.type === 'attackers') return choice.attackers; if (q.type === 'blockers') return []; if (q.type === 'chooseOption') return q.options[0].key; if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? 1); return null;}};
  const game = new M.Game({seed: 159, paced: false}), a = game.addPlayer('A', {name: 'A'}, human, role === 'ai'), b = game.addPlayer('B', {name: 'B'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  game.turnNo = 5; game.turnPlayer = a; game.phase = 'main1'; game.step = 'main'; game.priorityRound = async () => {}; game.reviewCombatWithHuman = async () => {}; game.spotlight = async () => {}; game.pace = async () => {};
  return {game, a, b, choice};
}
async function settle(game) {for (let i = 0; i < 30 && (game.pendingTriggers.length || game.stack.length); i++) {await game.flushTriggers(); if (game.stack.length) await game.resolveTop();} assert.equal(game.pendingTriggers.length + game.stack.length, 0);}
for (const role of ['human', 'ai']) {
  test(role + ': first attack history includes the same object attacking while its ability was removed', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Composed Proof First Attack'), aura = put(ctx, 'Lignify', b);
    await game.attach(aura, source); assert.equal(source.cur.abilitiesDisabled, true);
    source.meta.mustAttackPlayer = b; ctx.choice.attackers = [{card: source, target: b}]; game.priorityRound = async () => settle(game);
    const before = a.life; await game.combatPhase(a); assert.equal(a.life, before);
    await game.move(aura, 'graveyard'); assert.equal(source.cur.abilitiesDisabled, false); source.tapped = false;
    await game.combatPhase(a); assert.equal(a.life, before, 'gaining the ability after the first attack does not reset history');
    game.turnNo++; source.tapped = false; await game.combatPhase(a); assert.equal(a.life, before + 1);
  });
  test(role + ': first attack history survives control changes and resets for a new turn or battlefield incarnation', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Composed Proof First Attack');
    game.priorityRound = async () => settle(game);
    async function attack(player, defender) {
      source.tapped = false; source.sick = false; source.meta.mustAttackPlayer = defender; ctx.choice.attackers = [{card: source, target: defender}];
      await game.combatPhase(player);
    }
    const before = a.life; await attack(a, b); assert.equal(a.life, before + 1);
    await attack(a, b); assert.equal(a.life, before + 1, 'additional combat is not the first attack');
    source.ctrl = b; game.recalc(); const otherLife = b.life;
    await attack(b, a); assert.equal(b.life, otherLife, 'control change does not make a new object');
    game.turnNo++; await attack(b, a); assert.equal(b.life, otherLife + 1, 'new turn has fresh event history');
    await game.move(source, 'exile'); await game.move(source, 'battlefield', {ctrl: b});
    await attack(b, a); assert.equal(b.life, otherLife + 2, 'blink makes a new battlefield incarnation');
  });
  test(role + ': first combat damage counts damage rather than attacks and does not repeat for double strike', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Composed Proof First Damage');
    game.priorityRound = async () => settle(game); source.meta.mustAttackPlayer = b; ctx.choice.attackers = [{card: source, target: b}];
    const before = a.life, foe = b.life;
    await game.damageAny(source, b, 1); await settle(game); assert.equal(a.life, before, 'noncombat damage does not consume or match combat history');
    await game.combatPhase(a); assert.equal(a.life, before + 1); assert.equal(b.life, foe - 3, 'both double-strike steps dealt damage');
    source.tapped = false; await game.combatPhase(a); assert.equal(a.life, before + 1, 'second combat cannot retrigger');
    game.turnNo++; source.tapped = false; await game.combatPhase(a); assert.equal(a.life, before + 2);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  });
  test(role + ': attacks while condition checks only the event and survives a response removing its support', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Composed Proof While'), support = put(ctx, fixture('Condition support'));
    const op = cards[0].implementation[0]; assert.ok(op.eventFilter.headerCondition); assert.equal(op.condition, undefined);
    source.meta.mustAttackPlayer = b; ctx.choice.attackers = [{card: source, target: b}]; let responded = false;
    game.priorityRound = async () => {if (game.stack.length && !responded) {responded = true; await game.move(support, 'graveyard'); await settle(game);}};
    await game.combatPhase(a); assert.equal(responded, true); assert.equal(source.power, 3); assert.equal(support.zone, 'graveyard');
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  });
  test(role + ': satisfying while after the attack cannot retroactively create its trigger', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Composed Proof While'); source.meta.mustAttackPlayer = b; ctx.choice.attackers = [{card: source, target: b}];
    const emit = game.emit.bind(game); game.emit = async (event, data) => {const result = await emit(event, data); if (event === 'attacks' && data.card === source) put(ctx, fixture('Late condition support')); return result;};
    game.priorityRound = async () => settle(game); await game.combatPhase(a); assert.equal(source.power, 1);
  });
  test(role + ': cycling from hand and dying from battlefield each fire their distinct clause once', async () => {
    const ctx = setup(role), {game, a} = ctx, source = put(ctx, 'Composed Proof Cycle', a, 'hand'); a.pool.C = 5; const before = a.life;
    for (let i = 0; i < 3; i++) put(ctx, 'Forest', a, 'library');
    const cycle = game.activatableList(a).find(action => action.card === source && action.cycling); assert.ok(cycle);
    assert.equal(await game.activateAbility(a, cycle), true); await settle(game); assert.equal(a.life, before + 1);
    await game.move(source, 'hand'); assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); await settle(game);
    assert.equal(a.life, before + 1, 'entering is not either printed trigger');
    await game.sacrifice(a, source); await settle(game); assert.equal(a.life, before + 2);
  });
  test(role + ': upkeep and green cast retain separate event qualification through real turn and casting paths', async () => {
    const ctx = setup(role), {game, a, b} = ctx, shrine = put(ctx, 'Composed Proof Shrine');
    for (const player of [a, b]) for (let i = 0; i < 4; i++) put(ctx, 'Forest', player, 'library');
    game.mainPhase = async () => {}; game.combatPhase = async () => {}; game.priorityRound = async () => settle(game);
    await game.runTurn(); assert.equal(shrine.counters.charge, 1);
    game.phase = 'main1'; game.step = 'main'; game.turnPlayer = a;
    a.pool.G = 1; a.pool.R = 1;
    const green = put(ctx, fixture('Green cast', {cost: '{G}'}), a, 'hand'); assert.equal(await game.castSpell(a, green, {from: 'hand'}), true); await settle(game); assert.equal(shrine.counters.charge, 2);
    const red = put(ctx, fixture('Red cast', {cost: '{R}'}), a, 'hand'); assert.equal(await game.castSpell(a, red, {from: 'hand'}), true); await settle(game); assert.equal(shrine.counters.charge, 2);
  });
}
