((M)=>{
 const actions=new Set(['create-token-group-v8','tempting-offer-v8']);
 async function run(ctx,effect,h){
  if(effect.action==='create-token-group-v8'){
   const made=[];
   await ctx.g.withBattlefieldEntryBatch(async()=>{for(const child of effect.effects){await h.effect(ctx,child);made.push(...ctx._oracleCreatedTokens||[]);}});
   ctx._oracleCreatedTokens=made;return;
  }
  if(effect.action!=='tempting-offer-v8')throw new Error('Unsupported token form');
  await h.run(ctx,effect.effects);
  const opponents=ctx.g.apnapFrom(ctx.g.turnPlayer||ctx.you).filter(player=>player!==ctx.you&&!player.lost),accepted=[];
  // Make every opponent's optional choice before performing those actions.
  for(const player of opponents){
   const choice=await player.controller.decide(ctx.g,{type:'chooseOption',player,prompt:'Accept '+ctx.src.name+"'s offer?",options:[{key:'yes',label:'Accept'},{key:'no',label:'Decline'}],aiHint:{kind:'optTrigger',src:ctx.src,name:'Tempting offer'}});
   if(choice==='yes')accepted.push(player);
  }
  // A printed draw instruction and a token-creation instruction remain
  // separate events. Each token group enters simultaneously (CR 101.4).
  for(const child of effect.offered)await ctx.g.withBattlefieldEntryBatch(async()=>{
   for(const player of accepted)if(!player.lost)await h.effect({...ctx,you:player},child);
  });
  if(accepted.length&&!ctx.you.lost)for(const child of effect.reward)await h.effect(ctx,{...child,n:child.n*accepted.length});
 }
 M.OracleV8TokenForms={actions,run};
})(globalThis.MTG||={});
