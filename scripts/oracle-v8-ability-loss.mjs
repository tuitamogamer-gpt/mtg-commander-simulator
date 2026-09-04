import {ORACLE_SUBTYPES,ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
const colors={white:'W',blue:'U',black:'B',red:'R',green:'G',colorless:null};
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function characteristics(text){
  const match=/^(?:a |an )?(.+?) with base power and toughness (\d+)\/(\d+)$/.exec(text);
  if(!match)return null;
  let type=match[1],color=[];
  const paint=/^(white|blue|black|red|green|colorless)(?: and (white|blue|black|red|green))? (.+)$/.exec(type);
  if(paint){color=[colors[paint[1]],colors[paint[2]]].filter(Boolean);type=paint[3];}
  let types;
  if(/ artifact creature$/.test(type)){types=['Artifact','Creature'];type=type.replace(/ artifact creature$/,'');}
  else if(/ creature$/.test(type)){types=['Creature'];type=type.replace(/ creature$/,'');}
  const subtypes=type.split(' ');
  if(!subtypes.length||subtypes.some(value=>!ORACLE_SUBTYPES.has(value)||ORACLE_SUBTYPE_TYPES[value]))return null;
  return {power:Number(match[2]),toughness:Number(match[3]),subtypes,...(types?{types}:{}),...(paint?{colors:color}:{})};
}
function tail(text,helpers){
  if(!text)return {keywords:[]};
  const base=/^ and (?:has|have) base power and toughness (\d+)\/(\d+)$/.exec(text);
  if(base)return {power:Number(base[1]),toughness:Number(base[2]),keywords:[]};
  const type=/^ and (?:is|becomes?) (.+)$/.exec(text);
  if(type){const change=characteristics(type[1]);if(change)return {...change,keywords:[]};}
  const gain=/^ and gains? (.+)$/.exec(text);
  if(gain){const keywords=helpers.keywordList?.(gain[1]);if(keywords)return {keywords};}
  return null;
}
export function lossLine(card,line,helpers={}){
  if(!/los(?:e|es) all (?:other )?abilities/.test(line))return null;
  let operation=null;
  let match=/^Enchanted creature loses all abilities(.*?)\.$/.exec(line);
  if(match){const change=tail(match[1],helpers);if(change)operation={attached:true,...change};}
  match=/^Enchanted creature gets ([+-]\d+)\/([+-]\d+) and loses all abilities\.$/.exec(line);
  if(match)operation={attached:true,dp:Number(match[1]),dt:Number(match[2]),keywords:[]};
  match=/^Enchanted creature (?:is (.+)|has base power and toughness (\d+)\/(\d+))(?:,|\. It) has (defender|indestructible)(?:,? and| and| and it|,) loses all other abilities\.$/.exec(line);
  if(match){const change=match[1]?characteristics(match[1]):{power:Number(match[2]),toughness:Number(match[3])};if(change)operation={attached:true,...change,keywords:[match[4]]};}
  match=/^Enchanted creature is (.+) and loses all abilities\.$/.exec(line);
  if(match){const change=characteristics(match[1]);if(change)operation={attached:true,...change,keywords:[]};}
  if(line==='Enchanted creature loses all abilities and can\'t become untapped.')operation={attached:true,cantUntap:true,keywords:[]};
  match=/^Enchanted creature is (.+)\. It can't attack and loses all abilities\.$/.exec(line);
  if(match){const change=characteristics(match[1]);if(change)operation={attached:true,...change,cantAttack:true,keywords:[]};}
  if(line==='Enchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.')operation={attached:true,power:0,toughness:1,types:['Artifact','Creature'],subtypes:['Insect'],keywords:['indestructible']};
  if(line==='Enchanted creature has base power and toughness 0/4, has defender, loses all other abilities, and is a blue Wall in addition to its other colors and types.')operation={attached:true,power:0,toughness:4,subtypes:['Wall'],colors:['U'],retainSubtypes:true,retainColors:true,keywords:['defender']};
  match=/^(.+? creatures|Creatures) lose all abilities(.*?)\.$/.exec(line);
  if(match){
    const change=tail(match[2],helpers),noun=match[1].replace(/^Creatures$/,'creature').replace(/ creatures$/,' creature'),target=helpers.target?.('target '+noun);
    if(change&&target?.zone==='battlefield')operation={filters:[target],...change};
  }
  return operation?{kind:'v8-ability-loss-static',contract:'continuous-ability-removal',...operation}:null;
}
export function lossEffect(card,line,helpers={}){
  if(!/los(?:e|es) all abilities/.test(line))return null;
  let text=line.replace(/\.$/,''),temporary=false;
  if(/^Until end of turn, /i.test(text)){temporary=true;text=text.replace(/^Until end of turn, /i,'');}
  if(/ until end of turn$/.test(text)){if(temporary)return null;temporary=true;text=text.replace(/ until end of turn$/,'');}
  let match=/^(.+?) becomes? (.+), loses all abilities, and gains? (.+)$/.exec(text),subject,change;
  if(match){subject=match[1];const type=characteristics(match[2]),keywords=helpers.keywordList?.(match[3]);if(type&&keywords)change={...type,keywords};}
  else{match=/^(.+?) loses? all abilities(.*)$/.exec(text);if(match){subject=match[1];change=tail(match[2],helpers);}}
  if(!change)return null;
  const own=new RegExp('^(?:this (?:creature|artifact|enchantment|permanent)|'+escape(card.name)+')$','i').test(subject);
  const group=/^(?:each creature|creatures) (target (?:player|opponent)) controls$/.exec(subject);
  const global=/^creatures (you|your opponents) control$/i.exec(subject);
  let target=own?null:helpers.target?.(group?group[1]:subject);
  const filters=global?[{what:'creature',zone:'battlefield',controller:global[1]==='you'?'you':'opponent'}]:null;
  if(!own&&!filters&&target?.zone!=='battlefield'&&!group)return null;
  if(group&&!['player','opponent'].includes(target?.what))return null;
  if(own&&/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return null;
  return {targets:filters||own?[]:[target],effects:[{action:'ability-loss-v8',...change,temporary,...(filters?{filters}:group?{target:0,controlledCreatures:true}:{target:own?'self':0})}]};
}
