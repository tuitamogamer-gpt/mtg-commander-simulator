((M)=>{
 function replace(value,stats){
  if(Array.isArray(value))return value.map(child=>replace(child,stats));
  if(value&&typeof value==='object')return value.kind==='revealed-card-stat-v8'?stats[value.stat]:Object.fromEntries(Object.entries(value).map(([key,child])=>[key,replace(child,stats)]));
  return value;
 }
 M.OracleV8Revealed={async run(ctx,effect,h){
  if(effect.optional){const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Reveal the top card of your library?',options:[{key:'yes',label:'Reveal'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(choice))throw new Error('Invalid optional reveal choice');if(choice==='no')return null;}
  const card=ctx.you.library.at(-1);if(!card)return null;
  let version=card.zoneVersion,boundZone='library',stats,view;
  const publicZones=['battlefield','graveyard','exile','stack'];
  const refresh=()=>{
   if(card.zoneVersion!==version||card.zone!==boundZone)return;
   const snap=ctx.g.snapshot(card);stats={mv:card.mv,power:card.power,toughness:card.toughness};
   view=Object.defineProperties(Object.create(card),{zone:{value:'graveyard'},cur:{value:{...card.cur,types:snap.types,subtypes:snap.subtypes,super:snap.def.super}},def:{value:snap.def},colors:{value:snap.colors},power:{value:stats.power},toughness:{value:stats.toughness},mv:{value:stats.mv},is:{value:type=>snap.types.includes(type)},hasSub:{value:type=>snap.subtypes.includes(type)||snap.changeling&&M.CREATURE_SUBTYPES.has(type)},kw:{value:keyword=>snap.kw.includes(keyword)}});
  };
  refresh();const revealedStats={...stats};
  await ctx.g.revealToHuman({cards:[card],ctrl:ctx.you,kind:'reveal',includeLands:true});
  const run=async effects=>{
   for(const child of effects){
    refresh();
    if(child.action!=='revealed-move-v8'){
     await h.run(ctx,[replace(child,stats)]);
     // CR 400.7j follows moves caused by this effect into public zones. A
     // move to hand keeps the information from before that hidden-zone move.
     if(card.zoneVersion!==version&&publicZones.includes(card.zone)){version=card.zoneVersion;boundZone=card.zone;refresh();}
     continue;
    }
    if(card.zoneVersion!==version||card.zone!=='library'||!ctx.you.library.includes(card))continue;
    if(child.optional){const choice=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Move the revealed card?',options:[{key:'yes',label:'Move '+card.name},{key:'no',label:'Leave card'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(choice))throw new Error('Invalid revealed-card move choice');if(choice==='no')continue;}
    if(card.zoneVersion!==version||card.zone!=='library'||!ctx.you.library.includes(card))continue;
    if(child.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(card,ctx.you,{tapped:!!child.tapped});
    else await ctx.g.move(card,child.destination==='bottom'?'library':child.destination,{toBottom:child.destination==='bottom'});
    if(publicZones.includes(card.zone)||child.destination==='bottom'){version=card.zoneVersion;boundZone=card.zone;refresh();}
   }
  };
  for(const clause of effect.clauses){refresh();const matched=!clause.filter||h.target({...clause.filter,controller:'any'},[],0).filter(ctx.g,view,ctx.you,ctx.src);await run((clause.invert?!matched:matched)?clause.effects:clause.elseEffects||[]);}
  return {card,stats:revealedStats};
 }};
})(globalThis.MTG||={});
