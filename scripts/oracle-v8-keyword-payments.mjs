import{modifierOperation as additional}from'./oracle-v8-additional-costs.mjs';
export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal')return null;
 const match=/^(Flashback|Buyback|Kicker)—((?:(?:\{(?:[0-9]+|[WUBRGC])\})+), )?(.+)\.$/.exec(line);if(!match)return null;
 const keyword=match[1].toLowerCase();
 if(keyword!=='kicker'&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
 // Joint announcements with a second optional mechanic need a complete
 // shared preview; do not admit such combinations through independent tests.
 const optionals=[...(card.oracle_text||'').matchAll(/^(Kicker|Multikicker|Buyback|Replicate|Squad|Offspring|Entwine|Strive|Splice|Flashback)(?: |—)/gm)];
 if(optionals.length!==1)return null;
 const clause=match[3][0].toLowerCase()+match[3].slice(1),costs=additional(card,'As an additional cost to cast this spell, '+clause+'.')?.costs;
 if(costs?.length!==1||!['sacrifice','discard','payLife','returnPermanent','exileGraveyard'].includes(costs[0].kind))return null;
 const cost=costs[0];if(cost.quantity&&cost.quantity.min!==cost.quantity.max||cost.amount&&cost.amount.kind!=='number')return null;
 return{kind:'mechanic-keyword-payment-v8',keyword,mana:match[2]?.slice(0,-2)||'{0}',costs,label:match[1]+' — '+(match[2]||'')+match[3],contract:'mechanic-keyword-payment-v8'};
}
