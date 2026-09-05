import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const ROLES = ['human', 'ai'];

const FIXTURE_CARDS = [
  card('XR Multi Insight', 'Instant', 'Draw two cards.\nYou gain 2 life.', '{2}{U}'),
  card('XR Cataloging', 'Sorcery', 'Draw three cards, then discard a card.', '{2}{U}'),
  card('XR Muster', 'Sorcery', 'Create two 1/1 white Soldier creature tokens.', '{2}{W}'),
  card('XR Shrivel', 'Sorcery', 'All creatures get -2/-2 until end of turn.', '{2}{B}'),
  card('XR Fortify', 'Instant', 'Put two +1/+1 counters on target creature you control.', '{1}{G}'),
  card('XR Fog', 'Instant', 'Prevent all combat damage that would be dealt this turn.', '{G}'),
  card('XR Tap Two', 'Instant', 'Tap up to two target creatures.', '{1}{U}'),
  card('XR Scry', 'Instant', 'Scry 2.', '{U}'),
  card('XR Channel', 'Instant', 'Add one mana of any color.', '{G}'),
  card('XR Wrath', 'Sorcery', 'Destroy all creatures.', '{2}{W}{W}'),
  card('XR Reclaim Permanent', 'Sorcery', 'Return target permanent card from your graveyard to your hand.', '{2}{G}'),
  card('XR Defensive Wave', 'Instant', 'Attacking creatures get -2/-0 until end of turn.', '{1}{U}'),
  card('XR Creature Counter', 'Instant', 'Counter target creature spell.', '{1}{U}'),
  card('XR Aura', 'Enchantment — Aura',
    'Flash\nEnchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature gets +1/+2 and has flying.', '{1}{U}'),
  card('XR Red Aura', 'Enchantment — Aura', 'Enchant creature\nEnchanted creature gets +1/+0.', '{R}'),
  card('XR Equipment', 'Artifact — Equipment',
    'Equipped creature gets +2/+0 and has vigilance.\nEquip {1}', '{2}'),
  card('XR Vehicle', 'Artifact — Vehicle', 'Crew 2', '{3}', { power: '4', toughness: '4' }),
  card('XR Filter Relic', 'Artifact', '{1}, {T}: Add {W} or {U}.', '{2}'),
  card('XR Protection', 'Creature — Knight', 'Protection from red\nProtection from artifacts', '{1}{W}', {
    power: '2', toughness: '2',
  }),
  card('XR Unblockable', 'Creature — Rogue', "This creature can't be blocked.", '{2}{U}', {
    power: '2', toughness: '2',
  }),
  card('XR Cloud Guard', 'Creature — Elemental', 'Reach\nThis creature can block only creatures with flying.', '{2}{U}', {
    power: '2', toughness: '3',
  }),
  card('XR Anthem', 'Enchantment', 'Creatures you control get +1/+1.', '{2}{W}'),
  card('XR Loot', 'Creature — Wizard', 'When this creature enters, draw a card, then discard a card.', '{2}{U}', {
    power: '2', toughness: '2',
  }),
  card('XR Optional Loot', 'Creature — Wizard',
    'When this creature enters, you may discard a card. If you do, draw a card.', '{2}{U}', {
      power: '2', toughness: '2',
    }),
  card('XR Treasure', 'Creature — Pirate', 'When this creature enters, create a Treasure token.', '{2}{R}', {
    power: '2', toughness: '2',
  }),
  card('XR Rats', 'Creature — Rat', 'When this creature enters, each opponent discards a card.', '{2}{B}', {
    power: '2', toughness: '2',
  }),
  card('XR Death Life', 'Creature — Golem', 'When this creature dies, you gain 3 life.', '{3}', {
    power: '2', toughness: '2',
  }),
  card('XR Champion', 'Creature — Warrior',
    'Whenever you cast a noncreature spell, put a +1/+1 counter on this creature.', '{1}{G}', {
      power: '2', toughness: '2',
    }),
  card('XR Cycler', 'Creature — Beast', 'Cycling {1}', '{4}{G}', { power: '4', toughness: '4' }),
  card('XR Flashback', 'Sorcery', 'Draw a card.\nFlashback {2}{U}', '{2}{U}'),
  card('XR Rebound', 'Sorcery', 'Draw a card.\nRebound', '{1}{U}'),
  card('XR Suspend', 'Sorcery', 'Draw a card.\nSuspend 1—{U}', '{2}{U}'),
  card('XR Morph', 'Creature — Shapeshifter', 'Morph {2}{U}', '{3}{U}', { power: '3', toughness: '3' }),
  card('XR Disguise', 'Creature — Shapeshifter', 'Disguise {2}{U}', '{3}{U}', { power: '3', toughness: '3' }),
  card('XR Persist', 'Creature — Spirit', 'Persist', '{2}{W}', { power: '2', toughness: '2' }),
  card('XR Undying', 'Creature — Spirit', 'Undying', '{2}{B}', { power: '2', toughness: '2' }),
  card('XR Changeling', 'Creature — Shapeshifter', 'Changeling', '{2}{U}', { power: '2', toughness: '2' }),
  card('XR Convoke', 'Sorcery', 'Draw a card.\nConvoke', '{3}{U}'),
  card('XR Cascade', 'Sorcery', 'Draw a card.\nCascade', '{3}{U}'),
  card('XR Storm', 'Sorcery', 'Create a Treasure token.\nStorm', '{1}{R}'),
  card('XR Devoid', 'Instant', 'Devoid\nDraw a card.', '{1}{U}'),
  card('XR Uncounterable', 'Instant', "This spell can't be countered.\nDraw a card.", '{1}{U}'),
];

let fixturesReady = false;

function card(name, typeLine, oracle, manaCost, extras = {}) {
  return Object.assign({
    id: `scryfall-${slug(name)}`,
    oracle_id: `oracle-${slug(name)}`,
    name,
    layout: 'normal',
    mana_cost: manaCost,
    type_line: typeLine,
    oracle_text: oracle,
    color_identity: [],
    colors: [],
    keywords: [],
    games: ['paper'],
    legalities: { commander: 'legal' },
    set: 'tst',
    set_name: 'Runtime Tests',
    collector_number: slug(name),
    rarity: 'common',
    released_at: '2026-01-01',
    scryfall_uri: 'https://example.invalid/runtime-fixture',
  }, extras);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function rawCard(source) {
  const [left, right = ''] = source.type_line.split(/\s+—\s+/, 2);
  const typeWords = left.split(/\s+/).filter(Boolean);
  const knownTypes = new Set(['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land']);
  return {
    name: source.name,
    cost: source.mana_cost || null,
    super: typeWords.filter(word => !knownTypes.has(word)),
    types: typeWords.filter(word => knownTypes.has(word)),
    subtypes: right.split(/\s+/).filter(Boolean),
    oracle: source.oracle_text,
    _ci: source.color_identity || [],
    _oracleId: source.oracle_id,
    _scryfallId: source.id,
    _layout: source.layout,
    _set: source.set,
    _collectorNumber: source.collector_number,
    _rarity: source.rarity,
    ...(source.power !== undefined ? { power: String(source.power) } : {}),
    ...(source.toughness !== undefined ? { toughness: String(source.toughness) } : {}),
  };
}

function ensureFixtures() {
  if (fixturesReady) return;
  const entries = FIXTURE_CARDS.map((source, index) => {
    const semantics = semanticClass(source);
    assert.equal(semantics.reason, undefined, `${source.name}: fixture must pass the exact importer`);
    return Object.assign({
      position: index + 1,
      oracleId: source.oracle_id,
      scryfallId: source.id,
      raw: rawCard(source),
      catalog: {
        typeLine: source.type_line,
        colorIdentity: source.color_identity,
        colors: source.colors,
        keywords: source.keywords,
        commanderLegality: 'legal',
      },
    }, semantics);
  });
  MTG.registerOracleBatch({ id: 'oracle-expanded-runtime-fixtures', sequence: 9999, cards: entries });
  MTG.initData(MTG.RAW_DATA);
  fixturesReady = true;
}

function fallbackDecision(query, state = {}) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') {
    const preferred = (state.preferredTargets || []).filter(target => query.candidates.includes(target));
    const picked = preferred.slice(0, query.max ?? 1);
    for (const candidate of query.candidates) {
      if (picked.length >= (query.max ?? 1)) break;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
    return picked.length >= (query.min ?? 1) ? picked : [];
  }
  if (query.type === 'chooseCards') {
    if (query.min === 0 && state.declineOptional) return [];
    const preferred = (state.preferredCards || []).filter(candidate => query.from.includes(candidate));
    const picked = preferred.slice(0, query.max ?? 1);
    for (const candidate of query.from) {
      if (picked.length >= (query.max ?? query.min ?? 1)) break;
      if (!picked.includes(candidate)) picked.push(candidate);
    }
    return picked.length >= (query.min ?? 0) ? picked : [];
  }
  if (query.type === 'chooseOption') {
    const wanted = state.optionKeys && state.optionKeys.shift();
    if (query.options.some(option => option.key === wanted)) return wanted;
    if (query.aiHint?.kind === 'manaColor') return query.options.find(option => option.key === 'U')?.key || query.options[0]?.key;
    return query.options[0]?.key;
  }
  if (query.type === 'chooseX') return Math.max(query.min || 0, Math.min(query.max, state.chooseX ?? query.max));
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min ?? query.count ?? 0).map(option => option.key);
  if (query.type === 'chooseManaSources') return (query.sources || query.candidates || []).slice(0, query.count || query.min || 0);
  if (query.type === 'scry') {
    state.scryQueries = (state.scryQueries || 0) + 1;
    return { top: query.cards.slice(), bottom: [] };
  }
  if (query.type === 'orderTriggers') return query.triggers.slice();
  if (query.type === 'cardReveal' || query.type === 'threatAlert' || query.type === 'manualResolve') return 'ok';
  return null;
}

