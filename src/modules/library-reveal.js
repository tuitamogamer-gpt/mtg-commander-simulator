// Public library effects advance only after each human has reviewed the card.
// These acknowledgements stay inside resolution; they never grant priority.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const G = MTG.Game.prototype;
  const contexts = new WeakMap();
  const active = game => game.paced && !game.gameOver && game.reviewHumans().length;

  function context(game) {
    const frame = game._resolutionRecap;
    if (frame && contexts.has(frame)) return contexts.get(frame);
    const state = {started: false, cards: [], seen: new Map()};
    if (frame) contexts.set(frame, state);
    return state;
  }

  function details(game, payload, owner) {
    const frame = game._resolutionRecap;
    return {
      ctrl: payload.ctrl || frame?.actor || owner,
      title: payload.title || payload.source?.name || frame?.name || frame?.sourceCard?.name || 'Library reveal',
      libraryOwner: owner,
      revealAction: payload.action || 'reveal',
    };
  }

  async function checkpoint(game, state, info, card = null) {
    if (!active(game)) return;
    // Never attach the unturned card, the remaining pile, or an AI hint to the
    // initial question. Live play serializes these questions for other seats.
    const q = {...info, type: 'cardReveal', kind: 'reveal', libraryReveal: true,
      revealStage: card ? 'card' : 'start', cards: state.cards.slice(),
      prompt: card ? `${card.name} · ${card.owner?.name || info.libraryOwner?.name || ''}. Continue when ready.`
        : `${info.libraryOwner?.name || 'The player'}: ${info.revealAction === 'exile' ? 'exile' : 'reveal'} cards from the library one at a time.`};
    if (card) q.card = card;
    for (const player of game.reviewHumans()) {
      if (game.gameOver) break;
      await player.controller.decide(game, {...q, player, cards: q.cards.slice()});
    }
  }

  async function start(game, state, info) {
    if (state.started) return;
    state.started = true;
    await checkpoint(game, state, info);
  }

  async function show(game, state, info, card) {
    if (!card || card.faceDown || state.seen.get(card) === card.zoneVersion) return;
    state.seen.set(card, card.zoneVersion);
    state.cards.push(card);
    MTG.ResolutionRecap?.publicReveal(game, card, info.ctrl);
    await checkpoint(game, state, info, card);
  }

  const move = G.move;
  G.move = async function (card, destination, opts = {}) {
    // Scripts explicitly mark public top-library exiles. Searches, private
    // looks and face-down exile must never be inferred from a zone change.
    if (!opts.revealFromLibrary || destination !== 'exile' || card.zone !== 'library' ||
        card.faceDown || opts.exileFaceDown || !active(this)) return move.call(this, card, destination, opts);
    const state = context(this);
    const info = details(this, {ctrl: opts.revealController, source: opts.revealSource, action: 'exile'}, card.owner);
    const version = card.zoneVersion;
    await start(this, state, info);
    if (card.zone !== 'library' || card.zoneVersion !== version) return card;
    const result = await move.call(this, card, destination, opts);
    if (card.zone === 'exile' && !card.faceDown) await show(this, state, info, card);
    return result;
  };

  const reveal = G.revealToHuman;
  G.revealToHuman = async function (payload) {
    const cards = (payload.cards || []).filter(card => card && !card.faceDown);
    if (payload.kind === 'reveal') {
      if (!cards.length) return null;
      payload = {...payload, cards};
    }
    const frame = this._resolutionRecap;
    const searched = frame && cards.length && cards.every(card =>
      [...frame.searches.values()].some(found => found.has(card)));
    const fromLibrary = cards.some(card => card.zone === 'library' || card.zone === 'exile');
    if (payload.kind !== 'reveal' || !fromLibrary || searched || !active(this)) {
      return reveal.call(this, payload);
    }
    const state = context(this);
    const unseen = cards.filter(card => state.seen.get(card) !== card.zoneVersion);
    if (!unseen.length) return null;
    const info = details(this, payload, unseen[0].owner);
    await start(this, state, info);
    for (const card of unseen) {
      await show(this, state, {...info, libraryOwner: card.owner}, card);
    }
    return null;
  };
})();
