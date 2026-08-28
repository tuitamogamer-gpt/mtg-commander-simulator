// ===== scripts-quandrix.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// QUANDRIX UNLIMITED (SOC) — commander: Zimone, Infinite Analyst
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const hasX = cost => /\{X\}/.test(String(cost || ''));
  const spellCost = (card, so) => so?.castOpts?.adventure && card.def.adventure ? card.def.adventure.cost : card.def.cost;
  const isXSpell = (card, so) => !!card && hasX(spellCost(card, so));
  const xCasts = p => p.turnState.spellsCastList.filter(e => isXSpell(e.card, e.so)).length;
  const firstX = (self, d) => d.player === self.ctrl && isXSpell(d.card, d.so) && xCasts(self.ctrl) === 1;
  const flat = value => Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  const token = (name, subtypes, extra = {}) => Object.assign({
    name, cost: null, super: [], types: ['Creature'], subtypes, power: '0', toughness: '0',
    oracle: '', kws: [], isTokenDef: true, colorsOverride: ['G', 'U'],
  }, extra);
  TK.fractalGU ||= token('Fractal', ['Fractal']);
  TK.primoIndivisible ||= token('Primo, the Indivisible', ['Fractal'], { super: ['Legendary'] });

  async function fractal(g, p, n, primo = false) {
    const [made] = await g.makeTokens(primo ? TK.primoIndivisible : TK.fractalGU, p);
    if (made && n > 0) g.addCounters(made, '+1/+1', n, false, p);
    return made;
  }
  function prepare(g, source, def) {
    if (source.meta.prepared || source.zone !== 'battlefield') return null;
    const copy = new MTG.CardInst(Object.assign({ super: [], subtypes: [], kws: [], oracle: '', xCost: hasX(def.cost) }, def), source.ctrl);
    copy.isCopySpell = true; copy.zone = 'exile';
    copy.meta = { preparedBy: source.iid, playableBy: source.ctrl, playableUntil: Number.MAX_SAFE_INTEGER,
      playableCondition: () => source.zone === 'battlefield' && source.meta.prepared };
    source.ctrl.exile.push(copy); source.meta.prepared = true; source.meta.preparedCopy = copy.iid;
    g.lg(`${source.name} je prepared: ${copy.name} je spreman u egzilu.`);
    return copy;
  }
  async function distribution(ctx, total, targets, label) {
    if (!total) return [];
    if (!targets.length || targets.length > total) return false;
    const out = []; let left = total;
    for (let i = 0; i < targets.length; i++) {
      const max = left - (targets.length - i - 1);
      const raw = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseX', min: 1, max, card: ctx.src,
        prompt: `${label}: ${targets[i].name} (${left} preostalo)`,
        allocation: { kind: 'counters', source: ctx.src, total, targets, assigned: out.slice(), index: i, left },
        aiHint: { kind: 'counterDistribution', card: ctx.src, target: targets[i], left },
      });
      const n = Math.max(1, Math.min(Number(raw) || 1, max)); out.push({ iid: targets[i].iid, n }); left -= n;
    }
    return left === 0 ? out : false;
  }
  function basePT(g, cards, power, toughness, kind) {
    const ids = cards.map(c => ({ iid: c.iid, timestamp: c.timestamp }));
    g.untilEffects.push({ expires: 'eot', kind, apply: (g2, bf) => {
      for (const id of ids) {
        const c = bf.find(x => x.iid === id.iid && x.timestamp === id.timestamp); if (!c) continue;
        const plus = (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
        c.cur.basePower = power; c.cur.baseToughness = toughness;
        c.cur.power = power + plus; c.cur.toughness = toughness + plus - (c.counters['-0/-1'] || 0);
      }
    }}); g.recalc();
  }
  async function putLand(g, p, tapped, prompt) {
    const pool = p.hand.filter(c => c.is('Land')); if (!pool.length) return null;
    const pick = await p.controller.decide(g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt, aiHint: { kind: 'putLand', tapped } });
    if (!pick[0] || !pool.includes(pick[0])) return null;
    await g.move(pick[0], 'battlefield', { ctrl: p, tapped }); return pick[0];
  }
  async function taxCounter(ctx, so, amount) {
    const g = ctx.g; if (!so || !g.stack.includes(so) || MTG.isUncounterable(g, so)) return false;
    const cost = U.parseCost(`{${amount}}`), payer = so.ctrl;
    if (g.canPayMana(payer, cost)) {
      const yes = await payer.controller.decide(g, { type: 'chooseOption', prompt: `Plati {${amount}} da spasiš ${so.name}?`,
        options: [{ key: 'yes', label: 'Plati' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'taxCounter', amount } });
      if (yes === 'yes' && await g.payMana(payer, cost)) return false;
    }
    return g.counterStackObject(so, { source: ctx.src });
  }
  function moveCounters(g, from, to, by) {
    let n = 0; if (!from || !to) return n;
    for (const [kind, amount] of Object.entries(from.counters || {})) if (amount > 0) {
      g.removeCounters(from, kind, amount); g.addCounters(to, kind, amount, false, by); n += amount;
    }
    return n;
  }
  function shuffleGy(g, cards) {
    const owners = new Set();
    for (const c of cards || []) if (c.zone === 'graveyard') {
      c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1); c.zone = 'library'; c.owner.library.push(c); owners.add(c.owner);
    }
    for (const p of owners) U.shuffle(p.library, g.rnd);
  }
  const xEtb = multiplier => ({ kind: '+1/+1', n: (g, c) => multiplier * (c.castMeta?.x || 0) });

  SC['Zimone, Infinite Analyst'] = {
    costMods: [(g, self, q) => q.player === self.ctrl && isXSpell(q.card, { castOpts: q.castOpts || {} }) && !xCasts(self.ctrl)
      ? -(self.counters['+1/+1'] || 0) : 0],
    triggers: [{ on: 'cast', desc: 'First X spell: two counters', filter: (g, self, d) => firstX(self, d),
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 2, false, ctx.you); } }],
  };
  SC['Stonecoil Serpent'] = { xCost: true, etbCounters: xEtb(1), statics: [{ apply: (g, self) => {
    self.cur.protectionFrom.push((g2, source) => source.colors?.length > 1);
  }}] };
  SC['Elusive Otter'] = {
    adventure: { name: "Grove's Bounty", cost: '{X}{G}', altCostStr: '{X}{G}', types: 'Sorcery', xCost: true,
      targets: (g, card, castOpts) => [T.yourCreature({ count: castOpts.xVal || 0, min: 0, upTo: true, prompt: "Grove's Bounty: izaberi do X tvojih stvorenja", aiHint: { goal: 'buff' } })],
      prepareTargets: async ctx => { const d = await distribution(ctx, ctx.so.x || 0, flat(ctx.targets[0]), "Grove's Bounty"); if (d === false) return false; ctx.so.counterDistribution = d; },
      resolve: async ctx => { for (const e of ctx.so.counterDistribution || []) { const c = ctx.g.byIid(e.iid); if (c?.zone === 'battlefield') ctx.g.addCounters(c, '+1/+1', e.n, false, ctx.you); } } },
    blockRestriction: (g, blocker, attacker) => attacker.name !== 'Elusive Otter' || blocker.power >= attacker.power,
  };
  SC['Goldvein Hydra'] = { xCost: true, etbCounters: xEtb(1), triggers: [{ on: 'dies', desc: 'Tapped Treasurei', filter: (g, self, d) => d.card === self,
    run: async ctx => { const n = Math.max(0, ctx.data.snap.power || 0); if (n) await ctx.g.makeTokens('treasure', ctx.you, { n, tapped: true }); } }] };
  SC['Ingenious Prodigy'] = { xCost: true, kws: ['skulk'], etbCounters: xEtb(1), triggers: [{ on: 'upkeep', opt: true, desc: 'Skini counter i vuci',
    filter: (g, self, d) => d.player === self.ctrl && (self.counters['+1/+1'] || 0) > 0,
    run: async ctx => { if (ctx.src.counters['+1/+1'] > 0) { ctx.g.removeCounters(ctx.src, '+1/+1', 1); await ctx.g.draw(ctx.you, 1); } } }] };
  SC['Kinetic Ooze'] = { xCost: true, etbCounters: xEtb(1), triggers: [{ on: 'etb', desc: 'X ETB', filter: etbSelf,
    targets: (g, self) => { const x = self.castMeta?.x || 0, out = [T.permanent((g2, c) => (c.is('Artifact') || c.is('Enchantment')) && c.mv <= x,
      { upTo: true, prompt: `Uništi MV ≤ ${x}`, aiHint: { goal: 'removal' } })];
      if (x >= 10) out.push(T.yourCreature({ count: 999, upTo: true, prompt: 'Dupliraj countere na drugim stvorenjima',
        filter: (g2, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && c !== src, aiHint: { goal: 'buff' } })); return out; },
    run: async ctx => { const x = ctx.src.castMeta?.x || 0; if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); if (x >= 5) await ctx.g.draw(ctx.you, 1);
      if (x >= 10) for (const c of flat(ctx.targets[1])) { const n = c.counters['+1/+1'] || 0; if (n) ctx.g.addCounters(c, '+1/+1', n, false, ctx.you); } } }] };
  SC['Benevolent Hydra'] = { xCost: true, etbCounters: xEtb(1), plusCountersAdjust: (n, g, c, self) => c.ctrl === self.ctrl && c !== self ? n + 1 : n,
    abilities: [{ label: 'Counter na drugo stvorenje', cost: { tap: true, rmCounter: { kind: '+1/+1', n: 1 } },
      targets: [T.yourCreature({ filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.ctrl === ctrl && c !== src, prompt: 'Drugo tvoje stvorenje', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1, false, ctx.you); }, aiScore: () => 1.5 }] };
  SC['Primordial Hydra'] = { xCost: true, etbCounters: xEtb(1), statics: [{ apply: (g, self) => { if ((self.counters['+1/+1'] || 0) >= 10) self.cur.kw.add('trample'); } }],
    triggers: [{ on: 'upkeep', desc: 'Dupliraj countere', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { const n = ctx.src.counters['+1/+1'] || 0; if (n) ctx.g.addCounters(ctx.src, '+1/+1', n, false, ctx.you); } }] };
  async function apprentice(ctx) {
    const top = ctx.you.library.slice(-3).reverse(), lands = top.filter(c => c.is('Land'));
    const pick = lands.length ? await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Land iz top 3', aiHint: { kind: 'impulseLand' } }) : [];
    const land = pick[0] && lands.includes(pick[0]) ? pick[0] : null;
    for (const c of top) ctx.you.library.splice(ctx.you.library.indexOf(c), 1);
    if (land) { land.zone = 'hand'; ctx.you.hand.push(land); }
    const rest = top.filter(c => c !== land), order = [];
    while (rest.length) { const p = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: rest.slice(), min: 1, max: 1, prompt: 'Poredaj na dno', aiHint: { kind: 'bottomOrder' } }); const c = p[0] && rest.includes(p[0]) ? p[0] : rest[0]; order.push(c); rest.splice(rest.indexOf(c), 1); }
    for (const c of order) c.zone = 'library'; ctx.you.library.unshift(...order);
  }
  SC['Quandrix Apprentice'] = { triggers: [
    { on: 'castIS', desc: 'Magecraft land', filter: (g, self, d) => d.player === self.ctrl, run: apprentice },
    { on: 'spellCopied', desc: 'Magecraft land', filter: (g, self, d) => d.ctrl === self.ctrl && d.isInstantSorcery, run: apprentice },
  ] };
  SC['Steelbane Hydra'] = { xCost: true, etbCounters: xEtb(1), abilities: [{ label: 'Uništi artifact/enchantment', cost: { mana: '{2}{G}', rmCounter: { kind: '+1/+1', n: 1 } },
    targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Artifact/enchantment', aiHint: { goal: 'removal' } })],
    run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); }, aiScore: () => 4 }] };

  SC['Striding Shotcaller'] = { triggers: [{ on: 'combatDamageGroupToPlayer', desc: 'Prepare Run the Play',
    filter: (g, self, d) => d.cards.some(c => c.ctrl === self.ctrl), run: async ctx => { prepare(ctx.g, ctx.src, {
      name: 'Run the Play', cost: '{X}{G}{U}', types: ['Sorcery'], oracle: 'Put a +1/+1 counter on each of up to X target creatures. Those creatures gain flying until end of turn. Draw a card.',
      targets: (g, c, o) => [T.creature({ count: o.xVal || 0, upTo: true, prompt: `Do ${o.xVal || 0} stvorenja`, aiHint: { goal: 'buff' } })],
      resolve: async c2 => { for (const c of flat(c2.targets[0])) if (c.zone === 'battlefield') { c2.g.addCounters(c, '+1/+1', 1, false, c2.you); E.grantUntilEOT(c2.g, c, ['flying']); } await c2.g.draw(c2.you, 1); },
    }); } }] };
  SC['The Goose Mother'] = { xCost: true, etbCounters: xEtb(1), triggers: [
    { on: 'etb', desc: 'Foodovi', filter: etbSelf, run: async ctx => { const x = ctx.src.castMeta?.x || 0; if (x) await ctx.g.makeTokens('food', ctx.you, { n: Math.ceil(x / 2) }); } },
    { on: 'attacks', opt: true, desc: 'Food za kartu', filter: (g, self, d) => d.card === self && g.bf().some(c => c.ctrl === self.ctrl && c.hasSub('Food') && g.canSacrifice(c)),
      run: async ctx => { const foods = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.hasSub('Food') && ctx.g.canSacrifice(c)); const p = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: foods, min: 1, max: 1, prompt: 'Žrtvuj Food', aiHint: { kind: 'sacToken' } }); if (p[0]) { await ctx.g.sacrifice(ctx.you, p[0]); await ctx.g.draw(ctx.you, 1); } } },
  ] };
  SC['Zimone, Quandrix Prodigy'] = { abilities: [
    { label: 'Land from hand tapped', cost: { mana: '{1}', tap: true }, run: async ctx => { await putLand(ctx.g, ctx.you, true, 'Zimone: put a land onto the battlefield tapped'); }, aiScore: (g, c, p) => p.hand.some(x => x.is('Land')) ? 3 : 0 },
    { label: 'Draw (two with 8+ lands)', cost: { mana: '{4}', tap: true }, run: async ctx => { await ctx.g.draw(ctx.you, ctx.g.lands(ctx.you).length >= 8 ? 2 : 1); }, aiScore: () => 3 },
  ] };
  SC['Guardian Augmenter'] = { statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.commander && c.is('Creature')) { c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('hexproof'); c.cur.hexproof = true; } } }] };
  SC['Kami of Whispered Hopes'] = { plusCountersAdjust: (n, g, c, self) => c.ctrl === self.ctrl ? n + 1 : n,
    mana: { cost: { tap: true }, produce: (g, c) => c.power > 0 ? COLORS.map(color => ({ [color]: c.power })) : [] } };
  SC['Lifeblood Hydra'] = { xCost: true, etbCounters: xEtb(1), triggers: [{ on: 'dies', desc: 'Život i karte', filter: (g, self, d) => d.card === self,
    run: async ctx => { const n = Math.max(0, ctx.data.snap.power || 0); await ctx.g.gainLife(ctx.you, n, ctx.src); await ctx.g.draw(ctx.you, n); } }] };
  SC['Nev, the Practical Dean'] = { statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && Object.values(c.counters || {}).some(n => n > 0)) c.cur.kw.add('trample'); } }],
    triggers: [{ on: 'cast', desc: 'Prvi X: X countera', filter: (g, self, d) => firstX(self, d), run: async ctx => { const x = ctx.data.so?.x || 0; if (x && ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', x, false, ctx.you); } }] };
  SC['Primo, the Unbounded'] = { xCost: true, etbCounters: xEtb(2), triggers: [{ on: 'combatDamageGroupToPlayer', desc: 'Base-0 Fractal',
    filter: (g, self, d) => d.hits.some(h => h.card.ctrl === self.ctrl && h.card.cur?.basePower === 0),
    run: async ctx => { const n = ctx.data.hits.filter(h => h.card.ctrl === ctx.you && h.card.cur?.basePower === 0).reduce((s, h) => s + Math.max(0, h.n || 0), 0); if (n) await fractal(ctx.g, ctx.you, n); } }] };
  SC['Troyan, Gutsy Explorer'] = { mana: { manual: true, cost: { tap: true }, produce: [{ G: 1, U: 1 }],
    restrictLabel: 'only for MV 5+ or X spells', restrictAbilities: true,
    restrict: (g, forSpell) => !!forSpell?.card && !forSpell.isAbility &&
      (forSpell.card.mv >= 5 || isXSpell(forSpell.card, { castOpts: forSpell.castOpts || {} })) },
    abilities: [{ label: 'Vuci pa odbaci', cost: { mana: '{U}', tap: true }, run: async ctx => { await ctx.g.draw(ctx.you, 1); if (ctx.you.hand.length) { const p = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'cleanupDiscard' } }); if (p[0]) await ctx.g.discard(ctx.you, [p[0]]); } }, aiScore: () => 1 }] };
  SC['Yavimaya Bloomsage'] = { triggers: [{ on: 'endStep', desc: '+1/+1 i Prepare Channel', filter: (g, self, d) => d.player === self.ctrl,
    targets: [T.yourCreature({ prompt: 'Stvorenje za counter', aiHint: { goal: 'buff' } })], run: async ctx => { const c = ctx.targets[0]; if (!c) return; ctx.g.addCounters(c, '+1/+1', 1, false, ctx.you); if (c.power < 7) return;
      prepare(ctx.g, ctx.src, { name: 'Channel', cost: '{G}{G}', types: ['Sorcery'], oracle: 'Until end of turn, any time you could activate a mana ability, you may pay 1 life. If you do, add {C}.',
        resolve: async c2 => { c2.you.channelUntilTurn = c2.g.turnNo; c2.you.channelSource = c2.src; } }); } }] };
  SC['Zimone, All-Questioning'] = { triggers: [{ on: 'endStep', desc: 'Prime Primo', filter: (g, self, d) => d.player === self.ctrl && self.ctrl.turnState.landsEntered > 0 && [2,3,5,7,11,13,17,19,23,29,31].includes(g.lands(self.ctrl).length),
    run: async ctx => { await fractal(ctx.g, ctx.you, ctx.g.lands(ctx.you).length, true); } }] };
  SC['Altered Ego'] = { xCost: true, uncounterable: true, asEnters: async (g, card) => {
    const pool = g.creatures().filter(c => c !== card), pick = pool.length ? await card.ctrl.controller.decide(g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Altered Ego: kopiraj', aiHint: { kind: 'mirrorCopy' } }) : [];
    const target = pick[0] && pool.includes(pick[0]) ? pick[0] : null, x = card.castMeta?.x || 0;
    if (!target) { card.def = Object.assign({}, card.def, { etbCounters: { kind: '+1/+1', n: x } }); return; }
    const base = target.isCopyOf || target.def, baseN = base.etbCounters?.kind === '+1/+1' ? (typeof base.etbCounters.n === 'function' ? base.etbCounters.n(g, card) : base.etbCounters.n || 0) : 0;
    card.isCopyOf = base; card.def = Object.assign({}, base, { etbCounters: { kind: '+1/+1', n: baseN + x } }); if (base.asEnters) await base.asEnters(g, card);
  } };
  SC['Forgotten Ancient'] = { triggers: [
    { on: 'cast', opt: true, desc: '+1/+1', filter: () => true, run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); } },
    { on: 'upkeep', opt: true, desc: 'Premjesti countere', filter: (g, self, d) => d.player === self.ctrl && (self.counters['+1/+1'] || 0) > 0 && g.creatures().some(c => c !== self),
      run: async ctx => { let left = ctx.src.counters['+1/+1'] || 0; const pool = ctx.g.creatures().filter(c => c !== ctx.src), pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 0, max: pool.length, prompt: 'Primaoci countera', aiHint: { goal: 'buff' } });
        for (const c of pick) if (left > 0) { const raw = await ctx.you.controller.decide(ctx.g, { type: 'chooseX', min: 0, max: left, card: ctx.src, prompt: `Counteri za ${c.name}`, aiHint: { kind: 'moveCounters', source: ctx.src, target: c } }); const n = Math.max(0, Math.min(Number(raw) || 0, left)); if (n) { ctx.g.removeCounters(ctx.src, '+1/+1', n); ctx.g.addCounters(c, '+1/+1', n, false, ctx.you); left -= n; } } } },
  ] };
  SC['Owlin Spiralmancer'] = { triggers: [{ on: 'cast', opt: true, desc: 'Kopiraj prvi X', filter: (g, self, d) => firstX(self, d) && d.so && g.stack.includes(d.so),
    run: async ctx => { if (ctx.g.stack.includes(ctx.data.so)) await ctx.g.copySpell(ctx.data.so, ctx.you, { mayNewTargets: true, copySource: ctx.src }); } }] };
  SC['Deekah, Fractal Theorist'] = { triggers: [
    { on: 'castIS', desc: 'Magecraft Fractal', filter: (g, self, d) => d.player === self.ctrl, run: async ctx => { await fractal(ctx.g, ctx.you, ctx.data.mv || 0); } },
    { on: 'spellCopied', desc: 'Magecraft Fractal', filter: (g, self, d) => d.ctrl === self.ctrl && d.isInstantSorcery, run: async ctx => { const so = ctx.data.so; await fractal(ctx.g, ctx.you, so?.card ? U.mv(spellCost(so.card, so), so.x || 0) : 0); } },
  ], abilities: [{ label: 'Token unblockable', cost: { mana: '{3}{U}' }, targets: [T.yourCreature({ filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && c.isToken, prompt: 'Creature token', aiHint: { goal: 'buff' } })],
    run: async ctx => { const c = ctx.targets[0]; if (!c) return; const iid = c.iid, timestamp = c.timestamp; ctx.g.untilEffects.push({ expires: 'eot', kind: 'deekahUnblockable', apply: (g, bf) => { const x = bf.find(y => y.iid === iid && y.timestamp === timestamp); if (x) x.cur.unblockable = true; } }); ctx.g.recalc(); }, aiScore: () => 2 }] };
  SC['Tanazir Quandrix'] = { triggers: [
    { on: 'etb', desc: 'Dupliraj countere', filter: etbSelf, targets: [T.yourCreature({ prompt: 'Dupliraj countere', aiHint: { goal: 'buff' } })], run: async ctx => { const c = ctx.targets[0], n = c?.counters['+1/+1'] || 0; if (n) ctx.g.addCounters(c, '+1/+1', n, false, ctx.you); } },
    { on: 'attacks', opt: true, desc: 'Tanazir P/T', filter: (g, self, d) => d.card === self, run: async ctx => { basePT(ctx.g, ctx.g.creatures(ctx.you).filter(c => c !== ctx.src), ctx.src.power, ctx.src.toughness, 'tanazirPT'); } },
  ] };

  SC['Silkguard'] = { xCost: true,
    targets: (g, c, o) => [T.yourCreature({ count: o.xVal || 0, min: 0, upTo: true, prompt: `Do ${o.xVal || 0} tvojih stvorenja`, aiHint: { goal: 'buff' } })],
    resolve: async ctx => { for (const c of flat(ctx.targets[0])) if (c?.zone === 'battlefield') ctx.g.addCounters(c, '+1/+1', 1, false, ctx.you);
      for (const c of ctx.g.bf().filter(x => x.ctrl === ctx.you && (x.hasSub('Aura') || x.hasSub('Equipment') || x.is('Creature') &&
        (Object.values(x.counters || {}).some(n => n > 0) || (x.attachments || []).some(iid => { const att = ctx.g.byIid(iid); return att?.ctrl === ctx.you && (att.hasSub('Aura') || att.hasSub('Equipment')); }))))) E.grantUntilEOT(ctx.g, c, ['hexproof']); } };
  SC["Tyvar's Stand"] = { xCost: true, targets: [T.yourCreature({ prompt: 'Tvoje stvorenje', aiHint: { goal: 'buff' } })],
    resolve: async ctx => { if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], ctx.x || 0, ctx.x || 0, ['hexproof', 'indestructible']); } };
  SC['Biomass Mutation'] = { xCost: true, resolve: async ctx => { basePT(ctx.g, ctx.g.creatures(ctx.you), ctx.x || 0, ctx.x || 0, 'biomassPT'); } };
  SC['Decisive Denial'] = { modes: { pick: 1, list: [
    { label: 'Fight', targets: [T.yourCreature({ prompt: 'Tvoje za fight', aiHint: { goal: 'fightMine' } }), T.oppCreature({ prompt: 'Protivničko za fight', aiHint: { goal: 'removal' } })] },
    { label: 'Counter noncreature osim {3}', targets: [T.spell((g, so) => so.card && !so.card.is('Creature'), { prompt: 'Noncreature spell', aiHint: { goal: 'counter' } })] },
  ] }, resolve: async ctx => { if (ctx.mode[0] === 0) { const a = ctx.targets[0], b = ctx.targets[1]; if (a && b) { await ctx.g.damageCreature(a, b, a.power, { deferSBA: true }); await ctx.g.damageCreature(b, a, b.power, { deferSBA: true }); await ctx.g.checkSBA(); } } else await taxCounter(ctx, ctx.targets[0], 3); } };
  SC['Quandrix Charm'] = { modes: { pick: 1, list: [
    { label: 'Counter osim {2}', targets: [T.spell(null, { prompt: 'Spell', aiHint: { goal: 'counter' } })] },
    { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
    { label: 'Base 5/5', targets: [T.creature({ prompt: 'Stvorenje base 5/5', aiHint: { goal: 'buff' } })] },
  ] }, resolve: async ctx => { const m = ctx.mode[0], t = ctx.targets[0]; if (m === 0) await taxCounter(ctx, t, 2); else if (m === 1) { if (t) await ctx.g.destroy(t); } else if (t) basePT(ctx.g, [t], 5, 5, 'charmPT'); } };
  SC["Commander's Insight"] = { xCost: true, targets: [T.player({ prompt: 'Ko vuče?', aiHint: { goal: 'drawSelf' } })],
    resolve: async ctx => { const p = ctx.targets[0]; if (p) await ctx.g.draw(p, (ctx.x || 0) + (p.commanderCasts || 0)); } };
  SC['Quandrix Command'] = { modes: { pick: 2, list: [
    { label: 'Bounce creature/planeswalker', targets: [T.permanent((g, c) => c.is('Creature') || c.is('Planeswalker'), { prompt: 'Creature/planeswalker', aiHint: { goal: 'bounce' } })] },
    { label: 'Counter artifact/enchantment spell', targets: [T.spell((g, so) => so.card && (so.card.is('Artifact') || so.card.is('Enchantment')), { prompt: 'Artifact/enchantment spell', aiHint: { goal: 'counter' } })] },
    { label: 'Dva +1/+1 countera', targets: [T.creature({ prompt: 'Stvorenje za countere', aiHint: { goal: 'buff' } })] },
    { label: 'Do tri karte iz groblja', targets: [
      T.player({ prompt: 'Čije groblje?', aiHint: { goal: 'self' } }),
      {
        zone: 'graveyard', anyGraveyard: true, what: 'card', count: 3, min: 0, upTo: true,
        prompt: 'Do tri target karte iz tog groblja', aiHint: { kind: 'graveyardShuffle' },
        dependentFilter: (g, candidate, previousTargets) => {
          const player = previousTargets.flat().find(target => target instanceof MTG.Player);
          return !!player && candidate.owner === player;
        },
      },
    ] },
  ] },
    resolve: async ctx => { let i = 0; for (const m of ctx.mode) { const t = ctx.targets[i++]; if (m === 0) { if (t?.zone === 'battlefield') await ctx.g.move(t, 'hand'); }
      else if (m === 1) { if (t && ctx.g.stack.includes(t)) await ctx.g.counterStackObject(t, { source: ctx.src }); }
      else if (m === 2) { if (t) ctx.g.addCounters(t, '+1/+1', 2, false, ctx.you); } else { const cards = flat(ctx.targets[i++]); shuffleGy(ctx.g, cards); } } } };
  SC['Stroke of Genius'] = { xCost: true, targets: [T.player({ prompt: 'Ko vuče?', aiHint: { goal: 'drawSelf' } })], resolve: async ctx => { if (ctx.targets[0]) await ctx.g.draw(ctx.targets[0], ctx.x || 0); } };
  SC['Eureka Moment'] = { resolve: async ctx => { await ctx.g.draw(ctx.you, 2); await putLand(ctx.g, ctx.you, false, 'Eureka Moment: land (opciono)'); } };
  SC['Nexus Mentality'] = { modes: { pick: (g, p) => g.bf().some(c => c.ctrl === p && c.commander) ? 'any' : 1, min: 1, list: [
    { label: 'Premjesti sve countere', targets: [T.permanent((g, c, ctrl) => !c.is('Land') && c.ctrl === ctrl, { prompt: 'Sa kojeg permanenta?', aiHint: { goal: 'moveCountersFrom' } }), T.permanent((g, c, ctrl) => !c.is('Land') && c.ctrl === ctrl, { differentFromPrevious: true, prompt: 'Na koji permanent?', aiHint: { goal: 'moveCountersTo' } })] },
    { label: 'Ukloni countere i vuci', targets: [T.permanent((g, c, ctrl) => !c.is('Land') && c.ctrl === ctrl, { prompt: 'Permanent za uklanjanje', aiHint: { goal: 'drawCounters' } })] },
  ] }, resolve: async ctx => { let i = 0; for (const m of ctx.mode) if (m === 0) moveCounters(ctx.g, ctx.targets[i++], ctx.targets[i++], ctx.you); else { const c = ctx.targets[i++]; if (!c) continue; let n = 0; for (const [k, v] of Object.entries(c.counters || {})) if (v > 0) { n += v; ctx.g.removeCounters(c, k, v); } if (n) await ctx.g.draw(ctx.you, n); } } };
  SC['Perplexing Test'] = { modes: { pick: 1, list: [{ label: 'Bounce creature tokene' }, { label: 'Bounce nontoken stvorenja' }] },
    resolve: async ctx => { const tokens = ctx.mode[0] === 0; for (const c of ctx.g.creatures().filter(x => x.isToken === tokens).slice()) await ctx.g.move(c, 'hand'); } };
  SC["Zimone's Hypothesis"] = { targets: [T.creature({ upTo: true, prompt: 'Opciono +1/+1 counter', aiHint: { goal: 'buff' } })],
    prepareTargets: async ctx => { const k = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: 'Odd ili even?', options: [{ key: 'odd', label: 'Odd' }, { key: 'even', label: 'Even' }], aiHint: { kind: 'oddEvenBounce' } }); ctx.so.quality = k === 'odd' ? 'odd' : 'even'; },
    resolve: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1, false, ctx.you); const parity = ctx.so.quality === 'odd' ? 1 : 0; for (const c of ctx.g.creatures().filter(x => Math.abs(x.power) % 2 === parity).slice()) await ctx.g.move(c, 'hand'); } };
  SC["Animist's Awakening"] = { xCost: true, resolve: async ctx => { const shown = []; for (let i = 0; i < (ctx.x || 0) && ctx.you.library.length; i++) shown.push(ctx.you.library.pop());
    const lands = shown.filter(c => c.is('Land')), rest = shown.filter(c => !c.is('Land')), entered = []; for (const c of lands) { c.zone = 'nowhere'; await ctx.g.move(c, 'battlefield', { ctrl: ctx.you, tapped: true }); if (c.zone === 'battlefield') entered.push(c); }
    U.shuffle(rest, ctx.g.rnd); for (const c of rest) { c.zone = 'library'; ctx.you.library.unshift(c); } if (ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery')).length >= 2) for (const c of entered) c.tapped = false; ctx.g.recalc(); } };
  SC['Primal Might'] = { xCost: true, targets: [T.yourCreature({ prompt: 'Tvoje za pump/fight', aiHint: { goal: 'fightMine' } }), T.oppCreature({ upTo: true, prompt: 'Do jedno protivničko', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { const a = ctx.targets[0], b = ctx.targets[1]; if (!a) return; E.pumpUntilEOT(ctx.g, a, ctx.x || 0, ctx.x || 0); if (b) { await ctx.g.damageCreature(a, b, a.power, { deferSBA: true }); await ctx.g.damageCreature(b, a, b.power, { deferSBA: true }); await ctx.g.checkSBA(); } } };
  SC['Entrancing Melody'] = { xCost: true, xValues: g => [...new Set(g.creatures().map(c => c.mv))], targets: (g, c, o) => [T.creature({ filter: (g2, x) => x.zone === 'battlefield' && x.is('Creature') && x.mv === (o.xVal || 0), prompt: `Creature MV=${o.xVal || 0}`, aiHint: { goal: 'steal' } })],
    resolve: async ctx => { const c = ctx.targets[0]; if (c?.zone === 'battlefield') { c.ctrl = ctx.you; c.sick = true; c.attacking = null; c.blocking = null; ctx.g.recalc(); } } };
  SC['Expansion Algorithm'] = { xCost: true, resolve: async ctx => { for (let i = 0; i < (ctx.x || 0); i++) await E.proliferate(ctx.g, ctx.you); } };
  SC['Open the Way'] = { xCost: true, xValues: g => Array.from({ length: g.alivePlayers().length + 1 }, (_, i) => i), resolve: async ctx => { const lands = [], rest = [];
    while (ctx.you.library.length && lands.length < (ctx.x || 0)) { const c = ctx.you.library.pop(); (c.is('Land') ? lands : rest).push(c); }
    for (const c of lands) { c.zone = 'nowhere'; await ctx.g.move(c, 'battlefield', { ctrl: ctx.you, tapped: true }); } U.shuffle(rest, ctx.g.rnd); for (const c of rest) { c.zone = 'library'; ctx.you.library.unshift(c); } } };
  SC['Oversimplify'] = { resolve: async ctx => { const totals = new Map(ctx.g.players.map(p => [p, 0])); for (const c of ctx.g.creatures().slice()) { const p = c.ctrl, power = Math.max(0, c.power); await ctx.g.exileCard(c); if (c.zone === 'exile' || c.zone === 'ceased') totals.set(p, totals.get(p) + power); }
    for (const p of ctx.g.alivePlayers()) await fractal(ctx.g, p, totals.get(p) || 0); } };

  SC['Ozolith, the Shattered Spire'] = { plusCountersAdjust: (n, g, c, self) => c.ctrl === self.ctrl && (c.is('Artifact') || c.is('Creature')) ? n + 1 : n,
    cycling: { cost: '{2}' }, abilities: [{ label: '+1/+1 na artifact/creature', cost: { mana: '{1}{G}', tap: true }, sorcery: true,
      targets: [T.permanent((g, c, ctrl) => c.ctrl === ctrl && (c.is('Artifact') || c.is('Creature')), { prompt: 'Tvoj artifact/creature', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1, false, ctx.you); }, aiScore: () => 2 }] };
  SC["Elementalist's Palette"] = { triggers: [{ on: 'cast', desc: 'Dva charge countera', filter: (g, self, d) => d.player === self.ctrl && isXSpell(d.card, d.so),
    run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 2, false, ctx.you); } }], mana: [
      { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
      { cost: { tap: true }, produce: (g, c) => (c.counters.charge || 0) ? [{ C: c.counters.charge }] : [], restrict: (g, forSpell) => !!forSpell?.card && isXSpell(forSpell.card, { castOpts: forSpell.castOpts || {} }) },
    ] };
  SC['Fractal Harness'] = { xCost: true, equip: '{2}', triggers: [
    { on: 'etb', desc: 'Fractal i attach', filter: etbSelf, run: async ctx => { const c = await fractal(ctx.g, ctx.you, ctx.src.castMeta?.x || 0); if (c) await ctx.g.attach(ctx.src, c); } },
    { on: 'attacks', desc: 'Dupliraj countere', filter: (g, self, d) => self.attachedTo === d.card.iid, run: async ctx => { const c = ctx.g.byIid(ctx.src.attachedTo), n = c?.counters['+1/+1'] || 0; if (n) ctx.g.addCounters(c, '+1/+1', n, false, ctx.you); } },
  ] };
  SC['Brass Infiniscope'] = { mana: { cost: { tap: true }, produce: [{ C: 2 }], onProduce: async (g, source, p) => {
    g.delayed.push({ on: 'cast', once: true, expires: 'eot', src: source, ctrl: p, name: 'Brass Infiniscope nagrada',
      filter: (g2, d) => d.player === p && isXSpell(d.card, d.so), run: async ctx => { const x = ctx.data.so?.x || 0; await ctx.g.draw(ctx.you, 1); await ctx.g.gainLife(ctx.you, Math.floor(x / 2), source); } });
  } } };
  SC['Hardened Scales'] = { plusCountersAdjust: (n, g, c, self) => c.ctrl === self.ctrl && c.is('Creature') ? n + 1 : n };
  SC['Mana Bloom'] = { xCost: true, etbCounters: { kind: 'charge', n: (g, c) => c.castMeta?.x || 0 },
    // Za razliku od običnog landa/rocka, aktivacija bez trenutnog plaćanja je
    // strateški bitna: igrač smije ukloniti posljednji counter u tuđem potezu
    // da bi Bloom na svom upkeepu vratio u ruku. Zato je akcija vidljiva.
    mana: { key: 'manaBloom', manual: true, oncePerTurn: true, cost: { rmCounter: { kind: 'charge', n: 1 } }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{ on: 'upkeep', desc: 'Vrati prazni Bloom', filter: (g, self, d) => d.player === self.ctrl && !(self.counters.charge || 0), run: async ctx => {
      // Oracleov "if" je intervening-if: uslov se provjerava pri nastanku i
      // ponovo pri rezoluciji. Stari trigger takođe ne smije vratiti novi
      // battlefield objekat ako je fizička karta u međuvremenu otišla i ušla.
      if (ctx.src.zone === 'battlefield' && ctx.src.zoneVersion === ctx.sourceZoneVersion &&
        !(ctx.src.counters.charge || 0)) await ctx.g.move(ctx.src, 'hand');
    } }] };
  SC['Lattice Library'] = { xCost: true, etbCounters: { kind: 'study', n: (g, c) => c.castMeta?.x || 0 }, triggers: [
    { on: 'etb', desc: 'Fractal', filter: etbSelf, run: async ctx => { await fractal(ctx.g, ctx.you, ctx.src.counters.study || 0); } },
    { on: 'cast', desc: 'Prvi X Fractal', filter: (g, self, d) => firstX(self, d), run: async ctx => { await fractal(ctx.g, ctx.you, ctx.src.counters.study || 0); } },
  ] };
  SC['Unbound Flourishing'] = { triggers: [
    { on: 'cast', desc: 'Dupliraj permanent X', filter: (g, self, d) => d.player === self.ctrl && d.so && !d.card.is('Instant') && !d.card.is('Sorcery') && isXSpell(d.card, d.so),
      run: async ctx => { const so = ctx.data.so; if (so && ctx.g.stack.includes(so)) { so.x *= 2; if (so.card.castMeta) so.card.castMeta.x = so.x; } } },
    { on: 'castIS', desc: 'Kopiraj X spell', filter: (g, self, d) => d.player === self.ctrl && d.so && isXSpell(d.card, d.so) && g.stack.includes(d.so),
      run: async ctx => { if (ctx.g.stack.includes(ctx.data.so)) await ctx.g.copySpell(ctx.data.so, ctx.you, { mayNewTargets: true, copySource: ctx.src }); } },
    { on: 'abilityActivated', desc: 'Kopiraj X ability', filter: (g, self, d) => d.player === self.ctrl && !d.isMana && d.stackObject && d.ability &&
      (d.ability.xCost || hasX(d.ability.cost?.mana)) && d.stackObject.ctx?.x !== undefined,
      run: async ctx => { const so = ctx.data.stackObject; if (ctx.g.stack.includes(so)) await ctx.g.copyStackAbility(so, ctx.you, { mayNewTargets: true }); } },
  ] };

  SC["Alchemist's Refuge"] = { producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] }, abilities: [{ label: 'Spells imaju flash', cost: { mana: '{G}{U}', tap: true },
    run: async ctx => { ctx.you.tempFlashFilters ||= []; ctx.you.tempFlashFilters.push({ turn: ctx.g.turnNo, filter: () => true }); }, aiScore: (g, c, p) => g.turnPlayer !== p ? 2 : 0.2 }] };
  SC['Overflowing Basin'] = { producesColors: ['G', 'U'], mana: { cost: { mana: '{1}', tap: true }, produce: [{ G: 1, U: 1 }] } };
  SC['Paradox Gardens'] = { producesColors: ['G', 'U'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] },
    abilities: [{ label: 'Surveil 1', cost: { mana: '{2}{G}{U}', tap: true }, run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); }, aiScore: () => 0.4 }] };
  SC['Quandrix Campus'] = { producesColors: ['G', 'U'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] },
    abilities: [{ label: 'Scry 1', cost: { mana: '{4}', tap: true }, run: async ctx => { await E.scry(ctx.g, ctx.you, 1); }, aiScore: () => 0.3 }] };
  SC['Tangled Islet'] = { producesColors: ['G', 'U'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] } };
  SC['Turbulent Wilderness'] = { producesColors: ['G', 'U'], entersTapped: (g, c) => g.alivePlayers().filter(p => p !== c.ctrl).reduce((n, p) => n + g.lands(p).length, 0) < 8,
    mana: { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }] } };
  SC['Yavimaya Coast'] = { producesColors: ['G', 'U'], mana: [
    { cost: { tap: true }, produce: [{ C: 1 }] },
    { cost: { tap: true }, produce: [{ G: 1 }, { U: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
  ] };
})();
