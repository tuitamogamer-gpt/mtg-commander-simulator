import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(query, preferredTarget = null) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseTargets') {
    const preferred = preferredTarget && query.candidates.includes(preferredTarget) ? [preferredTarget] : [];
    return preferred.concat(query.candidates.filter(target => !preferred.includes(target)))
      .slice(0, query.min || 1);
  }
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function makeGame(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const player = game.addPlayer(role === 'ai' ? 'Target local bot' : 'Target human', { name: role }, null, role === 'ai');
  const opponent = game.addPlayer('Target opponent', { name: 'opponent' }, null, false);
  opponent.controller = { decide: async (currentGame, query) => defaultDecision(query) };
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => defaultDecision(query, opponent) };
  game.turnPlayer = player;
  game.turnNo = 2;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function putCard(game, player, name, zone) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = zone;
  if (zone === 'battlefield') {
    card.ctrl = player;
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
  } else player[zone].push(card);
  return card;
}

test('actual Afflict fizzles after its creature target blinks for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, opponent } = makeGame(role, 7510 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const victim = putCard(game, opponent, 'Grizzly Bears', 'battlefield');
    putCard(game, player, 'Forest', 'library');
    const spell = putCard(game, player, 'Afflict', 'hand');
    const libraryBefore = player.library.length;

    assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true);
    const stackObject = game.stack.at(-1);
    assert.equal(stackObject?.card, spell);
    assert.equal(stackObject.targetIdentities[0].zoneVersion, victim.zoneVersion);

    await game.move(victim, 'exile');
    await game.move(victim, 'battlefield', { ctrl: opponent });
    assert.notEqual(victim.zoneVersion, stackObject.targetIdentities[0].zoneVersion);
    await game.resolveTop();

    assert.equal(victim.power, 2);
    assert.equal(victim.toughness, 2);
    assert.equal(player.library.length, libraryBefore, `${role}: all-targets-illegal Afflict does not draw`);
    assert.equal(spell.zone, 'graveyard');
  }
});

test('actual Afflict completes draw before SBA kills its 1/1 target', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, opponent } = makeGame(role, 7520 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const victim = putCard(game, opponent, 'Llanowar Elves', 'battlefield');
    putCard(game, player, 'Forest', 'library');
    const spell = putCard(game, player, 'Afflict', 'hand');
    const orderedEvents = [];
    const emit = game.emit.bind(game);
    game.emit = async (name, data) => {
      if (name === 'draw' && data?.player === player) orderedEvents.push('draw');
      if (name === 'dies' && data?.card === victim) orderedEvents.push('dies');
      return emit(name, data);
    };

    assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();

    assert.equal(victim.zone, 'graveyard');
    assert.deepEqual(orderedEvents, ['draw', 'dies'], `${role}: all spell instructions precede SBA`);
  }
});

test('actual Equip ability cannot attach to a blinked new creature object', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = makeGame(role, 7530 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const host = putCard(game, player, 'Grizzly Bears', 'battlefield');
    const equipment = putCard(game, player, 'Bonesplitter', 'battlefield');
    player.pool.C = 1;
    const entry = game.activatableList(player).find(candidate => candidate.card === equipment && candidate.equip);
    assert.ok(entry);
    assert.equal(await game.activateAbility(player, entry), true);
    const ability = game.stack.at(-1);
    assert.equal(ability?.targetIdentities[0].zoneVersion, host.zoneVersion);

    await game.move(host, 'exile');
    await game.move(host, 'battlefield', { ctrl: player });
    await game.resolveTop();

    assert.equal(equipment.attachedTo, null, `${role}: Equip loses the old object target`);
    assert.equal(host.attachments.includes(equipment.iid), false);
  }
});

test('mandatory last-counter Suspend cast does not expose a human Abort cast control', async () => {
  const { game, player, opponent } = makeGame('human', 7550);
  let targetQuery = null;
  player.controller = {
    decide: async (currentGame, query) => {
      if (query.type !== 'chooseTargets') return defaultDecision(query);
      targetQuery = query;
      if (query.cancelable) return { kind: 'cancel' };
      return [opponent];
    },
  };
  const spell = putCard(game, player, 'Rift Bolt', 'exile');
  const lifeBefore = opponent.life;

  assert.equal(await game.castSpell(player, spell, {
    alt: { free: true, suspend: true }, from: 'exile',
  }), true);
  assert.ok(targetQuery, 'the real target proposal is shown');
  assert.equal(targetQuery.cancelable, false, 'Suspend target proposal cannot be aborted');
  await game.resolveTop();

  assert.equal(opponent.life, lifeBefore - 3);
  assert.equal(spell.zone, 'graveyard');
});

test('actual Crashing Footfalls loses Suspend after an exile round-trip for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = makeGame(role, 7560 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const spell = putCard(game, player, 'Crashing Footfalls', 'hand');
    player.pool.G = 1;
    const action = game.activatableList(player).find(candidate => candidate.card === spell && candidate.suspend);
    assert.ok(action, `${role}: actual Suspend special action is available`);
    assert.equal(await game.activateAbility(player, action), true);
    assert.equal(spell.zone, 'exile');
    assert.equal(spell.meta.suspended, 4);

    await game.move(spell, 'graveyard');
    assert.equal(spell.meta.suspended, undefined, `${role}: leaving exile clears Suspend status`);
    await game.move(spell, 'exile');

    const queued = [];
    const queueTrigger = game.queueTrigger.bind(game);
    game.queueTrigger = trigger => {
      queued.push(trigger.name || '');
      return queueTrigger(trigger);
    };
    game.mainPhase = async () => {};
    game.combatPhase = async () => {};
    for (let cardIndex = 0; cardIndex < 8; cardIndex++) putCard(game, player, 'Forest', 'library');
    await game.runTurn();

    assert.equal(spell.zone, 'exile');
    assert.equal(spell.meta.suspended, undefined);
    assert.equal(queued.some(name => /Suspend: remove a time counter/.test(name)), false,
      `${role}: the new exile object creates no stale Suspend upkeep trigger`);
  }
});

