import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV67} from './helpers/oracle-v67-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v67-common.json',import.meta.url)));
const plan=createFixturePlan(rows,69,9967);
const M=loadEngine();
registerCanonicalFixturePlan(M,plan);
test('v67 accepts complete source and rejects appended unknown instructions',()=>{
 assert.equal(rows.length,names.length);
 for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} ${positive}`,()=>proveCommonV67(M,name,role,positive));
