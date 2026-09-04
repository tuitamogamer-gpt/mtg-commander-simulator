import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const sources = [
  ['Bound Mana', 'Whenever you cast a noncreature spell, if at least four mana was spent to cast it, draw a card.', 'Enchantment'],
  ['Bound Kicker', 'Whenever you cast a spell, if that spell was kicked, draw a card.', 'Enchantment'],
  ['Bound Offturn', "Whenever a player casts a spell, if it's not their turn, that player draws a card.", 'Enchantment'],
  ['Bound Mana Comparison', "Whenever you cast a spell, if the amount of mana spent to cast that spell is greater than this creature's power, put a +1/+1 counter on this creature."],
  ['Bound Death Counters', 'When this creature dies, if it had a +1/+1 counter on it, draw a card.'],
  ['Bound Death Empty', 'When this creature dies, if it had no time counters on it, draw a card.'],
  ['Bound Depart Counters', 'Whenever another permanent you control leaves the battlefield, if it had counters on it, draw a card.', 'Enchantment'],
  ['Bound Host Human', 'Whenever equipped creature dies, if it was a Human, draw a card.\nEquip {1}', 'Artifact — Equipment'],
  ['Bound Historic', 'Enchant permanent\nWhen enchanted permanent leaves the battlefield, if it was historic, draw a card.', 'Enchantment — Aura'],
  ['Bound Aura Owner', 'Whenever a creature dies, if an Aura you controlled was attached to it, draw a card.', 'Enchantment'],
  ['Bound Stats', 'Whenever a creature you control enters, if that creature is 1/1, put two +1/+1 counters on it.', 'Enchantment'],
  ['Bound Greater', 'Whenever another creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.'],
  ['Bound Entered', 'Whenever a creature you control deals combat damage to a player, if that creature entered this turn, draw a card.', 'Enchantment'],
  ['Bound First Strike', "Whenever this creature attacks, if it doesn't have first strike, put a first strike counter on it.\nWhenever this creature attacks, if it has first strike, it gains double strike until end of turn."],
  ['Bound Not Blocking', "When this creature dies, if it wasn't blocking, draw a card."],
  ['Player Attack Cohort', 'Whenever one or more Merfolk you control attack a player, draw a card.', 'Enchantment'],
  ['Small Attack Cohort', 'Whenever you attack a player or planeswalker with one or more creatures with power 1 or less, draw a card.', 'Enchantment'],
  ['Incoming Attack Cohort', 'Whenever one or more creatures attack you, if this creature is untapped, you may untap all creatures you control.'],
  ['Host Attack Cohort', 'Equipped creature gets +0/+1.\nWhenever equipped creature and at least one other creature attack, draw a card.\nEquip {1}', 'Artifact — Equipment'],
  ['Suspected Attack Cohort', 'Whenever one or more suspected creatures you control attack, draw a card.', 'Enchantment'],
  ['Aura Attack Cohort', 'Whenever one or more creatures that are enchanted by an Aura you control attack, draw a card.', 'Enchantment'],
  ['Battalion', 'Whenever this creature and at least two other creatures attack, this creature gets +2/+2 until end of turn.'],
  ['Warrior Battalion', 'Whenever this creature and at least one other Warrior attack, draw a card.', 'Creature — Warrior'],
  ['Attack Ward', 'Whenever a creature attacks you or a planeswalker you control, that creature\'s controller loses 1 life and you gain 1 life.', 'Enchantment'],
  ['Direct Ward', 'Whenever a creature attacks you, it gets -1/-0 until end of turn.', 'Enchantment'],
  ['Opponent Ward', 'Whenever a creature attacks one of your opponents, it gets +0/+1 until end of turn.', 'Enchantment'],
  ['Flying Ward', 'Whenever a creature with flying attacks you, this enchantment deals 4 damage to it.', 'Enchantment'],
  ['Wound', 'Enchant creature\nWhen enchanted creature is dealt damage, destroy it.', 'Enchantment — Aura'],
  ['Host Death', 'Enchant creature\nWhen enchanted creature dies, draw a card.', 'Enchantment — Aura'],
  ['Host Combat', 'Enchant creature\nWhenever enchanted creature attacks or blocks, its controller loses 1 life.', 'Enchantment — Aura'],
  ['Counter Author', 'Whenever you put one or more +1/+1 counters on a creature, draw a card.', 'Enchantment'],
  ['Face Arrival', 'When this creature enters or is turned face up, you gain 2 life.\nMorph {2}'],
  ['Arrival Upkeep', 'When this creature enters and at the beginning of your upkeep, you gain 1 life.'],
  ['Case Arrival', 'When this Case enters, draw a card.', 'Enchantment — Case'],
  ['Page Death', 'Enchant creature\nAt the beginning of your upkeep, you may put a page counter on this Aura.\nWhen enchanted creature dies, draw a card for each page counter on this Aura.', 'Enchantment — Aura'],
  ['Fuse Death', 'Enchant creature\nAt the beginning of your upkeep, you may put a fuse counter on this Aura.\nWhen enchanted creature dies, this Aura deals X damage to any target, where X is the number of fuse counters on this Aura.', 'Enchantment — Aura'],
  ['Host Power', 'Enchant creature\nWhen enchanted creature dies, look at the top X cards of your library, where X is its power. Put one of those cards into your hand and the rest on the bottom of your library in a random order.', 'Enchantment — Aura'],
  ['Incoming Damage', "Whenever you're dealt noncombat damage, draw a card.", 'Enchantment'],
  ['Friendly Damage', 'Whenever a source you control deals noncombat damage to an opponent, draw that many cards.', 'Enchantment'],
  ['Opponent Damage', 'Whenever a source an opponent controls deals damage to you, you may put that many +1/+1 counters on this creature.'],
  ['Creature Revenge', 'Whenever a creature deals damage to you, destroy it.', 'Enchantment'],
  ['Combat Draw', 'Whenever a creature you control deals combat damage to an opponent, you may draw a card.', 'Enchantment'],
  ['Host Tokens', 'Enchant creature you control\nWhen enchanted creature dies, create X 1/1 white Soldier creature tokens, where X is its power.', 'Enchantment — Aura'],
  ['Untapped Entry', '{T}: Add {G}.\nThis land enters tapped unless you control three or more other Forests.\nWhen this land enters untapped, create a Food token.', 'Land — Forest'],
  ['Entry Guard', 'Creatures and nonbasic lands your opponents control enter tapped.', 'Creature — Human Soldier'],
  ['Entry Maze', 'Artifacts and lands enter tapped.', 'Enchantment'],
  ['Entry Counters', 'Each other creature you control enters with an additional +1/+1 counter on it.'],
  ['Rogue Entry Counters', 'Each other Rogue creature you control enters with an additional +1/+1 counter on it.', 'Creature — Rogue'],
  ['Target Cast', 'Whenever you cast an instant or sorcery spell that targets a creature, draw a card.', 'Enchantment'],
  ['Own Target Cast', 'Whenever you cast a spell that targets a creature you control, draw a card.', 'Enchantment'],
  ['Self Target Cast', 'Whenever you cast an Aura spell that targets this creature, draw a card.'],
  ['Second Cast', 'Whenever a player casts their second spell each turn, draw a card.', 'Enchantment'],
  ['Own Turn Second Cast', 'Whenever a player casts their second spell during their turn, you gain 2 life.', 'Enchantment'],
  ['Later Cast', 'Whenever you cast a spell other than your first spell each turn, you gain 1 life.', 'Enchantment'],
  ['Kicked Cast', 'Whenever you cast a kicked spell, draw a card.', 'Enchantment'],
  ['Adventure Cast', 'Whenever you cast a creature spell that has an Adventure, draw a card.', 'Enchantment'],
  ['Walker Condition', 'This creature gets +1/+1 as long as you control an Ajani planeswalker.'],
  ['Empty Counters', 'As long as this creature has no shell counters on it, it gets +3/+2 and has flying.'],
  ['Grave Condition', 'At the beginning of your upkeep, if you have four or more creature cards in your graveyard, draw a card.', 'Enchantment'],
  ['Empty Battlefield', 'At the beginning of each end step, if no creatures are on the battlefield, sacrifice this enchantment.', 'Enchantment'],
  ['Shared Control', 'When this creature enters, if you control an artifact and an enchantment, draw a card.'],
  ['No Life Lost', "At the beginning of your end step, if you didn't lose life this turn, you gain 1 life.", 'Enchantment'],
  ['Discard Condition', 'At the beginning of your end step, if you discarded a card this turn, draw a card.', 'Enchantment'],
];

