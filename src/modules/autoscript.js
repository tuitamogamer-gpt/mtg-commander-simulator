// ===== autoscript.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Generic support za karte BEZ ručnih skripti:
//  - scryfallToDef: Scryfall JSON -> naš def format
//  - autoScript: heuristički parser oracle teksta (landovi, rockovi, česti spellovi)
(function () {
  const U = MTG, T = () => MTG.T, E = () => MTG.E;
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const SUPERTYPES = ['Legendary', 'Basic', 'Snow', 'World'];
  const CARDTYPES = ['Creature', 'Artifact', 'Enchantment', 'Instant', 'Sorcery', 'Land', 'Planeswalker', 'Battle', 'Kindred', 'Tribal'];

  MTG.scryfallToDef = function (sf) {
    // za DFC/adventure/split koristimo prednju stranu
    const face = (sf.card_faces && sf.card_faces.length && !sf.mana_cost) ? sf.card_faces[0] : sf;
    const typeLine = (face.type_line || sf.type_line || '').split('//')[0].trim();
    const [typesPart, subsPart] = typeLine.split('—').map(s => (s || '').trim());
    const words = typesPart.split(/\s+/).filter(Boolean);
    const sup = words.filter(w => SUPERTYPES.includes(w));
    const types = words.filter(w => CARDTYPES.includes(w)).map(w => (w === 'Kindred' || w === 'Tribal') ? w : w);
    const subtypes = (subsPart || '').split(/\s+/).filter(Boolean);
    const def = {
      name: sf.name.split(' // ')[0] === face.name ? face.name : sf.name,
      cost: (face.mana_cost || sf.mana_cost || '') || null,
      super: sup, types, subtypes,
      oracle: (face.oracle_text || sf.oracle_text || ''),
      kws: [],
      imported: true,
    };
    if (face.power !== undefined) def.power = String(face.power);
    if (face.toughness !== undefined) def.toughness = String(face.toughness);
    if (face.loyalty !== undefined) def.loyalty = String(face.loyalty);
    if (sf.produced_mana) def._produced = sf.produced_mana.filter(c => COLORS.includes(c) || c === 'C');
    if (sf.color_identity) def._ci = sf.color_identity;
    return def;
  };

  const numWord = (w) => ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }[w] || parseInt(w, 10) || 0);

  // ---------- generic land / mana rock ----------
  function autoMana(def) {
    const o = def.oracle || '';
    const isLand = def.types.includes('Land');
    const isRockish = (def.types.includes('Artifact') || def.types.includes('Creature')) && /\{T\}:\s*Add/.test(o);
    if (!isLand && !isRockish) return null;
    const out = {};
    // enters tapped?
    if (isLand) {
      if (/enters (the battlefield )?tapped(?! unless)/i.test(o)) out.entersTapped = true;
      else if (/enters (the battlefield )?tapped unless/i.test(o)) out.entersTapped = (g, card) => g.lands(card.ctrl).length > 2 ? false : false; // popustljivo: untapped
    }
    // produkcija
    let produce = null;
    if (/Add one mana of any color/i.test(o)) produce = [{ ANY: true, n: 1 }];
    else if (/Add two mana of any one color/i.test(o)) produce = [{ ANY: true, n: 2 }];
    else if (/Add three mana of any one color/i.test(o)) produce = [{ ANY: true, n: 3 }];
    else {
      // "{T}: Add {G}." / "Add {B} or {R}." / "Add {C}{C}."
      const m = /\{T\}:\s*Add ([^.\n]+)/.exec(o);
      if (m) {
        const seg = m[1];
        const opts = seg.split(/\s+or\s+/).map(part => {
          const counts = {};
          const re = /\{([WUBRGC])\}/g; let mm; let any = false;
          while ((mm = re.exec(part))) { counts[mm[1]] = (counts[mm[1]] || 0) + 1; any = true; }
          return any ? counts : null;
        }).filter(Boolean);
        if (opts.length) produce = opts;
      }
      if (!produce && def._produced && def._produced.length) {
        produce = def._produced.map(c => ({ [c]: 1 }));
      }
    }
    if (!produce) return Object.keys(out).length ? out : null;
    // cijena aktivacije "{1}, {T}: Add"
    const costM = /\{(\d+)\},\s*\{T\}:\s*Add/.exec(o);
    const mana = { cost: { tap: true }, produce };
    if (costM) mana.cost.mana = '{' + costM[1] + '}';
    out.mana = mana;
    out.producesColors = (def._produced || []).filter(c => COLORS.includes(c));
    if (!out.producesColors.length) {
      const set = new Set();
      for (const p of produce) { if (p.ANY) COLORS.forEach(c => set.add(c)); else Object.keys(p).forEach(c => { if (COLORS.includes(c)) set.add(c); }); }
      out.producesColors = [...set];
    }
    return out;
  }

  // ---------- generic spell templates ----------
  function autoSpell(def) {
    const isIS = def.types.includes('Instant') || def.types.includes('Sorcery');
    if (!isIS) return null;
    const o = (def.oracle || '').replace(/\([^)]*\)/g, '');
    const first = o.split('\n')[0];
    const g = () => null;
    let m;
    const permFilter = (kinds) => (g2, c) => c.zone === 'battlefield' && kinds.some(k => k === 'permanent' ? true : k === 'nonland' ? !c.is('Land') : c.is(k));
    const mk = (targets, resolve, note) => ({ targets, resolve, autoScripted: note || true });

    // Counter target spell
    if (/^Counter target spell/i.test(first)) {
      return mk([{ zone: 'stack', what: 'spell', filter: (g2, so) => so.kind === 'spell', prompt: 'Counter spell', aiHint: { goal: 'counter' } }],
        async ctx => {
          const so = ctx.targets[0], gg = ctx.g;
          if (so && gg.stack.includes(so) && !MTG.isUncounterable(gg, so)) {
            gg.stack.splice(gg.stack.indexOf(so), 1);
            if (!so.isCopy) await gg.move(so.card, 'graveyard');
            gg.lg(`${so.name} COUNTEROVAN!`, 'counter');
            gg.note('stack', {});
          }
        });
    }
    // Destroy/Exile target X
    m = /^(Destroy|Exile) target (creature or planeswalker|artifact or enchantment|nonland permanent|permanent|creature|artifact|enchantment|planeswalker|land)/i.exec(first);
    if (m) {
      const act = m[1].toLowerCase(), what = m[2].toLowerCase();
      const kinds = what === 'nonland permanent' ? ['nonland'] : what === 'permanent' ? ['permanent'] :
        what === 'creature or planeswalker' ? ['Creature', 'Planeswalker'] :
          what === 'artifact or enchantment' ? ['Artifact', 'Enchantment'] : [what.charAt(0).toUpperCase() + what.slice(1)];
      return mk([{ what: 'permanent', filter: permFilter(kinds), prompt: (act === 'destroy' ? 'Uništi' : 'Egzilaj'), aiHint: { goal: 'removal' } }],
        async ctx => {
          if (act === 'destroy') await ctx.g.destroy(ctx.targets[0]);
          else await ctx.g.exileCard(ctx.targets[0]);
          await afterRiders(ctx, o);
        });
    }
    // Destroy all creatures / damage each creature
    if (/^Destroy all creatures/i.test(first)) {
      return mk(null, async ctx => {
        for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.destroy(c, { noRegen: /can't be regenerated/i.test(o) });
      });
    }
    m = /deals? (\d+|X) damage to each creature/i.exec(first);
    if (m) {
      return mk(null, async ctx => {
        const n = m[1] === 'X' ? (ctx.x || 0) : parseInt(m[1], 10);
        for (const c of ctx.g.bf().filter(c => c.is('Creature')).slice()) await ctx.g.damageCreature(ctx.src, c, n);
      });
    }
    // damage to any target / creature / player
    m = /deals? (\d+|X) damage to (any target|target creature or planeswalker|target creature|target player or planeswalker|target opponent|target player|each opponent)/i.exec(first);
    if (m) {
      const nRaw = m[1], what = m[2].toLowerCase();
      if (what === 'each opponent') {
        return mk(null, async ctx => {
          const n = nRaw === 'X' ? (ctx.x || 0) : parseInt(nRaw, 10);
          await ctx.g.damageOpponents(ctx.src, ctx.you, n);
        });
      }
      const spec = what.includes('creature') && !what.includes('any')
        ? { what: 'creature', filter: (g2, c) => c.zone === 'battlefield' && (c.is('Creature') || c.is('Planeswalker')), prompt: 'Damage to:', aiHint: { goal: 'damage' } }
        : what.includes('player') || what.includes('opponent')
          ? { what: what.includes('opponent') ? 'opponent' : 'player', prompt: 'Damage to player:', aiHint: { goal: 'drain' } }
          : { what: 'any', prompt: 'Damage to:', aiHint: { goal: 'damage' } };
      return mk([spec], async ctx => {
        const n = nRaw === 'X' ? (ctx.x || 0) : parseInt(nRaw, 10);
        await ctx.g.damageAny(ctx.src, ctx.targets[0], n);
        await afterRiders(ctx, o);
      });
    }
    // Draw cards
    m = /^(?:You )?[Dd]raw (a|an|one|two|three|four|X) cards?/.exec(first);
    if (m) {
      return mk(null, async ctx => {
        const n = m[1] === 'X' ? (ctx.x || 0) : numWord(m[1]);
        await ctx.g.draw(ctx.you, n);
        const dm = /then discards? (a|two|three) cards?/i.exec(o);
        if (dm) {
          const dn = Math.min(numWord(dm[1]), ctx.you.hand.length);
          if (dn) {
            const pick = await ctx.you.controller.decide(ctx.g, { type: 'chooseCards', from: ctx.you.hand, min: dn, max: dn, prompt: `Odbaci ${dn}`, aiHint: { kind: 'cleanupDiscard' } });
            await ctx.g.discard(ctx.you, pick);
          }
        }
      });
    }
    // Ramp: search basic land(s)
    m = /^Search your library for (up to two |a |up to three )?basic land/i.exec(first);
    if (m) {
      const n = /two/.test(m[1] || '') ? 2 : /three/.test(m[1] || '') ? 3 : 1;
      const toHand = /put (it|that card|them) into your hand/i.test(first) || /reveal.*put.*hand/i.test(first);
      const bfTapped = /onto the battlefield tapped/i.test(first);
      return mk(null, async ctx => {
        if (/put one onto the battlefield tapped and the other into your hand/i.test(first)) {
          await MTG.E.searchBasic(ctx.g, ctx.you, { tapped: true });
          await MTG.E.searchBasic(ctx.g, ctx.you, { toHand: true });
        } else {
          await MTG.E.searchBasic(ctx.g, ctx.you, { n, tapped: bfTapped, toHand });
        }
      });
    }
    // Pump: Target creature gets +X/+Y
    m = /^Target creature gets ([+-]\d+)\/([+-]\d+) until end of turn/i.exec(first);
    if (m) {
      const dp = parseInt(m[1], 10), dt = parseInt(m[2], 10);
      const kws = [];
      if (/gains? trample/i.test(o)) kws.push('trample');
      if (/gains? flying/i.test(o)) kws.push('flying');
      if (/gains? first strike/i.test(o)) kws.push('first strike');
      return mk([{ what: 'creature', filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature'), prompt: 'Meta', aiHint: { goal: dp >= 0 ? 'buff' : 'removal' } }],
        async ctx => { MTG.E.pumpUntilEOT(ctx.g, ctx.targets[0], dp, dt, kws); await ctx.g.checkSBA(); });
    }
    // Creatures you control get +X/+Y
    m = /^Creatures you control get ([+-]\d+)\/([+-]\d+) until end of turn/i.exec(first);
    if (m) {
      const dp = parseInt(m[1], 10), dt = parseInt(m[2], 10);
      const kws = /gain trample/i.test(o) ? ['trample'] : [];
      return mk(null, async ctx => { MTG.E.pumpAllUntilEOT(ctx.g, (g2, c) => c.ctrl === ctx.you, dp, dt, kws); });
    }
    // Create tokens
    m = /^Create (a|an|one|two|three|four|X)?\s*(?:tapped )?(\d+)\/(\d+) ([a-z ]+?) ((?:[A-Z][a-zA-Z']* ?)+) (?:artifact )?creature tokens?( with ([a-z ,]+))?/.exec(first);
    if (m) {
      const nRaw = m[1] || 'a', p = m[2], t = m[3], colorsTxt = m[4], typesTxt = m[5], kwsTxt = m[7] || '';
      const colorMap = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
      const cols = Object.keys(colorMap).filter(cw => colorsTxt.includes(cw)).map(cw => colorMap[cw]);
      const kws = ['flying', 'trample', 'deathtouch', 'lifelink', 'haste', 'vigilance', 'menace', 'first strike'].filter(k => kwsTxt.includes(k));
      const subtypes = typesTxt.trim().split(/\s+/);
      return mk(null, async ctx => {
        const n = nRaw === 'X' ? (ctx.x || 0) : numWord(nRaw);
        const tokDef = {
          name: subtypes.join(' '), cost: null, types: ['Creature'], subtypes, super: [],
          power: p, toughness: t, oracle: '', kws, isTokenDef: true, colorsOverride: cols,
        };
        if (n > 0) await ctx.g.makeTokens(tokDef, ctx.you, { n });
      });
    }
    // Return target creature card from your graveyard to the battlefield / to your hand
    m = /^Return target (creature|permanent) card from your graveyard to (the battlefield|your hand)/i.exec(first);
    if (m) {
      const toBf = m[2] === 'the battlefield';
      return mk([{ zone: 'graveyard', what: 'card', filter: (g2, c) => m[1] === 'creature' ? c.is('Creature') : true, prompt: 'Vrati', aiHint: { goal: 'reanimate' } }],
        async ctx => {
          const t = ctx.targets[0];
          if (t.zone !== 'graveyard') return;
          if (toBf) await MTG.E.reanimate(ctx.g, ctx.you, t);
          else { ctx.g.remove(t); t.zone = 'hand'; ctx.you.hand.push(t); ctx.g.lg(`${t.name} u ruku.`); }
        });
    }
    // Bounce
    m = /^Return target (creature|nonland permanent|permanent) to its owner's hand/i.exec(first);
    if (m) {
      const kinds = m[1] === 'creature' ? ['Creature'] : ['nonland'];
      return mk([{ what: 'permanent', filter: permFilter(kinds), prompt: 'Vrati u ruku', aiHint: { goal: 'bounce' } }],
        async ctx => { if (ctx.targets[0].zone === 'battlefield') await ctx.g.move(ctx.targets[0], 'hand'); });
    }
    // Gain life
    m = /^You gain (\d+|X) life/i.exec(first);
    if (m) {
      return mk(null, async ctx => { await ctx.g.gainLife(ctx.you, m[1] === 'X' ? (ctx.x || 0) : parseInt(m[1], 10)); });
    }
    // Each opponent loses N life (+ you gain)
    m = /^Each opponent loses (\d+|X) life/i.exec(first);
    if (m) {
      return mk(null, async ctx => {
        const n = m[1] === 'X' ? (ctx.x || 0) : parseInt(m[1], 10);
        const tot = await ctx.g.loseLifeOpponents(ctx.src, ctx.you, n);
        if (/you gain (that much|life equal)/i.test(o)) await ctx.g.gainLife(ctx.you, tot);
      });
    }
    // Scry cantrips
    m = /^Scry (\d)/i.exec(first);
    if (m) {
      return mk(null, async ctx => {
        await MTG.E.scry(ctx.g, ctx.you, parseInt(m[1], 10));
        const dm = /draw (a|two|three) cards?/i.exec(o);
        if (dm) await ctx.g.draw(ctx.you, numWord(dm[1]));
      });
    }
    // Target player draws N cards
    m = /^Target player draws (two|three|X) cards/i.exec(first);
    if (m) {
      return mk([{ what: 'player', prompt: 'Ko vuče?', aiHint: { goal: 'drawSelf' } }],
        async ctx => {
          await ctx.g.draw(ctx.targets[0], m[1] === 'X' ? (ctx.x || 0) : numWord(m[1]));
          const lm = /loses (\d) life/i.exec(o);
          if (lm) await ctx.g.loseLife(ctx.targets[0], parseInt(lm[1], 10));
        });
    }
    return null;
  }

  async function afterRiders(ctx, o) {
    let m = /You gain (\d+) life/i.exec(o);
    if (m) await ctx.g.gainLife(ctx.you, parseInt(m[1], 10));
    m = /You lose (\d+) life/i.exec(o);
    if (m) await ctx.g.loseLife(ctx.you, parseInt(m[1], 10));
    m = /[Dd]raw a card/.exec(o.split('\n').slice(1).join('\n')) || (/\. Draw a card/.exec(o));
    if (m) await ctx.g.draw(ctx.you, 1);
  }

  MTG.autoScript = function (def) {
    // vraća dodatke na def (ili {} ako ništa nije prepoznato)
    const out = {};
    const manaBits = autoMana(def);
    if (manaBits) Object.assign(out, manaBits);
    const spell = autoSpell(def);
    if (spell) {
      if (spell.targets) out.targets = spell.targets;
      out.resolve = spell.resolve;
      out.autoScripted = true;
    }
    // Equip cost za neskriptovane Equipmente
    if (def.subtypes.includes('Equipment')) {
      const em = /Equip \{(\d+)\}/.exec(def.oracle || '');
      if (em) { out.equip = '{' + em[1] + '}'; out.attachGrant = out.attachGrant || genericEquipGrant(def); }
    }
    // ako je Aura: enchant creature default
    if (def.subtypes.includes('Aura') && /Enchant creature/i.test(def.oracle || '')) {
      out.auraTarget = [{ what: 'creature', filter: (g2, c) => c.zone === 'battlefield' && c.is('Creature'), prompt: 'Enchantaj', aiHint: { goal: 'buff' } }];
      out.attachGrant = genericAuraGrant(def);
    }
    // označi je li kartu potrebno ručno rješavati
    const isIS = def.types.includes('Instant') || def.types.includes('Sorcery');
    if (isIS && !out.resolve) out.needsManual = true;
    if (!isIS && !def.types.includes('Land')) {
      const o = (def.oracle || '');
      const hasComplexity = /When|Whenever|At the beginning|\{T\}:|\{[\dWUBRGXC]+[^}]*\}:|Sacrifice/i.test(o) && !out.mana;
      if (hasComplexity) out.partialManual = true;
    }
    return out;
  };

  function genericEquipGrant(def) {
    const m = /Equipped creature gets ([+-]\d+)\/([+-]\d+)/.exec(def.oracle || '');
    const kws = ['flying', 'trample', 'deathtouch', 'lifelink', 'haste', 'vigilance', 'menace', 'first strike', 'double strike', 'hexproof'].filter(k => new RegExp('has [^.]*' + k, 'i').test(def.oracle || ''));
    return (g, self, host) => {
      if (m) { host.cur.power += parseInt(m[1], 10); host.cur.toughness += parseInt(m[2], 10); }
      for (const k of kws) host.cur.kw.add(k);
    };
  }
  function genericAuraGrant(def) {
    const m = /Enchanted creature gets ([+-]\d+)\/([+-]\d+)/.exec(def.oracle || '');
    const kws = ['flying', 'trample', 'deathtouch', 'lifelink', 'haste', 'vigilance', 'menace', 'first strike', 'double strike'].filter(k => new RegExp('has [^.]*' + k, 'i').test(def.oracle || ''));
    return (g, self, host) => {
      if (m) { host.cur.power += parseInt(m[1], 10); host.cur.toughness += parseInt(m[2], 10); }
      for (const k of kws) host.cur.kw.add(k);
    };
  }

  // ---------- decklist text parser (Moxfield export i sl.) ----------
  MTG.parseDeckText = function (text) {
    const lines = text.split(/\r?\n/);
    const cards = [];
    let commander = null;
    let section = 'main';
    for (let raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      const secM = /^(Commander|Commanders|Deck|Mainboard|Main|Sideboard|Considering|Maybeboard|Companion|Tokens?)[:]?\s*$/i.exec(line);
      if (secM) {
        const s = secM[1].toLowerCase();
        section = (s === 'commander' || s === 'commanders') ? 'commander'
          : (s === 'sideboard' || s === 'maybeboard' || s === 'considering' || s === 'tokens' || s === 'token') ? 'skip' : 'main';
        continue;
      }
      if (section === 'skip') continue;
      // "1 Sol Ring (C21) 263 *F*" / "1x Sol Ring" / "Sol Ring"
      const m = /^(\d+)x?\s+(.+)$/.exec(line);
      let n = 1, name = line;
      if (m) { n = parseInt(m[1], 10); name = m[2]; }
      // skini foil/tag/set/kolektorske sufikse (redoslijed bitan)
      name = name.replace(/\s*\*[A-Za-z]+\*\s*$/, '');
      name = name.replace(/\s*#\S+\s*$/, '');
      name = name.replace(/\s*\([A-Za-z0-9]{2,6}\)\s*[\w★-]*\s*$/, '');
      name = name.replace(/\s*\([A-Za-z0-9]{2,6}\)\s*$/, '');
      name = name.trim();
      if (!name) continue;
      if (section === 'commander' && !commander) { commander = name; }
      cards.push({ n, name });
    }
    return { cards, commander };
  };
})();
