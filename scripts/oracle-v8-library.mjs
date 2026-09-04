// Closed top-library selection grammar. All choices, destinations and filters
// are explicit data; unresolved follow-ups keep the entire clause deferred.
import {extensionValue} from './oracle-v8-core.mjs';
const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+|X)';
const values = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20};
const number = text => text.toUpperCase() === 'X' ? 'X' : values[text.toLowerCase()] ?? Number(text);
const QUANTITY = '(?:all|any number of|up to ' + NUM + '|' + NUM + ')';
const DESTINATION = '(?:into your hand|into your graveyard|onto the battlefield(?: tapped)?|on top of your library(?: in any order)?|on the bottom of your library(?: in (?:any|a random) order)?)';
const SEARCH_QUANTITY = '(?:any number of|up to ' + NUM + '|' + NUM + ')';

function quantity(text, optional = false) {
  const all = /^(?:all|any number of)$/i.test(text);
  const max = all ? 'all' : number(text.replace(/^up to /i, ''));
  return {max, required: !optional && !/^up to |^any number of$/i.test(text), ...(/^all$/i.test(text) && optional ? {allOrNone: true} : {})};
}
function destination(text) {
  text = text.toLowerCase();
  return {destination: text.includes('battlefield') ? 'battlefield' : text.includes('graveyard') ? 'graveyard'
    : text.includes('hand') ? 'hand' : text.includes('bottom') ? 'bottom' : 'top', ...(text.endsWith(' tapped') ? {tapped: true} : {}),
    ...(text.endsWith('a random order') ? {random: true} : {})};
}
function filterFor(text, helpers) {
  const original=text.replace(/ and\/or /g,' or ').replace(/\bcards\b/g,'card').trim();
  // Keep the printed position of "card" before qualifications. Moving it to
  // the end turns "creature card with mana value 3 or less" into a different,
  // unrecognizable noun phrase.
  const direct=original!=='card'&&/\bcard\b/.test(original)&&helpers.target?.('target '+original+' from your graveyard');
  if(direct?.zone==='graveyard')return {filter:direct};
  const stat=/^(.+?) cards? with (power|toughness|power or toughness) (\d+) or (less|greater)$/.exec(original);
  if(stat){
    const base=helpers.target?.('target '+stat[1]+' card from your graveyard');if(!base||base.zone!=='graveyard')return null;
    const rules=stat[2].split(' or ').map(name=>({...base,stat:name,threshold:Number(stat[3]),comparison:stat[4]}));
    return {filter:rules.length===1?rules[0]:{what:'card',zone:'graveyard',controller:'you',min:1,alternatives:rules}};
  }
  if(original==='historic card')return {filter:{what:'card',zone:'graveyard',controller:'you',min:1,alternatives:[
    {what:'artifact',zone:'graveyard',controller:'you',min:1},
    {what:'card',zone:'graveyard',controller:'you',min:1,legendary:true},
    {what:'card',zone:'graveyard',controller:'you',min:1,subtype:'Saga'},
  ]}};
  if(original==='land card with a basic land type')return {filter:{what:'land',zone:'graveyard',controller:'you',min:1,alternatives:['Plains','Island','Swamp','Mountain','Forest'].map(subtype=>({what:'land',zone:'graveyard',controller:'you',min:1,subtype}))}};
  text = text.replace(/ and\/or /g, ' or ').replace(/\bcards?\b/g, '').trim()
    .replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers)\b/g, word => word.slice(0, -1));
  if (!text || /^(?:one of them|of them|of those cards)$/i.test(text)) return {};
  if (/^basic land$/i.test(text)) {
    const land = helpers.target?.('target land card from your graveyard');
    return land ? {filter: {...land, basic: true}} : null;
  }
  const filter = helpers.target?.('target ' + text + ' card from your graveyard') || helpers.target?.('target ' + text + ' from your graveyard');
  if (!filter || filter.zone !== 'graveyard') return null;
  return {filter};
}

function searchFilterFor(text, helpers) {
  const unrestricted = /^cards?$/i.test(text.trim());
  const parsed = filterFor(text, helpers);
  if (!parsed || !unrestricted && !parsed.filter) return null;
  return {unrestricted, ...(parsed.filter ? {filter: parsed.filter} : {})};
}

function searchQuantity(text) {
  const all = /^any number of$/i.test(text), upTo = all || /^up to /i.test(text);
  return {n: all ? 'all' : number(text.replace(/^up to /i, '')), upTo};
}

