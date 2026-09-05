import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
function setup(role) {
  const game = new M.Game({ seed: 9183, paced: false }), trace = [];
  const human = { decide: async (_g, q) => q.type === 'chooseCards' ? q.from.slice(0, 1) : q.type === 'orderTriggers' ? q.triggers : q.type === 'priority' ? { kind: 'pass' } : q.options?.[0]?.key };
  const a = game.addPlayer('You', {}, human, role === 'ai'), b = game.addPlayer('Opponent', {}, human, false);
  if (role === 'ai') a.controller = new M.AIController(a, { difficulty: 'hard', style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, q) => {
    if (q.type === 'chooseCards' && q.source) {
      assert.equal(g.bf().includes(q.source), false, 'entrant remains unavailable while choosing its copy');
      assert.equal(g.manaSources(a).some(source => source.card === q.source), false);
    }
    const result = await decide(g, q); trace.push({ q, result }); return result;
  };
  game.turnPlayer = a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {}; game.revealToHuman = async () => {};
  const put = (name, player, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], player); card.zone = zone;
    if (zone === 'battlefield') { game.battlefield.push(card); if (card.def.loyalty) card.counters.loyalty = Number(card.def.loyalty); game.recalc(); }
    else player[zone].push(card);
    return card;
  };
  return { game, a, b, put, trace };
}
for (const role of ['human', 'ai']) {
  test(`${role}: a freshly cast Clever Impersonator copies Garruk with its printed entry loyalty`, async () => {
    const { game, a, b, put, trace } = setup(role), model = put('Garruk Wildspeaker', b), copy = put('Clever Impersonator', a, 'hand');
    a.pool.U = 2; a.pool.C = 2;
    assert.equal(await game.castSpell(a, copy, { from: 'hand' }), true); await game.resolveTop(); await game.checkSBA();
    assert.equal(copy.zone, 'battlefield'); assert.equal(copy.name, model.name); assert.equal(copy.is('Planeswalker'), true); assert.equal(copy.is('Creature'), false);
    assert.equal(copy.counters.loyalty, 3); assert.equal(trace.filter(row => row.q.type === 'chooseCards').length, 1);
    assert.equal(a.pool.U + a.pool.C, 0);
  });
  test(`${role}: Clever Impersonator blinks from creature to planeswalker and back with fresh entry characteristics`, async () => {
    const { game, a, b, put, trace } = setup(role), bear = put('Grizzly Bears', b), copy = put('Clever Impersonator', a, 'hand');
    a.pool.U = 2; a.pool.C = 2;
    assert.equal(await game.castSpell(a, copy, { from: 'hand' }), true); await game.resolveTop();
    assert.equal(copy.is('Creature'), true); assert.equal(copy.name, bear.name);
    game.addCounters(copy, '+1/+1', 2);
    await game.move(bear, 'graveyard'); const walker = put('Garruk Wildspeaker', b);
    await game.move(copy, 'exile'); const previousVersion = copy.zoneVersion;
    await game.putPermanentOntoBattlefield(copy, a); await game.checkSBA();
    assert.ok(copy.zoneVersion > previousVersion); assert.equal(copy.zone, 'battlefield'); assert.equal(copy.name, walker.name);
    assert.equal(copy.counters.loyalty, 3, 'fresh planeswalker entry sets loyalty before SBA');
    assert.equal(copy.counters['+1/+1'] || 0, 0); assert.equal(copy.is('Creature'), false);
    await game.move(walker, 'graveyard'); const secondBear = put('Grizzly Bears', b);
    await game.move(copy, 'exile'); await game.putPermanentOntoBattlefield(copy, a); await game.checkSBA();
    assert.equal(copy.name, secondBear.name); assert.equal(copy.zone, 'battlefield'); assert.equal(copy.is('Creature'), true); assert.equal(copy.is('Planeswalker'), false);
    assert.equal(copy.power, 2); assert.equal(copy.toughness, 2); assert.equal(copy.counters.loyalty || 0, 0);
    assert.equal(trace.filter(row => row.q.type === 'chooseCards').length, 3);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false);
  });
}
