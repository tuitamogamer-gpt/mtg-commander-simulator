'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL, S = M.SCRIPTS, T = M.T;
  S['Arena of Glory'] = {entersTapped: (g, c) => !g.lands(c.ctrl).some(t => t !== c && t.hasSub('Mountain')), mana: [C.mana('R'), {cost: {mana: '{R}', tap: true, exertSelf: true}, produce: [{R: 2}], cslHasteMana: true}]};
  S['Chorus of the Conclave'] = {kws: ['forestwalk'], cslChorus: true};
  S['Cleric Class'] = {replace: [{event: 'lifegain', run: (g, n) => n + 1}], abilities: C.levels(['{3}{W}', '{4}{W}']), triggers: [C.trigger('lifeGain', 'Put a +1/+1 counter on a creature you control', ctx => C.add(ctx, ctx.targets[0], '+1/+1'), {filter: (g, c, d) => C.level(c) >= 2 && d.player === c.ctrl, targets: [T.yourCreature()]})]};
  const level3 = S['Cleric Class'].abilities[1].run;
  S['Cleric Class'].abilities[1].run = async ctx => {
    const previous = C.level(ctx.src); await level3(ctx);
    if (C.same(ctx) && previous === 2 && C.level(ctx.src) === 3) C.targeting(ctx, [C.grave((g, c, p) => c.owner === p && c.is('Creature'))], async next => {
      const c = next.targets[0]; await next.g.putPermanentOntoBattlefield(c, next.you); await next.g.gainLife(next.you, Math.max(0, c.toughness), next.src);
    }, 'Cleric Class: return a creature and gain life');
  };
  S['Dazzling Theater // Prop Room'] = C.bdfRoom([{key: 'left', name: 'Dazzling Theater', cost: '{3}{W}'}, {key: 'right', name: 'Prop Room', cost: '{2}{W}'}], {cslTheater: true});
  S['Howlsquad Heavy'] = {asEnters: (g, c) => {c.ctrl.counters.speed = Math.max(1, c.ctrl.counters.speed || 0);}, statics: [C.subtype('Goblin', true, 0, 0, ['haste'])], triggers: [C.combat('Create a Goblin that attacks this combat if able', async ctx => {
    const cs = await C.make(ctx, M.TOKENS.goblin); for (const c of cs) ctx.g.untilEffects.push({kind: 'cslMustAttack', iid: c.iid, version: c.zoneVersion, combat: ctx.g.afcCombatId, expires: 'eot'});
  })], mana: {cost: {tap: true}, cond: (g, c, p) => (p.counters.speed || 0) >= 4, produce: (g, c, p) => [{R: g.creatures(p).filter(c => c.hasSub('Goblin')).length}]}};
  S['Invigorate'] = {cslInvigorate: true, targets: [T.creature()], resolve: ctx => C.buff(ctx, ctx.targets[0], 4, 4)};
  S['Karador, Ghost Chieftain'] = {cslKarador: true, selfCostAdjust: (g, c, p) => -p.graveyard.filter(c => c.is('Creature')).length};
  S['Lathiel, the Bounteous Dawn'] = {kws: ['lifelink'], triggers: [C.end('Distribute counters for life gained this turn', ctx => {
    for (const c of C.flat(ctx.targets)) C.add(ctx, c, '+1/+1', ctx.cslDistribution[c.iid] || 0);
  }, {filter: (g, c) => c.ctrl.turnState.lifeGained > 0, prepareTargets: async ctx => {
    const n = ctx.you.turnState.lifeGained, spec = T.creature({count: n, min: 0, upTo: true, filter: (g, c) => c !== ctx.src}), pool = ctx.g.legalTargets(spec, ctx.src, ctx.you);
    const chosen = await ctx.you.controller.decide(ctx.g, {type: 'chooseTargets', player: ctx.you, candidates: pool, min: 0, max: Math.min(n, pool.length), prompt: 'Choose creatures for Lathiel counters', aiHint: {goal: 'pump'}});
    if (!Array.isArray(chosen) || new Set(chosen).size !== chosen.length || chosen.length > n || chosen.some(c => !pool.includes(c))) return false;
    let left = n; ctx.cslDistribution = {};
    for (let i = 0; i < chosen.length; i++) {
      const max = left - (chosen.length - i - 1), amount = await ctx.you.controller.decide(ctx.g, {type: 'chooseX', min: 1, max, card: ctx.src, prompt: 'Counters for ' + chosen[i].name, aiHint: {kind: 'chooseX'}});
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > max) return false; ctx.cslDistribution[chosen[i].iid] = amount; left -= amount;
    }
    ctx.targets = [chosen]; ctx.boundTargetSpecs = [spec]; return true;
  }})]};
  S['Nezumi Graverobber'] = {abilities: [{label: 'Exile an opposing graveyard card; flip if it is empty', cost: {mana: '{1}{B}'}, targets: [C.grave((g, c, p) => c.owner !== p)], run: async ctx => {
    const c = ctx.targets[0], p = c.owner; await ctx.g.move(c, 'exile');
    if (C.same(ctx) && !p.graveyard.length) {ctx.src.meta.c1719Flipped = true; M.C1719.flipDefinition(ctx.src); ctx.g.recalc();}
  }}], c1719FlipBack: {name: 'Nighteyes the Desecrator', super: ['Legendary'], power: '4', toughness: '2', abilities: [{label: 'Return a creature from a graveyard under your control', cost: {mana: '{4}{B}'}, targets: [C.grave((g, c) => c.is('Creature'))], run: ctx => ctx.g.putPermanentOntoBattlefield(ctx.targets[0], ctx.you)}]}};
  S['Patron of the Nezumi'] = {cslOffering: true, triggers: [C.trigger('pomGraveEntry', 'The opponent loses one life', ctx => ctx.g.loseLife(ctx.data.player, 1), {filter: (g, c, d) => d.player !== c.ctrl && C.permanent(g, d.card)})]};
  const songMana = {run: ctx => {for (const c of ctx.g.creatures(ctx.you)) C.grant(ctx, c, [], 'untilTurnOf', {whoTurn: ctx.you, field: 'extraMana', grants: [{cost: {tap: true}, produce: [{ANY: 1}]}]});}};
  S['Song of Freyalise'] = {saga: [songMana, songMana, {run: ctx => {for (const c of ctx.g.creatures(ctx.you)) {C.add(ctx, c, '+1/+1'); C.buff(ctx, c, 0, 0, ['vigilance', 'trample', 'indestructible']);}}}]};
  S['Szadek, Lord of Secrets'] = {kws: ['flying'], replace: [{event: 'damage', applies: (g, d, s) => d.src === s && d.combat && d.target instanceof M.Player, run: async (g, d, s) => {
    g.addCounters(s, '+1/+1', d.n, false, s.ctrl); await g.mill(d.target, d.n); return 0;
  }}]};
  S['Throne of Eldraine'] = {cslThrone: true, asEnters: async (g, c) => {c.meta.cslColor = await C.color({g, src: c, you: c.ctrl});}, mana: {cost: {tap: true}, produce: (g, c) => c.meta.cslColor ? [{[c.meta.cslColor]: 4}] : [], restrict: (g, action, source) => {
    if (!action?.card || action.isAbility) return false; const colors = M.CDK.castColors(g, action.card, action.castOpts || {}); return colors.length === 1 && colors[0] === source.meta.cslColor;
  }}, abilities: [{label: 'Spend three mana of the chosen color: draw two', cost: {mana: '{3}', tap: true}, cslColoredPayment: true, run: ctx => C.draw(ctx, 2)}]};
})();
