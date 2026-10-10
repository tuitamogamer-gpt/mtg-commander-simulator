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


test('paid Daretti ultimate creates a native emblem that returns an artifact destroyed by paid Disenchant at the next native end step', async () => {
  const f = table();
  const season = f.put('Doubling Season', 'hand'), vorinclex = f.put('Vorinclex, Monstrous Raider', 'hand');
  const daretti = f.put('Daretti, Scrap Savant', 'hand'), ring = f.put('Sol Ring', 'hand');
  const lands = f.lands([...Array(15).fill('Forest'), 'Mountain']);
  await cast(f, f.a, season);
  await cast(f, f.a, vorinclex);
  await cast(f, f.a, daretti);
  assert.equal(daretti.counters.loyalty, 12, 'actual counter replacement effects double printed three loyalty twice on entry');
  const ult = f.g.activatableList(f.a).find(row => row.card === daretti && row.ability?.loyalty === -10);
  assert.ok(ult, 'printed ultimate is a native offered activation');
  assert.equal(await f.g.activateAbility(f.a, ult), true);
  await f.g.priorityRound(f.a);
  assert.equal(daretti.counters.loyalty, 2, 'actual ultimate pays ten loyalty');
  assert.equal(f.a.emblems.length, 1);
  assert.equal(f.a.emblems[0].name, 'Daretti, Scrap Savant emblem');
  assert.equal(f.a.emblems[0].def, undefined, 'native emblem is not a card permanent');
  await cast(f, f.a, ring);
  assert.ok(lands.every(card => card.tapped), 'real Season5, Vorinclex6, Daretti4 and Sol Ring1 payments');
  const disenchant = f.put('Disenchant', 'hand', f.b), opposingMana = f.lands(['Forest', 'Plains'], f.b);
  f.targets = (player, q) => q.src?.iid === disenchant.iid && q.candidates.includes(ring) ? [ring] : undefined;
  await cast(f, f.b, disenchant);
  assert.ok(opposingMana.every(card => card.tapped), 'printed Disenchant1W is actually paid');
  assert.equal(disenchant.zone, 'graveyard');
  assert.equal(ring.zone, 'graveyard');
  assert.ok(f.g.delayed.some(row => row.src === f.a.emblems[0] && row.on === 'endStep'), 'ordinary emblem trigger schedules its printed delayed return');
  await f.g.runEndStepV90(f.a);
  assert.equal(ring.zone, 'battlefield');
  assert.equal(ring.ctrl.idx, f.a.idx);
  assert.equal(ring.owner.idx, f.a.idx);
  assert.equal(f.g.delayed.some(row => row.src === f.a.emblems[0]), false);
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'Daretti native emblem end step');
  assertRecalculationStable(f.g, 'Daretti native emblem end step');
});

test('paid Volunteer Reserves retains its real cumulative upkeep payment during a native full turn', async () => {
  const f = table(), reserves = f.put('Volunteer Reserves', 'hand'), lands = f.lands(['Forest', 'Plains']);
  await cast(f, f.a, reserves);
  assert.ok(lands.every(card => card.tapped), 'printed Volunteer Reserves1W is actually paid');
  await f.g.runTurn();
  assert.equal(f.a.turnsStarted, 1);
  assert.equal(reserves.zone, 'battlefield');
  assert.equal(reserves.counters.age, 1);
  assert.equal(lands.filter(card => card.tapped).length, 1, 'cumulative upkeep1 is paid after native untap');
  assert.ok(f.questions.some(({q}) => q.type === 'chooseOption' && /pay.*\{1\}/i.test(q.prompt || '')));
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'Volunteer Reserves paid upkeep');
});

test('paid Mogg War Marshal retains its real echo payment during a native full turn', async () => {
  const f = table(), marshal = f.put('Mogg War Marshal', 'hand'), lands = f.lands(['Forest', 'Mountain']);
  await cast(f, f.a, marshal);
  assert.ok(lands.every(card => card.tapped), 'printed Mogg War Marshal1R is actually paid');
  assert.equal(f.g.creatures(f.a).filter(card => card.isToken && card.hasSub('Goblin')).length, 1);
  await f.g.runTurn();
  assert.equal(f.a.turnsStarted, 1);
  assert.equal(marshal.zone, 'battlefield');
  assert.ok(lands.every(card => card.tapped), 'echo1R is paid after native untap');
  assert.ok(f.questions.some(({q}) => q.type === 'chooseOption' && /echo/i.test(q.prompt || '')));
  assert.equal(f.g.creatures(f.a).filter(card => card.isToken && card.hasSub('Goblin')).length, 1, 'paying echo does not sacrifice Marshal or create a death token');
  assert.equal(f.g.stack.length, 0);
  assert.equal(f.g.pendingTriggers.length, 0);
  assertGameStateInvariants(f.g, 'Mogg War Marshal paid echo');
});
