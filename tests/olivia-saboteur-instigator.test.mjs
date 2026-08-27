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

function fixture(seed = 860) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Olivia Bot', 'You', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    player.turnsStarted = 2;
    return player;
  });
  players[0].controller = new MTG.AIController(players[0], { difficulty: 'normal', style: 'olivia' });
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

test('setup exposes Olivia as a separate Saboteur signature style and preserves the ordinary archetype', () => {
  const style = MTG.AI_STYLES.olivia;
  const skill = MTG.getAIStyleSkill('olivia');
  assert.equal(MTG.AI_STYLES.teaser.label, 'Saboteur');
  assert.equal(style.label, 'Olivia — Saboteur Instigator');
  assert.equal(style.archetype, 'Saboteur');
  assert.equal(style.skill, 'olivia-saboteur-instigator');
  assert.equal(skill.id, 'olivia-saboteur-instigator');
  assert.deepEqual(Array.from(skill.modes), ['INFILTRATE', 'MISDIRECT', 'DISRUPT', 'AMBUSH']);
  assert.equal(skill.politics.breaksOpposingAlliances, true);

  const deckNames = Object.keys(MTG.DECKS);
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: [deckNames[1]], aiStyles: ['olivia'],
    humanController: () => ({ decide: async () => null }),
    seed: 86001, paced: false, maxTurns: 20,
  });
  const bot = game.players.find(player => player.isAI);
  assert.equal(bot.aiStyle, 'olivia');
  assert.equal(bot.requestedAIStyle, 'olivia');
  assert.equal(bot.controller.style, 'olivia');

  const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /olivia: 'Olivia-inspired Saboteur instigator:/);
  assert.match(main, /k === 'olivia' \? 'teaser'/);
});

test('Olivia mode machine infiltrates, misdirects, disrupts a runaway board, and springs a visible ambush', () => {
  const { game, players: [bot, human] } = fixture(86002);
  game.recalc();
  assert.equal(MTG.oliviaSaboteurMode(game, bot), 'INFILTRATE');

  bot.turnsStarted = 4;
  game.recalc();
  assert.equal(MTG.oliviaSaboteurMode(game, bot), 'MISDIRECT');

  for (let i = 0; i < 3; i++) addCard(game, human, syntheticDef(`Runaway Engine ${i}`, {
    cost: '{7}', oracle: 'At the beginning of your upkeep, draw two cards.', power: 10, toughness: 10,
  }));
  game.recalc();
  assert.equal(MTG.oliviaSaboteurMode(game, bot), 'DISRUPT');

  human.life = 5;
  addCard(game, bot, syntheticDef('Hidden Ambusher', { power: 6, toughness: 6, kws: ['flying'] }));
  game.recalc();
  assert.equal(MTG.oliviaSaboteurMode(game, bot), 'AMBUSH');
});

test('Olivia develops a goad and card-advantage engine over a comparable vanilla body', async () => {
  const { game, players: [bot] } = fixture(86003);
  addForest(game, bot); addForest(game, bot); addForest(game, bot);
  const instigator = addCard(game, bot, syntheticDef('Whispered Provocation', {
    types: ['Enchantment'], cost: '{3}', oracle: 'At the beginning of your end step, draw a card. Goad target creature an opponent controls.',
  }), 'hand');
  const vanilla = addCard(game, bot, syntheticDef('Plain Bruiser', { cost: '{3}', power: 4, toughness: 4 }), 'hand');
  game.recalc();
  const q = {
    type: 'main', player: bot,
    casts: [{ card: instigator, from: 'hand', alt: null }, { card: vanilla, from: 'hand', alt: null }],
    acts: [], lands: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 86003, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'cast');
  assert.equal(decision.action.card, instigator);
  assert.equal(decision.log.style, 'olivia');
  assert.equal(decision.log.skill, 'olivia-saboteur-instigator');
  assert.equal(decision.log.mode, 'INFILTRATE');
  assert.ok(decision.log.scoreBreakdown.instigation > 0);
  assert.match(decision.reason, /Olivia saboteur-instigator plan/);
});

test('Olivia goads the public leader\'s premium attacker instead of a harmless creature', async () => {
  const { game, players: [bot, human, leader] } = fixture(86004);
  bot.turnsStarted = 4;
  const source = addCard(game, bot, syntheticDef('Incite the Strong', {
    types: ['Sorcery'], oracle: 'Goad target creature an opponent controls.',
  }), 'hand');
  const harmless = addCard(game, human, syntheticDef('Harmless Witness', { power: 1, toughness: 1 }));
  const premium = addCard(game, leader, syntheticDef('Runaway War Engine', {
    cost: '{7}', oracle: 'Whenever this creature attacks, draw two cards.', power: 11, toughness: 11,
  }));
  addCard(game, leader, syntheticDef('Leader Value Engine', {
    oracle: 'At the beginning of your upkeep, draw two cards.', power: 7, toughness: 7,
  }));
  game.recalc();
  const q = { type: 'chooseTargets', player: bot, src: source, candidates: [harmless, premium], min: 1, max: 1, aiHint: { goal: 'goad' } };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 86004, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], premium);
  assert.ok(decision.log.scoreBreakdown.instigation > 0);
});

