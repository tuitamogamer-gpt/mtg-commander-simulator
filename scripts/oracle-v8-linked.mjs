// Closed linked-exile grammar. CR 607 and CR 610.3 are intentionally separate:
// an "until" duration is immediate, while the older ETB/LTB pair uses a trigger.
import { extensionTarget as legacyTarget } from './oracle-extensions-v7.mjs';
import { ORACLE_SUBTYPES } from './oracle-subtypes.mjs';

const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function selfPattern(card) {
  const names = [...new Set([card.name, String(card.name || '').split(/,| the /)[0]])].filter(Boolean).map(escape);
  return '(?:this (?:creature|artifact|enchantment|land|permanent|planeswalker|Vehicle|Equipment|Aura|token)' + (names.length ? '|' + names.join('|') : '') + ')';
}

function normalizedBody(card, text) {
  return String(text).replace(new RegExp(selfPattern(card), 'gi'), '__oracle_source__').toLowerCase();
}

function rulesLines(card) {
  let depth = 0, text = '';
  for (const char of String(card.oracle_text || '')) {
    if (char === '(') { depth++; continue; }
    if (char === ')') { if (!depth) return []; depth--; continue; }
    if (!depth) text += char;
  }
  if (depth) return [];
  return text.split('\n').map(line => line.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

function publicTarget(text, helpers) {
  const target = (helpers.target || legacyTarget)(text);
  return ['battlefield', 'graveyard'].includes(target?.zone) && !['player', 'opponent'].includes(target.what) ? target : null;
}

function battlefieldTarget(text, helpers) {
  const target = publicTarget(text, helpers);
  return target?.zone === 'battlefield' && target.what !== 'card' ? target : null;
}

function groupFilter(text, helpers) {
  let phrase = text.replace(/your opponents control/g, 'an opponent controls')
    .replace(/\b(creatures|artifacts|enchantments|lands|permanents|planeswalkers|tokens)\b/g, word => word.slice(0, -1))
    .replace(/\b(Elves|Wolves|Dwarves|Allies)\b/g, word => ({Elves: 'Elf', Wolves: 'Wolf', Dwarves: 'Dwarf', Allies: 'Ally'}[word]))
    .replace(/\b([A-Z][A-Za-z-]+)s\b/g, (word, singular) => ORACLE_SUBTYPES.has(singular) ? singular : word);
  const other = /^other /i.test(phrase);
  phrase = phrase.replace(/^other /i, '');
  return battlefieldTarget((other ? 'another target ' : 'target ') + phrase, helpers);
}

function acquisition(card, text, helpers) {
  const body = text.replace(/^you may /i, '');
  const match = /^exile (.+)$/i.exec(body);
  if (!match) return null;
  let subject = match[1];
  const excludeSelf = new RegExp(' other than ' + selfPattern(card) + '$', 'i');
  if (excludeSelf.test(subject) && /^target /i.test(subject)) subject = subject.replace(excludeSelf, '').replace(/^target /i, 'another target ');
  const target = publicTarget(subject, helpers);
  if (target) return {effects: [{action: 'linked-exile', target: 0, link: 0, ...(target.zone !== 'battlefield' ? {from: target.zone} : {})}], targets: [target]};
  const group = /^(all|each|a|an) (.+)$/i.exec(subject), filter = group && groupFilter(group[2], helpers);
  if (filter) return {effects: [{action: 'linked-exile', filters: [filter], link: 0, ...(/^(?:a|an)$/i.test(group[1]) ? {chooseCount: 1} : {})}], targets: []};
  return null;
}

function release(card, text) {
  const self = '(?:' + selfPattern(card) + '|it)';
  const objects = '(?:the exiled cards?|(?:all|each) (creature )?cards? exiled with ' + self + ')';
  let match = new RegExp('^(?:return|put) ' + objects + ' (?:to|onto) the battlefield( tapped)? under (your|its owner\'s|their owners\'|their owner\'s) control$', 'i').exec(text);
  if (match) return {action: 'linked-return', link: 0, to: 'battlefield', controller: match[3].toLowerCase() === 'your' ? 'you' : 'owner', ...(match[1] ? {what: 'creature'} : {}), ...(match[2] ? {tapped: true} : {})};
  match = new RegExp('^(?:return|put) ' + objects + ' (?:to|into) (?:its owner\'s|their owners\'|their owner\'s) (hand|hands|graveyard|graveyards)$', 'i').exec(text);
  if (match) return {action: 'linked-return', link: 0, to: match[2].toLowerCase().startsWith('hand') ? 'hand' : 'graveyard', controller: 'owner', ...(match[1] ? {what: 'creature'} : {})};
  if (new RegExp('^each player returns to the battlefield all cards they own exiled with ' + self + '$', 'i').test(text)) return {action: 'linked-return', link: 0, to: 'battlefield', controller: 'owner'};
  // "Put ... onto the battlefield" has the resolving ability's controller as
  // its implicit player, unlike an explicit return under owners' control.
  if (new RegExp('^put (?:all|each) cards? exiled with ' + self + ' onto the battlefield$', 'i').test(text)) return {action: 'linked-return', link: 0, to: 'battlefield', controller: 'you'};
  return null;
}

// Every printed acquisition must be recognized, and exactly one matching
// return clause must link it. Other exile abilities, quoted grants, conditional
// tails and costs that themselves exile something are deliberately excluded.
function printedPair(card, helpers) {
  const lines = rulesLines(card), self = selfPattern(card);
  const triggers = new RegExp('^(?:When|Whenever) ' + self + ' (?:enters(?: the battlefield)?|attacks|dies|leaves the battlefield|is put into a graveyard from the battlefield), (.+)\\.$', 'i');
  const landfall = /^(?:Landfall — )?Whenever a land you control enters, (.+)\.$/i;
  const acquisitions = [], returns = [];
  for (const line of lines) {
    let body = triggers.exec(line)?.[1] || landfall.exec(line)?.[1];
    if (!body) {
      const activation = /^([^:]+): (.+)\.$/.exec(line);
      if (activation && helpers.cost?.(activation[1])) body = activation[2];
    }
    if (!body) continue;
    const acquire = acquisition(card, body, helpers);
    if (acquire) acquisitions.push({body: normalizedBody(card, body), ...acquire});
    const returned = release(card, body);
    if (returned) returns.push({body: normalizedBody(card, body), effect: returned});
  }
  if (!acquisitions.length || returns.length !== 1 || (lines.join('\n').match(/\bexile\b/gi) || []).length !== acquisitions.length) return null;
  return {acquisitions, release: returns[0].body, returned: returns[0].effect};
}

export function extensionEffect(card, line, helpers = {}) {
  const value = String(line || '').trim();
  if (!value.endsWith('.')) return null;
  const original = value.slice(0, -1);
  let text = original, optional = false;
  if (/^you may /i.test(text)) { optional = true; text = text.replace(/^you may /i, ''); }
  const result = (effects, targets = []) => ({effects, targets, optional});
  const until = new RegExp('^exile (.+?) until ' + selfPattern(card) + ' leaves the battlefield$', 'i').exec(text);
  if (until) {
    const target = battlefieldTarget(until[1], helpers);
    if (target) return result([{action: 'linked-exile-until', target: 0}], [target]);
    if (/^that (?:creature|artifact|enchantment|land|permanent|planeswalker)$/i.test(until[1])) {
      return result([{action: 'linked-exile-until', target: 'event-card'}]);
    }
    const group = /^(all|each|any number of) (.+)$/i.exec(until[1]);
    const filter = group && groupFilter(group[2], helpers);
    if (filter) return result([{action: 'linked-exile-until', filters: [filter], ...(group[1].toLowerCase() === 'any number of' ? {chooseAny: true} : {})}]);
    return null;
  }
  const pair = printedPair(card, helpers);
  if (!pair) return null;
  const body = normalizedBody(card, original);
  const acquire = pair.acquisitions.find(entry => body === entry.body);
  if (acquire) return result(acquire.effects, acquire.targets);
  if (body === pair.release) return result([pair.returned]);
  return null;
}

export function extensionLine(card, line, helpers = {}) {
  const pair = printedPair(card, helpers);
  if (!pair) return null;
  const match = new RegExp('^(?:When|Whenever) ' + selfPattern(card) + ' (enters(?: the battlefield)?|leaves the battlefield|is put into a graveyard from the battlefield|dies), (.+)$', 'i').exec(line);
  if (!match) return null;
  const effect = extensionEffect(card, match[2], helpers);
  if (!effect) return null;
  return {kind: 'generic-trigger', event: /^enters/i.test(match[1]) ? 'etb' : /^leaves/i.test(match[1]) ? 'lto' : 'dies', eventFilter: 'self', ...effect, contract: 'generic-trigger-effect'};
}
