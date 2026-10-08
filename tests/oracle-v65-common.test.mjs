import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV65} from './helpers/oracle-v65-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v65-common.json',import.meta.url)));
const plan=createFixturePlan(rows,69,9965),M=loadEngine();
registerCanonicalFixturePlan(M,plan);
test('v65 accepts complete creature sources and rejects unknown instructions',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} spell ${positive}`,()=>proveCommonV65(M,name,role,positive));
