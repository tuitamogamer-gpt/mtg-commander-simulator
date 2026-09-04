// Printed timing permissions only. These do not waive costs, grant access to
// another zone, or bypass a rule that forbids casting.
function spellFilter(text,h) {
  if(text==='spells')return {what:'card',zone:'graveyard',controller:'any',min:1};
  if(text==='historic spells')return spellFilter('artifact and legendary and Saga spells',h);
  const noun=/^(.+?) spells$/.exec(text);
  if(!noun)return null;
  const parts=noun[1].replace(/ spells and /g,' and ').split(' and ');
  const filters=parts.map(part=>h.target('target '+part+' card from a graveyard'));
  if(filters.some(filter=>!filter))return null;
  return filters.length===1?filters[0]:{what:'card',zone:'graveyard',controller:'any',min:1,alternatives:filters};
}

export function modifierOperation(card,line,h) {
  if(/Instant|Sorcery|Battle/.test(card.type_line||''))return null;
  const match=/^(You|Any player) may cast (.+) as though they had flash\.$/.exec(line);
  if(!match)return null;
  const filter=spellFilter(match[2],h);
  return filter?{kind:'flash-permission-v8',filter,scope:match[1]==='You'?'controller':'all',contract:'generic-continuous-effect'}:null;
}

export function extensionEffect(card,line,h) {
  const match=/^You may cast (.+) this turn as though they had flash\.$/.exec(line);
  if(!match)return null;
  const filter=spellFilter(match[1],h);
  return filter?{effects:[{action:'grant-flash-turn-v8',filter}],targets:[],optional:false}:null;
}
