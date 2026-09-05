import assert from 'node:assert/strict';
export async function assertDelayedObjects(M,context,entry,effect,source,targets,damaged,before,trace,label,h){
 if(!['delayed-objects-v8','delayed-create-v8'].includes(effect.action))return false;
 const {game,a}=context;
 const installed=game.delayed.filter(row=>row.src===source&&row.ctrl===a&&JSON.stringify(row.oracleOperation)===JSON.stringify(effect));
 assert.equal(installed.length,1,label+': exactly one real future instruction was installed');
 const delayed=installed[0];assert.equal(delayed.once,true);assert.equal(delayed.on,effect.event);
 if(effect.action==='delayed-create-v8'){
  assert.equal(game.battlefield.filter(card=>card.isToken&&!before.battlefield.includes(card)).length,0,label+': future token was not created early');
  const snapshot=h.genericProofSnapshot(context,[source]);
  await game.emit(effect.event,{player:a});await game.flushTriggers();
  assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.run===delayed.run),label+': future token uses Stack');
  await h.resolveAll(game);
  for(const child of effect.effects)await h.assertGenericEffectEvidence(M,context,entry,child,source,targets,damaged,snapshot,trace,label+'/future');
 }else{
  for(const child of effect.effects)await h.assertGenericEffectEvidence(M,context,entry,child,source,targets,damaged,before,trace,label+'/prefix');
  const capture=effect.capture;
  let expected;
  if(capture.kind==='tokens')expected=game.battlefield.filter(card=>card.isToken&&!before.battlefield.includes(card));
  else if(capture.kind==='subjects')expected=[h.subject(capture.target)].flat().filter(card=>card&&card.zone===capture.zone);
  else if(capture.kind==='zone')expected=before.players.get(a)[capture.from+'Cards'].filter(card=>card.zone===capture.zone);
  else expected=context.moveEvidence.slice(before.moveEvidenceIndex).filter(row=>row.from==='battlefield'&&row.to===capture.zone).map(row=>row.card);
  expected=[...new Set(expected)];assert.ok(expected.length,label+': positive case uses real antecedent objects');
  assert.deepEqual(new Set(delayed.locked.map(row=>row.iid)),new Set(expected.map(card=>card.iid)),label+': future instruction captures the exact preceding object group');
  for(const card of expected){const record=delayed.locked.find(row=>row.iid===card.iid);assert.equal(record.version,card.zoneVersion);assert.equal(record.zone,card.zone);if(effect.haste)assert.equal(card.kw('haste'),true,label+': granted haste');}
  await game.emit(effect.event,{player:a});await game.flushTriggers();
  assert.ok(game.stack.some(row=>row.kind==='trigger'&&row.run===delayed.run),label+': delayed operation uses the real Stack');
  for(const card of expected)assert.equal(card.zone,capture.zone,label+': objects wait until the delayed ability resolves');
  await h.resolveAll(game);
  for(const card of expected){
   const zone=effect.operation==='return'?'battlefield':effect.operation==='exile'?'exile':'graveyard';
   assert.equal(card.zone,card.isToken?'ceased':zone,label+': exact delayed destination');
   if(effect.operation==='return'){assert.equal(card.ctrl,card.owner);if(effect.tapped)assert.equal(card.tapped,true);}
  }
 }
 assert.equal(game.delayed.includes(delayed),false,label+': one-shot delayed instruction is consumed');return true;
}
