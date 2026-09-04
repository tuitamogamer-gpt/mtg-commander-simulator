import assert from 'node:assert/strict';
export function stageOracleCounterCost(MTG,ctx,cost,source,h){
 const info=cost?.oracleCounterPayment;if(!info)return[];
 const existing=Object.keys(source.counters).find(kind=>(source.counters[kind]||0)>0&&(!info.kinds||info.kinds.includes(kind)));
 const kind=info.kinds?.[0]||existing||'charge',cards=[];
 if(info.self){source.counters[kind]=Math.max(info.n,source.counters[kind]||0);cards.push(source);}
 else{
  const amount=info.among?info.n:1;
  for(let i=0;i<amount;i++){
   const card=h.stageGenericTarget(MTG,ctx,info.filter,'counter-cost-'+i);assert.ok(card,source.name+': exact counter-payment permanent staged');
   card.counters[kind]=(card.counters[kind]||0)+(info.among?1:info.n);cards.push(card);
  }
 }
 ctx.game.recalc();return cards;
}
export function assertOracleCounterCost(ctx,cost,source,before,label){
 const info=cost?.oracleCounterPayment;if(!info)return;
 const stack=ctx.game.stack.find(so=>so.srcCard===source&&so.ctx?.oracleCounterPayment),rows=stack?.ctx.oracleCounterPayment;
 assert.ok(rows?.length,label+': actual counter payment is recorded on the ability Stack object');
 assert.equal(rows.reduce((n,row)=>n+row.n,0),info.n,label+': exact number of counters paid');
 if(!info.among)assert.equal(new Set(rows.map(row=>row.iid)).size,1,label+': all counters are removed from one permanent');
 for(const row of rows){
  const card=ctx.game.byIid(row.iid),old=before.cards.get(card);assert.ok(old,label+': selected counter object has a prior snapshot');
  assert.equal(old.counters[row.kind]-(card.counters[row.kind]||0),row.n,label+': selected counter kind was really removed before resolution');
  if(info.kinds)assert.ok(info.kinds.includes(row.kind),label+': counter has a printed eligible kind');
  if(info.self)assert.equal(card,source,label+': source paid its own counters');
 }
}
