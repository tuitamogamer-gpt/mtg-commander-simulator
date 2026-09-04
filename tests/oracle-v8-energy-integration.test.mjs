import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';
import{fixtureEngine,context,put,settle}from'./helpers/oracle-v8-fixtures.mjs';
const M=fixtureEngine([
 ['Battery Tap','{T}, Pay {E}{E}: You gain 3 life.','Creature','{G}'],
 ['Energy Filter','{T}, Pay {E}: Add {G}.','Artifact','{0}'],
 ['Energy Manual','{1}, {T}, Pay {E}: Add {G}{G}.\n{2}: You gain 1 life.','Artifact','{0}'],
 ['Energy Shared','{1}, Pay {E}: You gain 2 life.','Artifact','{0}'],
]);
for(const role of ['human','ai']){
 test(`${role}: fixed energy activation pays once, survives countering, and rejects a stale action`,async()=>{
  const {game,a}=context(M,role),src=put(M,game,a,'Battery Tap');a.counters.energy=2;const action=game.activatableList(a).find(row=>row.card===src);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(a.counters.energy,0);assert.equal(src.tapped,true);const ability=game.stack.at(-1);await game.counterStackObject(ability);assert.equal(a.life,40);src.tapped=false;assert.equal(await game.activateAbility(a,action),false);assert.equal(src.tapped,false);assert.equal(a.counters.energy,0);
 });
 test(`${role}: insufficient energy rejects before tapping and ordinary payment resolves`,async()=>{
  const {game,a}=context(M,role),src=put(M,game,a,'Battery Tap');a.counters.energy=1;assert.equal(game.activatableList(a).some(row=>row.card===src),false);a.counters.energy=3;const action=game.activatableList(a).find(row=>row.card===src);await game.activateAbility(a,action);await settle(game);assert.equal(a.life,43);assert.equal(a.counters.energy,1);
 });
 test(`${role}: two mana sources cannot double-spend one shared energy counter`,async()=>{
  const {game,a}=context(M,role),one=put(M,game,a,'Energy Filter'),two=put(M,game,a,'Energy Filter');a.counters.energy=1;
  assert.equal(game.canPayMana(a,M.parseCost('{G}{G}')),false);assert.equal(await game.payMana(a,M.parseCost('{G}{G}')),false);assert.equal(one.tapped,false);assert.equal(two.tapped,false);assert.equal(a.counters.energy,1);
  a.counters.energy=2;assert.equal(await game.payMana(a,M.parseCost('{G}{G}')),true);assert.equal(a.counters.energy,0);assert.equal(one.tapped,true);assert.equal(two.tapped,true);assert.equal(game.stack.length,0);
 });
 test(`${role}: activation reserves its energy while planning mana`,async()=>{
  const {game,a}=context(M,role),filter=put(M,game,a,'Energy Filter'),src=put(M,game,a,'Energy Shared');a.counters.energy=2;const action=game.activatableList(a).find(row=>row.card===src);assert.ok(action);a.counters.energy=1;assert.equal(game.activatableList(a).some(row=>row.card===src),false);assert.equal(await game.activateAbility(a,action),false);assert.equal(filter.tapped,false);assert.equal(a.counters.energy,1);
  a.counters.energy=2;assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(a.counters.energy,0);assert.equal(filter.tapped,true);assert.equal(a.life,42);
 });
 test(`${role}: manual mana reserves its energy before paying the mana component`,async()=>{
  const {game,a}=context(M,role),filter=put(M,game,a,'Energy Filter'),src=put(M,game,a,'Energy Manual');a.counters.energy=2;
  const action=game.activatableList(a).find(row=>row.card===src&&row.manaAbility);assert.ok(action);a.counters.energy=1;
  assert.equal(game.activatableList(a).some(row=>row.card===src&&row.manaAbility),false);
  assert.equal(await game.activateAbility(a,action),false);assert.equal(filter.tapped,false);assert.equal(src.tapped,false);assert.equal(a.counters.energy,1);assert.equal(Object.values(a.pool).reduce((n,v)=>n+v,0),0);
  a.counters.energy=2;assert.equal(await game.activateAbility(a,action),true);assert.equal(filter.tapped,true);assert.equal(src.tapped,true);assert.equal(a.counters.energy,0);assert.equal(a.pool.G,2);assert.equal(game.stack.length,0);
 });
 test(`${role}: proliferate adds both poison and energy on the chosen player`,async()=>{
  const {game,a,b}=context(M,role);a.counters.energy=3;a.poison=2;const decide=a.controller.decide.bind(a.controller);a.controller.decide=async(g,q)=>q.aiHint?.goal==='proliferate'?[a]:decide(g,q);await M.E.proliferate(game,a);assert.equal(a.counters.energy,4);assert.equal(a.poison,3);assert.equal(b.counters.energy||0,0);
 });
 test(`${role}: local AI chooses its unpoisoned energy for proliferate`,async()=>{
  const {game,a}=context(M,'ai');a.counters.energy=2;await M.E.proliferate(game,a);assert.equal(a.counters.energy,3);
 });
}
test('energy saves and restores exactly, rejects malformed counters, and accepts legacy saves',()=>{
 const {game,a,b}=context(M);a.counters.energy=7;b.counters.energy=2;const snapshot=M.captureGameState(game);assert.ok(snapshot);const restored=context(M).game;M.restoreGameState(restored,JSON.parse(JSON.stringify(snapshot)));assert.equal(M.gameStateFingerprint(restored),M.gameStateFingerprint(game));assert.equal(restored.players[0].counters.energy,7);
 const malformed=JSON.parse(JSON.stringify(snapshot));malformed.players[0].counters.energy=-1;assert.throws(()=>M.restoreGameState(restored,malformed),/energy counters/);assert.equal(restored.players[0].counters.energy,7);
 for(const player of snapshot.players)delete player.counters;M.restoreGameState(restored,snapshot);assert.equal(restored.players[0].counters.energy,0);
});
test('player HUD exposes public energy badge and details',()=>{
 const ctx=vm.createContext({MTG:M,console,window:{},document:{}});vm.runInContext(fs.readFileSync('src/modules/ui.js','utf8'),ctx);const ui=Object.create(M.UI.prototype),{game,a}=context(M);a.counters.energy=5;assert.match(ui.energyBadge(a),/5 energy counters/);assert.equal(ui.playerStatusEffects(game,a).find(row=>row.key==='energy').label,'Energy counters');assert.equal(ui.energyBadge({counters:{}}),'');
});
