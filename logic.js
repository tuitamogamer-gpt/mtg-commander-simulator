// Higgsfield Games v1 authoritative room rules for Commander Live.
// This module is intentionally self-contained: the platform loads it in a
// sandbox and supplies rooms, WebSockets, seats, persistence, and reconnects.

export const meta = {
  game: 'Commander Live',
  minPlayers: 2,
  maxPlayers: 4,
};

const PROTOCOL_VERSION = 2;
const MIN_HUMAN_SEATS = 2;
const MAX_HUMAN_SEATS = 4;
const MAX_SYNC_BYTES = 2_000_000;
const MAX_DECK_RECORD_BYTES = 16_000;
const HUMAN_NAMES = ['Host', 'Player 2', 'Player 3', 'Player 4'];

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const cleanText = (value, max = 80) => String(value || '').trim()
  .replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const byteSize = value => {
  try { return JSON.stringify(value).length; } catch { return Infinity; }
};
const cleanPlayerCount = value => {
  const count = Number(value);
  return Number.isInteger(count) && count >= MIN_HUMAN_SEATS && count <= MAX_HUMAN_SEATS
    ? count : MIN_HUMAN_SEATS;
};

function seatRecord(seat) {
  return {
    seat,
    kind: 'human',
    role: seat === 0 ? 'host' : 'guest',
    playerId: null,
    name: HUMAN_NAMES[seat],
    connected: false,
    ready: false,
    deckId: null,
    // Only canonical list data crosses the room; the host supplies and checks
    // the executable card definitions before constructing the game.
    deckRecord: null,
    commanderNames: [],
    aiStyle: null,
  };
}

function cleanDeckRecord(value) {
  const validText = (text, max) => typeof text === 'string' && text.length > 0 &&
    text.length <= max && text === text.trim() && !/[\u0000-\u001f\u007f]/.test(text);
  const nameKey = name => name.normalize('NFKC').replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2013\u2014]/g, '-').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
  if (!isObject(value) || value.schema !== 'commander-deck/v1' ||
      !validText(value.id, 85) || !/^deck-[a-z0-9-]{8,80}$/.test(value.id) ||
      !validText(value.name, 80) || !Array.isArray(value.commanders) ||
      value.commanders.length < 1 || value.commanders.length > 2 ||
      !value.commanders.every(name => validText(name, 160)) ||
      new Set(value.commanders.map(nameKey)).size !== value.commanders.length ||
      !Array.isArray(value.cards) || value.cards.length < 1 || value.cards.length > 100) return null;
  const seen = new Set();
  const cards = [];
  let total = 0;
  for (const row of value.cards) {
    if (!isObject(row) || !validText(row.name, 160) || !Number.isSafeInteger(row.n) ||
        row.n < 1 || row.n > 100 || !['Commander', 'Main'].includes(row.section)) return null;
    const key = nameKey(row.name);
    if (seen.has(key)) return null;
    seen.add(key);
    total += row.n;
    cards.push({ name: row.name, n: row.n, section: row.section });
  }
  if (total !== 100 || value.commanders.some(name =>
    !cards.some(row => row.name === name && row.n === 1 && row.section === 'Commander')) ||
    cards.some(row => row.section === 'Commander' && !value.commanders.includes(row.name))) return null;
  const record = { schema: value.schema, id: value.id, name: value.name, commanders: value.commanders.slice(), cards };
  try {
    const bytes = encodeURIComponent(JSON.stringify(record)).replace(/%[A-F\d]{2}|./g, 'x').length;
    return bytes <= MAX_DECK_RECORD_BYTES ? record : null;
  } catch { return null; }
}

