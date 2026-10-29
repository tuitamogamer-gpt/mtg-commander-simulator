import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
const planValue = plan => ({score: plan.score, target: plan.target, picks: plan.picks.map(c => c.iid)});
const logValue = log => {const {decisionTimeMs, ...rest} = log; return plain(rest);};
const decisionValue = decision => ({action: M.botActionKey(decision.action), score: decision.score,
  reason: decision.reason, consideredActions: plain(decision.consideredActions), log: logValue(decision.log)});

function fixture() {
  const game = new M.Game({seed: 102911, paced: false});
  const bot = game.addPlayer('Bot', M.DECKS['Federation Fleet'], null, true);
  const opponent = game.addPlayer('Opponent', M.DECKS['Landing Party'], null, true);
  bot.deckName = 'Federation Fleet'; bot.aiStyle = 'balanced';
  opponent.deckName = 'Landing Party'; opponent.aiStyle = 'balanced';
  game.turnPlayer = bot; game.turnNo = 10; game.phase = 'main1'; game.step = 'main';
  const add = (definition, owner = bot) => {
    const card = new M.CardInst(typeof definition === 'string' ? M.DEFS[definition] : definition, owner);
    card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card); return card;
  };
  const source = add('Inspirit, Flagship Vessel'); source.counters.charge = 7;
  const pilots = [1, 2, 3, 4].map(power => add({name: 'Pilot ' + power, cost: '{2}',
    types: ['Creature'], super: [], subtypes: [], oracle: '', power: String(power),
    toughness: String(power), kws: []}));
  game.recalc();
  const original = game.activatableList(bot).find(row => row.card === source && row.ability?.cost?.tapCreature);
  assert.ok(original?.ability.aiScore, 'real Station has its native plan-based score');
  // A private entry copy lets individual tests instrument scoring without
  // changing the shared card definitions used by other games.
  const entry = {...original, ability: {...original.ability}};
  const q = {type: 'main', player: bot, casts: [], lands: [], acts: [entry], phase: game.phase};
  const choose = (extra = {}) => M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
    difficulty: 'normal', actionWindow: q, forceSearch: false, budgetMs: 0, ...extra});
  const fresh = (pool = game.creatures(bot)) => M.stationPlan(game, source, bot, pool);
  const state = () => plain({pool: game.players.map(p => p.pool), life: game.players.map(p => p.life),
    cards: game.bf().map(c => ({id: c.iid, controller: c.ctrl.idx, zone: c.zone,
      tapped: c.tapped, counters: c.counters, types: c.cur.types, keywords: [...c.cur.kw]})),
    stack: game.stack.map(row => row.id), triggers: game.pendingTriggers.length});
  return {game, bot, opponent, source, pilots, entry, q, choose, fresh, state};
}

test('Station generation and ranking reuse one plan with identical decisions and history', async t => {
  const f = fixture(), stationPlan = M.stationPlan, attackReady = f.game.canAttackAtAll;
  let checks = 0;
  f.game.canAttackAtAll = function(card, ...args) {
    if (f.pilots.includes(card)) checks++;
    return attackReady.call(this, card, ...args);
  };
  const initialHistory = [{turn: 9, playerId: f.bot.idx, chosen: 'Earlier decision'}];
  f.game.aiDecisionLog = plain(initialHistory);
  f.game.rnd = () => {throw Error('Station ranking consumed gameplay RNG');};
  const before = f.state();
  // Explicit pools deliberately bypass reuse while preserving exactly the
  // same candidate list as the ordinary default-pool Station calculation.
  M.stationPlan = (g, s, p, pool) => stationPlan(g, s, p, pool ?? g.creatures(p));
  let baseline;
  try {baseline = await f.choose();} finally {M.stationPlan = stationPlan;}
  const baselineChecks = checks, baselineHistory = f.game.aiDecisionLog.map(logValue);
  assert.equal(baseline.action.kind, 'activate');
  assert.ok(baselineChecks > 0);
  checks = 0; f.game.aiDecisionLog = plain(initialHistory);
  const optimized = await f.choose();
  assert.deepEqual(decisionValue(optimized), decisionValue(baseline));
  assert.deepEqual(f.game.aiDecisionLog.map(logValue), baselineHistory);
  assert.deepEqual(f.state(), before);
  assert.equal(checks * 2, baselineChecks, 'one computation replaces generation plus scoring');
  t.diagnostic(`${checks} pilot readiness checks vs ${baselineChecks} without reuse`);
});

