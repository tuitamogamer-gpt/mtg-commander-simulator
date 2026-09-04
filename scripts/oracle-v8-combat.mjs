// Closed declaration predicates. Their runtime evaluates players and whole
// declarations; these are not approximated as pairwise keyword restrictions.
export function combatLine(card, line, h) {
  const match = /^(.+?) (can't .+|can block .+)\.$/.exec(line);
  if (!match) return null;
  let subject = match[1], text = match[2], prefix, condition;
  const conditional = / as long as (.+)$/.exec(text);
  if (conditional && text.startsWith('can block ')) {condition = h.condition(conditional[1]); if (!condition) return null; text = text.slice(0, conditional.index);}
  const composed = /^(.*) (gets? [+-]\d+\/[+-]\d+|has? .+?) and$/.exec(subject);
  if (composed) { subject = composed[1]; prefix = h.readLine(subject + ' ' + composed[2] + '.'); if (!prefix) return null; }
  let rule;
  if (text === 'can block an additional creature each combat') rule = {kind: 'block-capacity', additional: 1};
  if (text === 'can block an additional seven creatures each combat') rule = {kind: 'block-capacity', additional: 7};
  if (text === 'can block any number of creatures') rule = {kind: 'block-capacity', any: true};
  if (new RegExp('^can block an additional creature each combat for each Equipment attached to ' + h.self + '$', 'i').test(text)) rule = {kind: 'block-capacity', equipment: true};
  if (text === "can't be blocked by more than one creature") rule = {kind: 'blocker-bounds', max: 1};
  if (text === "can't be blocked except by three or more creatures") rule = {kind: 'blocker-bounds', min: 3};
  const alone = /^can't (attack|block|attack or block) alone$/.exec(text);
  if (alone) rule = {kind: 'companion', attack: alone[1].includes('attack'), block: alone[1].includes('block')};
  const greater = /^can't (attack|block) unless a creature with greater power also (attacks|blocks)$/.exec(text);
  if (greater && (greater[1] === 'attack') === (greater[2] === 'attacks')) rule = {kind: 'companion', attack: greater[1] === 'attack', block: greater[1] === 'block', greaterPower: true};
  if (text === "can't attack unless a black or green creature also attacks") rule = {kind: 'companion', attack: true, block: false, colors: ['B', 'G']};
  const compare = /^can't (attack|block) unless you control more (creatures|lands) than (defending|attacking) player$/.exec(text);
  if (compare && (compare[1] === 'attack') === (compare[3] === 'defending')) rule = {kind: compare[1] === 'attack' ? 'defender-attack' : 'attacker-block', predicate: {kind: 'more-permanents', type: compare[2] === 'creatures' ? 'Creature' : 'Land'}};
  const defender = /^can't (attack unless|be blocked as long as|be blocked unless|be blocked by creatures with power 2 or greater as long as) defending player (.+)$/.exec(text);
  if (defender) {
    const predicates = {
      'controls an artifact land': {kind: 'permanent', types: ['Artifact', 'Land']},
      'controls an untapped land': {kind: 'permanent', types: ['Land'], untapped: true},
      'controls an artifact': {kind: 'permanent', types: ['Artifact']},
      'controls an enchantment': {kind: 'permanent', types: ['Enchantment']},
      'controls a snow land': {kind: 'permanent', types: ['Land'], snow: true},
      'controls an enchantment or an enchanted permanent': {kind: 'enchantment-or-enchanted'},
      'controls the most creatures or is tied for the most': {kind: 'most-creatures'},
      'controls three or more creatures that share a creature type': {kind: 'shared-creature-type', min: 3},
      'is poisoned': {kind: 'poisoned'},
      'is the monarch': {kind: 'monarch'},
      'has seven or more cards in their graveyard': {kind: 'graveyard', min: 7},
    };
    const predicate = predicates[defender[2]];
    if (predicate) rule = {kind: defender[1] === 'attack unless' ? 'defender-attack' : 'defender-evasion', predicate,
      ...(defender[1] === 'be blocked unless' ? {negate: true} : {}), ...(defender[1].includes('power 2') ? {blockerPowerMin: 2} : {})};
  }
  if (text === "can't be blocked by creatures the monarch controls") rule = {kind: 'monarch-blockers'};
  const cast = /^can't (attack unless|be blocked if) you've cast a (historic|creature|noncreature) spell this turn$/.exec(text);
  if (cast) rule = {kind: 'cast-history', mode: cast[1] === 'attack unless' ? 'attack' : 'evasion', quality: cast[2]};
  if (text === "can't attack unless an opponent has been dealt damage this turn") rule = {kind: 'opponent-damaged'};
  if (!rule) return null;
  const own = new RegExp('^' + h.self + '$', 'i').test(subject), attached = /^(?:Enchanted|Equipped) creature$/i.test(subject);
  const filters = own || attached ? null : h.groupFilters(subject);
  if (!own && !attached && !filters) return null;
  const operation = {kind: attached ? 'attachment-grant' : 'generic-static', contract: attached ? 'attachment-continuous-effect' : 'generic-continuous-effect',
    ...(!attached ? {scope: own ? 'self' : 'filtered-permanents', ...(filters ? {filters} : {})} : {}), power: 0, toughness: 0, keywords: [], combatRule: rule, ...(condition ? {condition} : {})};
  return prefix ? {kind: 'operation-bundle', operations: [prefix, operation], contract: 'closed-permanent-clauses'} : operation;
}
