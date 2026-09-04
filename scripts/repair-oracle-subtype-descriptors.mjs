import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchOracleCardsFromGzip, moduleSource, semanticClass} from './import-oracle-batch.mjs';
import {ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const auditPath=path.join(root,'reports/oracle-semantic-repair-2026-09-04.json');
const digest=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
function differences(a,b,at='') {
  if(JSON.stringify(a)===JSON.stringify(b))return [];
  if(a&&b&&typeof a==='object'&&typeof b==='object')return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(key=>differences(a[key],b[key],at+'/'+key));
  return [{path:at,before:a,after:b}];
}
function readPointer(value,pointer){return pointer.split('/').slice(1).reduce((node,key)=>node[key],value);}
function incorrectSubtypeNodes(node) {
  if(!node||typeof node!=='object')return false;
  if(node.what==='creature'&&ORACLE_SUBTYPE_TYPES[node.subtype]&&ORACLE_SUBTYPE_TYPES[node.subtype]!=='creature')return true;
  return Object.values(node).some(incorrectSubtypeNodes);
}

// This is a reviewed, one-time repair of stale generated selectors, not an
// import or a compiler upgrade. Every card is recompiled with its original
// batch version; any difference beyond the reviewed leaf rejects the repair.
export async function repairSubtypeDescriptors({sourceFile,write=false}={}) {
  assert.ok(sourceFile,'--source-file is required');
  const state=JSON.parse(fs.readFileSync(path.join(root,'reports/oracle-import/state.json'),'utf8'));
  const existing=fs.existsSync(auditPath)?JSON.parse(fs.readFileSync(auditPath,'utf8')):null;
  const source=existing?{bulkType:'oracle_cards',bulkId:existing.source.bulkId,bulkUpdatedAt:existing.source.updatedAt,bulkSha256:existing.source.sha256}:state.source;
  const {cards,bulk}=await fetchOracleCardsFromGzip(sourceFile,{type:source.bulkType,id:source.bulkId,updated_at:source.bulkUpdatedAt},source.bulkSha256);
  const byId=new Map(cards.map(card=>[card.oracle_id,card]));
  const changes=[],batches=[];
  for(const filename of fs.readdirSync(path.join(root,'reports/oracle-import')).filter(file=>/^batch-\d{4}\.json$/.test(file)).sort()) {
    const reportPath=path.join(root,'reports/oracle-import',filename),runtimePath=path.join(root,'src/oracle-batches',filename.replace('.json','.js'));
    const beforeReport=fs.readFileSync(reportPath,'utf8'),beforeRuntime=fs.readFileSync(runtimePath,'utf8'),report=JSON.parse(beforeReport);
    assert.equal(beforeRuntime,moduleSource(report),report.id+': existing report/runtime parity');
    let changed=false;
    for(const row of report.cards) {
      const recorded=existing?.cards.find(entry=>entry.oracleId===row.oracleId);
      if(!incorrectSubtypeNodes(row.implementation)&&!recorded)continue;
      const source=byId.get(row.oracleId);assert.ok(source,row.raw.name+': pinned source identity');
      const compiled=semanticClass(source,{compilerVersion:report.selectionPolicy.compilerVersion,memoize:false});
      for(const field of ['semanticClass','implementedKeywords','oracleContracts','rulesCore'])assert.deepEqual(row[field],clone(compiled[field]),row.raw.name+': unchanged '+field);
      const delta=differences(row.implementation,compiled.implementation);
      if(recorded&&!delta.length){assert.equal(digest(row.implementation),recorded.afterImplementationSha256,row.raw.name+': recorded repaired AST');continue;}
      assert.equal(delta.length,1,row.raw.name+': one reviewed selector leaf');
      const change=delta[0],parent=readPointer(row.implementation,change.path.slice(0,change.path.lastIndexOf('/')));
      assert.equal(change.path.split('/').at(-1),'what');assert.equal(change.before,'creature');
      assert.ok(['land','artifact'].includes(change.after));assert.equal(change.after,ORACLE_SUBTYPE_TYPES[parent.subtype]);
      const before=clone(row.implementation);
      parent.what=change.after;
      assert.deepEqual(row.implementation,clone(compiled.implementation),row.raw.name+': full original-version AST parity');
      changes.push({batch:report.id,compilerVersion:report.selectionPolicy.compilerVersion,name:row.raw.name,oracleId:row.oracleId,subtype:parent.subtype,...change,beforeImplementationSha256:digest(before),afterImplementationSha256:digest(row.implementation)});
      changed=true;
    }
    if(changed){const afterReport=JSON.stringify(report,null,2)+'\n',afterRuntime=moduleSource(report);batches.push({id:report.id,reportPath,runtimePath,beforeReportSha256:digest(beforeReport),afterReportSha256:digest(afterReport),beforeRuntimeSha256:digest(beforeRuntime),afterRuntimeSha256:digest(afterRuntime),afterReport,afterRuntime});}
  }
  if(!changes.length){assert.equal(existing?.cards.length,20,'expected the recorded twenty-card repair');return {ok:true,alreadyRepaired:true,cards:20,batches:19};}
  assert.equal(changes.length,20,'reviewed repair contains exactly twenty cards');assert.equal(batches.length,19,'reviewed repair contains exactly nineteen batches');
  const report={schemaVersion:1,id:'oracle-subtype-selector-repair-2026-09-04',reason:'Historical generated selectors used creature for land/artifact subtypes. Current original-version recompilation changes only the reviewed what leaf.',rules:'https://media.wizards.com/2026/downloads/MagicCompRules%2020260819.txt',source:{sha256:bulk.sha256,updatedAt:bulk.updated_at,bulkId:bulk.id},preserved:['Oracle IDs','Scryfall IDs','source fields','raw card fields','catalog fields','batch membership','positions','compiler versions','import state'],cards:changes,batches:batches.map(({reportPath,runtimePath,afterReport,afterRuntime,...entry})=>({...entry,report:path.relative(root,reportPath),runtime:path.relative(root,runtimePath)}))};
  if(write){for(const batch of batches){fs.writeFileSync(batch.reportPath,batch.afterReport);fs.writeFileSync(batch.runtimePath,batch.afterRuntime);}fs.writeFileSync(auditPath,JSON.stringify(report,null,2)+'\n');}
  return {ok:true,write,cards:changes.length,batches:batches.length,changes};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const sourceFile=process.argv.slice(2).find(arg=>arg.startsWith('--source-file='))?.slice(14);
  const result=await repairSubtypeDescriptors({sourceFile,write:process.argv.includes('--write')});
  console.log(JSON.stringify(result,null,2));
}
