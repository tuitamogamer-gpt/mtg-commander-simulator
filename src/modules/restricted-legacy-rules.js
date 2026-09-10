'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, G = M.Game.prototype;
  const same = ctx => ctx.src?.zone === 'battlefield' &&
    (ctx.sourceZoneVersion == null || ctx.src.zoneVersion === ctx.sourceZoneVersion);
  const objectKey = (card, version = card.zoneVersion) => card.iid + ':' + version;
  const duty = (g, c) => g.untilEffects.filter(e => e.immortalDuty && e.iid === c.iid &&
    e.zoneVersion === c.zoneVersion && c.counters.duty > 0);
  const recalc = G.recalc;
  G.recalc = function () {
    // A duration that ends when its source leaves or its last duty counter is
    // removed cannot restart if that physical card or counter comes back.
    this.untilEffects = this.untilEffects.filter(e => {
      if (e.immortalDuty) {
        const c = this.byIid(e.iid);
        if (!c || c.zone !== 'battlefield' || c.zoneVersion !== e.zoneVersion || !(c.counters.duty > 0)) return false;
      }
      if (e.pursuitSource) {
        const c = this.byIid(e.pursuitSource.iid);
        if (!c || c.zone !== 'battlefield' || c.zoneVersion !== e.pursuitSource.version) return false;
      }
      return true;
    });
    return recalc.call(this);
  };
  const removeCounters = G.removeCounters;
  G.removeCounters = function (c, kind, n) {
    const result = removeCounters.call(this, c, kind, n);
    if (kind === 'duty' && !(c.counters.duty > 0)) {
      this.untilEffects = this.untilEffects.filter(e => !(e.immortalDuty && e.iid === c.iid && e.zoneVersion === c.zoneVersion));
    }
    return result;
  };
  const attack = G.canAttackTarget;
  G.canAttackTarget = function (c, t) {
    const defender = t instanceof M.Player ? t : t?.ctrl;
    if (duty(this, c).some(e => e.notPlayer === defender)) return false;
    if ((t instanceof M.Player || t?.is?.('Planeswalker')) &&
        (c.cur.restrictedCannotAttack || []).includes(defender)) return false;
    return attack.call(this, c, t);
  };
  const block = G.canBlock;
  G.canBlock = function (b, a) {
    if (duty(this, b).some(e => e.notPlayer === a.ctrl)) return false;
    return block.call(this, b, a);
  };
  const emit = G.emit;
  G.emit = function (name, data) {
    if (name === 'damageToPlayer' && data.n > 0 && data.src instanceof M.CardInst) {
      data.restrictedSourceVersion ??= data.src._oracleDamageSnapshot?.zoneVersion ?? data.src.zoneVersion;
      const history = data.player.turnState.restrictedDamageSources ||= [];
      const key = objectKey(data.src, data.restrictedSourceVersion);
      if (!history.includes(key)) history.push(key);
    }
    return emit.call(this, name, data);
  };
  M.RestrictedLegacy = {
    same,
    dealtDamageTo: (g, c, p) => (p.turnState.restrictedDamageSources || []).includes(objectKey(c)),
    linkPursuit(ctx, target) {
      if (!same(ctx)) return;
      ctx.g.untilEffects.push({kind: 'goadCard', iid: target.iid, zoneVersion: target.zoneVersion,
        notPlayer: ctx.you, expires: 'object', pursuitSource: {iid: ctx.src.iid, version: ctx.src.zoneVersion}});
    },
    addDuty(ctx, c) {
      if (c.zone === 'battlefield' && c.counters.duty > 0) ctx.g.untilEffects.push({
        kind: 'goadCard', immortalDuty: true, iid: c.iid, zoneVersion: c.zoneVersion,
        notPlayer: ctx.you, expires: 'object'});
    },
    async choosePlayer(ctx, chooser, candidates, prompt) {
      if (!candidates.length) return null;
      const key = await chooser.controller.decide(ctx.g, {type: 'chooseOption', prompt,
        options: candidates.map(p => ({key: String(p.idx), label: p.name})),
        aiHint: {kind: 'choosePlayer', secret: true}});
      const chosen = candidates.find(p => String(p.idx) === String(key));
      if (!chosen) throw new Error('Invalid secret player choice');
      return chosen;
    },
    enchanted(ctx) {
      const snap = same(ctx) ? ctx.src : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion);
      const iid = snap?.attachedTo;
      const host = ctx.g.byIid(iid);
      const version = same(ctx) ? host?.zoneVersion : snap?.attachedHostVersion;
      return host?.zone === 'battlefield' && host.zoneVersion === version ? host : null;
    },
  };
})();
