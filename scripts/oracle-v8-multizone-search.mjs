// Exact own-zone searches. The selected zones are a resolution choice, and
// each stated card quality retains its own search obligation.
const zoneLists=new Map([
  ['library and/or graveyard',['library','graveyard']],
  ['graveyard and/or library',['graveyard','library']],
  ['graveyard, hand, and/or library',['graveyard','hand','library']],
  ['graveyard, hand and/or library',['graveyard','hand','library']],
  ['library, hand, and/or graveyard',['library','hand','graveyard']],
  ['library, hand and/or graveyard',['library','hand','graveyard']],
  ['hand and/or library',['hand','library']],
]);
function clause(text,helpers){
  const named=/^a card named (.+)$/.exec(text);
  if(named){
    if(!/^[A-Z0-9][A-Za-z0-9 ,:'’!\-]+$/.test(named[1])||/\b(?:and|or|then|with|from|that|reveal|put)\b/.test(named[1]))return null;
    return {name:named[1],n:1};
  }
  const noun=/^(?:a|an) (.+? card(?: with mana value \d+ or less)?)$/.exec(text);
  if(!noun)return null;
  const filter=helpers.target?.('target '+noun[1]+' from your graveyard');
  return filter?.zone==='graveyard'?{filter,n:1}:null;
}
export function extensionEffect(card,line,helpers={}){
  const match=/^(You may )?search your (.+?) for (.+?)(?:, (reveal (?:it|them|that card|those cards)),? (?:and |then )?put| and put) (?:it|them|that card|those cards) (into your hand|onto the battlefield(?: tapped)?)\. If you search(?:ed)? your library this way, shuffle\.$/i.exec(line);
  if(!match)return null;
  const zones=zoneLists.get(match[2]);if(!zones)return null;
  const parts=match[3].split(' and/or '),clauses=parts.map(text=>clause(text,helpers));
  if(!clauses.length||clauses.length>2||clauses.some(value=>!value)||parts.length>1&&clauses.some(value=>!value.name))return null;
  const destination=match[5].includes('hand')?'hand':'battlefield';
  if(destination==='battlefield'&&clauses.some(value=>value.filter?.what==='card'&&!value.filter.subtype&&!value.name))return null;
  return {targets:[],optional:!!match[1],effects:[{action:'search-own-zones-v8',zones,clauses,chooseClauses:clauses.length>1,
    destination,tapped:match[5].endsWith(' tapped'),reveal:!!match[4]}]};
}
