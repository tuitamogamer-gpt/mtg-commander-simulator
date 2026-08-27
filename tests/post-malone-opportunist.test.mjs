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

function fixture(seed = 830) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Post Bot', 'You', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    player.turnsStarted = 2;
    return player;
  });
  players[0].controller = new MTG.AIController(players[0], { difficulty: 'normal', style: 'post' });
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

test('setup exposes Post as an explicit Opportunist signature style and preserves it', () => {
  const style = MTG.AI_STYLES.post;
  const skill = MTG.getAIStyleSkill('post');
  assert.equal(style.label, 'Post Malone — Opportunist Showstopper');
  assert.equal(style.archetype, 'Opportunist');
  assert.equal(style.skill, 'post-opportunist-showstopper');
  assert.equal(skill.id, 'post-opportunist-showstopper');
  assert.deepEqual(Array.from(skill.modes), ['LAY_LOW', 'HEIST', 'GAMBLE', 'SHOWTIME']);
  assert.equal(skill.politics.borrowedPower, true);

  const deckNames = Object.keys(MTG.DECKS);
  const game = MTG.newGame({
    humanDeck: deckNames[0], aiDecks: [deckNames[1]], aiStyles: ['post'],
    humanController: () => ({ decide: async () => null }),
    seed: 83001, paced: false, maxTurns: 20,
  });
  const bot = game.players.find(player => player.isAI);
  assert.equal(bot.aiStyle, 'post');
  assert.equal(bot.requestedAIStyle, 'post');
  assert.equal(bot.controller.style, 'post');

  const main = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  assert.match(main, /post: 'Post Malone-inspired Opportunist showstopper:/);
  assert.match(main, /k === 'post' \? 'opportunist'/);
});

test('Post mode machine lays low, gambles, hunts a visible lethal, and otherwise enters heist mode', () => {
  const { game, players: [bot, human] } = fixture(83002);
  game.recalc();
  assert.equal(MTG.postOpportunistMode(game, bot), 'LAY_LOW');

  bot.life = 12;
  game.recalc();
  assert.equal(MTG.postOpportunistMode(game, bot), 'GAMBLE');

  bot.life = 40;
  bot.turnsStarted = 5;
  game.recalc();
  assert.equal(MTG.postOpportunistMode(game, bot), 'HEIST');

  human.life = 5;
  addCard(game, bot, syntheticDef('Showtime Creature', { power: 6, toughness: 6, kws: ['flying'] }));
  game.recalc();
  assert.equal(MTG.postOpportunistMode(game, bot), 'SHOWTIME');
});

test('Post develops card advantage with opposing-card access and logs his skill plan', async () => {
  const { game, players: [bot] } = fixture(83003);
  addForest(game, bot); addForest(game, bot);
  const heistEngine = addCard(game, bot, syntheticDef('Backstage Heist', {
    types: ['Enchantment'], cost: '{2}',
    oracle: "At the beginning of your end step, draw a card. You may cast cards from an opponent's graveyard.",
  }), 'hand');
  const vanilla = addCard(game, bot, syntheticDef('Plain Body', { cost: '{2}', power: 3, toughness: 3 }), 'hand');
  game.recalc();
  const q = {
    type: 'main', player: bot,
    casts: [{ card: heistEngine, from: 'hand', alt: null }, { card: vanilla, from: 'hand', alt: null }],
    acts: [], lands: [], phase: game.phase,
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 83003, actionWindow: q, forceSearch: false });
  assert.equal(decision.action.kind, 'cast');
  assert.equal(decision.action.card, heistEngine);
  assert.equal(decision.log.style, 'post');
  assert.equal(decision.log.skill, 'post-opportunist-showstopper');
  assert.equal(decision.log.mode, 'LAY_LOW');
  assert.ok(decision.log.scoreBreakdown.showstopper > 0);
  assert.match(decision.reason, /Post opportunist-showstopper plan/);
});

test('Post targets the strongest opposing permanent when a heist can borrow it', async () => {
  const { game, players: [bot, human, third] } = fixture(83004);
  bot.turnsStarted = 4;
  const source = addCard(game, bot, syntheticDef('Borrow the Spotlight', {
    types: ['Sorcery'], oracle: 'Gain control of target creature.',
  }), 'hand');
  const small = addCard(game, human, syntheticDef('Small Utility', { power: 2, toughness: 2 }));
  const engine = addCard(game, third, syntheticDef('Premium Engine', {
    cost: '{6}', oracle: 'At the beginning of your upkeep, draw two cards.', power: 7, toughness: 7,
  }));
  game.recalc();
  const q = { type: 'chooseTargets', player: bot, src: source, candidates: [small, engine], min: 1, max: 1, aiHint: { goal: 'control' } };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 83004, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], engine);
  assert.ok(decision.log.scoreBreakdown.showstopper > 0);
});

test('Post pounces on a wounded open player and gets extra value from a borrowed attacker', async () => {
  const { game, players: [bot, wounded, leader, fourth] } = fixture(83005);
  bot.turnsStarted = 5;
  wounded.life = 4;
  fourth.lost = true;
  for (let i = 0; i < 3; i++) addCard(game, leader, syntheticDef(`Leader Engine ${i}`, {
    oracle: 'At the beginning of your upkeep, draw a card.', power: 8, toughness: 8,
  }));
  const borrowed = addCard(game, wounded, syntheticDef('Borrowed Headliner', {
    oracle: 'Whenever this creature attacks, draw a card.', power: 5, toughness: 5, kws: ['flying'],
  }));
  borrowed.ctrl = bot;
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 83005,
    actionWindow: { type: 'attackers', player: bot, eligible: [borrowed], opponents: [wounded, leader], forced: [] },
    forceSearch: false,
  });
  const attack = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(attack.length, 1);
  assert.equal(attack[0].target, wounded);
  assert.equal(decision.log.mode, 'SHOWTIME');
  assert.ok(decision.log.scoreBreakdown.showstopper >= 35);
});

