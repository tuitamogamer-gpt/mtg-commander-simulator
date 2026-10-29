'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, S = M.SCRIPTS, C = {...M.C1920, ...M.FRC}, T = M.T, G = M.Game.prototype;
  const warrior = c => c.hasSub('Klingon') || c.hasSub('Warrior');
  const warriorSnap = s => s?.changeling || s?.def?.changeling || s?.subtypes?.some(t => t === 'Klingon' || t === 'Warrior');
  const klingon = C.registerToken('trcKlingonWarrior', C.token('Klingon Warrior', ['Klingon', 'Warrior'], 2, 1, ['R'], ['haste'], {tokenImageName: 'TRC Klingon Warrior'}));
  const tribble = M.TOKENS.trcTribble || C.registerToken('trcTribble', C.token('Tribble', ['Tribble'], 1, 1, ['W'], [], {statics: [{apply: (g, c) => {c.cur.cantBlock = true;}}], oracle: "This token can't block.", tokenImageName: 'TRC Tribble'}));
  // Battlefront records declarations, not creatures put onto the battlefield
  // attacking. Distinct opponents survive additional combats and departures.
  const history = (g, p) => {
    if (p.turnState.trcBattlefront?.turn !== g.turnNo) p.turnState.trcBattlefront = {turn: g.turnNo, players: []};
    return p.turnState.trcBattlefront.players;
  };
  const opponentsAttacked = (g, p) => history(g, p).slice();
  const battlefront = (g, p) => opponentsAttacked(g, p).length;
  const emit = G.emit;
  G.emit = function (on, d) {
    this.delayed = this.delayed.filter(row => !row.trcDuration || this.untilEffects.includes(row.trcDuration));
    if (on === 'attacks' || on === 'attackersDeclared') {
      const p = d.player || d.card?.ctrl;
      if (p) {
        const targets = on === 'attacks' ? [...(this.combat?.declaredAttackTargets || []), d.defender] : (d.attackers || []).map(c => c.attacking);
        const seen = history(this, p);
        for (const target of targets) if (target instanceof M.Player && target !== p && !seen.includes(target)) seen.push(target);
      }
    }
    return emit.call(this, on, d);
  };
  Object.assign(M.StarTrek ||= {}, {opponentsAttacked, battlefront, klingon, tribble});
  const melee = {on: 'attacks', desc: 'Melee', filter: (g, c, d) => d.card === c, run: ctx => {
    const n = M.OracleV8CombatRestrictions.attackedOpponents(ctx, {kind: 'combat-attacked-opponents-v8'});
    if (C.same(ctx)) C.buff(ctx, ctx.src, n, n);
  }};
  const buffWarriors = (ctx, p, t, kws = []) => {for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && warrior(c))) C.buff(ctx, c, p, t, kws);};
  const battlefrontTargets = (own = false) => (g, c) => [T.creature({filter: (g, target, p) => !own || target.ctrl === p, count: battlefront(g, c.ctrl), min: 0, upTo: true, aiHint: {goal: own ? 'buff' : 'goad'}})];
  S['Worf, Defiant Commander'] = {triggers: [C.enterTrigger('Create a Klingon Warrior', ctx => C.make(ctx, klingon)), C.attacks('Battlefront: exile cards to play through your next turn', async ctx => {
    const n = battlefront(ctx.g, ctx.you);
    if (n) for (const card of await C.exileTop(ctx, n)) C.nextOwnGrant(ctx, card);
  })]};
  S['Kor, Cause of Vengeance'] = {triggers: [C.attacks('Sacrifice another creature to draw and strengthen your Klingons and Warriors', async ctx => {
    const [card] = await C.choose(ctx.g, ctx.you, ctx.g.creatures(ctx.you).filter(c => (c !== ctx.src || c.zoneVersion !== ctx.sourceZoneVersion) && ctx.g.canSacrifice(c)), 0, 1, 'Sacrifice another creature?', 'sacrifice');
    if (!card || !await ctx.g.sacrifice(ctx.you, card)) return;
    await C.draw(ctx); buffWarriors(ctx, 2, 2);
  })]};
  S['Imperial Hullbreachers'] = C.mechanic('squad', C.mechanic('battle-cry', {kws: ['flying']}), {cost: '{2}'});
  S['Indelicate Healer'] = {triggers: [C.enterTrigger('Your creatures gain lifelink this turn', ctx => {for (const c of ctx.g.creatures(ctx.you)) C.buff(ctx, c, 0, 0, ['lifelink']);}, {filter: (g, c, d) => d.card === c || d.card.ctrl === c.ctrl && warrior(d.card)})]};
  S['Martok, Hero of the Empire'] = {triggers: [C.attacks('Battlefront: put counters on your creatures', ctx => {for (const c of C.flat(ctx.targets)) C.add(ctx, c, '+1/+1');}, {targets: battlefrontTargets(true)})]};
  S['Right of Vengeance'] = {resolve: ctx => {
    const marker = {kind: 'trcVengeanceDuration', expires: 'eot'}; ctx.g.untilEffects.push(marker);
    ctx.g.delayed.push({on: 'combatDamageToPlayer', trcDuration: marker, once: false, src: ctx.src, ctrl: ctx.you, name: 'Right of Vengeance: destroy the attacker and create a Klingon',
      filter: (g, d) => g.untilEffects.includes(marker) && d.player === ctx.you,
      prepareTargets: next => {next.trcVengeanceDamager = C.row(next.data.card);},
      run: async next => {
        const r = next.trcVengeanceDamager;
        if (r && C.current(r) && r.card.zone === 'battlefield') await next.g.destroy(r.card, {source: next.src});
        await C.make(next, klingon);
      }});
  }};
  S['Blood-Sport Champion'] = {kicker: {cost: '{2}'}, kws: ['deathtouch'], triggers: [C.enterTrigger('Other creatures you control gain deathtouch', ctx => {for (const c of ctx.g.creatures(ctx.you).filter(c => c !== ctx.src || c.zoneVersion !== ctx.sourceZoneVersion)) C.buff(ctx, c, 0, 0, ['deathtouch']);}, {filter: (g, c, d) => d.card === c && !!c.castMeta?.kicked})]};
  S['Kurn, Son of Mogh'] = {kws: ['deathtouch'], triggers: [C.attack('Battlefront: draw cards and lose that much life', async ctx => {const n = battlefront(ctx.g, ctx.you); await C.draw(ctx, n); await ctx.g.loseLife(ctx.you, n, ctx.src.name);})]};
  S['The Promise of Kahless'] = {resolve: async ctx => {
    const [card] = await C.choose(ctx.g, ctx.you, ctx.g.bf().filter(c => c.ctrl === ctx.you && warrior(c) && ctx.g.canSacrifice(c)), 0, 1, 'Sacrifice a Klingon or Warrior?', 'sacrifice');
    if (!card || !await ctx.g.sacrifice(ctx.you, card)) return;
    const cards = ctx.you.graveyard.filter(c => c !== card && c.is('Creature') && warrior(c));
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const c of cards) if (c.zone === 'graveyard') await ctx.g.putPermanentOntoBattlefield(c, ctx.you);});
  }};
  S['Voq, Torchbearer'] = {kws: ['menace'], asEnters: async (g, c) => {
    const [model] = await C.choose(g, c.ctrl, g.players.flatMap(p => p.graveyard).filter(x => x.is('Creature')), 0, 1, 'Voq: copy a creature card in a graveyard');
    if (!model) return;
    const d = C.snapshotCopy(model);
    M.OracleV8Copies.applyCopy(g, c, {...d, subtypes: [...new Set([...(d.subtypes || []), 'Klingon', 'Spy'])], kws: [...new Set([...(d.kws || []), 'menace'])]}); g.recalc();
  }};
  S['The Beacon of Kahless'] = {mana: [
    {cost: {tap: true}, produce: C.colors.map(c => ({[c]: 1}))},
    {label: 'Battlefront: add mana of one color', cost: {tap: true}, produce: (g, c, p) => C.colors.map(color => ({[color]: battlefront(g, p)}))},
  ]};
  S['Ferocious Colonist'] = {kws: ['double strike'], triggers: [melee]};
  S['Gagh Slinger'] = {costMods: [(g, c, {player, card, castOpts}) => {const d = g.castDefinition(card, castOpts); return player === c.ctrl && (d.changeling || d.subtypes?.some(t => t === 'Klingon' || t === 'Warrior')) ? -1 : 0;}], triggers: [C.enterTrigger('Deal 1 damage to each opponent', ctx => C.damage(ctx, ctx.you.opponents(ctx.g), 1), {filter: (g, c, d) => d.card !== c && d.card.ctrl === c.ctrl && warrior(d.card)})]};
  S['Galvanizing Tenor'] = {kws: ['menace'], triggers: [C.attack('Battlefront: goad creatures', ctx => {for (const c of C.flat(ctx.targets)) M.E.goad(ctx.g, c, ctx.you);}, {targets: battlefrontTargets()})]};
  S['Glory to the Empire!'] = {triggers: [C.enterTrigger('Create a Klingon Warrior for each opponent', ctx => C.make(ctx, klingon, ctx.you.opponents(ctx.g).length))], statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature')) x.cur.extraTriggers.push(melee);}}]};
  S['Gnarling Targ'] = {kws: ['trample'], triggers: [C.attacks('Klingons and Warriors get +2/+0 and trample', ctx => buffWarriors(ctx, 2, 0, ['trample']))]};
  S['Grilka, Widowed Warrior'] = {triggers: [C.enterTrigger('Borrow a creature with trample, haste and Treasure-making combat damage', ctx => {
    const c = ctx.targets[0]; if (!c) return;
    C.steal(ctx, c); C.buff(ctx, c, 0, 0, ['trample']);
    C.effectOn(ctx, c, (g, card) => card.cur.extraTriggers.push({on: 'combatDamageToPlayer', desc: 'Create tapped Treasures', filter: (g, s, d) => d.card === s, run: next => C.make(next, M.TOKENS.treasure, next.data.n, {tapped: true})}));
    ctx.g.recalc();
  }, {targets: [T.oppCreature()]})]};
  S['Kang, Suspicious Captain'] = {triggers: [C.enterTrigger('Goad Kang and an opposing creature while you control Kang', ctx => {
    const duration = M.OracleV8Untap.capture(ctx, 'controlled');
    if (!M.OracleV8Untap.sourceValid(ctx.g, duration)) return;
    for (const card of [ctx.src, ctx.targets[0]].filter(Boolean)) {
      const r = C.row(card);
      ctx.g.untilEffects.push({kind: 'trcKangGoad', sourceDuration: duration, iid: card.iid, zoneVersion: card.zoneVersion, expires: 'sourceDuration', apply: (g, bf) => {if (C.current(r) && bf.includes(card)) (card.cur.goadedBy ||= []).push(ctx.you);}});
    } ctx.g.recalc();
  }, {targets: [T.oppCreature()]}), C.trigger('attackersDeclared', 'Put a counter on a creature you control', ctx => C.add(ctx, ctx.targets[0], '+1/+1'), {filter: (g, c, d) => d.attackers.some(a => g.isGoaded(a)), targets: [T.yourCreature()]})]};
  S['Koloth, Tribble Hunter'] = {triggers: [C.end('Each player creates two Tribbles', async ctx => {await ctx.g.withBattlefieldEntryBatch(async () => {for (const p of ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you)) await ctx.g.makeTokens(tribble, p, {n: 2});});})], statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.hasSub('Tribble') && x.is('Creature')) {x.cur.power++; (x.cur.goadedBy ||= []).push(c.ctrl);}}}]};
  S['Own the Day'] = {selfCostAdjust: (g, c, p) => -battlefront(g, p), resolve: ctx => {
    for (const c of ctx.g.creatures().filter(c => c.meta._attackedTurn === ctx.g.turnNo)) ctx.g.untap(c);
    if (ctx.g.phase === 'main1' || ctx.g.phase === 'main2') ctx.g.scheduleAdditionalCombat({followedByMain: true});
  }};
  S["Qo'noS Quartermaster"] = {kws: ['menace'], triggers: [C.attack('Add one mana of any color and retain it this turn', async ctx => {const color = await C.color(ctx); ctx.you.pool[color]++; (ctx.you.poolMeta ||= []).push({color, n: 1, persist: 'eot'});})]};
  S["Alexander, Ship's Fool"] = {kws: ['vigilance', 'haste'], abilities: [{label: 'Reveal and draw; damage a random opponent', cost: {tap: true}, run: async ctx => {
    let n = 0;
    for (const p of ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you)) {const card = p.library.at(-1); if (card) {n = Math.max(n, card.mv); await ctx.g.revealToHuman({cards: [card], ctrl: p, kind: 'reveal'});}}
    for (const p of ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you)) await C.draw(ctx, 1, p);
    const opponents = ctx.you.opponents(ctx.g); if (opponents.length) await ctx.g.damageAny(ctx.src, opponents[Math.floor(ctx.g.rnd() * opponents.length)], n);
  }}]};
  S['Chancellor Gorkon'] = {kws: ['vigilance'], triggers: [C.death('Exile up to two creatures', ctx => ctx.g.exileMany(C.flat(ctx.targets)), {targets: [T.creature({count: 2, min: 0, upTo: true})]})]};
  S['Curzon Dax, Bound by Blood'] = {triggers: [C.death('Deal 1 damage to each opponent', ctx => C.damage(ctx, ctx.you.opponents(ctx.g), 1), {filter: (g, c, d) => d.card !== c && d.snap.ctrl === C.controllerAt(g, c, d) && d.snap.types.includes('Creature') && warriorSnap(d.snap)}), C.death('Put a creature with mana value 3 or less from your hand onto the battlefield', async ctx => {const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand.filter(c => c.is('Creature') && c.mv <= 3), 0, 1, 'Put a creature onto the battlefield'); if (c) await ctx.g.putPermanentOntoBattlefield(c, ctx.you);})]};
  S['Rite of Ascension'] = {triggers: [C.attacks('Battlefront: create tapped and attacking Klingons', ctx => C.make(ctx, klingon, battlefront(ctx.g, ctx.you), {tapped: true, chooseAttacking: (g, card) => g.chooseAttackingDestination(ctx.you, null, card, ctx.src.name)}))]};
  S['Sins of the Father'] = {saga: [
    {run: async ctx => {const chosen = []; for (const p of ctx.g.apnapFrom(ctx.g.turnPlayer || ctx.you).filter(p => p !== ctx.you)) {const pool = ctx.g.creatures(p).filter(c => !c.isToken && ctx.g.canSacrifice(c)); const cards = await C.choose(ctx.g, p, pool, Math.min(1, pool.length), 1, 'Sacrifice a nontoken creature', 'sacrifice'); chosen.push(...cards);} await C.sacrificeAll(ctx, chosen);}},
    {run: ctx => C.make(ctx, klingon, ctx.you.opponents(ctx.g).length)},
    {targets: [T.player()], run: async ctx => {const p = ctx.targets[0]; if (!p) return; const rows = p.graveyard.map(C.row), creatures = new Set(rows.filter(r => r.card.is('Creature')).map(r => r.card)); await ctx.g.moveGraveyardBatch(rows.map(r => r.card), 'exile'); const n = rows.filter(r => creatures.has(r.card) && r.card.zone === 'exile' && r.card.zoneVersion === r.version + 1).length; for (const opponent of ctx.you.opponents(ctx.g)) await ctx.g.loseLife(opponent, n, ctx.src.name);}},
  ]};
  const station = (n, kws, script = {}) => C.mechanic('station-v9', {...script, statics: [...(script.statics || []), {apply: (g, c) => {if ((c.counters.charge || 0) >= n) for (const kw of kws) c.cur.kw.add(kw);}}]}, {threshold: n});
  S["I.K.S. Negh'Var, Imperial Flagship"] = station(10, ['flying', 'vigilance'], {statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && warrior(x)) x.cur.kw.add('vigilance');}}]});
  S["K't'inga-Class Battle Cruiser"] = station(4, ['flying'], {triggers: C.both('One or two Klingons or Warriors gain flying', ctx => {for (const c of C.flat(ctx.targets)) C.buff(ctx, c, 0, 0, ['flying']);}, {targets: [T.permanent((g, c, p) => c.ctrl === p && warrior(c), {count: 2, min: 1, upTo: true})]})});
  S["K'Vort-Class Raider"] = station(4, ['flying', 'menace', 'haste'], {statics: [{apply: (g, c, bf) => {if (g.turnPlayer === c.ctrl) for (const x of bf) if (x === c || x.ctrl === c.ctrl && x.is('Creature')) x.cur.kw.add('hexproof');}}]});
  S['The Sword of Kahless'] = {equip: '{2}', attachGrant: (g, c, h) => {
    h.cur.power += 2; h.cur.toughness += 2;
    h.cur.extraTriggers.push(C.attack('Look at five cards and deploy a Klingon or Warrior', async ctx => {
      const cards = await C.look(ctx, 5), rows = cards.map(C.row);
      const [chosen] = await C.choose(ctx.g, ctx.you, cards.filter(c => c.is('Creature') && warrior(c)), 0, 1, 'Put a Klingon or Warrior onto the battlefield');
      if (chosen) await ctx.g.putPermanentOntoBattlefield(chosen, ctx.you);
      await C.randomBottom(ctx, rows.filter(C.current).map(r => r.card));
    }));
  }};
  S["Cha'DIch Investigator"] = {triggers: [C.enterTrigger('Create a Klingon Warrior', ctx => C.make(ctx, klingon))]};
})();
