import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';
import {parseMoxfieldExport} from './import-starter-precons.mjs';

export const c14Precons=[
  {name:'Forged in Stone',slug:'forged-in-stone',commander:'Nahiri, the Lithomancer',moxfield:'VCpZU-l9Ykqx91BzMxKB5A'},
  {name:'Peer Through Time',slug:'peer-through-time',commander:'Teferi, Temporal Archmage',moxfield:'eI5qvS1WQUqLpM4s4OcFXQ'},
  {name:'Sworn to Darkness',slug:'sworn-to-darkness',commander:'Ob Nixilis of the Black Oath',moxfield:'Ta08Su5JcEGKM4IO9xQLXA'},
  {name:'Built from Scratch',slug:'built-from-scratch',commander:'Daretti, Scrap Savant',moxfield:'dDRyzSWi_kegywH3X_WtQA'},
  {name:'Guided by Nature',slug:'guided-by-nature',commander:"Freyalise, Llanowar's Fury",moxfield:'7r4b_MnVLkWFm4VyIWnfTQ'},
];
export const c14SourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-c14-2026-09-06');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const cardMap=cards=>JSON.stringify(cards.map(c=>[c.name,c.n]).sort(([a],[b])=>a.localeCompare(b)));
export function buildC14Intake(M=loadEngine()){
  const independent=JSON.parse(fs.readFileSync(path.join(c14SourceDir,'independent-decklists.json')));
  const oracle=JSON.parse(fs.readFileSync(path.join(c14SourceDir,'oracle.json')));
  const byName=new Map(oracle.cards.map(c=>[c.requestedName,c]));
  const decks=c14Precons.map(row=>{
    const baseline=independent.decks.find(d=>d.name===row.name);
    if(!baseline||baseline.commander!==row.commander)throw Error('Independent source commander mismatch: '+row.name);
    const filename=path.join(c14SourceDir,row.slug+'.txt');
    const text=fs.readFileSync(filename,'utf8');
    const cards=parseMoxfieldExport(text);
    for(const card of cards)if(!byName.has(card.name)&&byName.has(card.name.replace(' / ',' // ')))card.name=card.name.replace(' / ',' // ');
    if(cardMap(cards)!==cardMap(baseline.cards))throw Error('Moxfield / independent deck mismatch: '+row.name);
    if(cards.reduce((n,c)=>n+c.n,0)!==100||cards[0].name!==row.commander||cards[0].n!==1)throw Error('Invalid 100-card deck: '+row.name);
    const colors=byName.get(row.commander).colorIdentity;
    for(const card of cards){
      const record=byName.get(card.name);if(!record)throw Error('Missing Oracle: '+card.name);
      if(card.n>1&&!record.raw.super.includes('Basic'))throw Error('Duplicate nonbasic: '+card.name);
      if(!record.colorIdentity.every(c=>colors.includes(c)))throw Error('Illegal color identity: '+card.name);
      card.sec=card.name===row.commander?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t));
      if(!card.sec)throw Error('Unsupported section: '+card.name);
    }
    return {name:row.name,set:'C14',commander:row.commander,cards,source:{moxfield:'https://moxfield.com/decks/'+row.moxfield,
      independent:baseline.source,provider:'Moxfield export verified against MTGJSON',
      ...(text?{export:row.slug+'.txt',sha256:sha(text)}:{sha256:sha(cardMap(cards))})}};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();
  return {decks,names,oracle:byName,newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
async function refreshOracle(){
  const independent=JSON.parse(fs.readFileSync(path.join(c14SourceDir,'independent-decklists.json')));
  const names=[...new Set(independent.decks.flatMap(d=>d.cards.map(c=>c.name)))].sort(),all=process.argv.includes('--cached-oracle')?JSON.parse(fs.readFileSync('output/precon-c14-2026-09-06/scryfall-full.json')):[];
  for(let offset=all.length?names.length:0;offset<names.length;offset+=75){
    const response=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'MTGCommanderSimulator/0.1 (local precon validation)'},
      body:JSON.stringify({identifiers:names.slice(offset,offset+75).map(name=>({name:name.split(' // ')[0]}))})});
    if(!response.ok)throw Error('Scryfall HTTP '+response.status);
    const json=await response.json();if(json.not_found?.length)throw Error(JSON.stringify(json.not_found));
    all.push(...json.data);console.log('Resolved Oracle '+all.length+'/'+names.length);
    await new Promise(r=>setTimeout(r,120));
  }
  fs.mkdirSync('output/precon-c14-2026-09-06',{recursive:true});
  fs.writeFileSync('output/precon-c14-2026-09-06/scryfall-full.json',JSON.stringify(all,null,2));
  const byName=new Map(all.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(face=>[face.name,c])]));
  const supers=new Set(['Legendary','Basic','Snow','World','Ongoing']);
  const cards=names.map(name=>{
    const c=byName.get(name)||byName.get(name.split(' // ')[0]);if(!c)throw Error('Missing '+name);
    if(!['normal','split','leveler'].includes(c.layout))throw Error('Unsupported layout '+c.layout+': '+name);
    const type=c.type_line,[left='',right='']=type.split(' — '),parts=[...new Set(left.split(/\s+|\/\//).filter(Boolean))];
    const raw={name,cost:c.mana_cost||null,super:parts.filter(x=>supers.has(x)),types:parts.filter(x=>!supers.has(x)),subtypes:right.split(' ').filter(Boolean),
      oracle:c.oracle_text||(c.card_faces||[]).map(face=>face.name+': '+face.oracle_text).join('\n'),_ci:c.color_identity};
    for(const stat of ['power','toughness','loyalty'])if(c[stat]!==undefined)raw[stat]=String(c[stat]);
    if(c.produced_mana)raw._produced=c.produced_mana;
    return{requestedName:name,oracleId:c.oracle_id,scryfallId:c.id,canonicalName:c.name,layout:c.layout,keywords:c.keywords,colorIdentity:c.color_identity,producedMana:c.produced_mana||[],raw};
  });
  fs.writeFileSync(path.join(c14SourceDir,'oracle.json'),JSON.stringify({generatedAt:new Date().toISOString(),source:'https://api.scryfall.com/cards/collection',requested:names.length,found:cards.length,notFound:[],cards},null,2)+'\n');
}
async function main(){
  if(process.argv.includes('--refresh-oracle'))await refreshOracle();
  const M=loadEngine(),intake=buildC14Intake(M);
  const result={source:'Commander (2014 Edition)',retrievedOn:'2026-09-06',baselineCards:Object.keys(M.DEFS).length,
    uniqueCards:intake.names.length,reusedCards:intake.reusedNames.length,newCards:intake.newNames.length,newNames:intake.newNames,
    decks:intake.decks.map(d=>({name:d.name,commander:d.commander,total:d.cards.reduce((n,c)=>n+c.n,0),unique:d.cards.length,...d.source}))};
  if(process.argv.includes('--write')){
    for(const name of intake.newNames)if(!M.SCRIPTS[name]||M.SCRIPTS[name].autoScripted||M.SCRIPTS[name].simplified)throw Error('Native implementation missing: '+name);
    const raw=extractRawData(readSource());
    for(const name of intake.newNames){const row=intake.oracle.get(name);raw.cards[name]={...row.raw,_oracleId:row.oracleId,_scryfallId:row.scryfallId,_layout:row.layout};}
    for(const {source,...deck}of intake.decks){const existing=raw.decks.find(d=>d.name===deck.name);
      if(existing&&JSON.stringify(existing)!==JSON.stringify(deck))throw Error('Existing deck differs: '+deck.name);
      if(!existing)raw.decks.push(deck);
    }
    fs.writeFileSync('src/data.js',"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
    const report=path.join(c14SourceDir,'intake.json');if(!fs.existsSync(report))fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
  }
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
