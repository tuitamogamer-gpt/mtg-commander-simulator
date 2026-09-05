import assert from 'node:assert/strict';
export async function zoneReplacementProof(M,entry,operation,role,h){
  const label=entry.raw.name+'/'+role+'/zone replacement';
  const ctx=h.gameFor(M,[h.decision(),h.decision()],{ai:role==='ai'}),{game,a,b}=ctx;
  h.assertControllerRole(M,ctx,label);
  for(const p of game.players){h.fund(p,100);h.fillLibrary(M,p,35);}
  h.stageCardCosts(M,ctx,entry);
  for(const other of entry.implementation)for(const [i,target]of(other.targets||[]).entries())if(target.zone!=='stack')h.stageGenericTarget(M,ctx,target,'zone-entry-'+i);
  const source=h.zoneCard(M,a,entry.raw.name,'hand'),mana=Object.values(a.pool).reduce((x,y)=>x+y,0);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true,label+': actual paid source cast');await h.resolveAll(game);
  assert.ok(Object.values(a.pool).reduce((x,y)=>x+y,0)<mana,label+': paid printed mana');
  // An instant such as Nexus applies its own any-zone replacement as the
  // actual paid spell resolves. A permanent exercises its active static text.
  let victim=source;
  if(source.is('Instant')||source.is('Sorcery'))assert.equal(source.zone,operation.to,label+': real spell resolution destination');
  else{
    assert.equal(source.zone,'battlefield');
    if(operation.scope!=='self')victim=operation.scope==='instant-or-sorcery'?h.zoneCard(M,b,'Lightning Bolt','hand'):h.permanent(M,game,b,'Grizzly Bears');
    if(operation.scope==='damaged-by-source')assert.equal(await game.damageCreature(source,victim,1,{deferSBA:true}),1,label+': real source damage marks the object');
    const version=victim.zoneVersion,events=[],emit=game.emit.bind(game);
    game.emit=async(name,data)=>{if(data.card===victim)events.push(name);return emit(name,data);};
    if(victim.zone==='battlefield')await game.sacrifice(victim.ctrl,victim);else await game.discard(victim.owner,[victim]);
    assert.equal(victim.zoneVersion,version+1,label+': one incarnation change');assert.equal(victim.zone,operation.to,label+': replacement destination');
    assert.equal(events.includes('dies'),false,label+': no death event');assert.equal(events.includes('cardToGraveyard'),false,label+': no graveyard entry');
    assert.equal(game.diedThisTurn.some(row=>row.iid===victim.iid),false,label+': death history unchanged');
  }
  if(operation.to==='library'){
    assert.ok(victim.owner.library.includes(victim));
    if(operation.placement==='top')assert.equal(victim.owner.library.at(-1),victim);
    if(operation.placement==='bottom')assert.equal(victim.owner.library[0],victim);
  }else assert.ok(victim.owner.exile.includes(victim));
  assert.equal((game.aiDecisionLog||[]).some(row=>row.fallback),false);
  return 7;
}
