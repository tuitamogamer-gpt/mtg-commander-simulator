import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fixture() {
  const game = new MTG.Game({ seed: 814413, paced: false });
  const controller = { decide: async (_, query) => {
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'chooseX') return 2;
    if (query.type === 'chooseTargets') return query.candidates.slice(0, 1);
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'chooseOption') return query.options[0]?.key;
    return [];
  } };
  const players = Array.from({ length: 4 }, (_, i) =>
    game.addPlayer(`Seat ${i}`, { name: 'Test' }, controller, false));
  game.turnPlayer = players[0]; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  players[0].pool.R = 10;
  put(game, players[0], 'Imodane, the Pyrohammer');
  return { game, players };
}

function put(game, player, definition, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : definition, player);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

async function settle(game) {
  for (let n = 0; n < 30 && (game.pendingTriggers.length || game.stack.length); n++) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(game.pendingTriggers.length, 0);
  assert.equal(game.stack.length, 0);
}

for (const targetCount of [1, 2]) {
  test(`Shellshock resolves ${targetCount} real targets with empty optional opponent slots`, async () => {
    const { game, players: [caster, ...opponents] } = fixture();
    const victims = opponents.slice(0, targetCount).map(player => put(game, player, 'Air Elemental'));
    const spell = put(game, caster, 'Shellshock', 'hand');
    const life = opponents.map(player => player.life);
    const mana = caster.pool.R;
    assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);
    assert.ok(caster.pool.R < mana, 'Shellshock pays its mana cost');
    const stackSpell = game.stack.find(row => row.card === spell);
    assert.equal(stackSpell.targets.length, 3);
    assert.equal(stackSpell.targets.filter(target => target == null).length, 3 - targetCount);
    await settle(game);
    assert.ok(victims.every(card => card.damage === 2));
    assert.equal(spell.zone, 'graveyard');
    assert.equal(game.bf().filter(card => card.ctrl === caster && card.hasSub('Mutagen')).length, targetCount);
    opponents.forEach((player, index) => assert.equal(player.life, life[index] - (targetCount === 1 ? 2 : 0),
      'Imodane triggers only when exactly one actual creature is targeted'));
  });
}

test('a player target still prevents the single-creature spell-damage trigger', async () => {
  const { game, players: [caster, opponent] } = fixture();
  const victim = put(game, opponent, 'Air Elemental');
  const spell = put(game, caster, {
    name: 'Creature and player target witness', types: ['Instant'], super: [], subtypes: [], cost: '{R}', oracle: '',
    targets: [MTG.T.creature(), MTG.T.player()],
    resolve: async ctx => {
      await ctx.g.damageCreature(ctx.src, ctx.targets[0], 2);
      await ctx.g.gainLife(ctx.targets[1], 1, ctx.src);
    },
  }, 'hand');
  caster.controller = { decide: async (_, query) => query.type === 'chooseTargets'
    ? [query.candidates.includes(victim) ? victim : opponent]
    : query.type === 'priority' ? { kind: 'pass' } : [] };
  const life = opponent.life;
  assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);
  await settle(game);
  assert.equal(victim.damage, 2);
  assert.equal(opponent.life, life + 1, 'the additional player target excludes Imodane');
});
