import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV51} from './helpers/oracle-v51-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v51-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9957,compilerVersion:51});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v51 accepts complete common and rejects unknown instructions',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:51}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} spell ${positive}`,()=>proveCommonV51(M,name,role,positive));
