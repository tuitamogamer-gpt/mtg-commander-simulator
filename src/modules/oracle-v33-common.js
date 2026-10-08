(function(){
  'use strict';
  const M=globalThis.MTG,H=M.OracleV20.helpers;
  M.OracleV20.handlers.unshift({
    compile(op,script,entry,h){
      if(op.kind==='generic-ability'&&op.outlastV33){h.abilities.push({...h.compileGenericAbility(op),outlast:true});return true;}
      if(op.kind==='generic-trigger'&&op.eventFilter?.kind==='event-v33'){
        const t=h.compileGenericTrigger({...op,eventFilter:'each-upkeep'}),base=t.filter;
        t.filter=(g,s,d)=>base(g,s,d)&&(op.eventFilter.test==='you-collected-evidence'?d.player===s.ctrl:
          op.eventFilter.test==='self-blocked'?g.combat?.attackers.some(c=>c.blockedBy?.includes(s)):false);
        h.triggers.push(t);return true;
      }
      return false;
    },
    async effect(ctx,op){
      if(op.action==='collect-evidence-v33'){
        const cost={additionalCostV20:{kind:'evidence',n:op.n}},C=M.OracleV20Costs;
        if(!C.activationFeasible(ctx.g,ctx.you,ctx.src,cost))return true;
        if(op.optional){const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Collect evidence '+op.n},{key:'no',label:'Decline'}],prompt:ctx.src.name+': collect evidence?',aiHint:{kind:'optionalEffect',benefit:2}});if(answer!=='yes')return true;}
        const payment={...ctx};
        if(await C.prepareActivation(payment,cost))await C.commitActivation(payment,cost);
        return true;
      }
      if(op.action==='combat-player-land-mana-v33'){
        const player=ctx.data.player;if(!(player instanceof M.Player))throw Error('Missing combat-damage player');
        const lands=ctx.g.lands(player).slice(),own=ctx.g.lands(ctx.you).slice();
        await H.runGenericEffects({...ctx,targets:[lands,own]},[{action:'tap',target:0},{action:'untap',target:1}]);
        return true;
      }
      return false;
    },
  });
})();
