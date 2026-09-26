import {compileFaces} from './oracle-v8-faces.mjs';
// Class levels and solved Cases are permanent designations, separate from
// counters and copyable characteristics. Every printed section must compile.
const MANA=/^(?:\{(?:[0-9]+|[WUBRGC])\})+$/;
const sourceNouns=text=>text.replace(/\b(This|this) (?:Class|Case|Room)\b/g,'$1 enchantment').replace(/\b(This|this) Spacecraft\b/g,'$1 artifact').replace(/\b(This|this) Planet\b/g,'$1 land');
const STAGED=new Set(['generic-trigger','generic-ability','generic-static','mana-source','base-pt-static','v8-type-static','v8-layered-static','top-library-permission-v20','mechanic-additional-land','library-visibility-v17','mechanic-no-max-hand','hand-size-v8','permanent-counter-replacement-v20','permanent-trigger-doubler-v20','permanent-static-v20','permanent-combat-tax-v20']);
const gated=op=>STAGED.has(op.kind)||['controlled-creature-pump-static','attacking-creature-pump-static','damage-rule-v20','v8-replacement'].includes(op.kind)||['cost-modifier','cast-permission-v20','spell-cost-v20'].includes(op.kind)&&!op.self&&!op.grantFlash||op.kind==='operation-bundle'&&op.operations.every(gated);
const part=(card,text,h)=>h.compile({...card,layout:'normal',oracle_text:sourceNouns(text),card_faces:undefined});
const valid=compiled=>compiled?.semanticClass&&Array.isArray(compiled.implementation);
const section=compiled=>({implementation:compiled.implementation,implementedKeywords:compiled.implementedKeywords||[],oracleContracts:compiled.oracleContracts||[]});
const result=(card,base,operation,core)=>({...base,semanticClass:'permanent-template',implementation:[...base.implementation,operation],oracleContracts:[...new Set([...base.oracleContracts,operation.contract])],rulesCore:core});

export function extensionLine(card,line,h){
 if(card.oracleTransformFacesV20){
  const printed=card.oracleTransformNameV20||card.name,nouns=[card.name,printed,printed.split(',')[0],'this creature','this artifact','this enchantment','this land','this permanent'];
  for(const start of ['When','Whenever'])for(const noun of nouns)for(const into of nouns)for(const entry of [false,true]){
   const prefix=start+' '+noun+(entry?' enters or':'')+' transforms into '+into+', ';
   if(line.startsWith(prefix)){const parsed=h.effect(card,line.slice(prefix.length));if(parsed&&!parsed.v4Body)return {kind:'generic-trigger',event:entry?['etb','transformed']:'transformed',eventFilter:{kind:'transform-self-v20',name:printed},...parsed,contract:'generic-trigger-effect'};return null;}
  }
 }
 const unlock=card.oracleRoomDoorV20&&/^When you unlock this door, (.+)$/.exec(line);
 if(unlock){const body=h.effect(card,unlock[1]);if(body&&!body.v4Body)return {kind:'generic-trigger',event:'unlockDoor',eventFilter:'self',...body,contract:'generic-trigger-effect'};}
 const exile=/^If (.+) would be put into a graveyard from anywhere, exile it instead\.$/.exec(line);
 if(exile&&[card.name,card.name.split(',')[0],'this creature','this artifact','this enchantment','this permanent','this card'].includes(exile[1]))return {kind:'zone-replacement-v8',scope:'self',from:'any',to:'exile',contract:'ordered-zone-replacement'};
 return null;
}

