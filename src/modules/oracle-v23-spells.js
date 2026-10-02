'use strict';
((M)=>{
 let H;
 const move=M.Game.prototype.move;
 M.Game.prototype.move=async function(card,...args){
  const version=card.zoneVersion,choices=[...(this.stack||[]),this.c1516Resolving].filter(Boolean).map(so=>so.castOpts?.oracleDragonChoiceV23).filter(choice=>choice?.iid===card.iid&&choice.version===version&&choice.zone===card.zone),snap=choices.length?this.snapshot(card):null,result=await move.call(this,card,...args);
  if(snap&&card.zoneVersion!==version)for(const choice of choices)choice.lastKnownPower=snap.power;
  return result;
 };
 const emit=M.Game.prototype.emit;
 M.Game.prototype.emit=async function(event,data){
  if(event==='cast'&&data?.so&&data.card?.def?.oracleDragonRevealV23){const so=data.so,record=so.castOpts.oracleDragonChoiceV23;so.castOpts.oracleDragonCastV23=!!record?.revealed||!data.card.def.oracleDragonRevealV23.chooseControlled&&this.bf().some(card=>card.ctrl===data.player&&card.hasSub('Dragon'));if(data.card.def.oracleDragonUncounterableV23&&so.castOpts.oracleDragonCastV23)so.oracleCantCounterV10=true;}
  if(event==='spellCopied'&&data?.so?.card?.def?.oracleDragonUncounterableV23&&data.so.castOpts.oracleDragonCastV23)data.so.oracleCantCounterV10=true;
  return emit.call(this,event,data);
 };
 const numbers=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
 const scalarKinds=new Set(['sacrifice','discard','payLife','returnPermanent','exileGraveyard','exileHand']);
 function compiledPayment(payment){
  if(!payment||!['additional','tap','behold','opponent-life','hand-exile-mv'].includes(payment.kind))throw Error('Unsupported v23 keyword payment');
  if(payment.kind==='hand-exile-mv'){if(payment.n!==1||!['W','U','B','R','G'].includes(payment.color)||payment.x!==true)throw Error('Invalid v23 mana value hand exile');return {...payment};}
  if(payment.kind==='additional'){
   if(!Array.isArray(payment.costs)||!payment.costs.length||payment.costs.some(cost=>!scalarKinds.has(cost.kind)))throw Error('Invalid atomic v23 additional costs');
   return {...payment,compiled:M.compileOracleAdditionalCosts(payment.costs)};
  }
  if(!numbers(payment.n,1)||payment.n>50||payment.kind!=='opponent-life'&&!payment.filter)throw Error('Invalid v23 keyword quantity');
  if(payment.filter)H.genericTargetSpec(payment.filter,[],0);return {...payment};
 }
 function matching(card,object){
  if(object.types&&! (object.typeMatch==='all'?object.types.every(type=>card.is(type)):object.types.some(type=>card.is(type))))return false;
  const q=object.qualifier||{};
  return !(q.subtypes&&!q.subtypes.every(type=>card.hasSub(type))||q.colors&&!q.colors.every(color=>card.colors.includes(color))||q.notTypes?.some(type=>card.is(type))||q.supertypes&&!q.supertypes.every(type=>(card.cur?.super||card.def.super||[]).includes(type))||q.nontoken&&card.isToken);
 }
 function costPool(ctx,cost){
  const {g,you,src}=ctx,battlefield=['sacrifice','returnPermanent'].includes(cost.kind),from=battlefield?g.bf().filter(card=>card.ctrl===you):['discard','exileHand'].includes(cost.kind)?you.hand:you.graveyard;
  return from.filter(card=>card!==src&&matching(card,cost.object)&&(cost.kind!=='sacrifice'||g.canSacrifice(card)));
 }
 function pool(ctx,payment){
  if(payment.kind==='dragon-reveal')return ctx.you.hand.filter(card=>card!==ctx.src&&card.hasSub('Dragon')).concat(payment.chooseControlled?ctx.g.bf().filter(card=>card.ctrl===ctx.you&&card.hasSub('Dragon')):[]);
  if(payment.kind==='hand-exile-mv')return ctx.you.hand.filter(card=>card!==ctx.src&&card.colors.includes(payment.color)&&card.mv===(ctx.so.x||0));
  const {g,you,src}=ctx,quality=H.genericTargetSpec({...payment.filter,controller:'any',zone:payment.kind==='behold'?'graveyard':payment.filter.zone},[],0);
  const from=g.bf().filter(card=>card.ctrl===you).concat(payment.kind==='behold'?you.hand:[]);
  return from.filter(card=>card!==src&&(payment.kind!=='tap'||!card.tapped)&&quality.filter(g,payment.kind==='behold'?Object.defineProperty(Object.create(card),'zone',{value:'graveyard'}):card,you,src));
 }
 const opponents=ctx=>ctx.you.opponents(ctx.g).filter(player=>ctx.g.canGainLife(player));
 const reserved=so=>(so.oracleCostPlans||[]).flatMap(plan=>[...plan.sacrifices,...plan.discards,...plan.exiles,...(plan.returns||[]),...(plan.handExiles||[])]);
 const protectedChoices=ctx=>(ctx.so.oracleSpecialPaymentsV23||[]).filter(row=>['behold','dragon-reveal'].includes(row.payment.kind)).flatMap(row=>(row.cards||[]).filter(item=>item.zone==='battlefield').map(item=>item.card));
 function feasible(ctx,payments,mana,tapped=[]){
  const {g,you,src,so}=ctx,x=so.x||0;
  if(mana&&!g.canPayMana(you,mana,{card:src,castOpts:ctx.castOpts||{},xVal:x},{xVal:x,excludeCards:tapped}))return false;
  const atomic=payments.filter(payment=>payment.kind==='additional').flatMap(payment=>payment.costs),life=atomic.filter(cost=>cost.kind==='payLife').reduce((sum,cost)=>sum+cost.amount.value,0)+(so.oracleCostPlans||[]).reduce((sum,plan)=>sum+plan.life,0);
  if(you.life<life||g.canPayLife&&!g.canPayLife(you,life)||payments.some(payment=>payment.kind==='opponent-life'&&!opponents(ctx).length||payment.kind==='behold'&&pool(ctx,payment).length<payment.n))return false;
  const slots=atomic.filter(cost=>cost.kind!=='payLife').flatMap(cost=>Array.from({length:cost.quantity.xV19?x:cost.quantity.min},()=>costPool(ctx,cost))),taken=new Set(reserved(so)),assign=new Map();
  // Exact bipartite matching reserves each destructive cost card once.
  const augment=(slot,seen)=>{for(const card of slots[slot]){if(taken.has(card)||seen.has(card))continue;seen.add(card);const old=assign.get(card);if(old===undefined||augment(old,seen)){assign.set(card,slot);return true;}}return false;};
  for(const index of slots.map((_,i)=>i).sort((a,b)=>slots[a].length-slots[b].length))if(!augment(index,new Set()))return false;
  const destructive=[...assign.keys()],groups=payments.filter(payment=>['tap','behold'].includes(payment.kind)),used=new Set(tapped),selected=[],protectedBehold=[];
  const affordable=()=>!mana||g.canPayMana(you,mana,{card:src,castOpts:ctx.castOpts||{},xVal:x},{xVal:x,excludeCards:[...tapped,...selected],protectedSacrifices:[...taken,...destructive,...protectedChoices(ctx),...protectedBehold],reservedLife:life});
  const choose=(index)=>{if(index===groups.length)return affordable();const payment=groups[index],cards=pool(ctx,payment).filter(card=>payment.kind!=='tap'||!used.has(card));if(cards.length<payment.n)return false;
   const group=(start,left)=>{if(!left)return choose(index+1);for(let i=start;i<=cards.length-left;i++){const card=cards[i],tap=payment.kind==='tap',protect=!tap&&card.zone==='battlefield';if(tap){used.add(card);selected.push(card);}if(protect)protectedBehold.push(card);if(group(i+1,left-1))return true;if(tap){selected.pop();used.delete(card);}if(protect)protectedBehold.pop();}return false;};return group(0,payment.n);};
  return choose(0);
 }
 async function prepare(ctx,payment,mana,tapped=[]){
  if(payment.kind==='additional')return payment.compiled.prepareTargets({...ctx,strictCostChoices:true});
  if(!feasible(ctx,[payment],mana,tapped))return false;
  const row={payment,source:ctx.src,sourceZone:ctx.src.zone,sourceVersion:ctx.src.zoneVersion};
  if(payment.kind==='opponent-life'){
   const from=opponents(ctx),key=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': choose an opponent to gain '+payment.n+' life',options:from.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'oracleChoice'}});
   row.opponent=from.find(player=>String(player.idx)===key);if(!row.opponent)return false;
  }else{
   const from=pool(ctx,payment).filter(card=>payment.kind!=='tap'||!tapped.includes(card)),versions=new Map(from.map(card=>[card,card.zoneVersion]));
   const canPayRemaining=picks=>!mana||ctx.g.canPayMana(ctx.you,mana,{card:ctx.src,castOpts:ctx.castOpts||{},xVal:ctx.so.x||0},{xVal:ctx.so.x||0,excludeCards:payment.kind==='tap'?[...tapped,...picks]:tapped,protectedSacrifices:reserved(ctx.so).concat(protectedChoices(ctx),payment.kind==='behold'?picks.filter(card=>card.zone==='battlefield'):[]),reservedLife:(ctx.so.oracleCostPlans||[]).reduce((sum,plan)=>sum+plan.life,0)});
   const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:payment.n,max:payment.n,prompt:ctx.src.name+': '+(payment.kind==='tap'?'tap untapped permanents':payment.kind==='hand-exile-mv'?'exile a colored card with mana value X':'behold matching permanents or cards'),aiHint:{kind:payment.kind==='tap'?'addlTap':'oracleAdditionalReveal',card:ctx.src,required:payment.n,...(['tap','behold'].includes(payment.kind)?{canPayRemaining}:{})}});
   if(!Array.isArray(picked)||picked.length!==payment.n||new Set(picked).size!==picked.length||picked.some(card=>!from.includes(card)||card.zoneVersion!==versions.get(card))||!canPayRemaining(picked))return false;
   row.cards=picked.map(card=>({card,zone:card.zone,version:card.zoneVersion}));
   if(payment.kind==='hand-exile-mv'){
    const cost={id:'v23-shoal',kind:'exileHand',quantity:{min:1,max:1},object:{kind:'card',qualifier:{colors:[payment.color]}}};
    (ctx.so.oracleCostPlans||=[]).push({sacrifices:[],discards:[],exiles:[],returns:[],handExiles:picked,life:0,choices:[],selections:[{cost,cards:picked.map(card=>({card,zone:card.zone,zoneVersion:card.zoneVersion}))}],reservedCards:reserved(ctx.so)});
   }
  }
  (ctx.so.oracleSpecialPaymentsV23||=[]).push(row);return true;
 }
 const splicePayment=plan=>plan.card.def.oracleSpliceV11?.paymentV23;
 function spliceFeasible(g,you,src,candidate,castOpts,mana,x,plans=[]){return feasible({g,you,src,so:{x},castOpts},plans.map(splicePayment).concat(candidate.def.oracleSpliceV11.paymentV23).filter(Boolean),mana);}
 async function prepareSplice(ctx,plans,paid,mana){
  const payments=plans.map(splicePayment).filter(Boolean);if(!payments.length&&!ctx.so.oracleSpecialPaymentsV23?.length)return true;
  for(const row of ctx.so.oracleSpecialPaymentsV23||[])if(row.payment.kind==='tap')for(const item of row.cards)if(!paid.tapped.includes(item.card))paid.tapped.push(item.card);
  if(!feasible(ctx,payments,mana,paid.tapped))return false;
  const costs=payments.filter(payment=>payment.kind==='additional').flatMap((payment,index)=>payment.costs.map((cost,i)=>({...cost,id:'v23-splice-'+index+'-'+i})));
  if(costs.length&&!await M.compileOracleAdditionalCosts(costs).prepareTargets({...ctx,strictCostChoices:true}))return false;
  for(const payment of payments.filter(payment=>payment.kind!=='additional')){if(!await prepare(ctx,payment,mana,paid.tapped))return false;if(payment.kind==='tap')for(const item of ctx.so.oracleSpecialPaymentsV23.at(-1).cards)paid.tapped.push(item.card);}
  return validateSplice(ctx);
 }
 function validateSplice(ctx){
  const tapped=new Set();
  for(const row of ctx.so.oracleSpecialPaymentsV23||[]){if(row.source!==ctx.src||ctx.src.zone!==row.sourceZone||ctx.src.zoneVersion!==row.sourceVersion)return false;
   if(row.payment.kind==='opponent-life'){if(!opponents(ctx).includes(row.opponent))return false;}
   else {const from=pool(ctx,row.payment);if(row.cards.length!==row.payment.n||row.cards.some(item=>!from.includes(item.card)||item.card.zone!==item.zone||item.card.zoneVersion!==item.version))return false;if(row.payment.kind==='tap')for(const item of row.cards){if(tapped.has(item.card))return false;tapped.add(item.card);}}
  }
  const energy=ctx.castOpts?.oracleReplicateEnergyV23;return !energy||ctx.src.def.oracleReplicatePaymentV23&&numbers(energy)&&M.OracleV8Energy.count(ctx.you)>=energy;
 }
 async function commitSplice(ctx){
  if(!ctx.so.oracleSpecialPaymentsV23?.length&&!ctx.castOpts?.oracleReplicateEnergyV23)return;
  if(!validateSplice(ctx))throw Error('A v23 nonmana cost changed before payment');
  const rows=ctx.so.oracleSpecialPaymentsV23||[];ctx.so.oraclePaidSpecialV23=rows.map(row=>({kind:row.payment.kind,n:row.payment.n,cards:row.cards?.map(item=>({iid:item.card.iid,zoneVersion:item.version,zone:item.zone})),opponent:row.opponent?.idx}));
  for(const row of rows)if(row.payment.kind==='tap')for(const item of row.cards)ctx.g.tap(item.card);
  for(const row of rows)if(row.payment.kind==='behold'){const hand=row.cards.filter(item=>item.zone==='hand').map(item=>item.card);if(hand.length)await ctx.g.revealToHuman({cards:hand,ctrl:ctx.you,source:ctx.src,kind:'additionalCost',includeLands:true});}else if(row.payment.kind==='opponent-life')await ctx.g.gainLife(row.opponent,row.payment.n,ctx.src);
  for(const row of rows)if(row.payment.kind==='dragon-reveal'){const item=row.cards[0],card=item?.card;if(item?.zone==='hand')await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,source:ctx.src,kind:'additionalCost',includeLands:true});ctx.so.castOpts.oracleDragonChoiceV23=item?{revealed:item.zone==='hand',iid:card.iid,card,version:item.version,zone:item.zone,power:card.power}:null;}
  delete ctx.so.oracleSpecialPaymentsV23;
  if(ctx.castOpts?.oracleReplicateEnergyV23&&!M.OracleV8Energy.spend(ctx.g,ctx.you,ctx.castOpts.oracleReplicateEnergyV23,ctx.src))throw Error('Replicate energy changed before payment');
 }
 function flashbackMaximum(g,you,src,castOpts,mana){
  if(castOpts.oracleHandExileMVV23){const payment=src.def.oracleHandExileMVV23;return Math.max(-1,...you.hand.filter(card=>card!==src&&card.colors.includes(payment.color)).map(card=>card.mv));}
  const payment=src.def.oracleFlashbackPaymentV23;if(!payment?.x)return g.maxAffordableX(you,mana,src,{castOpts});
  const ctx={g,you,src,so:{x:0},castOpts};let max=Math.min(...payment.costs.filter(cost=>cost.quantity?.xV19).map(cost=>costPool(ctx,cost).length));
  if(mana.x)max=Math.min(max,g.maxAffordableX(you,mana,src,{castOpts}));return max;
 }
 M.OracleV23Spells={spliceFeasible,prepareSplice,validateSplice,commitSplice,flashbackMaximum,protectedChoices};
 let installed=false;M.OracleV23Spells.install=()=>{if(installed)return;installed=true;const replicate=M.C1920.replicatePayments;
 M.C1920.replicatePayments=async(g,you,src,castOpts,mana,x)=>{
  const plans=await replicate(g,you,src,castOpts,mana,x);if(!plans)return null;
  delete castOpts.oracleReplicateEnergyV23;const payment=g.castDefinition(src,castOpts).oracleReplicatePaymentV23;if(!payment||castOpts.faceDownCast)return plans;
  const max=Math.floor(M.OracleV8Energy.count(you)/payment.energy);if(!max)return plans;
  const n=await you.controller.decide(g,{type:'chooseX',min:0,max,card:src,prompt:src.name+': pay '+payment.energy+' energy for each replicate copy?',aiHint:{kind:'replicate',card:src}});
  if(!numbers(n)||n>max)return null;if(n){castOpts.oracleReplicateEnergyV23=n*payment.energy;plans.push({count:n,source:null});}return plans;
 };
 };
 M.OracleV20.handlers.push({spellsV23:true,compile(op,script,entry,h){
  if(op.kind==='mechanic-dragon-uncounterable-v23'){script.oracleDragonUncounterableV23=true;return true;}
  if(op.kind==='mechanic-dragon-reveal-v23'){
   script.oracleDragonRevealV23={chooseControlled:!!op.chooseControlled};const prior=script.prepareTargets;script.prepareTargets=async ctx=>{if(prior&&await prior(ctx)===false)return false;const payment={kind:'dragon-reveal',chooseControlled:!!op.chooseControlled},from=pool(ctx,payment),versions=new Map(from.map(card=>[card,card.zoneVersion]));
    const selected=from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:1,prompt:ctx.src.name+': optionally reveal a Dragon card'+(op.chooseControlled?' or choose a Dragon you control':''),aiHint:{kind:'oracleAdditionalReveal',card:ctx.src}}):[];
    if(!Array.isArray(selected)||selected.length>1||new Set(selected).size!==selected.length||selected.some(card=>!from.includes(card)||card.zoneVersion!==versions.get(card)))return false;
    const cards=selected.map(card=>({card,zone:card.zone,version:card.zoneVersion}));
    (ctx.so.oracleSpecialPaymentsV23||=[]).push({payment:{...payment,n:cards.length},cards,source:ctx.src,sourceZone:ctx.src.zone,sourceVersion:ctx.src.zoneVersion});delete ctx.so.castOpts.oracleDragonChoiceV23;delete ctx.so.castOpts.oracleDragonCastV23;return true;};return true;
  }
  if(!/^mechanic-(?:splice|flashback|buyback|escalate|replicate|alternative)-payment-v23$/.test(op.kind))return false;H=h;
  if(op.kind==='mechanic-replicate-payment-v23'){if(!numbers(op.energy,1)||script.replicate)throw Error('Invalid v23 energy replicate');script.oracleReplicatePaymentV23={energy:op.energy};return true;}
  const payment=compiledPayment(op.payment);
  if(op.kind==='mechanic-alternative-payment-v23'){
   const alternatives=script.altCosts||=([]),variable=payment.kind==='hand-exile-mv';
   alternatives.push({oracleAlternativeId:'oracle-alt-'+alternatives.length,oracleAlternativeCost:true,altCostStr:op.mana,label:op.label,...(variable?{oracleFlashbackXV23:true,oracleHandExileMVV23:true}:{}),
    cond:(g,you,src)=>variable?you.hand.some(card=>card!==src&&card.colors.includes(payment.color)):feasible({g,you,src,so:{x:0},castOpts:{}},[payment],null),
    oraclePrepareCosts:ctx=>prepare(ctx,payment,ctx.g.spellCost(ctx.you,ctx.src,ctx.castOpts||{}))});
   if(variable){script.oracleHandExileMVV23=payment;const prior=script.xValues;script.xValues=(g,src,you,options)=>options?.oracleHandExileMVV23?you.hand.filter(card=>card!==src&&card.colors.includes(payment.color)).map(card=>card.mv):prior?prior(g,src,you,options):Array.from({length:g.maxAffordableX(you,g.spellCost(you,src,options||{}),src,{castOpts:options||{}})+1},(_,i)=>i);}
   return true;
  }
  if(op.kind==='mechanic-splice-payment-v23'){if(!['Arcane','instant or sorcery'].includes(op.onto)||script.oracleSpliceV11)throw Error('Invalid v23 splice');script.oracleSpliceV11={onto:op.onto,cost:'{0}',paymentV23:payment};return true;}
  if(op.kind==='mechanic-buyback-payment-v23'){if(script.buyback||payment.kind!=='additional'||payment.x)throw Error('Invalid v23 buyback');script.buyback=op.mana;script.oracleKeywordPayments={...script.oracleKeywordPayments,buyback:{label:op.label,compiled:payment.compiled}};return true;}
  if(op.kind==='mechanic-escalate-payment-v23'){
   const prior=script.prepareTargets;script.prepareTargets=async ctx=>{if(prior&&await prior(ctx)===false)return false;const n=Math.max(0,(ctx.so.mode||[]).length-1);if(!n)return true;const costs=payment.costs.map(cost=>({...cost,quantity:{min:n,max:n}}));return M.compileOracleAdditionalCosts(costs).prepareTargets({...ctx,strictCostChoices:true});};return true;
  }
  if(script.flashback)throw Error('Duplicate v23 flashback');const alternatives=script.altCosts||=[],option={oracleAlternativeId:'oracle-alt-'+alternatives.length,oracleAlternativeCost:true,oracleKeywordPayment:'flashback',flashback:true,altCostStr:op.mana,label:op.label,...(payment.x?{oracleFlashbackXV23:true}:{}),
   cond:(g,you,src)=>src.zone==='graveyard'&&you.graveyard.includes(src)&&feasible({g,you,src,so:{x:0},castOpts:{}},[payment],g.spellCost(you,src,{flashback:true,altCostStr:op.mana})),oraclePrepareCosts:ctx=>prepare(ctx,payment,ctx.g.spellCost(ctx.you,ctx.src,ctx.castOpts||{}))};
  alternatives.push(option);script.flashback=option;script.oracleFlashbackPaymentV23=payment;return true;
 },async effect(ctx,effect,h){
  if(effect.action==='dragon-bonus-v23'){if(ctx.so?.castOpts?.oracleDragonCastV23)await h.runGenericEffects(ctx,effect.effects);return true;}
  if(effect.action==='dragon-counter-v23'){await h.runGenericEffects(ctx,[{action:'counter-spell',target:effect.target,...(!ctx.so?.castOpts?.oracleDragonCastV23?{unlessPay:'{1}'}:{})}]);return true;}
  if(effect.action==='dragon-power-damage-v23'){
   const choice=ctx.so?.castOpts?.oracleDragonChoiceV23,card=choice&&(ctx.g.byIid(choice.iid)||choice.card),power=choice?(card?.zone===choice.zone&&card.zoneVersion===choice.version?card.power:choice.lastKnownPower??choice.power):effect.otherwise;
   await h.runGenericEffects(ctx,[{action:'damage',target:effect.target,n:Math.max(0,Number(power)||0)}]);return true;
  }
  if(effect.action!=='counter-x-payment-v23')return false;const spell=h.genericEffectSubjects(ctx,effect.target)[0];if(spell&&ctx.g.stack.includes(spell)&&ctx.g.stackSpellManaValue(spell)===(ctx.so.x||0))await ctx.g.counterStackObject(spell);return true;
 }});
})(globalThis.MTG);
