import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sourceCard(name, oracle, extras = {}) {
  return Object.assign({
    id: `scryfall-${slug(name)}`,
    oracle_id: `oracle-${slug(name)}`,
    name,
    layout: 'normal',
    mana_cost: '{2}{G}',
    type_line: 'Creature — Test',
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
    scryfall_uri: 'https://example.invalid/oracle-v4',
    power: '2',
    toughness: '2',
  }, extras);
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
    power: source.power,
    toughness: source.toughness,
    _ci: source.color_identity || [],
    _oracleId: source.oracle_id,
    _scryfallId: source.id,
    _layout: source.layout,
    _set: source.set,
    _collectorNumber: source.collector_number,
    _rarity: source.rarity,
  };
}

const FIXTURES = [
  sourceCard('V4 Counter Adept',
    'When this creature enters, put two +1/+1 counters on target creature you control.'),
  sourceCard('V4 Other Counter Adept',
    'When this creature enters, put one +1/+1 counter on another target creature you control.'),
  sourceCard('V4 Tap Adept', '{T}: Tap target creature.'),
  sourceCard('V4 Sacrificial Scholar', 'Sacrifice an artifact: Draw a card.'),
  sourceCard('V4 Scaling Beast', 'This creature enters with X +1/+1 counters on it.', { mana_cost: '{X}{G}' }),
  sourceCard('V4 Low Evasion', "This creature can't be blocked by creatures with power 2 or less."),
  sourceCard('V4 Sky Evasion', "This creature can't be blocked except by creatures with flying."),
  sourceCard('V4 Investigator', 'When this creature enters, investigate.'),
  sourceCard('V4 Proliferator', 'When this creature enters, proliferate.'),
  sourceCard('V4 Courtier', 'When this creature enters, you become the monarch.'),
  sourceCard('V4 Returning Witness', "When this creature dies, return it to its owner's hand."),
  sourceCard('V4 Mind Raker', 'When this creature enters, target player mills three cards.'),
  sourceCard('V4 Rally Captain',
    'When this creature enters, creatures you control get +1/+1 and gain vigilance until end of turn.'),
  sourceCard('V4 Shriveler',
    'When this creature enters, target creature an opponent controls gets -2/-2 until end of turn.'),
  sourceCard('V4 Banisher',
    'When this creature enters, exile target creature an opponent controls.'),
  sourceCard('V4 Optional Banisher',
    'When this creature enters, you may exile target creature an opponent controls.'),
  sourceCard('V4 Painful Scholar',
    'When this creature enters, draw two cards and you lose 2 life.'),
  sourceCard('V4 Death Smith',
    'When this creature dies, create two Treasure tokens.'),
  sourceCard('V4 Death Rat',
    'When this creature dies, each opponent discards a card.'),
  sourceCard('V4 Salvage Witness',
    'When this creature dies, return another target artifact card from your graveyard to your hand.',
    { type_line: 'Artifact Creature — Test' }),
  sourceCard('V4 Blood Drainer',
    'When this creature dies, each opponent loses 2 life and you gain 2 life.'),
  sourceCard('V4 Death Spark',
    'When this creature dies, it deals 3 damage to any target.'),
  sourceCard('V4 Cutpurse',
    'Whenever this creature deals combat damage to a player, that player discards a card.'),
  sourceCard('V4 Seer', 'Whenever this creature attacks, scry 2.'),
  sourceCard('V4 Siege Tapper',
    'Whenever this creature attacks, tap target creature defending player controls.'),
  sourceCard('V4 Landfall Spark',
    'Landfall — Whenever a land you control enters, this creature deals 2 damage to each opponent.'),
  sourceCard('V4 Soul Leech',
    'Whenever you gain life, each opponent loses 1 life.'),
  sourceCard('V4 Untapper', '{T}: Untap target creature.'),
  sourceCard('V4 Ember Adept', '{T}: This creature deals 2 damage to any target.'),
  sourceCard('V4 Battle Mentor',
    '{T}: Target creature you control gets +2/+2 and gains trample until end of turn.'),
  sourceCard('V4 Looter', '{T}: Draw a card, then discard a card.'),
  sourceCard('V4 Healer', '{T}: You gain 3 life.'),
  sourceCard('V4 Relic Breaker', '{T}: Destroy target artifact.'),
  sourceCard('V4 Grave Purger', '{T}: Exile target card from a graveyard.'),
  sourceCard('V4 Blocked Scholar', 'Whenever this creature becomes blocked, draw a card.'),
  sourceCard('V4 Blocking Scholar', 'Whenever this creature blocks, draw a card.'),
  sourceCard('V4 Tapped Scholar', 'Whenever this creature becomes tapped, draw a card.'),
  sourceCard('V4 Face Up Scholar', 'When this creature is turned face up, draw a card.'),
  sourceCard('V4 Upkeep Scholar', 'At the beginning of your upkeep, draw a card.'),
  sourceCard('V4 End Step Scholar', 'At the beginning of your end step, draw a card.'),
  sourceCard('V4 Combat Scholar', 'At the beginning of combat on your turn, draw a card.'),
  sourceCard('V4 Creature Welcomer', 'Whenever another creature you control enters, draw a card.'),
  sourceCard('V4 Creature Mourner', 'Whenever another creature you control dies, draw a card.'),
  sourceCard('V4 Artifact Welcomer', 'Whenever another artifact you control enters, draw a card.'),
  sourceCard('V4 Noncreature Watcher', 'Whenever you cast a noncreature spell, draw a card.'),
  sourceCard('V4 Spell Watcher', 'Whenever you cast an instant or sorcery spell, draw a card.'),
  sourceCard('V4 Draw Watcher', 'Whenever you draw a card, you gain 1 life.'),
  sourceCard('V4 Equal Pain', 'When this creature enters, each player loses 2 life.'),
  sourceCard('V4 Counter Chorus',
    'When this creature enters, put one +1/+1 counter on each other creature you control.'),
  sourceCard('V4 Upkeep Muster',
    'At the beginning of your upkeep, create two 1/1 white Soldier creature tokens with vigilance.'),
  sourceCard('V4 Conniver', 'When this creature enters, this creature connives.'),
  sourceCard('V4 Explorer', 'When this creature enters, this creature explores.'),
  sourceCard('V4 Doomed Celebrant', 'At the beginning of your end step, sacrifice this creature.'),
  sourceCard('V4 Coward Maker',
    "When this creature enters, target creature an opponent controls can't block this turn."),
  sourceCard('V4 Attack Surveiller', 'Whenever this creature attacks, surveil 2.'),
  sourceCard('V4 Other Rally',
    'When this creature enters, other creatures you control get +1/+1 until end of turn.'),
  sourceCard('V4 Attack Rally',
    'Whenever this creature attacks, attacking creatures you control get +1/+0 until end of turn.'),
  sourceCard('V4 Elf Captain', 'Other Elf creatures you control get +1/+1.'),
  sourceCard('V4 Vigilance Anthem', 'Creatures you control have vigilance.'),
  sourceCard('V4 Sleeper', "This creature doesn't untap during your untap step."),
  sourceCard('V4 X Blaster', '{X}: This creature deals X damage to any target.'),
  sourceCard('V4 Spell Retriever',
    '{T}: Return target instant or sorcery card from your graveyard to your hand.'),
  sourceCard('V4 Permanent Retriever',
    '{T}: Return target permanent card from your graveyard to your hand.'),
  sourceCard('V4 Combat Blaster',
    '{T}: This creature deals 2 damage to target attacking or blocking creature.'),
  sourceCard('V4 Self Bouncer',
    "At the beginning of your upkeep, return this creature to its owner's hand."),
  sourceCard('V4 Stun Visitor',
    'When this creature enters, tap target creature an opponent controls and put a stun counter on it.'),
];

let ready = false;

