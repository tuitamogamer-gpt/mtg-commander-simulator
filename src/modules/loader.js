// ===== loader.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Builds final card definitions from raw DB + scripts; game factory
(function () {
  const U = MTG;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  // Blame Game je izbačen iz proizvoda: njegov identitet zavisi od velikog
  // broja političkih/goad i damage-redirection interakcija koje ne možemo
  // certifikovati bez kompromisa. Raw karte ostaju dostupne drugim deckovima.
  MTG.EXCLUDED_DECKS = new Set(['Blame Game']);

  MTG.initData = function (rawDB) {
    MTG.DB = rawDB;
    MTG.DEFS = MTG.buildDefs(rawDB.cards, MTG.SCRIPTS);
    // token defs: merge script-ish fields already inline
    MTG.DECKS = {};
    for (const d of rawDB.decks) {
      if (MTG.EXCLUDED_DECKS.has(d.name)) continue;
      const key = d.name;
      MTG.DECKS[key] = d;
    }
    // deck meta (blurbs & archetypes for UI/AI)
    MTG.DECK_META = {
      'Squirreled Away': { icon: '🐿️', colors: ['B', 'G'], style: 'Tokeni i žrtvovanje', blurb: 'Vjeverice, Foodovi i sac-sinergije. Široke table i drain efekti.', set: 'Bloomburrow Commander (2024)' },
      'Animated Army': { icon: '🥁', colors: ['R', 'G'], style: 'Animirani artefakti', blurb: 'Bello pretvara artefakte i enchantmente u 4/4 vojsku sa haste.', set: 'Bloomburrow Commander (2024)' },
      'Family Matters': { icon: '🐭', colors: ['U', 'R', 'W'], style: 'Offspring/letači', blurb: 'Zinnia daje offspring svakom stvorenju — porodica malih kopija u zraku.', set: 'Bloomburrow Commander (2024)' },
      'Endless Punishment': { icon: '👹', colors: ['B', 'R'], style: 'Kažnjavanje', blurb: 'Valgavoth raste dok protivnici krvare na svakom koraku.', set: 'Duskmourn Commander (2024)' },
      'Quick Draw': { icon: '🎯', colors: ['U', 'R'], style: 'Spellslinger', blurb: 'Stella Lee kopira instante i sorcerije — brzina i preciznost.', set: 'Outlaws of Thunder Junction Commander (2024)' },
      'Abzan Armor': { icon: '🛡️', colors: ['W', 'B', 'G'], style: 'Toughness/zidovi', blurb: 'Felothar: zidovi napadaju po toughnessu. Spora, neprobojna sila.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Deep Clue Sea': { icon: '🔍', colors: ['G', 'W', 'U'], style: 'Clue/card draw', blurb: 'Morska istražuje — Clue tokeni, brda karata i veliki finišeri.', set: 'Murders at Karlov Manor Commander (2024)' },
      'Blame Game': { icon: '⚖️', colors: ['R', 'W'], style: 'Goad/politika', blurb: 'Nelly Borca huška protivnike jedne na druge — čisti multiplayer haos.', set: 'Murders at Karlov Manor Commander (2024)' },
      'Turtle Power': { icon: '🐢', colors: ['W', 'U', 'B', 'R', 'G'], style: '+1/+1 counteri/tokeni', blurb: 'Kornjače! Heroes in a Half Shell: Mutanti, Ninje i Kornjače rastu sa svakim udarcem. Cowabunga!', set: 'Teenage Mutant Ninja Turtles Commander (2026)' },
      'Mardu Surge': { icon: '⚔️', colors: ['R', 'W', 'B'], style: 'Go-wide tokeni', blurb: 'Zurgo Stormrender: mobilize horde, tokeni napadaju u talasima, svaki koji ode nosi vrijednost.', set: 'Tarkir: Dragonstorm Commander (2025)' },
      'Blight Curse': { icon: '🍄', colors: ['B', 'R', 'G'], style: '-1/-1 counteri/wither', blurb: 'Auntie Ool: -1/-1 counteri truju sve — wither, Necroskitter krade leševe, Hapatra pravi zmije.', set: 'Lorwyn Eclipsed Commander (2026)' },
      'Counter Intelligence': { icon: '🛸', colors: ['U', 'R', 'W'], style: 'Artefakti/charge', blurb: 'Inspirit, svemirski brod: station charge counteri, proliferate, Darksteel Reactor win-con.', set: 'Edge of Eternities Commander (2025)' },
      'Most Wanted': { icon: '🤠', colors: ['R', 'W', 'B'], style: 'Outlawi/Treasure', blurb: 'Olivia: odmetnici pljačkaju — Treasure za svaki udarac, krađe i politika Divljeg zapada.', set: 'Outlaws of Thunder Junction Commander (2024)' },
      'Elven Council': { icon: '🧝', colors: ['G', 'U'], style: 'Elfovi/glasanje', blurb: 'Galadriel: vijeće glasa svaki combat — elfovi, Prsten iskušava, politika i mudrost.', set: 'LOTR: Tales of Middle-earth Commander (2023)' },
      'Prismari Artistry': { icon: '🎨', colors: ['U', 'R'], style: 'Spellslinger/kopije', blurb: 'Rootha: svaki instant/sorcery pravi X/X elementale — umjetnost je eksplozija!', set: 'Secrets of Strixhaven Commander (2026)' },
      'Avengers Assemble': { icon: '🛡️', colors: ['U', 'R', 'W'], style: 'Hero tribal/counteri', blurb: 'Captain America okuplja Osvetnike — svaki Hero jača tim. Avengers, assemble!', set: 'Marvel Super Heroes Commander (2026)' },
      'Doom Prevails': { icon: '🤖', colors: ['U', 'B', 'R'], style: 'Villaini/connive', blurb: 'Doctor Doom i galerija zlikovaca: connive, mayhem iz groblja, krađe i kazne.', set: 'Marvel Super Heroes Commander (2026)' },
      'The Fantastic Four': { icon: '4️⃣', colors: ['R', 'G', 'W', 'U'], style: 'Noncreature sinergije', blurb: 'Prva porodica: svaki noncreature spell pali sposobnosti — Flame On, Clobberin Time!', set: 'Marvel Super Heroes Commander (2026)' },
      'Wakanda Forever': { icon: '🐾', colors: ['G', 'W'], style: 'Artefakti/monarh', blurb: 'T\'Challa: Vibranium mana, oprema i borba za krunu. Wakanda forever!', set: 'Marvel Super Heroes Commander (2026)' },
      'Scions & Spellcraft': { icon: '🔮', colors: ['W', 'U', 'B'], style: 'Spellslinger/drain', blurb: 'Y\'shtola: svaki noncreature spell MV 3+ drena svakog protivnika za 2. Scioni, kopije i kontrola.', set: 'Final Fantasy Commander (2025)' },
      'Coven Counters': { icon: '🌾', colors: ['G', 'W'], style: '+1/+1 counteri/Coven', blurb: 'Leinore: counter svaki combat, a tri stvorenja različite snage vuku kartu. Coven i ljudi.', set: 'Innistrad: Midnight Hunt Commander (2021)' },
    };
    if (MTG.buildDeckAIProfiles) MTG.buildDeckAIProfiles();
  };

  // ============================================================
  // KOMANDERI: partner pravila i legalni izbori po deku
  // ============================================================
  // Podržane varijante:
  //   Partner                    – bilo koja druga karta sa običnim Partnerom
  //   Partner—<Label>            – samo karta sa ISTIM labelom (npr. TMNT "Character select")
  //   Partner with <Ime>         – samo ta imenovana karta
  //   Friends forever            – bilo koja druga sa Friends forever
  //   Choose a Background        – + bilo koji Background
  //   Doctor's companion         – + bilo koji legendarni Doctor
  MTG.cmdTag = function (def) {
    const o = (def && def.oracle) || '';
    const sub = (def && def.subtypes) || [];
    const sup = (def && def.super) || [];
    const t = { kind: null, label: null, with: null };
    let m;
    if ((m = /^Partner with ([^(\n]+?)\s*(?:\(|$)/m.exec(o))) { t.kind = 'with'; t.with = m[1].trim().replace(/\.$/, ''); }
    else if ((m = /^Partner\s*[—–-]\s*([^(\n]+?)\s*(?:\(|$)/m.exec(o))) { t.kind = 'named'; t.label = m[1].trim(); }
    else if (/^Partner\s*(?:\(|$)/m.test(o)) { t.kind = 'partner'; }
    else if (/^Friends forever/m.test(o)) { t.kind = 'named'; t.label = 'Friends forever'; }
    else if (/Doctor's companion/i.test(o)) { t.kind = 'doctorsCompanion'; }
    else if (/Choose a Background/i.test(o)) { t.kind = 'background'; }
    t.isBackground = sub.indexOf('Background') >= 0;
    t.isDoctor = sub.indexOf('Doctor') >= 0 && sup.indexOf('Legendary') >= 0;
    return t;
  };

  // ljudski čitljiv opis partner sposobnosti
  MTG.cmdTagLabel = function (tag) {
    if (!tag || !tag.kind) return '';
    if (tag.kind === 'with') return '🤝 Partner sa: ' + tag.with;
    if (tag.kind === 'named') return '🤝 Partner — ' + tag.label;
    if (tag.kind === 'partner') return '🤝 Partner';
    if (tag.kind === 'background') return '🤝 Bira Background';
    if (tag.kind === 'doctorsCompanion') return '🤝 Doctor\'s companion';
    return '';
  };

  // može li ovo dvoje biti par komandera?
  MTG.canPartner = function (defA, defB) {
    if (!defA || !defB || defA.name === defB.name) return false;
    const a = MTG.cmdTag(defA), b = MTG.cmdTag(defB);
    if (a.kind === 'with' || b.kind === 'with')
      return a.with === defB.name || b.with === defA.name;
    if (a.kind === 'partner' && b.kind === 'partner') return true;
    if (a.kind === 'named' && b.kind === 'named' &&
      String(a.label).toLowerCase() === String(b.label).toLowerCase()) return true;
    if (a.kind === 'background' && b.isBackground) return true;
    if (b.kind === 'background' && a.isBackground) return true;
    if (a.kind === 'doctorsCompanion' && b.isDoctor) return true;
    if (b.kind === 'doctorsCompanion' && a.isDoctor) return true;
    return false;
  };

  MTG.canBeCommander = function (def, deckData) {
    if (!def) return false;
    // face commander deka je uvijek legalan (planeswalkeri, legendarni Spacecraft…)
    if (deckData && deckData.commander === def.name) return true;
    const sup = def.super || [], o = def.oracle || '';
    if (def.canBeCommanderExtra) return true;
    if (/can be your commander/i.test(o)) return true;
    if ((def.subtypes || []).indexOf('Background') >= 0) return true;
    return sup.indexOf('Legendary') >= 0 && (def.types || []).indexOf('Creature') >= 0;
  };

  // Commander color identity: mana cost + mana simboli u rules tekstu (bez
  // reminder teksta) + eksplicitne dopune za color indicator/specijalne karte.
  MTG.cardColorIdentity = function (def) {
    if (!def) return [];
    const found = new Set();
    const add = values => { for (const color of values || []) if (COLORS.includes(color)) found.add(color); };
    add(U.colorsOfCost(def.cost || ''));
    const rules = String(def.oracle || '').replace(/\([^()]*\)/g, '');
    add(U.colorsOfCost((rules.match(/\{[^}]+\}/g) || []).join('')));
    add(def.colorIdentityExtra);
    add(def._ci);
    const landColors = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
    for (const subtype of def.subtypes || []) if (landColors[subtype]) found.add(landColors[subtype]);
    return COLORS.filter(color => found.has(color));
  };

  MTG.deckColorIdentity = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    const found = new Set();
    for (const entry of deckData && deckData.cards || []) {
      for (const color of MTG.cardColorIdentity(defs[entry.name])) found.add(color);
    }
    return COLORS.filter(color => found.has(color));
  };

  // svi legalni komanderi u deku, sortirano: face commander prvi, pa partneri, pa ostali
  MTG.legalCommanders = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    if (!deckData) return [];
    const seen = {}, out = [];
    for (const entry of deckData.cards || []) {
      if (seen[entry.name]) continue;
      seen[entry.name] = 1;
      const def = defs[entry.name];
      if (!MTG.canBeCommander(def, deckData)) continue;
      const tag = MTG.cmdTag(def);
      out.push({
        name: entry.name, def, tag,
        isDefault: entry.name === deckData.commander,
        partnerLabel: MTG.cmdTagLabel(tag),
      });
    }
    // Kandidat je stvarno legalan samo ako sam, ili sa legalnim partnerom iz
    // istog decka, pokriva color identity svih 100 karata.
    const viable = out.filter(candidate => {
      if (MTG.validateCommanders(deckData, [candidate.name], defs).ok) return true;
      return out.some(mate => mate !== candidate && MTG.canPartner(candidate.def, mate.def) &&
        MTG.validateCommanders(deckData, [candidate.name, mate.name], defs).ok);
    });
    viable.sort((a, b) => (b.isDefault - a.isDefault) || ((b.tag.kind ? 1 : 0) - (a.tag.kind ? 1 : 0)) || a.name.localeCompare(b.name));
    return viable;
  };

  // provjera izbora (1 ili 2 imena)
  MTG.validateCommanders = function (deckData, names, defs) {
    defs = defs || MTG.DEFS;
    names = (names || []).filter(Boolean);
    if (!names.length) return { ok: false, why: 'Nije izabran nijedan komander.' };
    if (names.length > 2) return { ok: false, why: 'Najviše dva komandera.' };
    const pool = {};
    for (const entry of (deckData.cards || [])) pool[entry.name] = (pool[entry.name] || 0) + entry.n;
    for (const n of names) {
      if (!pool[n]) return { ok: false, why: `${n} nije u ovom deku.` };
      if (!MTG.canBeCommander(defs[n], deckData)) return { ok: false, why: `${n} ne može biti komander.` };
    }
    if (names.length === 2) {
      if (names[0] === names[1]) return { ok: false, why: 'Isti komander dvaput.' };
      if (!MTG.canPartner(defs[names[0]], defs[names[1]]))
        return { ok: false, why: `${names[0]} i ${names[1]} nisu partneri.` };
    }
    const commanderColors = new Set();
    for (const name of names) for (const color of MTG.cardColorIdentity(defs[name])) commanderColors.add(color);
    const deckColors = MTG.deckColorIdentity(deckData, defs);
    const outside = deckColors.filter(color => !commanderColors.has(color));
    if (outside.length) {
      return { ok: false, why: `Deck sadrži boje izvan identiteta komandera: ${outside.join(', ')}.` };
    }
    return { ok: true, why: '' };
  };

  // AI/nasumičan izbor: face commander, ili slučajan legalan (par ako može)
  MTG.randomCommanders = function (deckData, rnd, defs) {
    defs = defs || MTG.DEFS;
    const legals = MTG.legalCommanders(deckData, defs);
    if (!legals.length) return [deckData.commander];
    const pick = legals[Math.floor(rnd() * legals.length)];
    const mates = legals.filter(l => MTG.canPartner(pick.def, l.def) &&
      MTG.validateCommanders(deckData, [pick.name, l.name], defs).ok);
    if (mates.length && rnd() < 0.6) {
      const mate = mates[Math.floor(rnd() * mates.length)];
      return [pick.name, mate.name];
    }
    return [pick.name];
  };

  // ============================================================
  // KLASIFIKACIJA PRIJETNJE — šta mi je bot upravo uperio u glavu?
  // ============================================================
  MTG.THREAT_KINDS = {
    counter: { icon: '🚫', label: 'Counterspell', cls: 'counter', hint: 'Kontrira ti spell — ako imaš odgovor, sad je trenutak.' },
    exile: { icon: '🌀', label: 'Exile', cls: 'exile', hint: 'Egzil — karta se ne vraća u groblje. Regeneracija i „vrati iz groblja" ne pomažu.' },
    destroy: { icon: '💀', label: 'Removal', cls: 'destroy', hint: 'Uništava ti permanent.' },
    sacrifice: { icon: '🔪', label: 'Prisilna žrtva', cls: 'destroy', hint: 'Tjera te da žrtvuješ — hexproof i indestructible te NE spašavaju.' },
    bounce: { icon: '↩️', label: 'Bounce', cls: 'bounce', hint: 'Vraća ti permanent u ruku.' },
    damage: { icon: '🔥', label: 'Direktna šteta', cls: 'damage', hint: 'Šteta na tebe ili tvoje stvorenje.' },
    steal: { icon: '🤝', label: 'Krađa', cls: 'steal', hint: 'Preuzima kontrolu nad tvojim permanentom.' },
    discard: { icon: '🃏', label: 'Discard', cls: 'discard', hint: 'Tjera te da odbaciš karte.' },
    debuff: { icon: '⬇️', label: 'Slabljenje', cls: 'debuff', hint: 'Smanjuje/tapuje/blokira tvoje stvorenje.' },
    tax: { icon: '💸', label: 'Porez / gubitak', cls: 'debuff', hint: 'Gubiš život, resurse ili plaćaš.' },
    goad: { icon: '😈', label: 'Goad / politika', cls: 'steal', hint: 'Tjera tvoja stvorenja da napadaju drugoga.' },
    target: { icon: '🎯', label: 'Ciljano na tebe', cls: 'target', hint: 'Bot je uperio ovo u tebe.' },
  };

  // vraća {key, icon, label, cls, hint} — najspecifičnija kategorija koja se poklopi
  MTG.threatKind = function (def, targets) {
    const o = ((def && def.oracle) || '').replace(/\s+/g, ' ');
    const t = s => new RegExp(s, 'i').test(o);
    const hitsSpell = (targets || []).flat().some(x => x && x.kind && !x.zone);
    if (hitsSpell || t('counter target') || t('counter (?:that|it)\\b') || t('counter all')) return kind('counter');
    if (t('exile target') || t('exile (?:all|each|any number of|up to)') || t('exile (?:that|it) (?:card|creature|permanent)')) return kind('exile');
    if (t('gain control of')) return kind('steal');
    if (t('goad')) return kind('goad');
    if (t('sacrific\\w+ (?:a|an|that|the|one|two|\\d)')) return kind('sacrifice');
    if (t('destroy target') || t('destroy (?:all|each|any number of|up to)')) return kind('destroy');
    if (t('return target .* to .*hand') ||
      t('shuffles? .* into (?:their|its owner\'s) library') ||
      t('(?:on top|on the bottom) of (?:its owner\'s|their) library')) return kind('bounce');
    if (t('deals? \\d+ damage') || t('deals? damage equal') || t('deals? X damage')) return kind('damage');
    if (t('discards? ')) return kind('discard');
    if (t('gets? [-−]\\d') || t('tap target') || t("(?:doesn't|does not) untap") || t('-1/-1 counter')) return kind('debuff');
    if (t('loses? \\d+ life') || t('lose life') || t('pay(?:s)? ')) return kind('tax');
    return kind('target');
    function kind(k) { return Object.assign({ key: k }, MTG.THREAT_KINDS[k]); }
  };

  // opis meta u jednoj liniji ("TEBE", imena permanenata, "tvoj spell X")
  MTG.threatTargetNames = function (targets, human) {
    const out = [];
    for (const x of (targets || []).flat()) {
      if (!x) continue;
      if (x === human) out.push('TEBE');
      else if (x.kind && !x.zone) out.push(`tvoj spell „${x.name || (x.card && x.card.name) || '?'}"`);
      else if (x.name) out.push(x.name);
    }
    return out;
  };

  // redovi za prikaz commander štete — poštuje kućno pravilo o zbiru partnera
  MTG.cmdDamageRows = function (g, p) {
    const sum = !!(g.houseRules && g.houseRules.sumPartnerDamage);
    const ent = Object.entries(p.commanderDamage || {});
    const rows = [];
    if (!sum) {
      for (const [iid, n] of ent) {
        const c = g.byIid(parseInt(iid, 10));
        rows.push({ label: c ? c.name.split(',')[0] : '?', n, detail: c ? c.name : '' });
      }
    } else {
      const byKey = {};
      for (const [iid, n] of ent) {
        const c = g.byIid(parseInt(iid, 10));
        const own = c && c.owner ? c.owner : null;
        const k = own ? 'p' + own.idx : iid;
        if (!byKey[k]) { byKey[k] = { label: own ? own.name : '?', n: 0, parts: [] }; rows.push(byKey[k]); }
        byKey[k].n += n;
        byKey[k].parts.push(`${c ? c.name.split(',')[0] : '?'} ${n}`);
      }
      for (const r of rows) r.detail = r.parts.join(' + ');
    }
    rows.sort((a, b) => b.n - a.n);
    return rows;
  };

  MTG.newGame = function (opts) {
    // opts: {humanDeck, aiDecks:[names], aiStyles:[keys], seed, onEvent, humanController, difficulty, maxTurns,
    //        humanCommanders:[names], aiRandomCommanders:bool}
    const g = new MTG.Game({
      seed: opts.seed, onEvent: opts.onEvent, maxTurns: opts.maxTurns, paced: opts.paced,
      houseRules: Object.assign({}, opts.houseRules,
        opts.sumPartnerDamage !== undefined ? { sumPartnerDamage: !!opts.sumPartnerDamage } : {}),
    });
    const names = ['Ti', 'AI Zmaj', 'AI Vuk', 'AI Gavran'];
    const players = [];
    const humanP = g.addPlayer(opts.humanName || names[0], MTG.DECKS[opts.humanDeck], null, !opts.humanController);
    if (opts.humanCommanders && opts.humanCommanders.length) humanP.chosenCommanders = opts.humanCommanders.slice(0, 2);
    let i = 1;
    const styleKeys = Object.keys(MTG.AI_STYLES || {}).filter(k => k !== 'balanced');
    const styles = [];
    for (const dk of opts.aiDecks) {
      const q = g.addPlayer(names[i] + '', MTG.DECKS[dk], null, true);
      let st = (opts.aiStyles && opts.aiStyles[i - 1]) || 'random';
      if (st === 'random') st = styleKeys.length ? styleKeys[Math.floor(g.rnd() * styleKeys.length)] : 'balanced';
      styles.push({ player: q, style: st });
      i++;
    }
    for (const p of g.players) {
      if (p === humanP && opts.humanController) {
        p.controller = opts.humanController(p);
        p.isAI = false;
      } else {
        const st = (styles.find(s => s.player === p) || {}).style || 'balanced';
        p.controller = new MTG.AIController(p, { difficulty: opts.difficulty || 'normal', style: st });
        p.isAI = true;
      }
      if (p !== humanP && opts.aiRandomCommanders && !p.chosenCommanders)
        p.chosenCommanders = MTG.randomCommanders(p.deck, g.rnd, MTG.DEFS);
      g.buildDeck(p, p.deck, MTG.DEFS);
      p.deckName = p.deck.name;
    }
    // objavi izbor komandera u log (samo kad odstupa od face commandera)
    for (const p of g.players) {
      const nm = p.commanders.map(c => c.name);
      if (nm.length > 1 || (nm.length === 1 && nm[0] !== p.deck.commander))
        g.lg(`👑 ${p.name}: ${nm.join(' + ')}${nm.length > 1 ? ' (partneri)' : ''}`);
    }
    // randomize turn order
    U.shuffle(g.players, g.rnd);
    g.players.forEach((p, idx) => p.idx = idx);
    // objavi stilove botova u log
    for (const p of g.players) {
      if (p.isAI && p.aiStyle && MTG.AI_STYLES && MTG.AI_STYLES[p.aiStyle]) {
        const m = MTG.AI_STYLES[p.aiStyle];
        g.lg(`🎭 ${p.name} (${p.deckName}) igra stilom: ${m.icon} ${m.label}`);
      }
    }
    return g;
  };
})();
