'use strict';
((M)=>{
 const V=M.OracleV20;
 const playerFor=(ctx,subject,index)=>subject instanceof M.Player?subject:ctx._oracleTargetControllers?.[index]?.find(row=>row.subject===subject)?.controller||subject.ctrl;
 V.handlers.push({
  spellsV21:true,
  compile(operation,script,entry,h){
   if(operation.kind==='spell-modal-generic'&&operation.modes.some(mode=>mode.castConditionV21)){
    const compiled=h.compileSpell(operation),blocked=h.genericTargetSpecs([{what:'creature',zone:'battlefield',controller:'any',min:1}],[{action:'destroy',target:0}])[0];
    compiled.modes.list=compiled.modes.list.map((mode,i)=>{const condition=operation.modes[i].castConditionV21;if(!condition)return mode;return {...mode,targets:(game,card,options)=>h.genericCondition(game,card,condition,card.ctrl,{kicked:!!options._kicked})?mode.targets:[{...blocked,filter:()=>false}]};});
    Object.assign(script,compiled);return true;
   }
   if(operation.kind==='spell-kicker-branches-v21'){
    const make=part=>h.compileOracleScript(h.batch,{...entry,...part}),ordinary=make(operation.ordinary),kicked=make(operation.kicked),pick=options=>options?._kicked?kicked:ordinary;
    const targets=(definition,game,card,options,player)=>typeof definition.targets==='function'?definition.targets(game,card,options,player):definition.targets||[];
    script.oracleKickerBranchesV21=true;
    script.oracleKickerTargetsV21=(game,player,card,options)=>targets(kicked,game,card,{...options,_kicked:true},player);
    script.targets=(game,card,options,player)=>targets(pick(options),game,card,options,player);
    const prepare=script.prepareTargets;
    script.prepareTargets=async ctx=>{if(await prepare?.(ctx)===false)return false;return pick(ctx.so.castOpts).prepareTargets?.(ctx);};
    script.resolve=ctx=>pick(ctx.so?.castOpts).resolve(ctx);return true;
   }
   return false;
  },
  amount(value,ctx){if(value.kind==='spell-count-v21'&&value.test==='nontoken-died')return ctx.g.diedThisTurn.filter(row=>row.types.includes('Creature')&&!row.isToken).length;},
  condition(game,source,node,player){if(node.kind==='spell-target-condition-v21'&&node.test==='least-power')return source.zone==='battlefield'&&source.is('Creature')&&game.bf().filter(card=>card.is('Creature')).every(card=>card.power>=source.power);if(node.kind==='spell-target-condition-v21'&&node.test==='stat')return source.zone==='battlefield'&&(node.comparison==='less'?source[node.stat]<=node.threshold:source[node.stat]>=node.threshold);if(node.kind==='spell-mode-condition-v21'&&node.test==='opponent-graveyard')return player.opponents(game).some(p=>p.graveyard.length>=node.min);},
  async effect(ctx,effect,h){
   if(effect.action==='grave-return-counters-v21'){
    const players=effect.who==='each-player'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you):effect.who==='each-opponent'?ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(p=>p!==ctx.you):[ctx.you],rows=[];
    for(const player of players)for(const card of player.graveyard)if(h.genericTargetSpec(effect.filter,[],0).filter(ctx.g,card,player,ctx.src))rows.push({card,player,version:card.zoneVersion});
    await ctx.g.withBattlefieldEntryBatch(async()=>{for(const row of rows)if(row.card.zone==='graveyard'&&row.card.zoneVersion===row.version)await ctx.g.putPermanentOntoBattlefield(row.card,row.player,{tapped:!!effect.tapped,additionalCounters:effect.additionalCounters,additionalCounterBy:ctx.you});});return true;
   }
   if(effect.action==='player-or-controller-v21'){
    const players=[...new Set(h.genericEffectSubjects(ctx,effect.target).map(subject=>playerFor(ctx,subject,effect.target)).filter(p=>p&&!p.lost))];
    for(const player of players)await h.runGenericEffects({...ctx,...(effect.asActor?{you:player}:{}),targets:[player],_oracleTargetControllers:undefined},effect.effects);return true;
   }
   if(effect.action==='damage-controller-batch-v21'){
    const hits=[],n=h.genericAmount(effect.n,ctx),groupN=h.genericAmount(effect.groupN,ctx),filter=h.genericTargetSpec(effect.filter,[],0);
    for(const subject of h.genericEffectSubjects(ctx,effect.target)){const player=playerFor(ctx,subject,effect.target);if(!player)continue;hits.push({src:ctx.src,target:subject,n});for(const card of ctx.g.bf())if(card.ctrl===player&&filter.filter(ctx.g,card,player,ctx.src))hits.push({src:ctx.src,target:card,n:groupN});}
    await ctx.g.damageBatch(hits,{deferSBA:true});return true;
   }
   return false;
  }
 });
})(MTG);
