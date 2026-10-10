import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './helpers/game-state-invariants.mjs';

const M = loadEngine();

// Actual cards, actual mana sources, and the normal native priority pipeline.
// The fixture establishes the initial game position; controllers choose only
// actions/targets offered by the live engine. No rule helpers are installed.
function table() {
  const g = new M.Game({seed: 10102671, paced: false, maxTurns: 10});
  const players = ['Caster', 'Opponent', 'Third', 'Fourth'].map(name =>
    g.addPlayer(name, {name: 'Target resolution audit'}, null, false));
  const [a, b, c, d] = players;
  const f = {g, a, b, c, d, players, questions: [], castEvents: [], responses: [], copies: [], entries: []};
  for (const p of players) p.controller = {decide: async (game, q) => {
    f.questions.push({p, q});
    if (q.type === 'priority') {
      const answer = f.priority?.(p, q) || {kind: 'pass'};
      if (answer.kind !== 'pass') f.responses.push({p, answer});
      return answer;
    }
    if (q.type === 'chooseTargets') return f.targets?.(p, q) ?? q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseCards') return f.cards?.(p, q) ?? q.from.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return f.option?.(p, q) ?? q.options.find(row => row.key === 'yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return f.multi?.(p, q) ?? q.options.slice(0, q.min || 0).map(row => row.key);
    if (q.type === 'chooseX') return f.x?.(p, q) ?? q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards: q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top: q.cards, bottom: []};
    if (q.type === 'main') return {kind: 'done'};
    if (['cardReveal', 'combatReview'].includes(q.type)) return null;
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
    throw Error('Unhandled audit choice: ' + q.type);
  }};
  g.turnPlayer = a; g.turnNo = 6; g.phase = 'main1'; g.step = 'main'; g.speedFactor = 0;
  const emit = g.emit.bind(g);
  g.emit = async (event, data, ...rest) => {
    if (event === 'cast') f.castEvents.push(data);
    if (event === 'spellCopied') f.copies.push(data.so);
    if (event === 'etb' && data.card?.isToken) f.entries.push({card: data.card, owner: data.card.owner.idx, controller: data.card.ctrl.idx});
    return emit(event, data, ...rest);
  };
  f.put = (name, zone = 'battlefield', owner = a) => {
    assert.ok(M.DEFS[name], 'native definition: ' + name);
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') g.battlefield.push(card);
    else owner[zone].push(card);
    g.recalc();
    return card;
  };
  f.lands = (names, p = a) => names.map(name => f.put(name, 'battlefield', p));
  for (const p of players) for (let n = 0; n < 12; n++) f.put('Forest', 'library', p);
  return f;
}

async function cast(f, p, card, predicate = () => true) {
  const row = f.g.castableList(p).find(row => row.card === card && predicate(row));
  assert.ok(row, 'native cast offer for ' + card.name);
  assert.equal(await f.g.castSpell(p, card, {from: row.from, alt: row.alt}), true);
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, card.name);
  assertRecalculationStable(f.g, card.name);
}


for (const removePainter of [true, false]) test(removePainter
  ? 'paid Blue Elemental Blast loses its colored target after paid Lightning Bolt removes Painter'
  : 'paid Blue Elemental Blast counters a native green spell while red Painter remains active', async () => {
  const f = table(), painter = f.put("Painter's Servant", 'hand');
  f.option = (player, q) => q.options.some(row => row.key === 'R') ? 'R' : q.aiHint?.kind === 'mode' ? q.options.find(row => /counter/i.test(row.label))?.key : undefined;
  f.multi = (player, q) => q.aiHint?.kind === 'modes' ? [q.options.find(row => /counter/i.test(row.label))?.key] : undefined;
  const painterLands = f.lands(['Forest', 'Forest']);
  await cast(f, f.a, painter);
  assert.ok(painterLands.every(card => card.tapped));
  assert.equal(painter.meta.painterV88, 'R');
  const bear = f.put('Grizzly Bears', 'battlefield', f.b), growth = f.put('Giant Growth', 'hand', f.b);
  const bolt = removePainter ? f.put('Lightning Bolt', 'hand', f.b) : null;
  const blast = f.put('Blue Elemental Blast', 'hand', f.c);
  const lands = [...f.lands(removePainter ? ['Forest', 'Mountain'] : ['Forest'], f.b), ...f.lands(['Island'], f.c)];
  f.g.turnPlayer = f.b;
  let blastCast = false, boltCast = false, liveStackColors;
  f.priority = (player, q) => {
    if (player === f.c && !blastCast && q.stack.some(so => so.card === growth && !so.isCopy)) {
      const row = q.casts.find(row => row.card === blast);
      if (row) {blastCast = true; return {kind:'cast',card:blast,from:row.from,alt:row.alt};}
    }
    if (removePainter && player === f.b && blastCast && !boltCast && q.stack.some(so => so.card === blast)) {
      const row = q.casts.find(row => row.card === bolt);
      if (row) {boltCast = true; return {kind:'cast',card:bolt,from:row.from,alt:row.alt};}
    }
    if (painter.zone === (removePainter ? 'graveyard' : 'battlefield') && q.stack.some(so => so.card === growth)) liveStackColors = Array.from(growth.colors);
  };
  f.targets = (player, q) => {
    if (q.src?.iid === growth.iid) return q.candidates.includes(bear) ? [bear] : undefined;
    if (bolt && q.src?.iid === bolt.iid) return q.candidates.includes(painter) ? [painter] : undefined;
    if (q.src?.iid === blast.iid) {const target = q.candidates.find(so => so.kind === 'spell' && so.card === growth && !so.isCopy); return target ? [target] : undefined;}
  };
  await cast(f, f.b, growth);
  assert.equal(blastCast, true); assert.equal(boltCast, removePainter);
  assert.ok(lands.every(card => card.tapped), 'native colored spell and response mana payments');
  assert.equal(painter.zone, removePainter ? 'graveyard' : 'battlefield');
  if (bolt) assert.equal(bolt.zone, 'graveyard');
  assert.equal(blast.zone, 'graveyard');
  assert.equal(growth.zone, 'graveyard');
  if (!removePainter) assert.ok(liveStackColors.includes('R'), 'active Painter makes the native green spell red');
  console.log(JSON.stringify({removePainter, historicalColors:growth.castMeta.spellColors, liveStackColors, resultPower:bear.power}));
  assert.equal(bear.power, removePainter ? 5 : 2, removePainter
    ? 'the colored target is no longer red on revalidation, so Giant Growth resolves normally'
    : 'the colored target is still red on revalidation, so Blue Elemental Blast counters Giant Growth');
});

