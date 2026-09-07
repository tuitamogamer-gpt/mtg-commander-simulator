import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
function fixture(difficulty = 'hard', phase = 'main2') {
  const game = new MTG.Game({ seed: 90708, paced: false, difficulty });
  const bot = game.addPlayer('Station bot', { name: 'Counter Intelligence' }, null, true);
  const opponent = game.addPlayer('Opponent', { name: 'Quick Draw' }, {
    decide: async (g, q) => q.type === 'priority' ? { kind: 'pass' }
      : q.type === 'chooseOption' ? q.options[0]?.key : [],
  }, false);
  bot.controller = new MTG.AIController(bot, { difficulty, style: 'balanced' });
  game.turnPlayer = bot; game.turnNo = 8; game.phase = phase; game.step = 'main';
  return { game, bot, opponent };
}
function permanent(game, player, name, power, kws = []) {
  const def = power === undefined ? MTG.DEFS[name] : {
    name, types: ['Creature'], super: [], subtypes: [], cost: '{2}', oracle: '',
    power: String(power), toughness: String(Math.max(1, power)), kws,
  };
  const card = new MTG.CardInst(def, player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card); game.recalc(); return card;
}
function ship(f, name = 'Inspirit, Flagship Vessel', charge = 0) {
  const card = permanent(f.game, f.bot, name);
  card.counters.charge = charge; f.game.recalc(); return card;
}
function noFallback(game) {
  assert.ok(!(game.aiDecisionLog || []).some(row => row.fallback));
  assert.ok(!game.log.some(row => /AI V2 fallback/.test(row.msg)));
  assert.equal(game.stack.length, 0); assert.equal(game.pendingTriggers.length, 0);
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const [name, charge] of [['Inspirit, Flagship Vessel', 8], ['Uthros Research Craft', 12],
    ['Hearthhull, the Worldseed', 8], ['Exploration Broodship', 8]]) {
    test(`${difficulty}: ${name} stops paying Station after its final threshold`, async () => {
      const f = fixture(difficulty); const source = ship(f, name, charge);
      const pilots = [1, 4, 8, 12].map((n, i) => permanent(f.game, f.bot, `Pilot ${i}`, n));
      assert.ok(f.game.activatableList(f.bot).some(e => e.card === source && e.ability?.cost?.tapCreature));
      // Isolate Station from Hearthhull's separate land-sacrifice ability.
      await f.game.mainPhase(f.bot);
      assert.equal(source.counters.charge, charge);
      assert.ok(pilots.every(c => !c.tapped)); noFallback(f.game);
    });
  }
  test(`${difficulty}: one missing counter spends a 1/1 and preserves the 8/8`, async () => {
    const f = fixture(difficulty); const source = ship(f, undefined, 7);
    const big = permanent(f.game, f.bot, 'Valuable attacker', 8);
    const small = permanent(f.game, f.bot, 'Small pilot', 1); small.sick = true;
    await f.game.mainPhase(f.bot);
    assert.equal(source.counters.charge, 8);
    assert.equal(small.tapped, true); assert.equal(big.tapped, false); noFallback(f.game);
  });
  test(`${difficulty}: preserves the only flying blocker against a lethal next turn`, async () => {
    const f = fixture(difficulty); const source = ship(f, undefined, 1); f.bot.life = 4;
    const blocker = permanent(f.game, f.bot, 'Flying guard', 3, ['flying']);
    const threat = permanent(f.game, f.opponent, 'Lethal flyer', 6, ['flying']);
    threat.tapped = true; threat.sick = true; // Will untap before our next turn.
    await f.game.mainPhase(f.bot);
    assert.equal(blocker.tapped, false); assert.equal(source.counters.charge, 1); noFallback(f.game);
  });
}

test('multi-creature Station reaches the threshold once and leaves a reserve', async () => {
  const f = fixture(); const source = ship(f, undefined, 4);
  const pilots = [2, 2, 2].map((n, i) => permanent(f.game, f.bot, `Small pilot ${i}`, n));
  await f.game.mainPhase(f.bot);
  assert.equal(source.counters.charge, 8);
  assert.equal(pilots.filter(c => c.tapped).length, 2); noFallback(f.game);
});

test('Kilo can Station an online vessel for an immediate Reactor win', async () => {
  const f = fixture(); const source = ship(f, undefined, 8);
  const kilo = permanent(f.game, f.bot, 'Kilo, Apogee Mind');
  const reactor = permanent(f.game, f.bot, 'Darksteel Reactor'); reactor.counters.charge = 19;
  f.game.recalc(); await f.game.mainPhase(f.bot);
  assert.equal(kilo.tapped, true); assert.equal(reactor.counters.charge, 20);
  assert.equal(f.opponent.lost, true);
  assert.ok(source.counters.charge >= 8);
});

