import TEXT from './oracle-v32-spell-text.json' with {type: 'json'};
const target = (what, controller = 'any', zone = 'battlefield', extra = {}) => ({what, controller, zone, min: 1, max: 1, ...extra});
const creature = (controller = 'any', extra = {}) => target('creature', controller, 'battlefield', extra);
const player = (controller = 'any') => target('player', controller, 'player');
const cohort = (mode, extra = {}) => ({action: 'spell-cohort-v32', mode, ...extra});

// These two newly released cards were absent from all pre-v32 import reports.
// Their postfix "if it's" clauses refer to the targeted permanent, not Teyo.
// Restrict the repair to the complete printed program and expected AST shape.
export function repairFrozenCompilation(card, frozen, h) {
  const keyword = {'Teyo, Diamondblade Mage': 'deathtouch', 'Teyo, Lightshield Expert': 'hexproof'}[card.name];
  if (!keyword || card.layout !== 'normal') return null;
  const text = `Flash\nWhen Teyo enters, target permanent you control gains ${keyword} until end of turn. Put a +1/+1 counter on it if it's a creature. Put a loyalty counter on it if it's a planeswalker.`;
  if (h.stripReminderText(card.oracle_text || '') !== text) return null;
  const result = structuredClone(frozen), trigger = result.implementation?.[0];
  if (result.implementation.length !== 1 || trigger?.kind !== 'generic-trigger' || trigger.event !== 'etb' || trigger.eventFilter !== 'self' || trigger.targets?.length !== 1 || trigger.targets[0].what !== 'permanent' || trigger.targets[0].controller !== 'you' || trigger.effects?.length !== 3) throw Error(card.name + ': unexpected target-binding repair shape');
  for (const [index, what, counter] of [[1, 'creature', '+1/+1'], [2, 'planeswalker', 'loyalty']]) {
    const effect = trigger.effects[index];
    if (effect.action !== 'conditional' || effect.condition?.kind !== 'source-quality' || effect.condition.filter?.what !== what || effect.effects?.length !== 1 || effect.effects[0].action !== 'counter' || effect.effects[0].counter !== counter || effect.effects[0].target !== 0) throw Error(card.name + ': unexpected conditional repair shape');
    effect.conditionTarget = 0;
  }
  return result;
}

export function compileWholeCard(card, h) {
  if (card.layout !== 'normal' || !/\b(?:Instant|Sorcery)\b/.test(card.type_line || '')) return null;
  if (!TEXT[card.name] || h.stripReminderText(card.oracle_text || '') !== TEXT[card.name]) return null;
  let effects, targets = [];
  switch (card.name) {
    case 'Blow Your House Down': effects = [cohort('block-and-walls')]; targets = [creature('any', {min: 0, max: 3})]; break;
    case 'Baleful Stare': case 'Withering Gaze': effects = [cohort('reveal-hand-qualities', {subtype: card.name === 'Baleful Stare' ? 'Mountain' : 'Forest', color: card.name === 'Baleful Stare' ? 'R' : 'G'})]; targets = [player('opponent')]; break;
    case 'Whirlwind Denial': effects = [cohort('counter-opponent-stack', {cost: '{4}'})]; break;
    case 'Split the Party': effects = [cohort('bounce-half-creatures')]; targets = [player()]; break;
    case "Eunuchs' Intrigues": case 'Goblin War Cry': effects = [cohort('keep-one-blocker')]; targets = [player('opponent')]; break;
    case 'Book Burning': effects = [cohort('any-player-damage-or-mill', {damage: 6, mill: 6})]; targets = [player()]; break;
    case 'Coalition Victory': effects = [cohort('colors-and-land-types-win')]; break;
    case 'Worldfire': effects = [cohort('world-exile-life')]; break;
    case "Kaervek's Hex": effects = [cohort('nonblack-green-damage')]; break;
    case 'Planar Overlay': case 'Global Ruin': effects = [cohort('choose-basic-land-types', {operation: card.name === 'Planar Overlay' ? 'bounce-chosen' : 'sacrifice-others'})]; break;
    case 'Broadcast Takeover': effects = [cohort('borrow-artifacts')]; break;
    case 'Tune Up': effects = [cohort('return-artifact-animate-vehicle')]; targets = [target('artifact', 'you', 'graveyard')]; break;
    case 'Blightning': effects = [cohort('damage-discard-controller')]; targets = [target('any', 'any', 'battlefield', {alternatives: [player(), target('planeswalker')]})]; break;
    case 'Consign to Dream': effects = [cohort('bounce-or-top-color', {colors: ['R', 'G']})]; targets = [target('permanent')]; break;
    case 'Sweep Away': effects = [cohort('bounce-or-top-attacker')]; targets = [creature()]; break;
    case 'Light of Judgment': effects = [cohort('damage-optional-equipment')]; targets = [creature()]; break;
    default: return null;
  }
  if (targets.length) effects = effects.map(effect => ({...effect, target: 0}));
  return {semanticClass: 'spell-template', implementation: [{kind: 'spell-generic', effects, targets, optional: false, contract: 'spell-generic-effect'}], implementedKeywords: [], rulesCore: TEXT[card.name], oracleContracts: ['spell-generic-effect']};
}
