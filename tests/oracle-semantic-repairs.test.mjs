import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyOracleSemanticRepairs} from '../scripts/oracle-semantic-repairs.mjs';
import {moduleSource} from '../scripts/import-oracle-batch.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
function fixture(){
 const manifest=JSON.parse(fs.readFileSync('reports/oracle-import/repairs/token-forms-2026-09-05.json','utf8'));
 const reports=manifest.files.map(file=>JSON.parse(fs.readFileSync(file.report,'utf8'))),source=reports[0].source;
 return {manifests:[manifest],reports,sourceCards:JSON.parse(fs.readFileSync('tests/fixtures/oracle-semantic-repair-source.json','utf8')),
  bulk:{type:source.bulkType,id:source.bulkId,updated_at:source.bulkUpdatedAt,description:source.bulkDescription,sha256:source.bulkSha256},
  reportSources:new Map(manifest.files.map((file,i)=>[reports[i].id,fs.readFileSync(file.report,'utf8')])),
  runtimeSources:new Map(manifest.files.map((file,i)=>[reports[i].id,fs.readFileSync(file.module,'utf8')])),};
}
test('all eight exact source repairs preserve original bytes outside semantic fields and recompile fully with compiler8',()=>{
 const input=fixture(),rows=verifyOracleSemanticRepairs(input);assert.equal(rows.size,8);assert.equal([...rows.values()].filter(row=>row.repair.originalCompilerVersion===5).length,4);assert.equal([...rows.values()].filter(row=>row.repair.originalCompilerVersion===6).length,1);
 assert.equal(input.manifests[0].repairs.length,8,'verification does not mutate the manifest');
});
test('a repair rejects changed pinned rules, source metadata, compiler claims, and old semantic hashes',()=>{
 for(const mutate of [
  f=>{f.sourceCards.find(card=>card.oracle_id===f.manifests[0].repairs[0].oracleId).oracle_text+=' Draw a card.';},
  f=>{f.bulk.sha256='0'.repeat(64);},
  f=>{f.manifests[0].repairs[0].originalCompilerVersion=8;},
  f=>{f.manifests[0].repairs[0].repairCompilerVersion=5;},
  f=>{f.manifests[0].repairs[0].beforeSha256='0'.repeat(64);},
 ]){const f=fixture();mutate(f);assert.throws(()=>verifyOracleSemanticRepairs(f));}
});
test('recomputing current file hashes cannot hide a change to an unrelated frozen row',()=>{
 const f=fixture(),report=f.reports[0],file=f.manifests[0].files[0],repair=f.manifests[0].repairs[0];
 const row=report.cards.find(row=>row.oracleId!==repair.oracleId);row.raw.oracle+=' Draw a card.';
 const bytes=JSON.stringify(report,null,2)+'\n',runtime=moduleSource(report);f.reportSources.set(report.id,bytes);f.runtimeSources.set(report.id,runtime);file.reportAfterSha256=hash(bytes);file.moduleAfterSha256=hash(runtime);
 assert.throws(()=>verifyOracleSemanticRepairs(f),/old report reconstructed without unrelated changes/);
});
test('self-consistent after hashes cannot replace the exact pinned semantic recompile',()=>{
 const f=fixture(),report=f.reports[0],file=f.manifests[0].files[0],repair=f.manifests[0].repairs[0],row=report.cards.find(row=>row.oracleId===repair.oracleId);
 repair.after.implementation[0].effects[0].n=7;repair.afterSha256=hash(JSON.stringify(repair.after));Object.assign(row,structuredClone(repair.after));
 const bytes=JSON.stringify(report,null,2)+'\n',runtime=moduleSource(report);f.reportSources.set(report.id,bytes);f.runtimeSources.set(report.id,runtime);file.reportAfterSha256=hash(bytes);file.moduleAfterSha256=hash(runtime);
 assert.throws(()=>verifyOracleSemanticRepairs(f),/complete source recompile/);
});
