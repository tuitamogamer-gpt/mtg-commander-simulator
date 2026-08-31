// ===== oracle-spell-v4.js =====
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});

// Runtime lowering for the fail-closed AST emitted by
// scripts/oracle-spell-v4.mjs. This module deliberately knows nothing about
// Oracle prose: every executable branch consumes a validated closed node.
(function () {
  const EFFECT_KINDS = Object.freeze([
    'becomeMonarch',
    'counterSpell',
    'createToken',
    'dealDamage',
    'destroy',
    'destroyAll',
    'discard',
    'draw',
    'exile',
    'exileAllGraveyards',
    'exileGraveyard',
    'gainLife',
    'investigate',
    'mill',
    'modifyPowerToughness',
    'modifyPowerToughnessAll',
    'proliferate',
    'putCounters',
    'returnToBattlefield',
    'returnToHand',
    'scry',
    'surveil',
    'tap',
    'tapOrUntap',
    'untap',
  ]);
  const EFFECT_KIND_SET = new Set(EFFECT_KINDS);
  const TARGET_KINDS = new Set(['card', 'damageable', 'permanent', 'player', 'spell']);
  const COST_KINDS = Object.freeze(['choice', 'discard', 'payLife', 'sacrifice', 'sequence']);
  // The frozen v4 parser manifest stays unchanged; v7 adds this explicit cost.
  const COST_KIND_SET = new Set([...COST_KINDS, 'exileGraveyard']);
  const OPERATION_KINDS = Object.freeze(['modal', 'sequence']);
  const OPERATION_KIND_SET = new Set(OPERATION_KINDS);

  function invariant(condition, message) {
    if (!condition) throw new Error(`Oracle spell v4: ${message}`);
  }

  function uniqueIdMap(entries, label) {
    invariant(Array.isArray(entries), `${label} must be an array`);
    const result = new Map();
    for (const entry of entries) {
      invariant(entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id,
        `${label} entry needs an id`);
      invariant(!result.has(entry.id), `duplicate ${label} id ${entry.id}`);
      result.set(entry.id, entry);
    }
    return result;
  }

  function validAmount(node) {
    if (!node || typeof node !== 'object') return false;
    if (node.kind === 'number') return Number.isFinite(node.value) && node.value >= 0;
    if (node.kind === 'variable') return node.name === 'X';
    if (node.kind === 'multiply') {
      return Array.isArray(node.operands) && node.operands.length >= 2 && node.operands.every(validAmount);
    }
    return false;
  }

  function amountValue(node, ctx) {
    invariant(validAmount(node), 'invalid amount node reached runtime');
    if (node.kind === 'number') return Math.max(0, Number(node.value) || 0);
    if (node.kind === 'variable') return Math.max(0, Number(ctx && (ctx.x ?? ctx.so?.x)) || 0);
    return node.operands.reduce((product, operand) => product * amountValue(operand, ctx), 1);
  }

  function validateQuantity(quantity, label) {
    invariant(quantity && Number.isInteger(quantity.min) && quantity.min >= 0,
      `${label} quantity min must be a nonnegative integer`);
    invariant(quantity.max === null || Number.isInteger(quantity.max) && quantity.max >= quantity.min,
      `${label} quantity max must be null or at least min`);
  }

  function validateCost(cost, seenIds) {
    invariant(cost && typeof cost === 'object' && COST_KIND_SET.has(cost.kind), 'unsupported additional cost');
    invariant(typeof cost.id === 'string' && cost.id && !seenIds.has(cost.id), 'additional cost ids must be unique');
    seenIds.add(cost.id);
    if (cost.kind === 'sacrifice') {
      validateQuantity(cost.quantity, cost.id);
      invariant(cost.object && cost.object.kind === 'permanent' && Array.isArray(cost.object.types) && cost.object.types.length,
        `${cost.id} sacrifice needs permanent types`);
      return;
    }
    if (cost.kind === 'discard') {
      validateQuantity(cost.quantity, cost.id);
      invariant(cost.object && cost.object.kind === 'card', `${cost.id} discard needs a card object`);
      return;
    }
    if (cost.kind === 'exileGraveyard') {
      validateQuantity(cost.quantity, cost.id);
      invariant(cost.object?.kind === 'card' && (!cost.object.types || Array.isArray(cost.object.types)), `${cost.id} exile needs a card filter`);
      return;
    }
    if (cost.kind === 'payLife') {
      invariant(validAmount(cost.amount), `${cost.id} payLife needs an amount`);
      return;
    }
    const children = cost.kind === 'choice' ? cost.options : cost.costs;
    invariant(Array.isArray(children) && children.length >= 2, `${cost.id} ${cost.kind} needs at least two children`);
    if (cost.kind === 'choice') {
      invariant(cost.choose && cost.choose.min === 1 && cost.choose.max === 1,
        `${cost.id} runtime supports exact-one cost choices`);
    }
    for (const child of children) validateCost(child, seenIds);
  }

  function validateOperation(operation) {
    invariant(operation && operation.kind === 'spell-v4', 'expected a spell-v4 wrapper');
    invariant(operation.parserVersion === 4, 'unsupported parser version');
    const targetMap = uniqueIdMap(operation.targets, 'target');
    const effectMap = uniqueIdMap(operation.effects, 'effect');
    const operationMap = uniqueIdMap(operation.operations, 'operation');
    invariant(operationMap.size === 1, 'exactly one top-level operation is required');

    for (const target of targetMap.values()) {
      invariant(TARGET_KINDS.has(target.kind), `unsupported target kind ${target.kind}`);
      validateQuantity(target.quantity, target.id);
    }
    for (const effect of effectMap.values()) {
      invariant(EFFECT_KIND_SET.has(effect.kind), `unsupported effect kind ${effect.kind}`);
      invariant(Array.isArray(effect.targetIds), `${effect.id} needs targetIds`);
      for (const id of effect.targetIds) invariant(targetMap.has(id), `${effect.id} references missing target ${id}`);
      if (effect.amount !== undefined) invariant(validAmount(effect.amount), `${effect.id} has an invalid amount`);
      if (effect.kind === 'counterSpell' && effect.unless) {
        invariant(effect.unless.kind === 'controllerPaysMana' &&
          effect.unless.amount?.kind === 'genericMana' &&
          Number.isInteger(effect.unless.amount.value) && effect.unless.amount.value >= 0,
        `${effect.id} has an unsupported counter exception`);
      }
    }

    const top = operation.operations[0];
    invariant(OPERATION_KIND_SET.has(top.kind), `unsupported operation kind ${top.kind}`);
    const referencedEffects = new Set();
    if (top.kind === 'sequence') {
      invariant(Array.isArray(top.effectIds) && top.effectIds.length, 'sequence needs effects');
      for (const id of top.effectIds) {
        invariant(effectMap.has(id), `sequence references missing effect ${id}`);
        referencedEffects.add(id);
      }
    } else {
      invariant(top.choose && Number.isInteger(top.choose.min) && Number.isInteger(top.choose.max) &&
        top.choose.min >= 1 && top.choose.max >= top.choose.min,
      'modal choose range is invalid');
      invariant(Array.isArray(top.options) && top.options.length >= top.choose.max, 'modal has too few options');
      const modeIds = new Set();
      for (const option of top.options) {
        invariant(option && typeof option.id === 'string' && !modeIds.has(option.id), 'modal option ids must be unique');
        modeIds.add(option.id);
        invariant(Array.isArray(option.effectIds) && option.effectIds.length, `${option.id} needs effects`);
        invariant(Array.isArray(option.targetIds), `${option.id} needs targetIds`);
        for (const id of option.effectIds) {
          invariant(effectMap.has(id), `${option.id} references missing effect ${id}`);
          referencedEffects.add(id);
        }
        for (const id of option.targetIds) invariant(targetMap.has(id), `${option.id} references missing target ${id}`);
        const optionEffectTargets = new Set(option.effectIds.flatMap(id => effectMap.get(id).targetIds));
        invariant(option.targetIds.every(id => optionEffectTargets.has(id)) &&
          optionEffectTargets.size === new Set(option.targetIds).size,
        `${option.id} targetIds must exactly cover its effects`);
      }
    }
    invariant(referencedEffects.size === effectMap.size, 'every effect must belong to the top-level operation');

    const costIds = new Set();
    invariant(Array.isArray(operation.additionalCosts), 'additionalCosts must be an array');
    for (const cost of operation.additionalCosts) validateCost(cost, costIds);
    return { targetMap, effectMap, top };
  }

  function targetTypesMatch(card, target) {
    if (!card || typeof card.is !== 'function') return false;
    const types = target.types || target.cardTypes || [];
    if (!types.length) return true;
    const checks = types.map(type => type === 'Permanent'
      ? ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].some(candidate => card.is(candidate))
      : card.is(type));
    return target.typeMatch === 'all' ? checks.every(Boolean) : checks.some(Boolean);
  }

  function targetFiltersMatch(game, candidate, caster, target, source) {
    if (target.kind === 'player') return target.relation !== 'opponent' || candidate !== caster;
    if (target.kind === 'damageable') return candidate instanceof MTG.Player ||
      !!(candidate && typeof candidate.is === 'function' &&
        (candidate.is('Creature') || candidate.is('Planeswalker') || candidate.is('Battle')));
    if (target.kind === 'spell') {
      if (!candidate || candidate.kind !== 'spell') return false;
      const card = candidate.card;
      if (target.spellTypes && !target.spellTypes.some(type =>
        card && game.castHasType(card, candidate.castOpts || {}, type))) return false;
      if (target.filters?.noncreature && card && game.castHasType(card, candidate.castOpts || {}, 'Creature')) return false;
      return true;
    }
    if (!candidate || !targetTypesMatch(candidate, target)) return false;
    if (target.controller === 'you' && candidate.ctrl !== caster) return false;
    if (['opponent', 'notYou'].includes(target.controller) && candidate.ctrl === caster) return false;
    if (target.kind === 'card') {
      if (target.owner === 'you' && candidate.owner !== caster) return false;
    }
    const filters = target.filters || {};
    if (filters.tapped !== undefined && !!candidate.tapped !== filters.tapped) return false;
    if (filters.attacking && !candidate.attacking) return false;
    if (filters.blocking && (candidate.blocking === null || candidate.blocking === undefined || candidate.blocking === false)) return false;
    if (filters.nonland && candidate.is('Land')) return false;
    if (filters.noncreature && candidate.is('Creature')) return false;
    if (filters.legendary && !(candidate.def?.super || []).includes('Legendary')) return false;
    if (target.subtypes && !target.subtypes.every(subtype => candidate.hasSub && candidate.hasSub(subtype))) return false;
    return true;
  }

  function targetGoal(effects, target) {
    const effect = effects.find(candidate => candidate.targetIds.includes(target.id));
    if (!effect) return 'control';
    const goals = {
      counterSpell: 'counter',
      dealDamage: 'damage',
      destroy: 'removal',
      discard: 'discard',
      draw: 'draw',
      exile: 'removal',
      exileGraveyard: 'graveyardHate',
      gainLife: 'lifegain',
      mill: 'mill',
      modifyPowerToughness: Number(effect.power || 0) >= 0 && Number(effect.toughness || 0) >= 0 ? 'buff' : 'removal',
      putCounters: String(effect.counterType || '').startsWith('-') ? 'removal' : 'buff',
      returnToBattlefield: 'recur',
      returnToHand: target.zone === 'graveyard' ? 'recur' : 'bounce',
      tap: 'tap',
      tapOrUntap: 'tap',
      untap: 'untap',
    };
    return goals[effect.kind] || 'control';
  }

  function targetPrompt(target, goal) {
    const count = target.quantity.max === null ? 'any number of' : target.quantity.max > 1 ? String(target.quantity.max) : '';
    const noun = target.kind === 'damageable' ? 'targets'
      : target.kind === 'card' ? 'cards'
        : target.kind === 'spell' ? 'spells'
          : target.kind === 'player' ? 'players' : 'permanents';
    return `Oracle v4 ${goal}: ${count ? `${count} ` : ''}${noun}`;
  }

  function makeTargetSpec(target, effects) {
    const goal = targetGoal(effects, target);
    const spec = {
      what: target.kind === 'damageable' ? 'any'
        : target.kind === 'player' ? (target.relation === 'opponent' ? 'opponent' : 'player')
          : target.kind === 'spell' ? 'spell'
            : target.kind === 'card' ? 'card' : 'permanent',
      zone: target.zone || (target.kind === 'spell' ? 'stack' : target.kind === 'card' ? 'graveyard' : 'battlefield'),
      min: target.quantity.min,
      count: target.quantity.max,
      upTo: target.quantity.min === 0,
      prompt: targetPrompt(target, goal),
      aiHint: { goal },
      filter: (game, candidate, caster, source) => targetFiltersMatch(game, candidate, caster, target, source),
    };
    if (target.kind === 'card' && target.owner === 'any') spec.anyGraveyard = true;
    if (target.quantity.max === null) spec.oracleAnyNumber = true;
    return spec;
  }

  function materializeTargetSpecs(game, source, caster, targetIds, targetMap, effects) {
    return targetIds.map(id => {
      const spec = makeTargetSpec(targetMap.get(id), effects);
      if (spec.oracleAnyNumber) {
        const probe = Object.assign({}, spec, { count: 1 });
        spec.count = game.legalTargets(probe, source, caster).length;
        delete spec.oracleAnyNumber;
      }
      return spec;
    });
  }

  function targetIdsForEffects(effectIds, effectMap, targetOrder) {
    const used = new Set(effectIds.flatMap(id => effectMap.get(id).targetIds));
    return targetOrder.filter(id => used.has(id));
  }

  function snapshotResolutionTargets(values) {
    return values.map(value => (Array.isArray(value) ? value : [value]).filter(Boolean).map(target => ({
      target,
      zoneVersion: target instanceof MTG.CardInst ? target.zoneVersion : null,
    })));
  }

  function targetMapForResolution(ids, references) {
    const map = new Map();
    ids.forEach((id, index) => map.set(id, references[index] || []));
    return map;
  }

  function flattenedEffectTargets(effect, chosenTargets) {
    // The engine revalidates legality at the start of resolution. Later effects
    // must still reference that same object: a zone change creates a new one,
    // even though this engine reuses its CardInst (CR 400.7).
    return effect.targetIds.flatMap(id => (chosenTargets.get(id) || [])
      .filter(reference => reference.zoneVersion === null ||
        reference.target.zoneVersion === reference.zoneVersion)
      .map(reference => reference.target));
  }

  function effectPlayer(effect, chosenTargets, ctx) {
    if (effect.actor === 'you' || !effect.targetIds.length) return ctx.you;
    const target = flattenedEffectTargets(effect, chosenTargets)[0];
    return target instanceof MTG.Player ? target : null;
  }

  function matchesScope(card, scope, controller) {
    if (!card || typeof card.is !== 'function') return false;
    if (scope.controller === 'you' && card.ctrl !== controller) return false;
    if (scope.controller === 'opponent' && card.ctrl === controller) return false;
    const types = scope.types || scope.cardTypes || [];
    if (types.length && !types.some(type => type === 'Permanent'
      ? ['Artifact', 'Battle', 'Creature', 'Enchantment', 'Land', 'Planeswalker'].some(candidate => card.is(candidate))
      : card.is(type))) return false;
    if (scope.filters?.nonland && card.is('Land')) return false;
    return true;
  }

  function tokenDefinition(effect) {
    const token = effect.token;
    const key = String(token.name || '').toLowerCase();
    if (MTG.TOKENS && MTG.TOKENS[key]) return key;
    return {
      name: token.name,
      cost: null,
      super: [],
      types: (token.types || ['Artifact']).slice(),
      subtypes: [token.name],
      oracle: '',
      kws: [],
      isTokenDef: true,
    };
  }

  async function discardCards(ctx, player, count, prompt) {
    if (!player || count <= 0) return;
    const n = Math.min(count, player.hand.length);
    if (!n) return;
    const picked = await player.controller.decide(ctx.g, {
      type: 'chooseCards',
      from: player.hand.slice(),
      min: n,
      max: n,
      prompt,
      aiHint: { kind: 'cleanupDiscard' },
    });
    const cards = Array.isArray(picked) ? [...new Set(picked)].filter(card => player.hand.includes(card)).slice(0, n) : [];
    if (cards.length !== n) return;
    await ctx.g.discard(player, cards);
  }

  async function returnStackObjectToHand(game, stackObject, source) {
    const index = game.stack.indexOf(stackObject);
    if (index < 0 || stackObject.kind !== 'spell') return false;
    game.stack.splice(index, 1);
    const leavesStackExiled = stackObject.castOpts &&
      (stackObject.castOpts.flashback || stackObject.castOpts.jumpstart);
    const destination = stackObject.isCopy ? 'ceased' : (leavesStackExiled ? 'exile' : 'hand');
    if (!stackObject.isCopy && stackObject.card && stackObject.card.zone === 'stack') {
      await game.move(stackObject.card, destination);
    }
    game.lg(stackObject.isCopy
      ? `${stackObject.name} is returned from the stack and the copy ceases to exist.`
      : `${stackObject.name} is returned from the stack to its owner's ${destination}.`, 'bounce');
    game.note('gameEffect', {
      kind: 'bounce', targetKind: 'spell', stackObject,
      card: stackObject.card || null, source: source || null, destination,
    });
    game.note('stack', {});
    return true;
  }

  async function runEffect(ctx, effect, chosenTargets) {
    const game = ctx.g;
    const targets = flattenedEffectTargets(effect, chosenTargets);
    const n = effect.amount ? amountValue(effect.amount, ctx) : 0;
    if (effect.kind === 'draw') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await game.draw(player, n);
      return;
    }
    if (effect.kind === 'discard') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await discardCards(ctx, player, n, `${ctx.src.name}: discard ${n}`);
      return;
    }
    if (effect.kind === 'counterSpell') {
      for (const stackObject of targets) {
        if (!stackObject || !game.stack.includes(stackObject)) continue;
        const tax = effect.unless?.amount?.value;
        if (tax !== undefined) {
          const cost = MTG.parseCost(`{${tax}}`);
          const payer = stackObject.ctrl;
          if (payer && game.canPayMana(payer, cost)) {
            const choice = await payer.controller.decide(game, {
              type: 'chooseOption',
              prompt: `Pay {${tax}} to save ${stackObject.name}?`,
              options: [{ key: 'yes', label: `Pay {${tax}}` }, { key: 'no', label: 'Do not pay' }],
              aiHint: { kind: 'taxCounter', amount: tax, card: stackObject.card },
            });
            if (choice === 'yes' && await game.payMana(payer, cost)) continue;
          }
        }
        // Each chosen spell is its own counter attempt.  The authoritative
        // primitive preserves uncounterable spells without skipping later
        // targets (and a counter-unless payer may still choose to pay).
        await game.counterStackObject(stackObject, { source: ctx.src });
      }
      return;
    }
    if (effect.kind === 'gainLife') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await game.gainLife(player, n, ctx.src);
      return;
    }
    if (effect.kind === 'dealDamage') {
      for (const target of targets) await game.damageAny(ctx.src, target, n, { deferSBA: true });
      return;
    }
    if (effect.kind === 'destroy') {
      for (const target of targets) if (target.zone === 'battlefield') {
        await game.destroy(target, { noRegen: effect.canRegenerate === false, source: ctx.src });
      }
      return;
    }
    if (effect.kind === 'destroyAll') {
      await game.destroyMany(game.bf().filter(card => matchesScope(card, effect.scope || {}, ctx.you)), {
        source: ctx.src,
      });
      return;
    }
    if (effect.kind === 'exile') {
      for (const target of targets) if (target.zone !== 'exile' && target.zone !== 'ceased') await game.exileCard(target);
      return;
    }
    if (effect.kind === 'exileGraveyard') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await game.moveGraveyardBatch(player.graveyard.slice(), 'exile');
      return;
    }
    if (effect.kind === 'exileAllGraveyards') {
      await game.moveGraveyardBatch(game.players.flatMap(player => player.graveyard.slice()), 'exile');
      return;
    }
    if (effect.kind === 'returnToHand') {
      for (const target of targets) {
        if (target && target.kind === 'spell') {
          await returnStackObjectToHand(game, target, ctx.src);
        } else if (target && !['hand', 'ceased'].includes(target.zone)) {
          await game.move(target, 'hand');
        }
      }
      return;
    }
    if (effect.kind === 'returnToBattlefield') {
      const enter = async () => {
        for (const target of targets) {
          if (target.zone !== 'graveyard') continue;
          const controller = effect.controller === 'you' ? ctx.you : target.owner;
          await game.putPermanentOntoBattlefield(target,controller,{tapped:!!effect.tapped});
        }
      };
      if (typeof game.withBattlefieldEntryBatch === 'function') await game.withBattlefieldEntryBatch(enter);
      else await enter();
      return;
    }
    if (effect.kind === 'tap' || effect.kind === 'untap') {
      for (const target of targets) {
        if (target.zone !== 'battlefield') continue;
        if (effect.kind === 'tap') game.tap(target);
        else game.untap(target);
      }
      return;
    }
    if (effect.kind === 'tapOrUntap') {
      for (const target of targets) {
        if (target.zone !== 'battlefield') continue;
        const preferUntap = target.ctrl === ctx.you || target.tapped;
        const options = preferUntap
          ? [{ key: 'untap', label: `Untap ${target.name}` }, { key: 'tap', label: `Tap ${target.name}` }]
          : [{ key: 'tap', label: `Tap ${target.name}` }, { key: 'untap', label: `Untap ${target.name}` }];
        const choice = await ctx.you.controller.decide(game, {
          type: 'chooseOption',
          prompt: `${ctx.src.name}: tap or untap ${target.name}?`,
          options,
          aiHint: { kind: 'tapOrUntap', card: target },
        });
        if (choice === 'untap') game.untap(target);
        else game.tap(target);
      }
      return;
    }
    if (effect.kind === 'createToken') {
      const controller = effectPlayer(effect, chosenTargets, ctx);
      if (controller) await game.makeTokens(tokenDefinition(effect), controller, {
        n,
        tapped: !!effect.token.tapped,
      });
      return;
    }
    if (effect.kind === 'investigate') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      invariant(MTG.E && typeof MTG.E.investigate === 'function', 'investigate runtime helper is unavailable');
      if (player) await MTG.E.investigate(game, player, n);
      return;
    }
    if (effect.kind === 'proliferate') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      invariant(MTG.E && typeof MTG.E.proliferate === 'function', 'proliferate runtime helper is unavailable');
      if (player) await MTG.E.proliferate(game, player);
      return;
    }
    if (effect.kind === 'becomeMonarch') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await game.becomeMonarch(player, { source: ctx.src, reason: 'Oracle spell' });
      return;
    }
    if (effect.kind === 'modifyPowerToughness') {
      for (const target of targets) if (target.zone === 'battlefield') {
        MTG.E.pumpUntilEOT(game, target, effect.power, effect.toughness, effect.keywords || []);
      }
      return;
    }
    if (effect.kind === 'modifyPowerToughnessAll') {
      MTG.E.pumpAllUntilEOT(game,
        (currentGame, card) => matchesScope(card, effect.scope || {}, ctx.you),
        effect.power, effect.toughness, effect.keywords || []);
      return;
    }
    if (effect.kind === 'putCounters') {
      for (const target of targets) if (target.zone === 'battlefield') {
        if (effect.counterType === '-1/-1' && typeof game.addM1 === 'function') await game.addM1(target, n, ctx.you);
        else game.addCounters(target, effect.counterType, n, false, ctx.you);
      }
      return;
    }
    if (effect.kind === 'mill') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      if (player) await game.mill(player, n);
      return;
    }
    if (effect.kind === 'scry' || effect.kind === 'surveil') {
      const player = effectPlayer(effect, chosenTargets, ctx);
      invariant(MTG.E && typeof MTG.E[effect.kind] === 'function', `${effect.kind} runtime helper is unavailable`);
      if (player) await MTG.E[effect.kind](game, player, n);
      return;
    }
    invariant(false, `effect ${effect.kind} reached no executable branch`);
  }

  async function runEffects(ctx, effectIds, effectMap, chosenTargets) {
    for (const id of effectIds) await runEffect(ctx, effectMap.get(id), chosenTargets);
  }

  function sacrificeMatches(card, cost) {
    if (!card || card.zone !== 'battlefield') return false;
    const object = cost.object;
    const checks = object.types.map(type => card.is(type));
    if (!(object.typeMatch === 'all' ? checks.every(Boolean) : checks.some(Boolean))) return false;
    if (object.filters?.legendary && !(card.def?.super || []).includes('Legendary')) return false;
    return true;
  }

  function clonedPlan(plan) {
    return {
      sacrifices: plan.sacrifices.slice(),
      discards: plan.discards.slice(),
      exiles: plan.exiles.slice(),
      life: plan.life,
      choices: plan.choices.slice(),
    };
  }

  function simulateCost(game, player, source, cost, ctx, plan) {
    if (cost.kind === 'exileGraveyard') {
      const pool = player.graveyard.filter(card => card !== source && !plan.exiles.includes(card) &&
        (!cost.object.types || cost.object.types.some(type => card.is(type))));
      if (pool.length < cost.quantity.min) return false;
      plan.exiles.push(...pool.slice(0, cost.quantity.min));
      return true;
    }
    if (cost.kind === 'sacrifice') {
      const needed = cost.quantity.min;
      const pool = game.bf().filter(card => card.ctrl === player && !plan.sacrifices.includes(card) &&
        sacrificeMatches(card, cost) && game.canSacrifice(card));
      if (pool.length < needed) return false;
      plan.sacrifices.push(...pool.slice(0, needed));
      return true;
    }
    if (cost.kind === 'discard') {
      const needed = cost.quantity.min;
      const pool = player.hand.filter(card => card !== source && !plan.discards.includes(card));
      if (pool.length < needed) return false;
      plan.discards.push(...pool.slice(0, needed));
      return true;
    }
    if (cost.kind === 'payLife') {
      const life = amountValue(cost.amount, ctx);
      if (player.life < plan.life + life) return false;
      plan.life += life;
      return true;
    }
    if (cost.kind === 'sequence') {
      return cost.costs.every(child => simulateCost(game, player, source, child, ctx, plan));
    }
    return cost.options.some(option => simulateCost(game, player, source, option, ctx, clonedPlan(plan)));
  }

  function canPayCosts(game, player, source, costs, ctx) {
    const plan = { sacrifices: [], discards: [], exiles: [], life: 0, choices: [] };
    return costs.every(cost => simulateCost(game, player, source, cost, ctx, plan));
  }

  function costLabel(cost, ctx) {
    if (cost.kind === 'exileGraveyard') return `Exile ${cost.quantity.min} ${(cost.object.types || ['card']).join(' or ')} from your graveyard`;
    if (cost.kind === 'sacrifice') return `Sacrifice ${cost.object.types.join(' or ')}`;
    if (cost.kind === 'discard') return `Discard ${cost.quantity.min} card${cost.quantity.min === 1 ? '' : 's'}`;
    if (cost.kind === 'payLife') return `Pay ${amountValue(cost.amount, ctx)} life`;
    return cost.kind === 'choice' ? 'Choose an additional cost' : 'Pay combined costs';
  }

  function choiceKey(cost) {
    if (cost.kind === 'discard') return 'discard';
    if (cost.kind === 'payLife') return 'life';
    if (cost.kind === 'sacrifice') return 'sacrifice';
    return cost.id;
  }

  async function planCost(env, cost, plan) {
    const { game, player, source, ctx } = env;
    if (cost.kind === 'exileGraveyard') {
      const pool = player.graveyard.filter(card => card !== source && !plan.exiles.includes(card) &&
        (!cost.object.types || cost.object.types.some(type => card.is(type))));
      const {min, max} = cost.quantity;
      if (pool.length < min) return false;
      const picked = await player.controller.decide(game, {type:'chooseCards', from:pool, min, max,
        prompt:`${source.name}: ${costLabel(cost, ctx)}`, aiHint:{kind:'delve', card:source}});
      const chosen = Array.isArray(picked) ? [...new Set(picked)].filter(card => pool.includes(card)) : [];
      if (chosen.length < min || chosen.length > max) return false;
      plan.exiles.push(...chosen);
      return true;
    }
    if (cost.kind === 'sacrifice') {
      const min = cost.quantity.min;
      const max = cost.quantity.max;
      const pool = game.bf().filter(card => card.ctrl === player && !plan.sacrifices.includes(card) &&
        sacrificeMatches(card, cost) && game.canSacrifice(card));
      if (pool.length < min) return false;
      const picked = await player.controller.decide(game, {
        type: 'chooseCards', from: pool, min, max,
        prompt: `${source.name}: ${costLabel(cost, ctx)}`,
        aiHint: { kind: 'addlSac', card: source, required: min },
      });
      const chosen = Array.isArray(picked) ? [...new Set(picked)].filter(card => pool.includes(card)) : [];
      if (chosen.length < min || chosen.length > max) return false;
      plan.sacrifices.push(...chosen);
      return true;
    }
    if (cost.kind === 'discard') {
      const min = cost.quantity.min;
      const max = cost.quantity.max;
      const pool = player.hand.filter(card => card !== source && !plan.discards.includes(card));
      if (pool.length < min) return false;
      const picked = await player.controller.decide(game, {
        type: 'chooseCards', from: pool, min, max,
        prompt: `${source.name}: ${costLabel(cost, ctx)}`,
        aiHint: { kind: 'addlDiscard', card: source },
      });
      const chosen = Array.isArray(picked) ? [...new Set(picked)].filter(card => pool.includes(card)) : [];
      if (chosen.length < min || chosen.length > max) return false;
      plan.discards.push(...chosen);
      return true;
    }
    if (cost.kind === 'payLife') {
      const life = amountValue(cost.amount, ctx);
      if (player.life < plan.life + life) return false;
      plan.life += life;
      return true;
    }
    if (cost.kind === 'sequence') {
      for (const child of cost.costs) if (!await planCost(env, child, plan)) return false;
      return true;
    }

    const viable = cost.options.map((option, index) => ({ option, index }))
      .filter(({ option }) => simulateCost(game, player, source, option, ctx, clonedPlan(plan)));
    if (!viable.length) return false;
    let selected = viable[0];
    if (viable.length > 1) {
      const discardOrLife = viable.some(entry => entry.option.kind === 'discard') &&
        viable.some(entry => entry.option.kind === 'payLife');
      const options = viable.map(entry => ({
        key: discardOrLife ? choiceKey(entry.option) : String(entry.index),
        label: costLabel(entry.option, ctx),
      }));
      const picked = await player.controller.decide(game, {
        type: 'chooseOption',
        prompt: `${source.name}: choose an additional cost`,
        options,
        aiHint: discardOrLife
          ? { kind: 'bitterTriumphCost', card: source,
            life: amountValue(viable.find(entry => entry.option.kind === 'payLife').option.amount, ctx) }
          : { kind: 'oracleV4AdditionalCost', card: source },
      });
      const found = options.findIndex(option => option.key === picked);
      if (found >= 0) selected = viable[found];
    }
    plan.choices.push({ costId: cost.id, optionId: selected.option.id });
    return planCost(env, selected.option, plan);
  }

  async function planAndCommitCosts(ctx, costs) {
    const plan = { sacrifices: [], discards: [], exiles: [], life: 0, choices: [] };
    const env = { game: ctx.g, player: ctx.you, source: ctx.src, ctx };
    for (const cost of costs) if (!await planCost(env, cost, plan)) return false;
    // Planning happens with target selection. No cost may be spent until the
    // engine has successfully paid the complete mana cost of the spell.
    (ctx.so.oracleCostPlans || (ctx.so.oracleCostPlans = [])).push(plan);
    return true;
  }

  MTG.commitOracleAdditionalCosts = async function(ctx) {
    const plans = ctx.so.oracleCostPlans || [];
    delete ctx.so.oracleCostPlans;
    for (const plan of plans) {
    const record = {
      sacrifices: plan.sacrifices.map(card => ({ iid: card.iid, snapshot: ctx.g.snapshot(card) })),
      discards: plan.discards.map(card => card.iid),
      exiles: plan.exiles.map(card => card.iid),
      life: plan.life,
      choices: plan.choices.map(choice => ({ ...choice })),
    };
    if (plan.sacrifices.length) await ctx.g.sacrificeMany(ctx.you, plan.sacrifices);
    if (plan.discards.length) await ctx.g.discard(ctx.you, plan.discards, { noReplacement: true });
    if (plan.exiles.length) await ctx.g.moveGraveyardBatch(plan.exiles, 'exile');
    if (plan.life) await ctx.g.loseLife(ctx.you, plan.life, `${ctx.src.name} additional cost`);
    ctx.so.oracleV4AdditionalCost = record;
    }
    return true;
  };

  function modeLabel(option, effectMap, index) {
    if (option.label) return option.label;
    const names = option.effectIds.map(id => effectMap.get(id).kind);
    return names.length ? names.join(' + ') : `Mode ${index + 1}`;
  }

  MTG.ORACLE_SPELL_V4_RUNTIME = Object.freeze({
    parserVersion: 4,
    effectKinds: EFFECT_KINDS,
    costKinds: COST_KINDS,
    operationKinds: OPERATION_KINDS,
  });

  MTG.compileOracleAdditionalCosts = function(costs) {
    const ids=new Set();for(const cost of costs)validateCost(cost,ids);
    return {
      castCond:(game,player,card)=>canPayCosts(game,player,card,costs,{g:game,you:player,src:card,x:0,so:{x:0}}),
      prepareTargets:async ctx=>planAndCommitCosts(ctx,costs),
    };
  };

  MTG.compileOracleSpellV4 = function (operation) {
    const { targetMap, effectMap, top } = validateOperation(operation);
    const targetsInOrder = operation.targets.map(target => target.id);
    const effects = operation.effects.slice();
    const fragment = {
      oracleSpellV4: true,
      oracleSpellV4Operation: operation,
    };

    if (operation.additionalCosts.length) {
      fragment.castCond = (game, player, card) => canPayCosts(game, player, card,
        operation.additionalCosts, { g: game, you: player, src: card, x: 0, so: { x: 0 } });
      fragment.prepareTargets = async ctx => planAndCommitCosts(ctx, operation.additionalCosts);
    }

    if (top.kind === 'sequence') {
      const targetIds = targetIdsForEffects(top.effectIds, effectMap, targetsInOrder);
      fragment.targets = (game, card, castOpts, caster) =>
        materializeTargetSpecs(game, card, caster || card?.owner, targetIds, targetMap, effects);
      fragment.resolve = async ctx => {
        const references = snapshotResolutionTargets(ctx.targets || []);
        const chosenTargets = targetMapForResolution(targetIds, references);
        await runEffects(ctx, top.effectIds, effectMap, chosenTargets);
      };
      return fragment;
    }

    fragment.modes = {
      pick: top.choose.min === top.choose.max ? top.choose.min : 'any',
      min: top.choose.min,
      repeats: false,
      list: top.options.map((option, index) => ({
        label: modeLabel(option, effectMap, index),
        targets: (game, card, castOpts, caster) =>
          materializeTargetSpecs(game, card, caster || card.owner, option.targetIds, targetMap, effects),
      })),
    };
    fragment.resolve = async ctx => {
      const selectedModes = Array.isArray(ctx.mode) ? ctx.mode : [];
      invariant(selectedModes.length >= top.choose.min && selectedModes.length <= top.choose.max,
        'resolved modal selection has the wrong number of modes');
      invariant(new Set(selectedModes).size === selectedModes.length, 'modal modes may not repeat');
      // Capture every mode before executing the first one; otherwise a later
      // mode would accidentally adopt an earlier mode's new-zone object.
      const references = snapshotResolutionTargets(ctx.targets || []);
      let targetOffset = 0;
      for (const modeIndex of selectedModes.slice().sort((left, right) => left - right)) {
        const option = top.options[modeIndex];
        invariant(option, `resolved modal mode ${modeIndex} does not exist`);
        const values = references.slice(targetOffset, targetOffset + option.targetIds.length);
        targetOffset += option.targetIds.length;
        await runEffects(ctx, option.effectIds, effectMap, targetMapForResolution(option.targetIds, values));
      }
    };
    return fragment;
  };
})();
