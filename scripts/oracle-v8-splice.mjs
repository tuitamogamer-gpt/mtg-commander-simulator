const MANA = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\\\/[WUBRG]|[WUBRG]\\\/P|2\\\/[WUBRG])\})+$/;

// This tranche is intentionally limited to the printed Kamigawa
// "Splice onto Arcane" family present in the pinned source set.  A splice
// marker is useful only after the rest of the card has independently compiled;
// this parser never treats reminder text or an unknown payment sentence as
// executable rules text.
export function extensionLine(card, line) {
  if (!card || card.type_line !== 'Instant — Arcane') return null;
  const text = String(line || '');
  const mana = /^Splice onto Arcane (.+)$/.exec(text);
  if (mana && MANA.test(mana[1])) {
    return {
      kind: 'mechanic-splice-arcane', onto: 'Arcane',
      cost: {kind: 'mana', mana: mana[1]}, contract: 'mechanic-splice-arcane',
    };
  }
  const exact = new Map([
    ['Splice onto Arcane—Exile four cards from your graveyard.',
      {kind: 'exile-graveyard', n: 4}],
    ["Splice onto Arcane—Return a blue creature you control to its owner's hand.",
      {kind: 'return-permanent', n: 1, filter: {type: 'Creature', color: 'U', controller: 'you'}}],
    ['Splice onto Arcane—Sacrifice two Mountains.',
      {kind: 'sacrifice-permanent', n: 2, filter: {subtype: 'Mountain', controller: 'you'}}],
    ['Splice onto Arcane—Tap an untapped white creature you control.',
      {kind: 'tap-permanent', n: 1, filter: {type: 'Creature', color: 'W', controller: 'you', untapped: true}}],
  ]);
  const cost = exact.get(text);
  return cost ? {
    kind: 'mechanic-splice-arcane', onto: 'Arcane', cost,
    contract: 'mechanic-splice-arcane',
  } : null;
}
