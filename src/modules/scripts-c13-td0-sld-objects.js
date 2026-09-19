'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, S = M.SCRIPTS, T = M.T;
  S['Crawlspace'] = {statics: [{apply: (g, c, bf) => {for (const card of bf) if (card.is('Creature')) (card.cur.attackGroupRestrictions ||= []).push(cards => cards.filter(a => a.attacking === c.ctrl).length <= 2);}}]};
  const artifactEnchant = T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'));
  S['Act of Authority'] = {triggers: [C.enterTrigger('Exile an artifact or enchantment', ctx => ctx.g.move(ctx.targets[0], 'exile'), {opt: true, targets: [artifactEnchant]}),
    C.upkeep('Exile an artifact or enchantment; its controller gains this enchantment', async ctx => {
      if (!await C.yes(ctx, 'Exile this permanent and give away Act of Authority?')) return;
      const p = ctx.targets[0].ctrl; await ctx.g.move(ctx.targets[0], 'exile'); if (C.same(ctx)) {M.OracleV8Control.gain(ctx.g, ctx.src, p); ctx.g.recalc();}
    }, {targets: [artifactEnchant]})]};
  S['Cradle of Vitality'] = {triggers: [C.trigger('lifeGain', 'Pay 1W to put that many counters on a creature', async ctx => {if (await C.pay(ctx, '{1}{W}')) C.add(ctx, ctx.targets[0], '+1/+1', ctx.data.n);}, {targets: [T.creature()]})]};
  const curse = trigger => ({isPlayerAura: true, targets: [T.player()], triggers: [trigger]});
  S['Curse of Inertia'] = curse(C.trigger('attackersDeclared', 'Attacking player may tap or untap their chosen permanent', async ctx => {
    if (await C.yes(ctx, 'Tap or untap the chosen permanent?', ctx.data.player)) await C.tapOrUntap(ctx, ctx.targets[0], ctx.data.player);
  }, {filter: C.curseAttack, prepareTargets: async ctx => {
    const spec = T.permanent(), pool = ctx.g.legalTargets(spec, ctx.src, ctx.you), p = ctx.data.player;
    if (!pool.length) return false;
    const cards = await p.controller.decide(ctx.g, {type: 'chooseTargets', player: p, candidates: pool, min: 1, max: 1, prompt: 'Curse of Inertia: choose a permanent', aiHint: {goal: 'tap'}});
    if (!Array.isArray(cards) || cards.length !== 1 || !pool.includes(cards[0])) return false;
    ctx.targets = cards; ctx.boundTargetSpecs = [spec]; return true;
  }}));
  S['Curse of Shallow Graves'] = curse(C.trigger('attackersDeclared', 'Attacking player may create a tapped Zombie', async ctx => {
    if (await C.yes(ctx, 'Create a tapped Zombie?', ctx.data.player)) await C.make({...ctx, you: ctx.data.player}, C.token('Zombie', ['Zombie'], 2, 2, ['B']), 1, {tapped: true});
  }, {filter: C.curseAttack}));
  S['Curse of the Forsaken'] = curse(C.attack('Attacking creature’s controller gains one life', ctx => ctx.g.gainLife(ctx.data.card.ctrl, 1, ctx.src), {filter: C.curseCreature}));
  S['Curse of Predation'] = curse(C.attack('Put a counter on the attacking creature', ctx => {
    const row = ctx.data.c13Attacker; if (C.current(row)) C.add(ctx, row.card, '+1/+1');
  }, {filter: C.curseCreature}));
  S['Curse of Chaos'] = curse(C.trigger('attackersDeclared', 'Attacking player may discard a card to draw', async ctx => {
    const p = ctx.data.player, [card] = await C.choose(ctx.g, p, p.hand, 0, 1, 'Discard a card to draw a card', 'discard');
    if (card) {const before = card.zoneVersion; await ctx.g.discard(p, [card]); if (card.zoneVersion !== before) await C.draw(ctx, 1, p);}
  }, {filter: C.curseAttack}));
  S['Springjack Pasture'] = {mana: C.mana(), abilities: [{label: 'Create a Goat', cost: {mana: '{4}', tap: true}, run: ctx => C.make(ctx, C.goat)}], statics: [{grantsSelfActivatedAbility: true, apply: (g, c, bf) => {
    const goats = bf.filter(card => card.ctrl === c.ctrl && card.hasSub('Goat') && g.canSacrifice(card)).length;
    for (let n = 1; n <= goats; n++) c.cur.extraMana.push({cost: {tap: true, sac: (g, card) => card.hasSub('Goat'), sacN: n},
      produce: C.colors.map(color => ({[color]: n})), afterProduce: (g, source, p) => g.gainLife(p, n, source)});
  }}]};
  S["Surveyor's Scope"] = {abilities: [{label: 'Exile: search for basics for opponents with two more lands', cost: {tap: true, exileSelf: true}, run: ctx => {
    const n = ctx.you.opponents(ctx.g).filter(p => ctx.g.lands(p).length >= ctx.g.lands(ctx.you).length + 2).length;
    return C.search(ctx, ctx.you, c => c.is('Land') && c.def.super.includes('Basic'), n, 'battlefield');
  }}]};
  S['Sword of the Paruns'] = {equip: '{3}', statics: [{apply: (g, c, bf) => {
    const host = g.byIid(c.attachedTo); if (!host || !bf.includes(host) || !host.is('Creature')) return;
    for (const card of bf) if (card.ctrl === c.ctrl && card.is('Creature') && card.tapped === host.tapped) {if (host.tapped) card.cur.power += 2; else card.cur.toughness += 2;}
  }}], abilities: [{label: 'Tap or untap equipped creature', cost: {mana: '{3}'}, run: async ctx => {
    if (!C.same(ctx)) return; const host = ctx.g.byIid(ctx.src.attachedTo);
    if (host && C.alive(ctx.g, host) && await C.yes(ctx, 'Tap or untap equipped creature?')) await C.tapOrUntap(ctx, host);
  }}]};
  S['Flickerform'] = {auraTarget: [T.creature()], abilities: [{label: 'Exile enchanted creature and its Auras until the next end step', cost: {mana: '{2}{W}{W}'}, run: async ctx => {
    if (!C.same(ctx)) return; const host = ctx.g.byIid(ctx.src.attachedTo); if (!host || !C.alive(ctx.g, host)) return;
    const auras = C.attachments(ctx.g, host).filter(c => c.hasSub('Aura'));
    await ctx.g.exileMany([host, ...auras]); const creature = C.row(host), rows = auras.filter(c => c.zone === 'exile').map(C.row);
    if (host.zone !== 'exile') return;
    ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Flickerform: return creature and Auras', run: async next => {
      if (!C.current(creature)) return; await next.g.putPermanentOntoBattlefield(host, host.owner);
      if (host.zone !== 'battlefield') return;
      await next.g.withBattlefieldEntryBatch(async () => {for (const row of rows) if (C.current(row) && next.g.legalEntryAttachment(row.card, host, row.card.owner)) await next.g.putPermanentOntoBattlefield(row.card, row.card.owner, {attachTo: host});});
    }});
  }}]};
  S['Eye of Doom'] = {triggers: [C.enterTrigger('Each player chooses a nonland permanent for a doom counter', async ctx => {
    for (const p of ctx.g.apnapFrom(ctx.you)) {const [c] = await C.choose(ctx.g, p, ctx.g.bf().filter(c => !c.is('Land')), 1, 1, 'Choose a nonland permanent for a doom counter'); if (c) C.add({...ctx, you: p}, c, 'doom');}
  })], abilities: [{label: 'Destroy all permanents with doom counters', cost: {mana: '{2}', tap: true, sacSelf: true}, run: ctx => ctx.g.destroyMany(ctx.g.bf().filter(c => c.counters.doom > 0), {source: ctx.src})}]};
  S['Mystic Barrier'] = {c13Barrier: true, triggers: [C.enterTrigger('Choose left or right', async ctx => {const dir = await C.direction(ctx); if (C.same(ctx)) ctx.src.meta.c13Direction = dir;}),
    C.upkeep('Choose left or right', async ctx => {const dir = await C.direction(ctx); if (C.same(ctx)) ctx.src.meta.c13Direction = dir;})]};
  S['War Cadence'] = {abilities: [{label: 'This turn, pay X for each blocker', xCost: true, cost: {mana: '{X}{R}'}, run: ctx => {ctx.g.untilEffects.push({kind: 'c13BlockTax', expires: 'eot', n: ctx.x});}}]};
  S['Witch Hunt'] = {noLifegain: 'all', triggers: [C.upkeep('Witch Hunt deals four damage to you', ctx => ctx.g.damageAny(ctx.src, ctx.you, 4)),
    C.end('A random target opponent gains Witch Hunt', ctx => {if (C.same(ctx) && ctx.targets[0]) {M.OracleV8Control.gain(ctx.g, ctx.src, ctx.targets[0]); ctx.g.recalc();}}, {prepareTargets: ctx => {
      const spec = T.opponent(), pool = ctx.g.legalTargets(spec, ctx.src, ctx.you); if (!pool.length) return false;
      ctx.targets = [pool[Math.floor(ctx.g.rnd() * pool.length)]]; ctx.boundTargetSpecs = [spec]; return true;
    }})]};
  S['Jar of Eyeballs'] = {triggers: [C.death('Put two eyeball counters on this artifact', ctx => C.same(ctx) && C.add(ctx, ctx.src, 'eyeball', 2), {filter: (g, c, d) => d.snap.ctrl === c.ctrl && d.snap.types.includes('Creature')})],
    abilities: [{label: 'Remove all eyeball counters: look at that many cards and take one', cost: {mana: '{3}', tap: true, oracleCounterPayment: C.counterCost('eyeball', 'all')}, run: async ctx => {
      const cards = ctx.x > 0 ? await C.look(ctx, ctx.x) : [], [chosen] = await C.choose(ctx.g, ctx.you, cards, 1, 1, 'Choose a card for your hand');
      if (chosen) await ctx.g.move(chosen, 'hand'); await C.bottom(ctx, cards.filter(c => c !== chosen));
    }}]};
  S['Plague Boiler'] = {triggers: [C.upkeep('Put a plague counter on Plague Boiler', ctx => C.same(ctx) && C.add(ctx, ctx.src, 'plague')),
    {on: 'state', desc: 'Sacrifice Plague Boiler; destroy all nonland permanents', stateTest: (g, c) => c.counters.plague >= 3, run: async ctx => {
      if (!C.same(ctx) || !ctx.g.canSacrifice(ctx.src)) return; const version = ctx.src.zoneVersion; await ctx.g.sacrifice(ctx.you, ctx.src);
      if (ctx.src.zoneVersion !== version) await ctx.g.destroyMany(ctx.g.bf().filter(c => !c.is('Land')), {source: ctx.src});
    }}], abilities: [{label: 'Add or remove a plague counter', cost: {mana: '{1}{B}{G}'}, run: async ctx => {
      if (!C.same(ctx)) return; const key = await C.option(ctx, [{key: 'add', label: 'Add a plague counter'}, {key: 'remove', label: 'Remove a plague counter'}], 'Add or remove');
      if (key === 'add') C.add(ctx, ctx.src, 'plague'); else ctx.g.removeCounters(ctx.src, 'plague', 1);
    }}]};
  S['Night Soil'] = {abilities: [{label: 'Exile two creatures from one graveyard: create a Saproling', cost: {mana: '{1}', c13NightSoil: true},
    cond: g => g.players.some(p => p.graveyard.filter(c => c.is('Creature')).length >= 2), run: ctx => C.make(ctx, M.TOKENS.saproling)}]};
  S['Primal Vigor'] = {c13Vigor: true};
  S['Vile Requiem'] = {triggers: [C.upkeep('Put a verse counter on this enchantment', ctx => C.same(ctx) && C.add(ctx, ctx.src, 'verse'), {opt: true})],
    abilities: [{label: 'Sacrifice: destroy nonblack creatures for your verse counters', cost: {mana: '{1}{B}', sacSelf: true},
      targets: (g, c) => [T.creature({count: c.counters.verse || 0, min: 0, upTo: true, filter: (g, c) => !c.colors.includes('B')})], run: ctx => ctx.g.destroyMany(C.flat(ctx.targets).filter(Boolean), {source: ctx.src, noRegen: true})}]};
  S['Widespread Panic'] = {triggers: [C.trigger('c13ShuffledByOwnEffect', 'Put a card from your hand on top of your library', async ctx => {
    const p = ctx.data.player, [card] = await C.choose(ctx.g, p, p.hand, 1, 1, 'Put a card on top of your library'); if (card) await ctx.g.move(card, 'library');
  }, {filter: () => true})]};
  const L = C.loyalty;
  S['Ajani, Strength of the Pride'] = {abilities: [
    L(1, 'Gain life for your creatures and planeswalkers', ctx => ctx.g.gainLife(ctx.you, ctx.g.creatures(ctx.you).length + ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Planeswalker')).length, ctx.src)),
    L(-2, 'Create an Ajani’s Pridemate', ctx => C.make(ctx, C.pridemate)),
    L(0, 'At fifteen extra life, exile Ajani and opposing artifacts and creatures', async ctx => {if (ctx.you.life >= ctx.you.startingLife + 15) await ctx.g.exileMany([...ctx.g.bf().filter(c => c.ctrl !== ctx.you && (c.is('Artifact') || c.is('Creature'))), ...(C.same(ctx) ? [ctx.src] : [])]);}),
  ]};
  S['Nykthos, Shrine to Nyx'] = {mana: [C.mana(), {manual: true, cost: {mana: '{2}', tap: true}, produce: (g, c, p) => C.colors.map(color => ({[color]: g.bf().filter(c => c.ctrl === p).reduce((n, card) => n + (card.def.cost?.match(new RegExp('\\{[^}]*' + color + '[^}]*\\}', 'g')) || []).length, 0)}))}]};
  S['The Book of Exalted Deeds'] = {triggers: [C.end('Create an Angel if you gained at least three life', ctx => ctx.you.turnState.lifeGained >= 3 && C.make(ctx, C.token('Angel', ['Angel'], 3, 3, ['W'], ['flying'], {tokenImageName: 'C13 Angel'})), {filter: (g, c, d) => d.player === c.ctrl && c.ctrl.turnState.lifeGained >= 3})],
    abilities: [{label: 'Exile: an Angel gains “You can’t lose; opponents can’t win”', cost: {mana: '{W}{W}{W}', tap: true, exileSelf: true}, sorcery: true, targets: [T.creature({filter: (g, c) => c.hasSub('Angel')})], run: ctx => {
      const c = ctx.targets[0]; C.add(ctx, c, 'enlightened'); C.grant(ctx, c, [], 'object', {field: 'cwwExalted', grants: []});
    }}]};
  S['Empyrial Armor'] = {auraTarget: [T.creature()], attachGrant: (g, c, host) => {host.cur.power += c.ctrl.hand.length; host.cur.toughness += c.ctrl.hand.length;}};
  S['Illusionary Mask'] = {abilities: [{label: 'Pay X: cast an affordable creature face down', xCost: true, cost: {mana: '{X}'}, sorcery: true, run: ctx => C.mask(ctx)}]};
})();
