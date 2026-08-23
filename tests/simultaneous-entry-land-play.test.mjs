import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function definition(name, extra = {}) {
  return Object.assign({
    name, cost: '{2}', super: [], types: ['Creature'], subtypes: [],
    oracle: '', power: '2', toughness: '2', kws: [], abilities: [],
  }, extra);
}

function decide(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'chooseOption') {
    return query.options.find(option => option.key === 'yes')?.key || query.options[0]?.key;
  }
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, Math.max(1, query.min || 0));
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame() {
  const game = new MTG.Game({ seed: 240824, paced: false, maxTurns: 20 });
  const players = ['Player', 'Opponent'].map((name, index) => game.addPlayer(
    name, { name: `${name} deck` }, { decide: async (g, query) => decide(g, query) }, index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function cardIn(player, defOrName, zone) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, defOrName) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'stack and trigger queue did not settle');
}

async function livingDeathObservation(order) {
  const { game, players: [player] } = rulesGame();
  const resolved = [];
  const observer = name => definition(name, {
    triggers: [{
      on: 'etb', desc: `${name} observes creature entry`,
      filter: (g, self, data) => data.card.is('Creature') && data.card.ctrl === self.ctrl,
      run: async ctx => {
        resolved.push({
          pair: `${ctx.src.name}->${ctx.data.card.name}`,
          present: ctx.g.creatures(ctx.you).map(card => card.name).sort(),
        });
      },
    }],
  });
  const defs = { Alpha: observer('Alpha'), Beta: observer('Beta') };
  for (const name of order) cardIn(player, defs[name], 'graveyard');

  await MTG.DEFS['Living Death'].resolve({ g: game, src: null, you: player });
  const queued = game.pendingTriggers.map(trigger => `${trigger.src.name}->${trigger.data.card.name}`).sort();
  await resolveAll(game);
  return { queued, resolved: resolved.sort((a, b) => a.pair.localeCompare(b.pair)) };
}

test('Living Death batches returns so every ETB observer sees every entrant independent of graveyard order', async () => {
  const expected = ['Alpha->Alpha', 'Alpha->Beta', 'Beta->Alpha', 'Beta->Beta'];
  const forward = await livingDeathObservation(['Alpha', 'Beta']);
  const reverse = await livingDeathObservation(['Beta', 'Alpha']);

  assert.deepEqual(Array.from(forward.queued), expected);
  assert.deepEqual(Array.from(reverse.queued), expected);
  assert.deepEqual(Array.from(forward.resolved, entry => entry.pair), expected);
  assert.deepEqual(Array.from(reverse.resolved, entry => entry.pair), expected);
  for (const entry of [...forward.resolved, ...reverse.resolved]) {
    assert.deepEqual(Array.from(entry.present), ['Alpha', 'Beta']);
  }
});

async function simultaneousReplacementResult(order) {
  const { game, players: [player] } = rulesGame();
  const beastDef = definition('Batch Beast', { subtypes: ['Beast'] });
  const cards = {
    Grumgully: cardIn(player, 'Grumgully, the Generous', 'graveyard'),
    Beast: cardIn(player, beastDef, 'graveyard'),
  };
  player.graveyard.splice(0, player.graveyard.length, ...order.map(name => cards[name]));
  await MTG.DEFS['Living Death'].resolve({ g: game, src: null, you: player });
  return cards.Beast.counters['+1/+1'] || 0;
}

async function simultaneousCopyResult(order) {
  const { game, players: [player] } = rulesGame();
  const beast = cardIn(player, definition('Copy Candidate', { subtypes: ['Beast'] }), 'graveyard');
  const metamorph = cardIn(player, 'Phyrexian Metamorph', 'graveyard');
  const cards = { Beast: beast, Metamorph: metamorph };
  player.graveyard.splice(0, player.graveyard.length, ...order.map(name => cards[name]));
  await MTG.DEFS['Living Death'].resolve({ g: game, src: null, you: player });
  return metamorph.isCopyOf;
}

test('Living Death replacement snapshot excludes simultaneous Grumgully and copy sources in both orders', async () => {
  assert.equal(await simultaneousReplacementResult(['Grumgully', 'Beast']), 0,
    'Grumgully was not on the battlefield before the simultaneous entry event');
  assert.equal(await simultaneousReplacementResult(['Beast', 'Grumgully']), 0);
  assert.equal(await simultaneousCopyResult(['Beast', 'Metamorph']), null,
    'Metamorph cannot copy a creature entering in the same simultaneous event');
  assert.equal(await simultaneousCopyResult(['Metamorph', 'Beast']), null);
});

test('generic battlefield batch defers landfall events and Saga chapters until every entrant is present', async () => {
  const { game, players: [player] } = rulesGame();
  const landfallStates = [];
  const sagaStates = [];
  permanent(game, player, definition('Landfall Observer', {
    cost: '{1}{G}', types: ['Enchantment'], power: undefined, toughness: undefined,
    triggers: [{
      on: 'landfall',
      filter: g => {
        landfallStates.push(g.lands(player).map(card => card.name).sort());
        return false;
      },
      run: async () => {},
    }],
  }));
  const saga = cardIn(player, definition('Batch Saga', {
    cost: '{2}{W}', types: ['Enchantment'], subtypes: ['Saga'], power: undefined, toughness: undefined,
    saga: [{ run: async () => {} }],
  }), 'hand');
  const firstLand = cardIn(player, definition('Batch Land A', {
    cost: null, types: ['Land'], power: undefined, toughness: undefined,
  }), 'hand');
  const secondLand = cardIn(player, definition('Batch Land B', {
    cost: null, types: ['Land'], power: undefined, toughness: undefined,
  }), 'hand');
  const originalQueueTrigger = game.queueTrigger.bind(game);
  game.queueTrigger = trigger => {
    if (trigger.src === saga && /Poglavlje 1/.test(trigger.name)) {
      sagaStates.push(game.bf().map(card => card.name).sort());
    }
    return originalQueueTrigger(trigger);
  };

  await game.moveBattlefieldBatch([saga, firstLand, secondLand]);

  assert.deepEqual(landfallStates.map(names => Array.from(names)), [
    ['Batch Land A', 'Batch Land B'], ['Batch Land A', 'Batch Land B'],
  ]);
  assert.deepEqual(sagaStates.map(names => Array.from(names)), [[
    'Batch Land A', 'Batch Land B', 'Batch Saga', 'Landfall Observer',
  ]]);
});

