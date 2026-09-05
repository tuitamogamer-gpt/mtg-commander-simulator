import assert from'node:assert/strict';
export function recordSourceDuration(context,effect,source,subjects,label){
 if(!['source-controlled','source-controlled-tapped'].includes(effect.duration))return;
 const cards=[subjects].flat().filter(Boolean),kind={'gain-control':'temporaryControl',pump:'oracleSourcePump','grant-operation':'oracleGrantedOperation','combat-restriction':'oracleCombatRestriction'}[effect.action];
 for(const card of cards){
  const record=context.game.untilEffects.find(row=>row.kind===kind&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.sourceDuration?.sourceIid===source.iid&&row.sourceDuration.sourceVersion===source.zoneVersion);
  assert.ok(record,label+': selected object receives the exact source incarnation duration');assert.equal(record.expires,'sourceDuration');assert.equal(record.sourceDuration.controller.idx,context.a.idx);assert.equal(record.sourceDuration.mode,effect.duration==='source-controlled-tapped'?'controlled-tapped':'controlled');
  (context.sourceDurationProof||=[]).push({source,record,label});
 }
}
export function finishSourceDurations(context){
 const game=context.game;
 for(const source of new Set((context.sourceDurationProof||[]).map(row=>row.source))){
  if(source.zone!=='battlefield'||source.phasedOut)continue;
  const records=context.sourceDurationProof.filter(row=>row.source===source),controller=source.ctrl;
  game.phaseOut(source);for(const {record,label}of records)assert.equal(game.untilEffects.includes(record),false,label+': phasing the source ends its duration immediately');
  game.phaseInFor(controller);game.recalc();for(const {record,label}of records)assert.equal(game.untilEffects.includes(record),false,label+': returning the source never restarts the old duration');
 }
}
