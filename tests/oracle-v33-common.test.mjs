import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,def,put,source} from './helpers/oracle-v30-permanents-proof.mjs';
import {proveCommonV33} from './helpers/oracle-v33-common-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v33-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9977,compilerVersion:33});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});
M.initData(M.RAW_DATA);

test('v33 consumes complete programs and rejects unsupported suffixes',()=>{
  for(const row of rows){
    assert.ok(semanticClass(row,{compilerVersion:33}).semanticClass,row.name);
    assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:33}).semanticClass,undefined,row.name);
  }
});
test('v33 replays v32 spells and explicit Teyo repairs unchanged',()=>{
  for(const file of ['oracle-v32-spells.json','oracle-v32-target-bindings.json'])for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/'+file,import.meta.url))))
    assert.deepEqual(semanticClass(row,{compilerVersion:33}),semanticClass(row,{compilerVersion:32}),row.name);
});
for(const role of ['human','ai']){
  for(const name of ['Guardian of the Gateless','Herald of Anafenza','Gastal Thrillroller',"Nature's Will",'Evidence Examiner','Surveillance Monitor','Loki Laufeyson','Mu Yanling, Wind Rider','Skycoach Waypoint'])
    test(`${role}: ${name} paid complete program`,()=>proveCommonV33(M,name,role));
  for(const returned of [false,true])test(`${role}: Loki copies against ${returned?'the old incarnation':'current increased power'}`,async()=>{
    const f=context(M,role),{game:g,a,b}=f;fund(a);
    const c=await source(M,f,'Loki Laufeyson',settle);c.sick=false;
    assert.equal(await g.activateAbility(a,g.activatableList(a).find(x=>x.card===c&&x.ability.cost.tap)),true);await settle(g);
    let resolved=0;
    const cast=async n=>{const spell=put(M,a,def('Power threshold instant '+n,['Instant'],{cost:'{'+n+'}',resolve:async()=>{resolved++;}}),'hand');assert.equal(await g.castSpell(a,spell,{from:'hand'}),true);await settle(g);};
    if(returned){await g.move(c,'exile');await g.putPermanentOntoBattlefield(c,b);g.addCounters(c,'+1/+1',5);}
    await cast(3);assert.equal(resolved,1,'an oversized spell does not consume the delayed trigger');
    if(!returned)g.addCounters(c,'+1/+1',1);
    await cast(returned?2:3);assert.equal(resolved,3);
    await cast(1);assert.equal(resolved,4,'the delayed trigger is consumed once');
    assertGameStateInvariants(g);
  });
}
