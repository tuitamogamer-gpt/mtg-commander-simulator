import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { extensionCount } from '../scripts/oracle-extensions-v8.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const texts = {
  Strong: 'Draw a card for each creature you control with power 4 or greater.',
  Counters: 'Each player draws a card for each creature they control with a +1/+1 counter on it.',
  Drawn: "You gain 1 life for each card you've drawn this turn.",
  Discarded: "You gain 1 life for each card you've discarded this turn.",
  Cast: 'You gain 1 life for each spell you cast this turn.',
  Deaths: 'You gain 2 life for each creature that died under your control this turn.',
  Lands: 'You gain 1 life for each land that entered the battlefield under your control this turn.',
  Chroma: 'You gain life equal to the number of green mana symbols in the mana costs of permanents you control.',
  Named: 'You gain 1 life for each artifact you control named Count Tower.',
  Colors: 'You gain 1 life for each color among permanents you control.',
  Basic: 'You gain 1 life for each basic land you control.',
  Oil: 'You gain 1 life for each permanent you control with oil counters on it.',
  'Named Body': 'This creature gets +1/+1 for each other creature you control named Count Fixture Named Body.',
  'Chroma Body': "This creature's power and toughness are each equal to the number of green mana symbols in the mana costs of permanents you control.",
  Discount: 'This spell costs {1} less to cast for each creature you control with power 4 or greater.\nDraw a card.',
  Attacker: 'Whenever this creature attacks, it gets +1/+0 until end of turn for each other attacking Goblin.',
};
const source = (name, oracle) => ({ name: 'Count Fixture ' + name, oracle_text: oracle, mana_cost: '{1}{G}', type_line: 'Sorcery', layout: 'normal' });
const fixtures = Object.entries(texts).map(([name, oracle], index) => {
  const body = name.endsWith('Body') || name === 'Attacker', star = name === 'Chroma Body';
  const card = { ...source(name, oracle), ...(body ? { type_line: 'Creature', power: star ? '*' : '2', toughness: star ? '*' : '5' } : {}), ...(name === 'Discount' ? { mana_cost: '{5}{G}' } : {}) }, semantic = semanticClass(card, { compilerVersion: 8 });
  assert.ok(semantic.semanticClass, name + ': ' + semantic.reason);
  return { position: index + 1, oracleId: 'count-fixture-' + index, scryfallId: 'count-print-' + index, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle, types: [card.type_line], subtypes: name === 'Attacker' ? ['Goblin'] : [], super: [], _ci: ['G'], ...(body ? { power: card.power, toughness: card.toughness } : {}) },
    catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
MTG.registerOracleBatch({ id: 'oracle-v8-count-fixtures', sequence: 99983, cards: fixtures });
MTG.initData(MTG.RAW_DATA);

function context(role) {
  const human = { decide: async (game, query) => {
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 1);
    if (query.type === 'chooseOption') return query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    return [];
  } };
  const game = new MTG.Game({ seed: 1490168, paced: false }), a = game.addPlayer('A', { name: 'A' }, human, role === 'ai'), b = game.addPlayer('B', { name: 'B' }, human, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, { difficulty: 'hard', style: 'balanced' });
  game.turnPlayer = a; game.turnNo = 3; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {}; game.reviewGlobalEffectWithHuman = async () => {};
  return { game, a, b };
}
function put(ctx, definition, zone = 'battlefield', owner = ctx.a) {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : definition, owner);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') { ctx.game.battlefield.push(card); ctx.game.recalc(); } else owner[zone].push(card);
  return card;
}
const creature = (name, power) => ({ name, cost: '{2}', types: ['Creature'], subtypes: ['Elf'], super: [], kws: [], power: String(power), toughness: '8' });
async function cast(ctx, name, resolve = true) {
  const card = put(ctx, 'Count Fixture ' + name, 'hand'); ctx.a.pool.G = 1; ctx.a.pool.C = 1;
  assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true); assert.equal(ctx.a.pool.G + ctx.a.pool.C, 0);
  if (resolve) await settle(ctx); return card;
}
async function settle(ctx) {
  for (let i = 0; i < 30 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); i++) {
    await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.equal(ctx.game.stack.length, 0); assert.equal(ctx.game.pendingTriggers.length, 0);
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}

