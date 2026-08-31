import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const difficulties = ['easy', 'normal', 'hard'];

function add(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function setup(difficulty, creatures = [], { mana = 2, paced = true, phase = 'main1' } = {}) {
  const game = new MTG.Game({ seed: 31831, difficulty, paced, maxTurns: 20 });
  game.speedFactor = 0;
  const bot = game.addPlayer('Prismari', { name: 'Prismari Artistry' }, null, true);
  bot.deckName = 'Prismari Artistry';
  bot.controller = new MTG.AIController(bot, { difficulty, style: 'balanced' });
  const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, { decide: async () => ({ kind: 'pass' }) }, false);
  game.turnPlayer = bot;
  game.turnNo = 12;
  game.phase = phase;
  game.step = 'main';
  // Retain the real cast/payment/target/resolve paths, with controlled priority
  // so assertions can inspect the exact spell before it resolves.
  game.priorityRound = async () => {};
  for (const name of creatures) add(game, bot, name);
  for (let i = 0; i < mana; i++) add(game, bot, 'Mountain');
  for (let i = 0; i < 12; i++) {
    add(game, bot, 'Island', 'library');
    add(game, opponent, 'Island', 'library');
  }
  const spell = add(game, bot, 'Twinflame', 'hand');
  return { game, bot, opponent, spell };
}

async function choose({ game, bot }) {
  return bot.controller.decide(game, {
    type: 'main', player: bot, casts: game.castableList(bot), acts: [], lands: [], phase: game.phase,
  });
}

