(() => {
 const M=globalThis.MTG,V=M.OracleV20,H=V.helpers,G=M.Game.prototype;
 V.handlers.push({layoutsV21:true,compile(op,script,entry,h){
  if(op.kind==='casting-waterbend-v21'){
   if(!Number.isSafeInteger(op.n)||op.n<1)throw Error('Invalid additional waterbend cost');
   script.oracleCastingWaterbendV21=op.n;const prior=script.selfCostAdjust;
   script.selfCostAdjust=(g,c,p,a)=>(prior?.(g,c,p,a)||0)+op.n;return true;
  }
  if(op.kind==='mechanic-compleated-v21'){
   script.compleated=true;
   if(op.perPip){const prior=script.asEnters;script.asEnters=async(g,c)=>{if(prior)await prior(g,c);const n=c.castMeta?.phyrexianLifePaid||0;if(n>1)c.meta.additionalLoyaltyCounters=(c.meta.additionalLoyaltyCounters||0)-2*(n-1);};}return true;
  }
  if(op.kind==='self-cost-v21'){
   const units=(g,c,p)=>Math.max(0,Math.floor(h.genericAmount(op.count,{g,src:c,you:p,targets:[]})));
   if(op.n){const prior=script.selfCostAdjust;script.selfCostAdjust=(g,c,p,a)=>(prior?.(g,c,p,a)||0)-op.n*units(g,c,p);}
   if(op.colors){const prior=script.selfColoredCostReduction;script.selfColoredCostReduction=(g,c,p)=>[...(prior?.(g,c,p)||[]),...Array.from({length:units(g,c,p)},()=>op.colors).flat()];}return true;
  }
  if(op.kind==='spell-cost-sequence-v21'){
   const filter=op.filter&&h.genericTargetSpec(op.filter,[],0).filter;
   (script.costMods||=[]).push((g,s,{player,card,castOpts={}})=>{
    if(s.ctrl!==player||s.zone!=='battlefield'||s.phasedOut||s.cur?.abilitiesDisabled)return 0;
    const previous=player.turnState.spellsCastList||[];
    // Turn records preserve types/subtypes from the actual cast; the current
    // physical card may have moved or changed characteristics since then.
    const typed=previous.filter(row=>op.quality==='all'||op.quality==='creature'&&row.isCreature||op.quality==='Dragon'&&(row.changeling||row.subtypes?.includes('Dragon'))||op.quality==='kicked'&&row.so?.kicked);
    return (!filter||filter(g,{kind:'spell',card,ctrl:player,castOpts},player,s))&&typed.length===op.nth-1?-op.n:0;
   });return true;
  }
  if(op.kind==='gift-spell-v21'){
   if(!['card','tapped Fish','Food','Treasure'].includes(op.gift))throw Error('Invalid Gift');
   const compile=part=>H.compileOracleScript(h.batch,{...entry,...part}),ordinary=compile(op.ordinary),promised=compile(op.promised);
   if(!ordinary.resolve||!promised.resolve)throw Error('Gift requires two complete spell bodies');
   const chosen=opts=>opts?.bdfGift?promised:ordinary;
   const metadata=new Set(['oracleBatch','oracleId','oracleImplemented','semanticClass','implementedKeywords','oracleContracts','oracleImplementation']);
   for(const [key,value]of Object.entries(ordinary))if(!metadata.has(key))script[key]=value;
   script.bdfGift=op.gift;script.altCosts=[...(ordinary.altCosts||[]),{label:'Promise a gift: '+op.gift,bdfGift:true}];
   script.targets=(g,c,opts)=>{const targets=chosen(opts).targets||[];return typeof targets==='function'?targets(g,c,opts):targets;};
   script.prepareTargets=async ctx=>{const prepare=chosen(ctx.so?.castOpts).prepareTargets;return !prepare||await prepare(ctx)!==false;};
   script.resolve=async ctx=>{
    const recipient=ctx.g.players.find(player=>player.idx===ctx.so?.bdfGiftPlayer);
    if(ctx.so?.castOpts?.bdfGift&&recipient&&!recipient.lost){
     if(op.gift==='card')await ctx.g.draw(recipient,1,ctx.src);
     else if(op.gift==='tapped Fish')await ctx.g.makeTokens({name:'Fish',types:['Creature'],subtypes:['Fish'],super:[],colorsOverride:['U'],power:'1',toughness:'1',oracle:'',kws:[],isTokenDef:true},recipient,{tapped:true});
     else await ctx.g.makeTokens(M.TOKENS[op.gift.toLowerCase()],recipient);
     await ctx.g.emit('bdfGift',{player:ctx.you,recipient,card:ctx.src});
    }
    await chosen(ctx.so?.castOpts).resolve(ctx);
   };return true;
  }
  if(op.kind==='mechanic-read-ahead-v21'){
   if(!Number.isInteger(op.chapters)||op.chapters<1||op.chapters>10)throw Error('Invalid Read ahead chapters');
   const prior=script.asEnters;script.asEnters=async(g,c)=>{
    if(prior)await prior(g,c);
    const options=Array.from({length:op.chapters},(_,i)=>({key:String(i+1),label:'Begin at chapter '+(i+1)}));
    const key=await c.ctrl.controller.decide(g,{type:'chooseOption',options,prompt:c.name+': Read ahead',aiHint:{kind:'readAhead',card:c}}),n=Number(key);
    if(!options.some(option=>option.key===key)||!Number.isInteger(n))throw Error('Invalid Read ahead choice');
    c.counters.lore=n-1;c.meta.cwwReadAhead=n;
   };return true;
  }
  if(op.kind==='generic-trigger'&&op.transformNameV21){
   for(const event of op.event){const tr=H.compileGenericTrigger({...op,event}),prior=tr.filter;(script.triggers||=[]).push({...tr,filter:(g,c,d)=>(!prior||prior(g,c,d))&&(event!=='transformed'||c.name===op.transformNameV21)});}return true;
  }
  return false;
 },async effect(ctx,op){
  if(op.action==='exile-play-v21'){
   const owner=H.genericEffectSubjects(ctx,op.who)[0],n=H.genericAmount(op.n,ctx),cards=n>0?owner?.library?.slice(-n).reverse()||[]:[];
   if(op.look&&!ctx.you.isAI&&cards.length)await ctx.you.controller.decide(ctx.g,{type:'cardReveal',player:ctx.you,cards,kind:'look',private:true});
   for(const card of cards){const version=card.zoneVersion;if(card.zone!=='library'||!card.owner.library.includes(card))continue;
    await ctx.g.move(card,'exile',{exileFaceDown:op.faceDown,exileLookers:op.faceDown?[ctx.you.idx]:[]});if(card.zone!=='exile'||card.zoneVersion===version)continue;
    const grantedVersion=card.zoneVersion;card.meta.playableBy=ctx.you;card.meta.spellsOnly=op.spellsOnly;card.meta.oracleExilePermissionV21={version:grantedVersion,player:ctx.you};
    if(op.duration==='next-turn')card.meta.playableUntilOwnTurn=ctx.you.turnsStarted+1;else card.meta.playableUntil=op.duration==='eot'?ctx.g.turnNo:Infinity;
    if(op.condition)card.meta.playableCondition=(g,p,c)=>c.zone==='exile'&&c.zoneVersion===grantedVersion&&H.genericCondition(g,ctx.src,op.condition,p);
    if(op.duration==='next-end-step')ctx.g.delayed.push({on:'oracleExilePermissionExpiryV21',once:true,src:ctx.src,ctrl:ctx.you,name:'Exile play permission expires',oracleExileEndPermissionV21:{card,version:grantedVersion,player:ctx.you},run:()=>{}});
   }return true;
  }
  if(op.action!=='return-faced-source-v21')return false;
  const card=ctx.src,version=ctx.sourceZoneVersion??ctx.oracleSourceCapture?.zoneVersion,graveVersion=ctx.data?.card===card?ctx.data.graveyardZoneVersion:undefined;
  // The source may have departed before this trigger is placed or resolved.
  // It is still the source only in the first graveyard incarnation reached
  // from the captured battlefield object (or current graveyard activation).
  const departed=card?.zone==='graveyard'&&!card.isToken&&(graveVersion!==undefined?card.zoneVersion===graveVersion:card.zoneVersion===version)&&card.owner.graveyard.includes(card);
  if(!departed||op.face==='back'&&card.oracleFaces?.layout!=='transform'||op.face==='flip'&&!card.def.c1719FlipBack)return true;
  const target=op.attachTarget===undefined?null:H.genericEffectSubjects(ctx,op.attachTarget)[0];
  if(op.attachTarget!==undefined&&(!target||target instanceof M.Player&&target.lost))return true;
  await ctx.g.move(card,'battlefield',{ctrl:op.controller==='you'?ctx.you:card.owner,tapped:op.tapped,...(op.face==='back'?{oracleFace:'back'}:{entryMeta:{c1719Flipped:true}}),...(target?target instanceof M.Player?{cursedPlayer:target}:{attachTo:target}:{}),...(op.counter?{additionalCounters:{[op.counter]:op.n}}:{})});
  return true;
 }});
 const waterbend=(g,action)=>{
  if(!action?.card||action.isAbility||action.isSpecialAction||action.foretellAction||action.turnFaceUp||action.castOpts?.faceDownCast)return action;
  const n=g.castDefinition(action.card,action.castOpts||{}).oracleCastingWaterbendV21;
  return n?Object.assign(action,{waterbendV10:n}):action;
 };
 const solve=G.manaSolve;G.manaSolve=function(p,cost,action,opts){return solve.call(this,p,cost,waterbend(this,action),opts);};
 const pay=G.payMana;G.payMana=async function(p,cost,action,opts={}){
  waterbend(this,action);const paid=await pay.call(this,p,cost,action,opts);
  if(paid&&opts.isSpell&&!opts.prepareOnlyV20&&action?.waterbendV10)await this.emit('waterbend',{player:p,card:action.card,n:action.waterbendV10});
  return paid;
 };
 const emit=G.emit;G.emit=function(name,data,...rest){
  if(name==='endStep'){const expired=this.delayed.filter(row=>row.oracleExileEndPermissionV21?.player===data.player);this.delayed=this.delayed.filter(row=>!expired.includes(row));for(const row of expired){const {card,version}=row.oracleExileEndPermissionV21;if(card.zone==='exile'&&card.zoneVersion===version){delete card.meta.playableUntil;delete card.meta.playableBy;delete card.meta.playableCondition;delete card.meta.oracleExilePermissionV21;}}}
  return emit.call(this,name,data,...rest);
 };
 const move=G.move;G.move=async function(card,...args){
  const metadata=card.meta,grant=metadata?.oracleExilePermissionV21,result=await move.call(this,card,...args);
  if(grant&&card.zoneVersion!==grant.version&&card.meta===metadata&&metadata.oracleExilePermissionV21===grant){for(const key of ['playableBy','playableUntil','playableUntilOwnTurn','playableCondition','spellsOnly','oracleExilePermissionV21'])delete metadata[key];}
  return result;
 };
 const cast=G.castSpell;G.castSpell=function(player,card,options={}){
  const grant=card.meta?.oracleExilePermissionV21;
  if((options.from||card.zone)==='exile'&&grant&&(!this.hasExilePlayPermission(player,card)||card.meta.playableCondition&&!card.meta.playableCondition(this,player,card)))return false;
  return cast.call(this,player,card,options);
 };
})();
