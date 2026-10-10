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


test('paid ordinary ability copy captures source transformation history when the copy enters the Stack', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < 5; i++) f.put('Falkenrath Noble');
  const selection = f.put('Unnatural Selection', 'hand'), selectionMana = f.lands(['Island', 'Forest']);
  await cast(f, selection); assert.ok(selectionMana.every(c => c.tapped));
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : q.options.find(row => /^Copy/i.test(row.label || '') && !/Change/i.test(row.label || ''))?.key;
  const typeMana = f.lands(['Forest'])[0], type = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
  assert.ok(type); assert.equal(await f.g.activateAbility(f.a, type), true); assert.equal(typeMana.tapped, true); assert.equal(keeper.hasSub('Human'), true);
  const moonmist = f.put('Moonmist', 'hand'), moonMana = f.lands(['Forest', 'Forest']);
  const favor = f.put('Return the Favor', 'hand'), favorMana = f.lands(['Mountain', 'Mountain', 'Forest']);
  const stifle = f.put('Stifle', 'hand', f.b), stifleMana = f.lands(['Island'], f.b)[0];
  const activationMana = f.lands(['Swamp'])[0];
  let original, stage = 0, sawCopy = false;
  f.targets = (p, q) => original && q.candidates.includes(original) ? [original] : undefined;
  f.priority = (p, q) => {
    original ||= f.g.stack.find(row => row.kind === 'ability' && row.srcCard === keeper);
    if (!original || !f.g.stack.includes(original)) return undefined;
    const copy = f.g.stack.find(row => row !== original && row.kind === 'ability' && row.srcCard === keeper);
    if (copy) sawCopy = true;
    if (p === f.a && stage === 0) {
      const row = q.casts?.find(row => row.card === moonmist); if (row) {stage = 1; return {kind:'cast', card:moonmist, from:row.from, alt:row.alt};}
    }
    if (p === f.a && stage === 1 && keeper.oracleTransformCount === 1) {
      const row = q.casts?.find(row => row.card === favor); if (row) {stage = 2; return {kind:'cast', card:favor, from:row.from, alt:row.alt};}
    }
    if (p === f.b && stage === 2 && sawCopy && !copy) {
      const row = q.casts?.find(row => row.card === stifle); if (row) {stage = 3; return {kind:'cast', card:stifle, from:row.from, alt:row.alt};}
    }
    return undefined;
  };
  const entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(stage, 3); assert.equal(sawCopy, true); assert.equal(activationMana.tapped, true);
  assert.ok(moonMana.every(c => c.tapped)); assert.ok(favorMana.every(c => c.tapped)); assert.equal(stifleMana.tapped, true);
  assert.equal(moonmist.zone, 'graveyard'); assert.equal(favor.zone, 'graveyard'); assert.equal(stifle.zone, 'graveyard');
  assert.equal(keeper.oracleTransformCount, 2); assert.equal(keeper.oracleFace, 'front'); assert.equal(keeper.name, 'Bloodline Keeper');
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'native copied ability placement history'); assertRecalculationStable(f.g, 'native copied ability placement history');
});

test('paid copy of an Aang delayed trigger retains its source transformation history from delay creation', async () => {
  const f = table(), aang = f.put('Aang, at the Crossroads // Aang, Destined Savior', 'hand'), mana = f.lands(['Island', 'Plains', 'Forest', 'Forest', 'Forest']);
  await cast(f, aang); assert.ok(mana.every(c => c.tapped));
  const seer = f.put('Viscera Seer', 'hand'), black = f.lands(['Swamp'])[0]; await cast(f, seer); assert.equal(black.tapped, true);
  const bear = f.put('Grizzly Bears'); f.cards = (p, q) => q.from.includes(bear) ? [bear] : undefined;
  const sacrifice = f.g.activatableList(f.a).find(row => row.card === seer && !row.manaAbility);
  assert.ok(sacrifice); assert.equal(await f.g.activateAbility(f.a, sacrifice), true); assert.equal(bear.zone, 'graveyard');
  assert.equal(f.g.delayed.filter(row => row.src === aang).length, 1);
  const moonmist = f.put('Moonmist', 'hand'), moonMana = f.lands(['Forest', 'Forest']);
  await cast(f, moonmist); assert.ok(moonMana.every(c => c.tapped)); assert.equal(aang.oracleTransformCount, 1); assert.equal(aang.oracleFace, 'back');
  const favor = f.put('Return the Favor', 'hand'), favorMana = f.lands(['Mountain', 'Mountain', 'Forest']);
  const stifle = f.put('Stifle', 'hand', f.b), stifleMana = f.lands(['Island'], f.b)[0];
  let original, stage = 0, sawCopy = false;
  f.option = (p, q) => q.options.find(row => /^Copy/i.test(row.label || '') && !/Change/i.test(row.label || ''))?.key;
  f.targets = (p, q) => original && q.candidates.includes(original) ? [original] : undefined;
  f.priority = (p, q) => {
    original ||= f.g.stack.find(row => row.kind === 'trigger' && row.srcCard === aang);
    if (!original || !f.g.stack.includes(original)) return undefined;
    const copy = f.g.stack.find(row => row !== original && row.kind === 'trigger' && row.srcCard === aang);
    if (copy) sawCopy = true;
    if (p === f.a && stage === 0) {
      const row = q.casts?.find(row => row.card === favor); if (row) {stage = 1; return {kind:'cast', card:favor, from:row.from, alt:row.alt};}
    }
    if (p === f.b && stage === 1 && sawCopy && !copy) {
      const row = q.casts?.find(row => row.card === stifle); if (row) {stage = 2; return {kind:'cast', card:stifle, from:row.from, alt:row.alt};}
    }
    return undefined;
  };
  await f.g.runUpkeepStepV90(f.a);
  assert.equal(stage, 2); assert.equal(sawCopy, true); assert.ok(favorMana.every(c => c.tapped)); assert.equal(stifleMana.tapped, true);
  assert.equal(favor.zone, 'graveyard'); assert.equal(stifle.zone, 'graveyard');
  assert.equal(aang.oracleTransformCount, 1); assert.equal(aang.oracleFace, 'back'); assert.equal(aang.name, 'Aang, Destined Savior');
  assert.equal(f.g.delayed.filter(row => row.src === aang).length, 0); assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'native copied delayed creation history'); assertRecalculationStable(f.g, 'native copied delayed creation history');
});
