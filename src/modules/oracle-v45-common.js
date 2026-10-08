'use strict';
((M)=>{
  const H=M.OracleV20.helpers;
  function token(){return {name:'Jace',cost:'',super:[],types:['Planeswalker'],subtypes:['Jace'],colorsOverride:['U'],loyalty:'0',kws:[],oracle:'−1: Surveil 1.\n−3: Draw a card.',abilities:[
    H.compileGenericAbility({kind:'generic-ability',cost:{},loyalty:-1,sorceryOnly:true,targets:[],effects:[{action:'surveil',who:'you',n:1}],optional:false}),
    H.compileGenericAbility({kind:'generic-ability',cost:{},loyalty:-3,sorceryOnly:true,targets:[],effects:[{action:'draw',who:'you',n:1}],optional:false})]};}
  M.OracleV20.handlers.push({
    compile(op,script,entry,h){
      if(op.kind==='zero-loyalty-v45'){h.statics.push({apply:(g,s)=>{for(const c of g.bf())if(c.ctrl===s.ctrl&&c.is('Planeswalker'))c.cur.zeroLoyaltySurvivesV45=true;}});return true;}
      if(op.kind==='generic-trigger'&&op.loyaltyPaidV45){const t=h.compileGenericTrigger(op),filter=t.filter;t.filter=(g,s,d)=>filter(g,s,d)&&(d.ability.loyalty==='-X'?d.stackObject.ctx.x:-d.ability.loyalty)>=op.loyaltyPaidV45;h.triggers.push(t);return true;}
      return false;
    },
    targetHint(e){if(e.action==='empower-jace-v45')return {goal:'pump'};},
    async effect(ctx,e){
      if(e.action==='jace-timing-v45'){ctx.you.turnState.jaceTimingV45=ctx.g.turnNo;return true;}
      if(e.action==='exile-empower-v45'){
        const rows=ctx.g.bf().filter(c=>c.is('Creature')).map(c=>({card:c,version:c.zoneVersion}));await ctx.g.exileMany(rows.map(r=>r.card));
        await H.runGenericEffect(ctx,{action:'empower-jace-v45',n:rows.filter(r=>r.card.zone==='exile'&&r.card.zoneVersion===r.version+1).length});return true;
      }
      if(e.action==='damage-empower-v45'){
        const c=H.genericEffectSubjects(ctx,e.target)[0];if(!c)return true;const src=H.oracleDamageSource(ctx),damageResults=[];
        await ctx.g.damageBatch([{src,target:c,n:e.n}],{deferSBA:true,damageResults});const excess=damageResults.filter(r=>r.target===c).reduce((n,r)=>n+r.excess,0);
        if(excess)await H.runGenericEffect(ctx,{action:'empower-jace-v45',n:excess});return true;
      }
      if(e.action!=='empower-jace-v45')return false;
      const g=ctx.g,n=H.genericAmount(e.n,ctx),eligible=()=>g.bf().filter(c=>c.ctrl===ctx.you&&c.isToken&&c.hasSub('Jace'));
      if(!eligible().length)await g.makeTokens(token(),ctx.you);
      const from=eligible();if(!from.length)return true;
      let picked=from;
      if(from.length>1)picked=await ctx.you.controller.decide(g,{type:'chooseCards',from,min:1,max:1,prompt:'Empower Jace: choose a Jace token',aiHint:{kind:'counter',counter:'loyalty',n}});
      if(!Array.isArray(picked)||picked.length!==1||!from.includes(picked[0]))throw Error('Invalid empower Jace choice');
      g.addCounters(picked[0],'loyalty',n,false,ctx.you);return true;
    }
  });
})(globalThis.MTG ||= {});
