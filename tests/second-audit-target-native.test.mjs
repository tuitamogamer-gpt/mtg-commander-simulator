import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

async function newBlood(f, lord) {
  const vampire = f.put('Falkenrath Noble'), blood = f.put('New Blood', 'hand');
  const lands = f.lands(['Swamp', 'Swamp', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(lord) ? [lord] : undefined;
  f.cards = (p, q) => q.prompt?.includes('tap an untapped Vampire') ? [vampire] : undefined;
  f.option = (p, q) => q.options.some(row => row.key === 'Elf') ? 'Elf' : undefined;
  await cast(f, blood);
  assert.ok(lands.every(card => card.tapped)); assert.equal(vampire.tapped, true);
  assert.equal(lord.ctrl.idx, f.a.idx);
  assert.equal(lord.hasSub('Vampire'), true); assert.equal(lord.hasSub('Elf'), false);
  return {vampire, blood};
}

test('paid New Blood followed by paid Rite of Replication copies the printed Elf lord without its text change', async () => {
  const f = table(), lord = f.put('Elvish Archdruid', 'battlefield', f.b);
  const elf = f.put('Llanowar Elves'), {vampire} = await newBlood(f, lord);
  assert.equal(elf.power, 1); assert.equal(vampire.power, 3);
  const rite = f.put('Rite of Replication', 'hand'), mana = f.lands(['Island', 'Island', 'Forest', 'Forest']);
  await cast(f, rite);
  assert.ok(mana.every(card => card.tapped));
  const copy = f.g.bf().find(card => card.isToken && card.name === 'Elvish Archdruid');
  assert.ok(copy); assert.equal(copy.hasSub('Elf'), true); assert.equal(copy.hasSub('Vampire'), false);
  assert.equal(copy.meta.c1719TextChanges?.length || 0, 0);
  assert.equal(elf.power, 2, 'the unmodified copied Elf lord buffs the unrelated Elf');
  assert.equal(vampire.power, 3, 'only the changed original lord buffs Vampires');
  const second = f.put('Rite of Replication', 'hand'), secondMana = f.lands(['Island', 'Island', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(copy) ? [copy] : undefined;
  await cast(f, second); assert.ok(secondMana.every(card => card.tapped));
  assert.equal(f.g.bf().filter(card => card.isToken && card.name === 'Elvish Archdruid').length, 2);
  assert.equal(elf.power, 3, 'a second paid copy copies the first unmodified lord');
  assert.equal(vampire.power, 3);
  const blink = f.put('Ephemerate', 'hand'), white = f.lands(['Plains'])[0];
  f.targets = (p, q) => q.candidates.includes(lord) ? [lord] : undefined;
  await cast(f, blink); assert.equal(white.tapped, true);
  assert.equal(lord.ctrl.idx, f.b.idx); assert.equal(lord.hasSub('Elf'), true); assert.equal(lord.hasSub('Vampire'), false);
  assert.equal(elf.power, 3, 'the independent printed token lords survive the original’s native blink');
  assert.equal(vampire.power, 2, 'blinking the original ends its text change and Vampire lord effect');
});

test('paid New Blood keeps unrelated native Elf lord rules distinct from the changed original', async () => {
  const f = table(), lord = f.put('Elvish Archdruid', 'battlefield', f.b);
  const unrelated = f.put('Elvish Archdruid'), elf = f.put('Llanowar Elves');
  const {vampire} = await newBlood(f, lord);
  assert.equal(unrelated.hasSub('Elf'), true); assert.equal(unrelated.meta.c1719TextChanges?.length || 0, 0);
  assert.equal(elf.power, 2); assert.equal(vampire.power, 3);
});

for (const order of ['under', 'over']) test('paid Bloodline Keeper mutation ' + order + ' uses its printed paid transform ability', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < (order === 'over' ? 5 : 4); i++) f.put('Falkenrath Noble');
  const heron = f.put('Dreamtail Heron', 'hand'), mana = f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
  await cast(f, heron, row => !!row.alt?.mutate);
  assert.ok(mana.every(card => card.tapped)); assert.equal(heron.zone, 'merged');
  assert.equal(keeper.mutateState.components.length, 2);
  assert.equal(keeper.oracleFaces, null);
  const black = f.lands(['Swamp'])[0];
  const entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry, 'five Vampires satisfy the printed transform prerequisite');
  assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.equal(black.tapped, true); assert.equal(keeper.tapped, false, 'printed transformation costs black mana without tapping');
  assert.equal(keeper.name, order === 'under' ? 'Lord of Lineage' : 'Dreamtail Heron');
  assert.equal(keeper.kw('flying'), true);
  assert.equal(keeper.mutateState.components.find(row => row.card === keeper).oracleFace, 'back');
  for (const vampire of f.g.creatures(f.a).filter(card => card.name === 'Falkenrath Noble')) assert.equal(vampire.power, 4);
  assertGameStateInvariants(f.g, 'native merged transform'); assertRecalculationStable(f.g, 'native merged transform');
});

test('native Goblin Lyre offers all actual opponent targets and damages the chosen third seat', async () => {
  const f = table(), lyre = f.put('Goblin Lyre', 'hand');
  const mana = f.lands(['Forest', 'Forest', 'Forest']);
  await cast(f, lyre); assert.ok(mana.every(card => card.tapped));
  for (let i = 0; i < 2; i++) f.put('Grizzly Bears');
  f.put('Grizzly Bears', 'battlefield', f.b);
  for (let i = 0; i < 3; i++) f.put('Grizzly Bears', 'battlefield', f.c);
  let chosen = false;
  f.targets = (p, q) => {
    if (q.src?.iid !== lyre.iid) return undefined;
    assert.equal(p.idx, f.a.idx);
    assert.deepEqual(Array.from(q.candidates.filter(row => row instanceof M.Player), row => row.idx), [f.b.idx, f.c.idx, f.d.idx]);
    chosen = true; return [f.c];
  };
  f.option = (p, q) => q.options.some(row => row.key === 'heads') ? 'heads' : undefined;
  const entry = f.g.activatableList(f.a).find(row => row.card === lyre && !row.manaAbility);
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.equal(chosen, true); assert.equal(lyre.zone, 'graveyard');
  assert.equal(f.b.life, 40); assert.equal(f.d.life, 40);
  assert.ok(f.c.life === 38 && f.a.life === 40 || f.c.life === 40 && f.a.life === 37,
    'actual random result uses either the chosen opponent or that opponent’s three creatures');
  assertGameStateInvariants(f.g, 'Lyre opponent choice'); assertRecalculationStable(f.g, 'Lyre opponent choice');
});

test('paid unmerged Bloodline Keeper transforms through its ordinary printed face', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < 4; i++) f.put('Falkenrath Noble');
  const mana = f.lands(['Swamp'])[0];
  const entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.equal(mana.tapped, true); assert.equal(keeper.name, 'Lord of Lineage');
  assert.equal(keeper.oracleFace, 'back');
  assertGameStateInvariants(f.g, 'ordinary native transform');
});

