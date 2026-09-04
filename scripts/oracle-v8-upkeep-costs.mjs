import {modifierOperation as additional} from './oracle-v8-additional-costs.mjs';

// Every choice is made for each age counter before any payment is committed.
// Snow mana is deliberately absent until the mana pool tracks its provenance.
export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal'||/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 const match=/^(Cumulative upkeep|Echo)(?:—(.+)\.| (\{[WUBRG]\}) or (\{[WUBRG]\}))$/.exec(line);
 if(!match)return null;
 const echo=match[1]==='Echo';let payment;
 if(match[3]){
  if(echo||match[3]===match[4])return null;
  payment={kind:'mana',mana:'{'+match[3][1]+'/'+match[4][1]+'}'};
 }else{
  const text=match[2];
  const costs=additional(card,'As an additional cost to cast this spell, '+text[0].toLowerCase()+text.slice(1)+'.')?.costs;
  if(costs?.length===1&&['discard','sacrifice','payLife'].includes(costs[0].kind))payment={kind:'additional',cost:costs[0]};
  else if(!echo){
   if(text==='Put a -1/-1 counter on this creature')payment={kind:'self-counter',counter:'-1/-1'};
   if(text==='Put a +1/+1 counter on a creature an opponent controls')payment={kind:'opponent-counter',counter:'+1/+1'};
   if(text==='An opponent gains 1 life')payment={kind:'opponent-life'};
   if(text==='Add {R}')payment={kind:'add-mana',color:'R'};
   if(text==='Draw a card')payment={kind:'draw'};
   if(text==="Put two cards from a single graveyard on the bottom of their owner's library")payment={kind:'graveyard-bottom'};
  }
 }
 if(!payment)return null;
 return{kind:'mechanic-upkeep-cost-v8',echo,label:match[2]||match[3]+' or '+match[4],payment,contract:'mechanic-upkeep-cost-v8'};
}
