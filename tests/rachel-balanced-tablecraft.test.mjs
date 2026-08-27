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

function fixture(seed = 829) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Rachel Bot', 'You', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    player.turnsStarted = 2;
    return player;
  });
  players[0].controller = new MTG.AIController(players[0], { difficulty: 'normal', style: 'rachel' });
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

test('setup exposes Rachel as an explicit Balanced style and new games preserve it', () => {
  const style = MTG.AI_STYLES.rachel;
  const skill = MTG.getAIStyleSkill('rachel');
  assert.equal(style.label, 'Rachel — Balanced Tablecraft');
  assert.equal(style.archetype, 'Balanced');
  assert.equal(style.skill, 'rachel-balanced-tablecraft');
  assert.equal(skill.id, 'rachel-balanced-tablecraft');
  assert.deepEqual(Array.from(skill.modes), ['DEVELOP', 'TABLE_READ', 'COMEBACK', 'FINISH']);
  assert.equal(skill.politics.defensiveInteraction, true);

  const deckNames = Object.keys(MTG.DECKS);
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: [deckNames[1]], aiStyles: ['rachel'],
    humanController: () => ({ decide: async () => null }),
    seed: 82901, paced: false, maxTurns: 20,
  });
  const bot = game.players.find(player => player.isAI);
  assert.equal(bot.aiStyle, 'rachel');
  assert.equal(bot.requestedAIStyle, 'rachel');
  assert.equal(bot.controller.style, 'rachel');

  const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /rachel: 'Rachel-inspired Balanced tablecraft:/);
  assert.match(main, /k === 'rachel' \? 'balanced'/);
});

test('Rachel mode machine develops, comes back, reads the table, and finishes only the closable table', () => {
  const { game, players: [bot, human, third, fourth] } = fixture(82902);
  game.recalc();
  assert.equal(MTG.rachelBalancedMode(game, bot), 'DEVELOP');

  bot.life = 12;
  game.recalc();
  assert.equal(MTG.rachelBalancedMode(game, bot), 'COMEBACK');

  bot.life = 40;
  bot.turnsStarted = 4;
  addCard(game, bot, syntheticDef('Flexible Value Creature', {
    oracle: 'Whenever this creature attacks, draw a card.', power: 5, toughness: 5,
  }));
  human.life = 4;
  game.recalc();
  assert.equal(MTG.rachelBalancedMode(game, bot), 'TABLE_READ', 'one weak player is not the whole-pod finish');

  third.lost = true;
  fourth.lost = true;
  game.recalc();
  assert.equal(MTG.rachelBalancedMode(game, bot), 'FINISH');
});

test('Rachel develops a flexible value piece and records her skill, mode, and reason', async () => {
  const { game, players: [bot] } = fixture(82903);
  addForest(game, bot); addForest(game, bot);
  const flexible = addCard(game, bot, syntheticDef('Flexible Explorer', {
    cost: '{2}', oracle: 'Whenever this creature attacks, draw a card and create a Treasure token.', power: 2, toughness: 3,
  }), 'hand');
  const vanilla = addCard(game, bot, syntheticDef('Plain Body', { cost: '{2}', power: 4, toughness: 4 }), 'hand');
  game.recalc();
  const q = {
    type: 'main', player: bot,
    casts: [{ card: flexible, from: 'hand', alt: null }, { card: vanilla, from: 'hand', alt: null }],
    acts: [], lands: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82903, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'cast');
  assert.equal(decision.action.card, flexible);
  assert.equal(decision.log.style, 'rachel');
  assert.equal(decision.log.skill, 'rachel-balanced-tablecraft');
  assert.equal(decision.log.mode, 'DEVELOP');
  assert.ok(decision.log.scoreBreakdown.tableBalance > 0);
  assert.match(decision.reason, /Rachel table-balance plan/);
});

test('Rachel uses a counterspell defensively instead of as generic development denial', async () => {
  const { game, players: [bot, opponent] } = fixture(82904);
  addForest(game, bot); addForest(game, bot);
  const engine = addCard(game, bot, syntheticDef('Protected Value Engine', {
    types: ['Enchantment'], oracle: 'At the beginning of your end step, draw a card.',
  }));
  const counter = addCard(game, bot, syntheticDef('Defensive Counter', {
    types: ['Instant'], cost: '{1}{U}', oracle: 'Counter target spell.',
  }), 'hand');
  const hostile = new MTG.CardInst(syntheticDef('Hostile Removal', {
    types: ['Instant'], cost: '{2}', oracle: 'Destroy target permanent.',
  }), opponent);
  hostile.ctrl = opponent;
  hostile.zone = 'stack';
  game.stack.push({ kind: 'spell', card: hostile, ctrl: opponent, targets: [engine] });
  game.recalc();
  const q = { type: 'priority', player: bot, casts: [{ card: counter, from: 'hand', alt: null }], acts: [], stack: game.stack, phase: game.phase };
  const protect = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82904, actionWindow: q, forceSearch: false });
  assert.equal(protect.action.kind, 'cast');
  assert.equal(protect.action.card, counter);
  assert.equal(protect.log.scoreBreakdown.tableBalance, 7);

  game.stack[0].targets = [opponent];
  const view = MTG.createBotPlayerView(game, bot.idx, q);
  const generic = MTG.quickScoreBotAction(view, { kind: 'cast', card: counter, from: 'hand', alt: null }, MTG.getBotEvaluationProfile(bot), q);
  assert.equal(generic.breakdown.tableBalance, -4.5);
});

