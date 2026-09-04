(function(){
 'use strict';const MTG=globalThis.MTG;
 function install(script,operation){
  if(script.gyAbility||operation.kind!=='mechanic-encore-v8'||operation.contract!=='mechanic-encore-v8'||!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(operation.cost)||Object.keys(operation).some(key=>!['kind','contract','cost'].includes(key)))throw Error('Invalid Encore');
  script.oracleEncore=true;
  script.gyAbility={label:'Encore '+operation.cost,cost:operation.cost,sorcery:true,oracleEncore:true,
   run:async ctx=>{
    const definition=ctx.oracleEncoreSourceDefinition;if(!definition)throw Error('Encore lost its source definition');
    const opponents=ctx.g.players.filter(player=>player!==ctx.you&&!player.lost),made=[];
    await ctx.g.withBattlefieldEntryBatch(async()=>{
     for(const opponent of opponents){
      const copies=await ctx.g.makeTokens(definition,ctx.you,{n:1,copyOf:definition});
      for(const token of copies){token.meta.oracleHaste=true;
       ctx.g.untilEffects.push({kind:'oracleEncoreAttack',iid:token.iid,version:token.zoneVersion,timestamp:token.timestamp,turn:ctx.g.turnNo,targetPlayer:opponent,expires:'eot'});
       made.push({iid:token.iid,version:token.zoneVersion,timestamp:token.timestamp,opponent:opponent.idx});
      }
     }
     ctx.g.recalc();
    });
    ctx.oracleEncoreTokens=made;
    if(made.length)ctx.g.delayed.push({on:'endStep',name:'Encore sacrifice',ctrl:ctx.you,
     run:async delayed=>{
      const cards=made.map(lock=>({lock,card:delayed.g.byIid(lock.iid)})).filter(({lock,card})=>card&&card.zone==='battlefield'&&card.zoneVersion===lock.version&&card.timestamp===lock.timestamp&&card.ctrl===delayed.you).map(({card})=>card);
      if(cards.length)await delayed.g.sacrificeMany(delayed.you,cards);
     }});
   }};
 }
 function requirements(game,card){return game.untilEffects.filter(effect=>effect.kind==='oracleEncoreAttack'&&effect.iid===card.iid&&effect.version===card.zoneVersion&&effect.timestamp===card.timestamp&&effect.turn===game.turnNo&&!effect.targetPlayer.lost);}
 const taxed=(game,player)=>game.bf().some(card=>card.ctrl===player&&card.def.attackTax>0);
 function declarationTargets(game,card,targets){
  const encore=requirements(game,card);if(!encore.length)return null;
  const goaders=[...new Set(game.goadersOf(card).filter(player=>player!==card.ctrl&&!player.lost))];
  const otherRequirements=game.untilEffects.filter(effect=>((effect.kind==='mustAttack'&&effect.who===card.ctrl)||(effect.kind==='goadCard'&&effect.iid===card.iid))&&effect.notPlayer).map(effect=>effect.notPlayer);
  for(const player of otherRequirements)if(!goaders.includes(player))goaders.push(player);
  // CR 508.1d: maximize requirements, while choosing to pay an attack tax is
  // optional. Retain every maximum in either the paid or unpaid tax case.
  const score=(target,includeTaxed)=>goaders.reduce((n,player)=>n+(target instanceof MTG.Player&&target!==player?1:0),0)+encore.reduce((n,rule)=>n+(target===rule.targetPlayer&&(includeTaxed||!taxed(game,rule.targetPlayer))?1:0),0);
  const maxPaid=Math.max(0,...targets.map(target=>score(target,true))),maxFree=Math.max(0,...targets.map(target=>score(target,false)));
  return targets.filter(target=>score(target,true)===maxPaid||score(target,false)===maxFree);
 }
 function forced(game,card){return requirements(game,card).some(rule=>!taxed(game,rule.targetPlayer)&&game.canAttackTarget(card,rule.targetPlayer));}
 MTG.OracleV8Encore={install,declarationTargets,forced};
})();
