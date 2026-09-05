import test from'node:test';import assert from'node:assert/strict';
import{fixtureEngine,context,put,settle,paidCast}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Lock Artifact',"You may choose not to untap this artifact during your untap step.\n{1}, {T}: Tap target creature. It doesn't untap during its controller's untap step for as long as this artifact remains tapped.",'Artifact'],
 ['Lock Creature',"When this creature enters, tap target creature an opponent controls. That creature doesn't untap during its controller's untap step for as long as you control this creature."],
 ['Lock Body',''],
 ['Group Lock',"{1}, {T}: Tap all other artifacts. They don't untap during their controllers' untap steps for as long as this artifact remains tapped.",'Artifact'],
 ['Group Body','','Artifact'],
]);
async function activation(ctx){const{game,a,b}=ctx,source=put(M,game,a,'Lock Artifact'),target=put(M,game,b,'Lock Body');a.pool.C=10;const entry=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.ok(entry);assert.equal(await game.activateAbility(a,entry),true);assert.ok(game.stack.some(row=>row.card===source||row.ctx?.src===source));return{source,target};}
for(const role of ['human','ai']){
 test(`${role}: a simultaneous untap uses the restrictions before the source untaps`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,source=put(M,game,a,'Group Lock'),own=put(M,game,a,'Group Body'),opponent=put(M,game,b,'Group Body');a.pool.C=2;const action=game.activatableList(a).find(row=>row.card===source&&row.ability);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(own.cur.cantUntap,true);assert.equal(opponent.cur.cantUntap,true);
  game.mainPhase=async()=>{};game.combatPhase=async()=>{};await game.runTurn();assert.equal(source.tapped,false);assert.equal(own.tapped,true);assert.equal(opponent.tapped,true);assert.equal(own.cur.cantUntap,false);
 });
 test(`${role}: an actual lock prevents controller untap steps but allows untap effects`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,{source,target}=await activation(ctx);await settle(game);assert.equal(target.tapped,true);assert.equal(target.cur.cantUntap,true);
  game.mainPhase=async()=>{};game.combatPhase=async()=>{};game.turnPlayer=b;await game.runTurn();assert.equal(target.tapped,true);assert.equal(source.tapped,true);
  assert.equal(game.untap(target),true);assert.equal(target.tapped,false);game.tap(target);assert.equal(target.cur.cantUntap,true);
  game.untap(source);game.tap(source);game.recalc();assert.equal(target.cur.cantUntap,false,'ending tapped duration never resumes on retap');
 });
 for(const disruption of ['untap','untap-retap','blink'])test(`${role}: ${disruption} before resolution taps the target without beginning a lock`,async()=>{
  const ctx=context(M,role),{game,a}=ctx,{source,target}=await activation(ctx);
  if(disruption==='blink'){await game.move(source,'exile');await game.putPermanentOntoBattlefield(source,a,{tapped:true});}
  else{game.untap(source);if(disruption==='untap-retap')game.tap(source);}
  await settle(game);assert.equal(target.tapped,true);assert.equal(target.cur.cantUntap,false);
 });
 test(`${role}: target blink releases its old incarnation`,async()=>{
  const ctx=context(M,role),{game,b}=ctx,{target}=await activation(ctx);await settle(game);await game.move(target,'exile');await game.putPermanentOntoBattlefield(target,b,{tapped:true});assert.equal(target.cur.cantUntap,false);
 });
 test(`${role}: losing control ends the duration even after regaining control`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,target=put(M,game,b,'Lock Body');const source=await paidCast(M,ctx,'Lock Creature');assert.equal(target.cur.cantUntap,true);
  M.OracleV8Control.gain(game,source,b);game.recalc();M.OracleV8Control.gain(game,source,a);game.recalc();assert.equal(target.cur.cantUntap,false);
 });
 test(`${role}: control changes before trigger resolution do not restart the duration`,async()=>{
  const ctx=context(M,role),{game,a,b}=ctx,target=put(M,game,b,'Lock Body'),source=put(M,game,a,'Lock Creature','hand');a.pool.G=1;
  assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();
  M.OracleV8Control.gain(game,source,b);game.recalc();M.OracleV8Control.gain(game,source,a);game.recalc();await settle(game);assert.equal(target.tapped,true);assert.equal(target.cur.cantUntap,false);
 });
 test(`${role}: source phasing permanently ends an established for-as-long duration`,async()=>{
  const ctx=context(M,role),{game,a}=ctx,{source,target}=await activation(ctx);await settle(game);game.phaseOut(source);assert.equal(target.cur.cantUntap,false);game.phaseInFor(a);game.recalc();assert.equal(target.cur.cantUntap,false);
 });
}
