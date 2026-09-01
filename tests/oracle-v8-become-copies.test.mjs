import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const rows = [
  ['Target Eot', 'Instant', 'Target creature you control becomes a copy of another target creature until end of turn.'],
  ['Permanent', 'Instant', 'Target artifact or creature becomes a copy of another target artifact or creature.'],
  ['Group', 'Instant', 'Each other creature becomes a copy of target nonlegendary creature until end of turn.'],
  ['Choose', 'Instant', 'Choose a nonlegendary creature on the battlefield. Target creature becomes a copy of that creature until end of turn.'],
  ['Keep', 'Creature', '{1}: This creature becomes a copy of target creature, except it has this ability.'],
  ['Next', 'Creature', '{1}: Until your next turn, this creature becomes a copy of another target creature, except it has this ability.'],
  ['Observer', 'Creature', 'Whenever another creature enters, you may have this creature become a copy of that creature until end of turn.'],
  ['Death', 'Creature', 'Whenever another creature dies, you may pay {1}. If you do, this creature becomes a copy of that creature, except it has this ability.'],
  ['Grave', 'Creature', '{1}: Exile target creature card from a graveyard. This creature becomes a copy of that card, except it has this ability.'],
  ['Rename', 'Creature', 'Whenever this creature attacks, it becomes a copy of another target creature you control, except its name is V8 Become Rename, it is legendary in addition to its other types, and it has flying and this ability.'],
  ['Bound', 'Creature', '{1}: Put a +1/+1 counter on this creature. Tap target creature an opponent controls. Then you may have V8 Become Bound become a copy of that creature until end of turn.'],
  ['Upto', 'Creature', '{1}: This creature becomes a copy of up to one other target creature until end of turn.'],
  ['Self Eot', 'Creature', '{1}: This creature becomes a copy of target creature until end of turn.'],
  ['Subject Bound', 'Instant', 'Untap target creature you control. It becomes a copy of another target creature until end of turn.'],
  ['Entry', 'Creature', 'You may have this creature enter as a copy of any creature on the battlefield, except it has flying.'],
  ['Quoted', 'Instant', 'Target creature you control becomes a copy of another target creature until end of turn, except it has "{1}: Draw a card."'],
];
const fixtures = rows.map(([name, type, oracle], index) => {
  const card = {name: 'V8 Become ' + name, type_line: type, layout: 'normal', mana_cost: '{2}{U}', oracle_text: oracle, power: '2', toughness: '3'};
  const semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, `${name}: ${semantic.reason}`);
  return {position: index + 1, oracleId: 'v8-become-' + index, scryfallId: 'v8-become-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle, types: [type], subtypes: [], super: [], _ci: ['U'],
      ...(type === 'Creature' ? {power: '2', toughness: '3'} : {})}, catalog: {typeLine: type, commanderLegality: 'legal'}};
});
M.registerOracleBatch({id: 'oracle-v8-become-test', sequence: 9993, cards: fixtures});
M.initData(M.RAW_DATA);