test('Windbrisk Heights uses authoritative playLand and an additional land-play permission', async () => {
  const { game, players: [player] } = rulesGame();
  const heights = permanent(game, player, 'Windbrisk Heights');
  permanent(game, player, definition('Additional Land Permission', {
    cost: '{1}{G}', types: ['Enchantment'], power: undefined, toughness: undefined, additionalLandPlays: 1,
  }));
  const hidden = cardIn(player, 'Forest', 'exile');
  heights.meta.hideIid = hidden.iid;
  player.turnState.attackedCount = 3;
  player.landsPlayed = player.maxLands;
  player.pool.W = 1;

  let playLandCalls = 0;
  const landEvents = [];
  const originalPlayLand = game.playLand.bind(game);
  const originalEmit = game.emit.bind(game);
  game.playLand = async (...args) => {
    playLandCalls++;
    return originalPlayLand(...args);
  };
  game.emit = async (name, data) => {
    if (name === 'landPlayed') landEvents.push(data);
    return originalEmit(name, data);
  };

  assert.equal(game.landPlayLimit(player), 2);
  const action = game.activatableList(player).find(entry => entry.card === heights && entry.ability);
  assert.ok(action, 'additional land permission must keep the hidden land playable');
  assert.equal(await game.activateAbility(player, action), true);
  await resolveAll(game);

  assert.equal(playLandCalls, 1);
  assert.equal(hidden.zone, 'battlefield');
  assert.equal(player.landsPlayed, 2);
  assert.deepEqual(Array.from(landEvents, event => [event.card.name, event.from]), [['Forest', 'exile']]);
});

test('Evercoat Ursine uses playLand for an open extra drop and rejects a land during combat', async () => {
  {
    const { game, players: [player] } = rulesGame();
    const bear = permanent(game, player, 'Evercoat Ursine');
    permanent(game, player, definition('Additional Land Permission', {
      cost: '{1}{G}', types: ['Enchantment'], power: undefined, toughness: undefined, additionalLandPlays: 1,
    }));
    const hidden = cardIn(player, 'Forest', 'exile');
    bear.meta.hide = [hidden.iid];
    player.landsPlayed = player.maxLands;
    let playLandCalls = 0;
    const originalPlayLand = game.playLand.bind(game);
    game.playLand = async (...args) => {
      playLandCalls++;
      return originalPlayLand(...args);
    };

    await game.emit('combatDamageToPlayer', { card: bear, player: game.players[1], n: 4 });
    await resolveAll(game);
    assert.equal(playLandCalls, 1);
    assert.equal(hidden.zone, 'battlefield');
    assert.equal(player.landsPlayed, 2);
  }

  {
    const { game, players: [player] } = rulesGame();
    game.phase = 'combat';
    const bear = permanent(game, player, 'Evercoat Ursine');
    const hidden = cardIn(player, 'Forest', 'exile');
    bear.meta.hide = [hidden.iid];
    let playLandCalls = 0;
    const originalPlayLand = game.playLand.bind(game);
    game.playLand = async (...args) => {
      playLandCalls++;
      return originalPlayLand(...args);
    };

    await game.emit('combatDamageToPlayer', { card: bear, player: game.players[1], n: 4 });
    await resolveAll(game);
    assert.equal(playLandCalls, 0);
    assert.equal(hidden.zone, 'exile');
    assert.equal(player.landsPlayed, 0);
  }
});

test('AI cycling penalty follows landPlayLimit when an additional land drop is still open', () => {
  const { game, players: [player] } = rulesGame();
  const permission = permanent(game, player, definition('Additional Land Permission', {
    cost: '{1}{G}', types: ['Enchantment'], power: undefined, toughness: undefined, additionalLandPlays: 1,
  }));
  const cyclingLand = cardIn(player, definition('Cycling Land', {
    cost: null, types: ['Land'], power: undefined, toughness: undefined, cycling: { cost: '{1}' },
  }), 'hand');
  player.landsPlayed = player.maxLands;
  const q = { type: 'main', player, casts: [], acts: [], lands: [], phase: game.phase };
  const action = { kind: 'activate', entry: { card: cyclingLand, cycling: true } };
  const profile = { primarySynergies: [], weights: { commanderProgress: 1 } };

  const withExtra = MTG.quickScoreBotAction(MTG.createBotPlayerView(game, player.idx, q), action, profile, q);
  game.battlefield.splice(game.battlefield.indexOf(permission), 1);
  permission.zone = 'graveyard';
  game.recalc();
  const withoutExtra = MTG.quickScoreBotAction(MTG.createBotPlayerView(game, player.idx, q), action, profile, q);

  assert.equal(game.landPlayLimit(player), player.maxLands);
  assert.equal(withExtra.breakdown.resources, withoutExtra.breakdown.resources - 8);
});