test('Olivia takes a safe resource probe instead of feeding an attacker into the leader\'s blocker', async () => {
  const { game, players: [bot, open, leader, fourth] } = fixture(86005);
  bot.turnsStarted = 4;
  fourth.lost = true;
  addCard(game, leader, syntheticDef('Untapped Wall', { cost: '{6}', power: 8, toughness: 8 }));
  addCard(game, leader, syntheticDef('Leader Engine', {
    oracle: 'At the beginning of your upkeep, draw two cards.', power: 8, toughness: 8,
  }));
  const probe = addCard(game, bot, syntheticDef('Covert Informant', {
    oracle: 'Whenever Covert Informant deals combat damage to a player, draw a card.', power: 2, toughness: 2,
  }));
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 86005,
    actionWindow: { type: 'attackers', player: bot, eligible: [probe], opponents: [open, leader], forced: [] },
    forceSearch: false,
  });
  const attack = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(attack.length, 1);
  assert.equal(attack[0].target, open);
  assert.ok(decision.log.scoreBreakdown.instigation >= 5);
});

test('Olivia explicitly prefers the goad branch of a sabotage choice', async () => {
  const { game, players: [bot] } = fixture(86006);
  bot.turnsStarted = 4;
  game.recalc();
  const q = {
    type: 'chooseOption', player: bot, prompt: 'Choose the sabotage mode',
    options: [{ key: 'goad', label: 'Goad the threat' }, { key: 'fortify', label: 'Make a small blocker' }],
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 86006, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 'goad');
  assert.ok(decision.log.scoreBreakdown.instigation >= 5);
});

test('Olivia discards an expensive vanilla body before sabotage and interaction pieces', async () => {
  const { game, players: [bot] } = fixture(86007);
  for (let i = 0; i < 6; i++) addForest(game, bot);
  const vanilla = addCard(game, bot, syntheticDef('Obvious Giant', { cost: '{6}', power: 6, toughness: 6 }), 'hand');
  const goad = addCard(game, bot, syntheticDef('Disrupt the Table', {
    types: ['Sorcery'], oracle: 'Goad all creatures your opponents control.',
  }), 'hand');
  const removal = addCard(game, bot, syntheticDef('Precise Sabotage', {
    types: ['Instant'], oracle: 'Destroy target creature.',
  }), 'hand');
  game.recalc();
  const q = {
    type: 'chooseCards', player: bot, from: [vanilla, goad, removal], min: 1, max: 1,
    prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 86007, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], vanilla);
});

test('Olivia accepts a fair anti-runaway pact and the resulting pressure remains rules-enforced', () => {
  const { game, players: [bot, human, runaway, fourth] } = fixture(86008);
  bot.turnsStarted = human.turnsStarted = runaway.turnsStarted = fourth.turnsStarted = 4;
  const saboteur = addCard(game, bot, syntheticDef('Saboteur', { power: 4, toughness: 4 }));
  addCard(game, human, syntheticDef('Human Attacker', { power: 4, toughness: 4 }));
  for (let i = 0; i < 3; i++) {
    const threat = addCard(game, runaway, syntheticDef(`Runaway Engine ${i}`, {
      oracle: 'At the beginning of your upkeep, draw a card.', power: 13, toughness: 13,
    }));
    threat.tapped = true;
  }
  game.recalc();
  MTG.initDiplomacy(game, true);
  assert.equal(game.diplomacyRunawayThreat().p, runaway);
  const result = game.proposeDiplomacy(human, bot, `pressure_player:${runaway.idx}`, `no_attack:${bot.idx}`);
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.math.styleCaution, -0.02);
  assert.equal(game.diplomacyRequiredAttackTarget(bot), runaway);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true);
  assert.ok(game.diplomacyAttackTargetsFor(saboteur, [human, runaway], false).includes(runaway));
});

test('Olivia completes a deterministic four-player game without fallback or a stalled mode', { timeout: 60_000 }, async () => {
  const game = MTG.newGame({
    humanDeck: 'Deep Clue Sea',
    aiDecks: ['Most Wanted', 'Doom Prevails', 'Elven Council'],
    aiStyles: ['olivia', 'olivia', 'olivia'],
    difficulty: 'normal', seed: 86009, maxTurns: 200, paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  const oliviaPlayers = game.players.filter(player => player.aiStyle === 'olivia');
  assert.equal(oliviaPlayers.length, 3);
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.style === 'olivia');
  assert.ok(decisions.length > 0);
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.ok(decisions.every(entry => entry.skill === 'olivia-saboteur-instigator'));
  assert.ok(decisions.every(entry => ['INFILTRATE', 'MISDIRECT', 'DISRUPT', 'AMBUSH'].includes(entry.mode)));
});
