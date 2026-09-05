// Closed activation suffixes. Existing descriptors are attempted first by the
// compiler; this adapter adds only complete, previously deferred restrictions.
const live=test=>({kind:'activation-state-v8',test});
const any=conditions=>({kind:'any',conditions});
const bound=node=>!!node&&typeof node==='object'&&(String(node.kind||'').startsWith('event-')||
  ['affected-count','selected-count','count-subject','sacrificed-stat'].includes(node.kind)||
  ['event-player','targeted-player','affected','selected','target'].includes(node.controller)||
  Object.values(node).some(child=>Array.isArray(child)?child.some(bound):bound(child)));
function condition(text,h){
  if(text==='five or more creatures died this turn')return {kind:'count-comparison',count:{kind:'died-count',what:'creature'},min:5};
  if(text==='this creature is blocked')return live('source-blocked');
  if(text==='an opponent was dealt damage this turn')return live('opponent-damaged');
  if(text==="you've discarded a card this turn")return {kind:'turn-stat',field:'discardedN',min:1};
  if(text==="you've cast a noncreature spell this turn")return {kind:'turn-stat',field:'nonCreatureSpells',min:1};
  if(text==='you have exactly seven cards in hand')return {kind:'hand-count',n:7};
  if(text==='you have exactly zero or seven cards in hand')return any([0,7].map(n=>({kind:'hand-count',n})));
  if(text==='this creature is attacking or blocking')return any(['attacking','blocking'].map(status=>({kind:'source-status',status})));
  if(text==='you had a creature enter the battlefield under your control this turn')return {kind:'v8-live-condition',test:'entry-turn',type:'Creature'};
  if(text==='a Bird, Frog, Otter, or Rat entered the battlefield under your control this turn')return any(['Bird','Frog','Otter','Rat'].map(subtype=>({kind:'v8-live-condition',test:'entry-turn',type:'Creature',subtype})));
  if(text==='you control three or more lands with the same name')return {...live('same-name-lands'),min:3};
  if(text==='you control an attacking modified creature')return live('attacking-modified');
  const parsed=h.condition(text);return parsed&&!bound(parsed)?parsed:null;
}
export function extensionLine(card,line,h){
  if(!line.includes(': '))return null;
  const suffix=/ Activate only ([^.]+)\.$/.exec(line);if(!suffix)return null;
  let onceEachTurn=false,sorceryOnly=false,graveyard=false;const conditions=[];
  for(const rule of suffix[1].split(' and only ')){
    if(rule==='once each turn'){if(onceEachTurn)return null;onceEachTurn=true;}
    else if(rule==='as a sorcery'){if(sorceryOnly)return null;sorceryOnly=true;}
    else if(rule==='if this card is in your graveyard'){if(graveyard)return null;graveyard=true;}
    else if(rule==='during the end of combat step')conditions.push(live('end-combat'));
    else if(rule==="during an opponent's upkeep")conditions.push(live('opponent-upkeep'));
    else if(rule==='during any upkeep step')conditions.push(live('any-upkeep'));
    else {const text=rule.startsWith('if ')?rule.slice(3):rule==='during your turn'?"it's your turn":null;
      const parsed=text&&condition(text,h);if(!parsed)return null;conditions.push(parsed);}
  }
  let parsed=h.line(card,line.slice(0,suffix.index));
  if(parsed?.kind==='mechanic-grave-return-self')parsed={kind:'generic-ability',from:'graveyard',retainGraveSource:true,cost:{mana:parsed.cost},targets:[],effects:[{action:'return-grave-source',destination:'hand',tapped:false}],contract:'generic-activated-effect'};
  if(!parsed||!['generic-ability','mana-source'].includes(parsed.kind)||parsed.modalBody)return null;
  if(parsed.kind==='mana-source'){
    if(graveyard||sorceryOnly)return null;
    if(parsed.condition)conditions.unshift(parsed.condition);
    return {...parsed,...(conditions.length?{condition:conditions.length===1?conditions[0]:{kind:'all',conditions}}:{}),...(onceEachTurn?{onceEachTurn:true}:{})};
  }
  if(graveyard&&(parsed.from&&parsed.from!=='graveyard'||parsed.cost?.tap||parsed.cost?.sacSelf))return null;
  if((parsed.from||graveyard)&&onceEachTurn)return null;
  if(parsed.activationCondition)conditions.unshift(parsed.activationCondition);
  return {...parsed,...(graveyard?{from:'graveyard',retainGraveSource:true}:{}),
    ...(conditions.length?{activationCondition:conditions.length===1?conditions[0]:{kind:'all',conditions}}:{}),
    ...(onceEachTurn?{onceEachTurn:true}:{}),...(sorceryOnly?{sorceryOnly:true}:{})};
}
