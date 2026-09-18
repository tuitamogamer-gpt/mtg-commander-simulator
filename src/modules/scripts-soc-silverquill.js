'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.SOC, S = M.SCRIPTS, T = M.T;
  const auras = (g, p) => C.ownPermanents(g, p).filter(c => c.hasSub('Aura'));
  const attachedDeath = (g, c, d) => (d.snap.attachedSources || []).some(r => r.card === c);
  const contract = C.registerToken('socContract', {
    name: 'Contract', explicitTokenName: true, tokenImageName: 'SOC Contract', cost: null, super: [],
    types: ['Enchantment'], subtypes: ['Aura'], colorsOverride: ['W'], kws: [],
    oracle: 'Enchant creature\nWhenever enchanted creature attacks, it gets +2/+0 until end of turn if it is attacking one of your opponents. Otherwise, its controller loses 2 life.',
    auraTarget: [T.creature()], triggers: [C.trigger('attacks', 'Reward an attack at an opponent, otherwise lose two life', async ctx => {
      const c = ctx.data.card;
      if (c.attacking instanceof M.Player && ctx.you.opponents(ctx.g).includes(c.attacking)) C.buff(ctx, c, 2, 0);
      else await ctx.g.loseLife(c.ctrl, 2);
    }, {filter: (g, c, d) => c.attachedTo === d.card.iid})],
  });
  S['Scriv, the Obligator'] = {triggers: C.both('Create a Contract on an opposing creature', ctx => C.make(ctx, contract, 1, {attachTo: ctx.targets[0]}), {targets: [T.oppCreature()]})};
  S['Forum Filibuster'] = {triggers: [C.upkeep('Create an Inkling, then recover an Aura or Equipment onto it', async ctx => {
    for (const token of await C.make(ctx, C.inkling)) {
      const row = C.row(token);
      C.targeting(ctx, [C.grave(c => c.hasSub('Aura') || c.hasSub('Equipment'), {min: 0, count: 1, upTo: true})], async next => {
        const c = next.targets[0]; if (!c) return;
        if (C.current(row) && next.g.legalEntryAttachment(c, token, next.you))
          await next.g.move(c, 'battlefield', {ctrl: next.you, attachTo: token});
        else if (!c.hasSub('Aura')) await next.g.putPermanentOntoBattlefield(c, next.you);
      }, 'Forum Filibuster: attach the returned card');
    }
  })]};
  S['Changing Loyalty'] = {kws: ['flash'], replicate: '{2}', auraTarget: [T.creature()], returnsEnchantedOnDeath: true,
    triggers: [C.death('Return the enchanted creature under your control', ctx => C.deceased(ctx) && ctx.g.putPermanentOntoBattlefield(ctx.data.card, ctx.you), {filter: attachedDeath})]};
  S['Coercive Impetus'] = {auraTarget: [T.creature()], attachGrant: (g, c, h) => {h.cur.power++; h.cur.toughness++; h.cur.goadedBy = (h.cur.goadedBy || []).concat(c.ctrl);},
    triggers: [C.trigger('attacks', 'Draw a card and lose one life', async ctx => {await C.draw(ctx); await ctx.g.loseLife(ctx.you, 1);}, {filter: (g, c, d) => c.attachedTo === d.card.iid})]};
  S['Intermediate Chirography'] = {abilities: C.levels(['{1}{B}', '{2}{B}']), triggers: [
    C.enterTrigger('Create an Inkling', ctx => C.make(ctx, C.inkling)),
    C.trigger('lifeLost', 'Grow a creature for your first life loss this turn', ctx => C.add(ctx, ctx.targets[0], '+1/+1'),
      {filter: (g, c, d) => d.player === c.ctrl && d.events === 1 && C.level(c) >= 2, targets: [T.yourCreature()]}),
    C.end('Create an Inkling if a modified creature died under your control', ctx => ctx.you.turnState.socModifiedDied && C.make(ctx, C.inkling),
      {filter: (g, c) => C.level(c) >= 3 && c.ctrl.turnState.socModifiedDied}),
  ]};
  S['Armored Skyhunter'] = {triggers: [C.attack('Look at six and put an Aura or Equipment onto the battlefield', async ctx => {
    const cards = await C.look(ctx, 6), [c] = await C.choose(ctx.g, ctx.you, cards.filter(c => c.hasSub('Aura') || c.hasSub('Equipment')), 0, 1, 'Choose an Aura or Equipment');
    if (c) {
      await ctx.g.putPermanentOntoBattlefield(c, ctx.you);
      if (c.zone === 'battlefield' && c.hasSub('Equipment')) {
        const [host] = await C.choose(ctx.g, ctx.you, ctx.g.creatures(ctx.you).filter(h => !ctx.g.isProtectedFrom(h, c)), 0, 1, 'Attach Equipment to a creature you control');
        if (host) await ctx.g.attach(c, host);
      }
    }
    await C.randomBottom(ctx, cards.filter(x => x.zone === 'library'));
  })]};
  S['Firemane Commando'] = {triggers: [C.trigger('attackersDeclared', 'The attacking player draws for two or more attackers', ctx => C.draw(ctx, 1, ctx.data.player),
    {filter: (g, c, d) => d.attackers.length >= 2 && (d.player === c.ctrl || d.attackers.every(a => (a.card || a).attacking !== c.ctrl))})]};
  S['Pearl-Ear, Imperial Advisor'] = {costMods: [(g, s, {player, card, castOpts}) => player === s.ctrl && g.castHasType(card, castOpts || {}, 'Enchantment') ? -auras(g, player).length : 0],
    triggers: [C.trigger('cast', 'Draw for an Aura targeting your modified permanent', ctx => C.draw(ctx), {filter: (g, c, d) => d.player === c.ctrl &&
      g.castDefinition(d.card, d.so?.castOpts || {}).subtypes?.includes('Aura') && C.flat(d.so?.targets || []).some(x => x instanceof M.CardInst && x.zone === 'battlefield' && x.ctrl === c.ctrl && C.modified(g, x))})]};
  S['Eriette of the Charmed Apple'] = {socEriette: true, triggers: [C.end('Drain opponents for your Auras', async ctx => {
    const n = auras(ctx.g, ctx.you).length; for (const p of ctx.you.opponents(ctx.g)) await ctx.g.loseLife(p, n); await ctx.g.gainLife(ctx.you, n, ctx.src);
  })]};
  S['Tomik, Wielder of Law'] = {selfCostAdjust: (g, c, p) => -C.ownPermanents(g, p).filter(c => c.is('Planeswalker')).length,
    triggers: [C.trigger('attackersDeclared', 'The attacker loses three life and you draw', async ctx => {await ctx.g.loseLife(ctx.data.player, 3); await C.draw(ctx);},
      {filter: (g, c, d) => d.player !== c.ctrl && d.attackers.filter(a => {const t = (a.card || a).attacking; return t === c.ctrl || t?.is?.('Planeswalker') && t.ctrl === c.ctrl;}).length >= 2})]};
  S['Flickering Ward'] = {auraTarget: [T.creature()], asEnters: async (g, c) => {c.meta.socColor = await C.color({g, src: c, you: c.ctrl});},
    attachGrant: (g, c, h) => {const protection = (g, source) => source.colors.includes(c.meta.socColor); protection.auraExceptionSourceV9 = c; protection.auraExceptionVersionV9 = c.zoneVersion; h.cur.protectionFrom.push(protection);},
    abilities: [{label: 'Return Flickering Ward to hand', cost: {mana: '{W}'}, run: ctx => C.same(ctx) && ctx.g.move(ctx.src, 'hand')}]};
  S['Screams from Within'] = {auraTarget: [T.creature()], attachGrant: (g, c, h) => {h.cur.power--; h.cur.toughness--;},
    triggers: [C.death('Return Screams from Within attached to a creature', async ctx => {
      if (ctx.src.zone === 'graveyard' && ctx.src.zoneVersion === ctx.sourceZoneVersion + 1) await ctx.g.putPermanentOntoBattlefield(ctx.src, ctx.you);
    }, {filter: attachedDeath})]};
  S["Raffine's Guidance"] = {socGuidance: true, auraTarget: [T.creature()], attachGrant: (g, c, h) => {h.cur.power++; h.cur.toughness++;}};
  S['Hateful Eidolon'] = {triggers: [C.death('Draw for your Auras on the dying creature', ctx => C.draw(ctx, ctx.data.snap.attachedSources.filter(a => a.snap.ctrl === ctx.you && a.snap.subtypes.includes('Aura')).length),
    {filter: (g, c, d) => d.snap.types.includes('Creature') && d.snap.attachedSources.some(a => a.snap.ctrl === c.ctrl && a.snap.subtypes.includes('Aura'))})]};
  S['Killian, Ink Duelist'] = {socKillian: true};
  const replenish = {name: 'Replenish', cost: '{3}{W}', types: ['Sorcery'], oracle: 'Return all enchantment cards from your graveyard to the battlefield.', resolve: ctx => C.enterMany(ctx, ctx.you.graveyard.filter(c => c.is('Enchantment')).slice())};
  const edit = {name: "Vandal's Edit", cost: '{1}{W}{B}', types: ['Instant'], oracle: 'Draw two cards. Each player loses 2 life.', resolve: async ctx => {await C.draw(ctx, 2); for (const p of ctx.g.apnapFrom(ctx.you)) await ctx.g.loseLife(p, 2);}};
  S['Eiganjo Dynastorian'] = {kws: ['vigilance'], triggers: [C.attacks('Become prepared', ctx => C.prepare(ctx, replenish), {filter: (g, c, d) => d.player === c.ctrl && d.attackers.length >= 2})]};
  S['Defacing Duskmage'] = {kws: ['deathtouch'], triggers: [C.trigger('draw', 'Become prepared for an opponent’s second draw', ctx => C.prepare(ctx, edit), {filter: (g, c, d) => d.player !== c.ctrl && d.nth === 2})]};
})();
