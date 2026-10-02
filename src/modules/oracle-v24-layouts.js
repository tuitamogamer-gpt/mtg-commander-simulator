(() => {
 const M=globalThis.MTG,H=M.OracleV20.helpers;
 const key=(ctx,e)=>M.OracleV24Permanents.linked(ctx.g,ctx.src,e.link,ctx);
 const locked=cards=>cards.map(card=>({card,version:card.zoneVersion,zone:card.zone}));
 const current=(ctx,row)=>row.card.zone===row.zone&&row.card.zoneVersion===row.version&&(row.zone==='battlefield'?ctx.g.bf().includes(row.card):row.card.owner[row.zone]?.includes(row.card));
 const match=(ctx,filter,card)=>H.genericTargetSpec({...filter,zone:card.zone,controller:'any'},[],0,{...ctx.data,oracleX:ctx.so?.x??ctx.x,oracleSourceCapture:ctx.oracleSourceCapture||{zoneVersion:ctx.sourceZoneVersion}}).filter(ctx.g,card,ctx.you,ctx.src);
 async function select(ctx,rows,min,max,prompt,search=false){
  if(!rows.length)return [];
  const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from:rows.map(row=>row.card),min,max,prompt,search,aiHint:{kind:'bestCard',src:ctx.src}});
  if(!Array.isArray(answer)||answer.length<min||answer.length>max||new Set(answer).size!==answer.length||answer.some(card=>!rows.some(row=>row.card===card&&current(ctx,row))))throw Error('Invalid exact chapter selection');
  return answer;
 }
 const handler={layoutsV24:true,amount(value,ctx){if(value.kind==='chapter-linked-mv-v24')return key(ctx,value).reduce((sum,card)=>sum+card.mv,0);if(value.kind==='chapter-land-difference-v24'){const player=H.genericEffectSubjects(ctx,value.target)[0];return Math.max(0,ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.is('Land')).length-ctx.g.bf().filter(c=>c.ctrl===player&&c.is('Land')).length);}},async effect(ctx,e){
  if(e.action==='loyalty-twice-v24'){ctx.you.turnState.oracleLoyaltyTwiceV24Turn=ctx.g.turnNo;return true;}
  if(e.action==='repeat-draw-hand-land-v24'){const once=async()=>{await ctx.g.draw(ctx.you,1,ctx.src);await handler.effect(ctx,{action:'put-qualified-hand-v24',filter:{what:'land',zone:'hand',controller:'you'},tapped:true});};await once();if(ctx.g.bf().filter(c=>c.ctrl===ctx.you&&c.is('Land')).length>=e.threshold)await once();return true;}
  if(e.action==='draw-greatest-power-v24'){const creatures=ctx.g.creatures(),greatest=creatures.length?Math.max(...creatures.map(c=>c.power)):null;if(greatest!==null&&creatures.some(c=>c.ctrl===ctx.you&&c.power===greatest))await ctx.g.draw(ctx.you,e.n,ctx.src);return true;}
  if(e.action==='chapter-player-loses-v24'){for(const player of H.genericEffectSubjects(ctx,e.who))await ctx.g.playerLoses(player,'Oracle instruction');return true;}
  if(e.action==='chapter-tap-cohort-v24'){const players=H.genericEffectSubjects(ctx,e.who),cards=ctx.g.bf().filter(c=>players.includes(c.ctrl)&&!c.is('Land'));for(const card of cards){ctx.g.tap(card);card.meta.noUntapOnce=true;}return true;}
  if(e.action==='chapter-exile-greatest-v24'){const players=H.genericEffectSubjects(ctx,e.who),cards=ctx.g.creatures().filter(c=>players.includes(c.ctrl));if(cards.length){const greatest=Math.max(...cards.map(c=>c.power)),rows=locked(cards.filter(c=>c.power===greatest)),chosen=await select(ctx,rows,1,1,'Choose a creature with greatest power');await ctx.g.exileMany(chosen);}return true;}
  if(e.action==='put-qualified-hand-v24'){
   const rows=locked(ctx.you.hand.filter(card=>match(ctx,e.filter,card)&&(e.totalPowerToughness===undefined||card.power+card.toughness<=e.totalPowerToughness))),chosen=await select(ctx,rows,0,1,'Choose a qualified permanent card from your hand');
   let moved=false;
   if(chosen.length){const row=rows.find(row=>row.card===chosen[0]);await ctx.g.putPermanentOntoBattlefield(row.card,ctx.you,{tapped:!!e.tapped});moved=row.card.zoneVersion!==row.version;
    if(moved&&e.ifMoved)await H.runGenericEffects(ctx,e.ifMoved);
    if(row.card.zone==='battlefield'&&row.card.zoneVersion===row.version+1){
     const card=row.card,version=card.zoneVersion;if(e.haste){card.meta.oracleHaste=true;ctx.g.recalc();}
     if(e.delayed)ctx.g.delayed.push({on:'endStep',once:true,src:ctx.src,ctrl:ctx.you,name:'Chosen hand permanent — '+e.delayed,run:async next=>{if(card.zone!=='battlefield'||card.zoneVersion!==version)return;if(e.delayed==='sacrifice'){if(card.ctrl===next.you)await next.g.sacrifice(next.you,card);}else await next.g.move(card,'hand');}});
    }
   }
   if(!moved&&e.elseEffects)await H.runGenericEffects(ctx,e.elseEffects);return true;
  }
  if(e.action==='chapter-linked-search-v24'||e.action==='chapter-linked-choose-v24'){
   const search=e.action==='chapter-linked-search-v24',zone=search?'library':e.from,n=Math.max(0,Math.floor(H.genericAmount(e.n??1,ctx))),cards=search?(ctx.g.searchableLibrary?.(ctx.you)||[]):ctx.you[zone],rows=locked(cards.filter(card=>match(ctx,e.filter,card))),max=Math.min(n,rows.length),chosen=await select(ctx,rows,e.required||!search&&!e.optional?max:0,max,search?'Search your library for a chapter-linked card':'Choose a permanent card to exile from your graveyard',search),manaValue=chosen.reduce((sum,card)=>sum+card.mv,0);
   await M.OracleV24Permanents.acquire(ctx,{link:e.link,from:zone,faceDown:!!e.faceDown,lookAllowed:search},chosen);
   if(search)M.shuffle(ctx.you.library,ctx.g.rnd);if(e.gainManaValue)await ctx.g.gainLife(ctx.you,manaValue,ctx.src);return true;
  }
  if(e.action==='chapter-linked-release-one-v24'){
   const rows=locked(key(ctx,e)),chosen=await select(ctx,rows,Math.min(1,rows.length),1,'Choose a card exiled with this Saga');
   for(const card of chosen)await ctx.g.move(card,e.to);return true;
  }
  if(e.action==='chapter-linked-avacyn-v24'){
   const rows=locked(key(ctx,e));
   if(e.mode==='reveal'){
    for(const row of rows)if(current(ctx,row)){row.card.faceDown=false;row.card.faceDownKind=null;delete row.card.meta.revealedTo;}
    ctx.g.recalc();if(rows.length)await ctx.g.revealToHuman({cards:rows.map(row=>row.card),ctrl:ctx.you,kind:'reveal'});
    const cards=rows.filter(row=>current(ctx,row)).map(row=>row.card);if(cards.some(card=>card.is('Creature')))await ctx.g.loseLife(ctx.you,cards.reduce((sum,card)=>sum+card.mv,0),ctx.src.name);return true;
   }
   if(e.mode!=='release')throw Error('Invalid chapter-linked release mode');
   let answer='no';if(rows.some(row=>!row.card.faceDown&&row.card.is('Creature'))){answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Put all linked permanent cards onto the battlefield?',options:[{key:'yes',label:'Put all permanent cards onto the battlefield'},{key:'no',label:'Put all cards into their owners’ hands'}],aiHint:{kind:'optTrigger',src:ctx.src}});if(!['yes','no'].includes(answer))throw Error('Invalid linked all-or-none choice');}
   if(answer==='yes')await ctx.g.withBattlefieldEntryBatch(async()=>{for(const row of rows)if(current(ctx,row)&&!row.card.faceDown&&['Artifact','Battle','Creature','Enchantment','Land','Planeswalker'].some(type=>row.card.is(type)))await ctx.g.putPermanentOntoBattlefield(row.card,ctx.you);});
   for(const row of rows)if(current(ctx,row))await ctx.g.move(row.card,'hand');return true;
  }
  return false;
 }};
 M.OracleV20.handlers.push(handler);M.OracleV24Layouts={run:handler.effect};
})();
