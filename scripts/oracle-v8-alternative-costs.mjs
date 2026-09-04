// Alternative casting costs use the same transactional, exact-payment AST as
// mandatory costs. The printed mana cost remains the normal casting option.
import {modifierOperation as additionalCost} from './oracle-v8-additional-costs.mjs';

const MANA='(?:\\{(?:0|[1-9][0-9]*|[WUBRGC])\\})+';

export function modifierOperation(card,line,h={}) {
  if(card?.layout && card.layout!=='normal')return null;
  const match=/^(?:If (.+), you|You) may (.+) rather than pay this spell's mana cost\.$/.exec(line);
  if(!match)return null;
  const condition=match[1] ? h.condition?.(match[1]) : null;
  if(match[1]&&!condition)return null;
  let text=match[2],mana='{0}',costs=[];
  const manaCost=new RegExp('^pay ('+MANA+')(?: and (.+))?$').exec(text);
  if(manaCost) {mana=manaCost[1];text=manaCost[2]||'';}
  if(text) {
    const additional=additionalCost(card,'As an additional cost to cast this spell, '+text+'.');
    if(!additional)return null;
    costs=additional.costs;
  }
  if(!manaCost&&!costs.length)return null;
  return {kind:'mechanic-alternative-costs-v8',mana,costs,
    ...(condition?{condition}:{}),label:'Alternative cost: '+match[2],contract:'mechanic-alternative-costs-v8'};
}
