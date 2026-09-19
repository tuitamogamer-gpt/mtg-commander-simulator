'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.CSL, S = M.SCRIPTS, T = M.T;
  S['Acorn Catapult'] = {abilities: [{label: 'Deal one damage and give a Squirrel', cost: {mana: '{1}', tap: true}, targets: [T.any()], run: async ctx => {
    const t = ctx.targets[0], p = t instanceof M.Player ? t : t.ctrl;
    await ctx.g.damageAny(ctx.src, t, 1); await C.make({...ctx, you: p}, M.TOKENS.squirrel);
  }}]};
  S['Ancient Cornucopia'] = {mana: {cost: {tap: true}, produce: [{ANY: 1}]}, triggers: [C.trigger('cast', 'Gain life for the colors of your spell', ctx => ctx.g.gainLife(ctx.you, M.CDK.castColors(ctx.g, ctx.data.card, ctx.data.so?.castOpts || {}).length, ctx.src), {filter: (g, c, d) => d.player === c.ctrl && M.CDK.castColors(g, d.card, d.so?.castOpts || {}).length > 0, opt: true, oncePerTurnOnUse: 'cslCornucopia'})]};
  S['Crescendo of War'] = {triggers: [C.upkeep('Add a strife counter', ctx => C.same(ctx) && C.add(ctx, ctx.src, 'strife'), {filter: () => true})], statics: [{apply: (g, s, bf) => {for (const c of bf) if (c.is('Creature') && (c.attacking || c.blocking && c.ctrl === s.ctrl)) c.cur.power += s.counters.strife || 0;}}]};
  S['Martyr\'s Bond'] = {triggers: [C.trigger('lto', 'Opponents sacrifice a permanent sharing a card type', async ctx => {
    for (const p of ctx.you.opponents(ctx.g)) await C.sacrifice(ctx, p, c => ctx.data.snap.types.some(t => c.is(t)), 1);
  }, {filter: (g, c, d) => d.card.zone === 'graveyard' && d.snap.ctrl === c.ctrl && !d.snap.types.includes('Land')})]};
  S['Phyrexian Processor'] = {asEnters: async (g, c) => {
    const p = c.ctrl, max = g.canPayLife(p, 1) ? p.life : 0;
    const n = await p.controller.decide(g, {type: 'chooseX', min: 0, max, card: c, prompt: 'Pay any amount of life', aiHint: {kind: 'chooseX'}});
    if (!Number.isSafeInteger(n) || n < 0 || n > max || n && !g.canPayLife(p, n)) throw Error('Invalid Processor life payment');
    c.meta.cslLifePaid = n; if (n) await g.loseLife(p, n);
  }, abilities: [{label: 'Create a Phyrexian Minion sized by life paid', cost: {mana: '{4}', tap: true}, run: ctx => {
    const n = ctx.sourceMeta?.cslLifePaid ?? ctx.src.meta.cslLifePaid ?? 0;
    return C.make(ctx, C.token('Phyrexian Minion', ['Phyrexian', 'Minion'], n, n, ['B'], [], {tokenImageName: 'CSL Phyrexian Minion'}));
  }}]};
  S['Prison Term'] = {auraTarget: [T.creature()], attachGrant: (g, c, host) => {host.cur.cantAttack = true; host.cur.cantBlock = true; host.cur.activationDisabled = true;}, triggers: [C.enterTrigger('Move Prison Term onto the entering opposing creature', async ctx => {
    const c = ctx.data.card; if (C.same(ctx) && c.zone === 'battlefield' && c.is('Creature') && !c.phasedOut && !ctx.g.isProtectedFrom(c, ctx.src, {auraAttachment: true}) && await C.yes(ctx, 'Attach Prison Term to ' + c.name + '?')) await ctx.g.attach(ctx.src, c);
  }, {filter: (g, c, d) => d.card.ctrl !== c.ctrl && d.card.is('Creature')})]};
  S['Stranglehold'] = {cslStranglehold: true, preventsOpponentExtraTurns: true};
  S['Den of the Bugbear'] = {entersTapped: (g, c) => g.lands(c.ctrl).filter(t => t !== c).length >= 2, mana: C.mana('R'), abilities: [{label: 'Become a 3/2 Goblin and create attacking Goblins', cost: {mana: '{3}{R}'}, run: ctx => {
    if (!C.same(ctx)) return;
    ctx.g.addOracleAnimation(ctx.src, {types: ['Creature'], subtypes: ['Goblin'], colors: ['R'], retainTypes: true, power: 3, toughness: 2, temporary: true});
    C.grant(ctx, ctx.src, [], 'eot', {field: 'extraTriggers', grants: [C.attack('Create a tapped and attacking Goblin', next => C.make(next, M.TOKENS.goblin, 1, {tapped: true, chooseAttacking: (g, token) => g.chooseAttackingDestination(next.you, null, token, 'Den of the Bugbear')}))]});
  }}]};
  S['Svogthos, the Restless Tomb'] = {mana: C.mana(), abilities: [{label: 'Become a Plant Zombie sized by creature cards in your graveyard', cost: {mana: '{3}{B}{G}'}, run: ctx => {
    if (!C.same(ctx)) return;
    ctx.g.addOracleAnimation(ctx.src, {types: ['Creature'], subtypes: ['Plant', 'Zombie'], colors: ['B', 'G'], retainTypes: true, power: 0, toughness: 0, temporary: true});
    C.effectOn(ctx, ctx.src, (g, c) => {c.cur.power += c.ctrl.graveyard.filter(c => c.is('Creature')).length; c.cur.toughness += c.ctrl.graveyard.filter(c => c.is('Creature')).length;});
  }}]};
  const soloTarget = d => [...new Set(C.flat(d.so?.targets))];
  S['Zada, Hedron Grinder'] = {triggers: [C.trigger('cast', 'Copy the spell for each other legal creature', async ctx => {
    const so = ctx.data.so, specs = so.targetSpecs || [];
    const pool = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src && specs.every(s => ctx.g.legalTargets(s, so.card, so.ctrl).includes(c)));
    await ctx.g.copySpellBatch(so, ctx.you, pool.map(forceTarget => ({forceTarget})));
  }, {filter: (g, c, d) => d.player === c.ctrl && g.isInstantSorcerySpell(d.so) && soloTarget(d).length === 1 && soloTarget(d)[0] === c})]};
  S['Frontline Heroism'] = {triggers: [C.enterTrigger('Create a Soldier with haste', ctx => C.make(ctx, C.soldier)), C.trigger('cast', 'Create a Soldier and copy the spell targeting it', async ctx => {
    const [token] = await C.make(ctx, C.soldier); if (token) await ctx.g.copySpell(ctx.data.so, ctx.you, {forceTarget: token});
  }, {filter: (g, c, d) => d.player === c.ctrl && soloTarget(d).length === 1 && soloTarget(d)[0] instanceof M.CardInst && soloTarget(d)[0].zone === 'battlefield' && soloTarget(d)[0].is('Creature') && soloTarget(d)[0].ctrl === c.ctrl})]};
  S['Conspicuous Snoop'] = {revealAllTop: true, playTop: (g, s, c) => C.live(s) && !c.is('Land') && c.hasSub('Goblin'), statics: [{apply: (g, s) => {
    const top = s.ctrl.library.at(-1); if (!top?.hasSub('Goblin')) return;
    s.cur.extraAbilities.push(...(top.def.abilities || [])); s.cur.extraMana.push(...[top.def.mana].flat().filter(Boolean));
  }}]};
  S['Goblin Cadets'] = {triggers: ['blocks', 'becomesBlocked'].map(on => C.trigger(on, 'An opponent gains control of Goblin Cadets', ctx => {if (C.same(ctx)) M.OracleV8Control.gain(ctx.g, ctx.src, ctx.targets[0]);}, {filter: (g, c, d) => (on === 'blocks' ? d.blocker : d.attacker) === c, targets: [T.opponent()]}))};
  S['Great Train Heist'] = {modes: {pick: 'any', min: 1, list: [
    {label: 'Untap creatures; add a combat during combat', tierCost: '{2}{R}', run: ctx => {for (const c of ctx.g.creatures(ctx.you)) ctx.g.untap(c); if (ctx.g.phase === 'combat' && ctx.g.turnPlayer === ctx.you) ctx.g.scheduleAdditionalCombat();}},
    {label: 'Creatures get +1/+0 and first strike', tierCost: '{2}', run: ctx => {for (const c of ctx.g.creatures(ctx.you)) C.buff(ctx, c, 1, 0, ['first strike']);}},
    {label: 'Combat damage to an opponent creates tapped Treasures', tierCost: '{R}', targets: [T.opponent()], run: ctx => {const p = ctx.targets[0]; ctx.g.delayed.push({on: 'damageToPlayer', once: false, expires: 'eot', src: ctx.src, ctrl: ctx.you, name: 'Great Train Heist: Treasure', filter: (g, d) => d.combat && d.player === p && d.src?.ctrl === ctx.you && d.src.is('Creature'), run: next => C.make(next, M.TOKENS.treasure, 1, {tapped: true})});}},
  ]}, resolve: async ctx => {for (const i of [0, 1, 2]) if (ctx.mode.includes(i)) await S['Great Train Heist'].modes.list[i].run(ctx);}};
  S['Sazacap\'s Brew'] = {bdfGift: 'tapped Fish', altCosts: [{label: 'Promise a tapped Fish', bdfGift: true}], addlCost: {discard: 1}, targets: (g, c, a) => [T.player(), ...(a?.bdfGift ? [T.yourCreature()] : [])], resolve: async ctx => {
    const p = ctx.g.players[ctx.so.bdfGiftPlayer];
    if (p && !p.lost) {await C.make({...ctx, you: p}, C.token('Fish', ['Fish'], 1, 1, ['U']), 1, {tapped: true}); await ctx.g.emit('bdfGift', {player: ctx.you, recipient: p, card: ctx.src});}
    if (ctx.targets[0]) await C.draw(ctx, 2, ctx.targets[0]); if (ctx.targets[1]) C.buff(ctx, ctx.targets[1], 2, 0);
  }};
})();