export function setup(playerIds = [], options = {}) {
  const playerCount = cleanPlayerCount(options.playerCount);
  const ids = Array.isArray(playerIds) ? playerIds.filter(Boolean).slice(0, playerCount) : [];
  const seats = Array.from({ length: playerCount }, (_, seat) => seatRecord(seat));
  ids.forEach((playerId, index) => {
    seats[index].playerId = String(playerId);
    seats[index].connected = true;
    seats[index].name = HUMAN_NAMES[index];
  });
  const views = Object.fromEntries(seats.map(seat => [seat.seat, null]));
  return {
    protocolVersion: PROTOCOL_VERSION,
    phase: 'lobby',
    revision: 0,
    seats,
    settings: {
      playerCount,
      seed: null,
      diplomacyEnabled: false,
      sumPartnerDamage: false,
    },
    views,
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
  return ids.length === state.seats.length && new Set(ids).size === state.seats.length;
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
    return seat ? { ok: true } : { ok: false, error: `This ${state.seats.length}-player room is full.` };
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
    if (action.deckRecord !== undefined && action.deckRecord !== null) {
      const record = cleanDeckRecord(action.deckRecord);
      if (!record) return { ok: false, error: 'That imported decklist could not be read.' };
      if (record.name !== cleanText(action.deckId, 120)) return { ok: false, error: 'The decklist does not match the chosen deck.' };
    }
    if (action.commanderNames !== undefined &&
      (!Array.isArray(action.commanderNames) || action.commanderNames.length > 2)) {
      return { ok: false, error: 'Choose one commander or a legal partner pair.' };
    }
    return { ok: true };
  }
  if (type === 'configureSettings') {
    if (state.phase !== 'lobby' || seat.seat !== 0) return { ok: false, error: 'Only the host configures room rules.' };
    if (typeof action.sumPartnerDamage !== 'boolean') return { ok: false, error: 'Invalid Commander damage setting.' };
    return { ok: true };
  }
  if (type === 'start') {
    if (state.phase !== 'lobby' || seat.seat !== 0) {
      return { ok: false, error: 'Only the host starts the game.' };
    }
    if (!state.seats.every(item => item.playerId && item.connected && item.ready)) {
      return { ok: false, error: `All ${state.seats.length} human players must be connected and ready.` };
    }
    if (!uniqueDecksReady(state)) return { ok: false, error: 'Every human seat needs a different deck.' };
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
    if (!state.seats.every(item => String(item.seat) in action.views)) {
      return { ok: false, error: 'Every human view is required.' };
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
    const targetSeat = state.seats[action.decision.seat];
    if (!targetSeat || targetSeat.seat === 0 || !targetSeat.connected || !isObject(action.decision.legal)) {
      return { ok: false, error: 'Decision must target a connected remote human seat.' };
    }
    if (byteSize(action.decision) > 500_000) {
      return { ok: false, error: 'Decision payload is too large.' };
    }
    return { ok: true };
  }
  if (type === 'decisionResponse') {
    if (!state.pendingDecision || seat.seat !== state.pendingDecision.seat) {
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
      !state.seats.every(item => item.connected)) {
      return { ok: false, error: 'Every player must reconnect before the host resumes.' };
    }
    return { ok: true };
  }
  if (type === 'finish') {
    if (seat.seat !== 0 || !['running', 'paused'].includes(state.phase)) {
      return { ok: false, error: 'Only the host can finish the game.' };
    }
    if (action.winnerSeat !== null && !state.seats.some(item => item.seat === action.winnerSeat)) {
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
    seat.deckRecord = cleanDeckRecord(action.deckRecord);
    seat.commanderNames = (action.commanderNames || [])
      .map(name => cleanText(name, 160)).filter(Boolean).slice(0, 2);
    seat.name = cleanText(action.name || seat.name, 32);
    seat.ready = action.ready !== false;
  } else if (type === 'configureSettings') {
    next.settings.sumPartnerDamage = action.sumPartnerDamage;
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
    next.views = Object.fromEntries(next.seats.map(item => [
      item.seat, clone(action.views[item.seat] ?? action.views[String(item.seat)]),
    ]));
  } else if (type === 'decisionRequest') {
    next.pendingDecision = clone(action.decision);
    next.lastDecision = null;
  } else if (type === 'decisionResponse') {
    next.lastDecision = { id: next.pendingDecision.id, response: clone(action.response), seat: seat.seat };
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
      deckImported: !!item.deckRecord,
      deckRecord: seatIndex === 0 || item.seat === seatIndex ? clone(item.deckRecord) : null,
      commanderNames: item.commanderNames,
      aiStyle: item.aiStyle,
    })),
    settings: clone(state.settings),
    gameView: seatIndex !== null ? clone(state.views[seatIndex]) : null,
    pendingDecision: state.pendingDecision && state.pendingDecision.seat === seatIndex ? clone(state.pendingDecision) : null,
    lastDecision: seatIndex === 0 ? clone(state.lastDecision) : null,
    pendingManualAction: seatIndex === 0 ? clone(state.pendingManualAction) : null,
    lastManualAction: state.lastManualAction && state.lastManualAction.seat === seatIndex ? clone(state.lastManualAction) : null,
    pause: clone(state.pause),
    winnerSeat: state.winnerSeat,
    lastEvent: clone(state.lastEvent),
  };
}
