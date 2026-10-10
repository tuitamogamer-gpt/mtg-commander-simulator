import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table(seed = 101026101) {
  const g = new M.Game({seed, paced: false, maxTurns: 12});
  const players = ['Caster', 'First opponent', 'Chosen opponent', 'Fourth'].map(name =>
    g.addPlayer(name, {name: 'Second native targets audit'}, null, false));
  const [a, b, c, d] = players, f = {g, a, b, c, d, players, questions: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    f.questions.push({p, q});
    if (q.type === 'priority') return f.priority?.(p, q) ?? {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cards?.(p, q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return f.x?.(p, q) ?? q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
    throw Error('Unhandled second native targets choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 8; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'actual registered card: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else owner[zone].push(card);
    g.recalc(); return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let i = 0; i < 12; i++) f.put('Forest', 'library', p);
  return f;
}

async function cast(f, card, predicate = () => true, p = f.a) {
  const row = f.g.castableList(p).find(row => row.card === card && predicate(row));
  assert.ok(row, 'actual paid cast offer: ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: row.from, alt: row.alt}), true);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name); assertRecalculationStable(f.g, card.name);
}


for (const intervening of [false, true]) test('paid converted Optimus delayed conversion respects the source since creation ' + intervening, async () => {
  const f = table(), prime = f.put('Optimus Prime, Hero // Optimus Prime, Autobot Leader', 'hand');
  const convertedMana = f.lands(['Island', 'Mountain', 'Plains', 'Forest', 'Forest']);
  await cast(f, prime, row => !!row.alt?.oracleConvertedV22); assert.ok(convertedMana.every(card => card.tapped));
  assert.equal(prime.oracleFace, 'back'); assert.equal(prime.name, 'Optimus Prime, Autobot Leader'); assert.equal(prime.is('Creature'), true);
  const haste = f.put('Mass Hysteria', 'hand'), red = f.lands(['Mountain'])[0]; await cast(f, haste); assert.equal(red.tapped, true);
  const selection = f.put('Unnatural Selection', 'hand'), mana = f.lands(['Island', 'Forest']); await cast(f, selection); assert.ok(mana.every(card => card.tapped));
  f.targets = (p, q) => q.candidates.includes(prime) ? [prime] : undefined;
  let wolfed = false;
  f.option = (p, q) => q.options.some(row => row.key === (wolfed ? 'Wolf' : 'Human')) ? (wolfed ? 'Wolf' : 'Human') : undefined;
  const green = f.lands(['Forest'])[0], ability = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
  assert.ok(ability); assert.equal(await f.g.activateAbility(f.a, ability), true); assert.equal(green.tapped, true); assert.equal(prime.hasSub('Human'), true);
  const moonmist = f.put('Moonmist', 'hand'), responseMana = f.lands(['Forest', 'Forest']), wolfMana = f.lands(['Forest'])[0];
  f.attackers = (p, q) => {assert.ok(q.eligible.includes(prime)); return [{card: prime, target: f.b}];};
  let sawDelay = false, responded = false;
  f.priority = (p, q) => {
    if (!f.g.delayed.some(row => /Convert Optimus Prime/.test(row.name || ''))) return undefined;
    sawDelay = true;
    if (intervening && responded && !wolfed && prime.oracleFace === 'front' && p === f.a) {
      const entry = q.acts?.find(row => row.card === selection && !row.manaAbility);
      if (entry) {wolfed = true; return {kind: 'activate', entry};}
    }
    if (!intervening || p !== f.a || responded) return undefined;
    const row = q.casts?.find(row => row.card === moonmist); if (!row) return undefined;
    responded = true; return {kind: 'cast', card: moonmist, from: row.from, alt: row.alt};
  };
  await f.g.combatPhase(f.a);
  assert.equal(sawDelay, true); assert.equal(responded, intervening); assert.equal(responseMana.every(card => card.tapped), intervening);
  assert.equal(wolfed, intervening); assert.equal(wolfMana.tapped, intervening);
  assert.ok(f.b.life < 40, 'the bolstered creature actually dealt combat damage to the defending player');
  assert.equal(prime.counters['+1/+1'], 2); assert.equal(prime.oracleTransformCount, 1); assert.equal(prime.oracleFace, 'front'); assert.equal(prime.name, 'Optimus Prime, Hero');
  assert.equal(moonmist.zone, intervening ? 'graveyard' : 'hand');
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'actual converted attack delayed source'); assertRecalculationStable(f.g, 'actual converted attack delayed source');
});
