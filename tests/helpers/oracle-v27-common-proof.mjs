import strict from 'node:assert/strict';import {assertGameStateInvariants} from './game-state-invariants.mjs';
const total=p=>Object.values(p.pool).reduce((a,b)=>a+b,0);
export async function operationProofV27(M,entry,operation,role,h){
 if(!JSON.stringify(entry.implementation).includes('entry-number-v27'))return null;
 let checks=0;const assert={equal:(...args)=>{checks++;strict.equal(...args);},ok:(...args)=>{checks++;strict.ok(...args);}};
 const f=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=f;h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);h.fund(a,100);h.fund(b,100);
 const old=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.aiHint?.kind==='entryNumber'?2:old(g,q);
 const source=h.zoneCard(M,a,entry.raw.name,'hand'),before=total(a);assert.equal(await game.castSpell(a,source,{from:'hand'}),true);assert.ok(total(a)<before);await h.resolveAll(game);assert.equal(source.meta.oracleEntryNumberV27.n,2);
 if(entry.raw.name==='Sanctum Prelate'){
  const creature=h.zoneCard(M,a,'Grizzly Bears','hand');assert.equal(await game.castSpell(a,creature,{from:'hand'}),true);const target=game.stack.at(-1),counter=h.zoneCard(M,b,'Counterspell','hand'),cash=total(b);
  assert.equal(await game.castSpell(b,counter,{from:'hand',quickTargets:[target]}),false);assert.equal(total(b),cash);assert.equal(counter.zone,'hand');await game.move(source,'exile');
  assert.equal(await game.castSpell(b,counter,{from:'hand',quickTargets:[target]}),true);assert.equal(total(b),cash-2);await h.resolveAll(game);assert.equal(creature.zone,'graveyard');
 }else if(entry.raw.name==='Talion, the Kindly Lord'){
  const life=b.life,hand=a.hand.length;game.turnPlayer=b;assert.equal(await game.castSpell(b,h.zoneCard(M,b,'Grizzly Bears','hand'),{from:'hand'}),true);await game.flushTriggers();assert.equal(game.stack.filter(row=>row.srcCard===source).length,1);
  await game.move(source,'exile');await h.resolveAll(game);assert.equal(b.life,life-2);assert.equal(a.hand.length,hand+1);
 }else if(entry.raw.name==='Squall, Gunblade Duelist'){
  const first=h.permanent(M,game,a,'Grizzly Bears'),second=h.permanent(M,game,a,'Grizzly Bears');first.sick=false;second.sick=false;
  const choose=a.controller.decide.bind(a.controller);a.controller.decide=(g,q)=>q.type==='attackers'?[{card:first,target:b},{card:second,target:b}]:choose(g,q);
  const hits=[],damage=game.damagePlayer;game.damagePlayer=async function(src,p,n,opts={}){if(src===source&&!opts.combat)hits.push({p,n});return damage.call(this,src,p,n,opts);};
  game.priorityRound=async()=>h.resolveAll(game);await game.combatPhase(a);await h.resolveAll(game);assert.equal(hits.length,1);assert.ok(hits[0].p===b);assert.equal(hits[0].n,3);
 }else throw Error('Unproved v27 number source '+entry.raw.name);
 assertGameStateInvariants(game);h.assertControllerRole(M,f,entry.raw.name);return checks;
}
