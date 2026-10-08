'use strict';
((M)=>{
 const creatureTypes=card=>new Set([...M.CREATURE_SUBTYPES].filter(type=>card.hasSub(type)));
 const departures=new WeakMap();
 const snapshot=card=>({name:card.name,mv:card.mv,types:creatureTypes(card),controller:card.ctrl});
 const move=M.Game.prototype.move;
 M.Game.prototype.move=async function(card,to,opts){
  const version=card.zoneVersion,old=['graveyard','battlefield'].includes(card.zone)?snapshot(card):null;
  if(old){let history=departures.get(card);if(!history){history=new Map();departures.set(card,history);}history.set(version,old);}
  const result=await move.call(this,card,to,opts);
  return result;
 };
 const state=(card,identity)=>!identity||card.zoneVersion===identity.zoneVersion?snapshot(card):departures.get(card)?.get(identity.zoneVersion);
 function statesFit(rule,states){
  if(states.some(row=>!row))return false;
  if(rule.test==='total-mana-value')return states.reduce((sum,row)=>sum+row.mv,0)<=rule.max;
  if(rule.test==='different-names')return new Set(states.map(row=>row.name)).size===states.length;
  if(rule.test==='same-controller')return states.length<2||states.every(row=>row.controller===states[0].controller);
  if(rule.test==='no-shared-creature-type')return states.every((row,i)=>states.slice(i+1).every(other=>![...row.types].some(type=>other.types.has(type))));
  if(rule.test==='different-mana-values')return new Set(states.map(row=>row.mv)).size===states.length;
  if(rule.test==='shared-creature-type')return states.length<2||[...states[0].types].some(type=>states.every(row=>row.types.has(type)));
  throw Error('Unknown v22 spell target group');
 }
 function groupFilter(rule,game,cards){
  if(rule.test==='total-mana-value')return cards.reduce((sum,card)=>sum+card.mv,0)<=rule.max;
  if(rule.test==='different-names')return new Set(cards.map(card=>card.name)).size===cards.length;
  if(rule.test==='different-mana-values')return new Set(cards.map(card=>card.mv)).size===cards.length;
  return statesFit(rule,cards.map(snapshot));
 }
 function groupRevalidate(rule,game,original,legal,identities){
  // CR 608.2b: a restriction relating targets consults the other object's
  // last information when it left its expected zone. In particular, a
  // vanished shared-type target does not make its partner automatically legal.
  const states=original.map((card,i)=>state(card,identities?.[i]));
  return statesFit(rule,states)?legal:[];
 }
 function groupRetarget(rule,game,picks,ids,flags){
  if(!flags.some(Boolean))return true;
  // Retained illegal objects may stay on a copied spell; the new targets
  // must satisfy their group restriction against those objects' LKI.
  return statesFit(rule,picks.map((card,i)=>state(card,ids?.[i])));
 }
 function pickGroup(rule,game,ranked,min,max){
  max=Math.min(max,ranked.length);let best=[];
  // Trying every possible first member avoids stranding a required shared
  // type pair behind an unrelated, higher-ranked card.
  for(let first=0;first<ranked.length;first++){
   const chosen=[];
   for(const card of [ranked[first],...ranked.filter((_,i)=>i!==first)])if(chosen.length<max&&groupFilter(rule,game,[...chosen,card]))chosen.push(card);
   if(chosen.length>=min&&chosen.length>best.length)best=chosen;
  }
  return best.length>=min?best:[];
 }
 M.OracleV22Spells={groupFilter,groupRevalidate,groupRetarget,pickGroup};
 async function returnCards(ctx,cards,effect){
  const rows=cards.map(card=>({card,version:card.zoneVersion}));
  const previous=ctx.g._graveyardLeaveBatch,batch=[];ctx.g._graveyardLeaveBatch=batch;
  try{await ctx.g.withBattlefieldEntryBatch(async()=>{for(const row of rows)if(row.card.zone==='graveyard'&&row.card.zoneVersion===row.version){if(effect.destination==='hand')await ctx.g.move(row.card,'hand');else await ctx.g.putPermanentOntoBattlefield(row.card,effect.controller==='owner'?row.card.owner:ctx.you,{tapped:!!effect.tapped});}});}finally{ctx.g._graveyardLeaveBatch=previous;}
  if(previous)previous.push(...batch);else if(batch.length)await ctx.g.emit('cardsLeftGraveyard',{cards:batch.map(row=>row.card),snapshots:batch.map(row=>row.snap),destinations:batch.map(row=>row.to),to:batch.every(row=>row.to===batch[0].to)?batch[0].to:null});
  return rows.filter(row=>row.card.zone===(effect.destination||'battlefield')&&row.card.zoneVersion===row.version+1).map(row=>row.card);
 }
 async function selectGrave(ctx,effect,h){
  const filter=h.genericTargetSpec(effect.filter,[],0),from=ctx.you.graveyard.filter(card=>filter.filter(ctx.g,card,ctx.you,ctx.src)),versions=new Map(from.map(card=>[card,card.zoneVersion])),max=Math.min(effect.max??from.length,from.length),min=Math.min(effect.min||0,max),fits=cards=>!effect.group||groupFilter(effect.group,ctx.g,cards);
  if(!max)return [];
  const chosen=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min,max,prompt:ctx.src.name+': choose cards to return',aiHint:{kind:'oracleNameSearch',canPayRemaining:fits}});
  if(!Array.isArray(chosen)||new Set(chosen).size!==chosen.length||chosen.length<min||chosen.length>max||chosen.some(card=>!from.includes(card))||!fits(chosen))throw Error('Invalid v22 graveyard return selection');
  return chosen.filter(card=>card.zone==='graveyard'&&card.zoneVersion===versions.get(card));
 }
 M.OracleV20.handlers.push({spellsV22:true,
  compile(operation,script,entry,h){
   if(!['spell-generic','spell-modal-generic'].includes(operation.kind)||!JSON.stringify(operation).includes('"groupV22"'))return false;
   const convert=part=>({...part,effects:part.effects.map(effect=>effect.action==='reanimate'&&part.targets[effect.target]?.groupV22?{...effect,action:'grave-group-return-v22',destination:'battlefield'}:effect)}),converted=operation.kind==='spell-generic'?convert(operation):{...operation,modes:operation.modes.map(mode=>({...mode,body:convert(mode.body)}))};
   const compiled=h.compileSpell(converted);
   if(converted.kind==='spell-modal-generic')Object.assign(script,compiled);
   else {compiled.oracleOperation=converted;compiled.targetOffset=h.spellFragments.reduce((sum,fragment)=>sum+(fragment.targets||[]).length,0);h.spellFragments.push(compiled);}
   return true;
  },
  async effect(ctx,effect,h){
   if(effect.action==='partition-search-v22'){
    const library=ctx.g.searchableLibrary?ctx.g.searchableLibrary(ctx.you):ctx.g.canSearchLibrary?.(ctx.you)===false?[]:ctx.you.library,filter=h.genericTargetSpec({...effect.filter,zone:'graveyard'},[],0),matches=card=>{const view=Object.defineProperty(Object.create(card),'zone',{value:'graveyard'});return filter.filter(ctx.g,view,ctx.you,ctx.src)&&(!effect.mvX||card.mv<=h.genericAmount('X',ctx));},from=[...library,...(effect.graveyard?ctx.you.graveyard:[])].filter(matches),versions=new Map(from.map(card=>[card,{zone:card.zone,version:card.zoneVersion}])),fits=cards=>groupFilter({test:'different-names'},ctx.g,cards);
    const search=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max:Math.min(effect.max,from.length),search:true,prompt:ctx.src.name+': search for cards with different names',aiHint:{kind:'oracleNameSearch',canPayRemaining:fits}});
    if(!Array.isArray(search)||new Set(search).size!==search.length||search.length>effect.max||search.some(card=>!from.includes(card))||!fits(search))throw Error('Invalid v22 partition search selection');
    const current=card=>{const old=versions.get(card);return old&&card.zone===old.zone&&card.zoneVersion===old.version;},selected=search.filter(current);await ctx.g.revealToHuman({cards:selected,ctrl:ctx.you,kind:'reveal',includeLands:true});
    let opponent;if(effect.opponent==='choose'){const opponents=ctx.you.opponents(ctx.g);if(opponents.length){const key=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Choose an opponent',options:opponents.map(player=>({key:String(player.idx),label:player.name})),aiHint:{kind:'oracleChoice'}});opponent=opponents.find(player=>String(player.idx)===key);if(!opponent)throw Error('Invalid v22 partition opponent');}}else opponent=h.genericEffectSubjects(ctx,effect.opponent)[0];
    const n=Math.min(2,selected.length),answer=opponent?await opponent.controller.decide(ctx.g,{type:'chooseCards',from:selected,min:n,max:n,prompt:ctx.src.name+': choose two revealed cards',aiHint:{kind:'oraclePartitionV22'}}):[];
    if(!Array.isArray(answer)||new Set(answer).size!==answer.length||opponent&&answer.length!==n||answer.some(card=>!selected.includes(card)))throw Error('Invalid v22 revealed partition');
    const chosen=answer.filter(current),rest=selected.filter(card=>!answer.includes(card)&&current(card));
    if(effect.chosen==='library'){for(const card of chosen)if(card.zone!=='library')await ctx.g.move(card,'library');M.shuffle(ctx.you.library,ctx.g.rnd);}else await ctx.g.withGraveyardEntryBatch(async()=>{for(const card of chosen)await ctx.g.move(card,'graveyard');});
    if(effect.rest==='battlefield')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const card of rest)if(current(card))await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!effect.tapped});});else for(const card of rest)if(current(card))await ctx.g.move(card,'hand');
    if(effect.chosen!=='library')M.shuffle(ctx.you.library,ctx.g.rnd);
    if(effect.exileSource)await h.runGenericEffects(ctx,[{action:'exile-resolving-spell'}]);return true;
   }
   if(effect.action==='grave-all-return-v22'){const filter=h.genericTargetSpec(effect.filter,[],0);await returnCards(ctx,ctx.you.graveyard.filter(card=>filter.filter(ctx.g,card,ctx.you,ctx.src)),effect);return true;}
   if(effect.action==='grave-group-return-v22'){await returnCards(ctx,h.genericEffectSubjects(ctx,effect.target),effect);return true;}
   if(effect.action==='grave-choice-v22'){
    await returnCards(ctx,await selectGrave(ctx,effect,h),effect);
    if(effect.bottomSource&&ctx.so?.card===ctx.src&&!ctx.so.isCopy&&ctx.src.zone==='stack'){await ctx.g.move(ctx.src,'library');const list=ctx.src.owner.library;list.splice(list.indexOf(ctx.src),1);list.unshift(ctx.src);}
    return true;
   }
   if(effect.action==='grave-mana-trio-v22'){
    const cards=[];for(const mv of [1,2,3])cards.push(...await selectGrave(ctx,{filter:{what:'creature',zone:'graveyard',controller:'you',stat:'mv',comparison:'equal',threshold:mv},min:1,max:1},h));
    await returnCards(ctx,cards,{destination:'battlefield'});return true;
   }
   if(effect.action==='grave-return-choice-counters-v22'){
    const returned=await returnCards(ctx,h.genericEffectSubjects(ctx,effect.target),{destination:'battlefield',controller:'owner'}),versions=new Map(returned.map(card=>[card,card.zoneVersion]));
    for(const counter of effect.counters){const from=returned.filter(card=>card.zone==='battlefield'&&card.zoneVersion===versions.get(card));if(!from.length)continue;const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:1,max:1,prompt:'Put a '+counter+' counter on a returned creature',aiHint:{kind:'recur'}});if(!Array.isArray(choice)||choice.length!==1||!from.includes(choice[0]))throw Error('Invalid returned-creature counter choice');if(choice[0].zone==='battlefield'&&choice[0].zoneVersion===versions.get(choice[0]))ctx.g.addCounters(choice[0],counter,1,false,ctx.you);}
    return true;
   }
   return false;
  }
 });
})(MTG);
