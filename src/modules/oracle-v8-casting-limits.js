(function(){
  'use strict';
  const M=globalThis.MTG||(globalThis.MTG={});
  M.OracleV8CastingLimits={
    apply(script,operation){
      if(operation.kind!=='spell-limit-v8')return false;
      if(!['all','you'].includes(operation.players)||operation.max!==1||operation.contract!=='spell-limit-v8'||
        Object.keys(operation).some(key=>!['kind','players','max','contract'].includes(key)))throw new Error('Invalid Oracle spell limit');
      (script.oracleSpellLimits||(script.oracleSpellLimits=[])).push(operation);
      return true;
    },
    allowed(game,player){
      return !game.bf().some(source=>!source.cur?.abilitiesDisabled&&source.def.oracleSpellLimits?.some(limit=>
        (limit.players==='all'||source.ctrl===player)&&(player.turnState.spellsCast||0)>=limit.max));
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
