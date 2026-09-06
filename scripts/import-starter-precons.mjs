import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const starterPrecons=[
  {name:'First Flight',slug:'first-flight',commander:'Isperia, Supreme Judge',moxfield:'4aWzNrYbU0utRRc4VP2y_g'},
  {name:'Grave Danger',slug:'grave-danger',commander:'Gisa and Geralf',moxfield:'C69lZxaCm0mccIVMd6ZAMg'},
  {name:'Chaos Incarnate',slug:'chaos-incarnate',commander:'Kardur, Doomscourge',moxfield:'y48MuxOOF0-B5kxdP7zNsw'},
  {name:'Draconic Destruction',slug:'draconic-destruction',commander:'Atarka, World Render',moxfield:'vKenUyAq5Eaneqf1Dazp1w'},
  {name:'Token Triumph',slug:'token-triumph',commander:'Emmara, Soul of the Accord',moxfield:'s-gC4gfPC0eVReuXm2Eo7w'},
];
export const starterSourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-starter-2026-09-06');
export function parseMoxfieldExport(text){
  const cards=[];
  for(const line of text.trim().split(/\r?\n/)){
    const match=/^(\d+) (.+) \(([A-Z0-9]+)\) (\S+)(?: \*E\*)?$/.exec(line);
    if(!match)throw Error('Invalid Moxfield export line: '+line);
    const n=Number(match[1]),name=match[2],existing=cards.find(c=>c.name===name);
    if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid card quantity');
    if(existing)existing.n+=n;else cards.push({n,name});
  }
  if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Precon must contain exactly 100 cards');
  return cards;
}
export function buildStarterIntake(M=loadEngine()){
  const oracle=JSON.parse(fs.readFileSync(path.join(starterSourceDir,'oracle.json')));
  const byName=new Map(oracle.cards.map(c=>[c.requestedName,c]));
  const decks=starterPrecons.map(row=>{
    const text=fs.readFileSync(path.join(starterSourceDir,row.slug+'.txt'),'utf8'),cards=parseMoxfieldExport(text);
    if(cards[0].name!==row.commander||cards[0].n!==1)throw Error('Commander mismatch: '+row.name);
    for(const card of cards){
      const record=byName.get(card.name);if(!record)throw Error('Missing Oracle: '+card.name);
      if(card.n>1&&!record.raw.super.includes('Basic'))throw Error('Duplicate nonbasic: '+card.name);
      card.sec=card.name===row.commander?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t));
      if(!card.sec)throw Error('Unsupported deck section: '+card.name);
    }
    return {name:row.name,set:'SCD',commander:row.commander,cards,
      source:{url:'https://moxfield.com/decks/'+row.moxfield,export:row.slug+'.txt',sha256:crypto.createHash('sha256').update(text).digest('hex')}};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();
  return {decks,names,oracle:byName,newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
function main(){
  const M=loadEngine(),intake=buildStarterIntake(M);
  for(const name of intake.newNames)if(!M.SCRIPTS[name]||M.SCRIPTS[name].autoScripted||M.SCRIPTS[name].simplified)throw Error('Native implementation missing: '+name);
  const result={source:'Moxfield official Commander Precons / Starter Commander Decks (2022)',
    officialList:'https://magic.wizards.com/en/news/announcements/starter-commander-decks-decklists-2022-10-20',
    retrievedOn:'2026-09-06',baselineCards:Object.keys(M.DEFS).length,uniqueCards:intake.names.length,
    reusedCards:intake.reusedNames.length,newCards:intake.newNames.length,newNames:intake.newNames,
    decks:intake.decks.map(d=>({name:d.name,commander:d.commander,total:d.cards.reduce((n,c)=>n+c.n,0),unique:d.cards.length,...d.source}))};
  if(process.argv.includes('--write')){
    const raw=extractRawData(readSource());
    for(const name of intake.newNames){const row=intake.oracle.get(name);raw.cards[name]={...row.raw,_oracleId:row.oracleId,_scryfallId:row.scryfallId,_layout:row.layout};}
    for(const {source,...deck}of intake.decks){
      const existing=raw.decks.find(d=>d.name===deck.name);
      if(existing&&JSON.stringify(existing)!==JSON.stringify(deck))throw Error('Existing deck differs: '+deck.name);
      if(!existing)raw.decks.push(deck);
    }
    fs.writeFileSync('src/data.js',"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
    const report=path.join(starterSourceDir,'intake.json');
    if(!fs.existsSync(report))fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n');
  }
  console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
