import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine(),names=new Set(['Bartered Cow','Guerrilla Tactics']);
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v20-permanents.json',import.meta.url),'utf8')).filter(row=>names.has(row.name)&&!M.DEFS[row.name]);
if(rows.length){M.registerOracleBatch(createImportPlan({cards:rows,bulk:{type:'oracle_cards'},sequence:9934,limit:rows.length,compilerVersion:20}).report);M.initData(M.RAW_DATA);}
const fund=player=>{for(const color of ['W','U','B','R','G','C'])player.pool[color]=20;};
const choose=(player,fn)=>{const prior=player.controller.decide.bind(player.controller);player.controller.decide=(game,query)=>fn(game,query)??prior(game,query);};

for(const role of ['human','ai']){
 test(role+': Bartered Cow creates Food for a real death or discard, including an exile replacement',async()=>{
  const {game,a,b}=context(M,role),source=put(M,game,a,'Bartered Cow','hand');
  const foods=()=>game.bf().filter(card=>card.ctrl===a&&card.isToken&&card.hasSub('Food'));
  await game.move(source,'graveyard');await settle(game);assert.equal(foods().length,0,'a simple hand-to-graveyard move is not a discard or death');
  await game.move(source,'hand');await game.discard(a,[source]);await settle(game);assert.equal(foods().length,1);assert.equal(source.zone,'graveyard');
  await game.putPermanentOntoBattlefield(source,a);await game.destroy(source);await settle(game);assert.equal(foods().length,2,'the separate death ability also creates exactly one Food');
  await game.move(source,'hand');put(M,game,b,'Rest in Peace');await game.discard(a,[source]);await settle(game);assert.equal(source.zone,'exile');assert.equal(foods().length,3,'replacing the discard destination does not suppress the discard trigger');
  for(const food of foods())assert.equal(food.is('Artifact'),true);
  assertGameStateInvariants(game);
 });
 test(role+': Guerrilla Tactics distinguishes its normal spell, opponent discard trigger and stale target',async()=>{
  const {game,a,b}=context(M,role);fund(a);fund(b);const source=put(M,game,a,'Guerrilla Tactics','hand'),ownLife=a.life,enemyLife=b.life;
  let target=b;choose(a,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(target)?[target]:undefined);choose(b,(g,q)=>q.type==='chooseTargets'&&q.candidates.includes(a)?[a]:undefined);
  await game.discard(a,[source]);await settle(game);assert.equal(a.life,ownLife);assert.equal(b.life,enemyLife,'a voluntary discard does not trigger');
  const opposingDiscard=async()=>{game.turnPlayer=b;const spell=put(M,game,b,'Mind Rot','hand');assert.equal(await game.castSpell(b,spell,{from:'hand'}),true);await game.resolveTop();await game.flushTriggers();assert.ok(game.stack.some(row=>row.srcCard===source),'the printed discard ability is a real Stack object');};
  await game.move(source,'hand');await opposingDiscard();await settle(game);assert.equal(b.life,enemyLife-4);assert.equal(a.life,ownLife);assert.equal(source.zone,'graveyard');
  await game.move(source,'hand');assert.equal(await game.castSpell(a,source,{from:'hand'}),true);await settle(game);assert.equal(b.life,enemyLife-6,'the normal spell deals two damage');
  const creature=put(M,game,b,'Grizzly Bears');target=creature;await game.move(source,'hand');await opposingDiscard();await game.move(creature,'exile');await game.putPermanentOntoBattlefield(creature,b);await settle(game);
  assert.equal(creature.zone,'battlefield');assert.equal(creature.damage,0,'the trigger cannot damage a new incarnation of its chosen creature');assert.equal(b.life,enemyLife-6);assert.equal(a.life,ownLife);assertGameStateInvariants(game);
 });
}
