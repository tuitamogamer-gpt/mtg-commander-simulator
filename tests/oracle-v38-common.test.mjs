import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV38} from './helpers/oracle-v38-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v38-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9971,compilerVersion:38});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v38 accepts complete common and rejects unknown instructions',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:38}).semanticClass,undefined,row.name);
});
test('v38 preserves v37 event programs',()=>{
  for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v37-events.json',import.meta.url))))assert.deepEqual(semanticClass(row,{compilerVersion:38}),semanticClass(row,{compilerVersion:37}),row.name);
});
for(const role of ['human','ai'])for(const name of names)test(`${role}: ${name} paid event program`,()=>proveCommonV38(M,name,role));
