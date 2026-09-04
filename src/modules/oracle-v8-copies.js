// Copiable modifications use definitions; temporary grants and delayed effects
// stay on the created objects. No Oracle text parsing happens at runtime.
((M) => {
  const actions = new Set(['copy-token-v8', 'become-copy-v8']);
  // CR 205.3g-h, pinned MagicCompRules-20260819. Replacing card types removes
  // subtypes belonging to the removed types, while retaining relevant ones.
  const artifactTypes = new Set('Attraction Blood Bobblehead Book Clue Contraption Equipment Food Fortification Gold Incubator Infinity Junk Lander Map Mutagen Powerstone Spacecraft Stone Treasure Vehicle Vibranium'.split(' '));
  const enchantmentTypes = new Set('Aura Background Cartouche Case Class Curse Plan Role Room Rune Saga Shard Shrine'.split(' '));

  function modifiedDefinition(base, mod, helpers) {
    const def = {...base, types: [...(base.types || [])], subtypes: [...(base.subtypes || [])], super: [...(base.super || [])], kws: [...(base.kws || [])]};
    if (mod.name) def.name = mod.name;
    def.super = [...new Set([...def.super, ...(mod.addSuper || [])])];
    if (mod.power !== undefined) {def.power = String(mod.power); delete def.cdaPower; delete def.oracleCharacteristicPT;}
    if (mod.toughness !== undefined) {def.toughness = String(mod.toughness); delete def.cdaToughness; delete def.oracleCharacteristicPT;}
    if (mod.colors) def.colorsOverride = mod.colors.slice();
    if (mod.types) {
      def.types = mod.types.slice();
      def.subtypes = def.subtypes.filter(type => def.types.includes('Artifact') && artifactTypes.has(type) || def.types.includes('Enchantment') && enchantmentTypes.has(type));
      delete def.changeling;
    }
    if (mod.creatureSubtypes) {
      def.subtypes = def.subtypes.filter(type => !M.CREATURE_SUBTYPES.has(type)).concat(mod.creatureSubtypes);
      delete def.changeling; // CR 707.9d: do not copy the replaced characteristic's CDA.
    }
    def.types = [...new Set([...def.types, ...(mod.addTypes || [])])];
    def.subtypes = [...new Set([...def.subtypes, ...(mod.addSubtypes || [])])];
    if (mod.nonlegendary) def.super = def.super.filter(type => type !== 'Legendary');
    def.kws = [...new Set([...def.kws, ...(mod.keywords || [])])];
    if (mod.operations?.length) {
      const extra = helpers.compile(mod.operations);
      for (const [key, value] of Object.entries(extra)) {
        if (['abilities', 'triggers', 'statics', 'replace', 'mana'].includes(key)) def[key] = [...[].concat(def[key] || []), ...[].concat(value)];
        else if (key === 'kws') def.kws = [...new Set([...def.kws, ...value])];
        else def[key] = value;
      }
    }
    return def;
  }

  function applyCopy(game, card, definition, {duration = 'permanent', controller = card?.ctrl} = {}) {
    if (!card || card.zone !== 'battlefield') return null;
    if (!['permanent', 'eot', 'next-turn'].includes(duration)) throw new Error('Unknown copy duration');
    // Copying an existing permanent changes its copiable characteristics, not
    // the physical front/back faces of the object (CR 707.8). Token copies use
    // the separate face-aware creation path required by CR 707.8a.
    if (definition.oracleFaces || definition.oracleFace) {
      definition = {...definition}; delete definition.oracleFaces; delete definition.oracleFace;
    }
    let state = card.meta.oracleCopyState;
    if (!state || state.zoneVersion !== card.zoneVersion) {
      const base = card.faceDown ? card.meta.faceDownDef : card.def;
      state = card.meta.oracleCopyState = {zoneVersion: card.zoneVersion, base,
        baseCopy: card.faceDown ? null : card.isCopyOf, original: card.meta.characteristicOriginalDef || base,
        applied: null, faceDown: !!card.faceDown, lastCopyEpoch: card.copyEpoch || 0};
    }
    card.meta.characteristicOriginalDef ||= state.original;
    const layer = {kind: 'oracleCopy', oracleCopyLayer: true, iid: card.iid, zoneVersion: card.zoneVersion, definition,
      timestamp: game.oracleCopyClock = (game.oracleCopyClock || 0) + 1,
      expires: duration === 'permanent' ? 'object' : duration === 'eot' ? 'eot' : 'untilTurnOf',
      ...(duration === 'next-turn' ? {whoTurn: controller} : {})};
    game.untilEffects.push(layer);
    return layer;
  }

  function recalculate(game) {
    const permanents = game.battlefield.filter(card => card.zone === 'battlefield');
    const byId = new Map(permanents.map(card => [card.iid, card]));
    game.untilEffects = game.untilEffects.filter(effect => !effect.oracleCopyLayer || byId.get(effect.iid)?.zoneVersion === effect.zoneVersion);
    // Native entry-copy scripts also use the CardInst copy setter. A later
    // copy they create is a new effect, not a mutation of an older temporary
    // layer. Observe that exact setter epoch without interpreting Oracle text.
    for (const card of permanents) {
      const state = card.meta.oracleCopyState;
      if (state?.zoneVersion === card.zoneVersion && state.applied !== null && !card.faceDown && card.isCopyOf &&
        state.lastCopyEpoch !== card.copyEpoch) applyCopy(game, card, card.def);
    }
    const latest = new Map();
    for (const layer of game.untilEffects) if (layer.oracleCopyLayer && (!latest.has(layer.iid) || latest.get(layer.iid).timestamp < layer.timestamp)) latest.set(layer.iid, layer);
    for (const card of permanents) {
      const state = card.meta.oracleCopyState;
      if (!state || state.zoneVersion !== card.zoneVersion) continue;
      const layer = latest.get(card.iid), def = layer?.definition || state.base, copy = layer ? def : state.baseCopy;
      const key = layer?.timestamp || 0;
      // Face-down status is layer 1b, after copy effects (layer 1a). Keep the
      // underlying copied definition available for a legal turn-face-up action.
      if (card.faceDown) {
        card.meta.faceDownDef = def;
        if (state.applied !== key || !state.faceDown || card.isCopyOf) card.isCopyOf = null;
      } else if (state.applied !== key || state.faceDown || card.def !== def || card.isCopyOf !== copy) {
        card.def = def; card.isCopyOf = copy;
      }
      state.applied = key; state.faceDown = !!card.faceDown; state.lastCopyEpoch = card.copyEpoch || 0;
      if (layer || state.baseCopy) card.meta.characteristicOriginalDef = state.original;
      else if (card.meta.characteristicOriginalDef === state.original) delete card.meta.characteristicOriginalDef;
    }
  }

  function copiableSource(ctx, reference, helpers) {
    if (reference?.kind === 'paid-card') {
      const saved = ctx.oraclePaymentCapture?.cards?.[reference.index];
      return saved?.card && saved.card.zoneVersion === saved.zoneVersionAfter ? [saved.card] : [];
    }
    if (reference?.kind === 'resolved-target') return helpers.subjects(ctx, reference.index);
    if (reference === 'self') {
      if (helpers.sameSource(ctx)) return [ctx.src];
      const history = (ctx.data?.card === ctx.src && ctx.data.snap) || ctx.src?.battlefieldLKI?.get(ctx.sourceZoneVersion) || ctx.oracleSourceCapture;
      const def = history?.def || history?.copiableDef;
      return def ? [{def, isCopyOf: history.copying ? def : null, oracleFaces: history.oracleFaces, oracleFace: history.oracleFace}] : [];
    }
    if (reference === 'event-card' || reference === 'copy-reference') {
      const card = ctx.oracleSourceCapture?.eventCard || ctx.data?.card;
      if (!card) return [];
      // A death trigger copies the battlefield object, not the newly created
      // graveyard object after Clone or other copy characteristics wore off.
      if (ctx.data?.card === card && ctx.data.snap) {
        const snap = ctx.data.snap;
        return [{def: snap.def, isCopyOf: snap.copying ? snap.def : null, oracleFaces: snap.oracleFaces, oracleFace: snap.oracleFace}];
      }
      if (card.zoneVersion === ctx.eventCardZoneVersion) return [card];
      const history = card.battlefieldLKI?.get(ctx.eventCardZoneVersion), def = history?.def;
      return def ? [{def, isCopyOf: history.copying ? def : null, oracleFaces: history.oracleFaces, oracleFace: history.oracleFace}] : [];
    }
    return helpers.subjects(ctx, reference);
  }

  async function run(ctx, effect, helpers) {
    if (!actions.has(effect.action)) throw new Error('Unknown v8 copy action');
    if (effect.action === 'become-copy-v8') {
      let recipients;
      if (effect.filter) {
        const filter = helpers.target(effect.filter, [], 0, ctx.data);
        recipients = ctx.g.bf().filter(card => filter.filter(ctx.g, card, ctx.you, ctx.src));
      } else recipients = effect.target === 'copy-source' ? (helpers.sameSource(ctx) ? [ctx.src] : [])
        : effect.target === 'self' && !helpers.sameSource(ctx) ? [] : helpers.subjects(ctx, effect.target);
      recipients = recipients.filter(card => card?.zone === 'battlefield');
      if (!recipients.length) return;
      let models;
      if (effect.chooseModel) {
        const filter = helpers.target(effect.chooseModel, [], 0, ctx.data);
        const from = ctx.g.bf().filter(card => filter.filter(ctx.g, card, ctx.you, ctx.src));
        if (!from.length) return;
        models = await ctx.you.controller.decide(ctx.g, {type: 'chooseCards', from, min: 1, max: 1,
          prompt: 'Choose a permanent to become a copy of', aiHint: {kind: 'bestCard'}});
        if (!Array.isArray(models) || models.length !== 1 || !from.includes(models[0])) throw new Error('Invalid copy-model choice');
      } else models = copiableSource(ctx, effect.otherTarget, helpers);
      if (!models.length) return;
      if (models.length !== 1 || !models[0]?.def) throw new Error('Copy effect needs exactly one model');
      const model = models[0];
      if (effect.excludeModel) recipients = recipients.filter(card => card !== model);
      const mod = effect.modifications || {}, def = modifiedDefinition(model.isCopyOf || model.def, mod, helpers);
      if (mod.retainAbility) {
        const captured = ctx.oracleSourceCapture?.copiableDef || ctx.src.def;
        const ability = ctx.ability || ctx.oracleOriginTrigger || (captured.triggers || []).find(trigger => trigger.run === ctx.so?.run);
        if (!ability) throw new Error('Copy effect lacks its retained originating ability');
        const field = ctx.ability ? 'abilities' : 'triggers';
        def[field] = [...(def[field] || []), ability];
      }
      for (const recipient of recipients) applyCopy(ctx.g, recipient, def, {duration: effect.duration, controller: ctx.you});
      ctx.g.recalc();
      return;
    }
    let sources;
    if (effect.filter) {
      const filter = helpers.target(effect.filter, [], 0, ctx.data);
      sources = ctx.g.bf().filter(card => filter.filter(ctx.g, card, ctx.you, ctx.src));
      if (effect.choose && sources.length) {
        const chosen = await ctx.you.controller.decide(ctx.g, {type: 'chooseCards', from: sources, min: 1, max: 1,
          prompt: 'Choose a permanent to copy', aiHint: {kind: 'bestCard'}});
        if (!Array.isArray(chosen) || chosen.length !== 1 || !sources.includes(chosen[0])) throw new Error('Invalid permanent-copy choice');
        sources = chosen;
      }
    } else sources = copiableSource(ctx, effect.target, helpers);
    const definitions = sources.filter(card => card?.def).map(card => M.OracleV8Faces?.copyTokenDefinition
      ? M.OracleV8Faces.copyTokenDefinition(card, def => modifiedDefinition(def, effect.modifications || {}, helpers))
      : modifiedDefinition(card.isCopyOf || card.def, effect.modifications || {}, helpers));
    const players = effect.who === 'each-player' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you) : effect.who === 'each-opponent' ? ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you).filter(player => player !== ctx.you) : helpers.subjects(ctx, effect.who || 'you');
    const n = helpers.amount(effect.n, ctx), made = [];
    await ctx.g.withBattlefieldEntryBatch(async () => {
      const copies = definitions.flatMap(def => Array.from({length: n}, () => def));
      for (const player of players) made.push(...await ctx.g.makeTokens(copies, player, {
        copyOf: true, tapped: !!effect.tapped, ...(effect.haste && !effect.hasteUntilNextTurn ? {entryMeta: {[effect.hasteUntilEot ? 'tempHaste' : 'oracleHaste']: true}} : {}),
        ...(effect.attacking ? {chooseAttacking: (game, token) => game.chooseAttackingDestination(player, null, token, ctx.src.name)} : {}),
      }));
    });
    if (effect.hasteUntilNextTurn && made.length) {
      const entries = made.map(card => ({iid: card.iid, zoneVersion: card.zoneVersion}));
      ctx.g.untilEffects.push({kind: 'copyHasteUntilNextTurn', expires: 'untilTurnOf', whoTurn: ctx.you,
        apply: (game, battlefield) => {
          for (const entry of entries) {
            const card = battlefield.find(candidate => candidate.iid === entry.iid && candidate.zoneVersion === entry.zoneVersion);
            if (card) card.cur.kw.add('haste');
          }
        }});
      ctx.g.recalc();
    }
    if (effect.delayed && made.length) {
      const entries = made.map(card => ({card, zoneVersion: card.zoneVersion, controller: card.ctrl}));
      ctx.g.delayed.push({on: effect.delayed.on, src: ctx.src, ctrl: ctx.you, name: 'Copied tokens — ' + effect.delayed.action,
        ...(effect.delayed.your ? {filter: (game, data) => data?.player === ctx.you} : {}),
        run: async delayedCtx => {
          const live = entries.filter(entry => entry.card.zone === 'battlefield' && entry.card.zoneVersion === entry.zoneVersion);
          if (effect.delayed.action === 'exile') await delayedCtx.g.exileMany(live.map(entry => entry.card));
          else for (const player of players) await delayedCtx.g.sacrificeMany(player, live.filter(entry => entry.controller === player && entry.card.ctrl === player).map(entry => entry.card));
        }});
    }
  }

  async function asEnters(game, card, operation, helpers) {
    const pool = operation.filter.zone === 'graveyard' ? game.players.flatMap(player => player.graveyard) : game._battlefieldEntryReplacementSnapshot || game.bf();
    const filter = helpers.target(operation.filter, [], 0).filter;
    const from = pool.filter(candidate => candidate !== card && filter(game, candidate, card.ctrl, card));
    if (!from.length) return;
    const chosen = await card.ctrl.controller.decide(game, {type: 'chooseCards', from, min: 0, max: 1,
      prompt: 'Choose a permanent or card to copy as this enters', aiHint: {kind: 'bestCard'}, source: card, player: card.ctrl});
    if (!Array.isArray(chosen) || chosen.length > 1 || chosen.some(candidate => !from.includes(candidate))) throw new Error('Invalid entry-copy choice');
    if (!chosen.length) return;
    const def = modifiedDefinition(chosen[0].isCopyOf || chosen[0].def, operation.modifications || {}, helpers);
    const layer = applyCopy(game, card, def);
    game.recalc();
    // Tapped entry is an additional event instruction, not a copiable value.
    // A further as-enters copy overwrites this temporary definition too.
    if (operation.tapped) card.def = {...layer.definition, entersTapped: true};
  }

  M.OracleV8Copies = {actions, run, asEnters, applyCopy, recalculate, modifiedDefinition};
})(globalThis.MTG ||= {});
