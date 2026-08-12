// ===== scripts_v9b.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v9b — DOOM PREVAILS + THE FANTASTIC FOUR + WAKANDA FOREVER (MSC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7, E9 = MTG.E9;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const isVillain = (c) => c.hasSub ? c.hasSub('Villain') : (c.def.subtypes || []).includes('Villain');

  // ============================================================
  // DOOM PREVAILS — commander: Doctor Doom, King of Latveria
  // ============================================================
  SC['Doctor Doom, King of Latveria'] = {
    triggers: [
      {
        on: 'discardedLands', desc: 'Drain 2', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 2, 'doom'); },
      },
      {
        on: 'beginCombat', desc: 'Villain connive + menace', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const cands = ctx.g.creatures(ctx.you).filter(c => isVillain(c));
          if (!cands.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Doom: koji Villain?', aiHint: { kind: 'buffPick' },
          });
          const t = pick[0] || cands[0];
          E.grantUntilEOT(ctx.g, t, ['menace']);
          await ctx.g.connive(t);
        },
      },
    ],
  };
  SC['Abomination, World Ravager'] = {
    mayhem: { cost: '{4}{R}', speed: 'sorcery' },
  };
  SC['Baron Strucker, HYDRA Overlord'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && (q.card.def.subtypes || []).includes('Villain')) ? -1 : 0],
    triggers: [{
      on: 'etb', desc: 'Connive (1×/potez)', oncePerTurn: true, opt: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && d.card.hasSub('Villain'),
      run: async ctx => { await ctx.g.connive(ctx.data.card); },
    }],
  };
  SC['Batroc the Leaper'] = {
    multikicker: '{2}',
    etbCounters: { kind: '+1/+1', n: (g, card) => card.meta.paidTimes || 0 },
    triggers: [{
      on: 'etb', desc: 'Šteta = power', filter: etbSelf,
      run: async ctx => {
        const x = ctx.src.meta.paidTimes || 0;
        if (!x) return;
        const pow = ctx.src.power;
        const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).sort((a, b) => b.power - a.power);
        for (let i = 0; i < Math.min(x, cands.length); i++) await ctx.g.damageCreature(ctx.src, cands[i], pow);
      },
    }],
  };
  SC['Chameleon, Master of Disguise'] = {
    mayhem: { cost: '{2}{U}', speed: 'sorcery' },
    triggers: [{
      on: 'etb', desc: 'Kopiraj stvorenje', filter: etbSelf, opt: true,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src);
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.power - a.power)[0];
        if (best.power <= ctx.src.power) return;
        const base = best.isCopyOf || best.def;
        ctx.src.isCopyOf = base;
        ctx.src.def = Object.assign({}, base, { name: 'Chameleon, Master of Disguise' });
        ctx.g.recalc();
        ctx.g.lg(`Chameleon kopira ${best.name}.`);
      },
    }],
  };
  SC['Awesome Android'] = {
    triggers: [{
      on: 'discarded', desc: 'Igraj odbačeno', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone !== 'graveyard' || c.is('Land')) return;
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = ctx.g.turnNo;
        ctx.g.lg(`Awesome Android: ${c.name} igraj ovaj potez.`);
      },
    }],
  };
  SC['Helmut Zemo, Mastermind'] = {
    triggers: [{
      on: 'attacks', desc: 'I/S iz groblja', filter: (g, self, d) => d.card === self, opt: true,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => (c.is('Instant') || c.is('Sorcery')) && c.mv <= ctx.src.power);
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Baci iz groblja:', aiHint: { kind: 'bestGyCast' },
        });
        const c = pick[0];
        if (!c) return;
        ctx.g.remove(c); c.zone = 'nowhere';
        const ok = await ctx.g.castSpell(ctx.you, c, { from: 'graveyard', exileAfter: true });
        if (!ok) { c.zone = 'graveyard'; ctx.you.graveyard.push(c); }
        else ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Iron Monger, Sadistic Tycoon'] = {
    triggers: [{
      on: 'connive', desc: '+1/+1 Villainima', filter: (g, self, d) => d.ctrl === self.ctrl,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (isVillain(c)) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };
  SC['Kang Prime'] = {
    triggers: [
      { on: 'etb', desc: 'Suspend vrha', filter: etbSelf, run: async ctx => { await kangSuspend(ctx); } },
      { on: 'attacks', desc: 'Suspend vrha', filter: (g, self, d) => d.card === self, run: async ctx => { await kangSuspend(ctx); } },
    ],
  };
  async function kangSuspend(ctx) {
    const you = ctx.you, g = ctx.g;
    while (you.library.length) {
      const c = you.library.pop();
      if (c.is('Land')) { c.zone = 'exile'; you.exile.push(c); continue; }
      c.zone = 'exile'; you.exile.push(c);
      c.meta = { suspended: 2 };
      g.lg(`Kang Prime: ${c.name} suspendovan (2).`);
      break;
    }
  }
  SC['Kang, Temporal Tyrant'] = {
    triggers: [
      { on: 'attacks', desc: 'Connive', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.connive(ctx.src); } },
      {
        on: 'draw', desc: 'Drain 1', filter: (g, self, d) => d.player === self.ctrl && d.nth === 2,
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 1, 'kang');
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Killmonger, Ruthless Usurper'] = {
    triggers: [
      {
        on: 'attacks', desc: '+1/+0 po artefaktu', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player,
        run: async ctx => {
          const n = ctx.g.bf().filter(c => c.ctrl === ctx.src.attacking && c.is('Artifact')).length;
          if (n) E.pumpUntilEOT(ctx.g, ctx.src, n, 0);
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Žrtvuje artefakt', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const victim = ctx.data.player;
          const arts = ctx.g.bf().filter(c => c.ctrl === victim && c.is('Artifact') && !c.is('Land'));
          if (arts.length) {
            const pick = await victim.controller.decide(ctx.g, { type: 'chooseCards', from: arts, min: 1, max: 1, prompt: 'Žrtvuj artefakt', aiHint: { kind: 'sacCost' } });
            if (pick[0]) await ctx.g.sacrifice(victim, pick[0]);
          }
          await ctx.g.makeTokens('treasure', ctx.you);
        },
      },
    ],
  };
  SC['Klaw, Master of Sound'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Ukradi vrh', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const victim = ctx.data.player;
        if (!victim || !victim.library.length) return;
        const c = victim.library.pop();
        c.zone = 'exile'; victim.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = 9999; c.meta.anyColor = true;
        ctx.g.lg(`Klaw krade vrh: ${c.name} — ${ctx.you.name} to smije igrati.`);
      },
    }, {
      on: 'cast', desc: 'Indestructible iz egzila',
      filter: (g, self, d) => d.player === self.ctrl && d.so && d.so.from === 'exile',
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
    }],
  };
  SC['Lady Loki, Agent of Chaos'] = {
    triggers: [{
      on: 'castIS', desc: 'Haos-zamjena', oncePerTurn: true, filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const you = ctx.you, g = ctx.g;
        let hit = null;
        while (you.library.length) {
          const c = you.library.pop();
          c.zone = 'exile'; you.exile.push(c);
          if (!c.is('Land')) { hit = c; break; }
        }
        if (!hit) return;
        const diff = Math.abs((ctx.data.mv || 0) - hit.mv);
        if (diff > 0) for (const o of E.eachOpp(g, you)) await g.damagePlayer(ctx.src, o, diff);
        const yes = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `Lady Loki: baci besplatno ${hit.name}?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
        });
        if (yes === 'yes') {
          you.exile.splice(you.exile.indexOf(hit), 1); hit.zone = 'nowhere';
          const ok = await g.castSpell(you, hit, { free: true, from: 'exile' });
          if (!ok) { hit.zone = 'exile'; you.exile.push(hit); }
        }
      },
    }],
  };
  SC['Living Laser'] = {
    kws: ['haste'],
    triggers: [{
      on: 'attacks', desc: 'Kopije po odbačenom', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const n = ctx.you.turnState.discardedN || 0;
        if (!n || !ctx.src.attacking) return;
        const made = await E9.tempCopyAttacking(ctx.g, ctx.src, ctx.src, Math.min(n, 3), ctx.src.attacking, ctx.you);
        for (const m of made) m.meta.exileEndCombat = true;
      },
    }],
  };
  SC['Loki, the Deceiver'] = {
    triggers: [
      {
        on: 'attacks', desc: 'Kopija Villaina', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const cands = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src && isVillain(c));
          if (!cands.length || !ctx.src.attacking) return;
          const best = cands.sort((a, b) => b.power - a.power)[0];
          const made = await ctx.g.copyPermanentToken(best, ctx.you, { tapped: true, attacking: ctx.src.attacking });
          E7.sacAtNextEnd(ctx.g, made, ctx.you);
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci', oncePerTurn: true,
        filter: (g, self, d) => d.card.ctrl === self.ctrl && isVillain(d.card),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Madame Hydra'] = {
    triggers: [{
      on: 'cast', desc: 'Villain token',
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && (d.card.def.subtypes || []).includes('Villain'),
      run: async ctx => { await ctx.g.makeTokens('villainB', ctx.you); },
    }],
  };
  SC['Molecule Man'] = {
    triggers: [{
      on: 'draw', desc: 'Miracle {0}',
      filter: (g, self, d) => d.player === self.ctrl && d.nth === 1 && !d.card.is('Land') && d.card.zone === 'hand',
      run: async ctx => {
        const card = ctx.data.card;
        const choice = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Miracle {0}: baci ${card.name} sada?`,
          options: [{ key: 'yes', label: 'Baci za {0}' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'freeCast', card },
        });
        if (choice === 'yes' && card.zone === 'hand') await ctx.g.castSpell(ctx.you, card, { from: 'hand', alt: { free: true, speed: 'instant', miracle: true } });
      },
    }],
  };
  SC['Moonstone, Harsh Mistress'] = {
    triggers: [{
      on: 'discarded', desc: 'Igraj odbačeno (duže)', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone !== 'graveyard' || c.is('Land')) return;
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = ctx.g.turnNo + 1;
        ctx.g.lg(`Moonstone: ${c.name} igraj do kraja sljedećeg poteza.`);
      },
    }],
  };
  SC['Prowler, Clawed Thief'] = {
    triggers: [{
      on: 'etb', desc: 'Connive',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && d.card.hasSub('Villain'),
      run: async ctx => { await ctx.g.connive(ctx.src); },
    }],
  };
  SC['Puppet Master, String Puller'] = {
    triggers: [
      {
        on: 'attackersDeclared', desc: 'Goad', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
        run: async ctx => {
          const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
          if (!cands.length) return;
          const t = cands.sort((a, b) => b.power - a.power)[0];
          E.goad(ctx.g, t, ctx.you);
          const iid = t.iid;
          ctx.g.untilEffects.push({
            expires: 'untilTurnOf', whoTurn: ctx.you, kind: 'cantBlockCard',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.cantBlock = true; },
          });
          ctx.g.recalc();
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Treasure (goadovani)',
        filter: (g, self, d) => {
          const gg = g.untilEffects.some(e => e.kind === 'goadCard' && e.iid === d.card.iid);
          return gg && d.player !== self.ctrl && E.eachOpp(g, self.ctrl).includes(d.player);
        },
        run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
      },
    ],
  };
  SC['Red Ghost, Intangible Genius'] = {
    ward: { mana: '{2}' },
    statics: [{ apply: (g, self) => { self.cur.unblockable = true; } }],
    triggers: [{
      on: 'draw', desc: 'Ape Villain', filter: (g, self, d) => d.player === self.ctrl && d.nth === 2,
      run: async ctx => { await ctx.g.makeTokens('apeVillain', ctx.you); },
    }],
  };
  SC["Loki's Double"] = {
    triggers: [{
      on: 'etb', desc: 'Kopiraj svoje stvorenje', filter: etbSelf, opt: true,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src);
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.power - a.power)[0];
        const base = best.isCopyOf || best.def;
        ctx.src.isCopyOf = base;
        ctx.src.def = Object.assign({}, base, { super: (base.super || []).filter(s => s !== 'Legendary') });
        ctx.g.recalc();
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        ctx.g.lg(`Loki's Double kopira ${best.name}.`);
      },
    }],
  };
  SC['Stilt-Man, Towering Terror'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Ukradi permanent', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && isVillain(d.card),
      run: async ctx => {
        const victim = ctx.data.player;
        const cands = ctx.g.bf().filter(c => c.ctrl === victim && !c.is('Creature') && !c.is('Land'));
        if (!cands.length) return;
        const t = cands.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        const orig = t.ctrl;
        t.ctrl = ctx.you; ctx.g.recalc();
        ctx.g.lg(`Stilt-Man krade ${t.name} do tvog sljedećeg poteza!`);
        const iid = t.iid, you = ctx.you;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Stilt-Man vraća', ctrl: you,
          filter: (g2, d2) => d2.player === you,
          run: async c2 => { const x = c2.g.byIid(iid); if (x && x.zone === 'battlefield') { x.ctrl = orig; c2.g.recalc(); } },
        });
      },
    }],
  };
  SC['Superior Foes of Spider-Man'] = {
    triggers: [{
      on: 'cast', desc: 'Impuls', filter: (g, self, d) => d.player === self.ctrl && d.mv >= 4, opt: true,
      run: async ctx => {
        if (!ctx.you.library.length) return;
        const prev = ctx.src.meta._impulseIid && ctx.g.byIid(ctx.src.meta._impulseIid);
        if (prev && prev.meta) prev.meta.playableUntil = -1;   // stara prestaje važiti
        const c = ctx.you.library.pop();
        c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = 9999;
        ctx.src.meta._impulseIid = c.iid;
        ctx.g.lg(`Superior Foes: ${c.name} igraj dok ne egzilaš drugu.`);
      },
    }],
  };
  SC['The Frightful Four'] = {
    triggers: [{
      on: 'cast', desc: 'Kazna', oncePerTurn: true,
      filter: (g, self, d) => d.player !== self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => {
        const caster = ctx.data.player;
        await ctx.g.loseLife(caster, ctx.data.mv || 0, 'frightful');
        ctx.g.lg(`The Frightful Four kažnjava: -${ctx.data.mv} života.`);
      },
    }],
  };
  SC['The Squadron Sinister'] = {
    mayhem: { cost: '{3}{U}{R}', speed: 'sorcery' },
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c !== self && c.is('Creature') && c.hasSub('Villain')) {
            c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('flying'); c.cur.kw.add('haste');
          }
        }
      },
    }],
  };
  SC["Lady Loki's Manifestation"] = {
    asEnters: async (g, card) => { card.meta.chosenType = 'Villain'; },
    statics: [{ apply: (g, self) => { if (!self.cur.subtypes.includes('Villain')) self.cur.subtypes.push('Villain'); } }],
    triggers: [
      { on: 'etb', desc: 'Vuci po Villainu', filter: etbSelf, run: async ctx => { await manifDraw(ctx); } },
      { on: 'attacks', desc: 'Vuci po Villainu', filter: (g, self, d) => d.card === self, run: async ctx => { await manifDraw(ctx); } },
    ],
  };
  async function manifDraw(ctx) {
    const n = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src && c.hasSub('Villain')).length;
    if (!n) return;
    await ctx.g.draw(ctx.you, n);
    if (ctx.you.hand.length) {
      const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'addlDiscard' } });
      await ctx.g.discard(ctx.you, pick);
    }
  }
  SC['Titania, Proud Pummeler'] = {
    kws: ['first strike'],
    triggers: [{
      on: 'attacks', desc: 'Melee svima', filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => {
        const c = ctx.data.card;
        const defs = new Set(ctx.g.combat ? ctx.g.combat.attackers.filter(a => a.ctrl === ctx.you).map(a => a.attacking).filter(x => x instanceof MTG.Player) : []);
        if (defs.size) E.pumpUntilEOT(ctx.g, c, defs.size, defs.size);
      },
    }],
  };
  SC['Tombstone, Career Criminal'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && (q.card.def.subtypes || []).includes('Villain')) ? -1 : 0],
    triggers: [{
      on: 'etb', desc: 'Villain iz groblja', filter: etbSelf,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => c.is('Creature') && isVillain(c));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'U ruku:', aiHint: { kind: 'reanimate' } });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
      },
    }],
  };
  SC['Tri-Sentinel, Act of Vengeance'] = {
    triggers: [{
      on: 'etb', desc: '3 štete po protivniku', filter: etbSelf,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const cands = ctx.g.creatures(o);
          if (!cands.length) continue;
          const t = cands.sort((a, b) => b.power - a.power)[0];
          await ctx.g.damageCreature(ctx.src, t, 3);
        }
      },
    }],
    gyAbility: {
      label: 'Unearth {7}', cost: '{7}', sorcery: true,
      run: async ctx => {
        const c = ctx.src;
        // gyAbility ga je već egzilirao — vrati na sto
        ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1);
        c.zone = 'nowhere';
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        c.meta.tempHaste = true;
        E7.sacAtNextEnd(ctx.g, [c], ctx.you);
        ctx.g.lg('Tri-Sentinel unearth!');
      },
    },
  };
  SC['Typhoid Mary, Fractured'] = {
    triggers: [{
      on: 'attacks', desc: 'Mary/Typhoid/Bloody', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const discarded = (ctx.you.turnState.discardedN || 0) > 0;
        let k;
        if (discarded) {
          k = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: 'Typhoid Mary:',
            options: [{ key: 't', label: 'Treasure' }, { key: 'd', label: 'Karta' }, { key: 'b', label: 'Drain 2' }],
            aiHint: { kind: 'mode' },
          });
        } else k = ['t', 'd', 'b'][Math.floor(ctx.g.rnd() * 3)];
        if (k === 't') await ctx.g.makeTokens('treasure', ctx.you);
        else if (k === 'd') await ctx.g.draw(ctx.you, 1);
        else {
          for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 2, 'mary');
          await ctx.g.gainLife(ctx.you, 2);
        }
      },
    }],
  };
  SC['Ultron, Unlimited'] = {
    triggers: [
      { on: 'attacks', desc: 'Connive', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.connive(ctx.src); } },
      {
        on: 'connive', desc: 'Robot token', opt: true,
        filter: (g, self, d) => d.ctrl === self.ctrl && g.canPayMana(self.ctrl, U.parseCost('{1}')),
        run: async ctx => {
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
          if (ok) await ctx.g.makeTokens('robotVillain', ctx.you);
        },
      },
    ],
  };
  SC['Lethal Scheme'] = {
    convoke: true,
    targets: [{
      what: 'permanent', prompt: 'Stvorenje/PW',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
      for (const creature of ctx.so.convokedCards || []) {
        if (creature.zone === 'battlefield' && creature.ctrl === ctx.you) await ctx.g.connive(creature);
      }
    },
  };
  SC['Withering Torment'] = {
    targets: [T.permanent((g, c) => c.is('Creature') || c.is('Enchantment'), { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      await ctx.g.destroy(ctx.targets[0]);
      await ctx.g.loseLife(ctx.you, 2, 'torment');
    },
  };
  SC['Endless Ranks of HYDRA'] = {
    resolve: async ctx => {
      for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.makeTokens('villainB', ctx.you);
    },
    triggers: [{
      on: 'etb', zone: 'graveyard', opt: true, desc: 'HYDRA povratak',
      filter: (g, self, d) => d.card.commander && d.card.ctrl === self.owner,
      run: async ctx => {
        if (ctx.src.zone !== 'graveyard') return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}{B}'));
        if (!ok) return;
        ctx.g.remove(ctx.src); ctx.src.zone = 'hand'; ctx.you.hand.push(ctx.src);
        ctx.g.lg('Endless Ranks of HYDRA se vraća u ruku.');
      },
    }, {
      on: 'attacks', zone: 'graveyard', opt: true, desc: 'HYDRA povratak',
      filter: (g, self, d) => d.card.commander && d.card.ctrl === self.owner,
      run: async ctx => {
        if (ctx.src.zone !== 'graveyard') return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}{B}'));
        if (!ok) return;
        ctx.g.remove(ctx.src); ctx.src.zone = 'hand'; ctx.you.hand.push(ctx.src);
        ctx.g.lg('Endless Ranks of HYDRA se vraća u ruku.');
      },
    }],
  };
  SC['Extract Power'] = {
    resolve: async ctx => {
      for (const q of ctx.g.alivePlayers()) {
        if (!q.library.length) continue;
        const c = q.library.pop();
        c.zone = 'exile'; q.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = 9999; c.meta.freePlay = true;
        ctx.g.lg(`Extract Power: ${c.name} (od ${q.name}) — ${ctx.you.name} smije baciti besplatno.`);
      }
    },
  };
  SC['Kindred Dominance'] = {
    resolve: async ctx => {
      const type = E9.bestSubtype(ctx.g, ctx.you);
      ctx.g.lg(`Kindred Dominance: tip ${type}.`);
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.hasSub(type)).slice()) await ctx.g.destroy(c);
    },
  };
  SC['Syphon Mind'] = {
    resolve: async ctx => {
      let n = 0;
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        if (!o.hand.length) continue;
        const pick = await o.controller.decide(ctx.g, { type: 'chooseCards', from: o.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'cleanupDiscard' } });
        await ctx.g.discard(o, pick);
        n++;
      }
      if (n) await ctx.g.draw(ctx.you, n);
    },
  };
  SC['Toxic Deluge'] = {
    resolve: async ctx => {
      const biggest = Math.max(0, ...ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).map(c => c.toughness));
      const x = Math.min(Math.max(2, biggest), Math.max(1, ctx.you.life - 4), 8);
      await ctx.g.loseLife(ctx.you, x, 'deluge');
      for (const c of ctx.g.bf().filter(c => c.is('Creature'))) E.pumpUntilEOT(ctx.g, c, -x, -x);
      ctx.g.recalc();
      await ctx.g.checkSBA();
      ctx.g.lg(`Toxic Deluge: -${x}/-${x} svima.`);
    },
  };
  SC['Currency Converter'] = {
    abilities: [
      {
        label: 'Vuci pa odbaci', cost: { tap: true, mana: '{2}' },
        run: async ctx => {
          await ctx.g.draw(ctx.you, 1);
          if (ctx.you.hand.length) {
            const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'addlDiscard' } });
            await ctx.g.discard(ctx.you, pick);
          }
        },
        aiScore: () => 1.5,
      },
      {
        label: 'Pretvori egziliranu kartu', cost: { tap: true },
        cond: (g, self) => (self.meta.converted || []).some(iid => {
          const card = g.byIid(iid); return card && card.zone === 'exile';
        }),
        run: async ctx => {
          const pool = (ctx.src.meta.converted || []).map(iid => ctx.g.byIid(iid)).filter(card => card && card.zone === 'exile');
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Vrati egziliranu kartu u groblje', aiHint: { kind: 'bestCard' },
          });
          const card = picked[0];
          if (!card) return;
          await ctx.g.move(card, 'graveyard');
          ctx.src.meta.converted = (ctx.src.meta.converted || []).filter(iid => iid !== card.iid);
          if (card.is('Land')) await ctx.g.makeTokens('treasure', ctx.you);
          else await ctx.g.makeTokens('rogue22', ctx.you);
        },
      },
    ],
    triggers: [{
      on: 'discarded', desc: 'Egzilaj odbačenu kartu', filter: (g, self, d) => d.player === self.ctrl && d.card.zone === 'graveyard', opt: true,
      run: async ctx => {
        const card = ctx.data.card;
        await ctx.g.move(card, 'exile');
        ctx.src.meta.converted = (ctx.src.meta.converted || []).concat(card.iid);
      },
    }],
  };
  SC['Damocles Base, Sword of Kang'] = {
    crew: 3,
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Villainous choice', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const victim = ctx.data.player;
        if (!victim || victim.lost) return;
        const cands = ctx.g.creatures(victim).filter(c => !c.isToken);
        const k = await victim.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Villainous choice:',
          options: [
            { key: 'sac', label: cands.length ? 'Žrtvuj stvorenje' : 'Žrtvuj (nemaš!)' },
            { key: 'life', label: '-2 života, on vuče 2' },
          ],
          aiHint: { kind: 'mode' },
        });
        if (k === 'sac' && cands.length) {
          const pick = await victim.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Žrtvuj', aiHint: { kind: 'sacCost' } });
          if (pick[0]) await ctx.g.sacrifice(victim, pick[0]);
        } else {
          await ctx.g.loseLife(victim, 2, 'damocles');
          await ctx.g.draw(ctx.you, 2);
        }
      },
    }],
  };
  SC["Doom's Time Platform"] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Suspend iz groblja', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => !c.is('Land'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Suspend (2):', aiHint: { kind: 'bestGyCast' } });
        const c = pick[0];
        if (!c) return;
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = { suspended: 2 };
        ctx.g.lg(`Time Platform: ${c.name} suspendovan.`);
      },
    }],
  };
  SC["Loki's Scepter"] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'etb', desc: 'Ukradi stvorenje (EOT)', filter: etbSelf,
      run: async ctx => {
        const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (!cands.length) return;
        const t = cands.sort((a, b) => b.power - a.power)[0];
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        ctx.g.recalc();
        ctx.g.lg(`Loki's Scepter krade ${t.name}!`);
        const iid = t.iid;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Scepter vraća', ctrl: ctx.you,
          run: async c2 => { const x = c2.g.byIid(iid); if (x && x.zone === 'battlefield') { x.ctrl = orig; x.meta.tempHaste = false; c2.g.recalc(); } },
        });
      },
    }],
  };
  SC['Patchwork Banner'] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); },
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    statics: [{
      apply: (g, self, bf) => {
        if (!self.meta.chosenType) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub(self.meta.chosenType)) { c.cur.power++; c.cur.toughness++; }
      },
    }],
  };
  SC["Progenitor's Icon"] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); },
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: 'Sljedeći izabrani tip ima flash', cost: { tap: true },
      run: async ctx => {
        ctx.you.tempFlashFilters = (ctx.you.tempFlashFilters || []).filter(x => x.turn === ctx.g.turnNo);
        const type = ctx.src.meta.chosenType;
        ctx.you.tempFlashFilters.push({
          turn: ctx.g.turnNo,
          filter: (g, card) => card.is('Creature') && card.hasSub(type),
          once: true,
        });
        ctx.g.lg(`Progenitor's Icon: sljedeći ${type} spell može kao flash.`);
      },
    }],
  };
  SC['Talisman of Dominance'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  };
  SC['Age of Ultron'] = {
    saga: [
      {
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            const cands = ctx.g.creatures(o).filter(c => !c.is('Artifact'));
            if (!cands.length) continue;
            const t = cands.sort((a, b) => b.power - a.power)[0];
            await ctx.g.destroy(t);
          }
        },
      },
      { run: async ctx => { for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.makeTokens('robotVillain', ctx.you); } },
      {
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (c.is('Artifact')) { E.grantUntilEOT(ctx.g, c, ['deathtouch']); ctx.g.addCounters(c, '+1/+1', 1); }
          }
        },
      },
    ],
    triggers: [{
      on: 'upkeep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }],
  };
  SC['Archnemesis'] = {
    isPlayerAura: true,
    targets: [T.opponent({ prompt: 'Enchant protivnika', aiHint: { goal: 'drain' } })],
    triggers: [{
      on: 'attackersDeclared', desc: 'Kazna',
      filter: (g, self, d) => {
        const victim = self.meta && self.meta.cursedPlayer;
        return d.player === self.ctrl && victim && d.attackers.some(a => a.attacking === victim);
      },
      run: async ctx => {
        const victim = ctx.src.meta.cursedPlayer;
        if (!victim || victim.lost) return;
        await ctx.g.loseLife(victim, 2, 'nemesis');
        await ctx.g.draw(ctx.you, 1);
        await ctx.g.gainLife(ctx.you, 2);
      },
    }, {
      on: 'attackersDeclared', desc: 'Premjesti Archnemesis', opt: true,
      filter: (g, self, d) => d.player !== self.ctrl && d.attackers.some(a => a.attacking === self.ctrl),
      run: async ctx => {
        ctx.src.meta.cursedPlayer = ctx.data.player;
        ctx.g.lg(`Archnemesis se veže za ${ctx.data.player.name}.`);
      },
    }],
  };
  SC['Black Market Connections'] = {
    triggers: [{
      on: 'precombatMain', desc: 'Izbor', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const ks = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseMulti', prompt: 'Black Market Connections (1+):',
          options: [
            { key: 't', label: 'Treasure (-1 život)' },
            { key: 'c', label: 'Karta (-2 života)' },
            { key: 's', label: 'Shapeshifter 3/2 (-3 života)' },
          ],
          min: 1, max: 3, aiHint: { kind: 'modes' },
        });
        for (const k of ks || ['t']) {
          if (k === 't') { await ctx.g.makeTokens('treasure', ctx.you); await ctx.g.loseLife(ctx.you, 1, 'bmc'); }
          else if (k === 'c') { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 2, 'bmc'); }
          else {
            await ctx.g.makeTokens('shapeshifter32', ctx.you);
            await ctx.g.loseLife(ctx.you, 3, 'bmc');
          }
        }
      },
    }],
  };
  SC['Glorious Purpose'] = {
    triggers: [{
      on: 'connive', desc: 'Plan counteri', filter: (g, self, d) => d.ctrl === self.ctrl,
      run: async ctx => {
        if (ctx.data.card && ctx.data.card.zone === 'battlefield') ctx.g.addCounters(ctx.data.card, '+1/+1', 1);
        ctx.g.addCounters(ctx.src, 'plan', 1);
        if ((ctx.src.counters['plan'] || 0) >= 6) {
          await ctx.g.sacrifice(ctx.you, ctx.src);
          const four = [];
          for (let i = 0; i < 4 && ctx.you.library.length; i++) {
            const c = ctx.you.library.pop(); c.zone = 'exile'; ctx.you.exile.push(c); four.push(c);
          }
          for (const c of four.slice()) {
            if (c.is('Land')) { ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); continue; }
            const yes = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: `Baci besplatno: ${c.name}?`,
              options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
            });
            if (yes === 'yes') {
              ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1); c.zone = 'nowhere';
              const ok = await ctx.g.castSpell(ctx.you, c, { free: true, from: 'exile' });
              if (!ok) { c.zone = 'exile'; ctx.you.exile.push(c); }
            } else { ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); }
          }
          ctx.g.lg('GLORIOUS PURPOSE! Plan ispunjen!');
        }
      },
    }],
  };
  SC['Kang Dynasty'] = {
    saga: [
      { run: async ctx => { await kangGoad(ctx); } },
      { run: async ctx => { await kangGoad(ctx); } },
      {
        run: async ctx => {
          const cands = ctx.g.creatures(ctx.you);
          if (!cands.length) return;
          const t = cands.sort((a, b) => b.power - a.power)[0];
          E.pumpUntilEOT(ctx.g, t, ctx.you.hand.length, 0);
          const iid = t.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
          });
          ctx.g.recalc();
        },
      },
    ],
    triggers: [{
      on: 'upkeep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
    }],
  };
  async function kangGoad(ctx) {
    for (const o of E.eachOpp(ctx.g, ctx.you)) {
      const cands = ctx.g.creatures(o);
      if (!cands.length) continue;
      const t = cands.sort((a, b) => b.power - a.power)[0];
      t.tapped = true;
      E.goad(ctx.g, t, ctx.you);
    }
  }
  // Doom lands
  SC['Choked Estuary'] = {
    producesColors: ['U', 'B'], mana: { cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }] },
    entersTapped: (g, card) => !card.ctrl.hand.some(c => c.def.subtypes.includes('Island') || c.def.subtypes.includes('Swamp')),
  };
  SC['Crumbling Necropolis'] = { producesColors: ['U', 'B', 'R'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }, { R: 1 }] } };
  SC['Drowned Catacomb'] = {
    producesColors: ['U', 'B'], mana: { cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }] },
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && (l.hasSub('Island') || l.hasSub('Swamp'))),
  };
  SC['Fetid Pools'] = { producesColors: ['U', 'B'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }] }, cycling: { cost: '{2}' } };
  SC['Luxury Suite'] = {
    producesColors: ['B', 'R'], mana: { cost: { tap: true }, produce: [{ B: 1 }, { R: 1 }] },
    entersTapped: (g, card) => g.alivePlayers().filter(x => x !== card.ctrl).length < 2,
  };
  SC['Villainous Hideout'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
        restrict: (g, forSpell) => forSpell && forSpell.card && (forSpell.card.def.subtypes || []).includes('Villain'),
      },
    ],
    abilities: [{
      label: 'Villain connive', sorcery: true, cost: { tap: true, mana: '{3}' },
      cond: (g, c, p) => g.creatures(p).some(x => x.hasSub('Villain')),
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you).filter(c => c.hasSub('Villain'));
        if (cands.length) await ctx.g.connive(cands.sort((a, b) => b.power - a.power)[0]);
      },
      aiScore: () => 1.5,
    }],
  };

  // ============================================================
  // THE FANTASTIC FOUR — commander: Invisible Woman
  // ============================================================
  SC['Invisible Woman'] = {
    triggers: [
      {
        on: 'beginCombat', desc: 'Wall token',
        filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
        run: async ctx => { await ctx.g.makeTokens('wall03', ctx.you); },
      },
      {
        on: 'attackersDeclared', desc: 'Nevidljivi udar', opt: true,
        filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0 && g.canPayMana(self.ctrl, U.parseCost('{R}{G}{W}{U}')),
        run: async ctx => {
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{R}{G}{W}{U}'));
          if (!ok) return;
          const atk = ctx.data.attackers.slice().sort((a, b) => b.power - a.power)[0];
          if (!atk) return;
          E.pumpUntilEOT(ctx.g, atk, ctx.g.creatures(ctx.you).length, 0);
          const iid = atk.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
          });
          ctx.g.recalc();
          ctx.g.lg(`${atk.name} je nevidljiv — neblokabilan!`);
        },
      },
    ],
  };
  SC['Alicia Masters, Skilled Sculptor'] = {
    triggers: [
      {
        on: 'beginCombat', desc: 'Treasure',
        filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
        run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
      },
      {
        on: 'endStep', desc: 'Sense the Good: vrati vlasnicima',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          for (const creature of ctx.g.bf().filter(card => card.is('Creature'))) creature.ctrl = creature.owner;
          ctx.g.recalc();
        },
      },
    ],
  };
  SC['Black Bolt, Inhuman King'] = {
    triggers: [
      {
        on: 'castIS', desc: '+2/+2', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 2, 2); },
      },
      {
        on: 'targeted', desc: 'Lethal Voice',
        filter: (g, self, d) => d.card === self && d.byPlayer && d.byPlayer !== self.ctrl,
        run: async ctx => {
          const caster = ctx.data.byPlayer;
          const cands = ctx.g.bf().filter(c => c.ctrl === caster && !c.is('Land'));
          if (cands.length) await ctx.g.destroy(cands.sort((a, b) => b.power - a.power)[0]);
        },
      },
    ],
  };
  SC['Council of Reeds'] = {
    ignoreLegendRuleCreatures: true,
    triggers: [{
      on: 'beginCombat', desc: 'Kopija sebe',
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => { await ctx.g.copyPermanentToken(ctx.src, ctx.you, {}); },
    }],
  };
  SC['Crystal, Inhuman Princess'] = {
    mana: { cost: { tap: true }, produce: [{ R: 1 }, { G: 1 }, { W: 1 }, { U: 1 }] },
    triggers: [{
      on: 'cast', desc: 'Šteta po bojama',
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => {
        const x = (ctx.data.card.colors || []).length;
        if (x) for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.damagePlayer(ctx.src, o, x);
      },
    }],
  };
  SC['Dragon Man, Reformed Robot'] = {
    cdaPower: (g, c) => {
      let best = 0;
      for (const x of g.bf()) if (x.ctrl === c.ctrl && !x.is('Creature') && !x.is('Land')) best = Math.max(best, x.mv);
      for (const x of c.ctrl.graveyard) if (!x.is('Creature')) best = Math.max(best, U.mv(x.def.cost || ''));
      return best;
    },
    jumpstart: { altCostStr: '{2}{W}{U}', speed: 'sorcery', label: 'Baci iz groblja + odbaci kartu' },
  };
  SC['Franklin Richards, Ascendant'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Discover 6',
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => { await E7.discover(ctx.g, ctx.you, 6, ctx.src); },
    }],
  };
  SC['Galactus, Devourer of Worlds'] = {
    triggers: [{
      on: 'etb', desc: 'Egzilaj permanent', filter: etbSelf,
      targets: [T.permanent((g, c, ctrl) => c.ctrl !== ctrl, { prompt: 'Egzilaj', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.exileCard(ctx.targets[0]); },
    }],
    mustAttack: true,
    attackTargetRestriction: (g, self, target) => {
      if (g.creatures(self.ctrl).some(c => c.name === "Silver Surfer, Galactus's Herald")) return true;
      const opponents = g.alivePlayers().filter(p => p !== self.ctrl);
      const highest = Math.max(...opponents.map(p => p.life));
      return target instanceof MTG.Player && target.life === highest;
    },
  };
  SC['H.E.R.B.I.E., Lovable Robot'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{1}' }, produce: [{ ANY: true, n: 1 }] },
    ],
    triggers: [{
      on: 'beginCombat', desc: 'Surveil 1',
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); },
    }],
  };
  SC['Human Torch'] = {
    triggers: [
      {
        on: 'beginCombat', desc: 'FLAME ON!',
        filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
        run: async ctx => {
          E.grantUntilEOT(ctx.g, ctx.src, ['flying', 'double strike', 'haste']);
          ctx.src.meta.tempHaste = true;
          ctx.g.lg('FLAME ON! 🔥');
        },
      },
      {
        on: 'attacks', desc: 'Plati RGWU za odraz štete', opt: true,
        filter: (g, self, d) => d.card === self && g.canPayMana(self.ctrl, U.parseCost('{R}{G}{W}{U}')),
        run: async ctx => {
          if (await ctx.g.payMana(ctx.you, U.parseCost('{R}{G}{W}{U}'))) ctx.src.meta._torchReflectTurn = ctx.g.turnNo;
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Odrazi combat štetu',
        filter: (g, self, d) => d.card === self && self.meta._torchReflectTurn === g.turnNo,
        run: async ctx => {
          for (const opponent of E.eachOpp(ctx.g, ctx.you)) {
            if (opponent !== ctx.data.player) await ctx.g.damagePlayer(ctx.src, opponent, ctx.data.n || 0);
          }
        },
      },
    ],
  };
  SC['Lockjaw, Slobbering Teleporter'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Teleport',
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => {
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        const cands = [ctx.src].concat(ctx.g.creatures(ctx.you).filter(c => c !== ctx.src).sort((a, b) => b.power - a.power).slice(0, 1));
        for (const t of cands) {
          const iid = t.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
          });
        }
        ctx.g.recalc();
      },
    }],
  };
  SC['Medusa, Inhuman Queen'] = {
    triggers: [{
      on: 'cast', desc: '+1/+1', filter: (g, self, d) => !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };
  SC['Mister Fantastic'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Vuci',
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    abilities: [{
      label: 'Kopiraj svoj trigger dvaput', cost: { mana: '{R}{G}{W}{U}', tap: true },
      targets: [T.ability((g, so, ctrl) => so.kind === 'trigger' && so.ctrl === ctrl, { prompt: 'Kopiraj svoj trigger', aiHint: { goal: 'copy' } })],
      run: async ctx => {
        const ability = ctx.targets[0];
        if (!ability || !ctx.g.stack.includes(ability)) return;
        await ctx.g.copyStackAbility(ability, ctx.you, { mayNewTargets: true });
        await ctx.g.copyStackAbility(ability, ctx.you, { mayNewTargets: true });
      },
    }],
  };
  SC['Mister Fantastic, Reed Richards'] = {
    triggers: [{
      on: 'tokensCreated', desc: 'Vuci', oncePerTurn: true, filter: (g, self, d) => d.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Namor, Atlantean King'] = {
    triggers: [
      {
        on: 'cast', desc: 'Merfolk', filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
        run: async ctx => { await ctx.g.makeTokens('merfolkU', ctx.you); },
      },
      {
        on: 'attacks', desc: '+2/+0 saveznicima', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player && d.defender.life > self.ctrl.life,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.attacking === ctx.src.attacking) E.pumpUntilEOT(ctx.g, c, 2, 0);
        },
      },
    ],
  };
  SC['Power Pack'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'I/S iz groblja', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (!pool.length) return;
        const c = pool[Math.floor(ctx.g.rnd() * pool.length)];
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        const you = ctx.you;
        ctx.g.delayed.push({
          on: 'upkeep', name: 'Power Pack cast', ctrl: you,
          filter: (g2, d) => d.player === you,
          run: async c2 => { await E.castCopyFromZone(c2.g, you, c); },
        });
        ctx.g.lg(`Power Pack: ${c.name} sljedećeg upkeepa besplatno.`);
      },
    }],
  };
  SC["Silver Surfer, Galactus's Herald"] = {
    triggers: [
      {
        on: 'etb', desc: 'Traži Galactusa', filter: etbSelf, opt: true,
        run: async ctx => {
          const c = ctx.you.library.find(x => x.name === 'Galactus, Devourer of Worlds');
          if (c) { ctx.you.library.splice(ctx.you.library.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); U.shuffle(ctx.you.library, ctx.g.rnd); ctx.g.lg('Galactus u ruku!'); }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Usmjeri napad', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const victim = ctx.data.player;
          const cands = ctx.g.creatures(victim);
          if (!cands.length) return;
          const t = cands.sort((a, b) => b.power - a.power)[0];
          ctx.g.untilEffects.push({ kind: 'mustAttack', who: t.ctrl, expires: 'untilTurnOf', whoTurn: ctx.you });
          ctx.g.lg(`Silver Surfer: ${t.name} mora napadati.`);
        },
      },
    ],
  };
  SC['The Thing'] = {
    triggers: [{
      on: 'beginCombat', desc: "CLOBBERIN' TIME",
      filter: (g, self, d) => d.player === self.ctrl && E9.castNoncreatureThisTurn(self.ctrl),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 4); ctx.g.lg("IT'S CLOBBERIN' TIME! 💪"); },
    }, {
      on: 'attacks', desc: 'Plati i udvostruči countere', opt: true,
      filter: (g, self, d) => d.card === self && g.canPayMana(self.ctrl, U.parseCost('{R}{G}{W}{U}')),
      targets: [{ what: 'permanent', count: 999, upTo: true, prompt: 'Udvostruči countere na svojim permanentima', filter: (g, c, ctrl) => c.ctrl === ctrl, aiHint: { goal: 'buff' } }],
      run: async ctx => {
        if (!await ctx.g.payMana(ctx.you, U.parseCost('{R}{G}{W}{U}'))) return;
        for (const permanent of ctx.targets.flat().filter(Boolean)) {
          for (const [kind, amount] of Object.entries(permanent.counters)) {
            if (amount > 0) ctx.g.addCounters(permanent, kind, amount, true);
          }
        }
        ctx.g.recalc();
      },
    }],
  };
  SC['Valeria Richards, Precocious'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && !q.card.is('Creature')) ? -1 : 0],
    triggers: [{
      on: 'cast', desc: 'Vuci (1. noncreature)', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Willie Lumpkin, Postman'] = {
    statics: [{ apply: (g, self) => { self.cur.unblockable = true; } }],
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Pošta', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        await ctx.g.draw(ctx.you, 1);
        const victim = ctx.data.player;
        if (victim && !victim.lost) {
          await ctx.g.draw(victim, 1);
          ctx.g.untilEffects.push({ kind: 'cantAttackPlayer', who: victim, notPlayer: ctx.you, expires: 'untilTurnOf', whoTurn: ctx.you });
        }
      },
    }],
  };
  SC['Bovine Intervention'] = {
    targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Creature'), { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const owner = t.ctrl;
      await ctx.g.destroy(t);
      await ctx.g.makeTokens('ox22', owner);
    },
  };
  SC['Clever Concealment'] = {
    convoke: true,
    targets: [{
      what: 'permanent', upTo: true, count: 999, prompt: 'Bilo koji broj tvojih nonland permanenata',
      filter: (g, c, ctrl) => c.ctrl === ctrl && !c.is('Land'), aiHint: { goal: 'protect' },
    }],
    resolve: async ctx => {
      for (const card of (Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets).filter(Boolean)) ctx.g.phaseOut(card, ctx.you);
    },
  };
  SC['First Family'] = {
    resolve: async ctx => {
      const cols = new Set();
      for (const c of ctx.g.bf()) if (c.ctrl === ctx.you) for (const col of c.colors) cols.add(col);
      for (const s of ctx.you.turnState.spellsCastList) for (const col of (s.card.colors || [])) cols.add(col);
      const x = cols.size;
      await ctx.g.draw(ctx.you, x);
      await ctx.g.gainLife(ctx.you, x);
    },
  };
  SC['Invisible Force Field'] = {
    rebound: true,
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.ctrl === ctx.you && !c.is('Land')).slice(0, 4)) E.grantUntilEOT(ctx.g, c, ['indestructible']);
    },
  };
  SC['Cleansing Nova'] = {
    modes: {
      pick: 1,
      list: [{ label: 'Uništi sva stvorenja' }, { label: 'Uništi artefakte i enchantmente' }],
    },
    resolve: async ctx => {
      const filt = ctx.mode[0] === 0 ? (c) => c.is('Creature') : (c) => (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land');
      for (const c of ctx.g.bf().filter(filt).slice()) await ctx.g.destroy(c);
    },
  };
  SC['Collective Effort'] = {
    modes: {
      pick: 'any',
      list: [
        { label: 'Uništi stvorenje (power 4+)', targets: [T.creature({ prompt: 'Power 4+', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.power >= 4, aiHint: { goal: 'removal' } })] },
        { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Ench', aiHint: { goal: 'removal' } })] },
        { label: '+1/+1 counteri tvojima' },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      let extra = (ctx.mode || []).length - 1;
      // escalate: tapuj stvorenja
      const untapped = ctx.g.creatures(ctx.you).filter(c => !c.tapped);
      for (let i = 0; i < extra && i < untapped.length; i++) untapped[i].tapped = true;
      for (const mi of ctx.mode || []) {
        if (mi === 0 || mi === 1) { const t = ctx.targets[ti++]; if (t) await ctx.g.destroy(t); }
        else { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); }
      }
    },
  };
  SC['Fantastic Elasticity'] = {
    rebound: true,
    modes: {
      pick: 1,
      list: [
        { label: 'Bounce nonland', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
        { label: 'I/S iz groblja u ruku' },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) { if (ctx.targets[0] && ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); }
      else {
        const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (pool.length) {
          const best = pool.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
          ctx.g.remove(best); best.zone = 'hand'; ctx.you.hand.push(best);
        }
      }
    },
  };
  SC['Flame On!'] = {
    rebound: true,
    targets: [T.yourCreature({ prompt: '+X counteri', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const x = ctx.you.graveyard.filter(c => !c.is('Creature') && !c.is('Land')).length;
      if (x) ctx.g.addCounters(t, '+1/+1', x);
      E.grantUntilEOT(ctx.g, t, ['flying']);
    },
  };
  SC['The Five Arrive'] = {
    resolve: async ctx => {
      const top = [];
      for (let i = 0; i < 5 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
      for (const c of top) {
        const isPerm = c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land') || c.is('Planeswalker');
        if (isPerm) { c.zone = 'nowhere'; await ctx.g.move(c, 'battlefield', { ctrl: ctx.you }); }
        else { c.zone = 'hand'; ctx.you.hand.push(c); }
      }
      ctx.g.lg('The Five Arrive: sve na sto!');
    },
    exileOnResolve: true,
  };
  SC['Hull Breach'] = {
    modes: {
      pick: 1,
      list: [
        { label: 'Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact') && !c.is('Land'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Ench', aiHint: { goal: 'removal' } })] },
        {
          label: 'Oba', targets: [
            T.permanent((g, c) => c.is('Artifact') && !c.is('Land'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } }),
            T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Ench', aiHint: { goal: 'removal' } }),
          ],
        },
      ],
    },
    resolve: async ctx => { for (const t of ctx.targets.filter(Boolean)) if (t.zone === 'battlefield') await ctx.g.destroy(t); },
  };
  // Oracle nema zaseban resolution efekt: cijeli tekst čine cascade i rebound.
  SC['Into the Time Vortex'] = { cascade: true, rebound: true, rulesOnlySpell: true };
  SC["It's Clobberin' Time!"] = {
    rebound: true,
    modes: {
      pick: 1,
      list: [
        { label: 'Fight-šteta', targets: [T.yourCreature({ prompt: 'Tvoje', aiHint: { goal: 'buff' } }), T.oppCreature({ prompt: 'Meta', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi artefakt/ench', targets: [T.permanent((g, c) => (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land'), { prompt: 'Meta', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) {
        const [a, b] = ctx.targets;
        if (a && b) await ctx.g.damageCreature(a, b, a.power);
      } else if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
    },
  };
  SC['Nova Flame'] = {
    xCost: true,
    targets: [T.yourCreature({ prompt: '+X counteri', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      ctx.g.addCounters(t, '+1/+1', ctx.x || 0);
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c !== t).slice()) await ctx.g.damageCreature(t, c, t.power);
    },
  };
  SC['Quantum Misalignment'] = {
    rebound: true,
    targets: [T.yourCreature({ prompt: 'Kopiraj', aiHint: { goal: 'buff' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.copyPermanentToken(ctx.targets[0], ctx.you, {}); },
  };
  SC['Recurring Insight'] = {
    rebound: true,
    resolve: async ctx => {
      const best = E.eachOpp(ctx.g, ctx.you).sort((a, b) => b.hand.length - a.hand.length)[0];
      if (best) await ctx.g.draw(ctx.you, best.hand.length);
    },
  };
  SC['Seize the Day'] = {
    flashback: { cost: '{2}{R}', altCostStr: '{2}{R}', speed: 'sorcery' },
    resolve: async ctx => {
      const cands = ctx.g.creatures(ctx.you).filter(c => c.tapped);
      if (cands.length) cands.sort((a, b) => b.power - a.power)[0].tapped = false;
      ctx.g._extraCombats = (ctx.g._extraCombats || 0) + 1;
      ctx.g.lg('Seize the Day: dodatni combat!');
    },
  };
  SC['Taunt from the Rampart'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you)) {
        E.goad(ctx.g, c, ctx.you);
        const iid = c.iid;
        ctx.g.untilEffects.push({
          expires: 'untilTurnOf', whoTurn: ctx.you, kind: 'cantBlockCard2',
          apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.cantBlock = true; },
        });
      }
      ctx.g.recalc();
      ctx.g.lg('Taunt from the Rampart: svi goadovani i ne mogu blokirati!');
    },
  };
  SC['Terramorph'] = {
    rebound: true,
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: false }); },
  };
  SC['Three Visits'] = {
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: false, filter: d => d.subtypes.includes('Forest') }); },
  };
  SC['Tragic Arrogance'] = {
    resolve: async ctx => {
      for (const q of ctx.g.alivePlayers()) {
        const perms = ctx.g.bf().filter(c => c.ctrl === q && !c.is('Land'));
        const keep = new Set();
        for (const type of ['Artifact', 'Creature', 'Enchantment', 'Planeswalker']) {
          const of = perms.filter(c => c.is(type) && !keep.has(c));
          if (!of.length) continue;
          // ti biraš — najgori za protivnike, najbolji za tebe
          const sorted = of.sort((a, b) => (q === ctx.you ? b.power - a.power : a.power - b.power) || (q === ctx.you ? U.mv(b.def.cost || '') - U.mv(a.def.cost || '') : U.mv(a.def.cost || '') - U.mv(b.def.cost || '')));
          keep.add(sorted[0]);
        }
        for (const c of perms.slice()) {
          if (!keep.has(c) && c.zone === 'battlefield') await ctx.g.sacrifice(q, c);
        }
      }
      ctx.g.lg('Tragic Arrogance!');
    },
  };
  SC['Ultimate Nullification'] = {
    addlCost: { sacCreature: true },
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.exileCard(c);
      for (const q of ctx.g.players) {
        while (q.graveyard.length) { const c = q.graveyard.pop(); c.zone = 'exile'; q.exile.push(c); }
      }
      const card = ctx.src;
      if (card.zone === 'stack' || card.zone === 'graveyard') {
        ctx.g.remove(card); card.zone = 'library'; ctx.you.library.unshift(card);
      }
      ctx.g.lg('Ultimate Nullification: sva stvorenja i groblja egzilirana!');
    },
  };
  SC['Mirage Mirror'] = {
    abilities: [{
      label: 'Kopiraj permanent (EOT)', cost: { mana: '{2}' },
      run: async ctx => {
        const cands = ctx.g.bf().filter(c => c !== ctx.src && !c.isToken);
        if (!cands.length) return;
        const best = cands.sort((a, b) => (b.is('Creature') ? b.power : 2) - (a.is('Creature') ? a.power : 2))[0];
        const iid = ctx.src.iid, base = best.isCopyOf || best.def;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'mirror',
          apply: (g2, bf) => {
            const c = bf.find(y => y.iid === iid);
            if (!c) return;
            c.cur.types = base.types.slice();
            c.cur.subtypes = (base.subtypes || []).slice();
            c.cur.basePower = parseInt(base.power || '0', 10) || 0;
            c.cur.baseToughness = parseInt(base.toughness || '0', 10) || 0;
            for (const k of (base.kws || [])) c.cur.kw.add(k);
          },
        });
        ctx.g.recalc();
        ctx.g.lg(`Mirage Mirror postaje ${best.name}.`);
      },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.power >= 5) ? 3 : 0.3,
    }],
  };
  SC['Negative Zone Portal'] = {
    abilities: [{
      label: 'Egzilaj iz groblja', cost: { tap: true, mana: '{2}' },
      targets: [{ zone: 'graveyard', anyGraveyard: true, what: 'card', prompt: 'Egzilaj iz protivničkog groblja', filter: (g, card, ctrl) => card.owner !== ctrl, aiHint: { kind: 'gyHate' } }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        await ctx.g.move(card, 'exile');
        ctx.src.meta.portalCards = (ctx.src.meta.portalCards || []).concat(card.iid);
        if (card.is('Creature')) await ctx.g.draw(ctx.you, 1);
        ctx.g.lg(`Portal egzilira ${card.name}.`);
      },
      aiScore: (g, c, p) => E.eachOpp(g, p).some(o => o.graveyard.length > 3) ? 2 : 0.2,
    }],
    triggers: [{
      on: 'upkeep', desc: 'Negative Zone coin flip',
      filter: (g, self, d) => d.player === self.ctrl && (self.meta.portalCards || [])
        .map(iid => g.byIid(iid)).filter(card => card && card.zone === 'exile' && card.is('Creature')).length >= 4,
      run: async ctx => {
        const won = ctx.g.rnd() < 0.5;
        ctx.g.lg(`Negative Zone Portal: ${won ? 'dobijen' : 'izgubljen'} coin flip.`);
        if (won) return;
        const cards = (ctx.src.meta.portalCards || []).map(iid => ctx.g.byIid(iid)).filter(card => card && card.zone === 'exile');
        await ctx.g.sacrifice(ctx.you, ctx.src);
        if (!cards.length) return;
        const card = cards[Math.floor(ctx.g.rnd() * cards.length)];
        await ctx.g.move(card, 'hand');
      },
    }],
  };
  SC['The Fantasticar'] = {
    crew: 0,
    triggers: [
      {
        on: 'cast', desc: 'Postaje stvorenje', filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'), opt: true,
        run: async ctx => {
          const iid = ctx.src.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'animate',
            apply: (g2, bf) => {
              const c = bf.find(y => y.iid === iid);
              if (c && !c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            },
          });
          ctx.g.recalc();
        },
      },
      {
        on: 'cast', desc: '4. spell → Constructi',
        filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land') &&
          self.ctrl.turnState.spellsCastList.filter(x => !x.card.is('Creature')).length === 4,
        run: async ctx => {
          await ctx.g.sacrifice(ctx.you, ctx.src);
          await ctx.g.makeTokens('construct44F', ctx.you, { n: 4 });
          ctx.g.lg('Fantasticar → 4× 4/4 Construct!');
        },
      },
    ],
  };
  SC['Unstable Molecule Suit'] = {
    equip: '{4}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('indestructible'); }
      },
    }],
  };
  SC["Franklin's Finality"] = {
    triggers: [{
      on: 'etb', desc: '5 šteta', filter: etbSelf,
      targets: [{ what: 'permanent', prompt: '5 šteta', filter: (g, c, ctrl) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')) && c.ctrl !== ctrl, aiHint: { goal: 'removal', dmg: 5 } }],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 5); },
    }],
    doubleTriggerFilter: (g, self, source) => source.ctrl === self.ctrl &&
      source.is('Creature') && (source.def.super || []).includes('Legendary'),
  };
  SC['Cosmic Crucible'] = {
    triggers: [
      {
        on: 'precombatMain', desc: '4 mane', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const made = [];
          for (let i = 0; i < 4; i++) {
            const color = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: `Cosmic Crucible: boja mane ${i + 1}/4`,
              options: ['W', 'U', 'B', 'R', 'G'].map(key => ({ key, label: key })), aiHint: { kind: 'manaColor' },
            });
            const chosen = ['W', 'U', 'B', 'R', 'G'].includes(color) ? color : 'W';
            ctx.you.pool[chosen] = (ctx.you.pool[chosen] || 0) + 1;
            made.push(chosen);
          }
          ctx.g.lg(`Cosmic Crucible: +4 mane (${made.join('')}).`);
        },
      },
      {
        on: 'castIS', desc: 'Kopija', oncePerTurn: true, opt: true, filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const so = ctx.data.so;
          if (so && ctx.g.stack.includes(so)) await ctx.g.copySpell(so, ctx.you, { mayNewTargets: true });
        },
      },
    ],
  };
  SC["The Watcher's Warning"] = {
    triggers: [{
      on: 'cast', desc: 'Ukradi vrh', oncePerTurn: true,
      filter: (g, self, d) => d.player !== self.ctrl && d.nthThisTurn === 1,
      run: async ctx => {
        const caster = ctx.data.player;
        if (!caster.library.length) return;
        const c = caster.library.pop();
        c.zone = 'exile'; caster.exile.push(c);
        if (!c.is('Land')) {
          const yes = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Watcher: baci besplatno ${c.name}?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
          });
          if (yes === 'yes') {
            caster.exile.splice(caster.exile.indexOf(c), 1); c.zone = 'nowhere';
            const ok = await ctx.g.castSpell(ctx.you, c, { free: true, from: 'exile', asThoughAnyColor: true });
            if (!ok) { c.zone = 'exile'; caster.exile.push(c); }
          }
        }
      },
    }],
  };
  SC['Monologue Tax'] = {
    triggers: [{
      on: 'cast', desc: 'Treasure',
      filter: (g, self, d) => d.player !== self.ctrl && d.nthThisTurn === 2 && E.eachOpp(g, self.ctrl).includes(d.player),
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
  };
  SC['Whirlwind of Thought'] = {
    triggers: [{
      on: 'cast', desc: 'Vuci', filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Baxter Building'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{4}' }, produce: [{ G: 1, U: 1, W: 1, R: 1 }] },
    ],
    abilities: [{
      label: 'Vuci (tou 4+)', cost: { tap: true, mana: '{4}' },
      cond: (g, c, p) => g.creatures(p).some(x => x.toughness >= 4),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      aiScore: () => 1,
    }],
  };
  // ============================================================
  // WAKANDA FOREVER — commander: T'Challa, the Black Panther
  // ============================================================
  SC["T'Challa, the Black Panther"] = {
    triggers: [
      { on: 'etb', desc: 'Vibranium', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true }); } },
      { on: 'attacks', desc: 'Vibranium', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true }); } },
      {
        on: 'cast', desc: '2× +1/+1', filter: (g, self, d) => d.player === self.ctrl && d.card.is('Artifact') && d.mv >= 4,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 2); },
      },
    ],
  };
  SC['Bast, Panther Goddess'] = {
    statics: [{
      cond: (g, self) => g.creatures(self.ctrl).length < 3,
      apply: (g, self) => { self.cur.cantAttack = true; self.cur.cantBlock = true; },
    }],
    triggers: [{
      on: 'attackersDeclared', desc: '+X/+X', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        const n = ctx.g.creatures(ctx.you).length;
        const best = ctx.data.attackers.slice().sort((a, b) => b.power - a.power)[0];
        if (best) E.pumpUntilEOT(ctx.g, best, n, n);
      },
    }],
  };
  SC['Dora Milaje Elite'] = {
    triggers: [{
      on: 'etb', desc: 'Vibranium?', filter: etbSelf,
      run: async ctx => {
        if (E.eachOpp(ctx.g, ctx.you).some(o => ctx.g.lands(o).length > ctx.g.lands(ctx.you).length)) {
          await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true });
        }
      },
    }],
    abilities: [{
      label: 'Sac: legende indestructible', cost: { sacSelf: true },
      run: async ctx => {
        for (const c of ctx.g.bf()) if (c.ctrl === ctx.you && (c.cur.super || []).includes('Legendary')) E.grantUntilEOT(ctx.g, c, ['indestructible']);
      },
      aiScore: () => 0.3,
    }],
  };
  SC['Everett K. Ross, Hapless Attaché'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.commander && c.is('Creature')) { c.cur.power++; c.cur.toughness++; c.cur.kw.add('lifelink'); }
      },
    }],
    triggers: [{
      on: 'attackersDeclared', desc: 'Vuci',
      filter: (g, self, d) => d.player !== self.ctrl && d.attackers.filter(a => a.attacking === self.ctrl).length >= 2,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Wakandan War Panther'] = {
    abilities: [{
      label: 'Monstrosity 1', cost: { mana: '{3}{G}{W}' },
      cond: (g, c) => !c.meta.monstrous,
      run: async ctx => { ctx.src.meta.monstrous = true; ctx.g.addCounters(ctx.src, '+1/+1', 1); ctx.g.lg(`${ctx.src.name} je monstrous!`); },
      aiScore: (g, c) => c.meta.monstrous ? 0 : 3,
    }],
    statics: [{
      cond: (g, self) => !!self.meta.monstrous,
      apply: (g, self) => { self.cur.hexproof = true; self.cur.kw.add('indestructible'); },
    }],
  };
  SC['Hatut Zeraze Strike Force'] = {
    triggers: [{
      on: 'cast', zone: 'stack', desc: 'Kopije po commander castovima',
      filter: (g, self, d) => d.card === self && d.player === self.ctrl && self.ctrl.commanderCasts > 0,
      run: async ctx => {
        const original = ctx.data.so;
        for (let i = 0; i < ctx.you.commanderCasts; i++) await ctx.g.copySpell(original, ctx.you, {});
      },
    }, {
      on: 'etb', desc: 'Uništi art/ench', filter: etbSelf,
      targets: [T.permanent((g, c) => (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land'), { prompt: 'Uništi', upTo: true, aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Ingenious Smith'] = {
    triggers: [
      {
        on: 'etb', desc: 'Traži artefakt', filter: etbSelf,
        run: async ctx => {
          const top = [];
          for (let i = 0; i < 4 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
          const art = top.find(c => c.is('Artifact'));
          if (art) { art.zone = 'hand'; ctx.you.hand.push(art); ctx.g.lg(`Smith: ${art.name}.`); }
          for (const c of top) if (c !== art) { c.zone = 'library'; ctx.you.library.unshift(c); }
        },
      },
      {
        on: 'etb', desc: '+1/+1', oncePerTurn: true,
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Artifact'),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
    ],
  };
  SC['Loyal Guardian'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Counteri svima',
      filter: (g, self, d) => d.player === self.ctrl && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };
  SC['Loyal Retainers'] = {
    abilities: [{
      label: 'Sac: legenda iz groblja', sorcery: true, cost: { sacSelf: true },
      cond: (g, c, p) => g.turnPlayer === p && p.graveyard.some(x => x.is('Creature') && (x.def.super || []).includes('Legendary')),
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(x => x.is('Creature') && (x.def.super || []).includes('Legendary'));
        if (!pool.length) return;
        const best = pool.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        await ctx.g.move(best, 'battlefield', { ctrl: ctx.you });
        ctx.g.lg(`Loyal Retainers vraća ${best.name}!`);
      },
      aiScore: (g, c, p) => p.graveyard.some(x => x.is('Creature') && (x.def.super || []).includes('Legendary') && U.mv(x.def.cost || '') >= 4) ? 7 : 0,
    }],
  };
  SC["M'Baku, Jabari Chieftain"] = {
    triggers: [
      {
        on: 'endStep', desc: 'Daj krunu', filter: (g, self, d) => d.player === self.ctrl && !g.monarch,
        run: async ctx => {
          const o = E.eachOpp(ctx.g, ctx.you).sort((a, b) => a.life - b.life)[0];
          if (o) { ctx.g.monarch = o; ctx.g.lg(`👑 M'Baku daje krunu: ${o.name}.`); }
        },
      },
      {
        on: 'attacks', desc: '+1/+1 napadaču na monarha',
        filter: (g, self, d) => g.monarch && d.defender === g.monarch && E.eachOpp(g, self.ctrl).includes(g.monarch),
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.data.card, 1, 1, ['trample']); },
      },
    ],
  };
  SC['Nakia, Wakandan Operative'] = {
    triggers: [{
      on: 'etb', desc: 'Monarh', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl,
      run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); },
    }],
    abilities: [{
      label: '2× +1/+1', sorcery: true, cost: { tap: true, mana: '{2}' },
      targets: [T.creature({ prompt: '2× +1/+1', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
      aiScore: () => 2,
    }],
  };
  SC['Okoye, Mighty and Adored'] = {
    triggers: [
      { on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); } },
      {
        on: 'beginCombat', desc: '+1/+1', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
    ],
  };
  SC['Palace Jailer'] = {
    triggers: [
      { on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { await ctx.g.becomeMonarch(ctx.you); } },
      {
        on: 'etb', desc: 'Zatvori stvorenje', filter: etbSelf,
        targets: [T.oppCreature({ prompt: 'Zatvori', upTo: true, aiHint: { goal: 'removal' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (t) {
            await ctx.g.exileCard(t);
            ctx.src.meta.prisoner = t.iid;
            ctx.src.meta.jailerMonarch = ctx.you;
            ctx.g.lg(`${t.name} je u zatvoru dok protivnik ne postane monarh.`);
          }
        },
      },
      {
        on: 'monarchChanged', desc: 'Otvori zatvor',
        filter: (g, self, d) => !!self.meta.prisoner && d.player !== self.meta.jailerMonarch,
        run: async ctx => {
          const prisoner = ctx.g.byIid(ctx.src.meta.prisoner);
          delete ctx.src.meta.prisoner;
          if (prisoner && prisoner.zone === 'exile') await ctx.g.move(prisoner, 'battlefield', { ctrl: prisoner.owner });
        },
      },
    ],
  };
  SC['Panther Robot'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.is('Artifact')).length,
  };
  SC['Queen Mother Ramonda'] = {
    triggers: [{ on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); } }],
    protectsController: (g, self, attacker, defender) => g.monarch === defender && attacker.power <= 2,
  };
  SC['Shuri, the Black Panther'] = {
    triggers: [{
      on: 'attacks', desc: 'Artefakt bonusi', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const n = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.is('Artifact')).length;
        if (n >= 3) await ctx.g.draw(ctx.you, 1);
        if (n >= 6) for (const c of ctx.g.creatures(ctx.you)) E.pumpUntilEOT(ctx.g, c, 2, 2);
      },
    }],
  };
  SC['Storm, Queen of Wakanda'] = {
    triggers: [
      {
        on: 'attacks', desc: '+X/+0 i flying', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const other = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src && c.attacking);
          if (other.length) {
            const t = other.sort((a, b) => b.power - a.power)[0];
            E.pumpUntilEOT(ctx.g, t, Math.max(0, ctx.src.power), 0, ['flying']);
          }
        },
      },
      {
        on: 'attackersDeclared', desc: 'Obara letače',
        filter: (g, self, d) => d.player !== self.ctrl && d.attackers.some(a => a.attacking === self.ctrl && a.kw('flying')),
        run: async ctx => {
          const fl = ctx.data.attackers.find(a => a.attacking === ctx.you && a.kw('flying'));
          if (fl) await ctx.g.damageCreature(ctx.src, fl, Math.max(0, ctx.src.power));
        },
      },
    ],
  };
  SC["T'Chaka, Venerable King"] = {
    triggers: [{
      on: 'etb', desc: 'Mill 3 → uzmi', filter: etbSelf,
      run: async ctx => {
        const milled = await ctx.g.mill(ctx.you, 3);
        const pick = milled.filter(c => c.zone === 'graveyard' && (c.is('Artifact') || c.is('Land')));
        if (pick.length) {
          const best = pick.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
          ctx.g.remove(best); best.zone = 'hand'; ctx.you.hand.push(best);
          ctx.g.lg(`T'Chaka: ${best.name} u ruku.`);
        }
      },
    }],
    gyAbility: {
      label: 'Postani monarh {3}', cost: '{3}', sorcery: true,
      cond: (g, c, p) => g.bf().some(x => x.commander && x.ctrl === p),
      run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH (T'Chaka)!`); },
    },
  };
  SC["W'Kabi, Shield of the Nation"] = {
    triggers: [{
      on: 'attacks', desc: 'Rhino',
      filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl &&
        g.bf().some(c => c.ctrl === self.ctrl && c.is('Artifact') && c.mv >= 4),
      run: async ctx => { await ctx.g.makeTokens('rhino44', ctx.you); },
    }],
  };
  SC['Zuri, Warrior of Wakanda'] = {
    triggers: [{
      on: 'cast', desc: '+1/+1 svima', filter: (g, self, d) => d.player === self.ctrl && d.card.is('Artifact') && d.mv >= 4,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
  };
  SC['Fight for the Throne'] = {
    targets: [
      T.yourCreature({ prompt: 'Tvoje (+1/+1 pa fight)', aiHint: { goal: 'buff' } }),
      T.oppCreature({ prompt: 'Fight meta', aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (!a || !b) return;
      ctx.g.addCounters(a, '+1/+1', 1);
      await ctx.g.damageCreature(a, b, a.power);
      await ctx.g.damageCreature(b, a, b.power);
      if (b.zone !== 'battlefield' && ctx.g.bf().some(c => c.commander && c.ctrl === ctx.you)) {
        ctx.g.monarch = ctx.you;
        ctx.g.lg(`👑 ${ctx.you.name} preuzima krunu (Fight for the Throne)!`);
      }
    },
  };
  SC['Generous Gift'] = {
    targets: [T.permanent(null, { prompt: 'Uništi bilo šta', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const owner = t.ctrl;
      await ctx.g.destroy(t);
      await ctx.g.makeTokens('elephant33', owner);
    },
  };
  SC['Valorous Stance'] = {
    modes: {
      pick: 1,
      list: [
        { label: 'Indestructible', targets: [T.creature({ prompt: 'Zaštiti', aiHint: { goal: 'protect' } })] },
        { label: 'Uništi (tou 4+)', targets: [T.creature({ prompt: 'Tou 4+', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.toughness >= 4, aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['indestructible']); }
      else if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
    },
  };
  SC['Ancestral Communion'] = {
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Permanent karta u ruku',
      filter: (g, c) => c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land') || c.is('Planeswalker'),
      aiHint: { goal: 'reanimate' },
    }],
    triggers: [{
      on: 'cast', zone: 'stack', desc: 'Kopija uz komandera',
      filter: (g, self, d) => d.card === self && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      run: async ctx => {
        const spell = ctx.g.stack.find(so => so.kind === 'spell' && so.card === ctx.src);
        if (spell) await ctx.g.copySpell(spell, ctx.you, { mayNewTargets: true });
      },
    }],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (!target || target.zone !== 'graveyard') return;
      ctx.g.remove(target); target.zone = 'hand'; target.owner.hand.push(target);
    },
  };
  SC['Martial Coup'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      const made = await ctx.g.makeTokens('soldierW', ctx.you, { n: x });
      if (x >= 5) {
        // "destroy all OTHER creatures" — sve osim vojnika koje je upravo napravio
        // (ranije je štedio SVE tokene, pa i protivničke).
        const mine = new Set((made || []).map(m => m.iid));
        for (const c of ctx.g.bf().filter(c => c.is('Creature') && !mine.has(c.iid)).slice()) await ctx.g.destroy(c);
        ctx.g.lg('Martial Coup: prevrat! Sva ostala stvorenja uništena.');
      }
    },
  };
  SC['Wakanda Forever!'] = {
    resolve: async ctx => {
      const top = [];
      for (let i = 0; i < 6 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
      const perms = top.filter(c => c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Planeswalker'));
      perms.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''));
      if (perms[0]) {
        const c = perms[0];
        c.zone = 'nowhere';
        await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
        if (c.zone === 'battlefield') ctx.g.addCounters(c, 'indestructible', 1);
      }
      if (perms[1]) { perms[1].zone = 'hand'; ctx.you.hand.push(perms[1]); }
      for (const c of top) {
        if (c === perms[0] || c === perms[1]) continue;
        if (c.zone !== 'battlefield' && c.zone !== 'hand') { c.zone = 'graveyard'; ctx.you.graveyard.push(c); }
      }
      ctx.g.lg('WAKANDA FOREVER! 🐾');
    },
  };
  SC['Conduit of Worlds'] = {
    playLandsFromGraveyard: true,
    abilities: [{
      label: 'Baci iz groblja', sorcery: true, cost: { tap: true },
      cond: (g, c, p) => p.turnState.spellsCast === 0 && p.graveyard.some(x => !x.is('Land')),
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(x => !x.is('Land'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Baci iz groblja:', aiHint: { kind: 'bestGyCast' } });
        const c = pick[0];
        if (!c) return;
        ctx.g.remove(c); c.zone = 'nowhere';
        const ok = await ctx.g.castSpell(ctx.you, c, { from: 'graveyard' });
        if (!ok) { c.zone = 'graveyard'; ctx.you.graveyard.push(c); }
      },
      aiScore: (g, c, p) => p.graveyard.some(x => !x.is('Land') && U.mv(x.def.cost || '') >= 4) && p.turnState.spellsCast === 0 ? 4 : 0,
    }],
  };
  SC['Coveted Jewel'] = {
    triggers: [
      { on: 'etb', desc: 'Vuci 3', filter: etbSelf, run: async ctx => { await ctx.g.draw(ctx.you, 3); } },
      {
        on: 'blockersDeclared', desc: 'Nezaustavljeni napad krade Jewel',
        filter: (g, self, d) => d.player !== self.ctrl && d.attackers.some(attacker =>
          attacker.attacking === self.ctrl && attacker.blockedBy.length === 0 && !attacker.wasBlocked),
        run: async ctx => {
          await ctx.g.draw(ctx.data.player, 3);
          ctx.src.ctrl = ctx.data.player;
          ctx.src.tapped = false;
          ctx.g.recalc();
          ctx.g.lg(`${ctx.data.player.name} preuzima Coveted Jewel.`);
        },
      },
    ],
    mana: { cost: { tap: true }, produce: COLORS.map(c => ({ [c]: 3 })) },
  };
  SC["Black Panther's Claws"] = {
    equip: '{4}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 2; host.cur.kw.add('indestructible'); }
      },
    }],
    triggers: [{
      on: 'etb', desc: 'Auto-attach opreme', opt: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.hasSub('Equipment') && d.card !== self,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you);
        if (cands.length) await ctx.g.attach(ctx.data.card, cands.sort((a, b) => b.power - a.power)[0]);
      },
    }],
  };
  SC['Heart-Shaped Herb'] = {
    replace: [{
      event: 'damage',
      prevent: true,
      run: (g, ev, src) => {
        if (ev.target === src.ctrl && ev.src && ev.src.ctrl !== src.ctrl) return Math.max(0, ev.n - 1);
        return ev.n;
      },
    }],
    abilities: [{
      label: 'Uskrsnuće + kruna', cost: { tap: true, sacSelf: true, mana: '{2}' },
      cond: (g, c, p) => g.creatures(p).length > 0,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you);
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Žrtvuj pa vrati sa 3 countera:', aiHint: { kind: 'sacCost' } });
        const c = pick[0];
        if (c) {
          await ctx.g.sacrifice(ctx.you, c);
          if (c.zone === 'graveyard') {
            c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
            c.zone = 'nowhere';
            await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
            ctx.g.addCounters(c, '+1/+1', 3);
          }
        }
        ctx.g.monarch = ctx.you;
        ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH (Heart-Shaped Herb)!`);
      },
      aiScore: (g, c, p) => g.monarch !== p ? 4 : 0.5,
    }],
  };
  SC['Helm of the Host'] = {
    equip: '{5}',
    triggers: [{
      on: 'beginCombat', desc: 'Kopija hosta', filter: (g, self, d) => d.player === self.ctrl && !!self.attachedTo,
      run: async ctx => {
        const host = ctx.g.byIid(ctx.src.attachedTo);
        if (!host) return;
        const made = await ctx.g.copyPermanentToken(host, ctx.you, { haste: true });
        for (const m of made) {
          if (m.def.super) m.def = Object.assign({}, m.def, { super: m.def.super.filter(s => s !== 'Legendary') });
        }
        ctx.g.lg(`Helm of the Host: kopija ${host.name}!`);
      },
    }],
  };
  SC['Kimoyo Beads'] = {
    triggers: [{
      on: 'endStep', desc: 'Bead izbor', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const used = ctx.src.meta._beads = ctx.src.meta._beads || [];
        const opts = [
          { key: 'av', label: 'AV: vuci kartu' },
          { key: 'comm', label: 'Comm: 2 vojnika' },
          { key: 'prime', label: 'Prime: +3 života, reset' },
        ].filter(o => !used.includes(o.key));
        if (!opts.length) return;
        const k = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: 'Kimoyo Beads:', options: opts, aiHint: { kind: 'mode' } });
        used.push(k);
        if (k === 'av') await ctx.g.draw(ctx.you, 1);
        else if (k === 'comm') await ctx.g.makeTokens('soldierW', ctx.you, { n: 2 });
        else { await ctx.g.gainLife(ctx.you, 3); ctx.src.meta._beads = []; }
      },
    }],
  };
  SC["King Solomon's Frogs"] = {
    triggers: [{
      on: 'etb', desc: 'Egzilaj skupe', filter: etbSelf,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          const cands = ctx.g.bf().filter(c => c.ctrl === o && c.mv >= 3 && !c.is('Land'));
          if (!cands.length) continue;
          const t = cands.sort((a, b) => b.mv - a.mv)[0];
          await ctx.g.exileCard(t);
          await ctx.g.draw(o, 1);
        }
      },
    }],
    abilities: [{
      label: 'Egzilaj: monarh', cost: { tap: true, sacSelf: true, mana: '{3}' },
      run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); },
      aiScore: (g, c, p) => g.monarch !== p ? 3 : 0,
    }],
  };
  SC['Midnight Angel Armor'] = {
    equip: '{3}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 3; host.cur.toughness += 3; host.cur.kw.add('flying'); host.cur.kw.add('vigilance'); }
      },
    }],
    triggers: [{
      on: 'etb', desc: 'Vojnik + attach', filter: etbSelf,
      run: async ctx => {
        const made = await ctx.g.makeTokens('soldierW', ctx.you);
        if (made[0]) await ctx.g.attach(ctx.src, made[0]);
      },
    }],
  };
  SC['Panther Idol'] = {
    triggers: [{
      on: 'draw', desc: 'I ti vučeš', opt: true,
      filter: (g, self, d) => d.player !== self.ctrl && d.nth === 1 && g.canPayMana(self.ctrl, U.parseCost('{1}')),
      run: async ctx => {
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
        if (ok) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['N\'Yami-Class Mother Ship'] = {
    crew: 3,
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Vrh → sto/ruka', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const top = ctx.you.library[ctx.you.library.length - 1];
        if (!top) return;
        ctx.you.library.pop();
        const isPerm = top.is('Creature') || top.is('Artifact') || top.is('Enchantment') || top.is('Land') || top.is('Planeswalker');
        if (isPerm) { top.zone = 'nowhere'; await ctx.g.move(top, 'battlefield', { ctrl: ctx.you }); }
        else { top.zone = 'hand'; ctx.you.hand.push(top); }
      },
    }],
  };
  SC['Panther Habit'] = {
    equip: '{2}',
    replace: [{
      event: 'damage',
      prevent: true,
      run: (g, ev, src) => {
        if (src.attachedTo && ev.target && ev.target.iid === src.attachedTo) {
          const host = g.byIid(src.attachedTo);
          if (host) { g.addCounters(host, '+1/+1', ev.n); g.lg(`Panther Habit: šteta → ${ev.n} countera!`); }
          return 0;
        }
        return ev.n;
      },
    }],
  };
  SC['Royal Talon Fighter Jet'] = {
    xCost: true, crew: 2,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    triggers: [
      { on: 'etb', desc: 'Vojnici', filter: etbSelf, run: async ctx => { const n = ctx.src.counters['+1/+1'] || 0; if (n) await ctx.g.makeTokens('soldierW', ctx.you, { n }); } },
      { on: 'attacks', desc: 'Vojnici', filter: (g, self, d) => d.card === self, run: async ctx => { const n = ctx.src.counters['+1/+1'] || 0; if (n) await ctx.g.makeTokens('soldierW', ctx.you, { n }); } },
    ],
  };
  SC['Orbital Vibranium Bomb'] = {
    abilities: [{
      label: 'BOMBA: uništi sve osim artefakata/landova', sorcery: true, cost: { tap: true, sacSelf: true },
      cond: (g, c, p) => g.turnPlayer === p,
      run: async ctx => {
        for (const c of ctx.g.bf().filter(c => !c.is('Artifact') && !c.is('Land')).slice()) await ctx.g.destroy(c);
        ctx.g.lg('💥 ORBITAL VIBRANIUM BOMB!');
      },
      aiScore: (g, c, p) => {
        const oppPow = g.bf().filter(x => x.is('Creature') && x.ctrl !== p && !x.is('Artifact')).reduce((s, x) => s + x.power, 0);
        const myPow = g.creatures(p).filter(x => !x.is('Artifact')).reduce((s, x) => s + x.power, 0);
        return oppPow > myPow + 8 ? 9 : 0;
      },
    }],
  };
  SC["Shuri's Fabricator"] = {
    triggers: [{ on: 'etb', desc: '2 Vibraniuma', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { n: 2, tapped: true }); } }],
    abilities: [{
      label: 'Artefakt iz groblja', sorcery: true, cost: { tap: true, mana: '{6}' },
      cond: (g, c, p) => p.graveyard.some(x => x.is('Artifact')),
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(x => x.is('Artifact'));
        const best = pool.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        if (best) await ctx.g.move(best, 'battlefield', { ctrl: ctx.you });
      },
      aiScore: () => 2,
    }],
  };
  SC['Skybreaker, Sword of Bashenga'] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 1; host.cur.toughness += 1; }
      },
    }],
    triggers: [{
      on: 'attacks', desc: 'Traži basic', filter: (g, self, d) => d.card.iid === self.attachedTo, opt: true,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['The Spear of Bashenga'] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 2; host.cur.toughness += 2; host.cur.kw.add('vigilance'); }
      },
    }],
    triggers: [
      {
        on: 'etb', desc: 'Monarh?', filter: (g, self, d) => d.card === self && !g.monarch,
        run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH (Koplje)!`); },
      },
      {
        on: 'attacks', desc: 'Uništi tapirano',
        filter: (g, self, d) => d.card.iid === self.attachedTo && d.defender === g.monarch && d.defender instanceof MTG.Player,
        run: async ctx => {
          const victim = ctx.data.defender;
          const cands = ctx.g.bf().filter(c => c.ctrl === victim && c.tapped && !c.is('Land'));
          if (cands.length) await ctx.g.destroy(cands.sort((a, b) => b.power - a.power)[0]);
        },
      },
    ],
  };
  SC['Trading Post'] = {
    abilities: [
      {
        label: 'Odbaci: +4 života', cost: { tap: true, mana: '{1}', discard: 1 },
        run: async ctx => { await ctx.g.gainLife(ctx.you, 4); },
        aiScore: (g, c, p) => p.life < 12 && p.hand.length > 4 ? 3 : 0.2,
      },
      {
        label: 'Plati 1 život: Goat', cost: { tap: true, mana: '{1}', life: 1 },
        run: async ctx => { await ctx.g.makeTokens('goat', ctx.you); },
        aiScore: (g, c, p) => p.life > 10 ? 0.8 : 0,
      },
      {
        label: 'Sac stvorenje: artefakt iz groblja u ruku', cost: { tap: true, mana: '{1}', sacCreature: true },
        targets: [{
          zone: 'graveyard', what: 'card', prompt: 'Artefakt iz groblja',
          filter: (g, card, ctrl) => card.owner === ctrl && card.is('Artifact'), aiHint: { goal: 'reanimate' },
        }],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target || target.zone !== 'graveyard') return;
          ctx.g.remove(target); target.zone = 'hand'; target.owner.hand.push(target);
        },
        aiScore: (g, c, p) => p.graveyard.some(x => x.is('Artifact')) ? 1 : 0,
      },
      {
        label: 'Sac artefakt: vuci', cost: { tap: true, mana: '{1}', sac: (g, x) => x.is('Artifact') },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
        aiScore: () => 0.5,
      },
    ],
  };
  SC['Vibranium Mining Mech'] = {
    crew: 2,
    triggers: [
      { on: 'etb', desc: 'Vibranium', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true }); } },
      { on: 'attacks', desc: 'Vibranium', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true }); } },
    ],
    abilities: [{
      label: '+1/+0', cost: { mana: '{2}' },
      cond: (g, c) => c.is('Creature'),
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); },
      aiScore: () => 0.2,
    }],
  };
  SC['Vibranium Strike Gauntlets'] = {
    kws: ['flash'],
    equip: '{3}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 3; host.cur.kw.add('trample'); }
      },
    }],
    triggers: [
      {
        on: 'etb', desc: 'Attach', filter: etbSelf,
        run: async ctx => {
          const cands = ctx.g.creatures(ctx.you);
          if (cands.length) await ctx.g.attach(ctx.src, cands.sort((a, b) => b.power - a.power)[0]);
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci', filter: (g, self, d) => d.card.iid === self.attachedTo,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['The Great Mound'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [
      {
        label: 'Vibranium', cost: { tap: true, mana: '{3}' },
        run: async ctx => { await ctx.g.makeTokens('vibranium', ctx.you, { tapped: true }); },
        aiScore: () => 1,
      },
      {
        label: 'Vuci', cost: { tap: true, mana: '{6}' },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
        aiScore: () => 1.5,
      },
    ],
  };
  SC['Throne of the High City'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Monarh', cost: { tap: true, sacSelf: true, mana: '{4}' },
      run: async ctx => { ctx.g.monarch = ctx.you; ctx.g.lg(`👑 ${ctx.you.name} postaje MONARH!`); },
      aiScore: (g, c, p) => g.monarch !== p ? 4 : 0,
    }],
  };
  SC['Bountiful Promenade'] = {
    producesColors: ['G', 'W'], mana: { cost: { tap: true }, produce: [{ G: 1 }, { W: 1 }] },
    entersTapped: (g, card) => g.alivePlayers().filter(x => x !== card.ctrl).length < 2,
  };
  // ---------- preostali stapleovi ----------
  SC['Spectator Seating'] = {
    producesColors: ['R', 'W'], mana: { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }] },
    entersTapped: (g, card) => g.alivePlayers().filter(x => x !== card.ctrl).length < 2,
  };
  SC['Rite of Replication'] = {
    kicker: { cost: '{5}' },
    targets: [T.creature({ prompt: 'Kopiraj', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      await ctx.g.copyPermanentToken(t, ctx.you, { n: ctx.kicked ? 5 : 1 });
      if (ctx.kicked) ctx.g.lg('Rite of Replication (kicked): 5 kopija!');
    },
  };
  SC['Birds of Paradise'] = { mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] } };
  SC['Metalwork Colossus'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.ctrl === p && c.is('Artifact') && !c.is('Creature') && !c.is('Land')).reduce((s, c) => s + c.mv, 0),
    gyAbility: {
      label: 'Žrtvuj 2 artefakta: vrati u ruku', cost: '{0}', sacArtifacts: 2, exileSelf: false,
      run: async ctx => {
        if (ctx.src.zone !== 'graveyard') return;
        ctx.g.remove(ctx.src); ctx.src.zone = 'hand'; ctx.src.owner.hand.push(ctx.src);
      },
    },
  };
  SC['Meteor Golem'] = {
    triggers: [{
      on: 'etb', desc: 'Uništi nonland', filter: (g, self, d) => d.card === self,
      targets: [T.permanent((g, c, ctrl) => !c.is('Land') && c.ctrl !== ctrl, { prompt: 'Uništi', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC["Nature's Lore"] = {
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: false, filter: d => d.subtypes.includes('Forest') }); },
  };
  SC['Vibranium Dynamo'] = { mana: { cost: { tap: true }, produce: [{ C: 3 }] } };
  SC['Razorverge Thicket'] = {
    producesColors: ['G', 'W'], mana: { cost: { tap: true }, produce: [{ G: 1 }, { W: 1 }] },
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length > 2,
  };
})();
