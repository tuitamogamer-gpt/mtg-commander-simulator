(() => {
 const M=globalThis.MTG,V=M.OracleV20;
 const sacrificePlans=new WeakMap();
 const current=(g,p,s,row)=>s.zone==='battlefield'&&s.ctrl===p&&s.zoneVersion===row.sourceVersion&&row.cards.every(record=>record.card.zone==='battlefield'&&record.card.ctrl===p&&record.card.zoneVersion===record.version&&g.bf().includes(record.card)&&g.canSacrifice(record.card));
 function sacrificeAssignment(g,p,s,ability,filters,fixed=[]){
  const eligible=filters.map(filter=>g.bf().filter(c=>c.ctrl===p&&g.canSacrifice(c)&&filter(g,c,p,s)));
  const mana=ability.cost.mana&&g.abilityManaCost(p,s,ability.cost.mana,{ability});
  const visit=(index,chosen)=>{if(index===filters.length)return (!mana||g.canPayMana(p,mana,{card:s,isAbility:true,ability},{excludeCards:ability.cost.tap?[s]:[],protectedSacrifices:chosen}))?chosen:null;for(const card of eligible[index])if(!chosen.includes(card)){const result=visit(index+1,chosen.concat(card));if(result)return result;}return null;};
  return fixed.every((card,index)=>eligible[index]?.includes(card))&&new Set(fixed).size===fixed.length?visit(fixed.length,fixed):null;
 }
 const handler={layoutsV23:true,amount(value,ctx){if(value.kind==='inspected-stat-v23')return Math.max(0,Number(ctx.inspectedStatsV23?.[value.stat])||0);},compile(op,script,entry,h){
  if(op.kind==='mechanic-suspend'&&op.optionalV23){script.suspend={cost:op.cost,n:op.n};script.oracleSuspendOptionalV20=true;return true;}
  if(op.kind==='generic-ability'&&op.cost?.oracleSacrificeGroupsV23){
   const ability=h.compileGenericAbility(op),filters=op.cost.oracleSacrificeGroupsV23.map(filter=>h.genericTargetSpec(filter,[],0).filter),priorCond=ability.cond,prepare=ability.prepareTargets;
   ability.oracleSacrificeGroupsV23=true;ability.cost.sacN=filters.length;ability.cost.sac=(g,c,s)=>{const plan=sacrificePlans.get(s);return plan?current(g,s.ctrl,s,plan)&&plan.cards.some(row=>row.card===c):filters.some(filter=>filter(g,c,s.ctrl,s));};
   ability.cond=(g,s,p)=>(!priorCond||priorCond(g,s,p))&&!!sacrificeAssignment(g,p,s,ability,filters);
   ability.prepareTargets=async ctx=>{if(prepare&&await prepare(ctx)===false)return false;const {g,you:p,src:s}=ctx,sourceVersion=s.zoneVersion,picked=[],pickedRecords=[];for(let index=0;index<filters.length;index++){const pool=g.bf().filter(c=>c.ctrl===p&&!picked.includes(c)&&g.canSacrifice(c)&&filters[index](g,c,p,s)&&sacrificeAssignment(g,p,s,ability,filters,picked.concat(c))),versions=new Map(pool.map(c=>[c,c.zoneVersion]));if(!pool.length)return false;const answer=await p.controller.decide(g,{type:'chooseCards',from:pool,min:1,max:1,prompt:s.name+': choose sacrifice '+(index+1)+' of '+filters.length,aiHint:{kind:'sacCost',src:s}});if(!Array.isArray(answer)||answer.length!==1||!pool.includes(answer[0])||answer[0].zone!=='battlefield'||answer[0].zoneVersion!==versions.get(answer[0])||s.zoneVersion!==sourceVersion||s.ctrl!==p)return false;picked.push(answer[0]);pickedRecords.push({card:answer[0],version:versions.get(answer[0])});}const row={sourceVersion,cards:pickedRecords};if(!current(g,p,s,row)||!sacrificeAssignment(g,p,s,ability,filters,picked))return false;sacrificePlans.set(s,row);return true;};
   h.abilities.push(ability);return true;
  }
  return false;
 },async effect(ctx,e){
  if(e.action==='library-followup-v23'){
   const H=V.helpers,p=ctx.you;
   do{
    const filter=e.until&&H.genericTargetSpec({...e.until,zone:'graveyard',controller:'any'},[],0,ctx.data).filter;
    const n=e.until?p.library.length:Math.max(0,Math.floor(H.genericAmount(e.n,ctx))),top=[];let hit=null;
    for(const card of (n?p.library.slice(-n).reverse():[])){const row={card,version:card.zoneVersion,mv:card.mv,power:card.power,toughness:card.toughness};top.push(row);if(filter?.(ctx.g,card,p,ctx.src)){hit=row;break;}}
    const present=row=>row?.card.zone==='library'&&row.card.zoneVersion===row.version&&p.library.includes(row.card);
    if(e.visibility==='reveal')await ctx.g.revealToHuman({cards:top.map(row=>row.card),ctrl:p,kind:'reveal'});else if(!p.isAI&&top.length)await p.controller.decide(ctx.g,{type:'cardReveal',player:p,cards:top.map(row=>row.card),kind:'look',private:true});
    let selected=hit;if(!e.until){const eligible=top.filter(present),min=e.optionalSelection?0:eligible.length?1:0;if(eligible.length){const answer=await p.controller.decide(ctx.g,{type:'chooseCards',from:eligible.map(row=>row.card),min,max:1,prompt:'Choose inspected card for its follow-up',aiHint:{kind:'bestCard'}});if(!Array.isArray(answer)||answer.length<min||answer.length>1||new Set(answer).size!==answer.length||answer.some(card=>!eligible.some(row=>row.card===card&&present(row))))throw Error('Invalid inspected follow-up selection');selected=answer.length?eligible.find(row=>row.card===answer[0]):null;}}
    if(selected&&present(selected)){
     if(e.selectedReveal)await ctx.g.revealToHuman({cards:[selected.card],ctrl:p,kind:'reveal'});
     if(!e.afterFollowup&&e.selectedDestination!=='stay'&&present(selected))await ctx.g.move(selected.card,e.selectedDestination);
     await H.runGenericEffects({...ctx,inspectedStatsV23:{mv:selected.mv,power:selected.power,toughness:selected.toughness}},e.followup);
     if(e.afterFollowup&&e.selectedDestination!=='stay'&&present(selected))await ctx.g.move(selected.card,e.selectedDestination);
    }
    const rest=top.filter(present);if(e.rest==='graveyard')await ctx.g.withGraveyardEntryBatch(async()=>{for(const row of rest)if(present(row))await ctx.g.move(row.card,'graveyard');});else if(e.rest!=='stay'){let arranged=rest.map(row=>row.card);if(e.rest==='bottom-random')M.shuffle(arranged,ctx.g.rnd);else if(arranged.length>1){const answer=await p.controller.decide(ctx.g,{type:'chooseCards',from:arranged,min:arranged.length,max:arranged.length,prompt:'Order inspected follow-up cards for the bottom',aiHint:{kind:'orderBottom'}});if(!Array.isArray(answer)||answer.length!==arranged.length||new Set(answer).size!==answer.length||answer.some(card=>!arranged.includes(card)))throw Error('Invalid inspected follow-up order');arranged=answer;}arranged=arranged.filter(card=>rest.some(row=>row.card===card&&present(row)));for(const card of arranged)p.library.splice(p.library.indexOf(card),1);p.library.unshift(...arranged.reverse());}
    if(!e.repeat||!selected||!p.library.length||ctx.g.gameOver)break;const again=await p.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Repeat the process'},{key:'no',label:'Stop'}],prompt:'Repeat the inspected card process?',aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(again))throw Error('Invalid inspected follow-up repeat choice');if(again!=='yes')break;
   }while(true);return true;
  }
  if(e.action==='library-dual-select-v23'){
   const H=V.helpers,p=ctx.you,n=Math.max(0,Math.floor(H.genericAmount(e.n,ctx))),top=(n?p.library.slice(-n).reverse():[]).map(card=>({card,version:card.zoneVersion})),present=row=>row.card.zone==='library'&&row.card.zoneVersion===row.version&&p.library.includes(row.card),chosen=[];
   if(e.visibility==='reveal')await ctx.g.revealToHuman({cards:top.map(row=>row.card),ctrl:p,kind:'reveal'});else if(!p.isAI&&top.length)await p.controller.decide(ctx.g,{type:'cardReveal',player:p,cards:top.map(row=>row.card),kind:'look',private:true});
   const filters=e.filters.map(filter=>H.genericTargetSpec({...filter,zone:'graveyard',controller:'any'},[],0,ctx.data).filter);
   for(let index=0;index<filters.length;index++){
    const eligible=top.filter(row=>present(row)&&!chosen.includes(row)&&filters[index](ctx.g,row.card,p,ctx.src)),future=top.some(row=>present(row)&&!chosen.includes(row)&&filters.slice(index+1).some(filter=>filter(ctx.g,row.card,p,ctx.src))),min=e.required&&!chosen.length&&!future&&eligible.length?1:0;
    if(!eligible.length)continue;const answer=await p.controller.decide(ctx.g,{type:'chooseCards',from:eligible.map(row=>row.card),min,max:1,prompt:'Choose inspected '+(index===0?'creature':'land')+' card',aiHint:{kind:'bestCard'}});
    if(!Array.isArray(answer)||answer.length<min||answer.length>1||new Set(answer).size!==answer.length||answer.some(card=>!eligible.some(row=>row.card===card&&present(row))))throw Error('Invalid dual library selection');
    if(answer.length)chosen.push(eligible.find(row=>row.card===answer[0]));
   }
   let destination='hand';if(chosen.length&&e.destinationChoiceMinX!==undefined&&H.genericAmount('X',ctx)>=e.destinationChoiceMinX){const answer=await p.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'battlefield',label:'Put the chosen cards onto the battlefield'},{key:'hand',label:'Put the chosen cards into your hand'}],prompt:'Choose the destination of all chosen cards',aiHint:{kind:'mode'}});if(!['battlefield','hand'].includes(answer))throw Error('Invalid dual library destination');destination=answer;}
   if(destination==='battlefield')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const row of chosen)if(present(row))await ctx.g.putPermanentOntoBattlefield(row.card,p);});else for(const row of chosen)if(present(row))await ctx.g.move(row.card,'hand');
   const rest=top.filter(present);if(e.rest==='graveyard')await ctx.g.withGraveyardEntryBatch(async()=>{for(const row of rest)if(present(row))await ctx.g.move(row.card,'graveyard');});else{let arranged=rest.map(row=>row.card);if(e.rest==='bottom-random')M.shuffle(arranged,ctx.g.rnd);else if(arranged.length>1){const result=await p.controller.decide(ctx.g,{type:'chooseCards',from:arranged,min:arranged.length,max:arranged.length,prompt:'Order inspected cards for the bottom',aiHint:{kind:'orderBottom'}});if(!Array.isArray(result)||result.length!==arranged.length||new Set(result).size!==result.length||result.some(card=>!arranged.includes(card)))throw Error('Invalid dual library bottom order');arranged=result;}arranged=arranged.filter(card=>rest.some(row=>row.card===card&&present(row)));for(const card of arranged)p.library.splice(p.library.indexOf(card),1);p.library.unshift(...arranged.reverse());}return true;
  }
  if(e.action==='time-counter-v23'){
   for(const card of V.helpers.genericEffectSubjects(ctx,e.target))if(card.zone==='battlefield'&&!card.phasedOut||card.zone==='exile'&&card.def.suspend&&card.counters.time>0){M.CWW?.syncTime(card);if(e.remove)ctx.g.removeCounters(card,'time',e.n);else ctx.g.addCounters(card,'time',e.n,false,ctx.you);}
   ctx.g.recalc();return true;
  }
  if(e.action==='prevent-attack-player-v23'){for(const player of ctx.g.alivePlayers())if(player!==ctx.you)ctx.g.untilEffects.push({kind:'cantAttackPlayer',who:player,notPlayer:ctx.you,expires:'untilTurnOf',whoTurn:ctx.you});return true;}
  if(e.action!=='self-resuspend-v23')return false;
  const card=ctx.src,spell=ctx.so;
  if(!spell||spell.kind!=='spell'||spell.isCopy||spell.card!==card||card.zone!=='stack'||ctx.sourceZoneVersion!==undefined&&ctx.sourceZoneVersion!==card.zoneVersion)return true;
  const version=card.zoneVersion;await ctx.g.move(card,'exile');
  if(card.zone==='exile'&&card.zoneVersion===version+1&&!card.isToken){card.meta.suspended=0;ctx.g.addCounters(card,'time',e.n,false,card.owner);card.meta.suspended=card.counters.time||0;}
  return true;
 }};V.handlers.push(handler);M.OracleV23Layouts={run:handler.effect};
 const activate=M.Game.prototype.activateAbility;
 M.Game.prototype.activateAbility=async function(p,entry,...rest){try{return await activate.call(this,p,entry,...rest);}finally{if(entry?.ability?.oracleSacrificeGroupsV23)sacrificePlans.delete(entry.card);}};
})();
