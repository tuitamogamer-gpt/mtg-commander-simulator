'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 async function run(ctx,effect,h){
  const affected=effect.filters?ctx.g.bf().filter(card=>effect.filters.some(filter=>h.filter(filter,card))):h.subjects(ctx,effect.target);
  for(const card of affected){
   if(card.zone!=='battlefield'||card.phasedOut)continue;
   const version=card.zoneVersion;
   if(effect.upToV17){
    const total=Object.values(card.counters).reduce((n,value)=>n+Math.max(0,Number(value)||0),0),max=Math.min(total,effect.n);
    const picked=await ctx.you.controller.decide(ctx.g,{type:'chooseX',prompt:'How many counters to remove from '+card.name+'?',min:0,max,aiHint:{kind:'oracleResolutionX',n:max}});
    const n=Math.max(0,Math.min(max,Math.trunc(Number(picked)||0)));
    for(let i=0;i<n;i++){
     if(card.zone!=='battlefield'||card.phasedOut||card.zoneVersion!==version)break;
     const kinds=Object.keys(card.counters).filter(kind=>card.counters[kind]>0);if(!kinds.length)break;
     const selected=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a counter to remove from '+card.name,options:kinds.map(kind=>({key:kind,label:kind})),aiHint:{kind:'counterRemove',card,src:ctx.src}});
     if(card.zone==='battlefield'&&!card.phasedOut&&card.zoneVersion===version&&kinds.includes(selected)&&card.counters[selected]>0)ctx.g.removeCounters(card,selected,1);
    }
   }else if(effect.n==='all'){
    const kinds=effect.counter?[effect.counter]:Object.keys(card.counters);
    for(const kind of kinds){const n=Math.max(0,Number(card.counters[kind])||0);if(n)ctx.g.removeCounters(card,kind,n);}
   }else if(effect.counter)ctx.g.removeCounters(card,effect.counter,effect.n);
   else{
    const kinds=Object.keys(card.counters).filter(kind=>card.counters[kind]>0);if(!kinds.length)continue;
    const selected=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a counter to remove from '+card.name,
     options:kinds.map(kind=>({key:kind,label:kind})),aiHint:{kind:'counterRemove',card,src:ctx.src}});
    if(card.zone==='battlefield'&&!card.phasedOut&&card.zoneVersion===version&&kinds.includes(selected)&&card.counters[selected]>0)ctx.g.removeCounters(card,selected,1);
   }
  }
  ctx.g.recalc();
 }
 MTG.OracleV8CounterEffects={actions:new Set(['remove-counters-v8']),run};
})();
