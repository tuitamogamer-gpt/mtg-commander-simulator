import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-modal-transform.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length){M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9944,limit:absent.length,compilerVersion:20}).report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const color of ['W','U','B','R','G','C'])p.pool[color]=30;};
const monica='Monica Rambeau // Photon, Living Light';
for(const role of ['human','ai']){
 test(role+': a modal front transforms through its paid sorcery ability and retains the same permanent',async()=>{
  const {game,a,b}=context(M,role);fund(a);const card=put(M,game,a,monica,'hand');
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleFace:'front'}}),true);await settle(game);
  const version=card.zoneVersion,iid=card.iid;game.addCounters(card,'+1/+1',2);card.tapped=true;
  game.turnPlayer=b;assert.equal(game.activatableList(a).some(row=>row.card===card),false);game.turnPlayer=a;
  const action=game.activatableList(a).find(row=>row.card===card);assert.ok(action);const mana=Object.values(a.pool).reduce((x,y)=>x+y,0);
  assert.equal(await game.activateAbility(a,action),true);assert.equal(card.oracleFace,'front');assert.equal(Object.values(a.pool).reduce((x,y)=>x+y,0),mana-5);await settle(game);
  assert.equal(card.oracleFace,'back');assert.equal(card.name,'Photon, Living Light');assert.equal(card.iid,iid);assert.equal(card.zoneVersion,version);assert.equal(card.counters['+1/+1'],2);assert.equal(card.tapped,true);assert.equal(card.kw('hexproof'),true);assertGameStateInvariants(game);
 });
 test(role+': a modal back remains castable directly, while a pending transform cannot follow a zone change',async()=>{
  const {game,a}=context(M,role);fund(a);const card=put(M,game,a,monica,'hand');
  assert.ok(game.castableList(a).some(row=>row.card===card&&row.alt?.oracleFace==='back'));
  assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleFace:'back'}}),true);await settle(game);assert.equal(card.oracleFace,'back');
  await game.move(card,'hand');assert.equal(card.oracleFace,'front');assert.equal(await game.castSpell(a,card,{from:'hand',alt:{oracleFace:'front'}}),true);await settle(game);
  const action=game.activatableList(a).find(row=>row.card===card);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await game.move(card,'exile');await game.move(card,'battlefield',{ctrl:a});await settle(game);assert.equal(card.oracleFace,'front');assertGameStateInvariants(game);
 });
 test(role+': modal transformation refuses a spell destination and a face-down permanent',async()=>{
  const {game,a}=context(M,role),land=put(M,game,a,'Legion Leadership // Legion Stronghold','hand');
  assert.equal(await game.playLand(a,land,{oracleFace:'back'}),true);assert.equal(land.oracleFace,'back');
  assert.equal(await M.BOM.transform({g:game,you:a,src:land,sourceZoneVersion:land.zoneVersion}),false);assert.equal(land.oracleFace,'back');
  const card=put(M,game,a,monica);card.faceDown=true;assert.equal(await M.BOM.transform({g:game,you:a,src:card,sourceZoneVersion:card.zoneVersion}),false);assert.equal(card.oracleFace,'front');card.faceDown=false;assertGameStateInvariants(game);
 });
}
test('both complete modal faces are required and an unsupported extra instruction is rejected',()=>{
 const card=rows.find(row=>row.name===monica);assert.ok(card);
 for(const index of [0,1]){const changed={...card,card_faces:card.card_faces.map((face,i)=>i===index?{...face,oracle_text:face.oracle_text+'\nDo an unsupported thing.'}:face)};assert.equal(semanticClass(changed,{compilerVersion:20}).semanticClass,undefined);}
});