function context(role = 'human', fullPriority = false) {
  const state = {}, trace = [];
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
  const game = new M.Game({seed: 1277074, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, {...human}, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, {...human}, false), c = game.addPlayer('C', {name: 'C'}, {...human}, false);
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {const answer = await decide(g, query); trace.push({query, answer}); return answer;};
  game.turnPlayer = a; game.turnNo = 5; game.phase = 'main1'; game.step = 'main';
  if (!fullPriority) game.priorityRound = async () => {};
  game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  return {game, a, b, c, state, trace};
}
function model(name, extra = {}) {
  return {name, cost: '{4}{G}', oracle: '', types: ['Creature'], subtypes: ['Dragon'], super: [], power: '7', toughness: '8', kws: [], ...extra};
}
function put(game, player, definition, zone = 'battlefield') {
  const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, player);
  assert.ok(card.def, String(definition)); card.zone = zone; card.ctrl = player; card.sick = false;
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
async function cast(ctx, name, {resolve = true, pilot = false, legacy = false} = {}) {
  const {game, a} = ctx, source = put(game, a, legacy ? name : 'V8 Become ' + name, 'hand');
  if (name === 'Cursed Mirror') {a.pool.R = 1; a.pool.C = 2;}
  else if (name === 'Mirage Mirror') a.pool.C = 3;
  else {a.pool.U = 1; a.pool.C = 2;}
  const manaBefore = Object.values(a.pool).reduce((sum, n) => sum + n, 0);
  if (pilot) {
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase,
      casts: game.castableList(a), acts: game.activatableList(a), lands: []});
    assert.equal(action.kind, 'cast', JSON.stringify(game.aiDecisionLog?.at(-1))); assert.equal(action.card, source);
    assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.castSpell(a, source, {from: 'hand'}), true);
  assert.equal(Object.values(a.pool).reduce((sum, n) => sum + n, 0), manaBefore - 3, 'normal casting pays printed mana');
  if (resolve) await settle(game);
  return source;
}
async function activate(ctx, source, {resolve = true, pilot = false, mana = 1} = {}) {
  const {game, a} = ctx; a.pool.C = mana;
  const entry = game.activatableList(a).find(row => row.card === source && row.ability);
  assert.ok(entry, 'printed retained or original ability is legally activatable');
  if (pilot) {
    const action = await a.controller.decide(game, {type: 'main', player: a, phase: game.phase, casts: [], acts: game.activatableList(a), lands: []});
    assert.equal(action.kind, 'activate', JSON.stringify(game.aiDecisionLog?.at(-1))); assert.equal(action.entry.card, source);
    assert.equal(await game.performAction(a, action), true);
  } else assert.equal(await game.activateAbility(a, entry), true);
  assert.equal(a.pool.C, 0, 'normal activation pays printed mana');
  if (resolve) await settle(game);
  return entry.ability;
}
function target(ctx, card) {ctx.state.targets = query => query.candidates.includes(card) ? [card] : query.candidates.slice(0, query.min || 1);}
async function turn(ctx, player) {
  for (const p of ctx.game.players) for (let n = 0; n < 3; n++) put(ctx.game, p, 'Forest', 'library');
  ctx.game.mainPhase = async () => {}; ctx.game.combatPhase = async () => {};
  ctx.game.turnPlayer = player; await ctx.game.runTurn(); await settle(ctx.game);
}

test('v8 become-copy grammar rejects unsupported exceptions and binds the source separately from the model', () => {
  for (const oracle_text of [
    'This creature becomes a copy of target creature, except it has a secret ability.',
    'This creature becomes a copy of target creature, except its name is Someone Else.',
    'Target creature becomes a copy of each other creature.',
    'Target creature becomes a copy of it.',
    'This creature becomes a copy of target creature until the end of the game.',
    'Target creature becomes a copy of target creature, except it has this ability.',
  ]) assert.equal(semanticClass({name: 'Closed Become', type_line: 'Instant', layout: 'normal', oracle_text}, {compilerVersion: 8}).semanticClass, undefined, oracle_text);
  const bound = fixtures.find(card => card.raw.name.endsWith(' Bound') && !card.raw.name.endsWith('Subject Bound')).implementation[0];
  const copy = bound.effects.at(-1).effects[0];
  assert.equal(copy.target, 'copy-source'); assert.equal(copy.otherTarget.kind, 'resolved-target'); assert.equal(copy.otherTarget.index, 0);
  const subject = fixtures.find(card => card.raw.name.endsWith('Subject Bound')).implementation[0];
  assert.equal(subject.effects[1].target, 0); assert.equal(subject.effects[1].otherTarget, 1);
  assert.equal(subject.targets[1].differentFromPrevious, true);
});