test('Post favors an asymmetrical reset only in a real gamble state', () => {
  const behind = fixture(83006);
  const [bot, opponent] = behind.players;
  bot.life = 12;
  for (let i = 0; i < 4; i++) addForest(behind.game, bot);
  for (let i = 0; i < 4; i++) addCard(behind.game, opponent, syntheticDef(`Enemy Threat ${i}`, { cost: '{6}', power: 8, toughness: 8 }));
  const wipe = addCard(behind.game, bot, syntheticDef('Stage Reset', {
    types: ['Sorcery'], cost: '{4}', oracle: 'Destroy all creatures.',
  }), 'hand');
  behind.game.recalc();
  const q = { type: 'main', player: bot, casts: [{ card: wipe, from: 'hand', alt: null }], acts: [], lands: [], phase: behind.game.phase };
  const behindScore = MTG.quickScoreBotAction(MTG.createBotPlayerView(behind.game, bot.idx, q),
    { kind: 'cast', card: wipe, from: 'hand', alt: null }, MTG.getBotEvaluationProfile(bot), q);
  assert.equal(MTG.postOpportunistMode(behind.game, bot), 'GAMBLE');
  assert.ok(behindScore.breakdown.showstopper >= 9);

  const ahead = fixture(83007);
  const aheadBot = ahead.players[0];
  aheadBot.life = 12;
  for (let i = 0; i < 4; i++) addForest(ahead.game, aheadBot);
  for (let i = 0; i < 4; i++) addCard(ahead.game, aheadBot, syntheticDef(`Own Threat ${i}`, { cost: '{6}', power: 8, toughness: 8 }));
  const badWipe = addCard(ahead.game, aheadBot, syntheticDef('Bad Stage Reset', {
    types: ['Sorcery'], cost: '{4}', oracle: 'Destroy all creatures.',
  }), 'hand');
  ahead.game.recalc();
  const aheadQ = { type: 'main', player: aheadBot, casts: [{ card: badWipe, from: 'hand', alt: null }], acts: [], lands: [], phase: ahead.game.phase };
  const aheadScore = MTG.quickScoreBotAction(MTG.createBotPlayerView(ahead.game, aheadBot.idx, aheadQ),
    { kind: 'cast', card: badWipe, from: 'hand', alt: null }, MTG.getBotEvaluationProfile(aheadBot), aheadQ);
  assert.ok(aheadScore.breakdown.showstopper <= -9);
});

test('Post discards stax before a heist engine or combo finisher', async () => {
  const { game, players: [bot] } = fixture(83008);
  for (let i = 0; i < 6; i++) addForest(game, bot);
  const stax = addCard(game, bot, syntheticDef('No Fun Allowed', {
    types: ['Enchantment'], oracle: "Players can't cast spells and creatures don't untap.",
  }), 'hand');
  const heist = addCard(game, bot, syntheticDef('Borrowed Encore', {
    types: ['Sorcery'], oracle: "Put target creature card from an opponent's graveyard onto the battlefield under your control.",
  }), 'hand');
  const combo = addCard(game, bot, syntheticDef('Showtime Combo', {
    oracle: 'Untap target permanent. Whenever you cast a spell, draw a card.', power: 3, toughness: 3,
  }), 'hand');
  game.recalc();
  const q = {
    type: 'chooseCards', player: bot, from: [stax, heist, combo], min: 1, max: 1,
    prompt: 'Discard a card', aiHint: { kind: 'cleanupDiscard' },
  };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 83008, actionWindow: q, forceSearch: false });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], stax);
});

test('Post accepts a fair self-preservation deal and its terms remain rules-enforced', () => {
  const { game, players: [bot, human, runaway, fourth] } = fixture(83009);
  bot.turnsStarted = human.turnsStarted = runaway.turnsStarted = fourth.turnsStarted = 4;
  const botAttacker = addCard(game, bot, syntheticDef('Opportunist Attacker', { power: 5, toughness: 5 }));
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
  assert.equal(result.proposal.math.styleCaution, 0);
  assert.equal(game.diplomacyRequiredAttackTarget(bot), runaway);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true);
  assert.ok(game.diplomacyAttackTargetsFor(botAttacker, [human, runaway], false).includes(runaway));
});

test('Post completes a deterministic four-player game without fallback or a stalled mode', { timeout: 60_000 }, async () => {
  const game = MTG.newGame({
    humanDeck: 'Deep Clue Sea',
    aiDecks: ['Most Wanted', 'Counter Intelligence', 'Elven Council'],
    aiStyles: ['post', 'post', 'post'],
    difficulty: 'normal', seed: 83011, maxTurns: 200, paced: false,
  });
  await game.start();
  assert.equal(game.gameOver, true);
  assert.ok(game.winner);
  assert.ok(game.turnNo < game.maxTurns);
  assert.equal(game.pendingTriggers.length, 0);
  const postPlayers = game.players.filter(player => player.aiStyle === 'post');
  assert.equal(postPlayers.length, 3);
  const decisions = (game.aiDecisionLog || []).filter(entry => entry.style === 'post');
  assert.ok(decisions.length > 0);
  assert.equal(decisions.some(entry => entry.fallback), false);
  assert.ok(decisions.every(entry => entry.skill === 'post-opportunist-showstopper'));
  assert.ok(decisions.every(entry => ['LAY_LOW', 'HEIST', 'GAMBLE', 'SHOWTIME'].includes(entry.mode)));
});
