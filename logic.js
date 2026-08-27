// Higgsfield Games v1 authoritative room rules for Commander Live.
// This module is intentionally self-contained: the platform loads it in a
// sandbox and supplies rooms, WebSockets, seats, persistence, and reconnects.

export const meta = {
  game: 'Commander Live',
  minPlayers: 2,
  maxPlayers: 2,
};

const PROTOCOL_VERSION = 1;
const HUMAN_SEATS = 2;
const BOT_SEATS = 2;
const MAX_SYNC_BYTES = 2_000_000;
const HUMAN_NAMES = ['Host', 'Player 2'];
const BOT_NAMES = ['AI Dragon', 'AI Wolf'];

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const cleanText = (value, max = 80) => String(value || '').trim()
  .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const byteSize = value => {
  try { return JSON.stringify(value).length; } catch { return Infinity; }
};

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

export function setup(playerIds = []) {
  const ids = Array.isArray(playerIds) ? playerIds.filter(Boolean).slice(0, HUMAN_SEATS) : [];
  const seats = [
    seatRecord(0, 'human'),
    seatRecord(1, 'human'),
    seatRecord(2, 'bot'),
    seatRecord(3, 'bot'),
  ];
  ids.forEach((playerId, index) => {
    seats[index].playerId = String(playerId);
    seats[index].connected = true;
    seats[index].name = HUMAN_NAMES[index];
  });
  return {
    protocolVersion: PROTOCOL_VERSION,
    phase: 'lobby',
    revision: 0,
    seats,
    settings: {
      difficulty: 'normal',
      seed: null,
      diplomacyEnabled: false,
      sumPartnerDamage: false,
    },
    views: { 0: null, 1: null },
    pendingDecision: null,
    lastDecision: null,
    pendingManualAction: null,
    lastManualAction: null,
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
    if (Array.isArray(legal.values) && !legal.values.includes(response)) {
      return { ok: false, error: 'Number is not legal.' };
    }
    if (Number.isFinite(legal.min) && response < legal.min) {
      return { ok: false, error: 'Number is below minimum.' };
    }
    if (Number.isFinite(legal.max) && response > legal.max) {
      return { ok: false, error: 'Number is above maximum.' };
    }
    return { ok: true };
  }
  if (legal.kind === 'token') return allowed.has(String(response))
    ? { ok: true } : { ok: false, error: 'Choice is not legal.' };
  if (legal.kind === 'tokens') {
    if (!Array.isArray(response) || response.length < min || response.length > max) {
      return { ok: false, error: `Choose between ${min} and ${max}.` };
    }
    if (response.some(token => !allowed.has(String(token)))) {
      return { ok: false, error: 'One or more choices are not legal.' };
    }
    if (!legal.repeats && new Set(response.map(String)).size !== response.length) {
      return { ok: false, error: 'Duplicate choices are not legal.' };
    }
    return { ok: true };
  }
  if (legal.kind === 'assignments') {
    if (!Array.isArray(response) || response.length < min || response.length > max) {
      return { ok: false, error: `Submit between ${min} and ${max} assignments.` };
    }
    const left = new Set((legal.left || []).map(String));
    const right = new Set((legal.right || []).map(String));
    const pairs = Array.isArray(legal.pairs) ? new Set(legal.pairs.map(String)) : null;
    const usedLeft = new Set();
    for (const item of response) {
      if (!isObject(item) || !left.has(String(item.left)) || !right.has(String(item.right))) {
        return { ok: false, error: 'Assignment contains an illegal reference.' };
      }
      if (pairs && !pairs.has(`${item.left}|${item.right}`)) {
        return { ok: false, error: 'That card cannot be assigned to that target.' };
      }
      if (usedLeft.has(String(item.left))) {
        return { ok: false, error: 'A card can only be assigned once.' };
      }
      usedLeft.add(String(item.left));
    }
    for (const token of legal.required || []) {
      if (!usedLeft.has(String(token))) return { ok: false, error: 'A required assignment is missing.' };
    }
    return { ok: true };
  }
  if (legal.kind === 'scry') {
    if (!isObject(response) || !Array.isArray(response.top) || !Array.isArray(response.bottom)) {
      return { ok: false, error: 'Expected top and bottom card lists.' };
    }
    const all = response.top.concat(response.bottom).map(String);
    if (all.length !== allowed.size || new Set(all).size !== all.length || all.some(token => !allowed.has(token))) {
      return { ok: false, error: 'Every scry card must appear exactly once.' };
    }
    return { ok: true };
  }
  if (legal.kind === 'mana') {
    if (isObject(response) && response.auto === true) return { ok: true };
    const cards = isObject(response) ? response.cards : null;
    if (!Array.isArray(cards) || cards.some(token => !allowed.has(String(token))) ||
      new Set(cards.map(String)).size !== cards.length) {
      return { ok: false, error: 'Mana selection is not legal.' };
    }
    return { ok: true };
  }
  return { ok: false, error: 'Unknown legal response kind.' };
}

