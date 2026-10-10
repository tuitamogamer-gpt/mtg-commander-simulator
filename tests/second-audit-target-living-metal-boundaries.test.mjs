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
    if (['attackers', 'blockers'].includes(q.type)) return [];
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


async function nexus(f) {
  const card = f.put('Maskwood Nexus', 'hand'), mana = f.lands(['Forest', 'Forest', 'Forest', 'Forest']);
  await cast(f, card); assert.ok(mana.every(c => c.tapped)); return card;
}
async function convertedPrime(f) {
  const card = f.put('Optimus Prime, Hero // Optimus Prime, Autobot Leader', 'hand'), mana = f.lands(['Island', 'Mountain', 'Plains', 'Forest', 'Forest']);
  await cast(f, card, row => !!row.alt?.oracleConvertedV22); assert.ok(mana.every(c => c.tapped)); assert.equal(card.oracleFace, 'back'); return card;
}
test('paid older Nexus applies all creature types to a newly paid converted living-metal Vehicle', async () => {
  const f = table(); await nexus(f); const prime = await convertedPrime(f);
  assert.equal(prime.is('Creature'), true); assert.equal(prime.hasSub('Human'), true); assert.equal(prime.hasSub('Wolf'), true);
  assertGameStateInvariants(f.g, 'older Nexus type dependency'); assertRecalculationStable(f.g, 'older Nexus type dependency');
});
test('paid converted living metal and Nexus do not turn an ordinary paid artifact into a creature', async () => {
  const f = table(), artifact = f.put('Arcane Signet', 'hand'), mana = f.lands(['Forest', 'Forest']);
  await cast(f, artifact); assert.ok(mana.every(c => c.tapped)); await nexus(f); await convertedPrime(f);
  assert.equal(artifact.is('Creature'), false); assert.equal(artifact.hasSub('Human'), false); assert.equal(artifact.hasSub('Wolf'), false);
  assertGameStateInvariants(f.g, 'Nexus artifact negative'); assertRecalculationStable(f.g, 'Nexus artifact negative');
});
test('paid converted living metal expires its creature type on the real next opponent turn under Nexus', async () => {
  const f = table(), prime = await convertedPrime(f); await nexus(f); assert.equal(prime.is('Creature'), true);
  await f.g.runTurn(); await f.g.runTurn(); assert.notEqual(f.g.turnPlayer.idx, f.a.idx);
  assert.equal(prime.is('Artifact'), true); assert.equal(prime.is('Creature'), false); assert.equal(prime.hasSub('Human'), false); assert.equal(prime.hasSub('Wolf'), false);
  assertGameStateInvariants(f.g, 'native opponent turn living metal'); assertRecalculationStable(f.g, 'native opponent turn living metal');
});
