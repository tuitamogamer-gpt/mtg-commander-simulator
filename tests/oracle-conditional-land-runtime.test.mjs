import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

const LAND_FIXTURES = [
  ['QA Pain Gate', "As QA Pain Gate enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {C}."],
  ['QA More Gate', 'QA More Gate enters tapped unless you control two or more other lands.\n{T}: Add {G}.'],
  ['QA Fewer Gate', 'QA Fewer Gate enters tapped unless you control two or fewer other lands.\n{T}: Add {G}.'],
  ['QA Life Gate', 'QA Life Gate enters tapped unless you have 13 or less life.\n{T}: Add {G}.'],
  ['QA Any Life Gate', 'QA Any Life Gate enters tapped unless a player has 13 or less life.\n{T}: Add {G}.'],
  ['QA Crowd Gate', 'QA Crowd Gate enters tapped unless you have two or more opponents.\n{T}: Add {G}.'],
];

let fixturesReady = false;

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function sourceCard(name, oracle) {
  return {
    id: `scryfall-${slug(name)}`,
    oracle_id: `oracle-${slug(name)}`,
    name,
    layout: 'normal',
    mana_cost: '',
    type_line: 'Land',
    oracle_text: oracle,
    color_identity: [],
    colors: [],
    keywords: [],
    games: ['paper'],
    legalities: { commander: 'legal' },
    set: 'tst',
    set_name: 'Conditional Land Runtime Tests',
    collector_number: slug(name),
    rarity: 'common',
    released_at: '2026-01-01',
    scryfall_uri: 'https://example.invalid/conditional-land-runtime',
  };
}

function rawCard(source) {
  return {
    name: source.name,
    cost: null,
    super: [],
    types: ['Land'],
    subtypes: [],
    oracle: source.oracle_text,
    _ci: [],
    _oracleId: source.oracle_id,
    _scryfallId: source.id,
    _layout: source.layout,
    _set: source.set,
    _collectorNumber: source.collector_number,
    _rarity: source.rarity,
  };
}

function ensureFixtures() {
  if (fixturesReady) return;
  const cards = LAND_FIXTURES.map(([name, oracle], index) => {
    const source = sourceCard(name, oracle);
    const semantics = semanticClass(source);
    assert.equal(semantics.reason, undefined, `${name}: exact importer rejected the runtime fixture`);
    assert.ok(semantics.implementation.some(operation => operation.kind === 'conditional-enters-tapped'));
    return Object.assign({
      position: index + 1,
      oracleId: source.oracle_id,
      scryfallId: source.id,
      raw: rawCard(source),
      catalog: { typeLine: source.type_line, commanderLegality: 'legal' },
    }, semantics);
  });
  MTG.registerOracleBatch({ id: 'oracle-conditional-land-runtime-fixtures', sequence: 9997, cards });
  MTG.initData(MTG.RAW_DATA);
  fixturesReady = true;
}

function fallbackDecision(query, state) {
  state.trace.push(query);
  if (query.type === 'chooseOption') {
    const wanted = state.optionKeys.shift();
    if (query.options.some(option => option.key === wanted)) return wanted;
    return query.options[0]?.key;
  }
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseTargets' || query.type === 'chooseCards' ||
      query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return 'ok';
}

function makeGame(role, { opponents = 2, optionKeys = [] } = {}) {
  ensureFixtures();
  const game = new MTG.Game({ seed: role === 'ai' ? 7502 : 7501, paced: false, maxTurns: 4 });
  const state = { trace: [], optionKeys: optionKeys.slice() };
  const player = game.addPlayer(
    role === 'ai' ? 'Conditional land bot' : 'Conditional land human',
    { name: `${role} conditional land deck`, cards: [] },
    null,
    role === 'ai',
  );
  const otherPlayers = Array.from({ length: opponents }, (_, index) => game.addPlayer(
    `Opponent ${index + 1}`,
    { name: `Opponent ${index + 1} deck`, cards: [] },
    { decide: async (currentGame, query) => fallbackDecision(query, { trace: [], optionKeys: [] }) },
    false,
  ));
  let controller;
  if (role === 'ai') {
    controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
    const decide = controller.decide.bind(controller);
    controller.decide = async (currentGame, query) => {
      state.trace.push(query);
      return decide(currentGame, query);
    };
  } else {
    controller = { decide: async (currentGame, query) => fallbackDecision(query, state) };
  }
  player.controller = controller;
  game.turnPlayer = player;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player, otherPlayers, controller, state };
}

function zoneCard(game, owner, name, zone = 'hand') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = zone;
  card.ctrl = owner;
  owner[zone].push(card);
  return card;
}

