import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-cmd-sld-2026-09-19');
export const outputDir=path.resolve(sourceDir,'../../../output/precon-cmd-sld-2026-09-19');
export const precons=[
  {name:'Goblin Storm',commander:'Zada, Hedron Grinder',set:'SLD',moxfield:'eYurDI_IWUeqbNV5038DYQ'},
  {name:'Hatsune Miku',commander:"Trostani, Selesnya's Voice",set:'SLD',moxfield:'n3QS3JZ_zkmwLhmLDTc8Sw'},
  {name:'Counterpunch',commander:'Ghave, Guru of Spores',set:'CMD',moxfield:'cQBv30b2bE6sgTM_YaeNQQ'},
  {name:'Mirror Mastery',commander:'Riku of Two Reflections',set:'CMD',moxfield:'70auYSm75E-Iwf4Oc0g7Lg'},
  {name:'Political Puppets',commander:'Zedruu the Greathearted',set:'CMD',moxfield:'Hq90LxdWMUCbrG9fdU3HaQ'},
  {name:'Heavenly Inferno',commander:'Kaalia of the Vast',set:'CMD',moxfield:'RTMMomJxi0iK-r6ZDzBXeQ'},
  {name:'Devour for Power',commander:'The Mimeoplasm',set:'CMD',moxfield:'oOJLhXA4CUGsh8mxlF00IA'}
].map(row=>({...row,slug:row.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}));
const officialUrls=[
  {set:'CMD',file:'commander-2011.html',url:'https://magic.wizards.com/en/news/feature/magic-gathering-commander-decklists-2011-06-14'},
  {set:'SLD',file:'goblin-storm.html',url:'https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-goblin-storm-decklist'},
  {set:'SLD',file:'hatsune-miku.html',url:'https://magic.wizards.com/en/news/announcements/secret-lair-commander-deck-hatsune-miku-decklist'}
];
const sha=t=>crypto.createHash('sha256').update(t).digest('hex');
// Normalize punctuation, combined identities and the official shorthand for Dusk // Dawn.
const canonical=n=>n.replace(/<[^>]*>/g,'').replaceAll('Æ','Ae').replaceAll('æ','ae').replaceAll('’',"'").replace(/\s*\/{2,3}\s*/g,' // ').trim().replace(/^Ransom Note \((?:Surveil|Morph)\)$/,'Ransom Note').replace(/^Fire\/Ice$/,'Fire // Ice').replace(/^Mountain \d Goblin Storm$/,'Mountain').replace(/^Dusk$/,'Dusk // Dawn').replace(/^Birthday Party$/,'Vault 101: Birthday Party').replace(/^House Gambit$/,'Vault 21: House Gambit').replace(/^Armont, the Redeemer$/,'Syr Armont, the Redeemer').replace(/^(.+) \/\/ \1$/,'$1');
const map=cards=>{const counts=new Map();for(const c of cards){const n=canonical(c.name).replace(/^Vault \d+: /,'');counts.set(n,(counts.get(n)||0)+c.n);}return JSON.stringify([...counts].sort(([a],[b])=>a.localeCompare(b)));};
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
    const pattern=/<b>Commander:<\/b><br>(.*?)<img.*?<div class=['"]sorted-by-overview-container sortedContainer['"][^>]*>(.*?)<div class=['"]sorted-by-color-container/gs;
    for(const [,commander,segment]of html.matchAll(pattern)){
      const clean=s=>canonical(decode(s.replace(/<[^>]*>/g,'')));
      const counts=new Map(); for(const m of segment.matchAll(/<span class=['"]card-count['"]>(\d+)<\/span>\s*<span class=['"]card-name['"]>(.*?)<\/span>/gs)){const n=clean(m[2]);counts.set(n,(counts.get(n)||0)+Number(m[1]));}
      if(!counts.has(clean(commander)))counts.set(clean(commander),1);
      const cards=[...counts].map(([name,n])=>({name,n}));if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official total: '+commander);
      official.push({commander:clean(commander),set,cards,source:url,htmlSha256:sha(html)});
    }
    for(const [,segment]of html.matchAll(/<deck-list[^>]*>\s*<legacy>(.*?)<\/legacy>/gs)){
      const counts=new Map();for(const m of segment.matchAll(/^[ \t]*(\d+)\s*(\D.+)$/gm)){const name=canonical(decode(m[2]));counts.set(name,(counts.get(name)||0)+Number(m[1]));}
      const cards=[...counts].map(([name,n])=>({name,n}));
      if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official legacy total: '+set);
      official.push({commander:cards[0].name,set,cards,source:url,htmlSha256:sha(html)});
    }
    for(const [,title,segment] of html.matchAll(/<deck-list[^>]* deck-title="([^"]+)"[^>]*>(?:\s|<br\s*\/?>)*<main-deck>(.*?)<\/main-deck>/gs)){
      const cards=segment.replace(/<br\s*\/?>/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const m=line.match(/^(?:(\d+)\s+)?(.+?)(?: \[[^\]]+\])?$/);return{n:m[1]?Number(m[1]):1,name:canonical(decode(m[2]))};});
      if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official total: '+title);
      official.push({commander:cards[0].name,set,cards,source:url,htmlSha256:sha(html)});
    }
  }
  if(official.length!==7)throw Error('Expected seven source lists, got '+official.length);
  const index=JSON.parse(fs.readFileSync(path.join(outputDir,'DeckList.json'))).data,decks=[];
  for(const row of precons){
    const entry=index.find(d=>d.name===row.name&&d.code===row.set&&d.type==='Commander Deck');
    const independent=official.find(d=>d.set===row.set&&d.cards[0].name===row.commander)||official.find(d=>d.set===row.set&&d.cards.some(c=>c.name===row.commander));
    if(!independent)throw Error('Official list missing '+row.name);
    let cards=independent.cards,text=null,json=null,url=null;
    if(entry){
      const fileName=entry.fileName+'.json',file=path.join(outputDir,fileName);url='https://mtgjson.com/api/v5/decks/'+fileName;
      text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,text);json=JSON.parse(text);
      const counts=new Map();for(const c of [...json.data.commander,...json.data.mainBoard]){const name=canonical(['flip','adventure','transform','modal_dfc','prepare'].includes(c.layout)?c.name.split(' // ')[0]:c.name);counts.set(name,(counts.get(name)||0)+c.count);}
      cards=[...counts].map(([name,n])=>({name,n}));
      if(map(cards)!==map(independent.cards))console.error(JSON.stringify({deck:row.name,onlyJson:cards.filter(c=>!independent.cards.some(d=>d.name===c.name&&d.n===c.n)),onlyOfficial:independent.cards.filter(c=>!cards.some(d=>d.name===c.name&&d.n===c.n))},null,2));
      if(json.data.name!==row.name||json.data.commander.length!==1||json.data.commander[0].name!==row.commander||map(cards)!==map(independent.cards))throw Error('Official / MTGJSON mismatch: '+row.name);
    }else if(row.name!=='Hatsune Miku')throw Error('MTGJSON index missing '+row.name);
    const exportText='Commander\n1 '+row.commander+(row.partner?'\n1 '+row.partner:'')+'\n\nDeck\n'+cards.filter(c=>c.name!==row.commander&&c.name!==row.partner).map(c=>c.n+' '+c.name).join('\n')+'\n';
    fs.writeFileSync(path.join(sourceDir,row.slug+'.txt'),exportText);
    decks.push({...row,cards,source:{provider:entry?'Wizards decklist independently verified against MTGJSON':'Wizards original decklist (not yet present in MTGJSON deck index)',official:independent.source,mtgjson:url,moxfield:'https://moxfield.com/decks/'+row.moxfield,mtgjsonSnapshot:json?.meta.date||null,mtgjsonSha256:text?sha(text):null,officialHtmlSha256:independent.htmlSha256,export:row.slug+'.txt',sha256:sha(exportText)}});
    console.log((entry?'Matched':'Official source')+' 100 cards: '+row.name);
  }
  write(path.join(sourceDir,'decklists.json'),{retrievedOn:'2026-09-19',selection:'After SOC, finish the pinned modern queue with Goblin Storm and Hatsune Miku, then backfill the five original Commander 2011 lists in pinned index order. Preserve original lists and skip duplicate editions.',moxfieldAccess:'The pinned index supplies queue links. Six lists are independently verified Wizards / MTGJSON lists; Hatsune Miku uses the published Wizards list because the MTGJSON deck index does not contain it. These are not direct Moxfield exports.',normalization:"Adventure, prepare and double-faced cards use front names for source comparison; split cards retain their combined names. Quantities and punctuation are normalized for comparison; three Goblin Storm Mountain artwork labels are combined as 22 Mountains. Full Scryfall faces are pinned in oracle.json.",decks});
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
    if(!['normal','case','leveler','flip','saga','mutate','adventure','split','class','transform','modal_dfc','prepare'].includes(c.layout))throw Error('Unsupported layout '+c.layout+': '+name);
    const printed=['flip','adventure','transform','modal_dfc','prepare'].includes(c.layout)?c.card_faces[0]:c;
    const [left='',right='']=printed.type_line.split(' — '),parts=[...new Set(left.split(/\s+|\/\//).filter(Boolean))];
    const raw={name,cost:printed.mana_cost||c.mana_cost||null,super:parts.filter(x=>supers.has(x)),types:parts.filter(x=>!supers.has(x)),subtypes:right.replaceAll('Time Lord','Time_Lord').split(' ').filter(Boolean).map(t=>t.replaceAll('Time_Lord','Time Lord')),oracle:c.oracle_text||(c.card_faces||[]).map(f=>f.name+': '+f.oracle_text).join('\n'),_ci:c.color_identity};
    if(c.type_line.includes('Room')){raw.types=['Enchantment'];raw.subtypes=['Room'];}
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
    const parsed=Array.from(text.matchAll(/^[ \t]*(\d+)\s*(\D.+)$/gm),m=>({n:Number(m[1]),name:canonical(m[2])}));
    if(sha(text)!==row.source.sha256||map(parsed)!==map(row.cards))throw Error('Export changed: '+row.name);
    const colors=[...new Set([...(oracle.get(row.commander)?.colorIdentity||[]),...(row.partner?oracle.get(row.partner)?.colorIdentity||[]:[])])];if(!colors)throw Error('Missing commander '+row.name);
    const cards=row.cards.map(c=>{const record=oracle.get(c.name);if(!record)throw Error('Missing Oracle '+c.name);if(c.n>1&&!record.raw.super.includes('Basic'))throw Error('Unexpected duplicate nonbasic '+c.name);if(!record.colorIdentity.every(c=>colors.includes(c)))throw Error('Illegal color identity '+c.name);
      const sec=(c.name===row.commander||c.name===row.partner)?'Commander':['Creature','Planeswalker','Instant','Sorcery','Artifact','Enchantment','Land'].find(t=>record.raw.types.includes(t));if(!sec)throw Error('Invalid section '+c.name);return{n:c.n,name:aliases.get(c.name)||c.name,sec};});
    if(cards.reduce((n,c)=>n+c.n,0)!==100||cards.filter(c=>c.sec==='Commander').length!==(row.partner?2:1))throw Error('Invalid deck '+row.name);
    return{name:row.name,set:row.set,commander:aliases.get(row.commander)||row.commander,...(row.partner?{partner:row.partner}:{}),cards,source:row.source};
  });
  const names=[...new Set(decks.flatMap(d=>d.cards.map(c=>c.name)))].sort();return{decks,names,oracle,aliases:Object.fromEntries(aliases),newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
}
async function main(){
  if(process.argv.includes('--sources'))await sources();if(process.argv.includes('--oracle'))await oracle();
  const M=loadEngine(),i=buildIntake(M),result={retrievedOn:'2026-09-19',baselineCards:Object.keys(M.DEFS).length,baselineDecks:Object.keys(M.DECKS).length,uniqueCards:i.names.length,reusedCards:i.reusedNames.length,newCards:i.newNames.length,nameAliases:i.aliases,newNames:i.newNames,decks:i.decks.map(d=>({name:d.name,commander:d.commander,total:100,unique:d.cards.length,...d.source}))};
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
