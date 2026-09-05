// Closed color/type clauses. Changes never imply animation or a P/T setter.
import { ORACLE_SUBTYPES, ORACLE_SUBTYPE_TYPES } from './oracle-subtypes.mjs';
const colors = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const escape = text => String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const self = card => new RegExp('^(?:this (?:creature|artifact|enchantment|permanent|land)|' + escape(card.name) + ')$', 'i');
const result = (effects, targets = []) => ({ effects, targets, optional: false });
const creatureType = word => {
  const singular = ORACLE_SUBTYPES.has(word) ? word : ({ Elves: 'Elf', Wolves: 'Wolf', Dwarves: 'Dwarf', Allies: 'Ally' }[word] || word.replace(/s$/, ''));
  return ORACLE_SUBTYPES.has(singular) && !ORACLE_SUBTYPE_TYPES[singular] ? singular : null;
};
const creatureTypes = text => {
  const types = text.replace(/Time Lord/g, 'Time_Lord').split(' ').map(word => word.replace('Time_Lord', 'Time Lord'));
  return types.length && types.every(type => ORACLE_SUBTYPES.has(type) && !ORACLE_SUBTYPE_TYPES[type]) ? types : null;
};
function scope(card, noun, helpers) {
  if (self(card).test(noun) && !/Instant|Sorcery/.test(card.type_line)) return { own: true };
  if (/^(Enchanted|Equipped) (creature|artifact|enchantment|land|permanent)$/i.test(noun) && /Aura|Equipment/.test(card.type_line)) return { attached: true };
  let text = noun.replace(/^(All |Each )/, '').replace(/your opponents control/g, 'an opponent controls');
  text = text.replace(/\b(creatures|permanents|artifacts|lands|enchantments)\b/gi, word => word.slice(0, -1).toLowerCase());
  text = text.replace(/^([A-Z][a-z-]+)(?= |$)/, word => creatureType(word) || word);
  const target = helpers.target?.('target ' + text);
  if (!target || target.zone !== 'battlefield' || ['player', 'opponent', 'card'].includes(target.what)) return null;
  return { filters: [target] };
}
export function extensionLine(card, line, helpers) {
  if (line === "Creatures without flying or islandwalk can't attack.") return { kind: 'generic-static', scope: 'all-creatures', power: 0, toughness: 0, keywords: [], attackRequiresKeywords: ['flying', 'islandwalk'], contract: 'generic-continuous-effect' };
  const attached = /^(Other )?(Equipped|Enchanted) creatures (you control|your opponents control) (?:get ([+-]\d+)\/([+-]\d+)(?: and have (.+))?|have (.+))\.$/.exec(line);
  if (attached) {
    const keywords = attached[6] || attached[7] ? helpers.keywordList?.(attached[6] || attached[7]) : [];
    if (keywords) return { kind: 'generic-static', scope: 'filtered-permanents', filters: [{ what: 'creature', zone: 'battlefield', controller: attached[3] === 'you control' ? 'you' : 'opponent', min: 1, [attached[2].toLowerCase()]: true }], excludeSelf: !!attached[1], power: Number(attached[4] || 0), toughness: Number(attached[5] || 0), keywords, contract: 'generic-continuous-effect' };
  }
  const color = /^(.+?) (?:is|are) (white|blue|black|red|green|colorless|all colors)\.$/.exec(line);
  if (color) {
    const target = scope(card, color[1], helpers);
    // A self-defining color/type ability also applies outside the battlefield.
    // This static runtime only describes battlefield sources and subjects.
    if (target && !target.own) return { kind: 'v8-type-static', ...target, change: { colors: color[2] === 'colorless' ? [] : color[2] === 'all colors' ? Object.values(colors) : [colors[color[2]]] }, contract: 'continuous-characteristic-type' };
  }
  const type = /^(.+?) (?:is|are) (?:(white|blue|black|red|green) and (?:is|are) )?(?:a |an )?([A-Z][a-z-]+) in addition to (?:its|their) other (?:creature )?types\.$/.exec(line);
  if (type) {
    const target = scope(card, type[1], helpers), subtype = creatureType(type[3]);
    if (target && !target.own && subtype) return { kind: 'v8-type-static', ...target, change: { addCreatureTypes: [subtype], ...(type[2] ? { colors: [colors[type[2]]] } : {}) }, contract: 'continuous-characteristic-type' };
  }
  return null;
}
export function extensionEffect(card, line, helpers) {
  if (typeof line !== 'string' || !line.endsWith('.')) return null;
  const text = line.replace(/^Until end of turn, (.+)\.$/i, '$1 until end of turn.');
  const subject = noun => {
    if (self(card).test(noun) && !/Instant|Sorcery/.test(card.type_line)) return { reference: 'self', targets: [] };
    const target = helpers.target?.(noun.toLowerCase());
    return target?.zone === 'battlefield' && !['player', 'opponent', 'card'].includes(target.what) ? { reference: 0, targets: [target] } : null;
  };
  const addition = /^(.+?) becomes? an? (artifact|enchantment) in addition to its other types( until end of turn)?\.$/i.exec(text);
  if (addition) {
    const target = subject(addition[1]);
    if (target) return result([{ action: 'characteristics-v8', target: target.reference, ...(!addition[3] ? { temporary: false } : {}), change: { addTypes: [addition[2][0].toUpperCase() + addition[2].slice(1).toLowerCase()] } }], target.targets);
  }
  const allColors = /^(.+?) becomes? all colors until end of turn\.$/i.exec(text);
  if (allColors) {
    const target = subject(allColors[1]);
    if (target) return result([{ action: 'characteristics-v8', target: target.reference, change: { colors: Object.values(colors) } }], target.targets);
  }
  const subtype = /^(.+?) becomes? an? ([A-Z][a-zA-Z -]+?)( in addition to its other (?:creature )?types)?( until end of turn)?\.$/.exec(text);
  if (subtype) {
    const target = subject(subtype[1]), types = creatureTypes(subtype[2]);
    const creature = target && (target.reference === 'self' ? /\bCreature\b/.test(card.type_line) : target.targets[0].what === 'creature');
    if (creature && types) return result([{ action: 'characteristics-v8', target: target.reference,
      ...(!subtype[4] ? { temporary: false } : {}), change: { creatureTypes: types, retainCreatureTypes: !!subtype[3] } }], target.targets);
  }
  const loseAndType = /^(.+?) loses? ([a-z ,'-]+) and becomes? (.+?) until end of turn\.$/i.exec(text);
  if (loseAndType) {
    const change = helpers.effect(card, loseAndType[1] + ' becomes ' + loseAndType[3] + ' until end of turn.');
    const removeKeywords = helpers.keywordList?.(loseAndType[2]);
    if (change?.effects.length === 1 && change.effects[0].action === 'characteristics-v8' && JSON.stringify(removeKeywords) === '["defender"]') return { ...change, effects: [{ ...change.effects[0], removeKeywords }] };
  }
  // The two descriptions bind one already-chosen target, in printed order.
  const first = /^(.+?) becomes? (.+?) and (gets? [+-]\d+\/[+-]\d+|gains? [a-z ,'-]+) until end of turn\.$/i.exec(text);
  const last = /^(.+?) (gets? [+-]\d+\/[+-]\d+|gains? [a-z ,'-]+) and becomes? (.+?) until end of turn\.$/i.exec(text);
  if (first || last) {
    const noun = (first || last)[1], change = first ? first[2] : last[3], buff = first ? first[3] : last[2];
    const changed = helpers.effect(card, noun + ' becomes ' + change + ' until end of turn.');
    const pumped = helpers.effect(card, noun + ' ' + buff + ' until end of turn.');
    const key = rows => JSON.stringify((rows || []).map(row => Object.fromEntries(Object.entries({ min: 1, max: 1, ...row }).sort(([a], [b]) => a.localeCompare(b)))));
    if (changed && pumped && !changed.optional && !pumped.optional && changed.effects.length === 1 && pumped.effects.length === 1 &&
      ['change-characteristics-v8', 'characteristics-v8'].includes(changed.effects[0].action) && pumped.effects[0].action === 'pump' &&
      changed.effects[0].target === pumped.effects[0].target && key(changed.targets) === key(pumped.targets)) return result(first ? [...changed.effects, ...pumped.effects] : [...pumped.effects, ...changed.effects], changed.targets);
  }
  const linkedTap = /^(Target creature) becomes (white|blue|black|red|green|colorless) until end of turn\. (Tap|Untap) that creature\.$/.exec(text);
  if (linkedTap) {
    const changed = helpers.effect(card, linkedTap[1] + ' becomes ' + linkedTap[2] + ' until end of turn.');
    if (changed?.targets?.length === 1 && changed.effects.length === 1 && changed.effects[0].action === 'change-characteristics-v8') return result([...changed.effects, { action: linkedTap[3].toLowerCase(), target: 0 }], changed.targets);
  }
  return null;
}
