import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {needsRecompile} from '../scripts/oracle-v8-copies.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const definitions = [
  ['Frog', 'Sorcery', "Create a token that's a copy of target non-Frog creature, except it's a 1/1 green Frog."],
  ['Artifact', 'Sorcery', "Create a token that's a copy of target creature, except it's an artifact in addition to its other types."],
  ['Granted', 'Sorcery', `Create a token that's a copy of target creature you control, except it has haste and "At the beginning of the end step, sacrifice this permanent."`],
  ['Granted Exile', 'Sorcery', `Create a token that's a copy of target creature, except it has haste and "At the beginning of the end step, exile this token."`],
  ['Temporary', 'Sorcery', "Create a token that's a copy of target creature, except it's an artifact in addition to its other types. That token gains haste. Exile it at the beginning of the next end step."],
  ['Eot Haste', 'Sorcery', "Create a token that's a copy of target creature, except it's an artifact in addition to its other types. That token gains haste until end of turn."],
  ['Until Next', 'Sorcery', "Exile target creature card from your graveyard. Create a token that's a copy of that card, except it's 1/1. It gains haste until your next turn."],
  ['Grouped', 'Sorcery', "For each creature you control, create a token that's a copy of that creature, except it isn't legendary."],
  ['Pair', 'Sorcery', "Choose up to two target creatures you don't control. For each of those creatures, create a token that's a copy of that creature. Those tokens gain haste. Exile them at the beginning of the next end step."],
  ['Attacking', 'Instant', "Create a tapped and attacking token that's a copy of target creature you control, except it isn't legendary."],
  ['Death', 'Enchantment', "Whenever another nontoken creature you control dies, create a token that's a copy of it, except it's a 1/1 white Spirit."],
  ['ETB', 'Enchantment', "Whenever a nontoken Dragon you control enters, create a token that's a copy of it, except it isn't legendary."],
  ['Next Own', 'Sorcery', "Create a token that's a copy of target creature, except it isn't legendary. Exile that token at the beginning of your next end step."],
  ['Combat', 'Instant', "Create a token that's a copy of target creature, except it isn't legendary. Exile it at end of combat."],
  ['Sacrifice', 'Sorcery', "Create a token that's a copy of target creature, except it's an artifact in addition to its other types. Sacrifice it at the beginning of the next end step."],
  ['Self', 'Creature', "{1}: Create a token that's a copy of this creature, except it's a 1/1 white Spirit."],
  ['Self Death', 'Creature', "When this creature dies, create a token that's a copy of this creature, except it's a 1/1 white Spirit."],
  ['Vesuva', 'Land', 'You may have this land enter tapped as a copy of any land on the battlefield.'],
  ['Cave', 'Land', "You may have this land enter tapped as a copy of any land card in a graveyard, except it's a Cave in addition to its other types."],
  ['Effigy', 'Artifact', `You may have this artifact enter as a copy of any creature on the battlefield, except it's an artifact and it has "{T}: Add {U}."`],
  ['Auton', 'Creature', "You may have this creature enter as a copy of any creature on the battlefield, except it isn't legendary, is an artifact in addition to its other types, and has myriad."],
  ['Add Subtypes', 'Creature', "You may have this creature enter as a copy of any creature on the battlefield, except it isn't legendary, is a Shapeshifter Rogue in addition to its other types, and has myriad."],
  ['Entry Frog', 'Creature', "You may have this creature enter as a copy of any creature on the battlefield, except it isn't legendary and is a 1/1 green Frog."],
  ['Exile Card', 'Sorcery', "Exile target creature card from a graveyard. Create a token that's a copy of that card, except it's a 1/1 blue Frog."],
  ['Opponent', 'Sorcery', "Target opponent creates a token that's a copy of target creature, except it's a 1/1 white Spirit."],
  ['Choose', 'Sorcery', "Create a token that's a copy of a creature you control, except it's an artifact in addition to its other types."],
];
const fixtures = definitions.map(([name, type, oracle], index) => {
  const card = {name: 'V8 Copies ' + name, type_line: type, layout: 'normal', mana_cost: type === 'Land' ? '' : '{2}{U}', oracle_text: oracle, power: '2', toughness: '3'};
  const semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, `${name}: ${semantic.reason}`);
  return {position: index + 1, oracleId: 'v8-copies-' + index, scryfallId: 'v8-copies-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle, types: [type], subtypes: [], super: [], _ci: ['U'], ...(type === 'Creature' ? {power: '2', toughness: '3'} : {})},
    catalog: {typeLine: type, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-v8-copies-test', sequence: 9995, cards: fixtures});
M.initData(M.RAW_DATA);

function context(role = 'human', fullPriority = false) {
  const state = {}, trace = []; let a;
  const human = {decide: async (game, query) => {
    if (query.type === 'priority' || query.type === 'main') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return state.targets?.(query) ?? query.candidates.slice(0, query.min || query.max || 1);
    if (query.type === 'chooseCards') return state.cards?.(query) ?? query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return state.option?.(query) ?? query.options.find(option => ['yes', 'stay'].includes(option.key))?.key ?? query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    if (query.type === 'chooseX') return query.min || 0;
    return [];
  }};
  const game = new M.Game({seed: 127707, paced: false});
  a = game.addPlayer('A', {name: 'A'}, human, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, human, false), c = game.addPlayer('C', {name: 'C'}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {const answer = await decide(g, query); trace.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
  if (!fullPriority) game.priorityRound = async () => {};
  game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  return {game, a, b, c, state, trace};
}
function creature(name, extra = {}) {
  return {name, cost: '{3}{G}', oracle: '', types: ['Creature'], subtypes: ['Dragon'], super: [], power: '6', toughness: '6', kws: [], ...extra};
}
function put(game, player, name, zone = 'battlefield') {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[name] : name, player);
  assert.ok(card.def, String(name)); card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') {game.battlefield.push(card); game.recalc();} else player[zone].push(card);
  return card;
}
const tokens = game => game.bf().filter(card => card.isToken);
async function settle(game) {
  for (let n = 0; n < 100 && (game.stack.length || game.pendingTriggers.length); n++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, {resolve = true, pilot = false} = {}) {
  const {game, a} = ctx, source = put(game, a, 'V8 Copies ' + name, 'hand');
  a.pool.U = 1; a.pool.C = 2;
  if (pilot) {
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase,
      casts: game.castableList(a), acts: game.activatableList(a), lands: []});
    assert.equal(action.kind, 'cast', JSON.stringify(game.aiDecisionLog?.at(-1)));
    assert.equal(action.card, source); assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.castSpell(a, source, {from: 'hand'}), true);
  assert.equal(a.pool.U + a.pool.C, 0, 'ordinary casting pays the printed mana cost');
  if (resolve) await settle(game);
  return source;
}
function target(ctx, card) {ctx.state.targets = query => query.candidates.includes(card) ? [card] : query.candidates.slice(0, query.min || 1);}

test('v8 copy grammar remains closed and recompiles only an observed-object pronoun', () => {
  for (const text of [
    "Create a token that's a copy of that potato, except it's a 1/1 green Frog.",
    "Create a token that's a copy of target creature, except it has an unknown ability.",
    "Create a token that's a copy of target creature, except it's 1/1 and draw a card.",
    'You may have this creature enter as a copy of any creature, except it has a secret rule.',
  ]) assert.equal(semanticClass({name: 'Closed Copies', type_line: 'Creature', layout: 'normal', power: '2', toughness: '2', oracle_text: text}, {compilerVersion: 8}).semanticClass, undefined, text);
  const observed = {name: 'V8 Observer', type_line: 'Enchantment', layout: 'normal', oracle_text: definitions.find(row => row[0] === 'ETB')[2]};
  const frozen = semanticClass(observed, {compilerVersion: 7});
  assert.equal(needsRecompile(observed, frozen), true);
  const corrected = semanticClass(observed, {compilerVersion: 8});
  assert.equal(corrected.implementation[0].effects[0].target, 'event-card');
  const self = {...observed, type_line: 'Creature', power: '2', toughness: '3', oracle_text: "When this creature enters, create a token that's a copy of it, except it isn't legendary."};
  assert.equal(needsRecompile(self, semanticClass(self, {compilerVersion: 7})), false);
  assert.equal(semanticClass(self, {compilerVersion: 8}).implementation[0].effects[0].target, 'self');
});

for (const role of ['human', 'ai']) {
  test(`v8 copies ${role}: paid targeted copy fixes power, color, subtype and copies those values again`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    const original = put(game, b, creature('Copy Chimera', {types: ['Artifact', 'Creature'], subtypes: ['Equipment', 'Dragon'], cdaPower: () => 20, cdaToughness: () => 21, oracleCharacteristicPT: true}));
    const spell = await cast(ctx, 'Frog'); const first = tokens(game)[0];
    assert.equal(spell.zone, 'graveyard'); assert.equal(original.power, 20);
    assert.equal(first.power, 1); assert.equal(first.toughness, 1); assert.deepEqual(Array.from(first.colors), ['G']);
    assert.equal(first.hasSub('Frog'), true); assert.equal(first.hasSub('Dragon'), false); assert.equal(first.hasSub('Equipment'), true);
    assert.equal(first.def.cdaPower, undefined); assert.equal(first.def.cdaToughness, undefined); assert.equal(first.mv, 4);
    await game.move(original, 'graveyard'); await cast(ctx, 'Artifact'); const second = tokens(game).find(card => card !== first);
    assert.equal(second.power, 1); assert.equal(second.toughness, 1); assert.equal(second.hasSub('Frog'), true); assert.deepEqual(Array.from(second.colors), ['G']);
    assert.equal(second.is('Artifact'), true); assert.equal(second.ctrl, a);
  });
  test(`v8 copies ${role}: a blinked target cannot be replaced by its new incarnation`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, creature('Copy Blink'));
    await cast(ctx, 'Frog', {resolve: false}); await game.move(victim, 'exile'); await game.move(victim, 'battlefield', {ctrl: b});
    await settle(game); assert.equal(tokens(game).length, 0);
  });
  test(`v8 copies ${role}: a public graveyard card stays bound through this spell's exile`, async () => {
    const ctx = context(role), {game, b} = ctx, victim = put(game, b, creature('Copy Grave'), 'graveyard');
    await cast(ctx, 'Exile Card'); assert.equal(victim.zone, 'exile');
    const copy = tokens(game)[0]; assert.equal(copy.name, victim.name); assert.equal(copy.power, 1); assert.equal(copy.hasSub('Frog'), true);
    assert.deepEqual(Array.from(copy.colors), ['U']); assert.equal(copy.owner, ctx.a);
  });
  test(`v8 copies ${role}: granted quoted ability and haste are copiable`, async () => {
    const ctx = context(role), {game, a} = ctx, original = put(game, a, creature('Copy Gift'));
    await cast(ctx, 'Granted'); const first = tokens(game)[0]; assert.equal(first.kw('haste'), true);
    await game.move(original, 'graveyard'); await cast(ctx, 'Artifact'); const second = tokens(game).find(card => card !== first);
    assert.equal(second.kw('haste'), true); assert.ok(second.def.triggers.some(trigger => trigger.on === 'endStep'));
    await game.emit('endStep', {player: a}); await game.flushTriggers(); assert.equal(game.stack.length, 2);
    await settle(game); assert.equal(tokens(game).length, 0);
  });
  test(`v8 copies ${role}: granted haste and delayed exile are not copied`, async () => {
    const ctx = context(role), {game, a} = ctx, original = put(game, a, creature('Copy Temporary'));
    await cast(ctx, 'Temporary'); const first = tokens(game)[0]; assert.equal(first.kw('haste'), true);
    await game.move(original, 'graveyard'); await cast(ctx, 'Artifact'); const second = tokens(game).find(card => card !== first);
    assert.equal(second.kw('haste'), false); assert.equal(game.delayed.length, 1);
    await game.emit('endStep', {player: a}); await settle(game);
    assert.equal(first.zone, 'ceased'); assert.equal(second.zone, 'battlefield');
  });
  test(`v8 copies ${role}: each source is frozen before group entry and tokens enter simultaneously`, async () => {
    const ctx = context(role), {game, a} = ctx;
    put(game, a, creature('Copy Group One')); put(game, a, creature('Copy Group Two'));
    const events = [], creation = [], emit = game.emit.bind(game);
    game.emit = async (name, data) => {
      if (name === 'etb' && data.card.isToken) events.push({card: data.card, count: tokens(game).length});
      if (name === 'tokensCreated') creation.push(data.tokens.length);
      return emit(name, data);
    };
    await cast(ctx, 'Grouped'); assert.equal(tokens(game).length, 2);
    assert.deepEqual(events.map(row => row.count), [2, 2]); assert.deepEqual(creation, [2]);
    assert.deepEqual(Array.from(tokens(game), card => card.name).sort(), ['Copy Group One', 'Copy Group Two']);
  });
  test(`v8 copies ${role}: death observer uses copied battlefield values after original definition returns`, async () => {
    const ctx = context(role), {game, a} = ctx;
    await cast(ctx, 'Death'); const original = put(game, a, creature('Printed Original', {subtypes: ['Human']}));
    original.meta.characteristicOriginalDef = original.def; original.def = creature('Copied Dragon', {kws: ['flying']}); original.isCopyOf = original.def; game.recalc();
    await game.move(original, 'graveyard'); assert.equal(original.name, 'Printed Original'); await settle(game);
    const copy = tokens(game)[0]; assert.equal(copy.name, 'Copied Dragon'); assert.equal(copy.hasSub('Spirit'), true); assert.equal(copy.kw('flying'), true); assert.equal(copy.power, 1);
  });
  test(`v8 copies ${role}: observed ETB pronoun copies the arriving Dragon and not its observer`, async () => {
    const ctx = context(role), {game, a} = ctx, observer = await cast(ctx, 'ETB');
    const dragon = put(game, a, creature('Arriving Dragon'), 'hand'); await game.move(dragon, 'battlefield', {ctrl: a});
    await settle(game); assert.equal(tokens(game).length, 1); assert.equal(tokens(game)[0].name, dragon.name);
    assert.notEqual(tokens(game)[0].name, observer.name);
  });
  test(`v8 copies ${role}: source leaves before its activated copy effect resolves`, async () => {
    const ctx = context(role), {game, a} = ctx, source = await cast(ctx, 'Self');
    a.pool.C = 1; const ability = game.activatableList(a).find(row => row.card === source);
    assert.ok(ability); assert.equal(await game.activateAbility(a, ability), true); assert.equal(a.pool.C, 0);
    await game.move(source, 'graveyard'); await settle(game);
    const copy = tokens(game)[0]; assert.equal(copy.name, 'V8 Copies Self'); assert.equal(copy.power, 1); assert.equal(copy.hasSub('Spirit'), true);
    assert.ok(copy.def.abilities.length);
  });
  test(`v8 copies ${role}: enter tapped copy is a legal land play and entry instruction is not copiable`, async () => {
    const ctx = context(role), {game, a} = ctx, land = put(game, a, 'Forest');
    const source = put(game, a, 'V8 Copies Vesuva', 'hand'); assert.equal(await game.playLand(a, source), true);
    assert.equal(source.name, 'Forest'); assert.equal(source.tapped, true); assert.equal(a.landsPlayed, 1);
    const copy = (await game.copyPermanentToken(source, a))[0]; assert.equal(copy.tapped, false); assert.equal(copy.hasSub('Forest'), true);
    assert.equal(land.tapped, false);
  });
  test(`v8 copies ${role}: copy a public graveyard land with additive Cave subtype`, async () => {
    const ctx = context(role), {game, a, b} = ctx, land = put(game, b, 'Forest', 'graveyard');
    const source = put(game, a, 'V8 Copies Cave', 'hand'); assert.equal(await game.playLand(a, source), true);
    assert.equal(source.name, 'Forest'); assert.equal(source.hasSub('Forest'), true); assert.equal(source.hasSub('Cave'), true); assert.equal(source.tapped, true);
    assert.equal(land.zone, 'graveyard'); assert.equal(source.ctrl, a);
  });
  test(`v8 copies ${role}: copying a creature as only an artifact retains its abilities and grants ordinary mana ability`, async () => {
    const ctx = context(role), {game, a, b} = ctx;
    put(game, b, creature('Copy Artifact Subject', {types: ['Artifact', 'Creature'], subtypes: ['Equipment', 'Dragon'], kws: ['flying']}));
    const source = await cast(ctx, 'Effigy'); assert.equal(source.is('Artifact'), true); assert.equal(source.is('Creature'), false);
    assert.equal(source.hasSub('Dragon'), false); assert.equal(source.hasSub('Equipment'), true); assert.equal(source.kw('flying'), true);
    assert.ok(source.def.mana.length, 'quoted mana ability uses ordinary mana-source compilation');
    const paying = put(game, a, 'V8 Copies Artifact', 'hand'); a.pool.C = 2;
    assert.equal(await game.castSpell(a, paying, {from: 'hand'}), true);
    assert.equal(source.tapped, true); assert.equal(a.pool.U + a.pool.C, 0, 'ordinary payment taps the copied mana ability');
    await settle(game); assert.equal(paying.zone, 'graveyard');
  });
}

