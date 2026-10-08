'use strict';
((M)=>{
 const H=M.OracleV20.helpers,G=M.Game.prototype;
 const emit=G.emit;G.emit=async function(event,data,...args){
  if(event==='upkeep')this.untilEffects=this.untilEffects.filter(e=>e.kind!=='phase-protection-v46'||e.player!==data.player);
  if(event==='diceRolled'){for(const value of data.results){const ordinal=data.player.turnState.diceRolledV46=(data.player.turnState.diceRolledV46||0)+1;this.recalc();await this.emit('dieRolledV46',{player:data.player,value,ordinal,sides:data.sides});}}
  return emit.call(this,event,data,...args);
 };
 const lands=G.landPlayLimit;G.landPlayLimit=function(p){return lands.call(this,p)+this.bf().filter(c=>!c.cur.abilitiesDisabled&&c.def.additionalLandAllV46).length;};
 const phase=G.phaseOutMany;G.phaseOutMany=function(cards,...args){return phase.call(this,cards.filter(c=>!this.untilEffects.some(e=>e.kind==='phase-protection-v46'&&e.card===c&&e.version===c.zoneVersion)),...args);};
 function matches(g,s,d,test){
  if(test==='own-activation')return d.player===s.ctrl;
  if(test==='land')return d.card?.is('Land');
  if(test==='attached')return d.card?.iid===s.attachedTo;
  if(test==='source-power-four')return d.snap?.power>=4;
  if(test==='damaged-defender')return d.hits.some(hit=>hit.src?.attacking===hit.target);
  if(test==='blue-noncreature'){
   if(d.player!==s.ctrl||!d.so||g.isCreatureSpell(d.so))return false;
   const o=d.so.castOpts||{},def=d.so.oracleDefinition||g.castDefinition(d.card,o),cost=o.faceDownCast?'':o.adventure?def.adventure.cost:def.cost;
   d.blueSymbolsV46=M.parseCost(cost||'').pips.filter(p=>p.includes('U')).length;return d.blueSymbolsV46>0;
  }
  if(test==='own-most-life')return g.alivePlayers().every(p=>p.life<=s.ctrl.life);
  if(test==='defender-most-life')return d.defender instanceof M.Player&&g.alivePlayers().every(p=>p.life<=d.defender.life);
  if(test==='own-die'||test==='small-die'||test==='third-die')return d.player===s.ctrl&&(test==='small-die'?d.value<=2:test==='third-die'?d.ordinal===3:true);
  if(test==='own-spirit'||test==='targeted-own-spirit')return (test==='own-spirit'||d.isSpell)&&d.card?.zone==='battlefield'&&d.card.ctrl===s.ctrl&&(d.card===s||d.card.hasSub('Spirit'));
  throw Error('Unknown v46 event '+test);
 }
 M.OracleV20.handlers.push({
  condition(g,s,c,p=s.ctrl){if(c.kind==='dice-count-v46')return (p.turnState.diceRolledV46||0)>=c.min;if(c.kind==='no-named-permanent-v46')return !g.bf().some(card=>card.name===c.name);},
  amount(v,ctx){if(v.kind==='die-value-v46')return ctx.data.value;},
  compile(op,script,entry,h){
   if(op.kind==='additional-land-all-v46'){script.additionalLandAllV46=true;return true;}
   if(op.kind!=='generic-trigger'||!op.eventTestV46)return false;
   const t=h.compileGenericTrigger(op),filter=t.filter;t.filter=(g,s,d)=>filter(g,s,d)&&matches(g,s,d,op.eventTestV46);h.triggers.push(t);return true;
  },
  targetHint(e){if(e.action==='common-effects-v46')return {goal:e.mode==='destroy-event'?'destroy':'protect'};},
  async effect(ctx,e){
   if(e.action!=='common-effects-v46')return false;
   const g=ctx.g,c=ctx.oracleSourceCapture?.eventCard,version=ctx.eventCardZoneVersion;
   if(e.mode==='return-event'){if(c?.zone==='battlefield'&&c.zoneVersion===version)await g.move(c,'hand');return true;}
   if(e.mode==='destroy-event'){if(c?.zone==='battlefield'&&c.zoneVersion===version)await g.destroy(c);return true;}
   if(e.mode==='phase-event'){if(c?.zone==='battlefield'&&c.zoneVersion===version)g.phaseOutMany([c]);return true;}
   if(e.mode==='prevent-phase'){for(const card of H.genericEffectSubjects(ctx,e.target))g.untilEffects.push({kind:'phase-protection-v46',card,version:card.zoneVersion,player:ctx.you,expires:'never'});return true;}
   if(e.mode==='roll-die'){await g.rollDice(ctx.you,6,1,{source:ctx.src});return true;}
   if(e.mode==='blue-symbol-tokens'){await g.makeTokens({name:'Merfolk',cost:'',super:[],types:['Creature'],subtypes:['Merfolk'],colorsOverride:['U'],power:'1',toughness:'1',kws:[],oracle:''},ctx.you,{n:ctx.data.blueSymbolsV46});return true;}
   if(e.mode==='fortify'){for(const land of H.genericEffectSubjects(ctx,e.target))if(ctx.src.zone==='battlefield'&&ctx.src.zoneVersion===ctx.sourceZoneVersion&&g.legalEntryAttachment(ctx.src,land,ctx.you))await g.attach(ctx.src,land);return true;}
   throw Error('Unknown v46 effect '+e.mode);
  }
 });
})(globalThis.MTG ||= {});
