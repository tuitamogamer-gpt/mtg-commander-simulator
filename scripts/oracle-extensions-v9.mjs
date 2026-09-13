// Additive closed grammar. Successful complete v8 cards are returned unchanged
// before this module is enabled; unknown instructions continue to fail closed.
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
import {extensionLine as batchTrigger} from './oracle-v8-batch-triggers.mjs';
const numberWords = {a:1,an:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+)';
const amount = value => numberWords[value.toLowerCase()] ?? Number(value);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const body = (effects, targets = [], optional = false) => ({effects, targets, optional});
const singular = text => text.replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|cards|tokens)\b/g, word=>word.slice(0,-1));
const selfPattern = card => '(?:this (?:creature|artifact|enchantment|permanent|land|Aura|Equipment|Vehicle|Saga|planeswalker|battle)|' + escape(card.name) + ')';
export const dayNight = true;
export const grantableKeywords = ['infect','persist','undying','nonbasic landwalk','legendary landwalk'];
const shiftTargets=(node,n)=>Array.isArray(node)?node.map(item=>shiftTargets(item,n)):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','otherTarget','who','conditionTarget'].includes(key)&&typeof value==='number'?value+n:shiftTargets(value,n)])):node;

export function extensionTarget(text,h){
  if(/\bmodified (?:creature|permanent)\b/.test(text)){const target=h.target(text.replace('modified ',''));if(target?.zone==='battlefield')return {...target,modifiedV9:true};}
  if(text==='any number of target players'){const target=h.target('target player');if(target)return {...target,min:0,unbounded:true};}
  const typed=/^((?:another |up to one )?target )([A-Z][A-Za-z-]+) (artifact|land|enchantment|planeswalker|permanent|spell)(.*)$/.exec(text);
  if(typed&&ORACLE_SUBTYPES.has(typed[2])){const target=h.target(typed[1]+typed[3]+typed[4]);if(target&&!target.subtype)return {...target,subtype:typed[2]};}
  const lone=/^((?:another |up to one )?target )([A-Z][A-Za-z-]+)( you control| an opponent controls)?$/.exec(text);
  if(lone&&ORACLE_SUBTYPES.has(lone[2])){const target=h.target(lone[1]+'permanent'+(lone[3]||''));if(target)return {...target,subtype:lone[2]};}
  if(/\bhistoric (?=card\b|permanent\b|creature\b|artifact\b|spell\b|land\b)/.test(text)){const base=h.target(text.replace('historic ',''));if(base)return {...base,alternatives:[{...base,alsoType:'Artifact'},{...base,legendary:true},{...base,subtype:'Saga'}]};}
  const postfix=/^(.+?) that's (white|blue|black|red|green) or (white|blue|black|red|green)$/.exec(text);
  if(postfix){const base=h.target(postfix[1]),color={white:'W',blue:'U',black:'B',red:'R',green:'G'};if(base)return {...base,colorsAny:[color[postfix[2]],color[postfix[3]]]};}
  if(/ other than this creature$/.test(text)){const base=h.target(text.replace(' other than this creature',''));if(base?.zone==='battlefield')return {...base,excludeSelf:true};}
  if(/\bnonartifact, nonblack\b/.test(text)){const base=h.target(text.replace('nonartifact, ',''));if(base)return {...base,notType:'Artifact'};}

  const damage=/^(.+?) that dealt damage( to you)? this turn$/.exec(text);
  if(damage){const base=h.target(damage[1]);if(base?.zone==='battlefield')return {...base,dealtDamageV9:damage[2]?'you':'any'};}
  const blocker=/^(.+?) blocking (?:this creature|it)$/.exec(text);
  if(blocker){const base=h.target(blocker[1]);if(base?.zone==='battlefield')return {...base,blockingSourceV9:true};}
  if(/\bface-down /.test(text)){const base=h.target(text.replace('face-down ',''));if(base?.zone==='battlefield')return {...base,faceDownV9:true};}
  const equal=/^(.+?) with power equal to (?:its|their) toughness$/.exec(text);
  if(equal){const base=h.target(equal[1]);if(base?.zone==='battlefield')return {...base,equalStatsV9:true};}
  const excluded=/^((?:another |up to one )?target) ((?:non-[A-Z][A-Za-z-]*, )+non-[A-Z][A-Za-z-]*) (.+)$/.exec(text);
  if(excluded){const subtypes=excluded[2].split(', ').map(s=>s.slice(4)),base=h.target(excluded[1]+' '+excluded[3]);if(base&&subtypes.every(s=>ORACLE_SUBTYPES.has(s)))return {...base,excludedSubtypesV9:subtypes};}
  if(/ from a single graveyard$/.test(text)){const target=h.target(text.replace(' from a single graveyard',' from a graveyard'));if(target?.zone==='graveyard')return {...target,sameGraveyardV9:true};}
  const eitherStat=/^(.+?) with (power|toughness) or (power|toughness) ([0-9]+) or (greater|less)$/.exec(text);
  if(eitherStat&&eitherStat[2]!==eitherStat[3]){const base=h.target(eitherStat[1]);if(base?.zone==='battlefield'||base?.zone==='stack')return {...base,alternatives:[eitherStat[2],eitherStat[3]].map(stat=>({...base,stat,threshold:Number(eitherStat[4]),comparison:eitherStat[5]}))};}
  const total=/^(.+?) with total power and toughness ([0-9]+) or (greater|less)$/.exec(text);
  if(total){const base=h.target(total[1]);if(base?.zone==='battlefield')return {...base,totalStatsV9:{n:Number(total[2]),comparison:total[3]}};}
  const pt=/^((?:another |up to one )?target )([0-9]+)\/([0-9]+) (creature(?: .+)?)$/.exec(text);
  if(pt){const base=h.target(pt[1]+pt[4]);if(base?.zone==='battlefield')return {...base,exactStatsV9:{power:Number(pt[2]),toughness:Number(pt[3])}};}
  const nonattacking=/\bnonattacking /.exec(text);
  if(nonattacking){const base=h.target(text.replace(nonattacking[0],''));if(base?.zone==='battlefield')return {...base,notAttackingV9:true};}
  const owned=/^(.+) (you own|an opponent owns)$/.exec(text);
  if(owned){const target=h.target(owned[1]);if(target?.zone==='battlefield')return {...target,ownerV9:owned[2]==='you own'?'you':'opponent'};}
  if(/\bcommander\b/.test(text)){const target=h.target(text.replace(/\bcommander\b/,'permanent'));if(target?.zone==='battlefield')return {...target,commanderV9:true};}
  const token=/^((?:another |up to one )?target )([A-Z][A-Za-z-]+) tokens?( you control| an opponent controls)?$/.exec(text);
  if(token&&ORACLE_SUBTYPES.has(token[2])){
    const target=h.target(token[1]+'permanent'+(token[3]||''));
    if(target)return {...target,subtype:token[2],token:true};
  }
  const nonartifact=/\bnonartifact /.exec(text);
  if(nonartifact){const target=h.target(text.replace(nonartifact[0],''));if(target&&!target.notType)return {...target,notType:'Artifact'};}
  const state=/\b(attacking|blocking|tapped|untapped) /.exec(text);
  if(state){const target=h.target(text.replace(state[0],''));if(target?.zone==='battlefield'&&!target[state[1]])return {...target,[state[1]]:true};}
  const gy=text.replace(/\bcards? in (your|a|an opponent's) graveyard$/,'card from $1 graveyard');
  if(gy!==text)return h.target(gy);
  const attackingYou=/^(.+?) attacking you$/.exec(text);
  if(attackingYou){const target=h.target(attackingYou[1]);if(target?.zone==='battlefield'&&target.what==='creature')return {...target,attacking:true,attackingYouV9:true};}
  return null;
}

export function extensionCount(text,h){
  const namedOther=/^(.+?) other than this creature$/.exec(text);if(namedOther){const count=h.count(namedOther[1]);if(count?.zone==='battlefield')return {...count,other:true};}
  if(text==="the total number of cards in all players' hands"||text==="cards in all players' hands")return {kind:'count',zone:'hand',what:'card',controller:'all'};

  const sum=/^(.+?) plus (?:the number of )?(.+)$/.exec(text);
  if(sum){const values=sum.slice(1).map(part=>h.count(part.replace(/^the number of /,'')));if(values.every(Boolean))return {kind:'sum',values};}
  const named=/^(creatures?|permanents?) named (.+) on the battlefield$/.exec(text);
  if(named)return {kind:'count',zone:'battlefield',what:singular(named[1]),controller:'all',name:named[2]};
  const total=/^(?:the )?total (power|toughness|mana value) of (.+)$/.exec(text);
  if(total){const count=h.count(total[2]);if(count?.kind==='count')return {...count,aggregate:total[1]==='mana value'?'mv':total[1]};}

  if(/^(?:creatures? (?:it|this creature) devoured|the number of creatures? (?:it|this creature) devoured)$/.test(text))return {kind:'source-devoured-v9'};
  const normalized=text.replace(/^each /,'').replace(/ in each graveyard$/,' in all graveyards').replace(/^life you've lost this turn$/,'life lost this turn');
  if(normalized!==text){const result=h.count(normalized);if(result)return result;}
  const distinct=/^different (?:mana values? among) (.+)$/.exec(text);
  if(distinct){const counted=h.count(distinct[1]);if(counted?.kind==='count')return {...counted,unique:'mana-values'};}
  const attacking=/^creatures? attacking you$/.exec(text);
  if(attacking)return {kind:'count',zone:'battlefield',what:'creature',controller:'all',filters:[{what:'creature',zone:'battlefield',controller:'any',attackingYouV9:true}]};
  return null;
}

export function extensionCondition(text,h){
  if(/^(?:it|this creature) devoured a creature$/.test(text))return {kind:'count-comparison',count:{kind:'source-devoured-v9'},min:1};
  const actor=/^(that player|defending player) (.+)$/.exec(text);
  if(actor){const translated=actor[2].replace(/^controls /,'control ').replace(/^has /,'have ').replace(/^is poisoned$/,'have one or more poison counters');const condition=h.condition('you '+translated);if(condition)return {kind:'relative-player-condition-v9',who:actor[1]==='that player'?'event-player':'combat-defender-v9',condition};}
  if(text==="it's not that player's turn")return {kind:'relative-player-condition-v9',who:'event-player',condition:{kind:'not-your-turn'}};
  if(text==='you gained and lost life this turn')return {kind:'all',conditions:['lifeGained','lifeLost'].map(field=>({kind:'turn-stat',field,min:1}))};
  if(text==="you've cast both a creature spell and a noncreature spell this turn")return {kind:'all',conditions:['creature','noncreature'].map(quality=>({kind:'cast-history-v9',quality,min:1}))};
  const noTurn=/^you (?:didn't|have not|haven't) (lose life|cast a spell|cast a creature spell|cast a noncreature spell) this turn$/.exec(text);
  if(noTurn)return noTurn[1]==='lose life'?{kind:'not',condition:{kind:'turn-stat',field:'lifeLost',min:1}}:{kind:'not',condition:{kind:'cast-history-v9',quality:({'cast a spell':'all','cast a creature spell':'creature','cast a noncreature spell':'noncreature'})[noTurn[1]],min:1}};
  const total=new RegExp('^creatures you control have total (power|toughness) ('+NUM+') or (greater|more)$').exec(text);
  if(total)return {kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'creature',controller:'you',aggregate:total[1]},min:amount(total[2])};
  const life=new RegExp('^you have exactly ('+NUM+') life$').exec(text);
  if(life)return {kind:'count-comparison',count:{kind:'life-total'},min:amount(life[1]),max:amount(life[1])};
  const library=new RegExp('^you have ('+NUM+') or (more|fewer) cards in your library$').exec(text);
  if(library)return {kind:'count-comparison',count:{kind:'count',zone:'library',what:'card'},[library[2]==='more'?'min':'max']:amount(library[1])};
  const poison=new RegExp('^you have ('+NUM+') or more poison counters$').exec(text);
  if(poison)return {kind:'player-poison-v9',min:amount(poison[1])};
  const grave=new RegExp('^('+NUM+') or more (.+?) are in your graveyard$').exec(text);
  if(grave){const count=h.count(grave[2]+' in your graveyard');if(count)return {kind:'count-comparison',count,min:amount(grave[1])};}
  const noOther=/^you control no permanents other than this (?:enchantment|artifact|creature|permanent)( and have no cards in hand)?$/.exec(text);
  if(noOther){const conditions=[{kind:'count-comparison',count:{kind:'count',zone:'battlefield',what:'permanent',controller:'you',other:true},max:0}];if(noOther[1])conditions.push({kind:'hand-count',n:0});return {kind:'all',conditions};}
  const counters=new RegExp('^(?:it|this creature|this artifact|this enchantment|this permanent) has (fewer than|exactly) ('+NUM+') (\\+1/\\+1|-1/-1|[a-z]+) counters? on it$').exec(text);
  if(counters)return {kind:'count-comparison',count:{kind:'source-counters',counter:counters[3]},max:amount(counters[2])-(counters[1]==='fewer than'?1:0),...(counters[1]==='exactly'?{min:amount(counters[2])}:{})};
  const had=/^(?:it|this creature|this permanent) (was|wasn't) (?:a|an) (.+)$/.exec(text);
  if(had){const filter=h.target('target '+had[3]);if(filter?.zone==='battlefield'){const condition={kind:'source-quality',filter};return had[1]==='was'?condition:{kind:'not',condition};}}
  if(text==='it had counters on it')return {kind:'source-any-counter'};
  const hadCounter=/^it had (?:a|an) (\+1\/\+1|-1\/-1|[a-z]+) counter on it$/.exec(text);
  if(hadCounter)return {kind:'source-quality',filter:{what:'permanent',zone:'battlefield',controller:'any',hasCounter:hadCounter[1]}};
  if(/^(?:you haven't|you have not|you didn't) cast a spell from your hand this turn$/.test(text))return {kind:'no-hand-cast-v9'};
  if(/^(?:this creature|it) (?:didn't|did not) (attack|enter the battlefield) this turn$/.test(text))return {kind:'source-turn-v9',field:text.includes('attack')?'_attackedTurn':'_enteredTurn',present:false};
  if(/^(?:this creature|it) was dealt damage this turn$/.test(text))return {kind:'source-turn-v9',field:'_lastDamageVisual',present:true};
  if(text==='you have a card in hand')return h.condition('you have one or more cards in hand');
  if(text==="you didn't play a land this turn")return {kind:'turn-stat',field:'landsPlayedV9',max:0};
  const cast=/^you've cast a spell with mana value ([0-9]+) or greater this turn$/.exec(text);
  if(cast)return {kind:'cast-mana-value-v9',min:Number(cast[1])};
  return null;
}


export function characteristicOperation(card,line,h){
  const parsed=new RegExp('^'+selfPattern(card)+"'s (power and toughness are each|power is|toughness is) equal to (.+)\\.$",'i').exec(line);
  if(!parsed)return null;
  let text=parsed[2],toughnessOffset=0;
  const pair=/^(.+) and its toughness is equal to that number plus ([0-9]+)$/.exec(text);
  if(pair){if(parsed[1]!=='power is')return null;text=pair[1];toughnessOffset=Number(pair[2]);}
  const count=h.value(text)||h.count(text.replace(/^the number of /,''));
  if(!count||typeof count!=='object'||/event-|source-stat|target-stat/.test(JSON.stringify(count)))return null;
  return {kind:'characteristic-pt',power:parsed[1]!=='toughness is',toughness:!!pair||parsed[1]!=='power is',count,multiply:1,offset:0,toughnessOffset,contract:'characteristic-power-toughness'};
}

export function normalizeCard(card) {
  if (card.layout !== 'normal') return card;
  let text = card.oracle_text || '';
  text=text.replace(/(if this (?:permanent|creature|artifact|enchantment) is an? [^,\n]+, )it becomes /g,(_,prefix)=>prefix+card.name+' becomes ');
  text=text.replace(/((?:When|Whenever) enchanted (?:artifact|creature|land|permanent)) is put into a graveyard,/g,'$1 dies,');
  text=text.replace(/((?:When|Whenever) (?:a|an|another) [^,\n]+?) is put into (your|an opponent's|a) graveyard from the battlefield,/g,(_,subject,owner)=>subject+(owner==='your'?' you own':owner==="an opponent's"?' an opponent owns':'')+' dies,');
  text=text.replace("if your life total is less than your starting life total, it becomes equal to your starting life total.","if your life total is less than your starting life total, your life total becomes equal to your starting life total.");
  if (/\bLegendary\b/.test(card.type_line)) {
    const alias = card.name.split(/,| of | the /)[0];
    // Short legendary self names refer to the same object (CR 201.5c).
    // Preserve complete names and explicit references to another named card.
    if (alias.length >= 3 && alias !== card.name) {
      const pattern = new RegExp('\\b' + escape(alias) + '(?![\\w]|' + escape(card.name.slice(alias.length)) + ')', 'g');
      text = text.replace(pattern, (match, offset) => /(?:named|partner with) $/i.test(text.slice(0, offset)) ? match : card.name);
    }
  }
  // All supported tables are free-for-all: every other player is an opponent.
  text = text.replace(/each other player/g, 'each opponent');
  text = text.replace(/your team controls/g,'you control');
  // Parenthetical reminder text may be separated from its sentence's final
  // punctuation; normalize it before the closed line grammar sees that gap.
  text=text.replace(/\)\s+([.,])/g,')$1');
  const large={eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50};
  text=text.replace(/\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\b/g,word=>String(large[word]));
  text=text.replace(new RegExp('((?:[Pp]ut (?:(?:a|an|one|two|three|[0-9]+) )?(?:\\+1/\\+1|[a-z]+) counters? on '+selfPattern(card)+'))(?:, then it deals|\\. It deals) ','g'),'$1. '+card.name+' deals ');
  return text === card.oracle_text ? card : {...card, oracle_text: text};
}

export function modifierOperation(card, line, h) {
  const auraProtection=/^Enchanted creature has protection from (white|blue|black|red|green)\. This effect doesn't remove this (?:Aura|creature)\.$/.exec(line);
  if(auraProtection)return {kind:'protection-static',own:false,attached:true,filters:null,qualities:[{kind:'color',value:{white:'W',blue:'U',black:'B',red:'R',green:'G'}[auraProtection[1]]}],keywords:[],power:0,toughness:0,retainSourceAuraV9:true,contract:'protection-static'};
  const auraColor=/^(Enchanted creature gets [+-][0-9]+\/[+-][0-9]+) and is (white|blue|black|red|green)\.$/.exec(line);
  if(auraColor){const operation=h.line(card,auraColor[1]+'.');if(operation?.kind==='attachment-grant')return {kind:'v8-layered-static',own:false,attached:true,filters:null,change:{colors:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[auraColor[2]]]},operation,contract:'continuous-layered-characteristics'};}
  const casting={
    "You can't cast creature spells.":{players:'you',quality:'creature'},
    "Players can cast spells only during their own turns.":{players:'all',window:'other-turn'},
    "Your opponents can't cast spells during your turn.":{players:'opponents',window:'source-turn'},
    "Players can't cast spells during combat.":{players:'all',window:'combat'},
    "Each opponent can cast spells only any time they could cast a sorcery.":{players:'opponents',window:'non-sorcery'},
  }[line];
  if(casting)return {kind:'casting-prohibition-v9',...casting,contract:'casting-prohibition-v9'};
  if(line==='Umbra armor')return {kind:'mechanic-umbra-armor-v9',contract:'mechanic-umbra-armor-v9'};
  const artifactAnimation=/^Enchanted artifact is a creature with base power and toughness ([0-9]+)\/([0-9]+) in addition to its other types\.$/.exec(line);
  const landAnimation=/^Enchanted land is a ([0-9]+)\/([0-9]+) (white|blue|black|red|green) ([A-Z][A-Za-z-]+) creature(?: with (.+?))?(?:\. It's still a land| that's still a land)\.$/.exec(line);
  if(artifactAnimation||landAnimation){
    const match=artifactAnimation||landAnimation,keywords=landAnimation?.[5]?h.keywordList?.(landAnimation[5]):[];
    if(keywords&&(!landAnimation||ORACLE_SUBTYPES.has(landAnimation[4])))return {kind:'v8-layered-static',own:false,attached:true,filters:null,
      change:{creatureV9:true,...(landAnimation?{colors:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[landAnimation[3]]],addCreatureTypes:[landAnimation[4]]}:{})},
      operation:{kind:'base-pt-static',own:false,attached:true,filters:null,power:Number(match[1]),toughness:Number(match[2]),keywords,subtypes:[],contract:'base-pt-static'},contract:'continuous-layered-characteristics'};
  }
  const enchant=/^Enchant (.+)$/.exec(line);
  if(enchant&&/\bAura\b/.test(card.type_line)){
    const target=h.target('target '+enchant[1]);
    if(target?.zone==='battlefield'&&!['player','opponent','any'].includes(target.what))return {kind:'aura-target',what:target.what,targetV9:target,contract:'aura-targeting'};
  }
  if(line==="Damage can't be prevented.")return {kind:'damage-prevention-prohibition-v9',contract:'damage-prevention-prohibition-v9'};
  const characteristic=characteristicOperation(card,line,h);if(characteristic)return characteristic;
  if(line==='If this card is in your opening hand, you may begin the game with it on the battlefield.')return {kind:'mechanic-leyline-v9',contract:'mechanic-leyline-v9'};
  const ordinal=/^The (first|second) (creature |instant or sorcery )?spell you cast each turn costs \{([0-9]+)\} less to cast\.$/.exec(line);
  if(ordinal){const quality=(ordinal[2]||'').trim()||'all',target=quality==='all'?h.target('target permanent'):h.target('target '+quality);if(target)return {kind:'cost-modifier',target:quality==='all'?{what:'card',zone:'battlefield',controller:'any'}:target,controller:'you',amount:-Number(ordinal[3]),condition:{kind:'cast-ordinal-v9',quality,n:ordinal[1]==='first'?0:1},contract:'generic-cost-modification'};}

  line=line.replace(/\s+([.,])/g,'$1');
  if(line==='You have shroud.')return {kind:'mechanic-player-shroud-v9',contract:'mechanic-player-shroud-v9'};
  const uncounterable=/^(.+?) spells( you cast)? can't be countered\.$/.exec(line);
  if(uncounterable){const noun=uncounterable[1].replace(/^(Creature|Noncreature|Artifact|Enchantment|Instant|Sorcery)/,s=>s.toLowerCase()),target=h.target('target '+noun+' spell');if(target?.zone==='stack')return {kind:'uncounterable-spells-v9',target,controller:uncounterable[2]?'you':'any',contract:'uncounterable-spells-v9'};}
  const granted=/\b(exalted|flanking|afflict [1-9][0-9]*)\.$/.exec(line);
  if(granted&&typeof h.keywordList==='function'&&/\b(?:has|have)\b/.test(line)){
    const base=h.line(card,line.slice(0,granted.index)+'flying.');
    if(base&&['generic-static','attachment-grant'].includes(base.kind)){
      const numbered=/^(afflict|rampage) ([0-9]+)$/.exec(granted[1]),kind=numbered?numbered[1]:granted[1].replace(' ','-');
      return {...base,keywords:(base.keywords||[]).filter(k=>k!=='flying'||/\bflying\b/.test(line)),grantedMechanicV9:{kind:'mechanic-'+kind,...(numbered?{n:Number(numbered[2])}:{}),contract:'mechanic-'+kind}};
    }
  }
  if(['Nonbasic landwalk','Legendary landwalk'].includes(line))return {kind:'generic-static',scope:'self',keywords:[line.toLowerCase()],contract:'continuous-layer'};
  if(line==='Increment')return {kind:'mechanic-increment-v9',contract:'mechanic-increment-v9'};
  const freerunning=/^Freerunning ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(freerunning)return {kind:'mechanic-freerunning-v9',cost:freerunning[1],contract:'mechanic-freerunning-v9'};
  if(line==='Station'&&/\bSpacecraft\b/.test(card.type_line)){
    const tiers=[...(card.oracle_text||'').matchAll(/^([1-9][0-9]*)\+ \| /gm)].map(m=>Number(m[1]));
    if(tiers.length&&Number.isFinite(Number(card.power))&&Number.isFinite(Number(card.toughness)))return {kind:'mechanic-station-v9',threshold:Math.max(...tiers),contract:'mechanic-station-v9'};
  }
  const stationTier=/^([1-9][0-9]*)\+ \| (.+)$/.exec(line);
  if(stationTier&&/\bSpacecraft\b/.test(card.type_line)&&/^Station\b/m.test(card.oracle_text||'')&&typeof h.keywordList==='function'){
    const keywords=h.keywordList(stationTier[2]);if(keywords)return {kind:'generic-static',scope:'self',keywords,condition:{kind:'count-comparison',count:{kind:'source-counters',counter:'charge'},min:Number(stationTier[1])},contract:'continuous-layer'};
  }
  if(line==='Skip your draw step.'&&!/\b(?:Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-skip-draw-v9',contract:'mechanic-skip-draw-v9'};
  const devour=/^Devour (artifact|land) ([1-9][0-9]*)$/.exec(line);
  if(devour)return {kind:'mechanic-devour-v9',what:devour[1],n:Number(devour[2]),contract:'mechanic-devour-v9'};
  if(line==='Devour X, where X is the number of creatures devoured this way')return {kind:'mechanic-devour-v9',what:'creature',n:'devoured',contract:'mechanic-devour-v9'};
  const typecycle=/^([A-Za-z-]+)cycling ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(typecycle){const subtype=typecycle[1][0].toUpperCase()+typecycle[1].slice(1);if(ORACLE_SUBTYPES.has(subtype))return {kind:'mechanic-typecycling',subtype,cost:typecycle[2],contract:'mechanic-typecycling'};}
  const mayhem=/^Mayhem ((?:\{(?:[0-9]+|X|[WUBRGC]|[WUBRG]\/[WUBRG]|[WUBRG]\/P|2\/[WUBRG])\})+)$/.exec(line);
  if(mayhem&&/\b(?:Creature|Artifact|Enchantment|Planeswalker)\b/.test(card.type_line)&&!/\b(?:Land|Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-mayhem-v9',cost:mayhem[1],contract:'mechanic-mayhem-v9'};
  if(line==='Split second'&&!/\b(?:Land|Instant|Sorcery)\b/.test(card.type_line))return {kind:'mechanic-split-second',contract:'mechanic-split-second'};
  if(new RegExp('^'+escape(card.name)+' is colorless\\.$').test(line))return {kind:'mechanic-devoid',contract:'mechanic-devoid'};
  if(new RegExp('^'+escape(card.name)+' is every creature type\\.$').test(line))return {kind:'mechanic-changeling',contract:'mechanic-changeling'};
  const recover=/^Recover ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(recover)return {kind:'mechanic-recover-v9',cost:recover[1],contract:'mechanic-recover-v9'};
  const ward=/\bward ((?:\{(?:[0-9]+|[WUBRGC])\})+)\.$/.exec(line);
  if(ward&&typeof h.keywordList==='function'&&/\b(?:has|have)\b/.test(line)){
    const base=h.line(card,line.replace(ward[0],'flying.'));
    if(base&&['generic-static','attachment-grant'].includes(base.kind))return {...base,keywords:(base.keywords||[]).filter(k=>k!=='flying'||/\bflying\b/.test(line)),wardV9:{mana:ward[1]}};
  }
  const amplify=/^Amplify ([1-9][0-9]*)$/.exec(line);
  if(amplify)return {kind:'mechanic-amplify-v9',n:Number(amplify[1]),contract:'mechanic-amplify-v9'};
  const reconfigure=/^Reconfigure ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(reconfigure&&/\bEquipment\b/.test(card.type_line))return {kind:'mechanic-reconfigure-v9',cost:reconfigure[1],contract:'mechanic-reconfigure-v9'};
  const champion=/^Champion (?:a|an) (.+)$/.exec(line);
  if(champion){const filters=champion[1].split(' or ').map(noun=>h.target('another target '+noun+' you control'));if(filters.every(filter=>filter?.zone==='battlefield'))return {kind:'mechanic-champion-v9',filters,contract:'mechanic-champion-v9'};}
  const rampage=/^Rampage ([1-9][0-9]*)$/i.exec(line);
  if(rampage)return {kind:'mechanic-rampage',n:Number(rampage[1]),contract:'mechanic-rampage'};
  if(line==="Players can't gain life."||line==="Your opponents can't gain life.")return {kind:'life-gain-prohibition-v9',who:line.startsWith('Players')?'all':'opponents',contract:'life-gain-prohibition-v9'};
  if(card.oracleDayNightFaceV9&&line===card.oracleDayNightFaceV9)return {kind:'day-night-v9',face:line.toLowerCase(),contract:'day-night-v9'};
  const dredge = /^Dredge ([0-9]+)$/.exec(line);
  if (dredge) return {kind:'mechanic-dredge',n:Number(dredge[1]),contract:'mechanic-dredge'};
  const plot=/^Plot ((?:\{(?:[0-9]+|[WUBRGC])\})+)$/.exec(line);
  if(plot)return {kind:'mechanic-plot',cost:plot[1],contract:'mechanic-plot'};
  return null;
}

export function extensionCost(text,h,card){
  if(text==='Put a -1/-1 counter on this creature')return {counter:'-1/-1'};
  const top=/^Exile the top (creature )?card of your graveyard$/.exec(text);
  if(top)return {exileFromGY:1,exileFilter:{...h.target('target '+(top[1]||'')+'card from your graveyard'),graveyardTopV9:top[1]?'creature':'card'}};
  const named=card&&new RegExp('^Discard another card named '+escape(card.name)+'(, .+)?$').exec(text);
  if(named){const rest=named[1]?h.cost(named[1].slice(2)):{};if(rest&&!rest.discard&&!rest.discardFilter)return {...rest,discard:1,discardFilter:{...h.target('target card from your graveyard'),name:card.name,excludeSelf:true}};}

  const parts=text.split(/,\s*/);
  if(parts.length>1){
    const atoms=parts.map(part=>h.cost(part));
    if(atoms.every(Boolean)){
      // Counter payments keep the complete v8 cost parser's atomic-payment
      // restrictions. Splitting a rejected cost must not bypass those guards.
      if(atoms.some(atom=>atom.oracleCounterPayment))return null;
      const keys=atoms.flatMap(atom=>Object.keys(atom));
      if(new Set(keys).size===keys.length)return Object.assign({},...atoms);
    }
  }
  const mill=/^Mill (a|one|two|three|[0-9]+) cards?$/.exec(text);
  if(mill)return {mill:amount(mill[1])};
  const discard=/^Discard (?:a|an) (.+?) card$/.exec(text);
  if(discard){const filter=h.target('target '+discard[1]+' card from your graveyard');if(filter)return {discard:1,discardFilter:filter};}
  const exile=new RegExp('^Exile ('+NUM+') other (.+?) from your graveyard$').exec(text);
  if(exile){const filter=h.target('another target '+singular(exile[2])+' from your graveyard');if(filter)return {exileFromGY:amount(exile[1]),exileFilter:filter};}
  const sac=/^Sacrifice (.+? or .+)$/.exec(text);
  if(sac){
    const filters=sac[1].split(' or ').map(noun=>h.target('target '+noun.replace(/^(?:a|an|another) /,'')+' you control')).map((filter,i)=>filter&&{...filter,...(/^another /.test(sac[1].split(' or ')[i])?{excludeSelf:true}:{})});
    if(filters.every(filter=>filter?.zone==='battlefield'))return {sacN:1,sacFilter:{what:'permanent',zone:'battlefield',controller:'you',min:1,alternatives:filters}};
  }
  if(parts.filter(part=>part==='{Q}').length===1&&!parts.includes('{T}')){
    const rest=parts.filter(part=>part!=='{Q}'),cost=rest.length?h.cost(rest.join(', ')):{};
    if(cost&&!cost.tap&&!cost.untapSelf)return {...cost,untapSelf:true};
  }
  if(parts.filter(part=>part==='Discard your hand').length===1){
    const rest=parts.filter(part=>part!=='Discard your hand'),cost=rest.length?h.cost(rest.join(', ')):{};
    if(cost&&!cost.discard)return {...cost,discard:'all'};
  }
  return null;
}

export function extensionLine(card,line,h){
  const activation=/^Whenever (you activate|a player activates|an opponent activates) an ability(?: of an? (.+?))? that isn't a mana ability, (.+)$/.exec(line);
  if(activation){const parsed=h.effect(card,activation[3]),target=activation[2]?h.target('target '+activation[2]):null;if(parsed&&(!activation[2]||target?.zone==='battlefield'))return {kind:'generic-trigger',event:'abilityActivated',eventFilter:{kind:'observation-v9',controller:activation[1].startsWith('you')?'you':activation[1].startsWith('an opponent')?'opponent':'any',nonmana:true,...(target?{target}: {})},...parsed,contract:'generic-trigger-effect'};}
  const attached=/^Whenever an Aura becomes attached to this creature, (.+)$/.exec(line);
  if(attached){const parsed=h.effect(card,attached[1]);if(parsed)return {kind:'generic-trigger',event:'attached',eventFilter:{kind:'observation-v9',auraAttachedSelf:true},...parsed,contract:'generic-trigger-effect'};}
  const cycle=/^Whenever you cycle or discard (another )?card, (.+)$/.exec(line);
  if(cycle){const parsed=h.effect(card,cycle[2]);if(parsed)return {kind:'generic-trigger',event:'discarded',eventFilter:{kind:'batch-discard-v8',controller:'you',target:{what:'card',zone:'graveyard',controller:'any',...(cycle[1]?{excludeSelf:true}:{})}},...parsed,contract:'generic-trigger-effect'};}
  const playCast=/^Whenever you (?:play a land or cast a spell|cast a spell or play a land), (.+)$/.exec(line);
  if(playCast){const parsed=h.effect(card,playCast[1]);if(parsed&&!/event-card/.test(JSON.stringify(parsed)))return {kind:'operation-bundle',operations:[{kind:'generic-trigger',event:'landPlayed',eventFilter:{kind:'observation-v9',controller:'you'},...structuredClone(parsed),contract:'generic-trigger-effect'},{kind:'generic-trigger',event:'cast',eventFilter:{kind:'your-filtered-cast',what:'card',controller:'you'},...parsed,contract:'generic-trigger-effect'}],contract:'closed-permanent-clauses'};}

  const performed=/^Whenever (you proliferate|you complete a dungeon), (.+)$/.exec(line);
  if(performed){const parsed=h.effect(card,performed[2]);if(parsed)return {kind:'generic-trigger',event:performed[1]==='you proliferate'?'proliferatedV9':'dungeonCompleted',eventFilter:{kind:'observation-v9',controller:'you'},...parsed,contract:'generic-trigger-effect'};}
  const keyword=modifierOperation(card,line,h);if(keyword)return keyword;
  const reconfigured=/^Whenever this creature or equipped creature (.+)$/.exec(line);
  if(reconfigured&&/\bReconfigure\b/.test(card.oracle_text||'')){
    const operations=[h.line(card,'Whenever this creature '+reconfigured[1]),h.line(card,'Whenever equipped creature '+reconfigured[1])];
    if(operations.every(op=>op&&['generic-trigger','attachment-operation'].includes(op.kind)))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  // In a permanent-arrival/death trigger, this explicit controller clause
  // binds the player to the observed permanent, including its LKI.
  const controllerEvent=/^((?:When|Whenever) (?:another |a |an |one or more )?.+? (?:you control|an opponent controls) (?:enters|dies)), (.+)$/.exec(line);
  if(controllerEvent&&/\bthat player\b/i.test(controllerEvent[2])){
    const normalized=controllerEvent[1]+', '+controllerEvent[2].replace(/\bthat player\b/gi,"that permanent's controller");
    const result=h.line(card,normalized);if(result?.kind==='generic-trigger')return result;
  }
  const selfDamage=new RegExp('^(.*?put (?:(?:a|an|one|two|three|[0-9]+) )?(?:\\+1/\\+1|[a-z]+) counters? on '+selfPattern(card)+')(?:, then it deals|\\. It deals) (.+)$','i').exec(line);
  if(selfDamage){const result=h.line(card,selfDamage[1]+'. '+card.name+' deals '+selfDamage[2]);if(result)return result;}
  const endureSelf=new RegExp('^((?:When|Whenever) '+selfPattern(card)+' (?:enters|attacks|enters or attacks), .*)\\bit endures ([1-9][0-9]*)\\.','i');
  if(endureSelf.test(line))return h.line(card,line.replace(/\bit endures /,'this creature endures '));
  if(line==='Job select'&&/\bEquipment\b/.test(card.type_line))return {kind:'generic-trigger',event:'etb',eventFilter:'self',targets:[],effects:[{action:'token-key',who:'you',n:1,tokenKey:'hero11'},{action:'attach-source',target:'created-tokens',chooseOneV9:true}],contract:'generic-trigger-effect'};
  const keywordParts=line.split(/\s*[,;]\s*/);
  if(keywordParts.length>1&&!/[.:]/.test(line)){
    const operations=keywordParts.map(part=>{const keywords=h.keywordList(part);const mechanic=['flanking','exalted','training','mentor','battle cry','myriad'].includes(part.toLowerCase())?part.toLowerCase().replace(' ','-'):null;return keywords?{kind:'generic-static',scope:'self',power:0,toughness:0,keywords,contract:'continuous-layer'}:mechanic?{kind:'mechanic-'+mechanic,contract:'mechanic-'+mechanic}:h.line(card,part);});
    if(operations.filter(op=>op?.kind==='mechanic-typecycling').length>1)return null;
    if(operations.every(op=>op&&(op.kind==='generic-static'||op.kind.startsWith('mechanic-')||op.kind==='protection-from')))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  const largeKeyword=/^(Renown|Toxic|Bloodthirst|Bushido|Afterlife) ([6-9]|[1-9][0-9]+)$/.exec(line);
  if(largeKeyword)return {kind:'mechanic-'+largeKeyword[1].toLowerCase(),n:Number(largeKeyword[2]),contract:'mechanic-'+largeKeyword[1].toLowerCase()};
  const playerCondition=/^(At the beginning of (?:each opponent's|each player's|each|your) (?:upkeep|end step)|Whenever a player casts a spell), if (that player .+?|it's not their turn), (.+)$/.exec(line);
  if(playerCondition){
    const conditionText=playerCondition[2].replace(/^that player controls /,'you control ').replace(/^that player has /,'you have ').replace(/^that player didn't /,"you didn't ").replace(/^it's not their turn$/,"it's not your turn");
    const condition=h.condition(conditionText),parsed=condition&&h.line(card,playerCondition[1]+', '+playerCondition[3].replace(/\bto them\b/g,'to that player'));
    if(parsed?.kind==='generic-trigger'&&!parsed.condition&&['upkeep','endStep','cast'].includes(parsed.event))return {...parsed,condition:{kind:'event-player-condition-v9',condition}};
  }
  const first=/^(When(?:ever)? .+?)(?: for the first time each turn), (.+)$/.exec(line);
  if(first&&!/one or more/.test(first[1])){const parsed=h.line(card,first[1]+', '+first[2]);if(parsed?.kind==='generic-trigger')return {...parsed,onceEachTurn:true,onceGroup:line};}
  const entered=/^Whenever (.+?) enters tapped, (.+)$/.exec(line);
  if(entered){const parsed=h.line(card,'Whenever '+entered[1].replace(/^(a|an) /,'a tapped ')+' enters, '+entered[2]);if(parsed)return parsed;}
  const graveActivation=/^(?:Renew — )?((?:\{(?:[0-9]+|[WUBRGC]|[WUBRG]\/[WUBRG])\})+), Exile this card from your graveyard: (.+)$/.exec(line);
  if(graveActivation){const sorceryOnly=/ Activate only as a sorcery\.$/.test(graveActivation[2]),parsed=h.effect(card,graveActivation[2].replace(/ Activate only as a sorcery\.$/,''));if(parsed&&!/source-stat/.test(JSON.stringify(parsed)))return {kind:'generic-ability',from:'graveyard',cost:{mana:graveActivation[1],exileSelf:true},sorceryOnly,...parsed,contract:'generic-activated-effect'};}
  let observed=/^Whenever (you|an opponent|a player) (rolls? one or more dice), (.+)$/.exec(line);
  if(observed){const parsed=h.effect(card,observed[3]);if(parsed&&!/event-card/.test(JSON.stringify(parsed)))return {kind:'generic-trigger',event:observed[2].startsWith('roll')?'diceRolled':'searchedLibrary',eventFilter:{kind:'observation-v9',controller:observed[1]==='you'?'you':observed[1]==='an opponent'?'opponent':'any'},...parsed,contract:'generic-trigger-effect'};}
  observed=/^Whenever (this creature|a creature you control) (mutates|becomes renowned), (.+)$/.exec(line);
  if(observed){const parsed=h.effect(card,observed[3]);if(parsed)return {kind:'generic-trigger',event:observed[2]==='mutates'?'mutated':'renowned',eventFilter:{kind:'observation-v9',self:observed[1]==='this creature',target:observed[1]==='this creature'?null:h.target('target creature you control')},...parsed,contract:'generic-trigger-effect'};}
  observed=/^Whenever (you tap|an opponent taps|a player taps) (?:a|an) (.+?) for mana, (.+)$/.exec(line);
  if(observed){
    const target=h.target('target '+observed[2]);
    // The native tappedForMana event currently observes land mana abilities.
    // A creature or artifact tap needs its own event support before import.
    const land=target?.what==='land'||['Plains','Island','Swamp','Mountain','Forest'].includes(target?.subtype);
    const parsed=land&&h.effect(card,observed[3]);
    if(parsed&&target.zone==='battlefield')return {kind:'generic-trigger',event:'tappedForMana',eventFilter:{kind:'observation-v9',controller:observed[1]==='you tap'?'you':observed[1]==='an opponent taps'?'opponent':'any',target},...parsed,contract:'generic-trigger-effect'};
  }
  observed=/^Whenever (?:a|an) (.+?) is put into (your|an opponent's|a player's) graveyard from the battlefield, (.+)$/.exec(line);
  if(observed){const target=h.target('target '+observed[1]),parsed=target&&h.effect(card,observed[3]);if(parsed&&target.zone==='battlefield')return {kind:'generic-trigger',event:'lto',eventFilter:{kind:'observation-v9',target,graveOwner:observed[2]==='your'?'you':observed[2]==="an opponent's"?'opponent':'any',destination:'graveyard'},...parsed,contract:'generic-trigger-effect'};}
  observed=/^At the beginning of the upkeep of enchanted (?:creature|land|enchantment|artifact|permanent)'s controller, (.+)$/.exec(line);
  if(observed){const parsed=h.effect(card,observed[1]);if(parsed)return {kind:'generic-trigger',event:'upkeep',eventFilter:{kind:'observation-v9',attachedController:true},...parsed,contract:'generic-trigger-effect'};}
  if(/one or more/.test(line)&&/that many|that much/.test(line)){
    const parsed=batchTrigger(card,line,h);
    if(parsed&&['batch-discard-v8','filtered-sacrifice','created-batch-v8','filtered-object'].includes(parsed.eventFilter?.kind)){
      const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?node.kind==='event-amount'?{kind:'batch-amount-v9'}:Object.fromEntries(Object.entries(node).map(([key,value])=>[key,bind(value)])):node;
      return {...parsed,effects:bind(parsed.effects)};
    }
  }
  const choices=/^(.+?) or (.+?): (.+)$/.exec(line);
  if(choices){
    const costs=[h.cost(choices[1]),h.cost(choices[2])],parsed=costs.every(Boolean)&&h.effect(card,choices[3]);
    if(parsed&&costs.every(cost=>Object.keys(cost).every(key=>['tap','mana'].includes(key))))return {kind:'operation-bundle',operations:costs.map(cost=>({kind:'generic-ability',cost,...structuredClone(parsed),contract:'generic-activated-effect'})),contract:'closed-permanent-clauses'};
  }
  const discard=/^(.+Discard your hand): (.+)$/.exec(line);
  if(discard){const cost=h.cost(discard[1]),parsed=cost&&h.effect(card,discard[2]);if(parsed)return {kind:'generic-ability',cost,...parsed,contract:'generic-activated-effect'};}
  const expend=/^Whenever you expend (4|8), (.+)$/.exec(line);
  if(expend){const parsed=h.effect(card,expend[2]);if(parsed)return {kind:'generic-trigger',event:'expend'+expend[1],eventFilter:'your-player',...parsed,contract:'generic-trigger-effect'};}
  const untap=/^(.*\{Q\}.*): (.+)$/.exec(line);
  if(untap){const cost=h.cost(untap[1]),parsed=h.effect(card,untap[2]);if(cost&&parsed)return {kind:'generic-ability',cost,...parsed,contract:'generic-activated-effect'};}
  // Two explicitly printed trigger events share an effect, but retain two
  // independent trigger identities and announcement/resolution paths.
  let match=/^When (.+?) enters and whenever (.+?), (.+)$/.exec(line);
  if(match){
    const operations=[h.line(card,'When '+match[1]+' enters, '+match[3]),h.line(card,'Whenever '+match[2]+', '+match[3])];
    if(operations.every(op=>op?.kind==='generic-trigger'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  match=/^Whenever (.+?) enters or deals combat damage to a player, (.+)$/.exec(line);
  if(match){
    const operations=[h.line(card,'When '+match[1]+' enters, '+match[2]),h.line(card,'Whenever '+match[1]+' deals combat damage to a player, '+match[2])];
    if(operations.every(op=>op?.kind==='generic-trigger'))return {kind:'operation-bundle',operations,contract:'closed-permanent-clauses'};
  }
  return null;
}

export function extensionEffect(card, line, h) {
  const manyPlayers=/^any number of target players each (gain|lose|draw|mill) ([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten) (life|cards?)\.$/i.exec(line);
  if(manyPlayers){const parsed=h.effect(card,'Target player '+manyPlayers[1].toLowerCase()+'s '+manyPlayers[2]+' '+manyPlayers[3]+'.');if(parsed?.targets.length===1)return {...parsed,targets:[h.target('any number of target players')]};}
  const exileAllGrave=/^(target player|target opponent) exiles all (.+?) cards from their graveyard\.$/i.exec(line);
  if(exileAllGrave){const filter=h.target('target '+exileAllGrave[2].toLowerCase()+' card from your graveyard');if(filter?.zone==='graveyard')return body([{action:'zone-select',zone:'graveyard',who:0,filter,n:'all',destination:'exile'}],[h.target(exileAllGrave[1].toLowerCase())]);}
  if(/^Put target face-up exiled card into its owner's graveyard\.$/i.test(line))return body([{action:'graveyard-v9',target:0}],[{what:'card',zone:'exile',controller:'any',min:1,faceUpV9:true}]);
  const setLifeAmount=/^(?:you may have )?your life total (?:becomes?|become)(?: equal to)? (.+)\.$/i.exec(line);
  if(setLifeAmount){const text=setLifeAmount[1],n=text==='your starting life total'?{kind:'starting-life-v9'}:text==='half your starting life total, rounded up'?{kind:'starting-life-v9',half:true}:/^[0-9]+$/.test(text)?Number(text):h.value(text);if(n!==null&&n!==undefined)return body([{action:'set-life-v9',who:'you',n}],[],/^you may /i.test(line));}
  const countLife=/^Count the number of (.+)\. Your life total becomes that number\.$/i.exec(line);
  if(countLife){const n=h.count(countLife[1]);if(n)return body([{action:'set-life-v9',who:'you',n}]);}
  const doubleLife=/^double (your|target player's|its controller's) life total\.$/i.exec(line);
  if(doubleLife){const actor=doubleLife[1].toLowerCase();return body([{action:'set-life-v9',who:actor==='your'?'you':actor==="target player's"?0:'event-card-controller',double:true}],actor==="target player's"?[h.target('target player')]:[]);}
  const targetedLife=/^target (player|opponent)'s life total becomes ([0-9]+)\.$/i.exec(line);
  if(targetedLife)return body([{action:'set-life-v9',who:0,n:Number(targetedLife[2])}],[h.target('target '+targetedLife[1].toLowerCase())]);
  const noCast=/^(your opponents|target player|target opponent|defending player|that player|you) can't cast (noncreature )?spells this turn\.$/i.exec(line);
  if(noCast){const actor=noCast[1].toLowerCase(),target=actor.startsWith('target ');return body([{action:'no-cast-v9',who:target?0:({'your opponents':'each-opponent','defending player':'combat-defender-v9','that player':'event-player',you:'you'})[actor],quality:noCast[2]?'noncreature':'all'}],target?[h.target(actor)]:[]);}
  const counterSilence=/^(Counter target spell\.) Its controller can't cast spells this turn\.$/i.exec(line);
  if(counterSilence){const first=h.effect(card,counterSilence[1]);if(first)return {...first,effects:[...first.effects,{action:'no-cast-v9',who:{kind:'target-controller',index:0},quality:'all'}]};}
  const blight=/^(?:you )?blight ([1-9][0-9]*)\.$/i.exec(line);
  if(blight)return body([{action:'blight-v9',who:'you',n:Number(blight[1])}]);
  const groupBlight=/^(each player|each opponent|target player|target opponent) blights ([1-9][0-9]*)\.$/i.exec(line);
  if(groupBlight){const who=groupBlight[1].toLowerCase(),target=who.startsWith('target ');return body([{action:'blight-v9',who:target?0:who.replace(' ','-'),n:Number(groupBlight[2])}],target?[h.target(who)]:[]);}
  const optionalBlight=/^you may blight ([1-9][0-9]*)\. If you do, (.+)$/i.exec(line);
  if(optionalBlight){const parsed=h.effect(card,optionalBlight[2]);if(parsed&&!parsed.targets.length&&!parsed.optional)return body([{action:'blight-v9',who:'you',n:Number(optionalBlight[1]),optional:true,effects:parsed.effects}]);}
  const verbTarget=/^((?:Destroy|Exile|Tap|Untap|Regenerate) )(target .+?)(\.(?: It can't be regenerated\.)?)$/i.exec(line);
  const damageTarget=/^(.+? deals (?:[0-9]+|X) damage to )(target .+?)(\.)$/i.exec(line);
  const returningTarget=/^(Return )(target .+?)( to (?:its owner's hand|the battlefield(?: tapped)?(?: under (?:your|its owner's) control)?)\.)$/i.exec(line);
  const targetVerb=verbTarget||damageTarget||returningTarget;
  if(targetVerb){
    const target=h.target(targetVerb[2].replace(/^Target /,'target '));
    if(target&&!['player','opponent','any'].includes(target.what)&&['battlefield','graveyard'].includes(target.zone)){
      const placeholder=target.zone==='graveyard'?'target creature card from your graveyard':'target creature';
      const replacement=targetVerb[1]+placeholder+targetVerb[3];
      if(replacement.toLowerCase()!==line.toLowerCase()){
        const parsed=h.effect(card,replacement);if(parsed?.targets.length===1)return {...parsed,targets:[target]};
      }
    }
  }
  // Preserve a complete target restriction while the older effect grammar
  // reads its closed verb phrase using a primitive target noun.
  const targetClause=/^((?:up to (?:one|two|three)|any number of|another) )?target (.+?) (?=(?:gets?|gains?|has|becomes?|can't|cannot) )/i.exec(line);
  if(targetClause){
    const phrase=targetClause[0].trim(),target=h.target(phrase[0].toLowerCase()+phrase.slice(1));
    if(target?.zone==='battlefield'&&!['player','opponent','any'].includes(target.what)){
      const placeholder='Target creature',replacement=placeholder+line.slice(targetClause[0].length-1);
      if(replacement.toLowerCase()!==line.toLowerCase()){
        const parsed=h.effect(card,replacement);
        if(parsed?.targets.length===1)return {...parsed,targets:[target]};
      }
    }
  }
  const deadReturn=/^return (?:that card|it) to ((?:its owner's|your) hand|the battlefield( tapped)? under (your|its owner's) control)( with a \+1\/\+1 counter on (?:it|that creature))?\.$/i.exec(line);
  if(deadReturn){if(deadReturn[1].endsWith('hand'))return deadReturn[4]?null:body([{action:'bounce',target:'event-card'}]);return body([{action:'reanimate',target:'event-card',controller:deadReturn[3]==='your'?'you':'owner',tapped:!!deadReturn[2],followReturnedV9:true,...(deadReturn[4]?{additionalCountersV9:{'+1/+1':1}}:{})}]);}
  const lasting=new RegExp('^(.+?) for as long as '+selfPattern(card)+' remains (tapped|on the battlefield)\\.( (?:It\\x27s|They\\x27re) still (?:a land|lands)\\.)?$','i').exec(line);
  if(lasting){
    const parsed=h.effect(card,lasting[1].replace(/ and has /,' and gains ')+' until end of turn.'+(lasting[3]||''));
    if(parsed&&!parsed.optional&&parsed.effects.length===1&&['pump','pump-group','animate','base-pt','gain-control'].includes(parsed.effects[0].action))return {...parsed,effects:parsed.effects.map(e=>({...e,duration:lasting[2]==='tapped'?'source-tapped-v9':'source-battlefield-v9'}))};
  }
  const controllerTail=/^((?:Destroy|Exile|Return|Counter) target [^.]+\.) (?:Then )?(?:Its|That (?:creature|artifact|enchantment|permanent|spell)'s) controller (.+)\.$/i.exec(line);
  if(controllerTail){
    const first=h.effect(card,controllerTail[1]),may=/^may /.test(controllerTail[2]),text=controllerTail[2].replace(/^may /,'').replace(/^draws /,'draw ').replace(/^discards /,'discard ').replace(/^gains /,'gain ').replace(/^investigates$/,'investigate').replace(/\btheir\b/g,'your');
    const second=h.effect(card,text+'.')||h.effect(card,'You '+text+'.');
    if(first?.targets.length===1&&!first.optional&&second&&!second.targets.length&&second.effects.every(e=>['draw','gain-life','discard','discard-hand','scry','surveil','investigate'].includes(e.action)&&(typeof e.n!=='object'||e.n?.kind==='source-stat'&&/\bits (?:power|toughness|mana value)\b/i.test(text)))){
      const actor={kind:'target-controller',index:0};
      const effects=second.effects.map(e=>({...e,...(e.n?.kind==='source-stat'?{n:{kind:'target-stat',target:0,stat:e.n.stat}}:{})}));
      return body([...first.effects,...(may?[{action:'player-choice-v9',who:actor,effects}]:effects.map(e=>({...e,who:actor})))],first.targets);
    }
  }
  const destroyDamage=/^(Destroy target (?:artifact|creature|permanent)\.(?: It can't be regenerated\.)?) (.+?) deals damage (?:to that (?:artifact|creature|permanent)'s controller equal to (?:(?:that|the) (?:artifact|creature|permanent)'s|its) (mana value|power|toughness)|equal to (?:(?:that|the) (?:artifact|creature|permanent)'s|its) (mana value|power|toughness) to (?:that (?:artifact|creature|permanent)'s|its) controller)\.$/i.exec(line);
  if(destroyDamage&&new RegExp('^'+selfPattern(card)+'$','i').test(destroyDamage[2])){
    const first=h.effect(card,destroyDamage[1]),stat=destroyDamage[3]||destroyDamage[4];
    if(first?.targets.length===1&&!first.optional)return body([...first.effects,{action:'damage',target:{kind:'target-controller',index:0},n:{kind:'target-stat',target:0,stat:stat==='mana value'?'mv':stat}}],first.targets);
  }
  const graveTail=/^((?:Target player|Target opponent) [^.]+\.) (?:Then )?exile that player's graveyard\.$/i.exec(line);
  if(graveTail){const first=h.effect(card,graveTail[1]);if(first?.targets.length===1&&!first.optional&&['player','opponent'].includes(first.targets[0].what))return body([...first.effects,{action:'zone-select',zone:'graveyard',who:0,filter:{what:'card',zone:'graveyard',controller:'you'},n:'all',destination:'exile'}],first.targets);}
  const typeGroup=/\b(creatures|permanents) of the creature type of your choice\b/i.exec(line);
  const colorGroup=/\b(creatures|permanents|enchantments|artifacts) of the color of your choice\b/i.exec(line);
  const chosenGroup=typeGroup||colorGroup;
  if(chosenGroup){
    const parsed=h.effect(card,line.replace(chosenGroup[0],chosenGroup[1]));
    if(parsed&&!parsed.optional&&!parsed.targets.length&&parsed.effects.every(e=>e.filters?.length||e.action==='pump-group')){
      const effects=parsed.effects.map(e=>({...e,filters:(e.filters||[{what:'creature',zone:'battlefield',controller:e.who==='your-creatures'?'you':'any'}]).map(f=>({...f,chosenGroupV9:typeGroup?'creature-type':'color'}))}));
      return body([{action:'choose-group-v9',choice:typeGroup?'creature-type':'color',effects}]);
    }
  }
  const groupLoss=/^(all )?(other )?(creatures(?: you control| your opponents control)?) lose (.+) until end of turn\.$/i.exec(line);
  if(groupLoss){const keywords=h.keywordList(groupLoss[4]),filter=h.target((groupLoss[2]?'another ':'')+'target '+singular(groupLoss[3]).replace('your opponents control','an opponent controls'));if(keywords&&filter)return body([{action:'remove-keywords-v9',filters:[filter],keywords}]);}
  const separate=/^(return|untap|tap|exile) ((?:up to (?:one|two|three)|one|two|three)? ?target .+?) and ((?:up to (?:one|two|three)|one|two|three)? ?target .+?)( from your graveyard to your hand| to their owners' hands)?\.$/i.exec(line);
  if(separate){let suffix=separate[4]||'';if(suffix===" to their owners' hands")suffix=" to its owner's hand";
    const parts=[separate[2],separate[3]].map(p=>h.effect(card,separate[1]+' '+p+suffix+'.'));
    if(parts.every(p=>p&&!p.optional&&p.targets.length===1))return body([...parts[0].effects,...shiftTargets(parts[1].effects,1)],[...parts[0].targets,...parts[1].targets]);
  }
  const control=/^(?:you )?gain control of all (.+)\.$/i.exec(line);
  if(control){const filter=h.target('target '+singular(control[1]));if(filter?.zone==='battlefield')return body([{action:'gain-control',filters:[filter]}]);}
  const unattach=/^unattach all Equipment from (target creature)\.$/i.exec(line);
  if(unattach)return body([{action:'unattach-equipment-v9',target:0}],[h.target(unattach[1])]);
  const perPlayer=/^(.+?) deals damage to (each player|each opponent) equal to (.+)\.$/i.exec(line);
  if(perPlayer&&new RegExp('^(?:'+selfPattern(card)+'|it)$','i').test(perPlayer[1])){
    const value=h.value(perPlayer[3]);
    if(value&&JSON.stringify(value).includes('event-player')){
      const bind=n=>Array.isArray(n)?n.map(bind):n&&typeof n==='object'?Object.fromEntries(Object.entries(n).map(([k,v])=>[k,k==='target'&&v==='event-player'?0:bind(v)])):n;
      return body([{action:'player-sequence-v9',who:perPlayer[2].replace(' ','-'),effects:[{action:'damage',target:0,n:bind(value)}]}]);
    }
  }
  const have=/^you may have (.+?) (gain|get|become|deal) (.+)\.$/i.exec(line);
  if(have){const parsed=h.effect(card,have[1]+' '+have[2]+' '+have[3]+'.')||h.effect(card,have[1]+' '+have[2]+'s '+have[3]+'.');if(parsed&&!parsed.optional&&parsed.effects.every(e=>['pump','base-pt','animate','damage'].includes(e.action)))return {...parsed,optional:true};}
  const choice=/^(each player|each opponent|target player|target opponent|that player) may (.+)\.$/i.exec(line);
  if(choice){const clause=choice[2].replace(/\btheir\b/g,'your');const parsed=h.effect(card,clause+'.')||h.effect(card,'You '+clause+'.')||h.effect(card,'You may '+clause+'.');
    if(parsed&&!parsed.targets.length&&parsed.effects.length&&parsed.effects.every(e=>['draw','gain-life','mill','discard','discard-hand','discard-hand-draw','scry','surveil','zone-select'].includes(e.action))){
      const actor=choice[1].toLowerCase(),targeted=actor.startsWith('target ');return body([{action:'player-choice-v9',who:targeted?0:actor==='that player'?'event-player':actor.replace(' ','-'),effects:parsed.effects}],targeted?[h.target(actor)]:[]);
    }
  }

  if(/^Damage can't be prevented this turn\.$/i.test(line))return body([{action:'no-damage-prevention-v9'}]);
  const noGain=/^(Players|Your opponents) can't gain life this turn\.$/i.exec(line);
  if(noGain)return body([{action:'no-life-gain-v9',who:noGain[1].toLowerCase()==='players'?'all':'opponents'}]);
  const duration=line.replace(/^Until end of turn, (.+)\.$/i,'$1 until end of turn.');
  const changing=/^(.+?) (gains?|loses?) (.+?) and (gains?|loses?) (.+?) until end of turn\.$/i.exec(duration);
  if(changing&&changing[2].toLowerCase().startsWith('gain')!==changing[4].toLowerCase().startsWith('gain')){
    const a=h.effect(card,changing[1]+' '+changing[2]+' '+changing[3]+' until end of turn.'),b=h.effect(card,changing[1]+' '+changing[4]+' '+changing[5]+' until end of turn.');
    if(a&&b&&!a.optional&&!b.optional&&JSON.stringify(a.targets)===JSON.stringify(b.targets)&&a.effects.every(e=>['pump','remove-keywords-v9'].includes(e.action))&&b.effects.every(e=>['pump','remove-keywords-v9'].includes(e.action)))return {...a,effects:[...a.effects,...b.effects]};
  }
  const baseOne=/^(.+?) (?:has|have) base (power|toughness) ([0-9]+)(?: and gains? (.+?))? until end of turn\.$/i.exec(duration);
  if(baseOne){const target=h.target(baseOne[1]),own=new RegExp('^'+selfPattern(card)+'$','i').test(baseOne[1]),keywords=baseOne[4]?h.keywordList(baseOne[4]):[];if((target?.zone==='battlefield'||own)&&keywords)return body([{action:'base-pt',target:target?0:'self',[baseOne[2].toLowerCase()]:Number(baseOne[3]),keywords,temporary:true}],target?[target]:[]);}
  const gainBase=/^(.+?) gains? (.+?) and has base (power|toughness) ([0-9]+) until end of turn\.$/i.exec(duration);
  if(gainBase)return h.effect(card,gainBase[1]+' has base '+gainBase[3]+' '+gainBase[4]+' and gains '+gainBase[2]+' until end of turn.');
  const dynamicSelf=new RegExp('^(?:you may )?(?:change '+selfPattern(card)+"'s base (power|toughness|power and toughness) to|have "+selfPattern(card)+"'s base (power|toughness|power and toughness) become equal to) (target creature's|that creature's) (power|toughness|power and toughness)( until end of turn)?\\.$",'i').exec(duration);
  if(dynamicSelf){const stat=dynamicSelf[1]||dynamicSelf[2];if(stat===dynamicSelf[4]){const targeted=dynamicSelf[3]==="target creature's",fields=stat.split(' and '),effect={action:'base-pt',target:'self',keywords:[],temporary:!!dynamicSelf[5]};for(const field of fields)effect[field]=targeted?{kind:'target-stat',target:0,stat:field}:{kind:'event-card-stat',stat:field};return body([effect],targeted?[h.target('target creature')]:[],/^you may /i.test(duration));}}
  const countBuff=/^(.+?) gets? ([+-][0-9]+)\/([+-][0-9]+) for each (.+?) and gains? (.+?) until end of turn\.$/i.exec(duration);
  if(countBuff){const target=h.target(countBuff[1]),own=new RegExp('^'+selfPattern(card)+'$','i').test(countBuff[1]),count=h.count(countBuff[4]),keywords=h.keywordList(countBuff[5]);if((target?.zone==='battlefield'||own)&&count&&keywords){const scaled=field=>({kind:'sum',values:[count],multiply:Number(field)});return body([{action:'pump',target:target?0:'self',power:scaled(countBuff[2]),toughness:scaled(countBuff[3]),keywords}],target?[target]:[]);}}
  const forcedKeyword=/^(.+? gains? .+?) until end of turn and must be blocked this turn if able\.$/i.exec(duration);
  if(forcedKeyword){const parsed=h.effect(card,forcedKeyword[1]+' until end of turn.');if(parsed?.effects.length===1&&parsed.effects[0].action==='pump')return {...parsed,effects:[...parsed.effects,{action:'combat-restriction',target:parsed.effects[0].target,duration:'eot',restriction:{mustBeBlocked:true}}]};}

  const bouncePlayer=/^(return target .+? to its owner's hand)(?:\. Then |, then )that player (.+)\.$/i.exec(line);
  if(bouncePlayer){const first=h.effect(card,bouncePlayer[1]+'.'),tail=h.effect(card,'Target player '+bouncePlayer[2]+'.');
    if(first?.targets.length===1&&tail?.targets.length===1&&tail.targets[0].what==='player'&&!first.optional&&!tail.optional&&first.effects.length===1&&['bounce','return-to-hand'].includes(first.effects[0].action)){
      const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['who','target'].includes(key)&&value===0?{kind:'target-owner',index:0}:bind(value)])):node;
      return {...first,effects:[...first.effects,...tail.effects.map(bind)]};
    }
  }
  const capacity=/^(.+?) can block any number of creatures this turn\.$/i.exec(line);
  if(capacity){const target=h.target(capacity[1]),self=new RegExp('^'+selfPattern(card)+'$','i').test(capacity[1]);if(target?.zone==='battlefield'||self)return body([{action:'combat-restriction',target:target?0:'self',duration:'eot',restriction:{combatRule:{kind:'block-capacity',any:true}}}],target?[target]:[]);}
  const lure=/^all creatures able to block (.+?)(?: this turn do so| do so this turn)\.$/i.exec(line);
  if(lure){const target=h.target(lure[1]),self=new RegExp('^'+selfPattern(card)+'$','i').test(lure[1]);if(target?.zone==='battlefield'||self)return body([{action:'combat-restriction',target:target?0:'self',duration:'eot',restriction:{lure:true}}],target?[target]:[]);}

  const hand=/^you may put (?:a|an) (.+? card) from your hand onto the battlefield( tapped)?\.$/i.exec(line);
  if(hand){const filter=h.target('target '+hand[1]+' from your graveyard');if(filter?.zone==='graveyard')return body([{action:'zone-select',zone:'hand',who:'you',filter:{...filter,zone:'hand'},n:1,upTo:true,destination:'battlefield',tapped:!!hand[2]}]);}
  const sacrificed=/^((each player|each opponent|target player|target opponent|that player) sacrifices? .+? of their choice) and (loses? [^.]+ life)\.$/i.exec(line);
  if(sacrificed){const a=h.effect(card,sacrificed[1]+'.'),actor=sacrificed[2],b=h.effect(card,actor+' '+sacrificed[3]+'.');if(a&&b&&!a.optional&&!b.optional&&JSON.stringify(a.targets)===JSON.stringify(b.targets))return {...a,effects:[...a.effects,...b.effects]};}
  const sacrificeX=/^(each player|each opponent|target player|target opponent) sacrifices? X (creatures|artifacts|lands|enchantments|permanents) of their choice\.$/i.exec(line);
  if(sacrificeX){const actor=sacrificeX[1].toLowerCase(),filter=h.target('target '+singular(sacrificeX[2].toLowerCase())+' you control'),target=actor.startsWith('target')?h.target(actor):null;return body([{action:'choose-permanents',operation:'sacrifice',who:target?0:actor.replace(' ','-'),n:'X',filter}],target?[target]:[]);}

  const give=/^(Target player|Target opponent|That player) gains control of (target .+)\.$/i.exec(line);
  if(give){const target=h.target(give[2]);if(target?.zone==='battlefield'){const player=h.target(give[1].toLowerCase());return body([{action:'give-control-v9',who:player?0:'event-player',target:player?1:0}],player?[player,target]:[target]);}}
  const exchange=/^(?:you may )?exchange control of (.+)\.$/i.exec(line);
  if(exchange){
    const group=/^two target (.+)$/.exec(exchange[1]);
    if(group){const target=h.target('target '+singular(group[1]));if(target?.zone==='battlefield')return body([{action:'exchange-control-v9',target:0,group:true}],[{...target,min:2,max:2}],/^you may/i.test(line));}
    const pair=exchange[1].split(' and ');
    if(pair.length===2){const targets=[],refs=pair.map(text=>{if(new RegExp('^'+selfPattern(card)+'$','i').test(text))return 'self';const target=h.target(text);if(target?.zone!=='battlefield')return null;targets.push(target);return targets.length-1;});if(refs.every(ref=>ref!==null))return body([{action:'exchange-control-v9',target:refs[0],otherTarget:refs[1]}],targets,/^you may/i.test(line));}
  }
  if(line==='You gain shroud until end of turn.')return body([{action:'player-shroud-v9',who:'you'}]);
  if(/^recruit\.$/i.test(line))return body([{action:'recruit-v9',who:'you'}]);
  const text = line.trim();
  const source=selfPattern(card);
  const force=/^(.+?) (must be blocked|attacks?|blocks?) this turn if able\.$/i.exec(text);
  if(force){
    const subject=force[1],target=h.target(subject.toLowerCase()),self=new RegExp('^'+source+'$','i').test(subject),event=/^(?:it|that creature)$/i.test(subject);
    const restriction=force[2].toLowerCase()==='must be blocked'?{mustBeBlocked:true}:force[2].toLowerCase().startsWith('attack')?{mustAttack:true}:{combatRule:{kind:'required-block'}};
    if(target?.zone==='battlefield'||self||event)return body([{action:'combat-restriction',target:target?0:self?'self':'event-card',duration:'eot',restriction}],target?[target]:[]);
    const group=subject.replace(/^(?:each|all) /i,'');
    const filter=h.target('target '+singular(group).replace(/your opponents control/,'an opponent controls'));
    if(filter?.zone==='battlefield'&&/\bcreatures?\b/.test(group))return body([{action:'combat-restriction',filters:[filter],duration:'eot',restriction}]);
  }
  const forcedBuff=/^(.+? gets? [+-][0-9]+\/[+-][0-9]+(?: and gains? [^.]+)?) until end of turn and (must be blocked|attacks?|blocks?) this turn if able\.$/i.exec(text);
  if(forcedBuff){const base=h.effect(card,forcedBuff[1]+' until end of turn.');if(base&&!base.optional&&base.effects.length===1&&base.effects[0].action==='pump'){const tail=h.effect(card,'Target creature '+forcedBuff[2]+' this turn if able.');if(tail)return {...base,effects:[...base.effects,{...tail.effects[0],target:base.effects[0].target}]};}}
  const endure=new RegExp('^'+source+' endures ([1-9][0-9]*)\\.$','i').exec(text);
  if(endure)return body([{action:'endure-v9',target:'self',n:Number(endure[1])}]);
  if(/^you win the game\.$/i.test(text))return body([{action:'win-game-v9'}]);
  const halfScalar=/^(you|target player|target opponent|that player|each player|each opponent) (loses?|gains?) half (?:their|your) life, rounded (up|down)\.$/i.exec(text);
  if(halfScalar){
    const actor=halfScalar[1].toLowerCase(),action=halfScalar[2].toLowerCase().startsWith('lose')?'lose-life':'gain-life';
    const n={kind:'fraction-v9',value:{kind:'target-count',target:0,count:{kind:'life-total'}},denominator:2,round:halfScalar[3]},effect={action,who:0,n};
    if(actor.startsWith('target '))return body([effect],[h.target(actor)]);
    return body([{action:'player-sequence-v9',who:actor==='that player'?'event-player':actor.replace(' ','-'),effects:[effect]}]);
  }
  const counter=new RegExp('^(put|remove) ('+NUM+'|X) ([+-][0-9]+/[+-][0-9]+|[a-z]+) counters? (on|from) (.+)\\.$','i').exec(text);
  if(counter&&(counter[1].toLowerCase()==='put')===(counter[4].toLowerCase()==='on')){
    const target=h.target(counter[5]),self=new RegExp('^'+source+'$','i').test(counter[5]);
    if(target?.zone==='battlefield'||self)return body([{action:counter[1].toLowerCase()==='put'?'counter':'remove-counter',target:target?0:'self',counter:counter[3],n:counter[2]==='X'?'X':amount(counter[2])}],target?[target]:[]);
  }
  const tokenCounter=/^(Create .+? creature token[^.]*\.) (Put .+ counters on )it\.$/.exec(text);
  if(tokenCounter){
    const created=h.effect(card,tokenCounter[1]),counters=h.effect(card,tokenCounter[2]+'this creature.');
    if(created&&!created.optional&&!created.targets.length&&created.effects.length===1&&created.effects[0].n===1&&['token-inline','token-key'].includes(created.effects[0].action)&&counters&&!counters.optional&&!counters.targets.length&&counters.effects.every(effect=>effect.action==='counter'&&effect.target==='self'))return body([...created.effects,...counters.effects.map(effect=>({...effect,target:'created-tokens'}))]);
  }
  const half=/^(target player|target opponent) mills half their library, rounded (down|up)\.$/i.exec(text);
  if(half)return body([{action:'mill',who:0,n:{kind:'fraction-v9',value:{kind:'target-count',target:0,count:{kind:'count',zone:'library',what:'card',controller:'you'}},denominator:2,round:half[2]}}],[h.target(half[1].toLowerCase())]);
  const repeatedDamage=new RegExp('^'+source+' deals ('+NUM+') damage to each of (two|one or two) targets\\.$','i').exec(text);
  if(repeatedDamage)return body([{action:'damage',target:0,n:amount(repeatedDamage[1])}],[{what:'any',zone:'battlefield',min:repeatedDamage[2]==='two'?2:1,max:2}]);
  const pairMove=/^(destroy|exile|tap|untap|return) (.+?) and (target .+?)( to their owners' hands)?\.$/i.exec(text);
  if(pairMove){
    const verb=pairMove[1].toLowerCase(),tail=verb==='return'?" to its owner's hand.":'.';
    if((verb==='return')===!!pairMove[4]){
      const a=h.effect(card,verb+' '+pairMove[2]+tail),b=h.effect(card,verb+' '+pairMove[3]+tail);
      if(a&&b&&!a.optional&&!b.optional&&a.effects.length===1&&b.effects.length===1&&['destroy','exile','tap','untap','return-to-hand','exile-source'].includes(a.effects[0].action)&&['destroy','exile','tap','untap','return-to-hand'].includes(b.effects[0].action))return body([...a.effects,...shiftTargets(b.effects,a.targets.length)],[...a.targets,...b.targets]);
    }
  }
  const untapGroup=/^(.+ until end of turn\.) Untap them\.$/.exec(text);
  if(untapGroup){const first=h.effect(card,untapGroup[1]);if(first&&!first.optional&&!first.targets.length&&first.effects.length===1){const effect=first.effects[0];if(effect.action==='pump-group'&&['your-creatures','all-creatures'].includes(effect.who))return body([effect,{action:'battlefield-group',operation:'untap',filters:[h.target(effect.who==='your-creatures'?'target creature you control':'target creature')]}]);if(effect.action==='battlefield-group'&&effect.operation==='pump')return body([{action:'group-sequence',filters:effect.filters,effects:[{action:'pump',target:'affected-group',power:effect.power,toughness:effect.toughness,keywords:effect.keywords||[]},{action:'untap',target:'affected-group'}]}]);}}
  const sacrificeChoice=/^((?:each opponent|each player|target player|target opponent) sacrifices? .+?) of their choice (with .+)\.$/i.exec(text);
  if(sacrificeChoice)return h.effect(card,sacrificeChoice[1]+' '+sacrificeChoice[2]+' of their choice.');
  const counted=/^(.+?) for each ([^.]+)\.$/i.exec(text);
  if(counted){
    const count=h.count(counted[2]),parsed=count&&h.effect(card,counted[1]+'.');
    if(parsed&&!parsed.optional&&parsed.effects.length===1){
      const effect=parsed.effects[0];
      if(['draw','discard','gain-life','lose-life','mill','counter','token-key','token-inline'].includes(effect.action)&&typeof effect.n==='number')return {...parsed,effects:[{...effect,n:{kind:'sum',values:Array.from({length:effect.n},()=>structuredClone(count))}}]};
      if(effect.action==='damage'&&typeof effect.n==='number')return {...parsed,effects:[{...effect,n:{kind:'sum',values:Array.from({length:effect.n},()=>structuredClone(count))}}]};
    }
  }
  const rearDamage=new RegExp('^('+source+'|it) deals damage to (.+?) equal to ([^.]+)\\.$','i').exec(text);
  if(rearDamage){
    const value=h.value(rearDamage[3]),parsed=value&&h.effect(card,rearDamage[1]+' deals 1 damage to '+rearDamage[2]+'.');
    if(parsed&&parsed.effects.every(effect=>effect.action==='damage'||effect.action==='battlefield-group'&&effect.operation==='damage'))return {...parsed,effects:parsed.effects.map(effect=>({...effect,n:value}))};
  }
  const numberCounters=/^put a number of (\+1\/\+1|-1\/-1|[a-z]+) counters on (.+?) equal to ([^.]+)\.$/i.exec(text);
  if(numberCounters)return h.effect(card,'Put X '+numberCounters[1]+' counters on '+numberCounters[2]+', where X is '+numberCounters[3]+'.');
  const optionalPlayer=/^you may have ((?:target player|target opponent|each opponent|each player) (?:draw|gain|lose|discard|mill) .+)\.$/i.exec(text);
  if(optionalPlayer){const words=optionalPlayer[1].split(' '),at=words[0].toLowerCase()==='target'||words[0].toLowerCase()==='each'?2:1;words[at]+='s';const parsed=h.effect(card,words.join(' ')+'.');if(parsed&&!parsed.optional)return {...parsed,optional:true};}
  const pair=new RegExp('^you and (target opponent|target player|that player) each draw ('+NUM+'|that many) cards?\\.$','i').exec(text);
  if(pair){const target=pair[1].toLowerCase().startsWith('target ')?h.target(pair[1].toLowerCase()):null,n=pair[2]==='that many'?{kind:'event-amount'}:amount(pair[2]);return body([{action:'draw',who:'you',n},{action:'draw',who:target?0:'event-player',n}],target?[target]:[]);}
  const exileHand=new RegExp('^(target opponent|target player|each opponent|each player) exiles ('+NUM+') cards? from their hand\\.$','i').exec(text);
  if(exileHand){const actor=exileHand[1].toLowerCase(),target=actor.startsWith('target ')?h.target(actor):null;return body([{action:'zone-select',who:target?0:actor.replace(' ','-'),zone:'hand',filter:{what:'card',zone:'hand',controller:'you',min:1},n:amount(exileHand[2]),destination:'exile'}],target?[target]:[]);}
  const setLife=/^(target player's|target opponent's|your) life total becomes ([0-9]+)\.$/i.exec(text);
  if(setLife){const target=setLife[1].toLowerCase()==='your'?null:h.target(setLife[1].slice(0,-2).toLowerCase());return body([{action:'set-life-v9',who:target?0:'you',n:Number(setLife[2])}],target?[target]:[]);}
  const defender=/^(defending player|that opponent|that creature's controller|that permanent's controller) (may )?(.+)\.$/i.exec(text);
  if(defender){
    let clause=defender[3];if(defender[2])clause=clause.replace(/^(draw|gain|lose|discard|mill) /,'$1s ');
    const parsed=h.effect(card,'Target player '+clause+'.');
    if(parsed&&!parsed.optional&&parsed.targets.length===1&&parsed.targets[0].what==='player'&&parsed.effects.every(effect=>['draw','gain-life','lose-life','discard','discard-hand','mill'].includes(effect.action)&&effect.who===0)){
      const who=defender[1].toLowerCase()==='defending player'?'combat-defender-v9':defender[1].toLowerCase()==='that opponent'?'event-player':'event-card-controller';
      const bind=node=>Array.isArray(node)?node.map(bind):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key,['target','who'].includes(key)&&value===0?who:bind(value)])):node;
      return {...parsed,targets:[],optional:!!defender[2],effects:parsed.effects.map(bind)};
    }
  }
  const extraDraw=new RegExp('^(that player draws) ('+NUM+') additional cards?\\.$','i').exec(text);
  if(extraDraw)return h.effect(card,extraDraw[1]+' '+extraDraw[2]+' cards.');
  const discardRandom=new RegExp('^(that player|defending player) discards? ('+NUM+') cards? at random\\.$','i').exec(text);
  if(discardRandom)return body([{action:'discard',who:discardRandom[1].toLowerCase()==='that player'?'event-player':'combat-defender-v9',n:amount(discardRandom[2]),random:true}]);
  const attackDamage=new RegExp('^(?:'+source+'|it) deals ('+NUM+') damage to defending player\\.$','i').exec(text);
  if(attackDamage)return body([{action:'damage',target:'combat-defender-v9',n:amount(attackDamage[1])}]);
  const extraTurns=new RegExp('^(target player|target opponent|you) takes? ('+NUM+') extra turns after this one\\.$','i').exec(text);
  if(extraTurns){const target=extraTurns[1].toLowerCase()==='you'?null:h.target(extraTurns[1].toLowerCase());return body([{action:'extra-turn-v8',target:target?0:'you',n:amount(extraTurns[2])}],target?[target]:[]);}
  const sacrificeAll=/^sacrifice all (.+?)(?: you control)?\.$/i.exec(text);
  if(sacrificeAll){const filter=h.target('target '+singular(sacrificeAll[1].replace(/ you control$/,''))+' you control');if(filter?.zone==='battlefield')return body([{action:'choose-permanents',operation:'sacrifice',who:'you',n:'all',filter}]);}
  const directAttach=/^attach (this Equipment|target Equipment|target Aura you control) to (target .+)\.$/i.exec(text);
  if(directAttach){const host=h.target(directAttach[2]),attachment=directAttach[1]==='this Equipment'?null:h.target(directAttach[1]);if(host?.zone==='battlefield'&&host.what==='creature'&&(attachment||/\bEquipment\b/.test(card.type_line)))return body([{action:'attach-v9',attachment:attachment?0:'self',target:attachment?1:0}],attachment?[attachment,host]:[host]);}
  const below=/^put (target .+?) into its owner's library second from the top\.$/i.exec(text);
  if(below){const target=h.target(below[1]);if(target?.zone==='battlefield')return body([{action:'move-to-library',target:0,depthV9:1}],[target]);}
  const selfPronoun=/^(?:he|she) (.+)$/i.exec(text);
  if(selfPronoun&&/\bLegendary\b/.test(card.type_line))return h.effect(card,'This permanent '+selfPronoun[1]);
  const selfHis=/^(?:his|her) (power|toughness) (.+)$/i.exec(text);
  if(selfHis&&/\bLegendary\b/.test(card.type_line))return h.effect(card,"This permanent's "+selfHis[1]+' '+selfHis[2]);
  let discovery=/^discover ([0-9]+)\.$/i.exec(text);
  if(discovery)return body([{action:'discover-v9',n:Number(discovery[1])}]);
  const shufflePlayer=/^(target player|target opponent) shuffles their library\.$/i.exec(text);
  if(shufflePlayer)return body([{action:'shuffle-library-v9',who:0}],[h.target(shufflePlayer[1].toLowerCase())]);
  const shuffleOwned=/^shuffle (.+?) into your library\.$/i.exec(text);
  if(shuffleOwned){const target=h.target(shuffleOwned[1]);if(target?.zone==='graveyard'&&target.controller==='you')return body([{action:'move-to-library',target:0,shuffleAfter:true,shuffleControllerV9:true}],[target]);}
  const chosenShuffle=/^Choose (target .+?)\. Its owner shuffles it into their library\.$/.exec(text);
  if(chosenShuffle){const target=h.target(chosenShuffle[1]);if(target?.zone==='battlefield')return body([{action:'move-to-library',target:0,shuffleAfter:true}],[target]);}
  const colorChange=/^(.+?) becomes? (white|blue|black|red|green|colorless)( until end of turn)?\.$/i.exec(text);
  if(colorChange){
    const target=h.target(colorChange[1]),self=new RegExp('^'+selfPattern(card)+'$','i').test(colorChange[1]),event=/^that (?:creature|permanent)$/i.test(colorChange[1]);
    if(target?.zone==='battlefield'||self||event)return body([{action:'animate',target:target?0:event?'event-card':'self',types:[],subtypes:[],keywords:[],colors:colorChange[2].toLowerCase()==='colorless'?[]:[{white:'W',blue:'U',black:'B',red:'R',green:'G'}[colorChange[2].toLowerCase()]],retainTypes:true,retainAllSubtypes:true,temporary:!!colorChange[3]}],target?[target]:[]);
  }
  let simple=/^(target .+?) (connives|explores)\.$/i.exec(text);
  if(simple){const target=h.target(simple[1]);if(target?.what==='creature'&&target.zone==='battlefield')return body([{action:simple[2].toLowerCase()==='connives'?'connive':'explore',target:0}],[target]);}
  simple=/^(you may )?attach this Equipment to (?:it|that creature)\.$/i.exec(text);
  if(simple&&/\bEquipment\b/.test(card.type_line))return body([{action:'attach-source',target:'event-card'}],[],!!simple[1]);
  simple=/^incubate (X)\.$/i.exec(text);
  if(simple)return body([{action:'token-key',who:'you',n:1,tokenKey:'incubator'},{action:'counter',target:'created-tokens',counter:'+1/+1',n:'X'}]);
  simple=/^(?:untap|tap|destroy|exile) each (.+)\.$/i.exec(text);
  if(simple&&!/\btarget\b/.test(simple[1]))return h.effect(card,text.replace(/ each /i,' all '));
  simple=new RegExp('^create ('+NUM+') tapped (Treasure|Clue|Food|Gold|Blood|Powerstone|Map) tokens?\\.$','i').exec(text);
  if(simple){const parsed=h.effect(card,text.replace(' tapped ', ' '));if(parsed&&parsed.effects.every(effect=>['token-key','token-inline'].includes(effect.action)))return {...parsed,effects:parsed.effects.map(effect=>({...effect,tapped:true}))};}
  const variable=/^(.+?), where X is ([^.]+)\.$/i.exec(text);
  if(variable&&/\bX\b/.test(variable[1])){
    const parsed=h.effect(card,variable[1]+'.');
    if(parsed&&!parsed.optional){
      const expression=variable[2];let value=null;
      const stat=/^(its|that (?:creature|permanent|spell)'s) (power|toughness|mana value)$/.exec(expression);
      const target=parsed.targets[0];
      const statTarget=stat&&(stat[1]==='its'?target&&!['player','opponent','any'].includes(target.what):stat[1]==="that spell's"?target?.zone==='stack':target&&target.zone!=='stack'&&!['player','opponent','any'].includes(target.what));
      if(stat&&parsed.targets.length<=1){
        const field=stat[2]==='mana value'?'mv':stat[2];
        if(parsed.targets.length===1&&statTarget)value={kind:'target-stat',target:0,stat:field};
        else if(stat[1]==='its')value={kind:'source-stat',stat:field};
      }
      if(/^the number of colors of mana spent to cast (?:this spell|it)$/.test(expression))value={kind:'paid-colors'};
      if(!value&&!stat&&!/\b(?:its|that creature|that permanent|that spell)\b/.test(expression)){
        value=h.value(expression);
        if(value?.kind==='target-count'&&value.target==='event-player'&&parsed.targets.length===1&&['player','opponent'].includes(target?.what))value={...value,target:0};
      }
      const sum=/^(.+?) plus (the number of .+)$/.exec(expression);
      if(sum){const first=h.value(sum[1]),second=h.value(sum[2]);if(first!==null&&second!==null)value={kind:'sum',values:[first,second]};}
      if(value){
        const replace=node=>node==='X'?structuredClone(value):node==='-X'?{kind:'sum',values:[structuredClone(value)],multiply:-1}:Array.isArray(node)?node.map(replace):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,item])=>[key,replace(item)])):node;
        return {...parsed,effects:parsed.effects.map(replace),targets:parsed.targets.map(replace)};
      }
    }
  }
  const declaration=/^choose ((?:another |up to one |(?:up to )?[0-9]+ |any number of )?target .+)\.$/i.exec(text);
  if(declaration){const target=h.target(declaration[1]);if(target)return body([{action:'target-declaration-v9',target:0}],[target]);}
  let match = new RegExp('^(each player|each opponent) discards their hand\\.$', 'i').exec(text);
  if (match) return body([{action:'discard-hand', who:match[1].toLowerCase().replace(' ', '-')}]);
  match = new RegExp('^amass Goblins (' + NUM + ')\\.$', 'i').exec(text);
  if (match) return body([{action:'amass', n:amount(match[1]), subtype:'Goblin'}]);
  match = /^(?:you )?(take the initiative|venture into the dungeon)\.$/i.exec(text);
  if (match) return body([{action:match[1].toLowerCase()==='take the initiative'?'initiative-v9':'venture-v9'}]);
  match = /^(you may )?return another (.+?) you control to its owner's hand\.$/i.exec(text);
  if(match&&!/\btarget\b/.test(match[2])){
    const filter=h.target('another target '+match[2]+' you control');
    if(filter?.zone==='battlefield')return body([{action:'choose-permanents',operation:'bounce',who:'you',n:1,filter}],[],!!match[1]);
  }
  match = new RegExp('^(you may have )?('+selfPattern(card)+'|it) fight (target .+)\\.$','i').exec(text);
  if(match){const target=h.target(match[3]);if(target?.what==='creature'&&target.zone==='battlefield')return body([{action:'fight',target:'self',otherTarget:0}],[target],!!match[1]);}
  match = /^put (.+?) on (top|the bottom) of their owners' libraries\.$/i.exec(text);
  if(match){
    const target=h.target(match[1]);
    if(target)return body([{action:'move-to-library',target:0,bottom:match[2]==='the bottom',ownerOrders:true}],[target]);
    if(/^(?:all|each) /.test(match[1])){
      const filter=h.target('target '+singular(match[1].replace(/^(?:all|each) /,'')));
      if(filter?.zone==='battlefield')return body([{action:'move-to-library',filters:[filter],bottom:match[2]==='the bottom',ownerOrders:true}]);
    }
  }
  match=/^shuffle (.+?) into (?:its owner's|their owners') librar(?:y|ies)\.$/i.exec(text);
  if(match){
    if (/\b(?:Instant|Sorcery)\b/.test(card.type_line) && match[1].toLowerCase()===card.name.toLowerCase())return body([{action:'shuffle-source-v9'}]);
    const target=h.target(match[1]);
    if(target)return body([{action:'move-to-library',target:0,shuffleAfter:true}],[target]);
    if(new RegExp('^(?:'+selfPattern(card)+'|it)$','i').test(match[1]))return body([{action:'move-to-library',target:'self',shuffleAfter:true}]);
  }
  // An initial target declaration and the later explicit target refer to one
  // announced group, including inside a block that counts cards just milled.
  match=/^Choose (target creature)\. (Mill .+?, then put .+? on )that creature( for each creature card milled this way\.)$/.exec(text);
  if(match)return h.effect(card,match[2]+match[1]+match[3]);
  match = new RegExp('^'+selfPattern(card)+' deals ('+NUM+') damage to (?:it|that creature)\\.$','i').exec(text);
  if(match)return body([{action:'damage',target:'event-card',n:amount(match[1])}]);
  match=/^(.+?) loses? (.+?) until end of turn\.$/i.exec(text);
  if(match){
    const keywords=h.keywordList(match[2]);
    const target=h.target(match[1]);
    const self=new RegExp('^(?:'+selfPattern(card)+'|it)$','i').test(match[1]);
    if(keywords?.length&&(target?.zone==='battlefield'||self))return body([{action:'remove-keywords-v9',target:target?0:'self',keywords}],target?[target]:[]);
  }
  // Coordinated verbs retain a single player target and their printed order.
  // Restrict this grammar to independently complete scalar player effects.
  match=/^(target player|target opponent|each player|each opponent|you|that player) (.+?) and ((?:draws?|gains?|loses?|discards?|mills?|reveals?) .+)\.$/i.exec(text);
  if(match){
    const actor=match[1].toLowerCase();
    const parse=clause=>h.effect(card,'Target player '+clause+'.');
    const first=parse(match[2]),second=parse(match[3]);
    const scalar=parsed=>parsed&&!parsed.optional&&parsed.targets.length===1&&parsed.targets[0].what==='player'&&parsed.effects.every(effect=>['draw','gain-life','lose-life','mill','discard','discard-hand','reveal-hand'].includes(effect.action)&&effect.who===0);
    if(scalar(first)&&scalar(second)){
      const effects=[...first.effects,...second.effects];
      if(actor.startsWith('target '))return body(effects,[h.target(actor)]);
      const who=actor==='that player'?'event-player':actor.replace(' ','-');
      return body([{action:'player-sequence-v9',who,effects}]);
    }
  }
  match=/^(.+?) gets ([+-][0-9]+)\/([+-][0-9]+) and loses (.+?) until end of turn\.$/i.exec(text);
  if(match){
    const target=h.target(match[1]),self=new RegExp('^(?:'+selfPattern(card)+'|it)$','i').test(match[1]),keywords=h.keywordList(match[4]);
    if(keywords?.length&&(target?.zone==='battlefield'||self))return body([{action:'pump',target:target?0:'self',power:Number(match[2]),toughness:Number(match[3]),keywords:[]},{action:'remove-keywords-v9',target:target?0:'self',keywords}],target?[target]:[]);
  }
  let normalized = line
    .replace(/ and you (gain [^.]+ life|draw [^.]+ cards?)\./g, '. You $1.')
    .replace(/, then you (gain [^.]+ life|draw [^.]+ cards?)\./g, '. You $1.')
    .replace(/, then (draw [^.]+ cards?)\./gi, (_, value) => '. ' + value[0].toUpperCase() + value.slice(1) + '.')
    .replace(/ and (scry [^.]+)\./g, (_, value) => '. ' + value[0].toUpperCase() + value.slice(1) + '.')
    .replace(/^they (gain|lose|draw|discard|mill) /i, (_, verb) => 'That player ' + verb.toLowerCase() + 's ');
  if (normalized !== line) return h.effect(card, normalized);
  return null;
}
