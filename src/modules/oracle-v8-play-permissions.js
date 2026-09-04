((M)=>{
 const actions=new Set(['cast-card-v8','cast-from-hand-v8','cast-from-graveyard-v8','cast-inspected-v8']),frames=new WeakMap();let nextId=1;
 const present=entry=>entry.card.zone===entry.zone&&entry.card.zoneVersion===entry.version&&entry.card.owner[entry.zone]?.includes(entry.card);
 function alternatives(game,card,base){
  const faces=M.OracleV8Faces?.physical(card);
  if(faces)return faces.faces.filter(face=>faces.layout!=='transform'||face.key==='front').map(face=>({...base,oracleFace:face.key,name:face.def.name,label:face.def.name}));
  if(card.def.oracleSplit)return game.oracleSplitCastingOptions(card,card.zone,base);
  return [base,...(card.def.adventure?[{...base,adventure:true,name:card.def.adventure.name,label:card.def.adventure.name,types:card.def.adventure.types,cost:card.def.adventure.cost}]:[])];
 }
 function prospective(game,card,alt,player){
  const physical=card.oracleFaces?M.OracleV8Faces.view(card,alt.oracleFace):card;
  const definition=game.castDefinition(card,alt);
  const cost=alt.adventure?card.def.adventure.cost:card.def.oracleSplit?game.oracleSplitPrintedCost(card,alt):definition.cost;
  const colors=definition.devoid?[]:definition.colorsOverride||M.colorsOfCost(cost||'');
  const view=Object.defineProperties(Object.create(physical),{castMeta:{value:{alt,spellColors:colors}},colors:{value:colors}});
  return {kind:'spell',card:view,ctrl:player,castOpts:alt,from:card.zone,x:0};
 }
 function offers(game,player){
  const frame=frames.get(game);if(!frame||frame.player!==player)return [];
  return frame.entries.filter(present).flatMap(entry=>entry.alternatives.filter(alt=>!game.castHasType(entry.card,alt,'Land')&&
   (!frame.filter||frame.filter(game,prospective(game,entry.card,alt,player),player,frame.source))).map(alt=>({card:entry.card,from:entry.zone,alt})));
 }
 function allowed(game,player,card,options){
  const frame=frames.get(game);if(!frame||frame.player!==player||frame.id!==options.oracleImmediateCast)return false;
  if(options.free!==frame.free||options.asThoughAnyColor!==frame.anyColor||options.speed!=='instant'||options.faceDownCast||options.bestow||options.overloaded||options.oracleAlternativeCost)return false;
  return offers(game,player).some(entry=>entry.card===card&&entry.from===(options.from||card.zone)&&
   ['oracleFace','adventure','splitHalf','splitFuse','altCostStr','flashback','isAftermath','oracleExileOnGraveyard'].every(key=>entry.alt[key]===options[key]));
 }
 async function castOne(ctx,cards,effect,helpers){
  effect={free:true,...effect};
  const prior=frames.get(ctx.g),id=nextId++,base={oracleImmediateCast:id,free:effect.free,speed:'instant',...(effect.anyColor?{asThoughAnyColor:true}:{}),...(effect.exileAfter&&!effect.exileTypes?{oracleExileOnGraveyard:true}:{})};
  const filter=effect.filter?helpers.target(effect.filter,[],0,{...ctx.data,oracleX:ctx.so?.x??ctx.x??0,oracleSourceCapture:ctx.oracleSourceCapture||{zoneVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion}}).filter:null;
  const frame={id,player:ctx.you,source:ctx.src,free:effect.free,anyColor:base.asThoughAnyColor,filter,entries:cards.map(card=>({card,zone:card.zone,version:card.zoneVersion,alternatives:alternatives(ctx.g,card,base).map(alt=>effect.exileAfter&&effect.exileTypes?.some(type=>ctx.g.castHasType(card,alt,type))?{...alt,oracleExileOnGraveyard:true}:alt)}))};
  frames.set(ctx.g,frame);
  try{
   const choices=ctx.g.castableList(ctx.you).filter(entry=>entry.alt?.oracleImmediateCast===id),from=[...new Set(choices.map(entry=>entry.card))];
   if(!from.length)return null;
   const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',player:ctx.you,from,min:0,max:1,
    prompt:'You may cast one of these cards'+(effect.free?' without paying its mana cost':''),aiHint:{kind:'recur'}});
   if(!Array.isArray(answer)||answer.length>1||answer.some(card=>!from.includes(card)))throw new Error('Invalid immediate cast selection');
   if(!answer.length)return null;
   const card=answer[0];frame.entries=frame.entries.filter(entry=>entry.card===card);
   const selected=choices.filter(entry=>entry.card===card);
   const key=selected.length===1?'0':await ctx.you.controller.decide(ctx.g,{type:'chooseOption',player:ctx.you,prompt:'Choose a spell face',
    options:selected.map((entry,index)=>({key:String(index),label:entry.alt.label||entry.alt.name||card.name,face:entry.alt.oracleFace})),aiHint:{kind:'oracleSpellFace',card}});
   const index=Number(key);if(!Number.isInteger(index)||!selected[index])throw new Error('Invalid immediate cast face');
   const choice=selected[index];if(!allowed(ctx.g,ctx.you,card,{...choice.alt,from:choice.from}))return null;
   return await ctx.g.castSpell(ctx.you,card,{from:choice.from,alt:choice.alt})?card:null;
  }finally{if(prior)frames.set(ctx.g,prior);else frames.delete(ctx.g);}
 }
 async function run(ctx,effect,helpers){
  if(!actions.has(effect.action)||typeof effect.free!=='boolean')throw new Error('Unsupported immediate cast instruction');
  if(effect.action==='cast-inspected-v8'){
   if(!['look','reveal','exile'].includes(effect.visibility)||!['bottom-random','stay'].includes(effect.rest)||effect.uncast&&!['hand','draw'].includes(effect.uncast)||effect.cardManaParity&&effect.cardManaParity!=='odd')throw new Error('Unsupported inspected casting instruction');
   const owner=helpers.subjects(ctx,effect.who??'you')[0];if(!owner?.library)return null;
   let cards;
   if(effect.until){
    const filter=helpers.target({...effect.until,controller:'any'},[],0,ctx.data).filter;cards=[];
    for(const card of owner.library.slice().reverse()){cards.push(card);if(filter(ctx.g,card,ctx.you,ctx.src))break;}
   }else{const n=helpers.amount(effect.n,ctx);if(!Number.isInteger(n)||n<0)throw new Error('Invalid inspected casting count');cards=n?owner.library.slice(-n).reverse():[];}
   const entries=cards.map(card=>({card,zone:'library',version:card.zoneVersion}));
   if(effect.visibility==='reveal')await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});
   else if(effect.visibility==='look'&&!ctx.you.isAI&&cards.length)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards,kind:'look',private:true});
   if(effect.visibility==='exile')for(const entry of entries)if(present(entry)){await ctx.g.move(entry.card,'exile');entry.zone='exile';entry.version=entry.card.zoneVersion;}
   // An until search grants casting permission only for its matching stop
   // card. Earlier exiled cards remain in the locked remainder cohort.
   const eligible=effect.until?entries.slice(-1).filter(entry=>helpers.target({...effect.until,controller:'any'},[],0,ctx.data).filter(ctx.g,entry.card,ctx.you,ctx.src)):entries;
   const cast=await castOne(ctx,eligible.filter(entry=>present(entry)&&(!effect.cardManaParity||entry.card.mv%2===1)).map(entry=>entry.card),effect,helpers);
   if(!cast&&effect.uncast==='draw')await ctx.g.draw(ctx.you,1);
   else if(!cast&&effect.uncast==='hand')for(const entry of eligible)if(present(entry))await ctx.g.move(entry.card,'hand');
   if(effect.rest==='bottom-random'){
    const rest=entries.filter(present).map(entry=>entry.card);M.shuffle(rest,ctx.g.rnd);
    for(const card of rest)await ctx.g.move(card,'library',{toBottom:true});
   }
   return cast;
  }
  let cards;
  if(effect.action==='cast-from-hand-v8'){
   const owner=helpers.subjects(ctx,effect.who??'you')[0];if(!owner?.hand)return null;cards=owner.hand.slice();
   const locked=cards.map(card=>({card,zone:card.zone,version:card.zoneVersion}));
   if(effect.visibility==='reveal')await ctx.g.revealToHuman({cards,ctrl:ctx.you,kind:'reveal'});
   else if(effect.visibility==='look'&&!ctx.you.isAI&&cards.length)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards,kind:'look',private:true});
   // A reveal/inspection choice cannot authorize a later incarnation.
   cards=locked.filter(present).map(entry=>entry.card);
  }else if(effect.action==='cast-from-graveyard-v8')cards=(effect.who==='each-player'?ctx.g.alivePlayers():helpers.subjects(ctx,effect.who??'you')).flatMap(owner=>owner.graveyard||[]);
  else cards=helpers.subjects(ctx,effect.target).filter(card=>card.zone==='graveyard');
  return castOne(ctx,cards,effect,helpers);
 }
 M.OracleV8PlayPermissions={actions,run,offers,allowed,castOne};
})(globalThis.MTG||={});
