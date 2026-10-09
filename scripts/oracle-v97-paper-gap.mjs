// Closed Oracle sources for the paper-printing gap. Earlier successful
// compilations are frozen by semanticClass before this module is consulted.
import fs from 'node:fs';
import {modifierOperation as alternative} from './oracle-v8-alternative-costs.mjs';
import {baseModifier as core} from './oracle-v8-core.mjs';
const SOURCES=JSON.parse(fs.readFileSync(new URL('./oracle-v97-paper-gap-sources.json',import.meta.url),'utf8'));
const verified=Symbol('v97 exact paper spell source');
export function normalizeCard(card,original){const source=SOURCES[original.name];return {...card,[verified]:source&&Object.entries(source).every(([key,value])=>original[key]===value)?original.name:null};}
export function compileWholeCard(card,h){
 const name=card[verified];if(!name)return null;
 const source=SOURCES[name],implementation=[],contracts=new Set(['generic-trigger-effect','generic-activated-effect','generic-continuous-effect']);
 if(['Bounty of the Hunt','Contagion','Scars of the Veteran'].includes(name)){
  const op=alternative(source,source.oracle_text.split('\n')[0]);if(!op)throw Error('Missing v97 alternative cost: '+name);implementation.push(op);contracts.add(op.contract);
 }
 if(name==='Corpse Dance'){const op=core(source,'Buyback {2}');if(!op)throw Error('Missing Corpse Dance buyback');implementation.push(op);contracts.add(op.contract);}
 if(name==='Necrologia'){const op=core(source,'As an additional cost to cast this spell, pay X life.');if(!op)throw Error('Missing Necrologia life payment');implementation.push(op);contracts.add(op.contract);}
 implementation.push({kind:'paper-spell-v97',name,contract:'generic-trigger-effect'});
 return {semanticClass:'spell-template',implementation,implementedKeywords:[],oracleContracts:[...contracts],rulesCore:h.stripReminderText(source.oracle_text)};
}
