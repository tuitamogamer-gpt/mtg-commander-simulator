// ===== scripts-coven.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// COVEN COUNTERS (MIC) — commander: Leinore, Autumn Sovereign
// +1/+1 counteri, ljudi i Coven (tri stvorenja različite snage).
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const etbSelf = (g, self, d) => d.card === self;

  // Coven: kontrolišeš tri ili više stvorenja RAZLIČITE snage
  const powers = (g, p) => new Set(g.creatures(p).map(c => Math.max(0, c.power)));
  const coven = (g, p) => powers(g, p).size >= 3;
  const hasCounter = (c) => (c.counters['+1/+1'] || 0) > 0;
  // "izaberi bilo koji broj stvorenja različite snage" — po jedno od svake snage
  const oneOfEachPower = (g, p) => {
    const seen = new Set(), out = [];
    for (const c of g.creatures(p).slice().sort((a, b) => b.power - a.power)) {
      const pw = Math.max(0, c.power);
      if (seen.has(pw)) continue;
      seen.add(pw); out.push(c);
    }
    return out;
  };
  // bolster N: counteri na stvorenje s najmanjom toughness
  const bolster = (g, p, n) => {
    const cs = g.creatures(p);
    if (!cs.length) return;
    let best = cs[0];
    for (const c of cs) if (c.toughness < best.toughness) best = c;
    g.addCounters(best, '+1/+1', n);
  };

  SC['Indomitable Ancients'] = {};
  SC['Zetalpa, Primal Dawn'] = {};

  SC['Leinore, Autumn Sovereign'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Coven: counter + karta',
      filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.yourCreature({ prompt: '+1/+1 counter na', upTo: true, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1);
        if (coven(ctx.g, ctx.you)) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };

  SC['Dawnhart Wardens'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Coven: +1/+0',
      filter: (g, self, d) => d.player === self.ctrl && coven(g, self.ctrl),
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g2, c) => c.ctrl === ctx.you && c.is('Creature'), 1, 0); },
    }],
  };

  SC['Stalwart Pathlighter'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Coven: indestructible',
      filter: (g, self, d) => d.player === self.ctrl && coven(g, self.ctrl),
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g2, c) => c.ctrl === ctx.you && c.is('Creature'), 0, 0, ['indestructible']); },
    }],
  };

  SC['Riders of Gavony'] = {
    asEnters: async (g, card) => {
      const counts = new Map();
      const seen = new Set();
      for (const p of g.players) {
        const pool = g.creatures(p).concat(p.hand, p.library, p.graveyard, p.exile, p.command);
        for (const c of pool) {
          if (!c.is('Creature') || seen.has(c.iid)) continue;
          seen.add(c.iid);
          for (const type of c.def.subtypes || []) {
            const threat = c.ctrl === card.ctrl ? 1 : 3;
            counts.set(type, (counts.get(type) || 0) + threat);
          }
        }
      }
      const types = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (!types.length) types.push(['Human', 1]);
      let chosen = types[0][0];
      if (!card.ctrl.isAI) {
        const picked = await card.ctrl.controller.decide(g, {
          type: 'chooseOption', prompt: `${card.name}: izaberi tip stvorenja za protection`,
          options: types.map(([type]) => ({ key: type, label: type })),
          aiHint: { kind: 'chooseType' },
        });
        if (picked) chosen = picked;
      }
      card.meta.chosenType = chosen;
      g.lg(`${card.name}: izabran tip — ${chosen}.`);
    },
    statics: [{
      apply: (g, self, battlefield) => {
        const chosen = self.meta.chosenType;
        if (!chosen) return;
        for (const card of battlefield) {
          if (card.ctrl !== self.ctrl || !card.hasSub('Human')) continue;
          card.cur.protectionFrom.push((g2, source) =>
            source.is && source.is('Creature') && source.hasSub && source.hasSub(chosen));
        }
      },
    }],
  };

  SC['Sigardian Zealot'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Različite snage: +X/+X i vigilance',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = Math.max(0, ctx.src.power);
        if (!x) return;
        for (const c of oneOfEachPower(ctx.g, ctx.you)) E.pumpUntilEOT(ctx.g, c, x, x, ['vigilance']);
      },
    }],
  };

  SC["Sigarda's Vanguard"] = {
    triggers: [{
      on: 'etb', desc: 'Različite snage: double strike', filter: etbSelf,
      run: async ctx => { for (const c of oneOfEachPower(ctx.g, ctx.you)) E.grantUntilEOT(ctx.g, c, ['double strike']); },
    }, {
      on: 'attacks', desc: 'Različite snage: double strike',
      filter: (g, self, d) => d.card === self,
      run: async ctx => { for (const c of oneOfEachPower(ctx.g, ctx.you)) E.grantUntilEOT(ctx.g, c, ['double strike']); },
    }],
  };

  SC['Wall of Mourning'] = {
    triggers: [{
      on: 'etb', desc: 'Egzil po protivniku', filter: etbSelf,
      run: async ctx => {
        const n = ctx.g.players.filter(x => x !== ctx.you && !x.lost).length;
        ctx.src.meta.stash = ctx.src.meta.stash || [];
        for (let i = 0; i < n; i++) {
          const c = ctx.you.library.shift();
          if (!c) break;
          c.zone = 'exile'; ctx.you.exile.push(c); ctx.src.meta.stash.push(c.iid);
        }
        ctx.g.lg(`${ctx.src.name}: egzilirano ${n} karata licem nadolje.`);
      },
    }, {
      on: 'endStep', desc: 'Coven: vrati kartu',
      filter: (g, self, d) => d.player === self.ctrl && coven(g, self.ctrl) && (self.meta.stash || []).length,
      run: async ctx => {
        const iid = ctx.src.meta.stash.shift();
        const c = ctx.you.exile.find(x => x.iid === iid);
        if (!c) return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
        ctx.g.lg(`${ctx.src.name}: ${c.name} nazad u ruku.`);
      },
    }],
  };

  // --- counter payoffs ---
  SC['Abzan Falconer'] = {
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && hasCounter(c)) c.cur.kw.add('flying'); } }],
    abilities: [{
      label: 'Outlast {W}', cost: { mana: '{W}', tap: true }, sorcery: true,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };
  SC['Ainok Bond-Kin'] = {
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && hasCounter(c)) c.cur.kw.add('first strike'); } }],
    abilities: [{
      label: 'Outlast {1}{W}', cost: { mana: '{1}{W}', tap: true }, sorcery: true,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };

  SC['Champion of Lambholt'] = {
    blockRestriction: (g, blocker, attacker) => {
      // blokeri slabiji od Championa ne mogu blokirati stvorenja njegovog kontrolora
      const champs = g.bf().filter(c => c.def.name === 'Champion of Lambholt' && c.ctrl === attacker.ctrl);
      return !champs.some(ch => blocker.power < ch.power);
    },
    triggers: [{
      on: 'etb', desc: '+1/+1 counter',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };

  SC['Juniper Order Ranger'] = {
    triggers: [{
      on: 'etb', desc: 'Counter na oba',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.data.card, '+1/+1', 1); ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };

  SC['Enduring Scalelord'] = {
    triggers: [{
      // 'countersAdded' ide preko emitSync (samo UI); pravi trigger je 'plusAdded'
      on: 'plusAdded', desc: 'Counter na sebe', opt: true,
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };

  SC['Elite Scaleguard'] = {
    triggers: [{
      on: 'etb', desc: 'Bolster 2', filter: etbSelf,
      run: async ctx => { bolster(ctx.g, ctx.you, 2); },
    }, {
      on: 'attacks', desc: 'Tapni blokera',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && hasCounter(d.card),
      targets: [T.oppCreature({ prompt: 'Tapni', aiHint: { goal: 'tapDown' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.targets[0].tapped = true; },
    }],
  };

  SC['Victory\'s Envoy'] = {
    triggers: [{
      on: 'upkeep', desc: 'Counter svakom drugom',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };

  SC['Mikaeus, the Lunarch'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.castMeta && card.castMeta.x) || 0 },
    abilities: [{
      label: 'Counter na sebe', cost: { tap: true },
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }, {
      label: 'Skini counter: counter svima', cost: { tap: true, rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };

  SC['Custodi Soulbinders'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => g.bf().filter(c => c.is('Creature') && c !== card).length },
    abilities: [{
      label: 'Skini counter: 1/1 Spirit', cost: { mana: '{2}{W}', rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you); },
    }],
  };

  SC['Kurbis, Harvest Celebrant'] = {
    // "mana spent to cast" = X + {G}{G}
    etbCounters: { kind: '+1/+1', n: (g, card) => ((card.castMeta && card.castMeta.x) || 0) + 2 },
    abilities: [{
      label: 'Skini counter: spriječi svu štetu stvorenju', cost: { rmCounter: { kind: '+1/+1', n: 1 } },
      // T.creature prima samo opcije — filter ide kroz T.permanent
      targets: [T.permanent((g, c) => c.is('Creature') && hasCounter(c), { prompt: 'Zaštiti', aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const t = ctx.targets[0]; if (!t) return;
        ctx.g.untilEffects.push({ kind: 'preventToCreature', iid: t.iid, expires: 'eot' });
        ctx.g.lg(`${t.name}: sva šteta ovog poteza je spriječena.`);
      },
    }],
  };

  SC['Kyler, Sigardian Emissary'] = {
    triggers: [{
      on: 'etb', desc: 'Counter za Humana',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.hasSub('Human'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    statics: [{
      apply: (g, self, bf) => {
        const n = Object.values(self.counters).reduce((s, v) => s + Math.max(0, v), 0);
        if (!n) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.hasSub('Human')) { c.cur.power += n; c.cur.toughness += n; }
      },
    }],
  };

  SC['Heronblade Elite'] = {
    triggers: [{
      on: 'etb', desc: 'Counter za Humana',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.hasSub('Human'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    mana: { cost: { tap: true }, produce: (g, c) => { const n = Math.max(0, c.power); return n ? ['W', 'U', 'B', 'R', 'G'].map(col => ({ [col]: n })) : []; } },
  };

  SC['Gyre Sage'] = {
    triggers: [{
      on: 'etb', desc: 'Evolve',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') &&
        (d.card.power > self.power || d.card.toughness > self.toughness),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    mana: { cost: { tap: true }, produce: (g, c) => { const n = c.counters['+1/+1'] || 0; return n ? [{ G: n }] : []; } },
  };

  SC['Wild Beastmaster'] = {
    triggers: [{
      on: 'attacks', desc: '+X/+X ostalima', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const x = Math.max(0, ctx.src.power); if (!x) return;
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) E.pumpUntilEOT(ctx.g, c, x, x);
      },
    }],
  };

  SC['Herald of War'] = {
    triggers: [{
      on: 'attacks', desc: 'Counter na sebe', filter: (g, self, d) => d.card === self,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      const c = info.card;
      if (!c.def.types.includes('Creature')) return 0;
      const subs = c.def.subtypes || [];
      if (!subs.includes('Angel') && !subs.includes('Human')) return 0;
      return -(self.counters['+1/+1'] || 0);
    }],
  };

  SC['Dearly Departed'] = {
    // radi iz groblja — engine podržava trigere sa zone:'graveyard'
    triggers: [{
      on: 'etb', zone: 'graveyard', desc: 'Human dobija dodatni counter',
      filter: (g, self, d) => d.card.ctrl === self.owner && d.card.hasSub('Human') && d.card.is('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.data.card, '+1/+1', 1); },
    }],
  };

  SC["Death's Presence"] = {
    triggers: [{
      on: 'dies', desc: 'X countera',
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature'),
      targets: [T.yourCreature({ prompt: 'Counteri na', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const x = Math.max(0, ctx.data.snap.power || 0);
        if (x && ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', x);
      },
    }],
  };

  SC['Citadel Siege'] = {
    triggers: [{
      on: 'etb', desc: 'Izaberi Khans/Dragons', filter: etbSelf,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Citadel Siege:',
          options: [{ key: 'khans', label: '⚔️ Khans — dva countera svaki tvoj combat' }, { key: 'dragons', label: '🐉 Dragons — tapni protivničko stvorenje' }],
          aiHint: { kind: 'mode' },
        });
        ctx.src.meta.siege = k || 'khans';
        ctx.g.lg(`Citadel Siege: ${ctx.src.meta.siege === 'khans' ? 'Khans' : 'Dragons'}.`);
      },
    }, {
      on: 'beginCombat', desc: 'Khans: 2 countera',
      filter: (g, self, d) => self.meta.siege === 'khans' && d.player === self.ctrl,
      targets: [T.yourCreature({ prompt: '2 countera na', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
    }, {
      on: 'beginCombat', desc: 'Dragons: tapni',
      filter: (g, self, d) => self.meta.siege === 'dragons' && d.player !== self.ctrl,
      run: async ctx => {
        const dp = ctx.data.player;
        const cands = ctx.g.creatures(dp).filter(c => !c.tapped);
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.power - a.power)[0];
        best.tapped = true;
        ctx.g.lg(`Citadel Siege tapira ${best.name}.`);
      },
    }],
  };

  SC['Inspiring Call'] = {
    resolve: async ctx => {
      const cs = ctx.g.creatures(ctx.you).filter(hasCounter);
      if (cs.length) await ctx.g.draw(ctx.you, cs.length);
      for (const c of cs) E.grantUntilEOT(ctx.g, c, ['indestructible']);
    },
  };

  SC['Biogenic Upgrade'] = {
    targets: [T.yourCreature({ prompt: 'Counteri na', count: 1, aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const t = ctx.targets[0]; if (!t) return;
      ctx.g.addCounters(t, '+1/+1', 3);
      const cur = t.counters['+1/+1'] || 0;
      if (cur) ctx.g.addCounters(t, '+1/+1', cur);
    },
  };

  SC['Verdurous Gearhulk'] = {
    triggers: [{
      on: 'etb', desc: '4 countera', filter: etbSelf,
      targets: [T.yourCreature({ prompt: '4 countera na', aiHint: { goal: 'buff' } })],
      run: async ctx => { ctx.g.addCounters(ctx.targets[0] || ctx.src, '+1/+1', 4); },
    }],
  };

  SC['Ruinous Intrusion'] = {
    targets: [
      T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Egzilaj', aiHint: { goal: 'removal' } }),
      T.yourCreature({ prompt: 'Counteri na', aiHint: { goal: 'buff' } }),
    ],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const mv = t ? U.mv(U.parseCost(t.def.cost || '')) : 0;
      if (t) await ctx.g.exileCard(t);
      if (ctx.targets[1] && mv) ctx.g.addCounters(ctx.targets[1], '+1/+1', mv);
    },
  };

  SC['Unbreakable Formation'] = {
    resolve: async ctx => {
      const cs = ctx.g.creatures(ctx.you);
      for (const c of cs) E.grantUntilEOT(ctx.g, c, ['indestructible']);
      const main = ctx.g.phase === 'main1' || ctx.g.phase === 'main2';
      if (main) for (const c of cs) { ctx.g.addCounters(c, '+1/+1', 1); E.grantUntilEOT(ctx.g, c, ['vigilance']); }
    },
  };

  // --- Coven Counters: ostatak ---
  SC['Avacyn\'s Pilgrim'] = { mana: { cost: { tap: true }, produce: [{ W: 1 }] } };
  SC['Somberwald Sage'] = {
    mana: { cost: { tap: true }, produce: [{ W: 3 }, { U: 3 }, { B: 3 }, { R: 3 }, { G: 3 }], restrict: (g, forSpell) => !!(forSpell && forSpell.card && forSpell.card.is('Creature')) },
  };
  SC['Eternal Witness'] = {
    triggers: [{
      on: 'etb', desc: 'Vrati kartu iz groblja', filter: etbSelf, opt: true,
      run: async ctx => {
        const gy = ctx.you.graveyard;
        if (!gy.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: gy, min: 1, max: 1, prompt: 'Vrati u ruku:', aiHint: { kind: 'gyRecur' } });
        const c = pick[0]; if (!c) return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
        ctx.g.lg(`Eternal Witness vraća ${c.name}.`);
      },
    }],
  };
  SC['Bestial Menace'] = {
    resolve: async ctx => { await ctx.g.makeTokens('snakeB', ctx.you); await ctx.g.makeTokens('wolfG', ctx.you); await ctx.g.makeTokens('elephant33', ctx.you); },
  };
  SC['Trostani\'s Summoner'] = {
    triggers: [{
      on: 'etb', desc: 'Knight/Centaur/Rhino', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('soldierW', ctx.you); await ctx.g.makeTokens('beast33', ctx.you); await ctx.g.makeTokens('rhino44', ctx.you); },
    }],
  };
  SC['Somberwald Beastmaster'] = {
    triggers: [{
      on: 'etb', desc: 'Wolf + dva Beasta', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('wolfG', ctx.you); await ctx.g.makeTokens('beast33', ctx.you); await ctx.g.makeTokens('beast44', ctx.you); },
    }],
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) c.cur.kw.add('deathtouch'); } }],
  };
  SC['Heron\'s Grace Champion'] = {
    triggers: [{
      on: 'etb', desc: 'Humani +1/+1 i lifelink', filter: etbSelf,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Human')) E.pumpUntilEOT(ctx.g, c, 1, 1, ['lifelink']); },
    }],
  };
  SC['Knight of the White Orchid'] = {
    triggers: [{
      on: 'etb', desc: 'Nađi Plains', filter: (g, self, d) => d.card === self &&
        g.players.some(o => o !== self.ctrl && g.lands(o).length > g.lands(self.ctrl).length),
      opt: true,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 1, filter: def => (def.subtypes || []).includes('Plains') }); },
    }],
  };
  SC['Kessig Cagebreakers'] = {
    triggers: [{
      on: 'attacks', desc: 'Wolf po stvorenju u groblju', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const n = ctx.you.graveyard.filter(c => c.is('Creature')).length;
        for (let i = 0; i < Math.min(n, 8); i++) await ctx.g.makeTokens('wolfG', ctx.you, { tapped: true, attacking: ctx.src.attacking });
      },
    }],
  };
  SC['Yavimaya Elder'] = {
    triggers: [{
      on: 'dies', desc: 'Dvije bazne zemlje', filter: (g, self, d) => d.card === self, opt: true,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, toHandN: 2 }); },
    }],
    abilities: [{ label: 'Žrtvuj: vuci', cost: { mana: '{2}', sacSelf: true }, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Growth Spasm'] = {
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 1, tapped: true }); await ctx.g.makeTokens('tiny', ctx.you); },
  };
  SC['Celebrate the Harvest'] = {
    resolve: async ctx => { const x = powers(ctx.g, ctx.you).size; if (x) await E.searchBasic(ctx.g, ctx.you, { n: x, tapped: true }); },
  };
  SC['Return to Dust'] = {
    targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Egzilaj', aiHint: { goal: 'removal' } }),
    T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Još jedan (main faza)', upTo: true, aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.exileCard(ctx.targets[0]);
      const main = ctx.g.phase === 'main1' || ctx.g.phase === 'main2';
      if (main && ctx.targets[1]) await ctx.g.exileCard(ctx.targets[1]);
    },
  };
  SC['Celestial Judgment'] = {
    resolve: async ctx => {
      const keep = new Set(), seen = new Set();
      for (const c of ctx.g.bf().filter(x => x.is('Creature')).sort((a, b) => b.power - a.power)) {
        const pw = Math.max(0, c.power);
        if (seen.has(pw)) continue;
        seen.add(pw); keep.add(c.iid);
      }
      for (const c of ctx.g.bf().filter(x => x.is('Creature')).slice()) if (!keep.has(c.iid)) await ctx.g.destroy(c);
    },
  };
  SC['Moonsilver Key'] = {
    abilities: [{
      label: 'Žrtvuj: nađi artefakt/zemlju', cost: { mana: '{1}', tap: true, sacSelf: true },
      run: async ctx => {
        const cands = ctx.you.library.filter(c => (c.is('Land') && (c.def.super || []).includes('Basic')) || (c.is('Artifact') && c.def.mana));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'U ruku:', aiHint: { kind: 'tutor' } });
        const c = pick[0]; if (!c) return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
        U.shuffle(ctx.you.library, ctx.g.rnd);
        ctx.g.lg(`Moonsilver Key nalazi ${c.name}.`);
      },
    }],
  };
  SC['Lifecrafter\'s Bestiary'] = {
    triggers: [{
      on: 'upkeep', desc: 'Scry 1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
    }, {
      on: 'castCreature', desc: 'Plati {G}: vuci', opt: true,
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        if (!ctx.g.canPayMana(ctx.you, U.parseCost('{G}'))) return;
        if (await ctx.g.payMana(ctx.you, U.parseCost('{G}'))) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Angel of Glory\'s Rise'] = {
    triggers: [{
      on: 'etb', desc: 'Egzil Zombija, vrati Humane', filter: etbSelf,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(x => x.hasSub('Zombie')).slice()) await ctx.g.exileCard(c);
        for (const c of ctx.you.graveyard.filter(x => x.is('Creature') && x.hasSub('Human')).slice()) await E.reanimate(ctx.g, ctx.you, c);
      },
    }],
  };
  SC['Moorland Rescuer'] = {
    triggers: [{
      on: 'dies', desc: 'Vrati stvorenja', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        let budget = Math.max(0, ctx.data.snap.power || 0);
        for (const c of ctx.you.graveyard.filter(x => x.is('Creature') && x !== ctx.src).sort((a, b) => b.def.power - a.def.power).slice()) {
          const pw = parseInt(c.def.power || '0', 10) || 0;
          if (pw > budget) continue;
          budget -= pw; await E.reanimate(ctx.g, ctx.you, c);
        }
      },
    }],
  };
  SC['Odric, Master Tactician'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Ti biraš blokove',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.includes(self) && d.attackers.length >= 4,
      run: async ctx => {
        ctx.g.untilEffects.push({ kind: 'chooseBlocksFor', who: ctx.you, expires: 'eot' });
        ctx.g.lg(`${ctx.you.name} bira blokove ovog combata (Odric).`);
      },
    }],
  };
  SC['Sigarda, Heron\'s Grace'] = {
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.hasSub('Human')) c.cur.hexproof = true; } }],
    abilities: [{
      label: 'Egzilaj iz groblja: 1/1 Human', cost: { mana: '{2}', exileFromGY: 1 },
      run: async ctx => { await ctx.g.makeTokens('humanSoldier', ctx.you); },
    }],
  };
  // Bila je bez skripte — Aura koja nije radila baš ništa.
  SC['Curse of Conformity'] = {
    auraTarget: [T.player({ prompt: 'Prokletstvo na igrača', aiHint: { goal: 'curse' } })],
    isPlayerAura: true,
    statics: [{
      phase: 1,   // layer 4 (tipovi) + 7b (base P/T) — mora prije base→cur kopije
      apply: (g, self, bf) => {
        const victim = self.meta && self.meta.cursedPlayer;
        if (!victim) return;
        for (const c of bf) {
          if (c.ctrl !== victim || !c.is('Creature')) continue;
          if ((c.cur.super || []).includes('Legendary')) continue;
          c.cur.basePower = 3; c.cur.baseToughness = 3;
          c.cur.subtypes = [];
          c.cur.allCreatureTypes = false;
        }
      },
    }],
  };
  SC['Curse of Clinging Webs'] = {
    auraTarget: [T.player({ prompt: 'Prokuni igrača', aiHint: { goal: 'curse' } })],
    triggers: [{
      on: 'dies', desc: 'Spider za protivnika',
      filter: (g, self, d) => !d.card.isToken && d.snap.types.includes('Creature') && self.attachedTo && d.snap.ctrl && d.snap.ctrl.idx === self.meta.cursedIdx,
      run: async ctx => { await ctx.g.makeTokens('spider12', ctx.you); },
    }],
  };
})();
