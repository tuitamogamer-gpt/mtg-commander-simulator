'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const variable=info=>['X','all','chosen'].includes(info?.n);
 const live=ctx=>ctx.src?.zone==='battlefield'&&!ctx.src.phasedOut&&ctx.src.ctrl===ctx.you;
 const available=(ctx,info)=>Math.max(0,Number(ctx.src.counters[info.kinds[0]])||0);
 const amongRowsV66=(ctx,info)=>ctx.g.bf().filter(c=>!c.phasedOut&&c.ctrl===ctx.you&&info.filter(ctx.g,c,ctx.src,ctx.you)&&(c.counters[info.kinds[0]]||0)>0).map(card=>({card,kind:info.kinds[0],amount:card.counters[info.kinds[0]],zoneVersion:card.zoneVersion}));
 const amongFundsV66=(ctx,plan)=>!ctx.manaCost||ctx.g.canPayMana(ctx.you,ctx.manaCost,{card:ctx.src,isAbility:true},{excludeCards:ctx.tap?[ctx.src]:[],artifactAbilityAlreadyUsed:ctx.src.is('Artifact'),protectedSacrifices:[ctx.src,...plan.map(row=>row.card)],reservedCounters:plan.map(row=>({...row,n:row.amount}))});
 function compile(info,filter){
  if(info?.amongV66){if(Object.keys(info).some(k=>!['n','kinds','self','among','filter','amongV66','minV66'].includes(k))||info.n!=='chosen'||info.self!==false||info.among!==true||info.amongV66!==true||!Array.isArray(info.kinds)||info.kinds.length!==1||info.kinds[0]!=='+1/+1'||![0,1].includes(info.minV66)||typeof filter!=='function')throw Error('Invalid closed distributed counter payment');return {...info,kinds:info.kinds.slice(),filter};}
  if(!variable(info)||Object.keys(info).some(key=>!['n','kinds','self','among'].includes(key))||info.self!==true||info.among!==false||!Array.isArray(info.kinds)||info.kinds.length!==1||!/^(?:[+-][0-9]+\/[+-][0-9]+|[a-z]+)$/.test(info.kinds[0]))throw Error('Unsupported variable Oracle counter payment');
  return {...info,kinds:info.kinds.slice()};
 }
 function funded(ctx,info,n){
  return !ctx.manaCost||ctx.g.canPayMana(ctx.you,ctx.manaCost,{card:ctx.src,isAbility:true},{xVal:info.n==='X'?n:0,excludeCards:ctx.tap?[ctx.src]:[],artifactAbilityAlreadyUsed:ctx.src.is('Artifact'),protectedSacrifices:[ctx.src],reservedCounters:n?[{card:ctx.src,zoneVersion:ctx.src.zoneVersion,kind:info.kinds[0],n}]:[]});
 }
 function canPay(ctx,info){if(info.amongV66)return live(ctx)&&amongRowsV66(ctx,info).reduce((n,row)=>n+row.amount,0)>=info.minV66&&amongFundsV66(ctx,[]);return live(ctx)&&Number.isSafeInteger(available(ctx,info))&&funded(ctx,info,info.n==='all'?available(ctx,info):0);}
 async function announce(ctx,info,targets){
  if(info.amongV66){if(!canPay(ctx,info))return false;const version=ctx.src.zoneVersion,max=amongRowsV66(ctx,info).reduce((n,row)=>n+row.amount,0),chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:info.minV66,max,card:ctx.src,prompt:ctx.src.name+': choose counters to remove',preferredXValues:targets?.length?ctx.g.oraclePreferredTargetXValues(ctx.you,ctx.src,targets,max):undefined,aiHint:{kind:'chooseX',card:ctx.src,counterPayment:true,counterKind:'+1/+1'}});if(!Number.isSafeInteger(chosen)||chosen<info.minV66||chosen>max||!live(ctx)||ctx.src.zoneVersion!==version||amongRowsV66(ctx,info).reduce((n,row)=>n+row.amount,0)<chosen)return false;ctx.x=chosen;ctx.oracleVariableCounterSelection={iid:ctx.src.iid,zoneVersion:version,kind:'+1/+1',n:chosen,selector:'chosen',amongV66:true};return true;}
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
  if(info.amongV66){const selection=ctx.oracleVariableCounterSelection,rows=amongRowsV66(ctx,info);return live(ctx)&&selection?.amongV66===true&&selection.iid===ctx.src.iid&&selection.zoneVersion===ctx.src.zoneVersion&&Number.isSafeInteger(selection.n)&&selection.n>=info.minV66&&Array.isArray(plan)&&new Set(plan.map(r=>r.card)).size===plan.length&&plan.reduce((n,r)=>n+r.amount,0)===selection.n&&plan.every(r=>Number.isSafeInteger(r.amount)&&r.amount>0&&rows.some(row=>row.card===r.card&&row.zoneVersion===r.zoneVersion&&row.kind===r.kind&&row.amount>=r.amount));}
  const selection=ctx.oracleVariableCounterSelection;
  if(!live(ctx)||!selection||selection.iid!==ctx.src.iid||selection.zoneVersion!==ctx.src.zoneVersion||selection.kind!==info.kinds[0]||selection.selector!==info.n||!Number.isSafeInteger(selection.n)||selection.n<0||available(ctx,info)<selection.n||info.n==='all'&&available(ctx,info)!==selection.n)return false;
  return Array.isArray(plan)&&plan.length===1&&plan[0].card===ctx.src&&plan[0].kind===selection.kind&&plan[0].zoneVersion===selection.zoneVersion&&plan[0].amount===selection.n;
 }
 async function prepare(ctx,info){
  if(info.amongV66){
   const selection=ctx.oracleVariableCounterSelection;if(!selection?.amongV66)return null;const plan=[];
   while(plan.reduce((n,r)=>n+r.amount,0)<selection.n){
    const remaining=selection.n-plan.reduce((n,r)=>n+r.amount,0),rows=amongRowsV66(ctx,info).filter(row=>!plan.some(r=>r.card===row.card));
    const limits=row=>{const capacity=rows.filter(r=>r.card!==row.card).reduce((n,r)=>n+r.amount,0),min=Math.max(1,remaining-capacity);let max=Math.min(remaining,row.amount);if(min>max||!amongFundsV66(ctx,plan.concat({...row,amount:min})))return null;let low=min,high=max;while(low<high){const middle=Math.ceil((low+high)/2);if(amongFundsV66(ctx,plan.concat({...row,amount:middle})))low=middle;else high=middle-1;}return {min,max:low};};
    const offered=rows.map(row=>({row,limits:limits(row)})).filter(r=>r.limits),cards=offered.map(r=>r.row.card);if(!cards.length)return null;
    const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:cards,min:1,max:1,prompt:ctx.src.name+': choose a creature to remove counters from',aiHint:{kind:'counterCost',src:ctx.src,card:ctx.src}});if(!Array.isArray(chosen)||chosen.length!==1||!cards.includes(chosen[0]))return null;
    const {row,limits:{min,max}}=offered.find(r=>r.row.card===chosen[0]),amount=min===max?min:await ctx.you.controller.decide(ctx.g,{type:'chooseX',min,max,prompt:ctx.src.name+': counters from '+row.card.name,aiHint:{kind:'chooseX',card:row.card,counterPayment:true}});if(!Number.isSafeInteger(amount)||amount<min||amount>max||row.card.zoneVersion!==row.zoneVersion)return null;plan.push({...row,amount});
   }
   return validate(ctx,info,plan)&&amongFundsV66(ctx,plan)?plan:null;
  }
  const selection=ctx.oracleVariableCounterSelection;if(!selection)return null;
  const plan=[{card:ctx.src,kind:selection.kind,zoneVersion:selection.zoneVersion,amount:selection.n}];
  return validate(ctx,info,plan)&&funded(ctx,info,selection.n)?plan:null;
 }
 function commit(ctx,info,plan){
  if(info.amongV66){if(!validate(ctx,info,plan))return false;ctx.oracleCounterPayment=plan.map(r=>({iid:r.card.iid,zoneVersion:r.zoneVersion,kind:r.kind,n:r.amount}));for(const row of plan)ctx.g.removeCounters(row.card,row.kind,row.amount);return true;}
  if(!validate(ctx,info,plan))return false;
  const row=plan[0];ctx.oracleCounterPayment=[{iid:row.card.iid,zoneVersion:row.zoneVersion,kind:row.kind,n:row.amount}];
  if(row.amount)ctx.g.removeCounters(row.card,row.kind,row.amount);return true;
 }
 function amount(ctx,value){return (ctx.oracleCounterPayment||[]).reduce((sum,row)=>sum+row.n,0)*value.multiply;}
 function emptyOutcome(operation,source){
  const info=operation.cost?.oracleCounterPayment;
  if(info?.amongV66)return false;
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
