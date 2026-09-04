import{modifierOperation as additional}from'./oracle-v8-additional-costs.mjs';
export function modifierOperation(card,line){
 if(card.layout&&card.layout!=='normal')return null;
 if(line==='Cycling abilities you activate cost {2} less to activate.')return{kind:'mechanic-cycling-rule-v8',reduction:2,contract:'mechanic-cycling-rule-v8'};
 if(line==="Players can't cycle cards.")return{kind:'mechanic-cycling-rule-v8',prohibited:true,contract:'mechanic-cycling-rule-v8'};
 const match=/^(Cycling|Eternalize)—((?:(?:\{(?:[0-9]+|[WUBRGC])\})+), )?(.+)\.$/.exec(line);if(!match)return null;
 const keyword=match[1].toLowerCase(),text=match[3],clause=text[0].toLowerCase()+text.slice(1),costs=additional(card,'As an additional cost to cast this spell, '+clause+'.')?.costs;
 if(costs?.length!==1||!['sacrifice','payLife','discard'].includes(costs[0].kind))return null;
 if(costs[0].quantity&&costs[0].quantity.min!==costs[0].quantity.max||costs[0].amount&&costs[0].amount.kind!=='number')return null;
 if(keyword==='eternalize'&&(!/\bCreature\b/.test(card.type_line||'')||text!=='Discard a card'||costs[0].kind!=='discard'||costs[0].quantity.min!==1||costs[0].quantity.max!==1))return null;
 if(keyword==='cycling'&&costs[0].kind==='discard')return null;
 return{kind:'mechanic-zone-keyword-cost-v8',keyword,mana:match[2]?.slice(0,-2)||'{0}',costs,label:match[1]+' — '+(match[2]||'')+text,contract:'mechanic-zone-keyword-cost-v8'};
}
