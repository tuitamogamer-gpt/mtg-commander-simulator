import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {semanticClass} from '../scripts/import-oracle-batch.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v25-layouts.json',import.meta.url),'utf8'));
test('v25 whole cards consume both faces and reject an extra unsupported rule',()=>{for(const row of rows){assert.ok(semanticClass(row,{compilerVersion:25}).semanticClass,row.name);const bad=structuredClone(row);if(bad.card_faces)bad.card_faces[0].oracle_text+='\nDo an unsupported thing.';else bad.oracle_text+='\nDo an unsupported thing.';assert.equal(semanticClass(bad,{compilerVersion:25}).semanticClass,undefined,row.name);}});

const extra=JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-v25-layouts-extra.json',import.meta.url),'utf8'));
test('v25 separate singular creature and land cards preserve independent disjoint optional choices',()=>{for(const row of extra){const result=semanticClass(row,{compilerVersion:25}),effect=result.implementation[0].faces[0].implementation[0].effects[0];assert.equal(effect.action,'library-program-v25');assert.deepEqual(effect.n,{kind:'event-amount'});assert.equal(effect.selections.length,2);assert.deepEqual(effect.selections.map(s=>s.filter.what),['creature','land']);assert.ok(effect.selections.every(s=>s.max===1&&!s.required));const bad=structuredClone(row);bad.card_faces[0].oracle_text+='\nDo an unsupported thing.';assert.equal(semanticClass(bad,{compilerVersion:25}).semanticClass,undefined);}});
