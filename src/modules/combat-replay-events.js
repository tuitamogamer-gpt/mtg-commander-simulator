// Public, immutable combat outcomes. This observer never assigns damage or
// changes a decision; it records the rules engine's completed damage step.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const M = MTG, G = M.Game.prototype;
  const frames = new WeakMap(), histories = new WeakMap();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const counters = value => Object.fromEntries(Object.entries(value || {}).filter(([, n]) => Number.isFinite(n)));
  const id = object => object instanceof M.Player ? `player:${object.idx}`
    : Number.isInteger(object?.iid) ? `card:${object.iid}` : null;
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  };
  const publicKeywords = card => {
    // cur describes public battlefield characteristics, including granted
    // abilities on face-down creatures. Never read their hidden printed text.
    const labels = [...(card.cur?.kw || [])].filter(value => typeof value === 'string');
    if (card.cur?.unblockable) labels.push('unblockable');
    if (card.cur?.hexproof) labels.push('hexproof');
    if (card.cur?.shroud) labels.push('shroud');
    if (card.cur?.wardCost || card.cur?.extraWards?.length) labels.push('ward');
    if (card.cur?.protectionFrom?.length) labels.push('protection');
    const toxic = card.faceDown
      ? (card.cur?.oracleNumericKeywordsV10 || []).filter(row => row.kind === 'toxic').reduce((n, row) => n + number(row.n), 0)
      : number(M.oracleToxicValueV10?.(card));
    if (toxic > 0) labels.push(`toxic ${toxic}`);
    return [...new Set(labels)].slice(0, 100);
  };
  function cardView(card) {
    const name = card.faceDown ? 'Face-down creature' : card.name;
    return {
      id: id(card), kind: 'permanent', iid: card.iid, name, faceDown: !!card.faceDown,
      image: card.faceDown ? null : M.cardImageURL?.(name) || null,
      controllerIdx: card.ctrl?.idx, controllerName: card.ctrl?.name || '',
      ownerIdx: card.owner?.idx, isToken: !!card.isToken,
      power: number(card.power), toughness: number(card.toughness),
      types: [...(card.cur?.types || [])], keywords: publicKeywords(card),
      countersBefore: counters(card.counters), damageBefore: number(card.damage),
    };
  }
  const playerView = player => ({id: id(player), kind: 'player', idx: player.idx, name: player.name,
    lifeBefore: number(player.life), poisonBefore: number(player.poison),
    countersBefore: counters(player.counters)});
  function capture(frame, game, pairs) {
    frame.cards = new Map(game.bf().map(card => [card, {view: cardView(card), version: card.zoneVersion}]));
    frame.players = new Map(game.players.map(player => [player, playerView(player)]));
    frame.lanes = pairs.map(({card, targets, target}) => ({
      attacker: card, blockers: [...new Set(targets)], defender: target,
      blocked: !!card.wasBlocked || targets.length > 0,
    }));
    // Removed planeswalkers/battles use a public destination marker, not a
    // hidden card or a replacement player destination invented by the replay.
    frame.destinations = new Map(pairs.filter(pair => !id(pair.target)).map(pair => [pair.target, {
      id: `removed:${pair.card.iid}`, kind: 'removed', name: 'Attack destination left combat',
    }]));
  }
  const pairsFor = game => (game.combat?.attackers || []).filter(card =>
    card.zone === 'battlefield' && !card.phasedOut && card.attacking != null).map(card => ({
    card, targets: (card.blockedBy || []).filter(blocker => blocker.zone === 'battlefield' && !blocker.phasedOut), target: card.attacking,
  }));
  const sum = (rows, predicate) => rows.filter(predicate).reduce((total, row) => total + number(row.amount), 0);
  function finish(game, frame) {
    if (!frame.sawClash && !frame.damage.length && !frame.effects.length) return;
    const cardResult = card => {
      const before = frame.cards.get(card);
      if (!before) return null;
      const cardId = before.view.id;
      const sameObject = card.zone === 'battlefield' && card.zoneVersion === before.version;
      return {...before.view, countersAfter: sameObject ? counters(card.counters) : null,
        damageAfter: sameObject ? number(card.damage) : null, zoneAfter: card.zone,
        leftBattlefield: !sameObject, died: frame.died.has(cardId),
        dealtDamage: sum(frame.damage, hit => hit.sourceId === cardId),
        receivedDamage: sum(frame.damage, hit => hit.targetId === cardId),
        preventedDamage: sum(frame.effects, effect => effect.kind === 'damagePrevented' && effect.targetId === cardId),
        lifeGain: sum(frame.effects, effect => effect.kind === 'lifeGain' && effect.sourceId === cardId),
      };
    };
    const players = [...frame.players].map(([player, before]) => ({...before,
      lifeAfter: number(player.life), poisonAfter: number(player.poison), countersAfter: counters(player.counters),
      receivedDamage: sum(frame.damage, hit => hit.targetId === before.id),
      preventedDamage: sum(frame.effects, effect => effect.kind === 'damagePrevented' && effect.targetId === before.id),
    }));
    const history = histories.get(game);
    const clashes = frame.lanes.map((lane, index) => {
      const attacker = cardResult(lane.attacker);
      const blockers = lane.blockers.map(cardResult).filter(Boolean);
      const defender = lane.defender instanceof M.Player ? players.find(player => player.idx === lane.defender.idx)
        : cardResult(lane.defender) || frame.destinations.get(lane.defender);
      const sourceIds = new Set([attacker?.id, ...blockers.map(card => card.id)]);
      const entityIds = new Set([...sourceIds, defender?.id]);
      return {id: `${history.combatId}:${frame.step}:${index}`, attacker, blockers, defender, blocked: lane.blocked,
        damage: frame.damage.filter(hit => sourceIds.has(hit.sourceId)),
        effects: frame.effects.filter(effect => entityIds.has(effect.sourceId) || entityIds.has(effect.targetId)),
      };
    }).filter(lane => lane.attacker && lane.defender);
    if (!clashes.length) return;
    const replay = freeze({id: `${history.combatId}:${++history.serial}`, combatId: history.combatId,
      turn: game.turnNo, step: frame.step, attackerPlayer: {idx: frame.player.idx, name: frame.player.name},
      clashes, players, effects: frame.effects, damage: frame.damage});
    history.replays = freeze([...history.replays.filter(row => row.combatId === history.combatId), replay].slice(-3));
    game.note('combatReplay', {replay});
  }

  // Runtime-only history is deliberately outside the Game object: save files,
  // AI clones and rules comparisons do not acquire presentation state.
  M.combatReplaysFor = game => histories.get(game)?.replays || Object.freeze([]);

  const note = G.note;
  G.note = function (type, data = {}) {
    const frame = frames.get(this);
    if (frame && type === 'gameEffect') {
      if (data.kind === 'combatClash') {
        frame.sawClash = true;
        capture(frame, this, data.pairs || pairsFor(this));
      } else if (data.kind === 'damage') {
        frame.damage.push({sourceId: id(data.source), targetId: id(data.target), amount: number(data.amount),
          combat: !!data.combat, infect: !!data.infect, wither: !!data.wither, toxic: number(data.toxic),
          keywords: [...(data.audioFacts?.keywords || [])]});
      } else if (['damagePrevented', 'counterChange', 'keyword', 'zoneMove', 'combatStrike'].includes(data.kind)) {
        frame.effects.push({kind: data.kind, sourceId: id(data.source), targetId: id(data.target || data.card),
          amount: number(data.amount), ...(data.keyword ? {keyword: String(data.keyword), state: String(data.state || '')} : {}),
          ...(data.counterKind ? {counterKind: String(data.counterKind)} : {}),
          ...(data.fromZone ? {fromZone: String(data.fromZone), toZone: String(data.toZone)} : {}),
          ...(data.mode ? {mode: String(data.mode)} : {})});
      }
    }
    return note.call(this, type, data);
  };
  const emit = G.emit;
  G.emit = function (type, data, ...args) {
    const frame = frames.get(this);
    if (frame && type === 'dies' && data?.card) frame.died.add(id(data.card));
    if (frame && type === 'playerCountersPlaced' && data?.player) frame.effects.push({
      kind: 'counterChange', sourceId: id(data.source), targetId: id(data.player),
      counterKind: String(data.kind), amount: number(data.n),
    });
    return emit.call(this, type, data, ...args);
  };
  const gainLife = G.gainLife;
  G.gainLife = async function (player, amount, source, opts = {}) {
    const frame = frames.get(this);
    const gained = await gainLife.call(this, player, amount, source, opts);
    if (frame && frames.get(this) === frame && gained > 0) frame.effects.push({
      kind: 'lifeGain', sourceId: id(source), targetId: id(player), amount: number(gained), lifelink: !!opts.lifelink,
    });
    return gained;
  };
  const combatDamage = G.combatDamage;
  G.combatDamage = async function (player, step) {
    if (this._simulation || frames.has(this) || !this.combat || !pairsFor(this).length) return combatDamage.call(this, player, step);
    let history = histories.get(this);
    if (!history || history.combat !== this.combat || history.turn !== this.turnNo) {
      const serial = (history?.serial || 0) + 1;
      history = {combat: this.combat, turn: this.turnNo, combatId: `combat:${this.turnNo}:${serial}`, serial,
        replays: history?.replays || freeze([])};
      histories.set(this, history);
    }
    const frame = {step, player, damage: [], effects: [], died: new Set(), sawClash: false};
    capture(frame, this, pairsFor(this));
    frames.set(this, frame);
    try {
      const result = await combatDamage.call(this, player, step);
      frames.delete(this);
      finish(this, frame);
      return result;
    } finally { frames.delete(this); }
  };
})();
