import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function passiveDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'chooseOption') return q.options.find(option => option.key === 'no')?.key || q.options[0]?.key;
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'orderTriggers') return q.triggers;
  return null;
}

function table(recipientName, { paced = true, difficulty = 'normal' } = {}) {
  const game = new MTG.Game({ seed: 81450, paced, maxTurns: 40 });
  game.speedFactor = 0;
  const blight = game.addPlayer('Blight', { name: 'Blight Curse' }, { decide: async (g, q) => passiveDecision(g, q) }, false);
  const bot = game.addPlayer('Bot', { name: 'Quick Draw' }, null, true);
  const permanent = (player, name) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.ctrl = player;
    card.zone = 'battlefield';
    card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  const ool = permanent(blight, 'Auntie Ool, Cursewretch');
  const recipient = recipientName ? permanent(bot, recipientName) : null;
  const trophy = new MTG.CardInst(MTG.DEFS["Assassin's Trophy"], bot);
  trophy.zone = 'hand';
  bot.hand.push(trophy);
  for (const player of [blight, bot]) {
    for (let index = 0; index < 8; index++) {
      const card = new MTG.CardInst(MTG.DEFS.Forest, player);
      card.zone = 'library';
      player.library.push(card);
    }
  }
  game.turnPlayer = bot;
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  bot.pool.B = 1;
  bot.pool.G = 1;
  game.recalc();
  const controller = new MTG.AIController(bot, { difficulty });
  const decisions = [];
  bot.controller = {
    decide: async (g, q) => {
      const answer = await controller.decide(g, q);
      decisions.push({ type: q.type, hint: q.aiHint?.kind, answer,
        mana: Object.values(bot.pool).reduce((sum, n) => sum + n, 0) });
      return answer;
    },
  };
  const main = () => bot.controller.decide(game, {
    type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot),
    lands: game.playableLands(bot), phase: 'main1',
  });
  return { game, bot, blight, ool, trophy, recipient, controller, decisions, permanent, main };
}

test('local AI casts Trophy and pays Blight with a surviving Titan, with no spare mana', async () => {
  for (const paced of [false, true]) {
    for (const difficulty of ['normal', 'tough']) {
      const { game, bot, ool, trophy, recipient, decisions, main } = table('Grave Titan', { paced, difficulty });
      const action = await main();
      assert.equal(action.kind, 'cast');
      assert.equal(action.card, trophy);
      assert.equal(await game.castSpell(bot, action.card, { from: action.from, ...(action.alt || {}) }), true);
      assert.equal(ool.zone, 'graveyard', `${difficulty}, paced=${paced}: bot must not waste its removal by declining affordable Blight`);
      assert.equal(trophy.zone, 'graveyard');
      assert.equal(recipient.zone, 'battlefield');
      assert.equal(recipient.counters['-1/-1'], 2);
      assert.equal(recipient.toughness, 4);
      const ward = decisions.find(decision => decision.hint === 'ward');
      assert.equal(ward.answer, 'yes');
      assert.equal(ward.mana, 0, 'Blight is not a two-mana payment');
      assert.equal(bot.life, 39, 'Ool sees the counters before the removal resolves');
      assert.equal(game.aiDecisionLog.some(decision => decision.fallback), false);
    }
  }
});

test('Goat remains the cheap Blight recipient and payment still destroys Ool', async () => {
  const { game, bot, ool, trophy, recipient, main } = table('Oft-Nabbed Goat');
  const titan = new MTG.CardInst(MTG.DEFS['Grave Titan'], bot);
  titan.ctrl = bot; titan.zone = 'battlefield'; titan.sick = false;
  game.battlefield.push(titan);
  game.recalc();
  const action = await main();
  assert.equal(action.card, trophy);
  assert.equal(await game.castSpell(bot, trophy, { from: 'hand' }), true);
  assert.equal(ool.zone, 'graveyard');
  assert.equal(recipient.counters['-1/-1'], 2);
  assert.equal(titan.counters['-1/-1'] || 0, 0);
});

test('without its own creature the bot holds removal instead of casting into unpaid Blight', async () => {
  for (const paced of [false, true]) {
    const { game, bot, ool, trophy, main } = table(null, { paced });
    assert.ok(MTG.botWardTargetAdjustment(game, bot, ool, { src: trophy, so: { kind: 'spell' } }) <= -1000);
    const action = await main();
    assert.notEqual(action.card, trophy);
    assert.equal(trophy.zone, 'hand');
    assert.equal(bot.pool.B + bot.pool.G, 2);
  }
});

test('Blight costs include marked damage: hold removal and decline a forced bad trade', async () => {
  const { game, bot, ool, trophy, recipient, decisions, main } = table('Grave Titan');
  recipient.damage = 4;
  const action = await main();
  assert.notEqual(action.card, trophy, 'two counters would make the marked damage lethal to the valuable Titan');
  assert.equal(await game.castSpell(bot, trophy, { from: 'hand' }), true);
  assert.equal(decisions.find(decision => decision.hint === 'ward')?.answer, 'no');
  assert.equal(ool.zone, 'battlefield');
  assert.equal(recipient.zone, 'battlefield');
  assert.equal(recipient.counters['-1/-1'] || 0, 0);
});

