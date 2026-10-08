import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV35} from './helpers/oracle-v35-common-proof.mjs';
import {context,settle} from './helpers/oracle-v8-fixtures.mjs';
import {fund,def,put,permanent,targets,choose,source} from './helpers/oracle-v30-permanents-proof.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v35-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9975,compilerVersion:35});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v35 accepts complete event and cost programs only',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:35}).semanticClass,undefined,row.name);
});
test('v35 preserves v34 combat programs',()=>{
  for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v34-combat.json',import.meta.url))))assert.deepEqual(semanticClass(row,{compilerVersion:35}),semanticClass(row,{compilerVersion:34}),row.name);
});
for(const role of ['human','ai']){
  for(const name of names)test(`${role}: ${name} paid event program`,()=>proveCommonV35(M,name,role));
  for(const ability of [false,true])test(`${role}: copied ${ability?'ability':'spell'} targeting a player triggers Amulet`,async()=>{
    const f=context(M,role),{game:g,a,b}=f;fund(a);fund(b);await source(M,f,'Amulet of Safekeeping',settle);
    let resolved=0;targets(b,[a]);choose(b,q=>q.type==='chooseOption'&&q.prompt.startsWith('Pay {1} to prevent counter')?{...q,options:q.options.filter(o=>o.key==='no')}:null);
    if(ability){
      const donor=permanent(M,g,b,def('Target ability source',['Artifact'],{abilities:[{cost:{mana:'{1}'},targets:[M.T.player()],run:async()=>{resolved++;}}]}));
      assert.equal(await g.activateAbility(b,g.activatableList(b).find(row=>row.card===donor)),true);
      await g.copyStackAbility(g.stack.find(row=>row.srcCard===donor),b,{mayNewTargets:false});
    }else{
      const spell=put(M,b,def('Target player spell',['Instant'],{targets:[M.T.player()],resolve:async()=>{resolved++;}}),'hand');
      assert.equal(await g.castSpell(b,spell,{from:'hand'}),true);await g.copySpell(g.stack.find(row=>row.card===spell),b,{mayNewTargets:false});
    }
    await settle(g);assert.equal(resolved,0);assertGameStateInvariants(g);
  });
  test(`${role}: copied targeting spell observes Surrak while permanent-only observers stay quiet`,async()=>{
    const f=context(M,role),{game:g,a,b}=f;fund(a);fund(b);await source(M,f,'Surrak, Elusive Hunter',settle);
    await source(M,f,"Shapers' Sanctuary",settle);await source(M,f,'Unsettled Mariner',settle);
    const creature=put(M,a,def('Creature on Stack'),'hand');assert.equal(await g.castSpell(a,creature,{from:'hand'}),true);const original=g.stack.find(row=>row.card===creature);
    targets(b,[original]);let resolved=0;const spell=put(M,b,def('Targets a creature spell',['Instant'],{targets:[M.T.spell()],resolve:async()=>{resolved++;}}),'hand');
    const before=a.hand.length;assert.equal(await g.castSpell(b,spell,{from:'hand'}),true);
    await g.copySpell(g.stack.find(row=>row.card===spell),b,{mayNewTargets:false});await settle(g);
    assert.equal(resolved,2);assert.equal(a.hand.length,before+2);assertGameStateInvariants(g);
  });
}
