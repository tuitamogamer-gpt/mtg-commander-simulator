const body=(effects,targets=[])=>({effects,targets,optional:false});
const effect=(mode,extra={})=>({action:'common-effects-v43',mode,...extra});
const rule=mode=>({kind:'common-rule-v43',mode,contract:'generic-continuous-effect'});
export function normalizeCard(card){
  let text=card.oracle_text;
  if(card.name==='Senator Peacock')text=text.replace('Artifacts you control are Clues in addition to their other types and have "{2}, Sacrifice this artifact: Draw a card."','Artifacts you control are Clues in addition to their other types.\nArtifacts you control have "{2}, Sacrifice this artifact: Draw a card."');
  return text===card.oracle_text?card:{...card,oracle_text:text};
}
export function extensionLine(card,line,h){
  const rules={
    'Nonartifact creatures get +2/+2 as long as they all share a color.':'common-color',
    "You can't play lands or cast spells from your hand.":'no-hand-plays',
    'Tapped creatures you control can block as though they were untapped.':'tapped-blockers',
    'Artifacts you control are Clues in addition to their other types.':'clue-types',
    'If you would scry a number of cards, draw that many cards instead.':'scry-draw',
    'If you would scry a number of cards, scry that many cards plus one instead.':'scry-extra',
    "This creature can't attack if it attacked during your last turn.":'rest-self',
    "Creatures that attacked during their controller's last turn can't attack.":'rest-all',
  };
  if(rules[line])return rule(rules[line]);
  if(line==='You may cast Aura spells with enchant creature as though they had flash.')return {kind:'flash-permission-v8',filter:{...h.target('target Aura card from a graveyard'),v20:{kind:'creature-aura-v43'}},scope:'controller',contract:'generic-continuous-effect'};
  if(line==='As this creature is turned face up, put four +1/+1 counters on it.')return {kind:'face-up-counters-v43',n:4,contract:'face-up-replacement-v43'};
  if(line==="This land enters tapped unless it's your first, second, or third turn of the game.")return {kind:'conditional-enters-tapped',condition:'generic',untappedCondition:{kind:'first-three-own-turns-v43'},contract:'conditional-permanent-entry'};
  if(line==='This spell costs {2} less to cast if a creature is attacking you.')return {kind:'cost-modifier',self:true,amount:-2,condition:{kind:'being-attacked-v43'},contract:'generic-cost-modification'};
  if(line==='As long as this creature is your Ring-bearer, it must be blocked if able.'||line==='As long as Frodo Baggins is your Ring-bearer, it must be blocked if able.')return {kind:'generic-static',scope:'self',condition:h.condition('this creature is your Ring-bearer'),mustBeBlocked:true,contract:'generic-continuous-effect'};
  if(line==='When a creature attacks you or a planeswalker you control, if this creature has defender, it loses defender and gains trample.')return {...h.line(card,'Whenever a creature attacks you or a planeswalker you control, draw a card.'),...body([{action:'common-effects-v42',mode:'keyword-duration',target:'self',keyword:'defender',remove:true},{action:'common-effects-v42',mode:'keyword-duration',target:'self',keyword:'trample',remove:false}]),condition:{kind:'has-defender-v43'}};
  return null;
}
export function extensionEffect(card,text,h){
  if(text==='Destroy target creature. If another creature died this turn, draw a card.')return body([effect('destroy-other-died',{target:0})],[h.target('target creature')]);
  return null;
}
export function modifierOperation(card,line,h){
  if(line==='This spell costs {2} less to cast if a creature is attacking you.')return extensionLine(card,line,h);
  return null;
}
