// Casting rules backed by existing public turn records and live counts.
// No missing history is reconstructed from permanents that happen to remain.
const WORDS={a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const N='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const number=text=>WORDS[text]??Number(text);
const bound=node=>!!node&&typeof node==='object'&&(String(node.kind||'').startsWith('event-')||
  ['target-count','source-stat','sacrificed-stat','affected-count'].includes(node.kind)||
  Object.values(node).some(child=>Array.isArray(child)?child.some(bound):bound(child)));

export function extensionCondition(text,h) {
  if(/^you(?:'ve| have) cast another spell this turn$/.test(text))return {kind:'turn-stat',field:'spellsCast',min:1};
  if(/^you(?:'ve| have) cast another instant or sorcery spell this turn$/.test(text))return {kind:'cast-quality-turn',quality:'instant-or-sorcery'};
  let match=new RegExp('^an opponent (has drawn|drew|cast) ('+N+') or more (cards|spells) this turn$').exec(text);
  if(match&&Number.isSafeInteger(number(match[2]))&&(match[1]==='cast')===(match[3]==='spells'))return {kind:'casting-turn-stat-v8',players:'opponents',field:match[3]==='cards'?'drewThisTurn':'spellsCast',min:number(match[2])};
  if(text==='an opponent gained life this turn')return {kind:'casting-turn-stat-v8',players:'opponents',field:'lifeGained',min:1};
  match=new RegExp('^an opponent had ('+N+') or more (creatures|lands) enter the battlefield under their control this turn$').exec(text);
  if(match&&Number.isSafeInteger(number(match[1])))return {kind:'casting-turn-stat-v8',players:'opponents',field:match[2]==='creatures'?'creatureEntries':'landsEntered',min:number(match[1])};
  match=/^creatures you control have total toughness ([0-9]+) or (?:greater|more)$/.exec(text);
  if(match)return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'creature',aggregate:'toughness'},min:Number(match[1])};
  if(text==="it's an opponent's upkeep")return {kind:'casting-opponent-upkeep-v8'};
  match=/^(?:a|an) (.+) is attacking$/.exec(text);
  if(match){const filter=h.target('target '+match[1]);if(filter?.zone==='battlefield'&&filter.what==='creature')return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[{...filter,attacking:true}]},min:1};}
  match=new RegExp('^(?:exactly ('+N+') creature is|('+N+') or more creatures are) attacking$').exec(text);
  if(match){const n=number(match[1]||match[2]);if(Number.isSafeInteger(n))return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[{what:'creature',zone:'battlefield',controller:'any',attacking:true}]},min:n,...(match[1]?{max:n}:{})};}
  return null;
}

export function extensionCount(text,h) {
  if(text==='1 life you gained this turn')return {kind:'turn-count',field:'lifeGained'};
  if(text==='spell your opponents have cast this turn')return {kind:'casting-turn-count-v8',players:'opponents',field:'spellsCast'};
  if(text==="opponent who was dealt damage this turn")return {kind:'casting-turn-count-v8',players:'opponents',field:'damageTaken',distinct:true};
  if(text==="card you've cycled or discarded this turn")return {kind:'turn-count',field:'discardedN'};
  if(text==='modified creature you control')return {kind:'casting-live-count-v8',what:'modified-creatures'};
  if(text==='the number of differently named lands you control'||text==='differently named lands you control')return {kind:'casting-live-count-v8',what:'land-names'};
  if(text==='creature type among creatures you control')return {kind:'casting-live-count-v8',what:'creature-types'};
  if(text==="card you own in exile and in your graveyard that's an instant card, a sorcery card, or a card that has an Adventure")
    return {kind:'casting-live-count-v8',what:'own-exile-grave-spells-adventures'};
  const ownZones=/^(.+) cards? you own in exile and in your graveyard$/.exec(text);
  if(ownZones) {
    const grave=h.count(ownZones[1]+' cards in your graveyard');
    if(grave?.kind==='count'&&grave.zone==='graveyard')return {kind:'sum',values:[grave,{...grave,zone:'exile'}]};
  }
  return null;
}