function makeGame(role, options = {}) {
  ensureFixtures();
  const state = Object.assign({ trace: [], preferredTargets: [], preferredCards: [], optionKeys: [] }, options.state || {});
  const game = new MTG.Game({ seed: role === 'ai' ? 4419 : 4418, paced: false, maxTurns: 6, difficulty: 'hard' });
  const player = game.addPlayer(role === 'ai' ? 'Oracle local bot' : 'Oracle scripted human', { name: `${role} fixture` }, null, role === 'ai');
  const opponents = Array.from({ length: options.opponents || 1 }, (_, index) => game.addPlayer(
    `Oracle opponent ${index + 1}`,
    { name: `opponent ${index + 1}` },
    { decide: async (currentGame, query) => fallbackDecision(query, {}) },
    false,
  ));
  if (role === 'ai') {
    const controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
    const decide = controller.decide.bind(controller);
    controller.decide = async (currentGame, query) => {
      state.trace.push(query.type);
      return decide(currentGame, query);
    };
    player.controller = controller;
  } else {
    player.controller = {
      decide: async (currentGame, query) => {
        state.trace.push(query.type);
        return fallbackDecision(query, state);
      },
    };
  }
  game.turnPlayer = player;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  for (const participant of [player, ...opponents]) fillLibrary(participant, 30);
  return { game, player, opponents, state };
}

function zoneCard(player, definition, zone) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  assert.ok(def, `definition exists: ${definition}`);
  const instance = new MTG.CardInst(def, player);
  instance.zone = zone;
  player[zone].push(instance);
  return instance;
}

function permanent(game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  assert.ok(def, `definition exists: ${definition}`);
  const instance = new MTG.CardInst(def, player);
  instance.ctrl = player;
  instance.zone = 'battlefield';
  instance.sick = false;
  game.battlefield.push(instance);
  game.recalc();
  return instance;
}

function synthetic(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    kws: [],
    power: types.includes('Creature') ? '3' : undefined,
    toughness: types.includes('Creature') ? '3' : undefined,
  }, extras);
}

function fillLibrary(player, amount) {
  for (let index = 0; index < amount; index++) zoneCard(player, 'Forest', 'library');
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'expanded Oracle runtime stack settles');
}

async function castFree(context, name) {
  const instance = zoneCard(context.player, name, 'hand');
  assert.equal(await context.game.castSpell(context.player, instance, {
    from: 'hand', alt: { free: true },
  }), true, `${context.player.name}: casts ${name}`);
  await settle(context.game);
  return instance;
}

function poolTotal(player) {
  return Object.values(player.pool).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
}

test('expanded fixtures pass the exact parser and compile every declared operation/contract', () => {
  ensureFixtures();
  for (const source of FIXTURE_CARDS) {
    const semantics = semanticClass(source);
    const def = MTG.DEFS[source.name];
    assert.ok(def, `${source.name}: real engine definition`);
    assert.deepEqual(Array.from(def.oracleImplementation || []).map(operation => operation.kind),
      Array.from(semantics.implementation || []).map(operation => operation.kind), `${source.name}: parser/compiler operation parity`);
    assert.deepEqual(Array.from(def.oracleContracts || []), Array.from(semantics.oracleContracts || []),
      `${source.name}: interaction contract parity`);
  }
});

for (const role of ROLES) {
  test(`${role}: type-specific counter targets use the cast face, not the physical card`, async () => {
    const context = makeGame(role);
    const bounceTarget = permanent(context.game, context.player, synthetic(`${role} Adventure bounce target`, ['Artifact']));
    const borrower = zoneCard(context.opponents[0], 'Brazen Borrower', 'hand');
    assert.equal(await context.game.castSpell(context.opponents[0], borrower, {
      from: 'hand',
      alt: Object.assign({ adventure: true, free: true }, borrower.def.adventure),
    }), true);
    const adventureSpell = context.game.stack.find(entry => entry.card === borrower);
    assert.ok(adventureSpell);
    assert.equal(context.game.isCreatureSpell(adventureSpell), false);
    assert.equal(context.game.isInstantSorcerySpell(adventureSpell), true);

    const creature = zoneCard(context.opponents[0], synthetic(`${role} ordinary creature spell`), 'hand');
    assert.equal(await context.game.castSpell(context.opponents[0], creature, {
      from: 'hand', alt: { free: true },
    }), true);
    const creatureSpell = context.game.stack.find(entry => entry.card === creature);
    assert.ok(creatureSpell);

    const counter = zoneCard(context.player, 'XR Creature Counter', 'hand');
    const [spec] = context.game.spellTargetSpecs(counter, {}, context.player);
    const legal = context.game.legalTargets(spec, counter, context.player);
    assert.ok(legal.includes(creatureSpell), 'ordinary creature spell is a legal target');
    assert.equal(legal.includes(adventureSpell), false,
      'Creature card cast as its Instant Adventure face is not a creature spell');
    assert.equal(bounceTarget.zone, 'battlefield', 'Adventure remains unresolved during the target probe');
  });
}

test('local deterministic AI executes optional loot only with real discard surplus', async () => {
  {
    const context = makeGame('ai');
    const fodder = Array.from({ length: 4 }, () => zoneCard(context.player, 'Forest', 'hand'));
    const libraryBefore = context.player.library.length;
    await castFree(context, 'XR Optional Loot');
    assert.equal(context.player.library.length, libraryBefore - 1, 'surplus basic land is exchanged for a draw');
    assert.equal(fodder.filter(card => card.zone === 'graveyard').length, 1, 'AI discards exactly one surplus land');
    assert.ok(context.state.trace.includes('chooseCards'), 'real local AI receives the optional loot choice');
  }

  {
    const context = makeGame('ai');
    const onlyLand = zoneCard(context.player, 'Forest', 'hand');
    const libraryBefore = context.player.library.length;
    await castFree(context, 'XR Optional Loot');
    assert.equal(context.player.library.length, libraryBefore, 'AI keeps its only needed land and declines the optional draw');
    assert.equal(onlyLand.zone, 'hand');
  }
});

