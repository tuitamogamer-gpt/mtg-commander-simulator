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
      source: cardView(source), sourceCard: source, name, controller: controller?.name || '', actor: controller, combat,
      humans: game.reviewHumans(), details: [], searches: new Map(), revealed: new Set(),
      damage: [], prevented: [], damagedPermanents: new Set(), damageTargets: new Set(), draws: new Map(),
      battlefield: new Map(game.bf().map(card => [card, {
        card: cardView(card), version: card.zoneVersion, controller: card.ctrl,
        power: card.power, toughness: card.toughness,
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
    if (this._resolutionRecap) {
      this._resolutionRecap.explain = true;
      this._resolutionRecap.details.push({text, card: cardView(card)});
    }
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
        if (data.kind === 'damage') frame.damageTargets.add(data.target);
        if (data.kind === 'damage' && data.target instanceof MTG.CardInst) frame.damagedPermanents.add(data.target);
        const row = {text: `${publicName(data.source)} → ${publicName(data.target)}: ${data.amount} ${data.kind === 'damage' ? 'damage dealt' : 'damage prevented'}.`,
          amount: Number(data.amount) || 0, card: cardView(data.source)};
        (data.kind === 'damage' ? frame.damage : frame.prevented).push(row);
      }
      if (data.kind === 'boardWipe') frame.boardWipe = true;
      if (data.kind === 'keyword' && data.keyword === 'indestructible' && data.state === 'prevented' && data.card) frame.damagedPermanents.add(data.card);
      if (data.kind === 'counterspell') frame.details.push({text: `${data.stackObject?.name || 'Spell'} was countered.`});
    }
    return note.call(this, type, data);
  };

  const emit = G.emit;
  G.emit = function (name, data) {
    if (name === 'searchedLibrary' && this._resolutionRecap && data?.player) search(this._resolutionRecap, data.player);
    if (name === 'draw' && this._resolutionRecap && data?.player) {
      const draws = this._resolutionRecap.draws;
      draws.set(data.player, (draws.get(data.player) || 0) + 1);
    }
    return emit.call(this, name, data);
  };

  const reveal = G.revealToHuman;
  const globalReview = G.reviewGlobalEffectWithHuman;
  G.reviewGlobalEffectWithHuman = function (payload) {
    // This is an informational preview during resolution, not a response
    // window. Explain a noteworthy result once, after it actually happens.
    if (this._resolutionRecap) return Promise.resolve(null);
    return globalReview.call(this, payload);
  };
  G.revealToHuman = function (payload) {
    const frame = this._resolutionRecap;
    if (frame && payload.kind !== 'look') {
      for (const card of payload.cards || []) if (!card.faceDown) frame.revealed.add(card);
      // Aggregate entries/search reveals after all instructions and state-based
      // actions. Looks and other mid-effect choices retain their own decisions.
      if (['enters', 'tokens'].includes(payload.kind)) {
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
    const unexpectedEntries = entered.filter(card => !card.isToken && card.meta?._enteredFromZone && card.meta._enteredFromZone !== 'stack' &&
      (!card.is('Land') || ['library', 'graveyard', 'exile'].includes(card.meta?._enteredFromZone)));
    const controlChanges = [];
    const boosted = [];
    for (const [card, before] of departed) changes.push({card: before.card,
      text: `${before.card.name} · ${before.controller.name}: ${card.zone === 'battlefield' ? 'left and returned to the battlefield' : 'battlefield → ' + zoneName(card.zone)}.`});
    const entries = entered.map(card => ({card: cardView(card),
      text: `${publicName(card)} · ${card.ctrl.name}: ${unexpectedEntries.includes(card) ? zoneName(card.meta._enteredFromZone) + ' → ' : ''}entered the battlefield${card.tapped ? ' tapped' : ''}.`}));
    changes.push(...entries);
    const survivors = [];
    for (const card of frame.damagedPermanents) if (card.zone === 'battlefield') survivors.push({card: cardView(card),
      text: `${publicName(card)} remained on the battlefield${card.kw('indestructible') ? ' with indestructible' : ''}${card.damage ? `, with ${card.damage} damage marked` : ''}.`});
    changes.push(...survivors);
    for (const [card, before] of frame.battlefield) if (card.zone === 'battlefield') {
      if (card.ctrl !== before.controller) controlChanges.push({card: cardView(card), text: `${publicName(card)}: ${before.controller.name} → controlled by ${card.ctrl.name}.`});
      if (card.zoneVersion === before.version && card.is('Creature') &&
        (card.power - before.power >= 2 || card.toughness - before.toughness >= 2)) {
        boosted.push({card: cardView(card), text: `${publicName(card)} · ${card.ctrl.name}: ${before.power}/${before.toughness} → ${card.power}/${card.toughness}.`});
      }
    }
    changes.push(...controlChanges, ...boosted);
    const players = frame.players.filter(before => before.life !== before.player.life || before.poison !== (before.player.poison || 0) || before.lost !== before.player.lost || before.hand !== before.player.hand.length)
      .map(before => ({name: before.player.name, before: before.life, after: before.player.life,
        poisonBefore: before.poison, poisonAfter: before.player.poison || 0,
        handBefore: before.hand, handAfter: before.player.hand.length, eliminated: !before.lost && before.player.lost}));
    const damage = frame.damage.reduce((n, row) => n + row.amount, 0);
    const prevented = frame.prevented.reduce((n, row) => n + row.amount, 0);
    // Visual weight follows public, completed outcomes, never a card's name or
    // a tutor's hidden result. Routine searches keep the table in view.
    const removed = departed.filter(([card]) => card.zone !== 'battlefield').length;
    const eliminated = players.filter(row => row.eliminated).length;
    const lifeSwing = Math.max(0, ...players.map(row => Math.abs(row.after - row.before)));
    const handSwing = Math.max(0, ...players.map(row => Math.abs(row.handAfter - row.handBefore)));
    const drawn = Math.max(0, ...frame.draws.values());
    const poisonGain = Math.max(0, ...players.map(row => row.poisonAfter - row.poisonBefore));
    const totalLifeLost = players.reduce((n, row) => n + Math.max(0, row.before - row.after), 0);
    const major = !!game.gameOver || eliminated > 0 || removed >= 3 || prevented >= 10 ||
      lifeSwing >= 10 || totalLifeLost >= 12 || (damage >= 12 && frame.damageTargets.size >= 3) ||
      entered.length >= 5 || handSwing >= 5 || drawn >= 5 || poisonGain >= 3 || controlChanges.length >= 3 || boosted.length >= 3;
    const explain = frame.searches.size || frame.explain || unexpectedEntries.length || controlChanges.length || prevented >= 3;
    if (!major && !explain) return;
    const headline = game.gameOver ? 'Final blow' : eliminated ? 'Player eliminated' :
      frame.boardWipe && removed >= 3 ? 'Board wipe' : removed >= 3 ? 'Battlefield upheaval' :
      prevented >= 10 ? 'Damage stopped' : controlChanges.length >= 3 ? 'Changing sides' :
      entered.length >= 5 ? entered.filter(card => card.is('Creature')).length >= 5 ? 'Army assembled' :
        entered.filter(card => card.is('Land')).length >= 3 ? 'Mana surge' : 'Board rebuilt' :
      boosted.length >= 3 ? 'Power surge' :
      drawn >= 5 || handSwing >= 5 ? 'A fresh hand' : poisonGain >= 3 ? 'Poison rising' :
      damage >= 10 ? 'Massive damage' : 'Life swing';
    const stats = [];
    if (eliminated) stats.push({value: eliminated, label: 'players eliminated'});
    if (removed) stats.push({value: removed, label: 'permanents removed'});
    if (damage) stats.push({value: damage, label: 'damage dealt'});
    if (prevented) stats.push({value: prevented, label: 'damage prevented'});
    if (!damage && lifeSwing) stats.push({value: lifeSwing, label: 'largest life change'});
    if (entered.length) stats.push({value: entered.length, label: 'permanents entered'});
    if (drawn >= 5) stats.push({value: drawn, label: 'most cards drawn'});
    else if (handSwing >= 5) stats.push({value: handSwing, label: 'largest hand change'});
    if (controlChanges.length >= 3) stats.push({value: controlChanges.length, label: 'changed sides'});
    if (boosted.length >= 3) stats.push({value: boosted.length, label: 'creatures boosted'});
    if (poisonGain >= 3) stats.push({value: poisonGain, label: 'most poison gained'});
    const stack = game.stack.slice().reverse().map(so => so.name);
    const queued = game.pendingTriggers.map(tr => tr.name || tr.desc || publicName(tr.src));
    for (const player of frame.humans) {
      // The acting player already made the routine choice. Only table-wide
      // highlights interrupt them; opponents get the short explanation too.
      if (!major && player === frame.actor) continue;
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
      const landSearch = searches.some(row => row.card?.types.includes('Land'));
      const impact = {level: major ? 'major' : 'minor', headline: major ? headline :
        searches.length ? landSearch ? 'Land found' : 'Search complete' :
        controlChanges.length ? 'Changing sides' : unexpectedEntries.some(card => card.meta._enteredFromZone === 'graveyard') ? 'Back from the graveyard' :
        unexpectedEntries.some(card => frame.battlefield.has(card)) ? 'Gone and back' :
        prevented >= 3 ? 'Damage stopped' : 'The outcome', stats: major ? stats.slice(0, 3) : []};
      const aftermath = [];
      // Group mass outcomes by player and destination, so a wipe does not
      // read like a separate announcement for every creature that died.
      const losses = new Map();
      for (const [card, before] of departed) if (card.zone !== 'battlefield') {
        const key = `${before.controller.idx}:${card.zone}`;
        if (!losses.has(key)) losses.set(key, {name: before.controller.name, zone: zoneName(card.zone), count: 0});
        losses.get(key).count++;
      }
      for (const row of losses.values()) aftermath.push({text: `${row.name}: ${row.count} permanent${row.count === 1 ? '' : 's'} → ${row.zone}.`});
      const lifeRows = players.filter(row => row.before !== row.after || row.eliminated || row.poisonAfter !== row.poisonBefore)
        .map(row => ({text: `${row.name}: ${row.before} → ${row.after} life${row.poisonAfter !== row.poisonBefore ? ` · poison ${row.poisonBefore} → ${row.poisonAfter}` : ''}${row.eliminated ? ' · eliminated' : ''}.`}));
      const drawRows = [...frame.draws].filter(([, n]) => n >= 5).map(([p, n]) => ({text: `${p.name}: drew ${n} cards.`}));
      const handRows = players.filter(row => Math.abs(row.handAfter - row.handBefore) >= 5)
        .map(row => ({text: `${row.name}: ${row.handBefore} → ${row.handAfter} cards in hand.`}));
      const entryRows = [...new Set(entered.map(card => card.ctrl))].map(p => {
        const cards = entered.filter(card => card.ctrl === p);
        return {text: `${p.name}: ${cards.length} permanent${cards.length === 1 ? '' : 's'} entered the battlefield.`};
      });
      const highlights = major
        ? [...(eliminated ? lifeRows : []), ...survivors.slice(0, 1), ...aftermath, ...(!eliminated ? lifeRows : []),
          ...drawRows, ...handRows, ...(entered.length >= 5 ? entryRows : []), ...controlChanges, ...boosted, ...frame.prevented].slice(0, 3)
        : searches.length ? searches : frame.explain ? frame.details.slice(-2) : controlChanges.length ? controlChanges : unexpectedEntries.length ?
          entries.filter((row, index) => unexpectedEntries.includes(entered[index])) : frame.prevented;
      const fetchSourceGone = landSearch && frame.source?.types.includes('Land') &&
        ['graveyard', 'exile', 'command'].includes(frame.sourceCard?.zone);
      const summary = major
        ? game.gameOver ? 'The last exchange decided the match.' :
          eliminated ? `${eliminated} player${eliminated === 1 ? ' was' : 's were'} eliminated.` :
          removed >= 3 ? `${removed} permanents left the battlefield${survivors.length ? `; ${survivors.length} survived the effect` : ''}.` :
          entered.length >= 5 ? `${entered.length} new permanents changed the board.` :
          boosted.length >= 3 ? `${boosted.length} creatures grew stronger at once.` :
          controlChanges.length >= 3 ? `${controlChanges.length} permanents changed controllers.` :
          drawn >= 5 ? `${drawn} cards drawn in one resolution.` :
          handSwing >= 5 ? `A hand changed by ${handSwing} cards.` :
          poisonGain >= 3 ? `Up to ${poisonGain} poison counters gained.` :
          prevented >= 10 ? `${prevented} damage was prevented.` :
          damage >= 10 ? `${damage} damage dealt${frame.combat ? ' in combat' : ''}.` :
          totalLifeLost >= 12 ? `${totalLifeLost} life lost across the table.` : `A life total changed by ${lifeSwing}.`
        : searches.length ? fetchSourceGone ? `${frame.source.name} → ${zoneName(frame.sourceCard.zone)}. Here is what the search found.` :
          landSearch ? 'Land found. Its destination and tap state are shown below.' : 'The library search is complete.' :
          controlChanges.length ? 'The permanent now answers to a different player.' :
          unexpectedEntries.length ? 'A card entered without being cast.' : 'Here is how the effect played out.';
      const recap = {name: frame.name, source: frame.source, controllerName: frame.controller,
        combat: frame.combat, details: frame.details, searches, changes, players,
        damage: frame.damage, prevented: frame.prevented, totalDamage: damage, stack, queued,
        gameOver: !!game.gameOver, impact, summary, highlights};
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
