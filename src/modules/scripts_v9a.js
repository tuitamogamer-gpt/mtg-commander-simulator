// ===== scripts_v9a.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v9a — PRISMARI ARTISTRY (SOC) + AVENGERS ASSEMBLE (MSC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const prepareSpell = (g, source, def) => {
    if (source.meta.prepared) return null;
    const copy = new MTG.CardInst(Object.assign({ super: [], subtypes: [], kws: [], oracle: '' }, def), source.ctrl);
    copy.isCopySpell = true;
    copy.zone = 'exile';
    copy.meta = {
      preparedBy: source.iid, playableBy: source.ctrl, playableUntil: 9999,
      playableCondition: (g2) => source.zone === 'battlefield' && source.meta.prepared,
    };
    source.ctrl.exile.push(copy);
    source.meta.prepared = true;
    source.meta.preparedCopy = copy.iid;
    g.lg(`${source.name} je prepared: ${copy.name} je spreman u egzilu.`);
    return copy;
  };
  const tok = (name, types, subtypes, p, t, kws, cols, extra) => Object.assign({
    name, cost: null, types, subtypes, super: [], power: String(p), toughness: String(t),
    oracle: '', kws: kws || [], isTokenDef: true, colorsOverride: cols || [],
  }, extra || {});

  // ---------- novi tokeni ----------
  TK.elementalUR = tok('Elemental', ['Creature'], ['Elemental'], 1, 1, [], ['U', 'R']);
  TK.elementalUR44 = tok('Elemental', ['Creature'], ['Elemental'], 4, 4, [], ['U', 'R']);
  TK.elementalUR33F = tok('Elemental', ['Creature'], ['Elemental'], 3, 3, ['flying'], ['U', 'R']);
  TK.myrU21 = tok('Phyrexian Myr', ['Artifact', 'Creature'], ['Phyrexian', 'Myr'], 2, 1, [], ['U']);
  TK.merfolkU = tok('Merfolk', ['Creature'], ['Merfolk'], 1, 1, [], ['U']);
  TK.wall03 = tok('Wall', ['Creature'], ['Wall'], 0, 3, ['defender', 'reach'], []);
  TK.villainB = tok('Villain', ['Creature'], ['Villain'], 2, 1, ['menace'], ['B']);
  TK.robotVillain = tok('Robot Villain', ['Artifact', 'Creature'], ['Robot', 'Villain'], 2, 2, [], []);
  TK.apeVillain = tok('Ape Villain', ['Creature'], ['Ape', 'Villain'], 3, 3, ['haste'], ['R']);
  TK.rhino44 = TK.rhino44 || tok('Rhino', ['Creature'], ['Rhino'], 4, 4, ['trample'], ['G']);
  TK.ox22 = tok('Ox', ['Creature'], ['Ox'], 2, 2, [], ['W']);
  TK.elephant33 = tok('Elephant', ['Creature'], ['Elephant'], 3, 3, [], ['G']);
  TK.construct44F = tok('Construct', ['Artifact', 'Creature'], ['Construct'], 4, 4, ['flying', 'haste'], []);
  TK.vibranium = tok('Vibranium', ['Artifact'], ['Vibranium'], undefined, undefined, ['indestructible'], [], {
    power: undefined, toughness: undefined,
    mana: {
      cost: { tap: true }, produce: [{ C: 1 }],
      restrict: (g, forSpell) => forSpell && forSpell.card && forSpell.card.is('Artifact'),
    },
  });

  // ---------- E9 helperi ----------
  const E9 = MTG.E9 = {};
  E9.castISThisTurn = (p) => p.turnState.spellsCastList.some(x => x.card.is('Instant') || x.card.is('Sorcery'));
  E9.castNoncreatureThisTurn = (p) => p.turnState.spellsCastList.some(x => !x.card.is('Creature'));
  E9.maxISMV = (p) => Math.max(0, ...p.turnState.spellsCastList.filter(x => x.card.is('Instant') || x.card.is('Sorcery')).map(x => x.mv));
  E9.bestSubtype = (g, p) => {
    const counts = {};
    for (const c of g.creatures(p).concat(p.hand.filter(x => x.is('Creature')))) {
      for (const s of (c.cur ? c.cur.subtypes : c.def.subtypes)) counts[s] = (counts[s] || 0) + 1;
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || 'Hero';
  };
  E9.tempCopyAttacking = async (g, src, base, n, defender, you) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      const m = await g.copyPermanentToken(base, you, { tapped: true, attacking: defender, haste: true });
      made.push(...m);
    }
    return made;
  };

  // ============================================================
  // PRISMARI ARTISTRY (SOC) — commander: Rootha, Mastering the Moment
  // ============================================================
  SC['Rootha, Mastering the Moment'] = {
    triggers: [{
      on: 'beginCombat', desc: 'X/X Elemental',
      filter: (g, self, d) => d.player === self.ctrl && E9.castISThisTurn(self.ctrl),
      run: async ctx => {
        const x = E9.maxISMV(ctx.you);
        if (x <= 0) return;
        const def = Object.assign({}, TK.elementalUR, { power: String(x), toughness: String(x), kws: ['flying', 'haste'] });
        await ctx.g.makeTokens(def, ctx.you);
        ctx.g.lg(`Rootha: ${x}/${x} Elemental (flying, haste)!`);
      },
    }],
  };
  SC['Brazen Borrower'] = {
    kws: ['flash', 'flying'],
    adventure: {
      name: 'Petty Theft', cost: '{1}{U}', types: 'Instant',
      targets: [T.permanent((g, c, ctrl) => !c.is('Land') && c.ctrl !== ctrl, { prompt: 'Bounce', aiHint: { goal: 'bounce' } })],
      resolve: async ctx => { if (ctx.targets[0]) await ctx.g.move(ctx.targets[0], 'hand'); },
    },
    statics: [{
      apply: (g, self) => {
        self.cur.cantBeBlockedBy = null; // tačna restrikcija se primjenjuje kroz blockRestriction ispod
      },
    }],
    blockRestriction: (g, blocker, attacker) => !(blocker.name === 'Brazen Borrower' && !attacker.kw('flying')),
  };
  SC['Brudiclad, Telchor Engineer'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.isToken && c.is('Creature')) c.cur.kw.add('haste');
      },
    }],
    triggers: [{
      on: 'beginCombat', desc: 'Myr + uniformisanje', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        await ctx.g.makeTokens('myrU21', ctx.you);
        const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && c.is('Creature'));
        if (toks.length < 2) return;
        const best = toks.slice().sort((a, b) => b.power - a.power)[0];
        if (best.power >= 3) {
          const base = best.isCopyOf || best.def;
          for (const t of toks) {
            if (t === best) continue;
            t.isCopyOf = base;
            t.def = Object.assign({}, base);
          }
          ctx.g.recalc();
          ctx.g.lg(`Brudiclad: svi tokeni postaju ${best.name}!`);
        }
      },
    }],
  };
  SC['Dirgur Focusmage'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && (q.card.is('Instant') || q.card.is('Sorcery'))) ? -1 : 0],
    triggers: [{
      on: 'castIS', desc: 'Prepare Braingeyser',
      filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5 && d.fromHand,
      run: async ctx => {
        prepareSpell(ctx.g, ctx.src, {
          name: 'Braingeyser', cost: '{X}{U}{U}', types: ['Sorcery'],
          oracle: 'Target player draws X cards.',
          targets: [T.player({ prompt: 'Braingeyser: ko vuče?', aiHint: { goal: 'self' } })],
          resolve: async c2 => { if (c2.targets[0]) await c2.g.draw(c2.targets[0], c2.x || 0); },
        });
      },
    }],
  };
  SC['Faerie Mastermind'] = {
    triggers: [{
      on: 'draw', desc: 'Vuci (tuđa 2. karta)',
      filter: (g, self, d) => d.player !== self.ctrl && d.nth === 2,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    abilities: [{
      label: 'Svi vuku', cost: { mana: '{3}{U}' },
      run: async ctx => { for (const q of ctx.g.alivePlayers()) await ctx.g.draw(q, 1); },
      aiScore: () => 1,
    }],
  };
  SC['Galazeth Prismari'] = {
    triggers: [{ on: 'etb', desc: 'Treasure', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } }],
    grantMana: {
      filter: (g, x) => x.is('Artifact') && !x.def.mana,
      produce: [{ ANY: true, n: 1 }],
      restrict: (g, forSpell) => forSpell && forSpell.card && (forSpell.card.is('Instant') || forSpell.card.is('Sorcery')),
    },
  };
  SC['Goldspan Dragon'] = {
    triggers: [{
      on: 'attacks', desc: 'Treasure', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }, {
      // druga polovina okidača: "or becomes the target of a spell".
      // Ranije je nedostajala jer 'targeted' event nije postojao.
      on: 'targeted', desc: 'Treasure (ciljan)', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
    // "Treasures you control have '{T}, Sacrifice this artifact: Add two mana
    // of any one color.'" Ranije prazan static — Treasure je davao samo 1.
    grantMana: {
      filter: (g, x) => x.hasSub('Treasure'),
      cost: { tap: true, sacSelf: true },
      produce: [{ W: 2 }, { U: 2 }, { B: 2 }, { R: 2 }, { G: 2 }],
    },
  };
  SC['Harmonic Prodigy'] = {
    doubleTriggerFilter: (g, self, source) => source !== self && source.ctrl === self.ctrl &&
      source.is('Creature') && (source.hasSub('Shaman') || source.hasSub('Wizard')),
  };
  SC['Inspired Skypainter'] = {
    triggers: [
      {
        on: 'etb', desc: "Prepare Maestro's Gift", filter: etbSelf,
        run: async ctx => {
          prepareSpell(ctx.g, ctx.src, {
            name: "Maestro's Gift", cost: '{3}{U}{R}', types: ['Sorcery'],
            oracle: 'Create a token copy of target creature you control. It gains haste until end of turn.',
            targets: [T.yourCreature({ prompt: 'Kopiraj stvorenje', aiHint: { goal: 'copy' } })],
            resolve: async c2 => { if (c2.targets[0]) await c2.g.copyPermanentToken(c2.targets[0], c2.you, { haste: true }); },
          });
        },
      },
      {
        on: 'combatDamageToPlayer', desc: "Prepare Maestro's Gift", oncePerTurn: true,
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.isToken,
        run: async ctx => {
          prepareSpell(ctx.g, ctx.src, {
            name: "Maestro's Gift", cost: '{3}{U}{R}', types: ['Sorcery'],
            oracle: 'Create a token copy of target creature you control. It gains haste until end of turn.',
            targets: [T.yourCreature({ prompt: 'Kopiraj stvorenje', aiHint: { goal: 'copy' } })],
            resolve: async c2 => { if (c2.targets[0]) await c2.g.copyPermanentToken(c2.targets[0], c2.you, { haste: true }); },
          });
        },
      },
    ],
  };
  SC['Leitmotif Composer'] = {
    triggers: [
      {
        on: 'combatDamageToPlayer', desc: 'Vuci', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'castIS', desc: 'Kopija sebe', filter: (g, self, d) => d.player === self.ctrl && d.mv >= 5,
        run: async ctx => { await ctx.g.copyPermanentToken(ctx.src, ctx.you, {}); },
      },
    ],
    abilities: [{
      label: 'Composeri neblokabilni', cost: { mana: '{2}{U}' },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you).filter(x => x.name === 'Leitmotif Composer')) {
          const iid = c.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
          });
        }
        ctx.g.recalc();
      },
      aiScore: (g, c, p) => g.phase === 'main1' && g.creatures(p).filter(x => x.name === 'Leitmotif Composer').length >= 2 ? 4 : 0.3,
    }],
  };
  SC['Manaform Hellkite'] = {
    triggers: [{
      on: 'cast', desc: 'X/X zmaj-iluzija',
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => {
        const x = ctx.data.mv || 0;
        if (x <= 0) return;
        const def = Object.assign({}, TK.elementalUR, { name: 'Dragon Illusion', subtypes: ['Dragon', 'Illusion'], power: String(x), toughness: String(x), kws: ['flying', 'haste'], colorsOverride: ['R'] });
        const made = await ctx.g.makeTokens(def, ctx.you);
        for (const m of made) m.meta.exileEndCombat = false;
        // egzil na kraju poteza
        E7.sacAtNextEnd(ctx.g, made, ctx.you);
      },
    }],
  };
  SC['Mirrorwing Dragon'] = {
    triggers: [{
      on: 'cast', desc: 'Kopije za ostala stvorenja',
      filter: (g, self, d) => {
        if (!d.card || !(d.card.is('Instant') || d.card.is('Sorcery'))) return false;
        const ts = (d.so && d.so.targets || []).flat().filter(Boolean);
        return ts.length > 0 && ts.every(t => t === self);
      },
      run: async ctx => {
        const caster = ctx.data.player;
        const others = ctx.g.creatures(caster).filter(c => c !== ctx.src);
        for (const c of others) {
          await ctx.g.copySpell(ctx.data.so, caster, { mayNewTargets: true, forceTarget: c });
        }
        ctx.g.lg(`Mirrorwing Dragon: ${others.length} kopija.`);
      },
    }],
  };
  SC['Muddle, the Ever-Changing'] = {
    triggers: [{
      on: 'castIS', desc: 'Postani kopija + myriad', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src && !(c.cur.super || []).includes('Legendary'));
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.power - a.power)[0];
        if (best.power <= ctx.src.power) return;
        const iid = ctx.src.iid, base = best.isCopyOf || best.def;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'muddle',
          apply: (g2, bf) => {
            const c = bf.find(y => y.iid === iid);
            if (!c) return;
            c.cur.basePower = parseInt(base.power || '0', 10) || 0;
            c.cur.baseToughness = parseInt(base.toughness || '0', 10) || 0;
            c.cur.kw.add('myriad');
            for (const k of (base.kws || [])) c.cur.kw.add(k);
          },
        });
        ctx.g.recalc();
        ctx.g.lg(`Muddle postaje ${best.name} (+myriad) do kraja poteza.`);
      },
    }],
  };
  SC['Plargg and Nassari'] = {
    triggers: [{
      on: 'upkeep', desc: 'Svi egziliraju → bacaš do 2', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const g = ctx.g, exiled = [];
        for (const q of g.alivePlayers()) {
          while (q.library.length) {
            const c = q.library.pop();
            c.zone = 'exile'; q.exile.push(c);
            if (!c.is('Land')) { exiled.push(c); break; }
          }
        }
        if (!exiled.length) return;
        // protivnik "sklanja" najbolju
        exiled.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''));
        const denied = exiled.shift();
        g.lg(`Plargg and Nassari: protivnik sklanja ${denied.name}.`);
        let castN = 0;
        for (const c of exiled) {
          if (castN >= 2) break;
          const yes = await ctx.you.controller.decide(g, {
            type: 'chooseOption', prompt: `Baci besplatno: ${c.name}?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'freeCast' },
          });
          if (yes !== 'yes') continue;
          c.owner.exile.splice(c.owner.exile.indexOf(c), 1);
          c.zone = 'nowhere';
          const ok = await g.castSpell(ctx.you, c, { free: true, from: 'exile', asThoughAnyColor: true });
          if (!ok) { c.zone = 'exile'; c.owner.exile.push(c); }
          else castN++;
        }
      },
    }],
  };
  SC['Prismari Pianist'] = {
    triggers: [{
      on: 'castIS', desc: 'Elemental(i)', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('elementalUR', ctx.you, { n: (ctx.data.mv || 0) >= 5 ? 3 : 1 }); },
    }],
  };
  SC['Renegade Bull'] = {
    triggers: [
      {
        on: 'castIS', desc: '+X/+0', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, ctx.data.mv || 0, 0); },
      },
      {
        on: 'attacks', desc: 'Kopiraj I/S iz groblja', filter: (g, self, d) => d.card === self, opt: true,
        run: async ctx => {
          const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
          if (!pool.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Egzilaj i kopiraj:', aiHint: { kind: 'bestGyCast' },
          });
          const c = pick[0];
          if (!c) return;
          ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
          await E.castCopyFromZone(ctx.g, ctx.you, c);
        },
      },
    ],
  };
  SC['Rionya, Fire Dancer'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Kopije', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const isN = ctx.you.turnState.spellsCastList.filter(x => x.card.is('Instant') || x.card.is('Sorcery')).length;
        const x = 1 + isN;
        const cands = ctx.g.creatures(ctx.you).filter(c => c !== ctx.src);
        if (!cands.length) return;
        const best = cands.sort((a, b) => b.power - a.power)[0];
        const made = [];
        for (let i = 0; i < x; i++) made.push(...await ctx.g.copyPermanentToken(best, ctx.you, { haste: true }));
        E7.sacAtNextEnd(ctx.g, made, ctx.you);
        ctx.g.lg(`Rionya: ${x} kopija ${best.name}!`);
      },
    }],
  };
  SC['Rootha, Mercurial Artist'] = {
    abilities: [{
      label: 'Kopiraj svoj I/S spell (vrati Roothu)', cost: { mana: '{2}' },
      cond: (g, c, p) => g.stack.some(so => so.kind === 'spell' && so.ctrl === p && (so.card.is('Instant') || so.card.is('Sorcery'))),
      run: async ctx => {
        const so = ctx.g.stack.slice().reverse().find(s => s.kind === 'spell' && s.ctrl === ctx.you && (s.card.is('Instant') || s.card.is('Sorcery')));
        if (!so) return;
        // vrati Roothu u ruku
        const c = ctx.src;
        if (c.zone === 'battlefield') { ctx.g.remove(c); c.zone = 'hand'; c.owner.hand.push(c); ctx.g.recalc(); }
        await ctx.g.copySpell(so, ctx.you, { mayNewTargets: true });
      },
      aiScore: (g, c, p) => g.stack.some(so => so.kind === 'spell' && so.ctrl === p && U.mv(so.card.def.cost || '') >= 4) ? 6 : 0,
    }],
  };
  SC['Stormcatch Mentor'] = {
    kws: ['haste'],
    costMods: [(g, self, q) => (q.player === self.ctrl && (q.card.is('Instant') || q.card.is('Sorcery'))) ? -1 : 0],
  };
  SC['Magma Opus'] = {
    resolve: async ctx => {
      // 4 štete raspoređene: najbolja meta(e)
      const opps = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you).sort((a, b) => b.power - a.power);
      let left = 4;
      for (const t of opps) {
        if (left <= 0) break;
        const dmg = Math.min(left, Math.max(1, t.toughness - t.damage));
        await ctx.g.damageCreature(ctx.src, t, dmg);
        left -= dmg;
      }
      if (left > 0) {
        const o = E.eachOpp(ctx.g, ctx.you).sort((a, b) => a.life - b.life)[0];
        if (o) await ctx.g.damagePlayer(ctx.src, o, left);
      }
      // tapuj 2
      const tt = ctx.g.bf().filter(c => c.ctrl !== ctx.you && !c.tapped && c.is('Creature')).slice(0, 2);
      for (const t of tt) t.tapped = true;
      await ctx.g.makeTokens('elementalUR44', ctx.you);
      await ctx.g.draw(ctx.you, 2);
    },
    handAbility: {
      label: 'Odbaci: napravi Treasure', cost: '{U/R}{U/R}',
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    },
  };
  SC['Prismari Charm'] = {
    modes: {
      pick: 1,
      list: [
        { label: 'Surveil 2 + karta' },
        { label: '1 šteta (do 2 mete)', targets: [T.any({ prompt: '1 šteta', aiHint: { goal: 'removal', dmg: 1 } })] },
        { label: 'Bounce nonland', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
      ],
    },
    resolve: async ctx => {
      const mi = ctx.mode[0];
      if (mi === 0) { await E.surveil(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 1); }
      else if (mi === 1) { if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); }
      else { if (ctx.targets[0] && ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); }
    },
  };
  SC['Prismari Command'] = {
    modes: {
      pick: 2,
      list: [
        { label: '2 štete', targets: [T.any({ prompt: '2 štete', aiHint: { goal: 'removal', dmg: 2 } })] },
        { label: 'Vuci 2, odbaci 2' },
        { label: 'Treasure' },
        { label: 'Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0) { const t = ctx.targets[ti++]; if (t) await ctx.g.damageAny(ctx.src, t, 2); }
        else if (mi === 1) {
          await ctx.g.draw(ctx.you, 2);
          const n = Math.min(2, ctx.you.hand.length);
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: n, max: n, prompt: 'Odbaci 2', aiHint: { kind: 'addlDiscard' } });
          await ctx.g.discard(ctx.you, pick);
        }
        else if (mi === 2) await ctx.g.makeTokens('treasure', ctx.you);
        else { const t = ctx.targets[ti++]; if (t) await ctx.g.destroy(t); }
      }
    },
  };
  SC['Reality Shift'] = {
    targets: [T.creature({ prompt: 'Egzilaj stvorenje', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0]; if (!t) return;
      const owner = t.ctrl;
      await ctx.g.exileCard(t);
      await ctx.g.manifestTop(owner);
    },
  };
  SC['Resculpt'] = {
    targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Creature'), { prompt: 'Egzilaj', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      const owner = t.ctrl;
      await ctx.g.exileCard(t);
      await ctx.g.makeTokens('elementalUR44', owner);
    },
  };
  SC['Abstract Performance'] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      const pileA = [], pileB = [];
      for (let i = 0; i < 4 && you.library.length; i++) { const c = you.library.pop(); c.zone = 'exile'; you.exile.push(c); pileA.push(c); }
      for (let i = 0; i < 4 && you.library.length; i++) { const c = you.library.pop(); c.zone = 'exile'; you.exile.push(c); pileB.push(c); }
      // protivnik bira jaču hrpu za groblje (heuristika: veći ukupni mv face-up = pileB)
      const val = (pile) => pile.reduce((s, c) => s + U.mv(c.def.cost || ''), 0);
      const toGY = val(pileB) >= val(pileA) ? pileB : pileA;
      const keep = toGY === pileA ? pileB : pileA;
      for (const c of toGY) { you.exile.splice(you.exile.indexOf(c), 1); c.zone = 'graveyard'; you.graveyard.push(c); }
      g.lg(`Abstract Performance: hrpa od ${toGY.length} ide u groblje.`);
      const castable = keep.filter(c => !c.is('Land'));
      if (castable.length) {
        const best = castable.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        const yes = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `Baci besplatno: ${best.name}?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
        });
        if (yes === 'yes') {
          you.exile.splice(you.exile.indexOf(best), 1); best.zone = 'nowhere';
          const ok = await g.castSpell(you, best, { free: true, from: 'exile' });
          if (!ok) { best.zone = 'exile'; you.exile.push(best); }
        }
      }
      for (const c of keep.slice()) {
        if (c.zone === 'exile') { you.exile.splice(you.exile.indexOf(c), 1); c.zone = 'hand'; you.hand.push(c); }
      }
    },
  };
  SC['Aether Gale'] = {
    resolve: async ctx => {
      const cands = ctx.g.bf().filter(c => !c.is('Land') && c.ctrl !== ctx.you)
        .sort((a, b) => (b.is('Creature') ? b.power : 3) - (a.is('Creature') ? a.power : 3)).slice(0, 6);
      for (const c of cands) if (c.zone === 'battlefield') await ctx.g.move(c, 'hand');
      ctx.g.lg(`Aether Gale: ${cands.length} permanenata vraćeno.`);
    },
  };
  SC['Creative Technique'] = {
    demonstrate: true,
    resolve: async ctx => {
      const you = ctx.so.isCopy ? ctx.so.ctrl : ctx.you;
      U.shuffle(you.library, ctx.g.rnd);
      let hit = null;
      const bottom = [];
      while (you.library.length) {
        const c = you.library.pop();
        if (!c.is('Land')) { hit = c; break; }
        bottom.push(c);
      }
      for (const c of bottom) you.library.unshift(c);
      if (hit) {
        hit.zone = 'nowhere';
        const ok = await ctx.g.castSpell(you, hit, { free: true, from: 'exile' });
        if (!ok) { hit.zone = 'exile'; you.exile.push(hit); }
      }
    },
  };
  SC['Dance with Calamity'] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      U.shuffle(you.library, g.rnd);
      const exiled = [];
      let total = 0;
      while (you.library.length && total < 13) {
        const top = you.library[you.library.length - 1];
        const mv = U.mv(top.def.cost || '');
        if (total + mv > 13) break;
        you.library.pop(); top.zone = 'exile'; you.exile.push(top);
        total += mv; exiled.push(top);
        if (exiled.length >= 6) break;
      }
      g.lg(`Dance with Calamity: egzilirano ${exiled.length} (mv ukupno ${total}).`);
      for (const c of exiled.slice()) {
        if (c.is('Land')) continue;
        const yes = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `Baci besplatno: ${c.name}?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
        });
        if (yes !== 'yes') continue;
        you.exile.splice(you.exile.indexOf(c), 1); c.zone = 'nowhere';
        const ok = await g.castSpell(you, c, { free: true, from: 'exile' });
        if (!ok) { c.zone = 'exile'; you.exile.push(c); }
      }
    },
  };
  // Expressive Iteration je već definisan (ispravno: igrač bira šta u ruku, a šta
  // u egzil da igra ovaj potez) u scripts_stella.js. Ovdje je stajala verzija koja
  // je egzilirala samo ako je među kartama bio land — inače bi izgubila pola karte.
  SC['Furygale Flocking'] = {
    selfCostAdjust: (g, card, p) => -p.graveyard.filter(c => c.is('Instant') || c.is('Sorcery')).length,
    resolve: async ctx => {
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const made = await ctx.g.makeTokens('elementalUR33F', ctx.you, { n: 2 });
        for (const m of made) { m.meta.tempHaste = true; m.meta.mustAttackPlayer = o; }
      }
      ctx.g.lg('Furygale Flocking: elementali za svakog protivnika!');
    },
  };
  SC['Mana Geyser'] = {
    resolve: async ctx => {
      let n = 0;
      for (const o of E.eachOpp(ctx.g, ctx.you)) n += ctx.g.lands(o).filter(l => l.tapped).length;
      ctx.you.pool['R'] = (ctx.you.pool['R'] || 0) + n;
      ctx.g.lg(`Mana Geyser: +${n} crvene mane!`);
      ctx.g.note('mana', { p: ctx.you });
    },
  };
  SC['Replication Technique'] = {
    demonstrate: true,
    targets: [T.permanent((g, c, ctrl) => c.ctrl === ctrl, { prompt: 'Kopiraj svoj permanent', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const you = ctx.so.isCopy ? ctx.so.ctrl : ctx.you;
      let t = ctx.targets[0];
      if (ctx.so.isCopy || !t || t.ctrl !== you) {
        const mine = ctx.g.bf().filter(c => c.ctrl === you && !c.is('Land'));
        t = mine.sort((a, b) => (b.is('Creature') ? b.power : 2) - (a.is('Creature') ? a.power : 2))[0];
      }
      if (t) await ctx.g.copyPermanentToken(t, you, {});
    },
  };
  // Rousing Refrain je već definisan (ispravno: CILJANI protivnik + persistMana +
  // suspend {1}{R}) u scripts_stella.js. Ovdje je stajala verzija koja je zbrajala
  // ruke SVIH protivnika i davala 3x previše mane.
  SC['Surge to Victory'] = {
    resolve: async ctx => {
      const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
      if (!pool.length) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Egzilaj (kopiraj na combat dmg):', aiHint: { kind: 'bestGyCast' },
      });
      const c = pick[0];
      if (!c) return;
      ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
      const x = U.mv(c.def.cost || '');
      for (const cr of ctx.g.creatures(ctx.you)) E.pumpUntilEOT(ctx.g, cr, x, 0);
      const you = ctx.you;
      ctx.g.delayed.push({
        on: 'combatDamageToPlayer', once: false, expires: 'eot', name: 'Surge to Victory', ctrl: you,
        filter: (g2, d) => d.card.ctrl === you,
        run: async c2 => { await E.castCopyFromZone(c2.g, you, c); },
      });
    },
  };
  SC['Throes of Chaos'] = {
    cascade: true,
    retrace: { altCostStr: '{3}{R}' },
    resolve: async ctx => { ctx.g.lg('Throes of Chaos: cascade.'); },
  };
  SC['Twinflame'] = {
    kicker: { cost: '{2}{R}' },
    targets: [T.yourCreature({ prompt: 'Kopiraj (haste)', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const targets = [ctx.targets[0]].filter(Boolean);
      if (ctx.kicked) {
        const more = ctx.g.creatures(ctx.you).filter(c => c !== ctx.targets[0]);
        if (more.length) targets.push(more.sort((a, b) => b.power - a.power)[0]);
      }
      const made = [];
      for (const t of targets) made.push(...await ctx.g.copyPermanentToken(t, ctx.you, { haste: true }));
      E7.sacAtNextEnd(ctx.g, made, ctx.you);
    },
  };
  SC['Volcanic Salvo'] = {
    selfCostAdjust: (g, card, p) => -g.creatures(p).reduce((s, c) => s + Math.max(0, c.power), 0),
    targets: [
      T.oppCreature({ prompt: '6 šteta #1', upTo: true, aiHint: { goal: 'removal', dmg: 6 } }),
      T.oppCreature({ prompt: '6 šteta #2', upTo: true, aiHint: { goal: 'removal', dmg: 6 } }),
    ],
    resolve: async ctx => {
      for (const t of ctx.targets.filter(Boolean)) if (t.zone === 'battlefield') await ctx.g.damageCreature(ctx.src, t, 6);
    },
  };
  // Volcanic Torrent je već definisan (ispravno, jednostrano) u scripts_stella.js.
  // Ovdje je stajala druga, pogrešna verzija koja je gasila i vlastita stvorenja.
  SC['Talisman of Creativity'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  };
  SC['Determined Iteration'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Populate (haste, sac EOT)', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && c.is('Creature'));
        if (!toks.length) return;
        const best = toks.sort((a, b) => b.power - a.power)[0];
        const made = await ctx.g.copyPermanentToken(best, ctx.you, { haste: true });
        E7.sacAtNextEnd(ctx.g, made, ctx.you);
      },
    }],
  };
  // Prismari lands
  SC['Hall of Oracles'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{1}' }, produce: [{ ANY: true, n: 1 }] },
    ],
    abilities: [{
      label: '+1/+1 counter', sorcery: true, cost: { tap: true },
      cond: (g, c, p) => E9.castISThisTurn(p),
      targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
    }],
  };
  SC['Prismari Campus'] = {
    producesColors: ['U', 'R'], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] },
    abilities: [{
      label: 'Scry 1', cost: { tap: true, mana: '{4}' },
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
      aiScore: () => 0.5,
    }],
  };
  SC['Molten Tributary'] = { producesColors: ['U', 'R'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] } };
  SC['Coastal Peak'] = Object.assign({ producesColors: ['U', 'R'], entersTapped: true, mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] }, cycling: { cost: '{2}' } });
  SC['Mystic Sanctuary'] = {
    producesColors: ['U'],
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card && l.hasSub('Island')).length < 3,
    mana: { cost: { tap: true }, produce: [{ U: 1 }] },
    triggers: [{
      on: 'etb', desc: 'I/S na vrh', filter: (g, self, d) => d.card === self && !self.tapped, opt: true,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Na vrh biblioteke:', aiHint: { kind: 'bestGyCast' },
        });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'library'; ctx.you.library.push(pick[0]); }
      },
    }],
  };
  SC['Restless Spire'] = {
    producesColors: ['U', 'R'], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] },
    abilities: [{
      label: 'Postaje 2/1 stvorenje', cost: { mana: '{U}{R}' },
      run: async ctx => {
        const iid = ctx.src.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'animate',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            c.cur.basePower = 2; c.cur.baseToughness = 1;
            if (g2.turnPlayer === c.ctrl) c.cur.kw.add('first strike');
          },
        });
        ctx.g.recalc();
      },
      aiScore: (g, c, p) => g.phase === 'main1' && g.turnPlayer === p ? 1.5 : 0,
    }],
    triggers: [{
      on: 'attacks', desc: 'Scry 1', filter: (g, self, d) => d.card === self,
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
    }],
  };
  SC['Scorched Geyser'] = { producesColors: ['U', 'R'], mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] }, entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card && (l.def.super || []).includes('Basic')).length < 2 };
  SC['Spectacle Summit'] = {
    producesColors: ['U', 'R'], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] },
    abilities: [{
      label: 'Surveil 1', cost: { tap: true, mana: '{2}{U}{R}' },
      run: async ctx => { await E.surveil(ctx.g, ctx.you, 1); },
      aiScore: () => 0.3,
    }],
  };
  SC['Study Hall'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true, mana: '{1}' }, produce: [{ ANY: true, n: 1 }],
        onProduce: async (g, c, p, chosen, forSpell) => {
          if (forSpell && forSpell.card && forSpell.card.commander) {
            const n = p.commanderCasts || 0;
            if (n > 0) g.queueTrigger({ src: c, name: 'Study Hall — scry', ctrl: p, run: async ctx => { await E.scry(ctx.g, ctx.you, n); } });
          }
        },
      },
    ],
  };
  SC['Turbulent Springs'] = {
    producesColors: ['U', 'R'],
    mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] },
    entersTapped: (g, card) => {
      let n = 0;
      for (const o of g.players) if (o !== card.ctrl) n += g.lands(o).length;
      return n < 8;
    },
  };
  // ============================================================
  // AVENGERS ASSEMBLE (MSC) — commander: Captain America, Team Leader
  // ============================================================
  const isHero = (c) => c.hasSub ? c.hasSub('Hero') : (c.def.subtypes || []).includes('Hero');

  SC['Captain America, Team Leader'] = {
    triggers: [{
      on: 'etb', desc: 'Hero bonus',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && d.card.hasSub('Hero'),
      run: async ctx => {
        const c = ctx.data.card;
        E.grantUntilEOT(ctx.g, c, ['vigilance', 'haste']);
        c.meta.tempHaste = true;
        ctx.g.addCounters(c, '+1/+1', 1);
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Ant-Man, Elusive Avenger'] = {
    statics: [{
      apply: (g, self) => {
        self.cur.cantBeBlockedBy = ((prev) => (g2, blocker) => {
          if (prev && prev(g2, blocker)) return true;
          return blocker.power > self.power;
        })(self.cur.cantBeBlockedBy);
      },
    }],
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Treasures', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: ctx.data.n || 1 }); },
    }],
  };
  SC['Bastion Protector'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) {
          if (c.ctrl === self.ctrl && c.commander && c.is('Creature')) {
            c.cur.power += 2; c.cur.toughness += 2; c.cur.kw.add('indestructible');
          }
        }
      },
    }],
  };
  SC['Black Widow, Agile Avenger'] = {
    triggers: [{
      on: 'draw', desc: 'Counter + karta', filter: (g, self, d) => d.player !== self.ctrl && d.nth === 2,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Captain America, Living Legend'] = {
    triggers: [{
      on: 'becameTapped', desc: 'Prvi tap: untapaj',
      filter: (g, self, d) => g.turnPlayer === self.ctrl && d.player === self.ctrl && d.card.is('Creature') && d.firstThisTurn,
      run: async ctx => {
        if (ctx.data.card.zone === 'battlefield') ctx.data.card.tapped = false;
      },
    }],
  };
  SC['Captain Mar-Vell, Space-Born'] = {
    grantsFlash: (g, self) => g.players.some(player =>
      player !== self.ctrl && !player.lost && player.turnState.spellsCast > 0),
  };
  SC['Captain Marvel, Apex Avenger'] = {
    triggers: [{
      on: 'plusAdded', desc: 'Counteri i Marvel',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && !d.card.hasSub('Kree'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', ctx.data.n || 1); },
    }],
  };
  SC['Director Nick Fury'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && (q.card.def.subtypes || []).includes('Hero')) ? -1 : 0],
    triggers: [{
      on: 'attackersDeclared', desc: 'Traži Heroja', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        const top = [];
        for (let i = 0; i < 4 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
        const hero = top.find(c => c.is('Creature') && c.def.subtypes.includes('Hero'));
        if (hero) { hero.zone = 'hand'; ctx.you.hand.push(hero); ctx.g.lg(`Nick Fury: ${hero.name} u ruku.`); }
        for (const c of top) { if (c !== hero) { c.zone = 'library'; ctx.you.library.unshift(c); } }
      },
    }],
  };
  SC['Falcon and Redwing'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Ptice + counter', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        await ctx.g.makeTokens('birdW', ctx.you, { n: ctx.data.n || 1 });
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Firebird, Blazing Ranger'] = {
    triggers: [{
      on: 'attacks', desc: '+X/+0 ostalima', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.attacking) E.pumpUntilEOT(ctx.g, c, Math.max(0, ctx.src.power), 0);
      },
    }],
  };
  SC['Hawkeye, Avenging Archer'] = {
    triggers: [{
      on: 'dies', desc: 'Vuci', filter: (g, self, d) =>
        d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature') &&
        d.card.meta._damageFrom && d.card.meta._damageFrom.turn === g.turnNo &&
        d.card.meta._damageFrom.ids.has(self.iid),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
    abilities: [{
      label: '1 šteta', cost: { tap: true },
      targets: [T.any({ prompt: '1 šteta', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
    }],
  };
  SC['Hercules, Olympian Hero'] = {
    triggers: [
      {
        on: 'attacks', desc: '+1/+1 + indestructible', filter: (g, self, d) => d.card === self,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      },
      {
        on: 'dealtDamage', desc: 'Counteri od štete', oncePerTurn: true,
        filter: (g, self, d) => d.target === self && d.n > 0,
        run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', ctx.data.n); },
      },
    ],
  };
  SC['Iron Man, Armored Avenger'] = {
    triggers: [
      {
        on: 'draw', desc: '+1/+1 counter', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
      {
        on: 'attacks', desc: 'Letovi modifikovanima', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (c !== ctx.src && c.attacking && (Object.values(c.counters).some(v => v > 0) || c.attachments.length)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
    ],
  };
  SC["Jarvis, Earth's Mightiest Butler"] = {
    triggers: [{
      on: 'cast', desc: 'Hero → vuci',
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && (d.card.def.subtypes || []).includes('Hero'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Jocasta, Automaton Avenger'] = {
    triggers: [
      {
        on: 'combatDamageToPlayer', desc: '+1/+1', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'attackersDeclared', desc: 'Iz groblja u napad', opt: true,
        filter: (g, self, d) => d.player === self.ctrl && self.zone === 'graveyard' && d.attackers.some(a => a.commander),
        run: async ctx => {
          const c = ctx.src;
          if (c.zone !== 'graveyard') return;
          c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
          c.zone = 'nowhere';
          const def = ctx.g.combat && ctx.g.combat.attackers.find(a => a.commander) ? ctx.g.combat.attackers.find(a => a.commander).attacking : null;
          await ctx.g.move(c, 'battlefield', { ctrl: ctx.you, tapped: true });
          if (def && ctx.g.combat) { c.attacking = def; ctx.g.combat.attackers.push(c); }
          ctx.g.lg('Jocasta se vraća iz groblja u napad!');
        },
      },
    ],
  };
  SC['Metallic Mimic'] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); g.lg(`Metallic Mimic: ${card.meta.chosenType}.`); },
    replace: [{
      event: 'etbCounters',
      run: (g, c, src) => c.ctrl === src.ctrl && c !== src && src.meta.chosenType && c.hasSub(src.meta.chosenType),
      n: 1,
    }],
  };
  SC['Patriot, Shield Wielder'] = {
    abilities: [{
      label: '+2/+0 i hexproof', cost: { tap: true, mana: '{2}' },
      targets: [T.yourCreature({ prompt: 'Zaštiti', aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t === ctx.src) return;
        E.pumpUntilEOT(ctx.g, t, 2, 0);
        const iid = t.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'hexproof',
          apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.hexproof = true; },
        });
        ctx.g.recalc();
      },
      aiScore: () => 1,
    }],
  };
  SC['Photon, Mighty Marvel'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Mana', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const n = ctx.data.n || 0;
        ctx.you.pool['R'] = (ctx.you.pool['R'] || 0) + n;
        ctx.g.lg(`Photon: +${n} mane (traje do kraja poteza).`);
      },
    }],
  };
  SC['Professor Hulk'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Vuci = šteta', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.draw(ctx.you, ctx.data.n || 0); },
    }],
  };
  SC['Quicksilver, Speedster'] = {
    kws: ['flash', 'double strike', 'haste'],
    grantsFlash: (g, self) => self.tapped,
  };
  SC['Rescue, Pepper Potts'] = {
    triggers: [{
      on: 'etb', desc: 'Bounce svoj artefakt/stvorenje', filter: etbSelf, opt: true,
      run: async ctx => {
        const pool = ctx.g.bf().filter(c => c.ctrl === ctx.you && c !== ctx.src && (c.is('Artifact') || c.is('Creature')) && c.def.triggers && c.def.triggers.some(t => t.on === 'etb'));
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Vrati u ruku (ETB ponovo):', aiHint: { kind: 'movePick' },
        });
        if (pick[0]) {
          const wasArt = pick[0].is('Artifact');
          await ctx.g.move(pick[0], 'hand');
          if (wasArt) ctx.g.addCounters(ctx.src, '+1/+1', 1);
        }
      },
    }],
  };
  SC['Scarlet Witch, Chaotic Avenger'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Egzil 2 → besplatan spell', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const top = [];
        for (let i = 0; i < 2 && ctx.you.library.length; i++) {
          const c = ctx.you.library.pop(); c.zone = 'exile'; ctx.you.exile.push(c); top.push(c);
        }
        const castable = top.filter(c => !c.is('Land') && ((c.def.subtypes || []).includes('Hero') || !c.is('Creature')));
        if (!castable.length) return;
        const best = castable.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        const yes = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Scarlet Witch: baci besplatno ${best.name}?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast' },
        });
        if (yes !== 'yes') return;
        ctx.you.exile.splice(ctx.you.exile.indexOf(best), 1); best.zone = 'nowhere';
        const ok = await ctx.g.castSpell(ctx.you, best, { free: true, from: 'exile' });
        if (!ok) { best.zone = 'exile'; ctx.you.exile.push(best); }
      },
    }],
  };
  SC['Shang-Chi and the Ten Rings'] = {
    triggers: [
      {
        on: 'draw', desc: '+1/+1', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'plusAdded', desc: 'Deseti prsten',
        filter: (g, self, d) => d.card === self && d.before < 10 && d.after >= 10,
        run: async ctx => {
          if (ctx.src.meta._tenRings) return;
          ctx.src.meta._tenRings = true;
          await ctx.g.draw(ctx.you, 5);
          await ctx.g.gainLife(ctx.you, 5);
          ctx.g.lg('Shang-Chi: DESET PRSTENOVA! +5 karata, +5 života!');
        },
      },
    ],
  };
  SC['She-Hulk, Wallbreaker'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.is('Creature') && c.hasSub('Hero')) c.cur.kw.add('trample');
      },
    }],
    triggers: [{
      // engine emituje 'becomesBlocked' sa {attacker, blockers}; 'blocked' ne postoji
      on: 'becomesBlocked', desc: 'Counteri',
      filter: (g, self, d) => d.attacker && d.attacker.ctrl === self.ctrl && d.attacker.hasSub('Hero'),
      run: async ctx => { ctx.g.addCounters(ctx.data.attacker, '+1/+1', (ctx.data.blockers || []).length || 1); },
    }],
  };
  SC['Speed, Young Avenger'] = {
    triggers: [{
      on: 'cast', desc: 'Neblokabilan haste', opt: true,
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land') && g.canPayMana(self.ctrl, U.parseCost('{1}')),
      run: async ctx => {
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
        if (!ok) return;
        const cands = ctx.g.creatures(ctx.you).filter(c => c.kw('haste'));
        if (!cands.length) return;
        const t = cands.sort((a, b) => b.power - a.power)[0];
        const iid = t.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'unblockable',
          apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
        });
        ctx.g.recalc();
        ctx.g.lg(`${t.name} je neblokabilan (Speed).`);
      },
    }],
  };
  SC['The Wasp, Winsome Avenger'] = {
    triggers: [
      {
        on: 'etb', desc: 'Hero dobija hexproof', filter: etbSelf,
        targets: [T.creature({
          prompt: 'Hero dobija hexproof',
          filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.hasSub('Hero'),
          aiHint: { goal: 'protect' },
        })],
        run: async ctx => { if (ctx.targets[0]) E.grantUntilEOT(ctx.g, ctx.targets[0], ['hexproof']); },
      },
      {
        on: 'attacks', desc: 'Tapuj blokera', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player,
        targets: [{
          what: 'creature', prompt: 'Tapuj stvorenje defending igrača',
          filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') &&
            src.attacking instanceof MTG.Player && c.ctrl === src.attacking,
          aiHint: { goal: 'removal' },
        }],
        run: async ctx => {
          const target = ctx.targets[0];
          if (target) { ctx.g.tap(target); ctx.g.lg(`Wasp tapuje ${target.name}.`); }
        },
      },
    ],
  };
  SC["Thor, Asgard's Avenger"] = {
    replace: [{
      event: 'damage',
      run: (g, ev, src) => {
        const s = ev.src;
        if (!s || s === src) return ev.n;
        const myCtrl = s.ctrl === src.ctrl || (s.owner === src.ctrl);
        const vsOpp = (ev.target instanceof MTG.Player && ev.target !== src.ctrl) || (ev.target && ev.target.ctrl && ev.target.ctrl !== src.ctrl);
        if (myCtrl && vsOpp) return ev.n + 1;
        return ev.n;
      },
    }],
  };
  SC['Vision, Synthezoid Avenger'] = {
    triggers: [{
      on: 'cast', desc: 'Counter ili phase out (spell van poteza)',
      filter: (g, self, d) => d.player !== g.turnPlayer,
      run: async ctx => {
        const mode = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Vision: izaberi mod',
          options: [
            { key: 'counter', label: 'Stavi +1/+1 counter' },
            { key: 'phase', label: 'Vision phases out' },
          ],
          aiHint: { kind: 'visionMode', card: ctx.src },
        });
        if (mode === 'phase') ctx.g.phaseOut(ctx.src, ctx.you);
        else ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['War Machine, Avenging Arsenal'] = {
    triggers: [{
      on: 'attacks', desc: 'Double strike modifikovanima', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) {
          if (c.attacking && (Object.values(c.counters).some(v => v > 0) || c.attachments.length)) E.grantUntilEOT(ctx.g, c, ['double strike']);
        }
      },
    }],
  };
  SC['Winter Soldier, Reborn Avenger'] = {
    triggers: [{
      on: 'attacks', desc: 'Reanimacija', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => c.is('Creature') && c.mv <= ctx.src.power);
        if (!pool.length) return;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 0, max: 1, prompt: 'Reanimiraj:', aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) {
          await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
          if (pick[0].hasSub('Hero')) ctx.g.addCounters(pick[0], '+1/+1', 1);
        }
      },
    }],
  };
  SC['Destroy Evil'] = {
    modes: {
      pick: 1,
      list: [
        { label: 'Uništi stvorenje (tou 4+)', targets: [T.creature({ prompt: 'Tou 4+', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.toughness >= 4, aiHint: { goal: 'removal' } })] },
        { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Enchantment', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Heroic Return'] = {
    selfCostAdjust: (g, card, p) => g.combat && g.combat.attackers.some(a => a.attacking === p) ? -2 : 0,
    resolve: async ctx => {
      const pool = ctx.you.graveyard.filter(c => c.is('Creature'));
      if (!pool.length) return;
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Reanimiraj:', aiHint: { kind: 'reanimate' },
      });
      if (pick[0]) {
        await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
        if (pick[0].hasSub('Hero')) ctx.g.addCounters(pick[0], '+1/+1', 2);
      }
    },
  };
  SC['Heroic Sacrifice'] = {
    targets: [T.yourCreature({ prompt: 'Žrtva-štit', aiHint: { goal: 'protect' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      ctx.g.untilEffects.push({ kind: 'redirectToCreature', who: ctx.you, iid: t.iid, expires: 'eot' });
      const you = ctx.you, iid = t.iid;
      ctx.g.delayed.push({
        on: 'dies', expires: 'eot', name: 'Heroic Sacrifice', ctrl: you,
        filter: (g2, d) => d.card.iid === iid,
        run: async c2 => {
          const snap = c2.data.snap;
          const mine = c2.g.creatures(you);
          if (mine.length && snap.plus1 > 0) ctx.g.addCounters(mine.sort((a, b) => b.power - a.power)[0], '+1/+1', snap.plus1);
          await c2.g.draw(you, 1);
        },
      });
      ctx.g.lg(`Heroic Sacrifice: sva šteta ide na ${t.name}.`);
    },
  };
  SC['Make Your Move'] = {
    targets: [{
      what: 'permanent', prompt: 'Artefakt/ench/4+ power',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Artifact') || c.is('Enchantment') || (c.is('Creature') && c.power >= 4)),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Methods of the Mighty'] = {
    modes: {
      pick: 'any',
      list: [
        { label: 'Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
        { label: 'Uništi tapovano stvorenje', targets: [T.creature({ prompt: 'Tapovano', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.tapped, aiHint: { goal: 'removal' } })] },
        { label: '+1/+1 counter svima' },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0 || mi === 1) { const t = ctx.targets[ti++]; if (t) await ctx.g.destroy(t); }
        else { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); }
      }
    },
  };
  SC['Austere Command'] = {
    modes: {
      pick: 2,
      list: [
        { label: 'Uništi sve artefakte' },
        { label: 'Uništi sve enchantmente' },
        { label: 'Uništi stvorenja mv≤3' },
        { label: 'Uništi stvorenja mv≥4' },
      ],
    },
    resolve: async ctx => {
      for (const mi of ctx.mode || []) {
        const filt = mi === 0 ? (c) => c.is('Artifact') && !c.is('Land')
          : mi === 1 ? (c) => c.is('Enchantment')
          : mi === 2 ? (c) => c.is('Creature') && c.mv <= 3
          : (c) => c.is('Creature') && c.mv >= 4;
        for (const c of ctx.g.bf().filter(filt).slice()) await ctx.g.destroy(c);
      }
    },
  };
  SC['Avenge'] = {
    selfCostAdjust: (g, card, p) => (p.grudges && Object.keys(p.grudges).length) ? -2 : 0,
    resolve: async ctx => {
      let n = 0;
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) { if (await ctx.g.destroy(c)) n++; }
      await ctx.g.gainLife(ctx.you, n);
    },
  };
  SC['Dismantling Wave'] = {
    cycling: {
      cost: '{6}{W}{W}', noDraw: false,
      effect: async ctx => {
        for (const c of ctx.g.bf().filter(c => (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land')).slice()) await ctx.g.destroy(c);
        ctx.g.lg('Dismantling Wave (cycle): svi artefakti i enchantmenti uništeni!');
      },
    },
    resolve: async ctx => {
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const cands = ctx.g.bf().filter(c => c.ctrl === o && (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land'));
        if (!cands.length) continue;
        const best = cands.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
        await ctx.g.destroy(best);
      }
    },
  };
  SC['Rip Apart'] = {
    modes: {
      pick: 1,
      list: [
        { label: '3 štete stvorenju/PW', targets: [{ what: 'permanent', prompt: 'Meta', filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')), aiHint: { goal: 'removal', dmg: 3 } }] },
        { label: 'Uništi artefakt/ench', targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Meta', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 3); }
      else if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
    },
  };
  SC['West Coast Expansion'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      await ctx.g.draw(ctx.you, x);
      if (x >= 5) {
        const heroes = ctx.you.hand.filter(c => c.is('Creature') && c.def.subtypes.includes('Hero'));
        if (heroes.length) {
          const best = heroes.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
          const ok = await ctx.g.castSpell(ctx.you, best, { free: true, from: 'hand' });
          if (ok) ctx.g.lg(`West Coast Expansion: besplatan ${best.name}!`);
        }
      }
    },
  };
  SC['Avengers Quinjet'] = {
    crew: 3,
    triggers: [{
      on: 'etb', desc: 'Hero na sto / iz groblja', filter: etbSelf,
      run: async ctx => { await quinjet(ctx); },
    }, {
      on: 'attacks', desc: 'Hero na sto / iz groblja', filter: (g, self, d) => d.card === self,
      run: async ctx => { await quinjet(ctx); },
    }],
  };
  async function quinjet(ctx) {
    const handHeroes = ctx.you.hand.filter(c => c.is('Creature') && c.def.subtypes.includes('Hero'));
    if (handHeroes.length) {
      const best = handHeroes.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
      if (U.mv(best.def.cost || '') >= 3) {
        await ctx.g.move(best, 'battlefield', { ctrl: ctx.you });
        ctx.g.lg(`Quinjet dovodi: ${best.name}!`);
        return;
      }
    }
    const gyHeroes = ctx.you.graveyard.filter(c => c.is('Creature') && c.def.subtypes.includes('Hero'));
    if (gyHeroes.length) {
      const best = gyHeroes.sort((a, b) => U.mv(b.def.cost || '') - U.mv(a.def.cost || ''))[0];
      ctx.g.remove(best); best.zone = 'hand'; ctx.you.hand.push(best);
      ctx.g.lg(`Quinjet vraća iz groblja: ${best.name}.`);
    }
  }
  SC['Door of Destinies'] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); g.lg(`Door of Destinies: ${card.meta.chosenType}.`); },
    triggers: [{
      on: 'cast', desc: 'Charge',
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && self.meta.chosenType && (d.card.def.subtypes || []).includes(self.meta.chosenType),
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1); },
    }],
    statics: [{
      apply: (g, self, bf) => {
        const n = self.counters['charge'] || 0;
        if (!n || !self.meta.chosenType) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub(self.meta.chosenType)) { c.cur.power += n; c.cur.toughness += n; }
      },
    }],
  };
  SC["Herald's Horn"] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); },
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && self.meta.chosenType && (q.card.def.subtypes || []).includes(self.meta.chosenType)) ? -1 : 0],
    triggers: [{
      on: 'upkeep', desc: 'Vrh → ruka?', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const top = ctx.you.library[ctx.you.library.length - 1];
        if (top && top.is('Creature') && ctx.src.meta.chosenType && (top.def.subtypes || []).includes(ctx.src.meta.chosenType)) {
          ctx.you.library.pop(); top.zone = 'hand'; ctx.you.hand.push(top);
          ctx.g.lg(`Herald's Horn: ${top.name} u ruku.`);
        }
      },
    }],
  };
  SC["Hero's Blade"] = {
    equip: '{4}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.power += 3; host.cur.toughness += 2; }
      },
    }],
    triggers: [{
      on: 'etb', desc: 'Auto-attach', opt: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && (d.card.cur.super || d.card.def.super || []).includes('Legendary'),
      run: async ctx => { await ctx.g.attach(ctx.src, ctx.data.card); ctx.g.lg(`Hero's Blade → ${ctx.data.card.name}.`); },
    }],
  };
  SC['Hulkbuster Armor'] = {
    equip: '{6}',
    statics: [{
      phase: 1,   // layer 7b (CR 613.4b) — vidi Lignify
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) { host.cur.basePower = 9; host.cur.baseToughness = 9; host.cur.kw.add('flying'); }
      },
    }],
  };
  SC['Relic of Legends'] = {
    mana: [
      { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    ],
    grantMana: {
      filter: (g, card) => card.is('Creature') && (card.def.super || []).includes('Legendary'),
      cost: { tap: true },
      produce: [{ ANY: true, n: 1 }],
      ignoreSickness: true,
    },
  };
  SC['Folk Hero'] = {
    triggers: [{
      on: 'cast', desc: 'Vuci (tribal)', oncePerTurn: true,
      filter: (g, self, d) => {
        if (d.player !== self.ctrl || !d.card.is('Creature')) return false;
        const cmd = g.bf().find(c => c.commander && c.ctrl === self.ctrl);
        if (!cmd) return false;
        return (d.card.def.subtypes || []).some(s => cmd.hasSub(s));
      },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Gift of Immortality'] = {
    aura: true,
    auraTarget: [T.creature({ prompt: 'Enchant creature', aiHint: { goal: 'protect' } })],
    triggers: [{
      on: 'dies', desc: 'Vrati stvorenje',
      filter: (g, self, d) => d.card.iid === self.attachedTo,
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone === 'graveyard') {
          c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
          c.zone = 'nowhere';
          await ctx.g.move(c, 'battlefield', { ctrl: c.owner });
          ctx.g.lg(`${c.name} se vraća (Gift of Immortality).`);
          const aura = ctx.src;
          const owner = aura.owner;
          ctx.g.delayed.push({
            on: 'endStep', once: true, name: 'Gift of Immortality se vraća', ctrl: owner,
            filter: () => true,
            run: async c2 => {
              if (aura.zone !== 'graveyard' || c.zone !== 'battlefield') return;
              aura.owner.graveyard.splice(aura.owner.graveyard.indexOf(aura), 1);
              aura.zone = 'nowhere';
              await c2.g.move(aura, 'battlefield', { ctrl: owner });
              await c2.g.attach(aura, c);
            },
          });
        }
      },
    }],
  };
  SC['Kindred Discovery'] = {
    asEnters: async (g, card) => { card.meta.chosenType = E9.bestSubtype(g, card.ctrl); g.lg(`Kindred Discovery: ${card.meta.chosenType}.`); },
    triggers: [
      {
        on: 'etb', desc: 'Vuci',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && self.meta.chosenType && d.card.hasSub(self.meta.chosenType),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
      {
        on: 'attacks', desc: 'Vuci',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && self.meta.chosenType && d.card.hasSub(self.meta.chosenType),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Love on the Battlefield'] = {
    triggers: [{
      on: 'attackersDeclared', desc: 'Par heroja', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length === 2,
      run: async ctx => {
        for (const a of ctx.data.attackers) E.grantUntilEOT(ctx.g, a, ['first strike']);
        await ctx.g.draw(ctx.you, 1);
        const you = ctx.you;
        const iids = ctx.data.attackers.map(a => a.iid);
        ctx.g.delayed.push({
          on: 'combatDamageToPlayer', once: false, expires: 'eot', name: 'Love on the Battlefield', ctrl: you,
          filter: (g2, d) => iids.includes(d.card.iid),
          run: async c2 => { if (c2.data.card.zone === 'battlefield') c2.g.addCounters(c2.data.card, '+1/+1', 1); },
        });
      },
    }],
  };
  SC['Reconnaissance Mission'] = {
    cycling: { cost: '{2}' },
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Vuci', opt: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  // Avengers lands
  SC['Avengers Tower'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
        restrict: (g, forSpell) => forSpell && forSpell.card && (forSpell.card.def.subtypes || []).includes('Hero'),
      },
    ],
    abilities: [{
      label: 'Traži Heroja', cost: { tap: true, mana: '{4}' },
      run: async ctx => {
        const top = [];
        for (let i = 0; i < 3 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
        const hero = top.find(c => (c.def.subtypes || []).includes('Hero'));
        if (hero) { hero.zone = 'hand'; ctx.you.hand.push(hero); ctx.g.lg(`Avengers Tower: ${hero.name}.`); }
        for (const c of top) if (c !== hero) { c.zone = 'library'; ctx.you.library.unshift(c); }
      },
      aiScore: () => 2,
    }],
  };
  SC['Plaza of Heroes'] = {
    producesColors: COLORS,
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
        restrict: (g, forSpell) => forSpell && forSpell.card && (forSpell.card.def.super || []).includes('Legendary'),
      },
      {
        cost: { tap: true },
        produce: (g, card) => {
          const colors = new Set();
          for (const permanent of g.bf()) {
            if (permanent.ctrl !== card.ctrl || !(permanent.cur.super || []).includes('Legendary')) continue;
            for (const color of permanent.colors) colors.add(color);
          }
          return [...colors].map(color => ({ [color]: 1 }));
        },
      },
    ],
    abilities: [{
      label: 'Zaštiti legendu', cost: { tap: true, mana: '{3}', sacSelf: true },
      targets: [T.creature({ prompt: 'Legenda', filter: (g, c) => c.zone === 'battlefield' && (c.cur.super || []).includes('Legendary'), aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        E.grantUntilEOT(ctx.g, t, ['indestructible']);
        const iid = t.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'hexproof',
          apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.hexproof = true; },
        });
        ctx.g.recalc();
      },
      aiScore: () => 0.3,
    }],
  };
  SC['Port Town'] = {
    producesColors: ['W', 'U'],
    mana: { cost: { tap: true }, produce: [{ W: 1 }, { U: 1 }] },
    entersTapped: (g, card) => !card.ctrl.hand.some(c => c.def.subtypes.includes('Plains') || c.def.subtypes.includes('Island')),
  };
  SC['Prairie Stream'] = {
    producesColors: ['W', 'U'],
    mana: { cost: { tap: true }, produce: [{ W: 1 }, { U: 1 }] },
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card && (l.def.super || []).includes('Basic')).length < 2,
  };
  SC['Furycalm Snarl'] = {
    producesColors: ['R', 'W'],
    mana: { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }] },
    entersTapped: (g, card) => !card.ctrl.hand.some(c => c.def.subtypes.includes('Mountain') || c.def.subtypes.includes('Plains')),
  };
  // ============================================================
  // "As this land enters, choose a creature type."
  // Igrač bira tip (AI uzima najčešći iz svoje table i ruke), a mana se
  // stvarno može potrošiti SAMO na stvorenje tog tipa — restrict dobija
  // karticu-izvor pa čita izbor zapamćen na njoj.
  // ============================================================
  const chooseCreatureType = async (g, card) => {
    const p = card.ctrl;
    // kandidati: najčešći tipovi među tvojim stvorenjima (sto + ruka + biblioteka)
    const counts = {};
    const pool = g.creatures(p).concat(p.hand.filter(x => x.is('Creature'))).concat(p.library.filter(x => x.is('Creature')));
    for (const c of pool) for (const s of (c.def.subtypes || [])) counts[s] = (counts[s] || 0) + 1;
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 4);
    if (!top.length) { card.meta.chosenType = E9.bestSubtype(g, p); return; }
    let pick = top[0];
    if (!p.isAI) {
      const k = await p.controller.decide(g, {
        type: 'chooseOption', prompt: `${card.name}: izaberi tip stvorenja`,
        options: top.map(t => ({ key: t, label: `${t} (${counts[t]} u špilu)` })),
        aiHint: { kind: 'chooseType' },
      });
      if (k) pick = k;
    }
    card.meta.chosenType = pick;
    g.lg(`${card.name}: izabran tip — ${pick}.`);
  };
  const typedRestrict = (g, forSpell, src) => {
    if (!forSpell || !forSpell.card) return false;
    const t = src && src.meta && src.meta.chosenType;
    if (!t) return true;                    // tip još nije izabran — ne blokiraj
    // Secluded Courtyard vrijedi i za sposobnosti stvorenja tog tipa;
    // Unclaimed Territory samo za bacanje stvorenja.
    if (forSpell.isAbility) return forSpell.card.is('Creature') && forSpell.card.hasSub(t);
    return forSpell.card.is('Creature') && forSpell.card.hasSub(t);
  };

  SC['Secluded Courtyard'] = {
    producesColors: [],
    asEnters: chooseCreatureType,
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      // restrictAbilities: vrijedi i kad se plaća sposobnost, ne samo spell
      { cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrict: typedRestrict, restrictAbilities: true },
    ],
  };
  SC['Unclaimed Territory'] = {
    producesColors: [],
    asEnters: chooseCreatureType,
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrict: typedRestrict },
    ],
  };
  SC['Scavenger Grounds'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Žrtvuj Desert: egzilaj sva groblja',
      cost: { tap: true, mana: '{2}', sac: (g, permanent) => permanent.hasSub('Desert') },
      run: async ctx => {
        for (const q of ctx.g.players) {
          while (q.graveyard.length) { const c = q.graveyard.pop(); c.zone = 'exile'; q.exile.push(c); }
        }
        ctx.g.lg('Scavenger Grounds: sva groblja egzilirana!');
      },
      aiScore: (g, c, p) => E.eachOpp(g, p).some(o => o.graveyard.length > 10) ? 3 : 0.1,
    }],
  };
})();
