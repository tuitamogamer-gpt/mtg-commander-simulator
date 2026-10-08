'use strict';
((M)=>{
 const discountPlans=new WeakMap();
 const emit=M.Game.prototype.emit;M.Game.prototype.emit=async function(event,data){if(event==='cast'&&data?.so&&data.card?.def?.oracleAggregateTapV24)data.so.castOpts.oracleTapPaymentCountV24=data.so.oracleTapPlanV20?.rows.length||0;return emit.call(this,event,data);};
 const indices=(source,evidence,opts)=>evidence?.castFlagsV10?.oracleDualKickerV24??opts?.oracleDualKickerV24??source.castMeta?.alt?.oracleDualKickerV24??[];
 const hasCost=(source,cost,evidence,opts)=>indices(source,evidence,opts).some(i=>source.def.oracleDualKickerV24?.[i]===cost);
 const matching=(you,src,color)=>you.hand.filter(card=>card!==src&&card.zone==='hand'&&card.owner===you&&card.colors.includes(color));
 function previewDiscount(g,you,src,opts,mana){const op=g.castDefinition(src,opts).oracleHandExileReductionV24;if(op&&!opts.faceDownCast)mana.xReduction=(mana.xReduction||0)+matching(you,src,op.color).length*op.reduction;return mana;}
 async function prepareDiscount(g,you,src,opts,mana){
  delete opts.oracleHandExileReductionV24;discountPlans.delete(opts);
  const op=g.castDefinition(src,opts).oracleHandExileReductionV24;if(!op||opts.faceDownCast)return true;
  const from=matching(you,src,op.color),version=src.zoneVersion,zone=src.zone,versions=new Map(from.map(card=>[card,card.zoneVersion]));
  const picks=from.length?await you.controller.decide(g,{type:'chooseCards',from,min:0,max:from.length,prompt:src.name+': exile colored hand cards to reduce its mana cost?',aiHint:{kind:'delve',card:src}}):[];
  if(src.zone!==zone||src.zoneVersion!==version||!Array.isArray(picks)||new Set(picks).size!==picks.length||picks.length>from.length||picks.some(card=>!from.includes(card)||card.zone!=='hand'||card.zoneVersion!==versions.get(card)||!you.hand.includes(card)||!card.colors.includes(op.color)))return false;
  discountPlans.set(opts,{source:src,zone,version,color:op.color,cards:picks.map(card=>({card,zone:'hand',zoneVersion:card.zoneVersion}))});
  mana.xReduction=(mana.xReduction||0)+picks.length*op.reduction;return true;
 }
 function attachDiscount(ctx){
  const op=ctx.g.castDefinition(ctx.src,ctx.castOpts).oracleHandExileReductionV24;if(!op||ctx.castOpts.faceDownCast)return true;
  const plan=discountPlans.get(ctx.castOpts);if(!plan||plan.source!==ctx.src||plan.zone!==ctx.src.zone||plan.version!==ctx.src.zoneVersion||plan.cards.some(row=>row.card.zone!==row.zone||row.card.zoneVersion!==row.zoneVersion||!ctx.you.hand.includes(row.card)||!row.card.colors.includes(plan.color)))return false;
  if(plan.cards.length){const cost={id:'v24-march',kind:'exileHand',quantity:{min:plan.cards.length,max:plan.cards.length},object:{kind:'card',qualifier:{colors:[plan.color]}}};(ctx.so.oracleCostPlans||=[]).push({sacrifices:[],discards:[],exiles:[],returns:[],handExiles:plan.cards.map(row=>row.card),life:0,choices:[],selections:[{cost,cards:plan.cards}],reservedCards:[]});}
  discountPlans.delete(ctx.castOpts);return true;
 }
 async function chooseDualKicker(g,you,src,opts,mana,x,preview=combined=>combined){
  delete opts.oracleDualKickerV24;
  delete opts.oracleRepeatedAdditionalV24;
  const repeated=g.castDefinition(src,opts).oracleRepeatedAdditionalV24;
  if(repeated&&!opts.faceDownCast){const extra=M.parseCost(repeated),make=n=>({...mana,generic:mana.generic+extra.generic*n,pips:mana.pips.concat(Array(n).fill(extra.pips).flat())}),bound=g.maxAffordableX(you,{...mana,generic:mana.generic+(mana.x||0)*x,x:1},src,{castOpts:opts})+(mana.oracleColoredReductionRemaining?.length||0);let low=0,high=bound+1;while(low+1<high){const n=low+Math.floor((high-low)/2);if(g.canPayMana(you,preview(make(n),mana),{card:src,castOpts:opts},{xVal:x}))low=n;else high=n;}const n=low?await you.controller.decide(g,{type:'chooseX',min:0,max:low,prompt:src.name+': pay '+repeated+' any number of times',aiHint:{kind:'chooseX',card:src}}):0;if(!Number.isSafeInteger(n)||n<0||n>low)return null;const combined=make(n);mana.generic=combined.generic;mana.pips=combined.pips;opts.oracleRepeatedAdditionalV24=n;}
  const costs=g.castDefinition(src,opts).oracleDualKickerV24;if(!costs||opts.faceDownCast)return [];
  const selected=[];
  for(let i=0;i<costs.length;i++){
   const extra=M.parseCost(costs[i]),combined={...mana,generic:mana.generic+extra.generic,pips:mana.pips.concat(extra.pips)};
   if(!g.canPayMana(you,preview(combined,mana,{kicked:true}),{card:src,castOpts:opts},{xVal:x}))continue;
   const choice=await you.controller.decide(g,{type:'chooseOption',prompt:src.name+': pay its '+costs[i]+' kicker?',options:[{key:'yes',label:'Pay '+costs[i]+' kicker'},{key:'no',label:'Do not pay'}],aiHint:{kind:'kicker',card:src}});
   if(!['yes','no'].includes(choice))return null;
   if(choice==='yes'){selected.push(i);mana.generic=combined.generic;mana.pips=combined.pips;}
  }
  opts.oracleDualKickerV24=selected;return selected;
 }
 function grantedAbility(kind){
  if(kind==='regenerate-life3')return {kind:'generic-ability',cost:{life:3},effects:[{action:'regenerate',target:'self'}],targets:[],sorceryOnly:false,onceEachTurn:false,contract:'generic-activated-effect'};
  if(kind==='damage-life')return {kind:'generic-trigger',event:['damageToPlayer','dealtDamage'],eventFilter:'self-source',effects:[{action:'gain-life',who:'you',n:{kind:'event-amount'}}],targets:[],optional:false,contract:'generic-trigger-effect'};
  throw Error('Invalid dual kicker granted ability');
 }
 function compileDynamicSpell(op,h){
  const rewrite=target=>{const {upToXTargetV24,strictXTargetV24,...base}=target;return strictXTargetV24?Object.fromEntries(Object.entries(base).filter(([key])=>!['stat','comparison','threshold'].includes(key))):base;};
  const converted={...op,targets:op.targets.map(rewrite)},compiled=h.compileSpell(converted);
  compiled.targets=compiled.targets.map((spec,i)=>{const target=op.targets[i];if(!target.upToXTargetV24&&!target.strictXTargetV24)return spec;const base=rewrite(target);return {...spec,bindOracleContext:ctx=>h.genericTargetSpec({...base,...(target.upToXTargetV24?{min:0,max:ctx.so?.x??ctx.x??0}:{stat:'mv',comparison:'less',threshold:(ctx.so?.x??ctx.x??0)-1})},op.effects,i)};});
  compiled.oracleOperation=op;compiled.targetOffset=h.spellFragments.reduce((sum,fragment)=>sum+(fragment.targets||[]).length,0);h.spellFragments.push(compiled);
 }
 M.OracleV24Spells={previewDiscount,prepareDiscount,attachDiscount,chooseDualKicker,hasCost};
 M.OracleV20.handlers.push({spellsV24:true,compile(op,script,entry,h){
  if(op.kind==='mechanic-dual-kicker-v24'){if(op.costs.length!==2||new Set(op.costs).size!==2||script.oracleDualKickerV24)throw Error('Invalid dual kicker descriptor');script.oracleDualKickerV24=op.costs.slice();return true;}
  if(op.kind==='mechanic-hand-exile-reduction-v24'){if(!'WUBRG'.includes(op.color)||op.reduction!==2)throw Error('Invalid hand exile reduction');script.oracleHandExileReductionV24={color:op.color,reduction:op.reduction};return true;}
  if(op.kind==='mechanic-repeat-mana-v24'){if(M.parseCost(op.cost).x||!M.parseCost(op.cost).generic&&!M.parseCost(op.cost).pips.length)throw Error('Invalid repeated additional mana');script.oracleRepeatedAdditionalV24=op.cost;return true;}
  if(op.kind==='spell-generic'&&JSON.stringify(op).includes('"payment":"tap"'))script.oracleAggregateTapV24=true;
  if(op.kind==='mechanic-aggregate-cost-v24'){
   if(op.all||op.discardAll)throw Error('Dynamic all costs need a separate payment system');
   const filter=h.genericTargetSpec(op.filter,[],0),pool=(g,you,src)=>g.bf().filter(card=>card!==src&&filter.filter(g,card,you,src)),cond=script.castCond,prior=script.prepareTargets;
   script.castCond=(g,you,src)=>(!cond||cond(g,you,src))&&(!op.all||pool(g,you,src).every(card=>g.canSacrifice(card)));
   script.prepareTargets=async ctx=>{if(await prior?.(ctx)===false)return false;const all=pool(ctx.g,ctx.you,ctx.src),from=op.all?all:all.filter(card=>ctx.g.canSacrifice(card));if(op.all&&from.some(card=>!ctx.g.canSacrifice(card)))return false;const versions=new Map(from.map(card=>[card,card.zoneVersion])),picks=op.all?from:from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:from.length,prompt:ctx.src.name+': sacrifice any number of matching creatures',aiHint:{kind:'sacCost',src:ctx.src,optional:true}}):[];if(!Array.isArray(picks)||new Set(picks).size!==picks.length||picks.length>from.length||picks.some(card=>!from.includes(card)||card.zone!=='battlefield'||card.zoneVersion!==versions.get(card)||!ctx.g.canSacrifice(card)))return false;
    const cost={id:'v24-sacrifice-group',kind:'sacrifice',quantity:{min:picks.length,max:picks.length},object:{kind:'permanent',types:['Creature'],...(op.filter.subtype?{qualifier:{subtypes:[op.filter.subtype]}}:{})}},selections=[{cost,cards:picks.map(card=>({card,zone:'battlefield',zoneVersion:card.zoneVersion}))}];(ctx.so.oracleCostPlans||=[]).push({sacrifices:picks,discards:[],exiles:[],returns:[],handExiles:[],life:0,choices:[],selections,reservedCards:[]});ctx.so.castOpts.oracleAggregateSacIdsV24=picks.map(card=>card.iid);return true;};return true;
  }
  if(op.kind==='dual-kicker-entry-v24'){
   if(!Number.isSafeInteger(op.counters)||op.counters<1||op.counters>3||op.keywords.some(key=>!['flying','first strike','trample'].includes(key)))throw Error('Invalid dual kicker entry grant');
   const rows=script.oracleDualKickerEntryV24||=([]);rows.push(op);
   if(rows.length===1){if(script.etbCounters)throw Error('Unmerged entry counters');script.etbCounters={kind:'+1/+1',n:(game,card)=>rows.reduce((n,row)=>n+(hasCost(card,row.cost)?row.counters:0),0)};const prior=script.asEnters;script.asEnters=async(g,card)=>{await prior?.(g,card);for(const row of rows)if(hasCost(card,row.cost)){if(row.keywords.length)g.addOracleBasePT(card,{keywords:row.keywords.slice()});if(row.ability)await h.runGenericEffects({g,src:card,you:card.ctrl,sourceZoneVersion:card.zoneVersion,targets:[card]},[{action:'grant-operation',target:0,duration:'object-v10',operation:grantedAbility(row.ability)}]);}};}
   return true;
  }
  if(op.kind==='dual-kicker-entry-mill-v24'){if(op.n!==3)throw Error('Invalid entry mill multiplier');const prior=script.asEnters;script.asEnters=async(g,card)=>{await prior?.(g,card);await g.mill(card.ctrl,indices(card).length*op.n,card);};return true;}
  if(op.kind==='spell-generic'&&op.targets.some(target=>target.upToXTargetV24||target.strictXTargetV24)){compileDynamicSpell(op,h);return true;}
  return false;
 },amount(node,ctx){
  const sacrifices=(ctx.so?.oracleV4AdditionalCost?.sacrifices||[]).filter(row=>ctx.so?.castOpts?.oracleAggregateSacIdsV24?.includes(row.iid));
  if(node.kind==='additional-power-v24')return Math.max(0,sacrifices.reduce((n,row)=>n+(Number(row.snapshot.power)||0),0));
  if(node.kind==='additional-count-v24')return node.payment==='repeat-mana'?ctx.so?.castOpts?.oracleRepeatedAdditionalV24||0:node.payment==='tap'?ctx.so?.castOpts?.oracleTapPaymentCountV24||0:sacrifices.length;
 },condition(game,source,node,player,evidence){
  if(node.kind==='dual-kicker-cost-v24')return hasCost(source,node.cost,evidence);
  if(node.kind==='dual-kicker-count-v24')return indices(source,evidence).length>=node.min;
 },async effect(ctx,effect,h){
  if(effect.action==='dual-kicker-bonus-v24'){if(hasCost(ctx.src,effect.cost,ctx.oracleSourceCapture,ctx.so?.castOpts))await h.runGenericEffects(ctx,effect.effects);return true;}
  if(effect.action==='dual-kicker-phase-v24'){
   const max=indices(ctx.src,ctx.oracleSourceCapture,ctx.so?.castOpts).length,filter=h.genericTargetSpec(effect.filter,[],0),from=ctx.g.bf().filter(card=>filter.filter(ctx.g,card,ctx.you,ctx.src)),versions=new Map(from.map(card=>[card,card.zoneVersion]));
   const picks=max&&from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:Math.min(max,from.length),prompt:ctx.src.name+': choose permanents to phase out',aiHint:{kind:'oracleChoice',goal:'buff',card:ctx.src}}):[];
   if(!Array.isArray(picks)||new Set(picks).size!==picks.length||picks.length>max||picks.some(card=>!from.includes(card)))throw Error('Invalid dual kicker phase choice');ctx.g.phaseOutMany(picks.filter(card=>card.zone==='battlefield'&&card.zoneVersion===versions.get(card)));return true;
  }
  if(effect.action==='tap-self-hit-v24'){const card=h.genericEffectSubjects(ctx,effect.target)[0];if(card?.zone==='battlefield'){ctx.g.tap(card);await ctx.g.damageAny(card,card.ctrl,Math.max(0,card.power));}return true;}
  if(effect.action==='search-target-name-v24'){
   const target=h.genericEffectSubjects(ctx,effect.target)[0];if(!target)return true;
   const library=ctx.g.searchableLibrary?ctx.g.searchableLibrary(ctx.you):ctx.g.canSearchLibrary?.(ctx.you)===false?[]:ctx.you.library,from=library.filter(card=>card.is('Creature')&&card.name===target.name),versions=new Map(from.map(card=>[card,card.zoneVersion]));
   const picks=from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:1,prompt:ctx.src.name+': search for a creature with the same name',aiHint:{kind:'recur',card:ctx.src}}):[];
   if(!Array.isArray(picks)||picks.length>1||picks.some(card=>!from.includes(card)))throw Error('Invalid same-name library search');for(const card of picks)if(card.zone==='library'&&card.zoneVersion===versions.get(card))await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:true});M.shuffle(ctx.you.library,ctx.g.rnd);return true;
  }
  return false;
 }});
})(globalThis.MTG);
