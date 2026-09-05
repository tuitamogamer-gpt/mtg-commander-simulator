((M)=>{
  const types=(card,snap)=>snap?.types||card.def.types;
  function sources(game){
    const rows=new Map();
    const relevant=def=>def?.opponentGraveyardVoid||def?.oracleZoneReplacements?.length;
    for(const card of game.bf())if(relevant(card.def))rows.set(card.iid,{card,ctrl:card.ctrl,snap:game.snapshot(card,false)});
    // A board wipe is one event: use the ability and controller immediately
    // before it, including a source already removed by an earlier loop item.
    for(const row of game._simultaneousLeaveSources||[])if(relevant(row.snap?.def||row.card.def))rows.set(row.card.iid,row);
    return [...rows.values()].filter(row=>!row.snap?.abilitiesDisabled);
  }
  function matches(game,operation,source,ctrl,card,snap,from,sourceVersion){
    if(operation.from==='battlefield'&&from!=='battlefield')return false;
    const creature=types(card,snap).includes('Creature');
    if(operation.creatureOnly&&!creature)return false;
    if(operation.scope==='self')return source===card;
    if(operation.scope==='opponent-creature')return creature&&snap.ctrl!==ctrl;
    if(operation.scope==='instant-or-sorcery')return !card.isToken&&types(card,snap).some(type=>type==='Instant'||type==='Sorcery');
    if(operation.scope==='opponent-owned-creature-card')return !card.isToken&&creature&&card.owner!==ctrl;
    if(operation.scope==='damaged-by-source')return creature&&M.OracleV8DamageHistory.damaged(game,source,{zoneVersion:sourceVersion},card,snap,'self');
    return operation.scope==='all';
  }
  async function apply(game,card,destination,snap,opts){
    const from=card.zone;
    if(destination!=='graveyard'&&!(from==='battlefield'&&card.meta.unearth&&destination!=='exile')){
      if(from==='stack'&&destination!=='stack')delete card.meta.exileIfStackLeaves;
      return {toZone:destination,opts,voidReplacement:null,shuffleOwners:[]};
    }
    const used=new Set(),rows=sources(game),shuffleOwners=new Set();
    let to=destination,toBottom=!!opts.toBottom,voidReplacement=null,noCmdReplace=!!opts.noCmdReplace;
    const own=from==='battlefield'?rows.find(row=>row.card===card):{card,ctrl:card.owner,snap};
    while(true){
      const candidates=[];
      const add=(key,label,run)=>{if(!used.has(key))candidates.push({key,label,run});};
      if(from==='stack'&&to==='graveyard'&&card.meta.exileIfStackLeaves)add('stack-exile','Exile the spell',()=>{to='exile';});
      if(from==='battlefield'&&to!=='exile'&&card.meta.unearth)add('unearth','Unearth — exile',()=>{to='exile';noCmdReplace=true;});
      if(from==='battlefield'&&to==='graveyard'&&(snap.counters.finality||0)>0)add('finality','Finality counter — exile',()=>{to='exile';});
      if(from==='battlefield'&&to==='graveyard')for(const [i,effect]of game.untilEffects.entries())if(effect.kind==='oracleDeathExile'&&(effect.locked?.some(row=>row.iid===card.iid&&row.version===card.zoneVersion)||effect.scope&&snap.types.includes('Creature')&&(effect.scope==='all'||snap.ctrl.idx!==effect.controller)))add('temporary:'+i,'Exile this permanent',()=>{to='exile';});
      if(to==='graveyard'){
        for(const row of rows){
          if(!card.isToken&&(row.snap?.def||row.card.def).opponentGraveyardVoid&&row.ctrl!==card.owner)add('void:'+row.card.iid,row.card.name+' — exile with a void counter',()=>{to='exile';voidReplacement={source:row.card,ctrl:row.ctrl};});
        }
        for(const row of [...rows,...(own&&!rows.includes(own)?[own]:[])])for(const [i,operation]of((row.snap?.def||row.card.def).oracleZoneReplacements||[]).entries()){
          if(row===own&&from!=='battlefield'&&operation.scope!=='self')continue;
          if(!matches(game,operation,row.card,row.ctrl,card,snap,from,row.snap?.zoneVersion??row.card.zoneVersion))continue;
          add('oracle:'+row.card.iid+':'+i,row.card.name+' — '+(operation.placement==='shuffle'?'shuffle into library':operation.placement==='top'?'top of library':operation.placement==='bottom'?'bottom of library':'exile'),async()=>{
            if(operation.reveal)await game.revealToHuman({cards:[card],ctrl:card.owner,kind:'reveal'});
            to=operation.to;toBottom=operation.placement==='bottom';
            if(operation.placement==='shuffle')shuffleOwners.add(card.owner);
          });
        }
      }
      if(!candidates.length)break;
      let selected=candidates[0];
      if(candidates.length>1){
        const affected=from==='battlefield'?snap.ctrl:card.owner;
        const choice=await affected.controller.decide(game,{type:'chooseOption',prompt:'Choose which replacement applies to '+card.name,options:candidates.map((row,i)=>({key:String(i),label:row.label})),aiHint:{kind:'replacementOrder',event:'zoneChange',card}});
        if(!/^(0|[1-9]\d*)$/.test(String(choice))||!candidates[Number(choice)])throw new Error('Invalid zone replacement choice');
        selected=candidates[Number(choice)];
      }
      used.add(selected.key);await selected.run();
    }
    if(from==='stack'&&to!=='stack')delete card.meta.exileIfStackLeaves;
    return {toZone:to,opts:{...opts,toBottom,noCmdReplace},voidReplacement,shuffleOwners:[...shuffleOwners]};
  }
  function compile(operation){
    const allowed=['kind','scope','from','to','placement','reveal','creatureOnly','contract'];
    if(operation.kind!=='zone-replacement-v8'||operation.contract!=='ordered-zone-replacement'||Object.keys(operation).some(key=>!allowed.includes(key)))throw new Error('Unknown zone replacement descriptor');
    const common=operation.to==='exile'&&!operation.placement&&!operation.reveal;
    const global=common&&(['all','instant-or-sorcery','opponent-owned-creature-card'].includes(operation.scope)&&operation.from==='any'||['all','opponent-creature','damaged-by-source'].includes(operation.scope)&&operation.from==='battlefield')&&!operation.creatureOnly;
    const self=operation.scope==='self'&&(operation.from==='any'&&operation.to==='library'&&operation.placement==='shuffle'&&operation.reveal===true&&!operation.creatureOnly||operation.from==='battlefield'&&operation.creatureOnly===true&&(common||operation.to==='library'&&['top','bottom'].includes(operation.placement)&&!operation.reveal));
    if(!global&&!self)throw new Error('Unsupported zone replacement semantics');
    return operation;
  }
  M.OracleV8ZoneReplacements={apply,compile};
})(globalThis.MTG||={});
