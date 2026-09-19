'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, S = M.SCRIPTS, T = M.T;
  const nonblack = T.creature({filter: (g, c) => !c.colors.includes('B')});
  S['Oloro, Ageless Ascetic'] = {triggers: [
    C.upkeep('Gain two life', ctx => ctx.g.gainLife(ctx.you, 2, ctx.src)),
    C.upkeep('Gain two life from the command zone', ctx => ctx.src.zone === 'command' && ctx.g.gainLife(ctx.you, 2, ctx.src), {zone: 'command'}),
    C.trigger('lifeGain', 'Pay one to draw and drain each opponent', async ctx => {if (await C.pay(ctx, '{1}')) {await C.draw(ctx); for (const p of ctx.you.opponents(ctx.g)) await ctx.g.loseLife(p, 1, ctx.src.name);}}),
  ]};
  S['Razor Hippogriff'] = {kws: ['flying'], triggers: [C.enterTrigger('Return an artifact and gain life for its mana value', async ctx => {
    const c = ctx.targets[0], n = c.mv; await ctx.g.move(c, 'hand'); await ctx.g.gainLife(ctx.you, n, ctx.src);
  }, {targets: [C.grave((g, c, p) => c.owner === p && c.is('Artifact'))]})]};
  S['Serene Master'] = {triggers: [C.trigger('blocks', 'Exchange power until end of combat', ctx => {
    const other = ctx.targets[0]; if (!C.same(ctx) || !other) return;
    const a = ctx.src.power, b = other.power;
    for (const [card, power] of [[ctx.src, b], [other, a]]) {ctx.g.addOracleBasePT(card, {power}); ctx.g.untilEffects.at(-1).expires = 'combat';}
  }, {filter: (g, c, d) => d.blocker === c, targets: (g, c, d) => [T.creature({filter: (g, target) => target === d.attacker && target.blockedBy.includes(c)})]})]};
  S['Stormscape Battlemage'] = {c13DualKicker: true, triggers: [
    C.enterTrigger('White kicker: gain three life', ctx => ctx.g.gainLife(ctx.you, 3, ctx.src), {filter: (g, c, d) => d.card === c && c.castMeta?.c13KickWhite}),
    C.enterTrigger('Black kicker: destroy a nonblack creature without regeneration', ctx => ctx.g.destroy(ctx.targets[0], {source: ctx.src, noRegen: true}), {filter: (g, c, d) => d.card === c && c.castMeta?.c13KickBlack, targets: [nonblack]}),
  ]};
  S['Derevi, Empyrial Tactician'] = {kws: ['flying'], c13CommandAbility: {
    label: 'Put Derevi onto the battlefield from the command zone', cost: {mana: '{1}{G}{W}{U}'},
    run: ctx => ctx.src.zone === 'command' && ctx.src.zoneVersion === ctx.sourceZoneVersion && ctx.g.putPermanentOntoBattlefield(ctx.src, ctx.you),
  }, triggers: [C.enterTrigger('Tap or untap a permanent', ctx => C.tapOrUntap(ctx, ctx.targets[0]), {opt: true, targets: [T.permanent()]}),
    C.hit('Tap or untap a permanent', ctx => C.tapOrUntap(ctx, ctx.targets[0]), {filter: (g, c, d) => d.combat && d.src.ctrl === c.ctrl && d.src.is('Creature') && d.n > 0, opt: true, targets: [T.permanent()]})]};
  S['Djinn of Infinite Deceits'] = {kws: ['flying'], abilities: [{label: 'Exchange control of two nonlegendary creatures', cost: {tap: true},
    cond: g => g.phase !== 'combat', targets: [T.creature({count: 2, filter: (g, c) => !c.cur.super.includes('Legendary')})], run: ctx => {
      const [a, b] = C.flat(ctx.targets).filter(Boolean); if (!a || !b || a.ctrl === b.ctrl) return;
      const ap = a.ctrl, bp = b.ctrl; M.OracleV8Control.gain(ctx.g, a, bp); M.OracleV8Control.gain(ctx.g, b, ap); ctx.g.recalc();
    }}]};
  S["Jeleva, Nephalia's Scourge"] = {kws: ['flying'], triggers: [C.enterTrigger('Exile cards equal to the mana spent to cast Jeleva', async ctx => {
    const rows = [], n = ctx.data.lcCastMeta?.manaSpent ?? ctx.src.castMeta?.manaSpent ?? 0;
    if (n > 0) for (const p of ctx.g.apnapFrom(ctx.you)) for (const c of await C.exileTop(ctx, n, p)) rows.push(C.row(c));
    if (C.same(ctx)) ctx.src.meta.c13Jeleva = rows;
  }), C.attack('Cast an exiled instant or sorcery for free', async ctx => {
    if (!C.same(ctx)) return;
    const pool = (ctx.src.meta.c13Jeleva || []).filter(C.current).map(r => r.card).filter(c => c.is('Instant') || c.is('Sorcery'));
    await C.immediate(ctx, pool, {free: true});
  })]};
  S['Baleful Force'] = {triggers: [C.upkeep('Draw a card and lose one life', async ctx => {await C.draw(ctx); await ctx.g.loseLife(ctx.you, 1, ctx.src.name);}, {filter: () => true})]};
  S['Terra Ravager'] = {triggers: [C.attack('Get power for defending player’s lands', ctx => {const p = ctx.data.target instanceof M.Player ? ctx.data.target : ctx.data.target?.ctrl; if (C.same(ctx) && p) C.buff(ctx, ctx.src, ctx.g.lands(p).length, 0);})]};
  S['Thraximundar'] = {kws: ['haste'], triggers: [C.attack('Defending player sacrifices a creature', ctx => {
    const p = ctx.data.target instanceof M.Player ? ctx.data.target : ctx.data.target?.ctrl; if (p) return C.sacrifice(ctx, p, c => c.is('Creature'));
  }), C.trigger('sacrificed', 'Put a +1/+1 counter on Thraximundar', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1'), {filter: (g, c, d) => d.snap?.types?.includes('Creature') || d.card?.is('Creature'), opt: true})]};
  S['True-Name Nemesis'] = {asEnters: async (g, c) => {c.meta.c13ProtectedPlayer = (await C.choosePlayer({g, src: c, you: c.ctrl}, g.alivePlayers(), 'Choose a player')).idx;},
    statics: [{apply: (g, c) => {if (Number.isInteger(c.meta.c13ProtectedPlayer)) c.cur.protectionFrom.push((g, source) => (source.ctrl || source.owner)?.idx === c.meta.c13ProtectedPlayer);}}]};
  S['Viseling'] = {triggers: [C.upkeep('Deal damage for cards in opponent’s hand beyond four', ctx => ctx.g.damageAny(ctx.src, ctx.data.player, Math.max(0, ctx.data.player.hand.length - 4)), {filter: (g, c, d) => d.player !== c.ctrl})]};
  const marathCost = {mana: '{X}', oracleCounterPayment: C.counterCost('+1/+1')};
  S['Marath, Will of the Wild'] = {etbCounters: {kind: '+1/+1', n: (g, c) => c.castMeta?.manaSpent || 0}, abilities: [
    {label: 'Remove X counters: put X counters on target creature', cost: marathCost, targets: [T.creature()], prepareTargets: ctx => ctx.x > 0, run: ctx => C.add(ctx, ctx.targets[0], '+1/+1', ctx.x)},
    {label: 'Remove X counters: deal X damage to any target', cost: marathCost, targets: [T.any()], prepareTargets: ctx => ctx.x > 0, run: ctx => ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.x)},
    {label: 'Remove X counters: create an X/X Elemental', cost: marathCost, prepareTargets: ctx => ctx.x > 0, run: ctx => C.make(ctx, C.token('Elemental', ['Elemental'], ctx.x, ctx.x, ['G'], [], {tokenImageName: 'C13 Elemental'}))},
  ]};
  S['Magus of the Arena'] = {abilities: [{label: 'Tap two chosen creatures; they fight', cost: {mana: '{3}', tap: true}, targets: [T.creature({filter: (g, c, p) => c.ctrl === p})],
    prepareTargets: async ctx => {
      const opponents = ctx.you.opponents(ctx.g).filter(p => ctx.g.legalTargets(T.creature({filter: (g, c) => c.ctrl === p}), ctx.src, ctx.you).length);
      const p = await C.choosePlayer(ctx, opponents, 'Choose the opponent who selects the other target'); if (!p) return false;
      const spec = T.creature({filter: (g, c) => c.ctrl === p}), pool = ctx.g.legalTargets(spec, ctx.src, ctx.you);
      const chosen = await p.controller.decide(ctx.g, {type: 'chooseTargets', player: p, candidates: pool, min: 1, max: 1, prompt: 'Magus of the Arena: choose your creature', aiHint: {goal: 'fight'}});
      if (!Array.isArray(chosen) || chosen.length !== 1 || !pool.includes(chosen[0])) return false;
      ctx.targets.push(chosen[0]); ctx.boundTargetSpecs = [T.creature({filter: (g, c, p) => c.ctrl === p}), spec]; return true;
    }, run: async ctx => {const [a, b] = ctx.targets; for (const c of [a, b].filter(Boolean)) ctx.g.tap(c); if (a && b) await ctx.g.fight(a, b);}}]};
  S['Naya Soulbeast'] = {kws: ['trample'], etbCounters: {kind: '+1/+1', n: (g, c) => c.castMeta?.c13Soulbeast || 0}, triggers: [C.trigger('cast', 'Reveal library tops to determine Naya Soulbeast’s counters', async ctx => {
    let n = 0; for (const p of ctx.g.alivePlayers()) for (const card of await C.reveal(ctx, 1, p)) n += card.mv;
    if (ctx.src.zone === 'stack' && ctx.src.zoneVersion === ctx.sourceZoneVersion) ctx.src.castMeta.c13Soulbeast = n;
  }, {zone: 'stack', filter: (g, c, d) => d.card === c})]};
  S['Spellbreaker Behemoth'] = {uncounterable: true, uncounterableSpells: (g, c, so) => C.live(c) && c.ctrl === so.ctrl && g.castHasType(so.card, so.castOpts || {}, 'Creature') && so.card.power >= 5};
  S['Prossh, Skyraider of Kher'] = {kws: ['flying'], triggers: [C.trigger('cast', 'Create Kobolds for the mana spent', ctx => C.make(ctx, C.kobold, ctx.data.so.manaSpent || 0), {zone: 'stack', filter: (g, c, d) => d.card === c})],
    abilities: [{label: 'Sacrifice another creature: +1/+0', cost: {sac: (g, c, source) => c !== source && c.is('Creature')}, run: ctx => C.same(ctx) && C.buff(ctx, ctx.src, 1, 0)}]};
  S['Brooding Saurian'] = {triggers: [C.end('Each player regains their nontoken permanents', ctx => {
    for (const c of ctx.g.bf().filter(c => !c.isToken)) M.OracleV8Control.gain(ctx.g, c, c.owner); ctx.g.recalc();
  }, {filter: () => true})]};
  S['Capricious Efreet'] = {triggers: [C.upkeep('Destroy one of the targeted nonland permanents at random', ctx => {
    const candidates = C.flat(ctx.targets).filter(Boolean); if (candidates.length) return ctx.g.destroy(candidates[Math.floor(ctx.g.rnd() * candidates.length)], {source: ctx.src});
  }, {targets: [T.permanent((g, c, p) => c.ctrl === p && !c.is('Land')), T.permanent((g, c, p) => c.ctrl !== p && !c.is('Land'), {min: 0, count: 2, upTo: true})]})]};
  S['Endrek Sahr, Master Breeder'] = {triggers: [C.trigger('cast', 'Create Thrulls for the creature spell’s mana value', ctx => C.make(ctx, C.thrull, ctx.g.stackSpellManaValue(ctx.data.so)), {filter: (g, c, d) => d.player === c.ctrl && g.castHasType(d.card, d.so.castOpts || {}, 'Creature')}),
    {on: 'state', desc: 'Sacrifice Endrek Sahr when you control seven Thrulls', stateTest: (g, c) => g.creatures(c.ctrl).filter(x => x.hasSub('Thrull')).length >= 7, stateMandatorySacrifice: true, run: ctx => C.same(ctx) && ctx.g.sacrifice(ctx.you, ctx.src)}]};
  S['Fell Shepherd'] = {triggers: [C.hit('Return creature cards put in your graveyard from the battlefield this turn', async ctx => {
    if (!await C.yes(ctx, 'Return your creature cards?')) return;
    for (const c of ctx.you.graveyard.slice().filter(c => c.is('Creature') && c.meta.c13DiedTurn === ctx.g.turnNo && c.meta.c13DiedVersion === c.zoneVersion)) await ctx.g.move(c, 'hand');
  })], abilities: [{label: 'Sacrifice another creature: target creature gets -2/-2', cost: {mana: '{B}', sac: (g, c, source) => c !== source && c.is('Creature')}, targets: [T.creature()], run: ctx => C.buff(ctx, ctx.targets[0], -2, -2)}]};
  S['Shattergang Brothers'] = {abilities: [['B', 'Creature'], ['R', 'Artifact'], ['G', 'Enchantment']].map(([color, type]) => ({
    label: 'Sacrifice ' + type.toLowerCase() + ': each other player sacrifices one', cost: {mana: '{2}{' + color + '}', sac: (g, c) => c.is(type)},
    run: async ctx => {for (const p of ctx.g.apnapFrom(ctx.you).filter(p => p !== ctx.you)) await C.sacrifice(ctx, p, c => c.is(type));},
  }))};
  S['Stronghold Assassin'] = {abilities: [{label: 'Sacrifice a creature: destroy a nonblack creature', cost: {tap: true, sac: (g, c) => c.is('Creature')}, targets: [nonblack], run: ctx => ctx.g.destroy(ctx.targets[0], {source: ctx.src})}]};
  S['Gisela, the Broken Blade'] = {kws: ['flying', 'first strike', 'lifelink'], triggers: [C.end('Meld Gisela and Bruna into Brisela', ctx => C.meld(ctx), {filter: (g, c, d) => d.player === c.ctrl && c.owner === c.ctrl && g.creatures(c.ctrl).some(x => x.name === 'Bruna, the Fading Light' && x.owner === c.ctrl)})]};
  S['Bruna, the Fading Light'] = {kws: ['flying', 'vigilance'], triggers: [C.trigger('cast', 'Return an Angel or Human from your graveyard', ctx => ctx.g.putPermanentOntoBattlefield(ctx.targets[0], ctx.you), {zone: 'stack', filter: (g, c, d) => d.card === c, opt: true, targets: [C.grave((g, c, p) => c.owner === p && c.is('Creature') && (c.hasSub('Angel') || c.hasSub('Human')))]})]};
  S['Brisela, Voice of Nightmares'] = {colorsOverride: ['W'], kws: ['flying', 'first strike', 'vigilance', 'lifelink'], c13Brisela: true};
  S['Angel of Destiny'] = {kws: ['flying', 'double strike'], triggers: [C.hit('You and the damaged player gain that much life', async ctx => {
    await ctx.g.gainLife(ctx.you, ctx.data.n, ctx.src); await ctx.g.gainLife(ctx.data.player, ctx.data.n, ctx.src);
  }, {filter: (g, c, d) => d.combat && d.src.ctrl === c.ctrl && d.src.is('Creature') && d.n > 0}),
    C.end('Players attacked by this Angel lose the game', async ctx => {
      if (ctx.you.life < ctx.you.startingLife + 15) return;
      const attacks = C.same(ctx) ? ctx.src.meta.c13Attacked : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion)?.c13Attacked;
      for (const idx of attacks?.turn === ctx.g.turnNo ? attacks.players : []) await ctx.g.playerLoses(ctx.g.players[idx], ctx.src.name);
    }, {filter: (g, c, d) => d.player === c.ctrl && c.ctrl.life >= c.ctrl.startingLife + 15})]};
  S['Archangel of Tithes'] = {kws: ['flying'], c13Tithes: true};
  S['Arden Angel'] = {kws: ['flying'], triggers: [C.upkeep('Roll a d4; return Arden Angel on a one', async ctx => {
    if (ctx.src.zone === 'graveyard' && ctx.src.zoneVersion === ctx.sourceZoneVersion && (await C.roll(ctx, 4))[0] === 1) await ctx.g.putPermanentOntoBattlefield(ctx.src, ctx.you);
  }, {zone: 'graveyard', filter: (g, c, d) => d.player === c.owner})]};
  const soulbond = M.OracleV8Soulbond.compile({kind: 'soulbond-v8', contract: 'soulbond-pairing'}).triggers;
  S['Breathkeeper Seraph'] = {kws: ['flying'], triggers: soulbond, statics: [{apply: (g, c, bf) => {
    const other = M.OracleV8Soulbond.partner(g, c); if (!other) return;
    for (const card of [c, other]) card.cur.extraTriggers.push(C.death('Return at the beginning of your next upkeep', async ctx => {
      const row = {card: ctx.data.card, zone: 'graveyard', version: ctx.data.graveyardZoneVersion};
      if (!C.current(row)) return;
      ctx.g.delayed.push({on: 'upkeep', once: true, opt: true, src: ctx.src, ctrl: ctx.you, name: 'Breathkeeper Seraph: return creature', filter: (g, d) => d.player === ctx.you,
        run: next => C.current(row) && next.g.putPermanentOntoBattlefield(row.card, row.card.owner)});
    }));
  }}]};
  S['Righteous Valkyrie'] = {kws: ['flying'], triggers: [C.enterTrigger('Gain life for another Angel or Cleric’s toughness', ctx => {const state = C.eventStats(ctx); if (state) return ctx.g.gainLife(ctx.you, Math.max(0, state.toughness), ctx.src);}, {filter: (g, c, d) => d.card !== c && d.card.ctrl === c.ctrl && d.card.is('Creature') && (d.card.hasSub('Angel') || d.card.hasSub('Cleric')), prepareTargets: C.snapshotEvent})],
    statics: [{apply: (g, c, bf) => {if (c.ctrl.life >= c.ctrl.startingLife + 7) for (const card of bf) if (card.ctrl === c.ctrl && card.is('Creature')) {card.cur.power += 2; card.cur.toughness += 2;}}}]};
  S['Anarchist'] = {triggers: [C.enterTrigger('Return a sorcery from your graveyard', ctx => ctx.g.move(ctx.targets[0], 'hand'), {opt: true, targets: [C.grave((g, c, p) => c.owner === p && c.is('Sorcery'))]})]};
  S['Genesis'] = {triggers: [C.upkeep('Pay 2G to return a creature from your graveyard', async ctx => {
    if (ctx.src.zone === 'graveyard' && await C.pay(ctx, '{2}{G}')) await ctx.g.move(ctx.targets[0], 'hand');
  }, {zone: 'graveyard', targets: [C.grave((g, c, p) => c.owner === p && c.is('Creature'))]})]};
  S['Rootbreaker Wurm'] = {kws: ['trample']};
  S['Jungle Lion'] = {statics: [{apply: (g, c) => {c.cur.cantBlock = true;}}]};
})();