for (const role of ROLES) {
  test(`${role}: multi-operation spell resolves every printed line once and in order`, async () => {
    const context = makeGame(role);
    const beforeLibrary = context.player.library.length;
    const beforeLife = context.player.life;
    const spell = await castFree(context, 'XR Multi Insight');

    assert.equal(context.player.library.length, beforeLibrary - 2, 'draw fragment resolves exactly once');
    assert.equal(context.player.life, beforeLife + 2, 'life fragment resolves in the same resolution');
    assert.equal(spell.zone, 'graveyard');
    assert.equal(context.game.stack.length, 0);
  });

  test(`${role}: draw-discard spell and ETB loot use real hand decisions and zone events`, async () => {
    {
      const context = makeGame(role);
      const fodder = zoneCard(context.player, synthetic(`${role} catalog fodder`), 'hand');
      context.state.preferredCards = [fodder];
      const beforeLibrary = context.player.library.length;
      const beforeHand = context.player.hand.length;
      const spell = await castFree(context, 'XR Cataloging');

      assert.equal(context.player.library.length, beforeLibrary - 3);
      assert.equal(context.player.hand.length, beforeHand + 2,
        'the spell is added after the baseline, then cast -1, draw +3, discard -1');
      assert.equal(spell.zone, 'graveyard');
      assert.equal(context.player.graveyard.length, 2, 'spell and one discarded card reach the graveyard');
      assert.ok(context.state.trace.includes('chooseCards'), 'controller made the discard choice');
    }

    {
      const context = makeGame(role);
      const fodder = zoneCard(context.player, synthetic(`${role} loot fodder`), 'hand');
      context.state.preferredCards = [fodder];
      const beforeLibrary = context.player.library.length;
      const beforeHand = context.player.hand.length;
      const looter = await castFree(context, 'XR Loot');

      assert.equal(looter.zone, 'battlefield');
      assert.equal(context.player.library.length, beforeLibrary - 1);
      assert.equal(context.player.hand.length, beforeHand,
        'the creature is added after the baseline and leaves hand while draw/discard are balanced');
      assert.equal(context.player.graveyard.length, 1, 'exactly one non-spell card was discarded');
      assert.ok(context.state.trace.includes('chooseCards'), 'ETB loot asks the active controller');
    }
  });

  test(`${role}: new ETB/dies/noncreature-cast trigger templates run through the Stack`, async () => {
    {
      const context = makeGame(role, { opponents: 2 });
      for (const opponent of context.opponents) {
        zoneCard(opponent, synthetic(`${role} discard ${opponent.idx}`), 'hand');
        zoneCard(opponent, synthetic(`${role} spare ${opponent.idx}`), 'hand');
      }
      const before = context.opponents.map(opponent => opponent.hand.length);
      await castFree(context, 'XR Rats');
      assert.deepEqual(context.opponents.map(opponent => opponent.hand.length), before.map(amount => amount - 1));
      assert.deepEqual(context.opponents.map(opponent => opponent.graveyard.length), [1, 1]);
    }

    {
      const context = makeGame(role);
      const beforeTokens = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.player).length;
      await castFree(context, 'XR Treasure');
      const treasures = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.player && card.name === 'Treasure Token');
      assert.equal(treasures.length, beforeTokens + 1);
      assert.equal(treasures[0].is('Artifact'), true);
    }

    {
      const context = makeGame(role);
      const source = await castFree(context, 'XR Death Life');
      const beforeLife = context.player.life;
      await context.game.destroy(source);
      assert.equal(source.zone, 'graveyard', 'dies source changes zone before its trigger resolves');
      assert.equal(context.game.stack.length, 0, 'dies trigger is queued before flushing');
      assert.ok(context.game.pendingTriggers.length > 0);
      await settle(context.game);
      assert.equal(context.player.life, beforeLife + 3);
    }

    {
      const context = makeGame(role);
      const champion = await castFree(context, 'XR Champion');
      const before = champion.counters['+1/+1'] || 0;
      await castFree(context, 'XR Multi Insight');
      assert.equal(champion.counters['+1/+1'], before + 1, 'noncreature cast trigger placed one counter');
    }
  });
}

for (const role of ROLES) {
  test(`${role}: persist, undying and changeling compiled flags drive death and subtype rules`, async () => {
    {
      const context = makeGame(role);
      const persist = await castFree(context, 'XR Persist');
      await context.game.destroy(persist);
      await settle(context.game);
      assert.equal(persist.zone, 'battlefield');
      assert.equal(persist.counters['-1/-1'], 1);
      await context.game.destroy(persist);
      await settle(context.game);
      assert.equal(persist.zone, 'graveyard', 'persist does not recur a creature already carrying a -1/-1 counter');
    }

    {
      const context = makeGame(role);
      const undying = await castFree(context, 'XR Undying');
      await context.game.destroy(undying);
      await settle(context.game);
      assert.equal(undying.zone, 'battlefield');
      assert.equal(undying.counters['+1/+1'], 1);
      await context.game.destroy(undying);
      await settle(context.game);
      assert.equal(undying.zone, 'graveyard', 'undying does not recur a creature already carrying a +1/+1 counter');
    }

    {
      const context = makeGame(role);
      const changeling = await castFree(context, 'XR Changeling');
      assert.equal(changeling.hasSub('Elf'), true);
      assert.equal(changeling.hasSub('Goblin'), true);
      assert.equal(changeling.hasSub('Equipment'), false, 'changeling is limited to creature subtypes');
    }
  });

  test(`${role}: Convoke and Storm modifiers participate in payment/cast history instead of metadata only`, async () => {
    {
      const context = makeGame(role);
      const helpers = Array.from({ length: 3 }, (_, index) => permanent(context.game, context.player,
        synthetic(`${role} convoke helper ${index}`, ['Creature'], { power: '1', toughness: '1' })));
      const spell = zoneCard(context.player, 'XR Convoke', 'hand');
      context.player.pool.U = 1;
      context.state.preferredCards = helpers;
      const beforeLibrary = context.player.library.length;
      assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand' }), true);
      await settle(context.game);
      assert.ok(helpers.every(creature => creature.tapped), 'three creatures paid the generic Convoke cost');
      assert.equal(context.player.library.length, beforeLibrary - 1);
    }

    {
      const context = makeGame(role);
      await castFree(context, 'XR Multi Insight');
      await castFree(context, 'XR Channel');
      const before = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.player && card.name === 'Treasure Token').length;
      await castFree(context, 'XR Storm');
      const after = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.player && card.name === 'Treasure Token').length;
      assert.equal(after - before, 3, 'two earlier casts create two Storm copies plus the original');
    }
  });

  test(`${role}: Devoid and uncounterable modifiers change real stack characteristics`, async () => {
    {
      const context = makeGame(role);
      const devoid = zoneCard(context.player, 'XR Devoid', 'hand');
      assert.deepEqual(Array.from(devoid.colors), [], 'Devoid overrides the blue mana-cost color in hand');
      assert.equal(await context.game.castSpell(context.player, devoid, { from: 'hand', alt: { free: true } }), true);
      const stackObject = context.game.stack.find(entry => entry.card === devoid);
      assert.ok(stackObject);
      assert.deepEqual(Array.from(devoid.colors), [], 'Devoid remains colorless on the Stack');
      await settle(context.game);
    }

    {
      const context = makeGame(role);
      const spell = zoneCard(context.player, 'XR Uncounterable', 'hand');
      const beforeLibrary = context.player.library.length;
      assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand', alt: { free: true } }), true);
      const stackObject = context.game.stack.find(entry => entry.card === spell);
      assert.ok(stackObject);
      assert.equal(await context.game.counterStackObject(stackObject), false);
      assert.ok(context.game.stack.includes(stackObject), 'failed counter leaves the spell on Stack');
      await settle(context.game);
      assert.equal(context.player.library.length, beforeLibrary - 1);
      assert.equal(spell.zone, 'graveyard');
    }
  });

  test(`${role}: Cascade modifier creates a real cast path for a lower-mana library card`, async () => {
    const context = makeGame(role);
    context.player.library.splice(0);
    fillLibrary(context.player, 4);
    const lower = zoneCard(context.player, 'XR Multi Insight', 'library');
    const high = zoneCard(context.player, synthetic(`${role} cascade miss`, ['Creature'], {
      cost: '{7}', power: '7', toughness: '7',
    }), 'library');
    const cascade = zoneCard(context.player, 'XR Cascade', 'hand');
    const beforeLife = context.player.life;
    assert.equal(await context.game.castSpell(context.player, cascade, { from: 'hand', alt: { free: true } }), true);
    await settle(context.game);
    assert.equal(lower.zone, 'graveyard', 'lower-mana card was cast, not merely moved');
    assert.equal(context.player.life, beforeLife + 2, 'cascaded multi-operation spell resolved');
    assert.equal(high.zone, 'library', 'nonmatching exile row is returned to the library');
    assert.ok(context.player.turnState.spellsCastList.some(entry => entry.card === lower));
  });
}

