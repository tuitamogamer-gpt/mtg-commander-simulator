'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL, S = M.SCRIPTS, T = M.T;
  S['Alliance of Arms'] = {resolve: ctx => C.joinForces(ctx, (p, n) => C.make({...ctx, you: p}, C.token('Soldier', ['Soldier'], 1, 1, ['W']), n))};
  S['Shared Trauma'] = {resolve: ctx => C.joinForces(ctx, (p, n) => C.mill(ctx, n, p))};
  S['Bathe in Light'] = {targets: [T.creature()], resolve: async ctx => {
    const col = await C.color(ctx), colors = ctx.targets[0].colors;
    for (const c of ctx.g.creatures()) if (c === ctx.targets[0] || c.colors.some(x => colors.includes(x))) C.protection(ctx, c, col);
  }};
  S['Cleansing Beam'] = {targets: [T.creature()], resolve: ctx => {
    const target = ctx.targets[0], colors = target.colors;
    return C.damage(ctx, ctx.g.creatures().filter(c => c === target || c.colors.some(x => colors.includes(x))), 2);
  }};
  S['Death by Dragons'] = {targets: [T.player()], resolve: async ctx => {
    for (const p of ctx.g.apnapFrom(ctx.you)) if (p !== ctx.targets[0]) await C.make({...ctx, you: p}, C.token('Dragon', ['Dragon'], 5, 5, ['R'], ['flying']));
  }};
  S['Finale of Devastation'] = {xCost: true, resolve: async ctx => {
    const canSearch = ctx.g.canSearchLibrary(ctx.you), library = canSearch ? ctx.g.searchableLibrary(ctx.you) : [];
    const [c] = await C.choose(ctx.g, ctx.you, [...library, ...ctx.you.graveyard].filter(c => c.is('Creature') && c.mv <= ctx.x), 0, 1, 'Search library and/or graveyard for a creature');
    if (c) await ctx.g.putPermanentOntoBattlefield(c, ctx.you);
    if (canSearch) {M.shuffle(ctx.you.library, ctx.g.rnd); await ctx.g.emit('searchedLibrary', {player: ctx.you});}
    if (ctx.x >= 10) for (const c of ctx.g.creatures(ctx.you)) C.buff(ctx, c, ctx.x, ctx.x, ['haste']);
  }};
  S['Firespout'] = {resolve: ctx => {
    const paid = ctx.so.paymentColorCounts || {};
    return C.damage(ctx, ctx.g.creatures().filter(c => c.kw('flying') ? paid.G > 0 : paid.R > 0), 3);
  }};
  S['Glimpse the Impossible'] = {resolve: async ctx => {
    const rows = (await C.exileTop(ctx, 3)).map(C.row);
    for (const r of rows) C.playGrant(ctx, r.card, {turn: ctx.g.turnNo});
    ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Glimpse the Impossible: make Spawn', run: async next => {
      let n = 0;
      await next.g.withGraveyardEntryBatch(async () => {for (const r of rows) if (C.current(r)) {await next.g.move(r.card, 'graveyard'); if (r.card.zone === 'graveyard') n++;}});
      await C.make(next, C.spawn, n);
    }});
  }};
  S['Goblin Negotiation'] = {xCost: true, targets: [T.creature()], resolve: async ctx => {
    const c = ctx.targets[0], lethal = Math.max(0, c.toughness - c.damage), dealt = await ctx.g.damageAny(ctx.src, c, ctx.x);
    await C.make(ctx, M.TOKENS.goblin, Math.max(0, dealt - lethal));
  }};
  S['Insurrection'] = {resolve: ctx => {for (const c of ctx.g.creatures()) C.steal(ctx, c);}};
  S['Murmurs from Beyond'] = {resolve: async ctx => {
    const cards = await C.reveal(ctx, 3), p = await C.choosePlayer(ctx, ctx.you.opponents(ctx.g), 'Choose an opponent');
    const [chosen] = p ? await C.choose(ctx.g, p, cards, 1, 1, 'Choose a card to put into the graveyard') : [];
    for (const c of cards) await ctx.g.move(c, c === chosen ? 'graveyard' : 'hand');
  }};
  S['Pollen Lullaby'] = {resolve: async ctx => {
    ctx.g.untilEffects.push({kind: 'preventAllCombat', expires: 'eot'});
    const result = await ctx.g.clash(ctx.you, {source: ctx.src});
    if (result.won) for (const c of ctx.g.creatures(result.opponent)) c.meta.noUntapOnce = true;
  }};
  S['Punishing Fire'] = {targets: [T.any()], resolve: ctx => ctx.g.damageAny(ctx.src, ctx.targets[0], 2), triggers: [C.trigger('lifeGain', 'Pay red to return Punishing Fire', async ctx => {
    if (ctx.src.zone === 'graveyard' && await C.pay(ctx, '{R}')) await ctx.g.move(ctx.src, 'hand');
  }, {zone: 'graveyard', filter: (g, c, d) => d.player !== c.owner})]};
  S['Ray of Command'] = {targets: [T.oppCreature()], resolve: ctx => {
    const c = ctx.targets[0]; C.steal(ctx, c); c.meta.cslRayController = {player: ctx.you.idx, version: c.zoneVersion, source: ctx.src};
  }};
  S['Scattering Stroke'] = {targets: [T.spell()], resolve: async ctx => {
    const n = ctx.g.stackSpellManaValue(ctx.targets[0]); await ctx.g.counterStackObject(ctx.targets[0], {source: ctx.src});
    if (!(await ctx.g.clash(ctx.you, {source: ctx.src})).won) return;
    const state = {used: false};
    for (const on of ['precombatMain', 'postcombatMain']) ctx.g.delayed.push({on, once: true, src: ctx.src, ctrl: ctx.you, name: 'Scattering Stroke: add mana', filter: (g, d) => d.player === ctx.you && !state.used, run: async next => {state.used = true; if (await C.yes(next, 'Add ' + n + ' colorless mana?')) next.you.pool.C += n;}});
  }};
  S['Spell Crumple'] = {targets: [T.spell()], resolve: async ctx => {
    const so = ctx.targets[0], countered = await ctx.g.counterStackObject(so, {source: ctx.src, toZone: 'library'});
    if (countered && !so.isCopy && so.card.zone === 'library') {const library = so.card.owner.library; library.splice(library.indexOf(so.card), 1); library.unshift(so.card);}
    if (!ctx.so.isCopy && ctx.src.zone === 'stack') await ctx.g.move(ctx.src, 'library', {toBottom: true});
  }};
  S['Trade Secrets'] = {targets: [T.opponent()], resolve: async ctx => {
    const p = ctx.targets[0];
    do {
      await C.draw(ctx, 2, p);
      const n = await ctx.you.controller.decide(ctx.g, {type: 'chooseX', min: 0, max: 4, card: ctx.src, prompt: 'Draw up to four cards', aiHint: {kind: 'chooseX'}});
      if (!Number.isSafeInteger(n) || n < 0 || n > 4) throw Error('Invalid draw count');
      await C.draw(ctx, n);
    } while (!p.lost && !ctx.you.lost && !ctx.g.gameOver && await C.option(ctx, [{key: 'yes', label: 'Repeat'}, {key: 'no', label: 'Stop drawing'}], 'Repeat Trade Secrets?', p, 'tradeSecrets') === 'yes');
  }};
  S['Vengeful Rebirth'] = {exileOnResolve: true, targets: [C.grave((g, c, p) => c.owner === p), T.any()], resolve: async ctx => {
    const c = ctx.targets[0]; if (!c) return; const n = c.mv, nonland = !c.is('Land');
    await ctx.g.move(c, 'hand'); if (c.zone === 'hand' && nonland && ctx.targets[1]) await ctx.g.damageAny(ctx.src, ctx.targets[1], n);
  }};
  S['Whirlpool Whelm'] = {targets: [T.creature()], resolve: async ctx => {
    const won = (await ctx.g.clash(ctx.you, {source: ctx.src})).won;
    await ctx.g.move(ctx.targets[0], won && await C.yes(ctx, 'Put the creature on top of its library?') ? 'library' : 'hand');
  }};
})();
