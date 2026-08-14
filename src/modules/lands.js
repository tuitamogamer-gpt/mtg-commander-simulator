// ===== lands.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// All land scripts
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  const tapFor = (cols) => ({ cost: { tap: true }, produce: cols.map(c => (typeof c === 'object' ? c : { [c]: 1 })) });

  const basic = (col) => ({ producesColors: [col], mana: tapFor([col]) });
  SC['Plains'] = basic('W'); SC['Island'] = basic('U'); SC['Swamp'] = basic('B');
  SC['Mountain'] = basic('R'); SC['Forest'] = basic('G');

  // --- simple duals ---
  const dual = (c1, c2, entersTapped) => ({
    producesColors: [c1, c2], mana: tapFor([c1, c2]),
    entersTapped: entersTapped || false,
  });
  const tappedDual = (c1, c2) => dual(c1, c2, true);
  const gainDual = (c1, c2) => Object.assign(tappedDual(c1, c2), {
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: '+1 život',
      run: async ctx => { await ctx.g.gainLife(ctx.you, 1); },
    }],
  });
  const scryTemple = (c1, c2) => Object.assign(tappedDual(c1, c2), {
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: 'Scry 1',
      run: async ctx => { await E.scry(ctx.g, ctx.you, 1); },
    }],
  });
  const checkLand = (c1, c2, subA, subB) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && (l.hasSub(subA) || l.hasSub(subB))),
  });
  const revealLand = (c1, c2, subA, subB) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => !card.ctrl.hand.some(c => c.def.subtypes.includes(subA) || c.def.subtypes.includes(subB)),
  });
  const battleLand = (c1, c2) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card && (l.def.super || []).includes('Basic')).length < 2,
  });
  const fastLand = (c1, c2) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length > 2,
  });
  const painLand = (c1, c2) => ({
    producesColors: [c1, c2],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ [c1]: 1 }, { [c2]: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  });
  const filterLand = (c1, c2) => ({
    producesColors: [c1, c2],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: `{${c1}/${c2}}` }, produce: [{ [c1]: 2 }, { [c1]: 1, [c2]: 1 }, { [c2]: 2 }] },
    ],
  });
  const kartLand = (c1, c2) => ({ // "{1},{T}: Add XY"
    producesColors: [c1, c2],
    mana: { cost: { tap: true, mana: '{1}' }, produce: [{ [c1]: 1, [c2]: 1 }] },
  });
  const bounceLand = (c1, c2) => ({
    producesColors: [c1, c2], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ [c1]: 1, [c2]: 1 }] },
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: 'Vrati land u ruku',
      run: async ctx => {
        const pool = ctx.g.lands(ctx.you).filter(l => l !== ctx.src);
        const all = ctx.g.lands(ctx.you);
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: all, min: 1, max: 1, prompt: 'Vrati land u ruku',
          aiHint: { kind: 'bounceLandChoice', self: ctx.src },
        });
        if (pick.length) await ctx.g.move(pick[0], 'hand');
      },
    }],
  });
  const cycleLand = (col, cycCost) => Object.assign(
    col ? { producesColors: [col], mana: tapFor([col]), entersTapped: true } : {},
    { cycling: { cost: cycCost } });
  const hideawayLand = (col, condFn, condLabel) => ({
    producesColors: [col], entersTapped: true, mana: tapFor([col]),
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: 'Hideaway 4',
      run: async ctx => {
        const p = ctx.you, g = ctx.g;
        const top = p.library.slice(-4).reverse();
        if (!top.length) return;
        const pick = await p.controller.decide(g, {
          type: 'chooseCards', from: top, min: 1, max: 1, prompt: 'Hideaway: sakrij jednu',
          aiHint: { kind: 'hideaway' },
        });
        for (const c of top) p.library.splice(p.library.indexOf(c), 1);
        const hid = pick[0] || top[0];
        hid.zone = 'exile'; p.exile.push(hid);
        ctx.src.meta.hideIid = hid.iid;
        for (const c of top) if (c !== hid) { c.zone = 'library'; p.library.unshift(c); }
        g.lg(`${ctx.src.name}: karta sakrivena (hideaway).`);
      },
    }],
    abilities: [{
      label: 'Igraj sakrivenu kartu', cost: { tap: true, mana: `{${col}}` },
      cond: (g, c, p) => {
        if (!c.meta.hideIid) return false;
        const hid = g.byIid(c.meta.hideIid);
        if (!hid || hid.zone !== 'exile') return false;
        return condFn(g, c, p);
      },
      run: async ctx => {
        const hid = ctx.g.byIid(ctx.src.meta.hideIid);
        if (!hid || hid.zone !== 'exile') return;
        if (hid.is('Land')) {
          ctx.you.exile.splice(ctx.you.exile.indexOf(hid), 1);
          hid.zone = 'nowhere';
          await ctx.g.move(hid, 'battlefield', { ctrl: ctx.you });
        } else {
          await E.mayCastFree(ctx.g, ctx.you, hid);
        }
      },
    }],
  });

  // --- assignments ---
  SC['Command Tower'] = {
    producesColors: COLORS,
    mana: { cost: { tap: true }, produce: (g, c, p) => p.colorIdentity.map(col => ({ [col]: 1 })) },
  };
  SC['Path of Ancestry'] = {
    producesColors: COLORS, entersTapped: true,
    mana: {
      cost: { tap: true }, produce: (g, c, p) => p.colorIdentity.map(col => ({ [col]: 1 })),
      onProduce: async (g, c, p, chosen, forSpell) => {
        if (forSpell && forSpell.card && forSpell.card.is('Creature')) {
          const cmds = (p.commanders && p.commanders.length ? p.commanders : p.command);
          const subs = new Set();
          for (const cm of cmds) for (const s of (cm.def.subtypes || [])) subs.add(s);
          if (subs.size && forSpell.card.def.subtypes.some(s => subs.has(s))) {
            g.queueTrigger({ src: c, name: 'Path of Ancestry — Scry 1', ctrl: p, run: async ctx => { await E.scry(ctx.g, ctx.you, 1); } });
          }
        }
      },
    },
  };
  SC['Exotic Orchard'] = {
    producesColors: [],
    mana: {
      cost: { tap: true },
      produce: (g, c, p) => {
        const cols = new Set();
        for (const l of g.bf()) if (l.is('Land') && l.ctrl !== p) for (const col of (l.def.producesColors || [])) cols.add(col);
        return [...cols].filter(x => COLORS.includes(x)).map(col => ({ [col]: 1 }));
      },
    },
  };
  SC['Reliquary Tower'] = { producesColors: [], mana: tapFor([{ C: 1 }]), noMaxHand: true };
  SC['Temple of the False God'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 2 }], cond: (g, c, p) => g.lands(p).length >= 5 },
  };
  SC['Ash Barrens'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    cycling: {
      cost: '{1}', noDraw: true,
      effect: async ctx => { await E.searchBasic(ctx.g, ctx.you, { toHand: true }); },
    },
  };
  SC['Barren Moor'] = cycleLand('B', '{B}');
  SC['Tranquil Thicket'] = cycleLand('G', '{G}');
  SC['Forgotten Cave'] = cycleLand('R', '{R}');
  SC['Canyon Slough'] = Object.assign(tappedDual('B', 'R'), { cycling: { cost: '{2}' } });
  SC['Sheltered Thicket'] = Object.assign(tappedDual('R', 'G'), { cycling: { cost: '{2}' } });
  SC['Deceptive Landscape'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    cycling: { cost: '{W}{B}{G}' },
    abilities: [{
      label: 'Žrtvuj: nađi basic P/S/F (tapped)', cost: { tap: true, sacSelf: true },
      run: async ctx => {
        await E.searchBasic(ctx.g, ctx.you, { tapped: true, filter: d => ['Plains', 'Swamp', 'Forest'].some(s => d.subtypes.includes(s)) });
      },
    }],
  };
  SC['Blackcleave Cliffs'] = fastLand('B', 'R');
  SC['Copperline Gorge'] = fastLand('R', 'G');
  SC['Bloodfell Caves'] = gainDual('B', 'R');
  SC['Jungle Hollow'] = gainDual('B', 'G');
  SC['Bojuka Bog'] = {
    producesColors: ['B'], entersTapped: true, mana: tapFor(['B']),
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: 'Egzilaj groblje',
      targets: [T.player({ prompt: 'Čije groblje egzilirati?', aiHint: { goal: 'gyHate' } })],
      run: async ctx => {
        const t = ctx.targets[0];
        const n = t.graveyard.length;
        for (const c of t.graveyard.slice()) await ctx.g.move(c, 'exile');
        ctx.g.lg(`Bojuka Bog: egzilirano ${n} karata iz groblja igrača ${t.name}.`);
      },
    }],
  };
  SC['Canopy Vista'] = battleLand('G', 'W');
  SC['Cinder Glade'] = battleLand('R', 'G');
  SC['Smoldering Marsh'] = battleLand('B', 'R');
  SC['Cascade Bluffs'] = filterLand('U', 'R');
  SC['Graven Cairns'] = filterLand('B', 'R');
  SC['Twilight Mire'] = filterLand('B', 'G');
  SC['Dragonskull Summit'] = checkLand('B', 'R', 'Swamp', 'Mountain');
  SC['Isolated Chapel'] = checkLand('W', 'B', 'Plains', 'Swamp');
  SC['Rootbound Crag'] = checkLand('R', 'G', 'Mountain', 'Forest');
  SC['Sulfur Falls'] = checkLand('U', 'R', 'Island', 'Mountain');
  SC['Sunpetal Grove'] = checkLand('G', 'W', 'Forest', 'Plains');
  SC['Woodland Cemetery'] = checkLand('B', 'G', 'Swamp', 'Forest');
  SC['Foreboding Ruins'] = revealLand('B', 'R', 'Swamp', 'Mountain');
  SC['Fortified Village'] = revealLand('G', 'W', 'Forest', 'Plains');
  SC['Frostboil Snarl'] = revealLand('U', 'R', 'Island', 'Mountain');
  SC['Game Trail'] = revealLand('R', 'G', 'Mountain', 'Forest');
  SC['Necroblossom Snarl'] = revealLand('B', 'G', 'Swamp', 'Forest');
  SC['Geothermal Bog'] = tappedDual('B', 'R');
  SC['Haunted Mire'] = tappedDual('B', 'G');
  SC['Radiant Grove'] = tappedDual('G', 'W');
  SC['Wooded Ridgeline'] = tappedDual('R', 'G');
  SC['Sandsteppe Citadel'] = { producesColors: ['W', 'B', 'G'], entersTapped: true, mana: tapFor(['W', 'B', 'G']) };
  SC['Golgari Rot Farm'] = bounceLand('B', 'G');
  SC['Gruul Turf'] = bounceLand('R', 'G');
  SC['Izzet Boilerworks'] = bounceLand('U', 'R');
  SC['Karplusan Forest'] = painLand('R', 'G');
  SC['Llanowar Wastes'] = painLand('B', 'G');
  SC['Shivan Reef'] = painLand('U', 'R');
  SC['Sulfurous Springs'] = painLand('B', 'R');
  SC['Ferrous Lake'] = kartLand('U', 'R');
  SC['Mossfire Valley'] = kartLand('R', 'G');
  SC['Shadowblood Ridge'] = kartLand('B', 'R');
  SC['Sungrass Prairie'] = kartLand('G', 'W');
  SC['Viridescent Bog'] = kartLand('B', 'G');
  SC['Overgrown Farmland'] = Object.assign(dual('G', 'W'), {
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length < 2,
  });
  SC['Temple of Abandon'] = scryTemple('R', 'G');
  SC['Temple of Epiphany'] = scryTemple('U', 'R');
  SC['Temple of Malady'] = scryTemple('B', 'G');
  SC['Temple of Malice'] = scryTemple('B', 'R');
  SC['Temple of Plenty'] = scryTemple('G', 'W');
  SC['Temple of Silence'] = scryTemple('W', 'B');
  SC['Tainted Peak'] = {
    producesColors: ['B', 'R'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ B: 1 }, { R: 1 }], cond: (g, c, p) => g.lands(p).some(l => l.hasSub('Swamp')) },
    ],
  };
  SC['Tainted Wood'] = {
    producesColors: ['B', 'G'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true }, produce: [{ B: 1 }, { G: 1 }], cond: (g, c, p) => g.lands(p).some(l => l.hasSub('Swamp')) },
    ],
  };
  SC['Access Tunnel'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Ne može biti blokiran (pow≤3)', cost: { tap: true, mana: '{3}' },
      targets: [T.yourCreature({ prompt: 'Stvorenje ≤3 power', filter: (g, c, ctrl) => c.is('Creature') && c.ctrl === ctrl && c.power <= 3, aiHint: { goal: 'evasion' } })],
      run: async ctx => {
        const t = ctx.targets[0], iid = t.iid;
        ctx.g.untilEffects.push({
          expires: 'eot',
          apply: (g2, bf) => { const c = bf.find(x => x.iid === iid); if (c) c.cur.unblockable = true; },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Grim Backwoods'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Žrtvuj stvorenje: vuci kartu', cost: { tap: true, mana: '{2}{B}{G}', sacCreature: true },
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Leechridden Swamp'] = {
    producesColors: ['B'], entersTapped: true, mana: tapFor(['B']),
    abilities: [{
      label: 'Svaki protivnik gubi 1', cost: { tap: true, mana: '{B}' },
      cond: (g, c, p) => g.bf().filter(x => x.ctrl === p && x.colors.includes('B')).length >= 2,
      run: async ctx => { for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.loseLife(o, 1); },
    }],
  };
  SC['Shivan Gorge'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: '1 šteta svakom protivniku', cost: { tap: true, mana: '{2}{R}' },
      run: async ctx => { for (const o of E.eachOpp(ctx.g, ctx.you)) await ctx.g.damagePlayer(ctx.src, o, 1); },
    }],
  };
  SC['Swarmyard'] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Regeneriši glodara', cost: { tap: true },
      targets: [{
        what: 'creature', prompt: 'Insect/Rat/Spider/Squirrel',
        filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && ['Insect', 'Rat', 'Spider', 'Squirrel'].some(s => c.hasSub(s)),
        aiHint: { goal: 'protect' },
      }],
      run: async ctx => { ctx.targets[0].regenShield++; ctx.g.lg(`${ctx.targets[0].name} dobija regeneracijski štit.`); },
    }],
  };
  SC['Witch’s Clinic'] = SC["Witch's Clinic"] = {
    producesColors: [], mana: tapFor([{ C: 1 }]),
    abilities: [{
      label: 'Commander dobija lifelink', cost: { tap: true, mana: '{2}' },
      targets: [{
        what: 'creature', prompt: 'Commander', filter: (g, c) => c.zone === 'battlefield' && c.commander,
        aiHint: { goal: 'buff' },
      }],
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.targets[0], ['lifelink']); },
    }],
  };
  SC['Oran-Rief, the Vastwood'] = {
    producesColors: ['G'], entersTapped: true, mana: tapFor(['G']),
    abilities: [{
      label: '+1/+1 na zelena stvorenja (nova)', cost: { tap: true }, sorcery: false,
      run: async ctx => {
        for (const c of ctx.g.creatures(null)) {
          if (c.colors.includes('G') && c.meta._enteredTurn === ctx.g.turnNo) ctx.g.addCounters(c, '+1/+1', 1);
        }
      },
    }],
  };
  SC['Mosswort Bridge'] = hideawayLand('G',
    (g, c, p) => g.creatures(p).reduce((s, x) => s + Math.max(0, x.power), 0) >= 10, 'total power 10+');
  SC['Spinerock Knoll'] = hideawayLand('R',
    (g, c, p) => E.eachOpp(g, p).some(o => (o.turnState.damageTaken || 0) >= 7), 'opp dealt 7+ dmg');
  SC['Raging Ravine'] = {
    producesColors: ['R', 'G'], entersTapped: true, mana: tapFor(['R', 'G']),
    abilities: [{
      label: 'Postaje 3/3 stvorenje', cost: { mana: '{2}{R}{G}' },
      run: async ctx => {
        const iid = ctx.src.iid;
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'animate',
          apply: (g2, bf) => {
            const c = bf.find(x => x.iid === iid);
            if (!c) return;
            if (!c.cur.types.includes('Creature')) c.cur.types.push('Creature');
            c.cur.basePower = 3; c.cur.baseToughness = 3;
            c.cur.power = 3 + (c.counters['+1/+1'] || 0); c.cur.toughness = 3 + (c.counters['+1/+1'] || 0);
            if (!c.cur.subtypes.includes('Elemental')) c.cur.subtypes.push('Elemental');
          },
        });
        ctx.g.recalc();
      },
    }],
    triggers: [{
      on: 'attacks', filter: (g, self, d) => d.card === self, desc: '+1/+1 counter',
      run: async ctx => { ctx.g.addCounters(ctx.src, '+1/+1', 1); },
    }],
  };

  // ============================================================
  // v7 lands (TMNT / Mardu Surge / Blight Curse / Counter Intelligence / Most Wanted / Elven Council)
  // ============================================================
  const bondLand = (c1, c2) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => g.alivePlayers().filter(x => x !== card.ctrl).length < 2,
  });
  const slowLand = (c1, c2) => Object.assign(dual(c1, c2), {
    entersTapped: (g, card) => g.lands(card.ctrl).filter(l => l !== card).length < 2,
  });
  const anyColorLand = (extra) => Object.assign({
    producesColors: COLORS,
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
  }, extra || {});
  const tappedCycleDual = (c1, c2, cycCost) => Object.assign(tappedDual(c1, c2), {
    cycling: { cost: cycCost || '{2}' },
  });
  const triLand = (c1, c2, c3) => ({
    producesColors: [c1, c2, c3], entersTapped: true,
    mana: { cost: { tap: true }, produce: [{ [c1]: 1 }, { [c2]: 1 }, { [c3]: 1 }] },
  });

  // --- TMNT (Turtle Power) ---
  SC['City of Brass'] = anyColorLand({
    mana: {
      cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
      onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
    },
  });
  SC['Grand Coliseum'] = {
    producesColors: COLORS, entersTapped: true,
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
        onProduce: async (g, c, p) => { await g.damagePlayer(c, p, 1); },
      },
    ],
  };
  SC['Big Apple, 3 a.m.'] = {
    producesColors: COLORS,
    entersTapped: true,
    asEnters: async (g, card) => {
      const options = COLORS.map(color => ({ key: color, label: color }));
      const choice = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: `${card.name}: izaberi boju`, options,
        aiHint: { kind: 'manaColor' },
      });
      card.meta.chosenColor = COLORS.includes(choice) ? choice : 'G';
    },
    mana: {
      cost: { tap: true },
      produce: (g, card) => [{ [card.meta.chosenColor || 'G']: 1 }],
    },
    abilities: [{
      label: 'Rat po protivniku', cost: { tap: true, mana: '{5}' },
      run: async ctx => { await ctx.g.makeTokens('rat', ctx.you, { n: E.eachOpp(ctx.g, ctx.you).length }); },
    }],
  };
  SC['Hidden Hideout'] = {
    producesColors: COLORS, entersTapped: true,
    mana: { cost: { tap: true }, produce: (g, c, p) => p.colorIdentity.map(col => ({ [col]: 1 })) },
    abilities: [{
      label: 'Lifelink stvorenju s counterom', cost: { tap: true, mana: '{2}' },
      targets: [T.yourCreature({
        prompt: 'Stvorenje s counterom',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Creature') && c.ctrl === ctrl && Object.keys(c.counters).some(k => c.counters[k] > 0),
        aiHint: { goal: 'buff' },
      })],
      run: async ctx => { E.grantUntilEOT(ctx.g, ctx.targets[0], ['lifelink']); },
    }],
  };
  SC['Turtle Lair'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      {
        cost: { tap: true }, produce: [{ ANY: true, n: 1 }],
        restrict: (g, forSpell) => forSpell && forSpell.card && (forSpell.card.def.subtypes.includes('Ninja') || forSpell.card.def.subtypes.includes('Turtle')),
      },
    ],
    abilities: [{
      label: 'Ninja/Turtle neblokabilan', cost: { tap: true, mana: '{3}' },
      targets: [T.creature({
        prompt: 'Ninja ili Turtle',
        filter: (g, c) => c.zone === 'battlefield' && c.is('Creature') && (c.hasSub('Ninja') || c.hasSub('Turtle')),
        aiHint: { goal: 'buff' },
      })],
      run: async ctx => {
        const t = ctx.targets[0];
        ctx.g.untilEffects.push({
          expires: 'eot', kind: 'unblockable',
          apply: (g2, bf) => { const c = bf.find(x => x.iid === t.iid); if (c) c.cur.unblockable = true; },
        });
        ctx.g.recalc();
      },
    }],
  };
  SC['Vibrant Cityscape'] = {
    producesColors: [],
    abilities: [{
      label: 'Sac: nađi basic (tapped)', cost: { tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
      aiScore: (g, c, p) => 6,
    }],
  };
  SC['Fabled Passage'] = {
    producesColors: [],
    abilities: [{
      label: 'Sac: nađi basic', cost: { tap: true, sacSelf: true },
      run: async ctx => {
        const found = await E.searchBasic(ctx.g, ctx.you, { tapped: true });
        const land = found[0];
        if (land && ctx.g.lands(ctx.you).length >= 4) {
          land.tapped = false;
          ctx.g.lg(`Fabled Passage: ${land.name} se untapuje.`);
          ctx.g.recalc();
        }
      },
      aiScore: (g, c, p) => 6,
    }],
  };
  SC['Hinterland Harbor'] = checkLand('G', 'U', 'Forest', 'Island');
  SC['Sunken Hollow'] = battleLand('U', 'B');
  SC['Rain-Slicked Copse'] = tappedCycleDual('G', 'U');
  SC['Sodden Verdure'] = battleLand('G', 'U');
  SC['Vernal Fen'] = battleLand('B', 'G');
  SC['Spire Garden'] = bondLand('R', 'G');
  SC['Undergrowth Stadium'] = bondLand('B', 'G');
  const thrivingLand = baseColor => ({
    producesColors: COLORS, entersTapped: true,
    mana: {
      cost: { tap: true },
      produce: (g, card) => [{ [baseColor]: 1 }, { [card.meta.thrivingColor || COLORS.find(color => color !== baseColor)]: 1 }],
    },
    asEnters: async (g, card) => {
      const options = COLORS.filter(color => color !== baseColor).map(color => ({ key: color, label: color }));
      const choice = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: `${card.name}: druga boja?`, options, aiHint: { kind: 'manaColor' },
      });
      card.meta.thrivingColor = COLORS.includes(choice) && choice !== baseColor ? choice : options[0].key;
    },
  });
  SC['Thriving Grove'] = thrivingLand('G');
  SC['Thriving Moor'] = thrivingLand('B');

  // --- Mardu Surge ---
  SC['Caves of Koilos'] = painLand('W', 'B');
  SC['Fetid Heath'] = filterLand('W', 'B');
  // --- zemlje iz Scions & Spellcraft / Coven Counters ---
  // Bez ovih su ulazile na sto kao potpuno prazne karte: nisu davale manu.
  SC['Arcane Sanctum'] = triLand('W', 'U', 'B');
  SC['Contaminated Aquifer'] = tappedDual('U', 'B');
  SC['Idyllic Beachfront'] = tappedDual('W', 'U');
  SC['Sunlit Marsh'] = tappedDual('W', 'B');
  SC['Darkwater Catacombs'] = kartLand('U', 'B');
  SC['Sunken Ruins'] = filterLand('U', 'B');
  SC['Underground River'] = painLand('U', 'B');
  // "As this land enters, you may reveal a Plains or Swamp card from your hand."
  SC['Shineshadow Snarl'] = revealLand('W', 'B', 'Plains', 'Swamp');
  SC['Blighted Woodland'] = {
    producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Žrtvuj: dva basica (tapped)', cost: { mana: '{3}{G}', tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true }); },
    }],
  };
  SC['Nomad Outpost'] = triLand('R', 'W', 'B');
  SC['Savage Lands'] = triLand('B', 'R', 'G');
  SC['Shattered Sanctum'] = slowLand('W', 'B');
  SC['Temple of Triumph'] = scryTemple('R', 'W');
  SC['Castle Embereth'] = {
    producesColors: ['R'],
    entersTapped: (g, card) => !g.lands(card.ctrl).some(l => l !== card && l.hasSub('Mountain')),
    mana: tapFor(['R']),
    abilities: [{
      label: '+1/+0 svojim stvorenjima', cost: { tap: true, mana: '{1}{R}{R}' },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, c) => c.ctrl === ctx.you, 1, 0); },
    }],
  };
  SC['Shattered Landscape'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    cycling: { cost: '{R}{W}{B}' },
    abilities: [{
      label: 'Sac: nađi basic (tapped)', cost: { tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { tapped: true }); },
    }],
  };
  SC['Vault of the Archangel'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Deathtouch+lifelink svima', cost: { tap: true, mana: '{2}{W}{B}' },
      run: async ctx => {
        for (const c of ctx.g.creatures(ctx.you)) E.grantUntilEOT(ctx.g, c, ['deathtouch', 'lifelink']);
      },
    }],
  };
  SC['Windbrisk Heights'] = hideawayLand('W',
    (g, c, p) => (p.turnState.attackedCount || 0) >= 3, 'napao sa 3+ stvorenja');

  // --- Blight Curse ---
  SC['Festering Thicket'] = tappedCycleDual('B', 'G');
  SC['Rakdos Carnarium'] = bounceLand('B', 'R');
  SC['Ifnir Deadlands'] = {
    producesColors: ['B'],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, life: 1 }, produce: [{ B: 1 }] },
    ],
    abilities: [{
      label: '2× -1/-1 counter', cost: { tap: true, mana: '{2}{B}{B}', sac: (g, x, c) => x.hasSub('Desert') }, sorcery: true,
      targets: [T.oppCreature({ prompt: '-1/-1 ×2', aiHint: { goal: 'removal' } })],
      run: async ctx => { await ctx.g.addM1(ctx.targets[0], 2, ctx.you); },
    }],
  };
  SC['Nesting Grounds'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Premjesti counter', cost: { tap: true, mana: '{1}' }, sorcery: true,
      targets: [
        T.permanent((g, c, ctrl) => c.ctrl === ctrl && Object.keys(c.counters).some(k => c.counters[k] > 0), { prompt: 'Sa (tvoj permanent)', aiHint: { goal: 'buff' } }),
        T.permanent(null, { prompt: 'Na', aiHint: { goal: 'buff' } }),
      ],
      run: async ctx => {
        const [from, to] = ctx.targets;
        if (!from || !to || from === to) return;
        const kinds = Object.keys(from.counters).filter(k => from.counters[k] > 0);
        if (!kinds.length) return;
        const kind = kinds.includes('-1/-1') && to.ctrl !== ctx.you ? '-1/-1' : kinds[0];
        ctx.g.removeCounters(from, kind, 1);
        if (kind === '-1/-1') await ctx.g.addM1(to, 1, ctx.you);
        else ctx.g.addCounters(to, kind, 1);
      },
    }],
  };
  SC['Riveteers Overlook'] = {
    producesColors: [], entersTapped: true,
    triggers: [{
      on: 'etb', filter: (g, self, d) => d.card === self, desc: 'Sac → basic + 1 život',
      run: async ctx => {
        await ctx.g.sacrifice(ctx.you, ctx.src);
        await E.searchBasic(ctx.g, ctx.you, { tapped: true, filter: d => ['Swamp', 'Mountain', 'Forest'].some(t => d.subtypes.includes(t)) });
        await ctx.g.gainLife(ctx.you, 1);
      },
    }],
  };

  // --- Counter Intelligence ---
  SC['Ancient Den'] = { producesColors: ['W'], mana: tapFor(['W']) };
  SC['Great Furnace'] = { producesColors: ['R'], mana: tapFor(['R']) };
  SC['Seat of the Synod'] = { producesColors: ['U'], mana: tapFor(['U']) };
  SC['Razortide Bridge'] = Object.assign(tappedDual('W', 'U'), { kws: ['indestructible'] });
  SC['Rustvale Bridge'] = Object.assign(tappedDual('R', 'W'), { kws: ['indestructible'] });
  SC['Silverbluff Bridge'] = Object.assign(tappedDual('U', 'R'), { kws: ['indestructible'] });
  SC['Glittering Massif'] = tappedCycleDual('R', 'W');
  SC['Radiant Summit'] = battleLand('R', 'W');
  SC['Skycloud Expanse'] = kartLand('W', 'U');
  SC["Karn's Bastion"] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Proliferate', cost: { tap: true, mana: '{4}' },
      run: async ctx => { await E.proliferate(ctx.g, ctx.you); },
    }],
  };
  SC['Buried Ruin'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Artefakt iz groblja u ruku', cost: { tap: true, sacSelf: true, mana: '{2}' },
      cond: (g, c, p) => p.graveyard.some(x => x.is('Artifact')),
      run: async ctx => {
        const pool = ctx.you.graveyard.filter(x => x.is('Artifact'));
        const pick = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Artefakt u ruku', aiHint: { kind: 'reanimate' },
        });
        if (pick[0]) { ctx.g.remove(pick[0]); pick[0].zone = 'hand'; ctx.you.hand.push(pick[0]); }
      },
    }],
  };
  SC['The Mycosynth Gardens'] = {
    producesColors: [],
    mana: [
      { cost: { tap: true }, produce: [{ C: 1 }] },
      { cost: { tap: true, mana: '{1}' }, produce: [{ ANY: true, n: 1 }] },
    ],
    abilities: [{
      label: 'Postani kopija nontoken artefakta', cost: { tap: true, manaFromTarget: true },
      targets: [T.permanent((g, target, ctrl) => target.ctrl === ctrl && target.is('Artifact') && !target.isToken, {
        prompt: 'Nontoken artefakt koji kontrolišeš', aiHint: { goal: 'copy' },
      })],
      run: async ctx => {
        const target = ctx.targets[0];
        if (!target || target.zone !== 'battlefield') return;
        if (!ctx.src.meta.characteristicOriginalDef) ctx.src.meta.characteristicOriginalDef = ctx.src.def;
        const copiedDef = target.isCopyOf || target.def;
        ctx.src.def = copiedDef;
        ctx.src.isCopyOf = copiedDef;
        ctx.g.recalc();
        ctx.g.lg(`The Mycosynth Gardens postaje kopija: ${target.name}.`);
      },
      aiScore: (g, card, p) => g.bf().some(x => x.ctrl === p && x.is('Artifact') && !x.isToken && x !== card) ? 1 : 0,
    }],
  };

  // --- Most Wanted ---
  SC['Desolate Mire'] = kartLand('W', 'B');
  SC['Bonders' + String.fromCharCode(39) + ' Enclave'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Vuci kartu', cost: { tap: true, mana: '{3}' },
      cond: (g, c, p) => g.creatures(p).some(x => x.power >= 4),
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Command Beacon'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Commander iz CZ u ruku', cost: { tap: true, sacSelf: true },
      cond: (g, c, p) => p.command.length > 0,
      run: async ctx => {
        let cmd = ctx.you.command[0];
        if (ctx.you.command.length > 1) {
          const picked = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseCards', from: ctx.you.command.slice(), min: 1, max: 1,
            prompt: 'Kojeg komandera u ruku?', aiHint: { kind: 'chooseCreature' },
          });
          cmd = (picked && picked[0]) || cmd;
        }
        if (!cmd) return;
        ctx.you.command.splice(ctx.you.command.indexOf(cmd), 1);
        cmd.zone = 'hand'; ctx.you.hand.push(cmd);
        cmd.meta._viaBeacon = true;
        ctx.g.lg(`${cmd.name} ide u ruku (Command Beacon) — bez taxe!`);
      },
    }],
  };
  SC['Demolition Field'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Uništi nonbasic land', cost: { tap: true, sacSelf: true, mana: '{2}' },
      targets: [{
        what: 'permanent', prompt: 'Nonbasic land protivnika',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Land') && !(c.def.super || []).includes('Basic') && c.ctrl !== ctrl,
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => {
        const t = ctx.targets[0]; const owner = t.ctrl;
        await ctx.g.destroy(t, ctx.src);
        await E.searchBasic(ctx.g, owner, {});
        await E.searchBasic(ctx.g, ctx.you, {});
      },
    }],
  };

  // --- Elven Council ---
  SC['Field of Ruin'] = {
    producesColors: [],
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Uništi nonbasic land', cost: { tap: true, sacSelf: true, mana: '{2}' },
      targets: [{
        what: 'permanent', prompt: 'Nonbasic land protivnika',
        filter: (g, c, ctrl) => c.zone === 'battlefield' && c.is('Land') && !(c.def.super || []).includes('Basic') && c.ctrl !== ctrl,
        aiHint: { goal: 'removal' },
      }],
      run: async ctx => {
        const t = ctx.targets[0];
        await ctx.g.destroy(t, ctx.src);
        for (const q of ctx.g.alivePlayers()) await E.searchBasic(ctx.g, q, {});
      },
    }],
  };
})();
