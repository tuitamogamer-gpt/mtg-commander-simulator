import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
import { replacementProof, untapProof } from './helpers/oracle-v8-permanent-proof.mjs';

const MTG = loadEngine();
const sources = [
  ['Cast Draw', 'When you cast this spell, draw a card.'],
  ['Cast Return', 'When you cast this spell, return target creature card from your graveyard to your hand.'],
  ['First Main', 'At the beginning of your first main phase, you gain 2 life.'],
  ['Conditional First', 'At the beginning of your first main phase, if you control a Forest, draw a card.'],
  ['Opponent Combat', "At the beginning of combat on each opponent's turn, you gain 2 life."],
  ['Opponent Draw', "At the beginning of each opponent's draw step, that player loses 1 life."],
  ['Every Combat', 'At the beginning of each combat, put a +1/+1 counter on this creature.'],
  ['Turn Bonus', 'During your turn, Elf creatures you control get +1/+1 and have vigilance.', 'Enchantment'],
  ['Forest Bonus', 'Other Elf creatures you control get +1/+1 for each Forest you control.', 'Creature — Elf'],
  ['Life Difference', "V8 Life Difference's power and toughness are each equal to your life total minus 7."],
  ['Casting Sacrifice', 'When you cast a creature spell, sacrifice this creature.'],
  ['Turn Equipment', 'During your turn, equipped creature gets +2/+0 and has first strike.\nEquip {1}', 'Artifact — Equipment'],
  ['Green Aura', 'Enchant creature\nAs long as enchanted creature is green, it gets +2/+0 and has trample.', 'Enchantment — Aura'],
  ['Relative Elves', 'All Elf creatures get +1/+1 for each other Elf on the battlefield.', 'Enchantment'],
  ['Limited Draw', '{G}: Draw a card. Activate only during your turn and only once each turn.'],
  ['Sorcery Draw', '{G}: Draw a card. Activate only as a sorcery and only once each turn.'],
  ['Combined Events', 'Whenever this creature enters, attacks, or dies, you gain 1 life.'],
  ['Once Combat', 'At the beginning of each combat, you gain 2 life. This ability triggers only once each turn.'],
  ['Once Life', 'Whenever you gain life, draw a card. This ability triggers only once each turn.'],
  ['Once Paired', 'When this creature enters and whenever you gain life, draw a card. This ability triggers only once each turn.'],
  ['Restricted Bonus', "As long as this creature has a +1/+1 counter on it, it gets +2/+2 and can't block."],
  ['Threshold Counters', 'As long as this creature has four or more +1/+1 counters on it, it has flying and vigilance.'],
  ['Only Creature', 'As long as you control exactly one creature, that creature gets +3/+1 and has lifelink.', 'Enchantment'],
  ['Total Power', 'At the beginning of your first main phase, if creatures you control have total power 8 or greater, draw a card.'],
  ['Type Aura', "Enchant permanent\nAs long as enchanted permanent is a creature, it gets -1/-1 and can't block.", 'Enchantment — Aura'],
  ['Small Library', 'This creature gets +3/+3 as long as a library has ten or fewer cards in it.'],
  ['Quoted Equipment', 'Equipped creature gets +0/+1 and has "This creature has hexproof as long as it\'s untapped."\nEquip {1}', 'Artifact — Equipment'],
  ['Otherwise Aura', "Enchant creature\nEnchanted creature gets +2/+2 as long as it's green. Otherwise, it gets -1/-1.", 'Enchantment — Aura'],
  ['Separate Sentences', 'As long as you have 45 or more life, this creature has flying. This creature gets +1/+1.'],
  ['Granted Activation', 'As long as you control a Forest, this creature gets +2/+2 and has "{G}: Draw a card."'],
  ['Grave Land', 'Whenever a land card is put into your graveyard from anywhere, you gain 1 life.'],
  ['Opponent Grave', "Whenever a card is put into an opponent's graveyard from anywhere, that player loses 1 life."],
  ['Cycle Other', 'Whenever you cycle another card, put a +1/+1 counter on this creature.'],
  ['Group Counters', 'Whenever one or more +1/+1 counters are put on a creature you control, draw a card.'],
  ['Group Targeted', 'Whenever a creature or planeswalker you control becomes the target of a spell or ability an opponent controls, draw a card.', 'Enchantment'],
  ['Attack Alone', 'Whenever a creature you control attacks alone, it gets +2/+2 until end of turn.', 'Enchantment'],
  ['Attack Two', 'Whenever you attack with two or more creatures, draw a card.', 'Enchantment'],
  ['Damage Creature', 'Whenever this creature deals damage to a creature, destroy that creature.'],
  ['Damage Two Kinds', 'Whenever this creature deals combat damage to a player or planeswalker, draw a card.'],
  ['Foreign Cast', 'Whenever an opponent casts a blue or black spell, draw a card.'],
  ['Sacrifice Player', 'Whenever a player sacrifices an artifact, draw a card.'],
  ['Grave Entry', 'When this artifact enters or is put into a graveyard from the battlefield, draw a card.', 'Artifact'],
  ['Last Counter', 'When the last time counter is removed from this creature, sacrifice this creature.'],
  ['Cycling Payment', 'Cycling {1}'],
  ['Damage Double', 'If a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead.', 'Enchantment'],
  ['Damage Plus', 'If a source you control would deal damage to a permanent or player, it deals that much damage plus 1 to that permanent or player instead.', 'Enchantment'],
  ['Red Damage Plus', 'If another red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead.', 'Enchantment'],
  ['Damage Reduce', 'If a source would deal damage to a creature you control, it deals that much damage minus 1 to that creature instead.', 'Enchantment'],
  ['Damage Half', 'If a source would deal damage to a permanent or player, it deals half that damage, rounded down, to that permanent or player instead.', 'Enchantment'],
  ['Damage Cap', 'If a source would deal 3 or more damage to a permanent or player, it deals 2 damage to that permanent or player instead.', 'Enchantment'],
  ['Damage Plus Two', 'If a source you control would deal damage to a permanent or player, it deals that much damage plus 2 instead.', 'Enchantment'],
  ['Self Damage Double', 'If this creature would deal combat damage to a player, it deals double that damage to that player instead.'],
  ['Damage Aura', 'Enchant creature\nIf enchanted creature would deal combat damage to a permanent or player, it deals double that damage instead.', 'Enchantment — Aura'],
  ['Life Double', 'If you would gain life, you gain twice that much life instead.', 'Enchantment'],
  ['Life Plus', 'If you would gain life, you gain that much life plus 1 instead.', 'Enchantment'],
  ['Token Double', 'If one or more tokens would be created under your control, twice that many of those tokens are created instead.', 'Enchantment'],
  ['Token Food', 'If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead.', 'Enchantment'],
  ['Token Soldier', 'If one or more creature tokens would be created under your control, those tokens plus a 1/1 white Soldier creature token are created instead.', 'Enchantment'],
  ['Attack Unless', 'This creature attacks each combat if able unless you control another Elf.'],
  ['Attack Condition', 'As long as you have 45 or more life, this creature gets +2/+2, has flying, and attacks each combat if able.'],
  ['Event Counter Leaves', 'Whenever a creature you control with a +1/+1 counter on it leaves the battlefield, create a Mutagen token for each +1/+1 counter on it.', 'Artifact'],
  ['Source Counter Leaves', 'Whenever a creature you control with a +1/+1 counter on it leaves the battlefield, create a Mutagen token for each +1/+1 counter on this artifact.', 'Artifact'],
  ['Blocked Mine', 'Whenever a creature you control becomes blocked, it gets +1/+1 until end of turn.', 'Enchantment'],
  ['Blocked Death', 'Whenever this creature becomes blocked by a green creature, destroy that creature.'],
  ['Blocked Pair', "Whenever this creature blocks or becomes blocked by a creature, destroy that creature. It can't be regenerated. You gain life equal to that creature's toughness."],
  ['Blocked Equipment', 'Equipped creature gets +0/+1.\nWhenever equipped creature becomes blocked, it deals 1 damage to defending player.\nEquip {1}', 'Artifact — Equipment'],
  ['Blocked Group', 'Whenever this creature becomes blocked by one or more green creatures, it gets +2/+2 until end of turn.'],
  ['Block Both Aura', 'Enchant creature\nWhenever enchanted creature blocks or becomes blocked, it gets +0/+3 until end of turn and you gain 1 life.', 'Enchantment — Aura'],
  ['When Foreign Cast', 'When an opponent casts a blue spell, draw a card.', 'Enchantment'],
  ['When Equipment', 'When this Equipment enters, draw a card.', 'Artifact — Equipment'],
  ['Plain Discard', 'Whenever an opponent discards a card, this enchantment deals 2 damage to that player.', 'Enchantment'],
  ['Optional Untap', 'You may choose not to untap this creature during your untap step.'],
  ['Optional Artifact', 'You may choose not to untap this artifact during your untap step.', 'Artifact'],
  ['Depletion Rest', "This creature doesn't untap during your untap step if it has a depletion counter on it."],
  ['Nonbasic Rest', "Nonbasic lands don't untap during their controllers' untap steps.", 'Enchantment'],
  ['Snow Rest', "Snow permanents don't untap during their controllers' untap steps.", 'Enchantment'],
  ['Power Rest', "Nonwhite creatures with power 3 or greater don't untap during their controllers' untap steps.", 'Enchantment'],
  ['Conditional Rest', "As long as this artifact is untapped, creatures don't untap during their controllers' untap steps.", 'Artifact'],
  ['Rest Equipment', "Equipped creature gets +4/+2 and doesn't untap during its controller's untap step.\nEquip {1}", 'Artifact — Equipment'],
  ['Tapped Rest', "This creature enters tapped and doesn't untap during your untap step."],
  ['Hidden Animation', 'When an opponent casts an instant spell, if this permanent is an enchantment, it becomes a 4/4 Ape creature.', 'Enchantment'],
  ['Phantom Shield', 'If damage would be dealt to this creature, prevent that damage. Remove a +1/+1 counter from this creature.'],
  ['Conditional Phantom', 'If damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove a +1/+1 counter from it.'],
  ['Hydra Shield', 'If damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from this creature.'],
  ['Prevented Grow', 'If damage would be dealt to this creature, prevent that damage. Put a +1/+1 counter on this creature for each 1 damage prevented this way.'],
  ['Damage Grow', 'If damage would be dealt to this creature, prevent that damage and put that many +1/+1 counters on it.'],
  ['Other Prevented Grow', 'If damage would be dealt to another creature you control, prevent that damage. Put a +1/+1 counter on that creature for each 1 damage prevented this way.'],
  ['Small Prevention', 'If a source would deal 3 or less damage to this creature, prevent that damage.'],
  ['Creature Shield', 'Prevent all damage that would be dealt to this creature by creatures.'],
  ['Flat Shield Equipment', 'If a source would deal damage to equipped creature, prevent 2 of that damage.\nEquip {1}', 'Artifact — Equipment'],
  ['Dinosaur Shield', 'If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage.', 'Creature — Dinosaur'],
  ['Both Combat Aura', 'Enchant creature\nPrevent all combat damage that would be dealt to and dealt by enchanted creature.', 'Enchantment — Aura'],
  ['Combat Outgoing', 'Prevent all combat damage that would be dealt by this creature.'],
  ['Friendly Prevention', 'Prevent all damage that would be dealt to creatures you control by sources you control.', 'Enchantment'],
  ['Cast Damage', 'When you cast this spell, this creature deals 1 damage to target creature.'],
  ['Counter Legacy', 'Lifelink\nWhenever you gain life, put a +1/+1 counter on this creature.\nWhen this creature dies, put X +1/+1 counters on each legendary creature you control, where X is the number of +1/+1 counters on this creature.'],
  ['Opponent Rest', "This creature doesn't untap during your untap step if an opponent controls two or more creatures."],
  ['Attacking Touch', 'Attacking creatures you control have deathtouch.', 'Enchantment'],
  ['Blocking Reach', 'Blocking creatures you control have reach.', 'Enchantment'],
];

function input(name, oracle_text, type_line = 'Creature — Bear') {
  return {name: 'V8 ' + name, oracle_text, type_line, layout: 'normal', mana_cost: '{1}{G}', power: name === 'Life Difference' ? '*' : '2', toughness: name === 'Life Difference' ? '*' : '2'};
}

const fixtures = sources.map((args, index) => {
  const card = input(...args);
  const semantic = semanticClass(card, {compilerVersion: 8});
  assert.ok(semantic.semanticClass, card.name + ': ' + semantic.reason);
  return {position: index + 1, oracleId: 'v8-permanent-' + index, scryfallId: 'v8-permanent-print-' + index, ...semantic,
    raw: {name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: card.type_line.split(' — ')[0].split(' '), subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], super: [], power: card.power, toughness: card.toughness, _ci: ['G']},
    catalog: {typeLine: card.type_line, commanderLegality: 'legal'}};
});
MTG.registerOracleBatch({id: 'oracle-v8-permanents-test', sequence: 9997, cards: fixtures});
MTG.initData(MTG.RAW_DATA);

function put(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, player);
  card.zone = zone;
  card.ctrl = player;
  card.sick = false;
  if (zone === 'battlefield') { game.battlefield.push(card); game.recalc(); }
  else player[zone].push(card);
  return card;
}