test('v8 copies real hard AI chooses a copy action, pays mana, and resolves through normal priority', async () => {
  const ctx = context('ai', true), {game, a, b} = ctx; put(game, b, creature('AI Copy Threat'));
  let priorityRounds = 0; const priority = game.priorityRound.bind(game);
  game.priorityRound = async (...args) => {priorityRounds++; return priority(...args);};
  let observedStack = false; const resolve = game.resolveTop.bind(game);
  game.resolveTop = async () => {observedStack ||= game.stack.at(-1)?.kind === 'spell'; return resolve();};
  await cast(ctx, 'Artifact', {pilot: true}); assert.equal(observedStack, true);
  assert.equal(tokens(game).length, 1); assert.equal(tokens(game)[0].name, 'AI Copy Threat');
  assert.ok(ctx.trace.some(row => row.query.type === 'chooseTargets')); assert.ok(priorityRounds > 0);
});

test('v8 copies replacement-created Squirrels keep their own copiable identity and mana value', async () => {
  const ctx = context(), {game, a, b} = ctx;
  put(game, a, 'Chatterfang, Squirrel General'); const victim = put(game, b, creature('Copy Replaced')); target(ctx, victim);
  await cast(ctx, 'Artifact'); const squirrel = tokens(game).find(card => card.hasSub('Squirrel'));
  assert.ok(squirrel); assert.equal(squirrel.mv, 0); assert.equal(squirrel.isCopyOf, null);
  const copied = (await game.copyPermanentToken(squirrel, a, {noReplace: true}))[0];
  assert.equal(copied.name, 'Squirrel Token'); assert.equal(copied.power, 1); assert.equal(copied.hasSub('Squirrel'), true);
});

