import assert from 'node:assert/strict';

export async function cipherProofV13(M,entry,operation,role,h){
  const controller=h.decision({chooseCards:(g,q)=>q.from.slice(0,q.max??q.min??1),chooseOption:(g,q)=>q.options.find(o=>o.key==='yes')?.key||q.options[0]?.key,
    chooseTargets:(g,q)=>{const enemies=q.candidates.filter(card=>card instanceof M.Player?card!==g.players[0]:card.ctrl!==g.players[0]);return (enemies.length?enemies:q.candidates).slice(0,q.min||1);}});
  const context=h.gameFor(M,[controller,h.decision()],{ai:role==='ai'}),{game,a,b}=context;
  h.fund(a,100);h.fillLibrary(M,a,30);h.fillLibrary(M,b,30);
  for(const p of [a,b])for(const name of ['Runeclaw Bear','Forest','Sol Ring'])h.permanent(M,game,p,name);
  for(let i=0;i<4;i++){h.zoneCard(M,a,'Runeclaw Bear','graveyard');h.zoneCard(M,b,'Forest','hand');}
  const source=h.zoneCard(M,a,entry.raw.name,'hand');
  const mana=Object.values(a.pool).reduce((n,v)=>n+v,0);
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);
  assert.equal(mana-Object.values(a.pool).reduce((n,v)=>n+v,0),M.mv(source.def.cost));
  await h.resolveAll(game);
  assert.equal(source.zone,'exile',entry.raw.name+': encoded original');
  const host=game.byIid(source.meta.oracleCipherV13?.hostIid);assert.ok(host);
  assert.ok(host.cur.extraTriggers.some(trigger=>trigger.desc==='Cipher — '+entry.raw.name));
  await game.damagePlayer(host,b,1,{combat:false});assert.equal(game.pendingTriggers.length,0);
  // Leave a fresh legal target when the first resolution returned or exiled one.
  h.permanent(M,game,b,'Runeclaw Bear');h.zoneCard(M,a,'Runeclaw Bear','graveyard');
  await game.damagePlayer(host,b,1,{combat:true});await game.flushTriggers();
  const trigger=game.stack.find(object=>object.srcCard===host);assert.ok(trigger,entry.raw.name+': combat trigger');
  const before=Object.values(a.pool).reduce((n,v)=>n+v,0);
  await game.resolveTop();
  const copy=game.stack.find(object=>object.kind==='spell'&&object.card.isCopySpell);
  assert.ok(copy,entry.raw.name+': copy was actually cast');assert.equal(copy.from,'exile');assert.equal(copy.ctrl,a);assert.equal(copy.card.name,source.name);
  assert.equal(Object.values(a.pool).reduce((n,v)=>n+v,0),before);
  await h.resolveAll(game);assert.equal(copy.card.zone,'ceased');assert.equal(source.zone,'exile');
  assert.equal(a.exile.filter(card=>card.meta.oracleCipherV13).length,1);
  await game.move(source,'graveyard');game.recalc();await game.damagePlayer(host,b,1,{combat:true});
  assert.equal(game.pendingTriggers.length,0);h.assertControllerRole(M,context,entry.raw.name+'/'+role);return 16;
}
