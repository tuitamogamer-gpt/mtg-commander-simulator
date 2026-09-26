'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FDC, S = M.SCRIPTS, T = M.T;
  S['Carnelian Orb of Dragonkind'] = {mana: {cost: {tap: true}, produce: [{R: 1}], cslHasteMana: 'dragon'}};
  S['Consumed by Greed'] = C.gift({
    targets: (g, c, a) => [T.opponent(), ...(a?.bdfGift ? [C.grave((g, c, p) => c.owner === p && c.is('Creature'))] : [])],
    resolve: async ctx => {
      await M.BDF.bdfGiveGift(ctx);
      const p = ctx.targets[0];
      if (p) {
        const max = Math.max(...ctx.g.creatures(p).map(c => c.power));
        await C.sacrifice(ctx, p, c => c.is('Creature') && c.power === max, 1);
      }
      if (ctx.so.castOpts.bdfGift && ctx.targets[1]) await ctx.g.move(ctx.targets[1], 'hand');
    },
  });
  S['Fall from Favor'] = {auraTarget: [T.creature()],
    attachGrant: (g, c, host) => {if (g.monarch !== host.ctrl) host.cur.cantUntap = true;},
    triggers: [C.enterTrigger('Tap the enchanted creature and become the monarch', async ctx => {
      const host = ctx.g.byIid(ctx.sourceAttachedTo);
      if (host?.zone === 'battlefield' && host.zoneVersion === ctx.sourceAttachedToZoneVersion) ctx.g.tap(host);
      await ctx.g.becomeMonarch(ctx.you);
    })],
  };
  S['Hit the Mother Lode'] = {resolve: C.discoverTreasure};
  S['Ram Through'] = {targets: [T.creature({filter: (g, c, p) => c.ctrl === p}), T.creature({filter: (g, c, p) => c.ctrl !== p})], resolve: async ctx => {
    const [source, target] = ctx.targets;
    if (!source || !target) return;
    const power = Math.max(0, source.power);
    const lethal = Math.max(0, target.toughness - target.damage);
    const needed = source.kw('deathtouch') ? Math.min(1, lethal) : lethal;
    const excess = source.kw('trample') ? Math.max(0, power - needed) : 0;
    await ctx.g.damageBatch([{src: source, target, n: power - excess}, ...(excess ? [{src: source, target: target.ctrl, n: excess}] : [])]);
  }};
  S['The Elder Dragon War'] = {readAhead: true,
    asEnters: async (g, c) => {
      const n = Number(await C.option({g, src: c, you: c.ctrl}, [1, 2, 3].map(n => ({key: String(n), label: 'Begin at chapter ' + n})), 'Read ahead'));
      if (![1, 2, 3].includes(n)) throw Error('Invalid read ahead');
      c.counters.lore = n - 1; c.meta.cwwReadAhead = n;
    },
    saga: [
      {run: ctx => C.damage(ctx, ctx.g.creatures().concat(ctx.you.opponents(ctx.g)), 2)},
      {run: async ctx => {
        const cards = await C.choose(ctx.g, ctx.you, ctx.you.hand, 0, ctx.you.hand.length, 'Discard any number of cards', 'discard');
        const discarded = await ctx.g.discard(ctx.you, cards);
        await C.draw(ctx, Array.isArray(discarded) ? discarded.length : cards.length);
      }},
      {run: ctx => C.make(ctx, C.token('Dragon', ['Dragon'], 4, 4, ['R'], ['flying'], {tokenImageName: 'FDC Dragon'}))},
    ],
  };
})();
