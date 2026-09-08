// Add only missing art for this source-verified batch; retain every existing asset.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {precons,sourceDir} from './import-c15-c16-precons.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'output/precon-c15-c16-2026-09-08');
const M=loadEngine(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const headers={Accept:'application/json,image/*','User-Agent':'MTGCommanderSimulator/0.1 (local precon image sync)'};
const full=JSON.parse(fs.readFileSync(path.join(out,'scryfall-full.json'))),byName=new Map(full.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,c])])),face=n=>n.split(' // ')[0];
const lists=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),names=new Set(lists.decks.flatMap(d=>d.cards.map(c=>face(c.name))));
for(const name of ['Bear','Elemental Shaman','Daxos Spirit']){const c=JSON.parse(fs.readFileSync(path.join(out,'token-'+name.replaceAll(' ','-')+'.json')));byName.set(name,c);names.add(name);}
const cards={...M.CARD_IMAGE_PATHS},art={...M.CARD_ART_PATHS},jobs=[],manifest=[];
const slug=name=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)+'-'+sha(name).slice(0,10)+'.webp';
for(const [variant,wanted,mapping] of [['normal',names,cards],['art_crop',precons.map(d=>face(d.commander)),art]])for(const name of wanted){
 if(mapping[name]&&mapping[name]!==M.CARD_IMAGE_PLACEHOLDER)continue;
 const c=byName.get(name);if(!c)throw Error('No pinned image metadata for '+name);
 const images=c.image_uris||c.card_faces?.[0]?.image_uris,source=images?.[variant];if(!source)throw Error('No image for '+name);
 const relative='./assets/cards/'+(variant==='art_crop'?'art/':'')+slug(name);mapping[name]=relative;jobs.push({name,variant,source,relative,scryfallId:c.id,set:c.set,collectorNumber:c.collector_number});
}
let cursor=0,completed=0;await Promise.all(Array.from({length:5},async()=>{while(cursor<jobs.length){const job=jobs[cursor++],target=path.join(root,job.relative);fs.mkdirSync(path.dirname(target),{recursive:true});
 if(!fs.existsSync(target)){const response=await fetch(job.source,{headers});if(!response.ok)throw Error(job.name+' HTTP '+response.status);const bytes=Buffer.from(await response.arrayBuffer()),tmp=target+'.tmp.webp';
 await new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-v','error','-i','pipe:0','-frames:v','1','-c:v','libwebp','-quality','78','-compression_level','6','-preset','picture','-y',tmp]);let error='';child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(error)):resolve());child.stdin.end(bytes);});fs.renameSync(tmp,target);}
 manifest.push({...job,sha256:sha(fs.readFileSync(target))});if(++completed%25===0||completed===jobs.length)console.log('Images '+completed+'/'+jobs.length);
}}));
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b))),file=path.join(root,'src/card-images.js');let source=fs.readFileSync(file,'utf8');
for(const[key,value]of [['CARD_IMAGE_PATHS',cards],['CARD_ART_PATHS',art]]){const re=new RegExp('MTG\\.'+key+' = Object\\.freeze\\(\\{[\\s\\S]*?\\n\\}\\);');if(!re.test(source))throw Error('Image manifest shape');source=source.replace(re,'MTG.'+key+' = Object.freeze('+JSON.stringify(sorted(value),null,2)+');');}
fs.writeFileSync(file,source);
const reportFile=path.join(sourceDir,'images.json');const previous=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile)).added:[];fs.writeFileSync(reportFile,JSON.stringify({date:'2026-09-08',source:'Pinned Scryfall card and token metadata',added:[...previous,...manifest.filter(row=>!previous.some(old=>old.relative===row.relative))].sort((a,b)=>a.relative.localeCompare(b.relative)),existingAssets:'Retained byte for byte; no existing file overwritten.',videosAdded:0},null,2)+'\n');
console.log('Added '+jobs.length+' image paths.');