test('human can deliberately Station above the threshold', async () => {
  const f = fixture(); const source = ship(f, undefined, 40);
  const pilot = permanent(f.game, f.bot, 'Human pilot', 2);
  f.bot.isAI = false;
  f.bot.controller = { decide: async (g, q) => q.type === 'chooseCards' ? [pilot]
    : q.type === 'priority' ? { kind: 'pass' } : [] };
  const entry = f.game.activatableList(f.bot).find(e => e.card === source);
  assert.equal(await f.game.activateAbility(f.bot, entry), true);
  assert.equal(source.counters.charge, 42); assert.equal(pilot.tapped, true);
});

test('does not consume an attacker that can eliminate the opponent this combat', async () => {
  const f = fixture('hard', 'main1'); const source = ship(f); f.opponent.life = 3;
  const attacker = permanent(f.game, f.bot, 'Lethal attacker', 3);
  await f.game.mainPhase(f.bot);
  assert.equal(attacker.tapped, false); assert.equal(source.counters.charge, 0);
});

test('an animated Station can replace the tapped pilot as a flying blocker', async () => {
  const f = fixture(); const source = ship(f, undefined, 7); f.bot.life = 4;
  const pilot = permanent(f.game, f.bot, 'Ground pilot', 1);
  permanent(f.game, f.opponent, 'Opposing flyer', 4, ['flying']);
  await f.game.mainPhase(f.bot);
  assert.equal(pilot.tapped, true); assert.equal(source.counters.charge, 8);
  assert.equal(source.kw('flying'), true); assert.equal(source.tapped, false);
});

test('chooses a ground pilot and preserves the only useful flying blocker', async () => {
  const f = fixture(); const source = ship(f, 'Uthros Research Craft', 2); f.bot.life = 4;
  const flyer = permanent(f.game, f.bot, 'Only flying guard', 1, ['flying']);
  const ground = permanent(f.game, f.bot, 'Ground pilot', 1);
  permanent(f.game, f.opponent, 'Opposing flyer', 6, ['flying']);
  await f.game.mainPhase(f.bot);
  assert.equal(flyer.tapped, false); assert.equal(ground.tapped, true);
  assert.equal(source.counters.charge, 3);
});

test('does not leave a healthy player defenseless just to seed a counter', async () => {
  const f = fixture(); const source = ship(f);
  const guard = permanent(f.game, f.bot, 'Only guard', 1);
  permanent(f.game, f.opponent, 'Opposing attacker', 3);
  await f.game.mainPhase(f.bot);
  assert.equal(guard.tapped, false); assert.equal(source.counters.charge, 0);
});

test('zero-power creatures are never paid for no Station progress', async () => {
  const f = fixture(); const source = ship(f, undefined, 7);
  const guard = permanent(f.game, f.bot, 'Zero-power guard', 0);
  await f.game.mainPhase(f.bot);
  assert.equal(guard.tapped, false); assert.equal(source.counters.charge, 7);
});

test('safe postcombat progress is allowed when the final threshold is not reachable yet', async () => {
  const f = fixture(); const source = ship(f, undefined, 1);
  const pilot = permanent(f.game, f.bot, 'Spare pilot', 2); pilot.sick = true;
  await f.game.mainPhase(f.bot);
  assert.equal(pilot.tapped, true); assert.equal(source.counters.charge, 3);
});

test('Kilo proliferate changes the missing charge before the next Station decision', async () => {
  const f = fixture(); const source = ship(f, undefined, 4);
  const kilo = permanent(f.game, f.bot, 'Kilo, Apogee Mind');
  const reserve = permanent(f.game, f.bot, 'Large reserve', 8);
  await f.game.mainPhase(f.bot);
  assert.equal(kilo.tapped, true); assert.equal(reserve.tapped, false);
  assert.equal(source.counters.charge, 8); noFallback(f.game);
});

test('heuristic fallback shares the Station cap and planned payment', () => {
  const f = fixture(); const source = ship(f, undefined, 7);
  const large = permanent(f.game, f.bot, 'Large pilot', 8);
  const small = permanent(f.game, f.bot, 'Small pilot', 1);
  const picked = f.bot.controller.chooseCards(f.game, {
    type: 'chooseCards', from: [large, small], min: 1, max: 1, aiHint: { kind: 'stationTap', src: source },
  });
  assert.equal(picked[0], small);
  source.counters.charge = 40; f.game.recalc();
  assert.ok(f.bot.controller.activationScore(f.game,
    f.game.activatableList(f.bot).find(e => e.card === source)) <= 0);
});

