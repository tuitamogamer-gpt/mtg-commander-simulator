import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M=loadEngine();
if(!M.DEFS['Bloodfeather Phoenix']){
 const card=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v21-common.json',import.meta.url),'utf8')).find(row=>row.name==='Bloodfeather Phoenix');
 const plan=createImportPlan({cards:[card],bulk:{type:'oracle_cards'},sequence:9944,limit:1,compilerVersion:21});
 assert.equal(plan.report.cards.length,1);M.registerOracleBatch(plan.report);M.initData(M.RAW_DATA);
}
const fund=p=>{for(const color in p.pool)p.pool[color]=20;};
function world(role){
 const f=context(M,role);for(const p of f.game.players)fund(p);
 const phoenix=put(M,f.game,f.a,'Bloodfeather Phoenix','graveyard');f.game.recalc();
 const hits=[],emit=f.game.emit;f.game.emit=async function(event,data){if(event==='oracleDamageHit')hits.push(...data.hits);return emit.call(this,event,data);};
 return {...f,phoenix,hits};
}
function targetChoice(player,target){const decide=player.controller.decide.bind(player.controller);player.controller.decide=(g,q)=>q.type==='chooseTargets'?[target]:q.type==='chooseOption'&&q.aiHint?.kind==='optTrigger'?'yes':decide(g,q);}
async function resolveAbove(game,original){for(let i=0;i<30&&game.stack.at(-1)!==original;i++){await game.flushTriggers();if(game.stack.at(-1)!==original)await game.resolveTop();}assert.equal(game.stack.at(-1),original);}
function assertDamageSource(hit,controller,type='Instant'){
 assert.ok(hit,'actual Oracle damage event was captured');assert.equal(hit.spell,true,'damage belongs to the resolving spell');assert.equal(hit.sourceSnap.ctrl,controller,'source snapshot records the actual spell controller');assert.ok(hit.sourceSnap.types.includes(type),'source snapshot records the effective spell face');
}

for(const role of ['human','ai']){
 test(role+': Phoenix recognizes real Adventure spell damage',async()=>{
  const f=world(role),source=put(M,f.game,f.a,'Bonecrusher Giant','hand');targetChoice(f.a,f.b);
  const alt=f.game.castableList(f.a).find(row=>row.card===source&&row.alt?.adventure)?.alt;assert.ok(alt);
  assert.equal(await f.game.castSpell(f.a,source,{from:'hand',alt}),true);const so=f.game.stack.at(-1);assert.equal(so.castOpts.adventure,true);
  await settle(f.game);assert.equal(f.b.life,38);assert.equal(f.phoenix.zone,'battlefield');assert.equal(f.phoenix.kw('haste'),true);assert.equal(source.zone,'exile');assertDamageSource(f.hits[0],f.a);assertGameStateInvariants(f.game);
 });
 test(role+': Phoenix uses a copied spell controller while the opponent original remains on the stack',async()=>{
  const f=world(role),source=put(M,f.game,f.b,'Shock','hand');targetChoice(f.b,f.a);targetChoice(f.a,f.b);
  assert.equal(await f.game.castSpell(f.b,source,{from:'hand'}),true);const original=f.game.stack.at(-1),red=f.a.pool.R;
  await f.game.copySpell(original,f.a,{forceTarget:f.b});const copy=f.game.stack.at(-1);assert.equal(copy.isCopy,true);assert.equal(copy.ctrl,f.a);
  await f.game.resolveTop();await resolveAbove(f.game,original);assert.equal(source.zone,'stack');assert.equal(source.ctrl,f.b);assert.equal(f.b.life,38);assert.equal(f.a.life,40);assert.equal(f.phoenix.zone,'battlefield');assert.equal(f.phoenix.kw('haste'),true);assert.equal(f.a.pool.R,red-1);assertDamageSource(f.hits[0],f.a);assertGameStateInvariants(f.game);
 });
 test(role+': captured Adventure copy definition retains the announced spell face and copy controller',async()=>{
  const f=world(role),source=put(M,f.game,f.b,'Bonecrusher Giant','hand');targetChoice(f.b,f.a);targetChoice(f.a,f.b);
  const alt=f.game.castableList(f.b).find(row=>row.card===source&&row.alt?.adventure)?.alt;assert.ok(alt);
  assert.equal(await f.game.castSpell(f.b,source,{from:'hand',alt}),true);const original=f.game.stack.at(-1),definition=f.game.castDefinition(source,original.castOpts);
  // C19/C20 captured-spell helpers preserve this physical definition, which
  // includes both the permanent body and its separate Adventure operation.
  assert.ok(definition.types.includes('Creature'));await f.game.copySpell(original,f.a,{forceTarget:f.b,oracleDefinition:definition});
  assert.equal(f.game.stack.at(-1).castOpts.adventure,true);await f.game.resolveTop();await resolveAbove(f.game,original);
  assert.equal(f.b.life,38);assert.equal(f.a.life,40);assert.equal(f.phoenix.zone,'battlefield');assert.equal(source.zone,'stack');assert.equal(source.ctrl,f.b);assertDamageSource(f.hits[0],f.a);assertGameStateInvariants(f.game);
 });
 test(role+': a real spell copy still counts after the original was countered',async()=>{
  const f=world(role),source=put(M,f.game,f.a,'Shock','hand');targetChoice(f.a,f.b);
  assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);const original=f.game.stack.at(-1);
  await f.game.copySpell(original,f.a,{forceTarget:f.b});await f.game.counterStackObject(original);assert.equal(source.zone,'graveyard');
  await settle(f.game);assert.equal(f.b.life,38);assert.equal(f.phoenix.zone,'battlefield');assert.equal(f.phoenix.kw('haste'),true);assert.equal(source.zone,'graveyard');assertDamageSource(f.hits[0],f.a);assertGameStateInvariants(f.game);
 });
 test(role+': copied damage requires the Phoenix controller spell and an opponent recipient',async()=>{
  for(const opponentCopy of [false,true]){
   const f=world(role),source=put(M,f.game,f.b,'Shock','hand');targetChoice(f.b,f.a);
   assert.equal(await f.game.castSpell(f.b,source,{from:'hand'}),true);const original=f.game.stack.at(-1),controller=opponentCopy?f.b:f.a,target=opponentCopy?f.a:f.a;
   await f.game.copySpell(original,controller,{forceTarget:target});await f.game.counterStackObject(original);await settle(f.game);
   assert.equal(f.phoenix.zone,'graveyard');assert.equal(f.phoenix.kw('haste'),false);assertDamageSource(f.hits[0],controller);assertGameStateInvariants(f.game);
  }
 });
}
