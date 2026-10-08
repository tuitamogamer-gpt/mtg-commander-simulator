import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';import {loadEngine} from './helpers/load-engine.mjs';import {names,proveCommonV72} from './helpers/oracle-v72-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v72-common.json',import.meta.url))),plan=createFixturePlan(rows,72,9972),M=loadEngine();registerCanonicalFixturePlan(M,plan);
test('v72 complete sources reject appended unknown rules',()=>{for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} complete rules ${positive}`,()=>proveCommonV72(M,name,role,positive));
