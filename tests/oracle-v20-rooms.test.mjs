import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-rooms.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9947,limit:absent.length,compilerVersion:20});M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const name='Glassworks // Shattered Yard',fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=50;};
const total=p=>Object.values(p.pool).reduce((n,v)=>n+v,0);
for(const role of ['human','ai']){
 test(role+': a Room door has its own cost and name on the stack; only that door is unlocked on entry',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,name,'hand'),target=put(M,game,b,'Grizzly Bears');
  assert.equal(c.mv,8);const alt=c.def.altCosts.find(r=>r.bdfDoor==='left'),before=total(a);
  assert.equal(await game.castSpell(a,c,{from:'hand',alt}),true);assert.equal(c.mv,3);assert.equal(game.castDefinition(c,game.stack.at(-1).castOpts).name,'Glassworks');assert.equal(before-total(a),3);
  await settle(game);assert.deepEqual(Array.from(c.meta.bdfUnlocked),['left']);assert.equal(c.name,'Glassworks');assert.equal(c.mv,3);assert.equal(target.zone,'graveyard');
  const life=b.life;await game.emit('endStep',{player:a});await settle(game);assert.equal(b.life,life,'locked Shattered Yard has no end-step ability');assertGameStateInvariants(game);
 });
 test(role+': unlocking pays the printed mana cost as a special action and enables the other door immediately',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,name);c.meta.bdfUnlocked=['left'];game.recalc();let activated=0;const emit=game.emit;game.emit=async function(on,data){if(on==='abilityActivated')activated++;return emit.call(this,on,data);};
  const action=game.activatableList(a).find(r=>r.card===c&&r.oracleUnlockRoomV20==='right'),before=total(a);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.equal(before-total(a),5);assert.equal(activated,0);assert.equal(game.stack.length,0);assert.equal(c.mv,8);assert.equal(c.name,name);
  const life=b.life;await game.emit('endStep',{player:a});await settle(game);assert.equal(b.life,life-1);assertGameStateInvariants(game);
 });
 test(role+': unlocking validates timing and the exact permanent before spending mana',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,name),action=game.activatableList(a).find(r=>r.card===c&&r.oracleUnlockRoomV20==='right');assert.ok(action);const before=total(a);
  game.turnPlayer=b;assert.equal(await game.activateAbility(a,action),false);game.turnPlayer=a;game.phase='combat';assert.equal(await game.activateAbility(a,action),false);game.phase='main1';
  const spell=put(M,game,a,'Opt','hand');assert.equal(await game.castSpell(a,spell,{from:'hand'}),true);const afterSpell=total(a);assert.equal(await game.activateAbility(a,action),false);assert.equal(total(a),afterSpell);await settle(game);
  await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});assert.equal(await game.activateAbility(a,action),false);assert.equal(total(a),afterSpell);assert.equal(afterSpell,before-1);assertGameStateInvariants(game);
 });
 test(role+': entering without casting locks both doors; ability loss does not remove the inherent unlock special action',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,name,'graveyard');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.deepEqual(Array.from(c.meta.bdfUnlocked),[]);assert.equal(c.mv,0);
  M.OracleV8AbilityLoss.add(game,[c],{});const action=game.activatableList(a).find(r=>r.card===c&&r.oracleUnlockRoomV20==='right');assert.ok(action);assert.equal(await game.activateAbility(a,action),true);assert.deepEqual(Array.from(c.meta.bdfUnlocked),['right']);const life=b.life;await game.emit('endStep',{player:a});await settle(game);assert.equal(b.life,life);
  await game.move(c,'hand');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.deepEqual(Array.from(c.meta.bdfUnlocked),[]);assert.equal(c.mv,0);assertGameStateInvariants(game);
 });
}
