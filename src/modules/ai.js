// ===== ai.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Heuristic AI controller
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  // ============================================================
  // THREAT ASSESSMENT — ko je najveća prijetnja za stolom?
  // ============================================================
  MTG.threat = function (g, q, viewer) {
    // objektivni dio
    let board = 0, engines = 0;
    for (const c of g.bf()) {
      if (c.ctrl !== q) continue;
      if (c.is('Creature')) {
        board += Math.max(0, c.power) * 0.9 + Math.max(0, c.toughness) * 0.2;
        if (c.kw('flying') || c.kw('trample') || c.kw('menace')) board += 0.8;
        if (c.kw('double strike')) board += Math.max(0, c.power) * 0.8;
        if (c.commander) board += 3;
      }
      const o = (c.def.oracle || '').toLowerCase();
      if (/whenever|at the beginning/.test(o)) engines += 1.2;
      if (/draw/.test(o)) engines += 0.8;
      if (c.is('Planeswalker')) engines += 4;
      if (c.def.mana && !c.is('Land')) engines += 0.5;
    }
    const resources = q.hand.length * 0.55 + g.lands(q).length * 0.35;
    let winProx = 0;
    // blizina pobjede: veliki život + tabla, poison, charge reaktor, commander damage nekome
    if (q.life >= 45) winProx += 2;
    for (const c of g.bf()) {
      if (c.ctrl === q && c.name === 'Darksteel Reactor') winProx += Math.min(10, (c.counters['charge'] || 0) * 0.6);
    }
    for (const other of g.players) {
      if (other === q || other.lost) continue;
      if ((other.poison || 0) >= 6) winProx += 4;
      for (const [iid, dmg] of Object.entries(other.commanderDamage || {})) {
        const cmd = g.byIid(parseInt(iid, 10));
        if (cmd && cmd.owner === q && dmg >= 12) winProx += (dmg - 10) * 0.5;
      }
      if (other.life <= 8) winProx += 1; // neko je pri kraju — svi koji imaju tablu su opasniji
    }
    if (g.monarch === q) winProx += 1.5;
    let score = board + engines + resources + winProx + q.life * 0.05;
    // subjektivni dio (iz ugla posmatrača)
    if (viewer && viewer !== q) {
      for (const [iid, dmg] of Object.entries(viewer.commanderDamage || {})) {
        const cmd = g.byIid(parseInt(iid, 10));
        if (cmd && cmd.owner === q) score += dmg * 0.35; // njegov commander me već tuče
      }
      const grudge = (viewer.grudges || {})[q.idx] || 0;
      score += Math.min(4, grudge * 0.8); // pamtim ko me napadao
    }
    return score;
  };
  MTG.threatTable = function (g, viewer) {
    return g.alivePlayers()
      .map(q => ({ p: q, score: Math.round(MTG.threat(g, q, viewer) * 10) / 10 }))
      .sort((a, b) => b.score - a.score);
  };

  // ============================================================
  // AI PERSONE — stilovi ponašanja botova
  // ============================================================
  const PERSONAS = {
    aggressive: {
      label: 'Aggressive', icon: '🗡️',
      atkThr: -0.6,        // napada i u lošim razmjenama
      atkRnd: 0.55,        // šansa da napadne i na graničnom skoru
      blockThr: 1.6,       // nerado blokira — čuva napadače
      lowLifeHunt: 2.2,    // juri igrače sa malo života
      focusLeader: 0.8,    // dijelom juri lidera
      castCreature: 0.9, castDamage: 0.9, castDefense: -0.6, castPolitics: 0,
      wipeBias: -1.5,      // ne voli wipe (ubija i njegove)
      counterBias: -0.5,
    },
    opportunist: {
      label: 'Opportunist', icon: '🦅',
      // Zamjena za Pregovarača, koji se preklapao sa Uravnoteženim i nije
      // imao putanju do pobjede. Strvinar je mehanički njegova suprotnost:
      // pušta najjačeg da bježi i navaljuje na svakoga ko posrne.
      atkThr: 0.15, atkRnd: 0.4,
      blockThr: 0.9,       // radije čuva napadače nego što blokira
      lowLifeHunt: 3.2,    // definišuća osobina — kljuca ranjene
      focusLeader: -1.2,   // AKTIVNO izbjegava najveću prijetnju
      castCreature: 0.4, castDamage: 1.0, castDefense: -0.2, castPolitics: 0.2,
      wipeBias: -1.2,      // wipe bi mu pobrisao vlastite napadače
      counterBias: -0.2,
    },
    passive: {
      label: 'Defensive', icon: '🛡️',
      atkThr: 2.4, atkRnd: 0.05,
      blockThr: -1.2,      // rado blokira
      lowLifeHunt: 0.5, focusLeader: 0.5,
      keepBlockers: true,  // ne šalje sve u napad
      castCreature: 0.2, castDamage: -0.3, castDefense: 1.0, castPolitics: 0.2,
      wipeBias: 1.5, counterBias: 0.6,
    },
    teaser: {
      label: 'Provocateur', icon: '🃏',
      atkThr: 0.2, atkRnd: 0.45,
      blockThr: 0.8,
      lowLifeHunt: 0.8, focusLeader: 1.2,
      chaos: true,         // nasumično mijenja mete, bocka sve pomalo
      castCreature: 0.3, castDamage: 0.3, castDefense: 0, castPolitics: 1.6,
      wipeBias: 0.5, counterBias: 0.2,
    },
    balanced: {
      label: 'Balanced', icon: '⚖️',
      atkThr: 0.6, atkRnd: 0.3, blockThr: 0,
      lowLifeHunt: 1.2, focusLeader: 1.5,
      castCreature: 0, castDamage: 0, castDefense: 0, castPolitics: 0.3,
      wipeBias: 0, counterBias: 0,
    },
  };
  MTG.AI_STYLES = PERSONAS;

  class AIController {
    constructor(player, opts = {}) {
      this.p = player;
      this.difficulty = opts.difficulty === 'tough' ? 'hard' : (opts.difficulty || 'normal'); // easy | normal | hard
      this.style = PERSONAS[opts.style] ? opts.style : 'balanced';
      this.persona = PERSONAS[this.style];
      player.aiStyle = this.style;
      this.rnd = null;
    }
    r(g) { return g.rnd(); }

    // ---------- evaluation ----------
    cardValue(g, c) {
      // heuristic value of a card (for casting priority / discards)
      const d = c.def;
      let v = U.mv(d.cost || '') * 1.1;
      if (d.aiValue) v += d.aiValue;
      if (c.is('Land')) v = 1;
      if (c.is('Creature')) v += (parseInt(d.power || '0', 10) || 0) * 0.4 + (parseInt(d.toughness || '0', 10) || 0) * 0.25;
      const o = (d.oracle || '').toLowerCase();
      if (/draw (a|two|three|x|cards)/.test(o)) v += 1.6;
      if (/destroy target|exile target|deals? \d+ damage to (any target|target creature)/.test(o)) v += 1.4;
      if (/destroy all|each creature/.test(o)) v += 1.2;
      if (/create .*token/.test(o)) v += 1;
      if (/search your library/.test(o)) v += 1.2;
      if (/add \{|treasure/.test(o)) v += 0.8;
      if (c.commander) v += 3;
      return v;
    }

    permThreat(g, c) {
      // threat score of a permanent on battlefield
      let v = 0;
      if (c.is('Creature')) {
        // Koliko stvorenje STVARNO udara: pod Felotharom (i sličnima) šteta ide
        // po žilavosti, pa je procjena po snazi grubo potcjenjivala takve table
        // i AI ih nije napadao. dmgAmount poštuje assignByToughness.
        let hit = Math.max(0, c.power);
        try { hit = Math.max(hit, g.dmgAmount(c, 'normal')); } catch (e) { /* van borbe */ }
        v += hit * 1.1 + Math.max(0, c.toughness) * 0.3;
        if (c.kw('flying')) v += 1.2;
        if (c.kw('trample')) v += 1;
        if (c.kw('deathtouch')) v += 1;
        if (c.kw('lifelink')) v += 1;
        if (c.kw('double strike')) v += Math.max(0, c.power);
        if (c.commander) v += 4;
        v += (c.counters['+1/+1'] || 0) * 0.3;
      }
      const o = (c.def.oracle || '').toLowerCase();
      if (/whenever|at the beginning/.test(o)) v += 2;
      if (/draw/.test(o)) v += 1.5;
      if (c.is('Planeswalker')) v += 6;
      if (c.def.mana) v += 0.8;
      if (c.hasSub('Equipment')) v += 0.5;
      return v;
    }

    blightRecipientScore(g, card, n = 1) {
      const value = this.permThreat(g, card);
      const dies = card.toughness <= n;
      const oracle = (card.def.oracle || '').toLowerCase();
      const deathValue = /when(?:ever)? .*dies|when this creature dies|persist|undying/.test(oracle) ? 5 : 0;
      const tokenValue = card.isToken ? 3 : 0;
      const alreadyBlighted = (card.counters['-1/-1'] || 0) > 0 ? 1.5 : 0;
      return -value + deathValue + tokenValue + alreadyBlighted - (dies && !deathValue && !tokenValue ? 12 : 0);
    }

    counterRemovalScore(card, kind, n = 1) {
      const harmful = new Set(['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty']);
      const goodForController = !harmful.has(kind);
      return (card.ctrl === this.p ? (goodForController ? -1 : 1) : (goodForController ? 1 : -1)) * n;
    }

    playerThreat(g, q) {
      return MTG.threat(g, q, this.p);
    }

    biggestThreatOpp(g) {
      const opps = this.p.opponents(g);
      if (!opps.length) return null;
      return opps.slice().sort((a, b) => this.playerThreat(g, b) - this.playerThreat(g, a))[0];
    }

    // ---------- main decide ----------
    async decide(g, q) {
      if (MTG.chooseBotAction) {
        try {
          const prioritySessionKey = q.type === 'priority'
            ? `${g._prioritySessionId || 0}|${this.p.idx}` : null;
          if (prioritySessionKey && this._v2PrioritySessionUsed === prioritySessionKey) return { kind: 'pass' };
          const emptyPriorityKey = q.type === 'priority' && !g.stack.length
            ? `${g.turnNo}|${g.phase}|${g.step}|${this.p.idx}` : null;
          if (emptyPriorityKey && this._v2EmptyPriorityUsed === emptyPriorityKey) return { kind: 'pass' };
          this.lastV2Decision = await MTG.chooseBotAction({
            gameState: g,
            botPlayerId: this.p.idx,
            difficulty: this.difficulty,
            actionWindow: q,
          });
          const answer = MTG.unwrapBotDecisionAction(this.lastV2Decision.action);
          if (answer && answer.kind !== 'pass') {
            if (emptyPriorityKey) this._v2EmptyPriorityUsed = emptyPriorityKey;
            if (prioritySessionKey) this._v2PrioritySessionUsed = prioritySessionKey;
          }
          return answer;
        } catch (error) {
          // Stari kontroler je samo sigurnosni fallback i nikad ne zaobilazi
          // legalne liste koje mu je rules engine već dao.
          g.lg(`⚠️ AI V2 fallback (${this.p.name}): ${error.message}`, 'warn');
        }
      }
      switch (q.type) {
        case 'mulligan': return this.mulligan(g, q);
        case 'bottomCards': return this.bottomCards(g, q);
        case 'main': return this.mainAction(g, q);
        case 'priority': return this.priorityAction(g, q);
        case 'attackers': return this.attackers(g, q);
        case 'blockers': return this.blockers(g, q);
        case 'chooseTargets': return this.chooseTargets(g, q);
        case 'chooseCards': return this.chooseCards(g, q);
        case 'chooseOption': return this.chooseOption(g, q);
        case 'chooseMulti': return this.chooseMulti(g, q);
        case 'chooseX': return this.chooseX(g, q);
        case 'scry': return this.scry(g, q);
        case 'orderTriggers': return q.triggers.slice();
        default: return null;
      }
    }

    mulligan(g, q) {
      const lands = q.player.hand.filter(c => c.is('Land')).length;
      const mullsSoFar = q.mulls + (q.free ? 0 : 1);
      if (q.player.hand.length <= 5) return false;
      if (lands >= 2 && lands <= 5) return false;
      const cheap = q.player.hand.filter(c => !c.is('Land') && U.mv(c.def.cost || '') <= 2).length;
      if (lands === 1 && cheap >= 3 && q.player.hand.length <= 7 && !q.free) return false;
      return true;
    }

    bottomCards(g, q) {
      const p = q.player;
      const sorted = p.hand.slice().sort((a, b) => this.cardValue(g, a) - this.cardValue(g, b));
      // keep ~3 lands
      const lands = p.hand.filter(c => c.is('Land'));
      const out = [];
      for (const c of sorted) {
        if (out.length >= q.n) break;
        if (c.is('Land') && lands.filter(l => !out.includes(l)).length <= 3) continue;
        out.push(c);
      }
      let i = 0;
      while (out.length < q.n && i < sorted.length) { if (!out.includes(sorted[i])) out.push(sorted[i]); i++; }
      return out.slice(0, q.n);
    }

    mainAction(g, q) {
      const p = q.player;
      // 1. play a land
      if (q.lands.length) {
        const untappedFirst = q.lands.slice().sort((a, b) => {
          const at = typeof a.def.entersTapped === 'function' ? 1 : (a.def.entersTapped ? 1 : 0);
          const bt = typeof b.def.entersTapped === 'function' ? 1 : (b.def.entersTapped ? 1 : 0);
          const av = (a.def.producesColors || []).length + (at ? -0.5 : 0.5);
          const bv = (b.def.producesColors || []).length + (bt ? -0.5 : 0.5);
          return bv - av;
        });
        return { kind: 'land', card: untappedFirst[0] };
      }
      // 2. score castables
      const scored = [];
      for (const e of q.casts) {
        let v = this.castScore(g, e);
        if (v > 0) scored.push({ act: { kind: 'cast', card: e.card, alt: e.alt, from: e.from }, v });
      }
      for (const e of q.acts) {
        const v = this.activationScore(g, e);
        if (v > 0) scored.push({ act: { kind: 'activate', entry: e }, v });
      }
      if (!scored.length) return { kind: 'done' };
      scored.sort((a, b) => b.v - a.v);
      // small chance of suboptimal play on normal difficulty
      if (this.difficulty === 'normal' && scored.length > 1 && this.r(g) < 0.12) return scored[1].act;
      return scored[0].act;
    }

    castScore(g, e) {
      const c = e.card, p = this.p;
      const P = this.persona;
      let v = this.cardValue(g, c);
      const phase = g.phase;
      const myCreatures = g.creatures(p).length;
      const oppCreatures = g.bf().filter(x => x.is('Creature') && x.ctrl !== p).length;
      const o = (c.def.oracle || '').toLowerCase();
      // persona sklonosti
      if (c.is('Creature')) v += P.castCreature;
      if (/deals? \d+ damage|destroy target creature|exile target creature/.test(o)) v += P.castDamage;
      if (/gain.*life|hexproof|indestructible|prevent|defender|counter target/.test(o)) v += P.castDefense;
      if (/goad|vote|each opponent may|gain control|tempting|monarch|suspect/.test(o)) v += P.castPolitics;
      // hold instants for opponents' turns (unless sorcery-speed window only or big value)
      if ((c.is('Instant') || c.kw('flash')) && !e.alt) {
        if (/counter target spell/.test(o)) return -1; // never main-phase counterspells
        if (/destroy target|exile target|damage/.test(o) && this.r(g) < 0.7) v -= 2.5;
      }
      // board wipes: only when behind
      if (/destroy all creatures|deals? \d+ damage to each creature|13 damage/.test(o)) {
        const myPow = g.creatures(p).reduce((s, x) => s + x.power, 0);
        const oppPow = g.bf().filter(x => x.is('Creature') && x.ctrl !== p).reduce((s, x) => s + x.power, 0);
        if (oppPow < myPow + 6 - P.wipeBias * 2 || oppCreatures < 3) return -1;
        v += (oppPow - myPow) * 0.3 + P.wipeBias;
      }
      // removal needs a target worth it
      if (c.def.targets) {
        const specs = typeof c.def.targets === 'function' ? c.def.targets(g, c, e.alt || {}) : c.def.targets;
        let ok = true;
        for (const spec of specs) {
          const cands = g.legalTargets(spec, c, p);
          if (!cands.length && !spec.upTo) ok = false;
          if (spec.aiHint && spec.aiHint.goal === 'removal') {
            const best = Math.max(0, ...cands.filter(x => x instanceof MTG.CardInst && x.ctrl !== p).map(x => this.permThreat(g, x)));
            if (best < 4) v -= 3; else v += Math.min(4, best * 0.35);
          }
        }
        if (!ok) return -1;
      }
      // ramp early
      if (/search your library.*land|add \{/.test(o) && g.turnNo < 14) v += 2.2;
      if (c.def.mana && g.turnNo < 12) v += 1.6;
      // commander priority
      if (c.commander) v += 2.5;
      // curve: prefer spending most mana
      v += Math.min(U.mv(c.def.cost || ''), 6) * 0.25;
      // don't dump hand into empty board vs punisher? keep simple.
      return v;
    }

    activationScore(g, e) {
      const c = e.card;
      if (e.cycling) {
        // cycle lands/extra when flooded
        const lands = g.lands(this.p).length;
        if (c.is('Land') && lands >= 5) return 3;
        if (this.p.hand.length > 5 && this.r(g) < 0.3) return 1.5;
        return 0;
      }
      if (e.plot) return this.p.hand.length > 4 ? 1.2 : 0;
      if (e.suspend) return 1.5;
      if (e.equip) {
        const cands = g.creatures(this.p).filter(x => x.iid !== c.attachedTo);
        if (!cands.length) return 0;
        return c.attachedTo ? 0 : 2.5;
      }
      if (e.crew) {
        return g.phase === 'main1' && !c.is('Creature') ? 2.2 : 0;
      }
      const a = e.ability;
      if (!a) return 0;
      if (a.aiScore) return a.aiScore(g, c, this.p);
      if (a.loyalty !== undefined) return 3;
      const label = (a.label || '').toLowerCase();
      if (/mana|boja/.test(label)) return 0; // manu rješava solver
      // Utility zemlje i slično su ranije padale na default 0.8 i nikad nisu
      // bile odigrane jer ih je svako bacanje karte nadglasalo.
      let v;
      if (/vuci|draw|karta/.test(label)) v = 3.2;
      else if (/nađi|naci|traži|trazi|search|tutor|basic|forest|plains|island|swamp|mountain/.test(label)) v = 2.6;
      else if (/uništi|unisti|šteta|steta|fight|gubi|destroy|damage|exile|egzil/.test(label)) v = 2.4;
      else if (/token|vjeverica|squirrel|treasure|food|clue|human|spirit|soldier|wolf|\d\/\d/.test(label)) v = 2.3;
      else if (/monstrosity|level|counter|\+1\/\+1/.test(label)) v = 2.0;
      else if (/neblokiran|unblockable|double strike|deathtouch|lifelink|trample|flying|haste|vigilance|indestructible|hexproof|menace|\+\d/.test(label)) {
        // borbeni bonusi vrijede samo prije borbe
        v = g.phase === 'main1' ? 2.1 : 0.5;
      } else v = 0.9;
      // U drugoj glavnoj fazi neiskorištena mana ionako propada, pa su
      // aktivirane sposobnosti tada osjetno vrjednije od čekanja.
      if (g.phase === 'main2') v += 1.6;
      return v;
    }

    priorityAction(g, q) {
      const p = q.player;
      // respond only with instants/abilities when valuable
      const stackTop = g.stack[g.stack.length - 1];
      for (const e of q.casts) {
        const c = e.card;
        const o = (c.def.oracle || '').toLowerCase();
        if (/counter target spell/.test(o) && stackTop && stackTop.kind === 'spell' && stackTop.ctrl !== p) {
          const casterThreat = this.playerThreat(g, stackTop.ctrl);
          const isLeader = MTG.threatTable(g, p)[0] && MTG.threatTable(g, p)[0].p === stackTop.ctrl;
          const threat = U.mv(stackTop.card.def.cost || '') + (stackTop.card.commander ? 2 : 0) + (isLeader ? 1 : 0) + this.persona.counterBias;
          if (threat >= 4 || stackTop.targets.flat().some(t => t instanceof MTG.CardInst && t.ctrl === p)) {
            return { kind: 'cast', card: c, alt: e.alt, from: e.from };
          }
        }
        // removal in response: only vs commander-ish big stuff entering? keep simple: EOT before my turn
        if (g.phase === 'end' && g.nextPlayer(g.turnPlayer) === p && !g.stack.length) {
          if (/draw|scry|create|treasure/.test(o) && (c.is('Instant') || c.kw('flash'))) {
            if (this.r(g) < 0.8) return { kind: 'cast', card: c, alt: e.alt, from: e.from };
          }
          if (/destroy target|exile target/.test(o)) {
            const best = this.bestRemovalTarget(g, c);
            if (best && best.v >= 6) return { kind: 'cast', card: c, alt: e.alt, from: e.from };
          }
        }
      }
      // AKTIVIRANE SPOSOBNOSTI na prioritetu. Ranije se gledao samo q.casts, pa
      // bot nikad nije koristio ništa aktivirano dok nešto stoji na stacku —
      // uključujući Stella Lee (kopiraj svoj spell), što je gasilo cijeli deck.
      for (const e of (q.acts || [])) {
        const a = e.ability;
        if (!a || !a.targets) continue;
        const wantsSpell = a.targets.some(s => s.what === 'spell' || s.zone === 'stack');
        if (!wantsSpell) continue;
        // kopiraj/kontriraj cilja spell na stacku — biraj po tome ko ga kontroliše
        const mine = a.targets.some(s => (s.aiHint && /copy/i.test(s.aiHint.goal || '')));
        const cands = g.legalTargets(a.targets[0], e.card, p)
          .filter(so => mine ? so.ctrl === p : so.ctrl !== p);
        if (!cands.length) continue;
        const pick = cands[cands.length - 1];   // vrh stacka
        return { kind: 'activate', entry: e, targets: [pick] };
      }
      return { kind: 'pass' };
    }

    // izbor protivnika-mete po personi (drain/damage/discard efekti)
    pickOppPlayer(g, oppPlayers) {
      const P = this.persona;
      if (P.chaos && this.r(g) < 0.5) return oppPlayers[Math.floor(this.r(g) * oppPlayers.length)];
      const leader = oppPlayers.slice().sort((a, b) => this.playerThreat(g, b) - this.playerThreat(g, a))[0];
      const lowest = oppPlayers.slice().sort((a, b) => a.life - b.life)[0];
      if (this.style === 'aggressive' || this.style === 'opportunist') return lowest; // dokrajči ranjene
      if (this.style === 'passive') return leader;                // gađa prijetnju
      return this.r(g) < 0.6 ? leader : lowest;
    }

    bestRemovalTarget(g, card) {
      const specs = typeof card.def.targets === 'function' ? card.def.targets(g, card, {}) : card.def.targets;
      if (!specs) return null;
      const cands = g.legalTargets(specs[0], card, this.p).filter(x => x instanceof MTG.CardInst && x.ctrl !== this.p);
      if (!cands.length) return null;
      const best = cands.sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
      return { card: best, v: this.permThreat(g, best) };
    }

    attackers(g, q) {
      const p = this.p;
      const P = this.persona;
      const out = [];
      const oppsByThreat = q.opponents.slice().sort((a, b) => this.playerThreat(g, b) - this.playerThreat(g, a));
      const leader = oppsByThreat[0];
      const grudges = p.grudges || {};
      // provokator: svaki combat bira "žrtvu dana" nasumično (težinski po threatu)
      let teaseTarget = null;
      if (P.chaos && q.opponents.length) {
        const weighted = [];
        for (const o of q.opponents) {
          const w = Math.max(1, Math.round(this.playerThreat(g, o)));
          for (let i = 0; i < w; i++) weighted.push(o);
        }
        teaseTarget = weighted[Math.floor(this.r(g) * weighted.length)];
      }
      // pasivan: koliko napadača smije poslati (čuva blokere)
      const myCreN = q.eligible.length;
      let atkBudget = Infinity;
      if (P.keepBlockers) atkBudget = Math.max(1, Math.ceil(myCreN / 2));

      for (const c of q.eligible) {
        const forced = q.forced.includes(c);
        let bestTarget = null, bestScore = -99;
        for (const o of q.opponents) {
          // pregovarač: ne dira one koji ga nisu dirali i nisu lider (osim lethala)
          const isGrudge = (grudges[o.idx] || 0) > 0;
          const myDmg = g.dmgAmount(c, 'normal');
          const blockers = g.creatures(o).filter(b => g.canBlock(b, c));
          let score = 0;
          if (!blockers.length) {
            score = myDmg * 1.2;
            if (o.life <= myDmg) score += 50;
          } else {
            const canKillMe = blockers.some(b => g.dmgAmount(b, 'normal') >= c.cur.toughness - c.damage || b.kw('deathtouch'));
            const iKillThem = blockers.some(b => myDmg >= b.cur.toughness - b.damage);
            score = myDmg * 0.5 - (canKillMe ? this.permThreat(g, c) * 0.7 : 0) + (iKillThem ? 1 : 0);
            if (c.kw('indestructible')) score += 2;
            if (myDmg >= 6 && c.kw('trample')) score += 2;
          }
          // persona modifikatori mete
          if (o === leader) score += P.focusLeader;
          if (o.life <= 12) score += P.lowLifeHunt;
          if (isGrudge) score += 0.8;
          if (teaseTarget && o === teaseTarget) score += 2.5;
          if (score > bestScore) { bestScore = score; bestTarget = o; }
        }
        const threshold = (this.difficulty === 'tough' ? 0.6 : 0) + P.atkThr;
        if (forced || bestScore > threshold || (bestScore > 0 && this.r(g) < P.atkRnd)) {
          if (!forced && out.length >= atkBudget) continue;
          if (bestTarget || forced) out.push({ card: c, target: bestTarget || leader || q.opponents[0] });
        }
      }
      // provokator: ako ništa ne napada a ima sitne evazivce, bocni bar jednim
      if (P.chaos && !out.length && q.eligible.length && teaseTarget) {
        const small = q.eligible.filter(c => !q.forced.includes(c) && (c.kw('flying') || c.cur.unblockable || c.power <= 2))
          .sort((a, b) => a.power - b.power)[0];
        if (small && this.r(g) < 0.6) out.push({ card: small, target: teaseTarget });
      }
      return out;
    }

    blockers(g, q) {
      const p = this.p;
      const out = [];
      const used = new Set();
      const incoming = q.attackers.slice().sort((a, b) => g.dmgAmount(b, 'normal') - g.dmgAmount(a, 'normal'));
      const totalIncoming = incoming.reduce((s, a) => s + g.dmgAmount(a, 'normal'), 0);
      const lethalDanger = totalIncoming >= p.life;
      for (const a of incoming) {
        const dmg = g.dmgAmount(a, 'normal');
        const cands = q.potential.filter(b => !used.has(b) && g.canBlock(b, a));
        if (!cands.length) continue;
        // best block: kill attacker & survive > kill attacker & trade > chump if lethal danger
        let best = null, bestV = 0;
        for (const b of cands) {
          const bDmg = g.dmgAmount(b, 'normal');
          const iKill = bDmg >= a.cur.toughness - a.damage || b.kw('deathtouch');
          const iDie = dmg >= b.cur.toughness || a.kw('deathtouch');
          let v = 0;
          if (iKill && !iDie) v = 10 + this.permThreat(g, a);
          else if (iKill && iDie) v = this.permThreat(g, a) - this.permThreat(g, b) + 3;
          else if (!iDie) v = dmg * 0.6; // wall block
          else if (lethalDanger) v = dmg - this.permThreat(g, b) * 0.4;
          else v = -1;
          if (a.kw('trample')) v -= 1;
          if (v > bestV) { bestV = v; best = b; }
        }
        const thr = (lethalDanger ? -3 : (p.life < 15 ? 0.5 : 1.5)) + this.persona.blockThr;
        if (best && bestV > thr) {
          // menace needs two
          if (a.kw('menace')) {
            const second = cands.filter(b => b !== best).sort((x, y) => this.permThreat(g, x) - this.permThreat(g, y))[0];
            if (second) { out.push({ blocker: best, attacker: a }, { blocker: second, attacker: a }); used.add(best); used.add(second); }
          } else {
            out.push({ blocker: best, attacker: a });
            used.add(best);
          }
        }
      }
      return out;
    }

    chooseTargets(g, q) {
      const goal = q.aiHint && q.aiHint.goal || (q.spec && q.spec.aiHint && q.spec.aiHint.goal) || 'generic';
      let cands = q.candidates.slice();
      if (q.spec && q.spec.distinctCtrl) {
        // najviše jedna meta po kontroloru — zadrži najprijeteću po svakom
        const seenCtrl = new Set();
        cands = cands.slice().sort((a, b) =>
          (b instanceof MTG.CardInst ? this.permThreat(g, b) : 0) - (a instanceof MTG.CardInst ? this.permThreat(g, a) : 0)
        ).filter(x => {
          if (!(x instanceof MTG.CardInst) || !x.ctrl) return true;
          if (seenCtrl.has(x.ctrl)) return false;
          seenCtrl.add(x.ctrl);
          return true;
        });
      }
      const p = this.p;
      const min = q.min !== undefined ? q.min : 1;
      const max = q.max || 1;
      const pick = (sorted) => sorted.slice(0, Math.max(min, Math.min(max, sorted.length)));
      const byThreatDesc = cands.filter(x => x instanceof MTG.CardInst).sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
      const enemyPerms = byThreatDesc.filter(x => x.ctrl !== p);
      const myPerms = byThreatDesc.filter(x => x.ctrl === p);
      const oppPlayers = cands.filter(x => x instanceof MTG.Player && x !== p);
      switch (goal) {
        case 'blight': {
          const n = q.aiHint && q.aiHint.n || 1;
          const mine = myPerms.slice().sort((a, b) => this.blightRecipientScore(g, b, n) - this.blightRecipientScore(g, a, n));
          return mine.length ? [mine[0]] : pick(cands);
        }
        case 'counterRemoval': {
          const scored = byThreatDesc.slice().map(card => ({
            card,
            score: Object.entries(card.counters || {}).reduce((sum, [kind, amount]) =>
              sum + this.counterRemovalScore(card, kind, amount), 0),
          })).sort((a, b) => b.score - a.score || this.permThreat(g, b.card) - this.permThreat(g, a.card));
          return scored.length ? [scored[0].card] : pick(cands);
        }
        case 'removal': case 'removalLand': {
          if (enemyPerms.length) return pick(enemyPerms);
          if (min === 0) return [];
          return pick(byThreatDesc.length ? byThreatDesc : cands);
        }
        case 'damage': {
          const n = (q.aiHint && q.aiHint.n) || 3;
          const killable = enemyPerms.filter(c => c.is('Creature') && c.cur.toughness - c.damage <= n);
          if (killable.length && this.permThreat(g, killable[0]) > 3) return [killable[0]];
          if (oppPlayers.length) return [this.pickOppPlayer(g, oppPlayers)];
          if (enemyPerms.length) return [enemyPerms[0]];
          return pick(cands);
        }
        case 'buff': case 'copy': case 'copyBestToken': case 'octavia': {
          if (goal === 'octavia') {
            const smallMine = myPerms.filter(c => c.is('Creature')).sort((a, b) => a.power - b.power);
            if (smallMine.length) return [smallMine[0]];
          }
          if (myPerms.length) {
            const sorted = myPerms.sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
            return [sorted[0]];
          }
          return pick(cands);
        }
        case 'tap': {
          return pick(enemyPerms.length ? enemyPerms : byThreatDesc);
        }
        case 'magmaOpusDamage': {
          const chosen = [];
          let left = 4;
          const killable = enemyPerms.filter(card => card.is('Creature') || card.is('Planeswalker'))
            .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
          for (const card of killable) {
            const need = Math.max(1, card.toughness - card.damage);
            if (need <= left && chosen.length < max) { chosen.push(card); left -= need; }
          }
          if (chosen.length) return chosen;
          if (oppPlayers.length) return [this.pickOppPlayer(g, oppPlayers)];
          return min ? pick(cands) : [];
        }
        case 'chargeCounter': {
          const score = card => {
            if (card.name === 'Darksteel Reactor') return 100 + (card.counters.charge || 0);
            if (card.def.stationCreatureAt) return 80 - Math.max(0, card.def.stationCreatureAt - (card.counters.charge || 0));
            if (card.is('Artifact')) return 10 + (card.counters.charge || 0);
            return 0;
          };
          const mine = myPerms.slice().sort((a, b) => score(b) - score(a));
          return mine.length ? [mine[0]] : (min ? pick(cands) : []);
        }
        case 'proliferate': {
          const beneficial = new Set(['+1/+1', 'loyalty', 'charge', 'indestructible', 'shield', 'lore', 'quest', 'acorn', 'soul', 'hour', 'level', 'oil']);
          const harmful = new Set(['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty']);
          return cands.filter(subject => {
            if (subject instanceof MTG.Player) return subject !== p && (subject.poison || 0) > 0;
            const kinds = Object.keys(subject.counters).filter(kind => (subject.counters[kind] || 0) > 0);
            const good = kinds.some(kind => beneficial.has(kind));
            const bad = kinds.some(kind => harmful.has(kind));
            return subject.ctrl === p ? good && !bad : bad && !good;
          }).slice(0, max);
        }
        case 'protect': case 'fightMine': {
          if (myPerms.length) return [myPerms[0]];
          return pick(cands);
        }
        case 'counter': {
          return pick(cands);
        }
        case 'drain': case 'maxHand': case 'lordOfPain': {
          if (goal === 'lordOfPain') {
            const caster = q.aiHint.caster;
            const others = oppPlayers.filter(x => x !== caster);
            const poolx = (others.length ? others : oppPlayers);
            if (poolx.length) return [poolx.sort((a, b) => a.life - b.life)[0]];
          }
          if (goal === 'maxHand' && oppPlayers.length) return [oppPlayers.sort((a, b) => b.hand.length - a.hand.length)[0]];
          if (oppPlayers.length) return [this.pickOppPlayer(g, oppPlayers)];
          return pick(cands);
        }
        case 'gyHate': {
          if (oppPlayers.length) return [oppPlayers.sort((a, b) => b.graveyard.length - a.graveyard.length)[0]];
          return pick(cands);
        }
        case 'drawSelf': {
          const me = cands.find(x => x === p);
          if (me) return [me];
          return pick(cands);
        }
        case 'gift': {
          const me = cands.find(x => x === p);
          if (me) return [me];
          if (oppPlayers.length) return [oppPlayers.slice().sort((a, b) => this.playerThreat(g, a) - this.playerThreat(g, b)
            || a.idx - b.idx)[0]];
          return pick(cands);
        }
        case 'bounce': {
          if (enemyPerms.length) return pick(enemyPerms);
          return min ? pick(cands) : [];
        }
        case 'aura': {
          // enchant own land preferably a basic
          const mine = myPerms.filter(c => c.is('Land'));
          if (mine.length) return [mine.sort((a, b) => ((a.def.super || []).includes('Basic') ? -1 : 1))[0]];
          return pick(cands);
        }
        case 'evasion': case 'animateLand': case 'steal': case 'fightTaunter': case 'reanimate': case 'bestGyCast': case 'lifegainMax': {
          if (goal === 'steal' && enemyPerms.length) return [enemyPerms[0]];
          if (goal === 'fightTaunter' && enemyPerms.length) return [enemyPerms[0]];
          if (goal === 'lifegainMax' && myPerms.length) return [myPerms.sort((a, b) => b.power - a.power)[0]];
          if (goal === 'animateLand' && myPerms.length) return [myPerms.filter(c => !c.tapped)[0] || myPerms[0]];
          if (goal === 'evasion' && myPerms.length) return [myPerms[0]];
          if (goal === 'reanimate' || goal === 'bestGyCast') {
            const sorted = cands.slice().sort((a, b) => this.cardValue(g, b) - this.cardValue(g, a));
            return [sorted[0]];
          }
          return pick(cands);
        }
        case 'copySpell': {
          return pick(cands);
        }
        case 'shadrixTarget': {
          const mode = q.aiHint.mode;
          if (mode === 'draw' || mode === 'counters' || mode === 'token') {
            const me = cands.find(x => x === p);
            if (me && (mode !== 'token' || true)) return [me];
          }
          return pick(cands);
        }
        default: {
          if (min === 0 && !enemyPerms.length && !oppPlayers.length && !myPerms.length) return [];
          if (enemyPerms.length) return pick(enemyPerms);
          return pick(cands);
        }
      }
    }

    chooseCards(g, q) {
      const kind = q.aiHint && q.aiHint.kind || 'generic';
      const from = q.from || [];
      const min = q.min !== undefined ? q.min : 1;
      const max = q.max !== undefined ? q.max : 1;
      const byValAsc = from.slice().sort((a, b) => this.cardValue(g, a) - this.cardValue(g, b));
      const byValDesc = byValAsc.slice().reverse();
      const byThreatAsc = from.slice().sort((a, b) => this.permThreat(g, a) - this.permThreat(g, b));
      switch (kind) {
        case 'searchBasic': {
          // pick basic matching missing colors
          const p = this.p;
          const need = p.colorIdentity.filter(col => !g.lands(p).some(l => (l.def.producesColors || []).includes(col)));
          let pickc = from.find(c => need.some(col => (c.def.producesColors || []).includes(col)));
          if (!pickc) {
            const counts = {};
            for (const l of g.lands(p)) for (const col of (l.def.producesColors || [])) counts[col] = (counts[col] || 0) + 1;
            pickc = from.slice().sort((a, b) => {
              const ac = Math.min(...(a.def.producesColors || ['Z']).map(col => counts[col] || 0));
              const bc = Math.min(...(b.def.producesColors || ['Z']).map(col => counts[col] || 0));
              return ac - bc;
            })[0];
          }
          return pickc ? [pickc] : (from.length ? [from[0]] : []);
        }
        case 'cleanupDiscard': case 'addlDiscard': {
          return byValAsc.slice(0, Math.max(min, 0));
        }
        case 'bottomOrder': return byValAsc.slice(0, 1);
        case 'delve': {
          // Delve je SNIŽENJE cijene — min je 0, pa je "uzmi min" značilo da bot
          // nikad ne egzilira ništa i onda ne može platiti (Treasure Cruise je
          // ovako bio potpuno neigriv). Uzimamo koliko treba, najmanje vrijedne prvo.
          return byValAsc.slice(0, Math.max(min, max || 0));
        }
        case 'sacCost': case 'addlSac': case 'eliminateSacrifice': case 'forcedSac': case 'sacToken': case 'sacX': case 'braidsSac': {
          const sorted = byThreatAsc;
          if (kind === 'sacX') {
            // sacrifice tokens only, small number
            const toks = sorted.filter(c => c.isToken);
            return toks.slice(0, Math.min(2, toks.length)) .length ? toks.slice(0, Math.min(2, toks.length)) : sorted.slice(0, 1);
          }
          if (kind === 'braidsSac') {
            const tok = sorted.find(c => c.isToken);
            if (tok) return [tok];
            const land = sorted.find(c => c.is('Land') && g.lands(this.p).length > 6);
            if (land) return [land];
            return [sorted[0]];
          }
          return sorted.slice(0, Math.max(min, 1));
        }
        case 'braidsRespond': case 'mogis': {
          const cheap = byThreatAsc.filter(c => this.permThreat(g, c) < 3);
          if (cheap.length) return [cheap[0]];
          return this.p.life < 10 && byThreatAsc.length ? [byThreatAsc[0]] : [];
        }
        case 'bestCard': case 'reunion': case 'reanimate': {
          return byValDesc.slice(0, Math.max(min, Math.min(max, 1) || 1)).slice(0, max);
        }
        case 'wakandaBattlefield': {
          const legal = byValDesc.filter(card => !((card.def.super || []).includes('Legendary') &&
            g.bf().some(existing => existing.ctrl === this.p && existing.name === card.name)));
          return legal.length ? [legal[0]] : [];
        }
        case 'brudicladToken': {
          const score = card => this.permThreat(g, card) + (card.def.mana ? 1.5 : 0);
          const sorted = from.slice().sort((a, b) => score(b) - score(a));
          return sorted.length ? [sorted[0]] : [];
        }
        case 'esixCopy': {
          const sorted = from.slice().sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
          return sorted.length && this.permThreat(g, sorted[0]) >= 2 ? [sorted[0]] : [];
        }
        case 'finaleUntap': {
          return from.filter(card => card.ctrl === this.p && card.tapped)
            .sort((a, b) => this.cardValue(g, b) - this.cardValue(g, a)).slice(0, max);
        }
        case 'danceFreeCasts': {
          return byValDesc.filter(card => this.cardValue(g, card) > 1.5).slice(0, max);
        }
        case 'digBottomOrder': return byValAsc.slice(0, max);
        case 'castFreeUpTo': return byValDesc.slice(0, max);
        case 'hideaway': {
          return [byValDesc[0]];
        }
        case 'crew': {
          // tap least valuable untapped creatures
          const need = q.aiHint.need || 1;
          const sorted = byThreatAsc;
          const out = [];
          let pow = 0;
          for (const c of sorted) { out.push(c); pow += Math.max(0, c.power); if (pow >= need) break; }
          return pow >= need ? out : [];
        }
        case 'slaughterKeep': {
          const sorted = byThreatAsc.slice().reverse();
          const out = [];
          let total = 0;
          for (const c of sorted) { const pw = Math.max(0, c.power); if (total + pw <= 4) { out.push(c); total += pw; } }
          return out;
        }
        case 'hazelMana': {
          // preferiraj non-creature tokene (Food/Treasure/Clue) — ne skidaj vlastite napadače/blokere
          const nonCreature = from.filter(c => !c.is('Creature'));
          const toks = nonCreature.length ? nonCreature : from;
          return toks.slice(0, Math.min(3, toks.length));
        }
        case 'bounceLandChoice': {
          const self = q.aiHint.self;
          const tappedBasic = from.find(c => c !== self && (c.def.super || []).includes('Basic') && c.tapped);
          if (tappedBasic) return [tappedBasic];
          const anyBasic = from.find(c => c !== self && (c.def.super || []).includes('Basic'));
          if (anyBasic) return [anyBasic];
          return [from.find(c => c !== self) || from[0]];
        }
        case 'shellGame': {
          const sorted = from.slice().sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
          const notMine = sorted.filter(c => c.ctrl !== this.p);
          return [notMine[0] || sorted[sorted.length - 1]];
        }
        case 'bestLand': {
          const colors = this.p.colorIdentity || [];
          const counts = Object.fromEntries(colors.map(color => [color, 0]));
          for (const land of g.lands(this.p)) {
            for (const color of land.def.producesColors || []) if (counts[color] !== undefined) counts[color]++;
          }
          const score = card => Math.max(0, ...(card.def.producesColors || [])
            .filter(color => counts[color] !== undefined).map(color => 6 - counts[color])) +
            (card.def.entersTapped ? -0.5 : 0) + (card.def.mana ? 0.2 : 0);
          return from.length ? [from.slice().sort((a, b) => score(b) - score(a) || a.iid - b.iid)[0]] : [];
        }
        case 'blight': {
          const n = q.aiHint && q.aiHint.n || 1;
          const sorted = from.slice().sort((a, b) => this.blightRecipientScore(g, b, n) - this.blightRecipientScore(g, a, n));
          return [sorted[0]];
        }
        case 'eventidePermanents': {
          return from.filter(card => Object.entries(card.counters || {}).some(([counterKind, amount]) =>
            amount > 0 && this.counterRemovalScore(card, counterKind, amount) > 0)).slice(0, max);
        }
        case 'stationTap': {
          // tapuj NAJJAČE slobodno stvorenje koje nije potrebno za napad (najviše charge-a)
          const sorted = from.slice().sort((a, b) => Math.max(0, b.power) - Math.max(0, a.power));
          return [sorted[0]];
        }
        case 'myrBattlesphere': return from.slice(0, max);
        case 'counterCost': {
          const bad = card => (card.counters['-1/-1'] || 0) + (card.counters.stun || 0) +
            (card.counters.finality || 0) + (card.counters.doom || 0);
          const sorted = from.slice().sort((a, b) => bad(b) - bad(a) || this.permThreat(g, a) - this.permThreat(g, b));
          return sorted.length ? [sorted[0]] : [];
        }
        case 'removalPick': case 'stealPick': case 'goadPick': {
          const sorted = from.slice().sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a));
          return sorted.length && (min > 0 || this.permThreat(g, sorted[0]) >= 3) ? [sorted[0]] : (min > 0 && sorted.length ? [sorted[0]] : []);
        }
        case 'buffPick': case 'fightMine': {
          const sorted = from.slice().sort((a, b) => Math.max(0, b.power) - Math.max(0, a.power));
          return sorted.length ? [sorted[0]] : [];
        }
        case 'rampPick': case 'piperPick': {
          return byValDesc.slice(0, Math.max(min, 1)).slice(0, Math.max(max, 1));
        }
        case 'revealLand': return from.length ? [from[0]] : [];
        case 'genesisWave': {
          return from.filter(card => !((card.def.super || []).includes('Legendary') &&
            g.bf().some(existing => existing.ctrl === this.p && existing.name === card.name)));
        }
        case 'gyHate': {
          const notMine = from.filter(c => c.owner !== this.p);
          const sorted = notMine.sort((a, b) => this.cardValue(g, b) - this.cardValue(g, a));
          return sorted.length ? [sorted[0]] : (min > 0 && from.length ? [from[0]] : []);
        }
        default: {
          if (min === 0) {
            // optional: take best if valuable
            if (from.length && this.cardValue(g, byValDesc[0]) > 3) return [byValDesc[0]];
            return [];
          }
          return byValDesc.slice(0, Math.max(min, 1)).slice(0, max);
        }
      }
    }

    chooseOption(g, q) {
      const kind = q.aiHint && q.aiHint.kind || '';
      const keys = q.options.map(o => o.key);
      switch (kind) {
        case 'vote': {
          if (MTG.pickBotVoteOption) return MTG.pickBotVoteOption(g, this.p, q);
          const preferred = q.aiHint && q.aiHint.aiPick && q.aiHint.aiPick(this.p);
          return keys.includes(preferred) ? preferred : keys[0];
        }
        case 'chooseOpponent': {
          const offered = q.options.filter(option => option.player && !option.player.lost);
          if (!offered.length) return keys[0];
          const goal = q.aiHint && q.aiHint.goal || 'delegate';
          if (goal === 'threat' || goal === 'harm') {
            const picked = this.pickOppPlayer(g, offered.map(option => option.player));
            return offered.find(option => option.player === picked).key;
          }
          // Kada nekome poklanja resurs/kopiju ili mu prepušta odluku, bot bira
          // najmanje opasnog javno procijenjenog protivnika.
          return offered.slice().sort((a, b) => this.playerThreat(g, a.player) - this.playerThreat(g, b.player)
            || a.player.idx - b.player.idx)[0].key;
        }
        case 'abstractPile': {
          return q.options.slice().sort((a, b) => (b.denyValue || 0) - (a.denyValue || 0))[0].key;
        }
        case 'clashPlace': {
          const card = q.aiHint && q.aiHint.card;
          return card && this.cardValue(g, card) >= 3 ? 'top' : 'bottom';
        }
        case 'manaColor': {
          // pick color we have least of / most needed: pick from hand costs
          const needs = {};
          for (const c of this.p.hand) for (const col of U.colorsOfCost(c.def.cost || '')) needs[col] = (needs[col] || 0) + 1;
          const best = keys.filter(k => COLORS.includes(k)).sort((a, b) => (needs[b] || 0) - (needs[a] || 0))[0];
          return best || keys[0];
        }
        case 'ward': {
          if (q.aiHint && q.aiHint.payment === 'blight') {
            const n = q.aiHint.n || 1;
            const best = g.creatures(this.p).map(card => this.blightRecipientScore(g, card, n)).sort((a, b) => b - a)[0];
            return Number.isFinite(best) && best > -9 ? 'yes' : 'no';
          }
          return this.p.life > 10 ? 'yes' : 'no';
        }
        case 'burningCuriosity': {
          const n = q.aiHint && q.aiHint.n || 1;
          const best = g.creatures(this.p).map(card => this.blightRecipientScore(g, card, n)).sort((a, b) => b - a)[0];
          return Number.isFinite(best) && best > -7 && keys.includes('yes') ? 'yes' : 'no';
        }
        case 'attackDestination': {
          const offered = q.options.filter(option => option.target);
          const players = offered.filter(option => option.target instanceof U.Player)
            .sort((a, b) => this.playerThreat(g, b.target) - this.playerThreat(g, a.target)
              || a.target.life - b.target.life || a.target.idx - b.target.idx);
          if (players.length) return players[0].key;
          return offered[0] ? offered[0].key : keys[0];
        }
        case 'myriadCopy': return keys.includes('yes') ? 'yes' : keys[0];
        case 'temptingOffer': {
          const caster = q.aiHint && q.aiHint.caster;
          const accept = this.p.life <= 12 || g.creatures(this.p).length <= 2 || !caster || this.playerThreat(g, caster) < 28;
          return accept && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        }
        case 'gixDraw': return this.p.life > 4 && this.p.library.length && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        case 'bitterTriumphCost': {
          const hasDiscard = this.p.hand.some(card => card !== (q.aiHint && q.aiHint.card));
          if (hasDiscard && (this.p.life <= 14 || !keys.includes('life')) && keys.includes('discard')) return 'discard';
          return keys.includes('life') ? 'life' : keys[0];
        }
        case 'fabricate': {
          const tokenEngine = g.bf().some(card => card.ctrl === this.p && /token|dies|leaves the battlefield/i.test(card.def.oracle || ''));
          return tokenEngine && keys.includes('t') ? 't' : (keys.includes('c') ? 'c' : keys[0]);
        }
        case 'willMardu': {
          const maxOppCreatures = Math.max(0, ...g.players.filter(player => player !== this.p && !player.lost)
            .map(player => g.creatures(player).length));
          return maxOppCreatures >= 3 && keys.includes('0') ? '0' : (keys.includes('1') ? '1' : keys[0]);
        }
        case 'sunTitanReturn': return keys.includes('yes') ? 'yes' : keys[0];
        case 'glissaMode': {
          const enchantment = g.bf().filter(card => card.is('Enchantment') && card.ctrl !== this.p)
            .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
          if (enchantment && this.permThreat(g, enchantment) >= 3 && keys.includes('1')) return '1';
          const counterValue = g.bf().reduce((best, card) => Math.max(best,
            Object.entries(card.counters || {}).reduce((sum, [counterKind, amount]) =>
              sum + this.counterRemovalScore(card, counterKind, Math.min(3, amount)), 0)), 0);
          if (counterValue > 0 && keys.includes('2')) return '2';
          return keys.includes('0') ? '0' : keys[0];
        }
        case 'moveCounterKind': {
          const target = q.aiHint && q.aiHint.target;
          if (target) {
            const best = keys.slice().sort((a, b) => this.counterRemovalScore(target, a) - this.counterRemovalScore(target, b))[0];
            if (best) return best;
          }
          return keys[0];
        }
        case 'tokenReplacementOrder': {
          const rank = option => {
            const name = option.source && option.source.name || option.label || '';
            if (name === 'Academy Manufactor') return 30;
            if (name === 'Adrix and Nev, Twincasters') return 20;
            if (name === 'Esix, Fractal Bloom') return 5;
            return 10;
          };
          return q.options.slice().sort((a, b) => rank(b) - rank(a))[0].key;
        }
        case 'innocuousUntap': {
          const useful = g.lands(this.p).some(card => card.tapped);
          return useful && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        }
        case 'killerService': {
          const cheap = g.bf().some(card => card.ctrl === this.p && card.isToken && this.permThreat(g, card) < 4);
          return cheap && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        }
        case 'ransom': {
          const threat = g.bf().filter(card => card.ctrl !== this.p && card.is('Creature'))
            .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
          if (threat && this.permThreat(g, threat) >= 5 && keys.includes('goad')) return 'goad';
          const profile = MTG.getDeckAIProfile && MTG.getDeckAIProfile(this.p.deckName || this.p.deck && this.p.deck.name);
          if (this.p.library.length && profile && profile.primarySynergies.includes('tokens') && keys.includes('cloak')) return 'cloak';
          return keys.includes('draw') ? 'draw' : keys[0];
        }
        case 'optTrigger': return 'yes';
        case 'inspiritCounter': {
          const target = q.aiHint && q.aiHint.target;
          const wantsCharge = target && (target.name === 'Darksteel Reactor' || target.def.stationCreatureAt ||
            target.def.winAtCharge || Object.prototype.hasOwnProperty.call(target.counters || {}, 'charge'));
          return wantsCharge && keys.includes('c') ? 'c' : (keys.includes('p') ? 'p' : keys[0]);
        }
        case 'cloudKey': return keys.includes('Artifact') ? 'Artifact' : keys[0];
        case 'counterCostKind': {
          const bad = ['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty'];
          return bad.find(key => keys.includes(key)) || keys[0];
        }
        case 'equipPayment': {
          const card = q.aiHint && q.aiHint.card;
          const counters = card ? Object.values(card.counters).reduce((sum, n) => sum + Math.max(0, n), 0) : 0;
          return counters >= 2 && keys.includes('mana') ? 'mana' : (keys.includes('counter') ? 'counter' : keys[0]);
        }
        case 'partnerSearch': case 'rampChoice': return keys.includes('yes') ? 'yes' : keys[0];
        case 'elvenFarsight': {
          const card = q.aiHint && q.aiHint.card;
          return card && card.is('Creature') && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        }
        case 'radagastToken': {
          const needsFlyingBlocker = g.bf().some(card => card.ctrl !== this.p && card.is('Creature') && card.kw('flying') && !card.tapped);
          return needsFlyingBlocker && keys.includes('bird') ? 'bird' : (keys.includes('beast') ? 'beast' : keys[0]);
        }
        case 'tmntAlliance': {
          const hasFoodEngine = g.bf().some(card => card.ctrl === this.p &&
            ['Ninja Pizza', 'Donatello, the Brains', 'Leonardo, the Balance'].includes(card.name));
          if (hasFoodEngine && keys.includes('food')) return 'food';
          if (keys.includes('counter')) return 'counter';
          if (keys.includes('food')) return 'food';
          return keys[0];
        }
        case 'aggroAmalgam': {
          const source = q.aiHint && q.aiHint.src;
          const counters = source && (source.counters['+1/+1'] || 0);
          const killable = source && g.bf().some(card => card.is('Creature') && card.ctrl !== this.p &&
            card.toughness - card.damage <= source.power && card.power < source.toughness);
          if (killable && keys.includes('1')) return '1';
          return counters > 0 && keys.includes('0') ? '0' : keys[0];
        }
        case 'demonstrate': {
          const card = q.aiHint && q.aiHint.card;
          if (card && card.name === 'Replication Technique') {
            const mine = g.bf().filter(permanent => permanent.ctrl === this.p && !permanent.is('Land'));
            return mine.some(permanent => this.permThreat(g, permanent) >= 4) && keys.includes('yes') ? 'yes' : 'no';
          }
          return keys.includes('yes') ? 'yes' : keys[0];
        }
        case 'danceContinue': return (q.aiHint && q.aiHint.total || 0) < 10 && keys.includes('yes') ? 'yes' : 'no';
        case 'prismariCharm': {
          const killable = g.bf().some(permanent => permanent.ctrl !== this.p && permanent.is('Creature') && permanent.toughness - permanent.damage <= 1);
          if (killable && keys.includes('1')) return '1';
          const threat = g.bf().some(permanent => permanent.ctrl !== this.p && !permanent.is('Land') && this.permThreat(g, permanent) >= 4);
          if (threat && keys.includes('2')) return '2';
          return keys.includes('0') ? '0' : keys[0];
        }
        case 'freeCast': return 'yes';
        case 'conduitCast': return keys.includes('yes') ? 'yes' : keys[0];
        case 'nyamiTop': {
          const card = q.aiHint && q.aiHint.card;
          const duplicateLegend = card && (card.def.super || []).includes('Legendary') &&
            g.bf().some(existing => existing.ctrl === this.p && existing.name === card.name);
          return card && !duplicateLegend && keys.includes('yes') ? 'yes' : (keys.includes('no') ? 'no' : keys[0]);
        }
        case 'wakandaBead': {
          if (this.p.life <= 20 && keys.includes('prime')) return 'prime';
          if (this.p.hand.length <= 3 && keys.includes('av')) return 'av';
          if (keys.includes('comm')) return 'comm';
          return keys[0];
        }
        case 'tataruDraw': return 'yes';
        case 'kicker': return 'yes';
        case 'offspring': return 'yes';
        case 'newTargets': {
          const so = q.aiHint && q.aiHint.so;
          if (so) {
            const specs = so.targetSpecs || g.spellTargetSpecs(so.card, so.castOpts || {}, this.p);
            if (!g.targetsStillOk(so.targets || [], specs, so.card, this.p) && keys.includes('yes')) return 'yes';
          }
          return keys.includes('no') ? 'no' : keys[0];
        }
        case 'gearhulk': {
          const caster = q.aiHint.caster;
          // let them draw if we're healthy, else take mill+damage? Opposite: mill+dmg hurts us. Draw3 helps them.
          return this.p.life > 20 ? 'burn' : 'draw';
        }
        case 'siege': return 'khans';
        case 'provisioner': return g.turnNo < 8 ? 'treasure' : 'food';
        case 'tectonic': return 'dmg';
        case 'adversary': return q.aiHint.times < 1 ? 'yes' : 'no';
        case 'frugivore': return this.p.graveyard.length > 6 ? 'yes' : 'no';
        case 'explore': {
          const card = q.aiHint.card;
          return this.cardValue(g, card) > 3.5 ? 'top' : 'gy';
        }
        case 'ponder': {
          const top = q.aiHint.top || [];
          const good = top.filter(c => this.cardValue(g, c) > 3).length;
          return good >= 2 ? 'keep' : 'shuffle';
        }
        case 'mirrorCopy': return keys[0];
        case 'starAthlete': {
          const card = q.aiHint.card;
          if (card && this.permThreat(g, card) < 4 && this.p.life > 12) return keys.find(k => k === 'sac') || keys[0];
          return keys.find(k => k === 'dmg') || keys[0];
        }
        case 'mode': {
          const card = q.aiHint && q.aiHint.card;
          if (card && card.name === 'Prismari Charm') {
            const killable = g.bf().some(permanent => permanent.ctrl !== this.p && permanent.is('Creature') && permanent.toughness - permanent.damage <= 1);
            if (killable && keys.includes('1')) return '1';
            const threat = g.bf().some(permanent => permanent.ctrl !== this.p && !permanent.is('Land') && this.permThreat(g, permanent) >= 4);
            if (threat && keys.includes('2')) return '2';
            if (keys.includes('0')) return '0';
          }
          if (card && card.name === 'Abrade') {
            const artifact = g.bf().filter(permanent => permanent.ctrl !== this.p && permanent.is('Artifact'))
              .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
            const creature = g.bf().filter(permanent => permanent.ctrl !== this.p && permanent.is('Creature') && permanent.toughness - permanent.damage <= 3)
              .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
            if (artifact && (!creature || this.permThreat(g, artifact) > this.permThreat(g, creature)) && keys.includes('1')) return '1';
            if (creature && keys.includes('0')) return '0';
          }
          return keys[Math.floor(this.r(g) * keys.length)];
        }
        case 'modes': case 'shadrix': case 'rootcast': {
          return keys[Math.floor(this.r(g) * keys.length)];
        }
        default: {
          if (keys.includes('cz')) return 'cz'; // commander back to command zone
          if (keys.includes('yes')) return 'yes';
          return keys[0];
        }
      }
    }

    chooseMulti(g, q) {
      const min = q.min ?? 1, max = Math.min(q.max ?? 1, q.options.length);
      const keys = q.options.map(o => o.key);
      if (q.aiHint && q.aiHint.kind === 'prismariCommand') {
        const scores = new Map(keys.map(key => [key, 0]));
        if (scores.has('0')) {
          const killable = g.bf().filter(card => card.ctrl !== this.p && card.is('Creature') && card.toughness - card.damage <= 2);
          scores.set('0', killable.length ? 6 : 1.5);
        }
        if (scores.has('1')) scores.set('1', this.p.hand.length <= 3 ? 5 : 3);
        if (scores.has('2')) scores.set('2', g.turnNo < 14 ? 5 : 2.5);
        if (scores.has('3')) {
          const artifact = g.bf().filter(card => card.ctrl !== this.p && card.is('Artifact'))
            .sort((a, b) => this.permThreat(g, b) - this.permThreat(g, a))[0];
          scores.set('3', artifact ? 4 + this.permThreat(g, artifact) : 0);
        }
        return keys.slice().sort((a, b) => scores.get(b) - scores.get(a)).slice(0, max);
      }
      if (q.aiHint && q.aiHint.kind === 'farewellModes') {
        const zoneScore = kind => {
          if (kind === 3) {
            const own = this.p.graveyard.reduce((sum, card) => sum + this.cardValue(g, card), 0);
            const enemy = g.players.filter(player => player !== this.p)
              .reduce((sum, player) => sum + player.graveyard.reduce((s, card) => s + this.cardValue(g, card), 0), 0);
            return enemy - own * 1.4;
          }
          const type = ['Artifact', 'Creature', 'Enchantment'][kind];
          return g.bf().filter(card => card.is(type)).reduce((sum, card) =>
            sum + (card.ctrl === this.p ? -this.permThreat(g, card) * 1.4 : this.permThreat(g, card)), 0);
        };
        const ranked = keys.map(key => ({ key, score: zoneScore(Number(key)) }))
          .filter(entry => entry.score > 0.5).sort((a, b) => b.score - a.score);
        return (ranked.length ? ranked : keys.map(key => ({ key, score: zoneScore(Number(key)) }))
          .sort((a, b) => b.score - a.score).slice(0, 1)).slice(0, max).map(entry => entry.key);
      }
      const n = Math.max(min, Math.min(max, 2));
      const out = [];
      const pool = keys.slice();
      while (out.length < n && pool.length) {
        const i = Math.floor(this.r(g) * pool.length);
        out.push(pool[i]);
        if (!q.repeats) pool.splice(i, 1);
      }
      return out;
    }

    chooseX(g, q) {
      const kind = q.aiHint && q.aiHint.kind;
      if (kind === 'flourishingDefenses') return q.max;
      if (kind === 'eventideCounter' || kind === 'glissaCounter') {
        const hint = q.aiHint || {};
        return hint.target && this.counterRemovalScore(hint.target, hint.counterKind, q.max) > 0 ? q.max : 0;
      }
      if (kind === 'fireCovenant') {
        const targets = q.aiHint && q.aiHint.targets || [];
        const lethal = targets.reduce((sum, card) => sum + Math.max(1, card.toughness - card.damage), 0);
        return Math.max(q.min, Math.min(q.max, Math.max(0, this.p.life - 1), lethal));
      }
      if (kind === 'fireCovenantDamage') {
        const target = q.aiHint && q.aiHint.target;
        return target ? Math.max(q.min, Math.min(q.max, Math.max(1, target.toughness - target.damage))) : q.min;
      }
      if (kind === 'magmaOpusDamage' || kind === 'dividedDamage') {
        const target = q.aiHint && q.aiHint.target;
        return target instanceof MTG.CardInst
          ? Math.max(q.min, Math.min(q.max, Math.max(1, target.toughness - target.damage)))
          : q.min;
      }
      if (kind === 'expelN') {
        // destroy as much of opponents' board as possible while keeping mine
        const myMax = Math.max(0, ...g.creatures(this.p).map(c => c.power), 0);
        const oppPowers = g.bf().filter(c => c.is('Creature') && c.ctrl !== this.p).map(c => c.power);
        if (!oppPowers.length) return 10;
        const target = Math.min(...oppPowers);
        return Math.max(Math.min(10, myMax + 1), Math.min(10, target));
      }
      // default: max X but keep a bit of mana
      return Math.max(q.min, q.max - (this.r(g) < 0.3 ? 1 : 0));
    }

    scry(g, q) {
      const top = [], bottom = [];
      for (const c of q.cards) {
        const lands = g.lands(this.p).length;
        if (c.is('Land') && lands >= 6) bottom.push(c);
        else if (this.cardValue(g, c) < 2.2 && !c.is('Land')) bottom.push(c);
        else top.push(c);
      }
      if (q.surveil) return { top, bottom };
      return { top, bottom };
    }
  }
  MTG.AIController = AIController;
})();
