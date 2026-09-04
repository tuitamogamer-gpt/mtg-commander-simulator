((M)=>{
 function install(ctx,effect,compile){
  if(effect.duration!=='eot'||typeof effect.once!=='boolean'||effect.trigger?.kind!=='generic-trigger')throw new Error('Unsupported temporary trigger');
  const source=ctx.src,controller=ctx.you,version=ctx.sourceZoneVersion??source.zoneVersion;
  // This facade is used only to evaluate the future event and capture its
  // controller. The queued ability keeps the real physical source so damage,
  // last-known information and target identity still use engine objects.
  const facade=Object.create(source);Object.defineProperties(facade,{ctrl:{value:controller},zoneVersion:{value:version}});
  const trigger=compile(effect.trigger);
  if(trigger.times||trigger.oncePerTurn||trigger.oncePerBatch||trigger.modes)throw new Error('Unsupported temporary trigger multiplicity');
  ctx.g.delayed.push({oracleOperation:effect,on:trigger.on,src:source,ctrl:controller,expires:'eot',once:effect.once,name:source.name+' — delayed ability',
   filter:(game,data)=>trigger.filter(game,facade,data),targets:trigger.targets,prepareTargets:trigger.prepareTargets,opt:trigger.opt,run:trigger.run});
 }
 M.OracleV8DelayedTriggers={install};
})(globalThis.MTG||={});
