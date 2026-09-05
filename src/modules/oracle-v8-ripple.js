((M)=>{
  const present=(player,entry)=>entry.card.zone==='library'&&entry.card.zoneVersion===entry.version&&player.library.includes(entry.card);
  function spellNames(game,so){
    // Immediate-cast previews use the selected face but do not carry the
    // completed Stack object's display name yet.
    const alt=so.castOpts||{},def=game.castDefinition(so.card,alt);
    const name=so.name||alt.name||(alt.adventure?so.card.def.adventure?.name:def.name);
    return M.OracleV8NameGroups.names({...so,name});
  }
  async function run(ctx){
    const {g:game,you:player,data}=ctx;
    const yes=await player.controller.decide(game,{type:'chooseOption',prompt:`Ripple ${data.n}: reveal the top ${data.n} cards?`,
      options:[{key:'yes',label:'Reveal cards'},{key:'no',label:'Decline'}],aiHint:{kind:'may'}});
    if(yes!=='yes')return;
    const entries=player.library.slice(-data.n).reverse().map(card=>({card,version:card.zoneVersion}));
    if(!entries.length)return;
    const names=game.stack.includes(data.so)?spellNames(game,data.so):data.names;
    const reveal={cards:entries.map(entry=>entry.card),ctrl:player,kind:'reveal',includeLands:true,title:`Ripple ${data.n}`};
    if(!player.isAI&&game.paced)await player.controller.decide(game,{...reveal,type:'cardReveal',player});
    else await game.revealToHuman(reveal);
    const matching=card=>M.OracleV8NameGroups.matches(names,M.OracleV8NameGroups.names(card));
    // Every iteration offers only this resolution's revealed cohort. Casting
    // may change the library or pay an additional cost, so recheck identity.
    while(true){
      const cards=entries.filter(entry=>present(player,entry)&&matching(entry.card)).map(entry=>entry.card);
      if(!cards.length)break;
      // The permission identifies matching revealed cards, not qualities of
      // the resulting spell. Either half of a matched split card is legal
      // (Thrumming Stone ruling, 2006-07-15; CR 702.60a, 709.4a).
      const cast=await M.OracleV8PlayPermissions.castOne(ctx,cards,{free:true},{});
      if(!cast)break;
    }
    const cards=entries.filter(entry=>present(player,entry)).map(entry=>entry.card);
    let ordered=cards;
    if(cards.length>1){
      ordered=await player.controller.decide(game,{type:'chooseCards',from:cards,min:cards.length,max:cards.length,
        prompt:'Ripple: order remaining cards for the bottom, top first',aiHint:{kind:'orderBottom'}});
      if(!Array.isArray(ordered)||ordered.length!==cards.length||new Set(ordered).size!==cards.length||ordered.some(card=>!cards.includes(card)))throw Error('Invalid Ripple bottom order');
    }
    const surviving=ordered.filter(card=>entries.some(entry=>entry.card===card&&present(player,entry)));
    for(const card of surviving)player.library.splice(player.library.indexOf(card),1);
    player.library.unshift(...surviving.slice().reverse());
    game.lg(`Ripple ${data.n}: ${entries.length} revealed; ${surviving.length} put on the bottom.`);
  }
  function onCast(game,data){
    const {card,so,player}=data;
    if(!card||!so||so.isCopy||!game.stack.includes(so))return;
    const own=!so.castOpts?.faceDownCast&&!so.castOpts?.adventure?game.castDefinition(card,so.castOpts).oracleRipple||[]:[];
    const grants=game.bf().filter(source=>source.ctrl===player&&!source.cur?.abilitiesDisabled).flatMap(source=>source.def.oracleGrantedRipple||[]);
    const instances=[...own,...grants];
    for(const [index,n]of instances.entries())game.queueTrigger({src:card,ctrl:player,name:`Ripple ${n}${instances.length>1?' · '+(index+1):''}`,
      data:{so,n,names:spellNames(game,so)},run});
  }
  function apply(script,operation){
    if(operation.kind!=='ripple-v8')return false;
    if(operation.contract!=='ripple-cast-chain'||operation.n!==4||!['self','your-spells'].includes(operation.scope)||Object.keys(operation).some(key=>!['kind','scope','n','contract'].includes(key)))throw Error('Invalid Ripple descriptor');
    (script[operation.scope==='self'?'oracleRipple':'oracleGrantedRipple']||=[]).push(operation.n);
    return true;
  }
  M.OracleV8Ripple={apply,onCast,spellNames};
})(globalThis.MTG||={});
