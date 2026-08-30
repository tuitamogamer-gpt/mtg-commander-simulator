// ===== scripts_v9b.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v9b — DOOM PREVAILS + THE FANTASTIC FOUR + WAKANDA FOREVER (MSC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7, E9 = MTG.E9;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;
  const isVillain = (c) => c.hasSub ? c.hasSub('Villain') : (c.def.subtypes || []).includes('Villain');

  async function chooseCreatureType(g, you, source, prompt) {
    const cards = [...new Set([
      ...g.bf(),
      ...you.hand, ...you.library, ...you.graveyard, ...you.exile, ...you.command,
    ])].filter(card => card && card.def && (card.def.types || []).includes('Creature'));
    const counts = new Map();
    for (const card of cards) for (const type of card.cur ? card.cur.subtypes : card.def.subtypes || []) {
      // Tipovi sa protivničkog battlefielda moraju biti legalno dostupni
      // (npr. Kindred Dominance), ali AI i dalje preferira sopstveni tribal.
      counts.set(type, (counts.get(type) || 0) + (card.ctrl === you || card.owner === you ? 1 : 0));
    }
    if (!counts.size) counts.set('Villain', 1);
    const options = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([type, n]) => ({ key: type, label: `${type} (${n})`, keepValue: n }));
    const picked = await you.controller.decide(g, {
      type: 'chooseOption', player: you, prompt, options,
      aiHint: { kind: 'creatureType', source },
    });
    return counts.has(picked) ? picked : options[0].key;
  }

  async function chooseCopyAsEnters(g, card, includePlaneswalkers, keepName) {
    const you = card.ctrl;
    const pool = g.bf().filter(candidate => candidate !== card && candidate.ctrl === you &&
      (candidate.is('Creature') || includePlaneswalkers && candidate.is('Planeswalker')));
    if (!pool.length) return null;
    const picked = await you.controller.decide(g, {
      type: 'chooseCards', from: pool, min: 0, max: 1,
      prompt: `${card.name}: choose a permanent to copy (or skip)`,
      aiHint: { kind: 'copyPermanent' },
    });
    const target = picked && picked[0];
    if (!target || !pool.includes(target)) return null;
    const base = target.isCopyOf || target.def;
    card.isCopyOf = base;
    card.def = Object.assign({}, base, keepName ? { name: keepName } : null);
    if (base.asEnters) await base.asEnters(g, card);
    return target;
  }

  // ============================================================
  // DOOM PREVAILS — commander: Doctor Doom, King of Latveria
  // ============================================================
  SC['Doctor Doom, King of Latveria'] = {
    triggers: [
      {
        on: 'discardedLands', desc: 'Drain 2', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 2, 'doom'); },
      },
      {
        on: 'beginCombat', desc: 'Villain connive + menace', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.yourCreature({
          prompt: 'Doom: ciljaj Villaina',
          filter: (g, card, ctrl) => card.zone === 'battlefield' && card.ctrl === ctrl && card.is('Creature') && isVillain(card),
          aiHint: { goal: 'pump' },
        })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
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
      targets: (g, self) => {
        const count = self.meta.paidTimes || 0;
        return count ? [T.any({ count, upTo: true, prompt: `Batroc: do ${count} meta`, aiHint: { goal: 'damage' } })] : [];
      },
      run: async ctx => {
        const x = ctx.src.meta.paidTimes || 0;
        if (!x) return;
        const pow = ctx.src.power;
        // A single chosen target is represented as a scalar; two or more are
        // grouped in the first target slot. Multikicker X=1 must execute the
        // same loop instead of attempting to iterate the Card/Player object.
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
        for (const target of targets) {
          if (target instanceof MTG.Player) await ctx.g.damagePlayer(ctx.src, target, pow);
          else await ctx.g.damageCreature(ctx.src, target, pow);
        }
      },
    }],
  };
  SC['Chameleon, Master of Disguise'] = {
    mayhem: { cost: '{2}{U}', speed: 'sorcery' },
    asEnters: async (g, card) => {
      const target = await chooseCopyAsEnters(g, card, false, 'Chameleon, Master of Disguise');
      if (target) g.lg(`Chameleon kopira ${target.name}.`);
    },
  };
  SC['Awesome Android'] = {
    triggers: [{
      on: 'discarded', desc: 'Igraj odbačeno', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      run: async ctx => {
        const c = ctx.data.card;
        if (c.zone !== 'graveyard') return;
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {}; c.meta.playableBy = ctx.you; c.meta.playableUntil = ctx.g.turnNo;
        ctx.g.lg(`Awesome Android: ${c.name} igraj ovaj potez.`);
      },
    }],
  };
  SC['Helmut Zemo, Mastermind'] = {
    triggers: [{
      on: 'attacks', desc: 'Instant or sorcery from the graveyard', filter: (g, self, d) => d.card === self, opt: true,
      targets: (g, self) => [{
        zone: 'graveyard', what: 'card', prompt: 'Ciljaj instant/sorcery iz svog groblja',
        filter: (g2, card, ctrl) => card.owner === ctrl && (card.is('Instant') || card.is('Sorcery')) && card.mv <= self.power,
        aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const c = ctx.targets[0];
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
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'kang');
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Killmonger, Ruthless Usurper'] = {
    triggers: [
      {
        on: 'attacks', desc: '+1/+0 po artefaktu', filter: (g, self, d) => d.card === self && !!d.defender,
        run: async ctx => {
          const defender = ctx.data.defender instanceof MTG.Player
            ? ctx.data.defender : ctx.data.defender && ctx.data.defender.ctrl;
          const n = defender ? ctx.g.bf().filter(c => c.ctrl === defender && c.is('Artifact')).length : 0;
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
        c.faceDown = true;
        c.meta = c.meta || {};
        c.meta.playableBy = ctx.you; c.meta.playableUntil = 9999; c.meta.anyColor = true;
        c.meta.revealedTo = [ctx.you.idx];
        ctx.g.lg(`Klaw egzilira vrh licem nadolje — ${ctx.you.name} ga smije pogledati i igrati.`);
      },
    }, {
      on: 'cast', desc: 'Indestructible iz egzila',
      filter: (g, self, d) => d.player === self.ctrl && d.so && d.so.from === 'exile',
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
    }, {
      on: 'landPlayed', desc: 'Indestructible iz egzila',
      filter: (g, self, d) => d.player === self.ctrl && d.from === 'exile',
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
    }],
  };
  SC['Lady Loki, Agent of Chaos'] = {
    triggers: [{
      on: 'cast', desc: 'Haos-zamjena', oncePerTurn: true,
      filter: (g, self, d) => d.player === self.ctrl &&
        (d.card.is('Instant') || d.card.is('Sorcery') || d.card.hasSub('Villain')),
      run: async ctx => {
        const you = ctx.you, g = ctx.g;
        const original = ctx.data.card;
        const originalSpell = ctx.data.so;
        const originalMv = ctx.data.mv || 0;
        if (original && original.zone === 'stack' && g.stack.includes(originalSpell)) {
          await g.move(original, 'exile');
          g.lg(`Lady Loki egzilira originalni spell: ${original.name}.`);
        }
        let hit = null;
        while (you.library.length) {
          const c = you.library.pop();
          c.zone = 'exile'; you.exile.push(c);
          if (!c.is('Land')) { hit = c; break; }
        }
        if (!hit) return;
        const diff = Math.abs(originalMv - hit.mv);
        if (diff > 0) await g.damageOpponents(ctx.src, you, diff);
        const yes = await you.controller.decide(g, {
          type: 'chooseOption', prompt: `Lady Loki: baci besplatno ${hit.name}?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast', card: hit },
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
        const made = await E9.tempCopyAttacking(ctx.g, ctx.src, ctx.src, n, ctx.src.attacking, ctx.you,
          { nonlegendary: true });
        const iids = made.map(card => card.iid);
        ctx.g.delayed.push({
          on: 'endStep', name: 'Living Laser egzil kopija', ctrl: ctx.you,
          run: async c2 => {
            for (const iid of iids) {
              const token = c2.g.byIid(iid);
              if (token && token.zone === 'battlefield') await c2.g.move(token, 'exile', { noCmdReplace: true });
            }
          },
        });
      },
    }],
  };
  SC['Loki, the Deceiver'] = {
    triggers: [
      {
        on: 'attacks', desc: 'Kopija Villaina', filter: (g, self, d) => d.card === self,
        targets: [T.yourCreature({
          prompt: 'Ciljaj drugog Villaina za kopiju',
          filter: (g, card, ctrl, source) => card.zone === 'battlefield' && card.ctrl === ctrl &&
            card !== source && card.is('Creature') && isVillain(card),
          aiHint: { goal: 'copy' },
        })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target || !ctx.src.attacking) return;
          const made = await ctx.g.copyPermanentToken(target, ctx.you, {
            tapped: true, attacking: ctx.src.attacking, nonlegendary: true, addSubtypes: ['Illusion'],
          });
          E7.sacAtNextEnd(ctx.g, made, ctx.you);
        },
      },
      {
        on: 'combatDamageGroupToPlayer', desc: 'Vuci',
        filter: (g, self, d) => d.cards.some(card => card.ctrl === self.ctrl && isVillain(card)),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Madame Hydra'] = {
    triggers: [{
      on: 'cast', desc: 'Villain token',
      filter: (g, self, d) => d.player === self.ctrl && d.card.hasSub('Villain'),
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
        if (c.zone !== 'graveyard') return;
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        c.meta = c.meta || {};
        c.meta.playableBy = ctx.you;
        c.meta.playableUntilOwnTurn = ctx.you.turnsStarted + 1;
        delete c.meta.playableUntil;
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
        targets: [T.oppCreature({ prompt: 'Goaduj stvorenje; ne može blokirati ovaj potez', aiHint: { goal: 'goadTarget' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          E.goad(ctx.g, t, ctx.you);
          const iid = t.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'cantBlockCard',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.cantBlock = true; },
          });
          ctx.g.recalc();
        },
      },
      {
        on: 'combatDamageGroupToPlayer', desc: 'Treasure (goadovani)',
        filter: (g, self, d) => {
          const gg = d.cards.some(card => g.isGoaded(card));
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
    asEnters: async (g, card) => {
      const target = await chooseCopyAsEnters(g, card, true, null);
      if (!target) return;
      card.def = Object.assign({}, card.def, { super: (card.def.super || []).filter(type => type !== 'Legendary') });
      if ((card.def.types || []).includes('Creature')) g.addCounters(card, '+1/+1', 1);
      if ((card.def.types || []).includes('Planeswalker')) {
        card.meta.additionalLoyaltyCounters = 1;
      }
      g.recalc();
      g.lg(`Loki's Double kopira ${target.name}.`);
    },
  };
  SC['Stilt-Man, Towering Terror'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Ukradi permanent',
      filter: (g, self, d) => d.cards.some(card => card.ctrl === self.ctrl && isVillain(card)),
      targets: (g, self, data) => [T.permanent((g2, card) => card.ctrl === data.player &&
        !card.is('Creature') && !card.is('Land'), {
        prompt: `Ciljaj noncreature, nonland permanent od ${data.player.name}`,
        aiHint: { goal: 'steal' },
      })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const orig = t.ctrl;
        t.ctrl = ctx.you; ctx.g.recalc();
        ctx.g.lg(`Stilt-Man krade ${t.name} do tvog sljedećeg poteza!`);
        const iid = t.iid, you = ctx.you;
        const stolenTurn = ctx.g.turnNo;
        const sacrificeLock = {
          kind: 'cantSacrificeCard', iid,
          apply: (g2, bf) => { const x = bf.find(card => card.iid === iid); if (x) x.cur.cantSacrifice = true; },
        };
        ctx.g.untilEffects.push(sacrificeLock);
        ctx.g.recalc();
        ctx.g.delayed.push({
          on: 'endStep', name: 'Stilt-Man vraća', ctrl: you,
          filter: (g2, d2) => d2.player === you && g2.turnNo > stolenTurn,
          run: async c2 => {
            c2.g.untilEffects = c2.g.untilEffects.filter(effect => effect !== sacrificeLock);
            const x = c2.g.byIid(iid);
            if (x && x.zone === 'battlefield') x.ctrl = orig;
            c2.g.recalc();
          },
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
        ctx.g.lg(`Superior Foes: play ${c.name} until you exile another card.`);
      },
    }],
  };
  SC['The Frightful Four'] = {
    triggers: [{
      on: 'cast', desc: 'Kazna',
      filter: (g, self, d) => d.player !== self.ctrl && !d.card.is('Creature') &&
        !d.card.is('Land') && d.nthNonCreature === 1,
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
    asEnters: async (g, card) => {
      card.meta.chosenType = await chooseCreatureType(g, card.ctrl, card, `Lady Loki's Manifestation: izaberi creature type`);
    },
    statics: [{ apply: (g, self) => {
      const type = self.meta.chosenType;
      if (type && !self.cur.subtypes.includes(type)) self.cur.subtypes.push(type);
    } }],
    triggers: [
      { on: 'etb', desc: 'Vuci po zajedničkom tipu', filter: etbSelf, opt: true, run: async ctx => { await manifDraw(ctx); } },
      { on: 'attacks', desc: 'Vuci po zajedničkom tipu', filter: (g, self, d) => d.card === self, opt: true, run: async ctx => { await manifDraw(ctx); } },
    ],
  };
  async function manifDraw(ctx) {
    const sharedTypes = ctx.src.cur ? ctx.src.cur.subtypes : ctx.src.def.subtypes;
    const n = ctx.g.creatures(ctx.you).filter(card => card !== ctx.src &&
      sharedTypes.some(type => card.hasSub(type))).length;
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
        const defs = new Set(ctx.g.combat ? ctx.g.combat.attackers.filter(a => a.ctrl === ctx.you)
          .map(a => a.attacking instanceof MTG.Player ? a.attacking : a.attacking && a.attacking.ctrl)
          .filter(x => x instanceof MTG.Player) : []);
        if (defs.size) E.pumpUntilEOT(ctx.g, c, defs.size, defs.size);
      },
    }],
  };
  SC['Tombstone, Career Criminal'] = {
    costMods: [(g, self, q) => (q.player === self.ctrl && q.card.is('Creature') && (q.card.def.subtypes || []).includes('Villain')) ? -1 : 0],
    triggers: [{
      on: 'etb', desc: 'Villain iz groblja', filter: etbSelf,
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target a Villain card in your graveyard',
        filter: (g, card, ctrl) => card.owner === ctrl && isVillain(card),
        aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target && target.zone === 'graveyard') await ctx.g.move(target, 'hand');
      },
    }],
  };
  SC['Tri-Sentinel, Act of Vengeance'] = {
    triggers: [{
      on: 'etb', desc: '3 štete po protivniku', filter: etbSelf,
      targets: (g, self) => E.eachOpp(g, self.ctrl).map(opponent => T.creature({
        upTo: true, prompt: `Tri-Sentinel: stvorenje od ${opponent.name}`,
        filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === opponent,
        aiHint: { goal: 'damage' },
      })),
      run: async ctx => {
        for (const target of ctx.targets.filter(Boolean)) await ctx.g.damageCreature(ctx.src, target, 3);
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
        c.meta.unearth = true;
        const iid = c.iid;
        ctx.g.delayed.push({
          on: 'endStep', name: 'Unearth egzil', ctrl: ctx.you,
          run: async c2 => {
            const permanent = c2.g.byIid(iid);
            if (permanent && permanent.zone === 'battlefield') await c2.g.move(permanent, 'exile', { noCmdReplace: true });
          },
        });
        ctx.g.recalc();
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
            aiHint: { kind: 'typhoidMary', src: ctx.src },
          });
        } else k = ['t', 'd', 'b'][Math.floor(ctx.g.rnd() * 3)];
        if (k === 't') await ctx.g.makeTokens('treasure', ctx.you);
        else if (k === 'd') await ctx.g.draw(ctx.you, 1);
        else {
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 2, 'mary');
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
      filter: (g, self, d) => d.card.commander && d.card.owner === self.owner,
      run: async ctx => {
        if (ctx.src.zone !== 'graveyard') return;
        const ok = await ctx.g.payMana(ctx.you, U.parseCost('{1}{B}'));
        if (!ok) return;
        ctx.g.remove(ctx.src); ctx.src.zone = 'hand'; ctx.you.hand.push(ctx.src);
        ctx.g.lg('Endless Ranks of HYDRA se vraća u ruku.');
      },
    }, {
      on: 'attacks', zone: 'graveyard', opt: true, desc: 'HYDRA povratak',
      filter: (g, self, d) => d.card.commander && d.card.owner === self.owner,
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
        c.faceDown = true;
        c.meta = c.meta || {};
        c.meta.playableBy = ctx.you; c.meta.playableUntil = 9999; c.meta.freePlay = true;
        c.meta.revealedTo = [ctx.you.idx];
        ctx.g.lg(`Extract Power egzilira vrh od ${q.name} licem nadolje — ${ctx.you.name} ga smije igrati besplatno.`);
      }
    },
  };
  SC['Kindred Dominance'] = {
    resolve: async ctx => {
      const type = await chooseCreatureType(ctx.g, ctx.you, ctx.src, 'Kindred Dominance: izaberi creature type');
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
    addlCost: { lifeX: true, aiKind: 'toxicDeluge' },
    resolve: async ctx => {
      const x = ctx.so.additionalLifePaid || 0;
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
        const cands = ctx.g.creatures(victim).filter(c => !c.isToken && ctx.g.canSacrifice(c));
        const k = await victim.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Villainous choice:',
          options: [
            { key: 'sac', label: cands.length ? 'Sacrifice a creature' : 'Sacrifice (none available!)', candidates: cands },
            { key: 'life', label: '-2 života, on vuče 2', lifeCost: 2, cardsForOpponent: 2 },
          ],
          aiHint: { kind: 'villainousChoice', sourceController: ctx.you, candidates: cands },
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
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target a nonland card in your graveyard to suspend',
        filter: (g, card, ctrl) => card.owner === ctrl && !card.is('Land'),
        aiHint: { goal: 'recur' },
      }],
      run: async ctx => {
        const c = ctx.targets[0];
        if (!c || c.zone !== 'graveyard') return;
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
      targets: [T.oppCreature({ prompt: 'Loki\'s Scepter: ciljaj stvorenje', aiHint: { goal: 'steal' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        const orig = t.ctrl;
        t.ctrl = ctx.you; t.tapped = false; t.meta.tempHaste = true;
        const iid = t.iid;
        const villainEffect = {
          expires: 'eot', kind: 'addVillain',
          apply: (g2, bf) => {
            const stolen = bf.find(card => card.iid === iid);
            if (stolen && !stolen.cur.subtypes.includes('Villain')) stolen.cur.subtypes.push('Villain');
          },
        };
        ctx.g.untilEffects.push(villainEffect);
        ctx.g.recalc();
        ctx.g.lg(`Loki's Scepter krade ${t.name}!`);
        ctx.g.delayed.push({
          on: 'endStep', name: 'Scepter vraća', ctrl: ctx.you,
          run: async c2 => {
            const x = c2.g.byIid(iid);
            if (x && x.zone === 'battlefield') { x.ctrl = orig; x.meta.tempHaste = false; }
            const effectIndex = c2.g.untilEffects.indexOf(villainEffect);
            if (effectIndex >= 0) c2.g.untilEffects.splice(effectIndex, 1);
            c2.g.recalc();
          },
        });
      },
    }],
  };
  SC['Patchwork Banner'] = {
    asEnters: async (g, card) => {
      card.meta.chosenType = await chooseCreatureType(g, card.ctrl, card, 'Patchwork Banner: izaberi creature type');
    },
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    statics: [{
      apply: (g, self, bf) => {
        if (!self.meta.chosenType) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature') && c.hasSub(self.meta.chosenType)) { c.cur.power++; c.cur.toughness++; }
      },
    }],
  };
  SC["Progenitor's Icon"] = {
    asEnters: async (g, card) => {
      card.meta.chosenType = await chooseCreatureType(g, card.ctrl, card, `Progenitor's Icon: izaberi creature type`);
    },
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
        targets: (g, self) => E.eachOpp(g, self.ctrl).map(opponent => T.creature({
          upTo: true, prompt: `Age of Ultron: nonartifact stvorenje od ${opponent.name}`,
          filter: (g2, card) => card.zone === 'battlefield' && card.ctrl === opponent &&
            card.is('Creature') && !card.is('Artifact'),
          aiHint: { goal: 'removal' },
        })),
        run: async ctx => {
          for (const target of ctx.targets.filter(Boolean)) await ctx.g.destroy(target);
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
      on: 'drawStep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
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
            { key: 't', label: 'Treasure (-1 život)', lifeCost: 1, benefit: 'treasure' },
            { key: 'c', label: 'Karta (-2 života)', lifeCost: 2, benefit: 'draw' },
            { key: 's', label: 'Shapeshifter 3/2 (-3 života)', lifeCost: 3, benefit: 'creature' },
          ],
          min: 1, max: 3, aiHint: { kind: 'blackMarketConnections', src: ctx.src },
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
              options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast', card: c },
            });
            if (yes === 'yes') {
              ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1); c.zone = 'nowhere';
              const ok = await ctx.g.castSpell(ctx.you, c, { free: true, from: 'exile' });
              if (!ok) { c.zone = 'hand'; ctx.you.hand.push(c); }
            } else { ctx.you.exile.splice(ctx.you.exile.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); }
          }
          ctx.g.lg('GLORIOUS PURPOSE! Plan ispunjen!');
        }
      },
    }],
  };
  SC['Kang Dynasty'] = {
    saga: [
      {
        targets: dynastyTargets,
        run: async ctx => { await kangGoad(ctx); },
      },
      {
        targets: dynastyTargets,
        run: async ctx => { await kangGoad(ctx); },
      },
      {
        targets: [T.yourCreature({ prompt: 'Kang Dynasty III: ciljaj svoje stvorenje', aiHint: { goal: 'pump' } })],
        run: async ctx => {
          const t = ctx.targets[0];
          if (!t) return;
          E.pumpUntilEOT(ctx.g, t, ctx.you.hand.length, ctx.you.hand.length);
          const iid = t.iid;
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'unblockable',
            apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
          });
          ctx.g.recalc();
        },
      },
    ],
    triggers: [
      {
        on: 'drawStep', desc: 'Saga poglavlje', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { await ctx.g.sagaChapter(ctx.src); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci za goadovano stvorenje',
        filter: (g, self, d) => self.meta.dynastyGoaded &&
          self.meta.dynastyGoaded[d.card.iid] > self.ctrl.turnsStarted,
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  function dynastyTargets(g, self) {
    return E.eachOpp(g, self.ctrl).map(opponent => T.creature({
      upTo: true, prompt: `Kang Dynasty: stvorenje od ${opponent.name}`,
      filter: (g2, card) => card.zone === 'battlefield' && card.ctrl === opponent && card.is('Creature'),
      aiHint: { goal: 'goadTarget' },
    }));
  }
  async function kangGoad(ctx) {
    ctx.src.meta.dynastyGoaded = ctx.src.meta.dynastyGoaded || {};
    for (const t of ctx.targets.filter(Boolean)) {
      t.tapped = true;
      E.goad(ctx.g, t, ctx.you);
      ctx.src.meta.dynastyGoaded[t.iid] = ctx.you.turnsStarted + 1;
    }
  }
  // Doom lands
  SC['Choked Estuary'] = {
    producesColors: ['U', 'B'], mana: { cost: { tap: true }, produce: [{ U: 1 }, { B: 1 }] },
    entersTapped: async (g, card) => {
      const revealable = card.ctrl.hand.filter(candidate => candidate !== card &&
        (candidate.def.subtypes.includes('Island') || candidate.def.subtypes.includes('Swamp')));
      if (!revealable.length) return true;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: revealable, min: 0, max: 1,
        prompt: 'Choked Estuary: otkrij Island ili Swamp da uđe untapped?',
        aiHint: { kind: 'revealLand', source: card },
      });
      if (!picked[0]) return true;
      g.lg(`${card.ctrl.name} otkriva ${picked[0].name} za Choked Estuary.`);
      return false;
    },
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
      targets: [T.yourCreature({
        prompt: 'Ciljaj Villaina koji connivea',
        filter: (g, card, ctrl) => card.ctrl === ctrl && card.is('Creature') && isVillain(card),
        aiHint: { goal: 'pump' },
      })],
      run: async ctx => {
        if (ctx.targets[0]) await ctx.g.connive(ctx.targets[0]);
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
        aiHint: { kind: 'fantasticPay', effect: 'invisible' },
        run: async ctx => {
          const ok = await ctx.g.payMana(ctx.you, U.parseCost('{R}{G}{W}{U}'));
          if (!ok) return;
          ctx.g.queueTrigger({
            src: ctx.src, ctrl: ctx.you, name: 'Invisible strike',
            targets: [T.yourCreature({ prompt: 'Creature gets +1/+0 per creature and cannot be blocked', aiHint: { goal: 'buff' } })],
            run: async strikeCtx => {
              const target = strikeCtx.targets[0];
              if (!target) return;
              E.pumpUntilEOT(strikeCtx.g, target, strikeCtx.g.creatures(strikeCtx.you).length, 0);
              const iid = target.iid;
              strikeCtx.g.untilEffects.push({
                expires: 'eot', kind: 'unblockable',
                apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
              });
              strikeCtx.g.recalc();
              strikeCtx.g.lg(`${target.name} is invisible and cannot be blocked!`);
            },
          });
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
        on: 'castNonCreature', desc: '+2/+2', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 2, 2); },
      },
      {
        on: 'targeted', desc: 'Lethal Voice',
        filter: (g, self, d) => d.card === self && d.byPlayer && d.byPlayer !== self.ctrl,
        targets: (g, self, data) => [T.permanent((g2, card) =>
          card.ctrl === data.byPlayer && !card.is('Land'), {
          prompt: `${data.byPlayer.name}: nonland permanent to destroy`, aiHint: { goal: 'removal' },
        })],
        run: async ctx => {
          if (ctx.targets[0]) await ctx.g.destroy(ctx.targets[0]);
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
        if (x) await ctx.g.damageOpponents(ctx.src, ctx.you, x);
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
      targets: [T.permanent(() => true, { prompt: 'Exile target permanent', aiHint: { goal: 'removal' } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.exileCard(ctx.targets[0]); },
    }],
    statics: [{
      apply: (g, self) => {
        if (!g.creatures(self.ctrl).some(c => c.name === "Silver Surfer, Galactus's Herald")) self.cur.mustAttack = true;
      },
    }],
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
        aiHint: { kind: 'fantasticPay', effect: 'torch' },
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
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Lockjaw teleport',
          targets: [T.yourCreature({
            prompt: 'Up to one other creature also cannot be blocked', upTo: true,
            filter: (g, card, ctrl) => card.ctrl === ctrl && card.is('Creature') && card !== ctx.src,
            aiHint: { goal: 'buff' },
          })],
          run: async teleportCtx => {
            for (const target of [teleportCtx.src, teleportCtx.targets[0]].filter(Boolean)) {
              const iid = target.iid;
              teleportCtx.g.untilEffects.push({
                expires: 'eot', kind: 'unblockable',
                apply: (g2, bf) => { const x = bf.find(y => y.iid === iid); if (x) x.cur.unblockable = true; },
              });
            }
            teleportCtx.g.recalc();
          },
        });
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
      label: 'Copy your trigger twice', cost: { mana: '{R}{G}{W}{U}', tap: true },
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
      on: 'tokensCreated', desc: 'Vuci', filter: (g, self, d) => d.ctrl === self.ctrl,
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
      on: 'combatDamageToPlayer', desc: 'Instant or sorcery from the graveyard', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(c => c.is('Instant') || c.is('Sorcery'));
        if (!pool.length) return;
        const c = pool[Math.floor(ctx.g.rnd() * pool.length)];
        ctx.g.remove(c); c.zone = 'exile'; ctx.you.exile.push(c);
        const you = ctx.you;
        ctx.g.delayed.push({
          on: 'upkeep', name: 'Power Pack cast', ctrl: you,
          filter: (g2, d) => d.player === you,
          run: async c2 => {
            if (c.zone !== 'exile') return;
            const cast = await you.controller.decide(c2.g, {
              type: 'chooseOption', prompt: `Power Pack: cast ${c.name} for free?`,
              options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
              aiHint: { kind: 'freeCast', card: c },
            });
            if (cast !== 'yes') return;
            c.meta.exileIfStackLeaves = true;
            const ok = await c2.g.castSpell(you, c, { free: true, from: 'exile', exileAfter: true });
            if (!ok) delete c.meta.exileIfStackLeaves;
          },
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
        targets: (g, self, data) => [T.creature({
          prompt: `Target creature must attack ${data.player.name}`,
          aiHint: { goal: 'forceAttack', victim: data.player },
        })],
        run: async ctx => {
          const victim = ctx.data.player;
          const target = ctx.targets[0];
          if (!target || !victim) return;
          ctx.g.untilEffects.push({
            kind: 'mustAttackPlayerCard', iid: target.iid, timestamp: target.timestamp,
            targetPlayer: victim, expires: 'throughTurnOf', whoTurn: ctx.you,
            afterTurnsStarted: ctx.you.turnsStarted + 1,
          });
          ctx.g.lg(`Silver Surfer: ${target.name} must attack ${victim.name} each combat if able.`);
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
      aiHint: { kind: 'fantasticPay', effect: 'thing' },
      run: async ctx => {
        if (!await ctx.g.payMana(ctx.you, U.parseCost('{R}{G}{W}{U}'))) return;
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Double counters',
          targets: (g, self) => [{
            what: 'permanent', count: g.bf().filter(card => card.ctrl === self.ctrl).length,
            upTo: true, prompt: 'Double each kind of counter on any number of your permanents',
            filter: (g2, card, ctrl) => card.ctrl === ctrl, aiHint: { goal: 'buff' },
          }],
          run: async doubleCtx => {
            for (const permanent of doubleCtx.targets.flat().filter(Boolean)) {
              for (const [kind, amount] of Object.entries(permanent.counters)) {
                if (amount > 0) doubleCtx.g.addCounters(permanent, kind, amount, true, doubleCtx.you);
              }
            }
            doubleCtx.g.recalc();
          },
        });
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
          const draw = await victim.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `${victim.name}: draw a card from Willie Lumpkin?`,
            options: [{ key: 'yes', label: 'Yes, draw a card' }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'willieDraw', protectedPlayer: ctx.you },
          });
          if (draw === 'yes') {
            await ctx.g.draw(victim, 1);
            ctx.g.untilEffects.push({
              kind: 'cantAttackPlayer', who: victim, notPlayer: ctx.you,
              expires: 'throughTurnOf', whoTurn: victim,
              afterTurnsStarted: victim.turnsStarted + 1,
            });
          }
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
    targets: [{
      what: 'permanent', count: 4, upTo: true,
      prompt: 'Up to four permanents you control gain indestructible',
      filter: (g, card, ctrl) => card.ctrl === ctrl,
      aiHint: { goal: 'protect' },
    }],
    resolve: async ctx => {
      for (const card of (Array.isArray(ctx.targets[0]) ? ctx.targets[0] : []).filter(Boolean)) {
        E.grantUntilEOT(ctx.g, card, ['indestructible']);
      }
    },
  };
  SC['Cleansing Nova'] = {
    modes: {
      pick: 1, aiHint: { kind: 'scionsWipe' },
      list: [
        { label: 'Uništi sva stvorenja', aiMeta: { destroyKind: 'creatures' } },
        { label: 'Uništi artefakte i enchantmente', aiMeta: { destroyKind: 'artifactsEnchantments' } },
      ],
    },
    resolve: async ctx => {
      const filt = ctx.mode[0] === 0 ? (c) => c.is('Creature') : (c) => (c.is('Artifact') || c.is('Enchantment')) && !c.is('Land');
      await ctx.g.destroyMany(ctx.g.bf().filter(filt));
    },
  };
  SC['Collective Effort'] = {
    addlCost: { tapCreaturesForExtraModes: true },
    modes: {
      pick: 'any', aiHint: { kind: 'collectiveEffort' },
      list: [
        { label: 'Uništi stvorenje (power 4+)', targets: [T.creature({ prompt: 'Power 4+', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && c.power >= 4, aiHint: { goal: 'removal' } })] },
        { label: 'Uništi enchantment', targets: [T.permanent((g, c) => c.is('Enchantment'), { prompt: 'Ench', aiHint: { goal: 'removal' } })] },
        {
          label: '+1/+1 counters to creatures target player controls',
          targets: [T.player({ prompt: 'Player whose creatures get +1/+1 counters', aiHint: { goal: 'benefit' } })],
        },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0 || mi === 1) { const t = ctx.targets[ti++]; if (t) await ctx.g.destroy(t); }
        else {
          const player = ctx.targets[ti++];
          if (player) for (const c of ctx.g.creatures(player)) ctx.g.addCounters(c, '+1/+1', 1, false, ctx.you);
        }
      }
    },
  };
  SC['Fantastic Elasticity'] = {
    rebound: true,
    modes: {
      pick: 1,
      list: [
        { label: 'Bounce nonland', targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Bounce', aiHint: { goal: 'bounce' } })] },
        {
          label: 'Instant or sorcery from the graveyard to hand',
          targets: [{
            zone: 'graveyard', what: 'card', prompt: 'Target instant or sorcery card in your graveyard',
            filter: (g, card) => card.is('Instant') || card.is('Sorcery'), aiHint: { goal: 'recur' },
          }],
        },
      ],
    },
    resolve: async ctx => {
      if (ctx.mode[0] === 0) { if (ctx.targets[0] && ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); }
      else {
        const target = ctx.targets[0];
        if (target && target.zone === 'graveyard') await ctx.g.move(target, 'hand');
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
      const permanents = top.filter(c => c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land') || c.is('Planeswalker'));
      const chosen = permanents.length ? await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: permanents, min: 0, max: permanents.length,
        prompt: 'The Five Arrive: permanents to put onto the battlefield',
        aiHint: { kind: 'genesisWave' },
      }) : [];
      const battlefield = new Set((chosen || []).filter(card => permanents.includes(card)));
      for (const c of top) {
        if (battlefield.has(c)) { c.zone = 'nowhere'; await ctx.g.move(c, 'battlefield', { ctrl: ctx.you }); }
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
        { label: 'Fight damage', targets: [T.yourCreature({ prompt: 'Yours', aiHint: { goal: 'buff' } }), T.oppCreature({ prompt: 'Target', aiHint: { goal: 'removal' } })] },
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
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c !== t).slice()) {
        await ctx.g.damageCreature(t, c, t.power, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Quantum Misalignment'] = {
    rebound: true,
    targets: [T.yourCreature({ prompt: 'Kopiraj', aiHint: { goal: 'buff' } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.copyPermanentToken(ctx.targets[0], ctx.you, { nonlegendary: true }); },
  };
  SC['Recurring Insight'] = {
    rebound: true,
    targets: [T.opponent({ prompt: 'Whose hand determines the draw?', aiHint: { goal: 'maxHand' } })],
    resolve: async ctx => {
      const opponent = ctx.targets[0];
      if (opponent) await ctx.g.draw(ctx.you, opponent.hand.length);
    },
  };
  SC['Seize the Day'] = {
    flashback: { cost: '{2}{R}', altCostStr: '{2}{R}', speed: 'sorcery' },
    targets: [T.creature({ prompt: 'Untap target creature', aiHint: { goal: 'untap' } })],
    resolve: async ctx => {
      const target = ctx.targets[0];
      if (target && target.zone === 'battlefield') target.tapped = false;
      ctx.g.scheduleAdditionalCombat({ followedByMain: true });
      ctx.g.lg('Seize the Day: additional combat followed by an additional main phase.');
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
          const of = perms.filter(c => c.is(type));
          if (!of.length) continue;
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: of, min: 1, max: 1,
            prompt: `Tragic Arrogance: ${type} controlled by ${q.name} to keep`,
            aiHint: { kind: 'tragicKeep', owner: q },
          });
          keep.add(of.includes(picked[0]) ? picked[0] : of[0]);
        }
        for (const c of perms.slice()) {
          if (!keep.has(c) && c.zone === 'battlefield') await ctx.g.sacrifice(q, c);
        }
      }
      ctx.g.lg('Tragic Arrogance!');
    },
  };
  SC['Ultimate Nullification'] = {
    addlCost: {
      sacCreature: true,
      sacCreatureFilter: (g, card) => (card.cur && card.cur.super || card.def.super || []).includes('Legendary'),
      aiKind: 'addlSac',
    },
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
      targets: [{
        what: 'permanent', prompt: 'Artifact, creature, enchantment, or land to copy',
        filter: (g, card, ctrl, src) => card.zone === 'battlefield' && card !== src &&
          (card.is('Artifact') || card.is('Creature') || card.is('Enchantment') || card.is('Land')),
        aiHint: { goal: 'copy' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || target === ctx.src || target.zone !== 'battlefield') return;
        const base = target.isCopyOf || target.def;
        if (!ctx.src.meta.characteristicOriginalDef) ctx.src.meta.characteristicOriginalDef = ctx.src.def;
        ctx.src.meta.temporaryCopyTurn = ctx.g.turnNo;
        ctx.src.isCopyOf = base;
        ctx.src.def = Object.assign({}, base);
        ctx.g.recalc();
        ctx.g.lg(`Mirage Mirror becomes a complete copy of ${target.name} until end of turn.`);
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
        on: 'cast', desc: 'Becomes a creature', filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'), opt: true,
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
        opt: true, aiHint: { kind: 'fantasticarSacrifice' },
        run: async ctx => {
          if (!await ctx.g.sacrifice(ctx.you, ctx.src)) return;
          await ctx.g.makeTokens('construct44F', ctx.you, { n: 4 });
          ctx.g.lg('Fantasticar → 4× 4/4 Construct!');
        },
      },
    ],
  };
  SC['Unstable Molecule Suit'] = {
    equip: '{4}',
    equipAlt: { cost: '{2}', filter: target => target.commander },
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
        on: 'precombatMain', desc: '4 mane', oncePerTurn: true, filter: (g, self, d) => d.player === self.ctrl,
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
        on: 'castNonCreature', desc: 'Kopija', oncePerTurn: true, opt: true,
        filter: (g, self, d) => d.player === self.ctrl,
        aiHint: { kind: 'cosmicCopy' },
        run: async ctx => {
          const so = ctx.data.so;
          if (so && ctx.g.stack.includes(so)) await ctx.g.copySpell(so, ctx.you, { mayNewTargets: true });
        },
      },
    ],
  };
  SC["The Watcher's Warning"] = {
    triggers: [{
      on: 'cast', desc: 'Ukradi vrh',
      filter: (g, self, d) => d.player !== self.ctrl && d.nthThisTurn === 1,
      run: async ctx => {
        const caster = ctx.data.player;
        if (!caster.library.length) return;
        const c = caster.library.pop();
        c.zone = 'exile'; caster.exile.push(c);
        if (!c.is('Land')) {
          const yes = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Watcher: baci besplatno ${c.name}?`,
            options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }], aiHint: { kind: 'freeCast', card: c },
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
    mandatoryCastDraw: {
      event: 'cast', n: 1,
      filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
    },
    triggers: [{
      on: 'cast', desc: 'Vuci', filter: (g, self, d) => d.player === self.ctrl && !d.card.is('Creature') && !d.card.is('Land'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Baxter Building'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{4}' }, produce: [{ ANY: true, n: 4 }] },
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
      targets: (g, self, data) => [T.creature({
        prompt: 'Target attacking creature gets +X/+X',
        filter: (g2, card) => data.attackers.includes(card),
        aiHint: { goal: 'buff' },
      })],
      run: async ctx => {
        const n = ctx.g.creatures(ctx.you).length;
        const target = ctx.targets[0];
        if (target) E.pumpUntilEOT(ctx.g, target, n, n);
      },
    }],
  };
  SC['Dora Milaje Elite'] = {
    triggers: [{
      on: 'etb', desc: 'Vibranium?', filter: (g, self, d) => etbSelf(g, self, d) &&
        E.eachOpp(g, self.ctrl).some(opponent => g.lands(opponent).length > g.lands(self.ctrl).length),
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
          const artifacts = top.filter(card => card.is('Artifact'));
          const picked = artifacts.length ? await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: artifacts, min: 0, max: 1,
            prompt: 'Ingenious Smith: reveal up to one artifact', aiHint: { kind: 'bestCard' },
          }) : [];
          const artifact = picked[0] && artifacts.includes(picked[0]) ? picked[0] : null;
          if (artifact) {
            artifact.zone = 'hand'; ctx.you.hand.push(artifact);
            ctx.g.lg(`Ingenious Smith reveals ${artifact.name}.`);
            await ctx.g.revealToHuman({ cards: [artifact], ctrl: ctx.you, kind: 'reveal' });
          }
          const rest = top.filter(card => card !== artifact);
          U.shuffle(rest, ctx.g.rnd);
          for (const card of rest) card.zone = 'library';
          ctx.you.library.unshift(...rest);
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
      label: 'Sac: legenda iz groblja', cost: { sacSelf: true },
      cond: (g, c, p) => g.turnPlayer === p && ['upkeep', 'draw', 'main1'].includes(g.phase) &&
        p.graveyard.some(x => x.is('Creature') && (x.def.super || []).includes('Legendary')),
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target legendary creature card',
        filter: (g, card, ctrl) => card.owner === ctrl && card.is('Creature') && (card.def.super || []).includes('Legendary'),
        aiHint: { goal: 'reanimate' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || target.zone !== 'graveyard') return;
        await ctx.g.move(target, 'battlefield', { ctrl: ctx.you });
        ctx.g.lg(`Loyal Retainers returns ${target.name}!`);
      },
      aiScore: (g, c, p) => p.graveyard.some(x => x.is('Creature') && (x.def.super || []).includes('Legendary') && U.mv(x.def.cost || '') >= 4) ? 7 : 0,
    }],
  };
  SC["M'Baku, Jabari Chieftain"] = {
    triggers: [
      {
        on: 'endStep', desc: 'Daj krunu', filter: (g, self, d) => d.player === self.ctrl && !g.monarch,
        targets: [T.opponent({ prompt: 'Ko postaje monarh?', aiHint: { goal: 'gift' } })],
        run: async ctx => {
          const o = ctx.targets[0];
          if (o) await ctx.g.becomeMonarch(o);
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
      run: async ctx => { await ctx.g.becomeMonarch(ctx.you); },
    }],
    abilities: [{
      label: '2× +1/+1', sorcery: true, cost: { tap: true, mana: '{2}' },
      targets: [T.permanent((g, card) => card.is('Creature') || card.hasSub('Vehicle'), {
        prompt: 'Target creature or Vehicle gets two +1/+1 counters', aiHint: { goal: 'buff' },
      })],
      run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 2); },
      aiScore: () => 2,
    }],
  };
  SC['Okoye, Mighty and Adored'] = {
    triggers: [
      { on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { await ctx.g.becomeMonarch(ctx.you); } },
      {
        on: 'beginCombat', desc: '+1/+1', filter: (g, self, d) => d.player === self.ctrl,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (!target) return;
          ctx.g.addCounters(target, '+1/+1', 1);
          const iid = target.iid, timestamp = target.timestamp, you = ctx.you;
          ctx.g.delayed.push({
            on: 'attacks', once: false, expires: 'eot', name: 'Okoye — monarch assault', ctrl: you,
            filter: (g2, data) => data.card && data.card.iid === iid && data.card.timestamp === timestamp &&
              data.defender === g2.monarch,
            run: async delayedCtx => {
              const creature = delayedCtx.data.card;
              if (creature && creature.zone === 'battlefield') E.grantUntilEOT(delayedCtx.g, creature, ['double strike', 'trample']);
            },
          });
        },
      },
    ],
  };
  SC['Palace Jailer'] = {
    triggers: [
      { on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { await ctx.g.becomeMonarch(ctx.you); } },
      {
        on: 'etb', desc: 'Zatvori stvorenje', filter: etbSelf,
        targets: [T.oppCreature({ prompt: 'Exile target creature an opponent controls', aiHint: { goal: 'removal' } })],
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
    triggers: [{ on: 'etb', desc: 'Monarh', filter: etbSelf, run: async ctx => { await ctx.g.becomeMonarch(ctx.you); } }],
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
        targets: (g, self, data) => [T.creature({
          prompt: 'Another target attacking creature',
          filter: (g2, card) => card !== self && card.attacking && card.ctrl === self.ctrl,
          aiHint: { goal: 'buff' },
        })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (target) E.pumpUntilEOT(ctx.g, target, Math.max(0, ctx.src.power), 0, ['flying']);
        },
      },
      {
        on: 'attacks', desc: 'Obara letača',
        filter: (g, self, d) => d.card && d.card.ctrl !== self.ctrl && d.card.attacking === self.ctrl && d.card.kw('flying'),
        run: async ctx => {
          const flier = ctx.data.card;
          if (flier) await ctx.g.damageCreature(ctx.src, flier, Math.max(0, ctx.src.power));
        },
      },
    ],
  };
  SC["T'Chaka, Venerable King"] = {
    triggers: [{
      on: 'etb', desc: 'Mill 3 → uzmi', filter: etbSelf,
      run: async ctx => {
        const milled = await ctx.g.mill(ctx.you, 3);
        const eligible = milled.filter(card => card.zone === 'graveyard' && (card.is('Artifact') || card.is('Land')));
        const picked = eligible.length ? await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: eligible, min: 0, max: 1,
          prompt: "T'Chaka: put an artifact or land milled this way into your hand",
          aiHint: { kind: 'bestCard' },
        }) : [];
        const card = picked[0] && eligible.includes(picked[0]) ? picked[0] : null;
        if (card) {
          ctx.g.remove(card); card.zone = 'hand'; ctx.you.hand.push(card);
          ctx.g.lg(`T'Chaka returns ${card.name} to hand.`);
        }
      },
    }],
    gyAbility: {
      label: 'Postani monarh {3}', cost: '{3}',
      cond: (g, c, p) => g.turnPlayer === p && ['upkeep', 'draw', 'main1'].includes(g.phase) &&
        g.bf().some(x => x.commander && x.ctrl === p),
      run: async ctx => { await ctx.g.becomeMonarch(ctx.you); },
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
      T.yourCreature({ prompt: 'Yours (+1/+1, then fight)', aiHint: { goal: 'buff' } }),
      T.oppCreature({ prompt: 'Fight meta', aiHint: { goal: 'removal' } }),
    ],
    resolve: async ctx => {
      const [a, b] = ctx.targets;
      if (!a || !b) return;
      const victimIid = b.iid, victimTimestamp = b.timestamp, you = ctx.you;
      ctx.g.delayed.push({
        on: 'dies', expires: 'eot', name: 'Fight for the Throne — monarch', ctrl: you,
        filter: (g2, data) => data.card && data.card.iid === victimIid && data.snap &&
          data.snap.timestamp === victimTimestamp && g2.bf().some(card => card.commander && card.ctrl === you),
        run: async delayedCtx => {
          if (delayedCtx.g.bf().some(card => card.commander && card.ctrl === you)) {
            await delayedCtx.g.becomeMonarch(you);
          }
        },
      });
      ctx.g.addCounters(a, '+1/+1', 1);
      const aPower = Math.max(0, a.power), bPower = Math.max(0, b.power);
      await ctx.g.damageCreature(a, b, aPower, { deferSBA: true });
      await ctx.g.damageCreature(b, a, bPower, { deferSBA: true });
      await ctx.g.checkSBA();
    },
  };
  SC['Generous Gift'] = {
    targets: [T.permanent(null, { prompt: 'Destroy anything', aiHint: { goal: 'removal' } })],
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
        await ctx.g.destroyMany(ctx.g.bf().filter(c => c.is('Creature') && !mine.has(c.iid)));
        ctx.g.lg('Martial Coup: prevrat! Sva ostala stvorenja uništena.');
      }
    },
  };
  SC['Wakanda Forever!'] = {
    resolve: async ctx => {
      const top = [];
      for (let i = 0; i < 6 && ctx.you.library.length; i++) top.push(ctx.you.library.pop());
      if (!top.length) return;
      await ctx.g.revealToHuman({ cards: top, ctrl: ctx.you, kind: 'reveal' });
      const permanents = top.filter(card => card.is('Creature') || card.is('Artifact') || card.is('Enchantment') ||
        card.is('Land') || card.is('Planeswalker'));
      const battlefieldPick = permanents.length ? await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: permanents, min: 0, max: 1,
        prompt: 'Wakanda Forever!: put up to one permanent onto the battlefield with an indestructible counter',
        aiHint: { kind: 'wakandaBattlefield' },
      }) : [];
      const battlefieldCard = battlefieldPick[0] && permanents.includes(battlefieldPick[0]) ? battlefieldPick[0] : null;
      if (battlefieldCard) {
        await ctx.g.move(battlefieldCard, 'battlefield', {
          ctrl: ctx.you, additionalCounters: { indestructible: 1 }, additionalCounterBy: ctx.you,
        });
      }
      const handPool = permanents.filter(card => card !== battlefieldCard && card.zone === 'library');
      const handPick = handPool.length ? await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: handPool, min: 0, max: 1,
        prompt: 'Wakanda Forever!: put up to one of the remaining permanents into your hand',
        aiHint: { kind: 'bestCard' },
      }) : [];
      const handCard = handPick[0] && handPool.includes(handPick[0]) ? handPick[0] : null;
      if (handCard) await ctx.g.move(handCard, 'hand');
      for (const card of top) {
        if (card.zone === 'library') await ctx.g.move(card, 'graveyard');
      }
      ctx.g.lg('WAKANDA FOREVER! 🐾');
    },
  };
  SC['Conduit of Worlds'] = {
    playLandsFromGraveyard: true,
    abilities: [{
      label: 'Baci iz groblja', sorcery: true, cost: { tap: true },
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target nonland permanent card in your graveyard',
        filter: (g, card, ctrl) => card.owner === ctrl && !card.is('Land') &&
          (card.is('Creature') || card.is('Artifact') || card.is('Enchantment') || card.is('Planeswalker')),
        aiHint: { goal: 'bestGyCast' },
      }],
      run: async ctx => {
        const card = ctx.targets[0];
        if (!card || card.zone !== 'graveyard' || ctx.you.turnState.spellsCast > 0) return;
        const canPay = ctx.g.canPayMana(ctx.you, ctx.g.spellCost(ctx.you, card, { from: 'graveyard' }), { card });
        if (!canPay) return;
        const choice = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Conduit of Worlds: cast ${card.name}?`,
          options: [{ key: 'yes', label: `Cast ${card.name}` }, { key: 'no', label: 'Do not cast' }],
          aiHint: { kind: 'conduitCast', card },
        });
        if (choice !== 'yes') return;
        ctx.you.turnState.cantCastAdditional = true;
        const ok = await ctx.g.castSpell(ctx.you, card, { from: 'graveyard', ignoreAdditionalCastLock: true });
        if (!ok) ctx.you.turnState.cantCastAdditional = false;
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
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.hasSub('Equipment'),
      targets: [T.yourCreature({ prompt: 'Attach that Equipment to target creature you control', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target && ctx.data.card.zone === 'battlefield') await ctx.g.attach(ctx.data.card, target);
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
      label: 'Resurrection + crown', cost: { tap: true, sacSelf: true, mana: '{2}' },
      cond: (g, c, p) => g.creatures(p).length > 0,
      run: async ctx => {
        const cands = ctx.g.creatures(ctx.you);
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 0, max: 1, prompt: 'Žrtvuj pa vrati sa 3 countera:', aiHint: { kind: 'sacCost' } });
        const c = pick[0];
        if (c) {
          const sacrificed = await ctx.g.sacrifice(ctx.you, c);
          if (!sacrificed) return;
          if (c.zone === 'graveyard') {
            await ctx.g.move(c, 'battlefield', {
              ctrl: c.owner, additionalCounters: { '+1/+1': 3 }, additionalCounterBy: ctx.you,
            });
          }
          await ctx.g.becomeMonarch(ctx.you);
        }
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
        await ctx.g.copyPermanentToken(host, ctx.you, { haste: true, nonlegendary: true });
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
        const k = await ctx.you.controller.decide(ctx.g, { type: 'chooseOption', prompt: 'Kimoyo Beads:', options: opts, aiHint: { kind: 'wakandaBead', source: ctx.src } });
        used.push(k);
        if (k === 'av') await ctx.g.draw(ctx.you, 1);
        else if (k === 'comm') await ctx.g.makeTokens('soldierW', ctx.you, { n: 2 });
        else {
          await ctx.g.gainLife(ctx.you, 3);
          if (ctx.src.zone === 'battlefield') {
            const owner = ctx.src.owner;
            await ctx.g.exileCard(ctx.src);
            if (ctx.src.zone === 'exile') await ctx.g.move(ctx.src, 'battlefield', { ctrl: owner });
          }
        }
      },
    }],
  };
  SC["King Solomon's Frogs"] = {
    triggers: [{
      on: 'etb', desc: 'Egzilaj skupe', filter: (g, self, d) => etbSelf(g, self, d) && self.meta._enteredFromZone === 'stack',
      targets: (g, self) => E.eachOpp(g, self.ctrl).map(opponent => T.permanent(
        (g2, card) => card.ctrl === opponent && card.mv >= 3 && !card.is('Land'), {
          prompt: `Exile up to one MV 3+ permanent controlled by ${opponent.name}`,
          upTo: true, aiHint: { goal: 'removal' },
        })),
      run: async ctx => {
        for (const target of ctx.targets.flat().filter(Boolean)) {
          const controller = target.ctrl;
          await ctx.g.exileCard(target);
          if (target.zone === 'exile') await ctx.g.draw(controller, 1);
        }
      },
    }],
    abilities: [{
      label: 'Egzilaj: monarh', cost: { tap: true, exileSelf: true, mana: '{3}' },
      run: async ctx => { await ctx.g.becomeMonarch(ctx.you); },
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
      on: 'draw', desc: 'You draw too', opt: true,
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
        const isPerm = top.is('Creature') || top.is('Artifact') || top.is('Enchantment') || top.is('Land') || top.is('Planeswalker');
        let put = 'no';
        if (isPerm) put = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `N'Yami-Class Mother Ship: put ${top.name} onto the battlefield?`,
          options: [{ key: 'yes', label: 'Put it onto the battlefield' }, { key: 'no', label: 'Put it into your hand' }],
          aiHint: { kind: 'nyamiTop', card: top },
        });
        if (isPerm && put === 'yes') await ctx.g.move(top, 'battlefield', { ctrl: ctx.you });
        else await ctx.g.move(top, 'hand');
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
      label: 'BOMBA: uništi sve osim artefakata/landova', cost: { tap: true, sacSelf: true },
      cond: (g, c, p) => g.turnPlayer === p && g.phase === 'upkeep',
      run: async ctx => {
        await ctx.g.destroyMany(ctx.g.bf().filter(c => !c.is('Artifact') && !c.is('Land')));
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
      targets: [{
        zone: 'graveyard', what: 'card', prompt: 'Target artifact card in your graveyard',
        filter: (g, card, ctrl) => card.owner === ctrl && card.is('Artifact'),
        aiHint: { goal: 'reanimate' },
      }],
      run: async ctx => {
        const target = ctx.targets[0];
        if (target && target.zone === 'graveyard') await ctx.g.move(target, 'battlefield', {
          ctrl: ctx.you, additionalCounters: { finality: 1 }, additionalCounterBy: ctx.you,
        });
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
        run: async ctx => { await ctx.g.becomeMonarch(ctx.you); },
      },
      {
        on: 'attacks', desc: 'Uništi tapirano',
        filter: (g, self, d) => d.card.iid === self.attachedTo && d.defender === g.monarch && d.defender instanceof MTG.Player,
        targets: (g, self, data) => [T.permanent(
          (g2, card) => card.ctrl === data.defender && card.tapped && !card.is('Land'), {
            prompt: `Destroy target tapped nonland permanent controlled by ${data.defender.name}`,
            aiHint: { goal: 'removal' },
          })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (target) await ctx.g.destroy(target);
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
        targets: [T.yourCreature({ prompt: 'Attach Vibranium Strike Gauntlets to target creature you control', aiHint: { goal: 'buff' } })],
        run: async ctx => {
          const target = ctx.targets[0];
          if (target) await ctx.g.attach(ctx.src, target);
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
      run: async ctx => { await ctx.g.becomeMonarch(ctx.you); },
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
    targets: [T.creature({ prompt: 'Kopiraj', aiHint: { goal: 'copy' } })],
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
    resolve: async ctx => { await E.searchLandByName(ctx.g, ctx.you, ['Forest'], { tapped: false }); },
  };
  SC['Vibranium Dynamo'] = { mana: { cost: { tap: true }, produce: [{ C: 3 }] } };
  SC['Razorverge Thicket'] = {
    producesColors: ['G', 'W'], mana: { cost: { tap: true }, produce: [{ G: 1 }, { W: 1 }] },
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length > 2,
  };
})();
