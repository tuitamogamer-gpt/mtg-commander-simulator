import assert from 'node:assert/strict';
import {loadEngine} from './load-engine.mjs';
import {assertGameStateInvariants, assertRecalculationStable} from './game-state-invariants.mjs';

export const M = loadEngine();

// Controllers select real offered actions; all rules, costs, timing, damage,
// priority and triggers remain the native implementation.
export function table(seed = 10104812) {
  const g = new M.Game({seed, paced:false, maxTurns:40});
  const players = ['Caster','Opponent','Third','Fourth'].map(name => g.addPlayer(name,{name:'Second combat audit'},null,false));
  const [a,b,c,d] = players;
  const f = {g,a,b,c,d,players,questions:[],casts:[],events:[]};
  for (const p of players) p.controller = {decide:async (game,q) => {
    f.questions.push({player:p,type:q.type,prompt:q.prompt});
    if (q.type === 'priority') return f.priority?.(p,q) ?? {kind:'pass'};
    if (q.type === 'main') return f.main?.(p,q) ?? {kind:'done'};
    if (q.type === 'chooseTargets') return f.targets?.(p,q) ?? q.candidates.slice(0,q.min||0);
    if (q.type === 'chooseCards') return f.cards?.(p,q) ?? q.from.slice(0,q.min||0);
    if (q.type === 'chooseOption') return f.option?.(p,q) ?? q.options.find(row=>row.key==='yes')?.key ?? q.options[0]?.key;
    if (q.type === 'chooseMulti') return f.multi?.(p,q) ?? q.options.slice(0,q.min||0).map(row=>row.key);
    if (q.type === 'chooseX') return f.x?.(p,q) ?? q.min ?? 0;
    if (q.type === 'chooseManaSources') return {cards:q.suggested};
    if (q.type === 'orderTriggers') return q.triggers;
    if (q.type === 'scry') return {top:q.cards,bottom:[]};
    if (q.type === 'attackers') return f.attackers?.(p,q) ?? [];
    if (q.type === 'blockers') return f.blockers?.(p,q) ?? [];
    if (['cardReveal','combatReview'].includes(q.type)) return null;
    throw Error('Unhandled native audit choice: '+q.type);
  }};
  g.turnPlayer=a;g.turnNo=6;g.phase='main1';g.step='main';g.speedFactor=0;
  const emit=g.emit.bind(g);
  g.emit=async (event,data,...args) => {
    if(event==='cast') f.casts.push(data);
    f.events.push({event,data});
    return emit(event,data,...args);
  };
  f.put=(name,zone='battlefield',owner=a) => {
    assert.ok(M.DEFS[name],'native printed definition: '+name);
    const card=new M.CardInst(M.DEFS[name],owner);
    card.zone=zone;card.sick=false;
    if(zone==='battlefield')g.battlefield.push(card);else owner[zone].push(card);
    g.recalc();return card;
  };
  f.lands=(names,owner=a)=>names.map(name=>f.put(name,'battlefield',owner));
  for(const p of players)for(let n=0;n<24;n++)f.put('Forest','library',p);
  return f;
}

export async function paidCast(f,p,card) {
  const row=f.g.castableList(p).find(row=>row.card===card);
  assert.ok(row,'native cast offer: '+card.name);
  assert.equal(await f.g.castSpell(p,card,{from:row.from,alt:row.alt}),true);
  assert.equal(f.g.stack.length,0);
  assert.equal(f.g.pendingTriggers.length,0);
  stable(f,card.name);
  return card;
}

export async function paidAbility(f,p,card,predicate) {
  const entry=f.g.activatableList(p).find(row=>row.card===card&&predicate(row.ability));
  assert.ok(entry,'native ability offer: '+card.name);
  assert.equal(await f.g.activateAbility(p,entry),true);
  assert.equal(f.g.stack.length,0);
  assert.equal(f.g.pendingTriggers.length,0);
  stable(f,card.name);
  return entry;
}

export function stable(f,label) {
  assertGameStateInvariants(f.g,label);
  assertRecalculationStable(f.g,label);
}
