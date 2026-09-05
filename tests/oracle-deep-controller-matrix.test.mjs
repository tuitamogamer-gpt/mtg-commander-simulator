import {printedTokenName} from './helpers/oracle-token-name.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { castThroughSuspend } from './helpers/oracle-suspend-cast-proof.mjs';

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function oracleRows() {
  // Frozen v4 regression cohort; v5 has its own complete operation drivers.
  return MTG.ORACLE_BATCHES.filter(batch => batch.sequence <= 46).flatMap(batch => batch.cards
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => ({ batch, entry })));
}

function fixtureDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{12}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  }, extras);
}

function zoneCard(player, definition, zone) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, definition) {
  const card = new MTG.CardInst(definition, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

function fillLibrary(player, n = 80) {
  for (let index = 0; index < n; index++) zoneCard(player, 'Forest', 'library');
}

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'mulligan') return false;
  if (query.type === 'bottomCards') return [];
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return Math.min(query.max, Math.max(query.min || 0, 3));
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || query.count || 0).map(option => option.key);
  if (query.type === 'chooseManaSources') {
    return (query.sources || query.candidates || []).slice(0, query.count || query.min || 0);
  }
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  if (query.type === 'cardReveal' || query.type === 'threatAlert' || query.type === 'manualResolve') return 'ok';
  return null;
}

function humanController(card, state) {
  return {
    decide: async (game, query) => {
      state.trace.push(query.type);
      if (query.type === 'attackers' && state.attackCard && query.eligible.includes(state.attackCard)) {
        return [{ card: state.attackCard, target: state.attackTarget || query.opponents[0] }];
      }
      if (query.type === 'main' && !state.submitted) {
        const suspend=(query.acts||[]).find(candidate=>candidate.card===card&&candidate.suspend);
        if(!card.def.cost&&suspend){state.submitted=true;return {kind:'activate',entry:suspend};}
        const land = query.lands.find(candidate => candidate === card);
        if (land) {
          state.submitted = true;
          return { kind: 'land', card: land };
        }
        const cast = query.casts.find(candidate => candidate.card === card);
        if (cast) {
          state.submitted = true;
          return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
        }
      }
      if (query.type === 'priority' && !state.submitted) {
        const cast = query.casts.find(candidate => candidate.card === card);
        if (cast) {
          state.submitted = true;
          return { kind: 'cast', card: cast.card, alt: cast.alt, from: cast.from };
        }
      }
      if (query.type === 'chooseTargets') {
        const goal = String(query.aiHint?.goal || '');
        const friendlyGoal = /buff|recur|untap/.test(goal);
        const hostileGoal = /bounce|damage|debuff|discard|mill|removal|tap/.test(goal);
        const strategicallyOrdered = state.preferredTargets.slice().sort((left, right) => {
          const controller = candidate => candidate instanceof MTG.Player
            ? candidate : candidate.zone === 'battlefield' ? candidate.ctrl : candidate.owner;
          const leftFriendly = controller(left) === state.player;
          const rightFriendly = controller(right) === state.player;
          const leftScore = friendlyGoal ? Number(leftFriendly) : hostileGoal ? Number(!leftFriendly) : 0;
          const rightScore = friendlyGoal ? Number(rightFriendly) : hostileGoal ? Number(!rightFriendly) : 0;
          return rightScore - leftScore;
        });
        const preferred = strategicallyOrdered.filter(target => query.candidates.includes(target));
        const selected = preferred.slice(0, query.max || preferred.length);
        for (const candidate of query.candidates) {
          if (selected.length >= (query.min || 0)) break;
          if (!selected.includes(candidate)) selected.push(candidate);
        }
        return selected;
      }
      if (query.type === 'chooseX' && state.chooseX !== undefined) {
        return Math.max(query.min || 0, Math.min(query.max, state.chooseX));
      }
      if (query.type === 'scry') {
        const result = { top: query.cards.slice(1), bottom: query.cards.length ? [query.cards[0]] : [] };
        state.librarySelections.push({ cards: query.cards.slice(), surveil: !!query.surveil, result });
        return result;
      }
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'alternativeManaPayment') {
        state.paymentPrompts = state.paymentPrompts || [];
        state.paymentPrompts.push({ symbol: query.aiHint.symbol, options: query.options.map(option => option.key) });
        const wanted = state.paymentChoices && state.paymentChoices.length ? state.paymentChoices.shift() : null;
        if (query.options.some(option => option.key === wanted)) return wanted;
      }
      return fallbackDecision(query);
    },
  };
}

function targetDefinition(what) {
  if (what === 'land') return fixtureDefinition('Deep hostile land', ['Land', 'Creature']);
  if (what === 'artifact' || what === 'artifact or enchantment' || what === 'artifact or creature') {
    return fixtureDefinition('Deep hostile artifact', ['Artifact', 'Creature']);
  }
  if (what === 'enchantment') return fixtureDefinition('Deep hostile enchantment', ['Enchantment', 'Creature']);
  return fixtureDefinition('Deep hostile creature');
}

function spellOperation(entry) {
  return (entry.implementation || []).find(operation =>
    operation.kind.startsWith('spell-') && operation.kind !== 'spell-v4') || null;
}

function spellV4Operation(entry) {
  return (entry.implementation || []).find(operation => operation.kind === 'spell-v4') || null;
}

function v4EffectsForTarget(operation, targetId) {
  return (operation?.effects || []).filter(effect => (effect.targetIds || []).includes(targetId));
}

function v4TargetIsHarmful(operation, target) {
  const harmful = new Set([
    'counterSpell', 'dealDamage', 'destroy', 'discard', 'exile', 'exileGraveyard',
    'mill', 'returnToHand', 'tap',
  ]);
  return v4EffectsForTarget(operation, target.id).some(effect => harmful.has(effect.kind) ||
    effect.kind === 'modifyPowerToughness' &&
      (Number(effect.power || 0) < 0 || Number(effect.toughness || 0) < 0) ||
    effect.kind === 'putCounters' && String(effect.counterType || '').startsWith('-'));
}

function v4FixtureTypes(target) {
  const raw = target.types || target.cardTypes || [];
  const selected = target.typeMatch === 'all' ? raw : raw.slice(0, 1);
  const types = selected.flatMap(type => type === 'Permanent' ? ['Artifact'] : [type]);
  if (!types.length) types.push('Creature');
  if ((target.filters?.attacking || target.filters?.blocking) && !types.includes('Creature')) types.push('Creature');
  return [...new Set(types.map(type => type.charAt(0).toUpperCase() + type.slice(1)))];
}

function stageAdditionalCost(game, player, card, cost, staged, prefix) {
  if (cost.kind === 'sacrifice') {
    const quantity = Number(cost.quantity?.max ?? cost.quantity?.min ?? 1) || 1;
    const types = v4FixtureTypes({ types: cost.object?.types || ['Creature'], filters: cost.object?.filters });
    for (let index = 0; index < quantity; index++) {
      const definition = fixtureDefinition(`${prefix} sacrifice ${index + 1}`, types, {
        super: cost.object?.filters?.legendary ? ['Legendary'] : [],
      });
      staged.additionalCosts.push(permanent(game, player, definition));
    }
    return;
  }
  if (cost.kind === 'discard') {
    const quantity = Number(cost.quantity?.max ?? cost.quantity?.min ?? 1) || 1;
    for (let index = 0; index < quantity; index++) {
      staged.additionalCosts.push(zoneCard(player,
        fixtureDefinition(`${prefix} discard ${index + 1}`, ['Creature']), 'hand'));
    }
    return;
  }
  if (cost.kind === 'choice') {
    for (const child of cost.options || []) stageAdditionalCost(game, player, card, child, staged, `${prefix} choice`);
    return;
  }
  if (cost.kind === 'sequence') {
    for (const child of cost.costs || []) stageAdditionalCost(game, player, card, child, staged, `${prefix} sequence`);
  }
}

function stageV4Target(game, player, opponent, operation, target, index) {
  if (target.kind === 'player') {
    return target.relation === 'opponent' || v4TargetIsHarmful(operation, target) ? opponent : player;
  }
  if (target.kind === 'spell') {
    const spellTypes = target.spellTypes?.length ? target.spellTypes : ['Sorcery'];
    return zoneCard(opponent, fixtureDefinition(`Deep v4 bait ${index + 1}`, spellTypes, {
      cost: '{1}', oracle: '',
    }), 'hand');
  }
  if (target.kind === 'damageable') {
    return permanent(game, opponent, fixtureDefinition(`Deep v4 damage target ${index + 1}`, ['Creature'], {
      power: '20000', toughness: '3', oracle: '',
    }));
  }

  const harmful = v4TargetIsHarmful(operation, target);
  const controller = target.controller === 'you' || target.owner === 'you' ? player
    : ['opponent', 'notYou'].includes(target.controller) ? opponent
      : harmful ? opponent : player;
  const types = v4FixtureTypes(target);
  const definition = fixtureDefinition(`Deep v4 ${target.kind} ${index + 1}`, types, {
    super: target.filters?.legendary ? ['Legendary'] : [],
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  });
  if (target.subtypes?.length) definition.subtypes = target.subtypes.slice();
  const card = target.kind === 'card' || target.zone === 'graveyard'
    ? zoneCard(controller, definition, target.zone || 'graveyard')
    : permanent(game, controller, definition);
  if (target.filters?.tapped !== undefined) card.tapped = !!target.filters.tapped;
  if (target.filters?.attacking) card.attacking = controller === player ? opponent : player;
  if (target.filters?.blocking) card.blocking = `deep-v4-blocking-${index}`;
  return card;
}

function stageV4Scenario(game, player, opponent, card, operation, staged) {
  if (!operation) return;
  staged.v4Targets = new Map();
  staged.v4Baits = [];
  staged.additionalCosts = [];
  for (const cost of operation.additionalCosts || []) {
    stageAdditionalCost(game, player, card, cost, staged, `Deep ${card.name}`);
  }
  for (const [targetIndex, target] of (operation.targets || []).entries()) {
    const quantity = Math.max(target.quantity?.min || 0,
      target.quantity?.max === null ? 2 : target.quantity?.max || 0);
    const values = [];
    for (let index = 0; index < quantity; index++) {
      const value = stageV4Target(game, player, opponent, operation, target, targetIndex * 10 + index);
      values.push(value);
      if (target.kind === 'spell') staged.v4Baits.push(value);
    }
    staged.v4Targets.set(target.id, values);
  }
  staged.targets.push(...[...staged.v4Targets.values()].flat().filter(value =>
    value && !(value instanceof MTG.Player) && !staged.v4Baits.includes(value)));
  if (!staged.target) staged.target = staged.targets[0] || null;
}

function genericEffectIsHarmful(effect) {
  return ['bounce', 'cant-block-until-eot', 'damage', 'destroy', 'exile', 'lose-life', 'tap'].includes(effect.action) ||
    effect.action === 'pump' && (Number(effect.power || 0) < 0 || Number(effect.toughness || 0) < 0) ||
    effect.action === 'counter' && String(effect.counter || '').startsWith('-');
}

function stageGenericTarget(game, player, opponent, operation, target, index) {
  if (target.zone === 'player' || ['player', 'opponent'].includes(target.what)) {
    return target.what === 'opponent' || (operation.effects || []).some(genericEffectIsHarmful) ? opponent : player;
  }
  const harmful = (operation.effects || []).some(genericEffectIsHarmful);
  const controller = target.controller === 'you' ? player
    : target.controller === 'opponent' ? opponent : harmful ? opponent : player;
  const what = String(target.what || 'creature').toLowerCase();
  const types = what.includes('artifact') && what.includes('enchantment') ? ['Artifact', 'Creature']
    : what.includes('artifact') ? ['Artifact', 'Creature']
      : what.includes('enchantment') ? ['Enchantment', 'Creature']
        : what.includes('land') ? ['Land', 'Creature'] : ['Creature'];
  const damage = Math.max(0, ...(operation.effects || []).filter(effect => effect.action === 'damage')
    .map(effect => Number(effect.n) || 0));
  const definition = fixtureDefinition(`Deep generic target ${index + 1}`, types, {
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? String(damage || 20000) : undefined,
  });
  if (target.subtype) definition.subtypes = [target.subtype];
  const card = target.zone === 'graveyard'
    ? zoneCard(controller, definition, 'graveyard')
    : permanent(game, controller, definition);
  if (target.tapped !== undefined) card.tapped = !!target.tapped;
  if (target.attacking || target.attackingOrBlocking) card.attacking = controller === player ? opponent : player;
  if (target.blocking || target.attackingOrBlocking) card.blocking = `deep-generic-blocking-${index}`;
  return card;
}

function stageGenericOperations(game, player, opponent, entry, staged) {
  let index = 0;
  for (const operation of entry.implementation || []) {
    if (!['generic-trigger', 'generic-ability'].includes(operation.kind)) continue;
    for (const target of operation.targets || []) {
      const count = Math.max(target.min || 0, target.max || 0, 1);
      for (let quantity = 0; quantity < count; quantity++) {
        const value = stageGenericTarget(game, player, opponent, operation, target, index++);
        if (value instanceof MTG.Player) continue;
        staged.targets.push(value);
        if (!staged.target) staged.target = value;
        if (value.ctrl === player && value.is?.('Creature') && !staged.ownCreature) staged.ownCreature = value;
      }
    }
    if ((operation.effects || []).some(effect =>
      ['pump-group', 'token-inline'].includes(effect.action)) && !staged.ownCreature) {
      staged.ownCreature = permanent(game, player, fixtureDefinition(`Deep generic beneficiary ${index++}`));
    }
  }
  if ((entry.implementation || []).some(operation => operation.kind === 'generic-static') && !staged.ownCreature) {
    staged.ownCreature = permanent(game, player, fixtureDefinition('Deep generic static beneficiary'));
  }
}

function attachmentIntent(entry) {
  const aura = (entry.implementation || []).find(operation => operation.kind === 'aura-target');
  const grants = (entry.implementation || []).filter(operation => operation.kind === 'attachment-grant');
  const restricts = grants.some(grant => grant.skipUntap || grant.cantAttack || grant.cantBlock);
  const negative = grants.some(grant => Number(grant.power || 0) < 0 || Number(grant.toughness || 0) < 0);
  const positive = grants.some(grant => Number(grant.power || 0) > 0 || Number(grant.toughness || 0) > 0 || (grant.keywords || []).length);
  return { aura, grants, harmful: restricts || negative, mixed: !restricts && negative && positive };
}

function fundPrintedCost(game, player, card, xValue = 3) {
  for (const color of COLORS) player.pool[color] = 0;
  const cost = game.spellCost(player, card, { from: 'hand' });
  player.pool.C = Number(cost.generic || 0) + (cost.x ? xValue : 0);
  for (const pip of cost.pips || []) {
    const color = pip.find(option => COLORS.includes(option));
    if (color) player.pool[color] = (player.pool[color] || 0) + 1;
  }
}

function etbLibrarySelectionOperations(entry) {
  const selections = [];
  for (const operation of entry.implementation || []) {
    if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
      selections.push({ kind: operation.kind, n: Number(operation.n) || 0 });
    }
    if (operation.kind === 'generic-trigger' && operation.event === 'etb') {
      for (const effect of operation.effects || []) if (effect.action === 'scry' || effect.action === 'surveil') {
        selections.push({ kind: `etb-${effect.action}`, n: Number(effect.n) || 0 });
      }
    }
  }
  return selections;
}

