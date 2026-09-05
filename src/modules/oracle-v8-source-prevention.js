((M)=>{
 const sourceView=(card,version,snap)=>snap?{...snap,is:type=>snap.types?.includes(type)}:card;
 const qualifies=(card,quality)=>!!card&&(!quality.type||card.is?.(quality.type))&&(!quality.colors||quality.colors.some(color=>card.colors?.includes(color)));
 function candidates(game,quality={},resolving){
  const rows=[];
  const add=(card,version=card?.zoneVersion,snap)=>{
   if(!(card instanceof M.CardInst)||rows.some(row=>row.card===card&&row.version===version))return;
   snap||=card.battlefieldLKI?.get(version);
   if(!qualifies(sourceView(card,version,snap),quality))return;
   rows.push({card,version,snapshot:snap,spell:card.zone==='stack'&&card.zoneVersion===version});
  };
  for(const card of game.bf())add(card);
  for(const p of game.players)for(const card of p.command||[])if(!card.faceDown)add(card);
  const references=object=>{
   add(object.card);add(object.srcCard||object.src||object.sourceCard,object.ctx?.sourceZoneVersion??object.sourceZoneVersion);
   for(const card of [object.targets,object.target,object.source,object.ctx?.targets].flat(Infinity).filter(Boolean))add(card);
   if(object.sourceRecord)add(object.sourceRecord.card,object.sourceRecord.version,object.sourceRecord.snapshot);
  };
  for(const object of [...game.stack,...game.delayed,...game.untilEffects])references(object);
  if(resolving)references({srcCard:resolving.src,ctx:resolving,targets:resolving.targets});
  return rows;
 }
 async function run(ctx,effect,h){
  const game=ctx.g,choices=candidates(game,effect.quality,ctx).sort((a,b)=>Number(b.card.ctrl!==ctx.you)-Number(a.card.ctrl!==ctx.you)||Math.max(0,Number(b.card.power)||0)-Math.max(0,Number(a.card.power)||0));
  if(!choices.length)return;
  const picked=await ctx.you.controller.decide(game,{type:'chooseOption',prompt:'Choose a source of damage',options:choices.map((row,i)=>({key:String(i),label:row.card.name,card:row.card})),aiHint:{kind:'damagePreventionSource',source:ctx.src}});
  const selected=choices[Number(picked)];if(!selected||String(Number(picked))!==String(picked))return;
  if(!candidates(game,effect.quality,ctx).some(row=>row.card===selected.card&&row.version===selected.version))return;
  const targets=effect.target==='all'?[null]:h.subjects(ctx,effect.target);
  // A resolved shield is not an object controlled by its caster (CR 800.4a).
  // Retain the controller for riders without marking the effect for departure cleanup.
  for(const target of targets)game.untilEffects.push({kind:'oracleChosenSourcePrevention',expires:'eot',sourceCard:ctx.src,controllerSeat:ctx.you.idx,sourceRecord:selected,target,targetVersion:target?.zoneVersion,effect,consumed:false});
 }
 function applies(game,shield,data){
  if(shield.effect.combat&&!data.combat)return false;
  if(shield.consumed&&(!data.batch||shield.consumedBatch!==data.batch))return false;
  const selected=shield.sourceRecord,src=data.src,version=src?._oracleDamageSnapshot?.zoneVersion??data.sourceSnapshot?.zoneVersion??src?.zoneVersion;
  const resolvedPermanent=selected.spell&&src?.zone==='battlefield'&&version===selected.version+1&&src.meta?._enteredFromZone==='stack';
  if(src?.iid!==selected.card.iid||version!==selected.version&&!resolvedPermanent)return false;
  if(shield.target&&(data.target!==shield.target||data.target.zoneVersion!==shield.targetVersion))return false;
  const snap=src?._oracleDamageSnapshot||data.sourceSnapshot||selected.card.battlefieldLKI?.get(version);
  return qualifies(sourceView(src,version,snap),shield.effect.quality)&&(!shield.effect.half||data.n>1);
 }
 async function prevent(game,shield,data){
  const amount=shield.effect.half?Math.floor(data.n/2):data.n;
  if(!(amount>0))return 0;
  if(!shield.effect.allTurn){shield.consumed=true;shield.consumedBatch=data.batch;}
  const controller=game.players[shield.controllerSeat]||shield.who;
  if(controller&&!controller.lost&&shield.effect.after==='gain-life')await game.gainLife(controller,amount,shield.sourceCard);
  else if(controller&&!controller.lost&&shield.effect.after==='exile-library')for(const card of controller.library.slice(-amount))await game.move(card,'exile');
  return amount;
 }
 const threat=(game,player,card)=>!card?-100:(card.ctrl===player?-20:5)+Math.max(0,Number(card.power)||0)+(card.zone==='stack'&&/deals? .+damage/i.test(card.def?.oracle||'')?30:0);
 M.OracleV8SourcePrevention={candidates,run,applies,prevent,threat};
})(globalThis.MTG||={});
