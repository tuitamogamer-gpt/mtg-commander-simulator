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
      label: '+1/+1 counter on a creature', cost: { tap: true, sacSelf: true, mana: '{1}' }, sorcery: true,
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
      label: '+1/+0 to a creature', cost: { tap: true }, sorcery: true,
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
        ctx.src.meta.addedSubtypes = [...new Set([...(ctx.src.meta.addedSubtypes || []), 'Phyrexian'])];
        ctx.g.lg(`${ctx.src.name} transforms (P/T = number of +1/+1 counters).`);
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
  E7.addM1Batch = async (g, cards, n, by) => {
    for (const card of [...new Set(cards)].filter(card => card && card.zone === 'battlefield')) {
      await g.addM1(card, n, by, true);
    }
    await g.checkSBA();
  };
  E7.blight = async (g, p, n, src) => {
    // stavi n -1/-1 na SVOJE stvorenje (izbor)
    const pool = g.creatures(p);
    if (!pool.length) return false;
    const pick = await p.controller.decide(g, {
      type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Blight ${n}: -1/-1 counter on your creature`, aiHint: { kind: 'blight', n, source: src },
    });
    if (!pick.length) return false;
    await g.addM1(pick[0], n, p);
    return true;
  };
  E7.sacAtNextEnd = (g, cards, you) => {
    const iids = cards.map(c => c.iid);
    g.delayed.push({
      on: 'endStep', name: 'Sacrifice temporary tokens', ctrl: you,
      run: async ctx => {
        const mine = iids.map(iid => ctx.g.byIid(iid))
          .filter(c => c && c.zone === 'battlefield' && c.ctrl === ctx.you);
        if (mine.length) await ctx.g.sacrificeMany(ctx.you, mine);
      },
    });
  };
  E7.exileAtNextEnd = (g, cards, you) => {
    const iids = cards.map(c => c.iid);
    g.delayed.push({
      on: 'endStep', name: 'Exile temporary tokens', ctrl: you,
      run: async ctx => {
        const remaining = iids.map(iid => ctx.g.byIid(iid))
          .filter(card => card && card.zone === 'battlefield');
        for (const card of remaining) await ctx.g.exileCard(card);
      },
    });
  };
  E7.mobilize = async (g, card, n) => {
    // napravi n tapovanih 1/1 red Warrior tokena koji napadaju; žrtvuj na sljedećem end stepu
    if (!g.combat || !(card.attacking)) return;
    const made = await g.makeTokens('warriorR', card.ctrl, {
      n, tapped: true, attacking: card.attacking,
      chooseAttacking: (game, token) => game.chooseAttackingDestination(card.ctrl, null, token, `Mobilize — ${card.name}`),
    });
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
        type: 'chooseOption', prompt: `Discover ${n}: ${hit.name} — cast for free or put into hand?`,
        card: hit,
        options: [{ key: 'cast', label: 'Cast for free' }, { key: 'hand', label: 'To hand' }],
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
    g.lg(`${p.name}: discover ${n}${hit ? ` → ${hit.name}` : ' (nothing)'}.`);
  };
  E7.clash = async (g, p) => {
    const opps = E.eachOpp(g, p).filter(o => o.library.length);
    const o = await E.chooseOpponent(g, p, {
      candidates: opps, prompt: 'Clash — choose an opponent', goal: 'clash',
    });
    const mine = p.library[p.library.length - 1];
    const theirs = o && o.library[o.library.length - 1];
    const mv1 = mine ? mine.mv : -1, mv2 = theirs ? theirs.mv : -1;
    g.lg(`Clash: ${p.name} (${mine ? mine.name : '—'} mv${mv1}) vs ${o ? o.name : '—'} (${theirs ? theirs.name : '—'} mv${mv2}).`);
    const place = async (player, card) => {
      if (!player || !card) return;
      const where = await player.controller.decide(g, {
        type: 'chooseOption', prompt: `Clash — ${card.name} stays on top or goes to the bottom?`,
        card,
        options: [{ key: 'top', label: 'Leave on top' }, { key: 'bottom', label: 'Put on the bottom' }],
        aiHint: { kind: 'clashPlace', card },
      });
      if (where === 'bottom' && player.library[player.library.length - 1] === card) {
        player.library.pop(); player.library.unshift(card);
      }
    };
    await place(p, mine);
    await place(o, theirs);
    return mv1 > mv2;
  };
  // glasanje — "will of the council" (javno, redom)
  E7.vote = async (g, you, src, options, aiPick) => {
    const votes = new Map();
    const order = g.apnapFrom(you);
    // Diplomacy-enabled public councils get one bounded campaign before the
    // first ballot. The source controller may make one concrete,
    // rules-enforced promise; accepting a bargain locks only that voter's
    // public choice. Secret ballots intentionally never enter this path.
    const predicted = new Map();
    for (const voter of order) {
      const prediction = voter.isAI && typeof aiPick === 'function' ? aiPick(voter) : null;
      predicted.set(voter.idx, options.some(option => option.key === prediction) ? prediction : null);
    }
    const bargains = g.diplomacyCampaignForPublicChoice
      ? await g.diplomacyCampaignForPublicChoice(you, src, options, predicted)
      : new Map();
    for (const q of order) {
      if (q.lost) continue;
      const bargain = bargains.get(q.idx);
      const picked = bargain ? bargain.key : await q.controller.decide(g, {
          type: 'chooseOption', prompt: `${src.name}: vote`, options,
          aiHint: {
            kind: 'vote', src, options, voter: q, forWhom: you, aiPick, secret: false,
            // Will of the council je javno glasanje. Bot smije reagovati na već
            // otkrivene glasove (i Erestora), ali ne dobija uvid u buduće izbore.
            revealedVotes: order.slice(0, order.indexOf(q)).filter(p => !p.lost).map(p => ({
              playerId: p.idx,
              key: votes['_by_' + p.idx],
            })),
          },
        });
      const k = options.some(option => option.key === picked) ? picked : options[0].key;
      votes.set(k, (votes.get(k) || 0) + 1);
      const opt = options.find(o => o.key === k);
      const politicalSuffix = bargain && bargain.contractId ? ' (vote bargain fulfilled)'
        : bargain && bargain.campaignPosition ? ' (public campaign position)' : '';
      g.lg(`${q.name} votes for: ${opt ? opt.label : k}.${politicalSuffix}`);
      votes['_by_' + q.idx] = k;
      if (bargain && bargain.contractId && g.diplomacyRecordPublicChoice) g.diplomacyRecordPublicChoice(bargain.contractId, q, k);
    }
    const campaignPosition = [...bargains.values()].find(entry => entry && entry.campaignPosition);
    const securedVote = [...bargains.values()].find(entry => entry && entry.contractId &&
      campaignPosition && entry.key === campaignPosition.key);
    if (campaignPosition && securedVote) {
      // Diplomacy package house rule: the controller's declared ballot plus
      // one secured public vote wins a tied council result. Raw vote counts
      // stay truthful (2–2 in a four-player pod); only the winner tie-break is
      // political, visible and backed by an active agreement.
      votes._diplomacyTieBreak = campaignPosition.key;
      votes._diplomacyContractId = securedVote.contractId;
    }
    await g.emit('voteEnd', { src, by: you, votes, options });
    return votes;
  };
  E7.voteBeats = (votes, preferred, other) => {
    const preferredN = votes.get(preferred) || 0;
    const otherN = votes.get(other) || 0;
    return preferredN > otherN || (preferredN === otherN && votes._diplomacyTieBreak === preferred);
  };
  // tajno glasanje — svi biraju bez uvida
  E7.secretVote = async (g, you, src, options) => {
    const picks = new Map();
    for (const q of g.alivePlayers()) {
      const k = await q.controller.decide(g, {
        type: 'chooseOption', prompt: `${src.name}: secret vote`, options,
        // Secret council namjerno ne prosljeđuje tuđe trenutne izbore.
        aiHint: { kind: 'vote', src, options, voter: q, forWhom: you, secret: true },
      });
      picks.set(q, k);
    }
    const votes = new Map();
    for (const [q, k] of picks) {
      votes.set(k, (votes.get(k) || 0) + 1);
      const opt = options.find(o => o.key === k);
      g.lg(`${q.name} voted: ${opt ? opt.label : k}.`);
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
        on: 'attacks', once: false, ctrl: p, name: 'The Ring: draw, then discard',
        filter: (g2, d) => isBearer(d.card),
        run: async ctx => {
          await ctx.g.draw(p, 1);
          if (!p.hand.length) return;
          const pick = await p.controller.decide(ctx.g, {
            type: 'chooseCards', from: p.hand, min: 1, max: 1,
            prompt: 'The Ring: discard a card', aiHint: { kind: 'addlDiscard' },
          });
          if (pick.length) await ctx.g.discard(p, pick);
        },
      });
    }

    if (lvl === 3) {
      // Kad god Ring-bearera blokira stvorenje — njegov vlasnik ga
      // žrtvuje na kraju borbe (okida se za svakog blokera posebno).
      g.delayed.push({
        on: 'becomesBlocked', once: false, ctrl: p, name: 'The Ring: blocker is sacrificed',
        filter: (g2, d) => isBearer(d.attacker),
        run: async ctx => {
          for (const b of (ctx.data.blockers || []).slice()) {
            const iid = b.iid;
            ctx.g.delayed.push({
              on: 'endCombat', once: true, expires: 'eot', ctrl: b.ctrl,
              name: 'The Ring: sacrifice the blocker',
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
        on: 'combatDamageToPlayer', once: false, ctrl: p, name: 'The Ring: −3 life',
        filter: (g2, d) => isBearer(d.card),
        run: async ctx => {
          await ctx.g.loseLifeOpponents(ctx.src, p, 3, 'The Ring');
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
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Choose a Ring-bearer', aiHint: { kind: 'ringBearer' },
      });
      if (pick[0]) {
        for (const c of g.bf()) if (c.ctrl === p) c.meta.ringBearer = false;
        pick[0].meta.ringBearer = true;
        g.lg(`💍 ${pick[0].name} is the Ring-bearer (The Ring, level ${em.level}).`);
      }
    } else {
      g.lg(`💍 The Ring — level ${em.level} (you have no creature for the Ring-bearer).`);
    }
    g.recalc();
    const bearer = E7.ringBearer(g, p);
    await g.emit('ringTempted', { player: p, bearer, level: em.level });
    return bearer;
  };

  // ============================================================
  // TURTLE POWER (TMC) — commander: Heroes in a Half Shell
  // ============================================================
  const MNT = (c) => ['Mutant', 'Ninja', 'Turtle'].some(s => c.hasSub(s));
  const partnerWith = otherName => ({
    on: 'etb', desc: `Partner with ${otherName}`, filter: etbSelf,
    targets: [T.player({ prompt: `Who may search for ${otherName}?`, aiHint: { goal: 'gift' } })],
    run: async ctx => {
      const player = ctx.targets[0];
      if (!player) return;
      const card = player.library.find(candidate => candidate.name === otherName);
      let use = 'no';
      if (card) {
        use = await player.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: `Partner with: put ${otherName} into hand?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'partnerSearch', card },
        });
      }
      if (card && use === 'yes') {
        player.library.splice(player.library.indexOf(card), 1);
        card.zone = 'hand'; player.hand.push(card);
        ctx.g.lg(`${otherName} goes to ${player.name}'s hand.`);
      }
      U.shuffle(player.library, ctx.g.rnd);
    },
  });

  SC['Heroes in a Half Shell'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: '+1/+1 + card',
      filter: (g, self, d) => (d.cards || []).some(card => card.ctrl === self.ctrl && MNT(card)),
      run: async ctx => {
        const cards = [...new Set((ctx.data.cards || []).filter(card => card.ctrl === ctx.you && MNT(card)))];
        for (const card of cards) ctx.g.addCounters(card, '+1/+1', 1);
        if (cards.length) await ctx.g.draw(ctx.you, 1);
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
        on: 'etb', desc: 'Flying counter on creatures', filter: etbSelf,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (Object.keys(c.counters).some(k => c.counters[k] > 0)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
      {
        on: 'attacks', desc: 'Flying counter on creatures', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) {
            if (Object.keys(c.counters).some(k => c.counters[k] > 0)) E.grantUntilEOT(ctx.g, c, ['flying']);
          }
        },
      },
      {
        on: 'draw', desc: '+1/+1 counter on Baxter', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
    ],
  };
  SC['Bebop, Skull & Crossbones'] = {
    triggers: [
      partnerWith('Rocksteady, Mutant Marauder'),
      {
        on: 'combatDamageToPlayer', desc: 'Draw X, lose X', filter: (g, self, d) => d.card === self, opt: true,
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
        on: 'attacks', desc: 'Double counters', filter: (g, self, d) => d.card === self,
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', ctx.src.counters['+1/+1'] || 0); },
      },
      {
        on: 'dies', desc: 'Robots', filter: (g, self, d) => d.card === self,
        run: async ctx => { await ctx.g.makeTokens('robot11', ctx.you, { n: ctx.data.snap.plus1 || 0 }); },
      },
    ],
  };
  SC['Biogenic Ooze'] = {
    triggers: [
      { on: 'etb', desc: 'Ooze token', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('oozeG', ctx.you); } },
      {
        on: 'endStep', desc: '+1/+1 counter on Ooze', filter: (g, self, d) => d.player === self.ctrl,
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
        on: 'attacks', desc: '+1/+1 to attacker', filter: (g, self, d) => d.card === self,
        targets: [T.creature({ prompt: 'Attacker', filter: (g, c) => c.zone === 'battlefield' && c.attacking, aiHint: { goal: 'buff' } })],
        run: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1); },
      },
      {
        on: 'plusAdded', desc: 'Damage to an opponent',
        filter: (g, self, d) => d.card.ctrl === self.ctrl,
        targets: [T.opponent({ prompt: 'Damage to whom?', aiHint: { goal: 'drain' } })],
        run: async ctx => { if (ctx.targets[0]) await ctx.g.damagePlayer(ctx.src, ctx.targets[0], ctx.data.n || 1); },
      },
    ],
  };
  SC['Humongous Fungus'] = {
    plusCountersAdjust: (n, g, card, self) => card.ctrl === self.ctrl ? n * 2 : n,
  };
  SC['Dimension X Pizzasaur'] = {
    triggers: [{
      on: 'etb', desc: '+2 counters → destroy', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+1 ×2', aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t) return;
        ctx.g.addCounters(t, '+1/+1', 2);
        const countCounters = g => g.bf().filter(card => card.ctrl === ctx.you)
          .reduce((sum, card) => sum + Object.values(card.counters).reduce((a, b) => a + b, 0), 0);
        ctx.g.queueTrigger({
          src: ctx.src, ctrl: ctx.you, name: 'Pizzasaur — destroy up to one creature',
          targets: [T.creature({
            upTo: true, prompt: 'Destroy a creature based on counter count',
            filter: (g, card) => card.zone === 'battlefield' && card.is('Creature') && card.mv <= countCounters(g),
            aiHint: { goal: 'removal' },
          })],
          run: async next => { if (next.targets[0]) await next.g.destroy(next.targets[0]); },
        });
      },
    }],
    abilities: [{
      label: 'You gain 3, opponents lose 3', cost: { tap: true, sacSelf: true, mana: '{2}' },
      run: async ctx => {
        await ctx.g.gainLife(ctx.you, 3);
        await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 3, 'pizzasaur');
      },
      aiScore: (g, c, p) => E.eachOpp(g, p).some(o => o.life <= 6) ? 9 : 2,
    }],
  };
  SC['Donatello, the Brains'] = {
    replace: [{
      event: 'createToken',
      applies: (g, defs) => defs.length > 0,
      run: (g, defs, ctrl, src) => defs.concat([TK.mutagen]),
      priority: 5,
    }],
  };
  SC['Electric Seaweed'] = {
    triggers: [{
      on: 'etb', desc: 'Until end of turn: death → 1 damage', filter: etbSelf,
      run: async ctx => {
        const iid = ctx.src.iid;
        const source = ctx.src;
        ctx.g.delayed.push({
          on: 'dies', once: false, expires: 'eot', name: 'Electric Seaweed', ctrl: ctx.you, src: source,
          filter: (g, d) => d.card.iid !== iid && d.snap.types.includes('Creature'),
          run: async c2 => {
            for (const c of c2.g.bf().filter(x => x.is('Creature') && !x.hasSub('Wall')).slice()) {
              await c2.g.damageCreature(source, c, 1, { deferSBA: true });
            }
          },
        });
      },
    }],
    abilities: [{
      label: '1 damage to any target', cost: { tap: true },
      targets: [T.any({ prompt: '1 damage', aiHint: { goal: 'removal', dmg: 1 } })],
      run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
    }],
  };
  SC['Irma, Part-Time Mutant'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Copy a creature', filter: (g, self, d) => d.player === self.ctrl, opt: true,
      targets: (g, self) => [T.yourCreature({
        prompt: 'Copy another creature you control', upTo: true,
        filter: (g2, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && c !== self,
        aiHint: { goal: 'buff' },
      })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (t && t !== ctx.src) {
          const base = t.isCopyOf || t.def;
          ctx.src.isCopyOf = base;
          const merged = Object.assign({}, base, { name: 'Irma, Part-Time Mutant', triggers: (base.triggers || []).concat(SC['Irma, Part-Time Mutant'].triggers) });
          ctx.src.def = merged;
          ctx.g.lg(`Irma copies ${t.name}.`);
          ctx.g.recalc();
        }
        ctx.g.addCounters(ctx.src, '+1/+1', 1);
      },
    }],
  };
  SC['Krang, the All-Powerful'] = {
    doubleDrawTriggers: true,
    triggers: [{
      on: 'draw', desc: '+1/+1 (second card)', filter: (g, self, d) => d.nth === 2,
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };
  SC['Leatherhead, Iron Gator'] = {
    triggers: [{
      on: 'attacks', desc: '+2 counters to all', filter: (g, self, d) => d.card === self,
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 2); },
    }],
  };
  SC['Leonardo, the Balance'] = {
    triggers: [{
      on: 'tokensCreated', desc: '+1/+1 to all (1×/turn)', opt: true,
      filter: (g, self, d) => d.ctrl === self.ctrl && self.meta._leonardoUsedTurn !== g.turnNo,
      run: async ctx => {
        ctx.src.meta._leonardoUsedTurn = ctx.g.turnNo;
        for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1);
      },
    }],
    abilities: [{
      label: 'Menace+trample+lifelink to all', cost: { mana: '{W}{U}{B}{R}{G}' },
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
          { key: 'counter', label: '+1/+1 counter on Lita', benefit: 'counter' },
          { key: 'food', label: 'Food token', benefit: 'food' },
          { key: 'scry', label: 'Scry 1', benefit: 'scry' },
        ].filter(o => !used.includes(o.key));
        if (!opts.length) return;
        const k = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Lita — Alliance: choose', options: opts,
          aiHint: { kind: 'tmntAlliance', src: ctx.src, used: used.slice() },
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
      applies: (g, ev, self) => !!ev.src?.is?.('Creature') && ev.src.ctrl === self.ctrl && Object.values(ev.src.counters || {}).some(value => value > 0),
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
      label: 'Sac token: draw', cost: { mana: '{2}', sac: (g, x, c) => x.isToken },
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
        onlyIf: (g, self, d) => self.zone === 'battlefield' && d.card.zone === 'battlefield' &&
          (d.card.power > self.power || d.card.toughness > self.toughness),
        run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Draw a card',
        filter: (g, self, d) => d.card.ctrl === self.ctrl && Object.values(d.card.counters || {}).some(v => v > 0),
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Roadkill Rodney'] = {
    squad: '{3}',
    triggers: [
      {
        on: 'etb', desc: 'Squad copies', filter: etbSelf,
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
      partnerWith('Bebop, Skull & Crossbones'),
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
        on: 'attacks', desc: 'Copies for the others', filter: (g, self, d) => d.card === self && d.defender instanceof MTG.Player,
        run: async ctx => {
          for (const o of E.eachOpp(ctx.g, ctx.you)) {
            if (o === ctx.src.attacking) continue;
            const made = await ctx.g.copyPermanentToken(ctx.src, ctx.you, {
              tapped: true, attacking: o, nonlegendary: true,
            });
            for (const token of made) {
              ctx.g.delayed.push({
                on: 'endCombat', name: 'Shredder copy — sacrifice', ctrl: ctx.you, src: token,
                run: async end => { if (token.zone === 'battlefield') await end.g.sacrifice(token.ctrl, token); },
              });
            }
          }
        },
      },
      {
        on: 'combatDamageToPlayer', desc: 'Lose half life', filter: (g, self, d) => d.card === self,
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
      label: 'Destroy artifact/enchantment', cost: { mana: '{2}{G}', rmCounter: { kind: '+1/+1', n: 1 } },
      targets: [T.permanent((g, c) => c.is('Artifact') || c.is('Enchantment'), { prompt: 'Target', aiHint: { goal: 'removal' } })],
      run: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
    }],
  };
  SC['Tempestra, Dame of Games'] = {
    abilities: [{
      // "copy of ANOTHER target creature ... except it isn't legendary"
      label: 'Copy of a creature (haste, sac EOT)', cost: { tap: true, mana: '{2}{R}', sac: (g, x, c) => x.is('Artifact') },
      targets: [T.yourCreature({
        prompt: 'Copy',
        filter: (g, c, ctrl, src) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && c !== src,
        aiHint: { goal: 'buff' },
      })],
      run: async ctx => {
        const t = ctx.targets[0];
        if (!t || t === ctx.src || t.zone !== 'battlefield') return;
        const made = await ctx.g.copyPermanentToken(t, ctx.you, { haste: true, nonlegendary: true });
        E7.sacAtNextEnd(ctx.g, made, ctx.you);
      },
      aiScore: (g, c, p) => g.creatures(p).some(x => x !== c && x.power >= 4) ? 5 : 1,
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
      prevent: true,
      applies: (g, ev, self) => !!ev.target && ev.target !== self && ev.target.ctrl === self.ctrl && !!ev.target.is?.('Creature'),
      run: (g, ev, src) => {
        if (ev.target && ev.target !== src && ev.target.ctrl === src.ctrl && ev.target.is && ev.target.is('Creature')) {
          g.addCounters(ev.target, '+1/+1', ev.n);
          g.lg(`${src.name}: damage prevented → +${ev.n} counters on ${ev.target.name}.`);
          return 0;
        }
        return ev.n;
      },
    }],
    triggers: ['lto', 'cardToGraveyard'].map(event => ({
      on: event, zone: event === 'cardToGraveyard' ? 'graveyard' : 'self', desc: 'Into library',
      filter: (g, self, d) => d.card === self,
      run: async ctx => {
        const c = ctx.src;
        if (c.zone === 'graveyard') {
          ctx.you.graveyard.splice(ctx.you.graveyard.indexOf(c), 1);
          c.zone = 'library'; ctx.you.library.push(c);
          U.shuffle(ctx.you.library, ctx.g.rnd);
          ctx.g.lg(`${c.name} is shuffled into the library.`);
        }
      },
    })),
  };
  SC['Aggro Amalgam'] = {
    xCost: true,
    etbCounters: { kind: '+1/+1', n: (g, card) => card.castMeta ? (card.castMeta.x || 0) : 0 },
    triggers: [{
      on: 'etb', desc: 'Double or fight', filter: etbSelf,
      modes: {
        aiHint: { kind: 'aggroAmalgam' },
        list: [
          { label: 'Double +1/+1 counters', aiMeta: { benefit: 'doubleCounters' } },
          {
            label: 'Fight target creature you don\'t control', aiMeta: { benefit: 'fight' },
            targets: [T.oppCreature({ prompt: 'Fight whom?', aiHint: { goal: 'removal' } })],
          },
        ],
      },
      run: async ctx => {
        if (ctx.mode === 0) ctx.g.addCounters(ctx.src, '+1/+1', ctx.src.counters['+1/+1'] || 0);
        else {
          const target = ctx.targets[0];
          if (target) {
            await ctx.g.damageCreature(ctx.src, target, ctx.src.power);
            await ctx.g.damageCreature(target, ctx.src, target.power);
          }
        }
      },
    }],
  };
  SC['Continue?'] = {
    targets: (g, card) => [T.gyCreature({
      count: 4, upTo: true, prompt: 'Return up to 4 creatures that died this turn',
      filter: (g2, candidate, ctrl) => candidate.is('Creature') &&
        g2.diedThisTurn.some(snap => snap.iid === candidate.iid && snap.owner === ctrl),
      aiHint: { goal: 'reanimate' },
    })],
    resolve: async ctx => {
      const picked = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
      for (const card of picked) if (card.zone === 'graveyard') await ctx.g.move(card, 'battlefield', { ctrl: ctx.you });
    },
  };
  SC['Double Jump'] = {
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
            if (c) {
              const plus = (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
              c.cur.basePower = 5;
              c.cur.baseToughness = 5;
              c.cur.power = 5 + plus;
              c.cur.toughness = 5 + plus - (c.counters['-0/-1'] || 0);
              c.cur.kw.add('flying');
            }
          },
        });
        ctx.g.recalc();
      }
    },
    splitHalves: {
      flyingKick: {
        targets: [
          T.yourCreature({ prompt: 'Flying Kick: your creature', aiHint: { goal: 'fightMine' } }),
          T.oppCreature({ prompt: "Flying Kick: opponent's creature", aiHint: { goal: 'removal' } }),
        ],
        resolve: async ctx => {
          const [source, target] = ctx.targets;
          if (source && target) await ctx.g.damageCreature(source, target, source.power);
        },
      },
    },
    altCosts: [
      {
        name: 'Flying Kick', label: 'Flying Kick', altCostStr: '{1}{R}', speed: 'instant',
        splitHalf: 'flyingKick',
      },
      {
        name: 'Double Jump // Flying Kick', label: 'Fuse: both halves', altCostStr: '{2}{U}{R}', speed: 'instant',
        splitFuse: 'flyingKick',
      },
    ],
  };
  SC['Shellshock'] = {
    xCost: true,
    targets: (g, card) => E.eachOpp(g, card.ctrl).map(opponent => T.creature({
      upTo: true, prompt: `Shellshock: up to one creature ${opponent.name} controls`,
      filter: (g2, candidate) => candidate.zone === 'battlefield' && candidate.is('Creature') && candidate.ctrl === opponent,
      aiHint: { goal: 'removal' },
    })),
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (x <= 0) return;
      let made = 0;
      for (const target of ctx.targets.filter(Boolean)) {
        const dealt = await ctx.g.damageCreature(ctx.src, target, x, { deferSBA: true });
        if (dealt > 0) made++;
      }
      if (made) await ctx.g.makeTokens('mutagen', ctx.you, { n: made });
    },
  };
  SC['Special Move'] = {
    modes: {
      pick: 2,
      list: [
        { label: 'Jump Kick: destroy an artifact', targets: [T.permanent((g, c) => c.is('Artifact'), { prompt: 'Artifact', aiHint: { goal: 'removal' } })] },
        { label: 'Dash Attack: +2 counters on an attacker/blocker', targets: [T.yourCreature({ prompt: 'Attacker/blocker', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl === ctrl && (c.attacking || c.blocking), aiHint: { goal: 'buff' } })] },
        { label: 'Foot Toss: damage, then sacrifice', targets: [
          T.yourCreature({ prompt: 'Thrower', aiHint: { goal: 'fightMine' } }),
          T.any({ prompt: 'Second target', differentFromPrevious: true, aiHint: { goal: 'damage' } }),
        ] },
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
    targets: [T.creature({ prompt: '1 damage', aiHint: { goal: 'removal', dmg: 1 } })],
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
      ctx.g.lg("Fast Forward: all opponents' creatures goaded!");
    },
  };
  SC['Game Over'] = {
    selfCostAdjust: (g, card, p) => g.alivePlayers().some(q => q.life <= 20) ? -2 : 0,
    resolve: async ctx => { for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.destroy(c); },
  };
  SC['Here Comes a New Hero!'] = {
    xCost: true,
    targets: (g, card, castOpts) => [
      T.player({ prompt: 'Who draws X cards?', aiHint: { goal: 'drawSelf' } }),
      T.creature({
        upTo: true, prompt: `Copy a creature with MV ≤ ${castOpts.xVal || 0}`,
        filter: (g2, creature) => creature.zone === 'battlefield' && creature.is('Creature') && creature.mv <= (castOpts.xVal || 0),
        aiHint: { goal: 'copyBestToken' },
      }),
    ],
    resolve: async ctx => {
      const x = ctx.x || 0;
      if (ctx.targets[0]) await ctx.g.draw(ctx.targets[0], x);
      if (ctx.targets[1]) await ctx.g.copyPermanentToken(ctx.targets[1], ctx.you, {});
    },
  };
  SC['Lessons from Life'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 3);
      const lands = ctx.you.hand.filter(c => c.is('Land'));
      if (lands.length) {
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: lands, min: 0, max: 1, prompt: 'Land onto the battlefield (tapped)?', aiHint: { kind: 'rampPick' },
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
      const a = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: mine, min: 1, max: 1, prompt: 'Super Combo: your creature', aiHint: { kind: 'fightMine' } }))[0];
        const b = (await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: opps, min: 1, max: 1, prompt: 'Super Combo: target', aiHint: { kind: 'removalPick' } }))[0];
        if (a && b) await ctx.g.damageCreature(a, b, a.power);
      }
    },
  };
  SC['Vanquish the Horde'] = {
    selfCostAdjust: (g, card, p) => -g.bf().filter(c => c.is('Creature')).length,
    resolve: async ctx => { await ctx.g.destroyMany(ctx.g.bf().filter(c => c.is('Creature'))); },
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
      on: 'etb', desc: '+1/+1 counter on up to 4 creatures', filter: etbSelf,
      targets: [T.creature({ prompt: '+1/+1 (do 4)', count: 4, upTo: true, aiHint: { goal: 'buff' } })],
      run: async ctx => {
        const ts = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : ctx.targets.filter(Boolean);
        for (const t of ts) ctx.g.addCounters(t, '+1/+1', 1);
      },
    }],
    abilities: [{
      label: 'Double counters', cost: { tap: true, mana: '{2}', sac: (g, x, c) => x.isToken },
      targets: [T.creature({ prompt: 'Double counters', aiHint: { goal: 'buff' } })],
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
      on: 'etb', desc: 'Basic to hand', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { toHandN: 1, toHand: true }); },
    }],
    abilities: [{
      label: 'ALL (5 colors)', cost: { tap: true, sacSelf: true, mana: '{2}{W}{U}{B}{R}{G}' },
      targets: [
        T.player({ prompt: 'Who gains 3 life and draws a card?', aiHint: { goal: 'drawSelf' } }),
        T.any({ prompt: '3 damage', aiHint: { goal: 'damage', n: 3 } }),
        T.creature({ upTo: true, prompt: 'Up to one creature gets 3 counters', aiHint: { goal: 'buff' } }),
      ],
      run: async ctx => {
        const recipient = ctx.targets[0];
        if (recipient) {
          await ctx.g.gainLife(recipient, 3);
          await ctx.g.draw(recipient, 1);
        }
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          if (o.hand.length) {
            const pick = await o.controller.decide(ctx.g, { type: 'chooseCards', from: o.hand, min: 1, max: 1, prompt: 'Discard', aiHint: { kind: 'cleanupDiscard' } });
            await ctx.g.discard(o, pick);
          }
        }
        if (ctx.targets[1]) await ctx.g.damageAny(ctx.src, ctx.targets[1], 3);
        if (ctx.targets[2]) ctx.g.addCounters(ctx.targets[2], '+1/+1', 3);
      },
      aiScore: () => 8,
    }],
  };
  SC['Exploding Barrel'] = {
    mana: { cost: { tap: true, counter: 'pressure' }, produce: [{ ANY: true, n: 1 }] },
    abilities: [{
      label: '20 damage to a creature', sorcery: true,
      cost: { tap: true, sacSelf: true, mana: (g, c) => '{' + Math.max(0, 8 - (c.counters['pressure'] || 0)) + '}' },
      targets: [T.creature({ prompt: '20 damage', aiHint: { goal: 'removal', dmg: 20 } })],
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
        on: 'combatDamageToPlayer', desc: 'Sac → draw', opt: true,
        filter: (g, self, d) => self.attachedTo === d.card.iid && g.canSacrifice(d.card),
        controller: (g, self, d) => d.card.ctrl,
        run: async ctx => {
          const host = ctx.g.byIid(ctx.src.attachedTo);
          if (!host) return;
          const controller = host.ctrl;
          const n = host.power;
          if (await ctx.g.sacrifice(controller, host)) await ctx.g.draw(controller, n);
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
            type: 'chooseCards', from: perms, min: 0, max: 1, prompt: 'Permanent onto the battlefield', aiHint: { kind: 'reanimate' },
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
        on: 'etb', desc: 'Squad copies', filter: etbSelf,
        run: async ctx => {
          const n = ctx.src.meta.paidTimes || 0;
          if (n > 0) await ctx.g.copyPermanentToken(ctx.src, ctx.you, { n });
        },
      },
      {
        on: 'attackersDeclared', desc: 'Ninjas attack', filter: (g, self, d) => d.player === self.ctrl,
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
      on: 'endStep', desc: 'Draw if you control the strongest creature', filter: (g, self, d) => d.player === self.ctrl,
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
        on: 'attacks', desc: 'Double counters',
        filter: (g, self, d) => d.card.iid === self.attachedTo,
        controller: (g, self, d) => d.card.ctrl,
        run: async ctx => {
          const host = ctx.g.byIid(ctx.src.attachedTo);
          if (!host) return;
          ctx.g.addCounters(host, '+1/+1', host.counters['+1/+1'] || 0);
          if (host.power >= 10) await ctx.g.draw(host.ctrl, 1);
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
      label: 'Shield: return to hand on death', cost: { mana: '{1}' },
      targets: [T.creature({ prompt: 'Creature with a counter', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && Object.values(c.counters).some(v => v > 0), aiHint: { goal: 'protect' } })],
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
              c2.g.lg(`${c.name} returns to hand (Together Forever).`);
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
        on: 'lto', desc: 'Token leaves → card/damage',
        filter: (g, self, d) => d.snap.ctrl === self.ctrl && d.snap.isToken && d.snap.types.includes('Creature'),
        run: async ctx => {
          if (ctx.data.snap.attacking) await ctx.g.draw(ctx.you, 1);
          else await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1, 'zurgo');
        },
      },
    ],
  };
  SC['Adeline, Resplendent Cathar'] = {
    cdaPower: (g, c) => g.creatures(c.ctrl).length,
    triggers: [{
      on: 'attackersDeclared', desc: 'Humans attack', filter: (g, self, d) => d.player === self.ctrl && d.attackers.length > 0,
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          await ctx.g.makeTokens('humanW', ctx.you, {
            tapped: true, attacking: o,
            chooseAttacking: (game, token) => game.chooseAttackingDestination(ctx.you, o, token, 'Adeline'),
          });
        }
      },
    }],
  };
  SC['Ainok Strike Leader'] = {
    triggers: [{
      on: 'attacks', desc: 'Goblins attack', oncePerTurn: true,
      filter: (g, self, d) => d.card === self || (d.card.commander && d.card.ctrl === self.ctrl),
      run: async ctx => {
        for (const o of E.eachOpp(ctx.g, ctx.you)) {
          await ctx.g.makeTokens('goblin', ctx.you, {
            tapped: true, attacking: o,
            chooseAttacking: (game, token) => game.chooseAttackingDestination(ctx.you, o, token, 'Ainok Strike Leader'),
          });
        }
      },
    }],
    abilities: [{
      label: 'Sac: tokens indestructible', cost: { sacSelf: true },
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
          aiHint: { kind: 'fabricate', source: ctx.src },
        });
        if (k === 'c') ctx.g.addCounters(ctx.src, '+1/+1', 2);
        else await ctx.g.makeTokens('servo', ctx.you, { n: 2 });
      },
    }],
  };
  SC["Aron, Benalia's Ruin"] = {
    abilities: [{
      label: 'Sac: +1/+1 to all', cost: { tap: true, mana: '{W}{B}', sacCreature: true, sacOther: true },
      run: async ctx => { for (const c of ctx.g.creatures(ctx.you)) ctx.g.addCounters(c, '+1/+1', 1); },
      aiScore: (g, c, p) => g.creatures(p).length >= 4 && g.creatures(p).some(x => x.isToken) ? 5 : 0.5,
    }],
  };
  SC['Beetleback Chief'] = {
    triggers: [{ on: 'etb', desc: '2 Goblins', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('goblin', ctx.you, { n: 2 }); } }],
  };
  SC['Bone Devourer'] = {
    etbCounters: { kind: '+1/+1', n: (g) => g.diedThisTurn.filter(s => s.types.includes('Creature')).length },
    triggers: [{
      on: 'dies', desc: 'Draw X, lose X', filter: (g, self, d) => d.card === self,
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
      on: 'combatDamageToPlayer', desc: 'Pay 1 → card',
      filter: (g, self, d) => d.player && E.eachOpp(g, self.ctrl).includes(d.player),
      run: async ctx => {
        // bilo čije stvorenje udari NEKOG od tvojih protivnika → kontrolor može platiti 1 život za kartu
        const d = ctx.data;
        const hitter = d.card.ctrl;
        if (hitter.lost || d.player === undefined) return;
        const yes = await hitter.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Gix: pay 1 life → draw a card?',
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'gixDraw' },
        });
        if (yes === 'yes') { await ctx.g.loseLife(hitter, 1, 'gix'); await ctx.g.draw(hitter, 1); }
      },
    }],
    abilities: [{
      label: 'Discard X: steal X cards from the top', cost: { mana: '{4}{B}{B}{B}', discardX: true },
      targets: [T.opponent({ prompt: 'Opponent whose library you exile', aiHint: { goal: 'mill' } })],
      run: async ctx => {
        const opponent = ctx.targets[0];
        if (!opponent) return;
        for (let i = 0; i < (ctx.x || 0) && opponent.library.length; i++) {
          const card = opponent.library.pop();
          card.zone = 'exile'; opponent.exile.push(card);
          card.meta = card.meta || {};
          card.meta.playableBy = ctx.you;
          card.meta.playableUntil = 9999;
          card.meta.freePlay = true;
          delete card.meta.spellsOnly;
        }
      },
      aiScore: (g, c, p) => p.hand.length >= 3 ? 4 : 0,
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
      on: 'etb', desc: '+1/+1 to all (EOT)',
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card !== self && d.card.is('Creature'),
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 1, 1); },
    }],
  };
  SC['Grenzo, Havoc Raiser'] = {
    triggers: [{
      on: 'combatDamageToPlayer', desc: 'Goad or steal a card',
      filter: (g, self, d) => d.card.ctrl === self.ctrl,
      modes: {
        aiHint: { kind: 'grenzoMode' },
        list: [
          {
            label: 'Goad their creature',
            targets: (g, self, data) => [T.creature({
              prompt: "Goad that player's creature",
              filter: (g2, card) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === data.player,
              aiHint: { goal: 'goad' },
            })],
          },
          { label: 'Exile the top card — you may cast it this turn' },
        ],
      },
      run: async ctx => {
        const victim = ctx.data.player;
        if (ctx.mode === 0) {
          if (ctx.targets[0]) E.goad(ctx.g, ctx.targets[0], ctx.you);
        } else if (victim && victim.library.length) {
          const c = victim.library.pop();
          c.zone = 'exile'; victim.exile.push(c);
          c.meta.playableBy = ctx.you;
          c.meta.playableUntil = ctx.g.turnNo;
          c.meta.anyColor = true;
          c.meta.spellsOnly = true;
          ctx.g.lg(c.is('Land')
            ? `Grenzo exiles ${c.name} — a land is not a spell and can't be played with this "cast" permission; it stays in exile.`
            : `Grenzo exiles ${c.name} — ${ctx.you.name} may cast it until end of turn.`);
        }
      },
    }],
  };
  SC['Hero of Bladehold'] = {
    triggers: [
      {
        on: 'attacks', desc: 'Battle cry', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) if (c !== ctx.src && c.attacking) E.pumpUntilEOT(ctx.g, c, 1, 0);
        },
      },
      {
        on: 'attacks', desc: '2 Soldiers attack', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          if (ctx.src.attacking) await ctx.g.makeTokens('soldierW', ctx.you, {
            n: 2, tapped: true, attacking: ctx.src.attacking,
            chooseAttacking: (game, token) => game.chooseAttackingDestination(ctx.you, null, token, 'Hero of Bladehold'),
          });
        },
      },
    ],
  };
  SC['Ironwill Forger'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Myriad to a nonlegendary creature',
      filter: (g, self, d) => d.player === self.ctrl && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      targets: [T.yourCreature({ prompt: 'Myriad until end of turn', filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && !(c.cur.super || []).includes('Legendary'), aiHint: { goal: 'buff' } })],
      run: async ctx => {
        if (ctx.g.bf().some(c => c.commander && c.ctrl === ctx.you) && ctx.targets[0]) {
          E.grantUntilEOT(ctx.g, ctx.targets[0], ['myriad']);
          ctx.g.lg(`${ctx.targets[0].name} gains myriad.`);
        }
      },
    }],
  };
  SC['Legion Warboss'] = {
    triggers: [
      {
        on: 'beginCombat', desc: 'Goblin (haste, attacking)', filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => {
          const made = await ctx.g.makeTokens('goblin', ctx.you, { haste: true });
          if (made[0]) made[0].meta.mustAttackTurn = ctx.g.turnNo;
        },
      },
      {
        on: 'attacks', desc: 'Mentor', filter: (g, self, d) => d.card === self,
        targets: [T.yourCreature({
          prompt: 'Mentor: attacker with lesser power',
          filter: (g, card, ctrl, src) => card.zone === 'battlefield' && card.ctrl === ctrl && !!card.attacking && card.power < src.power,
          aiHint: { goal: 'buff' },
        })],
        run: async ctx => {
          if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1);
        },
      },
    ],
  };
  SC['Loyal Apprentice'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Thopter',
      filter: (g, self, d) => d.player === self.ctrl && g.bf().some(c => c.commander && c.ctrl === self.ctrl),
      run: async ctx => {
        if (ctx.g.bf().some(c => c.commander && c.ctrl === ctx.you)) await ctx.g.makeTokens('thopter', ctx.you, { haste: true });
      },
    }],
  };
  SC['Mindblade Render'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Warrior → card',
      filter: (g, self, d) => d.player !== self.ctrl && d.cards.some(card => card.ctrl === self.ctrl && card.hasSub('Warrior')),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); await ctx.g.loseLife(ctx.you, 1, 'render'); },
    }],
  };
  SC['Myr Battlesphere'] = {
    triggers: [
      { on: 'etb', desc: '4 Myra', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('myr', ctx.you, { n: 4 }); } },
      {
        on: 'attacks', desc: 'Tap Myr → +X', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const myrs = ctx.g.creatures(ctx.you).filter(c => c.hasSub('Myr') && !c.tapped && c !== ctx.src);
          if (!myrs.length) return;
          const pick = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: myrs, min: 0, max: myrs.length, prompt: 'Tap Myr (+X/+0 and X damage)',
            aiHint: { kind: 'myrBattlesphere', source: ctx.src, target: ctx.src.attacking },
          });
          const x = pick.length;
          if (!x) return;
          for (const m of pick) m.tapped = true;
          E.pumpUntilEOT(ctx.g, ctx.src, x, 0);
          if (ctx.src.attacking) await ctx.g.damageAny(ctx.src, ctx.src.attacking, x);
        },
      },
    ],
  };
  SC['Neriv, Crackling Vanguard'] = {
    triggers: [
      { on: 'etb', desc: '2 Goblins', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('goblin', ctx.you, { n: 2 }); } },
      {
        on: 'attacks', desc: 'Exile = different tokens', filter: (g, self, d) => d.card === self,
        run: async ctx => {
          const names = new Set(ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken).map(c => c.name));
          const n = names.size;
          for (let i = 0; i < n && ctx.you.library.length; i++) {
            const c = ctx.you.library.pop();
            c.zone = 'exile'; ctx.you.exile.push(c);
            c.meta = c.meta || {};
            c.meta.playableBy = ctx.you;
            c.meta.playableUntil = 9999;
            delete c.meta.spellsOnly;
            c.meta.playableCondition = (g, player) => !!player.turnState.attackedWithCommander;
            ctx.g.lg(`Neriv exiles ${c.name} (play it on a turn you attacked with a commander).`);
          }
        },
      },
    ],
  };
  SC['Ogre Battledriver'] = {
    triggers: [{
      on: 'etb', desc: '+2/+0 and haste',
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
      on: 'upkeep', desc: 'Snake', filter: (g, self) => !g.creatures(self.ctrl).some(c => c.hasSub('Snake')),
      run: async ctx => {
        if (!ctx.g.creatures(ctx.you).some(c => c.hasSub('Snake'))) await ctx.g.makeTokens('snakeB', ctx.you);
      },
    }],
  };
  SC['Redoubled Stormsinger'] = {
    triggers: [{
      on: 'attacks', desc: 'Copy new tokens', filter: (g, self, d) => d.card === self,
      run: async ctx => {
        if (!ctx.src.attacking) return;
        const fresh = ctx.g.bf().filter(c => c.ctrl === ctx.you && c.isToken && c.is('Creature') && c.meta._enteredTurn === ctx.g.turnNo);
        const madeAll = [];
        for (const t of fresh) {
          const made = await ctx.g.copyPermanentToken(t, ctx.you, {
            tapped: true,
            attacking: ctx.src.attacking,
            chooseAttacking: (game, token) => game.chooseAttackingDestination(ctx.you, null, token, 'Redoubled Stormsinger'),
          });
          madeAll.push(...made);
        }
        if (madeAll.length) E7.sacAtNextEnd(ctx.g, madeAll, ctx.you);
      },
    }],
  };
  SC['Thalisse, Reverent Medium'] = {
    triggers: [{
      on: 'endStep', desc: 'Spirits = tokens created',
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
      label: '2 Spirits', cost: { mana: '{2}{W}', rmCounter: { kind: '+1/+1', n: 1 } },
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
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1); },
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
        label: '+1: Deathtouch to all', loyalty: 1, sorcery: true,
        targets: [T.yourCreature({
          prompt: 'Up to one creature token for a +1/+1 counter', upTo: true,
          filter: (g, card, ctrl) => card.zone === 'battlefield' && card.ctrl === ctrl && card.isToken,
          aiHint: { goal: 'buff' },
        })],
        run: async ctx => {
          for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['deathtouch']);
          if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 1);
        },
      },
      {
        label: '-2: Double tokens (EOT)', loyalty: -2, sorcery: true,
        run: async ctx => {
          ctx.g.untilEffects.push({
            expires: 'eot', kind: 'tokenDouble', who: ctx.you,
            sourceCard: ctx.src, label: 'Kaya, Geist Hunter',
          });
          ctx.g.lg('Kaya: tokens are doubled until end of turn.');
        },
      },
      {
        label: '-6: Exile graveyards → Spirits', loyalty: -6, sorcery: true,
        run: async ctx => {
          let n = 0;
          for (const q of ctx.g.players) {
            for (const c of q.graveyard.slice()) {
              await ctx.g.move(c, 'exile');
              if (c.zone === 'exile') n++;
            }
          }
          await ctx.g.makeTokens('spiritW', ctx.you, { n });
        },
      },
    ],
  };
  SC['Bitter Triumph'] = {
    addlCost: { discardOrLife: 3, choiceKind: 'bitterTriumphCost' },
    targets: [{
      what: 'permanent', prompt: 'Creature/planeswalker',
      filter: (g, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); },
  };
  SC['Grand Crescendo'] = {
    xCost: true,
    resolve: async ctx => {
      await ctx.g.makeTokens('citizen', ctx.you, { n: ctx.x || 0 });
      for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['indestructible']);
    },
  };
  SC['Stroke of Midnight'] = {
    targets: [T.permanent((g, c) => !c.is('Land'), { prompt: 'Destroy a nonland permanent', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], owner = t.ctrl;
      await ctx.g.destroy(t);
      await ctx.g.makeTokens('humanW', owner);
    },
  };
  SC['Will of the Mardu'] = {
    modes: {
      pick: 1,
      aiHint: { kind: 'willMardu' },
      list: [
        { label: 'Warrior tokens per target player', targets: [T.player({ prompt: 'Player whose creatures you count', aiHint: { goal: 'marduTokenCount' } })] },
        { label: 'Damage to target creature', targets: [T.creature({ prompt: 'Creature to damage', aiHint: { goal: 'removal' } })] },
      ],
    },
    castCondBoth: true,
    resolve: async ctx => {
      let targetIndex = 0;
      for (const mode of ctx.mode || []) {
        const target = ctx.targets[targetIndex++];
        if (mode === 0 && target) {
          await ctx.g.makeTokens('warriorR', ctx.you, { n: ctx.g.creatures(target).length });
        } else if (mode === 1 && target) {
          const n = ctx.g.creatures(ctx.you).length;
          if (n > 0) await ctx.g.damageCreature(ctx.src, target, n);
        }
      }
    },
  };
  SC['Eliminate the Competition'] = {
    addlCost: { sacCreaturesEqualTargets: true, aiKind: 'eliminateSacrifice' },
    targets: (g, card, castOpts, caster) => [{
      what: 'creature', count: g.creatures(caster).filter(creature => g.canSacrifice(creature)).length,
      upTo: true, prompt: 'Creatures to destroy (you sacrifice the same number)', aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [ctx.targets[0]].filter(Boolean);
      await ctx.g.destroyMany(targets);
    },
  };
  SC['Hour of Reckoning'] = {
    convoke: true,
    resolve: async ctx => {
      await ctx.g.destroyMany(ctx.g.bf().filter(c => c.is('Creature') && !c.isToken));
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
          type: 'chooseOption', prompt: `Tempting offer: you also create ${x} Elementals?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'temptingOffer', caster: ctx.you, x },
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
      label: 'Sac: search for a basic (tapped)', cost: { tap: true, sacSelf: true, mana: '{2}' },
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
      applies: (g, defs) => defs.some(d => (typeof d === 'string' ? TK[d] : d)?.types?.includes('Creature')),
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
      on: 'etb', desc: 'Draw (1×/turn)', oncePerTurn: true,
      filter: (g, self, d) => d.card.ctrl === self.ctrl && d.card.is('Creature') && d.card.mv <= 3 && d.card !== self,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Within Range'] = {
    triggers: [
      { on: 'etb', desc: '2 Warriors', filter: etbSelf, run: async ctx => { await ctx.g.makeTokens('warriorR', ctx.you, { n: 2 }); } },
      {
        on: 'attackersDeclared', desc: 'Life loss', filter: (g, self, d) => d.player === self.ctrl,
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
