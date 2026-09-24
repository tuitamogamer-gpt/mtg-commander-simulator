'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FRC, S = M.SCRIPTS, T = M.T;
  S['Jace, Multiverse Architect'] = {triggers: [C.combat('Opponent may pay two to attack your Jaces this turn', async ctx => {
    const p = ctx.data.player;
    if (!await C.pay({...ctx, you: p}, '{2}')) ctx.g.untilEffects.push({kind: 'frcJaceShield', attacker: p, defender: ctx.you, expires: 'eot'});
  }, {filter: (g, c, d) => d.player !== c.ctrl})], abilities: [
    C.loyalty(1, '+1: Draw two, then bottom a card', async ctx => {
      await C.draw(ctx, 2); const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand, 1, 1, 'Put a card on the bottom of your library', 'discard');
      if (c) await ctx.g.move(c, 'library', {toBottom: true});
    }, {aiScore: () => 5}),
    C.loyalty(-3, '−3: Exile another creature or planeswalker; reveal a replacement', async ctx => {
      await ctx.g.move(ctx.targets[0], 'exile'); await C.polymorph(ctx, ctx.you, c => c.is('Creature') || c.is('Planeswalker'));
    }, {targets: [T.permanent((g, c, p, source) => c.ctrl === p && c !== source && (c.is('Creature') || c.is('Planeswalker')), {aiHint: {goal: 'frc-polymorph'}})],
      aiScore: (g, c) => g.creatures(c.ctrl).some(x => x.isToken) ? 9 : 2}),
  ]};
  S['Mass Polymorph'] = {resolve: async ctx => {const n = await ctx.g.exileMany(ctx.g.creatures(ctx.you)); await C.polymorph(ctx, ctx.you, c => c.is('Creature'), n, true);}};
  S['Sunfall'] = {resolve: async ctx => {const n = await ctx.g.exileMany(ctx.g.creatures()); await C.incubate(ctx, n);}};
  S["Teferi's Reproach"] = {exileOnResolve: true, targets: [T.opponent()], resolve: ctx => {
    const p = ctx.targets[0]; ctx.g.untilEffects.push({kind: 'c1719LifeLock', who: p, expires: 'untilTurnOf', whoTurn: p},
      {kind: 'c1719PlayerProtection', who: p, color: 'all', expires: 'untilTurnOf', whoTurn: p});
    ctx.g.phaseOutMany(C.ownPermanents(ctx.g, p).filter(c => !c.is('Land')), p); ctx.g.recalc();
  }};
  S['Fatehold Charm'] = C.modalSpell({pick: 1, list: [
    {label: 'Draw a card and empower Jace 2', run: async ctx => {await C.draw(ctx); await C.empower(ctx, 2);}},
    {label: 'Return a spell or creature to its owner’s hand', targets: [{oracleAlternativesV18: [T.spell(), T.creature()]}], run: async ctx => {
      const target = ctx.targets[0];
      if (target instanceof M.CardInst) {await ctx.g.move(target, 'hand'); return;}
      const i = ctx.g.stack.indexOf(target); if (i < 0) return;
      ctx.g.stack.splice(i, 1);
      if (!target.isCopy && target.card?.zone === 'stack') await ctx.g.move(target.card, target.castOpts?.flashback || target.castOpts?.jumpstart ? 'exile' : 'hand');
      ctx.g.note('stack', {});
    }},
    {label: 'Your creatures get +1/+2 this turn', run: ctx => {for (const c of ctx.g.creatures(ctx.you)) C.buff(ctx, c, 1, 2);}},
  ]});
  S['Plan for All Outcomes'] = {triggers: [C.enterTrigger('Owner puts another nonland permanent on top or bottom', async ctx => {
    const c = ctx.targets[0]; if (!c) return;
    const side = await C.option(ctx, [{key: 'top', label: 'Top of library'}, {key: 'bottom', label: 'Bottom of library'}], 'Choose top or bottom for ' + c.name, c.owner);
    if (!['top', 'bottom'].includes(side)) throw Error('Invalid library placement');
    await ctx.g.move(c, 'library', {toBottom: side === 'bottom'});
  }, {targets: [T.permanent((g, c, p, source) => c !== source && !c.is('Land'), {count: 1, min: 0, upTo: true})]}),
  C.trigger('castNonCreature', 'Empower Jace 1 for your first noncreature spell', ctx => C.empower(ctx, 1), {filter: (g, c, d) => d.player === c.ctrl && d.nthNonCreature === 1})]};
  S['Windcrag Siege'] = {asEnters: async (g, c) => {
    c.meta.frcSiege = await C.option({g, src: c, you: c.ctrl}, [{key: 'mardu', label: 'Mardu — double attack triggers'}, {key: 'jeskai', label: 'Jeskai — create Goblins'}], 'Choose Mardu or Jeskai');
    if (!['mardu', 'jeskai'].includes(c.meta.frcSiege)) throw Error('Invalid Siege choice');
  }, doubleTriggerFilter: (g, self, card, on) => C.live(self) && self.meta.frcSiege === 'mardu' && card.zone === 'battlefield' && ['attacks', 'attackersDeclared'].includes(on),
  triggers: [C.upkeep('Create a Goblin with lifelink and haste this turn', async ctx => {
    for (const c of await C.make(ctx, C.token('Goblin', ['Goblin'], 1, 1, ['R']))) C.buff(ctx, c, 0, 0, ['lifelink', 'haste']);
  }, {filter: (g, c, d) => d.player === c.ctrl && c.meta.frcSiege === 'jeskai'})]};
  for (const [name, colors] of [['Turbulent Crater', ['B', 'R']], ['Turbulent Shore', ['W', 'U']], ['Turbulent Wetlands', ['U', 'B']]]) S[name] = {
    entersTapped: (g, c) => g.lands().filter(l => l.ctrl !== c.ctrl).length < 8, producesColors: colors,
    mana: {cost: {tap: true}, produce: colors.map(color => ({[color]: 1}))},
  };
})();
