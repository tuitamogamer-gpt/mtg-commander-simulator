// ===== scripts-temur.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// TEMUR ROAR (TDC) — commander: Ureni of the Unwritten
(function () {
  const U = MTG, E = MTG.E, T = MTG.T, SC = MTG.SCRIPTS, TK = MTG.TOKENS, E7 = MTG.E7;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const etbSelf = (g, self, data) => data.card === self;
  const attacksSelf = (g, self, data) => data.card === self;
  const isDragon = card => !!card && card.hasSub && card.hasSub('Dragon');
  const ownDragon = (self, card) => !!card && card.ctrl === self.ctrl && isDragon(card);
  const tok = (name, subtypes, power, toughness, kws, colors, extra) => Object.assign({
    name, cost: null, super: [], types: ['Creature'], subtypes,
    power: String(power), toughness: String(toughness), oracle: '', kws: kws || [],
    colorsOverride: colors || [], isTokenDef: true,
  }, extra || {});
  const anyTarget = (prompt, opts) => Object.assign({ what: 'any', prompt, aiHint: { goal: 'damage' } }, opts || {});
  const permanentTarget = (prompt, filter, opts) => T.permanent(filter, Object.assign({
    prompt, aiHint: { goal: 'removal' },
  }, opts || {}));
  const graveTarget = (prompt, filter, opts) => Object.assign({
    zone: 'graveyard', what: 'card', prompt, filter, aiHint: { kind: 'gyRecur' },
  }, opts || {});
  const chooseType = async (g, player, source, defaultType = 'Dragon') => {
    const counts = {};
    for (const card of g.creatures(player).concat(player.hand.filter(card => card.is('Creature')))) {
      for (const subtype of (card.cur ? card.cur.subtypes : card.def.subtypes || [])) counts[subtype] = (counts[subtype] || 0) + 1;
    }
    const allTypes = [...(MTG.CREATURE_SUBTYPES || new Set([defaultType]))];
    if (!allTypes.includes(defaultType)) allTypes.push(defaultType);
    const options = allTypes.sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || a.localeCompare(b))
      .map(key => ({ key, label: key, value: counts[key] || 0 }));
    const key = await player.controller.decide(g, {
      type: 'chooseOption', prompt: `${source.name}: choose a creature type`, options,
      aiHint: { kind: 'chooseType', counts, source },
    });
    return options.some(option => option.key === key) ? key : defaultType;
  };
  const fight = async (g, first, second) => {
    if (!first || !second || first.zone !== 'battlefield' || second.zone !== 'battlefield' ||
      !first.is('Creature') || !second.is('Creature')) return;
    const firstPower = first.power, secondPower = second.power;
    await g.damageCreature(first, second, firstPower, { deferSBA: true });
    await g.damageCreature(second, first, secondPower, { deferSBA: true });
    await g.checkSBA();
  };
  const setBaseUntilEOT = (g, card, power, toughness, kws, addSubtypes) => {
    const iid = card.iid, timestamp = card.timestamp;
    g.untilEffects.push({
      expires: 'eot', kind: 'temurBasePT',
      apply: (g2, bf) => {
        const current = bf.find(candidate => candidate.iid === iid && candidate.timestamp === timestamp);
        if (!current) return;
        const plus = (current.counters['+1/+1'] || 0) - (current.counters['-1/-1'] || 0);
        current.cur.basePower = power; current.cur.baseToughness = toughness;
        current.cur.power = power + plus;
        current.cur.toughness = toughness + plus - (current.counters['-0/-1'] || 0);
        for (const keyword of kws || []) current.cur.kw.add(keyword);
        for (const subtype of addSubtypes || []) if (!current.cur.subtypes.includes(subtype)) current.cur.subtypes.push(subtype);
      },
    });
    g.recalc();
  };
  const randomBottom = (g, player, cards) => {
    const remaining = cards.filter(card => card.zone === 'library');
    for (const card of remaining) player.library.splice(player.library.indexOf(card), 1);
    U.shuffle(remaining, g.rnd); player.library.unshift(...remaining);
  };
  const dragonTopEight = async ctx => {
    const cards = ctx.you.library.slice(-8);
    const dragons = cards.filter(card => card.is('Creature') && isDragon(card));
    const picked = dragons.length ? await ctx.you.controller.decide(ctx.g, {
      type: 'chooseCards', from: dragons, min: 0, max: 1,
      prompt: `${ctx.src.name}: Dragon from the top eight`, aiHint: { kind: 'bestCreature' },
    }) : [];
    if (picked[0] && dragons.includes(picked[0])) await ctx.g.move(picked[0], 'battlefield', { ctrl: ctx.you });
    randomBottom(ctx.g, ctx.you, cards);
  };
  const repeatColoredCost = (color, n) => ({ generic: 0, x: 0, pips: Array.from({ length: n }, () => [color]) });
  const maxColoredPayable = (g, player, color) => {
    let low = 0, high = 1;
    while (g.canPayMana(player, repeatColoredCost(color, high))) {
      low = high;
      if (high >= Number.MAX_SAFE_INTEGER / 2) return low;
      high *= 2;
    }
    while (low + 1 < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (g.canPayMana(player, repeatColoredCost(color, mid))) low = mid; else high = mid;
    }
    return low;
  };
  const makeDragonCopy = async (g, player, target) => {
    if (!target) return [];
    const base = target.isCopyOf || target.def;
    const def = Object.assign({}, base, {
      types: [...new Set([...(base.types || []), 'Creature'])],
      subtypes: [...new Set([...(base.subtypes || []), 'Dragon'])],
      power: '4', toughness: '4', kws: [...new Set([...(base.kws || []), 'flying'])],
    });
    return g.makeTokens(def, player, { copyOf: def });
  };

  TK.temurDragon55 = TK.temurDragon55 || tok('Dragon', ['Dragon'], 5, 5, ['flying'], ['R']);
  TK.temurKarox44 = TK.temurKarox44 || tok('Karox Bladewing', ['Dragon'], 4, 4, ['flying'], ['R'], { super: ['Legendary'] });
  TK.temurDragonEgg02 = TK.temurDragonEgg02 || tok('Dragon Egg', ['Dragon', 'Egg'], 0, 2, ['defender'], ['R'], {
    triggers: [{ on: 'dies', desc: 'Hatch a Dragon', filter: (g, self, data) => data.card === self,
      run: async ctx => { await ctx.g.makeTokens('temurDragon22', ctx.you); } }],
  });
  TK.temurDragon22 = TK.temurDragon22 || tok('Dragon', ['Dragon'], 2, 2, ['flying'], ['R'], {
    abilities: [{ label: '+1/+0', cost: { mana: '{R}' },
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); }, aiScore: () => 0.8 }],
  });

  SC["Eshki, Temur's Roar"] = {
    triggers: [{
      on: 'cast', desc: 'Roar for a creature spell', filter: (g, self, data) => data.player === self.ctrl && data.isCreature,
      run: async ctx => {
        if (ctx.src.zone !== 'battlefield') return;
        ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you);
        const printedPower = Number.parseInt(ctx.data.card.def.power || '0', 10) || 0;
        if (printedPower >= 4) await ctx.g.draw(ctx.you, 1);
        if (printedPower >= 6 && ctx.src.zone === 'battlefield') await ctx.g.damageOpponents(ctx.src, ctx.you, ctx.src.power);
      },
    }],
  };
  SC['Dragonmaster Outcast'] = { triggers: [{
    on: 'upkeep', desc: 'Create a 5/5 Dragon',
    filter: (g, self, data) => data.player === self.ctrl && g.lands(self.ctrl).length >= 6,
    run: async ctx => { await ctx.g.makeTokens('temurDragon55', ctx.you); },
  }] };
  SC['Deceptive Frostkite'] = {
    asEnters: async (g, card) => {
      const candidates = g.creatures(card.ctrl).filter(candidate => candidate !== card && candidate.power >= 4);
      if (!candidates.length) return;
      const picked = await card.ctrl.controller.decide(g, {
        type: 'chooseCards', from: candidates, min: 0, max: 1,
        prompt: 'Deceptive Frostkite: creature you control with power 4+', aiHint: { kind: 'mirrorCopy' },
      });
      const target = picked[0]; if (!target || !candidates.includes(target)) return;
      if (!card.meta.characteristicOriginalDef) card.meta.characteristicOriginalDef = card.def;
      const base = target.isCopyOf || target.def; card.isCopyOf = base;
      card.def = Object.assign({}, base, {
        subtypes: [...new Set([...(base.subtypes || []), 'Dragon'])],
        kws: [...new Set([...(base.kws || []), 'flying'])],
      });
      if (base.asEnters && base !== card.meta.characteristicOriginalDef && (card.meta._frostkiteCopyDepth || 0) < 3) {
        card.meta._frostkiteCopyDepth = (card.meta._frostkiteCopyDepth || 0) + 1;
        await base.asEnters(g, card);
      }
      card.def = Object.assign({}, card.def, {
        subtypes: [...new Set([...(card.def.subtypes || []), 'Dragon'])],
        kws: [...new Set([...(card.def.kws || []), 'flying'])],
      });
      g.recalc();
    },
  };
  const dragonDiscount = { costMods: [(g, self, info) => info.player === self.ctrl && isDragon(info.card) ? -1 : 0] };
  SC["Dragonlord's Servant"] = dragonDiscount;
  SC['Gadrak, the Crown-Scourge'] = {
    statics: [{ apply: (g, self) => {
      if (g.bf().filter(card => card.ctrl === self.ctrl && card.is('Artifact')).length < 4) self.cur.cantAttack = true;
    } }],
    triggers: [{ on: 'endStep', desc: 'Treasures for nontoken deaths', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => {
        const n = ctx.g.diedThisTurn.filter(snap => snap.types.includes('Creature') && !snap.isToken).length;
        if (n) await ctx.g.makeTokens('treasure', ctx.you, { n });
      } }],
  };
  SC['Nogi, Draco-Zealot'] = {
    costMods: dragonDiscount.costMods,
    triggers: [{ on: 'attacks', desc: 'Become a 5/5 Dragon', filter: attacksSelf,
      onlyIf: (g, self) => g.creatures(self.ctrl).filter(isDragon).length >= 3,
      run: async ctx => { setBaseUntilEOT(ctx.g, ctx.src, 5, 5, ['flying'], ['Dragon']); } }],
  };
  SC['Sarkhan, Soul Aflame'] = {
    costMods: dragonDiscount.costMods,
    triggers: [{ on: 'etb', desc: 'Copy the entering Dragon', opt: true,
      filter: (g, self, data) => data.card !== self && ownDragon(self, data.card),
      run: async ctx => {
        const target = ctx.data.card; if (ctx.src.zone !== 'battlefield' || target.zone !== 'battlefield') return;
        const originalName = ctx.src.name;
        const base = target.isCopyOf || target.def;
        MTG.OracleV8Copies.applyCopy(ctx.g,ctx.src,Object.assign({},base,{name:originalName,super:[...new Set([...(base.super||[]),'Legendary'])]}),{duration:'eot',controller:ctx.you});
        ctx.g.recalc();
      } }],
  };
  SC['Taurean Mauler'] = {
    changeling: true,
    triggers: [{ on: 'cast', desc: '+1/+1 counter', filter: (g, self, data) => data.player !== self.ctrl,
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); } }],
  };
  SC['Atsushi, the Blazing Sky'] = {
    triggers: [{ on: 'dies', desc: 'Blazing Sky choice', filter: (g, self, data) => data.card === self,
      modes: { list: [{ label: 'Exile the top two cards' }, { label: 'Create three Treasures' }] },
      run: async ctx => {
        if (ctx.mode === 0) E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 2, 'next');
        else await ctx.g.makeTokens('treasure', ctx.you, { n: 3 });
      } }],
  };

  SC['Leyline Tyrant'] = {
    statics: [{ apply: (g, self) => {
      self.ctrl.persistMana = self.ctrl.persistMana || {}; self.ctrl.persistMana.R = Number.MAX_SAFE_INTEGER;
    } }],
    triggers: [{
      on: 'lto', desc: 'Red mana no longer persists', filter: (g, self, data) => data.card === self,
      run: async ctx => {
        if (!ctx.g.bf().some(card => card.ctrl === ctx.you && card.name === 'Leyline Tyrant')) {
          ctx.you.persistMana = ctx.you.persistMana || {}; delete ctx.you.persistMana.R;
        }
      },
    }, {
      on: 'dies', desc: 'Pay red mana for damage', filter: (g, self, data) => data.card === self,
      opt: true, targets: [anyTarget('Leyline Tyrant: any target')],
      run: async ctx => {
        const max = maxColoredPayable(ctx.g, ctx.you, 'R');
        const x = max ? await ctx.you.controller.decide(ctx.g, {
          type: 'chooseX', min: 0, max, card: ctx.src, prompt: 'Leyline Tyrant: how much red mana?',
          aiHint: { kind: 'lifeX', card: ctx.src, targets: ctx.targets },
        }) : 0;
        const n = Math.max(0, Math.min(Number(x) || 0, max));
        if (!n || !await ctx.g.payMana(ctx.you, repeatColoredCost('R', n))) return;
        if (ctx.targets[0]) await ctx.g.damageAny(ctx.src, ctx.targets[0], n);
      },
    }],
  };
  SC['Opportunistic Dragon'] = {
    triggers: [{
      on: 'etb', desc: 'Seize a Human or artifact', filter: etbSelf,
      targets: [permanentTarget('Opponent Human or artifact', (g, card, ctrl) =>
        card.ctrl !== ctrl && (card.is('Artifact') || card.hasSub('Human')))],
      run: async ctx => {
        const target = ctx.targets[0]; if (!target || target.zone !== 'battlefield') return;
        target.meta._opportunistic = { by: ctx.src.iid, original: target.ctrl, taker: ctx.you };
        target.ctrl = ctx.you; target.sick = true; ctx.g.recalc();
      },
    }, {
      on: 'lto', desc: 'Return seized permanent', filter: (g, self, data) => data.card === self,
      run: async ctx => {
        const target = ctx.g.bf().find(card => card.meta._opportunistic && card.meta._opportunistic.by === ctx.src.iid);
        if (!target) return;
        target.ctrl = target.meta._opportunistic.original; target.sick = true;
        delete target.meta._opportunistic; ctx.g.recalc();
      },
    }],
    statics: [{ apply: (g, self, bf) => {
      for (const card of bf) if (card.meta._opportunistic && card.meta._opportunistic.by === self.iid) {
        card.cur.abilitiesDisabled = true; card.cur.activationDisabled = true;
        card.cur.cantAttack = true; card.cur.cantBlock = true;
      }
    } }],
  };
  SC['Parapet Thrasher'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Choose an unused breach',
      filter: (g, self, data) => data.cards.some(card => ownDragon(self, card)) &&
        (self.meta._parapetTurn !== g.turnNo || (self.meta._parapetUsed || []).length < 3),
      prepareTargets: async ctx => {
        if (ctx.src.meta._parapetTurn !== ctx.g.turnNo) {
          ctx.src.meta._parapetTurn = ctx.g.turnNo; ctx.src.meta._parapetUsed = [];
        }
        const used = ctx.src.meta._parapetUsed;
        const artifactSpec = permanentTarget(`Artifact controlled by ${ctx.data.player.name}`,
          (g, card) => card.ctrl === ctx.data.player && card.is('Artifact'));
        const options = [];
        if (!used.includes('artifact') && ctx.g.legalTargets(artifactSpec, ctx.src, ctx.you).length) {
          options.push({ key: 'artifact', label: 'Destroy an artifact' });
        }
        if (!used.includes('damage')) options.push({ key: 'damage', label: '4 damage to each other opponent' });
        if (!used.includes('impulse')) options.push({ key: 'impulse', label: 'Exile the top card; play it this turn' });
        if (!options.length) return false;
        const choice = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseOption', prompt: 'Parapet Thrasher: choose an unused mode', options,
          aiHint: { kind: 'mode', src: ctx.src, damagedPlayer: ctx.data.player },
        });
        ctx.parapetMode = options.some(option => option.key === choice) ? choice : options[0].key;
        used.push(ctx.parapetMode);
        if (ctx.parapetMode === 'artifact') return ctx.g.pickTargets(ctx, [artifactSpec], ctx.src, ctx.you);
      },
      run: async ctx => {
        if (ctx.parapetMode === 'artifact') {
          const target = ctx.targets[0];
          if (target && target.zone === 'battlefield' && target.ctrl === ctx.data.player && target.is('Artifact')) {
            await ctx.g.destroy(target);
          }
        } else if (ctx.parapetMode === 'damage') {
          for (const opponent of E.eachOpp(ctx.g, ctx.you)) if (opponent !== ctx.data.player) {
            await ctx.g.damagePlayer(ctx.src, opponent, 4, { deferSBA: true });
          }
          await ctx.g.checkSBA();
        } else E.exileTopPlayable(ctx.g, ctx.you, ctx.src, 1, 'turn');
      },
    }],
  };
  SC['Territorial Hellkite'] = {
    triggers: [{
      on: 'beginCombat', desc: 'Choose a new territory', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => {
        ctx.src.meta._territorialAttackedThisCombat = false; delete ctx.src.meta.mustAttackPlayer;
        const eligible = E.eachOpp(ctx.g, ctx.you).filter(opponent => opponent !== ctx.src.meta._territorialLastOpponent);
        if (!eligible.length) { ctx.src.tapped = true; return; }
        ctx.src.meta.mustAttackPlayer = eligible[Math.floor(ctx.g.rnd() * eligible.length)];
      },
    }, {
      on: 'attacks', desc: 'Remember attacked territory', filter: attacksSelf,
      run: async ctx => {
        const defender = ctx.data.defender instanceof MTG.Player ? ctx.data.defender : ctx.data.defender && ctx.data.defender.ctrl;
        ctx.src.meta._territorialAttackedThisCombat = true; ctx.src.meta._territorialLastOpponent = defender || null;
      },
    }, {
      on: 'endCombat', desc: 'Close territorial combat', filter: (g, self, data) => data.player === self.ctrl,
      run: async ctx => {
        if (!ctx.src.meta._territorialAttackedThisCombat) ctx.src.meta._territorialLastOpponent = null;
        delete ctx.src.meta.mustAttackPlayer;
      },
    }],
  };
  SC['Thunderbreak Regent'] = { triggers: [{
    on: 'targeted', desc: 'Punish Dragon targeting',
    filter: (g, self, data) => ownDragon(self, data.card) && data.byPlayer && data.byPlayer !== self.ctrl,
    run: async ctx => { await ctx.g.damagePlayer(ctx.src, ctx.data.byPlayer, 3); },
  }] };
  SC['Thundermane Dragon'] = {
    revealOwnTop: true,
    playTop: (g, self, top) => top.is('Creature') &&
      (top.def.cdaPower ? top.def.cdaPower(g, top) : Number.parseInt(top.def.power || '0', 10) || 0) >= 4,
    triggers: [{
      on: 'cast', desc: 'Mark top-cast creature for haste',
      filter: (g, self, data) => data.player === self.ctrl && data.isCreature && data.so && data.so.from === 'library' &&
        (data.card.def.cdaPower ? data.card.def.cdaPower(g, data.card) : Number.parseInt(data.card.def.power || '0', 10) || 0) >= 4,
      run: async ctx => { ctx.data.card.meta._thundermaneHasteTurn = ctx.g.turnNo; },
    }, {
      on: 'etb', desc: 'Top-cast creature gains haste',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.meta._thundermaneHasteTurn === g.turnNo,
      run: async ctx => { if (ctx.data.card.zone === 'battlefield') E.grantUntilEOT(ctx.g, ctx.data.card, ['haste']); },
    }],
  };
  SC['Verix Bladewing'] = {
    kicker: { cost: '{3}' },
    triggers: [{ on: 'etb', desc: 'Create Karox Bladewing',
      filter: (g, self, data) => data.card === self && !!self.castMeta && self.castMeta.kicked,
      run: async ctx => { await ctx.g.makeTokens('temurKarox44', ctx.you); } }],
  };
  SC.Glorybringer = MTG.OracleV8Exert.native({
    score: (g,self,player) => g.creatures().some(card=>card.ctrl!==player&&!isDragon(card)) ? 5 : 0,
    trigger: {
      desc: 'Exert — 4 damage',
      targets: [T.creature({ prompt: 'Opponent non-Dragon creature',
        filter: (g, card, ctrl) => card.ctrl !== ctrl && !isDragon(card), aiHint: { goal: 'removal', n: 4 } })],
      run: async ctx => { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 4); },
    },
  });
  SC['Harbinger of the Hunt'] = {
    abilities: [{
      label: '1 damage to each creature without flying', cost: { mana: '{2}{R}' },
      run: async ctx => {
        for (const creature of ctx.g.creatures().filter(card => !card.kw('flying')).slice()) {
          await ctx.g.damageCreature(ctx.src, creature, 1, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      }, aiScore: (g, self, player) => g.creatures().filter(card => card.ctrl !== player && !card.kw('flying') && card.toughness <= 1).length,
    }, {
      label: '1 damage to each other creature with flying', cost: { mana: '{2}{G}' },
      run: async ctx => {
        for (const creature of ctx.g.creatures().filter(card => card !== ctx.src && card.kw('flying')).slice()) {
          await ctx.g.damageCreature(ctx.src, creature, 1, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      }, aiScore: (g, self, player) => g.creatures().filter(card => card !== self && card.ctrl !== player && card.kw('flying') && card.toughness <= 1).length,
    }],
  };
  SC['Nesting Dragon'] = { triggers: [{ on: 'landfall', desc: 'Create a Dragon Egg',
    filter: (g, self, data) => data.card.ctrl === self.ctrl,
    run: async ctx => { await ctx.g.makeTokens('temurDragonEgg02', ctx.you); } }] };
  SC['Rapacious Dragon'] = { triggers: [{ on: 'etb', desc: 'Create two Treasures', filter: etbSelf,
    run: async ctx => { await ctx.g.makeTokens('treasure', ctx.you, { n: 2 }); } }] };
  SC['Skarrgan Hellkite'] = {
    asEnters: async (g, card) => {
      const choice = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Skarrgan Hellkite — Riot',
        options: [{ key: 'counter', label: '+1/+1 counter' }, { key: 'haste', label: 'Haste' }],
        aiHint: { kind: 'riot', card },
      });
      card.meta.riotChoice = choice === 'haste' ? 'haste' : 'counter';
    },
    etbCounters: { kind: '+1/+1', n: (g, card) => card.meta.riotChoice === 'counter' ? 1 : 0 },
    statics: [{ apply: (g, self) => { if (self.meta.riotChoice === 'haste') self.cur.kw.add('haste'); } }],
    abilities: [{
      label: '2 divided damage', cost: { mana: '{3}{R}' }, cond: (g, self) => (self.counters['+1/+1'] || 0) > 0,
      targets: [anyTarget('One or two targets', { count: 2, min: 1, upTo: true })],
      run: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [ctx.targets[0]].filter(Boolean);
        const amount = targets.length === 1 ? 2 : 1;
        for (const target of targets) await ctx.g.damageAny(ctx.src, target, amount, { deferSBA: true });
        await ctx.g.checkSBA();
      }, aiScore: () => 3,
    }],
  };
  SC['Stormbreath Dragon'] = {
    statics: [{ apply: (g, self) => { self.cur.protectionFrom.push((g2, source) => !!source && source.colors.includes('W')); } }],
    abilities: [{ label: 'Monstrosity 3', cost: { mana: '{5}{R}{R}' }, cond: (g, self) => !self.meta.monstrous,
      run: async ctx => {
        if (ctx.src.meta.monstrous) return; ctx.src.meta.monstrous = true;
        ctx.g.addCounters(ctx.src, '+1/+1', 3, false, ctx.you); await ctx.g.emit('monstrous', { card: ctx.src });
      }, aiScore: () => 5 }],
    triggers: [{ on: 'monstrous', desc: 'Damage for hand size', filter: (g, self, data) => data.card === self,
      run: async ctx => {
        for (const opponent of E.eachOpp(ctx.g, ctx.you)) await ctx.g.damagePlayer(ctx.src, opponent, opponent.hand.length, { deferSBA: true });
        await ctx.g.checkSBA();
      } }],
  };
  SC['Stormshriek Feral'] = {
    abilities: [{ label: '+1/+0', cost: { mana: '{1}{R}' },
      run: async ctx => { E.pumpUntilEOT(ctx.g, ctx.src, 1, 0); }, aiScore: () => 0.6 }],
    adventure: {
      adventure: true, omen: true, name: 'Flush Out', cost: '{1}{R}', altCostStr: '{1}{R}', types: 'Sorcery',
      resolve: async ctx => {
        if (!ctx.you.hand.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: ctx.you.hand, min: 1, max: 1,
          prompt: 'Flush Out: discard a card', aiHint: { kind: 'cleanupDiscard' },
        });
        if (!picked[0] || !ctx.you.hand.includes(picked[0])) return;
        await ctx.g.discard(ctx.you, [picked[0]]); await ctx.g.draw(ctx.you, 2);
      },
    },
  };
  SC['Whirlwing Stormbrood'] = {
    grantsFlash: (g, self, card, player) => player === self.ctrl && (card.is('Sorcery') || isDragon(card)),
    adventure: {
      adventure: true, omen: true, name: 'Dynamic Soar', cost: '{2}{G}', altCostStr: '{2}{G}', types: 'Sorcery',
      targets: [T.yourCreature({ prompt: 'Dynamic Soar: your creature', aiHint: { goal: 'buff' } })],
      resolve: async ctx => { if (ctx.targets[0]) ctx.g.addCounters(ctx.targets[0], '+1/+1', 3, false, ctx.you); },
    },
  };

  SC['Hammerhead Tyrant'] = {
    triggers: [{
      on: 'cast', desc: 'Bounce a smaller permanent',
      filter: (g, self, data) => data.player === self.ctrl,
      targets: (g, self, data) => [permanentTarget('Opponent nonland permanent with lower mana value',
        (g2, card, ctrl) => card.ctrl !== ctrl && !card.is('Land') && card.mv <= data.mv, { upTo: true })],
      run: async ctx => { if (ctx.targets[0] && ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); },
    }],
  };
  SC['Hellkite Courser'] = {
    triggers: [{
      on: 'etb', desc: 'Commander from command zone', filter: etbSelf, opt: true,
      run: async ctx => {
        const candidates = ctx.you.command.filter(card => card.commander); if (!candidates.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: candidates, min: 0, max: 1,
          prompt: 'Hellkite Courser: commander onto the battlefield', aiHint: { kind: 'bestCreature' },
        });
        const commander = picked[0]; if (!commander || !candidates.includes(commander)) return;
        await ctx.g.move(commander, 'battlefield', { ctrl: ctx.you });
        const iid = commander.iid, timestamp = commander.timestamp;
        ctx.g.untilEffects.push({
          kind: 'hellkiteCourserHaste', iid, timestamp,
          apply: (g, bf) => {
            const current = bf.find(card => card.iid === iid && card.timestamp === timestamp);
            if (current) current.cur.kw.add('haste');
          },
        });
        ctx.g.recalc();
        ctx.g.delayed.push({
          on: 'endStep', name: 'Hellkite Courser returns commander', ctrl: ctx.you,
          run: async delayed => {
            const card = delayed.g.byIid(iid);
            if (card && card.zone === 'battlefield' && card.timestamp === timestamp) {
              await delayed.g.move(card, 'command', { noCmdReplace: true });
            }
          },
        });
      },
    }],
  };
  SC['Keiga, the Tide Star'] = {
    triggers: [{
      on: 'dies', desc: 'Gain control of a creature', filter: (g, self, data) => data.card === self,
      targets: [T.creature({ prompt: 'Keiga: target creature', aiHint: { goal: 'steal' } })],
      run: async ctx => {
        const target = ctx.targets[0]; if (!target || target.zone !== 'battlefield') return;
        target.ctrl = ctx.you; target.sick = true; target.attacking = null; target.blocking = null; ctx.g.recalc();
      },
    }],
  };
  SC['Lathliss, Dragon Queen'] = {
    triggers: [{ on: 'etb', desc: 'Create a 5/5 Dragon',
      filter: (g, self, data) => data.card !== self && ownDragon(self, data.card) && !data.card.isToken,
      run: async ctx => { await ctx.g.makeTokens('temurDragon55', ctx.you); } }],
    abilities: [{ label: 'Dragons get +1/+0', cost: { mana: '{1}{R}' },
      run: async ctx => { E.pumpAllUntilEOT(ctx.g, (g, card) => card.ctrl === ctx.you && isDragon(card), 1, 0); },
      aiScore: (g, self, player) => g.creatures(player).filter(isDragon).length }],
  };
  const mostLife = (g, player) => player && player.life === Math.max(...g.alivePlayers().map(candidate => candidate.life));
  SC['Scourge of the Throne'] = {
    triggers: [{
      on: 'attacks', desc: 'Dethrone',
      filter: (g, self, data) => data.card === self && mostLife(g,
        data.defender instanceof MTG.Player ? data.defender : data.defender && data.defender.ctrl),
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, '+1/+1', 1, false, ctx.you); },
    }, {
      on: 'attacks', desc: 'First attack extra combat',
      filter: (g, self, data) => {
        if (data.card !== self || self.meta._scourgeFirstAttackTurn === g.turnNo) return false;
        self.meta._scourgeFirstAttackTurn = g.turnNo; return true;
      },
      run: async ctx => {
        const defender = ctx.data.defender instanceof MTG.Player ? ctx.data.defender : ctx.data.defender && ctx.data.defender.ctrl;
        if (!mostLife(ctx.g, defender)) return;
        for (const attacker of (ctx.g.combat ? ctx.g.combat.attackers : []).filter(card => card.ctrl === ctx.you)) attacker.tapped = false;
        ctx.g.scheduleAdditionalCombat();
      },
    }],
  };
  SC['Atarka, World Render'] = { triggers: [{
    on: 'attacks', desc: 'Dragon gains double strike', filter: (g, self, data) => ownDragon(self, data.card),
    run: async ctx => { if (ctx.data.card.zone === 'battlefield') E.grantUntilEOT(ctx.g, ctx.data.card, ['double strike']); },
  }] };
  SC['Broodcaller Scourge'] = {
    triggers: [{
      on: 'combatDamageGroupToPlayer', desc: 'Permanent from hand', opt: true,
      filter: (g, self, data) => data.hits.some(hit => ownDragon(self, hit.card)),
      run: async ctx => {
        const damage = ctx.data.hits.filter(hit => ownDragon(ctx.src, hit.card)).reduce((sum, hit) => sum + hit.n, 0);
        const candidates = ctx.you.hand.filter(card => ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle']
          .some(type => card.is(type)) && card.mv <= damage);
        if (!candidates.length) return;
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: candidates, min: 0, max: 1,
          prompt: `Broodcaller Scourge: permanent with mana value ${damage} or less`, aiHint: { kind: 'bestPermanent' },
        });
        if (picked[0] && candidates.includes(picked[0])) await ctx.g.move(picked[0], 'battlefield', { ctrl: ctx.you });
      },
    }],
  };
  SC['Dragonlord Atarka'] = {
    triggers: [{
      on: 'etb', desc: 'Five divided damage', filter: etbSelf,
      targets: [permanentTarget('Any number of opponent creatures/planeswalkers',
        (g, card, ctrl) => card.ctrl !== ctrl && (card.is('Creature') || card.is('Planeswalker')),
        { count: 5, min: 0, upTo: true })],
      prepareTargets: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        const division = await E.divideDamage(ctx.g, ctx.you, ctx.src, targets, 5, { aiKind: 'dividedDamage' });
        if (division === null) return false; ctx.damageDivision = division;
      },
      run: async ctx => {
        const targets = Array.isArray(ctx.targets[0]) ? ctx.targets[0] : [];
        for (const target of targets) {
          const assignment = (ctx.damageDivision || []).find(entry => entry.iid === target.iid);
          if (assignment) await ctx.g.damageAny(ctx.src, target, assignment.n, { deferSBA: true });
        }
        await ctx.g.checkSBA();
      },
    }],
  };
  SC['Ureni of the Unwritten'] = { triggers: [
    { on: 'etb', desc: 'Top eight for a Dragon', filter: etbSelf, run: dragonTopEight },
    { on: 'attacks', desc: 'Top eight for a Dragon', filter: attacksSelf, run: dragonTopEight },
  ] };
  SC['Spit Flame'] = {
    targets: [T.creature({ prompt: 'Spit Flame: target creature', aiHint: { goal: 'removal', n: 4 } })],
    resolve: async ctx => { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], 4); },
    triggers: [{
      on: 'etb', zone: 'graveyard', desc: 'Return Spit Flame', opt: true,
      filter: (g, self, data) => data.card.ctrl === self.owner && isDragon(data.card),
      onlyIf: (g, self) => g.canPayMana(self.owner, U.parseCost('{R}')),
      run: async ctx => {
        if (ctx.src.zone !== 'graveyard' || !await ctx.g.payMana(ctx.you, U.parseCost('{R}'))) return;
        await ctx.g.move(ctx.src, 'hand');
      },
    }],
  };
  SC['Draconic Lore'] = {
    selfCostAdjust: (g, card, player) => g.creatures(player).some(isDragon) ? -2 : 0,
    resolve: async ctx => { await ctx.g.draw(ctx.you, 3); },
  };
  SC['Zenith Festival'] = {
    xCost: true, harmonize: { cost: '{X}{R}{R}' },
    resolve: async ctx => { E.exileTopPlayable(ctx.g, ctx.you, ctx.src, ctx.x || 0, 'next'); },
  };
  SC['Migration Path'] = {
    cycling: { cost: '{2}' },
    resolve: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true, prompt: 'Migration Path: basic land' }); },
  };
  SC["Storm's Wrath"] = {
    resolve: async ctx => {
      for (const permanent of ctx.g.bf().filter(card => card.is('Creature') || card.is('Planeswalker')).slice()) {
        await ctx.g.damageAny(ctx.src, permanent, 4, { deferSBA: true });
      }
      await ctx.g.checkSBA();
    },
  };
  SC['Become the Avalanche'] = {
    resolve: async ctx => {
      await ctx.g.draw(ctx.you, ctx.g.creatures(ctx.you).filter(card => card.power >= 4).length);
      const x = ctx.you.hand.length;
      E.pumpAllUntilEOT(ctx.g, (g, card) => card.ctrl === ctx.you && card.is('Creature'), x, x);
    },
  };
  SC["Selvala's Stampede"] = {
    resolve: async ctx => {
      const votes = await E7.vote(ctx.g, ctx.you, ctx.src, [
        { key: 'wild', label: 'Wild' }, { key: 'free', label: 'Free' },
      ], voter => voter === ctx.you && ctx.you.hand.some(card =>
        ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle'].some(type => card.is(type)))
        ? 'free' : 'wild');
      const wild = votes.get('wild') || 0, free = votes.get('free') || 0;
      const revealed = [], creatures = [];
      while (ctx.you.library.length && creatures.length < wild) {
        const card = ctx.you.library.pop(); revealed.push(card); if (card.is('Creature')) creatures.push(card);
      }
      for (const creature of creatures) { creature.zone = 'nowhere'; await ctx.g.move(creature, 'battlefield', { ctrl: ctx.you }); }
      const rest = revealed.filter(card => !creatures.includes(card));
      for (const card of rest) card.zone = 'library'; ctx.you.library.push(...rest); U.shuffle(ctx.you.library, ctx.g.rnd);
      const permanents = ctx.you.hand.filter(card => ['Artifact', 'Creature', 'Enchantment', 'Land', 'Planeswalker', 'Battle']
        .some(type => card.is(type)));
      if (free && permanents.length) {
        const picked = await ctx.you.controller.decide(ctx.g, {
          type: 'chooseCards', from: permanents, min: 0, max: Math.min(free, permanents.length),
          prompt: `Selvala's Stampede: put up to ${free} permanents onto the battlefield`, aiHint: { kind: 'bestPermanent' },
        });
        for (const permanent of [...new Set(picked || [])].slice(0, free)) {
          if (permanents.includes(permanent) && permanent.zone === 'hand') await ctx.g.move(permanent, 'battlefield', { ctrl: ctx.you });
        }
      }
    },
  };
  SC['Will of the Temur'] = {
    modes: {
      pick: (g, player) => g.bf().some(card => card.ctrl === player && card.commander) ? 'any' : 1,
      min: 1,
      list: [{ label: 'Create a 4/4 flying Dragon copy',
        targets: [T.permanent(null, { prompt: 'Permanent to copy', aiHint: { goal: 'copy' } })] },
      { label: 'Draw equal to greatest mana value',
        targets: [T.player({ prompt: 'Player who draws', aiHint: { goal: 'drawSelf' } })] }],
    },
    resolve: async ctx => {
      let index = 0;
      for (const mode of ctx.mode || []) {
        const target = ctx.targets[index++];
        if (mode === 0 && target) await makeDragonCopy(ctx.g, ctx.you, target);
        else if (mode === 1 && target) {
          const greatest = Math.max(0, ...ctx.g.bf().filter(card => card.ctrl === ctx.you).map(card => card.mv));
          await ctx.g.draw(target, greatest);
        }
      }
    },
  };

  SC["Dragon's Hoard"] = {
    mana: { cost: { tap: true }, produce: [{ ANY: true, n: 1 }] },
    triggers: [{ on: 'etb', desc: 'Gold counter', filter: (g, self, data) => ownDragon(self, data.card),
      run: async ctx => { if (ctx.src.zone === 'battlefield') ctx.g.addCounters(ctx.src, 'gold', 1, false, ctx.you); } }],
    abilities: [{ label: 'Remove a gold counter: draw', cost: { tap: true, rmCounter: { kind: 'gold', n: 1 } },
      cond: (g, self) => (self.counters.gold || 0) > 0,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); }, aiScore: () => 3 }],
  };
  SC['Dragon Tempest'] = {
    triggers: [{
      on: 'etb', desc: 'Flying creature gains haste',
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature') && data.card.kw('flying'),
      run: async ctx => { if (ctx.data.card.zone === 'battlefield') E.grantUntilEOT(ctx.g, ctx.data.card, ['haste']); },
    }, {
      on: 'etb', desc: 'Dragon damage', filter: (g, self, data) => ownDragon(self, data.card),
      targets: [anyTarget('Dragon Tempest: any target')],
      run: async ctx => {
        if (ctx.targets[0]) await ctx.g.damageAny(ctx.data.card, ctx.targets[0], ctx.g.creatures(ctx.you).filter(isDragon).length);
      },
    }],
  };
  SC['Elemental Bond'] = { triggers: [{
    on: 'etb', desc: 'Draw for power 3+',
    filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature') && data.card.power >= 3,
    run: async ctx => { await ctx.g.draw(ctx.you, 1); },
  }] };
  SC['Temur Ascendancy'] = {
    statics: [{ apply: (g, self, bf) => {
      for (const creature of bf) if (creature.ctrl === self.ctrl && creature.is('Creature')) creature.cur.kw.add('haste');
    } }],
    triggers: [{
      on: 'etb', desc: 'Draw for power 4+', opt: true,
      filter: (g, self, data) => data.card.ctrl === self.ctrl && data.card.is('Creature') && data.card.power >= 4,
      run: async ctx => { await ctx.g.draw(ctx.you, 1); },
    }],
  };
  SC['Encroaching Dragonstorm'] = {
    triggers: [{ on: 'etb', desc: 'Two basics tapped', filter: etbSelf,
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, { n: 2, tapped: true, prompt: 'Encroaching Dragonstorm: basic land' }); } },
    { on: 'etb', desc: 'Return Dragonstorm to hand', filter: (g, self, data) => ownDragon(self, data.card),
      run: async ctx => { if (ctx.src.zone === 'battlefield') await ctx.g.move(ctx.src, 'hand'); } }],
  };
  SC['Frontier Siege'] = {
    asEnters: async (g, card) => {
      const choice = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Frontier Siege — choose Khans or Dragons',
        options: [{ key: 'khans', label: 'Khans' }, { key: 'dragons', label: 'Dragons' }],
        aiHint: { kind: 'frontierSiege', card },
      });
      card.meta.siegeMode = choice === 'dragons' ? 'dragons' : 'khans';
    },
    triggers: [{ on: 'precombatMain', desc: 'Khans: add GG',
      filter: (g, self, data) => self.meta.siegeMode === 'khans' && data.player === self.ctrl,
      run: async ctx => { ctx.you.pool.G += 2; } },
    { on: 'postcombatMain', desc: 'Khans: add GG',
      filter: (g, self, data) => self.meta.siegeMode === 'khans' && data.player === self.ctrl,
      run: async ctx => { ctx.you.pool.G += 2; } },
    { on: 'etb', desc: 'Dragons: flying creature fights', opt: true,
      filter: (g, self, data) => self.meta.siegeMode === 'dragons' && data.card.ctrl === self.ctrl &&
        data.card.is('Creature') && data.card.kw('flying'),
      targets: [T.creature({ prompt: 'Creature you do not control to fight',
        filter: (g, card, ctrl) => card.ctrl !== ctrl, aiHint: { goal: 'removal' } })],
      run: async ctx => { await fight(ctx.g, ctx.data.card, ctx.targets[0]); } }],
  };
  SC['Breaching Dragonstorm'] = {
    triggers: [{
      on: 'etb', desc: 'Breach the library', filter: etbSelf,
      run: async ctx => {
        let hit = null;
        while (ctx.you.library.length) {
          const card = ctx.you.library.pop(); card.zone = 'exile'; ctx.you.exile.push(card);
          if (!card.is('Land')) { hit = card; break; }
        }
        if (!hit) return;
        let cast = false;
        if (hit.mv <= 8) {
          const choice = await ctx.you.controller.decide(ctx.g, {
            type: 'chooseOption', prompt: `Breaching Dragonstorm: cast ${hit.name} for free?`,
            options: [{ key: 'cast', label: 'Cast it' }, { key: 'hand', label: 'Put it into hand' }],
            aiHint: { kind: 'freeCast', card: hit },
          });
          if (choice === 'cast') cast = await ctx.g.castSpell(ctx.you, hit, { from: 'exile', free: true });
        }
        if (!cast && hit.zone === 'exile') await ctx.g.move(hit, 'hand');
      },
    }, {
      on: 'etb', desc: 'Return Dragonstorm to hand', filter: (g, self, data) => ownDragon(self, data.card),
      run: async ctx => { if (ctx.src.zone === 'battlefield') await ctx.g.move(ctx.src, 'hand'); },
    }],
  };
  SC['Reflections of Littjara'] = {
    asEnters: async (g, card) => { card.meta.chosenType = await chooseType(g, card.ctrl, card); },
    triggers: [{
      on: 'cast', desc: 'Copy chosen-type spell',
      filter: (g, self, data) => data.player === self.ctrl && self.meta.chosenType && data.card.hasSub(self.meta.chosenType),
      run: async ctx => {
        if (ctx.data.so && ctx.g.stack.includes(ctx.data.so)) {
          await ctx.g.copySpell(ctx.data.so, ctx.you, { mayNewTargets: false, copySource: ctx.src });
        }
      },
    }],
  };
  SC['Bountiful Landscape'] = {
    producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{
      label: 'Sacrifice: basic Forest, Island, or Mountain', cost: { tap: true, sacSelf: true },
      run: async ctx => { await E.searchBasic(ctx.g, ctx.you, {
        n: 1, tapped: true, prompt: 'Bountiful Landscape: basic Forest, Island, or Mountain',
        filter: def => ['Forest', 'Island', 'Mountain'].some(type => (def.subtypes || []).includes(type)),
      }); },
    }],
    cycling: { cost: '{G}{U}{R}' },
  };
  SC['Haven of the Spirit Dragon'] = {
    producesColors: COLORS,
    mana: [{ cost: { tap: true }, produce: [{ C: 1 }] }, {
      cost: { tap: true }, produce: [{ ANY: true, n: 1 }], restrictAbilities: true,
      restrict: (g, action) => action && !action.isAbility && action.card && action.card.is('Creature') && isDragon(action.card),
    }],
    abilities: [{
      label: 'Return a Dragon creature or Ugin planeswalker', cost: { mana: '{2}', tap: true, sacSelf: true },
      targets: [graveTarget('Dragon creature or Ugin planeswalker in your graveyard',
        (g, card, ctrl) => card.owner === ctrl && (card.is('Creature') && isDragon(card) ||
          card.is('Planeswalker') && card.name.includes('Ugin')))],
      run: async ctx => { if (ctx.targets[0] && ctx.targets[0].zone === 'graveyard') await ctx.g.move(ctx.targets[0], 'hand'); },
    }],
  };
  SC['Kessig Wolf Run'] = {
    producesColors: [], mana: { cost: { tap: true }, produce: [{ C: 1 }] },
    abilities: [{ label: '+X/+0 and trample', cost: { mana: '{X}{R}{G}', tap: true }, xCost: true,
      targets: [T.creature({ prompt: 'Kessig Wolf Run: target creature', aiHint: { goal: 'buff' } })],
      run: async ctx => { if (ctx.targets[0]) E.pumpUntilEOT(ctx.g, ctx.targets[0], ctx.x || 0, 0, ['trample']); },
      aiScore: (g, self, player) => g.creatures(player).length ? 2 : 0 }],
  };
  SC['Rockfall Vale'] = {
    producesColors: ['R', 'G'], mana: { cost: { tap: true }, produce: [{ R: 1 }, { G: 1 }] },
    entersTapped: (g, card) => g.lands(card.ctrl).filter(land => land !== card).length < 2,
  };
  SC['Temple of the Dragon Queen'] = {
    producesColors: COLORS,
    asEnters: async (g, card) => {
      card.meta.controlledDragon = g.creatures(card.ctrl).some(creature => creature !== card && isDragon(creature));
      const revealable = card.ctrl.hand.filter(other => other !== card && isDragon(other));
      if (!card.meta.controlledDragon && revealable.length) {
        const picked = await card.ctrl.controller.decide(g, {
          type: 'chooseCards', from: revealable, min: 0, max: 1,
          prompt: 'Temple of the Dragon Queen: reveal a Dragon', aiHint: { kind: 'revealLand', source: card },
        });
        card.meta.revealedDragon = !!picked[0] && revealable.includes(picked[0]);
      }
      const options = COLORS.map(color => ({ key: color, label: color }));
      const color = await card.ctrl.controller.decide(g, {
        type: 'chooseOption', prompt: 'Temple of the Dragon Queen: choose a color', options,
        aiHint: { kind: 'manaColor', card },
      });
      card.meta.chosenColor = COLORS.includes(color) ? color : 'R';
    },
    entersTapped: (g, card) => !card.meta.controlledDragon && !card.meta.revealedDragon,
    mana: { cost: { tap: true }, produce: (g, card) => [{ [card.meta.chosenColor || 'R']: 1 }] },
  };

  // Reused definitions intentionally stay owned by their existing modules:
  // Kodama's Reach, Frontier Bivouac, and Yavimaya Coast.
})();
