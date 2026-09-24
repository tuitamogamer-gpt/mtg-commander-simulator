import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-frc-2026-09-24');
export const outputDir=path.resolve(sourceDir,'../../../output/precon-frc-2026-09-24');
export const precons=[{name:'Multiverse Reforged',commander:'Jace, Multiverse Architect',set:'FRC',slug:'multiverse-reforged'}];
const official='https://magic.wizards.com/en/news/announcements/reality-fracture-multiverse-reforged-commander-decklist';
const mtgjson='https://mtgjson.com/api/v5/decks/MultiverseReforged_FRC.json';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const write=(file,x)=>fs.writeFileSync(file,JSON.stringify(x,null,2)+'\n');
const map=cards=>{const counts=new Map();for(const c of cards)counts.set(c.name,(counts.get(c.name)||0)+c.n);return JSON.stringify([...counts].sort(([a],[b])=>a.localeCompare(b)));};
async function get(url){const r=await fetch(url,{headers:{Accept:'application/json,text/html','User-Agent':'MTGCommanderSimulator/0.1 (precon import)'}});if(!r.ok)throw Error(url+' HTTP '+r.status);return r.text();}
async function sources(){
  fs.mkdirSync(sourceDir,{recursive:true});fs.mkdirSync(outputDir,{recursive:true});
  const html=await get(official),jsonText=await get(mtgjson),json=JSON.parse(jsonText);
  fs.writeFileSync(outputDir+'/official.html',html);fs.writeFileSync(outputDir+'/MultiverseReforged_FRC.json',jsonText);
  const segment=html.match(/<deck-list[^>]*deck-title="Multiverse Reforged"[^>]*>\s*<main-deck>(.*?)<\/main-deck>/s)?.[1];
  if(!segment)throw Error('Official decklist missing');
  const cards=segment.trim().split(/\r?\n/).map(line=>{const m=line.trim().match(/^(?:(\d+)\s+)?(.+)$/);return{n:Number(m[1]||1),name:m[2]};});
  const expected=[...json.data.commander,...json.data.mainBoard].map(c=>({n:c.count,name:c.name}));
  if(cards.reduce((n,c)=>n+c.n,0)!==100||map(cards)!==map(expected))throw Error('Wizards / MTGJSON decklist mismatch');
  const row=precons[0],exportText='Commander\n1 '+row.commander+'\n\nDeck\n'+cards.filter(c=>c.name!==row.commander).map(c=>c.n+' '+c.name).join('\n')+'\n';
  fs.writeFileSync(sourceDir+'/'+row.slug+'.txt',exportText);
  write(sourceDir+'/decklists.json',{retrievedOn:'2026-09-24',decks:[{...row,cards,source:{provider:'Wizards, independently compared with MTGJSON',official,mtgjson,releaseDate:'2026-10-02',mtgjsonSnapshot:json.meta.date,officialHtmlSha256:sha(html),mtgjsonSha256:sha(jsonText),export:row.slug+'.txt',sha256:sha(exportText)}}]});
}
async function oracle(){
  const names=JSON.parse(fs.readFileSync(sourceDir+'/decklists.json')).decks.flatMap(d=>d.cards.map(c=>c.name)),all=[];
  for(let i=0;i<names.length;i+=75){
    const r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','User-Agent':'MTGCommanderSimulator/0.1 (precon import)'},body:JSON.stringify({identifiers:names.slice(i,i+75).map(name=>({name}))})});
    if(!r.ok)throw Error('Scryfall HTTP '+r.status);const j=await r.json();if(j.not_found?.length)throw Error(JSON.stringify(j.not_found));all.push(...j.data);await new Promise(resolve=>setTimeout(resolve,120));
  }
  write(outputDir+'/scryfall-full.json',all);
  const supers=new Set(['Legendary','Basic','Snow','World','Ongoing']);
  const cards=all.map(c=>{
    if(c.layout!=='normal')throw Error('Review layout '+c.layout+': '+c.name);
    const [left,right='']=c.type_line.split(' — '),parts=left.split(' ');
    const raw={name:c.name,cost:c.mana_cost||null,super:parts.filter(x=>supers.has(x)),types:parts.filter(x=>!supers.has(x)),subtypes:right.split(' ').filter(Boolean),oracle:c.oracle_text,_ci:c.color_identity};
    for(const stat of ['power','toughness','loyalty'])if(c[stat]!==undefined)raw[stat]=String(c[stat]);if(c.produced_mana)raw._produced=c.produced_mana;
    return{requestedName:c.name,oracleId:c.oracle_id,scryfallId:c.id,canonicalName:c.name,layout:c.layout,keywords:c.keywords,colorIdentity:c.color_identity,commanderLegality:c.legalities.commander,raw};
  });
  write(sourceDir+'/oracle.json',{generatedAt:new Date().toISOString(),source:'https://api.scryfall.com/cards/collection',requested:names.length,found:cards.length,notFound:[],cards});
}
export function buildIntake(M=loadEngine()){
  const source=JSON.parse(fs.readFileSync(sourceDir+'/decklists.json')),records=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')),oracle=new Map(records.cards.map(c=>[c.requestedName,c]));
  const decks=source.decks.map(row=>{
    const text=fs.readFileSync(sourceDir+'/'+row.source.export,'utf8');if(sha(text)!==row.source.sha256)throw Error('Export changed');
    const exported=text.split(/\r?\n/).map(line=>line.match(/^(\d+) (.+)$/)).filter(Boolean).map(m=>({n:Number(m[1]),name:m[2]}));
    if(map(exported)!==map(row.cards))throw Error('Export and pinned deck disagree');
    const colors=oracle.get(row.commander).colorIdentity;
    const cards=row.cards.map(c=>{const record=oracle.get(c.name);if(!record)throw Error('Missing Oracle '+c.name);if(c.n>1&&!record.raw.super.includes('Basic'))throw Error('Duplicate nonbasic '+c.name);if(!record.colorIdentity.every(k=>colors.includes(k)))throw Error('Color identity '+c.name);return{...c,sec:c.name===row.commander?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t))};});
    if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Deck count');
    return{name:row.name,set:row.set,commander:row.commander,cards,source:row.source};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();return{decks,names,oracle,newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
async function main(){
  fs.mkdirSync(outputDir,{recursive:true});
  if(process.argv.includes('--sources'))await sources();if(process.argv.includes('--oracle'))await oracle();
  const M=loadEngine(),i=buildIntake(M),result={retrievedOn:'2026-09-24',baselineCards:Object.keys(M.DEFS).length,baselineDecks:Object.keys(M.DECKS).length,uniqueCards:i.names.length,reusedCards:i.reusedNames.length,newCards:i.newNames.length,newNames:i.newNames};
  if(process.argv.includes('--write')){
    for(const n of i.newNames)if(!M.SCRIPTS[n]||M.SCRIPTS[n].autoScripted||M.SCRIPTS[n].simplified)throw Error('Native implementation missing: '+n);
    const raw=extractRawData(readSource());for(const n of i.newNames){const r=i.oracle.get(n);raw.cards[n]={...r.raw,_oracleId:r.oracleId,_scryfallId:r.scryfallId,_layout:r.layout,_commanderLegality:r.commanderLegality};}
    for(const{source,...deck}of i.decks){const old=raw.decks.find(d=>d.name===deck.name);if(old&&JSON.stringify(old)!==JSON.stringify(deck))throw Error('Existing deck differs');if(!old)raw.decks.push(deck);}
    fs.writeFileSync(path.resolve(sourceDir,'../../../src/data.js'),"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
    if(!fs.existsSync(sourceDir+'/intake.json'))write(sourceDir+'/intake.json',result);
  }
  write(outputDir+'/preflight.json',result);console.log(JSON.stringify(result,null,2));
  if(process.argv.includes('--show-new'))for(const name of i.newNames)console.log(JSON.stringify(i.oracle.get(name).raw));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
