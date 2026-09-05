// Closed basic-land type clauses. CR 305.6 supplies intrinsic mana abilities;
// merely adding a subtype without that engine behavior is not support.
const landTypes = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
export function extensionLine(card, line) {
  const match = /^(Each land|All lands|Lands you control|Enchanted land) (?:is|are) (?:a |an )?(every basic land type|Plains|Islands?|Swamps?|Mountains?|Forests?) in addition to (?:its|their) other (?:land )?types\.$/.exec(line);
  if (!match || match[1] === 'Enchanted land' && !/\bAura\b/.test(card.type_line)) return null;
  const types = match[2] === 'every basic land type' ? landTypes.slice() : [match[2] === 'Plains' ? 'Plains' : match[2].replace(/s$/, '')];
  return { kind: 'v8-land-types', ...(match[1] === 'Enchanted land' ? { attached: true } : { filters: [{ what: 'land', zone: 'battlefield', controller: match[1] === 'Lands you control' ? 'you' : 'any', min: 1 }] }), types, retain: true, contract: 'continuous-basic-land-types' };
}
export function extensionEffect() { return null; }
