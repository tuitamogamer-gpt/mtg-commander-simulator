import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function setup(difficulty = 'hard', pod = false) {
  const game = new MTG.Game({ seed: 8371, paced: false, maxTurns: 100 });
  const players = ['Survival bot', 'Weak rival', 'Poison rival'].map(name =>
    game.addPlayer(name, { name: `${name} deck` }, null, true));
  for (const player of players) player.controller = new MTG.AIController(player, { difficulty, style: 'balanced' });
  if (!pod) players[2].lost = true;
  game.turnNo = 35;
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  return { game, players, difficulty };
}

async function castActual(game, player, name) {
  assert.ok(MTG.DEFS[name], `${name} is an actual installed card`);
  game.turnPlayer = player;
  game.phase = 'main1';
  game.step = 'main';
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 30;
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = 'hand';
  player.hand.push(card);
  assert.equal(await game.castSpell(player, card, { from: 'hand' }), true, `${name} really casts`);
  while (game.stack.length || game.pendingTriggers.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(card.zone, 'battlefield');
  card.sick = false;
  return card;
}

function prepareAttack(game, attacker, defender) {
  game.turnPlayer = attacker.ctrl;
  game.phase = 'combat';
  game.step = 'blockers';
  attacker.attacking = defender;
  attacker.tapped = true;
  game.combat = { attackers: [attacker] };
  game.recalc();
}

async function chooseBlocks(game, defender, attacker, blockers, difficulty) {
  const decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: defender.idx, difficulty,
    actionWindow: { type: 'blockers', player: defender, attackers: [attacker], potential: blockers },
  });
  assert.equal(decision.action.kind, 'declareBlockers');
  assert.equal(decision.log.fallback, false, 'actual local AI chooses without fallback');
  assert.ok(decision.action._combatScore > -50000, 'the selected combat forecast predicts survival');
  return decision.action.assignments;
}

