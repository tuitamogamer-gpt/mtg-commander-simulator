import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function table(role, generic, color = 'Mountain') {
  const g = new M.Game({seed: 101026103, paced: false, maxTurns: 10});
  const players = ['Caster', 'Opponent', 'Third', 'Fourth'].map(name => g.addPlayer(name, {name: 'Native X target audit'}, null, role === 'ai'));
  const [a, b] = players, f = {g, a, b, x: 2};
  for (const p of players) p.controller = {decide: async (game, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'chooseTargets') return [f.target];
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseX') return f.x;
    if (q.type === 'chooseOption') return q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['attackers', 'blockers'].includes(q.type)) return [];
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native X target choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name]); const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
    g.recalc(); return card;
  };
  for (const p of players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  f.mana = [...Array.from({length: generic}, () => f.put('Wastes')), f.put(color)];
  return f;
}

for (const role of ['human', 'ai']) {
  test(role + ': native empty Heat Ray offer stays bounded as real available mana grows', () => {
    const rows = [];
    for (const mana of [8, 64]) {
      const f = table(role, mana), spell = f.put('Heat Ray', 'hand');
      const targetSpecs = f.g.spellTargetSpecs; let probes = 0;
      f.g.spellTargetSpecs = function (...args) {probes++; return targetSpecs.apply(this, args);};
      assert.equal(f.g.castableList(f.a).some(row => row.card === spell), false);
      assert.ok(f.mana.every(card => !card.tapped), 'offer checks do not spend actual mana');
      rows.push({mana, probes});
    }
    console.log(JSON.stringify({role, nativeEmptyHeatRay: rows}));
    assert.ok(rows[1].probes <= rows[0].probes + 1, 'eight times more mana does not cause an X-by-X target scan');
  });
  for (const [name, color, targetName, x, destination] of [
    ['Repeal', 'Island', 'Grizzly Bears', 2, 'hand'],
    ['Disembowel', 'Swamp', 'Grizzly Bears', 2, 'graveyard'],
    ['By Force', 'Mountain', 'Sol Ring', 1, 'graveyard'],
  ]) test(role + ': native paid ' + name + ' retains the smaller legal target threshold', async () => {
    const f = table(role, 8, color), spell = f.put(name, 'hand');
    f.target = f.put(targetName, 'battlefield', f.b); f.x = x;
    const offer = f.g.castableList(f.a).find(row => row.card === spell);
    assert.ok(offer, 'native offer includes the actual legal smaller X');
    assert.equal(await f.g.castSpell(f.a, spell, {from: offer.from, alt: offer.alt}), true);
    assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
    assert.equal(f.mana.filter(card => card.tapped).length, x + 1, 'actual colored and generic mana costs are paid');
    assert.equal(f.target.zone, destination); assert.equal(spell.zone, 'graveyard');
    assertGameStateInvariants(f.g, name + ' native X threshold');
  });
}
