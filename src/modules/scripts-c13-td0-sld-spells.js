'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, S = M.SCRIPTS, T = M.T;
  S['Famine'] = {resolve: ctx => C.damage(ctx, [...ctx.g.creatures(), ...ctx.g.alivePlayers()], 3)};
  S['Order of Succession'] = {resolve: async ctx => {
    const dir = await C.direction(ctx), order = [ctx.you];
    for (let p = C.neighbor(ctx.g, ctx.you, dir); p && p !== ctx.you; p = C.neighbor(ctx.g, p, dir)) order.push(p);
    const choices = [];
    for (const p of order) {
      const next = C.neighbor(ctx.g, p, dir), [card] = await C.choose(ctx.g, p, next ? ctx.g.creatures(next) : [], 1, 1, 'Choose a creature controlled by the next player');
      if (card) choices.push({p, card});
    }
    for (const {p, card} of choices) M.OracleV8Control.gain(ctx.g, card, p);
    ctx.g.recalc();
  }};
  S['Tempt with Immortality'] = {resolve: ctx => C.tempting(ctx, p => C.reanimateChoice(ctx, p))};
  S['Tempt with Glory'] = {resolve: ctx => C.tempting(ctx, p => {for (const card of ctx.g.creatures(p)) C.add(ctx, card, '+1/+1');})};
  S['Tempt with Reflections'] = {targets: [T.creature({filter: (g, c, p) => c.ctrl === p})], resolve: ctx => {
    const definition = M.OracleV8Faces.copyTokenDefinition(ctx.targets[0]);
    return C.tempting(ctx, p => C.copy({...ctx, you: p}, ctx.targets[0], {definition}));
  }};
  S["Lim-Dûl's Vault"] = {resolve: async ctx => {
    let cards;
    do {
      cards = await C.look(ctx, 5);
      const repeat = cards.length && ctx.g.canPayLife(ctx.you, 1) && await C.option(ctx,
        [{key: 'no', label: 'Keep these cards'}, {key: 'yes', label: 'Pay 1 life and look at another five'}], 'Keep these five or pay one life?', ctx.you, 'c13Vault') === 'yes';
      if (!repeat) break;
      await ctx.g.loseLife(ctx.you, 1, ctx.src.name); await C.bottom(ctx, cards);
    } while (true);
    const keep = new Set(cards); ctx.you.library = ctx.you.library.filter(c => !keep.has(c));
    M.shuffle(ctx.you.library, ctx.g.rnd);
    // Reinsert the looked-at physical cards before ordinary moves preserve zone identity.
    ctx.you.library.push(...cards); await C.topOrder(ctx, cards);
  }};
  S['Cruel Ultimatum'] = {targets: [T.opponent()], resolve: async ctx => {
    const p = ctx.targets[0]; await C.sacrifice(ctx, p, c => c.is('Creature')); await C.discard(ctx, p, 3); await ctx.g.loseLife(p, 5, ctx.src.name);
    const [card] = await C.choose(ctx.g, ctx.you, ctx.you.graveyard.filter(c => c.is('Creature')), 1, 1, 'Return a creature card to your hand');
    if (card) await ctx.g.move(card, 'hand'); await C.draw(ctx, 3); await ctx.g.gainLife(ctx.you, 5, ctx.src);
  }};
  S['Molten Disaster'] = {xCost: true, kicker: {cost: '{R}'}, c13KickedSplitSecond: true, resolve: ctx => C.damage(ctx, [...ctx.g.creatures().filter(c => !c.kw('flying')), ...ctx.g.alivePlayers()], ctx.x)};
  S['Fireball'] = {xCost: true, targets: [T.any({count: 100, min: 0, upTo: true})],
    selfTargetCostAdjust: (g, c, p, opts) => Math.max(0, C.flat(opts.targets || []).length - 1),
    resolve: ctx => {const targets = C.flat(ctx.targets).filter(Boolean), n = ctx.so.targetIdentities?.flat(Infinity).filter(Boolean).length || ctx.so.targets?.flat(Infinity).length || targets.length; return C.damage(ctx, targets, n ? Math.floor(ctx.x / n) : 0);}};
  S['From the Ashes'] = {resolve: async ctx => {
    const lands = ctx.g.lands().filter(c => !c.cur.super.includes('Basic')).map(c => ({card: c, player: c.ctrl, version: c.zoneVersion}));
    await ctx.g.destroyMany(lands.map(r => r.card), {source: ctx.src});
    for (const p of ctx.g.apnapFrom(ctx.you)) {
      const n = lands.filter(r => r.player === p && r.card.zoneVersion !== r.version).length;
      if (n && await C.yes(ctx, 'Search for up to ' + n + ' basic lands?', p)) await C.search(ctx, p, c => c.is('Land') && c.def.super.includes('Basic'), n, 'battlefield');
    }
  }};
  S['Sudden Demise'] = {xCost: true, resolve: async ctx => {const color = await C.color(ctx); await C.damage(ctx, ctx.g.creatures().filter(c => c.colors.includes(color)), ctx.x);}};
  S['Reincarnation'] = {targets: [T.creature()], resolve: ctx => {
    const card = ctx.targets[0], row = C.row(card), marker = {kind: 'c13Reincarnation', expires: 'eot'}; ctx.g.untilEffects.push(marker);
    ctx.g.delayed.push({on: 'dies', once: true, src: ctx.src, ctrl: ctx.you, name: 'Reincarnation: return a creature',
      filter: (g, d) => g.untilEffects.includes(marker) && d.card === card && d.snap.zoneVersion === row.version,
      run: next => C.reanimateChoice(next, card.owner)});
  }};
  S['Search for Glory'] = {resolve: async ctx => {
    await C.search(ctx, ctx.you, c => c.def.super.includes('Snow') && C.permanent(ctx.g, c) || c.def.super.includes('Legendary') || c.hasSub('Saga'), 1);
    await ctx.g.gainLife(ctx.you, ctx.so.snowSpent || 0, ctx.src);
  }};
  S["All Hallow's Eve"] = {resolve: async ctx => {
    if (ctx.src.zone !== 'stack' || ctx.so.isCopy) return;
    await ctx.g.move(ctx.src, 'exile'); if (ctx.src.zone === 'exile') C.add(ctx, ctx.src, 'scream', 2);
  }, triggers: [C.upkeep('Remove a scream counter; return all creature cards when the last is removed', async ctx => {
    if (ctx.src.zone !== 'exile' || ctx.src.zoneVersion !== ctx.sourceZoneVersion || !(ctx.src.counters.scream > 0)) return;
    ctx.g.removeCounters(ctx.src, 'scream', 1); if (ctx.src.counters.scream > 0) return;
    await ctx.g.move(ctx.src, 'graveyard');
    const cards = ctx.g.alivePlayers().flatMap(p => p.graveyard.filter(c => c.is('Creature')));
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const card of cards) if (card.zone === 'graveyard') await ctx.g.putPermanentOntoBattlefield(card, card.owner);});
  }, {zone: 'exile', filter: (g, c, d) => d.player === c.owner && c.counters.scream > 0})]};
  S['Ashes to Ashes'] = {targets: [T.creature({count: 2, filter: (g, c) => !c.is('Artifact')})], resolve: async ctx => {await ctx.g.exileMany(C.flat(ctx.targets).filter(Boolean)); await ctx.g.damageAny(ctx.src, ctx.you, 5);}};
  S['Chain Lightning'] = {targets: [T.any()], resolve: async ctx => {
    const target = ctx.targets[0], p = target instanceof M.Player ? target : target.ctrl;
    await ctx.g.damageAny(ctx.src, target, 3);
    if (!p.lost && await C.pay({...ctx, you: p}, '{R}{R}') && await C.yes(ctx, 'Copy Chain Lightning?', p)) await ctx.g.copySpell(ctx.so, p, {mayNewTargets: true});
  }};
  S['Capsize'] = {buyback: '{3}', targets: [T.permanent()], resolve: ctx => ctx.g.move(ctx.targets[0], 'hand')};
  S['Hinder'] = {targets: [T.spell()], resolve: async ctx => {
    const so = ctx.targets[0], countered = await ctx.g.counterStackObject(so, {source: ctx.src, toZone: 'library'});
    if (countered && !so.isCopy && so.card.zone === 'library' && await C.option(ctx, [{key: 'top', label: 'Top'}, {key: 'bottom', label: 'Bottom'}], 'Put the countered card on top or bottom') === 'bottom') await ctx.g.move(so.card, 'library', {toBottom: true});
  }};
  S['Overwhelming Intellect'] = {targets: [T.spell((g, so) => g.castHasType(so.card, so.castOpts || {}, 'Creature'))], resolve: async ctx => {
    const so = ctx.targets[0], n = ctx.g.stackSpellManaValue(so); await ctx.g.counterStackObject(so, {source: ctx.src}); await C.draw(ctx, n);
  }};
})();
