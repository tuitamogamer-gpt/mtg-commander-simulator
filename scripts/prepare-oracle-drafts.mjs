// Build canonical, source-pinned reports for executable testing without
// changing the catalog, application imports, or production import state.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collectReservedOracleCards,createImportPlan,fetchOracleCardsFromGzip,runtimeBatch} from './import-oracle-batch.mjs';
import {extractRawData} from './source-audit.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [sourceFile,outputFile]=process.argv.slice(2);
if(!sourceFile||!outputFile)throw new Error('Usage: node scripts/prepare-oracle-drafts.mjs <pinned.jsonl.gz> <draft.json>');
let state=JSON.parse(fs.readFileSync(path.join(root,'reports/oracle-import/state.json'),'utf8'));
const source=state.source;
if(!source.bulkSha256)throw new Error('The existing import state must pin the source SHA-256.');
const {cards,bulk}=await fetchOracleCardsFromGzip(sourceFile,{type:source.bulkType,id:source.bulkId,updated_at:source.bulkUpdatedAt,description:source.bulkDescription},source.bulkSha256);
const reports=fs.readdirSync(path.join(root,'reports/oracle-import')).filter(name=>name.endsWith('.json')&&name!=='state.json').map(name=>JSON.parse(fs.readFileSync(path.join(root,'reports/oracle-import',name),'utf8')));
const reservations=collectReservedOracleCards(reports);
const baseNames=new Set(Object.keys(extractRawData(fs.readFileSync(path.join(root,'src/data.js'),'utf8')).cards));
const generatedAt=new Date().toISOString(),batches=[];
let sequence=Math.max(...state.batches.map(batch=>batch.sequence))+1;
const options=()=>({cards,bulk,state,baseNames,reservations,sequence,generatedAt});
const probe=createImportPlan({...options(),limit:1});
const available=probe.report.catalogSummary.readyForThisCompiler;
let remaining=Math.min(3000,available);
while(remaining){
  const limit=Math.min(100,remaining),plan=createImportPlan({...options(),limit});
  batches.push(runtimeBatch(plan.report));state=plan.nextState;sequence++;remaining-=limit;
}
fs.mkdirSync(path.dirname(outputFile),{recursive:true});
fs.writeFileSync(outputFile,JSON.stringify({status:'draft-not-imported',available,generatedAt,source,batches},null,2)+'\n');
console.log(JSON.stringify({available,draftCards:batches.reduce((n,b)=>n+b.cards.length,0),batches:batches.length,outputFile}));
