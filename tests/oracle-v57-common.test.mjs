import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {createFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV57} from './helpers/oracle-v57-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v57-common.json',import.meta.url)));
const plan=createFixturePlan(rows,57,9959);
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v57 accepts complete spells and rejects appended unsupported instructions',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} spell ${positive}`,()=>proveCommonV57(M,name,role,positive));
