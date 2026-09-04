import assert from 'node:assert/strict';
import {matchesTarget}from'./oracle-v5-proof.mjs';
const worlds=new WeakMap(),installed=new WeakSet();
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function install(MTG,context,h){
 let state=worlds.get(context.game);
 if(!state){
  state={context,h,rows:[],current:null,trace:[],known:new Set()};worlds.set(context.game,state);
  for(const player of context.game.players){const decide=player.controller.decide;player.controller.decide=async function(game,query){const result=await decide.call(this,game,query);state.trace.push({query,result});return result;};}
 }
 state.h=h;
 if(installed.has(MTG.OracleV8Results))return;
 installed.add(MTG.OracleV8Results);
 const allCards=game=>[...game.bf(),...game.players.flatMap(player=>['hand','library','graveyard','exile'].flatMap(zone=>player[zone]))];
 const snap=state=>{for(const card of allCards(state.context.game))state.known.add(card);return state.h.genericProofSnapshot(state.context,[...state.known]);};
 const capture=MTG.OracleV8Results.capture;
 MTG.OracleV8Results.capture=async function(ctx,effect,run,helpers){
  const state=worlds.get(ctx.g);if(!state?.current)return capture.call(this,ctx,effect,run,helpers);
  const before=snap(state),start=ctx.oracleResolutionResults.cards.length;
  await capture.call(this,ctx,effect,run,helpers);
  const after=snap(state),event=MTG.OracleV8Results.family(effect),actual=ctx.oracleResolutionResults.cards.slice(start);
  const expected=[...before.cards].filter(([card,old])=>{
   const now=after.cards.get(card);if(!now||old.zoneVersion===now.zoneVersion)return false;
   return event==='selected-hand'?old.zone==='library'&&now.zone==='hand':event==='mill'?old.zone==='library':event==='discard'?old.zone==='hand':event==='sacrifice'?old.zone==='battlefield':old.zone!=='exile'&&(now.zone==='exile'||card.isToken&&old.zone==='battlefield'&&now.zone==='ceased');
  }).map(([card])=>card);
  assert.equal(actual.length,expected.length,ctx.src.name+': result cardinality equals actual zone events');
  assert.ok(actual.every(row=>expected.includes(row.card)),ctx.src.name+': no unrelated card enters the result');
  const frozen=expected.map(card=>{
   const old=before.cards.get(card),now=after.cards.get(card),row=old.zone==='battlefield'?old:now;
   return {card,view:{...row,zone:'graveyard',ctrl:old.ctrl,owner:card.owner,def:{...card.def,types:row.types,subtypes:row.subtypes},cur:{super:row.super||card.def.super||[]},is:type=>row.types.includes(type),hasSub:type=>row.subtypes.includes(type),kw:keyword=>row.keywords.includes(keyword),isToken:card.isToken}};
  });
  state.current.captured.push(...frozen);
 };
 const run=MTG.OracleV8Results.run;
 MTG.OracleV8Results.run=async function(ctx,effect,helpers){
  const state=worlds.get(ctx.g);if(!state)return run.call(this,ctx,effect,helpers);
  const previous=state.current,row={source:ctx.src,effect,children:[],captured:[],ctx};state.rows.push(row);state.current=row;
  try{
   row.result=await run.call(this,ctx,effect,{...helpers,run:async(childCtx,children)=>{
    const before=snap(state),child={ctx:childCtx,effects:children,before};row.children.push(child);
    for(const printed of children)if(printed.action==='zone-select'&&!state.context.zoneFixtures.has(printed)){const fixtures=[...before.cards].filter(([card,old])=>old.zone===printed.zone&&matchesTarget(card,{...printed.filter,controller:'any'},state.context,ctx.src)).map(([card])=>card);state.context.zoneFixtures.set(printed,fixtures);}
    const result=await helpers.run(childCtx,children);child.after=snap(state);
    // Validate the real effect at its own resolution boundary, before a later
    // clause can draw more cards, change life again, or move the same object.
    for(const printed of children)await state.h.assertGenericEffectEvidence(MTG,state.context,{raw:{name:ctx.src.name},implementation:[]},printed,ctx.src,childCtx.targets||[],state.context.b,before,state.trace,ctx.src.name+'/bound-result');
    return result;
   }});
   row.after=snap(state);return row.result;
  }finally{state.current=previous;}
 };
}
export function stageCardResults(MTG,context,effect,h){
 if(effect.action!=='with-card-results-v8')return false;
 install(MTG,context,h);
 for(const clause of effect.clauses){
  for(let i=0;i<2;i++){
   const card=h.stageGenericTarget(MTG,context,{...clause.filter,controller:'you',zone:'graveyard'},'result-card-'+i);
   const zone=effect.event==='discard'?'hand':['mill','selected-hand'].includes(effect.event)||effect.effects.some(child=>child.action==='exile-top')?'library':effect.event==='sacrifice'?'battlefield':'graveyard';
   if(zone!=='graveyard'){context.a.graveyard.splice(context.a.graveyard.indexOf(card),1);card.zone=zone;(zone==='battlefield'?context.game.battlefield:context.a[zone]).push(card);}
  }
 }
 context.game.recalc();return true;
}
export function assertCardResults(MTG,context,effect,source,label){
 if(effect.action!=='with-card-results-v8')return false;
 const row=worlds.get(context.game)?.rows.find(row=>!row.verified&&row.source===source&&same(row.effect,effect));
 assert.ok(row,label+': bound result runtime actually executes');row.verified=true;
 assert.ok(row.children.length);assert.equal(same(row.children[0].effects,effect.effects),true,label+': original instructions are retained');
 const expected=[];
 for(const clause of effect.clauses){
  const matching=row.captured.filter(({view})=>matchesTarget(view,{...clause.filter,controller:'any'},context,source)),n=matching.length;
  const satisfies=!clause.shared?n>0:matching.some(({view:a},i)=>matching.slice(i+1).some(({view:b})=>clause.shared==='a color'?a.colors.some(color=>b.colors.includes(color)):clause.shared==='a card type'?a.types.some(type=>b.types.includes(type)):a.types.length===b.types.length&&a.types.every(type=>b.types.includes(type))));
  if(clause.action==='result-scaled-v8'){if(n)expected.push([{...clause.effects[0],n:clause.effects[0].n*n}]);}
  else if(clause.action==='result-select-v8'){
   const moved=row.captured.filter(({card})=>row.after.cards.get(card)?.zone==='hand');
   assert.ok(moved.length<=clause.max,label+': result selection respects its printed limit');
   assert.ok(moved.every(({card})=>matching.some(entry=>entry.card===card)),label+': only qualifying newly milled cards enter hand');
   if(!moved.length)expected.push(clause.elseEffects||[]);
  }
  else expected.push(satisfies?clause.effects:clause.elseEffects||[]);
 }
 assert.equal(row.children.length-1,expected.length,label+': every result clause executes once');
 for(const [i,printed]of expected.entries())assert.equal(same(row.children[i+1].effects,printed),true,label+': exact qualifying count chooses and scales the printed result');
 return true;
}
