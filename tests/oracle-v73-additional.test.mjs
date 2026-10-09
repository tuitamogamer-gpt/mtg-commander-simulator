import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import{createFixturePlan,registerCanonicalFixturePlan}from'./helpers/oracle-fixture-plan.mjs';
import{loadEngine}from'./helpers/load-engine.mjs';
import{names,proveAdditionalV73}from'./helpers/oracle-v73-additional-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v73-additional.json',import.meta.url))),plan=createFixturePlan(rows,73,19973),M=loadEngine();registerCanonicalFixturePlan(M,plan);
test('v73 additional exact sources reject unknown appended rules',()=>{for(const c of rows)assert.equal(plan.classify({...c,oracle_text:c.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,c.name);});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} complete rules ${positive}`,()=>proveAdditionalV73(M,name,role,positive));
