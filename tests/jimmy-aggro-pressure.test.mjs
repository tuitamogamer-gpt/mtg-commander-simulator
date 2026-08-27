import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function syntheticDef(name, {
  types = ['Creature'], subtypes = [], cost = '{2}', oracle = '', power = 2, toughness = 2,
  kws = [], abilities = [], targets = null,
} = {}) {
  return {
    name, super: [], types, subtypes, cost, oracle, power: String(power), toughness: String(toughness),
    kws, abilities, targets, mana: null,
  };
}

function fixture(seed = 828) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Jimmy Bot', 'You', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    player.turnsStarted = 2;
    return player;
  });
  players[0].controller = new MTG.AIController(players[0], { difficulty: 'normal', style: 'jimmy' });
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function addCard(game, owner, def, zone = 'battlefield') {
  const card = new MTG.CardInst(def, owner);
  card.ctrl = owner;
  card.zone = zone;
  card.sick = false;
  card.tapped = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  return card;
}

function addForest(game, owner, zone = 'battlefield') {
  return addCard(game, owner, MTG.DEFS.Forest, zone);
}

test('setup exposes an explicit Jimmy Aggressive pressure style and new games preserve it', () => {
  const style = MTG.AI_STYLES.jimmy;
  const skill = MTG.getAIStyleSkill('jimmy');
  assert.equal(style.label, 'Jimmy — Aggressive Pressure');
  assert.equal(style.archetype, 'Aggressive');
  assert.equal(style.skill, 'jimmy-aggro-pressure');
  assert.equal(skill.id, 'jimmy-aggro-pressure');
  assert.deepEqual(Array.from(skill.modes), ['BUILD', 'PRESSURE', 'RACE', 'ALPHA']);
  assert.equal(skill.politics.temporaryReprieveForPressure, true);

  const deckNames = Object.keys(MTG.DECKS);
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: [deckNames[1]], aiStyles: ['jimmy'],
    humanController: () => ({ decide: async () => null }),
    seed: 82801, paced: false, maxTurns: 20,
  });
  const bot = game.players.find(player => player.isAI);
  assert.equal(bot.aiStyle, 'jimmy');
  assert.equal(bot.requestedAIStyle, 'jimmy');
  assert.equal(bot.controller.style, 'jimmy');

  const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /jimmy: 'Jimmy-inspired Aggressive pressure:/);
  assert.match(main, /k === 'jimmy' \? 'aggressive'/);
});

test('Jimmy mode machine moves through build, pressure, race and alpha using only visible state', () => {
  const { game, players: [bot, human] } = fixture(82802);
  game.recalc();
  assert.equal(MTG.jimmyAggroMode(game, bot), 'BUILD');

  bot.turnsStarted = 4;
  game.recalc();
  assert.equal(MTG.jimmyAggroMode(game, bot), 'PRESSURE');

  bot.life = 10;
  game.recalc();
  assert.equal(MTG.jimmyAggroMode(game, bot), 'RACE');

  bot.life = 40;
  bot.turnsStarted = 5;
  human.life = 8;
  addCard(game, bot, syntheticDef('Alpha Creature', { power: 10, toughness: 10 }));
  game.recalc();
  assert.equal(MTG.jimmyAggroMode(game, bot), 'ALPHA');
});

test('Jimmy develops the commander-centric plan and records the skill and mode', async () => {
  const { game, players: [bot] } = fixture(82803);
  addForest(game, bot); addForest(game, bot); addForest(game, bot);
  const commander = addCard(game, bot, syntheticDef('Pressure Commander', {
    cost: '{3}', oracle: 'Whenever this creature attacks, create a 1/1 creature token.', power: 3, toughness: 3,
  }), 'hand');
  commander.commander = true;
  const slowValue = addCard(game, bot, syntheticDef('Slow Value', {
    types: ['Enchantment'], cost: '{3}', oracle: 'At the beginning of your end step, draw a card.',
  }), 'hand');
  game.recalc();
  const q = {
    type: 'main', player: bot,
    casts: [{ card: commander, from: 'hand', alt: null }, { card: slowValue, from: 'hand', alt: null }],
    acts: [], lands: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82803, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'cast');
  assert.equal(decision.action.card, commander);
  assert.equal(decision.log.style, 'jimmy');
  assert.equal(decision.log.skill, 'jimmy-aggro-pressure');
  assert.equal(decision.log.mode, 'BUILD');
  assert.ok(decision.log.scoreBreakdown.pressurePlan > 0);
  assert.match(decision.reason, /Jimmy pressure plan/);
});

test('Jimmy attacks a real open lane but does not throw a creature into a completely free block', async () => {
  const { game, players: [bot, target, third, fourth] } = fixture(82804);
  third.lost = true;
  fourth.lost = true;
  bot.turnsStarted = 4;
  const attacker = addCard(game, bot, syntheticDef('Pressure 4/4', {
    oracle: 'Whenever this creature attacks, draw a card.', power: 4, toughness: 4,
  }));
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [attacker], opponents: [target], forced: [] };
  const openDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82804, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(openDecision.action)[0].target, target);
  assert.ok(openDecision.log.scoreBreakdown.pressurePlan > 0);

  addCard(game, target, syntheticDef('Free Block 6/6', { power: 6, toughness: 6 }));
  game.recalc();
  const blockedDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82805, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(blockedDecision.action).length, 0);
});

