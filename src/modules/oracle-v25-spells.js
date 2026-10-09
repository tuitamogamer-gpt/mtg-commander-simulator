'use strict';
((M)=>{
 const actions=new Set(['linked-removal-v25','choose-sacrifice-linked-v25','exchange-control-v25','bounce-with-auras-v25','damage-linked-v25','pay-energy-effect-v25']);
 const permanentTypes=new Set(['Artifact','Battle','Creature','Enchantment','Land','Planeswalker']);
 const departures=new WeakMap();
 const leave=M.Game.prototype.fireLeaveAndDie;
 M.Game.prototype.fireLeaveAndDie=function(card,snap,died,destination=snap.departureDestinationV20||card.zone){let rows=departures.get(card);if(!rows){rows=new Map();departures.set(card,rows);}rows.set(snap.zoneVersion,destination);return leave.call(this,card,snap,died,destination);};
 const state=(game,card,id)=>!id||card.zoneVersion===id.zoneVersion?game.snapshot(card,false):card.battlefieldLKI?.get(id.zoneVersion);
 const ownedRule=rule=>['shared-card-type','different-controllers-v25'].includes(rule.test);
 function fits(rule,states){if(states.some(s=>!s))return false;if(states.length<2)return true;if(rule.test==='different-controllers-v25')return new Set(states.map(s=>s.ctrl)).size===states.length;return states[0].types.some(type=>(!rule.permanentOnly||permanentTypes.has(type))&&states.every(s=>s.types.includes(type)));}
 function installGroups(){
  if(M.OracleV22Spells.oracleGroupsV25)return;M.OracleV22Spells.oracleGroupsV25=true;
  const prior={...M.OracleV22Spells};
  M.OracleV22Spells.groupFilter=(rule,g,cards)=>ownedRule(rule)?fits(rule,cards.map(c=>g.snapshot(c,false))):prior.groupFilter(rule,g,cards);
  M.OracleV22Spells.groupRevalidate=(rule,g,original,legal,ids)=>ownedRule(rule)?fits(rule,original.map((c,i)=>state(g,c,ids?.[i])))?legal:[]:prior.groupRevalidate(rule,g,original,legal,ids);
  M.OracleV22Spells.groupRetarget=(rule,g,picks,ids,flags)=>ownedRule(rule)?!flags.some(Boolean)||fits(rule,picks.map((c,i)=>state(g,c,ids?.[i]))):prior.groupRetarget(rule,g,picks,ids,flags);
  M.OracleV22Spells.pickGroup=(rule,g,ranked,min,max)=>{if(!ownedRule(rule))return prior.pickGroup(rule,g,ranked,min,max);for(let i=0;i<ranked.length;i++)for(let j=i+1;j<ranked.length;j++){const pair=[ranked[i],ranked[j]];if(fits(rule,pair.map(c=>g.snapshot(c,false))))return pair;}return min?[]:ranked.slice(0,Math.min(1,max));};
 }
 function materialize(node,linked){
  if(Array.isArray(node))return node.map(n=>materialize(n,linked));
  if(node&&typeof node==='object'){
   if(node.kind==='linked-stat-v25')return Number(linked.snap[node.stat])||0;
   if(node.kind==='linked-excess-v25')return linked.excess||0;
   if(node.kind==='linked-negative-v25')return -materialize(node.value,linked);
   return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,materialize(value,linked)]));
  }return node;
 }
 async function follow(ctx,rows,linked,h){
  for(const row of rows){
   const s=linked.snap,c=linked.card;
   if(row.success&&!linked[row.success]||row.type&&!s.types.includes(row.type[0].toUpperCase()+row.type.slice(1))||row.notType&&s.types.includes(row.notType[0].toUpperCase()+row.notType.slice(1))||row.color&&!s.colors.includes(row.color)||row.subtype&&!s.subtypes.includes(row.subtype)&&!s.changeling||row.controllerOrToken&&s.ctrl!==ctx.you&&!s.isToken||row.statMax&&s[row.statMax.stat]>row.statMax.max||row.excess&&!(linked.excess>0)||row.kicked!==undefined&&!!ctx.so?.kicked!==row.kicked)continue;
   if(row.enteredController&&(c.zone!=='battlefield'||c.zoneVersion!==linked.enteredVersion||(row.enteredController==='you')!==(c.ctrl===ctx.you)))continue;
   if(row.postSubtypes&&(linked.enteredVersion===undefined||c.zone!=='battlefield'||c.zoneVersion!==linked.enteredVersion||!row.postSubtypes.some(type=>c.hasSub(type))))continue;
   const you=row.actor==='controller'?s.ctrl:row.actor==='owner'?s.owner:ctx.you;
   if(!you||you.lost)continue;
   let child={...ctx,you};
   if(linked.enteredVersion!==undefined)child={...child,targets:ctx.targets.map((slot,i)=>i===(ctx.oracleTargetOffset||0)+(linked.target||0)?c:slot),targetIdentities:undefined};
   await h.runGenericEffects(child,materialize(row.effects,linked));
  }
 }
 async function remove(ctx,card,effect,h){
  const linked={card,snap:ctx.g.snapshot(card,false),target:effect.target},version=card.zoneVersion,old=card.zone;
  if(effect.operation==='destroy'){const destroyed=await ctx.g.destroy(card,{source:ctx.src,noRegen:!!effect.noRegen});linked.left=destroyed&&(card.zone!=='battlefield'||card.zoneVersion!==version);}
  else if(effect.operation==='sacrifice')linked.sacrificed=await ctx.g.sacrifice(linked.snap.ctrl,card);
  else if(effect.operation==='exile')await ctx.g.exileCard(card);
  else if(effect.operation==='bounce')await ctx.g.move(card,'hand');
  else if(effect.operation==='reanimate'){
   if(old==='graveyard')await ctx.g.putPermanentOntoBattlefield(card,effect.controller==='you'?ctx.you:card.owner,{oracleCreatureEntryCountersV25:effect.entryCreatureCounters});
  }else if(effect.operation==='blink'){
   await ctx.g.exileCard(card);linked.exiled=card.zoneVersion===version+1&&(card.zone==='exile'||departures.get(card)?.get(version)==='exile');
   if(linked.exiled&&card.zone==='exile')await ctx.g.putPermanentOntoBattlefield(card,card.owner);
  }else throw Error('Unknown linked removal operation');
  linked.died=old==='battlefield'&&card.zoneVersion===version+1&&(card.zone==='graveyard'||departures.get(card)?.get(version)==='graveyard');
  linked.returned=card.zone==='hand'&&card.zoneVersion===version+1;
  if(effect.operation==='exile')linked.exiled=card.zone==='exile'&&card.zoneVersion===version+1;
  if(['reanimate','blink'].includes(effect.operation)&&card.zone==='battlefield'&&card.zoneVersion===version+(effect.operation==='blink'?2:1))linked.enteredVersion=card.zoneVersion;
  await follow(ctx,effect.follow||[],linked,h);return linked;
 }
 M.OracleV25Spells={install:installGroups};
 installGroups();
 M.OracleV20.handlers.push({name:'oracle-v25-spells',async effect(ctx,effect,h){
  if(!actions.has(effect.action))return false;
  if(effect.action==='linked-removal-v25'){const card=h.genericEffectSubjects(ctx,effect.target)[0];if(card)await remove(ctx,card,effect,h);return true;}
  if(effect.action==='choose-sacrifice-linked-v25'){
   for(const player of h.genericEffectSubjects(ctx,effect.who)){
    const spec=h.genericTargetSpec(effect.filter,[],0),from=ctx.g.creatures(player).filter(c=>ctx.g.canSacrifice(c)&&spec.filter(ctx.g,c,ctx.you,ctx.src)),versions=new Map(from.map(c=>[c,c.zoneVersion]));if(!from.length)continue;
    const picks=await player.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:ctx.src.name+': choose a creature to sacrifice',aiHint:{kind:'sac',src:ctx.src}});
    if(!Array.isArray(picks)||picks.length!==1||!from.includes(picks[0]))throw Error('Invalid linked sacrifice choice');
    if(picks[0].zone==='battlefield'&&picks[0].zoneVersion===versions.get(picks[0])&&picks[0].ctrl===player&&ctx.g.canSacrifice(picks[0]))await remove(ctx,picks[0],{operation:'sacrifice',follow:effect.follow},h);
   }return true;
  }
  if(effect.action==='exchange-control-v25'){
   const cards=h.genericEffectSubjects(ctx,effect.target),neither=cards.length===2&&cards.every(c=>c.ctrl!==ctx.you);
   if(cards.length===2&&cards.every(c=>c.zone==='battlefield'&&!c.phasedOut&&!c.ctrl.lost)&&cards[0].ctrl!==cards[1].ctrl){M.OracleV8Control.exchange(ctx.g,cards[0],cards[1]);ctx.g.recalc();}
   if(effect.drawIfNeither&&neither)await ctx.g.draw(ctx.you,effect.drawIfNeither,ctx.src);return true;
  }
  if(effect.action==='bounce-with-auras-v25'){
   const card=h.genericEffectSubjects(ctx,effect.target)[0];if(card){const cards=[card,...ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.hasSub('Aura')&&c.attachedTo===card.iid)];await ctx.g.bounceMany(cards);}return true;
  }
  if(effect.action==='damage-linked-v25'){
   const card=h.genericEffectSubjects(ctx,effect.target)[0];if(!card)return true;
   const snap=ctx.g.snapshot(card,false),results=[];await ctx.g.damageAny(h.oracleDamageSource?.(ctx)||ctx.src,card,Math.max(0,h.genericAmount(effect.n,ctx)),{deferSBA:true,damageResults:results});
   await follow(ctx,effect.follow,{card,snap,excess:results.filter(r=>r.target===card).reduce((n,r)=>n+r.excess,0)},h);return true;
  }
  if(effect.action==='pay-energy-effect-v25'){
   await M.OracleV8Energy.gain(ctx.g,ctx.you,h.genericAmount(effect.gain,ctx),ctx.src);const max=M.OracleV8Energy.count(ctx.you),paid=max?await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:0,max,prompt:ctx.src.name+': how much energy will you pay?',aiHint:{kind:'chooseX',card:ctx.src}}):0;
   if(!Number.isSafeInteger(paid)||paid<0||paid>max||!M.OracleV8Energy.spend(ctx.g,ctx.you,paid,ctx.src))throw Error('Invalid scoped energy payment');
   if(effect.effect==='destroy-group'){await ctx.g.destroyMany(ctx.g.bf().filter(c=>c.mv<=paid&&['Artifact','Creature','Enchantment'].some(type=>c.is(type))));return true;}
   const card=h.genericEffectSubjects(ctx,effect.target)[0];if(!card)return true;
   if(effect.effect==='damage')await ctx.g.damageAny(h.oracleDamageSource?.(ctx)||ctx.src,card,paid,{deferSBA:true});
   else if(effect.effect==='counter'){const cost=M.parseCost('{'+paid+'}');let didPay=paid===0;if(!didPay&&ctx.g.canPayMana(card.ctrl,cost)){const choice=await card.ctrl.controller.decide(ctx.g,{type:'chooseOption',prompt:'Pay {'+paid+'} to prevent '+ctx.src.name+'?',options:[{key:'yes',label:'Pay'},{key:'no',label:'Decline'}],aiHint:{kind:'payMana',cost:paid,card:card.card}});if(choice==='yes')didPay=await ctx.g.payMana(card.ctrl,cost);else if(choice!=='no')throw Error('Invalid counter payment choice');}if(!didPay)await ctx.g.counterStackObject(card);}
   else throw Error('Unknown scoped energy effect');return true;
  }
  return false;
 }});
})(globalThis.MTG||={});
