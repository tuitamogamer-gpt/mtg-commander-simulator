'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.SOC, S = M.SCRIPTS, T = M.T;
  const small = c => C.permanent(null, c) && !c.is('Land') && c.mv <= 3;
  const hasLeft = p => !!p.turnState.bdfGraveLeft;
  S['Quintorius, History Chaser'] = {
    triggers: [C.ownGraveEvent('Create a red and white Spirit', ctx => C.make(ctx, C.spirit))],
    abilities: [
      {label: '+1: Discard to draw two, then mill one', loyalty: 1, sorcery: true, run: async ctx => {
        const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand, 0, 1, 'Discard a card to draw two', 'discard');
        if (c) { await ctx.g.discard(ctx.you, [c]); await C.draw(ctx, 2); await C.mill(ctx, 1); }
      }},
      {label: '−4: Spirits gain double strike and vigilance', loyalty: -4, sorcery: true,
        run: ctx => { for (const c of ctx.g.creatures(ctx.you).filter(c => c.hasSub('Spirit'))) C.buff(ctx, c, 0, 0, ['double strike', 'vigilance']); }},
    ],
  };
  S['Excava, the Risen Past'] = {triggers: [C.attack('Return a small permanent as a flying Spirit with finality', async ctx => {
    const c = ctx.targets[0]; if (!c) return;
    await ctx.g.putPermanentOntoBattlefield(c, ctx.you, {additionalCounters: {finality: 1}, additionalCounterBy: ctx.you,
      socSpiritForm: true});
  }, {targets: [C.grave(c => c.mv <= 3 && (c.is('Artifact') || c.is('Creature') || c.is('Enchantment') && !c.hasSub('Aura')), {min: 0, count: 1, upTo: true})]})]};
  S['Augusta, Order Returned'] = {triggers: [C.attack('Each player exiles a graveyard card; strengthen an attacker', async ctx => {
    const chosen = [];
    for (const p of ctx.g.apnapFrom(ctx.you)) chosen.push(...await C.choose(ctx.g, p, p.graveyard, Math.min(1, p.graveyard.length), 1, 'Exile a card from your graveyard'));
    const n = chosen.filter(c => !c.is('Land')).length;
    await C.exileCards(ctx, chosen);
    if (n) C.targeting(ctx, [T.creature({filter: (g, c) => !!c.attacking})], next => C.add(next, next.targets[0], '+1/+1', n), 'Augusta: counters for exiled nonlands');
  })]};
  S['Ceaseless Conflict'] = {resolve: async ctx => {
    const own = ctx.g.creatures(ctx.you).filter(c => !c.isToken).map(c => ({card: c, version: c.zoneVersion}));
    await ctx.g.destroyMany(ctx.g.creatures(), {source: ctx.src});
    const n = own.filter(r => r.card.zoneVersion !== r.version && !r.card.phasedOut).length;
    if (n) await C.make(ctx, C.spirit, n);
  }};
  S['Advanced Reconstruction'] = {
    abilities: C.levels(['{1}{R}', '{1}{R}']),
    costMods: [(g, s, {player, card}) => player === s.ctrl && C.level(s) >= 3 && card.zone !== 'hand' ? -2 : 0],
    triggers: [C.trigger('precombatMain', 'Mill one, then exile a random graveyard card to play this turn', async ctx => {
      await C.mill(ctx, 1); const pool = ctx.you.graveyard, c = pool[Math.floor(ctx.g.rnd() * pool.length)];
      if (c) { await ctx.g.move(c, 'exile'); if (c.zone === 'exile') C.playGrant(ctx, c, {turn: ctx.g.turnNo}); }
    }, {filter: (g, c, d) => d.player === c.ctrl && (d.ordinal || 1) === 1}),
    C.ownGraveEvent('Deal two damage to each opponent', ctx => C.damage(ctx, ctx.you.opponents(ctx.g), 2), {filter: (g, c, d) => C.level(c) >= 2 && C.graveLeft(g, c, d)})],
  };
  S['Fateful Tempest'] = {resolve: async ctx => {
    const votes = await C.vote(ctx, [{key: 'past', label: 'Past — mill and deal damage'}, {key: 'present', label: 'Present — exile a card to play'}]);
    const past = votes.filter(v => v.key === 'past').length, present = votes.filter(v => v.key === 'present').length;
    const cards = await C.mill(ctx, past);
    await C.damage(ctx, ctx.you.opponents(ctx.g), cards.reduce((n, c) => n + c.mv, 0));
    if (present) for (const c of await C.exileTop(ctx, present)) C.playGrant(ctx, c, {c1920UntilOwnTurn: ctx.you.turnsStarted + 1});
  }};
  S['Relic Retriever'] = {triggers: [C.end('Create a Treasure if a card left your graveyard', ctx => hasLeft(ctx.you) && C.make(ctx, M.TOKENS.treasure), {filter: (g, c) => hasLeft(c.ctrl)})]};
  S['Spirit of Resilience'] = {triggers: [C.ownGraveEvent('Add a counter, then optionally copy one of the departing cards', async ctx => {
    if (!C.same(ctx)) return;
    C.add(ctx, ctx.src, '+1/+1');
    const pool = ctx.data.cards.filter((c, i) => c.owner === ctx.you && (ctx.data.snapshots?.[i]?.types || c.def.types).some(t => t === 'Artifact' || t === 'Creature'));
    const [c] = await C.choose(ctx.g, ctx.you, pool, 0, 1, 'Copy an artifact or creature that left your graveyard');
    if (c && C.same(ctx)) M.OracleV8Copies.applyCopy(ctx.g, ctx.src, c.def, {duration: 'eot'});
  })]};
  S['Ao, the Dawn Sky'] = {triggers: [C.death('Choose Ao’s death effect', null, {modes: {list: [
    {label: 'Look at seven; put nonland permanents with total mana value up to four onto the battlefield', run: async ctx => {
      const cards = await C.look(ctx, 7), chosen = []; let left = 4;
      while (true) {
        const pool = cards.filter(c => !chosen.includes(c) && C.permanent(ctx.g, c) && !c.is('Land') && c.mv <= left);
        const [c] = await C.choose(ctx.g, ctx.you, pool, 0, 1, 'Choose a permanent (remaining mana value ' + left + ')');
        if (!c) break; chosen.push(c); left -= c.mv;
      }
      await C.enterMany(ctx, chosen); await C.randomBottom(ctx, cards.filter(c => !chosen.includes(c)));
    }},
    {label: 'Put two +1/+1 counters on each creature or Vehicle you control', run: ctx => {
      for (const c of C.ownPermanents(ctx.g, ctx.you).filter(c => c.is('Creature') || c.hasSub('Vehicle'))) C.add(ctx, c, '+1/+1', 2);
    }},
  ]}})]};
  S['Claim Jumper'] = {triggers: [C.enterTrigger('Search for up to two Plains while behind on lands', async ctx => {
    for (let i = 0; i < 2; i++) {
      if (!ctx.you.opponents(ctx.g).some(p => ctx.g.lands(p).length > ctx.g.lands(ctx.you).length)) break;
      if (await C.yes(ctx, 'Search for a Plains?')) await C.search(ctx, ctx.you, c => c.hasSub('Plains'), 1, 'battlefield', true);
    }
  }, {filter: (g, c, d) => d.card === c && c.ctrl.opponents(g).some(p => g.lands(p).length > g.lands(c.ctrl).length)})]};
  S['Serra Paragon'] = {socParagon: true};
  S['White Orchid Phantom'] = {triggers: [C.enterTrigger('Destroy a nonbasic land; its controller may find a basic', async ctx => {
    const c = ctx.targets[0]; if (!c) return; const p = c.ctrl;
    await ctx.g.destroy(c, {source: ctx.src});
    if (await C.yes(ctx, 'Search for a basic land?', p)) await C.search(ctx, p, c => c.is('Land') && c.def.super.includes('Basic'), 1, 'battlefield', true);
  }, {targets: [T.permanent((g, c) => c.is('Land') && !c.def.super.includes('Basic'), {min: 0, count: 1, upTo: true})]})]};
  S['Conspiracy Theorist'] = {triggers: [
    C.attack('Pay one and discard to draw', async ctx => { if (ctx.you.hand.length && await C.pay(ctx, '{1}')) { await C.discard(ctx, ctx.you); await C.draw(ctx); } }),
    C.trigger('discarded', 'Exile a discarded nonland to cast this turn', ctx => C.exileDiscard(ctx, true), {oncePerBatch: true, filter: (g, c, d) => d.player === c.ctrl && !d.card.is('Land')}),
  ]};
  S['Containment Construct'] = {triggers: [C.trigger('discarded', 'Exile the discarded card to play this turn', ctx => C.exileDiscard(ctx), {filter: (g, c, d) => d.player === c.ctrl})]};
  S['Hofri Ghostforge'] = {statics: [C.subtype('Spirit', false, 1, 1, ['trample', 'haste'])], triggers: [C.death('Exile the creature and create a Spirit copy linked to it', async ctx => {
    if (!C.deceased(ctx)) return; const c = ctx.data.card, def = C.snapshotCopy(c, ctx.data.snap.zoneVersion);
    await ctx.g.move(c, 'exile'); if (c.zone !== 'exile') return; const row = C.row(c);
    const leave = C.trigger('lto', 'Return the card exiled by Hofri to its owner’s graveyard', next => C.current(row) && next.g.move(c, 'graveyard'), {filter: (g, self, d) => d.card === self});
    await C.copy(ctx, c, {definition: {...def, subtypes: [...new Set([...def.subtypes, 'Spirit'])], triggers: [...(def.triggers || []), leave]}});
  }, {filter: (g, c, d) => d.card !== c && d.snap.ctrl === c.ctrl && !d.snap.isToken && d.snap.types.includes('Creature')})]};
  S['Quintorius, Loremaster'] = {triggers: [C.end('Exile a noncreature nonland card and create a Spirit', async ctx => {
    const c = ctx.targets[0]; await ctx.g.move(c, 'exile'); if (c.zone === 'exile') C.remember(ctx, [c]); await C.make(ctx, C.spirit);
  }, {targets: [C.grave(c => !c.is('Creature') && !c.is('Land'))]})], abilities: [
    {label: 'Sacrifice a Spirit to cast a linked card free this turn', cost: {mana: '{1}{R}{W}', tap: true, sac: (g, c) => c.hasSub('Spirit')},
      targets: [{what: 'permanent', zone: 'exile', filter: (g, c, p, s) => C.remembered({g, src: s, you: p, sourceMeta: s.meta}).includes(c)}],
      run: ctx => C.playGrant(ctx, ctx.targets[0], {turn: ctx.g.turnNo, free: true, socBottomSpell: true, spellsOnly: true})},
  ]};
  S['Venerable Warsinger'] = {triggers: [C.hit('Return a creature with mana value up to the combat damage', ctx => ctx.targets[0] && ctx.g.putPermanentOntoBattlefield(ctx.targets[0], ctx.you),
    {opt: true, targets: (g, c, d) => [C.grave(x => x.is('Creature') && x.mv <= d.n)]})]};
  S['Primary Research'] = {triggers: [C.enterTrigger('Return a small nonland permanent', ctx => ctx.g.putPermanentOntoBattlefield(ctx.targets[0], ctx.you), {targets: [C.grave(small)]}),
    C.end('Draw if a card left your graveyard', ctx => hasLeft(ctx.you) && C.draw(ctx), {filter: (g, c, d) => d.player === c.ctrl && hasLeft(c.ctrl)})]};

  const relic = {name: 'Restore Relic', cost: '{2}{R}{W}', types: ['Sorcery'], oracle: "Exile target artifact or creature card from your graveyard. Create a token that's a copy of it.", targets: [C.grave(c => c.is('Artifact') || c.is('Creature'))], resolve: async ctx => {
    const c = ctx.targets[0], def = c.def; await ctx.g.move(c, 'exile'); if (c.zone === 'exile') await C.copy(ctx, c, {definition: def});
  }};
  const wheel = {name: 'Wheel of Fortune', cost: '{2}{R}', types: ['Sorcery'], oracle: 'Each player discards their hand, then draws seven cards.', resolve: async ctx => {
    for (const p of ctx.g.apnapFrom(ctx.you)) await ctx.g.discard(p, p.hand.slice());
    for (const p of ctx.g.apnapFrom(ctx.you)) await C.draw(ctx, 7, p);
  }};
  const punch = {name: 'Pack a Punch', cost: '{1}{R}{W}', types: ['Sorcery'], oracle: 'Mill a card. Put two +1/+1 counters on target creature. It gains trample until end of turn.', targets: [T.creature()], resolve: async ctx => {
    await C.mill(ctx, 1); C.add(ctx, ctx.targets[0], '+1/+1', 2); C.buff(ctx, ctx.targets[0], 0, 0, ['trample']);
  }};
  S['Lorehold Archivist'] = {kws: ['first strike'], triggers: [C.upkeep('Become prepared with three artifact or creature cards in your graveyard', ctx => {
    if (ctx.you.graveyard.filter(c => c.is('Artifact') || c.is('Creature')).length >= 3) C.prepare(ctx, relic);
  }, {filter: (g, c, d) => d.player === c.ctrl && c.ctrl.graveyard.filter(x => x.is('Artifact') || x.is('Creature')).length >= 3})]};
  S['Naktamun Lorespinner'] = {triggers: [C.upkeep('Become prepared if a player has at most one card', ctx => {
    if (ctx.g.alivePlayers().some(p => p.hand.length <= 1)) C.prepare(ctx, wheel);
  }, {filter: (g, c, d) => d.player === c.ctrl && g.alivePlayers().some(p => p.hand.length <= 1)})]};
  S['Kirol, History Buff'] = {triggers: [C.ownGraveEvent('Become prepared', ctx => C.prepare(ctx, punch))]};
})();
