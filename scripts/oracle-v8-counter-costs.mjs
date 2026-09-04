const NUM='(?:a|an|one|two|three|[1-3])';
const number=text=>({a:1,an:1,one:1,two:2,three:3}[text]||Number(text));
const counter=/^(?:[+-][0-9]+\/[+-][0-9]+|[a-z]+(?: [a-z]+)*)$/;
export function extensionCost(text,h,card){
 const start=String(text).search(/(?:^|, )Remove /);if(start<0||typeof h.priorCost!=='function'||typeof h.target!=='function')return null;
 const prefix=text.slice(0,start),atom=text.slice(start).replace(/^, /,'');
 let n,kinds,subject,m;
 if((m=/^Remove a (.+) counter or a (.+) counter from (.+)$/.exec(atom))){n=1;kinds=m.slice(1,3);subject=m[3];if(!kinds.every(kind=>counter.test(kind)))return null;}
 else if((m=new RegExp('^Remove ('+NUM+') (?:(.+) )?counters? from (.+)$').exec(atom))){n=number(m[1]);kinds=m[2]?[m[2]]:null;subject=m[3];if(kinds&&!kinds.every(kind=>counter.test(kind)))return null;}
 else return null;
 const selfNames=['this creature','this artifact','this enchantment','this permanent',card?.name,card?.name?.split(/,| the /)[0]].filter(Boolean);
 const self=selfNames.includes(subject),among=subject.startsWith('among ');let filter;
 if(!self){
  if(!subject.endsWith(' you control'))return null;
  let noun=subject.replace(/^among /,'').replace(/^(?:a|an) /,'').replace(/ you control$/,'');
  const other=noun.startsWith('another ');noun=noun.replace(/^another /,'');
  noun=noun.replace(/\b(creatures|artifacts|permanents|lands|enchantments|planeswalkers)\b/g,word=>word.slice(0,-1));
  if(noun.includes(', '))noun=noun.replace(/, or /g,' or ').replace(/, /g,' or ');
  filter=h.target('target '+noun+' you control');if(!filter||filter.zone!=='battlefield')return null;
  if(other)filter={...filter,excludeSelf:true};
 }
 const base={};
 if(prefix){
  const pieces=prefix.split(', ');if(pieces.length>2)return null;
  for(const part of pieces){if(part==='{T}'&&!base.tap)base.tap=true;else if(!base.mana&&/^(?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+$/.test(part))base.mana=part;else return null;}
 }
 return{...base,oracleCounterPayment:{n,kinds,self,among,...(filter?{filter}:{})}};
}