function searchPlacement(text) {
  const parsed = destination(text);
  if (!['hand', 'graveyard', 'battlefield'].includes(parsed.destination)) return null;
  return parsed;
}

function countFor(text, helpers) {
  return helpers.count?.(text.replace(/^the number of /i, '')) || extensionValue(text);
}

function partition(text) {
  const shuffle = /^(.*)(?:\. (?:Then )?| and |, then )shuffle(?: (?:the rest(?: of the revealed cards)?|all other cards revealed this way) into your library)?$/i.exec(text);
  if (shuffle) return {body: shuffle[1], rest: {destination: 'shuffle'}};
  const match = /^(.*?)(?:\. (?:Then )?Put | and (?:put )?|, then put )(?:the rest(?: of (?:the |those )?(?:revealed )?cards(?: revealed this way)?)?|the other(?: card)?|all other cards revealed this way|all (?:other )?cards revealed this way that (?:weren't|were not) put (?:onto the battlefield|into your hand)) (into your graveyard|into your hand|(?:back )?on top of your library(?: in any order)?|on the bottom(?: of your library)?(?: in (?:any|a random) order)?)$/i.exec(text);
  if (match) return {body: match[1], rest: {...destination(match[2]), random: /a random order$/i.test(match[2])},
    singularOther: /(?:\. (?:Then )?Put | and (?:put )?|, then put )the other(?: card)? /i.test(text)};
  const exile = /^(.*?)(?:\. Exile | and exile )all other cards revealed this way$/i.exec(text);
  if (exile) return {body: exile[1], rest: {destination: 'exile'}};
  return null;
}

function revealUntil(card, text, helpers, relation = null) {
  const actor = /^(?:(You may )?Reveal|(Target player|Target opponent|Each player|Each opponent|That player|Its controller|That creature's controller|Defending player) (may )?reveals?) cards from the top of (your|their|that player's) library until (?:you|they|that player) reveal /i.exec(text);
  if (!actor) return null;
  const head = new RegExp('^(' + NUM + ') (.+?)(?:, where X is (.+?))?(?:\\. |, then |, )(.+)$', 'i').exec(text.slice(actor[0].length));
  if (!head) return null;
  let filterText = head[2];
  if (relation?.kind === 'stat') {
    const relative = /^(.*?) with (greater|lesser) mana value$/i.exec(filterText);
    if (!relative || relative[2].toLowerCase() !== relation.comparison) return null;
    filterText = relative[1];
  } else if (relation?.kind === 'shares-card-type') {
    const shared = /^(.*?) that shares a card type with that permanent$/i.exec(filterText);
    if (!shared) return null;
    filterText = shared[1];
  } else if (relation) return null;
  let parsedFilter = filterFor(filterText, helpers);
  if (relation?.kind === 'shares-card-type' && !parsedFilter?.filter && /^card$/i.test(filterText)) {
    const cardFilter = helpers.target?.('target card from your graveyard');
    if (cardFilter?.zone === 'graveyard') parsedFilter = {filter: cardFilter};
  }
  if (!parsedFilter?.filter || !/\bcards?\b/.test(head[2])) return null;
  let n = number(head[1]);
  if (head[3]) {if (n !== 'X') return null; n = countFor(head[3], helpers); if (n === null || n === undefined) return null;}
  const name = actor[2]?.toLowerCase(), targeted = name?.startsWith('target '), optional = !!(actor[1] || actor[3]);
  const who = !name ? 'you' : targeted ? 0 : name === 'its controller' || name === "that creature's controller" ? 'event-card-controller'
    : name === 'that player' ? 'event-player' : name === 'defending player' ? 'defending-player' : name.replace(' ', '-');
  if (!name && actor[4] !== 'your' || name && actor[4] === 'your') return null;
  let body = head[4].replace(/^If you do, /i, '').replace(/^(?:That player|The player|They) puts? /i, 'Put ')
    .replace(/^puts? /i, 'Put ').replace(/, then puts? /g, ', then put ').replace(/ and puts? /g, ' and put ')
    .replace(/, then shuffles? /g, '. Then shuffle ')
    .replace(/\b(?:their|that player's) (library|hand|graveyard)\b/g, 'your $1');
  if (n === 1) body = body.replace(/^Put it /i, 'Put that card ');
  const result = (selections, rest) => ({targets: targeted ? [helpers.target(name)] : [], optional,
    effects: [{action: 'library-select-v8', until: {n, filter: parsedFilter.filter, ...(relation ? {relation} : {})}, who, chooser: 'owner', visibility: 'reveal', selections, rest}]});
  const all = /^(?:then )?put (?:all cards revealed this way|those cards|the revealed cards) (into your hand|into your graveyard|on the bottom of your library in (?:any|a random) order)$/i.exec(body);
  if (all) return result([], {...destination(all[1]), random: /a random order$/.test(all[1])});
  const parts = partition(body); if (!parts || parts.singularOther) return null;
  const picked = new RegExp('^(You may )?Put (that card|the (?:creature|land|artifact|enchantment|nonland) card|those (?:creature |land |artifact |enchantment |permanent )?cards|all .+? cards revealed this way) (' + DESTINATION + ')$', 'i').exec(parts.body);
  if (!picked || /^that card$|^the .+ card$/i.test(picked[2]) && n !== 1) return null;
  if (/^all /.test(picked[2])) {
    const chosen = filterFor(picked[2].slice(4).replace(/ revealed this way$/, ''), helpers);
    if (!chosen?.filter || JSON.stringify(chosen.filter) !== JSON.stringify(parsedFilter.filter)) return null;
  }
  return result([{filter: parsedFilter.filter, ...(relation ? {relation} : {}), max: 'all', required: !picked[1], ...(picked[1] ? {allOrNone: true} : {}),
    reveal: false, ...destination(picked[3])}], parts.rest);
}

function select(text, helpers) {
  let match;
  const make = (quantifier, predicate, dest, optional, reveal) => {
    const filter = filterFor(predicate, helpers);
    return filter ? {...filter, ...quantity(quantifier, optional), ...destination(dest), reveal: !!reveal} : null;
  };
  match = new RegExp('^(You may )?put (' + QUANTITY + ') of (?:them|those cards) (' + DESTINATION + ')$', 'i').exec(text);
  if (match) return make(match[2], '', match[3], !!match[1], false);
  match = new RegExp('^(You may )?put (' + QUANTITY + ') (.+?) (?:from among (?:them|the revealed cards)|revealed this way) (' + DESTINATION + ')$', 'i').exec(text);
  if (match) return make(match[2], match[3], match[4], !!match[1], false);
  match = new RegExp('^(You may )?reveal (' + QUANTITY + ') (.+?) from among (?:them|the revealed cards)(?: and put|\\. Put) (?:it|them|that card|those cards|the revealed cards) (' + DESTINATION + ')$', 'i').exec(text);
  if (match) return make(match[2], match[3], match[4], !!match[1], true);
  match = new RegExp('^(You may )?choose (' + QUANTITY + ') (.+?) from among (?:them|the revealed cards)\\. Put (?:it|them|that card|those cards|the chosen cards) (' + DESTINATION + ')$', 'i').exec(text);
  if (match) return make(match[2], match[3], match[4], !!match[1], false);
  match = new RegExp('^(You may )?exile (' + QUANTITY + ') of (?:them|those cards)$', 'i').exec(text);
  if (match) return {...quantity(match[2], !!match[1]), destination: 'exile', reveal: false};
  match = /^(You may )?exile that card$/i.exec(text);
  if (match) return {...quantity('one', !!match[1]), destination: 'exile', reveal: false};
  return null;
}

export function needsRecompile(card, frozen) {
  const optionalAll = /(?:look at|reveal) the top (?:\w+|\d+) cards? of your library\. You may put all .+? (?:from among them|revealed this way) (?:into your hand|onto the battlefield)/i.test(card.oracle_text || '');
  const contains = value => !!value && typeof value === 'object' &&
    (value.action === 'look-select' && value.max === 'all' && value.required === true || Object.values(value).some(child => Array.isArray(child) ? child.some(contains) : contains(child)));
  return optionalAll && contains(frozen.implementation);
}

// Resolution payments are the only scope in which "lesser mana value" has a
// closed antecedent here. The payment parser calls this entry point only after
// one creature has actually been selected for a sacrifice payment.
export function paymentLibraryEffect(card, line, helpers = {}) {
  let text = String(line).trim();
  if (!text.endsWith('.')) return null;
  text = text.slice(0, -1);
  if (!/^Reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom of your library in a random order$/i.test(text)) return null;
  return revealUntil(card, text, helpers, {kind: 'stat', comparison: 'lesser', reference: {kind: 'payment-card', index: 0}});
}

export function extensionEffect(card, line, helpers = {}) {
  const removalSearch=/^(Destroy (?:up to one )?target [^.]+\.) (Its controller may search .+)$/.exec(line);
  if(removalSearch){
    const first=helpers.effect?.(card,removalSearch[1]),search=ownerSearchEffect(card,removalSearch[2],helpers,{kind:'target-controller',index:0});
    if(first&&!first.optional&&first.targets?.length===1&&first.targets[0].zone==='battlefield'&&first.effects?.length===1&&first.effects[0].action==='destroy'&&search)return {targets:first.targets,optional:false,effects:[...first.effects,...search.effects]};
  }
  let text = String(line).trim(); if (!text.endsWith('.')) return null;
  text = text.slice(0, -1);
  const zoneShuffle = /^(?:(Target player|Each player) shuffles? their (graveyard|hand and graveyard) into their library|Shuffle your (graveyard|hand and graveyard) into your library)(?:, then (draws?|draw) (a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\d+) cards?)?$/i.exec(text);
  if (zoneShuffle) {
    const actor = zoneShuffle[1]?.toLowerCase(), scope = (zoneShuffle[2] || zoneShuffle[3]).toLowerCase();
    const who = actor === 'target player' ? 0 : actor === 'each player' ? 'each-player' : 'you';
    if (zoneShuffle[4] && (actor === 'each player' ? !/^draws$/i.test(zoneShuffle[4]) : !/^draw$/i.test(zoneShuffle[4]))) return null;
    const targets = actor === 'target player' ? [helpers.target?.('target player')] : [];
    if (actor === 'target player' && !targets[0]) return null;
    const effects = [{action: 'library-zone-shuffle-v8', who, zones: scope === 'graveyard' ? ['graveyard'] : ['hand', 'graveyard']}];
    if (zoneShuffle[5]) effects.push({action: 'draw', who, n: number(zoneShuffle[5])});
    return {targets, optional: false, effects};
  }
  const normalizedSearch = text
    .replace(/ and reveal them\. Put one /i, ', reveal those cards, put one ')
    .replace(/ and reveal them,? and put one /i, ', reveal those cards, put one ')
    .replace(/, reveal those cards, and put one /i, ', reveal those cards, put one ')
    .replace(/\. Put one /i, ', put one ')
    .replace(/\. Then shuffle$/i, ', then shuffle')
    .replace(/\. Shuffle$/i, ', then shuffle')
    .replace(new RegExp('\\. Shuffle, then scry (' + NUM + ')$', 'i'), ', then shuffle, then scry $1');
  let search = new RegExp('^Search your library for (up to )?(two|2) (.+?)(, reveal those cards)?, put one ' +
    '(into your hand|into your graveyard|onto the battlefield(?: tapped)?) and the other ' +
    '(into your hand|into your graveyard|onto the battlefield(?: tapped)?), then shuffle(?:, then scry (' + NUM + '))?$', 'i').exec(normalizedSearch);
  if (search) {
    const selected = searchFilterFor(search[3], helpers), first = searchPlacement(search[5]), rest = searchPlacement(search[6]);
    if (!selected || !first || !rest || first.destination === rest.destination && first.tapped === rest.tapped) return null;
    const effects = [{action: 'library-search-v8', who: 'you', n: 2, upTo: !!search[1], ...selected,
      reveal: !!search[4], placements: [{n: 1, ...first}, {n: 'rest', ...rest}]}];
    if (search[7]) {
      const suffix = helpers.effect?.(card, 'Scry ' + search[7] + '.');
      if (!suffix || suffix.optional || suffix.targets?.length || suffix.effects?.length !== 1) return null;
      effects.push(suffix.effects[0]);
    }
    return {targets: [], optional: false, effects};
  }
  search = new RegExp('^Search your library for (' + SEARCH_QUANTITY + ') (.+?) with different names( that each have mana value X)?' +
    '(?:, (reveal (?:them|those cards)))?, put (?:them|those cards) ' +
    '(into your hand|into your graveyard|onto the battlefield(?: tapped)?), then shuffle$', 'i').exec(normalizedSearch);
  if (search) {
    const count = searchQuantity(search[1]), selected = searchFilterFor(search[2] + (search[3] ? ' with mana value X' : ''), helpers);
    const placement = searchPlacement(search[5]);
    if (!selected || !placement || search[3] && count.n !== 'X' || placement.destination === 'battlefield' && selected.unrestricted) return null;
    return {targets: [], optional: false, effects: [{action: 'library-search-v8', who: 'you', ...count, ...selected,
      differentNames: true, reveal: !!search[4], placements: [{n: 'all', ...placement}]}]};
  }
  search = new RegExp('^Search your library for (' + SEARCH_QUANTITY + ') (.+?)(?:, (reveal (?:it|them|that card|those cards)))?' +
    ', then shuffle and put (?:it|them|that card|those cards|the card) (on top|third from the top)( in any order)?$', 'i').exec(normalizedSearch);
  if (search) {
    const count = searchQuantity(search[1]), selected = searchFilterFor(search[2], helpers), offset = /^third/i.test(search[4]) ? 2 : 0;
    if (!selected || offset && count.n !== 1 || search[5] && count.n === 1) return null;
    return {targets: [], optional: false, effects: [{action: 'library-search-v8', who: 'you', ...count, ...selected,
      reveal: !!search[3], placements: [{n: 'all', destination: 'top', offset, order: count.n === 'all' || Number(count.n) > 1}]}]};
  }
  const related = /^(?:(Exile target creature you control), then (reveal cards from the top of your library until you reveal a creature card with greater mana value\..+)|(Put target permanent you own on the bottom of your library)\. (Reveal cards from the top of your library until you reveal a card that shares a card type with that permanent\..+))$/i.exec(text);
  if (related) {
    const prefixText = related[1] || related[3], suffixText = related[2] || related[4];
    const prefix = helpers.effect?.(card, prefixText + '.');
    const relation = related[1]
      ? {kind: 'stat', stat: 'mv', comparison: 'greater', reference: {kind: 'target', index: 0}}
      : {kind: 'shares-card-type', reference: {kind: 'target', index: 0}};
    const suffix = prefix && revealUntil(card, suffixText, helpers, relation);
    if (!prefix || !suffix || prefix.optional || prefix.targets?.length !== 1 || prefix.effects?.length !== 1 || suffix.optional || suffix.targets?.length) return null;
    if (related[1] && (prefix.effects[0].action !== 'exile' || prefix.effects[0].target !== 0)) return null;
    if (related[3] && (prefix.effects[0].action !== 'move-to-library' || prefix.effects[0].target !== 0 || !prefix.effects[0].bottom)) return null;
    return {targets: prefix.targets, optional: false, effects: [...prefix.effects, ...suffix.effects]};
  }
  const until = revealUntil(card, text, helpers); if (until) return until;
  let optional = false;
  if (/^You may (?:look at|reveal) /i.test(text)) {optional = true; text = text.replace(/^You may /i, '');}
  let who = 'you', targets = [];
  const otherLibrary = /^(look at|reveal) the top (.+?) cards? of (target player's|target opponent's) library/i.exec(text);
  if (otherLibrary) {
    targets = [helpers.target(otherLibrary[3].replace(/'s$/, ''))]; if (!targets[0]) return null;
    who = 0; text = text.replace(otherLibrary[3] + ' library', 'your library').replace(/\b(?:that player's|that|the) library\b/g, 'your library');
  }
  const shuffle = /\. You may (?:then )?(?:have that player )?shuffle(?: your library)?$/i.exec(text);
  const optionalShuffle = !!shuffle;
  if (shuffle) text = text.slice(0, shuffle.index);
  const reorder = new RegExp('^(look at|reveal) the top (card|(' + NUM + ') cards?) of your library(?:, where X is (.+?))?(, then put (?:it|them|those cards) back in any order)?$', 'i').exec(text);
  if (reorder && (reorder[5] || optionalShuffle)) {
    let n = reorder[2] === 'card' ? 1 : number(reorder[3]);
    if (reorder[4]) {if (n !== 'X') return null; n = countFor(reorder[4], helpers); if (n === null || n === undefined) return null;}
    return {targets, optional, effects: [{action: 'library-select-v8', n, ...(who !== 'you' ? {who} : {}),
      visibility: reorder[1].toLowerCase() === 'reveal' ? 'reveal' : 'look', selections: [],
      rest: {destination: reorder[5] ? 'top' : 'stay'}, ...(optionalShuffle ? {optionalShuffle: true} : {})}]};
  }
  const head = new RegExp('^(look at|reveal) the top (card|(' + NUM + ')( plus (?:one|\\d+))? cards?) of your library(?:, where X is (.+?))?\\. (?:If you do, )?(.+)$', 'i').exec(text);
  if (!head) return null;
  let n = head[2].toLowerCase() === 'card' ? 1 : number(head[3]);
  if (head[4]) n = {kind: 'sum', values: [n, number(head[4].slice(6))]};
  if (head[5]) {
    if (n !== 'X') return null;
    n = countFor(head[5], helpers); if (n === null || n === undefined) return null;
  }
  let body = head[6];
  body = body.replace(/^(You may put |Put )one of those cards back on top/i, '$1one of those cards on top')
    .replace(/^Put one into your hand/i, 'Put one of them into your hand');
  const result = (selections, rest) => ({targets, optional, effects: [{action: 'library-select-v8', n, ...(who !== 'you' ? {who} : {}),
    visibility: head[1].toLowerCase() === 'reveal' ? 'reveal' : 'look', selections, rest, ...(optionalShuffle ? {optionalShuffle: true} : {})}]});

  // Telling Time: disjoint choices from one inspected cohort. Short libraries
  // still follow the instruction as far as possible.
  if (/^Put one of (?:them|those cards) into your hand, one on top of your library, and one on the bottom of your library$/i.test(body)) {
    if (n !== 3) return null;
    return result([{max: 1, required: true, reveal: false, destination: 'hand'},
      {max: 1, required: true, reveal: false, destination: 'top'}], {destination: 'bottom', random: false});
  }
  const parts = partition(body);
  if (!parts) {const selection = select(body, helpers); return selection ? result([selection], {destination: 'stay'}) : null;}
  const {rest, singularOther} = parts; body = parts.body;
  body=body.replace(/^(Reveal .+? from among (?:them|the revealed cards)), then put /i,'$1 and put ');
  const selection = select(body, helpers);
  if (!selection) return null;
  if (singularOther && (typeof n !== 'number' || !selection.required || selection.filter || selection.max !== n - 1)) return null;
  return result([selection], rest);
}

export {filterFor as libraryFilter};

// Runs after the frozen core/older grammars, preserving their descriptors.
export function fallbackEffect(card,line,helpers={}){
 const ownerSearch=ownerSearchEffect(card,line,helpers);if(ownerSearch)return ownerSearch;
 const search=new RegExp('^(You may )?Search your library for ('+SEARCH_QUANTITY+') (.+?)(?:, (reveal (?:it|them|that card|those cards)))?(?:, | and )put (?:it|them|that card|those cards) (into your hand|into your graveyard|onto the battlefield(?: tapped)?), then shuffle\\.$','i').exec(line);
 if(!search)return null;
 const selected=searchFilterFor(search[3],helpers),placement=searchPlacement(search[5]);
 if(!selected||!placement||selected.unrestricted&&placement.destination==='battlefield')return null;
 return {targets:[],optional:!!search[1],effects:[{action:'library-search-v8',who:'you',...searchQuantity(search[2]),...selected,reveal:!!search[4],placements:[{n:'all',...placement}]}]};
}

function ownerSearchEffect(card,line,helpers,overrideWho){
 const actor=/^(Each player|Each opponent|Each other player|Target player|Target opponent|That player|That creature's controller|Its controller) (may )?search(?:es)? (?:their|that player's) library for (.+)\.$/i.exec(line);
 if(!actor||actor[1].toLowerCase()==='its controller'&&!overrideWho)return null;
 let body=actor[3].replace(/\btheir (hand|graveyard)\b/g,'your $1')
  .replace(/\. Then each player who searched their library this way shuffles$/i,', then shuffle');
 const parsed=new RegExp('^('+SEARCH_QUANTITY+') (.+?)(?:, (reveal (?:it|them|that card|those cards)))?(?:, | and )put (?:it|them|that card|those cards) (into your hand|onto the battlefield(?: tapped)?), then shuffle$','i').exec(body);
 if(!parsed)return null;
 const selected=searchFilterFor(parsed[2],helpers),placement=searchPlacement(parsed[4]);
 if(!selected||!placement||selected.unrestricted&&placement.destination==='battlefield')return null;
 const noun=actor[1].toLowerCase(),targeted=noun.startsWith('target '),target=targeted?helpers.target(noun):null;
 if(targeted&&!target)return null;
 const who=overrideWho??(targeted?0:noun==='each player'?'each-player':noun==='each opponent'||noun==='each other player'?'each-opponent':noun==='that player'?'event-player':'event-card-controller');
 return {targets:targeted?[target]:[],optional:false,effects:[{action:'library-search-v8',who,chooser:'owner',ownerSearch:true,optionalSearch:!!actor[2],...searchQuantity(parsed[1]),...selected,reveal:!!parsed[3],placements:[{n:'all',...placement}]}]};
}
