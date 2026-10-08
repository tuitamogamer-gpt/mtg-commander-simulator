'use strict';
((M)=>{
 const G=M.Game.prototype,H=M.OracleV20.helpers;
 const sources=(g,mode)=>g.bf().filter(c=>!c.cur.abilitiesDisabled&&c.def.commonRulesV47?.includes(mode));
 const silenced=g=>g.phase==='combat'&&sources(g,'combat-silence').length>0;
 const special=e=>!!(e.turnFaceUp||e.oracleLicidEndV24||e.foretell||e.plot||e.suspend||e.oracleUnlockRoomV20||e.bdfUnlock);
 const split=G.hasSplitSecond;G.hasSplitSecond=function(){return split.call(this)||this.stack.some(so=>so.kind==='spell'&&this.isInstantSorcerySpell(so)&&sources(this,'split-second').some(c=>c.ctrl===so.ctrl));};
 const timing=G.canCastTiming;G.canCastTiming=function(...args){return !silenced(this)&&timing.apply(this,args);};
 const cast=G.castSpell;G.castSpell=async function(...args){return silenced(this)?false:cast.apply(this,args);};
 const list=G.activatableList;G.activatableList=function(...args){const rows=list.apply(this,args);return silenced(this)?rows.filter(r=>r.manaAbility||special(r)):rows;};
 const activate=G.activateAbility;G.activateAbility=async function(p,e,...args){return silenced(this)&&!e.manaAbility&&!special(e)?false:activate.call(this,p,e,...args);};
 M.OracleV20.handlers.push({
  count(g,s,p,v){if(v.kind==='sevens-in-graveyard-v47')return Math.floor(p.graveyard.length/7);},
  compile(op,script,entry,h){
   if(op.kind==='common-rule-v47'){(script.commonRulesV47 ||= []).push(op.mode);return true;}
   if(op.kind!=='generic-trigger'||!op.eventTestV47)return false;
   const t=h.compileGenericTrigger(op),filter=t.filter;
   t.filter=(g,s,d)=>{if(!filter(g,s,d))return false;if(op.eventTestV47==='attacks-player')return (d.defender||d.attackers?.[0]?.attacking) instanceof M.Player;const targets=(d.so?.targets||[]).flat(Infinity).filter(Boolean);if(op.eventTestV47==='opponent-target')return targets.some(c=>c instanceof M.Player?c!==s.ctrl:c.zone==='battlefield'&&c.is?.('Creature')&&c.ctrl!==s.ctrl);if(op.eventTestV47==='equipment-or-own-target')return g.castSubtypesV16(d.card,d.so.castOpts||{}).includes('Equipment')||targets.some(c=>c.zone==='battlefield'&&c.is?.('Creature')&&c.ctrl===s.ctrl);throw Error('Unknown v47 event '+op.eventTestV47);};h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v47')return {goal:e.mode==='destroy-nonattacker'?'destroy':'damage'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v47')return false;const g=ctx.g,c=H.genericEffectSubjects(ctx,e.target)[0];if(!c)return true;
   if(e.mode==='destroy-nonattacker'){const ctrl=c.ctrl,attacking=!!c.attacking;await g.destroy(c);if(!attacking)await g.draw(ctrl,1);return true;}
   if(e.mode==='loyalty-damage'){const src=H.genericEffectSubjects(ctx,e.source)[0];if(src)await g.damageBatch([{src,target:c,n:src.counters.loyalty||0}],{deferSBA:true});return true;}
   throw Error('Unknown v47 effect '+e.mode);
  }
 });
})(globalThis.MTG ||= {});