function validateRoomAction(state, action, playerId) {
  if (!state || state.protocolVersion !== PROTOCOL_VERSION) {
    return { ok: false, error: 'Unsupported room state.' };
  }
  if (!isObject(action) || !cleanText(action.type, 40)) {
    return { ok: false, error: 'Invalid action.' };
  }
  const type = action.type;
  const seat = seatFor(state, playerId);

  if (type === 'join') {
    if (state.phase !== 'lobby') return { ok: false, error: 'The game already started.' };
    return seat ? { ok: true } : { ok: false, error: 'The two human seats are full.' };
  }
  if (type === 'reconnect') {
    if (!seat || seat.kind !== 'human') return { ok: false, error: 'Seat not found.' };
    return { ok: true };
  }
  if (!seat) return { ok: false, error: 'Join the room first.' };
  if (type === 'configure') {
    if (state.phase !== 'lobby' || seat.kind !== 'human') {
      return { ok: false, error: 'Seat cannot be configured now.' };
    }
    if (!cleanText(action.deckId, 120)) return { ok: false, error: 'Choose a deck.' };
    if (action.commanderNames !== undefined &&
      (!Array.isArray(action.commanderNames) || action.commanderNames.length > 2)) {
      return { ok: false, error: 'Choose one commander or a legal partner pair.' };
    }
    return { ok: true };
  }
  if (type === 'configureBot') {
    if (state.phase !== 'lobby' || seat.seat !== 0) {
      return { ok: false, error: 'Only the host configures bots.' };
    }
    if (![2, 3].includes(action.seat) || !cleanText(action.deckId, 120)) {
      return { ok: false, error: 'Invalid bot configuration.' };
    }
    return { ok: true };
  }
  if (type === 'start') {
    if (state.phase !== 'lobby' || seat.seat !== 0) {
      return { ok: false, error: 'Only the host starts the game.' };
    }
    if (!state.seats.slice(0, 2).every(item => item.playerId && item.connected && item.ready)) {
      return { ok: false, error: 'Both human players must be connected and ready.' };
    }
    if (!uniqueDecksReady(state)) return { ok: false, error: 'All four seats need different decks.' };
    if (!Number.isSafeInteger(action.seed) || action.seed < 0) {
      return { ok: false, error: 'Invalid deterministic seed.' };
    }
    return { ok: true };
  }
  if (type === 'presence') {
    return typeof action.connected === 'boolean'
      ? { ok: true } : { ok: false, error: 'Invalid presence value.' };
  }
  if (type === 'sync') {
    if (seat.seat !== 0 || !['running', 'paused'].includes(state.phase)) {
      return { ok: false, error: 'Only the host can synchronize the game.' };
    }
    if (!isObject(action.views) || byteSize(action.views) > MAX_SYNC_BYTES) {
      return { ok: false, error: 'Invalid or oversized game views.' };
    }
    if (!('0' in action.views) || !('1' in action.views)) {
      return { ok: false, error: 'Both human views are required.' };
    }
    return { ok: true };
  }
  if (type === 'decisionRequest') {
    if (seat.seat !== 0 || state.phase !== 'running') {
      return { ok: false, error: 'Only the active host can request a decision.' };
    }
    if (state.pendingDecision || !isObject(action.decision) || !cleanText(action.decision.id, 100)) {
      return { ok: false, error: 'Invalid or overlapping decision.' };
    }
    if (action.decision.seat !== 1 || !isObject(action.decision.legal)) {
      return { ok: false, error: 'Decision must target Player 2.' };
    }
    if (byteSize(action.decision) > 500_000) {
      return { ok: false, error: 'Decision payload is too large.' };
    }
    return { ok: true };
  }
  if (type === 'decisionResponse') {
    if (seat.seat !== 1 || !state.pendingDecision) {
      return { ok: false, error: 'No decision is waiting for this seat.' };
    }
    if (String(action.decisionId) !== state.pendingDecision.id) {
      return { ok: false, error: 'Stale decision response.' };
    }
    return validateLegalResponse(state.pendingDecision.legal, action.response);
  }
  if (type === 'decisionAck') {
    if (seat.seat !== 0 || !state.lastDecision || String(action.decisionId) !== state.lastDecision.id) {
      return { ok: false, error: 'No matching decision to acknowledge.' };
    }
    return { ok: true };
  }
  if (type === 'manualAction') {
    if (state.phase !== 'running' || state.pendingManualAction) {
      return { ok: false, error: 'A Last Resort correction is already pending.' };
    }
    if (!isObject(action.action) || byteSize(action.action) > 4_000) {
      return { ok: false, error: 'Invalid Last Resort correction.' };
    }
    const manual = action.action;
    const manualType = cleanText(manual.type, 40);
    const allowed = new Set(['setPause', 'setLife', 'setMana', 'setTapped', 'setDamage', 'setCounter', 'setController', 'reorder', 'moveCard', 'createToken', 'addPermanent']);
    if (!allowed.has(manualType)) return { ok: false, error: 'Unsupported Last Resort correction.' };
    if (manualType === 'setPause' && typeof manual.value !== 'boolean') return { ok: false, error: 'Invalid Last Resort pause.' };
    for (const field of ['playerSeat', 'direction', 'count']) {
      if (manual[field] !== undefined && !Number.isInteger(manual[field])) return { ok: false, error: `Invalid Last Resort ${field}.` };
    }
    if (manual.value !== undefined && manualType !== 'setPause' && !Number.isInteger(manual.value)) return { ok: false, error: 'Invalid Last Resort value.' };
    if (manual.playerSeat !== undefined && (manual.playerSeat < 0 || manual.playerSeat > 3)) return { ok: false, error: 'Invalid player seat.' };
    if (manual.cardToken !== undefined && !/^c:-?\d+$/.test(String(manual.cardToken))) return { ok: false, error: 'Invalid public card reference.' };
    return { ok: true };
  }
  if (type === 'manualAck') {
    if (seat.seat !== 0 || !state.pendingManualAction || String(action.manualId) !== state.pendingManualAction.id) {
      return { ok: false, error: 'No matching Last Resort correction to acknowledge.' };
    }
    return { ok: true };
  }
  if (type === 'resume') {
    if (seat.seat !== 0 || state.phase !== 'paused' ||
      !state.seats.slice(0, 2).every(item => item.connected)) {
      return { ok: false, error: 'Both players must reconnect before the host resumes.' };
    }
    return { ok: true };
  }
  if (type === 'finish') {
    if (seat.seat !== 0 || !['running', 'paused'].includes(state.phase)) {
      return { ok: false, error: 'Only the host can finish the game.' };
    }
    if (action.winnerSeat !== null && ![0, 1, 2, 3].includes(action.winnerSeat)) {
      return { ok: false, error: 'Invalid winner.' };
    }
    return { ok: true };
  }
  return { ok: false, error: `Unsupported action: ${cleanText(type, 40)}` };
}

