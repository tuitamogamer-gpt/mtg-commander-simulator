import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function scriptedDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function makeGame(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Oracle local bot' : 'Oracle scripted human',
    { name: `${role} self-counter fixture` },
    null,
    role === 'ai',
  );
  game.addPlayer(
    'Oracle opponent',
    { name: 'opponent fixture' },
    { decide: async (currentGame, query) => scriptedDecision(query) },
    false,
  );
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => scriptedDecision(query) };
  game.turnPlayer = player;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = 'main';
  // The test needs the cast trigger left on Stack so it can model a response.
  game.priorityRound = async () => {};
  return { game, player };
}

function putCard(game, player, name, zone) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = zone;
  if (zone === 'battlefield') {
    card.ctrl = player;
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
  } else {
    player[zone].push(card);
  }
  return card;
}

async function castNoncreatureAndGetTrigger(game, player, source) {
  const spell = putCard(game, player, 'Sol Ring', 'hand');
  assert.equal(await game.castSpell(player, spell, {
    from: 'hand', alt: { free: true },
  }), true, `${player.name} casts an actual noncreature spell`);
  const trigger = game.stack.at(-1);
  assert.equal(trigger?.kind, 'trigger', `${source.name}: trigger is put on the real Stack`);
  assert.equal(trigger.srcCard, source, `${source.name}: Stack trigger retains its source`);
  assert.equal(trigger.ctx.sourceZoneVersion, source.zoneVersion,
    `${source.name}: trigger snapshots the battlefield object version`);
  return trigger;
}

test('actual Pyroceratops and Sprite Dragon self-counters resolve for live human/AI-controlled sources', async () => {
  for (const [index, scenario] of [
    { role: 'human', name: 'Pyroceratops' },
    { role: 'ai', name: 'Sprite Dragon' },
  ].entries()) {
    const { game, player } = makeGame(scenario.role, 7310 + index);
    if (scenario.role === 'ai') {
      assert.ok(player.controller instanceof MTG.AIController,
        'Sprite Dragon is controlled by the genuine local AIController');
    }
    const source = putCard(game, player, scenario.name, 'battlefield');
    assert.ok(source.def.oracleContracts.includes('noncreature-cast-counter-self'),
      `${scenario.name}: actual imported Oracle contract is active`);

    await castNoncreatureAndGetTrigger(game, player, source);
    await game.resolveTop();

    assert.equal(source.zone, 'battlefield');
    assert.equal(source.counters['+1/+1'], 1,
      `${scenario.name}: unchanged battlefield object gets its printed counter`);
  }
});

test('actual self-counter triggers ignore sources that left or became a new battlefield object', async () => {
  {
    const { game, player } = makeGame('human', 7320);
    const source = putCard(game, player, 'Pyroceratops', 'battlefield');
    await castNoncreatureAndGetTrigger(game, player, source);

    await game.move(source, 'graveyard');
    assert.equal(source.zone, 'graveyard');
    await game.resolveTop();

    assert.equal(source.counters['+1/+1'] || 0, 0,
      'Pyroceratops cannot receive its old trigger counter in the graveyard');
  }

  {
    const { game, player } = makeGame('ai', 7321);
    assert.ok(player.controller instanceof MTG.AIController,
      'Sprite Dragon leave-and-return path uses the genuine local AIController');
    const source = putCard(game, player, 'Sprite Dragon', 'battlefield');
    const trigger = await castNoncreatureAndGetTrigger(game, player, source);

    await game.move(source, 'exile');
    await game.move(source, 'battlefield', { ctrl: player });
    assert.equal(source.zone, 'battlefield');
    assert.notEqual(source.zoneVersion, trigger.ctx.sourceZoneVersion,
      'blink creates a new battlefield-object version before resolution');
    await game.resolveTop();

    assert.equal(source.counters['+1/+1'] || 0, 0,
      'Sprite Dragon new object cannot receive the old object trigger counter');
  }
});
