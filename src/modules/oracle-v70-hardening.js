'use strict';
((M)=>{
 const G=M.Game.prototype,frames=new WeakMap(),colors=['U','B','R','G'];
 const snapshot=g=>new Map(g.players.map(p=>[p,{pool:{...p.pool},meta:new Map((p.poolMeta||[]).map(row=>[row,{color:row.color,n:row.n}]))}]));
 const refresh=(g,frame)=>{frame.before=snapshot(g);};
 function apply(g,frame,player){
  if(!frame||frame.nativeMana)return;
  const players=player?[player]:g.players;
  for(const p of players){const old=frame.before.get(p);if(!old)continue;let converted=0;
   for(const color of colors){const delta=Math.max(0,(p.pool[color]||0)-(old.pool[color]||0));if(!delta)continue;p.pool[color]-=delta;converted+=delta;let remaining=delta;
    // Keep restrictions and snow provenance on the mana that changed color.
    for(const row of (p.poolMeta||[]).slice().reverse()){if(row.color!==color||remaining<=0)continue;const previous=old.meta.get(row),added=Math.max(0,row.n-(previous?.n||0)),n=Math.min(remaining,added);if(!n)continue;if(n===row.n)row.color='W';else{row.n-=n;p.poolMeta.push({...row,color:'W',n});}remaining-=n;}
   }if(converted)p.pool.W+=converted;
  }refresh(g,frame);
 }
 async function scope(g,controller,run){
  if(!controller||!g.untilEffects.some(e=>e.kind==='falseDawnV70'&&e.player===controller))return run();
  const prior=frames.get(g),frame={controller,before:snapshot(g)};frames.set(g,frame);
  try{return await run();}finally{apply(g,frame);if(prior){refresh(g,prior);frames.set(g,prior);}else frames.delete(g);}
 }
 // Printed mana sources already use the ordered replacement engine. These
 // scopes cover resolving spells and scripted abilities that add mana directly.
 const note=G.note;G.note=function(type,data){const frame=frames.get(this);if(type==='mana'&&frame)apply(this,frame,data?.p);return note.call(this,type,data);};
 const resolve=G.resolveTop;G.resolveTop=function(...args){const so=this.stack.at(-1);return scope(this,so?.ctrl,()=>resolve.apply(this,args));};
 const trigger=G.resolveTriggerNow;G.resolveTriggerNow=function(tr,...args){return scope(this,tr.ctrl||tr.src?.ctrl,()=>trigger.call(this,tr,...args));};
 const pay=G.payMana;G.payMana=async function(...args){const frame=frames.get(this);if(frame)apply(this,frame);try{return await pay.apply(this,args);}finally{if(frame)refresh(this,frame);}};
 const mana=G.activateManaSource;G.activateManaSource=async function(...args){const frame=frames.get(this);if(frame)frame.nativeMana=(frame.nativeMana||0)+1;try{return await mana.apply(this,args);}finally{if(frame){frame.nativeMana--;refresh(this,frame);}}};
})(globalThis.MTG);
