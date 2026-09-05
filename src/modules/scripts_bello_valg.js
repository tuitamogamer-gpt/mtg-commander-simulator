// ===== scripts_bello_valg.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Card scripts: Animated Army (Bello) + Endless Punishment (Valgavoth)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const attacksSelf = (g, self, d) => d.card === self;

  // ==================== ANIMATED ARMY (BELLO) ====================
  SC['Bello, Bard of the Brambles'] = {
    colorIdentityExtra: ['R', 'G'],
    statics: [{
      phase: 1,
      cond: (g, self) => g.turnPlayer === self.ctrl,
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl !== self.ctrl || c === self) continue;
          if (c.is('Creature') || c.is('Land')) continue;
          const isArt = c.is('Artifact') && !c.hasSub('Equipment');
          const isEnch = c.is('Enchantment') && !c.hasSub('Aura');
          if ((isArt || isEnch) && c.mv >= 4) {
            c.cur.types.push('Creature');
            if (!c.cur.subtypes.includes('Elemental')) c.cur.subtypes.push('Elemental');
            c.cur.basePower = 4; c.cur.baseToughness = 4;
            c.cur.kw.add('indestructible'); c.cur.kw.add('haste');
            c.cur.belloAnimated = true;
          }
        }
      },
    }],
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Bello: draw a card',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.cur && d.card.cur.belloAnimated,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Brightcap Badger'] = {
    grantMana: {
      filter: (g, x, self) => x.is('Creature') && (x.hasSub('Fungus') || x.hasSub('Saproling')),
      produce: [{ G: 1 }],
    },
    triggers: [{
      on: 'endStep', desc: 'Saproling', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('saproling', ctx.you); },
    }],
    adventure: {
      name: 'Fungus Frolic', cost: '{2}{G}', types: 'Instant', speed: 'instant', altCostStr: '{2}{G}',
      resolve: async ctx => { await ctx.g.makeTokens('saproling', ctx.you, { n: 2 }); },
    },
  };
  SC['Burnished Hart'] = {
    abilities: [{
      label: 'Sacrifice: 2 basics (tapped)', cost: { mana: '{3}', sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true }); },
    }],
  };
  SC['Etali, Primal Storm'] = {
    triggers: [{
      on: 'attacks', filter: attacksSelf, desc: 'Exile + free spells',
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const hits = [];
        for (const q of g.alivePlayers()) {
          if (!q.library.length) continue;
          const c = q.library.pop();
          c.zone = 'exile'; q.exile.push(c);
          g.lg(`Etali reveals: ${c.name} (${q.name}).`);
          if (!c.is('Land')) hits.push(c);
        }
        for (const c of hits) {
          if (g.gameOver) return;
          await E.mayCastFree(g, p, c);
        }
      },
    }],
  };
  SC['Evercoat Ursine'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Hideaway 3 ×2',
        run: async ctx => {
          const g = ctx.g, p = ctx.you;
          ctx.src.meta.hide = ctx.src.meta.hide || [];
          for (let round = 0; round < 2; round++) {
            const top = p.library.slice(-3).reverse();
            if (!top.length) break;
            const pick = await p.controller.decide(g, {
              type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'Hideaway: hide one', aiHint: { kind: 'hideaway' },
            });
            for (const c of top) p.library.splice(p.library.indexOf(c), 1);
            const hid = pick[0] || top[0];
            hid.zone = 'exile'; p.exile.push(hid);
            ctx.src.meta.hide.push(hid.iid);
            for (const c of top) if (c !== hid) { c.zone = 'library'; p.library.unshift(c); }
          }
          g.lg('Evercoat Ursine: 2 cards hidden away.');
        },
      },
      {
        on: 'combatDamageToPlayer', filter: (g, self, d) => d.card === self, desc: 'Play the hidden card', opt: true,
        onlyIf: (g, self) => (self.meta.hide || []).some(iid => { const c = g.byIid(iid); return c && c.zone === 'exile'; }),
        run: async ctx => {
          const g = ctx.g, p = ctx.you;
          let cards = (ctx.src.meta.hide || []).map(iid => g.byIid(iid)).filter(c => c && c.zone === 'exile');
          // "play" land i dalje troši land drop — bez slobodnog dropa land nije igriv
          cards = cards.filter(c => !c.is('Land') || E.canPlayLandNow(g, p));
          if (!cards.length) return;
          const picked = await p.controller.decide(g, {
            type: 'chooseCards', from: cards, min: 0, max: 1, prompt: 'Play for free:', aiHint: { kind: 'bestCard' },
          });
          if (!picked.length) return;
          const c = picked[0];
          if (c.is('Land')) {
            await E.playExiledLand(g, p, c);
          } else await E.mayCastFree(g, p, c);
        },
      },
    ],
  };
  SC["Garruk's Packleader"] = {
    triggers: [{
      on: 'etb', opt: true, desc: 'Draw a card',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.power >= 3,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Ghalta, Primal Hunger'] = {
    selfCostAdjust: (g, card, p) => -g.creatures(p).reduce((s, c) => s + Math.max(0, c.power), 0),
  };
  SC['Goreclaw, Terror of Qal Sisma'] = {
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      const card = info.card;
      if (card.is('Creature') && parseInt(card.def.power || '0', 10) >= 4) return -2;
      return 0;
    }],
    triggers: [{
      on: 'attacks', filter: attacksSelf, desc: '+1/+1 and trample',
      run: async ctx => {
        E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you && c.power >= 4, 1, 1, ['trample']);
      },
    }],
  };
  SC['Grothama, All-Devouring'] = {
    triggers: [
      {
        on: 'attacks', opt: true, desc: 'Fight Grothama',
        // "Other creatures have ..." — odluku donosi kontrolor NAPADAČA, ne Grothamin
        controller: (g, self, d) => d.card.ctrl,
        filter: (g, self, d) => d.card !== self && g.bf().includes(self),
        prepareTargets: ctx => { ctx.fightAttackerZoneVersion = ctx.data.card.zoneVersion; },
        run: async ctx => {
          const a = ctx.data.card, gro = ctx.src, g = ctx.g;
          if (!g.bf().includes(a) || !g.bf().includes(gro) || !a.is('Creature') || !gro.is('Creature') ||
              ctx.sourceZoneVersion != null && gro.zoneVersion !== ctx.sourceZoneVersion ||
              ctx.fightAttackerZoneVersion != null && a.zoneVersion !== ctx.fightAttackerZoneVersion) return;
          g.lg(`${a.name} fights Grotham!`);
          // CR 701.14: both creatures deal their pre-fight power, including
          // when the first damage result places -1/-1 counters on the other.
          await g.damageBatch([
            { src: gro, target: a, n: gro.power },
            { src: a, target: gro, n: a.power },
          ]);
        },
      },
      {
        on: 'lto', filter: (g, self, d) => d.card === self, desc: 'Everyone draws',
        run: async ctx => {
          // sva šteta Grothami OVAJ potez, po kontroloru izvora (engine bookkeeping)
          const rec = ctx.src.meta._damageByCtrl;
          const by = rec && rec.turn === ctx.g.turnNo ? rec.by : {};
          for (const q of ctx.g.players) {
            const n = by[q.idx] || 0;
            if (n > 0 && !q.lost) await ctx.g.draw(q, n);
          }
        },
      },
    ],
  };
  SC['Grumgully, the Generous'] = {
    replace: [{
      event: 'etbCounters', n: 1,
      run: (g, card, src) => card.ctrl === src.ctrl && card !== src && !card.hasSub('Human'),
    }],
  };
  SC['Kodama of the East Tree'] = {
    colorIdentityExtra: ['G'],
    triggers: [{
      on: 'etb', opt: true, desc: 'Put a permanent from hand',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && !d.card.meta._viaKodama,
      run: async ctx => {
        const g = ctx.g, p = ctx.you, mv = ctx.data.card.mv;
        const cands = p.hand.filter(c => ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)) && U.mv(c.def.cost || '') <= mv);
        if (!cands.length) return;
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Kodama: put a permanent (MV ≤ ${mv})`, aiHint: { kind: 'bestCard' },
        });
        if (!picked.length) return;
        const c = picked[0];
        p.hand.splice(p.hand.indexOf(c), 1);
        c.zone = 'nowhere'; c.meta = { _viaKodama: true };
        await g.move(c, 'battlefield', { ctrl: p });
        c.meta._viaKodama = true;
      },
    }],
  };
  SC['Llanowar Loamspeaker'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: 'Land becomes 3/3 (haste)', cost: { tap: true }, sorcery: true,
      targets: [T.permanent((g, c, ctrl) => c.is('Land') && c.ctrl === ctrl, { prompt: 'Your land', aiHint: { goal: 'animateLand' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            c.cur.basePower = 3; c.cur.baseToughness = 3;
            // ne gazi +1/+1 countere na animiranom landu (up. lands.js manland pattern)
            c.cur.power = 3 + (c.counters['+1/+1'] || 0);
            c.cur.toughness = 3 + (c.counters['+1/+1'] || 0);
            c.cur.kw.add('haste');
            if (!c.cur.subtypes.includes('Elemental')) c.cur.subtypes.push('Elemental');
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Lotus Cobra'] = {
    triggers: [{
      on: 'landfall', desc: 'Mana', filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => {
        const col = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Lotus Cobra: color?', options: COLORS.map(x => ({ key: x, label: x })),
          aiHint: { kind: 'manaColor' },
        });
        ctx.you.pool[col]++;
        ctx.g.lg(`Lotus Cobra: +1 {${col}}.`);
      },
    }],
  };
  SC['Prosperous Bandit'] = {
    offspring: '{1}',
    triggers: [{
      on: 'combatDamageToPlayer', filter: (g, self, d) => d.card === self, desc: 'Treasures',
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: ctx.data.n, tapped: true }); },
    }],
  };
  SC['Pyreswipe Hawk'] = {
    triggers: [
      {
        on: 'attacks', filter: attacksSelf, desc: '+X/+0',
        run: async ctx => {
          const x = Math.max(0, ...ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact')).map(c => c.mv), 0);
          if (x) E.pumpUntilEOT(ctx.g, ctx.src, x, 0);
        },
      },
      {
        on: 'expend6', filter: (g, self, d) => d.player === self.ctrl, desc: 'Steal an artifact',
        targets: [T.permanent((g, c, ctrl) => c.is('Artifact'), { prompt: 'Artifact', upTo: true, aiHint: { goal: 'steal' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          MTG.OracleV8Control.gainWhile(ctx,t);
          ctx.g.recalc();
        },
      },

    ],
  };
  SC['Rampaging Baloths'] = {
    triggers: [{
      on: 'landfall', desc: '4/4 Beast', filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('beast44', ctx.you); },
    }],
  };
  SC['Sakura-Tribe Elder'] = {
    abilities: [{
      label: 'Sacrifice: basic (tapped)', cost: { sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['Teapot Slinger'] = {
    triggers: [{
      on: 'expend4', filter: (g, self, d) => d.player === self.ctrl, desc: '2 damage to opponents',
      run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 2); },
    }],
  };
  SC['Tendershoot Dryad'] = {
    triggers: [{
      on: 'upkeep', desc: 'Saproling', filter: () => true,
      run: async ctx => { await ctx.g.makeTokens('saproling', ctx.you); },
    }],
    statics: [{
      cond: (g, self) => self.ctrl.cityBlessing,
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Saproling')) { c.cur.power += 2; c.cur.toughness += 2; }
      },
    }],
  };
  SC['Trailtracker Scout'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'expend8', filter: (g, self, d) => d.player === self.ctrl, desc: 'Return from graveyard', opt: true,
      run: async ctx => {
        const cands = ctx.you.graveyard.filter(c => ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)));
        if (!cands.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Return to hand', aiHint: { kind: 'bestCard' },
        });
        if (picked.length) {
          const c = picked[0];
          ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
          ctx.g.lg(`${c.name} returned to hand.`);
        }
      },
    }],
  };
  SC['Wandertale Mentor'] = {
    mana: { cost: { tap: true }, produce: [{ R: 1 }, { G: 1 }] },
    triggers: [{
      on: 'expend4', filter: (g, self, d) => d.player === self.ctrl, desc: '+1/+1',
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };
  SC['Wildsear, Scouring Maw'] = {
    grantsCascade: (g, self, card, castData, so) => card.is('Enchantment') && so.from === 'hand',
  };
  SC['Domri, Anarch of Bolas'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.power += 1;
      },
    }],
    abilities: [
      {
        label: '+1: Add R or G', loyalty: 1, sorcery: true,
        run: async ctx => {
          const col = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: 'R or G?', options: [{ key: 'R', label: 'R' }, { key: 'G', label: 'G' }],
            aiHint: { kind: 'manaColor' },
          });
          ctx.you.pool[col]++;
          // "Creature spells you cast this turn can't be countered."
          ctx.you.turnState.uncounterableCreatureSpells = true;
        },
      },
      {
        label: '-2: Fight', loyalty: -2, sorcery: true,
        targets: [
          T.yourCreature({ prompt: 'Your creature', aiHint: { goal: 'fightMine' } }),
          { what: 'creature', prompt: "Opponent's creature", filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl, aiHint: { goal: 'removal' } },
        ],
        run: async ctx => {
          const a = ctx.targets[0], b = ctx.targets[1];
          if (a.zone !== 'battlefield' || b.zone !== 'battlefield') return;
          const aPower = a.power, bPower = b.power;
          await ctx.g.damageCreature(a, b, aPower, { deferSBA: true });
          await ctx.g.damageCreature(b, a, bPower, { deferSBA: true });
          await ctx.g.checkSBA();
        },
      },
    ],
  };
  SC['Abrade'] = {
    modes: {
      pick: 1,
      list: [
        { label: '3 damage to a creature', targets: [T.creature({ prompt: 'Target', aiHint: { goal: 'removal', dmg: 3 } })] },
        { label: 'Destroy an artifact', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artifact', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (ctx.mode[0] === 0) await ctx.g.damageCreature(ctx.src, t, 3);
      else await ctx.g.destroy(t);
    },
  };
  SC['Beast Within'] = {
    targets: [T.permanent(null, { prompt: 'Destroy a permanent', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const c2 = t.ctrl;
      if (await ctx.g.destroy(t)) { }
      await ctx.g.makeTokens('beast33', c2);
    },
  };
  SC['Starstorm'] = {
    cycling: { cost: '{3}' },
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.damageCreature(ctx.src, c, ctx.x);
    },
  };
  SC['Cultivate'] = {
    resolve: async ctx => {
      await E.searchBasic(ctx.g, ctx.you, { tapped: true });
      await E.searchBasic(ctx.g, ctx.you, { toHand: true });
    },
  };
  SC['Decimate'] = {
    targets: [
      T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artifact', aiHint: { goal: 'removal' } }),
      T.creature({ prompt: 'Creature', aiHint: { goal: 'removal' } }),
      T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } }),
      T.permanent((g, c) => c.is('Land'), { prompt: 'Land', aiHint: { goal: 'removalLand' } }),
    ],
    resolve: async ctx => {
      for (const t of ctx.targets) if (t && t.zone === 'battlefield') await ctx.g.destroy(t);
    },
  };
  SC['Explore'] = {
    resolve: async ctx => { ctx.you.maxLands++; await ctx.g.draw(ctx.you, 1); },
  };
  SC['Farseek'] = {
    resolve: async ctx => {
      await E.searchLandByName(ctx.g, ctx.you, ['Plains', 'Island', 'Swamp', 'Mountain'], { tapped: true });
    },
  };
  SC['Harmonize'] = { resolve: async ctx => { await ctx.g.draw(ctx.you, 3); } };
  SC['Rampant Growth'] = { resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); } };
  SC["Bootleggers' Stash"] = {
    abilities: [{
      label: 'Tap a land: Treasure', cost: { tapLand: true },
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
  };
  SC["Esika's Chariot"] = {
    crew: 4,
    triggers: [
      { on: 'etb', filter: etbSelf, desc: '2 Cats', run: async ctx => { await ctx.g.makeTokens('cat22', ctx.you, { n: 2 }); } },
      {
        on: 'attacks', filter: attacksSelf, desc: 'Copy a token',
        targets: [{
          what: 'permanent', prompt: 'Token', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && c.isToken,
          aiHint: { goal: 'copyBestToken' },
        }],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.copyPermanentToken(ctx.targets[0], ctx.you); },
      },
    ],
  };
  SC['Rolling Hamsphere'] = {
    crew: 3,
    statics: [{
      apply: (g, self, bf) => {
        const n = bf.filter(c => c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Hamster')).length;
        self.cur.power += n; self.cur.toughness += n;
      },
    }],
    triggers: [{
      on: 'attacks', filter: attacksSelf, desc: 'Hamsters + damage',
      targets: [T.any({ prompt: 'X damage to:', aiHint: { goal: 'damage' } })],
      run: async ctx => {
        await ctx.g.makeTokens('hamster', ctx.you, { n: 3 });
        const x = ctx.g.creatures(ctx.you).filter(c => c.hasSub('Hamster')).length;
        if (x && ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], x);
      },
    }],
  };
  SC['Spine of Ish Sah'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Destroy a permanent',
        targets: [T.permanent(null, { prompt: 'Destroy', aiHint: { goal: 'removal' } })],
        run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
      },
      {
        on: 'dies', filter: (g, self, d) => d.card === self, desc: 'Return to hand',
        run: async ctx => {
          if (ctx.src.zone === 'graveyard') {
            ctx.g.remove(ctx.src); ctx.src.zone = 'hand'; ctx.src.owner.hand.push(ctx.src);
            ctx.g.lg('Spine of Ish Sah returns to hand.');
          }
        },
      },
    ],
  };
  SC["Alchemist's Talent"] = {
    improvesTreasures: true,
    asEnters: async (g, card) => { card.meta.level = 1; },
    triggers: [
      { on: 'etb', filter: etbSelf, desc: '2 Treasures', run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: 2, tapped: true }); } },
      {
        on: 'cast', desc: 'Damage to opponents',
        filter: (g, self, d) => d.player === self.ctrl && (self.meta.level || 1) >= 3 && d.so.treasureUsed,
        run: async ctx => {
          const n = ctx.data.mv;
          await ctx.g.damageOpponents(ctx.src, ctx.you, n);
        },
      },
    ],
    abilities: [
      { label: 'Level 2', cost: { mana: '{1}{R}' }, sorcery: true, cond: (g, c) => (c.meta.level || 1) === 1, run: async ctx => { ctx.src.meta.level = 2; ctx.g.lg('Alchemist → L2.'); } },
      { label: 'Level 3', cost: { mana: '{4}{R}' }, sorcery: true, cond: (g, c) => (c.meta.level || 1) === 2, run: async ctx => { ctx.src.meta.level = 3; ctx.g.lg('Alchemist → L3.'); } },
    ],
  };
  SC["Berserkers' Onslaught"] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.attacking) c.cur.kw.add('double strike');
      },
    }],
  };
  SC["Garruk's Uprising"] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Draw a card',
        onlyIf: (g, self) => g.creatures(self.ctrl).some(c => c.power >= 4),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'etb', desc: 'Draw a card',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.power >= 4,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.kw.add('trample'); },
    }],
  };
  SC['Gratuitous Violence'] = {
    replace: [{
      event: 'damage',
      applies: (g, ev, self) => !!ev.src?.is?.('Creature') && ev.src.ctrl === self.ctrl,
      run: (g, evt, src) => {
        if (evt.src && evt.src.ctrl === src.ctrl && evt.src.is && evt.src.is('Creature')) return evt.n * 2;
        return evt.n;
      },
    }],
  };
  SC['Greater Good'] = {
    abilities: [{
      label: 'Sacrifice: draw = power, discard 3', cost: { sacCreature: true },
      run: async ctx => {
        const s = ctx.sacd && ctx.sacd[0];
        if (!s) return;
        await ctx.g.draw(ctx.you, Math.max(0, s.power));
        const n = Math.min(3, ctx.you.hand.length);
        if (n) {
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: ctx.you.hand, min: n, max: n, prompt: `Discard ${n}`, aiHint: { kind: 'cleanupDiscard' },
          });
          await ctx.g.discard(ctx.you, picked);
        }
      },
    }],
  };
  SC['Outpost Siege'] = {
    asEnters: async (g, card) => {
      const k = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Outpost Siege: Khans or Dragons?',
        options: [{ key: 'khans', label: 'Khans (impulse draw)' }, { key: 'dragons', label: 'Dragons (damage on LTB)' }],
        aiHint: { kind: 'siege' },
      });
      card.meta.siegeMode = k;
      g.lg(`Outpost Siege: ${k === 'khans' ? 'Khans' : 'Dragons'}.`);
    },
    triggers: [
      {
        on: 'upkeep', desc: 'Impulse', filter: (g, self, d) => d.player === self.ctrl && self.meta.siegeMode === 'khans',
        run: async ctx => { E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 1, 'this'); },
      },
      {
        on: 'lto', desc: '1 damage',
        filter: (g, self, d) => self.meta.siegeMode === 'dragons' && d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature'),
        targets: [T.any({ prompt: '1 damage to:', aiHint: { goal: 'damage', n: 1 } })],
        run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
      },
    ],
  };
  SC['Path of Discovery'] = {
    triggers: [{
      on: 'etb', desc: 'Explore',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature'),
      run: async ctx => {
        const g = ctx.g, p = ctx.you, c = ctx.data.card;
        if (!p.library.length) return;
        const top = p.library[p.library.length - 1];
        g.lg(`Explore: revealed ${top.name}.`);
        if (top.is('Land')) {
          p.library.pop(); top.zone = 'hand'; p.hand.push(top);
        } else {
          if (c.zone === 'battlefield') g.addCounters(c, '+1/+1', 1);
          const k = await p.controller.decide(g, {
            type: 'chooseOption', prompt: `${top.name}: leave on top or put into graveyard?`,
            options: [{ key: 'top', label: 'Top' }, { key: 'gy', label: 'Graveyard' }],
            aiHint: { kind: 'explore', card: top },
          });
          if (k === 'gy') { p.library.pop(); await g.move(top, 'graveyard'); }
        }
      },
    }],
  };
  SC['Primeval Bounty'] = {
    triggers: [
      { on: 'castCreature', desc: 'Beast', filter: (g, self, d) => d.player === self.ctrl, run: async ctx => { await ctx.g.makeTokens('beast33', ctx.you); } },
      {
        on: 'castNonCreature', desc: '+3 counters', filter: (g, self, d) => d.player === self.ctrl,
        onlyIf: (g, self) => g.creatures(self.ctrl).length > 0,
        run: async ctx => {
          const c = await E.chooseCreature(ctx.g, ctx.you, ctx.g.creatures(ctx.you), '+3 counters on:', { kind: 'buff' });
          if (c) ctx.g.addCounters(c, '+1/+1', 3);
        },
      },
      { on: 'landfall', desc: '+3 life', filter: (g, self, d) => d.card.ctrl === self.ctrl, run: async ctx => { await ctx.g.gainLife(ctx.you, 3); } },
    ],
  };
  SC['Rain of Riches'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: '2 Treasures', run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: 2 }); } }],
    grantsCascade: (g, self, card, castData, so) => {
      if (!so.treasureUsed) return false;
      const key = `_rainUsed_${self.iid}`;
      if (self.ctrl.turnState[key]) return false;
      self.ctrl.turnState[key] = true;
      return true;
    },
  };
  SC["Sunbird's Invocation"] = {
    triggers: [{
      on: 'cast', desc: 'Reveal X from the top',
      filter: (g, self, d) => d.player === self.ctrl && d.fromHand && d.mv > 0,
      run: async ctx => {
        const g = ctx.g, p = ctx.you, x = ctx.data.mv;
        const top = p.library.slice(-x).reverse();
        if (!top.length) return;
        const casts = top.filter(c => !c.is('Land') && U.mv(c.def.cost || '') <= x);
        g.lg(`Sunbird's: revealed ${top.map(c => c.name).join(', ')}.`);
        let chosen = null;
        if (casts.length) {
          const picked = await p.controller.decide(g, {
            type: 'chooseCards', from: casts, min: 0, max: 1, prompt: `Cast for free (MV ≤ ${x}):`, aiHint: { kind: 'bestCard' },
          });
          chosen = picked[0] || null;
        }
        for (const c of top) p.library.splice(p.library.indexOf(c), 1);
        if (chosen) {
          // cast ide direktno iz biblioteke — preko ruke bi lažno palio
          // fromHand okidače (uključujući sam Sunbird → beskonačni lanac)
          const ok = await g.castSpell(p, chosen, { alt: { free: true }, from: 'library' });
          if (!ok && chosen.zone !== 'stack' && chosen.zone !== 'battlefield') { chosen.zone = 'library'; p.library.unshift(chosen); }
        }
        for (const c of top) if (c !== chosen && c.zone !== 'stack' && c.zone !== 'battlefield') { c.zone = 'library'; p.library.unshift(c); }
      },
    }],
  };
  SC['Thickest in the Thicket'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'X counters',
        targets: [T.creature({ prompt: 'Creature', aiHint: { goal: 'buff' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          const x = Math.max(0, t.power);
          if (x) ctx.g.addCounters(t, '+1/+1', x);
        },
      },
      {
        on: 'endStep', desc: 'Draw 2', filter: (g, self, d) => d.player === self.ctrl,
        onlyIf: (g, self) => {
          const all = g.bf().filter(c => c.is('Creature'));
          if (!all.length) return false;
          const maxP = Math.max(...all.map(c => c.power));
          return g.creatures(self.ctrl).some(c => c.power === maxP);
        },
        run: async ctx => { await ctx.g.draw(ctx.you, 2); },
      },
    ],
  };
  SC['Unnatural Growth'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Double P/T', filter: () => true,
      run: async ctx => {
        const you = ctx.you;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            for (const c of bf) if (c.ctrl === you && c.is('Creature')) { c.cur.power *= 2; c.cur.toughness *= 2; }
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Warstorm Surge'] = {
    triggers: [{
      on: 'etb', desc: 'Damage = power',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card !== self,
      targets: [T.any({ prompt: 'Damage to:', aiHint: { goal: 'damage' } })],
      run: async ctx => {
        const n = Math.max(0, ctx.data.card.power);
        if (n && ctx.targets[0]) await ctx.g.damageAny(ctx.data.card, ctx.targets[0], n);
      },
    }],
  };

  // ==================== ENDLESS PUNISHMENT (VALGAVOTH) ====================
  SC['Valgavoth, Harrower of Souls'] = {
    colorIdentityExtra: ['B', 'R'],
    triggers: [{
      on: 'lifeLost', desc: '+1/+1 and a card',
      filter: (g, self, d) => d.player !== self.ctrl && g.turnPlayer === d.player && d.events === 1,
      run: async ctx => {
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Barbflare Gremlin'] = {
    landTapHook: async (g, self, land, player, produced) => {
      if (!self.tapped) return;
      const types = Object.keys(produced || {}).filter(type => (produced[type] || 0) > 0);
      if (types.length) {
        let type = types[0];
        if (types.length > 1) {
          type = await player.controller.decide(g, {
            type: 'chooseOption', prompt: `${self.name}: additional mana of the type ${land.name} produced`,
            options: types.map(key => ({ key, label: key })), aiHint: { kind: 'manaColor' },
          });
          if (!types.includes(type)) type = types[0];
        }
        player.pool[type] = (player.pool[type] || 0) + 1;
      }
      await g.damagePlayer(land, player, 1);
    },
  };
  const bloodArtist = {
    triggers: [{
      on: 'dies', desc: 'Drain 1',
      filter: (g, self, d) => d.snap.types.includes('Creature'),
      targets: [T.player({ prompt: 'Who loses 1 life?', aiHint: { goal: 'drain' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        await ctx.g.loseLife(t, 1);
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
  };
  SC['Blood Artist'] = bloodArtist;
  SC['Falkenrath Noble'] = bloodArtist;
  SC['Blood Seeker'] = {
    triggers: [{
      on: 'etb', opt: true, desc: 'Lose 1 life',
      filter: (g, self, d) => d.card.is('Creature') && d.card.ctrl !== self.ctrl,
      run: async ctx => { await ctx.g.loseLife(ctx.data.card.ctrl, 1); },
    }],
  };
  SC['Braids, Arisen Nightmare'] = {
    triggers: [{
      on: 'endStep', opt: true, desc: 'Sacrifice → penalty', filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => g.bf().some(c => c.ctrl === self.ctrl && ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t))),
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const pool = g.bf().filter(c => c.ctrl === p);
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Braids: sacrifice', aiHint: { kind: 'braidsSac' },
        });
        if (!picked.length) return;
        const types = ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].filter(t => picked[0].is(t));
        await g.sacrifice(p, picked[0]);
        for (const o of E.eachOpp(g, p)) {
          const oPool = g.bf().filter(c => c.ctrl === o && types.some(t => c.is(t)));
          let sacd = false;
          if (oPool.length) {
            const oPick = await o.controller.decide(g, {
              type: 'chooseCards', from: oPool, min: 0, max: 1, prompt: `Braids: sacrifice (${types.join('/')}) or lose 2 life`, aiHint: { kind: 'braidsRespond' },
            });
            if (oPick.length) { await g.sacrifice(o, oPick[0]); sacd = true; }
          }
          if (!sacd) { await g.loseLife(o, 2); await g.draw(p, 1); }
        }
      },
    }],
  };
  SC['Brash Taunter'] = {
    triggers: [{
      on: 'dealtDamage', desc: 'Redirect damage',
      filter: (g, self, d) => d.target === self,
      targets: [T.opponent({ prompt: 'To whom?', aiHint: { goal: 'drain' } })],
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.targets[0], ctx.data.n); },
    }],
    abilities: [{
      label: 'Fight', cost: { mana: '{2}{R}', tap: true },
      targets: [{ what: 'creature', prompt: 'Fights:', filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c !== src, aiHint: { goal: 'fightTaunter' } }],
      run: async ctx => {
        const a = ctx.src, b = ctx.targets[0];
        if (!ctx.g.bf().includes(a) || !ctx.g.bf().includes(b) || !a.is('Creature') || !b.is('Creature') ||
            ctx.sourceZoneVersion != null && a.zoneVersion !== ctx.sourceZoneVersion) return;
        await ctx.g.damageBatch([
          { src: a, target: b, n: a.power },
          { src: b, target: a, n: b.power },
        ]);
      },
    }],
  };
  SC['Combustible Gearhulk'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: "Opponent's choice",
      targets: [T.opponent({ prompt: 'Which opponent chooses?', aiHint: { goal: 'drain' } })],
      run: async ctx => {
        const g = ctx.g, o = ctx.targets[0], p = ctx.you;
        const k = await o.controller.decide(g, {
          type: 'chooseOption', prompt: `Gearhulk: ${p.name} draws 3 OR mill 3 + damage?`,
          options: [{ key: 'draw', label: `${p.name} draws 3` }, { key: 'burn', label: 'Mill 3 + damage to me' }],
          aiHint: { kind: 'gearhulk', caster: p },
        });
        if (k === 'draw') await g.draw(p, 3);
        else {
          const milled = await g.mill(p, 3);
          const n = milled.reduce((s, c) => s + U.mv(c.def.cost || ''), 0);
          await g.damagePlayer(ctx.src, o, n);
        }
      },
    }],
  };
  SC['Fate Unraveler'] = {
    triggers: [{
      on: 'draw', desc: '1 damage',
      filter: (g, self, d) => d.player !== self.ctrl,
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, 1); },
    }],
  };
  SC['Fear of Burning Alive'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: '4 damage to opponents',
        run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 4); },
      },
      {
        on: 'damageToPlayer', desc: 'Delirium: damage to a creature',
        filter: (g, self, d) => {
          if (d.combat || !d.src || d.src.ctrl !== self.ctrl) return false;
          if (d.player === self.ctrl) return false;
          const types = new Set();
          for (const c of self.ctrl.graveyard) for (const t of c.def.types) types.add(t);
          return types.size >= 4;
        },
        targets: (g, self, d) => [{
          what: 'creature', prompt: 'Damage to a creature:',
          filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === d.player,
          aiHint: { goal: 'removal' },
        }],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], ctx.data.n); },
      },
    ],
  };
  SC['Florian, Voldaren Scion'] = {
    triggers: [{
      on: 'postcombatMain', desc: 'Impulse', filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => E.eachOpp(g, self.ctrl).reduce((s, o) => s + o.turnState.lifeLost, 0) > 0,
      run: async ctx => {
        const x = E.eachOpp(ctx.g, ctx.you).reduce((s, o) => s + o.turnState.lifeLost, 0);
        const top = ctx.you.library.slice(-x).reverse();
        if (!top.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'Exile (you may play it this turn):', aiHint: { kind: 'bestCard' },
        });
        const hid = picked[0] || top[0];
        for (const c of top) ctx.you.library.splice(ctx.you.library.indexOf(c), 1);
        hid.zone = 'exile'; ctx.you.exile.push(hid);
        hid.meta = { playableUntil: ctx.g.turnNo, playableBy: ctx.you };
        const rest = top.filter(c => c !== hid);
        U.shuffle(rest, ctx.g.rnd);
        for (const c of rest) { c.zone = 'library'; ctx.you.library.unshift(c); }
      },
    }],
  };
  SC['Gleeful Arsonist'] = {
    undying: true,
    triggers: [{
      on: 'cast', desc: 'Damage',
      filter: (g, self, d) => d.player !== self.ctrl && !d.isCreature,
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, Math.max(0, ctx.src.power)); },
    }],
  };
  SC['Gray Merchant of Asphodel'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Drain devotion',
      run: async ctx => {
        const x = ctx.g.devotion(ctx.you, ['B']);
        const total = await ctx.g.loseLifeOpponents(ctx.src, ctx.you, x);
        await ctx.g.gainLife(ctx.you, total);
      },
    }],
  };
  SC['Harsh Mentor'] = {
    triggers: [{
      on: 'abilityActivated', desc: '2 damage',
      filter: (g, self, d) => d.player !== self.ctrl && !d.isMana && (d.card.is('Artifact') || d.card.is('Creature') || d.card.is('Land')),
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, 2); },
    }],
  };
  SC['Kaervek the Merciless'] = {
    triggers: [{
      on: 'cast', desc: 'Damage = MV',
      filter: (g, self, d) => d.player !== self.ctrl && d.mv > 0,
      targets: [T.any({ prompt: 'Damage to:', aiHint: { goal: 'damage' } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.data.mv); },
    }],
  };
  SC['Kardur, Doomscourge'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Forced attacks',
        run: async ctx => {
          const you = ctx.you;
          for (const o of E.eachOpp(ctx.g, you)) {
            ctx.g.untilEffects.push({ kind: 'mustAttack', who: o, notPlayer: you, expires: 'untilTurnOf', whoTurn: you });
          }
          ctx.g.lg('Kardur: opponents must attack (not you)!');
        },
      },
      {
        on: 'dies', desc: 'Drain 1',
        filter: (g, self, d) => d.snap.types.includes('Creature') && d.snap.attacking,
        run: async ctx => {
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1);
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Kederekt Parasite'] = {
    triggers: [{
      on: 'draw', opt: true, desc: '1 damage',
      filter: (g, self, d) => d.player !== self.ctrl && g.bf().some(c => c.ctrl === self.ctrl && c.colors.includes('R')),
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, 1); },
    }],
  };
  SC['Massacre Girl'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: '-1/-1 chain',
      run: async ctx => {
        const g = ctx.g, self = ctx.src;
        E.pumpAllUntilEOT(g, (g2, c) => c !== self, -1, -1);
        g.delayed.push({
          on: 'dies', once: false, expires: 'eot', src: self, ctrl: ctx.you, name: 'Massacre Girl chain',
          filter: (g2, d) => d.snap.types.includes('Creature'),
          run: async c2 => { E.pumpAllUntilEOT(c2.g, (g3, c) => c !== self, -1, -1); await c2.g.checkSBA(); },
        });
        await g.checkSBA();
      },
    }],
  };
  SC['Massacre Wurm'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: "-2/-2 to opponents' creatures",
        run: async ctx => {
          E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl !== ctx.you, -2, -2);
          await ctx.g.checkSBA();
        },
      },
      {
        on: 'dies', desc: 'Lose 2 life',
        filter: (g, self, d) => d.snap.types.includes('Creature') && d.snap.ctrl !== self.ctrl,
        run: async ctx => { await ctx.g.loseLife(ctx.data.snap.ctrl, 2); },
      },
    ],
  };
  SC['Mayhem Devil'] = {
    triggers: [{
      on: 'sacrificed', desc: '1 damage',
      filter: () => true,
      targets: [T.any({ prompt: '1 damage to:', aiHint: { goal: 'damage', n: 1 } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
    }],
  };
  SC['Mogis, God of Slaughter'] = {
    colorIdentityExtra: ['B', 'R'],
    statics: [{
      phase: 1,
      cond: (g, self) => g.devotion(self.ctrl, ['B', 'R']) < 7,
      apply: (g, self, bf) => {
        self.cur.types = self.cur.types.filter(t => t !== 'Creature');
      },
    }],
    triggers: [{
      on: 'upkeep', desc: 'Sacrifice or 2 damage',
      filter: (g, self, d) => d.player !== self.ctrl,
      run: async ctx => {
        const g = ctx.g, o = ctx.data.player;
        const pool = g.creatures(o);
        let sacd = false;
        if (pool.length) {
          const pick = await o.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Mogis: sacrifice a creature or take 2 damage', aiHint: { kind: 'mogis' },
          });
          if (pick.length) { await g.sacrifice(o, pick[0]); sacd = true; }
        }
        if (!sacd) await g.damagePlayer(ctx.src, o, 2);
      },
    }],
  };
  SC['Nightshade Harvester'] = {
    triggers: [{
      on: 'landfall', desc: 'Lose 1 life, +1/+1',
      filter: (g, self, d) => d.card.ctrl !== self.ctrl,
      run: async ctx => {
        await ctx.g.loseLife(ctx.data.card.ctrl, 1);
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Persistent Constrictor'] = {
    persist: true,
    triggers: [{
      on: 'upkeep', desc: 'Lose 1 life + counter',
      filter: (g, self, d) => d.player !== self.ctrl,
      targets: (g, self, d) => [{
        what: 'creature', prompt: '-1/-1 counter on:', upTo: true,
        filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === d.player,
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => {
        const o = ctx.data.player;
        await ctx.g.loseLife(o, 1);
        if (ctx.targets[0]) { ctx.g.addCounters(ctx.targets[0], '-1/-1', 1); await ctx.g.checkSBA(); }
      },
    }],
  };
  SC['Rakdos, Lord of Riots'] = {
    castCond: (g, p, card) => E.eachOpp(g, p).some(o => o.turnState.lifeLost > 0),
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      if (!info.card.is('Creature')) return 0;
      return -E.eachOpp(g, self.ctrl).reduce((s, o) => s + o.turnState.lifeLost, 0);
    }],
  };
  SC['Rampaging Ferocidon'] = {
    noLifegain: 'all',
    triggers: [{
      on: 'etb', desc: '1 damage to its controller',
      filter: (g, self, d) => d.card !== self && d.card.is('Creature'),
      run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.card.ctrl, 1); },
    }],
  };
  SC['Star Athlete'] = {
    altCosts: [{ label: 'Blitz {3}{R}', altCostStr: '{3}{R}', blitz: true }],
    triggers: [
      {
        on: 'attacks', filter: attacksSelf, desc: 'Sacrifice or 5 damage',
        targets: [{
          what: 'permanent', prompt: 'Nonland permanent', upTo: true,
          filter: (g, c) => c.zone === 'battlefield' && !c.is('Land'),
          aiHint: { goal: 'removal' },
        }],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          const o = t.ctrl;
          const k = await o.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Star Athlete: sacrifice ${t.name} or take 5 damage?`,
            options: [{ key: 'sac', label: `Sacrifice ${t.name}` }, { key: 'dmg', label: 'Take 5 damage' }],
            aiHint: { kind: 'starAthlete', card: t },
          });
          if (k === 'sac') await ctx.g.sacrifice(o, t);
          else await ctx.g.damagePlayer(ctx.src, o, 5);
        },
      },
      {
        on: 'dies', filter: (g, self, d) => d.card === self, desc: 'Blitz draw',
        onlyIf: (g, self) => self.meta.blitzed,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'endStep', desc: 'Blitz sac', filter: (g, self, d) => self.meta.blitzed,
        run: async ctx => { if (ctx.src.zone === 'battlefield') await ctx.g.sacrifice(ctx.you, ctx.src); },
      },
    ],
  };
  SC['Stormfist Crusader'] = {
    triggers: [{
      on: 'upkeep', desc: 'Everyone draws and loses 1 life', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const q of ctx.g.apnapFrom(ctx.you)) { await ctx.g.draw(q, 1); await ctx.g.loseLife(q, 1); }
      },
    }],
  };
  SC['Syr Konrad, the Grim'] = {
    triggers: [
      {
        on: 'dies', desc: '1 damage to opponents',
        filter: (g, self, d) => d.card !== self && d.snap.types.includes('Creature'),
        run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
      },
      {
        on: 'cardToGraveyard', desc: '1 damage to opponents',
        filter: (g, self, d) => d.card.is('Creature') && d.from !== 'battlefield',
        run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
      },
      {
        on: 'cardLeftGraveyard', desc: '1 damage to opponents',
        filter: (g, self, d) => d.card.is('Creature'),
        run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
      },
    ],
    abilities: [{
      label: 'Each player mills 1', cost: { mana: '{1}{B}' },
      run: async ctx => { for (const q of ctx.g.alivePlayers()) await ctx.g.mill(q, 1); },
    }],
  };
  const tectonicChoice = async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Tectonic Giant:',
          options: [{ key: 'dmg', label: '3 damage to each opponent' }, { key: 'impulse', label: 'Impulse 2 (1 of 2)' }],
          aiHint: { kind: 'tectonic' },
        });
        if (k === 'dmg') await ctx.g.damageOpponents(ctx.src, ctx.you, 3);
        else {
          const top = ctx.you.library.slice(-2).reverse();
          if (!top.length) return;
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'Keep to play:', aiHint: { kind: 'bestCard' },
          });
          const keep = picked[0] || top[0];
          for (const c of top) ctx.you.library.splice(ctx.you.library.indexOf(c), 1);
          keep.zone = 'exile'; ctx.you.exile.push(keep);
          keep.meta = { playableUntilOwnTurn: ctx.you.turnsStarted + 1, playableBy: ctx.you };
          for (const c of top) if (c !== keep) { c.zone = 'library'; ctx.you.library.unshift(c); }
        }
      };
  SC['Tectonic Giant'] = {
    triggers: [
      { on: 'attacks', filter: attacksSelf, desc: 'Choice', run: tectonicChoice },
      {
        on: 'targeted', desc: "Opponent's spell targets it",
        filter: (g, self, d) => d.card === self && d.byPlayer !== self.ctrl && d.isSpell,
        run: tectonicChoice,
      },
    ],
  };
  SC['The Lord of Pain'] = {
    noLifegain: 'opps',
    triggers: [{
      on: 'castFirst', desc: 'Damage = MV',
      filter: (g, self, d) => d.mv > 0,
      targets: (g, self, d) => [T.player({
        prompt: 'Lord of Pain: who takes the damage?',
        filter: (g2, target) => target !== d.player,
        aiHint: { goal: 'lordOfPain', caster: d.player },
      })],
      run: async ctx => {
        if (ctx.targets[0]) await ctx.g.damagePlayer(ctx.src, ctx.targets[0], ctx.data.mv);
      },
    }],
  };
  SC['Vial Smasher the Fierce'] = {
    triggers: [{
      on: 'castFirst', desc: 'Damage to a random opponent',
      filter: (g, self, d) => d.player === self.ctrl && d.mv > 0,
      run: async ctx => {
        const opps = E.eachOpp(ctx.g, ctx.you);
        if (!opps.length) return;
        const opponent = opps[Math.floor(ctx.g.rnd() * opps.length)];
        const choices = [opponent, ...ctx.g.bf().filter(card => card.ctrl === opponent && card.is('Planeswalker'))];
        let chosen = choices[0];
        if (choices.length > 1) {
          const key = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Vial Smasher: ${opponent.name} or their planeswalker?`,
            options: choices.map((target, index) => ({ key: String(index), label: target.name, target })),
            aiHint: { kind: 'vialSmasher', opponent, n: ctx.data.mv },
          });
          chosen = choices[Number.parseInt(key, 10)] || opponent;
        }
        await ctx.g.damageAny(ctx.src, chosen, ctx.data.mv);
      },
    }],
  };
  SC['Bedevil'] = {
    targets: [{
      what: 'permanent', prompt: 'Artifact/creature/planeswalker',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Creature') || c.is('Planeswalker')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
  };
  const drawTwoLoseTwo = {
    targets: [T.player({ prompt: 'Who draws 2 and loses 2?', aiHint: { goal: 'drawSelf' } })],
    resolve: async ctx => { await ctx.g.draw(ctx.targets[0], 2); await ctx.g.loseLife(ctx.targets[0], 2); },
  };
  SC['Blood Pact'] = drawTwoLoseTwo;
  SC['Sign in Blood'] = drawTwoLoseTwo;
  SC['Rakdos Charm'] = {
    modes: {
      pick: 1,
      list: [
        { label: "Exile a player's graveyard", targets: [T.player({ prompt: 'Whose graveyard?', aiHint: { goal: 'gyHate' } })] },
        { label: 'Destroy an artifact', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artifact', aiHint: { goal: 'removal' } })] },
        { label: 'Each creature deals 1 damage to its controller', targets: [] },
      ],
    },
    resolve: async ctx => {
      const g = ctx.g, mi = ctx.mode[0];
      if (mi === 0) {
        const t = ctx.targets[0];
        for (const c of t.graveyard.slice()) await g.move(c, 'exile');
      } else if (mi === 1) {
        await g.destroy(ctx.targets[0]);
      } else {
        for (const q of g.alivePlayers()) {
          const n = g.creatures(q).length;
          if (n) await g.damagePlayer(null, q, n);
        }
      }
    },
  };
  SC['Suspended Sentence'] = {
    suspend: { cost: '{1}{B}', n: 3 },
    targets: [{
      what: 'creature', prompt: "Opponent's creature",
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const o = t.ctrl;
      await ctx.g.destroy(t);
      await ctx.g.loseLife(o, 3);
      if (!ctx.so.isCopy && ctx.src.zone === 'stack') {
        ctx.g.remove(ctx.src);
        ctx.src.zone = 'exile'; ctx.src.owner.exile.push(ctx.src);
        ctx.src.meta = { suspended: 3 };
        ctx.g.lg('Suspended Sentence: exiled with 3 time counters.');
      }
    },
  };
  SC['Grab the Prize'] = {
    addlCost: { discard: 1 },
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      const disc = ctx.so.discardedCards && ctx.so.discardedCards[0];
      if (disc && !disc.def.types.includes('Land')) {
        await ctx.g.damageOpponents(ctx.src, ctx.you, 2);
      }
    },
  };
  SC['Light Up the Stage'] = {
    altCosts: [{ label: 'Spectacle {R}', altCostStr: '{R}', cond: (g, p) => E.eachOpp(g, p).some(o => o.turnState.lifeLost > 0) }],
    resolve: async ctx => { E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 2, 'next'); },
  };
  SC['Sadistic Shell Game'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const chosen = new Set();
      for (const q of g.apnapFrom(g.nextPlayer(p))) {
        const pool = g.bf().filter(c => c.is('Creature') && c.ctrl !== q);
        if (!pool.length) continue;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: "Choose a creature you don't control to destroy", aiHint: { kind: 'shellGame', caster: p },
        });
        if (pick.length) chosen.add(pick[0]);
      }
      for (const c of chosen) if (c.zone === 'battlefield') await g.destroy(c);
    },
  };
  SC['Basilisk Collar'] = {
    equip: '{2}',
    attachGrant: (g, self, host) => { host.cur.kw.add('deathtouch'); host.cur.kw.add('lifelink'); },
  };
  SC['Mask of Griselbrand'] = {
    equip: '{3}',
    attachGrant: (g, self, host) => { host.cur.kw.add('flying'); host.cur.kw.add('lifelink'); },
    triggers: [{
      on: 'dies', opt: true, desc: 'Pay X: draw X',
      filter: (g, self, d) => d.snap.attachments && d.snap.attachments.includes(self.iid),
      run: async ctx => {
        const x = Math.max(0, ctx.data.snap.power);
        if (!x || ctx.you.life <= x) return;
        await ctx.g.loseLife(ctx.you, x, 'mask');
        await ctx.g.draw(ctx.you, x);
      },
    }],
  };
  SC['Séance Board'] = {
    triggers: [{
      on: 'endStep', desc: 'Soul counter', filter: () => true,
      onlyIf: (g, self) => g.diedThisTurn.some(s => s.types.includes('Creature')),
      run: async ctx => { ctx.g.addCounters(ctx.src, 'soul', 1); },
    }],
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const n = c.counters['soul'] || 0;
        return n ? [{ ANY: true, n }] : [];
      },
      restrict: (g, forSpell) => {
        const card = forSpell && forSpell.card;
        if (!card) return false;
        return card.is('Instant') || card.is('Sorcery') || card.def.subtypes.includes('Demon') || card.def.subtypes.includes('Spirit');
      },
    },
  };
  SC["Enchanter's Bane"] = {
    triggers: [{
      on: 'endStep', desc: 'Punish an enchantment', filter: (g, self, d) => d.player === self.ctrl,
      targets: [{
        what: 'permanent', prompt: 'Enchantment', upTo: true,
        filter: (g, c) => c.zone === 'battlefield' && c.is('Enchantment'),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const o = t.ctrl;
        const k = await o.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Enchanter's Bane: sacrifice ${t.name} or take ${t.mv} damage?`,
          options: [{ key: 'sac', label: 'Sacrifice' }, { key: 'dmg', label: `Take ${t.mv}` }],
          aiHint: { kind: 'starAthlete', card: t },
        });
        if (k === 'sac') await ctx.g.sacrifice(o, t);
        else await ctx.g.damagePlayer(t, o, t.mv);
      },
    }],
  };
  SC['Spiked Corridor'] = {
    roomHalves: [
      { key: 'spiked', label: 'Spiked Corridor {3}{R}', altCostStr: '{3}{R}' },
      { key: 'torture', label: 'Torture Pit {3}{R}', altCostStr: '{3}{R}' },
    ],
    triggers: [{
      on: 'unlockDoor', desc: '3 Devils',
      filter: (g, self, d) => d.card === self && d.key === 'spiked',
      run: async ctx => { await ctx.g.makeTokens('devil', ctx.you, { n: 3 }); },
    }],
    replace: [{
      event: 'damage',
      cond: (g, self) => (self.meta.unlocked || []).includes('torture'),
      applies: (g, ev, self) => ev.noncombat && !!ev.src && ev.src.ctrl === self.ctrl && ev.target instanceof MTG.Player && ev.target !== self.ctrl,
      run: (g, evt, src) => {
        if (evt.noncombat && evt.src && evt.src.ctrl === src.ctrl && evt.target instanceof MTG.Player && evt.target !== src.ctrl) return evt.n + 2;
        return evt.n;
      },
    }],
    abilities: [{
      label: 'Unlock the other door', cost: { mana: '{3}{R}' }, sorcery: true,
      cond: (g, c) => (c.meta.unlocked || []).length === 1,
      run: async ctx => {
        const other = (ctx.src.meta.unlocked || []).includes('spiked') ? 'torture' : 'spiked';
        ctx.src.meta.unlocked.push(other);
        ctx.g.lg(`Unlocked door: ${other === 'spiked' ? 'Spiked Corridor' : 'Torture Pit'}.`);
        await ctx.g.emit('unlockDoor', { card: ctx.src, key: other, ctrl: ctx.you });
      },
    }],
  };
  SC['Spiteful Visions'] = {
    triggers: [
      {
        on: 'drawStep', desc: 'Additional card', filter: () => true,
        run: async ctx => { await ctx.g.draw(ctx.data.player, 1); },
      },
      {
        on: 'draw', desc: '1 damage', filter: () => true,
        run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.player, 1); },
      },
    ],
  };
  SC['Theater of Horrors'] = {
    triggers: [{
      on: 'upkeep', desc: 'Exile from the top', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const p = ctx.you;
        if (!p.library.length) return;
        const c = p.library.pop();
        c.zone = 'exile'; p.exile.push(c);
        c.meta = { playableUntil: 9999, playableBy: p, needsOppLost: true, theaterSource: ctx.src.iid };
        ctx.g.lg(`Theater of Horrors: ${c.name} exiled.`);
      },
    }],
    abilities: [{
      label: '1 damage to an opponent', cost: { mana: '{3}{R}' },
      targets: [T.any({
        prompt: 'Opponent or planeswalker',
        filter: (g, target, ctrl) => target instanceof MTG.Player ? target !== ctrl : target.is('Planeswalker'),
        aiHint: { goal: 'damage', n: 1 },
      })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
    }],
  };
})();
