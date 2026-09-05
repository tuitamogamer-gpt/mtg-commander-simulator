const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const selfPattern=card=>'(?:this (?:creature|artifact|enchantment|land|permanent)|'+[...new Set([card.name,card.name.split(',')[0]])].map(escape).join('|')+')';
function normalizeSource(card,text){return text.replace(new RegExp('^'+selfPattern(card)+'(?= (?:has|is) )','i'),'this permanent').replace(new RegExp('(?<=counters on )'+selfPattern(card)+'$','i'),'this permanent');}
function stateCondition(card,text,h){
 const normalized=normalizeSource(card,text).replace(/^there are no (creatures|artifacts|enchantments|lands|permanents) on the battlefield$/,'no $1 are on the battlefield');
 if(text==='you control no permanents of the chosen color')return {kind:'state-chosen-color-absence-v8'};
 if(!/^(?:you (?:control |have )|an opponent has |there are |no (?:creatures|artifacts|enchantments|lands|permanents) are |this permanent (?:has |is ))/.test(normalized))return null;
 return h.condition?.(normalized)||null;
}
export function extensionLine(card,line,h={}){
 if(!line.startsWith('When '))return null;
 const parts=[...line.matchAll(/, /g)].map(match=>match.index);
 for(const index of parts){
  const condition=stateCondition(card,line.slice(5,index),h);if(!condition)continue;
  let body=line.slice(index+2),intervening;
  const branch=/^if (.+?), (.+)$/.exec(body);if(branch){intervening=h.condition?.(normalizeSource(card,branch[1]));if(!intervening)continue;body=branch[2];}
  body=body.replace(/^it (becomes |has |gets |gains )/,'this permanent $1')
    .replace(new RegExp('^(sacrifice|exile) (?:it|'+selfPattern(card)+')(?=[.,])','i'),'$1 this permanent');
  const parsed=h.effect?.(card,body);if(!parsed||/"event-|"X"/.test(JSON.stringify(parsed)))continue;
  return {kind:'state-trigger-v8',state:condition,trigger:{kind:'generic-trigger',event:'state',eventFilter:'self',...parsed,...(intervening?{condition:intervening}:{}),contract:'generic-trigger-effect'},contract:'state-trigger-v8'};
 }
 return null;
}