async function resolveCombat(game, attacker, assignments) {
  for (const { blocker, attacker: target } of assignments) {
    assert.equal(game.canBlock(blocker, target), true);
    blocker.blocking = target.iid;
    target.blockedBy.push(blocker);
    target.wasBlocked = true;
  }
  if ([attacker, ...assignments.map(item => item.blocker)].some(card => card.kw('first strike') || card.kw('double strike'))) {
    await game.combatDamage(attacker.ctrl, 'first');
  }
  await game.combatDamage(attacker.ctrl, 'normal');
  assert.equal(game.stack.length, 0);
  assert.equal(game.pendingTriggers.length, 0);
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const name of ['Plague Stinger', 'Rustrazor Butcher']) {
    for (const byToughness of [false, true]) {
      for (const existingCounters of [0, 1]) {
        test(`${difficulty}: ${name} first-strike counters reduce ${byToughness ? 'toughness' : 'power'} damage with ${existingCounters} existing counter`, async () => {
          const { game, players: [bot, enemy] } = setup(difficulty);
          const blocker = await castActual(game, bot, name);
          MTG.E.pumpUntilEOT(game, blocker, 2 - blocker.power, 5 - blocker.toughness, ['first strike']);
          const attacker = await castActual(game, enemy, 'Fencing Ace');
          const initialPower = byToughness ? 8 : 4;
          MTG.E.pumpUntilEOT(game, attacker,
            initialPower + existingCounters - attacker.power,
            4 + existingCounters - attacker.toughness, ['trample']);
          if (existingCounters) game.addCounters(attacker, '-1/-1', existingCounters);
          if (byToughness) await castActual(game, enemy, 'Assault Formation');
          bot.life = 2;
          prepareAttack(game, attacker, bot);
          assert.equal(attacker.power, initialPower);
          assert.equal(attacker.toughness, 4);
          assert.equal(game.dmgAmount(attacker, 'first'), 4);

          // The same live position and a real AI simulation clone must agree.
          // Existing counters are already part of both cards' current stats.
          const clone = MTG.cloneGameForAISimulation(game, 8871);
          const clonedBot = clone.players.find(player => player.idx === bot.idx);
          const clonedAttacker = clone.byIid(attacker.iid);
          const clonedBlocker = clone.byIid(blocker.iid);
          const original = await chooseBlocks(game, bot, attacker, [blocker], difficulty);
          const simulated = await chooseBlocks(clone, clonedBot, clonedAttacker, [clonedBlocker], difficulty);
          assert.equal(original.length, 1);
          assert.equal(simulated.length, 1);
          assert.equal(attacker.counters['-1/-1'] || 0, existingCounters, 'forecast never mutates live counters');
          assert.equal(clonedAttacker.counters['-1/-1'] || 0, existingCounters, 'forecast never mutates clone counters');

          await resolveCombat(game, attacker, original);
          await resolveCombat(clone, clonedAttacker, simulated);
          for (const [player, threat, shield] of [[bot, attacker, blocker], [clonedBot, clonedAttacker, clonedBlocker]]) {
            assert.equal(player.lost, false);
            assert.equal(player.life, 1, 'only one damage tramples over in the normal step');
            assert.equal(player.poison, 0);
            assert.equal(threat.power, initialPower - 2);
            assert.equal(threat.toughness, 2);
            assert.equal(threat.counters['-1/-1'], existingCounters + 2);
            assert.equal(shield.zone, 'graveyard', 'the bot sacrifices the blocker to survive');
          }
        });
      }
    }
  }

  for (const strikes of [1, 2]) {
    for (const infect of [false, true]) {
      test(`${difficulty}: toxic ${infect ? 'plus infect' : 'alone'} is lethal over ${strikes} actual combat hit(s)`, async () => {
        const { game, players: [bot, enemy] } = setup(difficulty);
        const attacker = await castActual(game, enemy, 'Bilious Skulldweller');
        const keywords = [];
        if (strikes === 2) keywords.push('double strike');
        if (infect) keywords.push('infect');
        MTG.E.pumpUntilEOT(game, attacker, 0, 0, keywords);
        const blocker = await castActual(game, bot, 'Wall of Air');
        MTG.E.pumpUntilEOT(game, blocker, -blocker.power, 1 - blocker.toughness);
        const initialPoison = 10 - strikes * (infect ? 2 : 1);
        bot.poison = initialPoison;
        prepareAttack(game, attacker, bot);

        const unblocked = MTG.cloneGameForAISimulation(game, 8891);
        const unblockedBot = unblocked.players.find(player => player.idx === bot.idx);
        await resolveCombat(unblocked, unblocked.byIid(attacker.iid), []);
        assert.equal(unblockedBot.poison, 10, 'actual engine confirms the unblocked forecast is lethal');
        assert.equal(unblockedBot.lost, true);
        assert.equal(unblockedBot.life, infect ? 40 : 40 - strikes, 'infect replaces life damage, toxic does not');

        const assignments = await chooseBlocks(game, bot, attacker, [blocker], difficulty);
        assert.equal(assignments.length, 1, 'AI pays for the block to prevent poison defeat');
        await resolveCombat(game, attacker, assignments);
        assert.equal(bot.poison, initialPoison);
        assert.equal(bot.lost, false);
        assert.equal(blocker.zone, 'graveyard');
      });
    }
  }

  for (const name of ['Plague Stinger', 'Bilious Skulldweller']) {
    test(`${difficulty}: preserves a blocker against ${name} poison crackback instead of eliminating one rival`, async () => {
      const { game, players: [bot, weak, strong] } = setup(difficulty, true);
      const blocker = await castActual(game, bot, 'Storm Crow');
      const threat = await castActual(game, strong, name);
      bot.poison = 9;
      weak.life = 1;
      threat.tapped = true;
      game.turnPlayer = bot;
      game.phase = 'combat';
      game.step = 'attackers';
      game.recalc();
      const assignments = await bot.controller.decide(game, {
        type: 'attackers', player: bot, eligible: [blocker], opponents: [weak, strong], forced: [],
      });
      assert.equal(assignments.length, 0, 'a partial elimination cannot justify next-turn poison defeat');
      assert.equal(game.aiDecisionLog.at(-1).fallback, false);

      threat.tapped = false;
      prepareAttack(game, threat, bot);
      const blocks = await chooseBlocks(game, bot, threat, [blocker], difficulty);
      assert.equal(blocks.length, 1);
      await resolveCombat(game, threat, blocks);
      assert.equal(bot.poison, 9, 'the retained blocker really prevents the lethal hit');
      assert.equal(bot.lost, false);
    });
  }
}
