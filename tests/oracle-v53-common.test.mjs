import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,runtimeBatch,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV53} from './helpers/oracle-v53-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v53-common.json',import.meta.url)));
const plan=createImportPlan({cards:rows,bulk:{type:'oracle_cards'},limit:rows.length,sequence:9955,compilerVersion:53});
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v53 accepts complete common and rejects unknown instructions',()=>{
  assert.equal(plan.report.cards.length,rows.length);
  for(const row of rows)assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'},{compilerVersion:53}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} spell ${positive}`,()=>proveCommonV53(M,name,role,positive));

import {proveCommonV52} from './helpers/oracle-v52-common-proof.mjs';
for(const role of ['human','ai'])for(const positive of [true,false])test(`${role}: current Oracle Samite Elder ${positive}`,()=>proveCommonV52(M,'Samite Elder',role,positive));
