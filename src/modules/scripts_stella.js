// ===== scripts_stella.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Card scripts: Quick Draw (Stella Lee)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const myCastIS = (g, self, d) => d.player === self.ctrl;

  SC['Stella Lee, Wild Card'] = {
    colorIdentityExtra: ['U', 'R'],
    triggers: [{
      on: 'castSecond', desc: 'Impulse 1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 1, 'next'); },
    }],
    abilities: [{
      label: 'Kopiraj I/S spell', cost: { tap: true },
      cond: (g, c, p) => p.turnState.spellsCast >= 3,
      targets: [T.spell((g, so) => (so.card.is('Instant') || so.card.is('Sorcery')), { prompt: 'Tvoj I/S spell', aiHint: { goal: 'copySpell' } })],
      run: async ctx => {
        const so = ctx.targets[0];
        if (so && ctx.g.stack.includes(so)) await ctx.g.copySpell(so, ctx.you, { mayNewTargets: true });
      },
    }],
  };
  SC['Archmage Emeritus'] = {
    triggers: [
      { on: 'castIS', desc: 'Magecraft: vuci', filter: myCastIS, run: async ctx => { await ctx.g.draw(ctx.you, 1); } },
      { on: 'spellCopied', desc: 'Magecraft: vuci', filter: (g, self, d) => d.ctrl === self.ctrl && d.isInstantSorcery, run: async ctx => { await ctx.g.draw(ctx.you, 1); } },
    ],
  };
  SC['Bloodthirsty Adversary'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Plati {2}{R}: kopije iz groblja',
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        let times = 0;
        while (times < 3 && g.canPayMana(p, U.parseCost('{2}{R}'))) {
          const yes = await p.controller.decide(g, {
            type: 'chooseOption', prompt: 'Plati {2}{R} za Adversary?',
            options: [{ key: 'no', label: 'Ne' }, { key: 'yes', label: 'Da' }],
            aiHint: { kind: 'adversary', times },
          });
          if (yes !== 'yes') break;
          await g.payMana(p, U.parseCost('{2}{R}'));
          times++;
        }
        if (!times) return;
        g.addCounters(ctx.src, '+1/+1', times);
        const cands = p.graveyard.filter(c => (c.is('Instant') || c.is('Sorcery')) && U.mv(c.def.cost || '') <= 3);
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 0, max: times, prompt: `Kopiraj do ${times} I/S iz groblja`, aiHint: { kind: 'bestCard' },
        });
        for (const c of picked) {
          await E.castCopyFromZone(g, p, c);
        }
      },
    }],
  };
  E.castCopyFromZone = async function (g, p, card) {
    // cast a "copy" of a card without moving the original (it stays where it is)
    const fake = new MTG.CardInst(card.def, p);
    fake.zone = 'copyspace';
    fake.isCopySpell = true;
    await g.castSpell(p, fake, { alt: { free: true }, from: 'copy' });
  };
  SC['Crackling Spellslinger'] = {
    kws: ['flash'],
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Storm na sljedeći I/S',
      run: async ctx => { ctx.you.stormNext = true; ctx.g.lg('Sljedeći I/S ovaj potez ima STORM.'); },
    }],
  };
  SC['Electrostatic Field'] = {
    triggers: [{
      on: 'castIS', desc: '1 šteta protivnicima', filter: myCastIS,
      run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
    }],
  };
  SC['Eris, Roar of the Storm'] = {
    selfCostAdjust: (g, card, p) => {
      const mvs = new Set(p.graveyard.filter(c => c.is('Instant') || c.is('Sorcery')).map(c => U.mv(c.def.cost || '')));
      return -2 * mvs.size;
    },
    triggers: [{
      on: 'castSecond', desc: 'Dragon token', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('dragonElemental', ctx.you); },
    }],
  };
  const isCostReducer = {
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      if (info.card.is('Instant') || info.card.is('Sorcery')) return -1;
      return 0;
    }],
  };
  SC['Goblin Electromancer'] = isCostReducer;
  SC['Thunderclap Drake'] = Object.assign({}, isCostReducer, {
    abilities: [{
      label: 'Žrtvuj: kopije po commander castovima', cost: { mana: '{2}{U}', sacSelf: true },
      run: async ctx => {
        const you = ctx.you;
        ctx.g.delayed.push({
          on: 'castIS', once: true, expires: 'eot', ctrl: you, name: 'Thunderclap kopije',
          filter: (g, d) => d.player === you,
          run: async c2 => {
            const so = c2.data.so;
            if (!c2.g.stack.includes(so)) return;
            const n = you.commanderCasts;
            for (let i = 0; i < n; i++) await c2.g.copySpell(so, you, { mayNewTargets: true });
          },
        });
        ctx.g.lg('Sljedeći I/S se kopira po broju dosadašnjih castova komandera.');
      },
    }],
  });
  SC['Haughty Djinn'] = Object.assign({
    cdaPower: (g, c) => c.ctrl.graveyard.filter(x => x.is('Instant') || x.is('Sorcery')).length,
  }, isCostReducer);
  SC['Guttersnipe'] = {
    triggers: [{
      on: 'castIS', desc: '2 štete protivnicima', filter: myCastIS,
      run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 2); },
    }],
  };
  SC['Kaza, Roil Chaser'] = {
    colorIdentityExtra: ['U', 'R'],
    abilities: [{
      label: 'Sljedeći I/S jeftiniji', cost: { tap: true },
      run: async ctx => {
        const x = ctx.g.creatures(ctx.you).filter(c => c.hasSub('Wizard')).length;
        if (!x) return;
        ctx.you.tempReductions = ctx.you.tempReductions || [];
        ctx.you.tempReductions.push({ filter: (g, c) => c.is('Instant') || c.is('Sorcery'), delta: -x, once: true });
        ctx.g.lg(`Kaza: sljedeći I/S košta {${x}} manje.`);
      },
    }],
  };
  SC['Murmuring Mystic'] = {
    triggers: [{ on: 'castIS', desc: 'Bird Illusion', filter: myCastIS, run: async ctx => { await ctx.g.makeTokens('birdIllusion', ctx.you); } }],
  };
  SC['Niv-Mizzet, Parun'] = {
    uncounterable: true,
    triggers: [
      {
        on: 'draw', desc: '1 šteta', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.any({ prompt: '1 šteta u:', aiHint: { goal: 'damage', n: 1 } })],
        run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
      },
      { on: 'castIS', desc: 'Vuci', filter: () => true, run: async ctx => { await ctx.g.draw(ctx.you, 1); } },
    ],
  };
  SC['Octavia, Living Thesis'] = {
    selfCostAdjust: (g, card, p) => p.graveyard.filter(c => c.is('Instant') || c.is('Sorcery')).length >= 8 ? -8 : 0,
    triggers: [{
      on: 'castIS', desc: 'Magecraft 8/8', filter: myCastIS,
      targets: [T.creature({ prompt: 'Baza 8/8:', aiHint: { goal: 'octavia' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            c.cur.power = 8 + (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
            c.cur.toughness = 8 + (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Pteramander'] = {
    abilities: [{
      label: 'Adapt 4', cost: {
        mana: (g, c) => {
          const red = c.ctrl.graveyard.filter(x => x.is('Instant') || x.is('Sorcery')).length;
          return `{${Math.max(0, 7 - red)}}{U}`;
        },
      },
      cond: (g, c) => !(c.counters['+1/+1'] > 0),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 4); },
    }],
  };
  SC['Storm-Kiln Artist'] = {
    statics: [{
      apply: (g, self, bf) => { self.cur.power += bf.filter(c => c.ctrl === self.ctrl && c.is('Artifact')).length; },
    }],
    triggers: [
      { on: 'castIS', desc: 'Treasure', filter: myCastIS, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } },
      { on: 'spellCopied', desc: 'Treasure', filter: (g, self, d) => d.ctrl === self.ctrl && d.isInstantSorcery, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } },
    ],
  };
  SC['Talrand, Sky Summoner'] = {
    triggers: [{ on: 'castIS', desc: 'Drake', filter: myCastIS, run: async ctx => { await ctx.g.makeTokens('drake', ctx.you); } }],
  };
  SC['Third Path Iconoclast'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Soldier', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('soldierArt', ctx.you); },
    }],
  };
  SC['Veyran, Voice of Duality'] = {
    colorIdentityExtra: ['U', 'R'],
    doublesMagecraft: true,
    triggers: [
      { on: 'castIS', desc: '+1/+1 EOT', filter: myCastIS, run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 1); } },
      { on: 'spellCopied', desc: '+1/+1 EOT', filter: (g, self, d) => d.ctrl === self.ctrl && d.isInstantSorcery, run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 1); } },
    ],
  };
  SC['Young Pyromancer'] = {
    triggers: [{ on: 'castIS', desc: 'Elemental', filter: myCastIS, run: async ctx => { await ctx.g.makeTokens('elemental11', ctx.you); } }],
  };
  SC['Arcane Denial'] = {
    targets: [T.spell(null, { prompt: 'Counter spell', aiHint: { goal: 'counter' } })],
    resolve: async ctx => {
      const so = ctx.targets[0], g = ctx.g;
      if (!so || !g.stack.includes(so)) return;
      const caster = so.ctrl;
      if (MTG.isUncounterable(g, so)) { g.lg(`${so.card.name} ne može biti counterovan.`); return; }
      g.stack.splice(g.stack.indexOf(so), 1);
      if (!so.isCopy) await g.move(so.card, 'graveyard');
      g.lg(`${so.name} je COUNTEROVAN!`, 'counter');
      g.note('stack', {});
      const you = ctx.you;
      g.delayed.push({
        on: 'upkeep', once: true, name: 'Arcane Denial: vučenje', ctrl: caster,
        run: async c2 => {
          const n = await caster.controller.decide(c2.g, {
            type: 'chooseX', min: 0, max: 2, prompt: 'Arcane Denial: koliko karata vučeš?', aiHint: { kind: 'chooseX' },
          });
          await c2.g.draw(caster, Math.max(0, Math.min(2, Number(n) || 0)));
        },
      });
      g.delayed.push({
        on: 'upkeep', once: true, name: 'Arcane Denial: vučenje', ctrl: you,
        run: async c2 => { await c2.g.draw(you, 1); },
      });
    },
  };
  SC['Dig Through Time'] = {
    altCosts: [{ label: 'Delve', delve: true }],
    resolve: async ctx => {
      const p = ctx.you, g = ctx.g;
      const top = p.library.slice(-7).reverse();
      if (!top.length) return;
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: top, min: Math.min(2, top.length), max: Math.min(2, top.length), prompt: 'Uzmi 2:',
        aiHint: { kind: 'bestCard' },
      });
      for (const c of top) p.library.splice(p.library.indexOf(c), 1);
      for (const c of picked) { c.zone = 'hand'; p.hand.push(c); }
      const rest = top.filter(c => !picked.includes(c));
      const proposed = rest.length ? await p.controller.decide(g, {
        type: 'chooseCards', from: rest, min: rest.length, max: rest.length,
        prompt: 'Dig Through Time: redoslijed na dnu (prva karta najdublje)',
        aiHint: { kind: 'digBottomOrder' },
      }) : [];
      const order = Array.isArray(proposed) && proposed.length === rest.length && proposed.every(card => rest.includes(card))
        ? proposed : rest;
      for (const card of order) card.zone = 'library';
      p.library.unshift(...order);
    },
  };
  SC['Galvanic Iteration'] = {
    flashback: { cost: '{1}{U}{R}', altCostStr: '{1}{U}{R}', speed: 'instant' },
    resolve: async ctx => {
      const you = ctx.you;
      ctx.g.delayed.push({
        on: 'castIS', once: true, expires: 'eot', ctrl: you, name: 'Galvanic kopija',
        filter: (g, d) => d.player === you,
        run: async c2 => { await c2.g.copySpell(c2.data.so, you, { mayNewTargets: true }); },
      });
      ctx.g.lg('Sljedeći I/S ovaj potez se kopira.');
    },
  };
  SC['Opt'] = { resolve: async ctx => { await E.scry(ctx.g, ctx.you, 1); await ctx.g.draw(ctx.you, 1); } };
  SC['Pongify'] = {
    targets: [T.creature({ prompt: 'Uništi (3/3 Ape)', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], c2 = t.ctrl;
      if (await ctx.g.destroy(t, { noRegen: true })) await ctx.g.makeTokens('ape33', c2);
    },
  };
  SC['Radical Idea'] = {
    jumpstart: { altCostStr: '{1}{U}', speed: 'instant' },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 1); },
  };
  SC['Think Twice'] = {
    flashback: { cost: '{2}{U}', altCostStr: '{2}{U}', speed: 'instant' },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 1); },
  };
  SC["Baral's Expertise"] = {
    targets: [{
      what: 'permanent', prompt: 'Do 3 artefakta/stvorenja', count: 3, upTo: true,
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Creature')),
      aiHint: { goal: 'bounce' },
    }],
    resolve: async ctx => {
      const g = ctx.g;
      for (const t of (ctx.targets[0] || [])) if (t && t.zone === 'battlefield') await g.move(t, 'hand');
      const cands = ctx.you.hand.filter(c => !c.is('Land') && U.mv(c.def.cost || '') <= 4);
      if (cands.length) {
        const picked = await ctx.you.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Baci besplatno (MV≤4):', aiHint: { kind: 'bestCard' },
        });
        if (picked.length) await g.castSpell(ctx.you, picked[0], { alt: { free: true }, from: 'hand' });
      }
    },
  };
  SC['Curse of the Swine'] = {
    targets: (g, card, castOpts) => [{
      what: 'creature', prompt: 'Egzilaj X stvorenja', count: 6, upTo: true,
      filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature'),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const list = (ctx.targets[0] || []).slice(0, ctx.x || 0);
      for (const t of list) {
        if (t.zone !== 'battlefield') continue;
        const c2 = t.ctrl;
        await ctx.g.exileCard(t);
        await ctx.g.makeTokens('boar22', c2);
      }
    },
  };
  SC['Deep Analysis'] = {
    flashback: { cost: '{1}{U}', altCostStr: '{1}{U}', lifeCost: 3, speed: 'sorcery' },
    targets: [T.player({ prompt: 'Ko vuče 2?', aiHint: { goal: 'drawSelf' } })],
    resolve: async ctx => { await ctx.g.draw(ctx.targets[0], 2); },
  };
  SC['Elemental Eruption'] = {
    storm: true,
    resolve: async ctx => { await ctx.g.makeTokens('dragonElemental', ctx.you); },
  };
  SC['Epic Experiment'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you, x = ctx.x || 0;
      const top = [];
      for (let i = 0; i < x && p.library.length; i++) { const c = p.library.pop(); c.zone = 'exile-temp'; top.push(c); }
      g.lg(`Epic Experiment (X=${x}): ${top.map(c => c.name).join(', ') || 'ništa'}.`);
      for (const c of top) {
        if ((c.is('Instant') || c.is('Sorcery')) && U.mv(c.def.cost || '') <= x) {
          c.zone = 'hand'; p.hand.push(c);
          const ok = await E.mayCastFree(g, p, c, {});
          if (!ok) { p.hand.splice(p.hand.indexOf(c), 1); await g.move(c, 'graveyard'); }
        } else {
          await g.move(c, 'graveyard');
        }
      }
    },
  };
  SC['Expressive Iteration'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const top = p.library.slice(-3).reverse();
      if (!top.length) return;
      const toHand = await p.controller.decide(g, {
        type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'U ruku:', aiHint: { kind: 'bestCard' },
      });
      const hand = toHand[0] || top[0];
      const rest = top.filter(c => c !== hand);
      let exiled = null;
      if (rest.length) {
        const toEx = await p.controller.decide(g, {
          type: 'chooseCards', from: rest, min: 1, max: 1, prompt: 'Egzilaj (igraj ovaj potez):', aiHint: { kind: 'bestCard' },
        });
        exiled = toEx[0] || rest[0];
      }
      for (const c of top) p.library.splice(p.library.indexOf(c), 1);
      hand.zone = 'hand'; p.hand.push(hand);
      if (exiled) {
        exiled.zone = 'exile'; p.exile.push(exiled);
        exiled.meta = { playableUntil: g.turnNo, playableBy: p };
      }
      for (const c of top) if (c !== hand && c !== exiled) { c.zone = 'library'; p.library.unshift(c); }
    },
  };
  SC['Faithless Looting'] = {
    flashback: { cost: '{2}{R}', altCostStr: '{2}{R}', speed: 'sorcery' },
    resolve: async ctx => { await E.mayDrawDiscard(ctx.g, ctx.you, 2, 2); },
  };
  SC['Finale of Promise'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you, x = ctx.x || 0;
      const inst = p.graveyard.filter(c => c.is('Instant') && U.mv(c.def.cost || '') <= x);
      const sorc = p.graveyard.filter(c => c.is('Sorcery') && U.mv(c.def.cost || '') <= x);
      for (const pool of [inst, sorc]) {
        if (!pool.length) continue;
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Baci besplatno iz groblja:', aiHint: { kind: 'bestCard' },
        });
        if (picked.length) {
          const c = picked[0];
          await g.castSpell(p, c, { alt: { free: true, exileAfter: true }, from: 'graveyard' });
        }
      }
    },
  };
  SC['Finale of Revelation'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you, x = ctx.x || 0;
      if (x >= 10) {
        while (p.graveyard.length) { const c = p.graveyard.pop(); c.zone = 'library'; p.library.push(c); }
        U.shuffle(p.library, g.rnd);
        await g.draw(p, x);
        const lands = g.bf().filter(card => card.is('Land'));
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: lands, min: 0, max: Math.min(5, lands.length),
          prompt: 'Finale of Revelation: untapuj do pet landova', aiHint: { kind: 'finaleUntap' },
        });
        for (const land of picked.filter(card => lands.includes(card)).slice(0, 5)) land.tapped = false;
        p.noMaxHandForever = true;
        g.lg('FINALE OF REVELATION X≥10: mega mod!');
      } else {
        await g.draw(p, x);
      }
    },
  };
  SC['Lock and Load'] = {
    plot: '{3}{U}',
    resolve: async ctx => {
      const others = ctx.you.turnState.spellsCastList.filter(s => s.card !== ctx.src && (s.card.is('Instant') || s.card.is('Sorcery'))).length;
      await ctx.g.draw(ctx.you, 1 + others);
    },
  };
  SC["Mizzix's Mastery"] = {
    exileOnResolve: true,
    altCosts: [{ label: 'Overload {5}{R}{R}{R}', altCostStr: '{5}{R}{R}{R}', overloaded: true, speed: 'sorcery' }],
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'I/S iz groblja',
      filter: (g, c) => c.is('Instant') || c.is('Sorcery'),
      aiHint: { goal: 'bestGyCast' },
    }],
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      if (ctx.so.castOpts && ctx.so.castOpts.overloaded) {
        const all = p.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        for (const c of all.slice()) {
          await g.move(c, 'exile');
          await E.castCopyFromZone(g, p, c);
        }
      } else {
        const t = ctx.targets[0];
        if (t && t.zone === 'graveyard') {
          await g.move(t, 'exile');
          await E.castCopyFromZone(g, p, t);
        }
      }
    },
  };
  SC['Ponder'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const top = p.library.slice(-3).reverse();
      if (top.length) {
        const k = await p.controller.decide(g, {
          type: 'chooseOption', prompt: `Vrh: ${top.map(c => c.name).join(', ')}. Shuffle?`,
          options: [{ key: 'keep', label: 'Zadrži' }, { key: 'shuffle', label: 'Promiješaj' }],
          aiHint: { kind: 'ponder', top },
        });
        if (k === 'shuffle') U.shuffle(p.library, g.rnd);
      }
      await g.draw(p, 1);
    },
  };
  SC['Preordain'] = { resolve: async ctx => { await E.scry(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 1); } };
  SC['Pyretic Charge'] = {
    plot: '{3}{R}',
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const n = p.hand.length;
      await g.discard(p, p.hand.slice());
      await g.draw(p, 4);
      if (n) E.pumpAllUntilEOT(g, (g2, c) => c.ctrl === p, n, 0);
    },
  };
  SC['Rousing Refrain'] = {
    suspend: { cost: '{1}{R}', n: 3 },
    targets: [T.opponent({ prompt: 'Po čijoj ruci?', aiHint: { goal: 'maxHand' } })],
    resolve: async ctx => {
      const n = ctx.targets[0].hand.length;
      ctx.you.pool.R += n;
      ctx.you.persistMana = ctx.you.persistMana || {};
      ctx.you.persistMana.R = (ctx.you.persistMana.R || 0) + n;
      ctx.g.lg(`Rousing Refrain: +${n} {R} (ostaje do kraja poteza).`);
      if (!ctx.so.isCopy && ctx.src.zone === 'stack') {
        ctx.g.remove(ctx.src);
        ctx.src.zone = 'exile'; ctx.src.owner.exile.push(ctx.src);
        ctx.src.meta = { suspended: 3 };
      }
    },
  };
  SC['Serum Visions'] = { resolve: async ctx => { await ctx.g.draw(ctx.you, 1); await E.scry(ctx.g, ctx.you, 2); } };
  SC["Tezzeret's Gambit"] = {
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2); await E.proliferate(ctx.g, ctx.you); },
  };
  SC['Treasure Cruise'] = {
    altCosts: [{ label: 'Delve', delve: true }],
    resolve: async ctx => { await ctx.g.draw(ctx.you, 3); },
  };
  SC['Vandalblast'] = {
    altCosts: [{ label: 'Overload {4}{R}', altCostStr: '{4}{R}', overloaded: true, speed: 'sorcery' }],
    targets: [{
      what: 'permanent', prompt: 'Artefakt protivnika',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Artifact') && c.ctrl !== ctrl,
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      if (ctx.so.castOpts && ctx.so.castOpts.overloaded) {
        for (const c of ctx.g.bf().filter(c => c.is('Artifact') && c.ctrl !== ctx.you).slice()) await ctx.g.destroy(c);
      } else if (ctx.targets[0]) {
        await ctx.g.destroy(ctx.targets[0]);
      }
    },
  };
  SC['Volcanic Torrent'] = {
    cascade: true,
    resolve: async ctx => {
      const x = ctx.you.turnState.spellsCast;
      for (const c of ctx.g.bf().filter(c => (c.is('Creature') || c.is('Planeswalker')) && c.ctrl !== ctx.you).slice()) {
        await ctx.g.damageCreature(ctx.src, c, x, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Windfall'] = {
    resolve: async ctx => {
      const g = ctx.g;
      let maxN = 0;
      for (const q of g.alivePlayers()) maxN = Math.max(maxN, q.hand.length);
      for (const q of g.alivePlayers()) await g.discard(q, q.hand.slice());
      for (const q of g.alivePlayers()) await g.draw(q, maxN);
    },
  };
  SC['Cursed Mirror'] = {
    mana: { cost: { tap: true }, produce: [{ R: 1 }] },
    asEnters: async (g, card) => {
      const cands = g.bf().filter(c => c.is('Creature'));
      if (!cands.length) return;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Mirror kopira (do kraja poteza):', aiHint: { kind: 'mirrorCopy' },
      });
      if (!picked.length) return;
      const t = picked[0];
      const original = card.def;
      const base = t.isCopyOf || t.def;
      card.meta.cursedMirrorOriginal = original;
      card.meta.cursedMirrorTurn = g.turnNo;
      card.def = Object.assign({}, base, {
        kws: [...new Set([...(base.kws || []), 'haste'])],
      });
      card.isCopyOf = base;
      g.recalc();
      g.lg(`Cursed Mirror postaje potpuna kopija ${t.name} do kraja poteza.`);
    },
  };
  SC["Forger's Foundry"] = {
    mana: {
      cost: { tap: true }, produce: [{ U: 1 }],
      onProduce: async (g, source, p, chosen, forSpell) => {
        const spell = forSpell && forSpell.card;
        if (spell && (spell.is('Instant') || spell.is('Sorcery')) && spell.mv <= 3) {
          forSpell.foundrySource = source.iid;
        }
      },
    },
    abilities: [{
      label: 'Baci pohranjene spellove besplatno', sorcery: true,
      cost: { mana: '{3}{U}{U}', tap: true },
      cond: (g, source) => (source.meta.foundryCards || []).some(iid => {
        const c = g.byIid(iid);
        return c && c.zone === 'exile' && c.meta.foundrySource === source.iid;
      }),
      run: async ctx => {
        const pool = (ctx.src.meta.foundryCards || []).map(iid => ctx.g.byIid(iid)).filter(c =>
          c && c.zone === 'exile' && c.meta.foundrySource === ctx.src.iid && (c.is('Instant') || c.is('Sorcery')));
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: pool.length,
          prompt: 'Forger\'s Foundry: izaberi spellove koje bacaš besplatno',
          aiHint: { kind: 'freeCast' },
        });
        for (const card of picked) {
          if (card.zone !== 'exile') continue;
          await ctx.g.castSpell(ctx.you, card, { alt: { free: true }, from: 'exile' });
        }
      },
      aiScore: (g, source) => (source.meta.foundryCards || []).length * 3,
    }],
  };
  SC['Leyline Dowser'] = {
    abilities: [
      {
        label: 'Mill 1 (I/S u ruku)', cost: { mana: '{1}', tap: true },
        run: async ctx => {
          const milled = await ctx.g.mill(ctx.you, 1);
          const c = milled[0];
          if (c && (c.is('Instant') || c.is('Sorcery')) && c.zone === 'graveyard') {
            ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
            ctx.g.lg(`${c.name} ide u ruku.`);
          }
        },
      },
      {
        label: 'Untapaj (tapuj legendu)', cost: {},
        cond: (g, c, p) => c.tapped && g.creatures(p).some(x => (x.cur.super || []).includes('Legendary') && !x.tapped),
        run: async ctx => {
          const pool = ctx.g.creatures(ctx.you).filter(x => (x.cur.super || []).includes('Legendary') && !x.tapped);
          if (!pool.length) return;
          pool[0].tapped = true;
          ctx.src.tapped = false;
        },
      },
    ],
  };
  SC['Midnight Clock'] = {
    mana: { cost: { tap: true }, produce: [{ U: 1 }] },
    abilities: [{
      label: 'Hour counter', cost: { mana: '{2}{U}' },
      run: async ctx => { ctx.g.addCounters(ctx.src, 'hour', 1); await clockCheck(ctx); },
    }],
    triggers: [{
      on: 'upkeep', desc: 'Hour counter', filter: () => true,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'hour', 1, true); await clockCheck(ctx); },
    }],
  };
  async function clockCheck(ctx) {
    if ((ctx.src.counters['hour'] || 0) >= 12 && ctx.src.zone === 'battlefield') {
      const g = ctx.g, p = ctx.you;
      while (p.hand.length) { const c = p.hand.pop(); c.zone = 'library'; p.library.push(c); }
      while (p.graveyard.length) { const c = p.graveyard.pop(); c.zone = 'library'; p.library.push(c); }
      U.shuffle(p.library, g.rnd);
      await g.draw(p, 7);
      await g.exileCard(ctx.src);
      g.lg('Midnight Clock: ponoć! Nova ruka od 7.');
    }
  }
  SC['Smoldering Stagecoach'] = {
    crew: 2,
    cdaPower: (g, c) => c.ctrl.graveyard.filter(x => x.is('Instant') || x.is('Sorcery')).length,
    triggers: [{
      on: 'attacks', filter: (g, self, d) => d.card === self, desc: 'Cascade grantovi',
      run: async ctx => {
        const you = ctx.you;
        you.nextCascade = you.nextCascade || [];
        you.nextCascade.push((g, card) => card.is('Instant'));
        you.nextCascade.push((g, card) => card.is('Sorcery'));
        ctx.g.lg('Sljedeći instant i sorcery imaju cascade.');
      },
    }],
  };
  SC['Winged Boots'] = {
    equip: '{1}',
    attachGrant: (g, self, host) => { host.cur.kw.add('flying'); host.cur.wardCost = { mana: '{4}' }; },
  };
  SC['Arcane Bombardment'] = {
    triggers: [{
      on: 'castIS', desc: 'Kopije iz egzila', filter: (g, self, d) => {
        if (d.player !== self.ctrl) return false;
        const isCount = self.ctrl.turnState.spellsCastList.filter(s => s.card.is('Instant') || s.card.is('Sorcery')).length;
        return isCount === 1;
      },
      run: async ctx => {
        const g = ctx.g, p = ctx.you, self = ctx.src;
        const pool = p.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (pool.length) {
          const c = pool[Math.floor(g.rnd() * pool.length)];
          await g.move(c, 'exile');
          self.meta.bomb = self.meta.bomb || [];
          self.meta.bomb.push(c.iid);
          g.lg(`Arcane Bombardment egzilira: ${c.name}.`);
        }
        for (const iid of self.meta.bomb || []) {
          const c = g.byIid(iid);
          if (!c) continue;
          const yes = await p.controller.decide(g, {
            type: 'chooseOption', prompt: `Kopija ${c.name} — baci besplatno?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'freeCast', card: c },
          });
          if (yes === 'yes') await E.castCopyFromZone(g, p, c);
        }
      },
    }],
  };
  SC['Propaganda'] = { attackTax: 2 };
  SC['Shark Typhoon'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Shark X/X', filter: (g, self, d) => d.player === self.ctrl && d.mv > 0,
      run: async ctx => {
        const x = ctx.data.mv;
        const def = Object.assign({}, MTG.TOKENS.shark, { power: String(x), toughness: String(x) });
        await ctx.g.makeTokens(def, ctx.you);
      },
    }],
    cycling: {
      cost: (g, c) => '{X}{1}{U}', xCycling: true,
      effect: async ctx => {
        const x = ctx.cycleX || 0;
        const def = Object.assign({}, MTG.TOKENS.shark, { power: String(x), toughness: String(x) });
        await ctx.g.makeTokens(def, ctx.you);
      },
    },
  };
})();
