import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';

import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV68} from './helpers/oracle-v68-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v68-common.json',import.meta.url)));
const plan=createFixturePlan(rows,69,9968),M=loadEngine();
registerCanonicalFixturePlan(M,plan);
test('v68 accepts exact complete source rows and rejects appended unknown instructions',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} ${positive}`,()=>proveCommonV68(M,name,role,positive));
