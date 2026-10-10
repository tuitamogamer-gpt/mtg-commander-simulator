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
    if (q.type === 'main') return f.main?.(p, q) ?? {kind: 'done'};
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


const cases = [
  {label:'Oath Bird after a precombat loyalty activation', oath:true, bird:true, first:'main1', expected:1},
  {label:'Oath Bird first activated in the postcombat main phase', oath:true, bird:true, first:'main2', expected:1},
  {label:'Sparkshaper Bird without Oath retains one loyalty activation', bird:true, first:'main1', expected:1},
  {label:'genuine planeswalker receives two activations from paid Oath', oath:true, first:'main1', expected:2},
  {label:'genuine planeswalker receives two activations from paid Chain Veil', veil:true, first:'main1', expected:2},
];

for (const spec of cases) test('native paid loyalty types: '+spec.label, async () => {
  const f = table(), jace = f.put('Jace Beleren', 'hand');
  const oath = spec.oath ? f.put('Oath of Teferi', 'hand') : null;
  const visionary = spec.bird ? f.put('Sparkshaper Visionary', 'hand') : null;
  const veil = spec.veil ? f.put('The Chain Veil', 'hand') : null;
  const lands = f.lands([...Array(7).fill('Forest'), 'Plains', ...Array(5).fill('Island')]);
  const receipt = [], secondOffers = [];
  const emit = f.g.emit.bind(f.g);
  f.g.emit = async (name, data, ...args) => {
    if (name === 'abilityActivated' && data.card === jace && data.ability?.loyalty !== undefined)
      receipt.push({phase:f.g.phase, walker:jace.is('Planeswalker'),loyalty:jace.counters.loyalty});
    return emit(name,data,...args);
  };
  f.targets = (player, q) => {
    if (oath && q.src?.iid === oath.iid) {
      const paidLand = q.candidates.find(card => card.is?.('Land') && card.tapped);
      return paidLand ? [paidLand] : undefined;
    }
    if (visionary && q.src?.iid === visionary.iid) return q.candidates.includes(jace) ? [jace] : undefined;
  };
  const queue = [oath, visionary, veil, jace].filter(Boolean);
  let firstChosen = false, secondChosen = false, veilChosen = false, birdSeen = false;
  f.main = (player, q) => {
    if (player !== f.a) return {kind:'done'};
    if (q.phase === 'main1') {
      const next = queue.find(card => card.zone === 'hand');
      if (next) {
        const row = q.casts.find(row => row.card === next);
        assert.ok(row, 'actual paid native cast offer: '+next.name);
        return {kind:'cast',card:next,from:row.from,alt:row.alt};
      }
      if (veil && !veilChosen) {
        const entry = q.acts.find(row => row.card === veil && row.ability?.cost?.tap);
        assert.ok(entry, 'native paid Chain Veil activation is offered');
        veilChosen = true;return {kind:'activate',entry};
      }
    }
    if (q.phase === 'main2' && visionary) {
      assert.equal(jace.is('Planeswalker'), false, 'normal beginning-combat trigger removed planeswalker type');
      assert.equal(jace.is('Creature'), true);
      assert.equal(jace.cur.abilitiesDisabled, false, 'printed Sparkshaper retains loyalty abilities');
      birdSeen = true;
    }
    const entry = q.acts.find(row => row.card === jace && row.ability?.loyalty === 2);
    if (!firstChosen && q.phase === spec.first) {
      assert.ok(entry, 'first loyalty ability remains a real native offered action');
      firstChosen = true;return {kind:'activate',entry};
    }
    if (q.phase === 'main2' && firstChosen && !secondChosen) {
      secondOffers.push(!!entry);
      if (entry) {secondChosen = true;return {kind:'activate',entry};}
    }
    return {kind:'done'};
  };
  await f.g.runTurn();
  assert.equal(f.a.turnsStarted, 1);
  assert.equal(firstChosen, true);
  assert.equal(birdSeen, !!spec.bird);
  assert.equal(jace.zone, 'battlefield');
  assert.equal(f.castEvents.filter(event => queue.includes(event.card)).length, queue.length, 'all printed setup permanents were actually cast');
  if (veil) {assert.equal(veilChosen,true);assert.equal(veil.tapped,true);}
  assert.ok(lands.filter(card=>card.tapped).length >= 3, 'printed spells use actual lands');
  console.log(JSON.stringify({label:spec.label,receipt,secondOffers,secondChosen}));
  assert.equal(receipt.length, spec.expected, 'only legal native loyalty activations are offered and actually used');
  assert.equal(secondChosen, spec.expected === 2, 'postcombat native menu grants a second action only to the permitted planeswalker');
  assert.equal(secondOffers[0], spec.expected === 2, 'native activatableList follows current type and printed permission');
  assert.equal(jace.counters.loyalty, 3 + 2 * spec.expected, 'each accepted action pays its real +2 loyalty cost');
  assertGameStateInvariants(f.g,'native loyalty types '+spec.label);
  assertRecalculationStable(f.g,'native loyalty types '+spec.label);
});
