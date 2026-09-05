(function(MTG){
  MTG.OracleV8ActivationSuffixes={condition(game,source,rule,player){
    if(rule?.kind!=='activation-state-v8')return undefined;
    const fields=rule.test==='same-name-lands'?['min']:[];
    if(Object.keys(rule).some(key=>!['kind','test',...fields].includes(key)))throw new Error('Invalid activation-state field');
    switch(rule.test){
      case 'end-combat':return game.phase==='combat'&&game.step==='endCombat';
      case 'any-upkeep':return game.phase==='upkeep';
      case 'opponent-upkeep':return game.phase==='upkeep'&&player.opponents(game).includes(game.turnPlayer);
      case 'source-blocked':return source.zone==='battlefield'&&!!source.attacking&&!!source.wasBlocked;
      case 'opponent-damaged':return player.opponents(game).some(opponent=>opponent.turnState.damageTaken>0);
      case 'attacking-modified':return game.creatures(player).some(card=>card.attacking&&game.isModifiedCreature(card));
      case 'same-name-lands':{
        if(!Number.isSafeInteger(rule.min)||rule.min<1)throw new Error('Invalid same-name land threshold');
        const counts=new Map();for(const card of game.bf())if(card.ctrl===player&&card.is('Land')){
          const name=card.name;counts.set(name,(counts.get(name)||0)+1);if(counts.get(name)>=rule.min)return true;
        }return false;
      }
      default:throw new Error('Unknown activation-state condition');
    }
  }};
})(MTG);
