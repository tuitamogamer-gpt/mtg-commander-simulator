import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

// Native paid spell/ability controls for the shared color getter repair.
function table() {
  const g = new M.Game({seed: 10102673, paced: false, maxTurns: 10});
  const players = ['Colors', 'Opponent', 'Third', 'Fourth'].map(name => g.addPlayer(name, {name: 'Native color controls'}, null, false));
  const [a, b, c, d] = players, f = {g, a, b, c, d};
  for (const p of players) p.controller = {decide: async (game, q) => {
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
    throw Error('Unhandled native color choice: ' + q.type);
  }};
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

async function cast(f, p, card) {
  const offer = f.g.castableList(p).find(row => row.card === card);
  assert.ok(offer, 'native paid cast offer: ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: offer.from, alt: offer.alt}), true);
  assert.equal(f.g.stack.length, 0); assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name); assertRecalculationStable(f.g, card.name);
}

test('paid Sleight of Mind changes native Circle source colors while preserving unrelated red damage', async () => {
  const f = table(), circle = f.put('Circle of Protection: Red'), sleight = f.put('Sleight of Mind', 'hand');
  const blue = f.put('Psionic Blast', 'hand', f.b), red = f.put('Shock', 'hand', f.b);
  const sleightMana = f.lands(['Island']), preventionMana = f.lands(['Forest']);
  f.lands(['Island', 'Forest', 'Forest', 'Mountain'], f.b);
  f.targets = (p, q) => q.src?.iid === sleight.iid ? [circle] : [f.a];
  f.option = (p, q) => q.prompt === 'Choose a word to replace' ? 'red'
    : q.prompt === 'Choose the new word' ? 'blue' : undefined;
  await cast(f, f.a, sleight);
  assert.ok(sleightMana.every(card => card.tapped));
  let activated = false, blueOffered = false;
  f.priority = (p, q) => {
    if (p === f.a && !activated && q.stack.some(row => row.card === blue)) {
      const entry = q.acts.find(row => row.card === circle);
      if (entry) {activated = true; return {kind: 'activate', entry};}
    }
  };
  f.option = (p, q) => {
    if (q.aiHint?.kind !== 'damagePreventionSource') return undefined;
    const row = q.options.find(row => row.card?.iid === blue.iid);
    blueOffered = !!row;
    assert.equal(q.options.some(row => row.card?.iid === red.iid), false, 'the changed Circle no longer selects red Shock in hand');
    return row?.key;
  };
  await cast(f, f.b, blue);
  assert.equal(activated, true); assert.equal(blueOffered, true);
  assert.ok(preventionMana.every(card => card.tapped));
  assert.equal(f.a.life, 40, 'blue Blast is prevented by the rewritten native source selector');
  assert.equal(f.b.life, 38, 'Blast still deals its independent self damage');
  await cast(f, f.b, red);
  assert.equal(f.a.life, 38, 'the red spell remains red and deals its ordinary damage');
  assert.deepEqual(Array.from(red.colors), ['R']);
});

test('paid Painter adds chosen blue to native spells until it dies and protection reevaluates that source color', async () => {
  const f = table(), painter = f.put("Painter's Servant", 'hand'), protectedCreature = f.put('Scragnoth', 'battlefield', f.b), bear = f.put('Grizzly Bears');
  const firstGrowth = f.put('Giant Growth', 'hand'), laterGrowth = f.put('Giant Growth', 'hand'), bolt = f.put('Lightning Bolt', 'hand', f.b);
  const painterMana = f.lands(['Forest', 'Forest']), growthMana = f.lands(['Forest', 'Forest']);
  const boltMana = f.lands(['Mountain'], f.b);
  const printedPainter = painter.def;
  f.option = (p, q) => q.options.some(row => row.key === 'U') ? 'U' : undefined;
  await cast(f, f.a, painter);
  assert.ok(painterMana.every(card => card.tapped));
  assert.deepEqual(Array.from(firstGrowth.colors).sort(), ['G', 'U']);
  let protectedExcluded = false, protectedAllowed = false;
  f.targets = (p, q) => {
    if (q.src?.iid === firstGrowth.iid) {
      protectedExcluded = !q.candidates.includes(protectedCreature);
      assert.equal(protectedExcluded, true); return [bear];
    }
    if (q.src?.iid === bolt.iid) return [painter];
    if (q.src?.iid === laterGrowth.iid) {
      protectedAllowed = q.candidates.includes(protectedCreature);
      assert.equal(protectedAllowed, true); return [protectedCreature];
    }
  };
  await cast(f, f.a, firstGrowth);
  assert.equal(bear.power, 5);
  await cast(f, f.b, bolt);
  assert.equal(painter.zone, 'graveyard'); assert.equal(painter.def, printedPainter);
  assert.ok(boltMana.every(card => card.tapped));
  assert.deepEqual(Array.from(laterGrowth.colors), ['G'], 'Painter leaving removes its added blue from the second spell');
  await cast(f, f.a, laterGrowth);
  assert.equal(protectedCreature.power, 6);
  assert.equal(protectedExcluded, true); assert.equal(protectedAllowed, true);
  assert.ok(growthMana.every(card => card.tapped));
});

for (const route of ['Painter remains', 'Painter leaves before original', 'Painter leaves before original and copy', 'Painter leaves before original and Fork copy']) {
test(`paid Psionic Blast uses current Painter red for native Torbran: ${route}`, async () => {
  const f = table(), painter = f.put("Painter's Servant", 'hand');
  const blast = f.put('Psionic Blast', 'hand', f.b), bolt = f.put('Lightning Bolt', 'hand', f.b);
  f.put('Torbran, Thane of Red Fell', 'battlefield', f.b);
  const painterMana = f.lands(['Forest', 'Forest']);
  const spellMana = f.lands(['Island', 'Forest', 'Forest', 'Mountain'], f.b);
  const copied = route.endsWith('copy'), forked = route.endsWith('Fork copy'), removed = route !== 'Painter remains';
  const reverberate = copied ? f.put(forked ? 'Fork' : 'Reverberate', 'hand', f.c) : null;
  const copyMana = copied ? f.lands(['Mountain', 'Mountain'], f.c) : [];
  if (copied) f.put('Torbran, Thane of Red Fell', 'battlefield', f.c);
  f.option = (p, q) => q.options.some(row => row.key === 'R') ? 'R' : undefined;
  await cast(f, f.a, painter);
  assert.ok(painterMana.every(card => card.tapped));
  f.option = (p, q) => q.aiHint?.kind === 'newTargets' ? 'no' : undefined;
  let responded = false, copiedResponse = false;
  f.priority = (p, q) => {
    if (copied && p === f.c && !copiedResponse && q.stack.some(row => row.card === blast)) {
      const offer = q.casts.find(row => row.card === reverberate);
      if (offer) {copiedResponse = true; return {kind: 'cast', card: reverberate, from: offer.from, alt: offer.alt};}
    }
    if (!removed || p !== f.b || responded || !q.stack.some(row => row.card === blast && (!copied || row.isCopy))) return;
    const offer = q.casts.find(row => row.card === bolt);
    if (offer) {responded = true; return {kind: 'cast', card: bolt, from: offer.from, alt: offer.alt};}
  };
  f.targets = (p, q) => q.src?.iid === blast.iid ? [f.d] : q.src?.iid === bolt.iid ? [painter]
    : q.src?.iid === reverberate?.iid ? [q.candidates.find(row => row.kind === 'spell' && row.card === blast && !row.isCopy)] : undefined;
  await cast(f, f.b, blast);
  assert.equal(responded, removed); assert.equal(copiedResponse, copied);
  assert.equal(painter.zone, removed ? 'graveyard' : 'battlefield');
  assert.equal(spellMana.filter(card => card.tapped).length, removed ? 4 : 3);
  assert.ok(copyMana.every(card => card.tapped));
  assert.equal(f.d.life, forked ? 30 : copied ? 32 : removed ? 36 : 34, 'Torbran follows live Painter and the printed Fork red exception independently');
  assert.equal(f.b.life, 38, 'printed independent self damage still resolves');
  assert.equal(f.c.life, copied ? 38 : 40);
});
}
