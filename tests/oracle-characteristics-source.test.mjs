import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
const source = JSON.parse(readFileSync(new URL('./fixtures/oracle-characteristics-source.json', import.meta.url)));
const MTG = loadEngine();
const entries = source.map((card, i) => {
  const semantic = semanticClass(card), words = card.type_line.split(' — ')[0].split(' ');
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return { position: i + 1, oracleId: card.oracle_id, scryfallId: card.id, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: words.filter(word => !['Legendary', 'Basic', 'Snow', 'World'].includes(word)), super: words.filter(word => ['Legendary', 'Basic', 'Snow', 'World'].includes(word)), subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], power: card.power, toughness: card.toughness, _ci: card.color_identity },
    catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
MTG.registerOracleBatch({ id: 'oracle-characteristics-source-tests', sequence: 9995, cards: entries.filter(entry => !MTG.DEFS[entry.raw.name]) });
MTG.initData(MTG.RAW_DATA);
const same = (a, b) => assert.deepEqual([...a].sort(), [...b].sort());
function put(ctx, name, player = ctx.a, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, player);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') { ctx.game.battlefield.push(card); ctx.game.recalc(); } else player[zone].push(card);
  return card;
}
function setup(role) {
  const state = {}, trace = [], human = { decide: async (_g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.includes(state.target) ? [state.target] : q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(option => option.key === 'yes')?.key || q.options[0]?.key;
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  } };
  const game = new MTG.Game({ seed: 901778, paced: false }), a = game.addPlayer('You', { name: 'Proof' }, human, role === 'ai'), b = game.addPlayer('Opponent', { name: 'Proof' }, human, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, q) => { const result = await decide(g, q); trace.push({ q, result }); return result; };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  const ctx = { game, a, b, state, trace };
  for (const player of [a, b]) for (let i = 0; i < 25; i++) put(ctx, 'Forest', player, 'library');
  return ctx;
}
async function settle(ctx) {
  for (let i = 0; i < 50 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); i++) { await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop(); }
  assert.equal(ctx.game.stack.length + ctx.game.pendingTriggers.length, 0);
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}
function fund(ctx) { for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) ctx.a.pool[color] = 20; }
async function cast(ctx, name) {
  const card = put(ctx, name, ctx.a, 'hand'); fund(ctx);
  assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true, name + ': actual paid cast');
  assert.ok(Object.values(ctx.a.pool).reduce((a, b) => a + b, 0) < 120, name + ': mana spent');
  await settle(ctx); return card;
}
async function activate(ctx, card, index = 0) {
  fund(ctx); card.sick = false;
  const actions = ctx.game.activatableList(ctx.a).filter(action => action.card === card);
  assert.ok(actions[index], card.name + ': legal action');
  assert.equal(await ctx.game.activateAbility(ctx.a, actions[index]), true);
  await settle(ctx);
}
async function cleanup(ctx) { ctx.game.mainPhase = async () => {}; ctx.game.combatPhase = async () => {}; await ctx.game.runTurn(); }

