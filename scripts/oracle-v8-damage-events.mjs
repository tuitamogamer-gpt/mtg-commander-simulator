const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const events=new Set(['oracleDamageBySource','oracleDamageToObject','oracleDamageHit']);
function selector(card,text,h,source=false){
 const self=new RegExp('^(?:this (?:creature|artifact|enchantment|permanent|Aura|Equipment)|'+[card.name,card.name.split(/,| the | of /)[0]].filter(Boolean).map(escape).join('|')+')$','i');
 if(self.test(text))return{kind:'self'};
 const union=/^(.+?) or (another .+|enchanted creature)$/.exec(text);
 if(source&&union){const first=selector(card,union[1],h,true),second=selector(card,union[2].replace(/^another /,'a '),h,true);if(first?.kind==='self'&&second)return{kind:'either',choices:[first,{...second,...(union[2].startsWith('another ')?{another:true}:{})}]};}
 if(/^(?:enchanted|equipped) creature$/.test(text))return{kind:'attached'};
 if(['you','a player','an opponent','a player or battle','a creature or opponent'].includes(text))return{kind:text};
 if(source&&/^(?:a|an) (?:noncreature |red )?source(?: you control)?$/.test(text))return{kind:'source',controller:text.endsWith(' you control')?'you':'any',...(text.includes('noncreature')?{noncreature:true}:{}),...(text.includes('red')?{color:'R'}:{})};
 if(source&&/^a (modified|historic|land) creature you control$/.test(text))return{kind:'quality',quality:text.split(' ')[1],controller:'you'};
 if(source&&text==='a creature you control with power greater than its base power')return{kind:'quality',quality:'power-above-base',controller:'you'};
 const spell=source&&/ spell(?: you control)?$/.test(text),phrase=text.replace(/^(?:a|an) /,'').replace(/ spells?\b/,' card');
 const target=h.target('target '+(spell?phrase.replace(/ you control$/,'')+' from a graveyard':phrase));
 return target?{kind:'filtered',target,...(spell?{spell:true,controller:text.endsWith(' you control')?'you':'any'}:{})}:null;
}
function bindDamageSource(node){
 if(Array.isArray(node))return node.map(bindDamageSource);
 if(!node||typeof node!=='object')return node;
 if(node.kind==='source-stat')return{...node,kind:'event-card-stat'};
 return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,bindDamageSource(v)]));
}
export function extensionLine(card,line,h){
 const once=line.endsWith(' This ability triggers only once each turn.');if(once)line=line.slice(0,-' This ability triggers only once each turn.'.length);
 const received=/^Whenever (.+?) is dealt (combat |noncombat )?damage, (.+)$/.exec(line);
 const dealt=/^Whenever (.+?) deals (combat |noncombat )?damage(?: to (.+?))?, (.+)$/.exec(line);
 if(!received&&!dealt)return null;
 let src,recipient,body,combat,event,bind;
 if(received){recipient=selector(card,received[1],h);if(!recipient)return null;src={kind:'source',controller:'any'};body=received[3];combat=received[2];event='oracleDamageToObject';bind='recipient';}
 else{
  src=selector(card,dealt[1],h,true);if(!src)return null;
  body=dealt[4];combat=dealt[2];event=dealt[3]?'oracleDamageHit':'oracleDamageBySource';bind=dealt[3]?'recipient':'source';
  if(dealt[3]){
   let phrase=dealt[3],batch=false;
   if(phrase==='one or more permanents and/or players'){recipient={kind:'any'};batch=true;}
   else if(phrase==='one or more of your opponents during your turn'){recipient={kind:'an opponent'};batch=true;}
   else recipient=selector(card,phrase,h);
   if(!recipient)return null;
   if(batch){event='oracleDamageBySource';bind='source';}
   else if(['self','attached','you'].includes(recipient.kind))bind='source';
  }else recipient={kind:'any'};
 }
 if(/\b(?:defending player|end of combat|this combat)\b/.test(body))return null;
 const eventSource=/^(?:it|that creature) deals /i.test(body);
 if(eventSource)body=body.replace(/^(?:it|that creature)/i,card.name);
 else if(bind==='recipient'||src.kind!=='self')body=body.replace(/\bit\b/gi,'that creature');
 const parsed=h.effect(card,body);if(!parsed||parsed.v4Body)return null;
 if(eventSource){if(parsed.effects.some(e=>e.action!=='damage'))return null;parsed.effects=bindDamageSource(parsed.effects).map(e=>({...e,source:'event-card'}));}
 return{kind:'generic-trigger',event,eventFilter:{kind:'damage-event-v8',source:src,recipient,bind,...(combat?{combat:combat==='combat '}:{}),...(dealt?.[3]?.endsWith('during your turn')?{yourTurn:true}:{})},...parsed,...(once?{onceEachTurn:true}:{}),contract:'generic-trigger-effect'};
}
export function eventReferenceAllowed(op,reference){
 if(op.eventFilter?.kind!=='damage-event-v8'||!events.has(op.event))return false;
 if(reference==='event-amount'||reference==='event-player')return true;
 const selected=op.eventFilter[op.eventFilter.bind];
 return ['event-card','event-card-controller'].includes(reference)&&!['you','a player','an opponent','a player or battle','any'].includes(selected.kind)&&!['player','opponent','player or planeswalker'].includes(selected.target?.what);
}