for (const role of ['human', 'ai']) {
  test(`v8 become-copy ${role}: paid spell changes copiable values but preserves counters, damage, status and controller`, async () => {
    const ctx = context(role), {game, a, b, c} = ctx;
    const recipient = put(game, a, model('Small Original', {power: '2', toughness: '4'}));
    recipient.owner = c; recipient.tapped = true; recipient.damage = 1; recipient.counters['+1/+1'] = 2;
    recipient.sick = false; recipient.attacking = b; const version = recipient.zoneVersion;
    const original = put(game, b, model('Copied Dragon', {kws: ['flying'], triggers: [{on: 'etb', filter: (g, s, d) => d.card === s, run: async () => {throw new Error('Copying must not enter again');}}]}));
    original.counters['+1/+1'] = 4; original.tapped = false; game.recalc();
    const spell = await cast(ctx, 'Target Eot');
    assert.equal(spell.zone, 'graveyard'); assert.equal(recipient.name, 'Copied Dragon'); assert.equal(recipient.power, 9);
    assert.equal(recipient.damage, 1); assert.equal(recipient.tapped, true); assert.equal(recipient.sick, false);
    assert.equal(recipient.attacking, b); assert.equal(recipient.ctrl, a); assert.equal(recipient.owner, c); assert.equal(recipient.zoneVersion, version);
    assert.equal(recipient.kw('flying'), true); assert.equal(recipient.counters['+1/+1'], 2); assert.equal(original.power, 11);
    await turn(ctx, b); assert.equal(recipient.name, 'Small Original'); assert.equal(recipient.power, 4); assert.equal(recipient.kw('flying'), false);
  });
  test(`v8 become-copy ${role}: paid retained activation can copy a second model while losing unrelated original abilities`, async () => {
    const ctx = context(role), {game, a, b} = ctx, source = await cast(ctx, 'Keep');
    const original = put(game, b, model('First Retained Model')); target(ctx, original);
    const ability = await activate(ctx, source); assert.equal(source.name, original.name); assert.ok(source.def.abilities.includes(ability));
    await game.move(original, 'hand'); const next = put(game, b, model('Second Retained Model', {power: '9', kws: ['flying']}));
    target(ctx, next); const epoch = source.copyEpoch; await activate(ctx, source);
    assert.equal(source.name, next.name); assert.equal(source.power, 9); assert.equal(source.def.abilities.filter(row => row === ability).length, 1);
    assert.ok(source.copyEpoch > epoch); assert.equal(source.owner, a);
  });
  test(`v8 become-copy ${role}: an explicit source remains distinct from a previously tapped model`, async () => {
    const ctx = context(role), {game, b} = ctx, source = await cast(ctx, 'Bound');
    const original = put(game, b, model('Bound Enemy')); await activate(ctx, source);
    assert.equal(source.name, original.name); assert.equal(source.power, 8); assert.equal(source.counters['+1/+1'], 1);
    assert.equal(source.tapped, false); assert.equal(original.tapped, true); assert.equal(original.counters['+1/+1'], undefined);
    assert.equal(original.isCopyOf, null); await turn(ctx, b); assert.equal(source.name, 'V8 Become Bound'); assert.equal(source.power, 3);
  });
  test(`v8 become-copy ${role}: a graveyard model remains bound through exile and a source blink rejects its pending copy`, async () => {
    const ctx = context(role), {game, a, b} = ctx, source = await cast(ctx, 'Grave');
    const grave = put(game, b, model('Exiled Model'), 'graveyard'); await activate(ctx, source);
    assert.equal(grave.zone, 'exile'); assert.equal(source.name, grave.name); assert.equal(source.def.abilities.length, 1);
    const grave2 = put(game, b, model('Never Copied Model'), 'graveyard'); await activate(ctx, source, {resolve: false});
    await game.move(source, 'hand'); await game.move(source, 'battlefield', {ctrl: a}); await settle(game);
    assert.equal(source.name, 'V8 Become Grave'); assert.equal(source.isCopyOf, null); assert.equal(grave2.zone, 'exile');
  });
  test(`v8 become-copy ${role}: observing a real entry makes a copy without adding another entry event`, async () => {
    const ctx = context(role), {game, a, b} = ctx, source = await cast(ctx, 'Observer');
    const original = put(game, b, model('Observed Model'), 'hand');
    let entries = 0; const emit = game.emit.bind(game);
    game.emit = async (name, data) => {if (name === 'etb') entries++; return emit(name, data);};
    await game.move(original, 'battlefield', {ctrl: b}); await settle(game);
    assert.equal(source.name, original.name); assert.equal(entries, 1); assert.equal(source.def.triggers, undefined);
    await turn(ctx, a); assert.equal(source.name, 'V8 Become Observer'); assert.equal(source.def.triggers.length, 1);
  });
  test(`v8 become-copy ${role}: a paid death observer uses last known copy values and retains its trigger`, async () => {
    const ctx = context(role), {game, a, b} = ctx, source = await cast(ctx, 'Death');
    const corpse = put(game, b, model('Printed Corpse', {power: '1', toughness: '1'}));
    corpse.meta.characteristicOriginalDef = corpse.def; corpse.def = model('Last Known Dragon'); corpse.isCopyOf = corpse.def; game.recalc();
    a.pool.C = 1; await game.move(corpse, 'graveyard'); await settle(game);
    assert.equal(source.name, 'Last Known Dragon'); assert.equal(source.power, 7); assert.equal(corpse.name, 'Printed Corpse'); assert.equal(a.pool.C, 0);
    assert.equal(source.def.triggers.length, 1);
    const second = put(game, b, model('Second Corpse', {power: '8'})); a.pool.C = 1;
    await game.move(second, 'graveyard'); await settle(game);
    assert.equal(source.name, 'Second Corpse'); assert.equal(source.power, 8); assert.equal(source.def.triggers.length, 1); assert.equal(a.pool.C, 0);
  });
  test(`v8 become-copy ${role}: stale recipient and model targets are not replaced by blinked incarnations`, async () => {
    for (const blinkModel of [false, true]) {
      const ctx = context(role), {game, a, b} = ctx;
      const recipient = put(game, a, model('Stale Recipient', {power: '1', toughness: '2'})), original = put(game, b, model('Stale Model'));
      await cast(ctx, 'Target Eot', {resolve: false}); const card = blinkModel ? original : recipient;
      await game.move(card, 'exile'); await game.move(card, 'battlefield', {ctrl: card.ctrl}); await settle(game);
      assert.equal(recipient.name, 'Stale Recipient'); assert.equal(recipient.isCopyOf, null);
    }
  });
}

