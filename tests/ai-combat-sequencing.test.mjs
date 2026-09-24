import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { aiIsolationFingerprint } from './helpers/run-ai-adversarial-games.mjs';

const MTG = loadEngine();
const styles = Object.keys(MTG.AI_STYLES);

function fixture(style = 'balanced', difficulty = 'normal') {
  const game = new MTG.Game({ seed: 83124, paced: false, maxTurns: 100 });
  const deck = MTG.DECKS['Quick Draw'];
  const bot = game.addPlayer('Bot', deck, null, true);
  const rival = game.addPlayer('Defender', deck, null, true);
  bot.controller = new MTG.AIController(bot, { style, difficulty });
  rival.controller = new MTG.AIController(rival, { style: 'balanced', difficulty });
  game.turnPlayer = bot; game.turnNo = 20; game.phase = 'main1'; game.step = 'main';
  return { game, bot, rival };
}

function add(game, owner, definition, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : definition, owner);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  return card;
}

function creature(game, owner, power, toughness = power, kws = [], zone = 'battlefield', extra = {}) {
  return add(game, owner, { name: `Body ${power}/${toughness} ${game.battlefield.length}`, types: ['Creature'],
    super: [], subtypes: [], cost: '{3}', power: String(power), toughness: String(toughness),
    kws, oracle: '', abilities: [], ...extra }, zone);
}

function mainWindow(game, bot) {
  game.recalc();
  return { type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot),
    lands: game.playableLands(bot), phase: game.phase };
}

async function decide(game, bot, q, forceSearch = false) {
  const difficulty = bot.controller.difficulty;
  const before = aiIsolationFingerprint(game);
  const result = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx,
    difficulty, seed: 5, actionWindow: q, forceSearch });
  assert.ok(aiIsolationFingerprint(game) === before, 'planning must preserve the live game');
  assert.equal(result.log.fallback, false);
  return result;
}

async function attacks(game, bot) {
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  return (await decide(game, bot, { type: 'attackers', player: bot, eligible: game.creatures(bot),
    opponents: bot.opponents(game), forced: [] })).action.assignments;
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of styles) {
  test(`${style}/${difficulty}: a harmless wall is not player damage or a reason to tap an attacker`, async () => {
    const { game, bot, rival } = fixture(style, difficulty);
    const attacker = creature(game, bot, 3, 3);
    creature(game, rival, 0, 8, ['defender']);
    rival.life = 1;
    const assignments = await attacks(game, bot);
    assert.equal(MTG.assessAttackAssignment(game, bot, attacker, rival).expectedDamage, 0);
    assert.equal(assignments.length, 0);
    assert.equal(bot.controller.attackers(game, { eligible: [attacker], opponents: [rival], forced: [] }).length, 0);
  });

  test(`${style}/${difficulty}: vigilance does not excuse dying to a larger defender`, async () => {
    const { game, bot, rival } = fixture(style, difficulty);
    creature(game, bot, 2, 2, ['vigilance']);
    creature(game, rival, 4, 4);
    assert.equal((await attacks(game, bot)).length, 0);
  });
}

test('safe vigilance, lifelink and attack triggers remain useful through a wall', async () => {
  for (const kind of ['vigilance', 'lifelink', 'trigger']) {
    const { game, bot, rival } = fixture('aggressive');
    add(game, bot, 'Plains', 'library');
    const extra = kind === 'trigger' ? { oracle: 'Whenever this creature attacks, draw a card.',
      triggers: [{ on: 'attacks', filter: (g, self, event) => event.card === self,
        run: async (g, self) => g.draw(self.ctrl, 1) }] } : {};
    creature(game, bot, 3, 3, kind === 'trigger' ? [] : [kind], 'battlefield', extra);
    creature(game, rival, 0, 8, ['defender']);
    assert.equal((await attacks(game, bot)).length, 1, kind);
  }
});

test('a larger attacker can still force a valuable block, and a swarm can overwhelm one wall', async () => {
  {
    const { game, bot, rival } = fixture('aggressive');
    creature(game, bot, 6, 6); creature(game, rival, 0, 5, ['defender']);
    assert.equal((await attacks(game, bot)).length, 1);
  }
  {
    const { game, bot, rival } = fixture('aggressive'); rival.life = 5;
    for (let i = 0; i < 3; i++) creature(game, bot, 3, 3);
    creature(game, rival, 0, 8, ['defender']);
    assert.equal((await attacks(game, bot)).length, 3);
  }
});

