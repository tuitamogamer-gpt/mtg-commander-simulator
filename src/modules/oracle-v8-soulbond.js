((M)=>{
  const physical=(game,iid)=>game.battlefield.find(card=>card.iid===iid&&card.zone==='battlefield');
  const live=(game,card)=>card instanceof M.CardInst&&card.zone==='battlefield'&&!card.phasedOut&&game.bf().includes(card)&&card.is('Creature');
  function partner(game,card){
    const link=card.meta.oracleSoulbond;if(!link)return null;
    const other=physical(game,link.iid),back=other?.meta.oracleSoulbond;
    return other&&other!==card&&!card.phasedOut&&!other.phasedOut&&(card.meta.oraclePhaseEpoch||0)===link.selfPhaseEpoch&&(other.meta.oraclePhaseEpoch||0)===link.phaseEpoch&&card.zone==='battlefield'&&card.zoneVersion===link.selfVersion&&other.zoneVersion===link.version&&
      card.ctrl.idx===link.controller&&other.ctrl===card.ctrl&&card.is('Creature')&&other.is('Creature')&&
      back?.iid===card.iid&&back.version===card.zoneVersion&&back.selfVersion===other.zoneVersion&&back.controller===link.controller?other:null;
  }
  function observe(game){
    // The resolved pair lasts 'for as long as' both creatures remain.
    // Phasing ends this duration (702.95a, 702.26f), even without a zone change.
    for(const card of game.battlefield)if(card.meta.oracleSoulbond&&!partner(game,card))delete card.meta.oracleSoulbond;
  }
  function unpaired(game,card,player){return live(game,card)&&card.ctrl===player&&!partner(game,card);}
  function candidate(game,source,data,selfEntry){
    if(!unpaired(game,source,source.ctrl))return false;
    return selfEntry?data.card===source&&game.creatures(source.ctrl).some(card=>card!==source&&unpaired(game,card,source.ctrl)):
      data.card!==source&&unpaired(game,data.card,source.ctrl);
  }
  function trigger(selfEntry){return {
    on:'etb',desc:selfEntry?'Soulbond: pair this creature':'Soulbond: pair the entering creature',
    filter:(game,source,data)=>{if(!candidate(game,source,data,selfEntry))return false;data.oracleSoulbondEntry||={iid:data.card.iid,version:data.card.zoneVersion};return true;},
    run:async ctx=>{
      const game=ctx.g,source=ctx.src,player=ctx.you;
      if(source.zoneVersion!==ctx.sourceZoneVersion||!unpaired(game,source,player))return;
      const visitor=physical(game,ctx.data.oracleSoulbondEntry.iid);
      const from=selfEntry?game.creatures(player).filter(card=>card!==source&&unpaired(game,card,player)):
        visitor?.zoneVersion===ctx.data.oracleSoulbondEntry.version&&unpaired(game,visitor,player)?[visitor]:[];
      if(!from.length)return;
      const versions=new Map(from.map(card=>[card,card.zoneVersion]));
      const chosen=await player.controller.decide(game,{type:'chooseCards',from,min:0,max:1,prompt:source.name+': pair with another creature?',aiHint:{kind:'bestCard',source}});
      const other=Array.isArray(chosen)&&chosen.length===1&&from.includes(chosen[0])?chosen[0]:null;
      if(!other||source.zoneVersion!==ctx.sourceZoneVersion||other.zoneVersion!==versions.get(other)||!unpaired(game,source,player)||!unpaired(game,other,player))return;
      source.meta.oracleSoulbond={iid:other.iid,version:other.zoneVersion,selfVersion:source.zoneVersion,controller:player.idx,phaseEpoch:other.meta.oraclePhaseEpoch||0,selfPhaseEpoch:source.meta.oraclePhaseEpoch||0};
      other.meta.oracleSoulbond={iid:source.iid,version:source.zoneVersion,selfVersion:other.zoneVersion,controller:player.idx,phaseEpoch:source.meta.oraclePhaseEpoch||0,selfPhaseEpoch:other.meta.oraclePhaseEpoch||0};
      game.recalc();game.lg(source.name+' pairs with '+other.name+'.');
    },
  };}
  function compile(operation,h){
    if(operation.contract!=='soulbond-pairing')throw Error('Invalid soulbond contract');
    if(operation.kind==='soulbond-v8'&&Object.keys(operation).every(key=>['kind','contract'].includes(key)))return {triggers:[trigger(true),trigger(false)]};
    if(operation.kind!=='soulbond-grant-v8'||Object.keys(operation).some(key=>!['kind','operation','contract'].includes(key))||operation.operation?.kind!=='generic-static'||operation.operation.scope!=='self'||operation.operation.contract!=='generic-continuous-effect')throw Error('Invalid soulbond descriptor');
    const child=operation.operation,keys=Object.keys(child);
    if(keys.some(key=>!['kind','scope','contract','keywords','power','toughness','protectionQualities','grantedOperation'].includes(key)))throw Error('Invalid paired grant');
    const compiled=h.static(child);
    return {static:{oracleOperation:operation,apply(game,source,bf){const other=partner(game,source);if(other)for(const card of [source,other])if(bf.includes(card))compiled.apply(game,card,[card]);}}};
  }
  M.OracleV8Soulbond={compile,partner,observe};
})(globalThis.MTG||={});
