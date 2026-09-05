// Copy exceptions are closed data. Only wholly parsed clauses become runtime
// descriptors; the runtime never inspects the printed Oracle prose.
import {ORACLE_SUBTYPES} from './oracle-subtypes.mjs';

const NUM = '(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|[0-9]+|X)';
const number = text => text.toUpperCase() === 'X' ? 'X' : ({a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10}[text.toLowerCase()] ?? Number(text));
const escape = text => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MAIN_TYPES = {artifact: 'Artifact', enchantment: 'Enchantment', creature: 'Creature', land: 'Land', planeswalker: 'Planeswalker'};
const COLORS = {white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G', colorless: null};
const GRANTS = new Set(['generic-ability', 'generic-trigger', 'mana-source', 'mechanic-changeling', 'mechanic-myriad', 'mechanic-dethrone']);

function selfPattern(card) {
  const names = [...new Set([card.name, String(card.name || '').split(/,| the /)[0]])].filter(Boolean).map(escape);
  return '(?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|Vehicle|Equipment|Aura|token)|' + names.join('|') + ')';
}

function clauses(text) {
  const parts = []; let start = 0, quoted = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted;
    if (quoted) continue;
    const split = /^(?:, ?(?:and )?| and )(?=(?:it\b|it's\b|he\b|he's\b|she\b|she's\b|they\b|they're\b|the token\b|the tokens\b|has\b|have\b|is\b|isn't\b|are\b|aren't\b|its name\b|his name\b|her name\b))/.exec(text.slice(i));
    if (split) {parts.push(text.slice(start, i)); start = i + split[0].length; i = start - 1;}
  }
  if (quoted) return null;
  parts.push(text.slice(start)); return parts;
}

