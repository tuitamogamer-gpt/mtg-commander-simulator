// ===== scripts_v7a.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// v7 — zajednički helperi + tokeni + TURTLE POWER (TMC) + MARDU SURGE (TDC)
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, d) => d.card === self;

  // ---------- novi tokeni ----------
  const tok = (name, types, subtypes, p, t, kws, cols, extra) => Object.assign({
    name, cost: null, types, subtypes, super: [], power: String(p), toughness: String(t),
    oracle: '', kws: kws || [], isTokenDef: true, colorsOverride: cols || [],
  }, extra || {});
  TK.mutagen = tok('Mutagen', ['Artifact'], ['Mutagen'], undefined, undefined, [], [], {
    power: undefined, toughness: undefined,
    abilities: [{
      label: '+1/+1 counter na stvorenje', cost: { tap: true, sacSelf: true, mana: '{1}' }, sorcery: true,
      targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
      run: async ctx => { ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      aiScore: (g, c, p) => 5,
    }],
  });
  TK.ninjaB = tok('Ninja', ['Creature'], ['Ninja'], 1, 1, [], ['B']);
  TK.oozeG = tok('Ooze', ['Creature'], ['Ooze'], 2, 2, [], ['G']);
  TK.robot11 = tok('Robot', ['Artifact', 'Creature'], ['Robot'], 1, 1, [], []);
  TK.warriorR = tok('Warrior', ['Creature'], ['Warrior'], 1, 1, [], ['R']);
  TK.snakeDT = tok('Snake', ['Creature'], ['Snake'], 1, 1, ['deathtouch'], ['G']);
  TK.snakeB = tok('Snake', ['Creature'], ['Snake'], 1, 1, ['deathtouch'], ['B']);
  TK.zombie22 = tok('Zombie', ['Creature'], ['Zombie'], 2, 2, [], ['B']);
  TK.elfWarrior = tok('Elf Warrior', ['Creature'], ['Elf', 'Warrior'], 1, 1, [], ['G']);
  TK.myr = tok('Myr', ['Artifact', 'Creature'], ['Myr'], 1, 1, [], []);
  TK.servo = tok('Servo', ['Artifact', 'Creature'], ['Servo'], 1, 1, [], []);
  TK.gnome = tok('Gnome', ['Artifact', 'Creature'], ['Gnome'], 1, 1, [], []);
  TK.golem99 = tok('Golem', ['Artifact', 'Creature'], ['Golem'], 9, 9, [], []);
  TK.golemC33 = tok('Golem', ['Artifact', 'Creature'], ['Golem'], 3, 3, [], []);
  TK.scarecrow22 = tok('Scarecrow', ['Artifact', 'Creature'], ['Scarecrow'], 2, 2, [], []);
  TK.mercenaryR = tok('Mercenary', ['Creature'], ['Mercenary'], 1, 1, [], ['R'], {
    abilities: [{
      label: '+1/+0 stvorenju', cost: { tap: true }, sorcery: true,
      targets: [T.yourCreature({ prompt: '+1/+0', aiHint: { goal: 'buff' } })],
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.targets[0], 1, 0); },
      aiScore: () => 1,
    }],
  });
  TK.assassinB = tok('Assassin', ['Creature'], ['Assassin'], 1, 1, ['deathtouch', 'haste'], ['B']);
  TK.rogue22 = tok('Rogue', ['Creature'], ['Rogue'], 2, 2, [], ['B']);
  TK.angel44 = tok('Angel', ['Creature'], ['Angel'], 4, 4, ['flying', 'vigilance'], ['W']);
  TK.elemental11R = tok('Elemental', ['Creature'], ['Elemental'], 1, 1, ['haste'], ['R']);
  TK.birdU = tok('Bird', ['Creature'], ['Bird'], 2, 2, ['flying'], ['U']);
  TK.dogW = tok('Dog', ['Creature'], ['Dog'], 1, 1, [], ['W']);
  TK.batB = tok('Bat', ['Creature'], ['Bat'], 1, 1, ['flying'], ['B']);
  TK.incubator = tok('Incubator', ['Artifact'], ['Incubator'], undefined, undefined, [], [], {
    power: undefined, toughness: undefined,
    abilities: [{
      label: 'Transform → 0/0 Phyrexian', cost: { mana: '{2}' },
      cond: (g, c) => !c.meta.transformed,
      run: async ctx => {
        ctx.src.meta.transformed = true;
        ctx.g.lg(`${ctx.src.name} se transformiše (P/T = broj +1/+1 countera).`);
        ctx.g.recalc();
      },
      aiScore: (g, c) => (c.counters['+1/+1'] || 0) >= 2 ? 6 : 1,
    }],
    dynTypes: (g, c) => c.meta.transformed ? ['Creature'] : [],
    // 0/0 + counteri
  });

  // ---------- E7 helperi ----------
  const E7 = MTG.E7 = {};
  E7.m1 = (g, card, n, by) => g.addM1(card, n, by);
  E7.blight = async (g, p, n, src) => {
    // stavi n -1/-1 na SVOJE stvorenje (izbor)
    const pool = g.creatures(p);
    if (!pool.length) return false;
    const pick = await p.controller.decide(g, {
      type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Blight ${n}: -1/-1 na svoje stvorenje`, aiHint: { kind: 'blight' },
    });
    if (!pick.length) return false;
    await g.addM1(pick[0], n, p);
    return true;
  };
  E7.sacAtNextEnd = (g, cards, you) => {
    const iids = cards.map(c => c.iid);
    g.delayed.push({
      on: 'endStep', name: 'Žrtvuj privremene tokene', ctrl: you,
      run: async ctx => {
        for (const iid of iids) {
          const c = ctx.g.byIid(iid);
          if (c && c.zone === 'battlefield') await ctx.g.sacrifice(c.ctrl, c);
        }
      },
    });
  };
  E7.mobilize = async (g, card, n) => {
    // napravi n tapovanih 1/1 red Warrior tokena koji napadaju; žrtvuj na sljedećem end stepu
    if (!g.combat || !(card.attacking)) return;
    const made = await g.makeTokens('warriorR', card.ctrl, { n, tapped: true, attacking: card.attacking });
    if (made.length) {
      g.lg(`Mobilize ${n}: ${card.name}.`);
      E7.sacAtNextEnd(g, made, card.ctrl);
    }
  };
  E7.isOutlaw = (c) => ['Assassin', 'Mercenary', 'Pirate', 'Rogue', 'Warlock'].some(s => c.hasSub ? c.hasSub(s) : (c.subtypes || []).includes(s));
  E7.discover = async (g, p, n, src) => {
    const exiled = [];
    let hit = null;
    while (p.library.length) {
      const c = p.library.pop();
      c.zone = 'exile'; exiled.push(c);
      if (!c.is('Land') && c.mv <= n) { hit = c; break; }
    }
    if (hit) {
      const k = await p.controller.decide(g, {
        type: 'chooseOption', prompt: `Discover ${n}: ${hit.name} — baci besplatno ili u ruku?`,
        options: [{ key: 'cast', label: 'Baci besplatno' }, { key: 'hand', label: 'U ruku' }],
        aiHint: { kind: 'freeCastOrHand', card: hit },
      });
      if (k === 'cast') {
        hit.zone = 'nowhere';
        const ok = await g.castSpell(p, hit, { free: true, from: 'exile' });
        if (!ok) { hit.zone = 'hand'; p.hand.push(hit); }
      } else { hit.zone = 'hand'; p.hand.push(hit); }
    }
    // ostatak na dno u random redoslijedu
    const rest = exiled.filter(c => c !== hit && c.zone === 'exile');
    U.shuffle(rest, g.rnd);
    for (const c of rest) { c.zone = 'library'; p.library.unshift(c); }
    g.lg(`${p.name}: discover ${n}${hit ? ` → ${hit.name}` : ' (ništa)'}.`);
  };
  E7.clash = async (g, p) => {
    const opps = E.eachOpp(g, p).filter(o => o.library.length);
    const o = opps[0];
    const mine = p.library[p.library.length - 1];
    const theirs = o && o.library[o.library.length - 1];
    const mv1 = mine ? mine.mv : -1, mv2 = theirs ? theirs.mv : -1;
    g.lg(`Clash: ${p.name} (${mine ? mine.name : '—'} mv${mv1}) vs ${o ? o.name : '—'} (${theirs ? theirs.name : '—'} mv${mv2}).`);
    return mv1 > mv2;
  };
  // glasanje — "will of the council" (javno, redom)
  E7.vote = async (g, you, src, options, aiPick) => {
    const votes = new Map();
    const order = g.apnapFrom(you);
    for (const q of order) {
      if (q.lost) continue;
      const k = await q.controller.decide(g, {
        type: 'chooseOption', prompt: `${src.name}: glasaj`, options,
        aiHint: { kind: 'vote', src, options, voter: q, forWhom: you, aiPick },
      });
      votes.set(k, (votes.get(k) || 0) + 1);
      const opt = options.find(o => o.key === k);
      g.lg(`${q.name} glasa: ${opt ? opt.label : k}.`);
      votes['_by_' + q.idx] = k;
    }
    await g.emit('voteEnd', { src, by: you, votes, options });
    return votes;
  };
  // tajno glasanje — svi biraju bez uvida
  E7.secretVote = async (g, you, src, options) => {
    const picks = new Map();
    for (const q of g.alivePlayers()) {
      const k = await q.controller.decide(g, {
        type: 'chooseOption', prompt: `${src.name}: tajno glasaj`, options,
        aiHint: { kind: 'vote', src, options, voter: q, forWhom: you },
      });
      picks.set(q, k);
    }
    const votes = new Map();
    for (const [q, k] of picks) {
      votes.set(k, (votes.get(k) || 0) + 1);
      const opt = options.find(o => o.key === k);
      g.lg(`${q.name} je glasao: ${opt ? opt.label : k}.`);
      votes['_by_' + q.idx] = k;
    }
    await g.emit('voteEnd', { src, by: you, votes, options, secret: true, picks });
    return { votes, picks };
  };
  // ============================================================
  // THE RING — emblem koji stoji uz komandera i napreduje svaki put
  // kad te Prsten iskušava ("the Ring tempts you").
  // ------------------------------------------------------------
  // Pravila (CR 701.52 / LTR): emblem dobiješ PRIJE nego što izabereš
  // Ring-bearera. Sposobnosti se dobijaju redom odozgo nadolje i
  // kumulativne su — jednom stečena ostaje do kraja partije. Nivo staje
  // na 4, ali i dalje biraš (moguće i istog) Ring-bearera svaki put.
  // ============================================================
  E7.ringBearer = (g, p) => g.bf().find(c => c.ctrl === p && c.meta.ringBearer) || null;

  E7.ringEmblem = (g, p) => {
    let em = p.emblems.find(e => e.ring);
    if (em) return em;
    em = { ring: true, name: 'The Ring', level: 0 };
    // Nivo 1 — stalni efekat: Ring-bearer je legendaran i ne mogu ga
    // blokirati stvorenja veće snage.
    em.apply = (g2, pl, bf) => {
      if (em.level < 1) return;
      const rb = bf.find(c => c.ctrl === pl && c.meta.ringBearer);
      if (!rb) return;
      if (!rb.cur.super.includes('Legendary')) rb.cur.super.push('Legendary');
      const prev = rb.cur.cantBeBlockedBy;
      rb.cur.cantBeBlockedBy = (g3, blocker) =>
        (!!prev && prev(g3, blocker)) || blocker.power > rb.power;
    };
    p.emblems.push(em);
    return em;
  };

  // Trajni slušaoci: `once:false` bez `expires` preživi kraj poteza.
  E7.ringInstall = (g, p, lvl) => {
    const isBearer = c => !!c && c.ctrl === p && c.meta.ringBearer && c.zone === 'battlefield';

    if (lvl === 2) {
      // Kad god Ring-bearer napadne — vuci kartu, pa odbaci kartu.
      g.delayed.push({
        on: 'attacks', once: false, ctrl: p, name: 'The Ring: vuci pa odbaci',
        filter: (g2, d) => isBearer(d.card),
        run: async ctx => {
          await ctx.g.draw(p, 1);
          if (!p.hand.length) return;
          const pick = await p.controller.decide(ctx.g, {
            type: 'chooseCards', from: p.hand, min: 1, max: 1,
            prompt: 'The Ring: odbaci kartu', aiHint: { kind: 'addlDiscard' },
          });
          if (pick.length) await ctx.g.discard(p, pick);
        },
      });
    }

    if (lvl === 3) {
      // Kad god Ring-bearera blokira stvorenje — njegov vlasnik ga
      // žrtvuje na kraju borbe (okida se za svakog blokera posebno).
      g.delayed.push({
        on: 'becomesBlocked', once: false, ctrl: p, name: 'The Ring: bloker se žrtvuje',
        filter: (g2, d) => isBearer(d.attacker),
        run: async ctx => {
          for (const b of (ctx.data.blockers || []).slice()) {
            const iid = b.iid;
            ctx.g.delayed.push({
              on: 'endCombat', once: true, expires: 'eot', ctrl: b.ctrl,
              name: 'The Ring: žrtvuj blokera',
              run: async c2 => {
                const x = c2.g.byIid(iid);
                if (x && x.zone === 'battlefield') await c2.g.sacrifice(x.ctrl, x);
              },
            });
          }
        },
      });
    }

    if (lvl === 4) {
      // Kad god Ring-bearer nanese borbenu štetu igraču — svaki protivnik gubi 3 života.
      g.delayed.push({
        on: 'combatDamageToPlayer', once: false, ctrl: p, name: 'The Ring: −3 života',
        filter: (g2, d) => isBearer(d.card),
        run: async ctx => {
          for (const o of ctx.g.players) {
            if (o !== p && !o.lost) await ctx.g.loseLife(o, 3, 'The Ring');
          }
        },
      });
    }
  };

  E7.ringTempts = async (g, p) => {
    const em = E7.ringEmblem(g, p);              // 1) emblem prije izbora nosioca
    if (em.level < 4) {                          // 2) sljedeća sposobnost, kumulativno
      em.level++;
      E7.ringInstall(g, p, em.level);
    }
    p.ringLevel = em.level;
    const pool = g.creatures(p);                 // 3) izbor Ring-bearera (može i isti)
    if (pool.length) {
      const pick = await p.controller.decide(g, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Izaberi Ring-bearera', aiHint: { kind: 'ringBearer' },
      });
      if (pick[0]) {
        for (const c of g.bf()) if (c.ctrl === p) c.meta.ringBearer = false;
        pick[0].meta.ringBearer = true;
        g.lg(`💍 ${pick[0].name} je Ring-bearer (The Ring, nivo ${em.level}).`);
      }
    } else {
      g.lg(`💍 The Ring — nivo ${em.level} (nemaš stvorenja za Ring-bearera).`);
    }
    g.recalc();
    return E7.ringBearer(g, p);
  };

  // ============================================================
  // TURTLE POWER (TMC) — commander: Heroes in a Half Shell
  // ============================================================
  const MNT = (c) => ['Mutant', 'Ninja', 'Turtle'].some(s => c.hasSub(s));

  SC['Heroes in a Half Shell'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: '+1/+1 + karta',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && MNT(d.card),
      run: async ctx => {
        const c = ctx.data.card;
        ctx.g.addCounters(c, '+1/+1', 1);
        const key = '_hihs_' + ctx.g.turnNo + '_' + (ctx.data.player ? ctx.data.player.idx : 'x');
        if (!ctx.src.meta[key]) { ctx.src.meta[key] = true; await ctx.g.draw(ctx.you, 1); }
      },
    }],
  };
  SC["April O'Neil, Live on the Scene"] = {
    triggers: [{
      on: 'etb', desc: 'Investigate',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && MNT(d.card),
      run: async ctx => { await E.investigate(ctx.g, ctx.you, 1); },
    }],
  };
  SC['Baxter, Fly in the Ointment'] = {
    triggers: [
      {
        on: 'etb', desc: 'Flying counter-stvorenjima', filter: etbSelf,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (Object.keys(c.counters).some(k => c.counters[k] > 0)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
      {
        on: 'attacks', desc: 'Flying counter-stvorenjima', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (Object.keys(c.counters).some(k => c.counters[k] > 0)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
      {
        on: 'draw', desc: '+1/+1 na Baxtera', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
    ],
  };
  SC['Bebop, Skull & Crossbones'] = {
    triggers: [
      {
        on: 'etb', desc: 'Nađi Rocksteadyja', filter: etbSelf, opt: true,
        run: async ctx => {
          const c = ctx.you.library.find(x => x.name === 'Rocksteady, Mutant Marauder');
          if (c) { ctx.you.library.splice(ctx.you.library.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); U.shuffle(ctx.you.library, ctx.g.rnd); ctx.g.lg('Rocksteady u ruku.'); }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci X, izgubi X', filter: (g, self, d) => d.card === self, opt: true,
        run: async ctx => {
          const x = Object.values(ctx.src.counters).reduce((a, b) => a + b, 0);
          if (x > 0) { await ctx.g.draw(ctx.you, x); await ctx.g.loseLife(ctx.you, x, 'bebop'); }
        },
      },
    ],
  };
  SC['Big Mother Mouser'] = {
    etbCounters: { kind: '+1/+1', n: 2 },
    triggers: [
      {
        on: 'attacks', desc: 'Dupliraj countere', filter: (g, self, d) => d.card === self,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', ctx.src.counters['+1/+1'] || 0); },
      },
      {
        on: 'dies', desc: 'Roboti', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.makeTokens('robot11', ctx.you, { n: ctx.data.snap.plus1 || 0 }); },
      },
    ],
  };
  SC['Biogenic Ooze'] = {
    triggers: [
      { on: 'etb', desc: 'Ooze token', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('oozeG', ctx.you); } },
      {
        on: 'endStep', desc: '+1/+1 na Ooze', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) if (c.hasSub('Ooze')) ctx.g.addCounters(c, '+1/+1', 1); },
      },
    ],
    abilities: [{
      label: 'Ooze token', cost: { mana: '{1}{G}{G}{G}' },
      run: async ctx => { await ctx.g.makeTokens('oozeG', ctx.you); },
      aiScore: () => 4,
    }],
  };
  SC['Casey Jones, Back Alley Brute'] = {
    triggers: [
      {
        on: 'attacks', desc: '+1/+1 napadaču', filter: (g, self, d) => d.card === self,
        targets: [T.creature({ prompt: 'Napadač', filter: (g, c) => c.zone === 'battlefield' && c.attacking, aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
      {
        on: 'plusAdded', desc: 'Šteta protivniku',
        filter: (g, self, d) => d.card.ctrl === self.ctrl,
        targets: [T.opponent({ prompt: 'Kome šteta?', aiHint: { goal: 'drain' } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.damagePlayer(ctx.src, ctx.targets[0], ctx.data.n || 1); },
      },
    ],
  };
  SC['Humongous Fungus'] = {
    plusCountersAdjust: (n, g, card, self) => card.ctrl === self.ctrl ? n * 2 : n,
  };
  SC['Dimension X Pizzasaur'] = {
    triggers: [{
      on: 'etb', desc: '+2 countera → uništi', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+1 ×2', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        ctx.g.addCounters(t, '+1/+1', 2);
        const totalCounters = ctx.g.bf().filter(c => c.ctrl === ctx.you).reduce((s, c) => s + Object.values(c.counters).reduce((a, b) => a + b, 0), 0);
        const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you && c.mv <= totalCounters);
        if (cands.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Uništi stvorenje (mv ≤ ${totalCounters})`, aiHint: { kind: 'removalPick' },
          });
          if (pick[0]) await ctx.g.destroy(pick[0]);
        }
      },
    }],
    abilities: [{
      label: '3 života tebi, -3 svima', cost: { tap: true, sacSelf: true, mana: '{2}' },
      run: async ctx => {
        await ctx.g.gainLife(ctx.you, 3);
        for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 3, 'pizzasaur');
      },
      aiScore: (g, c, p) => E.eachOpp(g, p).some(o => o.life <= 6) ? 9 : 2,
    }],
  };
  SC['Donatello, the Brains'] = {
    replace: [{
      event: 'createToken',
      run: (g, defs, ctrl, src) => defs.concat([TK.mutagen]),
      priority: 5,
    }],
  };
  SC['Electric Seaweed'] = {
    triggers: [{
      on: 'etb', desc: 'Do kraja poteza: smrt → 1 šteta', filter: etbSelf,
      run: async ctx => {
        const iid = ctx.src.iid;
        ctx.g.delayed.push({
          on: 'dies', once: false, expires: 'eot', name: 'Electric Seaweed', ctrl: ctx.you,
          filter: (g, d) => true,
          run: async c2 => {
            const self = c2.g.byIid(iid);
            if (!self || self.zone !== 'battlefield') return;
            for (const c of c2.g.bf().filter(x => x.is('Creature') && !x.hasSub('Wall')).slice()) await c2.g.damageCreature(self, c, 1);
          },
        });
      },
    }],
    abilities: [{
      label: '1 šteta bilo čemu', cost: { tap: true },
      targets: [T.any({ prompt: '1 šteta', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
    }],
  };
  SC['Irma, Part-Time Mutant'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Kopiraj stvorenje', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      targets: [T.yourCreature({ prompt: 'Kopiraj', upTo: true, filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (t && t !== ctx.src) {
          const base = t.isCopyOf || t.def;
          ctx.src.isCopyOf = base;
          const merged = Object.assign({}, base, { name: 'Irma, Part-Time Mutant', triggers: (base.triggers || []).concat(SC['Irma, Part-Time Mutant'].triggers) });
          ctx.src.def = merged;
          ctx.g.lg(`Irma kopira: ${t.name}.`);
          ctx.g.recalc();
        }
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Krang, the All-Powerful'] = {
    doubleDrawTriggers: true,
    triggers: [{
      on: 'draw', desc: '+1/+1 (druga karta)', filter: (g, self, d) => d.nth === 2,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };
  SC['Leatherhead, Iron Gator'] = {
    triggers: [{
      on: 'attacks', desc: '+2 countera svima', filter: (g, self, d) => d.card === self,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 2); },
    }],
  };
  SC['Leonardo, the Balance'] = {
    triggers: [{
      on: 'tokensCreated', desc: '+1/+1 svima (1×/potez)', oncePerTurn: true, opt: true,
      filter: (g, self, d) => d.ctrl === self.ctrl,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); },
    }],
    abilities: [{
      label: 'Menace+trample+lifelink svima', cost: { mana: '{W}{U}{B}{R}{G}' },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['menace', 'trample', 'lifelink']); },
      aiScore: (g, c, p) => g.combat || g.phase === 'main1' ? 5 : 1,
    }],
  };
  SC['Lita, Little Orphan Amphibian'] = {
    triggers: [{
      on: 'etb', desc: 'Alliance',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature'),
      run: async ctx => {
        const key = '_lita_' + ctx.g.turnNo;
        ctx.src.meta[key] = ctx.src.meta[key] || [];
        const used = ctx.src.meta[key];
        const opts = [
          { key: 'counter', label: '+1/+1 na Litu' },
          { key: 'food', label: 'Food token' },
          { key: 'scry', label: 'Scry 1' },
        ].filter(o => !used.includes(o.key));
        if (!opts.length) return;
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Lita — Alliance: izaberi', options: opts, aiHint: { kind: 'mode' },
        });
        used.push(k);
        if (k === 'counter') ctx.g.addCounters(ctx.src, '+1/+1', 1);
        else if (k === 'food') await ctx.g.makeTokens('food', ctx.you);
        else await E.scry(ctx.g, ctx.you, 1);
      },
    }],
  };
  SC['Michelangelo, the Heart'] = {
    triggers: [{
      on: 'postcombatMain', desc: 'Raid: +1/+1 + Food',
      filter: (g, self, d) => d.player === self.ctrl && self.ctrl.turnState.attacked,
      targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1);
        await ctx.g.makeTokens('food', ctx.you);
      },
    }],
  };
  SC['Mona Lisa, Science Geek'] = {
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => { const x = Math.max(0, c.power); return x > 0 ? [{ ANY: true, n: x }] : []; },
    },
  };
  SC['Raphael, the Muscle'] = {
    replace: [{
      event: 'damage',
      run: (g, ev, src) => {
        if (ev.src && ev.src.is && ev.src.is('Creature') && ev.src.ctrl === src.ctrl &&
          Object.values(ev.src.counters || {}).some(v => v > 0)) return ev.n * 2;
        return ev.n;
      },
    }],
    triggers: [{ on: 'etb', desc: 'Mutagen', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('mutagen', ctx.you); } }],
  };
  SC['Rat King, Pale Piper'] = {
    triggers: [{
      on: 'lto', desc: 'Rat token',
      filter: (g, self, d) => (d.card === self || (d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken)),
      run: async ctx => { await ctx.g.makeTokens('rat', ctx.you); },
    }],
    abilities: [{
      label: 'Sac token: vuci', cost: { mana: '{2}', sac: (g, x, c) => x.isToken },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      aiScore: (g, c, p) => g.creatures(p).filter(x => x.isToken).length > 2 ? 4 : 1,
    }],
  };
  SC['Ray Fillet, Wave Warrior'] = {
    triggers: [
      {
        on: 'etb', desc: 'Evolve',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') &&
          (d.card.power > self.power || d.card.toughness > self.toughness),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Vuci kartu',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && Object.values(d.card.counters || {}).some(v => v > 0),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Roadkill Rodney'] = {
    squad: '{3}',
    triggers: [
      {
        on: 'etb', desc: 'Squad kopije', filter: etbSelf,
        run: async ctx => {
          const n = ctx.src.meta.paidTimes || 0;
          if (n > 0) await ctx.g.copyPermanentToken(ctx.src, ctx.you, { n });
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Mutagen', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.makeTokens('mutagen', ctx.you); },
      },
    ],
  };
  SC['Rocksteady, Mutant Marauder'] = {
    triggers: [
      {
        on: 'etb', desc: 'Nađi Bebopa', filter: etbSelf, opt: true,
        run: async ctx => {
          const c = ctx.you.library.find(x => x.name === 'Bebop, Skull & Crossbones');
          if (c) { ctx.you.library.splice(ctx.you.library.indexOf(c), 1); c.zone = 'hand'; ctx.you.hand.push(c); U.shuffle(ctx.you.library, ctx.g.rnd); ctx.g.lg('Bebop u ruku.'); }
        },
      },
      {
        on: 'etb', desc: '+1/+1 counter',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature') && !d.card.isToken,
        targets: [T.creature({ prompt: '+1/+1', aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
    ],
  };
  SC['Shredder, Shadow Master'] = {
    triggers: [
      {
        on: 'attacks', desc: 'Kopije na ostale', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player,
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            if (o === ctx.src.attacking) continue;
            const made = await ctx.g.copyPermanentToken(ctx.src, ctx.you, { tapped: true, attacking: o });
            for (const m of made) m.meta.exileEndCombat = true;
          }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Pola života', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const pl = ctx.data.player;
          if (pl && !pl.lost) await ctx.g.loseLife(pl, Math.ceil(pl.life / 2), 'shredder');
        },
      },
    ],
  };
  SC['Splinter, the Mentor'] = {
    triggers: [{
      on: 'lto', desc: 'Mutagen',
      filter: (g, self, d) => (d.card === self || (d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken)),
      run: async ctx => { await ctx.g.makeTokens('mutagen', ctx.you); },
    }],
  };
  SC['Slash Clone'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    abilities: [{
      label: 'Uništi artefakt/enchantment', cost: { mana: '{2}{G}', rmCounter: { kind: '+1/+1', n: 1 } },
      targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Meta', aiHint: { goal: 'removal' } })],
      run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Tempestra, Dame of Games'] = {
    abilities: [{
      label: 'Kopija stvorenja (haste, sac EOT)', cost: { tap: true, mana: '{2}{R}', sac: (g, x, c) => x.is('Artifact') },
      targets: [T.yourCreature({ prompt: 'Kopiraj', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t === ctx.src) return;
        const made = await ctx.g.copyPermanentToken(t, ctx.you, { haste: true });
        E7.sacAtNextEnd(ctx.g, made, ctx.you);
      },
      aiScore: (g, c, p) => g.creatures(p).some(x => x.power >= 4) ? 5 : 1,
    }],
  };
  SC['Tokka & Rahzar, Unsupervised'] = {
    triggers: [{
      on: 'lto', desc: '+1/+1 + Treasure', oncePerTurn: true,
      filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.types.includes('Creature') && !d.snap.isToken && d.card !== self,
      run: async ctx => {
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
        await ctx.g.makeTokens('treasure', ctx.you);
      },
    }],
  };
  SC['Heralds of the Shredder'] = {
    replace: [{
      event: 'damage',
      run: (g, ev, src) => {
        if (ev.target && ev.target !== src && ev.target.ctrl === src.ctrl && ev.target.is && ev.target.is('Creature')) {
          g.addCounters(ev.target, '+1/+1', ev.n);
          g.lg(`${src.name}: šteta spriječena → +${ev.n} countera na ${ev.target.name}.`);
          return 0;
        }
        return ev.n;
      },
    }],
    triggers: [{
      on: 'lto', desc: 'U library', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone === 'graveyard') {
          ctx.you.graveyard.splice(ctx.you.graveyard.indexOf(c), 1);
          c.zone = 'library'; ctx.you.library.push(c);
          U.shuffle(ctx.you.library, ctx.g.rnd);
          ctx.g.lg(`${c.name} se miješa u library.`);
        }
      },
    }],
  };
  SC['Aggro Amalgam'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    triggers: [{
      on: 'etb', desc: 'Dupliraj ili fight', filter: etbSelf,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Aggro Amalgam: izaberi',
          options: [{ key: 'dbl', label: 'Dupliraj +1/+1 countere' }, { key: 'fight', label: 'Fight' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 'dbl') ctx.g.addCounters(ctx.src, '+1/+1', ctx.src.counters['+1/+1'] || 0);
        else {
          const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
          if (cands.length) {
            const pick = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Fight koga?', aiHint: { kind: 'removalPick' },
            });
            const t = pick[0];
            if (t) {
              await ctx.g.damageCreature(ctx.src, t, ctx.src.power);
              await ctx.g.damageCreature(t, ctx.src, t.power);
            }
          }
        }
      },
    }],
  };
  SC['Continue?'] = {
    resolve: async ctx => {
      const diedNames = new Set(ctx.g.diedThisTurn.filter(s => s.owner === ctx.you).map(s => s.name));
      const pool = ctx.you.graveyard.filter(c => c.is('Creature') && diedNames.has(c.name));
      if (!pool.length) { ctx.g.lg('Continue?: nema stvorenja umrlih ovaj potez.'); return; }
      const pick = await ctx.you.controller.decide(ctx.g, {
        type: 'chooseCards', from: pool, min: 0, max: 4, prompt: 'Vrati na battlefield', aiHint: { kind: 'reanimate' },
      });
      for (const c of pick) await ctx.g.move(c, 'battlefield', { ctrl: ctx.you });
    },
  };
  SC['Double Jump'] = {
    kicker: { cost: '{1}{R}' }, // fuse: Flying Kick
    targets: [T.yourCreature({ prompt: 'Flying counter + 5/5', aiHint: { goal: 'buff' } })],
    resolve: async ctx => {
      const t = ctx.targets[0];
      if (t) {
        ctx.g.addCounters(t, 'flying', 1);
        const iid = t.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'basePT',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (c) { c.cur.basePower = 5; c.cur.baseToughness = 5; c.cur.kw.add('flying'); }
          },
        });
        ctx.g.recalc();
      }
      if (ctx.kicked) {
        const mine = ctx.g.creatures(ctx.you);
        const opps = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (mine.length && opps.length) {
          const a = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Flying Kick: tvoje stvorenje', aiHint: { kind: 'fightMine' } }))[0];
          const b = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: opps, min: 1, max: 1, prompt: 'Flying Kick: meta', aiHint: { kind: 'removalPick' } }))[0];
          if (a && b) await ctx.g.damageCreature(a, b, a.power);
        }
      }
    },
  };
  SC['Shellshock'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (x <= 0) return;
      let made = 0;
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const cands = ctx.g.creatures(o);
        if (!cands.length) continue;
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Shellshock: meta kod ${o.name} (${x} štete)`, aiHint: { kind: 'removalPick' },
        });
        if (pick[0]) { await ctx.g.damageCreature(ctx.src, pick[0], x); made++; }
      }
      if (made) await ctx.g.makeTokens('mutagen', ctx.you, { n: made });
    },
  };
  SC['Special Move'] = {
    modes: {
      pick: 2,
      list: [
        { label: 'Jump Kick: uništi artefakt', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artefakt', aiHint: { goal: 'removal' } })] },
        { label: 'Dash Attack: +2 countera na napadača/blokera', targets: [T.yourCreature({ prompt: 'Napadač/bloker', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && (c.attacking || c.blocking), aiHint: { goal: 'buff' } })] },
        { label: 'Foot Toss: šteta pa žrtvuj', targets: [T.yourCreature({ prompt: 'Bacač', aiHint: { goal: 'buff' } }), T.any({ prompt: 'Meta', aiHint: { goal: 'removal' } })] },
      ],
    },
    resolve: async ctx => {
      let ti = 0;
      for (const mi of ctx.mode || []) {
        if (mi === 0) { const t = ctx.targets[ti++]; if (t) await ctx.g.destroy(t); }
        else if (mi === 1) { const t = ctx.targets[ti++]; if (t) ctx.g.addCounters(t, '+1/+1', 2); }
        else {
          const a = ctx.targets[ti++], b = ctx.targets[ti++];
          if (a && b && a !== b) { await ctx.g.damageAny(a, b, a.power); await ctx.g.sacrifice(ctx.you, a); }
        }
      }
    },
  };
  SC['Swift Demise'] = {
    targets: [T.creature({ prompt: '1 šteta', aiHint: { goal: 'removal', dmg: 1 } })],
    resolve: async ctx => {
      if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 1);
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you && c.damage > 0).slice()) {
        await ctx.g.destroy(c);
      }
    },
  };
  SC['Fast Forward'] = {
    selfCostAdjust: (g, card, p) => {
      let n = 0;
      for (const o of E.eachOpp(g, p)) if ((o.turnState.attackedMe || []).includes(p)) n++;
      return -n;
    },
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you)) E.goad(ctx.g, c, ctx.you);
      ctx.g.lg('Fast Forward: svi protivnički goadovani!');
    },
  };
  SC['Game Over'] = {
    selfCostAdjust: (g, card, p) => g.alivePlayers().some(q => q.life <= 20) ? -2 : 0,
    resolve: async ctx => { for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.destroy(c); },
  };
  SC['Here Comes a New Hero!'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      await ctx.g.draw(ctx.you, x);
      const cands = ctx.g.bf().filter(c => c.is('Creature') && c.mv <= x);
      if (cands.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands, min: 0, max: 1, prompt: `Kopiraj stvorenje (mv ≤ ${x})`, aiHint: { kind: 'mirrorCopy' },
        });
        if (pick[0]) await ctx.g.copyPermanentToken(pick[0], ctx.you, {});
      }
    },
  };
  SC['Lessons from Life'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 3);
      const lands = ctx.you.hand.filter(c => c.is('Land'));
      if (lands.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Land na battlefield (tapped)?', aiHint: { kind: 'rampPick' },
        });
        if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you, tapped: true });
      }
    },
  };
  SC['Super Combo'] = {
    multikicker: '{2}', // replicate
    resolve: async ctx => {
      const times = 1 + (ctx.so && ctx.so.squadN || 0);
      for (let i = 0; i < times; i++) {
        const mine = ctx.g.creatures(ctx.you);
        const opps = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (!mine.length || !opps.length) break;
        const a = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Super Combo: tvoje stvorenje', aiHint: { kind: 'fightMine' } }))[0];
        const b = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: opps, min: 1, max: 1, prompt: 'Super Combo: meta', aiHint: { kind: 'removalPick' } }))[0];
        if (a && b) await ctx.g.damageCreature(a, b, a.power);
      }
    },
  };
  SC['Vanquish the Horde'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.is('Creature')).length,
    resolve: async ctx => { for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.destroy(c); },
  };
  SC['Wave Goodbye'] = {
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !(c.counters['+1/+1'] > 0)).slice()) {
        await ctx.g.move(c, 'hand');
      }
    },
  };
  SC['Arcade Cabinet'] = {
    triggers: [{
      on: 'etb', desc: '+1/+1 do 4 stvorenja', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+1 (do 4)', count: 4, upTo: true, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const ts = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
        for (const t of ts) ctx.g.addCounters(t, '+1/+1', 1);
      },
    }],
    abilities: [{
      label: 'Dupliraj countere', cost: { tap: true, mana: '{2}', sac: (g, x, c) => x.isToken },
      targets: [T.creature({ prompt: 'Dupliraj countere', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        for (const k of Object.keys(t.counters)) if (t.counters[k] > 0) ctx.g.addCounters(t, k, t.counters[k]);
      },
      aiScore: (g, c, p) => 4,
    }],
  };
  SC['Chromatic Lantern'] = {
    grantMana: { filter: (g, x) => x.is('Land'), produce: [{ ANY: true, n: 1 }] },
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
  };
  SC['Coin of Mastery'] = {
    replace: [{
      event: 'etbCounters',
      run: (g, card, src) => card.ctrl === src.ctrl && card.is('Creature') && (card.castMeta?.artifactManaSpent || 0) > 0,
      n: (g, card) => card.castMeta?.artifactManaSpent || 0,
    }],
    abilities: [{
      label: 'Treasure', cost: { tap: true },
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
      aiScore: () => 3,
    }],
  };
  SC['Everything Pizza'] = {
    triggers: [{
      on: 'etb', desc: 'Basic u ruku', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { toHandN: 1, toHand: true }); },
    }],
    abilities: [{
      label: 'SVE (5 boja)', cost: { tap: true, sacSelf: true, mana: '{2}{W}{U}{B}{R}{G}' },
      targets: [T.any({ prompt: '3 štete', aiHint: { goal: 'removal', dmg: 3 } })],
      run: async ctx => {
        await ctx.g.gainLife(ctx.you, 3);
        await ctx.g.draw(ctx.you, 1);
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          if (o.hand.length) {
            const pick = await o.controller.decide(ctx.g, { type: 'chooseCards', from: o.hand, min: 1, max: 1, prompt: 'Odbaci', aiHint: { kind: 'cleanupDiscard' } });
            await ctx.g.discard(o, pick);
          }
        }
        if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], 3);
        const mine = ctx.g.creatures(ctx.you);
        if (mine.length) {
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: mine, min: 0, max: 1, prompt: '+3 countera', aiHint: { kind: 'buffPick' } });
          if (pick[0]) ctx.g.addCounters(pick[0], '+1/+1', 3);
        }
      },
      aiScore: () => 8,
    }],
  };
  SC['Exploding Barrel'] = {
    mana: { cost: { tap: true, counter: 'pressure' }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: '20 šteta stvorenju', sorcery: true,
      cost: { tap: true, sacSelf: true, mana: (g, c) => '{' + Math.max(0, 8 - (c.counters['pressure'] || 0)) + '}' },
      targets: [T.creature({ prompt: '20 šteta', aiHint: { goal: 'removal', dmg: 20 } })],
      run: async ctx => { await ctx.g.damageCreature(ctx.src, ctx.targets[0], 20); },
      aiScore: (g, c, p) => g.bf().some(x => x.is('Creature') && x.ctrl !== p && x.power >= 5) ? 7 : 2,
    }],
  };
  SC['Foot Chopper'] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) host.cur.kw.add('flying');
      },
    }],
    triggers: [
      {
        on: 'etb', desc: 'Ninja token + attach', filter: etbSelf,
        run: async ctx => {
          const made = await ctx.g.makeTokens('ninjaB', ctx.you);
          if (made[0]) await ctx.g.attach(ctx.src, made[0]);
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Sac → vuci', opt: true,
        filter: (g, self, d) => self.attachedTo === d.card.iid,
        run: async ctx => {
          const host = ctx.g.byIid(ctx.src.attachedTo);
          if (!host) return;
          const n = host.power;
          await ctx.g.sacrifice(ctx.you, host);
          await ctx.g.draw(ctx.you, n);
        },
      },
    ],
  };
  SC['Mole Module'] = {
    crew: 2,
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Mill 4 → permanent', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const milled = await ctx.g.mill(ctx.you, 4);
        const perms = milled.filter(c => c.zone === 'graveyard' && (c.is('Creature') || c.is('Artifact') || c.is('Enchantment') || c.is('Land') || c.is('Planeswalker')));
        if (perms.length) {
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: perms, min: 0, max: 1, prompt: 'Permanent na battlefield', aiHint: { kind: 'reanimate' },
          });
          if (pick[0]) await ctx.g.move(pick[0], 'battlefield', { ctrl: ctx.you });
        }
      },
    }],
  };
  SC['Endless Foot Assault'] = {
    squad: '{1}{W}',
    triggers: [
      {
        on: 'etb', desc: 'Squad kopije', filter: etbSelf,
        run: async ctx => {
          const n = ctx.src.meta.paidTimes || 0;
          if (n > 0) await ctx.g.copyPermanentToken(ctx.src, ctx.you, { n });
        },
      },
      {
        on: 'attackersDeclared', desc: 'Ninje napadaju', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            await ctx.g.makeTokens('ninjaB', ctx.you, { tapped: true, attacking: o });
          }
        },
      },
    ],
  };
  SC['High Score'] = {
    plusCountersAdjust: (n, g, card, self) => card.ctrl === self.ctrl ? n + 1 : n,
    triggers: [{
      on: 'endStep', desc: 'Vuci ako imaš najjače', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => {
        const best = Math.max(0, ...ctx.g.bf().filter(c => c.is('Creature')).map(c => c.power));
        if (ctx.g.creatures(ctx.you).some(c => c.power >= best && best > 0)) await ctx.g.draw(ctx.you, 1);
      },
    }],
  };
  SC['Level Up'] = {
    aura: true,
    auraTarget: [T.creature({ prompt: 'Enchant creature', aiHint: { goal: 'buff' } })],
    triggers: [
      {
        on: 'etb', desc: '+1/+1', filter: etbSelf,
        run: async ctx => {
          const host = ctx.g.byIid(ctx.src.attachedTo);
          if (host) ctx.g.addCounters(host, '+1/+1', 1);
        },
      },
      {
        on: 'attacks', desc: 'Dupliraj countere',
        filter: (g, self, d) => d.card.iid === self.attachedTo,
        run: async ctx => {
          const host = ctx.g.byIid(ctx.src.attachedTo);
          if (!host) return;
          ctx.g.addCounters(host, '+1/+1', host.counters['+1/+1'] || 0);
          if (host.power >= 10) await ctx.g.draw(ctx.you, 1);
        },
      },
    ],
  };
  SC['Ninja Pizza'] = {
    // "Foods you control have '{T}, Sacrifice this artifact: Add one mana of any color.'"
    grantMana: { filter: (g, x) => x.hasSub('Food'), cost: { tap: true, sacSelf: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{
      on: 'postcombatMain', desc: 'Food', filter: (g, self, d) => d.player === self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('food', ctx.you); },
    }],
  };
  SC['Together Forever'] = {
    triggers: [{
      on: 'etb', desc: 'Support 2', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+1 (do 2)', count: 2, upTo: true, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const ts = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
        for (const t of ts) ctx.g.addCounters(t, '+1/+1', 1);
      },
    }],
    abilities: [{
      label: 'Štit: vrati u ruku pri smrti', cost: { mana: '{1}' },
      targets: [T.creature({ prompt: 'Stvorenje s counterom', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && Object.values(c.counters).some(v => v > 0), aiHint: { goal: 'protect' } })],
      run: async ctx => {
        const iid = ctx.targets[0].iid;
        ctx.g.delayed.push({
          on: 'dies', expires: 'eot', name: 'Together Forever', ctrl: ctx.you,
          filter: (g, d) => d.card.iid === iid,
          run: async c2 => {
            const c = c2.data.card;
            if (c.zone === 'graveyard') {
              c.owner.graveyard.splice(c.owner.graveyard.indexOf(c), 1);
              c.zone = 'hand'; c.owner.hand.push(c);
              c2.g.lg(`${c.name} se vraća u ruku (Together Forever).`);
            }
          },
        });
      },
      aiScore: () => 2,
    }],
  };

  // ============================================================
  // MARDU SURGE (TDC) — commander: Zurgo Stormrender
  // ============================================================
  SC['Zurgo Stormrender'] = {
    triggers: [
      {
        on: 'attacks', desc: 'Mobilize 1', filter: (g, self, d) => d.card === self,
        run: async ctx => { await E7.mobilize(ctx.g, ctx.src, 1); },
      },
      {
        on: 'lto', desc: 'Token ode → karta/šteta',
        filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.isToken && d.snap.types.includes('Creature'),
        run: async ctx => {
          if (ctx.data.snap.attacking) await ctx.g.draw(ctx.you, 1);
          else for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 1, 'zurgo');
        },
      },
    ],
  };
  SC['Adeline, Resplendent Cathar'] = {
    cdaPower: (g, c) => g.creatures(c.ctrl).length,
    triggers: [{
      on: 'attackersDeclared', desc: 'Humani napadaju', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          await ctx.g.makeTokens('humanW', ctx.you, { tapped: true, attacking: o });
        }
      },
    }],
  };
  SC['Ainok Strike Leader'] = {
    triggers: [{
      on: 'attacks', desc: 'Goblini napadaju', oncePerTurn: true,
      filter: (g, self, d) => d.card === self || (d.card.commander && d.card.ctrl === self.ctrl),
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          await ctx.g.makeTokens('goblin', ctx.you, { tapped: true, attacking: o });
        }
      },
    }],
    abilities: [{
      label: 'Sac: tokeni indestructible', cost: { sacSelf: true },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c.isToken) E.grantUntilEOT(ctx.g, c, ['indestructible']);
      },
      aiScore: (g, c, p) => 0.5,
    }],
  };
  SC['Angel of Invention'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c !== self && c.is('Creature')) { c.cur.power++; c.cur.toughness++; }
      },
    }],
    triggers: [{
      on: 'etb', desc: 'Fabricate 2', filter: etbSelf,
      run: async ctx => {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Fabricate 2:',
          options: [{ key: 'c', label: '2× +1/+1 counter' }, { key: 't', label: '2× Servo token' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 'c') ctx.g.addCounters(ctx.src, '+1/+1', 2);
        else await ctx.g.makeTokens('servo', ctx.you, { n: 2 });
      },
    }],
  };
  SC["Aron, Benalia's Ruin"] = {
    abilities: [{
      label: 'Sac: +1/+1 svima', cost: { tap: true, mana: '{W}{B}', sacCreature: true, sacOther: true },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); },
      aiScore: (g, c, p) => g.creatures(p).length >= 4 && g.creatures(p).some(x => x.isToken) ? 5 : 0.5,
    }],
  };
  SC['Beetleback Chief'] = {
    triggers: [{ on: 'etb', desc: '2 goblina', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('goblin', ctx.you, { n: 2 }); } }],
  };
  SC['Bone Devourer'] = {
    etbCounters: { kind: '+1/+1', n: (g) => g.diedThisTurn.filter(s => s.types.includes('Creature')).length },
    triggers: [{
      on: 'dies', desc: 'Vuci X, izgubi X', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const x = ctx.data.snap.plus1 || 0;
        if (x > 0) { await ctx.g.draw(ctx.you, x); await ctx.g.loseLife(ctx.you, x, 'devourer'); }
      },
    }],
  };
  SC['Emeria Angel'] = {
    triggers: [{
      on: 'landfall', desc: 'Bird', filter: (g, self, d) => d.ctrl === self.ctrl, opt: true,
      run: async ctx => { await ctx.g.makeTokens('birdW', ctx.you); },
    }],
  };
  SC['Gix, Yawgmoth Praetor'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Plati 1 → karta',
      filter: (g, self, d) => d.player && d.player.lost === false && E.eachOpp(g, self.ctrl).includes(d.player) || (d.player !== d.card.ctrl && d.player !== self.ctrl ? false : false),
      run: async ctx => {
        // bilo čije stvorenje udari NEKOG od tvojih protivnika → kontrolor može platiti 1 život za kartu
        const d = ctx.data;
        const hitter = d.card.ctrl;
        if (hitter.lost || d.player === undefined) return;
        const yes = await hitter.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Gix: plati 1 život → vuci kartu?',
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'gixDraw' },
        });
        if (yes === 'yes') { await ctx.g.loseLife(hitter, 1, 'gix'); await ctx.g.draw(hitter, 1); }
      },
    }],
  };
  SC['Goldlust Triad'] = {
    kws: ['myriad'],
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Treasure', filter: (g, self, d) => d.card === self,
      run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you); },
    }],
  };
  SC['Goldnight Commander'] = {
    triggers: [{
      on: 'etb', desc: '+1/+1 svima (EOT)',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature'),
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 1, 1); },
    }],
  };
  SC['Grenzo, Havoc Raiser'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Goad ili ukradi kartu',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      run: async ctx => {
        const victim = ctx.data.player;
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Grenzo: izaberi',
          options: [{ key: 'goad', label: 'Goad njegovo stvorenje' }, { key: 'steal', label: 'Egzilaj vrh — smiješ bacati' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 'goad') {
          const cands = ctx.g.creatures(victim);
          if (cands.length) {
            const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: 'Goad', aiHint: { kind: 'goadPick' } });
            if (pick[0]) E.goad(ctx.g, pick[0], ctx.you);
          }
        } else if (victim && victim.library.length) {
          const c = victim.library.pop();
          c.zone = 'exile'; victim.exile.push(c);
          ctx.g.lg(`Grenzo egzilira ${c.name} — ${ctx.you.name} smije baciti do kraja poteza.`);
          if (!c.is('Land') && ctx.g.canPayMana(ctx.you, U.parseCost(c.def.cost || ''))) {
            const yes = await ctx.you.controller.decide(ctx.g, {
              type: 'chooseOption', prompt: `Baci ${c.name}?`, options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
              aiHint: { kind: 'freeCast' },
            });
            if (yes === 'yes') {
              victim.exile.splice(victim.exile.indexOf(c), 1);
              c.zone = 'nowhere';
              const ok = await ctx.g.castSpell(ctx.you, c, { from: 'exile', asThoughAnyColor: true });
              if (!ok) { c.zone = 'exile'; victim.exile.push(c); }
            }
          }
        }
      },
    }],
  };
  SC['Hero of Bladehold'] = {
    triggers: [{
      on: 'attacks', desc: 'Battle cry + 2 vojnika', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.attacking) E.pumpUntilEOT(ctx.g, c, 1, 0);
        if (ctx.src.attacking) await ctx.g.makeTokens('soldierW', ctx.you, { n: 2, tapped: true, attacking: ctx.src.attacking });
      },
    }],
  };
  SC['Ironwill Forger'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Myriad nelegendarnom',
      filter: (g, self, d) => d.player === self.ctrl && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      targets: [T.yourCreature({ prompt: 'Myriad do kraja poteza', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && !(c.cur.super || []).includes('Legendary'), aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.targets[0]) {
          E.grantUntilEOT(ctx.g, ctx.targets[0], ['myriad']);
          ctx.g.lg(`${ctx.targets[0].name} dobija myriad.`);
        }
      },
    }],
  };
  SC['Legion Warboss'] = {
    triggers: [
      {
        on: 'beginCombat', desc: 'Goblin (haste, napada)', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const made = await ctx.g.makeTokens('goblin', ctx.you, { haste: true });
          if (made[0]) made[0].meta.mustAttack = true;
        },
      },
      {
        on: 'attacks', desc: 'Mentor', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const cands = ctx.g.creatures(ctx.you).filter(c => c.attacking && c.power < ctx.src.power);
          if (cands.length) ctx.g.addCounters(cands[0], '+1/+1', 1);
        },
      },
    ],
  };
  SC['Loyal Apprentice'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Thopter',
      filter: (g, self, d) => d.player === self.ctrl && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      run: async ctx => { await ctx.g.makeTokens('thopter', ctx.you, { haste: true }); },
    }],
  };
  SC['Mindblade Render'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Warrior → karta', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.hasSub('Warrior') && d.player !== self.ctrl,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'render'); },
    }],
  };
  SC['Myr Battlesphere'] = {
    triggers: [
      { on: 'etb', desc: '4 Myra', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('myr', ctx.you, { n: 4 }); } },
      {
        on: 'attacks', desc: 'Tap Myre → +X', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const myrs = ctx.g.creatures(ctx.you).filter(c => c.hasSub('Myr') && !c.tapped && c !== ctx.src);
          if (!myrs.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: myrs, min: 0, max: myrs.length, prompt: 'Tapuj Myre (+X/+0 i X štete)', aiHint: { kind: 'crew' },
          });
          const x = pick.length;
          if (!x) return;
          for (const m of pick) m.tapped = true;
          E.pumpUntilEOT(ctx.g, ctx.src, x, 0);
          if (ctx.src.attacking instanceof MTG.Player) await ctx.g.damagePlayer(ctx.src, ctx.src.attacking, x);
        },
      },
    ],
  };
  SC['Neriv, Crackling Vanguard'] = {
    triggers: [
      { on: 'etb', desc: '2 goblina', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('goblin', ctx.you, { n: 2 }); } },
      {
        on: 'attacks', desc: 'Egzilaj = različiti tokeni', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const names = new Set(ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken).map(c => c.name));
          const n = names.size;
          for (let i = 0; i < n && ctx.you.library.length; i++) {
            const c = ctx.you.library.pop();
            c.zone = 'exile'; ctx.you.exile.push(c);
            c.meta = c.meta || {};
            c.meta.playableBy = ctx.you;
            c.meta.playableUntil = 9999;
            c.meta.playableCondition = (g, player) => !!player.turnState.attackedWithCommander;
            ctx.g.lg(`Neriv egzilira: ${c.name} (igraj u potezu napada commanderom).`);
          }
        },
      },
    ],
  };
  SC['Ogre Battledriver'] = {
    triggers: [{
      on: 'etb', desc: '+2/+0 i haste',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature'),
      run: async ctx => {
        const c = ctx.data.card;
        E.pumpUntilEOT(ctx.g, c, 2, 0, ['haste']);
        c.meta.tempHaste = true;
      },
    }],
  };
  SC['Ophiomancer'] = {
    triggers: [{
      on: 'upkeep', desc: 'Snake', filter: (g, self, d) => d.player === self.ctrl && !g.creatures(self.ctrl).some(c => c.hasSub('Snake')),
      run: async ctx => { await ctx.g.makeTokens('snakeB', ctx.you); },
    }],
  };
  SC['Redoubled Stormsinger'] = {
    triggers: [{
      on: 'attacks', desc: 'Kopiraj nove tokene', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        if (!ctx.src.attacking) return;
        const fresh = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && c.is('Creature') && c.meta._enteredTurn === ctx.g.turnNo);
        const madeAll = [];
        for (const t of fresh.slice(0, 6)) {
          const made = await ctx.g.copyPermanentToken(t, ctx.you, { tapped: true, attacking: ctx.src.attacking });
          madeAll.push(...made);
        }
        if (madeAll.length) E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
      },
    }],
  };
  SC['Thalisse, Reverent Medium'] = {
    triggers: [{
      on: 'endStep', desc: 'Spiriti = tokeni napravljeni',
      filter: (g, self, d) => true,
      run: async ctx => {
        const x = ctx.you.turnState.tokensCreated || 0;
        if (x > 0) await ctx.g.makeTokens('spiritW', ctx.you, { n: x });
      },
    }],
  };
  SC['Twilight Drover'] = {
    triggers: [{
      on: 'lto', desc: '+1/+1', filter: (g, self, d) => d.snap.isToken && d.snap.types.includes('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    abilities: [{
      label: '2 Spirita', cost: { mana: '{2}{W}', rmCounter: { kind: '+1/+1', n: 1 } },
      run: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you, { n: 2 }); },
      aiScore: () => 4,
    }],
  };
  SC['Viscera Seer'] = {
    abilities: [{
      label: 'Sac: scry 1', cost: { sacCreature: true },
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
      aiScore: (g, c, p) => 0.3,
    }],
  };
  SC['Yahenni, Undying Partisan'] = {
    triggers: [{
      on: 'dies', desc: '+1/+1', filter: (g, self, d) => d.snap.ctrl !== self.ctrl && d.snap.types.includes('Creature'),
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
    abilities: [{
      label: 'Sac: indestructible', cost: { sacCreature: true, sacOther: true },
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.src, ['indestructible']); },
      aiScore: (g, c, p) => 0.3,
    }],
  };
  SC['Kaya, Geist Hunter'] = {
    abilities: [
      {
        label: '+1: Deathtouch svima', loyalty: 1, sorcery: true,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['deathtouch']);
          const toks = ctx.g.creatures(ctx.you).filter(c => c.isToken);
          if (toks.length) ctx.g.addCounters(toks[0], '+1/+1', 1);
        },
      },
      {
        label: '-2: Dupli tokeni (EOT)', loyalty: -2, sorcery: true,
        run: async ctx => {
          ctx.g.untilEffects.push({ expires: 'eot', kind: 'tokenDouble', who: ctx.you });
          ctx.g.lg('Kaya: tokeni se dupliraju do kraja poteza.');
        },
      },
      {
        label: '-6: Egzilaj groblja → Spiriti', loyalty: -6, sorcery: true,
        run: async ctx => {
          let n = 0;
          for (const q of ctx.g.players) {
            n += q.graveyard.length;
            while (q.graveyard.length) { const c = q.graveyard.pop(); c.zone = 'exile'; q.exile.push(c); }
          }
          await ctx.g.makeTokens('spiritW', ctx.you, { n });
        },
      },
    ],
  };
  SC['Bitter Triumph'] = {
    targets: [{
      what: 'permanent', prompt: 'Stvorenje/planeswalker',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      // dodatna cijena: odbaci ili 3 života
      if (ctx.you.hand.length && ctx.you.life <= 6) {
        const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1, prompt: 'Odbaci (cijena)', aiHint: { kind: 'addlDiscard' } });
        await ctx.g.discard(ctx.you, pick);
      } else await ctx.g.loseLife(ctx.you, 3, 'cost');
      await ctx.g.destroy(ctx.targets[0]);
    },
  };
  SC['Grand Crescendo'] = {
    xCost: true,
    resolve: async ctx => {
      await ctx.g.makeTokens('citizen', ctx.you, { n: ctx.x || 0 });
      for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['indestructible']);
    },
  };
  SC['Stroke of Midnight'] = {
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Uništi nonland', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], owner = t.ctrl;
      await ctx.g.destroy(t);
      await ctx.g.makeTokens('humanW', owner);
    },
  };
  SC['Will of the Mardu'] = {
    resolve: async ctx => {
      const both = ctx.g.bf().some(c => c.commander && c.ctrl === ctx.you);
      const doTokens = async () => {
        const opps = E.eachOpp(ctx.g, ctx.you);
        const best = opps.sort((a, b) => ctx.g.creatures(b).length - ctx.g.creatures(a).length)[0];
        if (best) await ctx.g.makeTokens('warriorR', ctx.you, { n: ctx.g.creatures(best).length });
      };
      const doDamage = async () => {
        const n = ctx.g.creatures(ctx.you).length;
        const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
        if (cands.length && n > 0) {
          const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: cands, min: 1, max: 1, prompt: `${n} štete`, aiHint: { kind: 'removalPick' } });
          if (pick[0]) await ctx.g.damageCreature(ctx.src, pick[0], n);
        }
      };
      if (both) { await doTokens(); await doDamage(); }
      else {
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Will of the Mardu:',
          options: [{ key: 't', label: 'Warrior tokeni' }, { key: 'd', label: 'Šteta stvorenju' }],
          aiHint: { kind: 'mode' },
        });
        if (k === 't') await doTokens(); else await doDamage();
      }
    },
  };
  SC['Eliminate the Competition'] = {
    addlCost: { sacAnyCreatures: true },
    resolve: async ctx => {
      const x = ctx.so.sacdN || 0;
      const cands = ctx.g.bf().filter(c => c.is('Creature') && c.ctrl !== ctx.you);
      for (let i = 0; i < x && cands.length; i++) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: cands.filter(c => c.zone === 'battlefield'), min: 0, max: 1, prompt: `Uništi (${i + 1}/${x})`, aiHint: { kind: 'removalPick' },
        });
        if (!pick[0]) break;
        await ctx.g.destroy(pick[0]);
      }
    },
  };
  SC['Hour of Reckoning'] = {
    convoke: true,
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature') && !c.isToken).slice()) await ctx.g.destroy(c);
    },
  };
  SC['Lingering Souls'] = {
    flashback: { cost: '{1}{B}', altCostStr: '{1}{B}', speed: 'sorcery' },
    resolve: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you, { n: 2 }); },
  };
  SC['Release the Dogs'] = {
    resolve: async ctx => { await ctx.g.makeTokens('dogW', ctx.you, { n: 4 }); },
  };
  SC['Shadow Summoning'] = {
    resolve: async ctx => { await ctx.g.makeTokens('spiritW', ctx.you, { n: 2, tapped: true }); },
  };
  SC['Tempt with Vengeance'] = {
    xCost: true,
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (x <= 0) return;
      await ctx.g.makeTokens('elemental11R', ctx.you, { n: x });
      let takers = 0;
      for (const o of E.eachOpp(ctx.g, ctx.you)) {
        const yes = await o.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Tempting offer: i ti napravi ${x} elementala?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'temptingOffer' },
        });
        if (yes === 'yes') { await ctx.g.makeTokens('elemental11R', o, { n: x }); takers++; }
      }
      if (takers) await ctx.g.makeTokens('elemental11R', ctx.you, { n: x * takers });
    },
  };
  SC['Blade of Selves'] = {
    equip: '{4}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) host.cur.kw.add('myriad');
      },
    }],
  };
  SC['Infantry Shield'] = {
    equip: '{2}',
    statics: [{
      apply: (g, self, bf) => {
        if (!self.attachedTo) return;
        const host = bf.find(c => c.iid === self.attachedTo);
        if (host) host.cur.kw.add('menace');
      },
    }],
    triggers: [{
      on: 'attacks', desc: 'Mobilize X', filter: (g, self, d) => d.card.iid === self.attachedTo,
      run: async ctx => {
        const host = ctx.g.byIid(ctx.src.attachedTo);
        if (host) await E7.mobilize(ctx.g, host, Math.max(0, host.power));
      },
    }],
  };
  SC['Talisman of Hierarchy'] = {
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ W: 1 }, { B: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  };
  SC["Wayfarer's Bauble"] = {
    abilities: [{
      label: 'Sac: nađi basic (tapped)', cost: { tap: true, sacSelf: true, mana: '{2}' },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
      aiScore: () => 5,
    }],
  };
  SC["Commander's Insignia"] = {
    statics: [{
      apply: (g, self, bf) => {
        const n = self.ctrl.commanderCasts || 0;
        if (!n) return;
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) { c.cur.power += n; c.cur.toughness += n; }
      },
    }],
  };
  SC['Divine Visitation'] = {
    replace: [{
      event: 'createToken',
      run: (g, defs, ctrl, src) => defs.map(d => {
        const def = typeof d === 'string' ? TK[d] : d;
        if (def && def.types && def.types.includes('Creature')) return TK.angel44;
        return d;
      }),
      priority: 9,
    }],
  };
  SC['Legion Loyalty'] = {
    statics: [{
      apply: (g, self, bf) => {
        for (const c of bf) if (c.ctrl === self.ctrl && c.is('Creature')) c.cur.kw.add('myriad');
      },
    }],
  };
  SC["Tocasia's Welcome"] = {
    triggers: [{
      on: 'etb', desc: 'Vuci (1×/potez)', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.mv <= 3 && d.card !== self,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Within Range'] = {
    triggers: [
      { on: 'etb', desc: '2 Warriora', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('warriorR', ctx.you, { n: 2 }); } },
      {
        on: 'attackersDeclared', desc: 'Gubitak života', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const byOpp = new Map();
          for (const a of (ctx.data.attackers || [])) {
            if (a.attacking instanceof MTG.Player) byOpp.set(a.attacking, (byOpp.get(a.attacking) || 0) + 1);
          }
          for (const [o, n] of byOpp) await ctx.g.loseLife(o, n, 'withinRange');
        },
      },
    ],
  };
})();
