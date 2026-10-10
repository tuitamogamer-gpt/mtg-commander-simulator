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


for (const route of ['front-stays', 'front-to-back', 'back-to-front']) test('paid temporary Cytoshape ends on the current physical Keeper face ' + route, async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage'), bear = f.put('Grizzly Bears');
  for (let i = 0; i < 4; i++) f.put('Falkenrath Noble');
  if (route === 'back-to-front') {
    const mana = f.lands(['Swamp'])[0], entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
    assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true); assert.equal(mana.tapped, true);
    assert.equal(keeper.name, 'Lord of Lineage'); assert.equal(keeper.oracleFace, 'back');
  }
  const spell = f.put('Cytoshape', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.cards = (p, q) => q.prompt?.includes('become a copy') && q.from.includes(bear) ? [bear] : undefined;
  await cast(f, spell); assert.ok(mana.every(card => card.tapped)); assert.equal(keeper.name, 'Grizzly Bears');
  if (route !== 'front-stays') {
    const selection = f.put('Unnatural Selection', 'hand'), payment = f.lands(['Island', 'Forest']);
    await cast(f, selection); assert.ok(payment.every(card => card.tapped));
    f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
    const activationMana = f.lands(['Forest'])[0], ability = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
    assert.ok(ability); assert.equal(await f.g.activateAbility(f.a, ability), true); assert.equal(activationMana.tapped, true);
    assert.equal(keeper.hasSub('Human'), true);
    const moonmist = f.put('Moonmist', 'hand'), green = f.lands(['Forest', 'Forest']);
    await cast(f, moonmist); assert.ok(green.every(card => card.tapped)); assert.equal(keeper.name, 'Grizzly Bears');
  }
  const expectedFace = route === 'front-to-back' ? 'back' : 'front';
  assert.equal(keeper.oracleFace, expectedFace);
  await f.g.runEndStepV90(f.a); await f.g.runCleanupPhaseV80(f.a);
  assert.equal(keeper.oracleFace, expectedFace); assert.equal(keeper.name, expectedFace === 'back' ? 'Lord of Lineage' : 'Bloodline Keeper');
  assert.equal(keeper.isCopyOf, null); assert.equal(keeper.hasSub('Human'), false);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'temporary copy current physical face restoration'); assertRecalculationStable(f.g, 'temporary copy current physical face restoration');
});
