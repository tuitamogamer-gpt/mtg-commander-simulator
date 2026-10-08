'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// A real state snapshot, as opposed to replaying a recorded timeline.
//
// Replaying every human decision onto a fresh engine breaks the moment the
// rules engine or the AI changes, and a long game takes as long to restore as
// it took to play. This module writes the board itself.
//
// Not everything in a live game is data: until-end-of-turn effects, delayed
// triggers and emblems carry closures created by card scripts, and there is no
// general way to serialize a function. So a snapshot is only taken at a moment
// when none of those unsupported effects exist — in practice the start of a turn, which is a
// natural resume point anyway and covers the large majority of turns. When a
// turn begins with a lingering effect the previous snapshot is kept, so the
// worst case is resuming one turn earlier rather than losing the game.
(function () {
  const U = MTG;
  const FORMAT = 2;

  const assert = (condition, message) => { if (!condition) throw new Error(`Saved state: ${message}`); };

  // Card scratch space is script-owned. Keep only what survives JSON, so a
  // script that parked a closure or a card reference there cannot poison a save.
  function plainMeta(meta) {
    const out = {};
    for (const [key, value] of Object.entries(meta || {})) {
      if (value === null) { out[key] = null; continue; }
      const type = typeof value;
      if (type === 'number' || type === 'string' || type === 'boolean') { out[key] = value; continue; }
      if (type === 'object') {
        try {
          const encoded = JSON.stringify(value);
          if (encoded !== undefined && encoded.length <= 4000) out[key] = JSON.parse(encoded);
        } catch (error) { /* circular or card-bearing scratch: not portable */ }
      }
    }
    return out;
  }

  function tokenKeyOf(def) {
    if(def.bomTokenKey&&MTG.TOKENS[def.bomTokenKey])return def.bomTokenKey;
    for (const [key, candidate] of Object.entries(MTG.TOKENS || {})) if (candidate === def) return key;
    // Scripts also build tokens inline. A catalog token with the same printed
    // face is the same object for every purpose that matters here.
    for (const [key, candidate] of Object.entries(MTG.TOKENS || {})) {
      if (candidate.name === def.name &&
        String(candidate.power) === String(def.power) && String(candidate.toughness) === String(def.toughness) &&
        (candidate.types || []).join(',') === (def.types || []).join(',') &&
        (candidate.subtypes || []).join(',') === (def.subtypes || []).join(',')) return key;
    }
    return null;
  }

  // Last resort for an inline token with no catalog twin: write down its face.
  // Abilities created by the script are lost, the body is not.
  function tokenFace(def) {
    return {
      name: def.name,
      ...(def.rulesNoName ? {rulesNoName:true} : {}),
      types: (def.types || []).slice(),
      subtypes: (def.subtypes || []).slice(),
      super: (def.super || []).slice(),
      power: def.power,
      toughness: def.toughness,
      colorsOverride: (def.colorsOverride || def.colors || []).slice(),
      kws: (def.kws || []).slice(),
      oracle: String(def.oracle || ''),
    };
  }

  const COPY_FACE_FIELDS = ['name', 'cost', 'types', 'subtypes', 'super', 'power', 'toughness', 'colorsOverride', 'kws', 'oracle'];
  function copyOverrides(def, base) {
    const out = {};
    for (const key of COPY_FACE_FIELDS) if (def[key] !== undefined && JSON.stringify(def[key]) !== JSON.stringify(base[key])) {
      out[key] = JSON.parse(JSON.stringify(def[key]));
    }
    if (base.cdaPower && !def.cdaPower) out.removeCdaPower = true;
    if (base.cdaToughness && !def.cdaToughness) out.removeCdaToughness = true;
    return out;
  }
  function copiedDefinition(entry) {
    const def = Object.assign({}, MTG.DEFS[entry.copyOf]);
    for (const [key, value] of Object.entries(entry.copyOverrides || {})) {
      assert(COPY_FACE_FIELDS.includes(key) || ['removeCdaPower', 'removeCdaToughness'].includes(key), 'invalid copy exception.');
      if (key.startsWith('removeCda')) {
        assert(value === true, 'invalid copy ability exception.');
        delete def[key === 'removeCdaPower' ? 'cdaPower' : 'cdaToughness'];
        delete def.oracleCharacteristicPT;
      } else {
        assert(['types', 'subtypes', 'super', 'colorsOverride', 'kws'].includes(key)
          ? Array.isArray(value) && value.length <= 256 && value.every(item => typeof item === 'string' && item.length <= 128)
          : typeof value === 'string' && value.length <= 10000 || typeof value === 'number' && Number.isFinite(value), 'invalid copy face.');
        def[key] = Array.isArray(value) ? value.slice() : value;
      }
    }
    return def;
  }

  // Every card is written as "what it is" plus "how it sits on the table".
  function captureCard(card) {
    const face=card.faceDown&&!card.isToken?card.meta.faceDownDef||card.def:card.def;
    const printed = face?.c1719Unflipped || face;
    // Double-faced cards are catalogued under their "Front // Back" name; the
    // current face is saved separately as oracleFace. Saving the face name
    // made every checkpoint with such a card fail ("not in this build").
    const catalogName = printed?.oracleCanonicalName && MTG.DEFS[printed.oracleCanonicalName]
      ? printed.oracleCanonicalName : printed?.name;
    const identity = { name: catalogName };
    if (card.isToken) {
      identity.token = tokenKeyOf(card.def);
      // A token copy of a real card keeps that card's name; anything else that
      // is not a catalog token is not portable.
      identity.copyOf = !card.def.rulesNoName && card.isCopyOf && card.isCopyOf.name || null;
      if (identity.copyOf && MTG.DEFS[identity.copyOf]) {
        const overrides = copyOverrides(card.def, MTG.DEFS[identity.copyOf]);
        if (Object.keys(overrides).length) identity.copyOverrides = overrides;
      }
      if (!identity.token && !identity.copyOf && !MTG.DEFS[identity.name]) identity.face = tokenFace(card.def);
    } else if (card.isCopySpell && card.meta?.preparedBy && MTG.E.preparedSpellDefinitions?.[card.meta.oraclePreparedDefinitionV10||identity.name]) {
      identity.preparedSpell = true;
    } else {
      assert(MTG.DEFS[identity.name], `card ${identity.name || '?'} is not in this build.`);
    }
    // Most cards in a save sit untouched in a library. Only what differs from a
    // fresh card is written, which keeps a full four-player save small enough
    // to live in a profile.
    const entry = {
      ...identity,
      iid: card.iid,
      owner: card.owner ? card.owner.idx : null,
      zone: card.zone,
    };
    if (card.ctrl && card.owner && card.ctrl !== card.owner) entry.ctrl = card.ctrl.idx;
    if (card.tapped) entry.tapped = true;
    if (card.sick) entry.sick = true;
    if (card.damage) entry.damage = Number(card.damage) || 0;
    if (card.deathtouched) entry.deathtouched = true;
    if (card.regenShield) entry.regenShield = Number(card.regenShield) || 0;
    const counters = Object.fromEntries(Object.entries(card.counters || {}).filter(([, value]) => value));
    if (Object.keys(counters).length) entry.counters = counters;
    if (card.attachedTo !== null && card.attachedTo !== undefined) entry.attachedTo = card.attachedTo;
    if ((card.attachments || []).length) entry.attachments = card.attachments.slice();
    if (card.isToken) entry.isToken = true;
    if (card.faceDown) entry.faceDown = true;
    if (card.commander) entry.commander = true;
    if (card.cmdCasts) entry.cmdCasts = Number(card.cmdCasts) || 0;
    if (card.timestamp) entry.timestamp = Number(card.timestamp) || 0;
    if (card.zoneVersion) entry.zoneVersion = Number(card.zoneVersion) || 0;
    if (card.phasedOut) entry.phasedOut = true;
    if (card.phasedOut && card.cur) entry.phasedCharacteristics = {
      types: card.cur.types.slice(), subtypes: card.cur.subtypes.slice(), super: card.cur.super.slice(),
      colors: card.cur.colors.slice(), keywords: [...card.cur.kw],
      power: card.power, toughness: card.toughness, basePower: card.cur.basePower, baseToughness: card.cur.baseToughness,
    };
    if (card.oracleFace) entry.oracleFace = card.oracleFace;
    if(card.oraclePrototypeV10)entry.oraclePrototypeV10=true;
    if (card.oracleTransformCount) entry.oracleTransformCount = Number(card.oracleTransformCount) || 0;
    const meta = plainMeta(card.meta);
    const entryFormV26=MTG.OracleV26Common?.captureForm(card);
    if(entryFormV26){
      entry.oracleEntryFormV26=entryFormV26;
      // Definitions contain compiled functions; restore them from the catalog.
      delete meta.characteristicOriginalDef;delete meta.oracleEntryFormV26;
    }
    if (Object.keys(meta).length) entry.meta = meta;
    return entry;
  }

  function capturePlayer(player) {
    return {
      idx: player.idx,
      name: player.name,
      deckName: player.deckName || (player.deck && player.deck.name) || null,
      isAI: !!player.isAI,
      aiStyle: player.aiStyle || null,
      onlineSeat: player.onlineSeat ?? null,
      life: player.life,
      startingLife: player.startingLife,
      poison: Number(player.poison) || 0,
      counters: {energy: Number(player.counters?.energy) || 0, ...(player.counters?.experience ? {experience: player.counters.experience} : {}), ...(player.counters?.rad ? {rad: player.counters.rad} : {})},
      lost: !!player.lost,
      landsPlayed: Number(player.landsPlayed) || 0,
      maxLands: Number(player.maxLands) || 1,
      commanderDamage: Object.assign({}, player.commanderDamage || {}),
      commanders: (player.commanders || []).map(card => card.iid),
      chosenCommanders: player.chosenCommanders ? player.chosenCommanders.slice() : null,
      colorIdentity: (player.colorIdentity || []).slice(),
      ...(player.wlmClaraColor?{wlmClaraColor:player.wlmClaraColor}:{}),
      cityBlessing: !!player.cityBlessing,
      enduringStory: !!player.enduringStory,
      maximumHandSizeReductionV64: player.maximumHandSizeReductionV64||0,
      spellsCastThisGameV64: player.spellsCastThisGameV64??null,
      lcGollumDamaged: !!player.lcGollumDamaged,
      afcDungeon: player.afcDungeon?plainMeta(player.afcDungeon):null, afcDungeonSerial: player.afcDungeonSerial||0, afcCompletedDungeons: player.afcCompletedDungeons||0,
      skipUntapOnce: !!player.skipUntapOnce,
      turnsStarted: Number(player.turnsStarted) || 0,
      lastTurnSpellsCast: Number(player.lastTurnSpellsCast) || 0,
      noMaxHandForever: !!player.noMaxHandForever,
      bdfApproaches: Number(player.bdfApproaches)||0,
      // A snapshot is taken between turns, so the pool is empty and the turn
      // state is about to be replaced; both are restored for exactness anyway.
      pool: Object.assign({}, player.pool || {}),
      // Turn state is script-visible scratch too: it can hold card and player
      // references. Only the portable part is kept.
      turnState: plainMeta(player.turnState),
      c1719PreviousTurnAttacks:(player.c1719PreviousTurnAttacks||[]).slice(),
      c1719CurrentTurnAttacks:(player.c1719CurrentTurnAttacks||[]).slice(),
    };
  }

  // What in this game state cannot be written down?
  // Only explicitly supported data-only lasting effects are portable. Unknown
  // effect shapes and closures still block a save instead of silently changing
  // the resumed rules state.
  function isPlainGoad(effect) {
    return effect && effect.kind === 'goadCard' && typeof effect.apply !== 'function' &&
      Number.isInteger(effect.iid) && (effect.expires === 'never' || effect.expires === 'untilTurnOf');
  }
  function captureGoad(effect) {
    return {
      kind: 'goadCard', iid: effect.iid, expires: effect.expires,
      notPlayer: effect.notPlayer ? effect.notPlayer.idx : null,
      whoTurn: effect.whoTurn ? effect.whoTurn.idx : null,
    };
  }

  // Every card identity still present in a zone, with its current version.
  function cardVersions(game) {
    const versions = new Map(game.battlefield.map(card => [card.iid, card.zoneVersion]));
    for (const player of game.players) for (const zone of ['library', 'hand', 'graveyard', 'exile', 'command']) {
      for (const card of player[zone]) versions.set(card.iid, card.zoneVersion);
    }
    return versions;
  }
  // These kinds are applied only to the battlefield object with their exact
  // iid and zone version.
  const OBJECT_BOUND_KINDS = new Set(['oracleGrantedOperation', 'oracleSourcePump', 'oracleCombatRestriction',
    'oracleAnimation', 'oracleCharacteristics', 'oracleBasePT', 'oracleLandTypes', 'oracleCopy', 'oracleZoneReplacementV64', 'wlmType', 'cwwFlag']);
  // Zone versions only increase, so once that object has moved on or ceased
  // to exist (a dead token), the entry is history, not state, and must not
  // block every later save in the game. Same for a card-specific attack
  // restriction whose card no longer exists anywhere. An effect with its own
  // apply closure runs on every recalculation and is never assumed inert.
  function isInertEffect(effect, versions) {
    if (!effect || typeof effect.apply === 'function' || !Number.isSafeInteger(effect.iid) || effect.iid <= 0) return false;
    if (effect.kind === 'cantAttackPlayerCard') return !versions.has(effect.iid);
    if (!OBJECT_BOUND_KINDS.has(effect.kind) || effect.expires !== 'object' ||
      !Number.isSafeInteger(effect.zoneVersion) || effect.zoneVersion < 0) return false;
    const current = versions.get(effect.iid);
    return current === undefined || current > effect.zoneVersion;
  }

  // The continuous-effect list stamps every new entry with a layer timestamp.
  const validLayerTimestamp = effect => effect.oracleLayerTimestamp === undefined ||
    Number.isSafeInteger(effect.oracleLayerTimestamp) && effect.oracleLayerTimestamp > 0 &&
    effect.oracleLayerTimestamp <= MTG.MAX_RESTORED_TIMESTAMP;

  // Attack restrictions only name seats and card identities.
  const PLAYER_ATTACK_FIELDS = new Set(['kind', 'who', 'notPlayer', 'expires', 'whoTurn', 'afterTurnsStarted', 'oracleLayerTimestamp']);
  const CARD_ATTACK_FIELDS = new Set(['kind', 'iid', 'timestamp', 'notPlayer', 'expires', 'whileCounter', 'oracleLayerTimestamp']);
  function validAttackRestriction(effect, seat) {
    if (!effect || typeof effect !== 'object' || !validLayerTimestamp(effect)) return false;
    if (effect.kind === 'cantAttackPlayer') {
      return Object.keys(effect).every(key => PLAYER_ATTACK_FIELDS.has(key)) &&
        seat(effect.who) && seat(effect.notPlayer) && seat(effect.whoTurn) &&
        (effect.expires === 'untilTurnOf' && effect.afterTurnsStarted === undefined ||
          effect.expires === 'throughTurnOf' && Number.isSafeInteger(effect.afterTurnsStarted) && effect.afterTurnsStarted >= 0);
    }
    return effect.kind === 'cantAttackPlayerCard' && Object.keys(effect).every(key => CARD_ATTACK_FIELDS.has(key)) &&
      Number.isSafeInteger(effect.iid) && effect.iid > 0 && seat(effect.notPlayer) && effect.expires === 'never' &&
      (effect.timestamp === undefined || Number.isSafeInteger(effect.timestamp) && effect.timestamp >= 0 &&
        effect.timestamp <= MTG.MAX_RESTORED_TIMESTAMP) &&
      (effect.whileCounter === undefined || typeof effect.whileCounter === 'string' && effect.whileCounter.length <= 64);
  }
  const isPlainAttackRestriction = effect => validAttackRestriction(effect, player => player instanceof MTG.Player);
  // Restrictions are checks, not layered changes, so a restore may stamp them anew.
  function captureAttackRestriction(effect) {
    const out = {};
    for (const [key, value] of Object.entries(effect)) {
      if (key !== 'oracleLayerTimestamp') out[key] = value instanceof MTG.Player ? value.idx : value;
    }
    return out;
  }
  function currentAttackRestrictions(game, versions = cardVersions(game)) {
    return game.untilEffects.filter(effect => isPlainAttackRestriction(effect) && !isInertEffect(effect, versions));
  }

  // A keyword granted for as long as a permanent stays (token copies that gain
  // haste, Grave Upheaval). Self death replacements are plain descriptors;
  // other granted abilities carry compiled closures and still block a save.
  const GRANTED_KEYWORD_FIELDS = new Set(['kind', 'expires', 'iid', 'zoneVersion', 'timestamp', 'field', 'grants', 'keywords', 'oracleLayerTimestamp']);
  function isPlainGrantedKeywords(effect) {
    return !!effect && effect.kind === 'oracleGrantedOperation' && Object.keys(effect).every(key => GRANTED_KEYWORD_FIELDS.has(key)) &&
      validLayerTimestamp(effect) &&
      effect.expires === 'object' && Number.isSafeInteger(effect.iid) && effect.iid > 0 &&
      Number.isSafeInteger(effect.zoneVersion) && effect.zoneVersion >= 0 &&
      (effect.timestamp === undefined || Number.isSafeInteger(effect.timestamp) && effect.timestamp > 0 &&
        effect.timestamp <= MTG.MAX_RESTORED_TIMESTAMP) &&
      ['extraAbilities', 'extraTriggers', 'extraMana', 'extraZoneReplacements'].includes(effect.field) &&
      Array.isArray(effect.grants) && (effect.grants.length === 0 || effect.field==='extraZoneReplacements' &&
        effect.grants.length<=32 && effect.grants.every(grant=>{
          if(grant?.scope!=='self'||grant.from!=='battlefield'||grant.to!=='exile'||grant.creatureOnly!==true)return false;
          try{return MTG.OracleV8ZoneReplacements.compile(grant)===grant;}catch{return false;}
        })) &&
      Array.isArray(effect.keywords) && effect.keywords.length <= 32 &&
      effect.keywords.every(keyword => typeof keyword === 'string' && keyword.length <= 64);
  }
  const captureGrantedKeywords = effect => ({...effect, grants: effect.grants.map(grant=>({...grant})), keywords: effect.keywords.slice()});
  function currentGrantedKeywords(game) {
    const versions = new Map(game.battlefield.map(card => [card.iid, card.zoneVersion]));
    return game.untilEffects.filter(effect => isPlainGrantedKeywords(effect) && versions.get(effect.iid) === effect.zoneVersion);
  }

  const OBJECT_ZONE_FIELDS=new Set(['kind','iid','zoneVersion','replacement','expires','timestamp','oracleLayerTimestamp']);
  function isPlainObjectZoneReplacement(effect){
    return !!effect&&effect.kind==='oracleZoneReplacementV64'&&Object.keys(effect).every(key=>OBJECT_ZONE_FIELDS.has(key))&&
      effect.replacement==='leave'&&effect.expires==='object'&&Number.isSafeInteger(effect.iid)&&effect.iid>0&&
      Number.isSafeInteger(effect.zoneVersion)&&effect.zoneVersion>=0&&validLayerTimestamp(effect)&&
      (effect.timestamp===undefined||Number.isSafeInteger(effect.timestamp)&&effect.timestamp>0&&effect.timestamp<=MTG.MAX_RESTORED_TIMESTAMP)&&
      (effect.timestamp!==undefined||effect.oracleLayerTimestamp!==undefined);
  }
  function currentObjectZoneReplacements(game){
    const versions=new Map(game.battlefield.map(card=>[card.iid,card.zoneVersion]));
    return game.untilEffects.filter(effect=>isPlainObjectZoneReplacement(effect)&&versions.get(effect.iid)===effect.zoneVersion);
  }

  const BASE_PT_FIELDS = new Set(['kind', 'iid', 'zoneVersion', 'timestamp', 'expires', 'power', 'toughness', 'keywords', 'temporary']);
  const MAX_BASE_PT_EFFECTS = 4096;
  function isPlainBasePT(effect) {
    return effect && effect.kind === 'oracleBasePT' &&
      Object.keys(effect).every(key => BASE_PT_FIELDS.has(key)) &&
      Number.isSafeInteger(effect.iid) && effect.iid > 0 &&
      Number.isSafeInteger(effect.zoneVersion) && effect.zoneVersion >= 0 &&
      Number.isSafeInteger(effect.timestamp) && effect.timestamp > 0 && effect.timestamp <= MTG.MAX_RESTORED_TIMESTAMP &&
      (effect.expires === 'object' || effect.expires === 'eot') &&
      (effect.temporary === undefined || typeof effect.temporary === 'boolean') &&
      (effect.expires === 'eot') === (effect.temporary === true) &&
      (effect.power !== undefined || effect.toughness !== undefined) &&
      [effect.power, effect.toughness].every(value => value === undefined || Number.isSafeInteger(value)) &&
      (effect.keywords === undefined || Array.isArray(effect.keywords) && effect.keywords.length <= 32 &&
        effect.keywords.every(keyword => typeof keyword === 'string' && keyword.length <= 64));
  }
  function captureBasePT(effect) {
    const out = {
      kind: 'oracleBasePT', iid: effect.iid, zoneVersion: effect.zoneVersion,
      timestamp: effect.timestamp, expires: effect.expires,
    };
    for (const field of ['power', 'toughness', 'temporary']) if (effect[field] !== undefined) out[field] = effect[field];
    if (effect.keywords !== undefined) out.keywords = effect.keywords.slice();
    return out;
  }
  function currentBasePTEffects(game) {
    const versions = new Map(game.battlefield.map(card => [card.iid, card.zoneVersion]));
    // A blink/death permanently invalidates the old object-version effect.
    // Do not carry these inert historical entries into every later checkpoint.
    return game.untilEffects.filter(effect => isPlainBasePT(effect) && versions.get(effect.iid) === effect.zoneVersion);
  }

  const isPlainLandTypes=effect=>!!MTG.OracleV8LandTypes?.isPortable(effect);
  const captureLandTypes=effect=>MTG.OracleV8LandTypes.portableRecord(effect);
  function currentLandTypeEffects(game){const versions=new Map(game.battlefield.map(card=>[card.iid,card.zoneVersion]));return game.untilEffects.filter(effect=>isPlainLandTypes(effect)&&versions.get(effect.iid)===effect.zoneVersion);}

  // Enduring's return changes only types. Preserve this closed, plain-data
  // animation without admitting other animations or executable closures.
  const ENCHANTMENT_RETURN_FIELDS=new Set(['kind','iid','zoneVersion','timestamp','expires','types','subtypes','keywords','retainTypes','retainAllSubtypes','temporary']);
  function isPlainEnchantmentReturn(effect){return effect&&effect.kind==='oracleAnimation'&&Object.keys(effect).every(key=>ENCHANTMENT_RETURN_FIELDS.has(key))&&
    Number.isSafeInteger(effect.iid)&&effect.iid>0&&Number.isSafeInteger(effect.zoneVersion)&&effect.zoneVersion>=0&&
    Number.isSafeInteger(effect.timestamp)&&effect.timestamp>0&&effect.timestamp<=MTG.MAX_RESTORED_TIMESTAMP&&effect.expires==='object'&&effect.temporary===false&&effect.retainTypes===false&&effect.retainAllSubtypes===false&&
    Array.isArray(effect.types)&&effect.types.length===1&&effect.types[0]==='Enchantment'&&Array.isArray(effect.subtypes)&&effect.subtypes.length===0&&Array.isArray(effect.keywords)&&effect.keywords.length===0;}
  const captureEnchantmentReturn=effect=>({...effect,types:['Enchantment'],subtypes:[],keywords:[]});
  function currentEnchantmentReturns(game){const versions=new Map(game.battlefield.map(card=>[card.iid,card.zoneVersion]));return game.untilEffects.filter(effect=>isPlainEnchantmentReturn(effect)&&versions.get(effect.iid)===effect.zoneVersion);}

  MTG.gameStateSnapshotBlockers = function (game) {
    const blockers = [];
    if (!game || !Array.isArray(game.players) || !game.players.length) return ['no game'];
    if (game.stack.length) blockers.push(`${game.stack.length} object(s) on the stack`);
    if (game.pendingTriggers.length) blockers.push(`${game.pendingTriggers.length} waiting trigger(s)`);
    const versions = cardVersions(game);
    const grantedKeywords = new Set(currentGrantedKeywords(game));
    const objectZoneReplacements=new Set(currentObjectZoneReplacements(game));
    const lasting = game.untilEffects.filter(effect => !isPlainGoad(effect) && !isPlainBasePT(effect) && !isPlainLandTypes(effect) &&
      !isPlainEnchantmentReturn(effect) && !isPlainAttackRestriction(effect) && !grantedKeywords.has(effect) && !objectZoneReplacements.has(effect) && !isInertEffect(effect, versions));
    if (lasting.length) blockers.push(`${lasting.length} lasting effect(s)`);
    if (currentBasePTEffects(game).length > MAX_BASE_PT_EFFECTS) blockers.push('too many base power/toughness effects');
    if (currentLandTypeEffects(game).length > MAX_BASE_PT_EFFECTS) blockers.push('too many land type effects');
    if (currentEnchantmentReturns(game).length > MAX_BASE_PT_EFFECTS) blockers.push('too many enchantment return effects');
    if(objectZoneReplacements.size>MAX_BASE_PT_EFFECTS)blockers.push('too many object zone replacements');
    if (game.delayed.length) blockers.push(`${game.delayed.length} delayed trigger(s)`);
    const emblems = game.players.reduce((sum, player) => sum + (player.emblems || []).length, 0);
    if (emblems) blockers.push(`${emblems} emblem(s)`);
    if ((game._additionalPhases || []).length) blockers.push('a scheduled additional phase');
    if ((game.extraTurns || []).length || game._extraTurnAnchor) blockers.push('a scheduled extra turn');
    if(MTG.C1719?.snapshotBlockers)blockers.push(...MTG.C1719.snapshotBlockers(game));
    if(MTG.CDK?.snapshotBlockers)blockers.push(...MTG.CDK.snapshotBlockers(game));
    if(MTG.VN?.snapshotBlockers)blockers.push(...MTG.VN.snapshotBlockers(game));
    if(MTG.AFC?.snapshotBlockers)blockers.push(...MTG.AFC.snapshotBlockers(game));
    if(MTG.ZK?.snapshotBlockers)blockers.push(...MTG.ZK.snapshotBlockers(game));
    if(MTG.C1920?.snapshotBlockers)blockers.push(...MTG.C1920.snapshotBlockers(game));
    if (MTG.C1516?.snapshotBlockers) blockers.push(...MTG.C1516.snapshotBlockers(game));
    if (MTG.POM?.snapshotBlockers) blockers.push(...MTG.POM.snapshotBlockers(game));
    if (MTG.WLM?.snapshotBlockers) blockers.push(...MTG.WLM.snapshotBlockers(game));
    return blockers;
  };

  MTG.canSnapshotGameState = function (game) {
    return MTG.gameStateSnapshotBlockers(game).length === 0;
  };

  MTG.captureGameState = function (game) {
    try { return captureGameStateUnsafe(game); }
    catch (error) {
      // Never let a save attempt end a live game; skip this checkpoint instead.
      if (game && typeof game.lg === 'function') game.lg(`⚠️ This position could not be saved (${error.message}); the previous save is kept.`, 'warn');
      return null;
    }
  };

  // This turn's damage record uses exact iid:zoneVersion pairs. A plain JSON
  // representation preserves the established shared damage-history module's
  // Map/Set semantics across checkpoints, including departed sources.
  function captureDamageHistory(game) {
    const history = game.oracleDamageHistory;
    if (history?.turn !== game.turnNo) return null;
    return { turn: history.turn, bySource: [...history.bySource].map(([source, targets]) => [source, [...targets]]) };
  }
  function validDamageHistory(history, turn) {
    if (history === undefined || history === null) return true;
    const identity = value => typeof value === 'string' && /^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(value) && value.split(':').every(part => Number.isSafeInteger(Number(part)));
    return history.turn === turn && Number.isSafeInteger(turn) && Array.isArray(history.bySource) &&
      history.bySource.every(row => Array.isArray(row) && row.length === 2 && identity(row[0]) && Array.isArray(row[1]) && row[1].every(identity) && new Set(row[1]).size === row[1].length) &&
      new Set(history.bySource.map(row => row[0])).size === history.bySource.length;
  }

  function captureGameStateUnsafe(game) {
    const blockers = MTG.gameStateSnapshotBlockers(game);
    if (blockers.length) return null;
    const cards = [];
    for (const card of game.battlefield) cards.push(captureCard(card));
    for (const player of game.players) {
      for (const zone of ['library', 'hand', 'graveyard', 'exile', 'command']) {
        for (const card of player[zone]) cards.push(captureCard(card));
      }
    }
    return {
      format: FORMAT,
      turnNo: game.turnNo,
      bomDayNight:game.bomDayNight||null,bomPreviousActive:game.bomPreviousActive??null,bomMonarchAtTurnStart:game.bomMonarchAtTurnStart??null,
      c1719TurnDirection:game.c1719TurnDirection||1,
      damageHistory: captureDamageHistory(game),
      phase: game.phase,
      step: game.step,
      turnPlayer: game.turnPlayer ? game.turnPlayer.idx : 0,
      monarch: game.monarch ? game.monarch.idx : null,
      initiative: game.initiative ? game.initiative.idx : null,
      maxTurns: game.maxTurns,
      difficulty: game.difficulty || 'normal',
      houseRules: JSON.parse(JSON.stringify(game.houseRules || {})),
      nextCardIid: game._nextCardIid,
      players: game.players.map(capturePlayer),
      // Agreements are plain data that points at seats and card ids, both of
      // which the restore preserves. Without this a resumed game would forget
      // the targeting, combat and public-vote commitments still in effect.
      diplomacy: game.diplomacy ? JSON.parse(JSON.stringify(game.diplomacy)) : null,
      goads: game.untilEffects.filter(isPlainGoad).map(captureGoad),
      basePTEffects: currentBasePTEffects(game).map(captureBasePT),
      landTypeEffects: currentLandTypeEffects(game).map(captureLandTypes),
      enchantmentReturns: currentEnchantmentReturns(game).map(captureEnchantmentReturn),
      attackRestrictions: currentAttackRestrictions(game).map(captureAttackRestriction),
      grantedKeywords: currentGrantedKeywords(game).map(captureGrantedKeywords),
      objectZoneReplacements: currentObjectZoneReplacements(game).map(effect=>({...effect})),
      cards,
    };
  }

  function definitionFor(entry) {
    if (entry.preparedSpell) {
      const definitions = MTG.E.preparedSpellDefinitions || {};
      const key=entry.meta?.oraclePreparedDefinitionV10||entry.name;
      const def = Object.hasOwn(definitions, key) ? definitions[key] : null;
      assert(def && entry.zone === 'exile' && Number.isSafeInteger(entry.meta?.preparedBy), 'invalid prepared spell.');
      return Object.assign({super: [], subtypes: [], kws: []}, def);
    }
    if (entry.isToken) {
      if (entry.token && MTG.TOKENS && MTG.TOKENS[entry.token]) return MTG.TOKENS[entry.token];
      if (entry.copyOf && MTG.DEFS[entry.copyOf]) return copiedDefinition(entry);
      if (entry.face) return Object.assign({ cost: '', kws: [] }, entry.face);
    }
    const def = MTG.DEFS[entry.name];
    assert(def, `card ${entry.name || '?'} is not in this build.`);
    return def;
  }

  // The game handed in must already have its players, decks and controllers;
  // this replaces the board, not the table.
  MTG.restoreGameState = function (game, snapshot) {
    assert(snapshot && snapshot.format === FORMAT, 'this save was written by a different build.');
    assert(Array.isArray(snapshot.players) && snapshot.players.length === game.players.length,
      'the saved table has a different number of seats.');
    assert(snapshot.players.every(player=>player.counters===undefined||player.counters&&Number.isSafeInteger(player.counters.energy??0)&&(player.counters.energy??0)>=0), 'invalid player energy counters.');
    assert(snapshot.players.every(p=>p.afcDungeon==null||Number.isSafeInteger(p.afcDungeon.id)&&p.afcDungeon.id>0&&!!MTG.AFC?.dungeons[p.afcDungeon.key]?.rooms[p.afcDungeon.room]), 'invalid dungeon progress.');
    assert(snapshot.players.every(p => {
      const d = p.afcDungeon;
      if (!d || d.path === undefined) return true; // Older saves only recorded the current room.
      const rooms = MTG.AFC.dungeons[d.key].rooms;
      return Array.isArray(d.path) && d.path.length > 0 && d.path.length <= Object.keys(rooms).length &&
        d.path.at(-1) === d.room && d.path.every((key, i) => !!rooms[key] && (!i || rooms[d.path[i - 1]].next.includes(key)));
    }), 'invalid dungeon path.');
    assert(snapshot.players.every(player=>Number.isSafeInteger(player.counters?.experience??0)&&(player.counters?.experience??0)>=0), 'invalid player experience counters.');
    assert(snapshot.players.every(player=>Number.isSafeInteger(player.counters?.rad??0)&&(player.counters?.rad??0)>=0), 'invalid player rad counters.');
    assert(snapshot.players.every(player=>Number.isSafeInteger(player.bdfApproaches??0)&&(player.bdfApproaches??0)>=0), 'invalid Approach casting history.');
    assert(validDamageHistory(snapshot.damageHistory, snapshot.turnNo), 'invalid damage history.');
    const landTypeEffects=snapshot.landTypeEffects??[];
    const enchantmentReturns=snapshot.enchantmentReturns??[];
    assert(Array.isArray(enchantmentReturns)&&enchantmentReturns.length<=MAX_BASE_PT_EFFECTS&&enchantmentReturns.every(isPlainEnchantmentReturn),'invalid enchantment return effects.');
    assert(Array.isArray(landTypeEffects)&&landTypeEffects.length<=MAX_BASE_PT_EFFECTS&&landTypeEffects.every(isPlainLandTypes),'invalid land type effects.');
    const basePTEffects = snapshot.basePTEffects === undefined ? [] : snapshot.basePTEffects;
    assert(Array.isArray(basePTEffects) && basePTEffects.length <= MAX_BASE_PT_EFFECTS && basePTEffects.every(isPlainBasePT),
      'invalid base power/toughness effects.');
    const attackRestrictions = snapshot.attackRestrictions ?? [];
    const seat = index => Number.isSafeInteger(index) && index >= 0 && index < game.players.length;
    assert(Array.isArray(attackRestrictions) && attackRestrictions.length <= MAX_BASE_PT_EFFECTS &&
      attackRestrictions.every(effect => validAttackRestriction(effect, seat)), 'invalid attack restrictions.');
    const grantedKeywords = snapshot.grantedKeywords ?? [];
    assert(Array.isArray(grantedKeywords) && grantedKeywords.length <= MAX_BASE_PT_EFFECTS &&
      grantedKeywords.every(isPlainGrantedKeywords), 'invalid granted keywords.');
    const objectZoneReplacements=snapshot.objectZoneReplacements??[];
    assert(Array.isArray(objectZoneReplacements)&&objectZoneReplacements.length<=MAX_BASE_PT_EFFECTS&&
      objectZoneReplacements.every(isPlainObjectZoneReplacement),'invalid object zone replacements.');
    // Leave ample exact-integer headroom for future cards/effects. A malformed
    // save must never poison the process-wide clock near MAX_SAFE_INTEGER.
    assert(Array.isArray(snapshot.cards) && snapshot.cards.every(card => card.timestamp === undefined ||
      Number.isSafeInteger(card.timestamp) && card.timestamp >= 0 && card.timestamp <= MTG.MAX_RESTORED_TIMESTAMP),
      'invalid card timestamps.');

    assert(snapshot.c1719TurnDirection===undefined||[1,-1].includes(snapshot.c1719TurnDirection),'invalid turn direction.');
    for(const p of snapshot.players)for(const key of ['c1719PreviousTurnAttacks','c1719CurrentTurnAttacks'])assert(p[key]===undefined||Array.isArray(p[key])&&p[key].every(i=>Number.isInteger(i)&&i>=0&&i<snapshot.players.length),'invalid attack history.');
    game.c1719TurnDirection=snapshot.c1719TurnDirection||1;
    game.c1719Permissions=[];game.c1719GraveGrants=[];
    game.battlefield.length = 0;
    for (const player of game.players) {
      for (const zone of ['library', 'hand', 'graveyard', 'exile', 'command']) player[zone].length = 0;
      player.commanders = [];
      player.emblems = [];
    }
    game.stack.length = 0;
    game.pendingTriggers.length = 0;
    game.untilEffects.length = 0;
    game.delayed.length = 0;
    game.diedThisTurn.length = 0;
    game.oracleDamageHistory = snapshot.damageHistory ? {
      turn: snapshot.damageHistory.turn,
      bySource: new Map(snapshot.damageHistory.bySource.map(([source, targets]) => [source, new Set(targets)])),
    } : undefined;
    if (snapshot.diplomacy) game.diplomacy = JSON.parse(JSON.stringify(snapshot.diplomacy));
    for (const goad of snapshot.goads || []) {
      game.untilEffects.push({
        kind: 'goadCard', iid: goad.iid, expires: goad.expires,
        notPlayer: goad.notPlayer === null ? undefined : game.players[goad.notPlayer],
        whoTurn: goad.whoTurn === null ? undefined : game.players[goad.whoTurn],
      });
    }

    const byIid = new Map();
    for (const entry of snapshot.cards) {
      const owner = game.players[entry.owner];
      assert(owner, 'a saved card has no owner seat.');
      const card = new MTG.CardInst(definitionFor(entry), owner);
      card.iid = entry.iid;
      card.ctrl = entry.ctrl === undefined ? owner : (game.players[entry.ctrl] || owner);
      card.zone = entry.zone;
      card.tapped = !!entry.tapped;
      card.sick = !!entry.sick;
      card.damage = Number(entry.damage) || 0;
      card.deathtouched = !!entry.deathtouched;
      card.regenShield = Number(entry.regenShield) || 0;
      card.counters = Object.assign({}, entry.counters);
      card.attachedTo = entry.attachedTo ?? null;
      card.attachments = (entry.attachments || []).slice();
      card.isToken = !!entry.isToken;
      card.isCopySpell = !!entry.preparedSpell;
      card.faceDown = !!entry.faceDown;
      card.commander = !!entry.commander;
      card.cmdCasts = Number(entry.cmdCasts) || 0;
      card.timestamp = Number(entry.timestamp) || 0;
      card.zoneVersion = Number(entry.zoneVersion) || 0;
      card.phasedOut = !!entry.phasedOut;
      if (entry.phasedCharacteristics && card.phasedOut) {
        const face = entry.phasedCharacteristics;
        assert(['types', 'subtypes', 'super', 'colors', 'keywords'].every(key => Array.isArray(face[key]) && face[key].length <= 256 &&
          face[key].every(value => typeof value === 'string' && value.length <= 128)) &&
          ['power', 'toughness', 'basePower', 'baseToughness'].every(key => Number.isFinite(face[key])), 'invalid phased characteristics.');
        card.cur = {...face, kw: new Set(face.keywords)};
      }
      if (entry.oracleFace) {
        card.oracleFace = entry.oracleFace;
        // The saved face is the object's current characteristics: a modal
        // land played as its back face or a transformed Incubator token.
        if (card.oracleFaces && card.def.oracleFace !== entry.oracleFace) MTG.OracleV8Faces?.setFace(card, entry.oracleFace);
      }
      if(entry.oraclePrototypeV10){assert(card.def.oraclePrototypeV10&&['battlefield','stack'].includes(card.zone),'invalid prototype state');card.def=MTG.oraclePrototypeDefinitionV10(card.def);card.oraclePrototypeV10=true;}
      card.oracleTransformCount = Number(entry.oracleTransformCount) || 0;
      card.meta = Object.assign({}, entry.meta);
      if (card.faceDown && card.zone === 'battlefield' && !card.isToken) {
        card.meta.faceDownDef = MTG.DEFS[entry.name];
        card.def = game.faceDownCreatureDef(card.meta.faceDownKind || 'manifest');
      }
      if (entry.isToken && entry.copyOf && MTG.DEFS[entry.copyOf]) card.isCopyOf = card.def;
      if(entry.oracleEntryFormV26){
        assert(MTG.OracleV26Common,'entry forms are not supported by this build.');
        MTG.OracleV26Common.restoreForm(game,card,entry.oracleEntryFormV26);
        if(card.isToken&&card.isCopyOf)card.isCopyOf=card.def;
      }
      byIid.set(card.iid, card);
      if (entry.zone === 'battlefield') game.battlefield.push(card);
      else {
        assert(Array.isArray(owner[entry.zone]), `unknown zone ${entry.zone}.`);
        owner[entry.zone].push(card);
      }
    }

    for (const entry of snapshot.cards.filter(entry => entry.preparedSpell)) {
      const card = byIid.get(entry.iid), source = byIid.get(card.meta.preparedBy);
      assert(source?.zone === 'battlefield' && source.meta.prepared && source.meta.preparedCopy === card.iid,
        'a prepared spell has no prepared source.');
      card.meta.playableBy = source.ctrl;
      const version=source.zoneVersion;
      card.meta.playableCondition = (g,p) => source.zone === 'battlefield' && source.zoneVersion===version && !source.phasedOut && source.ctrl===p && source.meta.prepared && source.meta.preparedCopy === card.iid;
    }

    for(const effect of landTypeEffects){const card=byIid.get(effect.iid);if(card?.zone==='battlefield'&&card.zoneVersion===effect.zoneVersion)game.untilEffects.push(captureLandTypes(effect));}
    for(const effect of enchantmentReturns){const card=byIid.get(effect.iid);if(card?.zone==='battlefield'&&card.zoneVersion===effect.zoneVersion)game.untilEffects.push(captureEnchantmentReturn(effect));}

    for (const effect of basePTEffects) {
      const card = byIid.get(effect.iid);
      if (card && card.zone === 'battlefield' && card.zoneVersion === effect.zoneVersion) game.untilEffects.push(captureBasePT(effect));
    }
    for (const effect of attackRestrictions) {
      const restored = {};
      for (const [key, value] of Object.entries(effect)) restored[key] = ['who', 'notPlayer', 'whoTurn'].includes(key) ? game.players[value] : value;
      game.untilEffects.push(restored);
    }
    for (const effect of grantedKeywords) {
      const card = byIid.get(effect.iid);
      if (card?.zone === 'battlefield' && card.zoneVersion === effect.zoneVersion) game.untilEffects.push(captureGrantedKeywords(effect));
    }
    for(const effect of objectZoneReplacements){const card=byIid.get(effect.iid);if(card?.zone==='battlefield'&&card.zoneVersion===effect.zoneVersion)game.untilEffects.push({...effect});}

    for (const [index, saved] of snapshot.players.entries()) {
      const player = game.players[index];
      player.life = saved.life;
      player.startingLife = saved.startingLife;
      player.poison = saved.poison;
      player.counters = {energy: saved.counters?.energy || 0, ...(saved.counters?.experience ? {experience: saved.counters.experience} : {}), ...(saved.counters?.rad ? {rad: saved.counters.rad} : {})};
      player.lost = saved.lost;
      player.landsPlayed = saved.landsPlayed;
      player.maxLands = saved.maxLands;
      player.commanderDamage = Object.assign({}, saved.commanderDamage);
      player.commanders = (saved.commanders || []).map(iid => byIid.get(iid)).filter(Boolean);
      player.chosenCommanders = saved.chosenCommanders ? saved.chosenCommanders.slice() : null;
      player.colorIdentity = (saved.colorIdentity || []).slice();
      if(saved.wlmClaraColor)player.wlmClaraColor=saved.wlmClaraColor;
      player.cityBlessing = saved.cityBlessing;
      player.enduringStory = !!saved.enduringStory;
      player.maximumHandSizeReductionV64 = Number.isSafeInteger(saved.maximumHandSizeReductionV64)&&saved.maximumHandSizeReductionV64>=0?saved.maximumHandSizeReductionV64:0;
      // Earlier snapshots did not retain whole-game casting history. Keep
      // that unknown state distinct from a verified zero first-spell count.
      player.spellsCastThisGameV64 = Number.isSafeInteger(saved.spellsCastThisGameV64)&&saved.spellsCastThisGameV64>=0?saved.spellsCastThisGameV64:null;
      player.lcGollumDamaged=!!saved.lcGollumDamaged;
      player.afcDungeon=saved.afcDungeon||null; player.afcDungeonSerial=saved.afcDungeonSerial||0; player.afcCompletedDungeons=saved.afcCompletedDungeons||0;
      player.skipUntapOnce = saved.skipUntapOnce;
      player.turnsStarted = saved.turnsStarted;
      player.lastTurnSpellsCast = saved.lastTurnSpellsCast;
      player.noMaxHandForever = saved.noMaxHandForever;
      player.bdfApproaches = Number(saved.bdfApproaches)||0;
      player.pool = Object.assign({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, saved.pool);
      player.coloredOnlyPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      player.poolMeta = [];
      player.turnState = Object.assign(player.freshTurnState(), saved.turnState || {});
      player.c1719PreviousTurnAttacks=(saved.c1719PreviousTurnAttacks||[]).slice();
      player.c1719CurrentTurnAttacks=(saved.c1719CurrentTurnAttacks||[]).slice();
    }

    game.turnNo = snapshot.turnNo;
    game.phase = snapshot.phase;
    game.step = snapshot.step;
    game.turnPlayer = game.players[snapshot.turnPlayer] || game.players[0];
    game.bomDayNight=snapshot.bomDayNight||null;game.bomPreviousActive=snapshot.bomPreviousActive??null;game.bomMonarchAtTurnStart=snapshot.bomMonarchAtTurnStart??null;
    game.monarch = snapshot.monarch === null ? null : game.players[snapshot.monarch] || null;
    if (snapshot.initiative !== undefined) {
      game.initiative = snapshot.initiative === null ? null : game.players[snapshot.initiative] || null;
    }
    game.maxTurns = snapshot.maxTurns;
    game.houseRules = Object.assign({}, snapshot.houseRules);
    // New cards must never reuse an identity that is already on the table.
    const highest = snapshot.cards.reduce((max, entry) => Math.max(max, Number(entry.iid) || 0), 0);
    game._nextCardIid = Math.max(Number(snapshot.nextCardIid) || 0, highest + 1);
    // Later layer-setting effects must sort after the saved permanents and
    // effects even when this process started with a fresh timestamp clock.
    const highestTimestamp = game.battlefield.concat(game.untilEffects).reduce((max, entry) =>
      Math.max(max, ...[entry.timestamp, entry.oracleLayerTimestamp].filter(Number.isSafeInteger)), 0);
    MTG.reserveTimestamp(highestTimestamp);
    // The random stream cannot be captured (it lives in a closure), so a
    // resumed game gets a fresh but deterministic one: the same save always
    // continues the same way.
    const seed = Number(game.opts && game.opts.seed) || 1;
    game.rnd = MTG.mulberry32((seed ^ (snapshot.turnNo + 1) * 2654435761) >>> 0);
    game.recalc();
    game.diplomacyRefresh?.();
    return game;
  };

  // Continue a restored game without dealing new opening hands.
  MTG.resumeGame = async function (game) {
    assert(game && typeof game.runGame === 'function', 'this game cannot be resumed.');
    game.lg(`▶ Resumed from a saved position — turn ${game.turnNo + 1}, ${game.turnPlayer ? game.turnPlayer.name : ''}.`, 'turn');
    return game.runGame();
  };

  // A compact fingerprint used by tests and by the resume path to prove the
  // restored table is the same table.
  MTG.gameStateFingerprint = function (game) {
    return JSON.stringify({
      turn: game.turnNo, phase: game.phase, step: game.step,
      active: game.turnPlayer ? game.turnPlayer.idx : null,
      monarch: game.monarch ? game.monarch.idx : null,
      players: game.players.map(player => ({
        idx: player.idx, life: player.life, poison: player.poison || 0, energy: player.counters?.energy || 0, experience: player.counters?.experience || 0, rad: player.counters?.rad || 0, lost: !!player.lost, enduringStory: !!player.enduringStory, maximumHandSizeReductionV64: player.maximumHandSizeReductionV64||0, spellsCastThisGameV64: player.spellsCastThisGameV64??null,
        commanderDamage: Object.entries(player.commanderDamage || {}).sort(),
        zones: ['library', 'hand', 'graveyard', 'exile', 'command'].map(zone =>
          player[zone].map(card => `${card.name}#${card.iid}`).sort().join(',')),
      })),
      battlefield: game.battlefield.map(card => [card.name, card.iid, card.ctrl && card.ctrl.idx,
        card.tapped, card.damage, card.power, card.toughness, card.faceDown, card.phasedOut,
        // A counter kind sitting at zero is not a counter (CR 122.1c), so it is
        // not part of the state a save has to reproduce.
        Object.entries(card.counters || {}).filter(([, value]) => value).sort(),
        card.attachedTo ?? null].join('|')).sort(),
      goads: game.untilEffects.filter(isPlainGoad).map(effect =>
        [effect.iid, effect.expires, effect.notPlayer ? effect.notPlayer.idx : '', effect.whoTurn ? effect.whoTurn.idx : ''].join('|')).sort(),
      basePTEffects: currentBasePTEffects(game).map(captureBasePT),
      landTypeEffects: currentLandTypeEffects(game).map(captureLandTypes),
      agreements: (game.diplomacy && game.diplomacy.contracts || []).map(contract =>
        [contract.id, contract.status, contract.clauses.map(clause => `${clause.type}:${clause.state}`).join(',')].join('|')).sort(),
      enchantmentReturns: currentEnchantmentReturns(game).map(captureEnchantmentReturn),
      attackRestrictions: currentAttackRestrictions(game).map(captureAttackRestriction).map(effect => JSON.stringify(effect)).sort(),
      grantedKeywords: currentGrantedKeywords(game).map(captureGrantedKeywords),
      objectZoneReplacements: currentObjectZoneReplacements(game).map(effect=>({...effect})),
    });
  };
})();
