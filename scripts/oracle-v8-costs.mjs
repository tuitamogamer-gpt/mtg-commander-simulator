// Cost modifiers share the engine's total-cost calculation. Every adjective
// remains an explicit predicate; no unrecognized suffix can change a price.
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';
import {extensionCost as counterCost} from './oracle-v8-counter-costs.mjs';
const COLORS={white:'W',blue:'U',black:'B',red:'R',green:'G'};
const SPELL_FILTER={what:'card',zone:'battlefield',controller:'any',min:1};

function spellFilter(noun,h){
  noun=noun.trim();
  if(!noun)return {...SPELL_FILTER};
  if(ORACLE_SUBTYPES.has(noun))return {...SPELL_FILTER,subtype:noun};
  if(noun.toLowerCase()==='historic')return {...SPELL_FILTER,alternatives:[{...SPELL_FILTER,what:'artifact'},{...SPELL_FILTER,legendary:true},{...SPELL_FILTER,subtype:'Saga'}]};
  const alternatives=noun.split(/ and | or /);
  if(alternatives.length>1){const filters=alternatives.map(part=>spellFilter(part,h));return filters.every(Boolean)?{...SPELL_FILTER,alternatives:filters}:null;}
  const color=COLORS[noun.toLowerCase()];
  if(color)return {...SPELL_FILTER,color:noun.toLowerCase()};
  if(['colorless','multicolored','monocolored'].includes(noun.toLowerCase()))return {...SPELL_FILTER,color:noun.toLowerCase()};
  if(/^non(?:artifact|creature|enchantment|land)$/.test(noun.toLowerCase()))return {...SPELL_FILTER,notType:noun.slice(3,4).toUpperCase()+noun.slice(4).toLowerCase()};
  const words=noun.replace(/^(Creature|Artifact|Enchantment|Instant|Sorcery|White|Blue|Black|Red|Green)\b/,word=>word.toLowerCase());
  const result=h.target('target '+words);
  return result?.zone==='battlefield'?result:null;
}

// These are equivalent printed spellings of existing activation primitives.
// Normalize only complete cost atoms; a card name in a named-card predicate
// must never become a reference to the source of the ability.
export function extensionCost(text,h={},card=null){
  const counters=counterCost(text,h,card);if(counters)return counters;
  if(typeof h.priorCost!=='function')return null;
  let normalized=String(text),otherSacrifice=false;
  if(card?.name){
    const names=[...new Set([card.name,card.name.split(/,| the /)[0]])].sort((a,b)=>b.length-a.length);
    for(const name of names){
      const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      normalized=normalized.replace(new RegExp('(^|, )Sacrifice '+escaped+'(?=,|$)','g'),'$1Sacrifice this permanent');
      normalized=normalized.replace(new RegExp('(^|, )Exile '+escaped+'(?=,|$)','g'),'$1Exile this permanent');
      normalized=normalized.replace(new RegExp("(^|, )Return "+escaped+" to its owner's hand(?=,|$)",'g'),"$1Return this permanent to its owner's hand");
    }
  }
  const fixed='(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[1-9][0-9]*)';
  normalized=normalized.replace(new RegExp('(^|, )Exile ('+fixed+') cards from your graveyard(?=,|$)','g'),'$1Exile $2 card from your graveyard');
  normalized=normalized.replace(/(^|, )Tap another untapped (?=[^,]+ you control(?:,|$))/g,'$1Tap one other untapped ');
  normalized=normalized.replace(new RegExp('(^|, )Sacrifice ('+fixed+') other (?=[^,]+(?:,|$))','g'),(_,lead,n)=>{otherSacrifice=true;return lead+'Sacrifice '+n+' ';});
  if(normalized===text)return null;
  const seen=new Set();
  for(const part of normalized.split(/,\s*/)){
    const key=part==='{T}'?'tapSymbol':part.startsWith('{')?'mana':part.split(' ')[0].toLowerCase();
    if(seen.has(key))return null;
    seen.add(key);
  }
  const parsed=h.priorCost(normalized);
  if(!parsed)return null;
  for(const field of ['discard','exileFromGY','sacN','tapN'])if(parsed[field]!==undefined&&
    (!Number.isSafeInteger(parsed[field])||parsed[field]<1))return null;
  if(otherSacrifice&&!parsed.sacFilter&&!parsed.sacWhat)return null;
  return {...parsed,...(otherSacrifice?{sacOther:true}:{})};
}