test('Blight target selection prefers an effective unwarded answer when payment is impossible', async () => {
  const { game, bot, ool, trophy, permanent, controller } = table(null);
  const plain = permanent(game.players[0], 'Grave Titan');
  game.recalc();
  const picks = await controller.decide(game, {
    type: 'chooseTargets', src: trophy, so: { kind: 'spell', card: trophy },
    candidates: [ool, plain], min: 1, max: 1, aiHint: { goal: 'removal', removalKind: 'destroy' },
  });
  assert.equal(picks.length, 1);
  assert.equal(picks[0], plain);
  assert.equal(bot.pool.B + bot.pool.G, 2, 'thinking about ward must not spend mana');
});

test('Blight payment declines an irrelevant ability instead of treating every effect as removal', async () => {
  const { game, bot, ool, recipient, controller } = table('Grave Titan');
  const targetSpec = { aiHint: { goal: 'untap' }, filter: () => true };
  const original = {
    kind: 'ability', ctrl: bot, srcCard: recipient, targets: [ool], targetSpecs: [targetSpec],
  };
  game.stack.push(original);
  const answer = await controller.decide(game, {
    type: 'chooseOption', options: [{ key: 'yes', label: 'Blight 2' }, { key: 'no', label: 'Cancel' }],
    aiHint: { kind: 'ward', payment: 'blight', n: 2, target: ool, stackObject: original },
  });
  assert.equal(answer, 'no', 'Ool is already untapped; its high permanent value is not the ability benefit');
  assert.equal(recipient.counters['-1/-1'] || 0, 0);
});

test('uncounterable removal can answer Blight ward even without any payment creature', async () => {
  const { game, bot, ool, trophy, main, decisions } = table(null);
  trophy.def = MTG.DEFS['Void Rend'];
  bot.pool.G = 0; bot.pool.W = 1; bot.pool.U = 1;
  assert.equal(MTG.botWardTargetAdjustment(game, bot, ool, {
    src: trophy, so: { kind: 'spell', card: trophy, ctrl: bot },
  }), 0);
  const action = await main();
  assert.equal(action.card, trophy);
  assert.equal(await game.castSpell(bot, trophy, { from: 'hand' }), true);
  assert.equal(ool.zone, 'graveyard');
  assert.equal(decisions.some(decision => decision.hint === 'ward'), false);
});

async function pendingDecimate() {
  const fixture = table('Grave Titan');
  const { game, bot, blight, ool, trophy: decimate, permanent } = fixture;
  decimate.def = MTG.DEFS.Decimate;
  bot.pool.B = 0; bot.pool.C = 2; bot.pool.R = 1;
  const artifact = permanent(blight, 'Sol Ring');
  const enchantment = permanent(blight, 'Rhystic Study');
  const land = permanent(blight, 'Cabal Coffers');
  game.recalc();
  // Pause only the automatic priority drain so an intervening battlefield
  // change can occur above the real cast spell and its real Ward trigger.
  const priorityRound = game.priorityRound;
  game.priorityRound = async () => {};
  try {
    assert.equal(await game.castSpell(bot, decimate, { from: 'hand' }), true);
  } finally {
    game.priorityRound = priorityRound;
  }
  const original = game.stack.find(object => object.card === decimate);
  assert.ok(original);
  for (const [index, target] of [artifact, ool, enchantment, land].entries()) {
    assert.equal(original.targets[index], target);
    assert.equal(original.targetIdentities[index].zoneVersion, target.zoneVersion);
  }
  assert.ok(game.stack.some(object => /Ward/.test(object.name)));
  return { ...fixture, decimate, original, artifact, enchantment, land };
}

test('Decimate still pays Blight after Ool leaves when its other three original targets remain legal', async () => {
  const { game, bot, ool, recipient, decisions, decimate, artifact, enchantment, land } = await pendingDecimate();
  await game.move(ool, 'graveyard');
  await game.priorityRound(bot);
  assert.equal(decisions.find(decision => decision.hint === 'ward')?.answer, 'yes');
  assert.equal(recipient.counters['-1/-1'], 2);
  assert.equal(recipient.toughness, 4);
  for (const target of [artifact, enchantment, land]) assert.equal(target.zone, 'graveyard');
  assert.equal(decimate.zone, 'graveyard');
  assert.equal(bot.life, 40, 'the departed Ool does not trigger from the payment');
});

test('Decimate declines Blight when every apparent target is a new object after leaving and returning', async () => {
  const { game, bot, ool, recipient, decisions, original, artifact, enchantment, land } = await pendingDecimate();
  for (const target of [artifact, ool, enchantment, land]) {
    await game.move(target, 'exile');
    await game.move(target, 'battlefield');
  }
  assert.equal(game.revalidateTargets(original.targets, original.targetSpecs, original.card,
    bot, original.targetIdentities).anyLegal, false);
  await game.priorityRound(bot);
  assert.equal(decisions.find(decision => decision.hint === 'ward')?.answer, 'no');
  assert.equal(recipient.counters['-1/-1'] || 0, 0);
  for (const target of [artifact, ool, enchantment, land]) assert.equal(target.zone, 'battlefield');
});
