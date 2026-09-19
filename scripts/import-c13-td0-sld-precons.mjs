import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {extractRawData,readSource} from './source-audit.mjs';

export const sourceDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../reports/decks/precon-c13-td0-sld-2026-09-19');
export const outputDir=path.resolve(sourceDir,'../../../output/precon-c13-td0-sld-2026-09-19');
export const precons=[
  {name:'Evasive Maneuvers',commander:'Derevi, Empyrial Tactician',set:'C13',moxfield:'m49dNeYETUm9-zfp4Q1FTA'},
  {name:'Power Hungry',commander:'Prossh, Skyraider of Kher',set:'C13',moxfield:'O3zgKgwidEaOkEc0KeyRow'},
  {name:'Eternal Bargain',commander:'Oloro, Ageless Ascetic',set:'C13',moxfield:'S2lFhE-IPUe6etycgIBVow'},
  {name:'Mind Seize',commander:"Jeleva, Nephalia's Scourge",set:'C13',moxfield:'caPxDQM6Zk6R7MNuhVVXqA'},
  {name:'Nature of the Beast',commander:'Marath, Will of the Wild',set:'C13',moxfield:'qd28JYqCYUKhJtheTNKx6A'},
  {name:"Angels: They're Just Like Us but Cooler and with Wings",commander:'Gisela, the Broken Blade',set:'SLD',moxfield:'uVAqU3YPRkuuIhT8t3Cm9Q'},
  {name:'Enchantress Rubinia',commander:'Rubinia Soulsinger',set:'TD0',moxfield:'T2NwkZIrXUi9Zi7bcsnD2A'},
  {name:'Deathdancer Xira',commander:'Xira Arien',set:'TD0',moxfield:'OWpCFVoDUk2nEGovF_iA0Q'}
].map(row=>({...row,slug:row.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}));
const officialUrls=[
  {set:'C13',file:'c13.html',url:'https://magic.wizards.com/en/news/making-magic/all-five-commander-decklists-2013-10-18'},
  {set:'SLD',file:'angels.html',url:'https://magic.wizards.com/en/news/announcements/secret-lairs-next-commander-deck-takes-flight'}
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
    const pattern=/<h4>(.*?)<\/h4>.*?<div class=['"]sorted-by-overview-container sortedContainer['"][^>]*>(.*?)<div class=['"]sorted-by-color-container/gs;
    for(const [,title,segment]of html.matchAll(pattern)){
      const row=precons.find(d=>d.name===decode(title));if(!row)throw Error('Unknown official deck '+title);
      const counts=new Map();for(const m of segment.matchAll(/<span class=['"]card-count['"]>(\d+)<\/span>\s*<span class=['"]card-name['"]>(.*?)<\/span>/gs)){let name=canonical(decode(m[2]));if(name==='Commander')name=row.commander;counts.set(name,(counts.get(name)||0)+Number(m[1]));}
      const cards=[...counts].map(([name,n])=>({name,n}));if(cards.reduce((n,c)=>n+c.n,0)!==(title==='Power Hungry'?99:100))throw Error('Official total '+title);
      official.push({name:row.name,cards,source:url,htmlSha256:sha(html)});
    }
    for(const [,title,segment]of html.matchAll(/<deck-list[^]*?deck-title="([^"]+)"[^]*?<main-deck>(.*?)<\/main-deck>/gs)){
      const cards=segment.replace(/<br\s*\/?>/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean).map(line=>{const m=line.match(/^(\d+)\s+(.+)$/);if(!m)throw Error('Bad official line '+line);return{n:Number(m[1]),name:canonical(decode(m[2]))};});
      if(cards.reduce((n,c)=>n+c.n,0)!==100)throw Error('Official total '+title);
      official.push({name:canonical(decode(title)),cards,source:url,htmlSha256:sha(html)});
    }
  }
  if(official.length!==6)throw Error('Expected six live official lists, got '+official.length);
  const index=JSON.parse(fs.readFileSync(indexFile)).data,decks=[];
  for(const row of precons){
    const entry=index.find(d=>d.name===row.name&&d.code===row.set&&['Commander Deck','MTGO Commander Deck'].includes(d.type));if(!entry)throw Error('Index missing '+row.name);
    const file=path.join(outputDir,entry.fileName+'.json'),url='https://mtgjson.com/api/v5/decks/'+entry.fileName+'.json';
    const text=fs.existsSync(file)?fs.readFileSync(file,'utf8'):await get(url);fs.writeFileSync(file,text);const json=JSON.parse(text),counts=new Map();
    for(const c of [...json.data.commander,...json.data.mainBoard]){const name=canonical(['flip','adventure','transform','modal_dfc','prepare','meld'].includes(c.layout)?c.name.split(' // ')[0]:c.name);counts.set(name,(counts.get(name)||0)+c.count);}
    const cards=[...counts].map(([name,n])=>({name,n})),independent=official.find(d=>d.name===row.name);
    if(cards.reduce((n,c)=>n+c.n,0)!==100||json.data.commander.length!==1||json.data.commander[0].name.split(' // ')[0]!==row.commander)throw Error('MTGJSON identity/total '+row.name);
    // The archived 2013 article omits Savage Lands from Power Hungry (99 cards).
    // Preserve MTGJSON's complete product list and record this source discrepancy.
    const officialComparison=independent&&row.name==='Power Hungry'?[...independent.cards,{name:'Savage Lands',n:1}]:independent?.cards;
    if(row.set!=='TD0'&&(!independent||map(cards)!==map(officialComparison)))throw Error('Official / MTGJSON mismatch '+row.name);
    const exportText='Commander\n1 '+row.commander+'\n\nDeck\n'+cards.filter(c=>c.name!==row.commander).map(c=>c.n+' '+c.name).join('\n')+'\n';
    fs.writeFileSync(path.join(sourceDir,row.slug+'.txt'),exportText);
    decks.push({...row,cards,source:{provider:independent?'Wizards decklist compared against MTGJSON':'MTGJSON preserved original MTGO Commander Theme Deck list',official:independent?.source||null,officialOmissions:row.name==='Power Hungry'?[{name:'Savage Lands',n:1,source:'MTGJSON original product list'}]:[],legacyOfficial:row.set==='TD0'?entry.source:null,legacyOfficialStatus:row.set==='TD0'?'HTTP 404 on 2026-09-19; not used as successful verification':null,mtgjson:url,moxfield:'https://moxfield.com/decks/'+row.moxfield,mtgjsonSnapshot:json.meta.date,releaseDate:entry.releaseDate,mtgjsonSha256:sha(text),officialHtmlSha256:independent?.htmlSha256||null,export:row.slug+'.txt',sha256:sha(exportText)}});
    console.log('Verified 100 cards: '+row.name);
  }
  write(path.join(sourceDir,'decklists.json'),{retrievedOn:'2026-09-19',selection:'The eight remaining distinct lists in the pinned precon index: five Commander 2013 decks, Angels and both original MTGO Theme Decks. Existing decks, duplicate Collector/Anthology editions and the existing Blame Game exclusion are preserved.',moxfieldAccess:'The pinned index supplies official-owner queue links, not direct list exports. Five lists match live Wizards and MTGJSON sources exactly. The Power Hungry article has 99 cards and omits Savage Lands, recorded explicitly; the two MTGO lists use MTGJSON because their legacy Wizards page is unavailable.',normalization:'Printed Commander placeholders in the 2013 article resolve to the published MTGJSON commander. Front names identify flip, Adventure, double-faced and meld cards. Full Oracle identities are pinned separately.',decks});
}
async function oracle(){
  const lists=JSON.parse(fs.readFileSync(path.join(sourceDir,'decklists.json'))),names=[...new Set([...lists.decks.flatMap(d=>d.cards.map(c=>c.name)),'Brisela, Voice of Nightmares'])].sort(),all=process.argv.includes('--cached-oracle')?JSON.parse(fs.readFileSync(path.join(outputDir,'scryfall-full.json'))):[];
  if(!all.length)for(let i=0;i<names.length;i+=75){
    const r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','User-Agent':'MTGCommanderSimulator/0.1 (local precon validation)'},body:JSON.stringify({identifiers:names.slice(i,i+75).map(name=>({name:name.split(' // ')[0]}))})});
    if(!r.ok)throw Error('Scryfall HTTP '+r.status);const j=await r.json();if(j.not_found?.length)throw Error(JSON.stringify(j.not_found));all.push(...j.data);console.log('Oracle '+all.length+'/'+names.length);await new Promise(r=>setTimeout(r,120));
  }
  write(path.join(outputDir,'scryfall-full.json'),all);
  const byName=new Map(all.flatMap(c=>[[c.name,c],...(c.card_faces||[]).map(f=>[f.name,c])])),supers=new Set(['Legendary','Basic','Snow','World','Ongoing']);
  const cards=names.map(name=>{const c=byName.get(name)||byName.get(name.split(' // ')[0]);if(!c)throw Error('Missing Oracle '+name);
    if(!['normal','case','leveler','flip','saga','mutate','adventure','split','class','transform','modal_dfc','prepare','meld'].includes(c.layout))throw Error('Unsupported layout '+c.layout+': '+name);
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
  const names=[...new Set([...decks.flatMap(d=>d.cards.map(c=>c.name)),'Brisela, Voice of Nightmares'])].sort();return{decks,names,oracle,aliases:Object.fromEntries(aliases),newNames:names.filter(n=>!M.DEFS[n]),reusedNames:names.filter(n=>M.DEFS[n])};
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
