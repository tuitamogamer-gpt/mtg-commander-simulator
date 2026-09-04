// Search only the owner's chosen zones; hidden cards become choice candidates
// after the zone choice. Graveyard matches carry the public-zone obligation.
((M)=>{
  const actions=new Set(['search-own-zones-v8']);
  const subsets=values=>Array.from({length:(1<<values.length)-1},(_,index)=>values.filter((_,bit)=>(index+1)&(1<<bit)));
  async function choose(ctx,scope,groups,scores,label,format=String){
    const options=groups.map((values,index)=>({key:String(index),label:values.map(format).join(' and ')}));
    const answer=await ctx.you.controller.decide(ctx.g,{type:'chooseOption',player:ctx.you,prompt:label,options,
      aiHint:{kind:'oracleSearchScopes',scope,scores:Object.fromEntries(scores.map((score,index)=>[String(index),score]))}});
    const index=options.findIndex(option=>option.key===answer);
    if(index<0)throw new Error('Invalid search scope choice');
    return groups[index];
  }
  async function run(ctx,effect,helpers){
    if(effect.action!=='search-own-zones-v8'||!Array.isArray(effect.zones)||effect.zones.length<2||effect.zones.length>3||new Set(effect.zones).size!==effect.zones.length||
      effect.zones.some(zone=>!['library','graveyard','hand'].includes(zone))||!effect.zones.includes('library')||
      !Array.isArray(effect.clauses)||!effect.clauses.length||effect.clauses.length>2||effect.clauses.some(clause=>clause.n!==1||(!clause.name===!clause.filter))||
      effect.chooseClauses!==(effect.clauses.length>1)||!['hand','battlefield'].includes(effect.destination)||typeof effect.reveal!=='boolean'||typeof effect.tapped!=='boolean')throw new Error('Unsupported own-zone search');
    const owner=ctx.you,filters=effect.clauses.map(clause=>clause.filter&&helpers.target({...clause.filter,zone:'graveyard',controller:'any'},[],0,ctx.data).filter);
    const matches=(card,index)=>effect.clauses[index].name?card.name===effect.clauses[index].name:filters[index](ctx.g,card,owner,ctx.src);
    const clauseIndexes=effect.clauses.map((_,index)=>index);
    const chosenClauses=effect.chooseClauses?await choose(ctx,'qualities',subsets(clauseIndexes),subsets(clauseIndexes).map(group=>group.length),'Choose which named cards to search for',index=>effect.clauses[index].name):clauseIndexes;
    const zoneGroups=subsets(effect.zones);
    const scores=zoneGroups.map(zones=>chosenClauses.reduce((score,index)=>score+(zones.some(zone=>zone!=='library'&&owner[zone].some(card=>matches(card,index)))?5:zones.includes('library')?2:0),0)-zones.length/100);
    const zones=await choose(ctx,'zones',zoneGroups,scores,'Choose zones to search');
    const locked=zones.flatMap(zone=>owner[zone].map(card=>({card,zone,version:card.zoneVersion}))),claimed=new Set(),selected=[];
    const present=entry=>entry.card.owner===owner&&entry.card.zone===entry.zone&&entry.card.zoneVersion===entry.version&&owner[entry.zone].includes(entry.card);
    for(const index of chosenClauses){
      const eligible=locked.filter(entry=>present(entry)&&!claimed.has(entry.card)&&matches(entry.card,index));
      const from=eligible.map(entry=>entry.card),maximum=Math.min(1,from.length),minimum=eligible.some(entry=>entry.zone==='graveyard')?maximum:0;
      const answer=maximum?await owner.controller.decide(ctx.g,{type:'chooseCards',player:owner,from,min:minimum,max:maximum,search:true,
        prompt:'Choose searched card for '+effect.destination,aiHint:{kind:'recur'}}):[];
      if(!Array.isArray(answer)||answer.length<minimum||answer.length>maximum||new Set(answer).size!==answer.length||answer.some(card=>!eligible.some(entry=>entry.card===card&&present(entry))))throw new Error('Invalid own-zone search selection');
      for(const card of answer){claimed.add(card);selected.push(eligible.find(entry=>entry.card===card));}
    }
    if(effect.reveal&&selected.length)await ctx.g.revealToHuman({cards:selected.map(entry=>entry.card),ctrl:owner,kind:'reveal'});
    const move=async()=>{for(const entry of selected)if(present(entry)){
      if(effect.destination==='battlefield')await ctx.g.putPermanentOntoBattlefield(entry.card,owner,{tapped:effect.tapped});
      else await ctx.g.move(entry.card,'hand');
    }};
    if(effect.destination==='battlefield')await ctx.g.withBattlefieldEntryBatch(move);else await move();
    if(zones.includes('library'))M.shuffle(owner.library,ctx.g.rnd);
  }
  M.OracleV8MultizoneSearch={actions,run};
})(globalThis.MTG||={});
