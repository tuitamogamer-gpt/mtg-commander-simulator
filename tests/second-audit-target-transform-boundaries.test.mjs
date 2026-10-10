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


for (const order of ['none', 'under', 'over']) test('a paid copied Keeper ability cannot turn physical Jwari onto its instant face after mutation ' + order, async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < 4; i++) f.put('Falkenrath Noble');
  const physical = f.put('Jwari Disruption // Jwari Ruins', 'hand');
  assert.equal(await f.g.playLand(f.a, physical, {oracleFace: 'back'}), true); assert.equal(physical.is('Land'), true);
  const animate = f.put('Animate Land', 'hand'); f.lands(['Forest']);
  f.targets = (p, q) => q.candidates.includes(physical) ? [physical] : undefined;
  await cast(f, animate); assert.equal(physical.is('Creature'), true);
  const copy = f.put('Cytoshape', 'hand'), copyMana = f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('become a copy') && q.from.includes(keeper) ? [keeper] : undefined;
  await cast(f, copy); assert.ok(copyMana.every(card => card.tapped)); assert.equal(physical.name, 'Bloodline Keeper');
  if (order !== 'none') {
    const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
    f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
    await cast(f, heron, row => !!row.alt?.mutate);
  }
  const mana = f.lands(['Swamp'])[0];
  const entry = f.g.activatableList(f.a).find(row => row.card === physical && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true); assert.equal(mana.tapped, true);
  assert.equal(order === 'none' ? physical.oracleFace : physical.mutateState.components.find(row => row.card === physical).oracleFace, 'back');
  assert.equal(physical.oracleTransformCount, 0, 'CR712.10 prohibits an instant physical face despite a still-active creature copy effect');
  assert.equal(physical.name, order === 'over' ? 'Dreamtail Heron' : 'Bloodline Keeper');
  assertGameStateInvariants(f.g, 'copied transform instant physical face'); assertRecalculationStable(f.g, 'copied transform instant physical face');
});

for (const doubled of [false, true]) test('printed Huntmaster upkeep transform respects one source transformation with paid Human Throne ' + doubled, async () => {
  const f = table(), huntmaster = f.put('Huntmaster of the Fells // Ravager of the Fells', 'hand');
  f.lands(['Mountain', 'Forest', 'Forest', 'Forest']); await cast(f, huntmaster);
  assert.equal(huntmaster.name, 'Huntmaster of the Fells'); assert.equal(huntmaster.hasSub('Human'), true);
  if (doubled) {
    const throne = f.put('Roaming Throne', 'hand'), mana = f.lands(['Forest', 'Forest', 'Forest', 'Forest']);
    f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
    await cast(f, throne); assert.ok(mana.every(card => card.tapped)); assert.equal(throne.meta.cslType, 'Human');
  }
  let triggerCount = 0;
  f.priority = (p, q) => { triggerCount = Math.max(triggerCount, f.g.stack.filter(row => row.kind === 'trigger' && row.srcCard === huntmaster).length); };
  f.targets = (p, q) => q.candidates.includes(f.b) ? [f.b] : undefined;
  await f.g.runUpkeepStepV90(f.a);
  assert.equal(triggerCount, doubled ? 2 : 1, 'printed upkeep plus actual Throne replacement creates the announced stack abilities');
  assert.equal(huntmaster.oracleTransformCount, 1); assert.equal(huntmaster.oracleFace, 'back'); assert.equal(huntmaster.name, 'Ravager of the Fells');
  assert.equal(f.b.life, 38); assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'native upkeep transform context'); assertRecalculationStable(f.g, 'native upkeep transform context');
});
