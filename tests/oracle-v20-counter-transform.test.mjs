import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-counter-transform.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9938,limit:absent.length,compilerVersion:20}).report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
for(const role of ['human','ai']){
 test(role+': Ludevic transforms only at five hatchling counters and removes that entire counter kind',async()=>{
  const {game,a}=context(M,role);fund(a);const card=put(M,game,a,"Ludevic's Test Subject // Ludevic's Abomination",'hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);game.addCounters(card,'charge',2);
  for(let i=1;i<=5;i++){const action=game.activatableList(a).find(row=>row.card===card);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await settle(game);assert.equal(card.oracleFace,i<5?'front':'back');assert.equal(card.counters.hatchling||0,i<5?i:0);}
  assert.equal(card.counters.charge,2);assert.equal(card.power,13);assert.equal(card.toughness,13);assertGameStateInvariants(game);
 });
 test(role+': Thing in the Ice counts real instant casts and transforms only after removing its last ice counter',async()=>{
  const {game,a,b}=context(M,role);fund(a);const card=put(M,game,a,'Thing in the Ice // Awoken Horror','hand');assert.equal(await game.castSpell(a,card,{from:'hand'}),true);await settle(game);const ally=put(M,game,a,'Grizzly Bears'),enemy=put(M,game,b,'Grizzly Bears');
  assert.equal(card.counters.ice,4);
  for(let i=1;i<=4;i++){const instant=put(M,game,a,'Opt','hand');assert.equal(await game.castSpell(a,instant,{from:'hand'}),true);await settle(game);assert.equal(card.counters.ice||0,4-i);assert.equal(card.oracleFace,i<4?'front':'back');assert.equal(ally.zone,i<4?'battlefield':'hand');assert.equal(enemy.zone,i<4?'battlefield':'hand');}
  assert.equal(card.zone,'battlefield');assert.equal(card.hasSub('Horror'),true);assertGameStateInvariants(game);
 });
}
