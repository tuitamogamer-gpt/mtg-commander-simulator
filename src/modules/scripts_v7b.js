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
    await E.proliferate(g, p);
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
        await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you), 1, ctx.you);
      },
    }, {
      on: 'discarded', desc: '-1/-1 svima protivnika', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you), 1, ctx.you);
      },
    }],
  };
  SC['Carnifex Demon'] = {
    etbCounters: { kind: '-1/-1', n: 2 },
    abilities: [{
      label: '-1/-1 na sve ostale', cost: { mana: '{B}', rmCounter: { kind: '-1/-1', n: 1 } },
      run: async ctx => {
        await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature') && c !== ctx.src), 1, ctx.you);
      },
      aiScore: (g, c, p) => g.bf().filter(x => x.is('Creature') && x.ctrl !== p && x.toughness <= 2).length >= 2 ? 6 : 1,
    }],
  };
  SC['Channeler Initiate'] = {
    triggers: [{
      on: 'etb', desc: '3× -1/-1 na svoje', filter: etbSelf,
      targets: [T.yourCreature({ prompt: '3× -1/-1 na svoje stvorenje', aiHint: { goal: 'blight', n: 3 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 3, ctx.you); },
    }],
    mana: { cost: { tap: true, rmCounter: { kind: '-1/-1', n: 1 } }, produce: [{ ANY: true, n: 1 }], creatureOK: false },
  };
  SC['Devoted Druid'] = {
    mana: { cost: { tap: true }, produce: [{ G: 1 }] },
    abilities: [{
      label: 'Untap (-1/-1)', cost: { counter: '-1/-1' },
      cond: (g, c) => c.tapped && c.toughness > 1,
      run: async ctx => { ctx.src.tapped = false; },
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
        on: 'blocks', desc: '-1/-1 na sebe', filter: (g, self, d) => d.blocker === self,
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
          else ctx.g.addCounters(t, k, t.counters[k], false, ctx.you);
        }
      },
      aiScore: (g, c, p) => g.creatures(p).some(x => (x.counters['+1/+1'] || 0) >= 2) ? 5 : 1,
    }],
  };
  SC['Glissa Sunslayer'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Izaberi', filter: (g, self, d) => d.card === self,
      modes: {
        aiHint: { kind: 'glissaMode' },
        list: [
          { label: 'Vuci kartu i izgubi 1 život' },
          { label: 'Uništi target enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
          { label: 'Ukloni do 3 countera', targets: [T.permanent((g, c) => hasAnyCounter(c), { prompt: 'Permanent sa counterom', aiHint: { goal: 'counterRemoval' } })] },
        ],
      },
      run: async ctx => {
        if (ctx.mode === 0) { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'glissa'); return; }
        const target = ctx.targets[0];
        if (!target) return;
        if (ctx.mode === 1) { await ctx.g.destroy(target); return; }
        let left = 3;
        for (const kind of Object.keys(target.counters).filter(kind => (target.counters[kind] || 0) > 0)) {
          if (left <= 0) break;
          const max = Math.min(left, target.counters[kind] || 0);
          const amount = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseX', min: 0, max, card: target,
            prompt: `${target.name}: koliko ${kind} countera uklanjaš?`,
            aiHint: { kind: 'glissaCounter', target, counterKind: kind, left },
          });
          const n = Math.max(0, Math.min(max, Number(amount) || 0));
          if (n) { ctx.g.removeCounters(target, kind, n); left -= n; }
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
      targets: [T.creature({ prompt: '-1/-1', filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c !== src, aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
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
        await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature') && !c.colors.includes('B')), 1, ctx.you);
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
        await ctx.g.loseLifeOpponents(ctx.src, ctx.src.owner, x, 'goat');
      },
    }],
  };
  SC['Puppeteer Clique'] = {
    persist: true,
    triggers: [{
      on: 'etb', desc: 'Ukradi iz groblja', filter: etbSelf,
      targets: [{
        zone: 'graveyard', anyGraveyard: true, what: 'card', prompt: 'Stvorenje iz protivničkog groblja',
        filter: (g, card, ctrl) => card.is('Creature') && card.owner !== ctrl,
        aiHint: { goal: 'reanimate' },
      }],
      run: async ctx => {
        const c = ctx.targets[0];
        if (!c || c.zone !== 'graveyard') return;
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        c.meta.tempHaste = true;
        const iid = c.iid, timestamp = c.timestamp;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Puppeteer egzil', ctrl: ctx.you,
          filter: (g, d) => d.player === ctx.you,
          run: async c2 => {
            const x = c2.g.byIid(iid);
            if (x && x.zone === 'battlefield' && x.timestamp === timestamp) await c2.g.exileCard(x);
          },
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
        await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature')), 1, ctx.you);
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
          await E7.addM1Batch(ctx.g, ts, 1, ctx.you);
        },
      },
      {
        on: 'dies', desc: 'Ukradi (1×/potez)', opt: true,
        filter: (g, self, d) => self.meta._reaperReturnTurn !== g.turnNo && d.snap.ctrl !== self.ctrl && d.snap.minus1 > 0 && d.snap.types.includes('Creature'),
        run: async ctx => {
          if (ctx.src.meta._reaperReturnTurn === ctx.g.turnNo) return;
          const c = ctx.data.card;
          if (c.zone === 'graveyard' && !c.isToken) {
            c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
            c.zone = 'nowhere';
            await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
            ctx.src.meta._reaperReturnTurn = ctx.g.turnNo;
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
      targets: [T.creature({ prompt: '-1/-1', filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c !== src, aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.addM1(ctx.targets[0], 1, ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.toughness === 1) ? 5 : 1,
    }],
  };
  SC['Tree of Perdition'] = {
    abilities: [{
      label: 'Zamijeni život sa toughness', cost: { tap: true },
      targets: [T.opponent({ prompt: 'Kome?', aiHint: { goal: 'lifeSwap' } })],
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
          for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).slice()) {
            await ctx.g.damageCreature(ctx.src, c, 1, { deferSBA: true });
          }
          await ctx.g.checkSBA();
        },
      },
      {
        on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature') && Object.values(d.snap.counters || {}).some(n => n > 0),
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
        targets: [T.creature({ prompt: 'With a -1/-1 counter', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && hasM1(c), aiHint: { goal: 'removal' } })],
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
        targets: [T.creature({ prompt: 'Into a Treasure', aiHint: { goal: 'removal' } })],
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
        { label: '3 damage to a creature or planeswalker', targets: [{ what: 'permanent', prompt: 'Target', filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')), aiHint: { goal: 'removal', dmg: 3 } }] },
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
    addlCost: { lifeX: true, divideAmongTargets: true, aiKind: 'fireCovenant' },
    targets: (g, card) => [T.creature({ count: Math.max(0, card.owner.life), upTo: true, prompt: 'Bilo koji broj stvorenja', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
      for (const target of targets) {
        const assignment = (ctx.so.damageDivision || []).find(entry => entry.iid === target.iid);
        if (assignment && assignment.n > 0) {
          await ctx.g.damageCreature(ctx.src, target, assignment.n, { deferSBA: true });
        }
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Aberrant Return'] = {
    targets: [{
      zone: 'graveyard', anyGraveyard: true, what: 'card', count: 3, min: 1,
      prompt: 'Jedna, dvije ili tri creature karte iz groblja',
      filter: (g, card) => card.is('Creature'), aiHint: { goal: 'reanimate' },
    }],
    resolve: async ctx => {
      for (const card of (ctx.targets[0] || [])) {
        if (card.zone !== 'graveyard') continue;
        await ctx.g.move(card, 'battlefield', {
          ctrl: ctx.you, additionalCounters: { '-1/-1': 1 }, additionalCounterBy: ctx.you,
        });
      }
    },
  };
  SC["Black Sun's Zenith"] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      await E7.addM1Batch(ctx.g, ctx.g.bf().filter(c => c.is('Creature')), x, ctx.you);
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
    addlCost: { optionalBlight: 1 },
    resolve: async ctx => {
      const n = ctx.so.additionalBlightPaid ? 3 : 2;
      for (let i = 0; i < n && ctx.you.library.length; i++) {
        const c = ctx.you.library.pop();
        c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {};
        c.meta.playableBy = ctx.you;
        c.meta.playableUntilOwnTurn = ctx.you.turnsStarted + 1;
        delete c.meta.playableUntil;
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
      const permanents = ctx.g.bf().filter(card => hasAnyCounter(card));
      const picked = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: permanents, min: 0, max: permanents.length,
        prompt: "Eventide's Shadow: izaberi permanente sa kojih uklanjaš countere",
        aiHint: { kind: 'eventidePermanents' },
      });
      const removals = [];
      for (const card of [...new Set(picked)].filter(card => permanents.includes(card))) {
        for (const kind of Object.keys(card.counters).filter(kind => (card.counters[kind] || 0) > 0)) {
          const max = card.counters[kind] || 0;
          const amount = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseX', min: 0, max, card,
            prompt: `${card.name}: koliko ${kind} countera uklanjaš?`,
            aiHint: { kind: 'eventideCounter', target: card, counterKind: kind },
          });
          const n = Math.max(0, Math.min(max, Number(amount) || 0));
          if (n) removals.push({ card, kind, n });
        }
      }
      const n = removals.reduce((sum, entry) => sum + entry.n, 0);
      for (const entry of removals) ctx.g.removeCounters(entry.card, entry.kind, entry.n);
      if (n > 0) { await ctx.g.draw(ctx.you, n); await ctx.g.loseLife(ctx.you, n, 'shadow'); }
      await ctx.g.checkSBA();
    },
  };
  SC["Hoarder's Greed"] = {
    resolve: async ctx => {
      let won;
      do {
        await ctx.g.loseLife(ctx.you, 2, 'greed');
        await ctx.g.draw(ctx.you, 2);
        if (ctx.you.lost || !ctx.you.library.length) break;
        won = await E7.clash(ctx.g, ctx.you);
      } while (won);
    },
  };
  SC['Incremental Blight'] = {
    targets: [T.creature({ prompt: 'Tri različita stvorenja (redom 1, 2, 3 countera)', count: 3, aiHint: { goal: 'removal', dmg: 3 } })],
    resolve: async ctx => {
      const targets = ctx.targets[0] || [];
      for (let index = 0; index < targets.length; index++) {
        await ctx.g.addM1(targets[index], index + 1, ctx.you, true);
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Persist'] = {
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Target nonlegendary creature karta iz svog groblja',
      filter: (g, card) => card.is('Creature') && !(card.def.super || []).includes('Legendary'),
      aiHint: { goal: 'reanimate' },
    }],
    resolve: async ctx => {
      const card = ctx.targets[0];
      if (card && card.zone === 'graveyard') await ctx.g.move(card, 'battlefield', {
        ctrl: ctx.you, additionalCounters: { '-1/-1': 1 }, additionalCounterBy: ctx.you,
      });
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
      on: 'm1Added', desc: 'Elf tokeni', filter: (g, self, data) => (data.n || 0) > 0,
      run: async ctx => {
        const max = ctx.data.n || 0;
        const n = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseX', min: 0, max, card: ctx.src,
          prompt: `Flourishing Defenses: koliko Elf tokena praviš (0–${max})?`,
          aiHint: { kind: 'flourishingDefenses', source: ctx.data.card },
        });
        const amount = Math.max(0, Math.min(max, Number(n) || 0));
        if (amount) await ctx.g.makeTokens('elfWarrior', ctx.you, { n: amount });
      },
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
        targets: [{
          zone: 'graveyard', what: 'card', upTo: true, prompt: 'Do jedne target creature karte iz svog groblja',
          filter: (g, card) => card.is('Creature'), aiHint: { goal: 'reanimate' },
        }],
        run: async ctx => {
          const card = ctx.targets[0];
          if (card && card.zone === 'graveyard') { ctx.g.remove(card); card.zone = 'hand'; ctx.you.hand.push(card); }
        },
      },
      {
        on: 'dies', desc: 'Drain 1', filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => {
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'venerations');
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
        await ctx.g.damageOpponents(ctx.src, ctx.you, 2);
      },
    }],
  };
  SC["Puca's Covenant"] = {
    triggers: [{
      on: 'dies', desc: 'Vrati permanent iz groblja', opt: true,
      filter: (g, self, d) => self.meta._pucaReturnTurn !== g.turnNo && d.snap.ctrl === self.ctrl &&
        d.snap.types.includes('Creature') && Object.values(d.snap.counters || {}).some(n => n > 0),
      targets: (g, self, data) => {
        const maxMv = Object.values(data.snap.counters || {}).reduce((sum, n) => sum + Math.max(0, n), 0);
        return [{
          zone: 'graveyard', what: 'card', prompt: `Druga target permanent karta (mv ≤ ${maxMv})`,
          filter: (game, card) => card !== data.card && card.mv <= maxMv &&
            ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle'].some(type => card.is(type)),
          aiHint: { goal: 'reanimate' },
        }];
      },
      run: async ctx => {
        if (ctx.src.meta._pucaReturnTurn === ctx.g.turnNo) return;
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') {
          ctx.g.remove(card); card.zone = 'hand'; ctx.you.hand.push(card);
          ctx.src.meta._pucaReturnTurn = ctx.g.turnNo;
        }
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
      // Power se provjerava na rezoluciji; ako je stvorenje otišlo, koristi LKI.
      const n = ctx.tappedCre && ctx.tappedCre.zone === 'battlefield'
        ? Math.max(0, ctx.tappedCre.power) : (ctx.stationPower || 0);
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
        aiHint: { goal: 'chargeCounter' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t === ctx.src) return;
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Inspirit → ${t.name}:`,
          options: [{ key: 'p', label: '+1/+1 counter' }, { key: 'c', label: '2 charge countera' }],
          aiHint: { kind: 'inspiritCounter', target: t },
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
        if (x > 0) await E.scry(ctx.g, ctx.you, x);
      },
    }],
  };
  SC['Chrome Host Seedshark'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Incubate X',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = ctx.data.mv || 0;
        if (x <= 0) return;
        const made = await ctx.g.makeTokens('incubator', ctx.you);
        if (made[0] && x > 0) ctx.g.addCounters(made[0], '+1/+1', x);
      },
    }],
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
    etbCounters: { kind: '+1/+1', n: (g, card) => (card.meta._payColors || []).length },
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
      targets: [{
        what: 'permanent', count: 999, upTo: true, prompt: 'Permanenti čije countere dupliraš',
        filter: (g, c) => c.zone === 'battlefield' && hasAnyCounter(c),
        aiHint: { goal: 'proliferate' },
      }],
      run: async ctx => {
        const chosen = ctx.targets[0] || [];
        for (const t of chosen) {
          for (const k of Object.keys(t.counters)) if (t.counters[k] > 0) ctx.g.addCounters(t, k, t.counters[k]);
        }
        if (chosen.length) ctx.g.lg(`Deepglow Skate: duplirani counteri (${chosen.length} permanenata).`);
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
        targets: [{
          what: 'permanent', count: 999, upTo: true, prompt: 'Artefakti koji postaju 3/3',
          filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && c.is('Artifact') && !c.is('Creature'),
          aiHint: { goal: 'depthshaker' },
        }],
        run: async ctx => {
          const chosen = [];
          for (const c of (ctx.targets[0] || [])) {
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
          const defs = new Set(ctx.g.combat ? ctx.g.combat.attackers.filter(a => a.ctrl === ctx.you)
            .map(a => a.attacking instanceof MTG.Player ? a.attacking : a.attacking && a.attacking.ctrl)
            .filter(x => x instanceof MTG.Player) : []);
          if (defs.size) E.pumpUntilEOT(ctx.g, c, defs.size, defs.size);
        },
      },
    ],
  };
  SC['Emry, Lurker of the Loch'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.is('Artifact')).length,
    triggers: [{ on: 'etb', desc: 'Mill 4', filter: etbSelf, run: async ctx => { await ctx.g.mill(ctx.you, 4); } }],
    abilities: [{
      label: 'Artefakt iz groblja možeš baciti ovaj potez', cost: { tap: true },
      cond: (g, c, p) => p.graveyard.some(x => x.is('Artifact')),
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target artifact in your graveyard',
        filter: (g, card, ctrl) => card.owner === ctrl && card.is('Artifact'),
        aiHint: { goal: 'bestGyCast' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        card.meta.emryCastTurn = ctx.g.turnNo;
        ctx.g.lg(`${card.name} se može baciti iz groblja ovaj potez.`);
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
    etbCounters: { kind: '+1/+1', n: (g, card) => Math.min(4, (card.meta._payColors || []).length) },
    abilities: [{
      label: 'Skini 4: vuci 3', cost: { mana: '{1}', rmCounter: { kind: '+1/+1', n: 4 } },
      targets: [T.player({ prompt: 'Igrač vuče tri', aiHint: { goal: 'drawSelf' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.draw(ctx.targets[0], 3); },
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
      on: 'becameTapped', desc: 'Proliferate kad se tapuje', filter: (g, self, d) => d.card === self,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
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
      filter: (g, self, d) => d.player !== self.ctrl,
      run: async ctx => { await prolif(ctx.g, ctx.you); },
    }],
  };
  SC['Phyrexian Metamorph'] = {
    asEnters: async (g, card) => {
      const cands = g.bf().filter(c => (c.is('Artifact') || c.is('Creature')) && c !== card);
      if (!cands.length) return;
      const pick = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: cands, min: 0, max: 1,
        prompt: 'Metamorph: artifact ili creature za kopiranje', aiHint: { kind: 'mirrorCopy' },
      });
      const target = pick[0];
      if (!target || !cands.includes(target)) return;
      if (!card.meta.characteristicOriginalDef) card.meta.characteristicOriginalDef = card.def;
      const base = target.isCopyOf || target.def;
      card.isCopyOf = base;
      card.def = Object.assign({}, base);
      if (!card.def.types.includes('Artifact')) card.def = Object.assign({}, card.def, { types: ['Artifact'].concat(card.def.types) });
      g.lg(`Metamorph kopira: ${target.name}.`);
      if (base.asEnters && base !== card.meta.characteristicOriginalDef && (card.meta._copyAsEntersDepth || 0) < 3) {
        card.meta._copyAsEntersDepth = (card.meta._copyAsEntersDepth || 0) + 1;
        await base.asEnters(g, card);
      }
    },
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
      label: 'Indestructible counter', cost: { mana: '{1}{UP}{UP}', removeCountersFromOthers: 3 },
      cond: (g, c, p) => {
        let n = 0;
        for (const x of g.bf()) if (x.ctrl === p && x !== c) n += Object.values(x.counters).reduce((a, b) => a + b, 0);
        return n >= 3 && !(c.counters['indestructible'] > 0);
      },
      run: async ctx => {
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
        const rest = top.filter(x => x !== c);
        const ordered = [];
        while (rest.length) {
          const chosen = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: rest.slice(), min: 1, max: 1,
            prompt: ordered.length ? 'Sljedeća karta iznad nje na dnu' : 'Karta na samo dno biblioteke',
            aiHint: { kind: 'bottomOrder' },
          });
          const next = chosen[0] && rest.includes(chosen[0]) ? chosen[0] : rest[0];
          ordered.push(next);
          rest.splice(rest.indexOf(next), 1);
        }
        for (const x of ordered) ctx.you.library.splice(ctx.you.library.indexOf(x), 1);
        for (const x of ordered) x.zone = 'library';
        ctx.you.library.unshift(...ordered);
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
        options: [{ key: 'Artifact', label: 'Artifact' }, { key: 'Creature', label: 'Creature' },
          { key: 'Enchantment', label: 'Enchantment' }, { key: 'Instant', label: 'Instant' }, { key: 'Sorcery', label: 'Sorcery' }],
        aiHint: { kind: 'cloudKey' },
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
      on: 'upkeep', desc: 'Charge counter', filter: (g, self, d) => d.player === self.ctrl, opt: true,
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
    equipRemoveCounter: true,
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
        on: 'castCreature', desc: 'Artifact creature spell dobija sunburst',
        filter: (g, self, d) => d.player === self.ctrl && d.card.is('Artifact'),
        run: async ctx => {
          const n = (ctx.data.card.meta._payColors || []).length;
          if (ctx.data.card.castMeta) ctx.data.card.castMeta.grantedSunburstColors = n;
        },
      },
      {
        on: 'endStep', desc: '10 šteta svima', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          let total = 0;
          for (const c of ctx.g.bf()) if (c.ctrl === ctx.you && (c.is('Artifact') || c.is('Creature'))) total += Object.values(c.counters).reduce((a, b) => a + b, 0);
          if (total >= 30) {
            ctx.g.lg('Lux Artillery: 30+ countera → 10 šteta svakom protivniku!');
            await ctx.g.damageOpponents(ctx.src, ctx.you, 10);
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
    abilities: [
      {
        label: 'Premjesti kao charge countere', sorcery: true,
        cost: { tap: true, mana: '{2}', removeAnyCounters: { filter: (g, x) => x.is('Artifact') || x.is('Creature') } },
        cond: (g, c, p) => g.bf().some(x => x.ctrl === p && (x.is('Artifact') || x.is('Creature')) && hasAnyCounter(x)),
        targets: [T.permanent((g, target) => target.is('Artifact'), { prompt: 'Ciljani artefakt', aiHint: { goal: 'chargeCounter' } })],
        run: async ctx => { if (ctx.targets[0] && ctx.x > 0) ctx.g.addCounters(ctx.targets[0], 'charge', ctx.x); },
        aiScore: () => 1,
      },
      {
        label: 'Premjesti kao +1/+1 countere', sorcery: true,
        cost: { tap: true, mana: '{2}', removeAnyCounters: { filter: (g, x) => x.is('Artifact') || x.is('Creature') } },
        cond: (g, c, p) => g.bf().some(x => x.ctrl === p && (x.is('Artifact') || x.is('Creature')) && hasAnyCounter(x)),
        targets: [T.creature({ prompt: 'Ciljano stvorenje', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0] && ctx.x > 0) ctx.g.addCounters(ctx.targets[0], '+1/+1', ctx.x); },
        aiScore: () => 1,
      },
    ],
  };
  SC['Pentad Prism'] = {
    etbCounters: { kind: 'charge', n: (g, card) => (card.meta._payColors || []).length },
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
      targets: [{
        zone: 'graveyard', anyGraveyard: true, what: 'card', prompt: 'Karta iz bilo kojeg groblja',
        aiHint: { goal: 'gyHate' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (card && card.zone === 'graveyard') { await ctx.g.move(card, 'exile'); ctx.g.lg(`Lantern egzilira ${card.name}.`); }
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
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.card !== self &&
        Object.values(d.snap.counters || {}).some(n => n > 0),
      targets: [{
        what: 'permanent', prompt: 'Permanent koji prima countere',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl,
        aiHint: { goal: 'buff' },
      }],
      run: async ctx => {
        const snap = ctx.data.snap;
        const target = ctx.targets[0];
        if (!target) return;
        for (const [kind, n] of Object.entries(snap.counters || {})) {
          if (n > 0) ctx.g.addCounters(target, kind, n);
        }
      },
    }],
    abilities: [{
      label: 'Premjesti countere', cost: { mana: '{4}{W}' },
      cond: (g, c, p) => g.bf().filter(x => x.ctrl === p).length >= 2 &&
        g.bf().some(x => x.ctrl === p && hasAnyCounter(x)),
      targets: [
        T.permanent((g, target, ctrl) => target.ctrl === ctrl && hasAnyCounter(target), {
          prompt: 'Permanent sa kojeg pomjeraš countere', aiHint: { goal: 'buff' },
        }),
        T.permanent((g, target, ctrl) => target.ctrl === ctrl, {
          prompt: 'Drugi permanent koji prima countere', differentFromPrevious: true, aiHint: { goal: 'buff' },
        }),
      ],
      run: async ctx => {
        const from = ctx.targets[0], to = ctx.targets[1];
        if (!from || !to || from === to) return;
        for (const k of Object.keys(from.counters)) {
          const available = from.counters[k] || 0;
          if (available <= 0) continue;
          const chosen = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseX', min: 0, max: available, card: from,
            prompt: `Koliko ${k} countera premještaš?`, aiHint: { kind: 'moveCounters', source: from, counterKind: k },
          });
          const n = Math.max(0, Math.min(available, Number(chosen) || 0));
          if (n > 0) { ctx.g.removeCounters(from, k, n); ctx.g.addCounters(to, k, n); }
        }
      },
      aiScore: () => 0.5,
    }],
  };
})();
