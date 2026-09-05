// Type-only and all-color effects preserve every unrelated characteristic.
((MTG) => {
  const actions = new Set(['characteristics-v8']);
  async function run(ctx, effect, helpers) {
    const change = effect.change;
    if (!change || Object.keys(change).some(key => !['addTypes', 'colors', 'creatureTypes', 'retainCreatureTypes'].includes(key)) ||
      change.addTypes && (!Array.isArray(change.addTypes) || change.addTypes.length !== 1 || !['Artifact', 'Enchantment'].includes(change.addTypes[0])) ||
      change.colors && JSON.stringify(change.colors) !== '["W","U","B","R","G"]' ||
      change.creatureTypes && (!Array.isArray(change.creatureTypes) || !change.creatureTypes.length || change.creatureTypes.some(type => !MTG.CREATURE_SUBTYPES.has(type))) ||
      change.retainCreatureTypes !== undefined && (typeof change.retainCreatureTypes !== 'boolean' || !change.creatureTypes) ||
      [change.addTypes, change.colors, change.creatureTypes].filter(Boolean).length !== 1 ||
      effect.temporary !== undefined && effect.temporary !== false ||
      effect.removeKeywords && JSON.stringify(effect.removeKeywords) !== '["defender"]') throw new Error('Unsupported characteristic-only change');
    const subjects = [...new Set(helpers.subjects(ctx, effect.target))].filter(card => card instanceof MTG.CardInst && card.zone === 'battlefield');
    for (const card of subjects) ctx.g.addOracleAnimation(card, {
      types: change.addTypes || [], subtypes: change.creatureTypes || [], keywords: [], colors: change.colors || null,
      ...(effect.removeKeywords ? { removeKeywords: effect.removeKeywords } : {}),
      retainTypes: true, retainAllSubtypes: !change.creatureTypes || change.retainCreatureTypes,
      ...(change.creatureTypes && !change.retainCreatureTypes ? { replaceCreatureSubtypes: true } : {}), temporary: effect.temporary !== false,
    });
  }
  MTG.OracleV8Characteristics = { actions, run };
})(globalThis.MTG || (globalThis.MTG = {}));
