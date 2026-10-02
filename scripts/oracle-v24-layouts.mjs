// Staged additive layouts. A chapter link is accepted only with its printed
// acquisition and consumer; runtime uses the shared exact CR 607 store.
const LINK='saga-chapter-1-v24';
const closed=body=>body&&!body.v4Body&&!body.optional&&Array.isArray(body.targets)&&Array.isArray(body.effects)&&body.effects.length;
const chapters=(card,h)=>card.sagaLinkedOriginalV24||/\bSaga\b/.test(card.type_line||'')?(h.stripReminderText?.(card.sagaLinkedOriginalV24||card.oracle_text)||card.sagaLinkedOriginalV24||card.oracle_text||'').split('\n').flatMap(line=>/^([IVX]+(?:, [IVX]+)*) — (.+)$/.exec(line.trim())?.[2]?.replace(/\bthis enchantment\b/g,'this Saga')||[]):[];
const has=(card,h,...bodies)=>bodies.every(body=>chapters(card,h).includes(body));
const cardFilter=(h,text)=>h.target('target '+text+' from your graveyard');
const result=(effects,targets=[])=>({effects,targets});

function optionalHand(card,line,h){
 const match=/^You may put an? (.+? card(?: with .+?)?) from your hand onto the battlefield( tapped)?\.(.*)$/.exec(line);
 if(!match)return null;
 let filter=cardFilter(h,match[1]);
 let totalPowerToughness;
 if(!filter){const bounded=/^creature card with total power and toughness ([0-9]+) or less$/.exec(match[1]);if(bounded){filter=cardFilter(h,'creature card');totalPowerToughness=Number(bounded[1]);}}
 if(!filter){const counter=/^(.+? card) with mana value equal to the number of (.+?) counters on (?:this artifact|this permanent)$/.exec(match[1]);if(counter){const basic=cardFilter(h,counter[1]);if(basic)filter={...basic,stat:'mv',comparison:'equal',threshold:{kind:'source-counters',counter:counter[2]}};}}
 if(!filter)return null;
 const tails={
  '':{},
  " If you don't, draw a card.":{elseEffects:[{action:'draw',who:'you',n:1}]},
  " If you do, return this creature to its owner's hand.":{ifMoved:[{action:'return-source-to-hand'}]},
  ' That creature gains haste. Sacrifice that creature at the beginning of the next end step.':{haste:true,delayed:'sacrifice'},
  ' That creature gains haste. At the beginning of the next end step, sacrifice that creature.':{haste:true,delayed:'sacrifice'},
  ' At the beginning of the next end step, return that creature to your hand.':{delayed:'hand'}
 };
 if(!Object.hasOwn(tails,match[3]))return null;
 return result([{action:'put-qualified-hand-v24',filter,tapped:!!match[2],...(totalPowerToughness!==undefined?{totalPowerToughness}:{}),...tails[match[3]]}]);
}

