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
        ? owner.game._nextSimulationIid--
        : owner && owner.game
          ? owner.game._nextCardIid++
          : IID++;
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
      // Incremented by every central zone transition. Effects that refer to a
      // particular zone object (such as ninjutsu's revealed hand card) can
      // distinguish it from the new object represented by the same card later.
      this.zoneVersion = 0;
      this.attacking = null;        // player or planeswalker iid during combat
      this.blocking = null;         // iid of attacker
      this.blockedBy = [];
      this.cur = null;              // derived characteristics (recalc)
      this.commander = false;
      this.cmdCasts = 0;            // koliko puta je OVAJ komander bačen iz CZ (tax je po komanderu)
      this.castMeta = null;         // how it was cast (for blitz etc.)
      this.phasedOut = false;       // ostaje fizički na battlefieldu, ali ne postoji u igri
    }
    is(type) {
      // `cur` describes only the current battlefield object. Reusing it after
      // a zone change leaks temporary type changes (Crew, animation, copy,
      // Lignify) into the graveyard, hand, exile, and normal spell faces.
      return this.zone === 'battlefield' && this.cur
        ? this.cur.types.includes(type)
        : this.def.types.includes(type);
    }
    hasSub(s) {
      // Derived characteristics belong to the battlefield object. Once the
      // card changes zones, printed characteristics (including characteristic-
      // defining abilities such as Changeling) apply again even if `cur` still
      // contains last-known battlefield information until the next recalc.
      const battlefieldDerived = this.zone === 'battlefield' && this.cur;
      const subs = battlefieldDerived ? this.cur.subtypes : this.def.subtypes;
      if (subs.includes(s)) return true;
      // changeling / Maskwood Nexus: "svaki tip stvorenja" vrijedi SAMO za prave
      // tipove stvorenja. Ranije je vraćalo true i za 'Aura'/'Equipment', pa je
      // SBA slao cijelu tvoju tablu u groblje čim Maskwood Nexus uđe.
      // Printed Changeling is a CDA and applies in every zone. Battlefield-only
      // grants (Maskwood Nexus and similar effects) still require a creature.
      const allCreatureTypes = battlefieldDerived
        ? this.cur.types.includes('Creature') && (
          (this.def.changeling && !this.cur.abilitiesDisabled && !this.cur.suppressPrintedChangeling) ||
          this.cur.allCreatureTypesFromOtherEffects ||
          (!this.def.changeling && this.cur.allCreatureTypes)
        )
        : !!this.def.changeling;
      if (allCreatureTypes &&
        MTG.CREATURE_SUBTYPES && MTG.CREATURE_SUBTYPES.has(s)) return true;
      return false;
    }
    kw(k) {
      return this.zone === 'battlefield' && this.cur
        ? this.cur.kw.has(k)
        : (this.def.kws || []).includes(k);
    }
    get name() { return this.def.name; }
    get power() { return this.cur ? this.cur.power : 0; }
    get toughness() { return this.cur ? this.cur.toughness : 0; }
    get mv() {
      if (this.zone === 'battlefield' && this.isToken && !this.isCopyOf) return 0;
      // CR 202.3e: X has the chosen value only while the spell is on the
      // stack. Everywhere else (including after an X permanent resolves), X
      // is 0. Keeping the old cast value on battlefield made effects such as
      // Mycosynth Gardens overcharge for Hangarback Walker and made graveyard
      // mana-value checks see a value the card no longer has.
      const x = this.zone === 'stack' && this.castMeta ? (this.castMeta.x || 0) : 0;
      return U.mv(this.def.cost || '', x);
    }
    get colors() {
      if (this.zone === 'battlefield' && this.cur && this.cur.colors) return this.cur.colors;
      if (this.zone === 'stack' && this.castMeta && Array.isArray(this.castMeta.spellColors)) {
        return this.castMeta.spellColors;
      }
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
      this.coloredOnlyPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
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
        cardsFromHandLibraryToGraveyard: 0,
        creaturesDiedUnder: 0, drewThisTurn: 0, firstSpellDone: false, secondSpellDone: false,
        gainedLifeFirst: false, attackedMe: [], artifactAbilitiesActivated: 0, targetedAbilitiesActivated: 0, combatDamageHits: [],
        gravePermanentTypesUsed: [],
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
      // Card IDs identify objects only inside one game. A process-global
      // allocator made otherwise identical seeded games depend on every game
      // that happened to run before them, because deterministic AI tie-breaks
      // include iid. Keep the fallback global allocator only for ownerless
      // standalone test/card instances.
      this._nextCardIid = 1;
      this.rnd = U.mulberry32(opts.seed ?? 42);
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
      // Keep the pre-crown state `undefined` for compatibility with existing
      // rules scripts; `setMonarch` owns every later transition.
      this.monarch = undefined;
      this.monarchSince = null;
      this.combat = null;
      this.turnNo = 0;
      this.extraTurnDepth = 0;
      // Additional phases are queued in the exact order in which they must be
      // played.  `_extraCombats` remains as a small public counter for card/UI
      // diagnostics, while this queue preserves compound instructions such as
      // "an additional combat phase followed by an additional main phase."
      this._additionalPhases = [];
      this._extraCombats = 0;
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
      await this.waitForLastResort();
      if (!this.paced || this.gameOver || !ms) return;
      await new Promise(r => setTimeout(r, Math.round(ms * this.speedFactor)));
      await this.waitForLastResort();
    }

    // Last Resort is an explicit recovery pause, not a rules effect. It stops
    // the engine at the next pacing checkpoint while the human repairs public
    // state, then releases every waiter together when the toolbox is closed.
    setLastResortPaused(paused) {
      const next = !!paused;
      if (this.lastResortPaused === next) return;
      this.lastResortPaused = next;
      if (!next && this._lastResortWaiters) {
        for (const resolve of this._lastResortWaiters.splice(0)) resolve();
      }
      this.note('lastResortPause', { paused: next });
    }

    waitForLastResort() {
      if (!this.lastResortPaused || this.gameOver) return Promise.resolve();
      this._lastResortWaiters = this._lastResortWaiters || [];
      return new Promise(resolve => this._lastResortWaiters.push(resolve));
    }

    lastResortPlayer(seat) {
      const wanted = Number(seat);
      return this.players.find(player => (player.onlineSeat ?? player.idx) === wanted) || null;
    }

    lastResortCardVisibleTo(card, actor) {
      if (!card || !actor) return false;
      if (card.zone === 'library') return false;
      if (card.zone === 'hand' && card.owner !== actor) return false;
      if (card.faceDown && card.ctrl !== actor) return false;
      return ['battlefield', 'graveyard', 'exile', 'command', 'hand'].includes(card.zone);
    }

    lastResortCard(token, actor) {
      const match = /^c:(-?\d+)$/.exec(String(token || ''));
      if (!match) return null;
      const card = this.byIid(Number(match[1]));
      return this.lastResortCardVisibleTo(card, actor) ? card : null;
    }

    lastResortLog(actor, text) {
      this.lg(`\u{1F6E0}\uFE0F LAST RESORT · ${actor.name}: ${text}`, 'warn');
      this.note('lastResortAction', { actor, text });
    }

    lastResortDetach(card) {
      if (card.attachedTo) {
        const host = this.byIid(card.attachedTo);
        if (host) host.attachments = host.attachments.filter(iid => iid !== card.iid);
        card.attachedTo = null;
      }
      for (const iid of (card.attachments || []).slice()) {
        const attachment = this.byIid(iid);
        if (attachment) attachment.attachedTo = null;
      }
      card.attachments = [];
      if (card.meta && card.meta.cursedPlayer) delete card.meta.cursedPlayer;
    }

    lastResortMove(card, toZone, controller) {
      const fromZone = card.zone;
      const leavingBattlefield = fromZone === 'battlefield';
      if (leavingBattlefield) this.lastResortDetach(card);
      this.remove(card);
      card.zoneVersion = (card.zoneVersion || 0) + (fromZone === toZone ? 0 : 1);
      card.attacking = null; card.blocking = null; card.blockedBy = [];
      card.damage = 0; card.deathtouched = false; card.regenShield = 0;
      if (card.isToken && toZone !== 'battlefield') {
        card.zone = 'ceased';
        return 'ceases to exist';
      }
      if (toZone === 'battlefield') {
        card.zone = 'battlefield';
        card.ctrl = controller || card.owner;
        card.faceDown = false;
        this.battlefield.push(card);
      } else {
        card.zone = toZone;
        card.ctrl = card.owner;
        card.tapped = false;
        if (toZone !== 'exile') card.faceDown = false;
        card.owner[toZone].push(card);
      }
      return `${fromZone} \u2192 ${toZone}`;
    }

    applyLastResortAction(actor, action) {
      if (!actor || actor.isAI || !this.players.includes(actor)) throw new Error('Only a human player can use Last Resort.');
      if (!action || typeof action !== 'object') throw new Error('Invalid Last Resort action.');
      const type = String(action.type || '');
      const int = (value, min, max, label) => {
        const number = Number(value);
        if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Invalid ${label}.`);
        return number;
      };
      const player = () => {
        const target = this.lastResortPlayer(action.playerSeat);
        if (!target) throw new Error('Unknown player.');
        return target;
      };
      const publicCard = () => {
        const target = this.lastResortCard(action.cardToken, actor);
        if (!target) throw new Error('That card is hidden or no longer available.');
        return target;
      };
      let text = '';

      if (type === 'setLife') {
        const target = player();
        target.life = int(action.value, -999, 999, 'life total');
        text = `${target.name} life = ${target.life}`;
      } else if (type === 'setMana') {
        const target = player();
        const color = String(action.color || '').toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(target.pool, color)) throw new Error('Invalid mana color.');
        target.pool[color] = int(action.value, 0, 99, 'mana amount');
        text = `${target.name} ${color} mana = ${target.pool[color]}`;
      } else if (type === 'setTapped') {
        const card = publicCard();
        if (card.zone !== 'battlefield') throw new Error('Only a battlefield card can be tapped.');
        card.tapped = !!action.value;
        text = `${card.name} ${card.tapped ? 'tapped' : 'untapped'}`;
      } else if (type === 'setDamage') {
        const card = publicCard();
        if (card.zone !== 'battlefield') throw new Error('Only a battlefield permanent can hold damage.');
        card.damage = int(action.value, 0, 999, 'marked damage');
        text = `${card.name} marked damage = ${card.damage}`;
      } else if (type === 'setCounter') {
        const card = publicCard();
        if (card.zone !== 'battlefield') throw new Error('Only a battlefield permanent can hold counters.');
        const kind = String(action.counter || '').trim().slice(0, 40);
        if (!kind || ['__proto__', 'prototype', 'constructor'].includes(kind)) throw new Error('Invalid counter name.');
        const value = int(action.value, 0, 999, 'counter amount');
        if (value) card.counters[kind] = value;
        else delete card.counters[kind];
        text = `${card.name} ${kind} counters = ${value}`;
      } else if (type === 'setController') {
        const card = publicCard();
        const target = player();
        if (card.zone !== 'battlefield' || target.lost) throw new Error('The controller change is not available.');
        card.ctrl = target;
        text = `${target.name} now controls ${card.name}`;
      } else if (type === 'reorder') {
        const card = publicCard();
        if (card.zone !== 'battlefield') throw new Error('Only battlefield cards can be reordered.');
        const direction = int(action.direction, -1, 1, 'move direction');
        if (!direction) throw new Error('Move direction is required.');
        const peers = this.battlefield.filter(entry => entry.zone === 'battlefield' && entry.ctrl === card.ctrl);
        const peerIndex = peers.indexOf(card);
        const swap = peers[peerIndex + direction];
        if (swap) {
          const a = this.battlefield.indexOf(card); const b = this.battlefield.indexOf(swap);
          [this.battlefield[a], this.battlefield[b]] = [this.battlefield[b], this.battlefield[a]];
        }
        text = `${card.name} moved ${direction < 0 ? 'left' : 'right'} on ${card.ctrl.name}'s battlefield`;
      } else if (type === 'moveCard') {
        const card = publicCard();
        const toZone = String(action.toZone || '');
        if (!['battlefield', 'graveyard', 'exile', 'command', 'hand'].includes(toZone)) throw new Error('Invalid destination zone.');
        const controller = toZone === 'battlefield' ? (this.lastResortPlayer(action.playerSeat) || card.owner) : card.owner;
        const move = this.lastResortMove(card, toZone, controller);
        text = `${card.name}: ${move}`;
      } else if (type === 'createToken') {
        const target = player();
        const count = int(action.count ?? 1, 1, 20, 'token count');
        let def = MTG.TOKENS && MTG.TOKENS[String(action.tokenKey || '')];
        if (!def && action.custom && typeof action.custom === 'object') {
          const name = String(action.custom.name || 'Token').trim().slice(0, 50) || 'Token';
          const power = int(action.custom.power, 0, 999, 'token power');
          const toughness = int(action.custom.toughness, 0, 999, 'token toughness');
          const kws = ['flying', 'vigilance', 'haste', 'trample', 'lifelink', 'deathtouch', 'reach', 'menace']
            .filter(keyword => Array.isArray(action.custom.keywords) && action.custom.keywords.includes(keyword));
          def = { name, cost: null, types: ['Creature'], subtypes: [name], super: [], power: String(power), toughness: String(toughness), oracle: '', kws, isTokenDef: true, colorsOverride: [] };
        }
        if (!def) throw new Error('Unknown token.');
        for (let index = 0; index < count; index++) {
          const token = new CardInst(def, target);
          token.isToken = true; token.zone = 'battlefield'; token.ctrl = target; token.sick = true;
          this.battlefield.push(token);
        }
        text = `${target.name} added ${count}\u00D7 ${def.name} token${count === 1 ? '' : 's'}`;
      } else if (type === 'addPermanent') {
        const target = player();
        const name = String(action.name || '').trim();
        const def = MTG.DEFS && MTG.DEFS[name];
        const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
        if (!def || !(def.types || []).some(cardType => permanentTypes.includes(cardType))) throw new Error('Choose a known permanent card.');
        const card = new CardInst(def, target);
        card.zone = 'battlefield'; card.ctrl = target; card.sick = true;
        this.battlefield.push(card);
        text = `${target.name} added ${card.name} to the battlefield`;
      } else throw new Error('Unsupported Last Resort action.');

      this.recalc();
      this.lastResortLog(actor, text);
      return { ok: true, text };
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
      const cards = (payload.cards || []).filter(c => c && (payload.includeLands || !c.is('Land')));
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

    // Globalni efekti bez pojedinačne mete lako nestanu između stacka i tri
    // odvojena life-log reda. Prije primjene pokaži jedan zajednički pregled i
    // sačekaj ljudski Proceed. Ovo je samo UX checkpoint: ne otvara priority i
    // ne mijenja način na koji se prevention/replacement efekti razrješavaju.
    async reviewGlobalEffectWithHuman(payload) {
      const hu = this.human();
      const targets = (payload && payload.targets || []).filter(p => p && !p.lost);
      if (!this.paced || !hu || !hu.controller || this.gameOver || !targets.length) return null;
      return hu.controller.decide(this, Object.assign({}, payload, {
        type: 'effectReview', player: hu, targets,
      }));
    }

    // Diplomacy is a table event, not background AI bookkeeping. Every offer
    // therefore enters the same blocking human-controller path as combat and
    // global-effect reviews. Incoming offers wait for Accept/Decline; resolved
    // human or bot-to-bot negotiations wait for an explicit Proceed.
    async reviewDiplomacyWithHuman(payload) {
      const hu = this.human();
      if (!hu || hu.lost || !hu.controller || this.gameOver) return null;
      return hu.controller.decide(this, Object.assign({}, payload, {
        type: 'diplomacyReview', player: hu,
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
      let want = chosen || p.chosenCommanders || (MTG.defaultCommanders
        ? MTG.defaultCommanders(deckData, defs) : [deckData.commander]);
      want = want.filter(Boolean).slice(0, 2);
      const check = MTG.validateCommanders ? MTG.validateCommanders(deckData, want, defs) : { ok: true };
      if (!check.ok) {
        want = MTG.defaultCommanders ? MTG.defaultCommanders(deckData, defs) : [deckData.commander];
        this.lg(`⚠️ Invalid commander selection (${check.why}) — using ${want.join(' + ')}.`, 'warn');
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
      this.lg(`The game begins. Turn order: ${this.players.map(p => p.name).join(' → ')}.`);
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
          this.lg(`${U.playerVerb(p, 'take', 'takes')} a mulligan.`);
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
      this.lg(`${U.playerVerb(p, 'keep', 'keeps')} ${p.hand.length} cards.`);
    }

    // ------------- helpers -------------
    bf() {
      // Replacement choices for one simultaneous entry event only see the
      // permanents that existed immediately before that event. Trigger/event
      // collection resumes against the complete post-entry battlefield.
      const cards = this._entryReplacementPhase && this._battlefieldEntryReplacementSnapshot
        ? this._battlefieldEntryReplacementSnapshot : this.battlefield;
      return cards.filter(c => c.zone === 'battlefield' && !c.phasedOut);
    }
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
        // A spell copy references the same physical CardInst as its original,
        // but it is an independent stack object. Moving the physical card must
        // remove only the original spell; copies remain on the stack.
        const i = this.stack.findIndex(s => s.card === card && !s.isCopy);
        if (i >= 0) this.stack.splice(i, 1);
      } else {
        const arr = card.owner[card.zone];
        if (arr) { const i = arr.indexOf(card); if (i >= 0) arr.splice(i, 1); }
      }
    }

    snapshot(card) {
      return {
        iid: card.iid, timestamp: card.timestamp, name: card.name, def: card.def, ctrl: card.ctrl, owner: card.owner,
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
        abilitiesDisabled: !!(card.cur && card.cur.abilitiesDisabled),
      };
    }

    async move(card, toZone, opts = {}) {
      const fromZone = card.zone;
      const wasBattlefield = fromZone === 'battlefield';
      const snap = this.snapshot(card);

      // Prepared pravi stvarnu kopiju karte koja se baca iz egzila. Kao i sve
      // kopije karata, ona prestaje postojati čim napusti stack (resolve,
      // counter ili fizzle) i nikad ne smije završiti u groblju/egzilu/ruci.
      if (card.isCopySpell && fromZone === 'stack' && toZone !== 'stack') {
        this.remove(card);
        card.zone = 'ceased';
        return card;
      }

      // Gearhulk/Emet-style permission: the actual graveyard card is cast and
      // must be exiled if it would leave the stack for the graveyard, including
      // countering and fizzling (not only a normal resolution).
      if (fromZone === 'stack' && toZone === 'graveyard' && card.meta && card.meta.exileIfStackLeaves) {
        toZone = 'exile';
        delete card.meta.exileIfStackLeaves;
      } else if (fromZone === 'stack' && toZone !== 'stack' && card.meta) {
        delete card.meta.exileIfStackLeaves;
      }

      // Unearth replacement: ako bi permanent napustio bojno polje iz bilo
      // kojeg razloga, ide u egzil umjesto u drugu zonu.
      if (wasBattlefield && card.meta && card.meta.unearth && toZone !== 'exile') {
        toZone = 'exile';
        opts = Object.assign({}, opts, { noCmdReplace: true });
      }

      // A finality counter creates a replacement effect: a permanent that would
      // go from the battlefield to a graveyard is exiled instead.  This is not a
      // dies event, so apply it before commander replacement and LTB dispatch.
      if (wasBattlefield && toZone === 'graveyard' && (snap.counters.finality || 0) > 0) {
        toZone = 'exile';
      }

      // Dauthi-style replacement: a nontoken card that would enter an
      // opponent's graveyard is exiled with a void counter instead. Apply it
      // before the commander replacement prompt so the owner can still choose
      // the command zone instead of the resulting exile destination.
      let voidReplacement = null;
      if (toZone === 'graveyard' && !card.isToken) {
        const liveSource = this.bf().find(source => source.def.opponentGraveyardVoid && source.ctrl !== card.owner) || null;
        const leavingSource = (this._simultaneousLeaveSources || []).find(entry =>
          entry.card && entry.card.def.opponentGraveyardVoid && entry.ctrl !== card.owner) || null;
        // A simultaneous event is evaluated from its pre-event game state.
        // destroyMany/sacrificeMany are represented internally as sequential
        // moves, so retain the LKI controller of a replacement source that an
        // earlier loop iteration has already removed from the live battlefield.
        if (liveSource) voidReplacement = { source: liveSource, ctrl: liveSource.ctrl };
        else if (leavingSource) voidReplacement = { source: leavingSource.card, ctrl: leavingSource.ctrl };
        if (voidReplacement) toZone = 'exile';
      }

      // commander zone replacement
      if (card.commander && ['graveyard', 'exile', 'hand', 'library'].includes(toZone) && !opts.noCmdReplace) {
        const zoneLabels = { graveyard: 'Graveyard', exile: 'Exile', hand: 'Hand', library: 'Library' };
        const keep = await card.owner.controller.decide(this, {
          type: 'chooseOption', prompt: `${card.name}: return it to the command zone?`,
          options: [{ key: 'cz', label: 'Command zone' }, { key: 'stay', label: zoneLabels[toZone] }],
          aiHint: { kind: 'commanderZone', card, toZone },
        });
        if (keep === 'cz') toZone = 'command';
      }

      // Suspend is status of the particular card object in exile, not a
      // perpetual property of the physical CardInst. Once that object leaves
      // exile, a later return is a new object and is no longer suspended.
      if (fromZone === 'exile' && toZone !== 'exile' && card.meta &&
          Object.prototype.hasOwnProperty.call(card.meta, 'suspended')) {
        delete card.meta.suspended;
      }

      if (fromZone !== toZone) card.zoneVersion = (card.zoneVersion || 0) + 1;

      // persist / undying (death replacements to return later — handled post-dies for simplicity)

      // Odlazak sa bojnog polja mora biti vidljiv u logu (destroy, exile,
      // combat/SBA smrti, bounce) — do sada je bio potpuno nijem.
      if (wasBattlefield && toZone !== 'battlefield') {
        if (toZone === 'graveyard' && !card.isToken) card.meta._fromBattlefieldTurn = this.turnNo;
        const verb = toZone === 'graveyard' ? (snap.types.includes('Creature') ? 'dies' : 'is put into the graveyard')
          : toZone === 'exile' ? 'is exiled'
            : toZone === 'command' ? 'returns to the command zone'
              : toZone === 'hand' ? "returns to its owner's hand"
                : toZone === 'library' ? "goes to its owner's library"
                  : 'leaves the battlefield';
        this.lg(`${card.name} ${verb}.`);
        const coveredByBoardWipeVisual = card.meta._boardWipeVisualTurn === this.turnNo;
        if (!opts.suppressVisualEffect && !coveredByBoardWipeVisual) {
          this.note('gameEffect', {
            kind: 'zoneMove', card, cardId: card.iid, cardName: card.name,
            fromZone, toZone, fromPlayer: snap.ctrl, toPlayer: card.owner,
          });
        }
        // The marker belongs only to this simultaneous departure. A card that
        // returns and leaves again in the same turn still deserves its own FX.
        if (coveredByBoardWipeVisual) delete card.meta._boardWipeVisualTurn;
      }

      this.remove(card);

      if (wasBattlefield) {
        // detach everything
        for (const aid of card.attachments.slice()) {
          const a = this.byIid(aid);
          if (a) {
            // Auras such as Gift of Immortality trigger after both the creature
            // and the Aura have reached the graveyard. Preserve which object
            // the Aura enchanted so its graveyard trigger can use LKI.
            a.meta = a.meta || {};
            a.meta._lastAttachedTo = card.iid;
            a.attachedTo = null;
            if (a.hasSub('Aura')) await this.move(a, 'graveyard');
          }
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
      if (toZone !== 'battlefield' && card.meta.faceDownDef) {
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
        // "Tapped and attacking" je karakteristika samog ulaska, ne izmjena
        // nakon ETB događaja. ETB filteri zato odmah moraju vidjeti napadača.
        if (opts.attacking && this.combat) {
          card.attacking = opts.attacking;
          card.sick = false;
          if (!this.combat.attackers.includes(card)) this.combat.attackers.push(card);
        }
        // CR 400.7: permanent koji uđe na bojno polje je NOV objekat — svjež meta.
        if (fromZone !== 'battlefield') card.meta = {};
        // A resolving permanent-spell copy may need the paid-count choice for
        // an ETB keyword such as squad. This is explicit entry state, never a
        // wholesale copy of the physical card's runtime scratch metadata.
        if (opts.entryMeta) Object.assign(card.meta, opts.entryMeta);
        // Only a spell resolving from the stack carries cast choices into its
        // own entry replacement/trigger processing. Reanimation, blink,
        // Genesis Wave and similar non-cast entries must not reuse X,
        // sunburst colors, compleated life or mana spent by an older object.
        if (fromZone !== 'stack') {
          // Normally a non-stack entry has no cast history. The sole explicit
          // exception is a token created by resolving a permanent-spell copy:
          // its caller supplies an already filtered set of copiable choices.
          card.castMeta = opts.castMeta ? Object.assign({}, opts.castMeta, {
            alt: Object.assign({}, opts.castMeta.alt || {}),
          }) : null;
        }
        card.meta._enteredFromZone = fromZone;
        // An Aura put onto the battlefield without being cast chooses what it
        // enchants immediately before it enters. Establish the attachment
        // before ETB processing so static effects and triggers observe the
        // Aura already attached (CR 303.4f).
        let enteredAttachedTo = null;
        if (opts.attachTo instanceof CardInst && opts.attachTo.zone === 'battlefield') {
          enteredAttachedTo = opts.attachTo;
          card.attachedTo = enteredAttachedTo.iid;
          if (!enteredAttachedTo.attachments.includes(card.iid)) enteredAttachedTo.attachments.push(card.iid);
          if (card.def.onAttach) card.def.onAttach(this, card, enteredAttachedTo);
        }
        if (opts.cursedPlayer instanceof Player) card.meta.cursedPlayer = opts.cursedPlayer;
        if (opts.faceDownDef) {
          card.meta.faceDownDef = opts.faceDownDef;
          card.meta.faceDownKind = opts.faceDownKind || 'manifest';
          card.faceDown = true;
        }
        card.meta._enteredTurn = this.turnNo;
        if (card.hasSub && card.hasSub('Elf')) card.ctrl.turnState.elfEntries.push(card.iid);
        await this.handleETB(card, opts);
        if (enteredAttachedTo) await this.emitBattlefieldEntry('attached', { att: card, host: enteredAttachedTo });
        // Commander i zaista veliki nontoken creature ulasci dobijaju centralni
        // vizuelni signal. Event nastaje tek nakon as-enters/counter obrade, pa
        // UI vidi konačan P/T i stvarni battlefield objekat.
        const impactfulCreature = !card.isToken && card.is('Creature') &&
          (card.commander || card.mv >= 6 || card.power >= 6 || card.toughness >= 7);
        if (card.commander || impactfulCreature) {
          const kind = card.commander ? 'commander' : 'powerhouse';
          this.lg(`${card.commander ? '👑' : '✦'} ${U.playerVerb(card.ctrl, 'put', 'puts')} ${card.name} onto the battlefield.`, 'arrival');
          this.note('battlefieldArrival', {
            card, player: card.ctrl, kind,
            power: card.is('Creature') ? card.power : null,
            toughness: card.is('Creature') ? card.toughness : null,
          });
        }
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
        if (voidReplacement && toZone === 'exile') {
          card.counters.void = (card.counters.void || 0) + 1;
          card.meta.voidExiledBy = voidReplacement.ctrl;
        }
        if (wasBattlefield) {
          if (toZone === 'graveyard') { this.diedThisTurn.push(snap); await this.fireLeaveAndDie(card, snap, true); }
          else await this.fireLeaveAndDie(card, snap, false);
        } else if (toZone === 'graveyard') {
          await this.emit('cardToGraveyard', { card, from: fromZone });
        }
      }
      // "One or more cards are put into your graveyard" needs one event for
      // the complete instruction, while older scripts still consume the
      // per-card cardToGraveyard/LTB events above.  Simultaneous helpers open a
      // batch; an isolated move is a one-card batch of its own.
      if (toZone === 'graveyard' && fromZone !== 'graveyard' && !card.isToken) {
        if ((fromZone === 'hand' || fromZone === 'library') && card.owner && card.owner.turnState) {
          card.owner.turnState.cardsFromHandLibraryToGraveyard =
            (card.owner.turnState.cardsFromHandLibraryToGraveyard || 0) + 1;
        }
        const entry = { card, from: fromZone };
        if (this._graveyardEnterBatch) this._graveyardEnterBatch.push(entry);
        else await this.emit('cardsToGraveyard', { cards: [card], froms: [fromZone], from: fromZone });
      }
      if (fromZone === 'graveyard' && toZone !== 'graveyard') {
        await this.emit('cardLeftGraveyard', { card, to: toZone });
        if (this._graveyardLeaveBatch) this._graveyardLeaveBatch.push({ card, to: toZone });
        else await this.emit('cardsLeftGraveyard', { cards: [card], to: toZone });
      }
      this.recalc();
      return card;
    }

    async withGraveyardEntryBatch(run) {
      const previous = this._graveyardEnterBatch;
      const batch = [];
      this._graveyardEnterBatch = batch;
      let result;
      try {
        result = await run();
      } finally {
        this._graveyardEnterBatch = previous;
      }
      if (previous) previous.push(...batch);
      else if (batch.length) await this.emit('cardsToGraveyard', {
        cards: batch.map(entry => entry.card),
        froms: batch.map(entry => entry.from),
        from: batch.every(entry => entry.from === batch[0].from) ? batch[0].from : null,
      });
      return result;
    }

    async moveGraveyardBatch(cards, toZone, opts = {}) {
      const unique = [...new Set(cards)].filter(card => card && card.zone === 'graveyard');
      if (!unique.length) return [];
      const previous = this._graveyardLeaveBatch;
      const batch = [];
      this._graveyardLeaveBatch = batch;
      try {
        for (const card of unique) if (card.zone === 'graveyard') await this.move(card, toZone, opts);
      } finally {
        this._graveyardLeaveBatch = previous;
      }
      if (previous) previous.push(...batch);
      else if (batch.length) await this.emit('cardsLeftGraveyard', {
        cards: batch.map(entry => entry.card),
        destinations: batch.map(entry => entry.to),
        to: batch.every(entry => entry.to === batch[0].to) ? batch[0].to : null,
      });
      return batch.map(entry => entry.card);
    }

    async withBattlefieldEntryBatch(run) {
      const previous = this._battlefieldEntryEvents;
      const previousSnapshot = this._battlefieldEntryReplacementSnapshot;
      const batch = [];
      this._battlefieldEntryEvents = batch;
      // Snapshot before the first structural move so earlier array insertion
      // cannot turn one co-entrant into another co-entrant's replacement source.
      if (!previousSnapshot) this._battlefieldEntryReplacementSnapshot = this.bf().slice();
      let result;
      try {
        result = await run();
      } finally {
        this._battlefieldEntryEvents = previous;
        this._battlefieldEntryReplacementSnapshot = previousSnapshot;
      }
      if (previous) previous.push(...batch);
      else for (const event of batch) {
        if (event.run) await event.run();
        else await this.emit(event.name, event.data);
      }
      return result;
    }

    async emitBattlefieldEntry(name, data) {
      if (this._battlefieldEntryEvents) {
        this._battlefieldEntryEvents.push({ name, data });
        return;
      }
      await this.emit(name, data);
    }

    async deferBattlefieldEntry(run) {
      if (this._battlefieldEntryEvents) {
        this._battlefieldEntryEvents.push({ run });
        return;
      }
      await run();
    }

    async moveBattlefieldBatch(entries) {
      const normalized = (entries || []).map(entry => entry instanceof CardInst
        ? { card: entry, opts: {} }
        : { card: entry && entry.card, opts: entry && entry.opts || {} })
        .filter(entry => entry.card && entry.card.zone !== 'battlefield');
      if (!normalized.length) return [];
      await this.withBattlefieldEntryBatch(async () => {
        for (const entry of normalized) {
          if (entry.card.zone !== 'battlefield') await this.move(entry.card, 'battlefield', entry.opts);
        }
      });
      return normalized.map(entry => entry.card).filter(card => card.zone === 'battlefield');
    }

    async fireLeaveAndDie(card, snap, died) {
      // Prepared spell-kopija postoji samo dok je izvor prepared na bojnom
      // polju. Ako izvor ode prije castanja, kopija iz egzila prestaje postojati.
      if (card.meta && card.meta.preparedCopy) {
        const preparedCopy = this.byIid(card.meta.preparedCopy);
        if (preparedCopy && preparedCopy.zone === 'exile') {
          this.remove(preparedCopy);
          preparedCopy.zone = 'ceased';
        }
        card.meta.prepared = false;
        delete card.meta.preparedCopy;
      }
      this.recalc();
      await this.emit('lto', { card, snap });
      if (died) {
        this.turnPlayer && (snap.ctrl.turnState.creaturesDiedUnder += snap.types.includes('Creature') ? 1 : 0);
        await this.emit('dies', { card, snap });
        // Persist/undying su stvarne dies-triggered sposobnosti. Karta ostaje u
        // groblju dok protivnici dobiju priority; vraća se tek na rezoluciji.
        const d = card.def;
        if (snap.types.includes('Creature') && card.zone === 'graveyard') {
          // CardInst se namjerno ponovo koristi kroz zone, ali svaka promjena
          // zone predstavlja novi Magic objekat. Persist/Undying smiju vratiti
          // samo objekat koji je ovim dies događajem stigao u groblje, ne istu
          // fizičku kartu nakon graveyard -> druga zona -> graveyard putanje.
          const graveyardZoneVersion = card.zoneVersion;
          const deathData = { card, snap, graveyardZoneVersion };
          const isOriginalGraveyardObject = (source, data) => source === data.card &&
            source.zone === 'graveyard' && source.zoneVersion === data.graveyardZoneVersion;
          if (d.undying && !snap.abilitiesDisabled && !snap.plus1) {
            this.queueTrigger({
              src: card, ctrl: snap.ctrl, name: 'Undying', data: deathData,
              onlyIf: (g, source, data) => isOriginalGraveyardObject(source, data),
              run: async ctx => {
                if (!isOriginalGraveyardObject(ctx.src, ctx.data)) return;
                ctx.g.lg(`${ctx.src.name} se vraća (undying).`);
                await ctx.g.move(ctx.src, 'battlefield', {
                  ctrl: snap.owner, additionalCounters: { '+1/+1': 1 }, additionalCounterBy: snap.owner,
                });
              },
            });
          } else if (d.persist && !snap.abilitiesDisabled && !(snap.minus1 > 0)) {
            this.queueTrigger({
              src: card, ctrl: snap.ctrl, name: 'Persist', data: deathData,
              onlyIf: (g, source, data) => isOriginalGraveyardObject(source, data),
              run: async ctx => {
                if (!isOriginalGraveyardObject(ctx.src, ctx.data)) return;
                ctx.g.lg(`${ctx.src.name} se vraća (persist).`);
                await ctx.g.move(ctx.src, 'battlefield', {
                  ctrl: snap.owner,
                  additionalCounters: { '-1/-1': 1 },
                  additionalCounterBy: snap.owner,
                });
              },
            });
          }
        }
      }
    }

    async handleETB(card, opts) {
      let d = card.def;
      const entryMinusCounters = [];
      const entryPlusCounters = [];
      const entryCounterEvents = [];
      card.meta = card.meta || {};
      const batchedReplacement = !!this._battlefieldEntryReplacementSnapshot;
      if (batchedReplacement) this._entryReplacementPhase = (this._entryReplacementPhase || 0) + 1;
      try {
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
      // Horizon Explorer-style replacement. It applies after every printed or
      // effect-imposed tapped entry instruction, so the land is already
      // untapped when landfall and ETB observers see it.
      if (card.is('Land') && this.bf().some(source =>
        source !== card && source.ctrl === card.ctrl && source.def.landsEnterUntapped)) {
        card.tapped = false;
      }
      if (card.is('Creature') && this.bf().some(source =>
        source.ctrl !== card.ctrl && source.def.opponentsCreaturesEnterTapped)) {
        card.tapped = true;
      }
      if (d.etbCounters) {
        let n = typeof d.etbCounters.n === 'function' ? d.etbCounters.n(this, card) : d.etbCounters.n;
        if (n > 0 && d.etbCounters.kind === '+1/+1') n = this.adjustPlusCounters(card, n);
        if (n > 0) {
          card.counters[d.etbCounters.kind] = (card.counters[d.etbCounters.kind] || 0) + n;
          this.notifyEffect(`◆ ${card.name} enters with ${n} ${d.etbCounters.kind} ${U.plural(n, 'counter', 'counters')}.`, {
            kind: 'counter', card, counterKind: d.etbCounters.kind, n,
          });
          this.markCounterPut(card.ctrl, card, n);
          entryCounterEvents.push({ kind: d.etbCounters.kind, n, before: 0, after: n, by: card.ctrl });
          if (d.etbCounters.kind === '-1/-1') entryMinusCounters.push({ n, by: card.ctrl });
          if (d.etbCounters.kind === '+1/+1') entryPlusCounters.push({ n, before: 0, after: n });
        }
      }
      if (opts.additionalCounters) {
        for (const [kind, rawN] of Object.entries(opts.additionalCounters)) {
          let n = Math.max(0, Number(rawN) || 0);
          if (kind === '+1/+1') n = this.adjustPlusCounters(card, n);
          if (!n) continue;
          card.counters[kind] = (card.counters[kind] || 0) + n;
          this.notifyEffect(`◆ ${card.name} enters with ${n} additional ${kind} ${U.plural(n, 'counter', 'counters')}.`, {
            kind: 'counter', card, counterKind: kind, n,
          });
          const by = opts.additionalCounterBy || card.ctrl;
          this.markCounterPut(by, card, n);
          entryCounterEvents.push({
            kind, n, before: (card.counters[kind] || 0) - n,
            after: card.counters[kind] || 0, by,
          });
          if (kind === '-1/-1') entryMinusCounters.push({ n, by });
          if (kind === '+1/+1') entryPlusCounters.push({
            n, before: (card.counters[kind] || 0) - n, after: card.counters[kind] || 0,
          });
        }
      }
      if (card.castMeta && card.castMeta.grantedSunburstColors > 0) {
        const kind = card.is('Creature') ? '+1/+1' : 'charge';
        const before = card.counters[kind] || 0;
        card.counters[kind] = before + card.castMeta.grantedSunburstColors;
        this.notifyEffect(`◆ ${card.name}: sunburst adds ${card.castMeta.grantedSunburstColors} ${kind} counters.`, {
          kind: 'counter', card, counterKind: kind, n: card.castMeta.grantedSunburstColors,
        });
        entryCounterEvents.push({
          kind, n: card.castMeta.grantedSunburstColors,
          before, after: card.counters[kind], by: card.ctrl,
        });
      }
      if (d.loyalty && card.is('Planeswalker')) {
        card.counters['loyalty'] = parseInt(d.loyalty, 10) + (card.meta.additionalLoyaltyCounters || 0);
        if (d.compleated && card.castMeta && card.castMeta.phyrexianLifePaid > 0) {
          card.counters['loyalty'] = Math.max(0, card.counters['loyalty'] - 2);
        }
        this.notifyEffect(`◆ ${card.name} enters with ${card.counters['loyalty']} loyalty counters.`, {
          kind: 'counter', card, counterKind: 'loyalty', n: card.counters['loyalty'],
        });
      }
      if (d.defense && card.is('Battle')) {
        card.counters.defense = parseInt(d.defense, 10);
        this.notifyEffect(`◆ ${card.name} enters with ${card.counters.defense} defense counters.`, {
          kind: 'counter', card, counterKind: 'defense', n: card.counters.defense,
        });
      }
      // additional +1/+1 counters replacements (Grumgully)
      if (card.is('Creature')) {
        for (const r of this.replacers('etbCounters')) {
          if (r.run(this, card, r.src)) {
            const nn = typeof r.n === 'function' ? r.n(this, card, r.src) : (r.n || 1);
            if (nn > 0) this.addCounters(card, '+1/+1', nn, true, r.src.ctrl);
          }
        }
        for (const player of this.players) for (const source of player.graveyard) {
          if (!source.def.graveyardEtbCounters) continue;
          const nn = source.def.graveyardEtbCounters(this, source, card) || 0;
          if (nn > 0) this.addCounters(card, '+1/+1', nn, true, source.ctrl);
        }
      }
      } finally {
        if (batchedReplacement) {
          this._entryReplacementPhase--;
          if (!this._entryReplacementPhase) delete this._entryReplacementPhase;
        }
      }
      if (d.saga) { card.counters['lore'] = 0; }
      this.recalc();
      const evData = { card, ctrl: card.ctrl };
      // Generic counter event preserves the actual kind. Cards such as
      // Captain Marvel must copy shield/charge/etc. counters, not only +1/+1.
      for (const event of entryCounterEvents) {
        await this.emitBattlefieldEntry('countersPlaced', {
          card, kind: event.kind, n: event.n, before: event.before,
          after: event.after, ctrl: card.ctrl, by: event.by, enters: true,
        });
      }
      // "Enters with" counteri su dio samog ulaska, ali permanenti koji ih
      // posmatraju (Auntie Ool, Hapatra, Wickersmith's Tools...) ipak moraju
      // dobiti isti m1Added događaj prije običnih ETB triggera.
      for (const event of entryMinusCounters) {
        await this.emitBattlefieldEntry('m1Added', { card, n: event.n, by: event.by, ctrl: card.ctrl, enters: true });
      }
      for (const event of entryPlusCounters) {
        await this.emitBattlefieldEntry('plusAdded', {
          card, n: event.n, before: event.before, after: event.after,
          ctrl: card.ctrl, enters: true,
        });
      }
      if (card.is('Land')) {
        card.ctrl.turnState.landsEntered++;
        await this.emitBattlefieldEntry('landfall', evData);
      }
      await this.emitBattlefieldEntry('etb', evData);
      if (d.saga) await this.deferBattlefieldEntry(async () => this.sagaChapter(card));
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
      // Explicit zero is meaningful for X spells. `opts.n || 1` turned X=0
      // into one token for Grand Crescendo, Martial Coup, Sylvan Offering and
      // every other shared makeTokens caller.
      const n = opts.n === undefined ? 1 : Math.max(0, Number(opts.n) || 0);
      let defs = Array.isArray(spec) ? spec.slice() : [];
      if (!Array.isArray(spec)) for (let i = 0; i < n; i++) defs.push(spec);
      // token replacements (Academy Manufactor, Chatterfang)
      if (!opts.noReplace) {
        const pending = this.replacers('createToken').filter(r => r.ctrl === ctrl);
        // Svaka Kaya -2 je zaseban replacement effect. Uključi ih u isti
        // redoslijed kao ostale token replacere i primijeni svaku (x2, x4...).
        for (const effect of this.untilEffects.filter(e => e.kind === 'tokenDouble' && e.who === ctrl)) {
          pending.push({
            ctrl, src: effect.sourceCard || null, label: effect.label || 'Kaya, Geist Hunter',
            run: async (g, current) => current.concat(current.slice()),
          });
        }
        while (pending.length) {
          let index = 0;
          if (pending.length > 1 && ctrl.controller && ctrl.controller.decide) {
            const picked = await ctrl.controller.decide(this, {
              type: 'chooseOption',
              prompt: 'Redoslijed replacement efekata za tokene — koji primjenjuješ sljedeći?',
              options: pending.map((entry, i) => ({
                key: String(i), label: entry.src ? entry.src.name : (entry.label || `Replacement ${i + 1}`),
                source: entry.src,
              })),
              aiHint: { kind: 'tokenReplacementOrder', defs: defs.slice(), replacements: pending.slice() },
            });
            const chosen = Number.parseInt(picked, 10);
            if (Number.isInteger(chosen) && chosen >= 0 && chosen < pending.length) index = chosen;
          }
          const [r] = pending.splice(index, 1);
          defs = await r.run(this, defs, ctrl, r.src) || defs;
        }
      }
      const made = [];
      for (const sp of defs) {
        const def = typeof sp === 'string' ? MTG.TOKENS[sp] : sp;
        if (!def) { continue; }
        const c = new CardInst(def, ctrl);
        c.isToken = true;
        if (opts.copyOf) c.isCopyOf = opts.copyOf;
        c.zone = 'nowhere';
        const attackTarget = typeof opts.chooseAttacking === 'function'
          ? await opts.chooseAttacking(this, c, made.length, opts.attacking)
          : opts.attacking;
        await this.move(c, 'battlefield', {
          ctrl, tapped: opts.tapped, attacking: attackTarget,
          castMeta: opts.castMeta, entryMeta: opts.entryMeta,
        });
        if (opts.haste) c.meta.tempHaste = true;
        made.push(c);
        ctrl.turnState.tokensCreated++;
      }
      if (made.length) {
        const names = {};
        for (const m of made) names[m.name] = (names[m.name] || 0) + 1;
        this.lg(`${U.playerVerb(ctrl, 'create', 'creates')} ${Object.entries(names).map(([k, v]) => v > 1 ? `${v}× ${k}` : k).join(', ')}.`, 'token');
        await this.emit('tokensCreated', { ctrl, tokens: made });
        // "Whenever you create a token" triggers once for each token, even
        // when one instruction creates a batch. Keep the existing batch event
        // for effects that say "one or more" and expose a per-token event for
        // Mirkwood Bats-style triggers.
        for (const token of made) await this.emit('tokenCreated', { ctrl, token, tokens: made });
        // tokeni ne prolaze kroz stack — pokaži ih na sredini i sačekaj Proceed
        await this.revealToHuman({ cards: made, ctrl, kind: 'tokens' });
      }
      this.recalc();
      return made;
    }

    faceDownCreatureDef(kind) {
      const cloaked = kind === 'cloak' || kind === 'disguise';
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
      this.lg(`${player.name} puts a card face down as a 2/2${kind === 'cloak' ? ' with ward {2}' : ''}.`);
      this.notifyEffect(`🃏 ${player.name}: new face-down 2/2 card.`, { kind: 'faceDown', card, player }, false);
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
          prompt: 'Manifest dread: choose the card to manifest',
          aiHint: { kind: 'manifestDread' },
        });
        if (pick && seen.includes(pick[0])) chosen = pick[0];
      }
      const other = seen.find(card => card !== chosen) || null;
      const manifested = await this.manifestCard(player, chosen);
      if (other) await this.move(other, 'graveyard');
      this.lg(`${player.name} manifests dread${other ? ' and puts the other card into the graveyard' : ''}.`);
      return manifested;
    }

    async cloakTop(player) {
      if (!player || !player.library.length) return null;
      return this.putFaceDown(player, player.library[player.library.length - 1], 'cloak');
    }

    faceUpCosts(card) {
      const original = card && card.meta && card.meta.faceDownDef;
      if (!original || !(original.types || []).includes('Creature')) return [];
      const faceDownKind = card.meta.faceDownKind || 'manifest';
      const intrinsicAbilitiesAvailable = !(card.cur && card.cur.abilitiesDisabled);
      const costs = [];
      // A spell cast face down with Morph or Disguise may be turned face up
      // only through the special action supplied by the method used to cast it.
      // Manifest and cloak instead grant the printed-mana-cost action while
      // still leaving any intrinsic Morph/Disguise special action available.
      if (faceDownKind === 'morph') {
        if (intrinsicAbilitiesAvailable && original.morph) costs.push({ kind: 'morph', cost: original.morph });
      } else if (faceDownKind === 'disguise') {
        if (intrinsicAbilitiesAvailable && original.disguise) costs.push({ kind: 'disguise', cost: original.disguise });
      } else {
        // A missing mana cost is unpayable, not an implicit {0} cost.
        if (original.cost) costs.push({ kind: 'mana cost', cost: original.cost });
        if (intrinsicAbilitiesAvailable && original.morph) costs.push({ kind: 'morph', cost: original.morph });
        if (intrinsicAbilitiesAvailable && original.disguise) costs.push({ kind: 'disguise', cost: original.disguise });
      }
      return costs.filter((entry, index, all) => all.findIndex(other => other.cost === entry.cost) === index);
    }

    faceUpCost(card) {
      const costs = this.faceUpCosts(card);
      return costs.length ? costs[0].cost : null;
    }

    async turnFaceUp(player, card, chosenCost) {
      if (!card || card.zone !== 'battlefield' || card.ctrl !== player || !card.faceDown) return false;
      const original = card.meta && card.meta.faceDownDef;
      const legalCosts = this.faceUpCosts(card);
      const selected = chosenCost === undefined || chosenCost === null
        ? legalCosts[0]
        : legalCosts.find(entry => entry.cost === chosenCost);
      if (!original || !selected) return false;
      const costStr = selected.cost;
      if (!await this.payMana(player, U.parseCost(costStr), { card, isAbility: true })) return false;
      card.def = original;
      delete card.meta.faceDownDef;
      delete card.meta.faceDownKind;
      card.faceDown = false;
      this.recalc();
      this.lg(`${player.name} turns ${card.name} face up.`, 'effect');
      this.notifyEffect(`🃏 ${card.name} was turned face up.`, { kind: 'faceUp', card, player }, false);
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
        n: opts.n === undefined ? 1 : opts.n, copyOf: def, tapped: opts.tapped, attacking: opts.attacking,
        chooseAttacking: opts.chooseAttacking, noReplace: opts.noReplace, haste: opts.haste,
        castMeta: opts.castMeta, entryMeta: opts.entryMeta,
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
    markCounterPut(by, card, n) {
      if (!by || !card || n <= 0 || !(by instanceof Player) || !card.is || !card.is('Creature')) return;
      by.turnState._putCounterThisTurn = (by.turnState._putCounterThisTurn || 0) + n;
    }
    addCounters(card, kind, n, silent, by) {
      if (n <= 0) return;
      if (kind === '+1/+1' && card.is && card.is('Creature')) n = this.adjustPlusCounters(card, n);
      const before = card.counters[kind] || 0;
      card.counters[kind] = (card.counters[kind] || 0) + n;
      const counterText = `${card.name}: +${n} ${kind} ${U.plural(n, 'counter', 'countera')}.`;
      if (!silent) this.lg(counterText);
      this.notifyEffect(`◆ ${counterText}`, { kind: 'counter', card, counterKind: kind, n }, !!silent);
      if (kind === '-1/-1') this.note('gameEffect', {
        kind: 'counterChange', counterKind: kind, card, target: card, amount: n,
      });
      this.recalc();
      this.emitSync('countersAdded', { card, kind, n });
      // `emit` queues triggers synchronously even though their resolution is
      // asynchronous. Keep the UI notification above and expose the full
      // rules event separately so observers can retain the counter kind.
      const counterBy = by || this.turnPlayer;
      void this.emit('countersPlaced', {
        card, kind, n, before, after: card.counters[kind], ctrl: card.ctrl, by: counterBy,
      });
      // Većina starijih skripti nastala je prije eksplicitnog `by` argumenta.
      // Aktivni igrač je kompatibilni fallback, dok nove/instant putanje
      // prosljeđuju stvarnog igrača koji stavlja counter.
      this.markCounterPut(counterBy, card, n);
      if (kind === '+1/+1' && card.zone === 'battlefield' && card.is && card.is('Creature')) {
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

    async setMonarch(player, opts = {}) {
      if ((player && player.lost) || this.monarch === player) return false;
      const previous = this.monarch;
      this.monarch = player || null;
      this.monarchSince = player ? {
        turn: this.turnNo,
        phase: this.phase,
        step: this.step || '',
        reason: opts.reason || '',
        sourceName: opts.source && opts.source.name || '',
      } : null;
      const payload = {
        previous,
        player: this.monarch,
        turn: this.turnNo,
        phase: this.phase,
        step: this.step || '',
        reason: opts.reason || '',
        source: opts.source || null,
      };
      if (player) {
        const transfer = previous && previous !== player ? ` — taking the crown from ${previous.name}` : '';
        const cause = payload.source ? ` via ${payload.source.name}` : payload.reason ? ` — ${payload.reason}` : '';
        this.lg(`👑 ${player.name} becomes the MONARCH${transfer}${cause}!`, 'monarch');
      } else this.lg('👑 There is no Monarch.', 'monarch');
      // `emit` is the rules event used by cards such as Palace Jailer.  `note`
      // is the simultaneous presentation event that makes the crown change
      // impossible to miss even when no card triggers from it.
      this.note('monarchChanged', payload);
      await this.emit('monarchChanged', payload);
      return true;
    }

    async becomeMonarch(player, opts = {}) {
      if (!player) return false;
      return this.setMonarch(player, opts);
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

    // Jedna autoritativna putanja za "each opponent" life-loss efekte. Pored
    // zajedničkog Proceed pregleda vraća ukupan izgubljeni život (drain karte
    // ga koriste za lifegain), kao ranije ručno sabrane petlje.
    async loseLifeOpponents(src, controller, n, why) {
      const targets = this.alivePlayers().filter(p => p !== controller);
      if (n <= 0 || !targets.length) return 0;
      await this.reviewGlobalEffectWithHuman({
        effectKind: 'lifeLossAllOpponents', source: src, controller, targets, amount: n,
      });
      let total = 0;
      for (const target of targets) total += await this.loseLife(target, n, why);
      return total;
    }

    // Grupna šteta je simultan događaj. Svaki igrač i dalje prolazi kroz isti
    // damagePlayer replacement/prevention sloj, a SBA se provjerava tek nakon
    // cijele grupe (osim kada pozivalac već upravlja batchom).
    async damageOpponents(src, controller, n, opts = {}) {
      const targets = this.alivePlayers().filter(p => p !== controller);
      if (n <= 0 || !targets.length) return 0;
      await this.reviewGlobalEffectWithHuman({
        effectKind: 'damageAllOpponents', source: src, controller, targets, amount: n,
      });
      let total = 0;
      const damageOpts = Object.assign({}, opts, { deferSBA: true });
      for (const target of targets) total += await this.damagePlayer(src, target, n, damageOpts);
      if (!opts.deferSBA) await this.checkSBA();
      return total;
    }

    async damagePlayer(src, p, n, opts = {}) {
      if (n <= 0 || p.lost) return 0;
      const preventionAllowed = !this.bf().some(card => card.def.damageCantBePrevented);
      if (preventionAllowed && opts.combat && src && src.is && src.is('Creature') && !src.hasSub('Elf') &&
        this.untilEffects.some(e => e.kind === 'preventNonElfCombat')) {
        this.lg(`Galadhrim Ambush prevents combat damage from ${src.name}.`);
        await this.emit('damagePrevented', { src, target: p, player: p, n, combat: true });
        return 0;
      }
      if (preventionAllowed && opts.combat && this.untilEffects.some(e => e.kind === 'preventAllCombat')) {
        this.lg(`Combat damage to ${p.name} was prevented.`);
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
            this.lg(`Damage redirected to ${c.name}.`);
            const applied = new Set(opts._appliedRedirects || []); applied.add(e);
            return this.damageCreature(src, c, n, Object.assign({}, opts, { _appliedRedirects: applied }));
          }
          continue;
        }
        if (preventionAllowed && e.kind === 'comeuppance' && src && src.ctrl !== p) {
          this.lg(`Comeuppance prevents ${n} damage to ${p.name}.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: !!opts.combat });
          if (src.is && src.is('Creature')) {
            await this.damageCreature(e.sourceCard || null, src, n, Object.assign({}, opts, { combat: false }));
          } else if (src.ctrl) {
            await this.damagePlayer(e.sourceCard || null, src.ctrl, n, Object.assign({}, opts, { combat: false }));
          }
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventCombatToPlayer' && opts.combat) {
          this.lg(`Damage to ${p.name} was prevented.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: true });
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventToPlayer') {
          this.lg(`Damage to ${p.name} was prevented.`);
          await this.emit('damagePrevented', { src, target: p, player: p, n, combat: !!opts.combat });
          if (e.reflectCreatures && src && src.is && src.is('Creature')) await this.damageCreature(null, src, n, {});
          return 0;
        }
        if (preventionAllowed && e.kind === 'preventNextToPlayer' && (!e.source || e.source === src)) {
          this.untilEffects.splice(this.untilEffects.indexOf(e), 1);
          this.lg(`The next damage to ${p.name} was prevented.`);
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
      this.lg(`${src ? src.name : 'Source'} deals ${n} damage to ${p.name}.`, 'dmg');
      if (opts.combat && src && src.commander) {
        p.commanderDamage[src.iid] = (p.commanderDamage[src.iid] || 0) + n;
      }
      if (opts.combat && src && src.ctrl && src.ctrl.turnState) {
        src.ctrl.turnState.combatDamageHits.push({ card: src, ctrl: src.ctrl, player: p, n });
      }
      if (opts.combat && this.monarch === p && src && src.ctrl && src.ctrl !== p) {
        await this.becomeMonarch(src.ctrl, { reason: 'combat damage', source: src });
      }
      if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
      p.turnState.damageTaken = (p.turnState.damageTaken || 0) + n;
      await this.loseLife(p, n, 'damage');
      this.note('gameEffect', {
        kind: 'damage', targetKind: 'player', target: p, targetPlayer: p,
        source: src || null, amount: n, combat: !!opts.combat,
        combatStep: opts.combatStep || null, combatIndex: opts.combatIndex || 0,
      });
      await this.emit('damageToPlayer', { src, player: p, n, combat: !!opts.combat });
      if (!opts.deferSBA) await this.checkSBA();
      return n;
    }

    async damageCreature(src, target, n, opts = {}) {
      if (n <= 0 || target.zone !== 'battlefield') return 0;
      const preventionAllowed = !this.bf().some(card => card.def.damageCantBePrevented);
      if (preventionAllowed && opts.combat && src && src.is && src.is('Creature') && !src.hasSub('Elf') &&
        this.untilEffects.some(e => e.kind === 'preventNonElfCombat')) {
        this.lg(`Galadhrim Ambush prevents combat damage from ${src.name}.`);
        await this.emit('damagePrevented', { src, target, n, combat: true });
        return 0;
      }
      if (preventionAllowed && opts.combat && this.untilEffects.some(e => e.kind === 'preventAllCombat')) {
        this.lg(`Combat damage to ${target.name} was prevented.`);
        await this.emit('damagePrevented', { src, target, n, combat: true });
        return 0;
      }
      if (preventionAllowed && this.isProtectedFrom(target, src)) {
        this.lg(`${target.name}: protection prevents damage from ${src ? src.name : 'the source'}.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        return 0;
      }
      for (const e of this.untilEffects.slice()) {
        if (e.kind === 'redirectAllDamage' && e.who === target.ctrl && e.iid !== target.iid &&
          !(opts._appliedRedirects && opts._appliedRedirects.has(e))) {
          const chosen = this.byIid(e.iid);
          if (chosen && chosen.zone === 'battlefield') {
            this.lg(`Damage from ${target.name} was redirected to ${chosen.name}.`);
            const applied = new Set(opts._appliedRedirects || []); applied.add(e);
            return this.damageCreature(src, chosen, n, Object.assign({}, opts, { _appliedRedirects: applied }));
          }
        }
        if (preventionAllowed && e.kind === 'comeuppance' && target.is('Planeswalker') &&
          e.who === target.ctrl && src && src.ctrl !== e.who) {
          this.lg(`Comeuppance prevents ${n} damage to planeswalker ${target.name}.`);
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
        this.lg(`Damage to ${target.name} was prevented.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        return 0;
      }
      // shield counter: upija jedan damage event
      if (preventionAllowed && (target.counters['shield'] || 0) > 0) {
        this.removeCounters(target, 'shield', 1);
        this.lg(`${target.name}: a shield counter absorbs the damage.`);
        await this.emit('damagePrevented', { src, target, n, combat: !!opts.combat });
        await this.emit('shieldRemoved', { card: target });
        return 0;
      }
      if (target.is('Battle')) {
        this.removeCounters(target, 'defense', Math.min(n, target.counters.defense || 0));
        this.lg(`${src ? src.name : 'Source'} deals ${n} damage to battle ${target.name}.`, 'dmg');
        target.meta._lastDamageVisual = { turn: this.turnNo, sourceId: src && src.iid || 0 };
        this.note('gameEffect', {
          kind: 'damage', targetKind: 'permanent', target, targetCard: target,
          source: src || null, amount: n, combat: !!opts.combat,
          combatStep: opts.combatStep || null, combatIndex: opts.combatIndex || 0,
        });
        await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
        if (!opts.deferSBA) await this.checkSBA();
        return n;
      }
      if (target.is('Planeswalker')) {
        this.removeCounters(target, 'loyalty', n);
        this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete planeswalkeru ${target.name}.`, 'dmg');
        if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
        target.meta._lastDamageVisual = { turn: this.turnNo, sourceId: src && src.iid || 0 };
        this.note('gameEffect', {
          kind: 'damage', targetKind: 'permanent', target, targetCard: target,
          source: src || null, amount: n, combat: !!opts.combat,
          combatStep: opts.combatStep || null, combatIndex: opts.combatIndex || 0,
        });
        await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
        if (!opts.deferSBA) await this.checkSBA();
        return n;
      }
      if (src && src.iid !== undefined) {
        if (!target.meta._damageFrom || target.meta._damageFrom.turn !== this.turnNo) {
          target.meta._damageFrom = { turn: this.turnNo, ids: new Set() };
        }
        target.meta._damageFrom.ids.add(src.iid);
      }
      // per-controller iznosi štete ovom stvorenju u OVOM potezu (Grothama LTB draw)
      if (src && src.ctrl) {
        if (!target.meta._damageByCtrl || target.meta._damageByCtrl.turn !== this.turnNo) {
          target.meta._damageByCtrl = { turn: this.turnNo, by: {} };
        }
        target.meta._damageByCtrl.by[src.ctrl.idx] = (target.meta._damageByCtrl.by[src.ctrl.idx] || 0) + n;
      }
      // wither: šteta stvorenjima postaje -1/-1 counteri
      const wither = (src && src.kw && src.kw('wither')) || this.bf().some(x => x.def.allDamageWither);
      if (wither) {
        if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
        this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete (wither → -1/-1): ${target.name}.`, 'dmg');
        await this.addM1(target, n, src ? src.ctrl : null, opts.deferSBA);
        target.meta._lastDamageVisual = { turn: this.turnNo, sourceId: src && src.iid || 0 };
        this.note('gameEffect', {
          kind: 'damage', targetKind: 'permanent', target, targetCard: target,
          source: src || null, amount: n, combat: !!opts.combat, wither: true,
          combatStep: opts.combatStep || null, combatIndex: opts.combatIndex || 0,
        });
        await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
        if (!opts.deferSBA) await this.checkSBA();
        return n;
      }
      target.damage += n;
      if (src && src.kw && src.kw('deathtouch')) target.deathtouched = true;
      if (src && src.kw && src.kw('lifelink')) await this.gainLife(src.ctrl, n, src);
      this.lg(`${src ? src.name : 'Izvor'} nanosi ${n} štete: ${target.name}.`, 'dmg');
      target.meta._lastDamageVisual = { turn: this.turnNo, sourceId: src && src.iid || 0 };
      this.note('gameEffect', {
        kind: 'damage', targetKind: 'permanent', target, targetCard: target,
        source: src || null, amount: n, combat: !!opts.combat,
        combatStep: opts.combatStep || null, combatIndex: opts.combatIndex || 0,
      });
      await this.emit('dealtDamage', { src, target, n, combat: !!opts.combat });
      if (!opts.deferSBA) await this.checkSBA();
      return n;
    }

    // -1/-1 counteri sa centralnim eventom ('m1Added') za Auntie Ool/Hapatra/Blowfly...
    async addM1(card, n, by, deferSBA) {
      if (n <= 0 || card.zone !== 'battlefield') return;
      this.addCounters(card, '-1/-1', n, false, by);
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
        // Phial of Galadriel replaces each individual draw while its
        // controller has no cards in hand. The extra draw is inserted into
        // this same instruction; after the first card arrives the condition
        // normally becomes false for the remaining draws.
        if (!p.hand.length && this.bf().some(card => card.ctrl === p && card.def.drawWhileEmptyExtra)) {
          total += 1;
          this.lg('Phial of Galadriel replaces the draw with two cards.');
        }
        // Dredge is a replacement effect for an individual draw. Offer every
        // eligible card before checking an empty library: dredging can still
        // replace that draw as long as the required number of cards can be
        // milled.
        const dredgers = p.graveyard.filter(card => {
          const amount = Number(card.def.dredge || 0);
          return amount > 0 && p.library.length >= amount;
        });
        if (dredgers.length) {
          const choice = await p.controller.decide(this, {
            type: 'chooseOption',
            prompt: 'Replace this draw with dredge?',
            options: [
              { key: 'draw', label: 'Draw a card' },
              ...dredgers.map(card => ({
                key: `dredge:${card.iid}`,
                label: `Dredge ${card.def.dredge} — ${card.name}`,
                card,
              })),
            ],
            min: 1,
            max: 1,
            aiHint: { kind: 'dredge', player: p, cards: dredgers },
          });
          const key = Array.isArray(choice) ? choice[0] : choice;
          const selected = dredgers.find(card => key === `dredge:${card.iid}`);
          if (selected && dredgers.includes(selected)) {
            const amount = Number(selected.def.dredge);
            await this.mill(p, amount);
            if (selected.zone === 'graveyard') await this.move(selected, 'hand');
            this.lg(`${U.playerVerb(p, 'dredge', 'dredges')} ${selected.name} (${amount}).`, 'draw');
            await this.emit('dredged', { player: p, card: selected, amount, srcCard });
            continue;
          }
        }
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
              ctx.g.lg(`${U.playerVerb(ctx.you, 'reveal', 'reveals')} ${c.name} for Miracle ${c.def.miracle}.`);
              await ctx.g.castSpell(ctx.you, c, {
                from: 'hand', alt: { altCostStr: c.def.miracle, speed: 'instant', miracle: true },
              });
            },
          });
        }
      }
      if (drawn) this.lg(`${U.playerVerb(p, 'draw', 'draws')} ${drawn} ${drawn === 1 ? 'card' : 'cards'}.`, 'draw');
      this.note('hand', { p });
      return drawn;
    }

    async mill(p, n) {
      const milled = [];
      await this.withGraveyardEntryBatch(async () => {
        for (let i = 0; i < n && p.library.length; i++) {
          const c = p.library[p.library.length - 1];
          await this.move(c, 'graveyard');
          milled.push(c);
        }
      });
      if (milled.length) this.lg(`${U.playerVerb(p, 'mill', 'mills')} ${milled.length} ${milled.length === 1 ? 'card' : 'cards'}.`);
      return milled;
    }

    async discard(p, cards, opts = {}) {
      let landsN = 0;
      await this.withGraveyardEntryBatch(async () => {
        for (const c of cards) {
          const wasLand = c.is('Land');
          let destination = 'graveyard';
          const library = !opts.noReplacement && this.bf().find(source =>
            source.ctrl === p && source.def.discardToLibraryTop);
          if (library) {
            const choice = await p.controller.decide(this, {
              type: 'chooseOption',
              prompt: `${library.name}: put ${c.name} on top of your library instead of into your graveyard?`,
              options: [{ key: 'top', label: 'Put on top' }, { key: 'graveyard', label: 'Put in graveyard' }],
              aiHint: { kind: 'discardReplacement', card: c, source: library },
            });
            if (choice === 'top') destination = 'library';
          }
          await this.move(c, destination);
          c.meta._discardedTurn = this.turnNo; // za mayhem
          p.turnState.discardedN = (p.turnState.discardedN || 0) + 1;
          if (wasLand) landsN++;
          await this.emit('discarded', { player: p, card: c });
        }
      });
      if (landsN) await this.emit('discardedLands', { player: p, n: landsN });
      if (cards.length) this.lg(`${U.playerVerb(p, 'discard', 'discards')} ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}.`);
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
      this.lg(`${U.playerVerb(p, 'sacrifice', 'sacrifices')} ${card.name}.`, 'sac');
      await this.move(card, 'graveyard');
      await this.emit('sacrificed', { player: p, card });
      return true;
    }

    async sacrificeMany(p, cards) {
      const unique = [...new Set(cards)].filter(card => this.canSacrifice(card));
      if (!unique.length) return 0;
      // Jedna instrukcija "sacrifice X/them" je simultan događaj. Sačuvaj
      // kontrolore svih izvora kako bi LKI sposobnosti vidjele cijeli batch.
      const previous = this._simultaneousLeaveSources;
      const batch = unique.map(card => ({ card, ctrl: card.ctrl }));
      this._simultaneousLeaveSources = previous ? previous.concat(batch) : batch;
      try {
        await this.withGraveyardEntryBatch(async () => {
          for (const card of unique) {
            this.lg(`${U.playerVerb(p, 'sacrifice', 'sacrifices')} ${card.name}.`, 'sac');
            await this.move(card, 'graveyard');
            await this.emit('sacrificed', { player: p, card });
          }
        });
      } finally {
        this._simultaneousLeaveSources = previous;
      }
      return unique.length;
    }

    async destroy(card, opts = {}) {
      if (card.zone !== 'battlefield') return false;
      if (card.kw('indestructible') && !opts.ignoreIndestructible) {
        this.lg(`${card.name} is indestructible — destroy is prevented.`);
        this.note('gameEffect', { kind: 'keyword', keyword: 'indestructible', state: 'prevented', card, target: card, source: opts.source || null });
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
          this.lg(`${card.name} is indestructible — destroy is prevented.`);
          this.note('gameEffect', { kind: 'keyword', keyword: 'indestructible', state: 'prevented', card, target: card, source: opts.source || null });
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
      const visualBatch = doomed.length >= 3;
      if (visualBatch) {
        for (const card of doomed) card.meta._boardWipeVisualTurn = this.turnNo;
        this.note('gameEffect', {
          kind: 'boardWipe', mode: 'destroy', cards: doomed.slice(), count: doomed.length,
          source: opts.source || null,
        });
      }
      const previous = this._simultaneousLeaveSources;
      const batch = doomed.map(card => ({ card, ctrl: card.ctrl }));
      this._simultaneousLeaveSources = previous ? previous.concat(batch) : batch;
      try {
        await this.withGraveyardEntryBatch(async () => {
          for (const card of doomed) if (card.zone === 'battlefield') await this.move(card, 'graveyard', { suppressVisualEffect: visualBatch });
        });
      } finally {
        this._simultaneousLeaveSources = previous;
      }
      return doomed.length;
    }

    async exileCard(card) {
      if (card.zone === 'ceased') return;
      await this.move(card, 'exile');
    }

    async exileMany(cards) {
      // "Exile all" je, kao destroy-all, simultan događaj. Zaključavanje svih
      // izvora prije prvog move() čuva LTB/dies semantiku board wipea.
      const unique = [...new Set(cards)].filter(card => card && card.zone === 'battlefield');
      const visualBatch = unique.length >= 3;
      if (visualBatch) {
        for (const card of unique) card.meta._boardWipeVisualTurn = this.turnNo;
        this.note('gameEffect', {
          kind: 'boardWipe', mode: 'exile', cards: unique.slice(), count: unique.length, source: null,
        });
      }
      const previous = this._simultaneousLeaveSources;
      const batch = unique.map(card => ({ card, ctrl: card.ctrl }));
      this._simultaneousLeaveSources = previous ? previous.concat(batch) : batch;
      try {
        for (const card of unique) if (card.zone === 'battlefield') await this.move(card, 'exile', { suppressVisualEffect: visualBatch });
      } finally {
        this._simultaneousLeaveSources = previous;
      }
      return unique.length;
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

    untap(card) {
      if (!card || card.zone !== 'battlefield' || !card.tapped) return false;
      card.tapped = false;
      void this.emit('becameUntapped', { card, player: card.ctrl });
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
          colors: d.colorsOverride ? d.colorsOverride.slice() : U.colorsOfCost(d.cost || ''),
          kw: new Set(d.kws || []),
          power: 0, toughness: 0, basePower: 0, baseToughness: 0,
          cantAttack: false, cantBlock: false, cantUntap: false, blockOnlyFlying: false,
          cantSacrifice: false, mustAttack: false,
          assignByToughness: false, allCreatureTypes: !!d.changeling,
          allCreatureTypesFromOtherEffects: false, suppressPrintedChangeling: false,
          extraAbilities: [], wardCost: d.ward || null, extraMana: [],
          hexproof: false, shroud: false, cantBeBlockedBy: null, unblockable: false,
          protectionFrom: [],
          abilitiesDisabled: false, activationDisabled: false,
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
        // Crew: Vehicle postaje artifact creature do kraja poteza (CR 702.121c);
        // mora prije statics passa da anthemi/pumpe vide stvorenje.
        if (c.meta.crewedTurn === this.turnNo && c.hasSub('Vehicle') && !c.cur.types.includes('Creature')) {
          c.cur.types.push('Creature');
        }
        // Amass permanently adds the named race to the chosen Army. Preserve
        // that on the game object instead of mutating its shared printed def.
        for (const subtype of c.meta.addedSubtypes || []) {
          if (!c.cur.subtypes.includes(subtype)) c.cur.subtypes.push(subtype);
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
      // Continuous abilities that function specifically from the graveyard
      // (Wonder and similar cards) are evaluated every recalc, so they also
      // see lands/permanents that entered before the source reached the yard.
      for (const player of this.players) for (const source of player.graveyard) {
        const statics = source.def.graveyardStatics || (source.def.graveyardStatic ? [source.def.graveyardStatic] : []);
        for (const effect of statics) {
          if (effect.cond && !effect.cond(this, source, player)) continue;
          if (effect.apply) effect.apply(this, source, bf, player);
        }
      }
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
        }
        // Keyword counters modify any permanent that can have the ability, not
        // only creatures.  Wakanda Forever! can put indestructible on an artifact
        // or land, and that counter must still stop destroy effects.
        for (const kwc of ['double strike', 'first strike', 'deathtouch', 'lifelink',
          'trample', 'vigilance', 'menace', 'reach', 'hexproof', 'shroud', 'indestructible']) {
          if ((c.counters[kwc] || 0) > 0) c.cur.kw.add(kwc);
        }
      }
      // pass 4: until-EOT effects in timestamp order
      for (const e of this.untilEffects) {
        if (e.apply) e.apply(this, bf);
      }
      // pass 5: per-card temp flags
      for (const c of bf) {
        if (c.meta.tempHaste) c.cur.kw.add('haste');
        // Older card scripts used fast boolean flags while the shared keyword
        // path used `cur.kw`. Keep both representations coherent so legality,
        // visible badges and gained-keyword FX always describe the same state.
        if (c.cur.hexproof) c.cur.kw.add('hexproof');
        if (c.cur.shroud) c.cur.kw.add('shroud');
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
        const hasAscend = bf.some(c => c.ctrl === p && /(^|\n)Ascend\b/i.test(c.def.oracle || ''));
        if (!p.cityBlessing && hasAscend && bf.filter(c => c.ctrl === p).length >= 10) p.cityBlessing = true;
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
            if (feature.startsWith('keyword: ')) {
              const keyword = feature.slice(9);
              if (MTG.KEYWORD_VISUALS && MTG.KEYWORD_VISUALS[keyword]) {
                this.note('gameEffect', { kind: 'keyword', keyword, state: 'gained', card: c, target: c });
              }
            }
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
      const seen = new Map();
      const consider = (card, zoneOK, ctrlOverride) => {
        if (card.cur && card.cur.abilitiesDisabled) return;
        const trigs = card.def.triggers;
        if (!trigs) return;
        for (const t of trigs) {
          let cardSeen = seen.get(card);
          if (!cardSeen) { cardSeen = new Set(); seen.set(card, cardSeen); }
          if (cardSeen.has(t)) continue;
          if (t.on !== name) continue;
          const zone = t.zone || 'battlefield';
          if (!zoneOK(zone)) continue;
          if (t.oncePerTurn && card.meta['_once_' + t.on] === this.turnNo) continue;
          try { if (t.filter && !t.filter(this, card, data)) continue; } catch (e) { continue; }
          cardSeen.add(t);
          found.push({ card, t, ctrlOverride });
        }
      };
      for (const c of this.bf()) consider(c, z => z === 'battlefield');
      // Fizička reprezentacija simultanog leave/dies događaja pomjera karte
      // jednu po jednu. Izvori iz cijelog batcha ipak ostaju dostupni preko LKI.
      if (name === 'dies' || name === 'lto') {
        for (const entry of (this._simultaneousLeaveSources || [])) {
          consider(entry.card, z => z === 'battlefield', entry.ctrl);
        }
      }
      // dying/leaving card's own leave-triggers
      if ((name === 'dies' || name === 'lto') && data.card) {
        const dc = data.card;
        if (!this.bf().includes(dc)) {
          // The physical card has already reset to its owner outside the
          // battlefield. Its own leave/dies trigger is controlled by the
          // player who controlled the permanent immediately before it left.
          consider(dc, z => z === 'battlefield' || z === 'self', data.snap && data.snap.ctrl);
        }
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
      for (const { card, t, ctrlOverride } of found) {
        if (t.oncePerTurn) card.meta['_once_' + t.on] = this.turnNo;
        const nativeTimes = Math.max(0, Number(typeof t.times === 'function'
          ? t.times(this, card, data || {})
          : (t.times === undefined ? 1 : t.times)) || 0);
        // Veyran doubles every permanent trigger caused by casting/copying an
        // instant or sorcery. Prowess lives on `castNonCreature`, Manaform on
        // `cast`, and other engines use castFirst/castSecond.
        let times = nativeTimes;
        const castOrCopyIS = data && data.isInstantSorcery &&
          (name === 'spellCopied' || name === 'targeted' || name === 'cast' || name.startsWith('cast'));
        const castOrCopyController = data && (data.player || data.ctrl || data.byPlayer);
        if (castOrCopyIS && castOrCopyController === card.ctrl) {
          times += nativeTimes * this.bf().filter(v => v.def.doublesMagecraft && v.ctrl === card.ctrl).length;
        }
        for (const doubler of this.bf()) {
          if (doubler.ctrl === card.ctrl && doubler.def.doubleTriggerFilter &&
            doubler.def.doubleTriggerFilter(this, doubler, card, name, data)) times += nativeTimes;
        }
        // Krang: draw-uzrokovani trigeri tvojih permanenata okidaju dodatni put
        if (name === 'draw' && this.bf().some(v => v.def.doubleDrawTriggers && v.ctrl === card.ctrl)) times *= 2;
        for (let i = 0; i < times; i++) {
          this.queueTrigger({
            src: card,
            ctrl: typeof t.controller === 'function'
              ? t.controller(this, card, data || {})
              : (t.controller || ctrlOverride),
            name: t.desc || name, run: t.run, targets: t.targets, modes: t.modes,
            prepareTargets: t.prepareTargets,
            opt: t.opt, data, onlyIf: t.onlyIf, aiHint: t.aiHint,
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
        if (this._trigsThisTurn === 801) this.lg('⚠️ Too many triggers in one turn — the safety limit skips the rest.');
        return;
      }
      const ctrl = tr.ctrl || (tr.src ? tr.src.ctrl : this.players[0]);
      if (ctrl.lost) return;
      if (tr.onlyIf && !tr.onlyIf(this, tr.src, tr.data)) return;
      const ctx = {
        g: this, src: tr.src, you: ctrl, data: tr.data, targets: [],
        // A triggered ability belongs to the exact source object that created
        // it. CardInst instances are reused across zones, so scripts that need
        // to re-check an intervening-if condition at resolution must also be
        // able to distinguish a permanent that left and later returned.
        sourceZoneVersion: tr.src instanceof CardInst ? tr.src.zoneVersion : null,
        // Attachment-triggered abilities may need last known information if
        // their Aura is removed in response. Snapshot the exact enchanted
        // battlefield object while the trigger is put on the Stack; reading
        // `src.attachedTo` later could instead observe a new object after a
        // leave-and-return sequence.
        sourceAttachedTo: tr.src instanceof CardInst ? tr.src.attachedTo : null,
        sourceAttachedToZoneVersion: tr.src instanceof CardInst && tr.src.attachedTo
          ? this.byIid(tr.src.attachedTo)?.zoneVersion ?? null
          : null,
        // Obavezni trigger ne smije izgubiti Magic metu zbog društvenog
        // ugovora. Ako je jedina moguća meta zaštićena dogovorom, Magic pravilo
        // pobjeđuje, a diplomatija bilježi izuzetak bez krivice.
        diplomacyForcedTargeting: !tr.opt,
      };
      // optional trigger?
      if (tr.opt) {
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `${tr.src ? tr.src.name : ''}: ${tr.name} — use it?`,
          options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
          aiHint: Object.assign({ kind: 'optTrigger', src: tr.src, name: tr.name }, tr.aiHint || {}),
          data: tr.data,
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
              this.legalTargets(spec, tr.src, ctrl, { allowForced: !tr.opt }).length < (spec.count ?? 1));
          })
          .map(({ entry, index }) => Object.assign({
            key: String(index), label: entry.label,
          }, entry.aiMeta || {}));
        if (!options.length) return;
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `${tr.src ? tr.src.name : ''}: izaberi mod`,
          options,
          data: tr.data,
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
      const selectedMode = mode !== null ? tr.modes.list[mode] : null;
      const prepareTargets = selectedMode && selectedMode.prepareTargets || tr.prepareTargets;
      if (typeof prepareTargets === 'function') {
        const prepared = await prepareTargets(ctx);
        if (prepared === false) return;
      }
      ctx.targetIdentities = this.captureTargetIdentities(ctx.targets);
      // Crime se počini čim trigger cilja protivnika, njegov permanent, spell
      // ili kartu u njegovom groblju — ne tek na rezoluciji. Spellovi i
      // aktivirane sposobnosti imaju isti obračun u svojim cast/activate
      // putanjama; triggerima je ranije nedostajao.
      {
        const victims = new Set();
        for (const target of (ctx.targets || []).flat().filter(Boolean)) {
          if (target instanceof MTG.Player) {
            if (target !== ctrl) victims.add(target);
            continue;
          }
          const victim = target.zone === 'battlefield' || target.zone === 'stack'
            ? target.ctrl
            : target.owner || target.ctrl;
          if (victim && victim !== ctrl) victims.add(victim);
        }
        if (victims.size) await this.emit('crime', { player: ctrl, victims: [...victims] });
      }
      // put on stack as trigger — allow responses
      const so = {
        kind: 'trigger', name: (tr.src ? tr.src.name + ': ' : '') + (tr.name || 'trigger'),
        ctrl, ctx, run: tr.run, targets: ctx.targets, srcCard: tr.src, targetSpecs: targetSpecs || null, mode,
        targetIdentities: ctx.targetIdentities,
        damageDivision: ctx.damageDivision
          ? ctx.damageDivision.map(entry => Object.assign({}, entry)) : null,
      };
      this.stack.push(so);
      this.queueWardTriggers(so, ctx);
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

    legalTargets(spec, src, ctrl, opts = {}) {
      const out = [];
      const zone = spec.zone || 'battlefield';
      const finish = () => this.diplomacyFilterTargets
        ? this.diplomacyFilterTargets(out, spec, src, ctrl, opts)
        : out;
      const checkProt = (c) => {
        if (!(c instanceof CardInst)) {
          // player target
          const p = c;
          if (spec.what === 'opponent' && p === ctrl) return false;
          for (const b of this.bf()) {
            if (b.def.playerHexproof && b.ctrl === p && ctrl !== p) return false;
          }
          if (ctrl !== p && this.untilEffects.some(effect => effect.kind === 'playerHexproof' && effect.who === p)) return false;
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
        return finish();
      }
      if (spec.what === 'any') { // creature, player, planeswalker, battle
        for (const p of this.alivePlayers()) {
          if (spec.filter && !spec.filter(this, p, ctrl, src)) continue;
          if (checkProt(p)) out.push(p);
        }
        for (const c of this.bf()) {
          if (!(c.is('Creature') || c.is('Planeswalker') || c.is('Battle'))) continue;
          if (spec.filter && !spec.filter(this, c, ctrl, src)) continue;
          if (!checkProt(c)) continue;
          out.push(c);
        }
        return finish();
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
      return finish();
    }

    captureTargetIdentity(target) {
      if (Array.isArray(target)) return target.map(item => this.captureTargetIdentity(item));
      if (target instanceof CardInst) {
        return { kind: 'card', iid: target.iid, zoneVersion: target.zoneVersion };
      }
      // Players retain identity for the game, while stack objects are already
      // validated by membership in `game.stack`; neither needs a zone stamp.
      return null;
    }

    captureTargetIdentities(targets) {
      return (targets || []).map(target => this.captureTargetIdentity(target));
    }

    cloneTargetIdentities(identities) {
      return (identities || []).map(identity => Array.isArray(identity)
        ? this.cloneTargetIdentities(identity)
        : identity ? Object.assign({}, identity) : null);
    }

    async pickTargets(ctx, specs, src, ctrl) {
      ctx.targets = [];
      ctx.wardTargets = [];
      const targetedNow = [];
      for (const spec of specs) {
        let cands = this.legalTargets(spec, src, ctrl, { allowForced: !!ctx.diplomacyForcedTargeting });
        if (typeof spec.dependentFilter === 'function') {
          cands = cands.filter(candidate => spec.dependentFilter(this, candidate, ctx.targets, ctrl, src));
        }
        if (spec.differentFromPrevious && ctx.targets.length) {
          const previous = ctx.targets[ctx.targets.length - 1];
          const excluded = new Set(Array.isArray(previous) ? previous : [previous]);
          cands = cands.filter(candidate => !excluded.has(candidate));
        }
        if (spec.differentFromAllPrevious && ctx.targets.length) {
          const excluded = new Set(ctx.targets.flat().filter(Boolean));
          cands = cands.filter(candidate => !excluded.has(candidate));
        }
        const min = spec.min !== undefined ? spec.min : (spec.upTo ? 0 : (spec.count ?? 1));
        const max = spec.count ?? 1;
        if (cands.length < min) return false;
        if (max === 0) { ctx.targets.push([]); continue; }
        const decision = await ctrl.controller.decide(this, {
          type: 'chooseTargets', spec, candidates: cands, min: Math.min(min, cands.length), max,
          src, prompt: spec.prompt || 'Izaberi metu',
          aiHint: ctx.so && ctx.so.x !== undefined
            ? Object.assign({}, spec.aiHint || {}, { x: ctx.so.x })
            : spec.aiHint,
          cancelable: !!ctx.cancelable,
        });
        if (ctx.cancelable && decision && decision.kind === 'cancel') {
          ctx.cancelled = true;
          return false;
        }
        const picked = Array.isArray(decision) ? [...new Set(decision)] : [];
        if (picked.length < min || picked.length > max || picked.some(target => !cands.includes(target))) return false;
        if (ctx.diplomacyForcedTargeting && this.diplomacyHandleForcedTarget) {
          for (const target of picked) this.diplomacyHandleForcedTarget(ctrl, target, src, spec);
        }
        // "for any number of opponents/players ... that player controls" — najviše jedna meta po kontroloru
        if (spec.distinctCtrl) {
          const ctrls = picked.filter(t => t && t.ctrl).map(t => t.ctrl);
          if (new Set(ctrls).size !== ctrls.length) return false;
        }
        // Ward nije dodatni target/cast trošak. Ciljani spell ili ability prvo
        // normalno ide na stack; zatim Ward trigger ide iznad njega i tek na
        // svojoj rezoluciji traži plaćanje ili pokušava counterovati original.
        for (const t of picked) {
          if (t instanceof CardInst && t.ctrl !== ctrl && t.cur && t.cur.wardCost) {
            ctx.wardTargets.push({ target: t, ward: Object.assign({}, t.cur.wardCost) });
          }
        }
        for (const t of picked) if (t && t.iid !== undefined && !targetedNow.includes(t)) targetedNow.push(t);
        if (max === 1) ctx.targets.push(picked[0]);
        else ctx.targets.push(picked);
      }
      // 'targeted' — karte tipa Black Bolt reaguju kad ih neko cilja. Ranije ga
      // niko nije emitovao pa je okidač bio mrtav. Emituje se TEK kad su sve
      // mete izabrane: usred petlje bi okidač mogao promijeniti stanje table
      // dok se ostale mete još biraju.
      const isSpell = !!(ctx.so && ctx.so.kind === 'spell');
      const isActivatedAbility = !!ctx.isActivatedAbility;
      const isTriggeredAbility = !isSpell && !isActivatedAbility;
      const isInstantSorcery = isSpell && this.isInstantSorcerySpell(ctx.so);
      for (const t of targetedNow) await this.emit('targeted', {
        card: t, byPlayer: ctrl, src, isSpell, isInstantSorcery,
        isActivatedAbility, isTriggeredAbility, ability: ctx.ability || null, so: ctx.so || null,
      });
      return true;
    }

    queueWardTriggers(stackObject, ctx) {
      if (!stackObject || !ctx || !ctx.wardTargets || !ctx.wardTargets.length) return;
      const seen = new Set();
      for (const entry of ctx.wardTargets) {
        const target = entry.target;
        const w = entry.ward;
        if (!target || seen.has(target.iid)) continue;
        seen.add(target.iid);
        this.queueTrigger({
          src: target,
          ctrl: target.ctrl,
          name: w.sacLegendary ? 'Ward—Sacrifice a legendary artifact or creature'
            : w.blight ? `Ward—Blight ${w.blight}` : `Ward ${w.life ? `${w.life} life` : w.mana}`,
          data: { stackObject, payer: stackObject.ctrl, target, ward: w },
          run: async wardCtx => {
            const original = wardCtx.data.stackObject;
            if (!wardCtx.g.stack.includes(original)) return;
            if (original.kind === 'spell' && MTG.isUncounterable && MTG.isUncounterable(wardCtx.g, original)) {
              wardCtx.g.lg(`${original.name}: Ward cannot counter it.`);
              return;
            }
            const paid = await wardCtx.g.payWard(wardCtx.data.payer, wardCtx.data.target, wardCtx.data.ward);
            if (paid) return;
            if (original.kind === 'spell') {
              original.countered = true;
              original.counterSource = wardCtx.data.target;
            } else {
              await wardCtx.g.counterStackObject(original, {
                source: wardCtx.data.target, ignoreUncounterable: true,
                message: `${original.name}: Ward counters the ability.`,
              });
              return;
            }
            wardCtx.g.lg(`${original.name}: Ward counters the ${original.kind === 'spell' ? 'spell' : 'ability'}.`);
            wardCtx.g.note('stack', {});
          },
        });
      }
    }

    async payWard(ctrl, target, wardOverride) {
      const w = wardOverride || target.cur.wardCost;
      if (w.sacLegendary) {
        const pool = this.bf().filter(card => card.ctrl === ctrl && this.canSacrifice(card) &&
          (card.cur.super || []).includes('Legendary') && (card.is('Artifact') || card.is('Creature')));
        if (!pool.length) {
          this.lg(`${ctrl.name} cannot pay Ward—sacrifice a legendary artifact or creature.`);
          return false;
        }
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 0, max: 1,
          prompt: `Ward — sacrifice a legendary artifact or creature to target ${target.name}?`,
          aiHint: { kind: 'ward', target, payment: 'sacrificeLegendary', cards: pool },
        });
        if (!picked.length) return false;
        return this.sacrifice(ctrl, picked[0]);
      }
      if (w.blight) {
        const pool = this.creatures(ctrl);
        if (!pool.length) { this.lg(`${ctrl.name} cannot pay Ward—Blight (no creatures).`); return false; }
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Ward — put ${w.blight} -1/-1 counters on your creature to target ${target.name}?`,
          options: [{ key: 'yes', label: `Blight ${w.blight}` }, { key: 'no', label: 'Cancel' }],
          aiHint: { kind: 'ward', target, payment: 'blight', n: w.blight },
        });
        if (yes !== 'yes') return false;
        const picked = await ctrl.controller.decide(this, {
          type: 'chooseCards', from: pool, min: 1, max: 1, prompt: `Blight ${w.blight}: choose your creature`, aiHint: { kind: 'blight', n: w.blight, source: target },
        });
        if (!picked.length) return false;
        await this.addM1(picked[0], w.blight, ctrl);
        return true;
      }
      if (w.life) {
        const yes = await ctrl.controller.decide(this, {
          type: 'chooseOption', prompt: `Ward — pay ${w.life} life to target ${target.name}?`,
          options: [{ key: 'yes', label: `Pay ${w.life} life` }, { key: 'no', label: 'Cancel' }],
          aiHint: { kind: 'ward', target },
        });
        if (yes === 'yes') { await this.loseLife(ctrl, w.life, 'ward'); return true; }
        return false;
      }
      const cost = U.parseCost(w.mana);
      if (!this.canPayMana(ctrl, cost)) { this.lg(`${ctrl.name} cannot pay ward for ${target.name}.`); return false; }
      const yes = await ctrl.controller.decide(this, {
        type: 'chooseOption', prompt: `Ward — pay ${w.mana} to target ${target.name}?`,
        options: [{ key: 'yes', label: `Pay ${w.mana}` }, { key: 'no', label: 'Cancel' }],
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
            this.lg(`💥 ${w.name} WINS — ${c.name} has ${need}+ charge counters!`, 'win');
            for (const q of this.players) if (q !== w) q.lost = true;
            this.gameOver = true; this.winner = w;
            this.note('gameover', { winner: w });
            return;
          }
          // players lose
          for (const p of this.players) {
            if (p.lost) continue;
            let dead = false, why = '';
            if (p.life <= 0) { dead = true; why = 'life reached 0'; }
            if (p.deckedOut) { dead = true; why = 'empty library'; }
            // 903.10a: 21 štete od ISTOG komandera. Kućno pravilo može tražiti zbir partnera.
            if (this.houseRules && this.houseRules.sumPartnerDamage) {
              const byOwner = {};
              for (const q of this.players) for (const c of q.commanders) byOwner[c.iid] = q.idx;
              const tot = {};
              for (const [iid, dmg] of Object.entries(p.commanderDamage)) {
                const k = byOwner[iid] !== undefined ? 'p' + byOwner[iid] : iid;
                tot[k] = (tot[k] || 0) + dmg;
              }
              for (const k in tot) if (tot[k] >= 21) { dead = true; why = 'commander damage (21+, house rule: combined partner damage)'; }
            } else {
              for (const [iid, dmg] of Object.entries(p.commanderDamage)) {
                if (dmg >= 21) { dead = true; why = 'commander damage (21+)'; }
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
          // Damage-based sweepers resolve as a series of deferred damage
          // events followed by one SBA pass. Detect a shared damage source so
          // three or more simultaneous deaths receive one table-wide storm
          // treatment instead of a noisy stack of unrelated card exits.
          const lethalDamageGroups = new Map();
          for (const card of this.bf()) {
            if (!card.is('Creature') || !card.meta._lastDamageVisual || card.meta._lastDamageVisual.turn !== this.turnNo) continue;
            const zeroToughness = card.cur.toughness <= 0;
            const lethalMarked = card.damage >= card.cur.toughness || (card.deathtouched && card.damage > 0);
            const actuallyDies = zeroToughness || (lethalMarked && !card.kw('indestructible') &&
              (card.counters.shield || 0) <= 0 && card.regenShield <= 0);
            if (!actuallyDies || card.meta._boardWipeVisualTurn === this.turnNo) continue;
            const sourceId = card.meta._lastDamageVisual.sourceId || 0;
            if (!lethalDamageGroups.has(sourceId)) lethalDamageGroups.set(sourceId, []);
            lethalDamageGroups.get(sourceId).push(card);
          }
          for (const [sourceId, cards] of lethalDamageGroups) {
            if (cards.length < 3) continue;
            for (const card of cards) card.meta._boardWipeVisualTurn = this.turnNo;
            this.note('gameEffect', {
              kind: 'boardWipe', mode: 'damage', cards: cards.slice(), count: cards.length,
              source: sourceId ? this.byIid(sourceId) : null,
            });
          }
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
              // An Aura enchanting a player stores that Player directly; an
              // Aura enchanting a permanent stores the permanent iid. Derive
              // the attachment kind from the actual host instead of optional
              // per-card metadata.
              const vic = c.meta && c.meta.cursedPlayer;
              if (vic instanceof Player) {
                if (vic.lost) { await this.move(c, 'graveyard'); any = true; continue; }
              } else {
                const host = c.attachedTo ? this.byIid(c.attachedTo) : null;
                const auraSpec = c.def.auraTarget && c.def.auraTarget[0];
                const enchantLegal = host && host.zone === 'battlefield' &&
                  (!auraSpec || !auraSpec.filter || auraSpec.filter(this, host, c.ctrl, c)) &&
                  !this.isProtectedFrom(host, c);
                if (!enchantLegal) { await this.move(c, 'graveyard'); any = true; continue; }
              }
            }
            if (subs.includes('Equipment') && c.attachedTo) {
              const host = this.byIid(c.attachedTo);
              if (c.is('Creature') || !host || host.zone !== 'battlefield' || !host.is('Creature') ||
                this.isProtectedFrom(host, c)) {
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
      this.lg(`☠️ ${U.playerVerb(p, 'lose', 'loses')} (${why}).`, 'lose');
      // CR 800.4a: PRVO prestaju efekti koji su mu davali kontrolu nad tuđim
      // permanentima — ti se vraćaju vlasniku i ostaju u igri. Tek onda iz igre
      // odlazi ono što on POSJEDUJE.
      for (const c of this.bf()) {
        if (c.ctrl === p && c.owner !== p && !c.owner.lost) {
          c.ctrl = c.owner;
          c.sick = true;
          if (c.meta) { delete c.meta._brokerOrig; delete c.meta._brokerBy; }
          this.lg(`${c.name} returns to ${c.owner.name} (its controller was eliminated).`);
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
        if (next && !next.lost && next !== p) {
          await this.becomeMonarch(next, { reason: `${p.name} was eliminated` });
        } else await this.setMonarch(null, { reason: `${p.name} was eliminated` });
      }
      this.stack = this.stack.filter(so => so.ctrl !== p);
      this.recalc();
      const alive = this.alivePlayers();
      if (alive.length <= 1) {
        this.gameOver = true;
        this.winner = alive[0] || null;
        this.lg(`🏆 ${this.winner ? this.winner.name + ' WINS!' : 'No winner.'}`, 'win');
        this.note('gameover', { winner: this.winner });
      }
    }
  }
  MTG.Game = Game;
})();
