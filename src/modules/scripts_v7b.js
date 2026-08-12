// ===== scripts_v7b.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v7b — BLIGHT CURSE (ECC) + COUNTER INTELLIGENCE (EOC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const hasAnyCounter = (c) => Object.values(c.counters || {}).some(v => v > 0);
  const hasM1 = (c) => (c.counters['-1/-1'] || 0) > 0;

  // proliferate sa Tekuthal duplim
  const prolif = async (g, p) => {
    const twice = g.bf().some(c => c.ctrl === p && c.def.doubleProliferate);
    await E.proliferate(g, p);
    if (twice) { g.lg('Tekuthal: proliferate ×2!'); await E.proliferate(g, p); }
  };
  E7.prolif = prolif;

  // ============================================================
  // BLIGHT CURSE (ECC) — commander: Auntie Ool, Cursewretch
  // ============================================================
  SC['Auntie Ool, Cursewretch'] = {
    ward: { blight: 2 },
    triggers: [{
      on: 'm1Added', desc: 'Karta ili gubitak života',
      filter: () => true,
      run: async ctx => {
        const c = ctx.data.card;
        if (!c) return;
        if (c.ctrl === ctx.you) await ctx.g.draw(ctx.you, 1);
        else await ctx.g.loseLife(c.ctrl, 1, 'ool');
      },
    }],
  };
  SC['Archfiend of Ifnir'] = {
    cycling: { cost: '{2}' },
    triggers: [{
      on: 'cycled', desc: '-1/-1 svima protivnika', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).slice()) await ctx.g.addM1(c, 1, ctx.you);
      },
    }, {
      on: 'discarded', desc: '-1/-1 svima protivnika', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).slice()) await ctx.g.addM1(c, 1, ctx.you);
      },
    }],
  };
  SC['Carnifex Demon'] = {
    etbCounters: { kind: '-1/-1', n: 2 },
    abilities: [{
      label: '-1/-1 na sve ostale', cost: { mana: '{B}', rmCounter: { kind: '-1/-1', n: 1 } },
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature') && c !== ctx.src).slice()) await ctx.g.addM1(c, 1, ctx.you);
      },
      aiScore: (g, c, p) => g.bf().filter(x => x.is('Creature') && x.ctrl !== p && x.toughness <= 2).length >= 2 ? 6 : 1,
    }],
  };
  SC['Channeler Initiate'] = {
    triggers: [{
      on: 'etb', desc: '3× -1/-1 na svoje', filter: etbSelf,
      run: async ctx => {
        const pool = ctx.g.creatures(ctx.you);
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: '3× -1/-1 na svoje stvorenje', aiHint: { kind: 'blight' },
        });
        await ctx.g.addM1(pick[0] || ctx.src, 3, ctx.you);
      },
    }],
    mana: { cost: { tap: true, rmCounter: { kind: '-1/-1', n: 1 } }, produce: [{ ANY: true, n: 1 }], creatureOK: false },
  };
  SC['Devoted Druid'] = {
    mana: { cost: { tap: true }, produce: [{ G: 1 }] },
    abilities: [{
      label: 'Untap (-1/-1)', cost: { counter: '-1/-1' },
      cond: (g, c) => c.tapped && c.toughness > 1,
      run: async ctx => { ctx.src.tapped = false; await ctx.g.emit('m1Added', { card: ctx.src, n: 1, by: ctx.you, ctrl: ctx.you }); },
      aiScore: () => 0.4,
    }],
  };
  SC['Dread Tiller'] = {
    triggers: [
      {
        on: 'etb', desc: '-1/-1', filter: etbSelf,
        targets: [T.creature({ prompt: '-1/-1', aiHint: { goal: 'removal', dmg: 1 } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      },
      {
        on: 'dies', desc: 'Land iz ruke/groblja', opt: true,
        filter: (g, self, d) => d.snap.minus1 > 0,
        run: async ctx => {
          const pool = ctx.you.hand.filter(c => c.is('Land')).concat(ctx.you.graveyard.filter(c => c.is('Land')));
          if (!pool.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Land na battlefield (tapped)', aiHint: { kind: 'rampPick' },
          });
          if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you, tapped: true });
        },
      },
    ],
  };
  SC['Dusk Urchins'] = {
    triggers: [
      {
        on: 'attacks', desc: '-1/-1 na sebe', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.addM1(ctx.src, 1, ctx.you); },
      },
      {
        on: 'dies', desc: 'Vuci po counteru', filter: (g, self, d) => d.card === self,
        run: async ctx => { const n = ctx.data.snap.minus1 || 0; if (n) await ctx.g.draw(ctx.you, n); },
      },
    ],
  };
  SC['Evolution Sage'] = {
    triggers: [{
      on: 'landfall', desc: 'Proliferate', filter: (g, self, d) => d.ctrl === self.ctrl,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
  };
  SC['Ferrafor, Young Yew'] = {
    triggers: [{
      on: 'etb', desc: 'Saprolinzi', filter: etbSelf,
      targets: [T.player({ prompt: 'Čija stvorenja brojimo?', aiHint: { goal: 'self' } })],
      run: async ctx => {
        const q = ctx.targets[0] || ctx.you;
        const n = ctx.g.creatures(q).reduce((s, c) => s + Object.values(c.counters).reduce((a, b) => a + b, 0), 0);
        if (n) await ctx.g.makeTokens('saproling', ctx.you, { n });
      },
    }],
    abilities: [{
      label: 'Dupliraj countere', cost: { tap: true },
      targets: [T.creature({ prompt: 'Dupliraj countere', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        for (const k of Object.keys(t.counters)) {
          if (t.counters[k] <= 0) continue;
          if (k === '-1/-1') await ctx.g.addM1(t, t.counters[k], ctx.you);
          else ctx.g.addCounters(t, k, t.counters[k]);
        }
      },
      aiScore: (g, c, p) => g.creatures(p).some(x => (x.counters['+1/+1'] || 0) >= 2) ? 5 : 1,
    }],
  };
  SC['Glissa Sunslayer'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Izaberi', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const opts = [{ key: 'draw', label: 'Vuci + izgubi 1' }, { key: 'ench', label: 'Uništi enchantment' }, { key: 'cnt', label: 'Skini do 3 countera' }];
        const k = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: 'Glissa:', options: opts, aiHint: { kind: 'mode' } });
        if (k === 'draw') { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'glissa'); }
        else if (k === 'ench') {
          const cands = ctx.g.bf().filter(c => c.is('Enchantment') && c.ctrl !== ctx.you);
          if (cands.length) await ctx.g.destroy(cands[0]);
          else { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'glissa'); }
        } else {
          const cands = ctx.g.bf().filter(c => hasAnyCounter(c));
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Skini countere sa:', aiHint: { kind: 'removalPick' } });
          const t = pick[0];
          if (t) {
            let left = 3;
            for (const kk of Object.keys(t.counters)) {
              const take = Math.min(left, t.counters[kk] || 0);
              if (take > 0) { ctx.g.removeCounters(t, kk, take); left -= take; }
            }
          }
        }
      },
    }],
  };
  SC['Grave Titan'] = {
    triggers: [
      { on: 'etb', desc: '2 zombija', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('zombie22', ctx.you, { n: 2 }); } },
      { on: 'attacks', desc: '2 zombija', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.makeTokens('zombie22', ctx.you, { n: 2 }); } },
    ],
  };
  SC['Grim Poppet'] = {
    etbCounters: { kind: '-1/-1', n: 3 },
    abilities: [{
      label: '-1/-1 na drugo stvorenje', cost: { rmCounter: { kind: '-1/-1', n: 1 } },
      targets: [T.creature({ prompt: '-1/-1', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature'), aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0] && ctx.targets[0] !== ctx.src) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.toughness === 1) ? 5 : 1.5,
    }],
  };
  SC['Hapatra, Vizier of Poisons'] = {
    triggers: [
      {
        on: 'combatDamageToPlayer', desc: '-1/-1', filter: (g, self, d) => d.card === self, opt: true,
        targets: [T.creature({ prompt: '-1/-1', aiHint: { goal: 'removal', dmg: 1 } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      },
      {
        on: 'm1Added', desc: 'Snake', filter: (g, self, d) => d.by === self.ctrl,
        run: async ctx => { await ctx.g.makeTokens('snakeDT', ctx.you); },
      },
    ],
  };
  SC['Ignoble Hierarch'] = {
    mana: { cost: { tap: true }, produce: [{ B: 1 }, { R: 1 }, { G: 1 }] },
    triggers: [{
      on: 'attackersDeclared', desc: 'Exalted', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length === 1,
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.data.attackers[0], 1, 1); },
    }],
  };
  SC['Kulrath Knight'] = {
    kws: ['flying', 'wither'],
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl !== self.ctrl && c.is('Creature') && hasAnyCounter(c)) { c.cur.cantAttack = true; c.cur.cantBlock = true; }
        }
      },
    }],
  };
  SC['Massacre Girl, Known Killer'] = {
    kws: ['menace'],
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.kw.add('wither');
      },
    }],
    triggers: [{
      on: 'dies', desc: 'Vuci (toughness < 1)',
      filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature') && d.snap.toughness < 1,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Midnight Banshee'] = {
    kws: ['wither'],
    triggers: [{
      on: 'upkeep', desc: '-1/-1 na necrna', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.colors.includes('B')).slice()) await ctx.g.addM1(c, 1, ctx.you);
      },
    }],
  };
  SC['Necroskitter'] = {
    kws: ['wither'],
    triggers: [{
      on: 'dies', desc: 'Ukradi mrtvaca', opt: true,
      filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.minus1 > 0 && d.snap.types.includes('Creature'),
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone === 'graveyard' && !c.isToken) {
          c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
          c.zone = 'nowhere';
          await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
          ctx.g.lg(`Necroskitter krade: ${c.name}!`);
        }
      },
    }],
  };
  SC['Oft-Nabbed Goat'] = {
    opponentAbilities: [{
      label: 'Vuci kartu, preuzmi Kozu i stavi -1/-1 counter',
      sorcery: true, cost: { mana: '{1}' },
      run: async ctx => {
        await ctx.g.draw(ctx.you, 1);
        ctx.src.ctrl = ctx.you;
        await ctx.g.addM1(ctx.src, 1, ctx.you);
        ctx.g.recalc();
        ctx.g.lg(`${ctx.you.name} je preuzeo Oft-Nabbed Goat.`);
      },
      aiScore: (g, c, p) => p.life > 5 ? 2 : 0.2,
    }],
    triggers: [{
      on: 'dies', desc: 'Vlasnik vuče X', filter: (g, self, d) => d.card === self && d.snap.minus1 > 0,
      run: async ctx => {
        const x = ctx.data.snap.minus1;
        await ctx.g.draw(ctx.src.owner, x);
        for (const q of ctx.g.alivePlayers()) if (q !== ctx.src.owner) await ctx.g.loseLife(q, x, 'goat');
      },
    }],
  };
  SC['Puppeteer Clique'] = {
    persist: true,
    triggers: [{
      on: 'etb', desc: 'Ukradi iz groblja', filter: etbSelf,
      run: async ctx => {
        const pool = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) pool.push(...o.graveyard.filter(c => c.is('Creature')));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Ukradi stvorenje (haste, egzil na kraju)', aiHint: { kind: 'reanimate' },
        });
        const c = pick[0];
        if (!c) return;
        c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
        c.zone = 'nowhere';
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        c.meta.tempHaste = true;
        const iid = c.iid;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Puppeteer egzil', ctrl: ctx.you,
          filter: (g, d) => d.player === ctx.you,
          run: async c2 => { const x = c2.g.byIid(iid); if (x && x.zone === 'battlefield') await c2.g.exileCard(x); },
        });
      },
    }],
  };
  SC['Sinister Gnarlbark'] = {
    triggers: [{
      on: 'endStep', desc: 'Vuci + blight 1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await E7.blight(ctx.g, ctx.you, 1, ctx.src); },
    }],
  };
  SC['Skinrender'] = {
    triggers: [{
      on: 'etb', desc: '3× -1/-1', filter: etbSelf,
      targets: [T.creature({ prompt: '3× -1/-1', aiHint: { goal: 'removal', dmg: 3 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 3, ctx.you); },
    }],
  };
  SC['Soul Snuffers'] = {
    triggers: [{
      on: 'etb', desc: '-1/-1 svima', filter: etbSelf,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.addM1(c, 1, ctx.you);
      },
    }],
  };
  SC['The Reaper, King No More'] = {
    triggers: [
      {
        on: 'etb', desc: '-1/-1 na do 2', filter: etbSelf,
        targets: [T.creature({ prompt: '-1/-1 (do 2)', count: 2, upTo: true, aiHint: { goal: 'removal', dmg: 1 } })],
        run: async ctx => {
          const ts = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
          for (const t of ts) await ctx.g.addM1(t, 1, ctx.you);
        },
      },
      {
        on: 'dies', desc: 'Ukradi (1×/potez)', oncePerTurn: true, opt: true,
        filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.minus1 > 0 && d.snap.types.includes('Creature'),
        run: async ctx => {
          const c = ctx.data.card;
          if (c.zone === 'graveyard' && !c.isToken) {
            c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
            c.zone = 'nowhere';
            await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
            ctx.g.lg(`The Reaper krade: ${c.name}!`);
          }
        },
      },
    ],
  };
  SC['The Scorpion God'] = {
    triggers: [
      {
        on: 'dies', desc: 'Vuci', filter: (g, self, d) => d.snap.minus1 > 0 && d.snap.types.includes('Creature'),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'dies', desc: 'Vrati se u ruku', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const c = ctx.src;
          ctx.g.delayed.push({
            on: 'endStep', name: 'Scorpion God povratak', ctrl: ctx.you,
            run: async c2 => {
              if (c.zone === 'graveyard') {
                c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
                c.zone = 'hand'; c.owner.hand.push(c);
                c2.g.lg('The Scorpion God se vraća u ruku.');
              }
            },
          });
        },
      },
    ],
    abilities: [{
      label: '-1/-1 na drugo', cost: { mana: '{1}{B}{R}' },
      targets: [T.creature({ prompt: '-1/-1', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0] && ctx.targets[0] !== ctx.src) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.toughness === 1) ? 5 : 1,
    }],
  };
  SC['Tree of Perdition'] = {
    abilities: [{
      label: 'Zamijeni život sa toughness', cost: { tap: true },
      targets: [T.opponent({ prompt: 'Kome?', aiHint: { goal: 'drain' } })],
      run: async ctx => {
        const o = ctx.targets[0];
        if (!o) return;
        const tou = ctx.src.toughness;
        const oldLife = o.life;
        o.life = tou;
        ctx.src.meta.touOverride = oldLife;
        ctx.g.recalc();
        ctx.g.lg(`Tree of Perdition: ${o.name} sada ima ${tou} života; drvo je 0/${oldLife}.`);
        ctx.g.note('life', { p: o });
        await ctx.g.checkSBA();
      },
      aiScore: (g, c, p) => {
        const best = E.eachOpp(g, p).sort((a, b) => b.life - a.life)[0];
        return best && best.life > c.toughness + 8 ? 9 : 0;
      },
    }],
    cdaToughness: (g, c) => c.meta.touOverride !== undefined ? c.meta.touOverride : 13,
  };
  SC['Village Pillagers'] = {
    kws: ['wither'],
    triggers: [
      {
        on: 'etb', desc: '1 šteta protivničkima', filter: etbSelf,
        run: async ctx => {
          for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).slice()) await ctx.g.damageCreature(ctx.src, c, 1);
        },
      },
      {
        on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature') && (d.snap.minus1 > 0 || d.snap.plus1 > 0),
        run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { tapped: true }); },
      },
    ],
  };
  SC['Wickerbough Elder'] = {
    etbCounters: { kind: '-1/-1', n: 1 },
    abilities: [{
      label: 'Uništi artefakt/ench.', cost: { mana: '{G}', rmCounter: { kind: '-1/-1', n: 1 } },
      targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Meta', aiHint: { goal: 'removal' } })],
      run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Liliana, Death Wielder'] = {
    abilities: [
      {
        label: '+2: -1/-1 counter', loyalty: 2, sorcery: true,
        targets: [T.creature({ prompt: '-1/-1', upTo: true, aiHint: { goal: 'removal', dmg: 1 } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      },
      {
        label: '-3: Uništi (sa -1/-1)', loyalty: -3, sorcery: true,
        targets: [T.creature({ prompt: 'Sa -1/-1 counterom', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && hasM1(c), aiHint: { goal: 'removal' } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
      },
      {
        label: '-10: Masovna reanimacija', loyalty: -10, sorcery: true,
        run: async ctx => {
          for (const c of ctx.you.graveyard.filter(c => c.is('Creature')).slice()) await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        },
      },
    ],
  };
  SC["Vraska, Betrayal's Sting"] = {
    compleated: true,
    abilities: [
      {
        label: '0: Vuci + proliferate', loyalty: 0, sorcery: true,
        run: async ctx => {
          await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'vraska');
          await prolif(ctx.g, ctx.you);
        },
      },
      {
        label: '-2: Pretvori u Treasure', loyalty: -2, sorcery: true,
        targets: [T.creature({ prompt: 'U Treasure', aiHint: { goal: 'removal' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          const original = t.def;
          const originalName = t.name;
          t.meta.characteristicOriginalDef = original;
          t.def = Object.assign({}, TK.treasure, {
            name: originalName,
            oracle: '{T}, Sacrifice this artifact: Add one mana of any color.',
          });
          t.isCopyOf = null;
          ctx.g.recalc();
          ctx.g.lg(`${originalName} postaje Treasure artefakt i gubi sve druge tipove i sposobnosti.`);
        },
      },
      {
        label: '-9: 9 poison countera', loyalty: -9, sorcery: true,
        targets: [T.opponent({ prompt: 'Kome?', aiHint: { goal: 'drain' } })],
        run: async ctx => {
          const o = ctx.targets[0];
          if (!o) return;
          o.poison = Math.max(o.poison || 0, 9);
          ctx.g.lg(`${o.name} ima ${o.poison} poison countera!`);
          if (o.poison >= 10) { o.lost = true; ctx.g.lg(`${o.name} gubi (poison)!`); await ctx.g.checkSBA(); }
        },
      },
    ],
  };
  SC['Cathartic Pyre'] = {
    modes: {
      pick: 1,
      list: [
        { label: '3 štete stvorenju/PW', targets: [{ what: 'permanent', prompt: 'Meta', filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')), aiHint: { goal: 'removal', dmg: 3 } }] },
        { label: 'Odbaci do 2 → vuci', targets: null },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 3); }
      else {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.hand, min: 0, max: 2, prompt: 'Odbaci do 2', aiHint: { kind: 'addlDiscard' },
        });
        if (pick.length) { await ctx.g.discard(ctx.you, pick); await ctx.g.draw(ctx.you, pick.length); }
      }
    },
  };
  SC['Fire Covenant'] = {
    resolve: async ctx => {
      const x = Math.min(ctx.you.life - 1, 5);
      if (x <= 0) return;
      await ctx.g.loseLife(ctx.you, x, 'covenant');
      let left = x;
      const cands = () => ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
      while (left > 0 && cands().length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands(), min: 0, max: 1, prompt: `Fire Covenant: šteta (ostalo ${left})`, aiHint: { kind: 'removalPick' },
        });
        if (!pick[0]) break;
        const dmg = Math.min(left, Math.max(1, pick[0].toughness - pick[0].damage));
        await ctx.g.damageCreature(ctx.src, pick[0], dmg);
        left -= dmg;
      }
    },
  };
  SC['Aberrant Return'] = {
    resolve: async ctx => {
      const pool = [];
      for (const q of ctx.g.players) pool.push(...q.graveyard.filter(c => c.is('Creature')));
      if (!pool.length) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 1, max: 3, prompt: 'Reanimiraj 1-3 (sa -1/-1)', aiHint: { kind: 'reanimate' },
      });
      for (const c of pick) {
        c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
        c.zone = 'nowhere';
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        await ctx.g.addM1(c, 1, ctx.you);
      }
    },
  };
  SC["Black Sun's Zenith"] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.addM1(c, x, ctx.you);
      // vrati u library
      const card = ctx.src;
      if (card.zone === 'stack' || card.zone === 'graveyard') {
        ctx.g.remove(card);
        card.zone = 'library'; ctx.you.library.push(card);
        U.shuffle(ctx.you.library, ctx.g.rnd);
        ctx.g.lg("Black Sun's Zenith se miješa u library.");
      }
    },
  };
  SC['Burning Curiosity'] = {
    resolve: async ctx => {
      let n = 2;
      if (ctx.g.creatures(ctx.you).length) {
        const yes = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Blight 1 za +1 kartu?',
          options: [{ key: 'yes', label: 'Da (3 karte)' }, { key: 'no', label: 'Ne (2 karte)' }],
          aiHint: { kind: 'mode' },
        });
        if (yes === 'yes') { if (await E7.blight(ctx.g, ctx.you, 1, ctx.src)) n = 3; }
      }
      for (let i = 0; i < n && ctx.you.library.length; i++) {
        const c = ctx.you.library.pop();
        c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {};
        c.meta.playableUntil = ctx.g.turnNo + 1;
        c.meta.playableBy = ctx.you;
      }
      ctx.g.lg(`Burning Curiosity: egzilirano ${n} (igraj do kraja sljedećeg poteza).`);
    },
  };
  SC['Cathartic Reunion'] = {
    addlCost: { discard: 2 },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 3); },
  };
  SC["Eventide's Shadow"] = {
    resolve: async ctx => {
      let n = 0;
      for (const c of ctx.g.bf()) {
        for (const k of Object.keys(c.counters)) {
          if (c.counters[k] > 0 && (c.ctrl !== ctx.you || k === '-1/-1')) {
            n += c.counters[k];
            ctx.g.removeCounters(c, k, c.counters[k]);
          }
        }
      }
      if (n > 0) { await ctx.g.draw(ctx.you, n); await ctx.g.loseLife(ctx.you, n, 'shadow'); }
      await ctx.g.checkSBA();
    },
  };
  SC["Hoarder's Greed"] = {
    resolve: async ctx => {
      let guard = 0;
      do {
        await ctx.g.loseLife(ctx.you, 2, 'greed');
        await ctx.g.draw(ctx.you, 2);
      } while (guard++ < 4 && await E7.clash(ctx.g, ctx.you));
    },
  };
  SC['Incremental Blight'] = {
    targets: [
      T.creature({ prompt: '1× -1/-1', aiHint: { goal: 'removal', dmg: 1 } }),
      T.creature({ prompt: '2× -1/-1', aiHint: { goal: 'removal', dmg: 2 } }),
      T.creature({ prompt: '3× -1/-1', aiHint: { goal: 'removal', dmg: 3 } }),
    ],
    resolve: async ctx => {
      const [a, b, c] = ctx.targets;
      if (a) await ctx.g.addM1(a, 1, ctx.you);
      if (b && b !== a) await ctx.g.addM1(b, 2, ctx.you);
      if (c && c !== a && c !== b) await ctx.g.addM1(c, 3, ctx.you);
    },
  };
  SC['Persist'] = {
    resolve: async ctx => {
      const pool = ctx.you.graveyard.filter(c => c.is('Creature') && !(c.def.super || []).includes('Legendary'));
      if (!pool.length) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Reanimiraj (sa -1/-1)', aiHint: { kind: 'reanimate' },
      });
      if (pick[0]) {
        await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
        await ctx.g.addM1(pick[0], 1, ctx.you);
      }
    },
  };
  SC['Chimil, the Inner Sun'] = {
    statics: [{ apply: (g, self, bf) => { /* spells can't be countered — flag */ } }],
    uncounterableSpells: true,
    triggers: [{
      on: 'endStep', desc: 'Discover 5', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await E7.discover(ctx.g, ctx.you, 5, ctx.src); },
    }],
  };
  SC['Contagion Clasp'] = {
    triggers: [{
      on: 'etb', desc: '-1/-1', filter: etbSelf,
      targets: [T.creature({ prompt: '-1/-1', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
    }],
    abilities: [{
      label: 'Proliferate', cost: { tap: true, mana: '{4}' },
      run: async ctx => { await prolif(ctx.g, ctx.you); },
      aiScore: (g, c, p) => 3,
    }],
  };
  SC["Wickersmith's Tools"] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'm1Added', desc: 'Charge counter', filter: () => true,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
    abilities: [{
      label: 'Scarecrow tokeni', cost: { tap: true, sacSelf: true, mana: '{5}' },
      run: async ctx => {
        const x = ctx.src.counters['charge'] || 0;
        if (x) await ctx.g.makeTokens('scarecrow22', ctx.you, { n: x, tapped: true });
      },
      aiScore: (g, c, p) => (c.counters['charge'] || 0) >= 3 ? 6 : 0.5,
    }],
  };
  SC['Blowfly Infestation'] = {
    triggers: [{
      on: 'dies', desc: 'Širi zarazu', filter: (g, self, d) => d.snap.minus1 > 0 && d.snap.types.includes('Creature'),
      targets: [T.creature({ prompt: '-1/-1', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
    }],
  };
  SC['Everlasting Torment'] = {
    noLifegain: 'all',
    allDamageWither: true,
    damageCantBePrevented: true,
  };
  SC['Flourishing Defenses'] = {
    triggers: [{
      on: 'm1Added', desc: 'Elf token', filter: () => true, opt: true,
      run: async ctx => { await ctx.g.makeTokens('elfWarrior', ctx.you); },
    }],
  };
  SC['Grave Venerations'] = {
    triggers: [
      {
        on: 'etb', desc: 'Monarh', filter: etbSelf,
        run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑📜 ${ctx.you.name} postaje MONARH!`); },
      },
      {
        on: 'endStep', desc: 'Vrati iz groblja', filter: (g, self, d) => d.player === self.ctrl && g.monarch === self.ctrl,
        run: async ctx => {
          const pool = ctx.you.graveyard.filter(c => c.is('Creature'));
          if (!pool.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'U ruku iz groblja', aiHint: { kind: 'reanimate' },
          });
          if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
        },
      },
      {
        on: 'dies', desc: 'Drain 1', filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 1, 'venerations');
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Lasting Tarfire'] = {
    triggers: [{
      on: 'endStep', desc: '2 štete protivnicima',
      filter: (g, self, d) => (self.ctrl.turnState._putCounterThisTurn || 0) > 0,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.damagePlayer(ctx.src, o, 2);
      },
    }],
  };
  SC["Puca's Covenant"] = {
    triggers: [{
      on: 'dies', desc: 'Vrati permanent iz groblja', oncePerTurn: true, opt: true,
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && (d.snap.minus1 > 0 || d.snap.plus1 > 0),
      run: async ctx => {
        const maxMv = (ctx.data.snap.minus1 || 0) + (ctx.data.snap.plus1 || 0);
        const pool = ctx.you.graveyard.filter(c => c.mv <= maxMv && c !== ctx.data.card && (c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land')));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: `U ruku (mv ≤ ${maxMv})`, aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
      },
    }],
  };

  // ============================================================
  // COUNTER INTELLIGENCE (EOC) — commander: Inspirit, Flagship Vessel
  // ============================================================
  const stationAbility = (extra) => Object.assign({
    label: 'Station (tapuj stvorenje → charge)', sorcery: true,
    cost: { tapCreature: true },
    run: async ctx => {
      const n = ctx.stationPower || 0;
      if (n > 0) ctx.g.addCounters(ctx.src, 'charge', n);
      ctx.g.lg(`${ctx.src.name}: station +${n} charge (ukupno ${ctx.src.counters['charge'] || 0}).`);
    },
    aiScore: (g, c, p) => {
      const th = c.def.stationCreatureAt || 8;
      if ((c.counters['charge'] || 0) >= th) return 0.2;
      const spare = g.creatures(p).filter(x => !x.tapped && x.power > 0 && !x.sick);
      return spare.length && g.phase === 'main2' ? 6 : (spare.length > 2 ? 4 : 0.5);
    },
  }, extra || {});

  SC['Inspirit, Flagship Vessel'] = {
    canBeCommanderExtra: true,   // legendarni Spacecraft: "can be your commander" (Forge tekst to izostavlja)
    stationCreatureAt: 8,
    dynTypes: (g, c) => (c.counters['charge'] || 0) >= 8 ? ['Creature'] : [],
    statics: [{
      cond: (g, self) => (self.counters['charge'] || 0) >= 8,
      apply: (g, self, bf) => {
        self.cur.kw.add('flying');
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c !== self && c.is('Artifact')) { c.cur.hexproof = true; c.cur.kw.add('indestructible'); }
        }
      },
    }],
    abilities: [stationAbility()],
    triggers: [{
      on: 'beginCombat', desc: '+1/+1 ili 2 charge',
      filter: (g, self, d) => d.player === self.ctrl && (self.counters['charge'] || 0) >= 1,
      targets: [{
        // "up to one OTHER target artifact" — sebe je ranije nudio kao metu,
        // pa bi run samo izašao i okidač bi propao.
        what: 'permanent', prompt: 'Drugi artefakt', upTo: true,
        filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Artifact') && c.ctrl === ctrl && c !== src,
        aiHint: { goal: 'buff' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t === ctx.src) return;
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Inspirit → ${t.name}:`,
          options: [{ key: 'p', label: '+1/+1 counter' }, { key: 'c', label: '2 charge countera' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 'p') ctx.g.addCounters(t, '+1/+1', 1);
        else ctx.g.addCounters(t, 'charge', 2);
      },
    }],
  };
  SC['Alibou, Ancient Witness'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.is('Artifact') && c.is('Creature')) c.cur.kw.add('haste');
      },
    }],
    triggers: [{
      on: 'attackersDeclared', desc: 'Šteta + scry',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.is('Artifact')),
      targets: [T.any({ prompt: 'Šteta X', aiHint: { goal: 'removal' } })],
      run: async ctx => {
        const x = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact') && c.tapped).length;
        if (x > 0 && ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], x);
        if (x > 0) await E.scry(ctx.g, ctx.you, Math.min(x, 4));
      },
    }],
  };
  SC['Chrome Host Seedshark'] = {
    triggers: [{
      on: 'castIS', desc: 'Incubate X',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = ctx.data.mv || 0;
        if (x <= 0) return;
        const made = await ctx.g.makeTokens('incubator', ctx.you);
        if (made[0] && x > 0) ctx.g.addCounters(made[0], '+1/+1', x);
      },
    }],
    // "noncreature spell" — castIS pokriva instant/sorcery; artifacts/ench idu preko cast eventa
  };
  SC['Coretapper'] = {
    abilities: [
      {
        label: 'Charge counter', cost: { tap: true },
        targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], 'charge', 1); },
        aiScore: (g, c, p) => g.bf().some(x => x.ctrl === p && x.def.stationCreatureAt) ? 4 : 1,
      },
      {
        label: 'Sac: 2 charge countera', cost: { sacSelf: true },
        targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], 'charge', 2); },
        aiScore: () => 0.4,
      },
    ],
  };
  SC['Crystalline Crawler'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => Math.max(1, (card.meta._payColors || []).length) },
    mana: { cost: { rmCounter: { kind: '+1/+1', n: 1 } }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: '+1/+1 counter', cost: { tap: true },
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      aiScore: () => 2,
    }],
  };
  SC['Cyberdrive Awakener'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.is('Artifact') && c.is('Creature')) c.cur.kw.add('flying');
      },
    }],
    triggers: [{
      on: 'etb', desc: 'Artefakti postaju 4/4', filter: etbSelf,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact') && !c.is('Creature'))) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'animate',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (!x) return;
              if (!x.cur.types.includes('Creature')) x.cur.types.push('Creature');
              x.cur.basePower = 4; x.cur.baseToughness = 4;
            },
          });
        }
        ctx.g.recalc();
      },
    }],
  };
  SC['Deepglow Skate'] = {
    triggers: [{
      on: 'etb', desc: 'Dupliraj countere', filter: etbSelf,
      run: async ctx => {
        const cands = ctx.g.bf().filter(c => c.ctrl === ctx.you && hasAnyCounter(c));
        for (const t of cands) {
          for (const k of Object.keys(t.counters)) if (t.counters[k] > 0) ctx.g.addCounters(t, k, t.counters[k]);
        }
        if (cands.length) ctx.g.lg(`Deepglow Skate: dupliran svaki counter (${cands.length} permanenata).`);
      },
    }],
  };
  SC['Depthshaker Titan'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Artifact') && c.is('Creature')) { c.cur.kw.add('trample'); c.cur.kw.add('haste'); }
      },
    }],
    triggers: [
      {
        on: 'etb', desc: 'Animiraj artefakte (sac EOT)', filter: etbSelf,
        run: async ctx => {
          const cands = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact') && !c.is('Creature') && !c.hasSub('Equipment'));
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: cands, min: 0, max: cands.length, prompt: 'Animiraj u 3/3 (sac na kraju!)', aiHint: { kind: 'depthshaker' },
          });
          const chosen = [];
          for (const c of pick) {
            const iid = c.iid;
            ctx.g.untilEffects.push({
              expires: 'eot', kind: 'animate',
              apply: (g2, bf) => {
                const x = bf.find(y => y.iid === iid);
                if (!x) return;
                if (!x.cur.types.includes('Creature')) x.cur.types.push('Creature');
                x.cur.basePower = 3; x.cur.baseToughness = 3;
              },
            });
            chosen.push(c);
          }
          ctx.g.recalc();
          if (chosen.length) E7.sacAtNextEnd(ctx.g, chosen, ctx.you);
        },
      },
      {
        on: 'attacks', desc: 'Melee', filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Artifact') && d.card.is('Creature'),
        run: async ctx => {
          const c = ctx.data.card;
          const defs = new Set(ctx.g.combat ? ctx.g.combat.attackers.filter(a => a.ctrl === ctx.you).map(a => a.attacking).filter(x => x instanceof MTG.Player) : []);
          if (defs.size) E.pumpUntilEOT(ctx.g, c, defs.size, defs.size);
        },
      },
    ],
  };
  SC['Emry, Lurker of the Loch'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.is('Artifact')).length,
    triggers: [{ on: 'etb', desc: 'Mill 4', filter: etbSelf, run: async ctx => { await ctx.g.mill(ctx.you, 4); } }],
    abilities: [{
      label: 'Baci artefakt iz groblja', cost: { tap: true },
      cond: (g, c, p) => p.graveyard.some(x => x.is('Artifact') && g.canPayMana(p, U.parseCost(x.def.cost || ''))),
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(x => x.is('Artifact'));
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Baci iz groblja', aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) {
          ctx.g.remove(pick[0]); pick[0].zone = 'nowhere';
          const ok = await ctx.g.castSpell(ctx.you, pick[0], { from: 'graveyard' });
          if (!ok) { pick[0].zone = 'graveyard'; ctx.you.graveyard.push(pick[0]); }
        }
      },
      aiScore: (g, c, p) => p.graveyard.some(x => x.is('Artifact') && x.mv <= 3) ? 5 : 1,
    }],
  };
  SC['Enthusiastic Mechanaut'] = {
    costMods: [(g, self, q) => {
      if (q.player === self.ctrl && q.card.is('Artifact')) return -1;
      return 0;
    }],
  };
  SC['Etched Oracle'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => Math.min(4, (card.meta._payColors || []).length || 1) },
    abilities: [{
      label: 'Skini 4: vuci 3', cost: { mana: '{1}', rmCounter: { kind: '+1/+1', n: 4 } },
      run: async ctx => { await ctx.g.draw(ctx.you, 3); },
      aiScore: () => 7,
    }],
  };
  SC['Etherium Sculptor'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Artifact')) ? -1 : 0],
  };
  SC['Hangarback Walker'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 1 },
    triggers: [{
      on: 'dies', desc: 'Thopteri', filter: (g, self, d) => d.card === self,
      run: async ctx => { const n = ctx.data.snap.plus1 || 0; if (n) await ctx.g.makeTokens('thopter', ctx.you, { n }); },
    }],
    abilities: [{
      label: '+1/+1 counter', cost: { tap: true, mana: '{1}' },
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      aiScore: () => 2.5,
    }],
  };
  SC['Jhoira, Weatherlight Captain'] = {
    triggers: [{
      on: 'cast', desc: 'Historic → vuci',
      filter: (g, self, d) => d.player === self.ctrl && (d.card.is('Artifact') || (d.card.def.super || []).includes('Legendary') || d.card.hasSub('Saga')),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Kilo, Apogee Mind'] = {
    triggers: [{
      on: 'attacks', desc: 'Proliferate (tap)', filter: (g, self, d) => d.card === self,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
    abilities: [{
      label: 'Tapuj: proliferate', cost: { tap: true },
      run: async ctx => { await prolif(ctx.g, ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.ctrl === p && Object.values(x.counters).some(v => v > 0)) ? 4 : 0.3,
    }],
  };
  SC['Mindless Automaton'] = {
    etbCounters: { kind: '+1/+1', n: 2 },
    abilities: [
      {
        label: 'Odbaci: +1/+1', cost: { mana: '{1}', discard: 1 },
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
        aiScore: () => 0.3,
      },
      {
        label: 'Skini 2: vuci', cost: { rmCounter: { kind: '+1/+1', n: 2 } },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
        aiScore: (g, c) => (c.counters['+1/+1'] || 0) >= 4 ? 4 : 1,
      },
    ],
  };
  SC['Patrolling Peacemaker'] = {
    etbCounters: { kind: '+1/+1', n: 2 },
    triggers: [{
      on: 'crime', desc: 'Proliferate (tuđi zločin)',
      filter: (g, self, d) => d.player !== self.ctrl && (d.victims || []).includes(self.ctrl),
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
  };
  SC['Phyrexian Metamorph'] = {
    triggers: [{
      on: 'etb', desc: 'Kopiraj artefakt/stvorenje', filter: etbSelf, opt: true,
      run: async ctx => {
        const cands = ctx.g.bf().filter(c => (c.is('Artifact') || c.is('Creature')) && c !== ctx.src);
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Kopiraj:', aiHint: { kind: 'mirrorCopy' },
        });
        const t = pick[0];
        if (!t) return;
        const base = t.isCopyOf || t.def;
        ctx.src.isCopyOf = base;
        ctx.src.def = Object.assign({}, base);
        if (!ctx.src.def.types.includes('Artifact')) ctx.src.def = Object.assign({}, ctx.src.def, { types: ['Artifact'].concat(ctx.src.def.types) });
        ctx.g.lg(`Metamorph kopira: ${t.name}.`);
        ctx.g.recalc();
      },
    }],
  };
  SC['Steel Overseer'] = {
    abilities: [{
      label: '+1/+1 artefakt stvorenjima', cost: { tap: true },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c.is('Artifact')) ctx.g.addCounters(c, '+1/+1', 1);
      },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.is('Artifact')).length >= 2 ? 5 : 1,
    }],
  };
  SC['Surge Conductor'] = {
    triggers: [{
      on: 'etb', desc: 'Proliferate',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Artifact') && !d.card.isToken,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
  };
  SC['Tekuthal, Inquiry Dominus'] = {
    doubleProliferate: true,
    abilities: [{
      label: 'Indestructible counter', cost: { mana: '{1}{U}{U}' },
      cond: (g, c, p) => {
        let n = 0;
        for (const x of g.bf()) if (x.ctrl === p && x !== c) n += Object.values(x.counters).reduce((a, b) => a + b, 0);
        return n >= 3 && !(c.counters['indestructible'] > 0);
      },
      run: async ctx => {
        let left = 3;
        for (const x of ctx.g.bf()) {
          if (x.ctrl !== ctx.you || x === ctx.src || left <= 0) continue;
          for (const k of Object.keys(x.counters)) {
            const take = Math.min(left, x.counters[k] || 0);
            if (take > 0) { ctx.g.removeCounters(x, k, take); left -= take; }
          }
        }
        ctx.g.addCounters(ctx.src, 'indestructible', 1);
        ctx.g.lg('Tekuthal: indestructible counter.');
      },
      aiScore: () => 1,
    }],
    statics: [{
      cond: (g, self) => (self.counters['indestructible'] || 0) > 0,
      apply: (g, self) => { self.cur.kw.add('indestructible'); },
    }],
  };
  SC['Threefold Thunderhulk'] = {
    etbCounters: { kind: '+1/+1', n: 3 },
    triggers: [
      { on: 'etb', desc: 'Gnomi', filter: etbSelf, run: async ctx => { const n = ctx.src.power; if (n > 0) await ctx.g.makeTokens('gnome', ctx.you, { n }); } },
      { on: 'attacks', desc: 'Gnomi', filter: (g, self, d) => d.card === self, run: async ctx => { const n = ctx.src.power; if (n > 0) await ctx.g.makeTokens('gnome', ctx.you, { n }); } },
    ],
    abilities: [{
      label: 'Sac artefakt: +1/+1', cost: { mana: '{2}', sac: (g, x, c) => x.is('Artifact') && x !== c },
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      aiScore: () => 0.3,
    }],
  };
  SC['Thrummingbird'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Proliferate', filter: (g, self, d) => d.card === self,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
  };
  SC['Dispatch'] = {
    targets: [T.creature({ prompt: 'Tapuj/egzilaj', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      t.tapped = true;
      if (ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact')).length >= 3) await ctx.g.exileCard(t);
    },
  };
  SC['Experimental Augury'] = {
    resolve: async ctx => {
      const top = ctx.you.library.slice(-3).reverse();
      if (top.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'U ruku:', aiHint: { kind: 'impulse' },
        });
        const c = pick[0] || top[0];
        ctx.you.library.splice(ctx.you.library.indexOf(c), 1);
        c.zone = 'hand'; ctx.you.hand.push(c);
        for (const x of top) {
          if (x === c) continue;
          ctx.you.library.splice(ctx.you.library.indexOf(x), 1);
          x.zone = 'library'; ctx.you.library.unshift(x);
        }
      }
      await prolif(ctx.g, ctx.you);
    },
  };
  SC['Ripples of Potential'] = {
    resolve: async ctx => {
      const before = new Map(ctx.g.bf().map(c => [c, JSON.stringify(c.counters)]));
      await prolif(ctx.g, ctx.you);
      const changed = ctx.g.bf().filter(c => c.ctrl === ctx.you && before.has(c) && before.get(c) !== JSON.stringify(c.counters));
      if (!changed.length) return;
      const picked = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: changed, min: 0, max: changed.length,
        prompt: 'Koji permanenti koji su proliferirani phases out?', aiHint: { kind: 'protectPick' },
      });
      for (const card of picked) ctx.g.phaseOut(card, ctx.you);
    },
  };
  SC['Universal Surveillance'] = {
    xCost: true, improvise: true,
    resolve: async ctx => { await ctx.g.draw(ctx.you, ctx.x || 0); },
  };
  SC['Wake the Past'] = {
    resolve: async ctx => {
      for (const c of ctx.you.graveyard.filter(c => c.is('Artifact')).slice()) {
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        if (c.zone === 'battlefield') c.meta.tempHaste = true;
      }
    },
  };
  SC['Astral Cornucopia'] = {
    xCost: true,
    etbCounters: { kind: 'charge', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const n = c.counters['charge'] || 0;
        return n > 0 ? COLORS.map(col => ({ [col]: n })) : [];
      },
    },
  };
  SC['Cloud Key'] = {
    asEnters: async (g, card) => {
      const k = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Cloud Key: koji tip?',
        options: [{ key: 'Artifact', label: 'Artifact' }, { key: 'Creature', label: 'Creature' }, { key: 'Instant', label: 'Instant' }, { key: 'Sorcery', label: 'Sorcery' }],
        aiHint: { kind: 'mode' },
      });
      card.meta.chosenType = k;
    },
    costMods: [(g, self, q) => (q.player === self.ctrl && self.meta.chosenType && q.card.is(self.meta.chosenType)) ? -1 : 0],
  };
  SC['Darksteel Reactor'] = {
    kws: ['indestructible'],
    // "When ~ has twenty or more charge counters, you win." To je STATE trigger:
    // mora opaliti čim counteri pređu 20, bez obzira odakle su došli (Inspirit
    // dodaje 2 po combatu). Ranije se provjeravalo samo u vlastitom upkeepu, pa
    // je pobjeda kasnila ceo krug ili izostala.
    winAtCharge: 20,
    triggers: [{
      on: 'upkeep', desc: 'Charge counter', filter: (g, self, d) => d.player === self.ctrl, opt: false,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
  };
  SC['Empowered Autogenerator'] = {
    entersTapped: true,
    mana: {
      cost: { tap: true, counter: 'charge' },
      produce: (g, c, p) => {
        const n = (c.counters['charge'] || 0) + 1; // counter se dodaje pri aktivaciji
        return COLORS.map(col => ({ [col]: n }));
      },
    },
  };
  SC['Everflowing Chalice'] = {
    multikicker: '{2}',
    etbCounters: { kind: 'charge', n: (g, card) => card.meta.paidTimes || 0 },
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const n = c.counters['charge'] || 0;
        return n > 0 ? [{ C: n }] : [];
      },
    },
  };
  SC['Gavel of the Righteous'] = {
    equip: '{3}',
    triggers: [{
      on: 'beginCombat', desc: 'Charge counter', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (!host) return;
        const n = Object.values(self.counters).reduce((a, b) => a + b, 0);
        host.cur.power += n; host.cur.toughness += n;
        if (n >= 4) host.cur.kw.add('double strike');
      },
    }],
  };
  SC['Golem Foundry'] = {
    triggers: [{
      on: 'cast', desc: 'Charge', opt: true,
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Artifact'),
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
    abilities: [{
      label: 'Skini 3: Golem 3/3', cost: { rmCounter: { kind: 'charge', n: 3 } },
      run: async ctx => { await ctx.g.makeTokens('golemC33', ctx.you); },
      aiScore: () => 5,
    }],
  };
  SC['Insight Engine'] = {
    abilities: [{
      label: 'Charge + vuci po counteru', cost: { tap: true, mana: '{2}' },
      run: async ctx => {
        ctx.g.addCounters(ctx.src, 'charge', 1);
        await ctx.g.draw(ctx.you, ctx.src.counters['charge'] || 1);
      },
      aiScore: (g, c) => 3 + (c.counters['charge'] || 0),
    }],
  };
  SC['Long-Range Sensor'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Charge',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.attacking instanceof MTG.Player),
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
    abilities: [{
      label: 'Discover 4', sorcery: true, cost: { mana: '{1}', rmCounter: { kind: 'charge', n: 2 } },
      run: async ctx => { await E7.discover(ctx.g, ctx.you, 4, ctx.src); },
      aiScore: () => 6,
    }],
  };
  SC['Lux Artillery'] = {
    triggers: [
      {
        on: 'etb', desc: 'Sunburst novom stvorenju',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Artifact') && d.card.is('Creature') && !d.card.isToken,
        run: async ctx => {
          const n = (ctx.data.card.meta._payColors || []).length;
          if (n > 0) ctx.g.addCounters(ctx.data.card, '+1/+1', n);
        },
      },
      {
        on: 'endStep', desc: '10 šteta svima', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          let total = 0;
          for (const c of ctx.g.bf()) if (c.ctrl === ctx.you && (c.is('Artifact') || c.is('Creature'))) total += Object.values(c.counters).reduce((a, b) => a + b, 0);
          if (total >= 30) {
            ctx.g.lg('Lux Artillery: 30+ countera → 10 šteta svakom protivniku!');
            for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.damagePlayer(ctx.src, o, 10);
          }
        },
      },
    ],
  };
  SC['Lux Cannon'] = {
    abilities: [
      {
        label: 'Charge counter', cost: { tap: true },
        run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
        aiScore: (g, c) => 3,
      },
      {
        label: 'Skini 3: uništi permanent', cost: { untapSelf: false, rmCounter: { kind: 'charge', n: 3 }, tap: true },
        targets: [T.permanent(null, { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
        run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
        aiScore: () => 8,
      },
    ],
  };
  SC['Moxite Refinery'] = {
    abilities: [{
      label: 'Premjesti countere', sorcery: true, cost: { tap: true, mana: '{2}' },
      cond: (g, c, p) => g.bf().some(x => x.ctrl === p && hasAnyCounter(x)),
      run: async ctx => {
        const g = ctx.g, you = ctx.you;
        const froms = g.bf().filter(x => x.ctrl === you && hasAnyCounter(x));
        const fp = await you.controller.decide(g, { type: 'chooseCards', from: froms, min: 1, max: 1, prompt: 'Skini countere sa:', aiHint: { kind: 'movePick' } });
        const from = fp[0];
        if (!from) return;
        let x = 0;
        for (const k of Object.keys(from.counters)) { x += from.counters[k]; g.removeCounters(from, k, from.counters[k]); }
        if (x <= 0) return;
        const k = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `${x} countera → gdje?`,
          options: [{ key: 'charge', label: 'Charge na artefakt' }, { key: 'plus', label: '+1/+1 na stvorenje' }],
          aiHint: { kind: 'mode' },
        });
        const pool = k === 'charge' ? g.bf().filter(c => c.is('Artifact')) : g.bf().filter(c => c.is('Creature'));
        const tp = await you.controller.decide(g, { type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Na:', aiHint: { kind: 'buffPick' } });
        if (tp[0]) g.addCounters(tp[0], k === 'charge' ? 'charge' : '+1/+1', x);
      },
      aiScore: () => 1,
    }],
  };
  SC['Pentad Prism'] = {
    etbCounters: { kind: 'charge', n: (g, card) => Math.max(1, (card.meta._payColors || []).length) },
    mana: { cost: { rmCounter: { kind: 'charge', n: 1 } }, produce: [{ ANY: true, n: 1 }] },
  };
  SC['Solar Array'] = {
    mana: {
      cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
      onProduce: async (g, c, p) => { p.sunburstGrant = { turn: g.turnNo, source: c.iid }; },
    },
  };
  SC['Soul-Guide Lantern'] = {
    triggers: [{
      on: 'etb', desc: 'Egzilaj kartu iz groblja', filter: etbSelf,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          if (o.graveyard.length) { const c = o.graveyard.pop(); c.zone = 'exile'; o.exile.push(c); ctx.g.lg(`Lantern egzilira ${c.name}.`); break; }
        }
      },
    }],
    abilities: [
      {
        label: 'Sac: egzilaj groblja protivnika', cost: { tap: true, sacSelf: true },
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            while (o.graveyard.length) { const c = o.graveyard.pop(); c.zone = 'exile'; o.exile.push(c); }
          }
          ctx.g.lg('Soul-Guide Lantern: groblja protivnika egzilirana.');
        },
        aiScore: (g, c, p) => E.eachOpp(g, p).some(o => o.graveyard.length > 8) ? 4 : 0.3,
      },
      {
        label: 'Sac: vuci', cost: { tap: true, sacSelf: true, mana: '{1}' },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
        aiScore: () => 0.5,
      },
    ],
  };
  SC['Titan Forge'] = {
    abilities: [
      {
        label: 'Charge counter', cost: { tap: true, mana: '{3}' },
        run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
        aiScore: () => 2.5,
      },
      {
        label: 'Skini 3: Golem 9/9', cost: { tap: true, rmCounter: { kind: 'charge', n: 3 } },
        run: async ctx => { await ctx.g.makeTokens('golem99', ctx.you); },
        aiScore: () => 9,
      },
    ],
  };
  SC['Uthros Research Craft'] = {
    stationCreatureAt: 12,
    dynTypes: (g, c) => (c.counters['charge'] || 0) >= 12 ? ['Creature'] : [],
    statics: [{
      cond: (g, self) => (self.counters['charge'] || 0) >= 12,
      apply: (g, self, bf) => {
        self.cur.kw.add('flying');
        self.cur.power += bf.filter(c => c.ctrl === self.ctrl && c.is('Artifact')).length;
      },
    }],
    abilities: [stationAbility()],
    triggers: [{
      on: 'cast', desc: 'Vuci + charge',
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Artifact') && (self.counters['charge'] || 0) >= 3,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
  };
  SC['Resourceful Defense'] = {
    triggers: [{
      on: 'lto', desc: 'Sačuvaj countere',
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.card !== self,
      run: async ctx => {
        const snap = ctx.data.snap;
        const total = (snap.plus1 || 0);
        if (total <= 0) return;
        const pool = ctx.g.bf().filter(c => c.ctrl === ctx.you);
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: `Prebaci ${total} countera na:`, aiHint: { kind: 'buffPick' },
        });
        if (pick[0]) ctx.g.addCounters(pick[0], '+1/+1', total);
      },
    }],
    abilities: [{
      label: 'Premjesti countere', cost: { mana: '{4}{W}' },
      cond: (g, c, p) => g.bf().some(x => x.ctrl === p && hasAnyCounter(x)),
      run: async ctx => {
        const froms = ctx.g.bf().filter(x => x.ctrl === ctx.you && hasAnyCounter(x));
        const fp = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: froms, min: 1, max: 1, prompt: 'Sa:', aiHint: { kind: 'movePick' } });
        const from = fp[0];
        if (!from) return;
        const pool = ctx.g.bf().filter(x => x.ctrl === ctx.you && x !== from);
        const tp = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Na:', aiHint: { kind: 'buffPick' } });
        if (!tp[0]) return;
        for (const k of Object.keys(from.counters)) {
          const n = from.counters[k];
          if (n > 0) { ctx.g.removeCounters(from, k, n); ctx.g.addCounters(tp[0], k, n); }
        }
      },
      aiScore: () => 0.5,
    }],
  };
})();
