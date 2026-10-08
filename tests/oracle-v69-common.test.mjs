import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFixturePlan,registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names,proveCommonV69,proveSpellColorsV69} from './helpers/oracle-v69-common-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v69-common.json',import.meta.url)));
const plan=createFixturePlan(rows,69,9969),M=loadEngine();
registerCanonicalFixturePlan(M,plan);
test('v69 accepts complete physical sources and rejects unknown instructions on every face',()=>{assert.equal(plan.report.cards.length,rows.length);for(const row of rows){if(row.card_faces)for(let i=0;i<row.card_faces.length;i++){const faces=structuredClone(row.card_faces);faces[i].oracle_text+='\nPerform an unsupported action.';assert.equal(plan.classify({...row,card_faces:faces}).semanticClass,undefined,row.name+' face '+i);}else assert.equal(plan.classify({...row,oracle_text:row.oracle_text+'\nPerform an unsupported action.'}).semanticClass,undefined,row.name);}});
for(const role of ['human','ai'])for(const name of names)for(const positive of [true,false])test(`${role}: ${name} complete physical rules ${positive}`,()=>proveCommonV69(M,name,role,positive));

for(const role of ['human','ai'])test(`${role}: actual paid spell and Adventure copy color target filters`,()=>proveSpellColorsV69(M,role));
