// An attachment's own effect refers to its enchanted/equipped object without targeting it.
const actions=new Set(['tap','untap','pump','damage','destroy','exile','counter','remove-counter','regenerate','return-to-hand','return-to-library','prevent-damage','cant-block-until-eot','grant-hexproof']);
export function extensionEffect(card,line,h){
 const match=/\b(enchanted|equipped) (creature|artifact|enchantment|land|permanent)\b/i.exec(line);
 if(!match||!new RegExp('\\b'+(match[1].toLowerCase()==='enchanted'?'Aura':'Equipment')+'\\b').test(card.type_line||''))return null;
 const occurrences=[...line.matchAll(/\b(enchanted|equipped) (creature|artifact|enchantment|land|permanent)\b/gi)];
 if(occurrences.length!==1)return null;
 const body=h.effect(card,line.slice(0,match.index)+'target '+match[2].toLowerCase()+line.slice(match.index+match[0].length));
 if(!body||body.targets?.length!==1||body.targets[0].zone!=='battlefield'||body.effects.some(effect=>!actions.has(effect.action)||effect.target!==0))return null;
 return {...body,targets:[],effects:body.effects.map(effect=>({...effect,target:'attached-host'}))};
}
