'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.BDF, G = M.Game.prototype;
  const graveLeft = (g, c, d) => d.cards.some(x => x.owner === c.ctrl);
  const level = c => c.meta.socLevel || 1;
  const levels = costs => costs.map((mana, i) => ({
    label: 'Level ' + (i + 2), sorcery: true, cost: {mana},
    cond: (g, c) => level(c) === i + 1,
    run: ctx => { if (C.same(ctx) && level(ctx.src) === i + 1) ctx.src.meta.socLevel = i + 2; },
  }));
  const spirit = C.registerToken('socSpirit', C.token('Spirit', ['Spirit'], 3, 2, ['R', 'W'], [], {tokenImageName: 'SOC Spirit'}));
  const inkling = C.registerToken('socInkling', C.token('Inkling', ['Inkling'], 2, 1, ['W', 'B'], ['flying'], {tokenImageName: 'SOC Inkling'}));
  const modified = (g, c, snap) => Object.values(snap?.counters || c.counters).some(n => n > 0) ||
    (snap?.attachedSources || C.attachments(g, c).map(card => ({card, snap: {ctrl: card.ctrl, subtypes: card.cur.subtypes}})))
      .some(a => a.snap.subtypes.includes('Equipment') || a.snap.subtypes.includes('Aura') && a.snap.ctrl === (snap?.ctrl || c.ctrl));
  function prepare(ctx, definition) {
    if (!C.same(ctx) || ctx.src.meta.prepared) return;
    const sourceIid = ctx.src.iid, version = ctx.src.zoneVersion;
    const allowed = (g, p) => {
      const source = g.byIid(sourceIid);
      return source?.zone === 'battlefield' && source.zoneVersion === version && source.meta.prepared && source.ctrl === p;
    };
    const copy = new M.CardInst({super: [], subtypes: [], kws: [], oracle: '', ...definition,
      xCost: /\{X\}/.test(definition.cost), castCond: (g, p, c) => c.zone === 'exile' && allowed(g, p) && g.canCastTiming(p, c)}, ctx.you);
    copy.isCopySpell = true;
    copy.zone = 'exile';
    copy.meta = {preparedBy: sourceIid, playableBy: ctx.you, playableUntil: Number.MAX_SAFE_INTEGER, playableCondition: allowed};
    ctx.you.exile.push(copy);
    ctx.src.meta.prepared = true;
    ctx.src.meta.preparedCopy = copy.iid;
    ctx.g.lg(ctx.src.name + ' is prepared: ' + copy.name + ' is ready in exile.');
    return copy;
  }
  const ownGraveEvent = (desc, run, extra = {}) => C.trigger('cardsLeftGraveyard', desc, run, {filter: graveLeft, ...extra});
  const deceased = ctx => ctx.data.card.zone === 'graveyard' && ctx.data.card.zoneVersion === ctx.data.graveyardZoneVersion;
  const discards = new WeakMap();
  async function exileDiscard(ctx, spellsOnly = false) {
    const rows = spellsOnly ? ctx.data.socDiscards.filter(r => !r.card.is('Land')) : [{card: ctx.data.card, version: ctx.data.socDiscardVersion, zone: 'graveyard'}];
    const pool = rows.filter(C.current).map(r => r.card);
    const [c] = await C.choose(ctx.g, ctx.you, pool, 0, 1, 'Exile a discarded card to play this turn');
    if (!c) return;
    await ctx.g.move(c, 'exile');
    if (c.zone === 'exile') C.playGrant(ctx, c, {turn: ctx.g.turnNo, spellsOnly});
  }
  const emit = G.emit;
  G.emit = async function (on, d) {
    if (on === 'discarded' && d.card) {
      d.socDiscardVersion = d.card.zoneVersion;
      let rows = d.oracleBatch && discards.get(d.oracleBatch);
      if (!rows) {rows = []; if (d.oracleBatch) discards.set(d.oracleBatch, rows);}
      rows.push(C.row(d.card)); d.socDiscards = rows;
    }
    return emit.call(this, on, d);
  };
  const leave = G.fireLeaveAndDie;
  G.fireLeaveAndDie = function (card, snap, died) {
    if (died) {
      for (const p of this.players) p.turnState.socGravestorm = (p.turnState.socGravestorm || 0) + 1;
      if (snap.types.includes('Creature') && modified(this, card, snap)) snap.ctrl.turnState.socModifiedDied = true;
    }
    return leave.call(this, card, snap, died);
  };
  const entryCounters = M.POM.entryCounters;
  M.POM.entryCounters = (g, c) => entryCounters(g, c) + (c.is('Creature') && !c.isToken
    ? (g._battlefieldEntryReplacementSnapshot || g.bf()).filter(s => s !== c && C.live(s) && s.ctrl === c.ctrl && s.def.socGorma).length * (c.ctrl.turnState.creaturesDiedUnder || 0) : 0);
  const canAttack = G.canAttackTarget;
  G.canAttackTarget = function (c, target) {
    const player = target instanceof M.Player ? target : target?.is?.('Planeswalker') ? target.ctrl : null;
    if (player && C.sources(this, player, 'socEriette').length && C.attachments(this, c).some(a => a.hasSub('Aura') && a.ctrl === player)) return false;
    return canAttack.call(this, c, target);
  };
  const tax = G.starterTargetTax;
  G.starterTargetTax = function (p, c, opts = {}) {
    const prior = tax.call(this, p, c, opts), sources = C.sources(this, p, 'socKillian');
    if (!sources.length) return prior;
    const targets = opts.targets === undefined
      ? (this.spellTargetSpecs(c, opts, p) || []).flatMap(s => this.legalTargets(s, c, p)) : C.flat(opts.targets);
    return prior - (targets.some(c => c instanceof M.CardInst && c.zone === 'battlefield' && c.is('Creature')) ? 2 * sources.length : 0);
  };
  M.SOC = {...C, graveLeft, ownGraveEvent, level, levels, spirit, inkling, modified, prepare, deceased, exileDiscard};
})();
