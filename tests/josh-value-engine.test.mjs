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

function fixture(seed = 827) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Josh Bot', 'You', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    player.turnsStarted = 2;
    return player;
  });
  players[0].controller = new MTG.AIController(players[0], { difficulty: 'normal', style: 'josh' });
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

test('setup exposes an explicit Josh Defensive value-engine style and new games preserve it', () => {
  const style = MTG.AI_STYLES.josh;
  const skill = MTG.getAIStyleSkill('josh');
  assert.equal(style.label, 'Josh — Defensive Value');
  assert.equal(style.archetype, 'Defensive');
  assert.equal(style.skill, 'josh-value-engine');
  assert.equal(skill.id, 'josh-value-engine');
  assert.deepEqual(Array.from(skill.modes), ['SETUP', 'VALUE', 'SHIELDS_UP', 'CLOSE']);
  assert.equal(skill.politics.exactShortDeals, true);

  const deckNames = Object.keys(MTG.DECKS);
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: [deckNames[1]], aiStyles: ['josh'],
    humanController: () => ({ decide: async () => null }),
    seed: 82701, paced: false, maxTurns: 20,
  });
  const bot = game.players.find(player => player.isAI);
  assert.equal(bot.aiStyle, 'josh');
  assert.equal(bot.requestedAIStyle, 'josh');
  assert.equal(bot.controller.style, 'josh');
  const baseProfile = MTG.getDeckAIProfile(bot.deckName);
  const styledProfile = MTG.getBotEvaluationProfile(bot);
  assert.equal(styledProfile.styleSkill, 'josh-value-engine');
  assert.equal(styledProfile.weights.cardAdvantage, Math.round(baseProfile.weights.cardAdvantage * 1.35 * 100) / 100);
  assert.strictEqual(MTG.getBotEvaluationProfile(bot), styledProfile, 'styled profile should be cached by base profile and style');
  const unknownStyleProfile = MTG.getBotEvaluationProfile(Object.assign({}, bot, { aiStyle: 'unknown-style' }));
  assert.strictEqual(unknownStyleProfile, baseProfile, 'unknown styles keep the unmodified deck profile');

  const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /josh: 'Josh-inspired Defensive value engine:/);
  assert.match(main, /const badgeStyle = k === 'josh' \? 'passive' : k/);
  assert.match(main, /const requestedSmokeStyle = smoke\.get\('smokeAIStyle'\)/);
  assert.match(main, /aiStyles: \[smokeAIStyle, smokeAIStyle, smokeAIStyle\]/);
});

test('Josh mode machine moves through setup, value, shields-up and close using only visible state', () => {
  const { game, players: [bot, human] } = fixture(82702);
  game.recalc();
  assert.equal(MTG.joshValueEngineMode(game, bot), 'SETUP');

  bot.turnsStarted = 5;
  game.recalc();
  assert.equal(MTG.joshValueEngineMode(game, bot), 'VALUE');

  bot.life = 12;
  game.recalc();
  assert.equal(MTG.joshValueEngineMode(game, bot), 'SHIELDS_UP');

  bot.life = 40;
  bot.turnsStarted = 6;
  human.life = 8;
  addCard(game, bot, syntheticDef('Repeatable Draw', {
    types: ['Enchantment'], oracle: 'At the beginning of your end step, draw a card.',
  }));
  addCard(game, bot, syntheticDef('Token Engine', {
    types: ['Artifact'], oracle: 'Whenever you draw a card, create a 1/1 token.',
  }));
  addCard(game, bot, syntheticDef('Ready Finisher', { power: 10, toughness: 10 }));
  for (let i = 0; i < 4; i++) addCard(game, bot, syntheticDef(`Known hand ${i}`), 'hand');
  game.recalc();
  assert.equal(MTG.joshValueEngineMode(game, bot), 'CLOSE');
});

test('Josh develops a repeatable engine and records the active skill and mode', async () => {
  const { game, players: [bot] } = fixture(82703);
  addForest(game, bot); addForest(game, bot);
  const engine = addCard(game, bot, syntheticDef('Value Machine', {
    types: ['Enchantment'], cost: '{2}', oracle: 'At the beginning of your end step, draw a card.',
  }), 'hand');
  const vanilla = addCard(game, bot, syntheticDef('Plain Body', { cost: '{2}', power: 3, toughness: 3 }), 'hand');
  game.recalc();
  const q = {
    type: 'main', player: bot,
    casts: [{ card: engine, from: 'hand', alt: null }, { card: vanilla, from: 'hand', alt: null }],
    acts: [], lands: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82703, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'cast');
  assert.equal(decision.action.card, engine);
  assert.equal(decision.log.style, 'josh');
  assert.equal(decision.log.skill, 'josh-value-engine');
  assert.equal(decision.log.mode, 'SETUP');
  assert.ok(decision.log.scoreBreakdown.valueEngine > 0);
  assert.match(decision.reason, /Josh value-engine plan/);
});

