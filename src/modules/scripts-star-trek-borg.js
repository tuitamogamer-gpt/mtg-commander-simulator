'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, C = M.FRC, S = M.SCRIPTS, T = M.T, G = M.Game.prototype;
  const ST = M.StarTrek ||= {};
  const artifactCreature = c => c.is('Artifact') && c.is('Creature');
  const own = (g, p) => g.creatures(p).filter(artifactCreature);
  const put = (ctx, c, kind, n = 1) => ctx.g.putCountersV91(c, kind, n, {by: ctx.you});
  const team = (apply, cond) => ({...(cond ? {cond} : {}), apply: (g, s, bf) => {
    for (const c of bf) if (c.ctrl === s.ctrl && artifactCreature(c)) apply(g, c, s);
  }});
  const lord = (n, keywords = [], cond) => team((g, c) => {
    c.cur.power += n; c.cur.toughness += n; for (const kw of keywords) c.cur.kw.add(kw);
  }, cond);
  const borg = C.registerToken('trcBorg', C.token('Borg', ['Borg'], 1, 1, [], [], {types: ['Artifact', 'Creature']}));
  const make = (ctx, n = 1) => C.make(ctx, borg, Math.max(0, n));
  const assimilation = () => ({types: ['Artifact', 'Creature'], subtypes: ['Borg'], retainTypes: true, replaceCreatureSubtypes: true});
  async function assimilate(ctx, card) {
    if (!card) return false;
    if (card.zone === 'battlefield') {
      if (card.phasedOut) return false;
      M.OracleV8Control.gain(ctx.g, card, ctx.you);
      ctx.g.addOracleAnimation(card, assimilation());
      await put(ctx, card, '+1/+1');
      return true;
    }
    return ctx.g.putPermanentOntoBattlefield(card, ctx.you, {
      entryAnimation: assimilation(), additionalCounters: {'+1/+1': 1}, additionalCounterBy: ctx.you,
    });
  }
  ST.assimilate = assimilate; ST.borg = borg;
  // Use the station compiler's exact power/LKI and source-version contracts.
  const station = (threshold, creature = true) => {
    const script = {};
    if (!M.applyOracleMechanic(script, {kind: 'mechanic-station-v9', threshold})) throw Error('Station unavailable');
    if (!creature) delete script.dynTypes;
    return script;
  };
  const tier = n => (g, s) => (s.counters.charge || 0) >= n;
  const combatTrigger = (desc, run) => ({on: 'damageToPlayer', desc,
    filter: (g, s, d) => d.src === s && d.combat && d.n > 0, run});
  const grantHit = trigger => ({statics: [team((g, c) => c.cur.extraTriggers.push(trigger))]});

  S['The Borg Queen'] = {statics: [lord(2)], triggers: C.both('Assimilate an opponent’s first exiled creature', async ctx => {
    const p = ctx.targets[0], rest = [];
    for (const c of p.library.slice().reverse()) {
      await ctx.g.move(c, 'exile', {revealFromLibrary: true, revealSource: ctx.src, revealController: ctx.you});
      if (c.zone !== 'exile') continue;
      if (c.is('Creature')) {await assimilate(ctx, c); break;}
      rest.push(C.row(c));
    }
    await C.randomBottom(ctx, rest.filter(C.current).map(r => r.card), p);
  }, {targets: [T.opponent()]})};
  S['Locutus of Borg'] = {kws: ['lifelink'], ...grantHit(combatTrigger('Create a Borg', ctx => make(ctx)))};
  S['Co-Option Adjutant'] = grantHit(combatTrigger('Draw a card', ctx => C.draw(ctx)));
  S['Supplementation Node'] = grantHit(combatTrigger('Put a +1/+1 counter on this creature', ctx => C.same(ctx) && put(ctx, ctx.src, '+1/+1')));
  S['Hive Mind Coprocessor'] = grantHit(combatTrigger('You may pay 1 life to draw a card', async ctx => {
    if (ctx.g.canPayLife(ctx.you, 1) && await C.yes(ctx, 'Pay 1 life to draw a card?')) {
      await ctx.g.loseLife(ctx.you, 1, ctx.src.name); await C.draw(ctx);
    }
  }));
  S['Borg Incursion'] = {resolve: async ctx => {
    await make(ctx, 2); const color = await C.color(ctx);
    for (const c of own(ctx.g, ctx.you)) C.protection(ctx, c, color);
  }};
  S['Emergency Regeneration'] = {resolve: ctx => {
    for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact'))) C.grant(ctx, c, ['hexproof', 'indestructible'], 'eot');
  }};
  S['Join the Collective'] = {resolve: async ctx => {
    // Count successful destruction events, including exile replacements; a
    // shield, regeneration or indestructible never contributes to this list.
    const previous = ctx.g.trcDestroyed, records = ctx.g.trcDestroyed = [];
    try {await ctx.g.destroyMany(ctx.g.creatures(), {source: ctx.src});}
    finally {ctx.g.trcDestroyed = previous;}
    await make(ctx, records.filter(s => !s.types.includes('Artifact')).length);
  }};
  S['Korok, Liberated Rage'] = {triggers: [C.attack('Battlefront — strengthen your creatures', ctx => {
    const n = ST.opponentsAttacked(ctx.g, ctx.you).length;
    for (const c of ctx.g.creatures(ctx.you)) C.buff(ctx, c, n, n);
  })]};
  S['Maturation Chamber'] = {triggers: [C.trigger('cast', 'Put a charge counter on Maturation Chamber', ctx => C.same(ctx) && put(ctx, ctx.src, 'charge'), {
    filter: (g, s, d) => d.player === s.ctrl && g.castHasType(d.card, d.so?.castOpts || {}, 'Artifact'),
  })], abilities: [{label: 'Create a Borg for each charge counter', sorcery: true, cost: {mana: '{4}', tap: true},
    run: ctx => make(ctx, (C.same(ctx) ? ctx.src : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion))?.counters.charge || 0)}]};
  S['Stratagem Emulator'] = {triggers: [C.death('Create Borg equal to this creature’s power', ctx => make(ctx, ctx.data.snap.power))]};
  S['Type-03 Borg Vessel'] = {...station(7), costMods: [(g, s, {player, card, castOpts}) => player === s.ctrl && g.castHasType(card, castOpts, 'Artifact') ? -1 : 0],
    statics: [{cond: tier(7), apply: (g, s) => s.cur.kw.add('flying')}],
    triggers: [C.trigger('cast', 'Create a Borg', ctx => make(ctx), {filter: (g, s, d) => d.player === s.ctrl && tier(7)(g, s)})]};
  const reactorMana = {cost: {tap: true}, produce: [{C: 1}], restrictAbilities: true,
    restrict: (g, action) => !!action?.card && (action.isAbility ? action.card.is('Artifact') :
      !action.isSpecialAction && !action.foretellAction && !action.turnFaceUp && g.castHasType(action.card, action.castOpts || {}, 'Artifact'))};
  S['Ambulatory Reactor'] = {statics: [team((g, c, s) => c.cur.extraMana.push({...reactorMana,
    oracleNativeManaGrantV67: {sourceIid: s.iid, sourceVersion: s.zoneVersion, operation: 'trc-reactor'}}))]};
  S['Borg Scout Sphere'] = {...station(6), triggers: [C.enterTrigger('Draw a card', ctx => C.draw(ctx))], statics: [lord(0, ['flying'], tier(6))]};
  S['Gift of Perfection'] = {resolve: async ctx => {
    const groups = [];
    for (const p of ctx.you.opponents(ctx.g)) groups.push({p, ...await C.revealUntil(ctx, p, c => c.is('Creature'))});
    const pool = groups.flatMap(r => r.hits), [chosen] = await C.choose(ctx.g, ctx.you, pool, Math.min(1, pool.length), 1, 'Choose a revealed creature to assimilate');
    if (chosen) await assimilate(ctx, chosen);
    for (const {p, revealed} of groups) await C.randomBottom(ctx, revealed.filter(c => c !== chosen && c.zone === 'library'), p);
  }};
  S['Optimization Annex'] = {trcChargeAdder: true};
  S['Seven of Nine, Tertiary Adjunct'] = {abilities: [{label: 'Draw, then discard; a nonland discard charges an artifact', cost: {tap: true}, run: async ctx => {
    await C.draw(ctx);
    const [c] = await C.choose(ctx.g, ctx.you, ctx.you.hand, Math.min(1, ctx.you.hand.length), 1, 'Discard a card', 'discard');
    if (!c) return;
    const nonland = !c.is('Land'); await ctx.g.discard(ctx.you, [c]);
    if (nonland) ctx.g.queueTrigger({src: ctx.src, ctrl: ctx.you, sourceZoneVersion: ctx.sourceZoneVersion,
      name: 'Seven of Nine — put two charge counters on up to one artifact',
      targets: [T.permanent((g, c) => c.is('Artifact'), {count: 1, min: 0, upTo: true})],
      run: async next => {for (const c of C.flat(next.targets)) await put(next, c, 'charge', 2);}});
  }}]};
  S['Transwarp Hub'] = {...station(3, false), triggers: [C.enterTrigger('Mill five and take up to two of those artifacts', async ctx => {
    const rows = (await ctx.g.mill(ctx.you, 5)).map(C.row), pool = rows.filter(C.current).map(r => r.card).filter(c => c.is('Artifact'));
    const cards = await C.choose(ctx.g, ctx.you, pool, 0, 2, 'Put up to two milled artifacts into your hand');
    for (const c of cards) await ctx.g.move(c, 'hand');
  })], abilities: [...station(3, false).abilities, {label: 'A creature cannot be blocked this turn', cond: tier(3), cost: {tap: true}, targets: [T.creature()],
    run: ctx => C.effectOn(ctx, ctx.targets[0], (g, c) => {c.cur.unblockable = true;})}]};
  const voxGrant = ctx => ctx.g.untilEffects.push({kind: 'trcUndaunted', expires: 'eot', player: ctx.you, artifactCreature: true, spacecraft: true});
  S['Võx, Child of the Collective'] = {triggers: [C.enterTrigger('Your next artifact creature and Spacecraft have undaunted', voxGrant),
    ...['precombatMain', 'postcombatMain'].map(on => C.trigger(on, 'Your next artifact creature and Spacecraft have undaunted', voxGrant,
      {filter: (g, s, d) => d.player === s.ctrl && d.ordinal === 1}))]};
  const wounded = (g, c) => c.meta.trcBattlefieldGrave?.turn === g.turnNo && c.meta.trcBattlefieldGrave.version === c.zoneVersion;
  S['Assimilate the Wounded'] = {targets: (g, s, opts = {}, caster = opts.player || s.ctrl) => caster.opponents(g).map(p => ({zone: 'graveyard', what: 'card', anyGraveyard: true, count: 1, min: 0, upTo: true,
    filter: (game, c) => c.owner === p && c.is('Creature') && wounded(game, c)})), resolve: async ctx => {
    await ctx.g.withBattlefieldEntryBatch(async () => {for (const c of C.flat(ctx.targets)) await assimilate(ctx, c);});
  }};
  S['Assimilation Assessor'] = {triggers: [C.enterTrigger('Exile target opponent’s graveyard', async ctx => {
    const cards = ctx.targets[0].graveyard.slice(); await ctx.g.moveGraveyardBatch(cards, 'exile');
    ctx.c1719LinkState.push(...cards.filter(c => c.zone === 'exile').map(C.row));
  }, {targets: [T.opponent()], prepareTargets: C.prepareLink('trcAssessor')}), C.attack('Assimilate a creature exiled with this creature', async ctx => {
    const pool = C.linked(ctx.c1719LinkState).map(r => r.card).filter(c => c.is('Creature'));
    const [c] = await C.choose(ctx.g, ctx.you, pool, Math.min(1, pool.length), 1, 'Choose an exiled creature to assimilate'); if (c) await assimilate(ctx, c);
  }, {prepareTargets: C.prepareLink('trcAssessor')})]};
  S['Battle of Wolf 359'] = {resolve: ctx => {const n = own(ctx.g, ctx.you).length; for (const c of ctx.g.creatures().filter(c => !c.is('Artifact'))) C.buff(ctx, c, -n, -n);}};
  const extraction = {on: 'blocks', desc: 'The blocker gets -1/-1 this turn', filter: (g, s, d) => d.attacker === s,
    prepareTargets: ctx => {ctx.trcBlocker = C.row(ctx.data.blocker);}, run: ctx => C.current(ctx.trcBlocker) && C.buff(ctx, ctx.trcBlocker.card, -1, -1)};
  S['Extraction Integrant'] = {statics: [team((g, c) => {c.cur.kw.add('menace'); c.cur.extraTriggers.push(extraction);})]};
  S['Reclamation Specialist'] = {abilities: [{label: 'Sacrifice an artifact creature: draw a card', cost: {mana: '{1}', sac: (g, c) => artifactCreature(c)}, run: ctx => C.draw(ctx)}]};
  S['The Best of Both Worlds'] = {saga: [
    {targets: [T.creature({filter: (g, c, p) => c.ctrl !== p && !c.is('Artifact')})], prepareTargets: C.prepareLink('trcSaga'), run: async ctx => {
      const c = ctx.targets[0]; if (await assimilate(ctx, c)) ctx.c1719LinkState.push(C.row(c));
    }},
    {run: ctx => {for (const c of own(ctx.g, ctx.you)) C.buff(ctx, c, 2, 2);}},
    {prepareTargets: C.prepareLink('trcSaga'), run: async ctx => {
      for (const r of ctx.c1719LinkState.filter(C.current)) {
        const c = r.card, version = c.zoneVersion; await ctx.g.move(c, 'exile');
        if (!c.isToken && c.zone === 'exile' && c.zoneVersion === version + 1) await ctx.g.putPermanentOntoBattlefield(c, c.owner);
      }
    }},
  ]};
  const attacking = g => g.creatures().filter(c => c.attacking).length;
  S['Collective Override'] = C.modalSpell({pick: (g, p) => g.bf().some(c => c.ctrl === p && c.commander) ? 'any' : 1, min: 1, list: [
    {label: 'Create a Borg for each attacking creature', run: ctx => make(ctx, attacking(ctx.g))},
    {label: 'Draw a card for each attacking creature', run: ctx => C.draw(ctx, attacking(ctx.g))},
  ]});
  S['Deliver from Chaos'] = {targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Creature'))], resolve: async ctx => {
    const c = ctx.targets[0], n = c.mv; await ctx.g.move(c, 'exile'); await make(ctx, n);
  }};
  S['Hugh, First of Many'] = {trcReplicate: true};
  S['Jurati, Cordial Queen'] = {triggers: [C.trigger('oracleDamageToObject', 'Copy an artifact token you control', ctx => C.copy(ctx, ctx.targets[0]), {
    filter: (g, s, d) => d.hits.some(h => h.combat && h.n > 0 && h.target instanceof M.Player && h.sourceSnap?.ctrl === s.ctrl && h.sourceSnap.types.includes('Artifact') && h.sourceSnap.types.includes('Creature')),
    targets: [T.permanent((g, c, p) => c.ctrl === p && c.is('Artifact') && c.isToken)],
  })]};
  S['One, Borg Evolved'] = {statics: [team((g, c) => {for (const kw of ['flying', 'double strike', 'vigilance', 'menace', 'lifelink']) c.cur.kw.add(kw); g.grantWard(c, {mana: '{2}'});})]};
  S['Class-4 Tactical Cube'] = {...station(7), triggers: [C.enterTrigger('Create two Borg', ctx => make(ctx, 2))],
    statics: [{cond: tier(7), apply: (g, s) => s.cur.kw.add('flying')}, lord(1, [], tier(7))]};
  const commanderMana = (a, ownerIndex) => !!a?.card && !a.isAbility && !a.isSpecialAction && !a.foretellAction && !a.turnFaceUp && a.card.commander && a.card.owner.idx === ownerIndex;
  S["Queen's Diamond"] = {...station(8), producesColors: ['W', 'U', 'B', 'R', 'G'], mana: {cost: {tap: true},
    produce: (g, s) => ['W', 'U', 'B', 'R', 'G'].map(color => ({[color]: s.counters.charge || 0})), restrictAbilities: true,
    restrict: (g, a, source) => commanderMana(a, source.ctrl.idx),
    freezeRestrictV20: (g, source) => {const ownerIndex = source.ctrl.idx; return (game, action) => commanderMana(action, ownerIndex);}},
    statics: [{cond: tier(8), apply: (g, s) => {for (const k of ['flying', 'vigilance', 'haste']) s.cur.kw.add(k);}}]};
  S['Reconnaissance Partition'] = {etbCounters: {kind: 'charge', n: 2}, abilities: [{label: 'Remove a counter: find a basic land or draw',
    cost: {tap: true, oracleCounterPayment: {n: 1, kinds: null, self: true, among: false}}, modes: {pick: 1, list: [
      {label: 'Find a basic land tapped', run: ctx => C.search(ctx, ctx.you, c => c.is('Land') && c.def.super.includes('Basic'), 1, 'battlefield', true)},
      {label: 'Draw a card', run: ctx => C.draw(ctx)},
    ]}}]};
  S['Shore Leave Planet'] = {entersTapped: true, mana: {cost: {tap: true}, produce: [{U: 1}]}, abilities: [{label: 'Become a nonlegendary Robot artifact copy this turn', cost: {mana: '{4}{U}'}, targets: [T.yourCreature()], run: ctx => {
    if (!C.same(ctx)) return; const d = C.snapshotCopy(ctx.targets[0]);
    M.OracleV8Copies.applyCopy(ctx.g, ctx.src, {...d, super: d.super.filter(t => t !== 'Legendary'), types: [...new Set([...d.types, 'Artifact'])], subtypes: [...new Set([...d.subtypes, 'Robot'])]}, {duration: 'eot'}); ctx.g.recalc();
  }}]};
  S['Command Subadjunct'] = {statics: [lord(0, ['vigilance'])]};
  S['Conquest Mission'] = {triggers: [C.enterTrigger('Add a quest counter and create Borg', async ctx => {
    if (C.same(ctx)) await put(ctx, ctx.src, 'quest');
    const snap = C.same(ctx) ? ctx.src : ctx.src.battlefieldLKI?.get(ctx.sourceZoneVersion);
    await make(ctx, (snap?.counters.quest || 0) >= 6 ? 2 : 1);
  }, {filter: (g, s, d) => d.card.ctrl === s.ctrl && d.card.is('Artifact') && !d.card.isToken})]};
  S['Locutus, the One Who Speaks'] = {statics: [lord(1)], handAbility: {label: 'Discard: deal 2 to a creature and gain 2 life', cost: '{W}{B}', targets: [T.creature()], run: async ctx => {
    await ctx.g.damageAny(ctx.src, ctx.targets[0], 2); await ctx.g.gainLife(ctx.you, 2, ctx.src);
  }}};

  const emit = G.emit;
  G.emit = function (on, data) {
    if (on === 'destroyedV74' && this.trcDestroyed) this.trcDestroyed.push(data.snap);
    if (on === 'cardsToGraveyard') for (let i = 0; i < data.cards.length; i++) {
      const c = data.cards[i]; if ((data.froms?.[i] || data.from) === 'battlefield' && c.zone === 'graveyard') c.meta.trcBattlefieldGrave = {turn: this.turnNo, version: c.zoneVersion};
    }
    if (on === 'cast') for (const e of this.untilEffects.filter(e => e.kind === 'trcUndaunted' && e.player === data.player)) {
      const opts = data.so?.castOpts || {};
      if (this.castHasType(data.card, opts, 'Artifact') && this.castHasType(data.card, opts, 'Creature')) e.artifactCreature = false;
      if (this.castDefinition(data.card, opts).subtypes?.includes('Spacecraft')) e.spacecraft = false;
    }
    return emit.call(this, on, data);
  };
  const spellCost = G.spellCost;
  G.spellCost = function (p, c, opts = {}) {
    const cost = spellCost.call(this, p, c, opts), d = this.castDefinition(c, opts);
    const n = this.untilEffects.filter(e => e.kind === 'trcUndaunted' && e.player === p).reduce((n, e) => n +
      (e.artifactCreature && this.castHasType(c, opts, 'Artifact') && this.castHasType(c, opts, 'Creature') ? 1 : 0) +
      (e.spacecraft && d.subtypes?.includes('Spacecraft') ? 1 : 0), 0) * p.opponents(this).length;
    if (!n) return cost;
    const left = cost.generic - n; return {...cost, generic: Math.max(0, left), xReduction: (cost.xReduction || 0) + Math.max(0, -left)};
  };
  const replicate = M.C1920.replicatePayments;
  M.C1920.replicatePayments = async (g, p, c, opts, cost, x) => {
    const plans = await replicate(g, p, c, opts, cost, x);
    if (!plans || !g.castHasType(c, opts, 'Artifact')) return plans;
    for (const source of g.bf().filter(s => s.ctrl === p && C.live(s) && s.def.trcReplicate)) {
      const combined = n => ({...cost, generic: cost.generic + 2 * n, pips: cost.pips.concat(Array.from({length: n}, () => ['U']))});
      let low = 0, high = Math.floor(g.maxAffordableX(p, {...cost, x: 1}, c, {castOpts: opts}) / 3) + 1;
      while (low + 1 < high) {const mid = low + Math.floor((high - low) / 2); if (g.canPayMana(p, combined(mid), {card: c, castOpts: opts}, {xVal: x})) low = mid; else high = mid;}
      if (!low) continue;
      const n = await p.controller.decide(g, {type: 'chooseX', min: 0, max: low, card: c, prompt: 'Hugh: replicate {2}{U} — how many times?', aiHint: {kind: 'replicate', card: c}});
      if (!Number.isSafeInteger(n) || n < 0 || n > low) return null;
      if (n) {const next = combined(n); cost.generic = next.generic; cost.pips = next.pips; plans.push({count: n, source: {iid: source.iid, version: source.zoneVersion, controller: p.idx}});}
    }
    return plans;
  };
})();
