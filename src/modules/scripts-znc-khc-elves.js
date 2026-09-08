'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, SC = M.SCRIPTS, C = M.C1920, E = M.E, T = M.T;
  const elf = (g, c) => c.hasSub(C.type(g, 'Elf'));
  const elves = (g, p) => g.creatures(p).filter(c => elf(g, c));
  const elfToken = ctx => C.token('Elf Warrior', [C.type(ctx, 'Elf'), C.type(ctx, 'Warrior')], 1, 1, ['G']);
  const elfSize = (g, c) => g.bf().filter(x => x.ctrl === c.ctrl && elf(g, x)).length + c.ctrl.graveyard.filter(x => elf(g, x)).length;
  SC['Abomination of Llanowar'] = {oracleCharacteristicPT: true, cdaPower: elfSize, cdaToughness: elfSize};
  SC['Marwyn, the Nurturer'] = {
    triggers: [{on: 'etb', filter: (g, c, d) => d.card !== c && d.card.ctrl === c.ctrl && elf(g, d.card),
      desc: 'Put a +1/+1 counter on Marwyn', run: ctx => C.same(ctx) && ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you)}],
    mana: {cost: {tap: true}, produce: (g, c) => [{G: Math.max(0, c.power)}]},
  };
  SC['Miara, Thorn of the Glade'] = {partner: true, triggers: [{on: 'dies',
    filter: (g, c, d) => d.snap.ctrl === C.controllerAt(g, c, d) && (d.card === c || d.snap.changeling || d.snap.subtypes.includes(C.type(g, 'Elf'))),
    desc: 'You may pay 1 and 1 life to draw a card', run: async ctx => {
      if (ctx.you.life < 1 || !ctx.g.canPayLife(ctx.you, 1)) return;
      if (await C.pay(ctx, '{1}')) {await ctx.g.loseLife(ctx.you, 1, ctx.src.name); await ctx.g.draw(ctx.you, 1, ctx.src);}
    }}]};
  SC['Numa, Joraga Chieftain'] = {partner: true, triggers: [{on: 'beginCombat', filter: C.own,
    desc: 'Pay XX, then distribute X counters among target Elves', run: async ctx => {
      const max = ctx.g.maxAffordableX(ctx.you, M.parseCost('{X}{X}'), ctx.src, {isAbility: true});
      const n = await ctx.you.controller.decide(ctx.g, {type: 'chooseX', min: 0, max, prompt: 'Numa: choose X; pay twice X', aiHint: {kind: 'chooseX', card: ctx.src}});
      if (!Number.isInteger(n) || n < 0 || n > max) throw Error('Invalid Numa payment');
      if (!n || !await ctx.g.payMana(ctx.you, M.parseCost('{' + (2 * n) + '}'), {card: ctx.src, isAbility: true})) return;
      ctx.g.queueTrigger({src: ctx.src, sourceZoneVersion: ctx.sourceZoneVersion, ctrl: ctx.you,
        name: 'Numa: distribute ' + n + ' counters', targets: [T.permanent(elf, {count: n, min: 0, upTo: true, aiHint: {goal: 'buff'}})],
        prepareTargets: async next => {const cards = C.flat(next.targets); next.division = cards.length ? await E.divideDamage(next.g, next.you, next.src, cards, n, {aiKind: 'dividedCounters'}) : []; return next.division !== null;},
        run: next => {for (const c of C.flat(next.targets)) next.g.addCounters(c, '+1/+1', next.division.find(r => r.iid === c.iid)?.n || 0, false, next.you);}});
    }}]};
  SC['Ruthless Winnower'] = {triggers: [{on: 'upkeep', desc: 'The active player sacrifices a non-Elf creature', run: async ctx => {
    const p = ctx.data.player, pool = ctx.g.creatures(p).filter(c => !elf(ctx.g, c) && ctx.g.canSacrifice(c));
    const [c] = await C.choose(ctx.g, p, pool, Math.min(1, pool.length), 1, 'Ruthless Winnower: sacrifice a non-Elf', 'sacCost');
    if (c) await ctx.g.sacrifice(p, c);
  }}]};
  SC['Prowess of the Fair'] = {triggers: [{on: 'lto',
    filter: (g, c, d) => d.card !== c && !d.snap.isToken && d.card.zone === 'graveyard' && d.card.owner === C.controllerAt(g, c, d) && (d.snap.changeling || d.snap.subtypes.includes(C.type(g, 'Elf'))),
    opt: true, desc: 'Create an Elf Warrior for the nontoken Elf put into your graveyard', run: ctx => ctx.g.makeTokens(elfToken(ctx), ctx.you)}]};
  const commonTypeCount = (g, p) => {
    const creatures = g.creatures(p), types = new Set(creatures.flatMap(c => c.cur.subtypes).filter(t => M.CREATURE_SUBTYPES.has(t)));
    if (creatures.some(c => c.cur.allCreatureTypes || c.def.changeling)) types.add('Elf');
    return Math.max(0, ...[...types].map(t => creatures.filter(c => c.hasSub(t)).length));
  };
  SC['Skemfar Shadowsage'] = {triggers: [C.enterTrigger('Choose to drain opponents or gain life for your largest shared creature type', async ctx => {
    const n = commonTypeCount(ctx.g, ctx.you);
    if (ctx.skemfarMode === 'drain') for (const p of ctx.you.opponents(ctx.g)) await ctx.g.loseLife(p, n, ctx.src.name);
    else await ctx.g.gainLife(ctx.you, n);
  }, {prepareTargets: async ctx => {ctx.skemfarMode = await C.option(ctx, [{key: 'drain', label: 'Each opponent loses life'}, {key: 'gain', label: 'You gain life'}], 'choose a mode');}})]};
  SC['Eyeblight Massacre'] = {resolve: ctx => E.pumpAllUntilEOT(ctx.g, (g, c) => !elf(g, c), -2, -2)};
  SC['Bounty of Skemfar'] = {resolve: async ctx => {
    const cards = ctx.you.library.slice(-6).reverse(), rows = cards.map(C.row);
    await ctx.g.revealToHuman({cards, ctrl: ctx.you, kind: 'reveal'});
    const [land] = await C.choose(ctx.g, ctx.you, cards.filter(c => c.is('Land')), 0, 1, 'Bounty of Skemfar: put a land onto the battlefield');
    const [chosen] = await C.choose(ctx.g, ctx.you, cards.filter(c => c !== land && elf(ctx.g, c)), 0, 1, 'Bounty of Skemfar: put an Elf into your hand');
    if (land) await ctx.g.putPermanentOntoBattlefield(land, ctx.you, {tapped: true});
    if (chosen && chosen.zone === 'library') await ctx.g.move(chosen, 'hand');
    await C.randomBottom(ctx, rows.filter(C.current).map(r => r.card));
  }};
  SC['Roots of Wisdom'] = {resolve: async ctx => {
    await ctx.g.mill(ctx.you, 3);
    const pool = ctx.you.graveyard.filter(c => c.is('Land') || elf(ctx.g, c));
    const [c] = await C.choose(ctx.g, ctx.you, pool, Math.min(1, pool.length), 1, 'Roots of Wisdom: return a land or Elf', 'recur');
    if (c) await ctx.g.move(c, 'hand'); else await ctx.g.draw(ctx.you, 1, ctx.src);
  }};
  SC['Pact of the Serpent'] = {targets: [T.player()], resolve: async ctx => {
    const p = ctx.targets[0]; if (!p) return;
    const type = await C.chooseType(ctx), n = ctx.g.creatures(p).filter(c => c.hasSub(type)).length;
    await ctx.g.draw(p, n, ctx.src); await ctx.g.loseLife(p, n, ctx.src.name);
  }};
})();
