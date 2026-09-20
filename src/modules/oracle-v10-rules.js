// Global restrictions share the same authoritative entry points as native rules.
(function(M){
  'use strict';
  const G=M.Game.prototype;
  const uncounterable=M.isUncounterable;M.isUncounterable=(game,spell)=>!!spell.oracleCantCounterV10||uncounterable(game,spell);
  M.oracleBargainPaymentV10=M.compileOracleAdditionalCosts([{id:'bargain-v10',kind:'sacrifice',quantity:{min:1,max:1},object:{kind:'permanent',types:['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'],qualifier:{bargainV10:true}}}]);
  const prototypes=new WeakMap();
  M.oraclePrototypeDefinitionV10=definition=>{
    const printed=definition.oraclePrototypeV10;if(!printed)return definition;
    if(!prototypes.has(definition))prototypes.set(definition,{...definition,...printed,colorsOverride:['W','U','B','R','G'].filter(color=>printed.cost.includes('{'+color+'}'))});
    return prototypes.get(definition);
  };
  const resolveTop=G.resolveTop;
  G.resolveTop=async function(...args){this.oracleResolutionDepthV10=(this.oracleResolutionDepthV10||0)+1;try{return await resolveTop.apply(this,args);}finally{this.oracleResolutionDepthV10--;}};
  const emit=G.emit;
  G.emit=async function(event,data,...args){
    if(event==='lto'&&data?.snap?.ctrl&&!data.snap.types.includes('Land'))data.snap.ctrl.turnState.nonlandLeftV10=(data.snap.ctrl.turnState.nonlandLeftV10||0)+1;
    if(event==='cast'&&data?.so?.castOpts?.warp&&data.player)data.player.turnState.warpCastV10=(data.player.turnState.warpCastV10||0)+1;
    return emit.call(this,event,data,...args);
  };
  M.oraclePrepareV10=(game,source)=>{
    if(!source||source.zone!=='battlefield'||source.phasedOut||source.meta.prepared||!source.def.oraclePrepareDefinitionV10)return null;
    const copy=M.SOC.prepare({g:game,src:source,you:source.ctrl,sourceZoneVersion:source.zoneVersion},source.def.oraclePrepareDefinitionV10);
    if(copy){copy.meta.oraclePreparedDefinitionV10=source.def.oraclePrepareDefinitionKeyV10;const allowed=copy.meta.playableCondition;copy.meta.playableCondition=(g,p)=>!source.phasedOut&&allowed(g,p);copy.def={...copy.def,castCond:(g,p,c)=>c.zone==='exile'&&copy.meta.playableCondition(g,p)&&g.canCastTiming(p,c)};}
    return copy;
  };
  M.oracleToxicValueV10=card=>(card?._oracleLKI?card.toxic||0:(!(card?.zone==='battlefield'&&card.cur?.abilitiesDisabled)?Math.max(0,Number(card?.def?.toxic)||0):0)+(card?.zone==='battlefield'?(card.cur?.oracleNumericKeywordsV10||[]).filter(row=>row.kind==='toxic').reduce((sum,row)=>sum+row.n,0):0));
  M.oracleGrantToxicV10=(game,cards,n)=>{for(const card of cards)if(card.zone==='battlefield')game.untilEffects.push({kind:'oracleCombatRestriction',iid:card.iid,zoneVersion:card.zoneVersion,controller:card.ctrl.idx,expires:'eot',restriction:{toxicV10:n}});game.recalc();};
  // CR 115.7 and 115.9a: retain announced target counts and damage division.
  G.oracleRetargetSingleV10=async function(object,chooser){
    if(!this.stack.includes(object)||(object.targets||[]).flat().filter(Boolean).length!==1)return false;
    const source=object.card||object.srcCard,previous=object.targets.flat().find(Boolean),specs=object.targetSpecs||this.spellTargetSpecs(source,object.castOpts,object.ctrl);
    if(!specs?.length)return false;
    const locked=specs.map((spec,i)=>{const n=[object.targets[i]].flat().filter(Boolean).length;return {...spec,min:n,count:n,upTo:false,chooseByOpponent:false};});
    const ctx={g:this,src:source,you:object.ctrl,so:object,decisionPlayer:chooser,suppressTargetEvents:true,targetChoiceFilter:card=>card!==previous};
    if(!await this.pickTargets(ctx,locked,source,object.ctrl)||(ctx.targets||[]).flat().filter(Boolean).length!==1)return false;
    object.targets=ctx.targets;object.targetIdentities=this.captureTargetIdentities(ctx.targets);
    if(object.ctx){object.ctx.targets=object.targets;object.ctx.targetIdentities=object.targetIdentities;}
    const target=object.targets.flat().find(Boolean);
    for(const division of [object.damageDivision,object.counterDistribution,object.ctx?.damageDivision,object.ctx?.counterDistribution])for(const row of division||[]){row.iid=target.iid;row.playerIdx=target instanceof M.Player?target.idx:null;if('target' in row)row.target=target;}
    await this.emit('targeted',{card:target,byPlayer:object.ctrl,src:source,isSpell:object.kind==='spell',isActivatedAbility:object.kind==='ability',isTriggeredAbility:object.kind==='trigger',so:object});
    this.queueWardTriggers(object,ctx);return true;
  };
  const affects=(source,player,players)=>players==='all'||(players==='you'?source.ctrl===player:source.ctrl!==player);
  const restricted=(game,player,rule)=>game.bf().some(source=>!source.cur?.abilitiesDisabled&&source.def.oraclePlayerRulesV10?.some(row=>row.rule===rule&&affects(source,player,row.players)))||game.untilEffects.some(row=>row.kind==='oraclePlayerRuleV10'&&row.rule===rule&&row.players.includes(player));
  M.oraclePlayerRestrictedV10=restricted;
  G.oracleShouldSkipV10=function(player,phase){
    if(restricted(this,player,'skip-'+phase))return true;
    const pending=this.untilEffects.find(row=>row.kind==='oracleSkipV10'&&row.player===player&&row.phase===phase&&row.n>0);
    if(!pending)return false;
    if(--pending.n===0)this.untilEffects.splice(this.untilEffects.indexOf(pending),1);
    return true;
  };
  const landLimit=G.landPlayLimit,lands=G.playableLands,playLand=G.playLand;
  G.landPlayLimit=function(player){return restricted(this,player,'no-land')?0:landLimit.call(this,player)+this.untilEffects.filter(row=>row.kind==='oracleAdditionalLandV10'&&row.player===player).reduce((sum,row)=>sum+row.n,0);};
  G.playableLands=function(player){return restricted(this,player,'no-land')?[]:lands.call(this,player);};
  G.playLand=function(player,...args){return restricted(this,player,'no-land')?Promise.resolve(false):playLand.call(this,player,...args);};
  const search=G.canSearchLibrary;
  G.canSearchLibrary=function(player){return !restricted(this,player,'no-search')&&search.call(this,player);};
  const lose=G.canLoseGame,win=G.canWinGame;
  G.canLoseGame=function(player){return !restricted(this,player,'no-lose-win')&&lose.call(this,player);};
  G.canWinGame=function(player){return !player.opponents(this).some(opponent=>restricted(this,opponent,'no-lose-win'))&&win.call(this,player);};
})(globalThis.MTG);
