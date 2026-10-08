import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveSpellV36} from './helpers/oracle-v36-spells-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v36-spells.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9973,compilerVersion:36});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v36 accepts complete programs and rejects extra unknown instructions',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:36}).semanticClass,undefined,row.name);
});
test('v36 preserves v35 complete programs',()=>{
  for(const row of JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v35-common.json',import.meta.url))))assert.deepEqual(semanticClass(row,{compilerVersion:36}),semanticClass(row,{compilerVersion:35}),row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name}, ${positive?'primary':'alternate'} paid resolution`,()=>proveSpellV36(M,name,role,positive));
