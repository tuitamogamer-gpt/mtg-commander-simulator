// Physical double-faced identity is independent from a current copy effect.
// All printed face definitions are compiled before they reach this module.
((M) => {
  const wrapped = new WeakMap();
  const keys = ['front', 'back'];
  const permanentTypes = ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'];
  const fail = message => { throw new Error('Oracle double-faced card: ' + message); };

  function stripSeed(definition) {
    const {oracleFaces, oracleFace, oracleCanonicalName, ...plain} = definition;
    return plain;
  }

  function faceDefinition(faces, key) {
    if (!faces || !keys.includes(key)) return null;
    const face = faces.faces.find(face => face.key === key);
    if (!face) return null;
    let cache = wrapped.get(faces);
    if (!cache) { cache = new Map(); wrapped.set(faces, cache); }
    if (!cache.has(key)) cache.set(key, {...face.def, oracleFaces: faces, oracleFace: key, oracleCanonicalName: faces.canonicalName});
    return cache.get(key);
  }

  function physical(card) {
    return card?.oracleFaces || null;
  }

  function definition(card, castOptions = {}) {
    castOptions ||= {};
    const faces = physical(card);
    if (!faces || castOptions.faceDownCast) return card?.def;
    return castOptions.oracleFace === undefined ? card.def : faceDefinition(faces, castOptions.oracleFace);
  }

  function view(card, key) {
    const def = faceDefinition(physical(card), key);
    if (!def) return null;
    // Only pure eligibility predicates receive this view. Costs, targets,
    // state changes and Stack objects retain the original CardInst identity.
    return Object.assign(Object.create(card), {def, cur: null});
  }

  function spellSource(card, def, controller = card?.ctrl) {
    return Object.assign(Object.create(card), {def, cur: null, zone: 'stack', ctrl: controller,
      oracleFaces: def.oracleFaces || null, oracleFace: def.oracleFace || null});
  }

  function compile(entry, operation, compileFace) {
    if (!['modal_dfc', 'transform'].includes(operation.layout) || operation.faces?.length !== 2 || operation.faces.some((face, index) => face.key !== keys[index] || !face.raw?.name || !Array.isArray(face.raw.types))) fail('invalid complete face descriptor');
    const raw = {}, scripts = {};
    for (const face of operation.faces) {
      const faceEntry = {...face, oracleId: entry.oracleId, raw: {...face.raw, kws: [...(face.raw.kws || [])]}};
      raw[face.raw.name] = faceEntry.raw;
      scripts[face.raw.name] = compileFace(faceEntry);
    }
    const definitions = M.buildDefs(raw, scripts, {registerTypes: false});
    const faces = {layout: operation.layout, canonicalName: entry.raw.name,
      // Deck-import certification compares the complete physical-card
      // descriptor.  The active face still keeps its own executable
      // implementation and contracts for casting and resolution.
      oracleImplementation: (entry.implementation || []).map(item => ({...item})),
      oracleContracts: (entry.oracleContracts || []).slice(),
      faces: operation.faces.map(face => ({key: face.key, def: stripSeed(definitions[face.raw.name])}))};
    return faceDefinition(faces, 'front');
  }

  function initialize(card) {
    card.oracleFaces = card.def.oracleFaces || null;
    card.oracleFace = card.oracleFaces ? card.def.oracleFace || 'front' : null;
    card.oracleTransformCount = 0;
  }

  function setFace(card, key) {
    const def = faceDefinition(physical(card), key);
    if (!def) return false;
    card.oracleFace = key;
    card.def = def;
    return true;
  }

  function moveFace(card, toZone, options = {}) {
    const faces = physical(card);
    if (!faces) return null;
    if (toZone !== 'battlefield' && toZone !== 'stack') return 'front';
    if (options.faceDownDef || card.faceDown && toZone === 'battlefield') return 'front';
    const key = options.oracleFace !== undefined ? options.oracleFace : ['stack', 'battlefield'].includes(card.zone) || card.isToken && card.zone === 'nowhere' ? card.oracleFace : 'front';
    const def = faceDefinition(faces, key);
    if (!def || toZone === 'battlefield' && !permanentTypes.some(type => def.types.includes(type))) return false;
    return key;
  }

  function copyTokenDefinition(source, modify = definition => definition) {
    // A CardInst's explicit null means an ordinary single-faced Clone. Some
    // legacy copy definitions carry a seed, which must not change that fact.
    const faces = source && Object.hasOwn(source, 'oracleFaces') ? source.oracleFaces : source?.def?.oracleFaces;
    if (!faces || source?.faceDown) return modify(stripSeed(source.isCopyOf || source.def));
    const key = source.oracleFace || source.def.oracleFace || 'front';
    const copied = !source.def.oracleFaces;
    const tokenFaces = {layout: faces.layout, canonicalName: faces.canonicalName,
      faces: faces.faces.map(face => ({key: face.key, def: stripSeed(modify(stripSeed(copied ? source.isCopyOf || source.def : face.def)))}))};
    return faceDefinition(tokenFaces, key);
  }

  // A transforming card is always cast or played as its front face; only a
  // modal card offers a choice between both printed faces.
  function playableFaces(faces) {
    return faces.layout === 'transform' ? faces.faces.filter(face => face.key === 'front') : faces.faces;
  }

  function castCandidates(game, player, card, from = card.zone) {
    const faces = physical(card);
    if (!faces || card.zone !== from) return [];
    const mine = card.owner === player;
    const result = [];
    for (const face of playableFaces(faces)) {
      const def = face.def, candidate = view(card, face.key);
      if (def.types.includes('Land')) continue;
      const offer = base => result.push({...base, oracleFace: face.key, name: def.name, label: def.name + (def.cost ? ' ' + def.cost : '')});
      if ((from === 'hand' && mine && player.hand.includes(card)) || (from === 'command' && mine && player.command.includes(card))) {
        offer({});
        for (const alternative of def.altCosts || []) if (!alternative.cond || alternative.cond(game, player, candidate)) offer(alternative);
        if (player.bloodcasterAlternative?.turn === game.turnNo && player.life > M.mv(def.cost || '')) offer({free: true, bloodcaster: true, lifeCost: M.mv(def.cost || '')});
      } else if (from === 'graveyard' && mine && player.graveyard.includes(card)) {
        if (def.flashback && !card.meta._fbUsed) offer({flashback: true, ...def.flashback});
        const spell = def.types.some(type => type === 'Instant' || type === 'Sorcery');
        if (spell && def.cost && (card.meta.flashbackUntil === game.turnNo || game.bf().some(source => source.ctrl === player && !source.cur?.abilitiesDisabled && source.def.grantsFlashback))) offer({flashback: true, altCostStr: def.cost});
        if (def.jumpstart) offer({jumpstart: true, ...def.jumpstart});
        if (def.retrace && player.hand.some(other => other.is('Land'))) offer({retrace: true, ...def.retrace});
        if (def.harmonize) offer({harmonize: true, altCostStr: typeof def.harmonize === 'string' ? def.harmonize : def.harmonize.cost, exileAfter: true});
        if (def.escape && player.graveyard.filter(other => other !== card).length >= (def.escape.exileN || 0)) offer({escape: true, ...def.escape});
        if (card.meta.emryCastTurn === game.turnNo) offer({emry: true});
        if (game.turnPlayer === player && game.bf().some(source => source.ctrl === player && !source.cur?.abilitiesDisabled && source.def.grantsGraveyardPermanentTypes)) {
          const used = player.turnState.gravePermanentTypesUsed || [];
          const available = permanentTypes.filter(type => type !== 'Land' && def.types.includes(type) && !used.includes(type));
          if (available.length) offer({muldrotha: true, muldrothaTypes: available});
        }
        if(M.OracleV8Mayhem?.available(game,player,card,def))offer(M.OracleV8Mayhem.alternative(def));
      } else if (from === 'exile' && card.owner.exile.includes(card)) {
        const meta = card.meta || {};
        if (!mine && meta.playableBy !== player) continue;
        if (meta.playableCondition && !meta.playableCondition(game, player, candidate)) continue;
        if (meta.needsOppLost && !game.alivePlayers().some(other => other !== player && other.turnState.lifeLost > 0)) continue;
        if (mine && meta.plotted && meta.plottedTurn < game.turnNo) offer({free: true, plotPlay: true, speed: 'sorcery'});
        if (mine && meta.foretold && meta.foretoldTurn < game.turnNo && def.foretell) {
          const foretell = typeof def.foretell === 'string' ? {cost: def.foretell} : def.foretell;
          offer({foretell: true, altCostStr: foretell.cost, ...(foretell.speed ? {speed: foretell.speed} : {})});
        }
        if (game.hasExilePlayPermission(player, card)) offer({consumeExilePermission: true, ...(meta.freePlay ? {free: true} : {}), ...(meta.anyColor ? {asThoughAnyColor: true} : {}), ...(meta.exileAfterPlay ? {exileAfter: true} : {})});
      } else if (from === 'library' && mine && player.library.at(-1) === card && game.bf().some(source => source.ctrl === player && !source.cur?.abilitiesDisabled && source.def.playTop?.(game, source, candidate, player))) offer({fromTop: true});
    }
    return result;
  }

  function landFaces(game, player, card) {
    const faces = physical(card);
    if (!faces) return [];
    const mine = card.owner === player, from = card.zone;
    return playableFaces(faces).filter(face => {
      if (!face.def.types.includes('Land')) return false;
      const candidate = view(card, face.key);
      if (from === 'hand') return mine && player.hand.includes(card);
      if (from === 'graveyard') return mine && player.graveyard.includes(card) && game.bf().some(source => source.ctrl === player && !source.cur?.abilitiesDisabled && (source.def.playLandsFromGraveyard || game.turnPlayer === player && source.def.grantsGraveyardPermanentTypes && !(player.turnState.gravePermanentTypesUsed || []).includes('Land')));
      if (from === 'exile') return card.owner.exile.includes(card) && (mine || card.meta.playableBy === player) && !card.meta.spellsOnly && game.hasExilePlayPermission(player, card) && (!card.meta.playableCondition || card.meta.playableCondition(game, player, candidate));
      if (from === 'library') return mine && player.library.at(-1) === card && game.bf().some(source => source.ctrl === player && !source.cur?.abilitiesDisabled && source.def.playTop?.(game, source, candidate, player));
      return false;
    });
  }

  function candidates(game, player) {
    return [...new Set([...player.hand, ...player.command, ...player.graveyard, ...game.players.flatMap(owner => owner.exile), player.library.at(-1)].filter(card => physical(card)))];
  }

  function castChoiceAllowed(game, player, card, castOptions) {
    const key = castOptions.oracleFace;
    const def = faceDefinition(physical(card), key);
    if (!def || def.types.includes('Land')) return false;
    const from = castOptions.from || card.zone;
    if (card.isCopySpell && card.zone === 'nowhere' && castOptions.free) return true;
    const alternatives = castCandidates(game, player, card, from).filter(option => option.oracleFace === key);
    if (!alternatives.length) return false;
    const permissionKeys = ['flashback', 'jumpstart', 'retrace', 'harmonize', 'escape', 'emry', 'muldrotha', 'mayhem', 'foretell', 'plotPlay', 'fromTop'];
    return alternatives.some(option => permissionKeys.every(field => !!option[field] === !!castOptions[field]) && (option.altCostStr === castOptions.altCostStr || castOptions.free));
  }

  M.OracleV8Faces = {compile, initialize, physical, definition, faceDefinition, view, spellSource, setFace, moveFace, stripSeed, copyTokenDefinition, castCandidates, landFaces, candidates, castChoiceAllowed};
})(globalThis.MTG || (globalThis.MTG = {}));
