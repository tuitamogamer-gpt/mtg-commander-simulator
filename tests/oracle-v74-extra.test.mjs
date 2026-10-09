import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveExtraV74} from './helpers/oracle-v74-extra-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v74-extra.json',import.meta.url))),plan=createFixturePlan(rows,74,9975),M=loadEngine();registerCanonicalFixturePlan(M,plan);
test('additional creatures require all complete source clauses',()=>{for(const row of rows)assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} complete paid rules ${positive}`,()=>proveExtraV74(M,name,role,positive));
