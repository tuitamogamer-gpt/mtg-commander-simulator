const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extensionEffect(card,line,h){
 const aliases=[card.name,String(card.name).split(/,| the /)[0]];
 if(/^Legendary\b/.test(card.type_line||''))aliases.push(String(card.name).split(' ')[0]);
 const self='(?:this (?:creature|artifact|enchantment|permanent|Equipment|Vehicle|Saga)|'+[...new Set(aliases)].map(escape).join('|')+')';
 const follow=new RegExp('^(.+?)\\. That creature (can\'t attack or block for as long as you control '+self+')\\.$','i').exec(line);
 if(follow){const head=h.effect(card,follow[1]+'.'),tail=h.effect(card,'Target creature '+follow[2]+'.'),target=head?.effects.at(-1)?.target;if(!head||!tail||head.optional||tail.optional||typeof target!=='number'||tail.effects.length!==1)return null;return{...head,effects:[...head.effects,{...tail.effects[0],target}]};}
 const m=new RegExp('^(.+?) for as long as you control '+self+'(?: and '+self+' remains (tapped))?\\.$','i').exec(line);
 if(!m)return null;
 const body=h.effect(card,m[1]+' until end of turn.');
 if(!body||body.effects.length!==1)return null;
 const child=body.effects[0];
 if(!['gain-control','pump','grant-operation','combat-restriction'].includes(child.action))return null;
 return {...body,effects:[{...child,duration:m[2]?'source-controlled-tapped':'source-controlled'}]};
}
