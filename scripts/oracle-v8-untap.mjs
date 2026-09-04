const escape=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function self(card){return '(?:this (?:creature|artifact|enchantment|permanent|Equipment)|'+[...new Set([card.name,String(card.name).split(/,| the /)[0]])].map(escape).join('|')+')';}
export function extensionEffect(card,line,h){
 const tail=new RegExp("^(Tap .+?)\\. (?:It|That (?:creature|artifact|land|permanent)|They|Those (?:creatures|artifacts|lands|permanents)) (?:doesn't|don't) untap during (?:its controller's untap step|their controllers' untap steps) for as long as (you control "+self(card)+"|"+self(card)+" remains (tapped|on the battlefield))\\.$",'i').exec(line);
 if(!tail)return null;
 const body=h.effect(card,tail[1]+'.');if(!body||body.optional||body.effects?.length!==1)return null;
 const mode=tail[2].toLowerCase().startsWith('you control')?'controlled':tail[3].toLowerCase()==='tapped'?'tapped':'battlefield';
 const first=body.effects[0],effect={action:'linked-untap-v8',mode};
 if(first.action==='tap')return{...body,effects:[first,{...effect,target:first.target}]};
 if(first.action==='battlefield-group'&&(first.operation==='tap'||first.effects?.length===1&&first.effects[0].action==='tap'))return{...body,effects:[{action:'group-sequence',filters:first.filters,effects:[{action:'tap',target:'affected-group'},{...effect,target:'affected-group'}]}]};
 return null;
}
