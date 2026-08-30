import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options.find(option => option.key === 'yes')?.key || query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function gameFor(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 10, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Oracle local bot' : 'Oracle scripted human',
    { name: `${role} Storm and Surveil regression` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer('Oracle opponent', { name: 'Oracle opponent' }, {
    decide: async (currentGame, query) => defaultDecision(query),
  }, false);
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => defaultDecision(query) };
  game.turnNo = 8;
  game.turnPlayer = player;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function actual(game, player, name, zone = 'battlefield') {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.ctrl = player;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 50) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 50, 'Storm/Surveil regression stack settled');
}

test('actual Reaping the Graves Storm spreads three zone-changing targets for hard local AI', async () => {
  const { game, player } = gameFor('ai', 9511);
  assert.ok(player.controller instanceof MTG.AIController);
  const creatures = [
    actual(game, player, 'Autochthon Wurm', 'graveyard'),
    actual(game, player, 'Colossal Dreadmaw', 'graveyard'),
    actual(game, player, 'Grizzly Bears', 'graveyard'),
  ];
  const reaping = actual(game, player, 'Reaping the Graves', 'hand');
  player.turnState.spellsCast = 2;

  assert.equal(await game.castSpell(player, reaping, { from: 'hand', alt: { free: true } }), true);
  assert.deepEqual(Array.from(game.stack, item => item.kind), ['spell', 'trigger']);
  assert.match(game.stack.at(-1)?.name || '', /Storm/);

  await game.resolveTop();
  const stormSpells = game.stack.filter(item => item.kind === 'spell' && item.card === reaping);
  assert.equal(stormSpells.length, 3, 'original plus two copies exist after the separate Storm trigger resolves');
  const targetIids = stormSpells.flatMap(item => (item.targets || []).flat()).map(card => card.iid);
  assert.equal(new Set(targetIids).size, 3, 'zone-moving Storm copies use three distinct graveyard objects');
  assert.deepEqual(new Set(targetIids), new Set(creatures.map(card => card.iid)));

  await settle(game);
  assert.ok(creatures.every(card => card.zone === 'hand'), 'all three creature cards return to hand');
  assert.equal(reaping.zone, 'graveyard');
  assert.equal((game.aiDecisionLog || []).filter(entry => entry.playerId === player.idx).some(entry => entry.fallback), false);
});

test('actual Grapeshot Storm spreads damage after each opposing creature has lethal assigned', async () => {
  const { game, player, opponent } = gameFor('ai', 9512);
  const victims = [
    actual(game, opponent, 'Deeproot Champion'),
    actual(game, opponent, 'Cloud Sprite'),
    actual(game, opponent, 'Battlefly Swarm'),
  ];
  const grapeshot = actual(game, player, 'Grapeshot', 'hand');
  player.turnState.spellsCast = 2;

  assert.equal(await game.castSpell(player, grapeshot, { from: 'hand', alt: { free: true } }), true);
  await game.resolveTop();
  const stormSpells = game.stack.filter(item => item.kind === 'spell' && item.card === grapeshot);
  assert.equal(stormSpells.length, 3);
  const targetIids = stormSpells.flatMap(item => (item.targets || []).flat())
    .filter(target => target instanceof MTG.CardInst).map(card => card.iid);
  assert.equal(new Set(targetIids).size, 3, 'each 1-damage object covers a different 1-toughness creature');
  assert.deepEqual(new Set(targetIids), new Set(victims.map(card => card.iid)));

  await settle(game);
  assert.ok(victims.every(card => card.zone === 'graveyard'), 'no Storm damage copy fizzles on an already lethal target');
  assert.equal(opponent.life, 40);
});

test('actual Otherworldly Gaze batches three Surveil lands into one Gitrog trigger for human and hard local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = gameFor(role, 9520 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    else {
      player.controller = {
        decide: async (currentGame, query) => query.type === 'scry' && query.surveil
          ? { top: [], bottom: query.cards.slice() }
          : defaultDecision(query),
      };
    }

    actual(game, player, 'The Gitrog Monster');
    for (let land = 0; land < 6; land++) actual(game, player, 'Forest');
    actual(game, player, 'Grizzly Bears', 'library');
    const surveilled = [
      actual(game, player, 'Azorius Guildgate', 'library'),
      actual(game, player, 'Blasted Landscape', 'library'),
      actual(game, player, 'Zhalfirin Void', 'library'),
    ];
    const gaze = actual(game, player, 'Otherworldly Gaze', 'hand');

    assert.equal(await game.castSpell(player, gaze, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();
    assert.ok(surveilled.every(card => card.zone === 'graveyard'), `${role}: all three selected lands move to graveyard`);

    await game.flushTriggers();
    const gitrogTriggers = game.stack.filter(item => item.kind === 'trigger' &&
      /The Gitrog Monster.*Jedan ili više landova/.test(item.name || ''));
    assert.equal(gitrogTriggers.length, 1, `${role}: one Surveil instruction creates exactly one Gitrog trigger`);
    assert.equal(game.pendingTriggers.filter(item => /Jedan ili više landova/.test(item.name || item.desc || '')).length, 0);
    if (role === 'ai') {
      assert.ok((game.aiDecisionLog || []).some(entry => entry.playerId === player.idx &&
        /Scry: 0 top \/ 3 bottom/.test(entry.chosen || '')), 'genuine AI chose all three lands for the graveyard');
      assert.equal((game.aiDecisionLog || []).some(entry => entry.playerId === player.idx && entry.fallback), false);
    }
  }
});
