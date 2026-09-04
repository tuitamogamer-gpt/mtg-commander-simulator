import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseTargets') {
    const changeling = query.candidates.find(card => card.name === 'Game-Trail Changeling');
    return changeling ? [changeling] : query.candidates.slice(0, query.min || 0);
  }
  if (query.type === 'chooseCards') return query.from.slice(0, query.aiHint?.kind === 'recur' ? 1 : query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function rulesGame() {
  const game = new MTG.Game({ seed: 1702, paced: false, maxTurns: 20 });
  const player = game.addPlayer('Changeling bot', { name: 'Changeling regression' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent deck' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 50) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 50, 'Changeling regression stack did not settle');
}

test('imported Game-Trail Changeling has every creature subtype in hand, library, and graveyard', () => {
  const { player } = rulesGame();
  const definition = MTG.DEFS['Game-Trail Changeling'];

  assert.equal(definition.changeling, true, 'Oracle compiler exposes definition-level Changeling');
  assert.ok(definition.oracleImplementation.some(operation => operation.kind === 'mechanic-changeling'));

  for (const zone of ['hand', 'library', 'graveyard']) {
    const card = inZone(player, 'Game-Trail Changeling', zone);
    assert.equal(card.cur, null, `${zone}: no battlefield-derived characteristics are required`);
    assert.equal(card.hasSub('Shapeshifter'), true, `${zone}: printed subtype remains present`);
    assert.equal(card.hasSub('Elemental'), true, `${zone}: Changeling supplies Elemental`);
    assert.equal(card.hasSub('Elf'), true, `${zone}: Changeling supplies Elf`);
    assert.equal(card.hasSub('Equipment'), false, `${zone}: noncreature subtypes remain excluded`);
  }
});

test('Horde of Notions offers and resolves Game-Trail Changeling through its real graveyard target path', async () => {
  const { game, player } = rulesGame();
  const horde = permanent(game, player, 'Horde of Notions');
  const changeling = inZone(player, 'Game-Trail Changeling', 'graveyard');
  const ability = horde.def.abilities[0];
  player.pool.W = 1;
  player.pool.U = 1;
  player.pool.B = 1;
  player.pool.R = 1;
  player.pool.G = 1;

  assert.ok(game.legalTargets(ability.targets[0], horde, player).includes(changeling),
    'real Horde target filter sees the graveyard Changeling as an Elemental');

  const entry = game.activatableList(player).find(action => action.card === horde && action.ability === ability);
  assert.ok(entry, 'the shared human/AI activatable list exposes Horde with the Changeling target');
  const actionWindow = { type: 'main', player, casts: [], acts: [entry], lands: [], phase: game.phase };
  const view = MTG.createBotPlayerView(game, player.idx, actionWindow);
  assert.ok(MTG.generateLegalActions(view).some(action => action.kind === 'activate' &&
    action.entry.card.iid === horde.iid), 'the local AI legal-action generator retains the Horde activation');

  assert.equal(await game.activateAbility(player, entry, [changeling]), true);
  assert.ok(['W', 'U', 'B', 'R', 'G', 'C'].every(color => player.pool[color] === 0),
    'Horde activation spends exactly WUBRG');
  await resolveAll(game);

  assert.equal(changeling.zone, 'battlefield', 'Horde casts the targeted Changeling for free');
  assert.ok(game.battlefield.includes(changeling));
  assert.equal(changeling.hasSub('Elemental'), true, 'Changeling identity persists after resolving');
});

test('actual Lignify suppresses battlefield Changeling but not its new graveyard object for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const game = new MTG.Game({ seed: 1720 + index, paced: false, maxTurns: 5, difficulty: 'hard' });
    const player = game.addPlayer(role === 'ai' ? 'Changeling local bot' : 'Changeling human', { name: role }, null, role === 'ai');
    const opponent = game.addPlayer('Lignify opponent', { name: 'opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    player.controller = role === 'ai'
      ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
      : { decide: async (currentGame, query) => fallbackDecision(query) };
    game.turnPlayer = opponent;
    game.turnNo = 5;
    game.phase = 'main1';
    game.step = 'main';

    const changeling = permanent(game, player, 'Game-Trail Changeling');
    const lignify = permanent(game, opponent, 'Lignify');
    assert.equal(changeling.hasSub('Elemental'), true);
    assert.equal(changeling.hasSub('Elf'), true);
    assert.equal(await game.attach(lignify, changeling), true);

    assert.equal(changeling.cur.abilitiesDisabled, true);
    assert.deepEqual(Array.from(changeling.cur.subtypes), ['Treefolk']);
    assert.equal(changeling.hasSub('Treefolk'), true);
    assert.equal(changeling.hasSub('Elemental'), false, `${role}: removed Changeling CDA supplies no Elemental type`);
    assert.equal(changeling.hasSub('Elf'), false, `${role}: removed Changeling CDA supplies no Elf type`);

    await game.move(changeling, 'graveyard');
    assert.equal(changeling.hasSub('Elemental'), true, `${role}: printed Changeling applies to the new graveyard object`);
    assert.equal(changeling.hasSub('Elf'), true);
    assert.equal(changeling.hasSub('Equipment'), false);
  }
});

test('actual Lignify removes printed must-attack for human and local AI combat declarations', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const game = new MTG.Game({ seed: 1740 + index, paced: false, maxTurns: 5, difficulty: 'hard' });
    const player = game.addPlayer(role === 'ai' ? 'Must-attack local bot' : 'Must-attack human', { name: role }, null, role === 'ai');
    const opponent = game.addPlayer('Must-attack opponent', { name: 'opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    player.controller = role === 'ai'
      ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
      : { decide: async (currentGame, query) => fallbackDecision(query) };
    let attackerQuery = null;
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (currentGame, query) => {
      if (query.type === 'attackers') attackerQuery = query;
      return decide(currentGame, query);
    };
    game.turnPlayer = player;
    game.turnNo = 5;
    game.phase = 'main1';
    game.step = 'main';
    game.priorityRound = async () => {};

    const raider = permanent(game, player, 'Deathbellow Raider');
    assert.equal(game.isForcedToAttack(raider), true, `${role}: printed must-attack is active normally`);
    const lignify = permanent(game, opponent, 'Lignify');
    assert.equal(await game.attach(lignify, raider), true);
    assert.equal(raider.cur.abilitiesDisabled, true);
    assert.equal(game.isForcedToAttack(raider), false, `${role}: ability loss removes printed must-attack`);

    await game.combatPhase(player);
    assert.ok(attackerQuery, `${role}: actual combat declaration query was reached`);
    assert.equal(attackerQuery.forced.includes(raider), false,
      `${role}: the human/local-AI combat path does not force the Lignified creature`);
  }
});