for (const order of ['under', 'over']) test('paid Bound by Moonsilver still prevents a ' + order + ' merged Keeper from transforming', async () => {
  const f = table(), keeper = f.put('Bloodline Keeper // Lord of Lineage');
  for (let i = 0; i < (order === 'over' ? 5 : 4); i++) f.put('Falkenrath Noble');
  const heron = f.put('Dreamtail Heron', 'hand');
  f.lands(['Island', 'Forest', 'Forest', 'Forest']);
  f.targets = (p, q) => q.candidates.includes(keeper) ? [keeper] : undefined;
  f.option = (p, q) => q.aiHint?.kind === 'mutateOrder' ? order : undefined;
  await cast(f, heron, row => !!row.alt?.mutate);
  const aura = f.put('Bound by Moonsilver', 'hand'), auraMana = f.lands(['Plains', 'Forest', 'Forest']);
  await cast(f, aura); assert.ok(auraMana.every(card => card.tapped));
  assert.equal(aura.attachedTo, keeper.iid); assert.equal(keeper.cur.cantTransformV66, true);
  const black = f.lands(['Swamp'])[0];
  const entry = f.g.activatableList(f.a).find(row => row.card === keeper && /transform/i.test(row.ability?.label || ''));
  assert.ok(entry); assert.equal(await f.g.activateAbility(f.a, entry), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  assert.equal(black.tapped, true);
  assert.equal(keeper.name, order === 'under' ? 'Bloodline Keeper' : 'Dreamtail Heron');
  assert.equal(keeper.mutateState.components.find(row => row.card === keeper).oracleFace, 'front');
  assertGameStateInvariants(f.g, 'native prevented merged transform'); assertRecalculationStable(f.g, 'native prevented merged transform');
});

test('native paid Toggo landfall creates a Rock token with canonical local WebP art', async () => {
  const f = table(), toggo = f.put('Toggo, Goblin Weaponsmith', 'hand');
  const mana = f.lands(['Mountain', 'Forest', 'Forest']);
  await cast(f, toggo); assert.ok(mana.every(card => card.tapped));
  const land = f.put('Forest', 'hand'); assert.equal(await f.g.playLand(f.a, land), true);
  await f.g.flushTriggers(); await f.g.priorityRound(f.g.turnPlayer);
  const rock = f.g.bf().find(card => card.isToken && card.name === 'Rock');
  assert.ok(rock); assert.equal(rock.hasSub('Equipment'), true);
  const image = M.cardImageURL(rock.def.tokenImageName || rock.name);
  assert.notEqual(image, M.CARD_IMAGE_PLACEHOLDER, 'native Rock does not render as a card back');
  assert.match(image, /^\.\/assets\/cards\/.+\.webp$/);
  const bytes = fs.readFileSync(path.resolve(image.slice(2)));
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP');
});
