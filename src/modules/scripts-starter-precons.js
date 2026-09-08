// Starter Commander Decks (2022): only cards absent from the existing catalog.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, E = M.E, T = M.T, SC = M.SCRIPTS;
  const etb = (g, self, d) => d.card === self;
  const attacks = (g, self, d) => d.card === self;
  const ownEnd = (g, self, d) => d.player === self.ctrl;
  const ownUpkeep = ownEnd;
  const same = ctx => ctx.src.zone === 'battlefield' &&
    (ctx.sourceZoneVersion == null || ctx.src.zoneVersion === ctx.sourceZoneVersion);
  const grave = (filter = () => true, extra = {}) => ({zone: 'graveyard', what: 'card',
    anyGraveyard: true, filter, aiHint: {kind: 'gyRecur'}, ...extra});
  const token = (name, subtypes, power, toughness, colors, kws = []) => ({
    name, subtypes, power: String(power), toughness: String(toughness), colorsOverride: colors,
    types: ['Creature'], super: [], cost: null, oracle: '', kws, isTokenDef: true,
  });
  const soldier = token('Soldier', ['Soldier'], 1, 1, ['W'], ['lifelink']);
  const cat = token('Cat', ['Cat'], 2, 2, ['W']);
  const catBeast = token('Cat Beast', ['Cat', 'Beast'], 2, 2, ['W']);
  const dragon = token('Dragon', ['Dragon'], 5, 5, ['R'], ['flying']);
  const choose = async (g, player, pool, min, max, prompt, hint = 'bestPermanent') => {
    const librarySearch=hint==='searchLand'||/\bsearch\b/i.test(prompt||'');
    if(librarySearch&&g.canSearchLibrary&&!g.canSearchLibrary(player))pool=pool.filter(c=>c.zone!=='library');
    if (!pool.length || max === 0) return [];
    const answer = await player.controller.decide(g, {type: 'chooseCards', player, from: pool,
      min: Math.min(min, pool.length), max: Math.min(max, pool.length), prompt, aiHint: {kind: hint}});
    if (!Array.isArray(answer) || new Set(answer).size !== answer.length ||
        answer.length < Math.min(min, pool.length) || answer.length > Math.min(max, pool.length) ||
        answer.some(card => !pool.includes(card))) throw new Error('Invalid choice: ' + prompt);
    return answer;
  };
  const option = (ctx, options, prompt, player = ctx.you, hint = 'mode') => player.controller.decide(ctx.g,
    {type: 'chooseOption', player, prompt: `${ctx.src.name}: ${prompt}`, options, aiHint: {kind: hint, src: ctx.src}});
  async function chooseType(ctx) {
    const counts = {};
    for (const c of ctx.g.creatures(ctx.you)) for (const subtype of c.cur.subtypes) counts[subtype] = (counts[subtype] || 0) + 1;
    const types = [...M.CREATURE_SUBTYPES].sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b));
    const value = await option(ctx, types.map(key => ({key, label: key})), 'choose a creature type', ctx.you, 'chooseType');
    if (!types.includes(value)) throw new Error('Invalid creature type');
    return value;
  }
  async function reanimateMany(ctx, cards, beforeEnter) {
    await ctx.g.withBattlefieldEntryBatch(async () => {
      for (const card of cards) if (card.zone === 'graveyard') {
        await ctx.g.move(card, 'battlefield', {ctrl: ctx.you});
        if (card.zone === 'battlefield' && beforeEnter) beforeEnter(card);
      }
    });
  }
  async function sacrificeAcross(ctx, players, poolFor) {
    const selected = [];
    for (const player of ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you).filter(p => players.includes(p))) {
      const picked = await choose(ctx.g, player, poolFor(player).filter(c => ctx.g.canSacrifice(c)), 1, 1,
        `${ctx.src.name}: sacrifice a permanent`, 'sacCost');
      for (const card of picked) selected.push({card, ctrl: player, snap: ctx.g.snapshot(card)});
    }
    const previous = ctx.g._simultaneousLeaveSources;
    ctx.g._simultaneousLeaveSources = [...(previous || []), ...selected];
    const sacrificed = [];
    try {
      await ctx.g.withGraveyardEntryBatch(async () => {
        for (const row of selected) if (await ctx.g.sacrifice(row.ctrl, row.card)) sacrificed.push(row);
      });
    } finally {
      ctx.g._simultaneousLeaveSources = previous;
      M.StateTriggers?.settle(ctx.g);
      await ctx.g.returnOracleExiles();
    }
    return sacrificed;
  }
  async function damageAll(ctx, cards, n) {
    return ctx.g.damageBatch(cards.map(target => ({src: ctx.src, target, n})), {deferSBA: true});
  }
  const enterTrigger = (desc, run, extra = {}) => ({on: 'etb', filter: etb, desc, run, ...extra});
  const snapshotEvent = ctx => {
    const card = ctx.data.card;
    ctx.starterEvent = {card, version: ctx.data.oracleEntryVersion ?? card.zoneVersion};
  };
  const eventStats = ctx => {
    const entry = ctx.starterEvent;
    return entry.card.zone === 'battlefield' && entry.card.zoneVersion === entry.version
      ? entry.card : entry.card.battlefieldLKI?.get(entry.version);
  };
  const addEmblem = (ctx, name, triggers) => ctx.you.emblems.push({name, triggers});
  const modalSpell = modes => ({modes, resolve:async ctx=>{
    let offset=0;
    for(const index of ctx.mode){
      const mode=modes.list[index],specs=typeof mode.targets==='function'?mode.targets(ctx.g,ctx.src,ctx.so.castOpts):mode.targets||[];
      await mode.run({...ctx,targets:ctx.targets.slice(offset,offset+specs.length)});offset+=specs.length;
    }
  }});
  const modalTrigger = trigger => ({...trigger,run:ctx=>trigger.modes.list[ctx.mode].run(ctx)});

  SC['Coastal Tower'] = {entersTapped: true, producesColors: ['W', 'U'],
    mana: {cost: {tap: true}, produce: [{W: 1}, {U: 1}]}};
  SC['Leafkin Druid'] = {mana: {cost: {tap: true},
    produce: (g, card, player) => [{G: g.creatures(player).length >= 4 ? 2 : 1}]}};
  SC['Archon of Redemption'] = {triggers: [{on: 'etb', desc: 'Gain life equal to the flier’s power', opt: true,
    filter: (g, self, d) => d.card.ctrl === self.ctrl && (d.card === self || d.card.is('Creature') && d.card.kw('flying')),
    prepareTargets: snapshotEvent,
    run: async ctx => { await ctx.g.gainLife(ctx.you, Math.max(0, eventStats(ctx)?.power || 0)); }}]};
  SC['Army of the Damned'] = {flashback: {altCostStr: '{7}{B}{B}{B}'},
    resolve: async ctx => { await ctx.g.makeTokens('zombie22', ctx.you, {n: 13, tapped: true}); }};
  SC['Aura Mutation'] = {targets: [T.permanent((g, c) => c.is('Enchantment'), {aiHint: {goal: 'destroy'}})],
    resolve: async ctx => {
      const target = ctx.targets[0], n = target.mv;
      await ctx.g.destroy(target);
      await ctx.g.makeTokens('saproling', ctx.you, {n});
    }};
  SC['Condemn'] = {targets: [T.creature({filter: (g, c) => c.is('Creature') && !!c.attacking, aiHint: {goal: 'removal'}})],
    resolve: async ctx => {
      const target = ctx.targets[0], player = target.ctrl, n = Math.max(0, target.toughness);
      await ctx.g.move(target, 'library', {toBottom: true});
      await ctx.g.gainLife(player, n);
    }};
  SC['Crippling Fear'] = {resolve: async ctx => {
    const type = await chooseType(ctx);
    E.pumpAllUntilEOT(ctx.g, (g, card) => !card.hasSub(type), -3, -3);
  }};
  SC['Curse of Bounty'] = {isPlayerAura: true, targets: [T.player({prompt: 'Enchant player'})], triggers: [{
    on: 'attackersDeclared', desc: 'Untap nonland permanents',
    filter: (g, self, d) => d.attackers.some(c => c.attacking === self.meta.cursedPlayer),
    run: async ctx => {
      const players = new Set([ctx.you, ctx.data.player]);
      for (const card of ctx.g.bf()) if (players.has(card.ctrl) && !card.is('Land')) ctx.g.untap(card);
    },
  }]};
  SC['Curse of Disturbance'] = {isPlayerAura: true, targets: [T.player({prompt: 'Enchant player'})], triggers: [{
    on: 'attackersDeclared', desc: 'Zombie tokens for the attacking player and you',
    filter: (g, self, d) => d.attackers.some(c => c.attacking === self.meta.cursedPlayer),
    run: async ctx => { for (const player of new Set([ctx.you, ctx.data.player])) await ctx.g.makeTokens('zombie22', player); },
  }]};
  SC['Deadly Tempest'] = {resolve: async ctx => {
    const before = ctx.g.creatures().map(card => ({card, ctrl: card.ctrl, version: card.zoneVersion}));
    await ctx.g.destroyMany(before.map(row => row.card));
    for (const player of ctx.g.alivePlayers()) await ctx.g.loseLife(player,
      before.filter(row => row.ctrl === player && row.card.zoneVersion !== row.version).length, 'Deadly Tempest');
  }};
  SC['Dredge the Mire'] = {resolve: async ctx => {
    const cards = [];
    for (const opponent of E.eachOpp(ctx.g, ctx.you)) cards.push(...await choose(ctx.g, opponent,
      opponent.graveyard.filter(c => c.is('Creature')), 1, 1, 'Dredge the Mire: choose a creature', 'sacCost'));
    await reanimateMany(ctx, cards);
  }};
  SC['Ever-Watching Threshold'] = {triggers: [{on: 'attackersDeclared', desc: 'Draw a card when attacked',
    filter: (g, self, d) => d.player !== self.ctrl && d.attackers.some(c =>
      c.attacking === self.ctrl || c.attacking instanceof M.CardInst && c.attacking.ctrl === self.ctrl),
    run: async ctx => { await ctx.g.draw(ctx.you, 1); }}]};
  SC['Felidar Retreat'] = {triggers: [modalTrigger({on: 'landfall', filter: (g, self, d) => d.card.ctrl === self.ctrl,
    desc: 'Cat Beast or counters and vigilance', modes: {list: [
      {label: 'Create a 2/2 white Cat Beast', run: async ctx => { await ctx.g.makeTokens(catBeast, ctx.you); }},
      {label: 'Counters and vigilance for your creatures', run: async ctx => {
        const cards = ctx.g.creatures(ctx.you);
        for (const card of cards) ctx.g.addCounters(card, '+1/+1', 1);
        for (const card of cards) E.grantUntilEOT(ctx.g, card, ['vigilance']);
      }},
    ]}})]};
  SC['Fiery Confluence'] = modalSpell({pick: 3, repeats: true, list: [
    {label: '1 damage to each creature', run: async ctx => { await damageAll(ctx, ctx.g.creatures(), 1); }},
    {label: '2 damage to each opponent', run: async ctx => { await damageAll(ctx, E.eachOpp(ctx.g, ctx.you), 2); }},
    {label: 'Destroy target artifact', targets: [T.permanent((g, c) => c.is('Artifact'), {aiHint: {goal: 'destroy'}})],
      run: async ctx => { if(ctx.targets[0])await ctx.g.destroy(ctx.targets[0]); }},
  ]});
  SC['Geode Rager'] = {triggers: [{on: 'landfall', filter: (g, self, d) => d.card.ctrl === self.ctrl,
    desc: 'Goad a player’s creatures', targets: [T.player({aiHint: {goal: 'goad'}})],
    run: async ctx => { for (const card of ctx.g.creatures(ctx.targets[0])) E.goad(ctx.g, card, ctx.you); }}]};
  SC['Great Oak Guardian'] = {triggers: [enterTrigger('Untap and give creatures +2/+2', async ctx => {
    const player = ctx.targets[0], cards = ctx.g.creatures(player);
    E.pumpAllUntilEOT(ctx.g, player, 2, 2);
    for (const card of cards) ctx.g.untap(card);
  }, {targets: [T.player({aiHint: {goal: 'buff'}})]})]};
  SC['Heraldic Banner'] = {
    asEnters: async (g, card) => {
      const colors = ['W', 'U', 'B', 'R', 'G'];
      const selected = await option({g, src: card, you: card.ctrl}, colors.map(key => ({key, label: key})), 'choose a color', card.ctrl, 'manaColor');
      if (!colors.includes(selected)) throw new Error('Invalid color');
      card.meta.starterBannerColor = selected;
    },
    mana: {cost: {tap: true}, produce: (g, card) => card.meta.starterBannerColor ? [{[card.meta.starterBannerColor]: 1}] : []},
    statics: [{apply: (g, self, bf) => {
      for (const card of bf) if (card.ctrl === self.ctrl && card.is('Creature') && card.colors.includes(self.meta.starterBannerColor)) card.cur.power++;
    }}],
  };
  SC['Hoard-Smelter Dragon'] = {abilities: [{label: 'Destroy an artifact and gain its mana value in power', cost: {mana: '{3}{R}'},
    targets: [T.permanent((g, c) => c.is('Artifact'), {aiHint: {goal: 'destroy'}})],
    run: async ctx => { const n = ctx.targets[0].mv; await ctx.g.destroy(ctx.targets[0]); if (same(ctx)) E.pumpUntilEOT(ctx.g, ctx.src, n, 0); },
    aiScore: () => 7}]};
  SC['Lotleth Giant'] = {triggers: [enterTrigger('Damage equal to creature cards in your graveyard', async ctx => {
    await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.you.graveyard.filter(c => c.is('Creature')).length);
  }, {targets: [T.opponent({aiHint: {goal: 'damage'}})]})]};
  SC['Magmaquake'] = {resolve: async ctx => {
    await damageAll(ctx, ctx.g.bf().filter(c => c.is('Planeswalker') || c.is('Creature') && !c.kw('flying')), ctx.x);
  }};
  SC['Scavenging Ooze'] = {abilities: [{label: 'Exile a graveyard card; grow and gain life for a creature', cost: {mana: '{G}'},
    targets: [grave(() => true, {aiHint: {goal: 'exile'}})],
    run: async ctx => {
      const creature = ctx.targets[0].is('Creature');
      await ctx.g.move(ctx.targets[0], 'exile');
      if (creature) { if (same(ctx)) ctx.g.addCounters(ctx.src, '+1/+1', 1); await ctx.g.gainLife(ctx.you, 1); }
    }, aiScore: () => 4}]};
  SC['Soul Shatter'] = {resolve: async ctx => {
    await sacrificeAcross(ctx, E.eachOpp(ctx.g, ctx.you), player => {
      const cards = ctx.g.bf().filter(c => c.ctrl === player && (c.is('Creature') || c.is('Planeswalker')));
      const max = Math.max(-1, ...cards.map(c => c.mv));
      return cards.filter(c => c.mv === max);
    });
  }};
  SC['Syphon Flesh'] = {resolve: async ctx => {
    const rows = await sacrificeAcross(ctx, E.eachOpp(ctx.g, ctx.you), p => ctx.g.creatures(p));
    await ctx.g.makeTokens('zombie22', ctx.you, {n: rows.length});
  }};
  SC['Reign of the Pit'] = {resolve: async ctx => {
    const rows = await sacrificeAcross(ctx, ctx.g.alivePlayers(), p => ctx.g.creatures(p));
    const n = Math.max(0, rows.reduce((sum, row) => sum + row.snap.power, 0));
    await ctx.g.makeTokens(token(MTG.c1719TextType(ctx,'Demon'), [MTG.c1719TextType(ctx,'Demon')], n, n, ['B'], ['flying']), ctx.you);
  }};
  SC['Thundermaw Hellkite'] = {triggers: [enterTrigger('Damage and tap opposing fliers', async ctx => {
    const cards = ctx.g.creatures().filter(c => c.ctrl !== ctx.you && c.kw('flying'));
    await damageAll(ctx, cards, 1);
    for (const card of cards) if (card.zone === 'battlefield') ctx.g.tap(card);
  })]};
  SC['Titan Hunter'] = {triggers: [{on: 'endStep', desc: '4 damage if no creatures died',
    filter: g => !g.diedThisTurn.some(snap => snap.types.includes('Creature')),
    onlyIf: g => !g.diedThisTurn.some(snap => snap.types.includes('Creature')),
    run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.data.player, 4); }}],
    abilities: [{label: 'Sacrifice a creature: gain 4 life', cost: {mana: '{1}{B}', sacCreature: true},
      run: async ctx => { await ctx.g.gainLife(ctx.you, 4); }, aiScore: (g, c, p) => p.life < 10 ? 6 : -2}]};
  SC['Voice of Many'] = {triggers: [enterTrigger('Draw for opponents with fewer creatures', async ctx => {
    await ctx.g.draw(ctx.you, E.eachOpp(ctx.g, ctx.you).filter(p => ctx.g.creatures(p).length < ctx.g.creatures(ctx.you).length).length);
  })]};
  SC["White Sun's Zenith"] = {resolve: async ctx => {
    await ctx.g.makeTokens(cat, ctx.you, {n: ctx.x});
    if (!ctx.so.isCopy && ctx.src.zone === 'stack') {
      await ctx.g.move(ctx.src, 'library'); M.shuffle(ctx.src.owner.library, ctx.g.rnd);
    }
  }};
  SC['Archfiend of Depravity'] = {triggers: [{on: 'endStep', desc: 'Opponent keeps at most two creatures',
    filter: (g, self, d) => d.player !== self.ctrl,
    run: async ctx => {
      const player = ctx.data.player, cards = ctx.g.creatures(player);
      const keep = await choose(ctx.g, player, cards, 0, 2, 'Archfiend of Depravity: keep up to two creatures');
      await ctx.g.sacrificeMany(player, cards.filter(c => !keep.includes(c)));
    }}]};
  SC['Indulgent Tormentor'] = {triggers: [{on: 'upkeep', filter: ownUpkeep, desc: 'Draw unless opponent sacrifices or pays life',
    targets: [T.opponent({prompt: 'Opponent chooses the tribute'})], run: async ctx => {
      const opponent = ctx.targets[0], creatures = ctx.g.creatures(opponent).filter(c => ctx.g.canSacrifice(c));
      const options = [{key: 'draw', label: 'Let the controller draw a card'}];
      if (opponent.life >= 3) options.push({key: 'life', label: 'Pay 3 life'});
      if (creatures.length) options.push({key: 'sacrifice', label: 'Sacrifice a creature'});
      const answer = await option(ctx, options, 'choose a tribute', opponent);
      if (answer === 'life' && opponent.life >= 3) await ctx.g.loseLife(opponent, 3, 'Indulgent Tormentor');
      else if (answer === 'sacrifice' && creatures.length) {
        const [card] = await choose(ctx.g, opponent, creatures, 1, 1, 'Sacrifice a creature', 'sacCost');
        await ctx.g.sacrifice(opponent, card);
      } else await ctx.g.draw(ctx.you, 1);
    }}]};
  SC['Scythe Specter'] = {triggers: [{on: 'combatDamageToPlayer', filter: attacks, desc: 'Opponents discard; greatest mana value loses life',
    run: async ctx => {
      const rows = [];
      for (const player of E.eachOpp(ctx.g, ctx.you)) {
        const [card] = await choose(ctx.g, player, player.hand.slice(), 1, 1, 'Scythe Specter: discard a card', 'discard');
        if (card) rows.push({card, player, mv: card.mv});
      }
      await ctx.g.withGraveyardEntryBatch(async () => { for (const row of rows) await ctx.g.discard(row.player, [row.card]); });
      const n = Math.max(0, ...rows.map(row => row.mv));
      for (const row of rows) if (row.mv === n) await ctx.g.loseLife(row.player, n, 'Scythe Specter');
    }}]};

  // The remaining Starter cards share narrowly scoped rules helpers below.
  M.StarterPrecons = {same, grave, token, soldier, cat, dragon, choose, option, chooseType,
    reanimateMany, sacrificeAcross, damageAll, enterTrigger, snapshotEvent, eventStats, addEmblem, etb, attacks, ownEnd,modalSpell};
})();
