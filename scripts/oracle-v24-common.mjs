// Closed additions; every accepted printed body is compiled in full.
const MANA='(?:\\{(?:[0-9]+|[WUBRGC])\\})+';
export function compileWholeCard(card,h){
 const lines=h.stripReminderText(card.oracle_text||'').split('\n');
 if(card.layout==='normal'&&/^(?:Instant|Sorcery)(?: — .+)?$/.test(card.type_line||'')&&lines.filter(line=>line==='Epic').length===1){
  const base=h.compileCurrent({...card,oracle_text:lines.filter(line=>line!=='Epic').join('\n')});
  if(!base.semanticClass||!base.implementation.length||!base.implementation.every(op=>/^spell-/.test(op.kind)))return null;
  return {...base,implementation:[{kind:'spell-epic-v24',body:{implementation:base.implementation},contract:'spell-epic-v24'}],oracleContracts:['spell-epic-v24']};
 }
 const pattern=new RegExp('^('+MANA+'), \\{T\\}: This creature loses this ability and becomes an Aura enchantment with enchant creature\\. Attach it to target creature\\. You may pay ('+MANA+') to end this effect\\.$');
 const changes=lines.map(line=>pattern.exec(line)).filter(Boolean);
 if(card.layout!=='normal'||!/\bCreature\b/.test(card.type_line||'')||changes.length!==1)return null;
 const header=changes[0],rest=lines.filter(line=>line!==header[0]);
 if(!rest.length)return null;
 const base=h.compileCurrent({...card,type_line:'Enchantment — Aura',oracle_text:['Enchant creature',...rest].join('\n')});
 if(!base.semanticClass||base.implementation.filter(op=>op.kind==='aura-target').length!==1)return null;
 const attached=base.implementation.filter(op=>op.kind!=='aura-target');
 if(!attached.length)return null;
 return {semanticClass:'creature-template',implementedKeywords:[],implementation:[{kind:'mechanic-licid-v24',cost:header[1],endCost:header[2],contract:'mechanic-licid-v24'},...attached],oracleContracts:[...new Set(['mechanic-licid-v24',...attached.map(op=>op.contract)])]};
}

const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function extensionEffect(card,line,h){
 if(line==="Search target player's library for X cards, where X is the number of cards in your hand, and exile them. That player shuffles.")return {targets:[{what:'player',zone:'player',controller:'any',min:1}],effects:[{action:'search-target-library-v24',target:0,quantity:'hand-count',destination:'exile',types:null}],optional:false};
 if(line==="Search target opponent's library for an artifact, creature, enchantment, or land card. Put that card onto the battlefield under your control. That player shuffles.")return {targets:[{what:'player',zone:'player',controller:'opponent',min:1}],effects:[{action:'search-target-library-v24',target:0,quantity:1,destination:'battlefield',types:['Artifact','Creature','Enchantment','Land']}],optional:false};
 const flames=new RegExp("^Exile cards from the top of your library until you exile a nonland card\\. "+escape(card.name)+" deals damage to any target equal to that card's mana value\\.$").exec(line);
 if(flames){const target={what:'any target',zone:'battlefield',controller:'any',min:1};if(target)return {targets:[target],effects:[{action:'exile-until-nonland-hit-v24',target:0}],optional:false};}
 return null;
}
