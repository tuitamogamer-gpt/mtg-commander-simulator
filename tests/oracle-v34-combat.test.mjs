import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCombatV34} from './helpers/oracle-v34-combat-proof.mjs';

const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v34-combat.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9976,compilerVersion:34});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v34 accepts closed combat programs only',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:34}).semanticClass,undefined,row.name);
});
test('v34 preserves previous v33 programs',()=>{
  for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v33-common.json',import.meta.url))))assert.deepEqual(semanticClass(row,{compilerVersion:34}),semanticClass(row,{compilerVersion:33}),row.name);
});
for(const role of ['human','ai'])for(const name of names)test(`${role}: ${name} paid combat program`,()=>proveCombatV34(M,name,role));
