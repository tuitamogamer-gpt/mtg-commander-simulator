const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
export const MAX_IMPORTED_DECKS = 40;

export function emptyProfile() {
  return { gamesPlayed: 0, wins: 0, losses: 0, lifetimeScore: 0 };
}

export function completedMatchSaveError() {
  return Object.assign(new Error('This match has already finished. Start a new Solo game to save again.'), {
    status: 409, code: 'MATCH_ALREADY_COMPLETED',
  });
}

export function normalizedProfile(raw = {}) {
  const number = key => Math.max(0, Number(raw[key]) || 0);
  const gamesPlayed = number('gamesPlayed');
  const wins = number('wins');
  return {
    gamesPlayed,
    wins,
    losses: number('losses'),
    lifetimeScore: number('lifetimeScore'),
    winRate: gamesPlayed ? Math.round((wins / gamesPlayed) * 100) : 0,
  };
}

export function importedDeckError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function importedDeckNameKey(value) {
  return String(value || '').toLowerCase();
}

export function publicStoredDeck(value) {
  const deck = clone(value);
  if (deck && typeof deck === 'object') {
    delete deck._libraryNameKey;
    // Older Redis writes re-encoded the whole record with cjson. Recover only
    // empty containers at schema-defined map/list positions; leave nonempty
    // invalid values for the ordinary validators to inspect.
    const auxiliary = deck.auxiliaryV87;
    if (auxiliary && typeof auxiliary === 'object' && !Array.isArray(auxiliary)) {
      const repairEmptyList = (record, key) => {
        const value = record[key];
        if (value && typeof value === 'object' && !Array.isArray(value)
          && Object.keys(value).length === 0) record[key] = [];
      };
      for (const key of ['attractions', 'stickers', 'outsideGame']) repairEmptyList(auxiliary, key);
      for (const key of ['colors', 'draft']) {
        if (Array.isArray(auxiliary[key]) && auxiliary[key].length === 0) auxiliary[key] = {};
      }
      if (auxiliary.colors && typeof auxiliary.colors === 'object' && !Array.isArray(auxiliary.colors)) {
        for (const name of Object.keys(auxiliary.colors)) repairEmptyList(auxiliary.colors, name);
      }
      if (auxiliary.draft && typeof auxiliary.draft === 'object' && !Array.isArray(auxiliary.draft)) {
        for (const [name, note] of Object.entries(auxiliary.draft)) {
          if (['palianoColors', 'automatonCounts', 'trackerPlayers'].includes(name)) {
            repairEmptyList(auxiliary.draft, name);
          } else if (Array.isArray(note) && note.length === 0) {
            auxiliary.draft[name] = {};
          } else if (note && typeof note === 'object' && !Array.isArray(note)) {
            for (const key of ['names', 'types', 'keywords', 'removed', 'exiled', 'exiledCards', 'colors', 'numbers'])
              repairEmptyList(note, key);
          }
        }
      }
    }
  }
  return deck;
}

export function storedImportedDeck(deck, existing = null, now = new Date().toISOString()) {
  const existingCreatedAt = existing && Number.isFinite(new Date(existing.createdAt).getTime()) ? existing.createdAt : null;
  return {
    ...clone(deck),
    revision: existing ? Math.max(0, Number(existing.revision) || 0) + 1 : 1,
    createdAt: existingCreatedAt || now,
    updatedAt: now,
  };
}

export function assertImportedDeckLibraryInvariants(savedDecks, deck, existing = null) {
  const rows = [...savedDecks];
  if (!existing && rows.length >= MAX_IMPORTED_DECKS)
    throw importedDeckError(`Your imported deck library can contain up to ${MAX_IMPORTED_DECKS} decks.`, 409);
  const nameKey = importedDeckNameKey(deck.name);
  if (rows.some(saved => saved.id !== deck.id && importedDeckNameKey(saved.name) === nameKey))
    throw importedDeckError('An imported deck with that name is already in your library.', 409);
}