test('actual crewed Vehicle uses printed noncreature types after leaving battlefield for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = makeGame(role, 7580 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const vehicle = putCard(game, player, 'Air Response Unit', 'battlefield');
    putCard(game, player, 'Grizzly Bears', 'battlefield');
    const crew = game.activatableList(player).find(candidate => candidate.card === vehicle && candidate.crew);
    assert.ok(crew, `${role}: actual Vehicle offers Crew`);
    assert.equal(await game.activateAbility(player, crew), true);
    await game.resolveTop();
    assert.equal(vehicle.is('Creature'), true, `${role}: Crew makes the battlefield object a creature`);

    await game.move(vehicle, 'graveyard');
    assert.equal(vehicle.is('Artifact'), true);
    assert.equal(vehicle.is('Creature'), false, `${role}: graveyard object uses its printed Vehicle types`);

    const legalCreature = putCard(game, player, 'Llanowar Elves', 'graveyard');
    const disentomb = putCard(game, player, 'Disentomb', 'hand');
    assert.equal(await game.castSpell(player, disentomb, { from: 'hand', alt: { free: true } }), true);
    const chosenTargets = Array.from(game.stack.at(-1)?.targets || []).flat().filter(Boolean);
    assert.deepEqual(chosenTargets.map(card => card.name), ['Llanowar Elves'],
      `${role}: actual Disentomb excludes the stale crewed Vehicle and targets a creature card`);
    await game.resolveTop();

    assert.equal(legalCreature.zone, 'hand');
    assert.equal(vehicle.zone, 'graveyard');
  }
});

test('actual manifested Firebolt restores its printed color after Repulse for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, opponent } = makeGame(role, 7590 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const firebolt = putCard(game, player, 'Firebolt', 'library');
    assert.equal(await game.manifestCard(player, firebolt), firebolt);
    const eye = putCard(game, opponent, 'Eye of Nidhogg', 'battlefield');
    assert.equal(await game.attach(eye, firebolt), true);
    assert.deepEqual(Array.from(firebolt.colors), ['B']);

    putCard(game, opponent, 'Forest', 'library');
    const repulse = putCard(game, opponent, 'Repulse', 'hand');
    opponent.controller = {
      decide: async (currentGame, query) => {
        if (query.type === 'chooseTargets' && query.candidates.includes(firebolt)) return [firebolt];
        return defaultDecision(query);
      },
    };
    assert.equal(await game.castSpell(opponent, repulse, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();

    assert.equal(firebolt.zone, 'hand');
    assert.equal(firebolt.name, 'Firebolt');
    assert.deepEqual(Array.from(firebolt.colors), ['R'], `${role}: hand object uses printed Firebolt color`);

    const gate = putCard(game, opponent, 'Cemetery Gate', 'battlefield');
    gate.damage = 3;
    game.recalc();
    assert.ok(game.legalTargets(firebolt.def.targets[0], firebolt, player).includes(gate),
      `${role}: red Firebolt can legally target protection-from-black Cemetery Gate`);
    if (role === 'human') {
      player.controller = {
        decide: async (currentGame, query) => {
          if (query.type === 'chooseTargets' && query.candidates.includes(gate)) return [gate];
          return defaultDecision(query);
        },
      };
    }
    assert.equal(await game.castSpell(player, firebolt, { from: 'hand', alt: { free: true } }), true);
    assert.equal(game.stack.at(-1)?.targets.flat().includes(gate), true,
      `${role}: actual controller keeps Cemetery Gate as Firebolt's legal target`);
    await game.resolveTop();
    assert.equal(gate.zone, 'graveyard');
  }
});

test('actual manifested Firebolt drops granted deathtouch after Dematerialize for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, opponent } = makeGame(role, 7600 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const firebolt = putCard(game, player, 'Firebolt', 'library');
    await game.manifestCard(player, firebolt);
    const aspect = putCard(game, opponent, 'Aspect of Gorgon', 'battlefield');
    assert.equal(await game.attach(aspect, firebolt), true);
    assert.equal(firebolt.kw('deathtouch'), true);

    const dematerialize = putCard(game, opponent, 'Dematerialize', 'hand');
    opponent.controller = {
      decide: async (currentGame, query) => {
        if (query.type === 'chooseTargets' && query.candidates.includes(firebolt)) return [firebolt];
        return defaultDecision(query);
      },
    };
    assert.equal(await game.castSpell(opponent, dematerialize, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();
    assert.equal(firebolt.zone, 'hand');
    assert.equal(firebolt.kw('deathtouch'), false, `${role}: hand Firebolt drops the old battlefield keyword`);

    const wurm = putCard(game, opponent, 'Autochthon Wurm', 'battlefield');
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (currentGame, query) => {
      if (query.type === 'chooseTargets' && query.candidates.includes(wurm)) return [wurm];
      return decide(currentGame, query);
    };
    assert.equal(await game.castSpell(player, firebolt, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();

    assert.equal(wurm.zone, 'battlefield', `${role}: two red damage has no stale deathtouch`);
    assert.equal(wurm.damage, 2);
  }
});
