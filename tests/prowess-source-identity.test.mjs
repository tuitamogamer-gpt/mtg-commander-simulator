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
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function makeGame(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Prowess local bot' : 'Prowess human',
    { name: `${role} Prowess fixture` },
    null,
    role === 'ai',
  );
  game.addPlayer('Opponent', { name: 'Opponent fixture' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => fallbackDecision(query) };
  game.turnPlayer = player;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  // Keep the cast spell and Prowess trigger on the real Stack so the fixture
  // can model a blink response before the trigger resolves.
  game.priorityRound = async () => {};
  return { game, player };
}

function putActual(game, player, name, zone) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = zone;
  card.ctrl = player;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

function mainWindow(game, player) {
  return {
    type: 'main', player,
    casts: game.castableList(player), acts: game.activatableList(player), lands: [],
    phase: game.phase,
  };
}

async function castActualSolRing(game, player, source, role) {
  const solRing = putActual(game, player, 'Sol Ring', 'hand');
  if (role === 'ai') {
    player.pool.C = 1;
    const decision = await player.controller.decide(game, mainWindow(game, player));
    assert.equal(decision.kind, 'cast', 'genuine hard local AI chooses a cast action');
    assert.equal(decision.card, solRing, 'genuine hard local AI chooses actual Sol Ring');
    assert.equal(await game.performAction(player, decision), true);
  } else {
    assert.equal(await game.castSpell(player, solRing, {
      from: 'hand', alt: { free: true },
    }), true, 'scripted human casts actual Sol Ring through the engine');
  }

  const trigger = game.stack.findLast(entry => entry.kind === 'trigger' &&
    entry.srcCard === source && /Prowess/.test(entry.name));
  assert.ok(trigger, `${source.name}: Prowess trigger is on the real Stack`);
  assert.equal(trigger.ctx.sourceZoneVersion, source.zoneVersion,
    `${source.name}: trigger snapshots the exact source object version`);
  return trigger;
}

test('unchanged ordinary and token Prowess sources still resolve for human and genuine local AI', async () => {
  {
    const { game, player } = makeGame('human', 9341);
    const skaab = putActual(game, player, 'Ingenious Skaab', 'battlefield');
    assert.ok(skaab.def.triggers.some(trigger => trigger.desc === 'Prowess'));
    await castActualSolRing(game, player, skaab, 'human');
    await game.resolveTop();
    assert.equal(skaab.power, 3);
    assert.equal(skaab.toughness, 4);
  }

  {
    const { game, player } = makeGame('ai', 9342);
    assert.ok(player.controller instanceof MTG.AIController);
    const [token] = await game.makeTokens('dragonElemental', player);
    assert.equal(token.isToken, true);
    assert.ok(token.def.triggers.some(trigger => trigger.desc === 'Prowess'));
    await castActualSolRing(game, player, token, 'ai');
    await game.resolveTop();
    assert.equal(token.power, 5);
    assert.equal(token.toughness, 5);
  }
});

test('actual Ingenious Skaab old Prowess trigger ignores its blinked object for human and genuine local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = makeGame(role, 9350 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const skaab = putActual(game, player, 'Ingenious Skaab', 'battlefield');
    const trigger = await castActualSolRing(game, player, skaab, role);
    const effectsBefore = game.untilEffects.length;

    await game.move(skaab, 'exile');
    await game.move(skaab, 'battlefield', { ctrl: player });
    assert.equal(skaab.zone, 'battlefield');
    assert.notEqual(skaab.zoneVersion, trigger.ctx.sourceZoneVersion,
      'blink makes the reused CardInst a new battlefield object');
    await game.resolveTop();

    assert.equal(skaab.power, 2, `${role}: old trigger does not pump new Ingenious Skaab`);
    assert.equal(skaab.toughness, 3, `${role}: new Ingenious Skaab keeps printed toughness`);
    assert.equal(game.untilEffects.length, effectsBefore,
      `${role}: stale trigger creates no temporary pump effect`);
  }
});

test('genuine local AI Prowess token path ignores a source that left the battlefield', async () => {
  const { game, player } = makeGame('ai', 9360);
  assert.ok(player.controller instanceof MTG.AIController);
  const [token] = await game.makeTokens('dragonElemental', player);
  await castActualSolRing(game, player, token, 'ai');
  const effectsBefore = game.untilEffects.length;

  await game.move(token, 'exile');
  assert.notEqual(token.zone, 'battlefield');
  await game.resolveTop();

  assert.equal(game.untilEffects.length, effectsBefore,
    'departed token receives no stale Prowess effect');
});
