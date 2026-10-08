import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV71} from './helpers/oracle-v71-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v71-common.json',import.meta.url)));
const plan=createFixturePlan(rows,71,9971),M=loadEngine();registerCanonicalFixturePlan(M,plan);
test('v71 accepts complete sources and rejects appended unknown instructions',()=>{assert.equal(plan.report.cards.length,rows.length);for(const c of rows)assert.equal(plan.classify({...c,oracle_text:c.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,c.name);});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} complete paid rules ${positive}`,()=>proveCommonV71(M,name,role,positive));
