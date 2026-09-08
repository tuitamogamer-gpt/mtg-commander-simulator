'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, G = M.Game.prototype, C = M.C1920;
  const live = C.live;
  const foretell = (card, opts = {}) => {
    if (opts.zkForetellGranted && card.meta?.zkForetell?.version === card.zoneVersion && card.zone === 'exile') {
      const def = card.oracleFaces ? M.OracleV8Faces.definition(card, opts) : card.def;
      const cost = opts.splitHalf ? card.def.oracleSplit?.faces.find(f => f.key === opts.splitHalf)?.cost : def.cost;
      return cost === null || cost === undefined ? null : {cost, reduction: 2};
    }
    return typeof card.def.foretell === 'string' ? {cost: card.def.foretell} : card.def.foretell;
  };
  G.foretellDefinition = foretell;
  G.foretellChoices = function (card, opts = {}) {
    const rows = [], printed = foretell(card, opts);
    if (printed) rows.push({...printed, zkForetellGranted: false});
    const granted = foretell(card, {...opts, zkForetellGranted: true});
    if (card.meta?.zkForetell?.version === card.zoneVersion && granted) rows.push({...granted, zkForetellGranted: true});
    return rows;
  };
  G.foretellActionCost = function (p) {
    return !p.turnState.zkForetold && this.bf().some(c => c.ctrl === p && live(c) && c.def.zkRanar) ? '{0}' : '{2}';
  };
  G.zkForetellFromHand = async function (p, card, extra = {}) {
    const version = card.zoneVersion;
    await this.move(card, 'exile', {exileFaceDown: true, exileLookers: [p.idx]});
    if (card.zone !== 'exile' || card.zoneVersion !== version + 1) return false;
    Object.assign(card.meta, {foretold: true, foretoldTurn: this.turnNo, foretoldZoneVersion: card.zoneVersion});
    if (extra.granted) card.meta.zkForetell = {version: card.zoneVersion};
    if (!extra.granted) p.turnState.zkForetold = (p.turnState.zkForetold || 0) + 1;
    return true;
  };
  // Exiling several objects in one instruction gives Ranar one trigger.
  // Keep the departing sources in the batch so a simultaneous self-exile
  // still sees its ability and controller immediately before that event.
  G.withZKExileBatch = async function (run) {
    if (this.zkExileBatch || !this._zkExileWatch) return run();
    const batch = {entries: [], sources: this.bf().map(card => ({card, ctrl: card.ctrl, snap: this.snapshot(card)}))};
    this.zkExileBatch = batch;
    try {return await run();} finally {
      delete this.zkExileBatch;
      if (batch.entries.length) await this.emit('zkExiled', {entries: batch.entries, oracleBatch: batch.sources});
    }
  };
  for (const key of ['exileMany', 'withGraveyardEntryBatch']) {
    const previous = G[key];
    G[key] = function (...args) {return this.withZKExileBatch(() => previous.apply(this, args));};
  }
  // A cost or a state-based action is not a resolving spell/ability's effect,
  // even when a surrounding resolution asks a player to pay or cast something.
  for (const key of ['castSpell', 'activateAbility', 'activateManaSource']) {
    const previous = G[key];
    G[key] = async function (...args) {
      this.zkAnnouncing = (this.zkAnnouncing || 0) + 1;
      try {return await previous.apply(this, args);} finally {this.zkAnnouncing--;}
    };
  }
  async function exiled(g, card, from, to, snapshot, opts) {
    if (to !== 'exile') return;
    if (opts.zkCosmic && !card.isToken) {
      const row = {card, zone: 'exile', version: card.zoneVersion}, effect = opts.zkCosmic;
      g.delayed.push({on: 'endStep', once: true, src: effect.source, ctrl: effect.who,
        name: 'Cosmic Intervention: return ' + card.name,
        run: next => C.current(row) && next.g.putPermanentOntoBattlefield(card, card.owner)});
    }
    if ((!g._zkExileWatch && !g.zkExileBatch) || !['battlefield', 'hand'].includes(from)) return;
    const controller = !g._sbaRunning && !g.zkAnnouncing ? g.c1516Resolving?.ctrl || null : null;
    const entry = {card, from, owner: card.owner, snapshot, controller, version: card.zoneVersion};
    if (g.zkExileBatch) g.zkExileBatch.entries.push(entry);
    else await g.emit('zkExiled', {entries: [entry], oracleBatch: from === 'battlefield'
      ? [...(g._simultaneousLeaveSources || []), {card, ctrl: snapshot.ctrl, snap: snapshot}] : undefined});
  }
  const qualifying = (g, c, d) => d.entries.filter(r => r.from === 'hand' ? r.owner === C.controllerAt(g, c, d)
    : r.controller === C.controllerAt(g, c, d));
  const previousCollect = G.collectTriggers;
  G.collectTriggers = function (event, data) {
    if (event !== 'zkExiled') return previousCollect.call(this, event, data);
    const previous = this._simultaneousLeaveSources;
    this._simultaneousLeaveSources = [...(previous || []), ...(data.oracleBatch || [])];
    try {return previousCollect.call(this, event, data);} finally {this._simultaneousLeaveSources = previous;}
  };
  const decide = G.c1516Decide;
  G.c1516Decide = async function (p, q, raw) {
    const choice = q.type === 'attackers' && this.untilEffects.filter(e => e.kind === 'zkWarcraft' && !e.who.lost).at(-1);
    if (!choice) return decide.call(this, p, q, raw);
    const chooser = choice.who, selected = await C.choose(this, chooser, q.eligible, 0, q.eligible.length,
      'Master Warcraft: choose which creatures attack', 'masterWarcraftAttackers');
    const answers = await decide.call(this, p, {...q, eligible: selected, forced: selected}, raw);
    const rows = [];
    for (const card of selected) {
      const target = answers?.find(r => r.card === card)?.target || await this.chooseAttackingDestination(p, null, card, 'Choose the attack destination');
      if (target) rows.push({card, target});
    }
    return rows;
  };
  const canCastTiming = G.canCastTiming;
  G.canCastTiming = function (p, card, alt = {}) {
    if (card.def.zkTimely && alt.zkCommanderWard) return canCastTiming.call(this, p, card, {...alt, speed: 'instant'});
    return canCastTiming.call(this, p, card, alt);
  };
  const spellTargets = G.spellTargetSpecs;
  G.spellTargetSpecs = function (card, opts = {}, ...args) {
    const targets = spellTargets.call(this, card, opts, ...args);
    return card.def.zkTimely && opts.zkCommanderWard ? targets.map(t => ({...t,
      filter: (g, c, ...rest) => c.commander && (!t.filter || t.filter(g, c, ...rest))})) : targets;
  };
  const cost = G.spellCost;
  G.spellCost = function (p, card, opts = {}) {
    const result = cost.call(this, p, card, opts), reduction = opts.foretell ? foretell(card, opts)?.reduction || 0 : 0;
    const remaining = result.generic - reduction;
    return {...result, generic: Math.max(0, remaining), xReduction: (result.xReduction || 0) + Math.max(0, -remaining)};
  };
  const recalc = G.recalc;
  G.recalc = function () {
    const result = recalc.call(this);
    this._zkExileWatch = this.bf().some(c => live(c) && [...(c.def.triggers || []), ...(c.cur.extraTriggers || [])].some(t => t.on === 'zkExiled'));
    for (const e of this.untilEffects) if (e.kind === 'zkNextAttack' && e.active && C.current(e.row)) e.row.card.cur.mustAttack = true;
    return result;
  };
  const emit = G.emit;
  G.emit = function (name, data) {
    if (name === 'beginCombat') for (const e of this.untilEffects) if (e.kind === 'zkNextAttack' && e.player === data.player.idx) e.active = true;
    if (name === 'endCombat') this.untilEffects = this.untilEffects.filter(e => e.kind !== 'zkNextAttack' || !e.active);
    return emit.call(this, name, data);
  };
  const nikoManaAllows = (g, payment) => !!payment && (!!payment.foretellAction || !payment.isAbility &&
    (!!g.castDefinition(payment.card, payment.castOpts || {}).foretell || !!payment.castOpts?.foretell));
  const snapshotBlockers = g => {
    const out = [];
    if (g.players.some(p => p.exile.some(c => c.meta.zkForetell))) out.push('a granted foretell cost');
    if (g.untilEffects.some(e => e.kind === 'zkCosmic' || e.kind === 'zkWarcraft')) out.push('a temporary ZNC/KHC rule');
    return out;
  };
  M.ZK = {...C, qualifying, foretell, exiled, nikoManaAllows, snapshotBlockers,
    otherUntap: (g, card, active, cards) => card.ctrl !== active && card.is('Creature') && card.colors.some(c => c === 'U' || c === 'G') &&
      cards.some(source => source.ctrl === card.ctrl && source.def.zkLiege && live(source))};
})();
