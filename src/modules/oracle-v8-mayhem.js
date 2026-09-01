// Mayhem is a graveyard permission tied to the exact object that was
// discarded this turn.  The runtime consumes only a closed compiler
// descriptor; Oracle prose is never interpreted here.
((M) => {
  const mana = /^(?:\{(?:\d+|X|[WUBRGC]|[WUBRG]\/P|[WUBRG]\/[WUBRG]|2\/[WUBRG])\})+$/;
  const descriptorKeys = new Set(['kind', 'cost', 'speed', 'contract']);
  const conflictingPermissions = [
    'free', 'flashback', 'jumpstart', 'retrace', 'harmonize', 'escape',
    'emry', 'muldrotha', 'foretell', 'plotPlay', 'fromTop', 'adventure',
    'faceDownCast', 'overloaded', 'warp', 'evoke', 'blitz', 'dash',
    'bloodcaster', 'madness', 'consumeExilePermission',
  ];
  const fail = message => { throw new Error('Oracle Mayhem: ' + message); };

  function compile(script, operation, entry) {
    if (!operation || Object.keys(operation).some(key => !descriptorKeys.has(key)) ||
      operation.kind !== 'mechanic-mayhem-v8' || operation.contract !== 'mechanic-mayhem-v8' ||
      !mana.test(operation.cost || '') || !['instant', 'sorcery'].includes(operation.speed)) {
      fail('invalid closed descriptor');
    }
    const types = entry?.raw?.types || [];
    const instant = types.includes('Instant'), sorcery = types.includes('Sorcery');
    if (instant === sorcery || operation.speed !== (instant ? 'instant' : 'sorcery')) fail('descriptor type/speed mismatch');
    if (script.mayhem || script.oracleMayhemV8) fail('duplicate Mayhem descriptor');
    script.mayhem = {cost: operation.cost, speed: operation.speed};
    script.oracleMayhemV8 = true;
  }

  function noteDiscard(game, player, card) {
    if (!card?.meta) return;
    card.meta._discardedTurn = game.turnNo;
    card.meta._discardedBy = player;
    card.meta._discardedZoneVersion = card.zoneVersion;
  }

  function available(game, player, card, definition = card?.def) {
    return !!(game && player && card && definition?.mayhem &&
      card.owner === player && card.zone === 'graveyard' && player.graveyard.includes(card) &&
      card.meta?._discardedTurn === game.turnNo && card.meta?._discardedBy === player &&
      card.meta?._discardedZoneVersion === card.zoneVersion);
  }

  function alternative(definition) {
    return {mayhem: true, altCostStr: definition.mayhem.cost, ...definition.mayhem};
  }

  function castAllowed(game, player, card, options, definition = card?.def) {
    if (!options?.mayhem || !available(game, player, card, definition)) return false;
    if (definition.oracleMayhemV8 && !definition.types?.some(type => type === 'Instant' || type === 'Sorcery')) return false;
    if (options.from !== undefined && options.from !== 'graveyard') return false;
    if (options.altCostStr !== definition.mayhem.cost || options.speed !== definition.mayhem.speed) return false;
    if (conflictingPermissions.some(key => options[key])) return false;
    return game.canCastTiming(player, card, {speed: definition.mayhem.speed,
      ...(options.oracleFace !== undefined ? {oracleFace: options.oracleFace} : {})});
  }

  M.OracleV8Mayhem = {compile, noteDiscard, available, alternative, castAllowed};
})(globalThis.MTG || (globalThis.MTG = {}));
