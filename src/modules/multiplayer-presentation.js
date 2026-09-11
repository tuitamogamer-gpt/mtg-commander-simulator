// Viewer-specific data for the shared Arena. These objects never run a game,
// shuffle a deck, execute card scripts, or decide legality on a client.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
(function () {
  const U = MTG;
  const stackIds = new WeakMap();
  let stackSerial = 0;
  U.onlineStackToken = object => {
    if (!stackIds.has(object)) stackIds.set(object, `s:${++stackSerial}`);
    return stackIds.get(object);
  };
  const seat = player => player ? player.onlineSeat ?? player.idx : null;
  const token = object => !object ? null : typeof object === 'number' ? `c:${object}` : object instanceof U.Player ? `p:${object.idx}`
    : Number.isInteger(object.iid) ? `c:${object.iid}` : U.onlineStackToken(object);
  const finite = value => value === Infinity ? 1000000 : value === -Infinity ? -1000000 : value;
  // Static presentation metadata only. Card scripts, context closures, private
  // engine references and prototype keys cannot cross this boundary.
  function data(value, seen = new Set(), depth = 0) {
    if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'number') return finite(value);
    if (!value || typeof value !== 'object' || depth > 14 || seen.has(value)) return undefined;
    if (value instanceof U.Player || value instanceof U.CardInst || value instanceof U.Game) return undefined;
    seen.add(value);
    let result;
    if (Array.isArray(value) || value instanceof Set) result = [...value].map(v => data(v, seen, depth + 1)).filter(v => v !== undefined);
    else if (value instanceof Map) result = Object.fromEntries([...value].map(([k, v]) => [String(k), data(v, seen, depth + 1)]));
    else result = Object.fromEntries(Object.entries(value).filter(([k]) => !['__proto__', 'constructor', 'prototype'].includes(k))
      .map(([k, v]) => [k, data(v, seen, depth + 1)]).filter(([, v]) => v !== undefined));
    seen.delete(value);
    return result;
  }
  const metaKeys = ['chosenType', 'chosenColor', 'oracleChosenColor', 'thrivingColor', 'siegeMode', 'level', 'unlocked',
    'suspended', 'foretold', 'plotted', 'freePlay', 'playableBy', 'playableUntil', 'playableUntilOwnTurn', 'ringBearer', 'crewedTurn'];
  U.onlineCardPresentation = function (card, viewer, mayInspect = false) {
    const meta = card.meta || {};
    const mayLook = card.ctrl === viewer && !!meta.faceDownDef || meta.revealedTo === 'all' ||
      Array.isArray(meta.revealedTo) && meta.revealedTo.includes(viewer.idx);
    const hidden = card.faceDown ? !mayLook : !mayInspect &&
      (card.zone === 'library' || card.zone === 'hand' && (card.owner || card.ctrl) !== viewer);
    const publicBody = card.zone === 'battlefield' && (!hidden || !!meta.faceDownDef);
    const def = hidden ? {
      name: 'Hidden card', cost: '', super: [], types: publicBody ? ['Creature'] : ['Card'], subtypes: [],
      oracle: publicBody ? 'Face-down creature. Its identity is hidden.' : 'The identity of this card is hidden.',
    } : data(card.def);
    if (!hidden && card.def.mana) def.mana = data(card.def.mana) || true;
    const current = publicBody ? data(card.cur) : null;
    const publicMeta = hidden ? {} : Object.fromEntries(metaKeys.filter(k => meta[k] !== undefined).map(k => [k, data(meta[k])]));
    if (publicBody && meta.togetherForeverTurn !== undefined) publicMeta.togetherForeverTurn = meta.togetherForeverTurn;
    if(card.mutateState){publicMeta.c1920Mutations=meta.c1920Mutations||0;publicMeta.mutateComponents=U.Mutate.present(card,viewer);}
    if (card.faceDown && mayLook) {
      publicMeta.faceDownDef = data(meta.faceDownDef || card.def);
      publicMeta.revealedTo = [viewer.idx];
    }
    const creature = (publicBody || !hidden) && card.is('Creature');
    const result = {
      token: token(card), iid: card.iid, zoneVersion: card.zoneVersion || 0,
      name: hidden ? 'Hidden card' : (card.faceDown && meta.faceDownDef ? meta.faceDownDef.name : card.name),
      zone: card.zone, ownerSeat: seat(card.owner || card.ctrl), controllerSeat: seat(card.ctrl),
      hidden, faceDown: !!card.faceDown, def, cur: current,
      types: publicBody ? [...(card.cur?.types || def.types)] : [...def.types],
      cost: !hidden || publicBody ? def.cost || '' : undefined,
      power: creature ? card.power : undefined, toughness: creature ? card.toughness : undefined,
      counters: publicBody || !hidden ? data(card.counters || {}) : {},
      meta: publicMeta, tapped: publicBody && !!card.tapped, sick: publicBody && !!card.sick,
      damage: publicBody ? card.damage || 0 : 0, deathtouched: publicBody && !!card.deathtouched,
      phasedOut: card.zone === 'battlefield' && !!card.phasedOut,
      commander: (publicBody || !hidden) && !!card.commander, cmdCasts: !hidden ? card.cmdCasts || 0 : 0,
      castMeta: !hidden ? data(card.castMeta) : null,
      isToken: publicBody && !!card.isToken, colors: publicBody || !hidden ? [...(card.colors || [])] : [],
      mv: publicBody || !hidden ? card.mv || 0 : 0,
      damageAmount: creature && publicBody && card.owner?.game?.dmgAmount ? card.owner.game.dmgAmount(card, 'normal') : 0,
      attachedTo: publicBody ? card.attachedTo : null, attachments: publicBody ? [...(card.attachments || [])] : [],
      attacking: publicBody ? token(card.attacking) : null,
      blocking: publicBody ? card.blocking : null,
      blockedBy: publicBody ? (card.blockedBy || []).map(token) : [],
    };
    if (publicBody && current) {
      current.types = result.types; current.subtypes ||= []; current.kw ||= [];
      // A face-down permanent has public characteristics, never its printed
      // hidden text or identity-bearing metadata from the underlying card.
      if (hidden) result.def = { ...def, power: card.power, toughness: card.toughness };
    }
    if (!hidden) {
      if (meta.playableBy instanceof U.Player) result.meta.playableBy = { $ref: token(meta.playableBy) };
      result.faceUpCosts = data(card.owner?.game?.faceUpCosts?.(card) || []);
      try { result.castCost = data(card.owner?.game?.spellCost(viewer, card, {})); } catch { /* No cast context. */ }
    }
    return result;
  };

  function encoder(game, viewer, inspect = new Set()) {
    const objects = new Map();
    const encode = (value, visited = new Set(), depth = 0) => {
      if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
      if (typeof value === 'number') return finite(value);
      if (!value || typeof value !== 'object' || depth > 16) return undefined;
      if (value instanceof U.Player) return { $ref: token(value) };
      if (value instanceof U.CardInst) {
        const id = token(value);
        if (!objects.has(id)) objects.set(id, U.onlineCardPresentation(value, viewer, inspect.has(value)));
        return { $ref: id };
      }
      if (game.stack.includes(value)) return { $ref: token(value) };
      if (value === game || visited.has(value)) return undefined;
      visited.add(value);
      const result = Array.isArray(value) || value instanceof Set
        ? [...value].map(item => encode(item, visited, depth + 1)).filter(item => item !== undefined)
        : Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype', 'aiHint', 'g', 'game', 'controller'].includes(key))
          .map(([key, item]) => [key, encode(item, visited, depth + 1)]).filter(([, item]) => item !== undefined));
      visited.delete(value);
      return result;
    };
    return { encode, objects };
  }

  U.onlineArenaView = function (game, viewer) {
    const enc = encoder(game, viewer);
    const card = object => { enc.encode(object); return enc.objects.get(token(object)); };
    const players = game.players.map(player => {
      const topSources = game.bf().filter(source => source.ctrl === player && !source.cur?.abilitiesDisabled &&
        (source.def.revealAllTop || player === viewer && source.def.revealOwnTop));
      const top = topSources.length ? player.library.at(-1) : null;
      const visibleTop = top ? U.onlineCardPresentation(top, viewer, true) : null;
      if (visibleTop) enc.objects.set(token(top), visibleTop);
      return {
        seat: seat(player), idx: player.idx, name: player.name, deckId: player.deckName || player.deck?.name || '',
        isAI: !!player.isAI, connected: player.onlineConnected !== false, life: player.life,
        poison: player.poison || 0, counters: data(player.counters || {}), lost: !!player.lost,
        handCount: player.hand.length, libraryCount: player.library.length,
        manaPool: data(player.pool || {}), hand: player === viewer ? player.hand.map(card) : undefined,
        graveyard: player.graveyard.map(card), exile: player.exile.map(card), command: player.command.map(card),
        commanders: (player.commanders || []).map(card), commanderDamage: data(player.commanderDamage || {}),
        landsPlayed: player.landsPlayed || 0, landPlayLimit: game.landPlayLimit(player),
        afcDungeon: data(player.afcDungeon || null), afcCompletedDungeons: player.afcCompletedDungeons || 0,
        emblems: data(player.emblems || []), cityBlessing: !!player.cityBlessing, noMaxHandForever: !!player.noMaxHandForever,
        ringLevel: player.ringLevel || 0,
        libraryTop: visibleTop, libraryTopSources: topSources.map(token),
        libraryTopPermitted: !!top && (U.C1920?.elshaTop(game,player,top)||topSources.some(source => typeof source.def.playTop === 'function' && source.def.playTop(game, source, top, player))),
        statusEffects: U.UI ? U.UI.prototype.playerStatusEffects.call({ poisonCount: U.UI.prototype.poisonCount }, game, player) : [],
      };
    });
    const battlefield = game.battlefield.filter(object => object.zone === 'battlefield').map(card);
    const stack = game.stack.map(object => ({
      token: token(object), name: object.name, kind: object.kind, controllerSeat: seat(object.ctrl),
      card: object.card ? enc.encode(object.card) : null, srcCard: enc.encode(object.srcCard || object.src || object.ctx?.src),
      targets: enc.encode(object.targets || object.ctx?.targets || []),
      ctx: enc.encode({ src: object.ctx?.src, counterDistribution: object.ctx?.counterDistribution, targets: object.ctx?.targets, X: object.ctx?.X, mode: object.ctx?.mode, damageDivision: object.ctx?.damageDivision }),
      X: object.X, mode: object.mode, isCopy: !!object.isCopy, castOpts: enc.encode(object.castOpts),
      damageDivision: enc.encode(object.damageDivision), counterDistribution: enc.encode(object.counterDistribution),
      copyIndex: object.copyIndex, targetMode: object.targetMode, copySource: enc.encode(object.copySource),
    }));
    const publicEffects = (game.untilEffects || []).map(effect => enc.encode({
      kind: effect.kind, who: effect.who, srcIid: effect.srcIid, expires: effect.expires, label: effect.label,
    }));
    const revealedCards = {};
    for (const kind of ['forecast', 'miracle']) revealedCards[kind] = (game[`${kind}RevealedCards`]?.() || []).map(object => {
      enc.objects.set(token(object), U.onlineCardPresentation(object, viewer, true));
      return token(object);
    });
    const combat = enc.encode({ attackers: game.combat?.attackers || [] });
    const events = (game._onlinePublicEvents || []).map(event => ({ id: event.id, event: enc.encode(event.event) }));
    const zoneObjects = battlefield.concat(players.flatMap(p => [p.hand || [], p.graveyard, p.exile, p.command, p.commanders, p.libraryTop ? [p.libraryTop] : []].flat()));
    const zoneTokens = new Set(zoneObjects.map(object => object.token));
    return {
      schema: 'commander-arena/v1', turn: game.turnNo, phase: game.phase, step: game.step,
      lastResortPaused: !!game.lastResortPaused, activeSeat: seat(game.turnPlayer),
      prioritySeat: seat(game.priorityState?.holder), gameOver: !!game.gameOver, winnerSeat: seat(game.winner),
      players, battlefield, stack, objects: [...enc.objects.values()].filter(object => !zoneTokens.has(object.token)),
      combat, revealedCards, extraTurns: (game.extraTurns || []).map(seat),
      log: game.log.slice(-250).map(entry => ({ t: entry.t, msg: entry.msg, cls: entry.cls })),
      houseRules: data(game.houseRules), monarch: seat(game.monarch), monarchSince: data(game.monarchSince),
      untilEffects: publicEffects,
      threat: U.threatTable ? U.threatTable(game, viewer).map(row => ({ seat: seat(row.p), score: row.score })) : [],
      events,
    };
  };

  const questionKeys = ['type', 'prompt', 'abilityLabel', 'acts', 'allTargets', 'allocation', 'amount', 'attackTargets', 'attackers',
    'attackingPlayer', 'by', 'cancelable', 'candidates', 'card', 'cards', 'casts', 'clashSummary', 'ctrl', 'cost', 'data',
    'effectKind', 'eligible', 'forSpell', 'forced', 'free', 'from', 'kind', 'lands', 'max', 'min', 'mulls', 'n',
    'names', 'opponents', 'options', 'opts', 'player', 'potential', 'reason', 'repeats', 'revealedCards', 'source',
    'sources', 'spec', 'src', 'stackObject', 'status', 'sub', 'suggested', 'surveil', 'target', 'targets', 'title', 'triggers', 'values', 'quickTarget'];
  const decisionTypes = new Set(['threatAlert', 'cardReveal', 'combatReview', 'effectReview', 'manualResolve', 'diplomacyReview',
    'mulligan', 'chooseOption', 'chooseMulti', 'chooseX', 'bottomCards', 'chooseCards', 'chooseTargets', 'chooseManaSources',
    'orderTriggers', 'scry', 'attackers', 'blockers', 'main', 'priority']);
  const inspectedOptionKinds = new Set(['ponder', 'reefLand', 'heraldReveal', 'explore', 'elvenFarsight', 'putLand', 'nyamiTop', 'clashPlace']);
  U.completeOnlineDecision = function (game, q, player, descriptor) {
    if (!decisionTypes.has(q.type)) throw new Error(`Live play cannot present the required decision: ${q.type}. The game is paused.`);
    const inspect = new Set(['chooseCards', 'scry', 'cardReveal'].includes(q.type) ? [...(q.from || []), ...(q.cards || [])] : []);
    if (q.type === 'chooseOption' && inspectedOptionKinds.has(q.aiHint?.kind)) {
      for (const card of [q.aiHint.card, ...(q.aiHint.top || []), ...(q.revealedCards || [])]) if (card instanceof U.CardInst) inspect.add(card);
    }
    const enc = encoder(game, player, inspect);
    descriptor.ui = enc.encode(Object.fromEntries(questionKeys.filter(key => q[key] !== undefined).map(key => [key, q[key]])));
    if (q.controller instanceof U.Player) descriptor.ui.controller = enc.encode(q.controller);
    if (q.aiHint) descriptor.ui.aiHint = enc.encode(Object.fromEntries(['kind', 'card', 'source', 'src', 'target', 'top', 'cards'].filter(key => q.aiHint[key] !== undefined).map(key => [key, q.aiHint[key]])));
    descriptor.objects = [...enc.objects.values()];
    descriptor.legal.cancelable = !!q.cancelable;
    descriptor.zoneVersions = Object.fromEntries(descriptor.objects.map(object => [object.token, object.zoneVersion]));
    if (q.type === 'priority') {
      descriptor.ui.autoPass = Object.fromEntries(['off', 'full', 'end', 'fast', 'auto', 'smart', 'combat'].map(mode => [mode, U.autoPassPolicy(mode, game, q, player)]));
    }
    for (let i = 0; i < (q.casts || []).length; i++) {
      const entry = q.casts[i], uiEntry = descriptor.ui.casts[i];
      uiEntry.onlineAction = `cast:${i}`;
      const opts = { ...(entry.alt || {}), from: entry.from };
      uiEntry.onlineCost = data(game.spellCost(player, entry.card, opts));
      uiEntry.onlineDefinition = data(game.castDefinition(entry.card, opts));
      // Direct drag targets are public legality results; no target predicates
      // or card scripts are evaluated by the viewing browser.
      const specs = game.spellTargetSpecs(entry.card, opts, player);
      if (specs?.length === 1 && !uiEntry.onlineDefinition?.modes && !uiEntry.onlineCost.x &&
        (specs[0].count ?? 1) === 1 && !specs[0].bindOracleContext && !specs[0].dependentFilter) {
        uiEntry.onlineTargets = enc.encode(game.legalTargets(specs[0], entry.card, player));
        descriptor.legal.directTargets ||= {};
        descriptor.legal.directTargets[uiEntry.onlineAction] = uiEntry.onlineTargets.map(target => target.$ref);
      }
    }
    for (let i = 0; i < (q.acts || []).length; i++) {
      descriptor.ui.acts[i].onlineAction = `act:${i}`;
      if (U.UI) descriptor.ui.acts[i].label = U.UI.prototype.activationLabel.call({ game }, q.acts[i]);
    }
    if (q.type === 'blockers') {
      descriptor.legal.capacity = Object.fromEntries((q.potential || []).map(card => [token(card), finite(game.blockerCapacity(card))]));
      descriptor.legal.max = Math.min((q.potential || []).reduce((n, card) => n + game.blockerCapacity(card), 0), descriptor.legal.pairs.length);
      descriptor.bounds = Object.fromEntries((q.attackers || []).map(card => [token(card), data(game.blockerBounds(card))]));
    }
    if (q.type === 'chooseTargets' && q.spec?.distinctCtrl) descriptor.distinctControllers = true;
    descriptor.objects = [...enc.objects.values()];
    descriptor.zoneVersions = Object.fromEntries(descriptor.objects.map(object => [object.token, object.zoneVersion]));
    // Legacy descriptions are retained for protocol inspection, with the same
    // visibility permissions as the actual shared decision view.
    if (descriptor.choices) descriptor.choices = descriptor.choices.map(choice => enc.objects.get(choice.token) || choice);
    return descriptor;
  };

  U.checkOnlineDecisionObjects = function (game, descriptor, response) {
    const selected = new Set();
    const visit = value => {
      if (typeof value === 'string') { if (/^[cs]:/.test(value)) selected.add(value); }
      else if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
    };
    visit(response);
    const action = descriptor.actions?.find(entry => entry.token === (response?.action || response));
    if (action?.card) selected.add(action.card.token);
    for (const id of selected) {
      if (id.startsWith('c:')) {
        const card = game.byIid(Number(id.slice(2)));
        if (!card || descriptor.zoneVersions?.[id] !== undefined && card.zoneVersion !== descriptor.zoneVersions[id])
          throw new Error('A selected card changed zones. Review the current decision.');
      } else if (!game.stack.some(object => token(object) === id)) throw new Error('That Stack object is no longer present.');
    }
    if (descriptor.distinctControllers && Array.isArray(response)) {
      const owners = response.map(id => game.byIid(Number(id.slice(2)))?.ctrl);
      if (new Set(owners).size !== owners.length) throw new Error('Choose targets controlled by different players.');
    }
  };

  U.refreshOnlineQuestion = function (game, q, player, previous) {
    const fresh = { ...q };
    if (q.type === 'main' || q.type === 'priority') {
      fresh.casts = game.castableList(player); fresh.acts = game.activatableList(player);
      if (q.type === 'main') fresh.lands = game.playableLands(player);
      return fresh;
    }
    const present = value => value instanceof U.CardInst
      ? game.byIid(value.iid) === value && (previous.zoneVersions?.[token(value)] ?? value.zoneVersion) === value.zoneVersion
      : value instanceof U.Player ? !value.lost : !previous.legal.tokens?.includes(token(value)) || game.stack.includes(value);
    for (const key of ['from', 'candidates', 'cards', 'potential', 'eligible', 'attackers', 'forced', 'suggested']) if (Array.isArray(q[key])) fresh[key] = q[key].filter(present);
    if (q.type === 'chooseCards' || q.type === 'chooseTargets') {
      const count = (fresh.from || fresh.candidates || []).length;
      fresh.max = Math.min(q.max ?? count, count); fresh.min = Math.min(q.min || 0, fresh.max);
    }
    return fresh;
  };

  U.onlineDecisionPreview = function (game, q, descriptor, response) {
    try {
      const verdict = U.validateOnlineDecisionResponse(descriptor.legal, response);
      if (!verdict.ok) return { valid: false, message: verdict.error };
      U.checkOnlineDecisionObjects(game, descriptor, response);
      if (q.type === 'chooseManaSources') {
        const cards = response.cards.map(id => game.byIid(Number(id.slice(2))));
        return { valid: !!game.manualManaSelectionSolution(q.player, q.cost, q.forSpell, cards, q.opts || {}) };
      }
      if (q.type === 'blockers') {
        const assignments = response.map(pair => ({ blocker: game.byIid(Number(pair.left.slice(2))), attacker: game.byIid(Number(pair.right.slice(2))) }));
        const outcomes = {};
        if (U.UI) for (const attacker of q.attackers) {
          const blockers = assignments.filter(pair => pair.attacker === attacker).map(pair => pair.blocker);
          const result = U.UI.prototype.blockOutcome.call({}, game, attacker, blockers, assignments);
          outcomes[token(attacker)] = { ...result, dying: result.dying.map(token) };
        }
        return { valid: game.blockDeclarationLegal(q.attackers, assignments), outcomes };
      }
      return { valid: false, message: 'Unsupported decision preview.' };
    } catch (error) { return { valid: false, message: error.message }; }
  };

  // Stable identity maps are updated in place. Pending controls, inspected
  // cards and DOM callbacks retain the same objects across ordinary syncs.
  class ArenaView {
    constructor() {
      this.onlinePresentation = true;
      this.cards = new Map(); this.playerRefs = new Map(); this.stackRefs = new Map();
      this.players = []; this.battlefield = []; this.stack = []; this.log = []; this.untilEffects = [];
      this.diplomacy = { enabled: false }; this.speedFactor = 1; this.aiDecisionLog = [];
    }
    ref(id) {
      if (id?.startsWith('c:')) return this.cards.get(id) || null;
      if (id?.startsWith('p:')) return this.playerRefs.get(id) || null;
      return this.stackRefs.get(id) || null;
    }
    decode(value) {
      if (!value || typeof value !== 'object') return value;
      if (value.$ref) return this.ref(value.$ref);
      return Array.isArray(value) ? value.map(item => this.decode(item)) :
        Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).map(([key, item]) => [key, this.decode(item)]));
    }
    putCards(objects) {
      for (const object of objects) {
        let card = this.cards.get(object.token);
        if (!card) {
          card = Object.create(U.CardInst.prototype);
          for (const key of ['power', 'toughness', 'mv', 'colors']) Object.defineProperty(card, key, { configurable: false, get() { return this.presentation[key] ?? (key === 'colors' ? [] : 0); } });
          this.cards.set(object.token, card);
        }
        card.presentation = object;
        for (const key of ['iid', 'zoneVersion', 'zone', 'def', 'counters', 'meta', 'tapped', 'sick', 'damage', 'deathtouched', 'phasedOut', 'commander', 'cmdCasts', 'isToken', 'castMeta', 'attachedTo', 'attachments', 'faceDown', 'blocking']) card[key] = data(object[key]);
        card.def ||= { name: 'Hidden card', types: ['Card'], subtypes: [], super: [] };
        card.def.subtypes ||= []; card.def.super ||= [];
        card.cur = object.cur ? { ...data(object.cur), kw: new Set(object.cur.kw || []), blockGroupRestrictions: [] } : null;
        card.owner = this.players.find(p => p.onlineSeat === object.ownerSeat);
        card.ctrl = this.players.find(p => p.onlineSeat === object.controllerSeat);
        card.meta = this.decode(card.meta || {}); card.counters ||= {}; card.attachments ||= [];
      }
      for (const object of objects) {
        const card = this.cards.get(object.token);
        card.attacking = this.ref(object.attacking);
        card.blockedBy = (object.blockedBy || []).map(id => this.ref(id)).filter(Boolean);
      }
    }
    putDecisionCards(objects) {
      this.putCards(objects.filter(row => {
        const current = this.cards.get(row.token);
        // A question grants temporary private inspection; its earlier copy
        // must never overwrite newer public counters, damage or tap state.
        return !current || current.presentation.hidden && !row.hidden && current.zoneVersion === row.zoneVersion;
      }));
    }
    update(snapshot, you) {
      this.snapshot = snapshot;
      for (const row of snapshot.players) {
        const id = `p:${row.idx ?? row.seat}`;
        let player = this.playerRefs.get(id);
        if (!player) { player = Object.create(U.Player.prototype); this.playerRefs.set(id, player); }
        Object.assign(player, { game: this, idx: row.idx ?? row.seat, onlineSeat: row.seat, name: row.name, deckName: row.deckId,
          isAI: row.isAI, onlineConnected: row.connected, life: row.life, poison: row.poison, lost: row.lost,
          counters: row.counters || {}, pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...row.manaPool },
          commanderDamage: row.commanderDamage || {}, landsPlayed: row.landsPlayed, emblems: row.emblems || [],
          afcDungeon: row.afcDungeon, afcCompletedDungeons: row.afcCompletedDungeons, cityBlessing: row.cityBlessing, noMaxHandForever: row.noMaxHandForever, ringLevel: row.ringLevel, presentation: row });
      }
      this.players = snapshot.players.map(row => this.playerRefs.get(`p:${row.idx ?? row.seat}`));
      for (const row of snapshot.stack) if (!this.stackRefs.has(row.token)) this.stackRefs.set(row.token, {});
      // Public zones already contain their full records. The auxiliary list
      // contains only additional Stack/event references, avoiding a second
      // copy of every permanent in every human's network snapshot.
      const zoneObjects = snapshot.battlefield.concat(snapshot.players.flatMap(p => [p.hand || [], p.graveyard || [], p.exile || [], p.command || [], p.commanders || [], p.libraryTop ? [p.libraryTop] : []].flat()));
      const objects = [...new Map(zoneObjects.concat(snapshot.objects || []).map(object => [object.token, object])).values()];
      const visible = new Set(objects.map(object => object.token));
      for (const object of this.currentQuestion?.onlineDecision.objects || []) visible.add(object.token);
      for (const [id, card] of this.cards) if (!visible.has(id)) {
        // Revoke temporary library/hand inspection in existing sheet references
        // as well as in the lookup map when its decision or permission ends.
        this.putCards([{ token: id, iid: card.iid, zone: 'unknown', hidden: true,
          def: { name: 'Hidden card', types: ['Card'] }, ownerSeat: card.owner?.onlineSeat, controllerSeat: card.ctrl?.onlineSeat }]);
        this.cards.delete(id);
      }
      this.putCards(objects);
      this.putDecisionCards(this.currentQuestion?.onlineDecision.objects || []);
      for (const row of snapshot.players) {
        const p = this.players.find(p => p.onlineSeat === row.seat);
        for (const zone of ['hand', 'graveyard', 'exile', 'command', 'commanders']) p[zone] = (row[zone] || []).map(c => this.ref(c.token)).filter(Boolean);
        if (!row.hand) p.hand = Array.from({ length: row.handCount }, () => this.hiddenCard(p, 'hand'));
        p.library = Array.from({ length: row.libraryCount }, () => this.hiddenCard(p, 'library'));
        if (row.libraryTop && p.library.length) p.library[p.library.length - 1] = this.ref(row.libraryTop.token);
      }
      this.battlefield = snapshot.battlefield.map(row => this.ref(row.token));
      this.stack = snapshot.stack.map(row => {
        const object = this.stackRefs.get(row.token);
        Object.assign(object, this.decode(row), { onlineToken: row.token, ctrl: this.players.find(p => p.onlineSeat === row.controllerSeat) });
        return object;
      });
      this.viewer = this.players.find(p => p.onlineSeat === you);
      this.turnNo = snapshot.turn; this.phase = snapshot.phase; this.step = snapshot.step;
      this.turnPlayer = this.players.find(p => p.onlineSeat === snapshot.activeSeat) || null;
      this.priorityState = { holder: this.players.find(p => p.onlineSeat === snapshot.prioritySeat) || null };
      this.gameOver = snapshot.gameOver; this.winner = this.players.find(p => p.onlineSeat === snapshot.winnerSeat) || null;
      this.monarch = this.players.find(p => p.onlineSeat === snapshot.monarch) || null; this.monarchSince = snapshot.monarchSince;
      this.combat = this.decode(snapshot.combat) || { attackers: [] }; this.log = snapshot.log || [];
      this.houseRules = snapshot.houseRules || {}; this.untilEffects = this.decode(snapshot.untilEffects || []);
      this.lastResortPaused = snapshot.lastResortPaused;
      this.extraTurns = (snapshot.extraTurns || []).map(id => this.players.find(player => player.onlineSeat === id));
    }
    hiddenCard(owner, zone) {
      const card = Object.create(U.CardInst.prototype);
      Object.assign(card, { iid: -1, zone, owner, ctrl: owner, faceDown: true, def: { name: 'Hidden card', types: ['Card'], subtypes: [], super: [], oracle: '' }, meta: {}, counters: {}, attachments: [] });
      return card;
    }
    decision(descriptor) {
      this.putDecisionCards(descriptor.objects || []);
      const q = this.decode(descriptor.ui);
      if (!q) throw new Error('This room requires the current Arena client. Reload all players before starting a new room.');
      q.onlineDecision = descriptor;
      this.currentQuestion = q;
      return q;
    }
    bf() { return this.battlefield.filter(card => !card.phasedOut); }
    byIid(iid) { return this.cards.get(`c:${iid}`) || null; }
    creatures(player) { return this.bf().filter(card => card.ctrl === player && card.is('Creature')); }
    lands(player) { return this.bf().filter(card => card.ctrl === player && card.is('Land')); }
    nextPlayer(player) { const start = this.players.indexOf(player); for (let n = 1; n <= this.players.length; n++) { const next = this.players[(start + n) % this.players.length]; if (!next.lost) return next; } return player; }
    forecastRevealedCards() { return (this.snapshot.revealedCards?.forecast || []).map(id => this.ref(id)).filter(Boolean); }
    miracleRevealedCards() { return (this.snapshot.revealedCards?.miracle || []).map(id => this.ref(id)).filter(Boolean); }
    landPlayLimit(player) { return player.presentation.landPlayLimit ?? 1; }
    dmgAmount(card) { return card.presentation.damageAmount ?? card.power; }
    castEntry(card, opts = {}) { return this.currentQuestion?.casts?.find(entry => entry.card === card && (!opts.from || opts.from === entry.from) && JSON.stringify(entry.alt || {}) === JSON.stringify(Object.fromEntries(Object.entries(opts).filter(([key]) => key !== 'from')))); }
    spellCost(player, card, opts = {}) { return this.castEntry(card, opts)?.onlineCost || card.presentation.castCost || U.parseCost(card.def.cost || ''); }
    castDefinition(card, opts) { return this.castEntry(card, opts)?.onlineDefinition || card.def; }
    spellTargetSpecs() { return []; }
    castableList(player) { return player === this.viewer ? this.currentQuestion?.casts || [] : []; }
    hasExilePlayPermission(player, card) { return player === this.viewer && card.meta.playableBy === player; }
    faceUpCosts(card) { return card.presentation.faceUpCosts || []; }
    vehicleCrewCost(card) { return U.Game.prototype.vehicleCrewCost.call(this, card); }
    legalDeclarationAttackTargets(card) { const d = this.currentQuestion?.onlineDecision; return (d?.legal.pairs || []).filter(pair => pair.startsWith(`c:${card.iid}|`)).map(pair => this.ref(pair.split('|')[1])); }
    legalAttackTargets(card) { return this.legalDeclarationAttackTargets(card); }
    canBlock(blocker, attacker) { return !!this.currentQuestion?.onlineDecision.legal.pairs?.includes(`c:${blocker.iid}|c:${attacker.iid}`); }
    blockerCapacity(card) { return this.currentQuestion?.onlineDecision.legal.capacity?.[`c:${card.iid}`] ?? 1; }
    blockerBounds(card) { return this.currentQuestion?.onlineDecision.bounds?.[`c:${card.iid}`] || { min: 1, max: 1000000 }; }
    blockDeclarationLegal(attackers, assignments) { return !!this.session.preview(assignments).valid; }
    manualManaSelectionSolution(player, cost, spell, cards) { return this.session.preview({ cards }).valid ? { plan: [] } : null; }
    assignBlockerDamage(blocker, attackers, amount) { return U.Game.prototype.assignBlockerDamage.call(this, blocker, attackers, amount); }
    lastResortCardVisibleTo(card) { return card && !card.presentation?.hidden && ['battlefield', 'graveyard', 'exile', 'command'].includes(card.zone); }
    lastResortPlayer(value) { return this.players.find(p => p.onlineSeat === Number(value)); }
  }
  U.OnlineArenaView = ArenaView;
  U.onlinePresentationData = data;
})();
