// Immediate phasing only. Duration locks, phase-in prevention and explicit
// phase-in triggers need separate rules and remain outside this grammar.
const escape = text => String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function extensionEffect(card, line, helpers) {
  const counterThenPhase = /^(Put a \+1\/\+1 counter on target creature)\. It phases out\.$/.exec(line);
  if (counterThenPhase) {
    const first = helpers.effect?.(card, counterThenPhase[1] + '.');
    if (first?.targets.length === 1 && first.effects.length === 1 && first.effects[0].action === 'counter' && first.effects[0].target === 0) return { ...first, effects: [...first.effects, { action: 'phase-out-v8', target: 0 }] };
    return null;
  }
  const match = /^(.+?) phases? out\.$/i.exec(line);
  if (!match) return null;
  const noun = match[1];
  let reference, targets = [];
  if (new RegExp('^(?:this (?:creature|permanent|artifact|enchantment|land)|' + escape(card.name) + ')$', 'i').test(noun) && !/Instant|Sorcery/.test(card.type_line)) reference = 'self';
  else if (/^(?:enchanted|equipped) (?:creature|permanent|artifact|enchantment|land)$/i.test(noun) && /Aura|Equipment/.test(card.type_line)) reference = 'attached-host';
  else {
    const target = helpers.target?.(noun.toLowerCase());
    if (target?.zone !== 'battlefield' || ['player', 'opponent', 'card'].includes(target.what)) return null;
    targets = [target]; reference = 0;
  }
  return { effects: [{ action: 'phase-out-v8', target: reference }], targets, optional: false };
}
export function extensionLine() { return null; }
