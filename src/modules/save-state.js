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
// when none of those exist — in practice the start of a turn, which is a
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

  // Every card is written as "what it is" plus "how it sits on the table".
  function captureCard(card) {
    const identity = { name: card.def && card.def.name };
    if (card.isToken) {
      identity.token = tokenKeyOf(card.def);
      // A token copy of a real card keeps that card's name; anything else that
      // is not a catalog token is not portable.
      identity.copyOf = card.isCopyOf && card.isCopyOf.name || null;
      if (!identity.token && !identity.copyOf && !MTG.DEFS[identity.name]) identity.face = tokenFace(card.def);
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
    if (card.oracleFace) entry.oracleFace = card.oracleFace;
    if (card.oracleTransformCount) entry.oracleTransformCount = Number(card.oracleTransformCount) || 0;
    const meta = plainMeta(card.meta);
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
      lost: !!player.lost,
      landsPlayed: Number(player.landsPlayed) || 0,
      maxLands: Number(player.maxLands) || 1,
      commanderDamage: Object.assign({}, player.commanderDamage || {}),
      commanders: (player.commanders || []).map(card => card.iid),
      chosenCommanders: player.chosenCommanders ? player.chosenCommanders.slice() : null,
      colorIdentity: (player.colorIdentity || []).slice(),
      cityBlessing: !!player.cityBlessing,
      skipUntapOnce: !!player.skipUntapOnce,
      turnsStarted: Number(player.turnsStarted) || 0,
      lastTurnSpellsCast: Number(player.lastTurnSpellsCast) || 0,
      noMaxHandForever: !!player.noMaxHandForever,
      // A snapshot is taken between turns, so the pool is empty and the turn
      // state is about to be replaced; both are restored for exactness anyway.
      pool: Object.assign({}, player.pool || {}),
      // Turn state is script-visible scratch too: it can hold card and player
      // references. Only the portable part is kept.
      turnState: plainMeta(player.turnState),
    };
  }

  // What in this game state cannot be written down?
  MTG.gameStateSnapshotBlockers = function (game) {
    const blockers = [];
    if (!game || !Array.isArray(game.players) || !game.players.length) return ['no game'];
    if (game.stack.length) blockers.push(`${game.stack.length} object(s) on the stack`);
    if (game.pendingTriggers.length) blockers.push(`${game.pendingTriggers.length} waiting trigger(s)`);
    if (game.untilEffects.length) blockers.push(`${game.untilEffects.length} lasting effect(s)`);
    if (game.delayed.length) blockers.push(`${game.delayed.length} delayed trigger(s)`);
    const emblems = game.players.reduce((sum, player) => sum + (player.emblems || []).length, 0);
    if (emblems) blockers.push(`${emblems} emblem(s)`);
    if ((game._additionalPhases || []).length) blockers.push('a scheduled additional phase');
    if ((game.extraTurns || []).length) blockers.push('a scheduled extra turn');
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
      cards,
    };
  }

  function definitionFor(entry) {
    if (entry.isToken) {
      if (entry.token && MTG.TOKENS && MTG.TOKENS[entry.token]) return MTG.TOKENS[entry.token];
      if (entry.copyOf && MTG.DEFS[entry.copyOf]) return MTG.DEFS[entry.copyOf];
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
      card.faceDown = !!entry.faceDown;
      card.commander = !!entry.commander;
      card.cmdCasts = Number(entry.cmdCasts) || 0;
      card.timestamp = Number(entry.timestamp) || 0;
      card.zoneVersion = Number(entry.zoneVersion) || 0;
      card.phasedOut = !!entry.phasedOut;
      if (entry.oracleFace) card.oracleFace = entry.oracleFace;
      card.oracleTransformCount = Number(entry.oracleTransformCount) || 0;
      card.meta = Object.assign({}, entry.meta);
      if (entry.isToken && entry.copyOf && MTG.DEFS[entry.copyOf]) card.isCopyOf = MTG.DEFS[entry.copyOf];
      byIid.set(card.iid, card);
      if (entry.zone === 'battlefield') game.battlefield.push(card);
      else {
        assert(Array.isArray(owner[entry.zone]), `unknown zone ${entry.zone}.`);
        owner[entry.zone].push(card);
      }
    }

    for (const [index, saved] of snapshot.players.entries()) {
      const player = game.players[index];
      player.life = saved.life;
      player.startingLife = saved.startingLife;
      player.poison = saved.poison;
      player.lost = saved.lost;
      player.landsPlayed = saved.landsPlayed;
      player.maxLands = saved.maxLands;
      player.commanderDamage = Object.assign({}, saved.commanderDamage);
      player.commanders = (saved.commanders || []).map(iid => byIid.get(iid)).filter(Boolean);
      player.chosenCommanders = saved.chosenCommanders ? saved.chosenCommanders.slice() : null;
      player.colorIdentity = (saved.colorIdentity || []).slice();
      player.cityBlessing = saved.cityBlessing;
      player.skipUntapOnce = saved.skipUntapOnce;
      player.turnsStarted = saved.turnsStarted;
      player.lastTurnSpellsCast = saved.lastTurnSpellsCast;
      player.noMaxHandForever = saved.noMaxHandForever;
      player.pool = Object.assign({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, saved.pool);
      player.coloredOnlyPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
      player.poolMeta = [];
      player.turnState = Object.assign(player.freshTurnState(), saved.turnState || {});
    }

    game.turnNo = snapshot.turnNo;
    game.phase = snapshot.phase;
    game.step = snapshot.step;
    game.turnPlayer = game.players[snapshot.turnPlayer] || game.players[0];
    game.monarch = snapshot.monarch === null ? null : game.players[snapshot.monarch] || null;
    if (snapshot.initiative !== undefined) {
      game.initiative = snapshot.initiative === null ? null : game.players[snapshot.initiative] || null;
    }
    game.maxTurns = snapshot.maxTurns;
    game.houseRules = Object.assign({}, snapshot.houseRules);
    // New cards must never reuse an identity that is already on the table.
    const highest = snapshot.cards.reduce((max, entry) => Math.max(max, Number(entry.iid) || 0), 0);
    game._nextCardIid = Math.max(Number(snapshot.nextCardIid) || 0, highest + 1);
    // The random stream cannot be captured (it lives in a closure), so a
    // resumed game gets a fresh but deterministic one: the same save always
    // continues the same way.
    const seed = Number(game.opts && game.opts.seed) || 1;
    game.rnd = MTG.mulberry32((seed ^ (snapshot.turnNo + 1) * 2654435761) >>> 0);
    game.recalc();
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
        idx: player.idx, life: player.life, poison: player.poison || 0, lost: !!player.lost,
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
    });
  };
})();
