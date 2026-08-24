'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
// Higgsfield Games multiplayer contract for the existing Commander engine.
// Room state is deliberately JSON-only so the six pure room functions can be
// copied into the generated Higgsfield `app/src/logic.js` without carrying DOM
// state, controllers, or hidden cards across the network boundary.
(function () {
  const PROTOCOL_VERSION = 1;
  const HUMAN_SEATS = 2;
  const BOT_SEATS = 2;
  const MAX_SYNC_BYTES = 2_000_000;
  const HUMAN_NAMES = ['Host', 'Player 2'];
  const BOT_NAMES = ['AI Dragon', 'AI Wolf'];

  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const cleanText = (value, max = 80) => String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const byteSize = value => {
    try { return JSON.stringify(value).length; } catch { return Infinity; }
  };

  function meta() {
    return {
      id: 'commander-live',
      name: 'Commander Live',
      minPlayers: HUMAN_SEATS,
      maxPlayers: HUMAN_SEATS,
      totalSeats: HUMAN_SEATS + BOT_SEATS,
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  function seatRecord(seat, kind) {
    const human = kind === 'human';
    return {
      seat,
      kind,
      role: human ? (seat === 0 ? 'host' : 'guest') : 'bot',
      playerId: null,
      name: human ? HUMAN_NAMES[seat] : BOT_NAMES[seat - HUMAN_SEATS],
      connected: !human,
      ready: !human,
      deckId: null,
      commanderNames: [],
      aiStyle: human ? null : 'balanced',
    };
  }

  function setup(playerIds = [], options = {}) {
    const ids = Array.isArray(playerIds) ? playerIds.filter(Boolean).slice(0, HUMAN_SEATS) : [];
    const seats = [seatRecord(0, 'human'), seatRecord(1, 'human'), seatRecord(2, 'bot'), seatRecord(3, 'bot')];
    ids.forEach((playerId, index) => {
      seats[index].playerId = String(playerId);
      seats[index].connected = true;
      seats[index].name = cleanText((options.playerNames || [])[index] || HUMAN_NAMES[index], 32);
    });
    (options.botDecks || []).slice(0, BOT_SEATS).forEach((deckId, index) => {
      seats[index + HUMAN_SEATS].deckId = cleanText(deckId, 120);
    });
    (options.botStyles || []).slice(0, BOT_SEATS).forEach((style, index) => {
      seats[index + HUMAN_SEATS].aiStyle = cleanText(style, 32) || 'balanced';
    });
    return {
      protocolVersion: PROTOCOL_VERSION,
      phase: 'lobby',
      revision: 0,
      seats,
      settings: {
        difficulty: ['easy', 'normal', 'hard'].includes(options.difficulty) ? options.difficulty : 'normal',
        seed: null,
        diplomacyEnabled: false,
        sumPartnerDamage: !!options.sumPartnerDamage,
      },
      views: { 0: null, 1: null },
      pendingDecision: null,
      lastDecision: null,
      pause: null,
      winnerSeat: null,
      lastEvent: { type: 'created', revision: 0 },
    };
  }

  function seatFor(state, playerId) {
    return state && Array.isArray(state.seats)
      ? state.seats.find(seat => seat.playerId === String(playerId)) || null
      : null;
  }

  function uniqueDecksReady(state) {
    const ids = state.seats.map(seat => seat.deckId).filter(Boolean);
    return ids.length === 4 && new Set(ids).size === 4;
  }

  function validateLegalResponse(legal, response) {
    if (!legal || !legal.kind) return { ok: false, error: 'Missing legal response contract.' };
    const allowed = new Set((legal.tokens || []).map(String));
    const min = Number.isInteger(legal.min) ? legal.min : 0;
    const max = Number.isInteger(legal.max) ? legal.max : Math.max(min, allowed.size);
    if (legal.kind === 'ack') return response === null || response === true || response === 'ok'
      ? { ok: true } : { ok: false, error: 'Expected acknowledgement.' };
    if (legal.kind === 'boolean') return typeof response === 'boolean'
      ? { ok: true } : { ok: false, error: 'Expected true or false.' };
    if (legal.kind === 'number') {
      if (!Number.isFinite(response)) return { ok: false, error: 'Expected a number.' };
      if (Array.isArray(legal.values) && !legal.values.includes(response)) return { ok: false, error: 'Number is not legal.' };
      if (Number.isFinite(legal.min) && response < legal.min) return { ok: false, error: 'Number is below minimum.' };
      if (Number.isFinite(legal.max) && response > legal.max) return { ok: false, error: 'Number is above maximum.' };
      return { ok: true };
    }
    if (legal.kind === 'token') return allowed.has(String(response))
      ? { ok: true } : { ok: false, error: 'Choice is not legal.' };
    if (legal.kind === 'tokens') {
      if (!Array.isArray(response) || response.length < min || response.length > max)
        return { ok: false, error: `Choose between ${min} and ${max}.` };
      if (response.some(token => !allowed.has(String(token)))) return { ok: false, error: 'One or more choices are not legal.' };
      if (!legal.repeats && new Set(response.map(String)).size !== response.length)
        return { ok: false, error: 'Duplicate choices are not legal.' };
      return { ok: true };
    }
    if (legal.kind === 'assignments') {
      if (!Array.isArray(response) || response.length < min || response.length > max)
        return { ok: false, error: `Submit between ${min} and ${max} assignments.` };
      const left = new Set((legal.left || []).map(String));
      const right = new Set((legal.right || []).map(String));
      const pairs = Array.isArray(legal.pairs) ? new Set(legal.pairs.map(String)) : null;
      const usedLeft = new Set();
      for (const item of response) {
        if (!isObject(item) || !left.has(String(item.left)) || !right.has(String(item.right)))
          return { ok: false, error: 'Assignment contains an illegal reference.' };
        if (pairs && !pairs.has(`${item.left}|${item.right}`))
          return { ok: false, error: 'That card cannot be assigned to that target.' };
        if (usedLeft.has(String(item.left))) return { ok: false, error: 'A card can only be assigned once.' };
        usedLeft.add(String(item.left));
      }
      for (const token of legal.required || []) if (!usedLeft.has(String(token)))
        return { ok: false, error: 'A required assignment is missing.' };
      return { ok: true };
    }
    if (legal.kind === 'scry') {
      if (!isObject(response) || !Array.isArray(response.top) || !Array.isArray(response.bottom))
        return { ok: false, error: 'Expected top and bottom card lists.' };
      const all = response.top.concat(response.bottom).map(String);
      if (all.length !== allowed.size || new Set(all).size !== all.length || all.some(token => !allowed.has(token)))
        return { ok: false, error: 'Every scry card must appear exactly once.' };
      return { ok: true };
    }
    if (legal.kind === 'mana') {
      if (isObject(response) && response.auto === true) return { ok: true };
      const cards = isObject(response) ? response.cards : null;
      if (!Array.isArray(cards) || cards.some(token => !allowed.has(String(token))) || new Set(cards.map(String)).size !== cards.length)
        return { ok: false, error: 'Mana selection is not legal.' };
      return { ok: true };
    }
    return { ok: false, error: 'Unknown legal response kind.' };
  }

  function validateAction(state, action, playerId) {
    if (!state || state.protocolVersion !== PROTOCOL_VERSION) return { ok: false, error: 'Unsupported room state.' };
    if (!isObject(action) || !cleanText(action.type, 40)) return { ok: false, error: 'Invalid action.' };
    const type = action.type;
    const seat = seatFor(state, playerId);
    const host = state.seats[0];

    if (type === 'join') {
      if (state.phase !== 'lobby') return { ok: false, error: 'The game already started.' };
      if (seat) return { ok: true };
      if (!state.seats.slice(0, HUMAN_SEATS).some(item => !item.playerId))
        return { ok: false, error: 'The two human seats are full.' };
      return { ok: true };
    }
    if (type === 'reconnect') {
      if (!seat || seat.kind !== 'human') return { ok: false, error: 'Seat not found.' };
      return { ok: true };
    }
    if (!seat) return { ok: false, error: 'Join the room first.' };
    if (type === 'configure') {
      if (state.phase !== 'lobby' || seat.kind !== 'human') return { ok: false, error: 'Seat cannot be configured now.' };
      if (!cleanText(action.deckId, 120)) return { ok: false, error: 'Choose a deck.' };
      if (action.commanderNames !== undefined && (!Array.isArray(action.commanderNames) || action.commanderNames.length > 2))
        return { ok: false, error: 'Choose one commander or a legal partner pair.' };
      return { ok: true };
    }
    if (type === 'configureBot') {
      if (state.phase !== 'lobby' || seat.seat !== 0) return { ok: false, error: 'Only the host configures bots.' };
      if (![2, 3].includes(action.seat) || !cleanText(action.deckId, 120)) return { ok: false, error: 'Invalid bot configuration.' };
      return { ok: true };
    }
    if (type === 'start') {
      if (state.phase !== 'lobby' || seat.seat !== 0) return { ok: false, error: 'Only the host starts the game.' };
      if (!state.seats.slice(0, 2).every(item => item.playerId && item.connected && item.ready))
        return { ok: false, error: 'Both human players must be connected and ready.' };
      if (!uniqueDecksReady(state)) return { ok: false, error: 'All four seats need different decks.' };
      if (!Number.isSafeInteger(action.seed) || action.seed < 0) return { ok: false, error: 'Invalid deterministic seed.' };
      return { ok: true };
    }
    if (type === 'presence') {
      if (typeof action.connected !== 'boolean') return { ok: false, error: 'Invalid presence value.' };
      return { ok: true };
    }
    if (type === 'sync') {
      if (seat.seat !== 0 || !['running', 'paused'].includes(state.phase)) return { ok: false, error: 'Only the host can synchronize the game.' };
      if (!isObject(action.views) || byteSize(action.views) > MAX_SYNC_BYTES) return { ok: false, error: 'Invalid or oversized game views.' };
      if (!('0' in action.views) || !('1' in action.views)) return { ok: false, error: 'Both human views are required.' };
      return { ok: true };
    }
    if (type === 'decisionRequest') {
      if (seat.seat !== 0 || state.phase !== 'running') return { ok: false, error: 'Only the active host can request a decision.' };
      if (state.pendingDecision || !isObject(action.decision) || cleanText(action.decision.id, 100) === '')
        return { ok: false, error: 'Invalid or overlapping decision.' };
      if (action.decision.seat !== 1 || !isObject(action.decision.legal)) return { ok: false, error: 'Decision must target Player 2.' };
      if (byteSize(action.decision) > 500_000) return { ok: false, error: 'Decision payload is too large.' };
      return { ok: true };
    }
    if (type === 'decisionResponse') {
      if (seat.seat !== 1 || !state.pendingDecision) return { ok: false, error: 'No decision is waiting for this seat.' };
      if (String(action.decisionId) !== state.pendingDecision.id) return { ok: false, error: 'Stale decision response.' };
      return validateLegalResponse(state.pendingDecision.legal, action.response);
    }
    if (type === 'decisionAck') {
      if (seat.seat !== 0 || !state.lastDecision || String(action.decisionId) !== state.lastDecision.id)
        return { ok: false, error: 'No matching decision to acknowledge.' };
      return { ok: true };
    }
    if (type === 'resume') {
      if (seat.seat !== 0 || state.phase !== 'paused' || !state.seats.slice(0, 2).every(item => item.connected))
        return { ok: false, error: 'Both players must reconnect before the host resumes.' };
      return { ok: true };
    }
    if (type === 'finish') {
      if (seat.seat !== 0 || !['running', 'paused'].includes(state.phase)) return { ok: false, error: 'Only the host can finish the game.' };
      if (action.winnerSeat !== null && ![0, 1, 2, 3].includes(action.winnerSeat)) return { ok: false, error: 'Invalid winner.' };
      return { ok: true };
    }
    return { ok: false, error: `Unsupported action: ${cleanText(type, 40)}` };
  }

  function applyAction(state, action, playerId) {
    const verdict = validateAction(state, action, playerId);
    if (!verdict.ok) throw new Error(verdict.error);
    const next = clone(state);
    const type = action.type;
    let seat = seatFor(next, playerId);
    if (type === 'join') {
      if (!seat) {
        seat = next.seats.slice(0, HUMAN_SEATS).find(item => !item.playerId);
        seat.playerId = String(playerId);
        seat.connected = true;
        seat.name = cleanText(action.name || HUMAN_NAMES[1], 32);
      }
    } else if (type === 'reconnect') {
      seat.connected = true;
    } else if (type === 'configure') {
      seat.deckId = cleanText(action.deckId, 120);
      seat.commanderNames = (action.commanderNames || []).map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2);
      seat.name = cleanText(action.name || seat.name, 32);
      seat.ready = action.ready !== false;
    } else if (type === 'configureBot') {
      const bot = next.seats[action.seat];
      bot.deckId = cleanText(action.deckId, 120);
      bot.aiStyle = cleanText(action.aiStyle || bot.aiStyle, 32) || 'balanced';
      bot.commanderNames = (action.commanderNames || []).map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2);
    } else if (type === 'start') {
      next.phase = 'running';
      next.settings.seed = action.seed;
      next.pause = null;
    } else if (type === 'presence') {
      seat.connected = action.connected;
      if (!action.connected && ['running', 'paused'].includes(next.phase)) {
        next.phase = 'paused';
        next.pause = { reason: 'player-disconnected', seat: seat.seat };
      }
    } else if (type === 'sync') {
      next.views = { 0: clone(action.views[0] ?? action.views['0']), 1: clone(action.views[1] ?? action.views['1']) };
    } else if (type === 'decisionRequest') {
      next.pendingDecision = clone(action.decision);
      next.lastDecision = null;
    } else if (type === 'decisionResponse') {
      next.lastDecision = { id: next.pendingDecision.id, response: clone(action.response), seat: 1 };
      next.pendingDecision = null;
    } else if (type === 'decisionAck') {
      next.lastDecision = null;
    } else if (type === 'resume') {
      next.phase = 'running';
      next.pause = null;
    } else if (type === 'finish') {
      next.phase = 'finished';
      next.winnerSeat = action.winnerSeat ?? null;
      next.pendingDecision = null;
      next.pause = null;
    }
    next.revision += 1;
    next.lastEvent = { type, seat: seat ? seat.seat : null, revision: next.revision };
    return next;
  }

  function isGameOver(state) {
    return !!state && state.phase === 'finished';
  }

  function viewFor(state, playerId) {
    const seat = seatFor(state, playerId);
    const seatIndex = seat ? seat.seat : null;
    return {
      protocolVersion: state.protocolVersion,
      phase: state.phase,
      revision: state.revision,
      you: seatIndex,
      seats: state.seats.map(item => ({
        seat: item.seat, kind: item.kind, role: item.role, name: item.name,
        connected: item.connected, ready: item.ready, deckId: item.deckId,
        commanderNames: item.commanderNames, aiStyle: item.aiStyle,
      })),
      settings: clone(state.settings),
      gameView: seatIndex === 0 || seatIndex === 1 ? clone(state.views[seatIndex]) : null,
      pendingDecision: seatIndex === 1 ? clone(state.pendingDecision) : null,
      lastDecision: seatIndex === 0 ? clone(state.lastDecision) : null,
      pause: clone(state.pause),
      winnerSeat: state.winnerSeat,
      lastEvent: clone(state.lastEvent),
    };
  }

  function cardToken(card) { return card && Number.isInteger(card.iid) ? `c:${card.iid}` : null; }
  function playerToken(player) { return player && Number.isInteger(player.idx) ? `p:${player.idx}` : null; }
  function refToken(value, game) {
    if (!value) return null;
    if (value instanceof MTG.Player || (Number.isInteger(value.idx) && Array.isArray(value.hand))) return playerToken(value);
    if (Number.isInteger(value.iid)) return cardToken(value);
    const stackIndex = game && Array.isArray(game.stack) ? game.stack.indexOf(value) : -1;
    return stackIndex >= 0 ? `s:${stackIndex}` : null;
  }

  function publicCard(card, viewer) {
    if (!card) return null;
    const owner = card.owner || card.ctrl;
    const hidden = card.zone === 'library' || (card.zone === 'hand' && owner !== viewer) ||
      (card.faceDown && card.ctrl !== viewer);
    return {
      token: cardToken(card),
      name: hidden ? 'Hidden card' : card.name,
      zone: card.zone,
      ownerSeat: owner ? owner.onlineSeat ?? owner.idx : null,
      controllerSeat: card.ctrl ? card.ctrl.onlineSeat ?? card.ctrl.idx : null,
      hidden,
      tapped: card.zone === 'battlefield' ? !!card.tapped : undefined,
      faceDown: !!card.faceDown,
      power: !hidden && card.zone === 'battlefield' ? card.power : undefined,
      toughness: !hidden && card.zone === 'battlefield' ? card.toughness : undefined,
      counters: !hidden && card.counters ? clone(card.counters) : undefined,
      commander: !hidden ? !!card.commander : undefined,
      cost: !hidden && card.def ? card.def.cost || '' : undefined,
      types: !hidden && card.def ? (card.def.types || []).slice() : undefined,
    };
  }

  function gameViewFor(game, viewer) {
    const players = (game.players || []).map(player => ({
      seat: player.onlineSeat ?? player.idx,
      name: player.name,
      deckId: player.deckName || player.deck && player.deck.name || null,
      isAI: !!player.isAI,
      connected: player.onlineConnected !== false,
      life: player.life,
      poison: player.poison || 0,
      lost: !!player.lost,
      handCount: player.hand.length,
      libraryCount: player.library.length,
      hand: player === viewer ? player.hand.map(card => publicCard(card, viewer)) : undefined,
      graveyard: player.graveyard.map(card => publicCard(card, viewer)),
      exile: player.exile.map(card => publicCard(card, viewer)),
      command: player.command.map(card => publicCard(card, viewer)),
    }));
    return {
      turn: game.turnNo,
      phase: game.phase,
      step: game.step,
      activeSeat: game.turnPlayer ? game.turnPlayer.onlineSeat ?? game.turnPlayer.idx : null,
      prioritySeat: game.priorityState && game.priorityState.holder
        ? game.priorityState.holder.onlineSeat ?? game.priorityState.holder.idx : null,
      gameOver: !!game.gameOver,
      winnerSeat: game.winner ? game.winner.onlineSeat ?? game.winner.idx : null,
      players,
      battlefield: (game.battlefield || []).filter(card => card.zone === 'battlefield').map(card => publicCard(card, viewer)),
      stack: (game.stack || []).map((item, index) => ({
        token: `s:${index}`,
        name: item.name,
        kind: item.kind,
        controllerSeat: item.ctrl ? item.ctrl.onlineSeat ?? item.ctrl.idx : null,
        targets: (item.targets || item.ctx && item.ctx.targets || []).flat(Infinity).map(target => refToken(target, game)).filter(Boolean),
      })),
    };
  }

  function descriptorRef(value, game, viewer) {
    const token = refToken(value, game);
    if (!token) return null;
    if (token.startsWith('p:')) return { token, kind: 'player', name: value.name, life: value.life, seat: value.onlineSeat ?? value.idx };
    if (token.startsWith('c:')) return Object.assign({ kind: 'card' }, publicCard(value, viewer));
    return { token, kind: 'stack', name: value.name || 'Stack object' };
  }

  function altLabel(entry) {
    const alternate = entry.alt && (entry.alt.label || entry.alt.name);
    if (alternate) return alternate;
    return entry.from && entry.from !== 'hand' ? entry.from : '';
  }

  function decisionDescriptor(game, q, player, id) {
    const type = q.type;
    const descriptor = { id: String(id), seat: player.onlineSeat ?? player.idx, type, prompt: cleanText(q.prompt || '', 500) };
    let legal = { kind: 'ack' };
    if (['threatAlert', 'cardReveal', 'combatReview', 'effectReview', 'manualResolve', 'diplomacyReview'].includes(type)) {
      descriptor.cards = (q.cards || q.attackers || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
    } else if (type === 'mulligan') {
      descriptor.hand = player.hand.map(card => publicCard(card, player));
      descriptor.free = !!q.free;
      descriptor.mulls = q.mulls || 0;
      legal = { kind: 'boolean' };
    } else if (type === 'chooseOption') {
      descriptor.options = (q.options || []).map(option => ({ token: String(option.key), label: cleanText(option.label, 300) }));
      legal = { kind: 'token', tokens: descriptor.options.map(option => option.token) };
    } else if (type === 'chooseMulti') {
      descriptor.options = (q.options || []).map(option => ({ token: String(option.key), label: cleanText(option.label, 300) }));
      legal = { kind: 'tokens', tokens: descriptor.options.map(option => option.token), min: q.min ?? 1, max: q.max ?? descriptor.options.length, repeats: !!q.repeats };
    } else if (type === 'chooseX') {
      descriptor.min = q.min; descriptor.max = q.max; descriptor.values = q.values || null;
      legal = { kind: 'number', min: q.min, max: q.max, values: Array.isArray(q.values) ? q.values.slice() : undefined };
    } else if (['bottomCards', 'chooseCards', 'chooseTargets'].includes(type)) {
      const values = type === 'bottomCards' ? player.hand : type === 'chooseCards' ? q.from || [] : q.candidates || [];
      descriptor.choices = values.map(value => descriptorRef(value, game, player)).filter(Boolean);
      const count = type === 'bottomCards' ? q.n : null;
      legal = { kind: 'tokens', tokens: descriptor.choices.map(choice => choice.token), min: count ?? q.min ?? 0, max: count ?? q.max ?? descriptor.choices.length, repeats: false };
    } else if (type === 'chooseManaSources') {
      descriptor.choices = (q.candidates || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
      legal = { kind: 'mana', tokens: descriptor.choices.map(choice => choice.token) };
    } else if (type === 'orderTriggers') {
      descriptor.choices = (q.triggers || []).map((trigger, index) => ({ token: `t:${index}`, label: cleanText(trigger.name || trigger.src && trigger.src.name || 'Trigger', 300) }));
      legal = { kind: 'tokens', tokens: descriptor.choices.map(choice => choice.token), min: descriptor.choices.length, max: descriptor.choices.length };
    } else if (type === 'scry') {
      descriptor.choices = (q.cards || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
      legal = { kind: 'scry', tokens: descriptor.choices.map(choice => choice.token) };
    } else if (type === 'attackers') {
      descriptor.left = (q.eligible || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
      descriptor.right = (q.attackTargets || q.opponents || []).map(target => descriptorRef(target, game, player)).filter(Boolean);
      const attackPairs = [];
      for (const card of q.eligible || []) {
        const allowedTargets = game.legalDeclarationAttackTargets
          ? game.legalDeclarationAttackTargets(card) : (q.attackTargets || q.opponents || []);
        for (const target of allowedTargets) {
          const left = cardToken(card), right = refToken(target, game);
          if (left && right) attackPairs.push(`${left}|${right}`);
        }
      }
      legal = {
        kind: 'assignments', left: descriptor.left.map(item => item.token), right: descriptor.right.map(item => item.token),
        pairs: attackPairs, required: (q.forced || []).map(cardToken).filter(Boolean), min: (q.forced || []).length, max: descriptor.left.length,
      };
    } else if (type === 'blockers') {
      descriptor.left = (q.potential || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
      descriptor.right = (q.attackers || []).map(card => descriptorRef(card, game, player)).filter(Boolean);
      const blockPairs = [];
      for (const blocker of q.potential || []) for (const attacker of q.attackers || []) {
        if (game.canBlock && !game.canBlock(blocker, attacker)) continue;
        const left = cardToken(blocker), right = cardToken(attacker);
        if (left && right) blockPairs.push(`${left}|${right}`);
      }
      legal = { kind: 'assignments', left: descriptor.left.map(item => item.token), right: descriptor.right.map(item => item.token), pairs: blockPairs, required: [], min: 0, max: descriptor.left.length };
    } else if (type === 'main' || type === 'priority') {
      const actions = [];
      (q.casts || []).forEach((entry, index) => actions.push({ token: `cast:${index}`, kind: 'cast', label: `Cast ${entry.card.name}${altLabel(entry) ? ` · ${altLabel(entry)}` : ''}`, card: publicCard(entry.card, player) }));
      (q.acts || []).forEach((entry, index) => actions.push({ token: `act:${index}`, kind: 'activate', label: cleanText(entry.label || entry.ability && entry.ability.label || `Activate ${entry.card.name}`, 300), card: publicCard(entry.card, player) }));
      (q.lands || []).forEach((card, index) => actions.push({ token: `land:${index}`, kind: 'land', label: `Play ${card.name}`, card: publicCard(card, player) }));
      actions.push({ token: type === 'priority' ? 'pass' : 'done', kind: type === 'priority' ? 'pass' : 'done', label: type === 'priority' ? 'Pass priority' : 'Continue' });
      descriptor.actions = actions;
      legal = { kind: 'token', tokens: actions.map(action => action.token) };
    }
    descriptor.legal = legal;
    return descriptor;
  }

  function tokenValue(token, game) {
    const text = String(token);
    if (text.startsWith('c:')) return game.byIid(Number(text.slice(2)));
    if (text.startsWith('p:')) return game.players.find(player => player.idx === Number(text.slice(2))) || null;
    if (text.startsWith('s:')) return game.stack[Number(text.slice(2))] || null;
    return null;
  }

  function hydrateDecision(game, q, descriptor, response) {
    const verdict = validateLegalResponse(descriptor.legal, response);
    if (!verdict.ok) throw new Error(verdict.error);
    switch (q.type) {
      case 'threatAlert': case 'cardReveal': case 'combatReview': case 'effectReview': case 'manualResolve': case 'diplomacyReview': return null;
      case 'mulligan': return response;
      case 'chooseOption': return String(response);
      case 'chooseMulti': return response.map(String);
      case 'chooseX': return response;
      case 'bottomCards': case 'chooseCards': case 'chooseTargets': return response.map(token => tokenValue(token, game)).filter(Boolean);
      case 'chooseManaSources': return response.auto ? { auto: true } : { cards: response.cards.map(token => tokenValue(token, game)).filter(Boolean) };
      case 'orderTriggers': return response.map(token => q.triggers[Number(String(token).slice(2))]).filter(Boolean);
      case 'scry': return { top: response.top.map(token => tokenValue(token, game)).filter(Boolean), bottom: response.bottom.map(token => tokenValue(token, game)).filter(Boolean) };
      case 'attackers': return response.map(item => ({ card: tokenValue(item.left, game), target: tokenValue(item.right, game) })).filter(item => item.card && item.target);
      case 'blockers': return response.map(item => ({ blocker: tokenValue(item.left, game), attacker: tokenValue(item.right, game) })).filter(item => item.blocker && item.attacker);
      case 'main': case 'priority': {
        if (response === 'pass') return { kind: 'pass' };
        if (response === 'done') return { kind: 'done' };
        const [kind, rawIndex] = String(response).split(':');
        const index = Number(rawIndex);
        if (kind === 'cast') { const entry = q.casts[index]; return { kind: 'cast', card: entry.card, alt: entry.alt, from: entry.from }; }
        if (kind === 'act') return { kind: 'activate', entry: q.acts[index] };
        if (kind === 'land') return { kind: 'land', card: q.lands[index] };
        return q.type === 'priority' ? { kind: 'pass' } : { kind: 'done' };
      }
      default: return response;
    }
  }

  function remoteControllerFor(player, transport) {
    if (!transport || typeof transport.requestDecision !== 'function') throw new Error('Remote transport must implement requestDecision(payload).');
    let serial = 0;
    return {
      async decide(game, q) {
        const id = `${game.turnNo}:${game.phase}:${player.onlineSeat ?? player.idx}:${++serial}`;
        const descriptor = decisionDescriptor(game, q, player, id);
        const response = await transport.requestDecision({
          id,
          seat: player.onlineSeat ?? player.idx,
          descriptor,
          view: gameViewFor(game, player),
          game,
        });
        return hydrateDecision(game, q, descriptor, response);
      },
    };
  }

  function onlineHostBridge(roomClient) {
    if (!roomClient || typeof roomClient.dispatch !== 'function' || typeof roomClient.subscribe !== 'function')
      throw new Error('Room client must implement dispatch(action) and subscribe(listener).');
    let latest = typeof roomClient.current === 'function' ? roomClient.current() : null;
    const waiters = new Set();
    roomClient.subscribe(view => {
      latest = view;
      for (const waiter of [...waiters]) {
        if (!waiter.match(view)) continue;
        waiters.delete(waiter);
        waiter.resolve(view);
      }
    });
    const waitFor = match => {
      if (latest && match(latest)) return Promise.resolve(latest);
      return new Promise(resolve => waiters.add({ match, resolve }));
    };
    const bridge = {
      current: () => latest,
      async syncGame(game) {
        const host = game.players.find(player => player.onlineSeat === 0);
        const guest = game.players.find(player => player.onlineSeat === 1);
        if (!host || !guest) throw new Error('Online game must contain Host and Player 2.');
        await roomClient.dispatch({ type: 'sync', views: { 0: gameViewFor(game, host), 1: gameViewFor(game, guest) } });
      },
      async requestDecision(payload) {
        if (payload.game) await bridge.syncGame(payload.game);
        await roomClient.dispatch({ type: 'decisionRequest', decision: payload.descriptor });
        const view = await waitFor(next => next && next.lastDecision && next.lastDecision.id === payload.id);
        const response = clone(view.lastDecision.response);
        await roomClient.dispatch({ type: 'decisionAck', decisionId: payload.id });
        return response;
      },
      async setPresence(connected) {
        await roomClient.dispatch({ type: 'presence', connected: !!connected });
      },
      async finish(winnerSeat) {
        await roomClient.dispatch({ type: 'finish', winnerSeat: winnerSeat ?? null });
      },
    };
    return bridge;
  }

  function selectOnlineBotDecks(humanDecks, selections, rnd) {
    const humans = (humanDecks || []).filter(Boolean);
    const chosen = Array.from({ length: BOT_SEATS }, (_, index) => {
      const name = (selections || [])[index];
      return name && MTG.DECKS && MTG.DECKS[name] && !MTG.DECKS[name].custom ? name : '';
    });
    const seen = new Set(humans);
    for (let index = 0; index < chosen.length; index++) {
      if (!chosen[index] || seen.has(chosen[index])) chosen[index] = '';
      else seen.add(chosen[index]);
    }
    const pool = Object.keys(MTG.DECKS || {}).filter(name => !seen.has(name) && !MTG.DECKS[name].custom);
    if (MTG.shuffle) MTG.shuffle(pool, rnd || Math.random);
    return chosen.map(name => name || pool.shift()).filter(Boolean);
  }

  // Explicit browser canary only (`?onlineSmoke=host|guest`). It exercises the
  // real lobby/remote-decision DOM without a network and is never selected by
  // ordinary players or by the deployed room adapter.
  function createOnlineSmokeRoomClient(mode = 'host') {
    const guestMode = mode === 'guest';
    let state = setup(['host'], { botDecks: ['Doom Prevails', 'Turtle Power'], botStyles: ['balanced', 'opportunist'] });
    state = applyAction(state, { type: 'join', name: 'Player 2' }, 'guest');
    state = applyAction(state, { type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true }, 'host');
    state = applyAction(state, { type: 'configure', deckId: 'Elven Council', commanderNames: ['Galadriel, Elven-Queen'], ready: true }, 'guest');
    if (guestMode) {
      state = applyAction(state, { type: 'start', seed: 11081 }, 'host');
      const basePlayers = [
        { seat: 0, name: 'Host', deckId: 'Abzan Armor', isAI: false, life: 40, poison: 0, lost: false, handCount: 7, libraryCount: 92 },
        { seat: 1, name: 'Player 2', deckId: 'Elven Council', isAI: false, life: 40, poison: 0, lost: false, handCount: 2, libraryCount: 91, hand: [
          { token: 'c:11', name: 'Sol Ring', zone: 'hand', ownerSeat: 1, controllerSeat: 1, hidden: false, cost: '{1}', types: ['Artifact'] },
          { token: 'c:12', name: 'Forest', zone: 'hand', ownerSeat: 1, controllerSeat: 1, hidden: false, cost: '', types: ['Land'] },
        ] },
        { seat: 2, name: 'AI Dragon', deckId: 'Doom Prevails', isAI: true, life: 38, poison: 0, lost: false, handCount: 6, libraryCount: 89 },
        { seat: 3, name: 'AI Wolf', deckId: 'Turtle Power', isAI: true, life: 40, poison: 0, lost: false, handCount: 5, libraryCount: 90 },
      ];
      const gameView = {
        turn: 4, phase: 'main1', step: 'main', activeSeat: 1, prioritySeat: 1, gameOver: false, winnerSeat: null,
        players: basePlayers,
        battlefield: [
          { token: 'c:21', name: 'Galadriel, Elven-Queen', zone: 'battlefield', ownerSeat: 1, controllerSeat: 1, hidden: false, tapped: false, power: 4, toughness: 5, commander: true, counters: {}, types: ['Creature'] },
          { token: 'c:22', name: 'Sol Ring', zone: 'battlefield', ownerSeat: 0, controllerSeat: 0, hidden: false, tapped: true, counters: {}, types: ['Artifact'] },
        ],
        stack: [],
      };
      state = applyAction(state, { type: 'sync', views: { 0: clone(gameView), 1: clone(gameView) } }, 'host');
      state = applyAction(state, { type: 'decisionRequest', decision: {
        id: 'smoke-decision', seat: 1, type: 'chooseOption', prompt: 'Choose the Fellowship vote',
        options: [{ token: 'fellowship', label: 'Fellowship' }, { token: 'mordor', label: 'Mordor' }],
        legal: { kind: 'token', tokens: ['fellowship', 'mordor'] },
      } }, 'host');
    }
    const playerId = guestMode ? 'guest' : 'host';
    const listeners = new Set();
    const current = () => viewFor(state, playerId);
    return {
      isHost: !guestMode,
      shareUrl: `${location.origin}${location.pathname}?onlineSmoke=guest`,
      current,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      async dispatch(action) {
        state = applyAction(state, action, playerId);
        const view = current();
        listeners.forEach(listener => listener(view));
        return view;
      },
    };
  }

  // Adapter shared by the Higgsfield room kernel and the Vercel WebSocket room
  // service. Both expose the same join/action/state protocol to the Commander
  // lobby and host bridge.
  function onlineRoomShareUrl(currentUrl, room) {
    const share = new URL(currentUrl);
    // Vercel consumes `_vercel_share` before the app loads. The private entry
    // URL therefore carries the same short-lived token as `commander_share`
    // so the lobby can put the official parameter back on the friend link.
    const vercelShare = share.searchParams.get('_vercel_share') || share.searchParams.get('commander_share');
    share.search = '';
    if (vercelShare) share.searchParams.set('_vercel_share', vercelShare);
    share.searchParams.set('room', room);
    share.hash = '';
    return share.toString();
  }

  function createHiggsfieldRoomClient(options = {}) {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
      throw new Error('Higgsfield rooms require a browser WebSocket runtime.');
    }
    const params = new URLSearchParams(location.search);
    let room = cleanText(options.roomCode || params.get('room'), 64);
    if (!room) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      room = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
    }
    params.set('room', room);
    if (params.get('onlineSmoke')) params.delete('onlineSmoke');
    const nextUrl = `${location.pathname}?${params.toString()}`;
    if (location.search !== `?${params.toString()}`) history.replaceState(null, '', nextUrl);

    let playerId = sessionStorage.getItem('commander-live-player-id');
    if (!playerId) {
      playerId = `p-${crypto.randomUUID()}`;
      sessionStorage.setItem('commander-live-player-id', playerId);
    }
    const shareUrl = onlineRoomShareUrl(location.href, room);
    const base = location.pathname.replace(/\/+$/, '');
    const websocketOrigin = `${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}`;
    const isVercel = /(^|\.)vercel\.app$/i.test(location.hostname);
    const socketUrl = isVercel
      ? `${websocketOrigin}/api/ws?room=${encodeURIComponent(room)}${options.create ? '&create=1' : ''}`
      : `${websocketOrigin}${base}/ws/${encodeURIComponent(room)}`;
    const listeners = new Set();
    const queue = [];
    let socket = null;
    let latest = null;
    let kernelState = null;
    let inflight = null;
    let open = false;
    let reconnectTimer = null;
    let reconnectQueued = false;
    let stopped = false;

    const waitingView = message => {
      const ids = Array.isArray(message.seats) ? message.seats : [];
      const you = ids.indexOf(message.you);
      return {
        protocolVersion: PROTOCOL_VERSION,
        phase: 'lobby',
        revision: -1,
        you: you >= 0 ? you : null,
        seats: [
          { seat: 0, kind: 'human', role: 'host', name: 'Host', connected: ids.length > 0, ready: false, deckId: null, commanderNames: [], aiStyle: null },
          { seat: 1, kind: 'human', role: 'guest', name: 'Player 2', connected: ids.length > 1, ready: false, deckId: null, commanderNames: [], aiStyle: null },
          { seat: 2, kind: 'bot', role: 'bot', name: BOT_NAMES[0], connected: true, ready: true, deckId: null, commanderNames: [], aiStyle: 'balanced' },
          { seat: 3, kind: 'bot', role: 'bot', name: BOT_NAMES[1], connected: true, ready: true, deckId: null, commanderNames: [], aiStyle: 'balanced' },
        ],
        settings: { difficulty: 'normal', seed: null, diplomacyEnabled: false, sumPartnerDamage: false },
        gameView: null,
        pendingDecision: null,
        lastDecision: null,
        pause: null,
        winnerSeat: null,
        lastEvent: { type: 'waiting', revision: -1 },
      };
    };
    const emit = () => listeners.forEach(listener => listener(latest));
    const pump = () => {
      if (!open || inflight || !queue.length || !kernelState ||
        kernelState.status !== 'playing' || !kernelState.view) return;
      inflight = queue.shift();
      inflight.baseRevision = Number.isInteger(latest && latest.revision) ? latest.revision : -1;
      socket.send(JSON.stringify({ type: 'action', action: inflight.action }));
    };
    const rejectInflight = error => {
      if (!inflight) return;
      const current = inflight;
      inflight = null;
      current.reject(error instanceof Error ? error : new Error(String(error)));
      pump();
    };
    const queueReconnect = () => {
      if (reconnectQueued || !latest || latest.you === null) return;
      const mine = latest.seats && latest.seats.find(seat => seat.seat === latest.you);
      if (!mine || mine.connected !== false) return;
      reconnectQueued = true;
      queue.unshift({
        action: { type: 'reconnect' },
        resolve: () => { reconnectQueued = false; },
        reject: () => { reconnectQueued = false; },
        baseRevision: latest.revision,
      });
    };
    const acceptState = message => {
      kernelState = message;
      latest = message.view ? clone(message.view) : waitingView(message);
      emit();
      if (inflight && message.view && Number.isInteger(message.view.revision) &&
        message.view.revision > inflight.baseRevision) {
        const completed = inflight;
        inflight = null;
        completed.resolve(latest);
      }
      queueReconnect();
      pump();
    };
    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(socketUrl);
      socket.onopen = () => {
        open = true;
        socket.send(JSON.stringify({ type: 'join', playerId }));
      };
      socket.onmessage = event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'error') {
          rejectInflight(new Error(message.error || 'The live room rejected the action.'));
          return;
        }
        if (message.type === 'state') acceptState(message);
      };
      socket.onclose = () => {
        open = false;
        kernelState = null;
        rejectInflight(new Error('Room connection closed before the action was confirmed.'));
        if (!stopped) reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => {};
    };
    const disconnectPresence = () => {
      if (!open || !latest || !['running', 'paused'].includes(latest.phase)) return;
      try {
        socket.send(JSON.stringify({ type: 'action', action: { type: 'presence', connected: false } }));
      } catch {}
    };
    window.addEventListener('pagehide', disconnectPresence);
    connect();

    return {
      platformAutoJoin: true,
      get isHost() { return latest ? latest.you === 0 : !!options.create; },
      shareUrl,
      current: () => latest,
      subscribe(listener) {
        listeners.add(listener);
        if (latest) listener(latest);
        return () => listeners.delete(listener);
      },
      dispatch(action) {
        return new Promise((resolve, reject) => {
          queue.push({ action: clone(action), resolve, reject, baseRevision: -1 });
          pump();
        });
      },
      close() {
        stopped = true;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        window.removeEventListener('pagehide', disconnectPresence);
        if (socket) socket.close();
      },
    };
  }

  MTG.ONLINE_PROTOCOL_VERSION = PROTOCOL_VERSION;
  MTG.onlineGameLogic = { meta, setup, validateAction, applyAction, isGameOver, viewFor };
  MTG.validateOnlineDecisionResponse = validateLegalResponse;
  MTG.onlineDecisionDescriptor = decisionDescriptor;
  MTG.hydrateOnlineDecision = hydrateDecision;
  MTG.onlineGameViewFor = gameViewFor;
  MTG.remoteControllerFor = remoteControllerFor;
  MTG.onlineHostBridge = onlineHostBridge;
  MTG.selectOnlineBotDecks = selectOnlineBotDecks;
  MTG.createOnlineSmokeRoomClient = createOnlineSmokeRoomClient;
  MTG.onlineRoomShareUrl = onlineRoomShareUrl;
  if (typeof location !== 'undefined' && /(^|\.)(?:higgsfield\.(?:ai|app)|vercel\.app)$/i.test(location.hostname)) {
    MTG.createHiggsfieldRoomClient = createHiggsfieldRoomClient;
  }
})();
