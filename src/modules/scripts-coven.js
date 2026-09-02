// ===== scripts-coven.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// COVEN COUNTERS (MIC) — commander: Leinore, Autumn Sovereign
// +1/+1 counteri, ljudi i Coven (tri stvorenja različite snage).
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const etbSelf = (g, self, d) => d.card === self;

  const tok = (name, subtypes, power, toughness, extra = {}) => Object.assign({
    name, cost: null, types: ['Creature'], subtypes, super: [],
    power: String(power), toughness: String(toughness), oracle: '', kws: [], isTokenDef: true,
  }, extra);
  // Unique token ids keep late-loaded product modules from silently replacing
  // the exact MIC token definitions used by Coven Counters.
  TK.covenEldraziSpawn = tok('Eldrazi Spawn', ['Eldrazi', 'Spawn'], 0, 1, {
    colorsOverride: [], oracle: 'Sacrifice this creature: Add {C}.',
    mana: { cost: { sacSelf: true }, produce: [{ C: 1 }] },
  });
  TK.covenSnake = tok('Snake', ['Snake'], 1, 1, { colorsOverride: ['G'] });
  TK.covenKnight = tok('Knight', ['Knight'], 2, 2, { colorsOverride: ['W'], kws: ['vigilance'] });
  TK.covenCentaur = tok('Centaur', ['Centaur'], 3, 3, { colorsOverride: ['G'] });
  TK.covenRhino = tok('Rhino', ['Rhino'], 4, 4, { colorsOverride: ['G'], kws: ['trample'] });

  // Coven: kontrolišeš tri ili više stvorenja RAZLIČITE snage
  const powers = (g, p) => new Set(g.creatures(p).map(c => Number(c.power) || 0));
  const coven = (g, p) => powers(g, p).size >= 3;
  const hasCounter = (c) => (c.counters['+1/+1'] || 0) > 0;
  const chooseDifferentPowers = async (g, p, prompt, source) => {
    const out = [], used = new Set();
    while (true) {
      const pool = g.creatures(p).filter(c => !used.has(Number(c.power) || 0));
      if (!pool.length) break;
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: pool, min: 0, max: 1,
        prompt: `${prompt}${out.length ? ' (izaberi još ili završi)' : ''}`,
        aiHint: { kind: 'covenDifferentPowers', source, alreadyChosen: out.slice() },
      });
      const card = picked[0];
      if (!card || !pool.includes(card)) break;
      out.push(card); used.add(Number(card.power) || 0);
    }
    return out;
  };
  const chooseCounterDistribution = async (ctx, total, label) => {
    const cards = (ctx.targets || []).flat().filter(Boolean);
    ctx.so = ctx.so || {};
    ctx.so.counterDistribution = [];
    if (!cards.length) return true;
    let left = total;
    for (let index = 0; index < cards.length; index++) {
      const remaining = cards.length - index - 1;
      const max = left - remaining;
      const raw = index === cards.length - 1 ? left : await ctx.you.controller.decide(ctx.g, {
        type: 'chooseX', min: 1, max, card: ctx.src,
        prompt: `${label}: ${cards[index].name} (${left} remaining)`,
        aiHint: { kind: 'counterDistribution', source: ctx.src, target: cards[index], left, remaining },
      });
      const n = Math.max(1, Math.min(Number(raw) || 1, max));
      ctx.so.counterDistribution.push({ iid: cards[index].iid, n });
      left -= n;
    }
    return left === 0;
  };
  // bolster N: bira se među stvorenjima s najmanjim toughnessom.
  const bolster = async (g, p, n, source) => {
    const cs = g.creatures(p);
    if (!cs.length) return;
    const minToughness = Math.min(...cs.map(c => c.toughness));
    const pool = cs.filter(c => c.toughness === minToughness);
    const picked = await p.controller.decide(g, {
      type: 'chooseCards', from: pool, min: 1, max: 1,
      prompt: `Bolster ${n}: choose the creature with the least toughness`,
      aiHint: { kind: 'bolster', source },
    });
    if (picked[0]) g.addCounters(picked[0], '+1/+1', n);
  };

  SC['Indomitable Ancients'] = {};
  SC['Zetalpa, Primal Dawn'] = {};

  SC['Leinore, Autumn Sovereign'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Coven: counter + card',
      filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.yourCreature({ prompt: '+1/+1 counter on', upTo: true, aiHint: { goal: 'buff' } })],
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
      run: async ctx => { if (coven(ctx.g, ctx.you)) E.pumpAllUntilEOT(ctx.g, (g2, c) => c.ctrl === ctx.you && c.is('Creature'), 1, 0); },
    }],
  };

  SC['Stalwart Pathlighter'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Coven: indestructible',
      filter: (g, self, d) => d.player === self.ctrl && coven(g, self.ctrl),
      run: async ctx => { if (coven(ctx.g, ctx.you)) E.pumpAllUntilEOT(ctx.g, (g2, c) => c.ctrl === ctx.you && c.is('Creature'), 0, 0, ['indestructible']); },
    }],
  };

  SC['Riders of Gavony'] = {
    asEnters: async (g, card) => {
      const counts = new Map();
      // Only public battlefield information may inform the choice; never scan
      // opponents' hands or libraries.
      for (const c of g.bf().filter(c => c.is('Creature') && c.ctrl !== card.ctrl)) {
        for (const type of c.cur.subtypes || c.def.subtypes || []) {
          counts.set(type, (counts.get(type) || 0) + Math.max(1, c.power) + 1);
        }
      }
      const allTypes = [...(MTG.CREATURE_SUBTYPES || new Set(['Human']))];
      if (!allTypes.includes('Human')) allTypes.push('Human');
      const types = allTypes.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b));
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: `${card.name}: choose a creature type for protection`,
        options: types.map(type => ({ key: type, label: type, keepValue: counts.get(type) || 0 })),
        aiHint: { kind: 'creatureType' },
      });
      const chosen = types.includes(picked) ? picked : types[0];
      card.meta.chosenType = chosen;
      g.lg(`${card.name}: chosen type — ${chosen}.`);
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
      on: 'beginCombat', desc: 'Different powers: +X/+X and vigilance',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = Math.max(0, ctx.src.power);
        if (!x) return;
        const chosen = await chooseDifferentPowers(ctx.g, ctx.you, `${ctx.src.name}: creatures with different powers`, ctx.src);
        for (const c of chosen) E.pumpUntilEOT(ctx.g, c, x, x, ['vigilance']);
      },
    }],
  };

  SC["Sigarda's Vanguard"] = {
    triggers: [{
      on: 'etb', desc: 'Different powers: double strike', filter: etbSelf,
      run: async ctx => {
        const chosen = await chooseDifferentPowers(ctx.g, ctx.you, `${ctx.src.name}: creatures with different powers`, ctx.src);
        for (const c of chosen) E.grantUntilEOT(ctx.g, c, ['double strike']);
      },
    }, {
      on: 'attacks', desc: 'Different powers: double strike',
      filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const chosen = await chooseDifferentPowers(ctx.g, ctx.you, `${ctx.src.name}: creatures with different powers`, ctx.src);
        for (const c of chosen) E.grantUntilEOT(ctx.g, c, ['double strike']);
      },
    }],
  };

  SC['Wall of Mourning'] = {
    triggers: [{
      on: 'etb', desc: 'Exile per opponent', filter: etbSelf,
      run: async ctx => {
        const n = ctx.g.players.filter(x => x !== ctx.you && !x.lost).length;
        ctx.src.meta.stash = ctx.src.meta.stash || [];
        for (let i = 0; i < n; i++) {
          const c = ctx.you.library.pop();
          if (!c) break;
          c.faceDown = true;
          c.meta.revealedTo = [ctx.you.idx];
          c.zone = 'exile'; ctx.you.exile.push(c); ctx.src.meta.stash.push(c.iid);
        }
        ctx.g.lg(`${ctx.src.name}: exiled ${n} cards face down.`);
      },
    }, {
      on: 'endStep', desc: 'Coven: return a card',
      filter: (g, self, d) => d.player === self.ctrl && coven(g, self.ctrl) && (self.meta.stash || []).length,
      run: async ctx => {
        if (!coven(ctx.g, ctx.you)) return;
        const pool = (ctx.src.meta.stash || []).map(iid => ctx.g.byIid(iid))
          .filter(c => c && c.zone === 'exile');
        if (!pool.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: `${ctx.src.name}: return one exiled card to hand`,
          aiHint: { kind: 'wallMourning', source: ctx.src },
        });
        const c = picked[0];
        if (!c) return;
        ctx.src.meta.stash = ctx.src.meta.stash.filter(iid => iid !== c.iid);
        const owner = c.owner || ctx.you;
        ctx.g.remove(c); c.zone = 'hand'; c.faceDown = false;
        delete c.meta.revealedTo;
        owner.hand.push(c);
        ctx.g.lg(`${ctx.src.name}: ${c.name} back to hand.`);
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
      on: 'etb', desc: 'Counter on both',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => {
        if (ctx.data.card.zone === 'battlefield' && ctx.data.card.is('Creature')) ctx.g.addCounters(ctx.data.card, '+1/+1', 1);
        if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };

  SC['Enduring Scalelord'] = {
    triggers: [{
      // 'countersAdded' ide preko emitSync (samo UI); pravi trigger je 'plusAdded'
      on: 'plusAdded', desc: 'May put the counter on itself',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => {
        const answer = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `${ctx.src.name}: put the +1/+1 counter on it instead?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'enduringScalelord', source: ctx.src },
        });
        if (answer === 'yes' && ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };

  SC['Elite Scaleguard'] = {
    triggers: [{
      on: 'etb', desc: 'Bolster 2', filter: etbSelf,
      run: async ctx => { await bolster(ctx.g, ctx.you, 2, ctx.src); },
    }, {
      on: 'attacks', desc: 'Tap a blocker',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && hasCounter(d.card),
      targets: (g, self, data) => {
        const defender = data.defender instanceof MTG.Player ? data.defender : data.defender && data.defender.ctrl;
        return [T.creature({
          prompt: "Tap a defending player's creature",
          filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === defender,
          aiHint: { goal: 'tapDown' },
        })];
      },
      run: async ctx => { if (ctx.targets[0]) ctx.targets[0].tapped = true; },
    }],
  };

  SC['Victory\'s Envoy'] = {
    triggers: [{
      on: 'upkeep', desc: 'Counter on each other creature',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };

  SC['Mikaeus, the Lunarch'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.castMeta && card.castMeta.x) || 0 },
    abilities: [{
      label: 'Counter on itself', cost: { tap: true },
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }, {
      label: 'Remove a counter: counter on each creature', cost: { tap: true, rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };

  SC['Custodi Soulbinders'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => g.bf().filter(c => c.is('Creature') && c !== card).length },
    abilities: [{
      label: 'Remove a counter: 1/1 Spirit', cost: { mana: '{2}{W}', rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you); },
    }],
  };

  SC['Kurbis, Harvest Celebrant'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.castMeta && card.castMeta.manaSpent) || 0 },
    abilities: [{
      label: 'Remove a counter: prevent all damage to a creature', cost: { rmCounter: { kind: '+1/+1', n: 1 } },
      // T.creature prima samo opcije — filter ide kroz T.permanent
      targets: [T.creature({
        prompt: 'Protect another creature',
        filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c !== src && hasCounter(c),
        aiHint: { goal: 'protect' },
      })],
      run: async ctx => {
        const t = ctx.targets[0]; if (!t) return;
        ctx.g.untilEffects.push({ kind: 'preventToCreature', iid: t.iid, expires: 'eot' });
        ctx.g.lg(`${t.name}: all damage this turn is prevented.`);
      },
    }],
  };

  SC['Kyler, Sigardian Emissary'] = {
    triggers: [{
      on: 'etb', desc: 'Counter for a Human',
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
      on: 'etb', desc: 'Counter for a Human',
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
      run: async ctx => {
        const entrant = ctx.data.card;
        if (ctx.src.zone === 'battlefield' && entrant.zone === 'battlefield' && entrant.is('Creature') &&
          (entrant.power > ctx.src.power || entrant.toughness > ctx.src.toughness)) {
          ctx.g.addCounters(ctx.src, '+1/+1', 1);
        }
      },
    }],
    mana: { cost: { tap: true }, produce: (g, c) => { const n = c.counters['+1/+1'] || 0; return n ? [{ G: n }] : []; } },
  };

  SC['Wild Beastmaster'] = {
    triggers: [{
      on: 'attacks', desc: '+X/+X to the others', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const x = Math.max(0, ctx.src.power); if (!x) return;
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src) E.pumpUntilEOT(ctx.g, c, x, x);
      },
    }],
  };

  SC['Herald of War'] = {
    triggers: [{
      on: 'attacks', desc: 'Counter on itself', filter: (g, self, d) => d.card === self,
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
    graveyardEtbCounters: (g, self, card) => card.ctrl === self.owner && card.hasSub('Human') && card.is('Creature') ? 1 : 0,
  };

  SC["Death's Presence"] = {
    triggers: [{
      on: 'dies', desc: 'X counters',
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature'),
      targets: [T.yourCreature({ prompt: 'Counters on', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const x = Math.max(0, ctx.data.snap.power || 0);
        if (x && ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', x);
      },
    }],
  };

  SC['Citadel Siege'] = {
    asEnters: async (g, card) => {
      const k = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Citadel Siege:',
        options: [{ key: 'khans', label: '⚔️ Khans — two counters each of your combats' }, { key: 'dragons', label: "🐉 Dragons — tap an opponent's creature" }],
        aiHint: { kind: 'citadelSiege', source: card },
      });
      card.meta.siege = k === 'dragons' ? 'dragons' : 'khans';
      g.lg(`Citadel Siege: ${card.meta.siege === 'khans' ? 'Khans' : 'Dragons'}.`);
    },
    triggers: [{
      on: 'beginCombat', desc: 'Khans: 2 counters',
      filter: (g, self, d) => self.meta.siege === 'khans' && d.player === self.ctrl,
      targets: [T.yourCreature({ prompt: '2 counters on', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
    }, {
      on: 'beginCombat', desc: 'Dragons: tap',
      filter: (g, self, d) => self.meta.siege === 'dragons' && d.player !== self.ctrl,
      targets: (g, self, data) => [T.creature({
        prompt: `Citadel Siege: tap a creature ${data.player.name} controls`,
        filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === data.player,
        aiHint: { goal: 'tapDown' },
      })],
      run: async ctx => { if (ctx.targets[0]) { ctx.targets[0].tapped = true; ctx.g.lg(`Citadel Siege taps ${ctx.targets[0].name}.`); } },
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
    targets: [T.yourCreature({ prompt: 'One to three creatures', count: 3, min: 1, upTo: true, aiHint: { goal: 'buff' } })],
    prepareTargets: async ctx => chooseCounterDistribution(ctx, 3, 'Distribute three +1/+1 counters'),
    resolve: async ctx => {
      const legal = new Map(ctx.targets.flat().filter(Boolean).map(card => [card.iid, card]));
      for (const entry of ctx.so.counterDistribution || []) {
        const card = legal.get(entry.iid);
        if (card) ctx.g.addCounters(card, '+1/+1', entry.n);
      }
      for (const card of legal.values()) {
        const cur = card.counters['+1/+1'] || 0;
        if (cur) ctx.g.addCounters(card, '+1/+1', cur);
      }
    },
  };

  SC['Verdurous Gearhulk'] = {
    triggers: [{
      on: 'etb', desc: '4 counters', filter: etbSelf,
      targets: [T.yourCreature({ prompt: 'Up to four creatures', count: 4, upTo: true, aiHint: { goal: 'buff' } })],
      prepareTargets: async ctx => {
        ctx.so = ctx.so || {};
        const prepared = await chooseCounterDistribution(ctx, 4, 'Distribute four +1/+1 counters');
        ctx.counterDistribution = ctx.so.counterDistribution;
        return prepared;
      },
      run: async ctx => {
        const legal = new Map(ctx.targets.flat().filter(Boolean).map(card => [card.iid, card]));
        for (const entry of ctx.counterDistribution || []) {
          const card = legal.get(entry.iid);
          if (card) ctx.g.addCounters(card, '+1/+1', entry.n);
        }
      },
    }],
  };

  SC['Ruinous Intrusion'] = {
    targets: [
      T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Exile', aiHint: { goal: 'removal' } }),
      T.yourCreature({ prompt: 'Counters on', aiHint: { goal: 'buff' } }),
    ],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const mv = t ? t.mv : 0;
      if (t) await ctx.g.exileCard(t);
      if (ctx.targets[1] && mv) ctx.g.addCounters(ctx.targets[1], '+1/+1', mv);
    },
  };

  SC['Unbreakable Formation'] = {
    resolve: async ctx => {
      const cs = ctx.g.creatures(ctx.you);
      for (const c of cs) E.grantUntilEOT(ctx.g, c, ['indestructible']);
      const castPhase = ctx.src.castMeta && ctx.src.castMeta.castPhase;
      const main = castPhase === 'main1' || castPhase === 'main2';
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
      on: 'etb', desc: 'Return target card from graveyard', filter: etbSelf,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target card in your graveyard',
        filter: (g, c, ctrl) => c.owner === ctrl,
        aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const c = ctx.targets[0]; if (!c) return;
        const answer = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Eternal Witness: return ${c.name} to hand?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'eternalWitness', card: c },
        });
        if (answer !== 'yes') return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
        ctx.g.lg(`Eternal Witness returns ${c.name}.`);
      },
    }],
  };
  SC['Bestial Menace'] = {
    resolve: async ctx => { await ctx.g.makeTokens('covenSnake', ctx.you); await ctx.g.makeTokens('wolfG', ctx.you); await ctx.g.makeTokens('elephant33', ctx.you); },
  };
  SC['Trostani\'s Summoner'] = {
    triggers: [{
      on: 'etb', desc: 'Knight/Centaur/Rhino', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('covenKnight', ctx.you); await ctx.g.makeTokens('covenCentaur', ctx.you); await ctx.g.makeTokens('covenRhino', ctx.you); },
    }],
  };
  SC['Somberwald Beastmaster'] = {
    triggers: [{
      on: 'etb', desc: 'Wolf + two Beasts', filter: etbSelf,
      run: async ctx => { await ctx.g.makeTokens('wolfG', ctx.you); await ctx.g.makeTokens('beast33', ctx.you); await ctx.g.makeTokens('beast44', ctx.you); },
    }],
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) c.cur.kw.add('deathtouch'); } }],
  };
  SC['Heron\'s Grace Champion'] = {
    triggers: [{
      on: 'etb', desc: 'Humans get +1/+1 and lifelink', filter: etbSelf,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Human')) E.pumpUntilEOT(ctx.g, c, 1, 1, ['lifelink']); },
    }],
  };
  SC['Knight of the White Orchid'] = {
    triggers: [{
      on: 'etb', desc: 'Search for a Plains', filter: (g, self, d) => d.card === self &&
        g.players.some(o => o !== self.ctrl && g.lands(o).length > g.lands(self.ctrl).length),
      run: async ctx => { await E.searchLandByName(ctx.g, ctx.you, ['Plains'], { tapped: false }); },
    }],
  };
  SC['Kessig Cagebreakers'] = {
    triggers: [{
      on: 'attacks', desc: 'One Wolf per creature in your graveyard', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const n = ctx.you.graveyard.filter(c => c.is('Creature')).length;
        for (let i = 0; i < n; i++) await ctx.g.makeTokens('wolfG', ctx.you, { tapped: true, attacking: ctx.src.attacking });
      },
    }],
  };
  SC['Yavimaya Elder'] = {
    triggers: [{
      on: 'dies', desc: 'Up to two basic lands', filter: (g, self, d) => d.card === self,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, toHandN: 2 }); },
    }],
    abilities: [{ label: 'Sacrifice: draw', cost: { mana: '{2}', sacSelf: true }, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Growth Spasm'] = {
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 1, tapped: true }); await ctx.g.makeTokens('covenEldraziSpawn', ctx.you); },
  };
  SC['Celebrate the Harvest'] = {
    resolve: async ctx => { const x = powers(ctx.g, ctx.you).size; if (x) await E.searchBasic(ctx.g, ctx.you, { n: x, tapped: true }); },
  };
  SC['Return to Dust'] = {
    targets: (g) => {
      const specs = [T.permanent((g2, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Exile', aiHint: { goal: 'removal' } })];
      if (g.phase === 'main1' || g.phase === 'main2') specs.push(T.permanent(
        (g2, c) => c.is('Artifact') || c.is('Enchantment'),
        { prompt: 'One more', upTo: true, differentFromAllPrevious: true, aiHint: { goal: 'removal' } },
      ));
      return specs;
    },
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.exileCard(ctx.targets[0]);
      const castPhase = ctx.src.castMeta && ctx.src.castMeta.castPhase;
      const main = castPhase === 'main1' || castPhase === 'main2';
      if (main && ctx.targets[1]) await ctx.g.exileCard(ctx.targets[1]);
    },
  };
  SC['Celestial Judgment'] = {
    resolve: async ctx => {
      const keep = new Set();
      const creatures = ctx.g.bf().filter(c => c.is('Creature'));
      const distinct = [...new Set(creatures.map(c => Number(c.power) || 0))].sort((a, b) => a - b);
      for (const power of distinct) {
        const pool = creatures.filter(c => (Number(c.power) || 0) === power);
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: `Celestial Judgment: keep one creature with power ${power}`,
          aiHint: { kind: 'celestialKeep', power },
        });
        if (picked[0]) keep.add(picked[0].iid);
      }
      await ctx.g.destroyMany(creatures.filter(c => !keep.has(c.iid)));
    },
  };
  SC['Moonsilver Key'] = {
    abilities: [{
      label: 'Sacrifice: search for an artifact/land', cost: { mana: '{1}', tap: true, sacSelf: true },
      run: async ctx => {
        const cands = ctx.you.library.filter(c => (c.is('Land') && (c.def.super || []).includes('Basic')) || (c.is('Artifact') && c.def.mana));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'To hand:', aiHint: { kind: 'tutor' } });
        const c = pick[0]; if (!c) return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
        U.shuffle(ctx.you.library, ctx.g.rnd);
        ctx.g.lg(`Moonsilver Key finds ${c.name}.`);
      },
    }],
  };
  SC['Lifecrafter\'s Bestiary'] = {
    triggers: [{
      on: 'upkeep', desc: 'Scry 1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
    }, {
      on: 'castCreature', desc: 'May pay {G}: draw',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        if (!ctx.g.canPayMana(ctx.you, U.parseCost('{G}'))) return;
        const answer = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `${ctx.src.name}: pay {G} and draw a card?`,
          options: [{ key: 'yes', label: 'Pay {G}' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'lifecrafterPay', source: ctx.src },
        });
        if (answer === 'yes' && await ctx.g.payMana(ctx.you, U.parseCost('{G}'))) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Angel of Glory\'s Rise'] = {
    triggers: [{
      on: 'etb', desc: 'Exile Zombies, return Humans', filter: etbSelf,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(x => x.hasSub('Zombie')).slice()) await ctx.g.exileCard(c);
        for (const c of ctx.you.graveyard.filter(x => x.is('Creature') && x.hasSub('Human')).slice()) await E.reanimate(ctx.g, ctx.you, c);
      },
    }],
  };
  SC['Moorland Rescuer'] = {
    triggers: [{
      on: 'dies', desc: 'Return creatures', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        let budget = Math.max(0, ctx.data.snap.power || 0);
        const chosen = [];
        while (true) {
          const pool = ctx.you.graveyard.filter(c => c.is('Creature') && c !== ctx.src && !chosen.includes(c) &&
            Math.max(0, parseInt(c.def.power || '0', 10) || 0) <= budget);
          if (!pool.length) break;
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 1,
            prompt: `Moorland Rescuer: return a creature (remaining power ${budget}) or finish`,
            aiHint: { kind: 'moorlandRescuer', budget, source: ctx.src },
          });
          const card = picked[0];
          if (!card || !pool.includes(card)) break;
          chosen.push(card);
          budget -= Math.max(0, parseInt(card.def.power || '0', 10) || 0);
        }
        for (const card of chosen) if (card.zone === 'graveyard') await E.reanimate(ctx.g, ctx.you, card);
        if (ctx.src.zone === 'graveyard') await ctx.g.exileCard(ctx.src);
      },
    }],
  };
  SC['Odric, Master Tactician'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'You choose blockers',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.includes(self) && d.attackers.length >= 4,
      run: async ctx => {
        ctx.g.untilEffects.push({ kind: 'chooseBlocksFor', who: ctx.you, expires: 'eot' });
        ctx.g.lg(`${ctx.you.name} chooses the blockers this combat (Odric).`);
      },
    }],
  };
  SC['Sigarda, Heron\'s Grace'] = {
    playerHexproof: true,
    statics: [{ apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.hasSub('Human')) c.cur.hexproof = true; } }],
    abilities: [{
      label: 'Exile from graveyard: 1/1 Human', cost: { mana: '{2}', exileFromGY: 1 },
      run: async ctx => { await ctx.g.makeTokens('humanSoldier', ctx.you); },
    }],
  };
  // Bila je bez skripte — Aura koja nije radila baš ništa.
  SC['Curse of Conformity'] = {
    auraTarget: [T.player({ prompt: 'Curse a player', aiHint: { goal: 'curse' } })],
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
          c.cur.allCreatureTypesFromOtherEffects = false;
          c.cur.suppressPrintedChangeling = true;
        }
      },
    }],
  };
  SC['Curse of Clinging Webs'] = {
    auraTarget: [T.player({ prompt: 'Curse a player', aiHint: { goal: 'curse' } })],
    triggers: [{
      on: 'dies', desc: "Spider when the cursed player's creature dies",
      filter: (g, self, d) => !d.card.isToken && d.snap.types.includes('Creature') && self.meta.cursedPlayer && d.snap.ctrl === self.meta.cursedPlayer,
      run: async ctx => {
        if (ctx.data.card.zone === 'graveyard') await ctx.g.exileCard(ctx.data.card);
        await ctx.g.makeTokens('spider12', ctx.you);
      },
    }],
  };
})();
