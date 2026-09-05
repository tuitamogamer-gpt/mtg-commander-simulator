import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
const source = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-land-types-source.json', import.meta.url)));
const M = loadEngine(), colors = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
const entries = source.map((card, i) => {
  const semantic = semanticClass(card), words = card.type_line.split(' — ')[0].split(' ');
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return { position: i + 1, oracleId: card.oracle_id, scryfallId: card.id, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: words.filter(word => !['Legendary', 'Basic', 'Snow', 'World'].includes(word)), super: words.filter(word => ['Legendary', 'Basic', 'Snow', 'World'].includes(word)), subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], power: card.power, toughness: card.toughness, _ci: card.color_identity }, catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
M.registerOracleBatch({ id: 'oracle-land-types-source-tests', sequence: 9994, cards: entries.filter(entry => !M.DEFS[entry.raw.name]) }); M.initData(M.RAW_DATA);
function setup(role) {
  const state = {}, trace = [], human = { decide: async (_g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'chooseTargets') return q.candidates.includes(state.target) ? [state.target] : q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    return q.options?.find(option => option.key === 'yes')?.key || q.options?.[0]?.key;
  } };
  const game = new M.Game({ seed: 3056, paced: false }), a = game.addPlayer('You', {}, human, role === 'ai'), b = game.addPlayer('Opponent', {}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller); a.controller.decide = async (g, q) => { const result = await decide(g, q); trace.push({ q, result }); return result; };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main'; game.priorityRound = async () => {}; game.revealToHuman = async () => {};
  const put = (name, player = a, zone = 'battlefield') => { const card = new M.CardInst(M.DEFS[name], player); card.zone = zone; card.sick = false; if (zone === 'battlefield') { game.battlefield.push(card); game.recalc(); } else player[zone].push(card); return card; };
  for (const player of [a, b]) for (let n = 0; n < 20; n++) put('Forest', player, 'library');
  return { game, a, b, state, trace, put };
}
async function settle(ctx) {
  for (let n = 0; n < 40 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); n++) { await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop(); }
  assert.equal(ctx.game.stack.length + ctx.game.pendingTriggers.length, 0); assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, player = ctx.a) {
  const card = ctx.put(name, player, 'hand'); for (const color of Object.values(colors).concat('C')) player.pool[color] = 20;
  if (card.is('Land')) assert.equal(await ctx.game.playLand(player, card), true);
  else { assert.equal(await ctx.game.castSpell(player, card, { from: 'hand' }), true, name); await settle(ctx); }
  for (const color of Object.keys(player.pool)) player.pool[color] = 0;
  return card;
}
async function payWith(ctx, land, type) {
  const color = colors[type], names = { W: 'Swords to Plowshares', U: 'Ponder', B: 'Dark Ritual', R: 'Lightning Bolt', G: 'Llanowar Elves' };
  for (const permanent of ctx.game.bf()) if (permanent.ctrl === ctx.a) permanent.tapped = permanent !== land;
  const spell = ctx.put(names[color], ctx.a, 'hand'), enemy = ctx.put('Grizzly Bears', ctx.b); ctx.state.target = enemy;
  assert.equal(await ctx.game.castSpell(ctx.a, spell, { from: 'hand' }), true, land.name + ': actual automatic payment for ' + color);
  assert.equal(land.tapped, true); assert.ok(spell.meta._payColors.includes(color)); await settle(ctx);
  for (const key of Object.keys(ctx.a.pool)) ctx.a.pool[key] = 0;
}
for (const role of ['human', 'ai']) {
  for (const entry of entries) test(`${role}: ${entry.raw.name} adds every printed land type with real colored payment and restores on departure`, async () => {
    const ctx = setup(role), { game, a, b, put, state } = ctx, land = put("Mishra's Factory"), enemy = put('Forest', b);
    const printed = M.DEFS["Mishra's Factory"]; state.target = land;
    const library = a.library.length, card = await cast(ctx, entry.raw.name), operation = entry.implementation.find(row => row.kind === 'v8-land-types');
    assert.equal(card.zone, 'battlefield');
    if (operation.attached) { assert.equal(card.attachedTo, land.iid); assert.equal(a.library.length, library - 1); }
    for (const type of operation.types) {
      assert.equal(land.hasSub(type), true); assert.equal(land.is('Land'), true); assert.equal(land.cur.super.includes('Basic'), false);
      await payWith(ctx, land, type);
    }
    assert.equal(land.def, printed); assert.equal(land.cur.abilitiesDisabled, false);
    land.tapped = false;
    assert.ok(game.activatableList(a).some(row => row.card === land && !row.manaAbility), 'Factory retains its printed animation ability');
    assert.ok(game.manaSources(a).some(row => row.card === land && row.produce.some(option => option.C === 1)), 'Factory keeps its old colorless mana');
    const global = operation.filters?.[0].controller === 'any';
    for (const type of operation.types) if (type !== 'Forest') assert.equal(enemy.hasSub(type), !!global, 'printed controller scope');
    assert.equal(enemy.hasSub('Forest'), true);
    const later = put('Wastes'); for (const type of operation.types) assert.equal(later.hasSub(type), !operation.attached, 'later entrants see active global effect');
    if (entry.raw.name === 'Swampbenders') assert.equal(card.power, game.bf().filter(permanent => permanent.hasSub('Swamp')).length, 'CDA sees changed land types');
    game.phaseOut(card, a); for (const type of operation.types) assert.equal(land.hasSub(type), false);
    game.phaseInFor(a); for (const type of operation.types) assert.equal(land.hasSub(type), true);
    await game.move(card, 'graveyard'); for (const type of operation.types) assert.equal(land.hasSub(type), false);
    assert.equal(game.manaSources(a).filter(row => row.card === land).some(row => row.produce.some(option => Object.keys(option).some(color => color !== 'C'))), false);
  });
  test(`${role}: Dryad's whole card grants one extra actual land play and losing the Dryad removes that permission`, async () => {
    const ctx = setup(role), { game, a, put } = ctx; const dryad = await cast(ctx, 'Dryad of the Ilysian Grove');
    const one = put('Forest', a, 'hand'), two = put('Island', a, 'hand'), three = put('Mountain', a, 'hand');
    assert.equal(await game.playLand(a, one), true); assert.equal(await game.playLand(a, two), true); assert.equal(await game.playLand(a, three), false);
    await game.move(dryad, 'graveyard'); assert.equal(await game.playLand(a, three), false);
  });
  test(`${role}: basic-land intrinsic mana is removed in layer six even when the additive source is newer, and later external grants survive`, async () => {
    const ctx = setup(role), { game, a, b, state, put } = ctx, land = put("Mishra's Factory");
    a.pool.C = 1; const animation = game.activatableList(a).find(row => row.card === land && !row.manaAbility && row.ability?.label.includes('2/2'));
    assert.ok(animation); assert.equal(await game.activateAbility(a, animation), true); await settle(ctx); assert.equal(land.is('Creature'), true);
    state.target = land; await cast(ctx, 'Turn to Frog', b); assert.equal(land.cur.abilitiesDisabled, true);
    const omen = await cast(ctx, 'Prismatic Omen'); land.sick = false; land.tapped = false;
    assert.equal(land.hasSub('Swamp'), true); assert.equal(game.manaSources(a).some(row => row.card === land), false, 'newer land types do not re-grant an ability in layer six');
    state.target = land; await cast(ctx, 'Karametra\'s Favor'); land.tapped = false;
    assert.ok(game.manaSources(a).some(row => row.card === land), 'a later explicitly granted mana ability survives Turn to Frog');
    await game.move(omen, 'graveyard'); assert.ok(game.manaSources(a).some(row => row.card === land));
  });
  test(`${role}: Stormtide attack legality reads flying and islandwalk after every keyword layer`, async () => {
    const ctx = setup(role), { game, a, b, put, state } = ctx, bear = put('Grizzly Bears'), flyer = put('Shivan Dragon');
    put('Forest', b); const leviathan = await cast(ctx, 'Stormtide Leviathan'); leviathan.sick = false;
    assert.equal(game.canAttackAtAll(bear), false); assert.equal(game.canAttackAtAll(flyer), true); assert.equal(game.canAttackAtAll(leviathan), true);
    game.addCounters(bear, 'flying', 1); assert.equal(game.canAttackAtAll(bear), true);
    game.removeCounters(bear, 'flying', 1); assert.equal(game.canAttackAtAll(bear), false);
    M.E.pumpUntilEOT(game, bear, 0, 0, ['flying']); assert.equal(game.canAttackAtAll(bear), true);
    state.target = bear; await cast(ctx, 'Turn to Frog', b); assert.equal(game.canAttackAtAll(bear), false);
    await game.move(leviathan, 'graveyard'); assert.equal(game.canAttackAtAll(bear), true);
  });
}

test('printed basic and dual land mana is not duplicated by intrinsic type derivation', () => {
  const { game, a, put } = setup('human'), basic = put('Forest'), dual = put('Temple Garden');
  assert.equal(game.manaSources(a).filter(row => row.card === basic).length, 1); assert.equal(game.manaSources(a).filter(row => row.card === dual).length, 1);
});
