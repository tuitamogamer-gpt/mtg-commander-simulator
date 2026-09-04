import assert from 'node:assert/strict';
import {matchesTarget} from './oracle-v5-proof.mjs';
const worlds=new WeakMap(),libraryWorlds=new WeakMap(),installed=new WeakSet();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const subsets=values=>Array.from({length:(1<<values.length)-1},(_,index)=>values.filter((_,bit)=>(index+1)&(1<<bit)));
function install(MTG,context,h){
 let state=worlds.get(context.game);
 if(!state){state={context,h,rows:[],active:null};worlds.set(context.game,state);for(const player of context.game.players)libraryWorlds.set(player.library,state);}
 context.multizoneProofRows=state.rows;state.h=h;
 if(installed.has(MTG.OracleV8MultizoneSearch))return;
 installed.add(MTG.OracleV8MultizoneSearch);
 const shuffle=MTG.shuffle;MTG.shuffle=function(cards,...args){const state=libraryWorlds.get(cards);if(state?.active)state.active.shuffles.push(cards);return shuffle.call(this,cards,...args);};
 const run=MTG.OracleV8MultizoneSearch.run;
 MTG.OracleV8MultizoneSearch.run=async function(ctx,effect,helpers){
  const state=worlds.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
  const owner=ctx.you,all=ctx.g.players.flatMap(player=>['library','hand','graveyard','exile'].flatMap(zone=>player[zone]));
  const row={effect,owner,source:ctx.src,before:state.h.genericProofSnapshot(state.context,all),choices:[],shuffles:[],
   zones:Object.fromEntries(effect.zones.map(zone=>[zone,owner[zone].slice()])),
   qualities:new Map(all.map(card=>[card,effect.clauses.map(clause=>clause.name?card.name===clause.name:matchesTarget(card,{...clause.filter,controller:'any'},state.context,ctx.src))]))};
  state.rows.push(row);const previous=state.active;state.active=row;
  const controller=owner.controller,decide=controller.decide;
  controller.decide=async function(game,q){
   let result;
   if(!owner.isAI&&q.aiHint?.kind==='oracleSearchScopes')result=q.aiHint.scope==='zones'?q.options.find(option=>option.label==='library').key:q.options.at(-1).key;
   else if(!owner.isAI&&q.type==='chooseCards'&&q.search)result=q.from.slice(0,q.max);
   else result=await decide.call(this,game,q);
   row.choices.push({query:q,result});return result;
  };
  try{return await run.call(this,ctx,effect,helpers);}finally{
   controller.decide=decide;row.after=state.h.genericProofSnapshot(state.context,all);state.active=previous;
  }
 };
}
export function stageMultizoneSearch(MTG,context,effect,h){
 if(effect.action!=='search-own-zones-v8')return false;
 install(MTG,context,h);
 for(const [index,clause]of effect.clauses.entries())for(const zone of effect.zones){
  let card;
  if(clause.name)card=h.zoneCard(MTG,context.a,h.fixtureDefinition(clause.name,['Creature']),zone);
  else{
   card=h.stageGenericTarget(MTG,context,{...clause.filter,controller:'you',zone:'graveyard'},'multizone-'+index+'-'+zone);
   if(zone!=='graveyard'){context.a.graveyard.splice(context.a.graveyard.indexOf(card),1);card.zone=zone;context.a[zone].push(card);}
  }
 }
 // An exact search must never include an unrelated card or another player's
 // otherwise qualifying graveyard card in its choice candidates.
 h.zoneCard(MTG,context.a,h.fixtureDefinition('Multizone nonmatching land',['Land']), 'graveyard');
 for(const clause of effect.clauses)if(clause.name)h.zoneCard(MTG,context.b,h.fixtureDefinition(clause.name,['Creature']),'graveyard');
 return true;
}
export function assertMultizoneSearch(MTG,context,effect,source,label){
 if(effect.action!=='search-own-zones-v8')return false;
 const row=worlds.get(context.game)?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));
 assert.ok(row,label+': real multizone runtime executes');row.verified=true;
 const zonesQuery=row.choices.find(choice=>choice.query.aiHint?.scope==='zones');assert.ok(zonesQuery,label+': controller chooses which zones to search');
 const zones=subsets(effect.zones)[Number(zonesQuery.result)];assert.ok(zones?.length);assert.ok(zones.every(zone=>effect.zones.includes(zone)));
 const clauseQuery=row.choices.find(choice=>choice.query.aiHint?.scope==='qualities');
 const clauses=effect.chooseClauses?subsets(effect.clauses.map((_,index)=>index))[Number(clauseQuery?.result)]:[0];assert.ok(clauses?.length);
 const searched=row.choices.filter(choice=>choice.query.type==='chooseCards'&&choice.query.search),claimed=new Set();
 let queryIndex=0;
 for(const index of clauses){
  const candidates=zones.flatMap(zone=>row.zones[zone]).filter(card=>!claimed.has(card)&&row.qualities.get(card)?.[index]);
  if(!candidates.length)continue;
  const choice=searched[queryIndex++];assert.ok(choice,label+': real card selection for each nonempty card quality');
  assert.ok(row.choices.indexOf(zonesQuery)<row.choices.indexOf(choice),label+': hidden candidates are available only after choosing zones');
  // Production manifests originate in the engine VM, while draft manifests
  // originate in the test realm. Normalize only the array containers; keep
  // every actual CardInst reference and its order in this exact-cohort check.
  assert.deepEqual([...choice.query.from],[...candidates],label+': exact own searched-zone matching cohort');
  const minimum=candidates.some(card=>row.before.cards.get(card).zone==='graveyard')?1:0;
  assert.equal(choice.query.min,minimum,label+': public matches require finding a card; hidden matches permit failure');assert.equal(choice.query.max,1);
  assert.ok(choice.result.length>=minimum&&choice.result.length<=1);
  for(const card of choice.result){
   assert.ok(candidates.includes(card)&&!claimed.has(card));claimed.add(card);
   const after=row.after.cards.get(card);assert.equal(after.zone,effect.destination,label+': selected card reaches the printed destination');
   if(effect.destination==='battlefield'){assert.equal(after.ctrl,row.owner);assert.equal(after.tapped,effect.tapped);}
  }
 }
 assert.equal(queryIndex,searched.length);assert.ok(claimed.size>0,label+': successful search branch has an actual selected card');
 assert.equal(row.shuffles.filter(library=>library===row.owner.library).length,zones.includes('library')?1:0,label+': shuffle exactly when the library was searched');
 for(const [card,old]of row.before.cards)if(effect.zones.includes(old.zone)&&!claimed.has(card)){
  const after=row.after.cards.get(card);assert.equal(after.zone,old.zone,label+': unselected cards remain in place');assert.equal(after.zoneVersion,old.zoneVersion);
 }
 if(effect.reveal)for(const card of claimed)assert.ok(context.revealEvidence?.some(event=>event.cards.includes(card)&&event.ctrl===row.owner),label+': printed reveal is witnessed');
 return true;
}