function stageScenario(entry, role, options = {}) {
  const humanState = { submitted: false, aiSubmitted: false, trace: [], preferredTargets: [], librarySelections: [] };
  const game = new MTG.Game({ seed: 830300 + entry.raw.name.length + (role === 'ai' ? 10000 : 0), paced: false, maxTurns: 4, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Deep Oracle bot' : 'Deep Oracle human',
    { name: `Deep ${role} ${entry.raw.name}` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer(
    'Deep pass opponent',
    { name: 'Deep pass opponent deck' },
    { decide: async (currentGame, query) => fallbackDecision(query) },
    false,
  );
  player.deckName = `Deep ${role} ${entry.raw.name}`;
  opponent.deckName = 'Deep pass opponent deck';
  humanState.player = player;
  humanState.opponent = opponent;
  player.life = 1000;
  opponent.life = 1000;
  fillLibrary(player);
  fillLibrary(opponent);
  const librarySelectionOperations = etbLibrarySelectionOperations(entry);
  const selectionCount = Math.max(0, ...librarySelectionOperations.map(operation => Number(operation.n) || 0));
  for (let index = 0; index < selectionCount; index++) {
    const displaced = player.library.pop();
    if (displaced) displaced.zone = 'nowhere';
    zoneCard(player, fixtureDefinition(`Deep low-value library card ${index}`, ['Creature'], {
      cost: '{12}', power: '0', toughness: '1', oracle: '',
    }), 'library');
  }
  const card = zoneCard(player, entry.raw.name, 'hand');
  fundPrintedCost(game, player, card);
  const operation = spellOperation(entry);
  const v4Operation = spellV4Operation(entry);
  const attachment = attachmentIntent(entry);
  const staged = {
    target: null, targets: [], decoy: null, ownCreature: null, bait: null,
    v4Targets: new Map(), v4Baits: [], additionalCosts: [],
  };

  if ((entry.implementation || []).some(candidate => candidate.kind === 'controlled-creature-pump-static')) {
    staged.ownCreature = permanent(game, player, fixtureDefinition('Deep robust anthem beneficiary', ['Creature'], {
      cost: '{6}', power: '6', toughness: '100', oracle: '',
    }));
  }

  if (attachment.aura) {
    const targetController = attachment.harmful ? opponent : player;
    const targetDefinitionValue = targetDefinition(attachment.aura.what);
    if (attachment.mixed) {
      const toughnessPenalty = Math.abs(Math.min(0, ...attachment.grants.map(grant => Number(grant.toughness || 0))));
      if (toughnessPenalty) targetDefinitionValue.toughness = String(toughnessPenalty);
    }
    staged.target = permanent(game, targetController, targetDefinitionValue);
    if (targetController === player) staged.ownCreature = staged.target;
  } else if ((entry.implementation || []).some(candidate => candidate.kind === 'equipment-equip')) {
    staged.ownCreature = permanent(game, player, fixtureDefinition('Deep friendly Equipment host'));
  }

  if (operation) {
    if (operation.kind === 'spell-pump') {
      const staticPower = operation.power === 'X' ? 0 : Number(operation.power || 0);
      const beneficial = staticPower >= 0 && operation.toughness >= 0;
      const mixed = staticPower > 0 && operation.toughness < 0;
      const controller = beneficial ? player : opponent;
      staged.target = permanent(game, controller, beneficial
        ? fixtureDefinition('Deep friendly creature')
        : mixed ? fixtureDefinition('Deep hostile mixed-pump victim', ['Creature'], {
          power: '20000', toughness: String(Math.abs(operation.toughness)),
        }) : fixtureDefinition('Deep hostile creature'));
      staged.decoy = permanent(game, beneficial ? opponent : player, beneficial
        ? fixtureDefinition('Deep hostile pump decoy')
        : fixtureDefinition('Deep friendly removal decoy'));
    } else if (operation.kind === 'spell-team-pump') {
      const hostileAttackerDebuff = operation.attackingOnly && (operation.controller || 'any') === 'any' &&
        (Number(operation.power || 0) < 0 || Number(operation.toughness || 0) < 0);
      if (hostileAttackerDebuff) {
        staged.target = permanent(game, opponent, fixtureDefinition('Deep hostile team-pump attacker'));
      } else {
        staged.ownCreature = permanent(game, player, fixtureDefinition('Deep friendly team creature'));
      }
    } else if (['spell-destroy', 'spell-exile', 'spell-bounce'].includes(operation.kind)) {
      const definition = targetDefinition(operation.what);
      if (operation.stat && operation.threshold !== undefined) {
        definition[operation.stat] = String(operation.threshold);
      }
      staged.target = permanent(game, opponent, definition);
      if (operation.tapped) staged.target.tapped = true;
      if (operation.attacking || operation.attackingOrBlocking) staged.target.attacking = player;
      if (operation.blocking || operation.attackingOrBlocking) staged.target.blocking = 'deep-blocked-attacker';
      staged.decoy = permanent(game, player, Object.assign({}, definition, { name: `${definition.name} friendly decoy` }));
    } else if (operation.kind === 'spell-damage' && operation.what !== 'each opponent' &&
      !['any target', 'target player', 'target opponent', 'target player or planeswalker'].includes(operation.what)) {
      const definition = targetDefinition('creature');
      staged.target = permanent(game, opponent, definition);
      staged.decoy = permanent(game, player, Object.assign({}, definition, { name: `${definition.name} friendly decoy` }));
    } else if (operation.kind === 'spell-counter') {
      const baitName = operation.spellType === 'creature spell' ? 'Elite Vanguard'
        : operation.spellType === 'instant spell' ? 'Darkness' : 'Brilliant Plan';
      staged.bait = zoneCard(opponent, baitName, 'hand');
    } else if (operation.kind === 'spell-counter-on-creature') {
      staged.target = permanent(game, player, fixtureDefinition('Deep friendly counter recipient'));
      staged.decoy = permanent(game, opponent, fixtureDefinition('Deep hostile counter decoy'));
    } else if (operation.kind === 'spell-destroy-all') {
      const singular = operation.what.replace(/s$/, '');
      staged.target = permanent(game, opponent, targetDefinition(singular));
    } else if (operation.kind === 'spell-global-pump') {
      if (Number(operation.power || 0) >= 0 && Number(operation.toughness || 0) >= 0) {
        staged.ownCreature = permanent(game, player, fixtureDefinition('Deep friendly global-pump attacker'));
      } else {
        staged.target = permanent(game, opponent, fixtureDefinition('Deep hostile global-pump victim', ['Creature'], {
          power: '8', toughness: String(Math.max(1, Math.abs(Number(operation.toughness || 0)))),
        }));
      }
    } else if (operation.kind === 'spell-graveyard-return') {
      const types = operation.what === 'instant or sorcery' ? ['Instant']
        : operation.what === 'permanent' ? ['Artifact']
          : [operation.what.charAt(0).toUpperCase() + operation.what.slice(1)];
      staged.target = zoneCard(player, fixtureDefinition('Deep graveyard return target', types), 'graveyard');
    } else if (operation.kind === 'spell-tap' || operation.kind === 'spell-untap') {
      const controller = operation.kind === 'spell-tap' ? opponent : player;
      for (let index = 0; index < Number(operation.count || 1); index++) {
        const target = permanent(game, controller, targetDefinition(operation.what));
        target.tapped = operation.kind === 'spell-untap';
        staged.targets.push(target);
      }
      staged.target = staged.targets[0] || null;
    }
    if (operation.kind === 'spell-discard') {
      for (let index = 0; index < operation.n + 4; index++) zoneCard(opponent, 'Forest', 'hand');
    }
    if (operation.kind === 'spell-add-mana') {
      const producedMana = Object.entries(operation.produce || {}).reduce((total, [symbol, amount]) =>
        total + (symbol === 'ANY' ? Number(amount?.n || amount || 0) : Number(amount || 0)), 0);
      zoneCard(player, fixtureDefinition(`Deep ${entry.raw.name} enabled payoff`, ['Instant'], {
        cost: `{${producedMana}}`, oracle: '',
      }), 'hand');
    }
  }

  stageGenericOperations(game, player, opponent, entry, staged);
  stageV4Scenario(game, player, opponent, card, v4Operation, staged);

  humanState.preferredTargets = [
    ...staged.targets,
    ...[...staged.v4Targets.values()].flat(),
    staged.target,
    staged.bait,
    ...staged.v4Baits,
    opponent,
  ].filter(Boolean);
  if (role === 'ai') {
    if (options.oracleMatrixUrgency && !game.bf().some(candidate => candidate.ctrl === opponent)) {
      staged.urgency = permanent(game, opponent, fixtureDefinition(`Deep urgent threat for ${entry.raw.name}`));
    }
    // The matrix is a controlled tactical proof, not a goldfish. A public
    // removal obligation gives the real local evaluator a concrete reason to
    // deploy ETB, dies and activated interaction whose target is not part of
    // the spell object's own target specs.
    if (options.oracleMatrixUrgency) {
      game.diplomacyRequiredRemovalTarget = () => game.bf().find(candidate => candidate.ctrl === opponent) || null;
    }
    const controller = new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' });
    const decide = controller.decide.bind(controller);
    controller.decide = async (currentGame, query) => {
      if (humanState.aiSubmitted && query.type === 'main') return { kind: 'done' };
      if (humanState.aiSubmitted && query.type === 'priority') return { kind: 'pass' };
      const result = await decide(currentGame, query);
      if ((query.type === 'main' || query.type === 'priority') && result &&
          ((result.kind === 'cast' || result.kind === 'land') && result.card === card || result.kind==='activate'&&result.entry?.card===card&&result.entry.suspend)) {
        humanState.aiSubmitted = true;
      }
      if (query.type === 'scry') {
        humanState.librarySelections.push({ cards: query.cards.slice(), surveil: !!query.surveil, result });
      }
      return result;
    };
    player.controller = controller;
  } else player.controller = humanController(card, humanState);

  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  player.landsPlayed = 0;
  game.recalc();

  return { game, player, opponent, card, operation, v4Operation, staged, humanState };
}

function isHasteOnlyPump(operation) {
  const keywords = (operation && operation.keywords || []).map(keyword => String(keyword).toLowerCase());
  return operation?.kind === 'spell-pump' && Number(operation.power || 0) === 0 &&
    Number(operation.toughness || 0) === 0 && keywords.length > 0 &&
    keywords.every(keyword => keyword === 'haste');
}

function isCombatInstant(entry, operation) {
  return entry.raw.types.includes('Instant') && operation &&
    (!isHasteOnlyPump(operation) && operation.kind === 'spell-pump' || operation.kind === 'spell-team-pump' || operation.kind === 'spell-fog' ||
      operation.kind === 'spell-global-pump' && Number(operation.power || 0) >= 0 && Number(operation.toughness || 0) >= 0);
}

function hasFlash(entry) {
  return (entry.implementedKeywords || []).some(keyword => String(keyword).toLowerCase() === 'flash');
}

function v4HasEffect(operation, kind) {
  return !!operation && (operation.effects || []).some(effect => effect.kind === kind);
}

function v4NeedsStackTarget(operation) {
  return !!operation && (operation.targets || []).some(target => target.kind === 'spell');
}

function isV4CombatInstant(entry, operation) {
  return entry.raw.types.includes('Instant') && !!operation &&
    (v4HasEffect(operation, 'modifyPowerToughness') ||
      (operation.targets || []).some(target => target.filters?.attacking || target.filters?.blocking));
}

function stageV4CombatWindow(context) {
  const { game, player, opponent, v4Operation, staged } = context;
  const targets = (v4Operation?.targets || []).map(target => ({
    target,
    values: staged.v4Targets.get(target.id) || [],
  }));
  const blocking = targets.find(row => row.target.filters?.blocking && row.values.length);
  if (blocking) {
    const blocker = blocking.values[0];
    const attackerController = blocker.ctrl === player ? opponent : player;
    const defender = blocker.ctrl;
    const attacker = permanent(game, attackerController,
      fixtureDefinition(`Deep v4 attacker for ${context.card.name}`));
    attacker.sick = false;
    attacker.attacking = defender;
    attacker.wasBlocked = true;
    attacker.blockedBy = [blocker];
    blocker.blocking = attacker.iid;
    game.combat = { attackers: [attacker], defenders: new Map([[defender.idx, [attacker]]]) };
    game.turnPlayer = attackerController;
    game.phase = 'combat';
    game.step = 'blockers';
    game.recalc();
    return;
  }

  const attacking = targets.find(row => row.target.filters?.attacking && row.values.length);
  let attacker = attacking?.values[0] || targets.flatMap(row => row.values)
    .find(candidate => candidate instanceof MTG.CardInst && candidate.is('Creature') && candidate.ctrl === player);
  if (!attacker) attacker = permanent(game, player, fixtureDefinition(`Deep v4 attacker for ${context.card.name}`));
  const defender = attacker.ctrl === player ? opponent : player;
  attacker.sick = false;
  attacker.attacking = defender;
  const blockerController = defender;
  const blocker = targets.flatMap(row => row.values)
    .find(candidate => candidate instanceof MTG.CardInst && candidate.is('Creature') && candidate.ctrl === blockerController) ||
    permanent(game, blockerController, fixtureDefinition(`Deep v4 blocker for ${context.card.name}`));
  attacker.wasBlocked = true;
  attacker.blockedBy = [blocker];
  blocker.blocking = attacker.iid;
  game.combat = { attackers: [attacker], defenders: new Map([[defender.idx, [attacker]]]) };
  game.turnPlayer = attacker.ctrl;
  game.phase = 'combat';
  game.step = 'blockers';
  game.recalc();
}

function stageCombatWindow(context) {
  const { game, player, opponent, operation, staged } = context;
  if (operation && operation.kind === 'spell-fog') {
    const attacker = permanent(game, opponent, fixtureDefinition('Deep hostile fog attacker'));
    attacker.sick = false;
    attacker.attacking = player;
    game.combat = { attackers: [attacker], defenders: new Map([[player.idx, [attacker]]]) };
    game.recalc();
    return { attacker, blocker: null, operation };
  }
  if (operation && operation.kind === 'spell-global-pump') {
    const attacker = staged.ownCreature || permanent(game, player, fixtureDefinition('Deep global-pump attacker'));
    attacker.sick = false;
    attacker.attacking = opponent;
    game.combat = { attackers: [attacker], defenders: new Map([[opponent.idx, [attacker]]]) };
    game.recalc();
    return { attacker, blocker: null, operation };
  }
  if (operation && operation.kind === 'spell-team-pump' && operation.attackingOnly &&
    (operation.controller || 'any') === 'any' &&
    (Number(operation.power || 0) < 0 || Number(operation.toughness || 0) < 0)) {
    const attacker = staged.target || permanent(game, opponent, fixtureDefinition('Deep hostile team-pump attacker'));
    attacker.sick = false;
    attacker.attacking = player;
    game.combat = { attackers: [attacker], defenders: new Map([[player.idx, [attacker]]]) };
    game.recalc();
    return { attacker, blocker: null, operation };
  }
  let attacker = staged.ownCreature || (staged.target && staged.target.ctrl === player ? staged.target : null) ||
    (staged.decoy && staged.decoy.ctrl === player ? staged.decoy : null);
  if (!attacker) attacker = permanent(game, player, fixtureDefinition('Deep combat attacker'));
  let blocker = staged.target && staged.target.ctrl === opponent ? staged.target
    : staged.decoy && staged.decoy.ctrl === opponent ? staged.decoy : null;
  if (!blocker) blocker = permanent(game, opponent, fixtureDefinition('Deep combat blocker'));
  attacker.sick = false;
  attacker.attacking = opponent;
  attacker.wasBlocked = true;
  attacker.blockedBy = [blocker];
  blocker.blocking = attacker.iid;
  game.combat = { attackers: [attacker], defenders: new Map([[opponent.idx, [attacker]]]) };
  game.recalc();
  return { attacker, blocker, operation };
}

async function executeScenario(context, entry) {
  const { game, player, opponent, card, operation, v4Operation, staged } = context;
  if(!card.def.cost&&card.def.suspend){
    game.turnPlayer=player;game.phase='main1';game.step='main';
    for(const color of COLORS)player.pool[color]=0;
    const cost=MTG.parseCost(card.def.suspend.cost);player.pool.C=cost.generic;
    for(const pip of cost.pips)player.pool[pip.find(color=>COLORS.includes(color))]++;
    await game.mainPhase(player);
    assert.equal(card.zone,'exile',entry.raw.name+': real controller chooses Suspend');
    await castThroughSuspend(MTG,game,player,card,{alreadySuspended:true});
    await game.priorityRound(player);
    return;
  }
  if (v4NeedsStackTarget(v4Operation)) {
    game.turnPlayer = opponent;
    game.phase = 'main1';
    const bait = staged.v4Baits[0];
    assert.ok(bait, `${entry.raw.name}: spell-v4 counter has a staged legal bait`);
    const realPriorityRound = game.priorityRound.bind(game);
    game.priorityRound = async () => {};
    assert.equal(await game.castSpell(opponent, bait, { from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}: spell-v4 hostile bait enters the real Stack`);
    assert.equal(bait.zone, 'stack');
    game.priorityRound = realPriorityRound;
    await realPriorityRound(opponent);
    return;
  }
  if (operation && operation.kind === 'spell-counter') {
    game.turnPlayer = opponent;
    game.phase = 'main1';
    const realPriorityRound = game.priorityRound.bind(game);
    game.priorityRound = async () => {};
    assert.equal(await game.castSpell(opponent, staged.bait, { from: 'hand', alt: { free: true } }), true,
      `${entry.raw.name}: hostile bait enters the real Stack`);
    assert.equal(staged.bait.zone, 'stack');
    game.priorityRound = realPriorityRound;
    await realPriorityRound(opponent);
    return;
  }
  if (isHasteOnlyPump(operation)) {
    if (staged.target && staged.target.ctrl === player) staged.target.sick = true;
    game.turnPlayer = player;
    game.phase = 'main1';
    game.step = 'main';
    await game.mainPhase(player);
    return;
  }
  if (isCombatInstant(entry, operation)) {
    stageCombatWindow(context);
    game.turnPlayer = player;
    game.phase = 'combat';
    game.step = 'attackers';
    await game.priorityRound(player);
    return;
  }
  if (isV4CombatInstant(entry, v4Operation)) {
    stageV4CombatWindow(context);
    await game.priorityRound(game.turnPlayer);
    return;
  }
  if (entry.raw.types.includes('Instant') || hasFlash(entry)) {
    game.turnPlayer = opponent;
    game.phase = 'end';
    game.step = 'end';
    await game.priorityRound(opponent);
    return;
  }
  await game.mainPhase(player);
}

function poolTotal(player) {
  return Object.values(player.pool).reduce((sum, amount) => sum + (Number(amount) || 0), 0);
}

async function verifyPermanentOperations(context, entry, before) {
  const { game, player, opponent, card, humanState } = context;
  const operations = entry.implementation || [];
  const sum = kind => operations.filter(operation => operation.kind === kind)
    .reduce((total, operation) => total + Number(operation.n || 0), 0);

  if (operations.some(operation => operation.kind === 'enters-tapped') && !card.faceDown) {
    assert.equal(card.tapped, true, `${entry.raw.name}: normal controller path applies enters tapped`);
  }
  if (sum('etb-life-gain')) {
    assert.equal(player.life, before.playerLife + sum('etb-life-gain'), `${entry.raw.name}: controller-path ETB life total`);
  }
  if (sum('etb-draw')) {
    assert.equal(player.library.length, before.playerLibrary - sum('etb-draw'), `${entry.raw.name}: controller-path ETB draw total`);
  }
  const selectionOperations = etbLibrarySelectionOperations(entry);
  assert.equal(humanState.librarySelections.length, selectionOperations.length,
    `${entry.raw.name}: every ETB scry/surveil reaches its controller decision`);
  for (let index = 0; index < selectionOperations.length; index++) {
    const operation = selectionOperations[index];
    const selection = humanState.librarySelections[index];
    assert.equal(selection.cards.length, operation.n, `${entry.raw.name}: exact ${operation.kind} card count`);
    assert.equal(selection.surveil, operation.kind === 'etb-surveil', `${entry.raw.name}: exact scry/surveil mode`);
    const chosen = [...selection.result.top, ...selection.result.bottom];
    assert.equal(chosen.length, selection.cards.length, `${entry.raw.name}: controller classifies every looked-at card`);
    assert.equal(new Set(chosen).size, selection.cards.length, `${entry.raw.name}: controller does not duplicate a library choice`);
    assert.ok(selection.cards.every(candidate => chosen.includes(candidate)), `${entry.raw.name}: decision uses only the revealed cards`);
    for (const bottom of selection.result.bottom) {
      if (selection.surveil) assert.equal(bottom.zone, 'graveyard', `${entry.raw.name}: surveilled card reaches graveyard`);
      else {
        assert.equal(bottom.zone, 'library', `${entry.raw.name}: scried card remains in library`);
        assert.ok(player.library.indexOf(bottom) < selection.result.bottom.length,
          `${entry.raw.name}: bottom choice is below every retained top card`);
      }
    }
  }
  const tokenN = sum('etb-token');
  if (tokenN) {
    assert.equal(game.bf().filter(candidate => candidate.isToken && candidate.ctrl === player).length - before.tokens,
      tokenN, `${entry.raw.name}: controller-path token total`);
  }
  if (operations.some(operation => operation.kind === 'cant-block')) {
    const attacker = permanent(game, opponent, fixtureDefinition('Deep cant-block attacker'));
    game.recalc();
    assert.equal(game.canBlock(card, attacker), false, `${entry.raw.name}: controller-path cant-block restriction`);
  }
  if (operations.some(operation => operation.kind === 'must-attack')) {
    card.sick = false;
    card.tapped = false;
    const lifeBefore = opponent.life;
    game.turnPlayer = player;
    await game.combatPhase(player);
    assert.ok(opponent.life < lifeBefore, `${entry.raw.name}: controller-path mandatory attack is declared`);
  }
  for (const operation of operations.filter(candidate => candidate.kind === 'mana-source')) {
    if (operations.some(candidate => candidate.kind === 'enters-tapped')) {
      assert.equal(game.manaSources(player).some(candidate => candidate.card === card), false,
        `${entry.raw.name}: an enters-tapped source cannot produce mana immediately`);
    }
    card.tapped = false;
    card.sick = false;
    game.recalc();
    const wanted = JSON.stringify(operation.produce);
    const source = game.manaSources(player).find(candidate => candidate.card === card && JSON.stringify(candidate.produce) === wanted);
    assert.ok(source, `${entry.raw.name}: controller-path mana source is discoverable`);
    for (const option of source.produce) {
      card.tapped = false;
      for (const color of COLORS) player.pool[color] = 0;
      const expected = option.ANY ? (option.n || 1) : Object.entries(option)
        .filter(([key]) => key !== 'n').reduce((sum, [, amount]) => sum + Number(amount || 0), 0);
      const planned = option.ANY ? Array(expected).fill('W') : [];
      assert.equal(await game.activateManaSource(player, source, option, null, planned), true,
        `${entry.raw.name}: every declared mana option activates (${JSON.stringify(option)})`);
      assert.equal(poolTotal(player), expected,
        `${entry.raw.name}: mana option produces its exact amount (${JSON.stringify(option)})`);
    }
  }
  const diesN = sum('dies-draw');
  if (diesN) {
    const libraryBefore = player.library.length;
    await game.destroy(card);
    while (game.pendingTriggers.length || game.stack.length) {
      await game.flushTriggers();
      if (game.stack.length) await game.resolveTop();
    }
    assert.equal(card.zone, 'graveyard', `${entry.raw.name}: controller-path dies event`);
    assert.equal(player.library.length, libraryBefore - diesN, `${entry.raw.name}: controller-path dies draw total`);
  }
}

function creatureEntryCanChangeStats(entry) {
  return (entry.implementation || []).some(operation =>
    ['attacking-creature-pump-static', 'controlled-creature-pump-static', 'enters-with-counters',
      'generic-static', 'mechanic-bloodthirst', 'mechanic-evolve', 'mechanic-riot',
      'mechanic-unleash'].includes(operation.kind) ||
    operation.kind === 'generic-trigger' && (operation.effects || []).some(effect =>
      ['counter', 'counter-group', 'pump', 'pump-group'].includes(effect.action)));
}

function creatureSurvivesEntry(entry, card) {
  let toughness = Number(entry.raw.toughness);
  for (const operation of entry.implementation || []) {
    if (operation.kind === 'enters-with-counters' && operation.counter === '+1/+1') {
      toughness += operation.n === 'X' ? Number(card.castMeta?.x || 0) : Number(operation.n || 0);
    }
    if (operation.kind === 'controlled-creature-pump-static') toughness += Number(operation.toughness || 0);
    if (operation.kind === 'generic-static' && ['self', 'your-creatures'].includes(operation.scope)) {
      toughness += Number(operation.toughness || 0);
    }
    if (operation.kind === 'generic-trigger' && operation.event === 'etb') {
      for (const effect of operation.effects || []) {
        if (effect.action === 'pump-group' && effect.who === 'your-creatures') toughness += Number(effect.toughness || 0);
      }
    }
  }
  return toughness > 0;
}

function verifySpellOperation(context, entry, before) {
  const { player, opponent, operation, staged } = context;
  if (operation.kind === 'spell-draw') {
    assert.equal(player.library.length, before.playerLibrary - operation.n, `${entry.raw.name}: controller-path draw`);
  } else if (operation.kind === 'spell-counter') {
    assert.equal(staged.bait.zone, 'graveyard', `${entry.raw.name}: controller counters the hostile spell`);
  } else if (operation.kind === 'spell-destroy') {
    assert.equal(staged.target.zone, 'graveyard', `${entry.raw.name}: controller destroys the hostile permanent`);
  } else if (operation.kind === 'spell-exile') {
    assert.equal(staged.target.zone, 'exile', `${entry.raw.name}: controller exiles the hostile permanent`);
  } else if (operation.kind === 'spell-bounce') {
    assert.equal(staged.target.zone, 'hand', `${entry.raw.name}: controller bounces the hostile permanent`);
  } else if (operation.kind === 'spell-life-gain') {
    assert.equal(player.life, before.playerLife + operation.n, `${entry.raw.name}: controller gains exact life`);
  } else if (operation.kind === 'spell-discard') {
    assert.equal(opponent.hand.length, before.opponentHand - operation.n, `${entry.raw.name}: controller makes the opponent discard`);
  } else if (operation.kind === 'spell-mill') {
    assert.equal(opponent.library.length, before.opponentLibrary - operation.n, `${entry.raw.name}: controller mills the opponent`);
  } else if (operation.kind === 'spell-pump') {
    const power = operation.power === 'X' ? context.card.castMeta.x : operation.power;
    if (operation.power > 0 && operation.toughness < 0) {
      assert.equal(staged.target.zone, 'graveyard', `${entry.raw.name}: mixed +power/-toughness spell kills a legal hostile target`);
    } else {
      assert.equal(staged.target.power, before.targetPower + power,
        `${entry.raw.name}: controller chooses the strategically correct pump target ` +
        JSON.stringify({ x: context.card.castMeta.x, target: staged.target.name,
          decisions: (context.game.aiDecisionLog || []).map(decision => decision.chosen) }));
      assert.equal(staged.target.toughness, before.targetToughness + operation.toughness, `${entry.raw.name}: controller applies exact toughness modifier`);
    }
  } else if (operation.kind === 'spell-team-pump') {
    const hostileAttackerDebuff = operation.attackingOnly && (operation.controller || 'any') === 'any' &&
      (Number(operation.power || 0) < 0 || Number(operation.toughness || 0) < 0);
    const affected = hostileAttackerDebuff ? staged.target : staged.ownCreature;
    const powerBefore = hostileAttackerDebuff ? before.targetPower : before.ownPower;
    const toughnessBefore = hostileAttackerDebuff ? before.targetToughness : before.ownToughness;
    assert.equal(affected.power, powerBefore + operation.power,
      `${entry.raw.name}: controller applies the team power modifier to the strategically correct attackers`);
    assert.equal(affected.toughness, toughnessBefore + operation.toughness,
      `${entry.raw.name}: controller applies the team toughness modifier to the strategically correct attackers`);
  } else if (operation.kind === 'spell-damage') {
    const amount = operation.n === 'X' ? context.card.castMeta.x : operation.n;
    if (staged.target) assert.equal(staged.target.damage, amount, `${entry.raw.name}: controller damages the hostile permanent`);
    else assert.equal(opponent.life, before.opponentLife - amount, `${entry.raw.name}: controller damages the opponent`);
  }
}

async function runCard(entry, role) {
  const context = stageScenario(entry, role, { oracleMatrixUrgency: true });
  const { game, player, opponent, card, operation, staged, humanState } = context;
  if ((entry.implementation || []).some(candidate =>
    /^self-(?:pump|keyword|regenerate)-ability$/.test(candidate.kind) && /\/P\}/.test(candidate.cost || ''))) {
    player.life = 1;
  }
  const before = {
    playerLife: player.life,
    opponentLife: opponent.life,
    playerLibrary: player.library.length,
    opponentLibrary: opponent.library.length,
    opponentHand: opponent.hand.length,
    targetPower: staged.target && staged.target.power,
    targetToughness: staged.target && staged.target.toughness,
    ownPower: staged.ownCreature && staged.ownCreature.power,
    ownToughness: staged.ownCreature && staged.ownCreature.toughness,
    tokens: game.bf().filter(candidate => candidate.isToken && candidate.ctrl === player).length,
  };

  await executeScenario(context, entry);

  if (role === 'human') {
    assert.equal(humanState.submitted, true, `${entry.raw.name}: engine offered and accepted the human action`);
  } else {
    assert.ok(player.controller instanceof MTG.AIController, `${entry.raw.name}: genuine local AIController`);
    const decisions = (game.aiDecisionLog || []).filter(decision => decision.playerId === player.idx);
    const faceDownCast = !!card.castMeta?.alt?.faceDownCast;
    const choseExpectedAction = faceDownCast
      ? decisions.some(decision => /face-down creature spell/i.test(String(decision.chosen)))
      : decisions.some(decision => String(decision.chosen).includes(entry.raw.name));
    assert.ok(choseExpectedAction,
      `${entry.raw.name}: local AI chose this exact ${faceDownCast ? 'identity-safe face-down action' : 'card'} ` +
      `(${decisions.map(decision => decision.chosen).join(' | ')}) ` + JSON.stringify(decisions.map(decision => ({
        chosen: decision.chosen,
        score: decision.score,
        scoreBreakdown: decision.scoreBreakdown,
        alternatives: decision.alternatives,
      }))));
    if (faceDownCast) {
      assert.equal(decisions.some(decision => JSON.stringify(decision).includes(entry.raw.name)), false,
        `${entry.raw.name}: AI public decision evidence does not leak a face-down card identity`);
    }
    assert.equal(decisions.some(decision => decision.fallback), false, `${entry.raw.name}: no AI V2 fallback`);
    assert.equal(game.log.some(item => /AI V2 fallback/i.test(item.msg)), false, `${entry.raw.name}: no legacy fallback log`);
  }

  if (entry.raw.types.includes('Land')) {
    assert.equal(card.zone, 'battlefield', `${entry.raw.name}: normal land play reaches battlefield`);
    assert.equal(player.landsPlayed, 1, `${entry.raw.name}: consumes one real land play`);
  } else {
    assert.ok(card.castMeta, `${entry.raw.name}: normal paid cast records cast metadata`);
    if(!card.def.cost&&card.def.suspend){
      assert.equal(card.castMeta.alt.free,true,entry.raw.name+': free cast comes from the completed Suspend trigger');
      assert.equal(card.castMeta.alt.suspend,true);assert.equal(card.castMeta.from,'exile');
    }else{
      assert.equal(card.castMeta.alt.free, undefined, `${entry.raw.name}: deep controller proof does not bypass mana with a free cast`);
      assert.equal(game.log.some(item => item.msg.includes(entry.raw.name) && /\(free\)/.test(item.msg)), false,
        `${entry.raw.name}: normal controller proof has no free-cast log`);
    }
    if (entry.raw.types.includes('Instant') || entry.raw.types.includes('Sorcery')) {
      const rebounds = (entry.implementation || []).some(candidate => candidate.kind === 'mechanic-rebound');
      assert.equal(card.zone, rebounds ? 'exile' : 'graveyard',
        `${entry.raw.name}: instant/sorcery reaches its rules-correct post-resolution zone`);
      if (operation) verifySpellOperation(context, entry, before);
    } else {
      const auraLostWithHost = entry.raw.subtypes.includes('Aura') && staged.target && staged.target.zone !== 'battlefield';
      const zeroToughness = entry.raw.types.includes('Creature') && !card.faceDown && !creatureSurvivesEntry(entry, card);
      const expected = zeroToughness || auraLostWithHost ? 'graveyard' : 'battlefield';
      assert.equal(card.zone, expected, `${entry.raw.name}: permanent resolves and SBA completes`);
      if (card.zone === 'battlefield') {
        if (entry.raw.types.includes('Creature')) {
          const expectedPower = card.faceDown ? 2 : Number(entry.raw.power);
          const expectedToughness = card.faceDown ? 2 : Number(entry.raw.toughness);
          assert.equal(Number.isFinite(card.power), true, `${entry.raw.name}: controller path has finite power`);
          assert.equal(Number.isFinite(card.toughness), true, `${entry.raw.name}: controller path has finite toughness`);
          assert.ok(card.toughness > 0, `${entry.raw.name}: resolved creature survives the real SBA check`);
          if (card.faceDown || !creatureEntryCanChangeStats(entry)) {
            assert.equal(card.power, expectedPower,
              `${entry.raw.name}: controller path preserves ${card.faceDown ? 'face-down' : 'printed'} power`);
            assert.equal(card.toughness, expectedToughness,
              `${entry.raw.name}: controller path preserves ${card.faceDown ? 'face-down' : 'printed'} toughness`);
          }
        }
        await verifyPermanentOperations(context, entry, before);
      }
    }
  }

  assert.equal(game.stack.length, 0, `${entry.raw.name}: Stack settles`);
  assert.equal(game.pendingTriggers.length, 0, `${entry.raw.name}: no pending triggers remain`);
  assert.equal(game.gameOver, false, `${entry.raw.name}: controlled proof does not accidentally end the game`);
  return {
    action: entry.raw.types.includes('Land') ? 'land' : 'cast',
    window: operation && operation.kind === 'spell-counter' || v4NeedsStackTarget(context.v4Operation) ? 'counter-priority'
      : isHasteOnlyPump(operation) ? 'main'
        : isCombatInstant(entry, operation) || isV4CombatInstant(entry, context.v4Operation) ? 'combat-priority'
        : (entry.raw.types.includes('Instant') || hasFlash(entry)) ? 'end-step-priority' : 'main',
  };
}

test('svih 4.600 Oracle karata prolazi stvarni human i lokal-AI controller tok', async t => {
  const requestedBatch = process.env.ORACLE_DEEP_BATCH || '';
  const requestedCard = process.env.ORACLE_DEEP_CARD || '';
  const requestedLimit = Number(process.env.ORACLE_DEEP_LIMIT || 0);
  let rows = oracleRows().filter(row => (!requestedBatch || row.batch.id === requestedBatch) &&
    (!requestedCard || row.entry.raw.name === requestedCard));
  if (requestedLimit > 0) rows = rows.slice(0, requestedLimit);

  const failures = [];
  const totals = { human: 0, ai: 0, land: 0, cast: 0, main: 0, 'end-step-priority': 0, 'combat-priority': 0, 'counter-priority': 0 };
  const batchTotals = {};
  for (const { batch, entry } of rows) {
    batchTotals[batch.id] = batchTotals[batch.id] || { cards: 0, human: 0, ai: 0 };
    batchTotals[batch.id].cards++;
    for (const role of ['human', 'ai']) {
      try {
        const result = await runCard(entry, role);
        totals[role]++;
        totals[result.action]++;
        totals[result.window]++;
        batchTotals[batch.id][role]++;
      } catch (error) {
        failures.push({ batch: batch.id, card: entry.raw.name, role, error: error.message });
      }
    }
  }

  for (const [batch, result] of Object.entries(batchTotals)) {
    t.diagnostic(`ORACLE_DEEP_BATCH ${batch} cards=${result.cards} human=${result.human} ai=${result.ai}`);
  }
  t.diagnostic(`ORACLE_DEEP_CONTROLLER_COVERAGE cards=${rows.length} human=${totals.human} ai=${totals.ai} ` +
    `landActions=${totals.land} castActions=${totals.cast} main=${totals.main} endStepPriority=${totals['end-step-priority']} ` +
    `combatPriority=${totals['combat-priority']} counterPriority=${totals['counter-priority']} failures=${failures.length}`);
  assert.equal(failures.length, 0, failures.slice(0, 80).map(failure =>
    `${failure.batch}/${failure.card}/${failure.role}: ${failure.error}`).join('\n'));
  if (!requestedBatch && !requestedCard && !requestedLimit) {
    assert.equal(rows.length, 4600);
    assert.equal(totals.human, 4600);
    assert.equal(totals.ai, 4600);
  }
});

test('svaki Oracle team-pump zaključava postojeća stvorenja pri rezoluciji', async () => {
  const rows = oracleRows().filter(({ entry }) =>
    (entry.implementation || []).some(operation => operation.kind === 'spell-team-pump'));
  assert.equal(rows.length, 37, 'current Oracle cohort has thirty-seven team-pump spells');

  for (const { entry } of rows) {
    const context = stageScenario(entry, 'human');
    const operation = spellOperation(entry);
    const hostileAttackerDebuff = operation.attackingOnly && (operation.controller || 'any') === 'any' &&
      (Number(operation.power || 0) < 0 || Number(operation.toughness || 0) < 0);
    const original = hostileAttackerDebuff ? context.staged.target : context.staged.ownCreature;
    const originalController = original.ctrl;
    const originalPower = original.power;
    const originalToughness = original.toughness;
    await executeScenario(context, entry);
    assert.equal(original.power, originalPower + operation.power, `${entry.raw.name}: original creature receives power`);
    assert.equal(original.toughness, originalToughness + operation.toughness, `${entry.raw.name}: original creature receives toughness`);

    const late = permanent(context.game, originalController,
      fixtureDefinition(`Late creature after ${entry.raw.name}`, ['Creature'], { power: '7', toughness: '7' }));
    if (operation.attackingOnly) late.attacking = originalController === context.player ? context.opponent : context.player;
    context.game.recalc();
    assert.equal(late.power, 7, `${entry.raw.name}: later creature is outside the locked set`);
    assert.equal(late.toughness, 7, `${entry.raw.name}: later creature gets no toughness bonus`);

    original.ctrl = originalController === context.player ? context.opponent : context.player;
    context.game.recalc();
    assert.equal(original.power, originalPower + operation.power, `${entry.raw.name}: locked object keeps power after control changes`);
    assert.equal(original.toughness, originalToughness + operation.toughness, `${entry.raw.name}: locked object keeps toughness after control changes`);
  }
});

test('svih 51 novih legalnih commander kandidata prolazi command zone, tax, povratak i combat za igrača i bota', async t => {
  const rows = oracleRows().filter(({ entry }) =>
    (entry.raw.super || []).includes('Legendary') && entry.raw.types.includes('Creature'));
  assert.equal(rows.length, 51, 'current Oracle cohort has fifty-one new commander candidates');

  const failures = [];
  let casts = 0;
  let recasts = 0;
  let combatChecks = 0;
  for (const { batch, entry } of rows) {
    for (const role of ['human', 'ai']) {
      try {
        const context = stageScenario(entry, role);
        const { game, player, opponent, card, humanState } = context;
        player.hand.splice(player.hand.indexOf(card), 1);
        card.zone = 'command';
        card.commander = true;
        card.cmdCasts = 0;
        player.command.push(card);
        player.commanders.push(card);
        game.recalc();

        await game.mainPhase(player);
        assert.equal(card.zone, 'battlefield', `${entry.raw.name}/${role}: casts from command zone`);
        assert.equal(card.cmdCasts, 1, `${entry.raw.name}/${role}: first commander cast is tracked`);
        assert.equal(card.castMeta.from, 'command', `${entry.raw.name}/${role}: cast metadata records command zone`);
        assert.ok(game.log.some(item => item.msg.includes(`${entry.raw.name} from the command zone`)),
          `${entry.raw.name}/${role}: visible command-zone cast log`);
        casts++;

        const removed = card.kw('indestructible')
          ? await game.exileCard(card)
          : await game.destroy(card);
        assert.notEqual(removed, false,
          `${entry.raw.name}/${role}: commander can change zones through a rules-legal removal effect`);
        assert.ok(['graveyard','exile'].includes(card.zone), `${entry.raw.name}/${role}: the commander actually enters the destination before its SBA choice`);
        await game.checkSBA();
        while (game.pendingTriggers.length || game.stack.length) {
          await game.flushTriggers();
          if (game.stack.length) await game.resolveTop();
        }
        assert.equal(card.zone, 'command', `${entry.raw.name}/${role}: owner chooses command zone as a state-based action`);
        const usedCommanderChoice = role === 'human'
          ? humanState.trace.includes('chooseOption')
          : (game.aiDecisionLog || []).some(decision => /Command zone/i.test(String(decision.chosen)) && !decision.fallback);
        assert.ok(usedCommanderChoice, `${entry.raw.name}/${role}: command-zone choice used the real controller`);

        const printed = MTG.parseCost(card.def.cost || '');
        const taxed = game.spellCost(player, card, {});
        assert.equal(taxed.generic, printed.generic + 2, `${entry.raw.name}/${role}: first recast adds exactly {2}`);
        assert.deepEqual(taxed.pips, printed.pips, `${entry.raw.name}/${role}: tax does not alter colored requirements`);

        for (const color of COLORS) player.pool[color] = 20;
        humanState.submitted = false;
        humanState.aiSubmitted = false;
        await game.mainPhase(player);
        assert.equal(card.zone, 'battlefield', `${entry.raw.name}/${role}: recasts from command zone`);
        assert.equal(card.cmdCasts, 2, `${entry.raw.name}/${role}: second commander cast is tracked`);
        assert.equal(card.castMeta.manaSpent, MTG.mv(card.def.cost || '') + 2,
          `${entry.raw.name}/${role}: real payment includes commander tax`);
        recasts++;

        card.sick = false;
        card.tapped = false;
        if (card.power <= 0) game.addCounters(card, '+1/+1', 1 - card.power, false, player);
        for (const other of game.creatures(player)) if (other !== card) other.tapped = true;
        opponent.life = 1;
        opponent.lost = false;
        game.recalc();
        humanState.attackCard = card;
        humanState.attackTarget = opponent;
        const damageBefore = opponent.commanderDamage[card.iid] || 0;
        const lifeBefore = opponent.life;
        const poisonBefore = opponent.poison || 0;
        const startingPower = Math.max(0, card.power);
        await game.combatPhase(player);
        const damageAfter = opponent.commanderDamage[card.iid] || 0;
        assert.ok(game.log.some(item => item.msg.includes(`${entry.raw.name} attacks`)),
          `${entry.raw.name}/${role}: the exact commander is declared as an attacker`);
        const damageDelta = damageAfter - damageBefore;
        if (damageDelta > 0) {
          assert.ok(opponent.life < lifeBefore || (opponent.poison || 0) > poisonBefore,
            `${entry.raw.name}/${role}: exact commander combat reaches the defending player`);
        } else {
          assert.equal(startingPower, 0,
            `${entry.raw.name}/${role}: only a real zero-power commander may deal no combat damage`);
          assert.equal(opponent.life, lifeBefore,
            `${entry.raw.name}/${role}: zero-power commander deals exactly zero life damage`);
        }
        combatChecks++;
      } catch (error) {
        failures.push({ batch: batch.id, card: entry.raw.name, role, error: error.message });
      }
    }
  }

  t.diagnostic(`ORACLE_COMMANDER_DEEP candidates=${rows.length} roles=2 casts=${casts} recasts=${recasts} combat=${combatChecks} failures=${failures.length}`);
  assert.equal(failures.length, 0, failures.map(failure =>
    `${failure.batch}/${failure.card}/${failure.role}: ${failure.error}`).join('\n'));
});

test('bot koristi svih pet +power/-toughness trikova kontekstualno, a ne kao slijepu removal kartu', async () => {
  const rows = oracleRows().filter(({ entry }) => (entry.implementation || []).some(operation =>
    operation.kind === 'spell-pump' && operation.power > 0 && operation.toughness < 0));
  assert.equal(rows.length, 5, 'current Oracle cohort has five mixed pump spells');

  for (const { entry } of rows) {
    const context = stageScenario(entry, 'ai');
    const operation = spellOperation(entry);
    context.staged.target.def.power = '20000';
    context.staged.target.def.toughness = '20000';
    context.game.recalc();
    const friendly = context.staged.decoy;
    const friendlyPower = friendly.power;
    const friendlyToughness = friendly.toughness;
    const hostilePower = context.staged.target.power;
    const hostileToughness = context.staged.target.toughness;

    await executeScenario(context, entry);

    assert.equal(friendly.power, friendlyPower + operation.power,
      `${entry.raw.name}: AI buffs its safe combatant when the hostile target would survive`);
    assert.equal(friendly.toughness, friendlyToughness + operation.toughness,
      `${entry.raw.name}: AI accepts only a nonlethal friendly toughness reduction`);
    assert.equal(context.staged.target.power, hostilePower,
      `${entry.raw.name}: AI does not increase a nonlethal opposing threat's power`);
    assert.equal(context.staged.target.toughness, hostileToughness,
      `${entry.raw.name}: untouched opposing threat keeps its toughness`);
  }
});

test('X damage ne nudi nemoguć cast i oba kontrolera biraju tačan, ne preplaćen lethal X', async () => {
  const heatRay = oracleRows().find(({ entry }) => entry.raw.name === 'Heat Ray').entry;
  const blaze = oracleRows().find(({ entry }) => entry.raw.name === 'Blaze').entry;

  for (const role of ['human', 'ai']) {
    const empty = stageScenario(heatRay, role);
    empty.game.battlefield = [];
    empty.game.recalc();
    clearMana(empty.player);
    empty.player.pool.R = 1;
    empty.player.pool.C = 9;
    await empty.game.mainPhase(empty.player);
    assert.equal(empty.card.zone, 'hand', `Heat Ray/${role}: no legal creature means no cast offer`);
    assert.equal(empty.humanState.submitted, false, `Heat Ray/${role}: controller never submits an impossible cast`);

    const lethalCreature = stageScenario(heatRay, role);
    lethalCreature.staged.target.def.power = '2';
    lethalCreature.staged.target.def.toughness = '2';
    lethalCreature.game.recalc();
    clearMana(lethalCreature.player);
    lethalCreature.player.pool.R = 1;
    lethalCreature.player.pool.C = 9;
    lethalCreature.humanState.chooseX = 2;
    await executeScenario(lethalCreature, heatRay);
    assert.equal(lethalCreature.card.castMeta.x, 2, `Heat Ray/${role}: chooses exact lethal X for a 2/2 ` +
      JSON.stringify((lethalCreature.game.aiDecisionLog || []).map(decision => ({
        chosen: decision.chosen, score: decision.score, scoreBreakdown: decision.scoreBreakdown,
        alternatives: decision.alternatives,
      }))));
    assert.equal(lethalCreature.card.castMeta.manaSpent, 3, `Heat Ray/${role}: does not waste seven extra mana`);
    assert.equal(lethalCreature.staged.target.zone, 'graveyard', `Heat Ray/${role}: lethal target dies through SBA`);

    const lethalPlayer = stageScenario(blaze, role);
    lethalPlayer.opponent.life = 5;
    clearMana(lethalPlayer.player);
    lethalPlayer.player.pool.R = 1;
    lethalPlayer.player.pool.C = 9;
    lethalPlayer.humanState.chooseX = 5;
    await executeScenario(lethalPlayer, blaze);
    assert.equal(lethalPlayer.card.castMeta.x, 5, `Blaze/${role}: chooses exact lethal player damage`);
    assert.equal(lethalPlayer.card.castMeta.manaSpent, 6, `Blaze/${role}: avoids overpaying lethal player damage`);
    assert.equal(lethalPlayer.opponent.lost, true, `Blaze/${role}: lethal damage completes the game-loss path`);
  }
});

test('stvarni basic landovi plaćaju visoki generic plus colored trošak bez zavisnosti od redoslijeda', async () => {
  const searingWind = oracleRows().find(({ entry }) => entry.raw.name === 'Searing Wind').entry;
  const heatRay = oracleRows().find(({ entry }) => entry.raw.name === 'Heat Ray').entry;

  for (const role of ['human', 'ai']) for (const mountainFirst of [true, false]) {
    const context = stageScenario(searingWind, role);
    clearMana(context.player);
    const names = mountainFirst ? ['Mountain', ...Array(8).fill('Plains')] : [...Array(8).fill('Plains'), 'Mountain'];
    const lands = names.map(name => permanent(context.game, context.player, MTG.DEFS[name]));
    context.game.recalc();
    await executeScenario(context, searingWind);
    assert.ok(context.card.castMeta, `Searing Wind/${role}/${mountainFirst ? 'mountain-first' : 'mountain-last'}: controller casts`);
    assert.equal(context.card.castMeta.manaSpent, 9, `Searing Wind/${role}: exact nine land payment`);
    assert.equal(lands.filter(land => land.tapped).length, 9, `Searing Wind/${role}: every required basic is tapped once`);
  }

  for (const role of ['human', 'ai']) {
    const context = stageScenario(heatRay, role);
    clearMana(context.player);
    const lands = ['Mountain', ...Array(9).fill('Plains')]
      .map(name => permanent(context.game, context.player, MTG.DEFS[name]));
    context.staged.target.def.power = '2';
    context.staged.target.def.toughness = '2';
    context.game.recalc();
    const cost = context.game.spellCost(context.player, context.card, {});
    assert.equal(context.game.maxAffordableX(context.player, cost, context.card, {}), 9,
      `Heat Ray/${role}: solver sees all nine generic-capable basics`);
    context.humanState.chooseX = 2;
    await executeScenario(context, heatRay);
    assert.equal(context.card.castMeta.x, 2, `Heat Ray/${role}: real-land controller chooses exact lethal X`);
    assert.equal(context.card.castMeta.manaSpent, 3, `Heat Ray/${role}: real lands spend only what is needed`);
    assert.equal(lands.filter(land => land.tapped).length, 3, `Heat Ray/${role}: exactly three basics are tapped`);
  }
});

test('lokalni AI nikad ne plaća posljednji život za Phyrexian pip, ali koristi sigurne life i colored rute', async () => {
  const rows = oracleRows().filter(({ entry }) => MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '')
    .pips.some(pip => pip.includes('PHY')));
  assert.equal(rows.length, 10);

  for (const { entry } of rows) {
    const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
    const phyPips = cost.pips.filter(pip => pip.includes('PHY'));
    const lethalLife = phyPips.length * 2;
    const makeTacticallyRelevant = context => {
      const operation = spellOperation(entry);
      if (operation && operation.kind === 'spell-pump' && operation.toughness < 0 && context.staged.target) {
        context.staged.target.def.power = '20000';
        context.staged.target.def.toughness = String(Math.abs(operation.toughness));
        context.game.recalc();
      }
      if (operation && operation.kind === 'spell-damage') {
        if (context.staged.target) {
          context.staged.target.def.power = '20000';
          context.staged.target.def.toughness = String(operation.n);
          context.game.recalc();
        } else {
          context.staged.target = permanent(context.game, context.opponent,
            fixtureDefinition(`Phyrexian lethal target for ${entry.raw.name}`, ['Creature'], {
              power: '20000', toughness: String(Number(operation.n) || 1),
            }));
          context.game.recalc();
        }
      }
    };

    const suicidal = stageScenario(entry, 'ai');
    makeTacticallyRelevant(suicidal);
    clearMana(suicidal.player);
    suicidal.player.pool.C = cost.generic;
    suicidal.player.life = lethalLife;
    await executeScenario(suicidal, entry);
    assert.equal(suicidal.card.zone, 'hand', `${entry.raw.name}: AI refuses a payment that leaves it at zero`);
    assert.equal(suicidal.player.life, lethalLife, `${entry.raw.name}: refused Phyrexian cast spends no life`);
    assert.equal(suicidal.player.lost, false, `${entry.raw.name}: AI remains alive`);

    const safe = stageScenario(entry, 'ai');
    makeTacticallyRelevant(safe);
    clearMana(safe.player);
    safe.player.pool.C = cost.generic;
    safe.player.life = lethalLife + 36;
    await executeScenario(safe, entry);
    assert.ok(safe.card.castMeta, `${entry.raw.name}: AI still uses the safe life-payment route ` +
      JSON.stringify((safe.game.aiDecisionLog || []).map(decision => ({
        chosen: decision.chosen, score: decision.score, scoreBreakdown: decision.scoreBreakdown,
        alternatives: decision.alternatives,
      }))));
    assert.equal(safe.card.castMeta.phyrexianLifePaid, phyPips.length, `${entry.raw.name}: safe route pays every Phyrexian pip with life`);
    assert.equal(safe.player.life, 36, `${entry.raw.name}: safe route preserves a nonzero buffer`);

    const colored = stageScenario(entry, 'ai');
    makeTacticallyRelevant(colored);
    clearMana(colored.player);
    colored.player.pool.C = cost.generic;
    for (const pip of phyPips) colored.player.pool[pip[0]]++;
    colored.player.life = 1;
    await executeScenario(colored, entry);
    assert.ok(colored.card.castMeta, `${entry.raw.name}: low-life AI may cast via colored mana`);
    assert.equal(colored.card.castMeta.phyrexianLifePaid, 0, `${entry.raw.name}: colored route pays no life`);
    assert.equal(colored.player.life, 1, `${entry.raw.name}: colored route preserves life`);
  }
});

test('ANY mana izvor poštuje fiksni colored pip uz hibrid, bez ilegalnog fallback plaćanja', async () => {
  const cases = [
    { name: 'Messenger Falcons', floating: 'U', required: 'W' },
    { name: "Marisi's Twinclaws", floating: 'W', required: 'G' },
    { name: 'Sewn-Eye Drake', floating: 'R', required: 'B' },
  ];

  for (const row of cases) for (const role of ['human', 'ai']) {
    const entry = oracleRows().find(candidate => candidate.entry.raw.name === row.name).entry;
    const context = stageScenario(entry, role);
    clearMana(context.player);
    context.player.pool.C = 2;
    context.player.pool[row.floating] = 1;
    const tree = permanent(context.game, context.player, MTG.DEFS['Utopia Tree']);
    tree.sick = false;
    context.game.recalc();

    await executeScenario(context, entry);

    assert.ok(context.card.castMeta, `${row.name}/${role}: controller casts through the ANY source`);
    assert.equal(context.card.castMeta.manaSpent, 4, `${row.name}/${role}: spends the exact four mana`);
    assert.equal(tree.tapped, true, `${row.name}/${role}: Utopia Tree is the fourth source`);
    assert.deepEqual([...new Set(context.game._payColors || [])].sort(), [row.floating, row.required].sort(),
      `${row.name}/${role}: hybrid uses ${row.floating} and fixed pip uses ${row.required}`);
  }
});

function clearMana(player) {
  for (const color of COLORS) player.pool[color] = 0;
}

function exactHybridPool(player, cost, optionIndex) {
  clearMana(player);
  player.pool.C = cost.generic;
  const expectedColors = [];
  for (const pip of cost.pips) {
    const colored = pip.filter(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
    const chosen = colored.length > 1 ? colored[optionIndex] : colored[0];
    assert.ok(chosen, `expected a colored pip in ${JSON.stringify(pip)}`);
    player.pool[chosen]++;
    expectedColors.push(chosen);
  }
  return expectedColors;
}

async function castWithExactPool(entry, role, configurePool) {
  const context = stageScenario(entry, role, { oracleMatrixUrgency: true });
  const { player, card, humanState, game } = context;
  clearMana(player);
  const expected = configurePool(context) || {};
  await executeScenario(context, entry);
  assert.equal(humanState.submitted || role === 'ai', true, `${entry.raw.name}/${role}: exact payment is offered to its controller`);
  assert.ok(card.castMeta, `${entry.raw.name}/${role}: exact payment reaches real cast metadata`);
  assert.equal(card.castMeta.alt.free, undefined, `${entry.raw.name}/${role}: exact payment is not a free cast`);
  assert.equal(game.stack.length, 0, `${entry.raw.name}/${role}: exact-payment Stack settles`);
  assert.equal(game.pendingTriggers.length, 0, `${entry.raw.name}/${role}: exact-payment triggers settle`);
  if (expected.manaSpent !== undefined) {
    assert.equal(card.castMeta.manaSpent, expected.manaSpent, `${entry.raw.name}/${role}: exact amount of mana was spent`);
  }
  if (expected.phyrexianLifePaid !== undefined) {
    assert.equal(card.castMeta.phyrexianLifePaid, expected.phyrexianLifePaid,
      `${entry.raw.name}/${role}: exact Phyrexian life-pip count`);
  }
  if (expected.lifeAfter !== undefined) {
    assert.equal(player.life, expected.lifeAfter, `${entry.raw.name}/${role}: exact Phyrexian life payment`);
  }
  return context;
}

test('svaki alternativni mana simbol u 4.600 radi kroz stvarnog igrača i bota', async t => {
  const rows = oracleRows();
  const hybrid = rows.filter(({ entry }) => MTG.parseCost(entry.raw.manaCost || entry.raw.cost || MTG.DEFS[entry.raw.name].cost || '')
    .pips.some(pip => pip.length === 2 && pip.every(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol))));
  const phyrexian = rows.filter(({ entry }) => MTG.parseCost(entry.raw.manaCost || entry.raw.cost || MTG.DEFS[entry.raw.name].cost || '')
    .pips.some(pip => pip.includes('PHY')));
  const twoBrid = rows.filter(({ entry }) => MTG.parseCost(entry.raw.manaCost || entry.raw.cost || MTG.DEFS[entry.raw.name].cost || '')
    .pips.some(pip => pip.includes('TWO')));
  const trueColorless = rows.filter(({ entry }) => (entry.raw.manaCost || entry.raw.cost || MTG.DEFS[entry.raw.name].cost || '').includes('{C}'));
  const xSpells = rows.filter(({ entry }) => MTG.parseCost(entry.raw.manaCost || entry.raw.cost || MTG.DEFS[entry.raw.name].cost || '').x > 0);
  assert.deepEqual([hybrid.length, phyrexian.length, twoBrid.length, trueColorless.length, xSpells.length], [95, 10, 4, 1, 26]);

  const failures = [];
  const totals = { hybrid: 0, phyrexian: 0, twoBrid: 0, trueColorlessAccept: 0, trueColorlessReject: 0, x: 0 };
  const capture = async (label, entry, role, fn) => {
    try { await fn(); totals[label]++; }
    catch (error) { failures.push({ card: entry.raw.name, role, label, error: error.message }); }
  };

  for (const { entry } of hybrid) {
    const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
    for (const optionIndex of [0, 1]) for (const role of ['human', 'ai']) {
      await capture('hybrid', entry, role, async () => {
        const context = await castWithExactPool(entry, role, ({ player }) => {
          const colors = exactHybridPool(player, cost, optionIndex);
          return { manaSpent: cost.generic + cost.pips.length, colors };
        });
        const paid = new Set(context.game._payColors || []);
        const expected = cost.pips.map(pip => {
          const colors = pip.filter(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
          return colors.length > 1 ? colors[optionIndex] : colors[0];
        });
        for (const color of expected) assert.ok(paid.has(color), `${entry.raw.name}/${role}: pays the selected hybrid side ${color}`);
      });
    }
  }

  for (const { entry } of phyrexian) {
    const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
    const phyPips = cost.pips.filter(pip => pip.includes('PHY'));
    for (const mode of ['life', 'color']) for (const role of ['human', 'ai']) {
      await capture('phyrexian', entry, role, async () => {
        await castWithExactPool(entry, role, context => {
          const { player } = context;
          if (role === 'ai' && entry.raw.name === 'Gut Shot') {
            context.opponent.life = 1;
          }
          clearMana(player);
          player.pool.C = cost.generic;
          for (const pip of cost.pips.filter(candidate => !candidate.includes('PHY'))) player.pool[pip[0]]++;
          if (mode === 'color') for (const pip of phyPips) player.pool[pip[0]]++;
          return {
            manaSpent: cost.generic + cost.pips.length - (mode === 'life' ? phyPips.length : 0),
            phyrexianLifePaid: mode === 'life' ? phyPips.length : 0,
            lifeAfter: 1000 - (mode === 'life' ? phyPips.length * 2 : 0),
          };
        });
      });
    }
  }

  for (const { entry } of twoBrid) {
    const scenarios = [{ colored: 3 }, { colored: 1 }, { colored: 0 }];
    const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
    const twoPips = cost.pips.filter(pip => pip.includes('TWO'));
    for (const scenario of scenarios) for (const role of ['human', 'ai']) {
      await capture('twoBrid', entry, role, async () => {
        await castWithExactPool(entry, role, ({ player }) => {
          const colored = Math.min(scenario.colored, twoPips.length);
          for (let index = 0; index < colored; index++) player.pool[twoPips[index][0]]++;
          player.pool.C = cost.generic + (twoPips.length - colored) * 2;
          for (const pip of cost.pips.filter(candidate => !candidate.includes('TWO'))) player.pool[pip[0]]++;
          return { manaSpent: cost.generic + cost.pips.length + (twoPips.length - colored) };
        });
      });
    }
  }

  for (const { entry } of trueColorless) for (const role of ['human', 'ai']) {
    await capture('trueColorlessReject', entry, role, async () => {
      const context = stageScenario(entry, role);
      clearMana(context.player);
      context.player.pool.R = 2;
      await context.game.mainPhase(context.player);
      assert.equal(context.card.zone, 'hand', `${entry.raw.name}/${role}: colored-only mana cannot pay {C}`);
      assert.equal(context.humanState.submitted, false, `${entry.raw.name}/${role}: illegal {C} cast is not offered`);
    });
    await capture('trueColorlessAccept', entry, role, async () => {
      await castWithExactPool(entry, role, ({ player }) => {
        player.pool.R = 1;
        player.pool.C = 1;
        return { manaSpent: 2 };
      });
    });
  }

  for (const { entry } of xSpells) for (const role of ['human', 'ai']) {
    await capture('x', entry, role, async () => {
      const context = await castWithExactPool(entry, role, current => {
        const { player } = current;
        const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
        if (entry.raw.name === 'Heat Ray' && current.staged.target) {
          current.staged.target.damage = Math.max(0, current.staged.target.toughness - 2);
        }
        for (const pip of cost.pips) player.pool[pip[0]]++;
        player.pool.C = 4;
        return {};
      });
      const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
      assert.ok(context.card.castMeta.x > 0, `${entry.raw.name}/${role}: controller chooses positive X`);
      assert.equal(context.card.castMeta.manaSpent, context.card.castMeta.x + cost.generic + cost.pips.length,
        `${entry.raw.name}/${role}: X payment matches chosen value`);
    });
  }

  t.diagnostic(`ORACLE_ALT_MANA_DEEP hybrid=${totals.hybrid}/${hybrid.length * 4} ` +
    `phyrexian=${totals.phyrexian}/${phyrexian.length * 4} twoBrid=${totals.twoBrid}/${twoBrid.length * 6} ` +
    `trueColorlessAccept=${totals.trueColorlessAccept}/${trueColorless.length * 2} ` +
    `trueColorlessReject=${totals.trueColorlessReject}/${trueColorless.length * 2} ` +
    `x=${totals.x}/${xSpells.length * 2} failures=${failures.length}`);
  assert.equal(failures.length, 0, failures.map(failure =>
    `${failure.label}/${failure.card}/${failure.role}: ${failure.error}`).join('\n'));
});

function oracleEntry(name) {
  return oracleRows().find(({ entry }) => entry.raw.name === name)?.entry || null;
}

function keywordMechanic(keyword) {
  const value = String(keyword).toLowerCase();
  return value.startsWith('ward ') ? 'ward' : value;
}

function hasActiveKeyword(card, declared) {
  const keyword = keywordMechanic(declared);
  if (keyword === 'ward') return !!card.cur?.wardCost;
  return card.kw(keyword);
}

async function castTypeProbe(targetEntry, spellName, expectedZone) {
  const context = stageScenario(targetEntry, 'human');
  const { game, player, opponent, card: target } = context;
  await executeScenario(context, targetEntry);
  assert.equal(target.zone, 'battlefield', `${target.name}: compound target first resolves through its controller`);

  const spell = zoneCard(opponent, spellName, 'hand');
  const spellState = { submitted: false, trace: [], preferredTargets: [target] };
  opponent.controller = humanController(spell, spellState);
  for (const color of COLORS) opponent.pool[color] = 20;
  const targetTypes = target.def.types.slice();
  const decoy = permanent(game, opponent, fixtureDefinition(`${spellName} friendly decoy for ${target.name}`, targetTypes));
  game.recalc();

  const targetSpec = spell.def.targets[0];
  const legal = game.legalTargets(targetSpec, spell, opponent);
  const protectedTarget = target.kw('shroud') || target.kw('hexproof') || game.isProtectedFrom(target, spell);
  assert.equal(legal.includes(target), !protectedTarget,
    `${target.name}: ${spellName} legal-target check respects every type plus protection`);

  if (spell.is('Instant')) {
    game.turnPlayer = player;
    game.phase = 'end';
    game.step = 'end';
    await game.priorityRound(player);
  } else {
    game.turnPlayer = opponent;
    game.phase = 'main1';
    game.step = 'main';
    await game.mainPhase(opponent);
  }

  assert.equal(spellState.submitted, true, `${target.name}: ${spellName} is offered through a real controller window`);
  assert.ok(spell.castMeta, `${target.name}: ${spellName} records a normal paid cast`);
  assert.equal(spell.castMeta.alt.free, undefined, `${target.name}: ${spellName} is not free-cast`);
  assert.equal(game.stack.length, 0, `${target.name}: ${spellName} Stack settles`);
  assert.equal(game.pendingTriggers.length, 0, `${target.name}: ${spellName} triggers settle`);

  if (protectedTarget) {
    assert.equal(target.zone, 'battlefield', `${target.name}: protection keeps it outside ${spellName}'s targets`);
    assert.notEqual(decoy.zone, 'battlefield', `${target.name}: ${spellName} still resolves on the legal decoy`);
  } else if (target.kw('indestructible') && expectedZone === 'graveyard') {
    assert.equal(target.zone, 'battlefield', `${target.name}: it is a legal ${spellName} target but indestructible prevents destroy`);
  } else {
    assert.equal(target.zone, expectedZone, `${target.name}: ${spellName} recognizes the compound type and resolves`);
  }
}

test('svaka compound-type Oracle karta radi kao svaki od svojih tipova kroz stvarni cast i target', async t => {
  const artifactCreatures = oracleRows().filter(({ entry }) =>
    entry.raw.types.includes('Artifact') && entry.raw.types.includes('Creature'));
  const enchantmentCreatures = oracleRows().filter(({ entry }) =>
    entry.raw.types.includes('Enchantment') && entry.raw.types.includes('Creature'));
  const artifactLands = oracleRows().filter(({ entry }) =>
    entry.raw.types.includes('Artifact') && entry.raw.types.includes('Land'));
  assert.deepEqual([artifactCreatures.length, enchantmentCreatures.length, artifactLands.length], [216, 19, 2]);

  for (const { entry } of artifactCreatures) {
    await castTypeProbe(entry, 'Shatter', 'graveyard');
    await castTypeProbe(entry, 'Unsummon', 'hand');
  }
  for (const { entry } of enchantmentCreatures) {
    await castTypeProbe(entry, 'Demystify', 'graveyard');
    await castTypeProbe(entry, 'Unsummon', 'hand');
  }
  for (const { entry } of artifactLands) {
    await castTypeProbe(entry, 'Shatter', 'graveyard');
    await castTypeProbe(entry, 'Stone Rain', 'graveyard');
  }

  t.diagnostic(`ORACLE_COMPOUND_TYPE_DEEP artifactCreature=${artifactCreatures.length * 2} ` +
    `enchantmentCreature=${enchantmentCreatures.length * 2} artifactLand=${artifactLands.length * 2} failures=0`);
});

test('Snow i Kindred zadržavaju stvarni rules identitet kroz import, cast, Stack i rezoluciju', async () => {
  const snowRows = oracleRows().filter(({ entry }) => (entry.raw.super || []).includes('Snow'));
  assert.equal(snowRows.length, 24);
  for (const { entry } of snowRows) for (const role of ['human', 'ai']) {
    const context = stageScenario(entry, role);
    await executeScenario(context, entry);
    assert.equal(context.card.def.super.includes('Snow'), true, `${entry.raw.name}/${role}: Snow supertype survives controller path`);
    assert.equal(context.card.zone, 'battlefield', `${entry.raw.name}/${role}: Snow card resolves or is played normally`);
  }

  const importedSnow = MTG.importCommanderDeck([
    'Commander',
    '1 Terrian, World Tyrant *CMDR*',
    '',
    'Deck',
    '99 Snow-Covered Forest',
  ].join('\n'), { name: 'Deep Snow Basic Import' });
  assert.equal(importedSnow.ok, true, importedSnow.errors.map(error => error.message).join('\n'));
  assert.equal(importedSnow.deck.cards.find(row => row.name === 'Snow-Covered Forest')?.n, 99,
    'Commander import permits any number of a Snow basic land');

  const tarfireEntry = oracleEntry('Tarfire');
  assert.ok(tarfireEntry, 'Tarfire is the cohort Kindred card');
  const context = stageScenario(tarfireEntry, 'human');
  clearMana(context.player);
  context.player.pool.R = 1;
  const realPriorityRound = context.game.priorityRound.bind(context.game);
  context.game.priorityRound = async () => {};
  assert.equal(await context.game.castSpell(context.player, context.card, { from: 'hand' }), true,
    'Tarfire reaches the actual Stack with normal mana');
  const stackObject = context.game.stack.at(-1);
  assert.equal(stackObject.card, context.card);
  assert.equal(context.card.is('Kindred'), true, 'Tarfire is Kindred on the Stack');
  assert.equal(context.card.is('Instant'), true, 'Tarfire is simultaneously an Instant on the Stack');
  assert.equal(context.card.hasSub('Goblin'), true, 'Tarfire keeps the Goblin subtype on the Stack');
  assert.equal(context.player.turnState.spellsCastList.at(-1).isInstantSorcery, true,
    'Kindred Instant counts as an instant/sorcery cast for engine triggers');
  context.game.priorityRound = realPriorityRound;
  const lifeBefore = context.opponent.life;
  await context.game.resolveTop();
  assert.equal(context.card.zone, 'graveyard');
  assert.equal(context.opponent.life, lifeBefore - 2, 'Tarfire resolves its real damage after the type checks');
});

test('svih 260 multi-keyword karata drži sve sposobnosti zajedno kroz human i AI rezoluciju', async t => {
  const rows = oracleRows().filter(({ entry }) => (entry.implementedKeywords || []).length >= 2);
  assert.equal(rows.length, 260);
  let checks = 0;
  for (const { entry } of rows) for (const role of ['human', 'ai']) {
    const context = stageScenario(entry, role);
    await executeScenario(context, entry);
    if (context.card.faceDown) {
      for (const color of COLORS) context.player.pool[color] = 20;
      const turnUp = context.game.activatableList(context.player)
        .find(action => action.card === context.card && action.turnFaceUp);
      assert.ok(turnUp, `${entry.raw.name}/${role}: face-down choice exposes its real turn-up action`);
      assert.equal(await context.game.activateAbility(context.player, turnUp), true,
        `${entry.raw.name}/${role}: turns face up through the special-action path`);
    }
    assert.equal(context.card.zone, 'battlefield', `${entry.raw.name}/${role}: multi-keyword permanent resolves`);
    for (const declared of entry.implementedKeywords) {
      const keyword = keywordMechanic(declared);
      assert.equal(hasActiveKeyword(context.card, declared), true,
        `${entry.raw.name}/${role}: active ${declared} together with its other keywords`);
      checks++;
    }
  }
  t.diagnostic(`ORACLE_MULTI_KEYWORD_DEEP cards=${rows.length} controllerRuns=${rows.length * 2} activeKeywordChecks=${checks} failures=0`);
});

function combatController(state) {
  return {
    decide: async (game, query) => {
      if (query.type === 'attackers') return state.attacker && query.eligible.includes(state.attacker)
        ? [{ card: state.attacker, target: state.target || query.opponents[0] }] : [];
      if (query.type === 'blockers') return state.blocker && query.potential.includes(state.blocker)
        ? [{ blocker: state.blocker, attacker: state.attacker }] : [];
      return fallbackDecision(query);
    },
  };
}

async function resolvedPermanentGame(name) {
  const entry = oracleEntry(name);
  assert.ok(entry, `${name}: Oracle entry exists`);
  const context = stageScenario(entry, 'human');
  await executeScenario(context, entry);
  assert.equal(context.card.zone, 'battlefield', `${name}: resolves through the real controller`);
  context.card.sick = false;
  context.card.tapped = false;
  context.game.recalc();
  return context;
}

test('reprezentativne multi-keyword kombinacije rade u istom stvarnom combat stanju', async () => {
  {
    const context = await resolvedPermanentGame('Sunblade Angel');
    const { game, player, opponent, card } = context;
    const ground = permanent(game, opponent, fixtureDefinition('Sunblade ground 10/10', ['Creature'], { power: '10', toughness: '10' }));
    const reach = permanent(game, opponent, fixtureDefinition('Sunblade reach 3/3', ['Creature'], {
      power: '3', toughness: '3', kws: ['reach'],
    }));
    game.recalc();
    assert.equal(game.canBlock(ground, card), false, 'flying excludes the ground blocker');
    assert.equal(game.canBlock(reach, card), true, 'reach blocker may engage the flyer');
    player.controller = combatController({ attacker: card, target: opponent });
    opponent.controller = combatController({ attacker: card, blocker: reach });
    const lifeBefore = player.life;
    await game.combatPhase(player);
    assert.equal(card.zone, 'battlefield', 'first strike kills the 3/3 before it can trade');
    assert.equal(reach.zone, 'graveyard', 'first-strike combat damage is lethal');
    assert.equal(player.life, lifeBefore + 3, 'the same first-strike damage gains life through lifelink');
    assert.equal(card.tapped, false, 'vigilance keeps the same attacker untapped');
  }

  {
    const context = await resolvedPermanentGame('Swiftblade Vindicator');
    const { game, player, opponent, card } = context;
    game.addCounters(card, '+1/+1', 2, false, player);
    const blocker = permanent(game, opponent, fixtureDefinition('Swiftblade 1/1 blocker', ['Creature'], { power: '1', toughness: '1' }));
    game.recalc();
    player.controller = combatController({ attacker: card, target: opponent });
    opponent.controller = combatController({ attacker: card, blocker });
    const lifeBefore = opponent.life;
    await game.combatPhase(player);
    assert.equal(blocker.zone, 'graveyard', 'first half of double strike kills the blocker');
    assert.ok(opponent.life <= lifeBefore - 3, 'trample plus double strike carries combat damage to the player');
    assert.equal(card.tapped, false, 'double-striking trampler also keeps vigilance');
  }

  {
    const context = await resolvedPermanentGame('Inkwell Leviathan');
    const { game, player, opponent, card } = context;
    permanent(game, opponent, MTG.DEFS.Island);
    const ground = permanent(game, opponent, fixtureDefinition('Inkwell ground blocker', ['Creature'], { power: '1', toughness: '1' }));
    const hostile = zoneCard(opponent, 'Unsummon', 'hand');
    game.recalc();
    assert.equal(game.canBlock(ground, card), false, 'islandwalk is live against the Island controller');
    assert.equal(game.legalTargets(hostile.def.targets[0], hostile, opponent).includes(card), false,
      'shroud remains live alongside islandwalk and trample');
    card.attacking = opponent;
    card.wasBlocked = true;
    card.blockedBy = [ground];
    ground.blocking = card.iid;
    game.combat = { attackers: [card], defenders: new Map([[opponent.idx, [card]]]) };
    const lifeBefore = opponent.life;
    await game.combatDamage(player, 'normal');
    assert.ok(opponent.life < lifeBefore, 'trample still functions on the same shrouded islandwalker');
  }
});

async function proveTokenKeyword(context, token, keyword) {
  const { game, player, opponent } = context;
  const ground = () => {
    const blocker = permanent(game, opponent,
      fixtureDefinition(`Ground blocker for ${token.name}`, ['Creature'], { power: '1', toughness: '1' }));
    game.recalc();
    return blocker;
  };
  if (keyword === 'flying') {
    assert.equal(game.canBlock(ground(), token), false, `${token.name}: flying token evades ground`);
  } else if (keyword === 'islandwalk') {
    permanent(game, opponent, MTG.DEFS.Island);
    assert.equal(game.canBlock(ground(), token), false, `${token.name}: islandwalk token evades an Island controller`);
  } else if (keyword === 'vigilance') {
    token.sick = false;
    token.tapped = false;
    player.controller = combatController({ attacker: token, target: opponent });
    opponent.controller = combatController({});
    await game.combatPhase(player);
    assert.equal(token.tapped, false, `${token.name}: vigilance token attacks without tapping`);
  } else if (keyword === 'hexproof') {
    const hostile = zoneCard(opponent, 'Unsummon', 'hand');
    game.recalc();
    assert.equal(game.legalTargets(hostile.def.targets[0], hostile, opponent).includes(token), false,
      `${token.name}: hexproof token rejects opponent targeting`);
  } else if (keyword === 'lifelink') {
    const lifeBefore = player.life;
    await game.damagePlayer(token, opponent, 1);
    assert.equal(player.life, lifeBefore + 1, `${token.name}: lifelink token gains exact life`);
  } else if (keyword === 'reach') {
    const flyer = permanent(game, opponent,
      fixtureDefinition(`Flyer for ${token.name}`, ['Creature'], { power: '1', toughness: '1', kws: ['flying'] }));
    game.recalc();
    assert.equal(game.canBlock(token, flyer), true, `${token.name}: reach token blocks flying`);
  } else if (keyword === 'trample') {
    const blocker = ground();
    token.sick = false;
    token.attacking = opponent;
    token.wasBlocked = true;
    token.blockedBy = [blocker];
    blocker.blocking = token.iid;
    game.combat = { attackers: [token], defenders: new Map([[opponent.idx, [token]]]) };
    const lifeBefore = opponent.life;
    await game.combatDamage(player, 'normal');
    assert.ok(opponent.life < lifeBefore, `${token.name}: trample token deals overflow damage`);
  } else {
    assert.fail(`${token.name}: missing functional token proof for ${keyword}`);
  }
}

test('svaki keyword token sva 22 kreatora radi funkcionalno nakon human i AI ETB puta', async t => {
  const rows = oracleRows().filter(({ entry }) => (entry.implementation || []).some(operation =>
    operation.kind === 'etb-token' && (operation.token?.keywords || []).length));
  assert.equal(rows.length, 22);
  let tokensChecked = 0;
  let keywordChecks = 0;
  for (const { entry } of rows) for (const role of ['human', 'ai']) {
    const context = stageScenario(entry, role);
    await executeScenario(context, entry);
    const operation = entry.implementation.find(candidate =>
      candidate.kind === 'etb-token' && (candidate.token?.keywords || []).length);
    const tokens = context.game.bf().filter(candidate => candidate.isToken && candidate.ctrl === context.player &&
      candidate.name === printedTokenName(operation.token));
    assert.equal(tokens.length, operation.n, `${entry.raw.name}/${role}: exact keyword-token count`);
    for (const token of tokens) {
      assert.equal(token.power, Number(operation.token.power), `${entry.raw.name}/${role}: token power`);
      assert.equal(token.toughness, Number(operation.token.toughness), `${entry.raw.name}/${role}: token toughness`);
      for (const type of operation.token.types || ['Creature']) assert.equal(token.is(type), true,
        `${entry.raw.name}/${role}: token type ${type}`);
      for (const subtype of operation.token.subtypes || []) assert.equal(token.hasSub(subtype), true,
        `${entry.raw.name}/${role}: token subtype ${subtype}`);
      for (const rawKeyword of operation.token.keywords) {
        const keyword = keywordMechanic(rawKeyword);
        assert.equal(token.kw(keyword), true, `${entry.raw.name}/${role}: token carries ${rawKeyword}`);
        await proveTokenKeyword(context, token, keyword);
        keywordChecks++;
      }
      tokensChecked++;
    }
  }
  t.diagnostic(`ORACLE_TOKEN_KEYWORD_DEEP creators=${rows.length} controllerRuns=${rows.length * 2} ` +
    `tokens=${tokensChecked} functionalKeywords=${keywordChecks} failures=0`);
});

async function executeNaturalSpellWindow(context, entry) {
  if (entry.raw.types.includes('Instant')) {
    context.game.turnPlayer = context.opponent;
    context.game.phase = 'end';
    context.game.step = 'end';
    await context.game.priorityRound(context.opponent);
  } else {
    context.game.turnPlayer = context.player;
    context.game.phase = 'main1';
    context.game.step = 'main';
    await context.game.mainPhase(context.player);
  }
}

function replaceLethalFixture(context, toughness, extras = {}) {
  let target = context.staged.target;
  if (!target) {
    target = permanent(context.game, context.opponent,
      fixtureDefinition(`Deep lethal target for ${context.card.name}`));
    context.staged.target = target;
  }
  target.def = fixtureDefinition(`Deep lethal target for ${context.card.name}`, ['Creature'], Object.assign({
    power: '1000', toughness: String(toughness),
  }, extras));
  target.damage = 0;
  if (context.staged.decoy) {
    context.staged.decoy.def = fixtureDefinition(`Low-value decoy for ${context.card.name}`, ['Creature'], {
      power: '1', toughness: '100',
    });
  }
  context.humanState.preferredTargets = [target];
  context.game.recalc();
  return target;
}

function assertRealControllerCast(context, entry, role) {
  assert.ok(context.card.castMeta, `${entry.raw.name}/${role}: lethal scenario is a real paid cast`);
  assert.equal(context.card.castMeta.alt.free, undefined, `${entry.raw.name}/${role}: lethal scenario is not free-cast`);
  if (role === 'human') {
    assert.equal(context.humanState.submitted, true, `${entry.raw.name}: human received the cast choice`);
  } else {
    const decisions = (context.game.aiDecisionLog || []).filter(decision => decision.playerId === context.player.idx);
    assert.ok(decisions.some(decision => String(decision.chosen).includes(entry.raw.name)),
      `${entry.raw.name}: genuine AI chose the lethal spell`);
    assert.equal(decisions.some(decision => decision.fallback), false, `${entry.raw.name}: no AI fallback`);
  }
  assert.equal(context.game.stack.length, 0, `${entry.raw.name}/${role}: lethal Stack settles`);
  assert.equal(context.game.pendingTriggers.length, 0, `${entry.raw.name}/${role}: lethal triggers settle`);
}

test('svih 26 -toughness i 57 creature-damage spellova izvršava exact-lethal SBA za igrača i bota', async t => {
  const negativeRows = oracleRows().filter(({ entry }) => (entry.implementation || []).some(operation =>
    operation.kind === 'spell-pump' && Number(operation.toughness) < 0));
  const damageRows = oracleRows().filter(({ entry }) => (entry.implementation || []).some(operation =>
    operation.kind === 'spell-damage' && ['target creature', 'target creature or planeswalker', 'any target'].includes(operation.what)));
  assert.deepEqual([negativeRows.length, damageRows.length], [26, 57]);

  let negativeChecks = 0;
  let damageChecks = 0;
  for (const { entry } of negativeRows) for (const role of ['human', 'ai']) {
    const operation = entry.implementation.find(candidate =>
      candidate.kind === 'spell-pump' && Number(candidate.toughness) < 0);
    const context = stageScenario(entry, role);
    const target = replaceLethalFixture(context, Math.abs(Number(operation.toughness)));
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, role);
    assert.equal(target.zone, 'graveyard', `${entry.raw.name}/${role}: zero toughness executes real SBA death`);
    negativeChecks++;
  }

  for (const { entry } of damageRows) for (const role of ['human', 'ai']) {
    const operation = entry.implementation.find(candidate =>
      candidate.kind === 'spell-damage' && ['target creature', 'target creature or planeswalker', 'any target'].includes(candidate.what));
    const amount = operation.n === 'X' ? 2 : Number(operation.n);
    const context = stageScenario(entry, role);
    const target = replaceLethalFixture(context, amount);
    if (operation.n === 'X') context.humanState.chooseX = amount;
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, role);
    assert.equal(target.zone, 'graveyard', `${entry.raw.name}/${role}: exact damage executes real SBA death`);
    if (operation.n === 'X') {
      assert.equal(context.card.castMeta.x, amount, `${entry.raw.name}/${role}: exact creature-lethal X`);
      const cost = MTG.parseCost(MTG.DEFS[entry.raw.name].cost || '');
      assert.equal(context.card.castMeta.manaSpent, amount + cost.generic + cost.pips.length,
        `${entry.raw.name}/${role}: exact creature-lethal mana spend`);
    }
    damageChecks++;
  }

  t.diagnostic(`ORACLE_LETHAL_SBA_DEEP negative=${negativeChecks}/${negativeRows.length * 2} ` +
    `creatureDamage=${damageChecks}/${damageRows.length * 2} failures=0`);
});

test('-toughness ubija indestructible, dok lokalni AI ne rasipa fixed ili X damage na njega', async () => {
  for (const role of ['human', 'ai']) {
    const entry = oracleEntry('Disfigure');
    const context = stageScenario(entry, role);
    const target = replaceLethalFixture(context, 2, { kws: ['indestructible'] });
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, role);
    assert.equal(target.zone, 'graveyard', `Disfigure/${role}: zero toughness ignores indestructible`);
  }

  {
    const entry = oracleEntry('Shock');
    const context = stageScenario(entry, 'human');
    const target = replaceLethalFixture(context, 2, { kws: ['indestructible'] });
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, 'human');
    assert.equal(target.zone, 'battlefield', 'human Shock target survives through indestructible');
    assert.equal(target.damage, 2, 'human Shock still marks exact damage');
  }

  for (const name of ['Bathe in Dragonfire', 'Heat Ray']) {
    const entry = oracleEntry(name);
    const context = stageScenario(entry, 'ai');
    const target = replaceLethalFixture(context, name === 'Heat Ray' ? 2 : 4, { kws: ['indestructible'] });
    clearMana(context.player);
    context.player.pool.R = 1;
    context.player.pool.C = 9;
    await executeNaturalSpellWindow(context, entry);
    assert.equal(context.card.zone, 'hand', `${name}: AI holds damage that cannot kill its only target`);
    assert.equal(target.zone, 'battlefield', `${name}: indestructible target remains`);
    assert.equal(target.damage, 0, `${name}: AI does not waste damage on the protected target`);
  }

  {
    const entry = oracleEntry('Shock');
    const context = stageScenario(entry, 'ai');
    const target = replaceLethalFixture(context, 2, { kws: ['indestructible'] });
    await executeNaturalSpellWindow(context, entry);
    assert.equal(target.zone, 'battlefield', 'AI Shock cannot kill indestructible');
    assert.equal(target.damage, 0, 'AI Shock selects the legal player instead of fake-lethal indestructible');
    if (context.card.castMeta) assert.equal(context.opponent.life, 998, 'AI Shock deals damage to the opponent when it chooses to cast');
  }
});

