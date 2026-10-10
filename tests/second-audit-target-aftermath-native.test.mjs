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


for (const [name,accept,destination] of [
  ['Grizzly Bears',true,'battlefield'],
  ['Grizzly Bears',false,'hand'],
  ['Forest',true,'hand'],
]) test('paid Reason then actual aftermath Believe preserves inspected '+name+' with '+(accept?'accepted':'declined')+' creature option', async () => {
  const f=table();
  const inspected=f.put(name,'library'), source=f.put('Reason // Believe','hand');
  const iid=source.iid, inspectedIid=inspected.iid, inspectedVersion=inspected.zoneVersion;
  const island=f.lands(['Island'])[0];
  assert.equal(f.g.castableList(f.a).some(row=>row.card===source&&row.alt?.splitHalf==='right'),false,'printed aftermath is not cast from hand');
  await cast(f,source,row=>row.alt?.splitHalf==='left');
  assert.equal(island.tapped,true,'actual Reason U payment');
  assert.equal(source.zone,'graveyard'); assert.equal(source.iid,iid);
  assert.equal(f.a.library.at(-1).iid,inspectedIid,'Reason keeps the selected actual top card');
  const mana=f.lands(['Forest','Forest','Forest','Forest','Forest']);
  const row=f.g.castableList(f.a).find(row=>row.card===source&&row.from==='graveyard'&&row.alt?.splitHalf==='right');
  assert.ok(row,'actual aftermath graveyard offer');
  assert.equal(row.alt.isAftermath,true); assert.equal(row.alt.flashback,true); assert.equal(row.alt.altCostStr,'{4}{G}');
  f.option=(p,q)=>q.prompt==='Move the inspected card to battlefield?'?(accept?'yes':'no'):undefined;
  await cast(f,source,offer=>offer===row || offer.from==='graveyard'&&offer.alt?.splitHalf==='right');
  assert.ok(mana.every(card=>card.tapped),'actual Believe four generic and green payment');
  assert.equal(source.iid,iid); assert.equal(source.zone,'exile');
  assert.equal(f.a.exile.filter(card=>card.iid===iid).length,1,'exact physical aftermath object is in its owner exile');
  assert.equal(f.a.exile.includes(source),true);
  assert.equal(inspected.iid,inspectedIid); assert.equal(inspected.zone,destination);
  assert.equal(inspected.zoneVersion,inspectedVersion+1,'same inspected object moved exactly once');
  assert.equal(inspected.owner.idx,f.a.idx);
  assert.equal(f.questions.filter(({q})=>q.prompt==='Move the inspected card to battlefield?').length,name==='Grizzly Bears'?1:0);
  assert.equal(f.g.castableList(f.a).some(row=>row.card===source),false,'printed aftermath exile cannot be cast again');
  assertGameStateInvariants(f.g,'actual Reason and aftermath Believe'); assertRecalculationStable(f.g,'actual Reason and aftermath Believe');
});
