import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function table(paced, tapped) {
  const game = new M.Game({seed: 878223278, paced, maxTurns: 20});
  game.speedFactor = 0;
  const passive = {decide: async (g, q) => q.type === 'orderTriggers' ? q.triggers : {kind: 'pass'}};
  const bot = game.addPlayer('Bot', M.DECKS['Wade into Battle'], passive, true);
  game.addPlayer('Opponent', {name: 'Test'}, passive, true);
  bot.deckName = 'Wade into Battle';
  const ai = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  game.turnPlayer = bot; game.turnNo = 7; game.phase = 'main1'; game.step = 'main';
  const monolith = new M.CardInst(M.DEFS['Basalt Monolith'], bot);
  monolith.zone = 'battlefield'; monolith.sick = false; monolith.tapped = tapped;
  game.battlefield.push(monolith);
  bot.pool.C = tapped ? 3 : 0;
  game.recalc();
  const decide = () => ai.decide(game, {type: 'main', player: bot, phase: game.phase,
    casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot)});
  const resolve = async entry => {
    assert.equal(await game.activateAbility(bot, entry), true);
    while (game.stack.length) assert.equal(await game.resolveTop(), true);
  };
  return {game, bot, monolith, decide, resolve};
}

for (const paced of [false, true]) {
  test(`Basalt Monolith does not start a self-funded AI untap loop (paced=${paced})`, async () => {
    const {game, bot, monolith, decide, resolve} = table(paced, false);
    assert.equal((await decide()).kind, 'done');
    const legal = game.activatableList(bot).find(entry => entry.card === monolith && !entry.manaAbility);
    assert.ok(legal, 'the rules still allow a human to activate an untapped Monolith');
    await resolve(legal);
    assert.equal(monolith.tapped, false);
    assert.equal(bot.pool.C, 0);
    assert.equal((await decide()).kind, 'done');
  });

  test(`AI can ready a tapped Monolith without entering a repeat loop (paced=${paced})`, async () => {
    const {bot, monolith, decide, resolve} = table(paced, true);
    const choice = await decide();
    assert.equal(choice.kind, 'activate');
    assert.equal(choice.entry.card, monolith);
    await resolve(choice.entry);
    assert.equal(monolith.tapped, false);
    assert.equal(bot.pool.C, 0);
    assert.equal((await decide()).kind, 'done');
  });
}

for (const whiteSources of [0, 1]) {
  test(`AI develops Maja's missing white mana with ${whiteSources} Plains already in play`, async () => {
    const {game, bot} = table(false, false);
    game.battlefield.length = 0;
    bot.colorIdentity = ['G', 'W'];
    const add = (name, zone) => {
      const card = new M.CardInst(M.DEFS[name], bot);
      card.zone = zone; card.sick = false;
      (zone === 'battlefield' ? game.battlefield : bot[zone]).push(card);
      return card;
    };
    for (let i = 0; i < 4; i++) add('Forest', 'battlefield');
    for (let i = 0; i < whiteSources; i++) add('Plains', 'battlefield');
    add('Maja, Bretagard Protector', 'command').commander = true;
    add('Forest', 'hand');
    const plains = add('Plains', 'hand');
    game.recalc();
    const ai = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
    const choice = await ai.decide(game, {type: 'main', player: bot, phase: game.phase,
      casts: game.castableList(bot), acts: game.activatableList(bot), lands: game.playableLands(bot)});
    assert.equal(choice.kind, 'land');
    assert.equal(choice.card, plains, 'develop the missing color instead of another Forest');
  });
}

test('both AI card selectors respect a zero maximum even when useful cards are available', async () => {
  const {game, bot} = table(false, false), card = new M.CardInst(M.DEFS.Forest, bot);
  card.zone = 'library'; bot.library.push(card);
  const ai = new M.AIController(bot, {difficulty: 'normal', style: 'balanced'});
  for (const kind of ['searchBasic', 'searchLand', 'generic']) {
    const question = {type: 'chooseCards', player: bot, from: [card], min: 0, max: 0, search: true, aiHint: {kind}};
    assert.deepEqual(Array.from(ai.chooseCards(game, question)), []);
    assert.deepEqual(Array.from(await ai.decide(game, question)), []);
  }
});

test('replicate affordability rejects excessive colored pips despite a large off-color pool', () => {
  const {game, bot} = table(false, false);
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) bot.pool[color] = 40;
  for (let i = 0; i < 6; i++) {
    const island = new M.CardInst(M.DEFS.Island, bot);
    island.zone = 'battlefield'; game.battlefield.push(island);
  }
  game.recalc();
  const leap = new M.CardInst(M.DEFS['Leap of Flame'], bot);
  assert.equal(game.canPayMana(bot, M.parseCost('{U}{R}'.repeat(124)), {card: leap}), false);
  assert.equal(game.canPayMana(bot, M.parseCost('{U}{R}'.repeat(40)), {card: leap}), true);
});