test('Blaze bira tačan creature-lethal X kada je protivnički život previsok', async () => {
  const entry = oracleEntry('Blaze');
  for (const role of ['human', 'ai']) {
    const context = stageScenario(entry, role);
    const target = replaceLethalFixture(context, 2);
    context.opponent.life = 40;
    context.humanState.chooseX = 2;
    clearMana(context.player);
    context.player.pool.R = 1;
    context.player.pool.C = 9;
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, role);
    assert.equal(context.card.castMeta.x, 2, `Blaze/${role}: X is exact creature lethal`);
    assert.equal(context.card.castMeta.manaSpent, 3, `Blaze/${role}: no X overpayment`);
    assert.equal(target.zone, 'graveyard', `Blaze/${role}: chosen creature dies`);
    assert.equal(context.opponent.life, 40, `Blaze/${role}: high-life player was not the chosen target`);
  }
});

test('Blaze bira tačan planeswalker-lethal X umjesto maksimalnog preplaćivanja', async () => {
  const entry = oracleEntry('Blaze');
  for (const role of ['human', 'ai']) {
    const context = stageScenario(entry, role);
    const walker = permanent(context.game, context.opponent,
      fixtureDefinition('Deep enemy planeswalker', ['Planeswalker']));
    walker.counters.loyalty = 5;
    context.opponent.life = 40;
    context.humanState.preferredTargets = [walker];
    context.humanState.chooseX = 5;
    clearMana(context.player);
    context.player.pool.R = 1;
    context.player.pool.C = 9;
    context.game.recalc();
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, role);
    assert.equal(context.card.castMeta.x, 5, `Blaze/${role}: X matches exact loyalty`);
    assert.equal(context.card.castMeta.manaSpent, 6, `Blaze/${role}: planeswalker lethal is not overpaid`);
    assert.equal(walker.zone, 'graveyard', `Blaze/${role}: zero-loyalty SBA resolves`);
    assert.equal(context.opponent.life, 40, `Blaze/${role}: high-life player is not selected`);
  }
});

