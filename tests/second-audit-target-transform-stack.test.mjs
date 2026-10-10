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


for (const order of ['none', 'under', 'over']) test('two actually paid Keeper transform abilities on one stack transform only once after mutation ' + order, async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < (order === 'over' ? 5 : 4); i++) f.put('Falkenrath Noble');
  if (order !== 'none') {
    const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
    f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
    f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
    await cast(f, heron, row => !!row.alt?.mutate);
  }
  const mana = f.lands(['Swamp', 'Swamp']); let responded = false, sawTwo = false;
  f.priority = (p, q) => {
    if (f.g.stack.filter(row => row.kind === 'ability' && row.srcCard === keeper).length === 2) sawTwo = true;
    if (p !== f.a || responded) return undefined;
    const entry = q.acts?.find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
    if (!entry || !f.g.stack.some(row => row.kind === 'ability' && row.srcCard === keeper)) return undefined;
    responded = true; return {kind: 'activate', entry};
  };
  const entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  assert.equal(responded, true); assert.equal(sawTwo, true); assert.ok(mana.every(card => card.tapped));
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assert.equal(keeper.oracleTransformCount, 1, 'CR701.27f remembers whether this source has transformed since each ability was stacked');
  assert.equal(order === 'none' ? keeper.oracleFace : keeper.mutateState.components.find(row => row.card === keeper).oracleFace, 'back');
  assert.equal(keeper.name, order === 'over' ? 'Dreamtail Heron' : 'Lord of Lineage');
  assertGameStateInvariants(f.g, 'paid double transform ability'); assertRecalculationStable(f.g, 'paid double transform ability');
});

test('two paid Moonmist spells may each transform the same Human Keeper', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  const selection = f.put('Unnatural Selection', 'hand'); f.lands(['Island', 'Forest']); await cast(f, selection);
  f.lands(['Forest']); f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
  const ability = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
  assert.ok(ability); assert.equal(await f.g.activateAbility(f.a, ability), true); assert.equal(keeper.hasSub('Human'), true);
  const first = f.put('Moonmist', 'hand'), second = f.put('Moonmist', 'hand'), mana = f.lands(['Forest', 'Forest', 'Forest', 'Forest']);
  let responded = false, sawTwo = false;
  f.priority = (p, q) => {
    if (f.g.stack.filter(row => row.kind === 'spell' && [first, second].includes(row.card)).length === 2) sawTwo = true;
    if (p !== f.a || responded || !f.g.stack.some(row => row.card === first)) return undefined;
    const row = q.casts?.find(row => row.card === second); if (!row) return undefined;
    responded = true; return {kind: 'cast', card: second, alt: row.alt, from: row.from};
  };
  await cast(f, first); assert.equal(responded, true); assert.equal(sawTwo, true); assert.ok(mana.every(card => card.tapped));
  assert.equal(keeper.oracleTransformCount, 2); assert.equal(keeper.oracleFace, 'front'); assert.equal(keeper.name, 'Bloodline Keeper');
  assertGameStateInvariants(f.g, 'independent transform spells'); assertRecalculationStable(f.g, 'independent transform spells');
});
