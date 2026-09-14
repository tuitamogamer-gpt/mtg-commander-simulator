// Public, post-resolution checkpoints. Presentation never changes a rules result.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const G = MTG.Game.prototype;
  const cardView = card => card ? {
    name: card.faceDown ? 'Face-down card' : card.name,
    faceDown: !!card.faceDown,
    types: card.faceDown ? [] : (card.cur?.types || card.def?.types || []).slice(),
  } : null;
  const publicName = object => object instanceof MTG.CardInst ? cardView(object).name : object?.name || 'Effect';
  const zoneName = zone => ({battlefield: 'battlefield', hand: 'hand', library: 'library',
    graveyard: 'graveyard', exile: 'exile', command: 'command zone', ceased: 'left the game'})[zone] || zone;

  function begin(game, source, name, controller, combat = false) {
    if (!game.paced || game._resolutionRecap || !game.reviewHumans().length) return null;
    const frame = {
      source: cardView(source), name, controller: controller?.name || '', combat,
      humans: game.reviewHumans(), details: [], searches: new Map(), revealed: new Set(),
      damage: [], prevented: [], damagedPermanents: new Set(), force: source?.name === 'Chaos Warp',
      battlefield: new Map(game.bf().map(card => [card, {
        card: cardView(card), version: card.zoneVersion, controller: card.ctrl,
      }])),
      players: game.players.map(player => ({player, life: player.life, poison: player.poison || 0,
        hand: player.hand.length, lost: player.lost})),
    };
    // Runtime-only context must not become part of a save or an AI state clone.
    Object.defineProperty(game, '_resolutionRecap', {value: frame, writable: true, configurable: true});
    return frame;
  }

  function search(frame, player) {
    if (!frame.searches.has(player)) frame.searches.set(player, new Map());
    return frame.searches.get(player);
  }

  MTG.ResolutionRecap = {
    choice(game, player, q, answer) {
      const frame = game._resolutionRecap;
      if (!frame || q.type !== 'chooseCards' || !Array.isArray(answer)) return;
      const libraryChoice = (q.from || []).some(card => card?.zone === 'library');
      if (!q.search && !(libraryChoice && /search|tutor|fetch/i.test(q.prompt || q.aiHint?.kind || ''))) return;
      const found = search(frame, player);
      for (const card of answer) if (card instanceof MTG.CardInst && card.zone === 'library') {
        found.set(card, {revealed: !!q.revealSearch});
      }
    },
  };

  G.recordResolutionDetail = function (text, card = null) {
    if (this._resolutionRecap) this._resolutionRecap.details.push({text, card: cardView(card)});
  };

  const note = G.note;
  const log = G.lg;
  G.lg = function (text, cls) {
    if (this._resolutionRecap && /fizzles|all targets are illegal/.test(text)) this.recordResolutionDetail(text);
    return log.call(this, text, cls);
  };
  G.note = function (type, data = {}) {
    const frame = this._resolutionRecap;
    if (frame && type === 'gameEffect') {
      if (data.kind === 'damage' || data.kind === 'damagePrevented') {
        if (data.kind === 'damage' && data.target instanceof MTG.CardInst) frame.damagedPermanents.add(data.target);
        const row = {text: `${publicName(data.source)} → ${publicName(data.target)}: ${data.amount} ${data.kind === 'damage' ? 'damage dealt' : 'damage prevented'}.`,
          amount: Number(data.amount) || 0, card: cardView(data.source)};
        (data.kind === 'damage' ? frame.damage : frame.prevented).push(row);
      }
      if (data.kind === 'boardWipe' || data.kind === 'counterspell') frame.force = true;
      if (data.kind === 'boardWipe') frame.boardWipe = true;
      if (data.kind === 'counterspell') frame.details.push({text: `${data.stackObject?.name || 'Spell'} was countered.`});
    }
    return note.call(this, type, data);
  };

  const emit = G.emit;
  G.emit = function (name, data) {
    if (name === 'searchedLibrary' && this._resolutionRecap && data?.player) search(this._resolutionRecap, data.player);
    return emit.call(this, name, data);
  };

  const reveal = G.revealToHuman;
  const globalReview = G.reviewGlobalEffectWithHuman;
  G.reviewGlobalEffectWithHuman = function (payload) {
    if (this._resolutionRecap) this._resolutionRecap.force = true;
    return globalReview.call(this, payload);
  };
  G.revealToHuman = function (payload) {
    const frame = this._resolutionRecap;
    if (frame && payload.kind !== 'look') {
      for (const card of payload.cards || []) if (!card.faceDown) frame.revealed.add(card);
      // Aggregate entries/search reveals after all instructions and state-based
      // actions. Looks and other mid-effect choices retain their own decisions.
      if (['enters', 'tokens'].includes(payload.kind)) {
        if ((payload.cards || []).some(card => !card.is('Land')) && frame.humans.some(p => p !== payload.ctrl)) frame.force = true;
        return Promise.resolve(null);
      }
      if (payload.kind === 'reveal' && frame.searches.size) return Promise.resolve(null);
    }
    return reveal.call(this, payload);
  };

  async function finish(game, frame) {
    if (!frame || game._resolutionRecap !== frame) return;
    game._resolutionRecap = null;
    const changes = [];
    const departed = [...frame.battlefield].filter(([card, before]) => card.zone !== 'battlefield' || card.zoneVersion !== before.version);
    const entered = game.bf().filter(card => !frame.battlefield.has(card) || frame.battlefield.get(card).version !== card.zoneVersion);
    for (const [card, before] of departed) changes.push({card: before.card,
      text: `${before.card.name} · ${before.controller.name}: ${card.zone === 'battlefield' ? 'left and returned to the battlefield' : 'battlefield → ' + zoneName(card.zone)}.`});
    for (const card of entered) changes.push({card: cardView(card), text: `${publicName(card)} · ${card.ctrl.name}: entered the battlefield${card.tapped ? ' tapped' : ''}.`});
    for (const card of frame.damagedPermanents) if (card.zone === 'battlefield') changes.push({card: cardView(card),
      text: `${publicName(card)} remained on the battlefield${card.kw('indestructible') ? ' with indestructible' : ''}${card.damage ? `, with ${card.damage} damage marked` : ''}.`});
    for (const [card, before] of frame.battlefield) if (card.zone === 'battlefield' && card.ctrl !== before.controller) {
      changes.push({card: cardView(card), text: `${publicName(card)}: ${before.controller.name} → controlled by ${card.ctrl.name}.`});
    }
    const players = frame.players.filter(before => before.life !== before.player.life || before.poison !== (before.player.poison || 0) || before.lost !== before.player.lost || before.hand !== before.player.hand.length)
      .map(before => ({name: before.player.name, before: before.life, after: before.player.life,
        poisonBefore: before.poison, poisonAfter: before.player.poison || 0,
        handBefore: before.hand, handAfter: before.player.hand.length, eliminated: !before.lost && before.player.lost}));
    const damage = frame.damage.reduce((n, row) => n + row.amount, 0);
    const prevented = frame.prevented.reduce((n, row) => n + row.amount, 0);
    const significant = frame.force || frame.searches.size || departed.length >= 3 || entered.length >= 3 || damage >= 8 ||
      prevented >= 8 ||
      players.some(row => Math.abs(row.after - row.before) >= 5 || row.poisonAfter - row.poisonBefore >= 3 || Math.abs(row.handAfter - row.handBefore) >= 5 || row.eliminated);
    if (!significant) return;
    // Visual weight follows public, completed outcomes, never a card's name or
    // a tutor's hidden result. Routine searches keep the table in view.
    const removed = departed.filter(([card]) => card.zone !== 'battlefield').length;
    const eliminated = players.filter(row => row.eliminated).length;
    const lifeSwing = Math.max(0, ...players.map(row => Math.abs(row.after - row.before)));
    const handSwing = Math.max(0, ...players.map(row => Math.abs(row.handAfter - row.handBefore)));
    const poisonGain = Math.max(0, ...players.map(row => row.poisonAfter - row.poisonBefore));
    const major = !!game.gameOver || eliminated > 0 || removed >= 3 || damage >= 8 || prevented >= 8 ||
      lifeSwing >= 8 || entered.length >= 5 || handSwing >= 5 || poisonGain >= 3;
    const headline = game.gameOver ? 'Final blow' : eliminated ? 'Player eliminated' :
      frame.boardWipe && removed >= 3 ? 'Board wipe' : removed >= 3 ? 'Battlefield upheaval' :
      damage >= 8 ? 'Massive damage' : prevented >= 8 ? 'Damage stopped' : 'Major shift';
    const stats = [];
    if (eliminated) stats.push({value: eliminated, label: 'players eliminated'});
    if (removed) stats.push({value: removed, label: 'permanents removed'});
    if (damage) stats.push({value: damage, label: 'damage dealt'});
    if (prevented) stats.push({value: prevented, label: 'damage prevented'});
    if (!damage && lifeSwing) stats.push({value: lifeSwing, label: 'largest life change'});
    if (entered.length) stats.push({value: entered.length, label: 'permanents entered'});
    if (handSwing >= 5) stats.push({value: handSwing, label: 'largest hand change'});
    if (poisonGain >= 3) stats.push({value: poisonGain, label: 'most poison gained'});
    const impact = {level: major ? 'major' : 'minor', headline: major ? headline :
      frame.searches.size ? 'Search complete' : 'Resolved', stats: major ? stats.slice(0, 3) : []};
    const stack = game.stack.slice().reverse().map(so => so.name);
    const queued = game.pendingTriggers.map(tr => tr.name || tr.desc || publicName(tr.src));
    for (const player of frame.humans) {
      const searches = [];
      for (const [searcher, cards] of frame.searches) {
        if (!cards.size) searches.push({text: `${searcher.name}: search completed; no card found.`});
        for (const [card, info] of cards) {
          const visible = !card.faceDown && (player === searcher || info.revealed || frame.revealed.has(card) || ['battlefield', 'graveyard', 'exile', 'command', 'stack'].includes(card.zone));
          const destination = card.zone === 'library' && card.owner.library.at(-1) === card ? 'top of library' : zoneName(card.zone);
          searches.push({card: visible ? cardView(card) : null,
            text: `${searcher.name}: ${visible ? card.name : 'a card (not revealed)'} → ${destination}${card.zone === 'battlefield' && card.tapped ? ', tapped' : ''}.`});
        }
      }
      const recap = {name: frame.name, source: frame.source, controllerName: frame.controller,
        combat: frame.combat, details: frame.details, searches, changes, players,
        damage: frame.damage, prevented: frame.prevented, totalDamage: damage, stack, queued,
        gameOver: !!game.gameOver, impact};
      await player.controller.decide(game, {type: 'effectReview', effectKind: 'resolutionRecap',
        player, source: frame.source, prompt: `${frame.name} — what happened`, recap});
    }
  }

  const resolve = G.resolveTop;
  G.resolveTop = async function () {
    const so = this.stack.at(-1);
    if (!so) return;
    const frame = begin(this, so.card || so.srcCard || so.ctx?.src, so.name, so.ctrl);
    try {
      const result = await resolve.call(this);
      await finish(this, frame);
      return result;
    } finally {
      if (frame && this._resolutionRecap === frame) this._resolutionRecap = null;
    }
  };
  const combatDamage = G.combatDamage;
  G.combatDamage = async function (player, step) {
    const frame = begin(this, null, step === 'first' ? 'First-strike combat damage' : 'Combat damage', player, true);
    try {
      const result = await combatDamage.call(this, player, step);
      await finish(this, frame);
      return result;
    } finally {
      if (frame && this._resolutionRecap === frame) this._resolutionRecap = null;
    }
  };
})();
