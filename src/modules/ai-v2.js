// ===== ai-v2.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Commander AI Engine V2. Ovaj modul namjerno nema import, fetch, model ili
// storage zavisnost: sva procjena se izvodi iz javnog pogleda na partiju i iz
// legalnih akcija koje je proizveo postojeći rules engine.
(function () {
  const U = MTG;
  const PRIVATE_VIEWS = new WeakMap();
  const EVAL_CACHE = new Map();
  const ROLE_CACHE = new WeakMap();
  const PROFILE_CACHE = new Map();
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  const CARD_ROLES = [
    'land', 'ramp', 'mana-rock', 'card-draw', 'card-selection',
    'single-target-removal', 'artifact-removal', 'enchantment-removal',
    'graveyard-hate', 'counterspell', 'protection', 'combat-trick',
    'board-wipe', 'creature', 'token-maker', 'anthem', 'engine',
    'sacrifice-outlet', 'death-payoff', 'graveyard-enabler', 'recursion',
    'reanimation', 'tutor', 'finisher', 'combo-piece', 'commander-support',
    'stax', 'lifegain', 'direct-damage',
  ];
  const SYNERGY_TAGS = [
    'tokens', 'artifacts', 'enchantments', 'spellslinger', 'graveyard',
    'sacrifice', 'death-triggers', 'counters', 'equipment', 'auras', 'lands',
    'tribal', 'lifegain', 'voltron', 'reanimator',
  ];
  MTG.AI_CARD_ROLES = CARD_ROLES.slice();
  MTG.AI_SYNERGY_TAGS = SYNERGY_TAGS.slice();

  const SEARCH_CONFIG = {
    easy: { beamWidth: 4, maxDepth: 1, maxNodes: 200, targetLimit: 4, tieTolerance: 2.0 },
    normal: { beamWidth: 10, maxDepth: 3, maxNodes: 2500, targetLimit: 8, tieTolerance: 0.55 },
    hard: { beamWidth: 18, maxDepth: 4, maxNodes: 10000, targetLimit: 14, tieTolerance: 0.18 },
  };
  MTG.AI_SEARCH_CONFIG = SEARCH_CONFIG;

  // Jedino mjesto za neuobičajene semantičke dopune. Card skripte i dalje
  // opisuju pravila; ovi podaci služe samo evaluaciji.
  const CARD_ROLE_OVERRIDES = {
    'Blood Artist': { addRoles: ['engine', 'death-payoff', 'combo-piece'], addTags: ['sacrifice', 'death-triggers'] },
    'Viscera Seer': { addRoles: ['sacrifice-outlet', 'card-selection', 'combo-piece'], addTags: ['sacrifice', 'graveyard'] },
    'Ashnod\'s Altar': { addRoles: ['sacrifice-outlet', 'ramp', 'combo-piece'], addTags: ['artifacts', 'sacrifice'] },
    'Darksteel Reactor': { addRoles: ['engine', 'finisher', 'combo-piece'], addTags: ['artifacts', 'counters'] },
    'Bello, Bard of the Brambles': { addRoles: ['engine', 'commander-support', 'finisher'], addTags: ['artifacts', 'enchantments'] },
    'Hazel of the Rootbloom': { addRoles: ['engine', 'commander-support', 'ramp'], addTags: ['tokens', 'sacrifice'] },
    'Stella Lee, Wild Card': { addRoles: ['engine', 'combo-piece', 'commander-support'], addTags: ['spellslinger'] },
    'Felothar the Steadfast': { addRoles: ['engine', 'commander-support'], addTags: ['counters', 'tribal'] },
    'Y\'shtola, Night\'s Blessed': { addRoles: ['engine', 'commander-support', 'death-payoff'], addTags: ['spellslinger', 'lifegain'] },
  };
  MTG.AI_CARD_ROLE_OVERRIDES = CARD_ROLE_OVERRIDES;

  const DECK_PROFILE_HINTS = {
    'Abzan Armor': { archetype: 'Toughness midrange', length: 'long', tags: ['counters', 'tribal'], commanderImportance: 1.35 },
    'Animated Army': { archetype: 'Artifact/enchantment animation', length: 'medium', tags: ['artifacts', 'enchantments'], commanderImportance: 1.55 },
    'Avengers Assemble': { archetype: 'Hero counters go-wide', length: 'medium', tags: ['tribal', 'counters', 'tokens'], commanderImportance: 1.25 },
    'Blight Curse': { archetype: 'Wither and -1/-1 counters', length: 'medium', tags: ['counters', 'death-triggers'], commanderImportance: 1.25 },
    'Counter Intelligence': { archetype: 'Charge-counter artifacts', length: 'long', tags: ['artifacts', 'counters'], commanderImportance: 1.35 },
    'Deep Clue Sea': { archetype: 'Clue value and card draw', length: 'long', tags: ['artifacts', 'tokens'], commanderImportance: 1.35 },
    'Doom Prevails': { archetype: 'Villain connive control', length: 'long', tags: ['tribal', 'graveyard'], commanderImportance: 1.35 },
    'Elven Council': { archetype: 'Elf voting value', length: 'long', tags: ['tribal', 'tokens'], commanderImportance: 1.15 },
    'Endless Punishment': { archetype: 'Group slug attrition', length: 'medium', tags: ['death-triggers', 'lifegain'], commanderImportance: 1.45 },
    'Family Matters': { archetype: 'Offspring flying tokens', length: 'medium', tags: ['tokens', 'tribal'], commanderImportance: 1.45 },
    'Mardu Surge': { archetype: 'Go-wide token aggro', length: 'short', tags: ['tokens', 'death-triggers'], commanderImportance: 1.25 },
    'Most Wanted': { archetype: 'Outlaw Treasure tempo', length: 'medium', tags: ['tribal', 'artifacts', 'tokens'], commanderImportance: 1.15 },
    'Prismari Artistry': { archetype: 'Spell-copy spellslinger', length: 'medium', tags: ['spellslinger'], commanderImportance: 1.25 },
    'Quick Draw': { archetype: 'Spellslinger combo', length: 'medium', tags: ['spellslinger'], commanderImportance: 1.65 },
    'Squirreled Away': { archetype: 'Token sacrifice engine', length: 'medium', tags: ['tokens', 'sacrifice', 'death-triggers'], commanderImportance: 1.5 },
    'The Fantastic Four': { archetype: 'Noncreature value engine', length: 'long', tags: ['artifacts', 'enchantments', 'spellslinger'], commanderImportance: 1.2 },
    'Turtle Power': { archetype: 'Five-color counters and tokens', length: 'medium', tags: ['counters', 'tokens', 'tribal'], commanderImportance: 1.25 },
    'Wakanda Forever': { archetype: 'Artifact monarch midrange', length: 'long', tags: ['artifacts', 'equipment'], commanderImportance: 1.3 },
    'Scions & Spellcraft': { archetype: 'Esper spellslinger drain', length: 'long', tags: ['spellslinger', 'lifegain'], commanderImportance: 1.45 },
    'Coven Counters': { archetype: 'Coven +1/+1 counters', length: 'medium', tags: ['counters', 'tokens'], commanderImportance: 1.25 },
  };
  MTG.AI_DECK_PROFILE_HINTS = DECK_PROFILE_HINTS;

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
  const round = n => Math.round((Number(n) || 0) * 100) / 100;
  const textOf = def => String(def && def.oracle || '').toLowerCase();
  const addIf = (set, yes, value) => { if (yes) set.add(value); };
  const hasAny = (text, patterns) => patterns.some(pattern => pattern.test(text));

  function inferCardSemantics(def) {
    if (!def) return { roles: [], synergyTags: [] };
    if (ROLE_CACHE.has(def)) return ROLE_CACHE.get(def);
    const roles = new Set();
    const tags = new Set();
    const oracle = textOf(def);
    const types = def.types || [];
    const subtypes = def.subtypes || [];
    const is = type => types.includes(type);
    const mv = U.mv ? U.mv(def.cost || '') : 0;

    addIf(roles, is('Land'), 'land');
    addIf(roles, is('Creature'), 'creature');
    addIf(roles, !is('Land') && (def.mana || /add \{[wubrgc]/.test(oracle)), 'mana-rock');
    addIf(roles, /search your library for (?:a|up to .*?) (?:basic )?land|put .* land card .* battlefield|add \{[wubrgc]/.test(oracle), 'ramp');
    addIf(roles, /draw (?:a|one|two|three|four|x|that many|cards)|draws? an additional/.test(oracle), 'card-draw');
    addIf(roles, /scry|surveil|look at the top|reveal the top|connive/.test(oracle), 'card-selection');
    addIf(roles, /destroy target|exile target|return target .* to (?:its owner'?s|their) hand|deals? .* damage to target/.test(oracle), 'single-target-removal');
    addIf(roles, /destroy target artifact|exile target artifact/.test(oracle), 'artifact-removal');
    addIf(roles, /destroy target enchantment|exile target enchantment/.test(oracle), 'enchantment-removal');
    addIf(roles, /exile .* graveyard|cards? in graveyards? can'?t|player'?s graveyard/.test(oracle), 'graveyard-hate');
    addIf(roles, /counter target spell|counter target activated|counter target triggered/.test(oracle), 'counterspell');
    addIf(roles, /hexproof|indestructible|protection from|regenerate|phase out|prevent .* damage/.test(oracle), 'protection');
    addIf(roles, is('Instant') && /gets? [+-]\d|double strike|first strike|deathtouch|trample|lifelink/.test(oracle), 'combat-trick');
    addIf(roles, /destroy all|exile all|each creature gets -|damage to each creature|all creatures/.test(oracle), 'board-wipe');
    addIf(roles, /create .* token|populate|offspring/.test(oracle), 'token-maker');
    addIf(roles, /creatures you control get|other .* you control get|tokens you control get/.test(oracle), 'anthem');
    addIf(roles, /whenever|at the beginning|the first time|once each turn/.test(oracle), 'engine');
    addIf(roles, /sacrifice (?:a|another) .*:|sacrifice another .*\./.test(oracle) || (def.abilities || []).some(a => a.cost && (a.cost.sacCreature || a.cost.sac)), 'sacrifice-outlet');
    addIf(roles, /whenever .* dies|whenever you sacrifice|creature card is put into .* graveyard/.test(oracle), 'death-payoff');
    addIf(roles, /mill|discard .* card|surveil/.test(oracle), 'graveyard-enabler');
    addIf(roles, /return .* from your graveyard|from a graveyard to your hand/.test(oracle), 'recursion');
    addIf(roles, /from (?:your|a) graveyard (?:onto|to) the battlefield|put target creature card .* battlefield/.test(oracle), 'reanimation');
    addIf(roles, /search your library/.test(oracle) && !/basic land/.test(oracle), 'tutor');
    addIf(roles, /you win the game|target player loses the game|each opponent loses|double strike/.test(oracle) || (is('Creature') && mv >= 7), 'finisher');
    addIf(roles, /copy target|untap .* permanent|whenever you cast or copy|charge counter/.test(oracle), 'combo-piece');
    addIf(roles, /your commander|commander you control|commander spell/.test(oracle), 'commander-support');
    addIf(roles, /can'?t cast|can'?t attack|can'?t activate|doesn'?t untap|spells cost .* more/.test(oracle), 'stax');
    addIf(roles, /gain .* life|lifelink/.test(oracle), 'lifegain');
    addIf(roles, /deals? .* damage to (?:any target|target|each opponent|each player)/.test(oracle), 'direct-damage');

    addIf(tags, roles.has('token-maker') || /token/.test(oracle), 'tokens');
    addIf(tags, is('Artifact') || /artifact/.test(oracle), 'artifacts');
    addIf(tags, is('Enchantment') || /enchantment/.test(oracle), 'enchantments');
    addIf(tags, /instant or sorcery|noncreature spell|cast or copy|magecraft/.test(oracle), 'spellslinger');
    addIf(tags, roles.has('graveyard-enabler') || roles.has('recursion') || /graveyard/.test(oracle), 'graveyard');
    addIf(tags, roles.has('sacrifice-outlet') || /sacrifice/.test(oracle), 'sacrifice');
    addIf(tags, roles.has('death-payoff') || /dies/.test(oracle), 'death-triggers');
    addIf(tags, /counter|proliferate|adapt|evolve/.test(oracle), 'counters');
    addIf(tags, subtypes.includes('Equipment') || /equip/.test(oracle), 'equipment');
    addIf(tags, subtypes.includes('Aura') || /aura/.test(oracle), 'auras');
    addIf(tags, is('Land') || /landfall|land card|lands you control/.test(oracle), 'lands');
    addIf(tags, /choose a creature type|creatures? you control of the chosen type|elf|squirrel|outlaw|hero|villain|turtle/.test(oracle), 'tribal');
    addIf(tags, roles.has('lifegain') || /life you gained/.test(oracle), 'lifegain');
    addIf(tags, roles.has('commander-support') || tags.has('equipment') || tags.has('auras'), 'voltron');
    addIf(tags, roles.has('reanimation'), 'reanimator');

    const override = CARD_ROLE_OVERRIDES[def.name];
    if (override) {
      for (const role of override.addRoles || []) roles.add(role);
      for (const tag of override.addTags || []) tags.add(tag);
      for (const role of override.removeRoles || []) roles.delete(role);
      for (const tag of override.removeTags || []) tags.delete(tag);
    }
    const result = Object.freeze({
      roles: Object.freeze([...roles].filter(role => CARD_ROLES.includes(role))),
      synergyTags: Object.freeze([...tags].filter(tag => SYNERGY_TAGS.includes(tag))),
    });
    ROLE_CACHE.set(def, result);
    return result;
  }
  MTG.inferCardSemantics = inferCardSemantics;

  function deckEntries(deck) {
    return (deck && deck.cards || []).flatMap(entry => Array.from({ length: entry.n || 1 }, () => U.DEFS && U.DEFS[entry.name])).filter(Boolean);
  }

  function buildDeckProfile(deckId, deck) {
    const cached = PROFILE_CACHE.get(deckId);
    if (cached) return cached;
    const hint = DECK_PROFILE_HINTS[deckId] || {};
    const defs = deckEntries(deck);
    const roleCounts = Object.fromEntries(CARD_ROLES.map(role => [role, 0]));
    const tagCounts = Object.fromEntries(SYNERGY_TAGS.map(tag => [tag, 0]));
    let totalMv = 0, nonlands = 0;
    for (const def of defs) {
      const sem = inferCardSemantics(def);
      for (const role of sem.roles) roleCounts[role]++;
      for (const tag of sem.synergyTags) tagCounts[tag]++;
      if (!sem.roles.includes('land')) { nonlands++; totalMv += U.mv(def.cost || ''); }
    }
    for (const tag of hint.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 12;
    const avgMv = nonlands ? totalMv / nonlands : 0;
    const rankedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const scoreDef = def => {
      const sem = inferCardSemantics(def);
      return (sem.roles.includes('engine') ? 8 : 0) + (sem.roles.includes('combo-piece') ? 6 : 0) +
        (sem.roles.includes('finisher') ? 5 : 0) + U.mv(def.cost || '') * 0.25 + (def.name === deck.commander ? 10 : 0);
    };
    const uniqueNonlands = [...new Map(defs.filter(def => !inferCardSemantics(def).roles.includes('land')).map(def => [def.name, def])).values()];
    const importantEngines = uniqueNonlands.filter(def => inferCardSemantics(def).roles.includes('engine'))
      .sort((a, b) => scoreDef(b) - scoreDef(a) || a.name.localeCompare(b.name)).slice(0, 8).map(def => def.name);
    const finishers = uniqueNonlands.filter(def => inferCardSemantics(def).roles.includes('finisher'))
      .sort((a, b) => scoreDef(b) - scoreDef(a) || a.name.localeCompare(b.name)).slice(0, 6).map(def => def.name);
    const interactionDensity = (roleCounts['single-target-removal'] + roleCounts.counterspell + roleCounts['board-wipe']) / Math.max(1, defs.length);
    const primarySynergies = rankedTags.filter(([, n]) => n > 0).slice(0, 4).map(([tag]) => tag);
    const profile = Object.freeze({
      deckId,
      archetype: hint.archetype || (U.DECK_META && U.DECK_META[deckId] && U.DECK_META[deckId].style) || 'Commander midrange',
      preferredGameLength: hint.length || (avgMv > 3.45 ? 'long' : avgMv < 2.75 ? 'short' : 'medium'),
      weights: Object.freeze({
        lifeSafety: round(1 + roleCounts.lifegain / 45),
        boardPresence: round(1 + (roleCounts.creature + roleCounts['token-maker']) / 90),
        cardAdvantage: round(1 + (roleCounts['card-draw'] + roleCounts['card-selection'] * 0.4) / 35),
        manaDevelopment: round(1 + (roleCounts.ramp + roleCounts['mana-rock']) / 40),
        interaction: round(1 + interactionDensity * 2.5),
        commanderProgress: round(hint.commanderImportance || 1.2),
        synergyProgress: round(1.05 + rankedTags[0][1] / 70),
        graveyardValue: round(0.8 + (tagCounts.graveyard + tagCounts.reanimator) / 55),
        comboProgress: round(0.75 + roleCounts['combo-piece'] / 28),
        recoveryPotential: round(0.9 + (roleCounts.recursion + roleCounts.reanimation + roleCounts['card-draw']) / 45),
      }),
      primarySynergies: Object.freeze(primarySynergies),
      importantEngines: Object.freeze(importantEngines),
      finishers: Object.freeze(finishers.length ? finishers : uniqueNonlands.sort((a, b) => scoreDef(b) - scoreDef(a)).slice(0, 4).map(def => def.name)),
      protectedPieces: Object.freeze([...new Set([deck.commander, ...importantEngines.slice(0, 4)])]),
      commanderImportance: round(hint.commanderImportance || 1.2),
      roleCounts: Object.freeze(roleCounts),
      synergyCounts: Object.freeze(tagCounts),
      interactionDensity: round(interactionDensity),
      averageManaValue: round(avgMv),
    });
    PROFILE_CACHE.set(deckId, profile);
    return profile;
  }

  MTG.buildDeckAIProfiles = function () {
    const profiles = {};
    for (const [deckId, deck] of Object.entries(U.DECKS || {})) profiles[deckId] = buildDeckProfile(deckId, deck);
    MTG.DECK_AI_PROFILES = Object.freeze(profiles);
    return MTG.DECK_AI_PROFILES;
  };
  MTG.getDeckAIProfile = function (deckId) {
    return (MTG.DECK_AI_PROFILES && MTG.DECK_AI_PROFILES[deckId]) ||
      (U.DECKS && U.DECKS[deckId] ? buildDeckProfile(deckId, U.DECKS[deckId]) : null);
  };

  function resolvePlayer(game, id) {
    if (!game) return null;
    if (id && typeof id === 'object' && game.players.includes(id)) return id;
    return game.players.find(player => player.idx === id || player.name === id) || null;
  }

  function publicCard(card, viewer, forceKnown) {
    if (!card) return null;
    // Vlasnik ne zna automatski identitet karte egzilirane licem nadolje.
    // Manifest/cloak je izuzetak: kontrolor smije pogledati vlastitu skrivenu
    // kartu, a `revealedTo` pokriva Klaw/Extract Power dozvole.
    const ownerKnows = card.owner === viewer && (!card.faceDown || card.meta && card.meta.faceDownDef);
    const revealedTo = card.meta && card.meta.revealedTo;
    const known = !!forceKnown || ownerKnows || !card.faceDown || card.zone === 'graveyard' || card.zone === 'command' ||
      revealedTo === 'all' || Array.isArray(revealedTo) && revealedTo.includes(viewer.idx);
    const def = known ? card.def : null;
    const sem = def ? inferCardSemantics(def) : { roles: [], synergyTags: [] };
    const kw = card.cur && card.cur.kw ? [...card.cur.kw] : (def && def.kws || []);
    return Object.freeze({
      id: card.iid,
      name: known ? card.name : 'Face-down card',
      known,
      zone: card.zone,
      controllerId: card.ctrl && card.ctrl.idx,
      ownerId: card.owner && card.owner.idx,
      tapped: !!card.tapped,
      summoningSick: !!card.sick,
      faceDown: !!card.faceDown,
      commander: !!card.commander,
      manaValue: known ? card.mv : null,
      power: card.zone === 'battlefield' && card.cur ? card.power : null,
      toughness: card.zone === 'battlefield' && card.cur ? card.toughness : null,
      damage: card.zone === 'battlefield' ? card.damage || 0 : 0,
      counters: card.zone === 'battlefield' ? Object.freeze(Object.assign({}, card.counters || {})) : Object.freeze({}),
      keywords: Object.freeze(known ? kw.slice().sort() : []),
      roles: sem.roles,
      synergyTags: sem.synergyTags,
      attachedTo: card.attachedTo || null,
      protected: !!(card.cur && (card.cur.hexproof || card.cur.shroud || kw.includes('indestructible') || kw.includes('hexproof') || kw.includes('shroud'))),
    });
  }

  function publicStackItem(item, viewer, index) {
    const card = item && (item.card || item.srcCard);
    return Object.freeze({
      index,
      kind: item && item.kind || 'effect',
      name: card ? card.name : item && item.name || 'Stack object',
      controllerId: item && item.ctrl ? item.ctrl.idx : null,
      card: card ? publicCard(card, viewer, true) : null,
      targetIds: Object.freeze((item && item.targets || []).flat().filter(Boolean).map(target =>
        target.iid !== undefined ? `c:${target.iid}` : target.idx !== undefined ? `p:${target.idx}` : 'unknown')),
    });
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    return Object.freeze(value);
  }

  MTG.createBotPlayerView = function (gameState, botPlayerId, actionWindow) {
    const player = resolvePlayer(gameState, botPlayerId);
    if (!player) throw new Error(`AI V2: nepoznat bot player ${botPlayerId}`);
    const players = gameState.players.map(other => {
      const mine = other === player;
      const row = {
        id: other.idx,
        name: other.name,
        life: other.life,
        lost: !!other.lost,
        handCount: other.hand.length,
        libraryCount: other.library.length,
        graveyard: other.graveyard.map(card => publicCard(card, player, true)),
        exile: other.exile.map(card => publicCard(card, player, !card.faceDown)),
        commandZone: other.command.map(card => publicCard(card, player, true)),
        commanderDamage: Object.freeze(Object.assign({}, other.commanderDamage || {})),
        manaPool: mine ? Object.freeze(Object.assign({}, other.pool || {})) : undefined,
        openMana: gameState.manaSources ? gameState.manaSources(other, null).length : gameState.lands(other).filter(card => !card.tapped).length,
        deckId: other.deckName || other.deck && other.deck.name || null,
        colors: Object.freeze((other.colorIdentity || []).slice()),
      };
      // Sadržaj ruke postoji isključivo za posmatrača. Protivnički row nema
      // ni prazni placeholder koji bi kasnije mogao biti slučajno popunjen.
      if (mine) row.hand = other.hand.map(card => publicCard(card, player, true));
      return deepFreeze(row);
    });
    const battlefield = gameState.bf().map(card => publicCard(card, player, card.ctrl === player || !card.faceDown));
    const view = {
      perspectivePlayerId: player.idx,
      turnNumber: gameState.turnNo,
      activePlayerId: gameState.turnPlayer && gameState.turnPlayer.idx,
      phase: gameState.phase,
      step: gameState.step || '',
      priorityPlayerId: gameState.priorityState && gameState.priorityState.holder ? gameState.priorityState.holder.idx : null,
      gameOver: !!gameState.gameOver,
      winnerId: gameState.winner ? gameState.winner.idx : null,
      players,
      battlefield,
      stack: gameState.stack.map((item, index) => publicStackItem(item, player, index)),
      monarchId: gameState.monarch ? gameState.monarch.idx : null,
      publicActions: gameState.log.slice(-60).map(entry => Object.freeze({ turn: entry.t, message: String(entry.msg), kind: entry.cls || '' })),
      actionWindow: actionWindow ? Object.freeze({ type: actionWindow.type, prompt: actionWindow.prompt || '', phase: actionWindow.phase || gameState.phase }) : null,
    };
    deepFreeze(view);
    PRIVATE_VIEWS.set(view, { game: gameState, player, actionWindow: actionWindow || null });
    return view;
  };

  function getPlayerRow(view, id) { return view.players.find(player => player.id === id); }
  function controlledPermanents(view, id) { return view.battlefield.filter(card => card.controllerId === id); }

  function permanentValue(card, profile) {
    if (!card || !card.known) return card && card.faceDown ? 2.1 : 0;
    let value = Math.max(0, card.power || 0) * 0.8 + Math.max(0, card.toughness || 0) * 0.28 + (card.manaValue || 0) * 0.2;
    if (card.roles.includes('engine')) value += 4.3;
    if (card.roles.includes('card-draw')) value += 2.5;
    if (card.roles.includes('ramp') || card.roles.includes('mana-rock')) value += 1.5;
    if (card.roles.includes('sacrifice-outlet')) value += 3.8;
    if (card.roles.includes('combo-piece')) value += 4.5;
    if (card.roles.includes('finisher')) value += 4;
    if (card.commander) value += 2.5 * (profile && profile.commanderImportance || 1);
    if (card.protected) value *= 1.18;
    if (card.keywords.includes('ward')) value *= 1.08;
    if (card.keywords.includes('double strike')) value += Math.max(1, card.power || 0) * 0.7;
    if (card.keywords.includes('flying') || card.keywords.includes('trample') || card.keywords.includes('menace')) value += 0.8;
    if (card.tapped) value *= 0.94;
    if (card.summoningSick && card.roles.includes('creature')) value *= 0.9;
    const synergyHits = profile ? card.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length : 0;
    value += synergyHits * 1.3;
    value += Object.values(card.counters || {}).reduce((sum, n) => sum + Math.max(0, n) * 0.25, 0);
    return value;
  }

  MTG.assessPlayerThreat = function (view, observerId, targetPlayerId) {
    const observer = getPlayerRow(view, observerId);
    const target = getPlayerRow(view, targetPlayerId);
    if (!target || target.lost) return { totalScore: -1000, immediateLethal: 0, commanderLethal: 0, boardPower: 0, engineProgress: 0, interactionRisk: 0, recovery: 0 };
    const profile = MTG.getDeckAIProfile(target.deckId);
    const board = controlledPermanents(view, targetPlayerId);
    const creatures = board.filter(card => card.roles.includes('creature'));
    const boardPower = creatures.reduce((sum, card) => sum + Math.max(0, card.power || 0) * (card.keywords.includes('double strike') ? 1.75 : 1), 0);
    const evasivePower = creatures.filter(card => hasAny(card.keywords.join(' '), [/flying/, /trample/, /menace/, /unblockable/]))
      .reduce((sum, card) => sum + Math.max(0, card.power || 0), 0);
    const engineProgress = board.reduce((sum, card) => sum +
      (card.roles.includes('engine') ? 4 : 0) + (card.roles.includes('combo-piece') ? 5 : 0) + (card.roles.includes('tutor') ? 1 : 0), 0);
    let commanderLethal = 0;
    if (observer) {
      for (const [commanderId, damage] of Object.entries(observer.commanderDamage || {})) {
        const commander = view.battlefield.concat(target.commandZone).find(card => String(card.id) === String(commanderId));
        if (commander && commander.ownerId === targetPlayerId) commanderLethal = Math.max(commanderLethal, Number(damage) || 0);
      }
    }
    const immediateLethal = observer && (boardPower >= observer.life || commanderLethal >= 18) ? 1 : 0;
    const interactionRisk = clamp(target.openMana * 0.8 + target.handCount * 0.35 + (profile && profile.interactionDensity || 0) * 10, 0, 20);
    const recent = view.publicActions.slice(-18).filter(entry => entry.message.includes(target.name));
    const momentum = recent.reduce((score, entry) => score + (/vuče|draw|igra land|Treasure|mana/i.test(entry.message) ? 0.8 : 0), 0);
    const recovery = clamp((profile && profile.weights.recoveryPotential || 1) * target.handCount + target.commandZone.length * 1.5, 0, 18);
    const lifeBuffer = target.life * 0.08;
    const totalScore = round(immediateLethal * 55 + Math.max(0, commanderLethal - 10) * 1.8 + boardPower * 0.9 + evasivePower * 0.35 +
      engineProgress + interactionRisk + recovery * 0.45 + momentum + lifeBuffer);
    return { totalScore, immediateLethal, commanderLethal: round(commanderLethal), boardPower: round(boardPower), engineProgress: round(engineProgress), interactionRisk: round(interactionRisk), recovery: round(recovery) };
  };

  function interactionInHand(row) {
    return (row.hand || []).filter(card => card.roles.some(role => ['single-target-removal', 'counterspell', 'board-wipe', 'protection'].includes(role))).length;
  }

  MTG.evaluateState = function (view, perspectivePlayerId, deckProfile) {
    const perspective = getPlayerRow(view, perspectivePlayerId);
    if (!perspective) throw new Error(`AI V2 evaluator: nepoznat player ${perspectivePlayerId}`);
    const profile = deckProfile || MTG.getDeckAIProfile(perspective.deckId) || { weights: {}, primarySynergies: [], importantEngines: [], finishers: [], commanderImportance: 1 };
    const cacheKey = `${stateHash(view)}|p${perspectivePlayerId}|${profile.deckId || ''}`;
    if (EVAL_CACHE.has(cacheKey)) return EVAL_CACHE.get(cacheKey);
    const board = controlledPermanents(view, perspectivePlayerId);
    const boardValue = board.reduce((sum, card) => sum + permanentValue(card, profile), 0);
    const lifeSafety = clamp(perspective.life / 40 * 25, -20, 35);
    const maxCommanderDamage = Math.max(0, ...Object.values(perspective.commanderDamage || {}).map(Number));
    const commanderDamageSafety = clamp((21 - maxCommanderDamage) * 1.2, -40, 25);
    const cardAdvantage = perspective.handCount * 3.2 + perspective.graveyard.filter(card => card.roles.includes('recursion')).length * 1.3;
    const manaDevelopment = controlledPermanents(view, perspectivePlayerId).filter(card => card.roles.includes('land') || card.roles.includes('mana-rock') || card.roles.includes('ramp')).length * 2 + perspective.openMana * 0.4;
    const availableInteraction = interactionInHand(perspective) * 4 + perspective.openMana * 0.25;
    const commanderInPlay = board.filter(card => card.commander).length;
    const commanderProgress = commanderInPlay * 7 + perspective.commandZone.length * 0.8;
    const synergyProgress = board.reduce((sum, card) => sum + card.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length, 0) * 2.2;
    const comboProgress = board.filter(card => card.roles.includes('combo-piece')).length * 5 + board.filter(card => profile.importantEngines.includes(card.name)).length * 2;
    const graveyardValue = perspective.graveyard.reduce((sum, card) => sum + (card.roles.includes('recursion') || card.roles.includes('reanimation') ? 2.2 : card.synergyTags.includes('graveyard') ? 0.5 : 0), 0);
    const recoveryPotential = perspective.handCount * 1.2 + perspective.graveyard.filter(card => card.roles.includes('recursion') || card.roles.includes('reanimation')).length * 2 + perspective.commandZone.length * 1.5;
    const opponents = view.players.filter(player => player.id !== perspectivePlayerId && !player.lost);
    const threatFromPlayers = {};
    const vulnerabilityToPlayers = {};
    for (const opponent of view.players) {
      if (opponent.id === perspectivePlayerId) {
        threatFromPlayers[opponent.id] = 0;
        vulnerabilityToPlayers[opponent.id] = 0;
        continue;
      }
      const threat = MTG.assessPlayerThreat(view, perspectivePlayerId, opponent.id);
      threatFromPlayers[opponent.id] = threat.totalScore;
      vulnerabilityToPlayers[opponent.id] = round(threat.immediateLethal * 60 + Math.max(0, threat.boardPower - board.filter(card => card.roles.includes('creature')).reduce((s, c) => s + Math.max(0, c.toughness || 0), 0)) * 0.7);
    }
    const immediateLossRisk = perspective.lost ? 1000 : clamp(Math.max(0, ...Object.values(vulnerabilityToPlayers)), 0, 100);
    const myAttack = board.filter(card => card.roles.includes('creature')).reduce((sum, card) => sum + Math.max(0, card.power || 0), 0);
    const immediateWinPotential = view.winnerId === perspectivePlayerId ? 1000 : opponents.some(opponent => myAttack >= opponent.life) ? 55 : clamp(comboProgress * 1.4, 0, 50);
    const survival = lifeSafety + commanderDamageSafety - immediateLossRisk;
    const w = Object.assign({ lifeSafety: 1, boardPresence: 1, cardAdvantage: 1, manaDevelopment: 1, interaction: 1, commanderProgress: 1, synergyProgress: 1, graveyardValue: 1, comboProgress: 1, recoveryPotential: 1 }, profile.weights || {});
    let totalScore = survival * w.lifeSafety + boardValue * w.boardPresence + cardAdvantage * w.cardAdvantage +
      manaDevelopment * w.manaDevelopment + availableInteraction * w.interaction + commanderProgress * w.commanderProgress +
      synergyProgress * w.synergyProgress + graveyardValue * w.graveyardValue + comboProgress * w.comboProgress +
      recoveryPotential * w.recoveryPotential + immediateWinPotential * 8 - immediateLossRisk * 8;
    if (view.gameOver) totalScore = view.winnerId === perspectivePlayerId ? 1000000 : perspective.lost ? -1000000 : -500000;
    const result = deepFreeze({
      totalScore: round(totalScore), survival: round(survival), lifeSafety: round(lifeSafety), commanderDamageSafety: round(commanderDamageSafety),
      boardValue: round(boardValue), cardAdvantage: round(cardAdvantage), manaDevelopment: round(manaDevelopment), availableInteraction: round(availableInteraction),
      commanderProgress: round(commanderProgress), synergyProgress: round(synergyProgress), comboProgress: round(comboProgress), graveyardValue: round(graveyardValue), recoveryPotential: round(recoveryPotential),
      immediateWinPotential: round(immediateWinPotential), immediateLossRisk: round(immediateLossRisk), threatFromPlayers, vulnerabilityToPlayers,
    });
    if (EVAL_CACHE.size > 2500) EVAL_CACHE.clear();
    EVAL_CACHE.set(cacheKey, result);
    return result;
  };

  function stateHash(view) {
    const payload = {
      t: view.turnNumber, a: view.activePlayerId, p: view.phase, s: view.step, w: view.winnerId,
      players: view.players.map(player => [player.id, player.life, player.lost, player.handCount, player.libraryCount, player.openMana,
        Object.entries(player.commanderDamage || {}).sort(), player.graveyard.map(card => card.name).sort(), player.commandZone.map(card => [card.id, card.name])]),
      battlefield: view.battlefield.map(card => [card.id, card.name, card.controllerId, card.tapped, card.power, card.toughness, card.damage, Object.entries(card.counters || {}).sort()]).sort((a, b) => a[0] - b[0]),
      stack: view.stack.map(item => [item.kind, item.name, item.controllerId, item.targetIds]),
    };
    const str = JSON.stringify(payload);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  }
  MTG.hashBotPlayerView = stateHash;

  function normalizeDifficulty(value) {
    if (value === 'tough') return 'hard';
    return SEARCH_CONFIG[value] ? value : 'normal';
  }

  function actionLabel(action) {
    if (!action) return 'Nema akcije';
    if (action.kind === 'cast') return `Cast ${action.card.name}${action.alt && action.alt.label ? ` (${action.alt.label})` : ''}`;
    if (action.kind === 'land') return `Play land ${action.card.name}`;
    if (action.kind === 'activate') return `Activate ${action.entry.card.name}${action.entry.label || action.entry.ability && action.entry.ability.label ? ` — ${action.entry.label || action.entry.ability.label}` : ''}`;
    if (action.kind === 'pass') return 'Pass priority';
    if (action.kind === 'done') return 'End action window';
    if (action.kind === 'declareAttackers') return action.assignments.length ? `Attack: ${action.assignments.map(item => `${item.card.name} → ${item.target.name}`).join(', ')}` : 'No attacks';
    if (action.kind === 'declareBlockers') return action.assignments.length ? `Block: ${action.assignments.map(item => `${item.blocker.name} → ${item.attacker.name}`).join(', ')}` : 'No blocks';
    if (action.kind === 'chooseTargets') return `Targets: ${action.picks.map(target => target.name || target.card && target.card.name || 'stack object').join(', ') || 'none'}`;
    if (action.kind === 'chooseCards') return `Cards: ${action.picks.map(card => card.name).join(', ') || 'none'}`;
    if (action.kind === 'chooseOption') return `Choose ${action.option && action.option.label || String(action.value)}`;
    if (action.kind === 'chooseX') return `Choose X=${action.value}`;
    if (action.kind === 'mulligan') return action.value ? 'Mulligan' : 'Keep hand';
    if (action.kind === 'bottomCards') return `Bottom ${action.picks.map(card => card.name).join(', ')}`;
    if (action.kind === 'scry') return `Scry: ${action.value.top.length} top / ${action.value.bottom.length} bottom`;
    if (action.kind === 'orderTriggers') return `Trigger order: ${action.value.map(trigger => trigger.name || 'trigger').join(', ')}`;
    if (action.kind === 'chooseManaSources') return `Pay with ${action.value.map(source => source.card && source.card.name || source.name || 'source').join(', ')}`;
    return action.kind || 'Akcija';
  }

  function actionKey(action) {
    if (!action) return 'none';
    if (action.kind === 'cast') return `cast:${action.card.iid}:${action.from}:${action.alt && (action.alt.name || action.alt.label || action.alt.altCostStr) || ''}`;
    if (action.kind === 'land') return `land:${action.card.iid}`;
    if (action.kind === 'activate') return `activate:${action.entry.card.iid}:${action.entry.idx ?? ''}:${action.entry.equip ? 'equip' : ''}:${action.entry.crew ? 'crew' : ''}:${action.entry.cycling ? 'cycling' : ''}:${action.entry.label || ''}`;
    if (action.kind === 'declareAttackers') return `attack:${action.assignments.map(item => `${item.card.iid}>${item.target.idx ?? item.target.iid}`).sort().join('|')}`;
    if (action.kind === 'declareBlockers') return `block:${action.assignments.map(item => `${item.blocker.iid}>${item.attacker.iid}`).sort().join('|')}`;
    if (action.picks) return `${action.kind}:${action.picks.map(item => item.iid ?? item.idx ?? item.name).join(',')}`;
    if (action.kind === 'scry') return `scry:${action.value.top.map(card => card.iid).join(',')}|${action.value.bottom.map(card => card.iid).join(',')}`;
    if (action.kind === 'orderTriggers') return `triggers:${action.value.map(trigger => `${trigger.src && trigger.src.iid || ''}:${trigger.name || trigger.desc || ''}`).join('|')}`;
    if (action.kind === 'chooseManaSources') return `mana:${action.value.map(source => source.card && source.card.iid || source.iid || source.name || '').join(',')}`;
    if (action.value !== undefined) return `${action.kind}:${Array.isArray(action.value) ? action.value.map(value => value && (value.key ?? value.iid ?? value.name) || String(value)).join(',') : String(action.value)}`;
    return action.kind;
  }
  MTG.botActionKey = actionKey;

  function combinations(items, min, max, limit) {
    const out = [];
    const take = [];
    function walk(index) {
      if (out.length >= limit) return;
      if (take.length >= min && take.length <= max) out.push(take.slice());
      if (take.length === max) return;
      for (let i = index; i < items.length && out.length < limit; i++) {
        take.push(items[i]);
        walk(i + 1);
        take.pop();
      }
    }
    walk(0);
    return out;
  }

  function combinationsWithRepeats(items, min, max, limit) {
    const out = [], take = [];
    function walk(start) {
      if (out.length >= limit) return;
      if (take.length >= min && take.length <= max) out.push(take.slice());
      if (take.length === max) return;
      for (let i = start; i < items.length && out.length < limit; i++) {
        take.push(items[i]);
        walk(i);
        take.pop();
      }
    }
    walk(0);
    return out;
  }

  function playerThreatForGame(game, observer, target) {
    const view = MTG.createBotPlayerView(game, observer.idx);
    return MTG.assessPlayerThreat(view, observer.idx, target.idx).totalScore;
  }

  function opponentChoiceScore(game, player, option, q) {
    const target = option && option.player;
    if (!target || target.lost || target === player) return -100;
    const goal = q && q.aiHint && q.aiHint.goal || 'delegate';
    const threat = playerThreatForGame(game, player, target);
    const board = boardValueFor(game, target);
    if (goal === 'threat' || goal === 'harm') return threat + board * 0.22 + (40 - target.life) * 0.08;
    return -(threat + board * 0.18);
  }
  MTG.scoreBotOpponentChoice = opponentChoiceScore;

  function attackAssignmentScore(game, player, card, target) {
    const defender = target instanceof U.Player ? target : target.ctrl;
    const hit = Math.max(0, game.dmgAmount ? game.dmgAmount(card, 'normal') : card.power || 0) * (card.kw('double strike') ? 2 : 1);
    const blockers = game.creatures(defender).filter(blocker => game.canBlock(blocker, card));
    const lethal = target instanceof U.Player && hit >= target.life ? 90 : 0;
    let commander = 0;
    if (card.commander && target instanceof U.Player) {
      const dealt = Number(target.commanderDamage && target.commanderDamage[card.iid] || 0);
      if (dealt + hit >= 21) commander = 120;
      else commander = hit * 0.65;
    }
    const threat = playerThreatForGame(game, player, defender) * 0.13;
    const tradeRisk = blockers.length ? Math.min(...blockers.map(blocker => Math.max(0, blocker.power || 0))) >= card.toughness ? permanentGameValue(game, card, player) * 0.9 : 1.2 : 0;
    const crackback = game.creatures(defender).filter(creature => !creature.tapped).reduce((sum, creature) => sum + Math.max(0, creature.power || 0), 0) * 0.08;
    return hit * 1.15 + lethal + commander + threat - tradeRisk - crackback;
  }

  function generateAttackPlans(game, player, q, config) {
    const eligible = (q.eligible || []).slice().sort((a, b) => a.iid - b.iid);
    const forced = new Set(q.forced || []);
    const planeswalkers = game.bf().filter(card => card.is('Planeswalker') && card.ctrl !== player);
    let beam = [{ assignments: [], score: 0 }];
    for (const attacker of eligible) {
      const targets = (game.legalAttackTargets ? game.legalAttackTargets(attacker) : q.opponents || [])
        .concat(planeswalkers.filter(card => !game.legalAttackTargets || game.canAttackTarget(attacker, card)))
        .filter((target, index, list) => list.indexOf(target) === index);
      const next = [];
      for (const node of beam) {
        // "Must attack if able" ne zahtijeva nemoguću deklaraciju. Ako ovaj
        // napadač nema nijednu legalnu metu, plan mora ostati validan umjesto
        // da cijeli combat generator ostane bez akcije.
        if (!forced.has(attacker) || !targets.length) next.push({ assignments: node.assignments.slice(), score: node.score });
        for (const target of targets) {
          next.push({
            assignments: node.assignments.concat({ card: attacker, target }),
            score: node.score + attackAssignmentScore(game, player, attacker, target),
          });
        }
      }
      beam = next.sort((a, b) => b.score - a.score || actionKey({ kind: 'declareAttackers', assignments: a.assignments }).localeCompare(actionKey({ kind: 'declareAttackers', assignments: b.assignments })))
        .slice(0, config.beamWidth);
    }
    if (!beam.length) beam = [{ assignments: [], score: 0 }];
    if (!beam.some(plan => plan.assignments.length === 0) && !forced.size) beam.push({ assignments: [], score: 0 });
    return beam.map(plan => ({ kind: 'declareAttackers', assignments: plan.assignments, _combatScore: plan.score }));
  }

  function blockAssignmentScore(game, blocker, attacker, defender) {
    const incoming = Math.max(0, game.dmgAmount ? game.dmgAmount(attacker, 'normal') : attacker.power || 0);
    const blockerHit = Math.max(0, game.dmgAmount ? game.dmgAmount(blocker, 'normal') : blocker.power || 0);
    const savesLethal = incoming >= defender.life ? 90 : 0;
    const killsAttacker = blockerHit >= attacker.toughness || blocker.kw('deathtouch');
    const blockerDies = incoming >= blocker.toughness || attacker.kw('deathtouch');
    const enginePenalty = inferCardSemantics(blocker.def).roles.includes('engine') ? 6 : 0;
    const deathBenefit = inferCardSemantics(blocker.def).roles.includes('death-payoff') ? 2 : 0;
    const commanderShield = attacker.commander ? incoming * 0.8 : 0;
    return savesLethal + incoming * 0.65 + commanderShield + (killsAttacker ? permanentGameValue(game, attacker, defender) * 0.75 : 0) -
      (blockerDies ? permanentGameValue(game, blocker, defender) * 0.7 + enginePenalty : 0) + deathBenefit;
  }

  function generateBlockPlans(game, player, q, config) {
    const potential = (q.potential || []).slice().sort((a, b) => a.iid - b.iid);
    const attackers = (q.attackers || []).slice();
    let beam = [{ assignments: [], score: 0 }];
    for (const blocker of potential) {
      const next = [];
      for (const node of beam) {
        next.push({ assignments: node.assignments.slice(), score: node.score });
        for (const attacker of attackers) {
          if (!game.canBlock(blocker, attacker)) continue;
          next.push({ assignments: node.assignments.concat({ blocker, attacker }), score: node.score + blockAssignmentScore(game, blocker, attacker, player) });
        }
      }
      beam = next.sort((a, b) => b.score - a.score || actionKey({ kind: 'declareBlockers', assignments: a.assignments }).localeCompare(actionKey({ kind: 'declareBlockers', assignments: b.assignments })))
        .slice(0, config.beamWidth);
    }
    beam = beam.filter(plan => attackers.every(attacker => !attacker.kw('menace') || plan.assignments.filter(item => item.attacker === attacker).length !== 1));
    if (!beam.length) beam = [{ assignments: [], score: 0 }];
    return beam.map(plan => ({ kind: 'declareBlockers', assignments: plan.assignments, _combatScore: plan.score }));
  }

  MTG.generateLegalActions = function (playerView, options = {}) {
    const privateData = PRIVATE_VIEWS.get(playerView);
    if (!privateData) throw new Error('AI V2: generateLegalActions zahtijeva createBotPlayerView rezultat.');
    const { game, player } = privateData;
    let q = privateData.actionWindow;
    const difficulty = normalizeDifficulty(options.difficulty);
    const config = SEARCH_CONFIG[difficulty];
    if (!q) {
      if (game.priorityState && game.priorityState.holder === player) {
        q = { type: 'priority', player, casts: game.castableList(player), acts: game.activatableList(player, true), stack: game.stack, phase: game.phase };
      } else if (game.turnPlayer === player && (game.phase === 'main1' || game.phase === 'main2') && !game.stack.length) {
        q = { type: 'main', player, casts: game.castableList(player), acts: game.activatableList(player), lands: game.playableLands(player), phase: game.phase };
      } else q = { type: 'priority', player, casts: [], acts: [], stack: game.stack, phase: game.phase };
    }
    const actions = [];
    if (q.type === 'main' || q.type === 'priority') {
      for (const entry of q.casts || []) actions.push({ kind: 'cast', card: entry.card, alt: entry.alt, from: entry.from });
      for (const entry of q.acts || []) {
        // Ručne mana-aktivacije postoje da čovjek može birati između utility i
        // mana moda istog permanenta. Botu nisu potrebne: payMana već koristi
        // isti izvor automatski kad stvarno nešto plaća. Njihovo rangiranje kao
        // obične utility aktivacije samo je tapovalo land i otkrivalo da nema
        // instant, iako proizvedena mana nije imala legalnu potrošnju.
        if (!entry.manaAbility) actions.push({ kind: 'activate', entry });
      }
      if (q.type === 'main') {
        for (const card of q.lands || []) actions.push({ kind: 'land', card });
        actions.push({ kind: 'done' });
      } else actions.push({ kind: 'pass' });
    } else if (q.type === 'attackers') {
      actions.push(...generateAttackPlans(game, player, q, config));
    } else if (q.type === 'blockers') {
      actions.push(...generateBlockPlans(game, player, q, config));
    } else if (q.type === 'chooseTargets') {
      const ranked = (q.candidates || []).slice().sort((a, b) => targetValue(game, player, b, q) - targetValue(game, player, a, q) || targetStableKey(a).localeCompare(targetStableKey(b))).slice(0, config.targetLimit);
      if (q.aiHint && ['proliferate', 'depthshaker'].includes(q.aiHint.goal)) {
        const strategic = ranked.filter(target => targetValue(game, player, target, q) > 0).slice(0, q.max || ranked.length);
        actions.push({ kind: 'chooseTargets', picks: strategic });
      }
      for (const picks of combinations(ranked, q.min || 0, q.max || 1, Math.max(config.beamWidth * 2, 12))) actions.push({ kind: 'chooseTargets', picks });
    } else if (q.type === 'chooseCards') {
      const ranked = (q.from || []).slice().sort((a, b) => choiceCardValue(game, player, b, q) - choiceCardValue(game, player, a, q) || a.iid - b.iid).slice(0, Math.max(config.targetLimit, q.max || 1));
      if (q.aiHint && q.aiHint.kind === 'genesisWave') {
        const picks = ranked.filter(card => !((card.def.super || []).includes('Legendary') &&
          game.bf().some(existing => existing.ctrl === player && existing.name === card.name)));
        actions.push({ kind: 'chooseCards', picks });
      }
      for (const picks of combinations(ranked, q.min || 0, q.max || 1, Math.max(config.beamWidth * 2, 12))) actions.push({ kind: 'chooseCards', picks });
    } else if (q.type === 'chooseOption') {
      for (const option of q.options || []) actions.push({ kind: 'chooseOption', value: option.key, option });
    } else if (q.type === 'chooseMulti') {
      const min = q.min ?? q.count ?? 1, max = q.max ?? q.count ?? min;
      const pickSets = q.repeats
        ? combinationsWithRepeats(q.options || [], min, max, Math.max(config.beamWidth * 2, 12))
        : combinations(q.options || [], min, max, Math.max(config.beamWidth * 2, 12));
      for (const picks of pickSets) actions.push({ kind: 'chooseMulti', value: picks.map(option => option.key ?? option), options: picks });
    } else if (q.type === 'chooseX') {
      const min = Number(q.min || 0), max = Number(q.max || min);
      const strategic = [...new Set([min, max, Math.min(max, min + 1), Math.min(max, 3), Math.min(max, 5), ...((q.thresholds || []).map(Number))])].filter(value => value >= min && value <= max).sort((a, b) => a - b);
      for (const value of strategic) actions.push({ kind: 'chooseX', value });
    } else if (q.type === 'mulligan') {
      actions.push({ kind: 'mulligan', value: false }, { kind: 'mulligan', value: true });
    } else if (q.type === 'bottomCards') {
      for (const picks of combinations(player.hand, q.n || 0, q.n || 0, Math.max(config.beamWidth * 2, 12))) actions.push({ kind: 'bottomCards', picks });
    } else if (q.type === 'scry') {
      const cards = q.cards || [];
      const keep = cards.filter(card => choiceCardValue(game, player, card, q) >= 2.2);
      actions.push({ kind: 'scry', value: { top: keep, bottom: cards.filter(card => !keep.includes(card)) } });
      actions.push({ kind: 'scry', value: { top: cards.slice(), bottom: [] } });
    } else if (q.type === 'orderTriggers') {
      actions.push({ kind: 'orderTriggers', value: (q.triggers || []).slice().sort((a, b) => triggerValue(b) - triggerValue(a)) });
      actions.push({ kind: 'orderTriggers', value: (q.triggers || []).slice() });
    } else if (q.type === 'chooseManaSources') {
      const need = q.count || q.min || 0;
      for (const value of combinations(q.sources || q.candidates || [], need, need || (q.max || 0), Math.max(config.beamWidth, 8))) actions.push({ kind: 'chooseManaSources', value });
    }
    // Card reveal, threat alert, manual resolve i combat review su isključivo
    // ljudski UX checkpointi. Ako ikad stignu botu, bezbjedno potvrdi.
    if (!actions.length) {
      if (q.type === 'chooseTargets') actions.push({ kind: 'chooseTargets', picks: [] });
      else if (q.type === 'chooseCards') actions.push({ kind: 'chooseCards', picks: [] });
      else if (q.type === 'bottomCards') actions.push({ kind: 'bottomCards', picks: [] });
      else if (q.type === 'chooseMulti') actions.push({ kind: 'chooseMulti', value: [], options: [] });
      else if (q.type === 'chooseManaSources') actions.push({ kind: 'chooseManaSources', value: [] });
      else if (q.type === 'chooseX') actions.push({ kind: 'chooseX', value: Number(q.min || 0) });
      else if (q.type === 'chooseOption') actions.push({ kind: 'chooseOption', value: q.options && q.options[0] ? q.options[0].key : null });
      else if (q.type === 'attackers') actions.push({ kind: 'declareAttackers', assignments: [] });
      else if (q.type === 'blockers') actions.push({ kind: 'declareBlockers', assignments: [] });
      else actions.push({ kind: q.type === 'priority' ? 'pass' : 'done' });
    }
    const seen = new Set();
    return actions.filter(action => { const key = actionKey(action); if (seen.has(key)) return false; seen.add(key); return true; });
  };

  function targetStableKey(target) {
    if (target instanceof U.Player) return `p:${target.idx}`;
    if (target instanceof U.CardInst) return `c:${target.iid}`;
    return `s:${target && target.name || ''}:${target && target.ctrl && target.ctrl.idx}`;
  }

  function permanentGameValue(game, card, perspective) {
    if (!(card instanceof U.CardInst)) return 0;
    const profile = MTG.getDeckAIProfile(card.ctrl && (card.ctrl.deckName || card.ctrl.deck && card.ctrl.deck.name));
    const sem = inferCardSemantics(card.def);
    let value = Math.max(0, card.power || 0) * 0.8 + Math.max(0, card.toughness || 0) * 0.28 + card.mv * 0.2;
    if (sem.roles.includes('engine')) value += 6;
    if (sem.roles.includes('sacrifice-outlet')) value += 6;
    if (sem.roles.includes('death-payoff')) value += 5;
    if (sem.roles.includes('combo-piece')) value += 7;
    if (sem.roles.includes('finisher')) value += 3.5;
    if (sem.roles.includes('card-draw')) value += 2.2;
    if (card.commander) value += 3 * (profile && profile.commanderImportance || 1);
    if (card.cur && (card.cur.hexproof || card.cur.shroud || card.kw('indestructible'))) value *= 1.18;
    if (perspective && card.ctrl === perspective) value *= 1.03;
    return value;
  }

  function counterRemovalValue(card, player, kind, amount = 1) {
    const harmful = new Set(['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty']);
    const goodForController = !harmful.has(kind);
    return (card.ctrl === player ? (goodForController ? -1 : 1) : (goodForController ? 1 : -1)) * amount;
  }

  function blightRecipientValue(game, player, card, amount = 1) {
    const value = permanentGameValue(game, card, player);
    const dies = card.toughness <= amount;
    const oracle = String(card.def.oracle || '').toLowerCase();
    const deathValue = /when(?:ever)? .*dies|when this creature dies|persist|undying/.test(oracle) ? 7 : 0;
    const tokenValue = card.isToken ? 4 : 0;
    const alreadyBlighted = (card.counters['-1/-1'] || 0) > 0 ? 1.5 : 0;
    return -value + deathValue + tokenValue + alreadyBlighted - (dies && !deathValue && !tokenValue ? 18 : 0);
  }

  function targetValue(game, player, target, q) {
    const hint = q.aiHint && q.aiHint.goal || '';
    if (target instanceof U.Player) {
      if (hint === 'proliferate') return target === player ? -100 : 8 + (target.poison || 0) * 2;
      if (hint === 'drawSelf') return target === player ? 100 : -100;
      if (hint === 'marduTokenCount') return game.creatures(target).length * 12 - target.idx * 0.001;
      const threat = playerThreatForGame(game, player, target);
      const lethal = target.life <= 7 ? 12 : 0;
      const friendly = target === player ? (/gain|protect|draw/i.test(hint) ? 20 : -30) : 0;
      if (/gift|benefit/i.test(hint)) return target === player ? 24 : -(threat * 0.45);
      return threat * 0.45 + lethal + friendly;
    }
    if (target instanceof U.CardInst) {
      const value = permanentGameValue(game, target, player);
      const hostile = target.ctrl !== player;
      if (hint === 'blight') return hostile ? -100 : blightRecipientValue(game, player, target, q.aiHint && q.aiHint.n || 1);
      if (hint === 'counterRemoval') {
        return Object.entries(target.counters || {}).reduce((sum, [kind, amount]) =>
          sum + counterRemovalValue(target, player, kind, Math.min(3, amount)), 0) * 5;
      }
      if (hint === 'proliferate') {
        const beneficial = new Set(['+1/+1', 'loyalty', 'charge', 'indestructible', 'shield', 'lore', 'quest', 'acorn', 'soul', 'hour', 'level', 'oil']);
        const harmful = new Set(['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty']);
        const kinds = Object.keys(target.counters).filter(kind => (target.counters[kind] || 0) > 0);
        const good = kinds.some(kind => beneficial.has(kind));
        const bad = kinds.some(kind => harmful.has(kind));
        if (!hostile) return good && !bad ? 8 + value : -20;
        return bad && !good ? 8 + value : -20;
      }
      if (hint === 'chargeCounter') {
        if (hostile || !target.is('Artifact')) return -100;
        if (target.name === 'Darksteel Reactor') return 120 + (target.counters.charge || 0) * 2;
        if (target.def.stationCreatureAt) return 90 - Math.max(0, target.def.stationCreatureAt - (target.counters.charge || 0));
        return 12 + (target.counters.charge || 0);
      }
      if (hint === 'depthshaker') {
        if (hostile || game.phase !== 'main1') return -100;
        if (['Darksteel Reactor', 'Lux Artillery', 'Moxite Refinery'].includes(target.name)) return -50;
        return 5 - value * 0.16 - Object.values(target.counters).reduce((sum, n) => sum + Math.max(0, n), 0);
      }
      // Tapovanje je za Magma Opus obavezna, neprijateljska interakcija. Bez
      // eksplicitnog svrstavanja u hostile ciljeve evaluator je mogao dati
      // viši zbir vlastitim Veyran/Storm-Kiln metama samo zato što su vrednije.
      if (/removal|damage|destroy|exile|bounce|counter|tap/i.test(hint)) return hostile ? value : -value * 1.8;
      if (/buff|pump|protect|copy|recur|return|attach|equip/i.test(hint)) return hostile ? -value : value;
      return hostile ? value * 0.7 : value * 0.5;
    }
    if (target && target.kind) {
      const hostile = target.ctrl && target.ctrl !== player;
      const spell = target.card || target.srcCard;
      return (spell ? cardDefinitionValue(spell.def) : 2) * (hostile ? 1 : -0.5);
    }
    return 0;
  }

  function choiceCardValue(game, player, card, q) {
    if (!(card instanceof U.CardInst)) return 0;
    const hint = q.aiHint && q.aiHint.kind || '';
    const value = cardDefinitionValue(card.def) + (card.commander ? 8 : 0);
    if (hint === 'celestialKeep') {
      return card.ctrl === player ? permanentGameValue(game, card, player) * 1.5 : -permanentGameValue(game, card, player);
    }
    if (hint === 'covenDifferentPowers' || hint === 'bolster') {
      return card.ctrl === player ? permanentGameValue(game, card, player) + (card.counters['+1/+1'] || 0) * 0.8 : -100;
    }
    if (hint === 'moorlandRescuer' || hint === 'wallMourning') return value * 1.25;
    if (hint === 'esixCopy') return permanentGameValue(game, card, player) * 1.6;
    if (hint === 'scionsCopyToken') return permanentGameValue(game, card, player) * 1.7;
    if (hint === 'finaleUntap') {
      if (card.ctrl !== player || !card.tapped) return -20;
      return 5 + (card.def.mana ? 1 : 0) + (card.def.producesColors || []).length * 0.2;
    }
    if (hint === 'bestLand') {
      const colors = player.colorIdentity || [];
      const counts = Object.fromEntries(colors.map(color => [color, 0]));
      for (const land of game.lands(player)) for (const color of land.def.producesColors || []) {
        if (counts[color] !== undefined) counts[color]++;
      }
      return Math.max(0, ...(card.def.producesColors || []).filter(color => counts[color] !== undefined)
        .map(color => 6 - counts[color])) + (card.def.entersTapped ? -0.5 : 0);
    }
    if (hint === 'blight') return blightRecipientValue(game, player, card, q.aiHint && q.aiHint.n || 1);
    if (hint === 'eventidePermanents') {
      return Object.entries(card.counters || {}).reduce((sum, [kind, amount]) =>
        sum + counterRemovalValue(card, player, kind, amount), 0) * 5;
    }
    if (hint === 'counterCost') {
      const bad = (card.counters['-1/-1'] || 0) + (card.counters['-0/-1'] || 0) +
        (card.counters.stun || 0) + (card.counters.finality || 0) + (card.counters.doom || 0);
      return bad * 20 - value;
    }
    if (hint === 'fainCounterCost') {
      const bad = (card.counters['-1/-1'] || 0) + (card.counters['-0/-1'] || 0) +
        (card.counters.stun || 0) + (card.counters.finality || 0) +
        (card.counters.doom || 0) + (card.counters.bounty || 0);
      const good = Math.max(0, Object.values(card.counters || {}).reduce((sum, n) => sum + n, 0) - bad);
      return bad * 25 - good * 2.5 - permanentGameValue(game, card, player) * 0.12;
    }
    if (hint === 'aetherbornSources') {
      return (card.counters['+1/+1'] || 0) * 5 - permanentGameValue(game, card, player) * 0.35;
    }
    if (hint === 'mariHit') return value;
    if (hint === 'myrBattlesphere') return 4 - value * 0.03;
    if (hint === 'stationTap') return Math.max(0, card.power) * 4 - value * 0.1;
    if (hint === 'bottomOrder') return -value;
    if (/discard|sacCost|cleanup|bottom/i.test(hint) || /odbaci|discard|sacrifice|žrtv/i.test(q.prompt || '')) return -value;
    if (card.ctrl && card.ctrl !== player) return value * 1.2;
    return value;
  }

  function cardDefinitionValue(def) {
    const sem = inferCardSemantics(def);
    let value = U.mv(def && def.cost || '') * 0.65 + (sem.roles.includes('creature') ? 1 : 0);
    if (sem.roles.includes('card-draw')) value += 2.3;
    if (sem.roles.includes('single-target-removal')) value += 2.4;
    if (sem.roles.includes('board-wipe')) value += 3.5;
    if (sem.roles.includes('engine')) value += 3.2;
    if (sem.roles.includes('combo-piece')) value += 3.2;
    if (sem.roles.includes('finisher')) value += 3.8;
    if (sem.roles.includes('land')) value = 1.2;
    return value;
  }

  function triggerValue(trigger) {
    const name = String(trigger && (trigger.name || trigger.desc) || '').toLowerCase();
    return (/win|damage|draw|token|counter/.test(name) ? 3 : 0) + (/sacrifice|discard|lose/.test(name) ? -1 : 0);
  }

  function availableManaEstimate(game, player) {
    try { return game.manaSources(player, null).length + Object.values(player.pool || {}).reduce((sum, n) => sum + n, 0); }
    catch (error) { return game.lands(player).filter(card => !card.tapped).length; }
  }

  function estimateInteractionRisk(view, targetId) {
    const row = getPlayerRow(view, targetId);
    if (!row) return 0;
    const profile = MTG.getDeckAIProfile(row.deckId);
    const density = profile && profile.interactionDensity || 0.08;
    const colorFactor = row.colors.includes('U') ? 1.2 : row.colors.some(color => ['W', 'B', 'R'].includes(color)) ? 0.8 : 0.45;
    return clamp(row.openMana * 0.55 + row.handCount * density * 2.2 + colorFactor, 0, 8);
  }
  MTG.estimateBotInteractionRisk = estimateInteractionRisk;

  function boardValueFor(game, player) {
    return game.bf().filter(card => card.ctrl === player).reduce((sum, card) => sum + permanentGameValue(game, card, player), 0);
  }

  function bestRemovalCandidate(game, player, card, alt) {
    let specs;
    try { specs = game.spellTargetSpecs ? game.spellTargetSpecs(card, alt || {}) : (typeof card.def.targets === 'function' ? card.def.targets(game, card, alt || {}) : card.def.targets); }
    catch (error) { return null; }
    if (!specs || !specs.length) return null;
    const candidates = game.legalTargets(specs[0], card, player).filter(target => target instanceof U.CardInst && target.ctrl !== player);
    if (!candidates.length) return null;
    return candidates.map(target => ({ target, score: permanentGameValue(game, target, player) }))
      .sort((a, b) => b.score - a.score || a.target.iid - b.target.iid)[0];
  }

  function publicVoteCount(q, key) {
    const revealed = q && q.aiHint && q.aiHint.revealedVotes || [];
    return revealed.filter(vote => vote.key === key).length;
  }

  function recoveryValue(player, limit) {
    return (player && player.graveyard || []).map(card => cardDefinitionValue(card.def))
      .sort((a, b) => b - a).slice(0, limit).reduce((sum, value) => sum + value, 0);
  }

  function handRefreshValue(player, useKnownCards) {
    if (!player) return 0;
    const count = player.hand.length;
    const quantity = Math.max(0, 7 - count) * 1.35;
    if (!useKnownCards || !count) return quantity;
    const quality = player.hand.reduce((sum, card) => sum + cardDefinitionValue(card.def), 0) / count;
    // Sail dopušta odbijanje wheela, pa dobra puna ruka nikad nije negativna.
    return Math.max(0, quantity + Math.max(0, 2.7 - quality) * Math.min(count, 5) * 0.45);
  }

  function erestorVoteAdjustment(game, voter, optionKey, q) {
    if (!q || !q.aiHint || q.aiHint.secret) return 0;
    const revealed = q.aiHint.revealedVotes || [];
    let score = 0;
    for (const erestor of game.bf().filter(card => card.name === 'Erestor of the Council')) {
      if (!erestor.ctrl || erestor.ctrl === voter) continue;
      const controllerVote = revealed.find(vote => vote.playerId === erestor.ctrl.idx);
      if (!controllerVote) continue;
      // Pokloni sebi Treasure kada se može pratiti Erestorov javni glas, ali
      // uračunaj i scry koji dobija njegov kontrolor ako glasamo drugačije.
      score += controllerVote.key === optionKey ? 2.35 : -0.65;
    }
    return score;
  }

  function tacticalVoteScore(game, voter, option, q) {
    const hint = q && q.aiHint || {};
    const src = hint.src;
    const owner = hint.forWhom || src && src.ctrl;
    const key = String(option && option.key);
    const isOwner = owner === voter;
    const ownerThreat = owner && !isOwner ? clamp(playerThreatForGame(game, voter, owner) / 25, 0.75, 1.45) : 1;
    const ownerUtility = value => isOwner ? value : -value * ownerThreat;
    let score = 0;

    switch (src && src.name) {
      case 'Galadriel, Elven-Queen': {
        const ring = owner && owner.emblems && owner.emblems.find(emblem => emblem.ring);
        const creatures = owner ? game.creatures(owner) : [];
        const dominion = creatures.length ? 4.2 + Math.min(3, ring && ring.level || 0) * 0.75 : 1.2;
        const guidance = owner ? (owner.hand.length <= 3 ? 3.5 : owner.hand.length >= 7 ? 1.8 : 2.7) : 2.7;
        score += ownerUtility(key === 'dominion' ? dominion : guidance);
        break;
      }
      case 'Plea for Power':
        score += ownerUtility(key === 'time' ? 13 : 6.8);
        break;
      case 'Elrond of the White Council': {
        const ownerCreatures = owner ? game.creatures(owner) : [];
        if (key === 'aid') {
          score += ownerUtility(ownerCreatures.length * 1.45 + (ownerCreatures.some(card => card.commander) ? 0.8 : 0));
        } else if (!isOwner) {
          const mine = game.creatures(voter);
          if (mine.length) {
            const cheapestGift = Math.min(...mine.map(card => permanentGameValue(game, card, voter)));
            // Promjena kontrole je i gubitak resursa birača i dobitak vlasnika
            // Elronda. Bez stvorenja Fellowship je zato pravi "prazan" glas.
            score -= cheapestGift * 0.95;
            score -= cheapestGift * 0.65 * ownerThreat;
          }
        }
        break;
      }
      case 'Círdan the Shipwright': {
        const target = game.players.find(player => String(player.idx) === key);
        if (!target) break;
        if (target === voter) {
          score += 3.1; // garantovana karta i zaštita od slučajnog nultog glasa
        } else {
          const threat = clamp(playerThreatForGame(game, voter, target) / 20, 0.65, 1.6);
          score -= 2.4 * threat;
          const bestPermanent = voter.hand.filter(card => card.is('Land') || card.is('Creature') || card.is('Artifact') || card.is('Enchantment') || card.is('Planeswalker'))
            .map(card => cardDefinitionValue(card.def)).sort((a, b) => b - a)[0] || 0;
          // Sa pravom bombom ima smisla riskirati nula glasova i besplatan
          // permanent; inače je samoglas najstabilnija vrijednost.
          score += Math.max(0, bestPermanent - 7.5) * 0.75;
        }
        break;
      }
      case 'Sail into the West': {
        const returnSelf = recoveryValue(voter, 2) * 0.78;
        const embarkSelf = handRefreshValue(voter, true);
        score += key === 'return' ? returnSelf : embarkSelf;
        if (!isOwner && owner) {
          const returnOwner = recoveryValue(owner, 2) * 0.72;
          const embarkOwner = handRefreshValue(owner, false);
          score -= (key === 'return' ? returnOwner : embarkOwner) * 0.72 * ownerThreat;
        }
        break;
      }
      case 'Travel Through Caradhras': {
        const already = publicVoteCount(q, key);
        const passValue = owner ? Math.max(1.4, 4.5 - game.lands(owner).length * 0.28 - already * 0.45) : 3;
        const graveValues = (owner && owner.graveyard || []).map(card => cardDefinitionValue(card.def)).sort((a, b) => b - a);
        const minesValue = graveValues[already] || 0;
        score += ownerUtility(key === 'pass' ? passValue : minesValue);
        break;
      }
      default: {
        const preferred = hint.aiPick && hint.aiPick(voter);
        if (preferred !== undefined) score += key === String(preferred) ? 3 : 0;
        else {
          const label = String(option && option.label || '').toLowerCase();
          if (/draw|vuci|karta|token|counter|mana/.test(label)) score += isOwner ? 1.5 : -1.5;
        }
      }
    }

    score += erestorVoteAdjustment(game, voter, key, q);
    return round(score);
  }
  MTG.scoreBotVoteOption = tacticalVoteScore;
  MTG.pickBotVoteOption = function (game, voter, q) {
    const options = (q && q.options || []).slice();
    if (!options.length) return null;
    return options.map(option => ({ option, score: tacticalVoteScore(game, voter, option, q) }))
      .sort((a, b) => b.score - a.score || String(a.option.key).localeCompare(String(b.option.key)))[0].option.key;
  };

  function quickScoreAction(view, action, profile, q) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const breakdown = { base: 0, timing: 0, threat: 0, synergy: 0, safety: 0, resources: 0, combat: 0, choice: 0 };
    const phase = game.phase;
    if (action.kind === 'land') {
      breakdown.base = 6.5;
      breakdown.resources = Math.max(0, 7 - game.lands(player).length) * 0.35;
      if (action.card.def.entersTapped) breakdown.timing -= phase === 'main1' ? 0.4 : 0.1;
    } else if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      breakdown.base = cardDefinitionValue(card.def) + Math.min(5, spend * 0.35);
      breakdown.synergy = sem.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length * 2;
      if (card.commander) breakdown.synergy += 2.2 * profile.commanderImportance;
      if (cost.lifeCost) {
        const lifePressure = player.life <= 8 ? 3 : player.life <= 15 ? 1.35 : 0.55;
        breakdown.safety -= Number(cost.lifeCost) * lifePressure;
        if (cost.lifeCost >= player.life) breakdown.safety -= 1000;
      }
      if (sem.roles.includes('ramp') && game.turnNo <= 16) breakdown.resources += 3;
      if (sem.roles.includes('card-draw') || sem.roles.includes('card-selection')) breakdown.resources += Math.max(0, 4 - player.hand.length) * 0.7;
      if ((card.is('Instant') || card.kw('flash')) && phase === 'main1' && !sem.roles.includes('card-draw')) breakdown.timing -= 1.8;
      if (sem.roles.includes('counterspell')) {
        const top = game.stack[game.stack.length - 1];
        if (!top || top.ctrl === player) breakdown.timing -= 25;
        else {
          const spell = top.card || top.srcCard;
          const spellValue = spell ? cardDefinitionValue(spell.def) : 3;
          breakdown.threat += spellValue * 1.6 + playerThreatForGame(game, player, top.ctrl) * 0.12;
          if (top.targets && top.targets.flat().some(target => target === player || target.ctrl === player)) breakdown.safety += 12;
        }
      }
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        if (!best || best.score < 3.4) breakdown.timing -= 10;
        else breakdown.threat += best.score * 0.85;
      }
      if (sem.roles.includes('board-wipe')) {
        const mine = boardValueFor(game, player);
        const theirs = game.players.filter(other => other !== player && !other.lost).reduce((sum, other) => sum + boardValueFor(game, other), 0);
        breakdown.threat += (theirs - mine) * 0.36;
        if (mine > theirs * 0.65) breakdown.safety -= 14;
        const evalNow = MTG.evaluateState(view, player.idx, profile);
        if (evalNow.immediateLossRisk > 40) breakdown.safety += 35;
      }
      const openAfter = availableManaEstimate(game, player) - spend;
      const hasInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles.some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (hasInteraction && openAfter <= 0 && phase === 'main1') breakdown.resources -= 2.7;
      const opponentRisk = Math.max(0, ...view.players.filter(row => row.id !== player.idx && !row.lost).map(row => estimateInteractionRisk(view, row.id)));
      if (sem.roles.includes('finisher') || sem.roles.includes('combo-piece')) breakdown.safety -= opponentRisk * 0.22;
      if (q && q.type === 'priority') {
        const top = game.stack[game.stack.length - 1];
        // Poslije vlastite akcije priority ostaje kod istog igrača. Dodatni
        // spell preko vlastitog stack objekta je skoro uvijek sequencing greška
        // i kod ponovljivih aktivacija može praviti beskrajni priority niz.
        if (top && top.ctrl === player) breakdown.timing -= 45;
        if (!top && game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) breakdown.timing -= 35;
      }
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const card = entry.card;
      const ability = entry.ability;
      breakdown.base = ability && ability.aiScore ? clamp(ability.aiScore(game, card, player), -30, 30) : 2.4;
      if (entry.equip) {
        breakdown.synergy += profile.primarySynergies.includes('equipment') || profile.primarySynergies.includes('voltron') ? 3 : 1;
        // Premještanje već prikačene opreme između dva jednako dobra
        // hosta ne smije pojesti cijelu main fazu.
        if (card.attachedTo) breakdown.timing -= 9;
      }
      if (entry.crew) breakdown.combat += phase === 'main1' ? 2.5 : -0.5;
      if (entry.cycling) breakdown.resources += player.hand.length < 4 ? 1.5 : 0.4;
      const sem = inferCardSemantics(card.def);
      breakdown.synergy += sem.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length * 0.7;
      if (ability && ability.targets && ability.targets.some(spec => spec.aiHint && spec.aiHint.goal === 'removal')) {
        const candidates = game.legalTargets(ability.targets[0], card, player).filter(target => target instanceof U.CardInst && target.ctrl !== player);
        const best = Math.max(0, ...candidates.map(target => permanentGameValue(game, target, player)));
        breakdown.threat += best * 0.75;
        if (best < 3) breakdown.timing -= 5;
      }
      if (q && q.type === 'priority') {
        const top = game.stack[game.stack.length - 1];
        if (top && top.ctrl === player) breakdown.timing -= 45;
        if (!top && game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) breakdown.timing -= 35;
      }
    } else if (action.kind === 'pass' || action.kind === 'done') {
      breakdown.base = 0.2;
      const interaction = (player.hand || []).filter(card => inferCardSemantics(card.def).roles.some(role => ['counterspell', 'single-target-removal', 'protection', 'combat-trick'].includes(role)));
      if (interaction.length && availableManaEstimate(game, player) > 0) breakdown.timing += phase === 'main1' ? 2.4 : 1.2;
      if (q && q.type === 'priority' && game.stack.length) {
        const top = game.stack[game.stack.length - 1];
        if (top.ctrl === player) breakdown.timing += 30;
        if (top.ctrl !== player && top.targets && top.targets.flat().some(target => target === player || target.ctrl === player)) breakdown.safety -= 10;
      }
      if (q && q.type === 'priority' && !game.stack.length && game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) breakdown.timing += 25;
    } else if (action.kind === 'declareAttackers' || action.kind === 'declareBlockers') {
      breakdown.combat = action._combatScore || 0;
    } else if (action.kind === 'chooseTargets') {
      breakdown.choice = action.picks.reduce((sum, target) => sum + targetValue(game, player, target, q || {}), 0);
    } else if (action.kind === 'chooseCards' || action.kind === 'bottomCards') {
      breakdown.choice = action.picks.reduce((sum, card) => sum + choiceCardValue(game, player, card, q || {}), 0);
    } else if (action.kind === 'chooseOption') {
      const hintKind = q && q.aiHint && q.aiHint.kind;
      if (hintKind === 'vote') {
        breakdown.choice = tacticalVoteScore(game, player, action.option, q);
      } else if (hintKind === 'chooseOpponent') {
        breakdown.choice = opponentChoiceScore(game, player, action.option, q);
      } else if (hintKind === 'abstractPile') {
        breakdown.choice = Number(action.option && action.option.denyValue || 0);
      } else if (hintKind === 'clashPlace') {
        const value = q.aiHint.card ? cardDefinitionValue(q.aiHint.card.def) : 0;
        breakdown.choice = action.value === 'top' ? value : Math.max(0, 3.2 - value);
      } else if (hintKind === 'ward' && q.aiHint && q.aiHint.payment === 'blight') {
        const amount = q.aiHint.n || 1;
        const best = game.creatures(player).map(card => blightRecipientValue(game, player, card, amount))
          .sort((a, b) => b - a)[0];
        breakdown.choice = action.value === 'yes' ? (Number.isFinite(best) ? best + 6 : -100) : 0;
      } else if (hintKind === 'burningCuriosity') {
        const amount = q.aiHint.n || 1;
        const best = game.creatures(player).map(card => blightRecipientValue(game, player, card, amount))
          .sort((a, b) => b - a)[0];
        breakdown.choice = action.value === 'yes' ? (Number.isFinite(best) ? best + 5.5 : -100) : 0;
      } else if (hintKind === 'attackDestination') {
        const target = action.option && action.option.target;
        if (target instanceof U.Player) {
          const tokenPower = Math.max(1, q.aiHint && q.aiHint.token && q.aiHint.token.power || 1);
          breakdown.choice = (40 - target.life) * 0.35 + playerThreatForGame(game, player, target) * 0.16 +
            (target.life <= tokenPower ? 40 : 0);
        } else if (target instanceof U.CardInst) {
          breakdown.choice = permanentGameValue(game, target, player) + Math.max(0, 6 - (target.counters.loyalty || 0));
        }
      } else if (hintKind === 'myriadCopy') {
        const source = q.aiHint && q.aiHint.src;
        const superTypes = source ? ((source.cur && source.cur.super) || source.def.super || []) : [];
        const legendary = superTypes.includes('Legendary');
        const hasValue = source && ((source.def.triggers || []).some(trigger => trigger.on === 'etb' || trigger.on === 'lto' || trigger.on === 'dies'));
        breakdown.choice = action.value === 'yes' ? (legendary && !hasValue ? -6 : 6) : 0;
      } else if (hintKind === 'temptingOffer') {
        const caster = q.aiHint && q.aiHint.caster;
        const x = Number(q.aiHint && q.aiHint.x || 0);
        const need = player.life <= 12 ? 1.8 : game.creatures(player).length <= 2 ? 1.2 : 0.75;
        const casterThreat = caster ? playerThreatForGame(game, player, caster) : 20;
        breakdown.choice = action.value === 'yes' ? x * need - x * (0.8 + casterThreat / 45) : 0;
      } else if (hintKind === 'gixDraw') {
        breakdown.choice = action.value === 'yes'
          ? (player.library.length ? 4.2 + Math.max(0, 5 - player.hand.length) * 0.6 - (player.life <= 4 ? 8 : 0.5) : -100)
          : 0;
      } else if (hintKind === 'bitterTriumphCost') {
        const cheapest = player.hand.filter(card => card !== q.aiHint.card)
          .map(card => cardDefinitionValue(card.def)).sort((a, b) => a - b)[0];
        if (action.value === 'discard') breakdown.choice = Number.isFinite(cheapest) ? -cheapest : -100;
        else {
          const lifeCost = Number(q.aiHint.life || 3);
          breakdown.choice = -lifeCost * (player.life <= 8 ? 3 : player.life <= 15 ? 1.25 : 0.55);
        }
      } else if (hintKind === 'fabricate') {
        const tokenEngines = game.bf().filter(card => card.ctrl === player &&
          /token|creature.*enter|leaves the battlefield|dies/i.test(card.def.oracle || '')).length;
        breakdown.choice = action.value === 't' ? 5.5 + tokenEngines * 1.4 : 4.1;
      } else if (hintKind === 'willMardu') {
        if (action.value === '0') {
          breakdown.choice = Math.max(0, ...game.players.filter(target => !target.lost)
            .map(target => game.creatures(target).length)) * 2.6;
        } else {
          const damage = game.creatures(player).length;
          breakdown.choice = Math.max(0, ...game.bf().filter(card => card.is('Creature') && card.ctrl !== player)
            .map(card => card.toughness - card.damage <= damage ? permanentGameValue(game, card, player) : 0));
        }
      } else if (hintKind === 'sunTitanReturn') {
        const card = q.aiHint && q.aiHint.card;
        breakdown.choice = action.value === 'yes' && card ? cardDefinitionValue(card.def) + 2 : 0;
      } else if (hintKind === 'glissaMode') {
        if (action.value === '0') breakdown.choice = 4 + Math.max(0, 5 - player.hand.length) * 0.45;
        if (action.value === '1') {
          const best = Math.max(0, ...game.bf().filter(card => card.is('Enchantment'))
            .map(card => card.ctrl === player ? -permanentGameValue(game, card, player) : permanentGameValue(game, card, player)));
          breakdown.choice = best;
        }
        if (action.value === '2') {
          breakdown.choice = Math.max(0, ...game.bf().map(card => Object.entries(card.counters || {})
            .reduce((sum, [kind, amount]) => sum + counterRemovalValue(card, player, kind, Math.min(3, amount)), 0))) * 2.5;
        }
      } else if (hintKind === 'moveCounterKind') {
        const target = q.aiHint && q.aiHint.target;
        breakdown.choice = target ? -counterRemovalValue(target, player, action.value, 1) * 4 : 0;
      } else if (hintKind === 'tokenReplacementOrder') {
        const name = action.option && action.option.source && action.option.source.name || action.option && action.option.label || '';
        breakdown.choice = name === 'Academy Manufactor' ? 30 :
          name === 'Adrix and Nev, Twincasters' ? 20 : name === 'Esix, Fractal Bloom' ? 5 : 10;
      } else if (hintKind === 'innocuousUntap') {
        const useful = game.lands(player).some(card => card.tapped);
        breakdown.choice = action.value === 'yes' ? (useful ? 10 : -8) : (useful ? -2 : 5);
      } else if (hintKind === 'killerService') {
        const cheapest = game.bf().filter(card => card.ctrl === player && card.isToken)
          .map(card => permanentGameValue(game, card, player)).sort((a, b) => a - b)[0];
        breakdown.choice = action.value === 'yes' ? (Number.isFinite(cheapest) ? 8 - cheapest : -100) : 0;
      } else if (hintKind === 'ransom') {
        const threat = game.bf().filter(card => card.ctrl !== player && card.is('Creature'))
          .map(card => permanentGameValue(game, card, player)).sort((a, b) => b - a)[0] || 0;
        if (action.value === 'goad') breakdown.choice = threat >= 5 ? threat + 2 : 1;
        if (action.value === 'cloak') breakdown.choice = player.library.length
          ? 4 + (profile.primarySynergies.includes('tokens') ? 3 : 0) : -100;
        if (action.value === 'draw') breakdown.choice = 4.5 + Math.max(0, 5 - player.hand.length) * 0.8;
      } else if (hintKind === 'creatureType') {
        breakdown.choice = Number(action.option && action.option.keepValue || 0) * 1.4;
      } else if (hintKind === 'citadelSiege') {
        const own = game.creatures(player);
        const hostile = game.bf().filter(card => card.is('Creature') && card.ctrl !== player);
        const counterSynergy = own.filter(card => (card.counters['+1/+1'] || 0) > 0 ||
          /counter|coven/i.test(card.def.oracle || '')).length;
        const tapValue = hostile.reduce((best, card) => Math.max(best, permanentGameValue(game, card, player)), 0);
        breakdown.choice = action.value === 'khans'
          ? (own.length ? 8 + counterSynergy * 3 : -2)
          : (hostile.length ? 2 + tapValue * 0.35 : -3);
      } else if (hintKind === 'eternalWitness') {
        breakdown.choice = action.value === 'yes' ? cardDefinitionValue(q.aiHint.card.def) + 2 : 0;
      } else if (hintKind === 'enduringScalelord') {
        breakdown.choice = action.value === 'yes' ? 5 : 0;
      } else if (hintKind === 'lifecrafterPay') {
        breakdown.choice = action.value === 'yes' ? 4 + Math.max(0, 5 - player.hand.length) * 0.4 : 0;
      } else if (hintKind === 'typhoidMary') {
        if (action.value === 't') breakdown.choice = 2.8 + (availableManaEstimate(game, player) < 5 ? 0.8 : 0);
        if (action.value === 'd') breakdown.choice = 3.5 + Math.max(0, 5 - player.hand.length) * 0.85;
        if (action.value === 'b') breakdown.choice = player.opponents(game).length * 1.7 + 2 + (player.life <= 12 ? 2.5 : 0);
      } else if (hintKind === 'villainousChoice') {
        if (action.value === 'sac') {
          const candidates = q.aiHint.candidates || [];
          const cheapest = Math.min(...candidates.map(card => permanentGameValue(game, card, player)), Infinity);
          breakdown.choice = Number.isFinite(cheapest) ? -cheapest : -100;
        } else {
          breakdown.choice = -(Number(action.option.lifeCost || 2) * (player.life <= 10 ? 2.5 : 1)) -
            Number(action.option.cardsForOpponent || 0) * 2.6;
        }
      } else if (hintKind === 'partnerSearch' || hintKind === 'rampChoice') {
        breakdown.choice = action.value === 'yes' ? 6 : -1;
      } else if (hintKind === 'scionsHeroLife') {
        const card = q.data && q.data.card;
        const x = card ? U.mv(card.def.cost || '') : 0;
        const lifePenalty = x * (player.life <= 10 ? 2.8 : player.life <= 18 ? 1.2 : 0.55);
        breakdown.choice = action.value === 'yes' && x > 0 && player.life > x
          ? 3.2 + x * 1.45 - lifePenalty
          : action.value === 'yes' ? -100 : 0;
      } else if (hintKind === 'fandanielChoice') {
        if (action.value === 'sac') {
          const cheapest = Math.min(...(q.aiHint.candidates || [])
            .map(card => permanentGameValue(game, card, player)), Infinity);
          breakdown.choice = Number.isFinite(cheapest) ? -cheapest : -100;
        } else {
          const loss = Number(q.aiHint.lifeLoss || 0);
          breakdown.choice = -loss * (player.life <= loss + 5 ? 2.8 : player.life <= 15 ? 1.4 : 0.75);
        }
      } else if (hintKind === 'scionsCastCopy') {
        const card = q.aiHint.card;
        const value = card ? cardDefinitionValue(card.def) : 0;
        const mana = Number(q.aiHint.mana || 3);
        breakdown.choice = action.value === 'yes'
          ? (availableManaEstimate(game, player) >= mana ? value + 2.5 - mana * 0.35 : -100)
          : 0;
      } else if (hintKind === 'uriangerExileTop') {
        const card = q.aiHint.card;
        const value = card ? cardDefinitionValue(card.def) : 0;
        breakdown.choice = action.value === 'yes' ? 2.5 + value * 0.3 : 0;
      } else if (hintKind === 'scionsGraveCast') {
        const candidates = player.graveyard.filter(card => card.is('Instant') || card.is('Sorcery'));
        const best = candidates.map(card => cardDefinitionValue(card.def)).sort((a, b) => b - a)[0] || 0;
        const affordable = q.aiHint.free || candidates.some(card => {
          const cost = game.spellCost(player, card, { from: 'graveyard' });
          return game.canPayMana(player, cost, { card });
        });
        breakdown.choice = action.value === 'yes' ? (affordable ? best + 2 : -30) : 0;
      } else if (hintKind === 'scionsWipe') {
        const kind = action.option && action.option.destroyKind;
        const affected = game.bf().filter(card => {
          if (kind === 'dragons') return card.is('Creature') && card.hasSub('Dragon');
          if (kind === 'nondragons') return card.is('Creature') && !card.hasSub('Dragon');
          if (kind === 'creatures') return card.is('Creature');
          if (kind === 'artifactsEnchantments') return !card.is('Land') && (card.is('Artifact') || card.is('Enchantment'));
          return false;
        });
        breakdown.choice = affected.reduce((score, card) => {
          const value = permanentGameValue(game, card, player);
          return score + (card.ctrl === player ? -value * 1.35 : value);
        }, 0);
      } else if (hintKind === 'fameFortune') {
        const bestCreature = game.creatures(player).map(card =>
          permanentGameValue(game, card, player) + Math.max(0, card.power) * (card.tapped ? 0.25 : 0.8))
          .sort((a, b) => b - a)[0] || 0;
        // Birač minimizira korist casteru: Fame je privremena krađa njegovog
        // najboljeg stvorenja, Fortune je karta + Treasure za castera.
        breakdown.choice = action.value === 'fame' ? -bestCreature : -7.5;
      } else if (hintKind === 'grenzoMode') {
        const victim = q.data && q.data.player;
        if (action.value === '0') {
          const best = victim ? game.creatures(victim)
            .map(card => permanentGameValue(game, card, player) + Math.max(0, card.power) * 0.4)
            .sort((a, b) => b - a)[0] : null;
          breakdown.choice = Number.isFinite(best) ? best * 0.62 : -100;
        } else {
          // Vrh protivničke biblioteke je skriven; koristi očekivanu vrijednost,
          // bez zavirivanja u stvarnu kartu.
          breakdown.choice = victim && victim.library.length ? 4.8 : -20;
        }
      } else if (hintKind === 'heliodIntervention') {
        const x = Number(q.aiHint && q.aiHint.x || 0);
        if (action.value === '0') {
          const eligible = game.bf().filter(card => card.is('Artifact') || card.is('Enchantment'));
          const values = eligible.map(card => card.ctrl === player
            ? -permanentGameValue(game, card, player) * 1.5
            : permanentGameValue(game, card, player)).sort((a, b) => b - a);
          breakdown.choice = values.length >= x ? values.slice(0, x).reduce((sum, value) => sum + value, 0) : -100;
        } else {
          const urgency = player.life <= 10 ? 1.8 : player.life <= 20 ? 1.1 : 0.55;
          breakdown.choice = 2 * x * urgency;
        }
      } else if (hintKind === 'elvenFarsight') {
        const card = q.aiHint && q.aiHint.card;
        breakdown.choice = action.value === 'yes' && card && card.is('Creature') ? 4 :
          action.value === 'no' && card && !card.is('Creature') ? 2 : -1;
      } else if (hintKind === 'radagastToken') {
        const needsFlyingBlocker = game.bf().some(card => card.ctrl !== player && card.is('Creature') && card.kw('flying') && !card.tapped);
        breakdown.choice = action.value === 'bird' ? (needsFlyingBlocker ? 5 : 3.4) :
          action.value === 'beast' ? (needsFlyingBlocker ? 3.5 : 4.3) : 0;
      } else if (hintKind === 'tmntAlliance') {
        if (action.value === 'counter') {
          breakdown.choice = 3.2 + game.bf().filter(card => card.ctrl === player &&
            ['High Score', 'Humongous Fungus', 'Casey Jones, Back Alley Brute'].includes(card.name)).length * 1.2;
        } else if (action.value === 'food') {
          breakdown.choice = 2.8 + game.bf().filter(card => card.ctrl === player &&
            ['Ninja Pizza', 'Donatello, the Brains', 'Leonardo, the Balance'].includes(card.name)).length * 1.7;
        } else if (action.value === 'scry') {
          breakdown.choice = player.library.length ? (player.hand.length >= 6 ? 2.3 : 1.7) : -2;
        }
      } else if (hintKind === 'commanderZone') {
        breakdown.choice = action.value === 'cz' ? 40 : -8;
      } else if (hintKind === 'cloudKey') {
        breakdown.choice = action.value === 'Artifact' ? 12 : action.value === 'Creature' ? 3 : 1;
      } else if (hintKind === 'inspiritCounter') {
        const target = q.aiHint && q.aiHint.target;
        const wantsCharge = target && (target.name === 'Darksteel Reactor' || target.def.stationCreatureAt ||
          target.def.winAtCharge || Object.prototype.hasOwnProperty.call(target.counters || {}, 'charge'));
        breakdown.choice = action.value === (wantsCharge ? 'c' : 'p') ? 12 : -3;
      } else if (hintKind === 'counterCostKind') {
        breakdown.choice = ['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty'].includes(action.value) ? 10 : 0;
      } else if (hintKind === 'equipPayment') {
        const card = q.aiHint && q.aiHint.card;
        const counters = card ? Object.values(card.counters).reduce((sum, n) => sum + Math.max(0, n), 0) : 0;
        breakdown.choice = action.value === (counters >= 2 ? 'mana' : 'counter') ? 7 : 0;
      } else if (hintKind === 'aggroAmalgam') {
        const source = q.aiHint && q.aiHint.src;
        if (source && action.value === '0') {
          breakdown.choice = (source.counters['+1/+1'] || 0) * 1.8 + Math.max(0, source.power) * 0.35;
        } else if (source && action.value === '1') {
          const candidates = game.bf().filter(card => card.is('Creature') && card.ctrl !== player);
          const best = candidates.map(card => {
            const kills = card.toughness - card.damage <= source.power;
            const survives = source.toughness - source.damage > card.power;
            return (kills ? permanentGameValue(game, card, player) : 0) + (survives ? 2.5 : -permanentGameValue(game, source, player));
          }).sort((a, b) => b - a)[0];
          breakdown.choice = Number.isFinite(best) ? best : -20;
        }
      } else if (hintKind === 'freeCast') {
        const freeCard = q.aiHint.card;
        if (action.value === 'yes' && freeCard) {
          breakdown.choice = cardDefinitionValue(freeCard.def) + 2;
          const sem = inferCardSemantics(freeCard.def);
          if (sem.roles.includes('board-wipe')) {
            const mine = boardValueFor(game, player);
            const theirs = player.opponents(game).reduce((sum, opponent) => sum + boardValueFor(game, opponent), 0);
            breakdown.choice += (theirs - mine) * 0.4;
            if (mine > theirs) breakdown.safety -= 14;
          }
        } else if (action.value === 'no') breakdown.choice = 0;
      } else {
        const key = String(action.value).toLowerCase();
        if (/yes|da|keep|accept|use/.test(key)) breakdown.choice = q && q.aiHint && q.aiHint.kind === 'ward' ? 1.5 : 1;
        if (/no|ne|decline/.test(key)) breakdown.choice = q && q.aiHint && q.aiHint.kind === 'ward' ? 0 : -0.2;
        const label = String(action.option && action.option.label || '').toLowerCase();
        if (/draw|vuci|token|counter|destroy|exile|mana/.test(label)) breakdown.choice += 2;
        if (/lose|gubi|sacrifice|žrtvuj|discard|odbaci/.test(label)) breakdown.choice -= 1.5;
      }
    } else if (action.kind === 'chooseMulti') {
      if (q && q.aiHint && q.aiHint.kind === 'farewellModes') {
        for (const option of action.options || []) {
          const index = Number(option.key);
          if (index === 3) {
            const own = player.graveyard.reduce((sum, card) => sum + cardDefinitionValue(card.def), 0);
            const enemy = player.opponents(game).reduce((sum, opponent) => sum +
              opponent.graveyard.reduce((s, card) => s + cardDefinitionValue(card.def), 0), 0);
            breakdown.choice += enemy - own * 1.4;
            continue;
          }
          const type = ['Artifact', 'Creature', 'Enchantment'][index];
          if (!type) continue;
          for (const card of game.bf().filter(permanent => permanent.is(type))) {
            const value = permanentGameValue(game, card, player);
            breakdown.choice += card.ctrl === player ? -value * 1.4 : value;
          }
        }
      } else if (q && q.aiHint && q.aiHint.kind === 'blackMarketConnections') {
        const selected = action.options || [];
        const lifeCost = selected.reduce((sum, option) => sum + Number(option.lifeCost || 0), 0);
        for (const option of selected) {
          if (option.benefit === 'treasure') breakdown.resources += 2.8;
          if (option.benefit === 'draw') breakdown.resources += 3.5 + Math.max(0, 5 - player.hand.length) * 0.65;
          if (option.benefit === 'creature') breakdown.choice += 4.2;
        }
        breakdown.safety -= lifeCost * (player.life <= 10 ? 1.4 : 0.55);
        if (lifeCost >= player.life) breakdown.safety -= 1000;
      } else if (q && q.aiHint && q.aiHint.kind === 'rankleModes') {
        const selected = new Set(action.value || []);
        if (selected.has('disc')) {
          const own = player.hand.map(card => cardDefinitionValue(card.def)).sort((a, b) => a - b)[0] || 0;
          const theirs = player.opponents(game).reduce((sum, opponent) => sum +
            (opponent.hand.map(card => cardDefinitionValue(card.def)).sort((a, b) => a - b)[0] || 0), 0);
          breakdown.choice += theirs * 0.58 - own;
        }
        if (selected.has('draw')) {
          const ownNeed = Math.max(0.8, 5.5 - player.hand.length) * 0.9;
          const opponentBenefit = player.opponents(game).length * 1.5;
          breakdown.choice += ownNeed - opponentBenefit - (player.life <= 8 ? 4 : 0.35);
        }
        if (selected.has('sac')) {
          const sacrificeCost = card => {
            const diesValue = (card.def.triggers || []).some(trigger => trigger.on === 'dies');
            return permanentGameValue(game, card, player) * (card.isToken ? 0.35 : diesValue ? 0.5 : 1);
          };
          const own = game.creatures(player).map(sacrificeCost).sort((a, b) => a - b)[0] || 0;
          const theirs = player.opponents(game).reduce((sum, opponent) => sum +
            (game.creatures(opponent).map(sacrificeCost).sort((a, b) => a - b)[0] || 0), 0);
          breakdown.choice += theirs * 0.8 - own;
        }
      } else {
        breakdown.choice = (action.options || []).reduce((sum, option) =>
          sum + (/draw|token|destroy|exile|counter/i.test(option.label || '') ? 2 : 0.3), 0);
      }
    } else if (action.kind === 'chooseX') {
      if (q && q.aiHint && q.aiHint.kind === 'toxicDeluge') {
        const x = Number(action.value) || 0;
        for (const creature of game.bf().filter(card => card.is('Creature') && card.toughness <= x)) {
          const value = permanentGameValue(game, creature, player);
          breakdown.choice += creature.ctrl === player ? -value : value;
        }
        // Deluge je life-for-tempo alat: zdravi bot ne smije odbiti čistu
        // razmjenu samo zato što tri života vrijede približno kao jedan 3/3.
        // Na niskom životu ostaje strogo konzervativan.
        breakdown.safety -= x * (player.life <= 8 ? 1.6 : player.life <= 15 ? 0.45 : 0.22);
        if (x >= player.life) breakdown.safety -= 1000;
      } else if (q && ['eventideCounter', 'glissaCounter'].includes(q.aiHint && q.aiHint.kind)) {
        const amount = Number(action.value) || 0;
        breakdown.choice = q.aiHint.target ? counterRemovalValue(q.aiHint.target, player, q.aiHint.counterKind, amount) * 4 : 0;
      } else if (q && q.aiHint && q.aiHint.kind === 'flourishingDefenses') {
        breakdown.choice = (Number(action.value) || 0) * 3;
      } else if (q && q.aiHint && q.aiHint.kind === 'fireCovenant') {
        const x = Number(action.value) || 0;
        const targets = q.aiHint.targets || [];
        let budget = x;
        const ordered = targets.slice().sort((a, b) => permanentGameValue(game, b, player) - permanentGameValue(game, a, player));
        for (const target of ordered) {
          const lethal = Math.max(1, target.toughness - target.damage);
          if (budget >= lethal) { breakdown.choice += permanentGameValue(game, target, player); budget -= lethal; }
        }
        breakdown.safety -= x * (player.life <= 10 ? 1.8 : player.life <= 18 ? 0.8 : 0.35);
        if (x >= player.life) breakdown.safety -= 1000;
      } else if (q && q.aiHint && q.aiHint.kind === 'fireCovenantDamage') {
        const x = Number(action.value) || 0;
        const target = q.aiHint.target;
        const lethal = target ? Math.max(1, target.toughness - target.damage) : 1;
        breakdown.choice = target && x >= lethal ? permanentGameValue(game, target, player) : -Math.abs(lethal - x) * 2;
      } else if (q && q.aiHint && q.aiHint.kind === 'counterDistribution') {
        const x = Number(action.value) || 0;
        const target = q.aiHint.target;
        const others = game.creatures(player).filter(card => card !== target);
        const before = new Set(others.map(card => Number(card.power) || 0));
        const afterPower = target ? (Number(target.power) || 0) + x : x;
        const preservesDistinctPower = before.has(afterPower) ? -3.5 : 3.5;
        breakdown.choice = x * 0.65 + preservesDistinctPower + (target ? permanentGameValue(game, target, player) * 0.08 : 0);
      } else breakdown.choice = action.value * 0.7;
      const source = q && q.src;
      if (source && /lose.*life|pay.*life/i.test(source.def && source.def.oracle || '')) breakdown.safety -= action.value * 0.5;
    } else if (action.kind === 'mulligan') {
      const lands = player.hand.filter(card => card.is('Land')).length;
      const cheap = player.hand.filter(card => !card.is('Land') && card.mv <= 3).length;
      const keepable = lands >= 2 && lands <= 5 && cheap >= 1;
      breakdown.choice = action.value ? (keepable ? -10 : 8) : (keepable ? 8 : -8);
      if (player.hand.length <= 5 && action.value) breakdown.choice -= 8;
    } else if (action.kind === 'scry') {
      breakdown.choice = action.value.top.reduce((sum, card) => sum + cardDefinitionValue(card.def), 0) - action.value.bottom.reduce((sum, card) => sum + Math.max(0, 2.5 - cardDefinitionValue(card.def)), 0);
    } else if (action.kind === 'orderTriggers') {
      breakdown.choice = action.value.reduce((sum, trigger, index) => sum + triggerValue(trigger) * (index + 1), 0);
    } else if (action.kind === 'chooseManaSources') {
      breakdown.resources = -(action.value || []).reduce((sum, source) => sum + (source.card && inferCardSemantics(source.card.def).roles.includes('engine') ? 2 : 0.2), 0);
    }
    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return { total: round(total), breakdown: Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, round(value)])) };
  }
  MTG.quickScoreBotAction = function (view, action, profile, q) { return quickScoreAction(view, action, profile, q); };

  function cloneGraph(value, seen = new Map(), key = '') {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value === 'function') return value;
    if (key === 'def' || key === 'deck' || key === 'faceDownDef') return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const out = [];
      seen.set(value, out);
      for (const item of value) out.push(cloneGraph(item, seen));
      return out;
    }
    if (value instanceof Map) {
      const out = new Map(); seen.set(value, out);
      for (const [k, v] of value) out.set(cloneGraph(k, seen), cloneGraph(v, seen));
      return out;
    }
    if (value instanceof Set) {
      const out = new Set(); seen.set(value, out);
      for (const item of value) out.add(cloneGraph(item, seen));
      return out;
    }
    const out = Object.create(Object.getPrototypeOf(value));
    seen.set(value, out);
    for (const ownKey of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, ownKey);
      if (!descriptor || !('value' in descriptor)) continue;
      try { out[ownKey] = cloneGraph(descriptor.value, seen, String(ownKey)); } catch (error) { /* noncritical UI/cache field */ }
    }
    return out;
  }

  function fullStateFingerprint(game) {
    return JSON.stringify({
      turnNo: game.turnNo, phase: game.phase, step: game.step,
      players: game.players.map(player => ({ idx: player.idx, life: player.life, lost: player.lost, pool: player.pool,
        hand: player.hand.map(card => [card.iid, card.name, card.zone]), library: player.library.map(card => [card.iid, card.name, card.zone]),
        graveyard: player.graveyard.map(card => [card.iid, card.name, card.zone]), exile: player.exile.map(card => [card.iid, card.name, card.zone]), command: player.command.map(card => [card.iid, card.name, card.zone]) })),
      battlefield: game.battlefield.map(card => [card.iid, card.name, card.zone, card.ctrl && card.ctrl.idx, card.tapped, card.damage, card.sick, card.attacking && (card.attacking.idx ?? card.attacking.iid), card.blocking]),
      stack: game.stack.map(item => [item.kind, item.name, item.card && item.card.iid, item.ctrl && item.ctrl.idx]),
    });
  }

  function cloneGameForSimulation(game, seed) {
    const clone = cloneGraph(game);
    clone._simulation = true;
    clone._nextSimulationIid = -1;
    clone.paced = false;
    clone.speedFactor = 0;
    clone.onEvent = () => {};
    clone.uiHooks = {};
    clone._human = undefined;
    clone.rnd = U.mulberry32((Number(seed) || 1) >>> 0);
    for (const player of clone.players) player.game = clone;
    return clone;
  }
  MTG.cloneGameForAISimulation = cloneGameForSimulation;

  function altIdentity(alt) { return alt && (alt.name || alt.label || alt.altCostStr || (alt.adventure ? 'adventure' : '') || (alt.room && alt.room.name) || '') || ''; }

  function mapActionToClone(action, originalGame, clone) {
    if (!action) return action;
    if (action.kind === 'cast') {
      const card = clone.byIid(action.card.iid);
      const player = card && (card.zone === 'battlefield' ? card.ctrl : card.owner);
      if (!card || !player) return null;
      const entry = clone.castableList(player).find(candidate => candidate.card.iid === card.iid && candidate.from === action.from && altIdentity(candidate.alt) === altIdentity(action.alt));
      return entry ? { kind: 'cast', card: entry.card, alt: entry.alt, from: entry.from, xVal: action.xVal } : null;
    }
    if (action.kind === 'land') {
      const card = clone.byIid(action.card.iid);
      return card ? { kind: 'land', card } : null;
    }
    if (action.kind === 'activate') {
      const card = clone.byIid(action.entry.card.iid);
      if (!card) return null;
      const entry = clone.activatableList(card.ctrl).find(candidate => candidate.card.iid === card.iid &&
        candidate.idx === action.entry.idx && !!candidate.equip === !!action.entry.equip && !!candidate.crew === !!action.entry.crew &&
        !!candidate.cycling === !!action.entry.cycling && !!candidate.handAbility === !!action.entry.handAbility && !!candidate.gyAbility === !!action.entry.gyAbility &&
        !!candidate.turnFaceUp === !!action.entry.turnFaceUp && !!candidate.manaAbility === !!action.entry.manaAbility);
      return entry ? { kind: 'activate', entry } : null;
    }
    if (action.kind === 'declareAttackers') return { kind: action.kind, assignments: action.assignments.map(item => ({ card: clone.byIid(item.card.iid), target: item.target instanceof U.Player ? clone.players.find(player => player.idx === item.target.idx) : clone.byIid(item.target.iid) })).filter(item => item.card && item.target) };
    if (action.kind === 'declareBlockers') return { kind: action.kind, assignments: action.assignments.map(item => ({ blocker: clone.byIid(item.blocker.iid), attacker: clone.byIid(item.attacker.iid) })).filter(item => item.blocker && item.attacker) };
    return Object.assign({}, action);
  }

  function unwrapDecisionAction(action) {
    if (!action) return null;
    if (action.kind === 'declareAttackers' || action.kind === 'declareBlockers') return action.assignments;
    if (action.kind === 'chooseTargets' || action.kind === 'chooseCards' || action.kind === 'bottomCards') return action.picks;
    if (action.kind === 'chooseOption' || action.kind === 'chooseX' || action.kind === 'chooseMulti' || action.kind === 'chooseManaSources') return action.value;
    if (action.kind === 'mulligan') return action.value;
    if (action.kind === 'scry' || action.kind === 'orderTriggers') return action.value;
    return action;
  }
  MTG.unwrapBotDecisionAction = unwrapDecisionAction;

  function immediateSimulationController(player, observerIdx, seed) {
    return {
      async decide(game, q) {
        if (q.type === 'priority' || q.type === 'main') return q.type === 'priority' ? { kind: 'pass' } : { kind: 'done' };
        if (q.type === 'combatReview' || q.type === 'cardReveal' || q.type === 'threatAlert' || q.type === 'manualResolve') return 'ok';
        const view = MTG.createBotPlayerView(game, player.idx, q);
        const profile = MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name);
        const actions = MTG.generateLegalActions(view, { difficulty: 'normal' });
        const ranked = actions.map(action => ({ action, quick: quickScoreAction(view, action, profile, q).total }))
          .sort((a, b) => b.quick - a.quick || actionKey(a.action).localeCompare(actionKey(b.action)));
        return unwrapDecisionAction(ranked[0] && ranked[0].action);
      },
    };
  }

  function utilityVector(view) {
    const vector = {};
    for (const player of view.players) vector[player.id] = MTG.evaluateState(view, player.id, MTG.getDeckAIProfile(player.deckId)).totalScore;
    return vector;
  }
  MTG.evaluateMaxNUtilityVector = utilityVector;

  function applyProjectedCombat(clone, action) {
    // Combat deklaracije se i dalje validiraju centralnim canAttackTarget/
    // canBlock pravilima. Puna rezolucija ostaje u live combatPhase; ovdje se
    // projektuje samo neposredni, deterministički dio radi rangiranja.
    if (action.kind === 'declareAttackers') {
      for (const item of action.assignments) {
        if (!clone.canAttackTarget || !clone.canAttackTarget(item.card, item.target)) continue;
        item.card.attacking = item.target;
        if (!item.card.kw('vigilance')) item.card.tapped = true;
      }
      return true;
    }
    if (action.kind === 'declareBlockers') {
      for (const item of action.assignments) {
        if (!clone.canBlock(item.blocker, item.attacker)) continue;
        item.blocker.blocking = item.attacker.iid;
        item.attacker.blockedBy = item.attacker.blockedBy || [];
        item.attacker.blockedBy.push(item.blocker);
      }
      return true;
    }
    return false;
  }

  MTG.simulateAction = async function (state, action, simulationContext = {}) {
    const before = fullStateFingerprint(state);
    const actor = resolvePlayer(state, simulationContext.playerId ?? simulationContext.botPlayerId ?? (action.card && action.card.ctrl && action.card.ctrl.idx));
    const seed = Number(simulationContext.seed || 1) >>> 0;
    const clone = cloneGameForSimulation(state, seed);
    const cloneActor = actor ? clone.players.find(player => player.idx === actor.idx) : null;
    for (const player of clone.players) player.controller = immediateSimulationController(player, cloneActor && cloneActor.idx, seed + player.idx + 1);
    const mapped = mapActionToClone(action, state, clone);
    let applied = false, error = null, usedRulesEngine = false;
    try {
      if (!mapped) throw new Error('Akcija se ne može mapirati u simulirani snapshot.');
      if (['cast', 'activate', 'land'].includes(mapped.kind)) {
        if (!cloneActor) throw new Error('Nedostaje simulirani actor.');
        usedRulesEngine = true;
        applied = await clone.performAction(cloneActor, mapped) !== false;
        await clone.checkSBA();
        await clone.flushTriggers();
      } else if (mapped.kind === 'declareAttackers' || mapped.kind === 'declareBlockers') {
        applied = applyProjectedCombat(clone, mapped);
      } else applied = true;
    } catch (caught) {
      error = caught;
      applied = false;
    }
    const after = fullStateFingerprint(state);
    if (before !== after) throw new Error('AI simulacija je mutirala live GameState.');
    const view = cloneActor ? MTG.createBotPlayerView(clone, cloneActor.idx) : null;
    return {
      state: clone,
      action: mapped,
      applied,
      error,
      usedRulesEngine,
      utilityVector: view ? utilityVector(view) : {},
      stateHash: view ? stateHash(view) : null,
    };
  };

  function continuationWindow(game, player) {
    if (game.gameOver || player.lost) return null;
    if (game.turnPlayer === player && (game.phase === 'main1' || game.phase === 'main2') && !game.stack.length) {
      return { type: 'main', player, casts: game.castableList(player), acts: game.activatableList(player), lands: game.playableLands(player), phase: game.phase };
    }
    return null;
  }

  function kingmakingPenalty(beforeView, afterView, actorId) {
    const before = utilityVector(beforeView), after = utilityVector(afterView);
    const aliveBefore = beforeView.players.filter(player => !player.lost && player.id !== actorId);
    const aliveAfter = afterView.players.filter(player => !player.lost && player.id !== actorId);
    if (aliveAfter.length >= aliveBefore.length) return 0;
    const leaders = aliveAfter.map(player => after[player.id]).sort((a, b) => b - a);
    if (!leaders.length) return 0;
    const actor = after[actorId];
    const runaway = Math.max(0, leaders[0] - actor - 45);
    return round(runaway * 0.18);
  }

  async function searchActionSequence(game, player, rootCandidate, view, profile, config, seed, stats) {
    const first = await MTG.simulateAction(game, rootCandidate.action, { playerId: player.idx, seed });
    stats.nodes++;
    if (!first.applied) return { score: rootCandidate.quick.total - 25, state: game, rootAction: rootCandidate.action, depth: 0, breakdown: Object.assign({}, rootCandidate.quick.breakdown, { simulation: -25 }), simulationError: first.error && first.error.message };
    let firstView = MTG.createBotPlayerView(first.state, player.idx);
    const baseEval = MTG.evaluateState(view, player.idx, profile).totalScore;
    const firstEval = MTG.evaluateState(firstView, player.idx, profile).totalScore;
    const penalty = kingmakingPenalty(view, firstView, player.idx);
    let beam = [{ state: first.state, view: firstView, score: rootCandidate.quick.total + (firstEval - baseEval) * 0.12 - penalty, rootAction: rootCandidate.action, depth: 1 }];
    let best = beam[0];
    const expansionWidth = Math.min(config.beamWidth, config.maxDepth <= 1 ? 2 : config.beamWidth <= 10 ? 5 : 8);
    for (let depth = 1; depth < config.maxDepth && stats.nodes < config.maxNodes; depth++) {
      const next = [];
      for (const node of beam.slice(0, expansionWidth)) {
        const simPlayer = node.state.players.find(candidate => candidate.idx === player.idx);
        const q = continuationWindow(node.state, simPlayer);
        if (!q) { next.push(node); continue; }
        const nodeView = MTG.createBotPlayerView(node.state, simPlayer.idx, q);
        const actions = MTG.generateLegalActions(nodeView, { difficulty: config === SEARCH_CONFIG.hard ? 'hard' : 'normal' })
          .filter(action => action.kind !== 'done' && action.kind !== 'pass');
        const ranked = actions.map(action => ({ action, quick: quickScoreAction(nodeView, action, profile, q) }))
          .sort((a, b) => b.quick.total - a.quick.total || actionKey(a.action).localeCompare(actionKey(b.action))).slice(0, expansionWidth);
        if (!ranked.length) { next.push(node); continue; }
        for (let i = 0; i < ranked.length && stats.nodes < config.maxNodes; i++) {
          const candidate = ranked[i];
          const sim = await MTG.simulateAction(node.state, candidate.action, { playerId: simPlayer.idx, seed: seed + stats.nodes * 101 + i });
          stats.nodes++;
          if (!sim.applied) continue;
          const simView = MTG.createBotPlayerView(sim.state, simPlayer.idx);
          const evalDelta = MTG.evaluateState(simView, simPlayer.idx, profile).totalScore - MTG.evaluateState(node.view, simPlayer.idx, profile).totalScore;
          const score = node.score + candidate.quick.total * Math.pow(0.7, depth) + evalDelta * 0.1 - kingmakingPenalty(node.view, simView, simPlayer.idx);
          next.push({ state: sim.state, view: simView, score, rootAction: node.rootAction, depth: depth + 1 });
        }
      }
      if (!next.length) break;
      beam = next.sort((a, b) => b.score - a.score || actionKey(a.rootAction).localeCompare(actionKey(b.rootAction))).slice(0, config.beamWidth);
      if (beam[0].score > best.score) best = beam[0];
      stats.depth = Math.max(stats.depth, depth + 1);
      if (beam[0].state.gameOver) break;
    }
    const simulationDelta = round(best.score - rootCandidate.quick.total);
    return {
      score: round(best.score), state: best.state, rootAction: rootCandidate.action, depth: best.depth,
      breakdown: Object.assign({}, rootCandidate.quick.breakdown, { simulation: simulationDelta, kingmaking: -penalty }),
    };
  }

  function reasonFor(action, breakdown, view, playerId) {
    const positives = Object.entries(breakdown).filter(([, value]) => value > 0.5).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => key);
    const labels = { base: 'jaka osnovna vrijednost', timing: 'dobar trenutak', threat: 'smanjuje najveću prijetnju', synergy: 'napreduje plan decka', safety: 'štiti od poraza', resources: 'razvija ili čuva resurse', combat: 'najbolji combat ishod', choice: 'najvrjedniji legalan izbor', simulation: 'bolji simulirani nastavak', kingmaking: 'izbjegava kingmaking' };
    const threats = Object.entries(MTG.evaluateState(view, playerId, MTG.getDeckAIProfile(getPlayerRow(view, playerId).deckId)).threatFromPlayers)
      .filter(([id]) => Number(id) !== playerId).sort((a, b) => b[1] - a[1]);
    const threatText = threats[0] && threats[0][1] > 25 ? ` Najveća javna prijetnja je Player ${threats[0][0]} (${round(threats[0][1])}).` : '';
    return `${actionLabel(action)}: ${positives.map(key => labels[key] || key).join(', ') || 'najbolji legalni fallback'}.${threatText}`;
  }

  function defaultSeed(game, view, playerId) {
    const base = Number(game.opts && game.opts.seed || 42) >>> 0;
    const hash = parseInt(stateHash(view), 36) >>> 0;
    return (base ^ hash ^ Math.imul(playerId + 1, 2654435761)) >>> 0;
  }

  function pickNearTie(ranked, seed, tolerance, easy) {
    if (!ranked.length) return { chosen: null, tieBreak: false };
    const band = ranked.filter(candidate => ranked[0].score - candidate.score <= tolerance);
    if (band.length <= 1) return { chosen: ranked[0], tieBreak: false };
    const rnd = U.mulberry32((Number(seed) || 1) >>> 0);
    const weights = band.map((candidate, index) => Math.max(1, band.length - index + (easy ? 1 : 3)));
    let pick = rnd() * weights.reduce((sum, value) => sum + value, 0);
    for (let i = 0; i < band.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return { chosen: band[i], tieBreak: true };
    }
    return { chosen: band[0], tieBreak: true };
  }

  MTG.chooseBotAction = async function (params) {
    const started = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const game = params.gameState;
    const player = resolvePlayer(game, params.botPlayerId);
    if (!player) throw new Error('AI V2: botPlayerId nije u GameState.');
    const difficulty = normalizeDifficulty(params.difficulty);
    const config = SEARCH_CONFIG[difficulty];
    const q = params.actionWindow || null;
    const view = MTG.createBotPlayerView(game, player.idx, q);
    const profile = MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name) || buildDeckProfile('unknown', player.deck || { cards: [], commander: '' });
    const seed = params.seed === undefined ? defaultSeed(game, view, player.idx) : Number(params.seed) >>> 0;
    const legalActions = MTG.generateLegalActions(view, { difficulty });
    const stats = { nodes: 0, depth: 0 };
    let fallback = false;
    let candidates = legalActions.map(action => ({ action, quick: quickScoreAction(view, action, profile, q) }));
    candidates.sort((a, b) => b.quick.total - a.quick.total || actionKey(a.action).localeCompare(actionKey(b.action)));
    const searchKinds = new Set(['cast', 'activate', 'land']);
    // Aggregate headless partije služe stability gateu i mogu sadržati desetine
    // hiljada odluka. U njima se koristi isti evaluator/ranking, ali bez
    // rekurzivnih snapshotova. Interaktivna igra (`paced`) i izričiti
    // benchmark/test `forceSearch` koriste puni beam.
    const deepSearch = params.forceSearch === true || (params.forceSearch !== false && !!game.paced);
    const deepWidth = deepSearch ? Math.min(config.beamWidth, difficulty === 'easy' ? 3 : difficulty === 'normal' ? 6 : 9) : 0;
    const searched = [];
    for (const candidate of candidates.slice(0, deepWidth)) {
      if (stats.nodes >= config.maxNodes) break;
      if (searchKinds.has(candidate.action.kind)) {
        try { searched.push(await searchActionSequence(game, player, candidate, view, profile, config, seed + searched.length * 997, stats)); }
        catch (error) {
          searched.push({ score: candidate.quick.total - 12, rootAction: candidate.action, depth: 0, breakdown: Object.assign({}, candidate.quick.breakdown, { simulation: -12 }), simulationError: error.message });
        }
      } else searched.push({ score: candidate.quick.total, rootAction: candidate.action, depth: 0, breakdown: candidate.quick.breakdown });
    }
    for (const candidate of candidates.slice(deepWidth)) searched.push({ score: candidate.quick.total, rootAction: candidate.action, depth: 0, breakdown: candidate.quick.breakdown });
    searched.sort((a, b) => b.score - a.score || actionKey(a.rootAction).localeCompare(actionKey(b.rootAction)));
    // Glasovi nisu kozmetički modovi: i mala evaluacijska razlika može značiti
    // ekstra potez ili cijelu vojsku countera za protivnika. Zato se seedovani
    // "malo slabiji potez" ne primjenjuje na vote prozore.
    const tieTolerance = q && q.type === 'chooseOption' && q.aiHint && q.aiHint.kind === 'vote' ? 0 : config.tieTolerance;
    let selection = pickNearTie(searched, seed, tieTolerance, difficulty === 'easy');
    if (!selection.chosen) {
      fallback = true;
      const safe = legalActions.find(action => action.kind === 'pass' || action.kind === 'done') || legalActions[0];
      selection = { chosen: { score: -999, rootAction: safe, depth: 0, breakdown: { fallback: 1 } }, tieBreak: false };
    }
    const chosen = selection.chosen;
    const elapsed = (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - started;
    const threats = {};
    for (const row of view.players) threats[row.id] = MTG.assessPlayerThreat(view, player.idx, row.id).totalScore;
    const consideredActions = searched.slice(0, 5).map(candidate => ({
      action: actionLabel(candidate.rootAction), score: round(candidate.score),
      reason: reasonFor(candidate.rootAction, candidate.breakdown, view, player.idx),
      scoreBreakdown: candidate.breakdown,
    }));
    const decision = {
      action: chosen.rootAction,
      score: round(chosen.score),
      reason: reasonFor(chosen.rootAction, chosen.breakdown, view, player.idx),
      consideredActions,
      log: {
        chosen: actionLabel(chosen.rootAction), alternatives: consideredActions.slice(1), score: round(chosen.score),
        scoreBreakdown: chosen.breakdown, threatScores: threats, analyzedNodes: stats.nodes,
        reachedDepth: Math.max(stats.depth, chosen.depth || 0), tieBreak: selection.tieBreak, seed,
        decisionTimeMs: round(elapsed), fallback, difficulty,
      },
    };
    game.aiDecisionLog = game.aiDecisionLog || [];
    game.aiDecisionLog.push(Object.assign({ turn: game.turnNo, playerId: player.idx, playerName: player.name }, decision.log));
    if (game.aiDecisionLog.length > 160) game.aiDecisionLog.splice(0, game.aiDecisionLog.length - 160);
    game.note('aiDecision', { player, decision: decision.log });
    return decision;
  };

  MTG.aiV2DecisionForController = async function (game, player, q, difficulty) {
    const decision = await MTG.chooseBotAction({
      gameState: game,
      botPlayerId: player.idx,
      difficulty,
      actionWindow: q,
    });
    return unwrapDecisionAction(decision.action);
  };
})();
