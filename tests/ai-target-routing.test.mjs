import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

// Every generic Oracle goal that reaches the local AI must be routed to the
// right side of the table. An unrouted goal used to fall through to a default
// that scored the wrong side positively, so these are real decision tests
// driven through the shipped AIController rather than through the scorer.

function fixture(name, extra = {}) {
  return {
    name, cost: '{2}', super: [], types: ['Creature'], subtypes: ['Beast'],
    power: '2', toughness: '2', kws: [], oracle: '', ...extra,
  };
}

function table(MTG, seed = 77) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 5 });
  const bot = game.addPlayer('Bot', { name: 'Bot' }, { decide: async () => ({ kind: 'pass' }) }, true);
  const human = game.addPlayer('You', { name: 'You' }, { decide: async () => ({ kind: 'pass' }) }, false);
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  game.turnPlayer = bot;
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';
  return { game, bot, human };
}

function permanent(MTG, game, player, def) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

test('a printed benefit aimed at a player is kept by the bot', async () => {
  const MTG = loadEngine();
  const { game, bot, human } = table(MTG);
  const source = permanent(MTG, game, bot, fixture('Benefit Source'));
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseTargets', candidates: [bot, human], min: 1, max: 1, src: source,
    prompt: 'Target player draws two cards', aiHint: { goal: 'self' },
  });
  assert.equal(chosen[0], bot, 'the bot does not hand its own card draw to an opponent');
});

test('an evasion grant stays on the bot own creature', async () => {
  const MTG = loadEngine();
  const { game, bot, human } = table(MTG, 78);
  const mine = permanent(MTG, game, bot, fixture('My Attacker'));
  const theirs = permanent(MTG, game, human, fixture('Their Titan', { power: '6', toughness: '6', cost: '{6}' }));
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseTargets', candidates: [mine, theirs], min: 1, max: 1, src: mine,
    prompt: 'Target creature can\'t be blocked this turn', aiHint: { goal: 'evasion' },
  });
  assert.equal(chosen[0], mine, 'the bot does not make an opponent creature unblockable');
});

test('an Aura is attached to the bot own permanent', async () => {
  const MTG = loadEngine();
  const { game, bot, human } = table(MTG, 79);
  const mine = permanent(MTG, game, bot, fixture('My Land',
    { cost: null, types: ['Land'], subtypes: ['Forest'], super: ['Basic'], power: undefined, toughness: undefined }));
  const theirs = permanent(MTG, game, human, fixture('Their Land',
    { cost: null, types: ['Land'], subtypes: ['Forest'], super: ['Basic'], power: undefined, toughness: undefined }));
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseTargets', candidates: [mine, theirs], min: 1, max: 1, src: mine,
    prompt: 'Enchant land', aiHint: { goal: 'aura' },
  });
  assert.equal(chosen[0], mine, 'the bot does not enchant an opponent land with its own Aura');
});

test('a cost paid with your own permanent spends the cheapest one', async () => {
  const MTG = loadEngine();
  const { game, bot } = table(MTG, 80);
  const cheap = permanent(MTG, game, bot, fixture('Spare Forest',
    { cost: null, types: ['Land'], subtypes: ['Forest'], super: ['Basic'], power: undefined, toughness: undefined }));
  const best = permanent(MTG, game, bot, fixture('My Commander', { power: '6', toughness: '6', cost: '{5}{G}' }));
  best.commander = true;
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseTargets', candidates: [cheap, best], min: 1, max: 1, src: best,
    prompt: 'Destroy a permanent you control', aiHint: { goal: 'sacOwn' },
  });
  assert.equal(chosen[0], cheap, 'the bot never destroys its own best permanent as a cost');
});

test('goad is pointed at an opponent creature', async () => {
  const MTG = loadEngine();
  const { game, bot, human } = table(MTG, 81);
  const mine = permanent(MTG, game, bot, fixture('My Commander', { power: '6', toughness: '6', cost: '{5}{G}' }));
  mine.commander = true;
  const theirs = permanent(MTG, game, human, fixture('Their Bear'));
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseTargets', candidates: [mine, theirs], min: 1, max: 1, src: mine,
    prompt: 'Goad target creature', aiHint: { goal: 'goadTarget' },
  });
  assert.equal(chosen[0], theirs, 'the bot does not goad its own commander');
});

test('enlist taps the strongest spare body and leaves the commander alone', async () => {
  const MTG = loadEngine();
  const { game, bot, human } = table(MTG, 82);
  const attacker = permanent(MTG, game, bot, fixture('Enlister'));
  const wall = permanent(MTG, game, bot, fixture('Wall', { power: '0', toughness: '7' }));
  const bear = permanent(MTG, game, bot, fixture('Bear', { power: '3', toughness: '3' }));
  const commander = permanent(MTG, game, bot, fixture('Commander', { power: '6', toughness: '6', cost: '{5}{G}' }));
  commander.commander = true;
  game.phase = 'combat';
  game.step = 'attackers';
  attacker.attacking = human;
  game.combat = { attackers: [attacker], blockers: [] };
  game.recalc();
  const chosen = await bot.controller.decide(game, {
    type: 'chooseCards', from: [wall, bear, commander], min: 0, max: 1,
    prompt: 'Enlist: tap a creature to add its power?', aiHint: { kind: 'enlist', src: attacker },
  });
  assert.equal(chosen[0], bear, 'the bot enlists the best creature it can spare');
});