test('temporary mana, explicit payment pools, and text contexts retain fresh Station scores', async () => {
  const f = fixture(), attackReady = f.game.canAttackAtAll;
  f.game.canAttackAtAll = function(card, ...args) {
    return !f.bot.pool.R && !f.opponent.pool.U && !this.c1719TextContext?.length &&
      attackReady.call(this, card, ...args);
  };
  const observations = [], compare = pool => {
    const actual = M.stationPlan(f.game, f.source, f.bot, pool);
    const expected = f.fresh(pool ?? f.game.creatures(f.bot));
    assert.deepEqual(planValue(actual), planValue(expected)); observations.push(planValue(actual));
    return actual.score;
  };
  f.entry.ability.aiScore = () => {
    const base = compare();
    const red = f.bot.pool.R, blue = f.opponent.pool.U;
    f.bot.pool.R = 3; compare(); f.bot.pool.R = red;
    assert.equal(compare(), base);
    f.opponent.pool.U = 2; compare(); f.opponent.pool.U = blue;
    compare([f.pilots.at(-1)]);
    f.game.c1719TextActive = true; f.game.c1719TextContext = [{from: 'Forest', to: 'Island'}];
    compare(); f.game.c1719TextContext = []; compare();
    delete f.game.c1719TextActive; delete f.game.c1719TextContext;
    assert.equal(compare(), base);
    return base;
  };
  const before = f.state();
  await f.choose();
  assert.notEqual(observations[0].score, observations[1].score, 'mana preview changes the tested plan');
  assert.notEqual(observations[0].score, observations[3].score, 'opponent mana is a distinct context');
  assert.notDeepEqual(observations[0].picks, observations[4].picks, 'payment pool has a different pilot');
  assert.notEqual(observations[5].score, observations[6].score, 'text contexts cannot share a plan');
  assert.deepEqual(f.state(), before);
});

test('each later decision sees changed counters, tapped pilots, and control', async () => {
  const f = fixture(), stationPlan = M.stationPlan;
  await f.choose();
  const observations = [];
  M.stationPlan = (...args) => {const plan = stationPlan(...args); observations.push(planValue(plan)); return plan;};
  try {
    for (const change of [
      () => {f.source.counters.charge = 8;},
      () => {f.source.counters.charge = 7; f.pilots[0].tapped = true;},
      () => {M.OracleV8Control.gain(f.game, f.pilots[1], f.opponent); f.game.recalc();},
    ]) {
      change(); const expected = planValue(f.fresh()); observations.length = 0;
      await f.choose();
      assert.ok(observations.length);
      assert.ok(observations.every(plan => JSON.stringify(plan) === JSON.stringify(expected)));
    }
  } finally {M.stationPlan = stationPlan;}
});

test('a throwing ranking clears its Station memo', async () => {
  const f = fixture();
  f.entry.ability.aiScore = () => {throw Error('Injected Station score failure');};
  await assert.rejects(f.choose(), /Injected Station score failure/);
  f.source.counters.charge = 8;
  const after = M.stationPlan(f.game, f.source, f.bot);
  assert.deepEqual(planValue(after), planValue(f.fresh()));
  assert.equal(after.score, -30); assert.equal(after.picks.length, 0);
});

test('nested synchronous decisions restore the outer Station memo', async () => {
  const outer = fixture(), inner = fixture(), readiness = outer.game.canAttackAtAll;
  let checks = 0, nested;
  outer.game.canAttackAtAll = function(...args) {checks++; return readiness.apply(this, args);};
  outer.entry.ability.aiScore = () => {
    const before = M.stationPlan(outer.game, outer.source, outer.bot), previousChecks = checks;
    nested = inner.choose();
    const after = M.stationPlan(outer.game, outer.source, outer.bot);
    assert.deepEqual(planValue(after), planValue(before));
    assert.equal(checks, previousChecks, 'inner scope must not discard the outer plan');
    return after.score;
  };
  await outer.choose(); await nested;
  outer.source.counters.charge = 8;
  assert.equal(M.stationPlan(outer.game, outer.source, outer.bot).score, -30);
});

test('Station reuse ends before search begins and stays cleared after its await', async () => {
  const f = fixture(), simulateAction = M.simulateAction;
  let probes = 0;
  M.simulateAction = async game => {
    assert.equal(game, f.game);
    const probe = () => {
      const charge = f.source.counters.charge; f.source.counters.charge = 8;
      try {assert.equal(M.stationPlan(game, f.source, f.bot).score, -30); probes++;}
      finally {f.source.counters.charge = charge;}
    };
    probe(); await Promise.resolve(); probe();
    return {applied: false, error: new Error('Test search stops after freshness probes')};
  };
  try {await f.choose({forceSearch: true});} finally {M.simulateAction = simulateAction;}
  assert.equal(probes, 2);
});
