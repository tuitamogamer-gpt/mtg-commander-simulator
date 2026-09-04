(function(){
  'use strict';
  const MTG=globalThis.MTG||(globalThis.MTG={});
  const players=(game,player,scope)=>scope==='you'?[player]:game.alivePlayers().filter(other=>scope==='all'||other!==player);
  const turnValue=(player,field)=>field==='creatureEntries'?(player.turnState.permanentEntries||[]).filter(row=>row.creature).length:Math.max(0,Number(player.turnState[field])||0);
  MTG.OracleV8CastingRules={
    condition(game,source,condition,player){
      if(condition.kind==='casting-opponent-upkeep-v8')return game.turnPlayer!==player&&game.phase==='upkeep';
      if(condition.kind!=='casting-turn-stat-v8')throw new Error('Unknown Oracle casting condition');
      if(!['spellsCast','drewThisTurn','lifeGained','creatureEntries','landsEntered'].includes(condition.field)||
        !['you','opponents'].includes(condition.players)||!Number.isSafeInteger(condition.min)||condition.min<0)
        throw new Error('Invalid Oracle casting turn condition');
      return players(game,player,condition.players).some(other=>turnValue(other,condition.field)>=condition.min);
    },
    count(game,source,player,node){
      if(node.kind==='casting-turn-count-v8'){
        if(!['spellsCast','damageTaken'].includes(node.field)||!['you','opponents','all'].includes(node.players)||
          node.distinct!==undefined&&node.distinct!==true)throw new Error('Invalid Oracle casting turn count');
        return players(game,player,node.players).reduce((sum,other)=>sum+(node.distinct?Number(turnValue(other,node.field)>0):turnValue(other,node.field)),0);
      }
      if(node.kind!=='casting-live-count-v8')throw new Error('Unknown Oracle casting count');
      if(node.what==='modified-creatures')return game.creatures(player).filter(card=>game.isModifiedCreature(card)).length;
      if(node.what==='land-names')return new Set(game.lands(player).map(card=>card.name)).size;
      if(node.what==='creature-types')return [...MTG.CREATURE_SUBTYPES].filter(type=>game.creatures(player).some(card=>card.hasSub(type))).length;
      if(node.what==='own-exile-grave-spells-adventures')return [...player.exile,...player.graveyard].filter(card=>
        card.is('Instant')||card.is('Sorcery')||!!card.def.adventure).length;
      throw new Error('Unknown Oracle casting live count');
    },
  };
})();
