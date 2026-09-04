import {modifierOperation as additionalCost} from './oracle-v8-additional-costs.mjs';
const MANA='(?:\\{(?:[0-9]+|[WUBRGC]|[WUBRG]/[WUBRG])\\})+';
export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal'||/\bLand\b/.test(card.type_line||''))return null;
 const match=new RegExp('^(Sneak|Web-slinging) ('+MANA+')$').exec(line);
 if(!match)return null;
 const payment=additionalCost(card,"As an additional cost to cast this spell, return a creature you control to its owner's hand.");
 if(!payment||payment.costs.length!==1)return null;
 const sneak=match[1]==='Sneak';
 const costs=payment.costs.map(cost=>({...cost,object:{...cost.object,qualifier:{...(cost.object.qualifier||{}),[sneak?'unblockedAttacker':'tapped']:true}}}));
 return{kind:'mechanic-alternative-costs-v8',mana:match[2],costs,[sneak?'sneak':'webSlinging']:true,
  label:match[1]+' '+match[2],contract:'mechanic-alternative-costs-v8'};
}
export const extensionLine=modifierOperation;
