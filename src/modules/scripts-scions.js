// ===== scripts-scions.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// SCIONS & SPELLCRAFT (FIC) — commander: Y'shtola, Night's Blessed
// Esper spellslinger: noncreature spellovi drenaju i vuku.
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const etbSelf = (g, self, d) => d.card === self;
  const mvOf = (card) => U.mv(card.def.cost || '');

  SC['Y\'shtola, Night\'s Blessed'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Drain 2 / +2 života',
      filter: (g, self, d) => d.player === self.ctrl && d.card && mvOf(d.card) >= 3,
      run: async ctx => {
        for (const o of ctx.g.players) if (o !== ctx.you && !o.lost) await ctx.g.loseLife(o, 2, "Y'shtola");
        await ctx.g.gainLife(ctx.you, 2);
      },
    }, {
      on: 'endStep', desc: 'Neko izgubio 4+ života → vuci',
      filter: (g, self, d) => g.players.some(p => (p.turnState && p.turnState.lifeLost >= 4)),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC['Lyse Hext'] = {
    costMods: [(g, self, info) =>
      info.player === self.ctrl && info.card && !info.card.is('Creature') ? -1 : 0],
    statics: [{
      apply: (g, self) => {
        if ((self.ctrl.turnState.nonCreatureSpells || 0) >= 2) self.cur.kw.add('double strike');
      },
    }],
  };

  SC['G\'raha Tia, Scion Reborn'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Plati X života: Hero sa X countera', opt: true, oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const x = ctx.data.card ? mvOf(ctx.data.card) : 0;
        if (!x || ctx.you.life <= x) return;
        await ctx.g.loseLife(ctx.you, x, "G'raha Tia");
        const made = await ctx.g.makeTokens('robot11', ctx.you);
        if (made[0]) ctx.g.addCounters(made[0], '+1/+1', x);
      },
    }],
  };

  SC['Papalymo Totolymo'] = {
    triggers: [{
      on: 'castNonCreature', desc: '1 šteta svima / +1 život',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const o of ctx.g.players) if (o !== ctx.you && !o.lost) await ctx.g.damagePlayer(ctx.src, o, 1);
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
    abilities: [{
      label: 'Protivnici koji su izgubili život žrtvuju najjače',
      cost: { mana: '{4}', tap: true, sacSelf: true },
      run: async ctx => {
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
          if (!opponent.turnState.lifeLost) continue;
          const creatures = ctx.g.creatures(opponent);
          if (!creatures.length) continue;
          const greatest = Math.max(...creatures.map(c => c.power));
          const choices = creatures.filter(c => c.power === greatest);
          const picked = await opponent.controller.decide(ctx.g, {
            type: 'chooseCards', from: choices, min: 1, max: 1,
            prompt: 'Papalymo: žrtvuj stvorenje najveće snage', aiHint: { kind: 'forcedSac' },
          });
          if (picked[0]) await ctx.g.sacrifice(opponent, picked[0]);
        }
      },
    }],
  };

  SC['Hermes, Overseer of Elpis'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Bird token',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('birdU', ctx.you); },
    }, {
      on: 'attackersDeclared', desc: 'Scry 2 za Birdove',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.hasSub('Bird')),
      run: async ctx => { await E.scry(ctx.g, ctx.you, 2); },
    }],
  };

  SC['Estinien Varlineau'] = {
    triggers: [
      {
        on: 'castNonCreature', desc: 'Counter + flying',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); E.grantUntilEOT(ctx.g, ctx.src, ['flying']); },
      },
      {
        on: 'postcombatMain', desc: 'Karte za pogođene protivnike',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const opponents = new Set((ctx.you.turnState.combatDamageHits || [])
            .filter(hit => hit.ctrl === ctx.you && (hit.card === ctx.src || hit.card.hasSub('Dragon')))
            .map(hit => hit.player));
          const x = opponents.size;
          if (x) { await ctx.g.draw(ctx.you, x); await ctx.g.loseLife(ctx.you, x, 'Estinien'); }
        },
      },
    ],
  };

  SC['Fandaniel, Telophoroi Ascian'] = {
    triggers: [
      {
        on: 'castIS', desc: 'Surveil 1',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); },
      },
      {
        on: 'endStep', desc: 'Žrtva ili gubitak života',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const count = ctx.you.graveyard.filter(card => card.is('Instant') || card.is('Sorcery')).length;
          for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
            const creatures = ctx.g.creatures(opponent).filter(card => !card.isToken);
            let sacrifice = false;
            if (creatures.length) {
              sacrifice = await opponent.controller.decide(ctx.g, {
                type: 'chooseOption', prompt: `Fandaniel: žrtvuj nontoken stvorenje ili izgubi ${2 * count} života?`,
                options: [{ key: 'sac', label: 'Žrtvuj' }, { key: 'life', label: 'Izgubi život' }],
                aiHint: { kind: 'mode' },
              }) === 'sac';
            }
            if (sacrifice) {
              const picked = await opponent.controller.decide(ctx.g, {
                type: 'chooseCards', from: creatures, min: 1, max: 1, prompt: 'Žrtvuj nontoken stvorenje', aiHint: { kind: 'forcedSac' },
              });
              if (picked[0]) await ctx.g.sacrifice(opponent, picked[0]);
            } else if (count) await ctx.g.loseLife(opponent, 2 * count, 'Fandaniel');
          }
        },
      },
    ],
  };

  SC['Thancred Waters'] = {
    triggers: [
      {
        on: 'etb', desc: 'Royal Guard', filter: etbSelf,
        targets: [{
          what: 'permanent', prompt: 'Druga legendarna permanenta', aiHint: { goal: 'protect' },
          filter: (g, card, ctrl, source) => card.zone === 'battlefield' && card.ctrl === ctrl && card !== source &&
            (card.cur.super || []).includes('Legendary'),
        }],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target || target === ctx.src) return;
          const sourceIid = ctx.src.iid, targetIid = target.iid, controller = ctx.you;
          ctx.g.untilEffects.push({
            expires: 'never', kind: 'thancredGuard',
            apply: (g2, bf) => {
              const source = bf.find(c => c.iid === sourceIid);
              const protectedPermanent = bf.find(c => c.iid === targetIid);
              if (source && source.ctrl === controller && protectedPermanent) protectedPermanent.cur.kw.add('indestructible');
            },
          });
          ctx.g.recalc();
        },
      },
      {
        on: 'castNonCreature', desc: 'Indestructible',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      },
    ],
  };

  SC['Hraesvelgr of the First Brood'] = {
    triggers: [{
      on: 'etb', desc: 'Shiva\'s Aid', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+0 i neblokiran', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) { E.pumpUntilEOT(ctx.g, ctx.targets[0], 1, 0); ctx.targets[0].cur.unblockable = true; } },
    }, {
      on: 'castNonCreature', desc: 'Shiva\'s Aid',
      filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.creature({ prompt: '+1/+0 i neblokiran', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) { E.pumpUntilEOT(ctx.g, ctx.targets[0], 1, 0); ctx.targets[0].cur.unblockable = true; } },
    }],
  };

  SC['Baleful Strix'] = {
    triggers: [{ on: 'etb', desc: 'Vuci kartu', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };

  SC['Authority of the Consuls'] = {
    opponentsCreaturesEnterTapped: true,
    triggers: [{
      on: 'etb', desc: '+1 život',
      filter: (g, self, d) => d.card.ctrl !== self.ctrl && d.card.is('Creature'),
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  };

  SC['Torrential Gearhulk'] = {
    triggers: [{
      on: 'etb', desc: 'Baci instant iz groblja', filter: etbSelf, opt: true,
      run: async ctx => {
        const cands = ctx.you.graveyard.filter(c => c.is('Instant'));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Baci besplatno:', aiHint: { kind: 'freeCast' } });
        if (pick[0]) await E.castCopyFromZone(ctx.g, ctx.you, pick[0]);
      },
    }],
  };

  SC['Vindicate'] = {
    targets: [T.permanent(null, { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Void Rend'] = {
    uncounterable: true,
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Snuff Out'] = {
    targets: [T.permanent((g, c) => c.is('Creature') && !c.colors.includes('B'), { prompt: 'Uništi (necrno)', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Final Judgment'] = {
    resolve: async ctx => { for (const c of ctx.g.bf().filter(x => x.is('Creature')).slice()) await ctx.g.exileCard(c); },
  };
  SC['Crux of Fate'] = {
    resolve: async ctx => {
      const k = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseOption', prompt: 'Crux of Fate:',
        options: [{ key: 'dragons', label: 'Uništi sve Zmajeve' }, { key: 'nondragons', label: 'Uništi sve ne-Zmajeve' }],
        aiHint: { kind: 'mode' },
      });
      for (const c of ctx.g.bf().filter(x => x.is('Creature')).slice()) {
        const isD = c.hasSub('Dragon');
        if ((k === 'dragons') === isD) await ctx.g.destroy(c);
      }
    },
  };
  SC['Into the Story'] = {
    selfCostAdjust: (g, card, p) => g.players.some(o => o !== p && o.graveyard.length >= 7) ? -3 : 0,
    resolve: async ctx => { await ctx.g.draw(ctx.you, 4); },
  };
  SC['Exsanguinate'] = SC['Exsanguinate'] || {
    resolve: async ctx => {
      const x = (ctx.src && ctx.src.castMeta && ctx.src.castMeta.x) || 0;
      let tot = 0;
      for (const o of ctx.g.players) if (o !== ctx.you && !o.lost) { await ctx.g.loseLife(o, x, 'Exsanguinate'); tot += x; }
      if (tot) await ctx.g.gainLife(ctx.you, tot);
    },
  };
  SC['Transpose'] = {
    rebound: true,
    resolve: async ctx => {
      await E.mayDrawDiscard(ctx.g, ctx.you);
      await ctx.g.loseLife(ctx.you, 1, 'Transpose');
    },
  };
  SC['Tataru Taru'] = {
    triggers: [{
      on: 'etb', desc: 'Vuci; protivnik može vući', filter: etbSelf,
      targets: [T.opponent({ prompt: 'Koji protivnik može vući?', aiHint: { goal: 'gift' } })],
      run: async ctx => {
        await ctx.g.draw(ctx.you, 1);
        const opponent = ctx.targets[0];
        if (!opponent) return;
        const yes = await opponent.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Tataru Taru — ${opponent.name}, želiš li vući kartu?`,
          options: [{ key: 'yes', label: 'Da, vuci' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'tataruDraw', source: ctx.src },
        });
        if (yes === 'yes') await ctx.g.draw(opponent, 1);
      },
    }],
  };
  SC['Krile Baldesion'] = {
    triggers: [{
      on: 'castNonCreature', desc: 'Vrati stvorenje iste MV', opt: true, oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const mv = ctx.data.card ? mvOf(ctx.data.card) : -1;
        const cands = ctx.you.graveyard.filter(c => c.is('Creature') && U.mv(c.def.cost || '') === mv);
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Vrati u ruku:', aiHint: { kind: 'gyRecur' } });
        const c = pick[0]; if (!c) return;
        ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c);
      },
    }],
  };
  SC['Ardbert, Warrior of Darkness'] = {
    triggers: [
      {
        on: 'cast', desc: 'Bijeli spell → counteri i vigilance',
        filter: (g, self, d) => d.player === self.ctrl && d.card && d.card.colors.includes('W'),
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if ((c.def.super || []).includes('Legendary')) {
            ctx.g.addCounters(c, '+1/+1', 1); E.grantUntilEOT(ctx.g, c, ['vigilance']);
          }
        },
      },
      {
        on: 'cast', desc: 'Crni spell → counteri i menace',
        filter: (g, self, d) => d.player === self.ctrl && d.card && d.card.colors.includes('B'),
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if ((c.def.super || []).includes('Legendary')) {
            ctx.g.addCounters(c, '+1/+1', 1); E.grantUntilEOT(ctx.g, c, ['menace']);
          }
        },
      },
    ],
  };

  // ============================================================
  // Job select oprema: ETB napravi 1/1 Hero i sama se zakači na njega.
  // ============================================================
  const jobSelect = {
    on: 'etb', desc: 'Job select: Hero + attach', filter: etbSelf,
    run: async ctx => {
      const made = await ctx.g.makeTokens('hero11', ctx.you, { noReplace: true });
      if (made[0]) await ctx.g.attach(ctx.src, made[0]);
    },
  };
  const addType = (host, t) => { if (!host.cur.subtypes.includes(t)) host.cur.subtypes.push(t); };

  SC["Astrologian's Planisphere"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'castNonCreature', desc: 'Counter na opremljeno',
      filter: (g, self, d) => d.player === self.ctrl && self.attachedTo,
      run: async ctx => { const h = ctx.g.byIid(ctx.src.attachedTo); if (h) ctx.g.addCounters(h, '+1/+1', 1); },
    }],
    attachGrant: (g, self, host) => { addType(host, 'Wizard'); },
  };

  SC["Blue Mage's Cane"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'attacks', desc: 'Kopiraj I/S iz protivničkog groblja', opt: true,
      filter: (g, self, d) => self.attachedTo && d.card.iid === self.attachedTo,
      run: async ctx => {
        const dp = ctx.data.card.attacking;
        const p2 = dp instanceof MTG.Player ? dp : (dp && dp.ctrl);
        if (!p2) return;
        const cands = p2.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Egzilaj i kopiraj:', aiHint: { kind: 'freeCast' } });
        const c = pick[0]; if (!c) return;
        await ctx.g.exileCard(c);
        await E.castCopyFromZone(ctx.g, ctx.you, c);
      },
    }],
    attachGrant: (g, self, host) => { host.cur.toughness += 2; addType(host, 'Wizard'); },
  };

  SC["Dancer's Chakrams"] = {
    equip: '{3}',
    triggers: [jobSelect],
    attachGrant: (g, self, host) => {
      host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('lifelink');
      addType(host, 'Performer');
      for (const c of g.bf()) {
        if (c.ctrl !== self.ctrl || c === host || !c.commander || !c.is('Creature')) continue;
        c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('lifelink');
      }
    },
  };

  SC["Sage's Nouliths"] = {
    equip: '{3}',
    triggers: [jobSelect, {
      on: 'attacks', desc: 'Untap napadača',
      filter: (g, self, d) => self.attachedTo && d.card.iid === self.attachedTo,
      run: async ctx => {
        const cands = (ctx.g.combat ? ctx.g.combat.attackers : []).filter(c => c.tapped && c.ctrl === ctx.you);
        if (cands.length) cands[0].tapped = false;
      },
    }],
    attachGrant: (g, self, host) => { host.cur.power += 1; addType(host, 'Cleric'); },
  };

  SC["Reaper's Scythe"] = {
    equip: '{2}',
    triggers: [jobSelect, {
      on: 'endStep', desc: 'Soul counteri',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const n = ctx.g.players.filter(p => (p.turnState && p.turnState.lifeLost > 0)).length;
        if (n) ctx.g.addCounters(ctx.src, 'soul', n);
      },
    }],
    attachGrant: (g, self, host) => {
      const n = self.counters['soul'] || 0;
      host.cur.power += n; host.cur.toughness += n;
      addType(host, 'Assassin');
    },
  };

  // ============================================================
  // Ostatak Scions & Spellcraft
  // ============================================================
  SC['Alisaie Leveilleur'] = {
    // Dualcast — drugi spell svakog poteza košta {2} manje
    costMods: [(g, self, info) => (info.player === self.ctrl && info.player.turnState.spellsCast === 1) ? -2 : 0],
  };

  SC['Alphinaud Leveilleur'] = {
    triggers: [{
      on: 'castSecond', desc: 'Eukrasia: vuci',
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };

  SC["Archaeomancer's Map"] = {
    triggers: [{
      on: 'etb', desc: 'Dva Plainsa u ruku', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, toHandN: 2, filter: d => (d.subtypes || []).includes('Plains') }); },
    }, {
      on: 'etb', desc: 'Zemlja iz ruke (catch-up)', opt: true,
      filter: (g, self, d) => d.card.is('Land') && d.card.ctrl !== self.ctrl &&
        g.lands(d.card.ctrl).length > g.lands(self.ctrl).length &&
        self.ctrl.hand.some(c => c.is('Land')),
      run: async ctx => {
        const cands = ctx.you.hand.filter(c => c.is('Land'));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Zemlja na sto:', aiHint: { kind: 'landDrop' } });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      },
    }],
  };

  SC['Champions from Beyond'] = {
    triggers: [{
      on: 'etb', desc: 'X Hero tokena', filter: etbSelf,
      run: async ctx => {
        const x = (ctx.src.castMeta && ctx.src.castMeta.x) || 0;
        for (let i = 0; i < Math.min(x, 12); i++) await ctx.g.makeTokens('hero11', ctx.you);
      },
    }, {
      on: 'attackersDeclared', desc: 'Light Party: scry 2 + vuci',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.length >= 4,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 1); },
    }, {
      on: 'attackersDeclared', desc: 'Full Party: +4/+4',
      filter: (g, self, d) => d.player === self.ctrl && d.attackers.length >= 8,
      run: async ctx => { for (const a of ctx.data.attackers) E.pumpUntilEOT(ctx.g, a, 4, 4); },
    }],
  };

  SC['Circle of Power'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      await ctx.g.loseLife(ctx.you, 2, 'Circle of Power');
      await ctx.g.makeTokens('wizard01', ctx.you);
      for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Wizard')) E.pumpUntilEOT(ctx.g, c, 1, 0, ['lifelink']);
    },
  };

  SC['Emet-Selch of the Third Seat'] = {
    // spellovi iz groblja koštaju {2} manje
    costMods: [(g, self, info) => {
      if (info.player !== self.ctrl) return 0;
      return (info.castOpts && info.castOpts.from === 'graveyard') ? -2 : 0;
    }],
    triggers: [{
      on: 'lifeLost', desc: 'Baci I/S iz groblja', opt: true, oncePerTurn: true,
      filter: (g, self, d) => d.player && d.player !== self.ctrl,
      run: async ctx => {
        const cands = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Baci iz groblja:', aiHint: { kind: 'freeCast' } });
        if (pick[0]) await E.castCopyFromZone(ctx.g, ctx.you, pick[0]);
      },
    }],
  };

  SC['Eye of Nidhogg'] = {
    auraTarget: [T.creature({ prompt: 'Enchantaj stvorenje', aiHint: { goal: 'aura' } })],
    attachGrant: (g, self, host) => {
      host.cur.power = 4; host.cur.toughness = 2;
      host.cur.kw.add('flying'); host.cur.kw.add('deathtouch');
      if (!host.cur.subtypes.includes('Dragon')) host.cur.subtypes.push('Dragon');
    },
    triggers: [{
      on: 'attached', desc: 'Goad', filter: (g, self, d) => d.card === self,
      run: async ctx => { const h = ctx.g.byIid(ctx.src.attachedTo); if (h) E.goad(ctx.g, h, ctx.you); },
    }, {
      on: 'lto', zone: 'self', desc: 'Vrati u ruku',
      filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone === 'graveyard') { ctx.g.remove(c); c.zone = 'hand'; c.owner.hand.push(c); ctx.g.lg('Eye of Nidhogg se vraća u ruku.'); }
      },
    }],
  };

  SC['Hildibrand Manderville'] = {
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) { c.cur.power++; c.cur.toughness++; } },
    }],
    triggers: [{
      on: 'dies', desc: 'Adventure iz groblja', filter: (g, self, d) => d.card === self,
      run: async ctx => { ctx.src.meta.adventureFromGraveUntilOwnTurn = ctx.you.turnsStarted + 1; },
    }],
    adventure: {
      name: "Gentleman's Rise", cost: '{2}{W}', types: 'Instant', speed: 'instant', altCostStr: '{2}{W}',
      resolve: async ctx => { await ctx.g.makeTokens('hero11', ctx.you, { n: 2 }); },
    },
  };

  SC['Murderous Rider'] = {
    triggers: [{
      on: 'dies', desc: 'Na dno biblioteke', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone !== 'graveyard') return;
        ctx.g.remove(c); c.zone = 'library'; c.owner.library.unshift(c);
        ctx.g.lg('Murderous Rider ide na dno biblioteke.');
      },
    }],
    adventure: {
      name: 'Swift End', cost: '{1}{B}{B}', types: 'Instant', speed: 'instant', altCostStr: '{1}{B}{B}',
      targets: [T.permanent((g, c) => c.is('Creature') || c.is('Planeswalker'), { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
      resolve: async ctx => {
        if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
        await ctx.g.loseLife(ctx.you, 2, 'Swift End');
      },
    },
  };

  SC['Observed Stasis'] = {
    auraTarget: [T.oppCreature({ prompt: 'Enchantaj protivničko stvorenje', aiHint: { goal: 'pacify' } })],
    attachGrant: (g, self, host) => {
      host.cur.kw.clear();
      host.cur.cantAttack = true; host.cur.cantBlock = true;
      host.cur.extraAbilities = [];
    },
    triggers: [{
      on: 'attached', desc: 'Izbaci iz borbe + vuci', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const h = ctx.g.byIid(ctx.src.attachedTo);
        if (!h) return;
        h.attacking = null; h.blocking = null; h.blockedBy = [];
        if (ctx.g.combat) ctx.g.combat.attackers = ctx.g.combat.attackers.filter(a => a !== h);
        const n = ctx.g.bf().filter(c => c.ctrl === h.ctrl && c.is('Creature') && c.tapped).length;
        if (n) await ctx.g.draw(ctx.you, n);
      },
    }],
  };

  SC['Sublime Epiphany'] = {
    modes: {
      pick: 'any', min: 1,
      list: [
        { label: 'Kontriraj spell', targets: [T.spell(null, { prompt: 'Kontriraj spell', aiHint: { goal: 'counter' } })] },
        { label: 'Kontriraj sposobnost', targets: [T.ability(null, { prompt: 'Kontriraj aktiviranu ili trigerovanu sposobnost', aiHint: { goal: 'counter' } })] },
        { label: 'Vrati nonland permanent u ruku', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Vrati u ruku', aiHint: { goal: 'bounce' } })] },
        { label: 'Token-kopija tvog stvorenja', targets: [T.yourCreature({ prompt: 'Kopiraj', aiHint: { goal: 'copy' } })] },
        { label: 'Igrač vuče kartu', targets: [T.player({ prompt: 'Ko vuče kartu' })] },
      ],
    },
    resolve: async ctx => {
      const modes = ctx.mode || [];
      for (let i = 0; i < modes.length; i++) {
        const raw = ctx.targets[i];
        const t = Array.isArray(raw) ? raw[0] : raw;
        if (!t) continue;
        if (modes[i] === 0) { t.countered = true; ctx.g.lg(`Sublime Epiphany kontrira ${t.name || 'spell'}.`); }
        else if (modes[i] === 1) {
          const index = ctx.g.stack.indexOf(t);
          if (index >= 0) ctx.g.stack.splice(index, 1);
        }
        else if (modes[i] === 2) { if (t.zone === 'battlefield') { await ctx.g.move(t, 'hand'); ctx.g.lg(`${t.name} vraćen u ruku.`); } }
        else if (modes[i] === 3) { if (t.zone === 'battlefield') await ctx.g.copyPermanentToken(t, ctx.you, {}); }
        else if (modes[i] === 4) { await ctx.g.draw(t, 1); }
      }
    },
  };

  SC['Summon: Good King Mog XII'] = {
    saga: [
      { run: async ctx => { await ctx.g.makeTokens('moogle12', ctx.you, { n: 2 }); } },
      { run: async ctx => { ctx.g.lg('Good King Mog: kopiranje tokena na noncreature spell (poglavlja II–III).'); } },
      { run: async ctx => { ctx.g.lg('Good King Mog: kopiranje tokena na noncreature spell (poglavlja II–III).'); } },
      { run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Moogle')) ctx.g.addCounters(c, '+1/+1', 2); } },
    ],
    triggers: [{
      on: 'upkeep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }, {
      on: 'castNonCreature', desc: 'II–III: kopiraj token',
      filter: (g, self, d) => d.player === self.ctrl && (self.counters['lore'] || 0) >= 2 && (self.counters['lore'] || 0) <= 3,
      run: async ctx => {
        const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && !c.hasSub('Saga'));
        if (toks.length) await ctx.g.copyPermanentToken(toks[0], ctx.you, {});
      },
    }],
  };

  SC['Urianger Augurelt'] = {
    triggers: [{
      on: 'cast', desc: '+2 života za spell iz egzila',
      filter: (g, self, d) => d.player === self.ctrl && d.so && d.so.from === 'exile',
      run: async ctx => { await ctx.g.gainLife(ctx.you, 2); },
    }],
    abilities: [{
      label: 'Draw Arcanum: egzilaj vrh', cost: { tap: true },
      run: async ctx => {
        const c = ctx.you.library.pop();
        if (!c) return;
        c.zone = 'exile'; ctx.you.exile.push(c);
        ctx.src.meta.arc = (ctx.src.meta.arc || []).concat([c.iid]);
        ctx.g.lg('Urianger egzilira vrh biblioteke.');
      },
    }, {
      label: 'Play Arcanum: baci egzilirano', cost: { tap: true },
      run: async ctx => {
        const ids = ctx.src.meta.arc || [];
        const cands = ctx.you.exile.filter(c => ids.includes(c.iid));
        if (!cands.length) { ctx.g.lg('Urianger: nema egziliranih karata.'); return; }
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Baci iz egzila:', aiHint: { kind: 'freeCast' } });
        if (!pick[0]) return;
        // "Spells you cast this way cost {2} less" — jednokratno smanjenje baš za tu kartu
        const iid = pick[0].iid;
        ctx.you.tempReductions = ctx.you.tempReductions || [];
        ctx.you.tempReductions.push({ once: true, filter: (g, card) => card.iid === iid, delta: -2 });
        await E.castCopyFromZone(ctx.g, ctx.you, pick[0]);
      },
    }],
  };

  SC['White Auracite'] = {
    mana: { cost: { tap: true }, produce: [{ W: 1 }] },
    triggers: [{
      on: 'etb', desc: 'Egzilaj protivnički permanent', filter: etbSelf,
      targets: [T.permanent((g, c, ctrl) => c.ctrl !== ctrl && !c.is('Land'), { prompt: 'Egzilaj dok Auracite ne ode', upTo: true, aiHint: { goal: 'removal' } })],
      run: async ctx => {
        const t = ctx.targets[0]; if (!t) return;
        // NE u card.meta: move() briše meta prije nego lto okine, pa bismo
        // izgubili trag šta treba vratiti. Držimo mapu na igri.
        ctx.g._auracite = ctx.g._auracite || {};
        ctx.g._auracite[ctx.src.iid] = t.iid;
        await ctx.g.exileCard(t);
      },
    }, {
      on: 'lto', zone: 'self', desc: 'Vrati egzilirano',
      filter: (g, self, d) => d.card === self && g._auracite && g._auracite[self.iid],
      run: async ctx => {
        const iid = ctx.g._auracite[ctx.src.iid];
        delete ctx.g._auracite[ctx.src.iid];
        for (const p of ctx.g.players) {
          const c = p.exile.find(x => x.iid === iid);
          if (!c) continue;
          await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
          ctx.g.lg(`White Auracite vraća ${c.name}.`);
          break;
        }
      },
    }],
  };
  // Adventure polovina je bila u bazi (def.alt), ali bez `adventure` bloka nikad
  // nije bila ponuđena — karta je igrala kao goli 2/1 letač.
  SC['Hypnotic Sprite'] = {
    kws: ['flying'],
    adventure: {
      name: 'Mesmeric Glare', cost: '{2}{U}', types: 'Instant',
      targets: [T.spell((g, so) => so.card && U.mv(so.card.def.cost || '', so.x || 0) <= 3,
        { prompt: 'Kontriraj spell MV ≤ 3', aiHint: { goal: 'counter' } })],
      resolve: async ctx => {
        const so = ctx.targets[0], g = ctx.g;
        if (!so || !g.stack.includes(so) || MTG.isUncounterable(g, so)) return;
        g.stack.splice(g.stack.indexOf(so), 1);
        if (!so.isCopy) await g.move(so.card, 'graveyard');
        g.lg(`${so.name} COUNTEROVAN (Mesmeric Glare)!`, 'counter');
        g.note('stack', {});
      },
    },
  };
})();
