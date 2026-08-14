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
      game.canPayMana(player, game.abilityManaCost(player, equipment, equipCostFor(equipment, target)), null,
        { artifactAbilityAlreadyUsed: equipment.is('Artifact') }));
  }

  function controlsCommander(game, player) {
    return game.bf().some(card => card.ctrl === player && card.commander);
  }

  function modePickFor(game, player, card) {
    const pick = card.def.modes && card.def.modes.pick || 1;
    return card.def.castCondBoth && controlsCommander(game, player) ? 2 : pick;
  }

  function manaOptionLabel(option) {
    if (option.ANY) return `${option.n || 1} manu bilo koje boje`;
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
      if (c.cur && c.cur.abilitiesDisabled) continue;
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
    let generic = cost.generic + (opts.xVal || 0) * (cost.x || 0);
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
      // option: skip this source
      const skip = tryCover(idx + 1, needPips, needGen, planAcc, artifactAbilityUsed);
      if (skip) return skip;
      // option: use source for one of its produce options
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
      return null;
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
          this.lg(`${forSpell && forSpell.card ? forSpell.card.name : 'Spell'}: izabrani mana izvori ne mogu platiti cijenu.`);
          return false;
        }
        sol = manual;
      }
    }
    // activate sources: plain producers first, converters (which consume mana) last.
    // Sva produkcija ulazi u pool; na kraju se CIJELA cijena skida iz poola.
    const steps = sol.plan.slice().sort((a, b) => (a.consume ? 1 : 0) - (b.consume ? 1 : 0));
    const genTotal0 = cost.generic + (opts.xVal || 0) * (cost.x || 0);
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
    const total = genTotal + cost.pips.length;
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
    if (cost.counter) this.addCounters(c, cost.counter, 1, true);
    if (cost.rmCounter) this.removeCounters(c, cost.rmCounter.kind || cost.rmCounter, cost.rmCounter.n || 1);
    if (s.m.oncePerTurn) c.meta['_mana_' + (s.m.key || 0)] = this.turnNo;
    if (s.m.onProduce) await s.m.onProduce(this, c, p, chosen, forSpell);
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
      }
    } else {
      for (const col of Object.keys(chosen)) {
        if (col === 'n') continue;
        p.pool[col] = (p.pool[col] || 0) + chosen[col];
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
        if (b.def.landTapHook) await b.def.landTapHook(this, b, c, p, chosen);
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
    cost.generic = Math.max(0, generic);
    // life component of alternative costs (Deep Analysis flashback)
    if (castOpts.lifeCost) cost.lifeCost = castOpts.lifeCost;
    return cost;
  };

  // ============================================================
  // What can a player do right now?
  // ============================================================
  G.canCastTiming = function (p, card, alt) {
    if (p.cantCastUntilTurnStart && p.turnsStarted < p.cantCastUntilTurnStart) return false;
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

  G.castableList = function (p) {
    // returns [{card, from, alt}] of spells p could cast now (mana-feasible)
    const out = [];
    const consider = (card, from, alt) => {
      if (card.is('Land')) return;
      if (card.meta && card.meta.playableCondition && !card.meta.playableCondition(this, p, card)) return;
      if (!this.canCastTiming(p, card, alt)) return;
      if (card.def.castCond && !card.def.castCond(this, p, card)) return;
      const castOpts = alt ? Object.assign({}, alt) : {};
      const cost = this.spellCost(p, card, castOpts);
      const xVal = cost.x ? (castOpts.xFixed !== undefined ? castOpts.xFixed : 0) : 0;
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
      if (ac && !alt) {
        if (ac.sacCreature && !this.creatures(p).some(c => this.canSacrifice(c))) return;
        if (ac.sacArtifactOrCreature && !this.bf().some(c => c.ctrl === p &&
          (c.is('Artifact') || c.is('Creature')) && this.canSacrifice(c))) return;
        if (ac.discard && p.hand.filter(c => c !== card).length < ac.discard) return;
      }
      // targets must exist — osim za X-spellove, gdje X (a time i legalne mete)
      // još nije izabran, pa bi provjera bila lažno negativna
      if (!cost.x) {
        const specs = this.spellTargetSpecs(card, castOpts);
        if (specs) {
          for (const spec of specs) {
            if (!spec.upTo && this.legalTargets(spec, card, p).length < (spec.count || 1)) return;
          }
        }
      }
      // CR 601.2b: modove smiješ birati samo ako za njih postoje legalne mete.
      // Bez ove provjere je bot nudio npr. "Choose two" karte sa samo jednim
      // igrivim modom, pa bi bacanje puklo tek nasred procesa.
      const md = card.def.modes;
      if (md && !castOpts.overloaded) {
        const effectivePick = modePickFor(this, p, card);
        const need = effectivePick === 'any' ? (md.min || 1) : effectivePick;
        let playable = 0;
        for (const m of md.list) {
          const ok = !m.targets || m.targets.every(s => s.upTo ||
            this.legalTargets(s, card, p).length >= (s.count || 1));
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
      // mayhem: baci iz groblja ako je odbačena ovaj potez
      if (d.mayhem && card.meta._discardedTurn === this.turnNo) {
        consider(card, 'graveyard', Object.assign({ mayhem: true, altCostStr: d.mayhem.cost }, d.mayhem));
      }
    }
    // exile zone plays (plot, Light Up the Stage, Theater, hideaway executed via effects granting)
    for (const card of p.exile) {
      if (card.meta && card.meta.plotted) consider(card, 'exile', { free: true, plotPlay: true, speed: 'sorcery' });
      if (card.meta && card.meta.playableUntil !== undefined) {
        if (card.meta.needsOppLost && !this.players.some(q => q !== p && q.turnState.lifeLost > 0)) continue;
        if (card.meta.playableUntil >= this.turnNo && (!card.meta.playableBy || card.meta.playableBy === p))
          consider(card, 'exile', card.meta.freePlay ? { free: true } : {});
        if (card.meta.playableUntil >= this.turnNo && (!card.meta.playableBy || card.meta.playableBy === p) &&
          !card.meta.freePlay && p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
          consider(card, 'exile', {
            free: true, bloodcaster: true, lifeCost: card.mv,
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
        if (!m || m.playableBy !== p || m.playableUntil === undefined) continue;
        if (m.playableUntil < this.turnNo) continue;
        consider(card, 'exile', Object.assign(
          m.freePlay ? { free: true } : {},
          m.anyColor ? { asThoughAnyColor: true } : {}));
        if (!m.freePlay && p.bloodcasterAlternative && p.bloodcasterAlternative.turn === this.turnNo && p.life > card.mv) {
          consider(card, 'exile', {
            free: true, bloodcaster: true, lifeCost: card.mv,
            asThoughAnyColor: !!m.anyColor,
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
      if (!card.is('Land') || !card.meta || card.meta.playableBy !== p || card.meta.playableUntil < this.turnNo) continue;
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

  G.spellTargetSpecs = function (card, castOpts) {
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
    if (typeof d.targets === 'function') return d.targets(this, card, castOpts);
    return d.targets || null;
  };

  G.applyDemonstrate = async function (p, so, card) {
    const yes = await p.controller.decide(this, {
      type: 'chooseOption', prompt: `Demonstrate: kopiraj ${card.name}? (izabrani protivnik takođe dobija kopiju)`,
      options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
      aiHint: { kind: 'freeCast', card },
    });
    if (yes !== 'yes') return false;
    const opponent = await MTG.E.chooseOpponent(this, p, {
      prompt: `Demonstrate — ko takođe kopira ${card.name}?`, goal: 'gift',
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
    const alt = opts.alt || null;
    const castOpts = alt ? Object.assign({}, alt) : {};
    // Interni card-scriptovi istorijski koriste i kraći top-level oblik
    // (`{free:true, exileAfter:true}`), dok UI legalne liste nose isto pod
    // `alt`. Normalizuj oba oblika u jednu autoritativnu cast putanju.
    for (const key of ['free', 'exileAfter', 'asThoughAnyColor', 'speed', 'flash', 'miracle']) {
      if (opts[key] !== undefined && castOpts[key] === undefined) castOpts[key] = opts[key];
    }
    const d = card.def;
    const cost = this.spellCost(p, card, castOpts);

    // X
    let xVal = 0;
    if (cost.x && !castOpts.free) {
      const maxX = this.maxAffordableX(p, cost, card);
      xVal = opts.xVal !== undefined ? opts.xVal : await p.controller.decide(this, {
        type: 'chooseX', min: 0, max: maxX, card, prompt: `X za ${card.name}?`,
        aiHint: { kind: 'chooseX', card },
      });
      xVal = Math.max(0, Math.min(xVal, maxX));
    }
    if (castOpts.free && opts.xVal !== undefined) xVal = opts.xVal;
    // X mora biti vidljiv filterima meta (npr. "target creature with mana value X")
    castOpts.xVal = xVal;

    // kicker
    let kicked = false;
    if (d.kicker && !castOpts.free) {
      const kCost = U.parseCost(d.kicker.cost);
      const combined = { generic: cost.generic + kCost.generic, x: cost.x, pips: cost.pips.concat(kCost.pips) };
      if (this.canPayMana(p, combined, { card }, { xVal })) {
        const yes = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Kicker ${d.kicker.cost} za ${card.name}?`,
          options: [{ key: 'yes', label: 'Da (kicked)' }, { key: 'no', label: 'Ne' }],
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
        const comb = { generic: cost.generic + rCost.generic * k, x: cost.x, pips: cost.pips.concat(Array(k).fill(rCost.pips).flat()) };
        if (this.canPayMana(p, comb, { card }, { xVal })) maxN = k; else break;
      }
      if (maxN > 0) {
        paidTimes = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: maxN, card,
          prompt: `${d.squad ? 'Squad' : 'Multikicker'} ${repCostStr} — koliko puta?`,
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
      const combined = { generic: cost.generic + oCost.generic, x: cost.x, pips: cost.pips.concat(oCost.pips) };
      if (this.canPayMana(p, combined, { card }, { xVal })) {
        const yes = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Offspring ${offspringCost} za ${card.name} (1/1 kopija)?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'offspring', card },
        });
        if (yes === 'yes') { offspring = true; cost.generic += oCost.generic; cost.pips = cost.pips.concat(oCost.pips); }
      }
    }

    // modes
    let mode = null;
    if (d.modes && !(castOpts.overloaded)) {
      const pickN = modePickFor(this, p, card);
      const opts2 = d.modes.list.map((m, i) => ({ key: String(i), label: m.label }));
      if (pickN === 1) {
        const k = await p.controller.decide(this, {
          type: 'chooseOption', prompt: `${card.name}: izaberi mod`, options: opts2,
          aiHint: { kind: 'mode', card },
        });
        mode = [parseInt(k, 10)];
      } else {
        const ks = await p.controller.decide(this, {
          type: 'chooseMulti', prompt: `${card.name}: izaberi ${pickN === 'any' ? 'bilo koji broj' : pickN} modova`,
          options: opts2, min: pickN === 'any' ? (d.modes.min || 1) : pickN, max: pickN === 'any' ? d.modes.list.length : pickN,
          repeats: d.modes.repeats, aiHint: { kind: 'modes', card },
        });
        mode = ks.map(k => parseInt(k, 10));
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
    let specs = this.spellTargetSpecs(card, castOpts);
    if (specs) {
      if (mode && d.modes) {
        specs = [];
        for (const mi of mode) if (d.modes.list[mi].targets) specs = specs.concat(d.modes.list[mi].targets);
      }
      so.targetSpecs = specs;
      const ctx = { g: this, src: card, you: p, so };
      const ok = await this.pickTargets(ctx, specs, card, p);
      if (!ok) { this.lg(`${card.name}: nema legalnih meta.`); return false; }
      so.targets = ctx.targets;
    } else if (mode && d.modes) {
      const specs2 = [];
      for (const mi of mode) if (d.modes.list[mi].targets) specs2.push(...d.modes.list[mi].targets);
      if (specs2.length) {
        so.targetSpecs = specs2;
        const ctx = { g: this, src: card, you: p, so };
        const ok = await this.pickTargets(ctx, specs2, card, p);
        if (!ok) { this.lg(`${card.name}: nema legalnih meta.`); return false; }
        so.targets = ctx.targets;
      }
    }

    // additional costs
    const ac = castOpts.adventure ? null : d.addlCost;
    const paidAddl = { sacd: [], discarded: [], life: 0 };
    if (ac && !castOpts.free) {
      if (ac.sacCreature || ac.sacArtifactOrCreature || ac.sacAnyCreatures) {
        const pool = this.bf().filter(c => c.ctrl === p &&
          (ac.sacCreature ? c.is('Creature') : ac.sacArtifactOrCreature ? (c.is('Artifact') || c.is('Creature')) : c.is('Creature')) &&
          this.canSacrifice(c));
        const min = ac.sacAnyCreatures ? 0 : 1;
        const max = ac.sacAnyCreatures ? pool.length : 1;
        const picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min, max, prompt: `${card.name}: žrtvuj (${min}-${max})`,
          aiHint: { kind: 'addlSac', card },
        });
        if (picked.length < min) return false;
        paidAddl.sacd = picked;
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
      if (ac.lifeX) {
        const thresholds = [...new Set(this.bf().filter(c => c.is('Creature'))
          .map(c => Math.max(0, c.toughness)).filter(n => n <= p.life))].sort((a, b) => a - b);
        const chosen = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: p.life, thresholds, src: card,
          prompt: `${card.name}: plati X života`, aiHint: { kind: ac.aiKind || 'lifeX', card },
        });
        paidAddl.life = Math.max(0, Math.min(Number(chosen) || 0, p.life));
      }
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
        type: 'chooseCards', from: avail, min: 0, max: maxDelve, prompt: `Delve: egzilaj iz groblja (do ${maxDelve})`,
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
      const ok = await this.payMana(p, cost, paySpell, { xVal, isSpell: true });
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
    so.grantedSunburstColors = 0;
    if (card.is('Artifact') && p.sunburstGrant && p.sunburstGrant.turn === this.turnNo) {
      so.grantedSunburstColors = (card.meta._payColors || []).length;
      p.sunburstGrant = null;
    }

    // pay additional
    so.sacdN = paidAddl.sacd.length;
    so.sacdSnaps = paidAddl.sacd.map(c => this.snapshot(c));
    so.discardedCards = paidAddl.discarded.slice();
    for (const c of paidAddl.sacd) await this.sacrifice(p, c);
    for (const c of paidAddl.discarded) await this.discard(p, [c]);
    if (paidAddl.life) await this.loseLife(p, paidAddl.life, card.name);
    so.additionalLifePaid = paidAddl.life;
    for (const c of delveExiled) await this.move(c, 'exile');
    for (const c of escapeExiled) await this.move(c, 'exile');

    // move card to stack
    this.remove(card);
    const fromZone = card.zone;
    card.faceDown = false;
    if (card.meta) delete card.meta.revealedTo;
    card.zone = 'stack';
    card.castMeta = {
      x: xVal, alt: castOpts, from: so.from, kicked, offspring,
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
    this.note('stack', {});
    this.lg(`${p.name} baca ${card.name}${xVal ? ` (X=${xVal})` : ''}${castOpts.free ? ' (besplatno)' : ''}${so.from === 'command' ? ' iz command zone' : ''}.`, 'cast');
    await this.pace(p.isAI ? 1000 : 150);

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
        this.lg(`${kind.icon} ${p.name} → ${card.name} (${kind.label}) cilja ${names.join(', ')}`, 'spot');
        await this.alertHuman({ card, by: p, targets: mine, kind, names, source: 'spell', ms: 1600 });
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
    // gravestorm (Follow the Bodies)
    if (d.gravestorm && !castOpts.free) {
      const gn = this.diedThisTurn.length;
      if (gn > 0) {
        this.lg(`Gravestorm ×${gn}!`, 'cast');
        for (let i = 0; i < gn; i++) await this.copySpell(so, p, { mayNewTargets: false });
      }
    }
    // demonstrate (Creative/Replication Technique)
    if (d.demonstrate && !castOpts.free && !so.isCopy) {
      await this.applyDemonstrate(p, so, card);
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

  G.maxAffordableX = function (p, cost, card, opts = {}) {
    for (let x = 20; x >= 0; x--) {
      if (this.canPayMana(p, cost, { card }, Object.assign({}, opts, { xVal: x }))) return x;
    }
    return 0;
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
        type: 'chooseOption', prompt: `Cascade: baci ${hit.name} besplatno?`,
        options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
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
    const copy = {
      kind: 'spell', card: so.card, ctrl, name: so.name + ' (kopija)', targets: so.targets.slice(),
      x: so.x, mode: so.mode, castOpts: so.castOpts, kicked: so.kicked, copyOf: so, isCopy: true,
      targetSpecs: so.targetSpecs || null,
    };
    // forceTarget: kopija ide na tačno određenu metu (Mirrorwing Dragon)
    if (opts.forceTarget) {
      copy.targets = so.targets.map(t => (Array.isArray(t) ? [opts.forceTarget] : opts.forceTarget));
      opts = Object.assign({}, opts, { mayNewTargets: false });
    }
    // new targets?
    if (opts.mayNewTargets && so.targets.length) {
      const specs = so.targetSpecs || this.spellTargetSpecs(so.card, so.castOpts || {});
      if (specs) {
        const redo = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Kopija ${so.name}: nove mete?`,
          options: [{ key: 'no', label: 'Iste mete' }, { key: 'yes', label: 'Nove mete' }],
          aiHint: { kind: 'newTargets', so },
        });
        if (redo === 'yes') {
          const ctx = { g: this, src: so.card, you: ctrl, so: copy };
          const ok = await this.pickTargets(ctx, specs, so.card, ctrl);
          if (ok) copy.targets = ctx.targets;
        }
      }
    }
    this.stack.push(copy);
    this.note('stack', {});
    this.notifyEffect(`📋 ${ctrl.name} kopira spell ${so.name}.`, { kind: 'spellCopy', spell: copy, player: ctrl });
    await this.emit('spellCopied', { so: copy, ctrl, isInstantSorcery: so.card.is('Instant') || so.card.is('Sorcery') });
    return copy;
  };

  G.copyStackAbility = async function (so, ctrl, opts = {}) {
    if (!so || (so.kind !== 'trigger' && so.kind !== 'ability')) return null;
    const copyCtx = Object.assign({}, so.ctx, { targets: (so.ctx.targets || []).slice(), you: ctrl });
    const copy = {
      kind: so.kind, name: `${so.name} (kopija)`, ctrl, ctx: copyCtx, run: so.run,
      targets: copyCtx.targets, srcCard: so.srcCard, targetSpecs: so.targetSpecs || null,
    };
    if (opts.mayNewTargets && copy.targetSpecs && copy.targets.length) {
      const choice = await ctrl.controller.decide(this, {
        type: 'chooseOption', prompt: `Kopija ${so.name}: nove mete?`,
        options: [{ key: 'no', label: 'Iste mete' }, { key: 'yes', label: 'Nove mete' }],
        aiHint: { kind: 'newTargets', so },
      });
      if (choice === 'yes') {
        const ok = await this.pickTargets(copyCtx, copy.targetSpecs, so.srcCard, ctrl);
        if (ok) copy.targets = copyCtx.targets;
      }
    }
    this.stack.push(copy);
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
    if (so.countered) { await this.move(card, 'graveyard'); return; }
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
                  type: 'chooseOption', prompt: `Rebound: baci ${card.name} besplatno?`,
                  options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
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
              options: [{ key: 'yes', label: 'Da, pohrani u Foundry' }, { key: 'no', label: 'Ne, u groblje' }],
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
      if (d.isPlayerAura && host instanceof MTG.Player) {
        await this.move(card, 'battlefield', enterOpts);
        card.meta.cursedPlayer = host;
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
        if (cost.sacCreature && !this.creatures(p).filter(x => (!cost.sacOther || x !== c) && this.canSacrifice(x)).length) return;
        if (cost.sac && !this.bf().some(x => x.ctrl === p && cost.sac(this, x, c) && this.canSacrifice(x))) return;
        if (cost.life && p.life <= cost.life) return;
        if (cost.discard && p.hand.length < cost.discard) return;
        if (cost.exileFromGY && p.graveyard.length < cost.exileFromGY) return;
        if (cost.rmCounter) {
          const kind = cost.rmCounter.kind || cost.rmCounter;
          const nn = cost.rmCounter.n || 1;
          if ((c.counters[kind] || 0) < nn) return;
        }
        if (cost.tapCreature && !this.creatures(p).some(x => x !== c && !x.tapped)) return;
        if (a.targets) {
          for (const spec of a.targets) {
            if (!spec.upTo && this.legalTargets(spec, c, p).length < (spec.count || 1)) return;
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
        .some(ability => !ability.manaAbilityOnly);
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
      if (c.ctrl === p || c.cur && c.cur.abilitiesDisabled) continue;
      const abs = c.def.opponentAbilities || [];
      abs.forEach((a, ai) => {
        if (a.sorcery && (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2'))) return;
        if (a.cond && !a.cond(this, c, p)) return;
        const cost = a.cost || {};
        if (cost.mana && !this.canPayMana(p, U.parseCost(typeof cost.mana === 'function' ? cost.mana(this, c) : cost.mana))) return;
        if (cost.life && p.life <= cost.life) return;
        if (a.targets && a.targets.some(spec => !spec.upTo && this.legalTargets(spec, c, p).length < (spec.count || 1))) return;
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
    if (entry.manaAbility) {
      const source = entry.manaSource;
      const cost = source.extraCost || {};
      if (!source || c.zone !== 'battlefield' || c.ctrl !== p || c.cur && c.cur.abilitiesDisabled) return false;
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
      this.lg(`${p.name} aktivira: ${c.name} — ${entry.label}.`, 'mana');
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
      this.stack.push({ kind: 'ability', name: `${c.name} — ${a.label || 'iz ruke'}`, ctrl: p, ctx, run: a.run, targets: [] });
      this.lg(`${p.name} aktivira: ${c.name} — ${a.label || 'iz ruke'}.`, 'activate');
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
          type: 'chooseX', min: 0, max: maxX, card: c, prompt: `X za cycling ${c.name}?`, aiHint: { kind: 'chooseX', card: c },
        });
        cost.generic += cycleX;
      }
      const ok = await this.payMana(p, cost);
      if (!ok) return false;
      this.remove(c); c.zone = 'graveyard'; p.graveyard.push(c);
      this.lg(`${p.name} cyclira ${c.name}.`);
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
      this.lg(`${p.name} plotuje ${c.name}.`);
      return true;
    }
    if (entry.suspend) {
      const ok = await this.payMana(p, U.parseCost(c.def.suspend.cost));
      if (!ok) return false;
      this.remove(c); c.zone = 'exile'; p.exile.push(c);
      c.meta = { suspended: c.def.suspend.n };
      this.lg(`${p.name} suspenduje ${c.name} (${c.def.suspend.n}).`);
      return true;
    }
    if (entry.equip) {
      const spec = equipTargetSpec(p);
      // Nudimo samo legalne ciljane mete čiju equip cijenu igrač može platiti.
      const cands = equipCandidates(this, c, p);
      if (!cands.length) return false;
      const tgt = uiTargets && uiTargets[0] || (await p.controller.decide(this, {
        type: 'chooseTargets', candidates: cands, min: 1, max: 1, prompt: `Equip ${c.name} na:`,
        aiHint: { kind: 'equipTarget', card: c },
      }))[0];
      if (!tgt || !cands.includes(tgt)) return false;
      const equipManaCost = this.abilityManaCost(p, c, equipCostFor(c, tgt));
      const ok = await this.payMana(p, equipManaCost, { card: c, isAbility: true }, {
        artifactAbilityAlreadyUsed: c.is('Artifact'),
      });
      if (!ok) return false;
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
      this.lg(`${p.name} aktivira: ${c.name} — Equip.`, 'activate');
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
    if (cost.tap) { if (c.tapped) return false; this.tap(c); }
    if (cost.untapSelf) { c.tapped = false; }
    if (resolvedManaCost) {
      const mc = resolvedManaCost;
      if (a.xCost) {
        const maxX = this.maxAffordableX(p, mc, c, { artifactAbilityAlreadyUsed: c.is('Artifact') });
        ctx.x = await p.controller.decide(this, {
          type: 'chooseX', min: 0, max: maxX, card: c,
          prompt: `X za ${c.name} — ${a.label || 'sposobnost'}?`, aiHint: { kind: 'chooseX', card: c },
        });
        ctx.x = Math.max(0, Math.min(Number(ctx.x) || 0, maxX));
      }
      // izvor sposobnosti se prosljeđuje da restrikcije mane mogu odlučiti
      // (Secluded Courtyard: „ili aktiviraj sposobnost stvorenja tog tipa")
      const ok = await this.payMana(p, mc, { card: c, isAbility: true }, {
        xVal: ctx.x || 0,
        artifactAbilityAlreadyUsed: c.is('Artifact'),
      });
      if (!ok) { if (cost.tap) c.tapped = false; return false; }
    }
    if (cost.life) await this.loseLife(p, cost.life, 'cost');
    if (cost.sacSelf) {
      if (!this.canSacrifice(c)) return false;
      ctx.sacdSelf = this.snapshot(c);
      await this.sacrifice(p, c);
    }
    if (cost.sacCreature || cost.sac) {
      const pool = this.bf().filter(x => x.ctrl === p &&
        (cost.sacCreature ? x.is('Creature') : cost.sac(this, x, c)) &&
        (!cost.sacOther || x !== c) && this.canSacrifice(x));
      const nsac = cost.sacN === 'X' ? null : (cost.sacN || 1);
      let picked;
      if (nsac === null) {
        picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: pool.length, prompt: `Žrtvuj (X):`, aiHint: { kind: 'sacX', src: c },
        });
        ctx.x = picked.length;
      } else {
        picked = await p.controller.decide(this, {
          type: 'chooseCards', from: pool, min: nsac, max: nsac, prompt: `Žrtvuj:`, aiHint: { kind: 'sacCost', src: c },
        });
        if (picked.length < nsac) { return false; }
      }
      ctx.sacd = picked.map(x => this.snapshot(x));
      for (const x of picked) await this.sacrifice(p, x);
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
        prompt: `Koliko karata odbacuješ za ${c.name}?`, aiHint: { kind: 'chooseX', card: c },
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
      const picked = await p.controller.decide(this, {
        type: 'chooseCards', from: p.graveyard, min: cost.exileFromGY, max: cost.exileFromGY, prompt: 'Egzilaj iz groblja:', aiHint: { kind: 'delve' },
      });
      for (const x of picked) await this.move(x, 'exile');
    }
    if (cost.counter) this.addCounters(c, cost.counter, 1, true);
    if (a.oncePerTurn) c.meta['_ab_' + entry.idx] = this.turnNo;
    // loyalty
    if (a.loyalty !== undefined) {
      if (c.meta._loyUsed === this.turnNo) return false;
      c.meta._loyUsed = this.turnNo;
      if (a.loyalty > 0) this.addCounters(c, 'loyalty', a.loyalty, true);
      else if (a.loyalty < 0) {
        if ((c.counters['loyalty'] || 0) < -a.loyalty) return false;
        this.removeCounters(c, 'loyalty', -a.loyalty);
      }
    }
    this.markAbilityActivated(p, c);
    this.lg(`${p.name} aktivira: ${c.name}${a.label ? ' — ' + a.label : ''}.`, 'activate');
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
        this.lg(`${kind.icon} ${p.name} → ${c.name}${a.label ? ' (' + a.label + ')' : ''} (${kind.label}) cilja ${names.join(', ')}`, 'spot');
        await this.alertHuman({
          card: c, by: p, targets: mine, kind, names, source: 'ability',
          abilityLabel: a.label || '', ms: 1400,
        });
      }
    }
    const so = {
      kind: 'ability', name: `${c.name}${a.label ? ' — ' + a.label : ''}`, ctrl: p,
      ctx, run: a.run, targets: ctx.targets, srcCard: c, targetSpecs: a.targets || null,
    };
    this.stack.push(so);
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
    normal: ['▶️', 1.6, 'Normalna — vidi se svaki potez bota'],
    slow: ['🐢', 2.6, 'Sporo — za pažljivo praćenje'],
    fast: ['⏩', 0.6, 'Brzo — za preskakanje'],
  };
  MTG.PRIO_MODES = [
    { key: 'end', icon: '🌙', short: 'END', label: 'Combat reakcije + prije mog poteza', desc: 'Staje u combatu kad imaš legalan odgovor i na end stepu igrača neposredno prije tebe. Protivničke nonland karte se uvijek pokažu.' },
    { key: 'combat', icon: '⚔️', short: 'COMBAT', label: 'Combat + end step', desc: 'Staje poslije napadača, blokera i first-strike štete, te na end stepu prije tvog poteza.' },
    { key: 'off', icon: '▶', short: 'AKCIJE', label: 'Samo obavezne akcije', desc: 'Bez praznih priority stopova; svaka protivnička nonland karta se ipak pokaže i čeka Proceed.' },
    { key: 'full', icon: '🎛️', short: 'FULL', label: 'Full control', desc: 'Staje na svakom priority prozoru kao za stolom na turniru.' },
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
  G.playLand = async function (p, card) {
    if (p.landsPlayed >= p.maxLands) return false;
    if (this.turnPlayer !== p || this.stack.length || (this.phase !== 'main1' && this.phase !== 'main2')) return false;
    p.landsPlayed++;
    const fromZone = card.zone;
    this.remove(card);
    card.zone = 'nowhere';
    this.lg(`${p.name} igra land: ${card.name}.`, 'land');
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
    this.turnNo++;
    p.turnsStarted++;
    this.diedThisTurn = [];
    this._trigsThisTurn = 0;
    this._extraCombats = 0;
    for (const q of this.players) q.turnState = q.freshTurnState();
    p.landsPlayed = 0; p.maxLands = 1;
    // Ko me napao u SVOM prošlom potezu (Weathered Sentinels i sl.). Set se ne
    // smije brisati na početku mog poteza — tada se baš i čita — nego se prebaci
    // u prevAttackers, a novi se puni tokom ovog kruga.
    p.prevAttackers = p.lastAttackers || new Set();
    p.lastAttackers = new Set();
    this.lg(`——— Potez ${this.turnNo}: ${p.name} ———`, 'turn');
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
    } else this.lg(`${p.name} preskače prvo vučenje (duel — CR 103.8).`);
    await this.emit('drawStep', { player: p });
    await this.flushTriggers();
    await this.priorityRound(p);
    this.emptyPool();          // CR 500.4
    if (this.gameOver) return;

    // MAIN 1
    this.phase = 'main1';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    await this.emit('precombatMain', { player: p });
    await this.flushTriggers();
    if (!p.lost) await this.mainPhase(p);
    if (this.gameOver) return;

    // COMBAT (+ moguće dodatne combat faze — Combat Celebrant, Take the Bait)
    // _extraCombats se NE resetuje ovdje: Seize the Day i sl. se bacaju u main1
    // i njihov dodatni combat bi bio pojeden. Reset ide na početak poteza.
    let combatGuard = 0;
    do {
      const wantExtra = this._extraCombats;
      if (!p.lost) await this.combatPhase(p);
      if (this.gameOver) return;
      if (this._extraCombats > wantExtra) { /* nova faza tražena tokom ove */ }
      if (this._extraCombats > 0) {
        this._extraCombats--;
        this.lg('⚔️ DODATNA combat faza!', 'attack');
        for (const c of this.bf()) if (c.ctrl === p && c.meta._untapExtra) { c.tapped = false; c.meta._untapExtra = false; }
      } else break;
    } while (combatGuard++ < 3);
    this.emptyPool();          // CR 500.4 — mana iz combata ne curi u main 2

    // MAIN 2
    this.phase = 'main2';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    await this.emit('postcombatMain', { player: p });
    await this.flushTriggers();
    if (!p.lost) await this.mainPhase(p);
    if (this.gameOver) return;

    // END STEP
    this.phase = 'end';
    this.note('phase', {});
    await this.pace(p.isAI ? 330 : 0);
    if (this.monarch === p && !p.lost) { this.lg(`👑📜 Monarh ${p.name} vuče kartu.`); await this.draw(p, 1); }
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
        type: 'chooseCards', from: p.hand, min: n, max: n, prompt: `Odbaci do ${maxHand} u ruci (${n})`,
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
    this.untilEffects = this.untilEffects.filter(e => e.expires !== 'eot' && !(e.expires === 'yourNext' && e.ctrl === this.nextPlayer(p)));
    for (const c of this.bf()) {
      c.meta.tempHaste = false;
      if (c.meta.canAttackDefender) c.meta.canAttackDefender = false;
      if (c.meta.cursedMirrorOriginal && c.meta.cursedMirrorTurn === this.turnNo) {
        c.def = c.meta.cursedMirrorOriginal;
        c.isCopyOf = null;
        delete c.meta.cursedMirrorOriginal;
        delete c.meta.cursedMirrorTurn;
      }
    }
    this.delayed = this.delayed.filter(d => d.expires !== 'eot');
    // blitz / dash sacrifice already via delayed triggers at end step
    this.emptyPool();
    for (const q of this.players) q.tempReductions = [];
    this.recalc();
    await this.checkSBA();

    // ekstra potezi (Plea for Power i sl.)
    if (this.extraTurns && this.extraTurns.length && this.extraTurnDepth < 3) {
      const q = this.extraTurns.shift();
      if (q && !q.lost) {
        this.extraTurnDepth++;
        this.lg(`⏰ ${q.name} igra EKSTRA potez!`);
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
    while (!this.gameOver && guard++ < 200) {
      await this.flushTriggers();
      await this.checkSBA();
      if (this.gameOver) return;
      const casts = this.castableList(p).filter(e => !failed.has(keyOf(e)));
      const acts = this.activatableList(p);
      const lands = this.playableLands(p);
      const act = await p.controller.decide(this, {
        type: 'main', player: p, casts, acts, lands, phase: this.phase,
      });
      if (!act || act.kind === 'done') break;
      const ok = await this.performAction(p, act);
      if (ok === false && act.kind === 'cast') failed.add(keyOf(act));
      // after each action, give others a priority window via stack (castSpell already does)
      if (this.gameOver) return;
    }
    // end-of-phase: others may act at "end of main"? skip — combat gives windows
    this.emptyPool();
  };

  // ============================================================
  // Combat
  // ============================================================
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
    const declared = await p.controller.decide(this, {
      type: 'attackers', eligible: elig, opponents: oppList, forced,
    });
    const decl = Array.isArray(declared) ? declared : [];
    // decl: [{card, target(player or pw iid)}]
    const cantAttackTarget = (c, tgt) => !this.canAttackTarget(c, tgt);
    const attackers = [];
    for (const a of decl) {
      const c = a.card;
      if (!elig.includes(c)) continue;
      let tgt = a.target;
      if (this.isForcedAttackOther(c) && tgt === this.forcedVictimException(c)) {
        const others = oppList.filter(o => o !== tgt);
        if (others.length) tgt = others[0];
      }
      if (cantAttackTarget(c, tgt)) {
        const others = oppList.filter(o => o !== tgt && !cantAttackTarget(c, o));
        if (others.length) { this.lg(`${c.name} ne smije napasti ${tgt.name} — preusmjeren.`); tgt = others[0]; }
        else { this.lg(`${c.name} ne smije napasti (ograničenje).`); continue; }
      }
      c.attacking = tgt;
      if (!c.kw('vigilance')) this.tap(c);
      attackers.push(c);
    }
    // forced but not declared → auto-declare vs random opp
    for (const c of forced) {
      if (!attackers.includes(c) && !c.tapped) {
        const legalOpps = oppList.filter(target => !cantAttackTarget(c, target));
        if (!legalOpps.length) continue;
        let tgt = legalOpps[Math.floor(this.rnd() * legalOpps.length)];
        if (this.isForcedAttackOther(c)) {
          const notme = legalOpps.filter(o => o !== this.forcedVictimException(c));
          if (notme.length) tgt = notme[0];
        }
        c.attacking = tgt;
        if (!c.kw('vigilance')) this.tap(c);
        attackers.push(c);
        this.lg(`${c.name} mora napasti (${tgt.name}).`);
      }
    }
    // attack taxes (Propaganda)
    for (const c of attackers.slice()) {
      const dp = c.attacking instanceof MTG.Player ? c.attacking : (c.attacking && c.attacking.ctrl);
      if (!dp) continue;
      let tax = 0;
      for (const b of this.bf()) if (b.ctrl === dp && b.def.attackTax) tax += b.def.attackTax;
      if (tax > 0) {
        const cost = { generic: tax, x: 0, pips: [] };
        const paid = this.canPayMana(p, cost) && await this.payMana(p, cost);
        if (!paid) {
          this.lg(`${c.name} ne napada — porez (${tax}) nije plaćen.`);
          c.attacking = null; c.tapped = c.kw('vigilance') ? c.tapped : false;
          attackers.splice(attackers.indexOf(c), 1);
        } else {
          this.lg(`${p.name} plaća porez ${tax} za napad (${c.name}).`);
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
      this.lg(`⚔️ ${c.name} napada → ${tname}.`, 'attack');
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
            `⚔️ ${p.name} napada TEBE — ${mine.length} ${U.plural(mine.length, 'stvorenje', 'stvorenja')} (${pw} štete): ${mine.map(c => c.name).slice(0, 4).join(', ')}`,
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
      let go = true;
      if (!p.isAI) {
        go = (await p.controller.decide(this, {
          type: 'chooseOption', prompt: `Myriad (${c.name}): napraviti kopije za ostale protivnike?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'optTrigger', src: c, name: 'Myriad' },
        })) === 'yes';
      }
      if (!go) continue;
      const hit = [];
      for (const opp of others) {
        const made = await this.copyPermanentToken(c, p, { tapped: true, attacking: opp });
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
        this.lg(`${chooser.who.name} bira blokove za ${dp.name} (Odric).`);
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
          this.lg(`${a.name} ima menace — jedan bloker nije dovoljan.`);
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
    for (const c of this.bf()) { c.attacking = null; c.blocking = null; c.blockedBy = []; c.wasBlocked = false; c.meta._dealtFirstStrike = false; }
    this.combat = null;
    this.step = '';
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
    if (!c || !target || c.ctrl === target || target.lost) return false;
    const defender = target instanceof MTG.Player ? target : target.ctrl;
    if (!defender || defender === c.ctrl || defender.lost) return false;
    if (!(target instanceof MTG.Player) && !(target instanceof MTG.CardInst && target.is('Planeswalker') && target.zone === 'battlefield')) return false;
    if (c.def.attackTargetRestriction && !c.def.attackTargetRestriction(this, c, target)) return false;
    for (const e of this.untilEffects) {
      if (e.kind === 'cantAttackPlayer' && e.who === c.ctrl && e.notPlayer === defender) return false;
      if (e.kind === 'cantAttackPlayerCard' && e.iid === c.iid && e.notPlayer === defender) return false;
    }
    for (const permanent of this.bf()) {
      if (permanent.ctrl === defender && permanent.def.protectsController && permanent.def.protectsController(this, permanent, c, defender)) return false;
    }
    return true;
  };

  G.legalAttackTargets = function (c) {
    const players = c.ctrl.opponents(this);
    const planeswalkers = this.bf().filter(card => card.is('Planeswalker') && card.ctrl !== c.ctrl);
    return players.concat(planeswalkers).filter(target => this.canAttackTarget(c, target));
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
    if (c.def.mustAttack) return true;
    if (this.goadersOf(c).length) return true;
    for (const e of this.untilEffects) {
      if (e.kind === 'mustAttack' && e.who === c.ctrl) return true;
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
