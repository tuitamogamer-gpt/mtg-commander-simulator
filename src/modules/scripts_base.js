// ===== scripts_base.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Tokens, effect helpers, keyword loader, shared card scripts
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  // ============================================================
  // TOKENS
  // ============================================================
  const tok = (name, cost, types, subtypes, p, t, extra) => Object.assign({
    name, cost: cost || null, types, subtypes: subtypes || [], super: [],
    power: p !== undefined ? String(p) : undefined, toughness: t !== undefined ? String(t) : undefined,
    oracle: '', kws: [], isTokenDef: true,
  }, extra || {});

  MTG.TOKENS = {
    squirrel: tok('Squirrel', null, ['Creature'], ['Squirrel'], 1, 1, { colorsOverride: ['G'] }),
    saproling: tok('Saproling', null, ['Creature'], ['Saproling'], 1, 1, { colorsOverride: ['G'] }),
    rat: tok('Rat', null, ['Creature'], ['Rat'], 1, 1, { colorsOverride: ['B'] }),
    pest: tok('Pest', null, ['Creature'], ['Pest'], 1, 1, {
      colorsOverride: ['B', 'G'],
      triggers: [{ on: 'dies', filter: (g, self, d) => d.card === self, run: async ctx => { await ctx.g.gainLife(ctx.you, 1); }, desc: 'Pest: +1 život' }],
    }),
    goat: tok('Goat', null, ['Creature'], ['Goat'], 0, 1, { colorsOverride: ['W'] }),
    wolfG: tok('Wolf', null, ['Creature'], ['Wolf'], 2, 2, { colorsOverride: ['G'] }),
    wolfGarruk: tok('Wolf', null, ['Creature'], ['Wolf'], 2, 2, {
      colorsOverride: ['B', 'G'],
      triggers: [{
        on: 'dies', filter: (g, self, d) => d.card === self, desc: 'Wolf: loyalty za Garruka',
        run: async ctx => {
          for (const c of ctx.g.bf()) if (c.name.startsWith('Garruk') && c.is('Planeswalker') && c.ctrl === ctx.you) ctx.g.addCounters(c, 'loyalty', 1);
        },
      }],
    }),
    beast33: tok('Beast', null, ['Creature'], ['Beast'], 3, 3, { colorsOverride: ['G'] }),
    beast44: tok('Beast', null, ['Creature'], ['Beast'], 4, 4, { colorsOverride: ['G'] }),
    cat22: tok('Cat', null, ['Creature'], ['Cat'], 2, 2, { colorsOverride: ['G'] }),
    devil: tok('Devil', null, ['Creature'], ['Devil'], 1, 1, {
      colorsOverride: ['R'],
      triggers: [{
        on: 'dies', filter: (g, self, d) => d.card === self, desc: 'Devil: 1 šteta',
        targets: [{ what: 'any', aiHint: { goal: 'damage', n: 1 } }],
        run: async ctx => { await ctx.g.damageAny(ctx.src, ctx.targets[0], 1); },
      }],
    }),
    drake: tok('Drake', null, ['Creature'], ['Drake'], 2, 2, { colorsOverride: ['U'], kws: ['flying'] }),
    birdIllusion: tok('Bird Illusion', null, ['Creature'], ['Bird', 'Illusion'], 1, 1, { colorsOverride: ['U'], kws: ['flying'] }),
    birdW: tok('Bird', null, ['Creature'], ['Bird'], 1, 1, { colorsOverride: ['W'], kws: ['flying'] }),
    elemental11: tok('Elemental', null, ['Creature'], ['Elemental'], 1, 1, { colorsOverride: ['R'] }),
    soldierArt: tok('Soldier', null, ['Artifact', 'Creature'], ['Soldier'], 1, 1, { colorsOverride: [] }),
    dragonElemental: tok('Dragon Elemental', null, ['Creature'], ['Dragon', 'Elemental'], 4, 4, { colorsOverride: ['R'], kws: ['flying', 'prowess'] }),
    humanSoldier: tok('Human Soldier', null, ['Creature'], ['Human', 'Soldier'], 1, 1, { colorsOverride: ['W'] }),
    spider12: tok('Spider', null, ['Creature'], ['Spider'], 1, 2, { colorsOverride: ['G'], kws: ['reach'] }),
    insectFD: tok('Insect', null, ['Creature'], ['Insect'], 1, 1, { colorsOverride: ['G'], kws: ['flying', 'deathtouch'] }),
    wall13: tok('Wall', null, ['Creature'], ['Wall'], 1, 3, { colorsOverride: ['W'], kws: ['defender'] }),
    inkling: tok('Inkling', null, ['Creature'], ['Inkling'], 2, 1, { colorsOverride: ['W', 'B'], kws: ['flying'] }),
    boar22: tok('Boar', null, ['Creature'], ['Boar'], 2, 2, { colorsOverride: ['G'] }),
    ape33: tok('Ape', null, ['Creature'], ['Ape'], 3, 3, { colorsOverride: ['G'] }),
    hamster: tok('Hamster', null, ['Creature'], ['Hamster'], 1, 1, { colorsOverride: ['R'] }),
    raccoon33: tok('Raccoon', null, ['Creature'], ['Raccoon'], 3, 3, { colorsOverride: ['G'] }),
    eldrazi1010: tok('Eldrazi', null, ['Creature'], ['Eldrazi'], 10, 10, { colorsOverride: [] }),
    shapeshifter: tok('Shapeshifter', null, ['Creature'], ['Shapeshifter'], 2, 2, { colorsOverride: ['U'], changeling: true }),
    shapeshifter32: tok('Shapeshifter', null, ['Creature'], ['Shapeshifter'], 3, 2, {
      colorsOverride: [], changeling: true,
      oracle: 'Changeling (This creature has all creature types.)',
    }),
    treasure: tok('Treasure', null, ['Artifact'], ['Treasure'], undefined, undefined, {
      mana: { cost: { tap: true, sacSelf: true }, produce: [{ ANY: true, n: 1 }] },
    }),
    food: tok('Food', null, ['Artifact'], ['Food'], undefined, undefined, {
      abilities: [{
        label: 'Žrtvuj: +3 života', cost: { mana: '{2}', tap: true, sacSelf: true },
        run: async ctx => { await ctx.g.gainLife(ctx.you, 3); },
      }],
    }),
    clue: tok('Clue', null, ['Artifact'], ['Clue'], undefined, undefined, {
      abilities: [{
        label: 'Žrtvuj: vuci kartu', cost: { mana: '{2}', sacSelf: true },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      }],
    }),
    blood: tok('Blood', null, ['Artifact'], ['Blood'], undefined, undefined, {
      abilities: [{
        label: 'Žrtvuj: rummage', cost: { mana: '{1}', tap: true, sacSelf: true, discard: 1 },
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      }],
    }),
    shark: tok('Shark', null, ['Creature'], ['Shark'], 0, 0, { colorsOverride: ['U'], kws: ['flying'] }),
    // Job select (Final Fantasy) — 1/1 bezbojni Hero na koji se oprema sama kači
    hero11: tok('Hero', null, ['Creature'], ['Hero'], 1, 1, { colorsOverride: [] }),
    moogle12: tok('Moogle', null, ['Creature'], ['Moogle'], 1, 2, { colorsOverride: ['W'], kws: ['lifelink'] }),
    wizard01: tok('Wizard', null, ['Creature'], ['Wizard'], 0, 1, {
      colorsOverride: ['B'],
      triggers: [{
        on: 'castNonCreature', desc: 'Wizard: 1 šteta svakom protivniku',
        filter: (g, self, d) => d.player === self.ctrl,
        run: async ctx => { await ctx.g.damageOpponents(ctx.src, ctx.you, 1); },
      }],
    }),
  };

  // ============================================================
  // TOKEN IMAGES — tačan Scryfall print (set/collector) po imenu tokena.
  // Scryfall `named?exact=` za imena tokena zna vratiti dvostrani token
  // ("Dinosaur // Treasure" → prikaže dinosaurusa) ili pogrešnu kartu.
  // Ova mapa fiksira ispravan jednostrani print; imena koja nisu ovdje idu
  // starim putem. Nijedno ime tokena se ne poklapa sa pravom kartom u setu.
  // ============================================================
  MTG.TOKEN_IMG = {
    'Squirrel': 'tmsh/14', 'Saproling': 'tsoc/18', 'Rat': 'plst/TWOE-7', 'Pest': 'tsos/9',
    'Goat': 'tmsc/22', 'Wolf': 'thob/9', 'Beast': 'tmsc/27', 'Cat': 'tsoc/2', 'Devil': 'tdsc/7',
    'Drake': 'tfdn/8', 'Bird Illusion': 'totc/4', 'Bird': 'tmsc/21', 'Elemental': 'tsoc/20',
    'Soldier': 'tmsh/23', 'Dragon Elemental': 'totc/13', 'Human Soldier': 'thob/2',
    'Spider': 'tspm/3', 'Insect': 'tmsh/12', 'Wall': 'ttdc/7', 'Inkling': 'tsos/7',
    'Boar': 'tsoc/15', 'Ape': 'tm3c/14', 'Hamster': 'tblc/22', 'Raccoon': 'tfdn/20',
    'Eldrazi': 'plst/TM3C-1', 'Shapeshifter': 'tmsc/18', 'Treasure': 'thob/13', 'Food': 'sld/2551',
    'Clue': 'tmsh/17', 'Blood': 'sld/2180', 'Shark': 'tdsc/4', 'Hero': 'tfin/33',
    'Moogle': 'tfin/34', 'Wizard': 'tfin/35', 'Human': 'ttdc/5', 'Ogre': 'tmkc/14',
    'Kobolds of Kher Keep': 'plst/TMKC-12', 'Construct': 'tmsc/30', 'Gold': 'ttdc/29',
    'Lightning Rager': 'tmkc/13', 'Thopter': 'tsoc/28', 'Phyrexian Golem': 'tblc/38',
    'Goblin': 'sld/2421', 'Spirit': 'tsoc/6', 'Faerie': 'tecl/5', 'Frog Lizard': 'tsoc/16',
    'Rabbit': 'tfdn/5', 'Citizen': 'ttdc/26', 'Detective': 'tmkm/10', "Koma's Coil": 'tfdn/11',
    'Tentacle': 'tmkc/9', 'Tiny': 'plst/TMKC-21', 'Rhino Warrior': 'tecc/6', 'Germ': 'tznc/4',
    'Storm Crow': 'tblc/18', 'Illusion': 'tsoc/7', 'Mutagen': 'ttmt/9', 'Ninja': 'ttmt/5',
    'Ooze': 'sld/2819', 'Robot': 'ttmt/10', 'Warrior': 'ttdm/13', 'Snake': 'tsoc/11',
    'Zombie': 'tsoc/12', 'Elf Warrior': 'sld/7170', 'Myr': 'sld/2101', 'Servo': 'ttdc/31',
    'Gnome': 'teoc/11', 'Golem': 'teoc/14', 'Scarecrow': 'tecc/11', 'Mercenary': 'totj/10',
    'Assassin': 'tacr/4', 'Rogue': 'tmsc/25', 'Angel': 'tmsc/20', 'Dog': 'plst/TMKM-1',
    'Bat': 'tblb/10', 'Phyrexian Myr': 'tsoc/8', 'Merfolk': 'tmsh/24', 'Villain': 'tmsh/25',
    'Robot Villain': 'tmsh/26', 'Ape Villain': 'tmsc/26', 'Ox': 'tmsc/23', 'Elephant': 'tmsc/28',
    'Vibranium': 'tmsc/31', 'Eldrazi Spawn': 'plst/TMH3-2', 'Knight': 'tfin/10',
    'Centaur': 'trvr/10', 'Rhino': 'tmsc/29', 'Dragon Illusion': 'tsoc/13',
  };

  // ============================================================
  // Effect helpers
  // ============================================================
  const E = MTG.E = {};

  E.canPlayLandNow = function (g, p) {
    return !!g && !!p && g.turnPlayer === p && !g.stack.length &&
      (g.phase === 'main1' || g.phase === 'main2') &&
      p.landsPlayed < g.landPlayLimit(p);
  };

  E.playExiledLand = async function (g, p, card) {
    if (!card || !card.is('Land') || card.zone !== 'exile' || !E.canPlayLandNow(g, p)) return false;
    card.meta = card.meta || {};
    const permissionKeys = ['playableBy', 'playableUntil', 'playableUntilOwnTurn', 'spellsOnly', 'playableCondition'];
    const previous = new Map(permissionKeys.map(key => [key, {
      present: Object.prototype.hasOwnProperty.call(card.meta, key), value: card.meta[key],
    }]));
    card.meta.playableBy = p;
    card.meta.playableUntil = g.turnNo;
    delete card.meta.playableUntilOwnTurn;
    delete card.meta.spellsOnly;
    delete card.meta.playableCondition;
    let played = false;
    try {
      played = await g.playLand(p, card);
    } finally {
      if (!played && card.zone === 'exile') {
        for (const key of permissionKeys) delete card.meta[key];
        for (const [key, saved] of previous) if (saved.present) card.meta[key] = saved.value;
      }
    }
    return played;
  };

  // Damage that is "divided as you choose" is locked in while the spell or
  // trigger is put on the stack.  Every decision carries the complete split
  // context so the human UI can show all selected targets, numbered rows and
  // the remaining damage instead of a sequence of unrelated X prompts.
  E.divideDamage = async function (g, player, source, targets, total, opts = {}) {
    const chosenTargets = (targets || []).flat().filter(Boolean);
    const amount = Math.max(0, Number(total) || 0);
    if (!chosenTargets.length) return [];
    if (amount < chosenTargets.length) return null;
    const division = [];
    let left = amount;
    for (let index = 0; index < chosenTargets.length; index++) {
      const target = chosenTargets[index];
      const remainingTargets = chosenTargets.length - index - 1;
      const max = left - remainingTargets;
      const min = remainingTargets === 0 ? left : 1;
      const allocation = {
        kind: 'damage', source, total: amount, targets: chosenTargets.slice(),
        assigned: division.map((entry, assignedIndex) =>
          Object.assign({ target: chosenTargets[assignedIndex] }, entry)),
        index, left,
      };
      // Ask even for the final forced value (min === max).  That last review is
      // intentional: the player sees the complete split before it is locked.
      const raw = await player.controller.decide(g, {
        type: 'chooseX', min, max, card: source, src: source,
        prompt: `${source.name}: damage for ${target.name} (${left} remaining)`,
        allocation,
        aiHint: {
          kind: opts.aiKind || 'dividedDamage', card: source, target, left,
          remaining: remainingTargets, remainingTargets,
        },
      });
      const n = Math.max(min, Math.min(Number(raw) || min, max));
      division.push({
        iid: target.iid,
        playerIdx: target instanceof MTG.Player ? target.idx : null,
        n,
      });
      left -= n;
    }
    return left === 0 ? division : null;
  };

  E.searchBasic = async function (g, p, opts = {}) {
    // opts: {n, toHandN, tapped, filter(def), prompt}
    const n = opts.n || 1;
    const cands = p.library.filter(c => (c.cur, c.def.super || []).includes('Basic') && (!opts.filter || opts.filter(c.def)));
    const uniq = [];
    const seen = new Set();
    for (const c of cands) if (!seen.has(c.name)) { seen.add(c.name); uniq.push(c); }
    if (!cands.length) { U.shuffle(p.library, g.rnd); return []; }
    const got = [];
    for (let i = 0; i < n; i++) {
      const avail = p.library.filter(c => (c.def.super || []).includes('Basic') && (!opts.filter || opts.filter(c.def)));
      if (!avail.length) break;
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: avail, min: 0, max: 1, prompt: opts.prompt || 'Nađi basic land',
        aiHint: { kind: 'searchBasic' }, search: true,
      });
      if (!picked.length) break;
      const c = picked[0];
      p.library.splice(p.library.indexOf(c), 1);
      if (opts.toHand || (opts.toHandN && i >= (opts.bfN || 1))) {
        c.zone = 'hand'; p.hand.push(c);
        g.lg(`${U.playerVerb(p, 'search for', 'searches for')} ${c.name} to hand.`);
      } else {
        c.zone = 'nowhere';
        await g.move(c, 'battlefield', { ctrl: p, tapped: opts.tapped !== false });
        g.lg(`${U.playerVerb(p, 'put', 'puts')} ${c.name} onto the battlefield${opts.tapped !== false ? ' (tapped)' : ''}.`);
      }
      got.push(c);
    }
    U.shuffle(p.library, g.rnd);
    return got;
  };

  E.searchLandByName = async function (g, p, names, opts = {}) {
    const avail = p.library.filter(c => c.is('Land') && (names.some(nm => c.name === nm || c.hasSub && c.def.subtypes.includes(nm))));
    if (!avail.length) { U.shuffle(p.library, g.rnd); return null; }
    const picked = await p.controller.decide(g, {
      type: 'chooseCards', from: avail, min: 0, max: 1, prompt: 'Nađi land', aiHint: { kind: 'searchBasic' }, search: true,
    });
    if (!picked.length) { U.shuffle(p.library, g.rnd); return null; }
    const c = picked[0];
    p.library.splice(p.library.indexOf(c), 1);
    if (opts.toHand) {
      c.zone = 'hand'; p.hand.push(c);
      g.lg(`${U.playerVerb(p, 'search for', 'searches for')} ${c.name} to hand.`);
    } else {
      c.zone = 'nowhere';
      await g.move(c, 'battlefield', { ctrl: p, tapped: opts.tapped !== false });
    }
    U.shuffle(p.library, g.rnd);
    return c;
  };

  E.scry = async function (g, p, n) {
    if (!p.library.length || n <= 0) return;
    const top = p.library.slice(-n).reverse();
    const keep = await p.controller.decide(g, {
      type: 'scry', cards: top, prompt: `Scry ${n}`, player: p,
    });
    // keep: {top:[cards in order], bottom:[cards]}
    for (const c of top) p.library.splice(p.library.indexOf(c), 1);
    for (const c of keep.bottom) c.zone = 'library';
    p.library.unshift(...keep.bottom);
    for (const c of keep.top.slice().reverse()) { c.zone = 'library'; p.library.push(c); }
    if (keep.bottom.length) g.lg(`${p.name} scry ${n}: ${keep.bottom.length} na dno.`);
    else g.lg(`${p.name} scry ${n}.`);
    await g.emit('scry', { player: p, n: top.length, cards: top.slice() });
  };

  E.surveil = async function (g, p, n) {
    if (!p.library.length || n <= 0) return;
    const top = p.library.slice(-n).reverse();
    const keep = await p.controller.decide(g, {
      type: 'scry', cards: top, prompt: `Surveil ${n}`, player: p, surveil: true,
    });
    for (const c of top) p.library.splice(p.library.indexOf(c), 1);
    for (const c of keep.bottom) { await g.move(c, 'graveyard'); }
    for (const c of keep.top.slice().reverse()) { c.zone = 'library'; p.library.push(c); }
  };

  E.pumpUntilEOT = function (g, card, dp, dt, kws) {
    const iid = card.iid, timestamp = card.timestamp;
    g.untilEffects.push({
      expires: 'eot', kind: 'pump',
      apply: (g2, bf) => {
        const c = bf.find(x => x.iid === iid && x.timestamp === timestamp);
        if (!c) return;
        c.cur.power += dp; c.cur.toughness += dt;
        if (kws) for (const k of kws) c.cur.kw.add(k);
      },
    });
    g.recalc();
    const stat = `${dp >= 0 ? '+' : ''}${dp}/${dt >= 0 ? '+' : ''}${dt}`;
    const extra = kws && kws.length ? ` i ${kws.join(', ')}` : '';
    g.notifyEffect(`✨ ${card.name} dobija ${stat}${extra} do kraja poteza.`, { kind: 'temporaryEffect', card });
  };

  E.pumpAllUntilEOT = function (g, filter, dp, dt, kws) {
    // tolerancija: neko proslijedi Playera umjesto filtera → "moja stvorenja"
    if (filter && typeof filter !== 'function') {
      const owner = filter;
      filter = (g2, c) => c.ctrl === owner;
    }
    if (!filter) filter = () => true;
    g.untilEffects.push({
      expires: 'eot', kind: 'pumpAll',
      apply: (g2, bf) => {
        for (const c of bf) {
          if (!c.is('Creature')) continue;
          if (!filter(g2, c)) continue;
          c.cur.power += dp; c.cur.toughness += dt;
          if (kws) for (const k of kws) c.cur.kw.add(k);
        }
      },
    });
    g.recalc();
    const affected = g.bf().filter(c => c.is('Creature') && filter(g, c));
    const stat = `${dp >= 0 ? '+' : ''}${dp}/${dt >= 0 ? '+' : ''}${dt}`;
    const extra = kws && kws.length ? ` i ${kws.join(', ')}` : '';
    if (affected.length) g.notifyEffect(`✨ ${affected.length} stvorenja dobijaju ${stat}${extra} do kraja poteza.`, {
      kind: 'temporaryEffect', cards: affected,
    });
  };

  E.grantUntilEOT = function (g, card, kws) { E.pumpUntilEOT(g, card, 0, 0, kws); };

  E.reanimate = async function (g, p, card, opts = {}) {
    if (card.zone !== 'graveyard') return null;
    await g.move(card, 'battlefield', { ctrl: p, tapped: opts.tapped });
    g.lg(`${p.name} vraća ${card.name} iz groblja na battlefield.`);
    return card;
  };

  E.mayDrawDiscard = async function (g, p, drawN, discardN) {
    await g.draw(p, drawN);
    if (discardN > 0 && p.hand.length) {
      const n = Math.min(discardN, p.hand.length);
      const picked = await p.controller.decide(g, {
        type: 'chooseCards', from: p.hand, min: n, max: n, prompt: `Odbaci ${n}`, aiHint: { kind: 'cleanupDiscard' },
      });
      await g.discard(p, picked);
    }
  };

  E.exileTopPlayable = function (g, p, card, n, duration) {
    // exile top N, playable until end of (this|next) turn
    const out = [];
    for (let i = 0; i < n && p.library.length; i++) {
      const c = p.library.pop();
      c.zone = 'exile'; p.exile.push(c);
      c.meta = c.meta || {};
      if (duration === 'next') c.meta.playableUntilOwnTurn = p.turnsStarted + 1;
      else c.meta.playableUntil = g.turnNo;
      c.meta.playableBy = p;
      c.meta.impulseSrc = card ? card.name : '';
      out.push(c);
    }
    if (out.length) g.lg(`${p.name} egzilira ${out.length} s vrha (može igrati: ${out.map(c => c.name).join(', ')}).`);
    return out;
  };

  E.eachOpp = function (g, p) { return g.alivePlayers().filter(q => q !== p); };

  // "Choose an opponent" nije targeting: ne smije okidati ward/crime niti
  // koristiti target prečice, ali ljudski igrač i dalje mora dobiti stvaran
  // izbor između svih živih protivnika.
  E.chooseOpponent = async function (g, p, opts = {}) {
    const opponents = (opts.candidates || E.eachOpp(g, p))
      .filter(q => q && q !== p && !q.lost);
    if (!opponents.length) return null;
    if (opponents.length === 1) return opponents[0];
    const options = opponents.map(player => ({
      key: String(player.idx), label: player.name, player,
    }));
    const key = await p.controller.decide(g, {
      type: 'chooseOption', player: p,
      prompt: opts.prompt || 'Izaberi protivnika', options,
      aiHint: Object.assign({ kind: 'chooseOpponent', goal: opts.goal || 'delegate' }, opts.aiHint || {}),
    });
    return opponents.find(player => String(player.idx) === String(key)) || opponents[0];
  };

  E.chooseCreature = async function (g, p, pool, prompt, aiHint) {
    if (!pool.length) return null;
    const picked = await p.controller.decide(g, {
      type: 'chooseCards', from: pool, min: 1, max: 1, prompt, aiHint: aiHint || { kind: 'chooseCreature' },
    });
    return picked[0] || null;
  };

  E.mayCastFree = async function (g, p, card, opts = {}) {
    const yes = await p.controller.decide(g, {
      type: 'chooseOption', prompt: `Baci ${card.name} besplatno?`,
      card,
      options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
      aiHint: { kind: 'freeCast', card },
    });
    if (yes !== 'yes') return false;
    return g.castSpell(p, card, { alt: { free: true }, from: card.zone, xVal: opts.xVal });
  };

  // ============================================================
  // Target spec shortcuts
  // ============================================================
  MTG.isUncounterable = (g, so) => {
    if (so.card.def.uncounterable) return true;
    if (so.card.is('Creature') && so.ctrl.turnState && so.ctrl.turnState.uncounterableCreatureSpells) return true;
    return g.bf().some(c => c.def.uncounterableSpells === 'all' ||
      c.def.uncounterableSpells === true && c.ctrl === so.ctrl);
  };
  const T = MTG.T = {
    creature: (o) => Object.assign({ what: 'creature', filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') }, o),
    oppCreature: (o) => Object.assign({
      what: 'creature',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl !== ctrl,
    }, o),
    yourCreature: (o) => Object.assign({
      what: 'creature',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl,
    }, o),
    permanent: (f, o) => Object.assign({
      what: 'permanent', filter: (g, c, ctrl) => c.zone === 'battlefield' && (!f || f(g, c, ctrl)),
    }, o),
    any: (o) => Object.assign({ what: 'any' }, o),
    player: (o) => Object.assign({ what: 'player' }, o),
    opponent: (o) => Object.assign({ what: 'opponent' }, o),
    spell: (f, o) => Object.assign({
      zone: 'stack', what: 'spell',
      filter: (g, so, ctrl, src) => so.kind === 'spell' && (!f || f(g, so, ctrl, src)),
    }, o),
    ability: (f, o) => Object.assign({ zone: 'stack', what: 'ability', filter: (g, so, ctrl, src) => (so.kind === 'ability' || so.kind === 'trigger') && (!f || f(g, so, ctrl, src)) }, o),
    gyCreature: (o) => Object.assign({
      zone: 'graveyard', what: 'card', filter: (g, c) => c.is('Creature'),
    }, o),
  };

  // ============================================================
  // Keyword loader
  // ============================================================
  const SIMPLE_KWS = ['flying', 'first strike', 'double strike', 'deathtouch', 'lifelink', 'trample',
    'haste', 'vigilance', 'menace', 'reach', 'defender', 'indestructible', 'hexproof', 'shroud', 'flash', 'prowess', 'forestwalk', 'wither'];

  MTG.buildDefs = function (rawCards, scripts) {
    // Skup stvarnih tipova stvorenja iz baze — koristi ga CardInst.hasSub da
    // "svaki tip stvorenja" (changeling, Maskwood Nexus) ne obuhvati i
    // Aura/Equipment/Vehicle i slične ne-creature podtipove.
    // Karte tipa "Kindred Enchantment — Treefolk Aura" nose i jedno i drugo, pa
    // se podtipovi koji se pojavljuju na ne-stvorenjima oduzimaju.
    {
      const creature = new Set(), other = new Set();
      for (const raw of Object.values(rawCards)) {
        const t = raw.types || [];
        const isCre = t.includes('Creature') || t.includes('Kindred') || t.includes('Tribal');
        for (const s of raw.subtypes || []) (isCre ? creature : other).add(s);
      }
      for (const s of other) creature.delete(s);
      MTG.CREATURE_SUBTYPES = creature;
    }
    const defs = {};
    for (const [name, raw] of Object.entries(rawCards)) {
      const d = Object.assign({}, raw);
      d.kws = d.kws || [];
      const oracle = (d.oracle || '');
      // keyword lines: check first 2 lines for comma-separated keywords
      const lines = oracle.split('\n');
      for (const line of lines.slice(0, 3)) {
        const clean = line.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
        if (!clean) continue;
        const parts = clean.split(/,\s*/);
        if (parts.every(part => SIMPLE_KWS.includes(part.trim()) || /^ward/.test(part) || part === 'shroud' || part === 'skulk' || /^myriad/.test(part) || /^flanking/.test(part) || /^ascend/.test(part))) {
          for (const part of parts) {
            const t = part.trim();
            if (SIMPLE_KWS.includes(t)) d.kws.push(t);
            else if (t.startsWith('ward')) {
              const m = /ward\s*\{(\d+)\}/.exec(t);
              if (m) d.ward = { mana: '{' + m[1] + '}' };
            }
          }
        }
      }
      // ward — pay N life
      const wl = /Ward\s*[—-]\s*Pay (\d+) life/i.exec(oracle);
      if (wl) d.ward = { life: parseInt(wl[1], 10) };
      const wm = /Ward\s*\{(\d+)\}/.exec(oracle);
      if (wm && !d.ward) d.ward = { mana: '{' + wm[1] + '}' };
      // Face-down creature manifestovan/cloakovan smije se okrenuti i za
      // vlastiti morph/disguise trosak, ako ga karta ima.
      const morph = /(?:^|\n)Morph\s+((?:\{[^}]+\})+)/i.exec(oracle);
      const disguise = /(?:^|\n)Disguise\s+((?:\{[^}]+\})+)/i.exec(oracle);
      if (morph) d.morph = morph[1];
      if (disguise) d.disguise = disguise[1];
      // merge script
      const sc = scripts[name];
      if (sc) {
        for (const [k, v] of Object.entries(sc)) {
          if (k === 'kws') d.kws = d.kws.concat(v);
          else d[k] = v;
        }
      }
      d.kws = [...new Set(d.kws)];
      // prowess as trigger
      if (d.kws.includes('prowess')) {
        d.triggers = (d.triggers || []).concat([{
          on: 'castNonCreature', desc: 'Prowess',
          filter: (g, self, data) => data.player === self.ctrl,
          run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 1); },
        }]);
      }
      defs[name] = d;
    }
    // Token defovi ne prolaze kroz petlju iznad, pa im keywordi koji se
    // implementiraju kao triger ostaju mrtvi (Dragon Elemental ima prowess u
    // kws, ali bez ovoga nikad ne dobije +1/+1).
    for (const t of Object.values(MTG.TOKENS || {})) {
      if ((t.kws || []).includes('prowess') && !(t.triggers || []).some(x => x.desc === 'Prowess')) {
        t.triggers = (t.triggers || []).concat([{
          on: 'castNonCreature', desc: 'Prowess',
          filter: (g, self, data) => data.player === self.ctrl,
          run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 1); },
        }]);
      }
    }
    return defs;
  };

  // ============================================================
  // Shared scripts (mana rocks, staples across decks)
  // ============================================================
  const SC = MTG.SCRIPTS = {};

  SC['Sol Ring'] = { mana: { cost: { tap: true }, produce: [{ C: 2 }] } };
  SC['Arcane Signet'] = {
    mana: { cost: { tap: true }, produce: (g, c, p) => p.colorIdentity.map(col => ({ [col]: 1 })) },
  };
  SC['Azorius Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ W: 1, U: 1 }] } };
  SC['Golgari Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ B: 1, G: 1 }] } };
  SC['Gruul Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ R: 1, G: 1 }] } };
  SC['Izzet Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ U: 1, R: 1 }] } };
  SC['Rakdos Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ B: 1, R: 1 }] } };
  SC['Orzhov Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ W: 1, B: 1 }] } };
  SC['Selesnya Signet'] = { mana: { cost: { tap: true, mana: '{1}' }, produce: [{ G: 1, W: 1 }] } };
  const talisman = (c1, c2) => ({
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ [c1]: 1 }, { [c2]: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  });
  SC['Talisman of Resilience'] = talisman('B', 'G');
  SC['Talisman of Impulse'] = talisman('R', 'G');
  SC['Talisman of Indulgence'] = talisman('B', 'R');
  SC['Fellwar Stone'] = {
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const cols = new Set();
        for (const l of g.bf()) {
          if (l.is('Land') && l.ctrl !== p) {
            const dynamicIdentity = l.name === 'Command Tower' || l.name === 'Path of Ancestry';
            const available = dynamicIdentity ? l.ctrl.colorIdentity : (l.def.producesColors || []);
            for (const col of available) cols.add(col);
          }
        }
        const available = [...cols].filter(col => COLORS.includes(col));
        if (!available.length) return [];
        return available.map(col => ({ [col]: 1 }));
      },
    },
  };
  SC['Mind Stone'] = {
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Žrtvuj: vuci kartu', cost: { mana: '{1}', tap: true, sacSelf: true },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Thought Vessel'] = { mana: { cost: { tap: true }, produce: [{ C: 1 }] }, noMaxHand: true };
  SC['Hedron Archive'] = {
    mana: { cost: { tap: true }, produce: [{ C: 2 }] },
    abilities: [{
      label: 'Žrtvuj: vuci 2', cost: { mana: '{2}', tap: true, sacSelf: true },
      run: async ctx => { await ctx.g.draw(ctx.you, 2); },
    }],
  };
  SC['Thran Dynamo'] = { mana: { cost: { tap: true }, produce: [{ C: 3 }] } };
  SC['Gilded Lotus'] = {
    mana: { cost: { tap: true }, produce: COLORS.map(c => ({ [c]: 3 })) },
  };

  SC['Chaos Warp'] = {
    targets: [T.permanent(null, { prompt: 'Target permanent', aiHint: { goal: 'removal' } })],
    resolve: async ctx => {
      const t = ctx.targets[0], g = ctx.g;
      if (!t || t.zone !== 'battlefield') return;
      const owner = t.owner;
      await g.move(t, 'library');
      U.shuffle(owner.library, g.rnd);
      if (t.zone === 'library') g.lg(`${owner.name} shuffles ${t.name} into their library.`);
      else if (t.zone === 'command') g.lg(`${t.name} moves to the command zone; ${owner.name} still shuffles their library.`);
      else g.lg(`${t.name} leaves the battlefield; ${owner.name} shuffles their library.`);
      if (owner.library.length) {
        const top = owner.library[owner.library.length - 1];
        g.lg(`${owner.name} reveals ${top.name}.`);
        const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
        if (!permanentTypes.some(type => top.is(type))) return;

        // An Aura put onto the battlefield without being cast must enter
        // attached to something it can legally enchant (CR 303.4f). This is a
        // choice, not a target, so shroud and hexproof do not exclude a host;
        // protection from the Aura still does.
        let auraHost = null;
        if ((top.def.subtypes || []).includes('Aura')) {
          const spec = top.def.auraTarget && top.def.auraTarget[0];
          let candidates = [];
          if (spec && (spec.what === 'player' || spec.what === 'opponent')) {
            candidates = g.alivePlayers().filter(player =>
              (spec.what !== 'opponent' || player !== owner) &&
              (!spec.filter || spec.filter(g, player, owner, top)));
          } else if (spec) {
            candidates = g.bf().filter(card =>
              (!spec.filter || spec.filter(g, card, owner, top)) &&
              !g.isProtectedFrom(card, top));
          }
          if (!candidates.length) {
            g.lg(`${top.name} cannot legally enchant anything, so it remains in the library.`);
            return;
          }
          const picked = await owner.controller.decide(g, {
            type: 'chooseTargets', spec, candidates, min: 1, max: 1, src: top,
            prompt: 'Choose what it enchants',
            aiHint: Object.assign({ kind: 'aura', card: top }, spec.aiHint || {}),
          });
          auraHost = Array.isArray(picked) && candidates.includes(picked[0]) ? picked[0] : null;
          if (!auraHost) return;
        }

        owner.library.pop();
        top.zone = 'nowhere';
        await g.move(top, 'battlefield', {
          ctrl: owner,
          attachTo: auraHost instanceof MTG.CardInst ? auraHost : null,
          cursedPlayer: auraHost instanceof MTG.Player ? auraHost : null,
        });
        if (auraHost) g.lg(`${top.name} enchants ${auraHost.name}.`);
      }
    },
  };
  SC['Blasphemous Act'] = {
    selfCostAdjust: (g, card, p) => -Math.min(8, g.bf().filter(c => c.is('Creature')).length),
    resolve: async ctx => {
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) {
        await ctx.g.damageCreature(ctx.src, c, 13, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Big Score'] = {
    addlCost: { discard: 1 },
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, 2);
      await ctx.g.makeTokens('treasure', ctx.you, { n: 2 });
    },
  };
  SC['Feed the Swarm'] = {
    targets: [{
      what: 'permanent', prompt: 'Stvorenje ili enchantment protivnika',
      filter: (g, c, ctrl) => c.zone === 'battlefield' && c.ctrl !== ctrl && (c.is('Creature') || c.is('Enchantment')),
      aiHint: { goal: 'removal' },
    }],
    resolve: async ctx => {
      const t = ctx.targets[0];
      const mvv = t.mv;
      await ctx.g.destroy(t);
      await ctx.g.loseLife(ctx.you, mvv, 'feed');
    },
  };
  SC['Infernal Grasp'] = {
    targets: [T.creature({ prompt: 'Uništi stvorenje', aiHint: { goal: 'removal' } })],
    resolve: async ctx => { await ctx.g.destroy(ctx.targets[0]); await ctx.g.loseLife(ctx.you, 2); },
  };
  SC['Decree of Pain'] = {
    resolve: async ctx => {
      let n = 0;
      for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) {
        if (await ctx.g.destroy(c, { noRegen: true })) n++;
      }
      await ctx.g.draw(ctx.you, n);
    },
    cycling: {
      cost: '{3}{B}{B}',
      effect: async ctx => {
        E.pumpAllUntilEOT(ctx.g, () => true, -2, -2);
        await ctx.g.checkSBA();
      },
    },
  };
  SC['Bastion of Remembrance'] = {
    triggers: [
      {
        on: 'etb', filter: (g, self, d) => d.card === self, desc: 'token',
        run: async ctx => { await ctx.g.makeTokens('humanSoldier', ctx.you); },
      },
      {
        on: 'dies', desc: 'Drain 1',
        filter: (g, self, d) => d.snap.types.includes('Creature') && d.snap.ctrl === self.ctrl && d.card !== self,
        run: async ctx => {
          await ctx.g.loseLifeOpponents(ctx.src, ctx.you, 1);
          await ctx.g.gainLife(ctx.you, 1);
        },
      },
    ],
  };
  SC['Morbid Opportunist'] = {
    triggers: [{
      on: 'dies', oncePerTurn: true, desc: 'Vuci kartu',
      filter: (g, self, d) => d.card !== self && d.snap.types.includes('Creature'),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Arasta of the Endless Web'] = {
    triggers: [{
      on: 'castIS', desc: 'Spider token',
      filter: (g, self, d) => d.player !== self.ctrl,
      run: async ctx => { await ctx.g.makeTokens('spider12', ctx.you); },
    }],
  };
  SC['Solemn Simulacrum'] = {
    triggers: [
      {
        on: 'etb', filter: (g, self, d) => d.card === self, opt: true, desc: 'Nađi basic',
        run: async ctx => { await E.searchBasic(ctx.g, ctx.you, {}); },
      },
      {
        on: 'dies', filter: (g, self, d) => d.card === self, opt: true, desc: 'Vuci kartu',
        run: async ctx => { await ctx.g.draw(ctx.you, 1); },
      },
    ],
  };
  SC['Evolving Wilds'] = SC['Terramorphic Expanse'] = {
    producesColors: [],
    abilities: [{
      label: 'Žrtvuj: nađi basic (tapped)', cost: { tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['Swiftfoot Boots'] = {
    equip: '{1}',
    attachGrant: (g, self, host) => { host.cur.kw.add('hexproof'); host.cur.kw.add('haste'); host.cur.hexproof = true; },
  };
  SC['Lightning Greaves'] = {
    equip: '{0}',
    attachGrant: (g, self, host) => { host.cur.kw.add('haste'); host.cur.shroud = true; host.cur.kw.add('shroud'); },
  };
})();
