// Closed clauses compose existing engine operations; every suffix is consumed.
const body = (effects, targets = []) => ({ effects, targets, optional: false });
export function extensionLine(card, text, h) {
  const extraToken = /^If you would create one or more (artifact )?tokens, instead create those tokens plus an additional (Food|Map) token\.$/.exec(text);
  if (extraToken) return h.line(card, `If one or more ${extraToken[1] || ''}tokens would be created under your control, those tokens plus an additional ${extraToken[2]} token are created instead.`);
  return null;
}
export function extensionEffect(card, text, h) {
  if (text === "You gain life equal to the life you've lost this turn.") {
    return body([{ action: 'gain-life', who: 'you', n: { kind: 'turn-count', field: 'lifeLost' } }]);
  }
  if (text === 'This creature must be blocked each combat this turn if able.') {
    return h.effect(card, 'This creature must be blocked this turn if able.');
  }
  if (text === 'Target player draws a card, then up to one target creature you control connives.') {
    return body([{ action: 'draw', who: 0, n: 1 }, { action: 'connive', target: 1 }], [
      h.target('target player'), { ...h.target('target creature you control'), min: 0, max: 1 },
    ]);
  }
  if (text === "Return target creature to its owner's hand. If it was tapped, create a Map token.") {
    const token = h.effect(card, 'Create a Map token.');
    if (token) return body([{
      action: 'conditional', condition: h.condition('it is tapped'), conditionTarget: 0,
      effects: [{ action: 'bounce', target: 0 }, ...token.effects],
      elseEffects: [{ action: 'bounce', target: 0 }],
    }], [h.target('target creature')]);
  }
  if (text === "Destroy target creature if it's white. A creature destroyed this way can't be regenerated.") {
    return body([{
      action: 'conditional', condition: h.condition("it's white"), conditionTarget: 0,
      effects: [{ action: 'destroy', target: 0, noRegen: true }],
    }], [h.target('target creature')]);
  }
  if (text === 'Choose any number of target creatures. Each of those creatures gains persist until end of turn.') {
    return h.effect(card, 'Any number of target creatures gain persist until end of turn.');
  }
  if (text === 'Up to one other target creature loses all abilities. Put a flying counter, a first strike counter, and a lifelink counter on that creature.') {
    return body([
      { action: 'ability-loss-v8', target: 0, keywords: [], temporary: false },
      ...['flying', 'first strike', 'lifelink'].map(counter => ({ action: 'counter', target: 0, counter, n: 1 })),
    ], [{ ...h.target('target creature'), excludeSelf: true, min: 0, max: 1 }]);
  }
  const attachSelf = /^Attach (?:it|this Equipment) to (target legendary creature you control)\.$/.exec(text);
  if (attachSelf && /\bEquipment\b/.test(card.type_line || '')) {
    const target = h.target(attachSelf[1]);
    if (target) return body([{ action: 'attach-source', target: 0 }], [target]);
  }
  const selfAndOtherPump = /^This creature and up to one other target creature each get ([+-]\d+)\/([+-]\d+) until end of turn\.$/.exec(text);
  if (selfAndOtherPump) return body(['self', 0].map(target => ({
    action: 'pump', target, power: Number(selfAndOtherPump[1]), toughness: Number(selfAndOtherPump[2]), keywords: [],
  })), [{ ...h.target('target creature'), excludeSelf: true, min: 0, max: 1 }]);
  if (text === 'Exile this artifact and all cards from all graveyards. Draw a card.') {
    const graves = h.effect(card, 'Exile all graveyards.');
    if (graves) return body([{ action: 'exile', target: 'self' }, ...graves.effects, { action: 'draw', who: 'you', n: 1 }]);
  }
  if (text === "Exile each opponent's graveyard.") {
    return body([{ action: 'zone-select', zone: 'graveyard', destination: 'exile', who: 'each-opponent', n: 'all', filter: { what: 'card', zone: 'graveyard', controller: 'you', min: 1 } }]);
  }
  if (text === 'You and target opponent each create a tapped Powerstone token.') {
    const parsed = h.effect(card, 'Create a tapped Powerstone token.');
    if (parsed?.effects.length === 1) return body([
      parsed.effects[0], { ...parsed.effects[0], who: 0 },
    ], [h.target('target opponent')]);
  }
  if (text === 'Until end of turn, gain control of target creature and it gains haste. Untap and goad that creature.') {
    return body([
      { action: 'gain-control', target: 0, temporary: true },
      { action: 'pump', target: 0, power: 0, toughness: 0, keywords: ['haste'] },
      { action: 'untap', target: 0 },
      { action: 'goad', target: 0 },
    ], [h.target('target creature')]);
  }
  return null;
}
