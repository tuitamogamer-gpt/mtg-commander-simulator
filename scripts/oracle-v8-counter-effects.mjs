const numbers={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extensionEffect(card,line,h){
 const match=/^Remove (all|a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:(\+\d+\/\+\d+|-\d+\/-\d+|[a-z]+(?: [a-z]+)?) )?counters? from (.+)\.$/i.exec(line);
 if(!match)return null;
 const n=match[1].toLowerCase()==='all'?'all':numbers[match[1].toLowerCase()]??Number(match[1]),counter=match[2]?.toLowerCase()||null;
 if(n!=='all'&&(!Number.isSafeInteger(n)||n<1||n>10)||!counter&&n!=='all'&&n!==1)return null;
 const self=new RegExp('^(?:this creature|this artifact|this enchantment|this land|this permanent|'+escape(card.name)+')$','i').test(match[3]);
 if(self)return{targets:[],effects:[{action:'remove-counters-v8',target:'self',counter,n}]};
 const target=/\btarget\b/.test(match[3])?h.target(match[3]):null;
 if(target?.zone==='battlefield'&&!['any','player','opponent'].includes(target.what))return{targets:[target],effects:[{action:'remove-counters-v8',target:0,counter,n}]};
 const group=/^(?:all|each) (.+)$/.exec(match[3]);
 if(group){
  const noun=group[1].replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers)\b/g,word=>word.slice(0,-1));
  const filter=h.target('target '+noun);
  if(filter?.zone==='battlefield'&&!['any','player','opponent'].includes(filter.what))return{targets:[],effects:[{action:'remove-counters-v8',filters:[filter],counter,n}]};
 }
 return null;
}
