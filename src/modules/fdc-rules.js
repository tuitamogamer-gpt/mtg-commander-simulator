'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FRC, G = M.Game.prototype;
  const emit = G.emit;
  G.emit = function (on, data) {
    // The permission ends as the end step begins, before its damage trigger
    // resolves. A removed/recast card cannot regain an old exile permission.
    if (on === 'endStep') this.c1719Permissions = (this.c1719Permissions || []).filter(r => r.fdcUntilEndOf !== data.player.idx);
    if (on === 'etb' && data.card?.def.fdcGiftPermanent) data.fdcGiftPlayer = data.card.castMeta?.bdfGiftPlayer;
    if (on === 'attacks' && data.card?.def.fdcPackTactics) {
      data.fdcPackPower = (this.combat?.attackers || []).reduce((n, c) => n + c.power, 0);
    }
    return emit.call(this, on, data);
  };
  async function dragonhawk(ctx) {
    const count = ctx.g.creatures(ctx.you).filter(c => c.power >= 4).length;
    const cards = await C.exileTop(ctx, count), rows = cards.map(C.row);
    for (const c of cards) C.playGrant(ctx, c, {fdcUntilEndOf: ctx.you.idx});
    ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you,
      name: 'Dragonhawk: damage for its remaining exiled cards', filter: (g, d) => d.player === ctx.you,
      run: next => C.damage(next, next.you.opponents(next.g), 2 * rows.filter(C.current).length)});
  }
  async function discoverTreasure(ctx) {
    const rows = []; let hit;
    for (const c of ctx.you.library.slice().reverse()) {
      await ctx.g.move(c, 'exile');
      if (c.zone !== 'exile') continue;
      rows.push(C.row(c));
      if (!c.is('Land') && c.mv <= 10) {hit = c; break;}
    }
    const value = hit?.mv;
    if (hit) {
      await C.immediate(ctx, [hit], {filter: (c, g, so) => g.stackSpellManaValue(so) <= 10});
      if (hit.zone === 'exile' && C.current(rows.at(-1))) await ctx.g.move(hit, 'hand');
    }
    await C.randomBottom(ctx, rows.filter(C.current).filter(r => r.card !== hit).map(r => r.card));
    if (value !== undefined && value < 10) await C.make(ctx, M.TOKENS.treasure, 10 - value, {tapped: true});
  }
  const gift = script => ({...script, bdfGift: 'card', altCosts: [{label: 'Promise a gift: card', bdfGift: true}]});
  M.FDC = {...C, dragonhawk, discoverTreasure, gift};
})();
