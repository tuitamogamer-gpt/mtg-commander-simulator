import test from 'node:test';import assert from 'node:assert/strict';
import {fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
import {semanticClass}from'../scripts/import-oracle-batch.mjs';
const M=fixtureEngine([
 ['Turn Gift','Target player takes an extra turn after this one.','Sorcery'],
 ['Own Extra Turn','Take an extra turn after this one.','Sorcery'],
 ['Combat Sequence','After this main phase, there is an additional combat phase followed by an additional main phase.','Instant'],
 ['Combat Followup','After this combat phase, there is an additional combat phase.','Instant'],
 ['Turn Attack','Whenever this creature attacks, if it\'s the first combat phase of the turn, untap this creature. After this phase, there is an additional combat phase.'],
]);
for(const role of ['human','ai']){
 test(`${role}: a paid extra-turn spell resolves through Stack and subsequent full turns preserve normal order`,async()=>{
  const ctx=context(M,role,2),{game,a,b,others}=ctx;game.mainPhase=async()=>{};game.processDiplomacyCheckpoint=async()=>{};
  await paidCast(M,ctx,'Own Extra Turn');assert.deepEqual([...game.extraTurns],[a]);
  game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,a);assert.equal(game._extraTurnAnchor,a);
  await game.runTurn();assert.equal(game.turnPlayer,b);assert.equal(game._extraTurnAnchor,null);assert.equal(a.turnsStarted,1);
  game.scheduleExtraTurn(others[1]);game.advanceTurnPlayer(b);assert.equal(game.turnPlayer,others[1]);
  await game.runTurn();assert.equal(game.turnPlayer,others[1],'normal next turn is restored after an opponent extra turn');
 });
 test(`${role}: newest turns happen first, nested insertion and more than three turns are retained`,async()=>{
  const {game,a,b,others}=context(M,role,2);game.scheduleExtraTurn(b);game.scheduleExtraTurn(a);game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,a);
  game.scheduleExtraTurn(others[1]);game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,others[1]);
  game.advanceTurnPlayer(others[1]);assert.equal(game.turnPlayer,b);game.advanceTurnPlayer(b);assert.equal(game.turnPlayer,b);
  for(let n=0;n<6;n++)game.scheduleExtraTurn(a);for(let n=0;n<6;n++){game.advanceTurnPlayer(game.turnPlayer);assert.equal(game.turnPlayer,a);}game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,others[1]);
 });
 test(`${role}: until-your-next-turn effects follow the actual extra-turn order`,async()=>{
  const {game,a,b}=context(M,role);game.mainPhase=async()=>{};game.combatPhase=async()=>{};const lasting={kind:'turn duration fixture',expires:'yourNext',ctrl:b};game.untilEffects.push(lasting);game.scheduleExtraTurn(a);await game.runTurn();assert.equal(game.turnPlayer,a);assert.ok(game.untilEffects.includes(lasting));await game.runTurn();assert.equal(game.turnPlayer,b);assert.ok(game.untilEffects.includes(lasting));await game.runTurn();assert.equal(game.untilEffects.includes(lasting),false);
 });
 test(`${role}: lost beneficiaries are skipped without losing later pending turns or normal anchor`,async()=>{
  const {game,a,b,others}=context(M,role,2);game.scheduleExtraTurn(b);game.scheduleExtraTurn(others[1]);others[1].lost=true;game.advanceTurnPlayer(a);assert.equal(game.turnPlayer,b);game.advanceTurnPlayer(b);assert.equal(game.turnPlayer,b);
 });
 test(`${role}: additional combat and main phases execute in printed order and only after a main phase`,async()=>{
  const ctx=context(M,role),{game,a}=ctx;await paidCast(M,ctx,'Combat Sequence');const order=[];
  game.combatPhase=async()=>{order.push('combat');};game.mainPhase=async()=>{order.push('main');};await game.runAdditionalPhases(a);assert.deepEqual(order,['combat','main']);
  game.phase='upkeep';await paidCast(M,ctx,'Combat Sequence');assert.equal(game._additionalPhases.length,0);
  game.phase='main1';await paidCast(M,ctx,'Combat Followup');assert.equal(game._additionalPhases.length,0);
  game.phase='combat';await paidCast(M,ctx,'Combat Followup');assert.deepEqual(Array.from(game._additionalPhases,row=>row.kind),['combat']);
 });
 test(`${role}: first combat condition is checked again on resolution`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,source=put(M,game,a,'Turn Attack');game.phase='combat';a.turnState.combatPhaseCount=1;source.attacking=b;source.tapped=true;
  await game.emit('attacks',{card:source,defender:b});await game.flushTriggers();a.turnState.combatPhaseCount=2;await settle(game);assert.equal(source.tapped,true);assert.equal(game._additionalPhases.length,0);
  a.turnState.combatPhaseCount=1;await game.emit('attacks',{card:source,defender:b});await settle(game);assert.equal(source.tapped,false);assert.deepEqual(Array.from(game._additionalPhases,row=>row.kind),['combat']);
 });
}
test('extra-turn grammar rejects riders whose effects are not implemented',()=>{
 for(const text of ['Take an extra turn after this one. At the beginning of that turn\'s end step, you lose the game.','Take an extra turn after this one. Skip its untap step.'])assert.equal(!!semanticClass({name:'Unsupported turn rider',type_line:'Sorcery',mana_cost:'{U}',layout:'normal',oracle_text:text}).semanticClass,false);
});
