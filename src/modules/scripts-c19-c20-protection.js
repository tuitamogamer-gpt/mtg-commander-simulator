'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,SC=M.SCRIPTS,C=M.C1920,T=M.T,G=M.Game.prototype;
 const protectedFrom=G.isProtectedFrom;
 G.isProtectedFrom=function(target,source){if(source&&target instanceof M.Player&&this.untilEffects.some(e=>e.kind==='c1920PlayerProtection'&&e.who===target&&e.from===(source.ctrl||source.owner)?.idx))return true;return protectedFrom.call(this,target,source);};
 SC['Eon Frolicker']={triggers:[C.enterTrigger('An opponent takes an extra turn; you and your planeswalkers gain protection from that player',ctx=>{const p=ctx.targets[0];if(!p)return;ctx.g.scheduleExtraTurn(p);ctx.g.untilEffects.push({kind:'c1920PlayerProtection',expires:'untilTurnOf',whoTurn:ctx.you,who:ctx.you,from:p.idx});for(const c of ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.is('Planeswalker'))){const r=C.row(c);ctx.g.untilEffects.push({kind:'c1920PermanentProtection',expires:'untilTurnOf',whoTurn:ctx.you,apply:(g,bf)=>{if(C.current(r))r.card.cur.protectionFrom.push((g,src)=>(src.ctrl||src.owner)===p);}});}ctx.g.recalc();},{filter:(g,c,d)=>d.card===c&&c.castMeta?.wasCast,targets:[T.opponent()]})]};
 SC['Sanctuary Blade']={equip:'{3}',asAttach:async(g,c)=>{c.meta.c1920Color=await C.color({g,src:c,you:c.ctrl});},attachGrant:(g,c,h)=>{h.cur.power+=2;if(c.meta.c1920Color)h.cur.protectionFrom.push((g,s)=>s.colors?.includes(c.meta.c1920Color));}};
 SC['Prismatic Strands']={c1920Strands:true,flashback:{altCostStr:'{0}'},resolve:async ctx=>{const color=await C.color(ctx);ctx.g.untilEffects.push({kind:'oracleDamagePrevention',expires:'eot',run:(g,d)=>(d.sourceSnapshot?.colors||d.src?.colors||[]).includes(color)?0:d.n});}};
})();
