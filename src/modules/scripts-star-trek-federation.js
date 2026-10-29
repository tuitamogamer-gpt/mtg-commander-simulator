'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.C13, S = M.SCRIPTS, T = M.T, E = M.E;
  const seek = (desc, run, extra = {}) => ({on: 'draw', filter: (g, c, d) => d.player === c.ctrl && d.nth === 2, desc, run, ...extra});
  const optional = {count: 1, min: 0, upTo: true};
  const officer = C.registerToken('trcOfficer', C.token('Officer', ['Officer'], 1, 1, ['R'], [], {tokenImageName: 'TRC Officer'}));
  const illusion = C.registerToken('trcSpacecraftIllusion', C.token('Spacecraft Illusion', ['Spacecraft', 'Illusion'], 4, 3, [], ['flying'], {types: ['Artifact', 'Creature'], tokenImageName: 'TRC Spacecraft Illusion'}));
  const station = (n, kws, extra = {}) => ({stationCreatureAt: n,
    dynTypes: (g, c) => (c.counters.charge || 0) >= n ? ['Creature'] : [],
    statics: [{apply: (g, c) => {if ((c.counters.charge || 0) >= n) for (const kw of kws) c.cur.kw.add(kw);}}],
    abilities: [{...E.stationAbility(), run: ctx => {
      if (!C.same(ctx)) return;
      const c = ctx.tappedCre, live = c?.zone === 'battlefield' && c.zoneVersion === ctx.stationZoneVersion;
      const snap = c?.battlefieldLKI?.get(ctx.stationZoneVersion);
      const power = live ? (c.cur.stationByToughnessV89 ? c.toughness : c.power) : snap ? (snap.stationByToughnessV89 ? snap.toughness : snap.power) : ctx.stationPower;
      C.add(ctx, ctx.src, 'charge', Math.max(0, power || 0));
    }}], ...extra});
  const drawBoth = async ctx => {for (const p of ctx.g.apnapFrom(ctx.g.turnPlayer).filter(p => p === ctx.you || p === ctx.targets[0])) await ctx.g.draw(p, 2, ctx.src);};
  const blink = async ctx => {
    const before = C.flat(ctx.targets).map(C.row);
    await ctx.g.exileMany(before.map(r => r.card));
    const rows = before.filter(r => r.card.zone === 'exile' && r.card.zoneVersion === r.version + 1).map(r => C.row(r.card));
    if (rows.length) ctx.g.delayed.push({on: 'endStep', once: true, src: ctx.src, ctrl: ctx.you, name: 'Temporal Tribulation: return the exiled cards', run: next => next.g.withBattlefieldEntryBatch(async () => {for (const r of rows) if (C.current(r)) await next.g.putPermanentOntoBattlefield(r.card, r.card.owner);})});
  };
  S['Jean-Luc Picard, Luminary'] = {triggers: [
    C.enterTrigger('Draw for another historic permanent with mana value at least three', ctx => C.draw(ctx), {filter: (g, c, d) => d.card !== c && d.card.ctrl === c.ctrl && d.card.mv >= 3 && C.historic(d.card)}),
    seek('Put a counter on another creature and two charge counters on a Spacecraft', ctx => {const [creature, ship] = ctx.targets; if (creature) C.add(ctx, creature, '+1/+1'); if (ship) C.add(ctx, ship, 'charge', 2);}, {targets: [T.creature({...optional, filter: (g, c, p, s) => c !== s}), T.permanent((g, c) => c.hasSub('Spacecraft'), optional)]}),
  ]};
  S['Captain Janeway, Endgame'] = {triggers: [{on: 'oracleDamageToObject', desc: 'Draw and create an Officer for Officers hitting a player', filter: (g, c, d) => d.hits.some(h => h.combat && h.target instanceof M.Player && h.sourceSnap?.ctrl === c.ctrl && h.sourceSnap.types.includes('Creature') && (h.sourceSnap.subtypes.includes('Officer') || h.sourceSnap.changeling)), run: async ctx => {await C.draw(ctx); await C.make(ctx, officer);}}],
    abilities: [{label: 'Tap a creature: Janeway cannot be blocked this turn', cost: {mana: '{2}', tapPermanents: {n: 1, filter: (g, c, s, p) => c.ctrl === p && c.is('Creature')}}, run: ctx => {if (C.same(ctx)) C.effectOn(ctx, ctx.src, (g, c) => {c.cur.unblockable = true;});}}]};
  S["Ambassador K'Ehleyr"] = {kws: ['vigilance'], triggers: [C.combat('Parley: each player reveals and draws; grow for nonlands', async ctx => {
    const players = ctx.g.apnapFrom(ctx.g.turnPlayer), cards = players.map(p => p.library.at(-1)).filter(Boolean), n = cards.filter(c => !c.is('Land')).length;
    if (cards.length) await ctx.g.revealToHuman({cards, ctrl: ctx.you, kind: 'reveal'});
    for (const p of players) await ctx.g.draw(p, 1, ctx.src);
    if (C.same(ctx)) C.add(ctx, ctx.src, '+1/+1', n);
  })]};
  S["Beverly Crusher, Ship's Doctor"] = {triggers: [seek('Put a +1/+1 counter on up to three creatures', ctx => {for (const c of C.flat(ctx.targets)) C.add(ctx, c, '+1/+1');}, {targets: [T.creature({count: 3, min: 0, upTo: true})]})]};
  S['Dr. Pulaski, Cynical Clinician'] = {triggers: [seek('Gain 4 life', ctx => ctx.g.gainLife(ctx.you, 4, ctx.src))]};
  S['Ensign Harry Kim, Operations'] = {triggers: [C.enterTrigger('Grow if the entering creature has greater power', ctx => {
    const c = ctx.data.card, snap = c.battlefieldLKI?.get(ctx.trcKimEntry.version), power = C.current(ctx.trcKimEntry) ? c.power : snap?.power;
    if (C.same(ctx) && power > ctx.src.power) C.add(ctx, ctx.src, '+1/+1');
  }, {filter: (g, c, d) => d.card !== c && d.card.ctrl === c.ctrl && d.card.is('Creature') && d.card.power > c.power, prepareTargets: ctx => {ctx.trcKimEntry = C.row(ctx.data.card);}})],
    abilities: [{label: 'Remove two counters from your creatures: draw a card', cost: {mana: '{2}', oracleCounterPayment: {n: 2, kinds: ['+1/+1'], self: false, among: true, filter: (g, c) => c.is('Creature')}}, run: ctx => C.draw(ctx)}]};
  S['Ezri Dax, Newly Joined'] = {kws: ['flash'], asEnters: async (g, c) => {
    const [copy] = await C.choose(g, c.ctrl, c.ctrl.graveyard.filter(x => x.is('Creature') && x.meta.c14GraveEntry?.turn === g.turnNo && x.meta.c14GraveEntry.version === x.zoneVersion), 0, 1, 'Ezri Dax: copy a creature that died this turn');
    if (copy) {const d = C.snapshotCopy(copy); M.OracleV8Copies.applyCopy(g, c, {...d, name: 'Ezri Dax, Newly Joined', super: [...new Set([...(d.super || []), 'Legendary'])], subtypes: [...new Set([...(d.subtypes || []), 'Trill'])]}); g.recalc();}
  }};
  S['Guinan, Ancient Advisor'] = {abilities: [{label: 'Grow your creatures that entered this turn; draw if two counters were placed', cost: {mana: '{1}', tap: true}, run: async ctx => {
    let n = 0; for (const c of ctx.g.creatures(ctx.you).filter(c => c.meta._enteredTurn === ctx.g.turnNo)) {const before = c.counters['+1/+1'] || 0; C.add(ctx, c, '+1/+1'); n += Math.max(0, (c.counters['+1/+1'] || 0) - before);}
    if (n >= 2) await C.draw(ctx);
  }}]};
  S['Julian Bashir, Frontier Doctor'] = {triggers: [seek('Put a counter on Julian Bashir', ctx => C.same(ctx) && C.add(ctx, ctx.src, '+1/+1')),
    C.attack('Return a creature with mana value up to Julian Bashir’s power', ctx => ctx.targets[0] && ctx.g.putPermanentOntoBattlefield(ctx.targets[0], ctx.you), {targets: [C.grave((g, c, p, s) => c.owner === p && c.is('Creature') && c.mv <= Math.max(0, s.power))], prepareTargets: ctx => {
      ctx.boundTargetSpecs = [C.grave((g, c, p) => c.owner === p && c.is('Creature') && c.mv <= Math.max(0, (C.same(ctx) ? ctx.src : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion))?.power || 0))];
    }})]};
  S['Spot, Felis catus'] = {triggers: [C.enterTrigger('Create a Food', ctx => C.make(ctx, M.TOKENS.food), {filter: (g, c, d) => d.card === c || d.card.ctrl === c.ctrl && !d.card.isToken && C.legendary(d.card)})],
    abilities: [{label: 'Sacrifice a Food: destroy an artifact', cost: {mana: '{4}', sac: (g, c) => c.hasSub('Food')}, targets: [T.permanent((g, c) => c.is('Artifact'))], run: ctx => ctx.targets[0] && ctx.g.destroy(ctx.targets[0], {source: ctx.src})}]};
  S['U.S.S. Enterprise-E, Sovereign'] = station(8, ['flying', 'vigilance'], {triggers: [C.enterTrigger('Destroy all tapped creatures', ctx => ctx.g.destroyMany(ctx.g.creatures().filter(c => c.tapped), {source: ctx.src}))]});
  S["Chief Miles O'Brien"] = {triggers: [seek('Double each kind of counter on your artifact or creature', ctx => {
    const c = ctx.targets[0]; if (c) for (const [kind, n] of Object.entries({...c.counters})) if (n > 0) C.add(ctx, c, kind, n);
  }, {targets: [T.permanent((g, c, p) => c.ctrl === p && (c.is('Artifact') || c.is('Creature')))]})]};
  S['Data, Exploring Humanity'] = {triggers: [seek('Discover 4', ctx => M.WLM.discover(ctx, 4))]};
  S['Geordi La Forge, Innovator'] = {statics: [{apply: (g, c, bf) => {if (bf.some(x => x.ctrl === c.ctrl && x.hasSub('Spacecraft'))) c.cur.unblockable = true;}}], triggers: [{on: 'damageToPlayer', filter: (g, c, d) => d.src === c && d.combat, desc: 'Draw a card', run: ctx => C.draw(ctx)}]};
  S['Kes, Evolving Telepath'] = {triggers: [C.end('Add a time counter, draw for time counters, and sacrifice at nine', async ctx => {
    const same = C.same(ctx); if (same) C.add(ctx, ctx.src, 'time');
    const n = same ? ctx.src.counters.time || 0 : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion)?.counters.time || 0;
    await C.draw(ctx, n); if (C.same(ctx) && (ctx.src.counters.time || 0) >= 9) await ctx.g.sacrifice(ctx.you, ctx.src);
  })]};
  S['On the Shoulders of Giants'] = {statics: [{apply: (g, c, bf) => {for (const x of bf) if (x.ctrl === c.ctrl && x.is('Creature') && C.historic(x)) x.cur.kw.add('flying');}}]};
  S['Temporal Tribulation'] = {flashback: '{5}{U}', targets: [T.permanent((g, c, p) => c.ctrl === p, {count: 2, min: 2})], resolve: blink};
  S['Tuvok, Chief Tactical Officer'] = {kws: ['flash'], triggers: [C.enterTrigger('You may reselect the defenders of up to two attackers', async ctx => {
    for (const c of C.flat(ctx.targets)) {
      if (!c.attacking) continue;
      const choices = ctx.g.alivePlayers().filter(p => p !== c.ctrl).concat(ctx.g.bf().filter(p => p.is('Planeswalker') && p.ctrl !== c.ctrl || p.is('Battle') && p.protector && p.protector !== c.ctrl));
      const key = await C.option(ctx, [{key: 'keep', label: 'Keep the current defender'}, ...choices.map((p, i) => ({key: String(i), label: p.name}))], 'Tuvok: reselect the defender for ' + c.name);
      if (key !== 'keep') {const target = choices[Number(key)]; if (!target) throw Error('Invalid Tuvok defender'); c.attacking = target; ctx.g.note('combat', {kind: 'reselectedAttack', card: c});}
    }
  }, {filter: (g, c, d) => d.card === c && g.phase === 'combat' && g.step === 'attackers', targets: [T.creature({count: 2, min: 0, upTo: true, filter: (g, c) => !!c.attacking})]})]};
  S['Ro Laren, Double Agent'] = {triggers: [seek('Deal 2 damage to each opponent', ctx => ctx.g.damageBatch(ctx.you.opponents(ctx.g).map(target => ({src: ctx.src, target, n: 2}))))], abilities: [{label: 'Discard a card: draw a card', cost: {mana: '{1}', tap: true, discard: 1}, run: ctx => C.draw(ctx)}]};
  S['Rom and Leeta, Unlikely Pair'] = {triggers: [seek('Create two tapped Treasures', ctx => ctx.g.makeTokens(M.TOKENS.treasure, ctx.you, {n: 2, tapped: true}))]};
  S["B'Elanna Torres, Scrapper"] = {kws: ['vigilance', 'trample'], abilities: [{label: 'Surveil 2, then reveal an artifact to draw or gain two counters', cost: {mana: '{2}', tap: true}, run: async ctx => {
    await E.surveil(ctx.g, ctx.you, 2); const top = ctx.you.library.at(-1); let drawn = 0;
    if (top && await C.yes(ctx, 'Reveal the top card of your library?')) {await ctx.g.revealToHuman({cards: [top], ctrl: ctx.you, kind: 'reveal'}); if (top.is('Artifact')) drawn = await ctx.g.draw(ctx.you, 1, ctx.src);}
    if (!drawn && C.same(ctx)) C.add(ctx, ctx.src, '+1/+1', 2);
  }}]};
  S['Cmdr. Troi, Outgoing Empath'] = {kws: ['vigilance'], abilities: [{label: 'Offer the active opponent a free spell and copy it, or draw', cost: {tap: true}, targets: [T.opponent({filter: (g, p) => p === g.turnPlayer})], run: async ctx => {
    const p = ctx.targets[0]; if (!p) return; const before = new Set(ctx.g.stack), cast = await C.immediate({...ctx, you: p}, p.hand.filter(c => !c.is('Land')));
    if (cast) {const so = ctx.g.stack.find(so => !before.has(so) && so.kind === 'spell' && so.card === cast && !so.isCopy); if (so) await ctx.g.copySpells(so, ctx.you, 1, {mayNewTargets: true});}
    else await C.draw(ctx);
  }}]};
  S['Commander William Riker'] = {kws: ['vigilance', 'haste'], abilities: [{label: 'You and an opponent each draw two cards', cost: {mana: '{1}', tap: true}, targets: [T.opponent()], run: drawBoth}]};
  S['Reg Barclay, Fidgety Fantasist'] = {triggers: [seek('Make a hasty nonlegendary Illusion artifact copy until the next end step', ctx => {
    const c = ctx.targets[0]; if (!c) return; const d = C.snapshotCopy(c);
    return C.copy(ctx, c, {definition: {...d, super: (d.super || []).filter(t => t !== 'Legendary'), types: [...new Set([...d.types, 'Artifact'])], subtypes: [...new Set([...d.subtypes, 'Illusion'])], kws: [...new Set([...(d.kws || []), 'haste'])]}, delayed: 'exile'});
  }, {targets: [T.yourCreature({filter: (g, c, p, s) => c.ctrl === p && c !== s})]})]};
  S['Tom Paris, Risk-Taker'] = {triggers: [seek('Your creatures gain flying, double strike, vigilance and haste this turn', ctx => {for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['flying', 'double strike', 'vigilance', 'haste']);})]};
  S['Unification'] = {saga: [
    {targets: [T.creature(optional)], run: async ctx => {const c = ctx.targets[0]; if (!c) return; const r = C.row(c), owner = c.owner; await ctx.g.draw(owner, 2, ctx.src); if (C.current(r)) {await ctx.g.move(c, 'library'); M.shuffle(owner.library, ctx.g.rnd);}}},
    {run: async ctx => {const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand.concat(ctx.you.graveyard).filter(c => c.hasSub('Spacecraft')), 0, 1, 'Unification: put a Spacecraft onto the battlefield'); if (c) await ctx.g.putPermanentOntoBattlefield(c, ctx.you);}},
    {targets: [T.opponent()], run: drawBoth},
  ]};
  S['Vic Fontaine, One Night Only'] = {triggers: [seek('Give one or two creatures +2/+0 and lifelink this turn', ctx => {for (const c of C.flat(ctx.targets)) C.buff(ctx, c, 2, 0, ['lifelink']);}, {targets: [T.creature({count: 2, min: 1, upTo: true})]})]};
  S['Worf, Son of Mogh'] = {kws: ['menace'], statics: [{apply: (g, c, bf) => {for (const x of bf) if (x !== c && x.ctrl === c.ctrl && x.is('Creature') && x.hasSub('Officer')) {x.cur.power++; x.cur.toughness++;}}}], triggers: [seek('Create an Officer', ctx => C.make(ctx, officer))]};
  S['U.S.S. Defiant, Tough Little Ship'] = station(5, ['flying', 'hexproof'], {triggers: [C.enterTrigger('Destroy up to one artifact or enchantment', ctx => ctx.targets[0] && ctx.g.destroy(ctx.targets[0], {source: ctx.src}), {targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), optional)]})]});
  const wheel = async ctx => {if (await C.yes(ctx, 'Discard your hand and draw that many cards?')) {const before = ctx.you.turnState.discardedN || 0; await ctx.g.discard(ctx.you, ctx.you.hand.slice()); await C.draw(ctx, (ctx.you.turnState.discardedN || 0) - before);}};
  S['U.S.S. Enterprise-C, Time-Tossed'] = station(3, ['flying'], {triggers: [C.enterTrigger('You may discard your hand and draw that many cards', wheel), C.death('You may discard your hand and draw that many cards', wheel)]});
  S['U.S.S. Prometheus, Prototype'] = station(4, ['flying'], {triggers: [{on: 'damageToPlayer', desc: 'Deal that much damage to each other opponent', filter: (g, c, d) => d.src === c && d.combat && d.player !== c.ctrl && (c.counters.charge || 0) >= 8, run: ctx => ctx.g.damageBatch(ctx.you.opponents(ctx.g).filter(p => p !== ctx.data.player).map(target => ({src: ctx.src, target, n: ctx.data.n})))}]});
  S['U.S.S. Stargazer, Here and There'] = station(6, ['flying'], {triggers: [C.attack('Create a tapped and attacking Spacecraft Illusion until end of combat', async ctx => {
    const made = await ctx.g.makeTokens(illusion, ctx.you, {tapped: true, chooseAttacking: (g, c) => g.chooseAttackingDestination(ctx.you, null, c, ctx.src.name)});
    for (const c of made) C.delayed(ctx, c, 'exile', {on: 'endCombat'});
  }, {filter: (g, c, d) => d.card === c && (c.counters.charge || 0) >= 6})]});
  S['Malfunctioning Holodeck'] = {ward: {mana: '{2}'}, triggers: [C.enterTrigger('Exile an opposing nonland permanent until Holodeck leaves', ctx => M.OracleV8Linked.run(ctx, {action: 'linked-exile-until', target: 'targets'}, {sameSource: C.same, subjects: ctx => C.flat(ctx.targets)}), {targets: [T.permanent((g, c, p) => c.ctrl !== p && !c.is('Land'))]})]};
  M.StarTrekFederation = {seek, station, officer, illusion};
})();
