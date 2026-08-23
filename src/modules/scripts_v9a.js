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
  E.prepareSpell = prepareSpell;
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
  E9.tempCopyAttacking = async (g, src, base, n, defender, you, copyOpts = {}) => {
    const made = [];
    for (let i = 0; i < n; i++) {
      const m = await g.copyPermanentToken(base, you,
        Object.assign({ tapped: true, attacking: defender, haste: true }, copyOpts));
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
        const toks = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken);
        if (toks.length < 2) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: toks, min: 0, max: 1,
          prompt: 'Brudiclad: izaberi token čiju kopiju postaju svi ostali tokeni',
          aiHint: { kind: 'brudicladToken', source: ctx.src },
        });
        const chosen = picked[0];
        if (!chosen || !toks.includes(chosen)) return;
        const base = chosen.isCopyOf || chosen.def;
        for (const token of toks) {
          if (token === chosen) continue;
          token.isCopyOf = base;
          token.def = Object.assign({}, base);
        }
        ctx.g.recalc();
        ctx.g.lg(`Brudiclad: svi ostali tokeni postaju ${chosen.name}!`);
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
      label: 'Everyone draws', cost: { mana: '{3}{U}' },
      run: async ctx => { for (const q of ctx.g.alivePlayers()) await ctx.g.draw(q, 1); },
      aiScore: () => 1,
    }],
  };
  SC['Galazeth Prismari'] = {
    triggers: [{ on: 'etb', desc: 'Treasure', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); } }],
    grantMana: {
      filter: (g, x) => x.is('Artifact'),
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
      on: 'targeted', desc: 'Treasure (ciljan)', filter: (g, self, d) => d.card === self && d.isSpell,
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
        on: 'combatDamageGroupToPlayer', desc: "Prepare Maestro's Gift",
        filter: (g, self, d) => d.cards.some(card => card.ctrl === self.ctrl && card.isToken),
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
      label: "Composers can't be blocked", cost: { mana: '{2}{U}' },
      run: async ctx => {
        for (const c of ctx.g.creatures().filter(x => x.name === 'Leitmotif Composer')) {
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
        const x = ctx.data.so && ctx.data.so.manaSpent || 0;
        const def = Object.assign({}, TK.elementalUR, { name: 'Dragon Illusion', subtypes: ['Dragon', 'Illusion'], power: String(x), toughness: String(x), kws: ['flying', 'haste'], colorsOverride: ['R'] });
        const made = await ctx.g.makeTokens(def, ctx.you);
        E7.exileAtNextEnd(ctx.g, made, ctx.you);
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
        const specs = ctx.data.so.targetSpecs || ctx.g.spellTargetSpecs(ctx.data.so.card, ctx.data.so.castOpts || {}, caster) || [];
        const targetSpec = specs.find((spec, index) => {
          const selected = ctx.data.so.targets[index];
          return selected === ctx.src || Array.isArray(selected) && selected.includes(ctx.src);
        });
        const others = ctx.g.creatures(caster).filter(c => c !== ctx.src &&
          (!targetSpec || ctx.g.legalTargets(targetSpec, ctx.data.so.card, caster).includes(c)));
        for (const c of others) {
          await ctx.g.copySpell(ctx.data.so, caster, { mayNewTargets: true, forceTarget: c });
        }
        ctx.g.lg(`Mirrorwing Dragon: ${others.length} kopija.`);
      },
    }],
  };
  SC['Muddle, the Ever-Changing'] = {
    triggers: [{
      on: 'castIS', desc: 'Postani kopija + myriad', filter: (g, self, d) => d.player === self.ctrl,
      targets: (g, self) => [T.yourCreature({
        prompt: 'Muddle: kopiraj do jedno drugo nonlegendary stvorenje', upTo: true,
        filter: (g2, card, ctrl) => card.zone === 'battlefield' && card.is('Creature') &&
          card.ctrl === ctrl && card !== self && !(card.cur.super || []).includes('Legendary'),
        aiHint: { goal: 'copy' },
      })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || target.zone !== 'battlefield') return;
        const base = target.isCopyOf || target.def;
        if (!ctx.src.meta.characteristicOriginalDef) ctx.src.meta.characteristicOriginalDef = ctx.src.def;
        ctx.src.meta.temporaryCopyTurn = ctx.g.turnNo;
        ctx.src.isCopyOf = base;
        ctx.src.def = Object.assign({}, base, { kws: [...new Set([...(base.kws || []), 'myriad'])] });
        ctx.g.recalc();
        ctx.g.lg(`Muddle postaje ${target.name} (+myriad) do kraja poteza.`);
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
        const chooser = await E.chooseOpponent(g, ctx.you, {
          prompt: 'Plargg and Nassari — koji protivnik bira kartu?', goal: 'delegate',
        });
        const deniedPick = chooser ? await chooser.controller.decide(g, {
          type: 'chooseCards', from: exiled, min: 1, max: 1,
          prompt: 'Plargg and Nassari — izaberi kartu koju kaster ne može baciti',
          aiHint: { kind: 'denyCast', caster: ctx.you },
        }) : [];
        const denied = deniedPick[0] || exiled[0];
        const remaining = exiled.filter(card => card !== denied);
        g.lg(`Plargg and Nassari: ${chooser ? chooser.name : 'protivnik'} sklanja ${denied.name}.`);
        const chosen = await ctx.you.controller.decide(g, {
          type: 'chooseCards', from: remaining, min: 0, max: Math.min(2, remaining.length),
          prompt: 'Izaberi do dva spella za besplatno bacanje', aiHint: { kind: 'castFreeUpTo' },
        });
        for (const c of chosen.slice(0, 2)) {
          c.owner.exile.splice(c.owner.exile.indexOf(c), 1);
          c.zone = 'nowhere';
          const ok = await g.castSpell(ctx.you, c, { free: true, from: 'exile', asThoughAnyColor: true });
          if (!ok) { c.zone = 'exile'; c.owner.exile.push(c); }
        }
      },
    }],
  };
  SC['Prismari Pianist'] = {
    triggers: [{
      on: 'castIS', desc: 'Elemental tokens', filter: (g, self, d) => d.player === self.ctrl,
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
        on: 'attacks', desc: 'Copy an instant or sorcery from the graveyard', filter: (g, self, d) => d.card === self, opt: true,
        targets: [{
          zone: 'graveyard', what: 'card', upTo: true,
          prompt: 'Egzilaj do jedan instant/sorcery iz svog groblja',
          filter: (g, card) => card.is('Instant') || card.is('Sorcery'),
          aiHint: { goal: 'bestGyCast' },
        }],
        run: async ctx => {
          const card = ctx.targets[0];
          if (!card || card.zone !== 'graveyard') return;
          await ctx.g.move(card, 'exile');
          const cast = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Renegade Bull: baci kopiju ${card.name} besplatno?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'freeCast', card },
          });
          if (cast === 'yes') await E.castCopyFromZone(ctx.g, ctx.you, card);
        },
      },
    ],
  };
  SC['Rionya, Fire Dancer'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Kopije', filter: (g, self, d) => d.player === self.ctrl,
      targets: (g, self) => [T.yourCreature({
        prompt: 'Rionya: drugo stvorenje za kopiranje',
        filter: (g2, card, ctrl) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === ctrl && card !== self,
        aiHint: { goal: 'copy' },
      })],
      run: async ctx => {
        const isN = ctx.you.turnState.spellsCastList.filter(x => x.card.is('Instant') || x.card.is('Sorcery')).length;
        const x = 1 + isN;
        const target = ctx.targets[0];
        if (!target || target.zone !== 'battlefield') return;
        const made = await ctx.g.copyPermanentToken(target, ctx.you, { n: x, haste: true });
        E7.exileAtNextEnd(ctx.g, made, ctx.you);
        ctx.g.lg(`Rionya: ${x} kopija ${target.name}!`);
      },
    }],
  };
  SC['Rootha, Mercurial Artist'] = {
    abilities: [{
      label: 'Copy your instant or sorcery spell (return Rootha)', cost: { mana: '{2}', returnSelf: true },
      cond: (g, c, p) => g.stack.some(so => so.kind === 'spell' && so.ctrl === p && (so.card.is('Instant') || so.card.is('Sorcery'))),
      targets: [{
        zone: 'stack', what: 'spell', prompt: 'Tvoj instant/sorcery spell',
        filter: (g, so, ctrl) => so.kind === 'spell' && so.ctrl === ctrl && (so.card.is('Instant') || so.card.is('Sorcery')),
        aiHint: { goal: 'copySpell' },
      }],
      run: async ctx => {
        const so = ctx.targets[0];
        if (!so) return;
        if (ctx.g.stack.includes(so)) await ctx.g.copySpell(so, ctx.you, { mayNewTargets: true });
      },
      aiScore: (g, c, p) => g.stack.some(so => so.kind === 'spell' && so.ctrl === p && U.mv(so.card.def.cost || '') >= 4) ? 6 : 0,
    }],
  };
  SC['Stormcatch Mentor'] = {
    kws: ['haste'],
    costMods: [(g, self, q) => (q.player === self.ctrl && (q.card.is('Instant') || q.card.is('Sorcery'))) ? -1 : 0],
  };
  SC['Magma Opus'] = {
    targets: [
      T.any({
        prompt: 'Magma Opus: do četiri mete za podjelu 4 štete', count: 4, min: 0, upTo: true,
        aiHint: { goal: 'magmaOpusDamage', n: 4 },
      }),
      T.permanent(null, {
        prompt: 'Magma Opus: tačno dva permanenta za tapovanje', count: 2,
        aiHint: { goal: 'tap' },
      }),
    ],
    prepareTargets: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
      const division = await E.divideDamage(ctx.g, ctx.you, ctx.src, targets, 4, { aiKind: 'magmaOpusDamage' });
      if (!division) return false;
      ctx.so.damageDivision = division;
      return true;
    },
    resolve: async ctx => {
      const damageTargets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
      for (const target of damageTargets) {
        const assignment = (ctx.so.damageDivision || []).find(entry =>
          target instanceof MTG.Player ? entry.playerIdx === target.idx : entry.iid === target.iid);
        if (!assignment) continue;
        if (target instanceof MTG.Player) await ctx.g.damagePlayer(ctx.src, target, assignment.n);
        else await ctx.g.damageCreature(ctx.src, target, assignment.n, { deferSBA: true });
      }
      await ctx.g.checkSBA();
      const tapTargets = Array.isArray(ctx.targets[1]) ? ctx.targets[1] : [];
      for (const target of tapTargets) if (target.zone === 'battlefield') ctx.g.tap(target);
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
      aiHint: { kind: 'prismariCharm' },
      list: [
        { label: 'Surveil 2 + karta' },
        { label: '1 šteta (jedna ili dvije mete)', targets: [T.any({ prompt: '1 šteta svakoj meti', count: 2, min: 1, upTo: true, aiHint: { goal: 'damage', n: 1 } })] },
        { label: 'Bounce nonland', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
      ],
    },
    resolve: async ctx => {
      const mi = ctx.mode[0];
      if (mi === 0) { await E.surveil(ctx.g, ctx.you, 2); await ctx.g.draw(ctx.you, 1); }
      else if (mi === 1) {
        for (const target of (Array.isArray(ctx.targets[0]) ? ctx.targets[0] : []).filter(Boolean)) {
          if (target instanceof MTG.Player) await ctx.g.damagePlayer(ctx.src, target, 1);
          else await ctx.g.damageCreature(ctx.src, target, 1, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      }
      else { if (ctx.targets[0] && ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); }
    },
  };
  SC['Prismari Command'] = {
    modes: {
      pick: 2,
      aiHint: { kind: 'prismariCommand' },
      list: [
        { label: '2 štete', targets: [T.any({ prompt: '2 štete', aiHint: { goal: 'removal', dmg: 2 } })] },
        { label: 'Ciljani igrač vuče 2, odbacuje 2', targets: [T.player({ prompt: 'Ko vuče i odbacuje?', aiHint: { goal: 'drawSelf' } })] },
        { label: 'Ciljani igrač pravi Treasure', targets: [T.player({ prompt: 'Ko pravi Treasure?', aiHint: { goal: 'drawSelf' } })] },
        { label: 'Uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0) { const t = ctx.targets[ti++]; if (t) await ctx.g.damageAny(ctx.src, t, 2); }
        else if (mi === 1) {
          const player = ctx.targets[ti++];
          if (!player) continue;
          await ctx.g.draw(player, 2);
          const n = Math.min(2, player.hand.length);
          const pick = await player.controller.decide(ctx.g, { type: 'chooseCards', from: player.hand, min: n, max: n, prompt: 'Prismari Command: odbaci 2', aiHint: { kind: 'addlDiscard' } });
          await ctx.g.discard(player, pick);
        }
        else if (mi === 2) { const player = ctx.targets[ti++]; if (player) await ctx.g.makeTokens('treasure', player); }
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
      for (let i = 0; i < 4 && you.library.length; i++) {
        const c = you.library.pop(); c.zone = 'exile'; c.faceDown = true; you.exile.push(c); pileA.push(c);
      }
      for (let i = 0; i < 4 && you.library.length; i++) { const c = you.library.pop(); c.zone = 'exile'; you.exile.push(c); pileB.push(c); }
      const chooser = await E.chooseOpponent(g, you, {
        prompt: 'Abstract Performance — koji protivnik bira hrpu?', goal: 'delegate',
      });
      const faceUpValue = pileB.reduce((sum, card) => sum + U.mv(card.def.cost || '') + (card.is('Land') ? 0 : 1.5), 0);
      const pileKey = chooser ? await chooser.controller.decide(g, {
        type: 'chooseOption', prompt: 'Abstract Performance — koju hrpu stavljaš u groblje?',
        options: [
          { key: 'down', label: `Hrpa licem nadolje (${pileA.length} skrivenih karata)`, hiddenCount: pileA.length, denyValue: pileA.length * 3.1 },
          { key: 'up', label: `Pile face up (${pileB.map(card => card.name).join(', ') || 'empty'})`, cards: pileB.slice(), denyValue: faceUpValue },
        ],
        aiHint: { kind: 'abstractPile', faceDownCount: pileA.length },
      }) : 'up';
      const toGY = pileKey === 'down' ? pileA : pileB;
      const keep = toGY === pileA ? pileB : pileA;
      for (const c of toGY) {
        you.exile.splice(you.exile.indexOf(c), 1); c.faceDown = false; c.zone = 'graveyard'; you.graveyard.push(c);
      }
      for (const c of keep) c.faceDown = false; // kontrolor sada smije pogledati drugu hrpu
      g.lg(`Abstract Performance: ${chooser ? chooser.name : 'protivnik'} šalje hrpu od ${toGY.length} u groblje.`);
      const castable = keep.filter(c => !c.is('Land'));
      if (castable.length) {
        const pick = await you.controller.decide(g, {
          type: 'chooseCards', from: castable, min: 0, max: 1,
          prompt: 'Izaberi do jedan spell za besplatno bacanje', aiHint: { kind: 'bestCard' },
        });
        const chosen = pick[0];
        if (chosen) {
          you.exile.splice(you.exile.indexOf(chosen), 1); chosen.zone = 'nowhere';
          const ok = await g.castSpell(you, chosen, { free: true, from: 'exile' });
          if (!ok) { chosen.zone = 'exile'; you.exile.push(chosen); }
        }
      }
      for (const c of keep.slice()) {
        if (c.zone === 'exile') { you.exile.splice(you.exile.indexOf(c), 1); c.zone = 'hand'; you.hand.push(c); }
      }
    },
  };
  SC['Aether Gale'] = {
    targets: [T.permanent((g, card) => !card.is('Land'), {
      prompt: 'Aether Gale: tačno šest nonland permanenata', count: 6,
      aiHint: { goal: 'bounce' },
    })],
    resolve: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
      for (const card of targets) if (card.zone === 'battlefield') await ctx.g.move(card, 'hand');
      ctx.g.lg(`Aether Gale: ${targets.length} permanenata vraćeno.`);
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
      U.shuffle(bottom, ctx.g.rnd);
      for (const c of bottom) you.library.unshift(c);
      if (hit) {
        hit.zone = 'exile'; you.exile.push(hit);
        await ctx.g.revealToHuman({ cards: [...bottom, hit], ctrl: you, kind: 'reveal' });
        const yes = await you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Creative Technique: baci ${hit.name} besplatno?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'freeCast', card: hit },
        });
        if (yes === 'yes') await ctx.g.castSpell(you, hit, { alt: { free: true }, from: 'exile' });
      }
    },
  };
  SC['Dance with Calamity'] = {
    resolve: async ctx => {
      const g = ctx.g, you = ctx.you;
      U.shuffle(you.library, g.rnd);
      const exiled = [];
      let total = 0;
      while (you.library.length) {
        const more = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `Dance with Calamity: ukupni mana value ${total}. Egzilaj sljedeću kartu?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Stani' }],
          aiHint: { kind: 'danceContinue', total, exiled: exiled.slice() },
        });
        if (more !== 'yes') break;
        const top = you.library.pop();
        const mv = U.mv(top.def.cost || '');
        top.zone = 'exile'; you.exile.push(top);
        total += mv; exiled.push(top);
        await g.revealToHuman({ cards: [top], ctrl: you, kind: 'reveal' });
      }
      g.lg(`Dance with Calamity: egzilirano ${exiled.length} (mv ukupno ${total}).`);
      if (total <= 13) {
        const spells = exiled.filter(card => !card.is('Land'));
        const chosen = spells.length ? await you.controller.decide(g, {
          type: 'chooseCards', from: spells, min: 0, max: spells.length,
          prompt: 'Dance with Calamity: izaberi bilo koji broj spellova za besplatno bacanje',
          aiHint: { kind: 'danceFreeCasts' },
        }) : [];
        for (const card of chosen) {
          if (card.zone === 'exile') await g.castSpell(you, card, { alt: { free: true }, from: 'exile' });
        }
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
      const target = ctx.targets[0];
      if (target && target.ctrl === ctx.you) await ctx.g.copyPermanentToken(target, ctx.you, {});
    },
  };
  // Rousing Refrain je već definisan (ispravno: CILJANI protivnik + persistMana +
  // suspend {1}{R}) u scripts_stella.js. Ovdje je stajala verzija koja je zbrajala
  // ruke SVIH protivnika i davala 3x previše mane.
  SC['Surge to Victory'] = {
    targets: [{
      zone: 'graveyard', what: 'card', prompt: 'Surge to Victory: instant/sorcery iz svog groblja',
      filter: (g, card) => card.is('Instant') || card.is('Sorcery'), aiHint: { goal: 'bestGyCast' },
    }],
    resolve: async ctx => {
      const c = ctx.targets[0];
      if (!c || c.zone !== 'graveyard') return;
      await ctx.g.move(c, 'exile');
      const x = U.mv(c.def.cost || '');
      for (const cr of ctx.g.creatures(ctx.you)) E.pumpUntilEOT(ctx.g, cr, x, 0);
      const you = ctx.you;
      ctx.g.delayed.push({
        on: 'combatDamageToPlayer', once: false, expires: 'eot', name: 'Surge to Victory', ctrl: you,
        filter: (g2, d) => d.card.ctrl === you,
        run: async c2 => {
          if (c.zone !== 'exile') return;
          const cast = await you.controller.decide(c2.g, {
            type: 'chooseOption', prompt: `Surge to Victory: baci kopiju ${c.name} besplatno?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
            aiHint: { kind: 'freeCast', card: c },
          });
          if (cast === 'yes') await E.castCopyFromZone(c2.g, you, c);
        },
      });
    },
  };
  SC['Throes of Chaos'] = {
    cascade: true,
    retrace: { altCostStr: '{3}{R}' },
    resolve: async ctx => { ctx.g.lg('Throes of Chaos: cascade.'); },
  };
  SC['Twinflame'] = {
    strive: '{2}{R}',
    targets: (g, card, castOpts, caster) => [T.yourCreature({
      prompt: 'Twinflame: bilo koji broj tvojih stvorenja', count: g.creatures(caster).length, min: 0, upTo: true,
      aiHint: { goal: 'copy' },
    })],
    resolve: async ctx => {
      // pickTargets sa count=1 (samo jedno stvorenje na stolu) sprema JEDAN
      // objekat, ne niz — normalizuj oba oblika da kopija uvijek nastane.
      const targets = [ctx.targets[0]].flat().filter(t => t && t.zone === 'battlefield');
      const made = [];
      for (const t of targets) made.push(...await ctx.g.copyPermanentToken(t, ctx.you, { haste: true }));
      E7.exileAtNextEnd(ctx.g, made, ctx.you);
    },
  };
  SC['Volcanic Salvo'] = {
    selfCostAdjust: (g, card, p) => -g.creatures(p).reduce((s, c) => s + Math.max(0, c.power), 0),
    targets: [{
      what: 'permanent', count: 2, min: 0, upTo: true, prompt: 'Up to two creatures and/or planeswalkers',
      filter: (g, card) => card.zone === 'battlefield' && (card.is('Creature') || card.is('Planeswalker')),
      aiHint: { goal: 'removal', dmg: 6 },
    }],
    resolve: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
      for (const target of targets) if (target.zone === 'battlefield') await ctx.g.damageCreature(ctx.src, target, 6, { deferSBA: true });
      await ctx.g.checkSBA();
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
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: toks, min: 1, max: 1,
          prompt: 'Populate: izaberi creature token za kopiranje', aiHint: { kind: 'brudicladToken' },
        });
        const chosen = picked[0];
        if (!chosen || !toks.includes(chosen)) return;
        const made = await ctx.g.copyPermanentToken(chosen, ctx.you, { haste: true });
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
      on: 'etb', desc: 'Instant or sorcery on top', filter: (g, self, d) => d.card === self && !self.tapped,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Instant/sorcery na vrh biblioteke',
        filter: (g, card) => card.is('Instant') || card.is('Sorcery'), aiHint: { goal: 'bestGyCast' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard') return;
        const yes = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Mystic Sanctuary: stavi ${card.name} na vrh biblioteke?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'optTrigger', src: ctx.src },
        });
        if (yes === 'yes') await ctx.g.move(card, 'library');
      },
    }],
  };
  SC['Restless Spire'] = {
    producesColors: ['U', 'R'], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ U: 1 }, { R: 1 }] },
    abilities: [{
      label: 'Becomes a 2/1 creature', cost: { mana: '{U}{R}' },
      run: async ctx => {
        const iid = ctx.src.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'animate',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            if (!c.cur.subtypes.includes('Elemental')) c.cur.subtypes.push('Elemental');
            c.cur.colors = ['U', 'R'];
            c.cur.basePower = 2; c.cur.baseToughness = 1;
            c.cur.power = 2 + (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
            c.cur.toughness = 1 + (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
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
            const n = (p.commanderCasts || 0) + (forSpell.card.zone === 'command' ? 1 : 0);
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
  const isModified = (g, card, controller) => Object.values(card.counters || {}).some(value => value > 0) ||
    (card.attachments || []).some(iid => {
      const attachment = g.byIid(iid);
      return attachment && (attachment.hasSub('Equipment') ||
        (attachment.hasSub('Aura') && attachment.ctrl === controller));
    });

  SC['Captain America, Team Leader'] = {
    triggers: [{
      on: 'etb', desc: 'Hero bonus',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && d.card.hasSub('Hero'),
      run: async ctx => {
        const c = ctx.data.card;
        E.grantUntilEOT(ctx.g, c, ['vigilance', 'haste']);
        c.meta.tempHaste = true;
        ctx.g.addCounters(c, '+1/+1', 1, false, ctx.you);
        ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
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
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); await ctx.g.draw(ctx.you, 1); },
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
      on: 'countersPlaced', desc: 'Isti counteri na Captain Marvel', opt: true,
      filter: (g, self, d) => d.by === self.ctrl && d.card !== self && d.card.is('Creature') && !d.card.hasSub('Kree'),
      run: async ctx => { ctx.g.addCounters(ctx.src, ctx.data.kind, ctx.data.n || 1, false, ctx.you); },
    }],
  };
  SC['Director Nick Fury'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && (q.card.def.subtypes || []).includes('Hero')) ? -1 : 0],
    triggers: [{
      on: 'attackersDeclared', desc: 'Traži Heroja', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        const top = [];
        for (let i = 0; i < 4 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
        const heroes = top.filter(isHero);
        const picked = heroes.length ? await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: heroes, min: 0, max: 1,
          prompt: 'Director Nick Fury: reveal a Hero to put into your hand?',
          aiHint: { kind: 'nickFuryHero', source: ctx.src },
        }) : [];
        const hero = picked[0] && heroes.includes(picked[0]) ? picked[0] : null;
        if (hero) { hero.zone = 'hand'; ctx.you.hand.push(hero); ctx.g.lg(`Nick Fury: ${hero.name} u ruku.`); }
        const bottom = top.filter(c => c !== hero);
        U.shuffle(bottom, ctx.g.rnd);
        for (const c of bottom) { c.zone = 'library'; ctx.you.library.unshift(c); }
      },
    }],
  };
  SC['Falcon and Redwing'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Ptice + counter', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        await ctx.g.makeTokens('birdW', ctx.you, { n: ctx.data.n || 1 });
        ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
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
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      },
      {
        on: 'dealtDamage', desc: 'Counteri od štete', oncePerTurn: true,
        filter: (g, self, d) => d.target === self && d.n > 0,
        run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', ctx.data.n, false, ctx.you); },
      },
    ],
  };
  SC['Iron Man, Armored Avenger'] = {
    triggers: [
      {
        on: 'draw', desc: '+1/+1 counter', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1, false, ctx.you); },
      },
      {
        on: 'attacks', desc: 'Letovi modifikovanima', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (c !== ctx.src && c.attacking && isModified(ctx.g, c, ctx.you)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
    ],
  };
  SC["Jarvis, Earth's Mightiest Butler"] = {
    triggers: [{
      on: 'cast', desc: 'Hero → vuci',
      filter: (g, self, d) => d.player === self.ctrl && isHero(d.card),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Jocasta, Automaton Avenger'] = {
    triggers: [
      {
        on: 'combatDamageToPlayer', desc: '+1/+1', filter: (g, self, d) => d.card.commander && d.card.ctrl === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); },
      },
      {
        on: 'attackersDeclared', zone: 'graveyard', desc: 'From the graveyard into combat', opt: true,
        filter: (g, self, d) => d.player === self.ctrl && self.zone === 'graveyard' && d.attackers.some(a => a.commander),
        run: async ctx => {
          const c = ctx.src;
          if (c.zone !== 'graveyard') return;
          const defender = await ctx.g.chooseAttackingDestination(ctx.you, null, c, 'Jocasta');
          await ctx.g.move(c, 'battlefield', { ctrl: ctx.you, tapped: true, attacking: defender });
          ctx.g.lg('Jocasta se vraća iz groblja u napad!');
        },
      },
    ],
  };
  SC['Metallic Mimic'] = {
    asEnters: chooseCreatureType,
    statics: [{
      apply: (g, self) => {
        if (self.meta.chosenType && !self.cur.subtypes.includes(self.meta.chosenType)) self.cur.subtypes.push(self.meta.chosenType);
      },
    }],
    replace: [{
      event: 'etbCounters',
      run: (g, c, src) => c.ctrl === src.ctrl && c !== src && src.meta.chosenType && c.hasSub(src.meta.chosenType),
      n: 1,
    }],
  };
  SC['Patriot, Shield Wielder'] = {
    abilities: [{
      label: '+2/+0 i hexproof', cost: { tap: true, mana: '{2}' },
      targets: [T.yourCreature({
        prompt: 'Zaštiti drugo stvorenje',
        filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && c !== src,
        aiHint: { goal: 'protect' },
      })],
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
        if (!n) return;
        const color = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Photon: choose one color for ${n} mana`,
          options: COLORS.map(key => ({ key, label: key })),
          aiHint: { kind: 'photonMana', n, source: ctx.src },
        });
        const chosen = COLORS.includes(color) ? color : 'W';
        ctx.you.pool[chosen] = (ctx.you.pool[chosen] || 0) + n;
        ctx.you.persistMana = ctx.you.persistMana || {};
        ctx.you.persistMana[chosen] = (ctx.you.persistMana[chosen] || 0) + n;
        ctx.g.lg(`Photon: +${n} {${chosen}} (stays until end of turn).`);
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
      on: 'etb', desc: 'Bounce svoj artefakt/stvorenje', filter: etbSelf,
      targets: [{
        what: 'permanent', upTo: true,
        prompt: 'Return up to one other artifact or creature you control',
        filter: (g, card, ctrl, src) => card.zone === 'battlefield' && card.ctrl === ctrl &&
          card !== src && (card.is('Artifact') || card.is('Creature')),
        aiHint: { goal: 'bounceValue' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target && target !== ctx.src) {
          const wasArt = target.is('Artifact');
          await ctx.g.move(target, 'hand');
          if (wasArt) ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
        }
      },
    }],
  };
  SC['Scarlet Witch, Chaotic Avenger'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Egzil 2 → besplatan spell', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        for (let i = 0; i < 2 && ctx.you.library.length; i++) {
          const card = ctx.you.library.pop();
          card.zone = 'exile';
          card.meta = card.meta || {};
          card.meta.exiledWithScarletWitch = ctx.src.timestamp;
          card.meta.faceDownExile = true;
          ctx.you.exile.push(card);
        }
        const castable = ctx.you.exile.filter(card =>
          card.meta && card.meta.exiledWithScarletWitch === ctx.src.timestamp &&
          !card.is('Land') && (isHero(card) || !card.is('Creature')));
        if (!castable.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: castable, min: 0, max: 1,
          prompt: 'Scarlet Witch: cast up to one exiled Hero or noncreature spell for free',
          aiHint: { kind: 'scarletWitchCast', source: ctx.src },
        });
        const chosen = picked[0] && castable.includes(picked[0]) ? picked[0] : null;
        if (!chosen) return;
        const ok = await ctx.g.castSpell(ctx.you, chosen, { free: true, from: 'exile' });
        if (ok) delete chosen.meta.faceDownExile;
      },
    }],
  };
  SC['Shang-Chi and the Ten Rings'] = {
    triggers: [
      {
        on: 'draw', desc: '+1/+1', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); },
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
      run: async ctx => { ctx.g.addCounters(ctx.data.attacker, '+1/+1', (ctx.data.blockers || []).length || 1, false, ctx.you); },
    }],
  };
  SC['Speed, Young Avenger'] = {
    triggers: [{
      on: 'cast', desc: 'Neblokabilan haste', opt: true,
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land') && g.canPayMana(self.ctrl, U.parseCost('{1}')),
      run: async ctx => {
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}'));
        if (!ok) return;
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Speed — haste blockers only',
          targets: [T.creature({
            prompt: 'Target creature with haste',
            filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && card.kw('haste'),
            aiHint: { goal: 'buff' },
          })],
          run: async speedCtx => {
            const target = speedCtx.targets[0];
            if (!target) return;
            const iid = target.iid;
            speedCtx.g.untilEffects.push({
              expires: 'eot', kind: 'hasteBlockersOnly',
              apply: (g2, bf) => {
                const current = bf.find(card => card.iid === iid);
                if (!current) return;
                const previous = current.cur.cantBeBlockedBy;
                current.cur.cantBeBlockedBy = (game, blocker) =>
                  (previous && previous(game, blocker)) || !blocker.kw('haste');
              },
            });
            speedCtx.g.recalc();
            speedCtx.g.lg(`${target.name} can be blocked only by creatures with haste (Speed).`);
          },
        });
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
        const myCtrl = s.ctrl === src.ctrl;
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
        else ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
      },
    }],
  };
  SC['War Machine, Avenging Arsenal'] = {
    triggers: [{
      on: 'attacks', desc: 'Double strike modifikovanima', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) {
          if (c.attacking && isModified(ctx.g, c, ctx.you)) E.grantUntilEOT(ctx.g, c, ['double strike']);
        }
      },
    }],
  };
  SC['Winter Soldier, Reborn Avenger'] = {
    triggers: [{
      on: 'attacks', desc: 'Reanimacija', filter: (g, self, d) => d.card === self,
      targets: (g, self) => [{
        zone: 'graveyard', what: 'card', prompt: 'Target creature card to return',
        filter: (g2, card) => card.owner === self.ctrl && card.is('Creature') && card.mv <= self.power,
        aiHint: { goal: 'reanimate' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || target.zone !== 'graveyard') return;
        await ctx.g.move(target, 'battlefield', {
          ctrl: ctx.you,
          additionalCounters: target.hasSub('Hero') ? { '+1/+1': 1 } : null,
          additionalCounterBy: ctx.you,
        });
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
    targets: [T.gyCreature({ prompt: 'Target creature card from your graveyard', aiHint: { goal: 'reanimate' } })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (!target || target.zone !== 'graveyard') return;
      await ctx.g.move(target, 'battlefield', {
        ctrl: ctx.you,
        additionalCounters: target.hasSub('Hero') ? { '+1/+1': 2 } : null,
        additionalCounterBy: ctx.you,
      });
    },
  };
  SC['Heroic Sacrifice'] = {
    targets: [T.yourCreature({ prompt: 'Žrtva-štit', aiHint: { goal: 'protect' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (!t) return;
      ctx.g.untilEffects.push({ kind: 'redirectAllDamage', who: ctx.you, iid: t.iid, expires: 'eot' });
      const you = ctx.you, iid = t.iid;
      ctx.g.delayed.push({
        on: 'dies', expires: 'eot', name: 'Heroic Sacrifice', ctrl: you,
        filter: (g2, d) => d.card.iid === iid,
        targets: [T.yourCreature({
          upTo: true, prompt: 'Move the sacrificed creature’s counters to up to one creature',
          aiHint: { goal: 'buff' },
        })],
        run: async c2 => {
          const snap = c2.data.snap;
          const recipient = c2.targets[0];
          if (recipient && recipient.zone === 'battlefield') {
            for (const [kind, amount] of Object.entries(snap.counters || {})) {
              if (amount > 0) c2.g.addCounters(recipient, kind, amount, false, you);
            }
          }
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
        else { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1, false, ctx.you); }
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
    selfCostAdjust: (g, card, p) => p.prevAttackers && p.prevAttackers.size ? -2 : 0,
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
    targets: (g, card, castOpts, caster) => E.eachOpp(g, caster).map(opponent => ({
      what: 'permanent', upTo: true,
      prompt: `Up to one artifact or enchantment controlled by ${opponent.name}`,
      filter: (g2, target) => target.zone === 'battlefield' && target.ctrl === opponent &&
        (target.is('Artifact') || target.is('Enchantment')) && !target.is('Land'),
      aiHint: { goal: 'removal' },
    })),
    resolve: async ctx => {
      for (const target of ctx.targets.flat().filter(Boolean)) await ctx.g.destroy(target);
    },
  };
  SC['Rip Apart'] = {
    modes: {
      pick: 1,
      list: [
        { label: '3 damage to a creature or planeswalker', targets: [{ what: 'permanent', prompt: 'Target', filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')), aiHint: { goal: 'removal', dmg: 3 } }] },
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
        const heroes = ctx.you.hand.filter(isHero);
        if (heroes.length) {
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: heroes, min: 0, max: 1,
            prompt: 'West Coast Expansion: cast up to one Hero spell for free',
            aiHint: { kind: 'westCoastHero', source: ctx.src },
          });
          const chosen = picked[0] && heroes.includes(picked[0]) ? picked[0] : null;
          if (chosen) {
            const ok = await ctx.g.castSpell(ctx.you, chosen, { free: true, from: 'hand' });
            if (ok) ctx.g.lg(`West Coast Expansion: besplatan ${chosen.name}!`);
          }
        }
      }
    },
  };
  const quinjetModes = {
    aiHint: { kind: 'quinjetMode' },
    list: [
      { label: 'Put a Hero creature card from your hand onto the battlefield' },
      {
        label: 'Return target Hero creature card from your graveyard to your hand',
        targets: [{
          zone: 'graveyard', what: 'card', prompt: 'Target Hero creature card in your graveyard',
          filter: (g, card, ctrl) => card.owner === ctrl && card.is('Creature') && isHero(card),
          aiHint: { goal: 'reanimate' },
        }],
      },
    ],
  };
  const quinjetTrigger = on => ({
    on, desc: 'Hero onto the battlefield / from graveyard',
    filter: on === 'etb' ? etbSelf : (g, self, data) => data.card === self,
    modes: quinjetModes,
    run: async ctx => {
      if (ctx.mode === 1) {
        const target = ctx.targets[0];
        if (target && target.zone === 'graveyard') await ctx.g.move(target, 'hand');
        return;
      }
      const heroes = ctx.you.hand.filter(card => card.is('Creature') && isHero(card));
      if (!heroes.length) return;
      const picked = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: heroes, min: 0, max: 1,
        prompt: 'Avengers Quinjet: put up to one Hero creature onto the battlefield',
        aiHint: { kind: 'quinjetHand', source: ctx.src },
      });
      const chosen = picked[0] && heroes.includes(picked[0]) ? picked[0] : null;
      if (chosen) await ctx.g.move(chosen, 'battlefield', { ctrl: ctx.you });
    },
  });
  SC['Avengers Quinjet'] = {
    crew: 3,
    triggers: [quinjetTrigger('etb'), quinjetTrigger('attacks')],
  };
  SC['Door of Destinies'] = {
    asEnters: chooseCreatureType,
    triggers: [{
      on: 'cast', desc: 'Charge',
      filter: (g, self, d) => d.player === self.ctrl && d.card.is('Creature') && self.meta.chosenType && (d.card.def.subtypes || []).includes(self.meta.chosenType),
      run: async ctx => { ctx.g.addCounters(ctx.src, 'charge', 1, false, ctx.you); },
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
    asEnters: chooseCreatureType,
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && self.meta.chosenType && (q.card.def.subtypes || []).includes(self.meta.chosenType)) ? -1 : 0],
    triggers: [{
      on: 'upkeep', desc: 'Vrh → ruka?', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const top = ctx.you.library[ctx.you.library.length - 1];
        if (top && top.is('Creature') && ctx.src.meta.chosenType && (top.def.subtypes || []).includes(ctx.src.meta.chosenType)) {
          const answer = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Herald's Horn: reveal ${top.name} and put it into your hand?`,
            options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'heraldReveal', card: top, source: ctx.src },
          });
          if (answer === 'yes') {
            ctx.you.library.pop(); top.zone = 'hand'; ctx.you.hand.push(top);
            ctx.g.lg(`Herald's Horn: ${top.name} u ruku.`);
          }
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
    equipAlt: { cost: '{3}', filter: target => target.hasSub('Hero') },
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
        if (!d.card.is('Creature')) return false;
        const cmd = g.bf().find(c => c.commander && c.owner === self.owner && c.ctrl === d.player);
        if (!cmd) return false;
        return (d.card.def.subtypes || []).some(s => cmd.hasSub(s));
      },
      controller: (g, self, data) => {
        const commander = g.bf().find(card => card.commander && card.owner === self.owner && card.ctrl === data.player);
        return commander ? commander.ctrl : self.ctrl;
      },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Gift of Immortality'] = {
    aura: true,
    auraTarget: [T.creature({ prompt: 'Enchant creature', aiHint: { goal: 'protect' } })],
    triggers: [{
      on: 'dies', zone: 'graveyard', desc: 'Vrati stvorenje',
      filter: (g, self, d) => d.card.iid === self.meta._lastAttachedTo &&
        d.snap.attachments.includes(self.iid),
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
    asEnters: chooseCreatureType,
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
          on: 'combatDamageToPlayer', once: false, expires: 'combat', name: 'Love on the Battlefield', ctrl: you,
          filter: (g2, d) => iids.includes(d.card.iid),
          run: async c2 => { if (c2.data.card.zone === 'battlefield') c2.g.addCounters(c2.data.card, '+1/+1', 1, false, you); },
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
        const heroes = top.filter(isHero);
        const picked = heroes.length ? await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: heroes, min: 0, max: 1,
          prompt: 'Avengers Tower: reveal up to one Hero card',
          aiHint: { kind: 'avengersTowerHero', source: ctx.src },
        }) : [];
        const hero = picked[0] && heroes.includes(picked[0]) ? picked[0] : null;
        if (hero) { hero.zone = 'hand'; ctx.you.hand.push(hero); ctx.g.lg(`Avengers Tower: ${hero.name}.`); }
        const bottom = top.filter(card => card !== hero);
        U.shuffle(bottom, ctx.g.rnd);
        for (const card of bottom) { card.zone = 'library'; ctx.you.library.unshift(card); }
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
    entersTapped: async (g, card) => {
      const revealable = card.ctrl.hand.filter(candidate => candidate !== card &&
        (candidate.def.subtypes.includes('Plains') || candidate.def.subtypes.includes('Island')));
      if (!revealable.length) return true;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: revealable, min: 0, max: 1,
        prompt: 'Port Town: otkrij Plains ili Island da uđe untapped?',
        aiHint: { kind: 'revealLand', source: card },
      });
      if (!picked[0]) return true;
      g.lg(`${card.ctrl.name} otkriva ${picked[0].name} za Port Town.`);
      return false;
    },
  };
  SC['Prairie Stream'] = {
    producesColors: ['W', 'U'],
    mana: { cost: { tap: true }, produce: [{ W: 1 }, { U: 1 }] },
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card && (l.def.super || []).includes('Basic')).length < 2,
  };
  SC['Furycalm Snarl'] = {
    producesColors: ['R', 'W'],
    mana: { cost: { tap: true }, produce: [{ R: 1 }, { W: 1 }] },
    asEnters: async (g, card) => {
      const revealable = card.ctrl.hand.filter(candidate => candidate !== card &&
        (candidate.hasSub('Mountain') || candidate.hasSub('Plains')));
      if (!revealable.length) return;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: revealable, min: 0, max: 1,
        prompt: 'Furycalm Snarl: reveal a Mountain or Plains to enter untapped?',
        aiHint: { kind: 'revealLand', source: card },
      });
      if (picked[0] && revealable.includes(picked[0])) card.meta.revealedLandIid = picked[0].iid;
    },
    entersTapped: (g, card) => !card.meta.revealedLandIid,
  };
  // ============================================================
  // "As this land enters, choose a creature type."
  // Igrač bira tip (AI uzima najčešći iz svoje table i ruke), a mana se
  // stvarno može potrošiti SAMO na stvorenje tog tipa — restrict dobija
  // karticu-izvor pa čita izbor zapamćen na njoj.
  // ============================================================
  async function chooseCreatureType(g, card) {
    const p = card.ctrl;
    // Ponudi svaki tip stvorenja koji postoji u kontrolorovom decku/zonama,
    // sa najčešćim tipovima na vrhu. Ne svodi ljudski izbor na četiri AI
    // favorita: Kree, Robot i drugi rjeđi tipovi moraju ostati legalni izbori.
    const counts = {};
    const pool = g.creatures(p)
      .concat(p.hand, p.library, p.graveyard, p.exile, p.command)
      .filter((card, index, cards) => card.is('Creature') && cards.indexOf(card) === index);
    for (const c of pool) for (const s of (c.def.subtypes || [])) counts[s] = (counts[s] || 0) + 1;
    const available = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    if (!available.length) { card.meta.chosenType = E9.bestSubtype(g, p); return; }
    let pick = available[0];
    const k = await p.controller.decide(g, {
      type: 'chooseOption', prompt: `${card.name}: izaberi tip stvorenja`,
      options: available.map(t => ({ key: t, label: `${t} (${counts[t]} u špilu)`, count: counts[t] })),
      aiHint: { kind: 'chooseType', counts },
    });
    if (k && available.includes(k)) pick = k;
    card.meta.chosenType = pick;
    g.lg(`${card.name}: izabran tip — ${pick}.`);
  }
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