function ensureFixtures() {
  if (ready) return;
  const entries = FIXTURES.map((source, index) => {
    const semantics = semanticClass(source);
    assert.equal(semantics.reason, undefined, `${source.name}: accepted by the exact v4 importer`);
    return Object.assign({
      position: index + 1,
      oracleId: source.oracle_id,
      scryfallId: source.id,
      raw: rawCard(source),
      catalog: { typeLine: source.type_line, commanderLegality: 'legal' },
    }, semantics);
  });
  {
    const source = sourceCard('V4 Daylight Beast', 'Direct v4 yourTurnOnly contract fixture.');
    entries.push({
      position: entries.length + 1,
      oracleId: source.oracle_id,
      scryfallId: source.id,
      semanticClass: 'creature-template',
      implementedKeywords: [],
      oracleContracts: ['generic-continuous-effect'],
      implementation: [{
        kind: 'generic-static', scope: 'self', power: 2, toughness: 0, keywords: [],
        yourTurnOnly: true, contract: 'generic-continuous-effect',
      }],
      raw: rawCard(source),
      catalog: { typeLine: source.type_line, commanderLegality: 'legal' },
    });
  }
  entries.push({
    position: entries.length + 1,
    oracleId: 'oracle-v4-two-target-spell',
    scryfallId: 'scryfall-v4-two-target-spell',
    semanticClass: 'instant-template',
    implementedKeywords: [],
    oracleContracts: ['target-offset-regression'],
    implementation: [
      { kind: 'spell-destroy', what: 'creature', contract: 'destroy-target' },
      { kind: 'spell-bounce', what: 'artifact', contract: 'bounce-target' },
    ],
    raw: {
      name: 'V4 Two Target Spell', cost: '{1}{U}{B}', super: [], types: ['Instant'], subtypes: [],
      oracle: "Destroy target creature. Return target artifact to its owner's hand.",
      _ci: ['U', 'B'], _oracleId: 'oracle-v4-two-target-spell',
      _scryfallId: 'scryfall-v4-two-target-spell', _layout: 'normal', _set: 'tst',
      _collectorNumber: 'v4-two-target-spell', _rarity: 'common',
    },
    catalog: { typeLine: 'Instant', commanderLegality: 'legal' },
  });
  MTG.registerOracleBatch({ id: 'oracle-generic-v4-runtime-fixtures', sequence: 9998, cards: entries });
  MTG.initData(MTG.RAW_DATA);
  ready = true;
}

function decisionController(state = {}) {
  return {
    decide: async (game, query) => {
      if (query.type === 'priority') return { kind: 'pass' };
      if (query.type === 'main') {
        const entry = (query.casts || []).find(candidate => candidate.card === state.mainCard);
        return entry ? { kind: 'cast', ...entry } : { kind: 'done' };
      }
      if (query.type === 'chooseTargets') {
        const preferred = (state.targets || []).filter(target => query.candidates.includes(target));
        const picks = preferred.slice(0, query.max ?? 1);
        for (const candidate of query.candidates) {
          if (picks.length >= (query.max ?? 1)) break;
          if (!picks.includes(candidate)) picks.push(candidate);
        }
        return picks.length >= (query.min ?? 0) ? picks : [];
      }
      if (query.type === 'chooseCards') {
        const preferred = (state.cards || []).filter(card => query.from.includes(card));
        const picks = preferred.slice(0, query.max ?? 1);
        for (const candidate of query.from) {
          if (picks.length >= (query.max ?? query.min ?? 1)) break;
          if (!picks.includes(candidate)) picks.push(candidate);
        }
        return picks;
      }
      if (query.type === 'chooseOption') {
        const wanted = state.options && state.options.shift();
        if (query.options.some(option => option.key === wanted)) return wanted;
        return query.options.find(option => option.key === 'yes')?.key || query.options[0].key;
      }
      if (query.type === 'chooseX') return state.x ?? query.max;
      if (query.type === 'scry') {
        state.scryCount = (state.scryCount || 0) + 1;
        return { top: query.cards.slice(), bottom: [] };
      }
      if (query.type === 'orderTriggers') return query.triggers.slice();
      if (query.type === 'cardReveal' || query.type === 'threatAlert' || query.type === 'manualResolve') return 'ok';
      return [];
    },
  };
}

function gameContext(state = {}, role = 'human') {
  ensureFixtures();
  const game = new MTG.Game({ seed: role === 'ai' ? 4405 : 4404, paced: false, maxTurns: 6 });
  const player = game.addPlayer(role === 'ai' ? 'V4 local bot' : 'V4 player', { name: 'V4 deck' }, null, role === 'ai');
  const opponent = game.addPlayer('V4 opponent', { name: 'Opponent deck' }, decisionController(), false);
  if (role === 'ai') player.controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
  else player.controller = decisionController(state);
  game.turnPlayer = player;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  fillLibrary(player, 30);
  fillLibrary(opponent, 30);
  return { game, player, opponent, state };
}

function synthetic(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name, cost: types.includes('Land') ? null : '{1}', super: [], types, subtypes: [], oracle: '', kws: [],
    power: types.includes('Creature') ? '3' : undefined,
    toughness: types.includes('Creature') ? '3' : undefined,
  }, extras);
}

function zoneCard(player, definition, zone) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  assert.ok(def, `definition exists: ${definition}`);
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield';
  card.ctrl = player;
  card.sick = false;
  game._testTimestamp = (game._testTimestamp || 0) + 1;
  card.timestamp = game._testTimestamp;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function fillLibrary(player, n) {
  for (let index = 0; index < n; index++) zoneCard(player, 'Forest', 'library');
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'generic v4 stack settles');
}

async function castFree(context, name) {
  const card = zoneCard(context.player, name, 'hand');
  assert.equal(await context.game.castSpell(context.player, card, { from: 'hand', alt: { free: true } }), true);
  await settle(context.game);
  return card;
}

async function castPaidFromMain(context, name) {
  const { game, player, state } = context;
  const card = zoneCard(player, name, 'hand');
  state.mainCard = card;
  if (state.trySelfTarget) state.targets = [card, ...(state.targets || [])];
  for (const color of Object.keys(player.pool)) player.pool[color] = 0;
  const symbols = [...card.def.cost.matchAll(/\{(\d+|[WUBRGC])\}/g)].map(match => match[1]);
  assert.equal(symbols.map(symbol => `{${symbol}}`).join(''), card.def.cost,
    `${name}: regression funding must cover the exact printed simple mana cost`);
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) player.pool.C += Number(symbol);
    else player.pool[symbol] += 1;
  }
  const action = await player.controller.decide(game, {
    type: 'main', player, phase: game.phase,
    casts: game.castableList(player), acts: game.activatableList(player), lands: [],
  });
  assert.equal(action.kind, 'cast', `${name}: controller chooses a real main-phase cast`);
  assert.equal(action.card, card, `${name}: controller chooses this exact card`);
  assert.equal(await game.performAction(player, action), true);
  await settle(game);
  assert.ok(card.castMeta, `${name}: cast metadata proves the spell was cast`);
  assert.notEqual(card.castMeta.alt?.free, true, `${name}: mana payment is not bypassed`);
  if (player.isAI) {
    assert.ok(player.controller instanceof MTG.AIController, `${name}: genuine local AI`);
    const decisions = (game.aiDecisionLog || []).filter(decision => decision.playerId === player.idx);
    assert.ok(decisions.some(decision => String(decision.chosen).includes(name)), `${name}: AI cast is recorded`);
    assert.equal(decisions.some(decision => decision.fallback), false, `${name}: no AI fallback`);
  }
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
  return card;
}

test('v4 importer operations lower to runtime trigger, ability, static, and enters-with-counter contracts', () => {
  ensureFixtures();
  const expectedKinds = new Map([
    ['V4 Counter Adept', 'generic-trigger'],
    ['V4 Tap Adept', 'generic-ability'],
    ['V4 Sacrificial Scholar', 'generic-ability'],
    ['V4 Scaling Beast', 'enters-with-counters'],
    ['V4 Low Evasion', 'generic-static'],
  ]);
  for (const [name, kind] of expectedKinds) {
    const def = MTG.DEFS[name];
    assert.equal(def.oracleImplementation[0].kind, kind);
  }
  assert.equal(MTG.DEFS['V4 Counter Adept'].triggers.length, 1);
  assert.equal(MTG.DEFS['V4 Tap Adept'].abilities.length, 1);
  assert.equal(typeof MTG.DEFS['V4 Low Evasion'].statics[0].apply, 'function');
  assert.equal(typeof MTG.DEFS['V4 Scaling Beast'].etbCounters.n, 'function');
});

