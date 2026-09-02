// The four core archetypes (Aggressive, Opportunist, Defensive, Saboteur)
// must change what the local AI does, not only its label. Every check puts
// two styles in the SAME game state and compares the decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const decks = Object.keys(MTG.DECKS).filter(name => !MTG.DECKS[name].custom);

function setup(seed) {
  const game = MTG.newGame({
    humanDeck: decks[0], aiDecks: decks.slice(1, 4), aiStyles: ['balanced', 'balanced', 'balanced'],
    difficulty: 'normal', seed, maxTurns: 80, paced: false,
  });
  const bot = game.players.find(player => player.isAI);
  game.turnPlayer = bot; game.turnNo = 9; game.phase = 'combat'; game.step = 'attackers';
  return { game, bot };
}

function put(game, player, def, opts = {}) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield'; card.ctrl = player; card.sick = false; card.tapped = !!opts.tapped;
  game.battlefield.push(card);
  return card;
}

const findDef = predicate => Object.values(MTG.DEFS).find(predicate);
const bear = findDef(def => def.types && def.types.includes('Creature') && Number(def.power) === 2 && Number(def.toughness) === 2 && !(def.kws || []).length && !def.mana && !def.triggers);
const wall = findDef(def => def.types && def.types.includes('Creature') && Number(def.power) === 3 && Number(def.toughness) === 3 && !(def.kws || []).length && !def.mana && !def.triggers);

async function attackDecision(game, bot, style) {
  bot.aiStyle = style;
  game.recalc();
  const eligible = game.creatures(bot).filter(card => !card.tapped && !card.sick && game.canAttackAtAll(card));
  const q = { type: 'attackers', player: bot, eligible, opponents: bot.opponents(game), forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'normal', seed: 5, actionWindow: q, forceSearch: false });
  return decision.action.assignments || [];
}

test('core archetypes carry an archetype score component; Balanced stays neutral', async () => {
  const { game, bot } = setup(301);
  put(game, bot, bear); put(game, bot, bear);
  put(game, bot.opponents(game)[0], wall);
  game.recalc();
  const eligible = game.creatures(bot);
  const q = { type: 'attackers', player: bot, eligible, opponents: bot.opponents(game), forced: [] };
  for (const style of ['aggressive', 'opportunist', 'passive', 'teaser']) {
    bot.aiStyle = style;
    const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'normal', seed: 5, actionWindow: q, forceSearch: false });
    assert.equal(typeof decision.log.scoreBreakdown.archetype, 'number', `${style}: the chosen action carries an archetype component`);
  }
  bot.aiStyle = 'balanced';
  const balanced = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'normal', seed: 5, actionWindow: q, forceSearch: false });
  assert.equal(balanced.log.scoreBreakdown.archetype, undefined, 'balanced applies no archetype component');
});

test('an Aggressive seat attacks into a board the Defensive seat stays home against', async () => {
  const { game, bot } = setup(302);
  // Two 2/2 attackers against an untapped 3/3: a marginal attack.
  put(game, bot, bear); put(game, bot, bear);
  const opponent = bot.opponents(game)[0];
  put(game, opponent, wall);
  const aggressive = await attackDecision(game, bot, 'aggressive');
  const passive = await attackDecision(game, bot, 'passive');
  const balanced = await attackDecision(game, bot, 'balanced');
  assert.ok(aggressive.length >= balanced.length, 'aggressive never attacks with fewer bodies than balanced');
  assert.ok(passive.length <= balanced.length, 'defensive never attacks with more bodies than balanced');
  assert.ok(aggressive.length > passive.length, 'aggressive commits more attackers than defensive in the same spot');
});

test('an Opportunist seat hunts the wounded opponent while an Aggressive seat goes for the leader', async () => {
  const { game, bot } = setup(303);
  put(game, bot, bear); put(game, bot, bear); put(game, bot, bear);
  const [leader, wounded, third] = bot.opponents(game);
  // Leader: strong board, healthy. Wounded: empty board, low life. Third: quiet.
  put(game, leader, wall); put(game, leader, wall); put(game, leader, wall, { tapped: true });
  wounded.life = 9; leader.life = 40; third.life = 40;
  const opportunist = await attackDecision(game, bot, 'opportunist');
  const woundedHits = opportunist.filter(item => item.target === wounded).length;
  const leaderHits = opportunist.filter(item => item.target === leader).length;
  assert.ok(woundedHits > 0, 'opportunist sends attackers at the wounded player');
  assert.ok(woundedHits >= leaderHits, 'opportunist does not prefer the leader over the wounded player');
});

test('a custom skill built on a core archetype inherits its policy', async () => {
  const key = MTG.registerAISkill({
    schema: 'commander-ai-skill/v1', id: 'test-core-aggro', name: 'Test Core Aggro',
    description: 'Aggressive base with untouched settings.', baseStyle: 'aggressive',
  });
  const { game, bot } = setup(304);
  put(game, bot, bear); put(game, bot, bear);
  put(game, bot.opponents(game)[0], wall);
  const base = await attackDecision(game, bot, 'aggressive');
  const custom = await attackDecision(game, bot, key);
  assert.equal(custom.length, base.length, 'the custom skill attacks with the same bodies as its aggressive base');
  assert.equal(MTG.getAIBaseStyle(key), 'aggressive');
});
