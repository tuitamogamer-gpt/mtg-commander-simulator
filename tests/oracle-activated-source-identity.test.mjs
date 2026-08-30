import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function choose(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 1);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 1);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function setup(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 3, difficulty: 'hard' });
  const player = game.addPlayer(role === 'ai' ? 'Ability local bot' : 'Ability human', { name: role }, null, role === 'ai');
  game.addPlayer('Opponent', { name: 'opponent' }, { decide: async (currentGame, query) => choose(query) }, false);
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => choose(query) };
  game.turnPlayer = player;
  game.turnNo = 2;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player };
}

function permanent(game, player, name) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = 'battlefield';
  card.ctrl = player;
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

async function blink(game, player, card) {
  await game.move(card, 'exile');
  await game.move(card, 'battlefield', { ctrl: player });
}

test('actual self-keyword ability ignores a blinked Advanced Hoverguard for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = setup(role, 7610 + index);
    const source = permanent(game, player, 'Advanced Hoverguard');
    player.pool.U = 1;
    const entry = game.activatableList(player).find(candidate => candidate.card === source && candidate.ability);
    assert.ok(entry);
    assert.equal(await game.activateAbility(player, entry), true);
    const ability = game.stack.at(-1);
    assert.equal(ability.ctx.sourceZoneVersion, source.zoneVersion);

    await blink(game, player, source);
    await game.resolveTop();

    assert.equal(source.kw('shroud'), false, `${role}: old ability cannot grant the new object shroud`);
  }
});

test('actual Crew ability ignores a blinked Aradara Express for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = setup(role, 7630 + index);
    const vehicle = permanent(game, player, 'Aradara Express');
    permanent(game, player, 'Impervious Greatwurm');
    const entry = game.activatableList(player).find(candidate => candidate.card === vehicle && candidate.crew);
    assert.ok(entry);
    assert.equal(await game.activateAbility(player, entry), true);
    const ability = game.stack.at(-1);
    assert.equal(ability.ctx.sourceZoneVersion, vehicle.zoneVersion);

    await blink(game, player, vehicle);
    await game.resolveTop();

    assert.equal(vehicle.is('Creature'), false, `${role}: old Crew cannot animate the new Vehicle object`);
    assert.notEqual(vehicle.meta.crewedTurn, game.turnNo);
  }
});

test('actual Equip ability ignores a blinked +2 Mace source for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = setup(role, 7650 + index);
    const equipment = permanent(game, player, '+2 Mace');
    const host = permanent(game, player, 'Grizzly Bears');
    player.pool.C = 3;
    const entry = game.activatableList(player).find(candidate => candidate.card === equipment && candidate.equip);
    assert.ok(entry);
    assert.equal(await game.activateAbility(player, entry), true);
    const ability = game.stack.at(-1);
    assert.equal(ability.ctx.sourceZoneVersion, equipment.zoneVersion);

    await blink(game, player, equipment);
    await game.resolveTop();

    assert.equal(equipment.attachedTo, null, `${role}: old Equip cannot attach the new Equipment object`);
    assert.equal(host.attachments.includes(equipment.iid), false);
    assert.equal(host.power, 2);
  }
});