for (const role of ROLES) {
  test(`${role}: cycling, Flashback, Rebound and Suspend use their real zone/cost paths`, async () => {
    {
      const context = makeGame(role);
      const cycler = zoneCard(context.player, 'XR Cycler', 'hand');
      context.player.pool.C = 1;
      const beforeLibrary = context.player.library.length;
      const action = context.game.activatableList(context.player).find(entry => entry.card === cycler && entry.cycling);
      assert.ok(action, 'compiled Cycling is offered from hand');
      assert.equal(await context.game.activateAbility(context.player, action), true);
      assert.equal(cycler.zone, 'graveyard');
      assert.equal(context.player.library.length, beforeLibrary, 'Cycling draw waits on its activated ability');
      assert.equal(context.game.stack.at(-1)?.kind, 'ability');
      assert.match(context.game.stack.at(-1)?.name || '', /Cycling/);
      await settle(context.game);
      assert.equal(context.player.library.length, beforeLibrary - 1);
      assert.equal(context.player.pool.C, 0);
    }

    {
      const context = makeGame(role);
      const flashback = zoneCard(context.player, 'XR Flashback', 'graveyard');
      context.player.pool.C = 2;
      context.player.pool.U = 1;
      const beforeLibrary = context.player.library.length;
      const offer = context.game.castableList(context.player).find(entry => entry.card === flashback && entry.alt?.flashback);
      assert.ok(offer, 'compiled Flashback is offered from graveyard');
      assert.equal(await context.game.castSpell(context.player, flashback, { from: offer.from, alt: offer.alt }), true);
      await settle(context.game);
      assert.equal(flashback.zone, 'exile');
      assert.equal(context.player.library.length, beforeLibrary - 1);
    }

    {
      const context = makeGame(role);
      const rebound = zoneCard(context.player, 'XR Rebound', 'hand');
      context.player.pool.C = 1;
      context.player.pool.U = 1;
      const beforeLibrary = context.player.library.length;
      assert.equal(await context.game.castSpell(context.player, rebound, { from: 'hand' }), true);
      await settle(context.game);
      assert.equal(rebound.zone, 'exile', 'hand-cast Rebound spell exiles after resolving');
      assert.equal(context.player.library.length, beforeLibrary - 1);
      assert.ok(context.game.delayed.some(entry => /Rebound/.test(entry.name)), 'next-upkeep free cast is scheduled');
    }

    {
      const context = makeGame(role);
      const suspend = zoneCard(context.player, 'XR Suspend', 'hand');
      context.player.pool.U = 1;
      const action = context.game.activatableList(context.player).find(entry => entry.card === suspend && entry.suspend);
      assert.ok(action, 'compiled Suspend is offered as a special action');
      assert.equal(await context.game.activateAbility(context.player, action), true);
      assert.equal(suspend.zone, 'exile');
      assert.equal(suspend.meta.suspended, 1);
      assert.equal(context.game.stack.length, 0, 'Suspend action itself does not use the Stack');
    }
  });

  test(`${role}: a Flashback spell is exiled if countered or if all targets become illegal`, async () => {
    {
      const context = makeGame(role);
      const flashback = zoneCard(context.player, 'XR Flashback', 'graveyard');
      context.player.pool.C = 2;
      context.player.pool.U = 1;
      const offer = context.game.castableList(context.player).find(entry => entry.card === flashback && entry.alt?.flashback);
      assert.ok(offer);
      assert.equal(await context.game.castSpell(context.player, flashback, { from: offer.from, alt: offer.alt }), true);
      const stackObject = context.game.stack.find(entry => entry.card === flashback);
      assert.ok(stackObject);
      assert.equal(await context.game.counterStackObject(stackObject), true);
      assert.equal(flashback.zone, 'exile', 'Flashback replacement applies when a counter removes the spell from Stack');
      assert.equal(context.player.graveyard.includes(flashback), false);
    }

    {
      const context = makeGame(role);
      const target = permanent(context.game, context.player, synthetic(`${role} flashback fizzle target`));
      const targetedSource = card(`XR Flashback Target ${role}`, 'Instant',
        'Target creature gets -1/-1 until end of turn.\nFlashback {1}{U}', '{1}{U}');
      const semantics = semanticClass(targetedSource);
      assert.equal(semantics.reason, undefined);
      const scriptName = `XR Runtime Fizzle ${role}`;
      const entry = Object.assign({
        oracleId: `oracle-${slug(scriptName)}`,
        raw: Object.assign(rawCard(targetedSource), { name: scriptName, _oracleId: `oracle-${slug(scriptName)}` }),
      }, semantics);
      // Registration is intentionally avoided here: reuse the already compiled
      // Flashback modifier and a real targeted template by cloning its operation
      // into an isolated definition.
      const targeted = new MTG.CardInst(Object.assign({}, MTG.DEFS['XR Flashback'], {
        name: scriptName,
        oracleImplementation: entry.implementation,
        targets: MTG.DEFS['XR Fortify'].targets,
        resolve: MTG.DEFS['XR Fortify'].resolve,
        flashback: MTG.DEFS['XR Flashback'].flashback,
      }), context.player);
      targeted.zone = 'graveyard';
      context.player.graveyard.push(targeted);
      context.player.pool.C = 2;
      context.player.pool.U = 1;
      context.state.preferredTargets = [target];
      const offer = context.game.castableList(context.player).find(candidate => candidate.card === targeted && candidate.alt?.flashback);
      assert.ok(offer);
      assert.equal(await context.game.castSpell(context.player, targeted, { from: offer.from, alt: offer.alt }), true);
      await context.game.move(target, 'hand');
      await settle(context.game);
      assert.equal(targeted.zone, 'exile', 'Flashback replacement applies when all targets are illegal');
    }
  });

  test(`${role}: Morph and Disguise compile to castable face-down spells and retain turn-up costs`, async () => {
    const setPool = (player, values = {}) => {
      for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 0;
      Object.assign(player.pool, values);
    };
    for (const name of ['XR Morph', 'XR Disguise']) {
      const kind = name === 'XR Morph' ? 'morph' : 'disguise';
      const turnUpCost = '{2}{U}';
      const printedCost = '{3}{U}';
      const context = makeGame(role);
      const hidden = zoneCard(context.player, name, 'hand');
      setPool(context.player, { C: 3 });
      const offers = context.game.castableList(context.player).filter(entry => entry.card === hidden);
      const faceDown = offers.find(entry => entry.alt &&
        (entry.alt.faceDown || entry.alt.morph || entry.alt.disguise || entry.alt.faceDownKind || entry.alt.faceDownCast));
      assert.ok(faceDown, `${name}: hand offers a face-down cast alternative`);
      assert.equal(await context.game.castSpell(context.player, hidden, { from: faceDown.from, alt: faceDown.alt }), true);
      assert.equal(hidden.zone, 'stack', `${name}: the real face-down spell pauses on the Stack`);
      assert.equal(hidden.faceDown, true, `${name}: its public characteristics are already face down on the Stack`);
      const stackObject = context.game.stack.find(item => item.card === hidden);
      assert.ok(stackObject, `${name}: face-down spell has a real stack object`);
      assert.equal(stackObject.name, 'Face-down creature spell', `${name}: stack label is identity-safe`);
      assert.equal(stackObject.card.name, 'Face-down creature', `${name}: stack card exposes only face-down characteristics`);
      const publicView = MTG.createBotPlayerView(context.game, context.opponents[0].idx);
      const publicStack = publicView.stack.find(item => item.card?.id === hidden.iid);
      assert.equal(publicStack?.name, 'Face-down creature', `${name}: public bot view uses the generic identity`);
      assert.doesNotMatch(JSON.stringify(publicView), new RegExp(name),
        `${name}: printed identity never leaks through the public Stack view`);
      assert.doesNotMatch(context.game.log.map(item => item.msg).join('\n'), new RegExp(name),
        `${name}: public cast log never reveals the face-down spell`);
      await settle(context.game);
      assert.equal(hidden.castMeta.manaSpent, 3, `${name}: face-down cast pays exactly {3}`);
      assert.equal(poolTotal(context.player), 0, `${name}: face-down cast consumes its exact pool`);
      assert.equal(hidden.zone, 'battlefield');
      assert.equal(hidden.faceDown, true);
      assert.equal(hidden.meta.faceDownKind, kind, `${name}: records the method used to cast it face down`);
      assert.equal(hidden.name, 'Face-down creature');
      assert.equal(hidden.power, 2);
      assert.equal(hidden.toughness, 2);
      assert.equal(hidden.cur.wardCost?.mana || null, name === 'XR Disguise' ? '{2}' : null,
        'Disguise, but not Morph, grants ward {2} while face down');

      assert.deepEqual(Array.from(context.game.faceUpCosts(hidden), entry => ({ kind: entry.kind, cost: entry.cost })),
        [{ kind, cost: turnUpCost }],
        `${name}: a face-down cast exposes only its matching keyword cost, never printed mana cost`);

      // The printed cost is fully affordable here, so rejection proves it is
      // illegal for this face-down origin rather than merely underfunded.
      setPool(context.player, { C: 3, U: 1 });
      let beforePool = Object.assign({}, context.player.pool);
      let actions = context.game.activatableList(context.player)
        .filter(entry => entry.card === hidden && entry.turnFaceUp);
      assert.deepEqual(Array.from(actions, entry => entry.faceUpCost), [turnUpCost],
        `${name}: action list does not leak the printed ${printedCost} turn-up route`);
      assert.equal(await context.game.turnFaceUp(context.player, hidden, printedCost), false,
        `${name}: explicitly requesting the printed cost is rejected atomically`);
      assert.deepEqual(Object.assign({}, context.player.pool), beforePool, `${name}: illegal printed-cost attempt spends no mana`);
      assert.equal(hidden.faceDown, true, `${name}: illegal printed-cost attempt keeps the permanent face down`);
      assert.equal(hidden.name, 'Face-down creature', `${name}: illegal attempt does not reveal identity`);

      setPool(context.player, { C: 1, U: 1 });
      beforePool = Object.assign({}, context.player.pool);
      assert.equal(await context.game.turnFaceUp(context.player, hidden, turnUpCost), false,
        `${name}: underfunded matching cost is rejected`);
      assert.deepEqual(Object.assign({}, context.player.pool), beforePool, `${name}: underfunded attempt spends no partial mana`);
      assert.equal(hidden.faceDown, true, `${name}: underfunded attempt remains face down`);

      setPool(context.player, { C: 2, U: 1 });
      actions = context.game.activatableList(context.player)
        .filter(entry => entry.card === hidden && entry.turnFaceUp);
      assert.equal(actions.length, 1, `${name}: exactly one matching special action is payable`);
      if (role === 'ai') {
        const beforeDecisions = context.game.aiDecisionLog?.length || 0;
        await context.game.mainPhase(context.player);
        assert.ok((context.game.aiDecisionLog || []).slice(beforeDecisions).some(decision =>
          decision.chosen === 'Turn a face-down creature face up'),
        `${name}: the real local AI chooses the matching turn-face-up action`);
      } else {
        assert.equal(await context.game.activateAbility(context.player, actions[0]), true);
      }
      assert.equal(hidden.faceDown, false);
      assert.equal(hidden.name, name);
      assert.equal(hidden.power, 3);
      assert.equal(hidden.toughness, 3);
      assert.equal(poolTotal(context.player), 0, `${name}: matching cost spends exactly {2}{U}`);
      assert.equal(context.game.stack.length, 0, 'turning face up is a special action');

      // Manifest/cloak have a different rules origin: a creature card may use
      // its printed mana cost, and an intrinsic Morph/Disguise cost remains an
      // additional legal special action.
      const putKind = kind === 'morph' ? 'manifest' : 'cloak';
      const putFaceDown = zoneCard(context.player, name, 'hand');
      assert.equal(await context.game.putFaceDown(context.player, putFaceDown, putKind), putFaceDown);
      assert.equal(putFaceDown.meta.faceDownKind, putKind);
      setPool(context.player, { C: 6, U: 2 });
      assert.deepEqual(Array.from(context.game.faceUpCosts(putFaceDown), entry => ({ kind: entry.kind, cost: entry.cost })), [
        { kind: 'mana cost', cost: printedCost },
        { kind, cost: turnUpCost },
      ], `${name}/${putKind}: printed and intrinsic keyword costs both remain legal`);
      actions = context.game.activatableList(context.player)
        .filter(entry => entry.card === putFaceDown && entry.turnFaceUp);
      assert.deepEqual(Array.from(actions, entry => entry.faceUpCost), [printedCost, turnUpCost],
        `${name}/${putKind}: both legal turn-up actions reach the controller`);

      const selectedCost = putKind === 'manifest' ? printedCost : turnUpCost;
      setPool(context.player, putKind === 'manifest' ? { C: 3, U: 1 } : { C: 2, U: 1 });
      const selectedAction = context.game.activatableList(context.player)
        .find(entry => entry.card === putFaceDown && entry.turnFaceUp && entry.faceUpCost === selectedCost);
      assert.ok(selectedAction, `${name}/${putKind}: selected legal route remains executable`);
      assert.equal(await context.game.activateAbility(context.player, selectedAction), true);
      assert.equal(putFaceDown.faceDown, false);
      assert.equal(putFaceDown.name, name);
      assert.equal(poolTotal(context.player), 0, `${name}/${putKind}: selected route pays its exact cost`);
      assert.equal(context.game.stack.length, 0, `${name}/${putKind}: turn-up remains a special action`);

      // Ability loss removes intrinsic Morph/Disguise routes, but the
      // rules-granted manifest/cloak mana-cost route remains available.
      const disabledContext = makeGame(role);
      const disabledIntrinsic = zoneCard(disabledContext.player, name, 'hand');
      assert.equal(await disabledContext.game.putFaceDown(disabledContext.player, disabledIntrinsic, kind), disabledIntrinsic);
      const intrinsicLignify = permanent(disabledContext.game, disabledContext.opponents[0], 'Lignify');
      assert.equal(await disabledContext.game.attach(intrinsicLignify, disabledIntrinsic), true);
      disabledContext.game.recalc();
      assert.equal(disabledIntrinsic.cur.abilitiesDisabled, true, `${name}: Lignify removes intrinsic abilities`);
      setPool(disabledContext.player, { C: 6, U: 2 });
      const disabledBefore = Object.assign({}, disabledContext.player.pool);
      assert.deepEqual(Array.from(disabledContext.game.faceUpCosts(disabledIntrinsic)), [],
        `${name}: a Morph/Disguise-origin permanent has no turn-up route after losing abilities`);
      assert.equal(disabledContext.game.activatableList(disabledContext.player)
        .some(entry => entry.card === disabledIntrinsic && entry.turnFaceUp), false,
      `${name}: action list cannot bypass intrinsic ability loss`);
      assert.equal(await disabledContext.game.turnFaceUp(disabledContext.player, disabledIntrinsic, turnUpCost), false,
        `${name}: direct engine call cannot bypass intrinsic ability loss`);
      assert.deepEqual(Object.assign({}, disabledContext.player.pool), disabledBefore,
        `${name}: rejected intrinsic turn-up spends no mana`);
      assert.equal(disabledIntrinsic.faceDown, true);

      const disabledRuleGranted = zoneCard(disabledContext.player, name, 'hand');
      assert.equal(await disabledContext.game.putFaceDown(disabledContext.player, disabledRuleGranted, putKind), disabledRuleGranted);
      const ruleGrantedLignify = permanent(disabledContext.game, disabledContext.opponents[0], 'Lignify');
      assert.equal(await disabledContext.game.attach(ruleGrantedLignify, disabledRuleGranted), true);
      disabledContext.game.recalc();
      setPool(disabledContext.player, { C: 3, U: 1 });
      assert.deepEqual(Array.from(disabledContext.game.faceUpCosts(disabledRuleGranted), entry => ({ kind: entry.kind, cost: entry.cost })), [
        { kind: 'mana cost', cost: printedCost },
      ], `${name}/${putKind}: ability loss leaves only the rules-granted printed-cost route`);
      const ruleGrantedAction = disabledContext.game.activatableList(disabledContext.player)
        .find(entry => entry.card === disabledRuleGranted && entry.turnFaceUp);
      assert.equal(ruleGrantedAction?.faceUpCost, printedCost,
        `${name}/${putKind}: printed-cost action remains available despite ability loss`);
      assert.equal(await disabledContext.game.activateAbility(disabledContext.player, ruleGrantedAction), true);
      assert.equal(disabledRuleGranted.faceDown, false);
      assert.equal(disabledRuleGranted.name, name);
      assert.equal(poolTotal(disabledContext.player), 0, `${name}/${putKind}: rule-granted route pays exactly the printed cost`);
    }
  });
}