for (const role of ['human', 'ai']) {
  test(role + ': printed global color effects apply to later entrants and restore after their source leaves', async () => {
    const ctx = setup(role), bear = put(ctx, 'Grizzly Bears'), sol = put(ctx, 'Sol Ring');
    const dark = await cast(ctx, 'Darkest Hour'); same(bear.colors, ['B']); same(sol.colors, []);
    const elf = put(ctx, 'Llanowar Elves', ctx.b); same(elf.colors, ['B']);
    const lens = await cast(ctx, 'Thran Lens'); same(bear.colors, []); same(elf.colors, []);
    await ctx.game.move(lens, 'graveyard'); same(bear.colors, ['B']);
    await ctx.game.move(dark, 'graveyard'); same(bear.colors, ['G']); same(elf.colors, ['G']);
  });
  test(role + ': Hivestone, Ghostflame Sliver and Dralnu use live types without replacing prior creature types', async () => {
    const ctx = setup(role), elf = put(ctx, 'Llanowar Elves'), enemy = put(ctx, 'Grizzly Bears', ctx.b);
    const hive = await cast(ctx, 'Hivestone'); assert.equal(elf.hasSub('Sliver'), true); assert.equal(elf.hasSub('Elf'), true); assert.equal(enemy.hasSub('Sliver'), false);
    await cast(ctx, 'Ghostflame Sliver'); same(elf.colors, []); same(enemy.colors, ['G']);
    await ctx.game.move(hive, 'graveyard'); same(elf.colors, ['G']); assert.equal(elf.hasSub('Sliver'), false);
    const goblin = put(ctx, { name: 'Printed Goblin proof', types: ['Creature'], subtypes: ['Goblin'], cost: '{R}', power: '2', toughness: '3' }, ctx.b);
    await cast(ctx, "Dralnu's Crusade"); same(goblin.colors, ['B']); assert.equal(goblin.hasSub('Zombie'), true); assert.equal(goblin.hasSub('Goblin'), true); assert.equal(goblin.power, 3); assert.equal(goblin.toughness, 4);
  });
  for (const [name, color, effect] of [['Viridescent Wisps', 'G', 'pump'], ['Crimson Wisps', 'R', 'haste'], ['Aphotic Wisps', 'B', 'fear'], ['Cerulean Wisps', 'U', 'untap'], ['Niveous Wisps', 'W', 'tap']]) {
    test(role + ': ' + name + ' binds color and its useful effect to one target, draws, then expires', async () => {
      const ctx = setup(role), own = put(ctx, 'Grizzly Bears'), enemy = put(ctx, 'Shivan Dragon', ctx.b);
      if (effect === 'untap') own.tapped = enemy.tapped = true;
      ctx.state.target = effect === 'tap' ? enemy : own;
      const library = ctx.a.library.length;
      await cast(ctx, name);
      const queries = ctx.trace.filter(row => row.q.type === 'chooseTargets'); assert.equal(queries.length, 1);
      const chosen = queries[0].result[0]; assert.equal(chosen === ctx.state.target, true, 'actual controller chooses helpful/hostile target');
      same(chosen.colors, [color]); assert.equal(ctx.a.library.length, library - 1);
      if (effect === 'tap' || effect === 'untap') assert.equal(chosen.tapped, effect === 'tap');
      else if (effect === 'pump') assert.equal(chosen.power, 3);
      else assert.equal(chosen.kw(effect), true);
      await cleanup(ctx); same(chosen.colors, chosen === enemy ? ['R'] : ['G']);
      if (effect === 'pump') assert.equal(chosen.power, 2);
      if (effect === 'haste' || effect === 'fear') assert.equal(chosen.kw(effect), false);
    });
  }
  test(role + ': Myr Landshaper adds Artifact without animating a land or losing mana, and blink clears it', async () => {
    const ctx = setup(role), land = put(ctx, 'Forest'); ctx.state.target = land;
    const source = await cast(ctx, 'Myr Landshaper'); await activate(ctx, source);
    assert.equal(land.is('Artifact'), true); assert.equal(land.is('Land'), true); assert.equal(land.is('Creature'), false); assert.equal(land.hasSub('Forest'), true);
    assert.ok(ctx.game.manaSources(ctx.a, null).some(ability => ability.card === land));
    await ctx.game.move(land, 'hand'); await ctx.game.putPermanentOntoBattlefield(land, ctx.a);
    assert.equal(land.is('Artifact'), false); assert.equal(land.is('Land'), true);
  });
  test(role + ': Scrapbasket keeps stats, counters, subtypes and abilities when it becomes all five colors', async () => {
    const ctx = setup(role), basket = await cast(ctx, 'Scrapbasket'); ctx.game.addCounters(basket, '+1/+1', 2);
    const power = basket.power, toughness = basket.toughness; await activate(ctx, basket);
    same(basket.colors, ['W', 'U', 'B', 'R', 'G']); assert.equal(basket.power, power); assert.equal(basket.toughness, toughness); assert.equal(basket.hasSub('Scarecrow'), true); assert.equal(basket.is('Artifact'), true);
    await cleanup(ctx); same(basket.colors, []); assert.equal(basket.counters['+1/+1'], 2);
  });
  test(role + ': Ursine Champion replaces both creature types, keeps counters, obeys one activation each turn, and expires', async () => {
    const ctx = setup(role), card = await cast(ctx, 'Ursine Champion'); ctx.game.addCounters(card, '+1/+1', 1);
    await activate(ctx, card); same(card.cur.subtypes, ['Bear', 'Berserker']); assert.equal(card.hasSub('Human'), false);
    assert.equal(card.power, 6); assert.equal(card.toughness, 6); assert.equal(card.counters['+1/+1'], 1);
    assert.equal(ctx.game.activatableList(ctx.a).some(action => action.card === card), false);
    await cleanup(ctx); same(card.cur.subtypes, ['Human', 'Berserker']); assert.equal(card.power, 3);
  });
  test(role + ': Wishful Merfolk can attack after losing defender; both effects expire together', async () => {
    const ctx = setup(role), card = await cast(ctx, 'Wishful Merfolk'); card.sick = false;
    assert.equal(ctx.game.canAttackAtAll(card), false); await activate(ctx, card);
    assert.equal(card.kw('defender'), false); same(card.cur.subtypes, ['Human']); assert.equal(ctx.game.canAttackAtAll(card), true);
    assert.equal(card.power, 3); assert.equal(card.toughness, 2);
    await cleanup(ctx); assert.equal(card.kw('defender'), true); same(card.cur.subtypes, ['Merfolk']);
  });
  test(role + ': Mild-Mannered Librarian changes persist through cleanup but blink restores its types and activation', async () => {
    const ctx = setup(role), card = await cast(ctx, 'Mild-Mannered Librarian'), oldLibrary = ctx.a.library.length;
    await activate(ctx, card); same(card.cur.subtypes, ['Werewolf']); assert.equal(card.power, 3); assert.equal(card.counters['+1/+1'], 2);
    assert.equal(ctx.a.library.length, oldLibrary - 1); assert.equal(ctx.game.activatableList(ctx.a).some(action => action.card === card), false);
    await cleanup(ctx); same(card.cur.subtypes, ['Werewolf']);
    await ctx.game.move(card, 'exile'); await ctx.game.putPermanentOntoBattlefield(card, ctx.a); fund(ctx);
    same(card.cur.subtypes, ['Human']); assert.equal(card.counters['+1/+1'] || 0, 0);
    assert.equal(ctx.game.activatableList(ctx.a).some(action => action.card === card), true);
  });
  test(role + ': Enter the Avatar State adds Avatar and four useful keywords to one selected creature then restores it', async () => {
    const ctx = setup(role), card = put(ctx, 'Llanowar Elves'); ctx.state.target = card;
    await cast(ctx, 'Enter the Avatar State'); same(card.cur.subtypes, ['Elf', 'Druid', 'Avatar']);
    for (const keyword of ['flying', 'first strike', 'lifelink', 'hexproof']) assert.equal(card.kw(keyword), true);
    assert.equal(card.power, 1); assert.equal(card.toughness, 1); same(card.colors, ['G']);
    await cleanup(ctx); same(card.cur.subtypes, ['Elf', 'Druid']);
    for (const keyword of ['flying', 'first strike', 'lifelink', 'hexproof']) assert.equal(card.kw(keyword), false);
  });
  test(role + ': Memnarch artifact addition lasts through cleanup and ends for a new incarnation', async () => {
    const ctx = setup(role), source = await cast(ctx, 'Memnarch'), land = put(ctx, 'Forest', ctx.b); ctx.state.target = land;
    await activate(ctx, source, 0);
    const card = ctx.trace.filter(row => row.q.type === 'chooseTargets').at(-1).result[0];
    assert.equal(card.is('Artifact'), true); assert.ok(ctx.game.untilEffects.some(row => row.kind === 'oracleAnimation' && row.iid === card.iid && row.expires === 'object'));
    await cleanup(ctx); assert.equal(card.is('Artifact'), true);
    const oldZoneVersion = card.zoneVersion; await ctx.game.move(card, 'exile'); await ctx.game.putPermanentOntoBattlefield(card, card.owner);
    assert.ok(card.zoneVersion > oldZoneVersion); assert.equal(card.is('Artifact'), card.def.types.includes('Artifact'));
  });
  test(role + ': Tyrite Sanctum retains the God addition after cleanup, then sacrifices for a real indestructible counter', async () => {
    const ctx = setup(role), land = put(ctx, 'Tyrite Sanctum'), god = put(ctx, 'The Sixth Doctor'); ctx.state.target = god;
    await activate(ctx, land, 0); assert.equal(god.hasSub('God'), true); assert.equal(god.hasSub('Time Lord'), true); assert.equal(god.hasSub('Doctor'), true); assert.equal(god.counters['+1/+1'], 1);
    await cleanup(ctx); assert.equal(god.hasSub('God'), true); land.tapped = false;
    await activate(ctx, land, 1); assert.equal(land.zone, 'graveyard'); assert.equal(god.counters.indestructible, 1); assert.equal(god.kw('indestructible'), true);
  });
  test(role + ': Boldwyr Intimidator creates actual Cowards and Warriors and checks blocking against their current types', async () => {
    const ctx = setup(role), source = await cast(ctx, 'Boldwyr Intimidator'), enemy = put(ctx, 'Grizzly Bears', ctx.b); ctx.state.target = enemy;
    await activate(ctx, source, 0); const coward = ctx.trace.filter(row => row.q.type === 'chooseTargets').at(-1).result[0]; same(coward.cur.subtypes, ['Coward']);
    const attacker = put(ctx, { ...MTG.DEFS['Grizzly Bears'], name: 'Warrior blocking probe', subtypes: ['Warrior'] }, coward.ctrl === ctx.a ? ctx.b : ctx.a);
    assert.equal(ctx.game.canBlock(coward, attacker), false);
    attacker.def = { ...attacker.def, subtypes: ['Bear'] }; ctx.game.recalc(); assert.equal(ctx.game.canBlock(coward, attacker), true);
    await activate(ctx, source, 1); const warrior = ctx.trace.filter(row => row.q.type === 'chooseTargets').at(-1).result[0]; same(warrior.cur.subtypes, ['Warrior']);
    await cleanup(ctx); same(coward.cur.subtypes, coward.def.subtypes); same(warrior.cur.subtypes, warrior.def.subtypes);
  });
  test(role + ': Stegron discards from hand to add Dinosaur and a temporary pump to one actual target', async () => {
    const ctx = setup(role), card = put(ctx, 'Stegron the Dinosaur Man', ctx.a, 'hand'), target = put(ctx, 'Llanowar Elves'); ctx.state.target = target;
    await activate(ctx, card); assert.equal(card.zone, 'graveyard'); same(target.cur.subtypes, ['Elf', 'Druid', 'Dinosaur']);
    assert.equal(target.power, 4); assert.equal(target.toughness, 2);
    await cleanup(ctx); same(target.cur.subtypes, ['Elf', 'Druid']); assert.equal(target.power, 1); assert.equal(target.toughness, 1);
  });
  test(role + ': Zamriel and Dalakos check real Equipment attachments, controller changes and turn duration', async () => {
    const ctx = setup(role), bear = put(ctx, 'Grizzly Bears'), other = put(ctx, 'Llanowar Elves');
    const zamriel = await cast(ctx, 'Zamriel, Seraph of Steel'); const dalakos = await cast(ctx, 'Dalakos, Crafter of Wonders');
    assert.equal(bear.kw('indestructible'), false); assert.equal(bear.kw('haste'), false);
    const equipment = put(ctx, 'Bonesplitter');
    await ctx.game.attach(equipment, bear);
    assert.equal(bear.kw('indestructible'), true); assert.equal(bear.kw('flying'), true); assert.equal(bear.kw('haste'), true); assert.equal(other.kw('haste'), false);
    ctx.game.phaseOut(equipment, ctx.a); assert.equal(bear.phasedOut, false);
    assert.equal(bear.kw('indestructible'), false); assert.equal(bear.kw('flying'), false); assert.equal(bear.kw('haste'), false);
    assert.equal(ctx.game.snapshot(bear).equipped, false); assert.equal(ctx.game.snapshot(bear).attachedSources.length, 0);
    ctx.game.phaseInFor(ctx.a); assert.equal(bear.kw('indestructible'), true); assert.equal(bear.kw('haste'), true);
    assert.equal(ctx.game.snapshot(bear).equipped, true);
    ctx.game.turnPlayer = ctx.b; ctx.game.recalc(); assert.equal(bear.kw('indestructible'), false); assert.equal(bear.kw('haste'), true);
    ctx.game.turnPlayer = ctx.a; ctx.game.recalc(); await ctx.game.attach(equipment, other);
    assert.equal(bear.kw('haste'), false); assert.equal(other.kw('haste'), true); assert.equal(other.kw('indestructible'), true);
    MTG.OracleV8Control.gain(ctx.game, other, ctx.b); ctx.game.recalc(); assert.equal(other.kw('haste'), false); assert.equal(other.kw('indestructible'), false);
    MTG.OracleV8Control.gain(ctx.game, other, ctx.a); ctx.game.recalc(); await ctx.game.move(equipment, 'graveyard');
    assert.equal(other.kw('haste'), false); assert.equal(other.kw('indestructible'), false);
    assert.equal(zamriel.zone, 'battlefield'); assert.equal(dalakos.zone, 'battlefield');
  });
  test(role + ': a phased-out Aura stops satisfying A Tale for the Ages until that Aura phases in', async () => {
    const ctx = setup(role), bear = put(ctx, 'Grizzly Bears'); ctx.state.target = bear;
    await cast(ctx, 'A Tale for the Ages'); const aura = await cast(ctx, 'Rancor');
    const probe = put(ctx, 'Feast of Dreams', ctx.a, 'hand');
    assert.equal(bear.power, 6); assert.equal(bear.toughness, 4); assert.equal(bear.kw('trample'), true);
    ctx.game.phaseOut(aura, ctx.a); assert.equal(bear.phasedOut, false);
    assert.equal(bear.power, 2); assert.equal(bear.toughness, 2); assert.equal(bear.kw('trample'), false);
    assert.equal(ctx.game.snapshot(bear).enchanted, false); assert.equal(ctx.game.snapshot(bear).attachedSources.length, 0);
    fund(ctx); assert.equal(await ctx.game.castSpell(ctx.a, probe, { from: 'hand' }), false, 'phased-out Aura cannot make this a legal enchanted-creature target');
    ctx.game.phaseInFor(ctx.a); assert.equal(bear.power, 6); assert.equal(bear.toughness, 4); assert.equal(bear.kw('trample'), true);
    assert.equal(ctx.game.snapshot(bear).enchanted, true);
    fund(ctx); assert.equal(await ctx.game.castSpell(ctx.a, probe, { from: 'hand' }), true); await settle(ctx); assert.equal(bear.zone, 'graveyard');
  });
}

test('characteristic grammar rejects unknown tails, mixed durations and non-battlefield type changes', () => {
  for (const oracle_text of ['Target land becomes an artifact until end of turn.', 'Target spell becomes an artifact in addition to its other types until end of turn.', 'Target creature becomes blue and gains haste until your next turn.', 'Target creature becomes blue until end of turn. Untap another creature.']) {
    assert.equal(semanticClass({ name: 'Closed grammar rejection', type_line: 'Instant', mana_cost: '{U}', layout: 'normal', oracle_text }).semanticClass, undefined, oracle_text);
  }
  for (const oracle_text of ['Closed source is all colors.', 'Closed source is a Zombie in addition to its other types.']) assert.equal(semanticClass({ name: 'Closed source', type_line: 'Creature — Human', mana_cost: '{U}', power: '1', toughness: '1', layout: 'normal', oracle_text }).semanticClass, undefined, 'all-zone CDA requires all-zone runtime');
});
