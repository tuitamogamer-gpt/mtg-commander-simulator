'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FDC, S = M.SCRIPTS, T = M.T;
  const ownGrave = filter => C.grave((g, c, p) => c.owner === p && filter(c));
  S["Dragonhawk, Fate's Tempest"] = {kws: ['flying'], triggers: [
    C.enterTrigger('Exile cards to play until your next end step', C.dragonhawk),
    C.attack('Exile cards to play until your next end step', C.dragonhawk),
  ]};
  const celebrate = (g, c) => c.ctrl.turnState.nonlandPermanentsEntered >= 2;
  const pumpDragons = {label: 'Dragons you control get +1/+0 this turn', cost: {mana: '{R}'}, run: ctx => {
    for (const c of ctx.g.creatures(ctx.you).filter(c => c.hasSub('Dragon'))) C.buff(ctx, c, 1, 0);
  }};
  S['Goddric, Cloaked Reveler'] = {kws: ['haste'], statics: [
    {phase: 1, cond: celebrate, apply: (g, c) => {
      c.cur.subtypes = c.cur.subtypes.filter(t => !M.CREATURE_SUBTYPES.has(t)).concat('Dragon');
      c.cur.allCreatureTypes = false; c.cur.allCreatureTypesFromOtherEffects = false; c.cur.suppressPrintedChangeling = true;
      c.cur.kw.add('flying'); c.cur.extraAbilities.push(pumpDragons);
    }},
    {phase: 7, continuesAfterType: true, cond: (g, c) => celebrate(g, c) && c.cur.subtypes.includes('Dragon'), apply: (g, c) => {c.cur.basePower = 4; c.cur.baseToughness = 4;}},
  ]};
  S['Kalitas, Traitor of Ghet'] = {kws: ['lifelink'], fdcKalitas: true, abilities: [{
    label: 'Sacrifice another Vampire or Zombie to put two counters on Kalitas',
    cost: {mana: '{2}{B}', sacOther: true, sac: (g, c) => c.hasSub('Vampire') || c.hasSub('Zombie')},
    run: ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1', 2),
  }]};
  S['Minion of the Mighty'] = {kws: ['menace'], fdcPackTactics: true, triggers: [C.attack('Put a Dragon from your hand into combat', async ctx => {
    const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Creature') && c.hasSub('Dragon')), 0, 1, 'Put a Dragon onto the battlefield tapped and attacking');
    if (c) {
      const target = await ctx.g.chooseAttackingDestination(ctx.you, null, c, 'Minion of the Mighty');
      if (target) await ctx.g.putPermanentOntoBattlefield(c, ctx.you, {tapped: true, attacking: target});
    }
  }, {filter: (g, c, d) => d.card === c && d.fdcPackPower >= 6})]};
  S['Razorlash Transmogrant'] = {statics: [{apply: (g, c) => {c.cur.cantBlock = true;}}], gyAbility: {
    exileSelf: false,
    label: 'Return with a +1/+1 counter', cost: (g, c) => c.owner.opponents(g).some(p => g.lands(p).filter(x => !x.def.super.includes('Basic')).length >= 4) ? '{B}{B}' : '{4}{B}{B}',
    run: ctx => ctx.src.zone === 'graveyard' && ctx.src.zoneVersion === ctx.sourceZoneVersion && ctx.g.putPermanentOntoBattlefield(ctx.src, ctx.you, {additionalCounters: {'+1/+1': 1}, additionalCounterBy: ctx.you}),
  }};
  S['Sarkhan, Dragon Ascendant'] = {triggers: [
    C.enterTrigger('You may behold a Dragon to create a Treasure', async ctx => {
      const pool = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.hasSub('Dragon')).concat(ctx.you.hand.filter(c => c.hasSub('Dragon')));
      const [c] = await C.choose(ctx.g, ctx.you, pool, 0, 1, 'Behold a Dragon you control or reveal a Dragon from your hand');
      if (!c) return;
      if (c.zone === 'hand') await ctx.g.revealToHuman({cards: [c], ctrl: ctx.you, kind: 'reveal'});
      await C.make(ctx, M.TOKENS.treasure);
    }),
    C.enterTrigger('Put a counter on Sarkhan; he becomes a flying Dragon this turn', ctx => {
      if (!C.same(ctx)) return;
      C.add(ctx, ctx.src, '+1/+1'); C.grantType(ctx, ctx.src, 'Dragon', 'eot'); C.grant(ctx, ctx.src, ['flying'], 'eot');
    }, {filter: (g, c, d) => d.card.ctrl === c.ctrl && d.card.hasSub('Dragon')}),
  ]};
  S['Scrapshooter'] = C.gift({kws: ['reach'], fdcGiftPermanent: true, triggers: [
    C.enterTrigger('Give the promised card', ctx => {
      const player = ctx.g.players[ctx.data.fdcGiftPlayer];
      if (player && !player.lost) return C.draw(ctx, 1, player);
    }, {filter: (g, c, d) => d.card === c && d.fdcGiftPlayer !== undefined}),
    C.enterTrigger('Destroy an opposing artifact or enchantment', ctx => ctx.g.destroy(ctx.targets[0], {source: ctx.src}), {
      filter: (g, c, d) => d.card === c && d.fdcGiftPlayer !== undefined,
      targets: [T.permanent((g, c, p) => c.ctrl !== p && (c.is('Artifact') || c.is('Enchantment')))],
    }),
  ]});
  S['Serra Avenger'] = {kws: ['flying', 'vigilance'], castCond: (g, p) => g.turnPlayer !== p || p.turnsStarted > 3};
  S['Undead Butler'] = {triggers: [
    C.enterTrigger('Mill three cards', ctx => ctx.g.mill(ctx.you, 3)),
    C.death('You may exile Undead Butler to return a creature card', async ctx => {
      const c = ctx.data.card;
      if (c.zone !== 'graveyard' || c.zoneVersion !== ctx.data.graveyardZoneVersion || !await C.yes(ctx, 'Exile Undead Butler?')) return;
      await ctx.g.move(c, 'exile');
      if (c.zone === 'exile') C.targeting(ctx, [ownGrave(c => c.is('Creature'))], next => next.g.move(next.targets[0], 'hand'), 'Undead Butler: return a creature card');
    }),
  ]};
  S['Wojek Investigator'] = {kws: ['flying', 'vigilance'], triggers: [C.upkeep('Investigate for each opponent with more cards in hand', async ctx => {
    const count = ctx.you.opponents(ctx.g).filter(p => p.hand.length > ctx.you.hand.length).length;
    for (let n = 0; n < count; n++) await C.investigate(ctx);
  })]};
  S['Zul Ashur, Lich Lord'] = {ward: {life: 2}, abilities: [{
    label: 'You may cast a Zombie creature card from your graveyard this turn', cost: {tap: true},
    targets: [ownGrave(c => c.is('Creature') && c.hasSub('Zombie'))],
    run: ctx => M.BDF.bdfGrant(ctx, ctx.targets[0]),
  }]};
})();