test('Rachel takes calculated value combat into the public leader while keeping a blocker', async () => {
  const { game, players: [bot, weak, leader, fourth] } = fixture(82905);
  bot.turnsStarted = 4;
  weak.life = 6;
  for (let i = 0; i < 3; i++) addCard(game, leader, syntheticDef(`Leader Engine ${i}`, {
    oracle: 'At the beginning of your upkeep, draw a card.', power: 7, toughness: 7,
  }));
  const valueAttacker = addCard(game, bot, syntheticDef('Resource Attacker', {
    oracle: 'Whenever this creature attacks, create a Treasure token and draw a card.', power: 3, toughness: 3,
    kws: ['flying'],
  }));
  const blocker = addCard(game, bot, syntheticDef('Home Guard', { power: 2, toughness: 5 }));
  addCard(game, bot, syntheticDef('Home Value', {
    types: ['Enchantment'], oracle: 'At the beginning of your end step, draw a card.',
  }));
  fourth.lost = true;
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 82905,
    actionWindow: { type: 'attackers', player: bot, eligible: [valueAttacker, blocker], opponents: [weak, leader], forced: [] },
    forceSearch: false,
  });
  const assignments = MTG.unwrapBotDecisionAction(decision.action);
  assert.ok(assignments.some(item => item.card === valueAttacker && item.target === leader));
  assert.equal(assignments.some(item => item.card === blocker), false);
  assert.equal(decision.log.mode, 'TABLE_READ');
  assert.ok(decision.log.scoreBreakdown.tableBalance > 0);
});

test('Rachel discards a narrow counter before a flexible engine piece', async () => {
  const { game, players: [bot] } = fixture(82906);
  for (let i = 0; i < 6; i++) addForest(game, bot);
  const narrow = addCard(game, bot, syntheticDef('Narrow Denial', {
    types: ['Instant'], cost: '{2}', oracle: 'Counter target spell.',
  }), 'hand');
  const flexible = addCard(game, bot, syntheticDef('Flexible Hand Engine', {
    oracle: 'Whenever this creature attacks, draw a card and create a Treasure token.', power: 3, toughness: 3,
  }), 'hand');
  const protection = addCard(game, bot, syntheticDef('Save the Plan', {
    types: ['Instant'], cost: '{1}', oracle: 'Target creature gains indestructible until end of turn.',
  }), 'hand');
  game.recalc();
  const q = {
    type: 'chooseCards', player: bot, from: [narrow, flexible, protection], min: 1, max: 1,
    prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82906, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], narrow);
});

test('Rachel accepts a fair short shared-threat deal and its terms remain rules-enforced', () => {
  const { game, players: [bot, human, runaway, fourth] } = fixture(82907);
  bot.turnsStarted = human.turnsStarted = runaway.turnsStarted = fourth.turnsStarted = 4;
  const botAttacker = addCard(game, bot, syntheticDef('Balanced Attacker', { power: 4, toughness: 4 }));
  const humanAttacker = addCard(game, human, syntheticDef('Human Attacker', { power: 4, toughness: 4 }));
  for (let i = 0; i < 3; i++) {
    const threat = addCard(game, runaway, syntheticDef(`Runaway Value ${i}`, {
      oracle: 'At the beginning of your upkeep, draw a card.', power: 13, toughness: 13,
    }));
    threat.tapped = true;
  }
  game.recalc();
  MTG.initDiplomacy(game, true);
  assert.equal(game.diplomacyRunawayThreat().p, runaway);
  const result = game.proposeDiplomacy(
    human, bot,
    `pressure_player:${runaway.idx}`,
    `no_attack:${bot.idx}`,
  );
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.math.styleCaution, 0);
  assert.equal(game.diplomacyRequiredAttackTarget(bot), runaway);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true);
  assert.ok(game.diplomacyAttackTargetsFor(botAttacker, [human, runaway], false).includes(runaway));
  assert.deepEqual(game.diplomacyAttackTargetsFor(humanAttacker, [bot, runaway], false), [runaway]);
});

test('Rachel completes a deterministic four-player game without fallback or a stalled mode', { timeout: 60_000 }, async () => {
  const game = MTG.newGame({
    humanDeck: 'Deep Clue Sea',
    aiDecks: ['Most Wanted', 'Counter Intelligence', 'Elven Council'],
    aiStyles: ['rachel', 'rachel', 'rachel'],
    difficulty: 'normal', seed: 82911, maxTurns: 200, paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  const rachelPlayers = game.players.filter(player => player.aiStyle === 'rachel');
  assert.equal(rachelPlayers.length, 3);
  assert.ok(rachelPlayers.every(player => player.aiStyle === 'rachel'));
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.style === 'rachel');
  assert.ok(decisions.length > 0);
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.ok(decisions.every(entry => entry.skill === 'rachel-balanced-tablecraft'));
  assert.ok(decisions.every(entry => ['DEVELOP', 'TABLE_READ', 'COMEBACK', 'FINISH'].includes(entry.mode)));
});
