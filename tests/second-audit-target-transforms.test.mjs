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


async function activate(f, source, predicate = () => true) {
  const entry = f.g.activatableList(f.a).find(row => row.card === source && !row.manaAbility && predicate(row));
  assert.ok(entry, 'actual paid activation: ' + source.name);
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
}

async function asHuman(f, source) {
  const selection = f.put('Unnatural Selection', 'hand'), mana = f.lands(['Island', 'Forest']);
  await cast(f, selection); assert.ok(mana.every(card => card.tapped));
  const payment = f.lands(['Forest'])[0];
  f.targets = (p, q) => q.candidates.includes(source) ? [source] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Human') ? 'Human' : undefined;
  await activate(f, selection); assert.equal(payment.tapped, true);
  assert.equal(source.hasSub('Human'), true);
}

async function moonmist(f) {
  const spell = f.put('Moonmist', 'hand'), mana = f.lands(['Forest', 'Forest']);
  await cast(f, spell); assert.ok(mana.every(card => card.tapped));
}

for (const order of ['under', 'over']) test('paid Moonmist transforms a Human merged physical Keeper with mutation ' + order, async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  const heron = f.put('Dreamtail Heron', 'hand');
  f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
  await cast(f, heron, row => !!row.alt?.mutate);
  await asHuman(f, keeper); await moonmist(f);
  assert.equal(keeper.mutateState.components.find(row => row.card === keeper).oracleFace, 'back');
  assert.equal(keeper.name, order === 'under' ? 'Lord of Lineage' : 'Dreamtail Heron');
  assert.equal(keeper.hasSub('Human'), true, 'the live type-changing effect survives transforming the component');
  assertGameStateInvariants(f.g, 'Moonmist merged transform'); assertRecalculationStable(f.g, 'Moonmist merged transform');
});

test('paid Moonmist still transforms an ordinary Human physical Keeper', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  await asHuman(f, keeper); await moonmist(f);
  assert.equal(keeper.oracleFace, 'back'); assert.equal(keeper.name, 'Lord of Lineage');
  assertGameStateInvariants(f.g, 'ordinary Moonmist transform');
});

for (const order of ['none', 'under', 'over']) test('a paid copied Keeper ability transforms the modal physical component while keeping its copied rules ' + order, async () => {
  const f = table(), original = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < 4; i++) f.put('Falkenrath Noble');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(original) ? [original] : undefined;
  await cast(f, mimic); assert.ok(mana.every(card => card.tapped));
  assert.equal(mimic.name, 'Bloodline Keeper'); assert.equal(mimic.oracleFaces.layout, 'modal_dfc');
  if (order !== 'none') {
    const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
    f.targets = (p, q) => q.candidates.includes(mimic) ? [mimic] : undefined;
    f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
    await cast(f, heron, row => !!row.alt?.mutate);
    assert.equal(mimic.zone, 'battlefield', 'paid mutation preserves the copied host as a living merged creature');
    assert.equal(mimic.name, order === 'over' ? 'Dreamtail Heron' : 'Bloodline Keeper');
  }
  const black = f.lands(['Swamp'])[0];
  await activate(f, mimic, row => /transform/i.test(row.ability?.label || ''));
  assert.equal(black.tapped, true);
  assert.equal(order === 'none' ? mimic.oracleFace : mimic.mutateState.components.find(row => row.card === mimic).oracleFace,
    'back', 'a copied transform ability can turn a modal DFC onto its permanent back face');
  assert.equal(mimic.name, order === 'over' ? 'Dreamtail Heron' : 'Bloodline Keeper');
  const secondBlack = f.lands(['Swamp'])[0];
  await activate(f, mimic, row => /transform/i.test(row.ability?.label || ''));
  assert.equal(secondBlack.tapped, true, 'the printed copied transform ability remains available after turning over');
  assert.equal(order === 'none' ? mimic.oracleFace : mimic.mutateState.components.find(row => row.card === mimic).oracleFace, 'front');
  assert.equal(mimic.name, order === 'over' ? 'Dreamtail Heron' : 'Bloodline Keeper');
  assertGameStateInvariants(f.g, 'modal physical transform preserves copy'); assertRecalculationStable(f.g, 'modal physical transform preserves copy');
});

