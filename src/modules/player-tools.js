// Player preferences and presentation helpers. No game state is persisted here.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  U.readPreference = (key, fallback) => {
    try { return JSON.parse(globalThis.localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  };
  U.writePreference = (key, value) => {
    try { globalThis.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  };
  const choose = (value, values, fallback) => values.includes(value) ? value : fallback;
  U.playerPreferences = () => {
    const raw = U.readPreference('mtgPlayerPreferences', {}) || {};
    return {
      deckView: choose(raw.deckView, ['gallery', 'compact'], 'gallery'),
      deckSort: choose(raw.deckSort, ['name', 'recent', 'newest'], 'name'),
      handSort: choose(raw.handSort, ['draw', 'mana', 'type', 'name'], 'draw'),
      handSize: choose(raw.handSize, ['standard', 'large'], 'standard'),
      contrast: raw.contrast === true,
      speed: choose(raw.speed, ['normal', 'slow', 'fast'], 'normal'),
    };
  };
  U.savePlayerPreferences = changes => U.writePreference('mtgPlayerPreferences', { ...U.playerPreferences(), ...changes });
  U.recentDecks = () => {
    const raw = U.readPreference('mtgRecentDecks', []);
    return Array.isArray(raw) ? [...new Set(raw.filter(name => typeof name === 'string' && name.length < 160))].slice(0, 6) : [];
  };
  U.rememberDeck = name => {
    // Only built-ins appear in the shared-device recent shelf.
    if (!U.DECKS[name] || U.DECKS[name].custom) return;
    U.writePreference('mtgRecentDecks', [name, ...U.recentDecks().filter(item => item !== name)].slice(0, 6));
  };
  U.renderRecentShelf = (page, openDeck) => {
    page.querySelector('.returningplayer')?.remove();
    const names = U.recentDecks().filter(name => !U.DECKS || (U.DECKS[name] && !U.DECKS[name].custom)).slice(0, 3);
    if (!names.length) return;
    const shelf = document.createElement('section');
    shelf.className = 'returningplayer';
    shelf.setAttribute('aria-label', 'Recently played decks');
    const label = document.createElement('div');
    const title = document.createElement('b'); title.textContent = 'Another round?';
    const hint = document.createElement('span'); hint.textContent = 'Pick up a deck you know.';
    label.append(title, hint); shelf.appendChild(label);
    for (const name of names) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `${name} ↗`;
      button.onclick = () => openDeck(name);
      shelf.appendChild(button);
    }
    page.querySelector('.mainmenu-hero')?.after(shelf);
  };
  const podKey = () => `mtgSavedPods:${globalThis.MTGAccount?.user?.id || 'guest'}`;
  U.savedPods = () => {
    const raw = U.readPreference(podKey(), []);
    return Array.isArray(raw) ? raw.filter(pod => pod && typeof pod.name === 'string' && pod.setup && typeof pod.setup.deck === 'string').slice(0, 6) : [];
  };
  U.podSnapshot = state => ({
    deck: state.deck, commanders: Array.isArray(state.commanders) ? state.commanders.filter(name => typeof name === 'string').slice(0, 2) : [],
    ai: Math.max(1, Math.min(3, Math.trunc(Number(state.ai)) || 3)),
    aiDecks: Array.from({ length: 3 }, (_, i) => Array.isArray(state.aiDecks) && typeof state.aiDecks[i] === 'string' ? state.aiDecks[i].slice(0, 160) : ''),
    aiStyles: Array.from({ length: 3 }, (_, i) => Array.isArray(state.aiStyles) && typeof state.aiStyles[i] === 'string' ? state.aiStyles[i].slice(0, 160) : 'random'),
    difficulty: choose(state.difficulty, ['easy', 'normal', 'hard'], 'normal'),
    aiRandomCommanders: state.aiRandomCommanders === true,
    sumPartnerDamage: state.sumPartnerDamage === true,
    diplomacyEnabled: state.diplomacyEnabled === true,
  });
  U.savePod = (name, state) => {
    const label = String(name || '').trim().slice(0, 48);
    if (!label || !state.deck) return false;
    const existing = U.savedPods();
    if (existing.length >= 6 && !existing.some(pod => pod.name === label)) return false;
    return U.writePreference(podKey(), [{ name: label, setup: U.podSnapshot(state) },
      ...existing.filter(pod => pod.name !== label)]);
  };
  U.removePod = name => U.writePreference(podKey(), U.savedPods().filter(pod => pod.name !== name));

  U.deckManaCurve = deck => {
    const bins = Array(8).fill(0);
    let total = 0, spells = 0, lands = 0;
    for (const row of deck.cards || []) {
      const def = U.DEFS[row.name];
      if (!def) continue;
      const n = Number(row.n) || 1;
      if (def.types?.includes('Land')) { lands += n; continue; }
      const mv = Math.max(0, U.mv(def.cost || ''));
      bins[Math.min(7, Math.floor(mv))] += n;
      total += mv * n; spells += n;
    }
    return { bins, lands, spells, average: spells ? total / spells : 0 };
  };
  U.sortHandForDisplay = (cards, mode) => {
    const copy = cards.slice();
    const typeOrder = ['Land', 'Creature', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle', 'Instant', 'Sorcery'];
    const rank = card => { const i = typeOrder.findIndex(type => card.def.types?.includes(type)); return i < 0 ? 99 : i; };
    const mana = card => card.def.types?.includes('Land') ? -1 : Number(card.mv ?? U.mv(card.def.cost || ''));
    if (mode === 'name') copy.sort((a, b) => a.name.localeCompare(b.name));
    if (mode === 'mana') copy.sort((a, b) => mana(a) - mana(b) || a.name.localeCompare(b.name));
    if (mode === 'type') copy.sort((a, b) => rank(a) - rank(b) || mana(a) - mana(b) || a.name.localeCompare(b.name));
    return copy;
  };
  U.searchableCards = (game, viewer) => {
    const results = [], seen = new Set();
    const add = (cards, zone, owner) => {
      for (const card of cards || []) {
        // Face-down identity must never enter search text or an image URL.
        if (!card || seen.has(card) || (card.faceDown && card.ctrl !== viewer) ||
            (card.zone === 'exile' && (card.meta?.foretold || card.meta?.faceDown) && card.owner !== viewer)) continue;
        seen.add(card);
        results.push({ card, zone, owner, text: `${card.name} ${zone} ${(owner || card.ctrl || card.owner)?.name || ''} ${(card.def?.types || []).join(' ')}`.toLowerCase() });
      }
    };
    add(viewer?.hand, 'Your hand', viewer);
    add(game.bf(), 'Battlefield', null);
    for (const player of game.players) {
      add(player.command, 'Command zone', player);
      add(player.graveyard, 'Graveyard', player);
      add(player.exile, 'Exile', player);
    }
    add(game.stack.map(item => item.card), 'Stack', null);
    return results;
  };
})();
