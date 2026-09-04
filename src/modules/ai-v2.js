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
  const STYLE_PROFILE_CACHE = new WeakMap();
  const COLORS = ['W', 'U', 'B', 'R', 'G'];

  // Signature styles are local scoring policies layered over the same legal
  // actions and hidden-information-safe BotPlayerView as every other bot.
  // Named styles are conservative syntheses of public gameplay, not claims
  // that the client reproduces a real person's private decisions.
  const AI_STYLE_SKILLS = Object.freeze({
    jimmy: Object.freeze({
      id: 'jimmy-aggro-pressure',
      label: 'Jimmy — Aggressive Pressure',
      archetype: 'Aggressive',
      reserveMana: 1,
      profileMultipliers: Object.freeze({
        lifeSafety: 0.78,
        boardPresence: 1.28,
        cardAdvantage: 0.95,
        manaDevelopment: 1.12,
        interaction: 0.72,
        commanderProgress: 1.45,
        synergyProgress: 1.32,
        graveyardValue: 0.9,
        comboProgress: 1.15,
        recoveryPotential: 0.75,
      }),
      modes: Object.freeze(['BUILD', 'PRESSURE', 'RACE', 'ALPHA']),
      politics: Object.freeze({ temporaryReprieveForPressure: true, protectsOwnWin: true, honorsContracts: true }),
    }),
    rachel: Object.freeze({
      id: 'rachel-balanced-tablecraft',
      label: 'Rachel — Balanced Tablecraft',
      archetype: 'Balanced',
      reserveMana: 1,
      profileMultipliers: Object.freeze({
        lifeSafety: 1.05,
        boardPresence: 1.08,
        cardAdvantage: 1.1,
        manaDevelopment: 1.06,
        interaction: 1.08,
        commanderProgress: 1.08,
        synergyProgress: 1.12,
        graveyardValue: 1,
        comboProgress: 1,
        recoveryPotential: 1.08,
      }),
      modes: Object.freeze(['DEVELOP', 'TABLE_READ', 'COMEBACK', 'FINISH']),
      politics: Object.freeze({ sharedThreatFirst: true, letsGameDevelop: true, defensiveInteraction: true, honorsContracts: true }),
    }),
    post: Object.freeze({
      id: 'post-opportunist-showstopper',
      label: 'Post Malone — Opportunist Showstopper',
      archetype: 'Opportunist',
      reserveMana: 1,
      profileMultipliers: Object.freeze({
        lifeSafety: 0.88,
        boardPresence: 1.02,
        cardAdvantage: 1.28,
        manaDevelopment: 1.08,
        interaction: 1.15,
        commanderProgress: 1.08,
        synergyProgress: 1.24,
        graveyardValue: 1.18,
        comboProgress: 1.35,
        recoveryPotential: 1.2,
      }),
      modes: Object.freeze(['LAY_LOW', 'HEIST', 'GAMBLE', 'SHOWTIME']),
      politics: Object.freeze({ selfPreservationDeals: true, sharedThreatFirst: true, borrowedPower: true, honorsContracts: true }),
    }),
    olivia: Object.freeze({
      id: 'olivia-saboteur-instigator',
      label: 'Olivia — Saboteur Instigator',
      archetype: 'Saboteur',
      reserveMana: 1,
      profileMultipliers: Object.freeze({
        lifeSafety: 0.98,
        boardPresence: 0.94,
        cardAdvantage: 1.22,
        manaDevelopment: 1.04,
        interaction: 1.32,
        commanderProgress: 1.05,
        synergyProgress: 1.18,
        graveyardValue: 1.08,
        comboProgress: 1.14,
        recoveryPotential: 1.12,
      }),
      modes: Object.freeze(['INFILTRATE', 'MISDIRECT', 'DISRUPT', 'AMBUSH']),
      politics: Object.freeze({ breaksOpposingAlliances: true, sharedThreatFirst: true, exactShortDeals: true, honorsContracts: true }),
    }),
    josh: Object.freeze({
      id: 'josh-value-engine',
      label: 'Josh — Defensive Value Engine',
      archetype: 'Defensive',
      reserveMana: 2,
      profileMultipliers: Object.freeze({
        lifeSafety: 1.15,
        boardPresence: 0.92,
        cardAdvantage: 1.35,
        manaDevelopment: 1.18,
        interaction: 1.35,
        commanderProgress: 1.05,
        synergyProgress: 1.18,
        graveyardValue: 1,
        comboProgress: 1,
        recoveryPotential: 1.25,
      }),
      modes: Object.freeze(['SETUP', 'VALUE', 'SHIELDS_UP', 'CLOSE']),
      politics: Object.freeze({ exactShortDeals: true, sharedThreatFirst: true, honorsContracts: true }),
    }),
  });
  MTG.AI_STYLE_SKILLS = AI_STYLE_SKILLS;

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

  // Beam pretraga pravi cijeli snapshot partije po čvoru, pa joj cijena raste
  // sa svakom kartom na stolu. Kasna partija sa vojskom tokena i punim
  // grobljima je zato znala zamrznuti browser na desetine sekundi. Budžet je
  // izražen u "karta × čvor" jedinicama: mala i srednja tabla dobiju isti broj
  // čvorova kao ranije, a ogromna ih proporcionalno smanji.
  const SIMULATION_WORK_BUDGET = 28000;
  const MIN_SEARCH_NODES = 8;
  // Tvrda kočnica u stvarnom vremenu. Deterministički budžet iznad pokriva
  // sve realne table; ovo je tu da nijedna patološka partija ne može zaključati
  // glavnu nit dok igrač čeka.
  const SEARCH_DEADLINE_MS = { easy: 450, normal: 900, hard: 1400 };
  MTG.AI_SEARCH_DEADLINE_MS = SEARCH_DEADLINE_MS;

  function simulationWorkload(game) {
    // Karta na tabli nosi i izvedeno stanje/attachmente, pa je skuplja od
    // karte u biblioteci ili groblju.
    let cards = (game.battlefield || []).length * 2;
    for (const player of game.players || []) {
      cards += player.hand.length + player.library.length + player.graveyard.length +
        player.exile.length + player.command.length;
    }
    return Math.max(1, cards);
  }
  MTG.aiSimulationWorkload = simulationWorkload;

  function searchConfigForState(game, config) {
    const workload = simulationWorkload(game);
    const allowance = Math.max(MIN_SEARCH_NODES,
      Math.min(config.maxNodes, Math.round(SIMULATION_WORK_BUDGET / workload)));
    if (allowance >= config.maxNodes) return config;
    return Object.assign({}, config, {
      maxNodes: allowance,
      maxDepth: allowance < 24 ? Math.min(config.maxDepth, 2) : config.maxDepth,
    });
  }

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
    const oracleImplementation = def.oracleImplementation || [];
    const attachmentOperations = oracleImplementation.filter(operation => operation.kind === 'attachment-grant');
    const harmfulAttachment = attachmentOperations.some(operation =>
      Number(operation.power || 0) < 0 || Number(operation.toughness || 0) < 0 ||
      operation.skipUntap || operation.cantAttack || operation.cantBlock);
    const is = type => types.includes(type);
    const mv = U.mv ? U.mv(def.cost || '') : 0;

    addIf(roles, is('Land'), 'land');
    addIf(roles, is('Creature'), 'creature');
    addIf(roles, !is('Land') && (def.mana || /add \{[wubrgc]/.test(oracle)), 'mana-rock');
    addIf(roles, /search your library for (?:a|up to .*?) (?:basic )?land|put .* land card .* battlefield|add \{[wubrgc]/.test(oracle), 'ramp');
    addIf(roles, /draw (?:a|one|two|three|four|x|that many|cards)|draws? an additional/.test(oracle), 'card-draw');
    addIf(roles, /scry|surveil|look at the top|reveal the top|connive/.test(oracle), 'card-selection');
    addIf(roles, /destroy target|exile target|return target .* to (?:its owner'?s|their) hand|deals? .* damage to target/.test(oracle), 'single-target-removal');
    // Compiled Oracle -toughness spells are genuine removal even when their
    // reminder-free wording does not match the older destroy/damage regexes.
    // Mixed +power/-toughness cards remain combat tricks as well, but the AI
    // must still value an exact-lethal hostile target outside combat.
    addIf(roles, oracleImplementation.some(operation =>
      operation.kind === 'spell-pump' && Number(operation.toughness) < 0), 'single-target-removal');
    addIf(roles, subtypes.includes('Aura') && harmfulAttachment, 'single-target-removal');
    addIf(roles, /destroy target artifact|exile target artifact/.test(oracle), 'artifact-removal');
    addIf(roles, /destroy target enchantment|exile target enchantment/.test(oracle), 'enchantment-removal');
    addIf(roles, /exile .* graveyard|cards? in graveyards? can'?t|player'?s graveyard/.test(oracle), 'graveyard-hate');
    addIf(roles, /counter target spell|counter target activated|counter target triggered/.test(oracle), 'counterspell');
    addIf(roles, /hexproof|indestructible|protection from|regenerate|phase out|prevent .* damage/.test(oracle), 'protection');
    addIf(roles, is('Instant') && /gets? [+-](?:\d+|x)\b|double strike|first strike|deathtouch|trample|lifelink|indestructible|hexproof|protection from|vigilance|flying|reach|menace/.test(oracle), 'combat-trick');
    addIf(roles, /destroy all|exile all|each creature gets -|all creatures get -|damage to each creature/.test(oracle), 'board-wipe');
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
    // A deck without a hand-written theme (every imported list, and a few
    // built-ins) had its synergies read off raw card counts, which surfaces
    // whatever is incidentally common instead of what the deck is about. The
    // commander is the thesis of a Commander deck, so its own synergy tags
    // carry the weight a hint would have given them.
    if (!hint.tags) {
      const commanderDef = deck && deck.commander && U.DEFS && U.DEFS[deck.commander];
      if (commanderDef) {
        for (const tag of inferCardSemantics(commanderDef).synergyTags || []) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 12;
        }
      }
    }
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
  MTG.invalidateDeckAIProfile = function (deckId) {
    if (typeof deckId !== 'string' || !deckId) return false;

    const publicProfiles = MTG.DECK_AI_PROFILES;
    const hasPublicProfile = !!publicProfiles && Object.prototype.hasOwnProperty.call(publicProfiles, deckId);
    const publicProfile = hasPublicProfile ? publicProfiles[deckId] : null;
    const cachedProfile = PROFILE_CACHE.get(deckId);
    let removed = PROFILE_CACHE.delete(deckId);

    // Style-specific profiles use the base profile object as their WeakMap key.
    // Dropping those entries keeps a same-name replacement from inheriting the
    // previous deck's style-weighted evaluation.
    for (const profile of [cachedProfile, publicProfile]) {
      if (profile && (typeof profile === 'object' || typeof profile === 'function')) {
        removed = STYLE_PROFILE_CACHE.delete(profile) || removed;
      }
    }

    if (hasPublicProfile) {
      MTG.DECK_AI_PROFILES = Object.freeze(Object.fromEntries(
        Object.entries(publicProfiles).filter(([id]) => id !== deckId),
      ));
      removed = true;
    }
    return removed;
  };
  MTG.getDeckAIProfile = function (deckId) {
    return (MTG.DECK_AI_PROFILES && MTG.DECK_AI_PROFILES[deckId]) ||
      (U.DECKS && U.DECKS[deckId] ? buildDeckProfile(deckId, U.DECKS[deckId]) : null);
  };

  MTG.getAIBaseStyle = style => MTG.AI_STYLES?.[style]?.baseStyle || style;
  MTG.getAIStyleSkill = style => MTG.AI_STYLES?.[style]?.runtimeSkill || AI_STYLE_SKILLS[style] || null;
  function styleSkillFor(player) {
    return player ? MTG.getAIStyleSkill(player.aiStyle) : null;
  }

  function profileForStyle(profile, player) {
    const skill = styleSkillFor(player);
    // A core archetype without a skill still tilts the evaluation profile
    // (see CORE_PROFILE_MULTIPLIERS next to applyCoreArchetypeScore).
    const coreBase = player && MTG.getAIBaseStyle(player.aiStyle);
    const coreMultipliers = !skill && coreBase && CORE_PROFILE_MULTIPLIERS[coreBase] || null;
    if (!profile || (!skill && !coreMultipliers)) return profile;
    let byStyle = STYLE_PROFILE_CACHE.get(profile);
    if (!byStyle) { byStyle = new Map(); STYLE_PROFILE_CACHE.set(profile, byStyle); }
    if (byStyle.has(player.aiStyle)) return byStyle.get(player.aiStyle);
    const multipliers = skill ? (skill.profileMultipliers || {}) : coreMultipliers;
    const weights = Object.fromEntries(Object.entries(profile.weights || {}).map(([key, value]) =>
      [key, round(value * (multipliers[key] || 1))]));
    const styled = Object.freeze(Object.assign({}, profile, {
      weights: Object.freeze(weights),
      styleKey: player.aiStyle,
      styleSkill: skill ? skill.id : `core-${coreBase}`,
    }));
    byStyle.set(player.aiStyle, styled);
    return styled;
  }
  MTG.getBotEvaluationProfile = player => {
    const deckId = player && (player.deckName || player.deck && player.deck.name);
    return profileForStyle(MTG.getDeckAIProfile(deckId), player);
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
      toxic: known && !(card.cur && card.cur.abilitiesDisabled) ? Math.max(0, Number(def && def.toxic) || 0) : 0,
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
    const battlefieldCards = gameState.bf();
    const players = gameState.players.map(other => {
      const mine = other === player;
      const row = {
        id: other.idx,
        name: other.name,
        life: other.life,
        poison: Math.max(0, Number(other.poison) || 0),
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
      if (other.library.length && battlefieldCards.some(source => source.ctrl === other && !source.cur?.abilitiesDisabled &&
        (source.def.revealAllTop || mine && source.def.revealOwnTop))) row.visibleLibraryTop = publicCard(other.library.at(-1), player, true);
      const forecastCards=[...(gameState.forecastRevealedCards?.(other)||[]),...(gameState.miracleRevealedCards?.(other)||[])];
      if(!mine&&forecastCards.length)row.revealedHand=forecastCards.map(card=>publicCard(card,player,true));
      return deepFreeze(row);
    });
    const battlefield = battlefieldCards.map(card => publicCard(card, player, card.ctrl === player || !card.faceDown));
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

  function publicPoisonPressure(creatures) {
    return creatures.reduce((sum, card) => {
      const power = Math.max(0, card.power || 0);
      if (!power) return sum;
      const hits = card.keywords.includes('double strike') ? 2 : 1;
      return sum + ((card.keywords.includes('infect') ? power : 0) + (card.toxic || 0)) * hits;
    }, 0);
  }

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
    const lifeDamage = creatures.filter(card => !card.keywords.includes('infect'))
      .reduce((sum, card) => sum + Math.max(0, card.power || 0) * (card.keywords.includes('double strike') ? 1.75 : 1), 0);
    const poisonPressure = publicPoisonPressure(creatures);
    const evasivePower = creatures.filter(card => hasAny(card.keywords.join(' '), [/flying/, /trample/, /menace/, /unblockable/]))
      .reduce((sum, card) => sum + Math.max(0, card.power || 0), 0);
    const engineProgress = board.reduce((sum, card) => sum +
      (card.roles.includes('engine') ? 4 : 0) + (card.roles.includes('combo-piece') ? 5 : 0) + (card.roles.includes('tutor') ? 1 : 0) +
      // A permanent that repeats card draw is the engine that quietly wins the
      // game; it is worth more than a trigger that does something else.
      (card.roles.includes('engine') && card.roles.includes('card-draw') ? 2 : 0), 0);
    let commanderLethal = 0;
    if (observer) {
      for (const [commanderId, damage] of Object.entries(observer.commanderDamage || {})) {
        const commander = view.battlefield.concat(target.commandZone).find(card => String(card.id) === String(commanderId));
        if (commander && commander.ownerId === targetPlayerId) commanderLethal = Math.max(commanderLethal, Number(damage) || 0);
      }
    }
    const immediateLethal = observer && (lifeDamage >= observer.life || commanderLethal >= 18 ||
      poisonPressure > 0 && (observer.poison || 0) + poisonPressure >= 10) ? 1 : 0;
    const interactionRisk = clamp(target.openMana * 0.8 + target.handCount * 0.35 + (profile && profile.interactionDensity || 0) * 10, 0, 20);
    const recent = view.publicActions.slice(-18).filter(entry => entry.message.includes(target.name));
    const momentum = recent.reduce((score, entry) => score + (/vuče|draw|igra land|plays a land|Treasure|mana/i.test(entry.message) ? 0.8 : 0), 0);
    const recovery = clamp((profile && profile.weights.recoveryPotential || 1) * target.handCount + target.commandZone.length * 1.5, 0, 18);
    const lifeBuffer = target.life * 0.08;
    // A player nobody attacks stays at forty while the rest of the table
    // grinds each other down, and the old model barely noticed: life counted
    // 0.08 per point, so an eleven-point lead was worth under one point of
    // threat. Measured over full games, the winners with no board at all sat
    // BELOW the table's average threat (30.6 vs 36.0) while holding an ~12
    // life lead. Being far ahead on life is itself a public threat.
    const others = view.players.filter(row => row.id !== targetPlayerId && !row.lost);
    const lifeLead = others.length
      ? clamp((target.life - others.reduce((sum, row) => sum + row.life, 0) / others.length) * LIFE_LEAD_WEIGHT,
        -LIFE_LEAD_FLOOR, LIFE_LEAD_CEILING)
      : 0;
    const totalScore = round(immediateLethal * 55 + Math.max(0, commanderLethal - 10) * 1.8 + boardPower * 0.9 + evasivePower * 0.35 +
      engineProgress + interactionRisk + recovery * 0.45 + momentum + lifeBuffer + lifeLead);
    return { totalScore, immediateLethal, commanderLethal: round(commanderLethal), boardPower: round(boardPower), engineProgress: round(engineProgress), interactionRisk: round(interactionRisk), recovery: round(recovery), lifeLead: round(lifeLead) };
  };

  // A twenty-point life lead is about as threatening as a twenty-power board
  // (boardPower is weighted 0.9). The floor keeps the player who is furthest
  // behind from being scored as harmless when they still hold a real board.
  const LIFE_LEAD_WEIGHT = 0.7;
  const LIFE_LEAD_CEILING = 20;
  const LIFE_LEAD_FLOOR = 8;

  function interactionInHand(row) {
    return (row.hand || []).filter(card => card.roles.some(role => ['single-target-removal', 'counterspell', 'board-wipe', 'protection'].includes(role))).length;
  }

  MTG.evaluateState = function (view, perspectivePlayerId, deckProfile) {
    const perspective = getPlayerRow(view, perspectivePlayerId);
    if (!perspective) throw new Error(`AI V2 evaluator: nepoznat player ${perspectivePlayerId}`);
    const profile = deckProfile || MTG.getDeckAIProfile(perspective.deckId) || { weights: {}, primarySynergies: [], importantEngines: [], finishers: [], commanderImportance: 1 };
    const cacheKey = `${stateHash(view)}|p${perspectivePlayerId}|${profile.deckId || ''}|${profile.styleKey || ''}`;
    if (EVAL_CACHE.has(cacheKey)) return EVAL_CACHE.get(cacheKey);
    const board = controlledPermanents(view, perspectivePlayerId);
    const boardValue = board.reduce((sum, card) => sum + permanentValue(card, profile), 0);
    const lifeSafety = clamp(perspective.life / 40 * 25, -20, 35);
    const maxCommanderDamage = Math.max(0, ...Object.values(perspective.commanderDamage || {}).map(Number));
    const commanderDamageSafety = clamp((21 - maxCommanderDamage) * 1.2, -40, 25);
    const poisonDanger = Math.max(0, perspective.poison || 0) * 2.5 + Math.max(0, (perspective.poison || 0) - 6) * 6;
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
    const myCreatures = board.filter(card => card.roles.includes('creature'));
    const myAttack = myCreatures.filter(card => !card.keywords.includes('infect')).reduce((sum, card) => sum + Math.max(0, card.power || 0), 0);
    const myPoison = publicPoisonPressure(myCreatures);
    // Eliminating one vulnerable player in a pod is progress, not victory.
    const immediateWinPotential = view.winnerId === perspectivePlayerId ? 1000 : opponents.length === 1 &&
      (myAttack >= opponents[0].life || myPoison > 0 && (opponents[0].poison || 0) + myPoison >= 10) ? 55 : clamp(comboProgress * 1.4, 0, 50);
    const survival = lifeSafety + commanderDamageSafety - poisonDanger - immediateLossRisk;
    const w = Object.assign({ lifeSafety: 1, boardPresence: 1, cardAdvantage: 1, manaDevelopment: 1, interaction: 1, commanderProgress: 1, synergyProgress: 1, graveyardValue: 1, comboProgress: 1, recoveryPotential: 1 }, profile.weights || {});
    let totalScore = survival * w.lifeSafety + boardValue * w.boardPresence + cardAdvantage * w.cardAdvantage +
      manaDevelopment * w.manaDevelopment + availableInteraction * w.interaction + commanderProgress * w.commanderProgress +
      synergyProgress * w.synergyProgress + graveyardValue * w.graveyardValue + comboProgress * w.comboProgress +
      recoveryPotential * w.recoveryPotential + immediateWinPotential * 8 - immediateLossRisk * 8;
    if (view.gameOver) totalScore = view.winnerId === perspectivePlayerId ? 1000000 : perspective.lost ? -1000000 : -500000;
    const result = deepFreeze({
      totalScore: round(totalScore), survival: round(survival), lifeSafety: round(lifeSafety), commanderDamageSafety: round(commanderDamageSafety), poisonDanger: round(poisonDanger),
      boardValue: round(boardValue), cardAdvantage: round(cardAdvantage), manaDevelopment: round(manaDevelopment), availableInteraction: round(availableInteraction),
      commanderProgress: round(commanderProgress), synergyProgress: round(synergyProgress), comboProgress: round(comboProgress), graveyardValue: round(graveyardValue), recoveryPotential: round(recoveryPotential),
      immediateWinPotential: round(immediateWinPotential), immediateLossRisk: round(immediateLossRisk), threatFromPlayers, vulnerabilityToPlayers,
    });
    if (EVAL_CACHE.size > 2500) EVAL_CACHE.clear();
    EVAL_CACHE.set(cacheKey, result);
    return result;
  };

  // View je zamrznut snapshot, pa je njegov hash konstanta. Bez ovog keša se
  // isti board serijalizovao po nekoliko puta za svaki simulirani čvor
  // (evaluateState, utilityVector, kingmaking, seed) i na tabli sa stotinu
  // tokena je sam hash bio drugi najskuplji dio odluke.
  const STATE_HASH_CACHE = new WeakMap();
  function stateHash(view) {
    if (view && typeof view === 'object') {
      const cached = STATE_HASH_CACHE.get(view);
      if (cached !== undefined) return cached;
    }
    const computed = computeStateHash(view);
    if (view && typeof view === 'object') STATE_HASH_CACHE.set(view, computed);
    return computed;
  }
  function computeStateHash(view) {
    const payload = {
      t: view.turnNumber, a: view.activePlayerId, p: view.phase, s: view.step, w: view.winnerId,
      players: view.players.map(player => [player.id, player.life, player.lost, player.handCount, player.libraryCount, player.openMana,
        Object.entries(player.commanderDamage || {}).sort(), player.graveyard.map(card => card.name).sort(), player.commandZone.map(card => [card.id, card.name])]
        .concat(player.poison > 0 ? [['poison', player.poison]] : [])),
      battlefield: view.battlefield.map(card => [card.id, card.name, card.controllerId, card.tapped, card.power, card.toughness, card.damage, Object.entries(card.counters || {}).sort()]
        .concat(card.keywords.includes('infect') || card.toxic > 0
          ? [['poison', card.keywords.includes('infect'), card.toxic || 0]
            .concat(card.keywords.includes('double strike') ? ['double strike'] : [])] : [])).sort((a, b) => a[0] - b[0]),
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
    if (action.kind === 'cast') {
      if (action.alt && action.alt.faceDownCast) return 'Cast a face-down creature spell';
      return `Cast ${action.card.name}${action.alt && action.alt.label ? ` (${action.alt.label})` : ''}`;
    }
    if (action.kind === 'land') return `Play land ${action.card.name}`;
    if (action.kind === 'activate') return `Activate ${action.entry.card.name}${action.entry.label || action.entry.ability && action.entry.ability.label ? ` — ${action.entry.label || action.entry.ability.label}` : ''}`;
    if (action.kind === 'pass') return 'Pass priority';
    if (action.kind === 'done') return 'End action window';
    if (action.kind === 'declareAttackers') return action.assignments.length ? `Attack: ${action.assignments.map(item => `${item.card.name} → ${item.target.name}`).join(', ')}` : 'No attacks';
    if (action.kind === 'declareBlockers') return action.assignments.length ? `Block: ${action.assignments.map(item => `${item.blocker.name} → ${item.attacker.name}`).join(', ')}` : 'No blocks';
    if (action.kind === 'chooseTargets') return `Targets: ${action.picks.map(target => target.name || target.card && target.card.name || 'stack object').join(', ') || 'none'}`;
    if (action.kind === 'chooseCards') return `Cards: ${action.picks.map(card => card.faceDown ? 'Face-down card' : card.name).join(', ') || 'none'}`;
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
    if (action.kind === 'activate') return `activate:${action.entry.card.iid}:${action.entry.idx ?? ''}:${action.entry.equip ? 'equip' : ''}:${action.entry.crew ? 'crew' : ''}:${action.entry.cycling ? 'cycling' : ''}:${action.entry.plot ? 'plot' : ''}:${action.entry.foretell ? 'foretell' : ''}:${action.entry.ninjutsu ? 'ninjutsu' : ''}:${action.entry.suspend ? 'suspend' : ''}:${action.entry.label || ''}`;
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
      // Late games can require discarding most of a very large hand. Avoid
      // traversing subsets that can no longer reach the mandatory minimum.
      if (take.length + items.length - index < min) return;
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

  // Bounded generic subset enumeration is intentionally approximate and can
  // fill its beam with DFS prefixes before it ever reaches a later singleton.
  // Crew needs one guaranteed resource-minimal payment candidate: zero-power
  // creatures must never be added merely because the useful pilot appears
  // late in stable order. Dynamic programming keeps the best tap-cost row for
  // each exact power total and stops extending a row once Crew is satisfied.
  function minimalCrewPayment(game, player, cards, need) {
    const required = Math.max(0, Number(need) || 0);
    if (required === 0) return [];
    let states = new Map([[0, { power: 0, cost: 0, picks: [] }]]);
    for (const card of cards) {
      const contribution = Math.max(0, Number(card.power) || 0);
      if (contribution <= 0) continue;
      const tapCost = permanentGameValue(game, card, player) + 0.4;
      const next = new Map(states);
      for (const state of states.values()) {
        if (state.power >= required) continue;
        const power = state.power + contribution;
        const candidate = {
          power,
          cost: state.cost + tapCost,
          picks: state.picks.concat(card),
        };
        const current = next.get(power);
        const candidateKey = candidate.picks.map(pick => pick.iid).join(',');
        const currentKey = current ? current.picks.map(pick => pick.iid).join(',') : '';
        if (!current || candidate.cost < current.cost ||
          (candidate.cost === current.cost && candidateKey.localeCompare(currentKey) < 0)) {
          next.set(power, candidate);
        }
      }
      states = next;
    }
    const viable = [...states.values()].filter(state => state.power >= required);
    viable.sort((a, b) =>
      (a.cost + (a.power - required) * 1.5) - (b.cost + (b.power - required) * 1.5) ||
      a.picks.length - b.picks.length ||
      a.picks.map(card => card.iid).join(',').localeCompare(b.picks.map(card => card.iid).join(',')));
    return viable[0] ? viable[0].picks : null;
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

  function projectedPlayerDamage(card, damage, damageEvents = 1) {
    const infect = card.kw('infect');
    const toxic = !(card.cur && card.cur.abilitiesDisabled) ? Math.max(0, Number(card.def.toxic) || 0) : 0;
    return {
      life: infect ? 0 : damage,
      poison: (infect ? damage : 0) + (damage > 0 ? toxic * damageEvents : 0),
    };
  }

  // Procjena jednog napada UZ svijest o stvarnim blokovima branioca:
  // - "free block" (bloker ubija napadača i preživi) čini napad čistim gubitkom;
  // - trade se vrednuje razlikom vrijednosti;
  // - blokirani napadač bez tramplea NE nanosi štetu igraču;
  // - `priorAttackers` modeluje swarm: braniocu ponestane blokera.
  // `ctx` is an optional per-declaration cache (threat per defender, defender
  // creatures) so that planning a wide board does not rebuild the full bot
  // view for every attacker × target pair.
  function attackAssignmentAssessment(game, player, card, target, priorAttackers = 0, ctx = null, committedDamage = 0) {
    const defender = target instanceof U.Player ? target : target.ctrl;
    const baseHit = Math.max(0, game.dmgAmount ? game.dmgAmount(card, 'normal') : card.power || 0);
    const hit = baseHit * (card.kw('double strike') ? 2 : 1);
    const defenderCreatures = ctx && ctx.creaturesOf ? ctx.creaturesOf(defender) : game.creatures(defender);
    const allBlockers = defenderCreatures.filter(blocker => game.canBlock(blocker, card));
    const myToughLeft = Math.max(1, (card.toughness || 0) - (card.damage || 0));
    const myValue = permanentGameValue(game, card, player);
    const iFirst = (card.kw('first strike') || card.kw('double strike'));
    // Classify every legal blocker against THIS attacker first. A blocker that
    // eats the attacker for free (deathtouch, first strike, bigger body) or in
    // a lopsided trade is a "punisher": the defender will spend it on the most
    // valuable attacker no matter how many other creatures are declared, so a
    // swarm never hides it from a big attacker.
    const punishers = [], ordinary = [];
    for (const blocker of allBlockers) {
      const bPow = Math.max(0, blocker.power || 0);
      const bToughLeft = Math.max(1, (blocker.toughness || 0) - (blocker.damage || 0));
      const bFirst = (blocker.kw('first strike') || blocker.kw('double strike')) && !iFirst;
      const dies = baseHit >= bToughLeft || (card.kw('deathtouch') && baseHit > 0);
      // A first striker that kills the blocker first never takes its damage.
      const struckFirst = iFirst && !blocker.kw('first strike') && !blocker.kw('double strike') && dies;
      const killsMe = !struckFirst && (bPow >= myToughLeft || (blocker.kw('deathtouch') && bPow > 0));
      const blockerValue = permanentGameValue(game, blocker, player);
      const free = killsMe && (!dies || bFirst);
      const cheapTrade = killsMe && dies && blockerValue <= myValue * 0.6;
      const info = { blocker, bToughLeft, killsMe, dies, bFirst, blockerValue };
      if (free || cheapTrade) punishers.push(info); else ordinary.push(info);
    }
    // menace: jedan bloker nije dovoljan; swarm: raniji napadači vežu OBIČNE
    // blokere. Punisheri ostaju dostupni bez obzira na broj napadača.
    const capacity = Math.max(0, ordinary.length - Math.max(0, priorAttackers - punishers.length));
    const available = punishers.concat(ordinary.slice(0, capacity));
    const blockable = available.length >= game.blockerBounds(card).min;
    const blockers = blockable ? available.map(info => info.blocker) : [];
    let freeBlock = false, bestTradeLoss = 0, minBlockerTough = Infinity;
    for (const info of (blockable ? available : [])) {
      minBlockerTough = Math.min(minBlockerTough, info.bToughLeft);
      if (info.killsMe && (!info.dies || info.bFirst)) freeBlock = true;
      else if (info.killsMe && info.dies) {
        bestTradeLoss = Math.max(bestTradeLoss, myValue - info.blockerValue);
      }
    }
    // očekivana šteta koja stvarno prolazi do mete
    let expDamage, damageEvents;
    const strikes = card.kw('double strike') ? 2 : 1;
    if (!blockers.length) {
      expDamage = hit;
      damageEvents = baseHit > 0 ? strikes : 0;
    } else if (card.kw('trample') && Number.isFinite(minBlockerTough)) {
      expDamage = Math.max(0, hit - minBlockerTough);
      damageEvents = (baseHit > minBlockerTough ? 1 : 0) + (strikes === 2 && expDamage > 0 ? 1 : 0);
    } else {
      expDamage = hit * 0.25; // branilac vjerovatno blokira profitabilan blok
      damageEvents = baseHit > 0 ? strikes * 0.25 : 0;
    }
    const projected = projectedPlayerDamage(card, expDamage, damageEvents);
    const poisonLethal = target instanceof U.Player && projected.poison > 0 &&
      (target.poison || 0) + projected.poison >= 10;
    // Šteta preko protivnikovog života (uz rezervu za chump blokove) ne vrijedi
    // gotovo ništa. Bez ovoga je plan sa 100 štete na igrača sa 3 života
    // uvijek pobjeđivao mjeren napad, pa je AI slao cijelu tablu bez razloga.
    const alreadyCommitted = Math.max(0, Number(committedDamage) || 0);
    let damageValue = expDamage;
    if (target instanceof U.Player) {
      const enough = Math.max(0, target.life * 1.5 + 2);
      const useful = Math.max(0, Math.min(expDamage, enough - alreadyCommitted));
      damageValue = useful + Math.max(0, expDamage - useful) * 0.08;
    }
    const alreadyLethal = target instanceof U.Player && alreadyCommitted >= target.life;
    const lethal = !alreadyLethal && target instanceof U.Player &&
      (poisonLethal || projected.life > 0 && projected.life >= target.life) ? 90 : 0;
    let commander = 0;
    if (card.commander && target instanceof U.Player && expDamage > 0) {
      const dealt = Number(target.commanderDamage && target.commanderDamage[card.iid] || 0);
      if (dealt + expDamage >= 21) commander = 120;
      else commander = expDamage * 0.65;
    }
    // Pritisak na vodeću prijetnju vrijedi samo ako napad zaista može nanijeti
    // combat damage. Ranije je i 0/1 Birds of Paradise dobijao isti threat
    // bonus, pa je AI na ranom potezu tapovao izvor mane za doslovno 0 štete.
    const dealsDamage = expDamage > 0;
    // Pritisak je stvaran samo za štetu koja još nešto mijenja. Napad preko
    // smrtonosnog praga ne "pritiska" nikoga.
    const usefulShare = expDamage > 0 ? Math.min(1, damageValue / expDamage) : 0;
    const defenderThreat = ctx && ctx.threatFor ? ctx.threatFor(defender) : playerThreatForGame(game, player, defender);
    // Personas are allowed to disagree with the table. A seat whose identity is
    // to let the leader run and peck at whoever stumbles (focusLeader below
    // zero) gets no pull toward the biggest threat at all — neither half of it,
    // or the flat term alone would still drag it back onto the leader.
    const focusLeader = Number((MTG.AI_STYLES && MTG.AI_STYLES[MTG.getAIBaseStyle(player.aiStyle)] || {}).focusLeader);
    const personaFocus = Number.isFinite(focusLeader) ? clamp(focusLeader / 1.5, 0, 1.2) : 1;
    let threat = dealsDamage ? defenderThreat * 0.13 * usefulShare * (focusLeader < 0 ? 0 : 1) : 0;
    // Threat assessment decides WHO gets hit, not merely that hitting someone
    // is worth a little. Measured before this: the table's biggest threat took
    // 42% of all attacks — barely more than an even split — and was ignored
    // outright in 35 of 81 declarations where it was attackable and clearly
    // ahead. The absolute term above was worth 1.6 points at a median threat
    // spread while a single bad block costs 8, so board risk always won.
    // Comparing a defender with the rest of the table fixes the direction: a
    // runaway draws the whole pod, and the player who is behind is left alone.
    const reference = ctx && ctx.referenceFor ? ctx.referenceFor(defender) : null;
    if (dealsDamage && reference !== null && !freeBlock && personaFocus > 0) {
      // Pressure is only pressure if the attack does something. A body the
      // defender eats for free applies none of it — that is how a 2/2 used to
      // be talked into an untapped 8/8 wall — while a blocked attacker that
      // trades or forces a chump still applies most of it.
      const pressureShare = blockers.length ? 0.6 : 1;
      threat += clamp((defenderThreat - reference) * THREAT_FOCUS_WEIGHT,
        -THREAT_FOCUS_MERCY, THREAT_FOCUS_CEILING) * usefulShare * pressureShare * personaFocus;
    }
    let risk = 0;
    // A punisher is spent on the juiciest attacker first, so a cheap body is
    // deterred less than a real threat: losing a 1/1 to a deathtouch blocker
    // is a fair price for a swarm, losing the 6/6 commander is not.
    const attractiveness = myValue >= 5 ? 1 : myValue >= 3 ? 0.7 : 0.45;
    if (freeBlock) risk += (myValue * 1.05 + 3) * attractiveness;                // poginem, ništa ne dobijem
    else if (bestTradeLoss > 0) risk += (bestTradeLoss * 0.8 + 1) * attractiveness; // nepovoljan trade
    else if (blockers.length) risk += 0.8;                    // chump im poklanja tempo, mala cijena
    const vigilance = card.kw('vigilance');
    // Tijelo koje ne treba za pobjedu je vrjednije kod kuće nego tapnuto.
    if (alreadyLethal && !vigilance) risk += 1.2;
    if (!dealsDamage) risk += 2.5;                            // dobrovoljni napad bez štete nema combat korist
    const tapsForMana = !vigilance && !!(card.def.mana && (!card.def.mana.cost || card.def.mana.cost.tap));
    if (tapsForMana) risk += game.turnNo <= 12 ? 3.5 : 1.75; // čuvaj rani mana razvoj za main 2/reakcije
    const crackback = vigilance ? 0 : defenderCreatures.filter(creature => !creature.tapped)
      .reduce((sum, creature) => sum + Math.max(0, creature.power || 0), 0) * 0.08;
    const poisonPressure = target instanceof U.Player ? projected.poison * 2.5 : 0;
    const score = damageValue * 1.15 + poisonPressure + lethal + commander + threat - risk - crackback;
    return {
      score, freeBlock, expectedDamage: expDamage, bestTradeLoss,
      blockable: blockers.length > 0, blockerCount: blockers.length,
      dealsDamage, lethal: lethal > 0, poisonLethal, commanderLethal: commander >= 120,
    };
  }

  function attackAssignmentScore(game, player, card, target, priorAttackers = 0, ctx = null) {
    return attackAssignmentAssessment(game, player, card, target, priorAttackers, ctx).score;
  }

  // Shared per-declaration cache for the attack planner.
  function attackPlanContext(game, player) {
    const threats = new Map(), creatures = new Map();
    const threatFor = defender => {
      if (!threats.has(defender)) threats.set(defender, playerThreatForGame(game, player, defender));
      return threats.get(defender);
    };
    // Every live opponent is scored once, so a defender can be compared with
    // the rest of the table instead of judged on an absolute number.
    let table = null;
    const tableThreats = () => {
      if (!table) table = player.opponents(game).filter(rival => !rival.lost).map(rival => [rival, threatFor(rival)]);
      return table;
    };
    return {
      threatFor,
      // The average threat of the OTHER opponents. Above it means this player
      // is the table's problem; below it means someone else is.
      referenceFor: defender => {
        const rows = tableThreats().filter(([rival]) => rival !== defender);
        if (!rows.length) return null;
        return rows.reduce((sum, [, value]) => sum + value, 0) / rows.length;
      },
      creaturesOf: defender => {
        if (!creatures.has(defender)) creatures.set(defender, game.creatures(defender));
        return creatures.get(defender);
      },
    };
  }
  MTG.botAttackPlanContext = attackPlanContext;

  // Wide boards (token swarms) are planned for the most relevant bodies only;
  // everything past these limits is treated as interchangeable fodder.
  // How hard the table's threat ranking pulls an attack. At the median spread
  // (~13 points) the leader is worth about a whole extra attacker; a runaway
  // (p90 spread ~80) becomes the only sensible target. The mercy cap keeps the
  // penalty for hitting the weakest player from ever forbidding a lethal swing.
  const THREAT_FOCUS_WEIGHT = 0.55;
  const THREAT_FOCUS_CEILING = 30;
  // Sparing the player who is behind must bias the choice, never veto the
  // attack: at 12 a bot with one good probe attack and no better target simply
  // stayed home. Five is under a typical attack's own score.
  const THREAT_FOCUS_MERCY = 5;
  const WIDE_BOARD_ATTACKERS = 28;
  const WIDE_BOARD_BLOCK_TARGETS = 24;
  const WIDE_BOARD_SHIELDS = 16;
  const MENACE_PARTNER_LIMIT = 6;
  const FORECAST_ATTACKER_LIMIT = 24;
  const COMBAT_SURVIVAL_BUDGET_MS = 600;
  const WIDE_BOARD_SWARM_SHIELDS = 8;
  const WIDE_BOARD_SWARM_BLOCK_TARGETS = 12;
  const EMPTY_LIST = Object.freeze([]);
  // Jedna pretraga blokova pravi hiljade prognoza nad ISTIM nizom napadača;
  // poredak se zato računa jednom po nizu.
  const RANKED_ATTACKERS = new WeakMap();
  function rankedAttackers(attackers) {
    let ranked = RANKED_ATTACKERS.get(attackers);
    if (!ranked) {
      ranked = attackers.slice().sort(byCombatWeight);
      RANKED_ATTACKERS.set(attackers, ranked);
    }
    return ranked;
  }
  function byCombatWeight(a, b) {
    return (Math.max(0, b.power || 0) + Math.max(0, b.toughness || 0) * 0.3) - (Math.max(0, a.power || 0) + Math.max(0, a.toughness || 0) * 0.3) || a.iid - b.iid;
  }
  // Diplomacy uses the exact same public combat-risk model as the bot planner.
  // This prevents a political promise from calling an attack "available" when
  // the combat AI can already see that a defender will eat the attacker for free.
  MTG.assessAttackAssignment = attackAssignmentAssessment;

  // Bounded, public-board combat forecast. Never resolves scripts or reads an
  // opponent's hand. It ranks declarations; the rules engine still executes
  // all damage, triggers, replacements and legality in the actual game.
  function forecastCombat(game, defender, attackers, assignments, initial = {}) {
    // Blokovi se traže po napadaču. Filtriranje cijele liste unutar petlje po
    // napadačima je pravilo O(napadači × blokeri) posla po prognozi, što je na
    // tabli sa stotinu tokena samo po sebi zamrzavalo deklaraciju napada.
    const blockersByAttacker = new Map();
    for (const item of assignments) {
      const list = blockersByAttacker.get(item.attacker);
      if (list) list.push(item.blocker);
      else blockersByAttacker.set(item.attacker, [item.blocker]);
    }
    // Roj od stotinu 1/1 tokena nijedna strana ionako ne blokira — pretraga
    // blokova ih je već ograničavala. Modeluju se najteža tijela i sve što je
    // stvarno blokirano, a ostatak samo doda svoju štetu braniocu. Bez toga je
    // svaka prognoza gradila mapu stanja za cijelu tablu.
    let modeled = attackers, swarm = EMPTY_LIST;
    if (attackers.length > FORECAST_ATTACKER_LIMIT) {
      const ranked = rankedAttackers(attackers);
      modeled = ranked.slice(0, FORECAST_ATTACKER_LIMIT);
      swarm = [];
      for (const card of ranked.slice(FORECAST_ATTACKER_LIMIT)) {
        if (blockersByAttacker.has(card)) modeled.push(card);
        else swarm.push(card);
      }
    }
    const cards = [...new Set([...modeled, ...assignments.map(item => item.blocker)])];
    const state = new Map(cards.map(card => [card, {
      damage: initial.freshTurn ? 0 : Number(card.damage || 0),
      toughness: Math.max(0, card.toughness), dead: false,
      // The live power/toughness already includes existing counters. Track
      // only new forecast counters so a clone never applies them twice.
      counterReduction: 0,
      shield: Number(card.counters && card.counters.shield || 0),
      regen: Number(card.regenShield || 0), removed: false,
    }]));
    const result = { life: initial.life ?? defender.life, poison: initial.poison ?? (defender.poison || 0),
      commanderDamage: Object.assign({}, initial.commanderDamage || defender.commanderDamage),
      dead: new Set(), removed: new Set(), lifeGain: new Map(), damage: 0, lethal: false };
    const active = card => !state.get(card).dead && !state.get(card).removed;
    // dmgAmount je najskuplji poziv u prognozi, a unutar jedne prognoze je
    // konstanta po karti — mijenja se samo lokalni counterReduction.
    const baseDamage = new Map();
    const printedDamage = card => {
      let value = baseDamage.get(card);
      if (value === undefined) {
        value = game.dmgAmount(card, 'first') || game.dmgAmount(card, 'normal');
        baseDamage.set(card, value);
      }
      return value;
    };
    for (const step of ['first', 'normal']) {
      const hits = [], blockedAttackers = new Map();
      const amount = card => {
        const first = card.kw('first strike'), double = card.kw('double strike');
        if (step === 'first' ? !(first || double) : first && !double) return 0;
        const row = state.get(card);
        return Math.max(0, printedDamage(card) - (row ? row.counterReduction : 0));
      };
      for (const card of swarm) {
        const dealt = amount(card);
        if (dealt > 0) hits.push({ source: card, target: defender, n: dealt });
      }
      for (const attacker of modeled.filter(active)) {
        const assigned = blockersByAttacker.get(attacker) || [];
        const bounds = game.blockerBounds(attacker);
        const legalBlock = assigned.length >= bounds.min && assigned.length <= bounds.max;
        const blockers = legalBlock ? assigned.filter(active).sort((a, b) =>
          state.get(a).toughness - state.get(a).damage - state.get(b).toughness + state.get(b).damage || a.iid - b.iid) : [];
        for (const blocker of blockers) {if (!blockedAttackers.has(blocker)) blockedAttackers.set(blocker, []); blockedAttackers.get(blocker).push(attacker);}
        let remaining = amount(attacker);
        for (let index = 0; index < blockers.length; index++) {
          const blocker = blockers[index];
          const lethal = attacker.kw('deathtouch') ? 1 : Math.max(1, state.get(blocker).toughness - state.get(blocker).damage);
          const dealt = index === blockers.length - 1 && !attacker.kw('trample') ? remaining : Math.min(remaining, lethal);
          if (dealt > 0) hits.push({ source: attacker, target: blocker, n: dealt });
          remaining -= dealt;
        }
        if (remaining > 0 && (!legalBlock || attacker.kw('trample'))) hits.push({ source: attacker, target: defender, n: remaining });
      }
      for (const [blocker, attacking] of blockedAttackers) for (const {attacker, n} of game.assignBlockerDamage(blocker, attacking, amount(blocker), card => state.get(card))) hits.push({source: blocker, target: attacker, n});
      for (const { source, target, n } of hits) {
        if (target !== defender && game.isProtectedFrom(target, source)) continue;
        const targetState = state.get(target);
        if (targetState && targetState.shield > 0) { targetState.shield--; continue; }
        if (source.kw('lifelink')) result.lifeGain.set(source.ctrl, (result.lifeGain.get(source.ctrl) || 0) + n);
        if (target === defender) {
          result.damage += n;
          const projected = projectedPlayerDamage(source, n, 1);
          result.poison += projected.poison;
          result.life -= projected.life;
          if (source.commander) result.commanderDamage[source.iid] = (result.commanderDamage[source.iid] || 0) + n;
        } else {
          if (source.kw('infect') || source.kw('wither')) {
            targetState.toughness -= n;
            targetState.counterReduction += n;
          }
          else targetState.damage += n;
          if (source.kw('deathtouch')) targetState.deathtouched = true;
        }
      }
      for (const card of cards.filter(active)) {
        const row = state.get(card);
        const destroy = row.damage >= row.toughness || row.deathtouched;
        if (row.toughness <= 0 || (destroy && !card.kw('indestructible') && !row.regen)) {
          row.dead = true; result.dead.add(card);
        } else if (destroy && !card.kw('indestructible') && row.regen) {
          row.regen--; row.removed = true; result.removed.add(card);
        }
      }
      // Lifelink in this damage step is simultaneous with damage, but a later
      // normal-damage lifelink hit cannot rescue first-strike lethal.
      const lifeNow = result.life + (result.lifeGain.get(defender) || 0);
      if (lifeNow <= 0 || result.poison >= 10 || Object.values(result.commanderDamage).some(n => n >= 21)) result.lethal = true;
    }
    result.life += result.lifeGain.get(defender) || 0;
    return result;
  }

  function combatDanger(result) {
    const commander = Math.max(0, ...Object.values(result.commanderDamage));
    return (result.lethal ? 50000 : 0) + Math.max(0, 12 - result.life) * 3 +
      Math.max(0, commander - 15) * 4 + Math.max(0, result.poison - 5) * 8;
  }

  function defenseScore(game, player, outcome, initialLife = player.life) {
    let score = -combatDanger(outcome) - Math.max(0, initialLife - outcome.life) * (initialLife <= 12 ? 2.5 : 0.45);
    for (const card of outcome.dead) score += permanentGameValue(game, card, player) * (card.ctrl === player ? -0.8 : 0.85);
    return score;
  }

  // Greedy emergency defense supplements the declaration beam. Menace pairs
  // are added atomically so pruning never loses the only legal saving block.
  function survivalBlocks(game, player, attackers, potential, initial = {}) {
    let assignments = [];
    let outcome = forecastCombat(game, player, attackers, assignments, initial);
    let score = defenseScore(game, player, outcome, initial.life ?? player.life);
    // A token wall of 1/1s adds nothing but search cost: the greedy pass keeps
    // the bodies that can actually change a forecast. Without this cap the
    // declaration search grew with the square of the board and locked the tab.
    // Što je tabla šira, to pretraga brže eksplodira (runde × napadači ×
    // blokeri × prognoza). Na roju se zato traži manje, ali stabilno jezgro.
    const wide = attackers.length > FORECAST_ATTACKER_LIMIT || potential.length > WIDE_BOARD_SHIELDS;
    const shieldLimit = wide ? WIDE_BOARD_SWARM_SHIELDS : WIDE_BOARD_SHIELDS;
    const targetLimit = wide ? WIDE_BOARD_SWARM_BLOCK_TARGETS : WIDE_BOARD_BLOCK_TARGETS;
    const available = potential.length > shieldLimit
      ? potential.slice().sort((a, b) => (b.toughness - a.toughness) || (b.power - a.power) ||
        (a.iid - b.iid)).slice(0, shieldLimit)
      : potential.slice();
    // Against a swarm only the heaviest attackers are worth a block search;
    // the rest still deal their damage in every forecast.
    const blockCandidates = attackers.length > targetLimit
      ? rankedAttackers(attackers).slice(0, targetLimit) : attackers;
    let rounds = 0;
    const blockedAttackers = new Set();
    while (available.length && rounds++ < shieldLimit) {
      let best = null;
      for (const attacker of blockCandidates) {
        const legal = available.filter(card => game.canBlock(card, attacker) && !assignments.some(pair => pair.blocker === card && pair.attacker === attacker));
        const already = assignments.filter(pair => pair.attacker === attacker).length;
        const bounds = game.blockerBounds(attacker), need = Math.max(1, bounds.min - already);
        if (already >= bounds.max) continue;
        for (let i = 0; i < legal.length; i++) {
          // A minimum-blocker rule needs a complete group before it changes
          // damage; consider a bounded set of legal partner groups.
          const pairs = need > 1 ? combinations(legal.slice(i + 1), need - 1, need - 1, MENACE_PARTNER_LIMIT) : [[]];
          for (const partner of pairs) {
            const picks = [legal[i], ...partner];
            const next = assignments.concat(picks.map(blocker => ({ blocker, attacker })));
            const result = forecastCombat(game, player, attackers, next, initial);
            const value = defenseScore(game, player, result, initial.life ?? player.life);
            if (value > score + 0.01 && (!best || value > best.score)) best = { assignments: next, outcome: result, score: value, picks };
          }
        }
      }
      if (!best) break;
      ({ assignments, outcome, score } = best);
      for (const item of best.assignments) blockedAttackers.add(item.attacker);
      for (const card of best.picks) if (assignments.filter(pair => pair.blocker === card).length >= game.blockerCapacity(card)) available.splice(available.indexOf(card), 1);
    }
    return { assignments, outcome, score };
  }

  function attackPlanSurvival(game, player, assignments) {
    const opponents = player.opponents(game);
    const dead = new Set(), removed = new Set(), eliminated = new Set();
    let life = player.life;
    // The defender's best greedy blocks decide which of OUR attackers die.
    // That loss is charged to the plan here, where the whole declaration is
    // visible, so a 1/1 deathtouch blocker cannot be "absorbed" by fodder.
    let lostValue = 0, killedValue = 0;
    for (const target of new Set(assignments.map(item => item.target))) {
      const defender = target instanceof U.Player ? target : target.ctrl;
      const attackers = assignments.filter(item => item.target === target).map(item => item.card);
      const potential = game.creatures(defender).filter(card => !card.tapped && !dead.has(card));
      const defense = survivalBlocks(game, defender, attackers, potential);
      for (const card of defense.outcome.dead) {
        dead.add(card);
        if (card.ctrl === player) lostValue += permanentGameValue(game, card, player);
        else killedValue += permanentGameValue(game, card, player);
      }
      for (const card of defense.outcome.removed) removed.add(card);
      life += defense.outcome.lifeGain.get(player) || 0;
      // A planeswalker kill is never a player elimination.
      if (target instanceof U.Player && defense.outcome.lethal) eliminated.add(defender);
    }
    if (opponents.length && eliminated.size === opponents.length && life > 0) return 1000000;
    const tradeBalance = killedValue * 0.45 - lostValue * 0.7;
    let blockers = game.creatures(player).filter(card => !card.tapped && !card.cur.cantBlock && !dead.has(card) && !removed.has(card) &&
      !assignments.some(item => item.card === card && !card.kw('vigilance')));
    let position = { life, poison: player.poison || 0, commanderDamage: Object.assign({}, player.commanderDamage), freshTurn: true };
    let danger = 0;
    // Every surviving rival gets a turn before our next untap. Currently
    // tapped/summoning-sick enemy creatures will normally be ready by then.
    const seat = game.players.indexOf(player);
    const ordered = game.players.slice(seat + 1).concat(game.players.slice(0, seat));
    for (const opponent of ordered.filter(row => opponents.includes(row) && !eliminated.has(row))) {
      const attackers = game.creatures(opponent).filter(card => !dead.has(card) && !card.cur.cantAttack &&
        game.canAttackAtAll(card) && game.canAttackTarget(card, player) &&
        !(card.tapped && (Number(card.counters.stun || 0) > 0 || card.def.doesntUntap || card.cur.cantUntap)));
      const defense = survivalBlocks(game, player, attackers, blockers, position);
      position = { life: defense.outcome.life, poison: defense.outcome.poison,
        commanderDamage: defense.outcome.commanderDamage, freshTurn: true };
      danger = Math.max(danger, combatDanger(defense.outcome));
      blockers = blockers.filter(card => !defense.outcome.dead.has(card) && !defense.outcome.removed.has(card));
      if (defense.outcome.lethal) break;
    }
    const exposure = Math.max(0, player.life - position.life);
    return eliminated.size * 120 - danger - exposure * (player.life <= 12 ? 2.5 : player.life <= 20 ? 1 : 0.25) + tradeBalance;
  }

  function generateAttackPlans(game, player, q, config) {
    const allEligible = (q.eligible || []).slice().sort((a, b) => a.iid - b.iid);
    const forced = new Set(q.forced || []);
    // A token swarm is planned through its heaviest bodies (and every forced
    // attacker); the remaining fodder follows the plan's main target below.
    let eligible = allEligible, fodder = [];
    if (allEligible.length > WIDE_BOARD_ATTACKERS) {
      const ranked = allEligible.slice().sort((a, b) => (forced.has(b) - forced.has(a)) || byCombatWeight(a, b));
      eligible = ranked.slice(0, WIDE_BOARD_ATTACKERS).sort((a, b) => a.iid - b.iid);
      fodder = ranked.slice(WIDE_BOARD_ATTACKERS).sort((a, b) => a.iid - b.iid);
    }
    const ctx = attackPlanContext(game, player);
    // Legalne mete se ne mijenjaju unutar jedne deklaracije, a fodder petlja ih
    // je računala iznova za svaku kartu u svakom planu.
    const targetCache = new Map();
    const targetsFor = card => {
      if (targetCache.has(card)) return targetCache.get(card);
      const magicTargets = game.legalDeclarationAttackTargets
        ? game.legalDeclarationAttackTargets(card)
        : (game.legalAttackTargets ? game.legalAttackTargets(card) : q.attackTargets || q.opponents || []);
      const list = game.diplomacyAttackTargetsFor
        ? game.diplomacyAttackTargetsFor(card, magicTargets, forced.has(card))
        : magicTargets;
      targetCache.set(card, list);
      return list;
    };
    const safetyCache = new Map();
    const reserveCache = new Map();
    const ownCreatures = game.creatures(player);
    const rivalThreats = new Map(player.opponents(game).map(rival => [rival,
      game.creatures(rival).filter(card => !card.cur.cantAttack && game.canAttackAtAll(card) && game.canAttackTarget(card, player))
        .sort((a, b) => b.power - a.power || a.iid - b.iid).slice(0, WIDE_BOARD_SHIELDS)]));
    // Beam pruning uses a cheap shield estimate. Running a complete defensive
    // search for every partial declaration multiplied the cost on wide boards.
    // Full first/normal damage forecasts are reserved for the final candidates.
    const reserve = assignments => {
      const key = assignments.filter(item => !item.card.kw('vigilance')).map(item => item.card.iid).join(',');
      if (reserveCache.has(key)) return reserveCache.get(key);
      const attacking = new Set(assignments.filter(item => !item.card.kw('vigilance')).map(item => item.card));
      const shields = ownCreatures.filter(card => !card.tapped && !card.cur.cantBlock && !attacking.has(card))
        .sort((a, b) => b.toughness - a.toughness || a.iid - b.iid).slice(0, WIDE_BOARD_SHIELDS);
      let incoming = 0;
      for (const rival of player.opponents(game)) {
        const available = shields.slice();
        const threats = rivalThreats.get(rival) || [];
        for (const threat of threats) {
          const hit = Math.max(0, game.dmgAmount(threat, 'first') || game.dmgAmount(threat, 'normal')) * (threat.kw('double strike') ? 2 : 1);
          const legal = available.filter(card => game.canBlock(card, threat)).sort((a, b) => b.toughness - a.toughness || a.iid - b.iid);
          const need = game.blockerBounds(threat).min;
          if (legal.length < need) incoming += hit;
          else {
            const chosen = legal.slice(0, need);
            if (threat.kw('trample')) incoming += Math.max(0, hit - chosen.reduce((sum, card) => sum + (threat.kw('deathtouch') ? 1 : card.toughness), 0));
            for (const card of chosen) available.splice(available.indexOf(card), 1);
          }
        }
      }
      const score = -incoming * (player.life <= 12 ? 8 : 0.35);
      reserveCache.set(key, score);
      return score;
    };
    const safety = assignments => {
      const key = actionKey({ kind: 'declareAttackers', assignments });
      if (!safetyCache.has(key)) safetyCache.set(key, attackPlanSurvival(game, player, assignments));
      return safetyCache.get(key);
    };
    let beam = [{ assignments: [], score: 0, committed: new Map() }];
    for (const attacker of eligible) {
      const targets = targetsFor(attacker);
      const next = [];
      for (const node of beam) {
        // "Must attack if able" ne zahtijeva nemoguću deklaraciju. Ako ovaj
        // napadač nema nijednu legalnu metu, plan mora ostati validan umjesto
        // da cijeli combat generator ostane bez akcije.
        if (!forced.has(attacker) || !targets.length) next.push({ assignments: node.assignments.slice(), score: node.score, committed: node.committed });
        for (const target of targets) {
          const defender = target instanceof U.Player ? target : target.ctrl;
          const prior = node.assignments.filter(item =>
            (item.target instanceof U.Player ? item.target : item.target.ctrl) === defender).length;
          // Koliko štete je plan već uperio u ovog branioca — višak preko
          // njegovog života više ne donosi bodove.
          const already = node.committed.get(defender) || 0;
          const assessment = attackAssignmentAssessment(game, player, attacker, target, prior, ctx, already);
          const committed = new Map(node.committed);
          committed.set(defender, already + Math.max(0, assessment.expectedDamage || 0));
          next.push({
            assignments: node.assignments.concat({ card: attacker, target }),
            score: node.score + assessment.score,
            committed,
          });
        }
      }
      beam = next.sort((a, b) => (b.score + reserve(b.assignments)) - (a.score + reserve(a.assignments)) || actionKey({ kind: 'declareAttackers', assignments: a.assignments }).localeCompare(actionKey({ kind: 'declareAttackers', assignments: b.assignments })))
        .slice(0, config.beamWidth);
    }
    if (!beam.length) beam = [{ assignments: [], score: 0, committed: new Map() }];
    if (!beam.some(plan => plan.assignments.length === 0) && !forced.size) beam.push({ assignments: [], score: 0, committed: new Map() });
    // Keep concentrated finish attempts even if their nonlethal prefixes were
    // pruned for exposing defense. A safe partial attack must not hide a win.
    for (const target of player.opponents(game)) {
      const assignments = [];
      let score = 0, legal = true, committedHere = 0;
      for (const card of eligible) {
        const targets = targetsFor(card);
        if (targets.includes(target)) {
          const assessment = attackAssignmentAssessment(game, player, card, target, assignments.length, ctx, committedHere);
          score += assessment.score;
          committedHere += Math.max(0, assessment.expectedDamage || 0);
          assignments.push({ card, target });
        } else if (forced.has(card) && targets.length) { legal = false; break; }
      }
      if (legal && assignments.length) beam.push({ assignments, score, committed: new Map([[target, committedHere]]) });
    }
    // Fodder joins the plan's main target (the one most of the planned bodies
    // attack) when it may legally attack there; a plan that stays home keeps
    // the fodder home as well. A second copy of each attacking plan without
    // the fodder keeps a measured attack available.
    if (fodder.length) {
      const extended = [];
      for (const plan of beam) {
        if (!plan.assignments.length) { extended.push(plan); continue; }
        const tally = new Map();
        for (const item of plan.assignments) tally.set(item.target, (tally.get(item.target) || 0) + 1);
        const main = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
        const extra = [];
        for (const card of fodder) {
          if (targetsFor(card).includes(main)) extra.push({ card, target: main });
        }
        extended.push(plan);
        // Fodder ima smisla samo dok šteta još nedostaje. Kad je plan već
        // smrtonosan, dodatna tijela ostaju kod kuće kao blokeri.
        const committedOnMain = plan.committed ? (plan.committed.get(main) || 0) : 0;
        const mainLife = main instanceof U.Player ? main.life : Infinity;
        const fodderWorth = committedOnMain >= mainLife ? -0.4 : 0.9;
        if (extra.length) extended.push({ assignments: plan.assignments.concat(extra), score: plan.score + extra.length * fodderWorth, committed: plan.committed });
      }
      beam = extended;
    }
    // Prognoza preživljavanja je najskuplji dio deklaracije. Na sporijoj mašini
    // i najširoj tabli ne smije držati glavnu nit: kad se budžet potroši,
    // preostali planovi zadrže svoj combat skor umjesto pune prognoze.
    // Budžet vrijedi samo za široku tablu; uske deklaracije ostaju u potpunosti
    // determinističke jer se prognoza tamo ionako računa u milisekundama.
    const survivalDeadline = allEligible.length > FORECAST_ATTACKER_LIMIT
      ? now() + COMBAT_SURVIVAL_BUDGET_MS : Infinity;
    beam = beam.filter(plan => game.attackGroupLegal(plan.assignments.map(item => item.card)));
    if (!beam.length) beam = [{assignments: [], score: 0, committed: new Map()}];
    const ordered = beam.slice().sort((a, b) => b.score - a.score);
    const survival = new Map();
    for (const plan of ordered) {
      survival.set(plan, survival.size === 0 || now() < survivalDeadline ? safety(plan.assignments) : 0);
    }
    let plans = beam.map(plan => ({ kind: 'declareAttackers', assignments: plan.assignments,
      _combatScore: plan.score, _survivalScore: survival.get(plan) || 0 }));
    const promisedTarget = game.diplomacyRequiredAttackTarget && game.diplomacyRequiredAttackTarget(player);
    if (promisedTarget) {
      const canFulfill = eligible.some(attacker => game.canAttackTarget(attacker, promisedTarget) &&
        (!game.diplomacyAttackBlocked || !game.diplomacyAttackBlocked(player, promisedTarget)));
      if (canFulfill) {
        const fulfilling = plans.filter(plan => plan.assignments.some(item =>
          (item.target instanceof U.Player ? item.target : item.target && item.target.ctrl) === promisedTarget));
        if (fulfilling.length) plans = fulfilling;
      }
    }
    return plans;
  }

  function generateBlockPlans(game, player, q, config) {
    const allPotential = (q.potential || []).slice().sort((a, b) => a.iid - b.iid);
    const attackers = (q.attackers || []).slice();
    // Sto blokera je isto što i sto poteza u beamu: cijena raste linearno po
    // kandidatu, a razlika u odbrani ne. Traže se najkorisnija tijela.
    const potential = allPotential.length > WIDE_BOARD_SHIELDS
      ? allPotential.slice().sort((a, b) => (b.toughness - a.toughness) || (b.power - a.power) ||
        (a.iid - b.iid)).slice(0, WIDE_BOARD_SHIELDS).sort((a, b) => a.iid - b.iid)
      : allPotential;
    // A swarm is forecast in full, but block candidates are limited to its
    // heaviest bodies so the beam stays bounded.
    const blockCandidates = attackers.length > WIDE_BOARD_BLOCK_TARGETS
      ? rankedAttackers(attackers).slice(0, WIDE_BOARD_BLOCK_TARGETS) : attackers;
    const score = assignments => defenseScore(game, player, forecastCombat(game, player, attackers, assignments));
    // Ključ plana je determinističan tie-break, ali njegovo građenje iz stotinu
    // dodjela unutar komparatora je samo po sebi bilo skuplje od prognoze.
    const planKey = plan => plan._key !== undefined ? plan._key
      : (plan._key = actionKey({ kind: 'declareBlockers', assignments: plan.assignments }));
    let beam = [{ assignments: [], score: 0 }];
    for (const blocker of potential) {
      const next = [];
      for (const node of beam) {
        next.push({ assignments: node.assignments.slice(), score: score(node.assignments) });
        const legal = blockCandidates.filter(attacker => game.canBlock(blocker, attacker) && node.assignments.filter(pair => pair.attacker === attacker).length < game.blockerBounds(attacker).max);
        const capacity = Math.min(legal.length, game.blockerCapacity(blocker));
        const groups = capacity === 1 ? legal.map(attacker => [attacker]) : combinations(legal, 1, capacity, Math.max(config.beamWidth * 2, 12));
        if (capacity > 1) groups.push(legal.slice(0, capacity));
        for (const group of groups) {
          const assignments = node.assignments.concat(group.map(attacker => ({blocker, attacker})));
          next.push({assignments, score: score(assignments)});
        }
      }
      beam = next.sort((a, b) => b.score - a.score || planKey(a).localeCompare(planKey(b)))
        .slice(0, config.beamWidth);
    }
    beam.push(survivalBlocks(game, player, attackers, allPotential));
    beam = beam.filter(plan => game.blockDeclarationLegal(attackers, plan.assignments));
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
        if (entry.manaAbility) continue;
        // Crew ostaje legalno ponovljiv rules-engineu (bitno za priority,
        // trigger i ljudske izbore), ali lokalni AI nema taktičku korist od
        // ponovnog crewovanja već animiranog Vehiclea. Bez ovog AI-only filtera
        // bi svaki novi untapped creature plaćao isti Crew još jednom.
        if (entry.crew && (entry.card.is('Creature') || entry.card.meta.crewedTurn === game.turnNo)) continue;
        actions.push({ kind: 'activate', entry });
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
      let ranked = (q.candidates || []).slice().sort((a, b) => targetValue(game, player, b, q) - targetValue(game, player, a, q) || targetStableKey(a).localeCompare(targetStableKey(b)));
      if (q.spec && q.spec.distinctCtrl) {
        // najviše jedna meta po kontroloru — zadrži najbolju po svakom
        const perCtrl = new Set();
        ranked = ranked.filter(target => {
          const key = target && target.ctrl ? target.ctrl.idx : Symbol();
          if (perCtrl.has(key)) return false;
          perCtrl.add(key);
          return true;
        });
      }
      // A search-width limit cannot turn a mandatory twenty-target spell into
      // an empty choice. Keep enough distinct legal candidates to pay the
      // announced target count; optional targets remain bounded as before.
      ranked = ranked.slice(0, Math.max(config.targetLimit, q.min || 0));
      if (q.aiHint && ['proliferate', 'depthshaker'].includes(q.aiHint.goal)) {
        const strategic = ranked.filter(target => targetValue(game, player, target, q) > 0).slice(0, q.max || ranked.length);
        actions.push({ kind: 'chooseTargets', picks: strategic });
      }
      const maxTargets = affordableStriveTargets(game, player, q, Math.min(q.max ?? 1, ranked.length));
      for (const picks of combinations(ranked, q.min || 0, maxTargets, Math.max(config.beamWidth * 2, 12))) actions.push({ kind: 'chooseTargets', picks });
    } else if (q.type === 'chooseCards') {
      const allRanked = (q.from || []).slice().sort((a, b) => choiceCardValue(game, player, b, q) - choiceCardValue(game, player, a, q) || a.iid - b.iid);
      const ranked = allRanked.slice(0, Math.max(config.targetLimit, q.min || 0, q.max || 1));
      if (q.aiHint && q.aiHint.kind === 'genesisWave') {
        const picks = ranked.filter(card => !((card.def.super || []).includes('Legendary') &&
          game.bf().some(existing => existing.ctrl === player && existing.name === card.name)));
        actions.push({ kind: 'chooseCards', picks });
      }
      if (q.aiHint && q.aiHint.kind === 'crew' && Number.isFinite(q.aiHint.need)) {
        const picks = minimalCrewPayment(game, player, ranked, q.aiHint.need);
        if (picks && picks.length >= (q.min || 0) && picks.length <= (q.max ?? ranked.length)) actions.push({ kind: 'chooseCards', picks });
      }
      for (const picks of combinations(ranked, q.min || 0, q.max || 1, Math.max(config.beamWidth * 2, 12))) {
        if (!q.aiHint?.canPayRemaining || q.aiHint.canPayRemaining(picks)) actions.push({ kind: 'chooseCards', picks });
      }
      if (typeof q.aiHint?.canPayRemaining === 'function' && !actions.length) {
        const picks = MTG.firstPayableAICardSelection(q, allRanked);
        if (picks) actions.push({kind:'chooseCards',picks});
      }
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
      const legalValues = Array.isArray(q.values) && q.values.length
        ? [...new Set(q.values.map(Number))].filter(value => value >= min && value <= max).sort((a, b) => a - b)
        : null;
      const preferredValues=Array.isArray(q.preferredXValues)&&q.preferredXValues.length
        ? [...new Set(q.preferredXValues.map(Number))].filter(value=>Number.isInteger(value)&&value>=min&&value<=max).sort((a,b)=>a-b)
        : null;
      const inferredThresholds = [];
      if (q.aiHint && q.aiHint.kind === 'oracleXDamage' && q.aiHint.card) {
        const specs = game.spellTargetSpecs(q.aiHint.card, { xVal: max }, player);
        const candidates = specs && specs[0] ? game.legalTargets(specs[0], q.aiHint.card, player) : [];
        for (const target of candidates) {
          if (target instanceof U.CardInst && target.ctrl !== player && target.is('Creature')) {
            inferredThresholds.push(Math.max(1, target.toughness - target.damage));
          } else if (target instanceof U.CardInst && target.ctrl !== player && target.is('Planeswalker')) {
            inferredThresholds.push(Math.max(1, Number(target.counters && target.counters.loyalty) || 0));
          } else if (target instanceof U.Player && target !== player) inferredThresholds.push(target.life);
        }
      } else if (q.aiHint && q.aiHint.kind === 'oracleXDebuff' && q.aiHint.card) {
        const specs = game.spellTargetSpecs(q.aiHint.card, { xVal: max }, player);
        const candidates = specs && specs[0] ? game.legalTargets(specs[0], q.aiHint.card, player) : [];
        for (const target of candidates) {
          if (target instanceof U.CardInst && target.ctrl !== player && target.is('Creature')) {
            inferredThresholds.push(Math.max(1, Number(target.power) || 0));
          }
        }
      }
      const strategic = legalValues || preferredValues || [...new Set([min, max, Math.min(max, min + 1), Math.min(max, 3), Math.min(max, 5),
        ...((q.thresholds || []).map(Number)), ...inferredThresholds])]
        .filter(value => value >= min && value <= max).sort((a, b) => a - b);
      for (const value of strategic) actions.push({ kind: 'chooseX', value });
    } else if (q.type === 'mulligan') {
      actions.push({ kind: 'mulligan', value: false }, { kind: 'mulligan', value: true });
    } else if (q.type === 'bottomCards') {
      for (const picks of combinations(player.hand, q.n || 0, q.n || 0, Math.max(config.beamWidth * 2, 12))) actions.push({ kind: 'bottomCards', picks });
    } else if (q.type === 'scry') {
      const cards = q.cards || [];
      const keep = cards.filter(card => choiceCardValue(game, player, card, q) >= 2.2);
      actions.push({ kind: 'scry', value: { top: keep, bottom: cards.filter(card => !keep.includes(card)) } });
      const reserveFromSelection = Math.max(0, Number(q.drawReserve || 0) -
        Math.max(0, player.library.length - cards.length));
      if (reserveFromSelection > 0 && reserveFromSelection < cards.length) {
        const reserve = cards.slice().sort((a, b) =>
          choiceCardValue(game, player, b, q) - choiceCardValue(game, player, a, q) || a.iid - b.iid)
          .slice(0, reserveFromSelection);
        actions.push({ kind: 'scry', value: { top: reserve, bottom: cards.filter(card => !reserve.includes(card)) } });
      }
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

  function affordableStriveTargets(game, player, q, maximum) {
    // Strive is paid only when casting the original spell. A spell copy keeps
    // its target count and may retarget even when its controller has no mana.
    if (!q.src?.def.strive || !q.so || q.so.isCopy) return maximum;
    const castOpts = Object.assign({}, q.so.castOpts || {}, { from: q.so.from });
    const base = game.spellCost(player, q.src, castOpts);
    const extra = U.parseCost(q.src.def.strive);
    for (let count = maximum; count >= 0; count--) {
      const additional = Math.max(0, count - 1);
      const cost = Object.assign({}, base, {
        generic: (base.generic || 0) + (extra.generic || 0) * additional,
        pips: (base.pips || []).concat(...Array.from({ length: additional }, () => extra.pips || [])),
      });
      if (game.canPayMana(player, cost, { card: q.src, castOpts, xVal: q.so.x || 0 })) return count;
    }
    return 0;
  }

  function temporaryCopyValue(game, player, target, hint) {
    if (!(target instanceof U.CardInst) || target.ctrl !== player) return -100;
    // Copy the printed/copiable body, not counters, tapped state or temporary
    // animation. In particular, a 0/0 Army does not copy its +1/+1 counters.
    const base = target.isCopyOf || target.def;
    const roles = inferCardSemantics(base).roles;
    const hasEntry = (base.triggers || []).some(trigger => trigger.on === 'etb' &&
      (!trigger.filter || trigger.filter(game, target, { card: target })));
    const entryValue = hasEntry && roles.some(role =>
      ['card-draw', 'single-target-removal', 'ramp', 'token-maker', 'recursion'].includes(role)) ? 5 : 0;
    const legendConflict = (base.super || []).includes('Legendary') &&
      !game.bf().some(card => card.ctrl === player && card.def.ignoreLegendRuleCreatures);
    const hasBody = (base.types || []).includes('Creature') && !legendConflict &&
      (Number.isNaN(Number(base.toughness)) || Number(base.toughness) > 0);
    const attacksNow = hasBody && hint.haste && game.turnPlayer === player && game.phase === 'main1' &&
      !(base.kws || []).includes('defender') && !base.cantAttack;
    const value = entryValue + (attacksNow ? 4 + Math.max(0, Number(base.power) || 0) * 1.5 : 0);
    return value > 0 ? value : -100;
  }

  function mandatoryCastTriggerDraws(game, player, card) {
    const isInstantSorcery = card.is('Instant') || card.is('Sorcery');
    const data = {
      player, card, mv: card.mv,
      isInstantSorcery,
      isCreature: card.is('Creature'),
    };
    const battlefield = game.bf();
    let draws = 0;
    for (const source of battlefield.filter(permanent => permanent.ctrl === player)) {
      const rules = source.def.mandatoryCastDraw
        ? (Array.isArray(source.def.mandatoryCastDraw)
          ? source.def.mandatoryCastDraw : [source.def.mandatoryCastDraw])
        : [];
      for (const rule of rules) {
        const event = rule.event || 'cast';
        if (event === 'castIS' && !isInstantSorcery) continue;
        if (rule.filter && !rule.filter(game, source, data)) continue;
        const nativeDraws = Math.max(0, Number(rule.n) || 0);
        if (!nativeDraws) continue;
        let times = 1;
        const castOrCopyIS = isInstantSorcery &&
          (event === 'cast' || event === 'castIS' || event.startsWith('cast'));
        if (castOrCopyIS) {
          times += battlefield.filter(doubler =>
            doubler.ctrl === source.ctrl && doubler.def.doublesMagecraft).length;
        }
        for (const doubler of battlefield) {
          if (doubler.ctrl === source.ctrl && doubler.def.doubleTriggerFilter &&
            doubler.def.doubleTriggerFilter(game, doubler, source, event, data)) times++;
        }
        draws += nativeDraws * times;
      }
    }
    return draws;
  }

  // ---- Spell-heavy playbook ------------------------------------------------
  // A deck built around instants and sorceries loses in a very specific way:
  // it spends every card in its own main phase, so on the three turns in
  // between it holds no answer and blocks with nothing. These helpers let the
  // scorer see what a spellslinger player sees — payoffs on the board that make
  // each spell worth more, and answers in hand that are worth more held.
  // The shapes that actually occur in the catalog: "a noncreature spell",
  // "an instant or sorcery spell", "or copy an instant or sorcery spell",
  // "your second spell each turn", plain "a spell". Not "a creature spell",
  // not "a spell that targets this creature", not artifact/enchantment casts.
  const CAST_PAYOFF_RE = /whenever you cast (?:or copy )?(?:a noncreature spell|an instant or sorcery spell|an instant\b|a sorcery\b|your (?:first|second) spell each turn|a spell(?! that targets| from| with mana value| during))|magecraft/;
  function spellCastPayoffs(game, player) {
    return game.bf().filter(permanent => permanent.ctrl === player &&
      (CAST_PAYOFF_RE.test(textOf(permanent.def)) || permanent.kw('prowess'))).length;
  }
  const HELD_ANSWER_ROLES = ['counterspell', 'single-target-removal', 'direct-damage', 'protection'];
  function isInstantSpeedCard(card) {
    return card.is('Instant') || card.kw('flash') || (card.def.kws || []).includes('flash');
  }
  function heldInstantAnswers(player, except) {
    return (player.hand || []).filter(card => card !== except && isInstantSpeedCard(card) && !card.is('Creature') &&
      (inferCardSemantics(card.def).roles.some(role => HELD_ANSWER_ROLES.includes(role)) ||
        (card.def.oracleImplementation || []).some(operation => operation.kind === 'spell-fog')));
  }
  function cheapestManaValue(cards) {
    return cards.length ? Math.min(...cards.map(card => U.mv(card.def.cost || ''))) : 0;
  }
  // How much a deck cares about keeping answers up: interaction density plus a
  // nudge for decks whose theme is casting spells at all.
  function answerHoldWeight(profile) {
    const density = profile && profile.interactionDensity || 0;
    const slinger = profile && profile.primarySynergies && profile.primarySynergies.includes('spellslinger') ? 0.6 : 0;
    return clamp(density * 8 + slinger, 0, 2.2);
  }
  // Is there anything on the table (or coming from a full hand) worth keeping
  // an answer for? Early empty boards are not.
  function tableWorthAnswering(game, player) {
    return player.opponents(game).some(opponent => !opponent.lost && (
      opponent.hand.length >= 2 ||
      game.bf().some(permanent => permanent.ctrl === opponent && !permanent.is('Land') &&
        (permanent.is('Creature') && Math.max(0, permanent.power || 0) >= 3 || permanentGameValue(game, permanent, player) >= 6))));
  }
  function visibleAttackersAgainst(game, player) {
    return player.opponents(game).filter(opponent => !opponent.lost)
      .flatMap(opponent => game.creatures(opponent))
      .filter(creature => Math.max(0, creature.power || 0) >= 2 && !(creature.cur && creature.cur.cantAttack)).length;
  }
  MTG.botSpellCastPayoffs = spellCastPayoffs;
  MTG.botHeldInstantAnswers = heldInstantAnswers;

  function counterRemovalValue(card, player, kind, amount = 1) {
    const harmful = new Set(['-1/-1', '-0/-1', 'stun', 'finality', 'doom', 'bounty']);
    const goodForController = !harmful.has(kind);
    return (card.ctrl === player ? (goodForController ? -1 : 1) : (goodForController ? 1 : -1)) * amount;
  }

  function blightRecipientValue(game, player, card, amount = 1) {
    const value = permanentGameValue(game, card, player);
    const dies = diesAfterGlobalPump(card, Number(card.toughness || 0) - amount);
    const oracle = String(card.def.oracle || '').toLowerCase();
    if (dies) {
      // Persist cannot return a creature that dies with these -1/-1 counters.
      const deathValue = /when(?:ever)? .*dies|when this creature dies|undying/.test(oracle) ? 7 : 0;
      const tokenValue = card.isToken ? 4 : 0;
      return -value + deathValue + tokenValue - 4;
    }
    // A surviving 6/6 becomes a 4/4; its engine text and the rest of its body
    // are not sacrificed. Charge only the lost stats, in the same units as
    // permanentGameValue, instead of the value of the entire permanent.
    const powerLost = Math.min(amount, Math.max(0, Number(card.power) || 0));
    const toughnessLost = Math.min(amount, Math.max(0, Number(card.toughness) || 0));
    return -(powerLost * 0.8 + toughnessLost * 0.28) * (card.ctrl === player ? 1.03 : 1);
  }

  function damageProtectionSaves(card) {
    if (!(card && card.is)) return false;
    if (Number(card.counters && card.counters.shield || 0) > 0) return true;
    return card.is('Creature') && (card.kw('indestructible') || Number(card.regenShield || 0) > 0);
  }

  function diesAfterGlobalPump(card, toughness) {
    if (toughness <= 0) return true;
    const lethalMarked = Number(card.damage || 0) >= toughness ||
      (card.deathtouched && Number(card.damage || 0) > 0);
    return lethalMarked && !damageProtectionSaves(card);
  }

  function globalPumpNetEffect(game, player, operation) {
    const power = Number(operation.power || 0);
    const toughness = Number(operation.toughness || 0);
    let board = 0, combat = 0;
    for (const creature of game.bf().filter(card => card.is('Creature'))) {
      const side = creature.ctrl === player ? 1 : -1;
      const currentToughness = Number(creature.toughness || 0);
      const beforeDies = diesAfterGlobalPump(creature, currentToughness);
      const afterDies = diesAfterGlobalPump(creature, currentToughness + toughness);
      const deathValue = 6 + permanentGameValue(game, creature, player);

      // A toughness reduction can kill through indestructible at zero, while
      // marked damage uses the normal destroy protections. Score the exact
      // controller-relative board swing instead of treating every global
      // negative modifier as a one-sided wipe.
      if (beforeDies !== afterDies) {
        const beforeValue = beforeDies ? 0 : deathValue;
        const afterValue = afterDies ? 0 : deathValue;
        board += side * (afterValue - beforeValue);
      } else if (!afterDies) {
        board += side * (power * 0.45 + toughness * 0.3);
      }
      if (afterDies || !game.combat) continue;

      // In a live combat the same symmetric modifier can help the wrong side:
      // power matters most for attackers, while both stats matter to blockers.
      if (creature.attacking) combat += side * (power * 1.35 + toughness * 0.55);
      if (creature.blocking !== null && creature.blocking !== undefined && creature.blocking !== false) {
        combat += side * (power * 0.9 + toughness * 0.85);
      }
    }
    return { board, combat, total: board + combat };
  }

  function indestructibleStopsDestroy(card) {
    return card instanceof U.CardInst && card.zone === 'battlefield' && card.kw('indestructible');
  }

  // ---- Ward -------------------------------------------------------------
  // Ward nije obična cijena mete: ako ostane neplaćen, spell ili sposobnost
  // biva counterovana. Bot je zbog toga bacao removal za jednu-dvije mane na
  // metu sa Ward {4} i sam sebi ubijao potez.
  function wardOf(target) {
    return target instanceof U.CardInst && target.cur ? target.cur.wardCost : null;
  }

  function wardManaAmount(ward) {
    if (!ward || !ward.mana) return 0;
    const cost = U.parseCost(ward.mana);
    return Math.max(0, cost.generic || 0) + (cost.pips || []).length;
  }

  // Koliko mane ovaj prozor tek treba potrošiti. Mete se biraju PRIJE plaćanja,
  // pa mana koja se vidi na stolu još uvijek uključuje cijenu samog spella.
  function reservedManaFor(game, player, q) {
    const source = q && q.src;
    if (!source || !q.so || q.so.kind !== 'spell') return 0;
    try {
      const cost = game.spellCost(player, source, { from: source.zone });
      return Math.max(0, cost.generic || 0) + (cost.pips || []).length;
    } catch (error) {
      return U.mv(source.def && source.def.cost || '');
    }
  }

  function canPayWard(game, player, ward, reserved) {
    if (!ward) return true;
    if (ward.sacLegendary) {
      return game.bf().some(card => card.ctrl === player && (card.cur.super || []).includes('Legendary') &&
        (card.is('Artifact') || card.is('Creature')));
    }
    if (ward.blight) return game.creatures(player).length > 0;
    if (ward.life) return player.life > Number(ward.life) + 3;
    if (ward.discard) return player.hand.length > 0;
    const need = wardManaAmount(ward);
    if (!need) return true;
    return availableManaEstimate(game, player) - (reserved || 0) >= need;
  }

  // Cijena plaćenog warda u istim jedinicama kao ostatak evaluacije mete.
  function wardPrice(game, player, ward) {
    if (!ward) return 0;
    if (ward.sacLegendary) return 12;
    if (ward.blight) {
      const values = game.creatures(player).map(card => blightRecipientValue(game, player, card, Number(ward.blight)));
      return values.length ? -Math.max(...values) : Number.POSITIVE_INFINITY;
    }
    if (ward.life) return Number(ward.life || 0) * (player.life <= 15 ? 1.6 : 0.6);
    if (ward.discard) return 3.5;
    return wardManaAmount(ward) * 1.4;
  }

  function wardTargetAdjustment(game, player, target, q) {
    const ward = wardOf(target);
    if (!ward || target.ctrl === player) return 0;
    if (q && q.so && q.so.kind === 'spell' && (q.so.card || q.src) && MTG.isUncounterable &&
      MTG.isUncounterable(game, Object.assign({ card: q.src, ctrl: player }, q.so))) return 0;
    const reserved = reservedManaFor(game, player, q);
    if (!canPayWard(game, player, ward, reserved)) return -1000;
    return -wardPrice(game, player, ward);
  }
  MTG.botWardTargetAdjustment = wardTargetAdjustment;

  function blightWardBenefit(game, player, q) {
    const target = q.aiHint.target;
    const original = q.aiHint.stackObject || game.stack.find(object => object.ctrl === player &&
      (object.targets || []).flat().includes(target));
    // Older/direct controller prompts do not carry an original effect. Keep
    // their conservative baseline, never infer removal just from an expensive
    // warded permanent. Real ward prompts carry the public stack object.
    if (!original) return 6;
    if (original.countered) return 0;
    const source = original.card || original.srcCard || original.ctx && original.ctx.src;
    let specs = original.targetSpecs || original.ctx && original.ctx.boundTargetSpecs;
    if (!specs && original.kind === 'spell' && source) {
      specs = game.spellTargetSpecs(source, original.castOpts || {}, player);
    }
    if (!specs || !source) return 0;
    // Ward counters the whole object, not merely its warded target. The
    // original Ool may have left while Decimate's other targets still matter.
    // Reuse resolution's legality check, including captured zone versions, so
    // a blinked permanent is not mistaken for its original targeted object.
    const checked = game.revalidateTargets(original.targets || original.ctx && original.ctx.targets || [],
      specs, source, player, original.targetIdentities || original.ctx && original.ctx.targetIdentities);
    let benefit = 0;
    for (const [index, picks] of checked.targets.entries()) {
      const spec = specs[index];
      if (!spec || !spec.aiHint) continue;
      for (const remaining of (Array.isArray(picks) ? picks : [picks]).filter(Boolean)) {
        benefit += baseTargetValue(game, player, remaining, {
          src: source, so: original, aiHint: spec.aiHint,
        });
      }
    }
    return Math.max(0, benefit);
  }

  function targetValue(game, player, target, q) {
    const base = baseTargetValue(game, player, target, q);
    // Nema smisla plaćati ward za metu koju ionako ne želimo pogoditi.
    if (base <= 0) return base;
    return base + wardTargetAdjustment(game, player, target, q);
  }

  function oracleBasePTTargetValue(game, player, target, q) {
    if (!(target instanceof U.CardInst) || typeof q.aiHint?.basePT !== 'function') return -1000;
    const change = q.aiHint.basePT(game, target, player, q.src);
    if (!change || !target.is('Creature') && !change.becomesCreature) return -1000;
    const creature = target.is('Creature'), hostile = target.ctrl !== player;
    const oldPower = Number(target.power) || 0, oldToughness = Number(target.toughness) || 0;
    const power = change.power === undefined ? oldPower : Number(change.power) + oldPower - (Number(target.cur?.basePower) || 0);
    const toughness = change.toughness === undefined ? oldToughness : Number(change.toughness) + oldToughness - (Number(target.cur?.baseToughness) || 0);
    if (!Number.isFinite(power) || !Number.isFinite(toughness)) return -1000;
    const value = permanentGameValue(game, target, player);
    if (diesAfterGlobalPump(target, toughness)) return hostile ? 20 + value * 1.5 : -1000;
    const keywords = (change.keywords || []).filter(keyword => !target.kw(keyword));
    const keywordValue = keywords.reduce((sum, keyword) => sum + ({ flying: 3, trample: 2, haste: target.sick ? 3 : 0,
      vigilance: 2, lifelink: player.life < 15 ? 4 : 2, deathtouch: 3, 'double strike': 5 }[keyword] || 1), 0);
    let improvement = (power - (creature ? oldPower : 0)) * 1.3 +
      (toughness - (creature ? oldToughness : 0)) * 0.6 + keywordValue;
    if (!creature && change.temporary && target.tapped) improvement *= 0.15;
    return hostile ? -improvement : improvement;
  }
  MTG.oracleBasePTTargetValue = oracleBasePTTargetValue;

  function baseTargetValue(game, player, target, q) {
    if(target instanceof U.CardInst&&q.aiHint?.oracleTargetTapped!==undefined&&target.tapped!==q.aiHint.oracleTargetTapped)return -1000;
    if (q && q.aiHint && q.aiHint.avoidCostSource && target === q.src) return -1000;
    const avoidedCopyTargets = q && q.aiHint && q.aiHint.copyTargetPolicy === 'spread'
      ? q.aiHint.copyUsedTargetIids || [] : [];
    if (target instanceof U.CardInst && avoidedCopyTargets.includes(target.iid)) return -1000;
    const hint = q.aiHint && q.aiHint.goal || '';
    if (target instanceof U.Player) {
      if (hint === 'proliferate') {const poison=target.poison||0,energy=target.counters?.energy||0;return target===player?(poison?(-12-poison*3):(energy?8:-100)):(poison?8+poison*2:0)-(energy?8:0);}
      if (hint === 'drawSelf') return target === player ? 100 : -100;
      if (hint === 'discard') {
        if (target === player) return -1000;
        const amount = Math.max(1, Number(q.aiHint && q.aiHint.amount || 1));
        const effective = Math.min(amount, target.hand.length);
        return effective ? 8 * effective + playerThreatForGame(game, player, target) * 0.2 : -1000;
      }
      if (hint === 'marduTokenCount') return game.creatures(target).length * 12 - target.idx * 0.001;
      if (hint === 'lifeSwap') {
        // Tree of Perdition: razmjena život ↔ žilavost. Ima smisla SAMO kad
        // protivnik gubi život (life > toughness) — inače ga liječimo.
        const swapToughness = q.src && Number(q.src.toughness) || 13;
        const delta = target.life - swapToughness;
        return delta <= 0 ? -100 : delta * 2.2;
      }
      const threat = playerThreatForGame(game, player, target);
      if (hint === 'damage') {
        if (target === player) return -100;
        const rawAmount = q.aiHint && q.aiHint.amount;
        const amount = rawAmount === 'X' ? Number(q.aiHint && q.aiHint.x || 0) : Number(rawAmount || 0);
        if (amount > 0) {
          const lethal = amount >= target.life;
          // Actual elimination dominates generic threat ranking. Among lethal
          // choices, retain a small preference for the more dangerous player
          // and avoid wasting excess damage when both kills are equivalent.
          if (lethal) return 220 + threat * 0.2 - Math.max(0, amount - target.life) * 0.5;
          return threat * 0.45 + Math.min(amount, target.life) * 0.8;
        }
      }
      const lethal = target.life <= 7 ? 12 : 0;
      const friendly = target === player ? (/gain|protect|draw/i.test(hint) ? 20 : -30) : 0;
      // A printed "target player" benefit (draw, counters, life) is kept by the
      // bot; only an explicit gift goal hands it to somebody else.
      if (/gift|benefit/i.test(hint) || hint === 'self') return target === player ? 24 : -(threat * 0.45);
      return threat * 0.45 + lethal + friendly;
    }
    if (target instanceof U.CardInst) {
      if (hint === 'oracleBasePT') return oracleBasePTTargetValue(game, player, target, q);
      const value = permanentGameValue(game, target, player);
      const hostile = target.ctrl !== player;
      if (q.aiHint && q.aiHint.temporaryCopy) return temporaryCopyValue(game, player, target, q.aiHint);
      if (q.aiHint && q.aiHint.kind === 'equipTarget') {
        if (hostile) return -1000;
        const equipment = q.aiHint.card;
        const grants = equipment && equipment.def && equipment.def.oracleImplementation || [];
        const attachment = grants.filter(operation => operation.kind === 'attachment-grant');
        const power = attachment.reduce((sum, operation) => sum + Number(operation.power || 0), 0);
        const toughness = attachment.reduce((sum, operation) => sum + Number(operation.toughness || 0), 0);
        if (Number(target.toughness || 0) - Number(target.damage || 0) + toughness <= 0) return -1000;
        return value + Math.max(0, power) * 1.2 + toughness * 0.8 +
          attachment.reduce((sum, operation) => sum + (operation.keywords || []).length * 1.5, 0);
      }
      if (hint === 'forceAttack') {
        const victim = q.aiHint && q.aiHint.victim;
        if (!victim || target.ctrl === victim) return -100;
        if (target.ctrl === player) return Math.max(0, target.power) * 0.45 + value * 0.08;
        return value + Math.max(0, target.power) * 1.8;
      }
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
      if (hint === 'mixedPump') {
        const powerDelta = Number(q.aiHint && q.aiHint.power || 0);
        const toughnessDelta = Number(q.aiHint && q.aiHint.toughness || 0);
        const remainingToughness = Number(target.toughness || 0) - Number(target.damage || 0);
        const lethal = remainingToughness + toughnessDelta <= 0;
        if (hostile) {
          // +N/-N tricks are removal only when the toughness reduction actually
          // kills the opposing creature. Otherwise they temporarily make that
          // threat hit harder and should not be treated as ordinary removal.
          return lethal ? 18 + value * 1.5 : -8 - value - Math.max(0, powerDelta) * 1.5;
        }
        if (lethal) return -100;
        const inCombat = !!target.attacking || !!target.blocking;
        return 5 + Math.max(0, powerDelta) * 1.8 + (inCombat ? 8 : 0) + value * 0.08;
      }
      if (hint === 'debuff') {
        if (!hostile) return -100;
        const inCombat = !!target.attacking || !!target.blocking;
        return value + Math.max(0, Number(target.power) || 0) * 1.4 + (inCombat ? 12 : 0);
      }
      if (hint === 'damage') {
        const rawAmount = q.aiHint && q.aiHint.amount;
        const damage = rawAmount === 'X' ? Number(q.aiHint && q.aiHint.x || 0) : Number(rawAmount || 0);
        if (damage > 0) {
          if (!hostile) return -1000-value * 1.8;
          const remaining = target.is('Planeswalker')
            ? Math.max(1, Number(target.counters && target.counters.loyalty) || 0)
            : Math.max(1, Number(target.toughness || 0) - Number(target.damage || 0));
          if (damage >= remaining && damageProtectionSaves(target)) {
            return -10 - value * 0.12;
          }
          return damage >= remaining ? 14 + value * 1.5 - (damage - remaining) * 0.35 : Math.max(-25,value * 0.18 - (remaining - damage));
        }
      }
      if (hint === 'tap') {
        // Tapped permanents remain rules-legal targets, but tapping one again
        // does not change game state. Keep that legality for humans while the
        // local bot prefers an actually usable opposing permanent.
        if (target.tapped) return -1000;
        return hostile ? value : -value * 1.8;
      }
      if (hint === 'untap') {
        if (!target.tapped) return -1000;
        return hostile ? -value : value;
      }
      if (hint === 'buff' && q.aiHint && q.aiHint.untilEOT) {
        if (hostile) return -100;
        const power = Number(q.aiHint.power || 0);
        const toughness = Number(q.aiHint.toughness || 0);
        const keywords = (q.aiHint.keywords || []).map(keyword => String(keyword).toLowerCase());
        const addsKeyword = keywords.some(keyword => !target.kw(keyword));
        const hasteMatters = keywords.includes('haste') && target.sick && !target.tapped &&
          game.turnPlayer === player && game.phase === 'main1';
        const statChange = power !== 0 || toughness !== 0;
        const inCombat = !!target.attacking || target.blocking !== null &&
          target.blocking !== undefined && target.blocking !== false;
        const canAttackNow = game.turnPlayer === player && game.phase === 'main1' && !target.tapped &&
          (!target.sick || target.kw('haste') || hasteMatters) && !target.cur.cantAttack;
        const top = game.stack[game.stack.length - 1];
        const respondingToHostileTarget = top && top.ctrl !== player &&
          (top.targets || []).flat().includes(target);
        if (!statChange && !addsKeyword) return -1000;
        if (!inCombat && !canAttackNow && !respondingToHostileTarget) return -100;
        if (!statChange && keywords.length && !hasteMatters &&
          !keywords.some(keyword => ['indestructible', 'hexproof', 'shroud'].includes(keyword))) return -100;
        return value + Math.max(0, power) * 1.5 + Math.max(0, toughness) + (addsKeyword ? 2 : 0);
      }
      if (hint === 'removal' && q.aiHint && q.aiHint.removalKind === 'destroy' &&
        hostile && indestructibleStopsDestroy(target)) {
        // The target remains rules-legal for human players. For the AI this is
        // a dead effect, so it must lose to any effective target and normally
        // to keeping the destroy spell in hand.
        return -100 - value;
      }
      // Tapovanje je za Magma Opus obavezna, neprijateljska interakcija. Bez
      // eksplicitnog svrstavanja u hostile ciljeve evaluator je mogao dati
      // viši zbir vlastitim Veyran/Storm-Kiln metama samo zato što su vrednije.
      // A cost paid with one of your own permanents is spent on the cheapest
      // one; pointing it at the best permanent on the board is never right.
      if (/^sac(Own|rificeOwn)/i.test(hint)) return hostile ? -1000 : -value;
      if (/removal|damage|destroy|exile|bounce|counter|tap|goad/i.test(hint)) return hostile ? value : -value * 1.8;
      if(hint==='copy')return value;
      if (/buff|pump|protect|copy|recur|return|attach|equip|untap/i.test(hint)) return hostile ? -value : value;
      // An Aura or an evasion grant belongs to its controller even when the
      // chosen permanent has no combat value of its own (a land), so the tie
      // between two such permanents never falls to an opponent's.
      if (/evasion|aura/i.test(hint)) return hostile ? -(value + 1) : value + 1;
      return hostile ? value * 0.7 : value * 0.5;
    }
    if (target && target.kind) {
      const hostile = target.ctrl && target.ctrl !== player;
      const spell = target.card || target.srcCard;
      if (hint === 'copy-stack') return (spell ? cardDefinitionValue(spell.def) : 2) + (hostile ? 0 : 2);
      // Countering our own spell throws away both cards; it is never chosen
      // while any other legal object is on the Stack.
      if (!hostile && hint === 'counter') return -1000;
      return (spell ? cardDefinitionValue(spell.def) : 2) * (hostile ? 1 : -0.5);
    }
    return 0;
  }

  function choiceCardValue(game, player, card, q) {
    if (!(card instanceof U.CardInst)) return 0;
    const hint = q.aiHint && q.aiHint.kind || '';
    // Processing exile may choose an opponent's face-down card, but it does
    // not grant permission to inspect its identity before that choice.
    if (hint === 'oracleProcessExile') return card.faceDown ? 0 : -cardDefinitionValue(card.def);
    const value = cardDefinitionValue(card.def) + (card.commander ? 8 : 0);
    if (hint === 'crew') return -permanentGameValue(game, card, player);
    if (hint === 'ward' && q.aiHint.payment === 'discard') {
      // Ward is paid after the spell is already on the Stack, so declining
      // loses both the spell and its mana. Discard the cheapest card unless
      // every option costs more than the permanent the spell is removing.
      if (card.commander) return -100;
      const worth = q.aiHint.target ? permanentGameValue(game, q.aiHint.target, player) : 0;
      return Math.max(0.5, worth + 3) - value;
    }
    if (hint === 'optionalLoot') {
      if (card.commander) return -100;
      const choices = q.from || player.hand || [];
      const handLands = choices.filter(candidate => candidate.is('Land')).length;
      const landsNeeded = Math.max(1, 3 - game.lands(player).length);
      if (card.is('Land')) return handLands > landsNeeded ? 9 - value * 0.1 : -10;
      const handPressure = choices.length >= 7 ? 4 : 2.25;
      return handPressure - value;
    }
    if (hint === 'wakandaBattlefield') {
      const duplicateLegend = (card.def.super || []).includes('Legendary') &&
        game.bf().some(existing => existing.ctrl === player && existing.name === card.name);
      if (duplicateLegend) return -100;
      const landNeed = card.is('Land') ? Math.max(0, 6 - game.lands(player).length) * 0.9 : 0;
      // The permanent also receives a durable indestructible counter, so even
      // a utility land should beat declining when mana development is useful.
      return value + landNeed + (card.is('Creature') ? 2.4 : 1.7);
    }
    if (hint === 'celestialKeep') {
      return card.ctrl === player ? permanentGameValue(game, card, player) * 1.5 : -permanentGameValue(game, card, player);
    }
    if (hint === 'covenDifferentPowers' || hint === 'bolster') {
      return card.ctrl === player ? permanentGameValue(game, card, player) + (card.counters['+1/+1'] || 0) * 0.8 : -100;
    }
    if (hint === 'hazelMana') return card.is('Creature') ? -1.2 : 0.6;
    if (hint === 'ninjutsuReturn') return -permanentGameValue(game, card, player);
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
    if (hint === 'addlTap') return -permanentGameValue(game, card, player);
    if (hint === 'tragicKeep') {
      return q.aiHint && q.aiHint.owner === player
        ? permanentGameValue(game, card, player)
        : -permanentGameValue(game, card, player);
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
    if (hint === 'tapCost') return -value - Math.max(0,card.power) * 0.1;
    // Enlist adds the tapped creature's power to the attacker, so the strongest
    // spare body is worth tapping and a commander or a 0-power blocker is not.
    if (hint === 'enlist') return Math.max(0, card.power) * 4 - value * 0.2 - (card.commander ? 14 : 0);
    if(hint==='oraclePermanentChoice'){
      const relevant=q.aiHint.operation==='untap'?card.tapped:!card.tapped;
      if(!relevant)return -1;
      const own=card.ctrl===player,beneficial=q.aiHint.operation==='untap'?own:!own;
      return (beneficial?1:-1)*(8+Math.max(0,value));
    }
    if (hint === 'upkeepCounterCost') return -value;
    if (hint === 'bottomOrder') return -value;
    if (hint === 'reflexiveCost') return -value - ((q.aiHint.keepTargets||[]).includes(card) ? 10000 : 0);
    // Exiling cards for payment spends resources. Preserve a spell/ability's
    // selected targets when other legal fodder exists, without changing the
    // legal cost pool (a player may deliberately pay with their own target).
    // The same legacy hint also labels optional delve discounts (min zero).
    // Preserve that separate quantity decision; fixed exile costs must choose
    // exactly min cards and should spend the least valuable legal objects.
    if (hint === 'delve' && q.min > 0) return -value - ((q.aiHint.keepTargets||[]).includes(card) ? 10000 : 0);
    if (/discard|sacCost|bounceCost|cleanup|bottom/i.test(hint) || /odbaci|discard|sacrifice|žrtv/i.test(q.prompt || '')) {
      if((q.aiHint?.keepTargets||[]).includes(card))return -10000-value;
      let discardScore = -value;
      if (MTG.getAIBaseStyle(player.aiStyle) === 'josh') {
        const sem = inferCardSemantics(card.def);
        const lands = game.lands(player).length;
        if (sem.roles.includes('land') && lands >= 6) discardScore += 6;
        if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && lands >= 7) discardScore += 3;
        if (sem.roles.some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role))) discardScore -= 4;
        if (sem.roles.includes('engine') || sem.roles.includes('card-draw')) discardScore -= 3;
      }
      if (MTG.getAIBaseStyle(player.aiStyle) === 'jimmy') {
        const sem = inferCardSemantics(card.def);
        const lands = game.lands(player).length;
        if (sem.roles.includes('land') && lands >= 5) discardScore += 4;
        if (sem.roles.includes('board-wipe')) discardScore += 5;
        if (sem.roles.includes('counterspell') && !sem.roles.includes('protection')) discardScore += 3;
        if (card.commander || sem.roles.some(role => ['creature', 'finisher', 'anthem', 'combat-trick', 'protection'].includes(role))) discardScore -= 3;
      }
      if (MTG.getAIBaseStyle(player.aiStyle) === 'rachel') {
        const sem = inferCardSemantics(card.def);
        const lands = game.lands(player).length;
        const flexibleRoles = sem.roles.filter(role => ['ramp', 'mana-rock', 'card-draw', 'card-selection',
          'single-target-removal', 'protection', 'creature', 'token-maker', 'engine', 'commander-support'].includes(role));
        if (sem.roles.includes('land') && lands >= 6) discardScore += 5;
        if (sem.roles.includes('counterspell') && !sem.roles.includes('protection')) discardScore += 2;
        if (flexibleRoles.length >= 2) discardScore -= 4;
        if (sem.roles.some(role => ['engine', 'card-draw', 'protection', 'finisher'].includes(role))) discardScore -= 2.5;
      }
      if (MTG.getAIBaseStyle(player.aiStyle) === 'post') {
        const sem = inferCardSemantics(card.def);
        const oracle = textOf(card.def);
        const lands = game.lands(player).length;
        const borrowsPower = /gain control of|cast .* (?:an opponent|opponent's)|play .* (?:an opponent|opponent's)|from an opponent's graveyard|under your control/.test(oracle);
        if (sem.roles.includes('land') && lands >= 6) discardScore += 5;
        if (sem.roles.includes('stax')) discardScore += 7;
        if (sem.roles.includes('board-wipe') && postOpportunistMode(game, player) !== 'GAMBLE') discardScore += 2.5;
        if (sem.roles.some(role => ['engine', 'card-draw', 'combo-piece', 'finisher', 'reanimation'].includes(role)) || borrowsPower) discardScore -= 4;
      }
      if (MTG.getAIBaseStyle(player.aiStyle) === 'olivia') {
        const sem = inferCardSemantics(card.def);
        const lands = game.lands(player).length;
        const sabotage = saboteurCard(card.def);
        if (sem.roles.includes('land') && lands >= 6) discardScore += 5;
        if (sem.roles.includes('board-wipe') && oliviaSaboteurMode(game, player) !== 'DISRUPT') discardScore += 3;
        if (sem.roles.includes('creature') && sem.roles.length === 1 && U.mv(card.def.cost || '') >= 4) discardScore += 2;
        if (sabotage || sem.roles.some(role => ['single-target-removal', 'counterspell', 'card-draw', 'engine', 'protection'].includes(role))) discardScore -= 4;
      }
      return discardScore;
    }
    if (card.ctrl && card.ctrl !== player) return value * 1.2;
    return value;
  }

  function cardDefinitionValue(def) {
    const sem = inferCardSemantics(def);
    let value = U.mv(def && def.cost || '') * 0.65 + (sem.roles.includes('creature') ? 1 : 0);
    if (def && (def.types || []).some(type => ['Artifact', 'Enchantment', 'Planeswalker', 'Battle'].includes(type))) {
      value += 0.8;
    }
    value += Math.min(1.5, (def && def.kws || []).length * 0.3);
    const attachmentValue = (def && def.oracleImplementation || [])
      .filter(operation => operation.kind === 'attachment-grant')
      .reduce((sum, operation) => sum +
        Math.min(3, Math.abs(Number(operation.power || 0)) * 0.28) +
        Math.min(3, Math.abs(Number(operation.toughness || 0)) * 0.28) +
        (operation.keywords || []).length * 0.75 +
        (operation.skipUntap ? 1.6 : 0) +
        (operation.cantAttack ? 1.4 : 0) +
        (operation.cantBlock ? 1.1 : 0), 0);
    if (sem.synergyTags.includes('equipment') || sem.synergyTags.includes('auras')) {
      value += Math.max(1.4, Math.min(6, attachmentValue));
    }
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

  function jimmyAggroMode(game, player, view, profile) {
    if (!player || MTG.getAIBaseStyle(player.aiStyle) !== 'jimmy') return null;
    const publicView = view || MTG.createBotPlayerView(game, player.idx);
    const styledProfile = profileForStyle(profile || MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name), player);
    const me = getPlayerRow(publicView, player.idx);
    const board = controlledPermanents(publicView, player.idx);
    const commanderOnline = board.some(card => card.commander);
    const ready = game.creatures(player).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && (!game.canAttackAtAll || game.canAttackAtAll(card)) && Math.max(0, card.power || 0) > 0);
    const opponents = publicView.players.filter(row => row.id !== player.idx && !row.lost);
    const canFinish = opponents.some(row => {
      const target = resolvePlayer(game, row.id);
      let prior = 0;
      const legalReady = ready.filter(card => (!game.canAttackTarget || game.canAttackTarget(card, target)) &&
        (!game.diplomacyAttackBlocked || !game.diplomacyAttackBlocked(player, target)));
      const damage = legalReady.reduce((sum, card) => {
        const assessment = attackAssignmentAssessment(game, player, card, target, prior++);
        return sum + Math.max(0, assessment.expectedDamage || 0);
      }, 0);
      return damage >= row.life;
    });
    if (canFinish) return 'ALPHA';
    const evaluation = MTG.evaluateState(publicView, player.idx, styledProfile);
    const maxCommanderDamage = Math.max(0, ...Object.values(me.commanderDamage || {}).map(Number));
    if (me.life <= 12 || maxCommanderDamage >= 17 || evaluation.immediateLossRisk >= 35) return 'RACE';
    const ownTurns = Number(player.turnsStarted || Math.floor((game.turnNo || 0) / Math.max(1, publicView.players.length)));
    if (ownTurns <= 3 && (!commanderOnline || ready.length < 2)) return 'BUILD';
    return 'PRESSURE';
  }
  MTG.jimmyAggroMode = jimmyAggroMode;

  function joshValueEngineMode(game, player, view, profile) {
    if (!player || MTG.getAIBaseStyle(player.aiStyle) !== 'josh') return null;
    const publicView = view || MTG.createBotPlayerView(game, player.idx);
    const styledProfile = profileForStyle(profile || MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name), player);
    const me = getPlayerRow(publicView, player.idx);
    const board = controlledPermanents(publicView, player.idx);
    const engines = board.filter(card => card.roles.includes('engine') || card.roles.includes('card-draw') || card.roles.includes('combo-piece')).length;
    const readyPower = board.filter(card => card.roles.includes('creature') && !card.tapped && !card.summoningSick)
      .reduce((sum, card) => sum + Math.max(0, card.power || 0), 0);
    const opponents = publicView.players.filter(row => row.id !== player.idx && !row.lost);
    const evaluation = MTG.evaluateState(publicView, player.idx, styledProfile);
    const maxCommanderDamage = Math.max(0, ...Object.values(me.commanderDamage || {}).map(Number));
    if (me.life <= 14 || maxCommanderDamage >= 16 || evaluation.immediateLossRisk >= 32) return 'SHIELDS_UP';
    const canFinish = opponents.some(row => readyPower >= row.life);
    const myBoard = board.reduce((sum, card) => sum + permanentValue(card, styledProfile), 0);
    const biggestOppBoard = Math.max(0, ...opponents.map(row => controlledPermanents(publicView, row.id)
      .reduce((sum, card) => sum + permanentValue(card, MTG.getDeckAIProfile(row.deckId)), 0)));
    const ownTurns = Number(player.turnsStarted || Math.floor((game.turnNo || 0) / Math.max(1, publicView.players.length)));
    if (canFinish || (ownTurns >= 5 && engines >= 2 && me.handCount >= 4 && myBoard > biggestOppBoard * 1.18 + 3)) return 'CLOSE';
    if (ownTurns <= 4 && engines < 2) return 'SETUP';
    return 'VALUE';
  }
  MTG.joshValueEngineMode = joshValueEngineMode;

  function rachelBalancedMode(game, player, view, profile) {
    if (!player || MTG.getAIBaseStyle(player.aiStyle) !== 'rachel') return null;
    const publicView = view || MTG.createBotPlayerView(game, player.idx);
    const styledProfile = profileForStyle(profile || MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name), player);
    const me = getPlayerRow(publicView, player.idx);
    const board = controlledPermanents(publicView, player.idx);
    const opponents = publicView.players.filter(row => row.id !== player.idx && !row.lost);
    const ready = game.creatures(player).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && (!game.canAttackAtAll || game.canAttackAtAll(card)) && Math.max(0, card.power || 0) > 0);
    const lethalOpponents = opponents.filter(row => {
      const target = resolvePlayer(game, row.id);
      let prior = 0;
      const damage = ready.filter(card => (!game.canAttackTarget || game.canAttackTarget(card, target)) &&
        (!game.diplomacyAttackBlocked || !game.diplomacyAttackBlocked(player, target)))
        .reduce((sum, card) => sum + Math.max(0, attackAssignmentAssessment(game, player, card, target, prior++).expectedDamage || 0), 0);
      return damage >= row.life;
    });
    // One vulnerable opponent is not automatically "the finish" in a pod.
    // Rachel's public table philosophy leaves room for the game to develop;
    // FINISH means the whole remaining table is closable, or the late engine is
    // clearly ahead and should stop durdling.
    if (opponents.length && lethalOpponents.length === opponents.length) return 'FINISH';
    const evaluation = MTG.evaluateState(publicView, player.idx, styledProfile);
    const maxCommanderDamage = Math.max(0, ...Object.values(me.commanderDamage || {}).map(Number));
    const myBoard = board.reduce((sum, card) => sum + permanentValue(card, styledProfile), 0);
    const biggestOppBoard = Math.max(0, ...opponents.map(row => controlledPermanents(publicView, row.id)
      .reduce((sum, card) => sum + permanentValue(card, MTG.getDeckAIProfile(row.deckId)), 0)));
    if (me.life <= 14 || maxCommanderDamage >= 16 || evaluation.immediateLossRisk >= 32 ||
      biggestOppBoard > myBoard * 1.65 + 8) return 'COMEBACK';
    const ownTurns = Number(player.turnsStarted || Math.floor((game.turnNo || 0) / Math.max(1, publicView.players.length)));
    const engines = board.filter(card => card.roles.some(role => ['engine', 'card-draw', 'ramp', 'mana-rock'].includes(role))).length;
    if (ownTurns >= 6 && engines >= 2 && me.handCount >= 3 && myBoard > biggestOppBoard * 1.22 + 4) return 'FINISH';
    if (ownTurns <= 3 && (board.length < 3 || engines < 1)) return 'DEVELOP';
    return 'TABLE_READ';
  }
  MTG.rachelBalancedMode = rachelBalancedMode;

  function postOpportunistMode(game, player, view, profile) {
    if (!player || MTG.getAIBaseStyle(player.aiStyle) !== 'post') return null;
    const publicView = view || MTG.createBotPlayerView(game, player.idx);
    const styledProfile = profileForStyle(profile || MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name), player);
    const me = getPlayerRow(publicView, player.idx);
    const board = controlledPermanents(publicView, player.idx);
    const opponents = publicView.players.filter(row => row.id !== player.idx && !row.lost);
    const ready = game.creatures(player).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && (!game.canAttackAtAll || game.canAttackAtAll(card)) && Math.max(0, card.power || 0) > 0);
    const canPickOff = opponents.some(row => {
      const target = resolvePlayer(game, row.id);
      let prior = 0;
      const damage = ready.filter(card => (!game.canAttackTarget || game.canAttackTarget(card, target)) &&
        (!game.diplomacyAttackBlocked || !game.diplomacyAttackBlocked(player, target)))
        .reduce((sum, card) => sum + Math.max(0, attackAssignmentAssessment(game, player, card, target, prior++).expectedDamage || 0), 0);
      return damage >= row.life;
    });
    if (canPickOff) return 'SHOWTIME';
    const evaluation = MTG.evaluateState(publicView, player.idx, styledProfile);
    const maxCommanderDamage = Math.max(0, ...Object.values(me.commanderDamage || {}).map(Number));
    const myBoard = board.reduce((sum, card) => sum + permanentValue(card, styledProfile), 0);
    const biggestOppBoard = Math.max(0, ...opponents.map(row => controlledPermanents(publicView, row.id)
      .reduce((sum, card) => sum + permanentValue(card, MTG.getDeckAIProfile(row.deckId)), 0)));
    if (me.life <= 13 || maxCommanderDamage >= 16 || evaluation.immediateLossRisk >= 34 ||
      biggestOppBoard > myBoard * 1.7 + 8) return 'GAMBLE';
    const ownTurns = Number(player.turnsStarted || Math.floor((game.turnNo || 0) / Math.max(1, publicView.players.length)));
    const engines = board.filter(card => card.roles.some(role => ['engine', 'card-draw', 'combo-piece', 'reanimation'].includes(role))).length;
    if (ownTurns >= 6 && engines >= 2 && me.handCount >= 3 && myBoard > biggestOppBoard * 1.12 + 3) return 'SHOWTIME';
    if (ownTurns <= 3 && engines < 2) return 'LAY_LOW';
    return 'HEIST';
  }
  MTG.postOpportunistMode = postOpportunistMode;

  function oliviaSaboteurMode(game, player, view, profile) {
    if (!player || MTG.getAIBaseStyle(player.aiStyle) !== 'olivia') return null;
    const publicView = view || MTG.createBotPlayerView(game, player.idx);
    const styledProfile = profileForStyle(profile || MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name), player);
    const me = getPlayerRow(publicView, player.idx);
    const board = controlledPermanents(publicView, player.idx);
    const opponents = publicView.players.filter(row => row.id !== player.idx && !row.lost);
    const ready = game.creatures(player).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && (!game.canAttackAtAll || game.canAttackAtAll(card)) && Math.max(0, card.power || 0) > 0);
    const canAmbush = opponents.some(row => {
      const target = resolvePlayer(game, row.id);
      let prior = 0;
      const damage = ready.filter(card => (!game.canAttackTarget || game.canAttackTarget(card, target)) &&
        (!game.diplomacyAttackBlocked || !game.diplomacyAttackBlocked(player, target)))
        .reduce((sum, card) => sum + Math.max(0, attackAssignmentAssessment(game, player, card, target, prior++).expectedDamage || 0), 0);
      return damage >= row.life;
    });
    if (canAmbush) return 'AMBUSH';
    const evaluation = MTG.evaluateState(publicView, player.idx, styledProfile);
    const maxCommanderDamage = Math.max(0, ...Object.values(me.commanderDamage || {}).map(Number));
    const myBoard = board.reduce((sum, card) => sum + permanentValue(card, styledProfile), 0);
    const opposingBoards = opponents.map(row => ({
      row,
      value: controlledPermanents(publicView, row.id)
        .reduce((sum, card) => sum + permanentValue(card, MTG.getDeckAIProfile(row.deckId)), 0),
      threat: playerThreatForGame(game, player, resolvePlayer(game, row.id)),
    })).sort((a, b) => b.threat - a.threat || a.row.id - b.row.id);
    const biggestOppBoard = Math.max(0, ...opposingBoards.map(entry => entry.value));
    const threatGap = opposingBoards.length > 1 ? opposingBoards[0].threat - opposingBoards[1].threat : 0;
    if (me.life <= 13 || maxCommanderDamage >= 16 || evaluation.immediateLossRisk >= 33 ||
      biggestOppBoard > myBoard * 1.55 + 7 || threatGap >= 10) return 'DISRUPT';
    const ownTurns = Number(player.turnsStarted || Math.floor((game.turnNo || 0) / Math.max(1, publicView.players.length)));
    const engines = board.filter(card => card.roles.some(role => ['engine', 'card-draw', 'combo-piece'].includes(role))).length;
    if (ownTurns >= 6 && engines >= 2 && me.handCount >= 3 && myBoard > biggestOppBoard * 1.18 + 4) return 'AMBUSH';
    if (ownTurns <= 3 && engines < 2) return 'INFILTRATE';
    return 'MISDIRECT';
  }
  MTG.oliviaSaboteurMode = oliviaSaboteurMode;

  function styleSkillMode(game, player, view, profile) {
    if (player && MTG.getAIBaseStyle(player.aiStyle) === 'jimmy') return jimmyAggroMode(game, player, view, profile);
    if (player && MTG.getAIBaseStyle(player.aiStyle) === 'josh') return joshValueEngineMode(game, player, view, profile);
    if (player && MTG.getAIBaseStyle(player.aiStyle) === 'rachel') return rachelBalancedMode(game, player, view, profile);
    if (player && MTG.getAIBaseStyle(player.aiStyle) === 'post') return postOpportunistMode(game, player, view, profile);
    if (player && MTG.getAIBaseStyle(player.aiStyle) === 'olivia') return oliviaSaboteurMode(game, player, view, profile);
    return null;
  }
  MTG.getAIStyleMode = styleSkillMode;

  function applyJimmyAggroScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const mode = jimmyAggroMode(game, player, view, profile);
    const ownBoard = game.bf().filter(card => card.ctrl === player);
    const keyPieceOnline = ownBoard.some(card => card.commander || inferCardSemantics(card.def).roles
      .some(role => ['finisher', 'combo-piece'].includes(role)));
    const top = game.stack[game.stack.length - 1];
    const topTargetsOwn = !!(top && top.ctrl !== player && (top.targets || []).flat()
      .some(target => target === player || target && target.ctrl === player));
    breakdown.pressurePlan = 0;

    if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      if (card.commander) breakdown.pressurePlan += mode === 'BUILD' ? 8 : 5.5;
      if (sem.roles.includes('creature')) breakdown.pressurePlan += mode === 'BUILD' ? 3.2 : 2;
      if (sem.roles.includes('token-maker')) breakdown.pressurePlan += 3;
      if (sem.roles.includes('anthem')) breakdown.pressurePlan += 3.5;
      if (sem.roles.includes('direct-damage')) breakdown.pressurePlan += mode === 'RACE' || mode === 'ALPHA' ? 6 : 2.5;
      if (sem.roles.includes('combat-trick')) breakdown.pressurePlan += game.phase === 'combat' ? 6 : 1.5;
      if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && mode === 'BUILD') breakdown.pressurePlan += 2.8;
      if (sem.roles.includes('finisher')) breakdown.pressurePlan += mode === 'ALPHA' ? 8 : mode === 'RACE' ? 5 : 2;
      if (sem.roles.includes('board-wipe')) breakdown.pressurePlan -= mode === 'RACE' ? 4 : 10;
      if (sem.roles.includes('counterspell')) breakdown.pressurePlan += topTargetsOwn && keyPieceOnline ? 8 : -6;
      if (sem.roles.includes('protection')) breakdown.pressurePlan += topTargetsOwn && keyPieceOnline ? 8 : keyPieceOnline ? 3 : 0;
      const heldProtection = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles
        .some(role => ['counterspell', 'protection', 'combat-trick'].includes(role)));
      const available = availableManaEstimate(game, player);
      if (heldProtection && keyPieceOnline && game.turnPlayer === player && game.phase === 'main1' &&
        available - spend < 1 && !card.commander && !sem.roles.includes('finisher')) breakdown.pressurePlan -= 4.5;
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const sem = inferCardSemantics(entry.card.def);
      const label = String(entry.label || entry.ability && entry.ability.label || '').toLowerCase();
      if (/damage|pump|gets? \+|haste|double strike|extra combat|untap|token/.test(label) ||
        sem.roles.some(role => ['direct-damage', 'anthem', 'combat-trick', 'token-maker'].includes(role))) {
        breakdown.pressurePlan += mode === 'ALPHA' ? 7 : mode === 'RACE' ? 5 : 3;
      }
    } else if (action.kind === 'pass' || action.kind === 'done') {
      const heldProtection = (player.hand || []).some(card => inferCardSemantics(card.def).roles
        .some(role => ['counterspell', 'protection', 'combat-trick'].includes(role)));
      if (heldProtection && keyPieceOnline && availableManaEstimate(game, player) >= 1) breakdown.pressurePlan += 3;
      if (game.turnPlayer === player && game.phase === 'main1' && mode === 'ALPHA') breakdown.pressurePlan -= 2;
    } else if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      const priorByDefender = new Map();
      let damaging = 0;
      for (const item of assignments) {
        const defender = item.target instanceof U.Player ? item.target : item.target && item.target.ctrl;
        if (!defender) continue;
        const prior = priorByDefender.get(defender.idx) || 0;
        priorByDefender.set(defender.idx, prior + 1);
        const assessment = attackAssignmentAssessment(game, player, item.card, item.target, prior);
        if (assessment.freeBlock || !assessment.dealsDamage) breakdown.pressurePlan -= 8;
        else {
          damaging++;
          breakdown.pressurePlan += mode === 'BUILD' ? 1.8 : mode === 'PRESSURE' ? 4 : mode === 'RACE' ? 6 : 8;
          if (!assessment.blockable) breakdown.pressurePlan += 2.5;
          if (assessment.lethal || assessment.commanderLethal) breakdown.pressurePlan += 28;
          if (game.monarch === defender) breakdown.pressurePlan += 5;
          if (defender.life <= 18) breakdown.pressurePlan += 1.5;
          if (item.card.commander) breakdown.pressurePlan += 2.5;
          if (/combat damage|whenever .* attacks|attacks,|attack with/i.test(item.card.def.oracle || '')) breakdown.pressurePlan += 2.5;
        }
      }
      if (damaging > 1) breakdown.pressurePlan += Math.min(5, damaging * 0.8);
      if (!assignments.length) breakdown.pressurePlan -= mode === 'BUILD' ? 0.5 : mode === 'PRESSURE' ? 2.5 : mode === 'RACE' ? 6 : 12;
    } else if (action.kind === 'declareBlockers') {
      breakdown.pressurePlan -= (action.assignments || []).length * (mode === 'BUILD' ? 0.5 : 2.2);
    } else if (action.kind === 'chooseTargets') {
      const src = q && (q.src || q.data && (q.data.card || q.data.src));
      const sourceSem = src && src.def ? inferCardSemantics(src.def) : { roles: [] };
      const damageGoal = sourceSem.roles.includes('direct-damage') || q && q.aiHint && /damage|harm/i.test(q.aiHint.goal || '');
      for (const target of action.picks || []) {
        if (target instanceof U.Player && target !== player && damageGoal) {
          breakdown.pressurePlan += Math.max(0, (25 - target.life) * 0.32);
          const amount = Number(q && q.aiHint && (q.aiHint.damage || q.aiHint.amount) || 0);
          if (amount && amount >= target.life) breakdown.pressurePlan += 30;
        } else if (target instanceof U.CardInst && target.ctrl !== player && target.is('Creature')) {
          if (!target.tapped && game.creatures(player).some(card => !card.tapped && !card.sick)) breakdown.pressurePlan += 2.5;
        } else if (target instanceof U.CardInst && target.ctrl === player && target.commander &&
          q && q.aiHint && /buff|pump|protect|untap/i.test(q.aiHint.goal || '')) breakdown.pressurePlan += 4;
      }
    }
  }

  function applyRachelBalancedScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const mode = rachelBalancedMode(game, player, view, profile);
    const opponents = player.opponents(game).filter(opponent => !opponent.lost);
    const leader = opponents.slice().sort((a, b) => playerThreatForGame(game, player, b) - playerThreatForGame(game, player, a) || a.idx - b.idx)[0] || null;
    const ownBoard = game.bf().filter(card => card.ctrl === player);
    const keyPieceOnline = ownBoard.some(card => card.commander || inferCardSemantics(card.def).roles
      .some(role => ['engine', 'card-draw', 'finisher', 'combo-piece'].includes(role)));
    const top = game.stack[game.stack.length - 1];
    const topTargetsOwn = !!(top && top.ctrl !== player && (top.targets || []).flat()
      .some(target => target === player || target && target.ctrl === player));
    breakdown.tableBalance = 0;

    if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      const flexibleRoles = sem.roles.filter(role => ['ramp', 'mana-rock', 'card-draw', 'card-selection',
        'single-target-removal', 'protection', 'creature', 'token-maker', 'engine', 'commander-support'].includes(role));
      if (flexibleRoles.length >= 2) breakdown.tableBalance += 3 + Math.min(2, flexibleRoles.length - 2);
      if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && mode === 'DEVELOP') breakdown.tableBalance += 3;
      if (sem.roles.includes('card-draw') || sem.roles.includes('engine')) breakdown.tableBalance += mode === 'FINISH' ? 1.5 : 2.8;
      if (sem.roles.includes('creature')) breakdown.tableBalance += mode === 'DEVELOP' ? 1.8 : 0.8;
      if (card.commander) breakdown.tableBalance += mode === 'DEVELOP' ? 3.5 : 2;
      if (sem.roles.includes('counterspell')) breakdown.tableBalance += topTargetsOwn && keyPieceOnline ? 7 : -4.5;
      if (sem.roles.includes('protection')) breakdown.tableBalance += topTargetsOwn && keyPieceOnline ? 7 : keyPieceOnline ? 2.5 : 0;
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        const promised = game.diplomacyRequiredRemovalTarget && game.diplomacyRequiredRemovalTarget(player, card);
        const hitsLeader = best && best.target && best.target.ctrl === leader;
        if (promised || hitsLeader || best && best.score >= 7) breakdown.tableBalance += mode === 'COMEBACK' ? 6 : 3.5;
        else if (mode !== 'COMEBACK') breakdown.tableBalance -= 5;
      }
      if (sem.roles.includes('board-wipe')) {
        const mine = boardValueFor(game, player);
        const theirs = opponents.reduce((sum, opponent) => sum + boardValueFor(game, opponent), 0);
        if (mode === 'COMEBACK' && theirs > mine * 1.25) breakdown.tableBalance += 8;
        else if (mine >= theirs / Math.max(1, opponents.length)) breakdown.tableBalance -= 8;
      }
      if (sem.roles.includes('finisher')) breakdown.tableBalance += mode === 'FINISH' ? 7 : mode === 'DEVELOP' ? -2.5 : 1;
      const heldInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      const available = availableManaEstimate(game, player);
      if (heldInteraction && keyPieceOnline && game.turnPlayer === player && game.phase === 'main1' &&
        available - spend < 1 && !sem.roles.includes('protection')) breakdown.tableBalance -= mode === 'COMEBACK' ? 7 : 3.5;
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const sem = inferCardSemantics(entry.card.def);
      const label = String(entry.label || entry.ability && entry.ability.label || '').toLowerCase();
      if (sem.roles.some(role => ['engine', 'card-draw', 'ramp', 'token-maker'].includes(role)) ||
        /draw|treasure|token|exile the top|untap|mana/.test(label)) breakdown.tableBalance += mode === 'COMEBACK' ? 2.5 : 3.5;
    } else if (action.kind === 'pass' || action.kind === 'done') {
      const heldDefense = (player.hand || []).some(card => inferCardSemantics(card.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (heldDefense && availableManaEstimate(game, player) >= 1 && keyPieceOnline) breakdown.tableBalance += mode === 'COMEBACK' ? 4 : 2;
    } else if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      const priorByDefender = new Map();
      for (const item of assignments) {
        const defender = item.target instanceof U.Player ? item.target : item.target && item.target.ctrl;
        if (!defender) continue;
        const prior = priorByDefender.get(defender.idx) || 0;
        priorByDefender.set(defender.idx, prior + 1);
        const assessment = attackAssignmentAssessment(game, player, item.card, item.target, prior);
        if (assessment.freeBlock || !assessment.dealsDamage) breakdown.tableBalance -= 6;
        else {
          breakdown.tableBalance += mode === 'FINISH' ? 5 : mode === 'COMEBACK' ? 1 : 2.2;
          if (defender === leader) breakdown.tableBalance += 4;
          if (/combat damage|whenever .* attacks|attacks,|create .*treasure|exile the top|draw a card/i.test(item.card.def.oracle || '')) {
            breakdown.tableBalance += 3.5;
          }
          if ((assessment.lethal || assessment.commanderLethal) && mode === 'FINISH') breakdown.tableBalance += 28;
          else if ((assessment.lethal || assessment.commanderLethal) && defender !== leader && opponents.length > 1) breakdown.tableBalance -= 12;
        }
      }
      const untappedAfter = game.creatures(player).filter(card => !card.tapped && !assignments.some(item => item.card === card)).length;
      const enemyReadyPower = opponents.reduce((sum, opponent) => sum + game.creatures(opponent)
        .filter(card => !card.tapped).reduce((power, card) => power + Math.max(0, card.power || 0), 0), 0);
      if (assignments.length && untappedAfter === 0 && enemyReadyPower >= 4 && mode !== 'FINISH') breakdown.tableBalance -= 5;
      if (!assignments.length && mode === 'FINISH') breakdown.tableBalance -= 10;
    } else if (action.kind === 'declareBlockers') {
      breakdown.tableBalance += (action.assignments || []).length * (mode === 'COMEBACK' ? 2.5 : 0.8);
    } else if (action.kind === 'chooseTargets' && q && q.aiHint && /removal|damage|destroy|exile|bounce|counter|protect/i.test(q.aiHint.goal || '')) {
      for (const target of action.picks || []) {
        if (target instanceof U.CardInst && target.ctrl !== player) {
          const sem = inferCardSemantics(target.def);
          if (target.ctrl === leader) breakdown.tableBalance += 3;
          if (sem.roles.some(role => ['engine', 'combo-piece', 'card-draw', 'finisher'].includes(role))) breakdown.tableBalance += 3;
        } else if (target instanceof U.CardInst && target.ctrl === player &&
          (target.commander || inferCardSemantics(target.def).roles.some(role => ['engine', 'card-draw', 'commander-support'].includes(role)))) {
          breakdown.tableBalance += 3;
        }
      }
    }
  }

  function borrowsOpposingPower(def) {
    const oracle = textOf(def);
    return /gain control of|cast .* (?:an opponent|opponent's)|play .* (?:an opponent|opponent's)|from an opponent's graveyard|under your control/.test(oracle);
  }

  function saboteurCard(def) {
    const oracle = textOf(def);
    return /goad|suspect|monarch|initiative|vote|gain control of|exchange control|change the target|choose new targets|attacks each combat|attacks a player other than you|can't attack you|target creature attacks|from an opponent's graveyard/.test(oracle);
  }

  function applyPostOpportunistScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const mode = postOpportunistMode(game, player, view, profile);
    const opponents = player.opponents(game).filter(opponent => !opponent.lost);
    const leader = opponents.slice().sort((a, b) => playerThreatForGame(game, player, b) - playerThreatForGame(game, player, a) || a.idx - b.idx)[0] || null;
    const ownBoard = game.bf().filter(card => card.ctrl === player);
    const top = game.stack[game.stack.length - 1];
    const topIsDangerous = !!(top && top.ctrl !== player && ((top.targets || []).flat()
      .some(target => target === player || target && target.ctrl === player) || top.ctrl === leader));
    breakdown.showstopper = 0;

    if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      const engine = sem.roles.includes('engine') || sem.roles.includes('card-draw');
      const borrowedPower = borrowsOpposingPower(card.def);
      if (sem.roles.includes('card-draw')) breakdown.showstopper += 4;
      if (sem.roles.includes('engine')) breakdown.showstopper += 3.5;
      if (sem.roles.includes('card-selection')) breakdown.showstopper += 1.5;
      if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && mode === 'LAY_LOW') breakdown.showstopper += 3;
      if (sem.synergyTags.some(tag => ['auras', 'equipment'].includes(tag))) breakdown.showstopper += 2;
      if (sem.roles.some(role => ['reanimation', 'combo-piece'].includes(role))) breakdown.showstopper += mode === 'SHOWTIME' ? 6 : 2.5;
      if (borrowedPower) breakdown.showstopper += mode === 'HEIST' || mode === 'SHOWTIME' ? 6 : 4;
      if (sem.roles.includes('stax')) breakdown.showstopper -= 9;
      if (sem.roles.includes('counterspell')) breakdown.showstopper += topIsDangerous ? 6 : -4;
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        const promised = game.diplomacyRequiredRemovalTarget && game.diplomacyRequiredRemovalTarget(player, card);
        if (promised || best && (best.target.ctrl === leader || best.score >= 7)) breakdown.showstopper += mode === 'GAMBLE' ? 6 : 3.5;
        else breakdown.showstopper -= 4.5;
      }
      if (sem.roles.includes('board-wipe')) {
        const mine = boardValueFor(game, player);
        const theirs = opponents.reduce((sum, opponent) => sum + boardValueFor(game, opponent), 0);
        if (mode === 'GAMBLE' && theirs > mine * 1.25) breakdown.showstopper += 9;
        else if (mine >= theirs / Math.max(1, opponents.length)) breakdown.showstopper -= 9;
      }
      if (sem.roles.includes('finisher')) breakdown.showstopper += mode === 'SHOWTIME' ? 9 : mode === 'LAY_LOW' && !engine ? -2 : 2;
      const heldInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      const available = availableManaEstimate(game, player);
      if (heldInteraction && game.turnPlayer === player && game.phase === 'main1' &&
        available - spend < 1 && mode !== 'SHOWTIME' && !borrowedPower) breakdown.showstopper -= mode === 'GAMBLE' ? 6 : 3;
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const sem = inferCardSemantics(entry.card.def);
      const label = String(entry.label || entry.ability && entry.ability.label || '').toLowerCase();
      if (sem.roles.some(role => ['engine', 'card-draw', 'combo-piece'].includes(role)) ||
        /draw|treasure|exile the top|untap|gain control|reanimate|return .*graveyard/.test(label)) {
        breakdown.showstopper += mode === 'SHOWTIME' ? 5 : 3.5;
      }
    } else if (action.kind === 'pass' || action.kind === 'done') {
      const heldInteraction = (player.hand || []).some(card => inferCardSemantics(card.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (heldInteraction && availableManaEstimate(game, player) >= 1 && mode !== 'SHOWTIME') breakdown.showstopper += mode === 'GAMBLE' ? 4 : 2.5;
    } else if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      const priorByDefender = new Map();
      for (const item of assignments) {
        const defender = item.target instanceof U.Player ? item.target : item.target && item.target.ctrl;
        if (!defender) continue;
        const prior = priorByDefender.get(defender.idx) || 0;
        priorByDefender.set(defender.idx, prior + 1);
        const assessment = attackAssignmentAssessment(game, player, item.card, item.target, prior);
        if (assessment.freeBlock || !assessment.dealsDamage) breakdown.showstopper -= 7;
        else {
          if (mode === 'LAY_LOW') breakdown.showstopper -= 2.5;
          else breakdown.showstopper += mode === 'SHOWTIME' ? 6 : 2.5;
          if (defender.life <= 18) breakdown.showstopper += Math.max(1, (20 - defender.life) * 0.35);
          if (assessment.lethal || assessment.commanderLethal) breakdown.showstopper += 30;
          if (item.card.owner && item.card.owner !== player) breakdown.showstopper += 5;
          if (/combat damage|whenever .* attacks|attacks,|create .*treasure|exile the top|draw a card/i.test(item.card.def.oracle || '')) breakdown.showstopper += 3;
        }
      }
      if (!assignments.length && mode === 'SHOWTIME') breakdown.showstopper -= 10;
    } else if (action.kind === 'chooseTargets') {
      const source = q && (q.src || q.data && (q.data.card || q.data.src));
      const steals = source && source.def && borrowsOpposingPower(source.def);
      const interactionGoal = q && q.aiHint && /removal|damage|destroy|exile|bounce|counter/i.test(q.aiHint.goal || '');
      for (const target of action.picks || []) {
        if (!(target instanceof U.CardInst) || target.ctrl === player) continue;
        const sem = inferCardSemantics(target.def);
        if (steals) breakdown.showstopper += 2 + permanentGameValue(game, target, player) * 0.35;
        if (interactionGoal && target.ctrl === leader) breakdown.showstopper += 3;
        if (sem.roles.some(role => ['engine', 'combo-piece', 'card-draw', 'finisher'].includes(role))) breakdown.showstopper += 2.5;
      }
    } else if (action.kind === 'chooseX' && mode === 'GAMBLE') {
      const source = q && q.src;
      if (source && /lose.*life|pay.*life/i.test(source.def && source.def.oracle || '')) {
        const x = Number(action.value) || 0;
        if (x < player.life && player.life - x >= 5) breakdown.showstopper += Math.min(4, x * 0.3);
      }
    }
  }

  function applyOliviaSaboteurScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const mode = oliviaSaboteurMode(game, player, view, profile);
    const opponents = player.opponents(game).filter(opponent => !opponent.lost);
    const threatOrder = opponents.slice().sort((a, b) =>
      playerThreatForGame(game, player, b) - playerThreatForGame(game, player, a) || a.idx - b.idx);
    const leader = threatOrder[0] || null;
    const ownBoard = game.bf().filter(card => card.ctrl === player);
    const top = game.stack[game.stack.length - 1];
    const topIsDangerous = !!(top && top.ctrl !== player && (top.ctrl === leader || (top.targets || []).flat()
      .some(target => target === player || target && target.ctrl === player)));
    breakdown.instigation = 0;

    if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      const sabotage = saboteurCard(card.def);
      const oracle = textOf(card.def);
      if (sabotage) breakdown.instigation += mode === 'DISRUPT' ? 7 : mode === 'MISDIRECT' ? 6 : 4;
      if (/goad|suspect|attacks each combat|attacks a player other than you|can't attack you/.test(oracle)) breakdown.instigation += 3.5;
      if (/change the target|choose new targets|gain control of|exchange control/.test(oracle)) breakdown.instigation += 4;
      if (/monarch|initiative|vote/.test(oracle)) breakdown.instigation += 2.5;
      if (sem.roles.includes('card-draw') || sem.roles.includes('engine')) breakdown.instigation += mode === 'INFILTRATE' ? 3.5 : 2;
      if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && mode === 'INFILTRATE') breakdown.instigation += 2.5;
      if (sem.roles.includes('counterspell')) breakdown.instigation += topIsDangerous ? 7 : -4;
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        const promised = game.diplomacyRequiredRemovalTarget && game.diplomacyRequiredRemovalTarget(player, card);
        if (promised || best && (best.target.ctrl === leader || best.score >= 7)) breakdown.instigation += mode === 'DISRUPT' ? 7 : 4;
        else breakdown.instigation -= 5;
      }
      if (sem.roles.includes('board-wipe')) {
        const mine = boardValueFor(game, player);
        const theirs = opponents.reduce((sum, opponent) => sum + boardValueFor(game, opponent), 0);
        if (mode === 'DISRUPT' && theirs > mine * 1.3) breakdown.instigation += 8;
        else breakdown.instigation -= 8;
      }
      if (sem.roles.includes('finisher')) breakdown.instigation += mode === 'AMBUSH' ? 8 : mode === 'INFILTRATE' ? -3 : 1;
      if (sem.roles.includes('stax') && !sabotage) breakdown.instigation -= 6;
      const heldInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (heldInteraction && game.turnPlayer === player && game.phase === 'main1' &&
        availableManaEstimate(game, player) - spend < 1 && mode !== 'AMBUSH' && !sabotage) breakdown.instigation -= mode === 'DISRUPT' ? 6 : 3;
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const sem = inferCardSemantics(entry.card.def);
      const label = String(entry.label || entry.ability && entry.ability.label || '').toLowerCase();
      if (saboteurCard(entry.card.def) || /goad|suspect|monarch|change.*target|gain control|tap target|can't attack you/.test(label)) {
        breakdown.instigation += mode === 'DISRUPT' ? 7 : 5;
      } else if (sem.roles.some(role => ['engine', 'card-draw', 'card-selection'].includes(role))) {
        breakdown.instigation += mode === 'INFILTRATE' ? 3.5 : 2;
      }
    } else if (action.kind === 'pass' || action.kind === 'done') {
      const heldInteraction = (player.hand || []).some(card => inferCardSemantics(card.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (heldInteraction && availableManaEstimate(game, player) >= 1 && mode !== 'AMBUSH') {
        breakdown.instigation += mode === 'DISRUPT' ? 4 : 2;
      }
    } else if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      const priorByDefender = new Map();
      const distinctDefenders = new Set();
      for (const item of assignments) {
        const defender = item.target instanceof U.Player ? item.target : item.target && item.target.ctrl;
        if (!defender) continue;
        distinctDefenders.add(defender.idx);
        const prior = priorByDefender.get(defender.idx) || 0;
        priorByDefender.set(defender.idx, prior + 1);
        const assessment = attackAssignmentAssessment(game, player, item.card, item.target, prior);
        if (assessment.freeBlock || !assessment.dealsDamage) breakdown.instigation -= 8;
        else {
          breakdown.instigation += mode === 'INFILTRATE' ? 1.5 : mode === 'AMBUSH' ? 5.5 : 3;
          if (!assessment.blockable) breakdown.instigation += 2.5;
          if (defender === leader) breakdown.instigation += mode === 'DISRUPT' ? 5 : 2.5;
          if (game.monarch === defender) breakdown.instigation += 5;
          if (/combat damage|whenever .* attacks|attacks,|create .*treasure|exile the top|draw a card/i.test(item.card.def.oracle || '')) {
            breakdown.instigation += 4;
          }
          if (assessment.lethal || assessment.commanderLethal) breakdown.instigation += mode === 'AMBUSH' ? 30 : defender === leader ? 18 : -8;
        }
      }
      if (distinctDefenders.size > 1) breakdown.instigation += Math.min(4, distinctDefenders.size * 1.25);
      const untappedAfter = game.creatures(player).filter(card => !card.tapped && !assignments.some(item => item.card === card)).length;
      if (assignments.length && untappedAfter === 0 && mode !== 'AMBUSH') breakdown.instigation -= 4;
      if (!assignments.length && mode === 'AMBUSH') breakdown.instigation -= 10;
    } else if (action.kind === 'chooseTargets') {
      const source = q && (q.src || q.data && (q.data.card || q.data.src));
      const sourceOracle = textOf(source && source.def);
      const manipulates = /goad|suspect|gain control of|exchange control|change the target|choose new targets|attacks each combat|can't attack you/.test(sourceOracle);
      const interactionGoal = q && q.aiHint && /removal|damage|destroy|exile|bounce|counter|control|goad|suspect/i.test(q.aiHint.goal || '');
      for (const target of action.picks || []) {
        if (target instanceof U.CardInst && target.ctrl !== player) {
          const targetSem = inferCardSemantics(target.def);
          const value = permanentGameValue(game, target, player);
          if (manipulates) breakdown.instigation += 2 + value * 0.3;
          if (target.ctrl === leader && (manipulates || interactionGoal)) breakdown.instigation += 4;
          if (targetSem.roles.some(role => ['engine', 'combo-piece', 'card-draw', 'finisher'].includes(role))) breakdown.instigation += 3;
        } else if (target instanceof U.Player && target !== player) {
          if (target === leader) breakdown.instigation += 4;
          if (game.monarch === target) breakdown.instigation += 3;
        }
      }
    } else if (action.kind === 'chooseOption') {
      const value = String(action.value || action.option && (action.option.value || action.option.key || action.option.label) || '').toLowerCase();
      if (/goad|suspect|monarch|initiative|steal|control|redirect|new target/.test(value)) breakdown.instigation += mode === 'DISRUPT' ? 7 : 5;
    }
  }

  // Core archetypes (Aggressive, Opportunist, Defensive, Saboteur) carry the
  // persona weights declared in MTG.AI_STYLES. Until 2026-09-02 those weights
  // were only read by the legacy fallback controller, so in AI V2 the four
  // styles produced the exact same decisions as Balanced. This policy turns
  // them into real behaviour: appetite for attacking and blocking, who gets
  // hunted, and which kinds of spells the seat likes to cast. Balanced stays
  // neutral; the named signature styles keep their dedicated policies; a
  // custom skill built on a core base inherits this policy.
  const CORE_ARCHETYPES = new Set(['aggressive', 'opportunist', 'passive', 'teaser']);
  const CORE_PROFILE_MULTIPLIERS = Object.freeze({
    aggressive: Object.freeze({ lifeSafety: 0.8, boardPresence: 1.25, interaction: 0.85, commanderProgress: 1.15, recoveryPotential: 0.85 }),
    opportunist: Object.freeze({ lifeSafety: 0.9, boardPresence: 1.1, cardAdvantage: 1.05, interaction: 0.95 }),
    passive: Object.freeze({ lifeSafety: 1.35, boardPresence: 0.9, interaction: 1.25, recoveryPotential: 1.2 }),
    teaser: Object.freeze({ interaction: 1.2, cardAdvantage: 1.05, boardPresence: 0.95 }),
  });
  function coreArchetypeTraits(player) {
    const base = MTG.getAIBaseStyle(player && player.aiStyle);
    return CORE_ARCHETYPES.has(base) ? MTG.AI_STYLES[base] || null : null;
  }
  function woundedRatio(target) {
    const life = Number(target && target.life);
    return Number.isFinite(life) ? 1 - Math.max(0, Math.min(1, life / 40)) : 0;
  }
  function applyCoreArchetypeScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const traits = coreArchetypeTraits(player);
    if (!traits) return;
    breakdown.archetype = 0;
    const defenderOf = target => target instanceof U.Player ? target : target && target.ctrl || null;
    const threatOf = defender => defender ? MTG.assessPlayerThreat(view, player.idx, defender.idx).totalScore : 0;
    const opponents = player.opponents(game).filter(o => !o.lost);
    const leader = opponents.length > 1
      ? opponents.map(o => ({ o, t: threatOf(o) })).reduce((best, row) => (!best || row.t > best.t ? row : best), null)
      : null;
    if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      if (!assignments.length) {
        // atkThr > 0 means the seat is happy to stay home; < 0 hates it.
        breakdown.archetype += traits.atkThr * 1.2;
        return;
      }
      let bonus = -traits.atkThr * 0.8 * Math.min(assignments.length, 6);
      for (const item of assignments) {
        const defender = defenderOf(item.target);
        if (!defender) continue;
        bonus += traits.lowLifeHunt * woundedRatio(defender) * 1.3;
        if (leader && defender === leader.o) bonus += traits.focusLeader * 0.9;
      }
      breakdown.archetype += bonus;
      // Risk appetite: an aggressive seat discounts the defensive forecast,
      // a defensive seat weighs it more. Lethal danger stays enormous.
      const riskScale = traits.atkThr < 0 ? 0.5 : traits.atkThr > 1 ? 1.6 : 1;
      if (breakdown.safety < 0) breakdown.safety *= riskScale;
    } else if (action.kind === 'declareBlockers') {
      const blocks = (action.assignments || []).length;
      // blockThr > 0: reluctant to block (keeps attackers); < 0: eager.
      breakdown.archetype += -traits.blockThr * 1.0 * Math.min(blocks, 4);
      if (traits.keepBlockers && blocks === 0 && (q && q.attackers || []).length) breakdown.archetype -= 0.8;
    } else if (action.kind === 'cast') {
      const roles = inferCardSemantics(action.card.def).roles;
      const has = role => roles.includes(role);
      let bonus = 0;
      if (has('creature') || has('token-maker')) bonus += traits.castCreature * 2.2;
      if (has('direct-damage') || has('single-target-removal') || has('finisher')) bonus += traits.castDamage * 1.8;
      if (has('protection') || has('lifegain') || has('combat-trick')) bonus += traits.castDefense * 1.8;
      if (has('stax') || has('commander-support')) bonus += traits.castPolitics * 1.2;
      if (has('board-wipe')) bonus += traits.wipeBias * 2.2;
      if (has('counterspell')) bonus += traits.counterBias * 2;
      breakdown.archetype += bonus;
    } else if (action.kind === 'chooseTargets') {
      // Player targets for damage, discard or drain: hunt the wounded, or
      // the leader, or (opportunist) anyone but the leader.
      for (const pick of action.picks || []) {
        if (!(pick instanceof U.Player) || pick === player) continue;
        breakdown.archetype += traits.lowLifeHunt * woundedRatio(pick) * 1.2;
        if (leader && pick === leader.o) breakdown.archetype += traits.focusLeader * 0.8;
      }
    }
  }

  function applyStyleSkillScore(view, action, profile, q, breakdown) {
    const privateData = PRIVATE_VIEWS.get(view);
    const game = privateData.game, player = privateData.player;
    const skill = styleSkillFor(player);
    applyCoreArchetypeScore(view, action, profile, q, breakdown);
    if (MTG.AI_STYLES?.[player.aiStyle]?.custom && action.kind === 'cast') {
      const roles = inferCardSemantics(action.card.def).roles;
      breakdown.customSkill = roles.reduce((sum, role) => sum + (skill.roleBonuses[role] || 0), 0);
      // Josh already applies its reserve in the inherited value-engine policy.
      if (skill.baseStyle !== 'josh' && skill.reserveMana > 0 && game.turnPlayer === player && game.phase === 'main1') {
        const heldInteraction = player.hand.some(card => card !== action.card && inferCardSemantics(card.def).roles
          .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
        const cost = game.spellCost(player, action.card, Object.assign({}, action.alt || {}, { from: action.from }));
        const spend = (cost.generic || 0) + (cost.pips || []).length;
        if (heldInteraction && availableManaEstimate(game, player) - spend < skill.reserveMana) breakdown.customSkill -= 5.5;
      }
    }
    if (skill && MTG.getAIBaseStyle(player.aiStyle) === 'jimmy') {
      applyJimmyAggroScore(view, action, profile, q, breakdown);
      return;
    }
    if (skill && MTG.getAIBaseStyle(player.aiStyle) === 'rachel') {
      applyRachelBalancedScore(view, action, profile, q, breakdown);
      return;
    }
    if (skill && MTG.getAIBaseStyle(player.aiStyle) === 'post') {
      applyPostOpportunistScore(view, action, profile, q, breakdown);
      return;
    }
    if (skill && MTG.getAIBaseStyle(player.aiStyle) === 'olivia') {
      applyOliviaSaboteurScore(view, action, profile, q, breakdown);
      return;
    }
    if (!skill || MTG.getAIBaseStyle(player.aiStyle) !== 'josh') return;
    const mode = joshValueEngineMode(game, player, view, profile);
    breakdown.valueEngine = 0;
    if (action.kind === 'cast') {
      const card = action.card;
      const sem = inferCardSemantics(card.def);
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      const engineCard = sem.roles.includes('engine') || sem.roles.includes('card-draw');
      if (sem.roles.includes('engine')) breakdown.valueEngine += 4.5;
      if (sem.roles.includes('card-draw')) breakdown.valueEngine += 3;
      if (sem.roles.includes('card-selection')) breakdown.valueEngine += 1.5;
      if ((sem.roles.includes('ramp') || sem.roles.includes('mana-rock')) && mode === 'SETUP') breakdown.valueEngine += 3;
      if (sem.roles.includes('protection')) breakdown.valueEngine += mode === 'SHIELDS_UP' ? 5 : 2;
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        const promised = game.diplomacyRequiredRemovalTarget && game.diplomacyRequiredRemovalTarget(player, card);
        if (!promised && (!best || best.score < 6.5) && mode !== 'SHIELDS_UP') breakdown.valueEngine -= 7;
        else if (mode === 'SHIELDS_UP') breakdown.valueEngine += 4;
      }
      if (sem.roles.includes('counterspell') && mode === 'SHIELDS_UP') breakdown.valueEngine += 4;
      if ((sem.roles.includes('finisher') || sem.roles.includes('combo-piece')) && mode === 'SETUP' && !engineCard) breakdown.valueEngine -= 3;
      if (sem.roles.includes('creature') && !engineCard && !sem.roles.includes('ramp') && mode === 'SETUP') breakdown.valueEngine -= 1.5;
      const heldInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      const available = availableManaEstimate(game, player);
      const reserve = Math.min(skill.reserveMana, available);
      if (heldInteraction && game.turnPlayer === player && game.phase === 'main1' && available - spend < reserve) {
        breakdown.valueEngine -= mode === 'SHIELDS_UP' ? 10 : 5.5;
      }
      const instantSpeed = card.is('Instant') || card.kw('flash');
      if (instantSpeed && game.phase === 'end' && game.turnPlayer !== player && !game.stack.length &&
        (engineCard || sem.roles.includes('card-selection') || sem.roles.includes('token-maker'))) breakdown.valueEngine += 3;
      if (mode === 'CLOSE' && sem.roles.includes('finisher')) breakdown.valueEngine += 5;
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const sem = inferCardSemantics(entry.card.def);
      const label = String(entry.label || entry.ability && entry.ability.label || '').toLowerCase();
      const repeatableValue = sem.roles.includes('engine') || sem.roles.includes('card-draw') ||
        /draw|vuci|karta|token|investigate|clue|treasure|untap/.test(label);
      if (repeatableValue) breakdown.valueEngine += mode === 'SHIELDS_UP' ? 2 : 3.5;
      if (repeatableValue && game.phase === 'end' && game.turnPlayer !== player && !game.stack.length) breakdown.valueEngine += 4;
    } else if (action.kind === 'pass' || action.kind === 'done') {
      const heldInteraction = (player.hand || []).some(card => inferCardSemantics(card.def).roles
        .some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (heldInteraction && game.turnPlayer === player && game.phase === 'main1' && availableManaEstimate(game, player) >= 2) {
        breakdown.valueEngine += mode === 'SHIELDS_UP' ? 8 : 4.5;
      }
    } else if (action.kind === 'declareAttackers') {
      const assignments = action.assignments || [];
      const hitsMonarch = assignments.some(item => {
        const defender = item.target instanceof U.Player ? item.target : item.target && item.target.ctrl;
        return defender && game.monarch === defender;
      });
      if (mode === 'SETUP') breakdown.valueEngine -= assignments.length * 9;
      else if (mode === 'VALUE') breakdown.valueEngine -= assignments.length * 4;
      else if (mode === 'CLOSE') breakdown.valueEngine += assignments.length * 4;
      if (hitsMonarch) breakdown.valueEngine += 8;
      const untappedAfter = game.creatures(player).filter(card => !card.tapped && !assignments.some(item => item.card === card)).length;
      if (assignments.length && untappedAfter === 0 && mode !== 'CLOSE') breakdown.valueEngine -= 3;
    } else if (action.kind === 'declareBlockers') {
      breakdown.valueEngine += (action.assignments || []).length * (mode === 'SHIELDS_UP' ? 2 : 0.7);
    } else if (action.kind === 'chooseTargets' && q && q.aiHint && /removal|damage|destroy|exile|bounce|counter/i.test(q.aiHint.goal || '')) {
      for (const target of action.picks || []) {
        if (!(target instanceof U.CardInst) || target.ctrl === player) continue;
        const sem = inferCardSemantics(target.def);
        if (sem.roles.includes('engine') || sem.roles.includes('combo-piece') || sem.roles.includes('card-draw')) breakdown.valueEngine += 3;
      }
    }
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
    if ((!specs || !specs.length) && !card.is('Instant') && !card.is('Sorcery')) {
      // A permanent chooses its ETB targets after resolving, not while being
      // cast. Its spell target list is therefore correctly empty, but that
      // must not hide a useful removal trigger from the local cast evaluator.
      specs = (card.def.triggers || []).filter(trigger => trigger.on === 'etb')
        .flatMap(trigger => typeof trigger.targets === 'function'
          ? trigger.targets(game, card, { card }) : trigger.targets || [])
        .filter(spec => ['removal', 'damage', 'bounce', 'debuff'].includes(spec.aiHint?.goal));
    }
    if (!specs || !specs.length) return null;
    const candidates = game.legalTargets(specs[0], card, player).filter(target => target instanceof U.CardInst && target.ctrl !== player);
    if (!candidates.length) return null;
    const compiledDamage = (card.def.oracleImplementation || []).find(operation =>
      operation.kind === 'spell-damage' && operation.what !== 'each opponent');
    const compiledDestroy = specs[0].aiHint && specs[0].aiHint.removalKind === 'destroy';
    const best = candidates.map(target => {
      let score = permanentGameValue(game, target, player);
      if (compiledDestroy && indestructibleStopsDestroy(target)) score = Number.NEGATIVE_INFINITY;
      if (compiledDamage && target.is('Creature') && damageProtectionSaves(target)) {
        // A damage spell cannot claim a lethal-removal bonus against a shield,
        // regeneration shield or indestructible creature. Keep a tiny chip
        // value so special damage payoffs may still reason about it, but make
        // an otherwise dead removal cast lose to holding the card.
        score = Math.min(score * 0.08, 1);
      } else if (compiledDamage && compiledDamage.n !== 'X' && Number.isFinite(Number(compiledDamage.n))) {
        // Three damage at a six-toughness creature removes nothing. The bot
        // used to value the target, not the kill, and spent its burn on
        // exactly the creatures it could not answer.
        const amount = Number(compiledDamage.n);
        const survives = target.is('Creature')
          ? Math.max(0, Number(target.toughness || 0) - Number(target.damage || 0)) > amount
          : target.is('Planeswalker') ? Number(target.counters && target.counters.loyalty || 0) > amount : false;
        if (survives) score = Math.min(score * 0.08, 1);
      }
      // Casting and choosing the target must budget the same Blight payment
      // as the later Ward prompt, including lethal damage on our recipient.
      if (wardOf(target)?.blight) score += wardTargetAdjustment(game, player, target, {
        src: card, so: { kind: 'spell' }, aiHint: specs[0].aiHint,
      });
      return { target, score };
    })
      .sort((a, b) => b.score - a.score || a.target.iid - b.target.iid)[0];
    return best && Number.isFinite(best.score) ? best : null;
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

  // Kad je pobjeda već na stolu, svaka dodatna kopija, token ili "value" potez
  // je samo odugovlačenje. Rezultat se pamti po viewu jer je view zamrznut
  // snapshot jedne odluke.
  const LETHAL_NOW_CACHE = new WeakMap();
  function lethalAttackReady(game, player) {
    // Ovo je pravilo o tempu i doživljaju partije, ne o ispravnosti poteza:
    // kad je pobjeda već na stolu, čovjek ne treba gledati još pet "value"
    // poteza. Zato vrijedi samo u partiji koja se zaista igra pred igračem;
    // headless dokazi i test matrice i dalje bacaju sve što je legalno.
    if (!game.paced) return null;
    if (game.turnPlayer !== player || game.phase !== 'main1') return null;
    if (game.stack.length) return null;
    if (player.turnState && player.turnState.reachedDeclareAttackers) return null;
    const eligible = game.creatures(player).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && game.canAttackAtAll(card));
    if (!eligible.length) return null;
    for (const opponent of player.opponents(game)) {
      const attackers = eligible.filter(card => game.canAttackTarget(card, opponent));
      if (!attackers.length) continue;
      const blockers = game.creatures(opponent).filter(card => !card.tapped && !card.cur.cantBlock);
      const defense = survivalBlocks(game, opponent, attackers, blockers);
      if (defense.outcome.lethal) return opponent;
    }
    return null;
  }
  function lethalAttackReadyCached(view, game, player) {
    if (!LETHAL_NOW_CACHE.has(view)) {
      let victim = null;
      try { victim = lethalAttackReady(game, player); } catch (error) { victim = null; }
      LETHAL_NOW_CACHE.set(view, victim);
    }
    return LETHAL_NOW_CACHE.get(view);
  }
  MTG.botLethalAttackReady = lethalAttackReady;

  // ---- Modal spells ------------------------------------------------------
  // Modovi su do sada padali na generički "ima riječ destroy → 2 boda", pa je
  // bot birao prvi ponuđeni mod. Poslije vlastitog wipea je zato ponovo birao
  // "uništi sva stvorenja" nad praznom tablom umjesto artefakata.
  const MODE_SWEEP_TYPES = [
    [/artifacts?[^.]*\benchantments?|enchantments?[^.]*\bartifacts?/i,
      card => !card.is('Land') && (card.is('Artifact') || card.is('Enchantment'))],
    [/\bartifacts?\b/i, card => card.is('Artifact') && !card.is('Land')],
    [/\benchantments?\b/i, card => card.is('Enchantment')],
    [/\bplaneswalkers?\b/i, card => card.is('Planeswalker')],
    [/\bnon-?dragons?\b/i, card => card.is('Creature') && !card.hasSub('Dragon')],
    [/\bdragons?\b/i, card => card.is('Creature') && card.hasSub('Dragon')],
    [/\bcreatures?\b/i, card => card.is('Creature')],
    [/\btokens?\b/i, card => card.isToken],
    [/\blands?\b/i, card => card.is('Land')],
  ];

  function destroyKindMatcher(kind) {
    if (!kind) return null;
    if (kind === 'dragons') return card => card.is('Creature') && card.hasSub('Dragon');
    if (kind === 'nondragons') return card => card.is('Creature') && !card.hasSub('Dragon');
    if (kind === 'creatures') return card => card.is('Creature');
    if (kind === 'artifacts') return card => card.is('Artifact') && !card.is('Land');
    if (kind === 'enchantments') return card => card.is('Enchantment');
    if (kind === 'planeswalkers') return card => card.is('Planeswalker');
    if (kind === 'artifactsEnchantments') return card => !card.is('Land') && (card.is('Artifact') || card.is('Enchantment'));
    return null;
  }

  function modeManaValueFilter(label) {
    const atMost = /(?:mv|mana value)\s*(?:≤|<=|<)\s*(\d+)/i.exec(label) ||
      /(?:mv|mana value)\s*(\d+)\s*or less/i.exec(label);
    if (atMost) { const n = Number(atMost[1]); return card => card.mv <= n; }
    const atLeast = /(?:mv|mana value)\s*(?:≥|>=|>)\s*(\d+)/i.exec(label) ||
      /(?:mv|mana value)\s*(\d+)\s*or greater/i.exec(label);
    if (atLeast) { const n = Number(atLeast[1]); return card => card.mv >= n; }
    return null;
  }

  // Vrijednost masovnog moda = ono što odnosi protivnicima minus ono što odnosi
  // meni. Mod koji ne pogađa ništa vrijedi nula, pa gubi od svakog korisnog.
  function modeSweepValue(game, player, option) {
    const label = String(option && option.label || '');
    const meta = option || {};
    let matcher = destroyKindMatcher(meta.destroyKind);
    if (!matcher) {
      const sweepVerb = /\b(destroy|exile|sacrifice|bounce|wipe|return)\b/i.test(label);
      const singleTarget = /\btarget\b/i.test(label);
      if (!sweepVerb || singleTarget) return null;
      const entry = MODE_SWEEP_TYPES.find(([pattern]) => pattern.test(label));
      if (!entry) return null;
      matcher = entry[1];
    }
    const mvFilter = modeManaValueFilter(label);
    let value = 0, theirs = 0, mine = 0;
    for (const permanent of game.bf()) {
      if (!matcher(permanent)) continue;
      if (mvFilter && !mvFilter(permanent)) continue;
      if (permanent.kw('indestructible') && /destroy/i.test(label)) continue;
      const worth = permanentGameValue(game, permanent, player);
      if (permanent.ctrl === player) { value -= worth * 1.35; mine++; } else { value += worth; theirs++; }
    }
    // Sam broj pogođenih permanenata nosi težinu: mana rock je po vrijednosti
    // sitan, ali mod koji čisti četiri protivnička mora jasno pobijediti mod
    // koji ne pogađa ništa.
    return value + theirs * 1.6 - mine * 1.6;
  }
  MTG.botModeSweepValue = modeSweepValue;

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
      const oracleOperations = card.def.oracleImplementation || [];
      const resolvingOperations = oracleOperations.filter(operation =>
        operation && operation.kind !== 'cycling' && !String(operation.kind || '').startsWith('mechanic-'));
      const cost = game.spellCost(player, card, Object.assign({}, action.alt || {}, { from: action.from }));
      const spend = (cost.generic || 0) + (cost.pips || []).length;
      breakdown.base = cardDefinitionValue(card.def) + Math.min(5, spend * 0.35);
      breakdown.synergy = sem.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length * 2;
      if (card.commander) breakdown.synergy += 2.2 * profile.commanderImportance;
      const temporaryCopies = (game.spellTargetSpecs(card, action.alt || {}, player) || [])
        .filter(spec => spec.aiHint && spec.aiHint.temporaryCopy);
      if (temporaryCopies.length) {
        const values = temporaryCopies.flatMap(spec => game.legalTargets(spec, card, player)
          .map(target => temporaryCopyValue(game, player, target, spec.aiHint)));
        const best = Math.max(0, ...values);
        // Zero targets is legal, but generic spellslinger/token bonuses must
        // not turn an empty cast or an immediately lost legend into value.
        if (best <= 0) breakdown.timing -= 100;
        else breakdown.combat += best * 0.3;
      }
      if (cost.lifeCost) {
        const lifePressure = player.life <= 8 ? 3 : player.life <= 15 ? 1.35 : 0.55;
        breakdown.safety -= Number(cost.lifeCost) * lifePressure;
        if (cost.lifeCost >= player.life) breakdown.safety -= 1000000;
      }
      // Phyrexian symbols are resolved by the mana solver, not represented as
      // cost.lifeCost. Inspect the actual selected payment plan so the bot does
      // not cast a legal spell by paying its final life and immediately lose.
      const payment = game.manaSolve(player, cost, { card, castOpts: action.alt || {}, xVal: 0 }, { xVal: 0 });
      const phyrexianLife = payment && payment.plan
        ? payment.plan.reduce((sum, step) => sum + Math.max(0, Number(step.phyrexianLife) || 0), 0)
        : 0;
      if (phyrexianLife) {
        const lifePressure = player.life <= 8 ? 3 : player.life <= 15 ? 1.35 : 0.55;
        breakdown.safety -= phyrexianLife * lifePressure;
        if (phyrexianLife >= player.life) breakdown.safety -= 1000000;
      }
      if (sem.roles.includes('ramp') && game.turnNo <= 16) breakdown.resources += 3;
      if (sem.roles.includes('card-draw') || sem.roles.includes('card-selection')) breakdown.resources += Math.max(0, 4 - player.hand.length) * 0.7;
      if (resolvingOperations.length && resolvingOperations.every(operation =>
        operation.kind === 'spell-tap' || operation.kind === 'spell-untap')) {
        const targetSpecs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        const changesState = targetSpecs.some(spec => game.legalTargets(spec, card, player).some(target =>
          target instanceof U.CardInst && (spec.aiHint && spec.aiHint.goal === 'tap' ? !target.tapped : !!target.tapped)));
        if (!changesState) breakdown.timing -= 100;
      }
      if (resolvingOperations.length && resolvingOperations.every(operation => operation.kind === 'spell-discard')) {
        const targetSpecs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        const canDiscard = targetSpecs.some(spec => game.legalTargets(spec, card, player).some(target =>
          target instanceof U.Player && target !== player && target.hand.length > 0));
        if (!canDiscard) breakdown.timing -= 100;
      }
      if (resolvingOperations.length && resolvingOperations.every(operation =>
        operation.kind === 'spell-pump' && Number(operation.power || 0) >= 0 && Number(operation.toughness || 0) >= 0)) {
        const targetSpecs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        const hasRelevantTarget = targetSpecs.some(spec => game.legalTargets(spec, card, player).some(target => {
          if (!(target instanceof U.CardInst) || target.ctrl !== player) return false;
          const operation = resolvingOperations[0];
          const keywords = (operation.keywords || []).map(keyword => String(keyword).toLowerCase());
          const hasteMatters = keywords.includes('haste') && target.sick && !target.tapped &&
            game.turnPlayer === player && phase === 'main1';
          const addsUsefulKeyword = hasteMatters || keywords.some(keyword =>
            keyword !== 'haste' && !target.kw(keyword));
          const statChange = Number(operation.power || 0) !== 0 || Number(operation.toughness || 0) !== 0;
          const inCombat = !!target.attacking || target.blocking !== null &&
            target.blocking !== undefined && target.blocking !== false;
          const canAttackNow = game.turnPlayer === player && phase === 'main1' && !target.tapped &&
            (!target.sick || target.kw('haste') || hasteMatters) && !target.cur.cantAttack;
          return (statChange || addsUsefulKeyword) && (inCombat || canAttackNow);
        }));
        const top = game.stack[game.stack.length - 1];
        const threatened = top && top.ctrl !== player ? (top.targets || []).flat().filter(target =>
          target instanceof U.CardInst && target.ctrl === player) : [];
        const reactiveEffect = resolvingOperations.some(operation =>
          Number(operation.power || 0) !== 0 || Number(operation.toughness || 0) > 0 ||
          (operation.keywords || []).some(keyword =>
            ['hexproof', 'indestructible', 'shroud'].includes(String(keyword).toLowerCase())));
        const reactive = reactiveEffect && threatened.length && targetSpecs.some(spec => {
          const legal = game.legalTargets(spec, card, player);
          return threatened.some(target => legal.includes(target));
        });
        if (!hasRelevantTarget && !reactive) breakdown.timing -= 100;
      }
      if (resolvingOperations.length && resolvingOperations.every(operation => operation.kind === 'spell-add-mana')) {
        const savedPool = Object.assign({}, player.pool);
        let usableFollowUp = false;
        try {
          for (const operation of resolvingOperations) {
            for (const [color, amount] of Object.entries(operation.produce || {})) {
              if (color === 'ANY') continue;
              player.pool[color] = (player.pool[color] || 0) + Math.max(0, Number(amount) || 0);
            }
          }
          usableFollowUp = game.castableList(player).some(entry => entry.card !== card) ||
            game.activatableList(player).some(entry => !entry.manaAbility && entry.card !== card &&
              (!entry.ability || !entry.ability.aiScore || entry.ability.aiScore(game, entry.card, player) > 0.2));
        } finally {
          for (const color of Object.keys(player.pool)) player.pool[color] = savedPool[color] || 0;
        }
        if (!usableFollowUp) breakdown.resources -= 100;
      }
      const immediateDraws = resolvingOperations.reduce((sum, operation) => {
        if (operation.kind === 'spell-draw') return sum + Math.max(0, Number(operation.n) || 0);
        if (operation.kind === 'spell-draw-discard') return sum + Math.max(0, Number(operation.draw) || 0);
        if (operation.kind === 'etb-draw') return sum + Math.max(0, Number(operation.n) || 0);
        if (operation.kind === 'etb-loot' && operation.order === 'draw-discard') return sum + 1;
        return sum;
      }, mandatoryCastTriggerDraws(game, player, card));
      if (immediateDraws > player.library.length) {
        const emptyLibraryWin = game.bf().some(source => source.ctrl === player &&
          /(?:draw a card while your library has no cards|draw from an empty library).*(?:win|instead)/i.test(
            String(source.def && source.def.oracle || '')));
        if (!emptyLibraryWin) breakdown.safety -= 1000000;
      }
      // Tempiranje instanata: reaktivne karte (trick/protection/counter) se
      // drže za tuđe akcije, a value instanti se radije bacaju na kraju tuđeg
      // poteza nego u vlastitoj main fazi sa praznim stackom.
      const instantSpeed = card.is('Instant') || card.kw('flash');
      const relevantHasteNow = resolvingOperations.some(operation =>
        operation.kind === 'spell-pump' &&
        (operation.keywords || []).some(keyword => String(keyword).toLowerCase() === 'haste')) &&
        game.turnPlayer === player && phase === 'main1' &&
        (game.spellTargetSpecs(card, action.alt || {}, player) || []).some(spec =>
          game.legalTargets(spec, card, player).some(target => target instanceof U.CardInst &&
            target.ctrl === player && target.sick && !target.tapped && !target.cur.cantAttack));
      if (instantSpeed && !game.stack.length && game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) {
        if (sem.roles.includes('combat-trick') || sem.roles.includes('protection')) breakdown.timing -= 10;
        else if (sem.roles.includes('single-target-removal')) breakdown.timing -= 2.2;
        else if (!sem.roles.includes('ramp') && !sem.roles.includes('mana-rock') && !relevantHasteNow) breakdown.timing -= 3;
      }
      if (instantSpeed && phase === 'end' && game.turnPlayer !== player && !game.stack.length &&
        (sem.roles.includes('card-draw') || sem.roles.includes('card-selection') || sem.roles.includes('token-maker'))) {
        breakdown.timing += 2.5;
      }
      // Combat tricks need a concrete reason to beat "hold interaction".  A
      // one-mana pump otherwise scored below passing even while one of our
      // creatures was already blocked, so the bot could never demonstrate
      // otherwise-supported Oracle pump cards.  Only reward a live combatant
      // that is legal for the semantic target direction supplied by the card
      // script (friendly buff versus hostile removal/damage).
      const attackingAnyTeamPumps = (card.def.oracleImplementation || []).filter(operation =>
        operation.kind === 'spell-team-pump' && operation.attackingOnly &&
        (operation.controller || 'any') === 'any');
      const compiledGlobalPumps = (card.def.oracleImplementation || []).filter(operation =>
        operation.kind === 'spell-global-pump');
      const controlledStaticPumps = (card.def.oracleImplementation || []).filter(operation =>
        operation.kind === 'controlled-creature-pump-static');
      if (phase === 'combat' && sem.roles.includes('combat-trick') && game.combat &&
        !attackingAnyTeamPumps.length && !compiledGlobalPumps.length) {
        const attackers = game.combat.attackers || [];
        const blockers = game.bf().filter(candidate => candidate.blocking);
        const combatants = [...new Set([...attackers, ...blockers])];
        let relevant = [];
        const specs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        if (specs.length) {
          const spec = specs[0];
          const goal = spec.aiHint && spec.aiHint.goal || '';
          const legal = game.legalTargets(spec, card, player);
          relevant = combatants.filter(candidate => legal.includes(candidate) &&
            (/buff|pump|protect/.test(goal) ? candidate.ctrl === player
              : /removal|damage|destroy|exile|bounce|debuff/.test(goal) ? candidate.ctrl !== player
                : true));
        } else {
          relevant = combatants.filter(candidate => candidate.ctrl === player);
        }
        if (relevant.length) breakdown.combat += 2.4 + Math.min(2.4, relevant.length * 0.6);
      }
      for (const operation of attackingAnyTeamPumps) {
        const affected = game.bf().filter(candidate => candidate.is('Creature') && !!candidate.attacking);
        const own = affected.filter(candidate => candidate.ctrl === player).length;
        const hostile = affected.length - own;
        // These effects modify every attacker, regardless of controller. Score
        // the printed change from our perspective: a positive pump is useful
        // on our attackers and harmful on hostile ones; a negative pump is the
        // inverse. This also keeps Hydrolash's draw as a rider on a useful
        // hostile debuff instead of treating all team pumps as friendly buffs.
        const perAttacker = Number(operation.power || 0) * 4 +
          Number(operation.toughness || 0) * 2.5 + (operation.keywords || []).length * 3;
        const netEffect = (own - hostile) * perAttacker;
        breakdown.combat += netEffect;
        if (!affected.length || netEffect <= 0) breakdown.timing -= 12;
      }
      if (sem.roles.includes('counterspell')) {
        const top = game.stack[game.stack.length - 1];
        // A counter answers someone else's spell. With nothing of theirs on the
        // Stack there is nothing to answer, so the card is never spent; when
        // only our own spell sits on top the answer simply waits.
        const opposing = game.stack.filter(object => object.kind === 'spell' && object.ctrl !== player);
        if (!opposing.length) breakdown.timing -= 1000;
        else if (top && top.ctrl === player) breakdown.timing -= 25;
        else if (top.kind === 'spell' && MTG.isUncounterable && MTG.isUncounterable(game, top)) {
          // The spell remains a legal target, but a counter-only response has
          // no tactical effect. Incidental riders such as Dismiss's draw do
          // not justify spending the card and mana while the threat resolves.
          breakdown.timing -= 100;
        } else {
          const spell = top.card || top.srcCard;
          const spellValue = spell ? cardDefinitionValue(spell.def) : 3;
          breakdown.threat += spellValue * 1.6 + playerThreatForGame(game, player, top.ctrl) * 0.12;
          if (top.targets && top.targets.flat().some(target => target && (target === player || target.ctrl === player))) breakdown.safety += 12;
        }
      }
      if (sem.roles.includes('single-target-removal')) {
        const best = bestRemovalCandidate(game, player, card, action.alt);
        const specs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        const canBurnOpponent = sem.roles.includes('direct-damage') && specs.some(spec =>
          game.legalTargets(spec, card, player).some(target => target instanceof U.Player && target !== player));
        const removalThreshold = card.is('Instant') || card.is('Sorcery') ? 3.4 : 0;
        if (best && best.score > removalThreshold) breakdown.threat += best.score * 0.85;
        else if (canBurnOpponent) breakdown.threat += 1.2;
        else breakdown.timing -= 10;
        const promised = game.diplomacyRequiredRemovalTarget && game.diplomacyRequiredRemovalTarget(player, card);
        if (promised) {
          // A public removal pact should materially change the bot's plan. The
          // target picker is constrained by diplomacy.js; this bonus makes the
          // bot actually cast the announced answer before its deadline.
          breakdown.timing += 28;
          breakdown.threat += 12;
        }
      }
      const compiledDamage = (card.def.oracleImplementation || []).find(operation =>
        operation.kind === 'spell-damage' && operation.n !== 'X' && operation.what !== 'each opponent');
      if (compiledDamage) {
        const amount = Math.max(0, Number(compiledDamage.n) || 0);
        const specs = game.spellTargetSpecs(card, action.alt || {}, player) || [];
        const candidates = specs.flatMap(spec => game.legalTargets(spec, card, player));
        const lethalPermanents = candidates.filter(target => target instanceof U.CardInst && target.ctrl !== player &&
          ((target.is('Creature') && !damageProtectionSaves(target) && target.toughness - target.damage <= amount) ||
            (target.is('Planeswalker') && !damageProtectionSaves(target) && (target.counters.loyalty || 0) <= amount)));
        const lethalPlayers = candidates.filter(target => target instanceof U.Player && target !== player && target.life <= amount);
        if (lethalPermanents.length) {
          const best = Math.max(...lethalPermanents.map(target => permanentGameValue(game, target, player)));
          breakdown.threat += 5 + best * 0.9;
        }
        if (lethalPlayers.length) breakdown.threat += 35;
      }
      // ---- Spell-heavy playbook, cast side ----
      // (1) Cast triggers on the board make every cheap spell worth more, and
      //     worth casting before combat.
      // (2) Instant-speed removal in our own main phase is only worth it
      //     against a real threat; a Bolt on a 2/2 is how a spellslinger runs
      //     out of answers before the table's real threats arrive.
      // (3) A cantrip with nothing to trigger waits for an opponent's end step.
      // (4) A cast that leaves no mana for the answer still in hand costs
      //     that answer for three opposing turns.
      const isSpellCard = card.is('Instant') || card.is('Sorcery');
      const payoffs = isSpellCard ? spellCastPayoffs(game, player) : 0;
      if (payoffs) {
        breakdown.synergy += Math.min(4.5, 1.4 * payoffs);
        if (game.turnPlayer === player && phase === 'main1') breakdown.timing += 1;
      }
      const holdWeight = answerHoldWeight(profile);
      const ownMainEmptyStack = game.turnPlayer === player && !game.stack.length && (phase === 'main1' || phase === 'main2');
      const worthAnswering = holdWeight > 0 && tableWorthAnswering(game, player);
      if (ownMainEmptyStack && worthAnswering && instantSpeed && isSpellCard && breakdown.threat < 20 &&
        (sem.roles.includes('single-target-removal') || sem.roles.includes('direct-damage'))) {
        // What would this answer actually remove right now? Damage counts only
        // what it kills; "any target" burn is judged by its best creature kill.
        const best = bestRemovalCandidate(game, player, card, action.alt);
        let bestNow = best ? best.score : 0;
        const damageOperation = (card.def.oracleImplementation || []).find(operation =>
          operation.kind === 'spell-damage' && operation.n !== 'X' && Number.isFinite(Number(operation.n)));
        if (damageOperation) {
          const amount = Number(damageOperation.n);
          for (const spec of game.spellTargetSpecs(card, action.alt || {}, player) || []) {
            for (const target of game.legalTargets(spec, card, player)) {
              if (!(target instanceof U.CardInst) || target.ctrl === player || !target.is('Creature')) continue;
              if (damageProtectionSaves(target) || Number(target.toughness || 0) - Number(target.damage || 0) > amount) continue;
              bestNow = Math.max(bestNow, permanentGameValue(game, target, player));
            }
          }
        }
        if (bestNow < 6.5) breakdown.timing -= 3 + 2 * holdWeight;
      }
      const valueInstant = instantSpeed && isSpellCard && !sem.roles.includes('ramp') &&
        !sem.roles.includes('counterspell') && !sem.roles.includes('single-target-removal') &&
        !sem.roles.includes('direct-damage') && !sem.roles.includes('combat-trick') && !sem.roles.includes('protection') &&
        (sem.roles.includes('card-draw') || sem.roles.includes('card-selection') || sem.roles.includes('token-maker'));
      // A cantrip is held in the main phase only when the mana is being kept
      // open for an answer anyway; otherwise holding it just lets the mana rot
      // once the rest of the turn taps out. On opponents' turns it waits for
      // the end step, and while an answer is still in hand it waits for the
      // last end step before our own untap so the answer keeps its mana.
      const heldAnswers = heldInstantAnswers(player, card);
      const reserveNeed = cheapestManaValue(heldAnswers);
      const availableNow = availableManaEstimate(game, player);
      // Would this cast leave less mana than the cheapest answer in hand costs?
      const eatsReserve = reserveNeed > 0 && availableNow >= reserveNeed && availableNow - spend < reserveNeed;
      const lastWindowBeforeUntap = game.turnPlayer !== player && game.nextPlayer(game.turnPlayer) === player;
      if (ownMainEmptyStack && valueInstant && !payoffs && eatsReserve) breakdown.timing -= 3 + holdWeight;
      if (valueInstant && game.turnPlayer !== player && !game.stack.length) {
        if (phase !== 'end') breakdown.timing -= 4 + holdWeight;
        else if (eatsReserve && !lastWindowBeforeUntap) breakdown.timing -= 8 + holdWeight;
      }
      if (worthAnswering && game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) {
        // The commander, the deck's engines and a real removal play are worth
        // tapping out for; filler is not. The reserve has to cost about what a
        // held answer is worth, or the bot taps out for a two-drop every turn
        // and is never asked for priority on the three turns in between.
        const keyPlay = card.commander || profile.importantEngines.includes(card.name) || breakdown.threat >= 8 ||
          sem.roles.includes('ramp') || sem.roles.includes('mana-rock');
        if (eatsReserve && !keyPlay) breakdown.resources -= (phase === 'main1' ? 4 : 3) + 2.5 * holdWeight;
      }
      // A deck with almost no creatures still needs a body in front of it.
      if (sem.roles.includes('creature') && !card.is('Instant')) {
        const blockers = game.creatures(player).filter(creature => !(creature.cur && creature.cur.cantBlock)).length;
        const attackers = blockers <= 1 ? visibleAttackersAgainst(game, player) : 0;
        if (attackers >= 2) breakdown.safety += Math.min(4, 1.2 * attackers) * (player.life <= 25 ? 1.5 : 1);
      }
      const compiledFog = (card.def.oracleImplementation || []).find(operation => operation.kind === 'spell-fog');
      if (compiledFog && game.combat) {
        const incoming = (game.combat.attackers || []).filter(attacker => attacker.ctrl !== player &&
          (attacker.attacking === player || attacker.attacking && attacker.attacking.ctrl === player));
        const prevented = incoming.reduce((sum, attacker) => sum + Math.max(0, attacker.power || 0), 0);
        if (incoming.length) breakdown.safety += 7 + Math.min(28, prevented * 0.7);
        else breakdown.timing -= 10;
      }
      if (compiledGlobalPumps.length) {
        const projected = compiledGlobalPumps.reduce((sum, operation) => {
          const effect = globalPumpNetEffect(game, player, operation);
          sum.board += effect.board;
          sum.combat += effect.combat;
          return sum;
        }, { board: 0, combat: 0 });
        const net = projected.board + projected.combat;
        breakdown.threat += projected.board;
        breakdown.combat += projected.combat;
        if (net <= 0) breakdown.timing -= 6 + Math.min(18, Math.abs(net) * 0.45);
      }
      if (controlledStaticPumps.length) {
        const creatures = game.creatures(player).slice();
        if (card.is('Creature')) creatures.push(card);
        let persistentNet = 0;
        for (const operation of controlledStaticPumps) {
          const power = Number(operation.power || 0);
          const toughness = Number(operation.toughness || 0);
          for (const creature of creatures) {
            const currentToughness = Number(creature.toughness || creature.def && creature.def.toughness || 0);
            const beforeDies = diesAfterGlobalPump(creature, currentToughness);
            const afterDies = diesAfterGlobalPump(creature, currentToughness + toughness);
            if (beforeDies !== afterDies) {
              const permanentValue = 6 + permanentGameValue(game, creature, player);
              persistentNet += (afterDies ? -permanentValue : permanentValue);
            } else if (!afterDies) {
              persistentNet += power * 0.6 + toughness * 0.45;
            }
          }
        }
        breakdown.threat += persistentNet;
        if (persistentNet <= 0) breakdown.timing -= 8 + Math.min(24, Math.abs(persistentNet) * 0.6);
      }
      if (sem.roles.includes('board-wipe') && !compiledGlobalPumps.length) {
        // Wipe se procjenjuje po STVARNOM skupu koji pogađa. Generički Oracle
        // destroy-all može čistiti artefakte ili enchantmente, dok stariji
        // damage wipeovi i dalje pogađaju stvorenja.
        const oracle = textOf(card.def);
        const damageMatch = /(\d+)\s+damage\s+to\s+each\s+creature/.exec(oracle);
        const wipeDamage = damageMatch ? Number(damageMatch[1]) : null;
        const destroyAll = resolvingOperations.find(operation => operation.kind === 'spell-destroy-all');
        const affectedType = destroyAll && destroyAll.what
          ? destroyAll.what.charAt(0).toUpperCase() + destroyAll.what.slice(1).replace(/s$/, '')
          : 'Creature';
        const affected = game.bf().filter(permanent => permanent.is(affectedType));
        const wouldDie = permanent => {
          if (permanent.kw('indestructible') ||
            (permanent.counters && (permanent.counters.shield || 0) > 0)) return false;
          if (Number(permanent.regenShield || 0) > 0 && !(destroyAll && destroyAll.noRegen)) return false;
          if (wipeDamage !== null) {
            return permanent.is('Creature') &&
              (permanent.toughness || 0) - (permanent.damage || 0) <= wipeDamage;
          }
          return true;
        };
        let mineLoss = 0, theirsLoss = 0;
        for (const permanent of affected) {
          if (!wouldDie(permanent)) continue;
          const value = permanentGameValue(game, permanent, player);
          if (permanent.ctrl === player) mineLoss += value; else theirsLoss += value;
        }
        breakdown.threat += (theirsLoss - mineLoss) * 0.45;
        if (theirsLoss < mineLoss + 3) breakdown.timing -= 20;   // gubim više nego protivnici
        if (theirsLoss < 4) breakdown.timing -= 8;               // nema se šta počistiti
        const evalNow = MTG.evaluateState(view, player.idx, profile);
        if (evalNow.immediateLossRisk > 40 && theirsLoss > 0) breakdown.safety += 35;
      }
      // X spellovi: vrijednost raste sa stvarno dostupnim X. Bacanje damage/draw
      // X spella dok je X sitno je trošenje karte.
      if (cost.x && !(action.alt && action.alt.free)) {
        let maxX = 0;
        try { maxX = game.maxAffordableX(player, cost, card); } catch (error) { maxX = 0; }
        breakdown.base += Math.min(6, maxX * 0.7) - 1.5;
        if (maxX <= 1 && game.turnNo > 4) breakdown.timing -= 6;
      }
      const openAfter = availableManaEstimate(game, player) - spend;
      const hasInteraction = (player.hand || []).some(held => held !== card && inferCardSemantics(held.def).roles.some(role => ['counterspell', 'single-target-removal', 'protection'].includes(role)));
      if (hasInteraction && openAfter <= 0 && phase === 'main1') breakdown.resources -= 2.7;
      // Rezervacija za komandera: instant-speed trošenje u vlastitim
      // pre/post-main priority prozorima ne smije pojesti manu za (re)cast
      // komandera iz command zone u nadolazećoj main fazi.
      if (q && q.type === 'priority' && game.turnPlayer === player && !(card.commander && card.zone === 'command')) {
        const inCz = (player.commanders || []).filter(cmd => cmd.zone === 'command');
        if (inCz.length) {
          const needed = Math.min(...inCz.map(cmd => U.mv(cmd.def.cost || '') + 2 * (cmd.cmdCasts || 0)));
          const availableNow = availableManaEstimate(game, player);
          if (availableNow >= needed && openAfter < needed) {
            breakdown.resources -= 6 * (profile.weights && profile.weights.commanderProgress || 1);
          }
        }
      }
      const opponentRisk = Math.max(0, ...view.players.filter(row => row.id !== player.idx && !row.lost).map(row => estimateInteractionRisk(view, row.id)));
      if (sem.roles.includes('finisher') || sem.roles.includes('combo-piece')) breakdown.safety -= opponentRisk * 0.22;
      if (q && q.type === 'priority') {
        const top = game.stack[game.stack.length - 1];
        // Poslije vlastite akcije priority ostaje kod istog igrača. Dodatni
        // spell preko vlastitog stack objekta je skoro uvijek sequencing greška
        // i kod ponovljivih aktivacija može praviti beskrajni priority niz.
        if (top && top.ctrl === player) breakdown.timing -= 45;
        // Vlastiti potez, prazan stack: sve van combata (upkeep/draw/main/end)
        // je sequencing greška — akcije idu kroz main prozor, ne kroz priority.
        if (!top && game.turnPlayer === player && phase !== 'combat') breakdown.timing -= 35;
      }
    } else if (action.kind === 'activate') {
      const entry = action.entry;
      const card = entry.card;
      const ability = entry.ability || (entry.handAbility&&card.def.handAbility?.oracleForecast?card.def.handAbility:null);
      breakdown.base = ability && ability.aiScore ? clamp(ability.aiScore(game, card, player), -30, 30) : 2.4;
      const selfStatLabel = /^([+-]\d+)\/([+-]\d+)$/.exec(String(
        entry.label || ability && ability.label || '',
      ).trim());
      if (selfStatLabel) {
        const toughnessDelta = Number(selfStatLabel[2]);
        const toughnessLeft = Number(card.toughness || 0) - Number(card.damage || 0);
        // Repeatable firebreathing-style abilities may trade toughness for
        // power. Never let the bot choose an activation whose own resolution
        // would put the source at zero toughness and immediately kill it.
        if (toughnessDelta < 0 && toughnessLeft + toughnessDelta <= 0) {
          breakdown.safety -= 100;
        }
      }
      if (entry.equip) {
        breakdown.synergy += profile.primarySynergies.includes('equipment') || profile.primarySynergies.includes('voltron') ? 3 : 1;
        const attachment = (card.def.oracleImplementation || [])
          .filter(operation => operation.kind === 'attachment-grant');
        if (attachment.length) {
          const toughness = attachment.reduce((sum, operation) => sum + Number(operation.toughness || 0), 0);
          const viable = game.creatures(player).filter(host => host.iid !== card.attachedTo &&
            Number(host.toughness || 0) - Number(host.damage || 0) + toughness > 0);
          if (!viable.length) breakdown.safety -= 100;
        }
        // Premještanje već prikačene opreme između dva jednako dobra
        // hosta ne smije pojesti cijelu main fazu.
        if (card.attachedTo) breakdown.timing -= 9;
      }
      if (entry.crew) breakdown.combat += phase === 'main1' ? 2.5 : -0.5;
      if (entry.cycling) breakdown.resources += player.hand.length < 4 ? 1.5 : 0.4;
      if(entry.cycling)for(const payment of card.def.cycling?.oracleAdditionalCosts||[]){
        if(payment.kind==='payLife')breakdown.safety-=player.life<=payment.amount.value?10000:payment.amount.value*(player.life<10?2:0.15);
        if(payment.kind==='sacrifice'&&payment.object?.types?.includes('Land')&&game.lands(player).length<=payment.quantity.min+2)breakdown.resources-=8;
      }
      if (entry.foretell) breakdown.resources += player.hand.length > 3 ? 1.4 : 0.5;
      if (entry.ninjutsu) breakdown.combat += 5;
      // Ne cycluj land dok si kratak sa landovima a land drop je još otvoren
      if (entry.cycling && card.is('Land') && game.turnPlayer === player &&
        player.landsPlayed < game.landPlayLimit(player) && game.lands(player).length < 5) breakdown.resources -= 8;
      const sem = inferCardSemantics(card.def);
      breakdown.synergy += sem.synergyTags.filter(tag => profile.primarySynergies.includes(tag)).length * 0.7;
      if (ability && ability.targets && ability.targets.some(spec => spec.aiHint && spec.aiHint.goal === 'removal')) {
        const candidates = game.legalTargets(ability.targets[0], card, player).filter(target => target instanceof U.CardInst && target.ctrl !== player);
        const best = Math.max(0, ...candidates.map(target => permanentGameValue(game, target, player)));
        breakdown.threat += best * 0.75;
        if (best < 3) breakdown.timing -= 5;
      }
      // "Prijateljski" ciljane sposobnosti (protect/buff/untap) nikad ne
      // aktiviraj kad su jedine legalne mete protivničke — poklanjaš vrijednost.
      if (ability && ability.targets && ability.targets.some(spec => spec.aiHint && /^(protect|buff|pump|untap)$/.test(String(spec.aiHint.goal || '')))) {
        const candidates = game.legalTargets(ability.targets[0], card, player);
        if (!candidates.some(target => target instanceof U.CardInst && target.ctrl === player)) breakdown.base -= 40;
      }
      if (q && q.type === 'priority') {
        const top = game.stack[game.stack.length - 1];
        if (top && top.ctrl === player) breakdown.timing -= 45;
        if (!top && game.turnPlayer === player && phase !== 'combat'&&!ability?.oracleForecast) breakdown.timing -= 35;
      }
    } else if (action.kind === 'pass' || action.kind === 'done') {
      breakdown.base = 0.2;
      const interaction = (player.hand || []).filter(card => {
        const roles = inferCardSemantics(card.def).roles;
        const instantSpeed = card.is('Instant') || (card.def.kws || []).includes('flash');
        return instantSpeed && roles.some(role => ['counterspell', 'single-target-removal', 'protection', 'combat-trick'].includes(role));
      });
      if (interaction.length && availableManaEstimate(game, player) > 0) breakdown.timing += phase === 'main1' ? 2.4 : 1.2;
      // Spell-heavy playbook: ending the turn with an answer and the mana for
      // it is a real play, not a missed one.
      if (game.turnPlayer === player && (phase === 'main1' || phase === 'main2')) {
        const held = heldInstantAnswers(player, null);
        const holdWeight = answerHoldWeight(profile);
        if (held.length && holdWeight > 0 && availableManaEstimate(game, player) >= cheapestManaValue(held) &&
          tableWorthAnswering(game, player)) breakdown.timing += 1.5 + holdWeight;
      }
      if (q && q.type === 'priority' && game.stack.length) {
        const top = game.stack[game.stack.length - 1];
        if (top.ctrl === player) breakdown.timing += 30;
        if (top.ctrl !== player && top.targets && top.targets.flat().some(target => target && (target === player || target.ctrl === player))) breakdown.safety -= 10;
      }
      if (q && q.type === 'priority' && !game.stack.length && game.turnPlayer === player && phase !== 'combat'&&
        !(q.acts||[]).some(entry=>entry.handAbility&&entry.card.def.handAbility?.oracleForecast&&
          entry.card.def.handAbility.aiScore?.(game,entry.card,player)>0)) breakdown.timing += 25;
    } else if (action.kind === 'declareAttackers' || action.kind === 'declareBlockers') {
      breakdown.combat = action._combatScore || 0;
      breakdown.safety = action._survivalScore || 0;
    } else if (action.kind === 'chooseTargets') {
      breakdown.choice = action.picks.reduce((sum, target) => sum + targetValue(game, player, target, q || {}), 0);
    } else if (action.kind === 'chooseCards' || action.kind === 'bottomCards') {
      if (action.kind === 'chooseCards' && q && q.aiHint && q.aiHint.kind === 'crew') {
        const need = Math.max(0, Number(q.aiHint.need) || 0);
        const power = action.picks.reduce((sum, card) => sum + Math.max(0, Number(card.power) || 0), 0);
        if (power < need) breakdown.choice = -1000;
        else {
          const tapCost = action.picks.reduce((sum, card) => sum + permanentGameValue(game, card, player), 0);
          const excessPower = Number.isFinite(q.aiHint.need) ? Math.max(0, power - need) : 0;
          breakdown.choice = 20 - tapCost - excessPower * 1.5 - action.picks.length * 0.4;
        }
      } else {
        breakdown.choice = action.picks.reduce((sum, card) => sum + choiceCardValue(game, player, card, q || {}), 0);
      }
    } else if (action.kind === 'chooseOption') {
      const hintKind = q && q.aiHint && q.aiHint.kind;
      if(hintKind==='damagePreventionSource'){
        breakdown.choice=U.OracleV8SourcePrevention.threat(game,player,action.option?.card);
      } else if(hintKind==='oracleLibraryChoice'){
        const card=q.aiHint.card,wantTop=card&&(card.mv>=3||card.is?.('Creature'));
        breakdown.choice=action.value===(wantTop?'top':'bottom')?10:0;
      } else if(hintKind==='oracleKeyword'){
        const cards=q.aiHint.cards||[],key=action.value;breakdown.choice=cards.some(card=>card.kw?.(key))?-5:({flying:8,'double strike':9,lifelink:player.life<15?12:5,deathtouch:6,haste:game.phase==='main1'&&cards.some(card=>card.sick)?10:1,vigilance:4,trample:5,menace:4,reach:3}[key]||2);
      } else if(hintKind==='oracleProtection'){
        const quality=action.option?.quality,threats=[...game.bf().filter(card=>card.ctrl!==player),...game.stack.filter(row=>row.ctrl!==player).map(row=>row.card||row.src).filter(Boolean)];
        const matches=card=>quality?.kind==='color'?card.colors?.includes(quality.value):quality?.kind==='type'?card.is?.(quality.value):quality?.kind==='colorless'?card.colors?.length===0:false;
        breakdown.choice=threats.filter(matches).reduce((sum,card)=>sum+1+Math.max(0,card.power||0)+(card.zone==='stack'?15:0),0);
      } else if(hintKind==='oracleUnlessPayment'){
        const cost=action.option?.payment,mana=cost?.mana?U.parseCost(cost.mana):null;
        breakdown.choice=!cost?0:cost.kind==='mana'?12-mana.generic-mana.pips.length:cost.kind==='life'?(player.life>cost.n+5?8-cost.n:-20):cost.kind==='discard'?5-cost.n:cost.kind==='tap'?8-cost.n:3-cost.n;
        if(cost?.kind==='draw'){
          const doublers=game.bf().filter(card=>card.ctrl===player&&card.def.drawDouble).length;
          const extra=cost.n>0&&!player.hand.length&&game.bf().some(card=>card.ctrl===player&&card.def.drawWhileEmptyExtra)?1:0;
          breakdown.choice=player.library.length>=cost.n*Math.pow(2,doublers)+extra?8+cost.n:-1000;
        }
      } else if(hintKind==='oracleMiracleReveal'||hintKind==='oracleMiracleCast'){
        breakdown.choice=action.value==='yes'?(q.aiHint.affordable?Math.max(2,cardDefinitionValue(q.aiHint.card.def)): -10):0;
      } else if (hintKind === 'oracleUpkeepCost') {
        const p=q.aiHint.payment,n=q.aiHint.n,source=q.aiHint.src;
        let value=q.aiHint.sourceLive?Math.max(8,permanentGameValue(game,source,player)):0,price=n;
        if(p.kind==='additional'){
          const cost=p.cost;
          if(cost.kind==='payLife')price=cost.amount.value*n*(player.life<=10?4:0.6);
          else {const pool=cost.kind==='discard'?player.hand:game.bf().filter(card=>card.ctrl===player&&(!cost.object.types||cost.object.types.some(type=>card.is(type))));
            const values=pool.map(card=>cardDefinitionValue(card.def)).sort((a,b)=>a-b);price=values.slice(0,cost.quantity.min*n).reduce((sum,v)=>sum+v,0)*0.65;}
        } else if(p.kind==='draw'){
          const doubled=Math.pow(2,game.bf().filter(card=>card.ctrl===player&&card.def.drawDouble).length),extra=!player.hand.length&&game.bf().some(card=>card.ctrl===player&&card.def.drawWhileEmptyExtra)?1:0;
          price=player.library.length<n*doubled+extra?10000:-4*n;
        } else if(p.kind==='add-mana')price=-n;
        else if(p.kind==='self-counter')price=n*2+(source.toughness<=n?value:0);
        else if(p.kind==='graveyard-bottom')price=n*0.5;
        breakdown.choice=action.value==='yes'?value-price:0;
      } else if (hintKind === 'oracleUpkeepLifeRecipient') {
        const recipient=game.players.find(p=>String(p.idx)===action.value);
        breakdown.choice=recipient?-recipient.life:0;
      } else if (hintKind === 'riot') {
        const card = q.aiHint.card;
        const canAttackNow = card && game.turnPlayer === player && game.phase === 'main1' && !card.tapped;
        breakdown.choice = action.value === (canAttackNow ? 'haste' : 'counter') ? 12 : 0;
      } else if (hintKind === 'payLifeForUntappedLand') {
        const shouldPay = typeof MTG.shouldBotPayLifeForUntappedLand === 'function' &&
          MTG.shouldBotPayLifeForUntappedLand(game, player, q.aiHint.card, q.aiHint.life);
        if (action.value === 'pay') breakdown.choice = shouldPay ? 25 : -100;
        else if (action.value === 'tapped') breakdown.choice = shouldPay ? -5 : 15;
      } else if (hintKind === 'unleash') {
        breakdown.choice = action.value === 'counter' ? 8 : 0;
      } else if (hintKind === 'extort') {
        breakdown.choice = action.value === 'yes' && player.life > 2 ? 8 : 0;
      } else if (hintKind === 'entwine') {
        const extraModes = Math.max(1, Number(q.aiHint.modeCount || 0) - Number(q.aiHint.printedMax || 0));
        const cost = q.aiHint.cost || {};
        let price = 0;
        if (cost.kind === 'mana') {
          const parsed = U.parseCost(cost.mana || '');
          price = parsed.generic + parsed.pips.length * 1.35;
        } else if (cost.kind === 'sacrifice') {
          const lands = game.bf().filter(card => card.ctrl === player && card.is('Land')).length;
          price = Number(cost.n || 0) * (lands <= Number(cost.n || 0) + 2 ? 8 : 2.5);
        }
        breakdown.choice = action.value === 'yes' ? extraModes * 12 - price : 0;
      } else if (hintKind === 'chooseType') {
        const counts = q.aiHint.counts || {};
        const type = String(action.value || '');
        breakdown.choice = Number(counts[type] || action.option && action.option.count || 0) * 3 +
          (type === 'Hero' && player.deck && player.deck.name === 'Avengers Assemble' ? 25 : 0);
      } else if (hintKind === 'oracleColorChange') {
        // Visible board affinity is a deterministic local choice for effects
        // changing a permanent's color; it is not a mana-production choice.
        breakdown.choice = Number(q.aiHint.scores?.[String(action.value || '')] || 0) * 3;
      } else if (hintKind === 'oracleSearchScopes') {
        // Zone choices use public graveyards and our own hand only. No
        // library identities are available until that zone is searched.
        breakdown.choice = Number(q.aiHint.scores?.[String(action.value || '')] || 0);
      } else if (hintKind === 'photonMana') {
        const color = String(action.value || '');
        const cards = [...player.hand, ...player.command];
        const demand = cards.reduce((sum, card) =>
          sum + ((card.def.cost || '').match(new RegExp(`\\{${color}[^}]*\\}`, 'g')) || []).length, 0);
        breakdown.choice = demand * 3 + Math.max(0, 2 - (player.pool[color] || 0));
      } else if (hintKind === 'manaColor') {
        const color = String(action.value || '');
        const cards = [...player.hand, ...player.command];
        const demand = cards.reduce((sum, card) =>
          sum + ((card.def.cost || '').match(new RegExp(`\\{${color}[^}]*\\}`, 'g')) || []).length, 0);
        breakdown.choice = demand * 2.2 + Math.max(0, 2 - (player.pool[color] || 0)) * 0.6;
      } else if (hintKind === 'dredge') {
        breakdown.choice = action.option && action.option.card
          ? choiceCardValue(game, player, action.option.card, q || {}) + Number(action.option.card.def.dredge || 0) * 0.35
          : 0;
      } else if (hintKind === 'quinjetMode') {
        const handHero = player.hand.filter(card => card.is('Creature') && card.hasSub('Hero'))
          .map(card => cardDefinitionValue(card.def)).sort((a, b) => b - a)[0];
        const graveHero = player.graveyard.filter(card => card.is('Creature') && card.hasSub('Hero'))
          .map(card => cardDefinitionValue(card.def)).sort((a, b) => b - a)[0];
        breakdown.choice = action.value === '0'
          ? (Number.isFinite(handHero) ? handHero + 4 : -100)
          : (Number.isFinite(graveHero) ? graveHero * 0.7 + 2 : -100);
      } else if (hintKind === 'visionMode') {
        const vision = q.aiHint.card;
        const threatened = vision && vision.zone === 'battlefield' && vision.toughness - vision.damage <= 1;
        breakdown.choice = action.value === 'phase' ? (threatened ? 18 : 1) : (threatened ? 2 : 9);
      } else if (hintKind === 'fantasticPay') {
        if (action.value !== 'yes') breakdown.choice = 0;
        else if (q.aiHint.effect === 'thing') {
          const counters = game.bf().filter(card => card.ctrl === player)
            .reduce((sum, card) => sum + Object.values(card.counters || {}).reduce((a, n) => a + Math.max(0, n), 0), 0);
          breakdown.choice = counters > 0 ? counters * 2.4 - 2.5 : -25;
        } else if (q.aiHint.effect === 'torch') {
          const torch = q.aiHint.src || q.data && q.data.card;
          breakdown.choice = Math.max(0, player.opponents(game).length - 1) * Math.max(2, torch && torch.power || 3) - 2;
        } else {
          const attackers = q.data && q.data.attackers || [];
          breakdown.choice = attackers.length ? Math.max(...attackers.map(card => Math.max(0, card.power))) + game.creatures(player).length * 0.8 - 2 : -20;
        }
      } else if (hintKind === 'willieDraw') {
        if (action.value !== 'yes') breakdown.choice = 0;
        else {
          const protectedPlayer = q.aiHint.protectedPlayer;
          const attackPower = game.creatures(player).filter(card => !card.tapped && !card.cur.cantAttack)
            .reduce((sum, card) => sum + Math.max(0, card.power), 0);
          const targetThreat = protectedPlayer ? playerThreatForGame(game, player, protectedPlayer) : 0;
          breakdown.choice = 4.5 + Math.max(0, 5 - player.hand.length) * 0.65 - attackPower * 0.28 - targetThreat * 0.08;
        }
      } else if (hintKind === 'cosmicCopy') {
        if (action.value !== 'yes') breakdown.choice = 0;
        else {
          const spell = q.data && q.data.so && q.data.so.card;
          breakdown.choice = spell ? cardDefinitionValue(spell.def) + 2 : 1;
          if (spell && inferCardSemantics(spell.def).roles.includes('board-wipe')) {
            const mine = boardValueFor(game, player);
            const theirs = player.opponents(game).reduce((sum, opponent) => sum + boardValueFor(game, opponent), 0);
            breakdown.choice += (theirs - mine) * 0.35;
            if (mine > theirs) breakdown.safety -= 16;
          }
        }
      } else if (hintKind === 'fantasticarSacrifice') {
        const tokenPayoffs = game.bf().filter(card => card.ctrl === player && /token/i.test(card.def.oracle || '')).length;
        breakdown.choice = action.value === 'yes' ? 13 + tokenPayoffs * 1.4 : 0;
      } else if (hintKind === 'explore') {
        const card = q.aiHint.card;
        const value = card ? cardDefinitionValue(card.def) : 0;
        breakdown.choice = action.value === 'top' ? value : Math.max(0, 3 - value);
      } else if (hintKind === 'heraldReveal') {
        breakdown.choice = action.value === 'yes'
          ? cardDefinitionValue(q.aiHint.card && q.aiHint.card.def) + 3
          : 0;
      } else if (hintKind === 'vote') {
        breakdown.choice = tacticalVoteScore(game, player, action.option, q);
      } else if (hintKind === 'chooseOpponent') {
        breakdown.choice = opponentChoiceScore(game, player, action.option, q);
      } else if (hintKind === 'abstractPile') {
        breakdown.choice = Number(action.option && action.option.denyValue || 0);
      } else if (hintKind === 'clashPlace') {
        const value = q.aiHint.card ? cardDefinitionValue(q.aiHint.card.def) : 0;
        breakdown.choice = action.value === 'top' ? value : Math.max(0, 3.2 - value);
      } else if (hintKind === 'ward' && q.aiHint && q.aiHint.payment === 'blight') {
        const price = wardPrice(game, player, { blight: q.aiHint.n || 1 });
        const benefit = blightWardBenefit(game, player, q);
        breakdown.choice = action.value === 'yes' ? (Number.isFinite(price) && benefit > 0 ? benefit - price : -100) : 0;
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
        // Isti model kao svaki drugi masovni mod: broji se šta zaista nestaje
        // sa table, pa mod nad praznim tipom ne može pobijediti korisnog.
        breakdown.choice = modeSweepValue(game, player, action.option || {}) || 0;
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
        const preferred = q.aiHint.toZone === 'graveyard' && q.aiHint.graveyardReturn ? 'stay' : 'cz';
        breakdown.choice = action.value === preferred ? 40 : -8;
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
      } else if (hintKind === 'newTargets') {
        const stackObject = q.aiHint && q.aiHint.so;
        const source = stackObject && (stackObject.card || stackObject.srcCard);
        const currentTargets = stackObject && (stackObject.targets || stackObject.ctx && stackObject.ctx.targets) || [];
        const targetSpecs = stackObject && (stackObject.targetSpecs ||
          stackObject.card && game.spellTargetSpecs(stackObject.card, stackObject.castOpts || {}, player));
        const currentTargetsLegal = !stackObject || !targetSpecs || game.targetsStillOk(
          currentTargets, targetSpecs, source, player,
          stackObject.targetIdentities || stackObject.ctx && stackObject.ctx.targetIdentities || null);
        const spread = q.aiHint.copyTargetPolicy === 'spread';
        if (!currentTargetsLegal) {
          breakdown.choice = action.value === 'yes' ? 100 : -100;
        } else if (action.value === 'yes') breakdown.choice = spread
          ? (q.aiHint.hasUnusedTarget ? 20 : -8)
          : 0;
        else breakdown.choice = spread && q.aiHint.hasUnusedTarget ? -8 : 4;
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
      } else if (hintKind === 'conduitCast') {
        const card = q.aiHint.card;
        const value = card ? cardDefinitionValue(card.def) : 0;
        breakdown.choice = action.value === 'yes' && card ? value + 2.5 : 0;
      } else if (hintKind === 'nyamiTop') {
        const card = q.aiHint.card;
        const duplicateLegend = card && (card.def.super || []).includes('Legendary') &&
          game.bf().some(existing => existing.ctrl === player && existing.name === card.name);
        breakdown.choice = action.value === 'yes' && card && !duplicateLegend
          ? cardDefinitionValue(card.def) + (card.is('Land') && game.lands(player).length < 6 ? 3 : 1.5)
          : action.value === 'yes' ? -100 : 1.5;
      } else if (hintKind === 'wakandaBead') {
        const used = q.aiHint.source && q.aiHint.source.meta && q.aiHint.source.meta._beads || [];
        if (action.value === 'av') breakdown.choice = 4.8 + Math.max(0, 5 - player.hand.length) * 0.8;
        if (action.value === 'comm') breakdown.choice = 7 + (profile.primarySynergies.includes('tokens') ? 2 : 0);
        if (action.value === 'prime') {
          const lifeUrgency = player.life <= 10 ? 12 : player.life <= 20 ? 7 : 3;
          breakdown.choice = lifeUrgency + 3.5 + used.length * 1.2;
        }
      } else {
        const sweep = action.option ? modeSweepValue(game, player, action.option) : null;
        if (sweep !== null) {
          // Masovni mod se mjeri po tabli, ne po riječima u labeli.
          breakdown.choice = sweep * 0.5;
        } else {
          const key = String(action.value).toLowerCase();
          if (/yes|da|keep|accept|use/.test(key)) breakdown.choice = q && q.aiHint && q.aiHint.kind === 'ward' ? 1.5 : 1;
          if (/no|ne|decline/.test(key)) breakdown.choice = q && q.aiHint && q.aiHint.kind === 'ward' ? 0 : -0.2;
          const label = String(action.option && action.option.label || '').toLowerCase();
          if (/draw|vuci|token|counter|destroy|exile|mana/.test(label)) breakdown.choice += 2;
          if (/lose|gubi|sacrifice|žrtvuj|discard|odbaci/.test(label)) breakdown.choice -= 1.5;
        }
      }
    } else if (action.kind === 'chooseMulti') {
      if (q && q.aiHint && q.aiHint.kind === 'collectiveEffort') {
        const selected = new Set((action.options || []).map(option => Number(option.key)));
        if (selected.has(0)) {
          breakdown.choice += Math.max(0, ...game.bf().filter(card => card.is('Creature') && card.power >= 4)
            .map(card => card.ctrl === player ? -permanentGameValue(game, card, player) : permanentGameValue(game, card, player)));
        }
        if (selected.has(1)) {
          breakdown.choice += Math.max(0, ...game.bf().filter(card => card.is('Enchantment'))
            .map(card => card.ctrl === player ? -permanentGameValue(game, card, player) : permanentGameValue(game, card, player)));
        }
        if (selected.has(2)) breakdown.choice += game.creatures(player).length * 2.2;
        const extra = Math.max(0, selected.size - 1);
        const tapCosts = game.creatures(player).filter(card => !card.tapped)
          .map(card => permanentGameValue(game, card, player)).sort((a, b) => a - b).slice(0, extra);
        if (tapCosts.length < extra) breakdown.safety -= 1000;
        else breakdown.choice -= tapCosts.reduce((sum, value) => sum + value * 0.22, 0);
      } else if (q && q.aiHint && q.aiHint.kind === 'farewellModes') {
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
        breakdown.choice = (action.options || []).reduce((sum, option) => {
          const sweep = modeSweepValue(game, player, option);
          if (sweep !== null) return sum + sweep * 0.5;
          return sum + (/draw|token|destroy|exile|counter/i.test(option.label || '') ? 2 : 0.3);
        }, 0);
      }
    } else if (action.kind === 'chooseX') {
      if(q?.aiHint?.kind==='oracleResolutionX'&&q.aiHint.drawMultiplier){
        const draws=action.value*q.aiHint.drawMultiplier+(q.aiHint.drawOffset||0);
        const doublers=game.bf().filter(card=>card.ctrl===player&&card.def.drawDouble).length;
        const extra=draws>0&&!player.hand.length&&game.bf().some(card=>card.ctrl===player&&card.def.drawWhileEmptyExtra)?1:0;
        breakdown.choice=draws*Math.pow(2,doublers)+extra<=player.library.length?action.value*0.7:-1000-draws;
      } else if (q && q.aiHint && q.aiHint.kind === 'oracleXDamage') {
        const x = Number(action.value) || 0;
        const operation = q.aiHint.operation || {};
        const card = q.aiHint.card;
        const castOpts = { xVal: x };
        const specs = card ? game.spellTargetSpecs(card, castOpts, player) : null;
        const candidates = specs && specs[0] ? game.legalTargets(specs[0], card, player) : [];
        const hostilePermanents = candidates.filter(target => target instanceof U.CardInst &&
          target.ctrl !== player && (target.is('Creature') || target.is('Planeswalker')));
        const lethalThreshold = target => target.is('Planeswalker')
          ? Math.max(1, Number(target.counters && target.counters.loyalty) || 0)
          : Math.max(1, target.toughness - target.damage);
        const killable = hostilePermanents.filter(target => !damageProtectionSaves(target) &&
          lethalThreshold(target) <= x);
        let permanentScore = -Infinity;
        if (killable.length) {
          const best = killable.slice().sort((a, b) =>
            permanentGameValue(game, b, player) - permanentGameValue(game, a, player))[0];
          const lethal = lethalThreshold(best);
          permanentScore = permanentGameValue(game, best, player) * 1.6 + 12 - (x - lethal) * 3 - x * 0.12;
        }
        const opponents = candidates.filter(target => target instanceof U.Player && target !== player);
        let playerScore = -Infinity;
        if (opponents.length) {
          const lethalPlayers = opponents.filter(target => target.life <= x);
          if (lethalPlayers.length) {
            const exact = Math.min(...lethalPlayers.map(target => target.life));
            playerScore = 30 + x - Math.max(0, x - exact) * 2;
          } else playerScore = x * 0.8;
        }
        if (permanentScore > -Infinity || playerScore > -Infinity) {
          breakdown.choice = Math.max(permanentScore, playerScore);
        } else {
          // A creature-only X spell with no killable target should prefer the
          // smallest legal X and, through the cast score, normally be held.
          breakdown.choice = -8 - x * 0.2;
        }
      } else if (q && q.aiHint && q.aiHint.kind === 'oracleXDebuff') {
        const x = Number(action.value) || 0;
        const card = q.aiHint.card;
        const specs = card ? game.spellTargetSpecs(card, { xVal: x }, player) : null;
        const candidates = specs && specs[0] ? game.legalTargets(specs[0], card, player) : [];
        const hostileCreatures = candidates.filter(target => target instanceof U.CardInst &&
          target.ctrl !== player && target.is('Creature'));
        if (!hostileCreatures.length) {
          breakdown.choice = -8 - x * 0.25;
        } else {
          breakdown.choice = Math.max(...hostileCreatures.map(target => {
            const power = Math.max(0, Number(target.power) || 0);
            const useful = Math.min(x, power);
            const overpayment = Math.max(0, x - power);
            const combatWeight = target.attacking ? 3.2 : target.blocking ? 2 : 0.7;
            return useful * combatWeight + permanentGameValue(game, target, player) * 0.22 -
              overpayment * 3 - x * 0.08;
          }));
        }
      } else if (q && q.aiHint && q.aiHint.kind === 'toxicDeluge') {
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
      } else if (q && q.aiHint && ['fireCovenantDamage', 'magmaOpusDamage', 'dividedDamage'].includes(q.aiHint.kind)) {
        const x = Number(action.value) || 0;
        const target = q.aiHint.target;
        if (target instanceof MTG.Player) {
          breakdown.choice = target === player ? -x * 3 : x * (target.life <= x ? 4 : 0.8);
        } else {
          const lethal = target ? Math.max(1, target.toughness - target.damage) : 1;
          breakdown.choice = target && x >= lethal ? permanentGameValue(game, target, player) : -Math.abs(lethal - x) * 2;
        }
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
      const selectionValue = action.value.top.reduce((sum, card) => sum + cardDefinitionValue(card.def), 0);
      const replacementValue = action.value.bottom.reduce((sum, card) =>
        sum + Math.max(0, 2.5 - cardDefinitionValue(card.def)), 0);
      const graveyardPayoff = q && q.surveil && action.value.bottom.length && game.bf().some(source =>
        source.ctrl === player && /put into your graveyard|cards? (?:are|is) put into your graveyard/i.test(source.def.oracle || ''))
        ? 3 : 0;
      breakdown.choice = selectionValue + replacementValue + graveyardPayoff;
      if (q && q.drawReserve && player.library.length - action.value.bottom.length < q.drawReserve) {
        breakdown.safety -= 1000000;
      }
    } else if (action.kind === 'orderTriggers') {
      breakdown.choice = action.value.reduce((sum, trigger, index) => sum + triggerValue(trigger) * (index + 1), 0);
    } else if (action.kind === 'chooseManaSources') {
      breakdown.resources = -(action.value || []).reduce((sum, source) => sum + (source.card && inferCardSemantics(source.card.def).roles.includes('engine') ? 2 : 0.2), 0);
    }
    // Siguran smrtonosni napad zatvara main fazu: ništa osim landa (koji ne
    // košta tempo) ne smije pretegnuti nad odlaskom u borbu.
    if ((q && (q.type === 'main' || q.type === 'priority')) &&
      (action.kind === 'cast' || action.kind === 'activate' || action.kind === 'done') &&
      lethalAttackReadyCached(view, game, player)) {
      if (action.kind === 'done') breakdown.timing += 45;
      else breakdown.timing -= 45;
    }
    applyStyleSkillScore(view, action, profile, q, breakdown);
    const total = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
    return { total: round(total), breakdown: Object.fromEntries(Object.entries(breakdown).map(([key, value]) => [key, round(value)])) };
  }
  MTG.quickScoreBotAction = function (view, action, profile, q) { return quickScoreAction(view, action, profile, q); };

  function cloneGraph(value, seen = new Map(), key = '', parent = null) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value === 'function') return value;
    if (key === 'def' || key === 'deck' || key === 'faceDownDef') return value;
    // `cur` je izvedeno stanje koje recalc() gradi iz nule za svaku kartu na
    // tabli. Na tabli sa stotinu tokena je njegovo kopiranje bilo skuplje od
    // jednog recalca, pa ga klon dobija kroz recalc u cloneGameForSimulation.
    if (key === 'cur' && parent && parent.zone === 'battlefield' && parent.iid !== undefined) return null;
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
      try { out[ownKey] = cloneGraph(descriptor.value, seen, String(ownKey), value); } catch (error) { /* noncritical UI/cache field */ }
    }
    if(value instanceof MTG.Game){
      MTG.initializeContinuousEffects(out,cloneGraph(value.untilEffects,seen,'untilEffects',value));
      // Event-cohort deduplication is a transient identity cache. WeakMap's
      // contents cannot be graph-cloned, and a prototype-only copy is invalid.
      if(value._oracleTriggerBatches)out._oracleTriggerBatches=new WeakMap();
    }
    return out;
  }

  function fullStateFingerprint(game) {
    return JSON.stringify({
      turnNo: game.turnNo, phase: game.phase, step: game.step,
      players: game.players.map(player => ({ idx: player.idx, life: player.life, poison: player.poison || 0, lost: player.lost,
        pool: player.pool, coloredOnlyPool: player.coloredOnlyPool,
        hand: player.hand.map(card => [card.iid, card.name, card.zone]), library: player.library.map(card => [card.iid, card.name, card.zone]),
        graveyard: player.graveyard.map(card => [card.iid, card.name, card.zone]), exile: player.exile.map(card => [card.iid, card.name, card.zone]), command: player.command.map(card => [card.iid, card.name, card.zone]) })),
      battlefield: game.battlefield.map(card => [card.iid, card.name, card.zone, card.ctrl && card.ctrl.idx, card.tapped, card.damage, card.sick, card.attacking && (card.attacking.idx ?? card.attacking.iid), card.blocking]),
      stack: game.stack.map(item => [item.kind, item.name, item.card && item.card.iid, item.ctrl && item.ctrl.idx]),
    });
  }

  function cloneGameForSimulation(game, seed) {
    // Log i AI dnevnik su čista historija koju simulacija nikad ne čita, ali
    // na dugoj partiji nose stotine unosa i sami po sebi znače mjerljiv dio
    // svakog snapshota. Odvoje se samo za trajanje kloniranja.
    const savedLog = game.log, savedDecisionLog = game.aiDecisionLog;
    let clone;
    try {
      if (Array.isArray(savedLog)) game.log = [];
      if (Array.isArray(savedDecisionLog)) game.aiDecisionLog = [];
      clone = cloneGraph(game);
    } finally {
      if (Array.isArray(savedLog)) game.log = savedLog;
      if (Array.isArray(savedDecisionLog)) game.aiDecisionLog = savedDecisionLog;
    }
    clone._simulation = true;
    // A nested clone already holds the tokens its parent simulation created;
    // restarting the local counter would hand out duplicate ids inside it.
    clone._nextSimulationIid = game._simulation && Number.isFinite(game._nextSimulationIid) ? game._nextSimulationIid : -1;
    clone._nextSimulationTimestamp = game._simulation && Number.isFinite(game._nextSimulationTimestamp)
      ? game._nextSimulationTimestamp : MTG.currentOracleTimestamp();
    clone.paced = false;
    clone.speedFactor = 0;
    clone.onEvent = () => {};
    clone.uiHooks = {};
    clone._human = undefined;
    clone.rnd = U.mulberry32((Number(seed) || 1) >>> 0);
    for (const player of clone.players) player.game = clone;
    clone.recalc();
    return clone;
  }
  MTG.cloneGameForAISimulation = cloneGameForSimulation;

  function prepareSearchInformation(clone, information) {
    const observer = clone.players.find(player => player.idx === information.observerId);
    if (!observer) return;
    const known = new Set(information.knownCardIds || []);
    for (const source of clone.bf()) {
      if (source.cur?.abilitiesDisabled || !(source.def.revealAllTop || source.ctrl === observer && source.def.revealOwnTop)) continue;
      const top = source.ctrl?.library.at(-1);
      if (top) known.add(top.iid);
    }
    const explicitlyKnown = card => known.has(card.iid) || card.meta?.revealedTo === 'all' ||
      Array.isArray(card.meta?.revealedTo) && card.meta.revealedTo.includes(observer.idx);
    for (const player of clone.players) {
      const revealed = new Set([...(clone.forecastRevealedCards?.(player) || []), ...(clone.miracleRevealedCards?.(player) || [])]);
      // A hypothesis may use the unseen card pool, but neither its real order
      // nor its secret hand/library allocation. Canonicalize before shuffling
      // so swapping unknown cards cannot change a seeded search result.
      const slots = [];
      if (player !== observer) player.hand.forEach((card, index) => {
        if (!explicitlyKnown(card) && !revealed.has(card)) slots.push({ zone: 'hand', index, card });
      });
      player.library.forEach((card, index) => {
        if (!explicitlyKnown(card)) slots.push({ zone: 'library', index, card });
      });
      const pool = slots.map(slot => slot.card).sort((a, b) => a.iid - b.iid);
      U.shuffle(pool, U.mulberry32((information.seed ^ Math.imul(player.idx + 1, 2654435761)) >>> 0));
      slots.forEach((slot, index) => {
        player[slot.zone][slot.index] = pool[index];
        pool[index].zone = slot.zone;
      });
    }
  }

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
        !!candidate.cycling === !!action.entry.cycling && !!candidate.plot === !!action.entry.plot && !!candidate.foretell === !!action.entry.foretell &&
        !!candidate.ninjutsu === !!action.entry.ninjutsu &&
        !!candidate.suspend === !!action.entry.suspend && !!candidate.handAbility === !!action.entry.handAbility && !!candidate.gyAbility === !!action.entry.gyAbility &&
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
        if (MTG.optionalAITriggerBudget(this, game, player, q)) return 'no';
        if (q.type === 'priority' || q.type === 'main') return q.type === 'priority' ? { kind: 'pass' } : { kind: 'done' };
        if (q.type === 'combatReview' || q.type === 'cardReveal' || q.type === 'threatAlert' || q.type === 'manualResolve') return 'ok';
        const view = MTG.createBotPlayerView(game, player.idx, q);
        const profile = MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name);
        const actions = MTG.generateLegalActions(view, { difficulty: 'normal' });
        const ranked = actions.map(action => ({ action, quick: quickScoreAction(view, action, profile, q).total }))
          .sort((a, b) => b.quick - a.quick || actionKey(a.action).localeCompare(actionKey(b.action)));
        const answer = unwrapDecisionAction(ranked[0] && ranked[0].action);
        if (answer === 'yes') MTG.optionalAITriggerBudget(this, game, player, q, true);
        return answer;
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
    // Otisak štiti ŽIVU partiju od skripte koja bi je mutirala mimo klona.
    // Dublji čvorovi već rade nad bacivim snapshotom, a serijalizacija cijele
    // biblioteke i table dvaput po čvoru je na velikoj tabli bila skuplja od
    // same simulirane akcije.
    const guarded = !state._simulation;
    const before = guarded ? fullStateFingerprint(state) : null;
    const actor = resolvePlayer(state, simulationContext.playerId ?? simulationContext.botPlayerId ?? (action.card && action.card.ctrl && action.card.ctrl.idx));
    const seed = Number(simulationContext.seed || 1) >>> 0;
    const clone = cloneGameForSimulation(state, seed);
    // Faithful rules-engine simulation remains the default API. Only search
    // roots sample hidden information; descendants keep that same hypothesis.
    if (!state._simulation && simulationContext.searchInformation) prepareSearchInformation(clone, simulationContext.searchInformation);
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
    if (guarded && before !== fullStateFingerprint(state)) throw new Error('AI simulacija je mutirala live GameState.');
    const view = cloneActor ? MTG.createBotPlayerView(clone, cloneActor.idx) : null;
    return {
      state: clone,
      action: mapped,
      applied,
      error,
      usedRulesEngine,
      // Beam pretraga koristi isti view umjesto da ga gradi po drugi put.
      view,
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

  async function searchActionSequence(game, player, rootCandidate, view, profile, config, seed, stats, searchInformation) {
    const outOfTime = () => stats.deadline > 0 && now() > stats.deadline;
    const first = await MTG.simulateAction(game, rootCandidate.action, { playerId: player.idx, seed, searchInformation });
    stats.nodes++;
    if (!first.applied) return { score: rootCandidate.quick.total - 25, state: game, rootAction: rootCandidate.action, depth: 0, breakdown: Object.assign({}, rootCandidate.quick.breakdown, { simulation: -25 }), simulationError: first.error && first.error.message };
    let firstView = first.view || MTG.createBotPlayerView(first.state, player.idx);
    const baseEval = MTG.evaluateState(view, player.idx, profile).totalScore;
    const firstEval = MTG.evaluateState(firstView, player.idx, profile).totalScore;
    const penalty = kingmakingPenalty(view, firstView, player.idx);
    let beam = [{ state: first.state, view: firstView, score: rootCandidate.quick.total + (firstEval - baseEval) * 0.12 - penalty, rootAction: rootCandidate.action, depth: 1 }];
    let best = beam[0];
    const expansionWidth = Math.min(config.beamWidth, config.maxDepth <= 1 ? 2 : config.beamWidth <= 10 ? 5 : 8);
    for (let depth = 1; depth < config.maxDepth && stats.nodes < config.maxNodes && !outOfTime(); depth++) {
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
        for (let i = 0; i < ranked.length && stats.nodes < config.maxNodes && !outOfTime(); i++) {
          const candidate = ranked[i];
          const sim = await MTG.simulateAction(node.state, candidate.action, { playerId: simPlayer.idx, seed: seed + stats.nodes * 101 + i });
          stats.nodes++;
          if (!sim.applied) continue;
          const simView = sim.view || MTG.createBotPlayerView(sim.state, simPlayer.idx);
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
    const labels = { base: 'jaka osnovna vrijednost', timing: 'dobar trenutak', threat: 'smanjuje najveću prijetnju', synergy: 'napreduje plan decka', safety: 'štiti od poraza', resources: 'razvija ili čuva resurse', combat: 'najbolji combat ishod', choice: 'najvrjedniji legalan izbor', valueEngine: 'Josh value-engine plan', pressurePlan: 'Jimmy pressure plan', tableBalance: 'Rachel table-balance plan', showstopper: 'Post opportunist-showstopper plan', instigation: 'Olivia saboteur-instigator plan', simulation: 'bolji simulirani nastavak', kingmaking: 'izbjegava kingmaking' };
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

  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  MTG.chooseBotAction = async function (params) {
    const started = now();
    const game = params.gameState;
    const player = resolvePlayer(game, params.botPlayerId);
    if (!player) throw new Error('AI V2: botPlayerId nije u GameState.');
    const difficulty = normalizeDifficulty(params.difficulty);
    const config = searchConfigForState(game, SEARCH_CONFIG[difficulty]);
    const q = params.actionWindow || null;
    const view = MTG.createBotPlayerView(game, player.idx, q);
    const baseProfile = MTG.getDeckAIProfile(player.deckName || player.deck && player.deck.name) || buildDeckProfile('unknown', player.deck || { cards: [], commander: '' });
    const profile = profileForStyle(baseProfile, player);
    const seed = params.seed === undefined ? defaultSeed(game, view, player.idx) : Number(params.seed) >>> 0;
    const legalActions = MTG.generateLegalActions(view, { difficulty });
    const budgetMs = params.budgetMs === undefined ? SEARCH_DEADLINE_MS[difficulty] : Number(params.budgetMs);
    const stats = { nodes: 0, depth: 0, deadline: budgetMs > 0 ? started + budgetMs : 0 };
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
    const searchInformation = deepSearch ? {
      observerId: player.idx, seed,
      // Offered library/foreign-hand actions identify cards the acting player
      // can already see or play. Do not shuffle a known source out of its zone.
      knownCardIds: legalActions.flatMap(action => [action.card, action.entry?.card])
        .filter(card => card && (card.zone === 'library' || card.zone === 'hand' && card.owner !== player)).map(card => card.iid),
    } : null;
    const searched = [];
    for (const candidate of candidates.slice(0, deepWidth)) {
      if (stats.nodes >= config.maxNodes) break;
      if (stats.deadline > 0 && searched.length && now() > stats.deadline) break;
      if (searchKinds.has(candidate.action.kind)) {
        try { searched.push(await searchActionSequence(game, player, candidate, view, profile, config, seed + searched.length * 997, stats, searchInformation)); }
        catch (error) {
          searched.push({ score: candidate.quick.total - 12, rootAction: candidate.action, depth: 0, breakdown: Object.assign({}, candidate.quick.breakdown, { simulation: -12 }), simulationError: error.message });
        }
      } else searched.push({ score: candidate.quick.total, rootAction: candidate.action, depth: 0, breakdown: candidate.quick.breakdown });
    }
    const searchedKeys = new Set(searched.map(entry => actionKey(entry.rootAction)));
    for (const candidate of candidates) {
      if (searchedKeys.has(actionKey(candidate.action))) continue;
      searched.push({ score: candidate.quick.total, rootAction: candidate.action, depth: 0, breakdown: candidate.quick.breakdown });
    }
    searched.sort((a, b) => b.score - a.score || actionKey(a.rootAction).localeCompare(actionKey(b.rootAction)));
    // Glasovi nisu kozmetički modovi: i mala evaluacijska razlika može značiti
    // ekstra potez ili cijelu vojsku countera za protivnika. Zato se seedovani
    // "malo slabiji potez" ne primjenjuje na vote prozore.
    // Izbor moda nije kozmetika: "uništi sva stvorenja" i "uništi sve artefakte"
    // se razlikuju za cijelu partiju, pa se seedovani "malo slabiji potez" ovdje
    // ne primjenjuje, isto kao ni na glasanju.
    const strictChoice = q && q.aiHint && (['vote', 'mode', 'modes'].includes(q.aiHint.kind) ||
      q.aiHint.kind === 'ward' && q.aiHint.payment === 'blight') &&
      (q.type === 'chooseOption' || q.type === 'chooseMulti');
    const tieTolerance = strictChoice ? 0 : config.tieTolerance;
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
        nodeBudget: config.maxNodes, workload: simulationWorkload(game),
        style: player.aiStyle || 'balanced',
        skill: styleSkillFor(player) && styleSkillFor(player).id || null,
        mode: styleSkillMode(game, player, view, profile),
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
