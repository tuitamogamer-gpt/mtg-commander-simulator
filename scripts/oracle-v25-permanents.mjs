import {modifications} from './oracle-v8-copies.mjs';
const LINK='permanent-linked-v25';
const complete=b=>b&&!b.v4Body&&b.targets&&b.effects?.length;
const body=(effects,targets=[])=>({effects,targets,optional:false});
const up=s=>s[0].toUpperCase()+s.slice(1);
const noun='(?:this (?:creature|artifact|enchantment|land|Vehicle|Equipment)|it)';
function bind(node){
 if(Array.isArray(node))return node.map(bind);if(!node||typeof node!=='object')return node;
 if(node.action?.startsWith('permanent-linked-')&&node.action.endsWith('-v25'))return node;
 if(node.action==='exile-top')return {...node,action:'permanent-linked-acquire-v25',mode:'top',link:LINK,from:'library'};
 if(node.action==='search-library'&&node.destination==='exile')return {...node,action:'permanent-linked-acquire-v25',mode:'search',link:LINK,from:'library',lookAllowed:true};
 if(node.action==='exile'&&node.target==='event-card')return {action:'permanent-linked-acquire-v25',mode:'event',target:'linked-event-v25',link:LINK};
 if(node.action==='linked-exile-until')return {action:'permanent-linked-acquire-v25',mode:'until',native:node,link:LINK};
 if(node.action==='permanent-linked-acquire-v24')return {action:'permanent-linked-acquire-v25',mode:'v24',native:{...node,link:LINK},link:LINK};
 if(node.action==='zone-select'&&node.destination==='exile')return {...node,action:'permanent-linked-acquire-v25',mode:'zone',from:node.zone,link:LINK};
 return Object.fromEntries(Object.entries(node).map(([k,v])=>[k,k==='link'&&typeof v==='string'&&v.startsWith('permanent-linked-v')?LINK:k==='link'&&node.action==='linked-exile'&&v===0?LINK:bind(v)]));
}
export function compileWholeCard(card,h){
 if(card.permanentLinkedV25||card.layout!=='normal'||!/(?:Creature|Artifact|Enchantment|Land)/.test(card.type_line||''))return null;
 const text=h.stripReminderText(card.oracle_text||'');if(!/\b(?:the exiled cards?|cards? exiled with (?:this (?:creature|artifact|enchantment|land|Vehicle|Equipment)|it))\b/.test(text))return null;
 if(/^As an additional cost[^\n]*exile|^[^\n:]*[Ee]xile[^\n]*:/m.test(text))return null;
 const parsed=h.compileCurrent({...card,permanentLinkedV25:LINK,permanentLinkedV24:LINK});if(!parsed.semanticClass)return null;
 const implementation=bind(parsed.implementation),json=JSON.stringify(implementation);
 if(!/"action":"(?:permanent-linked-acquire-v2[45]|linked-exile)"/.test(json))return null;
 return {...parsed,implementation};
}
export function normalizeCard(card){const names=[card.name,card.name?.split(',')[0]].filter(Boolean);return {...card,oracle_text:String(card.oracle_text||'').split('\n').map(line=>names.some(name=>line.startsWith('When '+name+' enters, it connives.'))?line.replace('it connives.','this creature connives.'):line).join('\n')};}
export function extensionLine(card,line,h){
 if(!card.permanentLinkedV25)return null;
 const look=new RegExp('^You may look at (?:the )?cards exiled with '+noun+'(?: for as long as they remain exiled)?\\.$').exec(line);
 if(look)return {kind:'permanent-linked-look-v25',link:LINK,contract:'permanent-linked-look-v25'};
 const stats=new RegExp('^This (?:creature|artifact|enchantment|Vehicle) gets ([+-][0-9]+)/([+-][0-9]+) for each card exiled with '+noun+'\\.$').exec(line);if(stats)return {kind:'generic-static',scope:'self',power:Number(stats[1]),toughness:Number(stats[2]),multiplier:{kind:'permanent-linked-count-v25',link:LINK},contract:'generic-continuous-effect'};
 const variable=/^\{X\}, \{T\}: You may exile (an? instant or sorcery card) with mana value X from your hand\.$/.exec(line);if(variable){const filter=h.target('target '+variable[1].replace(/^an? /,'')+' from a graveyard');if(filter)return {kind:'generic-ability',cost:{mana:'{X}',tap:true},effects:[{action:'permanent-linked-acquire-v25',mode:'zone',from:'hand',who:'you',n:1,optional:true,link:LINK,filter:{...filter,stat:'mv',threshold:{kind:'permanent-paid-x-v25'},comparison:'equal'}}],targets:[],optional:false,onceEachTurn:false,sorceryOnly:false,contract:'generic-activated-effect'};}
 const fixed=/^(.+?) X is the (mana value|power|toughness) of the exiled card\.$/.exec(line);if(fixed){const parsed=h.line({...card,permanentLinkedXGuardV25:true},fixed[1]);if(parsed?.kind==='generic-ability'&&parsed.cost?.mana?.includes('{X}'))return {...parsed,permanentLinkedActivationManaV25:{kind:'permanent-linked-value-v25',link:LINK,stat:fixed[2]==='mana value'?'mv':fixed[2]}};}
 const batch=/^Whenever you discard one or more cards, (.+)$/.exec(line);if(batch){const parsed=h.effect(card,up(batch[1]));if(complete(parsed))return {kind:'generic-trigger',event:'discarded',eventFilter:{kind:'batch-discard-v8',controller:'you',target:{what:'card',zone:'graveyard',controller:'any'}},oncePerBatch:true,...parsed,contract:'generic-trigger-effect'};}
 const play=new RegExp('^You may (play cards|play lands and cast spells from among cards|cast spells from among cards) exiled with '+noun+'\\.$').exec(line);
 if(play)return {kind:'permanent-linked-permission-v25',link:LINK,spellsOnly:play[1].startsWith('cast'),contract:'permanent-linked-permission-v25'};
 return null;
}
export function extensionEffect(card,line,h){
 if(!card.permanentLinkedV25)return null;
 line=up(line);
 const optionalToken=/^Draw a card\. Then you may exile (a|an) (.+? card) from your hand\. If you do, (Create .+)$/i.exec(line);if(optionalToken){const filter=h.target('target '+optionalToken[2]+' from a graveyard'),copy=extensionEffect(card,up(optionalToken[3]),h);if(filter&&complete(copy)&&!copy.targets.length&&copy.effects.length===1&&copy.effects[0].action==='permanent-linked-copy-token-v25')return body([{action:'draw',who:'you',n:1},{action:'permanent-linked-acquire-token-v25',link:LINK,filter,from:'hand',copy:copy.effects[0]}]);}
 const untilOther=/^Exile any number of other nontoken creatures you control until (?:it|this creature) leaves the battlefield\.$/.exec(line);if(untilOther){const filter=h.target('target nontoken creature you control');if(filter)return body([{action:'permanent-linked-acquire-v25',mode:'until',link:LINK,native:{action:'linked-exile-until',filters:[{...filter,excludeSelf:true}],chooseAny:true}}]);}
 const untilGrave=/^Exile all (.+? cards(?: with mana value [0-9]+ or less)?) from your graveyard until this artifact leaves the battlefield\.$/.exec(line);if(untilGrave){const range=/^(.+?) with mana value ([0-9]+) or less$/.exec(untilGrave[1]),base=(range?range[1]:untilGrave[1]).replace(/cards(?= |$)/,'card'),filter=h.target('target '+base+' from a graveyard');if(filter)return body([{action:'permanent-linked-acquire-v25',mode:'until-zone',link:LINK,from:'graveyard',filter:{...filter,...(range?{stat:'mv',threshold:Number(range[2]),comparison:'less'}:{})},who:'you',n:'all'}]);}
 const lasting=new RegExp('^Until end of turn, you may cast (a|an) (.+?) spell from among cards exiled with '+noun+' without paying its mana cost\\.$').exec(line);if(lasting){const filter=h.target('target '+lasting[2]+' spell');if(filter)return body([{action:'permanent-linked-grant-v25',link:LINK,duration:'eot',spellsOnly:true,free:true,filter,max:1}]);}
 const copy=new RegExp('^(You may copy|Copy) (the exiled card|a card exiled with '+noun+')\\. (?:If you do, )?[Yy]ou may cast the copy without paying its mana cost\\.$').exec(line);
 if(copy)return body([{action:'permanent-linked-copy-cast-v25',link:LINK,choose:copy[2].startsWith('a ') ? 1 : 0,optional:copy[1].startsWith('You may')}]);
 const token=new RegExp("^Create (a|one|two|three|[1-9][0-9]*) tokens? that's a copy of (the exiled card|target (.+? card|card) exiled with "+noun+")(?:, except (.+))?\\.$").exec(line);
 if(token){const pt=/^it's a ([0-9]+)\/([0-9]+) (white|blue|black|red|green|colorless) ([A-Z][a-z]+) creature with (.+)$/.exec(token[4]||''),additional=/^it's a ([0-9]+)\/([0-9]+) ([A-Z][a-z]+) artifact creature in addition to its other types$/.exec(token[4]||''),mod=additional?{power:Number(additional[1]),toughness:Number(additional[2]),addTypes:['Artifact','Creature'],addSubtypes:[additional[3]]}:pt?modifications(card,'it is '+pt[1]+'/'+pt[2]+' '+pt[3]+' '+pt[4]+' and it has '+pt[5],h):modifications(card,token[4]||'',h),target=token[3]&&extensionTarget('target '+token[3]+' exiled with this artifact',h);if(mod&&(!token[3]||target))return body([{action:'permanent-linked-copy-token-v25',link:LINK,n:({a:1,one:1,two:2,three:3}[token[1]]||Number(token[1])),modifications:mod,...(target?{target:0}:{})}],target?[target]:[]);}
 const grave=/^Exile (target (?:player|opponent))'s graveyard\.$/.exec(line);if(grave){const target=h.target(grave[1]);if(target)return body([{action:'permanent-linked-acquire-v25',mode:'zone',from:'graveyard',who:0,n:'all',link:LINK}],[target]);}
 if(line==="The exiled card's owner may cast that card without paying its mana cost.")return body([{action:'permanent-linked-cast-v25',link:LINK,free:true,owner:true,each:true}]);
 if(line==="The exiled card's owner manifests dread.")return body([{action:'permanent-linked-owner-effect-v25',link:LINK,effect:{action:'face-down',kind:'manifest-dread',who:'you',n:1}}]);
 const owned=/^Target (player|opponent) exiles a card from their hand\.$/.exec(line);if(owned){const target=h.target('target '+owned[1]);return body([{action:'permanent-linked-acquire-v25',mode:'zone',from:'hand',who:0,n:1,chooseOwner:true,link:LINK}],[target]);}
 if(line==='Exile that card from your graveyard.')return body([{action:'permanent-linked-acquire-v25',mode:'event',target:'linked-event-v25',from:'graveyard',link:LINK}]);
 if(line==='Exile them from your graveyard.')return body([{action:'permanent-linked-acquire-v25',mode:'event-batch',target:'linked-discard-batch-v25',from:'graveyard',link:LINK}]);
 if(line==="That player exiles the top card of their library.")return body([{action:'permanent-linked-acquire-v25',mode:'top',from:'library',who:'event-player',n:1,link:LINK}]);
 const top=/^Exile the top (card|[1-9][0-9]* cards|one card|two cards|three cards|five cards|seven cards) of (your|target (?:player|opponent)'s|that player's) library( face down)?\.$/.exec(line);
 if(top){const words={card:1,'one card':1,'two cards':2,'three cards':3,'five cards':5,'seven cards':7},target=top[2].startsWith('target ')?h.target(top[2].slice(0,-2)):null;return body([{action:'permanent-linked-acquire-v25',mode:'top',from:'library',link:LINK,n:words[top[1]]||Number(top[1].split(' ')[0]),who:target?0:top[2]==='your'?'you':'event-player',...(top[3]?{faceDown:true}:{})}],target?[target]:[]);}
 const all=new RegExp("^(?:Put|Return) the cards exiled with "+noun+" (?:to|into) their owner's hand\\.$").exec(line);
 if(all)return body([{action:'linked-return',link:LINK,to:'hand',controller:'owner'}]);
 const other=new RegExp("^Return (?:all|each) other permanent cards? exiled with "+noun+" to the battlefield under (?:their|its) owners?' control\\.$").exec(line);
 if(other)return body([{action:'permanent-linked-return-v25',link:LINK,to:'battlefield',controller:'owner',exceptAcquired:true,filter:h.target('target permanent card from a graveyard')}]);
 const one=new RegExp("^(?:Return|Put) a (.+? card|card) exiled with "+noun+" (?:to|into) its owner's (hand|graveyard)\\.$").exec(line);
 if(one){const filter=h.target('target '+one[1]+' from a graveyard');if(filter)return body([{action:'permanent-linked-return-v25',link:LINK,to:one[2],controller:'owner',choose:1,filter}]);}
 const field=new RegExp("^Put a (.+? card|card) exiled with "+noun+" onto the battlefield( tapped)?(?: under (your|its owner's) control)?(?: with a (finality|flying) counter on it)?\\.$").exec(line);
 if(field){const filter=h.target('target '+field[1]+' from a graveyard');if(filter)return body([{action:'permanent-linked-return-v25',link:LINK,to:'battlefield',controller:field[3]==='your'?'you':'owner',choose:1,filter,...(field[2]?{tapped:true}:{}),...(field[4]?{counter:field[4]}:{})}]);}
 const cast=new RegExp('^You may cast (?:a spell|a (.+?) spell) from among cards exiled with '+noun+'(?: without paying its mana cost)?\\.$').exec(line);
 if(cast){const filter=cast[1]&&h.target('target '+cast[1]+' spell');if(!cast[1]||filter)return body([{action:'permanent-linked-cast-v25',link:LINK,free:line.includes('without paying'),...(filter?{filter}:{})}]);}
 const choice=new RegExp('^Choose a card exiled with '+noun+'\\. You may play that card this turn\\.$').exec(line);
 if(choice)return body([{action:'permanent-linked-grant-v25',link:LINK,choose:1,duration:'eot',spellsOnly:false}]);
 if(line==='Turn all cards exiled with this creature face up. Counter all spells with those names.')return body([{action:'permanent-linked-counter-v25',link:LINK,reveal:true}]);
 return null;
}

export function extensionTarget(text,h){const m=new RegExp('^target (.+? card|card) exiled with '+noun+'$').exec(text);if(!m)return null;const base=h.target('target '+m[1]+' from a graveyard');return base?{...base,zone:'exile',v20:{kind:'permanent-linked-target-v25',link:LINK}}:null;}
export function extensionCount(text,h){if(new RegExp('^cards exiled with '+noun+'$').test(text))return {kind:'permanent-linked-count-v25',link:LINK};return null;}
export function extensionValue(text,h){const m=/^the (mana value|power|toughness) of the exiled card$/.exec(text);if(m)return {kind:'permanent-linked-value-v25',link:LINK,stat:m[1]==='mana value'?'mv':m[1]};const n=/^the number of (.+)$/.exec(text);return n?extensionCount(n[1],h):null;}
export function finalizeCompilation(card,result){const json=JSON.stringify(result.implementation||[]);if(/permanent-linked-(?:target|count|value|look|permission|return|cast|grant|copy-token|copy-cast|counter|owner-effect)-v25/.test(json)&&!(/"action":"permanent-linked-acquire(?:-token)?-v25"/.test(json)))return {reason:'unbound-linked-acquisition-v25'};return result;}