test('generic ETB target/effect lowering honors controller, player-zone, and sequential effects', async () => {
  const state = { targets: [] };
  const context = gameContext(state);
  const ownTarget = permanent(context.game, context.player, synthetic('V4 friendly target'));
  const enemyTarget = permanent(context.game, context.opponent, synthetic('V4 enemy target'));
  state.targets = [enemyTarget, ownTarget];
  await castFree(context, 'V4 Counter Adept');
  assert.equal(ownTarget.counters['+1/+1'], 2);
  assert.equal(enemyTarget.counters['+1/+1'] || 0, 0, 'you-control target constraint is enforced');

  {
    const isolated = gameContext();
    const source = await castFree(isolated, 'V4 Other Counter Adept');
    assert.equal(source.counters['+1/+1'] || 0, 0,
      'another-target contract never treats the source as its own only legal target');
  }

  state.targets = [context.opponent];
  const beforeLibrary = context.opponent.library.length;
  await castFree(context, 'V4 Mind Raker');
  assert.equal(context.opponent.library.length, beforeLibrary - 3, 'zone:player target lowers to a real player target');

  const teammate = permanent(context.game, context.player, synthetic('V4 rally target', ['Creature'], { power: '2', toughness: '2' }));
  await castFree(context, 'V4 Rally Captain');
  assert.equal(teammate.power, 3);
  assert.equal(teammate.toughness, 3);
  assert.equal(teammate.kw('vigilance'), true);
});

test('generic investigate, proliferate, monarch, and dies source identity use real engine paths', async () => {
  {
    const context = gameContext();
    await castFree(context, 'V4 Investigator');
    assert.equal(context.game.bf().filter(card => card.ctrl === context.player && card.name === 'Clue Token').length, 1);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const countered = permanent(context.game, context.player, synthetic('V4 proliferate target'));
    context.game.addCounters(countered, '+1/+1', 1, true, context.player);
    state.targets = [countered];
    await castFree(context, 'V4 Proliferator');
    assert.equal(countered.counters['+1/+1'], 2);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Courtier');
    assert.equal(context.game.monarch, context.player);
  }
  {
    const context = gameContext();
    const witness = await castFree(context, 'V4 Returning Witness');
    await context.game.destroy(witness);
    await settle(context.game);
    assert.equal(witness.zone, 'hand');
    assert.ok(context.player.hand.includes(witness));
  }
});

test('generic activated abilities pay mapped costs and resolve through the Stack', async () => {
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Tap Adept');
    source.sick = false;
    const target = permanent(context.game, context.opponent, synthetic('V4 tap target'));
    state.targets = [target];
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === source && candidate.ability);
    assert.ok(entry);
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    assert.equal(source.tapped, true, 'tap cost is paid before the ability resolves');
    assert.equal(target.tapped, false);
    await settle(context.game);
    assert.equal(target.tapped, true);
  }
  {
    const state = { cards: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Sacrificial Scholar');
    const artifact = permanent(context.game, context.player, synthetic('V4 sacrifice artifact', ['Artifact']));
    state.cards = [artifact];
    const beforeLibrary = context.player.library.length;
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === source && candidate.ability);
    assert.ok(entry, 'sacWhat artifact was lowered to the runtime sacrifice predicate');
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    assert.equal(artifact.zone, 'graveyard');
    await settle(context.game);
    assert.equal(context.player.library.length, beforeLibrary - 1);
  }
});

test('generic ETB removal, debuff, draw, and life effects execute through real targets and zones', async () => {
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const target = permanent(context.game, context.opponent,
      synthetic('V4 shrink target', ['Creature'], { power: '4', toughness: '4' }));
    state.targets = [target];
    await castFree(context, 'V4 Shriveler');
    assert.equal(target.power, 2);
    assert.equal(target.toughness, 2);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const target = permanent(context.game, context.opponent, synthetic('V4 exile target'));
    state.targets = [target];
    await castFree(context, 'V4 Banisher');
    assert.equal(target.zone, 'exile');
    assert.ok(context.opponent.exile.includes(target));
  }
  {
    const context = gameContext();
    const handBefore = context.player.hand.length;
    const libraryBefore = context.player.library.length;
    const lifeBefore = context.player.life;
    await castFree(context, 'V4 Painful Scholar');
    assert.equal(context.player.library.length, libraryBefore - 2);
    assert.equal(context.player.hand.length, handBefore + 2);
    assert.equal(context.player.life, lifeBefore - 2);
  }
});

test('generic dies effects preserve source identity, simultaneous discard, tokens, recursion, drain, and damage', async () => {
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Death Smith');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(context.game.bf().filter(card => card.ctrl === context.player && card.name === 'Treasure Token').length, 2);
  }
  {
    const context = gameContext();
    const discarded = zoneCard(context.opponent, synthetic('V4 discarded card'), 'hand');
    const source = await castFree(context, 'V4 Death Rat');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(discarded.zone, 'graveyard');
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const artifact = zoneCard(context.player, synthetic('V4 graveyard relic', ['Artifact']), 'graveyard');
    state.targets = [artifact];
    const source = await castFree(context, 'V4 Salvage Witness');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(artifact.zone, 'hand');
    assert.ok(context.player.hand.includes(artifact));
  }
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Salvage Witness');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(source.zone, 'graveyard', 'another recursion cannot target the source artifact card itself');
  }
  {
    const context = gameContext();
    const mine = context.player.life;
    const theirs = context.opponent.life;
    const source = await castFree(context, 'V4 Blood Drainer');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(context.player.life, mine + 2);
    assert.equal(context.opponent.life, theirs - 2);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    state.targets = [context.opponent];
    const theirs = context.opponent.life;
    const source = await castFree(context, 'V4 Death Spark');
    await context.game.destroy(source);
    await settle(context.game);
    assert.equal(context.opponent.life, theirs - 3);
  }
});

test('generic combat, attack, landfall, and life-gain triggers use exact engine event data', async () => {
  {
    const context = gameContext();
    const discarded = zoneCard(context.opponent, synthetic('V4 saboteur discard'), 'hand');
    const source = await castFree(context, 'V4 Cutpurse');
    await context.game.emit('combatDamageToPlayer', { card: source, player: context.opponent, n: 2 });
    await settle(context.game);
    assert.equal(discarded.zone, 'graveyard');
  }
  {
    const state = {};
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Seer');
    await context.game.emit('attacks', { card: source, player: context.player, defender: context.opponent });
    await settle(context.game);
    assert.equal(state.scryCount, 1);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Siege Tapper');
    const defendingCreature = permanent(context.game, context.opponent, synthetic('V4 defending creature'));
    state.targets = [defendingCreature];
    await context.game.emit('attacks', { card: source, player: context.player, defender: context.opponent });
    await settle(context.game);
    assert.equal(defendingCreature.tapped, true);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Landfall Spark');
    const theirs = context.opponent.life;
    const land = zoneCard(context.player, 'Forest', 'hand');
    await context.game.move(land, 'battlefield', { ctrl: context.player });
    await settle(context.game);
    assert.equal(context.opponent.life, theirs - 2);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Soul Leech');
    const theirs = context.opponent.life;
    await context.game.gainLife(context.player, 2);
    await settle(context.game);
    assert.equal(context.opponent.life, theirs - 1);
  }
});