test('v8 copies Academy Manufactor replaces a copied Treasure with three predefined token definitions', async () => {
  const ctx = context(), {game, a} = ctx; put(game, a, 'Academy Manufactor');
  const treasureCreature = put(game, a, creature('Treasure Creature', {types: ['Artifact', 'Creature'], subtypes: ['Treasure']})); target(ctx, treasureCreature);
  await cast(ctx, 'Artifact'); const made = tokens(game); assert.equal(made.length, 3);
  assert.deepEqual(Array.from(made, card => card.name).sort(), ['Clue Token', 'Food Token', 'Treasure Token']);
  for (const token of made) {assert.equal(token.isCopyOf, null); assert.equal(token.mv, 0); assert.equal(token.is('Creature'), false);}
});

test('v8 copies next-own end step waits, and an end-combat delay uses the real combat-end step', async () => {
  const ctx = context(), {game, a, b} = ctx; put(game, a, creature('Copy Duration'));
  await cast(ctx, 'Next Own'); const own = tokens(game)[0];
  await game.emit('endStep', {player: b}); await settle(game); assert.equal(own.zone, 'battlefield'); assert.equal(game.delayed.length, 1);
  await game.emit('endStep', {player: a}); await settle(game); assert.equal(own.zone, 'ceased');
  await cast(ctx, 'Combat'); const combat = tokens(game)[0]; game.combat = {attackers: [], defenders: []};
  await game.endCombatStep(a); await settle(game); assert.equal(combat.zone, 'ceased'); assert.equal(game.combat, null);
});

