((M)=>{
 const permanent=card=>['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].some(type=>card.is(type));
 async function run(ctx,effect,h){
  const primary=effect.models||effect.namesFrom==='own-hand'?ctx.src:effect.eventName?ctx.oracleSourceCapture?.eventCard||ctx.data?.card:h.subjects(ctx,effect.target)[0];if(!primary)return;
  let models=effect.models?ctx.g.bf().filter(card=>card.ctrl===ctx.you&&(effect.models==='choose-five-permanents'||card.is('Creature'))&&(effect.models!=='friendly-other-creatures'||card!==ctx.src)):[primary];
  if(effect.models==='choose-five-permanents'){
   const n=Math.min(5,models.length),picked=n?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',player:ctx.you,from:models,min:n,max:n,prompt:'Choose five permanents',aiHint:{kind:'recur'}}):[];
   if(!Array.isArray(picked)||picked.length!==n||new Set(picked).size!==n||picked.some(card=>!models.includes(card)))throw new Error('Invalid named-search permanent choice');models=picked;
  }
  const eventSnap=effect.eventName&&(ctx.oracleSourceCapture?.eventSnap||ctx.data?.snap||primary.battlefieldLKI?.get(ctx.eventCardZoneVersion));
  const card=primary.kind==='spell'?primary.card:primary;
  const owner=effect.owner==='you'?ctx.you:effect.owner==='owner'?card.owner:effect.owner==='target-player'?primary:effect.owner==='event-controller'?ctx.oracleSourceCapture?.eventController||eventSnap?.ctrl:primary.ctrl;
  if(!owner||owner.lost)return;
  if(effect.namesFrom){
   const zone=effect.namesFrom==='graveyard'?'graveyard':'hand',from=owner[zone].filter(card=>effect.selection==='not-basic-land'?!(card.is('Land')&&(card.def.super||[]).includes('Basic')):effect.selection==='nonland'?!card.is('Land'):effect.selection==='creature'?card.is('Creature'):true);
   if(effect.namesFrom==='hand')await ctx.g.revealToHuman({cards:owner.hand.slice(),ctrl:owner,kind:'reveal'});
   if(zone==='graveyard')models=from;else{
    const max=Math.min(from.length,effect.selectMax==='X'?Math.max(0,Number(ctx.x)||0):effect.selectMax),min=effect.selectRequired?max:0;
    models=max?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',player:ctx.you,from,min,max,prompt:'Choose revealed card'+(max===1?'':'s'),aiHint:{kind:'recur'}}):[];
    if(!Array.isArray(models)||models.length<min||models.length>max||new Set(models).size!==models.length||models.some(card=>!from.includes(card)||card.zone!==zone))throw new Error('Invalid name-search model selection');
    if(effect.namesFrom==='own-hand'&&models.length)await ctx.g.revealToHuman({cards:models.slice(),ctrl:owner,kind:'reveal'});
   }
  }
  if(effect.prior==='retrace'){
   const model=models[0];if(model&&permanent(model)&&ctx.g.bf().some(card=>M.OracleV8NameGroups.matches(M.OracleV8NameGroups.names(card),M.OracleV8NameGroups.names(model))))await ctx.g.putPermanentOntoBattlefield(model,ctx.you);return;
  }
  let modelNames=models.map(model=>M.OracleV8NameGroups.names(eventSnap||model));
  if(effect.prior==='exile-models'){
   if(effect.namesFrom==='graveyard')await ctx.g.moveGraveyardBatch(models,'exile');else for(const model of models)await ctx.g.move(model,'exile');
   modelNames=modelNames.filter((_,index)=>models[index].zone==='exile');
  }
  const names=modelNames.flat();
  if(effect.prior==='counter'){if(ctx.g.stack.includes(primary)&&!M.isUncounterable(ctx.g,primary))await ctx.g.counterStackObject(primary,{source:ctx.src});}
  else if(effect.prior==='exile')await ctx.g.move(card,'exile');
  if(!owner||owner.lost)return;
  const chooser=effect.owner==='event-controller'?owner:ctx.you;
  if(effect.optionalSearch){const answer=await chooser.controller.decide(ctx.g,{type:'chooseOption',player:chooser,prompt:'Search your library?',options:[{key:'yes',label:'Search'},{key:'no',label:'Decline'}],aiHint:{kind:'confirm'}});if(!['yes','no'].includes(answer))throw new Error('Invalid optional name-search choice');if(answer==='no')return;}
  const locked=effect.zones.flatMap(zone=>owner[zone].map(card=>({card,zone,version:card.zoneVersion}))).filter(row=>M.OracleV8NameGroups.matches(names,M.OracleV8NameGroups.names(row.card))&&(!effect.permanent||permanent(row.card))&&(!effect.creature||row.card.is('Creature')));
  const present=row=>row.card.zone===row.zone&&row.card.zoneVersion===row.version&&owner[row.zone].includes(row.card);
  // CR701.23b: all matching public graveyard cards are mandatory, while
  // finding a stated quality in hand/library may fail to find any subset.
  const forced=effect.quantity==='all'?locked.filter(row=>row.zone==='graveyard'):[],offered=locked.filter(row=>!forced.includes(row));
  const from=offered.map(row=>row.card),max=Math.min(from.length,effect.max??(effect.perModel?models.length:from.length));
  // A selected card must be matched to a distinct original model, so two
  // identical creatures permit two copies while one does not permit three.
  const assignments=cards=>{
   const assigned=new Map(),cardNames=cards.map(card=>M.OracleV8NameGroups.names(card));
   function augment(index,seen){for(let i=0;i<modelNames.length;i++)if(!seen.has(i)&&M.OracleV8NameGroups.matches(modelNames[i],cardNames[index])){seen.add(i);if(!assigned.has(i)||augment(assigned.get(i),seen)){assigned.set(i,index);return true;}}return false;}
   return cards.every((_,index)=>augment(index,new Set()));
  };
  const chosen=max?await chooser.controller.decide(ctx.g,{type:'chooseCards',player:chooser,from,min:0,max,search:true,prompt:'Choose matching cards to '+(effect.destination==='exile'?'exile':'put into '+effect.destination),aiHint:{kind:effect.destination==='exile'?'oracleNameExile':'oracleNameSearch',...(effect.perModel?{canPayRemaining:assignments}:{})}}):[];
  if(!Array.isArray(chosen)||chosen.length>max||new Set(chosen).size!==chosen.length||chosen.some(card=>!offered.some(row=>row.card===card&&present(row))))throw new Error('Invalid matching-name search choice');
  if(effect.perModel&&!assignments(chosen))throw new Error('Named search exceeds its original models');
  const selected=[...forced,...chosen.map(card=>offered.find(row=>row.card===card))].filter(present);
  if(effect.reveal&&selected.length)await ctx.g.revealToHuman({cards:selected.map(row=>row.card),ctrl:ctx.you,kind:'reveal'});
  const hand=selected.filter(row=>row.zone==='hand');
  if(effect.destination==='exile'){
   await ctx.g.moveGraveyardBatch(selected.filter(row=>row.zone==='graveyard').map(row=>row.card),'exile');
   for(const row of selected)if(row.zone!=='graveyard'&&present(row))await ctx.g.move(row.card,'exile');
  }
  else if(effect.destination==='hand'){for(const row of selected)if(present(row))await ctx.g.move(row.card,'hand');}
  else if(effect.destination==='battlefield')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const row of selected)if(present(row)&&permanent(row.card))await ctx.g.putPermanentOntoBattlefield(row.card,owner,{tapped:!!effect.tapped});});
  M.shuffle(owner.library,ctx.g.rnd);
  if(effect.handDraw)await ctx.g.draw(owner,hand.filter(row=>row.card.zone==='exile').length);
 }
 M.OracleV8NameSearch={run};
})(globalThis.MTG||={});
