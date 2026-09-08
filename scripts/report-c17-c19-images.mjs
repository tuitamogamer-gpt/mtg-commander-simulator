import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {sourceDir} from './import-c17-c19-precons.mjs';
const M=loadEngine(),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const previous=new Set(execFileSync('git',['ls-tree','-r','--name-only','1662ff2','assets/cards'],{encoding:'utf8'}).trim().split('\n'));
const source=JSON.parse(fs.readFileSync('output/precon-c17-c19-2026-09-08/scryfall-full.json'));
const tokens=Object.values(JSON.parse(fs.readFileSync('output/precon-c17-c19-2026-09-08/token-prints.json'))).flat();
const byName=new Map(source.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,c])]));
for(const c of JSON.parse(fs.readFileSync('output/precon-c17-c19-2026-09-08/generic-token-prints.json')))byName.set(c.name,c);
for(const [alias,id]of Object.entries(M.TOKEN_IMG)){const token=tokens.find(t=>t.id===id);if(token)byName.set(alias,token);}
const added=[];for(const [variant,paths]of [['normal',M.CARD_IMAGE_PATHS],['art_crop',M.CARD_ART_PATHS]])for(const [name,relative]of Object.entries(paths||{})){
 const file=relative.replace(/^\.\//,'');if(previous.has(file))continue;const card=byName.get(name);assert.ok(card,'Source metadata for '+name);assert.ok(fs.existsSync(file),file);
 const image=card.image_uris||card.card_faces?.[0].image_uris;assert.ok(image?.[variant],name);
 added.push({name,variant,relative,source:image[variant],scryfallId:card.id,set:card.set,collectorNumber:card.collector_number,sha256:sha(fs.readFileSync(file))});
}
const records=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')).cards;
for(const r of records){const file=M.CARD_IMAGE_PATHS[r.requestedName];assert.ok(file&&!file.includes('card-back')&&fs.existsSync(file),r.requestedName);}
for(const name of ['C17 Vampire','C18 Cat Warrior','Mask','Sculpture','Survivor','Dokai, Weaver of Life'])assert.ok(M.CARD_IMAGE_PATHS[name]&&!M.CARD_IMAGE_PATHS[name].includes('card-back'),name);
assert.equal(added.length,386);
const report={date:'2026-09-08',source:'Pinned Scryfall card and token metadata',added,addedCount:added.length,sourceCardsWithLocalImages:records.length,flipBackAlias:'Dokai, Weaver of Life',existingImagesUnchanged:true};
fs.writeFileSync(sourceDir+'/images.json',JSON.stringify(report,null,2)+'\n');console.log({added:added.length,variants:added.reduce((o,r)=>(o[r.variant]=(o[r.variant]||0)+1,o),{}),sourceCards:records.length});
