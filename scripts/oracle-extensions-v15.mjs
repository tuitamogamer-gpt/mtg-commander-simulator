// Closed additions. Successful v14 definitions remain frozen.
import * as v14 from './oracle-extensions-v14.mjs';
import {parseOracleAdditionalCosts} from './oracle-spell-v4.mjs';
export * from './oracle-extensions-v14.mjs';
export const bindingScopesV15=true;
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&Array.isArray(p.effects);
const singular=text=>text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|cards)\b/g,word=>word.slice(0,-1));
export function normalizeCard(card){return v14.normalizeCard({...card,oracle_text:(card.oracle_text||'').replace(/^Mage Hand — /gm,'')});}
export function modifierOperation(card,line,h){
  if(line==='As an additional cost to cast this spell, pay X life.'&&/\{X\}/.test(card.mana_cost||'')){
    const costs=parseOracleAdditionalCosts(line);if(costs?.length===1&&costs[0].kind==='payLife'&&costs[0].amount.kind==='variable')return {kind:'mechanic-additional-costs',costs,contract:'mechanic-additional-costs'};
  }
  return v14.modifierOperation(card,line,h);
}
export function extensionTarget(text,h){
  const attacking=/^(target [^.]+?) that's attacking you$/.exec(text);
  if(attacking){const parsed=h.target(attacking[1]);if(parsed?.zone==='battlefield'&&parsed.what==='creature')return {...parsed,attacking:true,attackingYouV9:true};}
  const notNamed=/^(target (?:creature|artifact|enchantment|land|permanent)(?: you control| an opponent controls)?) not named ([^.\n]+)$/.exec(text);
  if(notNamed){const parsed=h.target(notNamed[1]);if(parsed?.zone==='battlefield')return {...parsed,excludedFiltersV10:[{what:'permanent',zone:'battlefield',controller:'any',name:notNamed[2]}]};}
  if(text==="target card from defending player's graveyard")return {...h.target('target card from your graveyard'),controller:'defending-player'};
  const named=/^(target (?:creature|artifact|enchantment|land|permanent)(?: you control| an opponent controls)?) named ([^.\n]+)$/.exec(text);
  if(named){const parsed=h.target(named[1]);if(parsed?.zone==='battlefield')return {...parsed,name:named[2]};}
  const players=/^(up to )?(one|two|three|four|[1-9][0-9]*) target players$/.exec(text);
  if(players){const n=({one:1,two:2,three:3,four:4})[players[2]]??Number(players[2]);return {...h.target('target player'),min:players[1]?0:n,max:n};}
  const trailing=/^(.*?target .+?) (in|from) (your|an opponent's|a player's) graveyard (with .+)$/.exec(text);
  if(trailing){const parsed=h.target(trailing[1]+' '+trailing[4]+' from '+trailing[3]+' graveyard');if(parsed?.zone==='graveyard')return parsed;}
  const exact=/^(.*?target .+?) with (mana value|power|toughness) (X|[0-9]+)( from (?:your|an opponent's|a player's) graveyard)?$/.exec(text);
  if(exact){const parsed=h.target(exact[1]+(exact[4]||''));if(parsed&&['battlefield','graveyard'].includes(parsed.zone))return {...parsed,stat:exact[2]==='mana value'?'mv':exact[2],threshold:exact[3]==='X'?'X':Number(exact[3]),comparison:'equal'};}
  if(/\bnonattacking\b/.test(text)){const parsed=h.target(text.replace(/\bnonattacking,? ?/,''));if(parsed?.zone==='battlefield')return {...parsed,excludedFiltersV10:[...(parsed.excludedFiltersV10||[]),{what:'creature',zone:'battlefield',controller:'any',attacking:true}]};}
  return v14.extensionTarget(text,h);
}
export function extensionEffect(card,line,h){
  if(line==='For each of X target permanents, create X tokens that are copies of that permanent.')return body([{action:'copy-token',target:0,n:'X'}],[{...h.target('target permanent'),min:0,max:0,targetCountX:true}]);
  if(line==='Until end of turn, all creatures become black and all lands become Swamps.'){
    const creatures=h.effect(card,'All creatures become black until end of turn.');if(complete(creatures))return body([...creatures.effects,{action:'battlefield-group',operation:'land-types-v15',filters:[h.target('target land')],types:['Swamp'],retain:false}]);
  }
  const drawn=/^Draw (two|three|four|[0-9]+) cards, then discard (one|two|three|[0-9]+) of them\.$/.exec(line);
  if(drawn)return body([{action:'draw-followup-v15',n:({two:2,three:3,four:4})[drawn[1]]??Number(drawn[1]),discardN:({one:1,two:2,three:3})[drawn[2]]??Number(drawn[2])}]);
  if(line==="Draw a card and reveal it. If it isn't a land card, discard it.")return body([{action:'draw-followup-v15',n:1,reveal:true,discardNonland:true}]);
  const libraryChoice=/^Put (?:a|an) (creature|artifact|enchantment|land|permanent) you control on (top|the bottom) of its owner's library\.$/.exec(line);
  if(libraryChoice)return body([{action:'choose-permanents',who:'you',operation:libraryChoice[2]==='top'?'library-top-v15':'library-bottom-v15',n:1,filter:h.target('target '+libraryChoice[1]+' you control')}]);
  const manaEither=/^(Add [^.]+)\. Spend this mana only to (?:activate an ability or cast (an? [^.]+ spell)|cast (an? [^.]+ spell) or to activate an ability)\.$/.exec(line);
  if(manaEither){const parsed=h.effect(card,manaEither[1]+'.'),spell=h.target('target '+(manaEither[2]||manaEither[3]).replace(/^an? /,''));if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='add-mana'&&spell?.zone==='stack')return body([{...parsed.effects[0],restriction:{spell,abilities:true}}]);}
  const movePair=/^(Return|Exile) (this creature|this artifact|this enchantment|this permanent) and (target [^.]+?)( to their owner's hand)?\.$/.exec(line);
  if(movePair&&(movePair[1]==='Return')===!!movePair[4]){const target=h.target(movePair[3]);if(target?.zone==='battlefield')return body([{action:movePair[1]==='Return'?'bounce':'exile',target:{kind:'selected-union-v15',indices:['self',0]},simultaneousV15:true}],[target]);}
  if(line==="Return enchanted creature and this Aura to their owners' hands.")return body([{action:'bounce',target:{kind:'selected-union-v15',indices:['attached-host','self']},simultaneousV15:true}]);
  const separateCounters=/^Put (an? [^.]+? counter) on this creature and (an? [^.]+? counter) on (target [^.]+)\.$/.exec(line);
  if(separateCounters){const first=h.effect(card,'Put '+separateCounters[1]+' on this creature.'),second=h.effect(card,'Put '+separateCounters[2]+' on '+separateCounters[3]+'.');if(complete(first)&&complete(second)&&!first.targets.length&&second.targets.length===1&&first.effects.length===1&&second.effects.length===1&&[first,second].every(p=>p.effects[0].action==='counter'))return body([...first.effects,...second.effects],second.targets);}
  const noRegen=/^(Target creature|This creature|It|That creature) can't be regenerated this turn\.$/.exec(line);
  if(noRegen)return body([{action:'forbid-regeneration-v15',target:noRegen[1]==='Target creature'?0:noRegen[1]==='This creature'?'self':'unbound-object-v10'}],noRegen[1]==='Target creature'?[h.target('target creature')]:[]);
  const burned=/^([^.]+ deals [^.]+ damage to [^.]+)\. (?:A creature|Creatures) dealt damage this way can't be regenerated this turn\.$/.exec(line);
  if(burned){const parsed=h.effect(card,burned[1]+'.');if(complete(parsed)&&parsed.effects.length===1&&(parsed.effects[0].action==='damage'||parsed.effects[0].action==='battlefield-group'&&parsed.effects[0].operation==='damage'))return {...parsed,effects:[{...parsed.effects[0],noRegenDamagedV15:true}]};}
  const burnedExile=/^([^.]+ deals [^.]+ damage to any target)\. (If it's a creature, it can't be regenerated this turn, and if it would die this turn, exile it instead|If this spell was kicked, that creature can't be regenerated this turn and if it would die this turn, exile it instead)\.$/.exec(line);
  if(burnedExile){const parsed=h.effect(card,burnedExile[1]+'.');if(complete(parsed)&&parsed.targets.length===1&&parsed.effects.length===1&&parsed.effects[0].action==='damage'){
    let effect={action:'conditional',conditionTarget:0,condition:{kind:'source-quality',filter:h.target('target creature')},effects:[{action:'forbid-regeneration-v15',target:0},{action:'death-exile',target:0}]};
    if(burnedExile[2].startsWith('If this spell')){const condition=h.condition('this spell was kicked');if(!condition)return null;effect={action:'conditional',condition,effects:[effect]};}
    return body([...parsed.effects,effect],parsed.targets);
  }}
  if(line==='Choose two target creatures. Tap those creatures, then unattach all Equipment from them.')return body([{action:'tap',target:0},{action:'unattach-equipment-v9',target:0}],[{...h.target('target creature'),min:2,max:2}]);
  const basics=['Plains','Island','Swamp','Mountain','Forest'];
  if(line==='Lands you control gain all basic land types until end of turn.')return body([{action:'battlefield-group',operation:'land-types-v15',filters:[h.target('target land you control')],types:basics,retain:true}]);
  if(line==='Choose a basic land type. Each land you control becomes that type until end of turn.')return body([{action:'battlefield-group',operation:'land-types-v15',filters:[h.target('target land you control')],types:basics,retain:false,choose:true}]);
  const landType=/^(?:Until end of turn, (target land(?: you control| an opponent controls)?) becomes (?:the|a) basic land type of your choice( in addition to its other types)?|(Target land(?: you control| an opponent controls)?) becomes (?:the|a) basic land type of your choice( in addition to its other types)? until end of turn)\.$/.exec(line);
  if(landType)return body([{action:'set-basic-land-types-v8',target:0,types:basics,retain:!!(landType[2]||landType[4]),choose:true,duration:'eot'}],[h.target((landType[1]||landType[3]).toLowerCase())]);
  if(line.includes('two times X')){const parsed=h.effect(card,line.replace(/two times X/g,'twice X'));if(complete(parsed))return parsed;}
  const playerFilter=/^(Each player|Each opponent) who (controls|doesn't control) (?:a|an) ([^.]+?) (draws|gains|loses|mills|discards) ([^.]+)\.$/.exec(line);
  if(playerFilter){const filter=h.target('target '+playerFilter[3]+' you control'),parsed=h.effect(card,'Target player '+playerFilter[4]+' '+playerFilter[5]+'.');if(filter?.zone==='battlefield'&&complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='player'){
    const condition={kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',controller:'you',filters:[filter]},min:1};
    return body([{action:'player-sequence-v9',who:playerFilter[1]==='Each player'?'each-player':'each-opponent',effects:[{action:'conditional',condition:{kind:'player-condition-v15',who:'sequence-player-v15',condition:playerFilter[2]==="doesn't control"?{kind:'not',condition}:condition},effects:replaceReferences(parsed.effects,0,'sequence-player-v15')}]}]);
  }}
  const conditionalPlayer=/^If (target player|target opponent) has exactly ([0-9]+) life, ([^.]+)\.$/.exec(line);
  if(conditionalPlayer){const parsed=h.effect(card,conditionalPlayer[3].replace(/that player/g,conditionalPlayer[1])+'.');if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='player')return body([{action:'conditional',condition:{kind:'player-condition-v15',who:0,condition:{kind:'count-comparison',count:{kind:'life-total'},min:Number(conditionalPlayer[2]),max:Number(conditionalPlayer[2])}},effects:parsed.effects}],parsed.targets);}
  const fixedRedraw=/^(Target player|Target opponent) discards (one|two|three|[0-9]+) cards, then draws as many cards as they discarded this way\.$/.exec(line);
  if(fixedRedraw){const n=({one:1,two:2,three:3})[fixedRedraw[2]]??Number(fixedRedraw[2]);return body([{action:'discard-redraw-v12',who:0,max:n,minV15:n,bonus:0}],[h.target(fixedRedraw[1].toLowerCase())]);}
  if(line==='Each player discards all the cards in their hand, then draws that many cards minus one.')return body([{action:'discard-hand-draw',who:'each-player',n:'discarded',adjustV15:-1}]);
  const returnLand=/^(That player|Each player|Each opponent) returns? (?:a|an) (.+?) they control to its owner's hand\.$/.exec(line);
  if(returnLand){const filter=h.target('target '+returnLand[2]);if(filter?.zone==='battlefield')return body([{action:'choose-permanents',who:({'That player':'event-player','Each player':'each-player','Each opponent':'each-opponent'})[returnLand[1]],operation:'bounce',filter,n:1}]);}
  const delayedToken=/^(Sacrifice|Destroy|Exile) that token (at the beginning of (?:your )?(?:next |the next )?end step)\.$/.exec(line);
  if(delayedToken){const parsed=h.effect(card,delayedToken[1]+' it '+delayedToken[2]+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='delayed-object')return {...parsed,effects:[{...parsed.effects[0],target:'unbound-object-v10'}]};}
  const thenUnless=/^([^"\n]+?), then ([^"\n]+ unless [^"\n]+)\.$/.exec(line);
  if(thenUnless){let text=thenUnless[1]+'. '+thenUnless[2][0].toUpperCase()+thenUnless[2].slice(1)+'.';if(/^Put a \+1\/\+1 counter on this creature$/.test(thenUnless[1]))text=text.replace(/for each \+1\/\+1 counter on it\.$/,'for each +1/+1 counter on this creature.');const parsed=h.effect(card,text);if(complete(parsed))return parsed;}
  if(/\b(?:Instant|Sorcery)\b/.test(card.type_line||'')&&line==='Exile '+card.name+'.')return body([{action:'exile-resolving-spell'}]);
  if(/\b(?:Instant|Sorcery)\b/.test(card.type_line||'')&&line==='Put '+card.name+" on the bottom of its owner's library.")return body([{action:'library-resolving-spell-v15',position:'bottom'}]);
  const doubled=/^(You gain |Gain |Each opponent loses |.+? deals |Remove )twice X( life| damage to .+| loyalty counters from .+)\.$/.exec(line);
  if(doubled){const parsed=h.effect(card,doubled[1]+'X'+doubled[2]+'.');if(complete(parsed)&&parsed.effects.length===1&&['gain-life','lose-life','damage','battlefield-group','remove-counter','remove-counters-v8'].includes(parsed.effects[0].action)&&parsed.effects[0].n==='X')return {...parsed,effects:[{...parsed.effects[0],n:{kind:'sum',values:['X','X']}}]};}
  const variableToken=/^(Create (?:a|an|one|two|three|[0-9]+) (?:tapped )?)(X|[0-9]+)\/(X|[0-9]+) (.+? creature tokens?(?: with [^.]+?)?)(?:, where X is (.+))?\.$/.exec(line);
  if(variableToken&&(variableToken[2]==='X'||variableToken[3]==='X')){
    const value=variableToken[5]?(h.value(variableToken[5])??h.count(variableToken[5].replace(/^the number of /,''))):'X',parsed=value!==null&&value!==undefined&&h.effect(card,variableToken[1]+'1/1 '+variableToken[4]+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='token-inline')return body([{...parsed.effects[0],token:{...parsed.effects[0].token,power:variableToken[2]==='X'?value:Number(variableToken[2]),toughness:variableToken[3]==='X'?value:Number(variableToken[3])}}]);
  }
  const destruction=/^Destroy (target .+?) and (target .+?)\.( They can't be regenerated\.)?$/.exec(line);
  if(destruction){const targets=[h.target(destruction[1]),h.target(destruction[2])];if(targets.every(target=>target?.zone==='battlefield'&&(target.max??1)===1))return body([{action:'destroy',target:{kind:'selected-union-v15',indices:[0,1]},noRegen:!!destruction[3]}],targets);}
  const namedPump=/^Each (creature(?: you control| an opponent controls)? named [^.\n]+) gets ([+-][0-9]+)\/([+-][0-9]+) until end of turn\.$/.exec(line);
  if(namedPump){const filter=h.target('target '+namedPump[1]);if(filter)return body([{action:'battlefield-group',operation:'pump',filters:[filter],power:Number(namedPump[2]),toughness:Number(namedPump[3]),keywords:[]}]);}
  const returned=/^Return (?:each|all) (.+?) from your graveyard to (your hand|the battlefield)( tapped)?\.$/.exec(line);
  if(returned){const filter=h.target('target '+singular(returned[1]).replace(/,? and /g,' or ')+' from your graveyard'),destination=returned[2]==='your hand'?'hand':'battlefield';
    const permanent=spec=>spec.alternatives?spec.alternatives.every(permanent):['creature','artifact','enchantment','planeswalker','land','permanent','nonland permanent','artifact or enchantment','artifact or creature','creature or land'].includes(spec.what);
    if(filter?.zone==='graveyard'&&(!returned[3]||destination==='battlefield')&&(destination==='hand'||permanent(filter)))return body([{action:'zone-select',who:'you',zone:'graveyard',filter,n:'all',destination,tapped:!!returned[3]}]);
  }
  const random=/^Return (a|one|two|three|X|[0-9]+) (.+?) at random from your graveyard to your hand\.$/.exec(line);
  if(random){const filter=h.target('target '+singular(random[2])+' from your graveyard');if(filter?.zone==='graveyard')return body([{action:'zone-random-v14',who:'you',zone:'graveyard',destination:'hand',n:({a:1,one:1,two:2,three:3})[random[1]]??(random[1]==='X'?'X':Number(random[1])),filterV15:filter}]);}
  const counters=/^Put (.+? counter(?:s)?(?:, .+?| and .+?)) on (target .+?)\.( Untap it\.)?$/.exec(line);
  if(counters&&!/["\n]/.test(counters[1])){
    const pieces=counters[1].split(/,? and |, /),parsed=pieces.map(piece=>h.effect(card,'Put '+piece+' on '+counters[2]+'.'));
    if(pieces.length>1&&parsed.every(p=>complete(p)&&p.targets.length===1&&JSON.stringify(p.targets)===JSON.stringify(parsed[0].targets)&&p.effects.length===1&&p.effects[0].action==='counter'&&p.effects[0].target===0))return body([...parsed.flatMap(p=>p.effects),...(counters[3]?[{action:'untap',target:0}]:[])],parsed[0].targets);
  }
  const token=/^(Its controller|Its owner) creates? (.+)\.$/.exec(line);
  if(token){const parsed=h.effect(card,'Create '+token[2]+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.every(e=>['token-key','token-inline','predefined-token-v8'].includes(e.action)&&e.who==='you'))return body(parsed.effects.map(e=>({...e,who:token[1]==='Its controller'?'event-card-controller':'event-card-owner'})));}
  const excluded=/^(.+? deals .+? damage to each .+?) except for (.+)\.$/.exec(line);
  if(excluded){const parsed=h.effect(card,excluded[1]+'.'),filter=h.target('target '+singular(excluded[2]));if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='battlefield-group'&&parsed.effects[0].operation==='damage'&&filter?.zone==='battlefield')return body([{...parsed.effects[0],filters:parsed.effects[0].filters.map(base=>({...base,excludedFiltersV10:[...(base.excludedFiltersV10||[]),filter]}))}]);}
  const redraw=/^(Each player|Each opponent) discards any number of cards, then draws that many cards\.$/.exec(line);
  if(redraw)return body([{action:'discard-redraw-v12',who:redraw[1]==='Each player'?'each-player':'each-opponent',max:'all',bonus:0,simultaneousV15:true}]);
  const players=/^((?:Up to )?(?:one|two|three|four|[0-9]+) target players) each (draw|discard) (a|one|two|three|[0-9]+) cards?\.$/.exec(line);
  if(players){const target=h.target(players[1].toLowerCase());if(target?.zone==='player')return body([{action:'player-sequence-v9',who:0,effects:[{action:players[2],who:'sequence-player-v15',n:({a:1,one:1,two:2,three:3})[players[3]]??Number(players[3])}]}],[target]);}
  return v14.extensionEffect(card,line,h);
}
const scopedKeys=new Set(['operation','grantedOperation','trigger','operations','modalBody','modes']);
function replaceReferences(value,from,to){
  if(Array.isArray(value))return value.map(child=>replaceReferences(child,from,to));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,scopedKeys.has(key)?child:['target','who','otherTarget','conditionTarget','sourceTarget'].includes(key)&&child===from?to:replaceReferences(child,from,to)]));
}
function normalizeBody(operation){
  operation=Object.fromEntries(Object.entries(operation).map(([key,value])=>[key,Array.isArray(value)?value.map(child=>child&&typeof child==='object'?normalizeBody(child):child):value&&typeof value==='object'?normalizeBody(value):value]));
  if(!Array.isArray(operation.effects))return operation;
  let created=false,manifested=false;
  const effects=operation.effects.map(effect=>{
    if(created&&['counter','pump','scale-pt','delayed-object','conditional'].includes(effect.action))effect=replaceReferences(effect,'unbound-object-v10','created-tokens');
    if(manifested&&effect.action==='counter')effect=replaceReferences(effect,'unbound-object-v10','manifested-v15');
    if(['token-inline','token-key'].includes(effect.action)&&effect.who==='you'&&effect.n===1)created=true;
    else if(!['counter','pump','scale-pt','delayed-object','conditional'].includes(effect.action))created=false;
    if(effect.action==='face-down'&&effect.n===1&&effect.who==='you'){manifested=true;effect={...effect,captureMadeV15:true};}
    else if(effect.action!=='counter')manifested=false;
    if(effect.n&&JSON.stringify(effect.n).includes('"target":"event-player"')){
      const reference=effect.who??effect.target,target=typeof reference==='number'?operation.targets?.[reference]:null;
      if(target?.zone==='player')effect={...effect,n:replaceReferences(effect.n,'event-player',reference)};
      else if(['each-player','each-opponent'].includes(reference))effect={action:'player-sequence-v9',who:reference,effects:[{...effect,...(effect.who?{who:0}:{target:0}),n:replaceReferences(effect.n,'event-player',0)}]};
    }
    if(operation.kind==='generic-trigger'&&operation.eventFilter==='self'&&!operation.targets?.length&&['counter','pump','scale-pt','untap','tap'].includes(effect.action))effect=replaceReferences(effect,'unbound-object-v10','self');
    return effect;
  });
  return {...operation,effects};
}
export function normalizeManaOperation(operation){
  const normalized=normalizeBody(operation);
  return v14.normalizeManaOperation(normalized)||(JSON.stringify(normalized)!==JSON.stringify(operation)?normalized:null);
}
export function extensionLine(card,line,h){
  const manaEither=/^([^:]+): (Add [^.]+)\. Spend this mana only to (?:activate an ability or cast (an? [^.]+ spell)|cast (an? [^.]+ spell) or to activate an ability)\.$/.exec(line);
  if(manaEither){const operation=h.line(card,manaEither[1]+': '+manaEither[2]+'.'),spell=h.target('target '+(manaEither[3]||manaEither[4]).replace(/^an? /,''));if(operation?.kind==='mana-source'&&spell?.zone==='stack')return {...operation,restriction:{spell,abilities:true}};}
  const enteringLand=/^Whenever a land enters, its controller creates? ([^.]+)\.$/.exec(line);
  if(enteringLand){const parsed=h.effect(card,'Its controller creates '+enteringLand[1]+'.');if(complete(parsed)&&!parsed.targets.length)return {kind:'generic-trigger',event:'etb',eventFilter:{kind:'filtered-object',target:h.target('target land'),another:false},...parsed,contract:'generic-trigger-effect'};}
  const walk=/^Creatures with (plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|landwalk abilities) can be blocked as though they didn't have (plainswalk|islandwalk|swampwalk|mountainwalk|forestwalk|those abilities)\.$/.exec(line);
  if(walk&&(walk[1]===walk[2]||walk[1]==='landwalk abilities'&&walk[2]==='those abilities'))return {kind:'landwalk-override-v15',keywords:walk[1]==='landwalk abilities'?['all']:[walk[1]],contract:'landwalk-override-v15'};
  const attachedWalk=/^Enchanted creature gets ([+-][0-9]+)\/([+-][0-9]+) and can block creatures with landwalk abilities as though they didn't have those abilities\.$/.exec(line);
  if(attachedWalk&&/\bAura\b/.test(card.type_line||''))return {kind:'landwalk-override-v15',keywords:['all'],attached:true,power:Number(attachedWalk[1]),toughness:Number(attachedWalk[2]),contract:'landwalk-override-v15'};
  const alone=/^Whenever (this creature|enchanted creature|equipped creature) attacks alone, (.+)$/.exec(line);
  if(alone){const parsed=h.effect(card,alone[2]);if(parsed&&!parsed.optional&&!parsed.v4Body)return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',totalMin:1,totalMax:1,subject:alone[1]==='this creature'?'self':'attached'},...parsed,contract:'generic-trigger-effect'};}
  return v14.extensionLine(card,line,h);
}
