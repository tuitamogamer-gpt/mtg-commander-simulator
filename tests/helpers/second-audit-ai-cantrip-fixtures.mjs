import assert from 'node:assert/strict';
import {loadEngine} from './load-engine.mjs';
import {assertGameStateInvariants} from './game-state-invariants.mjs';

export const M = loadEngine();
export async function cantripPosition(remaining) {
  const g = new M.Game({seed: 101026191, paced: false, difficulty: 'hard'});
  const a = g.addPlayer('Native cantrip caster', {}, null, true);
  const b = g.addPlayer('Native cantrip opponent', {}, null, false);
  for (const p of [a, b]) p.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native cantrip question: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 9; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  const put = (name, zone = 'hand', owner = a) => {
    assert.ok(M.DEFS[name], 'registered printed card: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? g.battlefield : owner[zone]).push(card); g.recalc(); return card;
  };
  for (let i = 0; i < remaining + 1; i++) put('Forest', 'library');
  for (let i = 0; i < 12; i++) put('Forest', 'library', b);
  for (let i = 0; i < 9; i++) put('Island', 'battlefield');
  g.turnNo++; await g.runBeginningPhase(a);
  assert.equal(a.library.length, remaining); g.phase = 'main1'; g.step = 'main';
  const cast = async card => {
    const row = g.castableList(a).find(entry => entry.card === card); assert.ok(row);
    assert.equal(await g.castSpell(a, card, {from: row.from, alt: row.alt}), true); return row;
  };
  const botWindow = async instant => {
    a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
    if (instant) { g.turnPlayer = b; g.phase = 'end'; g.step = 'end'; await g.priorityRound(b); }
    else await g.mainPhase(a);
  };
  const clean = () => {
    assert.equal(g.stack.length + g.pendingTriggers.length, 0);
    assert.equal((g.aiDecisionLog || []).some(row => row.fallback), false);
    assertGameStateInvariants(g, 'native manual cantrip');
  };
  return {g, a, b, put, cast, botWindow, clean};
}
