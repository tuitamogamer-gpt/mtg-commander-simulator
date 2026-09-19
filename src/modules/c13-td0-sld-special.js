'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, G = M.Game.prototype, S = M.StarterCasting;
  C.meld = async ctx => {
    const gisela = ctx.src;
    if (!C.same(ctx) || gisela.ctrl !== ctx.you || gisela.owner !== ctx.you) return;
    const [bruna] = await C.choose(ctx.g, ctx.you, ctx.g.creatures(ctx.you).filter(c => c.name === 'Bruna, the Fading Light' && c.owner === ctx.you), 1, 1, 'Choose Bruna to meld');
    if (!bruna) return;
    const parts = [gisela, bruna].flatMap(c => M.Mutate.components(c));
    const valid = parts.length === 2 && parts.every(r => !r.isToken) && parts[0].def.name === 'Gisela, the Broken Blade' && parts[1].def.name === 'Bruna, the Fading Light';
    await ctx.g.exileMany([gisela, bruna]);
    if (!valid || gisela.zone !== 'exile' || bruna.zone !== 'exile') return;
    ctx.g.remove(bruna); bruna.zone = 'merged'; bruna.zoneVersion++; bruna.cur = null;
    gisela.def = M.DEFS['Brisela, Voice of Nightmares'];
    gisela.mutateState = {components: parts, faceUpDefinition: gisela.def, c13Meld: true};
    gisela.commander = parts.some(r => r.commander);
    await ctx.g.putPermanentOntoBattlefield(gisela, ctx.you);
  };
  const mv = Object.getOwnPropertyDescriptor(M.CardInst.prototype, 'mv');
  Object.defineProperty(M.CardInst.prototype, 'mv', {...mv, get() {
    if (this.zone === 'battlefield' && this.mutateState?.c13Meld && !this.faceDown && !this.isCopyOf) return this.mutateState.components.reduce((n, r) => n + M.mv(r.def.cost || ''), 0);
    return mv.get.call(this);
  }});
  // Illusionary Mask compares printed costs against the colors actually spent
  // on its activation. The cast itself is free and exists only in this frame.
  C.maskAffordable = (cost, paid, snowPaid = {}, limit = Infinity) => {
    if (!cost) return false;
    const parsed = {generic: 0, pips: []}, pool = {...paid}, snow = {...snowPaid}, total = Object.values(pool).reduce((a, b) => a + b, 0);
    for (const [,symbol] of cost.matchAll(/\{([^}]+)\}/g)) {
      if (/^\d+$/.test(symbol)) parsed.generic += Number(symbol);
      else if (!['X', 'Y', 'Z'].includes(symbol)) parsed.pips.push(symbol.split('/'));
    }
    const take = color => {const snowy = pool[color] <= (snow[color] || 0); pool[color]--; if (snowy) snow[color]--; return () => {pool[color]++; if (snowy) snow[color]++;};};
    const match = i => {
      const remaining = Object.values(pool).reduce((a, b) => a + b, 0);
      if (total - remaining > limit) return false;
      if (i === parsed.pips.length) return remaining >= parsed.generic && total - remaining + parsed.generic <= limit;
      for (const color of parsed.pips[i]) {
        if (color === '2') {
          for (const a of Object.keys(pool)) for (const b of Object.keys(pool)) if (pool[a] > 0 && pool[b] >= (a === b ? 2 : 1)) {
            const undoA = take(a), undoB = take(b), ok = match(i + 1); undoB(); undoA(); if (ok) return true;
          }
        } else if (color === 'S') {
          for (const c of Object.keys(snow)) if (snow[c] > 0 && pool[c] > 0) {snow[c]--; pool[c]--; const ok = match(i + 1); pool[c]++; snow[c]++; if (ok) return true;}
        } else if (pool[color] > 0) {const undo = take(color), ok = match(i + 1); undo(); if (ok) return true;}
      }
      return false;
    };
    return match(0);
  };
  C.mask = async ctx => {
    const pool = ctx.you.hand.filter(c => c.is('Creature') && C.maskAffordable(c.def.cost, ctx.paymentColorCounts || {}, ctx.c13SnowColors, ctx.x));
    const [card] = await C.choose(ctx.g, ctx.you, pool, 0, 1, 'Cast a creature face down with Illusionary Mask');
    if (!card) return;
    const alt = {starterPermission: 'c13Mask', starterCardVersion: card.zoneVersion, faceDownCast: 'c13Mask', free: true, speed: 'instant'};
    const frame = {card, p: ctx.you, alt}; (ctx.g.c13MaskFrames ||= []).push(frame);
    try {await ctx.g.castSpell(ctx.you, card, {from: 'hand', alt});} finally {ctx.g.c13MaskFrames.splice(ctx.g.c13MaskFrames.indexOf(frame), 1);}
  };
  const prior = {allowed: S.allowed, prepare: S.prepare, validate: S.validate, commit: S.commit};
  S.allowed = (g, p, c, a) => a.starterPermission !== 'c13Mask' ? prior.allowed(g, p, c, a) :
    c.zone === 'hand' && c.owner === p && g.canCastTiming(p, c, a) && (g.c13MaskFrames || []).some(r => r.card === c && r.p === p && Object.keys(r.alt).every(k => a[k] === r.alt[k]) && Object.keys(a).every(k => k === 'from' ? a[k] === 'hand' : k === 'xVal' ? a[k] === 0 : a[k] === r.alt[k]));
  S.prepare = (ctx, paid) => ctx.so.castOpts.starterPermission === 'c13Mask' ? Promise.resolve(S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts)) : prior.prepare(ctx, paid);
  S.validate = ctx => ctx.so.castOpts.starterPermission === 'c13Mask' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.validate(ctx);
  S.commit = ctx => {if (ctx.so.castOpts.starterPermission !== 'c13Mask') prior.commit(ctx);};
  const costs = G.faceUpCosts;
  G.faceUpCosts = function (c) {const out = costs.call(this, c); return c.meta.faceDownKind === 'c13Mask' ? out.filter(r => r.kind !== 'mana cost') : out;};
  C.maskReveal = (g, c) => {
    if (!c?.faceDown || c.meta.faceDownKind !== 'c13Mask' || c.zone !== 'battlefield') return false;
    const def = c.meta.faceDownDef; c.def = def; c.faceDown = false; delete c.meta.faceDownDef; delete c.meta.faceDownKind;
    g.recalc();
    const pending = (async () => {if (def.asTurnFaceUp) await def.asTurnFaceUp(g, c); await g.emit('turnedFaceUp', {card: c, player: c.ctrl, x: 0});})();
    (g._pendingRuleEvents ||= []).push(pending.then(() => null, error => ({error})));
    return true;
  };
  const tap = G.tap;
  G.tap = function (c, opts) {if (c?.zone === 'battlefield' && !c.phasedOut && !c.tapped) C.maskReveal(this, c); return tap.call(this, c, opts);};
  const amount = G.dmgAmount;
  G.dmgAmount = function (c, step) {const n = amount.call(this, c, step); return n > 0 && C.maskReveal(this, c) ? amount.call(this, c, step) : n;};
  const batch = G.damageBatch;
  G.damageBatch = function (hits, opts) {for (const hit of hits) if (hit.n > 0) {C.maskReveal(this, hit.src); C.maskReveal(this, hit.target);} return batch.call(this, hits, opts);};
  for (const key of ['damageAny', 'damageCreature', 'damagePlayer']) {
    const damage = G[key];
    G[key] = async function (src, target, n, opts) {if (n > 0) {C.maskReveal(this, src); C.maskReveal(this, target);} return damage.call(this, src, target, n, opts);};
  }
})();