test('v8 copies granted haste with explicit end-of-turn duration ends in ordinary cleanup', async () => {
  const ctx = context(), {game, a} = ctx; put(game, a, creature('Copy Short Haste'));
  for (const player of game.players) for (let n = 0; n < 4; n++) put(game, player, 'Forest', 'library');
  let copy;
  game.mainPhase = async () => {if (copy) return; await cast(ctx, 'Eot Haste'); copy = tokens(game)[0]; assert.equal(copy.kw('haste'), true);};
  game.combatPhase = async () => {};
  await game.runTurn(); assert.equal(copy.zone, 'battlefield'); assert.equal(copy.kw('haste'), false);
});

test('v8 copies delayed sacrifice cannot sacrifice a token another player now controls', async () => {
  const ctx = context(), {game, a, b} = ctx; put(game, a, creature('Copy Stolen'));
  await cast(ctx, 'Sacrifice'); const copy = tokens(game)[0]; copy.ctrl = b; game.recalc();
  await game.emit('endStep', {player: a}); await settle(game); assert.equal(copy.zone, 'battlefield'); assert.equal(copy.ctrl, b);
});

test('v8 copies tapped-and-attacking chooses a legal defender without declaring an attack', async () => {
  const ctx = context(), {game, a, b} = ctx, original = put(game, a, creature('Copy Attacking'));
  game.phase = 'combat'; game.step = 'blockers'; game.combat = {attackers: [original], defenders: []}; original.attacking = b;
  const events = [], emit = game.emit.bind(game); game.emit = async (name, data) => {events.push({name, data}); return emit(name, data);};
  await cast(ctx, 'Attacking'); const copy = tokens(game)[0];
  assert.equal(copy.tapped, true); assert.ok([ctx.b, ctx.c].includes(copy.attacking)); assert.ok(game.combat.attackers.includes(copy));
  assert.equal(events.filter(row => row.name === 'attacks' && row.data.card === copy).length, 0);
  assert.ok(events.some(row => row.name === 'etb' && row.data.card === copy && row.data.card.attacking));
});

