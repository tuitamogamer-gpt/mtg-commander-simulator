// ===== scripts-sultai.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;

  const etbSelf = (g, self, data) => data.card === self;
  const attacksSelf = (g, self, data) => data.card === self;
  const isLand = card => !!card && card.is('Land');
  const isCreature = card => !!card && card.is('Creature');
  const isLegendary = card => !!card && (card.def.super || []).includes('Legendary');
  const ownGy = (filter, opts = {}) => Object.assign({
    zone: 'graveyard', what: 'card', prompt: 'Choose a card from your graveyard',
    filter: (g, card, ctrl) => card.owner === ctrl && (!filter || filter(card)),
    aiHint: { kind: 'gyRecur' },
  }, opts);
  const anyGy = (filter, opts = {}) => Object.assign({
    zone: 'graveyard', what: 'card', anyGraveyard: true, prompt: 'Choose a card from a graveyard',
    filter: (g, card) => !filter || filter(card), aiHint: { kind: 'gyRecur' },
  }, opts);
  const token = (name, subtypes, power, toughness, colors, kws = []) => ({
    name, cost: null, super: [], types: ['Creature'], subtypes,
    power: String(power), toughness: String(toughness), oracle: '', kws,
    colorsOverride: colors, isTokenDef: true,
  });
  const zombieDruid = TK.sultaiZombieDruid ||= token('Zombie Druid', ['Zombie', 'Druid'], 2, 2, ['B']);
  const insect = token('Insect', ['Insect'], 1, 1, ['G']);
  const salamander = TK.sultaiSalamander ||= token('Salamander Warrior', ['Salamander', 'Warrior'], 4, 3, ['U']);

  async function chooseCards(game, player, pool, min, max, prompt, aiHint) {
    if (!pool.length || max <= 0) return [];
    const picked = await player.controller.decide(game, {
      type: 'chooseCards', from: pool, min, max: Math.min(max, pool.length), prompt,
      aiHint: aiHint || { kind: 'bestCard' },
    });
    return Array.isArray(picked) ? [...new Set(picked)].filter(card => pool.includes(card)).slice(0, max) : [];
  }

  async function chooseOne(game, player, pool, prompt, aiHint, optional = false) {
    return (await chooseCards(game, player, pool, optional ? 0 : 1, 1, prompt, aiHint))[0] || null;
  }

  async function chooseOption(game, player, prompt, options, aiHint) {
    const key = await player.controller.decide(game, { type: 'chooseOption', prompt, options, aiHint });
    return options.some(option => option.key === key) ? key : options[0].key;
  }

  async function putIntoGraveyardBatch(game, cards) {
    await game.withGraveyardEntryBatch(async () => {
      for (const card of cards) if (card.zone === 'library') await game.move(card, 'graveyard');
    });
  }

  async function topChoiceRestGraveyard(game, player, n, predicate, prompt, optional = true) {
    const top = player.library.slice(-n);
    const eligible = top.filter(card => !predicate || predicate(card));
    const chosen = await chooseOne(game, player, eligible, prompt, { kind: 'bestCard' }, optional);
    if (chosen) await game.move(chosen, 'hand');
    await putIntoGraveyardBatch(game, top.filter(card => card.zone === 'library'));
    return chosen;
  }

  async function searchBasicTypes(game, player, n, types, tapped) {
    return E.searchBasic(game, player, {
      n, tapped, filter: def => types.some(type => (def.subtypes || []).includes(type)),
      prompt: `Choose a basic ${types.join(', ')}`,
    });
  }

  function addZombieIdentity(game, card) {
    if (!card || card.zone !== 'battlefield') return;
    const original = card.def;
    card.meta.characteristicOriginalDef = original;
    card.def = Object.assign({}, original, {
      subtypes: [...new Set([...(original.subtypes || []), 'Zombie'])],
      colorsOverride: [...new Set([...(card.colors || []), 'B'])],
    });
    game.recalc();
  }

  async function reanimate(game, player, card, opts = {}) {
    if (!card || card.zone !== 'graveyard' || !card.is('Creature')) return false;
    await game.move(card, 'battlefield', { ctrl: player, tapped: !!opts.tapped });
    if (opts.zombie) addZombieIdentity(game, card);
    return card.zone === 'battlefield';
  }

  function cleanupKotisGrants(game, sourceIid) {
    for (const owner of game.players) for (const zone of ['graveyard', 'hand', 'library', 'exile', 'command']) {
      for (const card of owner[zone]) {
        const grant = card.meta && card.meta._kotisGrant;
        if (!grant || grant.sourceIid !== sourceIid) continue;
        card.def = grant.baseDef;
        delete card.meta._kotisGrant;
      }
    }
  }

  function syncKotisGrants(game, source) {
    cleanupKotisGrants(game, source.iid);
    if (source.zone !== 'battlefield' || source.meta._kotisCastTurn === game.turnNo || game.turnPlayer !== source.ctrl) return;
    const player = source.ctrl;
    for (const card of player.graveyard) {
      if (!card.is('Creature') || player.graveyard.filter(other => other !== card).length < 3) continue;
      const baseDef = card.def;
      const sourceIid = source.iid;
      card.meta._kotisGrant = { sourceIid, baseDef };
      card.def = Object.assign({}, baseDef, {
        flashback: { altCostStr: baseDef.cost, kotis: true, label: `Cast ${card.name} from your graveyard` },
        prepareTargets: async castCtx => {
          if (baseDef.prepareTargets && await baseDef.prepareTargets(castCtx) === false) return false;
          if (!castCtx.so.castOpts.kotis) return true;
          const live = castCtx.g.byIid(sourceIid);
          if (!live || live.zone !== 'battlefield' || live.ctrl !== castCtx.you ||
            live.meta._kotisCastTurn === castCtx.g.turnNo) return false;
          const pool = castCtx.you.graveyard.filter(other => other !== castCtx.src);
          const picked = await chooseCards(castCtx.g, castCtx.you, pool, 3, 3,
            `Kotis: exile three other cards to cast ${castCtx.src.name}`, { kind: 'delve', card: castCtx.src });
          if (picked.length !== 3) return false;
          await castCtx.g.moveGraveyardBatch(picked, 'exile');
          live.meta._kotisCastTurn = castCtx.g.turnNo;
          castCtx.src.def = baseDef;
          delete castCtx.src.meta._kotisGrant;
          cleanupKotisGrants(castCtx.g, sourceIid);
          return true;
        },
      });
    }
  }

  SC['Kotis, Sibsig Champion'] = {
    statics: [{ apply: (game, self) => { syncKotisGrants(game, self); } }],
    triggers: [{
      on: 'etb', desc: 'Two +1/+1 counters',
      filter: (game, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature') &&
        (data.card.meta._enteredFromZone === 'graveyard' || data.card.castMeta && data.card.castMeta.from === 'graveyard'),
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 2, false, ctx.you); },
    }, {
      on: 'lto', zone: 'self', desc: 'Remove graveyard cast permission', filter: (g, self, data) => data.card === self,
      run: async ctx => { cleanupKotisGrants(ctx.g, ctx.src.iid); },
    }],
  };

  SC.Gravecrawler = {
    statics: [{ apply: (game, self) => { self.cur.cantBlock = true; } }],
    flashback: { altCostStr: '{B}', label: 'Cast Gravecrawler from your graveyard' },
    castCond: (game, player, card) => card.zone !== 'graveyard' || game.creatures(player).some(creature => creature.hasSub('Zombie')),
  };

  SC['Hedron Crab'] = { triggers: [{
    on: 'landfall', desc: 'Target player mills three', filter: (g, self, data) => data.card.ctrl === self.ctrl,
    targets: [T.player({ prompt: 'Player to mill three', aiHint: { goal: 'mill' } })],
    run: async ctx => { if (ctx.targets[0]) await ctx.g.mill(ctx.targets[0], 3); },
  }] };

  SC["Stitcher's Supplier"] = { triggers: [
    { on: 'etb', desc: 'Mill three', filter: etbSelf, run: async ctx => { await ctx.g.mill(ctx.you, 3); } },
    { on: 'dies', zone: 'self', desc: 'Mill three', filter: (g, self, data) => data.card === self, run: async ctx => { await ctx.g.mill(ctx.you, 3); } },
  ] };

  SC['Dauthi Voidwalker'] = {
    opponentGraveyardVoid: true,
    abilities: [{
      label: 'Play a void-exiled card for free', cost: { tap: true, sacSelf: true },
      cond: (game, self, player) => game.players.some(owner => owner.exile.some(card => card.counters.void && card.owner !== player)),
      run: async ctx => {
        const pool = ctx.g.players.flatMap(owner => owner.exile).filter(card => card.owner !== ctx.you && (card.counters.void || 0) > 0);
        const chosen = await chooseOne(ctx.g, ctx.you, pool, 'Choose a void-exiled card to play for free',
          { kind: 'freeCast', cards: pool }, true);
        if (!chosen) return;
        chosen.meta.playableBy = ctx.you;
        chosen.meta.playableUntil = ctx.g.turnNo;
        chosen.meta.freePlay = !chosen.is('Land');
        chosen.meta.anyColor = true;
      }, aiScore: game => game.players.flatMap(owner => owner.exile).some(card => card.counters.void) ? 9 : 0,
    }],
  };

  SC['Kishla Skimmer'] = { triggers: [{
    on: 'cardLeftGraveyard', desc: 'Draw once each turn', oncePerTurn: true,
    filter: (game, self, data) => game.turnPlayer === self.ctrl && data.card.owner === self.ctrl,
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }] };

  SC.Millikin = { mana: {
    manual: true, cost: { tap: true, mill: 1 }, produce: [{ C: 1 }],
    cond: (game, card, player) => player.library.length > 0,
  } };

  SC['Reassembling Skeleton'] = { gyAbility: {
    label: 'Return tapped', cost: '{1}{B}', exileSelf: false,
    run: async ctx => { if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'battlefield', { ctrl: ctx.you, tapped: true }); },
  } };

  SC['Shigeki, Jukai Visionary'] = {
    abilities: [{
      label: 'Return Shigeki and reveal four', cost: { mana: '{1}{G}', tap: true, returnSelf: true },
      run: async ctx => {
        const top = ctx.you.library.slice(-4);
        const land = await chooseOne(ctx.g, ctx.you, top.filter(isLand), 'Choose a land to put onto the battlefield tapped',
          { kind: 'bestLand' }, true);
        if (land) await ctx.g.move(land, 'battlefield', { ctrl: ctx.you, tapped: true });
        await putIntoGraveyardBatch(ctx.g, top.filter(card => card.zone === 'library'));
      }, aiScore: () => 5,
    }],
    handAbility: {
      label: 'Channel', cost: '{X}{G}{G}', xCost: true,
      maxX: (game, card, player) => player.graveyard.filter(other => other !== card && !isLegendary(other)).length,
      targets: (game, card, opts) => [ownGy(other => other !== card && !isLegendary(other), {
        count: opts.xVal || 0, min: opts.xVal || 0, distinct: true,
        prompt: `Choose ${opts.xVal || 0} nonlegendary cards to return`,
      })],
      run: async ctx => {
        const picked = (ctx.targets[0] || []).filter(card => card.zone === 'graveyard' && !isLegendary(card));
        await ctx.g.moveGraveyardBatch(picked, 'hand');
      },
    },
  };

  SC['Skull Prophet'] = {
    mana: { cost: { tap: true }, produce: [{ B: 1 }, { G: 1 }] },
    abilities: [{ label: 'Mill two', cost: { tap: true }, run: async ctx => { await ctx.g.mill(ctx.you, 2); }, aiScore: () => 2 }],
  };

  SC['Floral Evoker'] = {
    triggers: [{ on: 'landfall', desc: '+1/+1 counter', filter: (g, self, data) => data.card.ctrl === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); } }],
    abilities: [{
      label: 'Discard a creature: return a land tapped',
      cost: { mana: '{G}', discard: { n: 1, filter: (game, card) => card.is('Creature') } },
      cond: (game, self, player) => player.hand.some(card => card.is('Creature')) && player.graveyard.some(isLand),
      targets: [ownGy(isLand)], run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'battlefield', { ctrl: ctx.you, tapped: true }); },
      aiScore: () => 5,
    }],
  };

  SC['Nyx Weaver'] = {
    triggers: [{ on: 'upkeep', desc: 'Mill two', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await ctx.g.mill(ctx.you, 2); } }],
    abilities: [{
      label: 'Exile Nyx Weaver: return a card', cost: { mana: '{1}{B}{G}', exileSelf: true }, targets: [ownGy()],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); }, aiScore: () => 6,
    }],
  };

  SC['Amphin Mutineer'] = {
    triggers: [{
      on: 'etb', desc: 'Exile a non-Salamander creature', opt: true, filter: etbSelf,
      targets: [T.creature({ filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && !card.hasSub('Salamander'),
        upTo: true, prompt: 'Non-Salamander creature to exile', aiHint: { goal: 'removal' } })],
      run: async ctx => { const target = ctx.targets[0]; if (!target) return; const ctrl = target.ctrl; await ctx.g.move(target, 'exile'); await ctx.g.makeTokens(salamander, ctrl); },
    }],
    gyAbility: {
      label: 'Encore {4}{U}{U}', cost: '{4}{U}{U}', sorcery: true,
      run: async ctx => {
        const made = [];
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          const copies = await ctx.g.copyPermanentToken(ctx.src, ctx.you, { haste: true, attacking: opponent });
          for (const copy of copies) { copy.meta.mustAttackPlayer = opponent; made.push(copy); }
        }
        if (made.length) ctx.g.delayed.push({
          on: 'endStep', name: 'Encore sacrifice', ctrl: ctx.you,
          run: async delayed => { await delayed.g.sacrificeMany(delayed.you, made.filter(card => card.zone === 'battlefield')); },
        });
      },
    },
  };

  SC['Disciple of Bolas'] = { triggers: [{
    on: 'etb', desc: 'Sacrifice another creature', filter: etbSelf,
    run: async ctx => {
      const target = await chooseOne(ctx.g, ctx.you, ctx.g.creatures(ctx.you).filter(card => card !== ctx.src && ctx.g.canSacrifice(card)),
        'Choose another creature to sacrifice', { kind: 'sacCost', src: ctx.src });
      if (!target) return;
      const power = Math.max(0, target.power);
      if (await ctx.g.sacrifice(ctx.you, target)) { await ctx.g.gainLife(ctx.you, power); await ctx.g.draw(ctx.you, power); }
    },
  }] };

  SC['Jarad, Golgari Lich Lord'] = {
    cdaPower: (game, card) => 2 + card.owner.graveyard.filter(isCreature).length,
    cdaToughness: (game, card) => 2 + card.owner.graveyard.filter(isCreature).length,
    abilities: [{
      label: 'Sacrifice another creature: each opponent loses its power', cost: { mana: '{1}{B}{G}', sacCreature: true, sacOther: true },
      run: async ctx => { const power = Math.max(0, ctx.sacd && ctx.sacd[0] ? Number(ctx.sacd[0].power) || 0 : 0); for (const opponent of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(opponent, power, ctx.src.name); },
      aiScore: () => 6,
    }],
    gyAbility: {
      label: 'Sacrifice a Swamp and Forest: return to hand', cost: '{0}', exileSelf: false,
      extraCost: { sacGroups: [
        { label: 'a Swamp', filter: (game, land) => land.is('Land') && land.hasSub('Swamp') },
        { label: 'a Forest', filter: (game, land) => land.is('Land') && land.hasSub('Forest') },
      ] },
      run: async ctx => { if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'hand'); },
    },
  };

  SC['Meren of Clan Nel Toth'] = { triggers: [{
    on: 'dies', desc: 'Experience counter', filter: (g, self, data) => data.snap.ctrl === self.ctrl && data.card !== self,
    run: async ctx => { ctx.you.experienceCounters = (ctx.you.experienceCounters || 0) + 1; },
  }, {
    on: 'endStep', desc: 'Return a creature from your graveyard', filter: (g, self, data) => data.player === self.ctrl,
    targets: [ownGy(isCreature)], run: async ctx => {
      const card = ctx.targets[0]; if (!card) return;
      if (card.mv <= (ctx.you.experienceCounters || 0)) await reanimate(ctx.g, ctx.you, card);
      else await ctx.g.move(card, 'hand');
    },
  }] };

  SC['Steward of the Harvest'] = { triggers: [{
    on: 'etb', desc: 'Exile up to three lands', filter: etbSelf,
    targets: [ownGy(isLand, { count: 3, upTo: true, distinct: true })],
    run: async ctx => {
      const cards = (ctx.targets[0] || []).filter(card => card && card.zone === 'graveyard').slice(0, 3);
      await ctx.g.moveGraveyardBatch(cards, 'exile');
      ctx.src.meta.harvestLands = cards.map(card => card.iid);
    },
  }], statics: [{ apply: (game, self, battlefield) => {
    const lands = (self.meta.harvestLands || []).map(iid => game.byIid(iid)).filter(Boolean);
    for (const creature of battlefield.filter(card => card.ctrl === self.ctrl && card.is('Creature'))) {
      creature.cur.extraAbilities = creature.cur.extraAbilities || [];
      creature.cur.extraMana = creature.cur.extraMana || [];
      for (const land of lands) {
        creature.cur.extraAbilities.push(...(land.def.abilities || []));
        const mana = land.def.mana ? (Array.isArray(land.def.mana) ? land.def.mana : [land.def.mana]) : [];
        creature.cur.extraMana.push(...mana);
      }
    }
  } }] };

  SC['Teval, the Balanced Scale'] = { triggers: [{
    on: 'attacks', desc: 'Mill three and return a land tapped', filter: attacksSelf,
    run: async ctx => {
      await ctx.g.mill(ctx.you, 3);
      const land = await chooseOne(ctx.g, ctx.you, ctx.you.graveyard.filter(isLand), 'Choose a land to return tapped', { kind: 'gyRecur' }, true);
      if (land) await ctx.g.move(land, 'battlefield', { ctrl: ctx.you, tapped: true });
    },
  }, {
    on: 'cardsLeftGraveyard', desc: 'Create a Zombie Druid',
    filter: (g, self, data) => data.cards.some(card => card.owner === self.ctrl),
    run: async ctx => { await ctx.g.makeTokens(zombieDruid, ctx.you); },
  }] };

  SC['Timeless Witness'] = {
    eternalize: { cost: '{5}{G}{G}' },
    triggers: [{ on: 'etb', desc: 'Return a card from your graveyard', filter: etbSelf, targets: [ownGy()],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); } }],
  };

  SC.Wonder = { graveyardStatics: [{
    cond: (game, source, player) => game.lands(player).some(land => land.hasSub('Island')),
    apply: (game, source, battlefield, player) => {
      for (const creature of battlefield.filter(card => card.ctrl === player && card.is('Creature'))) {
        creature.cur.kw.add('flying');
      }
    },
  }] };

  SC['Consuming Aberration'] = {
    cdaPower: (game, card) => game.players.filter(player => player !== card.ctrl).reduce((sum, player) => sum + player.graveyard.length, 0),
    cdaToughness: (game, card) => game.players.filter(player => player !== card.ctrl).reduce((sum, player) => sum + player.graveyard.length, 0),
    triggers: [{ on: 'cast', desc: 'Each opponent mills through a land', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { for (const opponent of E.eachOpp(ctx.g, ctx.you)) { const moved = []; while (opponent.library.length) { const card = opponent.library.at(-1); moved.push(card); if (card.is('Land')) break; opponent.library.pop(); } await putIntoGraveyardBatch(ctx.g, moved); } } }],
  };

  SC['Diviner of Mist'] = { triggers: [{
    on: 'attacks', desc: 'Mill four and cast an instant or sorcery for free', filter: attacksSelf,
    run: async ctx => {
      await ctx.g.mill(ctx.you, 4);
      const pool = ctx.you.graveyard.filter(card => (card.is('Instant') || card.is('Sorcery')) && card.mv <= 4);
      const card = await chooseOne(ctx.g, ctx.you, pool, 'Choose an instant or sorcery to cast for free', { kind: 'freeCast', cards: pool }, true);
      if (!card) return;
      card.meta.exileIfStackLeaves = true;
      await ctx.g.castSpell(ctx.you, card, { from: 'graveyard', free: true, exileAfter: true });
    },
  }] };

  SC['Junji, the Midnight Sky'] = { triggers: [{
    on: 'dies', zone: 'self', desc: 'Choose Junji death mode', filter: (g, self, data) => data.card === self,
    run: async ctx => {
      const mode = await chooseOption(ctx.g, ctx.you, 'Junji death trigger', [
        { key: 'discard', label: 'Each opponent discards two and loses 2 life' },
        { key: 'reanimate', label: 'Reanimate a non-Dragon creature and lose 2 life' },
      ], { kind: 'mode', card: ctx.src });
      if (mode === 'discard') {
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          const picked = await chooseCards(ctx.g, opponent, opponent.hand, Math.min(2, opponent.hand.length), 2, 'Discard two cards', { kind: 'discard' });
          await ctx.g.discard(opponent, picked); await ctx.g.loseLife(opponent, 2, ctx.src.name);
        }
      } else {
        const pool = ctx.g.players.flatMap(player => player.graveyard).filter(card => card.is('Creature') && !card.hasSub('Dragon'));
        const card = await chooseOne(ctx.g, ctx.you, pool, 'Choose a non-Dragon creature to reanimate', { kind: 'gyRecur' });
        if (card) { await reanimate(ctx.g, ctx.you, card); await ctx.g.loseLife(ctx.you, 2, ctx.src.name); }
      }
    },
  }] };

  SC['Lord of Extinction'] = {
    cdaPower: game => game.players.reduce((sum, player) => sum + player.graveyard.length, 0),
    cdaToughness: game => game.players.reduce((sum, player) => sum + player.graveyard.length, 0),
  };

  SC['Ob Nixilis, the Fallen'] = { triggers: [{
    on: 'landfall', desc: 'Target player loses 3 life', opt: true, filter: (g, self, data) => data.card.ctrl === self.ctrl,
    targets: [T.player({ prompt: 'Player to lose 3 life', aiHint: { goal: 'damage' } })],
    run: async ctx => { if (!ctx.targets[0]) return; await ctx.g.loseLife(ctx.targets[0], 3, ctx.src.name); if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 3, false, ctx.you); },
  }] };

  SC['River Kelpie'] = { persist: true, triggers: [{
    on: 'etb', desc: 'Draw for a permanent entering from a graveyard',
    filter: (g, self, data) => ['Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'].some(type => data.card.is(type)) &&
      (data.card.meta._enteredFromZone === 'graveyard' || data.card.castMeta && data.card.castMeta.from === 'graveyard'),
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }, {
    on: 'cast', desc: 'Draw for a spell cast from a graveyard', filter: (g, self, data) => data.from === 'graveyard',
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }] };

  SC['Lord of the Forsaken'] = {
    abilities: [{
      label: 'Sacrifice another creature: target player mills three', cost: { mana: '{B}', sacCreature: true, sacOther: true },
      targets: [T.player({ prompt: 'Player to mill three', aiHint: { goal: 'mill' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.mill(ctx.targets[0], 3); }, aiScore: () => 4,
    }],
    mana: {
      manual: true, cost: { life: 1 }, produce: [{ C: 1 }],
      restrict: (game, action) => action && action.card && action.card.zone === 'graveyard',
    },
  };

  SC['Noxious Gearhulk'] = { triggers: [{
    on: 'etb', desc: 'Destroy another creature', opt: true, filter: etbSelf,
    targets: [T.creature({ filter: (g, card, ctrl, self) => card.zone === 'battlefield' && card.is('Creature') && card !== self,
      upTo: true, prompt: 'Another creature to destroy', aiHint: { goal: 'removal' } })],
    run: async ctx => { const card = ctx.targets[0]; if (!card) return; const toughness = Math.max(0, card.toughness); if (await ctx.g.destroy(card)) await ctx.g.gainLife(ctx.you, toughness); },
  }] };

  SC['Tasigur, the Golden Fang'] = {
    altCosts: [{ label: 'Delve', delve: true }],
    abilities: [{
      label: 'Mill two, then an opponent returns a nonland card', cost: { mana: '{2}{G/U}{G/U}' },
      run: async ctx => {
        await ctx.g.mill(ctx.you, 2);
        const pool = ctx.you.graveyard.filter(card => !card.is('Land'));
        if (!pool.length) return;
        const opponent = await E.chooseOpponent(ctx.g, ctx.you, { prompt: 'Choose the opponent who selects the card', goal: 'choice' });
        if (!opponent) return;
        const card = await chooseOne(ctx.g, opponent, pool, `Choose a nonland card for ${ctx.you.name}`, { kind: 'opponentChoice' });
        if (card && card.zone === 'graveyard') await ctx.g.move(card, 'hand');
      }, aiScore: () => 6,
    }],
  };

  SC['Colossal Grave-Reaver'] = { triggers: [{
    on: 'etb', desc: 'Mill three', filter: etbSelf, run: async ctx => { await ctx.g.mill(ctx.you, 3); },
  }, {
    on: 'attacks', desc: 'Mill three', filter: attacksSelf, run: async ctx => { await ctx.g.mill(ctx.you, 3); },
  }, {
    on: 'cardsToGraveyard', desc: 'Put one milled creature onto the battlefield',
    filter: (g, self, data) => data.cards.some((card, index) => card.owner === self.ctrl && data.froms[index] === 'library' && card.is('Creature')),
    run: async ctx => {
      const pool = ctx.data.cards.filter((card, index) => card.zone === 'graveyard' && card.owner === ctx.you && ctx.data.froms[index] === 'library' && card.is('Creature'));
      const chosen = await chooseOne(ctx.g, ctx.you, pool, 'Choose a milled creature to put onto the battlefield', { kind: 'gyRecur' });
      if (chosen) await reanimate(ctx.g, ctx.you, chosen);
    },
  }] };

  SC['Necropolis Fiend'] = {
    altCosts: [{ label: 'Delve', delve: true }],
    abilities: [{
      label: 'Exile X cards: target creature gets -X/-X', cost: { tap: true, exileFromGY: { n: 'X' } },
      cond: (game, self, player) => player.graveyard.length > 0 && game.creatures().length > 0,
      targets: [T.creature({ prompt: 'Creature to get -X/-X', aiHint: { goal: 'removal' } })],
      run: async ctx => {
        const x = ctx.x || 0;
        if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], -x, -x);
      }, aiScore: () => 7,
    }],
  };

  SC['Grapple with the Past'] = { resolve: async ctx => {
    await ctx.g.mill(ctx.you, 3);
    const card = await chooseOne(ctx.g, ctx.you, ctx.you.graveyard.filter(card => card.is('Creature') || card.is('Land')),
      'Choose a creature or land to return', { kind: 'gyRecur' }, true);
    if (card) await ctx.g.move(card, 'hand');
  } };

  SC['Grisly Salvage'] = { resolve: async ctx => {
    await topChoiceRestGraveyard(ctx.g, ctx.you, 5, card => card.is('Creature') || card.is('Land'),
      'Choose a creature or land to put into your hand');
  } };

  SC['Forbidden Alchemy'] = {
    flashback: { altCostStr: '{6}{B}', label: 'Flashback {6}{B}' },
    resolve: async ctx => { await topChoiceRestGraveyard(ctx.g, ctx.you, 4, null, 'Choose a card to put into your hand', false); },
  };

  SC['Life from the Loam'] = {
    dredge: 3,
    targets: [ownGy(isLand, { count: 3, upTo: true, distinct: true })],
    resolve: async ctx => { await ctx.g.moveGraveyardBatch((ctx.targets[0] || []).filter(Boolean), 'hand'); },
  };

  SC.Victimize = {
    addlCost: { sacCreature: true },
    targets: [ownGy(isCreature, { count: 2, distinct: true })],
    resolve: async ctx => { for (const card of (ctx.targets[0] || [])) await reanimate(ctx.g, ctx.you, card, { tapped: true }); },
  };

  SC['Welcome the Dead'] = {
    flashback: { altCostStr: '{5}{B}', label: 'Flashback {5}{B}' },
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      const picked = await chooseCards(ctx.g, ctx.you, ctx.you.hand, Math.min(1, ctx.you.hand.length), 1, 'Discard a card', { kind: 'discard' });
      if (picked.length) await ctx.g.discard(ctx.you, picked);
      await ctx.g.loseLife(ctx.you, 2, ctx.src.name);
      const n = ctx.you.turnState.cardsFromHandLibraryToGraveyard || 0;
      if (n) await ctx.g.makeTokens(zombieDruid, ctx.you, { n, tapped: true });
    },
  };

  SC['Living Death'] = { resolve: async ctx => {
    const exiled = new Map();
    for (const player of ctx.g.players) {
      const creatures = player.graveyard.filter(isCreature).slice();
      exiled.set(player, await ctx.g.moveGraveyardBatch(creatures, 'exile'));
    }
    const allCreatures = ctx.g.creatures().slice();
    const previous = ctx.g._simultaneousLeaveSources;
    const batch = allCreatures.map(card => ({ card, ctrl: card.ctrl }));
    ctx.g._simultaneousLeaveSources = previous ? previous.concat(batch) : batch;
    try {
      await ctx.g.withGraveyardEntryBatch(async () => {
        for (const card of allCreatures) if (ctx.g.canSacrifice(card)) {
          const controller = card.ctrl;
          ctx.g.lg(`${controller.name} sacrifices ${card.name}.`, 'sac');
          await ctx.g.move(card, 'graveyard');
          await ctx.g.emit('sacrificed', { player: controller, card });
        }
      });
    } finally {
      ctx.g._simultaneousLeaveSources = previous;
    }
    const returns = [];
    for (const player of ctx.g.players) for (const card of exiled.get(player) || []) {
      if (card.zone === 'exile') returns.push({ card, opts: { ctrl: player } });
    }
    await ctx.g.moveBattlefieldBatch(returns);
  } };

  SC['Will of the Sultai'] = {
    altCosts: [{
      label: 'Choose both — control a commander', altCostStr: '{4}{G}', commanderBoth: true,
      cond: (game, player) => game.bf().some(card => card.ctrl === player && card.commander),
    }],
    modes: { pick: (game, player, card, castOpts) => castOpts.commanderBoth ? 2 : 1, list: [
      { label: 'Mill three and return all lands tapped', targets: [T.player({ prompt: 'Player to mill three', aiHint: { goal: 'mill' } })] },
      { label: 'Put counters on a creature and give it trample', targets: [T.creature({ prompt: 'Creature to strengthen', aiHint: { goal: 'buff' } })] },
    ] },
    resolve: async ctx => {
      let index = 0;
      if (ctx.mode.includes(0)) {
        const player = ctx.targets[index++]; if (player) await ctx.g.mill(player, 3);
        const lands = ctx.you.graveyard.filter(isLand).slice();
        for (const land of lands) await ctx.g.move(land, 'battlefield', { ctrl: ctx.you, tapped: true });
      }
      if (ctx.mode.includes(1)) {
        const creature = ctx.targets[index]; if (creature) { ctx.g.addCounters(creature, '+1/+1', ctx.g.lands(ctx.you).length, false, ctx.you); E.grantUntilEOT(ctx.g, creature, ['trample']); }
      }
    },
  };

  SC['Necromantic Selection'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const before = new Set(ctx.g.creatures());
      await ctx.g.destroyMany([...before]);
      const pool = [...before].filter(card => card.zone === 'graveyard');
      const chosen = await chooseOne(ctx.g, ctx.you, pool, 'Choose a creature destroyed this way', { kind: 'gyRecur' }, true);
      if (chosen) { await reanimate(ctx.g, ctx.you, chosen); addZombieIdentity(ctx.g, chosen); }
    },
  };

  SC['Afterlife from the Loam'] = {
    altCosts: [{ label: 'Delve', delve: true }],
    targets: (game, source, castOpts, player) => game.players.map(owner => anyGy(card => card.is('Creature') && card.owner === owner,
      { upTo: true, prompt: `Up to one creature from ${owner.name}'s graveyard` })),
    resolve: async ctx => { for (const card of ctx.targets.flat().filter(Boolean)) { await reanimate(ctx.g, ctx.you, card); addZombieIdentity(ctx.g, card); } },
  };

  SC['Essence Anchor'] = {
    triggers: [{ on: 'upkeep', desc: 'Surveil one', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); } }, {
      on: 'cardsLeftGraveyard', desc: 'Record that a card left the graveyard',
      filter: (g, self, data) => data.cards.some(card => card.owner === self.ctrl),
      run: async ctx => { ctx.you.turnState.cardLeftGraveyard = true; },
    }, {
      on: 'cardLeftGraveyard', desc: 'Record a graveyard spell cast',
      filter: (g, self, data) => data.to === 'stack' && data.card.owner === self.ctrl,
      run: async ctx => { ctx.you.turnState.cardLeftGraveyard = true; },
    }],
    abilities: [{
      label: 'Create a Zombie Druid', cost: { tap: true },
      cond: (game, self, player) => game.turnPlayer === player && !!player.turnState.cardLeftGraveyard,
      run: async ctx => { await ctx.g.makeTokens(zombieDruid, ctx.you); }, aiScore: () => 4,
    }],
  };

  SC['Phyrexian Reclamation'] = { abilities: [{
    label: 'Return a creature to your hand', cost: { mana: '{1}{B}', life: 2 }, targets: [ownGy(isCreature)],
    run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); }, aiScore: () => 5,
  }] };

  SC['Crawling Sensation'] = { triggers: [{
    on: 'upkeep', desc: 'Mill two', opt: true, filter: (g, self, data) => data.player === self.ctrl,
    run: async ctx => { await ctx.g.mill(ctx.you, 2); },
  }, {
    on: 'cardsToGraveyard', desc: 'Create an Insect once each turn',
    filter: (g, self, data) => self.meta._landGraveTurn !== g.turnNo && data.cards.some(card => card.owner === self.ctrl && card.is('Land')),
    run: async ctx => { ctx.src.meta._landGraveTurn = ctx.g.turnNo; await ctx.g.makeTokens(insect, ctx.you); },
  }] };

  async function judgmentReward(ctx) {
    if (ctx.src.meta._judgmentTurn !== ctx.g.turnNo) { ctx.src.meta._judgmentTurn = ctx.g.turnNo; ctx.src.meta._judgmentModes = []; }
    const used = ctx.src.meta._judgmentModes || [];
    const options = [{ key: 'draw', label: 'Draw a card' }, { key: 'treasure', label: 'Create a Treasure' }, { key: 'zombie', label: 'Create a Zombie Druid' }]
      .filter(option => !used.includes(option.key));
    if (!options.length) return;
    const mode = await chooseOption(ctx.g, ctx.you, "Choose an unchosen Teval's Judgment mode", options, { kind: 'mode', card: ctx.src });
    used.push(mode); ctx.src.meta._judgmentModes = used;
    if (mode === 'draw') await ctx.g.draw(ctx.you, 1);
    else if (mode === 'treasure') await ctx.g.makeTokens('treasure', ctx.you);
    else await ctx.g.makeTokens(zombieDruid, ctx.you);
  }

  SC["Teval's Judgment"] = { triggers: [{
    on: 'cardsLeftGraveyard', desc: 'Choose a new graveyard reward',
    filter: (g, self, data) => data.cards.some(card => card.owner === self.ctrl), run: judgmentReward,
  }, {
    on: 'cardLeftGraveyard', desc: 'Choose a reward for a graveyard spell',
    filter: (g, self, data) => data.to === 'stack' && data.card.owner === self.ctrl, run: judgmentReward,
  }] };

  SC['Cephalid Coliseum'] = {
    producesColors: ['U'],
    mana: { manual: true, cost: { tap: true }, produce: [{ U: 1 }], onProduce: async (game, card, player) => { await game.damagePlayer(card, player, 1); } },
    abilities: [{
      label: 'Threshold: draw three, discard three', cost: { mana: '{U}', tap: true, sacSelf: true },
      cond: (game, self, player) => player.graveyard.length >= 7,
      targets: [T.player({ prompt: 'Player to draw and discard three', aiHint: { goal: 'loot' } })],
      run: async ctx => { const player = ctx.targets[0]; if (!player) return; await ctx.g.draw(player, 3); const n = Math.min(3, player.hand.length); const picked = await chooseCards(ctx.g, player, player.hand, n, n, 'Discard three cards', { kind: 'discard' }); await ctx.g.discard(player, picked); },
      aiScore: () => 5,
    }],
  };

  SC['Crypt of Agadeem'] = {
    entersTapped: true, producesColors: ['B'],
    mana: [
      { cost: { tap: true }, produce: [{ B: 1 }] },
      { manual: true, cost: { mana: '{2}', tap: true }, produce: (game, card, player) => {
        const n = player.graveyard.filter(creature => creature.is('Creature') && creature.colors.includes('B')).length;
        return n ? [{ B: n }] : [];
      } },
    ],
  };

  SC['Dreamroot Cascade'] = {
    entersTapped: (game, card) => game.lands(card.ctrl).filter(land => land !== card).length < 2,
    producesColors: ['G', 'U'], mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] },
  };

  SC['Drownyard Temple'] = {
    producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    gyAbility: { label: 'Return tapped', cost: '{3}', exileSelf: false,
      run: async ctx => { if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'battlefield', { ctrl: ctx.you, tapped: true }); } },
  };

  SC['Foreboding Landscape'] = {
    producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] }, cycling: { cost: '{B}{G}{U}' },
    abilities: [{
      label: 'Search for a basic Swamp, Forest, or Island', cost: { tap: true, sacSelf: true },
      run: async ctx => { await searchBasicTypes(ctx.g, ctx.you, 1, ['Swamp', 'Forest', 'Island'], true); }, aiScore: () => 5,
    }],
  };

  SC['Memorial to Folly'] = {
    entersTapped: true, producesColors: ['B'], mana: { cost: { tap: true }, produce: [{ B: 1 }] },
    abilities: [{
      label: 'Return a creature to your hand', cost: { mana: '{2}{B}', tap: true, sacSelf: true }, targets: [ownGy(isCreature)],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); }, aiScore: () => 5,
    }],
  };

})();
