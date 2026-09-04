// Closed public-object qualifiers. Each qualifier is retained in the target
// descriptor and rechecked both when choosing and when resolving targets.
export function extensionTarget(text,h){
 let m=/^(target (?:.+? )?spell) that targets (you|a player|a creature|an enchantment|a permanent you control|a creature you control|you or a permanent you control)$/.exec(text);
 if(m){const base=h.target(m[1]);if(base?.zone==='stack'){
  const refs={'you':{what:'player',zone:'player',controller:'you'},'a player':{what:'player',zone:'player',controller:'any'},'a creature':{what:'creature',zone:'battlefield',controller:'any'},'an enchantment':{what:'enchantment',zone:'battlefield',controller:'any'},'a permanent you control':{what:'permanent',zone:'battlefield',controller:'you'},'a creature you control':{what:'creature',zone:'battlefield',controller:'you'}};
  return {...base,targetsObject:refs[m[2]]||{what:'any',zone:'battlefield',controller:'you'}};
 }}
 m=/^(.*?target Aura) attached to (a creature|a land|a creature you control)$/.exec(text);
 if(m){const base=h.target(m[1]),host=h.target('target '+m[2].replace(/^a /,''));if(base?.zone==='battlefield'&&host?.zone==='battlefield')return {...base,attachedHost:host};}
 m=/^(.*?target .+?) with no counters(?: on (?:it|them))?$/.exec(text);
 if(m){const base=h.target(m[1]);if(base?.zone==='battlefield')return {...base,noCounters:true};}
 m=/^(.*?target .+?) that(?:'s| is| are) one or more colors$/.exec(text);
 if(m){const base=h.target(m[1]);if(base&&base.zone!=='stack')return {...base,notColor:'colorless'};}
 m=/^(.*?target .+?) that (?:isn't|aren't|is not|are not) all colors$/.exec(text);
 if(m){const base=h.target(m[1]);if(base?.zone==='battlefield')return {...base,notAllColors:true};}
 return null;
}
export function extensionEffect(card,line,h){
 const each=/^Destroy each (creature|artifact|enchantment|land|permanent) (.+)\.$/.exec(line);
 if(each)return h.effect(card,'Destroy all '+each[1]+'s '+each[2]+'.');
 return null;
}
