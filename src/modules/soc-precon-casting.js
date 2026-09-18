'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.SOC, G = M.Game.prototype, S = M.StarterCasting;
  const paragon = (g, p) => g.turnPlayer === p ? C.sources(g, p, 'socParagon').filter(c => c.meta.socParagonTurn !== g.turnNo) : [];
  const offers = (g, p) => p.graveyard.flatMap(c => {
    const out = [], add = (mode, source, extra = {}) => out.push({card: c, from: 'graveyard', alt: {
      starterPermission: 'soc', starterCardVersion: c.zoneVersion, socMode: mode,
      ...(source ? {socSource: source.iid, socSourceVersion: source.zoneVersion} : {}), ...extra,
    }});
    if (c.def.socGuidance) add('guidance', null, {altCostStr: '{2}{W}'});
    if (!c.is('Land') && C.permanent(g, c) && c.mv <= 3) for (const source of paragon(g, p)) add('paragon', source);
    return out;
  });
  const prior = {offers: S.offers, allowed: S.allowed, prepare: S.prepare, validate: S.validate, commit: S.commit};
  S.offers = (g, p) => prior.offers(g, p).concat(offers(g, p));
  S.allowed = (g, p, c, a) => a.starterPermission !== 'soc' ? prior.allowed(g, p, c, a) : g.canCastTiming(p, c, a) && offers(g, p).some(r =>
    r.card === c && Object.keys(r.alt).every(k => r.alt[k] === a[k]) && Object.keys(a).every(k =>
      k === 'from' ? a[k] === 'graveyard' : k === 'xVal' ? Number.isSafeInteger(a[k]) && a[k] >= 0 : r.alt[k] === a[k]));
  S.prepare = (ctx, paid) => ctx.so.castOpts.starterPermission === 'soc' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.prepare(ctx, paid);
  S.validate = ctx => ctx.so.castOpts.starterPermission === 'soc' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.validate(ctx);
  S.commit = ctx => {
    const a = ctx.so.castOpts;
    if (a.starterPermission === 'soc') {
      if (a.socMode === 'paragon') ctx.g.byIid(a.socSource).meta.socParagonTurn = ctx.g.turnNo;
      return;
    }
    const grant = ctx.g.c1719Permissions?.find(r => r.id === a.c1719Id);
    if (grant?.socBottomSpell) ctx.src.meta.socBottomSpell = true;
    return prior.commit(ctx);
  };
  const face = M.OracleV8Faces.castChoiceAllowed;
  M.OracleV8Faces.castChoiceAllowed = (g, p, c, a) => a.starterPermission === 'soc' ? S.allowed(g, p, c, a) : face(g, p, c, a);
  const landSources = M.POM.landSources;
  M.POM.landSources = (g, p, c) => landSources(g, p, c).concat(c.zone === 'graveyard' && c.owner === p && c.is('Land') ? paragon(g, p) : []);
  const playLand = G.playLand;
  G.playLand = async function (p, c, ...args) {
    const otherPermission = landSources(this, p, c).length || p.c1516MagusTurn === this.turnNo || this.bf().some(s =>
      s.ctrl === p && C.live(s) && (s.def.playLandsFromGraveyard || s.def.grantsGraveyardPermanentTypes && !(p.turnState.gravePermanentTypesUsed || []).includes('Land')));
    const source = c.zone === 'graveyard' && c.owner === p && !otherPermission ? paragon(this, p)[0] : null;
    const version = c.zoneVersion;
    if (source) this.socParagonLand = c;
    try {
      const result = await playLand.call(this, p, c, ...args);
      if (source && c.zoneVersion !== version) source.meta.socParagonTurn = this.turnNo;
      return result;
    } finally {if (source) delete this.socParagonLand;}
  };
  const handleETB = G.handleETB;
  G.handleETB = async function (c, opts = {}) {
    if (opts.socSpiritForm) this.addOracleAnimation(c, {types: ['Creature'], subtypes: ['Spirit'], retainTypes: true, retainAllSubtypes: true,
      power: 1, toughness: 1, keywords: ['flying']});
    if (c.castMeta?.alt?.socMode === 'paragon' || this.socParagonLand === c) {
      C.grant({g: this, src: c, you: c.ctrl}, c, [], 'object', {field: 'extraTriggers', grants: [C.trigger('lto', 'Exile this card and gain two life', async ctx => {
        const row = C.row(ctx.data.card);
        if (row.zone === 'graveyard' && row.version === ctx.data.socParagonGraveVersion) await ctx.g.move(row.card, 'exile');
        await ctx.g.gainLife(ctx.you, 2, ctx.src);
      }, {filter: (g, self, d) => d.card === self && d.card.zone === 'graveyard'})]});
    }
    return handleETB.call(this, c, opts);
  };
  const emit = G.emit;
  G.emit = function (on, d) {
    if (on === 'lto') d.socParagonGraveVersion = d.card.zoneVersion;
    if (on === 'cast' && d.so) d.socGravestorm = d.player.turnState.socGravestorm || 0;
    return emit.call(this, on, d);
  };
  const move = G.move;
  G.move = function (c, to, opts = {}) {
    if (c.zone === 'stack' && c.meta.socBottomSpell) {
      delete c.meta.socBottomSpell;
      if (to === 'graveyard') {to = 'library'; opts = {...opts, toBottom: true};}
    }
    return move.call(this, c, to, opts);
  };
})();
