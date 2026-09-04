import {modifierOperation as additionalCost} from './oracle-v8-additional-costs.mjs';

const SIMPLE_MANA='(?:\\{(?:[0-9]+|X|[WUBRGC])\\})+';
const EVOKE_MANA='(?:\\{(?:[0-9]+|[WUBRGC]|[WUBRG]/[WUBRG])\\})+';

export function modifierOperation(card,line,h){
 return /^Reinforce /.test(line)?extensionLine(card,line,h):null;
}

export function extensionLine(card,line,h){
 const reinforce=new RegExp('^Reinforce ([1-9][0-9]*|X)—('+SIMPLE_MANA+')$').exec(line);
 if(reinforce){
  if(reinforce[1]!=='X'&&!Number.isSafeInteger(Number(reinforce[1]))||reinforce[1]==='X'&&!reinforce[2].includes('{X}'))return null;
  return {kind:'generic-ability',from:'hand',cost:{mana:reinforce[2]},
   targets:[{what:'creature',zone:'battlefield',count:1}],
   effects:[{action:'counter',target:0,counter:'+1/+1',n:reinforce[1]==='X'?'X':Number(reinforce[1])}],
   label:`Reinforce ${reinforce[1]}`,contract:'generic-activated-effect'};
 }
 if(card.layout&&card.layout!=='normal'||!/\b(?:Creature|Artifact|Enchantment)\b/.test(card.type_line||''))return null;
 const emerge=new RegExp('^Emerge ('+EVOKE_MANA+')$').exec(line);
 if(emerge){
  // Optional additional mana announcements need a joint preview with the
  // chosen Emerge creature. Keep those future combinations closed here.
  if(/^(?:Kicker|Multikicker|Buyback|Replicate|Squad|Offspring|Entwine|Strive|Splice)\b/m.test(card.oracle_text||''))return null;
  const payment=additionalCost(card,'As an additional cost to cast this spell, sacrifice a creature.');
  return {kind:'mechanic-alternative-costs-v8',mana:emerge[1],costs:payment.costs,emerge:true,
   label:'Emerge '+emerge[1],contract:'mechanic-alternative-costs-v8'};
 }
 const evoke=new RegExp('^Evoke ('+EVOKE_MANA+')$').exec(line);
 const nonmana=/^Evoke—(.+)\.$/.exec(line);
 if(!evoke&&!nonmana)return null;
 let costs=[];
 if(nonmana){
  const payment=additionalCost(card,'As an additional cost to cast this spell, '+nonmana[1][0].toLowerCase()+nonmana[1].slice(1)+'.');
  if(!payment)return null;costs=payment.costs;
 }
 return {kind:'mechanic-alternative-costs-v8',mana:evoke?evoke[1]:'{0}',costs,evoke:true,
  label:evoke?'Evoke '+evoke[1]:'Evoke — '+nonmana[1],contract:'mechanic-alternative-costs-v8'};
}
