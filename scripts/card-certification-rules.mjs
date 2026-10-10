// Oracle Equip variants can have typed targets, nonmana costs, or a cost
// depending on the announced target. Those are explicit activated abilities.
export function oracleEquipAbility(definition) {
  return (definition.abilities || []).some(ability =>
    ability.oracleCompiled === true && ability.oracleEquip === true &&
    ability.equip === true && ability.sorcery === true &&
    ability.cost && typeof ability.cost === 'object' &&
    typeof ability.run === 'function' && Array.isArray(ability.targets) &&
    ability.targets.length === 1 && ['creature','permanent'].includes(ability.targets[0].what) &&
    ability.targets[0].zone === 'battlefield' && typeof ability.targets[0].filter === 'function');
}

export function oracleWithoutReminder(text) {
  return String(text || '').replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ');
}

export function activatedOracleLines(oracle) {
  // Quoted grants belong to the recipient of the granted ability.
  return oracleWithoutReminder(oracle).replace(/"[^"]*"/g, ' ').split('\n').filter(line => {
    const value = line.trim();
    return /^(?:\{[^}]+\}(?:,\s*)?)+[^:]*:/.test(value) ||
      /^(?:Sacrifice|Discard|Tap)\b[^:]*:/.test(value);
  });
}

export function hasDirectOracleManaActivation(oracle) {
  return activatedOracleLines(oracle).some(line =>
    /^\s*(?:\{[^}]+\}(?:,\s*)?)*\{T\}:\s*Add\b/i.test(line));
}

export function stickerActivationPaths(definition, engine) {
  const registry = engine?.OracleV87;
  const game = engine?.Game?.prototype;
  if (definition.stickerSheetV87 !== true || !Array.isArray(definition.stickersV87) ||
      Object.prototype.toString.call(registry?.sheets) !== '[object Map]' ||
      Object.prototype.toString.call(registry?.programs) !== '[object Map]' ||
      typeof registry.applyStickerLayers !== 'function' || typeof registry.applyProgram !== 'function' ||
      typeof game?.stickersV87 !== 'function' || typeof game?.placeStickerV87 !== 'function') return 0;
  const sheet = registry.sheets.get(definition.name);
  if (!sheet || !Array.isArray(sheet.stickers)) return 0;
  let count = 0;
  const seen = new Set();
  for (const row of definition.stickersV87) {
    if (row.kind !== 'ability' || row.sheet !== definition.name || seen.has(row.index) ||
        !Number.isInteger(row.index) || !Number.isInteger(row.cost) || row.cost < 0) continue;
    const registered = sheet.stickers.find(candidate => candidate.index === row.index &&
      candidate.sheet === row.sheet && candidate.kind === row.kind &&
      candidate.text === row.text && candidate.cost === row.cost);
    if (!registered) continue;
    seen.add(row.index);
    const program = registry.programs.get(row.sheet + ':' + row.index);
    if (!program) continue;
    count += (program.abilities || []).filter(ability => ability.cost &&
      typeof ability.cost === 'object' && typeof ability.run === 'function').length;
    count += (program.mana || []).filter(mana => mana.cost && typeof mana.cost === 'object' &&
      Array.isArray(mana.produce) && mana.produce.length > 0).length;
  }
  return count;
}

export function stackActivationPaths(definition, engine) {
  return definition.name === 'Lightning Storm' && definition.oracleV88Name === 'Lightning Storm' &&
    definition.lightningStormV88 === true && typeof definition.resolve === 'function' &&
    engine?.OracleV88?.spellNames?.has('Lightning Storm') === true &&
    typeof engine?.Game?.prototype?.activatableList === 'function' &&
    typeof engine?.Game?.prototype?.activateAbility === 'function' ? 1 : 0;
}

export function activatedPaths(definition, engine) {
  const mana = Array.isArray(definition.mana) ? definition.mana.length : definition.mana ? 1 : 0;
  return mana + (definition.abilities || []).length + (definition.opponentAbilities || []).length +
    (definition.handAbility ? 1 : 0) + (definition.gyAbility ? 1 : 0) +
    (typeof definition.oracleExileAbilityV20?.run === 'function' ? 1 : 0) + (definition.cycling ? 1 : 0) +
    (definition.cdkSuspendedSacrifice ? 1 : 0) + (typeof definition.c13CommandAbility?.run === 'function' ? 1 : 0) +
    (definition.equip !== undefined ? 1 : 0) + (definition.grantMana ? 1 : 0) +
    (definition.statics || []).filter(rule => rule.grantsSelfActivatedAbility && typeof rule.apply === 'function').length +
    stickerActivationPaths(definition, engine) + stackActivationPaths(definition, engine);
}
