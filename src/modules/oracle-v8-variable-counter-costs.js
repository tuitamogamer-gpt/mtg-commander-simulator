'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const variable=info=>['X','all','chosen'].includes(info?.n);
 const live=ctx=>ctx.src?.zone==='battlefield'&&!ctx.src.phasedOut&&ctx.src.ctrl===ctx.you;
 const available=(ctx,info)=>Math.max(0,Number(ctx.src.counters[info.kinds[0]])||0);
 function compile(info){
  if(!variable(info)||Object.keys(info).some(key=>!['n','kinds','self','among'].includes(key))||info.self!==true||info.among!==false||!Array.isArray(info.kinds)||info.kinds.length!==1||!/^(?:[+-][0-9]+\/[+-][0-9]+|[a-z]+)$/.test(info.kinds[0]))throw Error('Unsupported variable Oracle counter payment');
  return {...info,kinds:info.kinds.slice()};
 }
 function funded(ctx,info,n){
  return !ctx.manaCost||ctx.g.canPayMana(ctx.you,ctx.manaCost,{card:ctx.src,isAbility:true},{xVal:info.n==='X'?n:0,excludeCards:ctx.tap?[ctx.src]:[],artifactAbilityAlreadyUsed:ctx.src.is('Artifact'),protectedSacrifices:[ctx.src],reservedCounters:n?[{card:ctx.src,zoneVersion:ctx.src.zoneVersion,kind:info.kinds[0],n}]:[]});
 }
 function canPay(ctx,info){return live(ctx)&&Number.isSafeInteger(available(ctx,info))&&funded(ctx,info,info.n==='all'?available(ctx,info):0);}
 async function announce(ctx,info,targets){
  if(!canPay(ctx,info))return false;
  const source=ctx.src,version=source.zoneVersion,kind=info.kinds[0],before=available(ctx,info);let n=before;
  if(info.n!=='all'){
   let maximum=before;
   if(info.n==='X'&&ctx.manaCost?.x)maximum=Math.min(maximum,ctx.g.maxAffordableX(ctx.you,ctx.manaCost,source,{excludeCards:ctx.tap?[source]:[],protectedSacrifices:[source],artifactAbilityAlreadyUsed:source.is('Artifact')}));
   const preferredXValues=targets?.length?ctx.g.oraclePreferredTargetXValues(ctx.you,source,targets,maximum):null;
   const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:0,max:maximum,preferredXValues:preferredXValues||undefined,card:source,prompt:source.name+': how many '+kind+' counters to remove?',aiHint:{kind:'chooseX',card:source,counterPayment:true,counterKind:kind}});
   if(typeof chosen!=='number'&&(typeof chosen!=='string'||!/^\d+$/.test(chosen)))return false;
   n=Number(chosen);if(!Number.isSafeInteger(n)||n<0||n>maximum)return false;
  }
  if(!live(ctx)||source.zoneVersion!==version||available(ctx,info)<n||!funded(ctx,info,n))return false;
  ctx.x=n;ctx.oracleVariableCounterSelection={iid:source.iid,zoneVersion:version,kind,n,selector:info.n,available:before};
  return true;
 }
 function validate(ctx,info,plan){
  const selection=ctx.oracleVariableCounterSelection;
  if(!live(ctx)||!selection||selection.iid!==ctx.src.iid||selection.zoneVersion!==ctx.src.zoneVersion||selection.kind!==info.kinds[0]||selection.selector!==info.n||!Number.isSafeInteger(selection.n)||selection.n<0||available(ctx,info)<selection.n||info.n==='all'&&available(ctx,info)!==selection.n)return false;
  return Array.isArray(plan)&&plan.length===1&&plan[0].card===ctx.src&&plan[0].kind===selection.kind&&plan[0].zoneVersion===selection.zoneVersion&&plan[0].amount===selection.n;
 }
 function prepare(ctx,info){
  const selection=ctx.oracleVariableCounterSelection;if(!selection)return null;
  const plan=[{card:ctx.src,kind:selection.kind,zoneVersion:selection.zoneVersion,amount:selection.n}];
  return validate(ctx,info,plan)&&funded(ctx,info,selection.n)?plan:null;
 }
 function commit(ctx,info,plan){
  if(!validate(ctx,info,plan))return false;
  const row=plan[0];ctx.oracleCounterPayment=[{iid:row.card.iid,zoneVersion:row.zoneVersion,kind:row.kind,n:row.amount}];
  if(row.amount)ctx.g.removeCounters(row.card,row.kind,row.amount);return true;
 }
 function amount(ctx,value){return (ctx.oracleCounterPayment||[]).reduce((sum,row)=>sum+row.n,0)*value.multiply;}
 function emptyOutcome(operation,source){
  const info=operation.cost?.oracleCounterPayment;
  if(!variable(info)||(source.counters[info.kinds[0]]||0)>0||!operation.effects?.length)return false;
  const zero=value=>value===0||['X','+X','-X'].includes(value)||value?.kind==='counter-payment-v8'||value?.kind==='signed'&&zero(value.value);
  return operation.effects.every(effect=>{
   if(['damage','lose-life','gain-life','draw','token-inline','token-key','mill','scry','surveil'].includes(effect.action))return zero(effect.n);
   if(effect.action==='pump')return zero(effect.power)&&zero(effect.toughness)&&!effect.keywords?.length;
   return ['tap','untap'].includes(effect.action)&&typeof effect.target==='number'&&operation.targets?.[effect.target]?.targetCountX===true;
  });
 }
 MTG.OracleV8VariableCounterCosts={variable,compile,canPay,announce,prepare,validate,commit,amount,emptyOutcome};
})();