const input = ([name, oracle_text, type_line = 'Creature — Bear']) => ({
  name: 'Next permanent ' + name, oracle_text, type_line, layout: 'normal', mana_cost: '{1}{G}', power: '2', toughness: '2',
});
const fixtures = sources.map((args, index) => {
  const card = input(args);
  const semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return {position: index + 1, oracleId: 'next-permanent-' + index, scryfallId: 'next-permanent-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: card.type_line.split(' — ')[0].split(' '),
      subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], super: [], power: card.power, toughness: card.toughness, _ci: ['G']},
    catalog: {typeLine: card.type_line, commanderLegality: 'legal'}};
});
MTG.registerOracleBatch({id: 'oracle-v8-next-permanent-test', sequence: 9988, cards: fixtures});
MTG.initData(MTG.RAW_DATA);

function put(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, player);
  card.zone = zone; card.ctrl = player; card.sick = false;
  if (zone === 'battlefield') { game.battlefield.push(card); game.recalc(); }
  else player[zone].push(card);
  return card;
}
function setup(role) {
  const decisions = [];
  const human = {decide: async (game, query) => {
    if (query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return query.candidates.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'attackers' || query.type === 'blockers') return [];
    return null;
  }};
  const game = new MTG.Game({seed: 9149, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, human, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, human, false);
  const c = game.addPlayer('C', {name: 'C'}, human, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (current, query) => { const result = await decide(current, query); decisions.push({query, result}); return result; };
  game.turnNo = 4; game.turnPlayer = a; game.phase = 'main1'; game.step = 'main';
  for (const player of [a, b, c]) for (let index = 0; index < 12; index++) put(game, player, 'Forest', 'library');
  return {game, a, b, c, decisions};
}
async function settle(game) {
  let count = 0;
  while ((game.pendingTriggers.length || game.stack.length) && count++ < 40) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}
const named = (ctx, name, player = ctx.a, zone) => put(ctx.game, player, 'Next permanent ' + name, zone);
const simple = (name, types, extras = {}) => ({name, types, subtypes: [], super: [], cost: null, power: '2', toughness: '2', kws: [], ...extras});

test('next permanent headers stay closed and preserve older supported compilers', () => {
  for (const args of sources) {
    const card = input(args), prior = semanticClass(card, {compilerVersion: 7});
    if (prior.semanticClass) assert.deepEqual(semanticClass(card, {compilerVersion: 8}), prior);
    assert.equal(semanticClass({...card, oracle_text: card.oracle_text + ' Invent an unsupported effect.'}, {compilerVersion: 8}).semanticClass, undefined, card.name);
  }
  for (const text of [
    'Whenever a creature you control enters, if it had a time counter on it, draw a card.',
    'Whenever one or more creatures die, if it had a time counter on it, draw a card.',
    'Whenever you cast a spell, if that spell was kicked twice, draw a card.',
    'Whenever you cast a spell, if three mana from creatures was spent to cast it, draw a card.',
    'Whenever this creature and at least two imaginary creatures attack, draw a card.',
    'Whenever this creature and at least zero other creatures attack, draw a card.',
    'Whenever this creature and at least two other creatures attack, destroy that creature.',
    'Whenever a creature attacks you or a battle you protect, draw a card.',
    'Whenever a creature attacks all of your opponents, draw a card.',
    'When this Case enters, draw a card.',
    'Whenever enchanted creature is dealt strange damage, draw a card.',
    'Whenever a creature deals imaginary damage, draw a card.',
    "Whenever you're dealt imaginary damage, draw a card.",
    'Whenever a source you control deals damage to all opponents, draw a card.',
    'Enchant creature\nWhen enchanted creature dies, return this card from your graveyard to the battlefield.',
  ]) assert.equal(semanticClass(input(['Unbound', text]), {compilerVersion: 8}).semanticClass, undefined, text);
  assert.throws(() => MTG.oracleV8TriggerFilter('dies', {kind: 'v8-event', defender: 'you'}, () => null), /defender/);
});

for (const role of ['human', 'ai']) {
  test(`${role}: cast conditions use the triggering spell's actual payment and preserve it after a counter`, async () => {
    const ctx = setup(role); named(ctx, 'Bound Mana'); named(ctx, 'Bound Kicker');
    ctx.a.pool.C = 30;
    const priority = ctx.game.priorityRound; ctx.game.priorityRound = async () => {};
    for (const [cost, kicker, draws] of [['{3}', false, 0], ['{4}', false, 1], ['{0}', true, 1]]) {
      const before = ctx.a.library.length;
      const spell = put(ctx.game, ctx.a, simple('Paid spell', ['Instant'], {cost, ...(kicker ? {kicker: {cost: '{0}'}} : {}), resolve: async () => {}}), 'hand');
      assert.equal(await ctx.game.castSpell(ctx.a, spell, {from: 'hand'}), true);
      const original = ctx.game.stack.find(row => row.card === spell); assert.ok(original);
      assert.equal(original.manaSpent, Number(cost.slice(1, -1)));
      await ctx.game.counterStackObject(original, {ignoreUncounterable: true});
      await settle(ctx.game); assert.equal(before - ctx.a.library.length, draws);
    }
    ctx.game.priorityRound = priority;
  });

  test(`${role}: cast mana comparisons recheck the source while off-turn casts bind the caster`, async () => {
    const ctx = setup(role), source = named(ctx, 'Bound Mana Comparison'); named(ctx, 'Bound Offturn');
    ctx.a.pool.C = 20; ctx.b.pool.C = 20;
    const priority = ctx.game.priorityRound; ctx.game.priorityRound = async () => {};
    const first = put(ctx.game, ctx.a, simple('First paid spell', ['Instant'], {cost: '{4}', resolve: async () => {}}), 'hand');
    assert.equal(await ctx.game.castSpell(ctx.a, first, {from: 'hand'}), true);
    ctx.game.addCounters(source, '+1/+1', 3); await settle(ctx.game);
    assert.equal(source.counters['+1/+1'], 3, '4 mana is no longer greater than the source power 5');
    const their = put(ctx.game, ctx.b, simple('Their instant', ['Instant'], {cost: '{0}', resolve: async () => {}}), 'hand');
    const before = ctx.b.library.length;
    assert.equal(await ctx.game.castSpell(ctx.b, their, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(ctx.b.library.length, before - 1); assert.equal(ctx.a.library.length, 12);
    ctx.game.priorityRound = priority;
  });

  test(`${role}: dying and leaving conditions retain the exact departing object's counters`, async () => {
    const ctx = setup(role); named(ctx, 'Bound Depart Counters');
    const dead = named(ctx, 'Bound Death Counters');
    ctx.game.addCounters(dead, '+1/+1', 1); await settle(ctx.game);
    await ctx.game.move(dead, 'graveyard');
    await ctx.game.move(dead, 'battlefield');
    assert.equal(dead.counters['+1/+1'] || 0, 0);
    await settle(ctx.game); assert.equal(ctx.a.hand.length, 2, 'both triggers use the earlier battlefield incarnation');
    const empty = named(ctx, 'Bound Death Empty'); ctx.game.addCounters(empty, 'time', 1);
    await ctx.game.move(empty, 'graveyard'); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3, 'the positive departure trigger fires but the no-time condition does not');
    const blocking = named(ctx, 'Bound Not Blocking'); blocking.blocking = dead.iid;
    await ctx.game.move(blocking, 'graveyard'); await settle(ctx.game); assert.equal(ctx.a.hand.length, 3);
  });

  test(`${role}: departed host qualities and attached Aura ownership use death snapshots`, async () => {
    const ctx = setup(role), equipment = named(ctx, 'Bound Host Human'); named(ctx, 'Bound Aura Owner');
    const human = put(ctx.game, ctx.b, simple('Borrowed Human', ['Creature'], {subtypes: ['Human']}));
    await ctx.game.attach(equipment, human);
    const aura = put(ctx.game, ctx.a, simple('Friendly Aura', ['Enchantment'], {subtypes: ['Aura']})); await ctx.game.attach(aura, human);
    await ctx.game.destroyMany([human, aura, equipment]); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 2, 'the dying Equipment and the surviving observer both retain exact LKI');
    const bear = put(ctx.game, ctx.b, 'Grizzly Bears');
    const wrongAura = put(ctx.game, ctx.b, simple('Enemy Aura', ['Enchantment'], {subtypes: ['Aura']})); await ctx.game.attach(wrongAura, bear);
    await ctx.game.move(bear, 'graveyard'); await settle(ctx.game); assert.equal(ctx.a.hand.length, 2);
    const historic = named(ctx, 'Bound Historic'), artifact = put(ctx.game, ctx.b, simple('Historical artifact', ['Artifact']));
    await ctx.game.attach(historic, artifact); await ctx.game.move(artifact, 'hand'); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3);
  });

  test(`${role}: greater-power-or-toughness entry rechecks both creatures and exact departure LKI`, async () => {
    const ctx = setup(role), source = named(ctx, 'Bound Greater');
    const first = put(ctx.game, ctx.a, simple('Greater toughness', ['Creature'], {power: '1', toughness: '3'}), 'hand');
    await ctx.game.move(first, 'battlefield');
    ctx.game.addCounters(source, '+1/+1', 1); await settle(ctx.game);
    assert.equal(source.counters['+1/+1'], 1, 'after responding both comparisons are false');
    const second = put(ctx.game, ctx.a, simple('Greater power', ['Creature'], {power: '4', toughness: '1'}), 'hand');
    await ctx.game.move(second, 'battlefield'); await ctx.game.move(second, 'hand');
    second.def = {...second.def, power: '1', toughness: '1'}; await ctx.game.move(second, 'battlefield');
    await settle(ctx.game);
    assert.equal(source.counters['+1/+1'], 2, 'the old 4/1 incarnation still qualifies, the new 1/1 does not');
  });

  test(`${role}: simultaneous evolve comparisons resolve separately and a noncreature has no comparable stats`, async () => {
    const ctx = setup(role), source = named(ctx, 'Bound Greater');
    await ctx.game.makeTokens('beast33', ctx.a, {n: 2});
    assert.equal(ctx.game.pendingTriggers.length, 2);
    await settle(ctx.game); assert.equal(source.counters['+1/+1'], 1, 'the first resolution makes the second comparison fail');
    const visitor = put(ctx.game, ctx.a, simple('Becoming artifact', ['Creature'], {power: '4', toughness: '4'}), 'hand');
    await ctx.game.move(visitor, 'battlefield');
    ctx.game.untilEffects.push({apply: (g, battlefield) => { if (battlefield.includes(visitor)) visitor.cur.types = ['Artifact']; }}); ctx.game.recalc();
    await settle(ctx.game); assert.equal(source.counters['+1/+1'], 1, 'being present as a noncreature does not fall back to earlier creature stats');
  });

  test(`${role}: exact entry stats recheck changes and first-strike conditions do not trigger retroactively`, async () => {
    const ctx = setup(role); named(ctx, 'Bound Stats');
    const card = put(ctx.game, ctx.a, simple('One one', ['Creature'], {power: '1', toughness: '1'}), 'hand');
    await ctx.game.move(card, 'battlefield'); ctx.game.addCounters(card, '+1/+1', 1); await settle(ctx.game);
    assert.equal(card.counters['+1/+1'], 1, 'a 2/2 at resolution no longer satisfies the intervening condition');
    const source = named(ctx, 'Bound First Strike'); source.attacking = ctx.b;
    await ctx.game.emit('attacks', {card: source, player: ctx.a, defender: ctx.b}); await settle(ctx.game);
    assert.equal(source.kw('first strike'), true); assert.equal(source.kw('double strike'), false);
    await ctx.game.emit('attacks', {card: source, player: ctx.a, defender: ctx.b}); await settle(ctx.game);
    assert.equal(source.kw('double strike'), true);
  });

  test(`${role}: entered-this-turn combat conditions exclude older creatures and survive a later blink`, async () => {
    const ctx = setup(role); named(ctx, 'Bound Entered');
    const old = put(ctx.game, ctx.a, 'Grizzly Bears'); old.meta._enteredTurn = ctx.game.turnNo - 1;
    const fresh = put(ctx.game, ctx.a, simple('Fresh haste', ['Creature'], {kws: ['haste']}), 'hand'); await ctx.game.move(fresh, 'battlefield');
    for (const attacker of [old, fresh]) { attacker.attacking = ctx.b; attacker.sick = false; attacker.blockedBy = []; attacker.wasBlocked = false; }
    ctx.game.combat = {attackers: [old, fresh], defenders: new Map()};
    await ctx.game.combatDamage(ctx.a, 'normal');
    await ctx.game.move(fresh, 'hand'); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 2, 'one draw and the bounced fresh attacker');
  });

  test(`${role}: player attack groups count distinct matching defenders before resolution`, async () => {
    const ctx = setup(role); named(ctx, 'Player Attack Cohort');
    const merfolk = Array.from({length: 3}, (_, i) => put(ctx.game, ctx.a, simple('Merfolk ' + i, ['Creature'], {subtypes: ['Merfolk']})));
    const unrelated = put(ctx.game, ctx.a, 'Grizzly Bears');
    merfolk[0].attacking = ctx.b; merfolk[1].attacking = ctx.b; merfolk[2].attacking = ctx.c;
    unrelated.attacking = ctx.c;
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [...merfolk, unrelated]});
    assert.equal(ctx.game.pendingTriggers.length, 2, 'two actual players, independent of attacker count');
    await ctx.game.move(merfolk[2], 'hand'); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3, 'two draws and the bounced attacker');
    const before = ctx.a.hand.length;
    let observed = null;
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => {
      if (event === 'attackersDeclared') observed = new Set(data.attackers.filter(card => card.hasSub('Merfolk') && card.attacking instanceof MTG.Player).map(card => card.attacking)).size;
      return emit(event, data);
    };
    ctx.game.untilEffects.push({kind: 'mustAttack', who: ctx.a, expires: 'eot'});
    await ctx.game.combatPhase(ctx.a); await settle(ctx.game);
    assert.ok(observed >= 1); assert.equal(ctx.a.hand.length, before + observed);
    assert.ok(ctx.decisions.some(row => row.query.type === 'attackers'));
  });

  test(`${role}: small attackers distinguish each planeswalker and exclude battles and nonmatching power`, async () => {
    const ctx = setup(role); named(ctx, 'Small Attack Cohort');
    const walker1 = put(ctx.game, ctx.b, simple('Walker One', ['Planeswalker'], {loyalty: 5}));
    const walker2 = put(ctx.game, ctx.b, simple('Walker Two', ['Planeswalker'], {loyalty: 5}));
    const battle = put(ctx.game, ctx.c, simple('Battle', ['Battle'], {defense: 5}));
    const targets = [ctx.b, ctx.b, walker1, walker2, battle];
    const attackers = targets.map((target, i) => { const card = put(ctx.game, ctx.a, simple('Small ' + i, ['Creature'], {power: '1'})); card.attacking = target; return card; });
    const large = put(ctx.game, ctx.a, 'Grizzly Bears'); large.attacking = ctx.c; attackers.push(large);
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3, 'one player and two separate planeswalkers');
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3, 'requires your declaration');
  });

  test(`${role}: incoming attack cohorts require the player itself and recheck the source condition`, async () => {
    const ctx = setup(role), source = named(ctx, 'Incoming Attack Cohort');
    const ally = put(ctx.game, ctx.a, 'Grizzly Bears'); ally.tapped = true;
    const walker = put(ctx.game, ctx.a, simple('Guarded Walker', ['Planeswalker'], {loyalty: 5}));
    const attackers = [put(ctx.game, ctx.b, 'Grizzly Bears'), put(ctx.game, ctx.b, 'Grizzly Bears')];
    for (const attacker of attackers) attacker.attacking = walker;
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers}); await settle(ctx.game);
    assert.equal(ally.tapped, true);
    for (const attacker of attackers) attacker.attacking = ctx.a;
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers});
    assert.equal(ctx.game.pendingTriggers.length, 1); source.tapped = true; await settle(ctx.game);
    assert.equal(ally.tapped, true, 'intervening untapped condition is checked again');
    source.tapped = false;
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers}); await settle(ctx.game);
    assert.equal(ally.tapped, false);
  });

  test(`${role}: attack cohorts distinguish suspected status and the Aura controller`, async () => {
    const ctx = setup(role); named(ctx, 'Suspected Attack Cohort'); named(ctx, 'Aura Attack Cohort');
    const own = put(ctx.game, ctx.a, 'Grizzly Bears'), enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    own.attacking = ctx.b; enemy.attacking = ctx.a; enemy.meta.suspected = true;
    const theirAura = put(ctx.game, ctx.b, simple('Their Aura', ['Enchantment'], {subtypes: ['Aura']})); await ctx.game.attach(theirAura, own);
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [own]}); await settle(ctx.game);
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [enemy]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0, 'opponent suspected creatures and opponent Auras do not qualify');
    own.meta.suspected = true;
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [own]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1);
    const myAura = put(ctx.game, ctx.a, simple('My Aura', ['Enchantment'], {subtypes: ['Aura']})); await ctx.game.attach(myAura, enemy);
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [enemy]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 2, 'your Aura can enchant an opponent attacker');
  });

  test(`${role}: attached attack battalion observes a host controlled by another player`, async () => {
    const ctx = setup(role), source = named(ctx, 'Host Attack Cohort');
    const host = put(ctx.game, ctx.b, 'Grizzly Bears'), other = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.attach(source, host); host.attacking = ctx.a; other.attacking = ctx.c;
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [other]}); await settle(ctx.game);
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [host]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0);
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [host, other]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1);
  });

  test(`${role}: battalion counts the declared source and other matching attackers separately`, async () => {
    const ctx = setup(role), source = named(ctx, 'Warrior Battalion');
    const warrior = put(ctx.game, ctx.a, simple('Other Warrior', ['Creature'], {subtypes: ['Warrior']}));
    const bear = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [warrior, bear]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0, 'source must be declared');
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [source, bear]}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0, 'the source cannot also be its other Warrior');
    ctx.game.untilEffects.push({kind: 'mustAttack', who: ctx.a, expires: 'eot'});
    await ctx.game.combatPhase(ctx.a); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1, 'a real declaration with another Warrior creates one trigger');
    assert.ok(ctx.decisions.some(row => row.query.type === 'attackers'));
  });

  test(`${role}: attack wards distinguish players, their planeswalkers and battles`, async () => {
    const ctx = setup(role); named(ctx, 'Attack Ward'); named(ctx, 'Direct Ward'); named(ctx, 'Opponent Ward');
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    const walker = put(ctx.game, ctx.a, simple('Own walker', ['Planeswalker'], {loyalty: 5}));
    const battle = put(ctx.game, ctx.a, simple('Own battle', ['Battle'], {defense: 5}));
    const emit = async defender => { attacker.attacking = defender; await ctx.game.emit('attacks', {card: attacker, player: ctx.b, defender}); await settle(ctx.game); };
    await emit(walker);
    assert.equal(ctx.a.life, 41); assert.equal(ctx.b.life, 39); assert.equal(attacker.power, 2);
    await emit(battle);
    assert.equal(ctx.a.life, 41, 'a battle is not a planeswalker'); assert.equal(attacker.toughness, 2);
    await emit(ctx.c);
    assert.equal(ctx.a.life, 41); assert.equal(attacker.toughness, 3, 'opponent-player header only matches another player');
    await emit(ctx.a);
    assert.equal(ctx.a.life, 42); assert.equal(ctx.b.life, 38); assert.equal(attacker.power, 1);
  });

  test(`${role}: a flying-only attack trigger damages the bound attacker`, async () => {
    const ctx = setup(role); named(ctx, 'Flying Ward');
    const ground = put(ctx.game, ctx.b, 'Grizzly Bears');
    const flying = put(ctx.game, ctx.b, simple('Flying attacker', ['Creature'], {kws: ['flying']}));
    await ctx.game.emit('attacks', {card: ground, player: ctx.b, defender: ctx.a}); await settle(ctx.game);
    assert.equal(ground.zone, 'battlefield');
    await ctx.game.emit('attacks', {card: flying, player: ctx.b, defender: ctx.a}); await settle(ctx.game);
    assert.equal(flying.zone, 'graveyard'); assert.equal(ground.zone, 'battlefield');
  });

  test(`${role}: attached damage and death triggers capture their host through Aura cleanup`, async () => {
    const ctx = setup(role), host = put(ctx.game, ctx.b, simple('Host', ['Creature'], {toughness: '5'}));
    const other = put(ctx.game, ctx.b, 'Grizzly Bears');
    const wound = named(ctx, 'Wound'), death = named(ctx, 'Host Death');
    ctx.game.attach(wound, host); ctx.game.attach(death, host);
    await ctx.game.damageCreature(other, other, 1); await settle(ctx.game);
    assert.equal(host.zone, 'battlefield'); assert.equal(ctx.a.hand.length, 0);
    await ctx.game.damageCreature(other, host, 1); await settle(ctx.game);
    assert.equal(host.zone, 'graveyard', 'damage trigger destroys the captured host');
    assert.equal(ctx.a.hand.length, 1, 'host death is observed before Aura SBA removes the observer');
    assert.equal(wound.zone, 'graveyard'); assert.equal(death.zone, 'graveyard');
  });

  test(`${role}: an attached damage trigger does not follow a host through blink`, async () => {
    const ctx = setup(role), host = put(ctx.game, ctx.b, simple('Blink host', ['Creature'], {toughness: '5'}));
    const wound = named(ctx, 'Wound'); ctx.game.attach(wound, host);
    await ctx.game.damageCreature(wound, host, 1);
    await ctx.game.move(host, 'exile'); await ctx.game.move(host, 'battlefield'); await settle(ctx.game);
    assert.equal(host.zone, 'battlefield', 'the returned incarnation is not the original event object');
  });

  test(`${role}: Private Research and Incendiary bodies retain Aura counters after host death`, async () => {
    const ctx = setup(role), host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const pages = named(ctx, 'Page Death'), fuse = named(ctx, 'Fuse Death');
    ctx.game.attach(pages, host); ctx.game.attach(fuse, host);
    ctx.game.addCounters(pages, 'page', 3, false, ctx.a); ctx.game.addCounters(fuse, 'fuse', 4, false, ctx.a);
    const damage = [], originalDamage = ctx.game.damageAny.bind(ctx.game);
    ctx.game.damageAny = async (source, target, amount, options) => {
      if (source?.iid === fuse.iid) damage.push({target, amount});
      return originalDamage(source, target, amount, options);
    };
    await ctx.game.destroy(host); await settle(ctx.game);
    assert.equal(pages.zone, 'graveyard'); assert.equal(fuse.zone, 'graveyard');
    assert.equal(ctx.a.hand.length, 3, 'Private Research draws for the departed Aura\'s three counters');
    assert.equal(damage.length, 1); assert.equal(damage[0].amount, 4, 'Incendiary deals four, even though its new graveyard object has no counters');
    assert.ok(ctx.decisions.some(row => row.query.type === 'chooseTargets'), 'the actual controller chooses the damage target');
  });

  test(`${role}: Necrosynthesis body reads departed host power instead of Aura power`, async () => {
    const ctx = setup(role), host = put(ctx.game, ctx.a, simple('Power host', ['Creature'], {power: '4', toughness: '5'}));
    const aura = named(ctx, 'Host Power'); ctx.game.attach(aura, host);
    await ctx.game.destroy(host); await settle(ctx.game);
    assert.equal(aura.zone, 'graveyard'); assert.equal(ctx.a.hand.length, 1);
    const choice = ctx.decisions.find(row => row.query.type === 'chooseCards');
    assert.ok(choice); assert.equal(choice.query.from.length, 4, 'four cards are offered from the host LKI power');
  });

  test(`${role}: Murder Investigation body creates the exact host-power token count`, async () => {
    const ctx = setup(role), host = put(ctx.game, ctx.a, simple('Token host', ['Creature'], {power: '4', toughness: '5'}));
    const aura = named(ctx, 'Host Tokens'); ctx.game.attach(aura, host);
    await ctx.game.destroy(host); await settle(ctx.game);
    assert.equal(aura.zone, 'graveyard');
    const tokens = ctx.game.battlefield.filter(card => card.isToken);
    assert.equal(tokens.length, 4); assert.ok(tokens.every(card => card.hasSub('Soldier') && card.power === 1 && card.toughness === 1));
  });

  test(`${role}: counter authorship is distinct from control and one batch triggers once`, async () => {
    const ctx = setup(role); named(ctx, 'Counter Author');
    const owned = put(ctx.game, ctx.a, 'Grizzly Bears'), foreign = put(ctx.game, ctx.b, 'Grizzly Bears');
    ctx.game.addCounters(owned, '+1/+1', 2, false, ctx.b); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0, 'an opponent putting counters on your creature is not you');
    ctx.game.addCounters(foreign, '+1/+1', 3, false, ctx.a); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1, 'you can put several counters on an opponent creature in one event');
    ctx.game.addCounters(foreign, '-1/-1', 1, false, ctx.a); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1, 'the named counter kind remains a predicate');
  });

  test(`${role}: joined entry/upkeep headers resolve separate real events`, async () => {
    const ctx = setup(role), card = named(ctx, 'Arrival Upkeep', ctx.a, 'hand');
    ctx.a.pool.C = 1; ctx.a.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(ctx.a.life, 41);
    await ctx.game.emit('upkeep', {player: ctx.b}); await settle(ctx.game); assert.equal(ctx.a.life, 41);
    await ctx.game.emit('upkeep', {player: ctx.a}); await settle(ctx.game); assert.equal(ctx.a.life, 42);
  });

  test(`${role}: incoming damage distinguishes source controller, combat and recipient`, async () => {
    const ctx = setup(role); named(ctx, 'Incoming Damage'); const grow = named(ctx, 'Opponent Damage');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.damagePlayer(enemy, ctx.c, 2); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 0); assert.equal(grow.counters['+1/+1'] || 0, 0, 'another recipient does not match');
    enemy.ctrl = ctx.a; ctx.game.recalc();
    await ctx.game.damagePlayer(enemy, ctx.a, 2); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1); assert.equal(grow.counters['+1/+1'] || 0, 0, 'a stolen source is controlled by you');
    enemy.ctrl = ctx.b; ctx.game.recalc();
    await ctx.game.damagePlayer(enemy, ctx.a, 3, {combat: true}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 1, 'combat damage does not satisfy noncombat');
    assert.equal(grow.counters['+1/+1'], 3, 'opponent-controlled combat source satisfies the unrestricted incoming trigger');
    await ctx.game.damagePlayer(enemy, ctx.a, 2); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 2); assert.equal(grow.counters['+1/+1'], 5);
  });

  test(`${role}: noncombat source-to-player triggers accept a real resolving spell and actual damage amount`, async () => {
    const ctx = setup(role); named(ctx, 'Friendly Damage'); named(ctx, 'Combat Draw');
    const spell = put(ctx.game, ctx.a, simple('Damage source spell', ['Instant'], {cost: '{0}', resolve: async ({g, src}) => g.damagePlayer(src, ctx.b, 3)}), 'hand');
    assert.equal(await ctx.game.castSpell(ctx.a, spell, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 3, 'the spell source draws once for three actual damage');
    assert.equal(spell.zone, 'graveyard');
    const creature = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.damagePlayer(creature, ctx.b, 2, {combat: true}); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 4, 'creature combat damage triggers only the combat observer');
    await ctx.game.damagePlayer(creature, ctx.a, 2); await settle(ctx.game);
    assert.equal(ctx.a.hand.length, 4, 'friendly source damaging you does not satisfy opponent recipient');
  });

  test(`${role}: No Mercy body destroys the actual creature source after damaging you`, async () => {
    const ctx = setup(role); named(ctx, 'Creature Revenge');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears'), unrelated = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.damagePlayer(enemy, ctx.a, 2); await settle(ctx.game);
    assert.equal(enemy.zone, 'graveyard'); assert.equal(unrelated.zone, 'battlefield');
    const artifact = put(ctx.game, ctx.b, simple('Damage artifact', ['Artifact']));
    await ctx.game.damagePlayer(artifact, ctx.a, 2); await settle(ctx.game);
    assert.equal(artifact.zone, 'battlefield', 'a noncreature source does not match creature wording');
  });

  test(`${role}: Gingerbread Cabin body checks untapped entry once at the actual event`, async () => {
    for (const count of [2, 3]) {
      const ctx = setup(role);
      for (let index = 0; index < count; index++) put(ctx.game, ctx.a, 'Forest');
      const land = named(ctx, 'Untapped Entry', ctx.a, 'hand');
      assert.equal(await ctx.game.playLand(ctx.a, land), true);
      assert.equal(land.tapped, count === 2);
      if (count === 3) ctx.game.tap(land);
      await settle(ctx.game);
      assert.equal(ctx.game.battlefield.filter(card => card.isToken && card.hasSub('Food')).length, count === 3 ? 1 : 0,
        'tapping after entry does not retroactively change whether the trigger happened');
    }
  });

  test(`${role}: entry restrictions distinguish ownership, types and ability loss before the ETB event`, async () => {
    const ctx = setup(role), guard = named(ctx, 'Entry Guard', ctx.a, 'hand');
    ctx.a.pool.C = 1; ctx.a.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, guard, {from: 'hand'}), true); await settle(ctx.game);
    const observations = [], emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => { if (event === 'etb') observations.push([data.card.iid, data.card.tapped]); return emit(event, data); };
    for (const [player, definition, expected] of [
      [ctx.a, 'Grizzly Bears', false], [ctx.b, 'Grizzly Bears', true], [ctx.b, 'Forest', false],
      [ctx.b, simple('Nonbasic', ['Land']), true], [ctx.b, simple('Artifact', ['Artifact']), false],
    ]) {
      const card = put(ctx.game, player, definition, 'hand'); await ctx.game.move(card, 'battlefield', {ctrl: player});
      assert.equal(card.tapped, expected); assert.equal(observations.find(row => row[0] === card.iid)?.[1], expected);
    }
    const stolen = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand'); await ctx.game.move(stolen, 'battlefield', {ctrl: ctx.b});
    assert.equal(stolen.tapped, true, 'entry replacement uses the receiving controller');
    const lignify = put(ctx.game, ctx.b, 'Lignify'); await ctx.game.attach(lignify, guard);
    assert.equal(guard.cur.abilitiesDisabled, true);
    const later = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand'); await ctx.game.move(later, 'battlefield');
    assert.equal(later.tapped, false, 'a removed static ability cannot supply an entry replacement');
  });

  test(`${role}: simultaneous entrants do not supply entry replacements to each other`, async () => {
    const ctx = setup(role), guard = named(ctx, 'Entry Guard', ctx.a, 'hand'), bear = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand');
    await ctx.game.withBattlefieldEntryBatch(async () => {
      await ctx.game.move(guard, 'battlefield'); await ctx.game.move(bear, 'battlefield');
    });
    assert.equal(bear.tapped, false);
    const next = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand'); await ctx.game.move(next, 'battlefield'); assert.equal(next.tapped, true);
    const counterSource = named(ctx, 'Entry Counters', ctx.a, 'hand'), coentrant = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand');
    await ctx.game.withBattlefieldEntryBatch(async () => {
      await ctx.game.move(counterSource, 'battlefield'); await ctx.game.move(coentrant, 'battlefield');
    });
    assert.equal(coentrant.counters['+1/+1'] || 0, 0);
  });

  test(`${role}: coentrant ability removal does not retroactively suppress an existing entry replacement`, async () => {
    const ctx = setup(role), guard = named(ctx, 'Entry Guard');
    const aura = put(ctx.game, ctx.b, 'Lignify', 'hand'), bear = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand');
    await ctx.game.withBattlefieldEntryBatch(async () => {
      await ctx.game.move(aura, 'battlefield', {attachTo: guard});
      await ctx.game.move(bear, 'battlefield');
    });
    assert.equal(bear.tapped, true, 'the source still had its ability before the simultaneous event');
    assert.equal(guard.cur.abilitiesDisabled, true, 'the Aura removes the ability after entry');
    const next = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand'); await ctx.game.move(next, 'battlefield');
    assert.equal(next.tapped, false, 'later events observe the removed ability');
  });

  test(`${role}: simultaneous control changes retain the pre-entry replacement controller`, async () => {
    const ctx = setup(role), guard = named(ctx, 'Entry Guard');
    const aura = put(ctx.game, ctx.b, 'Mind Control', 'hand'), bear = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand');
    await ctx.game.withBattlefieldEntryBatch(async () => {
      await ctx.game.move(aura, 'battlefield', {attachTo: guard});
      await ctx.game.move(bear, 'battlefield');
    });
    assert.equal(bear.tapped, true, 'B was an opponent of the replacement controller before entry');
    assert.equal(guard.ctrl === ctx.b, true, 'the completed entry applies the Aura control effect');
    const next = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand'); await ctx.game.move(next, 'battlefield');
    assert.equal(next.tapped, false, 'later entry uses the new controller');
    const opponent = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand'); await ctx.game.move(opponent, 'battlefield');
    assert.equal(opponent.tapped, true);
  });

  test(`${role}: legacy counter entry replacements use the same pre-entry ability state`, async () => {
    const ctx = setup(role), grumgully = put(ctx.game, ctx.a, 'Grumgully, the Generous');
    const aura = put(ctx.game, ctx.b, 'Lignify', 'hand'), bear = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand');
    await ctx.game.withBattlefieldEntryBatch(async () => {
      await ctx.game.move(aura, 'battlefield', {attachTo: grumgully});
      await ctx.game.move(bear, 'battlefield');
    });
    assert.equal(bear.counters['+1/+1'], 1);
    assert.equal(grumgully.cur.abilitiesDisabled, true);
    const next = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand'); await ctx.game.move(next, 'battlefield');
    assert.equal(next.counters['+1/+1'] || 0, 0);
  });

  test(`${role}: typed additional entry counters combine before counter replacements and observers`, async () => {
    const ctx = setup(role), source = named(ctx, 'Rogue Entry Counters', ctx.a, 'hand');
    ctx.a.pool.C = 1; ctx.a.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, source, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(source.counters['+1/+1'] || 0, 0, 'other excludes the source');
    put(ctx.game, ctx.a, 'Hardened Scales');
    const observations = [], emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => { if (event === 'countersPlaced') observations.push(data); return emit(event, data); };
    const rogue = put(ctx.game, ctx.a, simple('Printed counters Rogue', ['Creature'], {subtypes: ['Rogue'], etbCounters: {kind: '+1/+1', n: 2}}), 'hand');
    await ctx.game.move(rogue, 'battlefield');
    assert.equal(rogue.counters['+1/+1'], 4, 'two printed plus one additional then one Hardened Scales counter');
    assert.equal(observations.filter(row => row.card === rogue).length, 1, 'all entry counters form one event');
    assert.equal(observations.find(row => row.card === rogue)?.n, 4);
    const ordinary = put(ctx.game, ctx.a, 'Grizzly Bears', 'hand'); await ctx.game.move(ordinary, 'battlefield');
    assert.equal(ordinary.counters['+1/+1'] || 0, 0, 'non-Rogue does not qualify');
    const enemy = put(ctx.game, ctx.b, rogue.def, 'hand'); await ctx.game.move(enemy, 'battlefield');
    assert.equal(enemy.counters['+1/+1'], 2, 'the opponent receives only its printed counters');
  });

  test(`${role}: conflicting global entry states use the entering controller's replacement choice`, async () => {
    const ctx = setup(role); named(ctx, 'Entry Maze');
    put(ctx.game, ctx.a, simple('Untapped lands source', ['Enchantment'], {landsEnterUntapped: true}));
    const land = put(ctx.game, ctx.a, 'Forest', 'hand'); assert.equal(await ctx.game.playLand(ctx.a, land), true);
    const choices = ctx.decisions.filter(row => row.query.aiHint?.event === 'etbTapped');
    assert.equal(choices.length, 1, 'the affected controller chooses the first of two entry replacements');
    const first = choices[0].query.options.find(option => option.key === String(choices[0].result));
    assert.ok(first);
    assert.equal(land.tapped, first.source.def.landsEnterUntapped === true, 'the second selected replacement determines final state');
  });

  test(`${role}: one cast triggers once despite several targets and a spell copy`, async () => {
    const ctx = setup(role); named(ctx, 'Target Cast');
    const one = put(ctx.game, ctx.a, 'Grizzly Bears'), two = put(ctx.game, ctx.b, 'Grizzly Bears');
    const spell = put(ctx.game, ctx.a, simple('Two targets spell', ['Instant'], {cost: '{0}', targets: [{what: 'creature', min: 2, count: 2, filter: (g, c) => c === one || c === two}], resolve: async () => {}}), 'hand');
    const priority = ctx.game.priorityRound; let copied = false;
    ctx.game.priorityRound = async function (...args) {
      const so = this.stack.find(row => row.card === spell && row.kind === 'spell');
      if (so && !copied) {
        copied = true; assert.equal(so.targets.flat().length, 2);
        await this.copySpell(so, ctx.a, {mayNewTargets: false});
      }
      return priority.apply(this, args);
    };
    assert.equal(await ctx.game.castSpell(ctx.a, spell, {from: 'hand'}), true);
    await settle(ctx.game); assert.equal(copied, true);
    assert.equal(ctx.a.library.length, 11, 'a copy is not cast and two targets still produce one trigger');
    const artifact = put(ctx.game, ctx.a, simple('Wrong target', ['Artifact']));
    const wrong = put(ctx.game, ctx.a, simple('Artifact target spell', ['Instant'], {cost: '{0}', targets: [{what: 'permanent', filter: (g, c) => c === artifact}], resolve: async () => {}}), 'hand');
    assert.equal(await ctx.game.castSpell(ctx.a, wrong, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 11);
  });

  test(`${role}: cast target qualifiers bind the caster, controlled creature and exact observing source`, async () => {
    const ctx = setup(role), self = named(ctx, 'Self Target Cast'); named(ctx, 'Own Target Cast');
    const friendly = put(ctx.game, ctx.a, 'Grizzly Bears'), enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    for (const [target, player, expectedDraws] of [[enemy, ctx.a, 0], [friendly, ctx.a, 1], [self, ctx.a, 2], [self, ctx.b, 0]]) {
      ctx.game.turnPlayer = player;
      const aura = put(ctx.game, player, simple('Targeting Aura', ['Enchantment'], {cost: '{0}', subtypes: ['Aura'], aura: true, targets: [{what: 'creature', filter: (g, c) => c === target}]}), 'hand');
      const before = ctx.a.library.length;
      assert.equal(await ctx.game.castSpell(player, aura, {from: 'hand'}), true); await settle(ctx.game);
      assert.equal(before - ctx.a.library.length, expectedDraws);
    }
  });

  test(`${role}: cast ordinals count actual casts independently for each player and turn`, async () => {
    const ctx = setup(role); named(ctx, 'Second Cast'); named(ctx, 'Own Turn Second Cast'); named(ctx, 'Later Cast');
    const cast = async player => {
      const spell = put(ctx.game, player, simple('Ordinal spell', ['Instant'], {cost: '{0}', resolve: async () => {}}), 'hand');
      assert.equal(await ctx.game.castSpell(player, spell, {from: 'hand'}), true); await settle(ctx.game);
    };
    await cast(ctx.a); assert.equal(ctx.a.library.length, 12); assert.equal(ctx.a.life, 40);
    await cast(ctx.a); assert.equal(ctx.a.library.length, 11); assert.equal(ctx.a.life, 43);
    await cast(ctx.a); assert.equal(ctx.a.library.length, 11); assert.equal(ctx.a.life, 44);
    await cast(ctx.b); await cast(ctx.b); assert.equal(ctx.a.library.length, 10); assert.equal(ctx.a.life, 44, 'opponent second spell during your turn does not satisfy their turn');
    ctx.game.turnNo++; ctx.game.turnPlayer = ctx.b;
    for (const player of ctx.game.players) player.turnState = player.freshTurnState();
    await cast(ctx.b); await cast(ctx.b); assert.equal(ctx.a.library.length, 9); assert.equal(ctx.a.life, 46);
  });

  test(`${role}: kicked and Adventure cast qualifiers use the announced spell face and paid choice`, async () => {
    const ctx = setup(role); named(ctx, 'Kicked Cast'); named(ctx, 'Adventure Cast');
    const kicked = put(ctx.game, ctx.a, simple('Kicked probe', ['Instant'], {cost: '{0}', kicker: {cost: '{0}'}, resolve: async () => {}}), 'hand');
    assert.equal(await ctx.game.castSpell(ctx.a, kicked, {from: 'hand'}), true); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 11);
    const plain = put(ctx.game, ctx.a, simple('Unkicked probe', ['Instant'], {cost: '{0}', resolve: async () => {}}), 'hand');
    assert.equal(await ctx.game.castSpell(ctx.a, plain, {from: 'hand'}), true); await settle(ctx.game); assert.equal(ctx.a.library.length, 11);
    const adventurer = put(ctx.game, ctx.a, simple('Adventurer', ['Creature'], {cost: '{0}', adventure: {adventure: true, name: 'Probe Adventure', cost: '{0}', altCostStr: '{0}', types: 'Sorcery', resolve: async () => {}}}), 'hand');
    const option = ctx.game.castableList(ctx.a).find(row => row.card === adventurer && row.alt?.adventure); assert.ok(option);
    assert.equal(await ctx.game.castSpell(ctx.a, adventurer, {from: 'hand', alt: option.alt}), true); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 11, 'the Adventure instant/sorcery face is not a creature spell');
    assert.equal(adventurer.zone, 'exile');
    assert.equal(await ctx.game.castSpell(ctx.a, adventurer, {from: 'exile'}), true); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 10, 'casting the actual creature half satisfies has Adventure');
  });

  test(`${role}: a subtype planeswalker condition requires the printed type, subtype and controller`, async () => {
    const ctx = setup(role), source = named(ctx, 'Walker Condition');
    put(ctx.game, ctx.a, simple('Ajani creature', ['Creature'], {subtypes: ['Ajani']}));
    put(ctx.game, ctx.b, simple('Enemy Ajani', ['Planeswalker'], {subtypes: ['Ajani'], loyalty: '4'}));
    const walker = put(ctx.game, ctx.a, simple('Own Chandra', ['Planeswalker'], {subtypes: ['Chandra'], loyalty: '4'}));
    assert.equal(source.power, 2);
    const correct = put(ctx.game, ctx.a, simple('Own Ajani', ['Planeswalker'], {subtypes: ['Ajani'], loyalty: '4'}));
    assert.equal(source.power, 3); assert.equal(source.toughness, 3);
    correct.ctrl = ctx.b; ctx.game.recalc(); assert.equal(source.power, 2);
    assert.equal(walker.hasSub('Ajani'), false);
  });

  test(`${role}: absent named counters enable a live static without confusing other counter kinds`, async () => {
    const ctx = setup(role), source = named(ctx, 'Empty Counters');
    assert.equal(source.power, 5); assert.equal(source.kw('flying'), true);
    ctx.game.addCounters(source, 'shell', 1); assert.equal(source.power, 2); assert.equal(source.kw('flying'), false);
    ctx.game.addCounters(source, 'charge', 2); ctx.game.removeCounters(source, 'shell', 1);
    assert.equal(source.power, 5); assert.equal(source.kw('flying'), true);
  });

  test(`${role}: creature graveyard thresholds are checked at trigger time and again at resolution`, async () => {
    const ctx = setup(role); named(ctx, 'Grave Condition');
    const dead = [];
    for (let i = 0; i < 3; i++) dead.push(put(ctx.game, ctx.a, 'Grizzly Bears', 'graveyard'));
    put(ctx.game, ctx.a, 'Forest', 'graveyard');
    await ctx.game.emit('upkeep', {player: ctx.a}); await settle(ctx.game); assert.equal(ctx.a.library.length, 12);
    const fourth = put(ctx.game, ctx.a, 'Grizzly Bears', 'graveyard');
    await ctx.game.emit('upkeep', {player: ctx.a}); await ctx.game.move(fourth, 'hand'); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 12, 'dropping below four before resolution suppresses the effect');
    await ctx.game.move(fourth, 'graveyard'); await ctx.game.emit('upkeep', {player: ctx.a}); await settle(ctx.game);
    assert.equal(ctx.a.library.length, 11);
  });

  test(`${role}: battlefield absence observes opponents and intervening changes`, async () => {
    const ctx = setup(role), source = named(ctx, 'Empty Battlefield');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.emit('endStep', {player: ctx.a}); await settle(ctx.game); assert.equal(source.zone, 'battlefield');
    await ctx.game.move(enemy, 'hand'); await ctx.game.emit('endStep', {player: ctx.a});
    await ctx.game.move(enemy, 'battlefield'); await settle(ctx.game); assert.equal(source.zone, 'battlefield');
    await ctx.game.move(enemy, 'hand'); await ctx.game.emit('endStep', {player: ctx.b}); await settle(ctx.game);
    assert.equal(source.zone, 'graveyard');
  });

  test(`${role}: shared control and turn records retain all printed conditions`, async () => {
    for (const withEnchantment of [false, true]) {
      const ctx = setup(role); put(ctx.game, ctx.a, simple('Artifact', ['Artifact']));
      if (withEnchantment) put(ctx.game, ctx.a, simple('Enchantment', ['Enchantment']));
      const source = named(ctx, 'Shared Control', ctx.a, 'hand'); await ctx.game.move(source, 'battlefield'); await settle(ctx.game);
      assert.equal(ctx.a.library.length, withEnchantment ? 11 : 12);
    }
    const ctx = setup(role); named(ctx, 'No Life Lost'); named(ctx, 'Discard Condition');
    await ctx.game.emit('endStep', {player: ctx.a}); await settle(ctx.game); assert.equal(ctx.a.life, 41); assert.equal(ctx.a.library.length, 12);
    await ctx.game.loseLife(ctx.a, 2, 'condition proof');
    const discarded = put(ctx.game, ctx.a, 'Forest', 'hand'); await ctx.game.discard(ctx.a, [discarded]);
    await ctx.game.emit('endStep', {player: ctx.a}); await settle(ctx.game);
    assert.equal(ctx.a.life, 39); assert.equal(ctx.a.library.length, 11);
  });
}
