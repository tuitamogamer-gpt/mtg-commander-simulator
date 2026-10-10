import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({seed: 101026139, paced: false, difficulty: 'hard', maxTurns: 30});
  const a = g.addPlayer('Arcanis controller', {name: 'Native tap audit'}, null, true);
  const b = g.addPlayer('Creature opponent', {name: 'Native tap opponent'}, null, false);
  const f = {g, a, b, choices: {}};
  f.human = p => { p.controller = {decide: async (game, q) => {
    if (q.type === 'priority') return f.choices.priority?.(p, q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.choices.targets?.(p, q) ?? q.candidates.slice(0, q.min ?? 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(r => r.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(r => r.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers') return f.choices.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return f.choices.blockers?.(p, q) ?? [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native tap question: ' + q.type);
  }}; };
  f.human(a); f.human(b);
  f.put = (name, zone = 'hand', p = a) => {
    assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
    const c = new M.CardInst(M.DEFS[name], p); c.zone = zone;
    if (zone === 'battlefield') { c.sick = false; g.battlefield.push(c); } else p[zone].push(c);
    g.recalc(); return c;
  };
  f.cast = async (name, p = a) => {
    const c = f.put(name, 'hand', p), offer = g.castableList(p).find(r => r.card === c);
    assert.ok(offer, 'native paid offer: ' + name);
    assert.equal(await g.castSpell(p, c, {from: offer.from, alt: offer.alt}), true);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    return c;
  };
  f.bot = () => { a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'}); return a.controller; };
  f.clean = () => {
    assert.equal((g.aiDecisionLog || []).some(r => r.fallback), false);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    assertGameStateInvariants(g, 'native AI tap safety');
  };
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  for (const p of [a, b]) for (let i = 0; i < 20; i++) f.put('Forest', 'library', p);
  return f;
}

async function paidPosition(threatName = 'Craw Wurm', guardName = 'Arcanis the Omnipotent') {
  const f = table();
  for (let i = 0; i < 6; i++) f.put('Island', 'battlefield');
  const guard = await f.cast(guardName);
  assert.equal(guard.sick, true);
  f.g.turnNo++; await f.g.runBeginningPhase(f.a);
  assert.equal(guard.sick, false, 'native turn beginning makes the tap ability usable');
  f.g.turnPlayer = f.b; f.g.phase = 'main1'; f.g.step = 'main';
  for (let i = 0; i < 6; i++) f.put(threatName === 'Craw Wurm' ? 'Forest' : 'Mountain', 'battlefield', f.b);
  const threat = await f.cast(threatName, f.b);
  assert.equal(threat.sick, true);
  await f.g.tap(threat);
  f.a.life = 4; f.g.turnPlayer = f.a; f.g.phase = 'main2'; f.g.step = 'main';
  f.choices.attackers = (p, q) => p === f.b && q.eligible.includes(threat) ? [{card: threat, target: f.a}] : [];
  return {...f, guard, threat};
}

async function attackNextTurn(f) {
  f.g.turnPlayer = f.b; f.g.turnNo++;
  await f.g.runBeginningPhase(f.b);
  assert.equal(f.threat.sick, false); assert.equal(f.threat.tapped, false);
  await f.g.combatPhase(f.b);
}

test('a legal human hold control survives next-turn Craw Wurm behind paid Arcanis', async () => {
  const f = await paidPosition();
  f.choices.blockers = (p, q) => p === f.a && q.potential.includes(f.guard)
    ? [{blocker: f.guard, attacker: f.threat}] : [];
  await f.g.mainPhase(f.a); assert.equal(f.guard.tapped, false);
  await attackNextTurn(f);
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.guard.zone, 'graveyard'); f.clean();
});

test('AI preserves paid Arcanis instead of drawing itself into a next-turn lethal attack', async t => {
  const f = await paidPosition(); const handBefore = f.a.hand.length;
  f.bot(); await f.g.mainPhase(f.a);
  t.diagnostic(JSON.stringify({guardTapped: f.guard.tapped, guardZone: f.guard.zone, handBefore, handAfter: f.a.hand.length,
    chosen: f.g.aiDecisionLog.map(r => r.chosen), logs: f.g.log.slice(-12),
    abilities: f.guard.def.abilities.map(r => ({label: r.label, cost: r.cost})), printed: f.guard.def.oracle}));
  assert.equal(f.guard.tapped, false, 'draw three must preserve the only legal blocker');
  await attackNextTurn(f);
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.guard.zone, 'graveyard'); f.clean();
});

test('AI preserves a paid Merfolk Looter as its only next-turn Craw Wurm blocker', async t => {
  const f = await paidPosition('Craw Wurm', 'Merfolk Looter');
  f.bot(); await f.g.mainPhase(f.a);
  t.diagnostic(JSON.stringify({source: f.guard.name, zone: f.guard.zone, tapped: f.guard.tapped,
    chosen: f.g.aiDecisionLog.map(r => r.chosen), logs: f.g.log.slice(-10)}));
  await attackNextTurn(f);
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.guard.zone, 'graveyard'); f.clean();
});

