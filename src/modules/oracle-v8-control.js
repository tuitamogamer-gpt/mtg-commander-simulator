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

  function record(game, card, player, {temporary = false, legacy = false, duration = null} = {}) {
    if (!player || player.lost) return null; // CR 800.4b
    const fromEpoch = card.meta.oracleControlEpoch || 0;
    const effect = {kind: temporary ? 'temporaryControl' : 'oracleControl', layeredControl: true,
      iid: card.iid, zoneVersion: card.zoneVersion, from: card.ctrl, to: player,
      controlEpoch: fromEpoch + 1, fromEpoch, timestamp: stamp(game), expires: temporary ? 'eot' : 'object',
      ...(legacy ? {legacy: true} : {}), ...(duration ? {sourceDuration:duration,expires:'sourceDuration'} : {})};
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
        if (card.ctrl?.lost) {card.ctrl = state.computed; continue;}
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
    if (!card || card.zone !== 'battlefield' || card.phasedOut || !player || player.lost) return null;
    observe(game, game.bf());
    return record(game, card, player, options);
  }

  function recalculatePass(game, battlefield) {
    observe(game, battlefield);
    const byId = new Map(battlefield.map(card => [card.iid, card]));
    const controllers = new Map(battlefield.map(card => [card, card.meta.oracleControlState.base]));
    const pending = game.untilEffects.filter(effect => effect.layeredControl && !effect.to?.lost && byId.has(effect.iid))
      .map(effect => ({target: byId.get(effect.iid), to: effect.to, timestamp: effect.timestamp}));
    for (const source of battlefield) {
      const host = byId.get(source.attachedTo), attachment = source.meta.oracleAuraControlAttachment;
      if (!source.def.oracleAuraControl || !host || !attachment?.active || attachment.hostVersion !== host.zoneVersion) continue;
      if (source.phasedOut || host.phasedOut) {
        // Departure may end control of a phased cohort, but must not restart
        // an Aura that phased out separately. Only its remembered indirect
        // host cohort carries that already-existing static control layer.
        const root = host.meta.phaseIndirect || {iid:host.iid,zoneVersion:host.zoneVersion};
        if (!source.phasedOut || !host.phasedOut || source.meta.phaseIndirect?.iid !== root.iid ||
            source.meta.phaseIndirect.zoneVersion !== root.zoneVersion) continue;
      }
      pending.push({source, target: host, timestamp: attachment.stamp});
    }
    pending.sort((a, b) => a.timestamp - b.timestamp);
    while (pending.length) {
      // A static Aura's "you" depends on any still-pending effect changing
      // that Aura's controller. Dependency loops fall back to timestamp order.
      const independent = pending.findIndex(effect => !effect.source ||
        !pending.some(other => other !== effect && other.target === effect.source));
      const effect = pending.splice(independent < 0 ? 0 : independent, 1)[0];
      const controller = effect.source ? controllers.get(effect.source) : effect.to;
      if (controller && !controller.lost) controllers.set(effect.target, controller);
    }
    for (const card of battlefield) {
      const state = card.meta.oracleControlState, controller = controllers.get(card);
      // CR 800.4c exiles the object instead of transferring it to the departed
      // default controller. Preserve its previous controller for departure LKI.
      if (controller?.lost) {card.meta.oracleExileForDepartedControl = true; continue;}
      delete card.meta.oracleExileForDepartedControl;
      if (state.computed !== controller) {card.sick = true; card.attacking = null; card.blocking = null;}
      card.ctrl = controller;
      state.computed = controller;
    }
  }

  // Durations can end when another control layer changes their source.
  // Remove expired layers and recompute until no more durations expire.
  function recalculate(game,battlefield){
    do {M.OracleV8Untap?.observe(game);M.OracleV8Untap?.prune(game);recalculatePass(game,battlefield);M.OracleV8Untap?.observe(game);} while(M.OracleV8Untap?.prune(game));
  }
  function gainWhile(ctx,card,mode='controlled'){const duration=M.OracleV8Untap.capture(ctx,mode);if(!M.OracleV8Untap.sourceValid(ctx.g,duration))return null;return gain(ctx.g,card,ctx.you,{duration});}

  function playerLeft(game, player) {
    // CR 800.4a applies to the physical objects, including phased ones. End
    // every layer giving this player control; older surviving layers, rather
    // than ownership, determine the resulting controller.
    const physical = game.battlefield.filter(card => card.zone === 'battlefield');
    observe(game, physical);
    game.untilEffects = game.untilEffects.filter(effect =>
      !(effect.layeredControl || effect.kind === 'temporaryControl') || effect.to !== player);
    recalculate(game, physical);
  }

  M.OracleV8Control = {attached, gain, gainWhile, recalculate, playerLeft};
})(globalThis.MTG ||= {});