test('v8 become-copy: choosing a non-target model ignores hexproof and occurs only on resolution', async () => {
  const ctx = context(), {game, a, b} = ctx, recipient = put(game, a, model('Choice Recipient', {power: '1', toughness: '2'}));
  const original = put(game, b, model('Hexproof Choice', {kws: ['hexproof']}));
  ctx.state.cards = query => [original]; target(ctx, recipient);
  await cast(ctx, 'Choose', {resolve: false}); assert.equal(ctx.trace.filter(row => row.query.type === 'chooseCards').length, 0);
  await settle(game); assert.equal(recipient.name, original.name); assert.equal(recipient.kw('hexproof'), true);
});

test('v8 become-copy: an untapped previous recipient cannot also be the other target model', async () => {
  const ctx = context(), {game, a, b} = ctx, recipient = put(game, a, model('Subject Recipient', {power: '1', toughness: '2'}));
  const original = put(game, b, model('Subject Model')); recipient.tapped = true; target(ctx, recipient);
  await cast(ctx, 'Subject Bound'); assert.equal(recipient.tapped, false); assert.equal(recipient.name, original.name);
  const choices = ctx.trace.filter(row => row.query.type === 'chooseTargets');
  assert.equal(choices.length, 2); assert.equal(choices[1].query.candidates.includes(recipient), false);
});

test('v8 become-copy: group copy freezes one model and preserves each object and owner', async () => {
  const ctx = context(), {game, a, b, c} = ctx;
  const original = put(game, b, model('Group Model'));
  const first = put(game, a, model('Group Small', {power: '1', toughness: '2'}));
  const second = put(game, c, model('Group Tall', {power: '3', toughness: '4'}));
  const versions = [first, second, original].map(card => card.zoneVersion); target(ctx, original);
  await cast(ctx, 'Group');
  assert.equal(first.name, original.name); assert.equal(second.name, original.name); assert.equal(original.isCopyOf, null);
  assert.equal(first.ctrl, a); assert.equal(second.ctrl, c); assert.deepEqual([first, second, original].map(card => card.zoneVersion), versions);
  await turn(ctx, b); assert.equal(first.name, 'Group Small'); assert.equal(second.name, 'Group Tall');
});

