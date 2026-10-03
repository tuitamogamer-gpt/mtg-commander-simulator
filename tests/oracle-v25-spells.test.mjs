import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveSpellV25,proveSpellEdgeV25,edgeCasesV25} from './helpers/oracle-v25-spells-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v25-spells.json',import.meta.url))),M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9955,limit:absent.length,compilerVersion:25});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}M.initData(M.RAW_DATA);
test('35 v25 fixtures retain complete rules and reject unknown suffixes',()=>{assert.equal(rows.length,35);for(const c of rows){assert.ok(semanticClass(c,{compilerVersion:25}).semanticClass,c.name);assert.equal(semanticClass({...c,oracle_text:c.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:25}).semanticClass,undefined,c.name);}});
for(const role of ['human','ai'])for(const row of rows)for(const positive of [false,true])test(role+': '+row.name+' actual cast '+(positive?'positive':'negative')+' outcome',()=>proveSpellV25(M,row,role,positive));

for(const role of ['human','ai'])for(const [name,scenarios]of Object.entries(edgeCasesV25))for(const scenario of scenarios)test(role+': '+name+' '+scenario,()=>proveSpellEdgeV25(M,name,role,scenario));
