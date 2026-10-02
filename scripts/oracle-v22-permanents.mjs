// Additive closed permanent rules. Earlier descriptors remain frozen.
const complete=op=>op&&!op.optional&&!op.v4Body&&Array.isArray(op.effects)&&Array.isArray(op.targets);
const rule=(mode,extra={})=>({kind:'permanent-name-rule-v22',mode,...extra,contract:'permanent-name-rule-v22'});
export function extensionLine(card,line,h){
 if(/\bEquipment\b/.test(card.type_line||'')){
  const quoted=/^(Equipped creature (?:gets [+-][0-9]+\/[+-][0-9]+ and has|has)(?: [a-z ]+ and)?) "([^"]+)"\.?$/.exec(line);
  if(quoted){
   const parts=quoted[2].split(': '),atom='Unattach '+card.name;
   if(parts.length===2&&parts[0].split(', ').includes(atom)){
    const costText=parts[0].split(', ').filter(text=>text!==atom).join(', '),head=quoted[1].replace(/ and has$/,'').replace(/ has$/,'').replace(/ and$/,'');
    const grant=head==='Equipped creature'?{kind:'attachment-grant',power:0,toughness:0,keywords:[],contract:'attachment-continuous-effect'}:h.line(card,head+'.');
    const text=(costText||'{0}')+': '+parts[1].replaceAll("Return "+card.name+" to its owner's hand.","Return the granting permanent to its owner's hand.");
    const child=h.line({...card,name:'__GrantedPermanent__',type_line:'Creature',oracleGrantorContextV22:true},text);
    if(grant?.kind==='attachment-grant'&&child?.kind==='generic-ability'&&!child.optional&&!child.from&&Object.keys(child.cost).every(key=>['mana','tap'].includes(key)))return {kind:'permanent-grantor-operation-v22',grant,operation:{...child,cost:{...child.cost,additionalCostV20:{kind:'grantor-v22',mode:'unattach'}}},contract:'permanent-grantor-operation-v22'};
   }
  }
 }
 const nested=/^As long as enchanted permanent is an Equipment, it has "(.+)"\.$/.exec(line);
 if(nested){const child=h.line(card,nested[1]);if(child?.kind==='attachment-grant'&&Object.keys(child).every(key=>['kind','power','toughness','keywords','contract'].includes(key)))return {kind:'permanent-propagated-static-v22',attached:true,subjectType:'Equipment',operation:child,contract:'permanent-propagated-static-v22'};return null;}
 const entry=/^As this (?:creature|artifact|enchantment|Aura|Vehicle|permanent) enters, (?:look at an opponent's hand, then )?choose (a|any|a nonland|a land|a nonbasic land|a noncreature, nonland) card name\.$/.exec(line);
 if(entry)return {kind:'permanent-name-entry-v22',quality:({'a':'any','any':'any','a nonland':'nonland','a land':'land','a nonbasic land':'nonbasic-land','a noncreature, nonland':'noncreature-nonland'})[entry[1]],lookHand:line.includes("look at an opponent's hand"),contract:'permanent-name-entry-v22'};
 const reveal=/^As (.+?) enters, each opponent reveals their hand\. You choose the name of a nonland card revealed this way\.$/.exec(line);
 if(reveal&&['this creature',card.name,card.name.split(',')[0]].includes(reveal[1]))return {kind:'permanent-name-entry-v22',quality:'nonland',revealedOpponents:true,contract:'permanent-name-entry-v22'};
 if(line==='As this enchantment enters, you and an opponent each choose a card name other than a basic land card name.')return {kind:'permanent-name-entry-v22',quality:'not-basic-land',eachYouAndOpponent:true,contract:'permanent-name-entry-v22'};
 if(/^Your opponents can't cast spells with the chosen name ?\.$/.test(line)||line==="Your opponents can't cast spells with the chosen name (as long as this creature is on the battlefield).")return rule('spell-ban',{who:'opponents'});
 if(line==="Spells with the chosen name can't be cast.")return rule('spell-ban',{who:'all'});
 if(line==="Spells with the chosen names can't be cast and lands with the chosen names can't be played.")return rule('spell-land-ban',{who:'all'});
 const activation=/^Activated abilities of sources with the chosen name can't be activated( unless they're mana abilities)?\.$/.exec(line);
 if(activation)return rule('ability-ban',{exceptMana:!!activation[1]});
 const abilityTax=/^Activated abilities of sources with the chosen name cost \{([0-9]+)\} more to activate( unless they're mana abilities)?\.$/.exec(line);
 if(abilityTax)return rule('ability-tax',{n:Number(abilityTax[1]),exceptMana:!!abilityTax[2]});
 const tax=/^Spells(?: your opponents cast)? with the chosen name(?: (you cast|enchanted player casts))? cost \{([0-9]+)\} (more|less) to cast\.$/.exec(line);
 if(tax)return rule('spell-tax',{who:tax[1]==='you cast'?'you':tax[1]==='enchanted player casts'?'enchanted-player':line.startsWith('Spells your opponents cast')?'opponents':'all',n:Number(tax[2])*(tax[3]==='less'?-1:1)});
 if(line==='You have protection from the chosen card name.')return rule('player-protection');
 if(line==='Prevent all damage that would be dealt to you and permanents you control by sources with the chosen name.')return {kind:'damage-rule-v20',mode:'prevent',n:'all',source:{filter:{what:'permanent',zone:'battlefield',controller:'any',v20:{kind:'permanent-chosen-name-v22'}}},recipient:{yourObjects:true},contract:'damage-rule-v20'};
 const namedCast=/^(Whenever (?:an opponent|enchanted player|you) casts? a spell) with the chosen name, (.+)$/.exec(line);
 if(namedCast){const enchanted=namedCast[1].includes('enchanted player'),base=h.line(card,(enchanted?'Whenever you cast a spell':namedCast[1])+', '+namedCast[2].replace(/^they /,'that player '));if(base?.kind==='generic-trigger')return {...base,...(enchanted?{eventFilter:undefined}:{}),permanentNamedTriggerV22:enchanted?{who:'enchanted-player'}:{}};}
 const namedLand=/^When this land enters, choose a land card name\.$/.test(line);
 if(namedLand)return {kind:'generic-trigger',event:'etb',eventFilter:'self',effects:[{action:'permanent-choose-name-v22',quality:'land'}],targets:[],optional:false,contract:'generic-trigger-effect'};
 if(/^Lands with the chosen name have "\{T\}: Add \{C\}\."\.?$/.test(line))return {kind:'generic-static',scope:'filtered-permanents',filters:[{what:'land',zone:'battlefield',controller:'any',v20:{kind:'permanent-chosen-name-v22'}}],power:0,toughness:0,keywords:[],grantedOperation:{kind:'mana-source',produce:[{C:1}],activationMana:null,contract:'mana-source'},contract:'generic-continuous-effect'};
 return null;
}
export function extensionEffect(card,line,h){
 if(card.oracleGrantorContextV22&&line==="Return the granting permanent to its owner's hand.")return {effects:[{action:'permanent-grantor-return-v22'}],targets:[],optional:false};
 const shared=/^Enchanted creature and other creatures that share a creature type with it (.+ until end of turn\.)$/.exec(line);
 if(shared&&/\bAura\b/.test(card.type_line||'')){
  const child=h.effect(card,'Target creature '+shared[1]);
  if(complete(child)&&child.targets.length===1&&child.effects.length&&child.effects.every(effect=>effect.target===0&&['pump','grant-protection'].includes(effect.action)))return {effects:[{action:'permanent-shared-host-v22',effects:child.effects}],targets:[],optional:false};
  return null;
 }
 const choose=/^Choose a (nonland )?card name\. Spells with the chosen name cost \{([0-9]+)\} less to cast this turn\.$/.exec(line);
 if(choose)return {effects:[{action:'permanent-choose-name-v22',quality:choose[1]?'nonland':'any',temporarySpellTax:-Number(choose[2])}],targets:[],optional:false};
 return null;
}
export function extensionTarget(text,h){
 const match=/^(target spell) with the chosen name$/.exec(text);
 if(match){const base=h.target(match[1]);if(base)return {...base,v20:{kind:'permanent-chosen-name-v22'}};}
 return null;
}
export function finalizeCompilation(card,result){
 if(!result.semanticClass)return result;
 const text=JSON.stringify(result.implementation);
 if((text.includes('permanent-name-rule-v22')||text.includes('permanent-chosen-name-v22')||text.includes('permanentNamedTriggerV22'))&&!text.includes('permanent-name-entry-v22')&&!text.includes('permanent-choose-name-v22'))return {reason:'unbound-chosen-name-v22'};
 return result;
}
