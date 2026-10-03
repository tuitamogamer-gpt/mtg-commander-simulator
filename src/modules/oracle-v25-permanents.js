(function(){
 'use strict';const M=globalThis.MTG,G=M.Game.prototype,H=M.OracleV20.helpers,L=M.OracleV24Permanents;
 const same=ctx=>H.sameBattlefieldSource(ctx);
 const linked=(ctx,op)=>L.linked(ctx.g,ctx.src,op.link,ctx);
 const select=(ctx,op,cards)=>cards.filter(card=>!op.filter||H.genericTargetSpec({...op.filter,zone:card.zone,controller:'any'},[],0,{...ctx.data,oracleX:ctx.so?.x??ctx.x??0,oracleSourceCapture:ctx.oracleSourceCapture}).filter(ctx.g,card,ctx.you,ctx.src));
 async function choose(ctx,cards,n=1,min=1,player=ctx.you){const need=Math.min(n,cards.length),versions=new Map(cards.map(card=>[card,{zone:card.zone,version:card.zoneVersion}])),answer=await player.controller.decide(ctx.g,{type:'chooseCards',from:cards,min:Math.min(min,need),max:need,prompt:ctx.src.name+': choose linked cards',aiHint:{kind:'recur'}});if(!Array.isArray(answer)||answer.length<Math.min(min,need)||answer.length>need||new Set(answer).size!==answer.length||answer.some(card=>!cards.includes(card)))throw Error('Invalid linked-card choice');return answer.filter(card=>card.zone===versions.get(card).zone&&card.zoneVersion===versions.get(card).version);}
 async function acquire(ctx,op,cards){const moved=await L.acquire(ctx,op,cards);ctx.permanentLinkedAcquiredV25=moved.map(card=>({iid:card.iid,version:card.zoneVersion}));ctx.g.recalc();return moved;}
 async function returnCards(ctx,op){let cards=select(ctx,op,linked(ctx,op));if(op.exceptAcquired)cards=cards.filter(card=>!ctx.permanentLinkedAcquiredV25?.some(row=>row.iid===card.iid&&row.version===card.zoneVersion));if(op.choose)cards=await choose(ctx,cards,op.choose);await ctx.g.withBattlefieldEntryBatch(async()=>{for(const card of cards){if(op.to==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,op.controller==='you'?ctx.you:card.owner,{tapped:!!op.tapped,...(op.counter?{additionalCounters:{[op.counter]:1}}:{})});else await ctx.g.move(card,op.to);}});return cards;}
 const optional=async ctx=>(await ctx.you.controller.decide(ctx.g,{type:'chooseOption',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],prompt:ctx.src.name+': copy the linked card?',aiHint:{kind:'optTrigger',src:ctx.src}}))==='yes';
 const value=(ctx,op)=>linked(ctx,op).reduce((n,card)=>n+(Number(card[op.stat])||0),0);
 async function copyCast(ctx,op){let originals=linked(ctx,op),versions=new Map(originals.map(card=>[card,card.zoneVersion]));if(op.choose)originals=await choose(ctx,originals,op.choose,op.optional?0:1);else if(op.optional&&!await optional(ctx))return [];const copies=[];for(const original of originals.filter(card=>card.zoneVersion===versions.get(card)&&linked(ctx,op).includes(card))){const copy=new M.CardInst(M.OracleV8Faces.copyTokenDefinition(original),ctx.you);copy.isCopySpell=true;copy.zone='exile';ctx.you.exile.push(copy);copies.push(copy);try{await M.OracleV8PlayPermissions.castOne(ctx,[copy],{free:true},{target:H.genericTargetSpec});}finally{if(copy.zone==='exile'){ctx.you.exile.splice(ctx.you.exile.indexOf(copy),1);copy.zone='ceased';}}}return copies;}
 async function copyTokens(ctx,op,models){for(const card of models)await M.OracleV8Copies.run({...ctx,targets:[card]},{...op,action:'copy-token-v8',target:0},{subjects:H.genericEffectSubjects,amount:H.genericAmount,target:H.genericTargetSpec,sameSource:same,compile:ops=>H.compileOracleScript({id:'linked-copy-v25'},{raw:{name:'Linked copy'},implementation:ops,oracleContracts:[]})});}
 M.OracleV20.handlers.push({async effect(ctx,op){
  if(op.action==='permanent-linked-acquire-token-v25'){const cards=select(ctx,op,ctx.you.hand),chosen=await choose(ctx,cards,1,0),moved=await acquire(ctx,{...op,from:'hand'},chosen);await copyTokens(ctx,op.copy,moved);return true;}
  if(op.action==='permanent-linked-copy-cast-v25'){await copyCast(ctx,op);return true;}
  if(op.action==='permanent-linked-copy-token-v25'){const models=op.target===undefined?linked(ctx,op):H.genericEffectSubjects(ctx,op.target).filter(card=>linked(ctx,op).includes(card));await copyTokens(ctx,op,models);return true;}
  if(op.action==='permanent-linked-owner-effect-v25'){for(const card of linked(ctx,op))await H.runGenericEffect({...ctx,you:card.owner},op.effect);return true;}
  if(op.action==='permanent-linked-return-v25'){await returnCards(ctx,op);return true;}
  if(op.action==='permanent-linked-cast-v25'){const all=linked(ctx,op);if(op.each)for(const card of all)await M.OracleV8PlayPermissions.castOne({...ctx,you:op.owner?card.owner:ctx.you},[card],{free:op.free,filter:op.filter},{target:H.genericTargetSpec});else await M.OracleV8PlayPermissions.castOne(ctx,all,{free:op.free,filter:op.filter},{target:H.genericTargetSpec});return true;}
  if(op.action==='permanent-linked-grant-v25'){const cards=op.choose?await choose(ctx,linked(ctx,op),op.choose):linked(ctx,op);M.OracleV22Layouts.grant(ctx,cards,op);return true;}
  if(op.action==='permanent-linked-counter-v25'){const cards=linked(ctx,op);if(op.reveal)for(const card of cards){card.faceDown=false;delete card.meta.revealedTo;}const names=cards.flatMap(card=>M.OracleV8NameGroups.names(card));for(const so of ctx.g.stack.slice())if(so.kind==='spell'&&M.OracleV8NameGroups.names(so).some(name=>names.includes(name)))await ctx.g.counterStackObject(so);return true;}
  if(op.action!=='permanent-linked-acquire-v25')return false;
  if(op.mode==='v24'){if(op.native.mode==='select'){const players=op.native.who==='all-graveyards'?ctx.g.alivePlayers():H.genericEffectSubjects(ctx,op.native.who),cards=select(ctx,op.native,players.flatMap(player=>player[op.native.from]||[])),picked=await choose(ctx,cards,op.native.n||1,op.native.optional?0:1);await acquire(ctx,op.native,picked);return true;}const before=new Set(linked(ctx,op));await H.runGenericEffect(ctx,op.native);ctx.permanentLinkedAcquiredV25=linked(ctx,op).filter(card=>!before.has(card)).map(card=>({iid:card.iid,version:card.zoneVersion}));ctx.g.recalc();return true;}
  if(op.mode==='top'){
   const players=H.genericEffectSubjects(ctx,op.who??'you'),n=Math.max(0,Math.floor(H.genericAmount(op.n,ctx)));for(const player of players)await acquire(ctx,{...op,from:'library'},n?player.library.slice(-n):[]);return true;
  }
  if(op.mode==='event'){
   const card=ctx.oracleSourceCapture?.eventCard||ctx.data?.card;
   if(card&&card.zone==='graveyard'&&card.zoneVersion===ctx.eventCardZoneVersion)await acquire(ctx,{...op,from:'graveyard'},[card]);return true;
  }
  if(op.mode==='event-batch'){
   const rows=ctx.oracleSourceCapture?.batchEventsV9||[],cards=rows.filter(row=>row.event==='discarded'&&row.player===ctx.you&&row.card?.zone==='graveyard'&&row.card.zoneVersion===row.snap?.zoneVersion).map(row=>row.card);await acquire(ctx,{...op,from:'graveyard'},cards);return true;
  }
  if(op.mode==='until'){
   const before=(ctx.g.oracleExileDurations||[]).length;
   await M.OracleV8Linked.run(ctx,op.native,{subjects:H.genericEffectSubjects,target:H.genericTargetSpec,sameSource:same});
   const key=L.binding(ctx.src,ctx);for(const duration of (ctx.g.oracleExileDurations||[]).slice(before)){const cards=duration.cards.filter(row=>row.card.zone==='exile'&&row.card.zoneVersion===row.zoneVersion);if(cards.length)(ctx.g.oracleLinkedExiles||=[]).push({source:ctx.src,sourceIid:key.iid,sourceZoneVersion:key.version,lifetime:key.lifetime,link:op.link,cards});}ctx.g.recalc();return true;
  }
  if(op.mode==='until-zone'){if(!same(ctx))return true;const cards=select(ctx,op,H.genericEffectSubjects(ctx,op.who).flatMap(player=>player[op.from]||[])),duration={source:ctx.src,sourceZoneVersion:L.binding(ctx.src,ctx).version,returnZone:op.from,cards:cards.map(card=>({card,zoneVersion:card.zoneVersion+1}))};(ctx.g.oracleExileDurations||=[]).push(duration);await acquire(ctx,op,cards);return true;}
  if(op.mode==='search'){
   const players=H.genericEffectSubjects(ctx,op.who??'you');for(const player of players){const cards=select(ctx,op,player.library),n=op.n===undefined?1:H.genericAmount(op.n,ctx),picked=await choose(ctx,cards,n,0);if(op.reveal&&picked.length)await ctx.g.revealToHuman({cards:picked,ctrl:player,kind:'reveal',includeLands:true});await acquire(ctx,{...op,from:'library'},picked);M.shuffle(player.library,ctx.g.rnd);await ctx.g.emit('shuffled',{player});}return true;
  }
  if(op.mode==='zone'){
   for(const player of H.genericEffectSubjects(ctx,op.who??'you')){const cards=select(ctx,op,player[op.from]||[]),n=op.n==='all'?cards.length:H.genericAmount(op.n,ctx),picked=op.n==='all'?cards:await choose(ctx,cards,n,op.optional?0:n,op.chooseOwner?player:ctx.you);await acquire(ctx,op,picked);}return true;
  }
  throw Error('Unsupported linked acquisition v25');
 },amount(node,ctx){if(node.kind==='permanent-linked-value-v25')return value(ctx,node);if(node.kind==='permanent-paid-x-v25')return ctx.x??ctx.so?.x??ctx.data?.oracleX??0;if(node.kind==='permanent-linked-count-v25')return linked(ctx,node).length;},count(g,src,you,node){if(node.kind==='permanent-linked-count-v25')return L.linked(g,src,node.link).length;},target(g,card,you,src,node,evidence){if(node.kind==='permanent-linked-target-v25')return L.linked(g,src,node.link,evidence?.oracleContext||evidence?.oracleSourceCapture||{}).includes(card);},compile(op,script,entry,h){
  if(op.kind==='generic-ability'&&op.permanentLinkedActivationManaV25){const ability=h.compileGenericAbility(op),cost=M.parseCost(op.cost.mana),node=op.permanentLinkedActivationManaV25;ability.xCost=false;ability.cost.mana=(g,src)=>({...cost,generic:cost.generic+cost.x*value({g,src,you:src.ctrl},node),x:0,pips:cost.pips.map(pip=>pip.slice())});h.abilities.push(ability);return true;}
  if(op.kind==='permanent-linked-look-v25'){(script.oracleLinkedLookV25||=[]).push(op);return true;}
  if(op.kind==='permanent-linked-permission-v25'){(script.oracleLinkedPermissionsV25||=[]).push(op);return true;}
  return false;
 }});
 const recalc=G.recalc;G.recalc=function(...args){const result=recalc.apply(this,args);for(const source of this.bf())if(L.live(source)){
  for(const op of source.def.oracleLinkedLookV25||[])for(const card of L.linked(this,source,op.link))if(card.faceDown)card.meta.revealedTo=[...new Set([...(card.meta.revealedTo||[]),source.ctrl.idx])];
  for(const op of source.def.oracleLinkedPermissionsV25||[]){const cards=L.linked(this,source,op.link);for(const card of cards){const old=card.meta.oracleLinkedPermissionV25;if(old&&old.cardVersion===card.zoneVersion&&old.sourceIid===source.iid&&old.sourceVersion===source.zoneVersion&&old.controller===source.ctrl.idx)continue;M.OracleV22Layouts.grant({g:this,src:source,you:source.ctrl,sourceZoneVersion:source.zoneVersion},[card],{...op,duration:'source-control'});card.meta.oracleLinkedPermissionV25={cardVersion:card.zoneVersion,sourceIid:source.iid,sourceVersion:source.zoneVersion,controller:source.ctrl.idx};}}
 }return result;};
 M.OracleV25Permanents={acquire,linked:(g,s,link,evidence)=>L.linked(g,s,link,evidence),binding:L.binding,returnCards,copyCast,copyTokens};
})();