test('v8 copies selected multiple objects are independently revalidated and enter together', async () => {
  const ctx = context(), {game, b} = ctx, first = put(game, b, creature('Copy Pair One')), second = put(game, b, creature('Copy Pair Two'));
  ctx.state.targets = query => query.candidates.slice(0, query.max); await cast(ctx, 'Pair', {resolve: false});
  await game.move(first, 'hand'); await settle(game);
  assert.equal(tokens(game).length, 1); assert.equal(tokens(game)[0].name, second.name); assert.equal(tokens(game)[0].kw('haste'), true);
});

test('v8 copies non-target optional clone choice can be declined and ignores hexproof', async () => {
  const ctx = context(), {game, a, b} = ctx; put(game, b, creature('Copy Hexproof', {kws: ['hexproof']}));
  const chosen = await cast(ctx, 'Auton'); assert.equal(chosen.name, 'Copy Hexproof'); assert.equal(chosen.is('Artifact'), true); assert.equal(chosen.kw('myriad'), true);
  assert.equal(ctx.trace.some(row => row.query.type === 'chooseTargets'), false);
  ctx.state.cards = () => []; const declined = await cast(ctx, 'Auton'); assert.equal(declined.name, 'V8 Copies Auton'); assert.equal(declined.isCopyOf, null);
  assert.equal(chosen.ctrl, a);
});

