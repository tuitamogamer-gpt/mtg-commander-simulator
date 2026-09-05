const esc=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const operation=fields=>({kind:'zone-replacement-v8',...fields,contract:'ordered-zone-replacement'});
export function extensionLine(card,line){
  const self='(?:this (?:creature|artifact|permanent)|'+[...new Set([card.name,card.name.split(/,| the /)[0]])].map(esc).join('|')+')';
  let match=new RegExp('^If '+self+' would die, (exile it|put it on (top|the bottom) of its owner\'s library) instead\\.$').exec(line);
  if(match)return operation({scope:'self',from:'battlefield',creatureOnly:true,to:match[1]==='exile it'?'exile':'library',...(match[2]?{placement:match[2]==='top'?'top':'bottom'}:{})});
  if(new RegExp('^If '+self+' would be put into a graveyard from anywhere, reveal '+self+' and shuffle it into its owner\'s library instead\\.$').test(line))return operation({scope:'self',from:'any',to:'library',placement:'shuffle',reveal:true});
  if(line==='If a card or token would be put into a graveyard from anywhere, exile it instead.')return operation({scope:'all',from:'any',to:'exile'});
  if(line==='If a permanent would be put into a graveyard, exile it instead.')return operation({scope:'all',from:'battlefield',to:'exile'});
  if(line==='If an instant or sorcery card would be put into a graveyard from anywhere, exile it instead.')return operation({scope:'instant-or-sorcery',from:'any',to:'exile'});
  if(line==='If a creature an opponent controls would die, exile it instead.')return operation({scope:'opponent-creature',from:'battlefield',to:'exile'});
  if(line==='If a nontoken creature an opponent owns would die or a creature card not on the battlefield would be put into an opponent\'s graveyard, exile that card instead.')return operation({scope:'opponent-owned-creature-card',from:'any',to:'exile'});
  if(new RegExp('^If a creature dealt damage by '+self+' this turn would die, exile it instead\\.$').test(line))return operation({scope:'damaged-by-source',from:'battlefield',to:'exile'});
  return null;
}
