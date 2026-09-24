'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FRC, S = M.StarterCasting;
  M.SCRIPTS['Overlord of the Mistmoors'] = {frcImpending: true,
    asEnters: (g, c) => {c.meta.frcImpending = c.castMeta?.alt?.frcImpending === true; g.recalc();},
    etbCounters: {kind: 'time', n: (g, c) => c.meta.frcImpending ? 4 : 0},
    statics: [{phase: 1, apply: (g, c) => {
      const entering = g._entryReplacementPhase && !g._battlefieldEntryReplacementSnapshot?.includes(c);
      if (c.meta.frcImpending && (c.counters.time > 0 || entering)) c.cur.types = c.cur.types.filter(t => t !== 'Creature');
    }}],
    triggers: [...C.both('Create two flying Insects', ctx => C.make(ctx, C.insect, 2)), C.end('Remove a time counter from the impending Overlord', ctx => {
      if (C.same(ctx)) ctx.g.removeCounters(ctx.src, 'time', 1);
    }, {filter: (g, c, d) => d.player === c.ctrl && c.meta.frcImpending && c.counters.time > 0})],
  };
  const offers = (g, p) => [...p.hand, ...p.command].filter(c => c.def.frcImpending).map(c => ({card: c, from: c.zone, alt: {
    starterPermission: 'frcImpending', starterCardVersion: c.zoneVersion, frcImpending: true, altCostStr: '{2}{W}{W}', label: 'Impending 4 — {2}{W}{W}',
  }}));
  const prior = {offers: S.offers, allowed: S.allowed, prepare: S.prepare, validate: S.validate, commit: S.commit};
  S.offers = (g, p) => prior.offers(g, p).concat(offers(g, p));
  S.allowed = (g, p, c, a) => a.starterPermission !== 'frcImpending' ? prior.allowed(g, p, c, a) : g.canCastTiming(p, c, a) && offers(g, p).some(r =>
    r.card === c && Object.keys(r.alt).every(k => r.alt[k] === a[k]) && Object.keys(a).every(k => k === 'from' ? a[k] === c.zone : k === 'xVal' ? a[k] === 0 : r.alt[k] === a[k]));
  S.prepare = (ctx, paid) => ctx.so.castOpts.starterPermission === 'frcImpending' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.prepare(ctx, paid);
  S.validate = ctx => ctx.so.castOpts.starterPermission === 'frcImpending' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.validate(ctx);
  S.commit = ctx => ctx.so.castOpts.starterPermission === 'frcImpending' ? undefined : prior.commit(ctx);
  const face = M.OracleV8Faces.castChoiceAllowed;
  M.OracleV8Faces.castChoiceAllowed = (g, p, c, a) => a.starterPermission === 'frcImpending' ? S.allowed(g, p, c, a) : face(g, p, c, a);
})();
