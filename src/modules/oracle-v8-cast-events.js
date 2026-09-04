((M)=>{
 function triggerFilter(rule,h){
  if(rule?.kind!=='qualified-cast-v8')return null;
  const spec=h.target(rule.target,[],0);
  return (game,source,data)=>{
   const so=data.so,player=data.player;if(so?.kind!=='spell'||!player)return false;
   if(rule.controller==='you'&&player!==source.ctrl||rule.controller==='opponent'&&player===source.ctrl)return false;
   if(rule.timing==='your-main'&&(game.turnPlayer!==source.ctrl||!['main1','main2'].includes(game.phase)))return false;
   if(rule.timing==='your-turn'&&game.turnPlayer!==source.ctrl||rule.timing==='opponent-turn'&&game.turnPlayer===source.ctrl)return false;
   const owner=rule.zoneOwner==='source'?source.ctrl:player;
   if(rule.from==='not-hand'&&so.from==='hand'&&so.card.owner===owner)return false;
   if(['library','graveyard'].includes(rule.from)&&(so.from!==rule.from||so.card.owner!==owner)||rule.from==='exile'&&so.from!=='exile')return false;
   if(rule.colors&&!rule.colors.every(color=>(so.card.castMeta?.spellColors||so.card.colors).includes(color)))return false;
   if(rule.target.withKeyword){
    const def=game.castDefinition(so.card,so.castOpts||{}),keywords=so.castOpts?.adventure?def.adventure?.kws||[]:def.kws||[];
    if(!keywords.includes(rule.target.withKeyword))return false;
   }
   if(rule.manaX){
    const def=game.castDefinition(so.card,so.castOpts||{}),cost=so.castOpts?.adventure?def.adventure?.cost:def.oracleSplit?game.oracleSplitPrintedCost(so.card,so.castOpts):def.cost;
    if(!String(cost||'').includes('{X}'))return false;
   }
   if(rule.targetsYouOrCreature&&!(so.targets||[]).flat().some(card=>card===source.ctrl||card instanceof M.CardInst&&card.zone==='battlefield'&&card.ctrl===source.ctrl&&card.is('Creature')))return false;
   return spec.filter(game,so,source.ctrl,source);
  };
 }
 M.OracleV8CastEvents={triggerFilter};
})(globalThis.MTG||={});
