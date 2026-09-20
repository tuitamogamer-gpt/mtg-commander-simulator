import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,put,settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants,assertRecalculationStable} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v13-cipher.json',import.meta.url),'utf8'));
const M=loadEngine(),absent=rows.filter(card=>!M.DEFS[card.name]);
if(absent.length)M.registerOracleBatch(createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9926,limit:absent.length,compilerVersion:13}).report);
M.initData(M.RAW_DATA);
function setup(role='human'){
  const f=context(M,role);for(const p of f.game.players)for(const color of Object.keys(p.pool))p.pool[color]=20;
  const choose=f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide=(g,q)=>role==='human'&&q.type==='chooseCards'&&q.aiHint?.kind==='recur'?q.from.slice(0,1):choose(g,q);
  return f;
}
async function encode(f,name='Last Thoughts'){
  const source=put(M,f.game,f.a,name,'hand');assert.equal(await f.game.castSpell(f.a,source,{from:'hand'}),true);await settle(f.game);return source;
}
test('cipher requires a complete spell and preserves historical compilation',()=>{
  for(const card of rows){
    assert.equal(semanticClass(card,{compilerVersion:12}).semanticClass,undefined,card.name);
    assert.ok(semanticClass(card,{compilerVersion:13}).semanticClass,card.name);
    assert.equal(semanticClass({...card,oracle_text:card.oracle_text+'\nUnsupported instruction.'},{compilerVersion:13}).semanticClass,undefined);
  }
});
for(const role of ['human','ai']){
  test(role+': cipher encodes without targeting, then casts its copy from exile for free',async()=>{
    const f=setup(role),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear');host.def={...host.def,kws:['shroud']};game.recalc();
    const original=await encode(f);assert.equal(original.zone,'exile');assert.equal(original.meta.oracleCipherV13.hostIid,host.iid);
    assert.equal(host.cur.extraTriggers.length,1);assertRecalculationStable(game);
    const hand=a.hand.length,mana=Object.values(a.pool).reduce((n,v)=>n+v,0);
    await game.damagePlayer(host,b,1,{combat:false});await settle(game);assert.equal(a.hand.length,hand);
    await game.damagePlayer(host,b,1,{combat:true});await game.flushTriggers();await game.resolveTop();
    const copy=game.stack.at(-1);assert.ok(copy.card.isCopySpell);assert.equal(copy.from,'exile');
    await settle(game);assert.equal(copy.card.zone,'ceased');assert.equal(a.hand.length,hand+1);assert.equal(original.zone,'exile');
    assert.equal(Object.values(a.pool).reduce((n,v)=>n+v,0),mana);assert.equal(a.exile.length,1);assertGameStateInvariants(game);
  });
  test(role+': host control changes determine who casts the encoded copy',async()=>{
    const f=setup(role),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear'),original=await encode(f);
    M.OracleV8Control.gain(game,host,b);game.recalc();
    const choose=b.controller.decide.bind(b.controller);b.controller.decide=(g,q)=>q.type==='chooseCards'&&q.aiHint?.kind==='recur'?q.from.slice(0,1):choose(g,q);
    const hand=b.hand.length;await game.damagePlayer(host,a,1,{combat:true});await settle(game);
    assert.equal(b.hand.length,hand+1);assert.equal(original.owner,a);assert.equal(original.zone,'exile');assertGameStateInvariants(game);
  });
  test(role+': encoding survives phasing, but a blink or a new exile incarnation breaks the link',async()=>{
    const f=setup(role),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear'),original=await encode(f);
    game.phaseOut(host);game.phaseInFor(a);game.recalc();assert.equal(host.cur.extraTriggers.length,1);
    await game.move(original,'hand');await game.move(original,'exile');game.recalc();assert.equal(host.cur.extraTriggers.length,0);
    const second=await encode(f);assert.equal(host.cur.extraTriggers.length,1);
    await game.move(host,'exile');await game.move(host,'battlefield',{ctrl:a});game.recalc();assert.equal(host.cur.extraTriggers.length,0);
    assert.equal(second.zone,'exile');const hand=a.hand.length;await game.damagePlayer(host,b,1,{combat:true});await settle(game);assert.equal(a.hand.length,hand);assertGameStateInvariants(game);
  });
  test(role+': a newly created token can receive cipher and repeated copies never encode',async()=>{
    const f=setup(role),{game,a,b}=f,original=await encode(f,'Call of the Nightwing');
    const host=game.byIid(original.meta.oracleCipherV13.hostIid);assert.ok(host.isToken);assert.equal(game.creatures(a).length,1);
    for(let n=0;n<2;n++){await game.damagePlayer(host,b,1,{combat:true});await settle(game);}
    assert.equal(game.creatures(a).length,3);assert.equal(a.exile.length,1);assert.equal(game.creatures(a).reduce((n,c)=>n+c.cur.extraTriggers.length,0),1);assertGameStateInvariants(game);
  });
}
test('cipher survives JSON restoration and AI copies without cross-game references',async()=>{
  const f=setup(),host=put(M,f.game,f.a,'Runeclaw Bear'),original=await encode(f);
  const state=M.captureGameState(f.game);assert.ok(state,M.gameStateSnapshotBlockers(f.game).join(', '));
  const restored=setup();M.restoreGameState(restored.game,JSON.parse(JSON.stringify(state)));restored.game.recalc();
  const rh=restored.game.byIid(host.iid);assert.equal(rh.cur.extraTriggers.length,1);
  const hand=restored.a.hand.length;await restored.game.damagePlayer(rh,restored.b,1,{combat:true});await settle(restored.game);assert.equal(restored.a.hand.length,hand+1);
  const clone=M.cloneGameForAISimulation(f.game,8723);clone.recalc();
  await clone.move(clone.byIid(original.iid),'graveyard');clone.recalc();assert.equal(clone.byIid(host.iid).cur.extraTriggers.length,0);
  assert.equal(host.cur.extraTriggers.length,1);assert.equal(original.zone,'exile');assertGameStateInvariants(clone);assertGameStateInvariants(f.game);
});
test('declining encoding and countering a cipher spell create no link',async()=>{
  const f=context(M),host=put(M,f.game,f.a,'Runeclaw Bear');f.a.pool.U=3;f.a.pool.C=12;
  const declined=await encode(f);assert.equal(declined.zone,'graveyard');assert.equal(host.cur.extraTriggers.length,0);
  const countered=put(M,f.game,f.a,'Last Thoughts','hand');assert.equal(await f.game.castSpell(f.a,countered,{from:'hand'}),true);
  await f.game.counterStackObject(f.game.stack.at(-1));await settle(f.game);assert.equal(countered.zone,'graveyard');assert.equal(host.cur.extraTriggers.length,0);
});
test('later ability removal suppresses cipher until the removal ends',async()=>{
  const f=setup(),{game,a,b}=f,host=put(M,game,a,'Runeclaw Bear');await encode(f);
  M.OracleV8AbilityLoss.add(game,[host],{temporary:true});assert.equal(host.cur.extraTriggers.length,0);
  const hand=a.hand.length;await game.damagePlayer(host,b,1,{combat:true});await settle(game);assert.equal(a.hand.length,hand);
  game.untilEffects=game.untilEffects.filter(effect=>effect.kind!=='oracleAbilityLoss');game.recalc();assert.equal(host.cur.extraTriggers.length,1);
  await game.damagePlayer(host,b,1,{combat:true});await settle(game);assert.equal(a.hand.length,hand+1);assertGameStateInvariants(game);
});
