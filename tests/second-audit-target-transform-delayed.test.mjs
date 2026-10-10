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


for (const route of ['one', 'moonmist-before-upkeep', 'two']) test('paid Aang native delayed transform remembers its source since creation ' + route, async () => {
  const f = table(), aang = f.put('Aang, at the Crossroads // Aang, Destined Savior', 'hand');
  const mana = f.lands(['Island', 'Plains', 'Forest', 'Forest', 'Forest']); await cast(f, aang);
  assert.ok(mana.every(card => card.tapped)); assert.equal(aang.hasSub('Human'), true);
  const seer = f.put('Viscera Seer', 'hand'), black = f.lands(['Swamp'])[0]; await cast(f, seer); assert.equal(black.tapped, true);
  const bears = Array.from({length: route === 'two' ? 2 : 1}, () => f.put('Grizzly Bears'));
  for (const bear of bears) {
    f.cards = (p, q) => q.from.includes(bear) ? [bear] : undefined;
    const entry = f.g.activatableList(f.a).find(row => row.card === seer && !row.manaAbility);
    assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true); assert.equal(bear.zone, 'graveyard');
  }
  assert.equal(f.g.delayed.filter(row => row.src === aang).length, bears.length);
  if (route === 'moonmist-before-upkeep') {
    const spell = f.put('Moonmist', 'hand'), payment = f.lands(['Forest', 'Forest']);
    await cast(f, spell); assert.ok(payment.every(card => card.tapped)); assert.equal(aang.oracleFace, 'back');
  }
  await f.g.runUpkeepStepV90(f.a);
  assert.equal(aang.oracleTransformCount, 1, 'a delayed transform uses source history since it was created, including transformation before upkeep');
  assert.equal(aang.oracleFace, 'back'); assert.equal(f.g.delayed.filter(row => row.src === aang).length, 0);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'native delayed source transform'); assertRecalculationStable(f.g, 'native delayed source transform');
});
