import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const definitions = [
  ['Alone', "This creature can't attack alone."],
  ['Block Alone', "This creature can't block alone."],
  ['Greater', "This creature can't attack unless a creature with greater power also attacks.\nThis creature can't block unless a creature with greater power also blocks."],
  ['Color', "This creature can't attack unless a black or green creature also attacks."],
  ['Maximum', "Each creature you control can't be blocked by more than one creature.", 'Enchantment'],
  ['Minimum', "This creature can't be blocked except by three or more creatures."],
  ['Artifact', "This creature can't be blocked as long as defending player controls an artifact."],
  ['Fox', "This creature can't be blocked by creatures with power 2 or greater as long as defending player controls a snow land."],
  ['More', "This creature can't attack unless you control more creatures than defending player.\nThis creature can't block unless you control more creatures than attacking player."],
  ['Shared', "This creature can't be blocked unless defending player controls three or more creatures that share a creature type."],
  ['History', "This creature can't attack unless you've cast a creature spell this turn."],
  ['Damaged', "This creature can't attack unless an opponent has been dealt damage this turn."],
  ['Monarch', "This creature can't attack unless defending player is the monarch."],
  ['Aura', "Enchant creature\nEnchanted creature gets +3/+2 and can't attack alone.", 'Enchantment — Aura'],
  ['Capacity', 'Each creature you control can block an additional creature each combat.'],
  ['Unlimited', 'Each creature you control can block any number of creatures.'],
  ['Temporary Capacity', '{1}: This creature can block an additional creature this turn.'],
  ['Equipment Capacity', 'This creature can block an additional creature each combat for each Equipment attached to this creature.'],
].map(([name, oracle_text, type_line = 'Creature — Beast'], i) => {
  const card = {name: 'Combat Proof ' + name, mana_cost: '{1}', power: '4', toughness: '20', oracle_text, type_line, layout: 'normal'};
  const semantic = semanticClass(card, {compilerVersion: 8}); assert.ok(semantic.semanticClass, name + ': ' + semantic.reason);
  return {position: i + 1, oracleId: 'combat-proof-' + i, scryfallId: 'combat-print-' + i, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle: oracle_text, types: type_line.split(' — ')[0].split(' '), subtypes: type_line.split(' — ')[1]?.split(' ') || [], super: [], power: card.power, toughness: card.toughness, _ci: []}, catalog: {typeLine: type_line, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-combat-declaration-fixtures', sequence: 9986, cards: definitions}); M.initData(M.RAW_DATA);

const fixture = (name, opts = {}) => ({name, cost: '{1}', types: ['Creature'], subtypes: ['Bear'], super: [], power: '1', toughness: '20', kws: [], oracle: '', colorsOverride: [], ...opts});
function put(ctx, definition, player = ctx.a, zone = 'battlefield') {
  const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
  card.ctrl = player; card.zone = zone; card.sick = false;
  if (zone === 'battlefield') {ctx.game.battlefield.push(card); ctx.game.recalc();} else player[zone].push(card);
  return card;
}
function setup(role = 'human') {
  const choice = {attackers: [], blockers: []}, trace = [];
  const human = {async decide(g, q) {trace.push(q.type); if (q.type === 'attackers') return choice.attackers; if (q.type === 'blockers') return choice.blockers; if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min ?? 1); if (q.type === 'chooseOption') return q.options[0].key; if (q.type === 'mana') return {auto: true}; return null;}};
  const game = new M.Game({seed: 155, paced: false}), a = game.addPlayer('A', {name: 'A'}, human, role === 'ai'), b = game.addPlayer('B', {name: 'B'}, human, false), c = game.addPlayer('C', {name: 'C'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  game.turnNo = 5; game.turnPlayer = a; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.reviewCombatWithHuman = async () => {}; game.spotlight = async () => {}; game.pace = async () => {};
  const journal = []; const emit = game.emit.bind(game);
  game.emit = async (event, data) => {if (event === 'attackersDeclared') journal.push({event, cards: data.attackers.slice()}); if (event === 'blockersDeclared') journal.push({event, pairs: data.attackers.flatMap(attacker => attacker.blockedBy.map(blocker => ({attacker, blocker})))}); return emit(event, data);};
  return {game, a, b, c, choice, trace, journal};
}
const attacking = ctx => ctx.journal.find(row => row.event === 'attackersDeclared')?.cards || [];
const blocking = ctx => ctx.journal.find(row => row.event === 'blockersDeclared')?.pairs || [];

for (const role of ['human', 'ai']) {
  test(role + ': a multiblocker declares two blocks and divides one damage budget between attackers', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Capacity'); a.life = 1;
    const attackers = [1, 2].map(i => put(ctx, fixture('Incoming ' + i, {power: '1', toughness: '3'}), b));
    ctx.choice.attackers = attackers.map(card => ({card, target: a})); ctx.choice.blockers = attackers.map(attacker => ({blocker: source, attacker})); game.turnPlayer = b;
    const hits = [], damage = game.damageCreature.bind(game); game.damageCreature = async (from, to, n, opts) => {if (from === source) hits.push({to, n}); return damage(from, to, n, opts);};
    await game.combatPhase(b);
    assert.equal(blocking(ctx).length, 2); assert.equal(a.life, 1); assert.equal(source.damage, 2);
    assert.equal(hits.reduce((sum, hit) => sum + hit.n, 0), 4, 'power is assigned once across both attackers');
    assert.equal(attackers.filter(card => card.zone === 'graveyard').length, 1); assert.equal(attackers.find(card => card.zone === 'battlefield').damage, 1);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  });
  test(role + ': repeated paid capacity activations stack, follow control, and do not follow a blink', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Temporary Capacity');
    a.pool.C = 2;
    for (let i = 0; i < 2; i++) {const action = game.activatableList(a).find(action => action.card === source); assert.ok(action); assert.equal(await game.activateAbility(a, action), true); await game.resolveTop();}
    assert.equal(game.blockerCapacity(source), 3); assert.equal(a.pool.C, 0);
    source.ctrl = b; game.recalc(); assert.equal(game.blockerCapacity(source), 3);
    await game.move(source, 'exile'); await game.move(source, 'battlefield'); assert.equal(game.blockerCapacity(source), 1);
  });
  test(role + ': paid source cast, forced lone attacker waits without tap, then a companion permits the declaration', async () => {
    const ctx = setup(role), {game, a, b} = ctx; a.pool.C = 1;
    const source = put(ctx, 'Combat Proof Alone', a, 'hand');
    assert.equal(await game.castSpell(a, source, {from: 'hand'}), true); await game.resolveTop(); source.sick = false;
    source.meta.mustAttackTurn = game.turnNo; ctx.choice.attackers = [{card: source, target: b}];
    let taps = 0; const tap = game.tap.bind(game); game.tap = card => {if (card === source) taps++; return tap(card);};
    await game.combatPhase(a); assert.equal(attacking(ctx).length, 0); assert.equal(taps, 0); assert.equal(source.tapped, false);
    const friend = put(ctx, fixture('Companion')); ctx.journal.length = 0;
    await game.combatPhase(a); assert.equal(attacking(ctx).includes(source), true); assert.equal(attacking(ctx).includes(friend), true); assert.equal(taps, 1);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  });
  test(role + ': defender predicates distinguish multiplayer and planeswalker controllers using live state', async () => {
    const ctx = setup(role), {game, a, b, c} = ctx;
    const source = put(ctx, 'Combat Proof Artifact'), blocker = put(ctx, fixture('Blocker'), b), other = put(ctx, fixture('Other blocker'), c);
    const artifact = put(ctx, fixture('Relic', {types: ['Artifact'], subtypes: []}), b);
    const walker = put(ctx, fixture('Walker', {types: ['Planeswalker'], subtypes: [], loyalty: 10}), b);
    source.attacking = walker; assert.equal(game.canBlock(blocker, source), false);
    source.attacking = c; assert.equal(game.canBlock(other, source), true);
    artifact.ctrl = c; game.recalc(); assert.equal(game.canBlock(other, source), false);
    await game.move(artifact, 'graveyard'); assert.equal(game.canBlock(other, source), true);
    const monarch = put(ctx, 'Combat Proof Monarch'); game.monarch = b; game.recalc();
    assert.equal(game.canAttackTarget(monarch, walker), true); assert.equal(game.canAttackTarget(monarch, c), false);
  });
  test(role + ': real casts and damage qualify history without conflating loss of life or copies', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Combat Proof History'), damage = put(ctx, 'Combat Proof Damaged');
    assert.equal(game.canAttackTarget(source, b), false); assert.equal(game.canAttackTarget(damage, b), false);
    game.loseLife(b, 1); game.recalc(); assert.equal(game.canAttackTarget(damage, b), false);
    await game.damagePlayer(source, b, 1); assert.equal(game.canAttackTarget(damage, b), true);
    const spell = put(ctx, fixture('Cast creature'), a, 'hand'); a.pool.C = 1;
    assert.equal(await game.castSpell(a, spell, {from: 'hand'}), true); assert.equal(game.canAttackTarget(source, b), true);
    await game.resolveTop(); a.turnState = a.freshTurnState(); b.turnState = b.freshTurnState(); game.recalc();
    assert.equal(game.canAttackTarget(source, b), false); assert.equal(game.canAttackTarget(damage, b), false);
  });
  test(role + ': minimum three blockers and maximum one combine with menace as restrictions', async () => {
    const ctx = setup(role), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Minimum'); source.meta.mustAttackPlayer = b;
    const blockers = [1, 2, 3].map(i => put(ctx, fixture('Blocker ' + i, {power: '0'}), b));
    ctx.choice.attackers = [{card: source, target: b}]; ctx.choice.blockers = blockers.slice(0, 2).map(blocker => ({blocker, attacker: source}));
    await game.combatPhase(a); assert.equal(blocking(ctx).length, 0);
    source.tapped = false; ctx.journal.length = 0; ctx.choice.blockers = blockers.map(blocker => ({blocker, attacker: source}));
    await game.combatPhase(a); assert.equal(blocking(ctx).length, 3);
    put(ctx, 'Combat Proof Maximum'); assert.equal(game.canBlock(blockers[0], source), false); assert.deepEqual({...game.blockerBounds(source)}, {min: 3, max: 1});
  });
}

test('whole block declaration counts other blockers on different attackers, rejects duplicate pair capacity, and checks greater power', async () => {
  const ctx = setup(), {game, a, b} = ctx, attacker = put(ctx, fixture('Attacker')), second = put(ctx, fixture('Second attacker'));
  const alone = put(ctx, 'Combat Proof Block Alone', b), friend = put(ctx, fixture('Friend'), b);
  ctx.choice.attackers = [{card: attacker, target: b}, {card: second, target: b}]; ctx.choice.blockers = [{blocker: alone, attacker}, {blocker: friend, attacker: second}];
  await game.combatPhase(a); assert.equal(blocking(ctx).length, 2);
  assert.equal(game.blockDeclarationLegal([attacker, second], [{blocker: friend, attacker}, {blocker: friend, attacker: second}]), false);
  const greater = put(ctx, 'Combat Proof Greater', b); assert.equal(game.blockDeclarationLegal([attacker, second], [{blocker: greater, attacker}, {blocker: friend, attacker: second}]), false);
  friend.def.power = '5'; game.recalc(); assert.equal(game.blockDeclarationLegal([attacker, second], [{blocker: greater, attacker}, {blocker: friend, attacker: second}]), true);
});

test('AI defenders select a legal three-creature block through the normal local controller', async () => {
  const ctx = setup(), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Minimum'); b.life = 3; b.isAI = true; b.controller = new M.AIController(b, {difficulty: 'hard', style: 'balanced'});
  for (let i = 0; i < 3; i++) put(ctx, fixture('AI wall ' + i, {power: '0'}), b);
  ctx.choice.attackers = [{card: source, target: b}]; await game.combatPhase(a);
  assert.equal(blocking(ctx).length, 3); assert.equal(b.life, 3); assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
});

test('blocking requirements add a necessary companion and maximize legal blocks under contradictory bounds', async () => {
  const ctx = setup(), {game, a, b} = ctx, lure = put(ctx, fixture('Lure attacker', {lure: true})), other = put(ctx, fixture('Other attacker'));
  // Legacy lure is a static current characteristic, as used by the engine.
  lure.def.statics = [{apply(g, self) {self.cur.lure = true;}}]; game.recalc();
  const alone = put(ctx, 'Combat Proof Block Alone', b), friend = put(ctx, fixture('Companion blocker'), b);
  put(ctx, 'Combat Proof Maximum');
  ctx.choice.attackers = [{card: lure, target: b}, {card: other, target: b}]; ctx.choice.blockers = [];
  await game.combatPhase(a);
  const blocks = blocking(ctx); assert.equal(blocks.filter(pair => pair.attacker === lure).length, 1);
  assert.equal(blocks.some(pair => pair.blocker === alone), true); assert.equal(blocks.some(pair => pair.blocker === friend), true);
  assert.equal(game.blockDeclarationLegal([lure, other], blocks), true);
});

test('a required minimum-three block yields to three independently satisfiable blocking requirements', () => {
  const ctx = setup(), {game, a, b} = ctx, triple = put(ctx, 'Combat Proof Minimum');
  const singles = [1, 2, 3].map(i => put(ctx, fixture('Required attacker ' + i)));
  for (const attacker of [triple, ...singles]) {attacker.attacking = b; attacker.cur.mustBeBlocked = true;}
  const defenders = [1, 2, 3].map(i => put(ctx, fixture('Available blocker ' + i), b));
  // New permanents recalculate; restore fixture-only requirements afterward.
  for (const attacker of [triple, ...singles]) attacker.cur.mustBeBlocked = true;
  for (const blocker of defenders) {blocker.blocking = triple.iid; triple.blockedBy.push(blocker);}
  game.completeRequiredBlocks([triple, ...singles], defenders);
  assert.equal(triple.blockedBy.length, 0); assert.equal(singles.every(attacker => attacker.blockedBy.length === 1), true);
});

test('group declaration is validated before an unaffordable attack tax causes any tap trigger', async () => {
  const ctx = setup(), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Alone'), friend = put(ctx, fixture('Taxed companion'));
  put(ctx, fixture('Attack tax', {types: ['Enchantment'], attackTax: 2}), b);
  ctx.choice.attackers = [{card: source, target: b}, {card: friend, target: b}]; let taps = 0;
  const tap = game.tap.bind(game); game.tap = card => {taps++; return tap(card);};
  await game.combatPhase(a); assert.equal(attacking(ctx).length, 0); assert.equal(taps, 0);
});

test('snow power predicate and shared creature types count actual derived creature types', () => {
  const ctx = setup(), {game, a, b} = ctx, fox = put(ctx, 'Combat Proof Fox'), blocker = put(ctx, fixture('Strong blocker', {power: '2'}), b);
  fox.attacking = b; const snow = put(ctx, fixture('Snow land', {types: ['Land'], subtypes: [], super: ['Snow']}), b);
  assert.equal(game.canBlock(blocker, fox), false); blocker.def.power = '1'; game.recalc(); assert.equal(game.canBlock(blocker, fox), true);
  const shared = put(ctx, 'Combat Proof Shared'); shared.attacking = b;
  assert.equal(game.canBlock(blocker, shared), false);
  put(ctx, fixture('Bear friend'), b); put(ctx, fixture('Changeling friend', {subtypes: [], changeling: true}), b);
  assert.equal(game.canBlock(blocker, shared), true); snow.ctrl = a; game.recalc(); assert.equal(game.canBlock(blocker, fox), true);
});

test('capacity is additive with Equipment count and an unlimited grant remains unlimited', async () => {
  const ctx = setup(), {game} = ctx, source = put(ctx, 'Combat Proof Equipment Capacity'); assert.equal(game.blockerCapacity(source), 1);
  const first = put(ctx, fixture('First equipment', {types: ['Artifact'], subtypes: ['Equipment']})), second = put(ctx, fixture('Second equipment', {types: ['Artifact'], subtypes: ['Equipment']}));
  await game.attach(first, source); await game.attach(second, source); assert.equal(game.blockerCapacity(source), 3);
  put(ctx, 'Combat Proof Capacity'); assert.equal(game.blockerCapacity(source), 4);
  await game.move(first, 'graveyard'); assert.equal(game.blockerCapacity(source), 3);
  put(ctx, 'Combat Proof Unlimited'); assert.equal(game.blockerCapacity(source), Infinity);
});

test('first-strike multiblock deals damage once and normal step uses surviving attackers', async () => {
  const ctx = setup(), {game, a, b} = ctx, blocker = put(ctx, fixture('Double striking multiblocker', {power: '4', toughness: '20', kws: ['double strike']}));
  const grant = put(ctx, 'Combat Proof Capacity'), attackers = [1, 2].map(i => put(ctx, fixture('Four toughness ' + i, {power: '2', toughness: '4'}), b));
  ctx.choice.attackers = attackers.map(card => ({card, target: a})); ctx.choice.blockers = attackers.map(attacker => ({blocker, attacker})); game.turnPlayer = b;
  const hits = [], damage = game.damageCreature.bind(game); game.damageCreature = async (from, to, n, opts) => {if (from === blocker) hits.push({to, n, step: opts.combatStep}); return damage(from, to, n, opts);};
  await game.combatPhase(b); assert.equal(hits.filter(hit => hit.step === 'first').reduce((n, hit) => n + hit.n, 0), 4);
  assert.equal(hits.filter(hit => hit.step === 'normal').reduce((n, hit) => n + hit.n, 0), 4); assert.equal(attackers.every(card => card.zone === 'graveyard'), true); assert.equal(blocker.damage, 2);
});

test('the human blocker controls keep independent assignments and display one shared damage budget', () => {
  const document = {addEventListener() {}, querySelector() {return null;}};
  runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {MTG: M, document, window: {addEventListener() {}}, console, setTimeout, clearTimeout, localStorage: {getItem() {return null;}, setItem() {}}});
  const ctx = setup(), {game, a, b} = ctx, source = put(ctx, 'Combat Proof Capacity'), attackers = [1, 2, 3].map(i => put(ctx, fixture('UI incoming ' + i, {power: '1', toughness: '3'}), b));
  const ui = new M.UI(); ui.game = game; ui.me = a; ui.render = () => {}; const messages = []; ui.toast = message => messages.push(message);
  ui.pending = {q: {type: 'blockers', attackers, potential: [source]}, assigns: new Map(), mode: attackers[0]};
  ui.assignBlocker(source); ui.assignBlocker(source, attackers[1]); ui.assignBlocker(source, attackers[2]);
  assert.equal(ui.blockAssignments().length, 2); assert.equal(messages.length, 1);
  assert.equal(ui.blockOutcome(game, attackers[0], [source], ui.blockAssignments()).attackerDies, true);
  assert.equal(ui.blockOutcome(game, attackers[1], [source], ui.blockAssignments()).attackerDies, false);
  ui.assignBlocker(source, attackers[0]); assert.equal(ui.blockAssignments().length, 1); assert.equal(ui.blockAssignments()[0].attacker === attackers[1], true);
});

