(function(){
 'use strict';const MTG=globalThis.MTG;
 function install(script,operation){
  if(operation.kind!=='mechanic-keyword-payment-v8'||operation.contract!=='mechanic-keyword-payment-v8'||!['flashback','kicker','buyback'].includes(operation.keyword)||
   typeof operation.label!=='string'||!operation.label||!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(operation.mana)||
   Object.keys(operation).some(key=>!['kind','contract','keyword','mana','costs','label'].includes(key))||script[operation.keyword]||script.oracleKeywordPayments)throw Error('Invalid keyword payment');
  const cost=operation.costs?.[0];if(operation.costs?.length!==1||!['sacrifice','discard','payLife','returnPermanent','exileGraveyard'].includes(cost?.kind)||cost.quantity&&(cost.quantity.min!==cost.quantity.max||!Number.isSafeInteger(cost.quantity.min)||cost.quantity.min<1)||cost.amount&&(cost.amount.kind!=='number'||!Number.isSafeInteger(cost.amount.value)||cost.amount.value<1))throw Error('Unsupported keyword cost');
  const payment={...operation,compiled:MTG.compileOracleAdditionalCosts(operation.costs)};
  script.oracleKeywordPayments={[operation.keyword]:payment};
  if(operation.keyword==='flashback'){
   const alternatives=script.altCosts||=[];
   const option={oracleAlternativeId:'oracle-alt-'+alternatives.length,oracleAlternativeCost:true,oracleKeywordPayment:'flashback',flashback:true,
    altCostStr:operation.mana,oracleAdditionalCosts:operation.costs,label:operation.label,
    cond:(g,p,card)=>card.zone==='graveyard'&&p.graveyard.includes(card)&&payment.compiled.castCond(g,p,card),
    oraclePrepareCosts:ctx=>payment.compiled.prepareTargets({...ctx,strictCostChoices:true})};
   alternatives.push(option);script.flashback=option;
  }else script[operation.keyword]=operation.keyword==='kicker'?{cost:operation.mana}:operation.mana;
 }
 function canPay(g,you,src,keyword){
  const payment=src.def.oracleKeywordPayments?.[keyword];
  return !payment||payment.compiled.canPayContext({g,you,src,so:{x:0}});
 }
 async function prepare(ctx,keyword){
  const payment=ctx.src.def.oracleKeywordPayments?.[keyword];if(!payment)return true;
  return payment.compiled.prepareTargets({...ctx,strictCostChoices:true});
 }
 MTG.OracleV8KeywordPayments={install,canPay,prepare};
})();