export function modifications(card, text, helpers, allowRetainedAbility = false) {
  if (!text) return {};
  // A surrounding death observer may bind "it" to its event card before
  // reaching this parser. Within copy exceptions the pronoun always describes
  // the resulting copy, including every clause after a literal name.
  text=text.replace(/\bthat (?:creature|artifact|enchantment|land|permanent|card)'s /g,"it's ")
    .replace(/\bthat (?:creature|artifact|enchantment|land|permanent|card) (?=has |is |isn't )/g,'it ');
  const parts = clauses(text); if (!parts) return null;
  const mod = {};
  for (let part of parts) {
    part = part.replace(/^(?:the tokens|the token|they|it|he|she) /i, '').replace(/^(?:it's|they're|he's|she's) /i, 'is ');
    const renamed = /^(?:its|his|her) name is (.+)$/.exec(part);
    if (renamed) {if (!renamed[1].trim() || /[.\n]/.test(renamed[1]) || renamed[1] !== card.name && (!/^[A-Z][A-Za-z0-9' -]*(?:, [A-Z][A-Za-z0-9' -]*)*$/.test(renamed[1]) || /\b(?:then|until|unless|if|when|whenever|otherwise)\b/i.test(renamed[1]))) return null; mod.name = renamed[1]; continue;}
    if (/^(?:is|are) legendary in addition to (?:its|their|his|her) other types$/.test(part)) {mod.addSuper = ['Legendary']; continue;}
    if (/^(?:isn't|aren't|is not|are not) legendary$/i.test(part)) {mod.nonlegendary = true; continue;}
    let match = /^(?:is|are) (?:an? |each )?(.+?) in addition to (?:its|their) other (?:colors and |creature )?types$/i.exec(part);
    if (match) {
      const words = match[1].replace(/\b(artifacts|enchantments|creatures|lands|planeswalkers)\b/g,word=>word.slice(0,-1)).split(' '), pt = /^\d+\/\d+$/.test(words[0]) ? words.shift().split('/').map(Number) : null;
      if (pt) {mod.power = pt[0]; mod.toughness = pt[1];}
      const colorWords=words.filter(word=>Object.hasOwn(COLORS,word));
      if(colorWords.length){if(!/other colors and types$/.test(part)||colorWords.includes('colorless'))return null;mod.addColors=colorWords.map(word=>COLORS[word]);}
      const main = words.filter(word => MAIN_TYPES[word]), subs = words.filter(word => !MAIN_TYPES[word]&&!colorWords.includes(word)&&word!=='and');
      if (subs.some(word => !ORACLE_SUBTYPES.has(word))) return null;
      mod.addTypes = [...new Set([...(mod.addTypes || []), ...main.map(word => MAIN_TYPES[word])])];
      mod.addSubtypes = [...new Set([...(mod.addSubtypes || []), ...subs])];
      continue;
    }
    match = /^(?:is|are) (?:an? |each )?(artifact|enchantment)(?: and (?:it |they )?loses? all other card types)?$/i.exec(part);
    if (match) {mod.types = [MAIN_TYPES[match[1].toLowerCase()]]; continue;}
    match = /^(?:is|are) (?:an? |each )?(\d+)\/(\d+)(?: (white|blue|black|red|green|colorless))?(?: ([A-Z][A-Za-z -]+))?$/.exec(part);
    if (match) {
      mod.power = Number(match[1]); mod.toughness = Number(match[2]);
      if (match[3]) mod.colors = COLORS[match[3]] ? [COLORS[match[3]]] : [];
      if (match[4]) {const subtypes = match[4].split(' '); if (subtypes.some(word => !ORACLE_SUBTYPES.has(word))) return null; mod.creatureSubtypes = subtypes;}
      continue;
    }
    match = /^(?:has|have) (.+)$/.exec(part);
    if (match) {
      const retained = /^(?:(.+?) and )?this ability$/.exec(match[1]);
      if (retained) {
        if (!allowRetainedAbility) return null;
        const keywords = retained[1] ? helpers.keywordList?.(retained[1]) : [];
        if (!keywords) return null;
        mod.retainAbility = true; mod.keywords = [...(mod.keywords || []), ...keywords]; continue;
      }
      if (match[1].startsWith('this ability and ')) {
        if (!allowRetainedAbility) return null;
        mod.retainAbility = true; match[1] = match[1].slice('this ability and '.length);
      }
      const quoted = /^(?:(.+?) and )?"(.+)"$/.exec(match[1]);
      if (quoted) {
        const keywords = quoted[1] ? helpers.keywordList?.(quoted[1]) : [];
        let operation = helpers.line?.({...card, name: '__OracleCopy__', type_line: 'Creature', oracle_text: quoted[2]}, quoted[2], helpers);
        if (operation && helpers.normalizeOperations) operation = helpers.normalizeOperations([operation])[0];
        if (!keywords || !GRANTS.has(operation?.kind)) return null;
        mod.keywords = [...(mod.keywords || []), ...keywords];
        (mod.operations ||= []).push(operation); continue;
      }
      const mixed=match[1].split(/,? and |, /);
      if(mixed.length>1&&mixed.some(word=>/^(?:myriad|dethrone|changeling)$/.test(word))){
        const ordinary=mixed.filter(word=>!/^(?:myriad|dethrone|changeling)$/.test(word));
        const keywords=ordinary.flatMap(word=>helpers.keywordList?.(word)||[null]);if(keywords.includes(null))return null;
        mod.keywords=[...(mod.keywords||[]),...keywords];
        for(const mechanic of mixed.filter(word=>/^(?:myriad|dethrone|changeling)$/.test(word)))(mod.operations||=[]).push({kind:'mechanic-'+mechanic,contract:'mechanic-'+mechanic});
        continue;
      }
      const keywords = helpers.keywordList?.(match[1]);
      if (keywords) {mod.keywords = [...(mod.keywords || []), ...keywords]; continue;}
      if (/^(?:myriad|dethrone|changeling)$/.test(match[1])) {
        (mod.operations ||= []).push({kind: 'mechanic-' + match[1], contract: 'mechanic-' + match[1]}); continue;
      }
      let operation = helpers.line?.({...card, name: '__OracleCopy__', type_line: 'Creature'}, match[1][0].toUpperCase() + match[1].slice(1), helpers);
      if (operation && helpers.normalizeOperations) operation = helpers.normalizeOperations([operation])[0];
      if (!GRANTS.has(operation?.kind)) return null;
      (mod.operations ||= []).push(operation); continue;
    }
    return null;
  }
  return mod;
}

function source(card, phrase, helpers) {
  phrase=phrase.replace(/ in (your|a|an opponent's) graveyard$/, ' from $1 graveyard');
  if (new RegExp('^' + selfPattern(card) + '$', 'i').test(phrase) || /^it$/i.test(phrase)) return {target: 'self'};
  if (/^that (?:creature|artifact|enchantment|land|permanent|card|token)$/i.test(phrase) || phrase.startsWith('that ') && ORACLE_SUBTYPES.has(phrase.slice(5))) return {target: 'event-card'};
  if (/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(phrase)) return {target: 'attached-host'};
  const target = helpers.target?.(phrase);
  if (target && ['battlefield', 'graveyard'].includes(target.zone) && !['player', 'opponent', 'card'].includes(target.what)) return {target: 0, targets: [target]};
  const choose = /^(?:a|an|any) (.+)$/.exec(phrase);
  const filter = choose && helpers.target?.('target ' + choose[1]);
  if (filter?.zone === 'battlefield') return {filter, choose: true};
  return null;
}

function groupFilter(text, helpers) {
  const phrase = text.replace(/your opponents control/g, 'an opponent controls')
    .replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|tokens)\b/g, word => word.slice(0, -1));
  const filter = helpers.target?.('target ' + phrase);
  return filter?.zone === 'battlefield' ? filter : null;
}

function becomeEffect(card, line, helpers, prefix = null) {
  let text = String(line).trim(); if (!text.endsWith('.')) return null;
  text = text.slice(0, -1);
  // A targeted graveyard card remains the same resolved reference after the
  // preceding exile instruction. Do not bind the recipient's "this" to it.
  const exile = /^(Exile target .+?\.) (.+)$/i.exec(text);
  if (exile && !prefix) {
    const first = helpers.effect?.(card, exile[1]);
    if (first?.effects.length === 1 && first.effects[0].action === 'exile' && first.targets.length === 1 && !first.optional) {
      return becomeEffect(card, exile[2] + '.', helpers, {targets: first.targets, effects: first.effects, boundModel: 0});
    }
    return null;
  }
  let duration = 'permanent', optional = false, chosen = null;
  const head = /^(?:Until end of turn|Until your next turn), (.+)$/i.exec(text);
  if (head) {duration = /^until your/i.test(text) ? 'next-turn' : 'eot'; text = head[1];}
  const choice = /^Choose (.+?)\. (.+)$/i.exec(text);
  if (choice) {chosen = choice[1]; text = choice[2];}
  const tail = / (until end of turn|until your next turn)(?=, except |$)/.exec(text);
  if (tail) {if (duration !== 'permanent') return null; duration = tail[1] === 'until end of turn' ? 'eot' : 'next-turn'; text = text.slice(0, tail.index) + text.slice(tail.index + tail[0].length);}
  if (/^you may have /i.test(text)) {optional = true; text = text.replace(/^you may have /i, '');}
  const match = /^(.+?) becomes? a copy of (.+?)(?:, except (.+))?$/i.exec(text);
  if (!match) return null;
  const mod = modifications(card, match[3] || '', helpers, !/\b(?:Instant|Sorcery)\b/.test(card.type_line));
  if (!mod) return null;
  const targets = [...(prefix?.targets || [])];
  let recipient, filter, excludeModel = false, otherTarget, chooseModel;
  const group = /^each (other )?(.+)$/i.exec(match[1]);
  if (group) {filter = groupFilter(group[2], helpers); excludeModel = !!group[1]; if (!filter) return null;}
  else {
    const self = new RegExp('^' + selfPattern(card) + '$', 'i').test(match[1]);
    if (self) recipient = 'copy-source';
    else if (/^(?:it|he|she)$/i.test(match[1])) recipient = 'self';
    else if (/^that (?:creature|artifact|enchantment|land|permanent)$/i.test(match[1])) recipient = 'event-card';
    else if (/^(?:enchanted|equipped) (?:creature|artifact|enchantment|land|permanent)$/i.test(match[1])) recipient = 'attached-host';
    else {const target = helpers.target?.(match[1]); if (target?.zone !== 'battlefield') return null; recipient = targets.length; targets.push(target);}
  }
  let modelPhrase = match[2].replace(/ (?:in|from) (your|a|an opponent's) graveyard$/, ' from $1 graveyard');
  if (chosen) {
    if (!/^that (?:creature|artifact|enchantment|land|permanent)$/i.test(modelPhrase) || prefix) return null;
    if (/\btarget\b/.test(chosen)) {
      const model = helpers.target?.(chosen); if (model?.zone !== 'battlefield') return null;
      // The choose-target sentence precedes all other targets when announced.
      targets.unshift(model); if (typeof recipient === 'number') recipient++;
      otherTarget = 0;
    } else {
      chooseModel = helpers.target?.('target ' + chosen.replace(/^(?:a|an) /, '').replace(' on the battlefield', ''));
      if (chooseModel?.zone !== 'battlefield') return null;
    }
  } else if (prefix && /^that (?:card|creature|artifact|enchantment|land|permanent)$/i.test(modelPhrase)) otherTarget = prefix.boundModel;
  else {
    const model = source(card, modelPhrase, helpers); if (!model) return null;
    if (model.targets) {
      const spec = {...model.targets[0]};
      if (spec.unbounded || Number(spec.max) > 1) return null;
      if (typeof recipient === 'number' && /^(?:another|(?:up to one )?other) target /i.test(modelPhrase)) {delete spec.excludeSelf; spec.differentFromPrevious = true;}
      otherTarget = targets.length; targets.push(spec);
    } else if (model.choose) chooseModel = model.filter;
    else otherTarget = /^it$/i.test(modelPhrase) ? 'copy-reference' : model.target;
  }
  const effect = {action: 'become-copy-v8', ...(filter ? {filter, ...(excludeModel ? {excludeModel: true} : {})} : {target: recipient}),
    ...(chooseModel ? {chooseModel} : {otherTarget}), modifications: mod, duration};
  return {effects: [...(prefix?.effects || []), effect], targets, optional};
}

// Preserve existing versioned manifests. Only recompile new v8 cards when the
// old whole-card fallback bound an observed creature's "it" to the observer.
export function needsRecompile(card, frozen) {
  const observer = String(card.oracle_text || '').split('\n').some(line => {
    const match = /^(?:When|Whenever) (?:another |a |an )(.+?) (?:enters|dies), (.+)$/i.exec(line.trim());
    return match && /(?:a copy|copies) of it(?:,|\.| except|$)/i.test(match[2]) &&
      !/\btarget\b/i.test(match[2].split(/(?:a copy|copies) of it/i)[0]);
  });
  return observer && (frozen.implementation || []).some(operation =>
    operation.kind === 'generic-trigger' && ['etb', 'dies'].includes(operation.event) &&
    operation.eventFilter?.kind === 'filtered-object' &&
    (operation.effects || []).some(effect => ['copy-token', 'copy-token-v8'].includes(effect.action) && effect.target === 'self'));
}

export function extensionEffect(card, line, helpers = {}) {
  const become = becomeEffect(card, line, helpers);
  if (become) return become;
  let value = String(line || '').trim(); if (value.endsWith('"')) value += '.';
  if (!value.endsWith('.')) return null;
  let body = value.slice(0, -1), optional = false;
  if (/^you may /i.test(body)) {optional = true; body = body.replace(/^you may /i, '');}
  const result = (effect, targets = []) => ({effects: [effect], targets, optional});

  const chosenCopy=/^Choose (target .+?)\. (Create .+?(?:a copy|copies) of )it(, except .+)?$/i.exec(body);
  if(chosenCopy)return extensionEffect(card,chosenCopy[2]+chosenCopy[1]+(chosenCopy[3]||'')+'.',helpers);

  const followCounters=/^(Create .+?\.) Put (one|two|three|four|five|six|seven|eight|nine|ten|\d+) (\+1\/\+1|-1\/-1) counters? on it$/i.exec(body);
  if(followCounters){const created=extensionEffect(card,followCounters[1],helpers);if(created&&!created.optional&&created.effects.length===1)return {...created,effects:[...created.effects,{action:'counter',target:'created-tokens',counter:followCounters[3],n:number(followCounters[2])}]};return null;}

  const all = /^for each (.+?), (create .+)$/i.exec(body);
  if (all) {
    const filter = groupFilter(all[1], helpers), parsed = extensionEffect(card, all[2][0].toUpperCase() + all[2].slice(1) + '.', helpers);
    if (filter && parsed?.targets.length === 0 && parsed.effects.length === 1 && ['self', 'event-card'].includes(parsed.effects[0].target)) {
      const effect = {...parsed.effects[0], filter}; delete effect.target; return result(effect);
    }
    return null;
  }
  const selected = /^choose (.+?)\. For each of those (?:creatures|artifacts|enchantments|lands|permanents), (create .+)$/i.exec(body);
  if (selected) {
    const target = helpers.target?.(selected[1]), parsed = extensionEffect(card, selected[2][0].toUpperCase() + selected[2].slice(1) + '.', helpers);
    if (target?.zone === 'battlefield' && parsed?.targets.length === 0 && parsed.effects.length === 1 && ['self', 'event-card'].includes(parsed.effects[0].target)) return result({...parsed.effects[0], target: 0}, [target]);
    return null;
  }

  let delayed, haste = false, hasteUntilEot = false, hasteUntilNextTurn = false;
  const ending = /\. (Exile|Sacrifice) (?:it|them|that token|those tokens|the token|the tokens) at (the beginning of (?:the next|your next|the) end step|end of combat)$/i.exec(body);
  if (ending) {delayed = {action: ending[1].toLowerCase(), on: /combat/i.test(ending[2]) ? 'endCombat' : 'endStep', ...(ending[2].includes('your next') ? {your: true} : {})}; body = body.slice(0, ending.index);}
  const grant = /\. (?:That token|Those tokens|The token|The tokens|It|They) gains? haste( until end of turn| until your next turn)?$/i.exec(body);
  if (grant) {haste = true; hasteUntilEot = grant[1] === ' until end of turn'; hasteUntilNextTurn = grant[1] === ' until your next turn'; body = body.slice(0, grant.index);}

  const main = new RegExp('^(?:(target opponent|target player|each opponent|each player|its controller|that creature\\\'s controller) creates|create) (' + NUM + ') (tapped(?: and attacking)? )?tokens? that(?:\\\'s| is| are) (?:a copy|copies) of (.+?)(?:,? except (.+))?$', 'i').exec(body);
  if (!main) return null;
  const origin = source(card, main[4], helpers), mod = modifications(card, main[5] || '', helpers);
  if (!origin || !mod) return null;
  let targets = origin.targets || [], who = 'you';
  if (main[1]) {
    if (/^target /i.test(main[1])) {const target = helpers.target?.(main[1].toLowerCase()); if (!target) return null; who = targets.length; targets = [...targets, target];}
    else who = main[1].includes('controller') ? 'event-card-controller' : main[1].replace(' ', '-').toLowerCase();
  }
  const effect = {action: 'copy-token-v8', n: number(main[2]), who, ...origin, modifications: mod,
    ...(main[3] ? {tapped: true, ...(main[3].includes('attacking') ? {attacking: true} : {})} : {}), ...(haste ? {haste: true, ...(hasteUntilEot ? {hasteUntilEot: true} : {}), ...(hasteUntilNextTurn ? {hasteUntilNextTurn: true} : {})} : {}), ...(delayed ? {delayed} : {})};
  delete effect.targets;
  return result(effect, targets);
}

export function extensionLine(card, line, helpers = {}) {
  const copy = new RegExp('^You may have ' + selfPattern(card) + ' enter( tapped)? as a copy of (?:any|a|an) (.+?)(?:, except (.+))?\\.$', 'i').exec(line.endsWith('"') ? line + '.' : line);
  if (copy) {
    const filter = helpers.target?.('target ' + copy[2].replace(' on the battlefield', '').replace(' in a graveyard', ' from a graveyard').replace(' in your graveyard', ' from your graveyard'));
    const mod = modifications(card, copy[3] || '', helpers);
    if (filter && ['battlefield', 'graveyard'].includes(filter.zone) && mod) return {kind: 'copy-as-enters-v8', filter, modifications: mod, ...(copy[1] ? {tapped: true} : {}), contract: 'copy-as-enters-v8'};
    return null;
  }
  // A direct "copy of it" in a creature-entry/death observer refers to the
  // event creature. Normalize only this wholly consumed trigger structure;
  // sequences with a newly selected target keep their own locked reference.
  const observer = /^(?:When|Whenever) (another |a |an )(.+?) (enters|dies), (.+)$/i.exec(line);
  if (observer && /(?:a copy|copies) of it(?:,|\.| except|$)/i.test(observer[4]) && !/\btarget\b/i.test(observer[4].split(/(?:a copy|copies) of it/i)[0])) {
    const filter = helpers.target?.('target ' + observer[2]);
    const body = observer[4].replace(/((?:a copy|copies) of )it(?=,|\.| except|$)/i, '$1that creature');
    const parsed = helpers.effect?.(card, body);
    if (filter?.zone === 'battlefield' && parsed) return {kind: 'generic-trigger', event: observer[3].toLowerCase() === 'enters' ? 'etb' : 'dies',
      eventFilter: {kind: 'filtered-object', target: filter, another: observer[1].trim().toLowerCase() === 'another'}, ...parsed, contract: 'generic-trigger-effect'};
  }
  return null;
}
