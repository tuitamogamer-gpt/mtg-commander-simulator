'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.SOC, G = M.Game.prototype;
  const colors = ['W', 'U', 'B', 'R', 'G'];
  const color = async ctx => {
    const key = await C.option(ctx, colors.map(key => ({key, label: key})), 'Choose a color', ctx.you, 'color');
    if (!colors.includes(key)) throw Error('Invalid color');
    return key;
  };
  const mana = (c = 'C') => ({cost: {tap: true}, produce: [{[c]: 1}]});
  const grave = (filter = () => true, extra = {}) => M.StarterPrecons.grave(filter, extra);
  const steal = (ctx, c) => {M.OracleV8Control.gain(ctx.g, c, ctx.you, {temporary: true}); ctx.g.untap(c); C.buff(ctx, c, 0, 0, ['haste']);};
  const protection = (ctx, c, col) => C.effectOn(ctx, c, (g, card) => {card.cur.protectionFrom.push((g, source) => source.colors.includes(col));});
  const sources = (g, p, key) => C.sources(g, p, key);
  const canSearch = G.canSearchLibrary;
  G.canSearchLibrary = function (p) {return !sources(this, null, 'cslStranglehold').some(c => c.ctrl !== p) && canSearch.call(this, p);};
  const timing = G.canCastTiming;
  G.canCastTiming = function (p, c, a) {
    if (p.turnState.cslAttacked && sources(this, null, 'cslArbiter').some(s => s.ctrl !== p)) return false;
    return timing.call(this, p, c, a);
  };
  const attack = G.canAttackTarget;
  G.canAttackTarget = function (c, p) {
    if (c.ctrl.turnState.spellsCast && sources(this, null, 'cslArbiter').some(s => s.ctrl !== c.ctrl)) return false;
    return attack.call(this, c, p);
  };
  const emit = G.emit;
  G.emit = function (on, d) {
    if (on === 'attackersDeclared' && d.attackers?.length) d.player.turnState.cslAttacked = true;
    return emit.call(this, on, d);
  };
  const soldier = C.registerToken('cslSoldier', C.token('Soldier', ['Soldier'], 1, 1, ['R'], ['haste'], {tokenImageName: 'CSL Soldier'}));
  const spawn = C.registerToken('cslSpawn', C.token('Eldrazi Spawn', ['Eldrazi', 'Spawn'], 0, 1, [], [], {mana: {cost: {sacSelf: true}, produce: [{C: 1}]}, tokenImageName: 'Eldrazi Spawn'}));
  M.CSL = {...C, colors, color, mana, grave, steal, protection, soldier, spawn};
})();
