// CR 613.1b, 613.7 and 613.8: control effects use their own layer, timestamps
// and dependencies. There is no Oracle prose interpretation in this runtime.
((M) => {
  const stamp = game => game.oracleControlClock = (game.oracleControlClock || 0) + 1;
  const live = (card, version) => card?.zone === 'battlefield' && card.zoneVersion === version;

  function attached(game, source, host) {
    const previous = source.meta.oracleAuraControlAttachment;
    // Reattaching to the same object does nothing (CR 701.3b).
    if (previous?.active && previous.version === source.zoneVersion && previous.host === host.iid && previous.hostVersion === host.zoneVersion && previous.copyEpoch === source.copyEpoch) return;
    source.meta.oracleAuraControlAttachment = {version: source.zoneVersion, host: host.iid,
      hostVersion: host.zoneVersion, copyEpoch: source.copyEpoch, stamp: stamp(game), active: true};
  }

  function record(game, card, player, {temporary = false, legacy = false} = {}) {
    const fromEpoch = card.meta.oracleControlEpoch || 0;
    const effect = {kind: temporary ? 'temporaryControl' : 'oracleControl', layeredControl: true,
      iid: card.iid, zoneVersion: card.zoneVersion, from: card.ctrl, to: player,
      controlEpoch: fromEpoch + 1, fromEpoch, timestamp: stamp(game), expires: temporary ? 'eot' : 'object',
      ...(legacy ? {legacy: true} : {})};
    card.meta.oracleControlEpoch = effect.controlEpoch;
    game.untilEffects.push(effect);
    return effect;
  }

  function observe(game, battlefield) {
    // Phased-out permanents still retain their object identity and effects.
    const present = new Map((game.battlefield || battlefield).map(card => [card.iid, card]));
    game.untilEffects = game.untilEffects.filter(effect => !effect.layeredControl || live(present.get(effect.iid), effect.zoneVersion));
    for (const card of battlefield.slice().sort((a, b) => a.timestamp - b.timestamp)) {
      let state = card.meta.oracleControlState;
      if (!state || state.version !== card.zoneVersion) {
        state = card.meta.oracleControlState = {version: card.zoneVersion, base: card.ctrl, computed: card.ctrl};
      } else if (card.ctrl !== state.computed) {
        // Existing scripts can still make explicit persistent assignments.
        // Observe those as a new effect, not as a change to the entry baseline.
        record(game, card, card.ctrl, {legacy: true});
        card.sick = true; card.attacking = null; card.blocking = null;
        state.computed = card.ctrl;
      }
      const attachment = card.meta.oracleAuraControlAttachment;
      if (!card.attachedTo && attachment) attachment.active = false;
      if (!card.def.oracleAuraControl || !card.attachedTo) continue;
      const host = present.get(card.attachedTo);
      if (host && live(host, host.zoneVersion)) attached(game, card, host);
    }
  }

  function gain(game, card, player, options = {}) {
    if (!card || card.zone !== 'battlefield' || !player) return null;
    observe(game, game.bf());
    return record(game, card, player, options);
  }

  function recalculate(game, battlefield) {
    observe(game, battlefield);
    const byId = new Map(battlefield.map(card => [card.iid, card]));
    const controllers = new Map(battlefield.map(card => [card, card.meta.oracleControlState.base]));
    const pending = game.untilEffects.filter(effect => effect.layeredControl && byId.has(effect.iid))
      .map(effect => ({target: byId.get(effect.iid), to: effect.to, timestamp: effect.timestamp}));
    for (const source of battlefield) {
      const host = byId.get(source.attachedTo), attachment = source.meta.oracleAuraControlAttachment;
      if (!source.def.oracleAuraControl || !host || !attachment?.active || attachment.hostVersion !== host.zoneVersion) continue;
      pending.push({source, target: host, timestamp: attachment.stamp});
    }
    pending.sort((a, b) => a.timestamp - b.timestamp);
    while (pending.length) {
      // A static Aura's "you" depends on any still-pending effect changing
      // that Aura's controller. Dependency loops fall back to timestamp order.
      const independent = pending.findIndex(effect => !effect.source ||
        !pending.some(other => other !== effect && other.target === effect.source));
      const effect = pending.splice(independent < 0 ? 0 : independent, 1)[0];
      controllers.set(effect.target, effect.source ? controllers.get(effect.source) : effect.to);
    }
    for (const card of battlefield) {
      const state = card.meta.oracleControlState, controller = controllers.get(card);
      if (state.computed !== controller) {card.sick = true; card.attacking = null; card.blocking = null;}
      card.ctrl = controller;
      state.computed = controller;
    }
  }

  M.OracleV8Control = {attached, gain, recalculate};
})(globalThis.MTG ||= {});
