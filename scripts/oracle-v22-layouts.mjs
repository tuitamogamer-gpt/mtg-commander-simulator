// Additive v22 layout and linked-rule grammar. Every admitted body must be
// independently executable; earlier compiler versions remain untouched.
import {compileFaces} from './oracle-v8-faces.mjs';
const MANA='(?:\\{(?:[0-9]+|[WUBRGC])\\})+';
const N='(?:one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const number=text=>({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[text]??(/^\d+$/.test(text)?Number(text):text));
const complete=op=>op&&!op.v4Body&&Array.isArray(op.effects)&&Array.isArray(op.targets);
const self=(card,noun)=>['it','him','her','this creature','this artifact','this enchantment','this permanent',card.name,card.name.split(',')[0]].includes(noun);
const map=(node,fn)=>Array.isArray(node)?node.map(item=>map(item,fn)):node&&typeof node==='object'?fn(Object.fromEntries(Object.entries(node).map(([key,value])=>[key,map(value,fn)]))):node;
function permissionSubject(text,h){
 const count=new RegExp('^(?:up to )?('+N+') of (?:those|the exiled) cards$').exec(text);if(count)return {max:number(count[1]),filter:null};
 const from='(?:them|those cards|those exiled cards|the exiled cards)',cast=new RegExp('^(?:(an?) |(any number of )|up to ('+N+') )?(.+?) from among '+from+'$').exec(text);
 if(cast){const phrase=cast[4];if(!/\bspells?\b/.test(phrase))return null;const max=cast[1]?1:cast[3]?number(cast[3]):null;if(phrase==='spell'||phrase==='spells')return {max,filter:null};const filter=h.target('target '+phrase.replace(/\bspells\b/,'spell'));if(filter?.zone==='stack')return {max,filter};return null;}
 if(/^(?:it|them|that card|those cards|cards exiled this way|the exiled cards)$/.test(text))return {max:null,filter:null};return null;
}
export function normalizeCard(card){const normalize=face=>({...face,oracle_text:/\bSaga\b/.test(face.type_line||'')?String(face.oracle_text||'').replace(/^([IVX]+(?:, [IVX]+)* — )([A-Z][A-Za-z'.: -]+) — /gm,'$1'):face.oracle_text});return {...normalize(card),...(card.card_faces?{card_faces:card.card_faces.map(normalize)}:{})};}
export function compileWholeCard(card,h){
 if(card.layout!=='transform'||card.card_faces?.length!==2||!/^More Than Meets the Eye /m.test(card.card_faces[0].oracle_text||''))return null;
 const front=card.card_faces[0],line=h.stripReminderText(front.oracle_text).split('\n').find(line=>line.startsWith('More Than Meets the Eye ')),cost=line?.slice(24);
 if(!new RegExp('^'+MANA+'$').test(cost||''))return {reason:'converted-casting-needs-supported-complete-cost-v22'};
 const faces=card.card_faces.map((face,index)=>({...face,oracle_text:h.stripReminderText(face.oracle_text).split('\n').filter(text=>!text.startsWith('More Than Meets the Eye ')).join('\n').replace(/\bconvert\b/g,'transform').replace(/\bconverts\b/g,'transforms').replace(/\bconverted\b/g,'transformed')}));
 const result=compileFaces({...card,card_faces:faces},{...h,compile:face=>h.compile({...face,oracleTransformFacesV20:true,oracleTransformNameV20:face.name,oracleConvertedFaceV22:true}),allowLandTransition:true});
 if(!result.semanticClass)return result;
 const operation=result.implementation[0];
 operation.faces[0].implementation.push({kind:'converted-casting-v22',cost,contract:'converted-casting-v22'});
 operation.faces[0].oracleContracts.push('converted-casting-v22');
 operation.faces[1].implementation.push({kind:'converted-physical-v22',frontCost:front.mana_cost,contract:'converted-casting-v22'});
 operation.faces[1].oracleContracts.push('converted-casting-v22');
 return {...result,rulesCore:card.card_faces.map(face=>face.name+': '+h.stripReminderText(face.oracle_text)).join('\n')};
}
export function extensionLine(card,line,h){
 if(line==='Living metal'&&card.oracleConvertedFaceV22&&/\bVehicle\b/.test(card.type_line))return {kind:'living-metal-v22',contract:'living-metal-v22'};
 const mana=/^\{T\}: Add (\{[WUBRGC]\})\. (When you next cast .+)$/.exec(line);
 if(mana){const parsed=extensionEffect(card,mana[2],h);if(parsed&&!parsed.targets.length&&parsed.effects.length===1)return {kind:'mana-source',produce:[{[mana[1][1]]:1}],afterEffects:parsed.effects,contract:'mana-source'};}
 return null;
}
export function extensionEffect(card,line,h){
 const reveal=/^Reveal cards from the top of your library until you reveal an? (.+? card)\. Put that card (into your hand|onto the battlefield(?: tapped)?)(?: and|,) (?:put )?the rest (on the bottom of your library in (?:a random|any) order|into your graveyard)\.$/i.exec(line)
  || /^Reveal cards from the top of your library until you reveal an? (.+? card)\. Put that card (into your hand|onto the battlefield(?: tapped)?) and the rest (on the bottom of your library in (?:a random|any) order|into your graveyard)\.$/i.exec(line);
 if(reveal){let filter=h.target('target '+reveal[1]+' from your graveyard');if(!filter&&/^([A-Z][A-Za-z'-]+) or ([A-Z][A-Za-z'-]+) card$/.test(reveal[1])){const parts=reveal[1].slice(0,-5).split(' or '),alternatives=parts.map(type=>h.target('target '+type+' card from your graveyard'));if(alternatives.every(Boolean))filter={what:'card',zone:'graveyard',controller:'you',alternatives};}if(filter?.zone==='graveyard')return {effects:[{action:'reveal-until-v22',filter,destination:reveal[2].startsWith('into')?'hand':'battlefield',tapped:reveal[2].endsWith(' tapped'),rest:reveal[3]==='into your graveyard'?'graveyard':reveal[3].includes('random')?'bottom-random':'bottom-order'}],targets:[]};}
 const immediate=new RegExp('^Exile the top (card|('+N+') cards) of your library\\. You may cast (.+?) without paying (?:its|their) mana costs?\\. Put (?:the exiled cards not cast this way|the rest) on the bottom of your library in a random order\\.$').exec(line);
 if(immediate){const n=immediate[1]==='card'?1:number(immediate[2]),subject=permissionSubject(immediate[3],h);if(n&&subject&&subject.max!=='X')return {effects:[{action:'exile-cast-batch-v22',n,...subject,free:true,rest:'bottom-random'}],targets:[]};}
 const ownNext=new RegExp('^Exile the top (card|('+N+') cards) of your library\\. During your next turn, you may (play|cast) (it|them|that card|those cards)\\.$').exec(line);
 if(ownNext)return {effects:[{action:'exile-permission-v22',who:'you',n:ownNext[1]==='card'?1:number(ownNext[2]),max:null,filter:null,spellsOnly:ownNext[3]==='cast',duration:'only-next-turn'}],targets:[]};
 const multiple=new RegExp('^Exile the top (card|('+N+') cards) of each (player|opponent)\'s library\\. (?:Until end of turn, you may|You may) (play|cast) (.+?)(?: this turn| until end of turn)?( without paying (?:its|their) mana costs?)?\\.$').exec(line);
 if(multiple){const n=multiple[1]==='card'?1:number(multiple[2]),subject=permissionSubject(multiple[5],h);if(n&&subject&&/Until end of turn,| this turn| until end of turn/.test(line))return {effects:[{action:'exile-permission-v22',who:multiple[3]==='player'?'each-player':'each-opponent',n,...subject,spellsOnly:multiple[4]==='cast',free:!!multiple[6],duration:'eot'}],targets:[]};}
 const choice=new RegExp('^Exile the top ('+N+') cards of your library\\. Choose one of them\\. (?:Until end of turn, you may|You may) (play|cast) that card(?: this turn| until end of turn)?\\.$').exec(line);
 if(choice&&/Until end of turn,| this turn| until end of turn/.test(line))return {effects:[{action:'exile-selected-permission-v22',n:number(choice[1]),max:1,spellsOnly:choice[2]==='cast',duration:'eot'}],targets:[]};
 const end='(?:this turn|until end of turn|until the end of your next turn|until your next end step|for as long as you control (?:this creature|this artifact|this enchantment|this permanent)|for as long as (?:it remains|they remain) exiled)';
 const namedControl=new RegExp('for as long as you control (?:'+card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'|'+card.name.split(',')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')\\.').test(line),normalized=namedControl?line.replace(/for as long as you control .+?\.$/,'for as long as you control this permanent.'):line;
 const spend=/, and mana of any type can be spent to cast (?:them|those spells|it)\.$/.test(normalized),paidText=spend?normalized.replace(/, and mana of any type can be spent to cast (?:them|those spells|it)\.$/,'.'):normalized;
 const exile=new RegExp('^Exile the top (card|('+N+') cards) of (your|target opponent\'s|target player\'s|that player\'s) library(?:, where X is (.+?))?\\. (?:(Until the end of your next turn|Until your next end step|Until end of turn), you may |You may )(play|cast) (.+?)(?: ('+end+'))?( without paying (?:its|their) mana costs?)?\\.$').exec(paidText);
 if(exile){
  const who=exile[3]==='your'?'you':exile[3].startsWith('target ')?0:'event-player',target=who===0?h.target(exile[3].slice(0,-2)):null,n=exile[1]==='card'?1:exile[2]==='X'&&exile[4]?(h.value(exile[4])||h.count(exile[4])):number(exile[2]);
  if(!n||who===0&&!target)return null;
  const subject=permissionSubject(exile[7],h);if(!subject)return null;const {max,filter}=subject;
  const duration=(exile[5]||exile[8]||'').toLowerCase();if(!duration)return null;
  return {effects:[{action:'exile-permission-v22',who,n,filter,max,spellsOnly:exile[6]==='cast',free:!!exile[9],anyColor:spend,duration:duration.includes('next end step')?'next-end-step':duration.includes('next turn')?'next-turn':duration.includes('as long as you control')?'source-control':duration.includes('remain')?'persistent':'eot'}],targets:target?[target]:[]};
 }
 const inspect=new RegExp('^Look at the top ('+N+') cards of your library(?:, where X is (.+?))?\\. You may exile an? (.+?) card from among them\\. Put the rest (?:on the bottom of your library in a random order|into your hand)\\. (?:Until end of turn, you may cast the exiled card|You may (cast|play) (?:the exiled|that) card(?: (this turn|until the end of your next turn))?)( without paying its mana cost)?\\.$').exec(line);
 if(inspect){const n=inspect[1]==='X'&&inspect[2]?(h.value(inspect[2])||h.count(inspect[2])):number(inspect[1]),filter=h.target('target '+inspect[3]+' card from your graveyard');if(n&&filter?.zone==='graveyard')return {effects:[{action:'inspect-exile-v22',n,filter,rest:line.includes('Put the rest into your hand.')?'hand':'bottom-random',min:0,max:1,spellsOnly:inspect[4]!=='play',free:!!inspect[6],duration:line.includes('Until end of turn,')||inspect[5]==='this turn'?'eot':inspect[5]?'next-turn':'immediate'}],targets:[]};}
 const temporary=/^(Until end of turn|Until your next turn), (whenever .+)$/i.exec(line);
 if(temporary){
  const copy=/^whenever a player casts an instant or sorcery spell, that player copies it and may choose new targets for the copy\.$/i.test(temporary[2]);
  const text=copy?'Whenever a player casts an instant or sorcery spell, copy that spell. You may choose new targets for the copy.':temporary[2][0].toUpperCase()+temporary[2].slice(1);let trigger=h.line(card,text);
  if(trigger?.eventFilter?.kind==='filtered-object')trigger={...trigger,effects:map(trigger.effects,node=>Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who','sourceTarget'].includes(key)&&value==='unbound-object-v10'?'event-card':value])))};
  if(trigger?.kind==='generic-trigger'&&!trigger.zone&&!trigger.stateTest&&!trigger.oncePerTurn&&!trigger.onceEachTurn&&!trigger.oncePerBatch&&!trigger.modalBody&&!trigger.v4Body&&complete(trigger)&&!JSON.stringify(trigger.effects).includes('unbound-object-v10'))return {effects:[{action:'install-trigger-v8',layoutsV22:true,duration:temporary[1].toLowerCase()==='until your next turn'?'next-turn':'eot',once:false,controllerEventPlayer:copy,trigger}],targets:[]};
 }
 const next=/^When you next cast (a(?:n)? .+? spell)(?: from your hand)? this turn, (.+)$/.exec(line);
 if(next){
  const hand=/ spell from your hand this turn,/.test(line),event='Whenever you cast '+next[1]+', ',entered=/^(?:that creature|it) enters with an additional \+1\/\+1 counter on it\.$/.test(next[2]);
  const trigger=h.line(card,event+(entered?'draw a card.':next[2]));
  if(trigger?.kind==='generic-trigger'&&['cast','castCreature'].includes(trigger.event)&&!trigger.zone&&!trigger.condition&&!trigger.modalBody&&!trigger.v4Body&&complete(trigger)){
   if(entered)trigger.effects=[{action:'next-cast-entry-counter-v22',counter:'+1/+1',n:1}];
   return {effects:[{action:'install-trigger-v8',layoutsV22:true,duration:'eot',once:true,fromHand:hand,trigger}],targets:[]};
  }
 }
 return null;
}
export function extensionCondition(){return null;}
export function modifierOperation(...args){return extensionLine(...args);}
