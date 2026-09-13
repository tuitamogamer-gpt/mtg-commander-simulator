import assert from'node:assert/strict';
export function recordSourceDuration(context,effect,source,subjects,label){
 if(!['source-controlled','source-controlled-tapped','source-tapped-v9','source-battlefield-v9'].includes(effect.duration))return;
 const cards=[subjects].flat().filter(Boolean),kind=effect.action==='battlefield-group'&&effect.operation==='pump'?'oracleSourcePump':{'gain-control':'temporaryControl',pump:'oracleSourcePump','pump-group':'oracleSourcePump',animate:'oracleAnimation','base-pt':'oracleBasePT','grant-operation':'oracleGrantedOperation','combat-restriction':'oracleCombatRestriction'}[effect.action];
 for(const card of cards){
  const record=context.game.untilEffects.find(row=>row.kind===kind&&row.iid===card.iid&&row.zoneVersion===card.zoneVersion&&row.sourceDuration?.sourceIid===source.iid&&row.sourceDuration.sourceVersion===source.zoneVersion);
  assert.ok(record,label+': selected object receives the exact source incarnation duration');assert.equal(record.expires,'sourceDuration');assert.equal(record.sourceDuration.controller.idx,context.a.idx);assert.equal(record.sourceDuration.mode,{'source-controlled-tapped':'controlled-tapped','source-controlled':'controlled','source-tapped-v9':'tapped','source-battlefield-v9':'battlefield'}[effect.duration]);
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
