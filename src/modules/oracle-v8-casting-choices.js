'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const KINDS=new Set(['cost','mana','revealHand','beholdPermanent','tapPermanent','blight']);
 const mana=/^(?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/;
 function compile(operation){
  const required=operation.requiredV18===true&&operation.options?.length===1&&operation.options[0].kind==='blight';
  if(operation.kind!=='mechanic-casting-choice-v8'||operation.contract!=='mechanic-casting-choice-v8'||Object.keys(operation).some(key=>!['kind','contract','options','requiredV18'].includes(key))||operation.requiredV18!==undefined&&!required||!Array.isArray(operation.options)||operation.options.length<(required?1:2))throw Error('Invalid casting cost choice');
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
  if(!required&&options.filter(option=>option.kind==='mana').length!==1)throw Error('Casting choice needs exactly one mana alternative');
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
   (kind!=='sacrifice'||g.canSacrifice(card))&&(kind!=='tapPermanent'||!card.tapped)&&(kind!=='blight'||g.canPutCountersV18(card,'-1/-1')));
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

 // Additional costs are announced before targets and paid after all choices
 // are checked. Teamwork taps creatures for their actual power (not crew power).
 function optionalCompile(operation){
  const payment=operation.payment;
  if(operation.kind!=='mechanic-optional-cost-v14'||operation.contract!=='mechanic-optional-cost-v14'||Object.keys(operation).some(key=>!['kind','payment','contract'].includes(key))||!['teamwork','blight','behold','evidence'].includes(payment?.kind))throw Error('Invalid optional casting cost');
  if(payment.kind==='behold'){if(Object.keys(payment).some(key=>!['kind','object'].includes(key)))throw Error('Invalid behold cost');MTG.compileOracleAdditionalCosts([{id:'behold-filter',kind:'discard',quantity:{min:1,max:1},object:payment.object}]);}
  else if(!Number.isSafeInteger(payment.n)||payment.n<1||Object.keys(payment).some(key=>!['kind','n'].includes(key)))throw Error('Invalid optional casting quantity');
  return {...payment};
 }
 function optionalPool(ctx){const payment=ctx.src.def.oracleOptionalCostV14;return (payment.kind==='evidence'?ctx.you.graveyard:payment.kind==='behold'?ctx.g.bf().filter(card=>card.ctrl===ctx.you).concat(ctx.you.hand):ctx.g.creatures(ctx.you)).filter(card=>card!==ctx.src&&(payment.kind!=='teamwork'||!card.tapped)&&!reserved(ctx).includes(card)&&(payment.kind!=='behold'||matches(card,payment.object)));}
 function optionalPayable(ctx,cards){return ctx.g.canPayMana(ctx.you,ctx.manaCost||ctx.g.spellCost(ctx.you,ctx.src,ctx.castOpts||{}),{card:ctx.src,castOpts:ctx.castOpts||{},xVal:ctx.so?.x||0},{xVal:ctx.so?.x||0,excludeCards:ctx.src.def.oracleOptionalCostV14.kind==='teamwork'?cards:[],protectedSacrifices:reserved(ctx).concat(cards)});}
 function optionalWitness(ctx,payment){
  if(!['teamwork','evidence'].includes(payment.kind)){const card=optionalPool(ctx).find(card=>optionalPayable(ctx,[card]));return card?[card]:null;}
  const weight=card=>payment.kind==='evidence'?card.mv:card.power,cards=optionalPool(ctx).filter(card=>weight(card)>0).sort((a,b)=>weight(b)-weight(a)),tail=Array(cards.length+1).fill(0);
  for(let i=cards.length-1;i>=0;i--)tail[i]=tail[i+1]+weight(cards[i]);
  const search=(i,power,picked)=>{
   if(power>=payment.n)return optionalPayable(ctx,picked)?picked:null;
   if(power+tail[i]<payment.n||!optionalPayable(ctx,picked))return null;
   for(let j=i;j<cards.length;j++){const result=search(j+1,power+weight(cards[j]),picked.concat(cards[j]));if(result)return result;}
   return null;
  };
  return search(0,0,[]);
 }
 function optionalValidate(ctx){
  const plan=ctx.so.oracleOptionalPlanV14,payment=ctx.src.def.oracleOptionalCostV14;
  if(!plan||!payment||ctx.src.zoneVersion!==plan.sourceVersion||ctx.src.zone!==plan.sourceZone)return false;
  const pool=optionalPool(ctx);
  return plan.cards.length>0&&plan.cards.every(row=>pool.includes(row.card)&&row.card.zoneVersion===row.version)&&(['teamwork','evidence'].includes(payment.kind)?plan.cards.reduce((n,row)=>n+(payment.kind==='evidence'?row.card.mv:row.card.power),0)>=payment.n:plan.cards.length===1);
 }
 async function optionalPrepare(ctx){
  const payment=ctx.src.def.oracleOptionalCostV14,witness=payment&&optionalWitness(ctx,payment);if(!witness)return false;
  const pool=optionalPool(ctx),locks=new Map(pool.map(card=>[card,card.zoneVersion]));
  const group=['teamwork','evidence'].includes(payment.kind),selected=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:pool,min:1,max:group?pool.length:1,prompt:ctx.src.name+': '+(payment.kind==='teamwork'?'Teamwork '+payment.n+' — tap creatures with at least this total power':payment.kind==='evidence'?'Collect evidence '+payment.n+' — exile graveyard cards with at least this total mana value':payment.kind==='blight'?'Blight '+payment.n+' — put counters on your creature':'Behold — choose a matching permanent or reveal a card from your hand'),aiHint:group?{kind:'crew',card:ctx.src,need:payment.n,teamworkV14:payment.kind==='teamwork',evidenceV14:payment.kind==='evidence'}:{kind:payment.kind==='blight'?'blight':'oracleAdditionalReveal',card:ctx.src,n:payment.n}});
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||selected.some(card=>!locks.has(card)||locks.get(card)!==card.zoneVersion))return false;
  ctx.so.oracleOptionalPlanV14={sourceVersion:ctx.src.zoneVersion,sourceZone:ctx.src.zone,cards:selected.map(card=>({card,version:card.zoneVersion}))};
  return optionalValidate(ctx)&&optionalPayable(ctx,selected);
 }
 async function optionalCommit(ctx){
  if(!optionalValidate(ctx))throw Error('Optional casting cost changed before payment');
  const cards=ctx.so.oracleOptionalPlanV14.cards.map(row=>row.card),payment=ctx.src.def.oracleOptionalCostV14;
  if(payment.kind==='teamwork'){for(const card of cards)ctx.g.tap(card);for(const card of cards)await ctx.g.emit('teamworkPaidV14',{card,player:ctx.you,spell:ctx.src});}
  else if(payment.kind==='blight')await ctx.g.addM1(cards[0],payment.n,ctx.you,true);
  else if(payment.kind==='evidence')await ctx.g.moveGraveyardBatch(cards,'exile');
  else if(cards[0].zone==='hand')await ctx.g.revealToHuman({cards,ctrl:ctx.you,source:ctx.src,kind:'additionalCost',includeLands:true});
  ctx.so.oracleOptionalCostPaidV14=cards.map(card=>({iid:card.iid,zoneVersion:card.zoneVersion}));delete ctx.so.oracleOptionalPlanV14;
 }
 MTG.OracleV14CastingCosts={compile:optionalCompile,canPay:(ctx,payment)=>!!optionalWitness(ctx,payment),prepare:optionalPrepare,validate:optionalValidate,commit:optionalCommit};
})();
