const words={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,fifty:50};
const upper=text=>text[0].toUpperCase()+text.slice(1);
const shift=(node,n)=>Array.isArray(node)?node.map(child=>shift(child,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','otherTarget','who','conditionTarget'].includes(key)&&typeof value==='number'?value+n:shift(value,n)])):node;
export function fixedAmount(text){
 if(/^(?:\{E\})+$/.test(text))return text.length/3;
 const match=/^(one|two|three|four|five|six|seven|eight|nine|ten|fifty|\d+) \{E\}$/.exec(text);
 return match?(words[match[1]]??Number(match[1])):null;
}
export function extensionEffect(card,line,h){
 if(!line.includes('{E}')||line.includes('\n')||/51000001\d/.test(line))return null;
 line=upper(line.replace(/\s+/g,' ').replace(/\s+([.,])/g,'$1'));
 const reflexive=/^You may pay (.+?)\. When you do, (.+)$/.exec(line);
 if(reflexive){const n=fixedAmount(reflexive[1]),body=h.effect(card,upper(reflexive[2]));if(n===null||!body||body.v4Body||!Array.isArray(body.effects))return null;return {targets:[],effects:[{action:'reflexive-cost',cost:{energy:n},reflexiveBody:body}]};}
 const payment=/^(?:You may pay|Pay) (.+?)\. (If you do|If you pay|If you can't), (.+)$/.exec(line);
 if(payment){
  const n=fixedAmount(payment[1]),body=h.effect(card,upper(payment[3]));if(n===null||!body||body.optional||body.v4Body)return null;
  if(!line.startsWith('You may')&&payment[2]!=="If you can't")return null;
  return {targets:body.targets,effects:[{action:'pay-energy-v8',n,optional:line.startsWith('You may'),effects:payment[2]==="If you can't"?[]:body.effects,...(payment[2]==="If you can't"?{elseEffects:body.effects}:{})}]};
 }
 const unless=/^(.+?) unless you pay (.+?)\.$/.exec(line);
 if(unless){const n=fixedAmount(unless[2]),body=h.effect(card,upper(unless[1])+'.');if(n!==null&&body&&!body.optional&&!body.v4Body)return {targets:body.targets,effects:[{action:'pay-energy-v8',n,optional:true,effects:[],elseEffects:body.effects}]};}
 const gain=/^(?:You )?get (.+?)\.$/i.exec(line);
 if(gain){
  let n=fixedAmount(gain[1]);
  if(n===null){
   if(gain[1]==='X {E}')n='X';
   else if(gain[1]==='that many {E}')n={kind:'event-amount'};
   else{const dynamic=/^an amount of \{E\} equal to (.+)$/.exec(gain[1]),each=/^\{E\} for each (.+)$/.exec(gain[1]);n=dynamic?h.value?.(dynamic[1]):each?h.count?.(each[1]):null;}
  }
  if(n!==null&&n!==undefined)return {targets:[],effects:[{action:'gain-energy-v8',who:'you',n}]};
 }
 // Compound Oracle sentences retain their normal punctuation and targeting;
 // substitute only closed, fixed energy clauses with distinct scalar leaves.
 const values=[],rewritten=line.replace(/\b(?:[Yy]ou )?get ((?:\{E\})+|(?:one|two|three|four|five|six|seven|eight|nine|ten|fifty|\d+) \{E\})(?=[,.]| and )/g,(_,text)=>{
  const n=fixedAmount(text);values.push(n);return 'you gain '+(510000010+values.length)+' life';
 });
 if(values.length){
  const body=h.effect(card,upper(rewritten));if(!body||body.optional||body.v4Body)return null;
  const seen=new Set();
  const replace=node=>Array.isArray(node)?node.map(replace):node&&typeof node==='object'?node.action==='gain-life'&&node.who==='you'&&values[node.n-510000011]!==undefined?(seen.add(node.n),{action:'gain-energy-v8',who:'you',n:values[node.n-510000011]}):Object.fromEntries(Object.entries(node).map(([key,value])=>[key,replace(value)])):node;
  const result=replace(body);if(seen.size!==values.length||/51000001\d/.test(JSON.stringify(result)))return null;
  return result;
 }
 // A leading ordinary instruction must finish before the optional payment.
 const next=/^(.+?)(?:\. |, then )(you may pay .+)$/i.exec(line);
 if(next){const first=h.effect(card,upper(next[1])+'.'),last=extensionEffect(card,upper(next[2]),h);if(first&&!first.optional&&!first.v4Body&&last)return {targets:[...first.targets,...last.targets],effects:[...first.effects,...shift(last.effects,first.targets.length)]};}
 return null;
}
export function extensionLine(card,line,h){
 if(line.includes('\n'))return null;
 line=line.replace(/\s+/g,' ').replace(/\s+([.,])/g,'$1');
 const match=/^Whenever you get one or more \{E\}( during your turn)?, (.+)$/.exec(line);if(!match)return null;
 const body=h.effect(card,upper(match[2]));if(!body||body.optional||body.v4Body)return null;
 return {kind:'generic-trigger',event:'energyGained',eventFilter:match[1]?{kind:'energy-gain-v8',duringYourTurn:true}:'your-player',...body,contract:'generic-trigger-effect'};
}