test('v8 copies additive subtypes retain changeling whereas replacement subtype removes it', async () => {
  const ctx = context(), {game, a, b} = ctx, original = put(game, b, creature('Copy Changeling', {changeling: true}));
  const additive = await cast(ctx, 'Add Subtypes'); assert.equal(additive.def.changeling, true); assert.equal(additive.hasSub('Elf'), true);
  ctx.state.cards = query => query.from.includes(original) ? [original] : [];
  const replacing = await cast(ctx, 'Entry Frog');
  assert.equal(replacing.def.changeling, undefined); assert.equal(replacing.hasSub('Elf'), false); assert.equal(replacing.hasSub('Frog'), true);
});

test('v8 copies a copied source death trigger uses its last battlefield definition', async () => {
  const ctx = context(), {game, a} = ctx, source = put(game, a, creature('Printed Before Copy'));
  source.meta.characteristicOriginalDef = source.def; source.def = M.DEFS['V8 Copies Self Death']; source.isCopyOf = source.def; game.recalc();
  await game.move(source, 'graveyard'); assert.equal(source.name, 'Printed Before Copy'); await settle(game);
  assert.equal(tokens(game).length, 1); assert.equal(tokens(game)[0].name, 'V8 Copies Self Death');
  assert.equal(tokens(game)[0].hasSub('Spirit'), true); assert.equal(tokens(game)[0].power, 1);
});