test('temporary capacity persists through ability loss and expires at the actual cleanup step', async () => {
  const ctx = setup(), {game, a, b, c} = ctx, source = put(ctx, 'Combat Proof Temporary Capacity'); a.pool.C = 1;
  assert.equal(await game.activateAbility(a, game.activatableList(a).find(action => action.card === source)), true); await game.resolveTop();
  const aura = put(ctx, 'Lignify'); await game.attach(aura, source); assert.equal(game.blockerCapacity(source), 2);
  for (const player of [a, b, c]) for (let i = 0; i < 4; i++) put(ctx, 'Forest', player, 'library');
  game.mainPhase = async () => {}; game.combatPhase = async () => {}; await game.runTurn();
  assert.equal(game.blockerCapacity(source), 1);
});

test('deathtouch and lifelink use the same finite multiblocker damage budget', async () => {
  const ctx = setup(), {game, a, b} = ctx; a.life = 20;
  const blocker = put(ctx, fixture('One-power deathtouch blocker', {power: '1', kws: ['deathtouch', 'lifelink']})); put(ctx, 'Combat Proof Capacity');
  const attackers = [1, 2].map(i => put(ctx, fixture('Deathtouch incoming ' + i, {power: '2', toughness: '4'}), b));
  ctx.choice.attackers = attackers.map(card => ({card, target: a})); ctx.choice.blockers = attackers.map(attacker => ({blocker, attacker})); game.turnPlayer = b;
  await game.combatPhase(b); assert.equal(attackers.filter(card => card.zone === 'graveyard').length, 1);
  assert.equal(a.life, 21); assert.equal(blocker.damage, 4);
});
