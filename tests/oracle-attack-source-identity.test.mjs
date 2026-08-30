import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function decision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function setup(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 3, difficulty: 'hard' });
  const player = game.addPlayer(role === 'ai' ? 'Attack local bot' : 'Attack human', { name: role }, null, role === 'ai');
  game.addPlayer('Opponent', { name: 'opponent' }, { decide: async (currentGame, query) => decision(query) }, false);
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => decision(query) };
  game.turnPlayer = player;
  game.turnNo = 2;
  game.phase = 'combat';
  game.step = 'attack';
  game.priorityRound = async () => {};
  const source = new MTG.CardInst(MTG.DEFS['Benalish Veteran'], player);
  source.zone = 'battlefield';
  source.ctrl = player;
  source.sick = false;
  game.battlefield.push(source);
  game.recalc();
  return { game, player, source };
}

test('actual Benalish Veteran attack trigger ignores its blinked new object for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, source } = setup(role, 7580 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    await game.emit('attacks', { card: source, player });
    await game.flushTriggers();
    const trigger = game.stack.at(-1);
    assert.equal(trigger?.ctx.sourceZoneVersion, source.zoneVersion);

    await game.move(source, 'exile');
    await game.move(source, 'battlefield', { ctrl: player });
    await game.resolveTop();

    assert.equal(source.power, 2);
    assert.equal(source.toughness, 2);
    assert.equal(game.untilEffects.some(effect => effect.iid === source.iid && effect.kind === 'pump'), false);
  }
});