function battlefieldCard(game, owner, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.zone = 'battlefield';
  card.ctrl = owner;
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

async function playConditionalLand(context, name) {
  const card = zoneCard(context.game, context.player, name);
  context.game.recalc();
  assert.equal(await context.game.playLand(context.player, card), true, `${name}: actual playLand succeeds`);
  assert.equal(card.zone, 'battlefield', `${name}: actual battlefield entry completed`);
  return card;
}

test('human pay-life choice uses the real v4 replacement path for both decisions', async () => {
  const pay = makeGame('human', { optionKeys: ['pay'] });
  const paidLand = await playConditionalLand(pay, 'QA Pain Gate');
  assert.equal(pay.player.life, 38);
  assert.equal(paidLand.tapped, false);
  const payQuery = pay.state.trace.find(query => query.aiHint?.kind === 'payLifeForUntappedLand');
  assert.ok(payQuery, 'human received the exact replacement-effect choice');
  assert.deepEqual(Array.from(payQuery.options, option => option.key), ['pay', 'tapped']);

  const decline = makeGame('human', { optionKeys: ['tapped'] });
  const tappedLand = await playConditionalLand(decline, 'QA Pain Gate');
  assert.equal(decline.player.life, 40);
  assert.equal(tappedLand.tapped, true);
});

test('local AI deterministically pays 2 only when safe untapped mana unlocks a legal action', async () => {
  const useful = makeGame('ai');
  zoneCard(useful.game, useful.player, 'Sol Ring');
  const usefulLand = await playConditionalLand(useful, 'QA Pain Gate');
  assert.equal(useful.player.life, 38);
  assert.equal(usefulLand.tapped, false);
  assert.equal(useful.controller.lastV2Decision.action.kind, 'chooseOption');
  assert.equal(useful.controller.lastV2Decision.action.value, 'pay');
  assert.equal(useful.controller.lastV2Decision.log.fallback, false);

  const dangerous = makeGame('ai');
  dangerous.player.life = 8;
  zoneCard(dangerous.game, dangerous.player, 'Sol Ring');
  const dangerousLand = await playConditionalLand(dangerous, 'QA Pain Gate');
  assert.equal(dangerous.player.life, 8);
  assert.equal(dangerousLand.tapped, true);
  assert.equal(dangerous.controller.lastV2Decision.action.value, 'tapped');
  assert.equal(dangerous.controller.lastV2Decision.log.fallback, false);

  const noUse = makeGame('ai');
  const noUseLand = await playConditionalLand(noUse, 'QA Pain Gate');
  assert.equal(noUse.player.life, 40);
  assert.equal(noUseLand.tapped, true);
  assert.equal(noUse.controller.lastV2Decision.action.value, 'tapped');
});

for (const role of ['human', 'ai']) {
  test(`${role}: other-land-count comparisons execute during actual battlefield entry`, async () => {
    const morePasses = makeGame(role);
    battlefieldCard(morePasses.game, morePasses.player, 'Forest');
    battlefieldCard(morePasses.game, morePasses.player, 'Plains');
    assert.equal((await playConditionalLand(morePasses, 'QA More Gate')).tapped, false);

    const moreFails = makeGame(role);
    battlefieldCard(moreFails.game, moreFails.player, 'Forest');
    assert.equal((await playConditionalLand(moreFails, 'QA More Gate')).tapped, true);

    const fewerPasses = makeGame(role);
    battlefieldCard(fewerPasses.game, fewerPasses.player, 'Forest');
    battlefieldCard(fewerPasses.game, fewerPasses.player, 'Plains');
    assert.equal((await playConditionalLand(fewerPasses, 'QA Fewer Gate')).tapped, false);

    const fewerFails = makeGame(role);
    battlefieldCard(fewerFails.game, fewerFails.player, 'Forest');
    battlefieldCard(fewerFails.game, fewerFails.player, 'Plains');
    battlefieldCard(fewerFails.game, fewerFails.player, 'Island');
    assert.equal((await playConditionalLand(fewerFails, 'QA Fewer Gate')).tapped, true);
  });

  test(`${role}: life and living-opponent conditions execute during actual battlefield entry`, async () => {
    const ownLow = makeGame(role);
    ownLow.player.life = 13;
    assert.equal((await playConditionalLand(ownLow, 'QA Life Gate')).tapped, false);

    const ownHigh = makeGame(role);
    ownHigh.player.life = 14;
    assert.equal((await playConditionalLand(ownHigh, 'QA Life Gate')).tapped, true);

    const anyLow = makeGame(role);
    anyLow.otherPlayers[0].life = 13;
    assert.equal((await playConditionalLand(anyLow, 'QA Any Life Gate')).tapped, false);

    const anyHigh = makeGame(role);
    anyHigh.otherPlayers.forEach(opponent => { opponent.life = 14; });
    assert.equal((await playConditionalLand(anyHigh, 'QA Any Life Gate')).tapped, true);

    const crowdPasses = makeGame(role, { opponents: 2 });
    assert.equal((await playConditionalLand(crowdPasses, 'QA Crowd Gate')).tapped, false);

    const crowdFails = makeGame(role, { opponents: 2 });
    crowdFails.otherPlayers[1].lost = true;
    assert.equal((await playConditionalLand(crowdFails, 'QA Crowd Gate')).tapped, true);
  });
}
