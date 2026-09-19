'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, G = M.Game.prototype, P = M.POM, S = M.StarterCasting;
  const attackTarget = G.canAttackTarget;
  G.canAttackTarget = function (card, target) {
    const p = target instanceof M.Player ? target : target?.is?.('Planeswalker') ? target.ctrl : null;
    if (p && C.sources(this, null, 'c13Barrier').some(c => c.meta.c13Direction && C.neighbor(this, card.ctrl, c.meta.c13Direction) !== p)) return false;
    return attackTarget.call(this, card, target);
  };
  const tax = G.c21AttackTax;
  G.c21AttackTax = function (card, target) {
    const p = target instanceof M.Player ? target : target?.ctrl;
    return tax.call(this, card, target) + (p ? C.sources(this, p, 'c13Tithes').filter(c => !c.tapped).length : 0);
  };
  G.c13BlockTax = function () {return this.untilEffects.filter(e => e.kind === 'c13BlockTax').reduce((n, e) => n + e.n, 0) + C.sources(this, null, 'c13Tithes').filter(c => c.attacking).length;};
  G.c13PayBlockTaxes = async function (attackers, player) {
    const amount = this.c13BlockTax(); if (!amount) return;
    const blockers = [...new Set(attackers.flatMap(c => c.blockedBy))];
    for (const card of blockers) {
      const cost = M.parseCost('{' + amount + '}'), ctx = {g: this, src: card, you: player};
      if (this.canPayMana(player, cost) && await C.yes(ctx, 'Pay ' + amount + ' mana for this creature to block?') && await this.payMana(player, cost)) continue;
      for (const attacker of attackers) attacker.blockedBy = attacker.blockedBy.filter(c => c !== card); card.blocking = null;
    }
  };
  const split = G.hasSplitSecond;
  G.hasSplitSecond = function () {return split.call(this) || this.stack.some(so => so.kind === 'spell' && so.card.def.c13KickedSplitSecond && so.kicked && !so.castOpts?.faceDownCast);};
  const timing = G.canCastTiming;
  G.canCastTiming = function (p, card, opts = {}) {
    const cost = this.castDefinition(card, opts).cost || '';
    if (C.sources(this, null, 'c13Brisela').some(c => c.ctrl !== p) && (opts.faceDownCast || !(cost.includes('{X}') && opts.xVal === undefined)) && (opts.faceDownCast ? 0 : M.mv(cost, opts.xVal || 0)) <= 3) return false;
    return timing.call(this, p, card, opts);
  };
  const hasExalted = (g, p) => g.bf().some(c => c.ctrl === p && C.live(c) && g.untilEffects.some(e => e.kind === 'cwwFlag' && e.field === 'cwwExalted' && e.iid === c.iid && e.zoneVersion === c.zoneVersion));
  const lose = G.canLoseGame, win = G.canWinGame;
  G.canLoseGame = function (p) {return !hasExalted(this, p) && lose.call(this, p);};
  G.canWinGame = function (p) {return !p.opponents(this).some(other => hasExalted(this, other)) && win.call(this, p);};
  const replacements = G.replacers;
  const vigorSources = g => (g._battlefieldEntryReplacementSnapshot || g.bf()).filter(c => C.live(c) && c.def.c13Vigor);
  G.replacers = function (kind) {
    const out = replacements.call(this, kind);
    if (kind === 'createToken') for (const c of vigorSources(this)) for (const p of this.alivePlayers()) out.push({key: c, src: c, ctrl: p, run: (g, defs) => defs.concat(defs)});
    return out;
  };
  const plus = G.adjustPlusCounters;
  G.adjustPlusCounters = function (card, n) {return plus.call(this, card, n) * (card.is('Creature') ? 2 ** vigorSources(this).length : 1);};
  const prepareCast = P.prepareCast;
  P.prepareCast = async (g, p, c, a, cost, x) => {
    if (C.sources(g, null, 'c13Brisela').some(c => c.ctrl !== p) && (a.faceDownCast ? 0 : M.mv(g.castDefinition(c, a).cost || '', x)) <= 3) return null;
    const plan = await prepareCast(g, p, c, a, cost, x); if (!plan) return null;
    if (c.def.c13DualKicker && !a.faceDownCast) for (const [field, raw] of [['c13KickWhite', '{W}'], ['c13KickBlack', '{2}{B}']]) {
      const add = M.parseCost(raw), total = {...cost, generic: cost.generic + add.generic, pips: cost.pips.concat(add.pips)};
      if (g.canPayMana(p, total, {card: c, castOpts: a}, {xVal: x}) && await C.yes({g, src: c, you: p}, 'Pay kicker ' + raw + '?')) {Object.assign(cost, total); plan[field] = true;}
    }
    return plan;
  };
  const spent = P.spent;
  P.spent = (g, p, action, unit) => {spent(g, p, action, unit); if (action && unit.c13Snow) {action.c13SnowSpent = (action.c13SnowSpent || 0) + 1; const colors = action.c13SnowColors ||= {}; colors[unit.color] = (colors[unit.color] || 0) + 1;}};
  const prepareAbility = P.prepareAbility, validateAbility = P.validateAbility, commitAbility = P.commitAbility;
  P.prepareAbility = async (ctx, cost) => {
    if (!await prepareAbility(ctx, cost)) return false;
    if (cost.c13NightSoil) {
      const p = await C.choosePlayer(ctx, ctx.g.players.filter(p => p.graveyard.filter(c => c.is('Creature')).length >= 2), 'Choose a graveyard for Night Soil');
      if (!p) return false;
      ctx.c13NightSoil = (await C.choose(ctx.g, ctx.you, p.graveyard.filter(c => c.is('Creature')), 2, 2, 'Exile two creature cards as a cost')).map(C.row);
    }
    return true;
  };
  P.validateAbility = ctx => validateAbility(ctx) && (!ctx.c13NightSoil || ctx.c13NightSoil.length === 2 && ctx.c13NightSoil.every(C.current) && ctx.c13NightSoil[0].card.owner === ctx.c13NightSoil[1].card.owner);
  P.commitAbility = async ctx => {await commitAbility(ctx); if (ctx.c13NightSoil) await ctx.g.moveGraveyardBatch(ctx.c13NightSoil.map(r => r.card), 'exile');};
  const activatable = G.activatableList;
  G.activatableList = function (p, ...args) {
    const out = activatable.call(this, p, ...args);
    if (!this.hasSplitSecond()) for (const card of p.command) {
      const ability = card.def.c13CommandAbility;
      if (ability && card.owner === p && this.canPayMana(p, this.abilityManaCost(p, card, ability.cost.mana, {ability}), {card, isAbility: true})) out.push({card, ability, c13Command: true});
    }
    return out;
  };
  const activate = G.activateAbility;
  G.activateAbility = async function (p, entry, ...args) {
    if (!entry.c13Command) return activate.call(this, p, entry, ...args);
    const c = entry.card, a = c.def.c13CommandAbility, version = c.zoneVersion;
    if (!a || a !== entry.ability || this.hasSplitSecond() || c.zone !== 'command' || !p.command.includes(c) || c.owner !== p) return false;
    if (!await this.payMana(p, this.abilityManaCost(p, c, a.cost.mana, {ability: a}), {card: c, isAbility: true})) return false;
    const ctx = {g: this, src: c, you: p, targets: [], ability: a, isActivatedAbility: true, sourceZone: 'command', sourceZoneVersion: version};
    const so = {kind: 'ability', name: c.name + ' — ' + a.label, ctrl: p, ctx, targets: [], srcCard: c, run: a.run};
    this.stack.push(so); this.markAbilityActivated(p, c);
    await this.emit('abilityActivated', {player: p, card: c, ability: a, isMana: false, targets: [], stackObject: so});
    this.note('stack', {}); await this.flushTriggers(); await this.priorityRound(p); return true;
  };
  const emit = G.emit;
  G.emit = async function (on, d) {
    if (on === 'cast' && d.so && d.card?.def.c13DualKicker) {
      const meta = d.card.castMeta ||= {};
      for (const key of ['c13KickWhite', 'c13KickBlack']) meta[key] = d.so[key];
    }
    if (on === 'attacks') {
      d.c13Attacker = C.row(d.card);
      if (d.target instanceof M.Player) {const old = d.card.meta.c13Attacked; d.card.meta.c13Attacked = {turn: this.turnNo, players: [...new Set([...(old?.turn === this.turnNo ? old.players : []), d.target.idx])]};}
    }
    if (on === 'dies') for (const row of d.snap?.mutateComponents || [{card: d.card, zoneVersion: d.graveyardZoneVersion}]) {
      if (row.card?.zone === 'graveyard' && row.card.zoneVersion === row.zoneVersion) {row.card.meta.c13DiedTurn = this.turnNo; row.card.meta.c13DiedVersion = row.zoneVersion;}
    }
    return emit.call(this, on, d);
  };
  const snapshot = G.snapshot;
  G.snapshot = function (c, ...args) {const out = snapshot.call(this, c, ...args); if (c.meta.c13Attacked) out.c13Attacked = c.meta.c13Attacked; return out;};
  // Scope library shuffles to the spell/ability controller, excluding setup and costs.
  const resolving = [], resolve = G.resolveTop, shuffle = M.shuffle;
  G.resolveTop = async function () {const so = this.stack.at(-1); resolving.push({g: this, so}); try {return await resolve.call(this);} finally {resolving.pop();}};
  M.shuffle = function (arr, random) {
    const out = shuffle(arr, random), current = resolving.at(-1), p = current?.so?.ctrl;
    if (p && arr === p.library && current.g._stackResolutionDepth && C.sources(current.g, null, 'c13Panic').length) void current.g.emit('c13ShuffledByOwnEffect', {player: p});
    return out;
  };
  M.SCRIPTS['Widespread Panic'].c13Panic = true;
})();
