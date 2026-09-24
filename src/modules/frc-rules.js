'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, G = M.Game.prototype;
  const loyalty = (n, label, run, extra = {}) => ({loyalty: n, sorcery: true, label, cost: {}, run, ...extra});
  const jace = C.registerToken('frcJace', {name: 'Jace', tokenImageName: 'FRC Jace',
    types: ['Planeswalker'], subtypes: ['Jace'], super: [], cost: null, loyalty: '0', colorsOverride: ['U'], kws: [],
    oracle: '−1: Surveil 1.\n−3: Draw a card.', abilities: [
      loyalty(-1, '−1: Surveil 1', ctx => M.E.surveil(ctx.g, ctx.you, 1)),
      loyalty(-3, '−3: Draw a card', ctx => C.draw(ctx)),
    ]});
  async function empower(ctx, n) {
    let pool = C.ownPermanents(ctx.g, ctx.you).filter(c => c.isToken && c.is('Planeswalker') && c.hasSub('Jace'));
    if (!pool.length) {
      await C.make(ctx, jace);
      pool = C.ownPermanents(ctx.g, ctx.you).filter(c => c.isToken && c.is('Planeswalker') && c.hasSub('Jace'));
    }
    if (!pool.length) return;
    const chosen = pool.length === 1 ? pool[0] : (await C.choose(ctx.g, ctx.you, pool, 1, 1, 'Choose a Jace token to empower'))[0];
    C.add(ctx, chosen, 'loyalty', n);
  }
  async function revealUntil(ctx, player, filter, count = 1) {
    const revealed = [], hits = [];
    if (count > 0) for (const card of player.library.slice().reverse()) {
      revealed.push(card); if (filter(card)) hits.push(card); if (hits.length >= count) break;
    }
    if (revealed.length) await ctx.g.revealToHuman({cards: revealed, ctrl: player, kind: 'reveal'});
    return {revealed, hits};
  }
  async function polymorph(ctx, player = ctx.you, filter = c => c.is('Creature'), n = 1, shuffle = false) {
    const {revealed, hits} = await revealUntil(ctx, player, filter, n);
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const c of hits) if (c.zone === 'library') await ctx.g.putPermanentOntoBattlefield(c, ctx.you);});
    if (shuffle) M.shuffle(player.library, ctx.g.rnd);
    else await C.randomBottom(ctx, revealed.filter(c => !hits.includes(c) && c.zone === 'library'), player);
    return hits;
  }
  const angel = C.registerToken('frcAngel', C.token('Angel', ['Angel'], 4, 4, ['W'], ['flying'], {tokenImageName: 'FRC Angel'}));
  const insect = C.registerToken('frcInsect', C.token('Insect', ['Insect'], 2, 1, ['W'], ['flying'], {tokenImageName: 'FRC Insect'}));
  const myr = C.registerToken('frcMyr', C.token('Myr', ['Myr'], 1, 1, [], [], {types: ['Artifact', 'Creature'], tokenImageName: 'FRC Myr'}));
  const gingerbrute = C.registerToken('frcGingerbrute', C.token('Gingerbrute', ['Food', 'Golem'], 1, 1, [], ['haste'], {
    cost: '{1}', types: ['Artifact', 'Creature'], explicitTokenName: true, tokenImageName: 'FRC Gingerbrute',
    abilities: [{label: 'Only creatures with haste can block this turn', cost: {mana: '{1}'}, run: ctx => {
      if (C.same(ctx)) ctx.g.untilEffects.push({kind: 'frcHasteBlockers', expires: 'eot', iid: ctx.src.iid, zoneVersion: ctx.src.zoneVersion});
    }}, {label: 'Sacrifice to gain 3 life', cost: {mana: '{2}', tap: true, sacSelf: true}, run: ctx => ctx.g.gainLife(ctx.you, 3, ctx.src)}],
  }));
  const block = G.canBlock;
  G.canBlock = function (blocker, attacker) {
    if (this.untilEffects.some(e => e.kind === 'frcHasteBlockers' && e.iid === attacker.iid && e.zoneVersion === attacker.zoneVersion) && !blocker.kw('haste')) return false;
    return block.call(this, blocker, attacker);
  };
  const attack = G.canAttackTarget;
  G.canAttackTarget = function (c, target) {
    if (target?.is?.('Planeswalker') && target.hasSub('Jace') && this.untilEffects.some(e => e.kind === 'frcJaceShield' && e.attacker === c.ctrl && e.defender === target.ctrl)) return false;
    return attack.call(this, c, target);
  };
  const protection = G.isProtectedFrom;
  G.isProtectedFrom = function (target, source, options) {
    if (target instanceof M.Player && source && C.sources(this, target, 'frcEmissary').some(c => source.is?.(c.meta.frcProtection))) return true;
    return protection.call(this, target, source, options);
  };
  const spellCost = G.spellCost;
  G.spellCost = function (p, c, opts = {}) {
    const cost = spellCost.call(this, p, c, opts), def = this.castDefinition(c, opts);
    const reduction = p.command.filter(s => s !== c && s.def.frcUrSphinx && (def.changeling || def.subtypes?.includes('Sphinx'))).length;
    const remaining = cost.generic - reduction;
    return {...cost, generic: Math.max(0, remaining), xReduction: (cost.xReduction || 0) + Math.max(0, -remaining)};
  };
  const modalTrigger = trigger => ({...trigger, run: ctx => trigger.modes.list[Array.isArray(ctx.mode) ? ctx.mode[0] : ctx.mode].run(ctx)});
  M.FRC = {...C, loyalty, jace, empower, revealUntil, polymorph, angel, insect, myr, gingerbrute, modalTrigger};
})();
