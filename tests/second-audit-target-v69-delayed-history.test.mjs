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
    if (q.type === 'attackers') return f.attackers?.(p, q) ?? [];
    if (q.type === 'blockers') return [];
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


for (const cardKind of ['Slicer','Ultra Magnus']) for (const timing of ['before delay creation','after delay creation']) test('actual paid ' + cardKind + ' delayed conversion uses creation history ' + timing, async () => {
  const f=table(), slicer=cardKind==='Slicer';
  const source=f.put(slicer?'Slicer, Hired Muscle // Slicer, High-Speed Antagonist':'Ultra Magnus, Tactician // Ultra Magnus, Armored Carrier','hand');
  const sourceMana=f.lands(slicer?['Mountain','Forest','Forest']:['Mountain','Forest','Plains','Forest','Forest','Forest','Forest']);
  await cast(f,source,row=>slicer?!!row.alt?.oracleConvertedV22:!row.alt?.oracleConvertedV22);
  assert.ok(sourceMana.every(c=>c.tapped));assert.equal(source.oracleFace,slicer?'back':'front');
  if(!slicer){const haste=f.put('Mass Hysteria','hand'),red=f.lands(['Mountain'])[0];await cast(f,haste);assert.equal(red.tapped,true);}
  const selection=f.put('Unnatural Selection','hand'),selectionMana=f.lands(['Island','Forest']);await cast(f,selection);assert.ok(selectionMana.every(c=>c.tapped));
  f.targets=(p,q)=>q.candidates.includes(source)?[source]:undefined;
  f.option=(p,q)=>q.options.some(row=>row.key==='Human')?'Human':undefined;
  const typeMana=f.lands(['Forest'])[0],entry=f.g.activatableList(f.a).find(row=>row.card===selection&&!row.manaAbility);
  assert.ok(entry);assert.equal(await f.g.activateAbility(f.a,entry),true);assert.equal(typeMana.tapped,true);assert.equal(source.hasSub('Human'),true);
  const gift=!slicer?f.put('Ornithopter','hand'):null;
  f.cards=(p,q)=>gift&&q.from.includes(gift)?[gift]:undefined;
  const moonmist=f.put('Moonmist','hand'),responseMana=f.lands(['Forest','Forest']);
  f.attackers=(p,q)=>{assert.ok(q.eligible.includes(source));return [{card:source,target:f.b}];};
  let responded=false,sawOriginal=false,sawDelay=false,sawGiftAttacking=false,countAtCreation;
  f.priority=(p,q)=>{
    const delay=f.g.delayed.find(row=>row.src===source&&row.on==='endCombat');
    const original=f.g.stack.find(row=>row.kind==='trigger'&&row.srcCard===source);
    if(original&&!delay)sawOriginal=true;
    if(delay){sawDelay=true;countAtCreation??=source.oracleTransformCount||0;}
    if(gift?.zone==='battlefield'&&gift.attacking===f.b)sawGiftAttacking=true;
    if(p!==f.a||responded)return undefined;
    const ready=timing==='before delay creation'?original&&!delay:delay;
    if(!ready)return undefined;
    const row=q.casts?.find(row=>row.card===moonmist);if(!row)return undefined;
    responded=true;return {kind:'cast',card:moonmist,from:row.from,alt:row.alt};
  };
  await f.g.combatPhase(f.a);
  assert.equal(sawOriginal,true);assert.equal(sawDelay,true);assert.equal(responded,true);
  assert.ok(responseMana.every(c=>c.tapped));assert.equal(moonmist.zone,'graveyard');
  assert.equal(countAtCreation,timing==='before delay creation'?1:0,'creation follows the actual upstream trigger resolution');
  if(slicer)assert.equal(f.b.life,37,'printed first-strike damage occurred before Moonmist; its later damage prevention applies');
  else{assert.equal(gift.zone,'battlefield');assert.equal(gift.tapped,true);assert.equal(sawGiftAttacking,true,'the actual printed artifact-creature hand entry was tapped and attacking');}
  const expected=timing==='before delay creation'?2:1;
  assert.equal(source.oracleTransformCount,expected);
  assert.equal(source.oracleFace,expected===2?(slicer?'back':'front'):(slicer?'front':'back'));
  assert.equal(f.g.delayed.some(row=>row.src===source&&row.on==='endCombat'),false);
  assert.equal(f.g.stack.length,0);assert.equal(f.g.pendingTriggers.length,0);
  assertGameStateInvariants(f.g,'actual V69 delayed creation history');assertRecalculationStable(f.g,'actual V69 delayed creation history');
});