test('AI still draws with paid Arcanis when it cannot block the opposing Shivan Dragon', async () => {
  const f = await paidPosition('Shivan Dragon'); const handBefore = f.a.hand.length;
  assert.equal(f.g.canBlock(f.guard, f.threat), false);
  f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.guard.zone, 'battlefield', 'a safe draw does not needlessly spend four mana returning its own source');
  assert.equal(f.guard.tapped, true, 'drawing adds no extra flying-combat exposure');
  assert.ok(f.a.hand.length >= handBefore + 2, 'native draw three, with at most one Forest played');
  f.clean();
});

test('AI may draw with paid Arcanis after its native block has already been declared', async t => {
  const f = await paidPosition(); const bot = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  const handBefore = f.a.hand.length; let afterBlockDecisions = 0, activated = false;
  f.choices.blockers = (p, q) => p === f.a && q.potential.includes(f.guard)
    ? [{blocker: f.guard, attacker: f.threat}] : [];
  f.choices.priority = async (p, q) => {
    if (p !== f.a || f.g.phase !== 'combat' || f.g.step !== 'blockers' || !f.guard.blocking) return {kind: 'pass'};
    afterBlockDecisions++;
    const decision = await bot.decide(f.g, q);
    if (decision.kind === 'activate' && decision.entry.card === f.guard) activated = true;
    return decision;
  };
  await attackNextTurn(f);
  t.diagnostic(JSON.stringify({afterBlockDecisions, activated, handBefore, handAfter: f.a.hand.length}));
  assert.ok(afterBlockDecisions > 0); assert.equal(activated, true);
  assert.equal(f.a.hand.filter(c => c.name === 'Forest').length, handBefore + 3);
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(['hand', 'graveyard'].includes(f.guard.zone), true, 'saving an already declared blocker also preserves the block');
  f.clean();
});

test('AI still uses the paid Arcanis self-return to escape a genuine paid Swords to Plowshares', async () => {
  const f = await paidPosition();
  f.g.turnPlayer = f.b; f.g.phase = 'main1'; f.g.step = 'main';
  f.put('Plains', 'battlefield', f.b);
  f.choices.targets = (p, q) => q.candidates.includes(f.guard) ? [f.guard] : q.candidates.slice(0, q.min ?? 1);
  f.bot(); const spell = await f.cast('Swords to Plowshares', f.b);
  assert.equal(f.guard.zone, 'hand', 'the native self-bounce protects the threatened permanent');
  assert.equal(spell.zone, 'graveyard');
  assert.equal(f.a.life, 4, 'Swords loses its exact target and grants no life');
  assert.equal(f.g.lands(f.a).filter(c => c.tapped).length, 4);
  f.clean();
});

test('AI can draw during the last opponent end step before its own ordinary untap', async () => {
  const f = await paidPosition(); const handBefore = f.a.hand.length;
  f.g.turnPlayer = f.b; f.g.phase = 'end'; f.g.step = 'end';
  f.bot(); await f.g.priorityRound(f.b);
  assert.equal(f.guard.zone, 'battlefield'); assert.equal(f.guard.tapped, true);
  assert.equal(f.a.hand.length, handBefore + 3);
  f.g.turnPlayer = f.a; f.g.turnNo++; await f.g.runBeginningPhase(f.a);
  assert.equal(f.guard.tapped, false, 'the source natively untaps before another opponent attack');
  f.clean();
});

test('AI can draw when a newly paid Craw Wurm cannot attack during the current opponent combat', async () => {
  const f = await paidPosition(); const handBefore = f.a.hand.length;
  f.g.turnPlayer = f.b; await f.g.untap(f.threat);
  assert.equal(f.threat.sick, true);
  f.bot(); await f.g.combatPhase(f.b);
  assert.equal(f.a.lost, false); assert.equal(f.a.life, 4);
  assert.equal(f.guard.zone, 'battlefield'); assert.equal(f.guard.tapped, true);
  assert.equal(f.a.hand.length, handBefore + 3);
  f.clean();
});

test('AI may tap paid Temporal Adept to return the incoming creature instead of holding it as a blocker', async () => {
  const f = await paidPosition('Craw Wurm', 'Temporal Adept');
  f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.guard.zone, 'battlefield'); assert.equal(f.guard.tapped, true);
  assert.equal(f.threat.zone, 'hand', 'the actual targeted bounce removes the future attacker');
  assert.equal(f.g.lands(f.a).filter(c => c.tapped).length, 3);
  f.clean();
});