async function resolveAll(game) {
  for (let step = 0; step < 40 && (game.stack.length || game.pendingTriggers.length); step++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal(game.log.some(entry => /AI V2 fallback/.test(entry.msg)), false);
}

for (const difficulty of difficulties) {
  for (const paced of [false, true]) {
    test(`${difficulty} ${paced ? 'interactive' : 'headless'} AI holds Twinflame without a useful copy`, async () => {
      for (const creatures of [[], ['Rootha, Mastering the Moment']]) {
        const scenario = setup(difficulty, creatures, { paced });
        const { game, bot, spell } = scenario;
        assert.ok(game.castableList(bot).some(entry => entry.card === spell), 'zero-target casting remains legal');
        assert.equal((await choose(scenario)).kind, 'done', `${creatures.join(', ') || 'empty battlefield'}: keep the card`);
        assert.equal(spell.zone, 'hand');
        assert.equal(game.lands(bot).every(card => !card.tapped), true, 'do not spend mana');
      }
    });

    test(`${difficulty} ${paced ? 'interactive' : 'headless'} AI makes a paid Twinflame copy with haste and end-step exile`, async () => {
      const scenario = setup(difficulty, ['Goldspan Dragon'], { paced });
      const { game, bot, spell } = scenario;
      const decision = await choose(scenario);
      assert.equal(decision.kind, 'cast');
      assert.equal(await game.castSpell(bot, spell, { from: decision.from, alt: decision.alt }), true);
      const stackObject = game.stack.find(item => item.card === spell);
      assert.equal(stackObject.manaSpent, 2);
      assert.equal(stackObject.striveTargets, 1);
      assert.equal([stackObject.targets[0]].flat()[0].name, 'Goldspan Dragon');
      await resolveAll(game);
      const copies = game.creatures(bot).filter(card => card.isToken && card.name === 'Goldspan Dragon');
      assert.equal(copies.length, 1);
      assert.equal(copies[0].kw('haste'), true);
      await game.emit('endStep', { player: bot });
      await resolveAll(game);
      assert.equal(copies[0].zone, 'ceased');
    });

    test(`${difficulty} ${paced ? 'interactive' : 'headless'} AI chooses only affordable Strive targets`, async () => {
      const scenario = setup(difficulty, ['Goldspan Dragon', 'Storm-Kiln Artist'], { paced });
      const { game, bot, spell } = scenario;
      const decision = await choose(scenario);
      assert.equal(decision.kind, 'cast', 'use the affordable one-target line instead of abandoning the spell');
      assert.equal(await game.castSpell(bot, spell, { from: decision.from, alt: decision.alt }), true);
      const stackObject = game.stack.find(item => item.card === spell);
      assert.equal(stackObject.striveTargets, 1);
      assert.equal(stackObject.manaSpent, 2);
      await resolveAll(game);
      assert.equal(game.creatures(bot).filter(card => card.isToken).length, 1);
    });
  }

  test(`${difficulty} AI pays the additional Strive cost when both copies are affordable`, async () => {
    const { game, bot, spell } = setup(difficulty, ['Goldspan Dragon', 'Storm-Kiln Artist'], { mana: 5 });
    assert.equal(await game.castSpell(bot, spell, { from: 'hand' }), true);
    const stackObject = game.stack.find(item => item.card === spell);
    assert.equal(stackObject.striveTargets, 2);
    assert.equal(stackObject.manaSpent, 5);
    await resolveAll(game);
    assert.equal(game.creatures(bot).filter(card => card.isToken).length, 2);
  });

  test(`${difficulty} AI does not spend Twinflame on a temporary attacker after combat`, async () => {
    const scenario = setup(difficulty, ['Air Elemental'], { phase: 'main2' });
    assert.equal((await choose(scenario)).kind, 'done');
  });

  test(`${difficulty} AI avoids adding a useless legendary target even with spare Strive mana`, async () => {
    const { game, bot, spell } = setup(difficulty, ['Rootha, Mastering the Moment', 'Air Elemental'], { mana: 5 });
    assert.equal(await game.castSpell(bot, spell, { from: 'hand' }), true);
    const stackObject = game.stack.find(item => item.card === spell);
    assert.deepEqual(Array.from(stackObject.targets.flat(), card => card.name), ['Air Elemental']);
    assert.equal(stackObject.manaSpent, 2);
    await resolveAll(game);
    assert.equal(game.creatures(bot).filter(card => card.name === 'Rootha, Mastering the Moment').length, 1);
    assert.equal(game.creatures(bot).filter(card => card.isToken).length, 1);
  });

  test(`${difficulty} AI still copies Mulldrifter after combat for its real entry draw`, async () => {
    const scenario = setup(difficulty, ['Mulldrifter'], { phase: 'main2' });
    const { game, bot, spell } = scenario;
    assert.equal((await choose(scenario)).kind, 'cast');
    const libraryBefore = bot.library.length;
    assert.equal(await game.castSpell(bot, spell, { from: 'hand' }), true);
    await resolveAll(game);
    assert.equal(bot.library.length, libraryBefore - 2);
    assert.equal(game.creatures(bot).filter(card => card.isToken && card.name === 'Mulldrifter').length, 1);
  });

  test(`${difficulty} AI pays Strive for free casts and does not count mana of the wrong color`, async () => {
    for (const [mana, targets, paid] of [[0, 1, 0], [3, 2, 3]]) {
      const { game, bot, spell } = setup(difficulty, ['Air Elemental', 'Mulldrifter'], { mana });
      assert.equal(await game.castSpell(bot, spell, { from: 'hand', alt: { free: true } }), true);
      const stackObject = game.stack.find(item => item.card === spell);
      assert.equal(stackObject.striveTargets, targets);
      assert.equal(stackObject.manaSpent, paid);
    }
    const { game, bot, spell } = setup(difficulty, ['Air Elemental', 'Mulldrifter'], { mana: 1 });
    bot.pool.C = 4;
    assert.equal(await game.castSpell(bot, spell, { from: 'hand' }), true);
    assert.equal(game.stack.find(item => item.card === spell).striveTargets, 1, 'five mana with only one red cannot pay for two targets');
    const reduced = setup(difficulty, ['Air Elemental', 'Stormcatch Mentor'], { mana: 2 });
    assert.equal(await reduced.game.castSpell(reduced.bot, reduced.spell, { from: 'hand', alt: { free: true } }), true);
    const discountedSpell = reduced.game.stack.find(item => item.card === reduced.spell);
    assert.equal(discountedSpell.striveTargets, 2, 'the real solver includes Stormcatch Mentor reducing the extra cost');
    assert.equal(discountedSpell.manaSpent, 2);
  });
}

test('copy retargeting preserves two targets without charging Strive again', async () => {
  const { game, bot, spell } = setup('hard', ['Air Elemental', 'Mulldrifter'], { mana: 0 });
  const ai = bot.controller;
  bot.controller = { decide: async (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'newTargets' ? 'yes' : ai.decide(g, q) };
  bot.hand.splice(bot.hand.indexOf(spell), 1);
  spell.zone = 'stack';
  const original = {
    kind: 'spell', card: spell, name: spell.name, ctrl: bot, targets: [game.creatures(bot)],
    targetSpecs: game.spellTargetSpecs(spell, {}, bot), castOpts: {},
  };
  game.stack.push(original);
  const copy = await game.copySpell(original, bot, { mayNewTargets: true });
  assert.equal(copy.targetMode, 'new');
  assert.equal(copy.targets.flat().length, 2);
  assert.equal(game.lands(bot).length, 0);
  assert.equal(Object.values(bot.pool).every(value => value === 0), true);
  await resolveAll(game);
  assert.equal(game.creatures(bot).filter(card => card.isToken).length, 4);
});

test('human zero-target Twinflame remains legal and resolves without a copy', async () => {
  const { game, bot, spell } = setup('normal');
  bot.isAI = false;
  bot.controller = { decide: async (_, query) => query.type === 'chooseTargets' ? [] : { kind: 'pass' } };
  assert.equal(await game.castSpell(bot, spell, { from: 'hand' }), true);
  const stackObject = game.stack.find(item => item.card === spell);
  assert.equal(stackObject.striveTargets, 0);
  assert.equal(stackObject.manaSpent, 2);
  await resolveAll(game);
  assert.equal(spell.zone, 'graveyard');
  assert.equal(game.creatures(bot).length, 0);
});