function wipeFixture(style = 'aggressive', difficulty = 'normal', wipeName = 'Day of Judgment') {
  const data = fixture(style, difficulty);
  const { game, bot, rival } = data;
  for (let i = 0; i < 4; i++) creature(game, rival, 4, 4);
  for (let i = 0; i < 8; i++) add(game, bot, i < 4 ? 'Plains' : 'Mountain');
  const wipe = add(game, bot, wipeName, 'hand');
  const recruit = creature(game, bot, 6, 6, [], 'hand');
  return { ...data, wipe, recruit };
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of styles) {
  test(`${style}/${difficulty}: casts the useful wipe before a vulnerable creature`, async () => {
    const { game, bot, wipe } = wipeFixture(style, difficulty);
    const result = await decide(game, bot, mainWindow(game, bot));
    assert.equal(result.action.card, wipe, JSON.stringify(result.consideredActions));
  });
}

for (const style of ['aggressive', 'jimmy', 'olivia']) test(`${style}: the live search and fallback also sequence wipe, then rebuild`, async () => {
  const { game, bot, wipe, recruit } = wipeFixture(style);
  const q = mainWindow(game, bot);
  assert.equal(bot.controller.mainAction(game, q).card, wipe);
  const result = await decide(game, bot, q, true);
  assert.equal(result.action.card, wipe, JSON.stringify(result.consideredActions));
  const simulation = await MTG.simulateAction(game, result.action, { playerId: bot.idx, seed: 5 });
  assert.equal(simulation.applied, true);
  const next = simulation.state, player = next.players[bot.idx];
  const rebuilt = await decide(next, player, mainWindow(next, player));
  assert.equal(rebuilt.action.card?.iid, recruit.iid);
  assert.equal(next.creatures(next.players[1]).length, 0);
  const rebuiltBoard = await MTG.simulateAction(next, rebuilt.action, { playerId: player.idx, seed: 6 });
  assert.equal(rebuiltBoard.applied, true);
  assert.equal(rebuiltBoard.state.byIid(recruit.iid).zone, 'battlefield');
  assert.equal(rebuiltBoard.state.byIid(wipe.iid).zone, 'graveyard');
});

test('damage and exile wipes also come before creatures they would remove', async () => {
  for (const wipeName of ['Blasphemous Act', 'Chain Reaction', 'Farewell']) {
    const { game, bot, wipe, recruit } = wipeFixture('aggressive', 'normal', wipeName);
    if (wipeName === 'Chain Reaction') recruit.def = { ...recruit.def, toughness: '3' };
    if (wipeName === 'Farewell') recruit.def = { ...recruit.def, kws: ['indestructible'] };
    const result = await decide(game, bot, mainWindow(game, bot));
    assert.equal(result.action.card, wipe, `${wipeName}: ${JSON.stringify(result.consideredActions)}`);
  }
});

test('an unaffordable or unfavorable wipe does not stop creature development', async () => {
  for (const kind of ['unaffordable', 'ahead']) {
    const { game, bot, rival, recruit } = wipeFixture();
    if (kind === 'unaffordable') {
      for (const land of game.lands(bot).slice(3)) land.tapped = true;
    } else {
      for (const card of game.creatures(rival)) card.ctrl = bot;
      creature(game, rival, 1, 1);
      game.phase = 'main2';
    }
    const result = await decide(game, bot, mainWindow(game, bot));
    assert.equal(result.action.card, recruit, kind);
  }
});

test('sweep sequencing respects indestructible, damage thresholds and one-sided effects', () => {
  for (const [wipeName, kind] of [
    ['Day of Judgment', 'indestructible'], ['Blasphemous Act', 'durable'],
    ['Plague Wind', 'one-sided'], ['Farewell', 'artifact-mode'],
  ]) {
    const { game, bot, rival, wipe, recruit } = wipeFixture('aggressive', 'normal', wipeName);
    if (kind === 'indestructible') recruit.def = { ...recruit.def, kws: ['indestructible'] };
    if (kind === 'durable') recruit.def = { ...recruit.def, toughness: '14' };
    if (kind === 'one-sided') for (let i = 0; i < 3; i++) add(game, bot, 'Swamp');
    if (kind === 'artifact-mode') {
      for (const creature of game.creatures(rival)) creature.def = { ...creature.def, types: ['Artifact'] };
    }
    const q = mainWindow(game, bot);
    assert.ok(q.casts.some(entry => entry.card === wipe), wipeName);
    const view = MTG.createBotPlayerView(game, bot.idx, q);
    const action = { kind: 'cast', ...q.casts.find(entry => entry.card === recruit) };
    const score = MTG.quickScoreBotAction(view, action, MTG.getDeckAIProfile(bot.deckName || bot.deck.name), q);
    assert.equal(score.breakdown.sequencing || 0, 0, `${wipeName}/${kind}`);
  }
});

test('a restricted modal wipe is still valued when its creature modes are useful', async () => {
  const { game, bot, wipe } = wipeFixture('balanced', 'normal', 'Austere Command');
  const q = mainWindow(game, bot);
  q.casts = q.casts.filter(entry => entry.card === wipe);
  assert.equal((await decide(game, bot, q)).action.card, wipe);
});
