((MTG)=>{
 const family=effect=>effect.action==='library-select-v8'||effect.action==='with-card-results-v8'?'selected-hand':['mill','discard','discard-hand'].includes(effect.action)?effect.action==='discard-hand'?'discard':effect.action:
  effect.action==='exile'||effect.action==='exile-top'||effect.action==='zone-select'&&effect.destination==='exile'||effect.action==='battlefield-group'&&effect.operation==='exile'?'exile':
  effect.action==='choose-permanents'&&effect.operation==='sacrifice'?'sacrifice':null;
 const players=(ctx,who,h)=>who==='each-player'?ctx.g.alivePlayers():who==='each-opponent'?ctx.g.alivePlayers().filter(p=>p!==ctx.you):who==='you'?[ctx.you]:h.subjects(ctx,who);
 function view(game,card){const snap=game.snapshot(card);const values={zone:'graveyard',ctrl:snap.ctrl,owner:card.owner,name:snap.name,mv:snap.mv,colors:snap.colors,power:snap.power,toughness:snap.toughness,counters:{...snap.counters},def:snap.def,cur:{...card.cur,types:snap.types,subtypes:snap.subtypes,super:snap.def?.super||[]},is:type=>snap.types.includes(type),hasSub:type=>snap.subtypes.includes(type)||snap.changeling&&MTG.CREATURE_SUBTYPES.has(type),kw:keyword=>snap.kw.includes(keyword)};return Object.defineProperties(Object.create(card),Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value,configurable:true}])));}
 MTG.OracleV8Results={
  family,
  async capture(ctx,effect,run,h){
   const event=family(effect);if(!event||event!==ctx.oracleResolutionResults.event)return run();
   const matching=(cards,filter)=>!filter?cards:cards.filter(card=>h.target({...filter,controller:'any'},[],0).filter(ctx.g,card,ctx.you,ctx.src));
   let cards=[];
   if(event==='selected-hand'){
    const n=effect.action==='library-select-v8'?h.amount(effect.n,ctx):effect.effects.reduce((total,child)=>total+h.amount(child.n,ctx),0);
    cards=n>0?ctx.you.library.slice(-n):[];
   }
   else if(event==='mill'||event==='discard')cards=players(ctx,effect.who,h).flatMap(player=>event==='mill'?(h.amount(effect.n,ctx)>0?player.library.slice(-h.amount(effect.n,ctx)):[]):player.hand);
   else if(effect.action==='exile-top')cards=players(ctx,effect.who,h).flatMap(player=>(h.amount(effect.n,ctx)>0?player.library.slice(-h.amount(effect.n,ctx)):[]));
   else if(effect.action==='exile')cards=h.subjects(ctx,effect.target);
   else if(effect.action==='zone-select')cards=players(ctx,effect.who,h).flatMap(player=>matching(player[effect.zone],effect.filter));
   else if(effect.action==='battlefield-group')cards=ctx.g.bf().filter(card=>effect.filters.some(filter=>h.target(filter,[],0).filter(ctx.g,card,ctx.you,ctx.src)));
   else if(effect.action==='choose-permanents')cards=players(ctx,effect.who,h).flatMap(player=>matching(ctx.g.bf().filter(card=>card.ctrl===player&&ctx.g.canSacrifice(card)),effect.filter));
   const rows=[...new Set(cards)].map(card=>({card,version:card.zoneVersion,zone:card.zone,view:view(ctx.g,card)}));
   await run();
   for(const row of rows)if(row.card.zoneVersion!==row.version&&(event!=='selected-hand'||row.card.zone==='hand')&&(event!=='exile'||row.card.zone==='exile'||row.card.isToken&&row.zone==='battlefield'&&row.card.zone==='ceased')){
    ctx.oracleResolutionResults.cards.push({card:row.card,version:row.card.zoneVersion,view:row.zone==='battlefield'?row.view:view(ctx.g,row.card)});
   }
  },
  async run(ctx,effect,h){
   const record={event:effect.event,cards:[]};
   await h.run({...ctx,oracleResolutionResults:record,oracleResultCaptureInner:false},effect.effects);
   for(const clause of effect.clauses){
    const filter=h.target({...clause.filter,controller:'any'},[],0).filter;
    const matches=record.cards.filter(row=>filter(ctx.g,row.view,ctx.you,ctx.src));
    const satisfied=!clause.shared?matches.length>0:matches.some((a,i)=>matches.slice(i+1).some(b=>clause.shared==='a color'?a.view.colors.some(color=>b.view.colors.includes(color)):clause.shared==='a card type'?a.view.cur.types.some(type=>b.view.cur.types.includes(type)):clause.shared==='all their card types'?a.view.cur.types.length===b.view.cur.types.length&&a.view.cur.types.every(type=>b.view.cur.types.includes(type)):false));
    if(clause.action==='result-scaled-v8'){
     const child=clause.effects[0];if(matches.length)await h.run(ctx,[{...child,n:child.n*matches.length}]);
    }else if(clause.action==='result-select-v8'){
     // Follow a replacement destination, but never a later zone change. A card
     // shuffled into a hidden library cannot be identified by this instruction.
     const eligible=matches.filter(row=>row.card.zoneVersion===row.version&&['graveyard','exile'].includes(row.card.zone));
     const from=eligible.map(row=>row.card),max=Math.min(clause.max,from.length);
     const picked=max?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min:0,max,prompt:'Choose a milled card for your hand',aiHint:{kind:'bestCard'}}):[];
     if(!Array.isArray(picked)||picked.length>max||new Set(picked).size!==picked.length||picked.some(card=>!from.includes(card)))throw new Error('Invalid bound-result selection');
     let moved=false;
     for(const row of eligible.filter(row=>picked.includes(row.card)))if(row.card.zoneVersion===row.version&&['graveyard','exile'].includes(row.card.zone)){
      await ctx.g.move(row.card,'hand');moved=moved||row.card.zone==='hand'&&row.card.zoneVersion!==row.version;
     }
     if(!moved)await h.run(ctx,clause.elseEffects||[]);
    }else if(clause.action==='result-if-v8')await h.run(ctx,satisfied?clause.effects:clause.elseEffects||[]);
    else throw new Error('Unknown bound card-result clause');
   }
   return record;
  },
 };
})(globalThis.MTG);
