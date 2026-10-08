import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {createFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {names,proveCommonV59} from './helpers/oracle-v59-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v59-common.json',import.meta.url)));
const plan=createFixturePlan(rows,59,9959);
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v59 accepts complete exact enchantments and rejects unknown instructions',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows)for(const index of row.card_faces?row.card_faces.map((_,i)=>i):[null]){const changed=structuredClone(row);if(index===null)changed.oracle_text+='\nPerform an unsupported action.';else changed.card_faces[index].oracle_text+='\nPerform an unsupported action.';assert.equal(plan.classify(changed).semanticClass,undefined,row.name);}
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} enchantment ${positive}`,()=>proveCommonV59(M,name,role,positive));