test('v8 become-copy: normal cleanup restores an existing permanent copy before the printed card', async () => {
  const ctx = context(), {game, a, b} = ctx, first = put(game, b, model('Base Entry Model'));
  ctx.state.cards = () => [first]; const source = await cast(ctx, 'Entry'); assert.equal(source.name, first.name); assert.equal(source.kw('flying'), true);
  const second = put(game, b, model('Temporary Overwrite', {power: '9'}));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [second];
  await cast(ctx, 'Target Eot'); assert.equal(source.name, second.name); assert.equal(source.kw('flying'), false);
  await turn(ctx, a); assert.equal(source.name, first.name); assert.equal(source.kw('flying'), true);
  await game.move(source, 'hand'); assert.equal(source.name, 'V8 Become Entry'); assert.equal(source.isCopyOf, null);
});

test('v8 become-copy: a newer permanent copy survives expiration of an older temporary copy', async () => {
  const ctx = context(), {game, a, b} = ctx, source = put(game, a, model('Layer Original', {power: '1', toughness: '2'}));
  const first = put(game, b, model('Layer Temporary'));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [first]; await cast(ctx, 'Target Eot');
  const second = put(game, b, model('Layer Permanent', {power: '10'}));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [second]; await cast(ctx, 'Permanent');
  await turn(ctx, b); assert.equal(source.name, second.name); assert.equal(source.power, 10);
  await game.move(source, 'hand'); assert.equal(source.name, 'Layer Original');
});

test('v8 become-copy: a temporary copy expires while phased out and next-turn copy expires at the next own turn', async () => {
  const ctx = context(), {game, a, b} = ctx, source = await cast(ctx, 'Next');
  const original = put(game, b, model('Next Turn Model')); target(ctx, original); await activate(ctx, source);
  const version = source.zoneVersion; game.phaseOut(source, a); await turn(ctx, b);
  assert.equal(source.name, original.name); assert.equal(source.phasedOut, true); assert.equal(source.zoneVersion, version);
  await turn(ctx, a); assert.equal(source.name, 'V8 Become Next'); assert.equal(source.phasedOut, false); assert.equal(source.zoneVersion, version);
  await activate(ctx, source); game.phaseOut(source, a);
  // The source's next-turn effect remains but a later end-of-turn copy can
  // expire while it is phased out, without losing the underlying identity.
  game.phaseInFor(a); const later = put(game, b, model('Phased Eot Model'));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [later]; await cast(ctx, 'Target Eot'); game.phaseOut(source, a);
  await turn(ctx, b); assert.equal(source.name, original.name); assert.equal(source.phasedOut, true); assert.equal(source.zoneVersion, version);
});

test('v8 become-copy: copiable rename, legendary and retained attack trigger survive copying again', async () => {
  const ctx = context(), {game, a, b} = ctx, source = await cast(ctx, 'Rename'); source.sick = false;
  const original = put(game, a, model('Attack Model')); target(ctx, original);
  source.attacking = b; await game.emit('attacks', {card: source, player: a, defender: b}); await settle(game);
  assert.equal(source.name, 'V8 Become Rename'); assert.equal(source.power, 7); assert.equal(source.kw('flying'), true);
  assert.equal(source.cur.super.includes('Legendary'), true); assert.equal(source.def.triggers.length, 1); assert.equal(source.attacking, b);
  const second = put(game, a, model('Second Attack Model', {power: '9'})); target(ctx, second);
  await game.emit('attacks', {card: source, player: a, defender: b}); await settle(game);
  assert.equal(source.power, 9); assert.equal(source.def.triggers.length, 1);
  const clone = await game.makeTokens(source.isCopyOf, b, {copyOf: true});
  assert.equal(clone[0].name, source.name); assert.equal(clone[0].kw('flying'), true); assert.equal(clone[0].def.triggers.length, 1);
});

