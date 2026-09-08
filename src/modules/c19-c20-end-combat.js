'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype;
 const locked=(g,p)=>g.untilEffects.some(e=>e.kind==='c1920Mandate'&&e.players.includes(p.idx));
 const timing=G.canCastTiming,cast=G.castSpell;
 G.canCastTiming=function(p,c,a){return !locked(this,p)&&timing.call(this,p,c,a);};
 G.castSpell=function(p,c,a){return locked(this,p)?Promise.resolve(false):cast.call(this,p,c,a);};
 G.endCombatByEffect=async function(resolving){
  const objects=this.stack.splice(0);if(resolving)objects.push(resolving);
  // This is exile, including uncounterable spells, not a counter instruction.
  for(const so of objects)if(!so.isCopy&&so.card?.zone==='stack')await this.move(so.card,'exile');
  this.note('stack',{});await this.checkSBA();
  for(const c of this.bf()){c.attacking=null;c.blocking=null;c.blockedBy=[];c.wasBlocked=false;c.meta._dealtFirstStrike=false;}
  this.combat=null;this.delayed=this.delayed.filter(e=>e.expires!=='combat');this.untilEffects=this.untilEffects.filter(e=>e.expires!=='combat');
  this.emptyPool();this.phase='main2';this.step='';this.recalc();this.note('phase',{});
 };
 M.SCRIPTS['Mandate of Peace']={oracleCastRestriction:g=>g.phase==='combat',resolve:async ctx=>{ctx.g.untilEffects.push({kind:'c1920Mandate',expires:'eot',players:ctx.you.opponents(ctx.g).map(p=>p.idx)});await ctx.g.endCombatByEffect(ctx.so);}};
})();
