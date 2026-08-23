// ===== scripts-world-shaper.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const E = MTG.E;
  const T = MTG.T;
  const SC = MTG.SCRIPTS;

  const etbSelf = (g, self, data) => data.card === self;
  const attacksSelf = (g, self, data) => data.card === self;
  const isLand = card => !!card && card.is('Land');
  const isBasicLand = card => isLand(card) && (card.def.super || []).includes('Basic');
  const isPermanent = card => !!card && ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Planeswalker']
    .some(type => card.is(type));
  const landSacCost = { sac: (g, card) => card.is('Land') };
  const ownGyLand = (opts = {}) => Object.assign({
    zone: 'graveyard', what: 'card', prompt: 'Land iz svog groblja',
    filter: (g, card, ctrl) => card.owner === ctrl && card.is('Land'),
    aiHint: { goal: 'recursion' },
  }, opts);
  const anyGyLand = (opts = {}) => Object.assign({
    zone: 'graveyard', what: 'card', prompt: 'Land iz groblja',
    filter: (g, card) => card.is('Land'), aiHint: { goal: 'recursion' },
  }, opts);

  const token = (name, types, subtypes, power, toughness, extra = {}) => Object.assign({
    name, cost: null, types, subtypes, super: [],
    power: power === undefined ? undefined : String(power),
    toughness: toughness === undefined ? undefined : String(toughness),
    oracle: '', kws: [], isTokenDef: true,
  }, extra);
  const insectFlying = token('Insect', ['Creature'], ['Insect'], 1, 1, {
    colorsOverride: ['B'], kws: ['flying'],
  });
  const elemental53 = token('Elemental', ['Creature'], ['Elemental'], 5, 3, { colorsOverride: ['G'] });
  const golem33 = token('Golem', ['Artifact', 'Creature', 'Enchantment'], ['Golem'], 3, 3, { colorsOverride: [] });
  const lander = token('Lander', ['Artifact'], ['Lander'], undefined, undefined, {
    abilities: [{
      label: 'Lander: traži basic land', cost: { mana: '{2}', tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 1, tapped: true }); },
      aiScore: (g, card, player) => player.library.some(isBasicLand) ? 5 : -5,
    }],
  });

  async function chooseCards(game, player, pool, min, max, prompt, aiHint) {
    if (!pool.length || max <= 0) return [];
    const picked = await player.controller.decide(game, {
      type: 'chooseCards', from: pool, min, max: Math.min(max, pool.length), prompt,
      aiHint: aiHint || { kind: 'bestPermanent' },
    });
    return Array.isArray(picked) ? picked.filter(card => pool.includes(card)).slice(0, max) : [];
  }

  async function chooseOne(game, player, pool, prompt, aiHint, optional = false) {
    const picked = await chooseCards(game, player, pool, optional ? 0 : 1, 1, prompt, aiHint);
    return picked[0] || null;
  }

  async function searchLands(game, player, n, predicate, opts = {}) {
    const found = [];
    for (let i = 0; i < n; i++) {
      const pool = player.library.filter(card => card.is('Land') && (!predicate || predicate(card)));
      if (!pool.length) break;
      const card = await chooseOne(game, player, pool, opts.prompt || 'Nađi land', { kind: 'searchBasic' }, true);
      if (!card) break;
      game.remove(card);
      card.zone = 'nowhere';
      if (opts.toHand) { card.zone = 'hand'; player.hand.push(card); }
      else await game.move(card, 'battlefield', { ctrl: player, tapped: opts.tapped !== false });
      found.push(card);
    }
    U.shuffle(player.library, game.rnd);
    return found;
  }

  async function returnAllLands(game, player) {
    const lands = player.graveyard.filter(isLand).slice();
    for (const card of lands) if (card.zone === 'graveyard') {
      await game.move(card, 'battlefield', { ctrl: player, tapped: true });
    }
    return lands.length;
  }

  function stationAbility(extra = {}) {
    return Object.assign({
      label: 'Station (tapuj drugo stvorenje)', sorcery: true, cost: { tapCreature: true },
      run: async ctx => {
        if (ctx.src.zone !== 'battlefield') return;
        const n = ctx.tappedCre && ctx.tappedCre.zone === 'battlefield'
          ? Math.max(0, ctx.tappedCre.power) : Math.max(0, ctx.stationPower || 0);
        if (n) ctx.g.addCounters(ctx.src, 'charge', n);
      },
      aiScore: (game, source, player) => game.phase === 'main2' &&
        game.creatures(player).some(card => card !== source && !card.tapped && card.power > 0) ? 5 : 0.5,
    }, extra);
  }

  async function sacrificeAnotherPermanent(ctx) {
    const pool = ctx.g.bf().filter(card => card.ctrl === ctx.you && card !== ctx.src && ctx.g.canSacrifice(card));
    const card = await chooseOne(ctx.g, ctx.you, pool, `${ctx.src.name}: žrtvuj drugi permanent`, { kind: 'sacCost', src: ctx.src });
    if (card) await ctx.g.sacrifice(ctx.you, card);
  }

  function fetchLandAbility(types) {
    return {
      label: `Traži ${types.join(' ili ')}`, cost: { tap: true, sacSelf: true },
      run: async ctx => {
        await searchLands(ctx.g, ctx.you, 1, card => types.some(type => card.hasSub(type)), {
          tapped: false, prompt: `Nađi ${types.join(' ili ')}`,
        });
      },
      aiScore: (game, card, player) => player.library.some(candidate =>
        candidate.is('Land') && types.some(type => candidate.hasSub(type))) ? 5 : -5,
    };
  }

  function broodshipGrantCards(game) {
    const cards = [];
    for (const player of game.players) {
      for (const zone of ['hand', 'graveyard', 'exile', 'command', 'library']) cards.push(...player[zone]);
    }
    return cards;
  }

  function liveBroodship(game, iid) {
    const source = game.byIid(iid);
    return source && source.zone === 'battlefield' && source.name === 'Exploration Broodship' ? source : null;
  }

  function cleanupBroodshipGrants(game, sourceIid) {
    for (const card of broodshipGrantCards(game)) {
      const grant = card.meta && card.meta._broodshipGrant;
      if (!grant || grant.sourceIid !== sourceIid) continue;
      card.def = grant.baseDef;
      delete card.meta._broodshipGrant;
    }
  }

  function broodshipSacrificeOptions(game, player, card, castOpts = {}, xVal = 0) {
    const cost = game.spellCost(player, card, castOpts);
    return game.lands(player).filter(land => game.canSacrifice(land) &&
      game.canPayMana(player, cost, { card }, { xVal, excludeCards: [land] }));
  }

  function syncBroodshipGrants(game, source) {
    cleanupBroodshipGrants(game, source.iid);
    if (source.zone !== 'battlefield' || (source.counters.charge || 0) < 8 ||
      source.meta._broodshipCastTurn === game.turnNo) return;
    const player = source.ctrl;
    for (const card of player.graveyard) {
      if (!isPermanent(card) || card.is('Land')) continue;
      const baseDef = card.def;
      const baseCastCond = baseDef.castCond;
      const basePrepareTargets = baseDef.prepareTargets;
      const sourceIid = source.iid;
      card.meta._broodshipGrant = { sourceIid, baseDef };
      card.def = Object.assign({}, baseDef, {
        flashback: { broodship: true, label: `Cast ${card.name} from graveyard — sacrifice a land` },
        castCond: (g, p, candidate) => {
          const live = liveBroodship(g, sourceIid);
          return !!live && live.ctrl === p && (live.counters.charge || 0) >= 8 &&
            live.meta._broodshipCastTurn !== g.turnNo && candidate.zone === 'graveyard' &&
            (!baseCastCond || baseCastCond(g, p, candidate)) && broodshipSacrificeOptions(g, p, candidate).length > 0;
        },
        prepareTargets: async castCtx => {
          if (basePrepareTargets && await basePrepareTargets(castCtx) === false) return false;
          if (!castCtx.so.castOpts.broodship) return true;
          const live = liveBroodship(castCtx.g, sourceIid);
          if (!live || live.ctrl !== castCtx.you || live.meta._broodshipCastTurn === castCtx.g.turnNo) return false;
          const pool = broodshipSacrificeOptions(castCtx.g, castCtx.you, castCtx.src,
            castCtx.so.castOpts, castCtx.so.x || 0);
          const land = await chooseOne(castCtx.g, castCtx.you, pool,
            `Exploration Broodship: sacrifice a land to cast ${castCtx.src.name}`,
            { kind: 'sacCost', src: live });
          if (!land || !await castCtx.g.sacrifice(castCtx.you, land)) return false;
          live.meta._broodshipCastTurn = castCtx.g.turnNo;
          castCtx.so.broodshipSacrificedLand = land.iid;
          cleanupBroodshipGrants(castCtx.g, sourceIid);
          return true;
        },
      });
    }
  }

  SC['Hearthhull, the Worldseed'] = {
    canBeCommanderExtra: true,
    stationCreatureAt: 8,
    dynTypes: (game, card) => (card.counters.charge || 0) >= 8 ? ['Creature'] : [],
    statics: [{
      cond: (game, card) => (card.counters.charge || 0) >= 8,
      apply: (game, card) => {
        card.cur.kw.add('flying'); card.cur.kw.add('vigilance'); card.cur.kw.add('haste');
      },
    }],
    abilities: [
      stationAbility(),
      {
        label: 'Žrtvuj land: vuci 2 i dodatni land',
        cond: (game, card) => (card.counters.charge || 0) >= 2,
        cost: Object.assign({ mana: '{1}', tap: true }, landSacCost),
        run: async ctx => { await ctx.g.draw(ctx.you, 2); ctx.you.maxLands++; }, aiScore: () => 7,
      },
    ],
    triggers: [{
      on: 'sacrificed', desc: 'Protivnici gube 2',
      filter: (game, card, data) => data.player === card.ctrl && data.card.is('Land'),
      run: async ctx => { for (const opponent of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(opponent, 2, ctx.src.name); },
    }],
  };

  SC['Groundskeeper'] = {
    abilities: [{
      label: 'Vrati basic land u ruku', cost: { mana: '{1}{G}' },
      targets: [ownGyLand({ filter: (game, card, ctrl) => card.owner === ctrl && isBasicLand(card) })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); }, aiScore: () => 3,
    }],
  };

  SC['Aftermath Analyst'] = {
    triggers: [{ on: 'etb', desc: 'Mill 3', filter: etbSelf, run: async ctx => { await ctx.g.mill(ctx.you, 3); } }],
    abilities: [{
      label: 'Vrati sve landove iz groblja tapovane', cost: { mana: '{3}{G}', sacSelf: true },
      run: async ctx => { await returnAllLands(ctx.g, ctx.you); },
      aiScore: (game, card, player) => 2 + player.graveyard.filter(isLand).length * 2,
    }],
  };

  SC['Juri, Master of the Revue'] = {
    triggers: [
      {
        on: 'sacrificed', desc: '+1/+1 counter', filter: (game, card, data) => data.player === card.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'dies', desc: 'Šteta jednaka snazi', filter: (game, card, data) => data.card === card,
        targets: [T.any({ prompt: 'Juri: meta za štetu', aiHint: { goal: 'damage' } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.data.snap.power); },
      },
    ],
  };

  SC['Satyr Wayfinder'] = {
    triggers: [{
      on: 'etb', desc: 'Vrhnje 4: land u ruku, ostalo u groblje', filter: etbSelf,
      run: async ctx => {
        const top = ctx.you.library.slice(-4);
        const land = await chooseOne(ctx.g, ctx.you, top.filter(isLand), 'Satyr Wayfinder: land u ruku', { kind: 'searchBasic' }, true);
        if (land) await ctx.g.move(land, 'hand');
        for (const card of top) if (card !== land && card.zone === 'library') await ctx.g.move(card, 'graveyard');
      },
    }],
  };

  SC['Sprouting Goblin'] = {
    kicker: { cost: '{G}' },
    triggers: [{
      on: 'etb', desc: 'Kicker: traži typed land',
      filter: (game, card, data) => data.card === card && !!card.castMeta && card.castMeta.kicked,
      run: async ctx => {
        await searchLands(ctx.g, ctx.you, 1, card => ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']
          .some(type => card.hasSub(type)), { toHand: true });
      },
    }],
    abilities: [{
      label: 'Žrtvuj land: vuci kartu', cost: Object.assign({ mana: '{R}', tap: true }, landSacCost),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); }, aiScore: () => 4,
    }],
  };

  SC['Augur of Autumn'] = {
    revealOwnTop: true,
    playTop: (game, card, top, player) => top.is('Land') || (top.is('Creature') &&
      new Set(game.creatures(player).map(creature => creature.power)).size >= 3),
  };

  SC['Evendo Brushrazer'] = {
    triggers: [{
      on: 'sacrificed', desc: 'Egzilaj vrh', filter: (game, card, data) => data.player === card.ctrl && !data.card.isToken,
      run: async ctx => {
        if (!ctx.you.library.length || ctx.src.zone !== 'battlefield') return;
        const card = ctx.you.library.pop(); card.zone = 'exile'; ctx.you.exile.push(card);
        ctx.src.meta._evendoSacTurn = ctx.g.turnNo;
        card.meta.playableBy = ctx.you; card.meta.playableUntil = ctx.g.turnNo;
        const iid = ctx.src.iid;
        card.meta.playableCondition = game => {
          const source = game.byIid(iid);
          return !!source && source.zone === 'battlefield' && game.turnPlayer === source.ctrl &&
            source.meta._evendoSacTurn === game.turnNo;
        };
      },
    }],
    mana: {
      manual: true,
      cost: Object.assign({ tap: true }, landSacCost),
      produce: [{ R: 2 }],
    },
  };

  SC['Horizon Explorer'] = {
    landsEnterUntapped: true,
    triggers: [{
      on: 'attackedPlayer', desc: 'Lander token', filter: (game, card, data) => data.player === card.ctrl,
      run: async ctx => { await ctx.g.makeTokens(lander, ctx.you); },
    }],
  };

  SC['Loamcrafter Faun'] = {
    triggers: [{
      on: 'etb', desc: 'Odbaci landove, vrati nonland permanente', filter: etbSelf,
      run: async ctx => {
        const lands = ctx.you.hand.filter(isLand);
        const discarded = await chooseCards(ctx.g, ctx.you, lands, 0, lands.length,
          'Loamcrafter Faun: odbaci landove', { kind: 'addlDiscard', card: ctx.src });
        if (!discarded.length) return;
        await ctx.g.discard(ctx.you, discarded);
        const pool = ctx.you.graveyard.filter(card => !card.is('Land') && isPermanent(card));
        const returned = await chooseCards(ctx.g, ctx.you, pool, 0, discarded.length,
          `Loamcrafter Faun: vrati do ${discarded.length} permanenata`, { kind: 'bestGyCast' });
        for (const card of returned) await ctx.g.move(card, 'hand');
      },
    }],
  };

  SC['Scouring Swarm'] = {
    triggers: [{
      on: 'sacrificed', desc: 'Tapovani Insect ili kopija',
      filter: (game, card, data) => data.player === card.ctrl && data.card.is('Land'),
      run: async ctx => {
        if (ctx.you.graveyard.filter(isLand).length >= 7) await ctx.g.copyPermanentToken(ctx.src, ctx.you, { tapped: true });
        else await ctx.g.makeTokens(insectFlying, ctx.you, { tapped: true });
      },
    }],
  };

  SC['Springbloom Druid'] = {
    triggers: [{
      on: 'etb', desc: 'Žrtvuj land, traži dva basica', filter: etbSelf, opt: true,
      run: async ctx => {
        const land = await chooseOne(ctx.g, ctx.you, ctx.g.lands(ctx.you), 'Springbloom Druid: žrtvuj land', { kind: 'sacCost', src: ctx.src });
        if (land && await ctx.g.sacrifice(ctx.you, land)) await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true });
      },
    }],
  };

  SC['Uurg, Spawn of Turg'] = {
    cdaPower: (game, card) => card.ctrl.graveyard.filter(isLand).length,
    triggers: [{
      on: 'upkeep', desc: 'Surveil 1', filter: (game, card, data) => data.player === card.ctrl,
      run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); },
    }],
    abilities: [{
      label: 'Žrtvuj land: +2 života', cost: Object.assign({ mana: '{B}{G}' }, landSacCost),
      run: async ctx => { await ctx.g.gainLife(ctx.you, 2); }, aiScore: () => 2,
    }],
  };

  SC['Baloth Prime'] = {
    entersTapped: true,
    etbCounters: { kind: 'stun', n: 6 },
    triggers: [{
      on: 'sacrificed', desc: 'Tapovani 4/4 Beast i untap',
      filter: (game, card, data) => data.player === card.ctrl && data.card.is('Land'),
      run: async ctx => {
        await ctx.g.makeTokens('beast44', ctx.you, { tapped: true });
        if (ctx.src.zone === 'battlefield') ctx.src.tapped = false;
      },
    }],
    abilities: [{
      label: 'Žrtvuj land: +2 života', cost: Object.assign({ mana: '{4}' }, landSacCost),
      run: async ctx => { await ctx.g.gainLife(ctx.you, 2); }, aiScore: () => 1,
    }],
  };

  async function vinecrasherReturn(ctx) {
    if (ctx.src.zone !== 'graveyard' || !ctx.g.canPayMana(ctx.you, U.parseCost('{G}{G}'))) return;
    const yes = await ctx.you.controller.decide(ctx.g, {
      type: 'chooseOption', prompt: 'Centaur Vinecrasher: plati {G}{G} i vrati u ruku?',
      options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'graveyardReturn', card: ctx.src },
    });
    if (yes !== 'yes' || !await ctx.g.payMana(ctx.you, U.parseCost('{G}{G}'), { card: ctx.src, isAbility: true })) return;
    if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'hand');
  }

  SC['Centaur Vinecrasher'] = {
    etbCounters: { kind: '+1/+1', n: game => game.players.reduce((sum, player) =>
      sum + player.graveyard.filter(isLand).length, 0) },
    triggers: [
      {
        on: 'lto', zone: 'graveyard', desc: 'Plati GG: vrati se',
        filter: (game, card, data) => data.card.zone === 'graveyard' && data.snap.types.includes('Land'), run: vinecrasherReturn,
      },
      {
        on: 'cardToGraveyard', zone: 'graveyard', desc: 'Plati GG: vrati se',
        filter: (game, card, data) => data.card.is('Land'), run: vinecrasherReturn,
      },
    ],
  };

  async function wastewakerChoice(game, player, source) {
    const permanents = game.bf().filter(card => card.ctrl === player && game.canSacrifice(card));
    const options = [];
    if (player.hand.length) options.push({ key: 'discard', label: 'Odbaci kartu' });
    if (permanents.length) options.push({ key: 'sacrifice', label: 'Žrtvuj permanent' });
    if (!options.length) return null;
    const key = options.length === 1 ? options[0].key : await player.controller.decide(game, {
      type: 'chooseOption', prompt: `${source.name}: odbaci ili žrtvuj`, options,
      aiHint: { kind: 'discardOrSacrifice', card: source },
    });
    const kind = options.some(option => option.key === key) ? key : options[0].key;
    const pool = kind === 'discard' ? player.hand.slice() : permanents;
    const card = await chooseOne(game, player, pool, kind === 'discard' ? 'Odbaci kartu' : 'Žrtvuj permanent',
      kind === 'discard' ? { kind: 'addlDiscard', card: source } : { kind: 'sacCost', src: source });
    return card ? { player, kind, card, land: card.is('Land') } : null;
  }

  SC['Eumidian Wastewaker'] = {
    triggers: [{
      on: 'attacks', desc: 'Oboje odbacuju ili žrtvuju', filter: attacksSelf,
      run: async ctx => {
        const defender = ctx.data.defender instanceof MTG.Player ? ctx.data.defender : ctx.data.defender && ctx.data.defender.ctrl;
        const choices = [];
        const mine = await wastewakerChoice(ctx.g, ctx.you, ctx.src); if (mine) choices.push(mine);
        if (defender && !defender.lost) { const theirs = await wastewakerChoice(ctx.g, defender, ctx.src); if (theirs) choices.push(theirs); }
        let lands = 0;
        for (const choice of choices) {
          if (choice.kind === 'discard') { await ctx.g.discard(choice.player, [choice.card]); if (choice.land) lands++; }
          else if (await ctx.g.sacrifice(choice.player, choice.card)) { if (choice.land) lands++; }
        }
        if (lands) await ctx.g.draw(ctx.you, lands);
      },
    }],
    gyAbility: {
      label: 'Encore {6}{B}{B}', cost: '{6}{B}{B}', sorcery: true,
      run: async ctx => {
        const made = [];
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          const copies = await ctx.g.copyPermanentToken(ctx.src, ctx.you, { haste: true });
          for (const copy of copies) copy.meta.mustAttackPlayer = opponent;
          made.push(...copies);
        }
        const iids = made.map(card => card.iid);
        ctx.g.delayed.push({
          on: 'endStep', name: 'Encore sacrifice', ctrl: ctx.you,
          run: async delayedCtx => {
            const cards = iids.map(iid => delayedCtx.g.byIid(iid)).filter(card => card && card.zone === 'battlefield');
            if (cards.length) await delayedCtx.g.sacrificeMany(delayedCtx.you, cards);
          },
        });
      },
    },
  };

  SC['Oracle of Mul Daya'] = { playTop: (game, card, top) => top.is('Land'), additionalLandPlays: 1 };

  const windgraceLandTrigger = on => ({
    on, desc: 'Land iz groblja tapovan', filter: on === 'etb' ? etbSelf : attacksSelf,
    targets: [anyGyLand({ upTo: true })],
    run: async ctx => {
      const land = ctx.targets[0];
      if (land && land.zone === 'graveyard') await ctx.g.move(land, 'battlefield', { ctrl: ctx.you, tapped: true });
    },
  });
  SC['Soul of Windgrace'] = {
    triggers: [windgraceLandTrigger('etb'), windgraceLandTrigger('attacks')],
    abilities: [
      {
        label: 'Odbaci land: +3 života', cost: { mana: '{G}', discard: { n: 1, filter: (game, card) => isLand(card) } },
        run: async ctx => { await ctx.g.gainLife(ctx.you, 3); },
      },
      {
        label: 'Odbaci land: vuci', cost: { mana: '{1}{R}', discard: { n: 1, filter: (game, card) => isLand(card) } },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        label: 'Odbaci land: indestructible i tap', cost: { mana: '{2}{B}', discard: { n: 1, filter: (game, card) => isLand(card) } },
        run: async ctx => {
          if (ctx.src.zone === 'battlefield') { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); ctx.src.tapped = true; }
        },
      },
    ],
  };

  SC['God-Eternal Bontu'] = {
    triggers: [
      {
        on: 'etb', desc: 'Žrtvuj bilo koliko, vuci toliko', filter: etbSelf,
        run: async ctx => {
          const pool = ctx.g.bf().filter(card => card.ctrl === ctx.you && card !== ctx.src && ctx.g.canSacrifice(card));
          const picked = await chooseCards(ctx.g, ctx.you, pool, 0, pool.length, 'Bontu: žrtvuj bilo koliko', { kind: 'sacX', src: ctx.src });
          if (picked.length) { await ctx.g.sacrificeMany(ctx.you, picked); await ctx.g.draw(ctx.you, picked.length); }
        },
      },
      {
        on: 'lto', zone: 'self', desc: 'Third from the top', opt: true,
        filter: (game, card, data) => data.card === card && (card.zone === 'graveyard' || card.zone === 'exile'),
        run: async ctx => {
          const card = ctx.src;
          if (card.zone !== 'graveyard' && card.zone !== 'exile') return;
          const library = card.owner.library;
          ctx.g.remove(card); card.zone = 'library'; library.splice(Math.max(0, library.length - 2), 0, card);
        },
      },
    ],
  };

  const korvoldSacrifice = on => ({
    on, desc: 'Žrtvuj drugi permanent', filter: on === 'etb' ? etbSelf : attacksSelf, run: sacrificeAnotherPermanent,
  });
  SC['Korvold, Fae-Cursed King'] = {
    triggers: [
      korvoldSacrifice('etb'), korvoldSacrifice('attacks'),
      {
        on: 'sacrificed', desc: '+1/+1 i vuci', filter: (game, card, data) => data.player === card.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };

  SC['Mazirek, Kraul Death Priest'] = {
    triggers: [{
      on: 'sacrificed', desc: '+1/+1 svim tvojim stvorenjima', filter: (game, card, data) => data.card !== card,
      run: async ctx => {
        for (const creature of ctx.g.creatures(ctx.you)) ctx.g.addCounters(creature, '+1/+1', 1, true);
        ctx.g.recalc();
      },
    }],
  };

  SC['Szarel, Genesis Shepherd'] = {
    playLandsFromGraveyard: true,
    triggers: [{
      on: 'sacrificed', desc: 'Counteri jednaki Szarel snazi',
      filter: (game, card, data) => game.turnPlayer === card.ctrl && data.player === card.ctrl && data.card !== card && !data.card.isToken,
      targets: [T.yourCreature({
        prompt: 'Drugo stvorenje za Szarel countere', upTo: true,
        filter: (game, creature, ctrl, source) => creature.zone === 'battlefield' && creature.is('Creature') &&
          creature.ctrl === ctrl && creature !== source, aiHint: { goal: 'buff' },
      })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target && target.zone === 'battlefield' && ctx.src.zone === 'battlefield') ctx.g.addCounters(target, '+1/+1', Math.max(0, ctx.src.power));
      },
    }],
  };

  SC['The Gitrog Monster'] = {
    additionalLandPlays: 1,
    triggers: [
      {
        on: 'upkeep', desc: 'Žrtvuj land ili Gitroga', filter: (game, card, data) => data.player === card.ctrl,
        run: async ctx => {
          const lands = ctx.g.lands(ctx.you).filter(card => ctx.g.canSacrifice(card));
          let sacrificeLand = false;
          if (lands.length) {
            const choice = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: 'Gitrog upkeep',
              options: [{ key: 'land', label: 'Žrtvuj land' }, { key: 'gitrog', label: 'Žrtvuj Gitroga' }],
              aiHint: { kind: 'gitrogUpkeep', card: ctx.src },
            });
            sacrificeLand = choice === 'land';
          }
          if (sacrificeLand) {
            const land = await chooseOne(ctx.g, ctx.you, lands, 'Gitrog: žrtvuj land', { kind: 'sacCost', src: ctx.src });
            if (land && await ctx.g.sacrifice(ctx.you, land)) return;
          }
          if (ctx.src.zone === 'battlefield') await ctx.g.sacrifice(ctx.you, ctx.src);
        },
      },
      {
        on: 'cardsToGraveyard', desc: 'Jedan ili više landova u groblje',
        filter: (game, source, data) => data.cards.some(card => card.owner === source.ctrl && card.is('Land')),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };

  SC['Titania, Protector of Argoth'] = {
    triggers: [
      {
        on: 'etb', desc: 'Vrati land iz groblja', filter: etbSelf, targets: [ownGyLand()],
        run: async ctx => { if (ctx.targets[0] && ctx.targets[0].zone === 'graveyard') await ctx.g.move(ctx.targets[0], 'battlefield', { ctrl: ctx.you }); },
      },
      {
        on: 'lto', desc: '5/3 Elemental',
        filter: (game, card, data) => data.card.zone === 'graveyard' && data.snap.ctrl === card.ctrl && data.snap.types.includes('Land'),
        run: async ctx => { await ctx.g.makeTokens(elemental53, ctx.you); },
      },
    ],
  };

  SC['Moraug, Fury of Akoum'] = {
    statics: [{
      apply: (game, source, battlefield) => {
        for (const creature of battlefield) if (creature.ctrl === source.ctrl && creature.is('Creature') &&
          creature.meta._moraugAttackTurn === game.turnNo) creature.cur.power += creature.meta._moraugAttackCount || 0;
      },
    }],
    triggers: [
      {
        on: 'attacks', desc: 'Pamti koliko je puta napalo', filter: (game, card, data) => data.card.ctrl === card.ctrl,
        run: async ctx => {
          const creature = ctx.data.card;
          if (creature.meta._moraugAttackTurn !== ctx.g.turnNo) {
            creature.meta._moraugAttackTurn = ctx.g.turnNo; creature.meta._moraugAttackCount = 0;
          }
          creature.meta._moraugAttackCount++; ctx.g.recalc();
        },
      },
      {
        on: 'landfall', desc: 'Dodatna borba i untap',
        filter: (game, card, data) => data.card.ctrl === card.ctrl && (game.phase === 'main1' || game.phase === 'main2'),
        run: async ctx => {
          ctx.g.scheduleAdditionalCombat();
          const pending = { n: 1 };
          const delayed = {
            on: 'beginCombat', once: false, name: 'Moraug untap', ctrl: ctx.you,
            filter: (game, data) => pending.n > 0 && data.player === ctx.you,
            run: async delayedCtx => {
              for (const creature of delayedCtx.g.creatures(delayedCtx.you)) creature.tapped = false;
              pending.n--;
              if (!pending.n) delayedCtx.g.delayed.splice(delayedCtx.g.delayed.indexOf(delayed), 1);
            },
          };
          ctx.g.delayed.push(delayed);
        },
      },
    ],
  };

  SC["Multani, Yavimaya's Avatar"] = {
    cdaPower: (game, card) => game.lands(card.ctrl).length + card.ctrl.graveyard.filter(isLand).length,
    cdaToughness: (game, card) => game.lands(card.ctrl).length + card.ctrl.graveyard.filter(isLand).length,
    gyAbility: {
      label: 'Vrati dva landa: Multani u ruku', cost: '{1}{G}', exileSelf: false,
      extraCost: { return: (game, permanent) => permanent.is('Land'), returnN: 2, allowMana: true },
      run: async ctx => {
        if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'hand');
      },
    },
  };

  SC['World Breaker'] = {
    colorsOverride: [],
    triggers: [{
      on: 'cast', zone: 'stack', desc: 'Egzilaj artifact, enchantment ili land', filter: (game, card, data) => data.card === card,
      targets: [T.permanent((game, permanent) => permanent.is('Artifact') || permanent.is('Enchantment') || permanent.is('Land'), {
        prompt: 'World Breaker: egzilaj', aiHint: { goal: 'removal' },
      })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.exileCard(ctx.targets[0]); },
    }],
    gyAbility: {
      label: 'Žrtvuj land: vrati World Breaker', cost: '{2}{C}', exileSelf: false,
      extraCost: { sac: (game, permanent) => permanent.is('Land'), sacN: 1, allowMana: true },
      run: async ctx => {
        if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'hand');
      },
    },
  };

  SC['Harrow'] = {
    addlCost: { sacLand: 1 },
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: false }); },
  };

  SC['Roiling Regrowth'] = {
    addlCost: { sacLand: 1 },
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true }); },
  };

  SC['Pest Infestation'] = {
    xCost: true,
    targets: (game, card, castOpts) => [{
      what: 'permanent', count: castOpts.xVal || 0, min: 0, upTo: true,
      prompt: `Uništi do ${castOpts.xVal || 0} artifacta/enchantmenta`,
      filter: (g, permanent) => permanent.zone === 'battlefield' && (permanent.is('Artifact') || permanent.is('Enchantment')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      for (const permanent of [ctx.targets[0]].flat().filter(Boolean)) if (permanent.zone === 'battlefield') await ctx.g.destroy(permanent);
      await ctx.g.makeTokens('pest', ctx.you, { n: 2 * (ctx.x || 0) });
    },
  };

  SC["Worldsoul's Rage"] = {
    xCost: true,
    targets: [T.any({ prompt: 'Worldsoul’s Rage: meta', aiHint: { goal: 'damage' } })],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.x || 0);
      const pool = ctx.you.hand.concat(ctx.you.graveyard).filter(isLand);
      const picked = await chooseCards(ctx.g, ctx.you, pool, 0, ctx.x || 0,
        `Stavi do ${ctx.x || 0} landova tapovano`, { kind: 'landRamp', card: ctx.src });
      for (const land of picked) if (land.zone === 'hand' || land.zone === 'graveyard') {
        await ctx.g.move(land, 'battlefield', { ctrl: ctx.you, tapped: true });
      }
    },
  };

  SC['Formless Genesis'] = {
    retrace: { altCostStr: '{2}{G}' }, changeling: true,
    resolve: async ctx => {
      const x = ctx.you.graveyard.filter(isLand).length;
      const shapeshifter = token('Shapeshifter', ['Creature'], ['Shapeshifter'], x, x, {
        colorsOverride: [], changeling: true, kws: ['deathtouch'],
      });
      await ctx.g.makeTokens(shapeshifter, ctx.you);
    },
  };

  SC['Gaze of Granite'] = {
    xCost: true,
    resolve: async ctx => {
      const victims = ctx.g.bf().filter(card => !card.is('Land') && card.mv <= (ctx.x || 0));
      for (const card of victims) if (card.zone === 'battlefield') await ctx.g.destroy(card);
    },
  };

  SC['Skyshroud Claim'] = {
    resolve: async ctx => { await searchLands(ctx.g, ctx.you, 2, card => card.hasSub('Forest'), { tapped: false, prompt: 'Nađi Forest' }); },
  };

  SC['Splendid Reclamation'] = { resolve: async ctx => { await returnAllLands(ctx.g, ctx.you); } };

  SC['Escape to the Wilds'] = {
    resolve: async ctx => { E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 5, 'next'); ctx.you.maxLands++; },
  };

  SC['Planetary Annihilation'] = {
    resolve: async ctx => {
      const sacrifices = [];
      for (const player of ctx.g.apnapFrom(ctx.you)) {
        const lands = ctx.g.lands(player).filter(card => ctx.g.canSacrifice(card));
        if (lands.length <= 6) continue;
        const keep = await chooseCards(ctx.g, player, lands, 6, 6, 'Planetary Annihilation: zadrži šest landova', { kind: 'keepBestLands' });
        const keepSet = new Set(keep);
        sacrifices.push({ player, cards: lands.filter(card => !keepSet.has(card)) });
      }
      for (const choice of sacrifices) await ctx.g.sacrificeMany(choice.player, choice.cards);
      const creatures = ctx.g.creatures().slice();
      for (const creature of creatures) if (creature.zone === 'battlefield') await ctx.g.damageCreature(ctx.src, creature, 6);
    },
  };

  SC['Exploration Broodship'] = {
    stationCreatureAt: 8,
    dynTypes: (game, card) => (card.counters.charge || 0) >= 8 ? ['Creature'] : [],
    statics: [
      { cond: (game, card) => (card.counters.charge || 0) >= 8, apply: (game, card) => { card.cur.kw.add('flying'); } },
      { apply: (game, card) => { syncBroodshipGrants(game, card); } },
    ],
    abilities: [stationAbility()],
    additionalLandPlays: (game, card) => (card.counters.charge || 0) >= 3 ? 1 : 0,
    triggers: [{
      on: 'lto', zone: 'self', desc: 'Remove graveyard cast permissions',
      filter: (game, card, data) => data.card === card,
      run: async ctx => { cleanupBroodshipGrants(ctx.g, ctx.src.iid); },
    }],
  };

  SC['Hammer of Purphoros'] = {
    statics: [{
      apply: (game, card, battlefield) => {
        for (const creature of battlefield) if (creature.ctrl === card.ctrl && creature.is('Creature')) creature.cur.kw.add('haste');
      },
    }],
    abilities: [{
      label: 'Žrtvuj land: 3/3 Golem', cost: Object.assign({ mana: '{2}{R}', tap: true }, landSacCost),
      run: async ctx => { await ctx.g.makeTokens(golem33, ctx.you); }, aiScore: () => 4,
    }],
  };

  function panoramaLand(types) {
    return {
      triggers: [{
        on: 'etb', desc: 'Žrtvuj, traži basic i +1 život', filter: etbSelf,
        run: async ctx => {
          if (!await ctx.g.sacrifice(ctx.you, ctx.src)) return;
          await E.searchBasic(ctx.g, ctx.you, {
            n: 1, tapped: true, filter: def => types.some(type => (def.subtypes || []).includes(type)),
          });
          await ctx.g.gainLife(ctx.you, 1);
        },
      }],
    };
  }
  SC['Cabaretti Courtyard'] = panoramaLand(['Mountain', 'Forest', 'Plains']);

  SC['Dakmor Salvage'] = {
    entersTapped: true, producesColors: ['B'], mana: { cost: { tap: true }, produce: [{ B: 1 }] },
    dredge: {
      n: 2,
      replaceDraw: async (game, player, card) => {
        if (card.zone !== 'graveyard' || card.owner !== player || player.library.length < 2) return false;
        await game.mill(player, 2);
        if (card.zone === 'graveyard') await game.move(card, 'hand');
        return card.zone === 'hand';
      },
    },
  };

  SC['Eumidian Hatchery'] = {
    producesColors: ['B'],
    mana: { manual: true, cost: { tap: true, life: 1, counter: 'hatchling' }, produce: [{ B: 1 }] },
    triggers: [{
      on: 'lto', zone: 'self', desc: 'Insecti po hatchling counteru',
      filter: (game, card, data) => data.card === card && data.card.zone === 'graveyard',
      run: async ctx => {
        const n = ctx.data.snap.counters.hatchling || 0;
        if (n) await ctx.g.makeTokens(insectFlying, ctx.you, { n });
      },
    }],
  };

  SC['Maestros Theater'] = panoramaLand(['Island', 'Swamp', 'Mountain']);
  SC['Mountain Valley'] = { entersTapped: true, abilities: [fetchLandAbility(['Mountain', 'Forest'])] };
  SC['Rocky Tar Pit'] = { entersTapped: true, abilities: [fetchLandAbility(['Swamp', 'Mountain'])] };
  SC['Wastes'] = { producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] } };

})();
