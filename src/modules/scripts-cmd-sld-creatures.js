'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL, S = M.SCRIPTS, T = M.T;
  const ownLife = (g, c, d) => d.player === c.ctrl;
  S['Angelic Arbiter'] = {cslArbiter: true, kws: ['flying']};
  S['Archangel of Strife'] = {kws: ['flying'], asEnters: async (g, c) => {
    c.meta.cslWar = {};
    for (const p of g.apnapFrom(c.ctrl)) {
      const key = await C.option({g, src: c, you: c.ctrl}, [{key: 'war', label: 'War: +3/+0'}, {key: 'peace', label: 'Peace: +0/+3'}], 'Choose war or peace', p);
      if (!['war', 'peace'].includes(key)) throw Error('Invalid war/peace choice');
      c.meta.cslWar[p.idx] = key;
    }
  }, statics: [{apply: (g, c, bf) => {for (const b of bf.filter(x => x.is('Creature'))) {const k = c.meta.cslWar?.[b.ctrl.idx]; if (k === 'war') b.cur.power += 3; if (k === 'peace') b.cur.toughness += 3;}}}]};
  S['Avatar of Woe'] = {kws: ['fear'], selfCostAdjust: g => g.players.flatMap(p => p.graveyard).filter(c => c.is('Creature')).length >= 10 ? -6 : 0, abilities: [{label: 'Destroy a creature; it cannot regenerate', cost: {tap: true}, targets: [T.creature()], run: ctx => ctx.g.destroy(ctx.targets[0], {source: ctx.src, noRegen: true})}]};
  S['Damia, Sage of Stone'] = {kws: ['deathtouch'], c1719SkipDraw: true, triggers: [C.upkeep('Draw until you have seven cards', ctx => C.draw(ctx, Math.max(0, 7 - ctx.you.hand.length)), {filter: (g, c, d) => d.player === c.ctrl && c.ctrl.hand.length < 7})]};
  S['Desecrator Hag'] = {triggers: [C.enterTrigger('Return your creature card with greatest power', async ctx => {
    const all = ctx.you.graveyard.filter(c => c.is('Creature')), max = Math.max(...all.map(c => c.power));
    const [c] = await C.choose(ctx.g, ctx.you, all.filter(c => c.power === max), 1, 1, 'Return the creature card with greatest power');
    if (c) await ctx.g.move(c, 'hand');
  })]};
  S['Dominus of Fealty'] = {kws: ['flying'], triggers: [C.upkeep('Gain control of a permanent until end of turn', async ctx => {if (await C.yes(ctx, 'Gain control of this permanent?')) C.steal(ctx, ctx.targets[0]);}, {targets: [T.permanent()]})]};
  S['Dragon Whelp'] = {kws: ['flying'], abilities: [{label: '+1/+0; four activations require sacrifice', cost: {mana: '{R}'}, run: ctx => {
    if (!C.same(ctx)) return; C.buff(ctx, ctx.src, 1, 0);
    if ((ctx.src.meta.cslWhelp?.turn === ctx.g.turnNo ? ctx.src.meta.cslWhelp.n : 0) >= 4) C.delayed(ctx, ctx.src, 'sacrifice');
  }}]};
  S['Dreamborn Muse'] = {triggers: [C.upkeep('Active player mills for cards in hand', ctx => C.mill(ctx, ctx.data.player.hand.length, ctx.data.player), {filter: () => true})]};
  S['Goblin Lackey'] = {triggers: [C.hit('Put a Goblin permanent from your hand onto the battlefield', async ctx => {
    const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.hasSub('Goblin') && C.permanent(ctx.g, c)), 0, 1, 'Put a Goblin permanent onto the battlefield');
    if (c) await ctx.g.putPermanentOntoBattlefield(c, ctx.you);
  }, {filter: (g, c, d) => d.src === c && d.n > 0})]};
  S['Gomazoa'] = {kws: ['defender', 'flying'], abilities: [{label: 'Shuffle Gomazoa and the creatures it blocks into libraries', cost: {tap: true}, run: async ctx => {
    const cards = [...ctx.g.creatures().filter(c => c.blockedBy.includes(ctx.src)), ...(C.same(ctx) ? [ctx.src] : [])], owners = [...new Set(cards.map(c => c.owner))];
    for (const c of cards) await ctx.g.move(c, 'library'); for (const p of owners) M.shuffle(p.library, ctx.g.rnd);
  }}]};
  S['Gruff Triplets'] = {kws: ['trample'], triggers: [C.enterTrigger('Create two copies of Gruff Triplets', ctx => C.copy(ctx, ctx.src, {n: 2}), {filter: (g, c, d) => d.card === c && !c.isToken}), C.death('Put counters on your other Gruff Triplets', ctx => {
    const n = Math.max(0, ctx.data.snap.power); for (const c of ctx.g.creatures(ctx.you)) if (c.name === 'Gruff Triplets') C.add(ctx, c, '+1/+1', n);
  })]};
  S['Kaalia of the Vast'] = {kws: ['flying'], triggers: [C.attack('Put an Angel, Demon or Dragon into combat', async ctx => {
    const p = ctx.data.target;
    const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Creature') && ['Angel', 'Demon', 'Dragon'].some(t => c.hasSub(t))), 0, 1, 'Put a creature onto the battlefield attacking ' + p.name);
    if (c) await ctx.g.putPermanentOntoBattlefield(c, ctx.you, {tapped: true, attacking: p});
  }, {filter: (g, c, d) => d.card === c && d.target instanceof M.Player && d.target !== c.ctrl})]};
  S['Lightkeeper of Emeria'] = {kws: ['flying'], multikicker: '{W}', triggers: [C.enterTrigger('Gain two life for each kicker payment', ctx => ctx.g.gainLife(ctx.you, 2 * (ctx.src.castMeta?.paidTimes || 0), ctx.src))]};
  S['Magus of the Vineyard'] = {triggers: [C.trigger('precombatMain', 'Add two green mana', ctx => {ctx.data.player.pool.G += 2;}, {filter: (g, c, d) => (d.ordinal || 1) === 1})]};
  S['Malfegor'] = {kws: ['flying'], triggers: [C.enterTrigger('Discard your hand; opponents sacrifice that many creatures', async ctx => {
    const cards = ctx.you.hand.slice(), discarded = await ctx.g.discard(ctx.you, cards);
    const n = Array.isArray(discarded) ? discarded.length : cards.filter(c => !ctx.you.hand.includes(c)).length;
    for (const p of ctx.you.opponents(ctx.g)) await C.sacrifice(ctx, p, c => c.is('Creature'), n);
  })]};
  const forces = C.attack('Join forces: grow for the mana contributed', async ctx => {let amount = 0; await C.joinForces(ctx, (p, n) => {amount = n;}); if (C.same(ctx)) C.buff(ctx, ctx.src, amount, 0);});
  S['Mana-Charged Dragon'] = {kws: ['flying', 'trample'], triggers: [forces, {...forces, on: 'blocks', filter: (g, c, d) => d.blocker === c}]};
  S['Nykthos Paragon'] = {triggers: [C.trigger('lifeGain', 'Put counters on each of your creatures', ctx => {for (const c of ctx.g.creatures(ctx.you)) C.add(ctx, c, '+1/+1', ctx.data.n);}, {filter: ownLife, opt: true, oncePerTurnOnUse: 'cslParagon'})]};
  S['Reiver Demon'] = {kws: ['flying'], triggers: [C.enterTrigger('Destroy nonartifact, nonblack creatures', ctx => ctx.g.destroyMany(ctx.g.creatures().filter(c => !c.is('Artifact') && !c.colors.includes('B')), {source: ctx.src, noRegen: true}), {filter: (g, c, d) => d.card === c && c.castMeta?.wasCast && c.castMeta.from === 'hand'})]};
  S['Roaming Throne'] = {ward: '{2}', asEnters: async (g, c) => {c.meta.cslType = await C.chooseType({g, src: c, you: c.ctrl});}, statics: [{phase: 1, apply: (g, c) => {if (c.meta.cslType && !c.cur.subtypes.includes(c.meta.cslType)) c.cur.subtypes.push(c.meta.cslType);}}], doubleTriggerFilter: (g, c, source) => C.live(c) && source !== c && source.is('Creature') && source.hasSub(c.meta.cslType)};
  S['Ruhan of the Fomori'] = {triggers: [C.combat('Choose a random opponent to attack', ctx => {
    const players = ctx.you.opponents(ctx.g), p = players[Math.floor(ctx.g.rnd() * players.length)];
    if (p && C.same(ctx)) ctx.g.untilEffects.push({kind: 'mustAttackPlayerCard', iid: ctx.src.iid, timestamp: ctx.src.timestamp, targetPlayer: p, expires: 'eot', combat: ctx.g.afcCombatId});
  })]};
  S['Rundvelt Hordemaster'] = {statics: [C.subtype('Goblin')], triggers: [C.death('Exile the top card; cast Goblin creatures through your next turn', async ctx => {
    for (const c of await C.exileTop(ctx, 1)) if (c.is('Creature') && c.hasSub('Goblin')) C.playGrant(ctx, c, {c1920UntilOwnTurn: ctx.you.turnsStarted + 1, spellsOnly: true});
  }, {filter: (g, c, d) => d.snap.ctrl === c.ctrl && d.snap.types.includes('Creature') && d.snap.subtypes.includes('Goblin')})]};
  S['Skullbriar, the Walking Grave'] = {kws: ['haste'], cslSkullbriar: true, triggers: [C.hit('Put a +1/+1 counter on Skullbriar', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1'))]};
  S['Spike Feeder'] = {etbCounters: {kind: '+1/+1', n: 2}, abilities: [
    {label: 'Move a +1/+1 counter to a creature', cost: {mana: '{2}', rmCounter: {kind: '+1/+1', n: 1}}, targets: [T.creature()], run: ctx => C.add(ctx, ctx.targets[0], '+1/+1')},
    {label: 'Remove a +1/+1 counter to gain two life', cost: {rmCounter: {kind: '+1/+1', n: 1}}, run: ctx => ctx.g.gainLife(ctx.you, 2, ctx.src)},
  ]};
  S['Spurnmage Advocate'] = {abilities: [{label: 'Return two opposing graveyard cards; destroy an attacker', cost: {tap: true}, targets: [C.grave((g, c, p) => c.owner !== p, {count: 2, sameGraveyard: true}), T.creature({filter: (g, c) => !!c.attacking})], run: async ctx => {
    for (const c of C.flat(ctx.targets[0])) await ctx.g.move(c, 'hand'); if (ctx.targets[1]) await ctx.g.destroy(ctx.targets[1], {source: ctx.src});
  }}]};
  S['Symbiotic Wurm'] = {triggers: [C.death('Create seven Insects', ctx => C.make(ctx, C.token('Insect', ['Insect'], 1, 1, ['G']), 7))]};
  S['Tariel, Reckoner of Souls'] = {kws: ['flying', 'vigilance'], abilities: [{label: 'Return a random creature from an opponent graveyard', cost: {tap: true}, targets: [T.opponent()], run: ctx => {
    const cards = ctx.targets[0].graveyard.filter(c => c.is('Creature')), c = cards[Math.floor(ctx.g.rnd() * cards.length)]; if (c) return ctx.g.putPermanentOntoBattlefield(c, ctx.you);
  }}]};
  S['Trench Gorger'] = {kws: ['trample'], triggers: [C.enterTrigger('Exile lands; set base power and toughness to their count', async ctx => {
    if (!ctx.g.canSearchLibrary(ctx.you)) return;
    if (!await C.yes(ctx, 'Search for any number of lands?')) return;
    const cards = await C.search(ctx, ctx.you, c => c.is('Land'), ctx.you.library.length, 'exile');
    if (C.same(ctx)) ctx.g.addOracleAnimation(ctx.src, {types: ctx.src.def.types, retainTypes: true, retainAllSubtypes: true, power: cards.filter(c => c.zone === 'exile').length, toughness: cards.filter(c => c.zone === 'exile').length});
  })]};
  const triskelavite = C.registerToken('cslTriskelavite', C.token('Triskelavite', ['Triskelavite'], 1, 1, [], ['flying'], {types: ['Artifact', 'Creature'], tokenImageName: 'CSL Triskelavite', abilities: [{label: 'Sacrifice to deal one damage', cost: {sacSelf: true}, targets: [T.any()], run: ctx => ctx.g.damageAny(ctx.src, ctx.targets[0], 1)}]}));
  S['Triskelavus'] = {kws: ['flying'], etbCounters: {kind: '+1/+1', n: 3}, abilities: [{label: 'Remove a counter to create a Triskelavite', cost: {mana: '{1}', rmCounter: {kind: '+1/+1', n: 1}}, run: ctx => C.make(ctx, triskelavite)}]};
  S['Valley Rannet'] = {cycling: {cost: '{2}', label: 'Mountaincycling', noDraw: true, effect: ctx => C.search(ctx, ctx.you, c => c.hasSub('Mountain'), 1)}, cslForestcycling: {cost: '{2}', label: 'Forestcycling', noDraw: true, effect: ctx => C.search(ctx, ctx.you, c => c.hasSub('Forest'), 1)}};
  S['Voice of All'] = {kws: ['flying'], asEnters: async (g, c) => {c.meta.cslColor = await C.color({g, src: c, you: c.ctrl});}, statics: [{apply: (g, c) => {if (c.meta.cslColor) c.cur.protectionFrom.push((g, source) => source.colors.includes(c.meta.cslColor));}}]};
  const elemental = C.registerToken('cslVoiceElemental', C.token('Elemental', ['Elemental'], '*', '*', ['G', 'W'], [], {tokenImageName: 'CSL Elemental', oracleCharacteristicPT: true, cdaPower: (g, c) => g.creatures(c.ctrl).length, cdaToughness: (g, c) => g.creatures(c.ctrl).length}));
  S['Voice of Resurgence'] = {triggers: [C.trigger('cast', 'Create an Elemental sized by your creatures', ctx => C.make(ctx, elemental), {filter: (g, c, d) => g.turnPlayer === c.ctrl && d.player !== c.ctrl}), C.death('Create an Elemental sized by your creatures', ctx => C.make(ctx, elemental))]};
  S['Vorinclex, Voice of Hunger'] = {kws: ['trample'], landTapHook: async (g, s, land, p, produced) => {
    if (!C.live(s) || p !== s.ctrl) return;
    const options = Object.keys(produced).filter(k => produced[k] > 0), ctx = {g, src: s, you: p};
    const k = options.length === 1 ? options[0] : await C.option(ctx, options.map(key => ({key, label: key})), 'Add one mana of a produced type', p, 'manaColor');
    if (options.includes(k)) p.pool[k]++;
  }, triggers: [C.trigger('tappedForMana', 'The opponent land skips its next untap', ctx => {const c = ctx.data.card; if (c.zone === 'battlefield' && c.zoneVersion === ctx.data.cslLandVersion) c.meta.noUntapOnce = true;}, {filter: (g, c, d) => d.player !== c.ctrl && d.card.is('Land')})]};
})();
