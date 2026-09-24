'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FRC, S = M.SCRIPTS, T = M.T;
  S['Archfiend of Despair'] = {kws: ['flying'], noLifegain: 'opps', triggers: [C.end('Opponents lose life equal to their life lost this turn', async ctx => {
    const losses = ctx.you.opponents(ctx.g).map(p => [p, p.turnState.lifeLost || 0]);
    for (const [p, n] of losses) await ctx.g.loseLife(p, n, ctx.src.name);
  }, {filter: () => true})]};
  S['Avacyn, Angel of Horror'] = {kws: ['flying', 'deathtouch'], triggers: [C.death('Return the nontoken creature at the next end step', ctx => {
    const card = ctx.data.card, row = {card, zone: 'graveyard', version: ctx.data.graveyardZoneVersion};
    ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Avacyn: return ' + card.name,
      run: next => C.current(row) && next.g.putPermanentOntoBattlefield(card, next.you)});
  }, {filter: (g, c, d) => d.snap.types.includes('Creature') && !d.card.isToken && d.snap.ctrl === C.controllerAt(g, c, d)})]};
  S['Dack Fayden, Helping Hand'] = {triggers: [C.enterTrigger('Reveal creatures, goad them, and give one to each opponent', async ctx => {
    const players = ctx.you.opponents(ctx.g), hits = await C.polymorph(ctx, ctx.you, c => c.is('Creature'), players.length, true);
    const available = players.slice();
    for (const c of hits.filter(c => c.zone === 'battlefield')) {
      c.meta.goadedBy = [...new Set([...(c.meta.goadedBy || []), ctx.you])];
      const p = await C.choosePlayer(ctx, available, 'Choose a different opponent to receive ' + c.name);
      if (p) {available.splice(available.indexOf(p), 1); M.OracleV8Control.gain(ctx.g, c, p);}
    }
    ctx.g.recalc();
  })]};
  S['Darksteel Angel'] = {kws: ['flying', 'indestructible'], oraclePlayerRulesV10: [{rule: 'no-lose-win', players: 'you'}],
    oracleCounterProhibitsV18: (g, source, card, kind) => kind === '-1/-1' && card.ctrl === source.ctrl && card.is('Creature'),
    statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature')) (x.cur.counterBansV18 ||= []).push('-1/-1');}}]};
  S['Ginger, Queen of Sweets'] = {triggers: [C.enterTrigger('Become the monarch', C.monarch), C.upkeep('Create a Gingerbrute if you are the monarch', ctx => ctx.g.monarch === ctx.you && C.make(ctx, C.gingerbrute), {filter: (g, c) => g.monarch === c.ctrl})],
    abilities: [{label: 'Sacrifice Ginger to gain 6 life', cost: {mana: '{2}', tap: true, sacSelf: true}, run: ctx => ctx.g.gainLife(ctx.you, 6, ctx.src)}]};
  S['Jhoira, Weatherlight Corsair'] = {triggers: C.both('Steal the first historic permanent from an opponent’s library', async ctx => {
    const p = ctx.targets[0], {revealed, hits} = await C.revealUntil(ctx, p, c => C.permanent(ctx.g, c) && C.historic(c));
    if (hits[0]) {const c = hits[0]; await ctx.g.putPermanentOntoBattlefield(c, ctx.you); await ctx.g.loseLife(ctx.you, c.mv, ctx.src.name);}
    await C.randomBottom(ctx, revealed.filter(c => !hits.includes(c) && c.zone === 'library'), p);
  }, {targets: [T.opponent()]})};
  S['Memnarch, the Warden'] = {kws: ['indestructible'], triggers: [C.enterTrigger('Create two Myr', ctx => C.make(ctx, C.myr, 2)), C.attack('Draw for each artifact you control', ctx => C.draw(ctx, C.ownPermanents(ctx.g, ctx.you).filter(c => c.is('Artifact')).length))]};
  S['Nissa, Leyline Tamer'] = {kws: ['deathtouch', 'vigilance'], triggers: [C.landfall('Draw, then reveal a creature on the first resolution this turn', async ctx => {
    const state = ctx.frcNissa;
    const first = state.turn !== ctx.g.turnNo; state.turn = ctx.g.turnNo;
    await C.draw(ctx);
    if (first) await C.polymorph(ctx);
  }, {prepareTargets: ctx => {const meta = ctx.sourceMeta || ctx.src.meta; ctx.frcNissa = meta.frcNissa ||= {turn: -1};}})]};
  S['Niv-Mizzet, Ghost Counsel'] = {kws: ['flying'], triggers: [C.trigger('lifeGain', 'Pay the life you gained to draw that many cards', async ctx => {
    const n = ctx.data.n;
    if (ctx.g.canPayLife(ctx.you, n) && await C.yes(ctx, 'Pay ' + n + ' life to draw ' + n + ' cards?')) {await ctx.g.loseLife(ctx.you, n, ctx.src.name); await C.draw(ctx, n);}
  })], abilities: [{label: 'Each opponent loses 1 life; gain 1 life', cost: {tap: true}, run: async ctx => {
    for (const p of ctx.you.opponents(ctx.g)) await ctx.g.loseLife(p, 1, ctx.src.name); await ctx.g.gainLife(ctx.you, 1, ctx.src);
  }}]};
  S['Ob Nixilis, the Ascended'] = {kws: ['flying'], triggers: [C.enterTrigger('Destroy opposing tapped creatures and gain life', async ctx => {
    const n = await ctx.g.destroyMany(ctx.g.creatures().filter(c => c.ctrl !== ctx.you && c.tapped), {source: ctx.src}); await ctx.g.gainLife(ctx.you, n, ctx.src);
  }), C.end('Create an Angel if you gained life this turn', ctx => ctx.you.turnState.lifeGained > 0 && C.make(ctx, C.angel), {filter: (g, c) => c.ctrl.turnState.lifeGained > 0})]};
  S['Omnath, Locus of the Void'] = {oracleRulesV18: ['mana-colorless'], statics: [{apply: (g, c) => {
    const n = Object.values(c.ctrl.pool).reduce((a, b) => a + b, 0); c.cur.power += n; c.cur.toughness += n;
  }}], triggers: [C.landfall('Add two colorless mana', ctx => {ctx.you.pool.C += 2; ctx.g.recalc();})]};
  S["Serra's Emissary"] = {kws: ['flying'], frcEmissary: true, asEnters: async (g, c) => {
    const types = ['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Planeswalker', 'Land', 'Battle', 'Kindred'];
    const type = await C.option({g, src: c, you: c.ctrl}, types.map(key => ({key, label: key})), 'Choose a card type');
    if (!types.includes(type)) throw Error('Invalid card type'); c.meta.frcProtection = type;
  }, statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature')) x.cur.protectionFrom.push((g, source) => source.is?.(c.meta.frcProtection));}}]};
  const monarchHit = (h, p) => h.target === p && h.monarchAtDamage === p && h.combat && h.sourceSnap?.types.includes('Creature');
  S['Tamiyo, Upriser Crowned'] = {kws: ['flying', 'double strike', 'haste'], triggers: [C.enterTrigger('Become the monarch', C.monarch), C.trigger('oracleDamageToObject', 'Tap and stun creatures that hit you while you were the monarch', ctx => {
    for (const r of ctx.frcDamagers) if (C.current(r)) {ctx.g.tap(r.card); C.add(ctx, r.card, 'stun');}
  }, {filter: (g, c, d) => d.hits.some(h => monarchHit(h, c.ctrl)),
    prepareTargets: ctx => {ctx.frcDamagers = [...new Map(ctx.data.hits.filter(h => monarchHit(h, ctx.you)).map(h => [h.src, {card: h.src, zone: 'battlefield', version: h.sourceVersion}])).values()];}})]};
  S['The Ur-Sphinx'] = {frcUrSphinx: true, kws: ['flying'], costMods: [(g, c, {player, card, castOpts}) => player === c.ctrl && card !== c && (g.castDefinition(card, castOpts).changeling || g.castDefinition(card, castOpts).subtypes?.includes('Sphinx')) ? -1 : 0],
    triggers: [C.attacks('Each player mills; you may cast one card from each for free', async ctx => {
      const groups = [];
      for (const p of ctx.g.apnapFrom(ctx.you)) groups.push((await ctx.g.mill(p, ctx.frcSphinxCount)).map(C.row));
      while (groups.length) {
        const cast = await C.immediate(ctx, groups.flat().filter(C.current).map(r => r.card));
        if (!cast) break;
        const i = groups.findIndex(group => group.some(r => r.card === cast));
        if (i < 0) throw Error('Unknown Ur-Sphinx cast'); groups.splice(i, 1);
      }
    }, {filter: (g, c, d) => d.player === c.ctrl && d.attackers.some(a => a.hasSub('Sphinx')),
      prepareTargets: ctx => {ctx.frcSphinxCount = ctx.data.attackers.filter(a => a.hasSub('Sphinx')).length;}})]};
  S['Venser, Fervent Forger'] = {kws: ['flash'], triggers: [C.modalTrigger(C.enterTrigger('Copy an opposing spell or permanent twice', null, {modes: {pick: 1, list: [
    {label: 'Copy an opposing instant or sorcery twice', targets: [T.spell((g, so, p) => so.ctrl !== p && g.isInstantSorcerySpell(so))], run: ctx => ctx.g.copySpells(ctx.targets[0], ctx.you, 2, {mayNewTargets: true})},
    {label: 'Make two hasty temporary copies of an opposing permanent', targets: [T.permanent((g, c, p) => c.ctrl !== p)], run: ctx => C.copy(ctx, ctx.targets[0], {n: 2, haste: true, delayed: 'sacrifice'})},
  ]}}))]};
})();