test('Station planning leaves the live board and RNG untouched', () => {
  const f = fixture(); const source = ship(f, undefined, 7);
  permanent(f.game, f.bot, 'Pilot', 1);
  permanent(f.game, f.opponent, 'Enemy', 4, ['flying']);
  const state = () => JSON.stringify({ battlefield: f.game.bf().map(c => ({
    id: c.iid, tapped: c.tapped, counters: c.counters, types: c.cur.types, kws: [...c.cur.kw], meta: c.meta,
  })), pending: f.game.pendingTriggers.map(t => t.src?.iid), stack: f.game.stack.map(t => t.src?.iid) },
  (key, value) => value instanceof MTG.Player ? { player: value.idx } : value);
  const rnd = f.game.rnd;
  f.game.rnd = () => { throw new Error('Station planning must not consume RNG'); };
  const before = state();
  const first = MTG.stationPlan(f.game, source, f.bot);
  const second = MTG.stationPlan(f.game, source, f.bot);
  assert.equal(first.picks[0], second.picks[0]); assert.equal(first.score, second.score);
  assert.equal(state(), before);
  f.game.rnd = rnd;
});

test('Inspirit grows an online Spacecraft with +1/+1 instead of redundant charge', async () => {
  const f = fixture(); const target = ship(f, 'Uthros Research Craft', 12);
  const q = { type: 'chooseOption', options: [{ key: 'p' }, { key: 'c' }],
    aiHint: { kind: 'inspiritCounter', target } };
  assert.equal(await f.bot.controller.decide(f.game, q), 'p');
  assert.equal(f.bot.controller.chooseOption(f.game, q), 'p');
  target.counters.charge = 11; f.game.recalc();
  assert.equal(await f.bot.controller.decide(f.game, q), 'c');
});

test('defense accounts for successive opponents before the next untap', async () => {
  const f = fixture(); const source = ship(f, 'Uthros Research Craft', 3); f.bot.life = 4;
  const next = f.game.addPlayer('Second opponent', { name: 'Other' }, f.opponent.controller, false);
  const guards = [permanent(f.game, f.bot, 'First guard', 1), permanent(f.game, f.bot, 'Second guard', 1)];
  permanent(f.game, f.opponent, 'First threat', 4);
  permanent(f.game, next, 'Second threat', 4);
  await f.game.mainPhase(f.bot);
  assert.ok(guards.every(c => !c.tapped)); assert.equal(source.counters.charge, 3); noFallback(f.game);
});

test('preserves both required menace blockers', async () => {
  const f = fixture(); const source = ship(f, 'Uthros Research Craft', 2); f.bot.life = 3;
  const guards = [permanent(f.game, f.bot, 'First guard', 1), permanent(f.game, f.bot, 'Second guard', 1)];
  permanent(f.game, f.opponent, 'Menacing threat', 4, ['menace']);
  await f.game.mainPhase(f.bot);
  assert.ok(guards.every(c => !c.tapped)); assert.equal(source.counters.charge, 2); noFallback(f.game);
});

test('a tapped Spacecraft cannot replace the pilot as a blocker', async () => {
  const f = fixture(); const source = ship(f, undefined, 7); source.tapped = true; f.bot.life = 3;
  const guard = permanent(f.game, f.bot, 'Only guard', 1);
  permanent(f.game, f.opponent, 'Lethal threat', 4);
  await f.game.mainPhase(f.bot);
  assert.equal(guard.tapped, false); assert.equal(source.counters.charge, 7); noFallback(f.game);
});

test('Tekuthal makes Kilo at Reactor 18 an immediate winning Station plan', async () => {
  const f = fixture(); ship(f, undefined, 40);
  const kilo = permanent(f.game, f.bot, 'Kilo, Apogee Mind');
  permanent(f.game, f.bot, 'Tekuthal, Inquiry Dominus');
  const reactor = permanent(f.game, f.bot, 'Darksteel Reactor'); reactor.counters.charge = 18;
  f.game.recalc(); await f.game.mainPhase(f.bot);
  assert.equal(kilo.tapped, true); assert.equal(reactor.counters.charge, 20);
  assert.equal(f.opponent.lost, true);
});

test('actual Inspirit combat trigger feeds Reactor rather than an online Uthros', async () => {
  const f = fixture(); ship(f, undefined, 8); ship(f, 'Uthros Research Craft', 12);
  const reactor = permanent(f.game, f.bot, 'Darksteel Reactor'); reactor.counters.charge = 18;
  f.game.phase = 'combat'; f.game.step = 'begin'; f.game.recalc();
  await f.game.emit('beginCombat', { player: f.bot });
  await f.game.flushTriggers(); await f.game.priorityRound(f.bot);
  assert.equal(reactor.counters.charge, 20); assert.equal(f.opponent.lost, true);
});
