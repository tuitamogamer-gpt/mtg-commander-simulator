import assert from 'node:assert/strict';

// The ordinary operation proofs verify each printed effect separately. This
// route verifies that the same compiled text executes as part of another spell,
// through announcement, payment, copying and real resolution for every card.
export async function spliceProofV11(M,entry,operation,role,h){
  const context=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=context;
  h.fund(a,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
  for(const player of [a,b]){
    for(const name of ['Runeclaw Bear','Forest','Island','Sol Ring'])h.permanent(M,game,player,name);
    const legend=new M.CardInst({...M.DEFS['Runeclaw Bear'],name:'Splice legendary witness',super:['Legendary'],colors:['G']},player);
    legend.zone='graveyard';player.graveyard.push(legend);
  }
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),definition=source.def;
  let bodyRuns=0,baseRuns=0,reveals=0;
  const resolve=definition.resolve;
  definition.resolve=async ctx=>{bodyRuns++;assert.notEqual(ctx.src,source);await resolve(ctx);};
  const carrier=new M.CardInst({name:'Splice interaction carrier',cost:'{1}',types:['Instant'],subtypes:['Arcane'],super:[],kws:[],resolve:async()=>{baseRuns++;}},a);
  carrier.zone='hand';a.hand.push(carrier);
  const choose=a.controller.decide.bind(a.controller);
  a.controller.decide=(g,q)=>q.aiHint?.kind==='splice-v11'?q.options.find(row=>row.card===source)?.key||'done':choose(g,q);
  game.revealToHuman=async q=>{if(q.kind==='splice'){assert.equal(q.cards.length,1);assert.equal(q.cards[0],source);reveals++;}};
  try{
    const mana=Object.values(a.pool).reduce((n,v)=>n+v,0);
    assert.equal(await game.castSpell(a,carrier,{from:'hand'}),true,entry.raw.name+': paid splice cast');
    const so=game.stack.find(row=>row.card===carrier);assert.ok(so?.oracleSpliceV11);
    assert.equal(so.oracleSpliceV11.parts.length,1);assert.equal(so.oracleSpliceV11.parts[0].name,entry.raw.name);
    assert.equal(mana-Object.values(a.pool).reduce((n,v)=>n+v,0),1+M.mv(operation.cost));
    assert.equal(source.zone,'hand');assert.equal(reveals,1);
    const copy=await game.copySpell(so,a,{mayNewTargets:false});
    assert.equal(JSON.stringify(copy.oracleSpliceV11),JSON.stringify(so.oracleSpliceV11));
    // Counter the copy so a bounce/destroy/reanimate does not make the original
    // spell's only target illegal. Dedicated tests resolve both draw copies.
    assert.equal(await game.counterStackObject(copy),true);
    await h.resolveAll(game);assert.equal(baseRuns,1);assert.equal(bodyRuns,1);assert.equal(source.zone,'hand');assert.equal(carrier.zone,'graveyard');
    h.assertControllerRole(M,context,entry.raw.name);return 12;
  }finally{definition.resolve=resolve;}
}
