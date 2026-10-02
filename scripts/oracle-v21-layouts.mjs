// Complete staged rules and physical-face transitions. Chapter bodies use the
// ordinary triggered-ability compiler, so optional and modal printed chapters
// retain the same targets, choices and resolution semantics as permanents.
import {normalizeAbilityWords} from './oracle-v8-core.mjs';
const ROMAN=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const NUMBER='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const number=x=>({a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[x]??Number(x));
const self=(card,text)=>['it','him','her','this creature','this artifact','this enchantment','this land','this permanent','this planeswalker','this card','this Saga',card.name,card.name.split(',')[0],card.name.split(/,| the | of /)[0]].some(noun=>noun.toLowerCase()===text.toLowerCase());
const nouns=text=>String(text||'').replace(/\b(This|this) Saga\b/g,'$1 enchantment').replace(/([Ee]xile the top card of your library\. )For as long as it remains exiled, it has "You may cast this card from exile as long as (.+)\."/g,'$1For as long as it remains exiled, you may cast it if $2.');
export function normalizeCard(card){return {...card,oracle_text:nouns(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:nouns(face.oracle_text)}))}:{})};}
const section=compiled=>({implementation:compiled.implementation,implementedKeywords:compiled.implementedKeywords||[],oracleContracts:compiled.oracleContracts||[]});
const STAGED=new Set(['generic-trigger','generic-ability','generic-static','mana-source','base-pt-static','v8-type-static','v8-layered-static','top-library-permission-v20','mechanic-additional-land','library-visibility-v17','mechanic-no-max-hand','hand-size-v8','permanent-counter-replacement-v20','permanent-trigger-doubler-v20','permanent-static-v20','permanent-combat-tax-v20','controlled-creature-pump-static','attacking-creature-pump-static','damage-rule-v20','v8-replacement']);
const gated=op=>STAGED.has(op.kind)||['cost-modifier','cast-permission-v20','spell-cost-v20'].includes(op.kind)&&!op.self&&!op.grantFlash||op.kind==='operation-bundle'&&op.operations.every(gated);
function giftBody(text,promised){
 return text.split('\n').map(line=>{
  const replacement=/^(.+?)\. If the gift was promised, instead (.+)\.$/.exec(line);
  // A replacement can replace this one instruction only. Earlier sentences
  // need their own retained sequence rather than a guessed replacement scope.
  if(replacement&&replacement[1].includes('.'))return line;
  if(replacement)return promised?replacement[2][0].toUpperCase()+replacement[2].slice(1)+'.':replacement[1]+'.';
  return line.replace(/(?:Then )?If the gift (was|wasn't) promised(?: and ([^,]+))?, ([^.]+)\./g,(_,was,condition,body)=>promised===(was==='was')?(condition?'If '+condition+', ':body[0].toUpperCase())+(condition?body:body.slice(1)).replace(/\balso /g,'')+'.':'')
   .replace(/[^.]+ if the gift was promised\./g,clause=>promised?clause.replace(' if the gift was promised',''):'').trim();
 }).filter(Boolean).join('\n');
}

export function compileWholeCard(card,h){
 if(card.layout==='class'){
  if(!/\bEnchantment\b/.test(card.type_line)||!/\bClass\b/.test(card.type_line)||!/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/.test(card.mana_cost||''))return {reason:'unsupported-class-type-or-cost-v21'};
  const core=h.stripReminderText(card.oracle_text),stages=[{level:1,lines:[]}];
  for(const line of core.split('\n')){const header=/^((?:\{(?:[0-9]+|[WUBRGC])\})+): Level ([23])$/.exec(line);if(header){if(Number(header[2])!==stages.length+1)return {reason:'unsupported-class-level-sequence-v21'};stages.push({level:Number(header[2]),cost:header[1],lines:[]});}else stages.at(-1).lines.push(line);}
  if(stages.length!==3)return {reason:'unsupported-class-level-sequence-v21'};
  const part=lines=>h.compile({...card,layout:'normal',card_faces:undefined,oracle_text:lines.join('\n').replace(/\b(This|this) Class\b/g,'$1 enchantment')});
  const base=part(stages[0].lines);if(!base.semanticClass)return {reason:'class-base-needs-complete-semantics-v21'};
  const levels=[];
  for(const stage of stages.slice(1)){
   const regular=[],levelTriggers=[];
   for(const line of stage.lines){const became=/^When this Class becomes level ([23]), (.+)$/.exec(line);if(became){if(Number(became[1])!==stage.level)return {reason:'unsupported-class-level-trigger-v21'};const trigger=part(['When this enchantment enters, '+became[2]]);if(!trigger.semanticClass||trigger.implementation.some(op=>op.kind!=='generic-trigger'||op.event!=='etb'||op.eventFilter!=='self'))return {reason:'class-level-trigger-needs-complete-semantics-v21'};levelTriggers.push(...trigger.implementation);}else regular.push(line);}
   const body=part(regular);if(!body.semanticClass||body.implementation.some(op=>!gated(op)))return {reason:'class-level-needs-complete-semantics-v21'};
   if(regular.includes('Whenever you attack, until end of turn, target attacking creature gets +1/+1 for each other attacking creature and gains double strike.')){
    const trigger=body.implementation.find(op=>op.kind==='generic-trigger'&&op.event==='attackersDeclared');
    if(!trigger||trigger.effects.length!==1||trigger.effects[0].action!=='pump')return {reason:'class-attack-needs-complete-semantics-v21'};
    const amount={kind:'difference-v10',left:{kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[{what:'creature',zone:'battlefield',controller:'any',attacking:true}]},right:1};trigger.effects[0]={...trigger.effects[0],power:amount,toughness:amount};
   }
   levels.push({level:stage.level,cost:stage.cost,...section(body),levelTriggers});
  }
  const operation={kind:'class-levels-v20',levels,contract:'class-levels-v20'};
  return {...base,semanticClass:'permanent-template',implementation:[...base.implementation,operation],oracleContracts:[...new Set([...base.oracleContracts,operation.contract])],rulesCore:core};
 }
 if(card.layout==='normal'&&!card.oracleGiftCompiledV21&&/^(?:Instant|Sorcery)(?: — .+)?$/.test(card.type_line||'')){
  const core=h.stripReminderText(card.oracle_text),lines=core.split('\n'),gift=lines.find(line=>/^Gift /.test(line));
  if(gift){
   const kind={'Gift a card':'card','Gift a tapped Fish':'tapped Fish','Gift a Food':'Food','Gift a Treasure':'Treasure'}[gift];
   if(!kind||lines.filter(line=>/^Gift /.test(line)).length!==1)return {reason:'unsupported-gift-v21'};
   const text=lines.filter(line=>line!==gift).join('\n'),ordinaryText=giftBody(text,false),promisedText=giftBody(text,true);
   if(!ordinaryText||!promisedText||/\bgift (?:was|wasn't) promised\b/.test(ordinaryText+' '+promisedText))return {reason:'gift-needs-complete-branches-v21'};
   const ordinary=h.compile({...card,oracleGiftCompiledV21:true,oracle_text:ordinaryText}),promised=h.compile({...card,oracleGiftCompiledV21:true,oracle_text:promisedText});
   if(!ordinary.semanticClass||!promised.semanticClass||ordinary.semanticClass!=='spell-template'||promised.semanticClass!=='spell-template')return {reason:'gift-needs-complete-branches-v21'};
   return {semanticClass:'spell-template',implementedKeywords:[],implementation:[{kind:'gift-spell-v21',gift:kind,ordinary:section(ordinary),promised:section(promised),contract:'gift-spell-v21'}],oracleContracts:['gift-spell-v21'],rulesCore:core};
  }
 }
 if(card.layout!=='saga')return null;
 if(!/\bEnchantment\b/.test(card.type_line)||!/\bSaga\b/.test(card.type_line))return {reason:'unsupported-saga-type'};
 const core=h.stripReminderText(card.oracle_text),lines=core.split('\n').filter(Boolean),other=[],sections=[];let currentChapter=null,readAhead=false;
 for(const line of lines){
  if(line==='Read ahead'){if(readAhead)return {reason:'duplicate-read-ahead'};readAhead=true;continue;}
  const header=/^([IVX]+(?:, [IVX]+)*) — (.+)$/.exec(line);
  if(header){currentChapter={numerals:header[1].split(', '),lines:[header[2]]};sections.push(currentChapter);}
  else if(currentChapter&&line.startsWith('• '))currentChapter.lines.push(line);
  else {currentChapter=null;other.push(line);}
 }
 const chapters=[];
 for(const part of sections){
  let chapterText=normalizeAbilityWords(part.lines.join('\n'));
  const mixed=new RegExp('^(.+?) deals ('+NUMBER+') damage to each (non-[A-Z][A-Za-z-]* creature) and each opponent\\.$').exec(chapterText);
  if(mixed&&self(card,mixed[1]))chapterText=mixed[1]+' deals '+mixed[2]+' damage to each '+mixed[3]+'. '+mixed[1]+' deals '+mixed[2]+' damage to each opponent.';
  const compiled=h.compileCurrent({...card,layout:'normal',type_line:'Enchantment',card_faces:undefined,power:undefined,toughness:undefined,oracle_text:'When this enchantment enters, '+chapterText});
  if(!compiled?.semanticClass||compiled.implementation?.length!==1)return {reason:'saga-chapter-needs-complete-semantics-v21'};
  const trigger=compiled.implementation[0];
  if(trigger.kind!=='generic-trigger'||trigger.event!=='etb'||trigger.eventFilter!=='self'||trigger.zone)return {reason:'saga-chapter-needs-complete-semantics-v21'};
  const {kind,event,eventFilter,contract,...body}=trigger;
  for(const numeral of part.numerals){const n=ROMAN.indexOf(numeral)+1;if(!n||chapters[n-1])return {reason:'unsupported-saga-chapter-number'};chapters[n-1]={...body};}
 }
 if(!chapters.length||Array.from(chapters).some(chapter=>!chapter))return {reason:'unsupported-saga-chapter-sequence'};
 const base=h.compile({...card,layout:'normal',oracle_text:other.join('\n'),card_faces:undefined});
 if(!base?.semanticClass)return {reason:'saga-other-rules-unsupported'};
 const operation={kind:'saga-chapters',chapters,contract:'saga-chapters'},read={kind:'mechanic-read-ahead-v21',chapters:chapters.length,contract:'mechanic-read-ahead-v21'};
 return {...base,implementation:[...base.implementation,operation,...(readAhead?[read]:[])],oracleContracts:[...new Set([...base.oracleContracts,operation.contract,...(readAhead?[read.contract]:[])])],rulesCore:core};
}

export function extensionEffect(card,line,h){
 const mixed=new RegExp('^(.+?) deals ('+NUMBER+') damage to each (non-[A-Z][A-Za-z-]* creature) and each opponent\\.$').exec(line);
 if(mixed&&self(card,mixed[1])){const filter=h.target('target '+mixed[3]);if(filter?.zone==='battlefield'&&filter.what==='creature')return {effects:[{action:'battlefield-group',operation:'damage',filters:[filter],players:false,n:number(mixed[2])},{action:'damage',target:'each-opponent',n:number(mixed[2])}],targets:[]};}
 const exile=new RegExp('^(Exile|Look at) the top (card|('+NUMBER+'|X) cards) of (your|target opponent\'s|target player\'s|that player\'s) library( face down| and exile them face down)?\\. (.+)$').exec(line);
 if(exile){
  const inspected=exile[1]==='Look at';if(inspected&&exile[5]!==' and exile them face down')return null;
  const tail=exile[6].replace(/^For as long as it remains exiled, it has "You may cast this card from exile as long as (.+)\."$/,'For as long as it remains exiled, you may cast it if $1.'),target=exile[4].startsWith('target ')?h.target(exile[4].slice(0,-2)):null;
  const suffix=/^You may (look at and )?(play|cast) (?:it|them|that card|those cards) (for as long as (?:it remains|they remain) exiled|until the end of your next turn|this turn)\.$/.exec(tail);
  const prefix=/^(Until your next end step|For as long as (?:it remains|they remain) exiled), you may (play|cast) (?:it|them|that card|those cards)(?: if (.+))?\.$/.exec(tail);
  if(!suffix&&!prefix)return null;const condition=prefix?.[3]&&h.condition(prefix[3]);if(prefix?.[3]&&!condition)return null;
  const duration=suffix?.[3]||prefix?.[1],n=exile[2]==='card'?1:exile[3]==='X'?'X':number(exile[3]);
  return {effects:[{action:'exile-play-v21',who:target?0:exile[4]==='your'?'you':'event-player',n,faceDown:!!exile[5],look:inspected||!!suffix?.[1],spellsOnly:(suffix?.[2]||prefix?.[2])==='cast',duration:duration.startsWith('for as')||duration.startsWith('For as')?'persistent':duration==='Until your next end step'?'next-end-step':duration==='until the end of your next turn'?'next-turn':'eot',...(condition?{condition}:{})}],targets:target?[target]:[]};
 }
 if(!card.oracleTransformFacesV20&&!card.oracleFlipV20)return null;
 const blink=/^Exile (.+?), then return (it|him|her|this enchantment|this creature|this permanent) to the battlefield transformed under (your|its owner's) control\.$/.exec(line);
 if(blink&&card.oracleTransformFacesV20&&self(card,blink[1]))return {effects:[{action:'return-transformed-v20',target:'self',controller:blink[3]==='your'?'you':'owner'}],targets:[]};
 const optional=/^You may transform (.+)\.$/.exec(line);
 if(optional&&self(card,optional[1]))return {effects:[{action:'transform-self'}],targets:[],optional:true};
 const returned=new RegExp('^Return (.+?) to the battlefield( tapped)?(?: and)? (transformed|flipped)(?: under (your|its owner\'s|his owner\'s|her owner\'s) control)?(?: with ('+NUMBER+') ([a-z-]+) counters? on it)?(?: attached to (target .+))?\\.$').exec(line);
 if(returned&&self(card,returned[1])&&(returned[3]==='transformed'?card.oracleTransformFacesV20:card.oracleFlipV20)){
  const target=returned[7]&&h.target(returned[7]);if(returned[7]&&!target)return null;
  return {effects:[{action:'return-faced-source-v21',face:returned[3]==='transformed'?'back':'flip',tapped:!!returned[2],controller:returned[4]==='your'?'you':'owner',...(returned[5]?{counter:returned[6],n:number(returned[5])}:{}),...(target?{attachTarget:0}:{})}],targets:target?[target]:[]};
 }
 return null;
}

export function extensionLine(card,line,h){
 if(line==='Whenever you attack, until end of turn, target attacking creature gets +1/+1 for each other attacking creature and gains double strike.'){
  const target=h.target('target attacking creature'),count=h.count('attacking creatures');
  if(target&&count){const amount={kind:'difference-v10',left:count,right:1};return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:'your-attackers',targets:[target],effects:[{action:'pump',target:0,power:amount,toughness:amount,keywords:['double strike']}],contract:'generic-trigger-effect'};}
 }
 const turnTax=/^Spells your opponents cast during your turn cost \{([1-9][0-9]*)\} more to cast\.$/.exec(line);
 if(turnTax)return {kind:'cost-modifier',target:{what:'permanent',zone:'battlefield',controller:'any',min:1},controller:'opponents',amount:Number(turnTax[1]),condition:{kind:'your-turn'},contract:'generic-cost-modification'};
 const bonus=new RegExp('^(.+?) you control enter with (?:an additional|('+NUMBER+') additional) \\+1/\\+1 counters? on them\\.$').exec(line);
 if(bonus){const quality=bonus[1].replace(/^Legendary /,'legendary ').replace(/creatures$/,'creature').replace(/artifacts$/,'artifact'),filter=h.target('target '+quality);if(filter?.zone==='battlefield'&&filter.what==='creature')return {kind:'v8-replacement',event:'etbCounters',filters:[{...filter,controller:'you'}],n:bonus[2]?number(bonus[2]):1,contract:'ordered-replacement-effect'};}
 const waterbend=/^As an additional cost to cast this spell, waterbend \{([1-9][0-9]*)\}\.$/.exec(line);
 if(waterbend&&!/\bLand\b/.test(card.type_line))return {kind:'casting-waterbend-v21',n:Number(waterbend[1]),contract:'casting-waterbend-v21'};
 if(line==='Compleated'&&/\bPlaneswalker\b/.test(card.type_line)&&/\{[WUBRG]\/P\}/.test(card.mana_cost||'')&&!/\{[WUBRG]\/[WUBRG]\/P\}/.test(card.mana_cost||''))return {kind:'mechanic-compleated-v21',perPip:true,contract:'mechanic-compleated-v21'};
 const variable=/^This spell costs \{X\} less to cast, where X is (.+)\.$/.exec(line);
 if(variable){const count=h.value(variable[1])||h.count(variable[1]);if(count)return {kind:'self-cost-v21',n:1,count,contract:'self-cost-v21'};}
 const colored=/^This spell costs ((?:\{[WUBRGC]\})+) less to cast for each (.+)\.$/.exec(line);
 if(colored){const count=h.count(colored[2]);if(count)return {kind:'self-cost-v21',n:0,colors:colored[1].match(/[WUBRGC]/g),count,contract:'self-cost-v21'};}
 const first=/^The (first|second) (.+? )?spell you cast each turn costs \{([1-9][0-9]*)\} less to cast\.$/.exec(line);
 if(first){const quality=first[2]?.trim()||'all',filter=first[2]?h.target('target '+first[2]+'spell'):null;if(['all','creature','Dragon','kicked'].includes(quality)&&(!first[2]||filter?.zone==='stack'))return {kind:'spell-cost-sequence-v21',nth:first[1]==='first'?1:2,n:Number(first[3]),quality,...(filter?{filter}:{}),contract:'spell-cost-sequence-v21'};}
 // Unlike "transform into X or dies", a transform event is restricted to the
 // printed physical face while the death branch is restricted to the source.
 if(card.oracleTransformFacesV20){
  const match=/^When (.+?) transforms into (.+?) or dies, (.+)$/.exec(line);
  if(match&&self(card,match[1])&&match[2]===(card.oracleTransformNameV20||card.name)){
   const effect=h.effect(card,match[3]);if(effect&&!effect.v4Body)return {kind:'generic-trigger',event:['transformed','dies'],eventFilter:'self',...effect,transformNameV21:match[2],contract:'generic-trigger-effect'};
  }
 }
 return null;
}

export function modalOperation(card,text,parseEffect){
 if(!text.startsWith('Spree\n')||! /\b(?:Instant|Sorcery)\b/.test(card.type_line))return null;
 const lines=text.split('\n').slice(1),modes=[];
 for(const line of lines){const part=/^\+ ((?:\{(?:[0-9]+|[WUBRGC])\})+) — (.+)$/.exec(line);if(!part)return null;const body=parseEffect(card,part[2]);if(!body||body.v4Body||body.optional||!body.effects?.length)return null;modes.push({label:part[2],tierCostV10:part[1],body});}
 return modes.length>=2?{kind:'spell-modal-generic',choose:{min:1,max:modes.length},modes,contract:'spell-modal-generic-effect'}:null;
}

export const modifierOperation=extensionLine;
export function extensionCondition(text){
 if(text==="you've cast a noncreature spell this turn"||text==='you cast a noncreature spell this turn')return {kind:'turn-stat',field:'nonCreatureSpells',min:1};
 if(text==="you've cast another spell this turn")return {kind:'turn-stat',field:'spellsCast',min:1};
 return null;
}