export function validateAction(state, playerId, action) {
  return validateRoomAction(state, action, playerId);
}

export function applyAction(state, playerId, action) {
  const next = clone(state);
  const type = action.type;
  const seat = seatFor(next, playerId);
  if (type === 'join') {
    seat.connected = true;
  } else if (type === 'reconnect') {
    seat.connected = true;
  } else if (type === 'configure') {
    seat.deckId = cleanText(action.deckId, 120);
    seat.commanderNames = (action.commanderNames || [])
      .map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2);
    seat.name = cleanText(action.name || seat.name, 32);
    seat.ready = action.ready !== false;
  } else if (type === 'configureBot') {
    const bot = next.seats[action.seat];
    bot.deckId = cleanText(action.deckId, 120);
    bot.aiStyle = cleanText(action.aiStyle || bot.aiStyle, 32) || 'balanced';
    bot.commanderNames = (action.commanderNames || [])
      .map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2);
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
    next.views = {
      0: clone(action.views[0] ?? action.views['0']),
      1: clone(action.views[1] ?? action.views['1']),
    };
  } else if (type === 'decisionRequest') {
    next.pendingDecision = clone(action.decision);
    next.lastDecision = null;
  } else if (type === 'decisionResponse') {
    next.lastDecision = { id: next.pendingDecision.id, response: clone(action.response), seat: 1 };
    next.pendingDecision = null;
  } else if (type === 'decisionAck') {
    next.lastDecision = null;
  } else if (type === 'manualAction') {
    next.pendingManualAction = {
      id: `last-resort:${next.revision + 1}:${seat.seat}`,
      seat: seat.seat,
      action: clone(action.action),
    };
    next.lastManualAction = null;
  } else if (type === 'manualAck') {
    next.lastManualAction = {
      id: next.pendingManualAction.id,
      seat: next.pendingManualAction.seat,
      ok: action.ok !== false,
      message: cleanText(action.message || '', 300),
    };
    next.pendingManualAction = null;
  } else if (type === 'resume') {
    next.phase = 'running';
    next.pause = null;
  } else if (type === 'finish') {
    next.phase = 'finished';
    next.winnerSeat = action.winnerSeat ?? null;
    next.pendingDecision = null;
    next.pendingManualAction = null;
    next.pause = null;
  }
  next.revision += 1;
  next.lastEvent = { type, seat: seat ? seat.seat : null, revision: next.revision };
  return next;
}

