(function(){
  'use strict';
  const M=globalThis.MTG||(globalThis.MTG={});
  M.OracleV8CastingLimits={
    apply(script,operation){
      if(operation.kind!=='spell-limit-v8')return false;
      if(!['all','you','enchanted-v17'].includes(operation.players)||operation.max!==1||operation.contract!=='spell-limit-v8'||
        operation.qualityV16!==undefined&&!['noncreature','non-Phyrexian','nonartifact'].includes(operation.qualityV16)||Object.keys(operation).some(key=>!['kind','players','max','contract','qualityV16'].includes(key)))throw new Error('Invalid Oracle spell limit');
      (script.oracleSpellLimits||(script.oracleSpellLimits=[])).push(operation);
      return true;
    },
    allowed(game,player,card,options={}){
      const creature=card&&game.castHasType(card,options||{},'Creature');
      const qualifies=limit=>!limit.qualityV16||limit.qualityV16==='noncreature'?!limit.qualityV16||!creature:limit.qualityV16==='nonartifact'?!game.castHasType(card,options,'Artifact'):!game.castSubtypesV16(card,options).includes('Phyrexian')&&!game.castChangelingV16(card,options);
      const count=limit=>!limit.qualityV16?player.turnState.spellsCast||0:limit.qualityV16==='noncreature'?player.turnState.nonCreatureSpells||0:(player.turnState.spellsCastList||[]).filter(row=>limit.qualityV16==='nonartifact'?!row.types?.includes('Artifact'):!row.subtypes?.includes('Phyrexian')&&!row.changeling).length;
      if(game.untilEffects.some(e=>e.kind==='oracleNoCastV9'&&e.players.includes(player)&&(e.quality==='all'||e.quality==='noncreature'&&!creature||e.quality==='creature'&&creature)))return false;
      return !game.bf().some(source=>!source.cur?.abilitiesDisabled&&(source.def.oracleSpellLimits?.some(limit=>
        (limit.players==='all'||limit.players==='enchanted-v17'?limit.players==='all'||source.meta?.cursedPlayer===player:source.ctrl===player)&&qualifies(limit)&&count(limit)>=limit.max)||source.def.oracleCastingProhibitionsV9?.some(rule=>{
          if(rule.players==='you'&&source.ctrl!==player||rule.players==='opponents'&&source.ctrl===player)return false;
          if(rule.fromV12&&!rule.fromV12.some(zone=>zone==='not-hand'?(options?.from||card.zone)!=='hand':zone===(options?.from||card.zone)))return false;
          if(rule.matchesV12&&!rule.matchesV12(game,source,player,card,options))return false;
          if(rule.quality==='creature'&&!creature)return false;
          if(rule.window==='other-turn')return game.turnPlayer!==player;
          if(rule.window==='source-turn')return game.turnPlayer===source.ctrl;
          if(rule.window==='combat')return game.phase==='combat';
          if(rule.window==='non-sorcery')return game.turnPlayer!==player||!['main1','main2'].includes(game.phase)||game.stack.length>0;
          return true;
        })));
    },
    condition(game,source,condition,player){
      if(condition.kind==='casting-spell-history-v8'){
        if(condition.players!=='you'||!['W','U','B','R','G'].includes(condition.color)||
          Object.keys(condition).some(key=>!['kind','players','color'].includes(key)))throw new Error('Invalid Oracle casting history');
        return (player.turnState.spellsCastList||[]).some(row=>row.colors?.includes(condition.color));
      }
      if(condition.kind!=='casting-window-v8'||!['attackers','blockers','after-blockers','before-damage','combat','turn'].includes(condition.window)||
        condition.turn!==undefined&&!['you','opponent'].includes(condition.turn)||
        condition.attacked!==undefined&&(condition.attacked!==true||condition.window!=='attackers')||
        Object.keys(condition).some(key=>!['kind','window','turn','attacked'].includes(key)))throw new Error('Invalid Oracle casting window');
      if(condition.turn==='you'&&game.turnPlayer!==player||condition.turn==='opponent'&&!player.opponents(game).includes(game.turnPlayer))return false;
      const inCombat=game.phase==='combat',state=game.turnPlayer?.turnState||{};
      if(condition.window==='turn')return true;
      if(condition.window==='combat')return inCombat;
      if(condition.window==='attackers')return inCombat&&game.step==='attackers'&&
        (!condition.attacked||game.combat?.declaredAttackTargets?.includes(player));
      if(condition.window==='blockers')return inCombat&&game.step==='blockers';
      if(condition.window==='after-blockers')return inCombat&&game.combat?.blockersDeclared===true;
      // CR 506.7d/e: the deadline is the first combat's first damage step,
      // or the end of its attackers step if blockers/damage were skipped.
      return !state.reachedCombatDamageDeadline&&(state.combatPhaseCount||0)<=1&&
        (inCombat&&['begin','attackers','blockers'].includes(game.step)||
          !(state.combatPhaseCount||0)&&['untap','upkeep','draw','main1'].includes(game.phase));
    },
  };
})();
