import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-voc-ncc-2026-09-09');
export const outputDir=path.resolve(sourceDir,'../../../output/precon-voc-ncc-2026-09-09');
export const precons=[
  ['Vampiric Bloodline','Strefan, Maurer Progenitor','VOC','lava2X1Op0aSeUHhPC5cfQ'],
  ['Spirit Squadron','Millicent, Restless Revenant','VOC','zoNqxklcjEyz2NZ9MI6jpA'],
  ['Buckle Up','Kotori, Pilot Prodigy','NEC','QTZDODqtBUOQGIoEbEDbCQ'],
  ['Upgrades Unleashed','Chishiro, the Shattered Blade','NEC','_r0Tk4XqbEOws8IjeFPDlw'],
  ['Heads I Win, Tails You Lose','Zndrsplt, Eye of Wisdom','SLD','UP1ktQ_GyEK2KErkvoUt-g','Okaun, Eye of Chaos'],
  ['Riveteers Rampage','Henzie "Toolbox" Torre','NCC','fTgFMxk5cESAhOVIks00kA'],
  ['Obscura Operation','Kamiz, Obscura Oculus','NCC','flG8SlpN50qt-L-rQ6VftQ'],
  ['Bedecked Brokers','Perrie, the Pulverizer','NCC','LMu_N7hy3UWNP-HBkaw_xQ'],
  ['Maestros Massacre','Anhelo, the Painter','NCC','flLw5YvIOE2tBprZ_GTsmQ'],
  ['Cabaretti Cacophony','Kitt Kanto, Mayhem Diva','NCC','ONFl58ai-U-S3u539zDJQg']
].map(([name,commander,set,moxfield,partner])=>({name,commander,set,moxfield,...(partner?{partner}:{}),slug:name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}));
const officialUrls=[
  {set:'VOC',file:'voc.html',url:'https://magic.wizards.com/en/news/feature/innistrad-crimson-vow-commander-decklists-2021-11-08'},
  {set:'NEC',file:'nec.html',url:'https://magic.wizards.com/en/news/feature/kamigawa-neon-dynasty-commander-decklists-2022-02-07'},
  {set:'SLD',file:'sld.html',url:'https://magic.wizards.com/en/news/announcements/heads-i-win-tails-you-lose-commander-decklist-2021-11-18'},
  {set:'NCC',file:'ncc.html',url:'https://magic.wizards.com/en/news/feature/streets-of-new-capenna-commander-decklists'}
];
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
// Reversible Secret Lair artwork prints the same identity on both faces.
const canonical=n=>n.replace(/<[^>]*>/g,'').replaceAll('Æ','Ae').replaceAll('æ','ae').replaceAll('’',"'").replace(/\s*\/\/\s*/g,' // ').trim().replace(/^(.+) \/\/ \1$/,'$1');
const map=cards=>JSON.stringify(cards.map(c=>[canonical(c.name),c.n]).sort(([a],[b])=>a.localeCompare(b)));
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
async function get(url){const r=await fetch(url,{headers:{'User-Agent':'MTGCommanderSimulator/0.1 (local precon source verification)',Accept:'application/json,text/html'}});if(!r.ok)throw Error(url+' HTTP '+r.status);return r.text();}
const decode=s=>s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&apos;',"'").replaceAll('&nbsp;',' ');
async function sources(){
  fs.mkdirSync(sourceDir,{recursive:true});fs.mkdirSync(outputDir,{recursive:true});
  const indexFile=path.join(outputDir,'DeckList.json');
  if(!fs.existsSync(indexFile))fs.writeFileSync(indexFile,await get('https://mtgjson.com/api/v5/DeckList.json'));
  const official=[];
  for(const {set,url,file:sourceFile}of officialUrls){
    const file=path.join(outputDir,sourceFile),html=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,html);
    const pattern=/<div class=['"]commander-card-header['"]><span>COMMANDER:<\/span> (.*?)<\/div>.*?<div class=['"]sorted-by-overview-container sortedContainer['"][^>]*>(.*?)<div class=['"]sorted-by-color-container/gs;
    for(const [,commander,segment]of html.matchAll(pattern)){
      const clean=s=>canonical(decode(s.replace(/<[^>]*>/g,'')));
      const counts=new Map(); for(const m of segment.matchAll(/<span class=['"]card-count['"]>(\d+)<\/span>\s*<span class=['"]card-name['"]>(.*?)<\/span>/gs)){const n=clean(m[2]);counts.set(n,(counts.get(n)||0)+Number(m[1]));}
      if(!counts.has(clean(commander)))counts.set(clean(commander),1);
      const cards=[...counts].map(([name,n])=>({name,n}));if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official total: '+commander);
      official.push({commander:clean(commander),set,cards,source:url,htmlSha256:sha(html)});
    }
    for(const [,segment]of html.matchAll(/<deck-list[^>]*>\s*<legacy>(.*?)<\/legacy>/gs)){
      const counts=new Map();for(const m of segment.matchAll(/^(\d+) (.+)$/gm)){const name=canonical(decode(m[2]));counts.set(name,(counts.get(name)||0)+Number(m[1]));}
      const cards=[...counts].map(([name,n])=>({name,n}));
      if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official legacy total: '+set);
      official.push({commander:cards[0].name,set,cards,source:url,htmlSha256:sha(html)});
    }
    for(const [,title,segment] of html.matchAll(/<deck-list deck-title="([^"]+)"[^>]*>\s*<main-deck>(.*?)<\/main-deck>/gs)){
      const cards=Array.from(segment.matchAll(/^(\d+) (.+)$/gm),m=>({n:Number(m[1]),name:canonical(decode(m[2]))}));
      if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official total: '+title);
      official.push({commander:cards[0].name,set,cards,source:url,htmlSha256:sha(html)});
    }
  }
  if(official.length!==10)throw Error('Expected ten original lists, got '+official.length);
  const index=JSON.parse(fs.readFileSync(path.join(outputDir,'DeckList.json'))).data,decks=[];
  for(const row of precons){
    const entry=index.find(d=>d.name===row.name&&d.code===row.set);if(!entry)throw Error('MTGJSON index missing '+row.name);
    const fileName=entry.fileName+'.json',url='https://mtgjson.com/api/v5/decks/'+fileName,file=path.join(outputDir,fileName);
    const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,text);
    const json=JSON.parse(text),counts=new Map();for(const c of [...json.data.commander,...json.data.mainBoard]){const name=canonical(['flip','adventure'].includes(c.layout)?c.name.split(' // ')[0]:c.name);counts.set(name,(counts.get(name)||0)+c.count);}
    const cards=[...counts].map(([name,n])=>({name,n})),independent=official.find(d=>d.set===row.set&&map(d.cards)===map(cards));
    if(json.data.name!==row.name||json.data.commander.length!==(row.partner?2:1)||!json.data.commander.some(c=>canonical(c.name)===row.commander)||!independent||map(cards)!==map(independent.cards))throw Error('Official / MTGJSON mismatch: '+row.name);
    const exportText='Commander\n1 '+row.commander+(row.partner?'\n1 '+row.partner:'')+'\n\nDeck\n'+cards.filter(c=>c.name!==row.commander&&c.name!==row.partner).map(c=>c.n+' '+c.name).join('\n')+'\n';
    fs.writeFileSync(path.join(sourceDir,row.slug+'.txt'),exportText);
    decks.push({...row,cards,source:{provider:'Wizards decklist independently verified against MTGJSON',official:independent.source,mtgjson:url,moxfield:'https://moxfield.com/decks/'+row.moxfield,mtgjsonSnapshot:json.meta.date,mtgjsonSha256:sha(text),officialHtmlSha256:independent.htmlSha256,export:row.slug+'.txt',sha256:sha(exportText)}});
    console.log('Matched 100 cards: '+row.name);
  }
  write(path.join(sourceDir,'decklists.json'),{retrievedOn:'2026-09-09',selection:'After Midnight Hunt, by MTGJSON release order and pinned-index order within each edition: VOC, NEC, Heads I Win Tails You Lose, then NCC. Preserve every original card regardless of legality. No substitutions or alternate-edition duplicates.',moxfieldAccess:'The pinned index supplies queue links. These are verified Wizards / MTGJSON lists, not direct Moxfield exports.',normalization:'Flip and Adventure cards retain their front names; split cards retain their combined names. Full Scryfall faces are preserved in oracle.json.',decks});
}
async function oracle(){
  const lists=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),names=[...new Set(lists.decks.flatMap(d=>d.cards.map(c=>c.name)))].sort(),all=process.argv.includes('--cached-oracle')?JSON.parse(fs.readFileSync(path.join(outputDir,'scryfall-full.json'))):[];
  if(!all.length)for(let i=0;i<names.length;i+=75){
    const r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'MTGCommanderSimulator/0.1 (local precon validation)'},body:JSON.stringify({identifiers:names.slice(i,i+75).map(name=>({name:name.split(' // ')[0]}))})});
    if(!r.ok)throw Error('Scryfall HTTP '+r.status);const j=await r.json();if(j.not_found?.length)throw Error(JSON.stringify(j.not_found));all.push(...j.data);console.log('Oracle '+all.length+'/'+names.length);await new Promise(r=>setTimeout(r,120));
  }
  write(path.join(outputDir,'scryfall-full.json'),all);
  const byName=new Map(all.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,c])])),supers=new Set(['Legendary','Basic','Snow','World','Ongoing']);
  const cards=names.map(name=>{const c=byName.get(name)||byName.get(name.split(' // ')[0]);if(!c)throw Error('Missing Oracle '+name);
    if(!['normal','flip','saga','mutate','adventure','split','class','transform','modal_dfc'].includes(c.layout))throw Error('Unsupported layout '+c.layout+': '+name);
    const printed=['flip','adventure','transform','modal_dfc'].includes(c.layout)?c.card_faces[0]:c;
    const [left='',right='']=printed.type_line.split(' — '),parts=[...new Set(left.split(/\s+|\/\//).filter(Boolean))];
    const raw={name,cost:printed.mana_cost||c.mana_cost||null,super:parts.filter(x=>supers.has(x)),types:parts.filter(x=>!supers.has(x)),subtypes:right.split(' ').filter(Boolean),oracle:c.oracle_text||(c.card_faces||[]).map(f=>f.name+': '+f.oracle_text).join('\n'),_ci:c.color_identity};
    for(const stat of ['power','toughness','loyalty'])if(printed[stat]!==undefined)raw[stat]=String(printed[stat]);if(c.produced_mana)raw._produced=c.produced_mana;
    return{requestedName:name,...(c.card_faces?{faces:c.card_faces}:{}),oracleId:c.oracle_id,scryfallId:c.id,canonicalName:c.name,layout:c.layout,keywords:c.keywords,colorIdentity:c.color_identity,commanderLegality:c.legalities.commander,raw};
  });
  write(path.join(sourceDir,'oracle.json'),{generatedAt:new Date().toISOString(),source:'https://api.scryfall.com/cards/collection',requested:names.length,found:cards.length,notFound:[],cards});
}
export function buildIntake(M=loadEngine()){
  const source=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),records=JSON.parse(fs.readFileSync(path.join(sourceDir,'oracle.json'))),oracle=new Map(records.cards.map(c=>[c.requestedName,c]));
  if(source.decks.length!==precons.length||new Set(source.decks.map(d=>d.name)).size!==precons.length)throw Error('Invalid precon set');
  const aliases=new Map();
  for(const record of records.cards){
    const resolved=M.resolveDeckCardName(record.requestedName);
    if(resolved&&resolved!==record.requestedName){
      if(resolved!==record.canonicalName||M.DEFS[resolved]?.oracleId!==record.oracleId)throw Error('Unverified alias: '+record.requestedName);
      aliases.set(record.requestedName,resolved);
      oracle.set(resolved,record);
    }
  }
  const decks=source.decks.map(row=>{
    if(!precons.some(d=>d.name===row.name&&d.commander===row.commander&&d.set===row.set))throw Error('Unexpected deck identity');
    const text=fs.readFileSync(path.join(sourceDir,row.source.export),'utf8');
    const parsed=Array.from(text.matchAll(/^(\d+) (.+)$/gm),m=>({n:Number(m[1]),name:canonical(m[2])}));
    if(sha(text)!==row.source.sha256||map(parsed)!==map(row.cards))throw Error('Export changed: '+row.name);
    const colors=[...new Set([...(oracle.get(row.commander)?.colorIdentity||[]),...(row.partner?oracle.get(row.partner)?.colorIdentity||[]:[])])];if(!colors)throw Error('Missing commander '+row.name);
    const cards=row.cards.map(c=>{const record=oracle.get(c.name);if(!record)throw Error('Missing Oracle '+c.name);if(c.n>1&&!record.raw.super.includes('Basic')&&!(row.name==='Upgrades Unleashed'&&c.name==='Mossfire Valley'&&c.n===2))throw Error('Unexpected duplicate nonbasic '+c.name);if(!record.colorIdentity.every(c=>colors.includes(c)))throw Error('Illegal color identity '+c.name);
      const sec=(c.name===row.commander||c.name===row.partner)?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t));if(!sec)throw Error('Invalid section '+c.name);return{n:c.n,name:aliases.get(c.name)||c.name,sec};});
    if(cards.reduce((n,c)=>n+c.n,0)!==100||cards.filter(c=>c.sec==='Commander').length!==(row.partner?2:1))throw Error('Invalid deck '+row.name);
    return{name:row.name,set:row.set,commander:row.commander,...(row.partner?{partner:row.partner}:{}),cards,source:row.source};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();return{decks,names,oracle,aliases:Object.fromEntries(aliases),newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
async function main(){
  if(process.argv.includes('--sources'))await sources();if(process.argv.includes('--oracle'))await oracle();
  const M=loadEngine(),i=buildIntake(M),result={retrievedOn:'2026-09-09',baselineCards:Object.keys(M.DEFS).length,baselineDecks:Object.keys(M.DECKS).length,uniqueCards:i.names.length,reusedCards:i.reusedNames.length,newCards:i.newNames.length,nameAliases:i.aliases,newNames:i.newNames,decks:i.decks.map(d=>({name:d.name,commander:d.commander,total:100,unique:d.cards.length,...d.source}))};
  if(process.argv.includes('--write')){
    for(const n of i.newNames)if(!M.SCRIPTS[n]||M.SCRIPTS[n].autoScripted||M.SCRIPTS[n].simplified)throw Error('Native implementation missing: '+n);
    const raw=extractRawData(readSource());for(const n of i.newNames){const r=i.oracle.get(n);raw.cards[n]={...r.raw,_oracleId:r.oracleId,_scryfallId:r.scryfallId,_layout:r.layout,_commanderLegality:r.commanderLegality};}
    for(const{source,...deck}of i.decks){const old=raw.decks.find(d=>d.name===deck.name);if(old&&JSON.stringify(old)!==JSON.stringify(deck))throw Error('Existing deck differs: '+deck.name);if(!old)raw.decks.push(deck);}
    fs.writeFileSync(path.resolve(sourceDir,'../../../src/data.js'),"'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nMTG.RAW_DATA = "+JSON.stringify(raw)+';\n');
    const file=path.join(sourceDir,'intake.json');if(!fs.existsSync(file))write(file,result);
  }
  write(path.join(outputDir,'preflight.json'),result);console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
