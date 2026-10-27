import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {sourceDir} from './import-odds-and-ends.mjs';
const source=JSON.parse(fs.readFileSync(sourceDir+'/sources.json'));
const oracle=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')).cards;
const names=source.decks.find(d=>d.slug==='odd').cards.map(c=>c.name);
const file=new URL('../src/card-images.js',import.meta.url),root=new URL('../',import.meta.url);
let text=fs.readFileSync(file,'utf8');
const maps=Object.fromEntries(['CARD_IMAGE_PATHS','CARD_ART_PATHS'].map(key=>[key,JSON.parse(text.match(new RegExp('MTG\\.'+key+' = Object\\.freeze\\((\\{[\\s\\S]*?\\})\\);'))[1])]));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const slug=n=>n.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)+'-'+sha(n).slice(0,10)+'.webp';
const jobs=[];
for(const [key,wanted,variant,folder]of [['CARD_IMAGE_PATHS',names,'normal',''],['CARD_ART_PATHS',['Yennett, Cryptic Sovereign'],'art_crop','art/']])for(const name of wanted){
  const record=oracle.find(c=>c.name===name||c.card_faces?.some(f=>f.name===name));
  if(!record)throw Error('Missing pinned image source: '+name);
  const front=record.card_faces?.[0]?.name||name;
  let relative=maps[key][name]||maps[key][front];
  if(!relative){
    const url=record.image_uris?.[variant]||record.card_faces?.[0]?.image_uris?.[variant];
    if(!url)throw Error('Missing pinned image URI: '+name);
    relative='./assets/cards/'+folder+slug(front);
    jobs.push({name:front,variant,relative,url,scryfallId:record.id});
  }
  maps[key][name]=relative;
  if(key==='CARD_IMAGE_PATHS')for(const f of record.card_faces||[])maps[key][f.name]||=relative;
}
for(const job of jobs){
  const dest=new URL(job.relative,root);fs.mkdirSync(new URL('./',dest),{recursive:true});
  if(!fs.existsSync(dest)){
    const r=await fetch(job.url,{headers:{'User-Agent':'MTGCommanderSimulator/0.1 (precon image sync)'}});
    if(!r.ok)throw Error('Image HTTP '+r.status+': '+job.name);
    const bytes=Buffer.from(await r.arrayBuffer());
    await new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-i','pipe:0','-frames:v','1','-c:v','libwebp','-quality','78','-compression_level','6','-preset','picture','-y',dest.pathname]);let error='';child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('close',code=>code?reject(Error(error)):resolve());child.stdin.end(bytes);});
  }
  job.sha256=sha(fs.readFileSync(dest));
}
for(const key of Object.keys(maps))text=text.replace(new RegExp('MTG\\.'+key+' = Object\\.freeze\\(\\{[\\s\\S]*?\\}\\);'),'MTG.'+key+' = Object.freeze('+JSON.stringify(Object.fromEntries(Object.entries(maps[key]).sort(([a],[b])=>a.localeCompare(b))),null,2)+');');
fs.writeFileSync(file,text);
const report=sourceDir+'/images.json',old=fs.existsSync(report)?JSON.parse(fs.readFileSync(report)).added:[];
const added=[...new Map([...old,...jobs].map(j=>[j.relative,j])).values()];
fs.writeFileSync(report,JSON.stringify({source:'Pinned Scryfall printing metadata',added,addedCount:added.length},null,2)+'\n');
console.log(JSON.stringify({addedThisRun:jobs.length,addedTotal:added.length}));