function fourPlayerDamageGame(entry, role) {
  const game = new MTG.Game({ seed: 830900 + entry.raw.name.length + (role === 'ai' ? 100 : 0), paced: false, maxTurns: 4, difficulty: 'hard' });
  const caster = game.addPlayer(`Four-player ${role}`, { name: `Four-player ${entry.raw.name}` }, null, role === 'ai');
  const opponents = [1, 2, 3].map(index => game.addPlayer(`Opponent ${index}`, { name: `Opponent ${index}` }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false));
  for (const player of game.players) {
    player.life = 40;
    fillLibrary(player);
  }
  for (const color of COLORS) caster.pool[color] = 20;
  const card = zoneCard(caster, entry.raw.name, 'hand');
  const state = { submitted: false, trace: [], preferredTargets: [] };
  caster.controller = role === 'ai'
    ? new MTG.AIController(caster, { difficulty: 'hard', style: 'balanced' })
    : humanController(card, state);
  game.turnNo = 8;
  game.recalc();
  return { game, caster, opponents, card, state };
}

async function executeFourPlayerDamage(context, entry) {
  if (entry.raw.types.includes('Instant')) {
    context.game.turnPlayer = context.opponents[0];
    context.game.phase = 'end';
    context.game.step = 'end';
    await context.game.priorityRound(context.opponents[0]);
  } else {
    context.game.turnPlayer = context.caster;
    context.game.phase = 'main1';
    context.game.step = 'main';
    await context.game.mainPhase(context.caster);
  }
}

