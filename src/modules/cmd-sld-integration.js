'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL, G = M.Game.prototype, P = M.POM, S = M.StarterCasting;
  const prepare = P.prepareCast;
  P.prepareCast = async (g, p, c, a, cost, x) => {
    const plan = await prepare(g, p, c, a, cost, x); if (!plan) return null;
    if (g.castHasType(c, a, 'Creature')) for (const chorus of C.sources(g, p, 'cslChorus')) {
      const max = g.maxAffordableX(p, {...cost, generic: cost.generic + (cost.x || 0) * x, x: 1}, c, {castOpts: a});
      const n = await p.controller.decide(g, {type: 'chooseX', min: 0, max, card: c, prompt: 'Chorus of the Conclave: pay additional mana for counters', aiHint: {kind: 'chooseX'}});
      if (!Number.isSafeInteger(n) || n < 0 || n > max) return null;
      cost.generic += n; plan.cslChorusCounters = (plan.cslChorusCounters || 0) + n;
    }
    return plan;
  };
  const entryCounters = P.entryCounters;
  P.entryCounters = (g, c) => entryCounters(g, c) + (c.castMeta?.cslChorusCounters || 0);
  const spent = P.spent;
  P.spent = (g, p, action, unit) => {spent(g, p, action, unit); if (action && unit.cslHasteMana) action.cslHasteMana = (action.cslHasteMana || 0) + 1;};
  const emit = G.emit;
  G.emit = async function (on, d) {
    if (on === 'cast' && d.so && d.card?.castMeta) {
      d.card.castMeta.cslChorusCounters = d.so.cslChorusCounters || 0;
      d.card.castMeta.cslHasteMana = d.so.cslHasteMana || 0;
    }
    if (on === 'tappedForMana') d.cslLandVersion = d.card.zoneVersion;
    if (on === 'abilityActivated' && d.card.def === M.DEFS['Dragon Whelp'] && !d.isMana) {
      const old = d.card.meta.cslWhelp; d.card.meta.cslWhelp = {turn: this.turnNo, n: (old?.turn === this.turnNo ? old.n : 0) + 1};
    }
    if (on === 'lifeLost' && d.n > 0 && this.turnPlayer !== d.player) {
      const p = this.turnPlayer;
      if (p && (p.counters.speed || 0) >= 1 && p.counters.speed < 4 && !p.turnState.cslSpedUp) {
        p.counters.speed++; p.turnState.cslSpedUp = true; this.note('counter', {p, kind: 'speed'});
      }
    }
    return emit.call(this, on, d);
  };
  const entry = G.handleETB;
  G.handleETB = async function (c, opts) {
    if (c.castMeta?.cslHasteMana && c.is('Creature')) C.grant({g: this, src: c, you: c.ctrl}, c, ['haste'], 'eot');
    return entry.call(this, c, opts);
  };
  const recalc = G.recalc;
  G.recalc = function () {
    const result = recalc.call(this);
    for (const c of this.bf()) {
      const r = c.meta.cslRayController;
      if (r && (c.zoneVersion !== r.version || c.ctrl.idx !== r.player)) {
        delete c.meta.cslRayController;
        if (c.zoneVersion === r.version) this.queueTrigger({src: r.source, ctrl: this.players[r.player], name: 'Ray of Command: tap the creature', data: {card: c, version: r.version}, run: ctx => {
          if (ctx.data.card.zone === 'battlefield' && ctx.data.card.zoneVersion === ctx.data.version) ctx.g.tap(ctx.data.card);
        }});
      }
      if (this.untilEffects.some(e => e.kind === 'cslMustAttack' && e.iid === c.iid && e.version === c.zoneVersion && e.combat === this.afcCombatId)) c.cur.mustAttack = true;
    }
    return result;
  };
  const convoke = M.CDK.convoke;
  const cycling = G.cyclingOptions;
  G.cyclingOptions = function (p, c) {
    const rows = cycling.call(this, p, c);
    if (c.def.cslForestcycling) rows.push({cyclingId: 'cslForest', definition: c.def.cslForestcycling, label: 'Forestcycling'});
    return rows;
  };
  M.CDK.convoke = (g, p, c, a) => convoke(g, p, c, a) || g.castHasType(c, a, 'Creature') && C.sources(g, p, 'cslTheater').some(c => C.bdfUnlocked(c, 'left'));
  const otherUntap = M.ZK.otherUntap;
  M.ZK.otherUntap = (g, c, p, bf) => otherUntap(g, c, p, bf) || c.ctrl !== p && c.is('Creature') && bf.some(s => s.ctrl === c.ctrl && C.live(s) && s.def.cslTheater && C.bdfUnlocked(s, 'right'));
  const abilityCost = G.abilityManaCost;
  G.abilityManaCost = function (p, c, raw, context = {}) {
    const cost = abilityCost.call(this, p, c, raw, context);
    if (c.def.cslThrone && context.ability?.cslColoredPayment && c.meta.cslColor) return {...cost, generic: 0, pips: cost.pips.concat(Array.from({length: cost.generic}, () => [c.meta.cslColor]))};
    return cost;
  };
  const offeringCost = (c, rat) => {
    const cost = M.parseCost(c.def.cost), reduction = M.parseCost(rat.def.cost);
    let generic = reduction.generic;
    for (const pip of reduction.pips) {const i = cost.pips.findIndex(p => p.some(x => pip.includes(x))); if (i >= 0) cost.pips.splice(i, 1); else generic++;}
    cost.generic = Math.max(0, cost.generic - generic);
    return '{' + cost.generic + '}' + cost.pips.map(p => '{' + p.join('/') + '}').join('');
  };
  const offers = (g, p) => {
    const rows = [], add = (c, kind, extra) => rows.push({card: c, from: c.zone, alt: {starterPermission: 'csl', starterCardVersion: c.zoneVersion, cslMode: kind, ...extra}});
    if (g.turnPlayer === p) for (const s of C.sources(g, p, 'cslKarador').filter(c => c.meta.cslKaradorTurn !== g.turnNo)) for (const c of p.graveyard.filter(c => c.is('Creature'))) add(c, 'karador', {cslSource: s.iid, cslVersion: s.zoneVersion});
    for (const c of [...p.hand, ...p.command]) {
      if (c.def.cslInvigorate && g.lands(p).some(c => c.hasSub('Forest'))) for (const q of p.opponents(g)) add(c, 'invigorate', {altCostStr: '{0}', cslOpponent: q.idx, label: 'Have ' + q.name + ' gain three life'});
      if (c.def.cslOffering) for (const rat of g.creatures(p).filter(c => c.hasSub('Rat') && g.canSacrifice(c))) add(c, 'offering', {altCostStr: offeringCost(c, rat), speed: 'instant', cslRat: rat.iid, cslRatVersion: rat.zoneVersion, label: 'Rat offering: sacrifice ' + rat.name});
    }
    return rows;
  };
  const prior = {offers: S.offers, allowed: S.allowed, prepare: S.prepare, validate: S.validate, commit: S.commit};
  S.offers = (g, p) => prior.offers(g, p).concat(offers(g, p));
  S.allowed = (g, p, c, a) => a.starterPermission !== 'csl' ? prior.allowed(g, p, c, a) : g.canCastTiming(p, c, a) && offers(g, p).some(r => r.card === c && Object.keys(r.alt).every(k => r.alt[k] === a[k]) && Object.keys(a).every(k => k === 'from' ? a[k] === c.zone : k === 'xVal' ? Number.isSafeInteger(a[k]) && a[k] >= 0 : r.alt[k] === a[k]));
  S.prepare = async (ctx, paid) => {
    const a = ctx.so.castOpts; if (a.starterPermission !== 'csl') return prior.prepare(ctx, paid);
    if (!S.allowed(ctx.g, ctx.you, ctx.src, a)) return false;
    if (a.cslMode === 'offering') paid.sacd.push(ctx.g.byIid(a.cslRat));
    return true;
  };
  S.validate = ctx => ctx.so.castOpts.starterPermission === 'csl' ? S.allowed(ctx.g, ctx.you, ctx.src, ctx.so.castOpts) : prior.validate(ctx);
  S.commit = ctx => {
    const a = ctx.so.castOpts; if (a.starterPermission !== 'csl') return prior.commit(ctx);
    if (a.cslMode === 'karador') ctx.g.byIid(a.cslSource).meta.cslKaradorTurn = ctx.g.turnNo;
  };
  const commit = M.CDK.commitCosts;
  M.CDK.commitCosts = async (g, p, c, so) => {await commit(g, p, c, so); if (so.castOpts.starterPermission === 'csl' && so.castOpts.cslMode === 'invigorate') await g.gainLife(g.players[so.castOpts.cslOpponent], 3, c);};
  const choice = M.OracleV8Faces.castChoiceAllowed;
  M.OracleV8Faces.castChoiceAllowed = (g, p, c, a) => a.starterPermission === 'csl' ? S.allowed(g, p, c, a) : choice(g, p, c, a);
})();
