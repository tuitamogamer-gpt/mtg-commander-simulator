// Additive, closed grammar. Earlier complete-card compiler results are frozen.
import * as v10 from './oracle-extensions-v10.mjs';
import {normalizeManaOperations} from './oracle-extensions-v8.mjs';
import {ORACLE_SUBTYPES, ORACLE_SUBTYPE_TYPES} from './oracle-subtypes.mjs';
export * from './oracle-extensions-v10.mjs';
export const exactCreatureLines = true;
export const exactEffectLines = true;
export const grantableKeywords = [...v10.grantableKeywords,'decayed'];

const body = (effects, targets = [], optional = false) => ({effects, targets, optional});
const singular = text => text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|battles|tokens|cards)\b/gi, word => word.slice(0, -1));
const numbers = {a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const number = value => numbers[value.toLowerCase()] ?? Number(value);
const complete = parsed => parsed && !parsed.v4Body && !parsed.optional && Array.isArray(parsed.targets) && Array.isArray(parsed.effects);
function groupTarget(phrase, h) {
  const noun=singular(phrase.replace(/^(?:Other |All |Each )/,''))
    .replace(/^[A-Z][a-z]+/,word=>/^(?:Creature|Artifact|Enchantment|Land|Permanent|Planeswalker|Battle|Token|Snow|Nonsnow|Nonlegendary|Legendary|Nontoken|Colorless|Multicolored|Monocolored|Tapped|Untapped|Attacking|Blocking|Modified|Enchanted|Equipped|White|Blue|Black|Red|Green|Nonwhite|Nonblue|Nonblack|Nonred|Nongreen|Nonartifact|Nonland)$/.test(word)?word.toLowerCase():word);
  return h.target('target '+noun);
}

export function extensionCondition(text, h) {
  const history=/^you(?:'ve| have)? (gained|lost) life this turn$/.exec(text);
  if(history)return {kind:'turn-stat',field:history[1]==='gained'?'lifeGained':'lifeLost',min:1};
  return v10.extensionCondition(text,h);
}

export function normalizeManaOperation(operation) {
  const retained=operation.kind==='generic-ability'&&operation.effects?.filter(effect=>effect.action==='add-mana'&&effect.retainManaV11);
  if(retained?.length===1&&operation.effects[0]===retained[0]){
    const plain={...operation,effects:operation.effects.map(effect=>{const copy={...effect};delete copy.retainManaV11;return copy;})};
    const normalized=normalizeManaOperations([plain])[0];
    return normalized.kind==='mana-source'?{...normalized,retainManaV11:retained[0].retainManaV11}:{...normalized,effects:operation.effects};
  }
  return v10.normalizeManaOperation(operation);
}

// A replacement instruction reuses the original announcement. It may change
// the resolution outcome, but cannot silently add or change announced targets.
function replacementEffect(card, line, h) {
  if (/["\n]/.test(line)) return null;
  const leading = /^(.+)\. If ([^,.]+), (?:instead (.+)|(.+) instead)\.$/.exec(line);
  const trailing = !leading && /^(.+)\. (.+) instead if ([^.]+)\.$/.exec(line);
  if (!leading && !trailing) return null;
  const first = (leading || trailing)[1] + '.';
  const changed = leading ? leading[3] || leading[4] : trailing[2];
  const conditionText = leading ? leading[2] : trailing[3];
  const original = h.effect(card, first);
  if (!complete(original) || !original.effects.length || original.targets.length > 1) return null;
  let condition, conditionTarget;
  if (original.targets.length === 1 && /^(?:it |it's |that (?:creature|permanent|artifact|enchantment|land) )/.test(conditionText)) {
    condition = h.condition(conditionText.replace(/^(?:it|that (?:creature|permanent|artifact|enchantment|land)) /, 'this creature ').replace(/^it's /, 'this creature is '));
    conditionTarget = 0;
  } else if (!/^(?:it|its|that|they|their|those)\b/.test(conditionText)) condition = h.condition(conditionText);
  if (!condition) return null;
  let alternative = h.effect(card, changed + '.');
  const damageText = changed.startsWith(card.name + ' deals ') ? 'it' + changed.slice(card.name.length) : changed;
  const damage = /^(?:it|this spell|this creature|this permanent|this artifact) deals ([0-9]+) damage(?: to (?:that creature|that permanent|that permanent or player|each of those permanents and\/or players))?$/i.exec(damageText);
  if (damage && original.effects.length === 1 && original.effects[0].action === 'damage')
    alternative = body([{...original.effects[0], n:Number(damage[1])}], original.targets);
  if (!complete(alternative) || !alternative.effects.length) return null;
  const same = JSON.stringify(original.targets) === JSON.stringify(alternative.targets);
  if (!same && (alternative.targets.length || original.targets.length !== 1)) return null;
  let references = 0;
  const bind = node => {
    if(node==='event-stack-v10'&&original.targets[0]?.zone!=='stack')return node;
    if (['unbound-object-v10','event-card','event-player','event-stack-v10'].includes(node)) { references++; return 0; }
    if (node === 'event-card-controller' || node === 'event-card-owner') { references++; return {kind:node.endsWith('owner')?'target-owner':'target-controller',index:0}; }
    if (Array.isArray(node)) return node.map(bind);
    if (!node || typeof node !== 'object') return node;
    // A nested granted ability owns its own source/event references.
    if (node.action === 'install-trigger-v8' || node.kind === 'generic-trigger' || node.kind === 'generic-ability') return node;
    return Object.fromEntries(Object.entries(node).map(([key,value]) => [key,bind(value)]));
  };
  const effects = original.targets.length === 1 ? bind(alternative.effects) : alternative.effects;
  if (!same && !references || /"(?:event-|unbound-object)/.test(JSON.stringify(effects))) return null;
  return body([{action:'conditional',condition,...(conditionTarget!==undefined?{conditionTarget}:{}),effects,elseEffects:original.effects}], original.targets);
}

export function extensionCount(text, h) {
  const outlaws=/^outlaws?( you control| your opponents control)?$/.exec(text);
  if(outlaws){const filter=h.target('target outlaw'+(outlaws[1]===' your opponents control'?' an opponent controls':outlaws[1]||''));if(filter)return {kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[filter]};}
  const colored = /^colors? among (.+)$/.exec(text);
  if (colored) {
    const count = h.count(colored[1]);
    if (count?.kind === 'count' && count.zone === 'battlefield' && !count.unique) return {...count, unique:'colors'};
  }
  return v10.extensionCount(text, h);
}

export function extensionTarget(text, h) {
  const qualified=/^(.+?) (?:that's|that is) (?:a|an) (.+)$/.exec(text);
  if(qualified){
    const base=h.target(qualified[1]),quality=h.target('target '+qualified[2].replace(/ or an? /g,' or '));
    if(base?.zone==='battlefield'&&quality?.zone==='battlefield'&&!base.alternatives)return {...base,alternatives:[quality]};
  }
  const optionalOther=/^up to one other target (.+)$/.exec(text);
  if(optionalOther){const parsed=h.target('another target '+optionalOther[1]);if(parsed?.zone==='battlefield'&&parsed.excludeSelf)return {...parsed,min:0};}
  const anyKeyword=/^(target .+?) with (.+? or .+?)( from (?:your|a|an opponent's) graveyard)?$/.exec(text);
  if(anyKeyword){
    const words=anyKeyword[2].split(/,? or |, /),base=h.target(anyKeyword[1]+(anyKeyword[3]||''));
    const filters=base&&words.map(keyword=>h.target(anyKeyword[1]+' with '+keyword+(anyKeyword[3]||'')));
    if(filters?.length>1&&filters.every(filter=>filter?.withKeyword))return {...base,alternatives:filters};
  }
  const outlaw = /^target outlaw( you control| an opponent controls)?$/.exec(text);
  if (outlaw) return {what:'creature',zone:'battlefield',controller:'any',min:1,alternatives:['Assassin','Mercenary','Pirate','Rogue','Warlock'].map(subtype=>h.target('target '+subtype+' creature'+(outlaw[1]||'')))};
  const token = /^((?:another |up to one )?target )([A-Z][A-Za-z-]+) tokens?( you control| an opponent controls)?$/.exec(text);
  if (token && (ORACLE_SUBTYPES.has(token[2]) || ORACLE_SUBTYPE_TYPES[token[2]])) {
    const base = h.target(token[1] + 'permanent' + (token[3] || ''));
    if (base?.zone === 'battlefield') return {...base, subtype: token[2], token: true};
  }
  const owned = /^(target .+?) you own or control$/.exec(text);
  if (owned) {
    const owner = h.target(owned[1] + ' you own'), controller = h.target(owned[1] + ' you control');
    if (owner?.zone === 'battlefield' && controller?.zone === 'battlefield')
      // Keep the explicit ownership branch last so the legacy shared trailing
      // controller qualifier does not narrow this mixed union.
      return {what: 'permanent', zone: 'battlefield', controller: 'any', min: 1, alternatives: [controller, owner]};
  }
  const subtype = /^((?:another |up to one )?target )([A-Z][A-Za-z-]+)( you control| an opponent controls)?$/.exec(text);
  if (subtype && ORACLE_SUBTYPE_TYPES[subtype[2]]) {
    const base = h.target(subtype[1] + ORACLE_SUBTYPE_TYPES[subtype[2]] + (subtype[3] || ''));
    if (base?.zone === 'battlefield') return {...base, subtype: subtype[2]};
  }
  const union = /^(target )(snow) and ([A-Z][A-Za-z-]+) (creature)( you control| an opponent controls)?$/.exec(text);
  if (union && ORACLE_SUBTYPES.has(union[3])) {
    const filters = [union[2], union[3]].map(quality => h.target('target ' + quality + ' creature' + (union[5] || '')));
    if (filters.every(filter => filter?.zone === 'battlefield')) return {what:'creature', zone:'battlefield', controller:'any', min:1, alternatives:filters};
  }
  return v10.extensionTarget(text, h);
}

export function extensionEffect(card, line, h) {
  const lower = line.replace(/^[a-z]/, initial => initial.toUpperCase());
  if (lower !== line) { const parsed = h.effect(card, lower); if (parsed) return parsed; }
  const handTop=/^(Target player|Target opponent|Each player|Each opponent) puts? (?:a|one) card from their hand on top of their library\.$/.exec(line);
  if(handTop){const actor=handTop[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;return body([{action:'zone-select',zone:'hand',destination:'library',who:target?0:actor.replace(' ','-'),n:1,filter:{what:'card',zone:'hand',controller:'you',min:1}}],target?[target]:[]);}
  const loseAndTop=/^(Target player|Target opponent) loses ([0-9]+) life and puts (a card from their hand on top of their library)\.$/.exec(line);
  if(loseAndTop){const parsed=h.effect(card,loseAndTop[1]+' puts '+loseAndTop[3]+'.');if(parsed)return {...parsed,effects:[{action:'lose-life',who:0,n:Number(loseAndTop[2])},...parsed.effects]};}
  const attach=/^Attach (target (?:Equipment|Aura)(?: you control)?) to ((?:up to one )?target creature(?: you control)?)\.$/.exec(line);
  if(attach){const attachment=h.target(attach[1]),host=h.target(attach[2]);if(attachment?.zone==='battlefield'&&host?.zone==='battlefield')return body([{action:'attach-v9',attachment:0,target:1}],[attachment,host]);}
  const mill=/^((?:You |Target player |Target opponent |Each player |Each opponent )?(?:may )?)[Mm]ills? cards equal to (.+)\.$/.exec(line);
  if(mill){const n=h.value(mill[2]),parsed=n!==null&&n!==undefined&&h.effect(card,mill[1]+'mill a card.');if(parsed&&!parsed.v4Body&&parsed.effects.length===1&&parsed.effects[0].action==='mill')return {...parsed,effects:[{...parsed.effects[0],n}]};}
  const changelingToken=/^(Create .+? creature tokens?) with changeling\.$/.exec(line);
  if(changelingToken){const parsed=h.effect(card,changelingToken[1]+'.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='token-inline')return {...parsed,effects:[{...parsed.effects[0],token:{...parsed.effects[0].token,oracle:'Changeling',operations:[{kind:'mechanic-changeling',contract:'mechanic-changeling'}]}}]};}
  const coordinatedDamage=/^(.+?) deals ([0-9]+|X) damage to (each opponent|each player|each .+?) and ([0-9]+|X) damage to (each .+?)\.$/.exec(line);
  if(coordinatedDamage&&!/["\n]|\. /.test(line)){
    const parts=[h.effect(card,coordinatedDamage[1]+' deals '+coordinatedDamage[2]+' damage to '+coordinatedDamage[3]+'.'),h.effect(card,coordinatedDamage[1]+' deals '+coordinatedDamage[4]+' damage to '+coordinatedDamage[5]+'.')];
    if(parts.every(part=>complete(part)&&!part.targets.length&&part.effects.length===1&&(['damage','damage-batch'].includes(part.effects[0].action)||part.effects[0].action==='battlefield-group'&&part.effects[0].operation==='damage'))){
      const hits=parts.flatMap(part=>{const effect=part.effects[0];return effect.action==='damage-batch'?effect.hits:effect.action==='damage'?[{target:effect.target,n:effect.n,source:effect.source}]:[{filters:effect.filters,n:effect.n,...(effect.players?{players:'each-player'}:{})}];});
      return body([{action:'damage-batch',hits}]);
    }
  }
  // Current card qualities are checked after a zone move. Printed "was"
  // continues to use the captured characteristics of the original object.
  const cardQuality=/^([^.\n]+)\. If (?:it's|it is|that card is) (?:a|an) (.+?) card, (.+)\.$/.exec(line);
  if(cardQuality){
    const first=h.effect(card,cardQuality[1]+'.'),filter=h.target('target '+cardQuality[2]),last=h.effect(card,cardQuality[3]+'.');
    if(complete(first)&&first.targets.length===1&&first.targets[0].zone==='graveyard'&&(first.targets[0].max??1)===1&&first.effects.length===1&&first.effects[0].action==='move-to-hand'&&filter?.zone==='battlefield'&&complete(last)&&!last.targets.length&&!/event-|unbound-object/.test(JSON.stringify(last.effects)))
      return body([...first.effects,{action:'conditional',condition:{kind:'source-quality',filter:{...filter,zone:'hand'}},conditionTarget:0,effects:last.effects}],first.targets);
  }
  const allTypes=/^(.+?) gains? all creature types until end of turn\.$/i.exec(line);
  if(allTypes){
    const noun=allTypes[1],target=h.target(noun.replace(/^[A-Z]/,letter=>letter.toLowerCase()));
    const own=/^this creature$/i.test(noun)&&/\bCreature\b/.test(card.type_line||'');
    const filter=!target&&!own&&groupTarget(noun,h);
    if(own||target?.zone==='battlefield'&&target.what==='creature'||filter?.zone==='battlefield'&&filter.what==='creature')return body([{action:'animate',...(own?{target:'self'}:target?{target:0}:{filters:[filter]}),types:[],subtypes:[],keywords:[],retainTypes:true,retainAllSubtypes:true,allCreatureTypes:true,temporary:true}],target?[target]:[]);
  }
  if(/^Amass Goblins X\.$/i.test(line))return body([{action:'amass',n:'X',subtype:'Goblin'}]);
  const repeated=/^(Investigate|Populate) (?:once )?for each (.+)\.$/i.exec(line);
  if(repeated){const n=h.count(repeated[2]);if(n)return body([{action:repeated[1].toLowerCase(),who:'you',n}]);}
  const compound=/^(?:Until end of turn, )?(.+?) ((?:gets?|gains?|loses?|becomes?|has|have) .+?)(?: until end of turn)?\.$/.exec(line);
  if(compound&&!/["\n]/.test(line)&&(/^Until end of turn, /.test(line)||/ until end of turn\.$/.test(line))){
    const clauses=compound[2].split(/(?:, (?:and )?| and )(?=(?:gets?|gains?|loses?|becomes?|has|have) )/);
    if(clauses.length>1){
      const parts=clauses.map(text=>h.effect(card,compound[1]+' '+text+' until end of turn.'));
      if(parts.every(complete)&&parts[0].targets.length<=1&&parts.every(part=>JSON.stringify(part.targets)===JSON.stringify(parts[0].targets))&&parts.every(part=>part.effects.every(effect=>['pump','pump-group','base-pt','animate','characteristics-v8','change-characteristics-v8'].includes(effect.action)||effect.action==='battlefield-group'&&effect.operation==='pump')))return body(parts.flatMap(part=>part.effects),parts[0].targets);
    }
  }
  const counterDestination=/^(Counter target [^.]+ spell|Counter target spell)\. If that spell is countered this way, put it (on top of its owner's library|into its owner's hand) instead of into that player's graveyard\.$/.exec(line);
  if(counterDestination){
    const parsed=h.effect(card,counterDestination[1]+'.');
    if(complete(parsed)&&parsed.targets.length===1&&parsed.targets[0].zone==='stack'&&parsed.effects.length===1&&parsed.effects[0].action==='counter-spell')return {...parsed,effects:[{...parsed.effects[0],toZone:counterDestination[2].startsWith('on top')?'library':'hand'}]};
  }
  const counterObserved=/^Counter that spell unless its controller pays ((?:\{(?:[0-9]+|X|[WUBRGC])\})+)\.$/.exec(line);
  if(counterObserved){
    const parsed=h.effect(card,'Counter target spell unless its controller pays '+counterObserved[1]+'.');
    if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='counter-spell')return body([{...parsed.effects[0],target:'event-stack-v10'}]);
  }
  const counterStat=/^(Counter target [^.]+ spell|Counter target spell|Counter that spell) if its (mana value|power|toughness) is ([0-9]+) or (less|greater)\.$/.exec(line);
  if(counterStat){
    const observed=counterStat[1]==='Counter that spell',parsed=h.effect(card,(observed?'Counter target spell':counterStat[1])+'.');
    if(complete(parsed)&&parsed.targets.length===1&&parsed.effects.length===1&&parsed.effects[0].action==='counter-spell'){
      const target=observed?'event-stack-v10':0;
      return body([{action:'conditional',conditionTarget:target,targetSnapshotV10:true,condition:{kind:'source-stat-comparison',stat:counterStat[2]==='mana value'?'mv':counterStat[2],threshold:Number(counterStat[3]),comparison:counterStat[4]},effects:parsed.effects.map(effect=>({...effect,target}))}],observed?[]:parsed.targets);
    }
  }
  const counterFollowup=line.replace(/^(Counter target [^.]+\. If )that spell's (mana value|power|toughness) (was|is) /,"$1its $2 $3 ");
  if(counterFollowup!==line){const parsed=h.effect(card,counterFollowup);if(parsed)return parsed;}
  const topSearch=/^((?:You may )?[Ss]earch your library for .+?)(?: and |, )(reveal (?:it|them|that card|those cards))\. Shuffle and put (it|them|that card|those cards) (on top|third from the top)(?: of your library)?\.$/.exec(line);
  if(topSearch){const parsed=h.effect(card,topSearch[1]+', '+topSearch[2]+', then shuffle and put '+topSearch[3]+' '+topSearch[4]+'.');if(parsed)return parsed;}
  const theirLibrary=/^(Put target (?:.+? )?card from an opponent's graveyard on (?:top|the bottom) of) their library\.$/.exec(line);
  if(theirLibrary){const parsed=h.effect(card,theirLibrary[1]+" its owner's library.");if(parsed)return parsed;}
  const leadingDuration=/^Until (end of turn|your next turn), ([^."\n]+)\.$/.exec(line);
  if(leadingDuration){
    const text=leadingDuration[2].replace(/^[a-z]/,letter=>letter.toUpperCase()),duration=' until '+leadingDuration[1]+'.';
    const groups=/^(.+? (?:gets?|gains?|loses?) .+?) and ((?:(?:another |other |up to (?:one|two|three) )?target .+?|(?:other )?creatures(?: you control| your opponents control)?) (?:gets?|gains?|loses?) .+)$/.exec(text);
    if(groups){
      const parsed=h.effect(card,groups[1]+duration+' '+groups[2].replace(/^[a-z]/,letter=>letter.toUpperCase())+duration);
      if(parsed){
        const joined={...parsed};
        if(/^another target /.test(groups[2])&&joined.targets.length===2)joined.targets=joined.targets.map((target,index)=>index?{...target,excludeSelf:false,differentFromPrevious:true}:target);
        if(/^target /i.test(groups[1])&&/^other creatures /.test(groups[2])&&joined.targets.length===1)joined.effects=joined.effects.map(effect=>effect.action==='battlefield-group'?{...effect,excludeTargetsV11:[0],filters:effect.filters.map(filter=>({...filter,excludeSelf:false}))}:effect);
        return joined;
      }
    }
    const parsed=h.effect(card,text+duration);if(parsed)return parsed;
  }
  const emblem=/^You get an emblem with "([^"\n]+)"(?: and "([^"\n]+)")?\.?$/.exec(line);
  if(emblem){
    const texts=emblem.slice(1).filter(Boolean),operations=texts.map(text=>{
      const normalized=text.replace(/\bthis emblem\b/gi,'this permanent').replace(/\.?$/,'.');
      return h.line({...card,name:'__OracleEmblemV11__',layout:'normal',type_line:'Enchantment',oracle_text:normalized},normalized);
    });
    const allowedStatic=new Set(['kind','contract','scope','filters','excludeSelf','subtype','power','toughness','keywords']);
    const supported=operation=>operation?.kind==='generic-static'&&operation.scope!=='self'&&Object.keys(operation).every(key=>allowedStatic.has(key))||operation?.kind==='generic-trigger'&&!operation.zone&&!operation.from&&!operation.onceEachTurn&&!operation.oncePerBatch&&!operation.stateTest&&!operation.modalBody&&!operation.v4Body&&!operation.eventFilter?.perDefender&&!/"self"|source-stat|source-counters/.test(JSON.stringify(operation))&&![].concat(operation.event).some(event=>/mana/i.test(event)||event==='abilityActivated');
    if(operations.every(supported))return body([{action:'create-emblem-v11',operations,text:texts.join('\n')}]);
    return null;
  }
  const fixedMana=/^Add (one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) \{([WUBRGC])\}\.$/.exec(line);
  if(fixedMana&&number(fixedMana[1])>0)return body([{action:'add-mana',produce:{[fixedMana[2]]:number(fixedMana[1])}}]);
  const eventMana=/^Add that much \{([WUBRGC])\}\.$/.exec(line);
  if(eventMana)return body([{action:'add-mana',produce:{[eventMana[1]]:1},multiplier:{kind:'event-amount'}}]);
  const artifactMana=/^(Add .+)\. This mana can't be spent to cast (?:a )?nonartifact spells?\.$/.exec(line);
  if(artifactMana){const parsed=h.effect(card,artifactMana[1]+'.');if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='add-mana'&&!parsed.effects[0].restriction)return {...parsed,effects:[{...parsed.effects[0],restriction:{spell:h.target('target artifact spell'),abilities:true}}]};}
  const retained=/^((?:Add|That player adds) .+)\. Until end of (turn|combat), (you|they) don't lose this mana as steps(?: and phases)? end\.$/.exec(line);
  if(retained){
    const parsed=h.effect(card,retained[1]+'.');
    if(complete(parsed)&&!parsed.targets.length&&parsed.effects.length===1&&parsed.effects[0].action==='add-mana'&&(retained[3]==='you'?!parsed.effects[0].who:parsed.effects[0].who==='event-player'))return {...parsed,effects:[{...parsed.effects[0],retainManaV11:retained[2]==='turn'?'eot':'combat'}]};
  }
  const extraDraw=line.replace(/^Draw (?:another|an additional) card\./,'Draw a card.');
  if(extraDraw!==line){const parsed=h.effect(card,extraDraw);if(parsed)return parsed;}
  const extraCounters=/^(Return target .+? from (?:your|an opponent's|a) graveyard to the battlefield(?: tapped)?) with (a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+) additional ([+-][0-9]+\/[+-][0-9]+|[a-z]+) counters? on it\.$/i.exec(line);
  if(extraCounters){const parsed=h.effect(card,extraCounters[1]+'.');if(complete(parsed)&&parsed.effects.length===1&&parsed.effects[0].action==='reanimate')return {...parsed,effects:[{...parsed.effects[0],additionalCountersV9:{[extraCounters[3]]:number(extraCounters[2])}}]};}
  const replacement = replacementEffect(card, line, h);
  if (replacement) return replacement;
  const resolutionStat = /^((?:Destroy|Exile|Gain control of) (?:target .+?|that creature|that permanent|it)) if it has (mana value|power|toughness) ([0-9]+) or (less|greater)\.$/i.exec(line);
  if (resolutionStat) {
    const parsed = h.effect(card, resolutionStat[1] + '.');
    if (complete(parsed) && (parsed.targets.length === 1 || !parsed.targets.length && parsed.effects.every(effect=>['event-card','unbound-object-v10'].includes(effect.target))))
      return body([{action:'conditional',conditionTarget:parsed.targets.length?0:'unbound-object-v10',condition:{kind:'source-stat-comparison',stat:resolutionStat[2]==='mana value'?'mv':resolutionStat[2],threshold:Number(resolutionStat[3]),comparison:resolutionStat[4]},effects:parsed.effects}],parsed.targets);
  }
  const copy = /^(You may )?[Cc]opy (target .+? spell(?: you control)?)( twice)?\.$/.exec(line);
  if (copy) {
    const target = h.target(copy[2]);
    if (target?.zone === 'stack' && target.what === 'spell')
      return body([{action: 'copy-stack-v8', target: 0, kind: 'spell', n: copy[3] ? 2 : 1, retarget: false}], [target], !!copy[1]);
  }
  // In a multiplayer game, every other player is an opponent of the caster.
  const others = line.replace(/^Each other player /i, 'Each opponent ');
  if (others !== line) { const parsed = h.effect(card, others); if (parsed) return parsed; }
  const damage = /^(?:This (?:creature|artifact|enchantment|permanent)|.+?) deals (\d+|X) damage to each of up to (one|two|three|four|five|six|seven|eight|nine|ten|\d+) targets\.$/.exec(line);
  if (damage && (line.startsWith(card.name + ' deals ') || /^This (?:creature|artifact|enchantment|permanent) deals /.test(line)))
    return body([{action:'damage',target:0,n:damage[1]==='X'?'X':Number(damage[1])}], [{what:'any',zone:'battlefield',controller:'any',min:0,max:number(damage[2])}]);
  const controlled = /^(Gain control of (?:up to one |another )?target [^.]+? until end of turn)\. (Untap (?:it|that (?:creature|permanent))\. (?:It|That creature) gains? haste until end of turn\.)$/.exec(line);
  if (controlled) {
    const parsed = h.effect(card, controlled[1] + '.');
    if (complete(parsed) && parsed.targets.length === 1 && parsed.targets[0].zone === 'battlefield')
      return {...parsed, effects:[...parsed.effects,{action:'untap',target:0},{action:'pump',target:0,power:0,toughness:0,keywords:['haste']}]};
  }
  // Two coordinated creature groups keep their own filters, and both grants
  // share the printed end-of-turn duration.
  const coordinated = /^(.+? (?:get|gets|gain|gains) .+?) and ((?:other |attacking |blocking |white |blue |black |red |green |artifact |token )*creatures(?: you control)? (?:get|gain) .+?) until end of turn\.$/.exec(line);
  if (coordinated && !/["\n]|\b(?:if|unless|may)\b/.test(line)) {
    const first = h.effect(card, coordinated[1] + ' until end of turn.'), second = h.effect(card, coordinated[2] + ' until end of turn.');
    if ([first,second].every(parsed => complete(parsed) && !parsed.targets.length && parsed.effects.every(effect => ['pump-group','battlefield-group','pump'].includes(effect.action)))) return body([...first.effects,...second.effects]);
  }
  const groupAction = /^(Destroy|Exile|Tap|Untap|Goad|Suspect) (?:all|each) (.+)\.$/.exec(line);
  if (groupAction && !/["\n]|\. |\btarget\b/.test(groupAction[2])) {
    const filter = h.target('target ' + singular(groupAction[2]));
    if (filter?.zone === 'battlefield' && !['any','player','opponent'].includes(filter.what))
      return body([['Goad','Suspect'].includes(groupAction[1]) ? {action:groupAction[1].toLowerCase(),filters:[filter]} : {action:'battlefield-group',operation:groupAction[1].toLowerCase(),filters:[filter]}]);
  }
  const exile = /^(You may )?[Ee]xile (a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+|all|any number of|up to (?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)) (.+?) from your graveyard\.$/.exec(line);
  if (exile && !/\btarget\b/.test(exile[3])) {
    const filter = h.target('target ' + singular(exile[3]) + ' from your graveyard');
    const quantity = exile[2].replace(/^up to /,'');
    if (filter?.zone === 'graveyard') return body([{action:'zone-select',who:'you',zone:'graveyard',filter,n:['all','any number of'].includes(quantity)?'all':number(quantity),upTo:!!exile[1]||exile[2].startsWith('up to ')||quantity==='any number of',destination:'exile'}]);
  }
  return v10.extensionEffect(card, line, h);
}

export function extensionLine(card, line, h) {
  const entryChoice=/^This (?:creature|artifact|permanent) enters with your choice of a (flying|first strike|double strike|deathtouch|lifelink|menace|reach|trample|vigilance|hexproof|indestructible) counter or a (flying|first strike|double strike|deathtouch|lifelink|menace|reach|trample|vigilance|hexproof|indestructible) counter on it\.$/.exec(line);
  if(entryChoice&&entryChoice[1]!==entryChoice[2])return {kind:'entry-counters-v8',choice:{count:1,kinds:entryChoice.slice(1)},contract:'entry-counter-replacement'};
  // A follow-up about the object which caused an ETB/death trigger uses that
  // object's characteristics, not the creature carrying the triggered ability.
  const eventQuality=/^((?:When|Whenever) [^,\n]+), (.+?\. )?If (that (?:creature|permanent|artifact|enchantment|land)) (was|is) (.+?), (.+)$/.exec(line);
  if(eventQuality&&!/["\n]|\b(?:target|choose|create)\b/i.test(eventQuality[2]||'')&&!/\binstead\b/.test(eventQuality[6])){
    const header=h.line(card,eventQuality[1]+', draw a card.');
    const condition=h.condition('this creature is '+eventQuality[5]);
    const first=eventQuality[2]?h.effect(card,eventQuality[2].trim()):body([]);
    const last=h.effect(card,eventQuality[6]);
    if(header?.kind==='generic-trigger'&&['etb','dies','lto'].includes(header.event)&&
      !['self','self-card'].includes(header.eventFilter)&&condition?.kind==='source-quality'&&
      complete(first)&&complete(last)&&!first.targets.length&&!last.targets.length)
      return {...header,effects:[...first.effects,{action:'conditional',condition,conditionTarget:'event-card',targetSnapshotV10:eventQuality[4]==='was',effects:last.effects}]};
  }
  const twoGrants=/^([^"\n]+? (?:has|have)) "([^"\n]+)" and "([^"\n]+)"\.?$/.exec(line);
  if(twoGrants&&!twoGrants.slice(2).some(text=>text.includes(card.name))){const operations=twoGrants.slice(2).map(text=>h.line(card,twoGrants[1]+' "'+text+'".'));if(operations.every(operation=>operation&&['generic-static','attachment-operation','attachment-grant'].includes(operation.kind)))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};}
  const quoted=/^((?:Other |All |Each )?[^".]+?) (?:have|has) "([^"\n]+)"\.?$/.exec(line);
  if(quoted&&!quoted[2].includes(card.name)){
    const attached=/^(?:Enchanted|Equipped) (?:creature|artifact|enchantment|land|permanent)$/.test(quoted[1]);
    const filter=!attached&&groupTarget(quoted[1],h);
    const child=(attached||filter?.zone==='battlefield')&&h.line({...card,name:'__GrantedPermanent__'},quoted[2].replace(/\.?$/,'.'));
    if(child){
      const normalized=h.normalizeOperations([child])[0];
      const scope={kind:'generic-static',scope:'filtered-permanents',filters:[filter],excludeSelf:quoted[1].startsWith('Other '),power:0,toughness:0,keywords:[],contract:'generic-continuous-effect'};
      const grant=operation=>attached?{kind:'attachment-operation',operation,grant:{power:0,toughness:0,keywords:[]},contract:'attachment-granted-operation'}:{...scope,grantedOperation:operation};
      // Sacrificing a granter can invalidate another planned mana source. That
      // family remains closed until the solver tracks grant dependencies.
      if(normalized.kind==='mana-source'&&!normalized.from&&!normalized.onceEachTurn&&Object.keys(normalized.activationCost||{}).every(key=>['tap','mana','life','rmCounter'].includes(key)))return grant(normalized);
      if(normalized.kind==='generic-ability'&&!normalized.from&&normalized.loyalty===undefined&&!normalized.effects?.some(effect=>effect.action==='add-mana'))return grant(normalized);
      if(child.kind==='generic-trigger'&&!child.from&&![].concat(child.event).some(event=>/mana/i.test(event)||event==='abilityActivated'))return grant(child);
      const allowed=new Set(['kind','scope','power','toughness','keywords','condition','multiplier','cantAttack','cantBlock','unblockable','cantUntap','contract']);
      if(!attached&&child.kind==='generic-static'&&child.scope==='self'&&Object.keys(child).every(key=>allowed.has(key)))return {...child,...scope,power:child.power||0,toughness:child.toughness||0,keywords:child.keywords||[],...(child.condition?{condition:child.condition,conditionSubject:'affected'}:{}),...(child.multiplier?{multiplier:child.multiplier,multiplierSubject:'affected'}:{}),affectedControllerV11:true};
    }
  }
  // A lone event object is the antecedent of "it" in these closed, single
  // instructions. Do not cross a target, token, choice, or nested ability.
  const event = /^((?:When|Whenever) (?:another |an? )?(.+?) (?:enters|dies|leaves the battlefield|attacks|blocks)), (.+)$/.exec(line);
  if (event && !/\b(?:this|enchanted|equipped)\b/.test(event[2]) &&
      /\bit\b|\bits\b/.test(event[3]) && !/\b(?:target|create|choose|reveal|search)\b|["\n]/i.test(event[3])) {
    const parsed = h.line(card, event[1] + ', draw a card.');
    const text = event[3].replace(/\bits (power|toughness|mana value)\b/g, "that creature's $1")
      .replace(/\bit\b/g, 'that creature');
    const effects = text !== event[3] && h.effect(card, text);
    if (parsed?.kind === 'generic-trigger' && effects && !effects.v4Body &&
        !JSON.stringify(effects).includes('unbound-object')) return {...parsed, ...effects};
  }
  const group = /^((?:Other |All |Each )?(.+?)) (get|gets|have|has) (.+)\.$/.exec(line);
  if (group && !/["\n]|\b(?:this|enchanted|equipped|target)\b/i.test(group[1])) {
    const filter = groupTarget(group[1],h);
    const parsed = filter?.zone === 'battlefield' && h.line(card, 'This creature ' + (/^get/.test(group[3]) ? 'gets' : 'has') + ' ' + group[4] + '.');
    if (parsed?.kind === 'generic-static' && parsed.scope === 'self' && !parsed.condition)
      return {...parsed, scope: 'filtered-permanents', filters: [filter], excludeSelf: group[1].startsWith('Other ')};
  }
  return v10.extensionLine(card, line, h);
}

export function modifierOperation(card,line,h){
  const splice=/^Splice onto (Arcane|instant or sorcery) ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(splice&&/\b(?:Instant|Sorcery)\b/.test(card.type_line||''))return {kind:'mechanic-splice-v11',onto:splice[1],cost:splice[2],contract:'mechanic-splice-v11'};
  const affinity=/^Affinity for (.+)$/.exec(line);
  if(affinity){const multiplier=h.count(affinity[1]+' you control');if(multiplier?.kind==='count'&&multiplier.zone==='battlefield')return {kind:'cost-modifier',self:true,amount:-1,multiplier,contract:'generic-cost-modification'};}
  return v10.modifierOperation(card,line,h);
}

function normalizeWithoutRebindingGranter(card){
  // A named reference inside a granted ability still means the granting
  // permanent. It must not become the recipient's "this artifact/creature".
  const marker='__OracleGrantingSourceV11__';
  const text=(card.oracle_text||'').split('"').map((part,index)=>index%2?part.replaceAll(card.name,marker):part).join('"');
  const normalized=v10.normalizeCard({...card,oracle_text:text});
  return {...normalized,oracle_text:normalized.oracle_text.replaceAll(marker,card.name)};
}

export function normalizeCard(card) {
  let previous = normalizeWithoutRebindingGranter(card);
  if (card.layout !== 'normal') return previous;
  let text = previous.oracle_text || '';
  if (/\bLegendary\b/.test(card.type_line || '') && card.name.includes(' ')) {
    const short = card.name.split(' ')[0];
    if (!['The','A','An','Doctor'].includes(short) && short.length >= 3) {
      const escaped = short.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      text = text.replace(new RegExp('(?<![A-Za-z0-9])' + escaped + "(?='s\\b| (?:can't|cannot|enters|dies|attacks|blocks|becomes|has|is|gets|gains|deals)\\b)",'g'), (word, offset) => text.slice(offset).startsWith(card.name) || /\bnamed $/i.test(text.slice(0,offset)) ? word : card.name);
      previous = normalizeWithoutRebindingGranter({...previous,oracle_text:text});
      text = previous.oracle_text;
    }
  }
  text = text.replace(/\bWhen you play an? (Plains|Island|Swamp|Mountain|Forest), /g,'Whenever a $1 you control enters, ')
    .replace(/\bWhenever you play an? (Plains|Island|Swamp|Mountain|Forest), /g,'Whenever a $1 you control enters, ');
  // The list of canonical subtypes includes noncreature tokens such as Blood.
  // Preserve source names and quoted abilities while normalizing punctuation.
  text = text.replace(/\b(When|Whenever) ([^,\n]+?) enters while (this creature has [^,\n]+), /g,'$1 $2 enters, if $3, ');
  // Printed personal pronouns in a legendary permanent's own ability refer
  // to that named character. Keep quotation scopes and named-card references
  // out of this normalization.
  if(/\bLegendary\b/.test(card.type_line||'')&&/\bCreature\b/.test(card.type_line||''))text=text.split('\n').map(line=>{
    if(/["“”]|\b(?:named|partner with|melds with)\b/i.test(line))return line;
    return line.replace(/\b(?:his|her) (power|toughness|mana value|controller|owner|abilities)\b/g,"this creature's $1")
      .replace(/\b(on|from|to|under|sacrifice|exile|destroy|return|tap|untap) (?:him|her)\b/gi,'$1 this creature')
      .replace(/\b(?:he|she)(?= (?:has|is|was|can|can't|cannot|gets|gains|loses|deals|fights|becomes|attacks|blocks|enters|dies|would|isn't)\b)/g,'this creature')
      .replace(/\b(?:He|She)(?= (?:has|is|was|can|can't|cannot|gets|gains|loses|deals|fights|becomes|attacks|blocks|enters|dies|would|isn't)\b)/g,'This creature');
  }).join('\n');
  return text === previous.oracle_text ? previous : {...previous, oracle_text:text};
}