test('lokalni AI decision log ne otkriva printed identitet face-down cast alternative', async () => {
  const context = makeGame('ai');
  const hidden = zoneCard(context.player, 'XR Morph', 'hand');
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) context.player.pool[color] = 0;
  context.player.pool.C = 3;
  const casts = context.game.castableList(context.player).filter(entry => entry.card === hidden);
  assert.equal(casts.length, 1, 'only the affordable face-down cast is exposed');
  assert.equal(casts[0].alt?.faceDownCast, 'morph');

  await context.player.controller.decide(context.game, {
    type: 'main', player: context.player, casts, acts: [], lands: [], phase: 'main1',
  });
  const logged = JSON.stringify(context.game.aiDecisionLog.at(-1));
  assert.match(logged, /face-down creature spell/i, 'AI decision remains useful without revealing the card');
  assert.doesNotMatch(logged, /XR Morph/, 'chosen and alternative labels both hide the printed identity');
});

test('stvarna batch Cascade karta završava outer cast event pa stavlja respondable trigger iznad spella', async () => {
  const context = makeGame('human');
  context.player.library.splice(0);
  const fog = zoneCard(context.player, 'Fog', 'library');
  const forest = zoneCard(context.player, 'Forest', 'library');
  const miss = zoneCard(context.player, synthetic('Cascade ordering miss', ['Creature'], {
    cost: '{7}', power: '7', toughness: '7',
  }), 'library');
  const outburst = zoneCard(context.player, 'Violent Outburst', 'hand');
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) context.player.pool[color] = 0;
  context.player.pool.C = 1;
  context.player.pool.R = 1;
  context.player.pool.G = 1;

  const castEvents = [];
  const reveals = [];
  context.game.revealToHuman = async payload => {
    reveals.push({
      names: Array.from(payload.cards, card => card.name),
      zones: Array.from(payload.cards, card => card.zone),
      allInPublicExile: payload.cards.every(card => context.player.exile.includes(card)),
      includeLands: payload.includeLands,
    });
  };
  const emit = context.game.emit.bind(context.game);
  context.game.emit = async (event, data) => {
    if (event === 'cast') {
      castEvents.push({
        card: data.card,
        fromHand: data.fromHand,
        soFrom: data.so.from,
        zone: data.card.zone,
        stack: context.game.stack.map(item => ({ kind: item.kind, name: item.name, card: item.card })),
      });
    }
    return emit(event, data);
  };

  assert.equal(await context.game.castSpell(context.player, outburst, { from: 'hand' }), true);
  assert.equal(outburst.castMeta.alt.free, undefined, 'actual outer spell pays its printed mana cost');
  assert.equal(outburst.castMeta.manaSpent, 3);
  assert.equal(castEvents.length, 1, 'inner spell is not cast inline before the outer cast event finishes');
  assert.equal(castEvents[0].card, outburst);
  assert.equal(castEvents[0].zone, 'stack', 'outer cast event observes its spell on the Stack');
  assert.deepEqual(Array.from(castEvents[0].stack, item => [item.kind, item.name]), [
    ['spell', 'Violent Outburst'],
  ], 'Cascade has not executed during the outer cast event');

  assert.deepEqual(Array.from(context.game.stack, item => [item.kind, item.name]), [
    ['spell', 'Violent Outburst'],
    ['trigger', 'Violent Outburst: Cascade'],
  ], 'Cascade is a separately respondable trigger above the original spell');
  assert.equal(fog.zone, 'library', 'the library is untouched until the Cascade trigger resolves');

  await settle(context.game);
  assert.deepEqual(reveals, [{
    names: ['Cascade ordering miss', 'Forest', 'Fog'],
    zones: ['exile', 'exile', 'exile'],
    allInPublicExile: true,
    includeLands: true,
  }], 'the complete Cascade row is public before the cast choice and bottoming');
  assert.ok(context.game.log.some(item => /Cascade ordering miss, Forest, Fog/.test(item.msg)),
    'the durable public log preserves every revealed identity');
  assert.equal(castEvents.length, 2, 'the Cascade hit emits its own later cast event');
  assert.equal(castEvents[1].card, fog);
  assert.equal(castEvents[1].zone, 'stack');
  assert.equal(castEvents[1].fromHand, false, 'the Cascade hit does not impersonate a hand cast');
  assert.equal(castEvents[1].soFrom, 'exile', 'the Cascade hit preserves its real exile source');
  assert.ok(castEvents[1].stack.some(item => item.card === outburst),
    'the original spell remains on the Stack while the cascaded spell is cast');
  assert.equal(fog.zone, 'graveyard', 'the cascaded Fog resolves through the real Stack');
  assert.equal(outburst.zone, 'graveyard', 'the outer spell resolves only after its Cascade hit');
  assert.equal(miss.zone, 'library', 'missed exiled cards return to the library bottom');
  assert.equal(forest.zone, 'library', 'revealed lands return with the same public bottoming group');

  const resolutions = context.game.log.filter(item => item.cls === 'resolve').map(item => item.msg);
  const cascadeIndex = resolutions.findIndex(message => /Cascade/.test(message));
  const fogIndex = resolutions.findIndex(message => /Fog/.test(message));
  const outburstIndex = resolutions.findIndex(message => /Violent Outburst/.test(message) && !/Cascade/.test(message));
  assert.ok(cascadeIndex >= 0 && fogIndex > cascadeIndex && outburstIndex > fogIndex,
    `resolution order is Cascade → Fog → Violent Outburst: ${resolutions.join(' | ')}`);
});

