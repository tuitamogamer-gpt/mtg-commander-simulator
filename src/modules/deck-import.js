// ===== deck-import.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Runtime ugovor za main-menu paste import. Tekstualna lista ne ulazi u engine
// dok ne prođe format, Commander legalnost, engine-certification i interakcijski
// manifest. Tako custom deck koristi iste CardInst/stack/combat putanje kao
// fabrički deckovi, bez paralelnog ili pojednostavljenog enginea.
(function () {
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const ACCEPTED_ENGINE_STATUSES = new Set(['certified', 'certified-legacy']);
  const BASIC_NAMES = new Set(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes']);
  const IMPORTED_DECK_SCHEMA = 'commander-deck/v1';
  const IMPORTED_LIBRARY_SCHEMA = 'commander-deck-library/v1';
  const IMPORTED_LIBRARY_KEY = 'mtg-custom-deck-library/v1';
  const IMPORTED_LIBRARY_LIMIT = 40;
  const IMPORTED_DECK_ID = /^deck-[a-z0-9-]{8,80}$/;

  const KEYWORD_CONTRACTS = MTG.ORACLE_KEYWORD_CONTRACTS = Object.freeze({
    flying: 'flying-evasion',
    reach: 'reach-blocking',
    forestwalk: 'landwalk-evasion',
    plainswalk: 'landwalk-evasion',
    islandwalk: 'landwalk-evasion',
    swampwalk: 'landwalk-evasion',
    mountainwalk: 'landwalk-evasion',
    fear: 'fear-evasion',
    intimidate: 'intimidate-evasion',
    skulk: 'skulk-evasion',
    shadow: 'shadow-blocking',
    horsemanship: 'horsemanship-evasion',
    menace: 'menace-blocking',
    'first strike': 'first-strike-step',
    'double strike': 'double-strike-steps',
    deathtouch: 'deathtouch-lethal',
    lifelink: 'lifelink-life-gain',
    trample: 'trample-assignment',
    wither: 'wither-counters',
    haste: 'haste-attack-timing',
    vigilance: 'vigilance-attack-tap',
    defender: 'defender-attack-restriction',
    indestructible: 'indestructible-destroy-sba',
    hexproof: 'hexproof-opponent-targeting',
    shroud: 'shroud-all-targeting',
    ward: 'ward-stack-payment',
    flash: 'flash-cast-timing',
    prowess: 'prowess-cast-trigger',
  });

  MTG.ORACLE_INTERACTION_CONTRACTS = Object.freeze({
    'creature-casting': { mechanics: ['creature'], path: 'cast spell → stack → permanent' },
    'permanent-casting': { mechanics: ['artifact', 'enchantment'], path: 'cast spell → stack → permanent' },
    'spell-casting': { mechanics: ['instant', 'sorcery'], path: 'cast spell → target lock → Stack → resolution → graveyard' },
    'land-play': { mechanics: ['land'], path: 'land-play timing → battlefield entry → mana/ETB path' },
    'vanilla-permanent': { mechanics: [], path: 'base P/T → continuous effects → combat/SBA' },
    'flying-evasion': { mechanics: ['flying'], path: 'combat blocker legality' },
    'reach-blocking': { mechanics: ['reach'], path: 'combat blocker legality against flying' },
    'landwalk-evasion': { mechanics: ['landwalk'], path: 'matching defender land subtype → blocker legality' },
    'fear-evasion': { mechanics: ['fear'], path: 'artifact/black blocker legality' },
    'intimidate-evasion': { mechanics: ['intimidate'], path: 'artifact/shared-color blocker legality' },
    'skulk-evasion': { mechanics: ['skulk'], path: 'greater-power blocker restriction' },
    'shadow-blocking': { mechanics: ['shadow'], path: 'shadow parity blocker restriction' },
    'horsemanship-evasion': { mechanics: ['horsemanship'], path: 'horsemanship blocker restriction' },
    'menace-blocking': { mechanics: ['menace'], path: 'minimum two legal blockers' },
    'first-strike-step': { mechanics: ['first strike'], path: 'first-strike combat damage step' },
    'double-strike-steps': { mechanics: ['double strike'], path: 'first and normal combat damage steps' },
    'deathtouch-lethal': { mechanics: ['deathtouch'], path: 'damage marker → lethal/SBA' },
    'lifelink-life-gain': { mechanics: ['lifelink'], path: 'damage event → controller life gain' },
    'trample-assignment': { mechanics: ['trample'], path: 'lethal blocker assignment → defender overflow' },
    'wither-counters': { mechanics: ['wither'], path: 'creature damage → -1/-1 counters' },
    'haste-attack-timing': { mechanics: ['haste'], path: 'summoning-sickness attack/activation gate' },
    'vigilance-attack-tap': { mechanics: ['vigilance'], path: 'attacker declaration tap rule' },
    'defender-attack-restriction': { mechanics: ['defender'], path: 'attacker eligibility' },
    'indestructible-destroy-sba': { mechanics: ['indestructible'], path: 'destroy/deathtouch/lethal-damage replacement' },
    'hexproof-opponent-targeting': { mechanics: ['hexproof'], path: 'opponent target legality' },
    'shroud-all-targeting': { mechanics: ['shroud'], path: 'all-player target legality' },
    'ward-stack-payment': { mechanics: ['ward'], path: 'target lock → ward trigger → pay/counter' },
    'flash-cast-timing': { mechanics: ['flash'], path: 'priority cast timing' },
    'prowess-cast-trigger': { mechanics: ['prowess'], path: 'noncreature cast → trigger → EOT pump' },
    'manual-oracle-resolution': { mechanics: ['manual'], path: 'explicit per-card script → normal Stack/resolution path' },
    'trigger-stack': { mechanics: ['trigger'], path: 'engine event → queued trigger → priority → resolution' },
    'target-lock-revalidation': { mechanics: ['target'], path: 'legal target lock → ward/protection → resolution revalidation' },
    'activated-ability-cost': { mechanics: ['activated ability'], path: 'availability → target lock → cost payment → Stack' },
    'mana-source': { mechanics: ['mana'], path: 'mana ability → source selection → restricted pool/payment tracking' },
    'land-enters-tapped': { mechanics: ['land'], path: 'battlefield entry replacement → tapped state' },
    'cant-block-static': { mechanics: ['combat'], path: 'continuous restriction → blocker eligibility' },
    'must-attack-static': { mechanics: ['combat'], path: 'attacker requirement → legal declaration' },
    'permanent-enters-tapped': { mechanics: ['permanent'], path: 'battlefield entry replacement → tapped state' },
    'unblockable-static': { mechanics: ['combat'], path: 'continuous evasion → blocker eligibility' },
    'flying-blocker-only-static': { mechanics: ['combat'], path: 'continuous blocker restriction → blocker eligibility' },
    'protection-static': { mechanics: ['protection'], path: 'source quality → damage, targeting, blocking, attachment restrictions' },
    'cycling-ability': { mechanics: ['cycling'], path: 'hand ability → mana payment → discard → draw' },
    'mechanic-persist': { mechanics: ['persist'], path: 'dies event → return with -1/-1 counter' },
    'mechanic-undying': { mechanics: ['undying'], path: 'dies event → return with +1/+1 counter' },
    'mechanic-changeling': { mechanics: ['changeling'], path: 'continuous subtype identity → all creature types' },
    'mechanic-convoke': { mechanics: ['convoke'], path: 'spell payment → tap creatures for generic or matching colored mana' },
    'mechanic-cascade': { mechanics: ['cascade'], path: 'cast trigger → exile until lower mana value → optional free cast' },
    'mechanic-storm': { mechanics: ['storm'], path: 'cast history → Stack copies with target choice' },
    'mechanic-flashback': { mechanics: ['flashback'], path: 'graveyard cast → alternative mana payment → exile on resolution' },
    'mechanic-rebound': { mechanics: ['rebound'], path: 'cast from hand → exile on resolution → free cast next upkeep' },
    'mechanic-suspend': { mechanics: ['suspend'], path: 'hand action → exile with time counters → upkeep removal → free cast' },
    'mechanic-morph': { mechanics: ['morph'], path: 'face-down cast → 2/2 hidden permanent → special-action turn face up' },
    'mechanic-megamorph': { mechanics: ['megamorph'], path: 'face-down cast → paid special action → face up with a +1/+1 counter' },
    'mechanic-disguise': { mechanics: ['disguise'], path: 'face-down cast → warded 2/2 hidden permanent → special-action turn face up' },
    'mechanic-devoid': { mechanics: ['devoid'], path: 'characteristic-defining ability → colorless object in every zone' },
    'mechanic-uncounterable': { mechanics: ['uncounterable'], path: 'Stack target → counter attempt → spell remains on Stack' },
    'etb-draw': { mechanics: ['trigger', 'draw'], path: 'self ETB event → trigger Stack → draw' },
    'etb-life-gain': { mechanics: ['trigger', 'life'], path: 'self ETB event → trigger Stack → life gain' },
    'dies-draw': { mechanics: ['trigger', 'draw'], path: 'self dies/LKI event → trigger Stack → draw' },
    'etb-loot': { mechanics: ['trigger', 'draw', 'discard'], path: 'self ETB event → ordered discard/draw choice → zone events' },
    'etb-treasure': { mechanics: ['trigger', 'token'], path: 'self ETB event → Treasure token creation → mana ability' },
    'etb-each-opponent-discard': { mechanics: ['trigger', 'discard'], path: 'self ETB event → all opponents choose → simultaneous graveyard batch' },
    'dies-life-gain': { mechanics: ['trigger', 'life'], path: 'self dies/LKI event → trigger Stack → controller life gain' },
    'noncreature-cast-counter-self': { mechanics: ['trigger', 'counter'], path: 'controller noncreature cast → trigger Stack → self +1/+1 counter' },
    'etb-library-selection': { mechanics: ['trigger', 'scry', 'surveil'], path: 'self ETB event → trigger Stack → ordered library choice' },
    'etb-token-creation': { mechanics: ['trigger', 'token'], path: 'self ETB event → trigger Stack → exact token characteristics' },
    'etb-counter-self': { mechanics: ['trigger', 'counter'], path: 'self ETB event → trigger Stack → counter placement' },
    'attachment-continuous-effect': { mechanics: ['attachment'], path: 'legal host → continuous P/T, keyword, attack, block or untap layer' },
    'aura-targeting': { mechanics: ['aura'], path: 'cast target lock → protection/revalidation → attached battlefield entry' },
    'equipment-attach-ability': { mechanics: ['equipment'], path: 'sorcery-speed target → mana payment → ability Stack → attach' },
    'crew-ability': { mechanics: ['vehicle'], path: 'tap creature power → Vehicle becomes creature for the turn' },
    'aura-etb-tap': { mechanics: ['aura', 'trigger'], path: 'attached Aura ETB → trigger Stack → tap host' },
    'spell-draw': { mechanics: ['spell', 'draw'], path: 'Stack resolution → exact card draw' },
    'spell-counter': { mechanics: ['spell', 'counter'], path: 'stack target lock → uncounterable check → counter' },
    'spell-destroy': { mechanics: ['spell', 'destroy'], path: 'permanent target lock → resolution revalidation → destroy/SBA' },
    'spell-exile': { mechanics: ['spell', 'exile'], path: 'permanent target lock → resolution revalidation → exile' },
    'spell-damage': { mechanics: ['spell', 'damage'], path: 'target lock or each-opponent set → damage event/SBA' },
    'spell-pump': { mechanics: ['spell', 'continuous effect'], path: 'creature target lock → EOT P/T/keyword layer → SBA' },
    'spell-team-pump': { mechanics: ['spell', 'continuous effect'], path: 'controller battlefield set → EOT P/T/keyword layer → SBA' },
    'spell-life-gain': { mechanics: ['spell', 'life'], path: 'Stack resolution → life gain event' },
    'spell-bounce': { mechanics: ['spell', 'zone change'], path: 'permanent target lock → hand zone change/LKI' },
    'spell-discard': { mechanics: ['spell', 'discard'], path: 'player target lock → controller card choice → discard events' },
    'spell-mill': { mechanics: ['spell', 'mill'], path: 'player target lock → ordered library-to-graveyard moves' },
    'spell-draw-discard': { mechanics: ['spell', 'draw', 'discard'], path: 'Stack resolution → ordered draw → exact discard choice' },
    'spell-token-creation': { mechanics: ['spell', 'token'], path: 'Stack resolution → exact token characteristics and abilities' },
    'spell-token-roll-threshold': { mechanics: ['spell', 'token', 'die roll'], path: 'Stack resolution → exact base tokens → deterministic die roll → subtype threshold bonus token' },
    'spell-global-pump': { mechanics: ['spell', 'continuous effect'], path: 'Stack resolution → battlefield snapshot → EOT P/T layer → SBA' },
    'spell-counter-on-permanent': { mechanics: ['spell', 'counter'], path: 'target lock → Stack resolution → counter placement' },
    'spell-damage-prevention': { mechanics: ['spell', 'prevention'], path: 'Stack resolution → EOT combat-damage prevention replacement' },
    'spell-tap-untap': { mechanics: ['spell', 'tap', 'untap'], path: 'target lock → Stack resolution → exact tapped state' },
    'spell-library-selection': { mechanics: ['spell', 'scry', 'surveil'], path: 'Stack resolution → ordered library choice and zone moves' },
    'spell-add-mana': { mechanics: ['spell', 'mana'], path: 'Stack resolution → color choice → mana pool' },
    'spell-board-wipe': { mechanics: ['spell', 'destroy'], path: 'Stack resolution → simultaneous permanent set → destroy/LKI/SBA' },
    'continuous-layer': { mechanics: ['continuous effect'], path: 'recalc layers → current types/keywords/P/T' },
    'saga-chapter-stack': { mechanics: ['saga'], path: 'lore counter → chapter trigger → priority → sacrifice SBA' },
    'amass-army': { mechanics: ['amass'], path: 'choose/create Army → add subtype → counter replacement/events' },
    'ring-temptation': { mechanics: ['the Ring tempts you'], path: 'advance emblem → choose Ring-bearer → cumulative combat triggers' },
    'graveyard-zone-change': { mechanics: ['graveyard'], path: 'zone batch/LKI → target or choice → move/reanimate/exile' },
    'combat-trigger': { mechanics: ['combat'], path: 'attack/block/damage event → trigger → combat-safe effect' },
    'draw-discard-replacement': { mechanics: ['draw', 'discard'], path: 'individual draw/discard → replacement → event history' },
    'ward-alternative-cost': { mechanics: ['ward'], path: 'opponent target → ward trigger → sacrifice/pay or counter' },
    'cost-modification': { mechanics: ['cost reduction'], path: 'spell context → generic modifier → payment → mana value unchanged' },
    'generic-trigger-effect': { mechanics: ['trigger'], path: 'exact event/filter → target lock → Stack → ordered closed effects' },
    'generic-activated-effect': { mechanics: ['activated ability'], path: 'timing/target lock → exact cost → Stack → ordered closed effects' },
    'generic-continuous-effect': { mechanics: ['continuous effect'], path: 'scope/controller filter → recalculation layer → P/T/keyword/evasion state' },
    'generic-cost-modification': { mechanics: ['cost modification'], path: 'spell/controller filter → total mana cost → actual payment' },
    'attachment-granted-operation': { mechanics: ['granted ability'], path: 'attached permanent → host ability/controller → Stack resolution' },
    'spell-generic-effect': { mechanics: ['spell'], path: 'paid cast → legal targets → Stack → ordered closed effects' },
    'spell-modal-generic-effect': { mechanics: ['modal spell'], path: 'choose printed modes and targets → paid cast → printed resolution order' },
    'characteristic-power-toughness': { mechanics: ['characteristic defining ability'], path: 'printed count expression → every zone → continuous P/T layer' },
    'mechanic-unearth': { mechanics: ['unearth'], path: 'sorcery activation in graveyard → Stack → haste → exile replacement and delayed exile' },
    'mechanic-grave-return-self': { mechanics: ['graveyard ability'], path: 'mana payment → Stack → same graveyard object returns to hand' },
    'mechanic-embalm': { mechanics: ['embalm'], path: 'sorcery graveyard activation → exile cost → white Zombie copy' },
    'mechanic-eternalize': { mechanics: ['eternalize'], path: 'sorcery graveyard activation → exile cost → black 4/4 Zombie copy' },
    'mechanic-ninjutsu': { mechanics: ['ninjutsu'], path: 'unblocked attacker return cost → Stack → tapped attacking entry' },
    'mechanic-foretell': { mechanics: ['foretell'], path: 'special action → face-down exile → later-turn alternative cast' },
    'mechanic-evoke': { mechanics: ['evoke'], path: 'alternative mana payment → permanent spell → ETB sacrifice trigger' },
    'mechanic-dredge': { mechanics: ['dredge'], path: 'individual draw replacement → mill cost → graveyard card to hand' },
    'mechanic-surge': { mechanics: ['surge'], path: 'prior spell cast this turn → optional alternate mana cost' },
    'mechanic-spectacle': { mechanics: ['spectacle'], path: 'opponent lost life this turn → optional alternate mana cost' },
    'mechanic-devour': { mechanics: ['devour'], path: 'entry replacement → optional creature sacrifices → entry counters' },
    'mechanic-graft': { mechanics: ['graft'], path: 'entry counters → creature arrival trigger → move counter between exact objects' },
    'mechanic-plot': { mechanics: ['plot'], path: 'paid special action → exile → sorcery-speed free cast on a later turn' },
    'mechanic-dash': { mechanics: ['dash'], path: 'alternative payment → haste → delayed return at the next end step' },
    'mechanic-echo': { mechanics: ['echo'], path: 'control history → next-upkeep trigger → pay mana or sacrifice' },
    'mechanic-kicker': { mechanics: ['kicker'], path: 'optional additional mana payment → captured kicked choice' },
    'mechanic-additional-costs': { mechanics: ['additional costs'], path: 'announce targets → commit validated sacrifices/discards/life payment → Stack' },
    'mechanic-multikicker': { mechanics: ['multikicker'], path: 'repeated additional mana payment → captured payment count' },
    'mechanic-escape': { mechanics: ['escape'], path: 'graveyard spell → alternative mana and exile cost → normal resolution' },
    'mechanic-no-max-hand': { mechanics: ['hand size'], path: 'active permanent → cleanup maximum hand size' },
    'mechanic-retrace': { mechanics: ['retrace'], path: 'graveyard cast → mana and land discard payment → Stack' },
    'mechanic-soulshift': { mechanics: ['soulshift'], path: 'dies → Spirit graveyard target and mana value cap → optional return on resolution' },
    'mechanic-modular': { mechanics: ['modular'], path: 'entry counters → dies with last-known counters → artifact creature target' },
    'mechanic-fabricate': { mechanics: ['fabricate'], path: 'ETB → Stack → counters or Servo tokens, tied to source identity' },
    'mechanic-living-weapon': { mechanics: ['living weapon'], path: 'ETB → Germ creation and attachment before state-based actions' },
    'mechanic-for-mirrodin': { mechanics: ['For Mirrodin!'], path: 'ETB → Rebel creation and attachment before state-based actions' },
    'mechanic-afflict': { mechanics: ['afflict'], path: 'becomes blocked → Stack → captured defending player loses life' },
    'mechanic-ingest': { mechanics: ['ingest'], path: 'combat damage to player → Stack → top library card exiled' },
    'mechanic-offspring': { mechanics: ['offspring'], path: 'additional cast payment → ETB trigger → 1/1 copy token' },
    'permanent-enters-with-counters': { mechanics: ['counter'], path: 'battlefield entry replacement → exact/X counter placement → recalculation/SBA' },
    'conditional-land-entry': { mechanics: ['land'], path: 'entry condition → controller choice → tapped/untapped battlefield state' },
    'untap-step-restriction': { mechanics: ['untap'], path: 'untap step eligibility → source remains tapped' },
    'spell-v4-closed-ast': { mechanics: ['spell'], path: 'additional costs/modes/targets → Stack → ordered closed AST effects' },
    'mechanic-myriad': { mechanics: ['myriad'], path: 'attack trigger → opponent copies → combat → delayed exile' },
    'mechanic-infect': { mechanics: ['infect'], path: 'damage replacement → poison or -1/-1 counters → SBA' },
    'mechanic-exalted': { mechanics: ['exalted'], path: 'attacks-alone trigger → exact attacker EOT pump' },
    'mechanic-flanking': { mechanics: ['flanking'], path: 'block event → non-flanking blocker EOT debuff → SBA' },
    'mechanic-battle-cry': { mechanics: ['battle cry'], path: 'attack trigger → other attacking creatures EOT pump' },
    'mechanic-mentor': { mechanics: ['mentor'], path: 'attack trigger → lower-power attacking creature target → +1/+1 counter' },
    'mechanic-training': { mechanics: ['training'], path: 'attack pair power comparison → source +1/+1 counter' },
    'mechanic-riot': { mechanics: ['riot'], path: 'battlefield entry choice → haste or +1/+1 counter' },
    'mechanic-unleash': { mechanics: ['unleash'], path: 'battlefield entry choice → +1/+1 counter and block restriction' },
    'mechanic-evolve': { mechanics: ['evolve'], path: 'other creature ETB comparison → source +1/+1 counter' },
    'mechanic-extort': { mechanics: ['extort'], path: 'spell-cast trigger → optional hybrid payment → opponent drain/controller gain' },
    'mechanic-delve': { mechanics: ['delve'], path: 'spell payment → graveyard exile for generic reduction' },
    'mechanic-improvise': { mechanics: ['improvise'], path: 'spell payment → untapped artifact selection/tap for generic reduction' },
    'mechanic-affinity-artifacts': { mechanics: ['affinity'], path: 'artifact battlefield count → generic spell-cost reduction' },
    'mechanic-afterlife': { mechanics: ['afterlife'], path: 'dies trigger → exact white-black Spirit token count' },
    'mechanic-bushido': { mechanics: ['bushido'], path: 'block/becomes-blocked trigger → source EOT pump' },
    'mechanic-renown': { mechanics: ['renown'], path: 'first player combat damage → exact +1/+1 counters and renowned state' },
    'mechanic-bloodthirst': { mechanics: ['bloodthirst'], path: 'opponent damaged this turn → battlefield entry counters' },
    'mechanic-toxic': { mechanics: ['toxic'], path: 'player combat damage → exact poison counters → SBA' },
    'mechanic-typecycling': { mechanics: ['typecycling'], path: 'hand ability → mana/discard cost → exact land-type library search/shuffle' },
  });

  const COMBINATION_CONTRACTS = Object.freeze([
    { id: 'flying-vs-reach', all: ['flying', 'reach'] },
    { id: 'deathtouch-plus-trample', all: ['deathtouch', 'trample'] },
    { id: 'first-strike-plus-deathtouch', one: ['first strike', 'double strike'], all: ['deathtouch'] },
    { id: 'strike-plus-lifelink', one: ['first strike', 'double strike'], all: ['lifelink'] },
    { id: 'strike-plus-wither', one: ['first strike', 'double strike'], all: ['wither'] },
    { id: 'target-protection-stack', one: ['hexproof', 'shroud', 'ward'], all: [] },
  ]);

  function issue(code, message, card) {
    return Object.assign({ code, message }, card ? { card } : {});
  }

  function nameKey(value) {
    return String(value || '').normalize('NFKC')
      .replace(/[\u2018\u2019\u02bc]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
  }

  let cachedNameCount = -1;
  let cachedNameIndex = new Map();
  function nameIndex() {
    const names = Object.keys(MTG.CARD_CATALOG || MTG.DEFS || {});
    if (names.length !== cachedNameCount) {
      cachedNameCount = names.length;
      cachedNameIndex = new Map();
      for (const name of names) {
        const key = nameKey(name);
        if (!cachedNameIndex.has(key)) cachedNameIndex.set(key, name);
        else cachedNameIndex.set(key, null);
      }
    }
    return cachedNameIndex;
  }

  MTG.resolveDeckCardName = function (name) {
    if ((MTG.CARD_CATALOG && MTG.CARD_CATALOG[name]) || (MTG.DEFS && MTG.DEFS[name])) return name;
    return nameIndex().get(nameKey(name)) || null;
  };

  function stripExportSuffixes(value) {
    let name = String(value || '').trim();
    const commanderTagged = /(?:\*\s*(?:CMDR|COMMANDER|C)\s*\*|\[\s*commander\s*\]|#\s*commander)\s*$/i.test(name);
    name = name.replace(/\s*(?:\*\s*(?:CMDR|COMMANDER|C|F|FOIL)\s*\*|\[\s*commander\s*\]|#\s*commander)\s*$/gi, '').trim();
    name = name.replace(/\s*\[[A-Za-z0-9]{2,8}:?[^\]]*\]\s*$/, '').trim();
    name = name.replace(/\s*\([A-Za-z0-9]{2,8}\)(?:\s+[A-Za-z0-9★#-]+)?\s*$/, '').trim();
    return { name, commanderTagged };
  }

  MTG.parseDeckText = function (text) {
    const cards = [];
    const commanders = [];
    const ignored = [];
    let section = 'main';
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);

    for (const [index, rawLine] of lines.entries()) {
      const line = rawLine.trim();
      if (!line || /^(?:#|\/\/)(?:\s|$)/.test(line)) continue;
      const sectionMatch = /^(Commander|Commanders|Deck|Mainboard|Main|Sideboard|Considering|Maybeboard|Companion|Tokens?)\s*:?\s*$/i.exec(line);
      if (sectionMatch) {
        const value = sectionMatch[1].toLowerCase();
        section = value.startsWith('commander') ? 'commander'
          : ['sideboard', 'considering', 'maybeboard', 'companion', 'token', 'tokens'].includes(value) ? 'skip' : 'main';
        continue;
      }
      if (/^SB:\s*/i.test(line) || section === 'skip') {
        ignored.push({ line: index + 1, text: line, reason: 'non-mainboard-section' });
        continue;
      }

      const quantityMatch = /^(\d+)\s*x?\s+(.+)$/i.exec(line);
      const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;
      const cleaned = stripExportSuffixes(quantityMatch ? quantityMatch[2] : line);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || !cleaned.name) {
        ignored.push({ line: index + 1, text: line, reason: 'invalid-card-line' });
        continue;
      }
      const isCommander = section === 'commander' || cleaned.commanderTagged;
      cards.push({ n: quantity, name: cleaned.name, section: isCommander ? 'Commander' : 'Main', line: index + 1 });
      if (isCommander && !commanders.some(name => nameKey(name) === nameKey(cleaned.name))) commanders.push(cleaned.name);
    }

    return { cards, commanders, commander: commanders[0] || null, ignored };
  };

  function allowedCopies(def) {
    if (!def) return 0;
    if ((def.super || []).includes('Basic') || BASIC_NAMES.has(def.name)) return Infinity;
    const oracle = String(def.oracle || '');
    if (/A deck can have any number of cards named/i.test(oracle)) return Infinity;
    const match = /A deck can have up to (\d+) cards named/i.exec(oracle);
    return match ? Number(match[1]) : 1;
  }

  function normalizedMechanic(keyword) {
    const value = String(keyword || '').trim().toLowerCase();
    return value.startsWith('ward ') ? 'ward' : value;
  }

  MTG.auditImportedDeckInteractions = function (deckData, defs) {
    defs = defs || MTG.DEFS;
    const mechanics = new Set();
    const contractCards = new Map();
    const unsupported = [];
    let batchCards = 0;

    const addContract = (id, name) => {
      if (!contractCards.has(id)) contractCards.set(id, new Set());
      contractCards.get(id).add(name);
    };

    for (const entry of deckData && deckData.cards || []) {
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      const def = defs && defs[entry.name];
      if (!catalog || !def) continue;
      const script = MTG.SCRIPTS && MTG.SCRIPTS[entry.name];
      const isBatch = !!catalog.engineBatch;
      if (isBatch) {
        batchCards += entry.n;
        if ((def.types || []).includes('Creature')) addContract('creature-casting', entry.name);
        if ((def.types || []).some(type => type === 'Artifact' || type === 'Enchantment') &&
            !(def.types || []).includes('Creature')) addContract('permanent-casting', entry.name);
        if ((def.types || []).includes('Land')) addContract('land-play', entry.name);
        if ((def.types || []).some(type => type === 'Instant' || type === 'Sorcery')) addContract('spell-casting', entry.name);
        if (catalog.semanticClass === 'vanilla') addContract('vanilla-permanent', entry.name);
        if (!script || script.oracleImplemented !== true || script.oracleId !== catalog.oracleId) {
          unsupported.push({ card: entry.name, reason: 'missing-oracle-implementation-marker' });
        }
        const oracleContracts = script && Array.isArray(script.oracleContracts) ? script.oracleContracts : [];
        const implementationKinds = catalog.implementationKinds || [];
        if (catalog.semanticClass === 'manual-deck-semantic' && !oracleContracts.length) {
          unsupported.push({ card: entry.name, reason: 'missing-manual-interaction-contracts' });
        }
        if (implementationKinds.length && !oracleContracts.length) {
          unsupported.push({ card: entry.name, reason: 'missing-template-interaction-contracts' });
        }
        const compiledKinds = script && Array.isArray(script.oracleImplementation)
          ? script.oracleImplementation.map(operation => operation.kind)
          : [];
        if (implementationKinds.length && (compiledKinds.length !== implementationKinds.length ||
            implementationKinds.some((kind, index) => compiledKinds[index] !== kind))) {
          unsupported.push({ card: entry.name, reason: 'compiled-template-mismatch' });
        }
        for (const contract of oracleContracts) {
          if (!MTG.ORACLE_INTERACTION_CONTRACTS[contract]) {
            const prefix = catalog.semanticClass === 'manual-deck-semantic'
              ? 'unknown-manual-contract:' : 'unknown-template-contract:';
            unsupported.push({ card: entry.name, reason: prefix + contract });
          } else {
            addContract(contract, entry.name);
          }
        }
      }
      const keywords = isBatch && catalog.semanticClass !== 'manual-deck-semantic'
        ? (catalog.implementedKeywords || [])
        : isBatch ? [] : [...(def.kws || []), ...(def.ward ? ['ward'] : [])];
      for (const rawKeyword of keywords) {
        const mechanic = normalizedMechanic(rawKeyword);
        if (!mechanic) continue;
        mechanics.add(mechanic);
        const contract = KEYWORD_CONTRACTS[mechanic];
        if (contract) addContract(contract, entry.name);
        else if (isBatch) unsupported.push({ card: entry.name, reason: `no-interaction-contract:${mechanic}` });
      }
    }

    const combinations = COMBINATION_CONTRACTS.filter(contract =>
      contract.all.every(mechanic => mechanics.has(mechanic)) &&
      (!contract.one || contract.one.some(mechanic => mechanics.has(mechanic))))
      .map(contract => contract.id);
    return {
      ready: unsupported.length === 0,
      batchCards,
      mechanics: [...mechanics].sort(),
      contracts: [...contractCards].sort(([a], [b]) => a.localeCompare(b)).map(([id, names]) => ({
        id,
        cards: [...names].sort(),
        path: MTG.ORACLE_INTERACTION_CONTRACTS[id] && MTG.ORACLE_INTERACTION_CONTRACTS[id].path || '',
      })),
      combinations,
      unsupported,
    };
  };

  MTG.validateImportedDeck = function (parsed, options) {
    options = options || {};
    const errors = [];
    const warnings = [];
    const aggregate = new Map();
    const unresolved = [];
    const inputCards = parsed && Array.isArray(parsed.cards) ? parsed.cards : [];
    const inputTotal = inputCards.reduce((sum, entry) => sum + (Number(entry.n) || 0), 0);
    if (inputTotal !== 100) errors.push(issue('deck-size', `Commander deck needs exactly 100 cards including commanders; found ${inputTotal}.`));

    for (const entry of inputCards) {
      const resolved = MTG.resolveDeckCardName(entry.name);
      if (!resolved) {
        unresolved.push(entry.name);
        errors.push(issue('unknown-card', `${entry.name} is not available in the engine catalog.`, entry.name));
        continue;
      }
      const current = aggregate.get(resolved) || { n: 0, name: resolved, section: entry.section || 'Main' };
      current.n += Number(entry.n) || 0;
      if (entry.section === 'Commander') current.section = 'Commander';
      aggregate.set(resolved, current);
    }

    const cards = [...aggregate.values()];
    for (const entry of cards) {
      const def = MTG.DEFS && MTG.DEFS[entry.name];
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      const max = allowedCopies(def);
      if (entry.n > max) errors.push(issue('singleton', `${entry.name} allows ${max} cop${max === 1 ? 'y' : 'ies'}, but the list contains ${entry.n}.`, entry.name));
      if (!catalog || !ACCEPTED_ENGINE_STATUSES.has(catalog.engineStatus) || catalog.deckImportEligible !== true) {
        errors.push(issue('engine-unsupported', `${entry.name} is not semantically certified for gameplay.`, entry.name));
      }
      if (catalog && catalog.commanderLegality && catalog.commanderLegality !== 'legal') {
        errors.push(issue('commander-legality', `${entry.name} is ${catalog.commanderLegality} in Commander.`, entry.name));
      }
    }

    const requestedCommanders = (options.commanders && options.commanders.length ? options.commanders : parsed && parsed.commanders || [])
      .map(name => MTG.resolveDeckCardName(name) || name);
    if (!requestedCommanders.length) errors.push(issue('missing-commander', 'Mark one or two cards in a Commander section or with *CMDR*.'));
    if (requestedCommanders.length > 2) errors.push(issue('commander-count', `Commander supports one or two legal commanders; found ${requestedCommanders.length}.`));
    for (const name of requestedCommanders) {
      const entry = aggregate.get(name);
      if (!entry) errors.push(issue('commander-missing-from-deck', `${name} is marked as commander but is not in the 100-card deck.`, name));
      else if (entry.n !== 1) errors.push(issue('commander-copy-count', `${name} must appear exactly once.`, name));
    }

    const deckName = String(options.name || `Imported — ${requestedCommanders.join(' + ') || 'Commander deck'}`).trim();
    const draftDeck = {
      name: deckName,
      set: 'CUSTOM',
      commander: requestedCommanders[0] || null,
      commanders: requestedCommanders.slice(0, 2),
      cards,
      custom: true,
      imported: true,
      trustedFaceCommander: false,
      source: 'pasted-decklist',
    };

    if (requestedCommanders.length >= 1 && requestedCommanders.length <= 2 &&
        requestedCommanders.every(name => aggregate.has(name) && MTG.DEFS && MTG.DEFS[name])) {
      const commanderCheck = MTG.validateCommanders(draftDeck, requestedCommanders, MTG.DEFS);
      if (!commanderCheck.ok) errors.push(issue('invalid-commanders', commanderCheck.why));
    }

    const unknownLegality = cards.filter(entry => {
      const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
      return catalog && catalog.engineStatus === 'certified-legacy' && !catalog.commanderLegality;
    });
    if (unknownLegality.length) warnings.push(issue('legacy-legality-provenance',
      `${unknownLegality.length} legacy engine cards predate per-card Scryfall legality metadata; their existing engine certification is retained.`));
    if (parsed && parsed.ignored && parsed.ignored.length) warnings.push(issue('ignored-sections',
      `${parsed.ignored.length} sideboard, maybeboard, companion, or token lines were ignored.`));

    const interactions = MTG.auditImportedDeckInteractions(draftDeck, MTG.DEFS);
    for (const problem of interactions.unsupported) {
      errors.push(issue('interaction-unsupported', `${problem.card}: ${problem.reason}.`, problem.card));
    }

    return {
      ok: errors.length === 0,
      deck: errors.length ? null : draftDeck,
      draftDeck,
      commanders: requestedCommanders,
      summary: {
        inputCards: inputTotal,
        resolvedCards: cards.reduce((sum, entry) => sum + entry.n, 0),
        uniqueCards: cards.length,
        unresolvedCards: unresolved.length,
        colorIdentity: requestedCommanders.flatMap(name => MTG.cardColorIdentity(MTG.DEFS && MTG.DEFS[name]))
          .filter((color, index, all) => COLORS.includes(color) && all.indexOf(color) === index),
        engineCertified: cards.filter(entry => {
          const catalog = MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name];
          return !!catalog && ACCEPTED_ENGINE_STATUSES.has(catalog.engineStatus) && catalog.deckImportEligible === true;
        }).length,
      },
      interactions,
      errors,
      warnings,
    };
  };

  MTG.registerImportedDeck = function (validation, options) {
    options = options || {};
    if (!validation || !validation.ok || !validation.deck) throw new Error('Only a validated imported deck can be registered.');
    const deck = validation.deck;
    if (!MTG.DECKS || !MTG.DECK_META) throw new Error('Card/deck data must be initialized before deck registration.');
    if (MTG.DECKS[deck.name] && (!MTG.DECKS[deck.name].custom || !options.replace)) {
      throw new Error(`Deck name already exists: ${deck.name}`);
    }
    MTG.DECKS[deck.name] = deck;
    MTG.DECK_META[deck.name] = {
      icon: '📋',
      colors: validation.summary.colorIdentity.slice(),
      style: 'Imported decklist',
      blurb: `${validation.summary.uniqueCards} unique cards · ${validation.interactions.contracts.length} engine interaction contracts`,
      set: 'Pasted Commander deck',
      custom: true,
    };
    if (MTG.invalidateDeckAIProfile) MTG.invalidateDeckAIProfile(deck.name);
    return deck;
  };

  function deckIdPart(value) {
    let hash = 2166136261;
    const input = String(value || '');
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, '0');
  }

  function freshDeckId(validation) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return `deck-${globalThis.crypto.randomUUID().toLowerCase()}`;
    }
    const seed = `${validation.deck.name}|${validation.commanders.join('|')}|${Date.now()}|${Math.random()}`;
    return `deck-${deckIdPart(seed)}-${deckIdPart(seed.split('').reverse().join(''))}`;
  }

  function copyRecord(record) {
    record = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
    return {
      schema: IMPORTED_DECK_SCHEMA,
      id: record.id,
      name: record.name,
      commanders: Array.isArray(record.commanders) ? record.commanders.slice() : [],
      cards: Array.isArray(record.cards)
        ? record.cards.map(entry => ({ name: entry && entry.name, n: entry && entry.n, section: entry && entry.section }))
        : [],
      ...(Number.isSafeInteger(record.revision) ? { revision: record.revision } : {}),
      ...(record.createdAt ? { createdAt: record.createdAt } : {}),
      ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    };
  }

  function validRecordText(value, max) {
    return typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= max &&
      !/[\u0000-\u001f\u007f]/.test(value);
  }

  function guestRecordId(record) {
    return record && typeof record === 'object' && !Array.isArray(record) && typeof record.id === 'string'
      ? record.id
      : '';
  }

  function recordShapeErrors(record) {
    const errors = [];
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return [issue('library-record', 'Saved deck record is not an object.')];
    }
    if (record.schema !== IMPORTED_DECK_SCHEMA) errors.push(issue('library-schema', 'Saved deck uses an unsupported library format.'));
    if (!validRecordText(record.id, 85) || !IMPORTED_DECK_ID.test(record.id)) {
      errors.push(issue('library-id', 'Saved deck has an invalid identifier.'));
    }
    if (!validRecordText(record.name, 80)) {
      errors.push(issue('library-name', 'Saved deck name must contain 1–80 trimmed, control-free characters.'));
    }
    const commandersValid = Array.isArray(record.commanders) && record.commanders.length >= 1 && record.commanders.length <= 2 &&
      record.commanders.every(value => validRecordText(value, 160));
    const commanderKeys = commandersValid ? record.commanders.map(nameKey) : [];
    const commandersUnique = commandersValid && new Set(commanderKeys).size === commanderKeys.length;
    if (!commandersValid || !commandersUnique) {
      errors.push(issue('library-commanders', 'Saved deck must name one or two commanders.'));
    }
    if (!Array.isArray(record.cards) || record.cards.length < 1 || record.cards.length > 100) {
      errors.push(issue('library-cards', 'Saved deck must contain canonical card rows.'));
      return errors;
    }
    const seen = new Set();
    const validRows = [];
    let total = 0;
    for (const row of record.cards) {
      const rowName = row && typeof row.name === 'string' ? row.name : '';
      if (!row || typeof row !== 'object' || Array.isArray(row) || !validRecordText(rowName, 160) ||
          !Number.isSafeInteger(row.n) || row.n < 1 || row.n > 100 ||
          !['Commander', 'Main'].includes(row && row.section)) {
        errors.push(issue('library-card-row', 'Saved deck contains a malformed card row.', validRecordText(rowName, 160) ? rowName : undefined));
        continue;
      }
      const key = nameKey(rowName);
      if (seen.has(key)) errors.push(issue('library-card-duplicate', `${rowName} appears in more than one saved row.`, rowName));
      seen.add(key);
      total += row.n;
      validRows.push(row);
    }
    if (total !== 100) errors.push(issue('deck-size', `Commander deck needs exactly 100 cards including commanders; found ${total}.`));
    if (commandersValid && commandersUnique) {
      const rowsByName = new Map(validRows.map(row => [row.name, row]));
      const commanderNames = new Set(record.commanders);
      for (const commander of record.commanders) {
        const row = rowsByName.get(commander);
        if (!row || row.n !== 1 || row.section !== 'Commander') {
          errors.push(issue('library-commander-row', `${commander} must appear exactly once in the Commander section.`, commander));
        }
      }
      const unexpectedCommander = validRows.find(row => row.section === 'Commander' && !commanderNames.has(row.name));
      if (unexpectedCommander) {
        errors.push(issue('library-unexpected-commander', `${unexpectedCommander.name} is not listed as a commander.`, unexpectedCommander.name));
      }
    }
    return errors;
  }

  MTG.IMPORTED_DECK_SCHEMA = IMPORTED_DECK_SCHEMA;
  MTG.IMPORTED_LIBRARY_SCHEMA = IMPORTED_LIBRARY_SCHEMA;
  MTG.IMPORTED_LIBRARY_KEY = IMPORTED_LIBRARY_KEY;
  MTG.IMPORTED_LIBRARY_LIMIT = IMPORTED_LIBRARY_LIMIT;

  MTG.createImportedDeckRecord = function (validation, options) {
    options = options || {};
    if (!validation || !validation.ok || !validation.deck) throw new Error('Only a validated imported deck can be saved.');
    const now = options.now || new Date().toISOString();
    return {
      schema: IMPORTED_DECK_SCHEMA,
      id: options.id || freshDeckId(validation),
      name: validation.deck.name,
      commanders: validation.commanders.slice(),
      cards: validation.deck.cards.map(entry => ({
        name: entry.name,
        n: entry.n,
        section: validation.commanders.includes(entry.name) ? 'Commander' : 'Main',
      })),
      ...(Number.isSafeInteger(options.revision) ? { revision: options.revision } : {}),
      createdAt: options.createdAt || now,
      updatedAt: now,
    };
  };

  MTG.validateImportedDeckRecord = function (record) {
    const structuralErrors = recordShapeErrors(record);
    const safeRecord = record && typeof record === 'object' ? record : {};
    const parsed = {
      cards: Array.isArray(safeRecord.cards) ? safeRecord.cards.map(entry => ({
        name: entry && entry.name,
        n: entry && entry.n,
        section: entry && entry.section,
      })) : [],
      commanders: Array.isArray(safeRecord.commanders) ? safeRecord.commanders.slice() : [],
      ignored: [],
    };
    const validation = MTG.validateImportedDeck(parsed, {
      name: typeof safeRecord.name === 'string' ? safeRecord.name.trim() : '',
      commanders: parsed.commanders,
    });
    if (!structuralErrors.length) return Object.assign({ record: copyRecord(safeRecord) }, validation);
    return Object.assign({}, validation, {
      ok: false,
      deck: null,
      record: null,
      errors: structuralErrors.concat(validation.errors || []),
    });
  };

  let registeredLibraryNames = new Set();
  let importedLibrary = { source: 'guest', error: null, entries: [] };

  MTG.clearImportedDeckLibraryRegistrations = function () {
    for (const name of registeredLibraryNames) {
      if (MTG.DECKS && MTG.DECKS[name] && MTG.DECKS[name].custom) delete MTG.DECKS[name];
      if (MTG.DECK_META && MTG.DECK_META[name] && MTG.DECK_META[name].custom) delete MTG.DECK_META[name];
      if (MTG.invalidateDeckAIProfile) MTG.invalidateDeckAIProfile(name);
    }
    registeredLibraryNames = new Set();
  };

  function publicLibrary() {
    return {
      source: importedLibrary.source,
      error: importedLibrary.error,
      entries: importedLibrary.entries.map(entry => ({
        record: entry.record ? copyRecord(entry.record) : null,
        id: entry.id,
        name: entry.name,
        commanders: entry.commanders.slice(),
        ready: entry.ready,
        issues: entry.issues.map(problem => ({ code: problem.code, message: problem.message, ...(problem.card ? { card: problem.card } : {}) })),
      })),
    };
  }

  MTG.getImportedDeckLibrary = publicLibrary;
  MTG.hideImportedDeckLibrary = function (options) {
    options = options || {};
    importedLibrary = { source: options.source || 'loading', error: options.error || null, entries: [] };
    return publicLibrary();
  };
  MTG.getImportedDeckLibraryEntry = function (id) {
    return importedLibrary.entries.find(entry => entry.id === id) || null;
  };

  MTG.hydrateImportedDeckLibrary = function (records, options) {
    options = options || {};
    MTG.clearImportedDeckLibraryRegistrations();
    const entries = [];
    const seenIds = new Set();
    const seenNames = new Set();
    const input = Array.isArray(records) ? records.slice(0, IMPORTED_LIBRARY_LIMIT) : [];
    for (const candidate of input) {
      const record = candidate && typeof candidate === 'object' ? candidate : {};
      const validation = MTG.validateImportedDeckRecord(record);
      const id = String(record.id || '');
      const name = String(record.name || '').trim();
      const issues = (validation.errors || []).slice();
      const normalizedName = nameKey(name);
      if (seenIds.has(id)) issues.push(issue('library-duplicate-id', 'Another saved deck uses this identifier.'));
      if (seenNames.has(normalizedName)) issues.push(issue('library-duplicate-name', `Another saved deck is also named ${name}.`));
      const existing = MTG.DECKS && MTG.DECKS[name];
      if (existing && !existing.custom) issues.push(issue('deck-name-collision', `A built-in deck is already named ${name}.`));
      const ready = validation.ok && issues.length === 0;
      if (ready) {
        try {
          MTG.registerImportedDeck(validation, { replace: true });
          registeredLibraryNames.add(name);
        } catch (error) {
          issues.push(issue('library-registration', error && error.message || 'Saved deck could not be registered.'));
        }
      }
      seenIds.add(id);
      seenNames.add(normalizedName);
      entries.push({
        record: validation.record || (record && typeof record === 'object' ? record : null),
        validation,
        id,
        name,
        commanders: Array.isArray(record.commanders) ? record.commanders.slice(0, 2) : [],
        ready: ready && issues.length === 0,
        issues,
      });
    }
    importedLibrary = { source: options.source || 'guest', error: options.error || null, entries };
    return publicLibrary();
  };

  MTG.readGuestImportedDeckRecords = function (storage) {
    storage = storage || globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function') return { ok: true, records: [] };
    try {
      const text = storage.getItem(IMPORTED_LIBRARY_KEY);
      if (!text) return { ok: true, records: [] };
      const value = JSON.parse(text);
      if (!value || value.schema !== IMPORTED_LIBRARY_SCHEMA || !Array.isArray(value.records)) {
        return { ok: false, records: [], error: 'Saved deck library uses an unsupported format.' };
      }
      if (value.records.length > IMPORTED_LIBRARY_LIMIT) {
        return { ok: false, records: [], error: `Saved deck library exceeds the ${IMPORTED_LIBRARY_LIMIT}-deck limit.` };
      }
      return { ok: true, records: value.records };
    } catch (error) {
      return { ok: false, records: [], error: `Saved deck library could not be read: ${error && error.message || 'invalid data'}.` };
    }
  };

  MTG.loadGuestImportedDeckLibrary = function (options) {
    options = options || {};
    const loaded = MTG.readGuestImportedDeckRecords(options.storage);
    return MTG.hydrateImportedDeckLibrary(loaded.records, { source: 'guest', error: loaded.ok ? null : loaded.error });
  };

  MTG.upsertGuestImportedDeck = function (record, options) {
    options = options || {};
    const storage = options.storage || globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable. Sign in to save this deck across devices.');
    const validation = MTG.validateImportedDeckRecord(record);
    if (!validation.ok) {
      const error = new Error(validation.errors[0] && validation.errors[0].message || 'Deck is not engine-certified.');
      error.validation = validation;
      throw error;
    }
    const loaded = MTG.readGuestImportedDeckRecords(storage);
    if (!loaded.ok) throw new Error(loaded.error);
    const records = loaded.records.map(copyRecord);
    const sameId = records.findIndex(saved => saved.id === record.id);
    const sameName = records.findIndex(saved => nameKey(saved.name) === nameKey(record.name) && saved.id !== record.id);
    if (sameName >= 0) throw new Error(`A saved deck is already named ${record.name}. Remove it or choose another name.`);
    const existingBuiltIn = MTG.DECKS && MTG.DECKS[record.name];
    if (existingBuiltIn && !existingBuiltIn.custom) throw new Error(`A built-in deck is already named ${record.name}.`);
    const canonical = copyRecord(validation.record);
    if (sameId >= 0) records[sameId] = canonical;
    else {
      if (records.length >= IMPORTED_LIBRARY_LIMIT) throw new Error(`Your library can contain up to ${IMPORTED_LIBRARY_LIMIT} imported decks.`);
      records.push(canonical);
    }
    const payload = JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records });
    storage.setItem(IMPORTED_LIBRARY_KEY, payload);
    MTG.hydrateImportedDeckLibrary(records, { source: 'guest' });
    return copyRecord(canonical);
  };

  MTG.removeGuestImportedDeck = function (id, options) {
    options = options || {};
    const storage = options.storage || globalThis.localStorage;
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Browser storage is unavailable.');
    const loaded = MTG.readGuestImportedDeckRecords(storage);
    if (!loaded.ok) {
      storage.setItem(IMPORTED_LIBRARY_KEY, JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records: [] }));
      MTG.hydrateImportedDeckLibrary([], { source: 'guest' });
      return true;
    }
    const targetId = typeof id === 'string' ? id : '';
    const records = loaded.records.filter(record => guestRecordId(record) !== targetId).map(copyRecord);
    if (records.length === loaded.records.length) return false;
    storage.setItem(IMPORTED_LIBRARY_KEY, JSON.stringify({ schema: IMPORTED_LIBRARY_SCHEMA, records }));
    MTG.hydrateImportedDeckLibrary(records, { source: 'guest' });
    return true;
  };

  MTG.importCommanderDeck = function (text, options) {
    options = options || {};
    const parsed = MTG.parseDeckText(text);
    const validation = MTG.validateImportedDeck(parsed, options);
    if (validation.ok && options.register) MTG.registerImportedDeck(validation, options);
    return Object.assign({ parsed }, validation);
  };
})();