function context(role, options = {}) {
  const decisions = [], otherDecisions = [];
  const human = {decide: async (game, query) => {
    if (query.type === 'priority') return {kind: 'pass'};
    if (query.type === 'chooseTargets') return query.candidates.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseCards') return query.from.slice(0, query.max ?? query.min ?? 1);
    if (query.type === 'chooseOption') return query.aiHint?.kind === 'optionalUntap' && options.optionalUntapChoice ? options.optionalUntapChoice : query.options.find(option => option.source?.name === options.replacementFirst)?.key ?? query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'attackers') return options.attackers?.(query) || [];
    if (query.type === 'blockers') return options.blockers?.(query) || [];
    if (query.type === 'scry') return {top: query.cards, bottom: []};
    return null;
  }};
  const game = new MTG.Game({seed: 127156, paced: false});
  const a = game.addPlayer('A', {name: 'A'}, {decide: human.decide}, role === 'ai');
  const b = game.addPlayer('B', {name: 'B'}, {decide: human.decide}, false);
  if (role === 'ai') a.controller = new MTG.AIController(a, {difficulty: 'hard', style: 'balanced'});
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (currentGame, query) => {
    const result = await decide(currentGame, query);
    decisions.push({query, result});
    return result;
  };
  const otherDecide = b.controller.decide.bind(b.controller);
  b.controller.decide = async (currentGame, query) => {
    const result = await otherDecide(currentGame, query);
    otherDecisions.push({query, result});
    return result;
  };
  game.turnPlayer = a;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  for (const player of [a, b]) for (let index = 0; index < 15; index++) put(game, player, 'Forest', 'library');
  return {game, a, b, decisions, otherDecisions};
}

function replacementChoices(ctx, event) {
  return ctx.decisions.filter(row => row.query.aiHint?.kind === 'replacementOrder' && row.query.aiHint.event === event);
}

function chosenSource(row) {
  return row?.query.options.find(option => option.key === String(row.result))?.source?.name;
}

async function attackInto(ctx, blockers) {
  const original = ctx.b.controller.decide.bind(ctx.b.controller);
  ctx.b.controller.decide = (game, query) => query.type === 'blockers'
    ? blockers.filter(card => query.potential.includes(card)).map(blocker => ({blocker, attacker: query.attackers[0]}))
    : original(game, query);
  ctx.game.untilEffects.push({kind: 'mustAttack', who: ctx.a, expires: 'eot'});
  await ctx.game.combatPhase(ctx.a);
  await settle(ctx.game);
  assert.ok(ctx.decisions.some(row => row.query.type === 'attackers'), 'the selected human or actual local AI makes an attack declaration');
}

async function untilUpkeep(ctx, player = ctx.a) {
  const boundary = new Error('untap phase completed');
  const emit = ctx.game.emit.bind(ctx.game);
  ctx.game.emit = async (event, data) => {
    if (event === 'upkeep' && data.player === player) throw boundary;
    return emit(event, data);
  };
  ctx.game.turnPlayer = player;
  try { await assert.rejects(ctx.game.runTurn(), error => error === boundary); }
  finally { ctx.game.emit = emit; }
  assert.equal(ctx.game.phase, 'upkeep');
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false);
}

// A small adapter exercises the separately dispatched bulk proof against
// these known fixtures without importing or running the entire bulk suite.
function bulkProofHelpers() {
  const fixtureDefinition = (name, types = ['Creature'], extra = {}) => ({name, types, subtypes: [], super: [], cost: '{1}', power: '2', toughness: '20', oracle: '', ...extra});
  return {
    gameFor: (engine, controllers, options) => {
      const ctx = context(options.ai ? 'ai' : 'human');
      ctx.game.priorityRound = async () => {};
      ctx.role = options.ai ? 'ai' : 'human';
      return ctx;
    },
    decision: () => null,
    fund: player => { for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 100; },
    fillLibrary: () => {},
    stageCardCosts: () => {},
    fixtureDefinition,
    zoneCard: (engine, player, definition, zone) => {
      const card = new engine.CardInst(typeof definition === 'string' ? engine.DEFS[definition] : definition, player);
      card.zone = zone; player[zone].push(card); return card;
    },
    permanent: (engine, game, player, definition) => put(game, player, definition),
    resolveAll: settle,
    assertControllerRole: (engine, ctx) => assert.equal(ctx.a.controller instanceof engine.AIController, ctx.role === 'ai'),
    stageGenericTarget: (engine, ctx, target, label) => {
      const types = target.what === 'land' ? ['Land'] : target.what === 'artifact' ? ['Artifact'] : target.what === 'enchantment' || target.what === 'permanent' ? ['Enchantment'] : ['Creature'];
      const def = fixtureDefinition('Proof target ' + label, types, {power: String(target.minPower ?? (target.stat === 'power' && target.comparison === 'greater' ? target.threshold : 2)),
        super: target.snow ? ['Snow'] : [], subtypes: target.subtype ? [target.subtype] : [],
        colorsOverride: target.colorsAny || (target.color ? [{red: 'R', green: 'G', blue: 'U', black: 'B', white: 'W'}[target.color]] : [])});
      const card = put(ctx.game, target.controller === 'opponent' ? ctx.b : ctx.a, def, target.zone === 'graveyard' ? 'graveyard' : 'battlefield');
      if (target.hasCounter) ctx.game.addCounters(card, target.hasCounter, 1);
      return card;
    },
  };
}

async function settle(game) {
  let steps = 0;
  while ((game.pendingTriggers.length || game.stack.length) && steps++ < 50) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
}

async function paidCast(ctx, name) {
  const card = put(ctx.game, ctx.a, 'V8 ' + name, 'hand');
  ctx.a.pool.C = 1;
  ctx.a.pool.G = 1;
  assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'hand'}), true);
  assert.equal(ctx.a.pool.C + ctx.a.pool.G, 0, 'actual printed mana cost is spent');
  return card;
}

test('v8 permanent clauses add closed grammar without rewriting supported v7 descriptors', () => {
  for (const args of sources) {
    const card = input(...args);
    const old = semanticClass(card, {compilerVersion: 7});
    const next = semanticClass(card, {compilerVersion: 8});
    if (old.semanticClass) assert.deepEqual(next, old, card.name + ': frozen old descriptor');
    else assert.ok(next.semanticClass, card.name + ': new complete grammar');
    assert.equal(semanticClass({...card, oracle_text: card.oracle_text + ' Invent an unsupported effect.'}, {compilerVersion: 8}).semanticClass, undefined, card.name + ': no suffix truncation');
  }
  for (const text of [
    'At the beginning of your fifteenth main phase, draw a card.',
    'When you cast this spell, draw X cards.',
    'During your turn, this creature gains mysterious flying.',
    'Whenever a made-up permanent you control enters, draw a card.',
    'As long as you remembered a number, this creature gets +1/+1.',
    'If a source would deal damage to a player, it deals double that damage to that creature instead.',
    'If a source would deal damage to a player, it deals double that damage and draws a card instead.',
    'If you would gain life, you gain twice that much life except on Fridays instead.',
    'If one or more creature tokens would be created under your control, those tokens plus a mysterious token are created instead.',
    'If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',
    'Whenever you gain life, draw a card. This ability triggers only twice each turn.',
    '{T}: Draw a card. This ability triggers only once each turn.',
    'Whenever you gain life, draw a card. This ability triggers only once each turn. Draw a card.',
    'Whenever you gain life, draw a card. This ability triggers only once each turn',
    'This ability triggers only once each turn.',
  ]) assert.equal(semanticClass(input('Unknown', text), {compilerVersion: 8}).semanticClass, undefined, text);
});