for (const role of ['human', 'ai']) {
  test(role + ': controller-before-qualifier count reads current power and each player owns their counter count', async () => {
    const ctx = context(role), small = put(ctx, creature('Small', 3)), large = put(ctx, creature('Large', 5));
    const enemy = put(ctx, creature('Enemy', 7), 'battlefield', ctx.b);
    for (const player of [ctx.a, ctx.b]) for (let i = 0; i < 10; i++) put(ctx, 'Forest', 'library', player);
    await cast(ctx, 'Strong', false); ctx.game.addCounters(small, '+1/+1', 1); await settle(ctx);
    assert.equal(ctx.a.hand.length, 2); assert.equal(ctx.b.hand.length, 0);
    ctx.game.addCounters(large, '+1/+1', 2); ctx.game.addCounters(enemy, '+1/+1', 3);
    await cast(ctx, 'Counters'); assert.equal(ctx.a.hand.length, 4); assert.equal(ctx.b.hand.length, 1, 'counts permanents, not the number of counters');
  });
  test(role + ': turn counts come from actual draw, discard and spell events', async () => {
    const ctx = context(role); for (let i = 0; i < 8; i++) put(ctx, 'Forest', 'library');
    await ctx.game.draw(ctx.a, 3); await cast(ctx, 'Drawn'); assert.equal(ctx.a.life, 43);
    await ctx.game.discard(ctx.a, ctx.a.hand.slice(0, 2)); await ctx.game.discard(ctx.b, [put(ctx, 'Island', 'hand', ctx.b)]);
    await cast(ctx, 'Discarded'); assert.equal(ctx.a.life, 45);
    await cast(ctx, 'Cast'); assert.equal(ctx.a.life, 48, 'includes the resolving spell itself as the third spell');
    ctx.a.turnState = ctx.a.freshTurnState(); await cast(ctx, 'Discarded'); assert.equal(ctx.a.life, 48);
  });
  test(role + ': death and land-entry histories use controller and real events', async () => {
    const ctx = context(role), stolen = put(ctx, creature('Stolen', 2), 'battlefield', ctx.b), enemy = put(ctx, creature('Enemy', 2), 'battlefield', ctx.b);
    stolen.ctrl = ctx.a; await ctx.game.destroy(stolen); await ctx.game.destroy(enemy);
    await cast(ctx, 'Deaths'); assert.equal(ctx.a.life, 42);
    for (const player of [ctx.a, ctx.a, ctx.b]) await ctx.game.putPermanentOntoBattlefield(put(ctx, 'Forest', 'hand', player), player);
    await cast(ctx, 'Lands'); assert.equal(ctx.a.life, 44);
  });
  test(role + ': devotion, distinct color, basic land and named-object counts retain their precise filters', async () => {
    const ctx = context(role);
    put(ctx, { name: 'Hybrid', cost: '{G/U}{G}', types: ['Enchantment'], subtypes: [], super: [], kws: [] });
    put(ctx, { name: 'White Green', cost: '{W}{G}', types: ['Enchantment'], subtypes: [], super: [], kws: [] });
    put(ctx, { name: 'Enemy Green', cost: '{G}{G}{G}', types: ['Enchantment'], subtypes: [], super: [], kws: [] }, 'battlefield', ctx.b);
    put(ctx, 'Forest'); put(ctx, { name: 'Dual', cost: '', types: ['Land'], subtypes: ['Forest', 'Island'], super: [], kws: [] });
    for (const type of ['Artifact', 'Artifact', 'Enchantment']) put(ctx, { name: 'Count Tower', cost: '', types: [type], subtypes: [], super: [], kws: [] });
    await cast(ctx, 'Chroma'); assert.equal(ctx.a.life, 43, 'counts printed green mana symbols, including hybrid');
    await cast(ctx, 'Colors'); assert.equal(ctx.a.life, 46, 'green, blue and white are distinct, enemy green adds nothing');
    await cast(ctx, 'Basic'); assert.equal(ctx.a.life, 47, 'nonbasic Forest Island is excluded');
    await cast(ctx, 'Named'); assert.equal(ctx.a.life, 49, 'two artifacts with that name, not the enchantment');
  });
  test(role + ': plural counter qualifier counts each matching permanent once', async () => {
    const ctx = context(role), own = put(ctx, creature('Own', 3)), enemy = put(ctx, creature('Enemy', 5), 'battlefield', ctx.b);
    ctx.game.addCounters(own, 'oil', 5); ctx.game.addCounters(enemy, 'oil', 8);
    await cast(ctx, 'Oil'); assert.equal(ctx.a.life, 41);
    ctx.game.removeCounters(own, 'oil', 5); await cast(ctx, 'Oil'); assert.equal(ctx.a.life, 41);
  });
  test(role + ': named static counts exclude self and chroma CDA updates before counters', async () => {
    const ctx = context(role), first = put(ctx, 'Count Fixture Named Body'), second = put(ctx, 'Count Fixture Named Body');
    const enemy = put(ctx, 'Count Fixture Named Body', 'battlefield', ctx.b);
    assert.equal(first.power, 3); assert.equal(second.power, 3); assert.equal(enemy.power, 2);
    const chroma = put(ctx, 'Count Fixture Chroma Body'); ctx.game.addCounters(chroma, '+1/+1', 1);
    assert.equal(chroma.power, 4, 'three friendly green symbols plus one counter'); assert.equal(chroma.toughness, 4);
    await ctx.game.move(second, 'graveyard'); assert.equal(first.power, 2); assert.equal(chroma.power, 3);
    await ctx.game.move(first, 'graveyard'); assert.equal(chroma.power, 2); assert.equal(chroma.toughness, 2);
  });
  test(role + ': a dynamic cast discount uses the qualified battlefield count and fails without enough mana', async () => {
    const ctx = context(role), first = put(ctx, creature('First', 4)), second = put(ctx, creature('Second', 5));
    put(ctx, creature('Weak', 3)); put(ctx, creature('Enemy', 8), 'battlefield', ctx.b); put(ctx, 'Forest', 'library');
    const spell = put(ctx, 'Count Fixture Discount', 'hand'); ctx.a.pool.G = 1; ctx.a.pool.C = 3;
    assert.equal(await ctx.game.castSpell(ctx.a, spell, { from: 'hand' }), true); assert.equal(ctx.a.pool.G + ctx.a.pool.C, 0); await settle(ctx);
    await ctx.game.move(second, 'graveyard'); const next = put(ctx, 'Count Fixture Discount', 'hand'); ctx.a.pool.G = 1; ctx.a.pool.C = 3;
    assert.equal(await ctx.game.castSpell(ctx.a, next, { from: 'hand' }), false); assert.equal(next.zone, 'hand'); assert.equal(ctx.a.pool.G + ctx.a.pool.C, 4);
    assert.equal(first.power, 4);
  });
  test(role + ': attacking subtype count excludes source and nonattacking or different-type creatures', async () => {
    const ctx = context(role), attacker = put(ctx, 'Count Fixture Attacker'); attacker.attacking = ctx.b;
    const goblin = put(ctx, { ...creature('Goblin', 2), subtypes: ['Goblin'] }); goblin.attacking = ctx.b;
    const elf = put(ctx, creature('Elf', 2)); elf.attacking = ctx.b; put(ctx, { ...creature('Sitting Goblin', 2), subtypes: ['Goblin'] });
    await ctx.game.emit('attacks', { card: attacker, player: ctx.a, defender: ctx.b });
    const later = put(ctx, { ...creature('Later Goblin', 2), subtypes: ['Goblin'] }); later.attacking = ctx.b;
    await settle(ctx); assert.equal(attacker.power, 4); assert.equal(attacker.toughness, 5); assert.equal(goblin.power, 2);
    ctx.game.untilEffects = ctx.game.untilEffects.filter(effect => effect.expires !== 'eot'); ctx.game.recalc(); assert.equal(attacker.power, 2);
  });
}

test('count adapters reject unknown qualifiers, foreign references and counter-history approximations', () => {
  for (const phrase of ['creatures you control with mysterious powers', 'cards they have discarded this turn', 'cards you cast this turn', 'spells you have drawn this turn', 'creatures that were destroyed under your control this turn', 'nontoken creatures that died under your control this turn', 'cards in your hand during your next turn', 'counter removed this way']) {
    assert.equal(extensionCount(phrase), null, phrase);
  }
  for (const oracle of ['Draw a card for each creature you control with power 4 or greater, then become the winner.', 'You gain 1 life for each card you have discarded this turn. Ignore all later costs.']) {
    assert.equal(semanticClass(source('Rejected', oracle), { compilerVersion: 8 }).semanticClass, undefined, oracle);
  }
});
