import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData} from './source-audit.mjs';
import {sourceDir,buildIntake} from './import-znc-cmr-khc-precons.mjs';
const base='721f859',sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:30*1024*1024});
const previous=extractRawData(git('show',base+':src/data.js')),current=extractRawData(fs.readFileSync('src/data.js','utf8'));
for(const [name,raw] of Object.entries(previous.cards))assert.deepEqual(current.cards[name],raw,'Existing card changed: '+name);
for(const old of previous.decks)assert.deepEqual(current.decks.find(d=>d.name===old.name),old,'Existing list changed: '+old.name);
assert.equal(Object.keys(current.cards).length-Object.keys(previous.cards).length,42);assert.equal(current.decks.length-previous.decks.length,5);
assert.equal(git('diff',base,'--','src/oracle-batches','reports/oracle-import','assets/commander-intros'),'');
// New batch assets remain additions after staging/commit. Only changes or
// deletions to the baseline images violate preservation; disable rename
// detection so a moved baseline asset is still reported as a deletion.
assert.equal(git('diff',base,'--no-renames','--diff-filter=MDT','--','assets/cards'),'','An existing card image was changed');
const previousNativeCount=Object.keys(previous.cards).length;
const M=loadEngine(),i=buildIntake(M),records=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')).cards;
assert.equal(i.newNames.length,0);
const counts=()=>({definitions:Object.keys(M.DEFS).length,eligible:Object.values(M.CARD_CATALOG).filter(c=>c.deckImportEligible).length,selectableDecks:Object.keys(M.DECKS).length,nativeDefinitions:Object.keys(current.cards).length,activeUnique:new Set(Object.values(M.DECKS).flatMap(d=>d.cards.map(c=>c.name))).size,cardDeckChecks:Object.values(M.DECKS).reduce((n,d)=>n+d.cards.length,0)});
const after=counts(),currentEligible=new Set(Object.entries(M.CARD_CATALOG).filter(([,c])=>c.deckImportEligible).map(([n])=>n));
const wording=[],fields=[];
const normalize=(s,n)=>String(s||'').replace(/\([^)]*\)/g,'').replaceAll(n,'~').replace(/this (?:creature|artifact|enchantment|permanent|spell|card)/gi,'~').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().toLowerCase();
for(const r of records){
 const d=M.DEFS[M.resolveDeckCardName(r.requestedName)];assert.ok(d&&!d.autoScripted&&!d.simplified,r.requestedName);
 if(normalize(d.oracle,r.requestedName)!==normalize(r.raw.oracle,r.requestedName))wording.push({name:r.requestedName,runtime:d.oracle,source:r.raw.oracle});
 for(const field of ['cost','power','toughness']){const v=r.raw[field];if(v!==undefined&&String(d[field]??'')!==String(v??''))fields.push({name:r.requestedName,field,runtime:d[field],source:v});}
}
const previousImageSource=git('show',base+':src/card-images.js');
const imagePreservation={};
for(const key of ['CARD_IMAGE_PATHS','CARD_ART_PATHS']){
 const prior=JSON.parse(previousImageSource.match(new RegExp('MTG\\.'+key+' = Object\\.freeze\\((\\{[\\s\\S]*?\\})\\);'))[1]);
 for(const [name,url]of Object.entries(prior))assert.equal(M[key][name],url,'Existing image mapping changed: '+name);
 imagePreservation[key]=Object.keys(prior).length;
}
for(const r of records)for(const name of r.faces?.map(f=>f.name)||[r.requestedName.split(' // ')[0]]){const url=M.cardImageURL(name);assert.ok(url!==M.CARD_IMAGE_PLACEHOLDER&&url.startsWith('./assets/cards/')&&fs.existsSync(url),'Missing local face: '+name);}
for(const d of i.decks)assert.ok(fs.existsSync(M.CARD_ART_PATHS[d.commander]),'Missing commander crop: '+d.commander);
const imageReport=JSON.parse(fs.readFileSync(sourceDir+'/images.json'));for(const r of imageReport.added)assert.equal(sha(fs.readFileSync(r.relative)),r.sha256,'Image hash: '+r.name);
for(const d of i.decks){const validation=M.validateImportedDeck(M.parseDeckText(fs.readFileSync(sourceDir+'/'+d.source.export,'utf8')),{name:d.name});assert.equal(validation.ok,true,d.name+': '+JSON.stringify(validation.errors));}
M.initData(previous);const before=counts();before.nativeDefinitions=previousNativeCount;
const newlyEligibleReused=[...currentEligible].filter(n=>M.DEFS[n]&&!M.CARD_CATALOG[n].deckImportEligible).sort();
const report={baseCommit:git('rev-parse',base).trim(),before,after,newCards:42,reusedCards:291,physicalCards:500,uniqueSourceCards:333,newlyEligibleReused,preservation:{existingRawDefinitions:previousNativeCount,existingDeckRecords:previous.decks.length,oldCardsEqual:true,oldDecksEqual:true,oracleBatchFilesUnchanged:true,oldImagesUnchanged:true,commanderVideosUnchanged:true,imageMappings:imagePreservation},oracleWordingDifferences:wording,printedFieldDifferences:fields,sources:i.decks.map(d=>({name:d.name,...d.source})),runtimeSmokeSha256:sha(fs.readFileSync(sourceDir+'/runtime-smoke.json'))};
fs.writeFileSync(sourceDir+'/source-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({before,after,newlyEligibleReused,wording:wording.map(r=>r.name),fields},null,2));