test('stvarna Cascade karta vraća nelegalan hit na dno umjesto da ga pokloni u ruku', async () => {
  const context = makeGame('human');
  context.player.library.splice(0);
  const accelerate = zoneCard(context.player, 'Accelerate', 'library');
  const outburst = zoneCard(context.player, 'Violent Outburst', 'hand');
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) context.player.pool[color] = 0;
  context.player.pool.C = 1;
  context.player.pool.R = 1;
  context.player.pool.G = 1;

  assert.equal(await context.game.castSpell(context.player, outburst, { from: 'hand' }), true);
  await settle(context.game);
  assert.equal(accelerate.zone, 'library', 'failed target selection returns the hit to the Cascade bottoming group');
  assert.ok(context.player.library.includes(accelerate));
  assert.ok(!context.player.hand.includes(accelerate), 'failed Cascade cast never becomes a drawn card');
  assert.ok(!context.player.exile.includes(accelerate), 'temporary public exile is cleaned up on rollback');
  assert.equal(outburst.zone, 'graveyard');
});

for (const role of ROLES) {
  test(`${role}: stvarni Cycling koristi respondable ability i draw tek na rezoluciji`, async () => {
    {
      const context = makeGame(role);
      permanent(context.game, context.player, 'Archfiend of Ifnir');
      const victim = permanent(context.game, context.opponents[0], synthetic(`${role} cycling victim`, ['Creature'], {
        power: '3', toughness: '3',
      }));
      const cycler = zoneCard(context.player, 'Angel of the God-Pharaoh', 'hand');
      for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) context.player.pool[color] = 0;
      context.player.pool.C = 2;
      const beforeLibrary = context.player.library.length;
      const action = context.game.activatableList(context.player).find(entry => entry.card === cycler && entry.cycling);
      assert.ok(action);

      assert.equal(await context.game.activateAbility(context.player, action), true);
      assert.equal(cycler.zone, 'graveyard', 'discard is paid as an activation cost');
      assert.equal(context.player.library.length, beforeLibrary, 'draw has not happened during activation');
      assert.deepEqual(Array.from(context.game.stack, item => item.kind), ['ability', 'trigger']);
      assert.match(context.game.stack[0].name, /Angel of the God-Pharaoh.*Cycling/);
      assert.match(context.game.stack[1].name, /Archfiend of Ifnir/,
        'when-you-cycle trigger is above the Cycling draw ability');

      await context.game.resolveTop();
      assert.equal(victim.counters['-1/-1'], 1, 'cycle payoff resolves while the draw can still be answered');
      assert.equal(context.player.library.length, beforeLibrary);
      assert.equal(context.game.stack.at(-1)?.kind, 'ability');
      await context.game.resolveTop();
      assert.equal(context.player.library.length, beforeLibrary - 1, 'Cycling draws exactly on ability resolution');
    }

    {
      const context = makeGame(role);
      const cycler = zoneCard(context.player, 'Angel of the God-Pharaoh', 'hand');
      context.player.pool.C = 2;
      const beforeLibrary = context.player.library.length;
      const action = context.game.activatableList(context.player).find(entry => entry.card === cycler && entry.cycling);
      assert.equal(await context.game.activateAbility(context.player, action), true);
      const ability = context.game.stack.find(item => item.kind === 'ability' && item.srcCard === cycler);
      assert.ok(ability, 'Cycling ability can be selected on the Stack');
      assert.equal(await context.game.counterStackObject(ability), true);
      await settle(context.game);
      assert.equal(context.player.library.length, beforeLibrary, 'countered Cycling ability does not draw');
      assert.equal(cycler.zone, 'graveyard', 'countering the ability does not refund its discard cost');
    }
  });

  test(`${role}: stvarni Storm je respondable cast trigger prije nastanka kopija`, async () => {
    {
      const context = makeGame(role);
      const grapeshot = zoneCard(context.player, 'Grapeshot', 'hand');
      context.player.pool.C = 1;
      context.player.pool.R = 1;
      assert.equal(await context.game.castSpell(context.player, grapeshot, { from: 'hand' }), true);
      assert.deepEqual(Array.from(context.game.stack, item => [item.kind, item.name]), [
        ['spell', 'Grapeshot'],
        ['trigger', 'Grapeshot: Storm'],
      ], 'the first spell still creates a zero-copy Storm trigger');
      await context.game.resolveTop();
      assert.deepEqual(Array.from(context.game.stack, item => item.kind), ['spell'],
        'zero-copy Storm resolves without creating a spell copy');
      await settle(context.game);
    }

    {
      const context = makeGame(role);
      context.player.turnState.spellsCast = 1;
      const grapeshot = zoneCard(context.player, 'Grapeshot', 'hand');
      context.player.pool.C = 1;
      context.player.pool.R = 1;
      const beforeLife = context.game.players.reduce((sum, player) => sum + player.life, 0);
      const castSnapshots = [];
      const emit = context.game.emit.bind(context.game);
      context.game.emit = async (event, data) => {
        if (event === 'cast' && data.card === grapeshot) {
          castSnapshots.push(context.game.stack.map(item => ({ kind: item.kind, card: item.card })));
        }
        return emit(event, data);
      };

      assert.equal(await context.game.castSpell(context.player, grapeshot, { from: 'hand' }), true);
      assert.deepEqual(Array.from(castSnapshots[0], item => item.kind), ['spell'],
        'cast event completes before the Storm trigger is stacked');
      assert.deepEqual(Array.from(context.game.stack, item => [item.kind, item.name]), [
        ['spell', 'Grapeshot'],
        ['trigger', 'Grapeshot: Storm'],
      ]);
      assert.equal(context.game.players.reduce((sum, player) => sum + player.life, 0), beforeLife,
        'neither original nor copy resolves during casting');

      await context.game.resolveTop();
      assert.equal(context.game.stack.length, 2);
      assert.equal(context.game.stack[0].card, grapeshot);
      assert.equal(context.game.stack[1].isCopy, true, 'copy appears only when the Storm trigger resolves');
      await settle(context.game);
      assert.equal(context.game.players.reduce((sum, player) => sum + player.life, 0), beforeLife - 2);
    }

    {
      const context = makeGame(role);
      context.player.turnState.spellsCast = 1;
      const grapeshot = zoneCard(context.player, 'Grapeshot', 'hand');
      context.player.pool.C = 1;
      context.player.pool.R = 1;
      const beforeLife = context.game.players.reduce((sum, player) => sum + player.life, 0);
      assert.equal(await context.game.castSpell(context.player, grapeshot, { from: 'hand' }), true);
      const storm = context.game.stack.find(item => item.kind === 'trigger' && /Storm/.test(item.name));
      assert.ok(storm);
      assert.equal(await context.game.counterStackObject(storm), true, 'Storm trigger can be answered independently');
      await settle(context.game);
      assert.equal(context.game.players.reduce((sum, player) => sum + player.life, 0), beforeLife - 1,
        'countering Storm leaves only the original spell');
    }
  });
}