function targetFilter(phrase,h) {
  const either=/^(?:a|an) (attacking|tapped) or (attacking|tapped) creature$/.exec(phrase);
  if(either)return {what:'creature',zone:'battlefield',controller:'any',min:1,alternatives:either.slice(1).map(status=>({what:'creature',zone:'battlefield',controller:'any',[status]:true}))};
  const noun=phrase.replace(/^(?:a|an) /,'');
  return h.target('target '+noun+(/\bcard\b/.test(noun)&&!noun.includes('graveyard')?' from a graveyard':''));
}

function singleModifier(card,line,h) {
  const match=/^This spell costs ((?:\{(?:[0-9]+|[WUBRGC])\})+) (less|more) to cast (for each|if) (.+)\.$/.exec(line);
  if(!match)return null;
  const symbols=[...match[1].matchAll(/\{([^}]+)\}/g)].map(row=>row[1]),colors=symbols.filter(symbol=>/[WUBRGC]/.test(symbol));
  const generic=symbols.filter(symbol=>/^[0-9]+$/.test(symbol)).reduce((sum,n)=>sum+Number(n),0);
  if(!Number.isSafeInteger(generic)||colors.length&&match[2]!=='less')return null;
  // A colored reduction must be applied after colored-symbol choices. This
  // closed family has ordinary printed mana symbols and no alternate faces.
  if(colors.length&&(card.layout&&card.layout!=='normal'||!/^(?:\{(?:[0-9]+|X|[WUBRGC])\})*$/.test(card.mana_cost||'')))return null;
  let condition,multiplier,targetCondition;
  if(match[3]==='for each')multiplier=h.count(match[4]);
  else if(match[4].startsWith('it targets '))targetCondition=targetFilter(match[4].slice(11),h);
  else condition=h.condition(match[4]);
  if(!condition&&!multiplier&&!targetCondition||bound(condition)||bound(multiplier))return null;
  if(targetCondition&&!['battlefield','graveyard','stack'].includes(targetCondition.zone))return null;
  // Colored target reductions need a joint announced-target/pip choice; keep
  // that separate family closed until its payment solver is implemented.
  if(targetCondition&&colors.length)return null;
  return {kind:'cost-modifier',self:true,amount:generic*(match[2]==='less'?-1:1),
    ...(colors.length?{coloredReduction:colors}:{}),...(condition?{condition}:{}),...(multiplier?{multiplier}:{}),
    ...(targetCondition?{targetCondition}:{}),contract:'generic-cost-modification'};
}

export function modifierOperation(card,line,h) {
  const restriction=/^Cast this spell only (?:if (.+)|during (an opponent's upkeep))\.$/.exec(line);
  if(restriction){const condition=h.condition(restriction[1]||"it's "+restriction[2]);return condition&&!bound(condition)?{kind:'casting-restriction-v8',condition,contract:'casting-restriction-v8'}:null;}
  const capped=/^(This spell costs \{[0-9]+\} less to cast for each .+\.) This effect can't reduce the amount of mana this spell costs by more than \{([0-9]+)\}\.$/.exec(line);
  if(capped){const op=singleModifier(card,capped[1],h);if(op?.multiplier&&!op.coloredReduction&&Number.isSafeInteger(Number(capped[2])))return {...op,reductionCap:Number(capped[2])};return null;}
  const repeated=/^(This spell costs .+?\.) It also costs (.+)\.$/.exec(line);
  const combined=/^This spell costs (.+?) and (\{[0-9]+\} less to cast if .+)\.$/.exec(line);
  if(repeated||combined){const lines=repeated?[repeated[1],'This spell costs '+repeated[2]+'.']:['This spell costs '+combined[1]+'.','This spell costs '+combined[2]+'.'];
    const modifiers=lines.map(text=>singleModifier(card,text,h));return modifiers.every(Boolean)?{kind:'casting-cost-modifiers-v8',modifiers,contract:'casting-cost-modifiers-v8'}:null;}
  const variable=/^This spell costs \{X\} less to cast, where X is (.+)\.$/.exec(line);
  if(variable){const multiplier=h.count(variable[1]);if(multiplier&&!bound(multiplier))return {kind:'cost-modifier',self:true,amount:-1,multiplier,contract:'generic-cost-modification'};}
  return singleModifier(card,line,h);
}
