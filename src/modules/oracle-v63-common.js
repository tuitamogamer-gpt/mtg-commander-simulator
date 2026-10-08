'use strict';
((M)=>{
 const H=M.OracleV20.helpers;
 async function pick(ctx,p,from,prompt){
  if(!from.length)return null;
  const records=new Map(from.map(c=>[c,{zone:c.zone,version:c.zoneVersion}]));
  const answer=await p.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt,aiHint:{kind:'bestCard',src:ctx.src}});
  if(!Array.isArray(answer)||answer.length!==1||!records.has(answer[0]))throw Error('Invalid v63 choice');
  const card=answer[0],record=records.get(card);
  return card.zone===record.zone&&card.zoneVersion===record.version?card:null;
 }
 const sourceView=object=>{
  const source=object.srcCard||object.ctx?.src;
  if(!source)return null;
  const version=object.ctx?.sourceZoneVersion??object.ctx?.oracleSourceCapture?.zoneVersion;
  if(source.zone==='battlefield'&&(version===undefined||source.zoneVersion===version))return source;
  return source.battlefieldLKI?.get(version)||(object.ctx?.data?.card===source?object.ctx.data.snap:null)||source;
 };
 M.OracleV20.handlers.push({
  compile(op,script){
   if(op.kind!=='common-cost-v63')return false;
   if(op.mode==='adventure-permanent')(script.costMods||(script.costMods=[])).push((g,s,ctx)=>s.ctrl===ctx.player&&!ctx.castOpts.adventure&&!ctx.castOpts.omen&&!ctx.castOpts.faceDownCast&&ctx.card.def.adventure&&['Artifact','Creature','Enchantment','Planeswalker','Battle'].some(type=>g.castDefinition(ctx.card,ctx.castOpts).types.includes(type))?-1:0);
   else if(op.mode==='grave-adventure-union')script.selfCostAdjust=(g,c,p,opts={})=>opts.adventure||opts.omen||opts.faceDownCast?0:-p.graveyard.filter(card=>card.is('Instant')||card.is('Sorcery')||card.def.adventure).length;
   else throw Error('Unknown v63 cost '+op.mode);
   return true;
  },
  condition(g,s,c,p){
   if(c.kind==='not-prepared-v63')return s.zone==='battlefield'&&!s.meta.prepared;
   if(c.kind==='defensive-creature-count-v63')return g.creatures(p).filter(c=>c.toughness>c.power).length>=c.min;
  },
  target(g,c,p,s,predicate){
   if(predicate.kind!=='ability-noncreature-source-v63')return;
   const view=sourceView(c);
   return !!view&&!(view.is?view.is('Creature'):view.types?.includes('Creature'));
  },
  amount(node,ctx){
   if(node.kind!=='combat-damaged-opponents-v63')return;
   const players=new Set(ctx.g.players.flatMap(p=>p.turnState.combatDamageHits||[]).filter(hit=>hit.n>0&&hit.player!==ctx.you).map(hit=>hit.player));
   return ctx.g.alivePlayers().filter(p=>p!==ctx.you&&players.has(p)).length;
  },
  async effect(ctx,e){
   if(e.action!=='common-effects-v63')return false;
   const g=ctx.g,p=ctx.you;
   if(e.mode==='choose-grave-haste'){
    const card=await pick(ctx,p,g.players.flatMap(p=>p.graveyard).filter(c=>c.is('Creature')),'Choose a creature card from a graveyard');
    if(card){await g.move(card,'battlefield',{ctrl:p});if(card.zone==='battlefield'&&card.ctrl===p)M.E.pumpUntilEOT(g,card,0,0,['haste']);}
   }else if(e.mode==='remove-counters-draw'){
    for(const card of H.genericEffectSubjects(ctx,e.target)){
     const n=card.counters['+1/+1']||0;
     g.removeCounters(card,'+1/+1',n);
     await g.draw(p,n,ctx.src);
    }
   }else if(e.mode==='opponent-choice-control'){
    const chosen=[];
    for(const opponent of g.apnapFrom(g.turnPlayer||p).filter(q=>q!==p)){
     const card=await pick(ctx,opponent,g.creatures(opponent),'Choose a creature to give control of');
     if(card)chosen.push({card,version:card.zoneVersion,controller:opponent});
    }
    for(const row of chosen)if(row.card.zone==='battlefield'&&row.card.zoneVersion===row.version&&row.card.ctrl===row.controller)await H.runGenericEffect({...ctx,targets:[row.card],_oracleTargetControllers:undefined},{action:'give-control-v9',target:0,who:'you'});
   }else if(e.mode==='greatest-power-life'){
    for(const player of H.genericEffectSubjects(ctx,e.target)){
     const creatures=g.creatures(player),max=Math.max(...creatures.map(c=>c.power));
     const card=await pick(ctx,player,creatures.filter(c=>c.power===max&&g.canSacrifice(c)),'Sacrifice a creature with the greatest power');
     if(card&&card.zone==='battlefield'&&card.ctrl===player&&g.canSacrifice(card)){const power=Math.max(0,card.power);await g.sacrifice(player,card);await g.gainLife(p,power,ctx.src);}
    }
   }else if(e.mode==='opponent-library-exile-life'){
    for(const player of H.genericEffectSubjects(ctx,e.target)){
     const card=await pick(ctx,p,player.library.slice(),'Choose a card from the opponent’s library');
     if(card){const mv=card.mv;await g.move(card,'exile');await g.gainLife(p,Math.max(0,mv),ctx.src);}M.shuffle(player.library,g.rnd);
    }
   }else throw Error('Unknown v63 effect '+e.mode);
   return true;
  },
 });
})(globalThis.MTG);
