import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-c15-c16-2026-09-08');
const outputDir=path.resolve(sourceDir,'../../../output/precon-c15-c16-2026-09-08');
export const precons=[
  ['Call the Spirits','Daxos the Returned','C15','qmDIgeU_VUijh2qAsWEe1g'],
  ['Seize Control','Mizzix of the Izmagnus','C15','qfOr1nvopUeSE7VOvrWx-A'],
  ['Plunder the Graves','Meren of Clan Nel Toth','C15','EK6p0em0TEiKr4lVHSgWnA'],
  ['Wade into Battle','Kalemne, Disciple of Iroas','C15','mxn1Iad46kSGT5NR6N_3_g'],
  ['Swell the Host','Ezuri, Claw of Progress','C15','m0KtPnA--U2IjyoF_oPP8Q'],
  ['Entropic Uprising','Yidris, Maelstrom Wielder','C16','LZNyKWehuEqouICSnbziFA'],
  ['Open Hostility','Saskia the Unyielding','C16','eX6IyOAU70CFfkW0G6TYyw'],
  ['Stalwart Unity','Kynaios and Tiro of Meletis','C16','F1sBofALcku8lucubWf4oQ'],
  ['Breed Lethality',"Atraxa, Praetors' Voice",'C16','ycs0QP5BTkWbs7hXNcTUdw'],
  ['Invent Superiority','Breya, Etherium Shaper','C16','jU5ihzvK8ES7TOlRlw87og'],
].map(([name,commander,set,moxfield])=>({name,commander,set,moxfield,slug:name.toLowerCase().replaceAll(' ','-')}));
const officialUrls={C15:'https://magic.wizards.com/en/news/feature/commander-2015-edition-decklists-2015-11-06',C16:'https://magic.wizards.com/en/news/announcements/commander-2016-edition-decklists-2016-10-28'};
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const canonical=n=>n.replaceAll('Æ','Ae').replaceAll('æ','ae').replaceAll('’',"'").replace(/\s*\/\/\s*/g,' // ').trim();
const map=cards=>JSON.stringify(cards.map(c=>[canonical(c.name),c.n]).sort(([a],[b])=>a.localeCompare(b)));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'MTGCommanderSimulator/0.1 (local precon source verification)',Accept:'application/json,text/html'}});if(!r.ok)throw Error(url+' HTTP '+r.status);return r.text();}
async function sources(){
  fs.mkdirSync(sourceDir,{recursive:true});fs.mkdirSync(outputDir,{recursive:true});
  const official=[];
  for(const [set,url]of Object.entries(officialUrls)){
    const file=path.join(outputDir,set.toLowerCase()+'.html'),html=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,html);
    for(const [,legacy]of html.matchAll(/<deck-list[^>]*>\s*<legacy>([\s\S]*?)<\/legacy>\s*<\/deck-list>/g)){
      const name=/Title: ([^\r\n]+)/.exec(legacy)?.[1]?.trim(),commander=/Commander: ([^\r\n]+)/.exec(legacy)?.[1]?.trim();
      const cards=[{name:canonical(commander),n:1},...Array.from(legacy.matchAll(/^(\d+) (.+)$/gm),m=>({name:canonical(m[2]),n:Number(m[1])}))];
      official.push({name,commander:canonical(commander),set,cards,source:url,htmlSha256:sha(html)});
    }
  }
  if(official.length!==10)throw Error('Expected ten official lists, found '+official.length);
  const decks=[];
  for(const row of precons){
    const fileName=row.name.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join('')+'_'+row.set+'.json';
    const url='https://mtgjson.com/api/v5/decks/'+fileName,file=path.join(outputDir,fileName);
    const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,text);
    const json=JSON.parse(text),counts=new Map();for(const c of [...json.data.commander,...json.data.mainBoard])counts.set(canonical(c.name),(counts.get(canonical(c.name))||0)+c.count);
    const cards=Array.from(counts,([name,n])=>({name,n})),independent=official.find(d=>d.name.toLowerCase()===row.name.toLowerCase());
    if(!independent||independent.commander!==row.commander||map(cards)!==map(independent.cards))throw Error('Official / MTGJSON mismatch: '+row.name);
    if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Invalid total: '+row.name);
    const exportText='Commander\n1 '+row.commander+'\n\nDeck\n'+cards.filter(c=>c.name!==row.commander).map(c=>c.n+' '+c.name).join('\n')+'\n';
    fs.writeFileSync(path.join(sourceDir,row.slug+'.txt'),exportText);
    decks.push({...row,cards,source:{provider:'Wizards decklist independently verified against MTGJSON',official:independent.source,mtgjson:url,moxfield:'https://moxfield.com/decks/'+row.moxfield,mtgjsonSnapshot:json.meta.date,mtgjsonSha256:sha(text),officialHtmlSha256:independent.htmlSha256,export:row.slug+'.txt',sha256:sha(exportText)}});
    console.log('Matched 100 cards: '+row.name);
  }
  write(path.join(sourceDir,'decklists.json'),{retrievedOn:'2026-09-08',selection:'The next two five-deck annual editions after the completed C14 batch: C15 and C16. Alternate editions are not imported twice.',moxfieldAccess:'Direct API returned HTTP 403. These are verified Wizards / MTGJSON lists, not direct Moxfield exports.',decks});
}
async function oracle(){
  const lists=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),names=[...new Set(lists.decks.flatMap(d=>d.cards.map(c=>c.name)))].sort(),all=[];
  for(let i=0;i<names.length;i+=75){
    const r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'MTGCommanderSimulator/0.1 (local precon validation)'},body:JSON.stringify({identifiers:names.slice(i,i+75).map(name=>({name:name.split(' // ')[0]}))})});
    if(!r.ok)throw Error('Scryfall HTTP '+r.status);const j=await r.json();if(j.not_found?.length)throw Error(JSON.stringify(j.not_found));all.push(...j.data);console.log('Oracle '+all.length+'/'+names.length);await new Promise(r=>setTimeout(r,120));
  }
  write(path.join(outputDir,'scryfall-full.json'),all);
  const byName=new Map(all.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,c])])),supers=new Set(['Legendary','Basic','Snow','World','Ongoing']);
  const cards=names.map(name=>{const c=byName.get(name)||byName.get(name.split(' // ')[0]);if(!c)throw Error('Missing Oracle '+name);
    if(!['normal','split','leveler'].includes(c.layout))throw Error('Unsupported layout '+c.layout+': '+name);
    const [left='',right='']=c.type_line.split(' — '),parts=[...new Set(left.split(/\s+|\/\//).filter(Boolean))];
    const raw={name,cost:c.mana_cost||null,super:parts.filter(x=>supers.has(x)),types:parts.filter(x=>!supers.has(x)),subtypes:right.split(' ').filter(Boolean),oracle:c.oracle_text||(c.card_faces||[]).map(f=>f.name+': '+f.oracle_text).join('\n'),_ci:c.color_identity};
    for(const stat of ['power','toughness','loyalty'])if(c[stat]!==undefined)raw[stat]=String(c[stat]);if(c.produced_mana)raw._produced=c.produced_mana;
    return{requestedName:name,oracleId:c.oracle_id,scryfallId:c.id,canonicalName:c.name,layout:c.layout,keywords:c.keywords,colorIdentity:c.color_identity,commanderLegality:c.legalities.commander,raw};
  });
  write(path.join(sourceDir,'oracle.json'),{generatedAt:new Date().toISOString(),source:'https://api.scryfall.com/cards/collection',requested:names.length,found:cards.length,notFound:[],cards});
}
export function buildIntake(M=loadEngine()){
  const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),records=JSON.parse(fs.readFileSync(path.join(sourceDir,'oracle.json'))),oracle=new Map(records.cards.map(c=>[c.requestedName,c]));
  if(source.decks.length!==precons.length||new Set(source.decks.map(d=>d.name)).size!==precons.length)throw Error('Invalid precon set');
  const decks=source.decks.map(row=>{
    if(!precons.some(d=>d.name===row.name&&d.commander===row.commander&&d.set===row.set))throw Error('Unexpected deck identity');
    const text=fs.readFileSync(path.join(sourceDir,row.source.export),'utf8');
    const parsed=Array.from(text.matchAll(/^(\d+) (.+)$/gm),m=>({n:Number(m[1]),name:canonical(m[2])}));
    if(sha(text)!==row.source.sha256||map(parsed)!==map(row.cards))throw Error('Export changed: '+row.name);
    const colors=oracle.get(row.commander)?.colorIdentity;if(!colors)throw Error('Missing commander '+row.name);
    const cards=row.cards.map(c=>{const record=oracle.get(c.name);if(!record)throw Error('Missing Oracle '+c.name);if(c.n>1&&!record.raw.super.includes('Basic'))throw Error('Duplicate nonbasic '+c.name);if(!record.colorIdentity.every(c=>colors.includes(c)))throw Error('Illegal color identity '+c.name);if(record.commanderLegality!=='legal')throw Error('Not Commander legal '+c.name);
      const sec=c.name===row.commander?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t));if(!sec)throw Error('Invalid section '+c.name);return{n:c.n,name:c.name,sec};});
    if(cards.reduce((n,c)=>n+c.n,0)!==100||cards.filter(c=>c.sec==='Commander').length!==1)throw Error('Invalid deck '+row.name);
    return{name:row.name,set:row.set,commander:row.commander,cards,source:row.source};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();return{decks,names,oracle,newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
async function main(){
  if(process.argv.includes('--sources'))await sources();if(process.argv.includes('--oracle'))await oracle();
  const M=loadEngine(),i=buildIntake(M),result={retrievedOn:'2026-09-08',baselineCards:Object.keys(M.DEFS).length,baselineDecks:Object.keys(M.DECKS).length,uniqueCards:i.names.length,reusedCards:i.reusedNames.length,newCards:i.newNames.length,newNames:i.newNames,decks:i.decks.map(d=>({name:d.name,commander:d.commander,total:100,unique:d.cards.length,...d.source}))};
  if(process.argv.includes('--write')){
    for(const n of i.newNames)if(!M.SCRIPTS[n]||M.SCRIPTS[n].autoScripted||M.SCRIPTS[n].simplified)throw Error('Native implementation missing: '+n);
    const raw=extractRawData(readSource());for(const n of i.newNames){const r=i.oracle.get(n);raw.cards[n]={...r.raw,_oracleId:r.oracleId,_scryfallId:r.scryfallId,_layout:r.layout};}
    for(const{source,...deck}of i.decks){const old=raw.decks.find(d=>d.name===deck.name);if(old&&JSON.stringify(old)!==JSON.stringify(deck))throw Error('Existing deck differs: '+deck.name);if(!old)raw.decks.push(deck);}
    fs.writeFileSync(path.resolve(sourceDir,'../../../src/data.js'),"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
    const file=path.join(sourceDir,'intake.json');if(!fs.existsSync(file))write(file,result);
  }
  write(path.join(outputDir,'preflight.json'),result);console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