export function extensionEffect(card,line,h){
 if(card.oracleTransformFacesV20){
  const counterTail=/^(.*?\. )?(?:Then )?[Ii]f (.+?), (remove (?:all of them|them|those counters) and transform (?:it|this creature|this artifact|this enchantment)|transform (?:it|this creature|this artifact|this enchantment))\.$/.exec(line);
  if(counterTail){
   const phrase=counterTail[2],count=/^(?:there are (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) or more ([a-z-]+) counters on (?:it|this creature|this artifact|this enchantment)|(?:it|this creature|this artifact|this enchantment) has (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) or more ([a-z-]+) counters on it|(?:it|this creature|this artifact|this enchantment) has no ([a-z-]+) counters on it)$/.exec(phrase);
   const before=counterTail[1]?h.effect(card,counterTail[1].trim()):{effects:[],targets:[]};
   if(count&&before&&!before.optional&&!before.v4Body&&!before.targets.length){
    const counter=count[2]||count[4]||count[5],n=({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10}[count[1]||count[3]]??Number(count[1]||count[3]));
    if(!counterTail[1]||before.effects.some(effect=>['counter','remove-counter'].includes(effect.action)&&effect.target==='self'&&effect.counter===counter))return {effects:[...before.effects,{action:'conditional',condition:{kind:'count-comparison',count:{kind:'source-counters',counter},...(count[5]?{max:0}:{min:n})},effects:[...(counterTail[3].startsWith('remove')?[{action:'remove-counters-v8',target:'self',counter,n:'all'}]:[]),{action:'transform-self'}]}],targets:[]};
   }
  }
  const exile=/^Exile (.+?), then return (?:it|him|her|that card) to the battlefield transformed under (your|its owner's|his owner's|her owner's) control\.$/.exec(line);
  if(exile&&[card.name,card.name.split(',')[0],'this creature','this artifact','this enchantment','this Saga','this permanent','this planeswalker'].includes(exile[1]))return {effects:[{action:'return-transformed-v20',target:'self',controller:exile[2]==='your'?'you':'owner'}],targets:[]};
 }
 if(!card.oracleFlipV20)return null;
 const match=/^(You may )?flip (.+)\.$/i.exec(line);
 if(match&&['it','this creature','this permanent',card.name,card.name.split(',')[0]].includes(match[2]))return {effects:[{action:'flip-permanent-v20',target:'self'}],targets:[],...(match[1]?{optional:true}:{})};
 return null;
}

export function normalizeCard(card){
 const normalize=text=>String(text||'').replace(/(Put (?:a|an|one|two|three|[0-9]+) ([a-zA-Z-]+) counters? on (this (?:enchantment|artifact|land|creature|permanent))\. )(?:Then )?[Ii]f there are ([a-z0-9]+) or more \2 counters on it, transform it\./g,'$1If there are $4 or more $2 counters on $3, transform $3.');
 return {...card,oracle_text:normalize(card.oracle_text),...(card.card_faces?{card_faces:card.card_faces.map(face=>({...face,oracle_text:normalize(face.oracle_text)}))}:{})};
}

export function compileWholeCard(card,h){
 if(card.layout==='flip'){
  if(card.card_faces?.length!==2)return {reason:'flip-needs-two-complete-faces'};
  const faces=[];
  for(const [index,face]of card.card_faces.entries()){
   const normal={...card,...face,layout:'normal',card_faces:undefined,mana_cost:card.card_faces[0].mana_cost,oracleFlipV20:true};
   for(const key of ['power','toughness','loyalty'])if(face[key]===undefined)delete normal[key];
   const body=h.compile(normal);if(!valid(body))return {reason:'flip-needs-complete-'+(index?'back':'front')+'-semantics'};
   faces.push({key:index?'back':'front',raw:h.raw(normal),semanticClass:body.semanticClass,...section(body)});
  }
  return {semanticClass:faces[0].semanticClass,implementedKeywords:[],implementation:[{kind:'flip-faces-v20',faces,contract:'flip-faces-v20'}],oracleContracts:['flip-faces-v20'],rulesCore:card.card_faces.map(f=>f.name+': '+h.stripReminderText(f.oracle_text)).join('\n')};
 }
 if(card.layout==='split'&&/\bRoom\b/.test(card.type_line)){
  if(card.card_faces?.length!==2||card.card_faces.some(face=>face.type_line!=='Enchantment — Room'||!MANA.test(face.mana_cost)))return {reason:'room-needs-two-complete-doors'};
  const doors=[];
  for(const [index,face]of card.card_faces.entries()){
   const key=index?'right':'left',body=part({...card,...face,oracleRoomDoorV20:key},h.stripReminderText(face.oracle_text),h);
   if(!valid(body)||body.implementation.some(op=>!gated(op)))return {reason:'room-door-needs-complete-semantics'};
   doors.push({key,name:face.name,cost:face.mana_cost,...section(body)});
  }
  return {semanticClass:'permanent-template',implementedKeywords:[],implementation:[{kind:'room-doors-v20',doors,contract:'room-doors-v20'}],oracleContracts:['room-doors-v20'],rulesCore:card.card_faces.map(f=>f.name+': '+h.stripReminderText(f.oracle_text)).join('\n')};
 }
 if(card.layout==='normal'&&/^(?:Station)(?: \([^\n]*\))?$/m.test(card.oracle_text||'')&&/\b(?:Spacecraft|Planet)\b/.test(card.type_line)){
  const core=h.stripReminderText(card.oracle_text),lines=core.split('\n'),baseRules=[],stages=[];let current=null;
  for(const line of lines){
   if(line==='Station')continue;
   const header=/^([1-9][0-9]*)\+ \| (.+)$/.exec(line);
   if(header){if(stages.length&&Number(header[1])<=stages.at(-1).min)return {reason:'station-tiers-must-ascend'};current={min:Number(header[1]),rules:[header[2]]};stages.push(current);}
   else (current?current.rules:baseRules).push(line);
  }
  if(!stages.length)return {reason:'station-needs-printed-tiers'};
  const base=part(card,baseRules.join('\n'),h);if(!valid(base))return {reason:'station-base-needs-complete-semantics'};
  const creature=card.power!==undefined&&card.toughness!==undefined;
  const tierCard=creature?{...card,type_line:card.type_line.replace('Artifact','Artifact Creature')}:card;
  const tiers=[];
  for(const stage of stages){const body=part(tierCard,stage.rules.join('\n'),h);if(!valid(body)||body.implementation.some(op=>!gated(op)))return {reason:'station-tier-needs-complete-semantics'};tiers.push({min:stage.min,...section(body)});}
  const operation={kind:'station-tiers-v20',creature,tiers,contract:'station-tiers-v20'};
  return {...base,implementation:[...base.implementation,operation],oracleContracts:[...base.oracleContracts,operation.contract],rulesCore:core};
 }
 if(['transform','modal_dfc'].includes(card.layout)){
  const disturbance=card.card_faces?.[0]&&h.stripReminderText(card.card_faces[0].oracle_text).split('\n').find(line=>/^Disturb /.test(line));
  if(disturbance){
   const cost=disturbance.slice(8);if(!MANA.test(cost)||card.card_faces.length!==2)return {reason:'unsupported-disturb-cost'};
   const front=card.card_faces[0],clean=h.stripReminderText(front.oracle_text).split('\n').filter(line=>line!==disturbance).join('\n');
   const compiled=compileFaces({...card,card_faces:[{...front,oracle_text:clean},card.card_faces[1]]},{...h,dayNight:true,allowLandTransition:true});
   if(!compiled.semanticClass)return compiled;
   const face=compiled.implementation[0].faces[0],operation={kind:'cast-disturb-v20',cost,contract:'cast-disturb-v20'};
   face.implementation.push(operation);face.oracleContracts.push(operation.contract);
   return compiled;
  }
  return compileFaces(card,{...h,compile:normal=>h.compile({...normal,layout:/\bSaga\b/.test(normal.type_line)?'saga':'normal',oracleTransformFacesV20:true,oracleTransformNameV20:normal.name,oracleCraftBackV20:normal.name===card.card_faces?.[1]?.name&&/^Craft with /m.test(card.card_faces?.[0]?.oracle_text||'')}),dayNight:true,allowLandTransition:true,allowModalTransform:true});
 }
 if(!['class','case'].includes(card.layout))return null;
 if(!/\bEnchantment\b/.test(card.type_line)||!MANA.test(card.mana_cost))return {reason:'unsupported-staged-enchantment'};
 const core=h.stripReminderText(card.oracle_text),lines=core.split('\n').filter(Boolean);
 if(card.layout==='class'){
  const stages=[{level:1,rules:[]}];
  for(const line of lines){
   const level=/^((?:\{[^}]+\})+): Level ([23])$/.exec(line);
   if(level){if(!MANA.test(level[1])||Number(level[2])!==stages.length+1)return {reason:'unsupported-class-level-sequence'};stages.push({level:Number(level[2]),cost:level[1],rules:[]});}
   else stages.at(-1).rules.push(line);
  }
  if(stages.length!==3)return {reason:'unsupported-class-level-sequence'};
  const base=part(card,stages[0].rules.join('\n'),h);
  if(!valid(base))return {reason:'class-base-needs-complete-semantics'};
  const levels=[];
  for(const stage of stages.slice(1)){
   const regular=[],became=[];
   for(const line of stage.rules){
    const trigger=/^When this Class becomes level ([23]), (.+)$/.exec(line);
    if(trigger){if(Number(trigger[1])!==stage.level)return {reason:'unsupported-class-level-trigger'};became.push('When this enchantment enters, '+trigger[2]);}
    else regular.push(line);
   }
   const body=part(card,regular.join('\n'),h),trigger=became.length?part(card,became.join('\n'),h):null;
   if(!valid(body)||body.implementation.some(op=>!gated(op))||trigger&&(!valid(trigger)||trigger.implementation.some(op=>op.kind!=='generic-trigger'||op.event!=='etb'||op.eventFilter!=='self')))return {reason:'class-level-needs-complete-semantics'};
   levels.push({level:stage.level,cost:stage.cost,...section(body),levelTriggers:trigger?.implementation||[]});
  }
  return result(card,base,{kind:'class-levels-v20',levels,contract:'class-levels-v20'},core);
 }
 const split=lines.findIndex(line=>line.startsWith('To solve — '));
 if(split<0||lines.filter(line=>line.startsWith('To solve — ')).length!==1||!lines[split+1]?.startsWith('Solved — '))return {reason:'unsupported-case-sections'};
 const solveText=lines[split].slice('To solve — '.length).replace(/\.$/,'');
 const cond=solveText[0].toLowerCase()+solveText.slice(1),probe=part(card,'At the beginning of your end step, if '+cond+', draw a card.',h);
 const trigger=probe.implementation?.[0];
 if(!valid(probe)||probe.implementation.length!==1||trigger.kind!=='generic-trigger'||trigger.event!=='endStep'||!trigger.condition)return {reason:'case-solve-needs-complete-condition'};
 const base=part(card,lines.slice(0,split).join('\n'),h),solved=part(card,[lines[split+1].slice('Solved — '.length),...lines.slice(split+2)].join('\n'),h);
 if(!valid(base)||!valid(solved)||solved.implementation.some(op=>!gated(op)))return {reason:'case-rules-need-complete-semantics'};
 return result(card,base,{kind:'case-solved-v20',condition:trigger.condition,...section(solved),contract:'case-solved-v20'},core);
}
