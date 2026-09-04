import {modifierOperation as additional} from './oracle-v8-additional-costs.mjs';
const mana=/^(?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/;
const parsed=text=>additional({layout:'normal'},`As an additional cost to cast this spell, ${text}.`)?.costs;
const object=(text,battlefield)=>parsed(`${battlefield?'sacrifice':'discard'} a ${text}${battlefield?'':' card'}`)?.[0]?.object;
export function modifierOperation(card,line){
 if(card?.layout&&card.layout!=='normal')return null;
 if(/\{X\}/.test(card.mana_cost||card.cost||''))return null;
 const match=/^As an additional cost to cast this spell, (.+) or pay (\{.+\})\.$/.exec(line);
 if(!match||!mana.test(match[2]))return null;
 // This adapter covers one complete mandatory choice. Other cost systems
 // must first expose a joint announcement planner before being composed.
 const text=card.oracle_text||card.oracle||'';
 if((text.match(/As an additional cost to cast/g)||[]).length>1||/\b(?:Emerge|Delve|Convoke|Improvise|Kicker|Multikicker|Buyback|Replicate|Strive|Entwine|Offspring|Squad|Splice)\b/.test(text))return null;
 const left=match[1],options=[];let m;
 if((m=/^reveal an? (.+) card from your hand$/.exec(left))){
  const filter=object(m[1],false);if(!filter)return null;options.push({kind:'revealHand',object:filter});
 }else if((m=/^behold an? (.+)$/.exec(left))){
  const hand=object(m[1],false),permanent=object(m[1],true);if(!hand||!permanent)return null;
  options.push({kind:'beholdPermanent',object:permanent},{kind:'revealHand',object:hand});
 }else if((m=/^tap an untapped (.+) you control$/.exec(left))){
  const filter=object(m[1],true);if(!filter)return null;options.push({kind:'tapPermanent',object:filter});
 }else if((m=/^blight ([1-9][0-9]*)$/.exec(left))){
  const n=Number(m[1]);if(!Number.isSafeInteger(n))return null;options.push({kind:'blight',n});
 }else if(left==='forage'){
  options.push(...['exile three cards from your graveyard','sacrifice a Food'].map(cost=>({kind:'cost',costs:parsed(cost)})));
 }else{
  const costs=parsed(left);
  if(!costs||costs.length!==1||!['sacrifice','discard','exileGraveyard'].includes(costs[0].kind))return null;
  options.push({kind:'cost',costs});
 }
 options.push({kind:'mana',cost:match[2]});
 return{kind:'mechanic-casting-choice-v8',options,contract:'mechanic-casting-choice-v8'};
}
