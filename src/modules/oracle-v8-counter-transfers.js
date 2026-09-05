'use strict';
var MTG=globalThis.MTG||(globalThis.MTG={});
(function(){
 const live=card=>card?.zone==='battlefield'&&!card.phasedOut;
 async function run(ctx,effect,h){
  const recipient=h.subjects(ctx,effect.target)[0];if(!live(recipient))return;
  if(effect.action==='copy-counters-v8'){
   const snap=ctx.oracleSourceCapture?.eventSnap||ctx.data?.snap;
   if(!snap||ctx.data?.card!==ctx.src)return;
   for(const [kind,n]of Object.entries(snap.counters||{}))if(n>0)ctx.g.addCounters(recipient,kind,n,false,ctx.you);
   return;
  }
  const donor=h.subjects(ctx,effect.sourceTarget)[0];if(!live(donor)||donor===recipient)return;
  const versions=[donor.zoneVersion,recipient.zoneVersion];
  const valid=()=>live(donor)&&live(recipient)&&donor.zoneVersion===versions[0]&&recipient.zoneVersion===versions[1];
  let kinds=effect.counter?[effect.counter]:Object.keys(donor.counters).filter(kind=>donor.counters[kind]>0);
  if(!effect.counter&&effect.n===1){
   if(!kinds.length)return;
   const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose a counter to move',options:kinds.map(kind=>({key:kind,label:kind})),aiHint:{kind:'counterRemove',card:donor,src:ctx.src}});
   if(!kinds.includes(chosen)||!valid())return;kinds=[chosen];
  }
  for(const kind of kinds){
   const available=Math.max(0,Number(donor.counters[kind])||0);let n=effect.n==='all'?available:effect.n==='chosen'?await ctx.you.controller.decide(ctx.g,{type:'chooseX',min:0,max:available,card:ctx.src,prompt:'How many '+kind+' counters to move?',aiHint:{kind:'counterMove',card:ctx.src,donor,recipient,counter:kind}}):1;
   n=Number(n);if(!valid()||!Number.isSafeInteger(n)||n<1||n>available)continue;
   // CR122.5: both operations must be possible before removing anything.
   if(kind==='+1/+1'&&recipient.is('Creature')&&ctx.g.adjustPlusCounters(recipient,n)<=0)continue;
   ctx.g.removeCounters(donor,kind,n);ctx.g.addCounters(recipient,kind,n,false,ctx.you);
  }
 }
 function targetValue(player,card,query){
  const hint=query.aiHint||{},donor=hint.goal==='counterTransferDonor'?card:hint.counterTransferSource;
  if(!donor?.counters)return 0;
  if(hint.goal==='counterTransferRecipient'&&card===donor||hint.goal==='counterTransferDonor'&&hint.counterRecipientSelf&&card===query.src)return -1000;
  const harmful=new Set(['-1/-1','-0/-1','stun','finality','doom','bounty']);
  const entries=Object.entries(donor.counters).filter(([kind,n])=>n>0&&(!hint.counterKind||kind===hint.counterKind));
  const receiving=hint.goal==='counterTransferRecipient';
  return entries.reduce((score,[kind,n])=>score+(hint.counterN===1?Math.min(1,n):n)*
   ((card.ctrl===player?1:-1)*(harmful.has(kind)?-1:1)*(receiving?1:-1)*5+(receiving?0:6)),0);
 }
 MTG.OracleV8CounterTransfers={actions:new Set(['move-counters-v8','copy-counters-v8']),run,targetValue};
})();
