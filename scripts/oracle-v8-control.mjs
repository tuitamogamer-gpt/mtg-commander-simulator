// Static Aura control is a continuously recomputed layer-2 effect. The noun
// identifies its attached object; the enchant ability supplies legal targets.
export function extensionLine(card, line) {
  if (!/\bAura\b/.test(card.type_line || '')) return null;
  if (!/^You control enchanted (?:artifact creature|creature|artifact|enchantment|land|permanent|Equipment)\.$/.test(line)) return null;
  return {kind: 'aura-control-v8', contract: 'aura-control-v8'};
}
