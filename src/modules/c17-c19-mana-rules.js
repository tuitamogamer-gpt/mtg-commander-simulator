'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const M=MTG,C=M.C1719,G=M.Game.prototype,colors=['W','U','B','R','G'];
 const hooks=(g,land,p)=>g.bf().filter(c=>C.live(c)&&c.def.c1719LandMana&&(c.def.c1719LandMana.attached?c.attachedTo===land.iid:c.ctrl===p));
 const options=(source,produced)=>{const rule=source.def.c1719LandMana;if(rule.fixed)return [rule.fixed];if(rule.any)return [{ANY:true,n:rule.any}];return Object.keys(produced).filter(k=>[...colors,'C'].includes(k)&&produced[k]>0).map(k=>({[k]:1}));};
 const countColors=xs=>xs.reduce((out,k)=>(out[k]=(out[k]||0)+1,out),{});
 const sources=G.manaSources;
 G.manaSources=function(p,spell,opts={}){return sources.call(this,p,spell,opts).map(s=>s.card?.is('Land')&&s.extraCost?.tap&&!s.m.viaConvoke?{...s,c1719ManaBonuses:hooks(this,s.card,p)}:s);};
 function allocations(g,s,base,rows,branch){
  if(!s.c1719ManaBonuses?.length)return rows;
  let result=rows.map(r=>({...r,c1719BonusExcess:{},c1719BonusChoices:[]}));
  for(const source of s.c1719ManaBonuses){const next=[];
   for(const old of result){const underlying=s.c14BaseMana?.[s.produce.indexOf(base)]||base,produced=underlying.ANY?countColors(old.anyColors):underlying;
    for(const choice of options(source,produced))for(const b of branch(old.pips,old.generic,choice,false,true,true)){
     const excess={...old.c1719BonusExcess};for(const [col,n]of Object.entries(b.excess))excess[col]=(excess[col]||0)+n;
     next.push({...old,pips:b.pips,generic:b.generic,c1719BonusExcess:excess,c1719BonusChoices:[...old.c1719BonusChoices,{source:source.iid,version:source.zoneVersion,choice,colors:b.anyColors}]});
    }
   }
   const unique=new Map();for(const r of next){const k=JSON.stringify([r.pips,r.generic,r.excess,r.c1719BonusExcess,r.anyColors]);if(!unique.has(k))unique.set(k,r);}result=[...unique.values()];
  }
  return result;
 }
 async function add(g,land,p,produced,source,captured){
  for(const h of captured){const legal=options(h,produced);if(!legal.length)continue;const planned=source.c1719BonusPlan?.find(r=>r.source===h.iid&&r.version===h.zoneVersion);
   let choice=planned?.choice;
   if(!choice||!legal.some(o=>JSON.stringify(o)===JSON.stringify(choice))){const key=legal.length===1?'0':await p.controller.decide(g,{type:'chooseOption',player:p,prompt:h.name+': choose additional mana',options:legal.map((o,i)=>({key:String(i),label:Object.entries(o).map(([k,n])=>n+' '+k).join(', ')})),aiHint:{kind:'manaColor'}});choice=legal[Number(key)];if(!choice)throw Error('Invalid additional mana choice');}
   if(choice.ANY){for(let i=0;i<choice.n;i++){const col=planned?.colors?.[i]||await p.controller.decide(g,{type:'chooseOption',player:p,prompt:h.name+': choose mana color',options:colors.map(key=>({key,label:key})),aiHint:{kind:'manaColor'}});if(!colors.includes(col))throw Error('Invalid additional mana color');p.pool[col]=(p.pool[col]||0)+1;}}
   else for(const [col,n]of Object.entries(choice))p.pool[col]=(p.pool[col]||0)+n;
  }
 }
 M.C1719Mana={hooks,allocations,add};
})();