test('svaki each-opponent spell radi u stvarnom 4-player podu: normalno, lethal i uz prevention', async t => {
  const rows = oracleRows().filter(({ entry }) => (entry.implementation || []).some(operation =>
    operation.kind === 'spell-damage' && operation.what === 'each opponent'));
  assert.deepEqual([...rows.map(({ entry }) => entry.raw.name)].sort(), ['Boltwave', 'Breath of Malfegor', 'Sizzle']);
  let checks = 0;

  for (const { entry } of rows) for (const role of ['human', 'ai']) {
    const operation = entry.implementation.find(candidate => candidate.kind === 'spell-damage' && candidate.what === 'each opponent');
    for (const mode of ['normal', 'lethal', 'prevention']) {
      const context = fourPlayerDamageGame(entry, role);
      const casterLife = context.caster.life;
      if (mode === 'lethal') for (const opponent of context.opponents) opponent.life = operation.n;
      if (mode === 'prevention') {
        context.game.untilEffects.push({ kind: 'preventToPlayer', who: context.opponents[0], expires: 'eot' });
      }
      const before = context.opponents.map(opponent => opponent.life);
      await executeFourPlayerDamage(context, entry);
      assert.ok(context.card.castMeta, `${entry.raw.name}/${role}/${mode}: actual paid cast`);
      assert.equal(context.card.castMeta.alt.free, undefined, `${entry.raw.name}/${role}/${mode}: no free cast`);
      if (role === 'human') assert.equal(context.state.submitted, true, `${entry.raw.name}/${mode}: human action offered`);
      else {
        const decisions = (context.game.aiDecisionLog || []).filter(decision => decision.playerId === context.caster.idx);
        assert.ok(decisions.some(decision => String(decision.chosen).includes(entry.raw.name)), `${entry.raw.name}/${mode}: AI casts`);
        assert.equal(decisions.some(decision => decision.fallback), false, `${entry.raw.name}/${mode}: no AI fallback`);
      }
      assert.equal(context.caster.life, casterLife, `${entry.raw.name}/${role}/${mode}: caster is not its own opponent`);
      for (let index = 0; index < context.opponents.length; index++) {
        const expected = mode === 'prevention' && index === 0 ? before[index] : before[index] - operation.n;
        assert.equal(context.opponents[index].life, expected, `${entry.raw.name}/${role}/${mode}: seat ${index + 1} exact life`);
      }
      if (mode === 'lethal') {
        assert.equal(context.opponents.every(opponent => opponent.lost), true, `${entry.raw.name}/${role}: all opponents lose together`);
        assert.equal(context.game.winner, context.caster, `${entry.raw.name}/${role}: caster wins the pod`);
      }
      assert.equal(context.game.stack.length, 0, `${entry.raw.name}/${role}/${mode}: Stack settles`);
      assert.equal(context.game.pendingTriggers.length, 0, `${entry.raw.name}/${role}/${mode}: triggers settle`);
      checks++;
    }
  }

  t.diagnostic(`ORACLE_FOUR_PLAYER_DAMAGE_DEEP spells=${rows.length} controllerModes=${checks}/18 failures=0`);
});

