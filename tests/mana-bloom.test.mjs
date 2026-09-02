import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min ?? 1).map(option => option.key);
  if (query.type === 'chooseX') return query.values?.at(-1) ?? query.max;
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 82726, paced: false, maxTurns: 40 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Bloom Player',
    { name: index ? `Opp ${index}` : 'Quandrix Unlimited' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = opts.ctrl || player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.tapped = opts.tapped ?? false;
  card.commander = !!opts.commander;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 180) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 180, 'Mana Bloom trigger/stack petlja se nije smirila');
}

test('Mana Bloom plaća odabrani X, ulazi sa tačno X charge countera i izvan stacka ima MV 1', async () => {
  const { game, players: [player] } = rulesGame([], 2);
  player.pool.G = 1;
  player.pool.C = 3;
  const bloom = inZone(player, 'Mana Bloom', 'hand');

  assert.equal(await game.castSpell(player, bloom, { from: 'hand', xVal: 3 }), true);
  await resolveAll(game);

  assert.equal(bloom.zone, 'battlefield');
  assert.equal(bloom.counters.charge, 3);
  assert.equal(bloom.castMeta.x, 3);
  assert.equal(bloom.castMeta.manaSpent, 4);
  assert.equal(bloom.mv, 1);
});

test('Mana Bloom free-cast prisiljava X=0, a Zimoneov popust može pretvoriti jedan Forest u X=2', async () => {
  {
    const { game, players: [player] } = rulesGame([], 2);
    const bloom = inZone(player, 'Mana Bloom', 'hand');
    assert.equal(await game.castSpell(player, bloom, { from: 'hand', free: true, xVal: 9 }), true);
    await resolveAll(game);
    assert.equal(bloom.zone, 'battlefield');
    assert.equal(bloom.castMeta.x, 0);
    assert.equal(bloom.counters.charge || 0, 0);
  }

  {
    const { game, players: [player] } = rulesGame([], 2);
    const zimone = permanent(game, player, 'Zimone, Infinite Analyst', { commander: true });
    zimone.counters['+1/+1'] = 2;
    permanent(game, player, 'Forest');
    const bloom = inZone(player, 'Mana Bloom', 'hand');
    assert.equal(game.maxAffordableX(player, game.spellCost(player, bloom), bloom), 2);
    assert.equal(await game.castSpell(player, bloom, { from: 'hand', xVal: 2 }), true);
    await resolveAll(game);
    assert.equal(bloom.counters.charge, 2);
    assert.equal(zimone.counters['+1/+1'], 4, 'prvi X spell pokreće i Zimoneov cast trigger');
  }
});

test('Mana Bloom mana sposobnost je trenutna, troši counter kao cijenu i radi najviše jednom u svakom potezu', async () => {
  const { game, players: [player] } = rulesGame([
    (g, query) => query.aiHint?.kind === 'manaColor' ? 'U' : defaultDecision(g, query),
  ], 2);
  const bloom = permanent(game, player, 'Mana Bloom');
  bloom.counters.charge = 2;
  game.recalc();

  const visibleAction = game.activatableList(player).find(entry => entry.card === bloom && entry.manaAbility);
  assert.ok(visibleAction, 'strateško uklanjanje charge countera mora biti dostupno kao eksplicitna ljudska akcija');
  assert.equal(await game.activateAbility(player, visibleAction), true);
  assert.equal(game.stack.length, 0, 'mana ability ne koristi stack');
  assert.equal(bloom.counters.charge, 1, 'charge counter je uklonjen kao activation cost');
  assert.equal(player.pool.U, 1);
  assert.equal(game.manaSources(player, null).some(source => source.card === bloom), false, 'druga aktivacija u istom potezu nije legalna');

  game.turnNo++;
  const nextTurn = game.manaSources(player, null).find(source => source.card === bloom);
  assert.ok(nextTurn, 'once each turn se resetuje već u narednom igračevom potezu');
  assert.equal(await game.activateManaSource(player, nextTurn, nextTurn.produce[0], null, []), true);
  assert.equal(bloom.counters.charge || 0, 0);
  assert.equal(player.pool.U, 2);
});