test('generic activated effects cover untap, damage, pump, loot, life, destroy, and graveyard exile', async () => {
  async function activate(context, source) {
    source.sick = false;
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === source && candidate.ability);
    assert.ok(entry, `${source.name}: ability is activatable`);
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    await settle(context.game);
  }

  {
    const state = { targets: [] };
    const context = gameContext(state);
    const target = permanent(context.game, context.opponent, synthetic('V4 untap target'));
    context.game.tap(target);
    state.targets = [target];
    await activate(context, await castFree(context, 'V4 Untapper'));
    assert.equal(target.tapped, false);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    state.targets = [context.opponent];
    const before = context.opponent.life;
    await activate(context, await castFree(context, 'V4 Ember Adept'));
    assert.equal(context.opponent.life, before - 2);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const target = permanent(context.game, context.player, synthetic('V4 mentor target'));
    state.targets = [target];
    await activate(context, await castFree(context, 'V4 Battle Mentor'));
    assert.equal(target.power, 5);
    assert.equal(target.toughness, 5);
    assert.equal(target.kw('trample'), true);
  }
  {
    const state = { cards: [] };
    const context = gameContext(state);
    const discarded = zoneCard(context.player, synthetic('V4 loot discard'), 'hand');
    state.cards = [discarded];
    const libraryBefore = context.player.library.length;
    await activate(context, await castFree(context, 'V4 Looter'));
    assert.equal(context.player.library.length, libraryBefore - 1);
    assert.equal(discarded.zone, 'graveyard');
  }
  {
    const context = gameContext();
    const before = context.player.life;
    await activate(context, await castFree(context, 'V4 Healer'));
    assert.equal(context.player.life, before + 3);
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const artifact = permanent(context.game, context.opponent, synthetic('V4 destroy relic', ['Artifact']));
    state.targets = [artifact];
    await activate(context, await castFree(context, 'V4 Relic Breaker'));
    assert.equal(artifact.zone, 'graveyard');
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const graveyardCard = zoneCard(context.opponent, synthetic('V4 purge card'), 'graveyard');
    state.targets = [graveyardCard];
    await activate(context, await castFree(context, 'V4 Grave Purger'));
    assert.equal(graveyardCard.zone, 'exile');
  }
});

