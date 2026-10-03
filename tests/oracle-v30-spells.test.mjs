import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveSpellV30,proveEdgeV30,edgeCasesV30} from './helpers/oracle-v30-spells-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v30-spells.json',import.meta.url))),M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9960,limit:absent.length,compilerVersion:30});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}M.initData(M.RAW_DATA);
test('40 v30 whole spell sources reject every unsupported suffix',()=>{assert.equal(rows.length,40);for(const row of rows){assert.ok(semanticClass(row,{compilerVersion:30}).semanticClass,row.name);assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:30}).semanticClass,undefined,row.name);}});
for(const row of rows)for(const role of ['human','ai']){for(const positive of [false,true])test(row.name+'/'+role+'/'+positive,()=>proveSpellV30(M,row.name,role,positive));for(const scenario of edgeCasesV30[row.name]||[])test(row.name+'/'+role+'/'+scenario,()=>proveEdgeV30(M,row.name,scenario,role));}
