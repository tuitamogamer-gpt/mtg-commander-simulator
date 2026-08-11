// ===== scripts_v7c.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v7c — MOST WANTED (OTC) + ELVEN COUNCIL (LTC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const isOutlaw = E7.isOutlaw;

  // ============================================================
  // MOST WANTED (OTC) — commander: Olivia, Opulent Outlaw
  // ============================================================
  SC['Olivia, Opulent Outlaw'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Treasure',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && isOutlaw(d.card),
      oncePerTurn: false,
      run: async ctx => {
        const key = '_olivia_' + ctx.g.turnNo + '_' + (ctx.data.player ? ctx.data.player.idx : 0);
        if (ctx.src.meta[key]) return;
        ctx.src.meta[key] = true;
        await ctx.g.makeTokens('treasure', ctx.you);
      },
    }],
    abilities: [{
      label: '2× +1/+1 svima (sac 2 Treasure)', sorcery: true,
      cost: { mana: '{3}', sac: (g, x, c) => x.hasSub('Treasure'), sacN: 2 },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 2); },
      aiScore: (g, c, p) => g.creatures(p).length >= 3 ? 6 : 2,
    }],
  };
  SC['Aetherborn Marauder'] = {
    triggers: [{
      on: 'etb', desc: 'Pokupi +1/+1 countere', filter: etbSelf, opt: true,
      run: async ctx => {
        let moved = 0;
        for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && c !== ctx.src && (c.counters['+1/+1'] || 0) > 0)) {
          moved += c.counters['+1/+1'];
          ctx.g.removeCounters(c, '+1/+1', c.counters['+1/+1']);
        }
        if (moved) ctx.g.addCounters(ctx.src, '+1/+1', moved);
      },
    }],
  };
  SC['Angelic Sell-Sword'] = {
    triggers: [
      {
        on: 'etb', desc: 'Mercenary',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && !d.card.isToken && (d.card === self || d.card !== self),
        run: async ctx => { if (!ctx.data.card.isToken) await ctx.g.makeTokens('mercenaryR', ctx.you); },
      },
      {
        on: 'attacks', desc: 'Vuci (power 6+)', filter: (g, self, d) => d.card === self && self.power >= 6,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC["Angrath's Marauders"] = {
    replace: [{
      event: 'damage',
      run: (g, ev, src) => {
        const s = ev.src;
        if (s && ((s.ctrl && s.ctrl === src.ctrl) || s === src)) return ev.n * 2;
        return ev.n;
      },
    }],
  };
  SC['Breena, the Demagogue'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Karta + counteri',
      filter: (g, self, d) => {
        const defs = new Set(d.attackers.map(a => a.attacking).filter(x => x instanceof MTG.Player));
        return [...defs].some(o => o !== self.ctrl && E.eachOpp(g, self.ctrl).includes(o) &&
          E.eachOpp(g, self.ctrl).some(o2 => o2 !== o && o.life > o2.life));
      },
      run: async ctx => {
        const attacker = ctx.data.player;
        if (attacker && !attacker.lost) await ctx.g.draw(attacker, 1);
        const mine = ctx.g.creatures(ctx.you);
        if (mine.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Breena: 2× +1/+1 na:', aiHint: { kind: 'buffPick' },
          });
          if (pick[0]) ctx.g.addCounters(pick[0], '+1/+1', 2);
        }
      },
    }],
  };
  SC['Captain Lannery Storm'] = {
    triggers: [
      { on: 'attacks', desc: 'Treasure', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } },
      {
        on: 'sacrificed', desc: '+1/+0', filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub && d.card.hasSub('Treasure'),
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); },
      },
    ],
  };
  SC['Captivating Crew'] = {
    abilities: [{
      label: 'Ukradi stvorenje (EOT)', sorcery: true, cost: { mana: '{3}{R}' },
      targets: [T.oppCreature({ prompt: 'Ukradi', aiHint: { goal: 'steal' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        ctx.g.lg(`${ctx.you.name} krade ${t.name} do kraja poteza!`);
        ctx.g.recalc();
        const iid = t.iid;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Vrati ukradeno', ctrl: ctx.you,
          run: async c2 => {
            const x = c2.g.byIid(iid);
            if (x && x.zone === 'battlefield') { x.ctrl = orig; x.meta.tempHaste = false; c2.g.recalc(); c2.g.lg(`${x.name} se vraća.`); }
          },
        });
      },
      aiScore: (g, c, p) => {
        const best = g.bf().filter(x => x.is('Creature') && x.ctrl !== p).sort((a, b) => b.power - a.power)[0];
        return best && best.power >= 4 && (g.phase === 'main1') ? 6 : 0.5;
      },
    }],
  };
  SC['Changeling Outcast'] = {
    statics: [{
      apply: (g, self, bf) => { self.cur.allCreatureTypes = true; self.cur.cantBlock = true; self.cur.unblockable = true; },
    }],
  };
  SC['Charred Graverobber'] = {
    escape: { cost: '{3}{B}', altCostStr: '{3}{B}', exileN: 4, speed: 'sorcery' },
    escapeCounters: 1,
    triggers: [{
      on: 'etb', desc: 'Outlaw iz groblja', filter: etbSelf,
      run: async ctx => {
        if (ctx.src.castMeta && ctx.src.castMeta.alt && ctx.src.castMeta.alt.escape) ctx.g.addCounters(ctx.src, '+1/+1', 1);
        const pool = ctx.you.graveyard.filter(c => c.is('Creature') && isOutlaw(c));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Outlaw u ruku', aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
      },
    }],
  };
  SC['Dire Fleet Daredevil'] = {
    triggers: [{
      on: 'etb', desc: 'Ukradi I/S iz groblja', filter: etbSelf,
      run: async ctx => {
        const pool = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) pool.push(...o.graveyard.filter(c => c.is('Instant') || c.is('Sorcery')));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Baci tuđi I/S', aiHint: { kind: 'reanimate' },
        });
        const c = pick[0];
        if (!c) return;
        c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
        c.zone = 'nowhere';
        const ok = await ctx.g.castSpell(ctx.you, c, { from: 'graveyard', asThoughAnyColor: true, exileAfter: true });
        if (!ok) { c.zone = 'graveyard'; c.owner.graveyard.push(c); }
      },
    }],
  };
  SC['Dire Fleet Ravager'] = {
    triggers: [{
      on: 'etb', desc: 'Svi gube trećinu', filter: etbSelf,
      run: async ctx => {
        for (const q of ctx.g.alivePlayers()) await ctx.g.loseLife(q, Math.ceil(q.life / 3), 'ravager');
      },
    }],
  };
  SC['Fain, the Broker'] = {
    abilities: [
      {
        label: 'Sac stvorenje: 2× +1/+1', cost: { tap: true, sacCreature: true, sacOther: true },
        targets: [T.creature({ prompt: '2× +1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
        aiScore: () => 0.4,
      },
      {
        label: 'Skini counter: Treasure', cost: { tap: true },
        cond: (g, c, p) => g.bf().some(x => x.ctrl === p && x.is('Creature') && Object.values(x.counters).some(v => v > 0)),
        run: async ctx => {
          const pool = ctx.g.creatures(ctx.you).filter(x => Object.values(x.counters).some(v => v > 0));
          if (!pool.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Skini counter sa:', aiHint: { kind: 'movePick' } });
          if (pick[0]) {
            const k = Object.keys(pick[0].counters).find(kk => pick[0].counters[kk] > 0);
            ctx.g.removeCounters(pick[0], k, 1);
            await ctx.g.makeTokens('treasure', ctx.you);
          }
        },
        aiScore: () => 1.5,
      },
      {
        label: 'Sac artefakt: Inkling', cost: { tap: true, sac: (g, x, c) => x.is('Artifact') },
        run: async ctx => { await ctx.g.makeTokens('inkling', ctx.you); },
        aiScore: () => 0.5,
      },
      {
        label: 'Untap', cost: { mana: '{3}{B}' },
        cond: (g, c) => c.tapped,
        run: async ctx => { ctx.src.tapped = false; },
        aiScore: () => 0.3,
      },
    ],
  };
  SC["Graywater's Fixer"] = {
    grantsGraveyardAbility: {
      filter: (g, source, card, p) => card.is('Creature') && isOutlaw(card),
      make: (g, source, card, p) => ({
        label: `Encore {${card.mv}}`, sorcery: true, cost: `{${card.mv}}`,
        run: async ctx => {
          const c = ctx.src;
        const madeAll = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const made = await ctx.g.copyPermanentToken(c, ctx.you, { haste: true, attacking: ctx.g.combat ? o : undefined });
          for (const m of made) m.meta.mustAttackPlayer = o;
          madeAll.push(...made);
        }
        E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
        ctx.g.lg(`Encore: ${c.name} ×${madeAll.length}!`);
        },
        aiScore: (g2, c2) => c2.mv <= 4 ? 4 : 0.5,
      }),
    },
  };
  SC['Humble Defector'] = {
    abilities: [{
      label: 'Vuci 2, daj protivniku', cost: { tap: true },
      cond: (g, c, p) => g.turnPlayer === p,
      run: async ctx => {
        await ctx.g.draw(ctx.you, 2);
        const opps = E.eachOpp(ctx.g, ctx.you);
        const o = opps.sort((a, b) => a.life - b.life)[0];
        if (o) { ctx.src.ctrl = o; ctx.g.recalc(); ctx.g.lg(`Humble Defector prelazi kod ${o.name}.`); }
      },
      aiScore: () => 3,
    }],
  };
  SC['Impulsive Pilferer'] = {
    triggers: [{
      on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
    gyAbility: {
      label: 'Encore {3}{R}', cost: '{3}{R}', sorcery: true,
      run: async ctx => {
        const madeAll = [];
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const made = await ctx.g.copyPermanentToken(ctx.src, ctx.you, { haste: true });
          madeAll.push(...made);
        }
        E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
        ctx.g.lg(`Encore: Impulsive Pilferer ×${madeAll.length}.`);
      },
    },
  };
  SC['Kamber, the Plunderer'] = {
    triggers: [
      {
        on: 'etb', desc: 'Nađi Laurine', filter: etbSelf, opt: true,
        run: async ctx => {
          const c = ctx.you.library.find(x => x.name === 'Laurine, the Diversion');
          if (c) { ctx.you.library.splice(ctx.you.library.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); U.shuffle(ctx.you.library, ctx.g.rnd); ctx.g.lg('Laurine u ruku.'); }
        },
      },
      {
        on: 'dies', desc: '+1 život i Blood', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => { await ctx.g.gainLife(ctx.you, 1); await ctx.g.makeTokens('blood', ctx.you); },
      },
    ],
  };
  SC['Laurine, the Diversion'] = {
    triggers: [{
      on: 'etb', desc: 'Nađi Kambera', filter: etbSelf, opt: true,
      run: async ctx => {
        const c = ctx.you.library.find(x => x.name === 'Kamber, the Plunderer');
        if (c) { ctx.you.library.splice(ctx.you.library.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); U.shuffle(ctx.you.library, ctx.g.rnd); ctx.g.lg('Kamber u ruku.'); }
      },
    }],
    abilities: [{
      label: 'Sac: goad', cost: { mana: '{2}', sac: (g, x, c) => (x.is('Artifact') || x.is('Creature')) && x !== c },
      targets: [T.oppCreature({ prompt: 'Goad', aiHint: { goal: 'goad' } })],
      run: async ctx => { if (ctx.targets[0]) E.goad(ctx.g, ctx.targets[0], ctx.you); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.power >= 5) ? 3 : 0.5,
    }],
  };
  SC['Mari, the Killing Quill'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c.is('Creature') && (c.hasSub('Assassin') || c.hasSub('Mercenary') || c.hasSub('Rogue'))) c.cur.kw.add('deathtouch');
        }
      },
    }],
    triggers: [
      {
        on: 'dies', desc: 'Egzil + hit counter', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature'),
        run: async ctx => {
          const c = ctx.data.card;
          if (c.zone === 'graveyard' && !c.isToken) {
            c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
            c.zone = 'exile'; c.owner.exile.push(c);
            c.counters = c.counters || {}; c.counters['hit'] = 1;
            ctx.g.lg(`Mari egzilira ${c.name} (hit counter).`);
          }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Hit → karta + 2 Treasure',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && (d.card.hasSub('Assassin') || d.card.hasSub('Mercenary') || d.card.hasSub('Rogue')),
        run: async ctx => {
          const victim = ctx.data.player;
          if (!victim) return;
          const hit = victim.exile.find(c => c.counters && c.counters['hit'] > 0);
          if (hit) {
            hit.counters['hit'] = 0;
            await ctx.g.draw(ctx.you, 1);
            await ctx.g.makeTokens('treasure', ctx.you, { n: 2 });
          }
        },
      },
    ],
  };
  SC['Marshland Bloodcaster'] = {
    abilities: [{
      label: 'Sljedeći spell plaćaš životom', cost: { tap: true, mana: '{1}{B}' },
      run: async ctx => {
        ctx.you.bloodcasterAlternative = { turn: ctx.g.turnNo, source: ctx.src.iid };
        ctx.g.lg('Bloodcaster: sljedeći spell plaćaš životima (mv).');
      },
      aiScore: (g, c, p) => p.hand.some(x => x.mv >= 5) && p.life > 15 ? 5 : 0.2,
    }],
  };
  SC['Mirror Entity'] = {
    statics: [{ apply: (g, self) => { self.cur.allCreatureTypes = true; } }],
    abilities: [{
      label: 'X: svi postaju X/X', xCost: true, cost: { mana: '{X}' },
      run: async ctx => {
        const chosenX = ctx.x || 0;
        for (const c of ctx.g.creatures(ctx.you)) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'mirror',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (x) {
                const powerDelta = chosenX - x.cur.basePower;
                const toughnessDelta = chosenX - x.cur.baseToughness;
                x.cur.basePower = chosenX;
                x.cur.baseToughness = chosenX;
                x.cur.power += powerDelta;
                x.cur.toughness += toughnessDelta;
                x.cur.allCreatureTypes = true;
              }
            },
          });
        }
        ctx.g.recalc();
      },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.power < 3).length >= 3 ? 4 : 0.3,
    }],
  };
  SC['Misfortune Teller'] = {
    triggers: [
      {
        on: 'etb', desc: 'Egzilaj iz groblja', filter: etbSelf,
        run: async ctx => { await misfortune(ctx); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Egzilaj iz groblja', filter: (g, self, d) => d.card === self,
        run: async ctx => { await misfortune(ctx); },
      },
    ],
  };
  async function misfortune(ctx) {
    const pool = [];
    for (const q of ctx.g.players) pool.push(...q.graveyard);
    if (!pool.length) return;
    const pick = await ctx.you.controller.decide(ctx.g, {
      type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Egzilaj iz groblja', aiHint: { kind: 'gyHate' },
    });
    const c = pick[0];
    if (!c) return;
    c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
    c.zone = 'exile'; c.owner.exile.push(c);
    if (c.is('Creature')) await ctx.g.makeTokens('rogue22', ctx.you);
    else if (c.is('Land')) await ctx.g.makeTokens('treasure', ctx.you);
    else await ctx.g.gainLife(ctx.you, 3);
  }
  SC['Mistmeadow Skulk'] = {
    statics: [{
      apply: (g, self) => {
        self.cur.protectionFrom.push((g2, source) => source.mv >= 3);
      },
    }],
  };
  SC['Nighthawk Scavenger'] = {
    cdaPower: (g, c) => {
      const types = new Set();
      for (const o of E.eachOpp(g, c.ctrl)) for (const x of o.graveyard) for (const t of x.def.types) types.add(t);
      return 1 + types.size;
    },
  };
  SC['Ogre Slumlord'] = {
    triggers: [{
      // "Whenever ANOTHER nontoken creature dies" — bez d.card !== self
      // Ogre Slumlord je pravio pacova i na vlastitu smrt.
      on: 'dies', desc: 'Rat', filter: (g, self, d) => d.card !== self && d.snap.types.includes('Creature') && !d.snap.isToken, opt: true,
      run: async ctx => { await ctx.g.makeTokens('rat', ctx.you); },
    }],
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub('Rat')) c.cur.kw.add('deathtouch');
      },
    }],
  };
  SC['Queen Marchesa'] = {
    triggers: [
      { on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); } },
      {
        on: 'upkeep', desc: 'Assassin', filter: (g, self, d) => d.player === self.ctrl && g.monarch && g.monarch !== self.ctrl,
        run: async ctx => { await ctx.g.makeTokens('assassinB', ctx.you); },
      },
    ],
  };
  SC['Rankle, Master of Pranks'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Izaberi bilo koje', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const ks = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseMulti', prompt: 'Rankle: izaberi (0-3)',
          options: [{ key: 'disc', label: 'Svi odbacuju' }, { key: 'draw', label: 'Svi gube 1 i vuku' }, { key: 'sac', label: 'Svi žrtvuju stvorenje' }],
          min: 0, max: 3, aiHint: { kind: 'modes' },
        });
        for (const k of ks || []) {
          if (k === 'disc') {
            for (const q of ctx.g.alivePlayers()) {
              if (!q.hand.length) continue;
              const pick = await q.controller.decide(ctx.g, { type: 'chooseCards', from: q.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'cleanupDiscard' } });
              await ctx.g.discard(q, pick);
            }
          } else if (k === 'draw') {
            for (const q of ctx.g.alivePlayers()) { await ctx.g.loseLife(q, 1, 'rankle'); await ctx.g.draw(q, 1); }
          } else {
            for (const q of ctx.g.alivePlayers()) {
              const cs = ctx.g.creatures(q);
              if (!cs.length) continue;
              const pick = await q.controller.decide(ctx.g, { type: 'chooseCards', from: cs, min: 1, max: 1, prompt: 'Žrtvuj', aiHint: { kind: 'sacCost' } });
              if (pick[0]) await ctx.g.sacrifice(q, pick[0]);
            }
          }
        }
      },
    }],
  };
  SC['Tenured Inkcaster'] = {
    triggers: [
      {
        on: 'etb', desc: '+1/+1', filter: etbSelf,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
      {
        on: 'attacks', desc: 'Drain 1',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && (d.card.counters['+1/+1'] || 0) > 0,
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 1, 'inkcaster');
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Veinwitch Coven'] = {
    triggers: [{
      on: 'lifeGain', desc: 'Vrati iz groblja', filter: (g, self, d) => d.player === self.ctrl && d.first, opt: true,
      run: async ctx => {
        if (!ctx.g.canPayMana(ctx.you, U.parseCost('{B}'))) return;
        const pool = ctx.you.graveyard.filter(c => c.is('Creature'));
        if (!pool.length) return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{B}'));
        if (!ok) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'U ruku:', aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
      },
    }],
  };
  SC['Vihaan, Goldwaker'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c.is('Creature') && c !== self && isOutlaw(c)) { c.cur.kw.add('vigilance'); c.cur.kw.add('haste'); }
        }
      },
    }],
    triggers: [{
      on: 'beginCombat', desc: 'Treasures postaju 3/3', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && c.hasSub('Treasure'))) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'animate',
            apply: (g2, bf) => {
              const x = bf.find(y => y.iid === iid);
              if (!x) return;
              if (!x.cur.types.includes('Creature')) x.cur.types.push('Creature');
              x.cur.subtypes.push('Construct', 'Assassin');
              x.cur.basePower = 3; x.cur.baseToughness = 3;
            },
          });
        }
        ctx.g.recalc();
      },
    }],
  };
  SC['Witch of the Moors'] = {
    triggers: [{
      on: 'endStep', desc: 'Edikt + reanimacija',
      filter: (g, self, d) => d.player === self.ctrl && self.ctrl.turnState.lifeGained > 0,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const cs = ctx.g.creatures(o);
          if (!cs.length) continue;
          const pick = await o.controller.decide(ctx.g, { type: 'chooseCards', from: cs, min: 1, max: 1, prompt: 'Žrtvuj', aiHint: { kind: 'sacCost' } });
          if (pick[0]) await ctx.g.sacrifice(o, pick[0]);
        }
        const pool = ctx.you.graveyard.filter(c => c.is('Creature'));
        if (pool.length) {
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'U ruku:', aiHint: { kind: 'reanimate' } });
          if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
        }
      },
    }],
  };
  SC["Curtains' Call"] = {
    selfCostAdjust: (g, card, p) => -E.eachOpp(g, p).length,
    targets: [
      T.creature({ prompt: 'Uništi #1', aiHint: { goal: 'removal' } }),
      T.creature({ prompt: 'Uništi #2', aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (a) await ctx.g.destroy(a);
      if (b && b !== a) await ctx.g.destroy(b);
    },
  };
  SC['Dead Before Sunrise'] = {
    resolve: async ctx => {
      for (const c of ctx.g.creatures(ctx.you)) {
        if (isOutlaw(c)) {
          E.pumpUntilEOT(ctx.g, c, 1, 0);
          c.meta._gunslinger = ctx.g.turnNo;
        }
      }
      ctx.g.lg('Dead Before Sunrise: outlawi +1/+0 i mogu tapovanjem nanijeti štetu jednaku snazi stvorenju.');
    },
  };
  SC['Shoot the Sheriff'] = {
    targets: [T.creature({ prompt: 'Ne-outlaw', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && !isOutlaw(c), aiHint: { goal: 'removal' } })],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Back in Town'] = {
    xCost: true,
    resolve: async ctx => {
      const pool = ctx.you.graveyard.filter(c => c.is('Creature') && isOutlaw(c));
      const x = Math.min(ctx.x || 0, pool.length);
      if (!x) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 1, max: x, prompt: `Reanimiraj do ${x} outlawa`, aiHint: { kind: 'reanimate' },
      });
      for (const c of pick) await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
    },
  };
  SC["Council's Judgment"] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      // svaki igrač glasa za nonland permanent koji NE kontroliše
      const votes = new Map();
      for (const q of g.apnapFrom(you)) {
        if (q.lost) continue;
        const cands = g.bf().filter(c => !c.is('Land') && c.ctrl !== q);
        if (!cands.length) continue;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Glasaj: egzil za...', aiHint: { kind: 'voteExile' },
        });
        if (pick[0]) {
          votes.set(pick[0], (votes.get(pick[0]) || 0) + 1);
          votes['_by_' + q.idx] = pick[0];
          g.lg(`${q.name} glasa: ${pick[0].name}.`);
        }
      }
      let best = 0;
      for (const n of votes.values()) best = Math.max(best, n);
      for (const [c, n] of votes) if (n === best && c.zone === 'battlefield') await g.exileCard(c);
      await g.emit('voteEnd', { src: ctx.src, by: you, votes });
    },
  };
  SC['Hex'] = {
    resolve: async ctx => {
      const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: cands, min: 0, max: 6, prompt: 'Uništi do 6', aiHint: { kind: 'removalPick' },
      });
      for (const c of pick) if (c.zone === 'battlefield') await ctx.g.destroy(c);
    },
  };
  SC['Mass Mutiny'] = {
    resolve: async ctx => {
      const stolen = [];
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const cs = ctx.g.creatures(o);
        if (!cs.length) continue;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cs, min: 0, max: 1, prompt: `Ukradi od ${o.name}`, aiHint: { kind: 'stealPick' },
        });
        const t = pick[0];
        if (!t) continue;
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        stolen.push({ iid: t.iid, orig });
        ctx.g.lg(`${ctx.you.name} krade ${t.name}!`);
      }
      ctx.g.recalc();
      ctx.g.delayed.push({
        on: 'endStep', name: 'Vrati ukradene', ctrl: ctx.you,
        run: async c2 => {
          for (const s of stolen) {
            const x = c2.g.byIid(s.iid);
            if (x && x.zone === 'battlefield') { x.ctrl = s.orig; x.meta.tempHaste = false; }
          }
          c2.g.recalc();
        },
      });
    },
  };
  SC['Requisition Raid'] = {
    modes: {
      pick: 'any',
      list: [
        { label: '+{1}: Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
        { label: '+{1}: Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
        { label: '+{1}: +1/+1 counteri igraču', targets: [T.player({ prompt: 'Kome counteri?', aiHint: { goal: 'self' } })] },
      ],
    },
    spreeCost: 1,
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        const t = ctx.targets[ti++];
        if (mi === 0 && t) await ctx.g.destroy(t);
        else if (mi === 1 && t) await ctx.g.destroy(t);
        else if (mi === 2 && t) { for (const c of ctx.g.creatures(t)) ctx.g.addCounters(c, '+1/+1', 1); }
      }
    },
  };
  SC['Seize the Spotlight'] = {
    resolve: async ctx => {
      const stolen = [];
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const k = await o.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Seize the Spotlight: slava ili bogatstvo?`,
          options: [{ key: 'fame', label: '🎭 Slava (ukradu ti stvorenje)' }, { key: 'fortune', label: '💰 Bogatstvo (karta+Treasure protivniku)' }],
          aiHint: { kind: 'fameFortune', forWhom: ctx.you },
        });
        if (k === 'fame') {
          const cs = ctx.g.creatures(o);
          if (cs.length) {
            const pick = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseCards', from: cs, min: 1, max: 1, prompt: `Ukradi od ${o.name}`, aiHint: { kind: 'stealPick' },
            });
            const t = pick[0];
            if (t) {
              const orig = t.ctrl;
              t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
              stolen.push({ iid: t.iid, orig });
              ctx.g.lg(`${ctx.you.name} krade ${t.name} (slava).`);
            }
          }
        } else {
          await ctx.g.draw(ctx.you, 1);
          await ctx.g.makeTokens('treasure', ctx.you);
        }
      }
      if (stolen.length) {
        ctx.g.recalc();
        ctx.g.delayed.push({
          on: 'endStep', name: 'Vrati ukradene', ctrl: ctx.you,
          run: async c2 => {
            for (const s of stolen) {
              const x = c2.g.byIid(s.iid);
              if (x && x.zone === 'battlefield') { x.ctrl = s.orig; x.meta.tempHaste = false; }
            }
            c2.g.recalc();
          },
        });
      }
    },
  };
  SC["Bandit's Haul"] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'crime', desc: 'Loot counter', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { ctx.g.addCounters(ctx.src, 'loot', 1); },
    }],
    abilities: [{
      label: 'Skini 2 loot: vuci', cost: { tap: true, mana: '{2}', rmCounter: { kind: 'loot', n: 2 } },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      aiScore: () => 4,
    }],
  };
  SC['Bounty Board'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: 'Bounty counter', sorcery: true, cost: { tap: true, mana: '{1}' },
      targets: [T.oppCreature({ prompt: 'Bounty na:', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], 'bounty', 1); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.power >= 4) ? 3 : 0.5,
    }],
    triggers: [{
      on: 'dies', desc: 'Bounty nagrada', filter: (g, self, d) => (d.snap.def && d.card.counters && (d.card.counters['bounty'] || 0) > 0) || false,
      run: async ctx => {
        const owner = ctx.data.snap.ctrl;
        for (const q of ctx.g.alivePlayers()) {
          if (q !== owner) { await ctx.g.draw(q, 1); await ctx.g.gainLife(q, 2); }
        }
      },
    }],
  };
  SC['Glittering Stockpile'] = {
    mana: [
      { cost: { tap: true, counter: 'stash' }, produce: [{ R: 1 }] },
      {
        cost: { tap: true, sacSelf: true },
        produce: (g, c, p) => { const n = c.counters['stash'] || 0; return n > 0 ? COLORS.map(col => ({ [col]: n })) : []; },
      },
    ],
  };
  SC["Trailblazer's Boots"] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (!host) return;
        host.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return g2.lands(blocker.ctrl).some(l => !(l.def.super || []).includes('Basic'));
        })(host.cur.cantBeBlockedBy);
      },
    }],
  };
  SC['Discreet Retreat'] = {
    auraTarget: [T.permanent((g, card) => card.is('Land'), { prompt: 'Enchant land', aiHint: { goal: 'ramp' } })],
    statics: [{
      phase: 2,
      apply: (g, self, bf) => {
        const land = bf.find(card => card.iid === self.attachedTo);
        if (!land) return;
        land.cur.extraMana.push({
          cost: { tap: true }, produce: [{ ANY: true, n: 2 }], restrictAbilities: true,
          restrict: (g2, action) => action && action.card && action.card.is('Creature') && isOutlaw(action.card),
        });
      },
    }],
    triggers: [{
      on: 'cast', desc: 'Outlaw spell → karta', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && isOutlaw(d.card),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'retreat'); },
    }],
  };
  SC['Life Insurance'] = {
    triggers: [
      {
        on: 'cast', desc: 'Extort', filter: (g, self, d) => d.player === self.ctrl, opt: true,
        run: async ctx => {
          if (!ctx.g.canPayMana(ctx.you, U.parseCost('{1}'))) return;
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
          if (!ok) return;
          let gained = 0;
          for (const o of E.eachOpp(ctx.g, ctx.you)) { await ctx.g.loseLife(o, 1, 'extort'); gained++; }
          if (gained) await ctx.g.gainLife(ctx.you, gained);
        },
      },
      {
        on: 'dies', desc: 'Treasure', filter: (g, self, d) => d.snap.types.includes('Creature') && !d.snap.isToken,
        run: async ctx => { await ctx.g.loseLife(ctx.you, 1, 'insurance'); await ctx.g.makeTokens('treasure', ctx.you); },
      },
    ],
  };
  SC['We Ride at Dawn'] = {
    grantsConvokeLegendary: true,
    triggers: [{
      on: 'attacks', desc: 'Mercenary', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('mercenaryR', ctx.you); },
    }],
  };

  // ============================================================
  // ELVEN COUNCIL (LTC) — commander: Galadriel, Elven-Queen
  // ============================================================
  SC['Galadriel, Elven-Queen'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Vijeće: dominion/guidance',
      filter: (g, self, d) => d.player === self.ctrl &&
        g.creatures(self.ctrl).some(c => c !== self && c.hasSub('Elf') && c.meta._enteredTurn === g.turnNo),
      run: async ctx => {
        const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
          { key: 'dominion', label: '👑 Dominion (Ring + counter)' },
          { key: 'guidance', label: '📜 Guidance (karta)' },
        ], (voter) => voter === ctx.you ? 'dominion' : 'guidance');
        if ((votes.get('dominion') || 0) > (votes.get('guidance') || 0)) {
          const rb = await E7.ringTempts(ctx.g, ctx.you);
          if (rb) ctx.g.addCounters(rb, '+1/+1', 1);
        } else {
          await ctx.g.draw(ctx.you, 1);
        }
      },
    }],
  };
  SC['Arbor Elf'] = {
    abilities: [{
      label: 'Untap Forest', cost: { tap: true }, manaAbilityOnly: false,
      cond: (g, c, p) => g.lands(p).some(l => l.hasSub('Forest') && l.tapped),
      run: async ctx => {
        const l = ctx.g.lands(ctx.you).find(l => l.hasSub('Forest') && l.tapped);
        if (l) { l.tapped = false; ctx.g.lg('Arbor Elf: untap Forest.'); }
      },
      aiScore: () => 0.5,
    }],
  };
  SC['Arwen, Weaver of Hope'] = {
    replace: [{
      event: 'etbCounters',
      run: (g, card, src) => card.ctrl === src.ctrl && card !== src,
      n: (g, card, src) => Math.max(0, src.toughness),
    }],
  };
  SC['Celeborn the Wise'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: 'Scry 1', filter: (g, self, d) => d.player === self.ctrl && d.attackers.some(a => a.hasSub('Elf')),
        run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
      },
      {
        on: 'scry', desc: '+X/+X od scryja', filter: (g, self, d) => d.player === self.ctrl && d.n > 0,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, ctx.data.n, ctx.data.n); },
      },
    ],
  };
  SC['Colossal Whale'] = {
    unblockableIfIsland: true,
    statics: [{
      apply: (g, self, bf) => {
        self.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return g2.lands(blocker.ctrl).some(l => l.hasSub('Island'));
        })(self.cur.cantBeBlockedBy);
      },
    }],
    triggers: [{
      on: 'attacks', desc: 'Progutaj stvorenje', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player, opt: true,
      run: async ctx => {
        const defr = ctx.src.attacking;
        const cands = ctx.g.creatures(defr);
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Progutaj (egzil dok kit ne ode)', aiHint: { kind: 'removalPick' },
        });
        const t = pick[0];
        if (!t) return;
        await ctx.g.exileCard(t);
        const whaleIid = ctx.src.iid, tRef = t;
        ctx.g.delayed.push({
          on: 'lto', name: 'Kit oslobađa', ctrl: ctx.you,
          filter: (g2, d) => d.card && d.card.iid === whaleIid,
          run: async c2 => {
            if (tRef.zone === 'exile') {
              tRef.owner.exile.splice(tRef.owner.exile.indexOf(tRef), 1);
              tRef.zone = 'nowhere';
              await c2.g.move(tRef, 'battlefield', { ctrl: tRef.owner });
              c2.g.lg(`${tRef.name} se vraća (kit je otišao).`);
            }
          },
        });
      },
    }],
  };
  SC['Círdan the Shipwright'] = {
    triggers: [
      { on: 'etb', desc: 'Tajno vijeće', filter: etbSelf, run: async ctx => { await cirdanCouncil(ctx); } },
      { on: 'attacks', desc: 'Tajno vijeće', filter: (g, self, d) => d.card === self, run: async ctx => { await cirdanCouncil(ctx); } },
    ],
  };
  async function cirdanCouncil(ctx) {
    const g = ctx.g, players = g.alivePlayers();
    const opts = players.map(q => ({ key: String(q.idx), label: q.name }));
    const { votes } = await E7.secretVote(g, ctx.you, ctx.src, opts);
    for (const q of players) {
      const n = votes.get(String(q.idx)) || 0;
      if (n > 0) await g.draw(q, n);
      else {
        const pool = q.hand.filter(c => c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land'));
        if (pool.length) {
          const pick = await q.controller.decide(g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Permanent na battlefield (besplatno)', aiHint: { kind: 'rampPick' },
          });
          if (pick[0]) await g.move(pick[0], 'battlefield', { ctrl: q });
        }
      }
    }
  }
  SC['Elrond of the White Council'] = {
    triggers: [{
      on: 'etb', desc: 'Tajno vijeće: fellowship/aid', filter: etbSelf,
      run: async ctx => {
        const g = ctx.g;
        const { votes, picks } = await E7.secretVote(g, ctx.you, ctx.src, [
          { key: 'fellowship', label: '🤝 Fellowship (daš stvorenje)' },
          { key: 'aid', label: '⚔️ Aid (counteri Elrondu)' },
        ]);
        for (const [q, k] of picks) {
          if (k === 'fellowship' && q !== ctx.you) {
            const cs = g.creatures(q);
            if (cs.length) {
              const pick = await q.controller.decide(g, {
                type: 'chooseCards', from: cs, min: 1, max: 1, prompt: 'Daj stvorenje Elrondovom vlasniku', aiHint: { kind: 'sacCost' },
              });
              if (pick[0]) { pick[0].ctrl = ctx.you; g.recalc(); g.lg(`${pick[0].name} prelazi kod ${ctx.you.name}.`); }
            }
          }
        }
        const aidN = votes.get('aid') || 0;
        for (let i = 0; i < aidN; i++) for (const c of g.creatures(ctx.you)) g.addCounters(c, '+1/+1', 1);
      },
    }],
  };
  SC['Elvish Archdruid'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.hasSub('Elf')) { c.cur.power++; c.cur.toughness++; }
      },
    }],
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const n = g.creatures(p).filter(x => x.hasSub('Elf')).length;
        return n > 0 ? [{ G: n }] : [];
      },
    },
  };
  SC['Elvish Piper'] = {
    abilities: [{
      label: 'Stvorenje iz ruke na sto', cost: { tap: true, mana: '{G}' },
      cond: (g, c, p) => p.hand.some(x => x.is('Creature')),
      run: async ctx => {
        const pool = ctx.you.hand.filter(x => x.is('Creature'));
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Na battlefield:', aiHint: { kind: 'piperPick' },
        });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      },
      aiScore: (g, c, p) => p.hand.some(x => x.is('Creature') && x.mv >= 5) ? 8 : 0.5,
    }],
  };
  SC['Elvish Visionary'] = {
    triggers: [{ on: 'etb', desc: 'Vuci', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 1); } }],
  };
  SC['Elvish Warmaster'] = {
    triggers: [{
      on: 'etb', desc: 'Elf token', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.hasSub('Elf') && !d.card.isToken,
      run: async ctx => { await ctx.g.makeTokens('elfWarrior', ctx.you); },
    }],
    abilities: [{
      label: 'Elfovi +2/+2 deathtouch', cost: { mana: '{5}{G}{G}' },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Elf')) E.pumpUntilEOT(ctx.g, c, 2, 2, ['deathtouch']);
      },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.hasSub('Elf')).length >= 4 && g.phase === 'main1' ? 6 : 0.5,
    }],
  };
  SC['Erestor of the Council'] = {
    triggers: [{
      on: 'voteEnd', desc: 'Nagrada za glasanje', filter: (g, self, d) => true,
      run: async ctx => {
        const votes = ctx.data.votes;
        const mine = votes && votes['_by_' + ctx.you.idx];
        let differed = 0;
        if (votes && mine !== undefined) {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            const theirs = votes['_by_' + o.idx];
            if (theirs === undefined) continue;
            if (theirs === mine) await ctx.g.makeTokens('treasure', o);
            else differed++;
          }
        }
        if (differed) await E.scry(ctx.g, ctx.you, differed);
        await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Farhaven Elf'] = {
    triggers: [{
      on: 'etb', desc: 'Basic (tapped)', filter: etbSelf, opt: true,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['Gandalf, Westward Voyager'] = {
    triggers: [{
      on: 'cast', desc: 'MV5+ → možda kopija',
      filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5,
      run: async ctx => {
        const g = ctx.g, so = ctx.data.so;
        let match = false;
        for (const o of E.eachOpp(g, ctx.you)) {
          const top = o.library[o.library.length - 1];
          if (!top) continue;
          g.lg(`${o.name} otkriva: ${top.name}.`);
          if (top.def.types.some(t => ctx.data.card.def.types.includes(t))) match = true;
        }
        if (match && so && g.stack.includes(so)) {
          await g.copySpell(so, ctx.you, { mayNewTargets: true });
          for (const o of E.eachOpp(g, ctx.you)) await g.draw(o, 1);
          g.lg('Gandalf: spell kopiran!');
        } else {
          await g.draw(ctx.you, 1);
        }
      },
    }],
  };
  SC['Haldir, Lórien Lieutenant'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    abilities: [{
      label: 'Elfovi +N/+N (N=counteri)', cost: { mana: '{5}{G}' },
      run: async ctx => {
        const n = ctx.src.counters['+1/+1'] || 0;
        if (!n) return;
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.hasSub('Elf')) E.pumpUntilEOT(ctx.g, c, n, n, ['vigilance']);
      },
      aiScore: (g, c, p) => (c.counters['+1/+1'] || 0) >= 3 && g.phase === 'main1' ? 6 : 0.5,
    }],
  };
  SC['Legolas Greenleaf'] = {
    statics: [{
      apply: (g, self) => {
        self.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return blocker.power <= 2;
        })(self.cur.cantBeBlockedBy);
      },
    }],
    triggers: [
      {
        on: 'etb', desc: '+1/+1 (legendarno)',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && (d.card.def.super || []).includes('Legendary'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Mirkwood Elk'] = {
    triggers: [
      { on: 'etb', desc: 'Elf iz groblja', filter: etbSelf, run: async ctx => { await elkReturn(ctx); } },
      { on: 'attacks', desc: 'Elf iz groblja', filter: (g, self, d) => d.card === self, run: async ctx => { await elkReturn(ctx); } },
    ],
  };
  async function elkReturn(ctx) {
    const pool = ctx.you.graveyard.filter(c => c.hasSub && c.def.subtypes.includes('Elf'));
    if (!pool.length) return;
    const pick = await ctx.you.controller.decide(ctx.g, {
      type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Elf u ruku', aiHint: { kind: 'reanimate' },
    });
    if (pick[0]) {
      ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]);
      await ctx.g.gainLife(ctx.you, parseInt(pick[0].def.power || '0', 10) || 0);
    }
  }
  SC['Mirkwood Trapper'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: '-2/-0 napadaču',
        filter: (g, self, d) => d.attackers.some(a => a.attacking === self.ctrl),
        run: async ctx => {
          const a = ctx.data.attackers.find(a => a.attacking === ctx.you);
          if (a) E.pumpUntilEOT(ctx.g, a, -2, 0);
        },
      },
      {
        on: 'attackersDeclared', desc: '+2/+0 tuđem napadaču',
        filter: (g, self, d) => d.player !== self.ctrl && d.attackers.length && !d.attackers.some(a => a.attacking === self.ctrl),
        run: async ctx => {
          const a = ctx.data.attackers[0];
          if (a) E.pumpUntilEOT(ctx.g, a, 2, 0);
        },
      },
    ],
  };
  SC['Radagast, Wizard of Wilds'] = {
    ward: { mana: '{1}' },
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && (c.hasSub('Beast') || c.hasSub('Bird')) && !c.cur.wardCost) c.cur.wardCost = { mana: '{1}' };
        }
      },
    }],
    triggers: [{
      on: 'cast', desc: 'MV5+ → token', filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Radagast:',
          options: [{ key: 'beast', label: '3/3 Beast' }, { key: 'bird', label: '2/2 Bird (flying)' }],
          aiHint: { kind: 'mode' },
        });
        await ctx.g.makeTokens(k === 'beast' ? 'beast33' : 'birdU', ctx.you);
      },
    }],
  };
  SC['Realm Seekers'] = {
    etbCounters: { kind: '+1/+1', n: (g, card) => g.players.reduce((s, q) => s + q.hand.length, 0) },
    abilities: [{
      label: 'Nađi land u ruku', cost: { mana: '{2}{G}', rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => {
        const pool = ctx.you.library.filter(c => c.is('Land'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Land u ruku', aiHint: { kind: 'searchBasic' }, search: true,
        });
        if (pick[0]) {
          ctx.you.library.splice(ctx.you.library.indexOf(pick[0]), 1);
          pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]);
        }
        U.shuffle(ctx.you.library, ctx.g.rnd);
      },
      aiScore: (g, c, p) => g.lands(p).length < 6 ? 3 : 0.3,
    }],
  };
  SC['Wood Elves'] = {
    triggers: [{
      on: 'etb', desc: 'Forest (untapped)', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: false, filter: d => d.subtypes.includes('Forest') }); },
    }],
  };
  SC['Wose Pathfinder'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: '+3/+3 trample', cost: { tap: true, mana: '{6}{G}' },
      targets: [T.creature({ prompt: '+3/+3', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature'), aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0] && ctx.targets[0] !== ctx.src) E.pumpUntilEOT(ctx.g, ctx.targets[0], 3, 3, ['trample']); },
      aiScore: () => 1,
    }],
  };
  SC['Galadhrim Ambush'] = {
    resolve: async ctx => {
      const n = ctx.g.combat ? ctx.g.combat.attackers.length : 0;
      if (n > 0) await ctx.g.makeTokens('elfWarrior', ctx.you, { n });
      ctx.g.untilEffects.push({ expires: 'eot', kind: 'preventNonElfCombat' });
      ctx.g.lg('Galadhrim Ambush: elfovi niču, non-Elf combat šteta spriječena!');
    },
  };
  SC['Growth Spiral'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 1);
      const lands = ctx.you.hand.filter(c => c.is('Land'));
      if (lands.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Land na battlefield?', aiHint: { kind: 'rampPick' },
        });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
      }
    },
  };
  SC['Inscription of Abundance'] = {
    kicker: { cost: '{2}{G}' },
    resolve: async ctx => {
      const doOne = async (used) => {
        const opts = [
          { key: 'counters', label: '2× +1/+1' },
          { key: 'life', label: 'Život = najveći power' },
          { key: 'fight', label: 'Fight' },
        ].filter(o => !used.includes(o.key));
        if (!opts.length) return null;
        const k = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: 'Inscription:', options: opts, aiHint: { kind: 'mode' } });
        if (k === 'counters') {
          const pool = ctx.g.creatures(ctx.you);
          if (pool.length) {
            const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 1, max: 1, prompt: '2× +1/+1:', aiHint: { kind: 'buffPick' } });
            if (pick[0]) ctx.g.addCounters(pick[0], '+1/+1', 2);
          }
        } else if (k === 'life') {
          const best = Math.max(0, ...ctx.g.creatures(ctx.you).map(c => c.power));
          await ctx.g.gainLife(ctx.you, best);
        } else {
          const mine = ctx.g.creatures(ctx.you), opps = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
          if (mine.length && opps.length) {
            const a = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Tvoje:', aiHint: { kind: 'fightMine' } }))[0];
            const b = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: opps, min: 1, max: 1, prompt: 'Meta:', aiHint: { kind: 'removalPick' } }))[0];
            if (a && b) { await ctx.g.damageCreature(a, b, a.power); await ctx.g.damageCreature(b, a, b.power); }
          }
        }
        return k;
      };
      const used = [];
      const k1 = await doOne(used);
      if (k1) used.push(k1);
      if (ctx.kicked) { const k2 = await doOne(used); if (k2) used.push(k2); const k3 = await doOne(used); }
    },
  };
  SC['Learn from the Past'] = {
    targets: [T.player({ prompt: 'Ko miješa groblje?', aiHint: { goal: 'self' } })],
    resolve: async ctx => {
      const q = ctx.targets[0] || ctx.you;
      while (q.graveyard.length) {
        const c = q.graveyard.pop();
        c.zone = 'library'; q.library.push(c);
      }
      U.shuffle(q.library, ctx.g.rnd);
      ctx.g.lg(`${q.name} miješa groblje u library.`);
      await ctx.g.draw(ctx.you, 1);
    },
  };
  SC['Mystic Confluence'] = {
    modes: {
      pick: 3, repeats: true,
      list: [
        { label: 'Counter (osim {3})', targets: [T.spell(null, { prompt: 'Counter', aiHint: { goal: 'counter' } })] },
        { label: 'Bounce stvorenje', targets: [T.creature({ prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
        { label: 'Vuci kartu', targets: null },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0) {
          const so = ctx.targets[ti++];
          if (so && ctx.g.stack.includes(so) && !MTG.isUncounterable(ctx.g, so)) {
            const payer = so.ctrl;
            if (ctx.g.canPayMana(payer, U.parseCost('{3}'))) {
              const yes = await payer.controller.decide(ctx.g, {
                type: 'chooseOption', prompt: `Plati {3} da spasiš ${so.name}?`,
                options: [{ key: 'yes', label: 'Plati' }, { key: 'no', label: 'Ne' }],
                aiHint: { kind: 'taxCounter' },
              });
              if (yes === 'yes' && await ctx.g.payMana(payer, U.parseCost('{3}'))) continue;
            }
            ctx.g.stack.splice(ctx.g.stack.indexOf(so), 1);
            if (!so.isCopy) await ctx.g.move(so.card, 'graveyard');
            ctx.g.lg(`${so.name} COUNTEROVAN!`, 'counter');
          }
        } else if (mi === 1) {
          const t = ctx.targets[ti++];
          if (t && t.zone === 'battlefield') await ctx.g.move(t, 'hand');
        } else {
          await ctx.g.draw(ctx.you, 1);
        }
      }
    },
  };
  SC['Sail into the West'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'return', label: '↩️ Return (vrati 2 iz groblja)' },
        { key: 'embark', label: '🚢 Embark (nova ruka od 7)' },
      ], (voter) => voter.graveyard.length >= 3 ? 'return' : 'embark');
      if ((votes.get('return') || 0) > (votes.get('embark') || 0)) {
        for (const q of ctx.g.alivePlayers()) {
          const pool = q.graveyard.slice();
          if (!pool.length) continue;
          const pick = await q.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 2, prompt: 'Vrati do 2 u ruku', aiHint: { kind: 'reanimate' },
          });
          for (const c of pick) { ctx.g.remove(c); c.zone = 'hand'; q.hand.push(c); }
        }
      } else {
        for (const q of ctx.g.alivePlayers()) {
          const yes = await q.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: 'Odbaci ruku i vuci 7?',
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'wheel' },
          });
          if (yes === 'yes') {
            await ctx.g.discard(q, q.hand.slice());
            await ctx.g.draw(q, 7);
          }
        }
      }
    },
  };
  SC['Trap the Trespassers'] = {
    resolve: async ctx => {
      const g = ctx.g;
      const votes = new Map();
      for (const q of g.alivePlayers()) {
        const cands = g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (!cands.length) break;
        const pick = await q.controller.decide(g, {
          type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Tajno glasaj: stun za...', aiHint: { kind: 'voteExile' },
        });
        if (pick[0]) {
          votes.set(pick[0], (votes.get(pick[0]) || 0) + 1);
          votes['_by_' + q.idx] = pick[0];
        }
      }
      for (const [c, n] of votes) {
        if (c.zone !== 'battlefield') continue;
        ctx.g.addCounters(c, 'stun', n);
        c.tapped = true;
        g.lg(`${c.name}: ${n} stun countera + tap.`);
      }
      await g.emit('voteEnd', { src: ctx.src, by: ctx.you, votes });
    },
  };
  SC['Windswift Slice'] = {
    targets: [
      T.yourCreature({ prompt: 'Tvoje stvorenje', aiHint: { goal: 'buff' } }),
      T.oppCreature({ prompt: 'Meta', aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (!a || !b) return;
      const excess = Math.max(0, a.power - Math.max(0, b.toughness - b.damage));
      await ctx.g.damageCreature(a, b, a.power);
      if (excess > 0) await ctx.g.makeTokens('elfWarrior', ctx.you, { n: excess });
    },
  };
  SC['Devastation Tide'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => !c.is('Land')).slice()) {
        if (c.isToken) { await ctx.g.move(c, 'graveyard'); continue; }
        await ctx.g.move(c, 'hand');
      }
      ctx.g.lg('Devastation Tide: sve nonland vraćeno u ruke!');
    },
  };
  SC['Elven Farsight'] = {
    resolve: async ctx => {
      await E.scry(ctx.g, ctx.you, 3);
      const top = ctx.you.library[ctx.you.library.length - 1];
      if (top && top.is('Creature')) { ctx.g.lg(`Otkriveno: ${top.name} → karta.`); await ctx.g.draw(ctx.you, 1); }
    },
  };
  SC['Genesis Wave'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      const revealed = [];
      for (let i = 0; i < x && ctx.you.library.length; i++) revealed.push(ctx.you.library.pop());
      ctx.g.lg(`Genesis Wave otkriva ${revealed.length} karata.`);
      for (const c of revealed) {
        const isPerm = c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land') || c.is('Planeswalker');
        if (isPerm && c.mv <= x) {
          c.zone = 'nowhere';
          await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        } else {
          c.zone = 'graveyard'; ctx.you.graveyard.push(c);
        }
      }
    },
  };
  SC['Overwhelming Stampede'] = {
    resolve: async ctx => {
      const best = Math.max(0, ...ctx.g.creatures(ctx.you).map(c => c.power));
      for (const c of ctx.g.creatures(ctx.you)) E.pumpUntilEOT(ctx.g, c, best, best, ['trample']);
    },
  };
  SC['Plea for Power'] = {
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'time', label: '⏰ Time (ekstra potez)' },
        { key: 'knowledge', label: '📚 Knowledge (3 karte)' },
      ], (voter) => voter === ctx.you ? 'time' : 'knowledge');
      if ((votes.get('time') || 0) > (votes.get('knowledge') || 0)) {
        ctx.g.extraTurns = ctx.g.extraTurns || [];
        ctx.g.extraTurns.push(ctx.you);
        ctx.g.lg(`${ctx.you.name} dobija EKSTRA POTEZ!`);
      } else {
        await ctx.g.draw(ctx.you, 3);
      }
    },
  };
  SC['Raise the Palisade'] = {
    resolve: async ctx => {
      // izaberi tip: najzastupljeniji među tvojima
      const counts = {};
      for (const c of ctx.g.creatures(ctx.you)) for (const s of c.cur.subtypes) counts[s] = (counts[s] || 0) + 1;
      const type = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'Elf';
      ctx.g.lg(`Raise the Palisade: izabran tip ${type}.`);
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.hasSub(type)).slice()) {
        if (c.isToken) await ctx.g.move(c, 'graveyard');
        else await ctx.g.move(c, 'hand');
      }
    },
  };
  SC['Seeds of Renewal'] = {
    selfCostAdjust: (g, card, p) => -E.eachOpp(g, p).length,
    exileOnResolve: true,
    resolve: async ctx => {
      const pool = ctx.you.graveyard.slice();
      if (!pool.length) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 0, max: 2, prompt: 'Vrati do 2 u ruku', aiHint: { kind: 'reanimate' },
      });
      for (const c of pick) { ctx.g.remove(c); c.zone = 'hand'; ctx.you.hand.push(c); }
    },
  };
  SC['Sylvan Offering'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (x <= 0) return;
      const opps = E.eachOpp(ctx.g, ctx.you);
      const o1 = opps.sort((a, b) => a.life - b.life)[0];
      const treeDef = Object.assign({}, TK.beast33, { name: 'Treefolk', subtypes: ['Treefolk'], power: String(x), toughness: String(x) });
      await ctx.g.makeTokens(treeDef, ctx.you);
      if (o1) await ctx.g.makeTokens(treeDef, o1);
      const o2 = opps[1] || o1;
      await ctx.g.makeTokens('elfWarrior', ctx.you, { n: x });
      if (o2) await ctx.g.makeTokens('elfWarrior', o2, { n: x });
    },
  };
  SC['Travel Through Caradhras'] = {
    exileOnResolve: true,
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'pass', label: '⛰️ Redhorn Pass (landovi tebi)' },
        { key: 'mines', label: '⚒️ Mines of Moria (groblje tebi)' },
      ], (voter) => 'pass');
      const passN = votes.get('pass') || 0;
      const minesN = votes.get('mines') || 0;
      for (let i = 0; i < passN; i++) await E.searchBasic(ctx.g, ctx.you, { tapped: true });
      for (let i = 0; i < minesN && ctx.you.graveyard.length; i++) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.graveyard, min: 0, max: 1, prompt: 'U ruku:', aiHint: { kind: 'reanimate' },
        });
        if (!pick[0]) break;
        ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]);
      }
    },
  };
  SC['Lothlórien Blade'] = {
    equip: '{5}',
    equipAlt: { filter: c => c.hasSub('Elf'), cost: '{2}' },
    triggers: [{
      on: 'attacks', desc: 'Šteta braniocu', filter: (g, self, d) => d.card.iid === self.attachedTo,
      run: async ctx => {
        const host = ctx.g.byIid(ctx.src.attachedTo);
        if (!host || !(host.attacking instanceof MTG.Player)) return;
        const cands = ctx.g.creatures(host.attacking);
        if (!cands.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Šteta ${host.power}:`, aiHint: { kind: 'removalPick' },
        });
        if (pick[0]) await ctx.g.damageCreature(host, pick[0], host.power);
      },
    }],
  };
  SC['Mirror of Galadriel'] = {
    abilities: [{
      label: 'Scry 1 + vuci', cost: { tap: true, mana: (g, c) => '{' + Math.max(0, 5 - g.creatures(c.ctrl).filter(x => (x.cur.super || []).includes('Legendary')).length) + '}' },
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); await ctx.g.draw(ctx.you, 1); },
      aiScore: () => 3,
    }],
  };
  SC['Model of Unity'] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'voteEnd', desc: 'Scry 2', filter: (g, self, d) => true,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 2); },
    }],
  };
  SC['Asceticism'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.hexproof = true;
      },
    }],
    abilities: [{
      label: 'Regeneriši', cost: { mana: '{1}{G}' },
      targets: [T.yourCreature({ prompt: 'Regen štit', aiHint: { goal: 'protect' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.targets[0].regenShield++; },
      aiScore: () => 0.5,
    }],
  };
  SC['Lignify'] = {
    aura: true,
    auraTarget: [T.creature({ prompt: 'Enchant creature', aiHint: { goal: 'debuff' } })],
    statics: [{
      // phase 1 = layer 7b (CR 613.4b): base P/T se mora postaviti PRIJE nego
      // recalc kopira base → cur, inače se upis tiho izgubi.
      phase: 1,
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (!host) return;
        host.cur.basePower = 0; host.cur.baseToughness = 4;
        host.cur.kw.clear();
        host.cur.subtypes = ['Treefolk'];
        host.cur.extraAbilities = [];
        host.cur.abilitiesDisabled = true;
      },
    }],
  };
  SC['Song of Eärendil'] = {
    saga: [
      { run: async ctx => { await E.scry(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 2); } },
      { run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); await ctx.g.makeTokens('birdU', ctx.you); } },
      {
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if (!c.kw('flying')) ctx.g.addCounters(c, 'flying', 1);
          ctx.g.lg('Song of Eärendil III: flying counteri svima!');
        },
      },
    ],
    triggers: [{
      on: 'upkeep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }],
  };
})();
