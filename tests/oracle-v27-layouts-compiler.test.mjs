import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v27-layouts.json',import.meta.url),'utf8'));
const all=v=>v&&typeof v==='object'?[v,...Object.values(v).flatMap(x=>Array.isArray(x)?x.flatMap(all):all(x))]:[];
test('v27 library whole cards consume every physical face and reject an unsupported extra rule on each face',()=>{assert.equal(rows.length,35);for(const row of rows){const result=semanticClass(row,{compilerVersion:27});assert.ok(result.semanticClass,row.name);for(let i=0;i<(row.card_faces?.length||1);i++){const bad=structuredClone(row);const face=bad.card_faces?.[i]||bad;face.oracle_text=(face.oracle_text||'')+'\nDo an unsupported thing.';assert.equal(semanticClass(bad,{compilerVersion:27}).semanticClass,undefined,row.name+' face '+i);}}});
