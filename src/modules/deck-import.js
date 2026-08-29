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

  const KEYWORD_CONTRACTS = MTG.ORACLE_KEYWORD_CONTRACTS = Object.freeze({
    flying: 'flying-evasion',
    reach: 'reach-blocking',
    forestwalk: 'landwalk-evasion',
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
    'vanilla-permanent': { mechanics: [], path: 'base P/T → continuous effects → combat/SBA' },
    'flying-evasion': { mechanics: ['flying'], path: 'combat blocker legality' },
    'reach-blocking': { mechanics: ['reach'], path: 'combat blocker legality against flying' },
    'landwalk-evasion': { mechanics: ['forestwalk'], path: 'defender land subtype → blocker legality' },
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
    'continuous-layer': { mechanics: ['continuous effect'], path: 'recalc layers → current types/keywords/P/T' },
    'saga-chapter-stack': { mechanics: ['saga'], path: 'lore counter → chapter trigger → priority → sacrifice SBA' },
    'amass-army': { mechanics: ['amass'], path: 'choose/create Army → add subtype → counter replacement/events' },
    'ring-temptation': { mechanics: ['the Ring tempts you'], path: 'advance emblem → choose Ring-bearer → cumulative combat triggers' },
    'graveyard-zone-change': { mechanics: ['graveyard'], path: 'zone batch/LKI → target or choice → move/reanimate/exile' },
    'combat-trigger': { mechanics: ['combat'], path: 'attack/block/damage event → trigger → combat-safe effect' },
    'draw-discard-replacement': { mechanics: ['draw', 'discard'], path: 'individual draw/discard → replacement → event history' },
    'ward-alternative-cost': { mechanics: ['ward'], path: 'opponent target → ward trigger → sacrifice/pay or counter' },
    'cost-modification': { mechanics: ['cost reduction'], path: 'spell context → generic modifier → payment → mana value unchanged' },
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
        if (catalog.semanticClass === 'vanilla') addContract('vanilla-permanent', entry.name);
        if (!script || script.oracleImplemented !== true || script.oracleId !== catalog.oracleId) {
          unsupported.push({ card: entry.name, reason: 'missing-oracle-implementation-marker' });
        }
        if (catalog.semanticClass === 'manual-deck-semantic') {
          const manualContracts = script && Array.isArray(script.oracleContracts) ? script.oracleContracts : [];
          if (!manualContracts.length) unsupported.push({ card: entry.name, reason: 'missing-manual-interaction-contracts' });
          for (const contract of manualContracts) {
            if (!MTG.ORACLE_INTERACTION_CONTRACTS[contract]) unsupported.push({ card: entry.name, reason: `unknown-manual-contract:${contract}` });
            else addContract(contract, entry.name);
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
      if (!catalog || !ACCEPTED_ENGINE_STATUSES.has(catalog.engineStatus)) {
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
        engineCertified: cards.filter(entry => ACCEPTED_ENGINE_STATUSES.has(MTG.CARD_CATALOG && MTG.CARD_CATALOG[entry.name] && MTG.CARD_CATALOG[entry.name].engineStatus)).length,
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
    return deck;
  };

  MTG.importCommanderDeck = function (text, options) {
    options = options || {};
    const parsed = MTG.parseDeckText(text);
    const validation = MTG.validateImportedDeck(parsed, options);
    if (validation.ok && options.register) MTG.registerImportedDeck(validation, options);
    return Object.assign({ parsed }, validation);
  };
})();