test('paid Moonmist transforms a merged modal Glasspool Mimic made Human while preserving its copied Keeper', async () => {
  const f = table(), original = f.put('Bloodline Keeper // Lord of Lineage');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand');
  f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(original) ? [original] : undefined;
  await cast(f, mimic);
  const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(mimic) ? [mimic] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? 'under' : undefined;
  await cast(f, heron, row => !!row.alt?.mutate);
  await asHuman(f, mimic); await moonmist(f);
  assert.equal(mimic.mutateState.components.find(row => row.card === mimic).oracleFace, 'back');
  assert.equal(mimic.name, 'Bloodline Keeper');
  assertGameStateInvariants(f.g, 'Moonmist modal transform rejection');
});

test('paid Endless Whispers death trigger offers all actual opponents and returns the exact dead card under the third seat', async () => {
  const f = table(), whispers = f.put('Endless Whispers', 'hand');
  const mana = f.lands(['Swamp', 'Swamp', 'Forest', 'Forest']);
  await cast(f, whispers); assert.ok(mana.every(card => card.tapped));
  const bear = f.put('Grizzly Bears'), receipt = bear.zoneVersion, removal = f.put('Go for the Throat', 'hand');
  const killMana = f.lands(['Swamp', 'Forest']); let chosen = false;
  f.targets = (p, q) => {
    if (q.candidates.includes(bear)) return [bear];
    if (q.candidates.includes(f.c)) {
      assert.equal(p.idx, f.a.idx);
      assert.deepEqual(Array.from(q.candidates, player => player.idx), [f.b.idx, f.c.idx, f.d.idx]);
      chosen = true; return [f.c];
    }
    return undefined;
  };
  await cast(f, removal); assert.ok(killMana.every(card => card.tapped));
  assert.equal(chosen, true); assert.equal(bear.zone, 'graveyard');
  assert.equal(bear.zoneVersion, receipt + 1);
  await f.g.runEndStepV90(f.a);
  assert.equal(bear.zone, 'battlefield'); assert.equal(bear.zoneVersion, receipt + 2);
  assert.equal(bear.owner.idx, f.a.idx); assert.equal(bear.ctrl.idx, f.c.idx);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'Endless Whispers native opponent target'); assertRecalculationStable(f.g, 'Endless Whispers native opponent target');
});

test('paid Moonmist transforms a copied modal physical Glasspool onto its land face without ending the copy effect', async () => {
  const f = table(), original = f.put('Bloodline Keeper // Lord of Lineage');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand');
  f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(original) ? [original] : undefined;
  await cast(f, mimic); await asHuman(f, mimic); await moonmist(f);
  assert.equal(mimic.oracleFace, 'back'); assert.equal(mimic.name, 'Bloodline Keeper');
  assert.equal(mimic.hasSub('Human'), true);
  assertGameStateInvariants(f.g, 'copied modal Moonmist transform');
});

for (const name of ['Jwari Disruption // Jwari Ruins', 'Bala Ged Recovery // Bala Ged Sanctuary'])
test('paid Moonmist does not transform an animated Human ' + name + ' onto an instant or sorcery face', async () => {
  const f = table(), land = f.put(name, 'hand');
  assert.equal(await f.g.playLand(f.a, land, {oracleFace: 'back'}), true);
  assert.equal(land.oracleFace, 'back'); assert.equal(land.is('Land'), true);
  const printed = land.name, animate = f.put('Animate Land', 'hand'), green = f.lands(['Forest'])[0];
  f.targets = (p, q) => q.candidates.includes(land) ? [land] : undefined;
  await cast(f, animate); assert.equal(green.tapped, true); assert.equal(land.is('Creature'), true);
  await asHuman(f, land); await moonmist(f);
  assert.equal(land.oracleFace, 'back'); assert.equal(land.name, printed);
  assert.equal(land.is('Land'), true); assert.equal(land.is('Creature'), true);
  assertGameStateInvariants(f.g, 'nonpermanent physical face rejection'); assertRecalculationStable(f.g, 'nonpermanent physical face rejection');
});

test('paid Bound by Moonsilver still prevents Moonmist from transforming an eligible merged Human Keeper', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? 'under' : undefined;
  await cast(f, heron, row => !!row.alt?.mutate);
  const aura = f.put('Bound by Moonsilver', 'hand'), mana = f.lands(['Plains', 'Forest', 'Forest']);
  await cast(f, aura); assert.ok(mana.every(card => card.tapped)); assert.equal(keeper.cur.cantTransformV66, true);
  await asHuman(f, keeper); await moonmist(f);
  assert.equal(keeper.mutateState.components.find(row => row.card === keeper).oracleFace, 'front');
  assert.equal(keeper.name, 'Bloodline Keeper'); assert.equal(keeper.hasSub('Human'), true);
  assertGameStateInvariants(f.g, 'Moonmist merged transform prevention');
});