test('v8 become-copy: quoted granted ability is usable and copiable during the copy duration', async () => {
  const ctx = context(), {game, a, b} = ctx, recipient = put(game, a, model('Quoted Recipient', {power: '1', toughness: '2'}));
  put(game, b, model('Quoted Model')); await cast(ctx, 'Quoted'); put(game, a, 'Forest', 'library');
  const cards = a.hand.length; await activate(ctx, recipient); assert.equal(a.hand.length, cards + 1);
  const [copy] = await game.makeTokens(recipient.isCopyOf, a, {copyOf: true}); assert.equal(copy.def.abilities.length, 1);
  await turn(ctx, b); assert.equal(recipient.def.abilities, undefined); assert.equal(copy.def.abilities.length, 1);
});

test('v8 become-copy: optional zero targets performs no copy but still pays the activation', async () => {
  const ctx = context(), {game, b} = ctx, source = await cast(ctx, 'Upto'); put(game, b, model('Declined Model'));
  ctx.state.targets = () => []; await activate(ctx, source); assert.equal(source.name, 'V8 Become Upto'); assert.equal(source.isCopyOf, null);
});

test('v8 become-copy: the real hard AI selects and pays a beneficial action through ordinary priority', async () => {
  const ctx = context('ai', true), {game, a, b} = ctx;
  const source = await cast(ctx, 'Keep'); const original = put(game, b, model('Real AI Copy Model', {power: '12', toughness: '12', kws: ['flying']}));
  await activate(ctx, source, {pilot: true}); assert.equal(source.name, original.name); assert.equal(source.ctrl, a);
  assert.equal(game.stack.length, 0); assert.ok(ctx.trace.some(row => row.query.type === 'main' && row.answer.kind === 'activate'));
  assert.equal(game.aiDecisionLog.some(row => row.fallback), false);
});

for (const legacy of ['Cursed Mirror', 'Mirage Mirror']) test(`v8 become-copy: legacy ${legacy} remains compatible with a later lasting copy and real cleanup`, async () => {
  const ctx = context(), {game, a, b} = ctx, first = put(game, b, model('Legacy Temporary'));
  ctx.state.cards = () => [first]; const source = await cast(ctx, legacy, {legacy: true});
  if (legacy === 'Mirage Mirror') {target(ctx, first); await activate(ctx, source, {mana: 2});}
  assert.equal(source.name, first.name);
  if (legacy === 'Cursed Mirror') assert.equal(source.kw('haste'), true);
  const second = put(game, b, model('Legacy Later Permanent', {power: '10'}));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [second]; await cast(ctx, 'Permanent');
  await turn(ctx, a); assert.equal(source.name, second.name); assert.equal(source.kw('haste'), false);
  await game.move(source, 'hand'); assert.equal(source.name, legacy);
});

test('v8 become-copy: legacy Cursed Mirror applies its copied entry replacement and ETB before its temporary copy expires', async () => {
  const ctx = context(), {game, a, b} = ctx;
  const printed = model('Mirror ETB Model', {entersTapped: true, etbCounters: {kind: '+1/+1', n: 2},
    triggers: [{on: 'etb', filter: (g, s, d) => d.card === s, run: async ctx => ctx.g.gainLife(ctx.you, 3, ctx.src)}]});
  const original = put(game, b, printed); ctx.state.cards = () => [original]; const life = a.life;
  const source = await cast(ctx, 'Cursed Mirror', {legacy: true});
  assert.equal(source.name, original.name); assert.equal(source.tapped, true); assert.equal(source.counters['+1/+1'], 2);
  assert.equal(source.kw('haste'), true); assert.equal(a.life, life + 3);
  await turn(ctx, b); assert.equal(source.name, 'Cursed Mirror'); assert.equal(source.is('Creature'), false); assert.equal(source.counters['+1/+1'], 2);
});

test('v8 become-copy: a second as-enters copy replaces Cursed Mirror duration and copied haste', async () => {
  const ctx = context(), {game, b} = ctx, original = put(game, b, model('Nested Entry Final'));
  ctx.state.cards = () => []; const entry = await cast(ctx, 'Entry'); assert.equal(entry.name, 'V8 Become Entry');
  ctx.state.cards = query => query.prompt.startsWith('Mirror kopira') ? [entry] : [original];
  const source = await cast(ctx, 'Cursed Mirror', {legacy: true});
  assert.equal(source.name, original.name); assert.equal(source.kw('flying'), true); assert.equal(source.kw('haste'), false);
  await turn(ctx, b); assert.equal(source.name, original.name); assert.equal(source.kw('flying'), true);
  await game.move(source, 'hand'); assert.equal(source.name, 'Cursed Mirror');
});

