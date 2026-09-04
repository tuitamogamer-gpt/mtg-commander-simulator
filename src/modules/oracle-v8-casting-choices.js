'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const KINDS=new Set(['cost','mana','revealHand','beholdPermanent','tapPermanent','blight']);
 const mana=/^(?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/;
 function compile(operation){
  if(operation.kind!=='mechanic-casting-choice-v8'||operation.contract!=='mechanic-casting-choice-v8'||Object.keys(operation).some(key=>!['kind','contract','options'].includes(key))||!Array.isArray(operation.options)||operation.options.length<2)throw Error('Invalid casting cost choice');
  const options=operation.options.map(option=>{
   if(!KINDS.has(option.kind))throw Error('Unsupported casting cost choice');
   const allowed={cost:['kind','costs'],mana:['kind','cost'],blight:['kind','n']}[option.kind]||['kind','object'];
   if(Object.keys(option).some(key=>!allowed.includes(key)))throw Error('Unknown casting cost choice field');
   if(option.kind==='cost'){
    if(option.costs?.length!==1||!['sacrifice','discard','exileGraveyard'].includes(option.costs[0].kind))throw Error('Unsupported combined choice payment');
    const cost=option.costs[0];if(cost.quantity.min!==cost.quantity.max||!Number.isSafeInteger(cost.quantity.min)||cost.quantity.min<1||cost.kind==='sacrifice'&&cost.quantity.min!==1)throw Error('Unsupported choice payment count');
    return{...option,compiled:MTG.compileOracleAdditionalCosts(option.costs)};
   }
   if(option.kind==='mana'){if(!mana.test(option.cost))throw Error('Unsupported choice mana');}
   else if(option.kind==='blight'){if(!Number.isSafeInteger(option.n)||option.n<1)throw Error('Invalid blight quantity');}
   else{
    const cost={id:'choice-filter',kind:option.kind==='revealHand'?'discard':'sacrifice',quantity:{min:1,max:1},object:option.object};
    MTG.compileOracleAdditionalCosts([cost]);
   }
   return{...option};
  });
  if(options.filter(option=>option.kind==='mana').length!==1)throw Error('Casting choice needs exactly one mana alternative');
  return{options};
 }
 function matches(card,object){
  if(!object)return card.is('Creature');
  if(object.types){const checks=object.types.map(type=>card.is(type));if(!(object.typeMatch==='all'?checks.every(Boolean):checks.some(Boolean)))return false;}
  const q=object.qualifier||{},sup=card.zone==='battlefield'?card.cur?.super||card.def.super||[]:card.def.super||[];
  return !(q.subtypes?.some(type=>!card.hasSub(type))||q.colors?.some(color=>!card.colors.includes(color))||q.notTypes?.some(type=>card.is(type))||q.supertypes?.some(type=>!sup.includes(type))||q.nontoken&&card.isToken||object.filters?.legendary&&!sup.includes('Legendary'));
 }
 const reserved=ctx=>(ctx.so?.oracleCostPlans||[]).flatMap(plan=>[...plan.sacrifices,...plan.discards,...plan.exiles,...(plan.returns||[]),...(plan.handExiles||[])]);
 function pool(ctx,option){
  const {g,you,src}=ctx,cost=option.costs?.[0],kind=cost?.kind||option.kind;
  const privateZone=['discard','revealHand','exileGraveyard'].includes(kind);
  const cards=['discard','revealHand'].includes(kind)?you.hand:kind==='exileGraveyard'?you.graveyard:g.bf();
  const used=reserved(ctx);
  return cards.filter(card=>card!==src&&!used.includes(card)&&matches(card,cost?.object||option.object)&&
   (privateZone||card.ctrl===you)&&
   (kind!=='sacrifice'||g.canSacrifice(card))&&(kind!=='tapPermanent'||!card.tapped));
 }
 function combinedCost(base,option){
  const cost={...base,pips:(base.pips||[]).map(pip=>pip.slice())};
  if(option?.kind==='mana'){const extra=MTG.parseCost(option.cost);cost.generic+=extra.generic;cost.pips.push(...extra.pips);}
  // Total-cost reductions apply after additional costs, including a colored
  // reduction that could not find a matching symbol in the printed base.
  for(const color of base.oracleColoredReductionRemaining||[]){const index=cost.pips.findIndex(pip=>pip.length===1&&pip[0]===color);if(index>=0)cost.pips.splice(index,1);}
  delete cost.oracleColoredReductionRemaining;
  return cost;
 }
 function payable(ctx,option,card){
  const protectedCards=reserved(ctx),kind=option.costs?.[0]?.kind||option.kind;
  return ctx.g.canPayMana(ctx.you,combinedCost(ctx.manaCost,option),{card:ctx.src,castOpts:ctx.castOpts||{},xVal:ctx.so?.x||0},
   {xVal:ctx.so?.x||0,protectedSacrifices:protectedCards.concat(card?[card]:[]),excludeCards:kind==='tapPermanent'&&card?[card]:[],reservedLife:(ctx.so?.oracleCostPlans||[]).reduce((n,plan)=>n+plan.life,0)});
 }
 function candidates(ctx,option){
  if(option.kind==='mana')return payable(ctx,option)?[null]:[];
  const cards=pool(ctx,option),cost=option.costs?.[0];
  if(cost&&cards.length<cost.quantity.min)return[];
  return cards.filter(card=>payable(ctx,option,card));
 }
 function viable(ctx,compiled){return compiled.options.map((option,index)=>({option,index,cards:candidates(ctx,option)})).filter(row=>row.cards.length);}
 const label=option=>option.kind==='mana'?`Pay ${option.cost}`:option.kind==='cost'?({sacrifice:'Sacrifice a permanent',discard:'Discard a card',exileGraveyard:`Exile ${option.costs[0].quantity.min} cards from your graveyard`}[option.costs[0].kind]):({revealHand:'Reveal a matching card from your hand',beholdPermanent:'Choose a matching permanent you control',tapPermanent:'Tap a matching untapped permanent',blight:`Blight ${option.n}`}[option.kind]);
 async function prepare(ctx,compiled){
  const options=viable(ctx,compiled);if(!options.length)return false;
  let selected=options[0];
  if(options.length>1){
   const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:`${ctx.src.name}: choose an additional cost`,options:options.map(row=>({key:String(row.index),label:label(row.option)})),aiHint:{kind:'oracleV4AdditionalCost',card:ctx.src}});
   selected=options.find(row=>String(row.index)===chosen);if(!selected)return false;
  }
  const option=selected.option,plan={index:selected.index,kind:option.kind,sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone};
  if(option.kind==='cost'){
   if(!await option.compiled.prepareTargets({...ctx,oracleAdditionalManaCost:combinedCost(ctx.manaCost,option)}))return false;
  }else if(option.kind!=='mana'){
   const cards=candidates(ctx,option),versions=new Map(cards.map(card=>[card,card.zoneVersion]));
   const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:cards,min:1,max:1,prompt:`${ctx.src.name}: ${label(option)}`,aiHint:{kind:option.kind==='blight'?'blight':option.kind==='tapPermanent'?'addlTap':'oracleAdditionalReveal',card:ctx.src,keepTargets:(ctx.so.targets||[]).flat(Infinity)}});
   if(!Array.isArray(answer)||answer.length!==1||!cards.includes(answer[0])||answer[0].zoneVersion!==versions.get(answer[0])||!candidates(ctx,option).includes(answer[0]))return false;
   plan.card=answer[0];plan.zone=answer[0].zone;plan.zoneVersion=answer[0].zoneVersion;
  }
  ctx.so.oracleCastingChoicePlan=plan;
  if(!validate(ctx,compiled))return false;
  if(option.kind==='mana'){const extra=MTG.parseCost(option.cost);ctx.manaCost.generic+=extra.generic;ctx.manaCost.pips.push(...extra.pips);}
  return true;
 }
 function validate(ctx,compiled){
  const plan=ctx.so.oracleCastingChoicePlan,option=compiled.options[plan?.index];
  if(!plan||!option||plan.kind!==option.kind||ctx.src.zoneVersion!==plan.sourceVersion||ctx.src.zone!==plan.sourceZone)return false;
  if(plan.card&&(plan.card.zone!==plan.zone||plan.card.zoneVersion!==plan.zoneVersion||!pool(ctx,option).includes(plan.card)))return false;
  return true;
 }
 async function commit(ctx,compiled){
  if(!validate(ctx,compiled))throw Error('Casting cost choice changed before payment');
  const plan=ctx.so.oracleCastingChoicePlan,option=compiled.options[plan.index],card=plan.card;
  const record={index:plan.index,kind:option.kind,...(card?{iid:card.iid,zoneVersion:card.zoneVersion}:{}),...(option.kind==='mana'?{cost:option.cost}:{}),...(option.kind==='blight'?{n:option.n}:{})};
  if(option.kind==='revealHand')await ctx.g.revealToHuman({kind:'additionalCost',ctrl:ctx.you,cards:[card],includeLands:true,source:ctx.src,title:`${ctx.src.name}: revealed additional cost`});
  if(option.kind==='tapPermanent')await ctx.g.tap(card);
  if(option.kind==='blight')await ctx.g.addM1(card,option.n,ctx.you,true);
  ctx.so.oracleCastingChoicePaid=record;delete ctx.so.oracleCastingChoicePlan;
  return true;
 }
 MTG.OracleV8CastingChoices={compile,canPay:(ctx,compiled)=>viable(ctx,compiled).length>0,prepare,validate,commit};
})();
