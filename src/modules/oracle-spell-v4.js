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
  const COST_KIND_SET = new Set([...COST_KINDS, 'exileGraveyard', 'returnPermanent', 'exileHand']);
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
    if(cost.object?.qualifier) {
      const q=cost.object.qualifier;
      invariant(q && typeof q==='object' && !Array.isArray(q) && Object.keys(q).every(key=>['subtypes','colors','notTypes','supertypes','nontoken','tapped','unblockedAttacker'].includes(key)), `${cost.id} unsupported cost qualifier`);
      for(const key of ['subtypes','colors','notTypes','supertypes'])if(q[key]!==undefined)
        invariant(Array.isArray(q[key]) && q[key].length>0 && q[key].every(value=>typeof value==='string'&&value.length) && new Set(q[key]).size===q[key].length, `${cost.id} invalid ${key}`);
      invariant(!q.colors || q.colors.every(color=>['W','U','B','R','G'].includes(color)), `${cost.id} invalid color`);
      invariant(!q.notTypes || q.notTypes.every(type=>['Artifact','Creature','Enchantment','Land','Planeswalker','Battle'].includes(type)), `${cost.id} invalid excluded type`);
      invariant(!q.supertypes || q.supertypes.every(type=>['Basic','Snow','Legendary'].includes(type)), `${cost.id} invalid supertype`);
      invariant(q.nontoken===undefined || q.nontoken===true, `${cost.id} invalid token qualifier`);
      for(const key of ['tapped','unblockedAttacker'])if(q[key]!==undefined)
        invariant(q[key]===true&&cost.kind==='returnPermanent',`${cost.id} invalid battlefield return qualifier`);
    }
    if (cost.kind === 'sacrifice' || cost.kind === 'returnPermanent') {
      validateQuantity(cost.quantity, cost.id);
      invariant(cost.object && cost.object.kind === 'permanent' && Array.isArray(cost.object.types) && cost.object.types.length,
        `${cost.id} cost needs permanent types`);
      return;
    }
    if (cost.kind === 'discard') {
      validateQuantity(cost.quantity, cost.id);
      invariant(cost.object && cost.object.kind === 'card', `${cost.id} discard needs a card object`);
      return;
    }
    if (cost.kind === 'exileGraveyard' || cost.kind === 'exileHand') {
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

  async function exileStackObject(game, stackObject, source) {
    const index=game.stack.indexOf(stackObject);
    if(index<0||stackObject.kind!=='spell')return false;
    // Exiling a spell does not counter it. Uncounterable spells and copies
    // therefore leave the Stack through the same zone action.
    game.stack.splice(index,1);
    if(!stackObject.isCopy&&stackObject.card?.zone==='stack')await game.move(stackObject.card,'exile');
    game.lg(`${stackObject.name} is exiled from the stack${stackObject.isCopy?' and the copy ceases to exist':''}.`,'exile');
    game.note('gameEffect',{kind:'exile',targetKind:'spell',stackObject,card:stackObject.card||null,source:source||null,destination:stackObject.isCopy?'ceased':'exile'});
    game.note('stack',{});return true;
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
      for (const target of targets) {
        if(target?.kind==='spell')await exileStackObject(game,target,ctx.src);
        else if(target.zone!=='exile'&&target.zone!=='ceased')await game.exileCard(target);
      }
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

  function costObjectMatches(card,cost,game) {
    if(!card)return false;
    const object = cost.object;
    if(object.types) {
      const checks = object.types.map(type => card.is(type));
      if (!(object.typeMatch === 'all' ? checks.every(Boolean) : checks.some(Boolean))) return false;
    }
    if (object.filters?.legendary && !(card.def?.super || []).includes('Legendary')) return false;
    const q=object.qualifier;
    if(q) {
      if(q.subtypes && !q.subtypes.every(type=>card.hasSub(type)))return false;
      if(q.colors && !q.colors.every(color=>card.colors.includes(color)))return false;
      if(q.notTypes?.some(type=>card.is(type)))return false;
      const supertypes=card.zone==='battlefield'?(card.cur?.super||card.def.super||[]):(card.def.super||[]);
      if(q.supertypes && !q.supertypes.every(type=>supertypes.includes(type)))return false;
      if(q.nontoken && card.isToken)return false;
      if(q.tapped && !card.tapped)return false;
      if(q.unblockedAttacker&&(!game?.combat?.attackers.includes(card)||!card.attacking||card.wasBlocked||card.blockedBy?.length))return false;
    }
    return true;
  }

  const allocationKey=kind=>({sacrifice:'sacrifices',discard:'discards',exileGraveyard:'exiles',returnPermanent:'returns',exileHand:'handExiles'}[kind]);
  function costPool(game,player,source,cost,plan) {
    const used=new Set([...(plan.reservedCards||[]),...(plan.sacrifices||[]),...(plan.discards||[]),...(plan.exiles||[]),...(plan.returns||[]),...(plan.handExiles||[])]);
    const battlefield=['sacrifice','returnPermanent'].includes(cost.kind);
    const pool=battlefield?game.bf():['discard','exileHand'].includes(cost.kind)?player.hand:player.graveyard;
    return pool.filter(card=>(card!==source||plan.allowSourceReturn&&cost.kind==='returnPermanent'||plan.allowSourceSacrifice&&cost.kind==='sacrifice') && !used.has(card) && (!battlefield || card.ctrl===player) &&
      costObjectMatches(card,cost,game) && (cost.kind!=='sacrifice'||game.canSacrifice(card)));
  }

  function clonedPlan(plan) {
    return {
      sacrifices: plan.sacrifices.slice(),
      discards: plan.discards.slice(),
      exiles: plan.exiles.slice(),
      returns: (plan.returns||[]).slice(),
      handExiles: (plan.handExiles||[]).slice(),
      life: plan.life,
      choices: plan.choices.slice(),
      selections: (plan.selections||[]).slice(),
      reservedCards: (plan.reservedCards||[]).slice(),
      allowSourceReturn: plan.allowSourceReturn,
      allowSourceSacrifice: plan.allowSourceSacrifice,
    };
  }

  function simulateCost(game, player, source, cost, ctx, plan) {
    const key=allocationKey(cost.kind);
    if(key) {
      const pool=costPool(game,player,source,cost,plan);
      if(pool.length<cost.quantity.min)return false;
      (plan[key]||=[]).push(...pool.slice(0,cost.quantity.min));
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
    for(const option of cost.options) {
      const branch=clonedPlan(plan);
      if(simulateCost(game,player,source,option,ctx,branch)) {Object.assign(plan,branch);return true;}
    }
    return false;
  }

  function canPayCosts(game, player, source, costs, ctx) {
    const plan = { sacrifices: [], discards: [], exiles: [], returns: [], life: 0, choices: [], selections: [], allowSourceReturn:ctx.allowSourceReturn===true, allowSourceSacrifice:ctx.allowSourceSacrifice===true };
    return costs.every(cost => simulateCost(game, player, source, cost, ctx, plan));
  }

  function costLabel(cost, ctx) {
    if (cost.kind === 'exileGraveyard') return `Exile ${cost.quantity.min} ${(cost.object.types || ['card']).join(' or ')} from your graveyard`;
    if (cost.kind === 'exileHand') return `Exile ${cost.quantity.min} ${(cost.object.types || ['card']).join(' or ')} from your hand`;
    if (cost.kind === 'sacrifice') return `Sacrifice ${cost.object.types.join(' or ')}`;
    if (cost.kind === 'returnPermanent') return `Return ${cost.quantity.min} permanent${cost.quantity.min===1?'':'s'} to their owners' hands`;
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
    const key=allocationKey(cost.kind);
    if(key) {
      const {min,max}=cost.quantity;
      let pool=costPool(game,player,source,cost,plan);
      if(ctx.oracleAdditionalManaCost&&cost.kind==='sacrifice'){
        if(min!==1||max!==1)return false;
        pool=pool.filter(card=>game.canPayMana(player,ctx.oracleAdditionalManaCost,
          {card:source,castOpts:ctx.castOpts||{},xVal:ctx.so.x||0},
          {xVal:ctx.so.x||0,protectedSacrifices:[...plan.reservedCards,...plan.sacrifices,card]}));
      }
      if(ctx.oracleEmergeManaCost){
        if(cost.kind!=='sacrifice'||min!==1||max!==1)return false;
        const mana=ctx.oracleEmergeManaCost;
        pool=pool.filter(card=>game.canPayMana(player,{...mana,xReduction:(mana.xReduction||0)+Math.max(0,Number(card.mv)||0)},
          {card:source,castOpts:ctx.castOpts||{},xVal:0},
          {protectedSacrifices:[...plan.reservedCards,...plan.sacrifices,card]}));
      }
      if (pool.length < min) return false;
      const versions=new Map(pool.map(card=>[card,card.zoneVersion]));
      const picked = await player.controller.decide(game, {
        type: 'chooseCards', from: pool, min, max,
        prompt: `${source.name}: ${costLabel(cost, ctx)}`,
        aiHint: { kind: ({sacrifice:'addlSac',discard:'addlDiscard',exileGraveyard:'delve',returnPermanent:'bounceCost',exileHand:'delve'}[cost.kind]), card: source,
          keepTargets:(ctx.targets||ctx.so.targets||[]).flat(Infinity),...(cost.kind==='sacrifice'?{required:min}:{}) },
      });
      if(ctx.strictCostChoices&&(!Array.isArray(picked)||picked.length<min||picked.length>max||new Set(picked).size!==picked.length||picked.some(card=>!pool.includes(card))))return false;
      const chosen = Array.isArray(picked) ? [...new Set(picked)].filter(card => pool.includes(card)) : [];
      if (chosen.length < min || chosen.length > max) return false;
      const current=costPool(game,player,source,cost,plan);
      if(chosen.some(card=>!current.includes(card)||card.zoneVersion!==versions.get(card)))return false;
      (plan[key]||=[]).push(...chosen);
      (plan.selections||=[]).push({cost,cards:chosen.map(card=>({card,zoneVersion:card.zoneVersion,zone:card.zone}))});
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
    const reservedCards=(ctx.so.oracleCostPlans||[]).flatMap(plan=>[...plan.sacrifices,...plan.discards,...plan.exiles,...(plan.returns||[]),...(plan.handExiles||[])]);
    const plan = { sacrifices: [], discards: [], exiles: [], returns: [], life: 0, choices: [], selections: [], reservedCards, allowSourceReturn:ctx.allowSourceReturn===true, allowSourceSacrifice:ctx.allowSourceSacrifice===true };
    const env = { game: ctx.g, player: ctx.you, source: ctx.src, ctx };
    for (const cost of costs) if (!await planCost(env, cost, plan)) return false;
    // Planning happens with target selection. No cost may be spent until the
    // engine has successfully paid the complete mana cost of the spell.
    (ctx.so.oracleCostPlans || (ctx.so.oracleCostPlans = [])).push(plan);
    return true;
  }

  MTG.commitOracleAdditionalCosts = async function(ctx) {
    const plans = ctx.so.oracleCostPlans || [];
    invariant(MTG.validateOracleAdditionalCostPlans(ctx),'additional cost objects changed before payment');
    delete ctx.so.oracleCostPlans;
    for (const plan of plans) {
    const record = {
      sacrifices: plan.sacrifices.map(card => ({ iid: card.iid, snapshot: ctx.g.snapshot(card) })),
      discards: plan.discards.map(card => card.iid),
      exiles: plan.exiles.map(card => card.iid),
      life: plan.life,
      choices: plan.choices.map(choice => ({ ...choice })),
      ...(plan.returns?.length?{returns:plan.returns.map(card=>card.iid)}:{}),
      ...(plan.handExiles?.length?{handExiles:plan.handExiles.map(card=>card.iid)}:{}),
    };
    if (plan.sacrifices.length) await ctx.g.sacrificeMany(ctx.you, plan.sacrifices);
    if (plan.discards.length) await ctx.g.discard(ctx.you, plan.discards, { noReplacement: true });
    if (plan.exiles.length) await ctx.g.moveGraveyardBatch(plan.exiles, 'exile');
    for(const card of plan.handExiles||[])await ctx.g.move(card,'exile');
    if (plan.returns?.length) await ctx.g.bounceMany(plan.returns);
    if (plan.life) await ctx.g.loseLife(ctx.you, plan.life, `${ctx.src.name} additional cost`);
    const previous=ctx.so.oracleV4AdditionalCost;
    ctx.so.oracleV4AdditionalCost = previous?{
      sacrifices:previous.sacrifices.concat(record.sacrifices),discards:previous.discards.concat(record.discards),
      exiles:previous.exiles.concat(record.exiles),life:previous.life+record.life,choices:previous.choices.concat(record.choices),
      ...(previous.returns||record.returns?{returns:(previous.returns||[]).concat(record.returns||[])}:{}),
      ...(previous.handExiles||record.handExiles?{handExiles:(previous.handExiles||[]).concat(record.handExiles||[])}:{}),
    }:record;
    }
    return true;
  };

  MTG.validateOracleAdditionalCostPlans = function(ctx) {
    const plans=ctx.so.oracleCostPlans||[];
    if(!plans.length)return true;
    // Other casting mechanics reserve destructive payments independently.
    // A card may be tapped for mana and then returned/sacrificed, so callers
    // reserve only cards that will leave their current zone as payment.
    const seen=new Set(ctx.reservedCards||[]);let life=0;
    for(const plan of plans) {
      life+=plan.life;
      for(const selection of plan.selections||[])for(const item of selection.cards) {
        const {card}=item,cost=selection.cost;
        if(seen.has(card)||card===ctx.src&&!(ctx.allowSourceReturn===true&&cost.kind==='returnPermanent'||ctx.allowSourceSacrifice===true&&cost.kind==='sacrifice')||card.zone!==item.zone||card.zoneVersion!==item.zoneVersion||!costObjectMatches(card,cost,ctx.g))return false;
        if(['sacrifice','returnPermanent'].includes(cost.kind)) {
          if(card.zone!=='battlefield'||card.ctrl!==ctx.you||!ctx.g.bf().includes(card)||cost.kind==='sacrifice'&&!ctx.g.canSacrifice(card))return false;
        } else if(!(['discard','exileHand'].includes(cost.kind)?ctx.you.hand:ctx.you.graveyard).includes(card))return false;
        seen.add(card);
      }
    }
    return ctx.you.life>=life;
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
      canPayContext:ctx=>canPayCosts(ctx.g,ctx.you,ctx.src,costs,ctx),
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
