import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const cards = [
  ['Strength', 'Until end of turn, target creature gains trample and gets +X/+X, where X is the number of attacking creatures.'],
  ['Maximum', 'Until end of turn, creatures you control gain trample and get +X/+X, where X is the greatest power among creatures you control.'],
  ['Domain', 'Until end of turn, creatures you control gain trample and get +1/+1 for each basic land type among lands you control.'],
  ['Wheel', 'Discard all the cards in your hand, then draw that many cards.'],
  ['Count Draw', 'Target creature gains trample and gets +X/+0 until end of turn, where X is 1 plus the number of cards named Next Effects Count Draw in your graveyard.\nDraw a card.'],
  ['Source', "Whenever this creature attacks, another target creature you control gains trample and gets +X/+X until end of turn, where X is this creature's power.", 'Creature', 5, 6],
  ['Entry Group', 'When this creature enters, creatures you control gain flying and get +X/+X until end of turn, where X is the number of creatures you control.', 'Creature', 4, 4],
  ['Life Amount', 'Whenever you gain life, you lose that much life.', 'Creature', 1, 5],
  ['Token Amount', 'Whenever you gain life, create that many 1/1 green Insect creature tokens with flying and deathtouch.', 'Creature', 1, 5],
  ['Damage Amount', 'Whenever you gain life, this creature deals that much damage to target opponent.', 'Creature', 1, 5],
  ['Named, Counter Sage', "Whenever this creature attacks, another target creature you control gets +X/+X until end of turn, where X is Next Effects Named's power.", 'Creature', 4, 5],
  ['Named Counters', 'Whenever this creature attacks, another target creature you control gets +X/+X until end of turn, where X is the number of quest counters on Next Effects Named Counters.', 'Creature', 1, 5],
  ['Hunter', 'Until end of turn, target creature gets +3/+3 and gains trample and "Whenever this creature deals combat damage to a player, draw that many cards."'],
  ['Death Buff', 'Until end of turn, target creature gets +2/+0 and gains lifelink and "When this creature dies, return it to the battlefield tapped under its owner\'s control with a +1/+1 counter on it."'],
  ['Attack Grant', 'Until end of turn, target creature gets +1/+1 and gains "Whenever this creature attacks, draw a card."'],
  ['Half Up', 'Target opponent loses half their life, rounded up. You gain life equal to the life lost this way.'],
  ['Third Up', 'Each player loses a third of their life, rounded up. You gain life equal to the total life lost this way.'],
  ['Half Down', 'You lose half your life, rounded down.'],
  ['Life Drain', 'Whenever you gain life, target opponent loses that much life.', 'Creature', 1, 5],
  ['Event Counters', 'Whenever you gain life, put that many +1/+1 counters on another target creature you control.', 'Creature', 1, 5],
  ['Damage Gift', 'Whenever this creature is dealt damage, each opponent gains that much life.', 'Creature', 1, 5],
  ['Color Blue', 'Target creature you control becomes blue until end of turn.'],
  ['Color Add', 'Target creature you control becomes blue in addition to its other colors until end of turn.'],
  ['Colorless', 'Target creature you control becomes colorless until end of turn.'],
  ['Color Choice', 'Any number of target creatures you control become the color of your choice until end of turn.'],
  ['Color Ability', '{T}: Target permanent becomes the color of your choice until end of turn.', 'Creature', 2, 5],
  ['Type Choice', '{1}: This creature becomes the creature type of your choice until end of turn.', 'Creature', 4, 6],
  ['Type Spell', 'Target creature you control becomes the creature type of your choice until end of turn.'],
  ['Type Add', 'Target creature you control becomes the creature type of your choice in addition to its other types until end of turn.'],
  ['Color Buff', 'Target creature you control gets +1/+1 and becomes the color of your choice until end of turn.'],
  ['Color Flying', 'Target creature you control gains flying and becomes blue until end of turn.'],
  ['Color Damage', 'Next Effects Color Damage deals 1 damage to target creature. That creature becomes black until end of turn.'],
  ['Blue Destroy', 'Destroy target blue creature.'],
  ['Type Aura', 'Enchant creature\n{1}: Enchanted creature becomes the creature type of your choice until end of turn.', 'Enchantment — Aura'],
];
function source(name, oracle, type = 'Sorcery', power = 2, toughness = 2) {
  return { name: 'Next Effects ' + name, oracle_text: oracle, mana_cost: '{1}{G}', type_line: type,
    layout: 'normal', ...(type === 'Creature' ? { power: String(power), toughness: String(toughness) } : {}) };
}
const fixtures = cards.map((row, index) => {
  const card = source(...row), semantic = semanticClass(card, { compilerVersion: 8 });
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return { position: index + 1, oracleId: 'next-effects-' + index, scryfallId: 'next-effects-print-' + index, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: card.type_line.split(' — ')[0].split(' '), subtypes: card.type_line.includes(' — ') ? card.type_line.split(' — ')[1].split(' ') : [], super: [], _ci: ['G'],
      ...(card.power ? { power: card.power, toughness: card.toughness } : {}) },
    catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
MTG.registerOracleBatch({ id: 'oracle-v8-next-effects-test', sequence: 99993, cards: fixtures });
MTG.initData(MTG.RAW_DATA);

function model(name, power = 2, toughness = 5) {
  return { name, cost: '{2}', oracle: '', types: ['Creature'], subtypes: [], super: [], power: String(power), toughness: String(toughness), kws: [] };
}
function put(ctx, definition, zone = 'battlefield', player = ctx.a) {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : definition, player);
  card.ctrl = player; card.zone = zone; card.sick = false;
  if (zone === 'battlefield') { ctx.game.battlefield.push(card); ctx.game.recalc(); }
  else player[zone].push(card);
  return card;
}
function context(role) {
  const state = {}, trace = [];
  const human = { decide: async (game, query) => {
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'chooseTargets') return (state.targets ? state.targets.filter(card => query.candidates.includes(card)) : state.target && query.candidates.includes(state.target) ? [state.target] : query.candidates).slice(0, state.targets ? query.count || query.candidates.length : query.min || 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.options.find(option => option.key === state.option)?.key || query.options.find(option => option.key === 'yes')?.key || query.options[0].key;
    if (query.type === 'orderTriggers') return query.triggers;
    return [];
  } };
  const game = new MTG.Game({ seed: 1490168, paced: false });
  const a = game.addPlayer('A', { name: 'A' }, human, role === 'ai');
  const b = game.addPlayer('B', { name: 'B' }, human, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => { const answer = await decide(g, query); trace.push({ query, answer }); return answer; };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  return { game, a, b, state, trace };
}
async function settle(ctx) {
  for (let i = 0; i < 60 && (ctx.game.stack.length || ctx.game.pendingTriggers.length); i++) {
    await ctx.game.flushTriggers(); if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.equal(ctx.game.stack.length, 0); assert.equal(ctx.game.pendingTriggers.length, 0);
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}
async function cast(ctx, name, resolve = true) {
  const card = put(ctx, 'Next Effects ' + name, 'hand');
  ctx.a.pool.G = 1; ctx.a.pool.C = 1;
  assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true);
  assert.equal(ctx.a.pool.G + ctx.a.pool.C, 0);
  if (resolve) await settle(ctx);
  return card;
}
function endTemporary(ctx) {
  ctx.game.untilEffects = ctx.game.untilEffects.filter(effect => effect.expires !== 'eot');
  ctx.game.recalc();
}

for (const role of ['human', 'ai']) {
  test(role + ': keyword-first targeted X reads attackers at resolution and expires', async () => {
    const ctx = context(role), target = put(ctx, model('Target', 3, 8));
    ctx.state.target = target; target.attacking = ctx.b;
    const enemy = put(ctx, model('Enemy', 2, 8), 'battlefield', ctx.b); enemy.attacking = ctx.a;
    await cast(ctx, 'Strength', false);
    const extra = put(ctx, model('Extra', 1, 5)); extra.attacking = ctx.b;
    await settle(ctx);
    const chosen = ctx.trace.find(row => row.query.type === 'chooseTargets').answer[0];
    assert.equal(chosen, target, 'human and local AI choose the friendly attacker');
    assert.equal(target.power, 6); assert.equal(target.toughness, 11); assert.equal(target.kw('trample'), true);
    assert.equal(enemy.power, 2);
    endTemporary(ctx); assert.equal(target.power, 3); assert.equal(target.kw('trample'), false);
  });
  test(role + ': greatest-power group snapshots amount and recipients once', async () => {
    const ctx = context(role), small = put(ctx, model('Small', 2, 3)), large = put(ctx, model('Large', 5, 7));
    const enemy = put(ctx, model('Enemy', 20, 25), 'battlefield', ctx.b);
    await cast(ctx, 'Maximum');
    assert.equal(small.power, 7); assert.equal(small.toughness, 8);
    assert.equal(large.power, 10); assert.equal(large.toughness, 12);
    assert.equal(enemy.power, 20); assert.equal(enemy.kw('trample'), false);
    const late = put(ctx, model('Late', 2, 3)); assert.equal(late.power, 2); assert.equal(late.kw('trample'), false);
    endTemporary(ctx); assert.equal(small.power, 2); assert.equal(large.power, 5);
  });
  test(role + ': domain multiplier applies to every selected creature', async () => {
    const ctx = context(role), small = put(ctx, model('Small', 2, 3)), large = put(ctx, model('Large', 5, 7));
    for (const land of ['Forest', 'Island', 'Mountain', 'Forest']) put(ctx, land);
    await cast(ctx, 'Domain');
    assert.equal(small.power, 5); assert.equal(small.toughness, 6);
    assert.equal(large.power, 8); assert.equal(large.toughness, 10);
    assert.equal(small.kw('trample'), true); assert.equal(large.kw('trample'), true);
  });
  test(role + ': full-hand imperative excludes the spell and draws actual discarded count', async () => {
    const ctx = context(role), discarded = ['Forest', 'Island', 'Mountain'].map(name => put(ctx, name, 'hand'));
    const opponentHand = put(ctx, 'Forest', 'hand', ctx.b);
    for (let i = 0; i < 8; i++) put(ctx, 'Forest', 'library');
    const spell = await cast(ctx, 'Wheel');
    assert.equal(ctx.a.hand.length, 3); assert.equal(ctx.a.library.length, 5);
    assert.equal(discarded.every(card => card.zone === 'graveyard'), true);
    assert.equal(spell.zone, 'graveyard'); assert.equal(ctx.b.hand[0], opponentHand);
    const empty = context(role); for (let i = 0; i < 3; i++) put(empty, 'Forest', 'library');
    await cast(empty, 'Wheel'); assert.equal(empty.a.hand.length, 0); assert.equal(empty.a.library.length, 3);
  });
  test(role + ': dynamic keyword pump keeps following draw and named-grave count', async () => {
    const ctx = context(role), target = put(ctx, model('Target', 2, 5)); ctx.state.target = target;
    put(ctx, 'Next Effects Count Draw', 'graveyard'); put(ctx, 'Next Effects Count Draw', 'graveyard');
    put(ctx, 'Forest', 'library');
    await cast(ctx, 'Count Draw');
    assert.equal(target.power, 5); assert.equal(target.toughness, 5); assert.equal(target.kw('trample'), true);
    assert.equal(ctx.a.hand.length, 1);
  });
  test(role + ': explicit source-stat pump does not read the target power', async () => {
    const ctx = context(role), src = put(ctx, 'Next Effects Source'), target = put(ctx, model('Target', 12, 14)); ctx.state.target = target;
    src.attacking = ctx.b; await ctx.game.emit('attacks', { card: src, player: ctx.a, defender: ctx.b }); await settle(ctx);
    assert.equal(target.power, 17); assert.equal(target.toughness, 19); assert.equal(src.power, 5);
  });
  test(role + ': ETB group count includes source and adds keywords to friendly creatures', async () => {
    const ctx = context(role), other = put(ctx, model('Other', 2, 5)), enemy = put(ctx, model('Enemy', 3, 6), 'battlefield', ctx.b);
    const src = await cast(ctx, 'Entry Group');
    assert.equal(src.power, 6); assert.equal(other.power, 4); assert.equal(other.kw('flying'), true);
    assert.equal(enemy.power, 3); assert.equal(enemy.kw('flying'), false);
  });
  test(role + ': event quantities retain the triggering amount for life, damage and tokens', async () => {
    const ctx = context(role), life = put(ctx, 'Next Effects Life Amount');
    put(ctx, 'Next Effects Token Amount'); put(ctx, 'Next Effects Damage Amount');
    await ctx.game.gainLife(ctx.a, 3, life); await settle(ctx);
    assert.equal(ctx.a.life, 40); assert.equal(ctx.b.life, 37);
    const tokens = ctx.game.bf().filter(card => card.isToken); assert.equal(tokens.length, 3);
    for (const token of tokens) { assert.equal(token.power, 1); assert.equal(token.toughness, 1); assert.equal(token.kw('flying'), true); assert.equal(token.kw('deathtouch'), true); }
  });
  test(role + ': named values refer to the source and preserve counter snapshots', async () => {
    for (const [name, amount] of [['Named, Counter Sage', 4], ['Named Counters', 3]]) {
      const ctx = context(role), src = put(ctx, 'Next Effects ' + name), target = put(ctx, model('Target', 10, 15));
      ctx.state.target = target; ctx.game.addCounters(src, 'quest', 3);
      src.attacking = ctx.b; await ctx.game.emit('attacks', { card: src, player: ctx.a, defender: ctx.b }); await settle(ctx);
      assert.equal(target.power, 10 + amount); assert.equal(target.toughness, 15 + amount);
    }
  });
  test(role + ': mixed pump grants a damage trigger whose controller draws the actual combat damage', async () => {
    const ctx = context(role), target = put(ctx, model('Target', 2, 5)); ctx.state.target = target;
    for (let i = 0; i < 12; i++) put(ctx, 'Forest', 'library');
    await cast(ctx, 'Hunter'); assert.equal(target.power, 5); assert.equal(target.kw('trample'), true);
    await ctx.game.damagePlayer(target, ctx.b, 2, { combat: false }); await settle(ctx); assert.equal(ctx.a.hand.length, 0);
    target.attacking = ctx.b; target.blockedBy = []; target.wasBlocked = false;
    ctx.game.combat = { attackers: [target], player: ctx.a };
    await ctx.game.combatDamage(ctx.a, 'normal'); await settle(ctx); assert.equal(ctx.a.hand.length, 5);
    endTemporary(ctx); assert.equal(target.power, 2); assert.equal(target.kw('trample'), false);
    await ctx.game.combatDamage(ctx.a, 'normal'); await settle(ctx); assert.equal(ctx.a.hand.length, 5);
  });
  test(role + ': granted dies ability returns a stolen card to its owner with entry counters, without retaining the grant', async () => {
    const ctx = context(role), target = put(ctx, model('Stolen', 2, 5), 'battlefield', ctx.b);
    target.ctrl = ctx.a; ctx.game.recalc(); ctx.state.target = target;
    await cast(ctx, 'Death Buff'); assert.equal(target.power, 4); assert.equal(target.kw('lifelink'), true);
    await ctx.game.destroy(target); assert.equal(target.zone, 'graveyard'); await settle(ctx);
    assert.equal(target.zone, 'battlefield'); assert.equal(target.ctrl, ctx.b); assert.equal(target.tapped, true);
    assert.equal(target.counters['+1/+1'], 1); assert.equal(target.power, 3); assert.equal(target.kw('lifelink'), false);
    await ctx.game.destroy(target); await settle(ctx); assert.equal(target.zone, 'graveyard');
  });
  test(role + ': a granted dies trigger cannot return a graveyard card that left and came back', async () => {
    const ctx = context(role), target = put(ctx, model('Target', 2, 5)); ctx.state.target = target;
    await cast(ctx, 'Death Buff'); await ctx.game.destroy(target); await ctx.game.flushTriggers();
    await ctx.game.move(target, 'exile'); await ctx.game.move(target, 'graveyard');
    await settle(ctx); assert.equal(target.zone, 'graveyard');
  });
  test(role + ': a quoted attack trigger has the creature as source and expires with the pump', async () => {
    const ctx = context(role), target = put(ctx, model('Target', 2, 5)); ctx.state.target = target;
    for (let i = 0; i < 3; i++) put(ctx, 'Forest', 'library');
    await cast(ctx, 'Attack Grant'); target.attacking = ctx.b;
    await ctx.game.emit('attacks', { card: target, player: ctx.a, defender: ctx.b }); await settle(ctx);
    assert.equal(ctx.a.hand.length, 1); assert.equal(target.power, 3);
    endTemporary(ctx); await ctx.game.emit('attacks', { card: target, player: ctx.a, defender: ctx.b }); await settle(ctx);
    assert.equal(ctx.a.hand.length, 1); assert.equal(target.power, 2);
  });
  test(role + ': fractional life snapshots each life total and preserves rounded actual loss for following gain', async () => {
    const targeted = context(role); targeted.b.life = 21;
    await cast(targeted, 'Half Up'); assert.equal(targeted.b.life, 10); assert.equal(targeted.a.life, 51);
    const own = context(role); own.a.life = 21;
    await cast(own, 'Half Down'); assert.equal(own.a.life, 11); assert.equal(own.b.life, 40);
    const group = context(role); group.a.life = 40; group.b.life = 20;
    await cast(group, 'Third Up'); assert.equal(group.b.life, 13); assert.equal(group.a.life, 47);
  });
  test(role + ': event amounts reach targeted life loss, targeted counters and opponent life gain', async () => {
    const ctx = context(role), source = put(ctx, 'Next Effects Life Drain');
    put(ctx, 'Next Effects Event Counters'); const target = put(ctx, model('Target', 10, 15)); ctx.state.target = target;
    await ctx.game.gainLife(ctx.a, 3, source); await settle(ctx);
    assert.equal(ctx.a.life, 43); assert.equal(ctx.b.life, 37); assert.equal(target.counters['+1/+1'], 3);
    const gift = put(ctx, 'Next Effects Damage Gift'), enemy = put(ctx, model('Enemy'), 'battlefield', ctx.b);
    await ctx.game.damageCreature(enemy, gift, 2); await settle(ctx);
    assert.equal(ctx.a.life, 43); assert.equal(ctx.b.life, 39);
  });
}

test('new word orders reject missing clauses and unbound event quantities', () => {
  for (const oracle of [
    'You lose that much life.',
    'Create that many 1/1 green Insect creature tokens with flying and deathtouch.',
    'Until end of turn, target creature gains trample and gets +X/+X, where X is a secret number.',
    'Target creature gains trample and gets +2/+2 until end of turn except during combat.',
    'Discard all the cards in your hand, then draw that many cards plus eleven.',
    'Until end of turn, target creature gains trample and gets +X/+X, where X is the number of attacking creatures, and draw a card.',
    'Until end of turn, target creature gets +2/+0 and gains "When this creature dies, return it to the battlefield tapped under its owner\'s control with five poison counters on it."',
    'Until end of turn, target creature gains "Whenever this creature attacks, draw that many cards."',
    'Target opponent loses half your life, rounded up.',
    'Each player loses a third of their life, rounded sideways.',
  ]) assert.equal(semanticClass(source('Reject', oracle), { compilerVersion: 8 }).semanticClass, undefined, oracle);
});

for (const role of ['human', 'ai']) {
  test(role + ': color replacement/addition preserves stats, types and keywords through real cleanup', async () => {
    const ctx = context(role), target = put(ctx, { ...model('Colored Equipment', 4, 6), cost: '{B}{R}', types: ['Artifact', 'Creature'], subtypes: ['Equipment', 'Construct'], kws: ['vigilance'] });
    ctx.state.target = target; ctx.game.addCounters(target, '+1/+1', 1);
    await cast(ctx, 'Color Add'); assert.deepEqual([...target.colors].sort(), ['B', 'R', 'U']);
    await cast(ctx, 'Color Blue'); assert.deepEqual([...target.colors], ['U']);
    assert.equal(target.power, 5); assert.equal(target.toughness, 7); assert.equal(target.kw('vigilance'), true);
    assert.equal(target.is('Artifact'), true); assert.equal(target.hasSub('Equipment'), true); assert.equal(target.hasSub('Construct'), true);
    await cast(ctx, 'Colorless'); assert.deepEqual([...target.colors], []);
    let sawMain = false, sawEnd = false;
    ctx.game.mainPhase = async () => { sawMain = true; assert.deepEqual([...target.colors], []); };
    ctx.game.combatPhase = async () => {};
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => { if (event === 'endStep') { sawEnd = true; assert.deepEqual([...target.colors], []); } return emit(event, data); };
    put(ctx, 'Forest', 'library'); await ctx.game.runTurn();
    assert.equal(sawMain && sawEnd, true); assert.deepEqual([...target.colors], ['B', 'R']);
    assert.equal(target.power, 5); assert.equal(target.kw('vigilance'), true);
    assert.equal(ctx.game.untilEffects.some(effect => effect.kind === 'oracleCharacteristics'), false);
  });
  test(role + ': shared color choice is made once at resolution and applies only to selected live targets', async () => {
    const ctx = context(role), first = put(ctx, model('First')), second = put(ctx, model('Second'));
    put(ctx, { name: 'Green affinity', cost: '{G}', types: ['Enchantment'], subtypes: [], kws: [] });
    ctx.state.targets = [first, second]; ctx.state.option = 'G';
    await cast(ctx, 'Color Choice', false);
    assert.equal(ctx.trace.filter(row => row.query.aiHint?.kind === 'oracleColorChange').length, 0, 'choice is not made while casting');
    const picks = ctx.trace.find(row => row.query.type === 'chooseTargets').answer;
    assert.ok(picks.length > 0, 'human and local AI both select a target for this color change');
    await settle(ctx);
    if (picks.length) {
      const choices = ctx.trace.filter(row => row.query.aiHint?.kind === 'oracleColorChange');
      assert.equal(choices.length, 1); assert.equal(choices[0].answer, 'G');
      for (const card of [first, second]) assert.deepEqual([...card.colors], picks.includes(card) ? ['G'] : []);
    }
    const late = put(ctx, model('Late')); assert.deepEqual([...late.colors], []);
  });
  test(role + ': real tap ability changes color and cannot follow a new battlefield incarnation', async () => {
    const ctx = context(role), ability = put(ctx, 'Next Effects Color Ability'); ctx.state.target = ability; ctx.state.option = 'U';
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === ability); assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true); assert.equal(ability.tapped, true);
    await settle(ctx);
    const selected = ctx.trace.find(row => row.query.aiHint?.kind === 'oracleColorChange').answer;
    assert.deepEqual([...ability.colors], [selected]); assert.equal(ability.power, 2); assert.equal(ability.toughness, 5);
    await ctx.game.move(ability, 'exile'); await ctx.game.putPermanentOntoBattlefield(ability, ctx.a);
    assert.deepEqual([...ability.colors], ['G']); assert.equal(ability.power, 2);
  });
  test(role + ': creature type choice preserves other subtype families and suppresses printed changeling until expiry', async () => {
    const ctx = context(role), original = MTG.DEFS['Next Effects Type Choice'];
    const target = put(ctx, { ...original, types: ['Artifact', 'Creature'], subtypes: ['Equipment', 'Shapeshifter'], kws: ['flying'], changeling: true });
    put(ctx, { name: 'Goblin affinity', cost: '{R}', types: ['Kindred', 'Enchantment'], subtypes: ['Goblin'], kws: [] });
    ctx.state.option = 'Goblin'; ctx.state.target = target; ctx.game.addCounters(target, '+1/+1', 1);
    assert.equal(target.hasSub('Elf'), true);
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === target); assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true); assert.equal(ctx.a.pool.C, 0);
    await settle(ctx);
    assert.equal(target.hasSub('Goblin'), true); assert.equal(target.hasSub('Elf'), false); assert.equal(target.hasSub('Shapeshifter'), false);
    assert.equal(target.hasSub('Equipment'), true); assert.equal(target.is('Artifact'), true); assert.equal(target.kw('flying'), true);
    assert.equal(target.power, 5); assert.equal(target.toughness, 7);
    endTemporary(ctx); assert.equal(target.hasSub('Elf'), true); assert.equal(target.hasSub('Shapeshifter'), true);
  });
  test(role + ': type spell is applied before tribe predicates and respects timestamp replacement versus all-type grants', async () => {
    const ctx = context(role), target = put(ctx, { ...model('Construct', 4, 6), subtypes: ['Construct'] }); ctx.state.target = target; ctx.state.option = 'Goblin';
    put(ctx, { name: 'Goblin anthem', types: ['Kindred', 'Enchantment'], subtypes: ['Goblin'], cost: '{R}', kws: [], statics: [{ apply: (game, self, bf) => {
      for (const card of bf) if (card.ctrl === self.ctrl && card.is('Creature') && card.hasSub('Goblin')) { card.cur.power++; card.cur.toughness++; }
    } }] });
    await cast(ctx, 'Type Spell'); assert.equal(target.hasSub('Construct'), false); assert.equal(target.hasSub('Goblin'), true); assert.equal(target.power, 5);
    const nexus = put(ctx, 'Maskwood Nexus', 'hand'); await ctx.game.putPermanentOntoBattlefield(nexus, ctx.a);
    assert.equal(target.hasSub('Elf'), true, 'later all-types grant replaces earlier type selection');
    await cast(ctx, 'Type Spell'); assert.equal(target.hasSub('Elf'), false, 'later type selection replaces earlier all-types grant');
    assert.equal(target.hasSub('Goblin'), true); assert.equal(target.power, 5);
    await ctx.game.move(nexus, 'graveyard'); endTemporary(ctx); assert.equal(target.hasSub('Construct'), true); assert.equal(target.power, 4);
  });
  test(role + ': color changes compose with pump, keyword, damage and later target color legality', async () => {
    const ctx = context(role), target = put(ctx, { ...model('Subject', 4, 6), cost: '{R}' }); ctx.state.target = target; ctx.state.option = 'U';
    await cast(ctx, 'Color Buff'); assert.equal(target.power, 5); assert.equal(target.toughness, 7);
    await cast(ctx, 'Color Flying'); assert.equal(target.kw('flying'), true); assert.deepEqual([...target.colors], ['U']);
    await cast(ctx, 'Color Damage'); assert.equal(target.damage, 1); assert.deepEqual([...target.colors], ['B']);
    await cast(ctx, 'Color Blue');
    const removal = put(ctx, 'Next Effects Blue Destroy', 'hand'); ctx.a.pool.G = 1; ctx.a.pool.C = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, removal, { from: 'hand' }), true);
    assert.ok(ctx.trace.filter(row => row.query.type === 'chooseTargets').at(-1).query.candidates.includes(target));
    await settle(ctx); assert.equal(target.zone, 'graveyard'); assert.deepEqual([...target.colors], ['R']);
  });
  test(role + ': plain characteristic effects never enter animation base-power layer', async () => {
    const ctx = context(role), target = put(ctx, model('Animated', 2, 3)); ctx.state.target = target;
    await cast(ctx, 'Color Blue');
    ctx.game.addOracleAnimation(target, { types: ['Creature'], subtypes: ['Elemental'], colors: ['R'], retainTypes: true, retainAllSubtypes: true, power: 8, toughness: 9, temporary: true });
    assert.deepEqual([...target.colors], ['R']); assert.equal(target.power, 8); assert.equal(target.toughness, 9);
    await cast(ctx, 'Color Blue'); assert.deepEqual([...target.colors], ['U']); assert.equal(target.power, 8); assert.equal(target.toughness, 9);
    ctx.state.option = 'Elf'; await cast(ctx, 'Type Add');
    assert.equal(target.hasSub('Elemental'), true); assert.equal(target.power, 8); assert.equal(target.toughness, 9);
    endTemporary(ctx); assert.equal(target.power, 2); assert.equal(target.toughness, 3); assert.deepEqual([...target.colors], []);
  });
  test(role + ': Aura activated type change modifies the attached creature and preserves the Aura type', async () => {
    const ctx = context(role), target = put(ctx, { ...model('Attached', 3, 6), subtypes: ['Elf'] }); ctx.state.target = target; ctx.state.option = 'Goblin';
    const aura = await cast(ctx, 'Type Aura'); assert.equal(aura.attachedTo, target.iid);
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === aura); assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true); await settle(ctx);
    const choice = ctx.trace.find(row => row.query.aiHint?.kind === 'chooseType').answer;
    assert.equal(target.hasSub(choice), true); assert.equal(target.hasSub('Elf'), choice === 'Elf');
    assert.equal(target.power, 3); assert.equal(target.toughness, 6); assert.equal(aura.hasSub('Aura'), true); assert.equal(aura.is('Creature'), false);
    endTemporary(ctx); assert.equal(target.hasSub('Elf'), true);
  });
}

