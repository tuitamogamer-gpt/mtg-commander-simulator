import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

async function paidPosition(remaining) {
  const g = new M.Game({seed: 101026183, paced: false, difficulty: 'hard'});
  const a = g.addPlayer('Native manual draw caster', {}, null, true);
  const b = g.addPlayer('Native draw opponent', {}, null, false);
  for (const p of [a, b]) p.controller = {decide: async (_game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native manual draw question: ' + q.type);
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
    const row = g.castableList(a).find(entry => entry.card === card); assert.ok(row, 'native paid spell offer');
    assert.equal(await g.castSpell(a, card, {from: row.from, alt: row.alt}), true);
    return row;
  };
  const botWindow = async () => {
    a.controller = new M.AIController(a, {difficulty: 'hard', style: 'balanced'});
    g.turnPlayer = b; g.phase = 'end'; g.step = 'end'; await g.priorityRound(b);
  };
  const clean = () => {
    assert.equal(g.stack.length + g.pendingTriggers.length, 0);
    assert.equal((g.aiDecisionLog || []).some(row => row.fallback), false);
    assertGameStateInvariants(g, 'native manual printed draw');
  };
  return {g, a, b, put, cast, botWindow, clean};
}

for (const name of ['Radical Idea', 'Think Twice']) {
  for (const remaining of [0, 1]) test(`human pays ${name} and its printed draw ${remaining ? 'safely takes the final card' : 'loses with an empty library'}`, async () => {
    const f = await paidPosition(remaining), spell = f.put(name);
    await f.cast(spell); assert.equal(spell.castMeta.manaSpent, 2);
    assert.equal(f.a.lost, !remaining); assert.equal(f.a.library.length, 0);
    assert.equal(spell.zone, remaining ? 'graveyard' : 'ceased'); f.clean();
  });
  test(`AI declines paid ${name} when its printed own draw would lose from an empty library`, async t => {
    const f = await paidPosition(0), spell = f.put(name);
    assert.ok(f.g.castableList(f.a).some(row => row.card === spell));
    await f.botWindow();
    t.diagnostic(JSON.stringify({name, lost: f.a.lost, zone: spell.zone,
      chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    assert.equal(f.a.lost, false); assert.equal(spell.zone, 'hand'); f.clean();
  });
}

for (const scenario of [{role: 'human', remaining: 0}, {role: 'ai', remaining: 0}, {role: 'ai', remaining: 1}]) {
  test(`${scenario.role} uses actual previously paid Think Twice Flashback with ${scenario.remaining} card remaining`, async t => {
    const f = await paidPosition(scenario.remaining + 1), spell = f.put('Think Twice');
    await f.cast(spell); assert.equal(spell.castMeta.manaSpent, 2);
    assert.equal(spell.zone, 'graveyard'); assert.equal(f.a.library.length, scenario.remaining);
    const offered = f.g.castableList(f.a).find(row => row.card === spell && row.from === 'graveyard');
    assert.ok(offered); assert.ok(offered.alt.flashback);
    if (scenario.role === 'human') await f.cast(spell); else await f.botWindow();
    t.diagnostic(JSON.stringify({scenario, lost: f.a.lost, zone: spell.zone,
      chosen: (f.g.aiDecisionLog || []).map(row => row.chosen)}));
    assert.equal(f.a.lost, scenario.role === 'human');
    if (scenario.role === 'ai' && !scenario.remaining) assert.equal(spell.zone, 'graveyard');
    else { assert.equal(spell.zone, scenario.role === 'human' ? 'ceased' : 'exile');
      assert.equal(spell.castMeta.manaSpent, 3); }
    assert.equal(f.a.library.length, 0); f.clean();
  });
}
