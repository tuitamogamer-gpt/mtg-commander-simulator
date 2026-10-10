import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({seed: 101026151, paced: false, difficulty: 'hard', maxTurns: 30});
  const a = g.addPlayer('Native library strategist', {name: 'Library safety'}, null, true);
  const b = g.addPlayer('Native library opponent', {name: 'Library control'}, null, false);
  const f = {g, a, b, choices: {}};
  const human = p => { p.controller = {decide: async (_game, q) => {
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
    if (q.type === 'attackers' || q.type === 'blockers') return [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native library question: ' + q.type);
  }}; };
  human(a); human(b);
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
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
  f.bot = () => { a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'}); return a.controller; };
  f.clean = () => {
    assert.equal((g.aiDecisionLog || []).some(row => row.fallback), false);
    assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
    assertGameStateInvariants(g, 'native library safety');
  };
  for (let i = 0; i < 4; i++) f.put('Forest', 'library');
  for (let i = 0; i < 12; i++) f.put('Forest', 'library', b);
  return f;
}

async function paidPosition({guard = 'Arcanis the Omnipotent', protection, disabled = false} = {}) {
  const f = table();
  for (let i = 0; i < 13; i++) f.put('Island', 'battlefield');
  const source = guard ? await f.cast(guard) : null;
  const protector = protection ? await f.cast(protection) : null;
  f.g.turnNo++; await f.g.runBeginningPhase(f.a);
  if (source) assert.equal(source.sick, false);
  f.g.phase = 'main1'; f.g.step = 'main';
  const opt = await f.cast('Opt'); assert.equal(opt.zone, 'graveyard');
  assert.equal(f.a.library.length, 2, 'native upkeep draw and paid Opt leave exactly two cards');
  if (disabled) {
    f.g.turnPlayer = f.b;
    for (let i = 0; i < 2; i++) f.put('Plains', 'battlefield', f.b);
    f.choices.targets = (p, q) => q.candidates.includes(protector) ? [protector] : q.candidates.slice(0, q.min ?? 1);
    const mutation = await f.cast('Darksteel Mutation', f.b);
    assert.equal(mutation.attachedTo, protector.iid); assert.equal(protector.cur.abilitiesDisabled, true);
    f.g.turnPlayer = f.a;
  }
  return {...f, source, protector};
}

test('paid Arcanis can actually lose by drawing three from a two-card library', async () => {
  const f = await paidPosition(), row = f.g.activatableList(f.a).find(entry =>
    entry.card === f.source && entry.ability?.cost?.tap);
  assert.ok(row); assert.equal(await f.g.activateAbility(f.a, row), true);
  assert.equal(f.a.lost, true); assert.equal(f.b.lost, false); assert.equal(f.g.gameOver, true);
  f.clean();
});

test('AI declines paid Arcanis draw three when the native third draw would lose the game', async t => {
  const f = await paidPosition(); f.bot(); await f.g.mainPhase(f.a);
  t.diagnostic(JSON.stringify({lost: f.a.lost, library: f.a.library.length,
    sourceZone: f.source.zone, decisions: f.g.aiDecisionLog.map(row => row.chosen)}));
  assert.equal(f.a.lost, false); assert.equal(f.a.library.length, 2);
  assert.equal(f.source.zone, 'battlefield'); assert.equal(f.source.tapped, false); f.clean();
});

test('AI uses paid Arcanis to win through an actual active Laboratory Maniac', async () => {
  const f = await paidPosition({protection: 'Laboratory Maniac'}); f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.a.lost, false); assert.equal(f.b.lost, true); assert.equal(f.g.winner === f.a, true);
  assert.equal(f.source.tapped, true); f.clean();
});

test('AI still declines a paid three-card Concentrate spell without an empty-library win source', async () => {
  const f = await paidPosition({guard: null}), spell = f.put('Concentrate');
  assert.ok(f.g.castableList(f.a).some(row => row.card === spell)); f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.a.lost, false); assert.equal(f.a.library.length, 2); assert.equal(spell.zone, 'hand'); f.clean();
});

test('AI declines Concentrate when paid Darksteel Mutation disabled its real Laboratory Maniac', async t => {
  const f = await paidPosition({guard: null, protection: 'Laboratory Maniac', disabled: true});
  const spell = f.put('Concentrate'); f.bot(); await f.g.mainPhase(f.a);
  t.diagnostic(JSON.stringify({lost: f.a.lost, library: f.a.library.length,
    disabled: f.protector.cur.abilitiesDisabled, spellZone: spell.zone}));
  assert.equal(f.a.lost, false); assert.equal(f.a.library.length, 2); assert.equal(spell.zone, 'hand'); f.clean();
});

test('AI casts Concentrate to win through a paid active Laboratory Maniac', async () => {
  const f = await paidPosition({guard: null, protection: 'Laboratory Maniac'}), spell = f.put('Concentrate');
  f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.a.lost, false); assert.equal(f.b.lost, true); assert.equal(f.g.winner === f.a, true);
  assert.equal(spell.zone, 'graveyard'); f.clean();
});

test('AI may draw its remaining cards through paid Platinum Angel actual loss prevention', async () => {
  const f = await paidPosition({protection: 'Platinum Angel'});
  assert.equal(f.g.canLoseGame(f.a), false); f.bot(); await f.g.mainPhase(f.a);
  assert.equal(f.a.lost, false); assert.equal(f.a.library.length, 0);
  assert.equal(f.source.zone, 'battlefield'); assert.equal(f.source.tapped, true); f.clean();
});
