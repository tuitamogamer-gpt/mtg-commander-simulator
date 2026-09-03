'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

(function () {
  const ACK_TYPES = new Set(['threatAlert', 'cardReveal', 'combatReview', 'effectReview', 'manualResolve', 'diplomacyReview']);
  const CARD_LIST_TYPES = new Set(['bottomCards', 'chooseCards', 'chooseTargets']);
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 300);
  const assert = (condition, message) => { if (!condition) throw new Error(`Saved game: ${message}`); };
  const listFor = (q, player, type = q.type) => type === 'bottomCards' ? player?.hand || []
    : type === 'chooseCards' ? q.from || [] : q.candidates || [];
  const indexOf = (values, value, label) => {
    const index = values.indexOf(value);
    assert(index >= 0, `${label} is no longer in the legal choice list.`);
    return index;
  };
  const at = (values, index, label) => {
    assert(Number.isInteger(index) && index >= 0 && index < values.length, `${label} no longer matches this game build.`);
    return values[index];
  };

  function decisionShape(q, player) {
    const shape = { type: clean(q.type), prompt: clean(q.prompt) };
    if (CARD_LIST_TYPES.has(q.type)) shape.count = listFor(q, player).length;
    else if (q.type === 'chooseOption' || q.type === 'chooseMulti') shape.options = (q.options || []).map(option => String(option.key));
    else if (q.type === 'chooseX') { shape.min = Number(q.min); shape.max = Number(q.max); shape.values = Array.isArray(q.values) ? q.values.slice() : null; }
    else if (q.type === 'chooseManaSources') shape.count = (q.candidates || []).length;
    else if (q.type === 'orderTriggers') shape.count = (q.triggers || []).length;
    else if (q.type === 'scry') shape.count = (q.cards || []).length;
    else if (q.type === 'attackers') { shape.left = (q.eligible || []).length; shape.right = (q.attackTargets || q.opponents || []).length; }
    else if (q.type === 'blockers') { shape.left = (q.potential || []).length; shape.right = (q.attackers || []).length; }
    else if (q.type === 'main' || q.type === 'priority') {
      shape.casts = (q.casts || []).length; shape.acts = (q.acts || []).length; shape.lands = (q.lands || []).length;
    }
    return shape;
  }

  function shapesMatch(saved, current) {
    if (!saved || saved.type !== current.type) return false;
    const keys = new Set([...Object.keys(saved), ...Object.keys(current)]);
    keys.delete('prompt');
    for (const key of keys) if (JSON.stringify(saved[key]) !== JSON.stringify(current[key])) return false;
    return true;
  }

  function portableResponse(q, player, result) {
    if (ACK_TYPES.has(q.type)) return { kind: 'ack' };
    if (q.type === 'mulligan') return { kind: 'boolean', value: !!result };
    if (q.type === 'chooseOption') return { kind: 'option', value: String(result) };
    if (q.type === 'chooseMulti') return { kind: 'options', values: (result || []).map(String) };
    if (q.type === 'chooseX') return { kind: 'number', value: Number(result) };
    if (CARD_LIST_TYPES.has(q.type)) {
      const values = listFor(q, player);
      return { kind: 'indexes', values: (result || []).map(value => indexOf(values, value, q.type)) };
    }
    if (q.type === 'chooseManaSources') {
      if (result && result.auto) return { kind: 'mana-auto' };
      const values = q.candidates || [];
      return { kind: 'mana-indexes', values: (result?.cards || []).map(value => indexOf(values, value, 'mana source')) };
    }
    if (q.type === 'orderTriggers') {
      const values = q.triggers || [];
      return { kind: 'indexes', values: (result || []).map(value => indexOf(values, value, 'trigger')) };
    }
    if (q.type === 'scry') {
      const values = q.cards || [];
      return {
        kind: 'scry',
        top: (result?.top || []).map(value => indexOf(values, value, 'scry card')),
        bottom: (result?.bottom || []).map(value => indexOf(values, value, 'scry card')),
      };
    }
    if (q.type === 'attackers') {
      const left = q.eligible || [];
      const right = q.attackTargets || q.opponents || [];
      return { kind: 'assignments', values: (result || []).map(item => ({ left: indexOf(left, item.card, 'attacker'), right: indexOf(right, item.target, 'attack target') })) };
    }
    if (q.type === 'blockers') {
      const left = q.potential || [];
      const right = q.attackers || [];
      return { kind: 'assignments', values: (result || []).map(item => ({ left: indexOf(left, item.blocker, 'blocker'), right: indexOf(right, item.attacker, 'blocked attacker') })) };
    }
    if (q.type === 'main' || q.type === 'priority') {
      if (!result || result.kind === 'pass') return { kind: 'action', action: 'pass' };
      if (result.kind === 'done') return { kind: 'action', action: 'done' };
      if (result.kind === 'cast') return { kind: 'action-index', action: 'cast', index: indexOf(q.casts || [], (q.casts || []).find(entry => entry.card === result.card && entry.alt === result.alt && entry.from === result.from) || result, 'spell action') };
      if (result.kind === 'activate') return { kind: 'action-index', action: 'activate', index: indexOf(q.acts || [], result.entry, 'activated ability') };
      if (result.kind === 'land') return { kind: 'action-index', action: 'land', index: indexOf(q.lands || [], result.card, 'land action') };
    }
    assert(result === null || ['string', 'number', 'boolean'].includes(typeof result), `decision type ${q.type} is not portable.`);
    return { kind: 'primitive', value: result };
  }

  function restoreResponse(q, player, record) {
    const response = record.response || {};
    if (response.kind === 'ack') return null;
    if (response.kind === 'boolean' || response.kind === 'option' || response.kind === 'number' || response.kind === 'primitive') return response.value;
    if (response.kind === 'options') {
      const legal = new Set((q.options || []).map(option => String(option.key)));
      assert(response.values.every(value => legal.has(String(value))), 'a recorded option is no longer legal.');
      return response.values.map(String);
    }
    if (response.kind === 'indexes') {
      const values = q.type === 'orderTriggers' ? q.triggers || [] : listFor(q, player);
      return response.values.map(index => at(values, index, q.type));
    }
    if (response.kind === 'mana-auto') return { auto: true };
    if (response.kind === 'mana-indexes') return { cards: response.values.map(index => at(q.candidates || [], index, 'mana source')) };
    if (response.kind === 'scry') {
      const values = q.cards || [];
      return { top: response.top.map(index => at(values, index, 'scry top')), bottom: response.bottom.map(index => at(values, index, 'scry bottom')) };
    }
    if (response.kind === 'assignments' && q.type === 'attackers') {
      const left = q.eligible || [], right = q.attackTargets || q.opponents || [];
      return response.values.map(item => ({ card: at(left, item.left, 'attacker'), target: at(right, item.right, 'attack target') }));
    }
    if (response.kind === 'assignments' && q.type === 'blockers') {
      const left = q.potential || [], right = q.attackers || [];
      return response.values.map(item => ({ blocker: at(left, item.left, 'blocker'), attacker: at(right, item.right, 'blocked attacker') }));
    }
    if (response.kind === 'action') return { kind: response.action };
    if (response.kind === 'action-index') {
      if (response.action === 'cast') {
        const entry = at(q.casts || [], response.index, 'spell action');
        return { kind: 'cast', card: entry.card, alt: entry.alt, from: entry.from };
      }
      if (response.action === 'activate') return { kind: 'activate', entry: at(q.acts || [], response.index, 'activated ability') };
      if (response.action === 'land') return { kind: 'land', card: at(q.lands || [], response.index, 'land action') };
    }
    assert(false, `recorded ${q.type} response is invalid.`);
  }

  MTG.recordSaveDecision = function (q, player, result) {
    return { shape: decisionShape(q, player), response: portableResponse(q, player, result) };
  };

  MTG.restoreSaveDecision = function (q, player, record) {
    const current = decisionShape(q, player);
    assert(shapesMatch(record?.shape, current), `decision ${current.type} no longer matches this version.`);
    return restoreResponse(q, player, record);
  };

  function ownedCards(game, owner) {
    const zones = ['library', 'hand', 'graveyard', 'exile', 'command'];
    return zones.flatMap(zone => owner[zone] || []).concat((game.battlefield || []).filter(card => card.owner === owner))
      .filter((card, index, all) => card && all.indexOf(card) === index)
      .sort((a, b) => a.iid - b.iid);
  }

  function portableCardRef(game, card) {
    assert(card && card.owner, 'a manual correction references an unknown card.');
    const matches = ownedCards(game, card.owner).filter(candidate => candidate.name === card.name);
    return { owner: card.owner.onlineSeat ?? card.owner.idx, name: card.name, occurrence: matches.indexOf(card) };
  }

  function restoreCardRef(game, ref) {
    const owner = game.players.find(player => (player.onlineSeat ?? player.idx) === Number(ref.owner));
    assert(owner, 'a corrected card owner no longer exists.');
    const card = ownedCards(game, owner).filter(candidate => candidate.name === ref.name)[Number(ref.occurrence)];
    assert(card, `corrected card ${ref.name} no longer matches this game build.`);
    return card;
  }

  MTG.portableAccountSideAction = function (game, player, entry) {
    assert(game && player && entry && entry.type, 'side action is invalid.');
    if (entry.type === 'lastResort') {
      const action = JSON.parse(JSON.stringify(entry.action || {}));
      let cardRef = null;
      if (action.cardToken) {
        const match = /^c:(-?\d+)$/.exec(String(action.cardToken));
        const card = match ? game.byIid(Number(match[1])) : null;
        cardRef = portableCardRef(game, card);
        delete action.cardToken;
      }
      return { type: entry.type, action, cardRef };
    }
    if (entry.type === 'diplomacyOffer') return {
      type: entry.type, toSeat: Number(entry.toSeat), requestKey: String(entry.requestKey), offerKey: String(entry.offerKey),
    };
    if (entry.type === 'diplomacyLastStand') return {
      type: entry.type, toSeat: Number(entry.toSeat), requestKey: String(entry.requestKey), offerKey: String(entry.offerKey),
    };
    if (entry.type === 'groupDiplomacy') return { type: entry.type, optionKey: String(entry.optionKey) };
    if (entry.type === 'diplomacyResponse') return { type: entry.type, proposalId: Number(entry.proposalId), accept: !!entry.accept };
    assert(false, `side action ${entry.type} is unsupported.`);
  };

  MTG.replayAccountSideAction = async function (game, player, saved) {
    assert(saved && saved.type, 'recorded side action is invalid.');
    if (saved.type === 'lastResort') {
      const action = JSON.parse(JSON.stringify(saved.action || {}));
      if (saved.cardRef) action.cardToken = `c:${restoreCardRef(game, saved.cardRef).iid}`;
      return game.applyLastResortAction(player, action);
    }
    if (saved.type === 'diplomacyOffer') {
      const to = game.players.find(candidate => (candidate.onlineSeat ?? candidate.idx) === saved.toSeat);
      assert(to, 'diplomacy recipient no longer exists.');
      const result = game.proposeDiplomacy(player, to, saved.requestKey, saved.offerKey);
      if (game.reviewDiplomacyWithHuman) await game.reviewDiplomacyWithHuman({
        source: 'human-offer', status: result.status, proposal: result.proposal || null,
        contract: result.contract || null, reason: result.reason || '',
      });
      return result;
    }
    if (saved.type === 'diplomacyLastStand') {
      const to = game.players.find(candidate => (candidate.onlineSeat ?? candidate.idx) === saved.toSeat);
      assert(to, 'diplomacy recipient no longer exists.');
      const result = game.proposeLastStandDiplomacy(player, to, saved.requestKey, saved.offerKey);
      if (game.reviewDiplomacyWithHuman) await game.reviewDiplomacyWithHuman({
        source: 'human-last-stand', status: result.status, proposal: result.proposal || null,
        contract: result.contract || null, reason: result.reason || '',
      });
      return result;
    }
    if (saved.type === 'groupDiplomacy') {
      const result = game.proposeGroupRemovalDiplomacy(player, saved.optionKey);
      if (game.reviewDiplomacyWithHuman) await game.reviewDiplomacyWithHuman({
        source: 'human-offer', status: result.status, proposal: result.proposal || null,
        contract: result.contract || null, reason: result.reason || '',
      });
      return result;
    }
    if (saved.type === 'diplomacyResponse') return game.respondToDiplomacyProposal(saved.proposalId, saved.accept, player);
    assert(false, `recorded side action ${saved.type} is unsupported.`);
  };

  function importedDeckRecords(setup) {
    const names = [setup.deck, ...(setup.aiDecks || [])].filter(Boolean);
    const records = [];
    const seen = new Set();
    for (const name of names) {
      if (seen.has(name) || !MTG.DECKS?.[name]?.custom) continue;
      seen.add(name);
      const record = MTG.importedDeckRecordFor?.(name);
      if (record) records.push(record);
    }
    return records;
  }

  MTG.buildAccountSave = function (game, setup, decisions, matchId, state) {
    assert(game && setup && matchId, 'cannot build a checkpoint without a running match.');
    return {
      // A written-down board. Restoring it needs no replay and does not care
      // whether the rules engine or the AI changed since the save. The recorded
      // timeline below stays as a fallback for saves made before this existed.
      state: state || null,
      schema: 'commander-save/v1',
      mode: 'solo',
      matchId,
      createdAt: setup.createdAt || new Date().toISOString(),
      setup: {
        deck: setup.deck,
        commanders: (setup.commanders || []).slice(0, 2),
        ai: setup.ai,
        aiDecks: (setup.aiDecks || []).slice(0, 3),
        aiStyles: (setup.aiStyles || []).slice(0, 3),
        aiCustomSkills: MTG.snapshotAISkills(setup.aiStyles),
        aiRandomCommanders: !!setup.aiRandomCommanders,
        sumPartnerDamage: !!setup.sumPartnerDamage,
        diplomacyEnabled: !!setup.diplomacyEnabled,
        difficulty: setup.difficulty || 'normal',
        manaMode: setup.manaMode === 'manual' ? 'manual' : 'auto',
        prioMode: setup.prioMode || 'end',
        seed: String(setup.seed),
        // Imported decks live only in the library that owns them. A checkpoint
        // that uses one carries the list itself, so Continue can rebuild the
        // match even from a browser where the deck was never saved.
        importedDecks: importedDeckRecords(setup),
      },
      decisions: decisions.slice(),
      summary: {
        deck: setup.deck,
        commanders: (setup.commanders || []).slice(0, 2),
        turn: game.turnNo || 0,
        decisionCount: decisions.length,
      },
    };
  };

  function adoptSavedImportedDecks(save) {
    const records = Array.isArray(save.setup?.importedDecks) ? save.setup.importedDecks.slice(0, 4) : [];
    const failures = [];
    for (const record of records) {
      const name = record && record.name;
      if (!name || MTG.DECKS?.[name]) continue;
      const result = MTG.adoptImportedDeckRecord?.(record) || { ok: false, error: 'decklists cannot be read in this build.' };
      if (!result.ok) failures.push(`${name}: ${result.error}`);
    }
    return failures.length ? ` (${failures.join('; ')})` : '';
  }

  MTG.validateAccountSave = function (save) {
    assert(save && save.schema === 'commander-save/v1' && save.mode === 'solo', 'unsupported checkpoint format.');
    assert(save.setup && typeof save.setup === 'object', 'setup settings are missing.');
    // Imported decks carried by the checkpoint are registered first: after that
    // every seat is checked the same way, built-in or not.
    const adopted = adoptSavedImportedDecks(save);
    assert(MTG.DECKS?.[save.setup.deck], `the saved human deck is unavailable.${adopted}`);
    assert(Array.isArray(save.setup.aiDecks) && save.setup.aiDecks.length >= 1 && save.setup.aiDecks.length <= 3, 'AI seats are invalid.');
    assert(save.setup.aiDecks.every(name => MTG.DECKS?.[name]), `a saved AI deck is unavailable.${adopted}`);
    assert(new Set([save.setup.deck, ...save.setup.aiDecks]).size === save.setup.aiDecks.length + 1, 'saved decks must remain unique.');
    assert(Array.isArray(save.decisions) && save.decisions.length <= 5000, 'decision history is invalid.');
    if (save.state) assert(save.state.format >= 2 && Array.isArray(save.state.cards) && Array.isArray(save.state.players),
      'the saved board is not readable by this build.');
    MTG.validateAISkillSetup(save.setup.aiStyles || [], save.setup.aiCustomSkills || []);
    return save;
  };
})();