test('mandatory characteristic choices reject invalid answers before any state change', async () => {
  const ctx = context('human'), target = put(ctx, model('Target'));
  ctx.a.controller = { decide: async () => 'colorless' };
  const effect = { action: 'change-characteristics-v8', target: 0, characteristic: 'color', choose: true, retain: false };
  await assert.rejects(MTG.OracleV8Effects.run({ g: ctx.game, src: target, you: ctx.a }, effect, { subjects: () => [target] }), /Invalid mandatory characteristic choice/);
  assert.equal(ctx.game.untilEffects.length, 0); assert.deepEqual([...target.colors], []);
});

test('characteristic parser fails closed on duration, stack, noncreature subtype and trailing clauses', () => {
  for (const oracle of [
    'Target creature becomes blue.',
    'Target creature becomes blue until your next turn.',
    'Target spell or permanent becomes blue until end of turn.',
    'Target spell becomes blue until end of turn.',
    'Target land becomes the creature type of your choice until end of turn.',
    'Target creature becomes the color of your choice in addition to its other types until end of turn.',
    'Target creature becomes colorless in addition to its other colors until end of turn.',
    'Target creature becomes blue until end of turn and wins the game.',
    'Target creature becomes blue until end of turn. It gains a mysterious ability.',
    'That creature becomes black until end of turn.',
  ]) assert.equal(semanticClass(source('Reject Characteristics', oracle), { compilerVersion: 8 }).semanticClass, undefined, oracle);
});
