// ===== oracle-catalog.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Oracle batches are generated from Scryfall's Oracle Cards bulk feed.  The
// registry keeps three concerns together without confusing them:
//   1. exact Oracle/raw data used by the rules engine,
//   2. an explicit, auditable engine implementation marker, and
//   3. searchable metadata that can later power the deckbuilder.
(function () {
  const batches = MTG.ORACLE_BATCHES = MTG.ORACLE_BATCHES || [];
  const registeredNames = new Map();

  MTG.registerOracleBatch = function (batch) {
    if (!batch || !batch.id || !Array.isArray(batch.cards)) {
      throw new Error('Oracle batch needs an id and cards array.');
    }
    if (batches.some(existing => existing.id === batch.id)) {
      throw new Error(`Duplicate Oracle batch id: ${batch.id}`);
    }

    for (const entry of batch.cards) {
      const name = entry && entry.raw && entry.raw.name;
      if (!name || !entry.oracleId || !entry.semanticClass) {
        throw new Error(`${batch.id}: every Oracle card needs name, oracleId, and semanticClass.`);
      }
      if (registeredNames.has(name)) {
        throw new Error(`${name} is already registered by ${registeredNames.get(name)}.`);
      }
      if (MTG.SCRIPTS[name]) {
        throw new Error(`${name} already has a manual engine script; Oracle batches never overwrite it.`);
      }

      registeredNames.set(name, batch.id);
      MTG.SCRIPTS[name] = {
        oracleBatch: batch.id,
        oracleId: entry.oracleId,
        oracleImplemented: true,
        semanticClass: entry.semanticClass,
        implementedKeywords: (entry.implementedKeywords || []).slice(),
      };
    }

    batches.push(batch);
  };

  MTG.applyOracleBatches = function (rawDB) {
    if (!rawDB || !rawDB.cards) throw new Error('Oracle batches need MTG raw card data.');
    const applied = new Set(rawDB.oracleBatches || []);
    for (const batch of batches) {
      for (const entry of batch.cards) {
        const raw = entry.raw;
        const existing = rawDB.cards[raw.name];
        if (existing) {
          if (existing._oracleId === entry.oracleId) continue;
          throw new Error(`${batch.id}: ${raw.name} collides with an existing raw definition.`);
        }
        rawDB.cards[raw.name] = Object.assign({}, raw, {
          _oracleBatch: batch.id,
          _oracleId: entry.oracleId,
          _scryfallId: entry.scryfallId,
        });
      }
      applied.add(batch.id);
    }
    rawDB.oracleBatches = [...applied];
    return rawDB;
  };

  function typeLine(raw) {
    const left = [...(raw.super || []), ...(raw.types || [])].join(' ');
    return `${left}${(raw.subtypes || []).length ? ` — ${raw.subtypes.join(' ')}` : ''}`;
  }

  MTG.buildCardCatalog = function (rawDB, defs) {
    const imported = new Map();
    for (const batch of batches) {
      for (const entry of batch.cards) imported.set(entry.raw.name, { batch, entry });
    }

    const catalog = {};
    for (const [name, raw] of Object.entries(rawDB.cards || {})) {
      const found = imported.get(name);
      const def = defs && defs[name];
      const metadata = found ? found.entry.catalog || {} : {};
      catalog[name] = Object.assign({
        name,
        oracleId: raw._oracleId || null,
        scryfallId: raw._scryfallId || null,
        manaCost: raw.cost || '',
        typeLine: metadata.typeLine || typeLine(raw),
        oracleText: raw.oracle || '',
        colorIdentity: metadata.colorIdentity || (MTG.cardColorIdentity && def ? MTG.cardColorIdentity(def) : raw._ci || []),
        keywords: metadata.keywords || [],
        commanderLegality: metadata.commanderLegality || null,
        set: metadata.set || null,
        setName: metadata.setName || null,
        collectorNumber: metadata.collectorNumber || null,
        rarity: metadata.rarity || null,
        releasedAt: metadata.releasedAt || null,
        engineStatus: found ? 'certified' : 'certified-legacy',
        engineBatch: found ? found.batch.id : null,
        semanticClass: found ? found.entry.semanticClass : 'manual',
        implementedKeywords: found ? (found.entry.implementedKeywords || []).slice() : [],
      }, metadata);
    }
    MTG.CARD_CATALOG = catalog;
    return catalog;
  };
})();