test('v4 eventFilter contracts reject foreign events and accept only the exact source/controller event', async () => {
  const selfCases = [
    ['V4 Blocked Scholar', 'becomesBlocked', 'attacker'],
    ['V4 Blocking Scholar', 'blocks', 'blocker'],
    ['V4 Tapped Scholar', 'becameTapped', 'card'],
    ['V4 Face Up Scholar', 'turnedFaceUp', 'card'],
  ];
  for (const [name, event, field] of selfCases) {
    const context = gameContext();
    const source = await castFree(context, name);
    const other = permanent(context.game, context.player, synthetic(`${name} other`));
    const before = context.player.library.length;
    await context.game.emit(event, { [field]: other, player: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before, `${name}: another card does not trigger it`);
    await context.game.emit(event, { [field]: source, player: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1, `${name}: its own event draws exactly once`);
  }

  const turnCases = [
    ['V4 Upkeep Scholar', 'upkeep'],
    ['V4 End Step Scholar', 'endStep'],
    ['V4 Combat Scholar', 'beginCombat'],
  ];
  for (const [name, event] of turnCases) {
    const context = gameContext();
    await castFree(context, name);
    const before = context.player.library.length;
    await context.game.emit(event, { player: context.opponent });
    await settle(context.game);
    assert.equal(context.player.library.length, before, `${name}: opponent event is rejected`);
    await context.game.emit(event, { player: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1, `${name}: controller event resolves`);
  }

  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Creature Welcomer');
    const friendly = permanent(context.game, context.player, synthetic('V4 welcomed creature'));
    const enemy = permanent(context.game, context.opponent, synthetic('V4 unwelcome creature'));
    const before = context.player.library.length;
    await context.game.emit('etb', { card: source, ctrl: context.player });
    await context.game.emit('etb', { card: enemy, ctrl: context.opponent });
    await settle(context.game);
    assert.equal(context.player.library.length, before, 'self and opposing creature ETBs are rejected');
    await context.game.emit('etb', { card: friendly, ctrl: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Creature Mourner');
    const friendly = permanent(context.game, context.player, synthetic('V4 mourned creature'));
    const enemy = permanent(context.game, context.opponent, synthetic('V4 enemy dead creature'));
    const before = context.player.library.length;
    await context.game.emit('dies', { card: enemy, snap: { ctrl: context.opponent, types: ['Creature'] } });
    await settle(context.game);
    assert.equal(context.player.library.length, before);
    await context.game.emit('dies', { card: friendly, snap: { ctrl: context.player, types: ['Creature'] } });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1, 'dies filter uses last-known controller and type');
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Artifact Welcomer');
    const friendlyArtifact = permanent(context.game, context.player, synthetic('V4 welcomed artifact', ['Artifact']));
    const friendlyCreature = permanent(context.game, context.player, synthetic('V4 nonartifact arrival'));
    const before = context.player.library.length;
    await context.game.emit('etb', { card: friendlyCreature, ctrl: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before);
    await context.game.emit('etb', { card: friendlyArtifact, ctrl: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1);
  }
  for (const [name, event] of [['V4 Noncreature Watcher', 'castNonCreature'], ['V4 Spell Watcher', 'castIS']]) {
    const context = gameContext();
    await castFree(context, name);
    const before = context.player.library.length;
    await context.game.emit(event, { player: context.opponent });
    await settle(context.game);
    assert.equal(context.player.library.length, before);
    await context.game.emit(event, { player: context.player });
    await settle(context.game);
    assert.equal(context.player.library.length, before - 1);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Draw Watcher');
    const before = context.player.life;
    await context.game.emit('draw', { player: context.opponent });
    await settle(context.game);
    assert.equal(context.player.life, before);
    await context.game.emit('draw', { player: context.player });
    await settle(context.game);
    assert.equal(context.player.life, before + 1);
  }
});

test('new v4 group, token, connive, explore, sacrifice, cant-block, surveil, and self-return effects mutate real state', async () => {
  {
    const context = gameContext();
    const third = context.game.addPlayer('V4 third player', { name: 'Third deck' }, decisionController(), false);
    fillLibrary(third, 10);
    const life = [context.player.life, context.opponent.life, third.life];
    await castFree(context, 'V4 Equal Pain');
    assert.deepEqual([context.player.life, context.opponent.life, third.life], life.map(value => value - 2));
  }
  {
    const context = gameContext();
    const other = permanent(context.game, context.player, synthetic('V4 counter chorus ally'));
    const enemy = permanent(context.game, context.opponent, synthetic('V4 counter chorus enemy'));
    const source = await castFree(context, 'V4 Counter Chorus');
    assert.equal(source.counters['+1/+1'] || 0, 0);
    assert.equal(other.counters['+1/+1'], 1);
    assert.equal(enemy.counters['+1/+1'] || 0, 0);
  }
  {
    const context = gameContext();
    await castFree(context, 'V4 Upkeep Muster');
    await context.game.emit('upkeep', { player: context.opponent });
    await settle(context.game);
    assert.equal(context.game.bf().filter(card => card.ctrl === context.player && card.name === 'Soldier Token').length, 0);
    await context.game.emit('upkeep', { player: context.player });
    await settle(context.game);
    const soldiers = context.game.bf().filter(card => card.ctrl === context.player && card.name === 'Soldier Token');
    assert.equal(soldiers.length, 2);
    assert.ok(soldiers.every(card => card.power === 1 && card.toughness === 1 && card.kw('vigilance')));
  }
  {
    const state = { cards: [] };
    const context = gameContext(state);
    const discard = zoneCard(context.player, synthetic('V4 connive discard'), 'hand');
    state.cards = [discard];
    const source = await castFree(context, 'V4 Conniver');
    assert.equal(discard.zone, 'graveyard');
    assert.equal(source.counters['+1/+1'], 1, 'discarding a nonland gives the conniving creature a counter');
  }
  {
    const state = { options: ['gy'] };
    const context = gameContext(state);
    const top = zoneCard(context.player, synthetic('V4 explored nonland'), 'library');
    const source = await castFree(context, 'V4 Explorer');
    assert.equal(source.counters['+1/+1'], 1);
    assert.equal(top.zone, 'graveyard');
  }
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Doomed Celebrant');
    await context.game.emit('endStep', { player: context.opponent });
    await settle(context.game);
    assert.equal(source.zone, 'battlefield');
    await context.game.emit('endStep', { player: context.player });
    await settle(context.game);
    assert.equal(source.zone, 'graveyard');
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const target = permanent(context.game, context.opponent, synthetic('V4 cannot block target'));
    state.targets = [target];
    await castFree(context, 'V4 Coward Maker');
    assert.equal(target.cur.cantBlock, true);
  }
  {
    const state = {};
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Attack Surveiller');
    source.attacking = context.opponent;
    await context.game.emit('attacks', { card: source, player: context.player, defender: context.opponent });
    await settle(context.game);
    assert.equal(state.scryCount, 1, 'surveil uses the engine library-selection decision path');
  }
  {
    const context = gameContext();
    const ally = permanent(context.game, context.player,
      synthetic('V4 other rally ally', ['Creature'], { power: '2', toughness: '2' }));
    const source = await castFree(context, 'V4 Other Rally');
    assert.equal(ally.power, 3);
    assert.equal(ally.toughness, 3);
    assert.equal(source.power, 2, 'other-creature pump excludes the same source incarnation');
  }
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Attack Rally');
    const attacking = permanent(context.game, context.player,
      synthetic('V4 fellow attacker', ['Creature'], { power: '2', toughness: '2' }));
    const idle = permanent(context.game, context.player,
      synthetic('V4 idle creature', ['Creature'], { power: '2', toughness: '2' }));
    source.attacking = context.opponent;
    attacking.attacking = context.opponent;
    await context.game.emit('attacks', { card: source, player: context.player, defender: context.opponent });
    await settle(context.game);
    assert.equal(source.power, 3);
    assert.equal(attacking.power, 3);
    assert.equal(idle.power, 2);
  }
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Self Bouncer');
    await context.game.emit('upkeep', { player: context.player });
    await settle(context.game);
    assert.equal(source.zone, 'hand', 'return-source works from battlefield as well as a dies trigger');
  }
});

test('new v4 target constraints, instant-or-sorcery recursion, and activated X use engine legality and payment', async () => {
  async function activate(context, source) {
    source.sick = false;
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === source && candidate.ability);
    assert.ok(entry, `${source.name}: ability is activatable`);
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    await settle(context.game);
  }

  {
    const state = { targets: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Spell Retriever');
    const instant = zoneCard(context.player, synthetic('V4 graveyard instant', ['Instant']), 'graveyard');
    const creature = zoneCard(context.player, synthetic('V4 graveyard creature'), 'graveyard');
    state.targets = [creature, instant];
    await activate(context, source);
    assert.equal(instant.zone, 'hand');
    assert.equal(creature.zone, 'graveyard', 'instant-or-sorcery filter rejects a creature card');
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Permanent Retriever');
    const permanentCard = zoneCard(context.player, synthetic('V4 graveyard enchantment', ['Enchantment']), 'graveyard');
    const instant = zoneCard(context.player, synthetic('V4 graveyard nonpermanent', ['Instant']), 'graveyard');
    state.targets = [instant, permanentCard];
    await activate(context, source);
    assert.equal(permanentCard.zone, 'hand', 'permanent-card target works outside the battlefield zone');
    assert.equal(instant.zone, 'graveyard', 'nonpermanent card remains illegal');
  }
  {
    const state = { targets: [] };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 Combat Blaster');
    const idle = permanent(context.game, context.opponent, synthetic('V4 idle damage target'));
    const attacker = permanent(context.game, context.opponent, synthetic('V4 attacking damage target'));
    attacker.attacking = context.player;
    state.targets = [idle, attacker];
    const idleDamage = idle.damage;
    await activate(context, source);
    assert.equal(idle.damage, idleDamage, 'idle creature is not a legal attacking-or-blocking target');
    assert.equal(attacker.damage, 2);
  }
  {
    const state = { targets: [], x: 3 };
    const context = gameContext(state);
    const source = await castFree(context, 'V4 X Blaster');
    state.targets = [context.opponent];
    context.player.pool.C = 3;
    const before = context.opponent.life;
    await activate(context, source);
    assert.equal(context.opponent.life, before - 3);
    assert.equal(context.player.pool.C, 0, 'chosen X is paid, not treated as zero');
  }
});

test('generic self effects re-check source identity and current control before resolution', async () => {
  {
    const context = gameContext();
    const source = await castFree(context, 'V4 Doomed Celebrant');
    await context.game.emit('endStep', { player: context.player });
    await context.game.flushTriggers();
    assert.equal(context.game.stack.at(-1)?.srcCard, source);
    source.ctrl = context.opponent;
    context.game.recalc();
    await context.game.resolveTop();
    assert.equal(source.zone, 'battlefield', 'old controller cannot sacrifice a permanent it no longer controls');
  }
  {
    const context = gameContext();
    const source = permanent(context.game, context.player, 'V4 Explorer');
    const topLand = zoneCard(context.opponent, 'Forest', 'library');
    const ownHand = context.player.hand.length;
    const opponentHand = context.opponent.hand.length;
    await context.game.emit('etb', { card: source, ctrl: context.player });
    await context.game.flushTriggers();
    source.ctrl = context.opponent;
    context.game.recalc();
    await context.game.resolveTop();
    assert.equal(context.player.hand.length, ownHand);
    assert.equal(context.opponent.hand.length, opponentHand + 1);
    assert.ok(context.opponent.hand.includes(topLand), 'the exploring creature uses its current controller library');
  }
});

test('optional targeted generic triggers lock targets on the Stack and defer may choices to resolution', async () => {
  {
    const state = { targets: [], options: ['no'] };
    const context = gameContext(state);
    const queries = [];
    const decide = context.player.controller.decide.bind(context.player.controller);
    context.player.controller.decide = async (game, query) => {
      queries.push(query.type);
      return decide(game, query);
    };
    const originalTarget = permanent(context.game, context.opponent, synthetic('V4 optional original target'));
    state.targets = [originalTarget];
    const source = zoneCard(context.player, 'V4 Optional Banisher', 'hand');
    await context.game.move(source, 'battlefield', { ctrl: context.player });

    assert.equal(context.game.pendingTriggers.length, 1);
    assert.equal(queries.includes('chooseOption'), false, 'may is not chosen while the event is merely queued');
    await context.game.flushTriggers();
    assert.equal(context.game.stack.length, 1);
    assert.equal(context.game.stack[0].targets[0], originalTarget, 'the legal target is locked while stacking');
    assert.equal(queries.includes('chooseOption'), false, 'may is still deferred after target locking');
    assert.deepEqual(state.options, ['no']);

    const laterTarget = permanent(context.game, context.opponent, synthetic('V4 optional later target'));
    state.targets = [laterTarget];
    await context.game.resolveTop();
    assert.equal(queries.filter(type => type === 'chooseOption').length, 1, 'may is chosen exactly once at resolution');
    assert.equal(originalTarget.zone, 'battlefield', 'declining leaves the locked target unchanged');
    assert.equal(laterTarget.zone, 'battlefield', 'a later permanent cannot replace the locked target');
  }

  {
    const context = gameContext({}, 'ai');
    const queries = [];
    const decide = context.player.controller.decide.bind(context.player.controller);
    context.player.controller.decide = async (game, query) => {
      queries.push(query.type);
      return decide(game, query);
    };
    const enemy = permanent(context.game, context.opponent, synthetic('V4 optional AI target'));
    const source = zoneCard(context.player, 'V4 Optional Banisher', 'hand');
    await context.game.move(source, 'battlefield', { ctrl: context.player });
    await context.game.flushTriggers();

    assert.equal(context.game.stack[0].targets[0], enemy, 'the real local AI locks a hostile legal target');
    assert.equal(queries.includes('chooseOption'), false, 'the real local AI has not made the may choice while stacking');
    await context.game.resolveTop();
    assert.equal(queries.filter(type => type === 'chooseOption').length, 1);
    assert.equal(enemy.zone, 'exile', 'the real local AI accepts the effect at resolution');
  }
});

test('generic trigger identity is captured when the event queues, before dies/LKI reuse or blink', async () => {
  for (const role of ['human', 'ai']) {
    {
      const context = gameContext({}, role);
      const source = permanent(context.game, context.player, 'V4 Doomed Celebrant');
      await context.game.emit('endStep', { player: context.player });
      assert.equal(context.game.pendingTriggers.length, 1);
      const eventZoneVersion = source.zoneVersion;
      await context.game.move(source, 'exile');
      await context.game.move(source, 'battlefield', { ctrl: context.player });
      assert.notEqual(source.zoneVersion, eventZoneVersion);
      await settle(context.game);
      assert.equal(source.zone, 'battlefield', `${role}: a pre-stack blink does not sacrifice the new object`);
    }

    {
      const context = gameContext({}, role);
      const source = permanent(context.game, context.player, 'V4 Returning Witness');
      assert.equal(await context.game.destroy(source), true);
      assert.equal(context.game.pendingTriggers.length, 1);
      const deathZoneVersion = source.zoneVersion;
      await context.game.move(source, 'exile');
      await context.game.move(source, 'graveyard');
      assert.notEqual(source.zoneVersion, deathZoneVersion);
      await settle(context.game);
      assert.equal(source.zone, 'graveyard', `${role}: an old dies trigger does not return a reused graveyard object`);
    }
  }
});

test('new v4 generic-static scopes, subtype filter, yourTurnOnly, and doesnt-untap affect recalculated state', async () => {
  {
    const context = gameContext();
    const enchanted = permanent(context.game, context.player,
      synthetic('A Tale enchanted creature', ['Creature'], { power: '2', toughness: '2' }));
    const idle = permanent(context.game, context.player,
      synthetic('A Tale idle creature', ['Creature'], { power: '2', toughness: '2' }));
    const aura = permanent(context.game, context.player,
      synthetic('A Tale test Aura', ['Enchantment'], { subtypes: ['Aura'], enchant: 'creature' }));
    await context.game.attach(aura, enchanted);
    const tale = permanent(context.game, context.player, 'A Tale for the Ages');
    context.game.recalc();
    assert.equal(tale.def.oracleBatch, 'oracle-0027');
    assert.equal(enchanted.power, 4, 'real batch static recognizes Aura attachment state');
    assert.equal(enchanted.toughness, 4);
    assert.equal(idle.power, 2, 'unenchanted creature is excluded');
    await context.game.move(aura, 'graveyard');
    context.game.recalc();
    assert.equal(enchanted.power, 2, 'bonus expires when the Aura leaves');
  }
  {
    const context = gameContext();
    const elf = permanent(context.game, context.player,
      synthetic('V4 allied elf', ['Creature'], { subtypes: ['Elf'], power: '2', toughness: '2' }));
    const human = permanent(context.game, context.player,
      synthetic('V4 allied human', ['Creature'], { subtypes: ['Human'], power: '2', toughness: '2' }));
    const captain = await castFree(context, 'V4 Elf Captain');
    assert.equal(elf.power, 3);
    assert.equal(elf.toughness, 3);
    assert.equal(human.power, 2);
    assert.equal(captain.power, 2, 'your-other-creatures excludes the source');
  }
  {
    const context = gameContext();
    const ally = permanent(context.game, context.player, synthetic('V4 vigilance ally'));
    const anthem = await castFree(context, 'V4 Vigilance Anthem');
    assert.equal(ally.kw('vigilance'), true);
    assert.equal(anthem.kw('vigilance'), true);
  }
  {
    const context = gameContext();
    const daylight = await castFree(context, 'V4 Daylight Beast');
    assert.equal(daylight.power, 4);
    context.game.turnPlayer = context.opponent;
    context.game.recalc();
    assert.equal(daylight.power, 2);
  }
  {
    const context = gameContext();
    const sleeper = await castFree(context, 'V4 Sleeper');
    sleeper.tapped = true;
    context.game.recalc();
    assert.equal(sleeper.cur.cantUntap, true);
  }
});

test('creature-type vocabulary includes named and inline Creature tokens without noncreature token subtypes', () => {
  const previousVocabulary = MTG.CREATURE_SUBTYPES;
  try {
    // Deliberately omit printed cards: these creature types must come from
    // actual token definitions, including a real Oracle inline token operation.
    MTG.buildDefs({}, {
      'Armada Wurm': MTG.SCRIPTS['Armada Wurm'],
      'V4 noncreature token vocabulary': {
        oracleImplementation: [{ effects: [
          { action: 'token-inline', token: { types: ['Artifact'], subtypes: ['Vehicle'] } },
          { action: 'token-inline', token: { types: ['Enchantment'], subtypes: ['Aura'] } },
          { action: 'token-inline', token: { types: ['Artifact'], subtypes: ['Equipment'] } },
        ] }],
      },
    });
    assert.equal(MTG.CREATURE_SUBTYPES.has('Spawn'), true, 'named Eldrazi Spawn token contributes Spawn');
    assert.equal(MTG.CREATURE_SUBTYPES.has('Wurm'), true, 'real Armada Wurm inline token contributes Wurm');
    for (const subtype of ['Aura', 'Equipment', 'Vehicle', 'Treasure', 'Food', 'Clue']) {
      assert.equal(MTG.CREATURE_SUBTYPES.has(subtype), false, `${subtype} token is not a Creature token`);
    }
  } finally {
    MTG.CREATURE_SUBTYPES = previousVocabulary;
  }
});

test('Broodwarden requires both Eldrazi and Spawn, including real Changeling, after paid human and local-AI casts', async () => {
  const parsed = semanticClass(sourceCard('Broodwarden', 'Eldrazi Spawn creatures you control get +2/+1.', {
    mana_cost: '{3}{G}{G}', type_line: 'Creature — Eldrazi Drone', power: '4', toughness: '4',
  }));
  assert.equal(parsed.implementation[0].subtype, 'Eldrazi Spawn', 'recorded batch contract stays compatible');
  assert.equal(semanticClass(sourceCard('V4 Unknown Compound Anthem',
    'Enchanted Elf creatures you control get +2/+1.')).semanticClass, undefined,
  'unknown compound descriptors fail closed instead of masquerading as one creature subtype');

  for (const role of ['human', 'ai']) {
    const context = gameContext({}, role);
    const { game, player, opponent } = context;
    const tokenDef = subtypes => synthetic(`V4 ${subtypes.join(' ')} token`, ['Creature'], {
      subtypes, power: '0', toughness: '1',
    });
    const spawn = permanent(game, player, tokenDef(['Eldrazi', 'Spawn']));
    spawn.isToken = true;
    const reversed = permanent(game, player, tokenDef(['Spawn', 'Eldrazi']));
    reversed.isToken = true;
    const eldraziOnly = permanent(game, player, tokenDef(['Eldrazi']));
    const spawnOnly = permanent(game, player, tokenDef(['Spawn']));
    const hostileSpawn = permanent(game, opponent, tokenDef(['Eldrazi', 'Spawn']));
    const changeling = permanent(game, player, 'Universal Automaton');
    const changelingBefore = [changeling.power, changeling.toughness];
    const broodwarden = await castPaidFromMain(context, 'Broodwarden');
    assert.deepEqual([spawn.power, spawn.toughness], [2, 2], `${role}: normal two-type token receives +2/+1`);
    assert.deepEqual([reversed.power, reversed.toughness], [2, 2], `${role}: subtype order is immaterial`);
    assert.deepEqual([eldraziOnly.power, eldraziOnly.toughness], [0, 1], `${role}: Eldrazi alone is insufficient`);
    assert.deepEqual([spawnOnly.power, spawnOnly.toughness], [0, 1], `${role}: Spawn alone is insufficient`);
    assert.deepEqual([hostileSpawn.power, hostileSpawn.toughness], [0, 1], `${role}: opponents do not receive the bonus`);
    assert.equal(changeling.hasSub('Spawn'), true, `${role}: real Changeling includes the token-only Spawn type`);
    for (const subtype of ['Aura', 'Equipment', 'Vehicle', 'Treasure', 'Food', 'Clue']) {
      assert.equal(MTG.CREATURE_SUBTYPES.has(subtype), false, `${role}: ${subtype} is not a creature type`);
      assert.equal(changeling.hasSub(subtype), false, `${role}: Changeling does not grant noncreature ${subtype}`);
    }
    assert.deepEqual([changeling.power, changeling.toughness],
      [changelingBefore[0] + 2, changelingBefore[1] + 1], `${role}: real Changeling satisfies both subtype predicates`);
    broodwarden.ctrl = opponent;
    game.recalc();
    assert.deepEqual([spawn.power, spawn.toughness], [0, 1], `${role}: source control change removes the old bonus`);
    assert.deepEqual([hostileSpawn.power, hostileSpawn.toughness], [2, 2], `${role}: source control change updates beneficiaries`);
    await game.move(broodwarden, 'graveyard');
    game.recalc();
    assert.deepEqual([hostileSpawn.power, hostileSpawn.toughness], [0, 1], `${role}: bonus ends when source leaves`);
  }
});

test('all seven up-to-one OTHER bounce triggers exclude self for human and local AI, without losing legal targets', async () => {
  const names = ['Bespoke Bō', 'Disruptor of Currents', 'Exosuit Savior', 'Flock Impostor',
    'Mischievous Pup', 'Rimekin Recluse', 'Stickytongue Sentinel'];
  for (const name of names) {
    const def = MTG.DEFS[name];
    const parsed = semanticClass(sourceCard(name, def.oracle, {
      mana_cost: def.cost, type_line: `${def.types.join(' ')} — ${def.subtypes.join(' ')}`,
      power: def.power, toughness: def.toughness,
    }));
    const operation = parsed.implementation.find(candidate => candidate.kind === 'generic-trigger');
    assert.equal(operation.targets[0].excludeSelf, true, `${name}: compiler retains OTHER`);
    assert.equal(def.oracleImplementation.find(candidate => candidate.kind === 'generic-trigger').targets[0].excludeSelf,
      true, `${name}: actual imported manifest retains OTHER`);
    for (const role of ['human', 'ai']) {
      const state = { trySelfTarget: true, targets: [] };
      const context = gameContext(state, role);
      const { game, player, opponent } = context;
      const ally = permanent(game, player, synthetic(`${name} damaged ally`, ['Creature'], { power: '3', toughness: '3' }));
      ally.damage = 2;
      const enemy = permanent(game, opponent, synthetic(`${name} enemy`, ['Creature'], { power: '8', toughness: '8' }));
      state.targets = [ally];
      const queries = [];
      const decide = player.controller.decide.bind(player.controller);
      player.controller.decide = async (currentGame, query) => {
        if (query.type === 'chooseTargets') queries.push(query.candidates.slice());
        return decide(currentGame, query);
      };
      const source = await castPaidFromMain(context, name);
      const trigger = source.def.triggers.find(candidate => candidate.on === 'etb');
      const legal = game.legalTargets(trigger.targets[0], source, player);
      assert.equal(legal.includes(source), false, `${name}/${role}: source is never its own legal target`);
      assert.equal(source.zone, 'battlefield', `${name}/${role}: source cannot self-bounce`);
      assert.ok(queries.length > 0, `${name}/${role}: controller receives a real target choice`);
      assert.equal(queries.some(candidates => candidates.includes(source)), false,
        `${name}/${role}: human and AI target candidate lists exclude source`);
      assert.ok(ally.zone === 'hand' || enemy.zone === 'hand', `${name}/${role}: a legal OTHER target is actually returned`);
      if (operation.targets[0].controller === 'you') {
        assert.equal(ally.zone, 'hand', `${name}/${role}: you-control requirement is preserved`);
        assert.equal(enemy.zone, 'battlefield');
      }
      for (const other of game.bf().filter(card => card !== source)) await game.move(other, 'graveyard');
      await game.emit('etb', { card: source, ctrl: player });
      await settle(game);
      assert.equal(source.zone, 'battlefield', `${name}/${role}: up-to-one allows no targets when only source remains`);
      assert.equal(game.stack.length, 0);
      assert.equal(game.pendingTriggers.length, 0);
    }
  }
});

test('opponent-only damage draws on Otter, Magpie and Heretic reject self-damage for human and local AI', async () => {
  for (const name of ['Thieving Otter', 'Thieving Magpie', 'Vedalken Heretic']) {
    const def = MTG.DEFS[name];
    const parsed = semanticClass(sourceCard(name, def.oracle, {
      mana_cost: def.cost, type_line: `Creature — ${def.subtypes.join(' ')}`,
      power: def.power, toughness: def.toughness,
    }));
    assert.equal(parsed.implementation.find(operation => operation.kind === 'generic-trigger').opponentOnly, true,
      `${name}: compiler preserves opponent-only damage condition`);
    assert.equal(def.oracleImplementation.find(operation => operation.kind === 'generic-trigger').opponentOnly, true,
      `${name}: actual manifest preserves opponent-only damage condition`);
    for (const role of ['human', 'ai']) {
      const context = gameContext({}, role);
      const { game, player, opponent } = context;
      const source = await castPaidFromMain(context, name);
      const ownHand = player.hand.length;
      await game.damagePlayer(source, player, 1);
      await settle(game);
      assert.equal(player.hand.length, ownHand, `${name}/${role}: dealing damage to own controller never draws`);
      await game.damagePlayer(source, opponent, 1);
      await settle(game);
      assert.equal(player.hand.length, ownHand + 1, `${name}/${role}: real opponent damage draws exactly one card`);
      const foreignSource = permanent(game, player, synthetic(`${name} foreign damage source`));
      await game.damagePlayer(foreignSource, opponent, 1);
      await settle(game);
      assert.equal(player.hand.length, ownHand + 1, `${name}/${role}: another source does not trigger this card`);
      source.ctrl = opponent;
      game.recalc();
      const opponentHand = opponent.hand.length;
      await game.damagePlayer(source, opponent, 1);
      await settle(game);
      assert.equal(opponent.hand.length, opponentHand, `${name}/${role}: own-controller check follows changed control`);
      await game.damagePlayer(source, player, 1);
      await settle(game);
      assert.equal(opponent.hand.length, opponentHand + 1, `${name}/${role}: new controller draws against its opponent`);
      assert.equal(game.stack.length, 0);
      assert.equal(game.pendingTriggers.length, 0);
    }
  }
});

test('enters-with-X and supported generic evasion statics change real runtime state', async () => {
  {
    const context = gameContext();
    const scaling = new MTG.CardInst(MTG.DEFS['V4 Scaling Beast'], context.player);
    scaling.zone = 'stack';
    scaling.castMeta = { x: 3 };
    context.game.stack.push({ kind: 'spell', card: scaling, ctrl: context.player });
    await context.game.move(scaling, 'battlefield', { ctrl: context.player });
    assert.equal(scaling.counters['+1/+1'], 3);
  }
  {
    const context = gameContext();
    const attacker = permanent(context.game, context.player, 'V4 Low Evasion');
    const weak = permanent(context.game, context.opponent, synthetic('V4 weak blocker', ['Creature'], { power: '2', toughness: '4' }));
    const strong = permanent(context.game, context.opponent, synthetic('V4 strong blocker', ['Creature'], { power: '3', toughness: '4' }));
    assert.equal(context.game.canBlock(weak, attacker), false);
    assert.equal(context.game.canBlock(strong, attacker), true);
  }
  {
    const context = gameContext();
    const attacker = permanent(context.game, context.player, 'V4 Sky Evasion');
    const reach = permanent(context.game, context.opponent, synthetic('V4 reach blocker', ['Creature'], { kws: ['reach'] }));
    const flyer = permanent(context.game, context.opponent, synthetic('V4 flying blocker', ['Creature'], { kws: ['flying'] }));
    assert.equal(context.game.canBlock(reach, attacker), false);
    assert.equal(context.game.canBlock(flyer, attacker), true);
  }
});

test('compound spell fragments receive their own target offsets', async () => {
  const state = { targets: [] };
  const context = gameContext(state);
  const creature = permanent(context.game, context.opponent, synthetic('V4 destroy target'));
  const artifact = permanent(context.game, context.opponent, synthetic('V4 bounce target', ['Artifact']));
  state.targets = [creature, artifact];
  await castFree(context, 'V4 Two Target Spell');
  assert.equal(creature.zone, 'graveyard');
  assert.equal(artifact.zone, 'hand');
  assert.ok(context.opponent.hand.includes(artifact));
});

test('local AI uses generic target hints for beneficial and hostile interactions', async () => {
  const context = gameContext({}, 'ai');
  const ownTarget = permanent(context.game, context.player, synthetic('V4 AI friendly target'));
  const enemyTarget = permanent(context.game, context.opponent, synthetic('V4 AI enemy target'));

  await castFree(context, 'V4 Counter Adept');
  assert.equal(ownTarget.counters['+1/+1'], 2, 'AI resolves the beneficial counter on its legal permanent');

  for (let index = 0; index < 4; index++) {
    permanent(context.game, context.player,
      synthetic(`V4 AI high-threat permanent ${index}`, ['Creature'], { power: '10', toughness: '10' }));
  }
  const beforeMine = context.player.library.length;
  const beforeOpponent = context.opponent.library.length;
  await castFree(context, 'V4 Mind Raker');
  assert.equal(context.player.library.length, beforeMine, 'AI does not mill itself by default');
  assert.equal(context.opponent.library.length, beforeOpponent - 3, 'AI mills the opponent');

  const source = await castFree(context, 'V4 Tap Adept');
  source.sick = false;
  const entry = context.game.activatableList(context.player).find(candidate => candidate.card === source && candidate.ability);
  assert.ok(entry);
  assert.equal(await context.game.activateAbility(context.player, entry), true);
  await settle(context.game);
  assert.equal(enemyTarget.tapped, true, 'AI taps the hostile permanent rather than its own creature');
  await context.game.move(enemyTarget, 'graveyard');

  const alreadyTapped = permanent(context.game, context.opponent, synthetic('V4 AI stunned target'));
  alreadyTapped.tapped = true;
  context.game.recalc();
  await castFree(context, 'V4 Stun Visitor');
  assert.equal(alreadyTapped.counters.stun, 1,
    'tap-plus-stun keeps an already tapped hostile permanent valuable to the AI');

  const breaker = await castFree(context, 'V4 Relic Breaker');
  breaker.sick = false;
  const artifact = permanent(context.game, context.opponent,
    synthetic('V4 AI hostile relic', ['Artifact', 'Creature'], { power: '8', toughness: '8' }));
  const mainQuery = {
    type: 'main', player: context.player,
    casts: context.game.castableList(context.player),
    acts: context.game.activatableList(context.player), lands: [], phase: context.game.phase,
  };
  const decision = await context.player.controller.decide(context.game, mainQuery);
  assert.equal(decision.kind, 'activate', 'hard local AI autonomously chooses the useful generic removal ability');
  assert.equal(decision.entry.card, breaker);
  assert.ok(artifact.zone === 'battlefield');
});

test('Recon Craft Theta counters the created Alien, including every token-doubling result, before SBA', async t => {
  const raw = MTG.RAW_DATA.cards['Recon Craft Theta'];
  const parsed = semanticClass(sourceCard(raw.name, raw.oracle, {
    type_line: 'Artifact — Vehicle', mana_cost: raw.cost, power: raw.power, toughness: raw.toughness,
  }));
  assert.equal(parsed.semanticClass, 'vehicle-template');
  const etb = parsed.implementation.find(operation => operation.kind === 'generic-trigger' && operation.event === 'etb');
  assert.equal(etb.effects[1].target, 'created-tokens', 'the compiler resolves it to the newly created token');
  assert.equal(MTG.DEFS[raw.name].oracleImplementation.find(operation =>
    operation.kind === 'generic-trigger' && operation.event === 'etb').effects[1].target, 'created-tokens',
  'the shipped batch carries the same token-reference contract');

  for (const role of ['human', 'ai']) for (const doubled of [false, true]) {
    await t.test(`${role}, ${doubled ? 'doubled tokens' : 'one token'}`, async () => {
      const context = gameContext({}, role);
      const etbBodies = [];
      const originalEmit = context.game.emit.bind(context.game);
      context.game.emit = async (event, data) => {
        if (event === 'etb' && data.card?.isToken && data.card.name === 'Alien Token') {
          etbBodies.push([data.card.power, data.card.toughness]);
        }
        return originalEmit(event, data);
      };
      if (doubled) context.game.untilEffects.push({ kind: 'tokenDouble', who: context.player, expires: 'eot' });
      const theta = await castFree(context, raw.name);
      const aliens = context.game.bf().filter(card => card.ctrl === context.player && card.isToken && card.name === 'Alien Token');
      assert.equal(aliens.length, doubled ? 2 : 1, 'all created tokens survive resolution');
      assert.equal(etbBodies.length, aliens.length);
      for (const body of etbBodies) assert.deepEqual(body, [0, 0],
        'the token truly enters as 0/0; this is not an enters-with-counter replacement');
      for (const alien of aliens) {
        assert.equal(alien.counters['+1/+1'], 1);
        assert.equal(alien.power, 1);
        assert.equal(alien.toughness, 1);
      }
      assert.equal(theta.counters['+1/+1'] || 0, 0, 'the Vehicle never receives the Alien counter');
      assert.equal(context.game.stack.length, 0);
      assert.equal(context.game.pendingTriggers.length, 0);
      assert.equal((context.game.aiDecisionLog || []).some(entry => entry.fallback), false);
    });
  }
});

test('unsupported token-pronoun continuations remain fail-closed instead of modifying the source', () => {
  const parsed = semanticClass(sourceCard('Token Pronoun Guard',
    'When this creature enters, create a 1/1 white Soldier creature token. It gets +1/+1 until end of turn.'));
  assert.equal(parsed.semanticClass, undefined);
  assert.equal(parsed.reason, 'oracle-needs-explicit-semantics');
});

test('Kami of Twisted Reflection AI preserves a surviving target without banning legal human self-targets', async t => {
  for (const role of ['human', 'ai']) await t.test(`${role}: return the other creature`, async () => {
    const state = { targets: [] };
    const context = gameContext(state, role);
    const kami = permanent(context.game, context.player, 'Kami of Twisted Reflection');
    const ally = permanent(context.game, context.player, synthetic('Kami valuable ally', ['Creature'], {
      cost: '{7}', power: '8', toughness: '8', kws: ['flying'],
    }));
    state.targets = [ally];
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === kami);
    assert.ok(entry, 'the actual imported activation is offered by the rules engine');
    assert.ok(context.game.legalTargets(entry.ability.targets[0], kami, context.player).includes(kami),
      'paying a later sacrifice cost does not make self-targeting illegal during announcement');
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    assert.equal(kami.zone, 'graveyard', 'the source is sacrificed as a real cost');
    assert.equal(context.game.stack.at(-1).ctx.targets.flat()[0], ally,
      'the chosen target survives the sacrifice payment');
    await settle(context.game);
    assert.equal(ally.zone, 'hand');
    assert.equal(kami.zone, 'graveyard');
    assert.equal((context.game.aiDecisionLog || []).some(decision => decision.fallback), false);
  });
  await t.test('human may intentionally choose self and get a fizzle', async () => {
    const state = { targets: [] };
    const context = gameContext(state);
    const kami = permanent(context.game, context.player, 'Kami of Twisted Reflection');
    state.targets = [kami];
    const entry = context.game.activatableList(context.player).find(candidate => candidate.card === kami);
    assert.equal(await context.game.activateAbility(context.player, entry), true);
    await settle(context.game);
    assert.equal(kami.zone, 'graveyard', 'a deliberate target lost to its own cost is not silently retargeted');
    assert.equal(context.game.stack.length, 0);
  });
});