test('Josh keeps weak removal in reserve instead of spending it on a low-value permanent', async () => {
  const { game, players: [bot, human] } = fixture(82704);
  addForest(game, bot); addForest(game, bot); addForest(game, bot);
  const removal = addCard(game, bot, MTG.DEFS['Beast Within'], 'hand');
  addCard(game, human, syntheticDef('Harmless 1/1', { cost: '{1}', power: 1, toughness: 1 }));
  game.recalc();
  const cast = game.castableList(bot).find(entry => entry.card === removal);
  assert.ok(cast);
  const q = { type: 'main', player: bot, casts: [cast], acts: [], lands: [], phase: game.phase };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82704, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'done');
  assert.equal(decision.log.mode, 'SETUP');
});

test('Josh converts unused mana into repeatable value on an opponent end step', async () => {
  const { game, players: [bot, opponent] } = fixture(82705);
  addForest(game, bot);
  const ability = { label: 'Draw a card', cost: { mana: '{1}' }, run: async () => {} };
  const engine = addCard(game, bot, syntheticDef('End-Step Engine', {
    types: ['Artifact'], oracle: 'At the beginning of your end step, draw a card.', abilities: [ability],
  }));
  game.turnPlayer = opponent;
  game.phase = 'end';
  game.step = 'end';
  game.recalc();
  const q = {
    type: 'priority', player: bot, casts: [],
    acts: [{ card: engine, ability, idx: 0 }], stack: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82705, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'activate');
  assert.equal(decision.action.entry.card, engine);
  assert.ok(decision.log.scoreBreakdown.valueEngine >= 7);
});

test('Josh skips low-value early combat but attacks when the table is actually closable', async () => {
  const early = fixture(82706);
  const [bot, target] = early.players;
  early.players[2].lost = true;
  early.players[3].lost = true;
  const attacker = addCard(early.game, bot, syntheticDef('Early 4/4', { power: 4, toughness: 4 }));
  early.game.phase = 'combat'; early.game.step = 'attackers'; early.game.recalc();
  const earlyDecision = await MTG.chooseBotAction({
    gameState: early.game, botPlayerId: bot.idx, seed: 82706,
    actionWindow: { type: 'attackers', player: bot, eligible: [attacker], opponents: [target], forced: [] },
    forceSearch: false,
  });
  assert.equal(MTG.unwrapBotDecisionAction(earlyDecision.action).length, 0);

  target.life = 3;
  bot.turnsStarted = 6;
  early.game.recalc();
  const closeDecision = await MTG.chooseBotAction({
    gameState: early.game, botPlayerId: bot.idx, seed: 82707,
    actionWindow: { type: 'attackers', player: bot, eligible: [attacker], opponents: [target], forced: [] },
    forceSearch: false,
  });
  assert.equal(closeDecision.log.mode, 'CLOSE');
  assert.equal(MTG.unwrapBotDecisionAction(closeDecision.action)[0].target, target);
});

test('Josh discards surplus mana before interaction or a live engine piece', async () => {
  const { game, players: [bot] } = fixture(82708);
  for (let i = 0; i < 7; i++) addForest(game, bot);
  const surplusLand = addForest(game, bot, 'hand');
  const answer = addCard(game, bot, MTG.DEFS['Beast Within'], 'hand');
  const engine = addCard(game, bot, syntheticDef('Hand Engine', {
    types: ['Enchantment'], oracle: 'Whenever you draw a card, create a token.',
  }), 'hand');
  game.recalc();
  const q = {
    type: 'chooseCards', player: bot, from: [surplusLand, answer, engine], min: 1, max: 1,
    prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 82708, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], surplusLand);
});

test('Josh accepts a fair exact one-turn deal and the contract remains rules-enforced', () => {
  const { game, players: [bot, human, third] } = fixture(82709);
  bot.turnsStarted = human.turnsStarted = third.turnsStarted = game.players[3].turnsStarted = 3;
  MTG.initDiplomacy(game, true);
  const humanAttacker = addCard(game, human, MTG.DEFS['Inferno Titan']);
  addCard(game, human, MTG.DEFS['Inferno Titan']);
  const botAttacker = addCard(game, bot, MTG.DEFS['Stormcatch Mentor']);
  game.recalc();
  const result = game.proposeDiplomacy(
    human, bot,
    `no_attack:${human.idx}`,
    `no_attack:${bot.idx}`,
  );
  assert.equal(result.status, 'accepted');
  assert.equal(result.proposal.math.styleCaution, -0.06);
  assert.equal(game.diplomacyAttackBlocked(bot, human), true);
  assert.deepEqual(game.diplomacyAttackTargetsFor(botAttacker, [human, third], false), [third]);
  assert.deepEqual(game.diplomacyAttackTargetsFor(humanAttacker, [bot, third], false), [third]);
});

test('Josh completes a deterministic four-player game without fallback or a stalled mode', { timeout: 60_000 }, async () => {
  const game = MTG.newGame({
    humanDeck: 'Deep Clue Sea',
    aiDecks: ['The Fantastic Four', 'Counter Intelligence', 'Elven Council'],
    aiStyles: ['josh', 'passive', 'balanced'],
    difficulty: 'normal', seed: 82711, maxTurns: 200, paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  const josh = game.players.find(player => player.deckName === 'The Fantastic Four');
  assert.equal(josh.aiStyle, 'josh');
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName === josh.name);
  assert.ok(decisions.length > 0);
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.ok(decisions.every(entry => entry.skill === 'josh-value-engine'));
  assert.ok(decisions.every(entry => ['SETUP', 'VALUE', 'SHIELDS_UP', 'CLOSE'].includes(entry.mode)));
});
