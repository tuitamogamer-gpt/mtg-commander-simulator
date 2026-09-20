((M)=>{
 const kind='oracleUntapLock';
 function sourceValid(game,effect){
  const source=game.battlefield.find(card=>card.iid===effect.sourceIid&&card.zoneVersion===effect.sourceVersion);
  return !!source&&!source.phasedOut&&(source.meta.oraclePhaseEpoch||0)===(effect.phaseEpoch||0)&&(!['tapped','controlled-tapped'].includes(effect.mode)||source.tapped&&(source.meta.oracleUntapEpoch||0)===effect.untapEpoch)&&(!['controlled','controlled-tapped'].includes(effect.mode)||source.ctrl===effect.controller&&(source.meta.oracleDurationControl?.epoch||0)===effect.controlEpoch);
 }
 function observe(game){for(const card of game.battlefield){const controller=game.players.indexOf(card.ctrl),previous=card.meta.oracleDurationControl;if(!previous||previous.version!==card.zoneVersion)card.meta.oracleDurationControl={controller,version:card.zoneVersion,epoch:0};else if(previous.controller!==controller){previous.controller=controller;previous.epoch++;}}}
 function prune(game){const before=game.untilEffects.length;game.untilEffects=game.untilEffects.filter(effect=>!(effect.kind===kind||effect.sourceDuration)||sourceValid(game,effect.sourceDuration||effect)&&game.battlefield.some(card=>card.iid===effect.iid&&card.zoneVersion===effect.zoneVersion));return game.untilEffects.length!==before;}
 function capture(ctx,mode){return{sourceIid:ctx.src.iid,sourceVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion,controller:ctx.you,mode,untapEpoch:ctx.oracleSourceCapture?.untapEpoch??ctx.sourceUntapEpoch??0,controlEpoch:ctx.oracleSourceCapture?.durationControlEpoch??ctx.sourceDurationControlEpoch??0,phaseEpoch:ctx.oracleSourceCapture?.phaseEpoch??ctx.sourcePhaseEpoch??0};}
 function recalculate(game,battlefield){
  observe(game);prune(game);
  for(const effect of game.untilEffects)if(effect.kind===kind){const card=battlefield.find(card=>card.iid===effect.iid&&card.zoneVersion===effect.zoneVersion);if(card)card.cur.cantUntap=true;}
 }
 function sourceUntapped(game,card){game.untilEffects=game.untilEffects.filter(effect=>{const d=effect.sourceDuration||effect;return !(effect.kind===kind||effect.sourceDuration)||!['tapped','controlled-tapped'].includes(d.mode)||d.sourceIid!==card.iid||d.sourceVersion!==card.zoneVersion;});}
 function run(ctx,effect,subjects){
  if(!['tapped','battlefield','controlled'].includes(effect.mode))throw new Error('Unknown linked untap duration');
  const duration=capture(ctx,effect.mode);
  if(!sourceValid(ctx.g,duration))return;
  for(const card of new Set(subjects(ctx,effect.target)))if(card.zone==='battlefield')ctx.g.untilEffects.push({kind,...duration,iid:card.iid,zoneVersion:card.zoneVersion,expires:'sourceDuration'});
  ctx.g.recalc();
 }
 async function limitChoicesV17(game,active,cards,battlefield){
  const blocked=new Set(),rules=battlefield.filter(source=>!source.cur?.abilitiesDisabled).flatMap(source=>(source.def.oracleUntapLimitsV17||[]).filter(rule=>!rule.untapped||!source.tapped).map(rule=>({source,rule})));
  for(const {source,rule} of rules){
   const player=active;
   if(rule.players==='you'&&source.ctrl!==player||rule.players==='opponents'&&source.ctrl===player)continue;
   const candidates=cards.filter(card=>card.ctrl===player&&card.tapped&&!blocked.has(card)&&rule.matches(game,card,source));
   if(candidates.length<=rule.n)continue;
   const answer=await player.controller.decide(game,{type:'chooseCards',from:candidates,min:0,max:rule.n,prompt:source.name+': choose permanents to untap',aiHint:{kind:'finaleUntap',max:rule.n}});
   const chosen=Array.isArray(answer)&&answer.length<=rule.n&&new Set(answer).size===answer.length&&answer.every(card=>candidates.includes(card))?answer:[];
   for(const card of candidates)if(!chosen.includes(card))blocked.add(card);
  }
  return blocked;
 }
 M.OracleV8Untap={run,recalculate,sourceUntapped,observe,prune,capture,sourceValid,limitChoicesV17};
})(globalThis.MTG||={});