for (const role of ROLES) {
  test(`${role}: Aura and Equipment use targeting, Stack attachment and continuous grants`, async () => {
    {
      const context = makeGame(role);
      const host = permanent(context.game, context.player, synthetic(`${role} aura host`, ['Creature'], {
        power: '2', toughness: '2',
      }));
      const noncreature = permanent(context.game, context.player, synthetic(`${role} aura decoy`, ['Artifact']));
      context.state.preferredTargets = [noncreature, host];
      const aura = zoneCard(context.player, 'XR Aura', 'hand');
      const [spec] = context.game.spellTargetSpecs(aura, {}, context.player);
      const legal = Array.from(context.game.legalTargets(spec, aura, context.player));
      assert.equal(legal.length, 1);
      assert.equal(legal[0], host);
      assert.equal(await context.game.castSpell(context.player, aura, { from: 'hand', alt: { free: true } }), true);
      await settle(context.game);
      assert.equal(aura.zone, 'battlefield');
      assert.equal(aura.attachedTo, host.iid);
      assert.equal(host.tapped, true, 'Aura ETB trigger observes its attached host');
      assert.equal(host.power, 3);
      assert.equal(host.toughness, 4);
      assert.equal(host.kw('flying'), true);
    }

    {
      const context = makeGame(role);
      const host = permanent(context.game, context.player, synthetic(`${role} equipment host`, ['Creature'], {
        power: '2', toughness: '2',
      }));
      const equipment = await castFree(context, 'XR Equipment');
      context.player.pool.C = 1;
      const action = context.game.activatableList(context.player).find(entry => entry.card === equipment && entry.equip);
      assert.ok(action, 'compiled Equip action is offered at sorcery speed');
      context.state.preferredTargets = [host];
      assert.equal(await context.game.activateAbility(context.player, action), true);
      assert.equal(equipment.attachedTo, null, 'Equip uses the Stack instead of attaching during activation');
      assert.equal(context.game.stack.at(-1)?.kind, 'ability');
      await settle(context.game);
      assert.equal(equipment.attachedTo, host.iid);
      assert.equal(host.power, 4);
      assert.equal(host.kw('vigilance'), true);
    }
  });

  test(`${role}: illegal protection attachments fall off and protection blocks damage/targeting`, async () => {
    const context = makeGame(role);
    const protectedCreature = await castFree(context, 'XR Protection');
    const redSource = permanent(context.game, context.opponents[0], synthetic(`${role} red source`, ['Creature'], {
      cost: '{R}', power: '3', toughness: '3',
    }));
    context.game.recalc();
    assert.equal(context.game.isProtectedFrom(protectedCreature, redSource), true);
    assert.equal(await context.game.damageCreature(redSource, protectedCreature, 3), 0);
    assert.equal(protectedCreature.damage, 0);

    const redAura = await castFree(context, 'XR Red Aura');
    const equipment = await castFree(context, 'XR Equipment');
    assert.equal(await context.game.attach(redAura, protectedCreature), true, 'fixture stages an attachment that became illegal');
    assert.equal(await context.game.attach(equipment, protectedCreature), true, 'fixture stages a second illegal attachment');
    await context.game.checkSBA();
    assert.equal(redAura.zone, 'graveyard', 'Aura whose quality is protected from goes to the graveyard');
    assert.equal(equipment.zone, 'battlefield');
    assert.equal(equipment.attachedTo, null, 'Equipment whose quality is protected from detaches');
    assert.equal(protectedCreature.attachments.length, 0);
  });

  test(`${role}: permanent restrictions/statics and paid mana-source costs change actual game legality`, async () => {
    {
      const context = makeGame(role);
      const unblockable = await castFree(context, 'XR Unblockable');
      const cloudGuard = await castFree(context, 'XR Cloud Guard');
      const ground = permanent(context.game, context.opponents[0], synthetic(`${role} ground attacker`));
      const flier = permanent(context.game, context.opponents[0], synthetic(`${role} flying attacker`, ['Creature'], {
        kws: ['flying'],
      }));
      const blocker = permanent(context.game, context.opponents[0], synthetic(`${role} ordinary blocker`));
      context.game.recalc();
      assert.equal(context.game.canBlock(blocker, unblockable), false, 'unblockable static reaches combat legality');
      assert.equal(context.game.canBlock(cloudGuard, ground), false, 'flying-only blocker rejects ground creatures');
      assert.equal(context.game.canBlock(cloudGuard, flier), true, 'flying-only blocker accepts a flier');
    }

    {
      const context = makeGame(role);
      const own = permanent(context.game, context.player, synthetic(`${role} anthem own`, ['Creature'], {
        power: '2', toughness: '2',
      }));
      const hostile = permanent(context.game, context.opponents[0], synthetic(`${role} anthem hostile`, ['Creature'], {
        power: '2', toughness: '2',
      }));
      await castFree(context, 'XR Anthem');
      assert.equal(own.power, 3);
      assert.equal(own.toughness, 3);
      assert.equal(hostile.power, 2);
      assert.equal(hostile.toughness, 2);
    }

    {
      const noPayment = makeGame(role);
      const unavailable = await castFree(noPayment, 'XR Filter Relic');
      unavailable.tapped = false;
      noPayment.game.recalc();
      assert.equal(noPayment.game.canPayMana(noPayment.player, MTG.parseCost('{W}')), false,
        'filter source cannot bootstrap its own {1} activation cost');

      const context = makeGame(role);
      const relic = await castFree(context, 'XR Filter Relic');
      relic.tapped = false;
      context.player.pool.C = 1;
      context.game.recalc();
      assert.equal(context.game.canPayMana(context.player, MTG.parseCost('{W}')), true);
      assert.equal(await context.game.payMana(context.player, MTG.parseCost('{W}'), {
        card: zoneCard(context.player, synthetic(`${role} white payment spell`, ['Instant'], { cost: '{W}' }), 'hand'),
      }), true);
      assert.equal(relic.tapped, true, 'source taps only after its activation cost is paid');
      assert.equal(context.player.pool.C, 0, 'the preexisting mana paid the filter activation');
    }
  });

  test(`${role}: Crew is a repeatable respondable activated ability and expires at turn boundary`, async () => {
    const context = makeGame(role);
    const vehicle = await castFree(context, 'XR Vehicle');
    const firstCrew = permanent(context.game, context.player, synthetic(`${role} first crew`, ['Creature'], {
      power: '2', toughness: '2',
    }));
    context.state.preferredCards = [firstCrew];
    let action = context.game.activatableList(context.player).find(entry => entry.card === vehicle && entry.crew);
    assert.ok(action);
    assert.equal(await context.game.activateAbility(context.player, action), true);
    assert.equal(vehicle.is('Creature'), false, 'Vehicle changes type only when Crew resolves');
    assert.equal(context.game.stack.at(-1)?.kind, 'ability', 'Crew creates a respondable Stack object');
    await settle(context.game);
    assert.equal(vehicle.is('Creature'), true);
    assert.equal(firstCrew.tapped, true);

    const secondCrew = permanent(context.game, context.player, synthetic(`${role} second crew`, ['Creature'], {
      power: '2', toughness: '2',
    }));
    context.state.preferredCards = [secondCrew];
    action = context.game.activatableList(context.player).find(entry => entry.card === vehicle && entry.crew);
    assert.ok(action, 'Crew may be activated even while the Vehicle is already a creature');
    assert.equal(await context.game.activateAbility(context.player, action), true);
    await settle(context.game);
    assert.equal(secondCrew.tapped, true);

    context.game.turnNo += 1;
    context.game.recalc();
    assert.equal(vehicle.is('Creature'), false, 'Crew type effect ends with the turn');
  });
}

