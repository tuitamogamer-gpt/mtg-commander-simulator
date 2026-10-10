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


async function nativeIncubator(f) {
  const processor = f.put('Bloated Processor', 'hand'), castMana = f.lands(['Swamp', 'Forest', 'Forest']);
  await cast(f, processor); assert.ok(castMana.every(card => card.tapped));
  const shock = f.put('Shock', 'hand'), red = f.lands(['Mountain'])[0];
  f.targets = (p, q) => q.candidates.includes(processor) ? [processor] : undefined;
  await cast(f, shock); assert.equal(red.tapped, true); assert.equal(processor.zone, 'graveyard');
  const token = f.g.bf().find(card => card.isToken && card.hasSub('Incubator'));
  assert.ok(token); assert.equal(token.counters['+1/+1'], 3); assert.equal(token.oracleFace, 'front'); return token;
}

for (const doubled of [false, true]) test('native paid Incubator transformations respect the same source Stack history ' + doubled, async () => {
  const f = table(), token = await nativeIncubator(f), mana = f.lands(Array.from({length: doubled ? 4 : 2}, () => 'Forest'));
  let responded = false, sawTwo = false;
  f.priority = (p, q) => {
    if (f.g.stack.filter(row => row.kind === 'ability' && row.srcCard === token).length === 2) sawTwo = true;
    if (!doubled || p !== f.a || responded || !f.g.stack.some(row => row.kind === 'ability' && row.srcCard === token)) return undefined;
    const entry = q.acts?.find(row => row.card === token && /transform/i.test(row.ability?.label || ''));
    if (!entry) return undefined; responded = true; return {kind: 'activate', entry};
  };
  const entry = f.g.activatableList(f.a).find(row => row.card === token && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true); assert.ok(mana.every(card => card.tapped));
  assert.equal(responded, doubled); assert.equal(sawTwo, doubled);
  assert.equal(token.oracleTransformCount, 1); assert.equal(token.oracleFace, 'back'); assert.equal(token.hasSub('Phyrexian'), true);
  assert.equal(token.power, 3); assert.equal(token.toughness, 3); assert.equal(f.g.stack.length, 0);
  assertGameStateInvariants(f.g, 'paid incubator ability Stack source'); assertRecalculationStable(f.g, 'paid incubator ability Stack source');
});

test('paid Glissa transforms a different Incubator whose two previous transformations exceed the source count', async () => {
  const f = table(), token = await nativeIncubator(f);
  const march = f.put('March of the Machines', 'hand'), marchMana = f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  await cast(f, march); assert.ok(marchMana.every(card => card.tapped)); assert.equal(token.is('Creature'), true);
  const selection = f.put('Unnatural Selection', 'hand'), selectionMana = f.lands(['Island', 'Forest']);
  await cast(f, selection); assert.ok(selectionMana.every(card => card.tapped));
  f.targets = (p, q) => q.candidates.includes(token) ? [token] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
  const selectionPay = f.lands(['Forest'])[0], ability = f.g.activatableList(f.a).find(row => row.card === selection && !row.manaAbility);
  assert.ok(ability); assert.equal(await f.g.activateAbility(f.a, ability), true); assert.equal(selectionPay.tapped, true); assert.equal(token.hasSub('Human'), true);
  for (let i = 0; i < 2; i++) {
    const spell = f.put('Moonmist', 'hand'), mana = f.lands(['Forest', 'Forest']); await cast(f, spell); assert.ok(mana.every(card => card.tapped));
  }
  assert.equal(token.oracleFace, 'front'); assert.equal(token.oracleTransformCount, 2);
  const glissa = f.put('Glissa, Herald of Predation', 'hand'), mana = f.lands(['Swamp', 'Forest', 'Forest', 'Forest', 'Forest']);
  await cast(f, glissa); assert.ok(mana.every(card => card.tapped)); assert.equal(glissa.oracleTransformCount, 0);
  f.option = (p, q) => {
    if (q.aiHint?.src !== glissa) return undefined;
    const mode = q.options.find(row => row.key === '1');
    assert.ok(mode, 'the actually offered second printed Glissa mode transforms Incubators');
    return mode.key;
  };
  let receipt;
  f.priority = (p, q) => {const so = f.g.stack.find(row => row.kind === 'trigger' && row.srcCard === glissa); if (so) receipt = {iid: so.ctx.sourceTransformIid, count: so.ctx.sourceTransformCount};};
  // The paid Human type change ends before Glissa counts actual Incubators.
  await f.g.runEndStepV90(f.a); await f.g.runCleanupPhaseV80(f.a);
  assert.equal(token.hasSub('Incubator'), true);
  await f.g.runTurn();
  assert.ok(receipt); assert.equal(token.oracleFace, 'back'); assert.equal(token.oracleTransformCount, 3);
  assert.equal(glissa.oracleTransformCount, 0); assert.equal(token.hasSub('Phyrexian'), true);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'different receiver transform history'); assertRecalculationStable(f.g, 'different receiver transform history');
});
