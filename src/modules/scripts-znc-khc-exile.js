'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, SC = M.SCRIPTS, C = M.ZK, T = M.T;
  const ownGrave = filter => C.grave((g, c, p) => c.owner === p && filter(c));
  const exileTrigger = (desc, run) => ({on: 'zkExiled', desc, filter: (g, c, d) => C.qualifying(g, c, d).length > 0,
    prepareTargets: ctx => {ctx.zkExileCount = ctx.data.entries.filter(r => r.from === 'hand' ? r.owner === ctx.you : r.controller === ctx.you).length;}, run});
  const spirit = {...C.token('Spirit', ['Spirit'], 1, 1, ['W'], ['flying']), tokenImageName: 'KHC Spirit'};
  SC['Ranar the Ever-Watchful'] = {zkRanar: true, triggers: [exileTrigger('Create a flying Spirit for this exile event', ctx => ctx.g.makeTokens(spirit, ctx.you))]};
  SC['Hero of Bretagard'] = {triggers: [exileTrigger('Put that many +1/+1 counters on this creature', ctx => C.same(ctx) && ctx.g.addCounters(ctx.src, '+1/+1', ctx.zkExileCount, false, ctx.you))],
    statics: [{phase: 1, apply: (g, c) => {
      const n = C.countCounters(c);
      if (n >= 5) {if (!c.cur.subtypes.includes('Angel')) c.cur.subtypes.push('Angel'); c.cur.kw.add('flying');}
      if (n >= 10) {if (!c.cur.subtypes.includes('God')) c.cur.subtypes.push('God'); c.cur.kw.add('indestructible');}
    }}]};
  const foretellCard = async ctx => {
    await ctx.g.draw(ctx.you, 1, ctx.src);
    const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand, Math.min(1, ctx.you.hand.length), 1, 'Ethereal Valkyrie: foretell a card from your hand', 'foretell');
    if (c) await ctx.g.zkForetellFromHand(ctx.you, c, {granted: true});
  };
  SC['Ethereal Valkyrie'] = {triggers: ['etb', 'attacks'].map(on => ({on, filter: (g, c, d) => d.card === c,
    desc: 'Draw, then exile a hand card face down with a reduced foretell cost', run: foretellCard}))};
  SC['Cosmic Intervention'] = {foretell: {cost: '{1}{W}'}, resolve: ctx => ctx.g.untilEffects.push({kind: 'zkCosmic', expires: 'eot', who: ctx.you, source: ctx.src})};
  SC['Emeria Shepherd'] = {triggers: [{on: 'landfall', filter: (g, c, d) => d.card.ctrl === c.ctrl, opt: true,
    desc: 'Return a nonland permanent to hand, or to the battlefield for a Plains',
    targets: [ownGrave(c => !c.is('Land') && C.permanent(null, c))],
    prepareTargets: ctx => {ctx.zkPlains = ctx.data.card.hasSub(C.type(ctx, 'Plains'));},
    run: async ctx => {
      const c = ctx.targets[0]; if (!c) return;
      if (ctx.zkPlains && await C.option(ctx, [{key: 'battlefield', label: 'Return to battlefield'}, {key: 'hand', label: 'Return to hand'}], 'choose the destination') === 'battlefield') await ctx.g.putPermanentOntoBattlefield(c, ctx.you);
      else await ctx.g.move(c, 'hand');
    }}]};
  SC['Soulherder'] = {triggers: [{on: 'zkExiled',
    filter: (g, c, d) => d.entries.some(r => r.from === 'battlefield' && r.snapshot.types.includes('Creature')),
    times: (g, c, d) => d.entries.filter(r => r.from === 'battlefield' && r.snapshot.types.includes('Creature')).length,
    desc: 'Put a +1/+1 counter on Soulherder', run: ctx => C.same(ctx) && ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you)},
    {on: 'endStep', filter: C.own, opt: true, targets: [T.creature({filter: (g, c, p, s) => c !== s && c.ctrl === p})],
      desc: 'Exile another creature you control and return it under its owner’s control', run: async ctx => {
        const c = ctx.targets[0]; if (!c) return;
        const version = c.zoneVersion; await ctx.g.move(c, 'exile');
        if (!c.isToken && c.zone === 'exile' && c.zoneVersion === version + 1) await ctx.g.putPermanentOntoBattlefield(c, c.owner);
      }}]};
  SC['Trove Warden'] = {triggers: [{on: 'landfall', filter: (g, c, d) => d.card.ctrl === c.ctrl,
    targets: [ownGrave(c => C.permanent(null, c) && c.mv <= 3)], prepareTargets: C.prepareLink('zkTrove'),
    desc: 'Exile a small permanent card from your graveyard', run: ctx => ctx.targets[0] && C.imprint(ctx, ctx.targets[0])},
    {on: 'dies', filter: (g, c, d) => d.card === c, prepareTargets: C.prepareLink('zkTrove'),
      desc: 'Return each permanent card exiled with Trove Warden to its owner',
      run: ctx => C.enterMany(ctx, C.linked(ctx.c1719LinkState).map(r => r.card), null)}]};
  SC["Serpent's Soul-Jar"] = {triggers: [{on: 'dies',
    filter: (g, c, d) => d.snap.ctrl === C.controllerAt(g, c, d) && (d.snap.changeling || d.snap.subtypes.includes(C.type(g, 'Elf'))),
    prepareTargets: C.prepareLink('zkJar'), desc: 'Exile the Elf that died',
    run: ctx => C.currentDeath(ctx) && C.imprint(ctx, ctx.data.card)}], abilities: [{cost: {tap: true, life: 2},
      label: 'Pay 2 life: cast one of the creature cards exiled with this artifact this turn', prepareTargets: C.prepareLink('zkJar'),
      run: ctx => {
        const group = {used: [], singleSpell: true};
        for (const r of C.linked(ctx.c1719LinkState)) if (r.card.is('Creature')) C.playGrant(ctx, r.card, {turn: ctx.g.turnNo, group, spellsOnly: true, zkCreatureOnly: true});
      }, aiScore: (g, c) => C.linked(C.linkState(c, 'zkJar')).some(r => r.card.is('Creature')) ? 4 : -4}]};
  SC["Tiana, Ship's Caretaker"] = {triggers: [{on: 'lto',
    filter: (g, c, d) => d.card.zone === 'graveyard' && d.snap.ctrl === C.controllerAt(g, c, d) && d.snap.subtypes.some(t => t === 'Aura' || t === 'Equipment'),
    desc: 'You may return that Aura or Equipment at the next end step', run: ctx => {
      const r = {card: ctx.data.card, zone: 'graveyard', version: ctx.data.snap.zoneVersion + 1};
      ctx.g.delayed.push({on: 'endStep', once: true, opt: true, src: ctx.src, ctrl: ctx.you, name: 'Tiana: return ' + ctx.data.snap.name,
        run: next => C.current(r) && next.g.move(r.card, 'hand')});
    }}]};
  SC['Arcane Artisan'] = {abilities: [{label: 'A player draws, exiles a hand card, and copies it if it is a creature', cost: {mana: '{2}{U}', tap: true}, targets: [T.player()],
    prepareTargets: C.prepareLink('zkArtisan'), run: async ctx => {
      const p = ctx.targets[0]; if (!p) return;
      await ctx.g.draw(p, 1, ctx.src);
      const [c] = await C.choose(ctx.g, p, p.hand, Math.min(1, p.hand.length), 1, 'Arcane Artisan: exile a card from your hand', 'bestPermanent');
      if (!c) return;
      const creature = c.is('Creature'), def = C.snapshotCopy(c), version = c.zoneVersion;
      await ctx.g.move(c, 'exile');
      if (creature && c.zone === 'exile' && c.zoneVersion === version + 1) {
        const made = await C.copy({...ctx, you: p}, c, {definition: def});
        ctx.c1719LinkState.push(...made.map(C.row));
      }
    }, aiScore: () => 5}], triggers: [{on: 'lto', filter: (g, c, d) => d.card === c, prepareTargets: C.prepareLink('zkArtisan'),
      desc: 'Exile the tokens created with this Artisan at the next end step', run: ctx => {
        const rows = ctx.c1719LinkState;
        ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Arcane Artisan: exile its tokens',
          run: next => next.g.exileMany(rows.filter(C.current).map(r => r.card))});
      }}]};
  const ring = {name: 'Replicated Ring', cost: null, types: ['Artifact'], super: ['Snow'], subtypes: [], oracle: '{T}: Add one mana of any color.', kws: [], isTokenDef: true,
    mana: {cost: {tap: true}, produce: [{ANY: true, n: 1}]}, tokenImageName: 'Replicated Ring'};
  SC['Replicating Ring'] = {mana: ring.mana, triggers: [{on: 'upkeep', filter: C.own,
    desc: 'Add a night counter; at eight remove all and create eight snow Replicated Rings', run: async ctx => {
      if (!C.same(ctx)) return;
      ctx.g.addCounters(ctx.src, 'night', 1, false, ctx.you);
      if ((ctx.src.counters.night || 0) >= 8) {ctx.g.removeCounters(ctx.src, 'night', ctx.src.counters.night); await ctx.g.makeTokens(ring, ctx.you, {n: 8});}
    }}]};
  SC['Niko Defies Destiny'] = {saga: [
    {run: ctx => ctx.g.gainLife(ctx.you, 2 * ctx.you.exile.filter(c => c.meta.foretold && c.meta.foretoldZoneVersion === c.zoneVersion).length)},
    {run: ctx => {for (const color of ['W', 'U']) {ctx.you.pool[color]++; (ctx.you.poolMeta ||= []).push({color, n: 1, source: ctx.src, restrictAbilities: true, restrict: M.ZK.nikoManaAllows});} ctx.g.note('mana', {p: ctx.you});}},
    {targets: [ownGrave(c => !!c.def.foretell)], run: ctx => ctx.targets[0] && ctx.g.move(ctx.targets[0], 'hand')},
  ]};
  M.TOKENS.zkSpirit = spirit; M.TOKENS.zkRing = ring;
})();
