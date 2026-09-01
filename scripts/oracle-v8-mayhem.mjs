// CR 702.187b.  This compiler admits only the costed Mayhem keyword on an
// Instant or Sorcery.  Reminder text is removed by the whole-card compiler;
// every remaining character on the keyword line must match this grammar.
const MANA = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/P|[WUBRG]\/[WUBRG]|2\/[WUBRG])\})+$/;

export function extensionLine(card, line) {
  const match = /^Mayhem ((?:\{[^{}]+\})+)$/.exec(String(line || ''));
  if (!match || !MANA.test(match[1])) return null;
  const types = String(card?.type_line || '').split(/\s+—\s+/, 1)[0].split(/\s+/);
  const instant = types.includes('Instant'), sorcery = types.includes('Sorcery');
  if (instant === sorcery) return null;
  return {
    kind: 'mechanic-mayhem-v8',
    cost: match[1],
    speed: instant ? 'instant' : 'sorcery',
    contract: 'mechanic-mayhem-v8',
  };
}
