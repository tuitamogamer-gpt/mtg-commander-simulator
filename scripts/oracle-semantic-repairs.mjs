import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createImportPlan,moduleSource} from './import-oracle-batch.mjs';

const fields=['semanticClass','implementedKeywords','implementation','oracleContracts','rulesCore'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const semantic=row=>Object.fromEntries(fields.map(key=>[key,row[key]]));
const plain=value=>JSON.parse(JSON.stringify(value));

// A repair is an explicit migration of one frozen semantic row. Both old and
// new report/module bytes are checked; raw source, positions, cohort selection,
// and every unlisted row are reconstructed unchanged. The new row must then
// compile in full from the same SHA-pinned Oracle source.
export function verifyOracleSemanticRepairs({manifests=[],sourceCards,bulk,reports,runtimeSources,reportSources}){
 const result=new Map(),manifestIds=new Set();
 for(const manifest of manifests){
  assert.equal(manifest.schemaVersion,1,'semantic repair manifest schema');
  assert.ok(typeof manifest.id==='string'&&!manifestIds.has(manifest.id),'unique semantic repair manifest');manifestIds.add(manifest.id);
  assert.equal(manifest.source.bulkSha256,bulk.sha256,'semantic repair pinned source hash');
  assert.equal(manifest.source.bulkUpdatedAt,bulk.updated_at,'semantic repair source date');
  assert.ok(Array.isArray(manifest.repairs)&&manifest.repairs.length&&Array.isArray(manifest.files),'explicit semantic repair rows/files');
  const batches=new Set(manifest.repairs.map(row=>row.batch));
  assert.equal(manifest.files.length,batches.size,'exact repaired file pairs');
  const reconstructed=new Map();
  for(const repair of manifest.repairs){
   const label=manifest.id+'/'+repair.name,key=repair.batch+'/'+repair.oracleId;
   assert.equal(result.has(key),false,label+': no duplicate row migration');
   assert.deepEqual(Object.keys(repair.before).sort(),fields.slice().sort(),label+': exact old semantic fields');
   assert.deepEqual(Object.keys(repair.after).sort(),fields.slice().sort(),label+': exact new semantic fields');
   assert.equal(hash(JSON.stringify(repair.before)),repair.beforeSha256,label+': old semantic hash');
   assert.equal(hash(JSON.stringify(repair.after)),repair.afterSha256,label+': new semantic hash');
   assert.notEqual(repair.beforeSha256,repair.afterSha256,label+': migration changes semantics');
   assert.equal(repair.repairCompilerVersion,8,label+': supported explicit repair compiler');
   const report=reports.find(report=>report.id===repair.batch);assert.ok(report,label+': original report');
   assert.equal(repair.originalCompilerVersion,report.selectionPolicy.compilerVersion,label+': original compiler remains recorded');
   const row=report.cards.find(row=>row.oracleId===repair.oracleId);assert.ok(row,label+': original cohort membership');assert.equal(row.raw.name,repair.name,label+': original name');
   assert.deepEqual(semantic(row),repair.after,label+': exact installed new semantics');
   const cards=sourceCards.filter(card=>card.oracle_id===repair.oracleId);assert.equal(cards.length,1,label+': unique pinned Oracle object');assert.equal(cards[0].name,repair.name,label+': pinned name');
   assert.equal(hash(cards[0].oracle_text),repair.sourceOracleSha256,label+': exact printed rules');
   const compiled=createImportPlan({cards,bulk,baseNames:new Set(),sequence:report.sequence,limit:1,generatedAt:report.generatedAt,compilerVersion:repair.repairCompilerVersion}).report.cards[0];
   const expected={...plain(compiled),position:row.position};assert.deepEqual(row,expected,label+': complete source recompile including raw/catalog/keywords/contracts');
   const beforeReport=reconstructed.get(report.id)||structuredClone(report);beforeReport.cards[row.position-1]={...beforeReport.cards[row.position-1],...repair.before};reconstructed.set(report.id,beforeReport);
   result.set(key,{manifestId:manifest.id,repair,expectedRow:expected});
  }
  const checked=new Set();
  for(const file of manifest.files){
   const match=/^reports\/oracle-import\/batch-(\d{4})\.json$/.exec(file.report);assert.ok(match,'canonical repair report path');
   const id='oracle-'+match[1],report=reports.find(row=>row.id===id),before=reconstructed.get(id);assert.ok(before&&report&&!checked.has(id),'one file pair per repaired batch');checked.add(id);
   assert.equal(file.module,'src/oracle-batches/batch-'+match[1]+'.js','canonical repaired module path');
   const actualReport=reportSources.get(id),actualModule=runtimeSources.get(id);assert.equal(typeof actualReport,'string',id+': report bytes supplied');assert.equal(typeof actualModule,'string',id+': module bytes supplied');
   assert.equal(hash(actualReport),file.reportAfterSha256,id+': installed report hash');assert.equal(hash(actualModule),file.moduleAfterSha256,id+': installed module hash');
   assert.equal(actualModule,moduleSource(report),id+': repaired runtime/report exact parity');
   assert.equal(hash(JSON.stringify(before,null,2)+'\n'),file.reportBeforeSha256,id+': old report reconstructed without unrelated changes');
   assert.equal(hash(moduleSource(before)),file.moduleBeforeSha256,id+': old module reconstructed without unrelated changes');
  }
  assert.deepEqual([...checked].sort(),[...batches].sort(),'every repaired batch file verified');
 }
 return result;
}
