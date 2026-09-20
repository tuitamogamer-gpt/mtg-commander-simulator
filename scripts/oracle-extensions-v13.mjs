// Closed additive grammar; successful v12 definitions remain frozen.
import * as v12 from './oracle-extensions-v12.mjs';
import * as damageEvents from './oracle-v8-damage-events.mjs';
export * from './oracle-extensions-v12.mjs';
export const targetedStackV13=true;
export const objectEventsV13=true;
export function normalizeCard(card){
  let text=card.oracle_text||'';
  if(/\bLegendary\b/.test(card.type_line||'')&&card.name?.includes(',')){
    const short=card.name.split(',')[0];
    if(!short.includes(' ')){
      const escaped=short.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text=text.split('"').map((part,index)=>index%2?part:part.replace(new RegExp('\\b(Exile|exile|Return|return|Sacrifice|sacrifice|Untap|untap|Tap|tap) '+escaped+'(?=[.;]| to )','g'),'$1 '+card.name)).join('"');
    }
  }
  return v12.normalizeCard({...card,oracle_text:text});
}
export function modifierOperation(card,line,h){
  if(line==='Cipher'&&/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return {kind:'mechanic-cipher-v13',contract:'mechanic-cipher-v13'};
  const transfigure=/^Transfigure ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(transfigure&&/\bCreature\b/.test(card.type_line||''))return h.line(card,transfigure[1]+', Sacrifice this creature: Search your library for a creature card with the same mana value as this creature, put that card onto the battlefield, then shuffle. Activate only as a sorcery.');
  const surge=/^Surge ((?:\{(?:[0-9]+|X|[WUBRGC])\})+)$/.exec(line);
  if(surge&&surge[1].includes('{X}'))return {kind:'mechanic-surge',cost:surge[1],contract:'mechanic-surge'};
  return v12.modifierOperation(card,line,h);
}
const body=(effects,targets=[])=>({effects,targets,optional:false});
const complete=p=>p&&!p.optional&&!p.v4Body&&Array.isArray(p.targets)&&Array.isArray(p.effects);
function bind(value,reference){
  if(Array.isArray(value))return value.map(child=>bind(child,reference));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='operation'?child:['target','who','sourceTarget','otherTarget','conditionTarget'].includes(key)&&child===0?reference:bind(child,reference)]));
}
export function extensionTarget(text,h){
  const zone=/ (?:from|in) (?:your|an opponent's|a player's) graveyard$/.exec(text)?.[0]||'';
  const relative=/^(target .+?) with (?:(?:the same (mana value|power|toughness) as (this (?:creature|artifact|enchantment|permanent)))|(?:(mana value|power|toughness) (equal to|less than or equal to|greater than or equal to) (.+)))$/.exec(zone?text.slice(0,-zone.length):text);
  if(relative){const stat=relative[2]||relative[4],target=h.target(relative[1]+zone),value=h.value(relative[2]?relative[3]+"'s "+stat:relative[6]);if(target&&value!==null&&value!==undefined&&typeof value==='object'&&!/event-|target-stat/.test(JSON.stringify(value)))return {...target,stat:stat==='mana value'?'mv':stat,threshold:value,comparison:relative[5]==='less than or equal to'?'less':relative[5]==='greater than or equal to'?'greater':'equal'};}
  const spellStat=/^(target .+?spell) with (power|toughness) ([0-9]+)( or greater| or less)?$/.exec(text);
  if(spellStat){const target=h.target(spellStat[1]);if(target?.zone==='stack')return {...target,stat:spellStat[2],threshold:Number(spellStat[3]),comparison:spellStat[4]===' or greater'?'greater':spellStat[4]===' or less'?'less':'equal'};}
  const spellKeyword=/^(target (?:.+? )?spell) (?:with|that has) (infect|flash|deathtouch|lifelink|vigilance|haste|trample|first strike|double strike|reach|menace|hexproof|indestructible|shadow|fear|intimidate)$/.exec(text);
  if(spellKeyword){const target=h.target(spellKeyword[1]);if(target?.zone==='stack')return {...target,withKeyword:spellKeyword[2]};}
  if(text==='target player or battle')return {what:'any',zone:'battlefield',min:1,alternatives:[{what:'player',zone:'player',min:1},{what:'battle',zone:'battlefield',controller:'any',min:1}]};
  return v12.extensionTarget(text,h);
}
export function extensionEffect(card,line,h){
  const playerSequence=/^(Target (?:player|opponent)) (loses [^,.]+), (discards [^,.]+), then (sacrifices [^,.]+)\.$/.exec(line);
  if(playerSequence){
    const first=h.effect(card,playerSequence[1]+' '+playerSequence[2]+'.');
    const rest=playerSequence.slice(3).map(part=>h.effect(card,'You '+part.replace(/^(discards|sacrifices)/,word=>word.slice(0,-1))+'.'));
    if(complete(first)&&first.targets.length===1&&rest.every(parsed=>complete(parsed)&&!parsed.targets.length))return body([...first.effects,...rest.flatMap(parsed=>parsed.effects.map(effect=>({...effect,who:0})))],first.targets);
  }
  if(/^[a-z]/.test(line)){const parsed=h.effect(card,line[0].toUpperCase()+line.slice(1));if(parsed)return parsed;}
  const counterUntap=/^(Put (?:a|one|two|three|[0-9]+) [+-][0-9]+\/[+-][0-9]+ counters? on this creature) and (untap|tap) it\.$/.exec(line);
  if(counterUntap){const parsed=h.effect(card,counterUntap[1]+'.');if(complete(parsed)&&!parsed.targets.length)return body([...parsed.effects,{action:counterUntap[2],target:'self'}]);}
  if(!/["\n]/.test(line)&&/ (?:until end of combat|this combat)\.$/.test(line)){
    const parsed=h.effect(card,line.replace(/until end of combat\.$/,'until end of turn.').replace(/this combat\.$/,'this turn.'));
    if(complete(parsed)&&parsed.effects.every(effect=>['pump','pump-group','combat-restriction','grant-operation'].includes(effect.action)||effect.action==='battlefield-group'&&effect.operation==='pump'))return {...parsed,effects:parsed.effects.map(effect=>({...effect,duration:'combat'}))};
  }
  const noRegen=/^(Destroy (?:that creature|the other creature|it))\. It can't be regenerated\.$/.exec(line);
  if(noRegen){const parsed=h.effect(card,noRegen[1].replace('the other creature','that creature')+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='destroy')return {...parsed,effects:[{...parsed.effects[0],noRegen:true}]};}
  if(line==='Destroy the other creature.')return h.effect(card,'Destroy that creature.');
  if(line==='Destroy both creatures.'||line==='Destroy that creature and this creature.')return body([{action:'destroy',target:'event-card'},{action:'destroy',target:'self'}]);
  if(line==='Counter that spell or ability.')return body([{action:'counter-spell',target:'event-stack-v10'}]);
  const attached=/^(Destroy|Exile) all (.+?) attached to (that creature|it)\.$/.exec(line);
  if(attached){const parsed=h.effect(card,attached[1]+' all '+attached[2]+' attached to target creature.');if(complete(parsed)&&parsed.targets.length===1)return body(bind(parsed.effects,'event-card'));}
  const permanentGroup=/^(All |Each )?(.+?) phase out\.$/i.exec(line);
  if(permanentGroup&&!/\b(?:it|that|target|this)\b/.test(permanentGroup[2])){
    const parsed=h.effect(card,'Tap all '+permanentGroup[2][0].toLowerCase()+permanentGroup[2].slice(1)+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='battlefield-group')return body([{action:'phase-out-v8',filters:parsed.effects[0].filters}]);
  }
  if(line==='This creature and that creature phase out.')return body([{action:'phase-out-v8',target:'self'},{action:'phase-out-v8',target:'event-card'}]);
  return v12.extensionEffect(card,line,h);
}
export function extensionLine(card,line,h){
  const explicitAttack=/^Whenever (?:a creature|a creature you control) attacks, (.+)$/.exec(line);
  if(explicitAttack&&/^(?:(?:exile|return|sacrifice|tap|untap) this creature|this creature)\b/.test(explicitAttack[1])){
    const parsed=h.effect(card,explicitAttack[1]);if(parsed)return {kind:'generic-trigger',event:'attacks',eventFilter:{kind:'filtered-object',target:{what:'creature',zone:'battlefield',controller:line.startsWith('Whenever a creature you control')?'you':'any',min:1}},...parsed,contract:'generic-trigger-effect'};
  }
  const fromAnywhere=/^When (?:this (?:creature|artifact|enchantment|permanent|card)) is put into a graveyard from anywhere, (.+)$/.exec(line);
  if(fromAnywhere){
    if(fromAnywhere[1]==='its owner shuffles their graveyard into their library.'){
      const parsed=h.effect(card,'Shuffle your graveyard into your library.');
      if(complete(parsed)&&!parsed.targets.length)return {kind:'generic-trigger',event:'c14EnteredGraveyard',eventFilter:{kind:'object-event-v13',self:true},zone:'graveyard',...parsed,effects:parsed.effects.map(effect=>({...effect,who:'event-card-owner'})),contract:'generic-trigger-effect'};
    }
    const parsed=h.line(card,'When this creature dies, '+fromAnywhere[1]);if(parsed?.kind==='generic-trigger'){
    const rebind=value=>Array.isArray(value)?value.map(rebind):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,child])=>[key,key==='target'&&child==='self'?'event-card':rebind(child)])):value;
    return {...parsed,event:'c14EnteredGraveyard',eventFilter:{kind:'object-event-v13',self:true},zone:'graveyard',effects:rebind(parsed.effects)};
  }}
  const plotted=/^When this card becomes plotted, (.+)$/.exec(line);
  if(plotted){const parsed=h.effect(card,plotted[1]);if(parsed)return {kind:'generic-trigger',event:'oraclePlottedV13',eventFilter:{kind:'object-event-v13',self:true},zone:'exile',...parsed,contract:'generic-trigger-effect'};}
  const countered=/^Whenever (a spell or ability you control counters a spell|a spell you've cast is countered), (.+)$/.exec(line);
  if(countered){const parsed=h.effect(card,countered[2]);if(parsed)return {kind:'generic-trigger',event:'oracleSpellCounteredV13',eventFilter:{kind:'countered-v13',byYou:countered[1].startsWith('a spell or ability')},...parsed,contract:'generic-trigger-effect'};}
  const union=/^(When|Whenever) (a player casts a spell or a creature attacks|this creature enters or becomes the target of a spell or ability an opponent controls), (.+)$/.exec(line);
  if(union){const headers=union[2].startsWith('a player')?['Whenever a player casts a spell','Whenever a creature attacks']:['When this creature enters','Whenever this creature becomes the target of a spell or ability an opponent controls'];
    const parts=headers.map(header=>h.line(card,header+', '+union[3]));
    if(parts.every(part=>part?.kind==='generic-trigger'&&!part.zone&&!part.onceEachTurn&&!part.oncePerBatch&&!part.condition)&&JSON.stringify(parts[0].effects)===JSON.stringify(parts[1].effects)&&JSON.stringify(parts[0].targets)===JSON.stringify(parts[1].targets))return {...parts[0],event:[...new Set(parts.map(part=>part.event))],eventFilter:{kind:'either',clauses:parts.map(part=>({event:part.event,eventFilter:part.eventFilter}))}};
  }
  const dynamicCast=/^Whenever (you cast|an opponent casts|a player casts) (?:a|an|another) ((?:.+? )?spell with (?:mana value|power|toughness) (?:equal to|less than or equal to|greater than or equal to) .+?), (.+)$/.exec(line);
  if(dynamicCast){const target=h.target('target '+dynamicCast[2]),parsed=h.effect(card,dynamicCast[3]);if(target?.zone==='stack'&&parsed){
    const amount=value=>Array.isArray(value)?value.map(amount):value&&typeof value==='object'?value.kind==='event-amount'?{kind:'event-spell-mv-v10'}:Object.fromEntries(Object.entries(value).map(([key,child])=>[key,amount(child)])):value;
    return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'qualified-cast-v8',controller:dynamicCast[1]==='you cast'?'you':dynamicCast[1]==='an opponent casts'?'opponent':'any',target},...parsed,effects:amount(parsed.effects),contract:'generic-trigger-effect'};
  }}
  const cast=/^Whenever (you cast|an opponent casts|a player casts) (?:a|an|another) ((?:.+? )?spell (?:with (?:infect|flash|deathtouch|lifelink|vigilance|haste|trample|first strike|double strike|reach|menace|hexproof|indestructible|shadow|fear|intimidate|(?:power|toughness) [0-9]+(?: or greater| or less)?)|that has flash)), (.+)$/.exec(line);
  if(cast){const target=h.target('target '+cast[2]),parsed=h.effect(card,cast[3]);if(target?.zone==='stack'&&parsed)return {kind:'generic-trigger',event:'cast',eventFilter:{kind:'qualified-cast-v8',controller:cast[1]==='you cast'?'you':cast[1]==='an opponent casts'?'opponent':'any',target},...parsed,contract:'generic-trigger-effect'};}
  const minimum=/^Whenever (.+?) deals ([1-9][0-9]*) or more (combat |noncombat )?damage(.*)$/.exec(line);
  if(minimum){const parsed=damageEvents.extensionLine(card,'Whenever '+minimum[1]+' deals '+(minimum[3]||'')+'damage'+minimum[4],h);if(parsed?.kind==='generic-trigger'&&parsed.eventFilter?.kind==='damage-event-v8')return {...parsed,eventFilter:{...parsed.eventFilter,minDamageV13:Number(minimum[2])}};}
  const singleSource=/^Whenever an opponent is dealt ([1-9][0-9]*) or more damage by a single source, (.+)$/.exec(line);
  if(singleSource){const parsed=damageEvents.extensionLine(card,'Whenever a source deals damage to an opponent, '+singleSource[2],h);if(parsed?.eventFilter?.kind==='damage-event-v8')return {...parsed,eventFilter:{...parsed.eventFilter,minDamageV13:Number(singleSource[1])}};}
  const attack=/^Whenever (two|three|four|five|[0-9]+) or more (creatures|creatures your opponents control) attack, (.+)$/.exec(line);
  if(attack){const parsed=h.effect(card,attack[3]);if(parsed)return {kind:'generic-trigger',event:'attackersDeclared',eventFilter:{kind:'v8-event',player:attack[2].includes('opponents')?'opponent':'any',totalMin:({two:2,three:3,four:4,five:5})[attack[1]]??Number(attack[1])},...parsed,contract:'generic-trigger-effect'};}
  return v12.extensionLine(card,line,h);
}
