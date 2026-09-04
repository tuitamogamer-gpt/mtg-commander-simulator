(function(){
 'use strict';const MTG=globalThis.MTG;
 function install(script,operation){
  if(script.morph||script.oracleMorphPayment||operation.contract!=='mechanic-morph-cost-v8'||
    Object.keys(operation).some(key=>!['kind','label','revealColor','costs','contract'].includes(key))||
    typeof operation.label!=='string'||!operation.label||Boolean(operation.revealColor)===Boolean(operation.costs))throw new Error('Invalid Morph payment');
  if(operation.revealColor&&!['W','U','B','R','G'].includes(operation.revealColor))throw new Error('Invalid Morph reveal');
  if(operation.costs&&(operation.costs.length!==1||!['discard','payLife','returnPermanent'].includes(operation.costs[0].kind)))throw new Error('Unsupported Morph cost');
  const payment={...operation,...(operation.costs?{compiled:MTG.compileOracleAdditionalCosts(operation.costs)}:{})};
  script.morph='{0}';script.oracleMorphPayment=payment;
 }
 const frame=(g,you,src)=>({g,you,src,so:{x:0},allowSourceReturn:true,strictCostChoices:true});
 const cards=(you,payment)=>you.hand.filter(card=>card.colors.includes(payment.revealColor));
 function canPay(g,you,src,payment){
  return payment.revealColor?cards(you,payment).length>0:payment.compiled.canPayContext(frame(g,you,src));
 }
 async function pay(g,you,src,payment){
  const ctx=frame(g,you,src),version=src.zoneVersion,original=src.meta.faceDownDef;
  let revealed,revealVersion;
  if(payment.revealColor){
    const from=cards(you,payment);if(!from.length)return false;
    const versions=new Map(from.map(card=>[card,card.zoneVersion]));
    const answer=await you.controller.decide(g,{type:'chooseCards',from,min:1,max:1,prompt:'Morph — '+payment.label,aiHint:{kind:'revealCost'}});
    if(!Array.isArray(answer)||answer.length!==1||!from.includes(answer[0]))return false;
    revealed=answer[0];revealVersion=versions.get(revealed);
  }else if(await payment.compiled.prepareTargets(ctx)===false)return false;
  if(src.zone!=='battlefield'||src.zoneVersion!==version||src.ctrl!==you||!src.faceDown||src.meta.faceDownDef!==original||
    !g.faceUpCosts(src).some(option=>option.kind==='morph'&&option.cost===original.morph))return false;
  if(revealed){
    if(revealed.zone!=='hand'||revealed.zoneVersion!==revealVersion||!cards(you,payment).includes(revealed))return false;
    await g.revealToHuman({kind:'additionalCost',ctrl:you,cards:[revealed],includeLands:true,source:src,title:'Morph — revealed payment'});
  }else{
    if(!MTG.validateOracleAdditionalCostPlans(ctx))return false;
    await MTG.commitOracleAdditionalCosts(ctx);
  }
  return{sourceZoneVersion:version,...(revealed?{reveal:{iid:revealed.iid,zoneVersion:revealVersion,color:payment.revealColor}}:{costs:ctx.so.oracleV4AdditionalCost})};
 }
 MTG.OracleV8MorphCosts={install,canPay,pay};
})();