test('Mana Bloom upkeep intervening-if ponovo provjerava charge counter pri rezoluciji', async () => {
  const { game, players: [player] } = rulesGame([], 2);
  const bloom = permanent(game, player, 'Mana Bloom');

  await game.emit('upkeep', { player });
  await game.flushTriggers();
  assert.equal(game.stack.length, 1, 'prazan Bloom pravi upkeep trigger');

  game.addCounters(bloom, 'charge', 1, false, player);
  await game.resolveTop();

  assert.equal(bloom.zone, 'battlefield', 'counter dodat u odgovoru gasi intervening-if pri rezoluciji');
  assert.equal(bloom.counters.charge, 1);
});

test('stari Mana Bloom upkeep trigger ne može vratiti novi battlefield objekat iste fizičke karte', async () => {
  const { game, players: [player] } = rulesGame([], 2);
  const bloom = permanent(game, player, 'Mana Bloom');

  await game.emit('upkeep', { player });
  await game.flushTriggers();
  const triggeredVersion = bloom.zoneVersion;
  assert.equal(game.stack.length, 1);

  await game.move(bloom, 'hand');
  await game.move(bloom, 'battlefield', { ctrl: player });
  assert.notEqual(bloom.zoneVersion, triggeredVersion);
  await game.resolveTop();

  assert.equal(bloom.zone, 'battlefield');
  assert.equal(player.hand.includes(bloom), false);
});

test('prazan Mana Bloom prati controllerov upkeep, ali se vraća u ownerovu ruku', async () => {
  const { game, players: [owner, controller] } = rulesGame([], 2);
  const bloom = permanent(game, owner, 'Mana Bloom', { ctrl: controller });

  await game.emit('upkeep', { player: owner });
  await game.flushTriggers();
  assert.equal(game.stack.length, 0, 'ownerov upkeep nije relevantan dok drugi igrač kontroliše Bloom');

  await game.emit('upkeep', { player: controller });
  await game.flushTriggers();
  assert.equal(game.stack.length, 1);
  await game.resolveTop();

  assert.equal(bloom.zone, 'hand');
  assert.equal(owner.hand.includes(bloom), true);
  assert.equal(controller.hand.includes(bloom), false);
});

test('Unbound Flourishing prije Owlin kopije daje i originalnom i token Bloomu dupli X', async () => {
  const { game, players: [player] } = rulesGame([
    (g, query) => {
      if (query.type === 'orderTriggers') {
        return query.triggers.slice().sort((a, b) => {
          const aCopy = /Copy the first X spell/.test(a.name || '');
          const bCopy = /Copy the first X spell/.test(b.name || '');
          return Number(bCopy) - Number(aCopy);
        });
      }
      return defaultDecision(g, query);
    },
  ], 2);
  permanent(game, player, 'Owlin Spiralmancer');
  permanent(game, player, 'Unbound Flourishing');
  player.pool.G = 1;
  player.pool.C = 2;
  const bloom = inZone(player, 'Mana Bloom', 'hand');

  assert.equal(await game.castSpell(player, bloom, { from: 'hand', xVal: 2 }), true);
  await resolveAll(game);

  const blooms = game.bf().filter(card => card.name === 'Mana Bloom');
  assert.equal(blooms.length, 2);
  assert.equal(blooms.filter(card => card.isToken).length, 1);
  assert.equal(blooms.map(card => card.counters.charge).sort((a, b) => a - b).join(','), '4,4');
});

test('lokalni AI bira legalan Mana Bloom X i vidi ga kao jednokratni mana izvor po potezu', async () => {
  const { game, players: [bot] } = rulesGame([], 2);
  bot.isAI = true;
  bot.deck = MTG.DECKS['Quandrix Unlimited'] || { name: 'Quandrix Unlimited' };
  const bloom = new MTG.CardInst(MTG.DEFS['Mana Bloom'], bot);
  const query = {
    type: 'chooseX', player: bot, min: 0, max: 5, card: bloom,
    prompt: 'X for Mana Bloom?', aiHint: { kind: 'chooseX', card: bloom },
  };
  const choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 8272601, actionWindow: query,
  });
  assert.equal(MTG.unwrapBotDecisionAction(choice.action), 5);

  bloom.ctrl = bot;
  bloom.zone = 'battlefield';
  bloom.counters.charge = 2;
  game.battlefield.push(bloom);
  game.recalc();
  const source = game.manaSources(bot, null).find(entry => entry.card === bloom);
  assert.ok(source);
  assert.equal(await game.activateManaSource(bot, source, source.produce[0], null, []), true);
  assert.equal(game.manaSources(bot, null).some(entry => entry.card === bloom), false);
});