export function extensionEffect(card,line,h){
 line=line.replace(/\bthis enchantment\b/g,'this Saga');
 if(line==='You may activate the loyalty abilities of planeswalkers you control twice this turn rather than only once.')return result([{action:'loyalty-twice-v24'}]);
 if(line==='Draw a card. You may put a land card from your hand onto the battlefield tapped. If you control eight or more lands, repeat this process once.')return result([{action:'repeat-draw-hand-land-v24',threshold:8}]);
 if(line==='Draw a card if you control the creature with the greatest power or tied for the greatest power.')return result([{action:'draw-greatest-power-v24',n:1}]);
 if(line==='Create a Gold token.')return result([{action:'token-key',tokenKey:'gold',who:'you',n:1,tapped:false}]);
 if(line==='You and target opponent each create a Food token.')return result([{action:'token-key',tokenKey:'food',who:'you',n:1,tapped:false},{action:'token-key',tokenKey:'food',who:0,n:1,tapped:false}],[{what:'opponent',zone:'player',controller:'opponent',min:1,max:1}]);
 const excluded=/^Return each creature that isn't a (.+?) to its owner's hand\.$/.exec(line);
 if(excluded){const types=excluded[1].replace(/, or /,', ').split(', ');if(types.length>1&&types.length<=8&&types.every(type=>/^[A-Z][a-z]+$/.test(type)&&h.target('target '+type+' creature')))return result([{action:'battlefield-group',operation:'bounce',filters:[{what:'creature',zone:'battlefield',controller:'any',excludedSubtypesV9:types}],players:false}]);}
 if(line==='Target creature you control deals damage equal to its power to each opponent.'){const target=h.target('target creature you control');if(target)return result([{action:'damage-batch',hits:[{sourceTarget:0,target:'each-opponent',n:{kind:'target-stat',target:0,stat:'power'}}]}],[target]);}
 if(line==="Tap all nonland permanents target opponent controls. They don't untap during their controller's next untap step.")return result([{action:'chapter-tap-cohort-v24',who:0}],[{what:'opponent',zone:'player',controller:'opponent',min:1,max:1}]);
 if(line==='Exile a creature with the greatest power among creatures target opponent controls.')return result([{action:'chapter-exile-greatest-v24',who:0}],[{what:'opponent',zone:'player',controller:'opponent',min:1,max:1}]);
 const quoted=/^This (?:Saga|creature|artifact|land|permanent) gains "(.+)"\.?$/.exec(line);
 if(quoted){const text=quoted[1].replace(/^Landfall — /,''),operation=text==='Whenever this creature deals combat damage to a player, that player loses the game.'?{kind:'generic-trigger',event:'combatDamageToPlayer',eventFilter:'self',targets:[],effects:[{action:'chapter-player-loses-v24',who:'event-player'}],contract:'generic-trigger-effect'}:h.line(card,text);if(operation&&['generic-trigger','generic-ability','mana-source'].includes(operation.kind))return result([{action:'grant-operation',target:'self',duration:'object-v10',operation}]);}
 const trolls='Choose target opponent. If they control fewer lands than you, create a number of 4/4 green Troll Warrior creature tokens with trample equal to the difference.';
 if(line===trolls){const token=h.effect(card,'Create a 4/4 green Troll Warrior creature token with trample.');if(closed(token)&&!token.targets.length&&token.effects.length===1&&token.effects[0].action==='token-inline')return result([{...token.effects[0],n:{kind:'chapter-land-difference-v24',target:0}}],[{what:'opponent',zone:'player',controller:'opponent',min:1,max:1}]);}
 const hand=optionalHand(card,line,h);if(hand)return hand;
 const returnCreature="Return the exiled card to the battlefield under its owner's control.";
 if(has(card,h,returnCreature)){
  const acquisition=chapters(card,h).find(body=>/^Exile (?:up to one )?target creature\.$/.test(body));
  if(acquisition){
   if(line===acquisition){const target=h.target('target creature');if(target)return result([{action:'linked-exile',target:0,link:LINK}],[acquisition.startsWith('Exile up to one ')?{...target,min:0,max:1}:target]);}
   if(line===returnCreature)return result([{action:'linked-return',link:LINK,to:'battlefield',controller:'owner'}]);
  }
 }
 const aesir=["Exile a permanent card from your graveyard. You gain life equal to its mana value.","Put a number of +1/+1 counters on target creature you control equal to the mana value of the exiled card.","Return this Saga and the exiled card to their owner's hand."];
 if(has(card,h,...aesir)){
  if(line===aesir[0]){const filter=cardFilter(h,'permanent card');if(filter)return result([{action:'chapter-linked-choose-v24',from:'graveyard',filter,link:LINK,n:1,optional:false,gainManaValue:true}]);}
  if(line===aesir[1]){const target=h.target('target creature you control');if(target)return result([{action:'counter',target:0,counter:'+1/+1',n:{kind:'chapter-linked-mv-v24',link:LINK}}],[target]);}
  if(line===aesir[2])return result([{action:'return-source-to-hand'},{action:'linked-return',link:LINK,to:'hand',controller:'owner'}]);
 }
 const creation=['Search your library for a card, exile it face down, then shuffle.',"Turn the exiled card face up. If it's a creature card, you lose life equal to its mana value.","You may put the exiled card onto the battlefield if it's a creature card. If you don't put it onto the battlefield, put it into its owner's hand."];
 if(has(card,h,...creation)){
  if(line===creation[0])return result([{action:'chapter-linked-search-v24',filter:{what:'card',zone:'library',controller:'you'},n:1,required:true,faceDown:true,link:LINK}]);
  if(line===creation[1])return result([{action:'chapter-linked-avacyn-v24',mode:'reveal',link:LINK}]);
  if(line===creation[2])return result([{action:'chapter-linked-avacyn-v24',mode:'release',link:LINK}]);
 }
 const chooseLinked="Put a card exiled with this Saga into its owner's hand.";
 if(has(card,h,chooseLinked)){
  const acquisition=chapters(card,h).find(body=>/^Search your library for up to [1-9][0-9]* .+? cards, exile them, then shuffle\.(?: .+)?$/.test(body)||/^Search your library for up to two .+? cards, exile them, then shuffle\.(?: .+)?$/.test(body));
  if(acquisition&&line===acquisition){const parsed=h.effect(card,line.replace('exile them','put them into your hand'));if(closed(parsed)&&!parsed.targets.length){const search=parsed.effects.find(effect=>effect.action==='search-library');if(search&&parsed.effects.filter(effect=>effect.action==='search-library').length===1){const quality=/^Search your library for up to (?:two|[1-9][0-9]*) (.+?) cards,/.exec(acquisition)?.[1],filter=quality&&cardFilter(h,quality+' card');if(filter)return result(parsed.effects.map(effect=>effect===search?{action:'chapter-linked-search-v24',filter,n:search.n,required:false,faceDown:false,link:LINK}:effect));}}}
  if(acquisition&&line===chooseLinked)return result([{action:'chapter-linked-release-one-v24',link:LINK,to:'hand'}]);
 }
 return null;
}
export function extensionLine(card,line,h){
 if(!card.sagaLinkedOriginalV24)return null;
 const match=/^When this enchantment enters, (.+)$/.exec(line),body=match&&extensionEffect(card,match[1],h);
 return body?{kind:'generic-trigger',event:'etb',eventFilter:'self',...body,contract:'generic-trigger-effect'}:null;
}
export function modifierOperation(){return null;}
export function finalizeCompilation(card,result){
 // A previously complete acquisition chapter is memoized by the older
 // compiler. Bind it to its newly executable, printed consumer only after
 // the entire Saga has compiled successfully.
 const text=card.oracle_text||'',returned="Return the exiled card to the battlefield under its owner's control.";
 if(!result.semanticClass||!text.includes(returned)||!/^I — Exile (?:up to one )?target creature\.$/m.test(text))return result;
 return {...result,implementation:result.implementation.map(op=>op.kind!=='saga-chapters'?op:{...op,chapters:op.chapters.map((body,index)=>index||body.effects?.length!==1||body.effects[0].action!=='exile'||body.effects[0].target!==0?body:{...body,effects:[{action:'linked-exile',target:0,link:LINK}]})})};
}
export function normalizeCard(card){return /\bSaga\b/.test(card.type_line||'')?{...card,sagaLinkedOriginalV24:card.sagaLinkedOriginalV24||card.oracle_text}:card;}
export function compileWholeCard(){return null;}
