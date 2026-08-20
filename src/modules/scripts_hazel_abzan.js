// ===== scripts_hazel_abzan.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Card scripts: Squirreled Away (Hazel) + Abzan Armor (Felothar)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const myCreatureDies = (g, self, d) => d.snap.types.includes('Creature') && d.snap.ctrl === self.ctrl;
  const anotherCreatureDies = (g, self, d) => d.card !== self && d.snap.types.includes('Creature');

  E.proliferate = async function (g, p) {
    // Svaki Tekuthal je zaseban replacement efekt. Svaki proliferate traži
    // novi izbor; proliferate ne targetira, pa hexproof/shroud/ward ne utiču.
    const tekuthals = g.bf().filter(c => c.ctrl === p && c.def.doubleProliferate).length;
    const repeats = Math.pow(2, tekuthals);
    for (let pass = 0; pass < repeats; pass++) {
      const permanents = g.bf().filter(c => Object.values(c.counters).some(n => n > 0));
      const players = g.alivePlayers().filter(q => (q.poison || 0) > 0);
      const candidates = permanents.concat(players);
      if (!candidates.length) {
        g.lg(`${p.name} proliferira (nema countera za izbor).`);
        continue;
      }
      const picked = await p.controller.decide(g, {
        type: 'chooseTargets', spec: { what: 'proliferate' }, candidates,
        min: 0, max: candidates.length,
        prompt: repeats > 1 ? `Proliferate ${pass + 1}/${repeats}` : 'Proliferate',
        aiHint: { goal: 'proliferate' },
      });
      const chosen = Array.isArray(picked) ? [...new Set(picked)].filter(x => candidates.includes(x)) : [];
      for (const subject of chosen) {
        if (subject instanceof MTG.Player) {
          if ((subject.poison || 0) > 0) {
            subject.poison++;
            g.lg(`${subject.name}: poison ${subject.poison}.`);
          }
          continue;
        }
        for (const kind of Object.keys(subject.counters)) {
          if ((subject.counters[kind] || 0) <= 0) continue;
          if (kind === '-1/-1') await g.addM1(subject, 1, p, true);
          else g.addCounters(subject, kind, 1, false, p);
        }
      }
      g.recalc();
      await g.checkSBA();
      g.lg(`${p.name} proliferira (${chosen.length} izabrano).`);
    }
  };

  E.monstrosity = async function (g, card, n) {
    if (card.meta.monstrous) return false;
    card.meta.monstrous = true;
    g.addCounters(card, '+1/+1', n);
    await g.emit('monstrous', { card });
    return true;
  };

  // ==================== SQUIRRELED AWAY ====================
  SC['Hazel of the Rootbloom'] = {
    colorIdentityExtra: ['B', 'G'],
    abilities: [{
      label: 'Tap X tokena: X mane (plati 2 života)',
      cost: { tap: true, life: 2 },
      cond: (g, c, p) => g.bf().some(x => x.ctrl === p && x.isToken && !x.tapped),
      // ne plaćaj 2 života i ne skidaj tokene kad mana nema legalnu upotrebu
      aiScore: (g, c, p) => g.castableList(p).some(entry => entry.card && !entry.card.is('Land')) ? 3 : -5,
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const pool = g.bf().filter(x => x.ctrl === p && x.isToken && !x.tapped);
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: pool, min: 1, max: pool.length, prompt: 'Tapuj tokene za manu',
          aiHint: { kind: 'hazelMana' },
        });
        for (const t of picked) t.tapped = true;
        for (let i = 0; i < picked.length; i++) {
          const col = await p.controller.decide(g, {
            type: 'chooseOption', prompt: 'Boja mane?', options: COLORS.map(x => ({ key: x, label: x })),
            aiHint: { kind: 'manaColor' },
          });
          p.pool[col]++;
        }
        g.lg(`Hazel: +${picked.length} mane.`);
      },
    }],
    triggers: [{
      on: 'endStep', desc: 'Kopiraj token',
      filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => g.bf().some(x => x.ctrl === self.ctrl && x.isToken),
      targets: [{
        what: 'permanent', prompt: 'Token za kopiranje',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && c.isToken,
        aiHint: { goal: 'copyBestToken' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        const n = t.hasSub('Squirrel') ? 2 : 1;
        await ctx.g.copyPermanentToken(t, ctx.you, { n });
      },
    }],
  };
  SC['Academy Manufactor'] = {
    replace: [{
      event: 'createToken',
      run: (g, defs, ctrl, src) => {
        const out = [];
        for (const d of defs) {
          // token def može biti string ključ ili inline objekat (token kopija) — oba su "create a token"
          const key = typeof d === 'string'
            ? d.toLowerCase()
            : ((((d && d.subtypes) || []).find(s => ['Clue', 'Food', 'Treasure'].includes(s)) || '')).toLowerCase();
          if (key === 'clue' || key === 'food' || key === 'treasure') out.push('clue', 'food', 'treasure');
          else out.push(d);
        }
        return out;
      },
      priority: 1,
    }],
  };
  SC['Beledros Witherbloom'] = {
    colorIdentityExtra: ['B', 'G'],
    triggers: [{
      on: 'upkeep', desc: 'Pest token', filter: () => true,
      run: async ctx => { await ctx.g.makeTokens('pest', ctx.you); },
    }],
    abilities: [{
      label: 'Plati 10: untapaj landove', cost: { life: 10 }, oncePerTurn: true,
      run: async ctx => { for (const l of ctx.g.lands(ctx.you)) l.tapped = false; ctx.g.lg('Beledros: landovi untapovani.'); },
    }],
  };
  SC['Chatterfang, Squirrel General'] = {
    replace: [{
      event: 'createToken',
      run: (g, defs, ctrl, src) => {
        const extra = defs.length;
        const out = defs.slice();
        for (let i = 0; i < extra; i++) out.push('squirrel');
        return out;
      },
      priority: 2,
    }],
    abilities: [{
      label: '{B}, žrtvuj X vjeverica: +X/-X', cost: { mana: '{B}', sac: (g, x, self) => x.hasSub('Squirrel'), sacN: 'X' },
      targets: [T.creature({ prompt: 'Meta +X/-X', aiHint: { goal: 'removalOrBuff' } })],
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.targets[0], ctx.x, -ctx.x); await ctx.g.checkSBA(); },
    }],
  };
  SC['Chittering Witch'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Rat tokeni',
      run: async ctx => { await ctx.g.makeTokens('rat', ctx.you, { n: ctx.you.opponents(ctx.g).length }); },
    }],
    abilities: [{
      label: 'Žrtvuj stvorenje: -2/-2', cost: { mana: '{1}{B}', sacCreature: true },
      targets: [T.creature({ prompt: 'Meta -2/-2', aiHint: { goal: 'removal' } })],
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.targets[0], -2, -2); await ctx.g.checkSBA(); },
    }],
  };
  SC['Deep Forest Hermit'] = {
    etbCounters: { kind: 'time', n: 3 },
    triggers: [
      { on: 'etb', filter: etbSelf, desc: '4 vjeverice', run: async ctx => { await ctx.g.makeTokens('squirrel', ctx.you, { n: 4 }); } },
      {
        on: 'upkeep', desc: 'Vanishing', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          ctx.g.removeCounters(ctx.src, 'time', 1);
          if ((ctx.src.counters['time'] || 0) <= 0) await ctx.g.sacrifice(ctx.you, ctx.src);
        },
      },
    ],
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Squirrel')) { c.cur.power++; c.cur.toughness++; }
      },
    }],
  };
  SC['End-Raze Forerunners'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: '+2/+2 svima',
      run: async ctx => {
        E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you && c !== ctx.src, 2, 2, ['vigilance', 'trample']);
      },
    }],
  };
  SC['Gilded Goose'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Food', run: async ctx => { await ctx.g.makeTokens('food', ctx.you); } }],
    abilities: [{
      label: 'Napravi Food', cost: { mana: '{1}{G}', tap: true },
      run: async ctx => { await ctx.g.makeTokens('food', ctx.you); },
    }],
    mana: { cost: { tap: true, sacType: 'Food' }, produce: [{ ANY: true, n: 1 }] },
  };
  SC['Haywire Mite'] = {
    triggers: [{ on: 'dies', filter: etbSelf, desc: '+2 života', run: async ctx => { await ctx.g.gainLife(ctx.you, 2); } }],
    abilities: [{
      label: 'Žrtvuj: egzilaj art/ench', cost: { mana: '{G}', sacSelf: true },
      targets: [{
        what: 'permanent', prompt: 'Nekreaturni artefakt/enchantment',
        filter: (g, c) => c.zone === 'battlefield' && !c.is('Creature') && (c.is('Artifact') || c.is('Enchantment')),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => { await ctx.g.exileCard(ctx.targets[0]); },
    }],
  };
  SC["Hazel's Brewmaster"] = {
    kws: ['menace'],
    statics: [{
      apply: (g, source, bf) => {
        const brewed = (source.meta.brewedCards || []).map(iid => g.byIid(iid)).filter(c =>
          c && c.zone === 'exile' && c.is('Creature'));
        if (!brewed.length) return;
        for (const food of bf) {
          if (food.ctrl !== source.ctrl || !food.hasSub('Food')) continue;
          for (const card of brewed) {
            for (const a of card.def.abilities || []) food.cur.extraAbilities.push(a);
            const mana = card.def.mana ? (Array.isArray(card.def.mana) ? card.def.mana : [card.def.mana]) : [];
            food.cur.extraMana.push(...mana);
          }
        }
      },
    }],
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Food + egzil',
      targets: [{ what: 'card', zone: 'graveyard', anyGraveyard: true, upTo: true, prompt: 'Egzilaj do jedne karte iz groblja', aiHint: { kind: 'gyHate' } }],
      run: async ctx => { await brewmasterTrig(ctx); },
    }, {
      on: 'attacks', filter: (g, self, d) => d.card === self, desc: 'Food + egzil',
      targets: [{ what: 'card', zone: 'graveyard', anyGraveyard: true, upTo: true, prompt: 'Egzilaj do jedne karte iz groblja', aiHint: { kind: 'gyHate' } }],
      run: async ctx => { await brewmasterTrig(ctx); },
    }],
  };
  async function brewmasterTrig(ctx) {
    const g = ctx.g, p = ctx.you;
    const picked = ctx.targets[0];
    if (picked && picked.zone === 'graveyard') {
      await g.move(picked, 'exile');
      if (picked.zone === 'exile') {
        ctx.src.meta.brewedCards = ctx.src.meta.brewedCards || [];
        if (!ctx.src.meta.brewedCards.includes(picked.iid)) ctx.src.meta.brewedCards.push(picked.iid);
      }
    }
    await g.makeTokens('food', p);
  }
  SC['Honored Dreyleader'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Counteri',
        run: async ctx => {
          const n = ctx.g.bf().filter(c => c.ctrl === ctx.you && c !== ctx.src && (c.hasSub('Squirrel') || c.hasSub('Food'))).length;
          if (n) ctx.g.addCounters(ctx.src, '+1/+1', n);
        },
      },
      {
        on: 'etb', desc: '+1/+1',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && (d.card.hasSub('Squirrel') || d.card.hasSub('Food')),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
    ],
  };
  SC['Insatiable Frugivore'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Food(s)',
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        let guard = 0;
        while (guard++ < 10) {
          await g.makeTokens('food', p);
          if (p.graveyard.length < 3) break;
          const yes = await p.controller.decide(g, {
            type: 'chooseOption', prompt: 'Egzilaj 3 iz groblja za još jedan Food?',
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'frugivore' },
          });
          if (yes !== 'yes') break;
          const picks = await p.controller.decide(g, {
            type: 'chooseCards', from: p.graveyard.slice(), min: 3, max: 3,
            prompt: 'Exile three cards from your graveyard', aiHint: { kind: 'exileFromGy' },
          });
          for (const c of picks) await g.move(c, 'exile');
          if (picks.length < 3) break;
        }
      },
    }],
    abilities: [{
      label: 'Žrtvuj X Foodova: +X/+0, menace', cost: { mana: '{3}{B}', sac: (g, x) => x.hasSub('Food'), sacN: 'X' },
      run: async ctx => {
        E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, ctx.x, 0, ['menace']);
      },
    }],
  };
  SC['Moonstone Eulogist'] = {
    triggers: [
      {
        on: 'dies', desc: 'Blood token',
        filter: (g, self, d) => d.snap.types.includes('Creature') && d.snap.ctrl !== self.ctrl,
        run: async ctx => { await ctx.g.makeTokens('blood', ctx.you); },
      },
      {
        on: 'sacrificed', desc: '+1/+1 i život',
        filter: (g, self, d) => d.player === self.ctrl && d.card.is && (d.card.def.types || []).includes('Artifact'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); await ctx.g.gainLife(ctx.you, 1); },
      },
    ],
  };
  SC["Nadier's Nightblade"] = {
    triggers: [{
      on: 'lto', desc: 'Drain 1',
      filter: (g, self, d) => d.snap.isToken && d.snap.ctrl === self.ctrl,
      run: async ctx => {
        await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1);
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
  };
  SC['Nested Shambler'] = {
    triggers: [{
      on: 'dies', filter: etbSelf, desc: 'Vjeverice',
      run: async ctx => {
        const n = Math.max(0, ctx.data.snap.power);
        if (n) await ctx.g.makeTokens('squirrel', ctx.you, { n, tapped: true });
      },
    }],
  };
  SC['Plaguecrafter'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Svi žrtvuju',
      run: async ctx => {
        const g = ctx.g;
        for (const q of g.apnapFrom(ctx.you)) {
          const pool = g.bf().filter(c => c.ctrl === q && (c.is('Creature') || c.is('Planeswalker')));
          if (pool.length) {
            const picked = await q.controller.decide(g, {
              type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Žrtvuj stvorenje/planeswalkera',
              aiHint: { kind: 'forcedSac' },
            });
            if (picked.length) await g.sacrifice(q, picked[0]);
          } else if (q.hand.length) {
            const picked = await q.controller.decide(g, {
              type: 'chooseCards', from: q.hand, min: 1, max: 1, prompt: 'Odbaci kartu', aiHint: { kind: 'cleanupDiscard' },
            });
            await g.discard(q, picked);
          }
        }
      },
    }],
  };
  SC['Poison-Tip Archer'] = {
    triggers: [{
      on: 'dies', desc: 'Svaki protivnik gubi 1', filter: anotherCreatureDies,
      run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1); },
    }],
  };
  SC['Prosperous Innkeeper'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Treasure', run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } },
      {
        on: 'etb', desc: '+1 život',
        filter: (g, self, d) => d.card !== self && d.card.is('Creature') && d.card.ctrl === self.ctrl,
        run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
      },
    ],
  };
  SC['Ravenous Squirrel'] = {
    triggers: [{
      on: 'sacrificed', desc: '+1/+1',
      filter: (g, self, d) => d.player === self.ctrl && ((d.card.def.types || []).includes('Artifact') || (d.card.def.types || []).includes('Creature')),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    abilities: [{
      label: 'Žrtvuj art/stvorenje: +1 život, vuci', cost: { mana: '{1}{B}{G}', sac: (g, x, self) => x.is('Artifact') || x.is('Creature'), sacOther: false },
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Scurry of Squirrels'] = {
    triggers: [
      {
        on: 'attacks', filter: (g, self, d) => d.card === self, desc: 'Myriad ×2',
        run: async ctx => {
          const g = ctx.g, self = ctx.src, p = ctx.you;
          // "Myriad, myriad": defending player je i pw-kontrolor; svaka kopija je "you may"
          const tgt = self.attacking instanceof MTG.Player ? self.attacking : (self.attacking && self.attacking.ctrl);
          if (!tgt) return;
          for (let round = 0; round < 2; round++) {
            for (const o of E.eachOpp(g, p)) {
              if (o === tgt || o.lost) continue;
              const go = (await p.controller.decide(g, {
                type: 'chooseOption', prompt: `Myriad (${self.name}): create a copy for ${o.name}?`,
                options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
                aiHint: { kind: 'myriadCopy', src: self, opponent: o },
              })) === 'yes';
              if (!go) continue;
              const made = await g.copyPermanentToken(self, p, {
                tapped: true, attacking: o,
                chooseAttacking: (game, token) => game.chooseAttackingDestination(p, o, token, `Myriad — ${self.name}`),
              });
              for (const m of made) m.meta.exileEndCombat = true;
            }
          }
        },
      },
      {
        on: 'combatDamageToPlayer', filter: (g, self, d) => d.card === self, desc: '+1/+1 counter',
        targets: [T.yourCreature({ prompt: 'Counter na:', aiHint: { goal: 'buff' } })],
        run: async ctx => { ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
    ],
  };
  SC['Skyfisher Spider'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Žrtvuj → uništi', opt: true,
        onlyIf: (g, self) => g.creatures(self.ctrl).some(c => c !== self),
        run: async ctx => {
          const g = ctx.g, p = ctx.you;
          const pool = g.creatures(p).filter(c => c !== ctx.src);
          const picked = await p.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Žrtvuj stvorenje', aiHint: { kind: 'sacCost' },
          });
          if (!picked.length) return;
          await g.sacrifice(p, picked[0]);
          const cands = g.legalTargets({ what: 'permanent', filter: (g2, c) => c.zone === 'battlefield' && !c.is('Land') }, ctx.src, p);
          if (!cands.length) return;
          const tgt = await p.controller.decide(g, {
            type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: 'Uništi nonland permanent',
            aiHint: { goal: 'removal' },
          });
          if (tgt.length) await g.destroy(tgt[0]);
        },
      },
      {
        on: 'dies', filter: etbSelf, desc: 'Životi', opt: true,
        run: async ctx => {
          const n = ctx.you.graveyard.filter(c => c.is('Creature')).length;
          if (n) { await ctx.g.gainLife(ctx.you, n); if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'exile'); }
        },
      },
    ],
  };
  SC['Squirrel Sovereign'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c !== self && c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Squirrel')) { c.cur.power++; c.cur.toughness++; }
      },
    }],
  };
  SC['The Odd Acorn Gang'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const squirrel of bf) {
          if (squirrel.ctrl !== self.ctrl || !squirrel.is('Creature') || !squirrel.hasSub('Squirrel')) continue;
          squirrel.cur.extraAbilities.push({
            label: 'Tap: target Squirrel +2/+2 i trample', sorcery: true, cost: { tap: true },
            targets: [{
              what: 'creature', prompt: 'Squirrel meta',
              filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.hasSub('Squirrel'),
              aiHint: { goal: 'buff' },
            }],
            run: async ctx => { if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], 2, 2, ['trample']); },
          });
        }
      },
    }],
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Vuci kartu',
      filter: (g, self, d) => (d.cards || []).some(card => card.ctrl === self.ctrl && card.hasSub('Squirrel')),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Tireless Provisioner'] = {
    triggers: [{
      on: 'landfall', desc: 'Food ili Treasure',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Tireless Provisioner:',
          options: [{ key: 'treasure', label: 'Treasure' }, { key: 'food', label: 'Food' }],
          aiHint: { kind: 'provisioner' },
        });
        await ctx.g.makeTokens(k === 'food' ? 'food' : 'treasure', ctx.you);
      },
    }],
  };
  SC['Toski, Bearer of Secrets'] = {
    uncounterable: true, mustAttack: true,
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Vuci kartu',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Woe Strider'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Goat', run: async ctx => { await ctx.g.makeTokens('goat', ctx.you); } }],
    abilities: [{
      label: 'Žrtvuj stvorenje: Scry 1', cost: { sacCreature: true, sacOther: true },
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
    }],
    escape: { cost: '{3}{B}{B}', altCostStr: '{3}{B}{B}', exileN: 4, speed: 'sorcery' },
    escapeCounters: 2,
  };
  SC['Zulaport Cutthroat'] = {
    triggers: [{
      on: 'dies', desc: 'Drain 1',
      filter: (g, self, d) => d.snap.types.includes('Creature') && d.snap.ctrl === self.ctrl,
      run: async ctx => {
        await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1);
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
  };
  SC['Garruk, Cursed Huntsman'] = {
    abilities: [
      { label: '0: Dva vuka', loyalty: 0, sorcery: true, run: async ctx => { await ctx.g.makeTokens('wolfGarruk', ctx.you, { n: 2 }); } },
      {
        label: '-3: Uništi stvorenje, vuci', loyalty: -3, sorcery: true,
        targets: [T.creature({ prompt: 'Uništi', aiHint: { goal: 'removal' } })],
        run: async ctx => { await ctx.g.destroy(ctx.targets[0]); await ctx.g.draw(ctx.you, 1); },
      },
      {
        label: '-6: Emblem +3/+3 trample', loyalty: -6, sorcery: true,
        run: async ctx => {
          ctx.you.emblems.push({
            name: 'Garruk emblem',
            apply: (g, p, bf) => {
              for (const c of bf) if (c.ctrl === p && c.is('Creature')) { c.cur.power += 3; c.cur.toughness += 3; c.cur.kw.add('trample'); }
            },
          });
          ctx.g.lg(`${ctx.you.name} dobija Garruk emblem!`);
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Cache Grab'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const milled = await g.mill(p, 4);
      const perms = milled.filter(c => ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)) && c.zone === 'graveyard');
      let tookSquirrel = false;
      if (perms.length) {
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: perms, min: 0, max: 1, prompt: 'Uzmi permanent u ruku', aiHint: { kind: 'bestCard' },
        });
        if (picked.length) {
          const c = picked[0];
          g.remove(c); c.zone = 'hand'; p.hand.push(c);
          if (c.def.subtypes.includes('Squirrel')) tookSquirrel = true;
          g.lg(`${p.name} uzima ${c.name} u ruku.`);
        }
      }
      if (tookSquirrel || g.creatures(p).some(c => c.hasSub('Squirrel'))) await g.makeTokens('food', p);
    },
  };
  SC['Deadly Dispute'] = {
    addlCost: { sacArtifactOrCreature: true },
    resolve: async ctx => { await ctx.g.draw(ctx.you, 2); await ctx.g.makeTokens('treasure', ctx.you); },
  };
  SC['Plumb the Forbidden'] = {
    addlCost: { sacAnyCreatures: true },
    copyPerSacrifice: true,
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 1);
      await ctx.g.loseLife(ctx.you, 1);
    },
  };
  SC['Putrefy'] = {
    targets: [{
      what: 'permanent', prompt: 'Artefakt ili stvorenje',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Creature')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0], { noRegen: true }); },
  };
  SC['Saw in Half'] = {
    targets: [T.creature({ prompt: 'Prepolovi stvorenje', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], g = ctx.g;
      const owner = t.ctrl;
      const p2 = Math.ceil(t.power / 2), t2 = Math.ceil(t.toughness / 2);
      if (await g.destroy(t)) {
        await g.copyPermanentToken(t, owner, { n: 2, modPT: [p2, Math.max(1, t2)] });
      }
    },
  };
  SC['Second Harvest'] = {
    resolve: async ctx => {
      // bez noReplace: kopije moraju proći kroz zamjene za pravljenje tokena
      // (Chatterfang, Academy Manufactor) — inače Second Harvest pravi pola manje.
      const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken);
      for (const t of toks.slice()) await ctx.g.copyPermanentToken(t, ctx.you, {});
    },
  };
  SC['Tear Asunder'] = {
    kicker: { cost: '{1}{B}' },
    targets: (g, card, castOpts) => [{
      what: 'permanent', prompt: 'Egzilaj',
      filter: (g2, c) => c.zone === 'battlefield' && (castOpts._kicked ? !c.is('Land') : (c.is('Artifact') || c.is('Enchantment'))),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (ctx.kicked || t.is('Artifact') || t.is('Enchantment')) await ctx.g.exileCard(t);
    },
  };
  SC["Windgrace's Judgment"] = {
    targets: [{
      what: 'permanent', prompt: 'Opponent nonland permanents (up to 3, one per opponent)', count: 3, upTo: true, distinctCtrl: true,
      filter: (g, c, ctrl) => c.zone === 'battlefield' && !c.is('Land') && c.ctrl !== ctrl,
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      for (const t of (ctx.targets[0] || [])) {
        if (!t || t.zone !== 'battlefield') continue;
        await ctx.g.destroy(t);
      }
    },
  };
  SC['Casualties of War'] = {
    modes: {
      pick: 'any', min: 1,
      list: [
        { label: 'Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi stvorenje', targets: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi land', targets: [T.permanent((g, c) => c.is('Land'), { prompt: 'Land', aiHint: { goal: 'removalLand' } })] },
        { label: 'Uništi planeswalkera', targets: [T.permanent((g, c) => c.is('Planeswalker'), { prompt: 'Planeswalker', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      for (const t of ctx.targets) {
        const x = Array.isArray(t) ? t[0] : t;
        if (x && x.zone === 'battlefield') await ctx.g.destroy(x);
      }
    },
  };
  SC['Chatterstorm'] = {
    storm: true,
    resolve: async ctx => { await ctx.g.makeTokens('squirrel', ctx.you); },
  };
  SC['Maelstrom Pulse'] = {
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Nonland permanent', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], g = ctx.g;
      const name = t.name;
      for (const c of g.bf().slice()) if (c.name === name) await g.destroy(c);
    },
  };
  SC['Rootcast Apprenticeship'] = {
    modes: {
      pick: 3,
      repeats: true,
      list: [
        { label: '+2 countera na stvorenje', targets: [T.creature({ prompt: 'Stvorenje za +2 countera', aiHint: { goal: 'buff' } })] },
        { label: 'Kopiraj svoj token', targets: [T.permanent((g, c, ctrl) => c.ctrl === ctrl && c.isToken, { prompt: 'Token za kopiju', aiHint: { goal: 'copy' } })] },
        { label: 'Target player pravi Vjevericu', targets: [T.player({ prompt: 'Ko pravi Vjevericu?', aiHint: { goal: 'gift' } })] },
        { label: 'Target opponent žrtvuje nontoken artefakt', targets: [T.opponent({ prompt: 'Ko žrtvuje artefakt?', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      let targetIndex = 0;
      for (const mode of ctx.mode || []) {
        const target = ctx.targets[targetIndex++];
        if (mode === 0 && target) g.addCounters(target, '+1/+1', 2);
        else if (mode === 1 && target) await g.copyPermanentToken(target, p);
        else if (mode === 2 && target) await g.makeTokens('squirrel', target);
        else if (mode === 3 && target) {
          const artifacts = g.bf().filter(card => card.ctrl === target && card.is('Artifact') && !card.isToken);
          if (!artifacts.length) continue;
          const picked = await target.controller.decide(g, {
            type: 'chooseCards', from: artifacts, min: 1, max: 1,
            prompt: 'Rootcast Apprenticeship — žrtvuj nontoken artefakt', aiHint: { kind: 'forcedSac' },
          });
          if (picked.length) await g.sacrifice(target, picked[0]);
        }
      }
    },
  };
  SC['Shamanic Revelation'] = {
    resolve: async ctx => {
      const cs = ctx.g.creatures(ctx.you);
      await ctx.g.draw(ctx.you, cs.length);
      const big = cs.filter(c => c.power >= 4).length;
      if (big) await ctx.g.gainLife(ctx.you, 4 * big);
    },
  };
  SC['Swarmyard Massacre'] = {
    resolve: async ctx => {
      const g = ctx.g;
      await g.makeTokens('squirrel', ctx.you, { n: 2 });
      const rodents = g.creatures(ctx.you).filter(c => ['Insect', 'Rat', 'Spider', 'Squirrel'].some(s => c.hasSub(s))).length;
      if (rodents) {
        E.pumpAllUntilEOT(g, (g2, c) => !['Insect', 'Rat', 'Spider', 'Squirrel'].some(s => c.hasSub(s)), -rodents, -rodents);
        await g.checkSBA();
      }
    },
  };
  SC['Chitterspitter'] = {
    triggers: [{
      on: 'upkeep', opt: true, desc: 'Žrtvuj token → acorn', filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => g.bf().some(c => c.ctrl === self.ctrl && c.isToken),
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const toks = g.bf().filter(c => c.ctrl === p && c.isToken);
        const picked = await p.controller.decide(g, {
          type: 'chooseCards', from: toks, min: 1, max: 1, prompt: 'Žrtvuj token za acorn', aiHint: { kind: 'sacToken' },
        });
        if (picked.length) { await g.sacrifice(p, picked[0]); g.addCounters(ctx.src, 'acorn', 1); }
      },
    }],
    statics: [{
      apply: (g, self, bf) => {
        const n = self.counters['acorn'] || 0;
        if (!n) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Squirrel')) { c.cur.power += n; c.cur.toughness += n; }
      },
    }],
    abilities: [{
      label: 'Vjeverica', cost: { mana: '{G}', tap: true },
      run: async ctx => { await ctx.g.makeTokens('squirrel', ctx.you); },
    }],
  };
  SC['Idol of Oblivion'] = {
    abilities: [
      {
        label: 'Vuci kartu (token ovaj potez)', cost: { tap: true },
        cond: (g, c, p) => p.turnState.tokensCreated > 0,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        label: '10/10 Eldrazi', cost: { mana: '{8}', tap: true, sacSelf: true },
        run: async ctx => { await ctx.g.makeTokens('eldrazi1010', ctx.you); },
      },
    ],
  };
  SC['Maskwood Nexus'] = {
    statics: [{
      phase: 1,
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.allCreatureTypes = true;
      },
    }],
    abilities: [{
      label: 'Shapeshifter token', cost: { mana: '{3}', tap: true },
      run: async ctx => { await ctx.g.makeTokens('shapeshifter', ctx.you); },
    }],
  };
  SC['Skullclamp'] = {
    equip: '{1}',
    attachGrant: (g, self, host) => { host.cur.power += 1; host.cur.toughness -= 1; },
    triggers: [{
      on: 'dies', desc: 'Vuci 2',
      filter: (g, self, d) => d.snap.attachments && d.snap.attachments.includes(self.iid),
      run: async ctx => { await ctx.g.draw(ctx.you, 2); },
    }],
  };
  SC['Sword of the Squeak'] = {
    equip: '{2}',
    attachGrant: (g, self, host) => {
      const n = g.creatures(self.ctrl).filter(c => {
        const bp = parseInt(c.def.power || '0', 10), bt = parseInt(c.def.toughness || '0', 10);
        return bp === 1 || bt === 1;
      }).length;
      host.cur.power += n; host.cur.toughness += n;
    },
    triggers: [{
      on: 'etb', opt: true, desc: 'Pripoji mač',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && ['Hamster', 'Mouse', 'Rat', 'Squirrel'].some(s => d.card.hasSub(s)),
      run: async ctx => { await ctx.g.attach(ctx.src, ctx.data.card); },
    }],
  };
  SC['Beastmaster Ascension'] = {
    triggers: [{
      on: 'attacks', desc: 'Quest counter',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'quest', 1, true); },
    }],
    statics: [{
      cond: (g, self) => (self.counters['quest'] || 0) >= 7,
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) { c.cur.power += 5; c.cur.toughness += 5; }
      },
    }],
  };
  SC['Binding the Old Gods'] = {
    saga: [
      {
        targets: [{
          what: 'permanent', prompt: 'Uništi nonland protivnika',
          filter: (g, c, ctrl) => c.zone === 'battlefield' && !c.is('Land') && c.ctrl !== ctrl,
          aiHint: { goal: 'removal' },
        }],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
      },
      { run: async ctx => { await E.searchLandByName(ctx.g, ctx.you, ['Forest'], { tapped: true }); } },
      { run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 0, 0, ['deathtouch']); } },
    ],
    triggers: [{
      on: 'upkeep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }],
  };
  SC["Gourmand's Talent"] = {
    asEnters: async (g, card) => { card.meta.level = 1; },
    statics: [
      {
        phase: 1,
        cond: (g, self) => g.turnPlayer === self.ctrl,
        apply: (g, self, bf) => {
          for (const artifact of bf) {
            if (artifact.ctrl !== self.ctrl || !artifact.is('Artifact') || artifact.hasSub('Food')) continue;
            artifact.cur.subtypes.push('Food');
          }
        },
      },
      {
        phase: 2,
        cond: (g, self) => g.turnPlayer === self.ctrl,
        apply: (g, self, bf) => {
          for (const artifact of bf) {
            if (artifact.ctrl !== self.ctrl || !artifact.is('Artifact')) continue;
            artifact.cur.extraAbilities.push({
              label: 'Food: žrtvuj za +3 života',
              cost: { mana: '{2}', tap: true, sacSelf: true },
              aiScore: (g2, c2, p2) => p2.life <= 12 ? 4 : 0.5,
              run: async ctx => { await ctx.g.gainLife(ctx.you, 3); },
            });
          }
        },
      },
    ],
    abilities: [
      {
        label: 'Level 2', cost: { mana: '{2}{G}' }, sorcery: true, aiScore: () => 7,
        cond: (g, c) => (c.meta.level || 1) === 1,
        run: async ctx => { ctx.src.meta.level = 2; ctx.g.lg("Gourmand's Talent → Level 2."); },
      },
      {
        label: 'Level 3', cost: { mana: '{3}{G}' }, sorcery: true, aiScore: () => 7,
        cond: (g, c) => (c.meta.level || 1) === 2,
        run: async ctx => { ctx.src.meta.level = 3; ctx.g.lg("Gourmand's Talent → Level 3."); },
      },
    ],
    triggers: [{
      on: 'lifeGain', desc: 'Raccoon / counteri',
      filter: (g, self, d) => d.player === self.ctrl && d.first && (self.meta.level || 1) >= 2,
      run: async ctx => {
        await ctx.g.makeTokens('raccoon33', ctx.you);
        if ((ctx.src.meta.level || 1) >= 3) {
          for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1, true);
          ctx.g.recalc();
        }
      },
    }],
  };
  SC['Moldervine Reclamation'] = {
    triggers: [{
      on: 'dies', desc: '+1 život, vuci', filter: myCreatureDies,
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Squirrel Nest'] = {
    auraTarget: [T.permanent((g, c) => c.is('Land'), { prompt: 'Enchantaj land', aiHint: { goal: 'aura' } })],
    // "Enchanted land has ..." — sposobnost pripada landu, pa je aktivira kontrolor landa
    statics: [{
      apply: (g, self, bf) => {
        const host = self.attachedTo ? g.byIid(self.attachedTo) : null;
        if (!host || host.zone !== 'battlefield') return;
        host.cur.extraAbilities.push({
          label: 'Tap: create a Squirrel', cost: { tap: true },
          run: async ctx => { await ctx.g.makeTokens('squirrel', ctx.you); },
        });
      },
    }],
  };
  SC['Wolfwillow Haven'] = {
    auraTarget: [T.permanent((g, c) => c.is('Land'), { prompt: 'Enchantaj land', aiHint: { goal: 'aura' } })],
    extraManaOnTap: 'G',
    abilities: [{
      label: 'Žrtvuj: 2/2 Vuk', cost: { mana: '{4}{G}', sacSelf: true },
      cond: (g, c, p) => g.turnPlayer === p,
      run: async ctx => { await ctx.g.makeTokens('wolfG', ctx.you); },
    }],
  };

  // ==================== ABZAN ARMOR ====================
  SC['Felothar the Steadfast'] = {
    colorIdentityExtra: ['W', 'B', 'G'],
    toughnessCombatYours: true,
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.defenderCanAttack = true;
      },
    }],
    abilities: [{
      label: 'Žrtvuj: vuci = toughness', cost: { mana: '{3}', tap: true, sacCreature: true, sacOther: true },
      run: async ctx => {
        const s = ctx.sacd && ctx.sacd[0];
        if (!s) return;
        await ctx.g.draw(ctx.you, s.toughness);
        const n = Math.min(Math.max(0, s.power), ctx.you.hand.length);
        if (n > 0) {
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: ctx.you.hand, min: n, max: n, prompt: `Odbaci ${n}`, aiHint: { kind: 'cleanupDiscard' },
          });
          await ctx.g.discard(ctx.you, picked);
        }
      },
    }],
  };
  SC['Arbor Adherent'] = {
    mana: [
      { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
      {
        cost: { tap: true }, key: 2,
        produce: (g, c, p) => {
          const x = Math.max(0, ...g.creatures(p).filter(y => y !== c).map(y => y.toughness), 0);
          if (!x) return [];
          return [{ ANY: true, n: x }];
        },
      },
    ],
  };
  SC['Arboreal Grazer'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, opt: true, desc: 'Land iz ruke',
      onlyIf: (g, self) => self.ctrl.hand.some(c => c.is('Land')),
      run: async ctx => {
        const lands = ctx.you.hand.filter(c => c.is('Land'));
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 1, max: 1, prompt: 'Stavi land (tapped)', aiHint: { kind: 'bestLand' },
        });
        if (picked.length) {
          ctx.you.hand.splice(ctx.you.hand.indexOf(picked[0]), 1);
          picked[0].zone = 'nowhere';
          await ctx.g.move(picked[0], 'battlefield', { ctrl: ctx.you, tapped: true });
        }
      },
    }],
  };
  SC['Axebane Guardian'] = {
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const x = g.creatures(p).filter(y => y.kw('defender')).length;
        return x ? [{ ANY: true, n: x }] : [];
      },
    },
  };
  SC['Baldin, Century Herdmaster'] = {
    toughnessCombatAll: true,
    triggers: [{
      on: 'attacks', filter: (g, self, d) => d.card === self, desc: '+0/+X targetima',
      targets: [{
        what: 'creature', prompt: 'Do 100 creatures dobija +0/+X', count: 100, upTo: true,
        filter: (g, c) => c.zone === 'battlefield' && c.is('Creature'), aiHint: { goal: 'buff' },
      }],
      run: async ctx => {
        const x = ctx.you.hand.length;
        if (!x) return;
        for (const target of (ctx.targets[0] || [])) E.pumpUntilEOT(ctx.g, target, 0, x);
      },
    }],
  };
  SC["Betor, Ancestor's Voice"] = {
    colorIdentityExtra: ['W', 'B', 'G'],
    triggers: [{
      on: 'endStep', desc: 'Counteri + povratak', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const gained = p.turnState.lifeGained;
        if (gained > 0) {
          const pool = g.creatures(p).filter(c => c !== ctx.src);
          if (pool.length) {
            const c = await E.chooseCreature(g, p, pool, `+${gained} countera na:`, { kind: 'buff' });
            if (c) g.addCounters(c, '+1/+1', gained);
          }
        }
        const lost = p.turnState.lifeLost;
        const cands = p.graveyard.filter(c => c.is('Creature') && c.mv <= lost);
        if (cands.length) {
          const picked = await p.controller.decide(g, {
            type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Vrati iz groblja', aiHint: { kind: 'reanimate' },
          });
          if (picked.length) await E.reanimate(g, p, picked[0]);
        }
      },
    }],
  };
  SC['Blight Pile'] = {
    abilities: [{
      label: 'Svaki protivnik gubi X', cost: { mana: '{2}{B}', tap: true },
      run: async ctx => {
        const x = ctx.g.creatures(ctx.you).filter(c => c.kw('defender')).length;
        await ctx.g.loseLifeOpponents(ctx.src, ctx.you, x);
      },
    }],
  };
  SC['Canopy Gargantuan'] = {
    triggers: [{
      on: 'upkeep', desc: 'Counteri = toughness', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) {
          if (c === ctx.src) continue;
          const n = c.toughness;
          if (n > 0) ctx.g.addCounters(c, '+1/+1', n, true);
        }
        ctx.g.recalc();
        ctx.g.lg('Canopy Gargantuan: counteri dodani.');
      },
    }],
  };
  const etbDraw = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Vuci kartu', run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Carven Caryatid'] = etbDraw;
  SC['Wall of Blossoms'] = etbDraw;
  SC['Wall of Omens'] = etbDraw;
  SC['Crashing Drawbridge'] = {
    abilities: [{
      label: 'Haste svima', cost: { tap: true },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 0, 0, ['haste']); },
    }],
  };
  SC['Dragonlord Dromoka'] = { uncounterable: true, oppCantCastYourTurn: true };
  SC['Faeburrow Elder'] = {
    statics: [{
      apply: (g, self, bf) => {
        const cols = new Set();
        for (const c of bf) if (c.ctrl === self.ctrl) for (const col of c.colors) cols.add(col);
        self.cur.power += cols.size; self.cur.toughness += cols.size;
      },
    }],
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const cols = new Set();
        for (const x of g.bf()) if (x.ctrl === p) for (const col of x.colors) cols.add(col);
        if (!cols.size) return [];
        const o = {};
        for (const col of cols) o[col] = 1;
        return [o];
      },
    },
  };
  SC['Hornet Nest'] = {
    triggers: [{
      on: 'dealtDamage', desc: 'Insekti',
      filter: (g, self, d) => d.target === self,
      run: async ctx => { await ctx.g.makeTokens('insectFD', ctx.you, { n: ctx.data.n }); },
    }],
  };
  SC['Ikra Shidiqi, the Usurper'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Životi = toughness',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.gainLife(ctx.you, ctx.data.card.toughness); },
    }],
  };
  SC['Indulging Patrician'] = {
    triggers: [{
      on: 'endStep', desc: 'Drain 3', filter: (g, self, d) => d.player === self.ctrl,
      onlyIf: (g, self) => self.ctrl.turnState.lifeGained >= 3,
      run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 3); },
    }],
  };
  SC['Jaddi Offshoot'] = {
    triggers: [{
      on: 'landfall', desc: '+1 život', filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  };
  SC['Nyx-Fleece Ram'] = {
    triggers: [{
      on: 'upkeep', desc: '+1 život', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  };
  SC['Overgrown Battlement'] = {
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const x = g.creatures(p).filter(y => y.kw('defender')).length;
        return x ? [{ G: x }] : [];
      },
    },
  };
  SC['Protector of the Wastes'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Egzilaj art/ench',
      targets: [protectorTargets()], run: protectorExile,
    }, {
      on: 'monstrous', filter: (g, self, d) => d.card === self, desc: 'Egzilaj art/ench',
      targets: [protectorTargets()], run: protectorExile,
    }],
    abilities: [{
      label: 'Monstrosity 3', cost: { mana: '{4}{W}' },
      cond: (g, c) => !c.meta.monstrous,
      run: async ctx => { await E.monstrosity(ctx.g, ctx.src, 3); },
    }],
  };
  function protectorTargets() {
    return {
      what: 'permanent', prompt: 'Egzilaj do 2 artifact/enchantment permanenta', count: 2, upTo: true,
      distinctCtrl: true,
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Enchantment')),
      aiHint: { goal: 'removal' },
    };
  }
  async function protectorExile(ctx) {
    for (const target of (ctx.targets[0] || [])) await ctx.g.exileCard(target);
  }
  SC['Rampart Architect'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Wall token', run: async ctx => { await ctx.g.makeTokens('wall13', ctx.you); } },
      { on: 'attacks', filter: (g, self, d) => d.card === self, desc: 'Wall token', run: async ctx => { await ctx.g.makeTokens('wall13', ctx.you); } },
      {
        // "Whenever a creature you control WITH DEFENDER dies" — provjera defendera
        // je nedostajala, pa je ramp išao na svaku smrt bilo kojeg stvorenja.
        on: 'dies', opt: true, desc: 'Nađi basic',
        filter: (g, self, d) => d.card !== self && d.snap.ctrl === self.ctrl &&
          d.snap.types.includes('Creature') && (d.snap.kw || []).includes('defender'),
        run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
      },
    ],
  };
  SC['Rhox Faithmender'] = {
    replace: [{ event: 'lifegain', run: (g, n, p, src) => n * 2 }],
  };
  SC['Seedborn Muse'] = { untapAllOthersTurns: true };
  SC['Shadrix Silverquill'] = {
    colorIdentityExtra: ['W', 'B'],
    triggers: [{
      on: 'beginCombat', opt: true, desc: 'Izaberi dva', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const g = ctx.g, p = ctx.you;
        const modes = [
          { key: 'token', label: 'Igrač pravi Inkling' },
          { key: 'draw', label: 'Igrač vuče i gubi 1' },
          { key: 'counters', label: 'Player puts a counter on their creatures' },
        ];
        const picked = [];
        const targetedPlayers = new Set();
        for (let i = 0; i < 2; i++) {
          const avail = modes.filter(m => !picked.includes(m.key));
          const k = await p.controller.decide(g, {
            type: 'chooseOption', prompt: `Shadrix mode ${i + 1}/2:`, options: avail, aiHint: { kind: 'shadrix' },
          });
          picked.push(k);
          const players = g.alivePlayers().filter(player => !targetedPlayers.has(player));
          const tgt = await p.controller.decide(g, {
            type: 'chooseTargets', candidates: players, min: 1, max: 1, prompt: 'Which player?', aiHint: { goal: 'shadrixTarget', mode: k },
          });
          const t = tgt[0];
          if (!t || targetedPlayers.has(t)) return;
          targetedPlayers.add(t);
          if (k === 'token') await g.makeTokens('inkling', t);
          else if (k === 'draw') { await g.draw(t, 1); await g.loseLife(t, 1); }
          else { for (const c of g.creatures(t)) g.addCounters(c, '+1/+1', 1, true); g.recalc(); }
        }
      },
    }],
  };
  SC['Shalai, Voice of Plenty'] = {
    playerHexproof: true,
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && (c.is('Creature') || c.is('Planeswalker'))) { c.cur.hexproof = true; c.cur.kw.add('hexproof'); }
      },
    }],
    abilities: [{
      label: '+1/+1 counter na sve', cost: { mana: '{4}{G}{G}' },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1, true); ctx.g.recalc(); },
    }],
  };
  SC['Sidar Kondo of Jamuraa'] = {
    sidarKondo: true, flanking: true,
    triggers: [{
      on: 'blocks', desc: 'Flanking',
      filter: (g, self, d) => d.attacker === self && !d.blocker.def.flanking,
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.data.blocker, -1, -1); await ctx.g.checkSBA(); },
    }],
  };
  SC['Sylvan Caryatid'] = { mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] } };
  SC['Towering Titan'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => g.creatures(card.ctrl).filter(c => c !== card).reduce((s, c) => s + Math.max(0, c.toughness), 0) },
    abilities: [{
      label: 'Žrtvuj defendera: trample svima', cost: { sac: (g, x) => x.is('Creature') && x.kw('defender') },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, () => true, 0, 0, ['trample']); },
    }],
  };
  SC['Tree of Redemption'] = {
    cdaToughness: (g, c) => c.meta.touOverride !== undefined ? c.meta.touOverride : 13,
    abilities: [{
      label: 'Zamijeni život s toughness', cost: { tap: true },
      run: async ctx => {
        const p = ctx.you, c = ctx.src;
        const oldLife = p.life, oldT = c.toughness;
        const delta = oldT - oldLife;
        if (delta > 0) {
          const gained = await ctx.g.gainLife(p, delta, c);
          if (gained !== delta) return;
        } else if (delta < 0) {
          const lost = await ctx.g.loseLife(p, -delta, c.name);
          if (lost !== -delta) return;
        }
        c.meta.touOverride = oldLife;
        ctx.g.recalc();
        ctx.g.lg(`Tree of Redemption: život ${oldLife} ↔ toughness ${oldT}.`);
        ctx.g.note('life', { p });
      },
    }],
  };
  SC['Wakestone Gargoyle'] = {
    abilities: [{
      label: 'Defenderi mogu napasti', cost: { mana: '{1}{W}' },
      run: async ctx => {
        const you = ctx.you;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => { for (const c of bf) if (c.ctrl === you && c.kw('defender')) c.cur.defenderCanAttack = true; },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Walking Bulwark'] = {
    abilities: [{
      label: 'Defender: haste + napad po toughness', cost: { mana: '{2}' }, sorcery: true,
      targets: [{
        what: 'creature', prompt: 'Defender',
        filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.kw('defender'),
        aiHint: { goal: 'buff' },
      }],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            c.cur.kw.add('haste'); c.cur.defenderCanAttack = true; c.cur.assignByToughness = true;
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Wall of Limbs'] = {
    triggers: [{
      on: 'lifeGain', desc: '+1/+1', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    abilities: [{
      label: 'Žrtvuj: igrač gubi X', cost: { mana: '{5}{B}{B}', sacSelf: true },
      targets: [T.player({ prompt: 'Ko gubi X?', aiHint: { goal: 'drain' } })],
      run: async ctx => { await ctx.g.loseLife(ctx.targets[0], Math.max(0, ctx.sacdSelf ? ctx.sacdSelf.power : 0)); },
    }],
  };
  SC['Wall of Reverence'] = {
    triggers: [{
      on: 'endStep', opt: true, desc: 'Životi = power', filter: (g, self, d) => d.player === self.ctrl,
      targets: [T.yourCreature({ prompt: 'Whose power?', aiHint: { goal: 'lifegainMax' } })],
      run: async ctx => { await ctx.g.gainLife(ctx.you, Math.max(0, ctx.targets[0].power)); },
    }],
  };
  SC['Wall of Roots'] = {
    mana: { cost: { counter: '-0/-1' }, oncePerTurn: true, produce: [{ G: 1 }] },
  };
  SC['Weathered Sentinels'] = {
    canAttackRevenge: true,
    triggers: [{
      on: 'attacks', filter: (g, self, d) => d.card === self, desc: '+3/+3 indestructible',
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 3, 3, ['indestructible']); },
    }],
  };
  SC['Welcoming Vampire'] = {
    triggers: [{
      on: 'etb', oncePerTurn: true, desc: 'Vuci kartu',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.power <= 2,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Wingmantle Chaplain'] = {
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Bird tokeni',
        run: async ctx => {
          const n = ctx.g.creatures(ctx.you).filter(c => c.kw('defender')).length;
          if (n) await ctx.g.makeTokens('birdW', ctx.you, { n });
        },
      },
      {
        on: 'etb', desc: 'Bird token',
        filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.kw('defender'),
        run: async ctx => { await ctx.g.makeTokens('birdW', ctx.you); },
      },
    ],
  };
  SC['Anguished Unmaking'] = {
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Egzilaj nonland', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { await ctx.g.exileCard(ctx.targets[0]); await ctx.g.loseLife(ctx.you, 3); },
  };
  SC['Despark'] = {
    targets: [T.permanent((g, c) => c.mv >= 4, { prompt: 'Permanent MV 4+', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { await ctx.g.exileCard(ctx.targets[0]); },
  };
  SC['Swords to Plowshares'] = {
    targets: [T.creature({ prompt: 'Egzilaj stvorenje', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const pw = Math.max(0, t.power);
      const c2 = t.ctrl;
      await ctx.g.exileCard(t);
      await ctx.g.gainLife(c2, pw);
    },
  };
  SC['Tower Defense'] = {
    resolve: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 0, 5, ['reach']); },
  };
  SC['Expel the Interlopers'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const n = await p.controller.decide(g, {
        type: 'chooseX', min: 0, max: 10, prompt: 'Uništi sve sa power ≥ N', aiHint: { kind: 'expelN' },
      });
      for (const c of g.bf().filter(c => c.is('Creature') && c.power >= n).slice()) await g.destroy(c);
      g.lg(`Expel the Interlopers: uništeno sve sa power ≥ ${n}.`);
    },
  };
  SC['Reunion of the House'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const cands = p.graveyard.filter(c => c.is('Creature'));
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: cands, min: 0, max: cands.length, prompt: 'Vrati stvorenja (ukupni power ≤ 10)',
        aiHint: { kind: 'reunion' },
      });
      let total = 0;
      for (const c of picked) {
        const pw = parseInt(c.def.power || '0', 10) || 0;
        if (total + pw > 10) continue;
        total += pw;
        await E.reanimate(g, p, c);
      }
    },
  };
  SC['Slaughter the Strong'] = {
    resolve: async ctx => {
      const g = ctx.g;
      for (const q of g.apnapFrom(ctx.you)) {
        const mine = g.creatures(q);
        const picked = await q.controller.decide(g, {
          type: 'chooseCards', from: mine, min: 0, max: mine.length, prompt: 'Zadrži stvorenja (ukupni power ≤ 4)',
          aiHint: { kind: 'slaughterKeep' },
        });
        let total = 0;
        const keep = new Set();
        for (const c of picked) {
          const pw = Math.max(0, c.power);
          if (total + pw > 4) continue;
          total += pw; keep.add(c);
        }
        for (const c of mine.slice()) if (!keep.has(c)) await g.sacrifice(q, c);
      }
    },
  };
  SC['Tip the Scales'] = {
    resolve: async ctx => {
      const g = ctx.g, p = ctx.you;
      const mine = g.creatures(p);
      if (!mine.length) return;
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Žrtvuj stvorenje', aiHint: { kind: 'sacForWipe' },
      });
      if (!picked.length) return;
      const x = picked[0].toughness;
      await g.sacrifice(p, picked[0]);
      E.pumpAllUntilEOT(g, () => true, -x, -x);
      await g.checkSBA();
    },
  };
  SC['Will of the Abzan'] = {
    modes: {
      pick: 1,
      list: [
        {
          label: 'Protivnici žrtvuju najjače + gube 3',
          targets: [T.opponent({ count: 3, upTo: true, prompt: 'Protivnici', aiHint: { goal: 'drain' } })],
        },
        { label: 'Vrati stvorenje iz groblja', targets: [T.gyCreature({ prompt: 'Vrati', aiHint: { goal: 'reanimate' } })] },
      ],
    },
    castCondBoth: true,
    resolve: async ctx => {
      const g = ctx.g;
      const doMode = async (mi, tgt) => {
        if (mi === 0) {
          const list = Array.isArray(tgt) ? tgt : [tgt];
          for (const o of list) {
            if (!o || o.lost) continue;
            const mine = g.creatures(o);
            if (mine.length) {
              const maxP = Math.max(...mine.map(c => c.power));
              const cands = mine.filter(c => c.power === maxP);
              const picked = await o.controller.decide(g, {
                type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Žrtvuj najjače stvorenje', aiHint: { kind: 'forcedSac' },
              });
              if (picked.length) await g.sacrifice(o, picked[0]);
            }
            await g.loseLife(o, 3);
          }
        } else if (tgt) {
          await E.reanimate(g, ctx.you, Array.isArray(tgt) ? tgt[0] : tgt);
        }
      };
      let ti = 0;
      for (const mi of ctx.mode) { await doMode(mi, ctx.targets[ti]); ti++; }
    },
  };
  SC["Colfenor's Urn"] = {
    triggers: [
      {
        on: 'dies', opt: true, desc: 'Egzilaj u urnu',
        filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && d.snap.toughness >= 4 && !d.snap.isToken,
        run: async ctx => {
          const c = ctx.data.card;
          if (c.zone === 'graveyard') {
            await ctx.g.move(c, 'exile');
            ctx.src.meta.urn = ctx.src.meta.urn || [];
            ctx.src.meta.urn.push(c.iid);
            ctx.g.lg(`${c.name} egziliran u Colfenor's Urn (${ctx.src.meta.urn.length}/3).`);
          }
        },
      },
      {
        on: 'endStep', desc: 'Povratak', filter: () => true,
        onlyIf: (g, self) => (self.meta.urn || []).length >= 3,
        run: async ctx => {
          const g = ctx.g;
          // Lista se mora pročitati PRIJE žrtvovanja — nakon odlaska sa bojnog
          // polja urna više ne nosi svoj spisak, pa se nije vraćalo ništa.
          const iids = (ctx.src.meta.urn || []).slice();
          await g.sacrifice(ctx.you, ctx.src);
          for (const iid of iids) {
            const c = g.byIid(iid);
            if (c && c.zone === 'exile') {
              c.owner.exile.splice(c.owner.exile.indexOf(c), 1);
              c.zone = 'nowhere';
              await g.move(c, 'battlefield', { ctrl: c.owner });
            }
          }
        },
      },
    ],
  };
  SC['Staff of Compleation'] = {
    abilities: [
      {
        label: 'Uništi svoj permanent (1 život)', cost: { tap: true, life: 1 },
        targets: [T.permanent((g, c, ctrl) => c.owner === ctrl, { prompt: 'Tvoj permanent', aiHint: { goal: 'sacOwn' } })],
        run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
      },
      {
        label: 'Proliferate (3 života)', cost: { tap: true, life: 3 },
        run: async ctx => { await E.proliferate(ctx.g, ctx.you); },
      },
      {
        label: 'Vuci kartu (4 života)', cost: { tap: true, life: 4 },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      { label: 'Untap', cost: { mana: '{5}', untapSelf: true }, run: async ctx => { ctx.src.tapped = false; } },
    ],
    mana: { cost: { tap: true, life: 2 }, produce: [{ ANY: true, n: 1 }] },
  };
  SC['Assault Formation'] = {
    toughnessCombatYours: true,
    abilities: [
      {
        label: 'Defender može napasti', cost: { mana: '{G}' },
        targets: [{
          what: 'creature', prompt: 'Defender', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.kw('defender'),
          aiHint: { goal: 'buff' },
        }],
        run: async ctx => { ctx.targets[0].meta.canAttackDefender = true; ctx.g.recalc(); },
      },
      {
        label: '+0/+1 svima', cost: { mana: '{2}{G}' },
        run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 0, 1); },
      },
    ],
  };
  SC['Behind the Scenes'] = {
    statics: [{
      apply: (g, self, bf) => { for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.kw.add('skulk'); },
    }],
    abilities: [{
      label: '+1/+1 svima', cost: { mana: '{4}{W}' },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 1, 1); },
    }],
  };
  SC['Jaws of Defeat'] = {
    triggers: [{
      on: 'etb', desc: 'Gubi |P−T|',
      filter: (g, self, d) => d.card !== self && d.card.ctrl === self.ctrl && d.card.is('Creature'),
      targets: [T.opponent({ prompt: 'Ko gubi?', aiHint: { goal: 'drain' } })],
      run: async ctx => {
        const c = ctx.data.card;
        const n = Math.abs(c.power - c.toughness);
        if (n) await ctx.g.loseLife(ctx.targets[0], n);
      },
    }],
  };
})();