export function isGameOver(state) {
  if (!state || state.phase !== 'finished') return { over: false };
  const seat = Number.isInteger(state.winnerSeat) ? state.seats[state.winnerSeat] : null;
  return {
    over: true,
    winner: seat && seat.playerId ? seat.playerId : `seat:${state.winnerSeat}`,
    winnerSeat: state.winnerSeat,
  };
}

export function viewFor(state, playerId) {
  const seat = seatFor(state, playerId);
  const seatIndex = seat ? seat.seat : null;
  return {
    protocolVersion: state.protocolVersion,
    phase: state.phase,
    revision: state.revision,
    you: seatIndex,
    seats: state.seats.map(item => ({
      seat: item.seat,
      kind: item.kind,
      role: item.role,
      name: item.name,
      connected: item.connected,
      ready: item.ready,
      deckId: item.deckId,
      commanderNames: item.commanderNames,
      aiStyle: item.aiStyle,
    })),
    settings: clone(state.settings),
    gameView: seatIndex === 0 || seatIndex === 1 ? clone(state.views[seatIndex]) : null,
    pendingDecision: seatIndex === 1 ? clone(state.pendingDecision) : null,
    lastDecision: seatIndex === 0 ? clone(state.lastDecision) : null,
    pendingManualAction: seatIndex === 0 ? clone(state.pendingManualAction) : null,
    lastManualAction: state.lastManualAction && state.lastManualAction.seat === seatIndex ? clone(state.lastManualAction) : null,
    pause: clone(state.pause),
    winnerSeat: state.winnerSeat,
    lastEvent: clone(state.lastEvent),
  };
}