test('v8 copies a granted self-exile trigger belongs to the permanent, not the original sorcery', async () => {
  const ctx = context(), {game, a, b} = ctx; put(game, b, creature('Copied Exile Host'));
  await cast(ctx, 'Granted Exile'); const copy = tokens(game)[0];
  await game.emit('endStep', {player: a}); await game.flushTriggers(); assert.equal(game.stack.length, 1);
  await settle(game); assert.equal(copy.zone, 'ceased');
});

for (const role of ['human', 'ai']) test(`Esix ${role}: the first token event is consumed even without another creature`, async () => {
  const ctx = context(role), {game, a, b} = ctx, esix = put(game, a, 'Esix, Fractal Bloom');
  const first = await game.makeTokens('clue', a);
  assert.equal(first[0].name, 'Clue Token'); assert.equal(esix.meta._esixTurn, game.turnNo);
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'esixCopy').length, 0);
  const model = put(game, b, creature('Esix Later Model'));
  const second = await game.makeTokens('clue', a);
  assert.equal(second[0].name, 'Clue Token', 'a later legal model does not reopen the first creation event');
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'esixCopy').length, 0);
  game.turnNo++;
  const nextTurn = await game.makeTokens('clue', a);
  assert.equal(nextTurn[0].name, model.name); assert.equal(esix.meta._esixTurn, game.turnNo);
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'esixCopy').length, 1);
});

test('Esix ignores zero-token events and token creation outside its controller turn', async () => {
  const ctx = context(), {game, a, b} = ctx, esix = put(game, a, 'Esix, Fractal Bloom');
  const model = put(game, b, creature('Esix Positive Model'));
  assert.equal((await game.makeTokens('clue', a, {n: 0})).length, 0);
  assert.equal(esix.meta._esixTurn, undefined);
  game.turnPlayer = b;
  assert.equal((await game.makeTokens('clue', a))[0].name, 'Clue Token');
  assert.equal(esix.meta._esixTurn, undefined);
  game.turnPlayer = a; game.turnNo++;
  assert.equal((await game.makeTokens('clue', a))[0].name, model.name);
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'esixCopy').length, 1);
});

test('Esix declining the first optional copy consumes the event for that turn', async () => {
  const ctx = context(), {game, a, b} = ctx, esix = put(game, a, 'Esix, Fractal Bloom');
  put(game, b, creature('Esix Declined Model')); ctx.state.cards = () => [];
  assert.equal((await game.makeTokens('clue', a))[0].name, 'Clue Token');
  assert.equal(esix.meta._esixTurn, game.turnNo);
  delete ctx.state.cards;
  assert.equal((await game.makeTokens('clue', a))[0].name, 'Clue Token');
  assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'esixCopy').length, 1);
});

test('v8 copies haste until your next turn applies to the new token and ends at that turn', async () => {
  const ctx = context(), {game, a, b} = ctx;
  const model = put(game, a, creature('Until Next Exiled Model'), 'graveyard');
  for (const player of game.players) for (let n = 0; n < 4; n++) put(game, player, 'Forest', 'library');
  await cast(ctx, 'Until Next');
  const copy = tokens(game)[0]; assert.equal(model.zone, 'exile'); assert.equal(copy.power, 1); assert.equal(copy.kw('haste'), true);
  const again = (await game.copyPermanentToken(copy, a))[0]; assert.equal(again.kw('haste'), false, 'temporary haste is not a copiable value');
  game.mainPhase = async () => {}; game.combatPhase = async () => {};
  game.turnPlayer = b; await game.runTurn(); assert.equal(copy.kw('haste'), true, 'opponent turn does not expire the grant');
  game.turnPlayer = a; await game.runTurn(); assert.equal(copy.kw('haste'), false, 'the next own turn expires the grant');
});
