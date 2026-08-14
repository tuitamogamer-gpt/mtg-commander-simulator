// ===== scripts_nelly.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Card scripts: Blame Game (Nelly Borca) — goad/politika
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const attacksSelf = (g, self, d) => d.card === self;
  const tok = (name, types, subtypes, p, t, extra) => Object.assign({
    name, cost: null, types, subtypes: subtypes || [], super: [],
    power: p !== undefined ? String(p) : undefined, toughness: t !== undefined ? String(t) : undefined,
    oracle: '', kws: [], isTokenDef: true,
  }, extra || {});

  // novi tokeni
  TK.soldierW = tok('Soldier', ['Creature'], ['Soldier'], 1, 1, { colorsOverride: ['W'] });
  TK.humanW = tok('Human', ['Creature'], ['Human'], 1, 1, { colorsOverride: ['W'] });
  TK.ogre33 = tok('Ogre', ['Creature'], ['Ogre'], 3, 3, { colorsOverride: ['R'] });
  TK.kobold = tok('Kobolds of Kher Keep', ['Creature'], ['Kobold'], 0, 1, { colorsOverride: ['R'] });
  TK.construct612 = tok('Construct', ['Artifact', 'Creature'], ['Construct'], 6, 12, { colorsOverride: [], kws: ['trample'] });
  TK.gold = tok('Gold', ['Artifact'], ['Gold'], undefined, undefined, {
    mana: { cost: { sacSelf: true }, produce: [{ ANY: true, n: 1 }] },
  });
  TK.lightningRager = tok('Lightning Rager', ['Creature'], ['Elemental'], 5, 1, {
    colorsOverride: ['R'], kws: ['trample', 'haste'],
    triggers: [{
      on: 'endStep', desc: 'Žrtvuj', filter: () => true,
      run: async ctx => { if (ctx.src.zone === 'battlefield') await ctx.g.sacrifice(ctx.you, ctx.src); },
    }],
  });

  E.goad = function (g, c, byPlayer) {
    if (!c || c.zone !== 'battlefield') return;
    g.untilEffects.push({ kind: 'goadCard', iid: c.iid, notPlayer: byPlayer, expires: 'untilTurnOf', whoTurn: byPlayer });
    g.lg(`😤 ${c.name} je GOADOVAN (mora napadati, ne smije ${byPlayer.name}).`);
  };
  E.suspect = function (g, c) {
    if (!c || c.zone !== 'battlefield') return;
    c.meta.suspected = true;
    g.recalc();
    g.lg(`🕵️ ${c.name} je OSUMNJIČEN (menace, ne može blokirati).`);
  };

  SC['Nelly Borca, Impulsive Accuser'] = {
    colorIdentityExtra: ['R', 'W'],
    triggers: [
      {
        on: 'attacks', filter: attacksSelf, desc: 'Suspect + goad',
        targets: [T.creature({ prompt: 'Osumnjiči stvorenje', aiHint: { goal: 'goadTarget' } })],
        run: async ctx => {
          E.suspect(ctx.g, ctx.targets[0]);
          for (const c of ctx.g.bf()) if (c.meta.suspected && c.is('Creature')) E.goad(ctx.g, c, ctx.you);
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Obojica vuku', oncePerTurn: true,
        filter: (g, self, d) => d.card.ctrl !== self.ctrl && d.player !== self.ctrl,
        run: async ctx => {
          await ctx.g.draw(ctx.you, 1);
          await ctx.g.draw(ctx.data.card.ctrl, 1);
        },
      },
    ],
  };
  SC['Agitator Ant'] = {
    triggers: [{
      on: 'endStep', desc: 'Counteri + goad', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const g = ctx.g;
        for (const q of g.apnapFrom(ctx.you)) {
          const pool = g.creatures(q);
          if (!pool.length) continue;
          const pick = await q.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Agitator Ant: +2 countera (i goad)?', aiHint: { kind: 'agitator' },
          });
          if (pick.length) {
            g.addCounters(pick[0], '+1/+1', 2);
            if (q !== ctx.you) E.goad(g, pick[0], ctx.you);
            else E.goad(g, pick[0], ctx.you);
          }
        }
      },
    }],
  };
  SC['Ancient Stone Idol'] = {
    kws: ['flash'],
    selfCostAdjust: (g, card, p) => -(g.combat ? g.combat.attackers.length : 0),
    triggers: [{
      on: 'dies', filter: etbSelf, desc: 'Construct 6/12',
      run: async ctx => { await ctx.g.makeTokens('construct612', ctx.you); },
    }],
  };
  SC['Angel of the Ruins'] = {
    cycling: {
      cost: '{2}', noDraw: true,
      effect: async ctx => { await E.searchBasic(ctx.g, ctx.you, { toHand: true, filter: d => d.subtypes.includes('Plains') }); },
    },
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Egzilaj do 2 art/ench',
      targets: [{
        what: 'permanent', prompt: 'Artefakti/enchantmenti (do 2)', count: 2, upTo: true,
        filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Enchantment')),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => { for (const t of (ctx.targets[0] || [])) if (t && t.zone === 'battlefield') await ctx.g.exileCard(t); },
    }],
  };
  SC['Anya, Merciless Angel'] = {
    statics: [{
      apply: (g, self, bf) => {
        const n = self.ctrl.opponents(g).filter(o => o.life < 20).length;
        self.cur.power += 3 * n; self.cur.toughness += 3 * n;
        if (n > 0) self.cur.kw.add('indestructible');
      },
    }],
  };
  SC['Boros Reckoner'] = {
    triggers: [{
      on: 'dealtDamage', desc: 'Prebaci štetu', filter: (g, self, d) => d.target === self,
      targets: [T.any({ prompt: 'Šteta u:', aiHint: { goal: 'damage' } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], ctx.data.n); },
    }],
    abilities: [{
      label: 'First strike', cost: { mana: '{R/W}' },
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['first strike']); },
    }],
  };
  SC['Darien, King of Kjeldor'] = {
    triggers: [{
      on: 'damageToPlayer', opt: true, desc: 'Vojnici',
      filter: (g, self, d) => d.player === self.ctrl && d.n > 0,
      run: async ctx => { await ctx.g.makeTokens('soldierW', ctx.you, { n: ctx.data.n }); },
    }],
  };
  SC['Feather, Radiant Arbiter'] = {
    triggers: [{
      on: 'cast', desc: 'Kopije za druge legalne mete',
      filter: (g, self, d) => {
        if (d.player !== self.ctrl || !d.card || d.card.is('Creature')) return false;
        const chosen = (d.so && d.so.targets || []).flat().filter(Boolean);
        return chosen.length > 0 && chosen.every(target => target === self);
      },
      run: async ctx => {
        const so = ctx.data.so;
        if (!so || !ctx.g.stack.includes(so)) return;
        const specs = so.targetSpecs || ctx.g.spellTargetSpecs(so.card, so.castOpts || {});
        if (!specs || !specs.length) return;
        const legalSets = specs.map(spec => new Set(ctx.g.legalTargets(spec, so.card, ctx.data.player)));
        const candidates = ctx.g.creatures().filter(card => card !== ctx.src && legalSets.every(set => set.has(card)));
        if (!candidates.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: candidates, min: 0, max: candidates.length,
          prompt: 'Feather: izaberi dodatna stvorenja ({2} po kopiji)', aiHint: { kind: 'copyTargets', src: ctx.src },
        });
        if (!picked.length) return;
        const paid = await ctx.g.payMana(ctx.you, { generic: picked.length * 2, x: 0, pips: [] });
        if (!paid) return;
        for (const creature of picked) await ctx.g.copySpell(so, ctx.you, { forceTarget: creature });
      },
    }],
  };
  SC['Fiendish Duo'] = {
    replace: [{
      event: 'damage',
      run: (g, evt, src) => {
        if (evt.target instanceof MTG.Player && evt.target !== src.ctrl) return evt.n * 2;
        return evt.n;
      },
    }],
  };
  SC['Frontier Warmonger'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Menace',
      filter: (g, self, d) => d.player !== self.ctrl && d.attackers.some(a => a.attacking instanceof MTG.Player && a.attacking !== self.ctrl),
      run: async ctx => {
        for (const a of ctx.data.attackers) {
          if (a.attacking instanceof MTG.Player && a.attacking !== ctx.you) E.grantUntilEOT(ctx.g, a, ['menace']);
        }
      },
    }],
  };
  SC['Gisela, Blade of Goldnight'] = {
    replace: [{
      event: 'damage',
      run: (g, evt, src) => {
        const isOppSide = (t) => (t instanceof MTG.Player) ? t !== src.ctrl : t.ctrl !== src.ctrl;
        const isMySide = (t) => (t instanceof MTG.Player) ? t === src.ctrl : t.ctrl === src.ctrl;
        // "If ANY source would deal damage to an opponent or a permanent an
        // opponent controls" — izvor ne mora biti tvoj. Ranije se udvostručavala
        // samo tvoja šteta, pa su goadani napadi među protivnicima bili duplo slabiji.
        if (evt.target && isOppSide(evt.target)) return evt.n * 2;
        if (evt.target && isMySide(evt.target)) return Math.ceil(evt.n / 2);
        return evt.n;
      },
    }],
  };
  SC['Havoc Eater'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Goad po protivniku',
      run: async ctx => {
        const g = ctx.g;
        let total = 0;
        for (const o of E.eachOpp(g, ctx.you)) {
          const pool = g.creatures(o);
          if (!pool.length) continue;
          const pick = await ctx.you.controller.decide(g, {
            type: 'chooseTargets', candidates: pool, min: 0, max: 1, prompt: `Goad stvorenje igrača ${o.name}`, aiHint: { goal: 'goadTarget' },
          });
          if (pick.length) { E.goad(g, pick[0], ctx.you); total += Math.max(0, pick[0].power); }
        }
        if (total) ctx.g.addCounters(ctx.src, '+1/+1', total);
      },
    }],
  };
  SC['Kazuul, Tyrant of the Cliffs'] = {
    triggers: [{
      on: 'attacks', desc: 'Ogre ili porez',
      filter: (g, self, d) => d.defender === self.ctrl && d.card.ctrl !== self.ctrl,
      run: async ctx => {
        const g = ctx.g, att = ctx.data.card.ctrl;
        const canPay = g.canPayMana(att, U.parseCost('{3}'));
        let paid = false;
        if (canPay) {
          const k = await att.controller.decide(g, {
            type: 'chooseOption', prompt: `Kazuul: plati {3} ili ${ctx.you.name} dobija 3/3 Ogra?`,
            options: [{ key: 'pay', label: 'Plati {3}' }, { key: 'no', label: 'Ne plaćam' }],
            aiHint: { kind: 'kazuul' },
          });
          if (k === 'pay') paid = await g.payMana(att, U.parseCost('{3}'));
        }
        if (!paid) await g.makeTokens('ogre33', ctx.you);
      },
    }],
  };
  SC['Keeper of the Accord'] = {
    triggers: [
      {
        on: 'endStep', desc: 'Soldier',
        filter: (g, self, d) => d.player !== self.ctrl && g.creatures(d.player).length > g.creatures(self.ctrl).length,
        run: async ctx => { await ctx.g.makeTokens('soldierW', ctx.you); },
      },
      {
        on: 'endStep', opt: true, desc: 'Nađi Plains',
        filter: (g, self, d) => d.player !== self.ctrl && g.lands(d.player).length > g.lands(self.ctrl).length,
        run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true, filter: d => d.subtypes.includes('Plains') }); },
      },
    ],
  };
  SC['Loran of the Third Path'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Uništi art/ench',
      targets: [{
        what: 'permanent', prompt: 'Artefakt/enchantment', upTo: true,
        filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Enchantment')),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
    abilities: [{
      label: 'Ti i protivnik vučete', cost: { tap: true },
      targets: [T.opponent({ prompt: 'Koji protivnik?', aiHint: { goal: 'drawSelf' } })],
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await ctx.g.draw(ctx.targets[0], 1); },
    }],
  };
  SC['Orzhov Advokist'] = {
    triggers: [{
      on: 'upkeep', desc: 'Counteri + primirje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const g = ctx.g, you = ctx.you;
        for (const q of g.apnapFrom(you)) {
          const pool = g.creatures(q);
          if (!pool.length) continue;
          const pick = await q.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Advokist: +2 countera (ne smiješ napadati vlasnika)?', aiHint: { kind: 'agitator' },
          });
          if (pick.length) {
            g.addCounters(pick[0], '+1/+1', 2);
            if (q !== you) {
              g.untilEffects.push({
                kind: 'cantAttackPlayer', who: q, notPlayer: you, expires: 'untilTurnOf', whoTurn: you,
              });
            }
          }
        }
      },
    }],
  };
  SC['Otherworldly Escort'] = {
    triggers: [{
      on: 'dies', filter: etbSelf, desc: 'Povratak kao Spirit',
      onlyIf: (g, self) => !self.meta._returned,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone !== 'graveyard') return;
        await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
        c.meta._returned = true;
        ctx.g.addCounters(c, 'charge', 4, true);
        ctx.g.lg(`${c.name} se vraća kao Spirit sa 4 charge countera.`);
      },
    }],
    abilities: [{
      label: 'Uništi napadača (charge)', cost: { mana: '{1}{W}', tap: true, counter: null },
      cond: (g, c) => (c.counters['charge'] || 0) > 0,
      targets: [{
        what: 'creature', prompt: 'Stvorenje koje ti je nanijelo štetu',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => {
        ctx.g.removeCounters(ctx.src, 'charge', 1);
        await ctx.g.destroy(ctx.targets[0]);
      },
    }],
  };
  SC['Selfless Squire'] = {
    kws: ['flash'],
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Štit',
        run: async ctx => {
          const you = ctx.you, self = ctx.src;
          ctx.g.untilEffects.push({ kind: 'preventToPlayer', who: you, expires: 'eot', srcIid: self.iid });
          ctx.g.lg(`${you.name}: sva šteta spriječena ovaj potez.`);
        },
      },
      {
        on: 'damagePrevented', desc: '+1/+1 za spriječenu štetu',
        filter: (g, self, d) => d.target === self.ctrl && d.n > 0,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', ctx.data.n); },
      },
    ],
  };
  SC['Stalking Leonin'] = {
    triggers: [{
      on: 'etb', filter: etbSelf, desc: 'Tajni izbor',
      run: async ctx => {
        const chosen = await E.chooseOpponent(ctx.g, ctx.you, {
          prompt: 'Stalking Leonin — tajno izaberi protivnika', goal: 'threat',
        });
        if (chosen) ctx.src.meta.chosen = chosen.idx;
      },
    }],
    abilities: [{
      label: 'Egzilaj napadača (izabrani igrač)', cost: {},
      cond: (g, c, p) => !c.meta._used && g.combat && g.combat.attackers.some(a => a.attacking === p && a.ctrl.idx === c.meta.chosen),
      run: async ctx => {
        const g = ctx.g;
        const cands = g.combat ? g.combat.attackers.filter(a => a.attacking === ctx.you && a.ctrl.idx === ctx.src.meta.chosen) : [];
        if (!cands.length) return;
        ctx.src.meta._used = true;
        const pick = await ctx.you.controller.decide(g, {
          type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: 'Egzilaj napadača', aiHint: { goal: 'removal' },
        });
        if (pick.length) await g.exileCard(pick[0]);
      },
    }],
  };
  SC['Steel Hellkite'] = {
    abilities: [
      { label: '+1/+0', cost: { mana: '{2}' }, run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); } },
      {
        label: 'Uništi permanente MV X', cost: { mana: '{X}' }, oncePerTurn: true,
        cond: (g, c) => Object.keys(c.meta._hitThisTurn || {}).length > 0,
        run: async ctx => {
          const g = ctx.g;
          const x = await ctx.you.controller.decide(g, { type: 'chooseX', min: 0, max: 8, prompt: 'X?', aiHint: { kind: 'chooseX' } });
          const ok = await g.payMana(ctx.you, U.parseCost('{' + x + '}'));
          if (!ok) return;
          for (const c of g.bf().slice()) {
            if (!c.is('Land') && c.mv === x && (ctx.src.meta._hitThisTurn || {})[c.ctrl.idx]) await g.destroy(c);
          }
        },
      },
    ],
    triggers: [{
      on: 'combatDamageToPlayer', filter: (g, self, d) => d.card === self, desc: 'Zapamti',
      run: async ctx => { (ctx.src.meta._hitThisTurn = ctx.src.meta._hitThisTurn || {})[ctx.data.player.idx] = true; },
    }],
  };
  SC['Sun Titan'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, opt: true, desc: 'Vrati MV≤3', run: async ctx => { await sunTitanReturn(ctx); } },
      { on: 'attacks', filter: attacksSelf, opt: true, desc: 'Vrati MV≤3', run: async ctx => { await sunTitanReturn(ctx); } },
    ],
  };
  async function sunTitanReturn(ctx) {
    const cands = ctx.you.graveyard.filter(c => c.mv <= 3 && ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)));
    if (!cands.length) return;
    const pick = await ctx.you.controller.decide(ctx.g, {
      type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Vrati permanent MV≤3', aiHint: { kind: 'reanimate' },
    });
    if (pick.length) await E.reanimate(ctx.g, ctx.you, pick[0]);
  }
  SC['Vengeful Ancestor'] = {
    triggers: [
      { on: 'etb', filter: etbSelf, desc: 'Goad', targets: [T.creature({ prompt: 'Goad', aiHint: { goal: 'goadTarget' } })], run: async ctx => { E.goad(ctx.g, ctx.targets[0], ctx.you); } },
      { on: 'attacks', filter: attacksSelf, desc: 'Goad', targets: [T.creature({ prompt: 'Goad', aiHint: { goal: 'goadTarget' } })], run: async ctx => { E.goad(ctx.g, ctx.targets[0], ctx.you); } },
      {
        on: 'attacks', desc: '1 šteta kontroloru',
        filter: (g, self, d) => d.card !== self && g.isGoaded(d.card),
        run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.card.ctrl, 1); },
      },
    ],
  };
  SC['Windborn Muse'] = { attackTax: 2 };
  SC["Elspeth, Sun's Champion"] = {
    abilities: [
      { label: '+1: Tri vojnika', loyalty: 1, sorcery: true, run: async ctx => { await ctx.g.makeTokens('soldierW', ctx.you, { n: 3 }); } },
      {
        label: '-3: Uništi power 4+', loyalty: -3, sorcery: true,
        run: async ctx => { for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.power >= 4).slice()) await ctx.g.destroy(c); },
      },
      {
        label: '-7: Emblem +2/+2 flying', loyalty: -7, sorcery: true,
        run: async ctx => {
          ctx.you.emblems.push({
            name: 'Elspeth emblem',
            apply: (g, p, bf) => { for (const c of bf) if (c.ctrl === p && c.is('Creature')) { c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('flying'); } },
          });
          ctx.g.lg('Elspeth emblem!');
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Comeuppance'] = {
    resolve: async ctx => {
      const you = ctx.you;
      ctx.g.untilEffects.push({ kind: 'comeuppance', who: you, expires: 'eot', sourceCard: ctx.src });
      ctx.g.lg(`${you.name}: Comeuppance štit ovaj potez.`);
    },
  };
  SC['Deflecting Palm'] = {
    resolve: async ctx => {
      const you = ctx.you;
      const candidates = [...new Set(ctx.g.bf().concat(ctx.g.stack.filter(so => so.card).map(so => so.card)))];
      if (!candidates.length) return;
      const picked = await you.controller.decide(ctx.g, {
        type: 'chooseCards', from: candidates, min: 1, max: 1,
        prompt: 'Deflecting Palm: izaberi izvor štete', aiHint: { kind: 'damageSource' },
      });
      if (!picked[0]) return;
      ctx.g.untilEffects.push({
        kind: 'preventNextToPlayer', who: you, expires: 'eot', source: picked[0],
        reflectToController: true, sourceCard: ctx.src,
      });
    },
  };
  SC["Gideon's Sacrifice"] = {
    targets: [T.permanent((g, c, ctrl) => c.ctrl === ctrl && (c.is('Creature') || c.is('Planeswalker')), {
      prompt: 'Tvoje stvorenje ili planeswalker', aiHint: { goal: 'protect' },
    })],
    resolve: async ctx => {
      const you = ctx.you, iid = ctx.targets[0].iid;
      ctx.g.untilEffects.push({ kind: 'redirectAllDamage', who: you, iid, expires: 'eot' });
    },
  };
  SC['Immortal Obligation'] = {
    targets: [{
      zone: 'graveyard', anyGraveyard: true, what: 'card', prompt: 'Stvorenje iz protivničkog groblja',
      filter: (g, c, ctrl) => c.is('Creature') && c.owner !== ctrl,
      aiHint: { goal: 'reanimate' },
    }],
    resolve: async ctx => {
      const t = ctx.targets[0], g = ctx.g;
      if (t.zone !== 'graveyard') return;
      await g.move(t, 'battlefield', { ctrl: t.owner });
      g.addCounters(t, 'duty', 1, true);
      t.meta.goadedBy = [ctx.you];
      g.untilEffects.push({ kind: 'goadCard', iid: t.iid, notPlayer: ctx.you, expires: 'never' });
      g.lg(`${t.name} vraćen sa duty counterom — trajno goadovan.`);
    },
  };
  SC['Take the Bait'] = {
    castCond: (g, p) => g.turnPlayer !== p && g.phase === 'combat',
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      g.untilEffects.push({ kind: 'preventCombatToPlayer', who: you, expires: 'eot' });
      if (g.combat) {
        for (const a of g.combat.attackers) {
          if (a.zone === 'battlefield') { a.tapped = false; E.goad(g, a, you); }
        }
      }
      g._extraCombats = (g._extraCombats || 0) + 1;
      g.lg('Take the Bait: štit + goad + dodatni combat!');
    },
  };
  SC['Disrupt Decorum'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you)) E.goad(ctx.g, c, ctx.you);
    },
  };
  SC['Mob Verdict'] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      const votes = new Map();
      for (const q of g.alivePlayers()) {
        const cands = g.alivePlayers().filter(x => x !== q);
        const pick = await q.controller.decide(g, {
          type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: 'Glasaj protiv igrača', aiHint: { goal: 'drain' },
        });
        const v = pick[0] || cands[0];
        votes.set(v, (votes.get(v) || 0) + 1);
        g.lg(`${q.name} glasa protiv ${v.name}.`);
      }
      for (const [pl, n] of votes) {
        if (pl === you) { await g.draw(you, n); continue; }
        await g.damagePlayer(ctx.src, pl, 2 * n);
        for (const c of g.creatures(pl).slice()) await g.damageCreature(ctx.src, c, 2 * n);
      }
    },
  };
  SC["Prisoner's Dilemma"] = {
    flashback: { cost: '{5}{R}{R}', altCostStr: '{5}{R}{R}', speed: 'sorcery' },
    resolve: async ctx => {
      const g = ctx.g;
      const choices = new Map();
      for (const o of E.eachOpp(g, ctx.you)) {
        const k = await o.controller.decide(g, {
          type: 'chooseOption', prompt: "Prisoner's Dilemma: šuti ili cinkaj?",
          options: [{ key: 'silence', label: '🤐 Šuti' }, { key: 'snitch', label: '🗣️ Cinkaj' }],
          aiHint: { kind: 'dilemma' },
        });
        choices.set(o, k);
      }
      const vals = [...choices.values()];
      const allSilence = vals.every(v => v === 'silence');
      const allSnitch = vals.every(v => v === 'snitch');
      for (const [o, k] of choices) g.lg(`${o.name}: ${k === 'silence' ? 'šuti' : 'cinka'}.`);
      for (const [o, k] of choices) {
        if (allSilence) await g.damagePlayer(ctx.src, o, 4);
        else if (allSnitch) await g.damagePlayer(ctx.src, o, 8);
        else if (k === 'silence') await g.damagePlayer(ctx.src, o, 12);
      }
    },
  };
  SC['Promise of Loyalty'] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      for (const q of g.apnapFrom(you)) {
        const mine = g.creatures(q);
        if (!mine.length) continue;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Vow counter na (ostale žrtvuješ):', aiHint: { kind: 'keepBest' },
        });
        const keep = pick[0] || mine[0];
        g.addCounters(keep, 'vow', 1, true);
        for (const c of mine.slice()) if (c !== keep) await g.sacrifice(q, c);
        if (q !== you) {
          g.untilEffects.push({ kind: 'cantAttackPlayerCard', iid: keep.iid, notPlayer: you, expires: 'never' });
        }
      }
    },
  };
  SC["Sevinne's Reclamation"] = {
    flashback: { cost: '{4}{W}', altCostStr: '{4}{W}', speed: 'sorcery' },
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Permanent MV≤3',
      filter: (g, c) => c.mv <= 3 && ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)),
      aiHint: { goal: 'reanimate' },
    }],
    resolve: async ctx => {
      if (ctx.targets[0] && ctx.targets[0].zone === 'graveyard') await E.reanimate(ctx.g, ctx.you, ctx.targets[0]);
      if (ctx.so.castOpts && ctx.so.castOpts.flashback) {
        const cands = ctx.you.graveyard.filter(c => c.mv <= 3 && ['Creature', 'Artifact', 'Enchantment', 'Land', 'Planeswalker'].some(t => c.is(t)));
        if (cands.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Kopija: vrati još jedan', aiHint: { kind: 'reanimate' },
          });
          if (pick.length) await E.reanimate(ctx.g, ctx.you, pick[0]);
        }
      }
    },
  };
  SC['Spectacular Showdown'] = {
    altCosts: [{ label: 'Overload {4}{R}{R}{R}', altCostStr: '{4}{R}{R}{R}', overloaded: true, speed: 'sorcery' }],
    targets: [T.creature({ prompt: 'Double strike + goad', aiHint: { goal: 'goadTarget' } })],
    resolve: async ctx => {
      const g = ctx.g;
      const apply = async (c) => {
        g.addCounters(c, 'double strike', 1, true);
        c.meta.dsCounter = true;
        E.goad(g, c, ctx.you);
      };
      if (ctx.so.castOpts && ctx.so.castOpts.overloaded) {
        for (const c of g.bf().filter(c => c.is('Creature'))) await apply(c);
      } else if (ctx.targets[0]) await apply(ctx.targets[0]);
    },
  };
  SC['Winds of Rath'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.attachments.some(a => { const x = ctx.g.byIid(a); return x && x.hasSub('Aura'); })).slice()) {
        await ctx.g.destroy(c, { noRegen: true });
      }
    },
  };
  SC['Bloodthirsty Blade'] = {
    // "Equipped creature gets +2/+0 and is goaded" — goad je STATIK opreme, pa se
    // mora obnavljati svakim recalcom. Ranije se upisivao trajno u meta i ostajao
    // i nakon skidanja opreme.
    attachGrant: (g, self, host) => {
      host.cur.power += 2;
      host.cur.goadedBy = (host.cur.goadedBy || []).concat([self.ctrl]);
    },
    abilities: [{
      label: 'Pripoji protivničkom stvorenju', cost: { mana: '{1}' }, sorcery: true,
      targets: [{
        what: 'creature', prompt: 'Protivničko stvorenje',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
        aiHint: { goal: 'goadTarget' },
      }],
      run: async ctx => {
        await ctx.g.attach(ctx.src, ctx.targets[0]);
        ctx.targets[0].meta.goadedBy = [ctx.you];
        ctx.g.lg(`${ctx.targets[0].name} nosi Bloodthirsty Blade — trajno goadovan.`);
      },
    }],
  };
  SC['Ransom Note'] = {
    triggers: [{ on: 'etb', filter: etbSelf, desc: 'Surveil 1', run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); } }],
    abilities: [{
      label: 'Žrtvuj: izaberi', cost: { mana: '{2}', sacSelf: true },
      run: async ctx => {
        const g = ctx.g;
        const k = await ctx.you.controller.decide(g, {
          type: 'chooseOption', prompt: 'Ransom Note:',
          options: [{ key: 'draw', label: 'Vuci kartu' }, { key: 'goad', label: 'Goad stvorenje' }, { key: 'cloak', label: 'Cloak (2/2 face-down)' }],
          aiHint: { kind: 'ransom' },
        });
        if (k === 'draw') await g.draw(ctx.you, 1);
        else if (k === 'goad') {
          const cands = g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
          if (cands.length) {
            const pick = await ctx.you.controller.decide(g, { type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: 'Goad', aiHint: { goal: 'goadTarget' } });
            if (pick.length) E.goad(g, pick[0], ctx.you);
          }
        } else {
          await g.cloakTop(ctx.you);
        }
      },
    }],
  };
  SC['Talisman of Conviction'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }], onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); } },
    ],
  };
  SC['Tome of Legends'] = {
    etbCounters: { kind: 'page', n: 1 },
    triggers: [
      { on: 'etb', desc: 'Page', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl, run: async ctx => { ctx.g.addCounters(ctx.src, 'page', 1, true); } },
      { on: 'attacks', desc: 'Page', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl, run: async ctx => { ctx.g.addCounters(ctx.src, 'page', 1, true); } },
    ],
    abilities: [{
      label: 'Vuci (page counter)', cost: { mana: '{1}', tap: true },
      cond: (g, c) => (c.counters['page'] || 0) > 0,
      run: async ctx => { ctx.g.removeCounters(ctx.src, 'page', 1); await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Curse of Opulence'] = {
    auraTarget: [T.player({ prompt: 'Prokletstvo na igrača', aiHint: { goal: 'drain' } })],
    isPlayerAura: true,
    triggers: [{
      on: 'attackersDeclared', desc: 'Gold',
      filter: (g, self, d) => d.attackers.some(a => a.attacking === self.meta.cursedPlayer),
      run: async ctx => {
        const g = ctx.g;
        const attackersOfCursed = ctx.data.attackers.filter(a => a.attacking === ctx.src.meta.cursedPlayer);
        if (!attackersOfCursed.length) return;
        await g.makeTokens('gold', ctx.you);
        const others = new Set(attackersOfCursed.map(a => a.ctrl).filter(q => q !== ctx.you));
        for (const q of others) await g.makeTokens('gold', q);
      },
    }],
  };
  SC["Duelist's Heritage"] = {
    triggers: [{
      on: 'attackersDeclared', opt: true, desc: 'Double strike',
      filter: (g, self, d) => d.attackers.length > 0,
      run: async ctx => {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseTargets', candidates: ctx.data.attackers.filter(a => a.zone === 'battlefield'), min: 0, max: 1,
          prompt: 'Double strike napadaču:', aiHint: { goal: 'duelist' },
        });
        if (pick.length) E.grantUntilEOT(ctx.g, pick[0], ['double strike']);
      },
    }],
  };
  SC['Ghostly Prison'] = { attackTax: 2 };
  SC['Hot Pursuit'] = {
    statics: [{
      apply: (g, self) => {
        const target = self.meta.pursuitTargetIid && g.byIid(self.meta.pursuitTargetIid);
        if (target && target.zone === 'battlefield') {
          target.cur.goadedBy = (target.cur.goadedBy || []).concat([self.ctrl]);
        }
      },
    }],
    triggers: [
      {
        on: 'etb', filter: etbSelf, desc: 'Suspect + goad',
        targets: [{
          what: 'creature', prompt: 'Protivničko stvorenje',
          filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
          aiHint: { goal: 'goadTarget' },
        }],
        run: async ctx => {
          const t = ctx.targets[0];
          E.suspect(ctx.g, t);
          ctx.src.meta.pursuitTargetIid = t.iid;
          ctx.g.recalc();
          ctx.g.lg(`${t.name} je goadovan dok je Hot Pursuit na bojnom polju.`);
        },
      },
      {
        on: 'beginCombat', desc: 'Preuzmi goadovana/osumnjičena stvorenja',
        filter: (g, self, d) => d.player === self.ctrl && g.players.filter(player => player.lost).length >= 2,
        run: async ctx => {
          const stolen = ctx.g.creatures().filter(card => ctx.g.isGoaded(card) || card.meta.suspected);
          for (const card of stolen) {
            const from = card.ctrl;
            if (from === ctx.you) { card.tapped = false; card.meta.tempHaste = true; continue; }
            card.ctrl = ctx.you;
            card.tapped = false;
            card.meta.tempHaste = true;
            ctx.g.untilEffects.push({
              kind: 'temporaryControl', iid: card.iid, from, to: ctx.you, expires: 'eot',
            });
          }
          ctx.g.recalc();
          ctx.g.lg(`Hot Pursuit: ${stolen.length} goadovanih/osumnjičenih stvorenja pod privremenom kontrolom.`);
        },
      },
    ],
  };
  const impetus = (buff, extra) => ({
    auraTarget: [{
      what: 'creature', prompt: 'Protivničko stvorenje',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
      aiHint: { goal: 'goadTarget' },
    }],
    attachGrant: (g, self, host) => { host.cur.power += buff[0]; host.cur.toughness += buff[1]; host.cur.goadedBy = (host.cur.goadedBy || []).concat([self.ctrl]); },
    triggers: extra || [],
  });
  SC['Martial Impetus'] = impetus([1, 1], [{
    on: 'attacks', desc: '+1/+1 svima',
    filter: (g, self, d) => self.attachedTo === d.card.iid,
    run: async ctx => {
      for (const a of (ctx.g.combat ? ctx.g.combat.attackers : [])) {
        if (a.attacking instanceof MTG.Player && a.attacking !== ctx.you && a.iid !== ctx.src.attachedTo) E.pumpUntilEOT(ctx.g, a, 1, 1);
      }
    },
  }]);
  SC['Shiny Impetus'] = impetus([2, 2], [{
    on: 'attacks', desc: 'Treasure',
    filter: (g, self, d) => self.attachedTo === d.card.iid,
    run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
  }]);
  SC['Shiny Impetus'].auraTarget = [T.creature({
    prompt: 'Enchant creature', aiHint: { goal: 'goadTarget' },
  })];
  SC['Redemption Arc'] = {
    auraTarget: [{
      what: 'creature', prompt: 'Protivničko stvorenje',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
      aiHint: { goal: 'goadTarget' },
    }],
    attachGrant: (g, self, host) => { host.cur.kw.add('indestructible'); host.cur.goadedBy = (host.cur.goadedBy || []).concat([self.ctrl]); },
    abilities: [{
      label: 'Egzilaj nosioca', cost: { mana: '{1}{W}' },
      cond: (g, c) => !!c.attachedTo,
      run: async ctx => {
        const host = ctx.g.byIid(ctx.src.attachedTo);
        if (host) await ctx.g.exileCard(host);
      },
    }],
  };
  SC['Rite of the Raging Storm'] = {
    triggers: [{
      on: 'upkeep', desc: 'Lightning Rager', filter: () => true,
      run: async ctx => {
        const made = await ctx.g.makeTokens('lightningRager', ctx.data.player, { noReplace: ctx.data.player !== ctx.you });
        for (const m of made) {
          ctx.g.untilEffects.push({ kind: 'cantAttackPlayerCard', iid: m.iid, notPlayer: ctx.you, expires: 'never' });
        }
      },
    }],
  };
  SC['Seal of Cleansing'] = {
    abilities: [{
      label: 'Žrtvuj: uništi art/ench', cost: { sacSelf: true },
      targets: [{
        what: 'permanent', prompt: 'Artefakt/enchantment',
        filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Enchantment')),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC["Smuggler's Share"] = {
    triggers: [{
      on: 'endStep', desc: 'Karte i Treasuri', filter: () => true,
      onlyIf: (g, self) => E.eachOpp(g, self.ctrl).some(o => o.turnState.drewThisTurn >= 2 || o.turnState.landsEntered >= 2),
      run: async ctx => {
        const g = ctx.g;
        const drew = E.eachOpp(g, ctx.you).filter(o => o.turnState.drewThisTurn >= 2).length;
        const lands = E.eachOpp(g, ctx.you).filter(o => o.turnState.landsEntered >= 2).length;
        if (drew) await g.draw(ctx.you, drew);
        if (lands) await g.makeTokens('treasure', ctx.you, { n: lands });
      },
    }],
  };
  SC['Soul Snare'] = {
    abilities: [{
      label: 'Žrtvuj: egzilaj napadača', cost: { mana: '{W}', sacSelf: true },
      cond: (g, c, p) => g.combat && g.combat.attackers.some(a => a.attacking === p),
      run: async ctx => {
        const cands = ctx.g.combat.attackers.filter(a => a.attacking === ctx.you && a.zone === 'battlefield');
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: 'Egzilaj', aiHint: { goal: 'removal' },
        });
        if (pick.length) await ctx.g.exileCard(pick[0]);
      },
    }],
  };
  SC['Trouble in Pairs'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: 'Vuci', oncePerTurn: true,
        filter: (g, self, d) => d.player !== self.ctrl && d.attackers.filter(a => a.attacking === self.ctrl).length >= 2,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'draw', desc: 'Vuci', oncePerTurn: true,
        filter: (g, self, d) => d.player !== self.ctrl && d.player.turnState.drewThisTurn === 2,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'castSecond', desc: 'Vuci', oncePerTurn: true,
        filter: (g, self, d) => d.player !== self.ctrl,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  const vow = (kw) => ({
    auraTarget: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'goadTarget' } })],
    attachGrant: (g, self, host) => {
      host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add(kw);
    },
    onAttach: (g, self, host) => {
      g.untilEffects.push({ kind: 'cantAttackPlayerCard', iid: host.iid, notPlayer: self.ctrl, expires: 'never' });
    },
  });
  SC['Vow of Duty'] = vow('vigilance');
  SC['Vow of Lightning'] = vow('first strike');

  // ---- lands ----
  const tapFor = (cols) => ({ cost: { tap: true }, produce: cols.map(c => (typeof c === 'object' ? c : { [c]: 1 })) });
  SC['Boros Garrison'] = { producesColors: ['R', 'W'], entersTapped: true, mana: tapFor([{ R: 1, W: 1 }]), triggers: SC['Gruul Turf'].triggers };
  SC['Castle Ardenvale'] = {
    producesColors: ['W'],
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && l.hasSub('Plains')),
    mana: tapFor(['W']),
    abilities: [{ label: '1/1 Human', cost: { mana: '{2}{W}{W}', tap: true }, run: async ctx => { await ctx.g.makeTokens('humanW', ctx.you); } }],
  };
  SC['Escape Tunnel'] = {
    producesColors: [],
    abilities: [
      { label: 'Žrtvuj: nađi basic (tapped)', cost: { tap: true, sacSelf: true }, run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); } },
      {
        label: 'Žrtvuj: power ≤2 ne može biti blokiran', cost: { tap: true, sacSelf: true },
        targets: [T.creature({
          prompt: 'Stvorenje snage 2 ili manje',
          filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.power <= 2,
          aiHint: { goal: 'evasion' },
        })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target) return;
          const iid = target.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const card = bf.find(x => x.iid === iid); if (card) card.cur.unblockable = true; },
          });
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Kher Keep'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{ label: 'Kobold 0/1', cost: { mana: '{1}{R}', tap: true }, run: async ctx => { await ctx.g.makeTokens('kobold', ctx.you); } }],
  };
  SC['Labyrinth of Skophos'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Ukloni iz combata', cost: { mana: '{4}', tap: true },
      cond: (g) => !!g.combat,
      targets: [{
        what: 'creature', prompt: 'Napadač/bloker',
        filter: (g, c) => c.zone === 'battlefield' && (c.attacking || c.blocking),
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => { ctx.g.removeFromCombat(ctx.targets[0]); ctx.g.lg(`${ctx.targets[0].name} uklonjen iz combata.`); },
    }],
  };
  SC['Myriad Landscape'] = {
    producesColors: [], entersTapped: true, mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Žrtvuj: 2 basica (tapped)', cost: { mana: '{2}', tap: true, sacSelf: true },
      run: async ctx => {
        const first = await E.searchBasic(ctx.g, ctx.you, { n: 1, tapped: true, prompt: 'Prvi basic land' });
        if (!first[0]) return;
        const basicTypes = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'];
        const shared = basicTypes.filter(type => (first[0].def.subtypes || []).includes(type));
        if (shared.length) await E.searchBasic(ctx.g, ctx.you, {
          n: 1, tapped: true, prompt: `Drugi basic (${shared.join('/')})`,
          filter: def => shared.some(type => (def.subtypes || []).includes(type)),
        });
      },
    }],
  };
  SC['Needle Spires'] = {
    producesColors: ['R', 'W'], entersTapped: true, mana: tapFor(['R', 'W']),
    abilities: [{
      label: 'Postaje 2/1 double strike', cost: { mana: '{2}{R}{W}' },
      run: async ctx => {
        const iid = ctx.src.iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            c.cur.basePower = 2; c.cur.baseToughness = 1; c.cur.power = 2; c.cur.toughness = 1;
            c.cur.kw.add('double strike');
          },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC["Rogue's Passage"] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Ne može biti blokiran', cost: { mana: '{4}', tap: true },
      targets: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'evasion' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.untilEffects.push({ expires: 'eot', apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.unblockable = true; } });
        ctx.g.recalc();
      },
    }],
  };
  SC["Slayers' Stronghold"] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: '+2/+0, vigilance, haste', cost: { mana: '{R}{W}', tap: true },
      targets: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'buff' } })],
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.targets[0], 2, 0, ['vigilance', 'haste']); },
    }],
  };
  SC['Sunhome, Fortress of the Legion'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Double strike', cost: { mana: '{2}{R}{W}', tap: true },
      targets: [T.creature({ prompt: 'Stvorenje', aiHint: { goal: 'buff' } })],
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.targets[0], ['double strike']); },
    }],
  };
  SC['War Room'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Vuci (plati živote)', cost: { mana: '{3}', tap: true },
      run: async ctx => {
        const n = ctx.you.colorIdentity.length || 1;
        await ctx.g.loseLife(ctx.you, n, 'war room');
        await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
})();
