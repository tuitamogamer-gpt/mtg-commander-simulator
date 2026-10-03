import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createImportPlan,semanticClass} from '../scripts/import-oracle-batch.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {proveSpellV29,proveEdgeV29,edgeCasesV29} from './helpers/oracle-v29-spells-proof.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v29-spells.json',import.meta.url))),M=loadEngine(),absent=rows.filter(c=>!M.DEFS[c.name]);
if(absent.length){const plan=createImportPlan({cards:absent,bulk:{type:'oracle_cards'},sequence:9959,limit:absent.length,compilerVersion:29});assert.equal(plan.report.cards.length,absent.length);M.registerOracleBatch(plan.report);}M.initData(M.RAW_DATA);
test('40 v29 whole spell sources reject every unsupported suffix',()=>{assert.equal(rows.length,40);for(const row of rows){assert.ok(semanticClass(row,{compilerVersion:29}).semanticClass,row.name);assert.equal(semanticClass({...row,oracle_text:row.oracle_text+'\nDo an unsupported thing.'},{compilerVersion:29}).semanticClass,undefined,row.name);}});
for(const row of rows)for(const role of ['human','ai']){for(const positive of [false,true])test(row.name+'/'+role+'/'+positive,()=>proveSpellV29(M,row.name,role,positive));for(const scenario of edgeCasesV29[row.name]||[])test(row.name+'/'+role+'/'+scenario,()=>proveEdgeV29(M,row.name,scenario,role));}
