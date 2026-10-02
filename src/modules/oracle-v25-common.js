'use strict';
((M)=>{
 const G=M.Game.prototype,targets=G.pickTargets,activate=G.activateAbility;
 G.activateAbility=function(player,entry,presetTargets){
  // UI/AI target suggestions cannot replace a printed random target choice.
  if(entry?.ability?.targets?.some?.(spec=>spec.oracleRandomV25))presetTargets=undefined;
  return activate.call(this,player,entry,presetTargets);
 };
 G.pickTargets=async function(ctx,specs,src,player){
  if(!specs?.some(spec=>spec.oracleRandomV25))return targets.call(this,ctx,specs,src,player);
  const decide=player.controller.decide;player.controller.decide=function(game,q){if(q.type==='chooseTargets'&&q.spec?.oracleRandomV25)return q.candidates.length?[q.candidates[Math.floor(game.rnd()*q.candidates.length)]]:[];return decide.call(this,game,q);};
  try{return await targets.call(this,ctx,specs,src,player);}finally{player.controller.decide=decide;}
 };
 const players=(ctx,who,h)=>h.genericEffectSubjects(ctx,who).filter(p=>p instanceof M.Player&&!p.lost);
 const matches=(ctx,card,owner,filter,h)=>h.genericTargetSpec({...filter,zone:card.zone,controller:'any'},[],0).filter(ctx.g,card,owner,ctx.src);
 const reveal=(ctx,owner,look)=>ctx.g.revealToHuman({cards:owner.hand.slice(),ctrl:look?ctx.you:owner,kind:look?'look':'reveal',includeLands:true});
 const live=(row,owner)=>row.card.zone===row.zone&&row.card.zoneVersion===row.version&&owner[row.zone].includes(row.card);
 const choose=async(ctx,owner,from,optional,prompt)=>{
  const min=optional?0:Math.min(1,from.length),rows=from.map(card=>({card,version:card.zoneVersion,zone:card.zone}));
  const answer=from.length?await ctx.you.controller.decide(ctx.g,{type:'chooseCards',from,min,max:1,prompt,aiHint:{kind:'bestCard'}}):[];
  if(!Array.isArray(answer)||answer.length<min||answer.length>1||answer.some(card=>!from.includes(card)))throw Error('Invalid hand choice');
  return rows.filter(row=>answer.includes(row.card)&&live(row,owner));
 };
 M.OracleV20.handlers.push({commonV25:true,compile(op,script,entry,h){
  if(!op.targets?.some(target=>target.oracleRandomV25))return false;
  const tag=compiled=>{for(const [index,target]of (compiled.targets||[]).entries())if(op.targets[index]?.oracleRandomV25)target.oracleRandomV25=true;return compiled;};
  if(op.kind==='generic-trigger'){h.triggers.push(tag(h.compileGenericTrigger(op)));return true;}
  if(op.kind==='generic-ability'){h.abilities.push(tag(h.compileGenericAbility(op)));return true;}return false;
 },async effect(ctx,e,h){
  if(e.action==='random-creature-damage-v25'){
   const candidates=ctx.g.bf().filter(card=>card.is('Creature')&&card.ctrl!==ctx.you&&!card.ctrl.lost);if(candidates.length)await h.runGenericEffect({...ctx,targets:[candidates[Math.floor(ctx.g.rnd()*candidates.length)]],_oracleTargetControllers:undefined},{action:'damage',target:0,n:e.n});return true;
  }
  if(e.action==='fateseal-v25'){
   if(e.optional&&(await ctx.you.controller.decide(ctx.g,{type:'chooseOption',prompt:'Fateseal '+e.n+'?',options:[{key:'yes',label:'Yes'},{key:'no',label:'No'}],aiHint:{kind:'optTrigger',src:ctx.src}}))!=='yes')return true;
   const owner=await M.E.chooseOpponent(ctx.g,ctx.you,{prompt:'Fateseal — choose an opponent',goal:'fateseal'});if(!owner)return true;
   const cards=owner.library.slice(-e.n).reverse(),versions=new Map(cards.map(c=>[c,c.zoneVersion]));if(!cards.length)return true;
   const answer=await ctx.you.controller.decide(ctx.g,{type:'scry',cards,player:ctx.you,libraryOwner:owner,prompt:'Fateseal '+e.n+' — '+owner.name+"'s library",aiHint:{kind:'fateseal',owner}});
   const top=answer?.top,bottom=answer?.bottom,chosen=Array.isArray(top)&&Array.isArray(bottom)?[...top,...bottom]:[];
   if(chosen.length!==cards.length||new Set(chosen).size!==cards.length||chosen.some(c=>!cards.includes(c)))throw Error('Invalid fateseal ordering');
   const valid=card=>card.zone==='library'&&card.zoneVersion===versions.get(card)&&owner.library.includes(card);
   const onTop=top.filter(valid),onBottom=bottom.filter(valid),moving=new Set([...onTop,...onBottom]);owner.library=owner.library.filter(card=>!moving.has(card));owner.library.unshift(...onBottom);owner.library.push(...onTop.slice().reverse());return true;
  }
  if(e.action==='clash-control-attached-v25'){
   const host=h.genericEffectSubjects(ctx,e.target)[0],version=host?.zoneVersion;
   const result=await ctx.g.clash(ctx.you,{source:ctx.src}),controller=result.won?ctx.you:result.opponent;
   if(controller&&host?.zone==='battlefield'&&host.zoneVersion===version){M.OracleV8Control.gain(ctx.g,host,controller);ctx.g.recalc();}return true;
  }
  if(e.action==='tokens-clash-keywords-v25'){
   await h.runGenericEffect(ctx,e.create);const created=ctx._oracleCreatedTokens||[];
   const result=await ctx.g.clash(ctx.you,{source:ctx.src});
   if(result.won)for(const {card,zoneVersion}of created)if(card.zone==='battlefield'&&card.zoneVersion===zoneVersion)await h.runGenericEffect({...ctx,targets:[card],_oracleTargetControllers:undefined},{action:'pump',target:0,power:0,toughness:0,keywords:e.keywords});
   return true;
  }
  if(!['hand-choice-v25','hand-duplicates-v25','hand-grave-choices-v25','hand-sacrifice-colors-v25','hand-grave-exile-v25'].includes(e.action))return false;
  for(const owner of players(ctx,e.who,h)){
   await reveal(ctx,owner,!!e.look);
   if(e.action==='hand-choice-v25'){
    const from=owner.hand.filter(card=>matches(ctx,card,owner,e.filter,h));
    const rows=e.random&&from.length?[{card:from[Math.floor(ctx.g.rnd()*from.length)],zone:'hand'}]:await choose(ctx,owner,from,e.optional,'Choose a card from '+owner.name+"'s hand");
    if(e.random&&rows.length)rows[0].version=rows[0].card.zoneVersion;
    for(const row of rows){if(!live(row,owner))continue;const card=row.card;
     if(e.revealChosen)await ctx.g.revealToHuman({cards:[card],ctrl:owner,kind:'reveal',includeLands:true});
     if(!live(row,owner))continue;
     if(e.destination==='discard')await ctx.g.discard(owner,[card]);else await ctx.g.move(card,'library',{toBottom:true});
     // The printed draw follows the accepted choice even if movement is replaced.
     if(e.drawChosen)await ctx.g.draw(owner,1,ctx.src);
    }
   }else if(e.action==='hand-duplicates-v25'){
    const counts=new Map();for(const card of owner.hand)counts.set(card.name,(counts.get(card.name)||0)+1);
    await ctx.g.discard(owner,owner.hand.filter(card=>!card.is('Land')&&counts.get(card.name)>1));
   }else if(e.action==='hand-sacrifice-colors-v25'){
    const snapshot=ctx.sacd?.[0]||ctx.sacdSelf||ctx.so?.oracleV4AdditionalCost?.sacrifices?.[0]?.snapshot||ctx.so?.sacdSnaps?.[0],colors=snapshot?.colors||[];
    await ctx.g.discard(owner,owner.hand.filter(card=>colors.some(color=>card.colors.includes(color))));
   }else if(e.action==='hand-grave-choices-v25'){
    const picked=[];for(const [index,zone]of ['hand','graveyard'].entries())picked.push(...await choose(ctx,owner,owner[zone].filter(card=>matches(ctx,card,owner,e.filters[index],h)),false,'Choose an artifact or creature card from '+zone));
    for(const row of picked)if(live(row,owner))await ctx.g.move(row.card,'exile');
   }else{
    const picked=['hand','graveyard'].flatMap(zone=>owner[zone].filter(card=>matches(ctx,card,owner,e.filter,h)).map(card=>({card,version:card.zoneVersion,zone})));
    for(const row of picked)if(live(row,owner))await ctx.g.move(row.card,'exile');
   }
  }return true;
 }});
})(MTG);
