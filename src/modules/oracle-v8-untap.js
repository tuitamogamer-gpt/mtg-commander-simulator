((M)=>{
 const kind='oracleUntapLock';
 function sourceValid(game,effect){
  const source=game.battlefield.find(card=>card.iid===effect.sourceIid&&card.zoneVersion===effect.sourceVersion);
  return !!source&&(effect.mode!=='tapped'||source.tapped&&(source.meta.oracleUntapEpoch||0)===effect.untapEpoch)&&(effect.mode!=='controlled'||source.ctrl===effect.controller&&(source.meta.oracleDurationControl?.epoch||0)===effect.controlEpoch);
 }
 function recalculate(game,battlefield){
  for(const card of game.battlefield){const controller=game.players.indexOf(card.ctrl),previous=card.meta.oracleDurationControl;if(!previous||previous.version!==card.zoneVersion)card.meta.oracleDurationControl={controller,version:card.zoneVersion,epoch:0};else if(previous.controller!==controller){previous.controller=controller;previous.epoch++;}}
  game.untilEffects=game.untilEffects.filter(effect=>effect.kind!==kind||sourceValid(game,effect)&&game.battlefield.some(card=>card.iid===effect.iid&&card.zoneVersion===effect.zoneVersion));
  for(const effect of game.untilEffects)if(effect.kind===kind){const card=battlefield.find(card=>card.iid===effect.iid&&card.zoneVersion===effect.zoneVersion);if(card)card.cur.cantUntap=true;}
 }
 function sourceUntapped(game,card){game.untilEffects=game.untilEffects.filter(effect=>effect.kind!==kind||effect.mode!=='tapped'||effect.sourceIid!==card.iid||effect.sourceVersion!==card.zoneVersion);}
 function run(ctx,effect,subjects){
  if(!['tapped','battlefield','controlled'].includes(effect.mode))throw new Error('Unknown linked untap duration');
  const duration={sourceIid:ctx.src.iid,sourceVersion:ctx.sourceZoneVersion??ctx.src.zoneVersion,controller:ctx.you,mode:effect.mode,untapEpoch:ctx.oracleSourceCapture?.untapEpoch??ctx.sourceUntapEpoch??0,controlEpoch:ctx.oracleSourceCapture?.durationControlEpoch??ctx.sourceDurationControlEpoch??0};
  if(!sourceValid(ctx.g,duration))return;
  for(const card of new Set(subjects(ctx,effect.target)))if(card.zone==='battlefield')ctx.g.untilEffects.push({kind,...duration,iid:card.iid,zoneVersion:card.zoneVersion,expires:'sourceDuration'});
  ctx.g.recalc();
 }
 M.OracleV8Untap={run,recalculate,sourceUntapped};
})(globalThis.MTG||={});
