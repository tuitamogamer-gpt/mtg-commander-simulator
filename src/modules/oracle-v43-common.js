'use strict';
((M)=>{
  const H=M.OracleV20.helpers,G=M.Game.prototype;
  const sources=(g,p,mode)=>g.bf().filter(c=>c.ctrl===p&&!c.cur.abilitiesDisabled&&c.def.oracleRulesV43?.includes(mode));
  const rested=(c)=>{const r=c.meta.oracleAttacksByPlayerV43?.[c.ctrl.idx];return r?.version===c.zoneVersion&&r.ownTurn===c.ctrl.turnsStarted-1;};
  const record=G.recordCombatObjectEvent;G.recordCombatObjectEvent=function(c,event){if(event==='attacks'&&c.ctrl===this.turnPlayer)(c.meta.oracleAttacksByPlayerV43 ||= {})[c.ctrl.idx]={version:c.zoneVersion,ownTurn:c.ctrl.turnsStarted};return record.call(this,c,event);};
  const timing=G.canCastTiming;G.canCastTiming=function(p,c,a){if((a?.from||c.zone)==='hand'&&sources(this,p,'no-hand-plays').length)return false;return timing.call(this,p,c,a);};
  const lands=G.playableLands;G.playableLands=function(p){const result=lands.call(this,p);return sources(this,p,'no-hand-plays').length?result.filter(c=>c.zone!=='hand'):result;};
  const scry=M.E.scry;M.E.scry=async function(g,p,n){
    if(n<=0)return scry(g,p,n);
    let remaining=g.bf().filter(c=>c.ctrl===p&&!c.cur.abilitiesDisabled&&c.def.oracleRulesV43?.some(k=>['scry-draw','scry-extra'].includes(k)));
    while(remaining.length){
      let c=remaining[0];if(remaining.length>1){const key=await p.controller.decide(g,{type:'chooseOption',prompt:'Choose a scry replacement',options:remaining.map(c=>({key:String(c.iid),label:c.name})),aiHint:{kind:'replacement'}});c=remaining.find(c=>String(c.iid)===key);if(!c)throw Error('Invalid scry replacement');}
      remaining=remaining.filter(other=>other!==c);
      if(c.def.oracleRulesV43.includes('scry-draw'))return g.draw(p,n);
      n++;
    }return scry(g,p,n);
  };
  M.OracleV20.handlers.push({
    compile(op,script,entry,h){
      if(op.kind==='face-up-counters-v43'){const prior=script.asTurnFaceUp;script.asTurnFaceUp=async(g,c)=>{if(prior)await prior(g,c);g.addCounters(c,'+1/+1',op.n,false,c.ctrl);};return true;}
      if(op.kind!=='common-rule-v43')return false;
      if(['no-hand-plays','scry-draw','scry-extra'].includes(op.mode)){(script.oracleRulesV43 ||= []).push(op.mode);return true;}
      if(op.mode==='clue-types'){h.statics.push({phase:1,apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Artifact')&&!c.hasSub('Clue'))c.cur.subtypes.push('Clue');}});return true;}
      if(op.mode==='tapped-blockers'){h.statics.push({apply:(g,s,bf)=>{for(const c of bf)if(c.ctrl===s.ctrl&&c.is('Creature'))c.cur.tappedCanBlockV43=true;}});return true;}
      if(op.mode==='common-color'){h.statics.push({apply:(g,s,bf)=>{const affected=bf.filter(c=>c.is('Creature')&&!c.is('Artifact'));if(['W','U','B','R','G'].some(color=>affected.every(c=>c.colors.includes(color))))for(const c of affected){c.cur.power+=2;c.cur.toughness+=2;}}});return true;}
      if(['rest-self','rest-all'].includes(op.mode)){h.statics.push({apply:(g,s,bf)=>{for(const c of op.mode==='rest-self'?[s]:bf)if(c.is('Creature')&&rested(c))c.cur.cantAttack=true;}});return true;}
      throw Error('Unknown v43 rule '+op.mode);
    },
    condition(g,s,c,p){
      if(c.kind==='first-three-own-turns-v43')return g.turnPlayer===p&&p.turnsStarted>=1&&p.turnsStarted<=3;
      if(c.kind==='being-attacked-v43')return g.bf().some(c=>c.is('Creature')&&c.attacking===p);
      if(c.kind==='has-defender-v43')return s.kw('defender');
    },
    target(g,c,p,s,q){if(q.kind==='creature-aura-v43'){const d=(c.card||c).def;return !!d.auraTarget?.length&&/(?:^|\n)Enchant [^\n.]*\bcreature\b/i.test(d.oracle||'');}},
    targetHint(e){if(e.action==='common-effects-v43')return {goal:'destroy'};},
    async effect(ctx,e){
      if(e.action!=='common-effects-v43')return false;
      if(e.mode!=='destroy-other-died')throw Error('Unknown v43 effect '+e.mode);
      const targets=H.genericEffectSubjects(ctx,e.target),identities=targets.map(c=>({iid:c.iid,version:c.zoneVersion}));
      await ctx.g.destroyMany(targets);
      if(ctx.g.diedThisTurn.some(c=>c.types.includes('Creature')&&!identities.some(r=>r.iid===c.iid&&r.version===c.zoneVersion)))await ctx.g.draw(ctx.you,1);
      return true;
    }
  });
})(globalThis.MTG ||= {});
