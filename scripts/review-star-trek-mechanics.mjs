import fs from 'node:fs';
import {semanticClass} from './import-oracle-batch.mjs';
import {sourceDir} from './import-odds-and-ends.mjs';
const audit=JSON.parse(fs.readFileSync(sourceDir+'/intake.json'));
const oracle=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json'));
const names=[...new Set(audit.decks.filter(d=>['borg','federation'].includes(d.slug)).flatMap(d=>d.official.unknownInEngine))];
const cards=names.map(name=>{
  const c=oracle.cards.find(c=>c.name===name);
  if(!c)return {name,oracleAvailable:false,runtimeSupported:false,status:'Await verified card text'};
  const result=semanticClass(c);
  return {name,oracleAvailable:true,runtimeSupported:false,parserEligible:!!result.semanticClass,semanticClass:result.semanticClass,reason:result.reason,implementation:result.implementation,oracleContracts:result.oracleContracts};
});
const report={note:'Parser eligibility alone does not register or certify a card. None of these missing cards was imported.',uniqueMissingCards:cards.length,oracleUnavailable:cards.filter(c=>!c.oracleAvailable).length,parserEligible:cards.filter(c=>c.parserEligible).length,parserDeferred:cards.filter(c=>c.oracleAvailable&&!c.parserEligible).length,cards};
fs.writeFileSync(sourceDir+'/star-trek-mechanics.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,cards:cards.filter(c=>c.oracleAvailable&&!c.parserEligible).map(({name,reason})=>({name,reason}))},null,2));
