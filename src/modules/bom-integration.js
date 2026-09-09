'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.BOM,G=M.Game.prototype;
 const advance=G.advanceTurnPlayer;G.advanceTurnPlayer=function(p){this.bomPreviousActive=p.idx;return advance.call(this,p);};
 G.bomUpdateDayNight=async function(){const p=this.players[this.bomPreviousActive];if(!this.bomDayNight||!p)return;const n=p.lastTurnSpellsCast||0,next=this.bomDayNight==='day'&&n===0?'night':this.bomDayNight==='night'&&n>=2?'day':this.bomDayNight;if(next===this.bomDayNight)return;this.bomDayNight=next;const cards=this.bf().filter(c=>C.live(c)&&(next==='night'?c.def.bomDaybound:c.def.bomNightbound));for(const c of cards)await C.transform({g:this,src:c,you:c.ctrl,sourceZoneVersion:c.zoneVersion,bomDayNight:true});this.lg('It becomes '+next+'.');await this.emit('dayNightChanged',{dayNight:next});};
 const move=G.move;G.move=async function(c,to,opts={}){
  if(to==='battlefield'&&c.zone!=='battlefield'){
   const front=c.oracleFaces?.faces[0]?.def;
   if(front?.bomDaybound&&!opts.faceDownDef){if(!this.bomDayNight)this.bomDayNight='day';opts={...opts,oracleFace:this.bomDayNight==='night'?'back':'front'};}
   const def=c.oracleFaces?M.OracleV8Faces.faceDefinition(c.oracleFaces,opts.oracleFace||c.oracleFace||'front'):c.def,p=opts.ctrl||c.owner;
   if(def.types.includes('Creature')){const n=this.untilEffects.filter(e=>e.kind==='bomArlinn'&&e.who===p).length;if(n)opts={...opts,additionalCounters:{...opts.additionalCounters,'+1/+1':(opts.additionalCounters?.['+1/+1']||0)+n},additionalCounterBy:p};}
  }
  return move.call(this,c,to,opts);
 };
 const timing=G.canCastTiming;G.canCastTiming=function(p,c,a={}){return timing.call(this,p,c,this.castHasType(c,a,'Creature')&&this.untilEffects.some(e=>e.kind==='bomArlinn'&&e.who===p)?{...a,speed:'instant'}:a);};
 G.bomAnnexTax=function(c,t){const p=t instanceof M.Player?t:t?.is?.('Planeswalker')?t.ctrl:null;return p?this.bf().filter(s=>s.ctrl===p&&C.live(s)&&s.def.bomAnnex).length:0;};
 const discardCopy=g=>{g.bomCardCopies=(g.bomCardCopies||[]).filter(c=>{if(g.stack.some(s=>s.card===c)||c.meta.bomPreparingCopy)return true;g.remove(c);c.zone='ceased';return false;});};
 C.castCardCopy=async(ctx,original)=>{const c=new M.CardInst(M.OracleV8Faces.copyTokenDefinition(original),ctx.you);c.zone='exile';c.meta.bomCastCopy=true;c.meta.bomPreparingCopy=true;ctx.you.exile.push(c);(ctx.g.bomCardCopies||=[]).push(c);ctx.g.recalc();try{return await C.immediate(ctx,[c]);}finally{delete c.meta.bomPreparingCopy;discardCopy(ctx.g);}};
 const emit=G.emit;G.emit=async function(name,data){if(name==='cast'&&data.card?.meta?.bomCastCopy&&data.so){data.so.isCopy=true;data.so.bomCastCopy=true;data.so.oracleDefinition=this.castDefinition(data.card,data.so.castOpts);}return emit.call(this,name,data);};
 const resolve=G.resolveTop;G.resolveTop=async function(...a){try{return await resolve.apply(this,a);}finally{discardCopy(this);}};
 const counter=G.counterStackObject;G.counterStackObject=async function(...a){try{return await counter.apply(this,a);}finally{discardCopy(this);}};
 // A detach event captures the old host before attachment lists change.
 C.unattached=(g,e,h,snap)=>{if(!h||!(snap?.def||e.def).bomExoskeleton||(snap?.abilitiesDisabled??e.cur?.abilitiesDisabled))return;const row=C.row(h),ctrl=snap?.ctrl||e.ctrl;g.queueTrigger({src:e,ctrl,sourceZoneVersion:snap?.zoneVersion??e.zoneVersion,name:'Grafted Exoskeleton: sacrifice the former equipped permanent',run:ctx=>C.current(row)&&row.card.zone==='battlefield'&&row.card.ctrl===ctx.you&&ctx.g.sacrifice(ctx.you,row.card)});};
})();
