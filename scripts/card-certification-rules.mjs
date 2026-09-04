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
