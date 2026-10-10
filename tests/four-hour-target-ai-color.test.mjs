import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

function table() {
  const g = new M.Game({seed: 10102675, paced: false, maxTurns: 10});
  const players = ['Painter', 'Caster', 'Third', 'Recipient'].map(name => g.addPlayer(name, {name: 'Native AI source colors'}, null, false));
  const [a, b, c, d] = players, f = {g, a, b, c, d};
  const decide = async (game, q, p) => {
    if (q.type === 'priority') return f.priority?.(p, q) || {kind: 'pass'};
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (['attackers', 'blockers'].includes(q.type)) return [];
    throw Error('Unhandled native AI source choice: ' + q.type);
  };
  for (const p of players) p.controller = {decide: (game, q) => decide(game, q, p)};
  f.installCloneChoices = clone => {
    for (const p of clone.players) p.controller = {decide: async (game, q) => {
      if (q.type === 'priority') return f.clonePriority?.(p, q) || {kind: 'pass'};
      if (q.type === 'chooseTargets') return [q.candidates.find(row => row.iid === f.painter.iid)];
      return decide(game, q, p);
    }};
  };
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  f.put = (name, zone = 'battlefield', p = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], p);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card); else p[zone].push(card);
    g.recalc(); return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let n = 0; n < 12; n++) f.put('Forest', 'library', p);
  return f;
}

async function cast(g, p, card) {
  const offer = g.castableList(p).find(row => row.card === card);
  assert.ok(offer, 'native paid cast offer: ' + card.name);
  assert.equal(await g.castSpell(p, card, {from: offer.from, alt: offer.alt}), true);
  assert.equal(g.stack.length, 0); assert.equal(g.pendingTriggers.length, 0);
  assertGameStateInvariants(g, card.name); assertRecalculationStable(g, card.name);
}

for (const removePainter of [false, true]) {
test(`native AI clone preserves current paid spell colors when Painter ${removePainter ? 'leaves' : 'remains'}`, async () => {
  const f = table(), painter = f.painter = f.put("Painter's Servant", 'hand');
  const painterMana = f.lands(['Forest', 'Forest']);
  f.option = (p, q) => q.options.some(row => row.key === 'R') ? 'R' : undefined;
  await cast(f.g, f.a, painter);
  assert.ok(painterMana.every(card => card.tapped));
  f.g.turnPlayer = f.b;
  const spell = f.put('Divination', 'hand', f.b), bolt = f.put('Lightning Bolt', 'hand', f.b);
  const spellMana = f.lands(['Island', 'Forest', 'Forest', 'Mountain'], f.b);
  f.targets = (p, q) => q.src?.iid === bolt.iid ? [painter] : undefined;
  let clone, responded = false, originalColors;
  f.priority = (p, q) => {
    if (!q.stack.some(row => row.card === spell)) return;
    if (removePainter && p === f.b && !responded) {
      const offer = q.casts.find(row => row.card === bolt);
      if (offer) {responded = true; return {kind: 'cast', card: bolt, from: offer.from, alt: offer.alt};}
    }
    if (!clone && (!removePainter || painter.zone === 'graveyard')) {
      originalColors = Array.from(spell.colors).sort();
      clone = M.cloneGameForAISimulation(f.g, 10102676);
    }
  };
  await cast(f.g, f.b, spell);
  assert.ok(clone, 'public native AI clone was captured after paid casting and before resolution');
  assert.equal(responded, removePainter);
  assert.equal(spellMana.filter(card => card.tapped).length, removePainter ? 4 : 3);
  assert.equal(f.b.hand.length, removePainter ? 2 : 3, 'the live Divination draws its printed two cards');
  assert.deepEqual(originalColors, removePainter ? ['U'] : ['R', 'U'], 'the paid original position has the current source colors');
  f.installCloneChoices(clone);
  const caster = clone.players[f.b.idx];
  const clonedSpell = clone.stack.find(row => row.card?.iid === spell.iid)?.card, clonedPainter = clone.byIid(painter.iid);
  assert.equal(clonedSpell.zone, 'stack');
  let sourceColors;
  f.clonePriority = (p, q) => {
    if (q.stack.some(row => row.card === clonedSpell) && (!removePainter || clonedPainter.zone === 'graveyard')) sourceColors = Array.from(clonedSpell.colors).sort();
  };
  await clone.priorityRound(clone.turnPlayer);
  assert.equal(clone.stack.length, 0); assert.equal(clone.pendingTriggers.length, 0);
  assert.equal(caster.hand.length, removePainter ? 2 : 3, 'the cloned native Divination draws its printed two cards');
  assert.deepEqual(sourceColors, removePainter ? ['U'] : ['R', 'U'], 'the waiting cloned spell follows current Painter colors');
  assert.equal(f.b.hand.length, removePainter ? 2 : 3, 'the simulated resolution does not modify the original game');
  assertGameStateInvariants(clone, 'AI source color clone'); assertRecalculationStable(clone, 'AI source color clone');
});
}

test('native AI clone retains the later paid white replacement on an original Shock', async () => {
  const f = table(), tails = f.put('Eight-and-a-Half-Tails'), shock = f.put('Shock', 'hand', f.b);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.b);
  const shockMana = f.lands(['Mountain'], f.b), whiteMana = f.lands(['Forest']);
  let activated = false, clone;
  f.targets = (p, q) => q.src?.iid === shock.iid ? [f.d] : q.src?.iid === tails.iid
    ? [q.candidates.find(row => row.kind === 'spell' && row.card === shock)] : undefined;
  f.priority = (p, q) => {
    if (!q.stack.some(row => row.card === shock)) return;
    if (p === f.a && !activated) {
      const entry = q.acts.find(row => row.card === tails && row.ability?.label === 'A spell or permanent becomes white');
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
    if (!clone && shock.castMeta.spellColors.includes('W')) clone = M.cloneGameForAISimulation(f.g, 10102677);
  };
  await cast(f.g, f.b, shock);
  assert.equal(activated, true); assert.ok(clone);
  assert.ok(shockMana.every(card => card.tapped)); assert.ok(whiteMana.every(card => card.tapped));
  assert.equal(f.d.life, 38);
  f.installCloneChoices(clone);
  const clonedShock = clone.stack.find(row => row.card?.iid === shock.iid)?.card;
  assert.deepEqual(Array.from(clonedShock.colors), ['W'], 'the clone keeps the changed current spell color');
  await clone.priorityRound(clone.turnPlayer);
  assert.equal(clone.players[f.d.idx].life, 38);
  assert.equal(f.d.life, 38);
  assert.equal(clone.stack.length, 0); assert.equal(clone.pendingTriggers.length, 0);
  assertGameStateInvariants(clone, 'AI white replacement clone'); assertRecalculationStable(clone, 'AI white replacement clone');
});
