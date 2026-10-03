'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers;
 const actions=new Set(['pump-signed-v26','conditional-v26','optional-effects-v26','recipient-life-prohibition-v26','tap-mana-v26','untargeted-counters-v26','opponent-control-v26','pump-pair-v26','controller-damage-batch-v26','attached-aura-damage-v26','enchantments-damage-v26','damage-rider-v26','optional-grave-exile-damage-v26']);
 const key=filter=>JSON.stringify(filter),definition=so=>so?.oracleDefinition||so?.card?.def;
 const amount=(node,ctx)=>{
  if(node.kind==='paid-object-values-v26')return Math.max(0,(ctx.so?.oraclePaymentValuesV26||[]).filter(row=>row.costId===node.costId).reduce((n,row)=>n+(Number(row[node.stat])||0),0));
  if(['cast-cohort-v26','negative-cast-cohort-v26'].includes(node.kind)){const n=ctx.so?.isCopy?0:ctx.so?.oracleCastCohortsV26?.[key(node.filter)]||0;return n*(node.kind==='negative-cast-cohort-v26'?-1:node.multiplier??1);}
 };
 function condition(node,ctx){
  if(node.kind==='paid-object-quality-v26')return (ctx.so?.oraclePaymentValuesV26||[]).some(row=>row.costId===node.costId&&(!node.legendary||row.legendary));
  if(node.kind==='value-comparison-v10'&&/-v26/.test(node.value?.kind||'')){const n=amount(node.value,ctx);return (node.min===undefined||n>=node.min)&&(node.max===undefined||n<=node.max);}
  return H.genericCondition(ctx.g,ctx.src,node,ctx.you,{castX:ctx.so?.x,kicked:ctx.so?.kicked,manaSpent:ctx.so?.isCopy?0:ctx.so?.manaSpent,paymentColorCounts:ctx.so?.isCopy?{}:ctx.so?.paymentColorCounts});
 }
 const commit=M.commitOracleAdditionalCosts;M.commitOracleAdditionalCosts=async function(ctx){
  const ids=definition(ctx.so)?.oraclePaymentCostsV26,rows=[];
  if(ids)for(const plan of ctx.so.oracleCostPlans||[])for(const selection of plan.selections||[])if(ids.includes(selection.cost.id))for(const {card} of selection.cards){const s=ctx.g.snapshot(card,false);rows.push({costId:selection.cost.id,iid:card.iid,power:s.power,mv:s.mv,legendary:s.super.includes('Legendary')});}
  const result=await commit(ctx);if(result&&ids)ctx.so.oraclePaymentValuesV26=(ctx.so.oraclePaymentValuesV26||[]).concat(rows);return result;
 };
 const emit=G.emit;G.emit=async function(event,data){
  if(event==='cast'&&data.so&&data.card?.def?.oracleCastCohortFiltersV26){const so=data.so,filters=definition(so).oracleCastCohortFiltersV26;so.oracleCastCohortsV26=Object.fromEntries(filters.map(filter=>[key(filter),this.bf().filter(card=>H.genericTargetSpec(filter,[],0).filter(this,card,so.ctrl,data.card)).length]));}
  return emit.call(this,event,data);
 };
 const uncounterable=M.isUncounterable;M.isUncounterable=function(g,so){return definition(so)?.oracleConditionalRulesV26?.some(op=>op.uncounterable&&condition(op.condition,{g,src:so.card,you:so.ctrl,so}))||uncounterable(g,so);};
 const flash=M.oracleFlashGranted;M.oracleFlashGranted=function(g,p,c,opts={}){return (!opts.faceDownCast&&!opts.adventure&&g.castDefinition(c,opts).oracleXFlashMaxV26!==undefined&&Number(opts.xVal||0)<=g.castDefinition(c,opts).oracleXFlashMaxV26)||flash(g,p,c,opts);};
 async function chooseOne(ctx,from,prompt,optional=false,hint='bestCard'){
  if(!from.length)return null;const versions=new Map(from.map(card=>[card,card.zoneVersion])),zones=new Map(from.map(card=>[card,card.zone]));
  const picks=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:optional?0:1,max:1,prompt:ctx.src.name+': '+prompt,aiHint:{kind:hint,src:ctx.src}});
  if(!Array.isArray(picks)||picks.length>(from.length?1:0)||!optional&&picks.length!==1||picks.some(c=>!from.includes(c)))throw Error('Invalid v26 resolution choice');const c=picks[0];return c&&c.zone===zones.get(c)&&c.zoneVersion===versions.get(c)?c:null;
 }
 M.OracleV26Spells={amount,condition};
 M.OracleV20.handlers.push({spellsV26:true,amount,compile(op,script,entry,h){
  if(op.kind==='spell-payment-values-v26'){
   script.oraclePaymentCostsV26=op.costs.slice();const prior=script.prepareTargets;
   // The native casting path remembers fields introduced during preparation
   // as copiable choices, then captures their paid values after committing costs.
   script.prepareTargets=async ctx=>{if(await prior?.(ctx)===false)return false;ctx.so.oraclePaymentValuesV26=[];return true;};return true;
  }
  if(op.kind==='spell-casting-cohorts-v26'){script.oracleCastCohortFiltersV26=op.filters.slice();return true;}
  if(op.kind==='spell-conditional-rules-v26'){(script.oracleConditionalRulesV26||=[]).push(op);return true;}
  if(op.kind==='spell-damage-override-v26')return true;
  if(op.kind==='spell-x-flash-v26'){script.oracleXFlashMaxV26=op.max;const prior=script.xValues;script.xValues=(g,c,p,opts)=>{const max=g.maxAffordableX(p,g.spellCost(p,c,opts),c,{castOpts:opts}),all=prior?prior(g,c,p,opts):Array.from({length:max+1},(_,i)=>i);return all.filter(x=>x<=op.max||g.canCastTiming(p,c,{...opts,xVal:x}));};return true;}
  return false;
 },async effect(ctx,e,h){
  if(!actions.has(e.action))return false;
  if(e.action==='pump-signed-v26'){for(const c of h.genericEffectSubjects(ctx,e.target))if(c.zone==='battlefield')M.E.pumpUntilEOT(ctx.g,c,h.genericAmount(e.power,ctx,true),h.genericAmount(e.toughness,ctx,true),[]);return true;}
  if(e.action==='conditional-v26'){await h.runGenericEffects(ctx,condition(e.condition,ctx)?e.effects:e.elseEffects||[]);return true;}
  if(e.action==='optional-effects-v26'){const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Apply effect'},{key:'no',label:'Decline'}],prompt:ctx.src.name+': apply the optional effect?',aiHint:{kind:'optionalEffect',card:ctx.src}});if(!['yes','no'].includes(chosen))throw Error('Invalid optional effect choice');if(chosen==='yes')await h.runGenericEffects(ctx,e.effects);return true;}
  if(e.action==='recipient-life-prohibition-v26'){const card=h.genericEffectSubjects(ctx,e.target)[0],p=card instanceof M.Player?card:card?.ctrl;if(p)ctx.g.untilEffects.push({kind:'lifeGainProhibitionV9',players:[p],expires:'eot'});return true;}
  if(e.action==='tap-mana-v26'){const c=h.genericEffectSubjects(ctx,e.target)[0];if(c&&ctx.g.tap(c))await h.runGenericEffect(ctx,{action:'add-mana',produce:{C:1},multiplier:Math.max(0,c[e.stat])});return true;}
  if(e.action==='untargeted-counters-v26'){const n=h.genericAmount(e.n,ctx),spec=h.genericTargetSpec(e.filter,[],0),from=ctx.g.bf().filter(c=>spec.filter(ctx.g,c,ctx.you,ctx.src)&&(!e.filter.commanderV26||c.commander)),c=await chooseOne(ctx,from,'choose a commander creature for counters');if(c&&c.ctrl===ctx.you&&c.is('Creature')&&c.commander)ctx.g.addCounters(c,e.counter,n,false,ctx.you);return true;}
  if(e.action==='opponent-control-v26'){const c=h.genericEffectSubjects(ctx,e.target)[0],version=c?.zoneVersion;if(c?.zone==='battlefield'){const p=await M.E.chooseOpponent(ctx.g,ctx.you,{prompt:'choose an opponent to gain control'});if(p&&!p.lost&&p!==ctx.you&&c.zone==='battlefield'&&c.zoneVersion===version)M.OracleV8Control.gain(ctx.g,c,p);}return true;}
  if(e.action==='pump-pair-v26'){const c=h.genericEffectSubjects(ctx,e.target)[0],other=c&&M.OracleV8Soulbond.partner(ctx.g,c);if(other)M.E.pumpUntilEOT(ctx.g,other,e.power,e.toughness,[]);return true;}
  if(e.action==='controller-damage-batch-v26'){const c=h.genericEffectSubjects(ctx,e.target)[0];if(!c)return true;const p=c instanceof M.Player?c:c.ctrl,src=h.oracleDamageSource(ctx),hits=[{src,target:c,n:h.genericAmount(e.n,ctx)},...ctx.g.creatures(p).filter(other=>!e.other||other!==c).map(target=>({src,target,n:h.genericAmount(e.groupN,ctx)}))];await ctx.g.damageBatch(hits,{deferSBA:true});return true;}
  if(e.action==='attached-aura-damage-v26'){const bf=ctx.g.bf(),src=h.oracleDamageSource(ctx),hits=bf.filter(c=>c.is('Creature')).map(target=>({src,target,n:e.n*bf.filter(c=>c.hasSub('Aura')&&c.attachedTo===target.iid).length}));await ctx.g.damageBatch(hits,{deferSBA:true});return true;}
  if(e.action==='enchantments-damage-v26'){const bf=ctx.g.bf();await ctx.g.damageBatch(bf.filter(c=>c.is('Enchantment')).map(src=>({src,target:src.ctrl,n:e.n})),{deferSBA:true});await ctx.g.damageBatch(ctx.g.bf().filter(c=>c.hasSub('Aura')).map(src=>({src,target:ctx.g.byIid(src.attachedTo),n:e.n})).filter(hit=>hit.target?.zone==='battlefield'&&hit.target.is('Creature')),{deferSBA:true});return true;}
  if(e.action==='damage-rider-v26'){const c=h.genericEffectSubjects(ctx,e.target)[0],results=[],red=new Map(ctx.g.bf().map(card=>[card,card.colors.includes('R')]));if(c)await ctx.g.damageAny(h.oracleDamageSource(ctx),c,e.n,{deferSBA:true,damageResults:results});if(results.some(r=>r.amount>0&&r.target instanceof M.CardInst&&!(red.get(r.target)??r.target.colors.includes('R')))){const from=ctx.g.lands(ctx.you).filter(c=>ctx.g.canSacrifice(c)),land=await chooseOne(ctx,from,'choose a land to sacrifice',false,'sac');if(land&&land.ctrl===ctx.you&&ctx.g.canSacrifice(land))await ctx.g.sacrifice(ctx.you,land);}return true;}
  if(e.action==='optional-grave-exile-damage-v26'){const p=h.genericEffectSubjects(ctx,{kind:'target-controller',index:e.target})[0],c=await chooseOne(ctx,ctx.you.graveyard.slice(),'exile a card from your graveyard?',true,'exileTarget');if(c){await ctx.g.move(c,'exile');if(p)await ctx.g.damageAny(h.oracleDamageSource(ctx),p,e.n,{deferSBA:true});}return true;}
  return false;
 }});
})(globalThis.MTG||={});
