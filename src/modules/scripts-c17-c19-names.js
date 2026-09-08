'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,G=M.Game.prototype,C=M.C1719,SC=M.SCRIPTS,T=M.T;
 async function name(ctx,p=ctx.you){const names=[...new Set(Object.values(M.DEFS).flatMap(d=>d.oracleFaces?d.oracleFaces.faces.map(f=>f.def.name):[d.name]).filter(Boolean))].sort();const answer=await p.controller.decide(ctx.g,{type:'chooseOption',player:p,prompt:ctx.src.name+': choose a card name',searchableChoices:true,options:names.map(key=>({key,label:key})),aiHint:{kind:'cardName'}});if(!names.includes(answer))throw Error('Invalid chosen card name');return answer;}
 SC['Predict']={targets:[T.player()],resolve:async ctx=>{const p=ctx.targets[0];if(!p)return;const chosen=await name(ctx),c=p.library.at(-1),version=c?.zoneVersion,n=c?.name===chosen;await ctx.g.mill(p,1);await C.draw(ctx,ctx.you,n&&c.zone==='graveyard'&&c.zoneVersion!==version?2:1);}};
 SC['Conundrum Sphinx']={triggers:[{on:'attacks',filter:(g,c,d)=>d.card===c,desc:'Each player names a card, reveals their top card and takes matches',run:async ctx=>{const rows=[];for(const p of ctx.g.apnapFrom(ctx.you))rows.push({p,name:await name(ctx,p)});for(const r of rows){const c=r.p.library.at(-1);if(c){await ctx.g.revealToHuman({cards:[c],ctrl:r.p,kind:'reveal'});await ctx.g.move(c,c.name===r.name?'hand':'library',{toBottom:true});}}}}]};
 SC["K'rrik, Son of Yawgmoth"]={c1719Krrik:true,triggers:[{on:'cast',filter:(g,c,d)=>d.player===c.ctrl&&d.card.colors.includes('B'),desc:'Put a +1/+1 counter on Krrik',run:ctx=>{if(C.same(ctx))C.counters(ctx,ctx.src,1);}}]};
 function cost(g,p,c){if(!c||c.c1719KrrikCost||!g.bf().some(s=>s.ctrl===p&&C.live(s)&&s.def.c1719Krrik))return c;return {...c,c1719KrrikCost:true,pips:c.pips.map(pip=>pip.includes('B')&&!pip.includes('PHY')?pip.concat('PHY'):pip.slice())};}
 const solve=G.manaSolve,pay=G.payMana;G.manaSolve=function(p,c,s,o){return solve.call(this,p,cost(this,p,c),s,o);};G.payMana=function(p,c,s,o){return pay.call(this,p,cost(this,p,c),s,o);};
 C.nameCard=name;
})();
