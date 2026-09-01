// ===== oracle-v8-permanents.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Typed predicates for already emitted engine events. This adapter never
// interprets Oracle prose, invents an event, or broadens an older predicate.
(function () {
  function isBestowed(card) {
    return !!(card instanceof MTG.CardInst && card.zone === 'battlefield' && card.meta?.oracleBestowed);
  }

  // Bestow's continuous type effect is not a copy effect. Keep the printed or
  // copied definition intact and overlay only the battlefield characteristics;
  // this lets a token copy of the Aura enter as the ordinary printed creature.
  function applyBestowBase(card, cur) {
    if (!isBestowed(card)) return false;
    cur.types = ['Enchantment'];
    cur.subtypes = ['Aura'];
    return true;
  }

  function bestowEntryMeta(definition) {
    const target = definition?.bestowTarget?.[0];
    if (!definition?.bestowCost || !target) throw new Error('Invalid bestow entry definition');
    return {oracleBestowed: true, oracleBestowTarget: target};
  }

  // The effect ends before the ordinary Aura SBA is applied. Removing the
  // attachment and marker reveals the underlying creature/copy characteristics
  // in the next normal recalculation pass.
  function ceaseBestow(game, card) {
    if (!isBestowed(card)) return false;
    if (card.attachedTo) {
      const host = game.byIid(card.attachedTo);
      if (host) host.attachments = host.attachments.filter(iid => iid !== card.iid);
      card.attachedTo = null;
    }
    delete card.meta.oracleBestowed;
    delete card.meta.oracleBestowTarget;
    return true;
  }

  function bestowAttachmentLegal(game, card, host) {
    const spec = card?.meta?.oracleBestowTarget || card?.def?.bestowTarget?.[0];
    return !!(isBestowed(card) && spec && host instanceof MTG.CardInst && host.zone === 'battlefield' &&
      (!spec.filter || spec.filter(game, host, card.ctrl, card)) && !game.isProtectedFrom(host, card));
  }

  // Zone permissions such as "play the top card" may inspect a card's types.
  // CR 702.103d evaluates only the characteristics modified by bestow for this
  // cast, so expose an immutable view instead of mutating the physical card.
  function bestowCastView(card) {
    if (!(card instanceof MTG.CardInst) || !card.def?.bestowCost) return card;
    const view = Object.create(card);
    view.def = {...card.def, types: ['Enchantment'], subtypes: ['Aura']};
    view.is = type => type === 'Enchantment';
    view.hasSub = subtype => subtype === 'Aura';
    return view;
  }

  MTG.OracleV8Permanents = Object.assign(MTG.OracleV8Permanents || {}, {
    isBestowed, applyBestowBase, bestowEntryMeta, ceaseBestow,
    bestowAttachmentLegal, bestowCastView,
  });

  // A choice made during the turn-based untap action never goes on the Stack.
  // The turn runner collects all choices before applying any untap or stun
  // replacement; this helper neither changes the card nor grants priority.
  MTG.oracleV8ShouldUntap = async function (game, player, card) {
    if (!(card instanceof MTG.CardInst) || card.zone !== 'battlefield' || card.ctrl !== player) throw new Error('Invalid optional untap participant');
    if (!card.cur?.optionalUntap || !card.tapped) return true;
    if (card.cur.cantUntap || card.def.doesntUntap || card.meta.noUntapOnce) return false;
    const answer = await player.controller.decide(game, {
      type: 'chooseOption', prompt: 'Untap ' + card.name + '?',
      options: [{key: 'yes', label: 'Untap'}, {key: 'no', label: 'Keep tapped'}],
      aiHint: {kind: 'optionalUntap', card},
    });
    if (answer !== 'yes' && answer !== 'no') throw new Error('Invalid optional untap choice');
    return answer === 'yes';
  };

  const events = {
    cardToGraveyard: {fields: ['card'], player: 'owner', from: true},
    cardLeftGraveyard: {fields: ['card'], player: 'owner', to: true},
    turnedFaceUp: {fields: ['card'], player: 'player'},
    cycled: {fields: ['card'], player: 'player'},
    discarded: {fields: ['card'], player: 'player'},
    landPlayed: {fields: ['card'], player: 'player'},
    sacrificed: {fields: ['card'], player: 'player', snapshot: true},
    dies: {fields: ['card'], player: 'controller', snapshot: true},
    lto: {fields: ['card'], player: 'controller', snapshot: true},
    etb: {fields: ['card'], player: 'controller'},
    targeted: {fields: ['card'], player: 'byPlayer', targeted: true},
    cast: {fields: ['so'], player: 'player'},
    countersPlaced: {fields: ['card'], player: 'ctrl', counter: true, positive: true},
    countersRemoved: {fields: ['card'], player: 'ctrl', counter: true, positive: true},
    dealtDamage: {fields: ['target', 'src'], player: 'controller', damage: true, positive: true},
    damageToPlayer: {fields: ['src'], player: 'player', damage: true, positive: true},
    combatDamageToPlayer: {fields: ['card'], player: 'player', damage: true, positive: true},
    becameTapped: {fields: ['card'], player: 'player'},
    becameUntapped: {fields: ['card'], player: 'player'},
    abilityActivated: {fields: ['card'], player: 'player', activated: true},
    attacks: {fields: ['card'], player: 'player'},
    blocks: {fields: ['blocker', 'attacker'], player: 'controller', combatants: true},
    becomesBlocked: {fields: ['attacker'], player: 'controller', combatants: true, blockers: true},
    becomesBlockedByCreature: {fields: ['attacker', 'blocker'], player: 'controller', combatants: true},
    attackersDeclared: {fields: ['attackers'], player: 'player', attackers: true},
    lifeGain: {fields: [], player: 'player', positive: true},
    lifeLost: {fields: [], player: 'player', positive: true},
    draw: {fields: ['card'], player: 'player'},
    crime: {fields: [], player: 'player'},
    scry: {fields: [], player: 'player'},
  };
  const keys = new Set(['kind', 'field', 'target', 'player', 'playerField', 'subject', 'sourceSelf', 'attachedSource', 'sourceField', 'sourceSubject', 'blockerTarget', 'lookBack', 'from', 'to', 'counter', 'minAmount', 'maxAmount', 'zeroRemaining', 'combat', 'spellOnly', 'instantSorceryOnly', 'nonmana', 'firstThisTurn', 'totalMin', 'totalMax', 'minMatching', 'selfAttacking', 'defendingYou']);
  const zones = new Set(['battlefield', 'graveyard', 'hand', 'library', 'stack', 'exile', 'command']);

  function validate(event, rule) {
    if (rule?.kind !== 'v8-event') return null;
    const schema = events[event];
    if (!schema) throw new Error('Unsupported v8 event: ' + event);
    if (Object.keys(rule).some(key => !keys.has(key))) throw new Error('Unknown v8 event predicate field');
    if (rule.field !== undefined && !schema.fields.includes(rule.field)) throw new Error('Invalid v8 event object field');
    if (rule.player !== undefined && !['you', 'opponent', 'any'].includes(rule.player)) throw new Error('Invalid v8 event player relation');
    if (rule.playerField !== undefined && !(rule.playerField === 'by' && event === 'countersPlaced' || rule.playerField === 'owner' && ['dies', 'cardToGraveyard', 'cardLeftGraveyard'].includes(event) || rule.playerField === 'defender' && schema.combatants)) throw new Error('Invalid v8 event player field');
    if (rule.lookBack !== undefined && !(rule.lookBack === false && ['dies', 'cardToGraveyard'].includes(event))) throw new Error('Invalid v8 event observation zone');
    if (rule.subject !== undefined && !['self', 'another', 'attached'].includes(rule.subject)) throw new Error('Invalid v8 event object relation');
    for (const key of ['sourceSelf', 'attachedSource', 'zeroRemaining', 'spellOnly', 'instantSorceryOnly', 'firstThisTurn', 'selfAttacking', 'defendingYou']) {
      if (rule[key] !== undefined && typeof rule[key] !== 'boolean') throw new Error('Invalid v8 event boolean predicate');
    }
    if ((rule.subject || rule.target) && !schema.fields.length) throw new Error('V8 event has no object');
    if (rule.sourceSelf && !schema.damage || rule.attachedSource && !schema.damage) throw new Error('V8 event has no damage source');
    if (rule.sourceSelf && rule.attachedSource) throw new Error('Conflicting v8 damage sources');
    if (rule.sourceField !== undefined && (!schema.combatants || !schema.fields.includes(rule.sourceField) || !['self', 'attached'].includes(rule.sourceSubject))) throw new Error('Invalid v8 combat participant binding');
    if (rule.sourceSubject !== undefined && rule.sourceField === undefined) throw new Error('Missing v8 combat participant field');
    if (rule.blockerTarget !== undefined && !schema.blockers) throw new Error('V8 event has no blocker group');
    if (rule.from !== undefined && (!schema.from || !zones.has(rule.from))) throw new Error('Invalid v8 source zone');
    if (rule.to !== undefined && (!schema.to || !zones.has(rule.to))) throw new Error('Invalid v8 destination zone');
    if (rule.counter !== undefined && (!schema.counter || typeof rule.counter !== 'string' || !rule.counter)) throw new Error('Invalid v8 counter predicate');
    if (rule.zeroRemaining && event !== 'countersRemoved') throw new Error('V8 event has no remaining-counter count');
    if (rule.combat !== undefined && (!schema.damage || typeof rule.combat !== 'boolean')) throw new Error('Invalid v8 combat predicate');
    if ((rule.spellOnly || rule.instantSorceryOnly) && !schema.targeted) throw new Error('V8 event has no targeting spell');
    if (rule.nonmana !== undefined && (!schema.activated || typeof rule.nonmana !== 'boolean')) throw new Error('Invalid v8 activated-ability predicate');
    if (rule.firstThisTurn && event !== 'becameTapped') throw new Error('V8 event has no first-tap marker');
    if (['totalMin', 'totalMax', 'minMatching', 'selfAttacking', 'defendingYou'].some(key => rule[key] !== undefined) && !schema.attackers) throw new Error('V8 event has no declared attackers');
    for (const key of ['minAmount', 'maxAmount', 'totalMin', 'totalMax', 'minMatching']) {
      if (rule[key] !== undefined && (!Number.isSafeInteger(rule[key]) || rule[key] < 0)) throw new Error('Invalid v8 event count');
    }
    if ((rule.minAmount !== undefined || rule.maxAmount !== undefined) && !schema.positive) throw new Error('V8 event has no positive amount');
    return schema;
  }

  function sourceSnapshot(game, source, data) {
    return data?.card === source && data.snap ||
      (game._simultaneousLeaveSources || []).find(entry => entry.card === source)?.snap ||
      (data?.snap?.attachedSources || []).find(entry => entry.card === source)?.snap;
  }

  function cardAt(event, rule, data) {
    const schema = events[event];
    const field = rule.field || schema.fields[0];
    if (!field || field === 'attackers') return null;
    return field === 'so' ? data?.so?.card : data?.[field];
  }

  function snapshotObject(card, snapshot) {
    if (!snapshot) return card;
    return {...snapshot, _oracleLKI: true, zone: 'battlefield', owner: card.owner,
      def: snapshot.def || card.def, cur: {super: snapshot.super || snapshot.def?.super || []},
      is: type => (snapshot.types || []).includes(type),
      hasSub: type => (snapshot.subtypes || []).includes(type) || !!(snapshot.def?.changeling && !snapshot.abilitiesDisabled),
      kw: keyword => (snapshot.kw || []).includes(keyword)};
  }

  function eventPlayer(event, rule, data, card) {
    const field = rule.playerField || events[event].player;
    if (field === 'defender') return data?.attacker?.attacking instanceof MTG.Player ? data.attacker.attacking : data?.attacker?.attacking?.ctrl;
    if (field === 'owner') return card?.owner;
    if (field === 'controller') return data?.card === card && data.snap ? data.snap.ctrl : card?.ctrl;
    return data?.[field];
  }

  MTG.oracleV8TriggerBindings = function (event, rule, game, source, data) {
    const schema = validate(event, rule);
    if (!schema) return null;
    const card = schema.attackers
      ? rule.totalMax === 1 && data?.attackers?.length === 1 ? data.attackers[0] : null
      : cardAt(event, rule, data);
    return {eventCard: card instanceof MTG.CardInst ? card : null,
      eventPlayer: eventPlayer(event, rule, data, card),
      eventController: schema.snapshot && rule.lookBack !== false && data?.card === card ? data.snap?.ctrl || card?.ctrl : card?.ctrl};
  };

  MTG.oracleV8TriggerFilter = function (event, rule, genericTargetSpec) {
    const schema = validate(event, rule);
    if (!schema) return null;
    const target = rule.target ? genericTargetSpec(rule.target, [], 0) : null;
    const blockerTarget = rule.blockerTarget ? genericTargetSpec(rule.blockerTarget, [], 0) : null;
    return (game, source, data) => {
      if (!data) return false;
      const snap = sourceSnapshot(game, source, data), controller = snap?.ctrl || source.ctrl;
      const card = cardAt(event, rule, data);
      const player = eventPlayer(event, rule, data, card);
      if (rule.player && (!(player instanceof MTG.Player) || rule.player === 'you' && player !== controller || rule.player === 'opponent' && player === controller)) return false;
      if (schema.positive && !(Number(data.n) > 0)) return false;
      if (rule.minAmount !== undefined && data.n < rule.minAmount || rule.maxAmount !== undefined && data.n > rule.maxAmount) return false;
      if (rule.from !== undefined && data.from !== rule.from || rule.to !== undefined && data.to !== rule.to) return false;
      if (rule.counter !== undefined && data.kind !== rule.counter || rule.zeroRemaining && data.after !== 0) return false;
      if (rule.combat !== undefined && (event === 'combatDamageToPlayer' || !!data.combat) !== rule.combat) return false;
      if (rule.spellOnly && !data.isSpell || rule.instantSorceryOnly && !data.isInstantSorcery) return false;
      if (rule.nonmana !== undefined && data.isMana !== !rule.nonmana) return false;
      if (rule.firstThisTurn && !data.firstThisTurn) return false;
      if (rule.sourceField) {
        const participant = data[rule.sourceField];
        if (rule.sourceSubject === 'self' ? participant !== source : !participant || participant.iid !== (snap?.attachedTo ?? source.attachedTo)) return false;
      }
      if (blockerTarget && (!Array.isArray(data.blockers) || !data.blockers.some(blocker => blockerTarget.filter(game, blocker, controller, source)))) return false;
      const damageSource = event === 'combatDamageToPlayer' ? data.card : data.src;
      if (rule.sourceSelf && !sameObject(damageSource, source)) return false;
      if (rule.attachedSource && (!damageSource || damageSource.iid !== (snap?.attachedTo ?? source.attachedTo))) return false;
      if (schema.attackers) {
        if (!Array.isArray(data.attackers)) return false;
        if (rule.totalMin !== undefined && data.attackers.length < rule.totalMin || rule.totalMax !== undefined && data.attackers.length > rule.totalMax) return false;
        if (rule.selfAttacking && !data.attackers.includes(source)) return false;
        const matches = data.attackers.filter(attacker =>
          (!rule.subject || (rule.subject === 'self' ? attacker === source : rule.subject === 'another' ? attacker !== source : attacker.iid === (snap?.attachedTo ?? source.attachedTo))) &&
          (!rule.defendingYou || attacker.attacking === controller || attacker.attacking?.ctrl === controller) &&
          (!target || target.filter(game, attacker, controller, source)));
        return matches.length >= (rule.minMatching ?? 1);
      }
      if (schema.fields.length && !card) return false;
      if (rule.subject === 'self' && card !== source || rule.subject === 'another' && card === source) return false;
      if (rule.subject === 'attached' && card?.iid !== (snap?.attachedTo ?? source.attachedTo)) return false;
      if (!target) return true;
      const object = (rule.field || schema.fields[0]) === 'so' ? data.so
        : snapshotObject(card, schema.snapshot && rule.lookBack !== false && data.card === card ? data.snap : null);
      return !!object && target.filter(game, object, controller, source);
    };
  };

  function assertFields(object, allowed, label) {
    if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).some(key => !allowed.includes(key))) throw new Error('Invalid v8 ' + label);
  }

  function arithmetic(transform) {
    assertFields(transform, ['add', 'multiply', 'divide', 'round', 'set'], 'replacement arithmetic');
    const modes = ['add', 'multiply', 'divide', 'set'].filter(key => transform[key] !== undefined);
    if (modes.length !== 1) throw new Error('V8 replacement needs exactly one arithmetic operation');
    const mode = modes[0], value = transform[mode];
    if (!Number.isSafeInteger(value) || mode !== 'add' && value < 0 || mode === 'divide' && value === 0 || mode === 'multiply' && value === 0) throw new Error('Invalid v8 replacement amount');
    if (mode === 'divide' ? transform.round !== 'down' : transform.round !== undefined) throw new Error('Invalid v8 replacement rounding');
    return n => Math.max(0, mode === 'set' ? value : mode === 'add' ? n + value : mode === 'multiply' ? n * value : Math.floor(n / value));
  }

  function sameObject(card, source) {
    return card === source || !!card && !!source && card.iid === source.iid && card.zoneVersion === source.zoneVersion;
  }

  function replacementSourcePredicate(rule, targetCompiler) {
    assertFields(rule, ['subject', 'filter', 'controller', 'another', 'spellOnly', 'permanentOnly'], 'damage source');
    if (rule.another !== undefined && typeof rule.another !== 'boolean' || rule.spellOnly !== undefined && typeof rule.spellOnly !== 'boolean' || rule.permanentOnly !== undefined && typeof rule.permanentOnly !== 'boolean') throw new Error('Invalid v8 replacement source predicate');
    if (rule.subject && !['self', 'attached'].includes(rule.subject) || rule.subject && (rule.filter || rule.controller || rule.another || rule.spellOnly)) throw new Error('Invalid v8 replacement source binding');
    if (!rule.subject && !rule.filter || rule.controller && !['you', 'opponent', 'any'].includes(rule.controller)) throw new Error('Invalid v8 replacement source filter');
    const target = rule.filter ? targetCompiler(rule.filter, [], 0) : null;
    return (game, card, source, snapshot) => {
      if (!card) return false;
      if (rule.subject === 'self') return sameObject(card, source);
      if (rule.subject === 'attached') return sameObject(card, game.byIid(source.attachedTo));
      if (rule.another && sameObject(card, source)) return false;
      if (rule.permanentOnly && card.zone !== 'battlefield' && !card._oracleLKI) return false;
      const candidate = snapshotObject(card, snapshot);
      if (rule.controller === 'you' && candidate.ctrl !== source.ctrl || rule.controller === 'opponent' && candidate.ctrl === source.ctrl) return false;
      if (rule.spellOnly && card.zone !== 'stack') return false;
      return !!target.filter(game, candidate, source.ctrl, source);
    };
  }

  function replacementRecipientPredicate(rule, targetCompiler) {
    assertFields(rule, ['subject', 'players', 'permanents'], 'damage recipient');
    if (rule.subject && !['self', 'attached'].includes(rule.subject) || rule.subject && (rule.players || rule.permanents) || !rule.subject && !rule.players && !rule.permanents) throw new Error('Invalid v8 replacement recipient binding');
    if (rule.players && !['you', 'opponent', 'any'].includes(rule.players)) throw new Error('Invalid v8 replacement player relation');
    const target = rule.permanents ? targetCompiler(rule.permanents, [], 0) : null;
    return (game, card, source) => {
      if (rule.subject === 'self') return sameObject(card, source);
      if (rule.subject === 'attached') return sameObject(card, game.byIid(source.attachedTo));
      if (card instanceof MTG.Player) return !!rule.players && (rule.players === 'any' || (rule.players === 'you' ? card === source.ctrl : card !== source.ctrl));
      return !!target && card?.zone === 'battlefield' && !!target.filter(game, card, source.ctrl, source);
    };
  }

  // The central engine owns replacement ordering. `applies` is deliberately
  // pure so it can be rechecked after the affected player selects another
  // replacement; `run` transforms exactly one already selected event.
  MTG.oracleV8CompileReplacement = function (operation, helpers) {
    if (operation?.kind !== 'v8-replacement') return null;
    if (operation.contract !== 'ordered-replacement-effect') throw new Error('Invalid v8 replacement contract');
    const common = ['kind', 'event', 'contract'];
    let replacement;
    if (operation.event === 'damage') {
      assertFields(operation, [...common, 'source', 'recipient', 'transform', 'combat', 'minAmount', 'maxAmount', 'prevent', 'requiresCounter', 'counterEffect'], 'damage replacement');
      if (operation.combat !== undefined && typeof operation.combat !== 'boolean' || ['minAmount', 'maxAmount'].some(field => operation[field] !== undefined && (!Number.isSafeInteger(operation[field]) || operation[field] < 1))) throw new Error('Invalid v8 replacement damage predicate');
      if (operation.prevent !== undefined && operation.prevent !== true) throw new Error('Invalid v8 damage prevention marker');
      if (operation.requiresCounter !== undefined && (!operation.prevent || operation.requiresCounter !== '+1/+1')) throw new Error('Invalid v8 prevention counter condition');
      const counter = operation.counterEffect;
      if (counter) {
        assertFields(counter, ['operation', 'subject', 'counter', 'n'], 'prevention counter instruction');
        if (!operation.prevent || !['remove', 'add'].includes(counter.operation) || !['self', 'recipient'].includes(counter.subject) || !['+1/+1', '-1/-1'].includes(counter.counter) ||
          !(['damage', 'prevented'].includes(counter.n) || Number.isSafeInteger(counter.n) && counter.n > 0)) throw new Error('Invalid v8 prevention counter instruction');
      }
      const from = replacementSourcePredicate(operation.source, helpers.target), to = replacementRecipientPredicate(operation.recipient, helpers.target), transform = arithmetic(operation.transform);
      const applies = (game, data, source) => data.n > 0 && (operation.combat === undefined || !!data.combat === operation.combat) &&
        (operation.minAmount === undefined || data.n >= operation.minAmount) && (operation.maxAmount === undefined || data.n <= operation.maxAmount) &&
        (!operation.requiresCounter || source.counters[operation.requiresCounter] > 0) && from(game, data.src, source, data.sourceSnapshot) && to(game, data.target, source);
      replacement = {event: 'damage', applies, ...(operation.prevent ? {prevent: !counter, oraclePrevention: true} : {}), run: (game, data, source) => {
        if (!applies(game, data, source)) return data.n;
        const allowed = !operation.prevent || !game.bf().some(card => !card.cur?.abilitiesDisabled && card.def.damageCantBePrevented);
        const result = allowed ? transform(data.n) : data.n;
        if (counter) {
          const card = counter.subject === 'self' ? source : data.target;
          if (!(card instanceof MTG.CardInst) || card.zone !== 'battlefield') throw new Error('Missing prevention counter recipient');
          const n = counter.n === 'damage' ? data.n : counter.n === 'prevented' ? data.n - result : counter.n;
          if (counter.operation === 'add') game.addCounters(card, counter.counter, n, false, source.ctrl);
          else game.removeCounters(card, counter.counter, n);
        }
        return result;
      }};
    } else if (operation.event === 'lifegain') {
      assertFields(operation, [...common, 'transform'], 'life replacement');
      const transform = arithmetic(operation.transform);
      const applies = (game, n, player, source) => n > 0 && player === source.ctrl;
      replacement = {event: 'lifegain', applies, run: (game, n, player, source) => applies(game, n, player, source) ? transform(n) : n};
    } else if (operation.event === 'createToken') {
      assertFields(operation, [...common, 'factor', 'tokenType', 'token', 'tokenKey'], 'token replacement');
      if (operation.tokenType && !['Creature', 'Artifact'].includes(operation.tokenType)) throw new Error('Invalid v8 replacement token type');
      const modes = ['factor', 'token', 'tokenKey'].filter(key => operation[key] !== undefined);
      if (modes.length !== 1 || operation.factor !== undefined && (!Number.isSafeInteger(operation.factor) || operation.factor < 2 || operation.factor > 3)) throw new Error('Invalid v8 replacement token outcome');
      if (operation.tokenKey !== undefined && !MTG.TOKENS[operation.tokenKey]) throw new Error('Unknown v8 replacement token');
      const extra = operation.token ? helpers.token(operation.token) : operation.tokenKey;
      const matches = spec => !operation.tokenType || (typeof spec === 'string' ? MTG.TOKENS[spec] : spec)?.types?.includes(operation.tokenType);
      const applies = (game, defs, player, source) => player === source.ctrl && defs.length > 0 && defs.some(matches);
      replacement = {event: 'createToken', applies, run: (game, defs, player, source) => {
        if (!applies(game, defs, player, source)) return defs;
        if (operation.factor) return defs.flatMap(def => matches(def) ? Array(operation.factor).fill(def) : [def]);
        return [...defs, extra];
      }};
    } else throw new Error('Unsupported v8 replacement event');
    return {replace: [{...replacement, oracleOperation: operation}]};
  };
})();
