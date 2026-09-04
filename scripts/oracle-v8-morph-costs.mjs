import {modifierOperation as additional} from './oracle-v8-additional-costs.mjs';
const COLORS={white:'W',blue:'U',black:'B',red:'R',green:'G'};
export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal'||/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 // The old creature route already handles these, while noncreature routes
 // need the same intrinsic special action rather than a creature-only gate.
 const mana=/^(Morph|Disguise) ((?:\{(?:\d+|[WUBRGC])\})+)$/.exec(line);
 if(mana)return{kind:'mechanic-'+mana[1].toLowerCase(),cost:mana[2],contract:'mechanic-'+mana[1].toLowerCase()};
 const match=/^Morph—(.+)\.$/.exec(line);if(!match)return null;
 const reveal=/^Reveal a (white|blue|black|red|green) card in your hand$/.exec(match[1]);
 let costs;
 if(!reveal){
  costs=additional(card,'As an additional cost to cast this spell, '+match[1][0].toLowerCase()+match[1].slice(1)+'.')?.costs;
  if(costs?.length!==1||!['discard','payLife','returnPermanent'].includes(costs[0].kind))return null;
  if(costs[0].quantity&&(costs[0].quantity.min!==costs[0].quantity.max||costs[0].quantity.min>3))return null;
 }
 return{kind:'mechanic-morph-cost-v8',label:match[1],...(reveal?{revealColor:COLORS[reveal[1]]}:{costs}),contract:'mechanic-morph-cost-v8'};
}
