'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 function compile(info,filter){
  if(MTG.OracleV8VariableCounterCosts?.variable(info))return MTG.OracleV8VariableCounterCosts.compile(info,filter);
  if(Object.keys(info).some(key=>!['n','kinds','self','among','filter'].includes(key))||!Number.isInteger(info.n)||info.n<1||info.n>10||typeof info.self!=='boolean'||typeof info.among!=='boolean'||info.self&&info.among||!info.self&&typeof filter!=='function'||
   info.kinds!==null&&(!Array.isArray(info.kinds)||!info.kinds.length||info.kinds.some(kind=>typeof kind!=='string'||!kind)))throw Error('Unsupported Oracle counter payment');
  return{...info,filter};
 }
 function entries(ctx,info){
  const cards=info.self?[ctx.src]:ctx.g.bf();
  return cards.filter(card=>card.zone==='battlefield'&&!card.phasedOut&&(info.self||card.ctrl===ctx.you&&info.filter(ctx.g,card,ctx.src,ctx.you)))
   .flatMap(card=>Object.entries(card.counters).filter(([kind,n])=>n>0&&(!info.kinds||info.kinds.includes(kind))).map(([kind,n])=>({card,kind,n,zoneVersion:card.zoneVersion})));
 }
 const used=(plan,row)=>plan.filter(item=>item.card===row.card&&item.kind===row.kind).length;
 function choices(ctx,info,plan){return entries(ctx,info).filter(row=>used(plan,row)<row.n&&(info.among||!plan.length||plan[0].card===row.card));}
 function reservations(plan){const result=[];for(const row of plan){let same=result.find(item=>item.card===row.card&&item.kind===row.kind);if(!same){same={card:row.card,zoneVersion:row.zoneVersion,kind:row.kind,n:0};result.push(same);}same.n+=row.amount??1;}return result.filter(row=>row.n>0);}
 function funded(ctx,plan){return !ctx.manaCost||ctx.g.canPayMana(ctx.you,ctx.manaCost,{card:ctx.src,isAbility:true},{excludeCards:ctx.tap?[ctx.src]:[],artifactAbilityAlreadyUsed:ctx.src.is('Artifact'),reservedCounters:reservations(plan),protectedSacrifices:[...new Set(plan.map(row=>row.card))]});}
 function completion(ctx,info,plan=[],failed=new Set()){
  const key=JSON.stringify(reservations(plan).map(row=>[row.card.iid,row.zoneVersion,row.kind,row.n]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2].localeCompare(b[2])));
  if(failed.has(key))return null;
  if(plan.length===info.n){if(funded(ctx,plan))return plan;failed.add(key);return null;}
  const rows=choices(ctx,info,plan),capacity=new Map();
  for(const row of rows)capacity.set(row.card,(capacity.get(row.card)||0)+row.n-used(plan,row));
  const remaining=info.among?[...capacity.values()].reduce((sum,n)=>sum+n,0):Math.max(0,...capacity.values());
  if(remaining<info.n-plan.length){failed.add(key);return null;}
  for(const row of rows){const next=completion(ctx,info,plan.concat(row),failed);if(next)return next;}
  failed.add(key);
  return null;
 }
 function validate(ctx,info,plan){
  if(MTG.OracleV8VariableCounterCosts?.variable(info))return MTG.OracleV8VariableCounterCosts.validate(ctx,info,plan);
  if(!Array.isArray(plan)||plan.length!==info.n||!info.among&&new Set(plan.map(row=>row.card)).size!==1)return false;
  const available=entries(ctx,info);
  return reservations(plan).every(row=>available.some(current=>current.card===row.card&&current.kind===row.kind&&current.n>=row.n)&&
   plan.filter(item=>item.card===row.card).every(item=>item.zoneVersion===row.card.zoneVersion));
 }
 async function prepare(ctx,info){
  if(MTG.OracleV8VariableCounterCosts?.variable(info))return MTG.OracleV8VariableCounterCosts.prepare(ctx,info);
  const plan=[];if(!completion(ctx,info))return null;
  while(plan.length<info.n){
   const rows=choices(ctx,info,plan).filter(row=>completion(ctx,info,plan.concat(row))),cards=[...new Set(rows.map(row=>row.card))];
   const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:cards,min:1,max:1,prompt:`${ctx.src.name}: remove a counter (${info.n-plan.length} remaining)`,aiHint:{kind:'counterCost',src:ctx.src,card:ctx.src}});
   if(!Array.isArray(picked)||picked.length!==1||!cards.includes(picked[0]))return null;
   const kinds=rows.filter(row=>row.card===picked[0]);let selected=kinds[0];
   if(kinds.length>1){const kind=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a counter to remove',options:kinds.map(row=>({key:row.kind,label:row.kind})),aiHint:{kind:'counterCostKind',card:picked[0]}});selected=kinds.find(row=>row.kind===kind);}
   if(!selected||selected.card.zoneVersion!==selected.zoneVersion)return null;
   plan.push(selected);
  }
  return validate(ctx,info,plan)&&funded(ctx,plan)?plan:null;
 }
 function commit(ctx,info,plan){
  if(MTG.OracleV8VariableCounterCosts?.variable(info))return MTG.OracleV8VariableCounterCosts.commit(ctx,info,plan);
  if(!validate(ctx,info,plan))return false;
  ctx.oracleCounterPayment=reservations(plan).map(row=>({iid:row.card.iid,zoneVersion:row.card.zoneVersion,kind:row.kind,n:row.n}));
  for(const row of reservations(plan))ctx.g.removeCounters(row.card,row.kind,row.n);
  return true;
 }
 MTG.OracleV8CounterCosts={compile,canPay:(ctx,info)=>MTG.OracleV8VariableCounterCosts?.variable(info)?MTG.OracleV8VariableCounterCosts.canPay(ctx,info):!!completion(ctx,info),prepare,validate,commit,reservations};
})();
