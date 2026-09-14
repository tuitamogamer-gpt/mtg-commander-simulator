// Catalog browsing stays independent of the DOM and of the selected game seat.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  MTG.deckSearchText = value => String(value || '').normalize('NFD')
    .replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  MTG.deckExplorerRecord = (name, deck, meta = {}, commanders = [deck.commander]) => ({
    name, commanders,
    year: ((meta.set || '').match(/\b20\d{2}\b/) || [''])[0],
    colors: (meta.colors || deck.colors || []).filter(color => ['W', 'U', 'B', 'R', 'G'].includes(color)),
    strategy: MTG.deckStrategy(meta.style),
    searchText: MTG.deckSearchText([name, ...commanders, meta.set, meta.style, meta.blurb].join(' ')),
  });

  MTG.browseDecks = (catalog, filters = {}, recents = [], pageSize = 24) => {
    const words = MTG.deckSearchText(filters.search).split(/\s+/).filter(Boolean);
    const favorites = filters.favorites || new Set();
    const matches = catalog.filter(entry =>
      words.every(word => entry.searchText.includes(word)) &&
      (!filters.color || filters.color === 'all' || (filters.color === 'C' ? !entry.colors.length : entry.colors.includes(filters.color))) &&
      (!filters.strategy || filters.strategy === 'all' || entry.strategy === filters.strategy) &&
      (!filters.year || filters.year === 'all' || entry.year === filters.year) &&
      (!filters.favoritesOnly || favorites.has(entry.name))
    ).sort((a, b) => {
      if (filters.deckSort === 'newest') return Number(b.year) - Number(a.year) || a.name.localeCompare(b.name);
      if (filters.deckSort === 'recent') {
        const rank = name => recents.includes(name) ? recents.indexOf(name) : recents.length;
        return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    const page = Math.max(1, Math.min(pages, Math.floor(Number(filters.deckPage) || 1)));
    const offset = (page - 1) * pageSize;
    return { matches, page, pages, total: matches.length, start: matches.length ? offset + 1 : 0,
      end: Math.min(offset + pageSize, matches.length), entries: matches.slice(offset, offset + pageSize) };
  };
})();