test('Jimmy commits to a publicly lethal alpha attack', async () => {
  const { game, players: [bot, target, third, fourth] } = fixture(82806);
  third.lost = true;
  fourth.lost = true;
  bot.turnsStarted = 5;
  target.life = 7;
  const attacker = addCard(game, bot, syntheticDef('Lethal Commander', { power: 8, toughness: 8 }));
  attacker.commander = true;
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 82806,
    actionWindow: { type: 'attackers', player: bot, eligible: [attacker], opponents: [target], forced: [] },
    forceSearch: false,
  });
  assert.equal(decision.log.mode, 'ALPHA');
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0].target, target);
  assert.ok(decision.log.scoreBreakdown.pressurePlan >= 30);
});

test('Jimmy uses a counterspell to protect the commander plan, not as generic table control', async () => {
  const { game, players: [bot, opponent] } = fixture(82807);
  addForest(game, bot); addForest(game, bot);
  const commander = addCard(game, bot, syntheticDef('Protected Commander', { power: 4, toughness: 4 }));
  commander.commander = true;
  const counter = addCard(game, bot, syntheticDef('Plan Shield', {
    types: ['Instant'], cost: '{1}{U}', oracle: 'Counter target spell.',
  }), 'hand');
  const hostile = new MTG.CardInst(syntheticDef('Hostile Removal', {
    types: ['Instant'], cost: '{2}', oracle: 'Destroy target creature.',
  }), opponent);
  hostile.ctrl = opponent;
  hostile.zone = 'stack';
  game.stack.push({ kind: 'spell', card: hostile, ctrl: opponent, targets: [commander] });
  game.phase = 'main1'; game.recalc();
  const q = { type: 'priority', player: bot, casts: [{ card: counter, from: 'hand', alt: null }], acts: [], stack: game.stack, phase: game.phase };
  const protect = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82807, actionWindow: q, forceSearch: false });
  assert.equal(protect.action.kind, 'cast');
  assert.equal(protect.action.card, counter);
  assert.equal(protect.log.scoreBreakdown.pressurePlan, 8);

  game.stack[0].targets = [opponent];
  const view = MTG.createBotPlayerView(game, bot.idx, q);
  const generic = MTG.quickScoreBotAction(view, { kind: 'cast', card: counter, from: 'hand', alt: null }, MTG.getBotEvaluationProfile(bot), q);
  assert.equal(generic.breakdown.pressurePlan, -6);
});

test('Jimmy discards hard control before an active finisher or protection spell', async () => {
  const { game, players: [bot] } = fixture(82808);
  for (let i = 0; i < 5; i++) addForest(game, bot);
  const wipe = addCard(game, bot, syntheticDef('Reset Button', {
    types: ['Sorcery'], cost: '{4}', oracle: 'Destroy all creatures.',
  }), 'hand');
  const finisher = addCard(game, bot, syntheticDef('Pressure Finisher', {
    cost: '{5}', oracle: 'Whenever this creature attacks, it gains double strike.', power: 7, toughness: 7,
  }), 'hand');
  const protection = addCard(game, bot, syntheticDef('Protect the Win', {
    types: ['Instant'], cost: '{1}', oracle: 'Target creature gains indestructible until end of turn.',
  }), 'hand');
  game.recalc();
  const q = {
    type: 'chooseCards', player: bot, from: [wipe, finisher, protection], min: 1, max: 1,
    prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82808, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], wipe);
});

test('Jimmy pressure politics remains short, reciprocal and rules-enforced', async () => {
  const { game, players: [bot, human, runaway, fourth] } = fixture(82809);
  bot.turnsStarted = human.turnsStarted = runaway.turnsStarted = fourth.turnsStarted = 4;
  const attacker = addCard(game, bot, syntheticDef('Pressure Attacker', { power: 5, toughness: 5 }));
  for (let i = 0; i < 3; i++) {
    const threat = addCard(game, runaway, syntheticDef(`Runaway Engine ${i}`, {
      oracle: 'At the beginning of your upkeep, draw a card.', power: 14, toughness: 14,
    }));
    threat.tapped = true;
  }
  addCard(game, human, syntheticDef('Human Attacker', { power: 4, toughness: 4 }));
  game.recalc();
  MTG.initDiplomacy(game, true);
  assert.equal(game.diplomacyRunawayThreat().p.name, runaway.name);
  const result = game.proposeDiplomacy(
    human, bot,
    `pressure_player:${runaway.idx}`,
    `no_attack:${bot.idx}`,
  );
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.math.styleCaution, 0.28);
  assert.equal(game.diplomacyRequiredAttackTarget(bot).name, runaway.name);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true);
  game.turnPlayer = bot;
  game.phase = 'combat';
  game.step = 'attackers';
  game.recalc();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 82809,
    actionWindow: { type: 'attackers', player: bot, eligible: [attacker], opponents: [human, runaway, fourth], forced: [] },
    forceSearch: false,
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0].target.name, runaway.name);
});

test('Jimmy completes a deterministic four-player game without fallback or a stalled mode', { timeout: 60_000 }, async () => {
  const game = MTG.newGame({
    humanDeck: 'Deep Clue Sea',
    aiDecks: ['Mardu Surge', 'Counter Intelligence', 'Elven Council'],
    aiStyles: ['jimmy', 'passive', 'balanced'],
    difficulty: 'normal', seed: 82811, maxTurns: 200, paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  const jimmy = game.players.find(player => player.deckName === 'Mardu Surge');
  assert.equal(jimmy.aiStyle, 'jimmy');
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName === jimmy.name);
  assert.ok(decisions.length > 0);
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.ok(decisions.every(entry => entry.skill === 'jimmy-aggro-pressure'));
  assert.ok(decisions.every(entry => ['BUILD', 'PRESSURE', 'RACE', 'ALPHA'].includes(entry.mode)));
});