test('lokalni AI fixed burn bira stvarno lethalnog igrača u 4-player podu', async () => {
  const entry = oracleEntry('Shock');
  const context = fourPlayerDamageGame(entry, 'ai');
  const [largeThreat, lethalTarget, thirdOpponent] = context.opponents;
  largeThreat.life = 7;
  lethalTarget.life = 1;
  thirdOpponent.life = 40;
  for (let index = 0; index < 5; index++) {
    permanent(context.game, largeThreat,
      fixtureDefinition(`Large threat permanent ${index}`, ['Creature'], { power: '20', toughness: '20' }));
  }
  context.game.recalc();
  await executeFourPlayerDamage(context, entry);
  assert.ok(context.card.castMeta, 'Shock is cast through genuine local AI priority');
  assert.equal(lethalTarget.lost, true, 'AI deals lethal Shock damage to the one-life opponent');
  assert.equal(largeThreat.life, 7, 'AI does not confuse generic low-life threat score with actual two-damage lethal');
  assert.equal(thirdOpponent.life, 40, 'unselected opponent is unchanged');
  assert.equal((context.game.aiDecisionLog || []).some(decision => decision.fallback), false, 'no AI fallback');
});

test('ljudski controller eksplicitno bira hybrid, Phyrexian i two-brid način plaćanja', async () => {
  {
    const entry = oracleEntry('Slippery Bogle');
    const context = stageScenario(entry, 'human');
    clearMana(context.player);
    context.player.pool.G = 1;
    context.player.pool.U = 1;
    context.humanState.paymentChoices = ['U'];
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, 'human');
    assert.deepEqual([...context.card.castMeta.paymentColors], ['U'], 'chosen U hybrid route spends U rather than G');
    assert.equal(context.card.castMeta.alternativeManaChoices.hybrid[0], 'U');
    assert.deepEqual([...context.humanState.paymentPrompts[0].options], ['G', 'U']);
  }

  {
    const entry = oracleEntry('Gut Shot');
    const context = stageScenario(entry, 'human');
    clearMana(context.player);
    context.player.pool.R = 1;
    context.player.life = 10;
    context.humanState.paymentChoices = ['life'];
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, 'human');
    assert.deepEqual([...context.card.castMeta.paymentColors], [], 'chosen Phyrexian life route spends no red mana');
    assert.equal(context.player.life, 8, 'chosen Phyrexian route pays exactly two life');
    assert.equal(context.card.castMeta.phyrexianLifePaid, 1);
    assert.equal(context.card.castMeta.alternativeManaChoices.phyrexian[0], 'life');
    assert.deepEqual([...context.humanState.paymentPrompts[0].options], ['R', 'life']);
  }

  {
    const entry = oracleEntry('Flame Javelin');
    const context = stageScenario(entry, 'human');
    clearMana(context.player);
    context.player.pool.R = 3;
    context.player.pool.C = 6;
    context.humanState.paymentChoices = ['generic', 'generic', 'generic'];
    await executeNaturalSpellWindow(context, entry);
    assertRealControllerCast(context, entry, 'human');
    assert.deepEqual([...context.card.castMeta.paymentColors], [], 'three generic two-brid choices spend no red mana');
    assert.equal(context.card.castMeta.manaSpent, 6);
    assert.deepEqual([...context.card.castMeta.alternativeManaChoices.twoBridge], ['generic', 'generic', 'generic']);
    assert.equal(context.humanState.paymentPrompts.length, 3, 'each printed two-brid symbol gets its own decision');
  }
});