for (const role of ROLES) {
  test(`${role}: target filters reject wrong controllers/types and up-to-two targets resolve individually`, async () => {
    {
      const context = makeGame(role);
      const own = permanent(context.game, context.player, synthetic(`${role} own fortify target`));
      const hostile = permanent(context.game, context.opponents[0], synthetic(`${role} hostile fortify decoy`));
      const spell = zoneCard(context.player, 'XR Fortify', 'hand');
      const [spec] = context.game.spellTargetSpecs(spell, {}, context.player);
      const legal = Array.from(context.game.legalTargets(spec, spell, context.player));
      assert.equal(legal.length, 1, '"you control" filter excludes the opponent creature');
      assert.equal(legal[0], own);
      context.state.preferredTargets = [hostile, own];
      assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand', alt: { free: true } }), true);
      await settle(context.game);
      assert.equal(own.counters['+1/+1'], 2);
      assert.equal(hostile.counters['+1/+1'] || 0, 0);
    }

    {
      const context = makeGame(role);
      const first = permanent(context.game, context.opponents[0], synthetic(`${role} first tap target`));
      const second = permanent(context.game, context.opponents[0], synthetic(`${role} second tap target`));
      const decoy = permanent(context.game, context.opponents[0], synthetic(`${role} tap artifact decoy`, ['Artifact']));
      context.state.preferredTargets = [first, second, decoy];
      const spell = zoneCard(context.player, 'XR Tap Two', 'hand');
      const [spec] = context.game.spellTargetSpecs(spell, {}, context.player);
      assert.equal(spec.count, 2);
      assert.equal(spec.upTo, true);
      assert.deepEqual(new Set(context.game.legalTargets(spec, spell, context.player)), new Set([first, second]));
      assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand', alt: { free: true } }), true);
      await settle(context.game);
      assert.equal(first.tapped, true, 'first selected creature taps');
      assert.equal(second.tapped, true, 'second selected creature taps');
      assert.equal(decoy.tapped, false, 'noncreature was never a legal target');
      assert.ok(context.state.trace.includes('chooseTargets'), 'human/bot made a real multi-target decision');
    }
  });

  test(`${role}: team/global effects use the exact affected set and fog only prevents combat damage`, async () => {
    {
      const context = makeGame(role);
      const ownAttacker = permanent(context.game, context.player, synthetic(`${role} own attacker`, ['Creature'], {
        power: '4', toughness: '4',
      }));
      const hostileAttacker = permanent(context.game, context.opponents[0], synthetic(`${role} hostile attacker`, ['Creature'], {
        power: '5', toughness: '5',
      }));
      const hostileNonattacker = permanent(context.game, context.opponents[0], synthetic(`${role} hostile nonattacker`, ['Creature'], {
        power: '5', toughness: '5',
      }));
      ownAttacker.attacking = context.opponents[0];
      hostileAttacker.attacking = context.player;
      context.game.recalc();
      await castFree(context, 'XR Defensive Wave');
      assert.equal(ownAttacker.power, 2, 'all attacking creatures includes caster attacker');
      assert.equal(hostileAttacker.power, 3, 'all attacking creatures includes opponent attacker');
      assert.equal(hostileNonattacker.power, 5, 'nonattacker is outside the effect');
    }

    {
      const context = makeGame(role);
      const own = permanent(context.game, context.player, synthetic(`${role} shrivel own`, ['Creature'], {
        power: '4', toughness: '4',
      }));
      const hostile = permanent(context.game, context.opponents[0], synthetic(`${role} shrivel hostile`, ['Creature'], {
        power: '4', toughness: '4',
      }));
      await castFree(context, 'XR Shrivel');
      assert.equal(own.power, 2);
      assert.equal(own.toughness, 2);
      assert.equal(hostile.power, 2);
      assert.equal(hostile.toughness, 2);
    }

    {
      const context = makeGame(role);
      const attacker = permanent(context.game, context.opponents[0], synthetic(`${role} fog attacker`));
      const before = context.player.life;
      await castFree(context, 'XR Fog');
      assert.equal(await context.game.damagePlayer(attacker, context.player, 3, { combat: true }), 0);
      assert.equal(context.player.life, before);
      assert.equal(await context.game.damagePlayer(attacker, context.player, 2, { combat: false }), 2);
      assert.equal(context.player.life, before - 2, 'fog does not prevent noncombat damage');
    }
  });

  test(`${role}: graveyard permanent return, tokens, scry, mana and board wipe execute their closed templates`, async () => {
    {
      const context = makeGame(role);
      const artifact = zoneCard(context.player, synthetic(`${role} grave permanent`, ['Artifact']), 'graveyard');
      const instant = zoneCard(context.player, synthetic(`${role} grave instant`, ['Instant']), 'graveyard');
      const spell = zoneCard(context.player, 'XR Reclaim Permanent', 'hand');
      const [spec] = context.game.spellTargetSpecs(spell, {}, context.player);
      const legal = Array.from(context.game.legalTargets(spec, spell, context.player));
      assert.equal(legal.length, 1, 'permanent means any permanent card, not a nonexistent Permanent type');
      assert.equal(legal[0], artifact);
      context.state.preferredTargets = [instant, artifact];
      assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand', alt: { free: true } }), true);
      await settle(context.game);
      assert.equal(artifact.zone, 'hand');
      assert.equal(instant.zone, 'graveyard');
    }

    {
      const context = makeGame(role);
      await castFree(context, 'XR Muster');
      const soldiers = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.player && card.hasSub('Soldier'));
      assert.equal(soldiers.length, 2);
      assert.ok(soldiers.every(card => card.power === 1 && card.toughness === 1));

      const beforeLibrary = context.player.library.length;
      await castFree(context, 'XR Scry');
      assert.equal(context.player.library.length, beforeLibrary, 'scry reorders without drawing');
      assert.ok(context.state.trace.includes('scry'), 'controller receives the library-selection decision');

      const beforePool = poolTotal(context.player);
      await castFree(context, 'XR Channel');
      assert.equal(poolTotal(context.player), beforePool + 1, 'mana spell adds exactly one chosen mana');
    }

    {
      const context = makeGame(role);
      const own = permanent(context.game, context.player, synthetic(`${role} wrath own`));
      const hostile = permanent(context.game, context.opponents[0], synthetic(`${role} wrath hostile`));
      const indestructible = permanent(context.game, context.opponents[0], synthetic(`${role} wrath indestructible`, ['Creature'], {
        kws: ['indestructible'],
      }));
      await castFree(context, 'XR Wrath');
      assert.equal(own.zone, 'graveyard');
      assert.equal(hostile.zone, 'graveyard');
      assert.equal(indestructible.zone, 'battlefield', 'destroy-all still respects indestructible');
    }
  });
}
