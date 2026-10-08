import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runtimeBatch} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV63} from './helpers/oracle-v63-common-proof.mjs';
import {createFixturePlan} from './helpers/oracle-fixture-plan.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v63-common.json',import.meta.url)));
assert.ok(names.every(name=>rows.some(row=>row.name===name)),'each paid native scenario uses a selected complete card');
const plan=createFixturePlan(rows,63,9965);
const M=loadEngine(),absent=plan.report.cards.filter(row=>!M.DEFS[row.raw.name]);
if(absent.length)M.registerOracleBatch({...runtimeBatch(plan.report),cards:absent});M.initData(M.RAW_DATA);
test('v63 accepts complete printed faces and rejects unknown instructions on either face',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows)for(let index=0;index<(row.card_faces?.length||1);index++){
  const changed=row.card_faces?{...row,card_faces:row.card_faces.map((face,i)=>i===index?{...face,oracle_text:face.oracle_text+'\nPerform an unsupported action.'}:face)}:{...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'};
  assert.equal(plan.classify(changed).semanticClass,undefined,row.name+' face '+index);
 }
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} ${positive}`,()=>proveCommonV63(M,name,role,positive));