for (const role of ['human', 'ai']) {
  test(`v8 ${role}: attacking and blocking adjectives remain live combat predicates`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Attacking Touch');
    await paidCast(ctx, 'Blocking Reach');
    await settle(ctx.game);
    const active = put(ctx.game, ctx.a, 'Grizzly Bears');
    const idle = put(ctx.game, ctx.a, 'Grizzly Bears');
    const opponent = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(active.kw('deathtouch'), false);
    assert.equal(active.kw('reach'), false);

    active.attacking = ctx.b;
    opponent.attacking = ctx.a;
    ctx.game.recalc();
    assert.equal(active.kw('deathtouch'), true, 'the controller\'s current attacker receives the grant');
    assert.equal(idle.kw('deathtouch'), false, 'an idle creature is not an Attacking subtype');
    assert.equal(opponent.kw('deathtouch'), false, 'an opponent attacker is outside creatures you control');
    active.attacking = null;
    opponent.attacking = null;
    ctx.game.recalc();
    assert.equal(active.kw('deathtouch'), false, 'the grant expires with combat state');

    active.blocking = opponent.iid;
    opponent.blocking = active.iid;
    ctx.game.recalc();
    assert.equal(active.kw('reach'), true, 'the controller\'s current blocker receives the grant');
    assert.equal(idle.kw('reach'), false, 'an idle creature is not a Blocking subtype');
    assert.equal(opponent.kw('reach'), false, 'an opponent blocker is outside creatures you control');
    active.blocking = null;
    opponent.blocking = null;
    ctx.game.recalc();
    assert.equal(active.kw('reach'), false, 'the blocking grant expires with combat state');
  });

  test(`v8 ${role}: bulk replacement proof checks every new replacement fixture through its original card`, async () => {
    let checked = 0;
    for (const entry of fixtures) for (const operation of entry.implementation) if (operation.kind === 'v8-replacement') {
      assert.ok(await replacementProof(MTG, entry, operation, role, bulkProofHelpers()) >= 10);
      checked++;
    }
    assert.ok(checked >= 12, 'all source, recipient, life and token replacement variants are exercised');
  });

  test(`v8 ${role}: bulk untap proof uses every original static and optional-untap fixture`, async () => {
    let checked = 0;
    for (const entry of fixtures) for (const operation of entry.implementation) if (operation.kind === 'generic-static' && (operation.cantUntap || operation.optionalUntap) || operation.kind === 'attachment-grant' && operation.skipUntap) {
      assert.ok(await untapProof(MTG, entry, operation, role, bulkProofHelpers()) >= 10);
      checked++;
    }
    assert.ok(checked >= 9);
  });

  test(`v8 ${role}: a paid cast trigger resolves independently after its spell is countered`, async () => {
    const ctx = context(role);
    const before = ctx.a.library.length;
    let countered = false;
    const priority = ctx.game.priorityRound;
    ctx.game.priorityRound = async function (...args) {
      const spell = this.stack.find(object => object.card?.name === 'V8 Cast Draw' && object.kind === 'spell');
      if (spell && !countered) {
        countered = true;
        await this.flushTriggers();
        assert.ok(this.stack.some(object => object.kind === 'trigger' && object.srcCard === spell.card));
        await this.counterStackObject(spell);
      }
      return priority.apply(this, args);
    };
    const card = await paidCast(ctx, 'Cast Draw');
    assert.equal(countered, true, 'the spell was countered during its real priority round');
    assert.equal(card.zone, 'graveyard');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'the independent cast trigger still draws exactly one card');
  });

  test(`v8 ${role}: copying a spell and entering without casting do not create extra cast triggers`, async () => {
    const ctx = context(role);
    const before = ctx.a.library.length;
    let copied = false;
    const priority = ctx.game.priorityRound;
    ctx.game.priorityRound = async function (...args) {
      const spell = this.stack.find(object => object.card?.name === 'V8 Cast Draw' && object.kind === 'spell');
      if (spell && !copied) {
        copied = true;
        await this.copySpell(spell, ctx.a, {mayNewTargets: false});
      }
      return priority.apply(this, args);
    };
    await paidCast(ctx, 'Cast Draw');
    await settle(ctx.game);
    assert.equal(copied, true);
    assert.equal(ctx.a.library.length, before - 1, 'copying is not casting');
    const direct = put(ctx.game, ctx.a, 'V8 Cast Draw', 'hand');
    await ctx.game.move(direct, 'battlefield');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'putting a permanent on the battlefield is not casting');
  });

  test(`v8 ${role}: unpayable and mistimed casts leave mana, zones and triggers unchanged`, async () => {
    const ctx = context(role);
    const card = put(ctx.game, ctx.a, 'V8 Cast Draw', 'hand');
    ctx.a.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, card, {from: 'hand'}), false);
    assert.equal(ctx.a.pool.G, 1);
    assert.equal(card.zone, 'hand');
    assert.equal(ctx.game.pendingTriggers.length, 0);
    ctx.a.pool.C = 1;
    ctx.game.turnPlayer = ctx.b;
    assert.equal(ctx.game.canCastTiming(ctx.a, card), false);
    assert.equal(ctx.game.castableList(ctx.a).some(row => row.card === card), false, 'normal action generation offers no mistimed cast');
    assert.equal(ctx.a.pool.C + ctx.a.pool.G, 2);
    assert.equal(card.zone, 'hand');
    assert.equal(ctx.game.stack.length, 0);
  });

  test(`v8 ${role}: a cast trigger asks the actual controller for a legal graveyard target`, async () => {
    const ctx = context(role);
    const legal = put(ctx.game, ctx.a, 'Grizzly Bears', 'graveyard');
    const wrongType = put(ctx.game, ctx.a, 'Forest', 'graveyard');
    const wrongOwner = put(ctx.game, ctx.b, 'Grizzly Bears', 'graveyard');
    await paidCast(ctx, 'Cast Return');
    await settle(ctx.game);
    assert.equal(legal.zone, 'hand');
    assert.equal(wrongType.zone, 'graveyard');
    assert.equal(wrongOwner.zone, 'graveyard');
    const targetChoice = ctx.decisions.find(row => row.query.type === 'chooseTargets');
    assert.ok(targetChoice);
    assert.deepEqual(Array.from(targetChoice.query.candidates), [legal]);
    if (role === 'ai') assert.ok(ctx.a.controller instanceof MTG.AIController);
  });

  test(`v8 ${role}: the first-main trigger runs through the real turn event before main actions`, async () => {
    const ctx = context(role);
    const card = await paidCast(ctx, 'First Main');
    await settle(ctx.game);
    assert.equal(card.zone, 'battlefield');
    const before = ctx.a.life;
    const stop = Symbol('at main actions');
    ctx.game.mainPhase = async () => {
      await settle(ctx.game);
      throw stop;
    };
    try { await ctx.game.runTurn(); assert.fail('expected the main-action boundary'); }
    catch (error) { if (error !== stop) throw error; }
    assert.equal(ctx.game.phase, 'main1');
    assert.equal(ctx.a.life, before + 2);
  });

  test(`v8 ${role}: an intervening-if is checked both on its event and on resolution`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Conditional First');
    await settle(ctx.game);
    const before = ctx.a.library.length;
    await ctx.game.emit('precombatMain', {player: ctx.a});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'false condition does not create a trigger');
    const forest = put(ctx.game, ctx.a, 'Forest');
    await ctx.game.emit('precombatMain', {player: ctx.b});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'opponent main phase does not trigger');
    await ctx.game.emit('precombatMain', {player: ctx.a});
    await ctx.game.flushTriggers();
    assert.equal(ctx.game.stack.length, 1);
    await ctx.game.move(forest, 'hand');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before, 'condition became false before resolution');
    await ctx.game.move(forest, 'battlefield');
    await ctx.game.emit('precombatMain', {player: ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
  });

  test(`v8 ${role}: combat and draw-step event ownership is preserved`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Opponent Combat');
    await settle(ctx.game);
    await paidCast(ctx, 'Opponent Draw');
    await settle(ctx.game);
    const all = await paidCast(ctx, 'Every Combat');
    await settle(ctx.game);
    const ownLife = ctx.a.life;
    const opponentLife = ctx.b.life;
    await ctx.game.emit('beginCombat', {player: ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.a.life, ownLife);
    assert.equal(all.counters['+1/+1'], 1);
    await ctx.game.emit('beginCombat', {player: ctx.b});
    await settle(ctx.game);
    assert.equal(ctx.a.life, ownLife + 2);
    assert.equal(all.counters['+1/+1'], 2);
    await ctx.game.emit('drawStep', {player: ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.b.life, opponentLife);
    await ctx.game.emit('drawStep', {player: ctx.b});
    await settle(ctx.game);
    assert.equal(ctx.b.life, opponentLife - 1);
    assert.equal(ctx.a.life, ownLife + 2, 'that player remains the event player, not the source controller');
  });

  test(`v8 ${role}: turn statics affect only matching friendly creatures and expire with the turn`, async () => {
    const ctx = context(role);
    const ownElf = put(ctx.game, ctx.a, 'Llanowar Elves');
    const opponentElf = put(ctx.game, ctx.b, 'Llanowar Elves');
    const ownBear = put(ctx.game, ctx.a, 'Grizzly Bears');
    await paidCast(ctx, 'Turn Bonus');
    await settle(ctx.game);
    assert.equal(ownElf.power, 2);
    assert.ok(ownElf.kw('vigilance'));
    assert.equal(opponentElf.power, 1);
    assert.equal(ownBear.power, 2);
    ctx.game.turnPlayer = ctx.b;
    ctx.game.recalc();
    assert.equal(ownElf.power, 1);
    assert.equal(ownElf.kw('vigilance'), false);
    assert.equal(opponentElf.kw('vigilance'), false);
  });

  test(`v8 ${role}: counted group statics exclude the source and recalculate after control changes`, async () => {
    const ctx = context(role);
    const ownElf = put(ctx.game, ctx.a, 'Llanowar Elves');
    const opponentElf = put(ctx.game, ctx.b, 'Llanowar Elves');
    const forest = put(ctx.game, ctx.a, 'Forest');
    const source = await paidCast(ctx, 'Forest Bonus');
    await settle(ctx.game);
    assert.equal(source.power, 2, 'other excludes the source');
    assert.equal(ownElf.power, 2);
    assert.equal(opponentElf.power, 1);
    forest.ctrl = ctx.b;
    ctx.game.recalc();
    assert.equal(ownElf.power, 1, 'Forest must still be controlled by the effect controller');
  });

  test(`v8 ${role}: characteristic arithmetic follows the owner outside the battlefield and controller on it`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Life Difference');
    await settle(ctx.game);
    assert.equal(source.power, 33);
    assert.equal(source.toughness, 33);
    ctx.b.life = 20;
    source.ctrl = ctx.b;
    ctx.game.recalc();
    assert.equal(source.power, 13);
    await ctx.game.move(source, 'hand');
    assert.equal(source.owner, ctx.a);
    assert.equal(source.power, 33);
  });

  test(`v8 ${role}: When-you-cast observers ignore opponent casts and fire on the correct spell type`, async () => {
    const ctx = context(role);
    const observer = await paidCast(ctx, 'Casting Sacrifice');
    await settle(ctx.game);
    assert.equal(observer.zone, 'battlefield', 'observer does not see its own cast from the Stack');
    const opponentSpell = put(ctx.game, ctx.b, 'Grizzly Bears', 'hand');
    ctx.game.turnPlayer = ctx.b;
    ctx.b.pool.C = 1;
    ctx.b.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.b, opponentSpell, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.equal(observer.zone, 'battlefield');
    ctx.game.turnPlayer = ctx.a;
    const ownSpell = await paidCast(ctx, 'Cast Draw');
    await settle(ctx.game);
    assert.equal(observer.zone, 'graveyard');
    assert.equal(ownSpell.zone, 'battlefield');
  });

  test(`v8 ${role}: an Equipment turn condition grants abilities only to its actual host`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const equipment = await paidCast(ctx, 'Turn Equipment');
    await settle(ctx.game);
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === equipment && row.equip);
    assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(equipment.attachedTo, host.iid);
    const other = put(ctx.game, ctx.b, 'Grizzly Bears');
    const otherEquipment = put(ctx.game, ctx.b, 'Bonesplitter');
    await ctx.game.attach(otherEquipment, other);
    assert.equal(host.power, 4);
    assert.ok(host.kw('first strike'));
    assert.equal(other.power, 4, 'the other host receives only its own Bonesplitter bonus');
    assert.equal(other.kw('first strike'), false);
    ctx.game.turnPlayer = ctx.b;
    ctx.game.recalc();
    assert.equal(host.power, 2);
    assert.equal(host.kw('first strike'), false);
    assert.equal(other.power, 4);
  });

  test(`v8 ${role}: a host-color condition follows the attached creature when the Aura is moved`, async () => {
    const ctx = context(role);
    const green = put(ctx.game, ctx.a, 'Grizzly Bears');
    const aura = await paidCast(ctx, 'Green Aura');
    await settle(ctx.game);
    assert.equal(aura.attachedTo, green.iid);
    assert.equal(green.power, 4);
    assert.ok(green.kw('trample'));
    const white = put(ctx.game, ctx.a, 'Elite Vanguard');
    await ctx.game.attach(aura, white);
    assert.equal(green.power, 2);
    assert.equal(green.kw('trample'), false);
    assert.equal(white.power, 2);
    assert.equal(white.kw('trample'), false, 'the green Aura does not satisfy its white host condition');
  });

  test(`v8 ${role}: each other counts relative to each recipient, not the Enchantment source`, async () => {
    const ctx = context(role);
    const first = put(ctx.game, ctx.a, 'Llanowar Elves');
    const second = put(ctx.game, ctx.b, 'Llanowar Elves');
    await paidCast(ctx, 'Relative Elves');
    await settle(ctx.game);
    assert.equal(first.power, 2);
    assert.equal(second.power, 2);
    await ctx.game.move(second, 'hand');
    assert.equal(first.power, 1);
  });

  for (const name of ['Limited Draw', 'Sorcery Draw']) test(`v8 ${role}: ${name} enforces turn, timing and once-per-turn at activation`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, name);
    await settle(ctx.game);
    ctx.a.pool.G = 3;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === source);
    assert.ok(action);
    ctx.game.turnPlayer = ctx.b;
    assert.equal(ctx.game.activatableList(ctx.a).some(row => row.card === source), false);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), false, 'stale action cannot bypass the turn condition');
    assert.equal(ctx.a.pool.G, 3);
    ctx.game.turnPlayer = ctx.a;
    if (name === 'Sorcery Draw') {
      ctx.game.phase = 'combat';
      assert.equal(await ctx.game.activateAbility(ctx.a, action), false);
      assert.equal(ctx.a.pool.G, 3);
      ctx.game.phase = 'main1';
    }
    const before = ctx.a.library.length;
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
    assert.equal(ctx.a.pool.G, 2);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), false);
    assert.equal(ctx.a.pool.G, 2);
  });

  test(`v8 ${role}: combined self events and once-per-turn combat triggers keep exact event boundaries`, async () => {
    const ctx = context(role);
    const before = ctx.a.life;
    const source = await paidCast(ctx, 'Combined Events');
    await settle(ctx.game);
    assert.equal(ctx.a.life, before + 1);
    const other = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.emit('attacks', {card: other, player: ctx.b, defender: ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.a.life, before + 1);
    await ctx.game.emit('attacks', {card: source, player: ctx.a, defender: ctx.b});
    await settle(ctx.game);
    assert.equal(ctx.a.life, before + 2);
    await ctx.game.move(source, 'graveyard');
    await settle(ctx.game);
    assert.equal(ctx.a.life, before + 3);
    await paidCast(ctx, 'Once Combat');
    await settle(ctx.game);
    for (let index = 0; index < 2; index++) { await ctx.game.emit('beginCombat', {player: ctx.a}); await settle(ctx.game); }
    assert.equal(ctx.a.life, before + 5);
    ctx.game.turnNo++;
    await ctx.game.emit('beginCombat', {player: ctx.b});
    await settle(ctx.game);
    assert.equal(ctx.a.life, before + 7);
  });

  test(`v8 ${role}: once-each-turn triggers ignore false events, follow one object incarnation, and reset for a new object`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Once Life');
    await settle(ctx.game);
    const initialLibrary = ctx.a.library.length;
    await ctx.game.gainLife(ctx.b, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, initialLibrary, 'an opponent life-gain event does not consume the source limit');
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, initialLibrary - 1);
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, initialLibrary - 1, 'a second matching event in the turn creates no trigger');

    const oldVersion = source.zoneVersion;
    await ctx.game.move(source, 'hand');
    ctx.a.pool.C = 1;
    ctx.a.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, source, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.ok(source.zoneVersion > oldVersion);
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, initialLibrary - 2, 'a returned card is a new object and may trigger in the same turn');
    ctx.game.turnNo++;
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, initialLibrary - 3, 'the same object regains its permission next turn');
  });

  test(`v8 ${role}: one printed limit is shared by every event of the same triggered ability`, async () => {
    const ctx = context(role);
    const before = ctx.a.library.length;
    const source = await paidCast(ctx, 'Once Paired');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'the enters event consumes this turn\'s trigger');
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'the paired life-gain event shares the printed limit');
    ctx.game.turnNo++;
    await ctx.game.gainLife(ctx.a, 1, source);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 2);
  });

  test(`v8 ${role}: conditional pump and cannot-block resolve in the same continuous state`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Restricted Bonus');
    await settle(ctx.game);
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(source.power, 2);
    assert.equal(ctx.game.canBlock(source, attacker), true);
    ctx.game.addCounters(source, '+1/+1', 1);
    assert.equal(source.power, 5);
    assert.equal(ctx.game.canBlock(source, attacker), false);
    ctx.game.removeCounters(source, '+1/+1', 1);
    assert.equal(source.power, 2);
    assert.equal(ctx.game.canBlock(source, attacker), true);
  });

  test(`v8 ${role}: counter thresholds and exactly-one continuous effects follow both boundaries`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Threshold Counters');
    await settle(ctx.game);
    ctx.game.addCounters(source, '+1/+1', 3);
    assert.equal(source.kw('flying'), false);
    ctx.game.addCounters(source, '+1/+1', 1);
    assert.ok(source.kw('flying'));
    assert.ok(source.kw('vigilance'));
    ctx.game.removeCounters(source, '+1/+1', 1);
    assert.equal(source.kw('flying'), false);
    const baseline = source.power;
    await paidCast(ctx, 'Only Creature');
    await settle(ctx.game);
    assert.equal(source.power, baseline + 3);
    assert.ok(source.kw('lifelink'));
    const second = put(ctx.game, ctx.a, 'Grizzly Bears');
    assert.equal(source.power, baseline);
    assert.equal(source.kw('lifelink'), false);
    await ctx.game.move(second, 'hand');
    assert.equal(source.power, baseline + 3);
    second.ctrl = ctx.b;
    await ctx.game.move(second, 'battlefield', {ctrl: ctx.b});
    assert.equal(source.power, baseline + 3, 'an opponent creature does not change your exact count');
  });

  test(`v8 ${role}: total power conditions check the whole friendly team at trigger and resolution`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Total Power');
    await settle(ctx.game);
    const ally = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    ctx.game.addCounters(enemy, '+1/+1', 20);
    const before = ctx.a.library.length;
    await ctx.game.emit('precombatMain', {player: ctx.a});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'opponent power does not count');
    ctx.game.addCounters(ally, '+1/+1', 4);
    await ctx.game.emit('precombatMain', {player: ctx.a});
    await ctx.game.flushTriggers();
    assert.equal(ctx.game.stack.length, 1);
    await ctx.game.move(ally, 'hand');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before, 'power condition failed before resolution');
    ctx.game.addCounters(source, '+1/+1', 6);
    await ctx.game.emit('precombatMain', {player: ctx.a});
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
  });

  test(`v8 ${role}: attachment conditions use the host type and conditional quoted abilities keep unconditional stats`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const aura = await paidCast(ctx, 'Type Aura');
    await settle(ctx.game);
    assert.equal(aura.attachedTo, host.iid);
    assert.equal(host.power, 1);
    assert.equal(host.cur.cantBlock, true);
    const artifact = put(ctx.game, ctx.a, 'Sol Ring');
    await ctx.game.attach(aura, artifact);
    assert.equal(host.power, 2);
    assert.equal(!!host.cur.cantBlock, false);
    assert.equal(!!artifact.cur.cantBlock, false);
    const equipment = await paidCast(ctx, 'Quoted Equipment');
    await settle(ctx.game);
    await ctx.game.attach(equipment, host);
    assert.equal(host.toughness, 3);
    assert.ok(host.kw('hexproof'));
    host.tapped = true;
    ctx.game.recalc();
    assert.equal(host.kw('hexproof'), false);
    assert.equal(host.toughness, 3, 'conditional quoted ability does not gate the separate stat bonus');
    host.tapped = false;
    ctx.game.recalc();
    assert.ok(host.kw('hexproof'));
    assert.equal(artifact.kw('hexproof'), false);
  });

  test(`v8 ${role}: otherwise and independent sentences retain separate continuous conditions`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const aura = await paidCast(ctx, 'Otherwise Aura');
    await settle(ctx.game);
    assert.equal(aura.attachedTo, host.iid);
    assert.equal(host.power, 4);
    const white = put(ctx.game, ctx.a, 'Elite Vanguard');
    await ctx.game.attach(aura, white);
    assert.equal(host.power, 2);
    assert.equal(white.power, 1, 'otherwise branch applies because the host is not green');
    const source = await paidCast(ctx, 'Separate Sentences');
    await settle(ctx.game);
    assert.equal(source.power, 3);
    assert.equal(source.kw('flying'), false);
    await ctx.game.gainLife(ctx.a, 5);
    assert.ok(source.kw('flying'));
    assert.equal(source.power, 3);
    await ctx.game.loseLife(ctx.a, 1);
    assert.equal(source.kw('flying'), false);
    assert.equal(source.power, 3, 'the independent second sentence remains active');
  });

  test(`v8 ${role}: a library threshold can be satisfied by either player and reverses after returning a card`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Small Library');
    await settle(ctx.game);
    assert.equal(source.power, 2);
    const moved = [];
    while (ctx.b.library.length > 10) {
      const card = ctx.b.library.at(-1);
      moved.push(card);
      await ctx.game.move(card, 'hand');
    }
    assert.equal(source.power, 5);
    await ctx.game.move(moved[0], 'library');
    assert.equal(source.power, 2);
    assert.equal(ctx.a.library.length, 15);
  });

  test(`v8 ${role}: a conditional granted activation requires its grant both when offered and when paid`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Granted Activation');
    await settle(ctx.game);
    ctx.a.pool.G = 2;
    assert.equal(source.power, 2);
    assert.equal(ctx.game.activatableList(ctx.a).some(row => row.card === source), false);
    const forest = put(ctx.game, ctx.a, 'Forest');
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === source);
    assert.ok(action);
    assert.equal(source.power, 4);
    const before = ctx.a.library.length;
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
    assert.equal(ctx.a.pool.G, 1);
    await ctx.game.move(forest, 'hand');
    assert.equal(source.power, 2);
    assert.equal(ctx.game.activatableList(ctx.a).some(row => row.card === source), false);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), false, 'a stale granted action cannot outlive the grant');
    assert.equal(ctx.a.pool.G, 1);
  });

  test(`v8 ${role}: graveyard arrival sees each genuine land card once and excludes tokens and wrong owners`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Grave Land');
    await settle(ctx.game);
    const before = ctx.a.life;
    for (const from of ['library', 'hand', 'battlefield']) {
      const land = from === 'library' ? ctx.a.library.at(-1) : put(ctx.game, ctx.a, 'Forest', from);
      await ctx.game.move(land, 'graveyard');
      await settle(ctx.game);
    }
    assert.equal(ctx.a.life, before + 3);
    const nonland = put(ctx.game, ctx.a, 'Grizzly Bears');
    const wrongOwner = put(ctx.game, ctx.b, 'Forest');
    const token = put(ctx.game, ctx.a, 'Forest');
    token.isToken = true;
    for (const card of [nonland, wrongOwner, token]) { await ctx.game.move(card, 'graveyard'); await settle(ctx.game); }
    assert.equal(ctx.a.life, before + 3);
  });

  test(`v8 ${role}: from-anywhere graveyard triggers bind the owner after a controlled permanent changes zones`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Opponent Grave');
    await settle(ctx.game);
    const before = ctx.b.life;
    const ownStolen = put(ctx.game, ctx.a, 'Forest');
    ownStolen.ctrl = ctx.b;
    ctx.game.recalc();
    await ctx.game.move(ownStolen, 'graveyard');
    await settle(ctx.game);
    assert.equal(ctx.b.life, before, 'the last controller does not determine the graveyard owner');
    const enemyStolen = put(ctx.game, ctx.b, 'Forest');
    enemyStolen.ctrl = ctx.a;
    ctx.game.recalc();
    await ctx.game.move(enemyStolen, 'graveyard');
    await settle(ctx.game);
    assert.equal(ctx.b.life, before - 1);
    assert.equal(ctx.a.life, 40);
    const [token] = await ctx.game.makeTokens('treasure', ctx.b);
    await ctx.game.sacrifice(ctx.b, token);
    await settle(ctx.game);
    assert.equal(ctx.b.life, before - 1, 'tokens are not cards');
  });

  test(`v8 ${role}: another-card cycling triggers use the paid cycling event and ignore mere discards`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Cycle Other');
    await settle(ctx.game);
    const discard = put(ctx.game, ctx.a, 'Forest', 'hand');
    await ctx.game.discard(ctx.a, [discard]);
    await settle(ctx.game);
    assert.equal(source.counters['+1/+1'] || 0, 0);
    for (const player of [ctx.b, ctx.a]) {
      const card = put(ctx.game, player, 'V8 Cycling Payment', 'hand');
      player.pool.C = 1;
      const action = ctx.game.activatableList(player).find(row => row.card === card && row.cycling);
      assert.ok(action);
      assert.equal(await ctx.game.activateAbility(player, action), true);
      await settle(ctx.game);
      assert.equal(player.pool.C, 0);
      assert.equal(card.zone, 'graveyard');
      assert.equal(source.counters['+1/+1'] || 0, player === ctx.a ? 1 : 0);
    }
    await ctx.game.emit('cycled', {card: source, player: ctx.a});
    await settle(ctx.game);
    assert.equal(source.counters['+1/+1'], 1, 'another excludes the source object');
  });

  test(`v8 ${role}: counter-event filters trigger once per placement and the last-counter trigger requires zero`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Group Counters');
    await settle(ctx.game);
    const friend = put(ctx.game, ctx.a, 'Grizzly Bears');
    const opponent = put(ctx.game, ctx.b, 'Grizzly Bears');
    const before = ctx.a.library.length;
    ctx.game.addCounters(opponent, '+1/+1', 3);
    ctx.game.addCounters(friend, 'charge', 2);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before);
    ctx.game.addCounters(friend, '+1/+1', 3);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'one-or-more creates one trigger for three counters');
    const last = await paidCast(ctx, 'Last Counter');
    await settle(ctx.game);
    ctx.game.addCounters(last, 'time', 2);
    ctx.game.addCounters(last, 'charge', 1);
    ctx.game.removeCounters(last, 'charge', 1);
    ctx.game.removeCounters(last, 'time', 1);
    await settle(ctx.game);
    assert.equal(last.zone, 'battlefield');
    ctx.game.removeCounters(last, 'time', 1);
    await settle(ctx.game);
    assert.equal(last.zone, 'graveyard');
  });

  test(`v8 ${role}: targeted observers distinguish target controller and spell controller`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Group Targeted');
    await settle(ctx.game);
    const friend = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    const land = put(ctx.game, ctx.a, 'Forest');
    const before = ctx.a.library.length;
    for (const [card, byPlayer] of [[friend, ctx.a], [enemy, ctx.b], [land, ctx.b]]) {
      await ctx.game.emit('targeted', {card, byPlayer, isSpell: true, isInstantSorcery: true});
      await settle(ctx.game);
    }
    assert.equal(ctx.a.library.length, before);
    const bolt = put(ctx.game, ctx.b, 'Lightning Bolt', 'hand');
    ctx.b.pool.R = 1;
    const decide = ctx.b.controller.decide;
    ctx.b.controller = {decide: async (game, query) => query.type === 'chooseTargets' ? [friend] : decide(game, query)};
    assert.equal(await ctx.game.castSpell(ctx.b, bolt, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
    assert.equal(ctx.b.pool.R, 0);
    assert.equal(friend.zone, 'graveyard');
    assert.equal(enemy.zone, 'battlefield');
  });

  test(`v8 ${role}: attack batches bind a unique attacker only when exactly one creature attacks`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Attack Alone');
    await settle(ctx.game);
    await paidCast(ctx, 'Attack Two');
    await settle(ctx.game);
    const first = put(ctx.game, ctx.a, 'Grizzly Bears');
    const second = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    const before = ctx.a.library.length;
    await ctx.game.emit('attackersDeclared', {player: ctx.b, attackers: [enemy]});
    await settle(ctx.game);
    assert.equal(enemy.power, 2);
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [first, second]});
    await settle(ctx.game);
    assert.equal(first.power, 2);
    assert.equal(second.power, 2);
    assert.equal(ctx.a.library.length, before - 1);
    await ctx.game.emit('attackersDeclared', {player: ctx.a, attackers: [second]});
    await settle(ctx.game);
    assert.equal(first.power, 2);
    assert.equal(second.power, 4);
    assert.equal(ctx.a.library.length, before - 1, 'one attacker does not satisfy the two-or-more clause');
  });

  test(`v8 ${role}: damage events keep the damaged creature and reject its new incarnation after blinking`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Damage Creature');
    await settle(ctx.game);
    const victim = put(ctx.game, ctx.b, 'Grizzly Bears');
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.damageCreature(other, victim, 1);
    await settle(ctx.game);
    assert.equal(victim.zone, 'battlefield', 'damage from another source is ignored');
    victim.damage = 0;
    await ctx.game.damageCreature(source, victim, 1);
    await ctx.game.flushTriggers();
    assert.equal(ctx.game.stack.length, 1);
    await ctx.game.move(victim, 'exile');
    await ctx.game.move(victim, 'battlefield');
    await settle(ctx.game);
    assert.equal(victim.zone, 'battlefield', 'the damage trigger cannot destroy a new object');
    await ctx.game.damageCreature(source, victim, 1);
    await settle(ctx.game);
    assert.equal(victim.zone, 'graveyard');
    assert.equal(source.zone, 'battlefield');
    assert.equal(ctx.decisions.some(row => row.query.type === 'chooseTargets'), false, 'that creature is not a new targeted choice');
  });

  test(`v8 ${role}: combat damage to players and planeswalkers uses separate event fields without double triggering`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Damage Two Kinds');
    await settle(ctx.game);
    const walkerDef = Object.values(MTG.DEFS).find(def => def.types.includes('Planeswalker') && Number(def.loyalty) >= 4 && !def.rules?.length);
    assert.ok(walkerDef);
    const walker = put(ctx.game, ctx.b, walkerDef.name);
    walker.counters.loyalty = Number(walkerDef.loyalty);
    const before = ctx.a.library.length;
    await ctx.game.damagePlayer(source, ctx.b, 1);
    await ctx.game.damageCreature(source, walker, 1);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before, 'noncombat damage is ignored on both paths');
    for (const target of [ctx.b, walker]) {
      source.attacking = target;
      source.blockedBy = [];
      source.wasBlocked = false;
      ctx.game.combat = {attackers: [source], player: ctx.a};
      await ctx.game.combatDamage(ctx.a, 'normal');
      await settle(ctx.game);
    }
    assert.equal(ctx.a.library.length, before - 2);
  });

  test(`v8 ${role}: foreign spell predicates require both opponent control and a matching color`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Foreign Cast');
    await settle(ctx.game);
    const before = ctx.a.library.length;
    for (const [player, name, pool] of [[ctx.a, 'Opt', {U: 1}], [ctx.b, 'Grizzly Bears', {C: 1, G: 1}], [ctx.b, 'Opt', {U: 1}]]) {
      const card = put(ctx.game, player, name, 'hand');
      Object.assign(player.pool, pool);
      ctx.game.turnPlayer = player;
      assert.equal(await ctx.game.castSpell(player, card, {from: 'hand'}), true);
      await settle(ctx.game);
    }
    assert.equal(ctx.a.library.length, before - 2, 'one own Opt draw plus one opponent-cast trigger');
    assert.equal(ctx.b.library.length, 14);
  });

  test(`v8 ${role}: sacrifice and battlefield graveyard events retain their actual object type`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Sacrifice Player');
    await settle(ctx.game);
    const before = ctx.a.library.length;
    const creature = put(ctx.game, ctx.b, 'Grizzly Bears');
    const [artifact] = await ctx.game.makeTokens('treasure', ctx.b);
    await ctx.game.sacrifice(ctx.b, creature);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before);
    await ctx.game.sacrifice(ctx.b, artifact);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1, 'sacrificed artifact tokens still are artifacts');
    const source = await paidCast(ctx, 'Grave Entry');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 2);
    await ctx.game.move(source, 'hand');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 2, 'leaving to the hand is not a graveyard event');
    await ctx.game.move(source, 'battlefield');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 3);
    await ctx.game.move(source, 'graveyard');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 4, 'a noncreature artifact uses its battlefield graveyard event');
  });

  test(`v8 ${role}: the affected player orders damage additions and multiplication, once per source`, async () => {
    for (const first of role === 'human' ? ['V8 Damage Double', 'V8 Damage Plus'] : [undefined]) {
      const ctx = context(role, {replacementFirst: first});
      put(ctx.game, ctx.b, 'V8 Damage Double');
      put(ctx.game, ctx.b, 'V8 Damage Plus');
      const source = put(ctx.game, ctx.b, 'Grizzly Bears');
      const dealt = await ctx.game.damagePlayer(source, ctx.a, 2);
      const choices = replacementChoices(ctx, 'damage');
      assert.equal(choices.length, 1, 'one choice followed by the only remaining effect');
      const expected = chosenSource(choices[0]) === 'V8 Damage Double' ? 5 : 6;
      assert.equal(dealt, expected);
      assert.equal(ctx.a.life, 40 - expected);
      assert.equal(ctx.otherDecisions.some(row => row.query.aiHint?.kind === 'replacementOrder'), false, 'source controllers do not choose for the damaged player');
      if (first) assert.equal(chosenSource(choices[0]), first);
      await settle(ctx.game);
    }
    const ctx = context(role);
    put(ctx.game, ctx.b, 'V8 Damage Double');
    put(ctx.game, ctx.b, 'V8 Damage Double');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 2), 8, 'two instances of the same definition each apply exactly once');
    await settle(ctx.game);
  });

  test(`v8 ${role}: a damage threshold becomes applicable after another replacement`, async () => {
    const ctx = context(role);
    put(ctx.game, ctx.a, 'V8 Damage Cap');
    put(ctx.game, ctx.b, 'V8 Damage Plus Two');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 1), 2, '1 becomes 3, then the newly applicable cap changes it to 2');
    assert.equal(replacementChoices(ctx, 'damage').length, 0, 'the cap was not offered while damage was below its threshold');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 0), 0);
    assert.equal(ctx.a.life, 38, 'adding damage does not turn a zero-damage instruction into damage');
    await settle(ctx.game);
  });

  test(`v8 ${role}: replacement damage predicates retain color, controller and recipient restrictions`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Red Damage Plus');
    await settle(ctx.game);
    const [red] = await ctx.game.makeTokens('goblin', ctx.a);
    const [enemyRed] = await ctx.game.makeTokens('goblin', ctx.b);
    const green = put(ctx.game, ctx.a, 'Grizzly Bears');
    const friend = put(ctx.game, ctx.a, 'Wall of Omens');
    const enemy = put(ctx.game, ctx.b, 'Wall of Omens');
    assert.equal(await ctx.game.damagePlayer(green, ctx.b, 1), 1, 'wrong color');
    assert.equal(await ctx.game.damagePlayer(enemyRed, ctx.b, 1), 1, 'wrong source controller');
    assert.equal(await ctx.game.damagePlayer(red, ctx.a, 1), 1, 'own player is not an opponent');
    assert.equal(await ctx.game.damageCreature(red, friend, 1), 1, 'own permanent is not an opponent permanent');
    assert.equal(await ctx.game.damageCreature(red, enemy, 1), 2);
    assert.equal(await ctx.game.damagePlayer(red, ctx.b, 1), 2);
    assert.equal(ctx.a.life, 39);
    assert.equal(ctx.b.life, 36);
    assert.equal(friend.damage, 1);
    assert.equal(enemy.damage, 2);
    await settle(ctx.game);
  });

  test(`v8 ${role}: self and attachment damage replacements require the stated source and combat damage`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Self Damage Double');
    await settle(ctx.game);
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Wall of Omens');
    assert.equal(await ctx.game.damagePlayer(source, ctx.b, 1), 1);
    assert.equal(await ctx.game.damagePlayer(other, ctx.b, 1, {combat: true}), 1);
    assert.equal(await ctx.game.damageCreature(source, enemy, 1, {combat: true}), 1, 'self clause only names players');
    assert.equal(await ctx.game.damagePlayer(source, ctx.b, 1, {combat: true}), 2);
    const aura = put(ctx.game, ctx.a, 'V8 Damage Aura');
    await ctx.game.attach(aura, other);
    assert.equal(await ctx.game.damagePlayer(other, ctx.b, 1), 1);
    assert.equal(await ctx.game.damagePlayer(other, ctx.b, 1, {combat: true}), 2);
    assert.equal(await ctx.game.damagePlayer(source, ctx.b, 1, {combat: true}), 2, 'the attachment does not modify another source');
    await settle(ctx.game);
  });

  test(`v8 ${role}: arithmetic reductions round correctly and are not damage prevention`, async () => {
    const ctx = context(role);
    const half = put(ctx.game, ctx.a, 'V8 Damage Half');
    const torment = put(ctx.game, ctx.b, 'Everlasting Torment');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 5), 2, 'half rounded down still modifies unpreventable damage');
    await ctx.game.move(half, 'hand');
    await ctx.game.move(torment, 'hand');
    put(ctx.game, ctx.a, 'V8 Damage Reduce');
    const friend = put(ctx.game, ctx.a, 'Wall of Omens');
    const enemy = put(ctx.game, ctx.b, 'Wall of Omens');
    assert.equal(await ctx.game.damageCreature(source, friend, 1), 0);
    assert.equal(friend.damage, 0);
    assert.equal(await ctx.game.damageCreature(source, friend, 3), 2);
    assert.equal(await ctx.game.damageCreature(source, enemy, 1), 1);
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 1), 1, 'creature restriction does not cover the player');
    await settle(ctx.game);
  });

  test(`v8 ${role}: prevention and multiplication share the affected creature controller's ordering choice`, async () => {
    for (const first of role === 'human' ? ['V8 Damage Double', 'Heralds of the Shredder'] : [undefined]) {
      const ctx = context(role, {replacementFirst: first});
      put(ctx.game, ctx.b, 'V8 Damage Double');
      put(ctx.game, ctx.a, 'Heralds of the Shredder');
      const source = put(ctx.game, ctx.b, 'Grizzly Bears');
      const target = put(ctx.game, ctx.a, 'Grizzly Bears');
      assert.equal(await ctx.game.damageCreature(source, target, 2), 0);
      const choices = replacementChoices(ctx, 'damage');
      assert.equal(choices.length, 1);
      assert.equal(target.counters['+1/+1'], chosenSource(choices[0]) === 'V8 Damage Double' ? 4 : 2, 'applicability probes do not place extra counters');
      assert.equal(target.damage, 0);
      await settle(ctx.game);
    }
  });

  test(`v8 ${role}: Deflecting Palm reflects the chosen prevented amount as a new noncombat event`, async () => {
    for (const first of role === 'human' ? ['V8 Damage Double', 'Deflecting Palm'] : [undefined]) {
      const ctx = context(role, {replacementFirst: first});
      put(ctx.game, ctx.b, 'V8 Damage Double');
      const source = put(ctx.game, ctx.b, 'Grizzly Bears');
      const palm = put(ctx.game, ctx.a, 'Deflecting Palm', 'graveyard');
      const effect = {kind: 'preventNextToPlayer', who: ctx.a, source, sourceVersion: source.zoneVersion, sourceCard: palm, reflectToController: true, expires: 'eot'};
      ctx.game.untilEffects.push(effect);
      const events = [], emit = ctx.game.emit.bind(ctx.game);
      ctx.game.emit = async (name, data) => { if (name === 'damageToPlayer') events.push(data); return emit(name, data); };
      assert.equal(await ctx.game.damagePlayer(source, ctx.a, 3, {combat: true}), 0);
      const choices = replacementChoices(ctx, 'damage');
      assert.equal(choices.length, 1);
      const reflected = chosenSource(choices[0]) === 'V8 Damage Double' ? 6 : 3;
      assert.equal(ctx.a.life, 40);
      assert.equal(ctx.b.life, 40 - reflected);
      assert.equal(events.length, 1);
      assert.equal(events[0].src, palm);
      assert.equal(events[0].combat, false);
      assert.equal(events[0].n, reflected, 'the original source multiplier does not apply to Palm damage');
      assert.equal(ctx.game.untilEffects.includes(effect), false);
      await settle(ctx.game);
    }
  });

  test(`v8 ${role}: redirects recheck recipient restrictions without reapplying used replacements`, async () => {
    const ctx = context(role, {replacementFirst: 'V8 Damage Double'});
    put(ctx.game, ctx.b, 'V8 Damage Double');
    put(ctx.game, ctx.a, 'V8 Damage Reduce');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    const target = put(ctx.game, ctx.a, 'Wall of Omens');
    ctx.game.untilEffects.push({kind: 'redirectAllDamage', who: ctx.a, iid: target.iid, zoneVersion: target.zoneVersion, expires: 'eot'});
    const opts = {deferSBA: true};
    const dealt = await ctx.game.damagePlayer(source, ctx.a, 2, opts);
    assert.equal(opts._damageFinalTarget, target);
    assert.equal(ctx.a.life, 40);
    assert.ok([2, 3].includes(dealt), 'either legal ordering applies doubling and creature reduction once');
    assert.equal(target.damage, dealt);
    if (role === 'human') assert.equal(dealt, 3, 'double to four, redirect, then reduce to three');
    await ctx.game.move(target, 'exile');
    await ctx.game.move(target, 'battlefield');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 1), 2, 'the old redirect does not follow a blinked recipient');
    assert.equal(target.damage, 0);
    await settle(ctx.game);
  });

  test(`v8 ${role}: unpreventable damage removes one shield counter but preserves finite prevention and Palm`, async () => {
    const ctx = context(role);
    const torment = put(ctx.game, ctx.b, 'Everlasting Torment');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    const target = put(ctx.game, ctx.a, 'Wall of Omens');
    target.counters.shield = 2;
    const finite = {kind: 'oraclePreventNextAmount', target, zoneVersion: target.zoneVersion, remaining: 2, expires: 'eot'};
    const palm = {kind: 'preventNextToPlayer', who: ctx.a, source, sourceVersion: source.zoneVersion, sourceCard: put(ctx.game, ctx.a, 'Deflecting Palm', 'graveyard'), reflectToController: true, expires: 'eot'};
    ctx.game.untilEffects.push(finite, palm);
    const events = [], emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (name, data) => { if (name === 'damagePrevented') events.push(data); return emit(name, data); };
    assert.equal(await ctx.game.damageCreature(source, target, 1), 1);
    assert.equal(target.counters.shield, 1, 'two counters provide one prevention effect, with one removal');
    assert.equal(target.counters['-1/-1'], 1);
    assert.equal(finite.remaining, 2);
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 2), 2);
    assert.equal(ctx.game.untilEffects.includes(palm), true);
    assert.equal(ctx.b.life, 40, 'zero damage was prevented, so Palm does not reflect');
    assert.equal(events.length, 0);
    await ctx.game.move(torment, 'hand');
    ctx.game.removeCounters(target, 'shield', 1);
    assert.equal(await ctx.game.damageCreature(source, target, 3), 1);
    assert.equal(finite.remaining, 0);
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 2), 0);
    assert.equal(ctx.b.life, 38);
    assert.equal(ctx.game.untilEffects.includes(palm), false);
    assert.deepEqual(events.map(event => event.n), [2, 2]);
    await settle(ctx.game);
  });

  test(`v8 ${role}: Gisela prevents the rounded-up half but still doubles opponents' unpreventable damage`, async () => {
    const ctx = context(role);
    put(ctx.game, ctx.a, 'Gisela, Blade of Goldnight');
    const source = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 5), 2);
    put(ctx.game, ctx.b, 'Everlasting Torment');
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 5), 5, 'the prevention half is disabled');
    assert.equal(await ctx.game.damagePlayer(source, ctx.b, 2), 4, 'the multiplication half is a replacement');
    assert.equal(ctx.a.life, 33);
    assert.equal(ctx.b.life, 36);
    await settle(ctx.game);
  });

  test(`v8 ${role}: life replacements are chosen by the gaining player and cannot create a zero or forbidden gain`, async () => {
    const ctx = context(role, {replacementFirst: 'V8 Life Plus'});
    await paidCast(ctx, 'Life Double');
    await settle(ctx.game);
    await paidCast(ctx, 'Life Plus');
    await settle(ctx.game);
    const gained = await ctx.game.gainLife(ctx.a, 3);
    const choices = replacementChoices(ctx, 'lifegain');
    assert.equal(choices.length, 1);
    assert.equal(gained, chosenSource(choices[0]) === 'V8 Life Plus' ? 8 : 7);
    assert.equal(ctx.a.life, 40 + gained);
    assert.equal(await ctx.game.gainLife(ctx.b, 3), 3, 'the replacements only cover their controller');
    assert.equal(await ctx.game.gainLife(ctx.a, 0), 0);
    put(ctx.game, ctx.b, 'Everlasting Torment');
    assert.equal(await ctx.game.gainLife(ctx.a, 3), 0);
    assert.equal(replacementChoices(ctx, 'lifegain').length, 1);
    await settle(ctx.game);
  });

  test(`v8 ${role}: token additions and doubling obey their controller's order and ignore empty batches`, async () => {
    const ctx = context(role, {replacementFirst: 'V8 Token Food'});
    await paidCast(ctx, 'Token Double');
    await settle(ctx.game);
    await paidCast(ctx, 'Token Food');
    await settle(ctx.game);
    const made = await ctx.game.makeTokens('beast33', ctx.a);
    const choices = ctx.decisions.filter(row => row.query.aiHint?.kind === 'tokenReplacementOrder');
    assert.equal(choices.length, 1);
    assert.equal(made.filter(card => card.name === 'Beast').length, 2);
    assert.equal(made.filter(card => card.name === 'Food').length, chosenSource(choices[0]) === 'V8 Token Food' ? 2 : 1);
    assert.equal((await ctx.game.makeTokens('beast33', ctx.b)).length, 1);
    put(ctx.game, ctx.a, 'Donatello, the Brains');
    assert.equal((await ctx.game.makeTokens('beast33', ctx.a, {n: 0})).length, 0, 'an additional-token effect cannot turn zero into an event');
    assert.equal((await ctx.game.makeTokens([], ctx.a)).length, 0);
    await settle(ctx.game);
  });

  test(`v8 ${role}: newly applicable token replacements run after Food or creature tokens are added`, async () => {
    const ctx = context(role);
    put(ctx.game, ctx.a, 'Academy Manufactor');
    put(ctx.game, ctx.a, 'V8 Token Food');
    const made = await ctx.game.makeTokens('beast33', ctx.a);
    assert.deepEqual(Array.from(made, card => card.name).sort(), ['Beast', 'Clue', 'Food', 'Treasure']);
    assert.equal(ctx.decisions.some(row => row.query.aiHint?.kind === 'tokenReplacementOrder'), false, 'Manufactor is offered only after there is a Food to replace');
    await settle(ctx.game);
    const other = context(role);
    put(other.game, other.a, 'Divine Visitation');
    put(other.game, other.a, 'Chatterfang, Squirrel General');
    const transformed = await other.game.makeTokens('treasure', other.a);
    assert.deepEqual(Array.from(transformed, card => card.name).sort(), ['Angel', 'Treasure'], 'Visitation becomes applicable to the added Squirrel');
    await settle(other.game);
  });

  test(`v8 ${role}: a creature-token addition adds one per batch and cannot modify artifact-only creation`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Token Soldier');
    await settle(ctx.game);
    assert.equal((await ctx.game.makeTokens('food', ctx.a)).length, 1);
    const made = await ctx.game.makeTokens('beast33', ctx.a, {n: 3});
    assert.equal(made.length, 4);
    assert.equal(made.filter(card => card.hasSub('Soldier')).length, 1);
    assert.equal((await ctx.game.makeTokens('beast33', ctx.b, {n: 2})).length, 2);
    await settle(ctx.game);
  });

  test(`v8 ${role}: attack requirements follow their conditions and never bypass summoning sickness`, async () => {
    const ctx = context(role);
    const creature = await paidCast(ctx, 'Attack Unless');
    await settle(ctx.game);
    assert.equal(ctx.game.isForcedToAttack(creature), true);
    assert.equal(creature.sick, true);
    await ctx.game.combatPhase(ctx.a);
    assert.equal(ctx.decisions.some(row => row.query.type === 'attackers' && row.query.eligible.includes(creature)), false, 'a requirement cannot make a sick creature eligible');
    creature.sick = false;
    const [elf] = await ctx.game.makeTokens('elfWarrior', ctx.a);
    assert.equal(ctx.game.isForcedToAttack(creature), false);
    await ctx.game.move(elf, 'exile');
    assert.equal(ctx.game.isForcedToAttack(creature), true);
    ctx.game.phase = 'main1'; ctx.game.step = 'main';
    const conditional = await paidCast(ctx, 'Attack Condition');
    await settle(ctx.game);
    assert.equal(ctx.game.isForcedToAttack(conditional), false);
    await ctx.game.gainLife(ctx.a, 5);
    assert.equal(ctx.game.isForcedToAttack(conditional), true);
    assert.equal(conditional.power, 4);
    assert.equal(conditional.kw('flying'), true);
    await ctx.game.loseLife(ctx.a, 1);
    assert.equal(ctx.game.isForcedToAttack(conditional), false);
    assert.equal(conditional.power, 2);
    await settle(ctx.game);
  });

  test(`v8 ${role}: counters on an event object use its last known battlefield state, not the observer`, async () => {
    const ctx = context(role);
    const observer = await paidCast(ctx, 'Event Counter Leaves');
    await settle(ctx.game);
    ctx.game.addCounters(observer, '+1/+1', 7);
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    ctx.game.addCounters(enemy, '+1/+1', 5);
    await ctx.game.move(enemy, 'exile');
    const empty = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.move(empty, 'exile');
    assert.equal(ctx.game.pendingTriggers.length, 0, 'both controller and counter predicates are required');
    const creature = put(ctx.game, ctx.a, 'Grizzly Bears');
    ctx.game.addCounters(creature, '+1/+1', 3);
    await ctx.game.move(creature, 'exile');
    await ctx.game.flushTriggers();
    assert.equal(ctx.game.stack.length, 1);
    await ctx.game.move(creature, 'battlefield');
    ctx.game.addCounters(creature, '+1/+1', 9);
    await ctx.game.move(observer, 'exile');
    await settle(ctx.game);
    assert.equal(ctx.game.bf().filter(card => card.isToken && card.hasSub('Mutagen')).length, 3, 'the event remembers three, not the observer seven or the new incarnation nine');
    const own = context(role);
    const ownObserver = await paidCast(own, 'Source Counter Leaves');
    await settle(own.game);
    own.game.addCounters(ownObserver, '+1/+1', 7);
    const ownCreature = put(own.game, own.a, 'Grizzly Bears');
    own.game.addCounters(ownCreature, '+1/+1', 3);
    await own.game.move(ownCreature, 'exile');
    await settle(own.game);
    assert.equal(own.game.bf().filter(card => card.isToken && card.hasSub('Mutagen')).length, 7, 'an explicit this-artifact reference remains bound to the observer');
  });

  test(`v8 ${role}: Aerith-style dies counters use the departed incarnation and only current legendary allies`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Counter Legacy');
    await settle(ctx.game);
    const legendary = (name, player) => put(ctx.game, player, {...MTG.DEFS['Grizzly Bears'], name, super: ['Legendary']});
    const ally = legendary('Counter Legacy ally', ctx.a);
    const opponent = legendary('Counter Legacy enemy', ctx.b);
    const ordinary = put(ctx.game, ctx.a, 'Grizzly Bears');
    for (let index = 0; index < 3; index++) {
      await ctx.game.gainLife(ctx.a, 1);
      assert.equal(source.counters['+1/+1'] || 0, index, 'life gain queues a real counter trigger');
      await settle(ctx.game);
      assert.equal(source.counters['+1/+1'], index + 1);
    }
    const oldVersion = source.zoneVersion;
    await ctx.game.sacrifice(ctx.a, source);
    await ctx.game.flushTriggers();
    assert.equal(ctx.game.stack.length, 1, 'the death trigger exists on the Stack');
    assert.equal(source.battlefieldLKI.get(oldVersion).counters['+1/+1'], 3);
    assert.equal(ally.counters['+1/+1'] || 0, 0, 'no group counters are added before resolution');
    const arriving = legendary('Counter Legacy arriving ally', ctx.a);
    await ctx.game.move(source, 'battlefield');
    ctx.game.addCounters(source, '+1/+1', 9);
    await settle(ctx.game);
    assert.equal(ally.counters['+1/+1'], 3);
    assert.equal(arriving.counters['+1/+1'], 3, 'the group is evaluated at resolution');
    assert.equal(opponent.counters['+1/+1'] || 0, 0);
    assert.equal(ordinary.counters['+1/+1'] || 0, 0);
    assert.equal(source.counters['+1/+1'], 9, 'the new source incarnation is not used for the old trigger count');
  });

  test(`v8 ${role}: a blocked-creature observer requires its controller and buffs the actual attacker`, async () => {
    const ctx = context(role);
    const observer = await paidCast(ctx, 'Blocked Mine');
    await settle(ctx.game);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    enemy.attacking = ctx.a;
    await ctx.game.emit('becomesBlocked', {attacker: enemy, blockers: [host]});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'an opponent creature is outside the source controller filter');
    enemy.attacking = null;
    await attackInto(ctx, [enemy]);
    assert.equal(host.zone, 'battlefield');
    assert.equal(host.power, 3);
    assert.equal(host.toughness, 3);
    assert.equal(enemy.zone, 'graveyard');
    assert.equal(observer.zone, 'battlefield');
    assert.equal(ctx.b.life, 40, 'a blocked attacker without trample does not damage the defending player');
  });

  test(`v8 ${role}: each-blocker triggers bind the other combatant and enforce color and source identity`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Blocked Death');
    await settle(ctx.game);
    source.sick = false;
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    const green = put(ctx.game, ctx.b, 'Grizzly Bears');
    const blue = put(ctx.game, ctx.b, {name: 'Blue blocker', types: ['Creature'], subtypes: ['Bear'], cost: '{U}', power: '0', toughness: '8'});
    await ctx.game.emit('becomesBlockedByCreature', {attacker: other, blocker: green, blockers: [green]});
    await ctx.game.emit('becomesBlockedByCreature', {attacker: source, blocker: blue, blockers: [blue]});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'both the triggering source and blocker color are checked');
    await ctx.game.move(other, 'hand');
    await ctx.game.move(blue, 'hand');
    await attackInto(ctx, [green]);
    assert.equal(source.zone, 'battlefield');
    assert.equal(green.zone, 'graveyard');
    assert.equal(source.damage, 0, 'the blocker is destroyed by the trigger before combat damage');
    assert.equal(ctx.b.life, 40);
  });

  test(`v8 ${role}: a block-or-blocked-by trigger destroys without regeneration and reads the other creature's last toughness`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Blocked Pair');
    await settle(ctx.game);
    source.sick = false;
    const enemy = put(ctx.game, ctx.b, {name: 'Regenerating blocker', types: ['Creature'], subtypes: ['Bear'], cost: '{G}', power: '0', toughness: '5'});
    enemy.regenShield = 1;
    await attackInto(ctx, [enemy]);
    assert.equal(enemy.zone, 'graveyard');
    assert.equal(source.zone, 'battlefield');
    assert.equal(ctx.a.life, 45, 'the destroyed blocker supplies toughness 5, not the source toughness 2');
    const defended = context(role, {blockers: query => [{blocker: query.potential[0], attacker: query.attackers[0]}]});
    const defender = await paidCast(defended, 'Blocked Pair');
    await settle(defended.game);
    defended.a.life = 1;
    const attacker = put(defended.game, defended.b, {name: 'Lethal attacker', types: ['Creature'], subtypes: ['Bear'], cost: '{G}', power: '3', toughness: '6'});
    attacker.regenShield = 1;
    defended.game.turnPlayer = defended.b;
    defended.game.untilEffects.push({kind: 'mustAttack', who: defended.b, expires: 'eot'});
    await defended.game.combatPhase(defended.b);
    await settle(defended.game);
    assert.ok(defended.decisions.some(row => row.query.type === 'blockers' && row.result.some(block => block.blocker === defender && block.attacker === attacker)), 'the human or actual local AI declares the legal lifesaving block');
    assert.equal(attacker.zone, 'graveyard');
    assert.equal(defender.zone, 'battlefield');
    assert.equal(defended.a.life, 7);
  });

  test(`v8 ${role}: a blocked Equipment uses its host as the damage source and the actual defending player`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, {name: 'Lifelink host', types: ['Creature'], subtypes: ['Bear'], cost: '{G}', power: '2', toughness: '2', kws: ['lifelink']});
    const equipment = await paidCast(ctx, 'Blocked Equipment');
    await settle(ctx.game);
    assert.equal(ctx.game.activatableList(ctx.a).some(row => row.card === equipment && row.equip), false, 'equip is not offered without its printed mana payment');
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === equipment && row.equip);
    assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(equipment.attachedTo, host.iid);
    const enemy = put(ctx.game, ctx.b, {name: 'Safe blocker', types: ['Creature'], subtypes: ['Bear'], cost: '{G}', power: '0', toughness: '10'});
    const before = ctx.a.life;
    const damage = [];
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => { if (event === 'damageToPlayer' && !ctx.game._damageEventQueue) damage.push(data); return emit(event, data); };
    await attackInto(ctx, [enemy]);
    assert.equal(ctx.b.life, 39);
    assert.equal(ctx.a.life, before + 3, 'the host gains lifelink life for the 1 triggered damage and 2 combat damage');
    assert.equal(damage.length, 1);
    assert.equal(damage[0].src.iid, host.iid);
    assert.equal(damage[0].player, ctx.b);
    assert.equal(damage[0].combat, false);
  });

  test(`v8 ${role}: one-or-more blockers triggers once per declaration and only for the specified blocker group`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Blocked Group');
    await settle(ctx.game);
    source.sick = false;
    const blue = put(ctx.game, ctx.b, {name: 'Unmatched blocker', types: ['Creature'], subtypes: ['Bear'], cost: '{U}', power: '0', toughness: '1'});
    await ctx.game.emit('becomesBlocked', {attacker: source, blockers: [blue]});
    assert.equal(ctx.game.pendingTriggers.length, 0);
    const blockers = [1, 2].map(index => put(ctx.game, ctx.b, {name: 'Green blocker ' + index, types: ['Creature'], subtypes: ['Bear'], cost: '{G}', power: '0', toughness: '1'}));
    await attackInto(ctx, blockers);
    assert.equal(source.power, 4, 'two qualifying blockers produce one +2/+2 trigger');
    assert.equal(source.toughness, 4);
    assert.equal(source.zone, 'battlefield');
  });

  test(`v8 ${role}: a block-or-blocked Aura tracks only its current host`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const aura = await paidCast(ctx, 'Block Both Aura');
    await settle(ctx.game);
    assert.equal(aura.attachedTo, host.iid);
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    await ctx.game.emit('blocks', {blocker: other, attacker: enemy});
    assert.equal(ctx.game.pendingTriggers.length, 0);
    await ctx.game.move(other, 'hand');
    await attackInto(ctx, [enemy]);
    assert.equal(ctx.a.life, 41);
    assert.equal(host.zone, 'battlefield');
    assert.equal(host.toughness, 5);
    const newHost = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.attach(aura, newHost);
    await ctx.game.emit('blocks', {blocker: host, attacker: enemy});
    assert.equal(ctx.game.pendingTriggers.length, 0, 'moving the Aura removes the old host binding');
  });

  test(`v8 ${role}: exact self-type and When aliases preserve foreign-cast and discard event scope`, async () => {
    const ctx = context(role);
    const before = ctx.a.library.length;
    await paidCast(ctx, 'When Equipment');
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
    await paidCast(ctx, 'When Foreign Cast');
    await settle(ctx.game);
    const ownBlue = put(ctx.game, ctx.a, 'Coral Merfolk', 'hand');
    ctx.a.pool.U = 1; ctx.a.pool.C = 1;
    assert.equal(await ctx.game.castSpell(ctx.a, ownBlue, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 1);
    const enemyBlue = put(ctx.game, ctx.b, 'Coral Merfolk', 'hand');
    ctx.game.turnPlayer = ctx.b; ctx.game.phase = 'main1';
    ctx.b.pool.U = 1; ctx.b.pool.C = 1;
    assert.equal(await ctx.game.castSpell(ctx.b, enemyBlue, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.equal(ctx.a.library.length, before - 2);
    ctx.game.turnPlayer = ctx.a; ctx.game.phase = 'main1';
    await paidCast(ctx, 'Plain Discard');
    await settle(ctx.game);
    const ownCard = put(ctx.game, ctx.a, 'Forest', 'hand');
    const enemyCard = put(ctx.game, ctx.b, 'Forest', 'hand');
    await ctx.game.discard(ctx.a, [ownCard]);
    await settle(ctx.game);
    assert.equal(ctx.a.life, 40);
    assert.equal(ctx.b.life, 40);
    await ctx.game.discard(ctx.b, [enemyCard]);
    await settle(ctx.game);
    assert.equal(ctx.b.life, 38, 'a plain card discard binds that opponent as the recipient');
  });

  test(`v8 ${role}: optional untap choices precede the turn action and a declined untap preserves stun counters`, async () => {
    for (const choice of role === 'human' ? ['yes', 'no'] : [undefined]) {
      const ctx = context(role, {optionalUntapChoice: choice});
      const source = await paidCast(ctx, 'Optional Untap');
      await settle(ctx.game);
      assert.equal(source.cur.optionalUntap, true);
      ctx.game.tap(source);
      const ordinary = put(ctx.game, ctx.a, 'Grizzly Bears');
      ctx.game.tap(ordinary);
      const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
      ctx.game.tap(enemy);
      const before = ctx.decisions.length;
      await untilUpkeep(ctx);
      const choices = ctx.decisions.slice(before).filter(row => row.query.aiHint?.kind === 'optionalUntap');
      assert.equal(choices.length, 1);
      assert.equal(choices[0].query.aiHint.card, source);
      assert.equal(source.tapped, choices[0].result === 'no');
      assert.equal(ordinary.tapped, false, 'ordinary untapping is not optional');
      assert.equal(enemy.tapped, true, 'the active player cannot untap an opponent permanent');
      assert.equal(ctx.game.stack.length, 0, 'the optional untap is a turn action rather than a spell or ability');
      ctx.game.tap(source);
      ctx.game.addCounters(source, 'stun', 2);
      await settle(ctx.game);
      await untilUpkeep(ctx);
      assert.equal(source.tapped, true);
      const lastChoice = ctx.decisions.filter(row => row.query.aiHint?.kind === 'optionalUntap').at(-1);
      assert.equal(source.counters.stun, lastChoice.result === 'yes' ? 1 : 2, 'only attempting the untap consumes one stun counter');
      const count = ctx.decisions.filter(row => row.query.aiHint?.kind === 'optionalUntap').length;
      await untilUpkeep(ctx, ctx.b);
      assert.equal(ctx.decisions.filter(row => row.query.aiHint?.kind === 'optionalUntap').length, count, 'no decision for that permanent in another controller turn');
    }
  });

  test(`v8 ${role}: an explicit source antecedent animates the enchantment, with an intervening condition at both checks`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Hidden Animation');
    await settle(ctx.game);
    const castInstant = async player => {
      const spell = put(ctx.game, player, 'Opt', 'hand');
      player.pool.U = 1;
      assert.equal(await ctx.game.castSpell(player, spell, {from: 'hand'}), true);
      return spell;
    };
    await castInstant(ctx.a);
    await settle(ctx.game);
    assert.equal(source.is('Enchantment'), true, 'its controller casting an instant is not the trigger event');
    assert.equal(source.is('Creature'), false);
    ctx.game.turnPlayer = ctx.b;
    const opponentSpell = await castInstant(ctx.b);
    await settle(ctx.game);
    assert.equal(source.is('Creature'), true);
    assert.equal(source.is('Enchantment'), false);
    assert.equal(source.hasSub('Ape'), true);
    assert.equal(source.power, 4);
    assert.equal(source.toughness, 4);
    assert.equal(opponentSpell.is('Instant'), true, 'the triggering spell is not the animated object');
    assert.equal(opponentSpell.zone, 'graveyard');
    const later = await castInstant(ctx.b);
    assert.equal(ctx.game.pendingTriggers.some(trigger => trigger.src === source), false, 'the already animated source fails the condition when the next event occurs');
    assert.equal(ctx.game.stack.some(object => object.srcCard === source), false);
    await settle(ctx.game);
    assert.equal(later.zone, 'graveyard');
    const changed = context(role);
    const changedSource = await paidCast(changed, 'Hidden Animation');
    await settle(changed.game);
    changed.game.turnPlayer = changed.b;
    changed.game.priorityRound = async () => {};
    const spell = put(changed.game, changed.b, 'Opt', 'hand');
    changed.b.pool.U = 1;
    assert.equal(await changed.game.castSpell(changed.b, spell, {from: 'hand'}), true);
    await changed.game.flushTriggers();
    assert.ok(changed.game.stack.some(object => object.srcCard === changedSource), 'the source met its condition when the spell was cast');
    changed.game.addOracleAnimation(changedSource, {power: 1, toughness: 1, types: ['Creature'], subtypes: ['Bird'], keywords: [], colors: null, retainTypes: false, temporary: false});
    await settle(changed.game);
    assert.equal(changedSource.power, 1, 'a different animation before resolution makes the intervening condition false');
    assert.equal(changedSource.hasSub('Bird'), true);
    assert.equal(changedSource.hasSub('Ape'), false);
  });

  test(`v8 ${role}: forbidden and skipped untaps create no optional choice or stun consumption`, async () => {
    const ctx = context(role);
    const optional = await paidCast(ctx, 'Optional Untap');
    await settle(ctx.game);
    const prison = await paidCast(ctx, 'Conditional Rest');
    await settle(ctx.game);
    ctx.game.tap(optional);
    ctx.game.addCounters(optional, 'stun', 2);
    await untilUpkeep(ctx);
    assert.equal(optional.tapped, true);
    assert.equal(optional.counters.stun, 2);
    assert.equal(ctx.decisions.some(row => row.query.aiHint?.kind === 'optionalUntap'), false, 'a prohibition wins over the permission');
    await ctx.game.move(prison, 'exile');
    ctx.a.skipUntapOnce = true;
    await untilUpkeep(ctx);
    assert.equal(optional.tapped, true);
    assert.equal(optional.counters.stun, 2);
    assert.equal(ctx.decisions.some(row => row.query.aiHint?.kind === 'optionalUntap'), false, 'a skipped step provides no optional untap');
    optional.meta.noUntapOnce = true;
    await untilUpkeep(ctx);
    assert.equal(optional.meta.noUntapOnce, false);
    assert.equal(optional.counters.stun, 2);
    assert.equal(ctx.decisions.some(row => row.query.aiHint?.kind === 'optionalUntap'), false, 'a one-step untap restriction is consumed without making an optional choice');
  });

  test(`v8 ${role}: persistent untap restrictions track source counters and do not forbid untap effects`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Depletion Rest');
    await settle(ctx.game);
    assert.equal(source.cur.cantUntap, false);
    ctx.game.tap(source);
    ctx.game.addCounters(source, 'depletion', 1);
    assert.equal(source.cur.cantUntap, true);
    ctx.game.addCounters(source, 'stun', 1);
    await untilUpkeep(ctx);
    assert.equal(source.tapped, true);
    assert.equal(source.counters.stun, 1, 'an existing prohibition does not attempt an untap');
    assert.equal(ctx.game.untap(source), false, 'an untap effect attempts an untap and the stun counter replaces it');
    assert.equal(source.counters.stun, 0);
    assert.equal(source.tapped, true);
    assert.equal(ctx.game.untap(source), true, 'a subsequent effect can untap through the step-only restriction');
    assert.equal(source.tapped, false);
    ctx.game.tap(source);
    ctx.game.addCounters(source, 'stun', 1);
    ctx.game.removeCounters(source, 'depletion', 1);
    assert.equal(source.cur.cantUntap, false);
    await untilUpkeep(ctx);
    assert.equal(source.tapped, true);
    assert.equal(source.counters.stun, 0);
    await untilUpkeep(ctx);
    assert.equal(source.tapped, false);
  });

  test(`v8 ${role}: an expired untap restriction is removed before untap eligibility is calculated`, async () => {
    const ctx = context(role);
    const creature = put(ctx.game, ctx.a, 'Grizzly Bears');
    const effect = {expires: 'untilTurnOf', whoTurn: ctx.a, apply: () => { creature.cur.cantUntap = true; }};
    ctx.game.untilEffects.push(effect);
    ctx.game.recalc();
    ctx.game.tap(creature);
    assert.equal(creature.cur.cantUntap, true);
    await untilUpkeep(ctx);
    assert.equal(creature.tapped, false);
    assert.equal(creature.cur.cantUntap, false);
    assert.equal(ctx.game.untilEffects.includes(effect), false);
  });

  test(`v8 ${role}: multiple Seedborn Muses cause only one untap attempt per permanent`, async () => {
    const ctx = context(role);
    const sources = [put(ctx.game, ctx.a, 'Seedborn Muse'), put(ctx.game, ctx.a, 'Seedborn Muse')];
    const creature = put(ctx.game, ctx.a, 'Grizzly Bears');
    ctx.game.addCounters(creature, 'stun', 2);
    for (const card of [...sources, creature]) ctx.game.tap(card);
    await untilUpkeep(ctx, ctx.b);
    assert.equal(creature.tapped, true);
    assert.equal(creature.counters.stun, 1, 'two static permissions still describe one simultaneous untap');
    for (const card of sources) assert.equal(card.tapped, false);
    for (const card of sources) ctx.game.tap(card);
    ctx.b.skipUntapOnce = true;
    await untilUpkeep(ctx, ctx.b);
    assert.equal(creature.counters.stun, 1, 'a skipped step provides no off-turn untap either');
    for (const card of sources) assert.equal(card.tapped, true);
  });

  test(`v8 ${role}: simultaneous untap keeps initial eligibility and exposes only the completed state to untap triggers`, async () => {
    const ctx = context(role);
    const prison = await paidCast(ctx, 'Conditional Rest');
    await settle(ctx.game);
    const stunned = put(ctx.game, ctx.a, 'Grizzly Bears');
    const ordinary = put(ctx.game, ctx.a, 'Grizzly Bears');
    for (const card of [prison, stunned, ordinary]) ctx.game.tap(card);
    ctx.game.addCounters(stunned, 'stun', 1);
    assert.equal(ordinary.cur.cantUntap, false);
    const observations = [];
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (event, data) => {
      if (event === 'becameUntapped') observations.push({card: data.card, prison: prison.tapped, stunned: stunned.tapped, ordinary: ordinary.tapped, stun: stunned.counters.stun});
      return emit(event, data);
    };
    await untilUpkeep(ctx);
    assert.equal(prison.tapped, false);
    assert.equal(stunned.tapped, true);
    assert.equal(stunned.counters.stun, 0);
    assert.equal(ordinary.tapped, false, 'a restriction becoming active mid-action does not revoke the original eligibility');
    assert.equal(ordinary.cur.cantUntap, true, 'the static restriction is nevertheless active after the simultaneous action');
    assert.equal(observations.length, 2);
    for (const row of observations) assert.deepEqual([row.prison, row.stunned, row.ordinary, row.stun], [false, true, false, 0]);
  });

  test(`v8 ${role}: a conditional untap restriction counts each opponent separately`, async () => {
    const ctx = context(role);
    const c = ctx.game.addPlayer('C', {name: 'C'}, {decide: async (game, query) => query.type === 'priority' ? {kind: 'pass'} : null}, false);
    const source = await paidCast(ctx, 'Opponent Rest');
    await settle(ctx.game);
    put(ctx.game, ctx.b, 'Grizzly Bears');
    const divided = put(ctx.game, c, 'Grizzly Bears');
    ctx.game.tap(source);
    await untilUpkeep(ctx);
    assert.equal(source.tapped, false, 'one creature at each of two opponents does not satisfy two for an opponent');
    const second = put(ctx.game, ctx.b, 'Grizzly Bears');
    ctx.game.tap(source);
    await untilUpkeep(ctx);
    assert.equal(source.tapped, true, 'one opponent controlling two prevents the untap');
    await ctx.game.move(second, 'exile');
    await ctx.game.move(divided, 'exile');
    await untilUpkeep(ctx);
    assert.equal(source.tapped, false, 'the continuing condition is evaluated again each step');
  });

  test(`v8 ${role}: a nonbasic-land prohibition respects land quality, controller and the source's presence`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Nonbasic Rest');
    await settle(ctx.game);
    const basic = put(ctx.game, ctx.a, 'Forest');
    const ownLand = put(ctx.game, ctx.a, 'Command Tower');
    const enemyLand = put(ctx.game, ctx.b, 'Command Tower');
    for (const card of [basic, ownLand, enemyLand]) ctx.game.tap(card);
    await untilUpkeep(ctx);
    assert.equal(basic.tapped, false);
    assert.equal(ownLand.tapped, true);
    assert.equal(enemyLand.tapped, true);
    await untilUpkeep(ctx, ctx.b);
    assert.equal(enemyLand.tapped, true, 'the static restriction also applies during the other controller untap step');
    await ctx.game.move(source, 'exile');
    await untilUpkeep(ctx);
    assert.equal(ownLand.tapped, false, 'leaving the battlefield removes the continuing prohibition');
    assert.equal(enemyLand.tapped, true);
  });

  test(`v8 ${role}: Snow and power/color untap restrictions use current characteristics`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Snow Rest');
    await settle(ctx.game);
    const snow = put(ctx.game, ctx.a, {name: 'Snow test', types: ['Artifact'], subtypes: [], super: ['Snow'], cost: '{1}'});
    const ordinary = put(ctx.game, ctx.a, {name: 'Ordinary test', types: ['Artifact'], subtypes: [], cost: '{1}'});
    ctx.game.tap(snow); ctx.game.tap(ordinary);
    await untilUpkeep(ctx);
    assert.equal(snow.tapped, true);
    assert.equal(ordinary.tapped, false);
    await ctx.game.move(source, 'exile');
    ctx.game.phase = 'main1'; ctx.game.step = 'main';
    await paidCast(ctx, 'Power Rest');
    await settle(ctx.game);
    const black = put(ctx.game, ctx.a, {name: 'Large black', types: ['Creature'], subtypes: ['Bear'], cost: '{B}', power: '3', toughness: '3'});
    const white = put(ctx.game, ctx.a, {name: 'Large white', types: ['Creature'], subtypes: ['Bear'], cost: '{W}', power: '3', toughness: '3'});
    const small = put(ctx.game, ctx.a, 'Grizzly Bears');
    for (const card of [black, white, small]) ctx.game.tap(card);
    await untilUpkeep(ctx);
    assert.equal(black.tapped, true);
    assert.equal(white.tapped, false);
    assert.equal(small.tapped, false);
  });

  test(`v8 ${role}: an Equipment restriction moves with the host and a combined entry clause keeps the permanent tapped`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    const equipment = await paidCast(ctx, 'Rest Equipment');
    await settle(ctx.game);
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === equipment && row.equip);
    assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(equipment.attachedTo, host.iid);
    assert.equal(host.power, 6);
    ctx.game.tap(host); ctx.game.tap(other);
    await untilUpkeep(ctx);
    assert.equal(host.tapped, true);
    assert.equal(other.tapped, false);
    await ctx.game.attach(equipment, other);
    ctx.game.tap(other);
    await untilUpkeep(ctx);
    assert.equal(host.tapped, false);
    assert.equal(other.tapped, true);
    ctx.game.phase = 'main1'; ctx.game.step = 'main';
    const resting = await paidCast(ctx, 'Tapped Rest');
    await settle(ctx.game);
    assert.equal(resting.tapped, true, 'the entry replacement is retained alongside the persistent rule');
    await untilUpkeep(ctx);
    assert.equal(resting.tapped, true);
    assert.equal(ctx.game.untap(resting), true);
  });

  test(`v8 ${role}: a Phantom shield prevents with no counters and removes exactly one counter per positive damage event`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Phantom Shield');
    await settle(ctx.game);
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(attacker, source, 3), 0);
    assert.equal(source.zone, 'battlefield');
    assert.equal(source.counters['+1/+1'] || 0, 0, 'the unconditional prevention does not require a counter');
    ctx.game.addCounters(source, '+1/+1', 3);
    assert.equal(await ctx.game.damageCreature(attacker, source, 0), 0);
    assert.equal(source.counters['+1/+1'], 3);
    assert.equal(await ctx.game.damageCreature(attacker, source, 5), 0);
    assert.equal(source.counters['+1/+1'], 2, 'five damage removes one counter, not five');
    const other = put(ctx.game, ctx.a, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(attacker, other, 1), 1);
    assert.equal(source.counters['+1/+1'], 2, 'damage to another creature does not spend this shield');
    await settle(ctx.game);
  });

  test(`v8 ${role}: a conditional shield requires a counter and damage-count removal is capped by counters actually present`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Conditional Phantom');
    await settle(ctx.game);
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(attacker, source, 1), 1, 'without a counter the condition is false');
    ctx.game.addCounters(source, '+1/+1', 3);
    assert.equal(await ctx.game.damageCreature(attacker, source, 2), 0);
    assert.equal(source.counters['+1/+1'], 2);
    const hydra = await paidCast(ctx, 'Hydra Shield');
    await settle(ctx.game);
    ctx.game.addCounters(hydra, '+1/+1', 3);
    assert.equal(await ctx.game.damageCreature(attacker, hydra, 2), 0);
    assert.equal(hydra.counters['+1/+1'], 1);
    assert.equal(await ctx.game.damageCreature(attacker, hydra, 5), 0, 'the whole event is prevented even when fewer counters remain');
    assert.equal(hydra.counters['+1/+1'], 0);
    assert.equal(await ctx.game.damageCreature(attacker, hydra, 1), 1, 'the next event sees the now-false condition');
    await settle(ctx.game);
  });

  test(`v8 ${role}: unpreventable damage keeps the separately instructed counter change`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Conditional Phantom');
    await settle(ctx.game);
    ctx.game.addCounters(source, '+1/+1', 4);
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    const preventionStop = put(ctx.game, ctx.b, {name: 'Damage cannot be prevented', types: ['Enchantment'], subtypes: [], damageCantBePrevented: true});
    const before = source.counters['+1/+1'];
    assert.equal(await ctx.game.damageCreature(attacker, source, 2), 2);
    assert.equal(source.counters['+1/+1'], before - 1, 'the separate remove-one instruction still happens');
    assert.equal(source.damage, 2);
    const damageGrow = await paidCast(ctx, 'Damage Grow');
    await settle(ctx.game);
    assert.equal(await ctx.game.damageCreature(attacker, damageGrow, 3), 3);
    assert.equal(damageGrow.counters['+1/+1'], 3, 'that many counts the damage event even though it could not be prevented');
    assert.equal(damageGrow.zone, 'battlefield');
    const preventedGrow = await paidCast(ctx, 'Prevented Grow');
    await settle(ctx.game);
    assert.equal(await ctx.game.damageCreature(attacker, preventedGrow, 1), 1);
    assert.equal(preventedGrow.counters['+1/+1'] || 0, 0, 'for each damage prevented counts zero');
    await ctx.game.move(preventionStop, 'exile');
    assert.equal(await ctx.game.damageCreature(attacker, preventedGrow, 3), 0);
    assert.equal(preventedGrow.counters['+1/+1'], 3);
    await settle(ctx.game);
  });

  test(`v8 ${role}: damage-size prevention is rechecked after the affected player orders a multiplier`, async () => {
    for (const first of role === 'human' ? ['V8 Small Prevention', 'V8 Damage Double'] : [undefined]) {
      const ctx = context(role, {replacementFirst: first});
      const source = await paidCast(ctx, 'Small Prevention');
      await settle(ctx.game);
      put(ctx.game, ctx.b, 'V8 Damage Double');
      const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
      const damage = await ctx.game.damageCreature(attacker, source, 2);
      const choices = replacementChoices(ctx, 'damage');
      assert.equal(choices.length, 1);
      const preventedFirst = chosenSource(choices[0]) === 'V8 Small Prevention';
      assert.equal(damage, preventedFirst ? 0 : 4);
      assert.equal(source.zone, preventedFirst ? 'battlefield' : 'graveyard', 'a doubled event above three no longer qualifies');
      if (first) assert.equal(chosenSource(choices[0]), first);
      await settle(ctx.game);
    }
  });

  test(`v8 ${role}: prevention by creatures does not cover a creature spell's cast-trigger damage`, async () => {
    const ctx = context(role);
    const protectedCreature = await paidCast(ctx, 'Creature Shield');
    await settle(ctx.game);
    ctx.game.turnPlayer = ctx.b;
    const creatureSpell = put(ctx.game, ctx.b, 'V8 Cast Damage', 'hand');
    ctx.b.pool.C = 1; ctx.b.pool.G = 1;
    assert.equal(await ctx.game.castSpell(ctx.b, creatureSpell, {from: 'hand'}), true);
    await settle(ctx.game);
    assert.equal(protectedCreature.damage, 1, 'the triggered damage source was still a spell on the Stack');
    assert.equal(creatureSpell.zone, 'battlefield');
    assert.equal(await ctx.game.damageCreature(creatureSpell, protectedCreature, 3), 0, 'the same card now is a creature permanent');
    assert.equal(protectedCreature.damage, 1);
    const artifact = put(ctx.game, ctx.b, {name: 'Noncreature source', types: ['Artifact'], subtypes: [], cost: '{1}'});
    assert.equal(await ctx.game.damageCreature(artifact, protectedCreature, 1, {deferSBA: true}), 1);
    assert.equal(protectedCreature.damage, 2, 'artifact damage is outside the creature source filter');
    await ctx.game.checkSBA();
    assert.equal(protectedCreature.zone, 'graveyard');
  });

  test(`v8 ${role}: multiple prevention-and-growth sources do not each add counters for the same prevented damage`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Other Prevented Grow');
    await settle(ctx.game);
    await paidCast(ctx, 'Other Prevented Grow');
    await settle(ctx.game);
    const ally = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(enemy, ally, 4), 0);
    assert.equal(ally.counters['+1/+1'], 4, 'after the first prevention the event has zero damage remaining');
    assert.equal(replacementChoices(ctx, 'damage').length, 1);
    const hostile = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(ally, hostile, 1), 1, 'opponent creatures are not protected');
    await settle(ctx.game);
  });

  test(`v8 ${role}: preventing all but one protects only another controlled Dinosaur`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Dinosaur Shield');
    await settle(ctx.game);
    const dinosaur = put(ctx.game, ctx.a, {name: 'Ally Dinosaur', types: ['Creature'], subtypes: ['Dinosaur'], cost: '{G}', power: '2', toughness: '10'});
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(enemy, dinosaur, 5), 1);
    assert.equal(dinosaur.damage, 1);
    assert.equal(await ctx.game.damageCreature(enemy, source, 1), 1, 'another excludes the source even though it is a Dinosaur');
    const hostile = put(ctx.game, ctx.b, dinosaur.def);
    assert.equal(await ctx.game.damageCreature(source, hostile, 3), 3);
    const ally = put(ctx.game, ctx.a, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(enemy, ally, 1), 1);
    await settle(ctx.game);
  });

  test(`v8 ${role}: an attached combat prevention affects both directions and follows the Equipment or Aura host`, async () => {
    const ctx = context(role);
    const host = put(ctx.game, ctx.a, 'Grizzly Bears');
    const aura = await paidCast(ctx, 'Both Combat Aura');
    await settle(ctx.game);
    assert.equal(aura.attachedTo, host.iid);
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(enemy, host, 4, {combat: true}), 0);
    assert.equal(await ctx.game.damagePlayer(host, ctx.b, 4, {combat: true}), 0);
    assert.equal(ctx.b.life, 40);
    assert.equal(await ctx.game.damageCreature(enemy, host, 1), 1, 'noncombat damage remains outside the restriction');
    const nextHost = put(ctx.game, ctx.a, 'Grizzly Bears');
    await ctx.game.attach(aura, nextHost);
    assert.equal(await ctx.game.damagePlayer(host, ctx.b, 1, {combat: true}), 1);
    assert.equal(await ctx.game.damagePlayer(nextHost, ctx.b, 1, {combat: true}), 0);
    const equipment = await paidCast(ctx, 'Flat Shield Equipment');
    await settle(ctx.game);
    ctx.a.pool.C = 1;
    const action = ctx.game.activatableList(ctx.a).find(row => row.card === equipment && row.equip);
    assert.ok(action);
    assert.equal(await ctx.game.activateAbility(ctx.a, action), true);
    await settle(ctx.game);
    assert.equal(equipment.attachedTo, host.iid);
    assert.equal(await ctx.game.damageCreature(enemy, host, 3, {deferSBA: true}), 1, 'the flat reduction prevents two');
    await ctx.game.move(aura, 'exile');
    assert.equal(await ctx.game.damageCreature(enemy, nextHost, 1), 1, 'the unattached creature gets no Equipment protection');
  });

  test(`v8 ${role}: friendly-damage prevention checks the source and recipient controllers independently`, async () => {
    const ctx = context(role);
    await paidCast(ctx, 'Friendly Prevention');
    await settle(ctx.game);
    const source = put(ctx.game, ctx.a, 'Grizzly Bears');
    const ally = put(ctx.game, ctx.a, 'Grizzly Bears');
    const enemy = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(source, ally, 4), 0);
    assert.equal(await ctx.game.damageCreature(enemy, ally, 1), 1);
    assert.equal(await ctx.game.damageCreature(source, enemy, 1), 1);
    assert.equal(await ctx.game.damagePlayer(source, ctx.a, 1), 1, 'players are not recipients of this restriction');
    await settle(ctx.game);
  });

  test(`v8 ${role}: losing a Phantom prevention ability leaves its counters without that prevention effect`, async () => {
    const ctx = context(role);
    const source = await paidCast(ctx, 'Conditional Phantom');
    await settle(ctx.game);
    ctx.game.addCounters(source, '+1/+1', 3);
    const aura = put(ctx.game, ctx.b, 'Lignify');
    await ctx.game.attach(aura, source);
    assert.equal(source.cur.abilitiesDisabled, true);
    const attacker = put(ctx.game, ctx.b, 'Grizzly Bears');
    assert.equal(await ctx.game.damageCreature(attacker, source, 2), 2);
    assert.equal(source.counters['+1/+1'], 3, 'printed prevention no longer exists; this is not a shield-counter intrinsic effect');
    await settle(ctx.game);
  });
}
