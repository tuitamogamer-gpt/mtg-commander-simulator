'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  function artifactView(g,d){const version=d.sourceZoneVersionV44??d.stackObject?.ctx?.sourceZoneVersion;if(version!==undefined&&(d.card.zone!=='battlefield'||d.card.zoneVersion!==version))return d.card.battlefieldLKI?.get(version)||d.sourceSnapshotV44;return d.card;}
  function artifactMatches(g,s,d,op){
    const c=artifactView(g,d);if(!c||(c.is? !c.is('Artifact'):!c.types?.includes('Artifact')))return false;
    if(op.event==='abilityActivated'&&(!d.ability||d.ability.cost?.tap))return false;
    if(op.who==='enchanted'&&s.attachedTo!==d.card.iid)return false;
    return op.who!=='opponent'||(op.event==='abilityActivated'?d.player:c.ctrl)!==s.ctrl;
  }
  const phase=G.phaseOutMany;G.phaseOutMany=function(...args){
    const candidates=this.bf().filter(c=>!c.cur.abilitiesDisabled&&c.def.oraclePhaseOutTriggersV44?.length).map(c=>({card:c,ctrl:c.ctrl,snap:this.snapshot(c),triggers:c.def.oraclePhaseOutTriggersV44}));
    const result=phase.apply(this,args);
    for(const row of candidates)if(result.includes(row.card))for(const t of row.triggers){const data={card:row.card,player:row.ctrl,snap:row.snap};if(!t.filter||t.filter(this,row.card,data))this.queueTrigger({src:row.card,ctrl:row.ctrl,name:row.card.name+' — phases out',run:t.run,targets:t.targets,modes:t.modes,prepareTargets:t.prepareTargets,opt:t.opt,data});}
    return result;
  };
  M.OracleV20.handlers.push({
    condition(g,s,c){if(c.kind==='empty-hand-player-v44')return g.alivePlayers().some(p=>p.hand.length===0);},
    compile(op,script,entry,h){
      if(op.kind!=='generic-trigger')return false;
      if(op.event==='oraclePhasedOutV44'){(script.oraclePhaseOutTriggersV44 ||= []).push(h.compileGenericTrigger(op));return true;}
      if(!op.eventTestV44&&!op.artifactEventV44)return false;
      const t=h.compileGenericTrigger(op),filter=t.filter,run=t.run,captures=new WeakMap();
      t.filter=(g,s,d)=>{
        if(!filter(g,s,d))return false;
        if(op.eventTestV44==='nonbasic-land'&&d.card.cur.super.includes('Basic'))return false;
        if(op.eventTestV44==='attacking-power-twelve'&&(d.attackers||[]).reduce((n,c)=>n+c.power,0)<12)return false;
        if(op.eventTestV44==='same-source-version'&&s.zoneVersion!==d.sourceZoneVersionV44)return false;
        if(op.artifactEventV44){if(!artifactMatches(g,s,d,op.artifactEventV44))return false;let rows=captures.get(d);if(!rows){rows=new Map();captures.set(d,rows);}rows.set(s.iid,artifactView(g,d).ctrl);}
        return true;
      };
      t.run=ctx=>{ctx.artifactControllerV44=captures.get(ctx.data)?.get(ctx.src.iid);return run(ctx);};h.triggers.push(t);return true;
    },
    targetHint(e){if(e.action==='common-effects-v44')return {goal:e.mode==='delayed-control'?'steal':'damage'};},
    async effect(ctx,e){
      if(e.action!=='common-effects-v44')return false;
      const g=ctx.g;
      if(e.mode==='artifact-controller-damage'){if(!ctx.artifactControllerV44)throw Error('Missing activated source controller');await g.damageBatch([{src:H.oracleDamageSource(ctx),target:ctx.artifactControllerV44,n:e.n}],{deferSBA:true});return true;}
      if(e.mode==='opponent-draw-up-to-three'){
        for(const p of g.apnapFrom(g.turnPlayer||ctx.you).filter(p=>p!==ctx.you&&!p.lost)){const answer=await p.controller.decide(g,{type:'chooseOption',prompt:ctx.src.name+': draw up to three cards',options:[0,1,2,3].map(n=>({key:String(n),label:'Draw '+n})),aiHint:{kind:'draw'}});if(!['0','1','2','3'].includes(answer))throw Error('Invalid draw count');if(Number(answer))await g.draw(p,Number(answer));}return true;
      }
      if(e.mode==='delayed-control'){
        const rows=H.genericEffectSubjects(ctx,e.target).map(card=>({card,version:card.zoneVersion}));if(rows.length)g.delayed.push({on:'endCombat',once:true,src:ctx.src,ctrl:ctx.you,name:ctx.src.name+' — gain control',run:async later=>{for(const row of rows)if(row.card.zone==='battlefield'&&row.card.zoneVersion===row.version)M.OracleV8Control.gain(later.g,row.card,later.you,{temporary:false});later.g.recalc();}});return true;
      }
      throw Error('Unknown v44 effect '+e.mode);
    }
  });
})(globalThis.MTG ||= {});
