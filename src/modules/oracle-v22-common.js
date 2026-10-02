'use strict';
((M)=>{
  const move=M.Game.prototype.move;
  M.Game.prototype.move=async function(card,to,options){
    const from=card.zone,version=card.zoneVersion,result=await move.call(this,card,to,options);
    if(card.zone==='graveyard'&&card.zoneVersion!==version)card.meta.oracleGraveEntryV22={turn:this.turnNo,version:card.zoneVersion,fromBattlefield:from==='battlefield',discarded:false,cycled:false};
    return result;
  };
  const emit=M.Game.prototype.emit;
  M.Game.prototype.emit=async function(event,data){
    if(['discarded','cycled'].includes(event)&&data?.card?.zone==='graveyard'){
      const card=data.card,record=card.meta.oracleGraveEntryV22;
      if(record?.turn===this.turnNo&&record.version===card.zoneVersion)record[event==='discarded'?'discarded':'cycled']=true;
    }
    return emit.call(this,event,data);
  };
  function resolveOrdinal(ctx,key){
    const version=ctx.oracleSourceCapture?.zoneVersion??ctx.sourceZoneVersion??ctx.src.zoneVersion;
    // The physical owner's plain turn history survives checkpoints and control
    // changes. Separate zone versions keep old pending triggers independent.
    const history=ctx.src.owner.turnState,identity='oracleResolvedSequenceV22:'+ctx.src.iid+':'+version+':'+key;
    const previous=history[identity],count=(previous?.turn===ctx.g.turnNo?previous.count:0)+1;
    history[identity]={turn:ctx.g.turnNo,count};return count;
  }
  M.OracleV22Common={resolveOrdinal};
  M.OracleV20.handlers.push({
    target(game,card,controller,source,node){
      if(node.kind!=='common-current-grave-v22')return undefined;
      const record=card.meta?.oracleGraveEntryV22;
      return card.zone==='graveyard'&&record?.turn===game.turnNo&&record.version===card.zoneVersion&&(node.origin==='battlefield'?record.fromBattlefield:record.discarded||record.cycled);
    },
    compile(operation,script){
      if(operation.kind!=='mana-retention-v22')return false;
      if(!['W','U','B','R','G','C'].includes(operation.color))throw Error('Invalid retained mana color');
      (script.oracleManaRetentionV22||=[]).push(operation.color);return true;
    },
    count(game,source,player,node){
      if(node.kind!=='common-count-v22')return undefined;
      if(node.test==='unspent-mana')return (node.color?[node.color]:['W','U','B','R','G','C']).reduce((sum,color)=>sum+(player.pool[color]||0),0);
      throw Error('Unknown shared v22 count');
    },
    async effect(ctx,effect,h){
      if(effect.action!=='resolved-sequence-v22')return false;
      const ordinal=resolveOrdinal(ctx,effect.abilityKey);
      for(const program of effect.programs)if(program.ordinal===null||program.ordinal===ordinal){
        if(program.optional){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:ctx.src.name+': use the optional effect?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(answer!=='yes')continue;}
        await h.runGenericEffects(ctx,program.effects);
      }
      return true;
    }
  });
})(MTG);
