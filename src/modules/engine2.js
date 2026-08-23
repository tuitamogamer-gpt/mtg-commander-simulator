// ===== engine2.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Engine part 2: mana, casting, activation, priority, turn loop, combat
(function () {
  const U = MTG;
  const G = MTG.Game.prototype;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  // Equip cijena za konkretan cilj: karte tipa "Equip Elf {2} / Equip {5}"
  // imaju jeftiniju alternativu koja vrijedi samo za ciljeve koji prolaze filter.
  function equipCostFor(eq, target) {
    const alt = eq.def.equipAlt;
    if (alt && target && alt.filter(target)) return alt.cost;
    return eq.cur.equipCost !== undefined ? eq.cur.equipCost : eq.def.equip;
  }

  function equipTargetSpec(player) {
    return {
      what: 'creature', prompt: 'Stvorenje koje kontrolišeš',
      filter: (g, target) => target.zone === 'battlefield' && target.ctrl === player && target.is('Creature'),
    };
  }

  function equipCandidates(game, equipment, player) {
    const spec = equipTargetSpec(player);
    return game.legalTargets(spec, equipment, player).filter(target =>
      target.iid !== equipment.attachedTo &&
      (game.canPayMana(player, game.abilityManaCost(player, equipment, equipCostFor(equipment, target)), null,
        { artifactAbilityAlreadyUsed: equipment.is('Artifact') }) ||
        equipment.def.equipRemoveCounter && Object.values(equipment.counters).some(n => n > 0)));
  }

  function controlsCommander(game, player) {
    return game.bf().some(card => card.ctrl === player && card.commander);
  }

  function modePickFor(game, player, card, castOpts) {
    const configured = card.def.modes && card.def.modes.pick;
    const pick = typeof configured === 'function'
      ? configured(game, player, card, castOpts || {})
      : (configured || 1);
    return card.def.castCondBoth && controlsCommander(game, player) ? 2 : pick;
  }

  function modeTargetsFor(game, entry, card, castOpts) {
    if (!entry || !entry.targets) return [];
    return typeof entry.targets === 'function'
      ? entry.targets(game, card, castOpts || {}) || []
      : entry.targets;
  }

  function manaOptionLabel(option) {
    if (option.ANY) return `${option.n || 1} mana of any color`;
    return Object.entries(option)
      .filter(([key]) => key !== 'n')
      .map(([color, amount]) => `${amount}×${color}`)
      .join(' + ');
  }

  function manualManaLabel(source) {
    const cost = source.extraCost || {};
    const costParts = [];
    if (cost.mana) costParts.push(typeof cost.mana === 'string' ? cost.mana : 'plati manu');
    if (cost.tap) costParts.push('tap');
    if (cost.sacSelf) costParts.push('žrtvuj ovu kartu');
    if (cost.life) costParts.push(`plati ${cost.life} života`);
    const produces = source.produce.map(manaOptionLabel).join(' ili ');
    const grantedBy = source.grantedBy ? ` — daje ${source.grantedBy.name}` : '';
    return `Mana: ${costParts.length ? costParts.join(' + ') + ' → ' : ''}${produces}${grantedBy}`;
  }

  function manualManaKey(source) {
    const cost = source.extraCost || {};
    return JSON.stringify({
      card: source.card.iid,
      tap: !!cost.tap,
      sacSelf: !!cost.sacSelf,
      sacType: cost.sacType || null,
      life: cost.life || 0,
      mana: typeof cost.mana === 'string' ? cost.mana : !!cost.mana,
      produce: source.produce,
    });
  }

  // ============================================================
  // Mana sources & payment
  // ============================================================
  // A mana source descriptor: {card, options:[{W:1},{G:1}], cost:{tap,sac,mana,life}, restrict, multi:{C:2}}
  G.manaSources = function (p, forSpell) {
    const out = [];
    for (const c of this.bf()) {
      if (c.ctrl !== p) continue;
      if (c.cur && (c.cur.abilitiesDisabled || c.cur.activationDisabled)) continue;
      const ownMana = c.def.mana ? (Array.isArray(c.def.mana) ? c.def.mana : [c.def.mana]) : [];
      const mm = ownMana.concat(c.cur && c.cur.extraMana || []);
      if (!mm) continue;
      const list = mm;
      for (const m of list) {
        if (m.cond && !m.cond(this, c, p)) continue;
        if (m.needsUntap !== false && c.tapped && m.cost && m.cost.tap) continue;
        if (m.cost && m.cost.tap && c.tapped) continue;
        if (m.cost && m.cost.tap && c.is('Creature') && c.sick && !c.kw('haste') && !m.creatureOK) continue;
        if (m.oncePerTurn && c.meta['_mana_' + (m.key || 0)] === this.turnNo) continue;
        if (m.cost && m.cost.sacSelf && !this.canSacrifice(c)) continue;
        if (m.cost && m.cost.sacType && !this.bf().some(x => x.ctrl === p && x !== c &&
          x.hasSub(m.cost.sacType) && this.canSacrifice(x))) continue;
        if (m.cost && m.cost.rmCounter) {
          const kind = m.cost.rmCounter.kind || m.cost.rmCounter;
          if ((c.counters[kind] || 0) < (m.cost.rmCounter.n || 1)) continue;
        }
        // 3. argument je kartica-izvor: treba kartama tipa Secluded Courtyard
        // kojima ograničenje zavisi od izbora zapamćenog na samoj karti.
        // Kod plaćanja SPOSOBNOSTI primjenjuju se samo restrikcije koje se
        // izričito prijave (restrictAbilities), da postojeće spell-only
        // restrikcije ostanu netaknute.
        if (m.restrict && forSpell && (!forSpell.isAbility || m.restrictAbilities)
          && !m.restrict(this, forSpell, c)) continue;
        let produce = m.produce;
        if (typeof produce === 'function') produce = produce(this, c, p);
        if (!produce || !produce.length) continue;
        if (c.hasSub('Treasure') && this.bf().some(source =>
          source.ctrl === p && source.def.improvesTreasures && (source.meta.level || 1) >= 2)) {
          produce = produce.map(option => Object.fromEntries(
            Object.entries(option).map(([key, value]) => [key, typeof value === 'number' ? value * 2 : value])
          ));
        }
        out.push({ card: c, m, produce, extraCost: m.cost || { tap: true } });
      }
    }
    // granted mana abilities (Brightcap Badger: Fungus/Saproling tap for G)
    // Dodijeljena sposobnost mora nositi SVOJU cijenu i restrikciju: npr. Ninja
    // Pizza daje Foodovima "{T}, Sacrifice this artifact: Add any color" — bez
    // sacSelf bi Food bio vječni mana rock umjesto jednokratnog.
    for (const granter of this.bf()) {
      const gm = granter.def.grantMana;
      if (!gm || granter.ctrl !== p) continue;
      if (gm.restrict && forSpell && !gm.restrict(this, forSpell, granter)) continue;
      const gcost = gm.cost || { tap: true };
      for (const x of this.bf()) {
        if (x.ctrl !== p) continue;
        if (gcost.tap && x.tapped) continue;
        if (!gm.filter(this, x, granter)) continue;
        if (gcost.tap && x.is('Creature') && x.sick && !x.kw('haste') && !gm.ignoreSickness) continue;
        out.push({
          card: x,
          m: { cost: gcost, restrict: gm.restrict, ignoreSickness: !!gm.ignoreSickness },
          produce: gm.produce,
          extraCost: gcost,
          grantedBy: granter,
        });
      }
    }
    // convoke / improvise: tapanje stvorenja/artefakata plaća spell
    if (forSpell && forSpell.card && !forSpell.isAbility) {
      const fd = forSpell.card.def;
      const hasImpStat = fd.improvise || this.bf().some(c => c.ctrl === p && c.def.grantsImprovise && !forSpell.card.is('Artifact'));
      const grantedConvoke = !fd.convoke && forSpell.card.def.types.includes('Creature') &&
        (forSpell.card.def.super || []).includes('Legendary') &&
        this.bf().some(cc => cc.ctrl === p && cc.def.grantsConvokeLegendary);
      if (fd.convoke || grantedConvoke) {
        for (const x of this.bf()) {
          if (x.ctrl !== p || x.tapped || !x.is('Creature')) continue;
          // Convoke nije aktivirana {T} sposobnost stvorenja; summoning
          // sickness zato ne sprječava da ga tapujemo za plaćanje spella.
          const opts2 = [{ C: 1 }].concat(x.colors.map(col => ({ [col]: 1 })));
          out.push({ card: x, m: { cost: { tap: true }, viaConvoke: true }, produce: opts2, extraCost: { tap: true } });
        }
      }
      if (hasImpStat) {
        for (const x of this.bf()) {
          if (x.ctrl !== p || x.tapped || !x.is('Artifact')) continue;
          if (x.def.mana) continue; // mana rocks već rade svoj posao
          out.push({ card: x, m: { cost: { tap: true }, viaConvoke: true }, produce: [{ C: 1 }], extraCost: { tap: true } });
        }
      }
    }
    return out;
  };

  // Compute total castable check: can p pay cost (greedy+backtrack over sources)?
  G.manaSolve = function (p, cost, forSpell, opts = {}) {
    // cost: parsed {generic, x, pips} with x already multiplied in via opts.xVal
    const pips = cost.pips.slice();
    let generic = Math.max(0, cost.generic + (opts.xVal || 0) * (cost.x || 0) - (cost.xReduction || 0));
    // first: use floating pool
    const pool = Object.assign({}, p.pool);
    const usedPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    const remainingPips = [];
    for (const pip of pips) {
      let done = false;
      for (const optc of pip) {
        if (COLORS.includes(optc) || optc === 'C') {
          if (pool[optc] > 0) { pool[optc]--; usedPool[optc]++; done = true; break; }
        }
      }
      if (!done) {
        if (pip[1] === 'PHY') { remainingPips.push(pip); }
        else remainingPips.push(pip);
      }
    }
    for (const col of ['C', 'W', 'U', 'B', 'R', 'G']) {
      while (generic > 0 && pool[col] > 0) { pool[col]--; usedPool[col]++; generic--; }
    }
    // then sources
    const onlyCards = opts.onlyCards ? new Set(opts.onlyCards) : null;
    const sources = this.manaSources(p, forSpell).filter(s =>
      (!opts.excludeCards || !opts.excludeCards.includes(s.card)) &&
      (!onlyCards || onlyCards.has(s.card)));
    // converters (sources that consume mana, e.g. signets) must come FIRST so their
    // consumption is appended to the need and covered by plain sources explored later.
    const flex = s => {
      let f = s.produce.length * 10;
      if (s.rawConsume) f -= 1000;
      if (s.produce.some(o => o.ANY)) f += 100;
      if (s.extraCost.sacSelf) f += 200;
      if (s.extraCost.life) f += 50;
      if (s.m.amountFlex) f += 150;
      return f;
    };
    for (const s of sources) {
      const cm = s.extraCost && s.extraCost.mana ? U.parseCost(typeof s.extraCost.mana === 'function' ? s.extraCost.mana(this, s.card) : s.extraCost.mana) : null;
      if (cm && (cm.generic || cm.pips.length)) s.rawConsume = cm;
    }
    sources.sort((a, b) => flex(a) - flex(b));
    const plan = [];
    const need = { pips: remainingPips.slice(), generic };
    let nodes = 0; // hard budget — sprječava eksponencijalnu eksploziju backtrackinga

    const artifactDiscount = this.artifactAbilityDiscountAmount(p);
    const initiallyUsedArtifactAbility = !!opts.artifactAbilityAlreadyUsed || artifactDiscount === 0;
    const tryCover = (idx, needPips, needGen, planAcc, artifactAbilityUsed = initiallyUsedArtifactAbility) => {
      if (++nodes > 6000) return null;
      if (!needPips.length && needGen <= 0) return planAcc;
      if (idx >= sources.length) {
        // phyrexian fallback: pay 2 life per PHY pip
        const allPhy = needPips.every(pp => pp[1] === 'PHY');
        if (allPhy && needGen <= 0) {
          return planAcc.concat(needPips.map(pp => ({ phyrexianLife: 2 })));
        }
        return null;
      }
      const s = sources[idx];
      // Jedna karta = jedno tapanje. Pain i filter landovi imaju po dvije
      // {T} mana sposobnosti kao zasebne unose, pa je solver znao tapnuti istu
      // zemlju dvaput i tako naduvati dostupnu manu.
      if (s.extraCost && s.extraCost.tap &&
        planAcc.some(st => st.src && st.src.card === s.card && st.src.extraCost && st.src.extraCost.tap)) {
        return tryCover(idx + 1, needPips, needGen, planAcc, artifactAbilityUsed);
      }
      // Try the least-flexible/least-costly sources first (the source list is
      // already ordered that way). The old skip-first DFS explored 2^N
      // subsets before discovering that a large X spell needed most lands,
      // hitting the 6000-node guard around X=10 even with 25 Forests.
      for (const optn of s.produce) {
        const isArtifactAbility = s.card && s.card.is && s.card.is('Artifact') && !(s.m && s.m.viaConvoke);
        const consume = s.rawConsume ? {
          generic: Math.max(0, s.rawConsume.generic - (isArtifactAbility && !artifactAbilityUsed ? artifactDiscount : 0)),
          x: s.rawConsume.x || 0,
          pips: s.rawConsume.pips.map(x => x.slice()),
        } : null;
        const usedAfter = artifactAbilityUsed || isArtifactAbility;
        // consumption (converters like signets): appended to the need
        const consPips = consume ? consume.pips.map(x => x.slice()) : [];
        const consGen = consume ? consume.generic : 0;
        if (optn.ANY) {
          const n = optn.n || 1;
          const np = needPips.slice(); let ng = needGen; let units = n;
          for (let i = 0; i < np.length && units > 0;) {
            const pp = np[i];
            if (pp.some(o => COLORS.includes(o))) { np.splice(i, 1); units--; }
            else i++;
          }
          while (units > 0 && ng > 0) { ng--; units--; }
          if (np.length < needPips.length || ng < needGen) {
            const r = tryCover(idx + 1, np.concat(consPips), ng + consGen,
              planAcc.concat([{ src: s, chosen: optn, consume }]), usedAfter);
            if (r) return r;
          }
        } else {
          const np = needPips.slice(); let ng = needGen; let usedAnything = false;
          const gives = Object.assign({}, optn);
          for (const col of Object.keys(gives)) {
            let cnt = gives[col];
            for (let i = 0; i < np.length && cnt > 0;) {
              if (np[i].includes(col)) { np.splice(i, 1); cnt--; usedAnything = true; }
              else i++;
            }
            while (cnt > 0 && ng > 0) { ng--; cnt--; usedAnything = true; }
          }
          if (usedAnything) {
            const r = tryCover(idx + 1, np.concat(consPips), ng + consGen,
              planAcc.concat([{ src: s, chosen: optn, consume }]), usedAfter);
            if (r) return r;
          }
        }
      }
      // option: preserve/skip this source
      return tryCover(idx + 1, needPips, needGen, planAcc, artifactAbilityUsed);
    };
    const res = tryCover(0, need.pips, need.generic, []);
    if (!res) return null;
    return { plan: res, usedPool };
  };

  G.canPayMana = function (p, cost, forSpell, opts) {
    return !!this.manaSolve(p, cost, forSpell, opts || {});
  };

  G.manualManaSelectionSolution = function (p, cost, forSpell, cards, opts = {}) {
    const selected = [...new Set((cards || []).filter(Boolean))];
    const available = new Set(this.manaSources(p, forSpell)
      .filter(source => !opts.excludeCards || !opts.excludeCards.includes(source.card))
      .map(source => source.card));
    if (selected.some(card => !available.has(card))) return null;
    const sol = this.manaSolve(p, cost, forSpell, Object.assign({}, opts, { onlyCards: selected }));
    if (!sol) return null;
    const used = new Set(sol.plan.filter(step => step.src).map(step => step.src.card));
    if (used.size !== selected.length || selected.some(card => !used.has(card))) return null;
    return sol;
  };

  G.payMana = async function (p, cost, forSpell, opts = {}) {
    let sol = this.manaSolve(p, cost, forSpell, opts);
    if (!sol) return false;
    // Manualni izbor vrijedi za spellove i samo za ljudskog igraca. Pool mana
    // se i dalje trosi prva; igrac bira tacne permanente za preostali iznos.
    if (opts.isSpell && p.manualMana && !p.isAI && sol.plan.some(step => step.src)) {
      const allSources = this.manaSources(p, forSpell)
        .filter(source => !opts.excludeCards || !opts.excludeCards.includes(source.card));
      const candidates = [...new Set(allSources.map(source => source.card))];
      const suggested = [...new Set(sol.plan.filter(step => step.src).map(step => step.src.card))];
      const choice = await p.controller.decide(this, {
        type: 'chooseManaSources', player: p, cost, forSpell, opts,
        candidates, sources: allSources, suggested,
        prompt: `${forSpell && forSpell.card ? forSpell.card.name : 'Spell'}: izaberi mana izvore`,
      });
      if (!(choice && choice.auto)) {
        const cards = Array.isArray(choice) ? choice : choice && choice.cards;
        const manual = this.manualManaSelectionSolution(p, cost, forSpell, cards, opts);
        if (!manual) {
          this.lg(`${forSpell && forSpell.card ? forSpell.card.name : 'Spell'}: the selected mana sources cannot pay the cost.`);
          return false;
        }
        sol = manual;
      }
    }
    // activate sources: plain producers first, converters (which consume mana) last.
    // Sva produkcija ulazi u pool; na kraju se CIJELA cijena skida iz poola.
    const steps = sol.plan.slice().sort((a, b) => (a.consume ? 1 : 0) - (b.consume ? 1 : 0));
    const genTotal0 = Math.max(0, cost.generic + (opts.xVal || 0) * (cost.x || 0) - (cost.xReduction || 0));
    const needColors = cost.pips.map(pp => pp.find(c => COLORS.includes(c))).filter(Boolean);
    let phyPaidWithLife = 0;
    for (const step of steps) {
      if (step.phyrexianLife) { await this.loseLife(p, step.phyrexianLife, 'phyrexian'); phyPaidWithLife++; continue; }
      if (step.consume) this.deductPool(p, step.consume);
      await this.activateManaSource(p, step.src, step.chosen, forSpell, needColors);
    }
    // deduct the full cost from pool (pre-existing pool + fresh production)
    const genTotal = genTotal0;
    const normalPips = cost.pips.filter(pp => pp[1] !== 'PHY');
    const phyPips = cost.pips.filter(pp => pp[1] === 'PHY');
    const payPips = normalPips.concat(phyPips.slice(phyPaidWithLife));
    this._payColors = new Set(); // sunburst/converge praćenje boja
    this.deductPool(p, { generic: genTotal, pips: payPips });
    if (forSpell && forSpell.card) forSpell.card.meta._payColors = [...this._payColors];
    if (forSpell) forSpell.phyrexianLifePaid = phyPaidWithLife;
    // spent tracking for expend
    // Convoke and Phyrexian life pay a portion of the total cost without
    // spending mana.  Effects such as Kurbis and expend care about the mana
    // actually spent, not the spell's final total cost.
    const convoked = forSpell && forSpell.convokedCards ? forSpell.convokedCards.length : 0;
    const total = Math.max(0, genTotal + cost.pips.length - phyPaidWithLife - convoked);
    if (forSpell) forSpell.manaSpent = total;
    if (opts.isSpell) await this.trackSpentOnSpell(p, total);
    this.note('mana', { p });
    return true;
  };

  G.activateManaSource = async function (p, s, chosen, forSpell, needColors, skipMark) {
    const c = s.card;
    const cost = s.extraCost;
    if (!skipMark) this.markAbilityActivated(p, c, s.m && s.m.viaConvoke);
    if (cost.tap) this.tap(c);
    if (cost.life) await this.loseLife(p, cost.life, 'mana');
    if (cost.sacSelf) await this.sacrifice(p, c);
    if (cost.sacType) {
      const pool = this.bf().filter(x => x.ctrl === p && x !== c && x.hasSub(cost.sacType));
      if (pool.length) await this.sacrifice(p, pool[0]);
    }
    if (cost.sacSelf && c.hasSub('Treasure') && forSpell) forSpell.treasureUsed = true;
    if (c.is('Artifact') && forSpell) {
      const amount = chosen.ANY ? (chosen.n || 1) : Object.entries(chosen)
        .filter(([key]) => key !== 'n').reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
      forSpell.artifactManaSpent = (forSpell.artifactManaSpent || 0) + amount;
    }
    if (s.m.viaConvoke && forSpell) {
      forSpell.convokedCards = forSpell.convokedCards || [];
      if (!forSpell.convokedCards.includes(c)) forSpell.convokedCards.push(c);
    }
    if (cost.counter === '-1/-1') await this.addM1(c, 1, p);
    else if (cost.counter) this.addCounters(c, cost.counter, 1, true, p);
    if (cost.rmCounter) this.removeCounters(c, cost.rmCounter.kind || cost.rmCounter, cost.rmCounter.n || 1);
    if (s.m.oncePerTurn) c.meta['_mana_' + (s.m.key || 0)] = this.turnNo;
    if (s.m.onProduce) await s.m.onProduce(this, c, p, chosen, forSpell);
    const actualProduced = {};
    if (chosen.ANY) {
      const n = chosen.n || 1;
      for (let i = 0; i < n; i++) {
        // pri plaćanju cijene: automatski uzmi boju koju cijena traži (bez prompta)
        let col = null;
        if (needColors && needColors.length) col = needColors.shift();
        if (!col) {
          col = await p.controller.decide(this, {
            type: 'chooseOption', prompt: `${c.name}: koja boja mane?`,
            options: COLORS.map(x => ({ key: x, label: x })),
            aiHint: { kind: 'manaColor', forSpell },
          });
        }
        p.pool[col] = (p.pool[col] || 0) + 1;
        actualProduced[col] = (actualProduced[col] || 0) + 1;
      }
    } else {
      for (const col of Object.keys(chosen)) {
        if (col === 'n') continue;
        p.pool[col] = (p.pool[col] || 0) + chosen[col];
        actualProduced[col] = (actualProduced[col] || 0) + chosen[col];
      }
    }
    if (c.is('Land')) {
      // aura hooks (Wolfwillow Haven)
      for (const aid of c.attachments) {
        const a = this.byIid(aid);
        if (a && a.def.extraManaOnTap) p.pool[a.def.extraManaOnTap] = (p.pool[a.def.extraManaOnTap] || 0) + 1;
      }
      // battlefield hooks (Barbflare Gremlin)
      for (const b of this.bf()) {
        if (b.def.landTapHook) await b.def.landTapHook(this, b, c, p, actualProduced);
      }
      await this.emit('tappedForMana', { card: c, player: p });
    }
  };

  G.deductPool = function (p, cost) {
    const spent = this._payColors = this._payColors || new Set();
    for (const pip of cost.pips) {
      let done = false;
      for (const col of pip) {
        if (p.pool[col] > 0) { p.pool[col]--; done = true; if (col !== 'C') spent.add(col); break; }
      }
      // fallback: ANY-color izvor je mogao proizvesti "pogrešnu" boju — skini bilo koju
      if (!done) {
        for (const col of ['C', 'W', 'U', 'B', 'R', 'G']) {
          if (p.pool[col] > 0) { p.pool[col]--; if (col !== 'C') spent.add(col); break; }
        }
      }
    }
    let gen = cost.generic;
    for (const col of ['C', 'W', 'U', 'B', 'R', 'G']) {
      while (gen > 0 && p.pool[col] > 0) { p.pool[col]--; gen--; if (col !== 'C') spent.add(col); }
    }
  };

  G.trackSpentOnSpell = async function (p, n) {
    const before = p.turnState.manaSpentOnSpells;
    p.turnState.manaSpentOnSpells += n;
    for (const th of [4, 6, 8]) {
      if (before < th && p.turnState.manaSpentOnSpells >= th && !p.turnState.expendFired[th]) {
        p.turnState.expendFired[th] = true;
        await this.emit('expend' + th, { player: p });
      }
    }
  };

  G.emptyPool = function () {
    for (const p of this.players) {
      for (const col of Object.keys(p.pool)) {
        const keep = (p.persistMana && p.persistMana[col]) || 0;
        p.pool[col] = Math.min(p.pool[col], keep);
      }
    }
  };

  G.expirePersistentMana = function () {
    for (const player of this.players) player.persistMana = {};
  };

  G.artifactAbilityDiscountAmount = function (p) {
    if ((p.turnState.artifactAbilitiesActivated || 0) !== 0) return 0;
    return 2 * this.bf().filter(card => card.ctrl === p && card.def.firstArtifactAbilityDiscount).length;
  };

  G.hasArtifactAbilityDiscount = function (p) {
    return this.artifactAbilityDiscountAmount(p) > 0;
  };

  G.abilityManaCost = function (p, source, rawCost) {
    const parsed = typeof rawCost === 'string' ? U.parseCost(rawCost || '') : {
      generic: rawCost && rawCost.generic || 0,
      x: rawCost && rawCost.x || 0,
      pips: rawCost && rawCost.pips ? rawCost.pips.map(pip => pip.slice()) : [],
    };
    if (source && source.is && source.is('Artifact')) {
      parsed.generic = Math.max(0, parsed.generic - this.artifactAbilityDiscountAmount(p));
    }
    return parsed;
  };

  G.markAbilityActivated = function (p, source, viaConvoke) {
    if (!viaConvoke && source && source.is && source.is('Artifact')) {
      p.turnState.artifactAbilitiesActivated = (p.turnState.artifactAbilitiesActivated || 0) + 1;
    }
  };

  // ============================================================
  // Cost computation (spells)
  // ============================================================
  G.spellCost = function (p, card, castOpts = {}) {
    // returns parsed cost with reductions applied
    let str = castOpts.altCostStr !== undefined ? castOpts.altCostStr : card.def.cost;
    if (castOpts.free) return { generic: 0, x: 0, pips: [] };
    const cost = U.parseCost(str || '');
    let generic = cost.generic;
    // commander tax
    if (card.commander && card.zone === 'command' && !castOpts.noTax) generic += 2 * (card.cmdCasts || 0);
    // cost modifiers from battlefield
    for (const c of this.bf()) {
      const mods = c.def.costMods;
      if (!mods) continue;
      for (const m of mods) {
        const delta = m(this, c, { player: p, card, castOpts });
        if (delta) generic += delta;
      }
    }
    // card's own cost adjust (Ghalta, Octavia, Eris, Blasphemous...)
    if (card.def.selfCostAdjust && !castOpts.altCostStr) {
      generic += card.def.selfCostAdjust(this, card, p);
    }
    // one-shot reductions (Kaza)
    if (p.tempReductions) {
      for (const r of p.tempReductions) {
        if (r.filter(this, card)) generic += r.delta;
      }
    }
    // A generic reduction larger than the printed generic component may also
    // reduce X.  Preserve that residual instead of discarding it at zero.
    cost.generic = Math.max(0, generic);
    cost.xReduction = Math.max(0, -generic);
    // "Spend mana as though it were mana of any color" mijenja samo način
    // plaćanja obojenih pipova; mana value i generički dio ostaju isti.
    if (castOpts.asThoughAnyColor) {
      cost.pips = cost.pips.map(pip => {
        if (!pip.some(symbol => COLORS.includes(symbol))) return pip;
        const special = pip.filter(symbol => symbol === 'PHY' || symbol === 'TWO');
        return ['C', ...COLORS, ...special];
      });
    }
    // life component of alternative costs (Deep Analysis flashback)
    if (castOpts.lifeCost) cost.lifeCost = castOpts.lifeCost;
    return cost;
  };

  // ============================================================
  // What can a player do right now?
  // ============================================================
  G.canCastTiming = function (p, card, alt) {
    if (p.cantCastUntilTurnStart && p.turnsStarted < p.cantCastUntilTurnStart) return false;
    if (p.turnState && p.turnState.cantCastAdditional) return false;
    // Adventure polovina ima SVOJ tip: Instant adventure na stvorenju bez flasha
    // se ipak baca u tuđem potezu (npr. Mesmeric Glare na Hypnotic Sprite).
    const advSpeed = alt && alt.adventure && alt.types
      ? (String(alt.types).includes('Instant') ? 'instant' : 'sorcery') : null;
    const flashGranted = this.bf().some(source => source.ctrl === p && source.def.grantsFlash &&
      source.def.grantsFlash(this, source, card, p)) ||
      (p.tempFlashFilters || []).some(grant => grant.turn === this.turnNo && grant.filter(this, card, p));
    const speed = (alt && alt.speed) || advSpeed ||
      (card.is('Instant') || card.kw('flash') || card.def.kws && card.def.kws.includes('flash') || flashGranted ? 'instant' : 'sorcery');
    if (speed === 'instant') {
      // Dromoka lock
      for (const c of this.bf()) {
        if (c.def.oppCantCastYourTurn && c.ctrl !== p && this.turnPlayer === c.ctrl) return false;
      }
      return true;
    }
    // sorcery speed: your turn, main phase, empty stack
    if (this.turnPlayer !== p) return false;
    if (this.phase !== 'main1' && this.phase !== 'main2') return false;
    if (this.stack.length) return false;
    for (const c of this.bf()) {
      if (c.def.oppCantCastYourTurn && c.ctrl !== p && this.turnPlayer === c.ctrl) return false;
    }
    return true;
  };

  // Dozvole tipa "do kraja tvog sljedećeg poteza" ne smiju koristiti
  // globalni turnNo: u Commander podu između dva moja poteza prolaze još tri
  // protivnička poteza. playableUntilOwnTurn broji samo poteze igrača koji je
  // dobio dozvolu, a cleanup tog igrača je eksplicitno gasi.
  G.hasExilePlayPermission = function (p, card) {
    const m = card && card.meta;
    if (!m || (m.playableBy && m.playableBy !== p)) return false;
    if (m.theaterSource) {
      const theater = this.byIid(m.theaterSource);
      if (!theater || theater.zone !== 'battlefield' || theater.ctrl !== p) return false;
    }
    if (m.playableUntilOwnTurn !== undefined) return p.turnsStarted <= m.playableUntilOwnTurn;
    return m.playableUntil !== undefined && m.playableUntil >= this.turnNo;
  };

  G.expireOwnTurnExilePermissions = function (p) {
    for (const owner of this.players) for (const card of owner.exile) {
      const m = card.meta;
      if (!m || m.playableBy !== p || m.playableUntilOwnTurn === undefined) continue;
      if (p.turnsStarted < m.playableUntilOwnTurn) continue;
      delete m.playableUntilOwnTurn;
      delete m.playableBy;
    }
  };

  G.castableList = function (p) {
    // returns [{card, from, alt}] of spells p could cast now (mana-feasible)
    // Prepared kopiju može castati trenutni kontrolor prepared permanenta,
    // čak i kada se kontrola promijenila nakon pripreme.
    for (const owner of this.players) for (const card of owner.exile) {
      if (!card.meta || !card.meta.preparedBy) continue;
      const preparer = this.byIid(card.meta.preparedBy);
      if (preparer && preparer.zone === 'battlefield' && preparer.meta.prepared) card.meta.playableBy = preparer.ctrl;
    }
    const out = [];
    const consider = (card, from, alt) => {
      if (card.is('Land')) return;
      if (card.meta && card.meta.playableCondition && !card.meta.playableCondition(this, p, card)) return;
      if (!this.canCastTiming(p, card, alt)) return;
      if (card.def.castCond && !card.def.castCond(this, p, card)) return;
      const castOpts = alt ? Object.assign({}, alt) : {};
      castOpts.from = from;
      const cost = this.spellCost(p, card, castOpts);
      const xVal = cost.x ? (castOpts.xFixed !== undefined ? castOpts.xFixed : 0) : 0;
      if (cost.x && typeof card.def.xValues === 'function') {
        const maxX = this.maxAffordableX(p, cost, card);
        if (!this.legalXValues(p, card, castOpts, maxX).length) return;
      }
      if (alt && alt.delve) {
        // delve: reduce generic by available gy cards
        const avail = p.graveyard.length;
        const c2 = Object.assign({}, cost, { generic: Math.max(0, cost.generic - avail) });
        if (!this.canPayMana(p, c2, { card })) return;
      } else {
        if (!this.canPayMana(p, cost, { card }, { xVal })) return;
      }
      // additional cost feasibility (sac/discard)
      const ac = card.def.addlCost;
      if (ac && !(alt && alt.adventure)) {
        if (ac.sacCreature && !this.creatures(p).some(c =>
          (!ac.sacCreatureFilter || ac.sacCreatureFilter(this, c, p, card)) && this.canSacrifice(c))) return;
        if (ac.sacArtifactOrCreature && !this.bf().some(c => c.ctrl === p &&
          (c.is('Artifact') || c.is('Creature')) && this.canSacrifice(c))) return;
        if (ac.discard && p.hand.filter(c => c !== card).length < ac.discard) return;
        if (ac.discardOrLife && !p.hand.some(c => c !== card) && p.life < ac.discardOrLife) return;
      }
      // targets must exist — osim za X-spellove, gdje X (a time i legalne mete)
      // još nije izabran, pa bi provjera bila lažno negativna
      if (!cost.x) {
        const specs = this.spellTargetSpecs(card, castOpts, p);
        if (specs) {
          for (const spec of specs) {
            if (!spec.upTo && this.legalTargets(spec, card, p).length < (spec.count ?? 1)) return;
          }
        }
      }
      // CR 601.2b: modove smiješ birati samo ako za njih postoje legalne mete.
      // Bez ove provjere je bot nudio npr. "Choose two" karte sa samo jednim
      // igrivim modom, pa bi bacanje puklo tek nasred procesa.
      const md = card.def.modes;
      if (md && !castOpts.overloaded) {
        const effectivePick = modePickFor(this, p, card, castOpts);
        const need = effectivePick === 'any' ? (md.min ?? 1) : effectivePick;
        let playable = 0;
        for (const m of md.list) {
          const targets = modeTargetsFor(this, m, card, Object.assign({}, castOpts, { xVal }));
          const ok = !targets.length || targets.every(s => s.upTo ||
            this.legalTargets(s, card, p).length >= (s.count ?? 1));
          if (ok) playable += md.repeats ? need : 1;
        }
        if (playable < need) return;
      }
      out.push({ card, from, alt: alt || null });
    };
    for (const card of p.hand) {
      consider(card, 'hand');
      // Marshland Bloodcaster daje OPCIONI alternativni trošak. Normalna
      // ponuda ostaje dostupna, a druga eksplicitno kaže da se plaća životom.
      if (p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
        consider(card, 'hand', {
          free: true, bloodcaster: true, lifeCost: card.mv,
          label: `Plati ${card.mv} života umjesto mana cijene`,
        });
      }
      const d = card.def;
      if (d.adventure) consider(card, 'hand', Object.assign({ adventure: true }, d.adventure));
      if (d.roomHalves) {
        for (const half of d.roomHalves) consider(card, 'hand', { room: half });
      }
      if (d.altCosts) for (const a of d.altCosts) {
        if (a.cond && !a.cond(this, p, card)) continue;
        consider(card, 'hand', a);
      }
    }
    for (const card of p.command) {
      consider(card, 'command');
      if (p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
        consider(card, 'command', {
          free: true, bloodcaster: true, lifeCost: card.mv,
          label: `Plati ${card.mv} života umjesto mana cijene`,
        });
      }
    }
    for (const card of p.graveyard) {
      const d = card.def;
      if (d.adventure && card.meta.adventureFromGraveUntilOwnTurn !== undefined &&
        p.turnsStarted <= card.meta.adventureFromGraveUntilOwnTurn) {
        consider(card, 'graveyard', Object.assign({ adventure: true }, d.adventure));
      }
      if (d.flashback && !card.meta._fbUsed) consider(card, 'graveyard', Object.assign({ flashback: true }, d.flashback));
      if (d.jumpstart) consider(card, 'graveyard', Object.assign({ jumpstart: true }, d.jumpstart));
      if (d.retrace && p.hand.some(c => c.is('Land'))) consider(card, 'graveyard', Object.assign({ retrace: true }, d.retrace));
      if (d.escape) {
        if (p.graveyard.filter(c => c !== card).length >= (d.escape.exileN || 0))
          consider(card, 'graveyard', Object.assign({ escape: true }, d.escape));
      }
      if (card.meta.emryCastTurn === this.turnNo) consider(card, 'graveyard', { emry: true });
      // mayhem: baci iz groblja ako je odbačena ovaj potez
      if (d.mayhem && card.meta._discardedTurn === this.turnNo) {
        consider(card, 'graveyard', Object.assign({ mayhem: true, altCostStr: d.mayhem.cost }, d.mayhem));
      }
    }
    // exile zone plays (plot, Light Up the Stage, Theater, hideaway executed via effects granting)
    for (const card of p.exile) {
      if (card.meta && card.meta.plotted) consider(card, 'exile', { free: true, plotPlay: true, speed: 'sorcery' });
      if (this.hasExilePlayPermission(p, card)) {
        if (card.meta.needsOppLost && !this.players.some(q => q !== p && q.turnState.lifeLost > 0)) continue;
        consider(card, 'exile', Object.assign(
          card.meta.freePlay ? { free: true } : {},
          card.meta.anyColor ? { asThoughAnyColor: true } : {},
          card.meta.exileAfterPlay ? { exileAfter: true } : {},
          { consumeExilePermission: true }));
        if (!card.meta.freePlay && p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
          consider(card, 'exile', {
            free: true, bloodcaster: true, lifeCost: card.mv,
            consumeExilePermission: true,
            exileAfter: !!card.meta.exileAfterPlay,
            asThoughAnyColor: !!card.meta.anyColor,
            label: `Plati ${card.mv} života umjesto mana cijene`,
          });
        }
      }
    }
    // ukradene karte: leže u TUĐEM egzilu ali ih smijem igrati JA (Klaw, Extract Power…)
    for (const q of this.players) {
      if (q === p) continue;
      for (const card of q.exile) {
        const m = card.meta;
        if (!m || m.playableBy !== p || !this.hasExilePlayPermission(p, card)) continue;
        consider(card, 'exile', Object.assign(
          m.freePlay ? { free: true } : {},
          m.anyColor ? { asThoughAnyColor: true } : {},
          m.exileAfterPlay ? { exileAfter: true } : {},
          { consumeExilePermission: true }));
        if (!m.freePlay && p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
          consider(card, 'exile', {
            free: true, bloodcaster: true, lifeCost: card.mv,
            asThoughAnyColor: !!m.anyColor,
            consumeExilePermission: true,
            exileAfter: !!m.exileAfterPlay,
            label: `Plati ${card.mv} života umjesto mana cijene`,
          });
        }
      }
    }
    const top = p.library[p.library.length - 1];
    if (top && this.bf().some(source => source.ctrl === p && source.def.playTop && source.def.playTop(this, source, top, p))) {
      consider(top, 'library', { fromTop: true });
      if (p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > top.mv) {
        consider(top, 'library', {
          fromTop: true, free: true, bloodcaster: true, lifeCost: top.mv,
          label: `Plati ${top.mv} života umjesto mana cijene`,
        });
      }
    }
    return out;
  };

  G.playableLands = function (p) {
    if (p.landsPlayed >= p.maxLands) return [];
    const out = p.hand.filter(card => card.is('Land'));
    if (this.bf().some(source => source.ctrl === p && source.def.playLandsFromGraveyard)) {
      out.push(...p.graveyard.filter(card => card.is('Land')));
    }
    for (const owner of this.players) for (const card of owner.exile) {
      if (!card.is('Land') || !card.meta || card.meta.playableBy !== p || !this.hasExilePlayPermission(p, card)) continue;
      if (card.meta.spellsOnly) continue;
      if (card.meta.playableCondition && !card.meta.playableCondition(this, p, card)) continue;
      out.push(card);
    }
    const top = p.library[p.library.length - 1];
    if (top && top.is('Land') && this.bf().some(source =>
      source.ctrl === p && source.def.playTop && source.def.playTop(this, source, top, p))) out.push(top);
    return [...new Set(out)];
  };

  // ponude koje NISU iz ruke (groblje/egzil) — UI ih mora eksplicitno prikazati
  MTG.offZoneCasts = function (casts) {
    return (casts || []).filter(e => e.card.zone !== 'hand' && e.from !== 'command');
  };

  G.spellTargetSpecs = function (card, castOpts, caster = card.owner) {
    const d = card.def;
    if (castOpts && castOpts.splitHalf && d.splitHalves && d.splitHalves[castOpts.splitHalf]) {
      return d.splitHalves[castOpts.splitHalf].targets || null;
    }
    if (castOpts && castOpts.splitFuse && d.splitHalves) {
      const right = d.splitHalves[castOpts.splitFuse];
      return [...(d.targets || []), ...(right && right.targets || [])];
    }
    if (castOpts && castOpts.adventure) return d.adventure.targets || null;
    if (castOpts && castOpts.room) return castOpts.room.targets || null;
    if (castOpts && castOpts.overloaded) return null;
    if (d.subtypes && d.subtypes.includes('Aura') && d.auraTarget) return d.auraTarget;
    if (typeof d.targets === 'function') return d.targets(this, card, castOpts, caster);
    return d.targets || null;
  };

  G.applyDemonstrate = async function (p, so, card) {
    const yes = await p.controller.decide(this, {
      type: 'chooseOption', prompt: `Demonstrate: kopiraj ${card.name}? (izabrani protivnik takođe dobija kopiju)`,
      options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
      aiHint: { kind: 'demonstrate', card },
    });
    if (yes !== 'yes') return false;
    const opponent = await MTG.E.chooseOpponent(this, p, {
      prompt: `Demonstrate — who also copies ${card.name}?`, goal: 'gift',
    });
    await this.copySpell(so, p, { mayNewTargets: true });
    if (opponent) {
      this.lg(`Demonstrate: ${opponent.name} takođe kopira ${card.name}.`);
      await this.copySpell(so, opponent, { mayNewTargets: true });
    }
    return true;
  };

  // ============================================================
  // Casting
  // ============================================================
  G.castSpell = async function (p, card, opts = {}) {
    // opts: {alt, from, xVal, aiChosen...}
    if (p.turnState && p.turnState.cantCastAdditional && !opts.ignoreAdditionalCastLock) return false;
    const alt = opts.alt || null;
    const castOpts = alt ? Object.assign({}, alt) : {};
    if (opts.from !== undefined && castOpts.from === undefined) castOpts.from = opts.from;
    // Interni card-scriptovi istorijski koriste i kraći top-level oblik
    // (`{free:true, exileAfter:true}`), dok UI legalne liste nose isto pod
    // `alt`. Normalizuj oba oblika u jednu autoritativnu cast putanju.
    for (const key of ['free', 'exileAfter', 'asThoughAnyColor', 'consumeExilePermission', 'speed', 'flash', 'miracle']) {
      if (opts[key] !== undefined && castOpts[key] === undefined) castOpts[key] = opts[key];
    }
    const d = card.def;
    const cost = this.spellCost(p, card, castOpts);

    // X
    let xVal = 0;
    if (cost.x && !castOpts.free) {
      let maxX = this.maxAffordableX(p, cost, card);
      if (typeof d.xMax === 'function') maxX = Math.min(maxX, Math.max(0, Number(d.xMax(this, card, p, castOpts)) || 0));
      const legalValues = this.legalXValues(p, card, castOpts, maxX);
      if (legalValues && !legalValues.length) return false;
      const minX = legalValues ? legalValues[0] : 0;
      const maxChoice = legalValues ? legalValues[legalValues.length - 1] : maxX;
      xVal = opts.xVal !== undefined ? Number(opts.xVal) : await p.controller.decide(this, {
        type: 'chooseX', min: minX, max: maxChoice, values: legalValues || undefined,
        card, prompt: `X for ${card.name}?`,
        aiHint: { kind: 'chooseX', card },
      });
      xVal = Number(xVal);
      if (legalValues) {
        if (!legalValues.includes(xVal)) {
          this.lg(`${card.name}: X=${Number.isFinite(xVal) ? xVal : '?'} nema legalnu metu.`);
          return false;
        }
      } else xVal = Math.max(0, Math.min(Number.isFinite(xVal) ? xVal : 0, maxX));
    }
    // CR 107.3b: if an effect casts a spell without paying its mana cost, X
    // is 0. An externally supplied xVal must never bypass that rule.
    if (castOpts.free) xVal = 0;
    // X mora biti vidljiv filterima meta (npr. "target creature with mana value X")
    castOpts.xVal = xVal;

    // kicker
    let kicked = false;
    if (d.kicker && !castOpts.free) {
      const kCost = U.parseCost(d.kicker.cost);
      const combined = { generic: cost.generic + kCost.generic, x: cost.x, xReduction: cost.xReduction || 0, pips: cost.pips.concat(kCost.pips) };
      if (this.canPayMana(p, combined, { card }, { xVal })) {
        const yes = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Kicker ${d.kicker.cost} for ${card.name}?`,
          options: [{ key: 'yes', label: 'Yes (kicked)' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'kicker', card },
        });
        if (yes === 'yes') { kicked = true; castOpts._kicked = true; cost.generic += kCost.generic; cost.pips = cost.pips.concat(kCost.pips); }
      }
    }
    // squad / multikicker: plati N puta dodatnu cijenu
    let paidTimes = 0;
    const repCostStr = d.squad || d.multikicker;
    if (repCostStr && !castOpts.free) {
      const rCost = U.parseCost(repCostStr);
      let maxN = 0;
      for (let k = 1; k <= 4; k++) {
        const comb = { generic: cost.generic + rCost.generic * k, x: cost.x, xReduction: cost.xReduction || 0, pips: cost.pips.concat(Array(k).fill(rCost.pips).flat()) };
        if (this.canPayMana(p, comb, { card }, { xVal })) maxN = k; else break;
      }
      if (maxN > 0) {
        paidTimes = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: maxN, card,
          prompt: `${d.squad ? 'Squad' : 'Multikicker'} ${repCostStr} — how many times?`,
          aiHint: { kind: 'squad', card },
        });
        paidTimes = Math.max(0, Math.min(paidTimes, maxN));
        if (paidTimes > 0) {
          cost.generic += rCost.generic * paidTimes;
          for (let k = 0; k < paidTimes; k++) cost.pips = cost.pips.concat(rCost.pips);
        }
      }
    }
    // offspring (vlastiti ili od Zinnie)
    let offspring = false;
    let offspringCost = d.offspring;
    if (!offspringCost && card.is('Creature') && !castOpts.adventure) {
      for (const c of this.bf()) {
        if (c.ctrl === p && c.def.grantsOffspring) { offspringCost = c.def.grantsOffspring; break; }
      }
    }
    if (offspringCost && !castOpts.free) {
      const oCost = U.parseCost(offspringCost);
      const combined = { generic: cost.generic + oCost.generic, x: cost.x, xReduction: cost.xReduction || 0, pips: cost.pips.concat(oCost.pips) };
      if (this.canPayMana(p, combined, { card }, { xVal })) {
        const yes = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Offspring ${offspringCost} for ${card.name} (1/1 copy)?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'offspring', card },
        });
        if (yes === 'yes') { offspring = true; cost.generic += oCost.generic; cost.pips = cost.pips.concat(oCost.pips); }
      }
    }

    // modes
    let mode = null;
    if (d.modes && !(castOpts.overloaded)) {
      const pickN = modePickFor(this, p, card, Object.assign({}, castOpts, { _kicked: kicked }));
      const opts2 = d.modes.list.map((m, i) => ({ mode: m, index: i }))
        .filter(({ mode: candidateMode }) => {
          const candidateTargets = modeTargetsFor(this, candidateMode, card, Object.assign({}, castOpts, { xVal }));
          return candidateTargets.every(spec => spec.upTo ||
            this.legalTargets(spec, card, p).length >= (spec.count ?? 1));
        })
        .map(({ mode: candidateMode, index }) => Object.assign(
          { key: String(index), label: candidateMode.label }, candidateMode.aiMeta || {}));
      if (!opts2.length) return false;
      if (pickN !== 'any' && !d.modes.repeats && opts2.length < pickN) return false;
      if (pickN === 1) {
        const k = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `${card.name}: izaberi mod`, options: opts2,
          aiHint: Object.assign({ kind: 'mode', card, x: xVal }, d.modes.aiHint || {}),
        });
        mode = [parseInt(k, 10)];
      } else {
        const ks = await p.controller.decide(this, {
          type: 'chooseMulti', prompt: `${card.name}: izaberi ${pickN === 'any' ? 'bilo koji broj' : pickN} modova`,
          options: opts2, min: pickN === 'any' ? (d.modes.min ?? 1) : pickN, max: pickN === 'any' ? d.modes.list.length : pickN,
          repeats: d.modes.repeats, aiHint: Object.assign({ kind: 'modes', card, x: xVal }, d.modes.aiHint || {}),
        });
        // Modalne instrukcije se izvršavaju redoslijedom odštampanim na karti,
        // ne redoslijedom kojim je igrač kliknuo izabrane modove.
        mode = ks.map(k => parseInt(k, 10)).sort((a, b) => a - b);
      }
      // Spree modovi su dodatni troškovi, ne tekst koji se obračunava tek na
      // rezoluciji. Svaki izabrani mod povećava generički dio cijene.
      if (d.spreeCost && !castOpts.free) cost.generic += d.spreeCost * mode.length;
    }

    // build stack object early for target ctx
    const so = {
      kind: 'spell', card, ctrl: p,
      name: (castOpts.splitHalf || castOpts.splitFuse) && castOpts.name ? castOpts.name : card.name,
      targets: [], x: xVal, mode,
      castOpts, kicked, offspring, from: opts.from || card.zone, copyOf: null,
    };

    // targets
    let specs = this.spellTargetSpecs(card, castOpts, p);
    if (specs) {
      if (mode && d.modes) {
        specs = [];
        for (const mi of mode) specs = specs.concat(modeTargetsFor(this, d.modes.list[mi], card, castOpts));
      }
      so.targetSpecs = specs;
      const ctx = { g: this, src: card, you: p, so };
      const ok = await this.pickTargets(ctx, specs, card, p);
      if (!ok) { this.lg(`${card.name}: nema legalnih meta.`); return false; }
      so.targets = ctx.targets;
      so.wardTargets = ctx.wardTargets;
    } else if (mode && d.modes) {
      const specs2 = [];
      for (const mi of mode) specs2.push(...modeTargetsFor(this, d.modes.list[mi], card, castOpts));
      if (specs2.length) {
        so.targetSpecs = specs2;
        const ctx = { g: this, src: card, you: p, so };
        const ok = await this.pickTargets(ctx, specs2, card, p);
        if (!ok) { this.lg(`${card.name}: nema legalnih meta.`); return false; }
        so.targets = ctx.targets;
        so.wardTargets = ctx.wardTargets;
      }
    }

    // Some spells lock in a division or another target-dependent choice while
    // they are being cast (for example Biogenic Upgrade).  Keep that choice on
    // the stack object so responses cannot retroactively change it.
    if (typeof d.prepareTargets === 'function') {
      const prepared = await d.prepareTargets({ g: this, src: card, you: p, so, targets: so.targets });
      if (prepared === false) return false;
    }

    // Strive je dodatna cijena određena nakon izbora meta: prva meta je u
    // osnovnoj cijeni, a svaka sljedeća dodaje odštampani strive trošak.
    if (d.strive && !castOpts.free) {
      const chosenTargets = (so.targets || []).flat().filter(Boolean).length;
      const extraTargets = Math.max(0, chosenTargets - 1);
      if (extraTargets > 0) {
        const striveCost = U.parseCost(d.strive);
        cost.generic += striveCost.generic * extraTargets;
        for (let i = 0; i < extraTargets; i++) cost.pips = cost.pips.concat(striveCost.pips);
      }
      so.striveTargets = chosenTargets;
    }

    // additional costs
    const ac = castOpts.adventure ? null : d.addlCost;
    const paidAddl = { sacd: [], tapped: [], discarded: [], life: 0, blightCard: null, blightN: 0, choice: null };
    if (ac) {
      if (ac.sacCreature || ac.sacArtifactOrCreature || ac.sacAnyCreatures || ac.sacCreaturesEqualTargets) {
        const pool = this.bf().filter(c => c.ctrl === p &&
          (ac.sacCreature ? c.is('Creature') : ac.sacArtifactOrCreature ? (c.is('Artifact') || c.is('Creature')) : c.is('Creature')) &&
          (!ac.sacCreatureFilter || ac.sacCreatureFilter(this, c, p, card)) &&
          this.canSacrifice(c));
        const targetCount = ac.sacCreaturesEqualTargets
          ? (so.targets || []).flat().filter(Boolean).length
          : null;
        const min = targetCount !== null ? targetCount : (ac.sacAnyCreatures ? 0 : 1);
        const max = targetCount !== null ? targetCount : (ac.sacAnyCreatures ? pool.length : 1);
        if (pool.length < min) return false;
        const picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min, max, prompt: `${card.name}: žrtvuj (${min}-${max})`,
          aiHint: { kind: ac.aiKind || 'addlSac', card, required: min },
        });
        if (picked.length < min) return false;
        paidAddl.sacd = picked;
      }
      if (ac.tapCreaturesForExtraModes) {
        const required = Math.max(0, typeof ac.tapCreaturesForExtraModes === 'function'
          ? Number(ac.tapCreaturesForExtraModes(this, p, card, so)) || 0
          : Math.max(0, (so.mode || []).length - 1));
        const pool = this.creatures(p).filter(creature => !creature.tapped);
        if (pool.length < required) return false;
        if (required > 0) {
          const picked = await p.controller.decide(this, {
            type: 'chooseCards', from: pool, min: required, max: required,
            prompt: `${card.name}: tap ${required} untapped creature${required === 1 ? '' : 's'} for escalate`,
            aiHint: { kind: 'addlTap', card, required },
          });
          if (picked.length !== required || picked.some(creature => !pool.includes(creature))) return false;
          paidAddl.tapped = picked;
        }
      }
      if (ac.discard) {
        const pool = p.hand.filter(c => c !== card);
        const picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: ac.discard, max: ac.discard, prompt: `${card.name}: odbaci ${ac.discard}`,
          aiHint: { kind: 'addlDiscard', card },
        });
        if (picked.length < ac.discard) return false;
        paidAddl.discarded = picked;
      }
      if (ac.discardOrLife) {
        const discardPool = p.hand.filter(c => c !== card);
        const options = [];
        if (discardPool.length) options.push({ key: 'discard', label: 'Odbaci kartu' });
        if (p.life >= ac.discardOrLife) options.push({ key: 'life', label: `Plati ${ac.discardOrLife} života` });
        if (!options.length) return false;
        const choice = options.length === 1 ? options[0].key : await p.controller.decide(this, {
          type: 'chooseOption', prompt: `${card.name}: dodatna cijena`, options,
          aiHint: { kind: ac.choiceKind || 'discardOrLife', card, life: ac.discardOrLife },
        });
        paidAddl.choice = options.some(option => option.key === choice) ? choice : options[0].key;
        if (paidAddl.choice === 'discard') {
          const picked = await p.controller.decide(this, {
            type: 'chooseCards', from: discardPool, min: 1, max: 1,
            prompt: `${card.name}: odbaci kartu`, aiHint: { kind: 'addlDiscard', card },
          });
          if (!picked.length) return false;
          paidAddl.discarded.push(picked[0]);
        } else paidAddl.life += ac.discardOrLife;
      }
      if (ac.lifeX) {
        const targeted = (so.targets || []).flat().filter(Boolean).length;
        const minLife = ac.divideAmongTargets ? targeted : 0;
        const maxLife = ac.divideAmongTargets && targeted === 0 ? 0 : p.life;
        const thresholds = [...new Set(this.bf().filter(c => c.is('Creature'))
          .map(c => Math.max(0, c.toughness)).filter(n => n <= p.life))].sort((a, b) => a - b);
        const chosen = await p.controller.decide(this, {
          type: 'chooseX', min: minLife, max: maxLife, thresholds, src: card,
          prompt: `${card.name}: plati X života`,
          aiHint: { kind: ac.aiKind || 'lifeX', card, targets: (so.targets || []).flat().filter(Boolean) },
        });
        paidAddl.life = Math.max(minLife, Math.min(Number(chosen) || 0, p.life));
      }
      if (ac.optionalBlight) {
        const pool = this.creatures(p);
        if (pool.length) {
          const choice = await p.controller.decide(this, {
            type: 'chooseOption', prompt: `${card.name}: plati dodatni Blight ${ac.optionalBlight}?`,
            options: [{ key: 'yes', label: `Yes — Blight ${ac.optionalBlight}` }, { key: 'no', label: 'No' }],
            aiHint: { kind: 'burningCuriosity', card, n: ac.optionalBlight },
          });
          if (choice === 'yes') {
            const picked = await p.controller.decide(this, {
              type: 'chooseCards', from: pool, min: 1, max: 1,
              prompt: `Blight ${ac.optionalBlight}: izaberi svoje stvorenje`,
              aiHint: { kind: 'blight', n: ac.optionalBlight, source: card },
            });
            if (!picked.length) return false;
            paidAddl.blightCard = picked[0];
            paidAddl.blightN = ac.optionalBlight;
          }
        }
      }
    }
    if (ac && ac.lifeX && ac.divideAmongTargets && paidAddl.life > 0) {
      const targets = (so.targets || []).flat().filter(Boolean);
      const division = await MTG.E.divideDamage(this, p, card, targets, paidAddl.life, {
        aiKind: 'fireCovenantDamage',
      });
      if (!division) return false;
      so.damageDivision = division;
    }
    if (castOpts.jumpstart) {
      const pool = p.hand;
      if (!pool.length) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Jump-start: odbaci kartu`,
        aiHint: { kind: 'addlDiscard', card },
      });
      if (!picked.length) return false;
      paidAddl.discarded = picked;
    }
    if (castOpts.retrace) {
      const pool = p.hand.filter(c => c.is('Land'));
      if (!pool.length) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Retrace: odbaci land`,
        aiHint: { kind: 'addlDiscard', card },
      });
      if (!picked.length) return false;
      paidAddl.discarded = picked;
    }
    // delve
    let delveExiled = [];
    if (castOpts.delve) {
      const avail = p.graveyard.filter(c => c !== card);
      const maxDelve = Math.min(cost.generic, avail.length);
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: avail, min: 0, max: maxDelve, prompt: `Delve: exile from the graveyard (up to ${maxDelve})`,
        aiHint: { kind: 'delve', card },
      });
      delveExiled = picked;
      cost.generic -= picked.length;
    }
    // escape exile cost — SAMO se bira ovdje. Stvarni egzil ide tek nakon što je
    // mana plaćena (CR 601.2h: ako plaćanje ne uspije, cijelo bacanje se poništava).
    let escapeExiled = [];
    if (castOpts.escape) {
      const avail = p.graveyard.filter(c => c !== card);
      const need = castOpts.exileN || 0;
      if (avail.length < need) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: avail, min: need, max: need, prompt: `Escape: egzilaj ${need} karata`,
        aiHint: { kind: 'delve', card },
      });
      if (picked.length < need) return false;
      escapeExiled = picked;
    }

    // pay mana
    const paySpell = { card };
    if (!castOpts.free) {
      const ok = await this.payMana(p, cost, paySpell, {
        xVal, isSpell: true, excludeCards: paidAddl.tapped,
      });
      if (!ok) { this.lg(`${card.name}: mana nije plaćena.`); return false; }
      if (cost.lifeCost) await this.loseLife(p, cost.lifeCost, 'altcost');
      // consume one-shot reductions that applied
      if (p.tempReductions && p.tempReductions.length) {
        p.tempReductions = p.tempReductions.filter(r => !(r.once && r.filter(this, card)));
      }
    } else {
      await this.trackSpentOnSpell(p, 0);
    }
    if (castOpts.bloodcaster) {
      const grant = p.bloodcasterAlternative;
      if (!grant || grant.turn !== this.turnNo || p.life <= card.mv) return false;
      await this.loseLife(p, card.mv, 'Marshland Bloodcaster');
      p.bloodcasterAlternative = null;
    }
    so.treasureUsed = !!paySpell.treasureUsed;
    so.artifactManaSpent = paySpell.artifactManaSpent || 0;
    so.foundrySource = paySpell.foundrySource || null;
    so.convokedCards = (paySpell.convokedCards || []).slice();
    so.phyrexianLifePaid = paySpell.phyrexianLifePaid || 0;
    so.manaSpent = paySpell.manaSpent || 0;
    so.grantedSunburstColors = 0;
    if (p.sunburstGrant && p.sunburstGrant.turn === this.turnNo) {
      if (card.is('Artifact')) so.grantedSunburstColors = (card.meta._payColors || []).length;
      p.sunburstGrant = null;
    }

    // pay additional
    so.sacdN = paidAddl.sacd.length;
    so.sacdSnaps = paidAddl.sacd.map(c => this.snapshot(c));
    so.additionalTapped = paidAddl.tapped.slice();
    so.discardedCards = paidAddl.discarded.slice();
    if (paidAddl.sacd.length) await this.sacrificeMany(p, paidAddl.sacd);
    for (const c of paidAddl.tapped) if (c.zone === 'battlefield' && c.ctrl === p && !c.tapped) this.tap(c);
    for (const c of paidAddl.discarded) await this.discard(p, [c]);
    if (paidAddl.life) await this.loseLife(p, paidAddl.life, card.name);
    if (paidAddl.blightCard) await this.addM1(paidAddl.blightCard, paidAddl.blightN, p);
    so.additionalLifePaid = paidAddl.life;
    so.additionalBlightPaid = paidAddl.blightN;
    so.additionalCostChoice = paidAddl.choice;
    for (const c of delveExiled) await this.move(c, 'exile');
    for (const c of escapeExiled) await this.move(c, 'exile');

    // move card to stack
    this.remove(card);
    const fromZone = card.zone;
    if (castOpts.consumeExilePermission && card.meta) {
      for (const key of ['playableBy', 'playableUntil', 'playableUntilOwnTurn', 'freePlay', 'anyColor', 'exileAfterPlay', 'spellsOnly']) {
        delete card.meta[key];
      }
    }
    card.faceDown = false;
    if (card.meta) delete card.meta.revealedTo;
    card.zone = 'stack';
    card.castMeta = {
      x: xVal, alt: castOpts, from: so.from, kicked, offspring,
      manaSpent: so.manaSpent,
      castPhase: this.phase,
      artifactManaSpent: so.artifactManaSpent,
      grantedSunburstColors: so.grantedSunburstColors,
      phyrexianLifePaid: so.phyrexianLifePaid,
    };
    if (paidTimes) { card.meta.paidTimes = paidTimes; so.squadN = paidTimes; }
    if (card.commander && so.from === 'command') card.cmdCasts = (card.cmdCasts || 0) + 1;
    if (card.meta && card.meta.preparedBy) {
      const preparer = this.byIid(card.meta.preparedBy);
      if (preparer) {
        preparer.meta.prepared = false;
        delete preparer.meta.preparedCopy;
      }
      delete card.meta.playableUntil;
      delete card.meta.playableBy;
    }

    this.stack.push(so);
    if (this.diplomacyRecordRemovalAttempt) this.diplomacyRecordRemovalAttempt(p, card, so.targets);
    this.note('stack', {});
    this.lg(`${U.playerVerb(p, 'cast', 'casts')} ${card.name}${xVal ? ` (X=${xVal})` : ''}${castOpts.free ? ' (free)' : ''}${so.from === 'command' ? ' from the command zone' : ''}.`, 'cast');
    await this.pace(p.isAI ? 1000 : 150);

    if (fromZone === 'graveyard') await this.emit('cardLeftGraveyard', { card, to: 'stack' });

    // cast tracking + triggers
    p.turnState.spellsCast++;
    if (p.tempFlashFilters) {
      const used = p.tempFlashFilters.find(grant => grant.turn === this.turnNo && grant.filter(this, card, p));
      if (used && used.once) p.tempFlashFilters.splice(p.tempFlashFilters.indexOf(used), 1);
    }
    // Alternativni trošak inače ne mijenja mana value. Split polovina je
    // izuzetak jer na stacku ima mana cost izabrane polovine; fused spell ima
    // zbir obje polovine (ovdje zapisan u split altCostStr).
    const stackMV = (castOpts.splitHalf || castOpts.splitFuse) && castOpts.altCostStr !== undefined
      ? U.mv(castOpts.altCostStr || '', xVal)
      : U.mv(d.cost || '', xVal);
    p.turnState.spellsCastList.push({ name: so.name, mv: stackMV, card, so });
    const castData = {
      player: p, card, so, mv: stackMV,
      isInstantSorcery: card.is('Instant') || card.is('Sorcery') || !!castOpts.adventure && d.adventure.types === 'Instant',
      isCreature: card.is('Creature') && !castOpts.adventure,
      fromHand: so.from === 'hand', nthThisTurn: p.turnState.spellsCast,
    };
    if (!castData.isCreature) p.turnState.nonCreatureSpells++;
    castData.nthNonCreature = p.turnState.nonCreatureSpells;
    // crime (Outlaws): ciljao si protivnika ili njegove permanente
    {
      const vics = new Set();
      for (const t of (so.targets || []).flat()) {
        if (!t) continue;
        if (t instanceof MTG.Player) { if (t !== p) vics.add(t); }
        else if (t.ctrl && t.ctrl !== p && t.zone) vics.add(t.ctrl);
      }
      if (vics.size) await this.emit('crime', { player: p, victims: [...vics] });
    }
    // PRIJETNJA: bot je uperio spell u mene → pauza + prikaz karte
    if (p.isAI) {
      const mine = this.humanTargets(so.targets);
      if (mine.length) {
        const kind = MTG.threatKind(d, so.targets);
        const names = MTG.threatTargetNames(mine, this.human());
        this.lg(`${kind.icon} ${U.playerVerb(p, 'target', 'targets')} ${names.join(', ')} with ${card.name} (${kind.label})`, 'spot');
        await this.alertHuman({
          card, by: p, targets: mine, allTargets: (so.targets || []).flat().filter(Boolean),
          stackObject: so, kind, names, source: 'spell', ms: 1600,
        });
      }
    }
    // storm
    let hasStorm = (d.storm && !castOpts.free);
    if (p.stormNext && castData.isInstantSorcery) { hasStorm = true; p.stormNext = false; }
    if (hasStorm) {
      const stormN = this.totalSpellsThisTurn() - 1;
      if (stormN > 0) {
        this.lg(`Storm ×${stormN}!`, 'cast');
        for (let i = 0; i < stormN; i++) await this.copySpell(so, p, { mayNewTargets: false });
      }
    }
    // "Copy this spell for each creature sacrificed this way" (Plumb the Forbidden)
    if (d.copyPerSacrifice && so.sacdN) {
      this.lg(`${card.name}: copy ×${so.sacdN}.`, 'cast');
      for (let i = 0; i < so.sacdN; i++) await this.copySpell(so, p, { mayNewTargets: false });
    }
    // gravestorm (Follow the Bodies)
    if (d.gravestorm && !castOpts.free) {
      const gn = this.diedThisTurn.length;
      if (gn > 0) {
        this.lg(`Gravestorm ×${gn}!`, 'cast');
        for (let i = 0; i < gn; i++) await this.copySpell(so, p, { mayNewTargets: false });
      }
    }
    // Demonstrate je stvarni cast trigger: ide na stack i kopira original tek
    // kada se rezolvira, pa protivnici mogu odgovoriti prije nastanka kopija.
    if (d.demonstrate && !castOpts.free && !so.isCopy) {
      this.queueTrigger({
        src: card, ctrl: p, name: 'Demonstrate', data: { so },
        run: async triggerCtx => {
          const original = triggerCtx.data.so;
          if (triggerCtx.g.stack.includes(original)) {
            await triggerCtx.g.applyDemonstrate(triggerCtx.you, original, original.card);
          }
        },
      });
    }
    // cascade (own keyword, granted next-spell effects, battlefield grants like Wildsear/Rain of Riches)
    let cascades = 0;
    if (d.cascade && !castOpts.free) cascades++;
    if (p.nextCascade && p.nextCascade.length) {
      const idx = p.nextCascade.findIndex(f => f(this, card, castData));
      if (idx >= 0) { cascades++; p.nextCascade.splice(idx, 1); }
    }
    if (!castOpts.free) {
      for (const c of this.bf()) {
        if (c.def.grantsCascade && c.ctrl === p && c.def.grantsCascade(this, c, card, castData, so)) cascades++;
      }
    }
    for (let i = 0; i < cascades; i++) await this.doCascade(p, card);

    await this.emit('cast', castData);
    if (castData.isInstantSorcery) await this.emit('castIS', castData);
    if (!castData.isInstantSorcery || castOpts.adventure) { }
    if (!card.is('Creature') || castOpts.adventure) await this.emit('castNonCreature', castData);
    if (castData.isCreature) await this.emit('castCreature', castData);
    if (castData.nthThisTurn === 1) await this.emit('castFirst', castData);
    if (castData.nthThisTurn === 2) await this.emit('castSecond', castData);

    this.queueWardTriggers(so, { wardTargets: so.wardTargets || [] });
    await this.flushTriggers();
    await this.priorityRound(p);
    return true;
  };

  G.totalSpellsThisTurn = function () {
    let n = 0; for (const p of this.players) n += p.turnState.spellsCast; return n;
  };
  G.othersSpellsThisTurn = function (p) {
    let n = 0; for (const q of this.players) if (q !== p) n += q.turnState.spellsCast; return n;
  };

  G.legalXValues = function (p, card, castOpts, maxX) {
    if (!card || typeof card.def.xValues !== 'function') return null;
    const raw = card.def.xValues(this, card, p, castOpts) || [];
    return [...new Set(raw.map(Number)
      .filter(value => Number.isInteger(value) && value >= 0 && value <= maxX))]
      .sort((a, b) => a - b);
  };

  G.maxAffordableX = function (p, cost, card, opts = {}) {
    if (!cost || !(cost.x > 0)) return 0;
    const canPay = x => this.canPayMana(p, cost, { card }, Object.assign({}, opts, { xVal: x }));
    if (!canPay(0)) return 0;

    // Affordability is monotonic in X. Exponential search removes the old,
    // rules-incorrect X≤20 ceiling, then binary search finds the exact maximum
    // without linearly probing every possible value.
    let low = 0;
    let high = 1;
    while (high < Number.MAX_SAFE_INTEGER && canPay(high)) {
      low = high;
      high = Math.min(Number.MAX_SAFE_INTEGER, high * 2);
    }
    if (high === Number.MAX_SAFE_INTEGER && canPay(high)) return high;
    while (low + 1 < high) {
      const mid = low + Math.floor((high - low) / 2);
      if (canPay(mid)) low = mid;
      else high = mid;
    }
    return low;
  };

  G.doCascade = async function (p, fromCard) {
    const mv = U.mv(fromCard.def.cost || '');
    const exiled = [];
    let hit = null;
    while (p.library.length) {
      const c = p.library.pop();
      c.zone = 'exile-temp'; exiled.push(c);
      if (!c.is('Land') && U.mv(c.def.cost || '') < mv) { hit = c; break; }
    }
    this.lg(`Cascade (${fromCard.name}): otkriva ${exiled.length} karata${hit ? `, pogodak: ${hit.name}` : ''}.`);
    if (hit) {
      const yes = await p.controller.decide(this, {
        type: 'chooseOption', prompt: `Cascade: cast ${hit.name} for free?`,
        options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
        aiHint: { kind: 'freeCast', card: hit },
      });
      if (yes === 'yes') {
        hit.zone = 'hand-temp';
        p.hand.push(hit); hit.zone = 'hand';
        exiled.splice(exiled.indexOf(hit), 1);
        await this.castSpell(p, hit, { alt: { free: true }, from: 'hand' });
      }
    }
    // rest to bottom random
    U.shuffle(exiled, this.rnd);
    for (const c of exiled) { c.zone = 'library'; p.library.unshift(c); }
  };

  G.copySpell = async function (so, ctrl, opts = {}) {
    const copyRoot = so.copyRoot || so.copyOf || so;
    copyRoot._copySerial = (copyRoot._copySerial || 0) + 1;
    const copy = {
      kind: 'spell', card: so.card, ctrl, name: so.name + ' (kopija)', targets: so.targets.slice(),
      x: so.x, mode: so.mode, castOpts: so.castOpts, kicked: so.kicked, copyOf: so, isCopy: true,
      copyRoot, copyIndex: copyRoot._copySerial, copySource: opts.copySource || null,
      targetMode: opts.forceTarget ? 'forced' : 'same',
      targetSpecs: so.targetSpecs || null,
      counterDistribution: so.counterDistribution ? so.counterDistribution.map(entry => Object.assign({}, entry)) : null,
      damageDivision: so.damageDivision ? so.damageDivision.map(entry => Object.assign({}, entry)) : null,
    };
    // forceTarget: kopija ide na tačno određenu metu (Mirrorwing Dragon)
    if (opts.forceTarget) {
      copy.targets = so.targets.map(t => (Array.isArray(t) ? [opts.forceTarget] : opts.forceTarget));
      opts = Object.assign({}, opts, { mayNewTargets: false });
    }
    let wardTargets = (copy.targets || []).flat().filter(target =>
      target instanceof MTG.CardInst && target.ctrl !== ctrl && target.cur && target.cur.wardCost)
      .map(target => ({ target, ward: Object.assign({}, target.cur.wardCost) }));
    let targetsWereRepicked = false;
    // new targets?
    if (opts.mayNewTargets && so.targets.length) {
      const specs = so.targetSpecs || this.spellTargetSpecs(so.card, so.castOpts || {}, ctrl);
      if (specs) {
        const redo = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Kopija ${so.name}: nove mete?`,
          options: [{ key: 'no', label: 'Iste mete' }, { key: 'yes', label: 'Nove mete' }],
          aiHint: { kind: 'newTargets', so },
        });
        if (redo === 'yes') {
          // Kopija zadržava broj targeta iz originalnog spella. "May choose new
          // targets" ne dopušta ponovni izbor koliko meta spell ima.
          const copyTargetSpecs = specs.map((spec, index) => {
            const current = so.targets[index];
            const count = Array.isArray(current) ? current.filter(Boolean).length : (current ? 1 : 0);
            return Object.assign({}, spec, { count, min: count, upTo: false });
          });
          const ctx = { g: this, src: so.card, you: ctrl, so: copy };
          const ok = await this.pickTargets(ctx, copyTargetSpecs, so.card, ctrl);
          if (ok) {
            copy.targets = ctx.targets;
            copy.wardTargets = ctx.wardTargets;
            copy.targetMode = 'new';
            copy.retargeted = true;
            wardTargets = ctx.wardTargets;
            targetsWereRepicked = true;
          }
        }
      }
    }
    if (copy.counterDistribution) {
      const amounts = copy.counterDistribution.map(entry => entry.n);
      copy.counterDistribution = (copy.targets || []).flat().filter(Boolean)
        .slice(0, amounts.length).map((target, index) => ({ iid: target.iid, n: amounts[index] }));
    }
    if (copy.damageDivision) {
      const amounts = copy.damageDivision.map(entry => entry.n);
      const damageTargets = Array.isArray(copy.targets[0]) ? copy.targets[0] : (copy.targets || []).flat().filter(Boolean);
      copy.damageDivision = damageTargets.slice(0, amounts.length).map((target, index) => ({
        iid: target.iid,
        playerIdx: target instanceof MTG.Player ? target.idx : null,
        n: amounts[index],
      }));
    }
    // Zadržana ili forceTarget meta postaje metom nove spell-kopije jednako kao
    // i ručno retargetovana meta. pickTargets je event već emitovao samo kada je
    // retargetovanje stvarno uspjelo.
    if (!targetsWereRepicked) {
      const seen = new Set();
      const isInstantSorcery = so.card.is('Instant') || so.card.is('Sorcery') ||
        !!(so.castOpts && so.castOpts.adventure &&
          /Instant|Sorcery/.test(so.castOpts.types || so.card.def.adventure && so.card.def.adventure.types || ''));
      for (const target of (copy.targets || []).flat().filter(Boolean)) {
        if (!(target instanceof MTG.CardInst) || seen.has(target.iid)) continue;
        seen.add(target.iid);
        await this.emit('targeted', {
          card: target, byPlayer: ctrl, src: so.card, isSpell: true, isInstantSorcery, so: copy,
        });
      }
    }
    this.stack.push(copy);
    this.queueWardTriggers(copy, { wardTargets });
    this.note('stack', {});
    const targetCount = (copy.targets || []).flat().filter(Boolean).length;
    const sourceText = copy.copySource ? ` via ${copy.copySource.name}` : '';
    const targetText = copy.targetMode === 'new' ? ' with new targets' : copy.targetMode === 'forced' ? ' with a forced target' : ' with the same targets';
    this.notifyEffect(
      `📋 ${ctrl.name} creates copy #${copy.copyIndex} of ${so.card && so.card.name || so.name}${sourceText}${targetCount ? targetText : ''}.`,
      { kind: 'spellCopy', spell: copy, original: copyRoot, player: ctrl, targets: (copy.targets || []).flat().filter(Boolean) },
    );
    const copiedIS = so.card.is('Instant') || so.card.is('Sorcery') ||
      !!(so.castOpts && so.castOpts.adventure &&
        /Instant|Sorcery/.test(so.castOpts.types || so.card.def.adventure && so.card.def.adventure.types || ''));
    await this.emit('spellCopied', { so: copy, ctrl, isInstantSorcery: copiedIS });
    return copy;
  };

  G.copyStackAbility = async function (so, ctrl, opts = {}) {
    if (!so || (so.kind !== 'trigger' && so.kind !== 'ability')) return null;
    const copyCtx = Object.assign({}, so.ctx, {
      targets: (so.ctx.targets || []).slice(), you: ctrl,
      counterDistribution: so.ctx.counterDistribution
        ? so.ctx.counterDistribution.map(entry => Object.assign({}, entry)) : null,
      damageDivision: so.ctx.damageDivision
        ? so.ctx.damageDivision.map(entry => Object.assign({}, entry)) : null,
    });
    const copy = {
      kind: so.kind, name: `${so.name} (kopija)`, ctrl, ctx: copyCtx, run: so.run,
      targets: copyCtx.targets, srcCard: so.srcCard, targetSpecs: so.targetSpecs || null,
      damageDivision: copyCtx.damageDivision,
    };
    let wardTargets = (copy.targets || []).flat().filter(target =>
      target instanceof MTG.CardInst && target.ctrl !== ctrl && target.cur && target.cur.wardCost)
      .map(target => ({ target, ward: Object.assign({}, target.cur.wardCost) }));
    if (opts.mayNewTargets && copy.targetSpecs && copy.targets.length) {
      const choice = await ctrl.controller.decide(this, {
        type: 'chooseOption', prompt: `Kopija ${so.name}: nove mete?`,
        options: [{ key: 'no', label: 'Iste mete' }, { key: 'yes', label: 'Nove mete' }],
        aiHint: { kind: 'newTargets', so },
      });
      if (choice === 'yes') {
        const ok = await this.pickTargets(copyCtx, copy.targetSpecs, so.srcCard, ctrl);
        if (ok) { copy.targets = copyCtx.targets; wardTargets = copyCtx.wardTargets; }
      }
    }
    if (copyCtx.damageDivision) {
      const amounts = copyCtx.damageDivision.map(entry => entry.n);
      const damageTargets = Array.isArray(copy.targets[0])
        ? copy.targets[0] : (copy.targets || []).flat().filter(Boolean);
      copyCtx.damageDivision = damageTargets.slice(0, amounts.length).map((target, index) => ({
        iid: target.iid,
        playerIdx: target instanceof MTG.Player ? target.idx : null,
        n: amounts[index],
      }));
      copy.damageDivision = copyCtx.damageDivision;
    }
    if (copyCtx.counterDistribution) {
      const amounts = copyCtx.counterDistribution.map(entry => entry.n);
      copyCtx.counterDistribution = (copy.targets || []).flat().filter(Boolean)
        .slice(0, amounts.length).map((target, index) => ({ iid: target.iid, n: amounts[index] }));
    }
    this.stack.push(copy);
    this.queueWardTriggers(copy, { wardTargets });
    this.note('stack', {});
    this.notifyEffect(`📋 ${ctrl.name} kopira ${so.kind === 'trigger' ? 'trigger' : 'sposobnost'} ${so.name}.`, {
      kind: 'abilityCopy', ability: copy, player: ctrl,
    });
    return copy;
  };

  // ============================================================
  // Resolution
  // ============================================================
  G.resolveTop = async function () {
    const so = this.stack.pop();
    if (!so) return;
    this.note('stack', {});
    if (so.kind === 'trigger') {
      this.lg(`Rezolvira se: ${so.name}.`, 'resolve');
      await this.pace(so.ctrl && so.ctrl.isAI ? 620 : 150);
      // re-check targets
      const checked = this.revalidateTargets(so.ctx.targets || [], so.targetSpecs, so.srcCard, so.ctrl);
      so.ctx.targets = checked.targets;
      so.targets = checked.targets;
      if (checked.anyChosen && !checked.anyLegal) {
        this.lg(`${so.name}: sve mete nelegalne — fizzle.`);
        return;
      }
      if (so.run) await so.run(so.ctx);
      await this.checkSBA();
      await this.flushTriggers();
      return;
    }
    if (so.kind === 'ability') {
      this.lg(`Rezolvira se: ${so.name}.`, 'resolve');
      await this.pace(so.ctrl && so.ctrl.isAI ? 620 : 150);
      const checked = this.revalidateTargets(so.targets || [], so.targetSpecs, so.srcCard, so.ctrl);
      so.targets = checked.targets;
      if (so.ctx) so.ctx.targets = checked.targets;
      if (checked.anyChosen && !checked.anyLegal) {
        this.lg(`${so.name}: mete nelegalne — fizzle.`);
        return;
      }
      if (so.run) await so.run(so.ctx);
      await this.checkSBA();
      await this.flushTriggers();
      return;
    }
    // spell
    const card = so.card, p = so.ctrl, d = card.def;
    if (so.countered) {
      if (!so.isCopy) await this.move(card, 'graveyard');
      return;
    }
    const checked = this.revalidateTargets(so.targets || [], so.targetSpecs, card, p);
    so.targets = checked.targets;
    if (checked.anyChosen && !checked.anyLegal) {
      this.lg(`${card.name}: sve mete nelegalne — spell fizzla.`, 'resolve');
      if (!so.isCopy) await this.move(card, 'graveyard');
      return;
    }
    this.lg(`Rezolvira se: ${so.name}.`, 'resolve');
    await this.pace(p.isAI ? 750 : 200);
    const ctx = {
      g: this, src: card, you: p, targets: so.targets, x: so.x, mode: so.mode, so,
      kicked: so.kicked,
    };
    const co = so.castOpts || {};
    if (co.splitHalf && d.splitHalves && d.splitHalves[co.splitHalf]) {
      await d.splitHalves[co.splitHalf].resolve(ctx);
      if (!so.isCopy && card.zone === 'stack') await this.move(card, 'graveyard');
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    if (co.splitFuse && d.splitHalves && d.splitHalves[co.splitFuse]) {
      const leftCount = (d.targets || []).length;
      await d.resolve(Object.assign({}, ctx, { targets: ctx.targets.slice(0, leftCount) }));
      await d.splitHalves[co.splitFuse].resolve(Object.assign({}, ctx, { targets: ctx.targets.slice(leftCount) }));
      if (!so.isCopy && card.zone === 'stack') await this.move(card, 'graveyard');
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    if (co.adventure) {
      // resolve adventure half then exile with permission to cast later
      await d.adventure.resolve(ctx);
      if (!so.isCopy) {
        await this.move(card, 'exile');
        card.meta = card.meta || {}; card.meta.adventureExiled = true;
      }
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    if (co.room) {
      // permanent enters with chosen door unlocked
      if (!so.isCopy) {
        card.meta = {}; // reset
        await this.move(card, 'battlefield', { ctrl: p });
        card.meta.unlocked = [co.room.key];
        await this.emit('unlockDoor', { card, key: co.room.key, ctrl: p });
      }
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    if (card.is('Instant') || card.is('Sorcery')) {
      if (co.flashback && co.isAftermath && d.aftermathResolve) await d.aftermathResolve(ctx);
      else if (d.resolve) await d.resolve(ctx);
      else if (d.imported && !p.isAI) {
        // neskriptovan spell iz importovanog decka — igrač ga rješava ručno
        this.lg(`⚒️ ${card.name}: efekat rješavaš ručno (sudija-panel).`);
        await p.controller.decide(this, { type: 'manualResolve', card, player: p });
      } else if (d.imported) {
        this.lg(`⚠️ ${card.name}: bez automatike (AI preskače efekat).`);
      }
      if (!so.isCopy) {
        if (card.isCopySpell) {
          card.zone = 'ceased';
        } else if (card.zone === 'stack') {
          if (d.rebound && so.from === 'hand' && !co.flashback && !co.mayhem && !co.free) {
            // rebound: egzil + sljedeći upkeep besplatno
            await this.move(card, 'exile');
            this.lg(`${card.name}: rebound — vraća se sljedećeg upkeepa.`);
            const owner = p;
            this.delayed.push({
              on: 'upkeep', name: `Rebound: ${card.name}`, ctrl: owner,
              filter: (g2, dd) => dd.player === owner,
              run: async c2 => {
                if (card.zone !== 'exile') return;
                const yes = await owner.controller.decide(c2.g, {
                  type: 'chooseOption', prompt: `Rebound: cast ${card.name} for free?`,
                  options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
                  aiHint: { kind: 'freeCast' },
                });
                if (yes !== 'yes') return;
                owner.exile.splice(owner.exile.indexOf(card), 1);
                card.zone = 'nowhere';
                const ok = await c2.g.castSpell(owner, card, { free: true, from: 'exile' });
                if (!ok) { card.zone = 'exile'; owner.exile.push(card); }
              },
            });
          } else if (co.flashback || co.jumpstart || co.exileAfter || d.exileOnResolve || co.escape && d.escapeExiles || co.mayhem && d.mayhemExiles) {
            await this.move(card, 'exile');
          } else if (so.foundrySource) {
            const source = this.byIid(so.foundrySource);
            const store = await p.controller.decide(this, {
              type: 'chooseOption', prompt: `Forger's Foundry: egzilaj ${card.name} umjesto groblja?`,
              options: [{ key: 'yes', label: 'Yes, store it in the Foundry' }, { key: 'no', label: 'No, put it in the graveyard' }],
              aiHint: { kind: 'freeCast', card },
            });
            if (store === 'yes') {
              await this.move(card, 'exile');
              card.meta.foundrySource = so.foundrySource;
              if (source) {
                source.meta.foundryCards = source.meta.foundryCards || [];
                if (!source.meta.foundryCards.includes(card.iid)) source.meta.foundryCards.push(card.iid);
              }
              this.lg(`Forger's Foundry pohranjuje ${card.name}.`);
            } else await this.move(card, 'graveyard');
          } else {
            await this.move(card, 'graveyard');
          }
        }
      }
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    // permanent spell
    if (so.isCopy) {
      // becomes token copy
      await this.copyPermanentToken(card, p, {});
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    const enterOpts = { ctrl: p };
    if (d.subtypes && d.subtypes.includes('Aura')) {
      const host = so.targets[0];
      // The resolved target is authoritative. Requiring every individual
      // Enchant player definition to repeat an isPlayerAura marker made a
      // legal player target fall through to the CardInst-only branch and put
      // the Aura into the graveyard. Establish the enchanted player as part
      // of the zone move so ETB/static processing sees the correct host.
      if (host instanceof MTG.Player) {
        await this.move(card, 'battlefield', Object.assign({}, enterOpts, { cursedPlayer: host }));
        this.lg(`${card.name} prati igrača ${host.name}.`);
        await this.checkSBA(); await this.flushTriggers();
        return;
      }
      if (!host || !(host instanceof MTG.CardInst) || host.zone !== 'battlefield') {
        this.lg(`${card.name}: meta aure nestala — ide u groblje.`);
        await this.move(card, 'graveyard');
        await this.checkSBA(); await this.flushTriggers();
        return;
      }
      await this.move(card, 'battlefield', enterOpts);
      await this.attach(card, host);
      await this.checkSBA(); await this.flushTriggers();
      return;
    }
    await this.move(card, 'battlefield', enterOpts);
    if (so.offspring && d.offspringToken !== false) {
      await this.copyPermanentToken(card, p, { modPT: [1, 1] });
    }
    if (co.escape && d.escapeCounters) this.addCounters(card, '+1/+1', d.escapeCounters);
    if (co.blitz) { card.meta.blitzed = true; card.meta.tempHaste = true; this.recalc(); }
    if (co.dash) { card.meta.tempHaste = true; this.recalc(); }
    if (co.evoke && card.zone === 'battlefield') {
      await this.flushTriggers();
      if (card.zone === 'battlefield') await this.sacrifice(p, card);
    }
    await this.checkSBA(); await this.flushTriggers();
  };

  G.targetStillOk = function (target, spec, src, ctrl) {
    if (!target) return false;
    // Sa sačuvanim target-specom ponavljamo kompletnu legality provjeru na
    // rezoluciji: zona/filter, protection, shroud i protivnički hexproof.
    if (spec) return this.legalTargets(spec, src, ctrl).includes(target);
    // Legacy stack objekti bez speca ipak moraju izgubiti metu koja je napustila
    // odgovarajuću zonu ili phased out.
    if (target instanceof MTG.Player) return !target.lost;
    if (target && target.kind === 'spell') return this.stack.includes(target);
    if (target instanceof MTG.CardInst) {
      return (target.zone !== 'battlefield' || !target.phasedOut) &&
        (target.zone === 'battlefield' || target.zone === 'graveyard' ||
          target.zone === 'stack' || target.zone === 'hand');
    }
    return false;
  };

  G.revalidateTargets = function (targets, specs, src, ctrl) {
    let chosen = 0;
    let legal = 0;
    const checked = (targets || []).map((target, index) => {
      const spec = specs && specs[index] || null;
      if (Array.isArray(target)) {
        return target.filter(item => {
          chosen++;
          if (!this.targetStillOk(item, spec, src, ctrl)) return false;
          legal++;
          return true;
        });
      }
      if (target === null || target === undefined) return target;
      chosen++;
      if (this.targetStillOk(target, spec, src, ctrl)) {
        legal++;
        return target;
      }
      return null;
    });
    return { targets: checked, anyChosen: chosen > 0, anyLegal: legal > 0 };
  };

  G.targetsStillOk = function (targets, specs, src, ctrl) {
    const checked = this.revalidateTargets(targets, specs, src, ctrl);
    return !checked.anyChosen || checked.anyLegal;
  };

  // ============================================================
  // Activated abilities
  // ============================================================
  G.activatableList = function (p, instantOnly) {
    const out = [];
    for (const c of this.bf()) {
      if (c.ctrl !== p) continue;
      if (c.cur && c.cur.abilitiesDisabled) continue;
      if (c.faceDown && c.meta && c.meta.faceDownDef &&
        (c.meta.faceDownDef.types || []).includes('Creature')) {
        for (const faceUp of this.faceUpCosts(c)) {
          if (!this.canPayMana(p, U.parseCost(faceUp.cost), { card: c, isAbility: true })) continue;
          out.push({
            card: c, turnFaceUp: true, faceUpCost: faceUp.cost, faceUpDef: c.meta.faceDownDef,
            label: `Okreni licem gore: ${c.meta.faceDownDef.name} (${faceUp.kind}: ${faceUp.cost})`,
          });
        }
      }
      if (c.cur && c.cur.activationDisabled) continue;
      // NE preskačemo karte bez `abilities` — equip i crew blokovi ispod
      // vrijede i za Equipmente/Vehicle koji nemaju nijednu aktiviranu sposobnost.
      const abs = (c.def.abilities || []).concat(c.cur.extraAbilities || []);
      if (c.meta._gunslinger === this.turnNo && c.is('Creature')) {
        abs.push({
          label: 'Tap: nanesi štetu jednaku snazi stvorenju', cost: { tap: true },
          targets: [{
            what: 'creature', prompt: 'Stvorenje kojem nanosi štetu',
            filter: (g, target) => target.zone === 'battlefield' && target.is('Creature'),
            aiHint: { goal: 'removal' },
          }],
          run: async ctx => { if (ctx.targets[0]) await ctx.g.damageCreature(ctx.src, ctx.targets[0], ctx.src.power); },
          aiScore: (g, src) => g.creatures().some(x => x.ctrl !== src.ctrl && x.toughness <= src.power) ? 5 : 0.2,
        });
      }
      abs.forEach((a, ai) => {
        if (a.manaAbilityOnly) return;
        if (a.sorcery && (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2'))) return;
        if (a.cond && !a.cond(this, c, p)) return;
        if (a.oncePerTurn && c.meta['_ab_' + ai] === this.turnNo) return;
        // loyalty se troši jednom po potezu — iskorišteni planeswalker se ne nudi ponovo
        if (a.loyalty !== undefined && c.meta._loyUsed === this.turnNo) return;
        // Minus sposobnost se ne smije nuditi ako planeswalker nema dovoljno
        // loyalty countera da plati trošak (CR 606.5a).
        if (a.loyalty < 0 && (c.counters.loyalty || 0) < -a.loyalty) return;
        const cost = a.cost || {};
        if (cost.tap && (c.tapped)) return;
        if (cost.tap && c.is('Creature') && c.sick && !c.kw('haste')) return;
        if (cost.tapHost) {
          const host = c.attachedTo ? this.byIid(c.attachedTo) : null;
          if (!host || host.tapped) return;
        }
        if (cost.tapArtifacts && this.bf().filter(x => x.ctrl === p && x.is('Artifact') && !x.tapped && x !== c).length < cost.tapArtifacts) return;
        if (cost.mana && !this.canPayMana(p,
          this.abilityManaCost(p, c, typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana),
          null, { excludeCards: cost.tap ? [c] : [], artifactAbilityAlreadyUsed: c.is('Artifact') })) return;
        if (cost.manaFromTarget && a.targets) {
          const possible = this.legalTargets(a.targets[0], c, p).some(target =>
            this.canPayMana(p, this.abilityManaCost(p, c, { generic: target.mv, x: 0, pips: [] }),
              null, { excludeCards: cost.tap ? [c] : [], artifactAbilityAlreadyUsed: c.is('Artifact') }));
          if (!possible) return;
        }
        if (cost.sacSelf && !this.canSacrifice(c)) return;
        if (cost.exileSelf && c.zone !== 'battlefield') return;
        // sacN: cijena može tražiti VIŠE žrtava (Olivia: "Sacrifice two
        // Treasures"). Sa jednim dostupnim permanentom ability ne smije ni
        // biti ponuđen — inače igrač upadne u chooseCards prozor bez izlaza.
        const sacNeed = cost.sacN === 'X' ? 1 : (cost.sacN || 1);
        if (cost.sacCreature && this.creatures(p).filter(x => (!cost.sacOther || x !== c) && this.canSacrifice(x)).length < sacNeed) return;
        if (cost.sac && this.bf().filter(x => x.ctrl === p && cost.sac(this, x, c) && this.canSacrifice(x)).length < sacNeed) return;
        if (cost.life && p.life <= cost.life) return;
        if (cost.discard && p.hand.length < cost.discard) return;
        if (cost.exileFromGY) {
          const exileN = typeof cost.exileFromGY === 'object' ? (cost.exileFromGY.n || 1) : cost.exileFromGY;
          const exileFilter = typeof cost.exileFromGY === 'object' ? cost.exileFromGY.filter : null;
          if (p.graveyard.filter(card => !exileFilter || exileFilter(this, card, c, p)).length < exileN) return;
        }
        if (cost.rmCounter) {
          const kind = cost.rmCounter.kind || cost.rmCounter;
          const nn = cost.rmCounter.n || 1;
          if ((c.counters[kind] || 0) < nn) return;
        }
        if (cost.removeCountersFromOthers) {
          const allowed = this.bf().filter(x => x.ctrl === p && x !== c &&
            (x.is('Artifact') || x.is('Creature') || x.is('Planeswalker')));
          const total = allowed.reduce((sum, x) => sum + Object.values(x.counters)
            .reduce((a, b) => a + Math.max(0, b), 0), 0);
          if (total < cost.removeCountersFromOthers) return;
        }
        if (cost.removeAnyCounters) {
          const filter = cost.removeAnyCounters.filter;
          if (!this.bf().some(x => x.ctrl === p && (!filter || filter(this, x, c)) &&
            Object.values(x.counters).some(n => n > 0))) return;
        }
        if (cost.removeCounterFromCreature && !this.creatures(p).some(x =>
          Object.values(x.counters).some(n => n > 0))) return;
        if (cost.tapCreature && !this.creatures(p).some(x => x !== c && !x.tapped)) return;
        if (a.targets) {
          for (const spec of a.targets) {
            if (!spec.upTo && this.legalTargets(spec, c, p).length < (spec.count ?? 1)) return;
          }
        }
        out.push({ card: c, ability: a, idx: ai });
      });
      // equip
      if (c.hasSub('Equipment') && (c.def.equip !== undefined || c.cur.equipCost !== undefined)) {
        if (this.turnPlayer === p && !this.stack.length && (this.phase === 'main1' || this.phase === 'main2')) {
          // Equip je ciljana sposobnost: shroud/protection moraju ukloniti metu,
          // dok vlastiti hexproof ostaje legalan. Alternativna cijena se i dalje
          // obračunava po konkretnom preostalom cilju.
          if (equipCandidates(this, c, p).length) out.push({ card: c, equip: true });
        }
      }
      // crew
      if (c.hasSub('Vehicle') && c.def.crew !== undefined && !c.is('Creature')) {
        const crewPow = this.creatures(p).filter(x => !x.tapped).reduce((s, x) => s + Math.max(0, x.power), 0);
        if (crewPow >= c.def.crew) out.push({ card: c, crew: true });
      }
    }
    // Mana solver i dalje automatski bira izvore pri plaćanju. Kada permanent
    // ima i drugu aktiviranu funkciju (Food život, utility land, sposobnost
    // kopirana preko Brewmastera...), igrač mora moći eksplicitno izabrati
    // hoće li koristiti tu funkciju ili njegovu vlastitu/dodijeljenu mana
    // sposobnost. Ne nudimo obične mana-only permanente da meni ne postane
    // popis svih landova, niti restriktivnu manu čije namjensko trošenje pool
    // trenutno ne može pouzdano pratiti nakon ručnog floatanja.
    const manualManaSeen = new Set();
    for (const source of this.manaSources(p, null)) {
      const c = source.card;
      const utility = (c.def.abilities || []).concat(c.cur && c.cur.extraAbilities || [])
        .some(ability => !ability.manaAbilityOnly) || source.m.manual;
      if (!utility || source.m.restrict) continue;
      const cost = source.extraCost || {};
      if (cost.life && p.life <= cost.life) continue;
      if (cost.mana) {
        const manaCost = this.abilityManaCost(p, c, typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana);
        if (!this.canPayMana(p, manaCost, { card: c, isAbility: true }, {
          excludeCards: cost.tap ? [c] : [],
          artifactAbilityAlreadyUsed: c.is('Artifact'),
        })) continue;
      }
      const key = manualManaKey(source);
      if (manualManaSeen.has(key)) continue;
      manualManaSeen.add(key);
      out.push({ card: c, manaAbility: true, manaSource: source, label: manualManaLabel(source) });
    }
    // Neke sposobnosti po pravilima aktiviraju isključivo protivnici vlasnika
    // permanenta (Oft-Nabbed Goat). One zato ne pripadaju u gornji owner pass.
    for (const c of this.bf()) {
      if (c.ctrl === p || c.cur && (c.cur.abilitiesDisabled || c.cur.activationDisabled)) continue;
      const abs = c.def.opponentAbilities || [];
      abs.forEach((a, ai) => {
        if (a.sorcery && (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2'))) return;
        if (a.cond && !a.cond(this, c, p)) return;
        const cost = a.cost || {};
        if (cost.mana && !this.canPayMana(p, U.parseCost(typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana))) return;
        if (cost.life && p.life <= cost.life) return;
        if (a.targets && a.targets.some(spec => !spec.upTo && this.legalTargets(spec, c, p).length < (spec.count ?? 1))) return;
        out.push({ card: c, ability: a, idx: `opp_${ai}`, opponentAbility: true });
      });
    }
    // hand: cycling etc.
    for (const c of p.hand) {
      const d = c.def;
      if (d.handAbility) {
        const a = d.handAbility;
        const mc = this.abilityManaCost(p, c, typeof a.cost === 'function' ? a.cost(this, c) : a.cost);
        if ((!a.cond || a.cond(this, c, p)) && this.canPayMana(p, mc, null,
          { artifactAbilityAlreadyUsed: c.is('Artifact') })) out.push({ card: c, handAbility: true });
      }
      if (d.cycling) {
        const cost = U.parseCost(typeof d.cycling.cost === 'function' ? d.cycling.cost(this, c) : d.cycling.cost);
        if (this.canPayMana(p, cost)) out.push({ card: c, cycling: true });
      }
      if (d.plot && this.turnPlayer === p && !this.stack.length && (this.phase === 'main1' || this.phase === 'main2')) {
        if (this.canPayMana(p, U.parseCost(d.plot))) out.push({ card: c, plot: true });
      }
      if (d.suspend && this.turnPlayer === p && !this.stack.length && (this.phase === 'main1' || this.phase === 'main2')) {
        if (this.canPayMana(p, U.parseCost(d.suspend.cost))) out.push({ card: c, suspend: true });
      }
    }
    // graveyard: encore i sl.
    for (const c of p.graveyard) {
      let a = c.def.gyAbility;
      let grantSource = null;
      if (!a) {
        grantSource = this.bf().find(source => source.ctrl === p && source.def.grantsGraveyardAbility &&
          source.def.grantsGraveyardAbility.filter(this, source, c, p));
        if (grantSource) a = grantSource.def.grantsGraveyardAbility.make(this, grantSource, c, p);
      }
      if (!a) continue;
      if (a.sorcery && (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2'))) continue;
      if (a.cond && !a.cond(this, c, p)) continue;
      if (a.sacArtifacts && this.bf().filter(x => x.ctrl === p && x.is('Artifact')).length < a.sacArtifacts) continue;
      const mc = this.abilityManaCost(p, c, typeof a.cost === 'function' ? a.cost(this, c) : a.cost);
      if (!this.canPayMana(p, mc, null, { artifactAbilityAlreadyUsed: c.is('Artifact') })) continue;
      out.push({ card: c, gyAbility: true, gyAbilityOverride: a, grantSource });
    }
    return out;
  };

  G.activateAbility = async function (p, entry, uiTargets) {
    const c = entry.card;
    if (entry.turnFaceUp) return this.turnFaceUp(p, c, entry.faceUpCost);
    if (c.zone === 'battlefield' && c.cur && c.cur.activationDisabled) return false;
    // Loyalty je trošak. Provjeri ga prije biranja meta i plaćanja drugih
    // troškova, a oznaku korištenja postavi tek kada je aktivacija legalna.
    const loyaltyAbility = entry.ability && entry.ability.loyalty !== undefined ? entry.ability : null;
    if (loyaltyAbility && (c.meta._loyUsed === this.turnNo ||
      (loyaltyAbility.loyalty < 0 && (c.counters.loyalty || 0) < -loyaltyAbility.loyalty))) return false;
    if (entry.manaAbility) {
      const source = entry.manaSource;
      const cost = source.extraCost || {};
      if (!source || c.zone !== 'battlefield' || c.ctrl !== p || c.cur && (c.cur.abilitiesDisabled || c.cur.activationDisabled)) return false;
      if (cost.tap && c.tapped) return false;
      if (cost.tap && c.is('Creature') && c.sick && !c.kw('haste') &&
        !source.m.creatureOK && !source.m.ignoreSickness) return false;
      if (cost.life && p.life <= cost.life) return false;
      const manualManaCost = cost.mana ?
        this.abilityManaCost(p, c, typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana) : null;
      if (manualManaCost) {
        const paid = await this.payMana(p, manualManaCost, { card: c, isAbility: true }, {
          excludeCards: cost.tap ? [c] : [],
          artifactAbilityAlreadyUsed: c.is('Artifact'),
        });
        if (!paid) return false;
      }
      let chosen = source.produce[0];
      if (source.produce.length > 1) {
        const choice = await p.controller.decide(this, {
          type: 'chooseOption',
          prompt: `${c.name}: koju manu proizvodiš?`,
          options: source.produce.map((option, index) => ({ key: String(index), label: manaOptionLabel(option) })),
          aiHint: { kind: 'manaColor' },
        });
        chosen = source.produce[Number(choice)] || source.produce[0];
      }
      this.markAbilityActivated(p, c);
      this.lg(`${U.playerVerb(p, 'activate', 'activates')}: ${c.name} — ${entry.label}.`, 'mana');
      await this.activateManaSource(p, source, chosen, null, [], true);
      await this.emit('abilityActivated', { player: p, card: c, isMana: true });
      this.note('mana', { p });
      return true;
    }
    if (entry.handAbility) {
      const a = c.def.handAbility;
      const mc = this.abilityManaCost(p, c, typeof a.cost === 'function' ? a.cost(this, c) : a.cost);
      const ok = await this.payMana(p, mc, { card: c, isAbility: true }, {
        artifactAbilityAlreadyUsed: c.is('Artifact'),
      });
      if (!ok || c.zone !== 'hand') return false;
      this.markAbilityActivated(p, c);
      this.remove(c); c.zone = 'graveyard'; c.owner.graveyard.push(c);
      const ctx = { g: this, src: c, you: p, targets: [] };
      this.stack.push({ kind: 'ability', name: `${c.name} — ${a.label || 'from hand'}`, ctrl: p, ctx, run: a.run, targets: [] });
      this.lg(`${U.playerVerb(p, 'activate', 'activates')}: ${c.name} — ${a.label || 'from hand'}.`, 'activate');
      this.note('stack', {});
      await this.emit('abilityActivated', { player: p, card: c, isMana: false });
      await this.flushTriggers();
      await this.priorityRound(p);
      return true;
    }
    if (entry.cycling) {
      const d = c.def.cycling;
      const cost = U.parseCost(typeof d.cost === 'function' ? d.cost(this, c) : d.cost);
      let cycleX = 0;
      if (d.xCycling) {
        const maxX = this.maxAffordableX(p, Object.assign({}, cost, { x: 1 }), c);
        cycleX = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: maxX, card: c, prompt: `X for cycling ${c.name}?`, aiHint: { kind: 'chooseX', card: c },
        });
        cost.generic += cycleX;
      }
      const ok = await this.payMana(p, cost);
      if (!ok) return false;
      this.remove(c); c.zone = 'graveyard'; p.graveyard.push(c);
      this.lg(`${U.playerVerb(p, 'cycle', 'cycles')} ${c.name}.`);
      if (d.effect) {
        const ctx = { g: this, src: c, you: p, targets: [], cycleX };
        if (d.targets) { const ok2 = await this.pickTargets(ctx, d.targets, c, p); if (!ok2) { await this.draw(p, 1); return true; } }
        this.stack.push({ kind: 'trigger', name: `${c.name} — cycle`, ctrl: p, ctx, run: d.effect });
        await this.priorityRound(p);
      }
      if (!d.noDraw) await this.draw(p, 1);
      await this.emit('cycled', { player: p, card: c });
      return true;
    }
    if (entry.plot) {
      const ok = await this.payMana(p, U.parseCost(c.def.plot));
      if (!ok) return false;
      this.remove(c); c.zone = 'exile'; p.exile.push(c);
      c.meta = { plotted: true };
      this.lg(`${U.playerVerb(p, 'plot', 'plots')} ${c.name}.`);
      return true;
    }
    if (entry.suspend) {
      const ok = await this.payMana(p, U.parseCost(c.def.suspend.cost));
      if (!ok) return false;
      this.remove(c); c.zone = 'exile'; p.exile.push(c);
      c.meta = { suspended: c.def.suspend.n };
      this.lg(`${U.playerVerb(p, 'suspend', 'suspends')} ${c.name} (${c.def.suspend.n}).`);
      return true;
    }
    if (entry.equip) {
      const spec = equipTargetSpec(p);
      // Nudimo samo legalne ciljane mete čiju equip cijenu igrač može platiti.
      const cands = equipCandidates(this, c, p);
      if (!cands.length) return false;
      const tgt = uiTargets && uiTargets[0] || (await p.controller.decide(this, {
        type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: `Equip ${c.name} to:`,
        aiHint: { kind: 'equipTarget', card: c },
      }))[0];
      if (!tgt || !cands.includes(tgt)) return false;
      const equipManaCost = this.abilityManaCost(p, c, equipCostFor(c, tgt));
      const canMana = this.canPayMana(p, equipManaCost, { card: c, isAbility: true }, {
        artifactAbilityAlreadyUsed: c.is('Artifact'),
      });
      const counterKinds = Object.keys(c.counters).filter(kind => (c.counters[kind] || 0) > 0);
      const canCounter = !!c.def.equipRemoveCounter && counterKinds.length > 0;
      let payment = canMana ? 'mana' : 'counter';
      if (canMana && canCounter) payment = await p.controller.decide(this, {
        type: 'chooseOption', prompt: `${c.name} — Equip cijena`,
        options: [{ key: 'mana', label: 'Plati {3}' }, { key: 'counter', label: 'Ukloni counter' }],
        aiHint: { kind: 'equipPayment', card: c },
      });
      if (payment === 'counter' && canCounter) {
        let counterKind = counterKinds[0];
        if (counterKinds.length > 1) counterKind = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `${c.name}: koji counter uklanjaš?`,
          options: counterKinds.map(kind => ({ key: kind, label: kind })),
          aiHint: { kind: 'counterCostKind', card: c },
        });
        if (!counterKinds.includes(counterKind)) return false;
        this.removeCounters(c, counterKind, 1);
      } else {
        if (!canMana) return false;
        const ok = await this.payMana(p, equipManaCost, { card: c, isAbility: true }, {
          artifactAbilityAlreadyUsed: c.is('Artifact'),
        });
        if (!ok) return false;
      }
      this.markAbilityActivated(p, c);
      const ctx = { g: this, src: c, you: p, targets: [tgt] };
      const so = {
        kind: 'ability', name: `${c.name} — Equip`, ctrl: p, ctx,
        targets: ctx.targets, srcCard: c, targetSpecs: [spec],
        run: async equipCtx => {
          const host = equipCtx.targets[0];
          if (!host || c.zone !== 'battlefield') return;
          if (await equipCtx.g.attach(c, host)) equipCtx.g.lg(`${c.name} → ${host.name}.`);
        },
      };
      this.lg(`${U.playerVerb(p, 'activate', 'activates')}: ${c.name} — Equip.`, 'activate');
      await this.emit('abilityActivated', { player: p, card: c, isMana: false });
      this.stack.push(so);
      this.note('stack', {});
      await this.flushTriggers();
      await this.priorityRound(p);
      return true;
    }
    if (entry.gyAbility) {
      const a = entry.gyAbilityOverride || c.def.gyAbility;
      const mc = this.abilityManaCost(p, c, typeof a.cost === 'function' ? a.cost(this, c) : a.cost);
      let pickedArtifacts = [];
      if (a.sacArtifacts) {
        const pool = this.bf().filter(x => x.ctrl === p && x.is('Artifact'));
        pickedArtifacts = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: a.sacArtifacts, max: a.sacArtifacts,
          prompt: `Žrtvuj ${a.sacArtifacts} artefakta`, aiHint: { kind: 'sacCost', src: c },
        });
        if (pickedArtifacts.length < a.sacArtifacts) return false;
      }
      const ok = await this.payMana(p, mc, { card: c, isAbility: true }, {
        artifactAbilityAlreadyUsed: c.is('Artifact'),
      });
      if (!ok) return false;
      for (const artifact of pickedArtifacts) await this.sacrifice(p, artifact);
      this.markAbilityActivated(p, c);
      if (a.exileSelf !== false) { this.remove(c); c.zone = 'exile'; p.exile.push(c); }
      this.lg(`${p.name}: ${c.name} — ${a.label || 'iz groblja'}.`, 'activate');
      const gctx = { g: this, src: c, you: p, targets: [] };
      this.stack.push({ kind: 'ability', name: `${c.name} — ${a.label || 'GY'}`, ctrl: p, ctx: gctx, run: a.run, targets: [] });
      await this.emit('abilityActivated', { player: p, card: c, isMana: false });
      this.note('stack', {});
      await this.flushTriggers();
      await this.priorityRound(p);
      return true;
    }
    if (entry.crew) {
      const need = c.def.crew;
      const cands = this.creatures(p).filter(x => !x.tapped);
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: cands, min: 1, max: cands.length, prompt: `Crew ${c.name} (${need}): tapuj stvorenja`,
        aiHint: { kind: 'crew', card: c, need },
      });
      const pow = picked.reduce((s, x) => s + Math.max(0, x.power), 0);
      if (pow < need) return false;
      for (const x of picked) this.tap(x);
      this.markAbilityActivated(p, c);
      c.meta.crewedTurn = this.turnNo;
      this.recalc();
      this.lg(`${c.name} je crewovan.`);
      return true;
    }
    const a = entry.ability;
    const cost = a.cost || {};
    const ctx = { g: this, src: c, you: p, targets: [] };
    // targets first
    if (a.targets) {
      if (uiTargets) ctx.targets = uiTargets;
      else {
        const ok = await this.pickTargets(ctx, a.targets, c, p);
        if (!ok) return false;
      }
    }
    const resolvedManaCost = cost.mana ?
      this.abilityManaCost(p, c, typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana) :
      cost.manaFromTarget && ctx.targets[0] ? this.abilityManaCost(p, c, { generic: ctx.targets[0].mv, x: 0, pips: [] }) : null;
    // pay costs
    if (cost.tapHost) {
      const host = c.attachedTo ? this.byIid(c.attachedTo) : null;
      if (!host || host.tapped) return false;
      this.tap(host);
    }
    if (cost.tapLand) {
      const pool = this.lands(p).filter(l => !l.tapped);
      if (!pool.length) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: 'Tapuj land (cijena)', aiHint: { kind: 'crew' },
      });
      if (!picked.length) return false;
      this.tap(picked[0]);
    }
    if (cost.tapArtifacts) {
      const pool = this.bf().filter(x => x.ctrl === p && x.is('Artifact') && !x.tapped && x !== c);
      if (pool.length < cost.tapArtifacts) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: cost.tapArtifacts, max: cost.tapArtifacts, prompt: `Tapuj ${cost.tapArtifacts} artefakta`, aiHint: { kind: 'crew' },
      });
      if (picked.length < cost.tapArtifacts) return false;
      for (const x of picked) this.tap(x);
    }
    if (cost.tapCreature) {
      const pool = this.creatures(p).filter(x => x !== c && !x.tapped);
      if (!pool.length) return false;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Tapuj stvorenje (cijena — npr. station)`, aiHint: { kind: 'stationTap', src: c },
      });
      if (!picked.length) return false;
      this.tap(picked[0]);
      ctx.tappedCre = picked[0];
      ctx.stationPower = Math.max(0, picked[0].power);
    }
    if (cost.rmCounter) {
      const kind = cost.rmCounter.kind || cost.rmCounter;
      const nn = cost.rmCounter.n || 1;
      if ((c.counters[kind] || 0) < nn) return false;
      this.removeCounters(c, kind, nn);
    }
    if (cost.removeCountersFromOthers) {
      ctx.removedCounterCosts = [];
      for (let left = cost.removeCountersFromOthers; left > 0; left--) {
        const pool = this.bf().filter(x => x.ctrl === p && x !== c &&
          (x.is('Artifact') || x.is('Creature') || x.is('Planeswalker')) &&
          Object.values(x.counters).some(n => n > 0));
        if (!pool.length) return false;
        const picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: 1,
          prompt: `Ukloni counter (${left} preostalo)`, aiHint: { kind: 'counterCost', src: c },
        });
        const source = picked[0];
        if (!source || !pool.includes(source)) return false;
        const kinds = Object.keys(source.counters).filter(kind => (source.counters[kind] || 0) > 0);
        let kind = kinds[0];
        if (kinds.length > 1) kind = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `${source.name}: koji counter?`,
          options: kinds.map(key => ({ key, label: key })),
          aiHint: { kind: 'counterCostKind', card: source },
        });
        if (!kinds.includes(kind)) return false;
        this.removeCounters(source, kind, 1);
        ctx.removedCounterCosts.push({ card: source, kind });
      }
    }
    if (cost.removeAnyCounters) {
      const filter = cost.removeAnyCounters.filter;
      const pool = this.bf().filter(x => x.ctrl === p && (!filter || filter(this, x, c)) &&
        Object.values(x.counters).some(n => n > 0));
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1,
        prompt: 'Remove counters from:', aiHint: { kind: 'counterCost', src: c },
      });
      const source = picked[0];
      if (!source || !pool.includes(source)) return false;
      ctx.counterSource = source;
      ctx.x = 0;
      for (const kind of Object.keys(source.counters).filter(key => (source.counters[key] || 0) > 0)) {
        const available = source.counters[kind] || 0;
        const amount = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: available, card: source,
          prompt: `How many ${kind} counters do you remove?`,
          aiHint: { kind: 'moveCounters', source, counterKind: kind },
        });
        const n = Math.max(0, Math.min(available, Number(amount) || 0));
        if (n > 0) { this.removeCounters(source, kind, n); ctx.x += n; }
      }
      if (ctx.x <= 0) return false;
    }
    if (cost.removeCounterFromCreature) {
      const pool = this.creatures(p).filter(x => Object.values(x.counters).some(n => n > 0));
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: pool, min: 1, max: 1,
        prompt: 'Ukloni counter sa stvorenja (cijena)', aiHint: { kind: 'fainCounterCost', src: c },
      });
      const source = picked[0];
      if (!source || !pool.includes(source)) return false;
      const kinds = Object.keys(source.counters).filter(kind => (source.counters[kind] || 0) > 0);
      let kind = kinds[0];
      if (kinds.length > 1) kind = await p.controller.decide(this, {
        type: 'chooseOption', prompt: `${source.name}: koji counter uklanjaš?`,
        options: kinds.map(key => ({ key, label: key })),
        aiHint: { kind: 'counterCostKind', card: source },
      });
      if (!kinds.includes(kind)) return false;
      this.removeCounters(source, kind, 1);
      ctx.removedCounterCost = { card: source, kind };
    }
    // Žrtve za sacrifice cijenu se biraju PRIJE plaćanja mane i izuzimaju se
    // iz mana izvora. Inače je payMana znao pojesti baš te permanente
    // (Treasure za Olivijin "{3}, Sacrifice two Treasures"), pa je izbor
    // žrtava ostajao bez dovoljno kandidata i prozor se zaglavio.
    let sacPicked = null;
    if (cost.sacCreature || cost.sac) {
      const pool = this.bf().filter(x => x.ctrl === p &&
        (cost.sacCreature ? x.is('Creature') : cost.sac(this, x, c)) &&
        (!cost.sacOther || x !== c) && this.canSacrifice(x));
      const nsac = cost.sacN === 'X' ? null : (cost.sacN || 1);
      if (nsac === null) {
        sacPicked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: pool.length, prompt: `Žrtvuj (X):`, aiHint: { kind: 'sacX', src: c },
        });
        if (!sacPicked.length) return false;
        ctx.x = sacPicked.length;
      } else {
        if (pool.length < nsac) return false;
        sacPicked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: nsac, max: nsac, prompt: `Žrtvuj:`, aiHint: { kind: 'sacCost', src: c },
        });
        if (sacPicked.length < nsac || sacPicked.some(x => !pool.includes(x))) return false;
      }
    }
    if (cost.tap) { if (c.tapped) return false; this.tap(c); }
    if (cost.untapSelf) { c.tapped = false; }
    if (resolvedManaCost) {
      const mc = resolvedManaCost;
      const manaExclude = (cost.tap ? [c] : []).concat(sacPicked || []);
      if (a.xCost) {
        const maxX = this.maxAffordableX(p, mc, c, {
          artifactAbilityAlreadyUsed: c.is('Artifact'), excludeCards: manaExclude,
        });
        ctx.x = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: maxX, card: c,
          prompt: `X for ${c.name} — ${a.label || 'ability'}?`, aiHint: { kind: 'chooseX', card: c },
        });
        ctx.x = Math.max(0, Math.min(Number(ctx.x) || 0, maxX));
      }
      // izvor sposobnosti se prosljeđuje da restrikcije mane mogu odlučiti
      // (Secluded Courtyard: „ili aktiviraj sposobnost stvorenja tog tipa")
      const ok = await this.payMana(p, mc, { card: c, isAbility: true }, {
        xVal: ctx.x || 0,
        artifactAbilityAlreadyUsed: c.is('Artifact'),
        excludeCards: manaExclude,
      });
      if (!ok) { if (cost.tap) c.tapped = false; return false; }
    }
    if (cost.life) await this.loseLife(p, cost.life, 'cost');
    if (cost.returnSelf) {
      if (c.zone !== 'battlefield' || c.ctrl !== p) return false;
      await this.move(c, 'hand');
    }
    if (cost.exileSelf) {
      if (c.zone !== 'battlefield' || c.ctrl !== p) return false;
      ctx.exiledSelf = this.snapshot(c);
      await this.move(c, 'exile', { noCmdReplace: true });
    }
    if (cost.sacSelf) {
      if (!this.canSacrifice(c)) return false;
      ctx.sacdSelf = this.snapshot(c);
      await this.sacrifice(p, c);
    }
    if (sacPicked) {
      ctx.sacd = sacPicked.map(x => this.snapshot(x));
      for (const x of sacPicked) if (this.canSacrifice(x)) await this.sacrifice(p, x);
    }
    if (cost.discard) {
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: p.hand, min: cost.discard, max: cost.discard, prompt: 'Odbaci:', aiHint: { kind: 'addlDiscard' },
      });
      await this.discard(p, picked);
    }
    if (cost.discardX) {
      ctx.x = await p.controller.decide(this, {
        type: 'chooseX', min: 0, max: p.hand.length, card: c,
        prompt: `How many cards do you discard for ${c.name}?`, aiHint: { kind: 'chooseX', card: c },
      });
      ctx.x = Math.max(0, Math.min(Number(ctx.x) || 0, p.hand.length));
      if (ctx.x > 0) {
        const picked = await p.controller.decide(this, {
          type: 'chooseCards', from: p.hand, min: ctx.x, max: ctx.x,
          prompt: `Odbaci ${ctx.x}:`, aiHint: { kind: 'addlDiscard' },
        });
        if (picked.length < ctx.x) return false;
        await this.discard(p, picked);
      }
    }
    if (cost.exileFromGY) {
      const exileN = typeof cost.exileFromGY === 'object' ? (cost.exileFromGY.n || 1) : cost.exileFromGY;
      const exileFilter = typeof cost.exileFromGY === 'object' ? cost.exileFromGY.filter : null;
      const exilePool = p.graveyard.filter(card => !exileFilter || exileFilter(this, card, c, p));
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: exilePool, min: exileN, max: exileN, prompt: 'Egzilaj iz groblja:', aiHint: { kind: 'delve' },
      });
      if (picked.length < exileN || picked.some(card => !exilePool.includes(card))) return false;
      for (const x of picked) await this.move(x, 'exile');
    }
    if (cost.counter === '-1/-1') await this.addM1(c, 1, p);
    else if (cost.counter) this.addCounters(c, cost.counter, 1, true, p);
    if (a.oncePerTurn) c.meta['_ab_' + entry.idx] = this.turnNo;
    // loyalty
    if (a.loyalty !== undefined) {
      if (c.meta._loyUsed === this.turnNo) return false;
      if (a.loyalty > 0) this.addCounters(c, 'loyalty', a.loyalty, true);
      else if (a.loyalty < 0) {
        if ((c.counters['loyalty'] || 0) < -a.loyalty) return false;
        this.removeCounters(c, 'loyalty', -a.loyalty);
      }
      c.meta._loyUsed = this.turnNo;
    }
    this.markAbilityActivated(p, c);
    this.lg(`${U.playerVerb(p, 'activate', 'activates')}: ${c.name}${a.label ? ' — ' + a.label : ''}.`, 'activate');
    await this.pace(p.isAI ? 800 : 0);
    await this.emit('abilityActivated', { player: p, card: c, isMana: false });
    // crime: ciljanje protivnika/njihovih stvari kroz ability
    {
      const vics = new Set();
      for (const t of (ctx.targets || []).flat()) {
        if (!t) continue;
        if (t instanceof MTG.Player) { if (t !== p) vics.add(t); }
        else if (t.ctrl && t.ctrl !== p && t.zone) vics.add(t.ctrl);
      }
      if (vics.size) await this.emit('crime', { player: p, victims: [...vics] });
    }
    if (p.isAI) {
      const mine = this.humanTargets(ctx.targets);
      if (mine.length) {
        const kind = MTG.threatKind({ oracle: (a.label || '') + '\n' + (c.def.oracle || '') }, ctx.targets);
        const names = MTG.threatTargetNames(mine, this.human());
        this.lg(`${kind.icon} ${U.playerVerb(p, 'target', 'targets')} ${names.join(', ')} with ${c.name}${a.label ? ' (' + a.label + ')' : ''} (${kind.label})`, 'spot');
        await this.alertHuman({
          card: c, by: p, targets: mine, allTargets: (ctx.targets || []).flat().filter(Boolean), kind, names, source: 'ability',
          abilityLabel: a.label || '', ms: 1400,
        });
      }
    }
    const so = {
      kind: 'ability', name: `${c.name}${a.label ? ' — ' + a.label : ''}`, ctrl: p,
      ctx, run: a.run, targets: ctx.targets, srcCard: c, targetSpecs: a.targets || null,
    };
    this.stack.push(so);
    this.queueWardTriggers(so, ctx);
    this.note('stack', {});
    await this.flushTriggers();
    await this.priorityRound(p);
    return true;
  };

  G.attach = async function (att, host) {
    if (!att || !host || att.zone !== 'battlefield' || host.zone !== 'battlefield') return false;
    if (att.attachedTo) {
      const old = this.byIid(att.attachedTo);
      if (old) old.attachments = old.attachments.filter(i => i !== att.iid);
    }
    att.attachedTo = host.iid;
    if (!host.attachments.includes(att.iid)) host.attachments.push(att.iid);
    if (att.def.onAttach) att.def.onAttach(this, att, host);
    this.recalc();
    await this.emit('attached', { att, host });
    return true;
  };

  // ============================================================
  // Priority
  // ============================================================
  G.priorityRound = async function (afterPlayer) {
    if (this.gameOver) return;
    // Cast/activation helperi istorijski sami pozivaju priorityRound. Ako se to
    // desi dok je krug već aktivan, ne otvaraj rekurzivni krug: vanjski state
    // machine nastavlja od igrača koji je upravo djelovao.
    if (this._prioritySessionActive) {
      if (afterPlayer && !afterPlayer.lost) this._priorityRestart = afterPlayer;
      return;
    }
    this._prioritySessionActive = true;
    this._prioritySessionId = (this._prioritySessionId || 0) + 1;
    let holder = afterPlayer && !afterPlayer.lost
      ? afterPlayer
      : (this.turnPlayer && !this.turnPlayer.lost ? this.turnPlayer : this.alivePlayers()[0]);
    let consecutivePasses = 0;
    let guard = 0;
    try {
      while (!this.gameOver && holder && guard++ < 1200) {
        await this.flushTriggers();
        if (this.gameOver) return;
        if (holder.lost) holder = this.nextPlayer(holder);
        this.priorityState = {
          holder, consecutivePasses,
          neededPasses: this.alivePlayers().length,
        };
        this.note('priority', this.priorityState);
        const act = await this.askPriorityAction(holder);
        if (act && act.kind !== 'pass') {
          consecutivePasses = 0;
          this._priorityRestart = null;
          await this.performAction(holder, act);
          holder = this._priorityRestart && !this._priorityRestart.lost ? this._priorityRestart : holder;
          this._priorityRestart = null;
          continue; // igrač koji je djelovao zadržava priority (CR 117.3c)
        }

        consecutivePasses++;
        if (consecutivePasses >= this.alivePlayers().length) {
          if (!this.stack.length) break;
          await this.resolveTop();
          if (this.gameOver) return;
          // Nakon rezolucije aktivni igrač dobija priority (CR 117.3b).
          holder = this.turnPlayer && !this.turnPlayer.lost ? this.turnPlayer : this.alivePlayers()[0];
          consecutivePasses = 0;
          this._priorityRestart = null;
          continue;
        }
        holder = this.nextPlayer(holder);
      }
      if (guard >= 1200) throw new Error('Priority guard exceeded.');
    } finally {
      this.priorityState = null;
      this._priorityRestart = null;
      this._prioritySessionActive = false;
      this.note('priority', { holder: null, consecutivePasses: 0, neededPasses: 0 });
    }
  };

  // ============================================================
  // Auto-pass politika (koristi je UI; ovdje je da bude testabilna headless)
  // mode: 'fast' | 'smart' | 'full'
  //  fast  — pita samo kad nešto stoji na stacku
  //  smart — + ključni prozori (napadači, blokeri, first-strike, kraj tuđeg poteza)
  //  full  — pita na svakom prioritetu
  // vraća true = auto-pass (ne pitaj igrača)
  // ============================================================
  // Je li ovo end step igrača koji je NEPOSREDNO prije mene u redu poteza?
  // (tj. čim ovaj potez završi, na redu sam ja)
  MTG.isLastEndStepBeforeMyTurn = function (g, me) {
    if (!me || g.phase !== 'end' || g.turnPlayer === me || me.lost) return false;
    if (g.extraTurns && g.extraTurns.length) return false;   // neko ubacuje ekstra potez
    return g.nextPlayer(g.turnPlayer) === me;
  };

  MTG.autoPassPolicy = function (mode, g, q, me) {
    if (!q || q.type !== 'priority') return false;
    const casts = q.casts || [], acts = q.acts || [];
    const canAct = casts.length > 0 || acts.length > 0;
    const top = g.stack[g.stack.length - 1];
    if (top) {
      // SVAKA protivnikova odigrana karta staje — i kad nemam čime da odgovorim.
      // Stack se vidi na sredini, a igra ide dalje tek na tvoj klik.
      // (Landovi ne koriste stack, pa oni nikad ne zaustavljaju igru.)
      if (top.ctrl !== me && top.kind === 'spell') return false;
      if (mode === 'full') return false;
      if (mode === 'off' || mode === 'end') return true;
      if (!canAct) return true;                              // trigeri/sposobnosti bez odgovora → pusti
      // moj vlastiti spell/trigger na vrhu, a nemam nikakav odgovor iz ruke → pusti
      if (top.ctrl === me && !casts.length) return true;
      return false;                                          // nešto je na stacku → PITAJ
    }
    if (mode === 'full') return false;
    if (mode === 'off') return true;
    if (!canAct) return true;                                // nema šta da se odigra
    // POSLJEDNJI end step prije mog poteza: zadnja prilika da nešto odigram u
    // tuđem potezu (instanti, flash, aktivacije). Uvijek stani — igrač sam
    // odlučuje kad nastavlja, dugmetom "Nastavi na moj potez".
    if (MTG.isLastEndStepBeforeMyTurn(g, me)) return false;
    // U combatu legalan instant-speed potez nikad ne smije tiho proci u
    // podrazumijevanom profilu: buff, removal ili aktivacija dobijaju pravi
    // reaction prozor. Profil "off" je vec eksplicitno obradjen iznad.
    if (g.phase === 'combat' && canAct) return false;
    if (mode === 'fast' || mode === 'auto' || mode === 'end') return true;
    // smart: ključni prozori sa praznim stackom
    const myTurn = g.turnPlayer === me;
    const inCombat = g.phase === 'combat';
    const juicy =
      (inCombat && (g.step === 'attackers' || g.step === 'blockers' || g.step === 'firstStrike')) ||
      (g.phase === 'end' && !myTurn);
    if (!juicy) return true;
    // u svom potezu prije proglašenja blokera nema šta da se čeka
    if (myTurn && g.step === 'attackers') return true;
    return false;                                            // PITAJ
  };
  // ikona, množilac pauze, opis. Normalna je sada osjetno sporija nego ranije —
  // cilj je da se VIDI šta bot radi, korak po korak.
  MTG.SPEEDS = {
    normal: ['▶️', 1.6, 'Normal — every bot action remains visible'],
    slow: ['🐢', 2.6, 'Slow — for careful tracking'],
    fast: ['⏩', 0.6, 'Fast — for skipping ahead'],
  };
  MTG.PRIO_MODES = [
    { key: 'end', icon: '🌙', short: 'END', label: 'Combat responses + before my turn', desc: 'Stops during combat when you have a legal response and during the end step immediately before your turn. Opposing nonland cards are always shown.' },
    { key: 'combat', icon: '⚔️', short: 'COMBAT', label: 'Combat + end step', desc: 'Stops after attackers, blockers, first-strike damage, and during the end step before your turn.' },
    { key: 'off', icon: '▶', short: 'ACTIONS', label: 'Required actions only', desc: 'No empty priority stops. Every opposing nonland card is still shown and waits for Proceed.' },
    { key: 'full', icon: '🎛️', short: 'FULL', label: 'Full control', desc: 'Stops at every priority window, like a tournament table.' },
  ];

  G.askPriorityAction = async function (p) {
    // gather instant-speed options
    const casts = this.castableList(p).filter(e => {
      const speed = (e.alt && e.alt.speed) || (e.card.is('Instant') || e.card.kw('flash') || (e.alt && e.alt.adventure && e.card.def.adventure.types === 'Instant') ? 'instant' : 'sorcery');
      if (this.stack.length || this.turnPlayer !== p || (this.phase !== 'main1' && this.phase !== 'main2')) {
        const isInstantSpeed = e.card.is('Instant') || e.card.kw('flash') ||
          (e.alt && e.alt.adventure && e.card.def.adventure.types === 'Instant') ||
          (e.alt && e.alt.flash);
        return isInstantSpeed && this.canCastTiming(p, e.card, e.alt);
      }
      return true;
    });
    const acts = this.activatableList(p, true).filter(e => {
      if (this.stack.length || this.turnPlayer !== p || (this.phase !== 'main1' && this.phase !== 'main2')) {
        return !(e.ability && e.ability.sorcery) && !e.equip && !e.plot && !e.suspend && !(e.crew);
      }
      return true;
    });
    if (!casts.length && !acts.length) {
      // Ljudski igrač svejedno dobija prozor kad protivnik odigra kartu: vidi
      // šta je bačeno na stacku i sam klikne Proceed. Botovi tu nemaju šta da
      // biraju, pa njima i dalje kratimo put.
      const top = this.stack[this.stack.length - 1];
      const showToHuman = !p.isAI && top && top.ctrl !== p && top.kind === 'spell';
      if (!showToHuman) return { kind: 'pass' };
    }
    return p.controller.decide(this, {
      type: 'priority', player: p, casts, acts,
      stack: this.stack, phase: this.phase,
    });
  };

  G.performAction = async function (p, act) {
    if (act.kind === 'cast') {
      return await this.castSpell(p, act.card, { alt: act.alt, from: act.from, xVal: act.xVal });
    } else if (act.kind === 'activate') {
      return await this.activateAbility(p, act.entry, act.targets);
    } else if (act.kind === 'land') {
      return await this.playLand(p, act.card);
    }
  };

  // ============================================================
  // Turn structure
  // ============================================================
  G.scheduleAdditionalPhases = function (kinds) {
    const phases = (kinds || []).map(kind => ({ kind, additional: true }))
      .filter(entry => entry.kind === 'combat' || entry.kind === 'main');
    if (!phases.length) return;
    if (!Array.isArray(this._additionalPhases)) this._additionalPhases = [];
    // A phase created "after this phase" happens before phases that were
    // already waiting after it.  Inserting at the front also keeps a compound
    // combat → main instruction together and in its printed order.
    this._additionalPhases.unshift(...phases);
    this._extraCombats = (this._extraCombats || 0) + phases.filter(entry => entry.kind === 'combat').length;
  };

  G.scheduleAdditionalCombat = function (opts = {}) {
    this.scheduleAdditionalPhases(opts.followedByMain ? ['combat', 'main'] : ['combat']);
  };

  G.runAdditionalPhases = async function (p) {
    while (this._additionalPhases.length) {
      const next = this._additionalPhases.shift();
      if (next.kind === 'combat') {
        this._extraCombats = Math.max(0, (this._extraCombats || 0) - 1);
        this.lg('⚔️ ADDITIONAL combat phase!', 'attack');
        if (!p.lost) await this.combatPhase(p);
        if (this.gameOver) return;
        this.emptyPool();
        continue;
      }

      this.phase = 'main2';
      this.step = 'additional';
      this.lg('◆ ADDITIONAL main phase.', 'turn');
      this.note('phase', { additional: true });
      await this.pace(p.isAI ? 330 : 0);
      await this.emit('postcombatMain', { player: p, additional: true });
      await this.flushTriggers();
      if (!p.lost) await this.mainPhase(p);
      if (this.gameOver) return;
    }
  };

  G.playLand = async function (p, card) {
    if (p.landsPlayed >= p.maxLands) return false;
    if (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2')) return false;
    p.landsPlayed++;
    const fromZone = card.zone;
    this.remove(card);
    card.zone = 'nowhere';
    this.lg(`${U.playerVerb(p, 'play', 'plays')} a land: ${card.name}.`, 'land');
    await this.pace(p.isAI ? 700 : 0);
    await this.move(card, 'battlefield', { ctrl: p });
    await this.emit('landPlayed', { player: p, card, from: fromZone });
    await this.flushTriggers();
    return true;
  };

  G.runGame = async function () {
    while (!this.gameOver && this.turnNo < this.maxTurns) {
      await this.runTurn();
    }
    if (!this.gameOver) {
      this.lg('Limit poteza dostignut — kraj.');
      this.gameOver = true;
      const alive = this.alivePlayers().slice().sort((a, b) => b.life - a.life);
      this.winner = alive[0] || null;
      this.note('gameover', { winner: this.winner });
    }
  };

  G.runTurn = async function () {
    const p = this.turnPlayer;
    if (this.diplomacyRefresh) this.diplomacyRefresh();
    this.turnNo++;
    p.turnsStarted++;
    this.diedThisTurn = [];
    this._trigsThisTurn = 0;
    this._extraCombats = 0;
    this._additionalPhases = [];
    for (const q of this.players) q.turnState = q.freshTurnState();
    p.landsPlayed = 0; p.maxLands = 1;
    // Ko me napao u SVOM prošlom potezu (Weathered Sentinels i sl.). Set se ne
    // smije brisati na početku mog poteza — tada se baš i čita — nego se prebaci
    // u prevAttackers, a novi se puni tokom ovog kruga.
    p.prevAttackers = p.lastAttackers || new Set();
    p.lastAttackers = new Set();
    this.lg(`——— Turn ${this.turnNo}: ${p.name} ———`, 'turn');
    this.note('turn', { p });
    await this.pace(p.isAI ? 1000 : 500);

    // UNTAP
    this.phase = 'untap'; this.step = '';
    this.phaseInFor(p);
    this.untilEffects = this.untilEffects.filter(e => !(e.expires === 'untilTurnOf' && e.whoTurn === p));
    if (!p.skipUntapOnce) {
      for (const c of this.bf()) {
        if (c.ctrl === p && !c.def.doesntUntap) {
          if (c.meta.noUntapOnce) { c.meta.noUntapOnce = false; continue; }
          if (c.tapped && (c.counters['stun'] || 0) > 0) {
            this.removeCounters(c, 'stun', 1);
            this.lg(`${c.name}: stun counter — ostaje tapovan.`);
            continue;
          }
          c.tapped = false;
        }
      }
    } else p.skipUntapOnce = false;
    for (const c of this.bf()) if (c.ctrl === p) { c.sick = false; c.meta.tempHaste = c.meta.tempHaste; }
    // Seedborn: untap during others' untap handled at each untap for all players with the static
    for (const c of this.bf()) {
      if (c.def.untapAllOthersTurns && c.ctrl !== p) {
        for (const x of this.bf()) if (x.ctrl === c.ctrl) x.tapped = false;
      }
    }
    this.recalc();

    // UPKEEP
    this.phase = 'upkeep';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    await this.emit('upkeep', { player: p });
    // suspend
    for (const q of this.players) {
      if (q !== p) continue;
      for (const c of q.exile.slice()) {
        if (c.meta && c.meta.suspended > 0) {
          c.meta.suspended--;
          this.lg(`${c.name}: suspend ${c.meta.suspended} preostalo.`);
          if (c.meta.suspended === 0) {
            await this.castSpell(q, c, { alt: { free: true }, from: 'exile' });
          }
        }
      }
    }
    await this.flushTriggers();
    await this.priorityRound(p);
    this.emptyPool();          // CR 500.4
    if (this.gameOver) return;

    // DRAW
    this.phase = 'draw';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    // CR 103.8: prvi igrač preskače prvo vučenje SAMO u partiji sa dva igrača.
    // U višeigračkoj partiji (pod od 3-4) niko ne preskače.
    const skipsFirstDraw = this.players.length === 2 && this.turnNo === 1 && this.players.indexOf(p) === 0;
    if (p.lost) { /* CR 800.4e: potez se nastavlja, ali bez aktivnog igrača */ }
    else if (!skipsFirstDraw) {
      await this.draw(p, 1);
    } else this.lg(`${U.playerVerb(p, 'skip', 'skips')} the first draw (duel — CR 103.8).`);
    await this.emit('drawStep', { player: p });
    await this.flushTriggers();
    await this.priorityRound(p);
    this.emptyPool();          // CR 500.4
    if (this.gameOver) return;

    // MAIN 1
    this.phase = 'main1'; this.step = '';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    await this.emit('precombatMain', { player: p });
    await this.flushTriggers();
    // Diplomatski botovi pregovaraju samo na neutralnom checkpointu, nikad
    // usred targetiranja, rezolucije ili borbe. Sistem sam provjerava da li su
    // završene prve tri pune runde i da li postoji stvarna vodeća prijetnja.
    if (this.processDiplomacyCheckpoint) this.processDiplomacyCheckpoint(p);
    if (!p.lost) await this.mainPhase(p);
    if (this.gameOver) return;
    await this.runAdditionalPhases(p);
    if (this.gameOver) return;

    // NORMAL COMBAT. Any phase created during it is inserted immediately
    // afterwards, before the normal postcombat main phase.
    if (!p.lost) await this.combatPhase(p);
    if (this.gameOver) return;
    this.emptyPool();          // CR 500.4 — mana iz combata ne curi u main 2
    await this.runAdditionalPhases(p);
    if (this.gameOver) return;

    // MAIN 2
    this.phase = 'main2'; this.step = '';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    await this.emit('postcombatMain', { player: p });
    await this.flushTriggers();
    if (!p.lost) await this.mainPhase(p);
    if (this.gameOver) return;
    await this.runAdditionalPhases(p);
    if (this.gameOver) return;

    // END STEP
    this.phase = 'end';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    if (this.monarch === p && !p.lost) {
      this.lg(`👑 Monarch benefit — ${U.playerVerb(p, 'draw', 'draws')} a card at the end step.`, 'monarch');
      await this.draw(p, 1);
    }
    await this.emit('endStep', { player: p });
    await this.flushTriggers();
    await this.priorityRound(p);
    this.emptyPool();          // CR 500.4
    if (this.gameOver) return;

    // CLEANUP
    this.phase = 'cleanup';
    // discard to hand size
    let maxHand = 7;
    for (const c of this.bf()) if (c.ctrl === p && c.def.noMaxHand) maxHand = Infinity;
    if (p.noMaxHandForever) maxHand = Infinity;
    if (p.lost) maxHand = Infinity;   // CR 800.4e: ispali igrač ne odbacuje
    if (p.hand.length > maxHand) {
      const n = p.hand.length - maxHand;
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: p.hand, min: n, max: n, prompt: `Discard down to ${maxHand} cards in hand (${n})`,
        aiHint: { kind: 'cleanupDiscard' },
      });
      await this.discard(p, picked);
    }
    // damage clears, until-EOT expire
    for (const c of this.bf()) {
      c.damage = 0; c.deathtouched = false; c.regenShield = 0;
      // "…dealt combat damage by this creature THIS TURN" — bez čišćenja je
      // Steel Hellkite zauvijek pamtio svakog koga je ikad pogodio.
      if (c.meta && c.meta._hitThisTurn) c.meta._hitThisTurn = {};
    }
    // Efekti promjene kontrole prestaju u cleanup koraku, ne na početku end
    // stepa. Obrnuti redoslijed vraća slojevite privremene kontrole do stvarnog
    // kontrolora koji je postojao prije svih efekata ovog poteza.
    for (let i = this.untilEffects.length - 1; i >= 0; i--) {
      const effect = this.untilEffects[i];
      if (effect.expires !== 'eot' || effect.kind !== 'temporaryControl') continue;
      const card = this.byIid(effect.iid);
      if (card && card.zone === 'battlefield' && card.ctrl === effect.to) card.ctrl = effect.from;
    }
    this.untilEffects = this.untilEffects.filter(e => e.expires !== 'eot' &&
      !(e.expires === 'yourNext' && e.ctrl === this.nextPlayer(p)) &&
      !(e.expires === 'throughTurnOf' && e.whoTurn === p &&
        (e.afterTurnsStarted === undefined || p.turnsStarted >= e.afterTurnsStarted)));
    for (const c of this.bf()) {
      c.meta.tempHaste = false;
      if (c.meta.canAttackDefender) c.meta.canAttackDefender = false;
      if (c.meta.cursedMirrorOriginal && c.meta.cursedMirrorTurn === this.turnNo) {
        c.def = c.meta.cursedMirrorOriginal;
        c.isCopyOf = null;
        delete c.meta.cursedMirrorOriginal;
        delete c.meta.cursedMirrorTurn;
      }
      if (c.meta.temporaryCopyTurn === this.turnNo && c.meta.characteristicOriginalDef) {
        c.def = c.meta.characteristicOriginalDef;
        c.isCopyOf = null;
        delete c.meta.characteristicOriginalDef;
        delete c.meta.temporaryCopyTurn;
      }
    }
    this.delayed = this.delayed.filter(d => d.expires !== 'eot');
    this.expireOwnTurnExilePermissions(p);
    // blitz / dash sacrifice already via delayed triggers at end step
    // "Until end of turn, you don't lose this mana" ends during cleanup.
    // Drop the retention allowance before the final pool-emptying event.
    this.expirePersistentMana();
    this.emptyPool();
    for (const q of this.players) q.tempReductions = [];
    this.recalc();
    await this.checkSBA();
    if (this.diplomacyEndTurn) this.diplomacyEndTurn(p);

    // ekstra potezi (Plea for Power i sl.)
    if (this.extraTurns && this.extraTurns.length && this.extraTurnDepth < 3) {
      const q = this.extraTurns.shift();
      if (q && !q.lost) {
        this.extraTurnDepth++;
        this.lg(`⏰ ${q.name} takes an EXTRA turn!`);
        this.turnPlayer = q;
        return;
      }
    }
    this.extraTurnDepth = 0;
    this.turnPlayer = this.nextPlayer(p);
  };

  G.mainPhase = async function (p) {
    let guard = 0;
    // Bacanje koje pukne (nema mete koju bot hoće, mana ne prođe) NE troši akciju,
    // pa bi ga bot pokušavao iznova do isteka guarda i pojeo si ostatak faze.
    // Zato ga pamtimo i ne nudimo ponovo u istoj fazi.
    const failed = new Set();
    const keyOf = e => e.card.iid + '|' + ((e.alt && (e.alt.name || e.alt.label)) || '');
    const actKeyOf = e => e.card.iid + '|act|' + ((e.ability && e.ability.label) ||
      (e.crew ? 'crew' : e.equip !== undefined ? 'equip' : e.cycling ? 'cycling' : ''));
    while (!this.gameOver && guard++ < 200) {
      await this.flushTriggers();
      await this.checkSBA();
      if (this.gameOver) return;
      // Trigger koji je na stack stigao mimo cast/activate putanje (npr. ETB
      // odigranog landa) mora dobiti pravi priority krug ODMAH. Bez ovoga je
      // visio na stacku, main prozor je izgledao "zaglavljeno" i rezolvirao se
      // tek klikom na Next phase — što je kršilo i pravila i UX.
      if (this.stack.length) {
        await this.priorityRound(p);
        if (this.gameOver) return;
        continue;
      }
      const casts = this.castableList(p).filter(e => !failed.has(keyOf(e)));
      const acts = this.activatableList(p).filter(e => !failed.has(actKeyOf(e)));
      const lands = this.playableLands(p);
      const act = await p.controller.decide(this, {
        type: 'main', player: p, casts, acts, lands, phase: this.phase,
      });
      if (!act || act.kind === 'done') break;
      const ok = await this.performAction(p, act);
      if (ok === false && act.kind === 'cast') failed.add(keyOf(act));
      // Aktivacija koja tiho pukne (npr. loyalty već potrošen) isto ne smije
      // vrtiti guard petlju do isteka — ne nudi se ponovo u istoj fazi.
      if (ok === false && act.kind === 'activate' && act.entry) failed.add(actKeyOf(act.entry));
      // after each action, give others a priority window via stack (castSpell already does)
      if (this.gameOver) return;
    }
    // end-of-phase: others may act at "end of main"? skip — combat gives windows
    this.emptyPool();
  };

  // ============================================================
  // Combat
  // ============================================================
  G.chooseAttackingDestination = async function (ctrl, restrictedDefender, token, sourceLabel) {
    const defenders = restrictedDefender
      ? [restrictedDefender]
      : this.players.filter(player => player !== ctrl && !player.lost);
    let candidates = [];
    for (const defender of defenders) {
      if (!defender || defender.lost || defender === ctrl) continue;
      candidates.push(defender);
      candidates.push(...this.bf().filter(card => card.ctrl === defender && card.is('Planeswalker')));
    }
    // Ovi tokeni nisu proglašeni kao napadači (CR 508.4), pa declaration-only
    // zabrane i porezi ne ograničavaju odredište koje njihov efekat dopušta.
    if (!candidates.length) return restrictedDefender || null;
    if (candidates.length === 1) return candidates[0];
    const options = candidates.map((target, index) => ({
      key: String(index),
      label: target instanceof MTG.Player ? target.name : `${target.name} (${target.ctrl.name})`,
      target,
    }));
    const key = await ctrl.controller.decide(this, {
      type: 'chooseOption',
      prompt: `${sourceLabel || token && token.name || 'Token'}: who does the token attack?`,
      options,
      aiHint: { kind: 'attackDestination', token, restrictedDefender },
    });
    const chosen = options.find(option => option.key === String(key));
    return chosen ? chosen.target : candidates[0];
  };

  G.combatPhase = async function (p) {
    this.phase = 'combat'; this.step = 'begin';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    this.combat = { attackers: [], defenders: new Map() };
    await this.emit('beginCombat', { player: p });
    await this.flushTriggers();
    await this.priorityRound(p);
    if (this.gameOver) { this.combat = null; return; }

    // eligible attackers
    this.recalc();
    const elig = this.creatures(p).filter(c =>
      !c.tapped && (!c.sick || c.kw('haste')) && !c.cur.cantAttack && this.canAttackAtAll(c));
    const oppList = p.opponents(this);
    if (!elig.length || !oppList.length) {
      // CR 506.1/511.1: end of combat korak se dešava i kad niko ne napada —
      // "at end of combat" odgođeni efekti moraju dobiti priliku.
      await this.endCombatStep(p);
      return;
    }
    this.step = 'attackers';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    // forced attackers
    const forced = elig.filter(c => c.cur.mustAttack || c.def.mustAttack || this.isForcedToAttack(c));
    const attackTargets = oppList.concat(this.bf().filter(card => card.is('Planeswalker') && card.ctrl !== p));
    const declared = await p.controller.decide(this, {
      type: 'attackers', eligible: elig, opponents: oppList, attackTargets, forced,
    });
    const decl = Array.isArray(declared) ? declared : [];
    // decl: [{card, target(Player or planeswalker CardInst)}]
    const declarationTargets = c => this.legalDeclarationAttackTargets(c);
    const cantAttackTarget = (c, tgt) => !declarationTargets(c).includes(tgt);
    const attackers = [];
    for (const a of decl) {
      const c = a.card;
      if (!elig.includes(c)) continue;
      let tgt = a.target;
      if (this.diplomacyAttackBlocked && this.diplomacyAttackBlocked(p, tgt)) {
        const alternatives = declarationTargets(c).filter(target => !this.diplomacyAttackBlocked(p, target));
        if (alternatives.length) {
          this.lg(`${c.name} honors a diplomacy agreement and attacks ${alternatives[0].name} instead.`, 'diplomacy');
          tgt = alternatives[0];
        } else if (forced.includes(c)) {
          this.diplomacyVoidAttackPromise(p, tgt, 'a forced attack had no compliant defender');
        } else {
          this.lg(`${c.name} does not attack ${tgt.name} because of an active agreement.`, 'diplomacy');
          continue;
        }
      }
      if (cantAttackTarget(c, tgt)) {
        const others = declarationTargets(c).filter(o => o !== tgt);
        if (others.length) { this.lg(`${c.name} cannot attack ${tgt.name} — redirected.`); tgt = others[0]; }
        else { this.lg(`${c.name} cannot attack (restriction).`); continue; }
      }
      c.attacking = tgt;
      if (!c.kw('vigilance')) this.tap(c);
      attackers.push(c);
    }
    // "Pressure the leader" is an exact one-combat promise, not an alliance.
    // If the actor is able to keep it, one legal attacker is assigned. If no
    // creature can legally do so, the clause becomes void without blame.
    if (this.diplomacyRequiredAttackTarget) {
      const pressureTarget = this.diplomacyRequiredAttackTarget(p);
      const alreadyPressuring = pressureTarget && attackers.some(card =>
        (card.attacking instanceof MTG.Player ? card.attacking : card.attacking && card.attacking.ctrl) === pressureTarget);
      if (pressureTarget && !alreadyPressuring) {
        const candidates = elig.filter(card => this.canAttackTarget(card, pressureTarget) &&
          !(this.diplomacyAttackBlocked && this.diplomacyAttackBlocked(p, pressureTarget)))
          .sort((a, b) => (forced.includes(a) - forced.includes(b)) ||
            this.dmgAmount(a, 'normal') - this.dmgAmount(b, 'normal') || a.iid - b.iid);
        const chosen = candidates[0];
        if (chosen) {
          chosen.attacking = pressureTarget;
          if (!chosen.kw('vigilance') && !chosen.tapped) this.tap(chosen);
          if (!attackers.includes(chosen)) attackers.push(chosen);
          this.lg(`🤝 ${chosen.name} attacks ${pressureTarget.name} to fulfill a diplomacy agreement.`, 'diplomacy');
        } else this.diplomacyVoidAttackPromise(p, pressureTarget, 'no creature could legally attack the promised player');
      }
    }
    // forced but not declared → auto-declare vs random opp
    for (const c of forced) {
      if (!attackers.includes(c) && !c.tapped) {
        const magicLegal = declarationTargets(c);
        let legalOpps = this.diplomacyAttackBlocked
          ? magicLegal.filter(target => !this.diplomacyAttackBlocked(p, target))
          : magicLegal;
        if (!legalOpps.length && magicLegal.length) legalOpps = magicLegal;
        if (!legalOpps.length) continue;
        let tgt = legalOpps[Math.floor(this.rnd() * legalOpps.length)];
        if (this.diplomacyAttackBlocked && this.diplomacyAttackBlocked(p, tgt))
          this.diplomacyVoidAttackPromise(p, tgt, 'a forced attack had no compliant defender');
        c.attacking = tgt;
        if (!c.kw('vigilance')) this.tap(c);
        attackers.push(c);
        this.lg(`${c.name} must attack (${tgt.name}).`);
      }
    }
    // attack taxes (Propaganda)
    for (const c of attackers.slice()) {
      // "can't attack you unless..." štiti igrača, ne njegov planeswalker.
      const dp = c.attacking instanceof MTG.Player ? c.attacking : null;
      if (!dp) continue;
      let tax = 0;
      for (const b of this.bf()) if (b.ctrl === dp && b.def.attackTax) tax += b.def.attackTax;
      if (tax > 0) {
        const cost = { generic: tax, x: 0, pips: [] };
        const paid = this.canPayMana(p, cost) && await this.payMana(p, cost);
        if (!paid) {
          this.lg(`${c.name} does not attack — the tax (${tax}) was not paid.`);
          c.attacking = null; c.tapped = c.kw('vigilance') ? c.tapped : false;
          attackers.splice(attackers.indexOf(c), 1);
        } else {
          this.lg(`${U.playerVerb(p, 'pay', 'pays')} the ${tax} attack tax (${c.name}).`);
        }
      }
    }
    if (!attackers.length) { await this.endCombatStep(p); return; }
    this.combat.attackers = attackers;
    // statici uslovljeni napadom (Berserkers' Onslaught: "attacking creatures you
    // control have double strike") moraju biti aktivni PRIJE anyFS provjere i
    // prije nanošenja štete — inače se čita zastarjeli keyword set.
    this.recalc();
    for (const c of attackers) {
      const tname = c.attacking instanceof MTG.Player ? c.attacking.name : (c.attacking && c.attacking.name);
      this.lg(`⚔️ ${c.name} attacks → ${tname}.`, 'attack');
      const dp = c.attacking instanceof MTG.Player ? c.attacking : (c.attacking && c.attacking.ctrl);
      if (dp) { dp.lastAttackers = dp.lastAttackers || new Set(); dp.lastAttackers.add(p); }
    }
    this.note('combat', {});
    await this.pace(p.isAI ? 1200 : 250);
    await this.reviewCombatWithHuman({ attackingPlayer: p, attackers: attackers.slice() });
    if (this.gameOver) { this.combat = null; return; }
    // REFLEKTOR: bot napada baš tebe
    {
      const hu = this.human();
      if (p.isAI && hu) {
        const mine = attackers.filter(c => c.attacking === hu || (c.attacking && c.attacking.ctrl === hu));
        if (mine.length) {
          const pw = mine.reduce((s, c) => s + (c.cur ? c.cur.power : 0), 0);
          await this.spotlight(
            `⚔️ ${p.name} attacks YOU OR YOUR PLANESWALKER — ${mine.length} ${mine.length === 1 ? 'creature' : 'creatures'} (${pw} damage): ${mine.map(c => c.name).slice(0, 4).join(', ')}`,
            { kind: 'danger', ms: 1800 });
        }
      }
    }
    // attack triggers
    for (const c of attackers) {
      await this.emit('attacks', { card: c, player: p, defender: c.attacking });
      c.ctrl.turnState.attacked = true;
      c.ctrl.turnState.attackedCount = (c.ctrl.turnState.attackedCount || 0) + 1;
      if (c.attacking instanceof MTG.Player) {
        c.attacking.turnState.attackedMe.push(p);
        // trajna "grudge" memorija — ko me je napadao (za AI persone i threat)
        c.attacking.grudges = c.attacking.grudges || {};
        c.attacking.grudges[p.idx] = (c.attacking.grudges[p.idx] || 0) + 1;
      }
    }
    for (const defender of [...new Set(attackers.map(card => card.attacking)
      .filter(target => target instanceof MTG.Player))]) {
      await this.emit('attackedPlayer', {
        player: p, defender,
        attackers: attackers.filter(card => card.attacking === defender),
      });
    }
    if (attackers.some(card => card.commander)) p.turnState.attackedWithCommander = true;
    await this.emit('attackersDeclared', { player: p, attackers });
    // MYRIAD — "Whenever this creature attacks, for each opponent other than the
    // one it's attacking, you may create a tapped token copy attacking that player.
    // Exile those tokens at end of combat." (čišćenje već postoji: meta.exileEndCombat)
    // Kopije se prave TEK nakon attackersDeclared i ne dobijaju svoje 'attacks'
    // okidače — nisu deklarisani napadači (CR 506.3c). Iteriramo snimak jer
    // makeTokens gura kopije u isti `attackers` niz.
    for (const c of attackers.slice()) {
      if (!c.kw('myriad')) continue;
      const tgt = c.attacking instanceof MTG.Player ? c.attacking : (c.attacking && c.attacking.ctrl);
      const others = this.players.filter(o => o !== p && !o.lost && o !== tgt);
      if (!others.length) continue;
      const hit = [];
      for (const opp of others) {
        const go = (await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Myriad (${c.name}): create a copy for ${opp.name}?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: { kind: 'myriadCopy', src: c, opponent: opp },
        })) === 'yes';
        if (!go) continue;
        const made = await this.copyPermanentToken(c, p, {
          tapped: true,
          attacking: opp,
          chooseAttacking: (game, token) => game.chooseAttackingDestination(p, opp, token, `Myriad — ${c.name}`),
        });
        for (const m of made) m.meta.exileEndCombat = true;
        if (made.length) hit.push(opp.name);
      }
      if (hit.length) this.lg(`${c.name}: myriad — kopije napadaju ${hit.join(', ')}.`, 'attack');
    }
    await this.flushTriggers();
    await this.priorityRound(p);
    if (this.gameOver) { this.combat = null; return; }

    // blockers per defending player
    this.step = 'blockers';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    const byDefender = new Map();
    for (const c of this.combat.attackers) {
      if (!(c.attacking instanceof MTG.Player)) {
        const pw = c.attacking;
        const dp = pw && pw.ctrl;
        if (dp) { if (!byDefender.has(dp)) byDefender.set(dp, []); byDefender.get(dp).push(c); }
        continue;
      }
      if (!byDefender.has(c.attacking)) byDefender.set(c.attacking, []);
      byDefender.get(c.attacking).push(c);
    }
    for (const [dp, atks] of byDefender) {
      if (dp.lost) continue;
      const potential = this.creatures(dp).filter(b => !b.tapped && !b.cur.cantBlock);
      if (!potential.length) continue;
      // Odric: napadač bira blokove umjesto branioca. Čovjek dobije izbor;
      // AI bira "bez blokova", što je za napadača praktično uvijek ispravno.
      const chooser = this.untilEffects.find(e => e.kind === 'chooseBlocksFor' && e.who !== dp);
      let blocks;
      if (chooser) {
        this.lg(`${chooser.who.name} chooses blockers for ${dp.name} (Odric).`);
        blocks = chooser.who.isAI ? [] : await chooser.who.controller.decide(this, {
          type: 'blockers', attackers: atks, potential, player: dp, chosenByAttacker: true,
        });
      } else {
        blocks = await dp.controller.decide(this, {
          type: 'blockers', attackers: atks, potential, player: dp,
        });
      }
      // blocks: [{blocker, attacker}]
      for (const b of blocks) {
        if (!this.canBlock(b.blocker, b.attacker)) continue;
        b.blocker.blocking = b.attacker.iid;
        b.attacker.blockedBy.push(b.blocker);
      }
      // menace validation: if attacker with menace has exactly 1 blocker → illegal, drop
      for (const a of atks) {
        if (a.kw('menace') && a.blockedBy.length === 1) {
          const b = a.blockedBy[0]; b.blocking = null; a.blockedBy = [];
          this.lg(`${a.name} has menace — one blocker is not enough.`);
        }
      }
      // CR 509.1h: jednom blokiran — uvijek blokiran. Ostaje blokiran i ako mu
      // svi blokeri kasnije nestanu (ubijeni first strikeom, bounceovani…),
      // pa u tom slučaju ne nanosi štetu igraču (osim ako ima trample).
      for (const a of atks) if (a.blockedBy.length) a.wasBlocked = true;
    }
    for (const a of this.combat.attackers) {
      if (a.blockedBy.length) this.lg(`🛡️ ${a.name} blokiran: ${a.blockedBy.map(b => b.name).join(', ')}.`, 'block');
    }
    this.note('combat', {});
    if (this.combat.attackers.some(a => a.blockedBy.length)) await this.pace(900);
    // REFLEKTOR: bot je blokirao TVOJE napadače
    {
      const hu = this.human();
      if (hu) {
        const mine = this.combat.attackers.filter(a => a.ctrl === hu && a.blockedBy.length);
        if (mine.length) {
          await this.spotlight(
            `🛡️ Botovi blokiraju tvoj napad: ${mine.map(a => `${a.name} ← ${a.blockedBy.map(b => b.name).join(' + ')}`).slice(0, 3).join(' · ')}`,
            { kind: 'warn', ms: 1700 });
        }
      }
    }
    for (const a of this.combat.attackers) {
      for (const b of a.blockedBy) await this.emit('blocks', { blocker: b, attacker: a });
      if (a.blockedBy.length) await this.emit('becomesBlocked', { attacker: a, blockers: a.blockedBy });
    }
    await this.emit('blockersDeclared', { player: p, attackers: this.combat.attackers });
    await this.flushTriggers();
    await this.priorityRound(p);
    if (this.gameOver) { this.combat = null; return; }

    // damage: first strike round then normal
    const anyFS = this.combat.attackers.some(c => c.kw('first strike') || c.kw('double strike')) ||
      this.combat.attackers.some(a => a.blockedBy.some(b => b.kw('first strike') || b.kw('double strike')));
    if (anyFS) {
      await this.combatDamage(p, 'first');
      await this.checkSBA();
      await this.flushTriggers();
      await this.priorityRound(p);
      if (this.gameOver) { this.combat = null; return; }
    }
    await this.combatDamage(p, 'normal');
    await this.checkSBA();
    await this.flushTriggers();
    await this.priorityRound(p);

    // end of combat
    await this.endCombatStep(p);
  };

  // CR 511: end of combat korak. Poziva se i kad borbe nije ni bilo, jer
  // "at end of combat" odgođeni efekti moraju okinuti u svakom slučaju.
  G.endCombatStep = async function (p) {
    this.step = 'endCombat';
    await this.emit('endCombat', { player: p });
    // myriad tokens exile
    for (const c of this.bf()) {
      if (c.meta && c.meta.exileEndCombat) await this.exileCard(c);
    }
    await this.flushTriggers();
    if (!this.gameOver) await this.priorityRound(p);   // CR 511.3
    this.delayed = this.delayed.filter(effect => effect.expires !== 'combat');
    for (const c of this.bf()) { c.attacking = null; c.blocking = null; c.blockedBy = []; c.wasBlocked = false; c.meta._dealtFirstStrike = false; }
    this.combat = null;
    this.step = '';
    if (this.diplomacyAfterCombat) this.diplomacyAfterCombat(p);
  };

  G.canAttackAtAll = function (c) {
    if (c.kw('defender')) {
      if (c.meta.canAttackDefender || c.cur.defenderCanAttack) return true;
      if (c.def.canAttackRevenge &&
        ((c.ctrl.prevAttackers && c.ctrl.prevAttackers.size > 0) ||
         (c.ctrl.lastAttackers && c.ctrl.lastAttackers.size > 0))) return true;
      return false;
    }
    return true;
  };

  // Zajednički rules validator za UI, live combat i AI generator. AI ne
  // duplira Ghostly Prison/Queen Mother/card-specific zabrane.
  G.canAttackTarget = function (c, target) {
    const legalWithoutSpecificAttack = candidate => {
      if (!c || !candidate || c.ctrl === candidate || candidate.lost) return false;
      const defender = candidate instanceof MTG.Player ? candidate : candidate.ctrl;
      if (!defender || defender === c.ctrl || defender.lost) return false;
      if (!(candidate instanceof MTG.Player) && !(candidate instanceof MTG.CardInst && candidate.is('Planeswalker') && candidate.zone === 'battlefield')) return false;
      if (c.def.attackTargetRestriction && !c.def.attackTargetRestriction(this, c, candidate)) return false;
      for (const e of this.untilEffects) {
        if (candidate instanceof MTG.Player && e.kind === 'cantAttackPlayer' && e.who === c.ctrl && e.notPlayer === defender) return false;
        if (candidate instanceof MTG.Player && e.kind === 'cantAttackPlayerCard' && e.iid === c.iid && e.notPlayer === defender &&
          (e.timestamp === undefined || e.timestamp === c.timestamp) &&
          (!e.whileCounter || (c.counters[e.whileCounter] || 0) > 0)) return false;
      }
      if (candidate instanceof MTG.Player) for (const permanent of this.bf()) {
        if (permanent.ctrl === defender && permanent.def.protectsController && permanent.def.protectsController(this, permanent, c, defender)) return false;
      }
      return true;
    };
    if (!legalWithoutSpecificAttack(target)) return false;
    const forcedPlayer = c.meta && c.meta.mustAttackPlayer;
    if (forcedPlayer && target !== forcedPlayer && legalWithoutSpecificAttack(forcedPlayer)) return false;
    const forcedByEffect = this.untilEffects.find(e => e.kind === 'mustAttackPlayerCard' && e.iid === c.iid &&
      (e.timestamp === undefined || e.timestamp === c.timestamp) && e.targetPlayer && !e.targetPlayer.lost);
    if (forcedByEffect && target !== forcedByEffect.targetPlayer && legalWithoutSpecificAttack(forcedByEffect.targetPlayer)) return false;
    return true;
  };

  G.legalAttackTargets = function (c) {
    const players = c.ctrl.opponents(this);
    const planeswalkers = this.bf().filter(card => card.is('Planeswalker') && card.ctrl !== c.ctrl);
    return players.concat(planeswalkers).filter(target => this.canAttackTarget(c, target));
  };

  // Goad zahtijeva napad na drugog IGRAČA ako je to moguće; planeswalker
  // goadera nije prečica za ispunjavanje tog zahtjeva.
  G.legalDeclarationAttackTargets = function (c) {
    const targets = this.legalAttackTargets(c);
    if (!this.isForcedAttackOther(c)) return targets;
    const except = this.forcedVictimException(c);
    const otherPlayers = targets.filter(target => target instanceof MTG.Player && target !== except);
    return otherPlayers.length ? otherPlayers : targets;
  };

  // Goad se u ovom kodu bilježi na tri načina: untilEffects (E.goad), trajni
  // meta.goadedBy (jednokratni efekti) i cur.goadedBy koji statik opreme obnavlja
  // svakim recalcom (pa nestane čim se oprema skine). Svi se čitaju kroz ovo.
  G.goadersOf = function (c) {
    const out = [];
    if (c.meta && c.meta.goadedBy) out.push(...c.meta.goadedBy);
    if (c.cur && c.cur.goadedBy) out.push(...c.cur.goadedBy);
    return out.filter(Boolean);
  };

  G.isForcedToAttack = function (c) {
    if (c.cur && c.cur.mustAttack) return true;
    if (c.def.mustAttack) return true;
    if (c.meta && c.meta.mustAttackTurn === this.turnNo) return true;
    if (c.meta && c.meta.mustAttackPlayer && this.canAttackTarget(c, c.meta.mustAttackPlayer)) return true;
    if (this.goadersOf(c).length) return true;
    for (const e of this.untilEffects) {
      if (e.kind === 'mustAttack' && e.who === c.ctrl) return true;
      if (e.kind === 'mustAttackPlayerCard' && e.iid === c.iid &&
        (e.timestamp === undefined || e.timestamp === c.timestamp) && e.targetPlayer &&
        this.canAttackTarget(c, e.targetPlayer)) return true;
      if (e.kind === 'goadCard' && e.iid === c.iid) return true;
    }
    return false;
  };
  G.isGoaded = function (c) {
    if (this.goadersOf(c).length) return true;
    return this.untilEffects.some(e => e.kind === 'goadCard' && e.iid === c.iid);
  };
  G.isForcedAttackOther = function (c) {
    for (const e of this.untilEffects) {
      if (e.kind === 'mustAttack' && e.who === c.ctrl && e.notPlayer) return true;
      if (e.kind === 'goadCard' && e.iid === c.iid && e.notPlayer) return true;
    }
    // Bez ovoga su Impetus/Redemption Arc/Bloodthirsty Blade tjerali na napad,
    // ali NE i "napadni nekog drugog" — pa je goadano stvorenje često udaralo
    // baš onoga ko ga je nahuškao.
    if (this.goadersOf(c).some(x => x !== c.ctrl)) return true;
    return false;
  };
  G.forcedVictimException = function (c) {
    for (const e of this.untilEffects) {
      if (e.kind === 'mustAttack' && e.who === c.ctrl && e.notPlayer) return e.notPlayer;
      if (e.kind === 'goadCard' && e.iid === c.iid && e.notPlayer) return e.notPlayer;
    }
    const g = this.goadersOf(c).find(x => x !== c.ctrl && !x.lost);
    return g || null;
  };

  G.canBlock = function (blocker, attacker) {
    if (blocker.tapped || blocker.cur.cantBlock) return false;
    if (this.isProtectedFrom(attacker, blocker)) return false;
    if (attacker.kw('flying') && !(blocker.kw('flying') || blocker.kw('reach'))) return false;
    if (attacker.kw('skulk') && blocker.power > attacker.power) return false;
    if (attacker.cur.unblockable) return false;
    if (attacker.kw('forestwalk') && this.lands(blocker.ctrl).some(l => l.hasSub('Forest'))) return false;
    // Sidar Kondo: opp creatures w/o flying/reach can't block power<=2
    for (const c of this.bf()) {
      if (c.def.sidarKondo && c.ctrl === attacker.ctrl && attacker.power <= 2 &&
        !(blocker.kw('flying') || blocker.kw('reach'))) return false;
      if (c.def.blockRestriction && !c.def.blockRestriction(this, blocker, attacker)) return false;
    }
    if (attacker.cur.cantBeBlockedBy && attacker.cur.cantBeBlockedBy(this, blocker)) return false;
    return true;
  };

  G.dmgAmount = function (c, step) {
    const ds = c.kw('double strike');
    const fs = c.kw('first strike');
    if (step === 'first' && !(fs || ds)) return 0;
    // CR 510.5: u normalnom koraku štetu nanosi svako ko je NIJE već nanio u
    // first strike koraku (plus double strikeri). Stvorenje koje je first strike
    // dobilo TEK nakon prvog koraka i dalje udara u normalnom.
    if (step === 'normal' && !ds && c.meta._dealtFirstStrike) return 0;
    let byT = c.cur.assignByToughness;
    // "during your turn" toughness assignment (Baldin, Felothar own-ctrl)
    for (const b of this.bf()) {
      if (b.def.toughnessCombatAll && this.turnPlayer === b.ctrl) byT = true;
      if (b.def.toughnessCombatYours && b.ctrl === c.ctrl) byT = true;
    }
    return Math.max(0, byT ? c.cur.toughness : c.cur.power);
  };

  G.combatDamage = async function (p, stepKind) {
    this.step = stepKind === 'first' ? 'firstStrike' : 'damage';
    const cmb = this.combat;
    if (!cmb) return;
    // CR 510.1/510.2: prvo se SVA borbena šteta rasporedi (dok su svi učesnici
    // još na stolu), pa se tek onda nanese ODJEDNOM. Bez toga bloker koji pogine
    // od napadača nikad ne uzvrati — blokiranje nikad ne bi bilo trade.
    const plan = [];   // {src, target, n, toPlayer}
    const playerHits = new Map();
    const dealt = [];  // ko je stvarno rasporedio štetu u ovom koraku (CR 510.5)
    for (const a of cmb.attackers.slice()) {
      if (a.zone !== 'battlefield' || a.attacking === null) continue;
      const amt = this.dmgAmount(a, stepKind);
      if (amt > 0) dealt.push(a);
      const blockers = a.blockedBy.filter(b => b.zone === 'battlefield');
      // nikad blokiran → udara branioca/planeswalkera
      if (!blockers.length && !a.wasBlocked) {
        if (amt > 0) {
          if (a.attacking instanceof MTG.Player) plan.push({ src: a, target: a.attacking, n: amt, toPlayer: true });
          else if (a.attacking && a.attacking.zone === 'battlefield') plan.push({ src: a, target: a.attacking, n: amt });
        }
        continue;
      }
      // CR 509.1h + 702.19c: blokiran je, ali su blokeri nestali. Bez tramplea
      // ne nanosi ništa; sa trampleom sve ide branioc.
      let rem = amt;
      if (blockers.length) {
        const ordered = blockers.slice().sort((x, y) => (x.cur.toughness - x.damage) - (y.cur.toughness - y.damage));
        for (let i = 0; i < ordered.length; i++) {
          const b = ordered[i];
          const lethal = a.kw('deathtouch') ? 1 : Math.max(1, b.cur.toughness - b.damage);
          let assign = (i === ordered.length - 1 && !a.kw('trample')) ? rem : Math.min(rem, lethal);
          if (a.kw('trample')) assign = Math.min(rem, lethal);
          if (assign > 0) plan.push({ src: a, target: b, n: assign });
          rem -= assign;
          if (rem <= 0) break;
        }
      }
      if (rem > 0 && a.kw('trample')) {
        if (a.attacking instanceof MTG.Player) plan.push({ src: a, target: a.attacking, n: rem, toPlayer: true });
        else if (a.attacking && a.attacking.zone === 'battlefield') plan.push({ src: a, target: a.attacking, n: rem });
      }
      // blokeri uzvraćaju — raspoređeno SADA, dok su svi još živi
      for (const b of blockers) {
        const bAmt = this.dmgAmount(b, stepKind);
        if (bAmt > 0) { plan.push({ src: b, target: a, n: bAmt }); dealt.push(b); }
      }
    }
    // CR 510.2: nanosi se sve odjednom — SBA tek nakon cijelog koraka
    for (const d of plan) {
      if (d.toPlayer) {
        const dealtN = await this.damagePlayer(d.src, d.target, d.n, { combat: true, deferSBA: true });
        if (dealtN > 0) {
          await this.emit('combatDamageToPlayer', { card: d.src, player: d.target, n: dealtN, step: stepKind });
          const hits = playerHits.get(d.target) || [];
          hits.push({ card: d.src, n: dealtN });
          playerHits.set(d.target, hits);
        }
      } else {
        await this.damageCreature(d.src, d.target, d.n, { combat: true, deferSBA: true });
      }
    }
    for (const [player, hits] of playerHits) {
      await this.emit('combatDamageGroupToPlayer', {
        player, hits, cards: hits.map(hit => hit.card), step: stepKind,
      });
    }
    // CR 510.5: ko je rasporedio štetu u first strike koraku ne radi to opet u normalnom
    if (stepKind === 'first') for (const c of dealt) c.meta._dealtFirstStrike = true;
    await this.checkSBA();
    await this.emit('combatDamageDone', { player: p, step: stepKind });
    await this.pace(600);
  };
})();