async function castSyntheticAlternativeCost(cost, pool, life, role, paymentChoices = [], sourceNames = []) {
  const game = new MTG.Game({ seed: 831200 + cost.length + (role === 'ai' ? 100 : 0), paced: false, maxTurns: 3, difficulty: 'hard' });
  const player = game.addPlayer(`Synthetic ${role}`, { name: `Synthetic ${cost}` }, null, role === 'ai');
  const opponent = game.addPlayer('Synthetic opponent', { name: 'Synthetic opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  fillLibrary(player);
  fillLibrary(opponent);
  player.life = life;
  opponent.life = 40;
  clearMana(player);
  Object.assign(player.pool, pool);
  const manaPermanents = sourceNames.map(name => permanent(game, player, MTG.DEFS[name]));
  const def = fixtureDefinition(`Synthetic ${cost}`, ['Creature'], {
    cost, power: '5', toughness: '5', oracle: 'When this creature enters, draw two cards.',
  });
  const card = zoneCard(player, def, 'hand');
  const state = { submitted: false, trace: [], preferredTargets: [], paymentChoices: paymentChoices.slice() };
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : humanController(card, state);
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.recalc();
  await game.mainPhase(player);
  assert.ok(card.castMeta, `${cost}/${role}: overlapping alternative cost is offered and cast ` +
    JSON.stringify(game.aiDecisionLog || []));
  assert.equal(card.zone, 'battlefield', `${cost}/${role}: synthetic permanent resolves`);
  assert.equal(game.stack.length, 0, `${cost}/${role}: Stack settles`);
  if (role === 'ai') {
    const decisions = (game.aiDecisionLog || []).filter(decision => decision.playerId === player.idx);
    assert.ok(decisions.some(decision => String(decision.chosen).includes(card.name)), `${cost}: AI chose the card`);
    assert.equal(decisions.some(decision => decision.fallback), false, `${cost}: no AI fallback`);
  }
  return { game, player, opponent, card, state, manaPermanents };
}

test('floating-mana solver backtrackuje preklapajući hybrid/Phyrexian i fiksni pip kroz oba controllera', async () => {
  for (const role of ['human', 'ai']) {
    const hybrid = await castSyntheticAlternativeCost('{W/U}{W}', { W: 1, U: 1 }, 40, role, ['U']);
    assert.equal(hybrid.card.castMeta.manaSpent, 2, `{W/U}{W}/${role}: exact two mana`);
    assert.equal(hybrid.player.pool.W + hybrid.player.pool.U, 0, `{W/U}{W}/${role}: U pays hybrid and W pays fixed`);

    const phyrexian = await castSyntheticAlternativeCost('{B/P}{B}', { B: 1 }, 10, role, ['life']);
    assert.equal(phyrexian.card.castMeta.manaSpent, 1, `{B/P}{B}/${role}: only fixed pip spends mana`);
    assert.equal(phyrexian.card.castMeta.phyrexianLifePaid, 1, `{B/P}{B}/${role}: PHY pip uses life`);
    assert.equal(phyrexian.player.life, 8, `{B/P}{B}/${role}: exact life payment`);
  }
});

test('mana-source solver čuva basic za fiksni pip, a life payment tačno označava različiti Phyrexian pip', async () => {
  for (const role of ['human', 'ai']) {
    const phyrexian = await castSyntheticAlternativeCost('{B/P}{B}', {}, 10, role, ['life'], ['Swamp']);
    assert.equal(phyrexian.card.castMeta.manaSpent, 1, `{B/P}{B}/${role}: Swamp pays fixed B`);
    assert.equal(phyrexian.card.castMeta.phyrexianLifePaid, 1, `{B/P}{B}/${role}: PHY uses life`);
    assert.equal(phyrexian.player.life, 8, `{B/P}{B}/${role}: exact life payment`);
    assert.equal(phyrexian.manaPermanents[0].tapped, true, `{B/P}{B}/${role}: one real Swamp is tapped`);

    const hybrid = await castSyntheticAlternativeCost('{B/R}{B}{B}{B}', {}, 40, role, ['R'],
      ['Swamp', 'Swamp', 'Swamp', 'Mountain']);
    assert.equal(hybrid.card.castMeta.manaSpent, 4, `{B/R}{B}{B}{B}/${role}: exact four-source payment`);
    assert.equal(hybrid.manaPermanents.filter(card => card.tapped).length, 4,
      `{B/R}{B}{B}{B}/${role}: Mountain is preserved for hybrid and Swamps for fixed pips`);

    const converter = await castSyntheticAlternativeCost('{W}{U}', { C: 1 }, 40, role, [], ['Azorius Signet']);
    assert.equal(converter.card.castMeta.manaSpent, 2, `Azorius Signet/${role}: floating {C} pays converter cost`);
    assert.equal(converter.player.pool.C, 0, `Azorius Signet/${role}: converter consumes pre-existing colorless`);
    assert.equal(converter.manaPermanents[0].tapped, true, `Azorius Signet/${role}: real converter source activates`);
  }

  const game = new MTG.Game({ seed: 831399, paced: false, maxTurns: 2, difficulty: 'hard' });
  const player = game.addPlayer('Mixed Phyrexian payer', { name: 'Mixed Phyrexian payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  const opponent = game.addPlayer('Mixed Phyrexian opponent', { name: 'Mixed Phyrexian opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  player.life = 2;
  const swamp = permanent(game, player, MTG.DEFS.Swamp);
  const def = fixtureDefinition('Synthetic mixed Phyrexian payment', ['Instant'], {
    cost: '{B/P}{R/P}', oracle: 'Draw a card.',
  });
  const card = new MTG.CardInst(def, player);
  const payment = { card, castOpts: {} };
  game.recalc();
  assert.ok(game.manaSolve(player, MTG.parseCost(def.cost), payment, {}),
    'unconstrained solver sees Swamp for B/P plus life for R/P');
  assert.equal(await game.payMana(player, MTG.parseCost(def.cost), payment, { isSpell: true }), true,
    'mixed-color Phyrexian payment completes atomically');
  assert.equal(player.life, 0, 'only the unmatched R/P symbol costs two life');
  assert.equal(swamp.tapped, true, 'Swamp pays the B/P symbol');
  assert.equal(player.pool.B, 0, 'produced black mana is deducted from the matching pip');
  assert.equal(payment.phyrexianLifePaid, 1, 'exactly one printed Phyrexian symbol uses life');

  const wide = new MTG.Game({ seed: 831401, paced: false, maxTurns: 2, difficulty: 'hard' });
  const widePlayer = wide.addPlayer('Wide solver payer', { name: 'Wide solver payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  wide.addPlayer('Wide solver opponent', { name: 'Wide solver opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  const wideSources = ['Plains', ...Array(4).fill('Island'), ...Array(7).fill('Mountain')]
    .map(name => permanent(wide, widePlayer, MTG.DEFS[name]));
  const wideDef = fixtureDefinition('Synthetic wide hybrid payment', ['Instant'], {
    cost: '{4}{W/U}{W/U}{W/U}{G/W}', oracle: 'Draw a card.',
  });
  const wideCard = new MTG.CardInst(wideDef, widePlayer);
  const widePayment = { card: wideCard, castOpts: {} };
  const wideCost = MTG.parseCost(wideDef.cost);
  wide.recalc();
  assert.ok(wide.manaSolve(widePlayer, wideCost, widePayment, {}),
    'memoized source solver finds the legal constrained-hybrid allocation below its node budget');
  assert.equal(await wide.payMana(widePlayer, wideCost, widePayment, { isSpell: true }), true,
    'wide source allocation executes without a solver cliff');
  assert.equal(wideSources.filter(card => card.tapped).length, 8, 'wide payment taps exactly four colored and four generic basics');
  assert.equal(widePayment.manaSpent, 8, 'wide payment records the exact mana total');
});

test('zajednički troškovi mana izvora se rezervišu jednom i ne mijenjaju stanje pri odbijenom plaćanju', async () => {
  const makeGame = seed => {
    const game = new MTG.Game({ seed, paced: false, maxTurns: 2, difficulty: 'hard' });
    const player = game.addPlayer('Shared-resource payer', { name: 'Shared-resource payer' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, true);
    game.addPlayer('Shared-resource opponent', { name: 'Shared-resource opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    return { game, player };
  };

  {
    const { game, player } = makeGame(831410);
    const millikins = [permanent(game, player, MTG.DEFS.Millikin), permanent(game, player, MTG.DEFS.Millikin)];
    const onlyCard = zoneCard(player, 'Forest', 'library');
    const cost = MTG.parseCost('{2}');
    game.recalc();
    assert.equal(game.manaSolve(player, cost), null, 'one library card cannot fund two Millikin activation costs');
    assert.equal(await game.payMana(player, cost), false, 'payment is rejected before the first Millikin activates');
    assert.equal(millikins.every(card => !card.tapped), true, 'failed payment taps neither source');
    assert.equal(player.library.length, 1, 'failed payment does not mill the shared library card');
    assert.equal(player.library[0], onlyCard);
    assert.equal(player.graveyard.length, 0);
    assert.equal(player.pool.C, 0, 'failed payment leaves no partial floating mana');

    zoneCard(player, 'Island', 'library');
    assert.equal(game.manaSolve(player, cost), null, 'CR605.1a library costs cannot activate during mana payment');
    game.turnPlayer=player;game.turnNo=1;game.phase='main1';game.priorityRound=async()=>{};
    for(const millikin of millikins){
      const action=game.activatableList(player).find(entry=>entry.card===millikin&&entry.ability);
      assert.ok(action);assert.equal(await game.activateAbility(player,action),true);
      assert.equal(game.stack.at(-1).kind,'ability');await game.resolveTop();
    }
    assert.equal(await game.payMana(player, cost), true);
    assert.equal(millikins.every(card => card.tapped), true);
    assert.equal(player.library.length, 0);
    assert.equal(player.graveyard.length, 2);
    assert.equal(player.pool.C, 0, 'the generated two mana pays the exact cost');
  }

  {
    const { game, player } = makeGame(831411);
    const geese = [permanent(game, player, MTG.DEFS['Gilded Goose']), permanent(game, player, MTG.DEFS['Gilded Goose'])];
    const firstFood = permanent(game, player, MTG.TOKENS.food);
    const cost = MTG.parseCost('{2}');
    game.recalc();
    assert.equal(game.manaSolve(player, cost), null, 'one Food cannot be reserved for both Geese');
    assert.equal(await game.payMana(player, cost), false, 'shared Food payment fails atomically');
    assert.equal(geese.every(card => !card.tapped), true);
    assert.equal(firstFood.zone, 'battlefield');
    assert.equal(player.pool.C, 0);

    const secondFood = permanent(game, player, MTG.TOKENS.food);
    assert.ok(game.manaSolve(player, cost), 'two Foods produce a distinct reservation for each Goose');
    assert.equal(await game.payMana(player, cost), true);
    assert.equal(geese.every(card => card.tapped), true);
    assert.equal([firstFood, secondFood].every(card => card.zone !== 'battlefield'), true);
    assert.equal(player.pool.C, 0);
  }

  {
    const { game, player } = makeGame(831412);
    const counterSource = permanent(game, player, fixtureDefinition('Shared charge source', ['Artifact'], {
      mana: [
        { cost: { rmCounter: { kind: 'charge', n: 1 } }, produce: [{ C: 1 }] },
        { cost: { rmCounter: { kind: 'charge', n: 1 } }, produce: [{ C: 1 }] },
      ],
    }));
    counterSource.counters.charge = 1;
    const cost = MTG.parseCost('{2}');
    game.recalc();
    assert.equal(game.manaSolve(player, cost), null, 'one counter cannot fund two separate mana abilities');
    assert.equal(await game.payMana(player, cost), false);
    assert.equal(counterSource.counters.charge, 1, 'failed payment removes no counter');
    assert.equal(player.pool.C, 0);
    counterSource.counters.charge = 2;
    assert.ok(game.manaSolve(player, cost));
    assert.equal(await game.payMana(player, cost), true);
    assert.equal(counterSource.counters.charge || 0, 0);
    assert.equal(player.pool.C, 0);
  }
});

test('višak mane jednog konvertera može pokrenuti sljedeći konverter bez duplog trošenja', async () => {
  for (const [index, [, sourceNames]] of [
    ['forward', ['Azorius Signet', 'Rakdos Signet']],
    ['reverse', ['Rakdos Signet', 'Azorius Signet']],
  ].entries()) {
    const game = new MTG.Game({ seed: 831420 + index, paced: false, maxTurns: 2, difficulty: 'hard' });
    const player = game.addPlayer(`Converter payer ${sourceNames[0]}`, { name: 'Converter payer' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, true);
    game.addPlayer('Converter opponent', { name: 'Converter opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    clearMana(player);
    player.pool.C = 1;
    const sources = sourceNames.map(name => permanent(game, player, MTG.DEFS[name]));
    const cost = MTG.parseCost('{W}{B}{R}');
    const spell = new MTG.CardInst(fixtureDefinition(`Chained converters ${sourceNames[0]}`, ['Instant'], {
      cost: '{W}{B}{R}', oracle: 'Draw a card.',
    }), player);
    const payment = { card: spell, castOpts: {} };
    game.recalc();
    assert.ok(game.manaSolve(player, cost, payment), `${sourceNames.join(' -> ')}: legal chain is solved`);
    assert.equal(await game.payMana(player, cost, payment, { isSpell: true }), true,
      `${sourceNames.join(' -> ')}: chained converter payment executes`);
    assert.equal(sources.every(card => card.tapped), true, 'both Signets activate exactly once');
    assert.equal(Object.values(player.pool).reduce((sum, amount) => sum + amount, 0), 0,
      'one floating C and both Signet outputs are consumed exactly');
    assert.equal(payment.manaSpent, 3);
  }

  const fundedGame = new MTG.Game({ seed: 831428, paced: false, maxTurns: 2, difficulty: 'hard' });
  const fundedPlayer = fundedGame.addPlayer('Source-funded converter payer', { name: 'Source-funded converter payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  fundedGame.addPlayer('Source-funded converter opponent', { name: 'Source-funded converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(fundedPlayer);
  const plains = permanent(fundedGame, fundedPlayer, MTG.DEFS.Plains);
  const signet = permanent(fundedGame, fundedPlayer, MTG.DEFS['Azorius Signet']);
  const fundedCost = MTG.parseCost('{W}{U}');
  const fundedSpell = new MTG.CardInst(fixtureDefinition('Source-funded converter spell', ['Instant'], {
    cost: '{W}{U}', oracle: 'Draw a card.',
  }), fundedPlayer);
  const fundedPayment = { card: fundedSpell, castOpts: {} };
  fundedGame.recalc();
  assert.ok(fundedGame.manaSolve(fundedPlayer, fundedCost, fundedPayment),
    'an ordinary source may fund a converter activation in the same payment');
  assert.equal(await fundedGame.payMana(fundedPlayer, fundedCost, fundedPayment, { isSpell: true }), true);
  assert.equal(plains.tapped, true);
  assert.equal(signet.tapped, true);
  assert.equal(Object.values(fundedPlayer.pool).reduce((sum, amount) => sum + amount, 0), 0,
    'the ordinary source is consumed by the Signet instead of remaining illegally floating');
  assert.equal(fundedPayment.manaSpent, 2);

  const minimalGame = new MTG.Game({ seed: 831427, paced: false, maxTurns: 2, difficulty: 'hard' });
  const minimalPlayer = minimalGame.addPlayer('Minimal converter payer', { name: 'Minimal converter payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  minimalGame.addPlayer('Minimal converter opponent', { name: 'Minimal converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(minimalPlayer);
  const minimalPlains = permanent(minimalGame, minimalPlayer, MTG.DEFS.Plains);
  const minimalForest = permanent(minimalGame, minimalPlayer, MTG.DEFS.Forest);
  const minimalSignet = permanent(minimalGame, minimalPlayer, MTG.DEFS['Azorius Signet']);
  const minimalCost = MTG.parseCost('{W}{U}');
  const minimalSpell = new MTG.CardInst(fixtureDefinition('Minimal converter spell', ['Instant'], {
    cost: '{W}{U}', oracle: 'Draw a card.',
  }), minimalPlayer);
  const minimalPayment = { card: minimalSpell, castOpts: {} };
  minimalGame.recalc();
  assert.equal(await minimalGame.payMana(minimalPlayer, minimalCost, minimalPayment, { isSpell: true }), true);
  assert.equal(minimalSignet.tapped, true);
  assert.equal([minimalPlains, minimalForest].filter(card => card.tapped).length, 1,
    'the solver preserves one unnecessary land instead of banking both before the Signet');
  assert.equal(Object.values(minimalPlayer.pool).reduce((sum, amount) => sum + amount, 0), 0);

  const reserveGame = new MTG.Game({ seed: 831429, paced: false, maxTurns: 2, difficulty: 'hard' });
  const reservePlayer = reserveGame.addPlayer('Converter reserve payer', { name: 'Converter reserve payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  reserveGame.addPlayer('Converter reserve opponent', { name: 'Converter reserve opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(reservePlayer);
  reservePlayer.pool.C = 5;
  const basin = permanent(reserveGame, reservePlayer, MTG.DEFS['Overflowing Basin']);
  const reserveCost = MTG.parseCost('{5}{G}');
  const reserveSpell = new MTG.CardInst(fixtureDefinition('Converter reserve spell', ['Instant'], {
    cost: '{5}{G}', oracle: 'Draw a card.',
  }), reservePlayer);
  const reservePayment = { card: reserveSpell, castOpts: {} };
  reserveGame.recalc();
  assert.ok(reserveGame.manaSolve(reservePlayer, reserveCost, reservePayment),
    'solver reserves one of five floating mana to activate the net-positive converter');
  assert.equal(await reserveGame.payMana(reservePlayer, reserveCost, reservePayment, { isSpell: true }), true);
  assert.equal(basin.tapped, true);
  assert.equal(Object.values(reservePlayer.pool).reduce((sum, amount) => sum + amount, 0), 0);
  assert.equal(reservePayment.manaSpent, 6);
});

test('ograničena mana zadržava provenijenciju kroz konvertere i ne ostavlja djelimično plaćanje', async () => {
  const setup = (seed, name) => {
    const game = new MTG.Game({ seed, paced: false, maxTurns: 2, difficulty: 'hard' });
    const player = game.addPlayer(name, { name }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, true);
    game.addPlayer(`${name} opponent`, { name: `${name} opponent` }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    clearMana(player);
    return { game, player };
  };

  const robot = setup(831438, 'Restricted robot converter blocked');
  const robotSage = permanent(robot.game, robot.player, MTG.DEFS['Somberwald Sage']);
  const herbie = permanent(robot.game, robot.player, MTG.DEFS['H.E.R.B.I.E., Lovable Robot']);
  const robotCost = MTG.parseCost('{G}{G}{W}');
  const robotSpell = new MTG.CardInst(fixtureDefinition('Restricted robot creature payment', ['Creature'], {
    cost: '{G}{G}{W}', oracle: 'Vigilance', power: '3', toughness: '3',
  }), robot.player);
  const robotPayment = { card: robotSpell, castOpts: {} };
  robot.game.recalc();
  assert.equal(robot.game.manaSolve(robot.player, robotCost, robotPayment), null,
    'Somberwald Sage mana cannot activate H.E.R.B.I.E. even while casting a creature');
  assert.equal(await robot.game.payMana(robot.player, robotCost, robotPayment, { isSpell: true }), false);
  assert.equal(robotSage.tapped, false);
  assert.equal(herbie.tapped, false);
  assert.equal(Object.values(robot.player.pool).reduce((sum, amount) => sum + amount, 0), 0);
  assert.equal(robot.player.poolMeta.length, 0);

  const blocked = setup(831432, 'Restricted converter blocked');
  const blockedSage = permanent(blocked.game, blocked.player, MTG.DEFS['Somberwald Sage']);
  const blockedSignet = permanent(blocked.game, blocked.player, MTG.DEFS['Azorius Signet']);
  const blockedCost = MTG.parseCost('{G}{G}{W}{U}');
  const blockedSpell = new MTG.CardInst(fixtureDefinition('Restricted creature payment', ['Creature'], {
    cost: '{G}{G}{W}{U}', oracle: 'Vigilance', power: '4', toughness: '4',
  }), blocked.player);
  const blockedPayment = { card: blockedSpell, castOpts: {} };
  blocked.game.recalc();
  assert.equal(blocked.game.manaSolve(blocked.player, blockedCost, blockedPayment), null,
    'Somberwald Sage mana cannot activate a noncreature Signet ability');
  assert.equal(await blocked.game.payMana(blocked.player, blockedCost, blockedPayment, { isSpell: true }), false);
  assert.equal(blockedSage.tapped, false);
  assert.equal(blockedSignet.tapped, false);
  assert.equal(Object.values(blocked.player.pool).reduce((sum, amount) => sum + amount, 0), 0);

  const legal = setup(831433, 'Restricted converter legal');
  const legalSage = permanent(legal.game, legal.player, MTG.DEFS['Somberwald Sage']);
  const legalForest = permanent(legal.game, legal.player, MTG.DEFS.Forest);
  const legalSignet = permanent(legal.game, legal.player, MTG.DEFS['Azorius Signet']);
  const legalSpell = new MTG.CardInst(fixtureDefinition('Restricted creature payment with fuel', ['Creature'], {
    cost: '{G}{G}{W}{U}', oracle: 'Vigilance', power: '4', toughness: '4',
  }), legal.player);
  const legalPayment = { card: legalSpell, castOpts: {} };
  legal.game.recalc();
  assert.equal(await legal.game.payMana(legal.player, blockedCost, legalPayment, { isSpell: true }), true);
  assert.equal(legalSage.tapped, true);
  assert.equal(legalForest.tapped, true);
  assert.equal(legalSignet.tapped, true);
  assert.equal(legal.player.pool.G, 1, 'the unavoidable third Sage mana remains restricted and floating');
  assert.equal(legal.player.poolMeta.reduce((sum, entry) => sum + entry.n, 0), 1);

  const floating = setup(831434, 'Restricted floating converter');
  const floatingSage = permanent(floating.game, floating.player, MTG.DEFS['Somberwald Sage']);
  const floatingSignet = permanent(floating.game, floating.player, MTG.DEFS['Azorius Signet']);
  floating.player.pool.G = 1;
  floating.player.poolMeta = [{
    color: 'G', n: 1, restrict: floatingSage.def.mana.restrict,
    source: floatingSage, coloredOnly: false,
  }];
  const floatingCost = MTG.parseCost('{W}{U}');
  const floatingSpell = new MTG.CardInst(fixtureDefinition('Restricted floating instant', ['Instant'], {
    cost: '{W}{U}', oracle: 'Draw a card.',
  }), floating.player);
  const floatingPayment = { card: floatingSpell, castOpts: {} };
  floating.game.recalc();
  assert.equal(floating.game.manaSolve(floating.player, floatingCost, floatingPayment), null);
  assert.equal(await floating.game.payMana(floating.player, floatingCost, floatingPayment, { isSpell: true }), false);
  assert.equal(floatingSignet.tapped, false);
  assert.equal(floating.player.pool.G, 1);
  assert.equal(floating.player.poolMeta[0].n, 1);

  const allowed = setup(831435, 'Ability-compatible restricted converter');
  const allowedFuel = permanent(allowed.game, allowed.player,
    fixtureDefinition('Elf ability fuel', ['Land'], {
      mana: {
        cost: { tap: true }, produce: [{ G: 1 }], restrictAbilities: true,
        restrict: (game, action) => !!(action && action.isAbility && action.card && action.card.hasSub('Elf')),
      },
    }));
  const allowedConverter = permanent(allowed.game, allowed.player,
    fixtureDefinition('Elf mana converter', ['Artifact', 'Creature'], {
      subtypes: ['Elf'], power: '1', toughness: '1',
      mana: { cost: { tap: true, mana: '{1}' }, produce: [{ U: 1 }] },
    }));
  const allowedCost = MTG.parseCost('{U}');
  const allowedSpell = new MTG.CardInst(fixtureDefinition('Noncreature converter destination', ['Instant'], {
    cost: '{U}', oracle: 'Draw a card.',
  }), allowed.player);
  const allowedPayment = { card: allowedSpell, castOpts: {} };
  allowed.game.recalc();
  assert.ok(allowed.game.manaSolve(allowed.player, allowedCost, allowedPayment),
    'mana restricted away from the spell can still fund a permitted intermediate ability');
  assert.equal(await allowed.game.payMana(allowed.player, allowedCost, allowedPayment, { isSpell: true }), true);
  assert.equal(allowedFuel.tapped, true);
  assert.equal(allowedConverter.tapped, true);
  assert.equal(Object.values(allowed.player.pool).reduce((sum, amount) => sum + amount, 0), 0);

  const buckets = setup(831437, 'Restricted bucket branching');
  const bucketA = permanent(buckets.game, buckets.player,
    fixtureDefinition('Broad restricted bucket', ['Artifact']));
  const bucketB = permanent(buckets.game, buckets.player,
    fixtureDefinition('Narrow restricted bucket', ['Artifact']));
  const converterOne = permanent(buckets.game, buckets.player,
    fixtureDefinition('Restricted converter one', ['Artifact'], {
      mana: { cost: { tap: true, mana: '{W}' }, produce: [{ R: 1, U: 1 }] },
    }));
  const converterTwo = permanent(buckets.game, buckets.player,
    fixtureDefinition('Restricted converter two', ['Artifact'], {
      mana: { cost: { tap: true, mana: '{R}{W}' }, produce: [{ G: 1 }] },
    }));
  const broad = (game, action) => !!(action && action.isAbility && action.card &&
    ['Restricted converter one', 'Restricted converter two'].includes(action.card.name));
  const narrow = (game, action) => !!(action && action.isAbility && action.card &&
    action.card.name === 'Restricted converter one');
  buckets.player.pool.W = 2;
  buckets.player.poolMeta = [
    {
      color: 'W', n: 1, restrict: broad, restrictAbilities: true,
      source: bucketA, coloredOnly: false,
    },
    {
      color: 'W', n: 1, restrict: narrow, restrictAbilities: true,
      source: bucketB, coloredOnly: false,
    },
  ];
  const bucketCost = MTG.parseCost('{U}{G}');
  const bucketSpell = new MTG.CardInst(fixtureDefinition('Restricted bucket destination', ['Instant'], {
    cost: '{U}{G}', oracle: 'Draw a card.',
  }), buckets.player);
  const bucketPayment = { card: bucketSpell, castOpts: {} };
  buckets.game.recalc();
  assert.ok(buckets.game.manaSolve(buckets.player, bucketCost, bucketPayment),
    'solver spends the narrow W first and preserves the broad W for the second converter');
  assert.equal(await buckets.game.payMana(buckets.player, bucketCost, bucketPayment, { isSpell: true }), true);
  assert.equal(converterOne.tapped, true);
  assert.equal(converterTwo.tapped, true);
  assert.equal(Object.values(buckets.player.pool).reduce((sum, amount) => sum + amount, 0), 0);
  assert.equal(buckets.player.poolMeta.length, 0);
});

test('pet konvertera ostaje u ograničenom solver budžetu bez faktorijelne blokade', () => {
  const game = new MTG.Game({ seed: 831436, paced: false, maxTurns: 2, difficulty: 'hard' });
  const player = game.addPlayer('Bounded converter solver', { name: 'Bounded converter solver' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  game.addPlayer('Bounded converter opponent', { name: 'Bounded converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(player);
  for (const name of ['Azorius Signet', 'Golgari Signet', 'Gruul Signet', 'Izzet Signet', 'Rakdos Signet']) {
    permanent(game, player, MTG.DEFS[name]);
  }
  for (let index = 0; index < 20; index++) permanent(game, player, MTG.DEFS.Forest);
  const cost = MTG.parseCost('{40}{W}{U}{B}{R}{G}');
  const spell = new MTG.CardInst(fixtureDefinition('Impossible five-converter spell', ['Instant'], {
    cost: '{40}{W}{U}{B}{R}{G}', oracle: 'Draw a card.',
  }), player);
  game.recalc();
  const started = performance.now();
  assert.equal(game.manaSolve(player, cost, { card: spell, castOpts: {} }), null);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 5000, `five-converter solve took ${elapsed.toFixed(1)} ms`);
});

test('konverter DFS pronalazi proizvoljan lanac i čuva suvišne obične izvore', async () => {
  const game = new MTG.Game({ seed: 831438, paced: false, maxTurns: 2, difficulty: 'hard' });
  const player = game.addPlayer('Arbitrary converter chain', { name: 'Arbitrary converter chain' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  game.addPlayer('Arbitrary converter opponent', { name: 'Arbitrary converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(player);
  const converter = (name, mana, produce) => permanent(game, player,
    fixtureDefinition(name, ['Artifact'], {
      mana: { cost: { tap: true, mana }, produce: [produce] },
    }));
  const a = converter('Converter A', '{W}', { U: 1, C: 1 });
  const b = converter('Converter B', '{R}', { G: 1, C: 1 });
  const c = converter('Converter C', '{U}', { B: 1, C: 1 });
  const d = converter('Converter D', '{G}', { C: 2 });
  const e = converter('Converter E', '{B}', { R: 1, C: 1 });
  player.pool.W = 1;
  const chainCost = MTG.parseCost('{6}');
  const chainSpell = new MTG.CardInst(fixtureDefinition('Arbitrary converter destination', ['Instant'], {
    cost: '{6}', oracle: 'Draw a card.',
  }), player);
  const chainPayment = { card: chainSpell, castOpts: {} };
  game.recalc();
  const solution = game.manaSolve(player, chainCost, chainPayment);
  assert.ok(solution, 'the only payable converter order is found without enumerating permutations');
  assert.deepEqual(Array.from(solution.plan.filter(step => step.consume), step => step.src.card.name),
    ['Converter A', 'Converter C', 'Converter E', 'Converter B', 'Converter D']);
  assert.equal(await game.payMana(player, chainCost, chainPayment, { isSpell: true }), true);
  assert.equal([a, b, c, d, e].every(card => card.tapped), true);
  assert.equal(Object.values(player.pool).reduce((sum, amount) => sum + amount, 0), 0);

  const leanGame = new MTG.Game({ seed: 831439, paced: false, maxTurns: 2, difficulty: 'hard' });
  const leanPlayer = leanGame.addPlayer('Two-input converter payer', { name: 'Two-input converter payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  leanGame.addPlayer('Two-input converter opponent', { name: 'Two-input converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(leanPlayer);
  const forests = Array.from({ length: 3 }, () => permanent(leanGame, leanPlayer, MTG.DEFS.Forest));
  const twoInput = permanent(leanGame, leanPlayer,
    fixtureDefinition('Two-input converter', ['Artifact'], {
      mana: { cost: { tap: true, mana: '{2}' }, produce: [{ W: 1, U: 1 }] },
    }));
  const leanCost = MTG.parseCost('{W}{U}');
  const leanSpell = new MTG.CardInst(fixtureDefinition('Two-input converter destination', ['Instant'], {
    cost: '{W}{U}', oracle: 'Draw a card.',
  }), leanPlayer);
  const leanPayment = { card: leanSpell, castOpts: {} };
  leanGame.recalc();
  assert.equal(await leanGame.payMana(leanPlayer, leanCost, leanPayment, { isSpell: true }), true);
  assert.equal(twoInput.tapped, true);
  assert.equal(forests.filter(card => card.tapped).length, 2,
    'a {2} converter preserves the third ordinary source');
  assert.equal(Object.values(leanPlayer.pool).reduce((sum, amount) => sum + amount, 0), 0);

  const discountGame = new MTG.Game({ seed: 831440, paced: false, maxTurns: 2, difficulty: 'hard' });
  const discountPlayer = discountGame.addPlayer('Discounted converter payer', { name: 'Discounted converter payer' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, true);
  discountGame.addPlayer('Discounted converter opponent', { name: 'Discounted converter opponent' }, {
    decide: async (currentGame, query) => fallbackDecision(query),
  }, false);
  clearMana(discountPlayer);
  permanent(discountGame, discountPlayer, MTG.DEFS['Tezzeret, Betrayer of Flesh']);
  const discountedSignet = permanent(discountGame, discountPlayer, MTG.DEFS['Azorius Signet']);
  const laterRing = permanent(discountGame, discountPlayer, MTG.DEFS['Sol Ring']);
  const discountCost = MTG.parseCost('{W}{U}{C}{C}');
  const discountSpell = new MTG.CardInst(fixtureDefinition('Discounted converter destination', ['Instant'], {
    cost: '{W}{U}{C}{C}', oracle: 'Draw a card.',
  }), discountPlayer);
  const discountPayment = { card: discountSpell, castOpts: {} };
  const activationOrder = [];
  const activateManaSource = discountGame.activateManaSource.bind(discountGame);
  discountGame.activateManaSource = async (payer, source, ...args) => {
    activationOrder.push(source.card && source.card.name);
    return activateManaSource(payer, source, ...args);
  };
  discountGame.recalc();
  assert.equal(await discountGame.payMana(discountPlayer, discountCost, discountPayment, { isSpell: true }), true);
  assert.deepEqual(activationOrder, ['Azorius Signet', 'Sol Ring'],
    'Tezzeret discounts the Signet before Sol Ring spends the first-artifact activation');
  assert.equal(discountedSignet.tapped, true);
  assert.equal(laterRing.tapped, true);
  assert.equal(Object.values(discountPlayer.pool).reduce((sum, amount) => sum + amount, 0), 0);
});

test('mana solver preferira besplatan Signet plan i poštuje tačan ručni filter izbor', async () => {
  const makeGame = (seed, ai = false) => {
    const game = new MTG.Game({ seed, paced: false, maxTurns: 2, difficulty: 'hard' });
    const player = game.addPlayer('Converter regression payer', { name: 'Converter regression payer' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, ai);
    game.addPlayer('Converter regression opponent', { name: 'Converter regression opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    clearMana(player);
    return { game, player };
  };

  {
    const { game, player } = makeGame(831441, true);
    const spires = [
      permanent(game, player, MTG.DEFS['Spire of Industry']),
      permanent(game, player, MTG.DEFS['Spire of Industry']),
    ];
    const signet = permanent(game, player, MTG.DEFS['Azorius Signet']);
    const spell = new MTG.CardInst(fixtureDefinition('Spire Signet destination', ['Instant'], {
      cost: '{W}{U}', oracle: 'Draw a card.',
    }), player);
    const payment = { card: spell, castOpts: {} };
    player.life = 40;
    game.recalc();

    assert.equal(await game.payMana(player, MTG.parseCost('{W}{U}'), payment, { isSpell: true }), true);
    assert.equal(player.life, 40, 'one colorless Spire funds Signet without paying life');
    assert.equal(signet.tapped, true);
    assert.equal(spires.filter(card => card.tapped).length, 1,
      'the zero-life converter plan preserves the second Spire');
    assert.equal(Object.values(player.pool).reduce((sum, amount) => sum + amount, 0), 0);
  }

  {
    const { game, player } = makeGame(831442, false);
    const forest = permanent(game, player, MTG.DEFS.Forest);
    const herbie = permanent(game, player, MTG.DEFS['H.E.R.B.I.E., Lovable Robot']);
    herbie.sick = false;
    const spell = new MTG.CardInst(fixtureDefinition('Manual H.E.R.B.I.E. destination', ['Instant'], {
      cost: '{G}', oracle: 'Draw a card.',
    }), player);
    const payment = { card: spell, castOpts: {} };
    const cost = MTG.parseCost('{G}');
    game.recalc();

    const manual = game.manualManaSelectionSolution(player, cost, payment, [forest, herbie]);
    assert.ok(manual, 'Forest may fund the selected H.E.R.B.I.E. filter ability');
    assert.deepEqual(new Set(manual.plan.filter(step => step.src).map(step => step.src.card)),
      new Set([forest, herbie]));
    assert.equal(await game.payMana(player, cost, payment, { onlyCards: [forest, herbie] }), true);
    assert.equal(forest.tapped, true);
    assert.equal(herbie.tapped, true);
    assert.equal(Object.values(player.pool).reduce((sum, amount) => sum + amount, 0), 0);
  }
});

test('ljudski i lokalni AI controller biraju žrtvu za mana-cost prije atomske aktivacije izvora', async () => {
  for (const role of ['human', 'ai']) {
    const game = new MTG.Game({ seed: 831430 + (role === 'ai' ? 1 : 0), paced: false, maxTurns: 2, difficulty: 'hard' });
    const player = game.addPlayer(`Sacrifice payer ${role}`, { name: 'Sacrifice payer' }, null, role === 'ai');
    game.addPlayer('Sacrifice opponent', { name: 'Sacrifice opponent' }, {
      decide: async (currentGame, query) => fallbackDecision(query),
    }, false);
    fillLibrary(player, 5);
    const brushrazer = permanent(game, player, MTG.DEFS['Evendo Brushrazer']);
    const mountain = permanent(game, player, MTG.DEFS.Mountain);
    const forest = permanent(game, player, MTG.DEFS.Forest);
    let sacrificePrompt = null;
    let selected = [];
    let selectedWasTappedAtSacrifice = null;
    const sacrificeMany = game.sacrificeMany.bind(game);
    game.sacrificeMany = async (who, cards, ...rest) => {
      const chosen = cards.find(card => selected.includes(card));
      if (chosen) selectedWasTappedAtSacrifice = chosen.tapped;
      return sacrificeMany(who, cards, ...rest);
    };
    const genuineAI = role === 'ai' ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' }) : null;
    player.controller = {
      decide: async (currentGame, query) => {
        if (query.type === 'chooseCards' && query.aiHint?.kind === 'sacCost') {
          sacrificePrompt = {
            candidates: query.from.slice(),
            before: {
              brushrazerTapped: brushrazer.tapped,
              mountainTapped: mountain.tapped,
              mountainZone: mountain.zone,
              pool: Object.assign({}, player.pool),
            },
          };
          const answer = role === 'ai'
            ? await genuineAI.decide(currentGame, query)
            : [mountain];
          selected = Array.isArray(answer) ? answer.slice() : [];
          return answer;
        }
        return role === 'ai' ? genuineAI.decide(currentGame, query) : fallbackDecision(query);
      },
    };
    clearMana(player);
    const cost = MTG.parseCost('{R}{R}{R}');
    game.recalc();
    assert.ok(game.manaSolve(player, cost), `${role}: Mountain plus Brushrazer is a legal three-red line`);
    assert.equal(await game.payMana(player, cost), true, `${role}: selected land is sacrificed only after preflight`);
    assert.ok(sacrificePrompt, `${role}: controller receives the sacrifice interaction`);
    assert.deepEqual(sacrificePrompt.before, {
      brushrazerTapped: false,
      mountainTapped: false,
      mountainZone: 'battlefield',
      pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    }, `${role}: prompt happens before any source or pool mutation`);
    assert.equal(sacrificePrompt.candidates.includes(mountain), true);
    assert.equal(sacrificePrompt.candidates.includes(forest), true);
    assert.equal(selected.length, 1);
    assert.equal(selected[0].zone !== 'battlefield', true, `${role}: exactly the chosen land is sacrificed`);
    assert.equal(brushrazer.tapped, true);
    if (selected[0] === mountain) {
      assert.equal(selectedWasTappedAtSacrifice, true, `${role}: Mountain mana is committed before Mountain is sacrificed`);
    } else {
      assert.equal(mountain.tapped, true, `${role}: Mountain remains tapped after funding the payment`);
    }
    assert.equal(Object.values(player.pool).reduce((sum, amount) => sum + amount, 0), 0);
  }
});
