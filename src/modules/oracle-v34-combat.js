(function(){
  'use strict';
  const M=globalThis.MTG,H=M.OracleV20.helpers;
  const blocked=(g,s)=>(g.combat?.attackers||[]).filter(a=>a.blockedBy?.includes(s));
  function matches(g,s,d,test){
    if(test==='highest-life-defender')return d.card===s&&d.defender instanceof M.Player&&d.defender.life===Math.max(...g.alivePlayers().map(p=>p.life));
    if(test==='different-players')return g.combat?.attackers.includes(s)&&s.attacking instanceof M.Player&&g.combat.attackers.some(a=>a!==s&&a.attacking instanceof M.Player&&a.attacking!==s.attacking);
    if(test==='blocked-two')return blocked(g,s).length>=2;
    if(test==='blocked-black')return blocked(g,s).some(a=>a.colors.includes('B'));
    if(test==='black-red-attacker')return d.attacker?.colors.some(color=>color==='B'||color==='R');
    throw Error('Unknown combat test: '+test);
  }
  M.OracleV20.handlers.unshift({
    targetHint(op,target,index){
      if(op.action==='require-block-v34')return {goal:op.target===index?'debuff':'buff'};
    },
    compile(op,script,entry,h){
      if(op.kind!=='generic-trigger'||!(op.combatTestV34||op.eventFilter?.kind==='combat-event-v34'))return false;
      const t=h.compileGenericTrigger(op.combatTestV34?op:{...op,eventFilter:'each-upkeep'}),base=t.filter;
      t.filter=(g,s,d)=>base(g,s,d)&&matches(g,s,d,op.combatTestV34||op.eventFilter.test);
      h.triggers.push(t);return true;
    },
    target(g,c,you,s,predicate){
      if(predicate.kind!=='defending-player-v34')return undefined;
      return (g.combat?.attackers||[]).some(a=>(a.attacking instanceof M.Player?a.attacking:a.attacking?.ctrl)===c.ctrl);
    },
    async effect(ctx,op){
      if(op.action==='require-block-v34'){
        const blockers=H.genericEffectSubjects(ctx,op.target),attackers=H.genericEffectSubjects(ctx,op.otherTarget);
        for(const attacker of attackers)if(attacker.zone==='battlefield'&&attacker.is('Creature'))
          await H.runGenericEffect({...ctx,src:attacker,sourceZoneVersion:attacker.zoneVersion,targets:[blockers]},
            {action:'combat-restriction',target:0,duration:op.duration,restriction:{combatRule:{kind:'source-block',mode:'require'}}});
        return true;
      }
      if(op.action==='other-blockers-v34'){
        for(const chosen of H.genericEffectSubjects(ctx,op.target))if(chosen.zone==='battlefield')
          await H.runGenericEffect({...ctx,targets:[ctx.g.creatures(chosen.ctrl).filter(c=>c!==chosen)]},{action:'cant-block-until-eot',target:0});
        return true;
      }
      if(op.action==='combat-cohort-library-v34'){
        if(H.sameBattlefieldSource(ctx)){
          const cohort=[...new Set([ctx.src,...(ctx.src.blockedBy||[]),...blocked(ctx.g,ctx.src)])].filter(c=>c.zone==='battlefield');
          await H.runGenericEffect({...ctx,targets:[cohort]},{action:'move-to-library',target:0,shuffleAfter:true});
        }
        return true;
      }
      return false;
    },
  });
})();
