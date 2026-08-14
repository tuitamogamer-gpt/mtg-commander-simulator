// ===== engine.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  let IID = 1;

  // ============================================================
  // Card instance
  // ============================================================
  class CardInst {
    constructor(def, owner) {
      // Simulirani snapshot koristi negativne lokalne ID-jeve za novonastale
      // tokene/kopije. Tako AI analiza ne pomjera live IID allocator.
      this.iid = owner && owner.game && owner.game._simulation
        ? owner.game._nextSimulationIid-- : IID++;
      this.def = def;               // merged def+script (immutable)
      this.owner = owner;           // player
      this.ctrl = owner;            // controller
      this.zone = 'library';
      this.tapped = false;
      this.sick = true;             // summoning sickness
      this.damage = 0;
      this.deathtouched = false;
      this.regenShield = 0;
      this.counters = {};           // {'+1/+1':n,'-1/-1':n,'loyalty':n,...}
      this.attachedTo = null;       // iid
      this.attachments = [];        // iids
      this.isToken = false;
      this.isCopyOf = null;
      this.faceDown = false;
      this.meta = {};               // script scratch space (persists while on battlefield)
      this.timestamp = 0;
      this.attacking = null;        // player or planeswalker iid during combat
      this.blocking = null;         // iid of attacker
      this.blockedBy = [];
      this.cur = null;              // derived characteristics (recalc)
      this.commander = false;
      this.cmdCasts = 0;            // koliko puta je OVAJ komander bačen iz CZ (tax je po komanderu)
      this.castMeta = null;         // how it was cast (for blitz etc.)
      this.phasedOut = false;       // ostaje fizički na battlefieldu, ali ne postoji u igri
    }
    is(type) { return this.cur ? this.cur.types.includes(type) : this.def.types.includes(type); }
    hasSub(s) {
      const subs = this.cur ? this.cur.subtypes : this.def.subtypes;
      if (subs.includes(s)) return true;
      // changeling / Maskwood Nexus: "svaki tip stvorenja" vrijedi SAMO za prave
      // tipove stvorenja. Ranije je vraćalo true i za 'Aura'/'Equipment', pa je
      // SBA slao cijelu tvoju tablu u groblje čim Maskwood Nexus uđe.
      if (this.cur && this.cur.allCreatureTypes && this.is('Creature') &&
        MTG.CREATURE_SUBTYPES && MTG.CREATURE_SUBTYPES.has(s)) return true;
      return false;
    }
    kw(k) { return this.cur && this.cur.kw.has(k); }
    get name() { return this.def.name; }
    get power() { return this.cur ? this.cur.power : 0; }
    get toughness() { return this.cur ? this.cur.toughness : 0; }
    get mv() {
      if (this.zone === 'battlefield' && this.isToken && !this.isCopyOf) return 0;
      return U.mv(this.def.cost || '', this.castMeta && this.castMeta.x || 0);
    }
    get colors() {
      if (this.def.colorsOverride) return this.def.colorsOverride;
      return U.colorsOfCost(this.def.cost || '');
    }
    plus1() { return this.counters['+1/+1'] || 0; }
  }
  MTG.CardInst = CardInst;

  // ============================================================
  // Player
  // ============================================================
  class Player {
    constructor(name, idx) {
      this.name = name; this.idx = idx;
      this.life = 40;
      this.library = []; this.hand = []; this.graveyard = []; this.exile = []; this.command = [];
      this.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      this.poolMeta = [];           // restricted/persistent mana entries {color,n,restrict,persist}
      this.landsPlayed = 0;
      this.maxLands = 1;
      this.commanders = [];         // CardInst[] — 1 ili 2 (partneri), bez obzira na zonu
      this.chosenCommanders = null; // string[] — izbor igrača prije buildDeck
      this.commanderDamage = {};    // by commander iid
      this.lost = false;
      this.controller = null;       // decision maker
      this.isAI = false;
      this.deck = null;
      this.colorIdentity = [];
      this.turnState = this.freshTurnState();
      this.cityBlessing = false;
      this.emblems = [];
      this.skipUntapOnce = false;
      this.turnsStarted = 0;
    }
    freshTurnState() {
      return {
        spellsCast: 0, nonCreatureSpells: 0, spellsCastList: [], lifeGained: 0, lifeLost: 0, lifeLossEvents: 0,
        manaSpentOnSpells: 0, expendFired: {}, landsEntered: 0, tokensCreated: 0,
        creaturesDiedUnder: 0, drewThisTurn: 0, firstSpellDone: false, secondSpellDone: false,
        gainedLifeFirst: false, attackedMe: [], artifactAbilitiesActivated: 0, combatDamageHits: [],
        // Entry history is rules state, not a battlefield snapshot. Galadriel
        // must still remember an Elf that entered earlier this turn even if it
        // died, was bounced, or entered before Galadriel herself.
        elfEntries: [],
      };
    }
    opponents(g) { return g.players.filter(p => p !== this && !p.lost); }
    hasCmdInPlayOrCmd() { return true; }
    // UKUPNO castova komandera (za Commander's Insignia i sl.)
    get commanderCasts() {
      let n = 0;
      for (const c of this.commanders) n += (c.cmdCasts || 0);
      return n;
    }
    // legacy setter (testovi/skripte): upiši sve na prvog komandera
    set commanderCasts(v) {
      for (let i = 0; i < this.commanders.length; i++) this.commanders[i].cmdCasts = i === 0 ? v : 0;
    }
  }
  MTG.Player = Player;

  // ============================================================
  // Game
  // ============================================================
  class Game {
    constructor(opts) {
      this.opts = opts;
      this.rnd = U.mulberry32(opts.seed || 42);
      this.players = [];
      this.battlefield = [];
      this.stack = [];
      this.pendingTriggers = [];
      this.delayed = [];            // delayed triggers
      this.untilEffects = [];       // global until-eot effects
      this.turn = 0;
      this.turnPlayer = null;
      this.phase = 'setup';
      this.step = '';
      this.log = [];
      this.onEvent = opts.onEvent || (() => {});
      this.gameOver = false;
      this.winner = null;
      this.combat = null;
      this.turnNo = 0;
      this.extraTurnDepth = 0;
      this.dieRolls = 0;
      this.uiHooks = opts.uiHooks || {};
      this.diedThisTurn = [];       // card snapshots
      this.maxTurns = opts.maxTurns || 200;
      this.paced = !!opts.paced;    // vizuelno tempiranje AI akcija (samo u browseru)
      this.speedFactor = 1;
      // kućna pravila (default = zvanična pravila)
      this.houseRules = Object.assign({ sumPartnerDamage: false }, opts.houseRules || {});
    }

    // pauza da igrač VIDI svaku AI akciju zasebno — poštuje redoslijed i sekvence
    async pace(ms) {
      if (!this.paced || this.gameOver || !ms) return;
      await new Promise(r => setTimeout(r, Math.round(ms * this.speedFactor)));
    }

    // ljudski igrač za stolom (za "reflektor" na AI akcije koje ga diraju)
    human() {
      if (this._human === undefined) this._human = this.players.find(p => !p.isAI) || null;
      return this._human;
    }
    // je li meta ljudski igrač ili njegov permanent?
    hitsHuman(targets) {
      const hu = this.human();
      if (!hu) return false;
      for (const t of (targets || []).flat()) {
        if (!t) continue;
        if (t === hu) return true;
        if (t.ctrl === hu || (t.owner === hu && t.zone !== 'battlefield')) return true;
      }
      return false;
    }
    // koje od meta pripadaju ljudskom igraču (permanent, karta, spell na stacku, on sam)
    humanTargets(targets) {
      const hu = this.human();
      if (!hu) return [];
      const out = [];
      for (const t of (targets || []).flat()) {
        if (!t) continue;
        if (t === hu) { out.push(t); continue; }
        if (t.ctrl === hu) { out.push(t); continue; }          // permanent ILI spell na stacku
        if (t.owner === hu && t.zone && t.zone !== 'battlefield') out.push(t);
      }
      return out;
    }

    // PAUZA + prikaz karte: bot je uperio removal/counter/exile… u mene
    async alertHuman(payload) {
      const hu = this.human();
      this.note('threat', payload);
      if (!this.paced || !hu || !hu.controller || this.gameOver) {
        await this.pace(payload.ms || 1200);
        return null;
      }
      const ans = await hu.controller.decide(this, Object.assign({ type: 'threatAlert', player: hu }, payload));
      return ans;
    }

    // Pokaži ljudskom igraču na sredini ekrana ono što NIJE prošlo kroz stack —
    // tokene i permanente koji uđu bez bacanja (reanimacija, "put onto the
    // battlefield"…) — pa čekaj njegov Proceed. Landovi se preskaču.
    async revealToHuman(payload) {
      const hu = this.human();
      if (!this.paced || !hu || !hu.controller || this.gameOver) return null;
      if (payload.ctrl === hu) return null;          // vlastite poteze ne prekidamo
      const cards = (payload.cards || []).filter(c => c && !c.is('Land'));
      if (!cards.length) return null;
      return hu.controller.decide(this, Object.assign({}, payload, { type: 'cardReveal', player: hu, cards }));
    }

    // Svaki stvarno proglašeni napad dobija blokirajući pregled za čovjeka,
    // čak i kad nijedan napadač ne ide na njega. Ovo je UX checkpoint, ne
    // priority prozor, pa ne mijenja redoslijed ni Commander pravila.
    async reviewCombatWithHuman(payload) {
      const hu = this.human();
      if (!this.paced || !hu || !hu.controller || this.gameOver) return null;
      const attackers = (payload && payload.attackers || []).filter(Boolean);
      if (!attackers.length) return null;
      return hu.controller.decide(this, Object.assign({}, payload, {
        type: 'combatReview', player: hu, attackers,
      }));
    }

    // istakni AI akciju usmjerenu na igrača i daj mu vremena da je pročita
    async spotlight(text, opts) {
      opts = opts || {};
      this.lg(text, opts.cls || 'spot');
      this.note('spotlight', { text, kind: opts.kind || 'info' });
      await this.pace(opts.ms || 1200);
    }

    // ------------- logging -------------
    lg(msg, cls) {
      this.log.push({ t: this.turnNo, msg, cls: cls || '' });
      if (this.log.length > 900) this.log.splice(0, 200);
      this.onEvent({ type: 'log', msg, cls });
    }
    note(type, data) { this.onEvent(Object.assign({ type }, data)); }

    // Jedinstven, uvijek vidljiv kanal za efekte koje je ranije bilo lako
    // propustiti u logu (kopije, counteri, privremeno/dodijeljene sposobnosti).
    notifyEffect(text, data = {}, addToLog = true) {
      if (!text) return;
      if (addToLog) this.lg(text, 'effect');
      this.note('effectNotice', Object.assign({ text }, data));
    }

    // ------------- setup -------------
    addPlayer(name, deck, controller, isAI) {
      const p = new Player(name, this.players.length);
      p.game = this;
      p.controller = controller; p.isAI = isAI; p.deck = deck;
      this.players.push(p);
      return p;
    }

    buildDeck(p, deckData, defs, chosen) {
      // izbor komandera: eksplicitno prosljeđen → p.chosenCommanders → face commander iz deka
      let want = chosen || p.chosenCommanders || [deckData.commander];
      want = want.filter(Boolean).slice(0, 2);
      const check = MTG.validateCommanders ? MTG.validateCommanders(deckData, want, defs) : { ok: true };
      if (!check.ok) {
        this.lg(`⚠️ Nevažeći izbor komandera (${check.why}) — koristim ${deckData.commander}.`, 'warn');
        want = [deckData.commander];
      }
      const need = {};
      for (const n of want) need[n] = (need[n] || 0) + 1;
      const picked = {};
      for (const entry of deckData.cards) {
        for (let i = 0; i < entry.n; i++) {
          const def = defs[entry.name];
          if (!def) throw new Error('No def for ' + entry.name);
          const c = new CardInst(def, p);
          if (need[entry.name] > 0) {
            need[entry.name]--;
            c.commander = true; c.cmdCasts = 0; c.zone = 'command';
            picked[entry.name] = c;
          } else p.library.push(c);
        }
      }
      // poštuj redoslijed izbora
      for (const n of want) if (picked[n]) { p.command.push(picked[n]); p.commanders.push(picked[n]); }
      p.commanderNames = p.commanders.map(c => c.name);
      const cs = new Set();
      for (const commander of p.commanders)
        for (const col of MTG.cardColorIdentity ? MTG.cardColorIdentity(commander.def) : U.colorsOfCost(commander.def.cost || '')) cs.add(col);
      p.colorIdentity = COLORS.filter(c => cs.has(c));
    }

    async start() {
      for (const p of this.players) {
        U.shuffle(p.library, this.rnd);
      }
      // opening hands with one free mulligan (Commander), then London
      for (const p of this.players) await this.openingHand(p);
      this.turnPlayer = this.players[0];
      this.lg(`Igra počinje. Redoslijed: ${this.players.map(p => p.name).join(' → ')}.`);
      await this.runGame();
    }

    async openingHand(p) {
      let mulls = 0, free = true, keeping = false;
      while (!keeping) {
        // return hand, shuffle, draw 7
        while (p.hand.length) { const c = p.hand.pop(); c.zone = 'library'; p.library.push(c); }
        U.shuffle(p.library, this.rnd);
        for (let i = 0; i < 7 && p.library.length; i++) {
          const c = p.library.pop(); c.zone = 'hand'; p.hand.push(c);
        }
        const canMull = p.hand.length > 0 && mulls < 7;
        const doMull = canMull && await p.controller.decide(this, { type: 'mulligan', player: p, mulls, free });
        if (doMull) {
          if (free) free = false; else mulls++;
          this.lg(`${p.name} mulliganuje.`);
        } else keeping = true;
      }
      if (mulls > 0) {
        const toBottom = await p.controller.decide(this, { type: 'bottomCards', player: p, n: mulls });
        for (const c of toBottom) {
          p.hand.splice(p.hand.indexOf(c), 1);
          c.zone = 'library';
          p.library.unshift(c);
        }
      }
      this.lg(`${p.name} zadržava ${p.hand.length} karata.`);
    }

    // ------------- helpers -------------
    bf() { return this.battlefield.filter(c => c.zone === 'battlefield' && !c.phasedOut); }
    creatures(p) { return this.bf().filter(c => c.is('Creature') && (!p || c.ctrl === p)); }
    lands(p) { return this.bf().filter(c => c.is('Land') && (!p || c.ctrl === p)); }
    byIid(iid) {
      const b = this.battlefield.find(c => c.iid === iid && c.zone === 'battlefield');
      if (b) return b;
      for (const p of this.players)
        for (const z of ['hand', 'graveyard', 'exile', 'command', 'library'])
          { const f = p[z].find(c => c.iid === iid); if (f) return f; }
      return null;
    }
    alivePlayers() { return this.players.filter(p => !p.lost); }
    nextPlayer(p) {
      const alive = this.players.filter(x => !x.lost);
      let i = this.players.indexOf(p);
      for (let k = 1; k <= this.players.length; k++) {
        const q = this.players[(i + k) % this.players.length];
        if (!q.lost) return q;
      }
      return p;
    }
    apnapFrom(p) {
      const out = []; let q = p;
      do { if (!q.lost) out.push(q); q = this.players[(this.players.indexOf(q) + 1) % this.players.length]; }
      while (q !== p);
      return out;
    }

    devotion(p, colors) {
      let n = 0;
      for (const c of this.bf()) if (c.ctrl === p) n += U.devotionPips(c.def.cost || '', colors);
      return n;
    }

    // ============================================================
    // Zone movement
    // ============================================================
    remove(card) {
      const zones = { battlefield: this.battlefield };
      if (card.zone === 'battlefield') {
        const i = this.battlefield.indexOf(card); if (i >= 0) this.battlefield.splice(i, 1);
      } else if (card.zone === 'stack') {
        const i = this.stack.findIndex(s => s.card === card); if (i >= 0) this.stack.splice(i, 1);
      } else {
        const arr = card.owner[card.zone];
        if (arr) { const i = arr.indexOf(card); if (i >= 0) arr.splice(i, 1); }
      }
    }

    snapshot(card) {
      return {
        iid: card.iid, name: card.name, def: card.def, ctrl: card.ctrl, owner: card.owner,
        isToken: card.isToken, power: card.power, toughness: card.toughness,
        commander: card.commander, attacking: card.attacking, plus1: card.plus1(),
        minus1: card.counters['-1/-1'] || 0,
        counters: Object.assign({}, card.counters),
        types: card.cur ? card.cur.types.slice() : card.def.types.slice(),
        subtypes: card.cur ? card.cur.subtypes.slice() : card.def.subtypes.slice(),
        attachments: card.attachments.slice(), mv: card.mv, colors: card.colors,
        // Keywordi u trenutku odlaska. Bez ovoga je snap.flying bio undefined,
        // pa se Luminous Broodmoth okidao i na stvorenja koja su umrla SA
        // letenjem → beskonačna petlja sa Selfless Spiritom.
        kw: card.cur ? [...card.cur.kw] : [],
        flying: !!(card.cur && card.cur.kw.has('flying')),
      };
    }

    async move(card, toZone, opts = {}) {
      const fromZone = card.zone;
      const wasBattlefield = fromZone === 'battlefield';
      const snap = this.snapshot(card);

      // Unearth replacement: ako bi permanent napustio bojno polje iz bilo
      // kojeg razloga, ide u egzil umjesto u drugu zonu.
      if (wasBattlefield && card.meta && card.meta.unearth && toZone !== 'exile') {
        toZone = 'exile';
        opts = Object.assign({}, opts, { noCmdReplace: true });
      }

      // commander zone replacement
      if (card.commander && ['graveyard', 'exile', 'hand', 'library'].includes(toZone) && !opts.noCmdReplace) {
        const zoneLabels = { graveyard: 'Groblje', exile: 'Egzil', hand: 'Ruka', library: 'Biblioteka' };
        const keep = await card.owner.controller.decide(this, {
          type: 'chooseOption', prompt: `${card.name}: vrati u command zonu?`,
          options: [{ key: 'cz', label: 'Command zona' }, { key: 'stay', label: zoneLabels[toZone] }],
          aiHint: { kind: 'commanderZone', card, toZone },
        });
        if (keep === 'cz') toZone = 'command';
      }

      // persist / undying (death replacements to return later — handled post-dies for simplicity)

      this.remove(card);

      if (wasBattlefield) {
        // detach everything
        for (const aid of card.attachments.slice()) {
          const a = this.byIid(aid);
          if (a) { a.attachedTo = null; if (a.hasSub('Aura')) await this.move(a, 'graveyard'); }
        }
        card.attachments = [];
        if (card.attachedTo) {
          const host = this.byIid(card.attachedTo);
          if (host) host.attachments = host.attachments.filter(i => i !== card.iid);
          card.attachedTo = null;
        }
      }

      card.tapped = opts.tapped || false;
      card.damage = 0; card.deathtouched = false; card.regenShield = 0;
      card.attacking = null; card.blocking = null; card.blockedBy = [];
      card.faceDown = false;
      if (wasBattlefield && card.meta.faceDownDef) {
        card.def = card.meta.faceDownDef;
        delete card.meta.faceDownDef;
        delete card.meta.faceDownKind;
      }
      if (wasBattlefield && card.meta.characteristicOriginalDef) {
        card.def = card.meta.characteristicOriginalDef;
        card.isCopyOf = null;
        delete card.meta.characteristicOriginalDef;
      }
      // card.meta se NAMJERNO ne briše pri odlasku sa bojnog polja: "leaves the
      // battlefield"/"dies" trigeri se tek stavljaju na stack i rezolviraju se
      // KASNIJE (flushTriggers), a mnogi čitaju baš meta izvora — Colfenor's Urn,
      // Skyclave Apparition, Grothama. Brisanjem ovdje su svi tiho otkazivali.
      // Umjesto toga se meta resetuje pri ULASKU na bojno polje (novi objekat).
      if (toZone !== 'battlefield') { card.counters = {}; card.sick = true; }

      if (card.isToken && toZone !== 'battlefield') {
        card.zone = 'ceased';
        if (wasBattlefield) {
          if (toZone === 'graveyard') { this.diedThisTurn.push(snap); await this.fireLeaveAndDie(card, snap, true); }
          else await this.fireLeaveAndDie(card, snap, false);
        }
        return card;
      }

      card.zone = toZone;
      if (toZone === 'battlefield') {
        card.ctrl = opts.ctrl || card.owner;
        card.timestamp = ++IID;
        this.battlefield.push(card);
        card.sick = true;
        // CR 400.7: permanent koji uđe na bojno polje je NOV objekat — svjež meta.
        if (fromZone !== 'battlefield') card.meta = {};
        if (opts.faceDownDef) {
          card.meta.faceDownDef = opts.faceDownDef;
          card.meta.faceDownKind = opts.faceDownKind || 'manifest';
          card.faceDown = true;
        }
        card.meta._enteredTurn = this.turnNo;
        if (card.hasSub && card.hasSub('Elf')) card.ctrl.turnState.elfEntries.push(card.iid);
        await this.handleETB(card, opts);
        // Permanent koji NIJE bačen (reanimacija, "put onto the battlefield",
        // blink) nikad se ne pojavi na stacku, pa ga igrač inače ne bi vidio.
        // Tokene pokriva makeTokens, landove namjerno preskačemo.
        if (!card.isToken && fromZone !== 'stack' && fromZone !== 'battlefield') {
          await this.revealToHuman({ cards: [card], ctrl: card.ctrl, kind: 'enters' });
        }
      } else {
        card.ctrl = card.owner;
        const arr = card.owner[toZone];
        if (opts.toBottom) arr.unshift(card); else arr.push(card);
        if (wasBattlefield) {
          if (toZone === 'graveyard') { this.diedThisTurn.push(snap); await this.fireLeaveAndDie(card, snap, true); }
          else await this.fireLeaveAndDie(card, snap, false);
        } else if (toZone === 'graveyard') {
          await this.emit('cardToGraveyard', { card, from: fromZone });
        }
      }
      this.recalc();
      return card;
    }

    async fireLeaveAndDie(card, snap, died) {
      this.recalc();
      await this.emit('lto', { card, snap });
      if (died) {
        this.turnPlayer && (snap.ctrl.turnState.creaturesDiedUnder += snap.types.includes('Creature') ? 1 : 0);
        await this.emit('dies', { card, snap });
        // persist / undying
        const d = card.def;
        if (snap.types.includes('Creature') && card.zone === 'graveyard') {
          if (d.undying && !snap.plus1) {
            this.lg(`${card.name} se vraća (undying).`);
            await this.move(card, 'battlefield', { ctrl: snap.owner });
            this.addCounters(card, '+1/+1', 1);
          } else if (d.persist && !(snap.minus1 > 0)) {
            this.lg(`${card.name} se vraća (persist).`);
            await this.move(card, 'battlefield', { ctrl: snap.owner });
            this.addCounters(card, '-1/-1', 1);
          }
        }
      }
    }

    async handleETB(card, opts) {
      let d = card.def;
      card.meta = card.meta || {};
      // Copy i drugi as-enters replacementi postavljaju karakteristike prije
      // enters-tapped i enters-with-counters replacementa kopirane karte.
      if (d.asEnters) {
        await d.asEnters(this, card);
        d = card.def;
      }
      if (d.entersTapped && !opts.forceUntapped) {
        let t = typeof d.entersTapped === 'function' ? await d.entersTapped(this, card) : d.entersTapped;
        if (t) card.tapped = true;
      }
      if (opts.tapped) card.tapped = true;
      if (card.is('Creature') && this.bf().some(source =>
        source.ctrl !== card.ctrl && source.def.opponentsCreaturesEnterTapped)) {
        card.tapped = true;
      }
      if (d.etbCounters) {
        let n = typeof d.etbCounters.n === 'function' ? d.etbCounters.n(this, card) : d.etbCounters.n;
        if (n > 0 && d.etbCounters.kind === '+1/+1') n = this.adjustPlusCounters(card, n);
        if (n > 0) {
          card.counters[d.etbCounters.kind] = (card.counters[d.etbCounters.kind] || 0) + n;
          this.notifyEffect(`◆ ${card.name} ulazi sa ${n} ${d.etbCounters.kind} ${U.plural(n, 'counterom', 'countera')}.`, {
            kind: 'counter', card, counterKind: d.etbCounters.kind, n,
          });
        }
      }
      if (card.castMeta && card.castMeta.grantedSunburstColors > 0) {
        const kind = card.is('Creature') ? '+1/+1' : 'charge';
        card.counters[kind] = (card.counters[kind] || 0) + card.castMeta.grantedSunburstColors;
        this.notifyEffect(`◆ ${card.name}: sunburst dodaje ${card.castMeta.grantedSunburstColors} ${kind} countera.`, {
          kind: 'counter', card, counterKind: kind, n: card.castMeta.grantedSunburstColors,
        });
      }
      if (d.loyalty && card.is('Planeswalker')) {
        card.counters['loyalty'] = parseInt(d.loyalty, 10) + (card.meta.additionalLoyaltyCounters || 0);
        if (d.compleated && card.castMeta && card.castMeta.phyrexianLifePaid > 0) {
          card.counters['loyalty'] = Math.max(0, card.counters['loyalty'] - 2);
        }
        this.notifyEffect(`◆ ${card.name} ulazi sa ${card.counters['loyalty']} loyalty countera.`, {
          kind: 'counter', card, counterKind: 'loyalty', n: card.counters['loyalty'],
        });
      }
      // additional +1/+1 counters replacements (Grumgully)
      if (card.is('Creature')) {
        for (const r of this.replacers('etbCounters')) {
          if (r.run(this, card, r.src)) {
            const nn = typeof r.n === 'function' ? r.n(this, card, r.src) : (r.n || 1);
            if (nn > 0) this.addCounters(card, '+1/+1', nn, true);
          }
        }
        for (const player of this.players) for (const source of player.graveyard) {
          if (!source.def.graveyardEtbCounters) continue;
          const nn = source.def.graveyardEtbCounters(this, source, card) || 0;
          if (nn > 0) this.addCounters(card, '+1/+1', nn, true);
        }
      }
      if (d.saga) { card.counters['lore'] = 0; }
      this.recalc();
      const evData = { card, ctrl: card.ctrl };
      if (card.is('Land')) {
        card.ctrl.turnState.landsEntered++;
        await this.emit('landfall', evData);
      }
      await this.emit('etb', evData);
      if (d.saga) await this.sagaChapter(card);
    }

    async sagaChapter(card) {
      const next = (card.counters['lore'] || 0) + 1;
      card.counters['lore'] = next;
      this.notifyEffect(`◆ ${card.name}: lore counter ${next}.`, { kind: 'counter', card, counterKind: 'lore', n: 1 });
      const ch = card.def.saga[next - 1];
      if (ch) {
        this.lg(`${card.name} — poglavlje ${next}.`);
        this.queueTrigger({ src: card, name: `Poglavlje ${next}`, run: ch.run, targets: ch.targets, opt: ch.opt });
      }
      if (next >= card.def.saga.length) card.meta.sagaDone = true;
    }

    // ============================================================
    // Tokens & counters
    // ============================================================
    async makeTokens(spec, ctrl, opts = {}) {
      // spec: token def name from MTG.TOKENS or inline def; opts: {n, tapped, attacking, copyOf}
      let n = opts.n || 1;
      let defs = [];
      for (let i = 0; i < n; i++) defs.push(spec);
      // token replacements (Academy Manufactor, Chatterfang)
      if (!opts.noReplace) {
        for (const r of this.replacers('createToken')) {
          if (r.ctrl === ctrl) defs = await r.run(this, defs, ctrl, r.src) || defs;
        }
        // privremeno dupliranje tokena (Kaya -2)
        if (this.untilEffects.some(e => e.kind === 'tokenDouble' && e.who === ctrl)) defs = defs.concat(defs.slice());
      }
      const made = [];
      for (const sp of defs) {
        const def = typeof sp === 'string' ? MTG.TOKENS[sp] : sp;
        if (!def) { continue; }
        const c = new CardInst(def, ctrl);
        c.isToken = true;
        if (opts.copyOf) c.isCopyOf = opts.copyOf;
        c.zone = 'nowhere';
        await this.move(c, 'battlefield', { ctrl, tapped: opts.tapped });
        if (opts.attacking && this.combat) { c.attacking = opts.attacking; c.sick = false; this.combat.attackers.push(c); }
        if (opts.haste) c.meta.tempHaste = true;
        made.push(c);
        ctrl.turnState.tokensCreated++;
      }
      if (made.length) {
        const names = {};
        for (const m of made) names[m.name] = (names[m.name] || 0) + 1;
        this.lg(`${ctrl.name} pravi ${Object.entries(names).map(([k, v]) => v > 1 ? `${v}× ${k}` : k).join(', ')}.`, 'token');
        await this.emit('tokensCreated', { ctrl, tokens: made });
        // tokeni ne prolaze kroz stack — pokaži ih na sredini i sačekaj Proceed
        await this.revealToHuman({ cards: made, ctrl, kind: 'tokens' });
      }
      this.recalc();
      return made;
    }

    faceDownCreatureDef(kind) {
      const cloaked = kind === 'cloak';
      return {
        name: 'Face-down creature', cost: null, super: [], types: ['Creature'], subtypes: [],
        power: '2', toughness: '2', colorsOverride: [], kws: [],
        oracle: cloaked
          ? 'Face-down 2/2 creature with ward {2}. Its controller may turn it face up if it is a creature card.'
          : 'Face-down 2/2 creature. Its controller may turn it face up if it is a creature card.',
        ward: cloaked ? { mana: '{2}' } : null,
      };
    }

    async putFaceDown(player, card, kind = 'manifest') {
      if (!player || !card) return null;
      const originalDef = card.def;
      card.def = this.faceDownCreatureDef(kind);
      await this.move(card, 'battlefield', {
        ctrl: player, faceDownDef: originalDef, faceDownKind: kind,
      });
      this.lg(`${player.name} stavlja kartu licem nadolje kao 2/2${kind === 'cloak' ? ' sa ward {2}' : ''}.`);
      this.notifyEffect(`🃏 ${player.name}: nova face-down 2/2 karta.`, { kind: 'faceDown', card, player }, false);
      return card;
    }

    async manifestCard(player, card) {
      return this.putFaceDown(player, card, 'manifest');
    }

    async manifestTop(player) {
      if (!player || !player.library.length) return null;
      return this.manifestCard(player, player.library[player.library.length - 1]);
    }

    // Manifest dread: pogledaj dvije, jednu manifestuj, drugu stavi u groblje.
    async manifestDread(player) {
      if (!player || !player.library.length) return null;
      const seen = player.library.slice(-2).reverse();
      let chosen = seen[0];
      if (seen.length > 1) {
        const pick = await player.controller.decide(this, {
          type: 'chooseCards', from: seen, min: 1, max: 1,
          prompt: 'Manifest dread: izaberi kartu koju manifestujes',
          aiHint: { kind: 'manifestDread' },
        });
        if (pick && seen.includes(pick[0])) chosen = pick[0];
      }
      const other = seen.find(card => card !== chosen) || null;
      const manifested = await this.manifestCard(player, chosen);
      if (other) await this.move(other, 'graveyard');
      this.lg(`${player.name} manifest dread${other ? ' i stavlja drugu kartu u groblje' : ''}.`);
      return manifested;
    }

    async cloakTop(player) {
      if (!player || !player.library.length) return null;
      return this.putFaceDown(player, player.library[player.library.length - 1], 'cloak');
    }

    faceUpCosts(card) {
      const original = card && card.meta && card.meta.faceDownDef;
      if (!original || !(original.types || []).includes('Creature')) return [];
      const costs = [{ kind: 'mana cost', cost: original.cost || '{0}' }];
      if (original.morph) costs.push({ kind: 'morph', cost: original.morph });
      if (original.disguise) costs.push({ kind: 'disguise', cost: original.disguise });
      return costs.filter((entry, index, all) => all.findIndex(other => other.cost === entry.cost) === index);
    }

    faceUpCost(card) {
      const costs = this.faceUpCosts(card);
      return costs.length ? costs[0].cost : null;
    }

    async turnFaceUp(player, card, chosenCost) {
      if (!card || card.zone !== 'battlefield' || card.ctrl !== player || !card.faceDown) return false;
      const original = card.meta.faceDownDef;
      const legalCosts = this.faceUpCosts(card);
      const selected = legalCosts.find(entry => entry.cost === chosenCost) || legalCosts[0];
      if (!original || !selected) return false;
      const costStr = selected.cost;
      if (!await this.payMana(player, U.parseCost(costStr), { card, isAbility: true })) return false;
      card.def = original;
      delete card.meta.faceDownDef;
      delete card.meta.faceDownKind;
      card.faceDown = false;
      this.recalc();
      this.lg(`${player.name} okrece ${card.name} licem gore.`, 'effect');
      this.notifyEffect(`🃏 ${card.name} je okrenut licem gore.`, { kind: 'faceUp', card, player }, false);
      await this.emit('turnedFaceUp', { card, player });
      await this.checkSBA();
      return true;
    }

    async copyPermanentToken(orig, ctrl, opts = {}) {
      const base = orig.isCopyOf ? orig.isCopyOf : orig.def;
      const def = Object.assign({}, base);
      if (opts.modPT) { def.power = String(opts.modPT[0]); def.toughness = String(opts.modPT[1]); }
      if (opts.nonlegendary) def.super = (def.super || []).filter(type => type !== 'Legendary');
      if (opts.addSubtypes) def.subtypes = [...new Set([...(def.subtypes || []), ...opts.addSubtypes])];
      if (opts.name) def.name = opts.name;
      const made = await this.makeTokens(def, ctrl, {
        n: opts.n || 1, copyOf: def, tapped: opts.tapped, attacking: opts.attacking,
        noReplace: opts.noReplace, haste: opts.haste,
      });
      return made;
    }

    adjustPlusCounters(card, n) {
      // Humongous Fungus (×2), High Score (+1) i sl.
      if (card.zone !== 'battlefield') return n;
      for (const b of this.bf()) {
        if (b.def.plusCountersAdjust && b.ctrl === card.ctrl) n = b.def.plusCountersAdjust(n, this, card, b);
      }
      return n;
    }
    addCounters(card, kind, n, silent) {
      if (n <= 0) return;
      if (kind === '+1/+1' && card.is && card.is('Creature')) n = this.adjustPlusCounters(card, n);
      const before = card.counters[kind] || 0;
      card.counters[kind] = (card.counters[kind] || 0) + n;
      const counterText = `${card.name}: +${n} ${kind} ${U.plural(n, 'counter', 'countera')}.`;
      if (!silent) this.lg(counterText);
      this.notifyEffect(`◆ ${counterText}`, { kind: 'counter', card, counterKind: kind, n }, !!silent);
      this.recalc();
      this.emitSync('countersAdded', { card, kind, n });
      if (kind === '+1/+1' && card.zone === 'battlefield' && card.is && card.is('Creature')) {
        if (this.turnPlayer) this.turnPlayer.turnState._putCounterThisTurn = (this.turnPlayer.turnState._putCounterThisTurn || 0) + 1;
        this.emit('plusAdded', { card, n, before, after: card.counters[kind], ctrl: card.ctrl }); // sync queue triggera
      }
    }
    removeCounters(card, kind, n) {
      card.counters[kind] = Math.max(0, (card.counters[kind] || 0) - n);
      this.recalc();
    }

    // ============================================================
    // Life / damage / draw
    // ============================================================
    async gainLife(p, n, srcCard) {
      if (n <= 0 || p.lost) return 0;
      // can't gain life?
      for (const c of this.bf()) {
        if (c.def.noLifegain === 'all') return 0;
        if (c.def.noLifegain === 'opps' && c.ctrl !== p) return 0;
      }
      for (const r of this.replacers('lifegain')) if (r.ctrl === p) n = r.run(this, n, p, r.src);
      p.life += n;
      const first = !p.turnState.gainedLifeFirst;
      p.turnState.gainedLifeFirst = true;
      p.turnState.lifeGained += n;
      this.note('life', { p });
      await this.emit('lifeGain', { player: p, n, first, srcCard });
      return n;
    }

    async becomeMonarch(player) {
      if (!player || player.lost || this.monarch === player) return;
      const previous = this.monarch;
      this.monarch = player;
      this.lg(`👑📜 ${player.name} postaje MONARH!`);
      await this.emit('monarchChanged', { previous, player });
    }

    async loseLife(p, n, why) {
      if (n <= 0 || p.lost) return 0;
      p.life -= n;
      p.turnState.lifeLost += n;
      p.turnState.lifeLossEvents++;
      this.note('life', { p });
      await this.emit('lifeLost', { player: p, n, events: p.turnState.lifeLossEvents });
      return n;
    }

    async damagePlayer(src, p, n, opts = {}) {
      if (n <= 0 || p.lost) return 0;
      const preventionAllowed = !this.bf().some(card => card.def.damageCantBePrevented);
      if (preventionAllowed && opts.combat && src && src.is && src.is('Creature') && !src.hasSub('Elf') &&
        this.untilEffects.some(e => e.kind === 'preventNonElfCombat')) {
        this.lg(`Galadhrim Ambush sprječava combat štetu od ${src.name}.`);
        await this.emit('damagePrevented', { src, target: p, player: p, n, combat: true });
        return 0;
      }
      // prevencije i preusmjerenja (Selfless Squire, Comeuppance, Deflecting Palm, Gideon's Sacrifice, Take the Bait)
      for (const e of this.untilEffects.slice()) {
        if (e.who !== p) continue;
        if ((e.kind === 'redirectToCreature' || e.kind === 'redirectAllDamage') &&
          !(opts._appliedRedirects && opts._appliedRedirects.has(e))) {
          const c = this.byIid(e.iid);
          if (c && c.zone === 'battlefield') {
            this.lg(`Šteta preusmjerena na ${c.name}.`);
            const applied = new Set(opts._appliedRedirects || []); applied.add(e);
            return this.damageCreature(src, c, n, Object.assign({}, opts, { _appliedRedirects: applied }));
          }
          continue;
        }
        if (preventionAllowed && e.kind === 'comeuppance' && src && src.ctrl !== p) {
          this.lg(`Comeuppance sprječava ${n} štete igraču ${p.name}.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: !!opts.combat });
          if (src.is && src.is('Creature')) {
            await this.damageCreature(e.sourceCard || null, src, n, Object.assign({}, opts, { combat: false }));
          } else if (src.ctrl) {
            await this.damagePlayer(e.sourceCard || null, src.ctrl, n, Object.assign({}, opts, { combat: false }));
          }
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventCombatToPlayer' && opts.combat) {
          this.lg(`Šteta igraču ${p.name} spriječena.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: true });
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventToPlayer') {
          this.lg(`Šteta igraču ${p.name} spriječena.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: !!opts.combat });
          if (e.reflectCreatures && src && src.is && src.is('Creature')) await this.damageCreature(null, src, n, {});
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventNextToPlayer' && (!e.source || e.source === src)) {
          this.untilEffects.splice(this.untilEffects.indexOf(e), 1);
          this.lg(`Sljedeća šteta igraču ${p.name} spriječena.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: !!opts.combat });
          if (e.reflectToController && src && src.ctrl) {
            // Deflecting Palm: šteta ide kontroloru izvora, ma šta izvor bio
            await this.damagePlayer(e.sourceCard || null, src.ctrl, n, Object.assign({}, opts, { combat: false }));
          } else if (e.reflect && src) {
            if (src.is && src.is('Creature')) await this.damageCreature(null, src, n, {});
            else if (src && src.ctrl) await this.damagePlayer(null, src.ctrl, n, {});
          }
          return 0;
        }
      }
      n = this.applyDamageReplacements(src, p, n, opts);
      if (n <= 0) return 0;
      this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete igraču ${p.name}.`, 'dmg');
      if (opts.combat && src && src.commander) {
        p.commanderDamage[src.iid] = (p.commanderDamage[src.iid] || 0) + n;
      }
      if (opts.combat && src && src.ctrl && src.ctrl.turnState) {
        src.ctrl.turnState.combatDamageHits.push({ card: src, ctrl: src.ctrl, player: p, n });
      }
      if (opts.combat && this.monarch === p && src && src.ctrl && src.ctrl !== p) {
        await this.becomeMonarch(src.ctrl);
      }
      if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
      p.turnState.damageTaken = (p.turnState.damageTaken || 0) + n;
      await this.loseLife(p, n, 'damage');
      await this.emit('damageToPlayer', { src, player: p, n, combat: !!opts.combat });
      if (!opts.deferSBA) await this.checkSBA();
      return n;
    }

    async damageCreature(src, target, n, opts = {}) {
      if (n <= 0 || target.zone !== 'battlefield') return 0;
      const preventionAllowed = !this.bf().some(card => card.def.damageCantBePrevented);
      if (preventionAllowed && opts.combat && src && src.is && src.is('Creature') && !src.hasSub('Elf') &&
        this.untilEffects.some(e => e.kind === 'preventNonElfCombat')) {
        this.lg(`Galadhrim Ambush sprječava combat štetu od ${src.name}.`);
        await this.emit('damagePrevented', { src, target, n, combat: true });
        return 0;
      }
      if (preventionAllowed && this.isProtectedFrom(target, src)) {
        this.lg(`${target.name}: zaštita sprječava štetu od ${src ? src.name : 'izvora'}.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        return 0;
      }
      for (const e of this.untilEffects.slice()) {
        if (e.kind === 'redirectAllDamage' && e.who === target.ctrl && e.iid !== target.iid &&
          !(opts._appliedRedirects && opts._appliedRedirects.has(e))) {
          const chosen = this.byIid(e.iid);
          if (chosen && chosen.zone === 'battlefield') {
            this.lg(`Šteta sa ${target.name} preusmjerena na ${chosen.name}.`);
            const applied = new Set(opts._appliedRedirects || []); applied.add(e);
            return this.damageCreature(src, chosen, n, Object.assign({}, opts, { _appliedRedirects: applied }));
          }
        }
        if (preventionAllowed && e.kind === 'comeuppance' && target.is('Planeswalker') &&
          e.who === target.ctrl && src && src.ctrl !== e.who) {
          this.lg(`Comeuppance sprječava ${n} štete planeswalkeru ${target.name}.`);
          await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
          if (src.is && src.is('Creature')) {
            await this.damageCreature(e.sourceCard || null, src, n, Object.assign({}, opts, { combat: false }));
          } else if (src.ctrl) {
            await this.damagePlayer(e.sourceCard || null, src.ctrl, n, Object.assign({}, opts, { combat: false }));
          }
          return 0;
        }
      }
      n = this.applyDamageReplacements(src, target, n, opts);
      if (n <= 0) return 0;
      // prevencija sve štete određenom stvorenju (Kurbis i sl.)
      if (preventionAllowed && this.untilEffects.some(e => e.kind === 'preventToCreature' && e.iid === target.iid)) {
        this.lg(`Šteta stvorenju ${target.name} je spriječena.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        return 0;
      }
      // shield counter: upija jedan damage event
      if (preventionAllowed && (target.counters['shield'] || 0) > 0) {
        this.removeCounters(target, 'shield', 1);
        this.lg(`${target.name}: shield counter upija štetu.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        await this.emit('shieldRemoved', { card: target });
        return 0;
      }
      if (target.is('Planeswalker')) {
        this.removeCounters(target, 'loyalty', n);
        this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete planeswalkeru ${target.name}.`, 'dmg');
        if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
        if (!opts.deferSBA) await this.checkSBA();
        return n;
      }
      if (src && src.iid !== undefined) {
        if (!target.meta._damageFrom || target.meta._damageFrom.turn !== this.turnNo) {
          target.meta._damageFrom = { turn: this.turnNo, ids: new Set() };
        }
        target.meta._damageFrom.ids.add(src.iid);
      }
      // wither: šteta stvorenjima postaje -1/-1 counteri
      const wither = (src && src.kw && src.kw('wither')) || this.bf().some(x => x.def.allDamageWither);
      if (wither) {
        if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
        this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete (wither → -1/-1): ${target.name}.`, 'dmg');
        await this.addM1(target, n, src ? src.ctrl : null, opts.deferSBA);
        await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
        if (!opts.deferSBA) await this.checkSBA();
        return n;
      }
      target.damage += n;
      if (src && src.kw && src.kw('deathtouch')) target.deathtouched = true;
      if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
      this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete: ${target.name}.`, 'dmg');
      await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
      if (!opts.deferSBA) await this.checkSBA();
      return n;
    }

    // -1/-1 counteri sa centralnim eventom ('m1Added') za Auntie Ool/Hapatra/Blowfly...
    async addM1(card, n, by, deferSBA) {
      if (n <= 0 || card.zone !== 'battlefield') return;
      this.addCounters(card, '-1/-1', n);
      await this.emit('m1Added', { card, n, by, ctrl: card.ctrl });
      if (!deferSBA) await this.checkSBA();
    }

    applyDamageReplacements(src, target, n, opts) {
      for (const r of this.replacers('damage')) {
        if (r.prevent && this.bf().some(card => card.def.damageCantBePrevented)) continue;
        n = r.run(this, { src, target, n, combat: !!opts.combat, noncombat: !opts.combat }, r.src);
      }
      return n;
    }

    async damageAny(src, target, n, opts = {}) {
      if (target instanceof Player) return this.damagePlayer(src, target, n, opts);
      return this.damageCreature(src, target, n, opts);
    }

    async draw(p, n, srcCard) {
      // Teferi's Ageless Insight: dupla vučenja (osim prvog u draw stepu)
      let total = n;
      const doublers = this.bf().filter(c => c.def.drawDouble && c.ctrl === p).length;
      if (doublers > 0 && n > 0) {
        let exempt = 0;
        if (this.phase === 'draw' && !p.turnState._firstDrawDone) exempt = 1;
        total = (n - exempt) * Math.pow(2, doublers) + exempt;
      }
      let drawn = 0;
      for (let i = 0; i < total; i++) {
        if (p.lost) break;
        if (!p.library.length) { p.deckedOut = true; await this.checkSBA(); break; }
        const c = p.library.pop();
        p.hand.push(c); c.zone = 'hand';
        drawn++;
        p.turnState.drewThisTurn++;
        if (this.phase === 'draw') p.turnState._firstDrawDone = true;
        await this.emit('draw', { player: p, card: c, srcCard, nth: p.turnState.drewThisTurn });
        // Miracle is a draw-triggered alternative cast, not a permanent-zone
        // ability. Queue it directly while the freshly drawn card is in hand;
        // it will be put on the stack after the current object finishes
        // resolving, matching the normal trigger/priority path.
        if (this.turnNo > 0 && p.turnState.drewThisTurn === 1 && c.def.miracle) {
          this.queueTrigger({
            src: c, ctrl: p, name: `Miracle ${c.def.miracle}`, opt: true,
            onlyIf: () => c.zone === 'hand',
            run: async ctx => {
              if (c.zone !== 'hand') return;
              ctx.g.lg(`${ctx.you.name} otkriva ${c.name} za Miracle ${c.def.miracle}.`);
              await ctx.g.castSpell(ctx.you, c, {
                from: 'hand', alt: { altCostStr: c.def.miracle, speed: 'instant', miracle: true },
              });
            },
          });
        }
      }
      if (drawn) this.lg(`${p.name} vuče ${drawn} ${U.plural(drawn, 'kartu', 'karte')}.`, 'draw');
      this.note('hand', { p });
      return drawn;
    }

    async mill(p, n) {
      const milled = [];
      for (let i = 0; i < n && p.library.length; i++) {
        const c = p.library.pop();
        await this.move(c, 'graveyard');
        milled.push(c);
      }
      if (milled.length) this.lg(`${p.name} melje ${milled.length} karata.`);
      return milled;
    }

    async discard(p, cards) {
      let landsN = 0;
      for (const c of cards) {
        const wasLand = c.is('Land');
        await this.move(c, 'graveyard');
        c.meta._discardedTurn = this.turnNo; // za mayhem
        p.turnState.discardedN = (p.turnState.discardedN || 0) + 1;
        if (wasLand) landsN++;
        await this.emit('discarded', { player: p, card: c });
      }
      if (landsN) await this.emit('discardedLands', { player: p, n: landsN });
      if (cards.length) this.lg(`${p.name} odbacuje ${cards.length} karata.`);
    }

    // connive: vuci 1, odbaci 1; ako je odbačena nonland — +1/+1 counter (event 'connive')
    async connive(card) {
      const p = card.ctrl;
      if (!p || p.lost) return;
      await this.draw(p, 1);
      if (!p.hand.length) return;
      const pick = await p.controller.decide(this, {
        type: 'chooseCards', from: p.hand, min: 1, max: 1, prompt: `Connive (${card.name}): odbaci`, aiHint: { kind: 'addlDiscard' },
      });
      if (!pick.length) return;
      const wasLand = pick[0].is('Land');
      await this.discard(p, pick);
      if (!wasLand && card.zone === 'battlefield') this.addCounters(card, '+1/+1', 1);
      this.lg(`${card.name} connives.`);
      await this.emit('connive', { card, ctrl: p });
    }

    canSacrifice(card) {
      return !!card && card.zone === 'battlefield' && !(card.cur && card.cur.cantSacrifice);
    }

    async sacrifice(p, card) {
      if (!this.canSacrifice(card)) {
        if (card && card.zone === 'battlefield') this.lg(`${card.name} ne može biti žrtvovan.`);
        return false;
      }
      this.lg(`${p.name} žrtvuje ${card.name}.`, 'sac');
      await this.move(card, 'graveyard');
      await this.emit('sacrificed', { player: p, card });
      return true;
    }

    async destroy(card, opts = {}) {
      if (card.zone !== 'battlefield') return false;
      if (card.kw('indestructible') && !opts.ignoreIndestructible) {
        this.lg(`${card.name} je indestructible — preživljava.`);
        return false;
      }
      if ((card.counters['shield'] || 0) > 0 && !opts.ignoreIndestructible) {
        this.removeCounters(card, 'shield', 1);
        card.damage = 0; card.deathtouched = false;
        this.lg(`${card.name}: shield counter sprječava uništenje.`);
        await this.emit('shieldRemoved', { card });
        return false;
      }
      if (card.regenShield > 0 && !opts.noRegen) {
        card.regenShield--;
        card.tapped = true; card.damage = 0; card.deathtouched = false;
        if (this.combat) this.removeFromCombat(card);
        this.lg(`${card.name} se regeneriše.`);
        return false;
      }
      await this.move(card, 'graveyard');
      return true;
    }

    async destroyMany(cards, opts = {}) {
      // "Destroy all" je simultan događaj: ko je indestructible/shielded ili
      // može regenerisati zaključava se prije nego prvi permanent napusti tablu.
      // Inače bi odlazak lorda/Spacecrafta usred petlje promijenio sudbinu
      // permanenata koji su bili zaštićeni u trenutku efekta.
      const unique = [...new Set(cards)].filter(card => card && card.zone === 'battlefield');
      const doomed = [];
      for (const card of unique) {
        if (card.kw('indestructible') && !opts.ignoreIndestructible) {
          this.lg(`${card.name} je indestructible — preživljava.`);
          continue;
        }
        if ((card.counters['shield'] || 0) > 0 && !opts.ignoreIndestructible) {
          this.removeCounters(card, 'shield', 1);
          card.damage = 0; card.deathtouched = false;
          this.lg(`${card.name}: shield counter sprječava uništenje.`);
          await this.emit('shieldRemoved', { card });
          continue;
        }
        if (card.regenShield > 0 && !opts.noRegen) {
          card.regenShield--;
          card.tapped = true; card.damage = 0; card.deathtouched = false;
          if (this.combat) this.removeFromCombat(card);
          this.lg(`${card.name} se regeneriše.`);
          continue;
        }
        doomed.push(card);
      }
      for (const card of doomed) if (card.zone === 'battlefield') await this.move(card, 'graveyard');
      return doomed.length;
    }

    async exileCard(card) {
      if (card.zone === 'ceased') return;
      await this.move(card, 'exile');
    }

    removeFromCombat(card) {
      if (!this.combat) return;
      const ci = this.combat.attackers.indexOf(card);
      if (ci >= 0) this.combat.attackers.splice(ci, 1);
      card.attacking = null;
      for (const a of this.combat.attackers) a.blockedBy = a.blockedBy.filter(b => b !== card);
      card.blocking = null;
    }

    tap(card) {
      if (!card || card.zone !== 'battlefield' || card.tapped) return false;
      card.tapped = true;
      const firstThisTurn = card.meta._firstTappedTurn !== this.turnNo;
      if (firstThisTurn) {
        card.meta._firstTappedTurn = this.turnNo;
      }
      void this.emit('becameTapped', { card, player: card.ctrl, firstThisTurn });
      return true;
    }

    phaseOut(card, phaseInFor) {
      if (!card || card.zone !== 'battlefield' || card.phasedOut) return false;
      const all = [card];
      for (const iid of card.attachments || []) {
        const attachment = this.byIid(iid);
        if (attachment && attachment.zone === 'battlefield') all.push(attachment);
      }
      for (const permanent of all) {
        permanent.phasedOut = true;
        permanent.meta.phaseInFor = phaseInFor || card.ctrl;
        this.removeFromCombat(permanent);
      }
      this.lg(`${card.name} phases out.`);
      this.recalc();
      this.note('phaseOut', { card, cards: all });
      return true;
    }

    phaseInFor(player) {
      const returning = this.battlefield.filter(c => c.zone === 'battlefield' && c.phasedOut && c.meta.phaseInFor === player);
      for (const card of returning) {
        card.phasedOut = false;
        delete card.meta.phaseInFor;
      }
      if (returning.length) {
        this.lg(`${player.name}: ${returning.length} permanenta phases in.`);
        this.recalc();
        this.note('phaseIn', { player, cards: returning });
      }
      return returning;
    }

    // ============================================================
    // Continuous effects — recalc
    // ============================================================
    replacers(event) {
      const out = [];
      for (const c of this.bf()) {
        if (c.cur && c.cur.abilitiesDisabled) continue;
        const reps = c.def.replace;
        if (!reps) continue;
        for (const r of reps) {
          if (r.event !== event) continue;
          if (r.cond && !r.cond(this, c)) continue;
          out.push({ ctrl: c.ctrl, src: c, run: r.run, n: r.n, prevent: !!r.prevent, priority: r.priority || 0 });
        }
      }
      out.sort((a, b) => a.priority - b.priority);
      return out;
    }

    recalc() {
      const bf = this.bf();
      // pass 0: base
      for (const c of bf) {
        const d = c.def;
        const cur = {
          types: d.types.slice(), subtypes: d.subtypes.slice(), super: (d.super || []).slice(),
          kw: new Set(d.kws || []),
          power: 0, toughness: 0, basePower: 0, baseToughness: 0,
          cantAttack: false, cantBlock: false, cantSacrifice: false, mustAttack: false,
          assignByToughness: false, allCreatureTypes: !!d.changeling,
          extraAbilities: [], wardCost: d.ward || null, extraMana: [],
          hexproof: false, shroud: false, cantBeBlockedBy: null, unblockable: false,
          protectionFrom: [],
          abilitiesDisabled: false,
          attackTaxes: [], loyalty: c.counters['loyalty'] || 0,
        };
        if (d.power !== undefined) {
          cur.basePower = d.power === '*' ? 0 : parseInt(d.power, 10) || 0;
          cur.baseToughness = d.toughness === '*' ? 0 : parseInt(d.toughness, 10) || 0;
        }
        c.cur = cur;
      }
      // pass 0.5: dinamički tipovi (Spacecraft station-prag i sl.)
      for (const c of bf) {
        if (c.def.dynTypes) {
          for (const t of c.def.dynTypes(this, c) || []) if (!c.cur.types.includes(t)) c.cur.types.push(t);
        }
      }
      // pass 1: type-changing + CDA + statics (timestamp order)
      const sorted = bf.slice().sort((a, b) => a.timestamp - b.timestamp);
      for (const c of sorted) {
        const st = c.def.statics;
        if (!st) continue;
        for (const s of st) {
          if (s.cond && !s.cond(this, c)) continue;
          if (s.phase === 1 && s.apply) s.apply(this, c, bf);
        }
      }
      // CDA power (Haughty Djinn etc.)
      for (const c of bf) {
        if (c.def.cdaPower) c.cur.basePower = c.def.cdaPower(this, c);
        if (c.def.cdaToughness) c.cur.baseToughness = c.def.cdaToughness(this, c);
      }
      for (const c of bf) { c.cur.power = c.cur.basePower; c.cur.toughness = c.cur.baseToughness; }
      // pass 2: static buffs/grants
      for (const c of sorted) {
        if (c.cur.abilitiesDisabled) continue;
        const st = c.def.statics;
        if (!st) continue;
        for (const s of st) {
          if (s.cond && !s.cond(this, c)) continue;
          if ((!s.phase || s.phase === 2) && s.apply) s.apply(this, c, bf);
        }
      }
      // emblems
      for (const p of this.players) for (const e of p.emblems) if (e.apply) e.apply(this, p, bf);
      // equipment/aura grants
      for (const c of bf) {
        if (c.attachedTo) {
          const host = this.byIid(c.attachedTo);
          const grant = c.cur.attachGrant || c.def.attachGrant;
          if (host && host.zone === 'battlefield' && grant) grant(this, c, host);
        }
      }
      // pass 3: counters
      for (const c of bf) {
        if (c.is('Creature')) {
          c.cur.power += (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
          c.cur.toughness += (c.counters['+1/+1'] || 0) - (c.counters['-1/-1'] || 0);
          c.cur.toughness -= (c.counters['-0/-1'] || 0);
          if ((c.counters['flying'] || 0) > 0) c.cur.kw.add('flying');
          // keyword counteri koje karte stvarno stavljaju (Spectacular Showdown…)
          for (const kwc of ['double strike', 'first strike', 'deathtouch', 'lifelink',
            'trample', 'vigilance', 'menace', 'reach', 'hexproof', 'indestructible']) {
            if ((c.counters[kwc] || 0) > 0) c.cur.kw.add(kwc);
          }
        }
      }
      // pass 4: until-EOT effects in timestamp order
      for (const e of this.untilEffects) {
        if (e.apply) e.apply(this, bf);
      }
      // pass 5: per-card temp flags
      for (const c of bf) {
        if (c.meta.tempHaste) c.cur.kw.add('haste');
        if (c.meta.suspected) { c.cur.kw.add('menace'); c.cur.cantBlock = true; }
        if (c.cur.kw.has('defender')) {
          // Weathered Sentinels: "can attack players who attacked you last turn
          // as though it didn't have defender" — bez ovoga je recalc svejedno
          // postavljao cantAttack, pa karta nikad nije mogla napasti.
          const revenge = c.def.canAttackRevenge &&
            (((c.ctrl.prevAttackers && c.ctrl.prevAttackers.size) || 0) +
             ((c.ctrl.lastAttackers && c.ctrl.lastAttackers.size) || 0)) > 0;
          c.cur.cantAttack = c.cur.cantAttack ||
            (!c.meta.canAttackDefender && !c.cur.defenderCanAttack && !revenge);
        }
      }
      // city's blessing
      for (const p of this.players) {
        if (!p.cityBlessing && bf.filter(c => c.ctrl === p).length >= 10) p.cityBlessing = true;
      }
      // Obavijesti samo kad se NOVA dodijeljena sposobnost/keyword pojavi.
      // Recalc se poziva cesto, pa se potpisi pamte na objektu karte da isti
      // stalni efekt ne proizvodi duplikate pri svakom osvjezavanju table.
      for (const c of bf) {
        const baseKeywords = new Set(c.def.kws || []);
        const features = [];
        for (const kw of c.cur.kw) if (!baseKeywords.has(kw)) features.push(`keyword: ${kw}`);
        for (const ability of c.cur.extraAbilities || []) {
          if (ability && ability.label) features.push(`sposobnost: ${ability.label}`);
        }
        const previous = new Set(c.meta._grantedFeatureNotices || []);
        for (const feature of features) {
          if (!previous.has(feature)) {
            this.notifyEffect(`✨ ${c.name} dobija ${feature}.`, { kind: 'abilityGrant', card: c, feature });
          }
        }
        c.meta._grantedFeatureNotices = features;
      }
    }

    // ============================================================
    // Events & triggers
    // ============================================================
    collectTriggers(name, data) {
      const found = [];
      const consider = (card, zoneOK) => {
        if (card.cur && card.cur.abilitiesDisabled) return;
        const trigs = card.def.triggers;
        if (!trigs) return;
        for (const t of trigs) {
          if (t.on !== name) continue;
          const zone = t.zone || 'battlefield';
          if (!zoneOK(zone)) continue;
          if (t.oncePerTurn && card.meta['_once_' + t.on] === this.turnNo) continue;
          try { if (t.filter && !t.filter(this, card, data)) continue; } catch (e) { continue; }
          found.push({ card, t });
        }
      };
      for (const c of this.bf()) consider(c, z => z === 'battlefield');
      // dying/leaving card's own leave-triggers
      if ((name === 'dies' || name === 'lto') && data.card) {
        const dc = data.card;
        if (!this.bf().includes(dc)) consider(dc, z => z === 'battlefield' || z === 'self');
      }
      // graveyard/exile/command zone triggers
      for (const p of this.players) {
        for (const c of p.graveyard) consider(c, z => z === 'graveyard');
        for (const c of p.exile) consider(c, z => z === 'exile');
      }
      // "When you cast this spell" — izvor je JOŠ na stacku, pa ga gornje petlje
      // ne vide. Bez ovoga Hydroid Krasis i slični nikad ne okinu.
      for (const so of this.stack) if (so.card) consider(so.card, z => z === 'stack');
      return found;
    }

    async emit(name, data) {
      const found = this.collectTriggers(name, data || {});
      for (const { card, t } of found) {
        if (t.oncePerTurn) card.meta['_once_' + t.on] = this.turnNo;
        // Veyran doubling: magecraft-style triggers fire twice
        let times = 1;
        if ((name === 'castIS' || name === 'spellCopied') && data && (data.player === card.ctrl || data.ctrl === card.ctrl)) {
          if (this.bf().some(v => v.def.doublesMagecraft && v.ctrl === card.ctrl)) times = 2;
        }
        for (const doubler of this.bf()) {
          if (doubler.ctrl === card.ctrl && doubler.def.doubleTriggerFilter &&
            doubler.def.doubleTriggerFilter(this, doubler, card, name, data)) times++;
        }
        // Krang: draw-uzrokovani trigeri tvojih permanenata okidaju dodatni put
        if (name === 'draw' && this.bf().some(v => v.def.doubleDrawTriggers && v.ctrl === card.ctrl)) times *= 2;
        for (let i = 0; i < times; i++) {
          this.queueTrigger({
            src: card,
            ctrl: typeof t.controller === 'function' ? t.controller(this, card, data || {}) : t.controller,
            name: t.desc || name, run: t.run, targets: t.targets, modes: t.modes,
            opt: t.opt, data, onlyIf: t.onlyIf,
          });
        }
      }
      // Emblemi nisu permanenti, ali njihove triggerovane sposobnosti i dalje
      // postoje u komandnoj zoni i moraju pratiti događaje u igri.
      for (const player of this.players) {
        for (const emblem of player.emblems || []) {
          for (const t of emblem.triggers || []) {
            if (t.on !== name || t.filter && !t.filter(this, emblem, data || {}, player)) continue;
            this.queueTrigger({
              src: emblem, ctrl: player, name: t.desc || name, run: t.run,
              targets: t.targets, opt: t.opt, data: data || {}, onlyIf: t.onlyIf,
            });
          }
        }
      }
      // delayed triggers
      const dl = this.delayed.filter(d => d.on === name && (!d.filter || d.filter(this, data)));
      for (const d of dl) {
        if (d.once !== false) this.delayed.splice(this.delayed.indexOf(d), 1);
        this.queueTrigger({ src: d.src, name: d.name || name, run: d.run, ctrl: d.ctrl, data, targets: d.targets });
      }
    }
    emitSync(name, data) { /* fire-and-forget for non-trigger notifications */ this.note(name, data || {}); }

    queueTrigger(tr) {
      this.pendingTriggers.push(tr);
    }

    async flushTriggers() {
      let stacked = 0;
      while (this.pendingTriggers.length) {
        const batch = this.pendingTriggers.splice(0, this.pendingTriggers.length);
        // APNAP order: aktivni igrač stavlja svoje triggere prvi, zatim ostali.
        // Ako isti igrač kontroliše više simultanih triggera, on bira njihov
        // redoslijed na stacku (lista ide od dna ka vrhu).
        const order = this.apnapFrom(this.turnPlayer || this.players[0]);
        const controllerOf = tr => tr.ctrl || (tr.src && tr.src.ctrl) || this.players[0];
        for (const ctrl of order) {
          let group = batch.filter(tr => controllerOf(tr) === ctrl);
          if (group.length > 1 && ctrl.controller && ctrl.controller.decide) {
            const chosen = await ctrl.controller.decide(this, {
              type: 'orderTriggers', player: ctrl, triggers: group.slice(),
              prompt: 'Poredaj simultane triggere (dno stacka → vrh stacka)',
            });
            if (Array.isArray(chosen) && chosen.length === group.length && chosen.every(tr => group.includes(tr))) {
              group = chosen;
            }
          }
          for (const tr of group) {
            if (await this.resolveTriggerNow(tr)) stacked++;
            if (this.gameOver) return stacked;
          }
        }
      }
      return stacked;
    }

    async resolveTriggerNow(tr) {
      // sigurnosni ventil: nijedna trigger petlja ne smije zamrznuti igru
      this._trigsThisTurn = (this._trigsThisTurn || 0) + 1;
      if (this._trigsThisTurn > 800) {
        if (this._trigsThisTurn === 801) this.lg('⚠️ Previše okidača u jednom potezu — sigurnosni ventil preskače ostatak.');
        return;
      }
      const ctrl = tr.ctrl || (tr.src ? tr.src.ctrl : this.players[0]);
      if (ctrl.lost) return;
      if (tr.onlyIf && !tr.onlyIf(this, tr.src, tr.data)) return;
      const ctx = { g: this, src: tr.src, you: ctrl, data: tr.data, targets: [] };
      // optional trigger?
      if (tr.opt) {
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `${tr.src ? tr.src.name : ''}: ${tr.name} — iskoristi?`,
          options: [{ key: 'yes', label: 'Da' }, { key: 'no', label: 'Ne' }],
          aiHint: { kind: 'optTrigger', src: tr.src, name: tr.name },
        });
        if (yes !== 'yes') return;
      }
      // Modalni trigger bira mod i mete dok se stavlja na stack, kao spell.
      // Ovo je bitno za "choose one" ETB sposobnosti: protivnici moraju vidjeti
      // i izabrani mod i mete prije nego što dobiju priority.
      let mode = null;
      if (tr.modes && tr.modes.list && tr.modes.list.length) {
        const options = tr.modes.list.map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => {
            const specs = typeof entry.targets === 'function'
              ? entry.targets(this, tr.src, tr.data || {})
              : entry.targets;
            return !(specs || []).some(spec => !spec.upTo &&
              this.legalTargets(spec, tr.src, ctrl).length < (spec.count || 1));
          })
          .map(({ entry, index }) => Object.assign({
            key: String(index), label: entry.label,
          }, entry.aiMeta || {}));
        if (!options.length) return;
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `${tr.src ? tr.src.name : ''}: izaberi mod`,
          options,
          aiHint: Object.assign({ kind: 'mode', src: tr.src }, tr.modes.aiHint || {}),
        });
        mode = Number.parseInt(picked, 10);
        if (!Number.isInteger(mode) || !tr.modes.list[mode]) mode = 0;
        ctx.mode = mode;
      }
      // Mete mogu zavisiti od trigger podatka (npr. "za svakog protivnika"
      // ili Batrocov X), pa ih računamo kada trigger ide na stack.
      let targetSpecs = typeof tr.targets === 'function'
        ? tr.targets(this, tr.src, tr.data || {})
        : tr.targets;
      if (mode !== null) {
        const selectedTargets = tr.modes.list[mode].targets;
        targetSpecs = typeof selectedTargets === 'function'
          ? selectedTargets(this, tr.src, tr.data || {})
          : selectedTargets || null;
      }
      if (targetSpecs && targetSpecs.length) {
        const ok = await this.pickTargets(ctx, targetSpecs, tr.src, ctrl);
        if (!ok) return; // no legal targets → fizzle
      }
      // put on stack as trigger — allow responses
      const so = {
        kind: 'trigger', name: (tr.src ? tr.src.name + ': ' : '') + (tr.name || 'trigger'),
        ctrl, ctx, run: tr.run, srcCard: tr.src, targetSpecs: targetSpecs || null, mode,
      };
      this.stack.push(so);
      this.note('stack', {});
      return true;
    }

    // ============================================================
    // Targeting
    // ============================================================
    isProtectedFrom(target, source) {
      if (!(target instanceof CardInst) || !target.cur || !source) return false;
      return (target.cur.protectionFrom || []).some(test => test(this, source, target));
    }

    legalTargets(spec, src, ctrl) {
      const out = [];
      const zone = spec.zone || 'battlefield';
      const checkProt = (c) => {
        if (!(c instanceof CardInst)) {
          // player target
          const p = c;
          if (spec.what === 'opponent' && p === ctrl) return false;
          for (const b of this.bf()) {
            if (b.def.playerHexproof && b.ctrl === p && ctrl !== p) return false;
          }
          return true;
        }
        if (zone === 'battlefield' && c.zone === 'battlefield' && c.ctrl !== ctrl) {
          if (c.cur.hexproof || c.kw('hexproof')) return false;
        }
        if (c.zone === 'battlefield' && (c.cur.shroud || c.kw('shroud'))) return false;
        if (c.zone === 'battlefield' && this.isProtectedFrom(c, src)) return false;
        return true;
      };
      if (spec.what === 'player' || spec.what === 'opponent') {
        for (const p of this.alivePlayers()) {
          if (spec.what === 'opponent' && p === ctrl) continue;
          if (spec.filter && !spec.filter(this, p, ctrl)) continue;
          if (!checkProt(p)) continue;
          out.push(p);
        }
        return out;
      }
      if (spec.what === 'any') { // creature, player, planeswalker
        for (const p of this.alivePlayers()) if (checkProt(p)) out.push(p);
        for (const c of this.bf()) {
          if (!(c.is('Creature') || c.is('Planeswalker'))) continue;
          if (!checkProt(c)) continue;
          out.push(c);
        }
        return out;
      }
      if (zone === 'battlefield') {
        for (const c of this.bf()) {
          if (spec.filter && !spec.filter(this, c, ctrl, src)) continue;
          if (!checkProt(c)) continue;
          out.push(c);
        }
      } else if (zone === 'graveyard') {
        const pools = spec.anyGraveyard ? this.players : [ctrl];
        for (const p of pools) for (const c of p.graveyard) {
          if (spec.filter && !spec.filter(this, c, ctrl, src)) continue;
          out.push(c);
        }
      } else if (zone === 'stack') {
        for (const so of this.stack) {
          if (!spec.filter || spec.filter(this, so, ctrl, src)) out.push(so);
        }
      }
      return out;
    }

    async pickTargets(ctx, specs, src, ctrl) {
      ctx.targets = [];
      const targetedNow = [];
      for (const spec of specs) {
        let cands = this.legalTargets(spec, src, ctrl);
        if (spec.differentFromPrevious && ctx.targets.length) {
          const previous = ctx.targets[ctx.targets.length - 1];
          const excluded = new Set(Array.isArray(previous) ? previous : [previous]);
          cands = cands.filter(candidate => !excluded.has(candidate));
        }
        const min = spec.upTo ? 0 : (spec.count || 1);
        const max = spec.count || 1;
        if (cands.length < min) return false;
        if (max === 0) { ctx.targets.push([]); continue; }
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseTargets', spec, candidates: cands, min: Math.min(min, cands.length), max,
          src, prompt: spec.prompt || 'Izaberi metu', aiHint: spec.aiHint,
        });
        if (!picked || (picked.length < min)) return false;
        // ward
        for (const t of picked.slice()) {
          if (t instanceof CardInst && t.ctrl !== ctrl && t.cur && t.cur.wardCost) {
            const paid = await this.payWard(ctrl, t);
            if (!paid) picked.splice(picked.indexOf(t), 1);
          }
        }
        if (picked.length < min) return false;
        for (const t of picked) if (t && t.iid !== undefined && t !== src) targetedNow.push(t);
        if (max === 1) ctx.targets.push(picked[0]);
        else ctx.targets.push(picked);
      }
      // 'targeted' — karte tipa Black Bolt reaguju kad ih neko cilja. Ranije ga
      // niko nije emitovao pa je okidač bio mrtav. Emituje se TEK kad su sve
      // mete izabrane: usred petlje bi okidač mogao promijeniti stanje table
      // dok se ostale mete još biraju.
      for (const t of targetedNow) await this.emit('targeted', {
        card: t, byPlayer: ctrl, src, isSpell: !!(ctx.so && ctx.so.kind === 'spell'),
      });
      return true;
    }

    async payWard(ctrl, target) {
      const w = target.cur.wardCost;
      if (w.blight) {
        const pool = this.creatures(ctrl);
        if (!pool.length) { this.lg(`${ctrl.name} ne može platiti Ward—Blight (nema stvorenja).`); return false; }
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Ward — stavi ${w.blight} -1/-1 countera na svoje stvorenje da ciljaš ${target.name}?`,
          options: [{ key: 'yes', label: `Blight ${w.blight}` }, { key: 'no', label: 'Odustani' }],
          aiHint: { kind: 'ward', target },
        });
        if (yes !== 'yes') return false;
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Blight ${w.blight}: izaberi svoje stvorenje`, aiHint: { kind: 'sacCost' },
        });
        if (!picked.length) return false;
        await this.addM1(picked[0], w.blight, ctrl);
        return true;
      }
      if (w.life) {
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Ward — plati ${w.life} života da ciljaš ${target.name}?`,
          options: [{ key: 'yes', label: `Plati ${w.life} života` }, { key: 'no', label: 'Odustani' }],
          aiHint: { kind: 'ward', target },
        });
        if (yes === 'yes') { await this.loseLife(ctrl, w.life, 'ward'); return true; }
        return false;
      }
      const cost = U.parseCost(w.mana);
      if (!this.canPayMana(ctrl, cost)) { this.lg(`${ctrl.name} ne može platiti ward za ${target.name}.`); return false; }
      const yes = await ctrl.controller.decide(this, {
        type: 'chooseOption', prompt: `Ward — plati ${w.mana} da ciljaš ${target.name}?`,
        options: [{ key: 'yes', label: `Plati ${w.mana}` }, { key: 'no', label: 'Odustani' }],
        aiHint: { kind: 'ward', target },
      });
      if (yes !== 'yes') return false;
      const ok = await this.payMana(ctrl, cost, null);
      return ok;
    }

    // ============================================================
    // State-based actions
    // ============================================================
    async checkSBA() {
      if (this._sbaRunning) { this._sbaAgain = true; return; }
      this._sbaRunning = true;
      try {
        let any = true;
        let guard = 0;
        while (any && guard++ < 30) {
          any = false;
          this.recalc();
          // "pobjeđuješ kad ovaj permanent ima N countera" (Darksteel Reactor).
          // State provjera, pa radi i kad counteri stignu izvana.
          for (const c of this.bf()) {
            const need = c.def.winAtCharge;
            if (!need || this.gameOver) continue;
            if ((c.counters['charge'] || 0) < need) continue;
            const w = c.ctrl;
            this.lg(`💥 ${w.name} POBJEĐUJE — ${c.name} sa ${need}+ charge countera!`, 'win');
            for (const q of this.players) if (q !== w) q.lost = true;
            this.gameOver = true; this.winner = w;
            this.note('gameover', { winner: w });
            return;
          }
          // players lose
          for (const p of this.players) {
            if (p.lost) continue;
            let dead = false, why = '';
            if (p.life <= 0) { dead = true; why = 'život na 0'; }
            if (p.deckedOut) { dead = true; why = 'prazna biblioteka'; }
            // 903.10a: 21 štete od ISTOG komandera. Kućno pravilo može tražiti zbir partnera.
            if (this.houseRules && this.houseRules.sumPartnerDamage) {
              const byOwner = {};
              for (const q of this.players) for (const c of q.commanders) byOwner[c.iid] = q.idx;
              const tot = {};
              for (const [iid, dmg] of Object.entries(p.commanderDamage)) {
                const k = byOwner[iid] !== undefined ? 'p' + byOwner[iid] : iid;
                tot[k] = (tot[k] || 0) + dmg;
              }
              for (const k in tot) if (tot[k] >= 21) { dead = true; why = 'commander šteta (21+, kućno pravilo: zbir partnera)'; }
            } else {
              for (const [iid, dmg] of Object.entries(p.commanderDamage)) {
                if (dmg >= 21) { dead = true; why = 'commander šteta (21+)'; }
              }
            }
            if (dead) { await this.playerLoses(p, why); any = true; }
          }
          if (this.gameOver) return;
          // +1/+1 / -1/-1 annihilate
          for (const c of this.bf()) {
            const p1 = c.counters['+1/+1'] || 0, m1 = c.counters['-1/-1'] || 0;
            if (p1 && m1) { const k = Math.min(p1, m1); c.counters['+1/+1'] -= k; c.counters['-1/-1'] -= k; }
          }
          this.recalc();
          // creatures die
          for (const c of this.bf()) {
            if (c.is('Creature')) {
              if (c.cur.toughness <= 0) {
                await this.move(c, 'graveyard'); any = true; continue;
              }
              if (c.damage >= c.cur.toughness || (c.deathtouched && c.damage > 0)) {
                const died = await this.destroy(c, {});
                if (died !== false) any = true;
                else if (!c.kw('indestructible')) { c.damage = 0; c.deathtouched = false; }
                // CR 702.12b: indestructible ne briše označenu štetu — ona ostaje
                // do cleanupa, pa stvorenje umire ako izgubi indestructible.
                continue;
              }
            }
            if (c.is('Planeswalker') && (c.counters['loyalty'] || 0) <= 0) {
              await this.move(c, 'graveyard'); any = true; continue;
            }
            // aura attachment legality (CR 704.5m)
            // `subtypes` umjesto hasSub: uz Maskwood Nexus (allCreatureTypes)
            // hasSub('Aura') vraća true za SVAKO stvorenje, pa je cijela tabla
            // odlazila u groblje.
            const subs = (c.cur && c.cur.subtypes) || c.def.subtypes || [];
            if (subs.includes('Aura')) {
              // Aura na IGRAČU (curse) nema attachedTo — prati igrača dok je u igri
              if (c.def.isPlayerAura) {
                const vic = c.meta && c.meta.cursedPlayer;
                if (vic && vic.lost) { await this.move(c, 'graveyard'); any = true; continue; }
              } else {
                const host = c.attachedTo ? this.byIid(c.attachedTo) : null;
                if (!host || host.zone !== 'battlefield') { await this.move(c, 'graveyard'); any = true; continue; }
              }
            }
            if (subs.includes('Equipment') && c.attachedTo) {
              const host = this.byIid(c.attachedTo);
              if (!host || host.zone !== 'battlefield' || !host.is('Creature')) {
                const h2 = host;
                if (h2) h2.attachments = h2.attachments.filter(i => i !== c.iid);
                c.attachedTo = null;
              }
            }
            // saga done
            if (c.def.saga && c.meta.sagaDone && !this.pendingTriggers.length) {
              await this.sacrifice(c.ctrl, c); any = true; continue;
            }
          }
          // legend rule
          const byName = {};
          for (const c of this.bf()) {
            if ((c.cur.super || []).includes('Legendary')) {
              const key = c.ctrl.idx + '|' + c.name;
              (byName[key] = byName[key] || []).push(c);
            }
          }
          for (const key of Object.keys(byName)) {
            const list = byName[key];
            const controller = list[0] && list[0].ctrl;
            if (list[0] && list[0].is('Creature') && controller &&
              this.bf().some(c => c.ctrl === controller && c.def.ignoreLegendRuleCreatures)) continue;
            if (list.length > 1) {
              // CR 704.5j: KONTROLOR bira koju zadržava — ne "najnovija".
              // Sa "najnovija" je token-kopija tvoje bafovane legende ubijala original.
              const worth = c => (c.isToken ? 0 : 1000) + (c.commander ? 500 : 0) +
                (c.counters['+1/+1'] || 0) * 10 + c.attachments.length * 5 + c.cur.toughness;
              list.sort((a, b) => worth(b) - worth(a) || b.timestamp - a.timestamp);
              let keep = list[0];
              const owner = keep.ctrl;
              if (owner && owner.controller && !owner.isAI) {
                const picked = await owner.controller.decide(this, {
                  type: 'chooseCards', from: list.slice(), min: 1, max: 1,
                  prompt: `Legend rule: zadrži jednu kopiju — ${keep.name}`,
                  aiHint: { kind: 'legendKeep' },
                });
                if (picked && picked[0]) keep = picked[0];
              }
              for (const c of list) if (c !== keep) await this.move(c, 'graveyard', { noCmdReplace: false });
              any = true;
            }
          }
        }
      } finally {
        this._sbaRunning = false;
        if (this._sbaAgain) { this._sbaAgain = false; await this.checkSBA(); }
      }
    }

    async playerLoses(p, why) {
      if (p.lost) return;
      p.lost = true;
      this.lg(`☠️ ${p.name} gubi (${why}).`, 'lose');
      // CR 800.4a: PRVO prestaju efekti koji su mu davali kontrolu nad tuđim
      // permanentima — ti se vraćaju vlasniku i ostaju u igri. Tek onda iz igre
      // odlazi ono što on POSJEDUJE.
      for (const c of this.bf()) {
        if (c.ctrl === p && c.owner !== p && !c.owner.lost) {
          c.ctrl = c.owner;
          c.sick = true;
          if (c.meta) { delete c.meta._brokerOrig; delete c.meta._brokerBy; }
          this.lg(`${c.name} se vraća igraču ${c.owner.name} (kontrolor je ispao).`);
        }
      }
      for (const c of this.bf().filter(c => c.owner === p)) {
        this.remove(c); c.zone = 'ceased';
      }
      // odgođeni "vrati kontrolu" trigeri ispalog igrača nemaju više smisla
      this.delayed = this.delayed.filter(d => d.ctrl !== p);
      this.untilEffects = this.untilEffects.filter(e => e.who !== p && e.ctrl !== p);
      // CR 725: kruna ne smije ostati kod ispalog igrača
      if (this.monarch === p) {
        const next = (this.turnPlayer && this.turnPlayer !== p && !this.turnPlayer.lost) ? this.turnPlayer : this.nextPlayer(p);
        this.monarch = (next && !next.lost && next !== p) ? next : null;
        this.lg(this.monarch ? `👑📜 Kruna prelazi na ${this.monarch.name}.` : '👑📜 Nema monarha.');
      }
      this.stack = this.stack.filter(so => so.ctrl !== p);
      this.recalc();
      const alive = this.alivePlayers();
      if (alive.length <= 1) {
        this.gameOver = true;
        this.winner = alive[0] || null;
        this.lg(`🏆 ${this.winner ? this.winner.name + ' POBJEĐUJE!' : 'Nema pobjednika.'}`, 'win');
        this.note('gameover', { winner: this.winner });
      }
    }
  }
  MTG.Game = Game;
})();
