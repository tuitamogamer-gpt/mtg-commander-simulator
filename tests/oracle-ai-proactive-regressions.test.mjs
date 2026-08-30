import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function aiGame(seed = 9480) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 10, difficulty: 'hard' });
  const bot = game.addPlayer('Oracle proactive bot', { name: 'Oracle proactive regression' }, null, true);
  const opponent = game.addPlayer('Oracle opponent', { name: 'Oracle opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnNo = 7;
  game.turnPlayer = bot;
  game.phase = 'main1';
  game.step = 'main';
  return { game, bot, opponent };
}

function actual(game, player, name, zone = 'battlefield', { sick = false, tapped = false } = {}) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.ctrl = player;
  card.zone = zone;
  card.sick = sick;
  card.tapped = tapped;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function chosenCount(game, player, label) {
  return (game.aiDecisionLog || []).filter(entry => entry.playerId === player.idx && entry.chosen === label).length;
}

test('hard local AI does not spend Burst of Energy or Lead Astray on unchanged targets', async () => {
  {
    const { game, bot } = aiGame(9481);
    const burst = actual(game, bot, 'Burst of Energy', 'hand');
    const forest = actual(game, bot, 'Forest');
    bot.pool.W = 1;

    await game.mainPhase(bot);
    assert.equal(burst.zone, 'hand', 'untap-only spell is held when every legal permanent is already untapped');
    assert.equal(forest.tapped, false);
  }

  {
    const { game, bot, opponent } = aiGame(9482);
    const leadAstray = actual(game, bot, 'Lead Astray', 'hand');
    const bear = actual(game, opponent, 'Grizzly Bears', 'battlefield', { tapped: true });
    bot.pool.C = 1;
    bot.pool.W = 1;

    await game.mainPhase(bot);
    assert.equal(leadAstray.zone, 'hand', 'tap-only spell is held when every opposing creature is already tapped');
    assert.equal(bear.tapped, true);
  }
});

test('hard local AI holds end-step haste and ritual spells without a usable payoff', async () => {
  {
    const { game, bot, opponent } = aiGame(9483);
    game.turnPlayer = opponent;
    game.phase = 'end';
    game.step = 'end';
    const speed = actual(game, bot, 'Unnatural Speed', 'hand');
    const bear = actual(game, bot, 'Grizzly Bears');
    bot.pool.R = 1;

    await game.priorityRound(opponent);
    assert.equal(speed.zone, 'hand', 'haste-only trick is not spent after combat on an old creature');
    assert.equal(bear.kw('haste'), false);
    assert.equal(bot.pool.R, 1);
  }

  {
    const { game, bot, opponent } = aiGame(9484);
    game.turnPlayer = opponent;
    game.phase = 'end';
    game.step = 'end';
    const ritual = actual(game, bot, 'Pyretic Ritual', 'hand');
    const impossibleFollowUp = actual(game, bot, 'Autochthon Wurm', 'hand');
    bot.pool.R = 2;

    await game.priorityRound(opponent);
    assert.equal(ritual.zone, 'hand', 'ritual is held when its only follow-up cannot use the temporary mana');
    assert.equal(impossibleFollowUp.zone, 'hand');
    assert.equal(bot.pool.R, 2);
  }
});

test('hard local AI does not treat an unrelated opposing Stack object as a pump emergency', async () => {
  const { game, bot, opponent } = aiGame(9492);
  game.turnPlayer = opponent;
  game.phase = 'main1';
  game.step = 'main';
  const speed = actual(game, bot, 'Unnatural Speed', 'hand');
  const bear = actual(game, bot, 'Grizzly Bears');
  const curate = actual(game, opponent, 'Curate', 'hand');
  actual(game, opponent, 'Forest', 'library');
  actual(game, opponent, 'Island', 'library');
  bot.pool.R = 1;

  const priorityRound = game.priorityRound.bind(game);
  game.priorityRound = async () => {};
  assert.equal(await game.castSpell(opponent, curate, { from: 'hand', alt: { free: true } }), true);
  assert.equal(game.stack.at(-1)?.card, curate);
  game.priorityRound = priorityRound;
  await game.priorityRound(opponent);

  assert.equal(speed.zone, 'hand');
  assert.equal(bear.kw('haste'), false);
  assert.equal(curate.zone, 'graveyard');
});

test('hard local AI holds pure discard spells when every opposing hand is empty', async () => {
  {
    const { game, bot, opponent } = aiGame(9493);
    const waking = actual(game, bot, 'Waking Nightmare', 'hand');
    assert.equal(opponent.hand.length, 0);
    bot.pool.C = 2;
    bot.pool.B = 1;
    await game.mainPhase(bot);
    assert.equal(waking.zone, 'hand');
  }

  {
    const { game, bot, opponent } = aiGame(9494);
    const fracture = actual(game, bot, 'Skull Fracture', 'graveyard');
    assert.equal(opponent.hand.length, 0);
    bot.pool.C = 3;
    bot.pool.B = 1;
    await game.mainPhase(bot);
    assert.equal(fracture.zone, 'graveyard', 'empty-hand target does not induce a wasted Flashback cast');
  }
});

test('hard local AI cycles instead of decking itself with actual Boon of the Wish-Giver', async () => {
  const { game, bot } = aiGame(9495);
  const boon = actual(game, bot, 'Boon of the Wish-Giver', 'hand');
  const finalCard = actual(game, bot, 'Island', 'library');
  bot.pool.C = 4;
  bot.pool.U = 2;
  bot.landsPlayed = 1;

  await game.mainPhase(bot);
  assert.equal(bot.lost, false);
  assert.equal(boon.zone, 'graveyard', 'the safe Cycling mode discards Boon');
  assert.equal(finalCard.zone, 'hand', 'Cycling draws the one remaining card without a failed draw');
  assert.ok((game.aiDecisionLog || []).some(entry => entry.playerId === bot.idx && /Boon of the Wish-Giver/.test(entry.chosen || '')));
});

test('hard local AI does not cast a controlled static pump that kills its only creature', async () => {
  const { game, bot } = aiGame(9485);
  const surge = actual(game, bot, 'Flowstone Surge', 'hand');
  const sprite = actual(game, bot, 'Cloud Sprite');
  bot.pool.C = 1;
  bot.pool.R = 1;

  await game.mainPhase(bot);
  assert.equal(surge.zone, 'hand');
  assert.equal(sprite.zone, 'battlefield');
  assert.deepEqual([sprite.power, sprite.toughness], [1, 1]);
});

test('hard local AI suppresses redundant or premature compiled self activations', async () => {
  {
    const { game, bot } = aiGame(9486);
    const silverback = actual(game, bot, 'Ancient Silverback');
    bot.pool.G = 3;
    await game.mainPhase(bot);
    assert.equal(silverback.regenShield, 0);
    assert.equal(chosenCount(game, bot, 'Activate Ancient Silverback — Regenerate'), 0);
  }

  {
    const { game, bot } = aiGame(9487);
    const hoverguard = actual(game, bot, 'Advanced Hoverguard');
    bot.pool.U = 3;
    await game.mainPhase(bot);
    assert.equal(hoverguard.kw('shroud'), false);
    assert.equal(chosenCount(game, bot, 'Activate Advanced Hoverguard — Gain shroud'), 0);
  }

  for (const [index, name, color, keyword] of [
    [0, 'Battlefly Swarm', 'B', 'deathtouch'],
    [1, 'Bastion Mastodon', 'W', 'vigilance'],
  ]) {
    const { game, bot } = aiGame(9488 + index);
    const creature = actual(game, bot, name);
    bot.pool[color] = 3;
    await game.mainPhase(bot);
    assert.equal(creature.kw(keyword), true, `${name} gains ${keyword} for a relevant attack`);
    assert.equal(chosenCount(game, bot, `Activate ${name} — Gain ${keyword}`), 1);
  }

  {
    const { game, bot } = aiGame(9490);
    const crusader = actual(game, bot, 'Angelfire Crusader', 'battlefield', { sick: true });
    const powerBefore = crusader.power;
    bot.pool.R = 3;
    await game.mainPhase(bot);
    assert.equal(crusader.power, powerBefore, 'summoning-sick creature is not pumped before a combat it cannot enter');
  }
});

test('hard local AI rejects Barbed Battlegear when its only legal host would die', async () => {
  const { game, bot } = aiGame(9491);
  const equipment = actual(game, bot, 'Barbed Battlegear');
  const sprite = actual(game, bot, 'Cloud Sprite');
  bot.pool.C = 2;

  await game.mainPhase(bot);
  assert.equal(equipment.attachedTo, null);
  assert.equal(sprite.zone, 'battlefield');
  assert.equal(sprite.toughness, 1);
  assert.equal(chosenCount(game, bot, 'Activate Barbed Battlegear'), 0);
});

test('hard local AI preserves Curate mandatory draw through the actual Surveil choice', async () => {
  const { game, bot, opponent } = aiGame(9496);
  game.turnPlayer = opponent;
  game.phase = 'end';
  game.step = 'end';
  const curate = actual(game, bot, 'Curate', 'hand');
  const islandA = actual(game, bot, 'Island', 'library');
  const islandB = actual(game, bot, 'Island', 'library');
  bot.pool.C = 1;
  bot.pool.U = 1;

  await game.priorityRound(opponent);

  assert.equal(bot.lost, false, 'Surveil must leave enough cards for Curate mandatory draw');
  assert.equal(curate.zone, 'graveyard');
  assert.equal(bot.hand.filter(card => card === islandA || card === islandB).length, 1);
  assert.equal(bot.library.filter(card => card === islandA || card === islandB).length +
    bot.graveyard.filter(card => card === islandA || card === islandB).length, 1,
  'the second viewed card remains accounted for after the protected draw');
});

test('hard local AI holds actual mandatory ETB and Magecraft draws that would deck it', async () => {
  {
    const { game, bot } = aiGame(9497);
    const crier = actual(game, bot, 'Bellowing Crier', 'hand');
    bot.pool.C = 1;
    bot.pool.U = 1;

    await game.mainPhase(bot);
    assert.equal(crier.zone, 'hand', 'draw-then-discard ETB is unsafe with an empty library');
    assert.equal(bot.lost, false);
  }

  {
    const { game, bot, opponent } = aiGame(9498);
    const visit = actual(game, bot, 'Deadly Visit', 'hand');
    actual(game, bot, 'Archmage Emeritus');
    const wurm = actual(game, opponent, 'Autochthon Wurm');
    bot.pool.C = 3;
    bot.pool.B = 2;

    await game.mainPhase(bot);
    assert.equal(visit.zone, 'hand', 'mandatory Magecraft draw is included before proposing the removal spell');
    assert.equal(wurm.zone, 'battlefield');
    assert.equal(bot.lost, false);
  }
});

test('hard local AI does not cast type-specific board wipes into a board they cannot affect', async () => {
  for (const [index, name, pool] of [
    [0, 'Creeping Corrosion', { C: 2, G: 2 }],
    [1, 'Back to Nature', { C: 1, G: 1 }],
  ]) {
    const { game, bot, opponent } = aiGame(9499 + index);
    const wipe = actual(game, bot, name, 'hand');
    const wurm = actual(game, opponent, 'Autochthon Wurm');
    Object.assign(bot.pool, pool);

    await game.mainPhase(bot);
    assert.equal(wipe.zone, 'hand', `${name} is held without a matching permanent`);
    assert.equal(wurm.zone, 'battlefield');
  }
});
