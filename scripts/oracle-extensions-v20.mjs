// Additive, closed Oracle grammar. Earlier complete descriptors stay frozen.
import * as v19 from './oracle-extensions-v19.mjs';
import * as costs from './oracle-v20-costs.mjs';
import * as spells from './oracle-v20-spells.mjs';
import * as permanents from './oracle-v20-permanents.mjs';
import * as layouts from './oracle-v20-layouts.mjs';
import * as damage from './oracle-v20-damage.mjs';
import * as rules from './oracle-v20-rules.mjs';
export * from './oracle-extensions-v19.mjs';
const extensions=[costs,spells,permanents,layouts,damage,rules];
export const broaderModalHeadersV20=true;
export function compileWholeCard(card,helpers){
 const layout=layouts.compileWholeCard(card,helpers);if(layout)return layout;
 if(card.layout!=='normal'||card.oracleSeparatedZoneV20||!/^(?:Instant|Sorcery)(?: — .+)?$/.test(card.type_line||''))return null;
 const paragraphs=helpers.stripReminderText(card.oracle_text||'').split('\n').map(line=>line.trim()).filter(Boolean),triggers=[],remaining=[];
 for(const paragraph of paragraphs){
  if(/^(?:When |Whenever |At )/.test(paragraph)){
   const parsed=helpers.compileCurrent({...card,type_line:'Enchantment',oracle_text:paragraph});
   if(parsed.semanticClass&&parsed.implementation?.length&&parsed.implementation.every(op=>op.kind==='generic-trigger'&&(['graveyard','hand','library'].includes(op.zone)||op.zone==='event-source-v20'&&op.event==='discarded'&&op.eventFilter==='self'))){triggers.push(...parsed.implementation);continue;}
  }
  remaining.push(paragraph);
 }
 if(!triggers.length)return null;
 if(!remaining.length)return {reason:'spell-zone-trigger-needs-complete-spell-body-v20'};
 const spell=helpers.compile({...card,oracle_text:remaining.join('\n'),oracleSeparatedZoneV20:true});
 if(!spell.semanticClass)return {reason:'spell-zone-trigger-needs-complete-spell-body-v20'};
 return {...spell,implementation:[...spell.implementation,...triggers],oracleContracts:[...new Set([...spell.oracleContracts,...triggers.map(op=>op.contract)])],rulesCore:helpers.stripReminderText(card.oracle_text||'')};
}
function read(method,args) {
  for(const grammar of extensions){const result=grammar[method]?.(...args);if(result!==null&&result!==undefined)return result;}
  return v19[method]?.(...args)??null;
}
export const extensionEffect=(...args)=>read('extensionEffect',args);
export const extensionLine=(...args)=>read('extensionLine',args);
export const extensionCost=(...args)=>read('extensionCost',args);
export const extensionCondition=(...args)=>read('extensionCondition',args);
export const extensionCount=(...args)=>read('extensionCount',args);
export const extensionValue=(...args)=>read('extensionValue',args);
export const extensionTarget=(...args)=>read('extensionTarget',args);
export const modifierOperation=(...args)=>read('modifierOperation',args);
export const characteristicOperation=(...args)=>read('characteristicOperation',args);
export const modalOperation=(...args)=>read('modalOperation',args);
export const normalizeManaOperation=(...args)=>read('normalizeManaOperation',args);

export function normalizeCard(card) {
  const normalizeSourceNouns=text=>String(text||'')
    .replace(/\b(This|this) Aura\b/g,'$1 enchantment')
    .replace(/\b(This|this) Equipment\b/g,'$1 artifact');
  const normalized=v19.normalizeCard({...card,oracle_text:normalizeSourceNouns(card.oracle_text),
    ...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalizeSourceNouns(face.oracle_text)}))}:{})});
  return extensions.reduce((current,grammar)=>grammar.normalizeCard?.(current,card)??current,normalized);
}