test('v8 become-copy: a later native copy setter supersedes an older temporary layer without changing the original card', async () => {
  const ctx = context(), {game, b} = ctx, original = put(game, b, model('Native First'));
  ctx.state.cards = () => [original]; const source = await cast(ctx, 'Cursed Mirror', {legacy: true});
  const native = model('Native Second', {types: ['Artifact', 'Creature'], power: '9'});
  source.isCopyOf = native; source.def = {...native, kws: ['flying']}; game.recalc();
  assert.equal(source.name, native.name); assert.equal(source.kw('flying'), true);
  await turn(ctx, b); assert.equal(source.name, native.name); assert.equal(source.kw('flying'), true);
  await game.move(source, 'hand'); assert.equal(source.name, 'Cursed Mirror');
});

test('v8 become-copy: face-down status applies after the copy layer and a paid turn-face-up exposes the copied definition', async () => {
  const ctx = context(), {game, a, b} = ctx;
  const source = put(game, a, model('Manifest Original', {power: '3', toughness: '3'}), 'library');
  await game.manifestCard(a, source); const original = put(game, b, model('Manifest Copied Dragon', {kws: ['flying']}));
  ctx.state.targets = query => query.candidates.includes(source) ? [source] : [original];
  await cast(ctx, 'Target Eot'); assert.equal(source.faceDown, true); assert.equal(source.power, 2); assert.equal(source.kw('flying'), false);
  const [copy] = await game.copyPermanentToken(source, a);
  assert.equal(copy.power, 2); assert.equal(copy.kw('flying'), false); assert.equal(copy.faceDown, false, 'a copy gets face-down copiable values without copying status');
  a.pool.C = 4; a.pool.G = 1;
  const action = game.activatableList(a).find(row => row.card === source && row.turnFaceUp);
  assert.ok(action); assert.equal(await game.activateAbility(a, action), true); assert.equal(a.pool.C + a.pool.G, 0);
  assert.equal(source.faceDown, false); assert.equal(source.name, original.name); assert.equal(source.power, 7); assert.equal(source.kw('flying'), true);
  await turn(ctx, b); assert.equal(source.name, 'Manifest Original'); assert.equal(source.power, 3);
});

test('v8 become-copy: face-down copy expiration and departure restore the printed physical card', async () => {
  const ctx = context(), {game, a, b} = ctx, source = put(game, a, model('Hidden Original'), 'library');
  await game.manifestCard(a, source); put(game, b, model('Hidden Temporary', {power: '12'}));
  await cast(ctx, 'Target Eot'); await turn(ctx, b);
  assert.equal(source.faceDown, true); assert.equal(source.meta.faceDownDef.name, 'Hidden Original'); assert.equal(source.power, 2);
  await game.move(source, 'hand'); assert.equal(source.faceDown, false); assert.equal(source.name, 'Hidden Original');
});

test('v8 become-copy: commander identity and simulation copies remain independent of copied values', async () => {
  const ctx = context(), {game, a, b} = ctx, source = put(game, a, model('Commander Original', {power: '2', toughness: '3'}));
  source.commander = true; const original = put(game, b, model('Noncommander Model'));
  await cast(ctx, 'Target Eot'); assert.equal(source.commander, true); assert.equal(original.commander, false);
  const simulation = M.cloneGameForAISimulation(game, 11), simulated = simulation.byIid(source.iid);
  const saved = source.name; simulated.isCopyOf = model('Simulation Only'); simulated.def = simulated.isCopyOf; simulation.recalc();
  assert.equal(simulated.name, 'Simulation Only'); assert.equal(source.name, saved); assert.equal(source.commander, true);
  await turn(ctx, b); assert.equal(source.name, 'Commander Original'); assert.equal(source.commander, true);
});