test('a paid Rite token copy of copied Glasspool has two copied Keeper faces and turns independently', async () => {
  const f = table(), original = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < 4; i++) f.put('Falkenrath Noble');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand');
  f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(original) ? [original] : undefined;
  await cast(f, mimic);
  const rite = f.put('Rite of Replication', 'hand'); f.lands(['Island', 'Island', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(mimic) ? [mimic] : undefined;
  await cast(f, rite, row => !row.alt?.kicked);
  const token = f.g.creatures(f.a).find(card => card.isToken && card !== mimic && card.name === 'Bloodline Keeper');
  assert.ok(token); assert.equal(token.oracleFaces.layout, 'modal_dfc');
  const mana = f.lands(['Swamp'])[0];
  await activate(f, token, row => /transform/i.test(row.ability?.label || ''));
  assert.equal(mana.tapped, true); assert.equal(token.oracleFace, 'back'); assert.equal(token.name, 'Bloodline Keeper');
  assert.equal(mimic.oracleFace, 'front'); assert.equal(mimic.name, 'Bloodline Keeper');
  assert.equal(original.oracleFace, 'front'); assert.equal(original.name, 'Bloodline Keeper');
  assertGameStateInvariants(f.g, 'native double-faced token copy'); assertRecalculationStable(f.g, 'native double-faced token copy');
});

for (const order of ['none', 'under']) test('paid blink clears the old copied Keeper and makes a fresh entry choice after Glasspool mutation ' + order, async () => {
  const f = table(), original = f.put('Bloodline Keeper // Lord of Lineage'), bear = f.put('Grizzly Bears');
  const mimic = f.put('Glasspool Mimic // Glasspool Shore', 'hand'); f.lands(['Island', 'Forest', 'Forest']);
  f.cards = (p, q) => q.prompt?.includes('copy as this enters') && q.from.includes(original) ? [original] : undefined;
  await cast(f, mimic); const receipt = mimic.zoneVersion;
  if (order === 'under') {
    const heron = f.put('Dreamtail Heron', 'hand'); f.lands(['Island', 'Forest', 'Forest', 'Forest']);
    f.targets = (p, q) => q.candidates.includes(mimic) ? [mimic] : undefined;
    f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? 'under' : undefined;
    await cast(f, heron, row => !!row.alt?.mutate);
  }
  const blink = f.put('Ephemerate', 'hand'), mana = f.lands(['Plains'])[0];
  let freshChoice = false;
  f.cards = (p, q) => {
    if (q.prompt?.includes('copy as this enters') && q.from.includes(bear)) {freshChoice = true; return [bear];}
    return undefined;
  };
  f.targets = (p, q) => q.candidates.includes(mimic) ? [mimic] : undefined;
  await cast(f, blink); assert.equal(mana.tapped, true); assert.equal(freshChoice, true);
  assert.equal(mimic.zoneVersion, receipt + 2); assert.equal(mimic.zone, 'battlefield');
  assert.equal(mimic.oracleFace, 'front'); assert.equal(mimic.name, 'Grizzly Bears');
  assert.equal(mimic.mutateState, undefined); assert.equal(mimic.owner.idx, f.a.idx);
  assert.equal(f.g.activatableList(f.a).some(row => row.card === mimic && /transform/i.test(row.ability?.label || '')), false);
  assert.equal(original.name, 'Bloodline Keeper'); assert.equal(original.oracleFace, 'front');
  assertGameStateInvariants(f.g, 'exact copy reset on native blink'); assertRecalculationStable(f.g, 'exact copy reset on native blink');
});

test('paid Scroll of Fate manifest then Human Moonmist cannot transform a face-down physical Keeper', async () => {
  const f = table(), scroll = f.put('Scroll of Fate', 'hand');
  const payment = f.lands(['Forest', 'Forest', 'Forest']); await cast(f, scroll);
  assert.ok(payment.every(card => card.tapped));
  const keeper = f.put('Bloodline Keeper // Lord of Lineage', 'hand');
  f.cards = (p, q) => q.from.includes(keeper) ? [keeper] : undefined;
  await activate(f, scroll); assert.equal(scroll.tapped, true);
  assert.equal(keeper.faceDown, true); await asHuman(f, keeper); await moonmist(f);
  assert.equal(keeper.faceDown, true); assert.equal(keeper.oracleFace, 'front'); assert.equal(keeper.oracleTransformCount, 0);
  assertGameStateInvariants(f.g, 'face-down physical transform rejection');
});

