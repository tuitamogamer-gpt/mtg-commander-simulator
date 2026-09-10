import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {sourceDir,outputDir} from './import-cmm-woc-who-precons.mjs';
const headers={Accept:'application/json;q=0.9,*/*;q=0.8','User-Agent':'MTGCommanderSimulator/0.1 (local card image sync)'};
const M=loadEngine(),sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const full=JSON.parse(fs.readFileSync(outputDir+'/scryfall-full.json'));
const metadata=new Map(full.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,{...c,...f,id:c.id}])]));
const variants=[
 ['Battle at the Helvault','Avacyn','CMM Avacyn'],['Warping Wail','Eldrazi Scion','CMM Eldrazi Scion'],
 ['Myriad Construct','Construct','CMM Construct'],['Alela, Cunning Conqueror','Faerie Rogue','WOC Faerie Rogue'],
 ['Ox Drover','Ox','WOC Ox'],['Nettling Nuisance','Pirate','WOC Pirate'],
 ['Adipose Offspring','Alien','WHO Alien'],['Dinosaurs on a Spaceship','Dinosaur','WHO Dinosaur'],
 ['The Eleventh Hour','Human','WHO Human'],['The Girl in the Fireplace','Human Noble','WHO Human Noble'],
 ['The Girl in the Fireplace','Horse','WHO Horse']
];
const tokenFile=outputDir+'/token-prints.json',tokens=fs.existsSync(tokenFile)?JSON.parse(fs.readFileSync(tokenFile)):{};
for(const[source,name,alias]of variants){
 if(!tokens[alias]){const print=metadata.get(source)?.all_parts?.find(r=>r.component==='token'&&r.name===name);if(!print)throw Error('Missing linked token '+source+' / '+name);const response=await fetch(print.uri,{headers});if(!response.ok)throw Error('Token HTTP '+response.status+' '+alias);tokens[alias]=await response.json();fs.writeFileSync(tokenFile,JSON.stringify(tokens,null,2)+'\n');await new Promise(r=>setTimeout(r,120));}
 metadata.set(alias,tokens[alias]);
}
fs.writeFileSync(tokenFile,JSON.stringify(tokens,null,2)+'\n');
const lists=JSON.parse(fs.readFileSync(sourceDir+'/decklists.json')).decks,records=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')).cards;
const names=new Set([...records.flatMap(r=>[r.requestedName.split(' // ')[0],...(r.faces||[]).map(f=>f.name)]),...variants.map(r=>r[2])]);
const manifest={normal:{...M.CARD_IMAGE_PATHS},art_crop:{...M.CARD_ART_PATHS}},jobs=[];
function slug(name){return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)+'-'+sha(name).slice(0,10)+'.webp';}
for(const[variant,wanted]of [['normal',names],['art_crop',lists.flatMap(d=>[d.commander,...(d.partner?[d.partner]:[])])]])for(const name of wanted){
 const old=manifest[variant][name];if(old&&!old.includes('card-back')&&fs.existsSync(old))continue;
 const print=metadata.get(name),source=print?.image_uris?.[variant]||print?.card_faces?.[0]?.image_uris?.[variant];if(!source)throw Error('Missing image metadata '+name);
 const relative='./assets/cards/'+(variant==='art_crop'?'art/':'')+slug(name);manifest[variant][name]=relative;jobs.push({name,variant,relative,source,scryfallId:print.id,set:print.set,collectorNumber:print.collector_number});
}
let cursor=0;await Promise.all(Array.from({length:4},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];if(!fs.existsSync(job.relative)){const response=await fetch(job.source,{headers});if(!response.ok)throw Error('Image HTTP '+response.status+' '+job.name);const bytes=Buffer.from(await response.arrayBuffer()),temp=job.relative+'.tmp.webp';await new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1','-c:v','libwebp','-quality','78','-compression_level','6','-preset','picture','-y',temp]);let err='';child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(err)):resolve());child.stdin.end(bytes);});fs.renameSync(temp,job.relative);}job.sha256=sha(fs.readFileSync(job.relative));console.log(job.name+' '+job.variant);}}));
const previousAliases=JSON.parse(fs.readFileSync(sourceDir+'/images.json')).canonicalAliases||{};
const canonicalAliases = {...previousAliases,...Object.fromEntries(variants.filter(([,name])=>!manifest.normal[name]).map(([,name,alias])=>[name,alias]))};
for (const [name, alias] of Object.entries(canonicalAliases)) manifest.normal[name] = manifest.normal[alias];
const file='src/card-images.js';let text=fs.readFileSync(file,'utf8');for(const[key,kind]of [['CARD_IMAGE_PATHS','normal'],['CARD_ART_PATHS','art_crop']])text=text.replace(new RegExp('MTG\\.'+key+' = Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);'), 'MTG.'+key+' = Object.freeze('+JSON.stringify(Object.fromEntries(Object.entries(manifest[kind]).sort(([a],[b])=>a.localeCompare(b))),null,2)+');');
fs.writeFileSync(file,text);
const reportFile=sourceDir+'/images.json',old=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile)).added:[];
const added=[...new Map([...old,...jobs].map(r=>[r.relative,r])).values()];
fs.writeFileSync(reportFile,JSON.stringify({date:'2026-09-10',source:'Pinned Scryfall card and linked token metadata',added,addedCount:added.length,canonicalAliases,sourceCardsWithLocalImages:records.length,tokenVariants:variants.map(([source,name,alias])=>({source,name,alias,scryfallId:tokens[alias].id})),existingImagesUnchanged:true},null,2)+'\n');
console.log(JSON.stringify({addedThisRun:jobs.length,addedTotal:added.length,tokens:Object.fromEntries(variants.map(r=>[r[2],tokens[r[2]].id]))}));
