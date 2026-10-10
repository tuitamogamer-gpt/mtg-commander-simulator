import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

async function paidAura(name, role) {
  const g = new M.Game({seed: 3056, paced: false, difficulty: 'hard'});
  const a = g.addPlayer('Native land Aura caster', {}, null, true);
  const b = g.addPlayer('Native land Aura opponent', {}, null, false);
  const f = {g, a, b, target: null};
  for (const p of [a, b]) p.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return q.candidates.includes(f.target) ? [f.target] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseManaSources') return {auto: true};
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    throw Error('Unhandled native land Aura question: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (cardName, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[cardName], 'registered printed card: ' + cardName);
    const card = new M.CardInst(M.DEFS[cardName], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card); g.recalc(); return card;
  };
  for (const p of [a, b]) for (let i = 0; i < 24; i++) f.put('Island', 'library', p);
  const own = f.put("Mishra's Factory"), rival = f.put('Forest', 'battlefield', b);
  const petal = f.put('Lotus Petal', 'hand');
  assert.equal(await g.castSpell(a, petal, {from: 'hand'}), true);
  const mana = g.manaSources(a).find(row => row.card === petal); assert.ok(mana);
  assert.equal(await g.activateManaSource(a, mana, mana.produce[0], null, ['U']), true);
  assert.equal(petal.zone, 'graveyard'); assert.equal(a.pool.U, 1);
  const aura = f.put(name, 'hand'); f.target = rival;
  if (role === 'ai') a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
  assert.ok(g.castableList(a).some(row => row.card === aura));
  assert.equal(await g.castSpell(a, aura, {from: 'hand'}), true);
  assert.equal(g.stack.length + g.pendingTriggers.length, 0);
  return {...f, own, rival, aura};
}

for (const name of ['Spreading Seas', "Sea's Claim"]) for (const role of ['human', 'ai']) {
  test(`paid ${name} ${role} keeps the opposing land-type replacement distinct from additive color fixing`, async t => {
    const f = await paidAura(name, role);
    t.diagnostic(JSON.stringify({name, role, attached: f.aura.attachedTo,
      own: f.own.iid, rival: f.rival.iid, chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    const operation = f.aura.def.oracleImplementation.find(row => row.kind === 'v8-land-types');
    assert.equal(operation.attached, true); assert.equal(operation.retain, false);
    assert.equal(f.aura.attachedTo, f.rival.iid);
    assert.equal(f.rival.hasSub('Island'), true); assert.equal(f.rival.hasSub('Forest'), false);
    assert.equal(f.own.hasSub('Island'), false); assert.equal(f.own.name, "Mishra's Factory");
    assert.equal(f.aura.castMeta.manaSpent, name === 'Spreading Seas' ? 2 : 1);
    assert.equal(f.a.pool.U, 0); assert.equal(f.own.tapped, name === 'Spreading Seas');
    assert.equal(f.a.library.length, name === 'Spreading Seas' ? 23 : 24);
    assert.equal((f.g.aiDecisionLog || []).some(row => row.fallback), false);
    assertGameStateInvariants(f.g, 'native opposing land Aura replacement');
  });
}
