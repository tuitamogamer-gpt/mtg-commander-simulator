import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

async function paidPosition(disabled) {
  const g = new M.Game({seed: 101026161, paced: false, difficulty: 'hard', maxTurns: 30});
  const a = g.addPlayer('Native magecraft strategist', {}, null, true), b = g.addPlayer('Native mutation caster', {}, null, false);
  const f = {g, a, b, target: null};
  for (const player of [a, b]) player.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return q.candidates.includes(f.target) ? [f.target] : q.candidates.slice(0, q.min ?? 1);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'attackers' || q.type === 'blockers') return [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native magecraft question: ' + q.type);
  }};
  f.put = (name, zone = 'hand', p = a) => {
    assert.ok(M.DEFS[name], 'actual registered definition: ' + name);
    const c = new M.CardInst(M.DEFS[name], p); c.zone = zone;
    if (zone === 'battlefield') { c.sick = false; g.battlefield.push(c); } else p[zone].push(c);
    g.recalc(); return c;
  };
  f.cast = async (name, p = a) => {
    const c = f.put(name, 'hand', p), offer = g.castableList(p).find(row => row.card === c);
    assert.ok(offer, 'native paid offer: ' + name);
    assert.equal(await g.castSpell(p, c, {from: offer.from, alt: offer.alt}), true);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0); return c;
  };
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  for (let i = 0; i < 9; i++) f.put('Forest', 'library');
  for (let i = 0; i < 12; i++) f.put('Forest', 'library', b);
  for (let i = 0; i < 13; i++) f.put('Island', 'battlefield');
  for (let i = 0; i < 2; i++) f.put('Mountain', 'battlefield');
  const archmage = await f.cast('Archmage Emeritus'), veyran = await f.cast('Veyran, Voice of Duality');
  g.turnNo++; await g.runBeginningPhase(a); g.phase = 'main1'; g.step = 'main';
  await f.cast('Opt'); await f.cast('Opt');
  assert.equal(a.library.length, 2, 'native draw step and two doubled magecraft Opt casts leave two cards');
  if (disabled) {
    g.turnPlayer = b; for (let i = 0; i < 2; i++) f.put('Plains', 'battlefield', b);
    f.target = disabled === 'source' ? archmage : veyran;
    const mutation = await f.cast('Darksteel Mutation', b);
    assert.equal(mutation.attachedTo, f.target.iid); assert.equal(f.target.cur.abilitiesDisabled, true);
  }
  g.turnPlayer = b; g.phase = 'end'; g.step = 'end';
  f.bot = () => { a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'}); };
  f.clean = () => {
    assert.equal((g.aiDecisionLog || []).some(row => row.fallback), false);
    assert.equal(g.stack.length + g.pendingTriggers.length, 0); assertGameStateInvariants(g, 'native magecraft safety');
  };
  return {...f, archmage, veyran};
}

for (const [disabled, expected] of [['source', 1], ['doubler', 2]]) {
  test(`paid human Opt draws exactly ${expected} after native Mutation disables the magecraft ${disabled}`, async () => {
    const f = await paidPosition(disabled), before = f.a.library.length;
    const spell = await f.cast('Opt'); assert.equal(spell.zone, 'graveyard');
    assert.equal(f.a.library.length, before - expected); assert.equal(f.a.lost, false); f.clean();
  });
}

test('AI preserves its library when paid active Archmage and Veyran make the next Opt draw three', async t => {
  const f = await paidPosition(), spell = f.put('Opt');
  t.diagnostic(JSON.stringify({instant: spell.is('Instant'), operations: spell.def.oracleImplementation,
    sourceHint: f.archmage.def.mandatoryCastDraw, doubler: f.veyran.def.doublesMagecraft}));
  f.bot(); await f.g.priorityRound(f.b);
  t.diagnostic(JSON.stringify({lost: f.a.lost, chosen: f.g.aiDecisionLog.map(row => row.chosen)}));
  assert.equal(f.a.lost, false); assert.equal(f.a.library.length, 2); assert.equal(spell.zone, 'hand'); f.clean();
});

for (const [disabled, expected] of [['source', 1], ['doubler', 2]]) {
  test(`AI may pay safe Opt after native Mutation disables the magecraft ${disabled}`, async t => {
    const f = await paidPosition(disabled), before = f.a.library.length, spell = f.put('Opt');
    f.bot(); await f.g.priorityRound(f.b);
    t.diagnostic(JSON.stringify({disabled, spellZone: spell.zone, library: f.a.library.length,
      chosen: f.g.aiDecisionLog.map(row => row.chosen)}));
    assert.equal(f.a.lost, false); assert.equal(spell.zone, 'graveyard');
    assert.equal(f.a.library.length, before - expected); f.clean();
  });
}
