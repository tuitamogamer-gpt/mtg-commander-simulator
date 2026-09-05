import * as kicker from './oracle-v8-kicker-replacements.mjs';
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
const escape=text=>String(text).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const complete=body=>body&&!body.optional&&!body.v4Body&&Array.isArray(body.targets)&&Array.isArray(body.effects)&&body.effects.length;
const bound=node=>!/"event-|"X"/.test(JSON.stringify(node));
const shift=(node,n)=>Array.isArray(node)?node.map(x=>shift(x,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,(['target','who','otherTarget','conditionTarget'].includes(key)||key==='index'&&['target-controller','target-owner'].includes(node.kind))&&typeof value==='number'?value+n:shift(value,n)])):node;
function condition(text,h){
 const c=h.condition(text);if(!c||!bound(c)||/^(?:it|its|that|they|those)\b/.test(text))return null;
 const known=node=>node.kind==='has-permanent'?['artifact','creature','enchantment','land','permanent','planeswalker','commander','token'].includes(node.what.toLowerCase())||ORACLE_SUBTYPES.has(node.what):node.kind==='not'?known(node.condition):['all','any'].includes(node.kind)?node.conditions.every(known):true;
 if(!known(c))return null;
 return c;
}
export function extensionEffect(card,line,h){
 if(line.includes('"'))return null;
 const beforeCondition=/^(.+)\. If ([^,.]+), (?:instead (.+)|(.+) instead)\.$/.exec(line);
 if(beforeCondition){
   const body=(beforeCondition[3]||beforeCondition[4]).replace(/^only you /,'you ');
   return extensionEffect(card,beforeCondition[1]+'. '+body+' instead if '+beforeCondition[2]+'.',h);
 }

 const replacement=/^(.+)\. (.+) instead if ([^.]+)\.$/.exec(line);
 if(replacement){
  const c=condition(replacement[3],h);if(!c)return null;
  let changed=replacement[2].replace(new RegExp('^'+escape(card.name)+' deals '),'it deals ');
  const body=kicker.extensionEffect(card,replacement[1]+'. If this spell was kicked, '+changed+' instead.',h);
  if(!complete(body)||body.effects.length!==1||body.effects[0].action!=='conditional'||body.effects[0].condition?.kind!=='kicked')return null;
  return {...body,effects:[{...body.effects[0],condition:c}]};
 }
 const parts=line.split(/\. /),last=parts.at(-1);
 let otherwise=null,index=parts.length-1;
 if(last.startsWith('Otherwise, ')){otherwise=last.slice(11);index--;}
 if(index<0)return null;
 const tail=parts[index].replace(/\.$/,''),match=/^(.+?) (if|unless) (.+)$/.exec(tail);
 if(!match||/\binstead\b|^if |^If |^Whenever |^When |^At |^Activate /.test(match[1]))return null;
 const c=condition(match[3],h);if(!c)return null;
 const yes=h.effect(card,match[1].replace(/^Then /,'')+'.'),no=otherwise?h.effect(card,otherwise):{targets:[],effects:[]};
 if(!complete(yes)||!no||no.optional||no.v4Body||no.targets.length||!bound(yes.effects)||!bound(no.effects))return null;
 const prefix=index?h.effect(card,parts.slice(0,index).join('. ')+'.'):{targets:[],effects:[]};
 if(!prefix||prefix.optional||prefix.v4Body)return null;
 return {targets:[...prefix.targets,...yes.targets],effects:[...prefix.effects,{action:'conditional',condition:match[2]==='unless'?{kind:'not',condition:c}:c,effects:shift(yes.effects,prefix.targets.length),...(no.effects.length?{elseEffects:no.effects}:{})}],optional:false};
}