export function modifierOperation(card,line,h){
  let text=line,condition;
  if(card.name){const escaped=[...new Set([card.name,card.name.split(/,| the /)[0]])].map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');text=text.replace(new RegExp('((?:\\+1/\\+1|-1/-1|[a-z]+) counters? on )(?:'+escaped+')(?=[.,]|$)','g'),'$1this permanent');}
  const during=/^During (your turn|turns other than yours|your end step), (.+)$/.exec(text);
  if(during){condition=during[1]==='your turn'?{kind:'your-turn'}:during[1]==='turns other than yours'?{kind:'not-your-turn'}:{kind:'your-phase',phase:'end'};text=during[2][0].toUpperCase()+during[2].slice(1);}
  const trailing=/^(This spell costs .+?) during (your turn|your end step)\.$/.exec(text);
  if(trailing){condition=trailing[2]==='your turn'?{kind:'your-turn'}:{kind:'your-phase',phase:'end'};text=trailing[1]+'.';}
  const leading=/^If (.+?), this spell costs (.+)\.$/.exec(text);
  if(leading){const parsed=h.condition(leading[1]);if(!parsed)return null;condition=parsed;text='This spell costs '+leading[2]+'.';}
  const match=/^(.+?) costs? ((?:\{(?:\d+|X|[WUBRGC])\})+) (less|more) to cast(?: (for each|if) (.+?))?(?:, where X is (.+))?\.$/.exec(text);
  if(!match)return null;
  const [_,subject,mana,direction,clause,quantity,definedX]=match;
  if(direction==='less'&&/\{[WUBRGC]\}/.test(mana))return null; // Hybrid choice precedes colored reduction.
  let multiplier;
  if(definedX){if(mana!=='{X}')return null;multiplier=h.value(definedX);if(!multiplier)return null;}
  if(mana.includes('{X}')&&!definedX)return null;
  if(clause==='for each'){if(multiplier)return null;multiplier=h.count(quantity);if(!multiplier)return null;}
  if(clause==='if'){const next=h.condition(quantity);if(!next)return null;condition=condition?{kind:'all',conditions:[condition,next]}:next;}
  // Amount expressions must be live state with a well-defined controller,
  // never a paid cost, an unrelated event, or an unresolved chosen X.
  if(multiplier&&!['count','max-stat','devotion','party','turn-count','died-count','source-counters','life-total','sum','creature-total-power'].includes(multiplier.kind))return null;
  const generic=[...mana.matchAll(/\{(\d+)\}/g)].reduce((sum,row)=>sum+Number(row[1]),0)+(definedX?1:0);
  const colored=[...mana.matchAll(/\{([WUBRGC])\}/g)].map(row=>row[1]);
  const operation={kind:'cost-modifier',amount:generic*(direction==='less'?-1:1),...(colored.length?{coloredIncrease:colored}:{}),...(condition?{condition}:{}),...(multiplier?{multiplier}:{}),contract:'generic-cost-modification'};
  if(subject==='This spell')return {...operation,self:true};
  let phrase=subject.replace(/^Each /i,''),controller='all';
  const caster=/ (you cast|your opponents cast)\b/.exec(phrase);
  if(caster){controller=caster[1]==='you cast'?'you':'opponents';phrase=phrase.replace(caster[0],'');}
  const from=/ from (your graveyard|exile|anywhere other than your hand)$/.exec(phrase);
  if(from){if(controller!=='you')return null;operation.from=from[1]==='your graveyard'?'graveyard':from[1]==='exile'?'exile':'not-hand';phrase=phrase.slice(0,from.index);}
  const threshold=/ with mana value (\d+) or (greater|less)$/.exec(phrase);
  if(threshold)phrase=phrase.slice(0,threshold.index);
  const keyword=/ with (flying|flash)$/.exec(phrase);
  if(keyword)phrase=phrase.slice(0,keyword.index);
  const nouns=phrase.split(/ spells? and /i).map(part=>part.replace(/ spells?$/i,'').replace(/^spells?$/i,''));
  if(!/\bspells?\b/i.test(phrase))return null;
  const filters=nouns.map(noun=>spellFilter(noun,h));if(!filters.every(Boolean))return null;
  const target=filters.length===1?filters[0]:{...SPELL_FILTER,alternatives:filters};
  if(threshold)Object.assign(target,{stat:'mv',comparison:threshold[2]==='greater'?'greater':'less',threshold:Number(threshold[1])});
  if(keyword)target.withKeyword=keyword[1];
  return {...operation,target,controller};
}
