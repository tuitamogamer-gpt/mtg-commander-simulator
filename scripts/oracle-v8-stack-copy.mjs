// Explicit Stack references; copy choices are inherited by the existing engine
// copy APIs, rather than recasting or paying the original spell/ability cost.
import {modifications} from './oracle-v8-copies.mjs';
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
function extraCopy(card,line,h){
 const normalized=line.replace(new RegExp('(?<=copy )'+card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?= |\\.)','g'),'that spell').replace(/(?<=copy )this spell(?= |\.)/gi,'that spell')
  .replace(/ and (?:you )?may choose (?:a new target|new targets) for the copy\.$/i,'. You may choose new targets for the copy.')
  .replace(/\. You may choose a new target for the copy\.$/i,'. You may choose new targets for the copy.');
 if(normalized!==line)return extensionEffect(card,normalized,h);
 const match=/^(You may )?copy (it|that spell|the spell|that ability)(?: (twice|X times|for each (.+?)))?(?:, except (.+?))?\.(?: You may choose new targets for the (copy|copies)\.)?$/i.exec(line);
 if(!match)return null;
 const n=match[4]?h.count?.(match[4].replace(/^time /,'times ')):match[3]==='twice'?2:match[3]==='X times'?'X':1;
 const mod=modifications(card,(match[5]||'').replace(/^the copy /,'it '),h);
 if(n===null||n===undefined||!mod||Object.keys(mod).some(key=>!['nonlegendary','power','toughness','addTypes','addSubtypes','colors','keywords'].includes(key)))return null;
 return{targets:[],optional:!!match[1],effects:[{action:'copy-stack-v8',target:'event-stack-object-v8',kind:match[2]==='that ability'?'ability':match[2]==='it'?'either':'spell',n,retarget:!!match[6],...(Object.keys(mod).length?{modifications:mod}:{})}]};
}
export function extensionTarget(text){
 const sharedTypes=/^target ([A-Z][A-Za-z'-]+) or ([A-Z][A-Za-z'-]+) (creature|permanent) spell( you control| an opponent controls)?$/.exec(text);
 if(sharedTypes&&ORACLE_SUBTYPES.has(sharedTypes[1])&&ORACLE_SUBTYPES.has(sharedTypes[2]))return {what:'spell',zone:'stack',controller:sharedTypes[4]===' you control'?'you':sharedTypes[4]?'opponent':'any',min:1,spellFilter:{what:'card',zone:'graveyard',controller:'any',alternatives:sharedTypes.slice(1,3).map(subtype=>({what:sharedTypes[3],zone:'graveyard',controller:'any',subtype}))}};
 const shared=/^target (multicolored|monocolored|colorless|white|blue|black|red|green) instant or sorcery spell( you control| an opponent controls)?$/.exec(text);
 if(shared)return {what:'spell',zone:'stack',controller:shared[2]===' you control'?'you':shared[2]?'opponent':'any',min:1,spellFilter:{what:'card',zone:'graveyard',controller:'any',min:1,alternatives:['instant','sorcery'].map(what=>({what,zone:'graveyard',controller:'any',min:1,color:shared[1]}))}};

 const match=/^target (activated or triggered|activated|triggered) ability( you control)?(?: from (a colorless|a creature|an enchantment) source)?$/.exec(text);
 if(!match)return null;
 return {what:'stack-ability',zone:'stack',controller:match[2]?'you':'any',min:1,
  abilityKinds:match[1]==='activated or triggered'?['ability','trigger']:[match[1]==='activated'?'ability':'trigger'],
  ...(match[3]?{sourceQuality:match[3]==='a colorless'?'colorless':match[3]==='a creature'?'Creature':'Enchantment'}:{})};
}
export function extensionEffect(card,line,helpers={}){
 const delayed=/^When you next cast (an? (?:instant or sorcery|instant|sorcery|Lesson) spell(?: with mana value \d+ or less)?) this turn, copy (?:it|that spell)(?: (twice|X times|an additional time))?(?:\. You may choose| and you may choose) new targets for the (copy|copies)\.$/i.exec(line);
 if(delayed){
  const filter=helpers.target?.('target '+delayed[1].replace(/^an? /,''));
  if(!filter||filter.what!=='spell'||filter.zone!=='stack'||delayed[2]&&delayed[2]!=='an additional time'&&delayed[3]!=='copies')return null;
  return {targets:[],effects:[{action:'delay-stack-copy-v8',filter,n:delayed[2]==='twice'?2:delayed[2]==='X times'?'X':1,retarget:true}]};
 }
 const match=/^(You may )?copy (target .+?|it|that spell|the spell|that ability)(?: (twice|X times))?\. You may choose new targets for the (copy|copies)\.$/i.exec(line);
 if(!match||match[3]&&match[4].toLowerCase()!=='copies')return extraCopy(card,line,helpers);
 const n=match[3]?.toLowerCase()==='twice'?2:match[3]?'X':1,phrase=match[2];
 if(/^target /.test(phrase)){
  const target=extensionTarget(phrase)||helpers.target?.(phrase);
  if(!target||target.zone!=='stack'||!['spell','stack-ability'].includes(target.what))return null;
  return {targets:[target],optional:!!match[1],effects:[{action:'copy-stack-v8',target:0,kind:target.what==='spell'?'spell':'ability',n,retarget:true}]};
 }
 return {targets:[],optional:!!match[1],effects:[{action:'copy-stack-v8',target:'event-stack-object-v8',kind:phrase.toLowerCase()==='that ability'?'ability':phrase.toLowerCase()==='it'?'either':'spell',n,retarget:true}]};
}
export function boundReferences(node,scope=null){
 if(!node||typeof node!=='object')return true;
 if(Array.isArray(node))return node.every(value=>boundReferences(value,scope));
 if(node.kind==='generic-trigger')scope=node;
 else if(['generic-ability','spell-generic','spell-modal-generic','adventure-face'].includes(node.kind))scope=null;
 if(node.action==='copy-stack-v8'&&node.target==='event-stack-object-v8'){
  const allowed=node.kind==='ability'?['abilityActivated']:node.kind==='spell'?['cast','castIS','castNonCreature','castCreature','spellCopied']:['cast','castIS','castNonCreature','castCreature','spellCopied','abilityActivated'];
  if(!scope||![].concat(scope.event).every(event=>allowed.includes(event)))return false;
 }
 return Object.values(node).every(value=>boundReferences(value,scope));
}
export function extensionLine(card,line,helpers={}){
 const castHeaders=[
  [/^Whenever you cast an Adventure instant or sorcery spell, (.+)$/,{adventure:true,quality:'instant or sorcery'}],
  [/^Whenever you cast an instant or sorcery spell that targets only this creature, (.+)$/,{selfTargetOnly:true,quality:'instant or sorcery'}],
  [new RegExp('^Whenever you cast a spell while '+card.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' is attacking, (.+)$'),{sourceAttacking:true}],
 ];
 for(const [pattern,rule]of castHeaders){const match=pattern.exec(line);if(!match)continue;const body=helpers.effect(card,match[1]);if(!body)return null;
  const {quality,...filter}=rule;return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'stack-copy-cast-v8',...filter,...(quality?{target:helpers.target('target '+quality+' spell')}:{})},targets:body.targets,optional:!!body.optional,effects:body.effects,contract:'generic-trigger-effect'};
 }
 const headers=[
  [/^Whenever you activate an ability, if it isn't a mana ability, (.+)$/,{}],
  [/^Whenever you activate an ability of an artifact, if it isn't a mana ability, (.+)$/,{sourceTypes:['Artifact']}],
  [/^Whenever an ability of equipped creature is activated, if it isn't a mana ability, (.+)$/,{attached:true}],
  [/^Whenever you activate a loyalty ability of a Chandra planeswalker, (.+)$/,{sourceTypes:['Planeswalker'],loyalty:true,sourceSubtype:'Chandra'}],
  [/^Whenever you activate an ability of an artifact or creature that isn't a mana ability, if one or more permanents were sacrificed to activate it, (.+)$/,{sourceTypes:['Artifact','Creature'],sacrificed:true}],
 ];
 for(const [pattern,rule]of headers){const match=pattern.exec(line);if(!match)continue;const body=helpers.effect(card,match[1]);if(!body)return null;
  return {kind:'generic-trigger',event:'abilityActivated',eventFilter:{kind:'stack-copy-activation-v8',...rule},targets:body.targets,optional:!!body.optional,effects:body.effects,contract:'generic-trigger-effect'};
 }
 return null;
}
