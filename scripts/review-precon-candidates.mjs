import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../reports/decks/precon-candidates-2026-10-27',import.meta.url));
const source=JSON.parse(fs.readFileSync(dir+'/sources.json'));
const M=loadEngine();
const nameCache=new Map();
const normalize=n=>{if(!nameCache.has(n))nameCache.set(n,M.resolveDeckCardName(n)||n.replaceAll('’',"'").normalize('NFC'));return nameCache.get(n);};
const counts=cards=>{const m=new Map();for(const c of cards){const n=normalize(c.name);m.set(n,(m.get(n)||0)+c.n);}return [...m].sort(([a],[b])=>a.localeCompare(b));};
const key=cards=>JSON.stringify(counts(cards));
const raw=M.RAW_DATA;
const results=[];
for(const s of source.decks){
 const commanders=s.cards.filter(c=>c.sec==='Commander').map(c=>c.name);
 const text='Commander\n'+s.cards.filter(c=>c.sec==='Commander').map(c=>c.n+' '+c.name).join('\n')+'\n\nDeck\n'+s.cards.filter(c=>c.sec!=='Commander').map(c=>c.n+' '+c.name).join('\n')+'\n';
 const v=M.validateImportedDeck(M.parseDeckText(text),{name:s.name});
 const sourceKey=key(s.cards),equivalent=raw.decks.filter(d=>key(d.cards)===sourceKey).map(d=>d.name);
 const detail=s.cards.map(c=>{const n=normalize(c.name),cat=M.CARD_CATALOG[n];return{name:c.name,resolved:n,n:c.n,present:!!M.DEFS[n],engineStatus:cat?.engineStatus,eligible:cat?.deckImportEligible,semanticClass:cat?.semanticClass,contracts:cat?.implementationKinds,oracleId:cat?.oracleId};});
 const r={slug:s.slug,name:s.name,moxfield:s.moxfield,commanders,total:s.cards.reduce((n,c)=>n+c.n,0),equivalent,valid:v.ok,summary:v.summary,errors:v.errors,warnings:v.warnings,interactions:v.interactions,cards:detail};
 const official=source.official.find(d=>d.slug===s.slug);
 if(official){
  const a=new Map(counts(official.cards)),b=new Map(counts(s.cards));
  r.official={name:official.name,total:official.cards.reduce((n,c)=>n+c.n,0),matches:key(official.cards)===key(s.cards),differences:[...new Set([...a.keys(),...b.keys()])].filter(n=>a.get(n)!==b.get(n)).map(n=>({name:n,official:a.get(n)||0,moxfield:b.get(n)||0})),unknownInEngine:official.cards.filter(c=>!M.DEFS[normalize(c.name)]).map(c=>c.name)};
 }
 const missing=detail.filter(c=>!c.present).map(c=>c.name);
 console.log(JSON.stringify({slug:r.slug,total:r.total,equivalent,valid:r.valid,errors:r.errors.map(e=>({code:e.code,card:e.card})),missing,official:r.official}));
 results.push(r);
}
const editions=[['borg','borg-collector'],['federation','federation-collector']].map(([a,b])=>({standard:a,collector:b,sameCardNamesAndQuantities:key(source.decks.find(d=>d.slug===a).cards)===key(source.decks.find(d=>d.slug===b).cards)}));
const report={generatedAt:new Date().toISOString(),baselineDecks:raw.decks.length,runtimeCards:Object.keys(M.DEFS).length,editions,decks:results};
fs.writeFileSync(dir+'/verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({baselineDecks:report.baselineDecks,runtimeCards:report.runtimeCards,editions}));
