'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, SC = M.SCRIPTS, C = M.C1920, E = M.E, T = M.T;
  SC['Wyleth, Soul of Steel'] = {triggers: [{on: 'attacks', filter: (g, c, d) => d.card === c,
    desc: 'Draw for each Aura and Equipment attached to Wyleth', run: ctx => {
      const state = C.sourceState(ctx), attachments = state?.attachments || [];
      const n = state !== ctx.src ? (state?.attachedSources || []).filter(r => r.snap.subtypes.some(t => t === 'Aura' || t === 'Equipment')).length : attachments.filter(iid => {const c = ctx.g.byIid(iid); return c?.zone === 'battlefield' && (c.hasSub('Aura') || c.hasSub('Equipment'));}).length;
      return ctx.g.draw(ctx.you, n, ctx.src);
    }}]};
  SC['Peel from Reality'] = {targets: [T.yourCreature(), T.creature({filter: (g, c, p) => c.ctrl !== p})], resolve: ctx => ctx.g.bounceMany(C.flat(ctx.targets))};
  SC["Jaya's Immolating Inferno"] = {xCost: true,
    oracleCastRestriction: (g, c, p) => g.bf().some(x => x.ctrl === p && x.cur.super.includes('Legendary') && (x.is('Creature') || x.is('Planeswalker'))),
    targets: [T.any({count: 3, min: 0, upTo: true, aiHint: {goal: 'damage'}})],
    resolve: ctx => ctx.g.damageBatch(C.flat(ctx.targets).map(target => ({src: ctx.src, target, n: ctx.x})), {deferSBA: true})};
  const sea = (g, c, merfolk = false) => (merfolk ? ['Merfolk', 'Kraken', 'Leviathan', 'Octopus', 'Serpent'] : ['Kraken', 'Leviathan', 'Octopus', 'Serpent']).some(t => c.hasSub(C.type(g, t)));
  SC['Whelming Wave'] = {resolve: ctx => ctx.g.bounceMany(ctx.g.creatures().filter(c => !sea(ctx.g, c)))};
  SC['Slinn Voda, the Rising Deep'] = {kicker: {cost: '{1}{U}'}, triggers: [C.enterTrigger('If kicked, return creatures except Merfolk and sea monsters', ctx => ctx.g.bounceMany(ctx.g.creatures().filter(c => !sea(ctx.g, c, true))), {filter: (g, c, d) => d.card === c && !!c.castMeta?.kicked})]};
  SC['Tales of the Ancestors'] = {foretell: {cost: '{1}{U}'}, resolve: async ctx => {
    const players = ctx.g.apnapFrom(ctx.g.turnPlayer), maximum = Math.max(0, ...players.map(p => p.hand.length));
    const rows = players.map(p => ({p, n: maximum - p.hand.length}));
    for (const {p, n} of rows) if (n) await ctx.g.draw(p, n, ctx.src);
  }};
  SC['Poison the Cup'] = {foretell: {cost: '{1}{B}'}, targets: [T.creature({aiHint: {goal: 'destroy'}})], resolve: async ctx => {
    if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0], {source: ctx.src});
    if (ctx.so.zkWasForetold) await E.scry(ctx.g, ctx.you, 2);
  }};
  SC['Stoic Farmer'] = {foretell: {cost: '{1}{W}'}, triggers: [C.enterTrigger('Search for a basic Plains; ramp if an opponent has more lands', ctx => {
    const behind = ctx.you.opponents(ctx.g).some(p => ctx.g.lands(p).length > ctx.g.lands(ctx.you).length);
    return C.search(ctx, ctx.you, c => C.basic(c) && c.hasSub(C.type(ctx, 'Plains')), 1, behind ? 'battlefield' : 'hand', true);
  })]};
  SC['Cultivator of Blades'] = {triggers: [{on: 'attacks', filter: (g, c, d) => d.card === c, opt: true,
    desc: 'Other attacking creatures get this creature’s power in +X/+X', run: ctx => {
      const n = C.sourceState(ctx)?.power || 0;
      for (const c of ctx.g.creatures().filter(c => c !== ctx.src && c.attacking)) E.pumpUntilEOT(ctx.g, c, n, n);
    }}]};
  M.applyOracleMechanic(SC['Cultivator of Blades'], {kind: 'fabricate', n: 2});
  SC['Relic Seeker'] = {triggers: [{on: 'renowned', filter: (g, c, d) => d.card === c, opt: true,
    desc: 'Search for an Equipment card', run: ctx => C.search(ctx, ctx.you, c => c.hasSub(C.type(ctx, 'Equipment')), 1)}]};
  M.applyOracleMechanic(SC['Relic Seeker'], {kind: 'renown', n: 1});
})();
