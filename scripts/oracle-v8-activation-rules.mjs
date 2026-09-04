// Compose printed activation restrictions without treating trailing rules as
// resolution effects. Each suffix and condition must be understood in full.
const WORDS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const NUMBER='(?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const value=text=>WORDS[text]??Number(text);
const boundReference=node=>!!node&&typeof node==='object'&&(String(node.kind||'').startsWith('event-')||
  ['affected-count','selected-count','count-subject','sacrificed-stat'].includes(node.kind)||
  ['event-player','targeted-player','affected','selected','target'].includes(node.controller)||
  Object.values(node).some(child=>Array.isArray(child)?child.some(boundReference):boundReference(child)));

function condition(text,h) {
  const direct=h.condition(text);
  if(direct&&!boundReference(direct))return direct;
  if(text.includes(' or if ')) {
    const parts=text.split(' or if ').map(part=>condition(part,h));
    if(parts.every(Boolean))return {kind:'any',conditions:parts};
  }
  const counters=new RegExp('^there (?:is|are) ('+NUMBER+') or more (\\+1/\\+1|-1/-1|[a-z]+) counters? on this (?:creature|artifact|enchantment|land|permanent)$').exec(text);
  if(counters&&Number.isSafeInteger(value(counters[1])))return {kind:'count-comparison',count:{kind:'source-counters',counter:counters[2]},min:value(counters[1])};
  return null;
}

export function extensionLine(card,line,h) {
  if(!line.includes(': '))return null;
  let body=line,changed=false,onceEachTurn=false,oncePerObject=false,sorceryOnly=false,adjustment=null;
  const conditions=[];
  while(true) {
    const restriction=/ Activate only ([^.]+)\.$/.exec(body);
    if(restriction) {
      const rules=restriction[1].split(' and only ');
      for(const rule of rules) {
        if(rule==='as a sorcery'){if(sorceryOnly)return null;sorceryOnly=true;}
        else if(rule==='once each turn'){if(onceEachTurn||oncePerObject)return null;onceEachTurn=true;}
        else if(rule==='once'){if(onceEachTurn||oncePerObject)return null;oncePerObject=true;}
        else {
          const text=rule.startsWith('if ')?rule.slice(3):rule==='during your turn'?"it's your turn":
            rule==='during your upkeep'?"it's your upkeep":rule==="during an opponent's turn"?"it's not your turn":null;
          const parsed=text&&condition(text,h);if(!parsed)return null;conditions.push(parsed);
        }
      }
      body=body.slice(0,restriction.index);changed=true;continue;
    }
    const discount=/ This ability costs \{([1-9][0-9]*)\} (less|more) to activate (for each|if) (.+)\.$/.exec(body);
    if(discount) {
      if(adjustment)return null;
      const amount=Number(discount[1])*(discount[2]==='less'?-1:1);
      if(!Number.isSafeInteger(amount))return null;
      const node=discount[3]==='if'?condition(discount[4],h):h.count(discount[4]);
      // Adjective sharing across an "and" list is not proven by the existing
      // count parser (e.g. legendary creature and planeswalker).
      if(!node||boundReference(node)||discount[3]==='for each'&&/\band\b/.test(discount[4]))return null;
      adjustment={amount,[discount[3]==='if'?'condition':'count']:node};
      body=body.slice(0,discount.index);changed=true;continue;
    }
    break;
  }
  if(!changed)return null;
  const parsed=h.line(card,body);
  if(!parsed||!['generic-ability','mana-source'].includes(parsed.kind))return null;
  // A rule following a modal bullet needs an explicit whole-ability binding
  // proof. This adapter is limited to nonmodal activation bodies.
  if(parsed.modalBody)return null;
  if(parsed.kind==='mana-source') {
    if(adjustment||sorceryOnly||oncePerObject)return null;
    if(parsed.condition)conditions.unshift(parsed.condition);
    return {...parsed,...(conditions.length?{condition:conditions.length===1?conditions[0]:{kind:'all',conditions}}:{}),
      ...(onceEachTurn?{onceEachTurn:true}:{})};
  }
  if(parsed.activationCondition)conditions.unshift(parsed.activationCondition);
  if(parsed.from&&(onceEachTurn||oncePerObject))return null;
  if(adjustment&&(!parsed.cost?.mana||typeof parsed.cost.mana!=='string'||parsed.cost.mana.includes('{X}')||parsed.from||
    parsed.effects?.some(effect=>effect.action==='add-mana')))return null;
  return {...parsed,...(adjustment?{cost:{...parsed.cost,manaAdjustment:adjustment}}:{}),
    ...(conditions.length?{activationCondition:conditions.length===1?conditions[0]:{kind:'all',conditions}}:{}),
    ...(onceEachTurn?{onceEachTurn:true}:{}),...(oncePerObject?{oncePerObject:true}:{}),...(sorceryOnly?{sorceryOnly:true}:{})};
}
