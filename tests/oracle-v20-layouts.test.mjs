import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-layouts.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9943,limit:absent.length,compilerVersion:20});M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);}
const fund=p=>{for(const c of ['W','U','B','R','G','C'])p.pool[c]=40;};
const option=(g,p,c,n)=>g.activatableList(p).find(row=>row.card===c&&row.ability?.label?.startsWith('Level '+n));
async function gainLevel(game,a,c,n){const action=option(game,a,c,n);assert.ok(action,c.name+': level '+n+' offered');assert.equal(await game.activateAbility(a,action),true);assert.equal(M.OracleV20.classLevel(c),n-1);await settle(game);assert.equal(M.OracleV20.classLevel(c),n);}
test('Class and Case compilation consumes all sections and rejects unrecognized level rules',()=>{
 for(const c of rows){assert.ok(semanticClass(c,{compilerVersion:20}).semanticClass,c.name);assert.equal(semanticClass({...c,oracle_text:c.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:20}).semanticClass,undefined,c.name);}
});
for(const role of ['human','ai']){
 test(role+': Class levels are successive sorcery activations; cumulative benefits disappear on ability loss',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,"Caretaker's Talent"),token=await game.makeTokens({name:'Test Bear',types:['Creature'],subtypes:['Bear'],power:'2',toughness:'2',colors:['G']},a);
  await settle(game);const bear=game.creatures(a)[0];assert.equal(bear.power,2);assert.equal(M.OracleV20.classLevel(c),1);assert.equal(option(game,a,c,3),undefined);
  game.turnPlayer=b;assert.equal(option(game,a,c,2),undefined);game.turnPlayer=a;
  await gainLevel(game,a,c,2);assert.equal(bear.power,2);assert.equal(option(game,a,c,2),undefined);await gainLevel(game,a,c,3);assert.equal(bear.power,4);assert.equal(option(game,a,c,3),undefined);
  M.OracleV8AbilityLoss.add(game,[c],{});assert.equal(M.OracleV20.classLevel(c),3);assert.equal(bear.power,2);assertGameStateInvariants(game);
 });
 test(role+': Class levels reset on zone changes and a pending activation cannot level a new incarnation',async()=>{
  const {game,a}=context(M,role);fund(a);const c=put(M,game,a,"Hunter's Talent");await gainLevel(game,a,c,2);await game.move(c,'hand');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.equal(M.OracleV20.classLevel(c),1);
  const action=option(game,a,c,2);assert.ok(action);assert.equal(await game.activateAbility(a,action),true);await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.equal(M.OracleV20.classLevel(c),1);assertGameStateInvariants(game);
 });
 test(role+': gaining a Class level puts its target trigger on the stack and uses the printed graveyard effect',async()=>{
  const {game,a}=context(M,role);fund(a);const c=put(M,game,a,"Stormchaser's Talent"),spell=put(M,game,a,'Lightning Bolt','graveyard');await gainLevel(game,a,c,2);assert.equal(spell.zone,'hand');assert.equal(game.creatures(a).length,0,'fixture was not an ETB event');await gainLevel(game,a,c,3);const cast=put(M,game,a,'Opt','hand');assert.equal(await game.castSpell(a,cast,{from:'hand'}),true);await settle(game);assert.equal(game.creatures(a).some(t=>t.hasSub('Otter')),true);assertGameStateInvariants(game);
 });
 test(role+': a Case solves on its controller end step only when its condition remains true and resets after leaving',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,'Case of the Crimson Pulse');assert.equal(M.OracleV20.caseSolved(c),false);await game.emit('endStep',{player:b});await settle(game);assert.equal(M.OracleV20.caseSolved(c),false);
  await game.emit('endStep',{player:a});await game.flushTriggers();const interruption=put(M,game,a,'Forest','hand');await settle(game);assert.equal(M.OracleV20.caseSolved(c),false);await game.move(interruption,'graveyard');await game.emit('endStep',{player:a});await settle(game);assert.equal(M.OracleV20.caseSolved(c),true);
  await game.emit('upkeep',{player:a});await settle(game);assert.equal(a.hand.length,2);await game.move(c,'exile');await game.move(c,'battlefield',{ctrl:a});await settle(game);assert.equal(M.OracleV20.caseSolved(c),false);assertGameStateInvariants(game);
 });
 test(role+': Class library visibility and cast permission apply at level three to its controller',async()=>{
  const {game,a,b}=context(M,role);fund(a);const c=put(M,game,a,'Ranger Class'),top=put(M,game,a,'Grizzly Bears','library');const visible=()=>M.oracleLibraryFlagV20(c.def.revealOwnTop,game,c);
  assert.equal(visible(),false);assert.equal(game.castableList(a).some(row=>row.card===top),false);await gainLevel(game,a,c,2);assert.equal(visible(),false);await gainLevel(game,a,c,3);assert.equal(visible(),true);assert.equal(game.castableList(a).some(row=>row.card===top),true);assert.equal(game.castableList(b).some(row=>row.card===top),false);await game.move(c,'hand');assert.equal(visible(),false);assertGameStateInvariants(game);
 });
}
