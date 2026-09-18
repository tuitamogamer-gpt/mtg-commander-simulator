'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.SOC, S = M.SCRIPTS, T = M.T;
  S['Gorma, the Gullet'] = {socGorma: true, triggers: [C.death('Put a +1/+1 counter on Gorma', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1'),
    {filter: (g, c, d) => d.card !== c && d.snap.ctrl === c.ctrl && d.snap.types.includes('Creature')})]};
  S['Ominous Harvest'] = {targets: [T.player()], resolve: async ctx => {await C.draw(ctx, 1, ctx.targets[0]); await ctx.g.loseLife(ctx.targets[0], 1);},
    triggers: [C.trigger('cast', 'Gravestorm: copy for each permanent put into a graveyard this turn', async ctx => {
      for (let i = 0; i < (ctx.data.socGravestorm || 0); i++) await ctx.g.copySpell(ctx.data.so, ctx.you);
    }, {zone: 'stack', filter: (g, c, d) => d.card === c})]};
  S['Ribtruss Roaster'] = C.mechanic('devour', {triggers: [C.end('Create a Pest for each +1/+1 counter', ctx => C.make(ctx, M.TOKENS.pest, C.count(ctx.src, '+1/+1')))]}, {n: 1});
  S['Immoral Bargain'] = {additionalCostX: true, additionalCostXMax: (g, c, p) => g.creatures(p).filter(c => g.canSacrifice(c)).length,
    addlCost: {sacCreaturesEqualTargets: true},
    targets: (g, c, a) => [T.permanent((g, c) => !c.is('Land'), {count: a.c1516X || a.xVal || 0, min: a.c1516X || a.xVal || 0})],
    resolve: ctx => ctx.g.destroyMany(C.flat(ctx.targets), {source: ctx.src})};
  S['Jadar, Ghoulcaller of Nephalia'] = {triggers: [C.end('Create a decayed Zombie if you have none', ctx => {
    if (!ctx.g.creatures(ctx.you).some(c => c.kw('decayed') || c.def.decayed)) return C.make(ctx, M.AFC.zombie(true));
  }, {filter: (g, c, d) => d.player === c.ctrl && !g.creatures(c.ctrl).some(c => c.kw('decayed') || c.def.decayed)})]};
  S['Priest of Forgotten Gods'] = {abilities: [{label: 'Sacrifice two others: chosen players lose life and sacrifice; add BB and draw',
    cost: {tap: true, sacCreature: true, sacOther: true, sacN: 2},
    targets: (g) => [T.player({count: g.alivePlayers().length, min: 0, upTo: true})],
    run: async ctx => {
      const players = C.flat(ctx.targets); for (const p of players) await ctx.g.loseLife(p, 2);
      const chosen = [];
      for (const p of ctx.g.apnapFrom(ctx.you).filter(p => players.includes(p))) {
        const pool = ctx.g.creatures(p).filter(c => ctx.g.canSacrifice(c));
        const cs = await C.choose(ctx.g, p, pool, Math.min(1, pool.length), 1, 'Sacrifice a creature', 'sacCost');
        chosen.push(...cs.map(c => ({p, c})));
      }
      await ctx.g.withGraveyardEntryBatch(async () => {for (const {p, c} of chosen) await ctx.g.sacrifice(p, c);});
      ctx.you.pool.B += 2; await C.draw(ctx);
    }}]};
  S['Witherbloom Command'] = C.modalSpell({pick: 2, list: [
    {label: 'Mill three; return a land to hand', targets: [T.player()], run: async ctx => {await C.mill(ctx, 3, ctx.targets[0]);
      const pool = ctx.you.graveyard.filter(c => c.is('Land')), [c] = await C.choose(ctx.g, ctx.you, pool, Math.min(1, pool.length), 1, 'Return a land to your hand'); if (c) await ctx.g.move(c, 'hand');}},
    {label: 'Destroy a small noncreature nonland permanent', targets: [T.permanent((g, c) => !c.is('Creature') && !c.is('Land') && c.mv <= 2)], run: ctx => ctx.g.destroy(ctx.targets[0], {source: ctx.src})},
    {label: 'A creature gets −3/−1', targets: [T.creature()], run: ctx => C.buff(ctx, ctx.targets[0], -3, -1)},
    {label: 'An opponent loses two life; gain two', targets: [T.opponent()], run: async ctx => {await ctx.g.loseLife(ctx.targets[0], 2); await ctx.g.gainLife(ctx.you, 2, ctx.src);}},
  ]});
  S['Deadly Brew'] = {resolve: async ctx => {
    const choices = [];
    for (const p of ctx.g.apnapFrom(ctx.you)) {
      const pool = C.ownPermanents(ctx.g, p).filter(c => (c.is('Creature') || c.is('Planeswalker')) && ctx.g.canSacrifice(c));
      const [c] = await C.choose(ctx.g, p, pool, Math.min(1, pool.length), 1, 'Sacrifice a creature or planeswalker', 'sacCost');
      if (c) choices.push({p, c});
    }
    let own;
    await ctx.g.withGraveyardEntryBatch(async () => {for (const {p, c} of choices) if (await ctx.g.sacrifice(p, c)) {if (p === ctx.you) own = c;}});
    if (own) await C.recover(ctx, ctx.you.graveyard.filter(c => c !== own && C.permanent(ctx.g, c)));
  }};
  const drain = {name: 'Exsanguinate', cost: '{X}{B}{B}', types: ['Sorcery'], oracle: 'Each opponent loses X life. You gain life equal to the life lost this way.', resolve: async ctx => {
    let lost = 0; for (const p of ctx.you.opponents(ctx.g)) {const before = p.life; await ctx.g.loseLife(p, ctx.x || 0); lost += Math.max(0, before - p.life);} await ctx.g.gainLife(ctx.you, lost, ctx.src);
  }};
  const stones = {name: 'Turn Stones', cost: '{B}{G}', types: ['Sorcery'], oracle: 'For each opponent, you create a 1/1 black and green Pest creature token with "When this token dies, you gain 1 life."', resolve: ctx => C.make(ctx, M.TOKENS.pest, ctx.you.opponents(ctx.g).length)};
  S['Eccentric Pestfinder'] = {kws: ['trample'], triggers: [C.end('Become prepared if you gained life this turn', ctx => {
    if (ctx.you.turnState.lifeGained > 0) C.prepare(ctx, stones);
  }, {filter: (g, c) => c.ctrl.turnState.lifeGained > 0})]};
  S['Stensian Sanguinist'] = {triggers: [C.attacks('Give a creature deathtouch; prepare after its combat damage', ctx => {
    const source = C.row(ctx.src), target = C.row(ctx.targets[0]); C.buff(ctx, target.card, 0, 0, ['deathtouch']);
    const turn = ctx.g.turnNo, combat = ctx.g.cdkCombatSerial || 0;
    ctx.g.delayed.push({on: 'damageToPlayer', once: false, src: ctx.src, ctrl: ctx.you, name: 'Stensian Sanguinist: become prepared',
      filter: (g, d) => g.turnNo === turn && (g.cdkCombatSerial || 0) === combat && d.combat && d.src === target.card && C.current(target),
      run: next => C.current(source) && C.prepare({...next, src: source.card, sourceZoneVersion: source.version}, drain)});
  }, {targets: [T.creature()]})]};
})();
