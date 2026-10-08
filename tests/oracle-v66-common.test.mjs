import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {loadEngine} from './helpers/load-engine.mjs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {names,proveCommonV66} from './helpers/oracle-v66-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v66-common.json',import.meta.url)));
const plan=createFixturePlan(rows,69,9966);
const M=loadEngine();registerCanonicalFixturePlan(M,plan);
test('v66 accepts complete exact enchantments and rejects unknown instructions',()=>{
 assert.equal(plan.report.cards.length,rows.length);
 for(const row of rows){const changed=structuredClone(row);changed.oracle_text+='\nPerform an unsupported action.';assert.equal(plan.classify(changed).semanticClass,undefined,row.name);}
});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} enchantment ${positive}`,()=>proveCommonV66(M,name,role,positive));
