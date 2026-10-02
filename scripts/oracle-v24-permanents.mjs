const LINK='permanent-linked-v24';
const complete=body=>body&&!body.v4Body&&Array.isArray(body.targets)&&Array.isArray(body.effects)&&body.effects.length;
const body=(effects,targets=[])=>({effects,targets,optional:false});
const upper=text=>text[0].toUpperCase()+text.slice(1);
const cardFilter=(phrase,h)=>{
 const range=/^(.+?) with mana value ([0-9]+|X)(?: or (less|greater))?$/.exec(phrase);
 const filter=h.target('target '+(range?range[1]:phrase)+' from your graveyard');
 return filter&&range?{...filter,stat:'mv',threshold:range[2]==='X'?'X':Number(range[2]),comparison:range[3]||'equal'}:filter;
};
function bindAcquisitions(node,link){
 if(Array.isArray(node))return node.map(child=>bindAcquisitions(child,link));
 if(!node||typeof node!=='object')return node;
 if(node.action==='zone-choice-v20'&&node.destination==='exile'&&node.revealHand===true&&node.selections?.length===1&&node.selections[0].zone==='hand'&&!node.optional&&!node.n&&!node.random)return {action:'permanent-linked-acquire-v24',link,mode:'reveal-hand',from:'hand',who:node.who,filter:node.selections[0].filter,n:1};
 if(node.action==='zone-select'&&node.destination==='exile'&&node.n==='all'&&node.zone==='hand')return {action:'permanent-linked-acquire-v24',link,mode:'all',from:'hand',who:node.who,filter:node.filter};
 return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,key==='link'&&['linked-exile','linked-return'].includes(node.action)&&value===0?link:bindAcquisitions(value,link)]));
}
export function compileWholeCard(card,h){
 if(card.permanentLinkedV24||card.layout!=='normal'||!/(?:Creature|Artifact|Enchantment|Land)/.test(card.type_line||''))return null;
 const text=h.stripReminderText(card.oracle_text||'');if(!/\b(?:the exiled cards?|cards? exiled with (?:this (?:creature|artifact|enchantment|land)|it))\b/.test(text))return null;
 const paragraphs=text.split('\n').filter(line=>/\bexiles?\b/i.test(line)),hideaways=text.split('\n').filter(line=>/^Hideaway [1-9][0-9]*$/.test(line));if(hideaways.length?hideaways.length!==1||paragraphs.length!==0:paragraphs.length!==1||(text.match(/\bexiles?\b/gi)||[]).length!==1)return null;
 const parsed=h.compileCurrent({...card,permanentLinkedV24:LINK});if(!parsed.semanticClass)return null;
 const implementation=bindAcquisitions(parsed.implementation,LINK);
 if(!JSON.stringify(implementation).includes('"action":"permanent-linked-acquire-v24"'))return null;
 return {...parsed,implementation};
}
export function normalizeCard(card){return {...card,oracle_text:String(card.oracle_text||'').replace(/^Imprint — /gm,'').replace(/^When this creature enters, sacrifice it unless you exile a creature you control other than this creature\.$/gm,'When this creature enters, sacrifice this creature unless you exile a creature you control other than this creature.')};}
export function extensionLine(card,line,h){
 if(!card.permanentLinkedV24)return null;
 const hideaway=/^Hideaway ([1-9][0-9]*)$/.exec(line);if(hideaway)return {kind:'generic-trigger',event:'etb',eventFilter:'self',...body([{action:'permanent-linked-acquire-v24',mode:'hideaway',from:'library',n:Number(hideaway[1]),link:card.permanentLinkedV24,faceDown:true,hideaway:true}]),contract:'generic-trigger-effect'};
 const attack=/^Whenever you attack with one or more creatures, (.+)$/.exec(line);if(attack){const parsed=h.effect(card,upper(attack[1])),target=h.target('target creature');if(complete(parsed)&&target)return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',player:'you',target,minMatching:1},attackersAmountV19:true,...parsed,contract:'generic-trigger-effect'};}
 const draw=/^Whenever you draw your first card during each of your draw steps, (.+)$/.exec(line);if(draw){const parsed=h.effect(card,upper(draw[1]));if(complete(parsed))return {kind:'generic-trigger',event:'draw',eventFilter:{kind:'v8-event',player:'you'},permanentDrawStepFirstV24:true,...parsed,contract:'generic-trigger-effect'};}
 const typed=/^Whenever (you|a player) (?:plays?|play) a land or casts? a spell, if it shares a card type with the exiled card, (.+)$/.exec(line);if(typed){const damage=/^this creature deals ([0-9]+) damage to that player\.$/.exec(typed[2]),parsed=damage?body([{action:'damage',source:'self',target:'event-player',n:Number(damage[1])}]):h.effect(card,upper(typed[2]));if(complete(parsed))return {kind:'generic-trigger',event:['landPlayed','cast'],eventFilter:{kind:'v8-event',player:typed[1]==='you'?'you':'any'},permanentLinkedEventTypeV24:{link:card.permanentLinkedV24},...parsed,contract:'generic-trigger-effect'};}
 const anvil=/^Spells you cast that share a card type with the exiled card cost \{([1-9][0-9]*)\} less to cast\.$/.exec(line);if(anvil)return {kind:'permanent-linked-cost-v24',rule:'any-shared-type',n:Number(anvil[1]),link:card.permanentLinkedV24,contract:'permanent-linked-cost-v24'};
 if(line==='Spells you cast cost {1} less to cast for each card type they share with cards exiled with this creature.')return {kind:'permanent-linked-cost-v24',rule:'shared-type-count',n:1,link:card.permanentLinkedV24,contract:'permanent-linked-cost-v24'};
 const count=/^(?:This (?:creature|Vehicle|artifact)|Unlicensed Hearse)'s power and toughness are each equal to the number of cards exiled with (?:it|this (?:creature|Vehicle|artifact))\.$/.exec(line);if(count)return {kind:'characteristic-pt',power:true,toughness:true,multiply:1,offset:0,toughnessOffset:0,count:{kind:'permanent-linked-count-v24',link:card.permanentLinkedV24},contract:'characteristic-power-toughness'};
 const colors=/^\{T\}: Add one mana of any of the exiled (?:card's|cards') colors\.$/.exec(line);
 if(colors)return {kind:'permanent-linked-mana-v24',rule:'colors',link:card.permanentLinkedV24,contract:'permanent-linked-mana-v24'};
 if(line==='{T}: Add {C}. If a card is exiled with this land, add {C}{C} instead.')return {kind:'permanent-linked-mana-v24',rule:'double-colorless',link:card.permanentLinkedV24,contract:'permanent-linked-mana-v24'};
 const ban=/^(Players|Your opponents) can't cast spells with the same name as (?:the exiled card|a card exiled with (?:this (?:creature|artifact|enchantment|land)|it))\.$/.exec(line);
 if(ban)return {kind:'permanent-linked-name-ban-v24',players:ban[1]==='Players'?'all':'opponents',link:card.permanentLinkedV24,contract:'permanent-linked-name-ban-v24'};
 return null;
}
export function extensionEffect(card,line,h){
 if(!card.permanentLinkedV24||card.permanentLinkedAcquireGuardV24)return null;
 const link=card.permanentLinkedV24;
 if(line==="Turn the exiled card face up. If it's a creature card, put it onto the battlefield under your control.")return body([{action:'permanent-linked-reveal-return-v24',link,to:'battlefield',controller:'you',what:'creature'}]);
 const inspect=/^Look at the top (four|[1-9][0-9]*) cards of your library, exile one face down, then put the rest on the bottom of your library in any order\.$/.exec(line);if(inspect)return body([{action:'permanent-linked-acquire-v24',mode:'inspect',from:'library',n:inspect[1]==='four'?4:Number(inspect[1]),link,faceDown:true}]);
 const play=/^You may play the exiled card without paying its mana cost(?: if (.+))?\.$/.exec(line);
 if(play){const condition=play[1]&&h.condition(play[1]);if(!play[1]||condition)return body([{action:'permanent-linked-play-v24',link,...(condition?{condition}:{})}]);}
 const returned=/^(?:Return|Put) (?:the exiled cards?|(?:all|each) cards? exiled with (?:this (?:creature|artifact|enchantment|land)|it)) (?:to|into) (?:its owner's|their owner's|their owners') (hand|hands|graveyard|graveyards)\.$/.exec(line);
 if(returned)return body([{action:'linked-return',link,to:returned[1].startsWith('hand')?'hand':'graveyard',controller:'owner'}]);
 const field=/^(?:Return|Put) (?:the exiled cards?|(?:all|each) cards? exiled with (?:this (?:creature|artifact|enchantment|land)|it)) (?:to|onto) the battlefield( tapped)? under (your|its owner's|their owner's|their owners') control\.$/.exec(line);
 if(field)return body([{action:'linked-return',link,to:'battlefield',controller:field[2]==='your'?'you':'owner',...(field[1]?{tapped:true}:{})}]);
 const select=/^Exile (?:a|an) (.+?) from your (hand|graveyard)( face down)?\.$/.exec(line);
 if(select){const filter=cardFilter(select[1],h);if(filter)return body([{action:'permanent-linked-acquire-v24',link,mode:'select',from:select[2],who:'you',filter,n:1,...(select[3]?{faceDown:true}:{})}]);}
 const anyGrave=/^Exile (?:a|an) (.+? card|card) from a graveyard\.$/.exec(line);if(anyGrave){const filter=cardFilter(anyGrave[1],h);if(filter)return body([{action:'permanent-linked-acquire-v24',link,mode:'select',from:'graveyard',who:'all-graveyards',filter,n:1}]);}
 const all=/^(Exile all cards from your hand|Target (player|opponent) exiles all cards from their hand)( face down)?(?:, then draws that many cards)?\.$/.exec(line);
 if(all)return body([{action:'permanent-linked-acquire-v24',link,mode:'all',from:'hand',who:all[2]?0:'you',...(all[3]?{faceDown:true}:{}),drawEqual:line.includes('then draws')}],all[2]?[h.target('target '+all[2])]:[]);
 const reveal=/^(Target opponent|Target player) reveals their hand(?: and you choose|\. You choose) a (.+? card) from it\. Exile that card\.$/.exec(line);
 if(reveal){const filter=h.target('target '+reveal[2]+' from a graveyard');if(filter)return body([{action:'permanent-linked-acquire-v24',link,mode:'reveal-hand',from:'hand',who:0,filter,n:1}],[h.target(reveal[1].toLowerCase())]);}
 const opponent=/^An opponent chooses a permanent you control other than this creature and exiles it\.$/.exec(line);
 if(opponent)return body([{action:'permanent-linked-acquire-v24',link,mode:'opponent-choice',from:'battlefield',filter:{what:'permanent',zone:'battlefield',controller:'you',excludeSelf:true},n:1}]);
 const unless=/^Sacrifice this creature unless you exile a creature you control other than this creature\.$/.exec(line);
 if(unless)return body([{action:'permanent-linked-acquire-v24',link,mode:'sacrifice-unless',from:'battlefield',filter:{what:'creature',zone:'battlefield',controller:'you',excludeSelf:true},n:1}]);
 if(/^Exile (?:target|up to [a-z0-9]+ target|the top|a card from a graveyard|a creature card from a graveyard)/.test(line)){
  const parsed=h.effect({...card,permanentLinkedAcquireGuardV24:true},line);if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='exile'&&parsed.targets.length&&parsed.targets.every(target=>['battlefield','graveyard','stack'].includes(target.zone)))return {...parsed,effects:[{action:'permanent-linked-acquire-v24',link,mode:'target',target:parsed.effects[0].target,from:parsed.targets[0].zone}]};
 }
 return null;
}
export function extensionCondition(text){
 if(text==='each player has no cards in hand')return {kind:'permanent-linked-condition-v24',test:'all-empty-hands'};
 if(text==='a library has twenty or fewer cards in it')return {kind:'permanent-linked-condition-v24',test:'any-small-library',n:20};
 const powers=/^you control ([1-9][0-9]*|three) or more creatures with different powers$/.exec(text);if(powers)return {kind:'permanent-linked-condition-v24',test:'distinct-creature-powers',n:powers[1]==='three'?3:Number(powers[1])};
 return null;
}
