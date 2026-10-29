'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, S = M.SCRIPTS, T = M.T;
  // Multiple-name objects share a name if any of their names overlap. Count
  // the largest set of lands whose rules names are pairwise different.
  const names = (g, p) => {
    const groups = [...new Map(g.lands(p).map(c => M.OracleV8NameGroups.names(c)).filter(a => a.length)
      .map(a => [JSON.stringify([...a].sort()), a])).values()];
    if (groups.every(a => a.length === 1)) return groups.length;
    const count = rows => {
      if (!rows.length) return 0;
      const [first, ...rest] = rows, conflict = row => row.some(n => first.includes(n));
      const compatible = rest.filter(row => !conflict(row));
      if (compatible.length === rest.length) return 1 + count(rest);
      return Math.max(1 + count(compatible), count(rest));
    };
    return count(groups);
  };
  const worlds = (g, c) => names(g, c.ctrl);
  const cda = {oracleCharacteristicPT: true, cdaPower: worlds, cdaToughness: worlds};
  const flat = values => values.flat(Infinity).filter(Boolean);
  const unblock = (ctx, c) => c && C.effectOn(ctx, c, (g, x) => {x.cur.unblockable = true;});
  const landfall = (desc, run, extra = {}) => C.enterTrigger(desc, run, {
    filter: (g, c, d) => d.card.ctrl === c.ctrl && d.card.is('Land'), ...extra,
  });
  const station = (threshold, script = {}) => {
    M.applyOracleMechanic(script, {kind: 'station-v9', threshold});
    script.abilities.at(-1).run = ctx => {
      if (!C.same(ctx)) return;
      const card = ctx.tappedCre, live = card?.zone === 'battlefield' && card.zoneVersion === ctx.stationZoneVersion;
      const snap = card?.battlefieldLKI?.get(ctx.stationZoneVersion);
      const n = live ? (card.cur.stationByToughnessV89 ? card.toughness : card.power)
        : snap ? (snap.stationByToughnessV89 ? snap.toughness : snap.power) : ctx.stationPower;
      C.add(ctx, ctx.src, 'charge', Math.max(0, n || 0));
    };
    (script.statics ||= []).push({apply: (g, c) => {if ((c.counters.charge || 0) >= threshold) c.cur.kw.add('flying');}});
    return script;
  };
  const blink = async (ctx, card) => {
    if (!card) return;
    await ctx.g.move(card, 'exile');
    if (card.zone === 'exile') C.returnLater(ctx, card);
  };
  const putLands = async (ctx, n) => {
    if (n <= 0) return;
    const cards = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Land')), 0, n, 'Put up to ' + n + ' lands onto the battlefield tapped');
    await ctx.g.withBattlefieldEntryBatch(async () => {
      for (const c of cards) await ctx.g.putPermanentOntoBattlefield(c, ctx.you, {tapped: true});
    });
  };
  const officer = C.registerToken('trcOfficer', C.token('Officer', ['Officer'], 1, 1, ['R'], [], {tokenImageName: 'TRC Officer'}));
  const tribble = C.registerToken('trcTribble', C.token('Tribble', ['Tribble'], 1, 1, ['W'], [], {
    tokenImageName: 'TRC Tribble', oracle: "This token can't block.", statics: [{apply: (g, c) => {c.cur.cantBlock = true;}}],
  }));

  const spock = async ctx => {
    const card = ctx.you.library.at(-1);
    if (!card) return;
    const version = card.zoneVersion;
    await ctx.g.revealToHuman({cards: [card], ctrl: ctx.you, kind: 'reveal'});
    if (card.zone !== 'library' || card.zoneVersion !== version || ctx.you.library.at(-1) !== card) return;
    await C.immediate(ctx, [card], {filter: (c, g, so) => g.stackSpellManaValue(so) <= names(g, ctx.you)});
    if (card.zone === 'library' && card.zoneVersion === version && ctx.you.library.at(-1) === card && card.is('Land') && await C.yes(ctx, 'Put ' + card.name + ' onto the battlefield tapped?')) {
      await ctx.g.putPermanentOntoBattlefield(card, ctx.you, {tapped: true});
    }
    if (card.zone === 'library' && card.zoneVersion === version && ctx.you.library.at(-1) === card) await C.draw(ctx);
  };
  S['Commander Spock'] = {triggers: [C.enterTrigger('Explore a strange new world', spock), C.attack('Explore a strange new world', spock)]};
  const kirk = async ctx => {
    // Selecting graveyard-only is a real choice: it must not shuffle the library.
    const canSearch = ctx.g.canSearchLibrary(ctx.you);
    const options = canSearch ? [{key: 'both', label: 'Search library and graveyard'}, {key: 'graveyard', label: 'Search graveyard only'}] : [{key: 'graveyard', label: 'Search graveyard'}];
    const key = await C.option(ctx, options, 'Choose where to search');
    const searchedLibrary = key === 'both' && canSearch;
    const from = [...(searchedLibrary ? ctx.g.searchableLibrary(ctx.you) : []), ...ctx.you.graveyard]
      .filter(c => c.is('Land') && c.def.super.includes('Basic') || M.OracleV8NameGroups.names(c).includes('Starship Enterprise'));
    const [card] = await C.choose(ctx.g, ctx.you, from, 0, 1, 'Find a basic land or Starship Enterprise', 'searchLand');
    if (card) {await ctx.g.revealToHuman({cards: [card], ctrl: ctx.you, kind: 'search'}); await ctx.g.move(card, 'hand');}
    if (searchedLibrary) {M.shuffle(ctx.you.library, ctx.g.rnd); await ctx.g.emit('searchedLibrary', {player: ctx.you});}
  };
  S['Captain Kirk, Boldly Going'] = {kws: ['vigilance'], statics: [{apply: (g, c, bf) => {
    for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature') && x.hasSub('Spacecraft')) {x.cur.power += 3; x.cur.toughness += 3;}
  }}], triggers: [C.enterTrigger('Find a basic land or Starship Enterprise', kirk), C.attack('Find a basic land or Starship Enterprise', kirk)]};
  const blinkChapter = {targets: [T.permanent((g, c, p, s) => c !== s && c.ctrl === p, {count: 1, min: 0, upTo: true})], run: ctx => blink(ctx, ctx.targets[0])};
  S['Balance of Terror'] = {saga: [
    {targets: [T.permanent((g, c, p, s) => c !== s && (c.is('Artifact') || c.is('Enchantment')), {count: 1, min: 0, upTo: true})], run: ctx => ctx.targets[0] && ctx.g.destroy(ctx.targets[0], {source: ctx.src})},
    blinkChapter, blinkChapter,
  ]};
  S['Merciful Mandate'] = {resolve: async ctx => {
    for (const card of ctx.g.creatures(ctx.you)) ctx.g.untap(card);
    if (ctx.g.phase === 'combat' && await C.yes(ctx, 'End this combat phase?')) await ctx.g.endCombatByEffect(ctx.so);
  }};
  S["M'Ress, Crew Coordinator"] = {triggers: [landfall('Create two Officers', ctx => C.make(ctx, officer, 2))]};
  S['Shuttlecraft Galileo'] = station(6, {triggers: [landfall('Create an Officer', ctx => C.make(ctx, officer)),
    C.attack('Up to seven attacking creatures gain flying', ctx => {for (const c of flat(ctx.targets)) C.buff(ctx, c, 0, 0, ['flying']);}, {
      filter: (g, c, d) => d.card === c && (c.counters.charge || 0) >= 6,
      targets: [T.creature({filter: (g, c) => !!c.attacking, count: 7, min: 0, upTo: true})],
    }),
  ]});
  S['Tribble Cluster'] = {triggers: [C.combat('Put a +1/+1 counter on this creature', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1')),
    C.death('Create Tribbles equal to this creature’s last power', ctx => C.make(ctx, tribble, Math.max(0, ctx.data.snap.power)))]};
  S['Colossal Clone Master'] = {asEnters: async (g, c) => {
    const [model] = await C.choose(g, c.ctrl, g.creatures().filter(x => x !== c), 0, 1, 'Copy a creature');
    if (!model) return;
    const def = C.snapshotCopy(model);
    // The CDA and nonlegendary exception are part of the copiable values.
    M.OracleV8Copies.applyCopy(g, c, {...def, super: def.super.filter(s => s !== 'Legendary'), power: '*', toughness: '*', ...cda});
    g.recalc();
  }};
  const pikeTargets = () => [T.creature({filter: (g, c, p, s) => c !== s, count: 2, min: 2})];
  S['Fleet Captain Christopher Pike'] = {abilities: [
    {label: 'Yes — Untap two other creatures', cost: {mana: '{1}', tap: true}, targets: pikeTargets(), run: ctx => {for (const c of flat(ctx.targets)) ctx.g.untap(c);}},
    {label: 'No — Tap two other creatures', cost: {mana: '{2}', tap: true}, targets: pikeTargets(), run: ctx => {for (const c of flat(ctx.targets)) ctx.g.tap(c);}},
  ]};
  S['Giant Space Amoeba'] = {kws: ['flying'], triggers: [C.attack('Weaken a defending creature, then copy this creature', async ctx => {
    C.buff(ctx, ctx.targets[0], -3, 0);
    await C.copy(ctx, ctx.src, {definition: C.snapshotCopy(ctx.src, ctx.sourceZoneVersion)});
  }, {targets: (g, c, data) => {const defender = M.defendingPlayerV92(data.defender || data.target || c.attacking); return [T.creature({filter: (g, x) => x.ctrl === defender})];}})]};
  S['Lieutenant Nyota Uhura'] = {abilities: [{label: 'Explore an opponent’s library and cast an instant or sorcery', cost: {mana: '{4}', tap: true}, targets: [T.opponent()], run: async ctx => {
    const player = ctx.targets[0], rows = [];
    for (const card of player.library.slice(-names(ctx.g, ctx.you)).reverse().slice(0, names(ctx.g, ctx.you))) {
      await ctx.g.move(card, 'exile', {revealFromLibrary: true, revealSource: ctx.src, revealController: ctx.you});
      if (card.zone === 'exile') rows.push(C.row(card));
    }
    await C.immediate(ctx, rows.filter(C.current).map(r => r.card), {filter: (c, g, so) => g.isInstantSorcerySpell(so)});
    await C.randomBottom(ctx, rows.filter(C.current).map(r => r.card), player);
  }}]};
  S['Sam Kirk, Xenoanthropologist'] = {triggers: [C.trigger('cast', 'Investigate', ctx => C.make(ctx, M.TOKENS.clue), {
    filter: (g, c, d) => d.player !== c.ctrl && g.castHasType(d.card, d.so.castOpts || {}, 'Creature'),
  })]};
  S["Amanda Grayson, Logic's Link"] = {selfCostAdjust: (g, c, p) => -g.bf().filter(x => x.ctrl === p && x.hasSub('Vulcan')).length,
    triggers: [landfall('Put two +1/+1 counters on your creature', ctx => C.add(ctx, ctx.targets[0], '+1/+1', 2), {targets: [T.yourCreature()]})]};
  S['Christine Chapel, Combat Medic'] = {triggers: [C.enterTrigger('Gain life for differently named lands', ctx => ctx.g.gainLife(ctx.you, names(ctx.g, ctx.you), ctx.src)),
    C.trigger('lifeGain', 'Put two +1/+1 counters on Christine Chapel', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1', 2))]};
  const rand = async ctx => {
    const row = ctx.trcCommander;
    if (C.current(row)) C.add(ctx, row.card, '+1/+1');
    const revealed = [], land = ctx.you.library.slice().reverse().find(c => {revealed.push(c); return c.is('Land');});
    if (revealed.length) await ctx.g.revealToHuman({cards: revealed, ctrl: ctx.you, kind: 'reveal'});
    if (land) await ctx.g.putPermanentOntoBattlefield(land, ctx.you, {tapped: true});
    await C.randomBottom(ctx, revealed.filter(c => c !== land && c.zone === 'library'));
  };
  const commanderEvent = {filter: (g, c, d) => d.card.ctrl === c.ctrl && d.card.commander,
    prepareTargets: ctx => {ctx.trcCommander = C.row(ctx.data.card);}};
  S['Janice Rand, Essential Aide'] = {triggers: [C.enterTrigger('Grow your commander and reveal a land', rand, commanderEvent), C.attack('Grow your commander and reveal a land', rand, commanderEvent)]};
  S['Lieutenant Hikaru Sulu'] = {triggers: [C.trigger('becameTapped', 'Explore', async ctx => {
    const top = ctx.you.library.at(-1);
    if (top) {
      await ctx.g.revealToHuman({cards: [top], ctrl: ctx.you, kind: 'reveal'});
      if (top.is('Land')) await ctx.g.move(top, 'hand');
      else {
        if (C.same(ctx)) C.add(ctx, ctx.src, '+1/+1');
        if (await C.yes(ctx, 'Put ' + top.name + ' into your graveyard?')) await ctx.g.move(top, 'graveyard');
      }
    } else if (C.same(ctx)) C.add(ctx, ctx.src, '+1/+1');
    await ctx.g.emit('explored', {card: ctx.src, player: ctx.you});
  }, {filter: (g, c, d) => d.card === c})],
    abilities: [{label: 'A creature can’t be blocked this turn', cost: {mana: '{2}{U}'}, targets: [T.creature()], run: ctx => unblock(ctx, ctx.targets[0])}]};
  S['Chief Kyle, Transporter Tech'] = {triggers: [landfall('Blink up to one other creature you control', ctx => blink(ctx, ctx.targets[0]), {
    targets: [T.creature({filter: (g, c, p, s) => c !== s && c.ctrl === p, count: 1, min: 0, upTo: true})],
  })]};
  S['Chief Montgomery Scott'] = {abilities: [{label: 'Put a creature or Spacecraft onto the battlefield with counters', cost: {mana: '{6}', tap: true}, run: async ctx => {
    const [card] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Creature') || c.hasSub('Spacecraft')), 0, 1, 'Put a creature or Spacecraft onto the battlefield');
    if (!card) return;
    await ctx.g.putPermanentOntoBattlefield(card, ctx.you, {additionalCountersFor: (g, entrant) => {
      const n = names(g, ctx.you);
      return {...(entrant.is('Creature') ? {'+1/+1': n} : {}), ...(entrant.hasSub('Spacecraft') ? {charge: n} : {})};
    }, additionalCounterBy: ctx.you});
  }}]};
  S['Lt. Arex, Ever-Adapting'] = {...cda, kws: ['trample'], triggers: [C.enterTrigger('Draw three, then put up to three lands onto the battlefield', async ctx => {await C.draw(ctx, 3); await putLands(ctx, 3);})]};
  S['McCoy, Not a Bricklayer'] = {triggers: [C.enterTrigger('Put a +1/+1 counter on each creature you control', ctx => {for (const c of ctx.g.creatures(ctx.you)) C.add(ctx, c, '+1/+1');}, {
    filter: (g, c, d) => d.card === c || d.card.ctrl === c.ctrl && d.card.hasSub('Doctor'),
  })], statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature') && Object.values(x.counters).some(n => n > 0)) x.cur.kw.add('lifelink');}}]};
  S['Pavel Chekov, First Posting'] = {oracleDrawReplacements: [{kind: 'draw-replacement-v8', contract: 'ordered-draw-replacement', mode: 'abundance', optional: true}]};
  S["T'Pring, Never Parted"] = {triggers: [C.enterTrigger('Your creature may fight an opposing creature; draw for their deaths this turn', async ctx => {
    const cards = flat(ctx.targets);
    if (cards.length !== 2 || !await C.yes(ctx, 'Have the chosen creatures fight?')) return;
    const rows = cards.map(C.row);
    ctx.g.delayed.push({on: 'dies', once: false, expires: 'eot', src: ctx.src, ctrl: ctx.you, name: 'T’Pring: draw for the fighting creature',
      filter: (g, d) => rows.some(r => r.card === d.card && r.version === d.snap.zoneVersion), run: next => C.draw(next)});
    await ctx.g.fight(cards[0], cards[1]);
  }, {targets: [T.creature({filter: (g, c, p, s) => c.ctrl === p && c !== s}), T.oppCreature()]})]};
  S['Command Chair'] = {entersTapped: true, mana: [
    {cost: {tap: true}, produce: C.colors.map(k => ({[k]: 3}))},
    {cost: {tap: true}, produce: (g, c, p) => {const n = Math.max(0, ...g.bf().filter(x => x.ctrl === p && x.commander).map(x => x.mv)); return C.colors.map(k => ({[k]: n}));}},
  ]};
  S['The Guardian of Forever'] = {kws: ['defender'], abilities: [{label: 'Sacrifice another nontoken creature to return it next end step', cost: {mana: '{4}', sac: (g, c, s) => c !== s && c.is('Creature') && !c.isToken}, run: ctx => {
    const snap = ctx.sacd?.[0], card = snap && ctx.g.byIid(snap.iid);
    if (card && card.zone !== 'battlefield' && card.zoneVersion === snap.zoneVersion + 1) C.returnLater(ctx, card);
  }}]};
  S['Jefferies Tube'] = {abilities: [
    {label: 'Put two charge counters on an artifact', cost: {mana: '{2}', tap: true}, targets: [T.permanent((g, c) => c.is('Artifact'))], run: ctx => C.add(ctx, ctx.targets[0], 'charge', 2)},
    {label: 'Your creature can’t be blocked this turn', cost: {mana: '{3}', tap: true}, targets: [T.yourCreature()], run: ctx => unblock(ctx, ctx.targets[0])},
    {label: 'Draw, then put a land onto the battlefield tapped', cost: {mana: '{4}', tap: true}, run: async ctx => {await C.draw(ctx); await putLands(ctx, 1);}},
  ]};
  S['Planet Killer'] = {kws: ['flying', 'indestructible'], mustAttack: true, triggers: [C.hit('Put counters on this creature for the damaged player’s lands', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1', ctx.g.lands(ctx.data.player).length))]};
  const linkState = (src, meta = src.meta) => {
    const key = 'trcBotanyLinks:' + (meta.oracleCopyState?.applied || 0);
    return meta[key] ||= [];
  };
  const captureLinks = ctx => {ctx.trcLinks = linkState(ctx.src, ctx.sourceMeta || ctx.src.meta);};
  S['S.S. Botany Bay'] = station(8, {abilities: [{label: 'Each opponent exiles a graveyard card; you may exile one', cost: {tap: true}, prepareTargets: captureLinks, run: async ctx => {
    const selections = [];
    for (const p of ctx.g.apnapFrom(ctx.you)) {
      const [card] = await C.choose(ctx.g, p, p.graveyard, p !== ctx.you && p.graveyard.length ? 1 : 0, 1, 'Exile a card from your graveyard');
      if (card) selections.push(card);
    }
    for (const c of selections) {await ctx.g.move(c, 'exile'); if (c.zone === 'exile') ctx.trcLinks.push(C.row(c));}
  }}], triggers: [C.hit('Return your creature cards exiled with this ship', async ctx => {
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const r of ctx.trcLinks.filter(C.current)) if (r.card.owner === ctx.you && r.card.is('Creature')) await ctx.g.putPermanentOntoBattlefield(r.card, ctx.you);});
  }, {filter: (g, c, d) => d.src === c && d.combat && (c.counters.charge || 0) >= 8, prepareTargets: captureLinks})]});
  const communicatorAttack = C.attack('Draw for other creatures carrying Communicators, then put lands onto the battlefield', async ctx => {
    const n = ctx.g.creatures(ctx.you).filter(c => !(c === ctx.src && c.zoneVersion === ctx.sourceZoneVersion) && C.attachments(ctx.g, c).some(a => a.hasSub('Communicator'))).length;
    await C.draw(ctx, n); await putLands(ctx, n);
  });
  S['Starfleet Communicator'] = {equip: '{1}', attachGrant: (g, c, host) => {host.cur.extraTriggers.push(communicatorAttack);},
    triggers: [C.trigger('cast', 'Copy this Communicator spell', ctx => ctx.g.copySpell(ctx.data.so, ctx.you), {zone: 'stack', filter: (g, c, d) => d.card === c})]};
  S['Starship Enterprise'] = station(16, {triggers: [landfall('Put four charge counters on Starship Enterprise', ctx => C.same(ctx) && C.add(ctx, ctx.src, 'charge', 4)),
    C.hit('Draw cards equal to combat damage dealt', ctx => C.draw(ctx, ctx.data.n), {filter: (g, c, d) => d.src === c && d.combat && (c.counters.charge || 0) >= 16})]});
  S['U.S.S. Defiant, Mirror Migrant'] = station(8, {kws: ['flash'], triggers: [C.enterTrigger('Phase out this ship and up to one creature you control', ctx => {
    const cards = [...(C.same(ctx) ? [ctx.src] : []), ...flat(ctx.targets)];
    ctx.g.phaseOutMany([...new Set(cards)]);
  }, {targets: [T.yourCreature({count: 1, min: 0, upTo: true})]})]});
  S['U.S.S. Farragut, Bold Explorer'] = station(7, {triggers: [landfall('Put a creature from hand onto the battlefield with haste until the next end step', async ctx => {
    const [card] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Creature')), 0, 1, 'Put a creature onto the battlefield with haste');
    if (!card) return;
    await ctx.g.putPermanentOntoBattlefield(card, ctx.you);
    if (card.zone !== 'battlefield') return;
    const row = C.row(card);
    C.grant(ctx, card, ['haste']);
    ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Farragut: bottom the creature, then draw', run: async next => {
      if (!C.current(row)) return;
      await next.g.move(card, 'library', {toBottom: true});
      if (card.zone === 'library') {
        // “When you do” is a reflexive trigger, so players may respond to the draw.
        next.g.queueTrigger({src: next.src, ctrl: next.you, name: 'Farragut: draw a card', run: drawCtx => C.draw(drawCtx)});
      }
    }});
  })]});
  S['Cold-Blooded Crew'] = {triggers: [C.enterTrigger('Put two +1/+1 counters on a creature', ctx => C.add(ctx, ctx.targets[0], '+1/+1', 2), {targets: [T.creature()]})],
    statics: [{apply: (g, c) => {c.cur.cantBeBlockedBy = (g, blocker) => blocker.power <= 2;}}]};
  M.applyOracleMechanic(S['Cold-Blooded Crew'], {kind: 'typecycling', subtype: 'basic land', cost: '{2}'});
  S['Syndicate Liquidators'] = {kws: ['trample'], triggers: [landfall('Put two +1/+1 counters on your creature', ctx => C.add(ctx, ctx.targets[0], '+1/+1', 2), {targets: [T.yourCreature()]})]};
  for (const [name, colors] of [['Earth, Sector 001', ['G', 'U']], ['Risa', ['G', 'W']], ['Vulcan', ['W', 'U']]]) S[name] = {
    entersTapped: true, producesColors: colors, mana: {cost: {tap: true}, produce: colors.map(k => ({[k]: 1}))},
    triggers: [C.enterTrigger('Gain 1 life', ctx => ctx.g.gainLife(ctx.you, 1, ctx.src))],
  };
  M.StarTrekLanding = {names, station, spock, kirk, officer, tribble};
})();