test('paid Blue Elemental Blast targets only the red Fork copy of a native green Giant Growth', async () => {
  const f = table(), bear = f.put('Grizzly Bears'), growth = f.put('Giant Growth', 'hand');
  const fork = f.put('Fork', 'hand', f.b), blast = f.put('Blue Elemental Blast', 'hand', f.c);
  const lands = [...f.lands(['Forest']), ...f.lands(['Mountain', 'Mountain'], f.b), ...f.lands(['Island'], f.c)];
  let forkCast = false, blastCast = false, nativeCandidates;
  f.priority = (player, q) => {
    if (player === f.b && !forkCast && q.stack.some(so => so.card === growth && !so.isCopy)) {
      const row = q.casts.find(row => row.card === fork);
      if (row) {forkCast = true; return {kind:'cast',card:fork,from:row.from,alt:row.alt};}
    }
    if (player === f.c && !blastCast && q.stack.some(so => so.card === growth && so.isCopy)) {
      const row = q.casts.find(row => row.card === blast);
      if (row) {blastCast = true; return {kind:'cast',card:blast,from:row.from,alt:row.alt};}
    }
  };
  f.targets = (player, q) => {
    if (q.src?.iid === growth.iid) return q.candidates.includes(bear) ? [bear] : undefined;
    if (q.src?.iid === fork.iid) {
      const original = q.candidates.find(so => so.card === growth && !so.isCopy);
      return original ? [original] : undefined;
    }
    if (q.src?.iid === blast.iid) {
      nativeCandidates = q.candidates.map(so => ({iid:so.card?.iid,isCopy:!!so.isCopy}));
      assert.equal(q.candidates.some(so => so.card === growth && !so.isCopy), false, 'original green spell is not a legal red-spell target');
      const copy = q.candidates.find(so => so.card === growth && so.isCopy);
      assert.ok(copy, 'native counter target candidates include the explicitly red Fork copy');
      return [copy];
    }
  };
  f.option = (player, q) => q.aiHint?.kind === 'newTargets' ? 'no'
    : q.aiHint?.kind === 'mode' ? q.options.find(row => /counter/i.test(row.label))?.key : undefined;
  f.multi = (player, q) => q.aiHint?.kind === 'modes' ? [q.options.find(row => /counter/i.test(row.label))?.key] : undefined;
  await cast(f, f.a, growth);
  assert.equal(forkCast, true); assert.equal(blastCast, true);
  assert.equal(f.copies.length, 1);
  assert.ok(lands.every(card => card.tapped), 'native Growth G, Fork RR, and Blue Elemental Blast U payments');
  assert.equal(growth.zone, 'graveyard'); assert.equal(fork.zone, 'graveyard'); assert.equal(blast.zone, 'graveyard');
  assert.equal(bear.power, 5, 'counter only the red copy; original green Growth resolves');
  assert.deepEqual(Array.from(growth.colors), ['G'], 'countering the copy preserves physical original color');
  console.log(JSON.stringify({forkRedCopyCounter:true,nativeCandidates,resultPower:bear.power}));
});
