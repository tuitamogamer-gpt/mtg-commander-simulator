import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV56} from './helpers/oracle-v56-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v56-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9958,compilerVersion:56});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v56 accepts complete common and rejects unknown instructions',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:56}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} spell ${positive}`,()=>proveCommonV56(M,name,role,positive));

