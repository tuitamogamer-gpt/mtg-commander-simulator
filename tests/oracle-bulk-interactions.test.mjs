import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function genericBatches(MTG) {
  return MTG.ORACLE_BATCHES.filter(batch => batch.cards.some(entry => entry.semanticClass !== 'manual-deck-semantic'));
}

function genericEntries(MTG) {
  return genericBatches(MTG).flatMap(batch => batch.cards
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => ({ batch, entry })));
}

function decision(overrides = {}) {
  return {
    decide: async (game, query) => {
      if (overrides[query.type]) return overrides[query.type](game, query);
      if (query.type === 'priority') return { kind: 'pass' };
      if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
      if (query.type === 'chooseOption') return query.options[0]?.key;
      if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
      if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
      if (query.type === 'chooseX') return query.min || 0;
      if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 0).map(option => option.key);
      if (query.type === 'orderTriggers') return query.triggers || query.items || [];
      if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
      return null;
    },
  };
}

function gameFor(MTG, controllers = [decision(), decision()]) {
  const game = new MTG.Game({ seed: 1007, paced: false, maxTurns: 5 });
  const a = game.addPlayer('Oracle A', { name: 'Oracle A' }, controllers[0], false);
  const b = game.addPlayer('Oracle B', { name: 'Oracle B' }, controllers[1], true);
  game.turnPlayer = a;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.reviewCombatWithHuman = async () => {};
  return { game, a, b };
}

function permanent(MTG, game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function zoneCard(MTG, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'Oracle interaction stack did not settle');
}

function mechanic(keyword) {
  const value = String(keyword).toLowerCase();
  return value.startsWith('ward ') ? 'ward' : value;
}

function declaredKeywordOccurrences(MTG, entry) {
  const occurrences = [];
  for (const declared of entry.implementedKeywords || []) {
    const key = mechanic(declared);
    const count = key === 'prowess'
      ? Math.max(1, (MTG.DEFS[entry.raw.name].triggers || []).filter(trigger => trigger.desc === 'Prowess').length)
      : 1;
    for (let index = 0; index < count; index++) occurrences.push(declared);
  }
  return occurrences;
}

function fixtureDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '20000' : undefined,
    toughness: types.includes('Creature') ? '20000' : undefined,
  }, extras);
}

function fillLibrary(MTG, player, n) {
  for (let index = 0; index < n; index++) zoneCard(MTG, player, 'Forest', 'library');
}

function poolTotal(player) {
  return Object.values(player.pool).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function fund(player, amount = 30) {
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = amount;
  player.life = Math.max(player.life, 100);
}

function baseContract(entry) {
  if (entry.raw.types.includes('Land')) return 'land-play';
  if (entry.raw.types.some(type => type === 'Instant' || type === 'Sorcery')) return 'spell-casting';
  if (entry.raw.types.includes('Creature')) return 'creature-casting';
  if (entry.raw.types.some(type => type === 'Artifact' || type === 'Enchantment')) return 'permanent-casting';
  return null;
}

async function enterPermanentProof(MTG, context, entry) {
  const { game, a } = context;
  const card = zoneCard(MTG, a, entry.raw.name, 'hand');
  if (entry.raw.types.includes('Land')) {
    assert.equal(await game.playLand(a, card), true, `${card.name}: real land-play path`);
    assert.equal(card.zone, 'battlefield', `${card.name}: land enters battlefield`);
  } else {
    assert.equal(await game.castSpell(a, card, { alt: { free: true } }), true, `${card.name}: free cast enters the real stack`);
    assert.equal(card.zone, 'stack', `${card.name}: stack zone`);
    await resolveAll(game);
    const expectedZone = Number(entry.raw.toughness) <= 0 ? 'graveyard' : 'battlefield';
    assert.equal(card.zone, expectedZone,
      `${card.name}: resolves and state-based actions are applied (library=${a.library.length}, lost=${a.lost}, log=${game.log.slice(-4).map(item => item.msg).join(' | ')})`);
  }
  await resolveAll(game);
  return card;
}

async function cardProof(MTG, entry) {
  const context = gameFor(MTG);
  if (entry.raw.types.includes('Land') || entry.raw.types.some(type =>
    type === 'Creature' || type === 'Artifact' || type === 'Enchantment')) {
    const card = await enterPermanentProof(MTG, context, entry);
    if (entry.semanticClass === 'vanilla' && card.zone === 'battlefield') {
      assert.equal(card.power, Number(entry.raw.power), `${card.name}: vanilla power`);
      assert.equal(card.toughness, Number(entry.raw.toughness), `${card.name}: vanilla toughness`);
    }
    return 1;
  }
  assert.fail(`${entry.raw.name}: spell-template card must be executed by its operation proof`);
}

function targetPermanent(MTG, game, player, what, extras = {}) {
  if (what === 'land') return permanent(MTG, game, player, 'Forest');
  if (what === 'artifact' || what === 'artifact or enchantment' || what === 'artifact or creature') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Artifact Target', ['Artifact'], extras));
  }
  if (what === 'enchantment') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Enchantment Target', ['Enchantment'], extras));
  }
  if (what === 'permanent' || what === 'nonland permanent') {
    return permanent(MTG, game, player, fixtureDefinition('Oracle Permanent Target', ['Artifact'], extras));
  }
  return permanent(MTG, game, player, fixtureDefinition('Oracle Creature Target', ['Creature'], extras));
}

async function operationProof(MTG, entry, operation) {
  let wantedTargets = [];
  let wantedCards = [];
  let selectionQuery = null;
  let selectedLibraryCard = null;
  const chooser = decision({
    chooseTargets: (game, query) => {
      const max = query.max ?? query.count ?? 1;
      const chosen = wantedTargets.filter(target => query.candidates.includes(target)).slice(0, max);
      for (const candidate of query.candidates) {
        if (chosen.length >= (query.min || 0) || chosen.length >= max) break;
        if (!chosen.includes(candidate)) chosen.push(candidate);
      }
      return chosen;
    },
    chooseCards: (game, query) => {
      const max = query.max ?? query.min ?? 1;
      const chosen = wantedCards.filter(card => query.from.includes(card)).slice(0, max);
      for (const card of query.from) {
        if (chosen.length >= (query.min || 0) || chosen.length >= max) break;
        if (!chosen.includes(card)) chosen.push(card);
      }
      return chosen;
    },
    scry: (game, query) => {
      selectionQuery = query;
      selectedLibraryCard = query.cards[0] || null;
      return { top: query.cards.slice(1), bottom: selectedLibraryCard ? [selectedLibraryCard] : [] };
    },
  });
  const context = gameFor(MTG, [chooser, decision()]);
  const { game, a, b } = context;
  const name = entry.raw.name;
  const operations = entry.implementation || [];

  const stageSpellTarget = async targetOperation => {
    let effectTarget = null;
    let counterTarget = null;
    if (!targetOperation) return { effectTarget, counterTarget };
    if (targetOperation.kind === 'spell-counter') {
      const type = targetOperation.spellType === 'creature spell' ? 'Creature'
        : targetOperation.spellType === 'instant spell' ? 'Instant' : 'Sorcery';
      const baitDef = fixtureDefinition(`Oracle ${type} Counter Bait`, [type], {
        cost: '{1}', power: type === 'Creature' ? '2' : undefined,
        toughness: type === 'Creature' ? '2' : undefined,
      });
      const bait = new MTG.CardInst(baitDef, b);
      bait.zone = 'hand';
      b.hand.push(bait);
      game.turnPlayer = b;
      assert.equal(await game.castSpell(b, bait, { from: 'hand', alt: { free: true } }), true,
        `${name}: real ${targetOperation.spellType || 'spell'} on Stack`);
      counterTarget = game.stack.at(-1);
      wantedTargets = [counterTarget];
      game.turnPlayer = a;
      return { effectTarget, counterTarget };
    }
    if (targetOperation.kind === 'spell-pump') {
      const controller = targetOperation.controller === 'opponent' ? b : a;
      effectTarget = targetPermanent(MTG, game, controller, 'creature');
      if (targetOperation.attacking) effectTarget.attacking = controller === a ? b : a;
      game.recalc();
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-discard') {
      wantedTargets = [b];
    } else if (targetOperation.kind === 'spell-mill') {
      wantedTargets = [b];
    } else if (['spell-destroy', 'spell-exile', 'spell-bounce'].includes(targetOperation.kind)) {
      const extras = {};
      if (targetOperation.stat) {
        extras[targetOperation.stat] = String(targetOperation.threshold);
        if (targetOperation.stat === 'power' && extras.toughness === undefined) extras.toughness = '20000';
        if (targetOperation.stat === 'toughness' && extras.power === undefined) extras.power = '20000';
      }
      effectTarget = targetPermanent(MTG, game, b, targetOperation.what, extras);
      if (targetOperation.tapped) effectTarget.tapped = true;
      if (targetOperation.attacking || targetOperation.attackingOrBlocking) effectTarget.attacking = a;
      if (targetOperation.blocking) effectTarget.blocking = true;
      if (targetOperation.kind === 'spell-destroy' && targetOperation.noRegen) effectTarget.regenShield = 1;
      game.recalc();
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-damage' && targetOperation.what !== 'each opponent') {
      if (targetOperation.what === 'target creature' || targetOperation.what === 'target creature or planeswalker') {
        effectTarget = targetPermanent(MTG, game, b, 'creature');
        wantedTargets = [effectTarget];
      } else wantedTargets = [b];
    } else if (targetOperation.kind === 'spell-graveyard-return') {
      const types = targetOperation.what === 'instant or sorcery' ? ['Instant']
        : targetOperation.what === 'permanent' ? ['Artifact']
          : [targetOperation.what.charAt(0).toUpperCase() + targetOperation.what.slice(1)];
      const def = fixtureDefinition('Oracle Graveyard Return Target', types);
      effectTarget = new MTG.CardInst(def, a);
      effectTarget.zone = 'graveyard';
      a.graveyard.push(effectTarget);
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-counter-on-creature') {
      const controller = targetOperation.controller === 'opponent' ? b : a;
      effectTarget = targetPermanent(MTG, game, controller, 'creature');
      wantedTargets = [effectTarget];
    } else if (targetOperation.kind === 'spell-tap' || targetOperation.kind === 'spell-untap') {
      const count = targetOperation.count || 1;
      const what = targetOperation.what.includes('land') ? 'land'
        : targetOperation.what.includes('permanent') ? 'permanent' : 'creature';
      const targets = Array.from({ length: count }, (_, index) => {
        const target = targetPermanent(MTG, game, b, what);
        target.tapped = targetOperation.kind === 'spell-untap';
        target.meta.oracleBulkIndex = index;
        return target;
      });
      game.recalc();
      effectTarget = targets[0];
      wantedTargets = targets;
    }
    return { effectTarget, counterTarget };
  };

  const targetOperation = operations.find(candidate => [
    'spell-counter', 'spell-pump', 'spell-discard', 'spell-mill', 'spell-destroy',
    'spell-exile', 'spell-bounce', 'spell-damage', 'spell-graveyard-return',
    'spell-counter-on-creature', 'spell-tap', 'spell-untap',
  ].includes(candidate.kind) && !(candidate.kind === 'spell-damage' && candidate.what === 'each opponent'));

  if (operation.kind === 'cycling') {
    fillLibrary(MTG, a, 8);
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const beforeLibrary = a.library.length;
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.cycling);
    assert.ok(action, `${name}: compiled Cycling is offered from hand`);
    assert.equal(await game.activateAbility(a, action), true, `${name}: Cycling activates`);
    assert.equal(source.zone, 'graveyard', `${name}: Cycling discards the source`);
    assert.equal(a.library.length, beforeLibrary, `${name}: Cycling draw waits on the Stack`);
    assert.equal(game.stack.some(item => item.kind === 'ability' && item.srcCard === source), true,
      `${name}: Cycling creates a respondable activated ability`);
    await resolveAll(game);
    assert.equal(a.library.length, beforeLibrary - 1, `${name}: Cycling draws exactly one card`);
    return 1;
  }

  if (operation.kind === 'mechanic-flashback') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'graveyard');
    fund(a);
    const offer = game.castableList(a).find(candidate => candidate.card === source && candidate.alt?.flashback);
    assert.ok(offer, `${name}: Flashback is offered from the graveyard`);
    assert.equal(await game.castSpell(a, source, { from: offer.from, alt: offer.alt }), true, `${name}: Flashback casts`);
    assert.equal(source.zone, 'stack', `${name}: Flashback uses the Stack`);
    await resolveAll(game);
    assert.equal(source.zone, 'exile', `${name}: resolved Flashback spell is exiled`);
    return 1;
  }

  if (operation.kind === 'mechanic-morph' || operation.kind === 'mechanic-disguise') {
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const offer = game.castableList(a).find(candidate => candidate.card === source && candidate.alt?.faceDownCast);
    assert.ok(offer, `${name}: face-down cast is offered`);
    assert.equal(await game.castSpell(a, source, { from: offer.from, alt: offer.alt }), true, `${name}: casts face down`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject, `${name}: face-down spell is on Stack`);
    assert.equal(source.name, 'Face-down creature', `${name}: hidden Stack identity`);
    assert.equal(source.mv, 0, `${name}: face-down Stack mana value`);
    await resolveAll(game);
    assert.equal(source.zone, 'battlefield');
    assert.equal(source.faceDown, true);
    assert.equal(source.power, 2);
    assert.equal(source.toughness, 2);
    assert.equal(source.cur.wardCost?.mana || null, operation.kind === 'mechanic-disguise' ? '{2}' : null);
    const turnUp = game.activatableList(a).find(candidate => candidate.card === source && candidate.turnFaceUp);
    assert.ok(turnUp, `${name}: turn-face-up special action is offered`);
    assert.equal(await game.activateAbility(a, turnUp), true, `${name}: turns face up`);
    assert.equal(source.faceDown, false);
    assert.equal(source.name, name);
    return 1;
  }

  if (operation.kind === 'mechanic-suspend') {
    const source = zoneCard(MTG, a, name, 'hand');
    fund(a);
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.suspend);
    assert.ok(action, `${name}: Suspend special action is offered`);
    assert.equal(await game.activateAbility(a, action), true, `${name}: Suspend activates`);
    assert.equal(source.zone, 'exile');
    assert.equal(source.meta.suspended, operation.n, `${name}: exact time-counter count`);
    assert.equal(game.stack.length, 0, `${name}: Suspend does not use the Stack`);
    return 1;
  }

  if (operation.kind === 'mechanic-convoke') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const helper = permanent(MTG, game, a, fixtureDefinition('Oracle Convoke Helper', ['Creature'], {
      colorsOverride: ['W', 'U', 'B', 'R', 'G'], power: '20', toughness: '20',
    }));
    wantedCards = [helper];
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    const parsed = MTG.parseCost(entry.raw.cost || '');
    if (parsed.generic > 0) {
      a.pool.C = parsed.generic - 1;
      for (const pip of parsed.pips) {
        const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol)) || 'C';
        a.pool[color] = (a.pool[color] || 0) + 1;
      }
    } else {
      parsed.pips.slice(1).forEach(pip => {
        const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol)) || 'C';
        a.pool[color] = (a.pool[color] || 0) + 1;
      });
    }
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', xVal: 0 }), true, `${name}: Convoke pays a real mana cost`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject?.convokedCards?.length, `${name}: cast records a real Convoke payment`);
    assert.ok(stackObject.convokedCards.every(card => card.tapped), `${name}: every Convoke payment creature is tapped`);
    await resolveAll(game);
    return 1;
  }

  if (operation.kind === 'mechanic-storm') {
    fillLibrary(MTG, a, 30);
    for (let index = 0; index < 2; index++) {
      const prior = new MTG.CardInst(fixtureDefinition(`Oracle Prior Spell ${index}`, ['Instant'], { cost: '{0}' }), a);
      prior.zone = 'hand';
      a.hand.push(prior);
      assert.equal(await game.castSpell(a, prior, { from: 'hand', alt: { free: true } }), true);
      await resolveAll(game);
    }
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true, `${name}: Storm spell casts`);
    assert.deepEqual(Array.from(game.stack, candidate => candidate.kind), ['spell', 'trigger'],
      `${name}: Storm is a separately respondable cast trigger`);
    await game.resolveTop();
    assert.equal(game.stack.filter(candidate => candidate.card === source).length, 3,
      `${name}: trigger resolution creates two copies plus the original`);
    await resolveAll(game);
    return 1;
  }

  if (operation.kind === 'mechanic-cascade') {
    a.library.splice(0);
    fillLibrary(MTG, a, 4);
    const lifeBefore = a.life;
    const lowerDef = fixtureDefinition('Oracle Cascade Hit', ['Instant'], {
      cost: '{0}', resolve: async ctx => { await ctx.g.gainLife(ctx.you, 1, ctx.src); },
    });
    const lower = new MTG.CardInst(lowerDef, a);
    lower.zone = 'library';
    a.library.push(lower);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    assert.equal(await game.castSpell(a, source, { from: 'hand', alt: { free: true } }), true, `${name}: Cascade source casts`);
    await resolveAll(game);
    assert.equal(lower.zone, 'graveyard', `${name}: Cascade hit is cast and resolves`);
    assert.ok(a.life >= lifeBefore + 1, `${name}: cascaded spell executes its resolver`);
    assert.ok(a.turnState.spellsCastList.some(cast => cast.card === lower), `${name}: Cascade hit is recorded as a cast`);
    return 1;
  }

  if (operation.kind === 'mechanic-devoid' || operation.kind === 'mechanic-uncounterable' || operation.kind === 'mechanic-rebound') {
    fillLibrary(MTG, a, 30);
    await stageSpellTarget(targetOperation);
    const source = zoneCard(MTG, a, name, 'hand');
    if (operation.kind === 'mechanic-devoid') assert.deepEqual(Array.from(source.colors), [], `${name}: Devoid is colorless in hand`);
    if (operation.kind === 'mechanic-rebound') fund(a);
    const castOptions = operation.kind === 'mechanic-rebound'
      ? { from: 'hand' } : { from: 'hand', alt: { free: true } };
    assert.equal(await game.castSpell(a, source, castOptions), true, `${name}: modifier uses a real cast`);
    const stackObject = game.stack.find(candidate => candidate.card === source);
    assert.ok(stackObject, `${name}: modifier source reaches Stack`);
    if (operation.kind === 'mechanic-devoid') assert.deepEqual(Array.from(source.colors), [], `${name}: Devoid is colorless on Stack`);
    if (operation.kind === 'mechanic-uncounterable') {
      assert.equal(await game.counterStackObject(stackObject), false, `${name}: counter attempt is rejected`);
      assert.ok(game.stack.includes(stackObject), `${name}: uncounterable spell remains on Stack`);
    }
    await resolveAll(game);
    if (operation.kind === 'mechanic-rebound') {
      assert.equal(source.zone, 'exile', `${name}: hand-cast Rebound spell is exiled`);
      assert.ok(game.delayed.some(effect => /Rebound/.test(effect.name)), `${name}: Rebound schedules the next-upkeep cast`);
    }
    return 1;
  }

  if (!operation.kind.startsWith('spell-')) {
    fillLibrary(MTG, a, Math.max(12, (Number(operation.n) || 0) + 2));
    let attachmentHost = null;
    let attachmentBasePower = 0;
    let attachmentBaseToughness = 0;
    const auraOperation = operations.find(candidate => candidate.kind === 'aura-target');
    if (auraOperation) {
      attachmentHost = targetPermanent(MTG, game, a, auraOperation.what);
      wantedTargets = [attachmentHost];
    } else if (operations.some(candidate => candidate.kind === 'attachment-grant' || candidate.kind === 'equipment-equip')) {
      attachmentHost = targetPermanent(MTG, game, a, 'creature');
    }
    if (attachmentHost) {
      attachmentBasePower = attachmentHost.power;
      attachmentBaseToughness = attachmentHost.toughness;
    }
    let lootFodder = null;
    if (operation.kind === 'etb-loot') {
      lootFodder = zoneCard(MTG, a, 'Forest', 'hand');
      wantedCards = [lootFodder];
    }
    if (operation.kind === 'etb-each-opponent-discard') {
      zoneCard(MTG, b, 'Forest', 'hand');
      zoneCard(MTG, b, 'Forest', 'hand');
    }
    const lifeBefore = a.life;
    const libraryBefore = a.library.length;
    const handBBefore = b.hand.length;
    const tokenBefore = game.battlefield.filter(card => card.isToken && card.ctrl === a).length;
    const source = await enterPermanentProof(MTG, context, entry);

    if (operation.kind === 'enters-tapped') {
      assert.equal(source.tapped, true, `${name}: enters-tapped replacement`);
      return 1;
    }
    if (operation.kind === 'etb-life-gain') {
      assert.equal(a.life, lifeBefore + operation.n, `${name}: exact ETB life gain`);
      return 1;
    }
    if (operation.kind === 'etb-draw') {
      assert.equal(a.library.length, libraryBefore - operation.n, `${name}: exact ETB draw`);
      return 1;
    }
    if (operation.kind === 'etb-scry' || operation.kind === 'etb-surveil') {
      assert.ok(selectionQuery, `${name}: library selection decision executed`);
      assert.equal(selectionQuery.cards.length, operation.n, `${name}: exact ${operation.kind} count`);
      assert.equal(!!selectionQuery.surveil, operation.kind === 'etb-surveil', `${name}: scry/surveil mode`);
      if (operation.kind === 'etb-surveil') assert.equal(selectedLibraryCard.zone, 'graveyard', `${name}: surveil selection moves to graveyard`);
      else {
        assert.equal(selectedLibraryCard.zone, 'library', `${name}: scry selection remains in library`);
        assert.equal(a.library[0], selectedLibraryCard, `${name}: scry selection moves to bottom`);
      }
      return 1;
    }
    if (operation.kind === 'etb-token') {
      const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
      assert.equal(made.length, operation.n, `${name}: exact token count`);
      for (const token of made) {
        assert.equal(token.name, operation.token.name, `${name}: token name`);
        assert.equal(token.power, Number(operation.token.power), `${name}: token power`);
        assert.equal(token.toughness, Number(operation.token.toughness), `${name}: token toughness`);
        for (const type of operation.token.types || ['Creature']) assert.equal(token.is(type), true, `${name}: token type ${type}`);
        for (const subtype of operation.token.subtypes || []) assert.equal(token.hasSub(subtype), true, `${name}: token subtype ${subtype}`);
        for (const keyword of operation.token.keywords || []) assert.equal(token.kw(keyword), true, `${name}: token keyword ${keyword}`);
      }
      return 1;
    }
    if (operation.kind === 'etb-loot') {
      assert.equal(a.library.length, libraryBefore - 1, `${name}: ETB loot draws exactly one`);
      assert.equal(lootFodder.zone, 'graveyard', `${name}: ETB loot executes the discard decision`);
      return 1;
    }
    if (operation.kind === 'etb-treasure') {
      const treasures = game.battlefield.filter(card => card.isToken && card.ctrl === a && card.name === 'Treasure');
      assert.equal(treasures.length, operation.n, `${name}: exact Treasure count`);
      assert.ok(treasures.every(card => card.is('Artifact')), `${name}: Treasure tokens are artifacts`);
      return 1;
    }
    if (operation.kind === 'etb-each-opponent-discard') {
      assert.equal(b.hand.length, handBBefore - operation.n, `${name}: opponent discards exact amount`);
      assert.equal(b.graveyard.length, operation.n, `${name}: discarded card reaches graveyard`);
      return 1;
    }
    if (operation.kind === 'dies-draw') {
      const beforeDeath = a.library.length;
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'graveyard', `${name}: dies event source`);
      assert.equal(a.library.length, beforeDeath - operation.n, `${name}: exact dies draw`);
      return 1;
    }
    if (operation.kind === 'dies-life-gain') {
      const beforeDeath = a.life;
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'graveyard', `${name}: dies source changes zone`);
      assert.equal(a.life, beforeDeath + operation.n, `${name}: exact dies life gain`);
      return 1;
    }
    if (operation.kind === 'noncreature-cast-counter-self') {
      const before = source.counters[operation.counter] || 0;
      const spell = new MTG.CardInst(fixtureDefinition('Oracle Noncreature Cast', ['Instant'], { cost: '{0}' }), a);
      spell.zone = 'hand';
      a.hand.push(spell);
      assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
      await resolveAll(game);
      assert.equal(source.counters[operation.counter], before + operation.n, `${name}: noncreature cast adds exact counter`);
      return 1;
    }
    if (operation.kind === 'attack-self-pump') {
      const powerBefore = source.power;
      const toughnessBefore = source.toughness;
      source.attacking = b;
      await game.emit('attacks', { card: source, player: a, defender: b });
      await resolveAll(game);
      assert.equal(source.power, powerBefore + operation.power, `${name}: attack trigger power`);
      assert.equal(source.toughness, toughnessBefore + operation.toughness, `${name}: attack trigger toughness`);
      return 1;
    }
    if (operation.kind === 'combat-damage-draw') {
      const before = a.library.length;
      await game.emit('combatDamageToPlayer', { card: source, player: b, n: 1, step: 'normal' });
      await resolveAll(game);
      assert.equal(a.library.length, before - operation.n, `${name}: combat-damage trigger draws exact amount`);
      return 1;
    }
    if (operation.kind === 'cant-block') {
      const attacker = permanent(MTG, game, b, 'Elite Vanguard');
      game.recalc();
      assert.equal(source.cur.cantBlock, true, `${name}: static cant-block marker`);
      assert.equal(game.canBlock(source, attacker), false, `${name}: blocker legality`);
      return 1;
    }
    if (operation.kind === 'must-attack') {
      source.sick = false;
      const before = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < before, `${name}: omitted declaration is auto-forced into combat`);
      return 1;
    }
    if (operation.kind === 'mana-source') {
      source.tapped = false;
      source.sick = false;
      game.recalc();
      const sources = game.manaSources(a).filter(descriptor => descriptor.card === source);
      const wanted = JSON.stringify(operation.produce);
      const descriptor = sources.find(candidate => JSON.stringify(candidate.produce) === wanted);
      assert.ok(descriptor, `${name}: compiled mana source is discoverable`);
      const chosen = descriptor.produce[0];
      const expected = chosen.ANY ? Number(chosen.n || 1)
        : Object.entries(chosen).filter(([key]) => key !== 'n')
          .reduce((sum, [, value]) => sum + Number(value || 0), 0);
      if (operation.activationMana) {
        for (const color of Object.keys(a.pool)) a.pool[color] = 0;
        const activation = MTG.parseCost(operation.activationMana);
        a.pool.C = activation.generic;
        for (const pip of activation.pips) {
          const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G', 'C'].includes(symbol)) || 'C';
          a.pool[color] = (a.pool[color] || 0) + 1;
        }
        let paymentCost = '';
        if (chosen.ANY) paymentCost = '{W}'.repeat(Number(chosen.n || 1));
        else for (const [color, amount] of Object.entries(chosen)) {
          if (color === 'n') continue;
          paymentCost += color === 'C' ? `{${amount}}` : `{${color}}`.repeat(Number(amount || 0));
        }
        const paymentCard = new MTG.CardInst(fixtureDefinition('Oracle Mana Payment', ['Instant'], { cost: paymentCost }), a);
        assert.equal(await game.payMana(a, MTG.parseCost(paymentCost), { card: paymentCard }), true,
          `${name}: paid mana source finances a real cost`);
        assert.equal(source.tapped, true, `${name}: paid mana source taps`);
        assert.equal(poolTotal(a), 0, `${name}: activation input and produced mana are fully spent`);
        return 1;
      }
      const before = poolTotal(a);
      assert.equal(await game.activateManaSource(a, descriptor, chosen, null, []), true, `${name}: mana ability activates`);
      assert.equal(poolTotal(a), before + expected, `${name}: exact mana production`);
      assert.equal(source.tapped, true, `${name}: tap cost paid`);
      return 1;
    }
    if (operation.kind === 'attachment-grant') {
      assert.ok(attachmentHost, `${name}: attachment host staged`);
      if (source.attachedTo !== attachmentHost.iid) {
        assert.equal(await game.attach(source, attachmentHost), true, `${name}: attaches through Game.attach`);
      }
      game.recalc();
      assert.equal(attachmentHost.power, attachmentBasePower + (operation.power || 0), `${name}: attached power grant`);
      assert.equal(attachmentHost.toughness, attachmentBaseToughness + (operation.toughness || 0), `${name}: attached toughness grant`);
      for (const keyword of operation.keywords || []) assert.equal(attachmentHost.kw(keyword), true, `${name}: attached grant ${keyword}`);
      if (operation.cantAttack) assert.equal(attachmentHost.cur.cantAttack, true, `${name}: attached cant-attack restriction`);
      if (operation.cantBlock) assert.equal(attachmentHost.cur.cantBlock, true, `${name}: attached cant-block restriction`);
      if (operation.skipUntap) assert.equal(attachmentHost.cur.cantUntap, true, `${name}: attached skip-untap restriction`);
      return 1;
    }
    if (operation.kind === 'aura-target') {
      assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Aura resolves attached to its chosen legal host`);
      assert.ok(attachmentHost.attachments.includes(source.iid), `${name}: host tracks Aura attachment`);
      return 1;
    }
    if (operation.kind === 'aura-etb-tap') {
      assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Aura is attached before its ETB trigger resolves`);
      assert.equal(attachmentHost.tapped, true, `${name}: Aura ETB taps the enchanted permanent`);
      return 1;
    }
    if (operation.kind === 'equipment-equip') {
      fund(a);
      wantedTargets = [attachmentHost];
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.equip);
      assert.ok(action, `${name}: Equip action is offered`);
      assert.equal(await game.activateAbility(a, action), true, `${name}: Equip activates`);
      assert.equal(game.stack.at(-1)?.kind, 'ability', `${name}: Equip uses the Stack`);
      await resolveAll(game);
      assert.equal(source.attachedTo, attachmentHost.iid, `${name}: Equip attaches on resolution`);
      return 1;
    }
    if (operation.kind === 'crew') {
      const helper = permanent(MTG, game, a, fixtureDefinition('Oracle Crew Helper', ['Creature'], {
        power: String(Math.max(1, operation.n)), toughness: '20',
      }));
      wantedCards = [helper];
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.crew);
      assert.ok(action, `${name}: Crew action is offered`);
      assert.equal(await game.activateAbility(a, action), true, `${name}: Crew activates`);
      assert.equal(game.stack.at(-1)?.kind, 'ability', `${name}: Crew uses the Stack`);
      await resolveAll(game);
      assert.equal(helper.tapped, true, `${name}: Crew taps the selected creature`);
      assert.equal(source.is('Creature'), true, `${name}: Crew turns Vehicle into a creature`);
      return 1;
    }
    if (operation.kind === 'self-pump-ability' || operation.kind === 'self-regenerate-ability' || operation.kind === 'self-keyword-ability') {
      fund(a);
      const ability = (source.def.abilities || []).find(candidate => {
        if (candidate.cost?.mana !== operation.cost) return false;
        if (operation.kind === 'self-regenerate-ability') return candidate.label === 'Regenerate';
        if (operation.kind === 'self-keyword-ability') return candidate.label === `Gain ${operation.keyword}`;
        return candidate.label === `${operation.power >= 0 ? '+' : ''}${operation.power}/${operation.toughness >= 0 ? '+' : ''}${operation.toughness}`;
      });
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.ability === ability);
      assert.ok(action, `${name}: matching activated ability is offered`);
      const powerBefore = source.power;
      const toughnessBefore = source.toughness;
      const shieldBefore = source.regenShield;
      assert.equal(await game.activateAbility(a, action), true, `${name}: activated ability uses the real activation path`);
      await resolveAll(game);
      if (operation.kind === 'self-pump-ability') {
        assert.equal(source.power, powerBefore + operation.power, `${name}: self-pump power`);
        assert.equal(source.toughness, toughnessBefore + operation.toughness, `${name}: self-pump toughness`);
      } else if (operation.kind === 'self-regenerate-ability') {
        assert.equal(source.regenShield, shieldBefore + 1, `${name}: regeneration shield created`);
      } else assert.equal(source.kw(operation.keyword), true, `${name}: gains ${operation.keyword}`);
      return 1;
    }
    if (operation.kind === 'controlled-creature-pump-static' || operation.kind === 'attacking-creature-pump-static') {
      const own = permanent(MTG, game, a, fixtureDefinition('Oracle Static Own', ['Creature'], { power: '20', toughness: '20' }));
      const hostile = permanent(MTG, game, b, fixtureDefinition('Oracle Static Hostile', ['Creature'], { power: '20', toughness: '20' }));
      if (operation.kind === 'attacking-creature-pump-static') {
        own.attacking = b;
        hostile.attacking = a;
      }
      game.recalc();
      assert.equal(own.power, 20 + operation.power, `${name}: own affected creature power`);
      assert.equal(own.toughness, 20 + operation.toughness, `${name}: own affected creature toughness`);
      assert.equal(hostile.power, 20, `${name}: opponent creature is excluded`);
      assert.equal(hostile.toughness, 20, `${name}: opponent creature toughness is excluded`);
      return 1;
    }
    if (operation.kind === 'global-creature-keyword-static') {
      const own = targetPermanent(MTG, game, a, 'creature');
      const hostile = targetPermanent(MTG, game, b, 'creature');
      game.recalc();
      assert.equal(own.kw(operation.keyword), true, `${name}: own creature gains ${operation.keyword}`);
      assert.equal(hostile.kw(operation.keyword), true, `${name}: opponent creature gains ${operation.keyword}`);
      return 1;
    }
    if (operation.kind === 'unblockable') {
      const blocker = targetPermanent(MTG, game, b, 'creature');
      assert.equal(game.canBlock(blocker, source), false, `${name}: unblockable changes combat legality`);
      return 1;
    }
    if (operation.kind === 'flying-blocker-only') {
      const ground = targetPermanent(MTG, game, b, 'creature');
      const flier = permanent(MTG, game, b, fixtureDefinition('Oracle Flying Attacker', ['Creature'], {
        kws: ['flying'], power: '2', toughness: '2',
      }));
      game.recalc();
      assert.equal(game.canBlock(source, ground), false, `${name}: cannot block a ground attacker`);
      assert.equal(game.canBlock(source, flier), true, `${name}: can block a flying attacker`);
      return 1;
    }
    if (operation.kind === 'protection-from') {
      const colors = { white: ['W'], blue: ['U'], black: ['B'], red: ['R'], green: ['G'] };
      const hostile = permanent(MTG, game, b, fixtureDefinition('Oracle Protected Source',
        operation.from === 'artifacts' ? ['Artifact', 'Creature'] : ['Creature'], {
          colorsOverride: colors[operation.from] || [], power: '3', toughness: '3',
        }));
      game.recalc();
      assert.equal(game.isProtectedFrom(source, hostile), true, `${name}: protection recognizes matching source quality`);
      const beforeDamage = source.damage;
      assert.equal(await game.damageCreature(hostile, source, 3), 0, `${name}: protection prevents damage`);
      assert.equal(source.damage, beforeDamage, `${name}: protected creature has no marked damage`);
      return 1;
    }
    if (operation.kind === 'mechanic-persist' || operation.kind === 'mechanic-undying') {
      await game.destroy(source);
      await resolveAll(game);
      assert.equal(source.zone, 'battlefield', `${name}: death mechanic returns the card`);
      const counter = operation.kind === 'mechanic-persist' ? '-1/-1' : '+1/+1';
      assert.equal(source.counters[counter], 1, `${name}: death mechanic adds ${counter}`);
      return 1;
    }
    if (operation.kind === 'mechanic-changeling') {
      assert.equal(source.hasSub('Elf'), true, `${name}: Changeling supplies Elf subtype`);
      assert.equal(source.hasSub('Goblin'), true, `${name}: Changeling supplies Goblin subtype`);
      assert.equal(source.hasSub('Equipment'), false, `${name}: Changeling excludes noncreature subtypes`);
      return 1;
    }
    assert.fail(`${name}: no executable operation proof for ${operation.kind}`);
  }

  fillLibrary(MTG, a, 30);
  fillLibrary(MTG, b, Math.max(30, (Number(operation.n) || 0) + 2));
  const staged = await stageSpellTarget(targetOperation);
  let { effectTarget, counterTarget } = staged;
  let secondaryTarget = null;
  let spellFodder = [];
  if (operation.kind === 'spell-team-pump') {
    effectTarget = targetPermanent(MTG, game, a, 'creature');
    secondaryTarget = targetPermanent(MTG, game, b, 'creature');
    if (operation.attackingOnly) {
      effectTarget.attacking = b;
      secondaryTarget.attacking = a;
      game.recalc();
    }
  } else if (operation.kind === 'spell-global-pump') {
    effectTarget = permanent(MTG, game, a, fixtureDefinition('Oracle Global Own', ['Creature'], { power: '20000', toughness: '20000' }));
    secondaryTarget = permanent(MTG, game, b, fixtureDefinition('Oracle Global Opponent', ['Creature'], { power: '20000', toughness: '20000' }));
  } else if (operation.kind === 'spell-discard') {
    for (let index = 0; index < operation.n + 2; index++) zoneCard(MTG, b, 'Forest', 'hand');
  } else if (operation.kind === 'spell-draw-discard') {
    spellFodder = Array.from({ length: operation.discard }, () => zoneCard(MTG, a, 'Forest', 'hand'));
    wantedCards = spellFodder;
  } else if (operation.kind === 'spell-token') {
    // Token baseline is captured below.
  } else if (operation.kind === 'spell-token-roll-threshold') {
    // Force a roll of 1 so the closed threshold branch is exercised too.
    game.rnd = () => 0;
  } else if (operation.kind === 'spell-counter-on-creature') {
    // Target was staged above.
  } else if (operation.kind === 'spell-destroy-all') {
    const singular = operation.what.slice(0, -1);
    const what = singular === 'creature' ? 'creature' : singular === 'artifact' ? 'artifact' : 'enchantment';
    effectTarget = targetPermanent(MTG, game, a, what);
    secondaryTarget = targetPermanent(MTG, game, b, what);
    if (operation.noRegen) {
      effectTarget.regenShield = 1;
      secondaryTarget.regenShield = 1;
    }
  }
  const lifeA = a.life;
  const lifeB = b.life;
  const libraryA = a.library.length;
  const libraryB = b.library.length;
  const handB = b.hand.length;
  const powerBefore = effectTarget && effectTarget.power;
  const toughnessBefore = effectTarget && effectTarget.toughness;
  const secondaryPowerBefore = secondaryTarget && secondaryTarget.power;
  const secondaryToughnessBefore = secondaryTarget && secondaryTarget.toughness;
  const tokenBefore = game.battlefield.filter(card => card.isToken && card.ctrl === a).length;
  const poolBefore = poolTotal(a);
  const spell = zoneCard(MTG, a, name, 'hand');
  const usesX = operation.n === 'X' || operation.power === 'X';
  const castOptions = usesX ? { from: 'hand', xVal: 3 } : { from: 'hand', alt: { free: true } };
  if (usesX) fund(a);
  assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: spell-template casts through real target/Stack path`);
  assert.equal(spell.zone, 'stack', `${name}: spell card is on Stack`);
  await resolveAll(game);
  const rebounds = operations.some(candidate => candidate.kind === 'mechanic-rebound');
  assert.equal(spell.zone, rebounds ? 'exile' : 'graveyard',
    `${name}: instant/sorcery reaches its rules-correct post-resolution zone`);
  if (rebounds) {
    assert.ok(game.delayed.some(effect => /Rebound/.test(effect.name)),
      `${name}: hand-cast Rebound spell schedules its next-upkeep cast`);
  }

  const totalSpellDraw = operations.reduce((sum, candidate) => sum +
    (candidate.kind === 'spell-draw' ? candidate.n : candidate.kind === 'spell-draw-discard' ? candidate.draw : 0), 0);
  const selectedSurveilCards = operations.filter(candidate => candidate.kind === 'spell-surveil').length;
  if (operation.kind === 'spell-draw') {
    assert.equal(a.library.length, libraryA - totalSpellDraw - selectedSurveilCards, `${name}: exact composite spell draw`);
  }
  else if (operation.kind === 'spell-draw-discard') {
    assert.equal(a.library.length, libraryA - totalSpellDraw - selectedSurveilCards, `${name}: exact draw-discard draw count`);
    assert.ok(spellFodder.every(card => card.zone === 'graveyard'), `${name}: exact discard choices move to graveyard`);
  }
  else if (operation.kind === 'spell-counter') assert.equal(counterTarget.card.zone, 'graveyard', `${name}: targeted spell is countered`);
  else if (operation.kind === 'spell-destroy') {
    assert.equal(effectTarget.zone, 'graveyard', operation.noRegen
      ? `${name}: target with a regeneration shield is still destroyed`
      : `${name}: target destroyed`);
  }
  else if (operation.kind === 'spell-exile') assert.equal(effectTarget.zone, 'exile', `${name}: target exiled`);
  else if (operation.kind === 'spell-bounce') assert.equal(effectTarget.zone, 'hand', `${name}: target returned to hand`);
  else if (operation.kind === 'spell-life-gain') assert.equal(a.life, lifeA + operation.n, `${name}: exact spell life gain`);
  else if (operation.kind === 'spell-discard') assert.equal(b.hand.length, handB - operation.n, `${name}: exact discard`);
  else if (operation.kind === 'spell-mill') assert.equal(b.library.length, libraryB - operation.n, `${name}: exact mill`);
  else if (operation.kind === 'spell-pump' || operation.kind === 'spell-team-pump') {
    const power = operation.power === 'X' ? 3 : operation.power;
    assert.equal(effectTarget.power, powerBefore + power, `${name}: exact power modifier`);
    assert.equal(effectTarget.toughness, toughnessBefore + operation.toughness, `${name}: exact toughness modifier`);
    for (const keyword of operation.keywords || []) assert.equal(effectTarget.kw(keyword), true, `${name}: grants ${keyword}`);
    if (operation.kind === 'spell-team-pump' && operation.attackingOnly && operation.controller === 'any') {
      assert.equal(secondaryTarget.power, secondaryPowerBefore + power, `${name}: affects an attacking opponent creature`);
      assert.equal(secondaryTarget.toughness, secondaryToughnessBefore + operation.toughness, `${name}: opponent toughness modifier`);
    }
  } else if (operation.kind === 'spell-damage') {
    const amount = operation.n === 'X' ? 3 : operation.n;
    if (operation.what === 'target creature' || operation.what === 'target creature or planeswalker') {
      assert.equal(effectTarget.damage, amount, `${name}: exact creature damage`);
    } else assert.equal(b.life, lifeB - amount, `${name}: exact player/opponent damage`);
  } else if (operation.kind === 'spell-global-pump') {
    assert.equal(effectTarget.power, powerBefore + operation.power, `${name}: global effect reaches own creature`);
    assert.equal(effectTarget.toughness, toughnessBefore + operation.toughness, `${name}: own toughness`);
    assert.equal(secondaryTarget.power, secondaryPowerBefore + operation.power, `${name}: global effect reaches opponent creature`);
    assert.equal(secondaryTarget.toughness, secondaryToughnessBefore + operation.toughness, `${name}: opponent toughness`);
  } else if (operation.kind === 'spell-graveyard-return') {
    assert.equal(effectTarget.zone, 'hand', `${name}: chosen graveyard card returns to hand`);
  } else if (operation.kind === 'spell-token') {
    const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
    assert.equal(made.length, operation.n, `${name}: exact spell token count`);
    if (operation.token) {
      assert.ok(made.every(card => card.name === operation.token.name), `${name}: exact spell token definition`);
      assert.ok(made.every(card => card.power === Number(operation.token.power) && card.toughness === Number(operation.token.toughness)),
        `${name}: exact spell token stats`);
    }
  } else if (operation.kind === 'spell-token-roll-threshold') {
    const made = game.battlefield.filter(card => card.isToken && card.ctrl === a).slice(tokenBefore);
    assert.equal(made.length, operation.n + operation.bonusN,
      `${name}: forced threshold success creates base and bonus tokens`);
    assert.ok(made.every(card => card.name === operation.token.name), `${name}: exact roll-threshold token definition`);
    assert.ok(made.every(card => card.hasSub(operation.compareSubtype)),
      `${name}: created tokens carry the counted threshold subtype`);
    assert.ok(made.every(card => card.power === Number(operation.token.power) && card.toughness === Number(operation.token.toughness)),
      `${name}: exact roll-threshold token stats`);
  } else if (operation.kind === 'spell-counter-on-creature') {
    assert.equal(effectTarget.counters[operation.counter], operation.n, `${name}: exact creature counter count`);
  } else if (operation.kind === 'spell-fog') {
    const attacker = targetPermanent(MTG, game, b, 'creature');
    const before = a.life;
    assert.equal(await game.damagePlayer(attacker, a, 3, { combat: true }), 0, `${name}: combat damage is prevented`);
    assert.equal(a.life, before, `${name}: prevented combat damage changes no life`);
    assert.equal(await game.damagePlayer(attacker, a, 2, { combat: false }), 2, `${name}: noncombat damage is not prevented`);
  } else if (operation.kind === 'spell-tap' || operation.kind === 'spell-untap') {
    for (const target of wantedTargets) {
      assert.equal(target.tapped, operation.kind === 'spell-tap', `${name}: ${operation.kind} changes selected target state`);
    }
    assert.equal(wantedTargets.length, operation.count, `${name}: exact target count was selected`);
  } else if (operation.kind === 'spell-scry' || operation.kind === 'spell-surveil') {
    assert.ok(selectionQuery, `${name}: spell library-selection decision executes`);
    assert.equal(selectionQuery.cards.length, operation.n, `${name}: exact library-selection count`);
    assert.equal(!!selectionQuery.surveil, operation.kind === 'spell-surveil', `${name}: exact scry/surveil mode`);
    assert.equal(selectedLibraryCard.zone, operation.kind === 'spell-surveil' ? 'graveyard' : 'library', `${name}: selected card destination`);
  } else if (operation.kind === 'spell-add-mana') {
    const expected = operation.produce.ANY ? Number(operation.produce.n || 1)
      : Object.values(operation.produce).reduce((sum, value) => sum + Number(value || 0), 0);
    assert.equal(poolTotal(a), poolBefore + expected, `${name}: exact mana added`);
  } else if (operation.kind === 'spell-destroy-all') {
    assert.equal(effectTarget.zone, 'graveyard', `${name}: board wipe reaches own matching permanent`);
    assert.equal(secondaryTarget.zone, 'graveyard', `${name}: board wipe reaches opposing matching permanent`);
  } else assert.fail(`${name}: no post-resolution proof for ${operation.kind}`);
  return 1;
}

async function keywordProof(MTG, entry, rawKeyword) {
  const keyword = mechanic(rawKeyword);
  let attacker;
  let blocker;
  const attackController = decision({
    attackers: (game) => [{ card: attacker, target: game.players[1] }],
  });
  const blockController = decision({
    blockers: () => blocker ? [{ blocker, attacker }] : [],
  });
  const { game, a, b } = gameFor(MTG, [attackController, blockController]);
  const source = permanent(MTG, game, a, entry.raw.name);
  if (source.hasSub('Vehicle') && source.def.crew !== undefined && !source.is('Creature')) {
    permanent(MTG, game, a, fixtureDefinition('Oracle Keyword Crew Helper', ['Creature'], {
      power: String(Math.max(1, source.def.crew)), toughness: '20',
    }));
    const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.crew);
    assert.ok(action, `${source.name}: Vehicle keyword proof offers Crew`);
    assert.equal(await game.activateAbility(a, action), true, `${source.name}: Vehicle keyword proof crews source`);
    await resolveAll(game);
    assert.equal(source.is('Creature'), true, `${source.name}: Crew makes keyword-bearing Vehicle a creature`);
  }

  switch (keyword) {
    case 'flying': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: flying evasion`);
      break;
    }
    case 'reach': {
      const flyer = permanent(MTG, game, b, 'A.I.M. Bot');
      assert.equal(game.canBlock(source, flyer), true, `${source.name}: reach blocks flying`);
      break;
    }
    case 'forestwalk':
    case 'plainswalk':
    case 'islandwalk':
    case 'swampwalk':
    case 'mountainwalk': {
      const land = keyword.replace('walk', '');
      const basic = land.charAt(0).toUpperCase() + land.slice(1);
      permanent(MTG, game, b, basic);
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.canBlock(ground, source), false, `${source.name}: ${keyword} evasion`);
      break;
    }
    case 'fear': {
      const ground = permanent(MTG, game, b, 'Elite Vanguard');
      const black = permanent(MTG, game, b, fixtureDefinition('Oracle Black Blocker', ['Creature'], { colorsOverride: ['B'], power: '2', toughness: '2' }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Artifact Creature', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonblack nonartifact cannot block fear`);
      assert.equal(game.canBlock(black, source), true, `${source.name}: black creature blocks fear`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks fear`);
      break;
    }
    case 'intimidate': {
      const otherColor = ['W', 'U', 'B', 'R', 'G'].find(color => !source.colors.includes(color)) || 'W';
      const ground = permanent(MTG, game, b, fixtureDefinition('Oracle Nonshared Color Blocker', ['Creature'], {
        colorsOverride: [otherColor], power: '2', toughness: '2',
      }));
      const artifact = permanent(MTG, game, b, fixtureDefinition('Oracle Intimidate Artifact', ['Artifact', 'Creature'], { power: '2', toughness: '2' }));
      assert.equal(game.canBlock(ground, source), false, `${source.name}: nonartifact without shared color cannot block intimidate`);
      assert.equal(game.canBlock(artifact, source), true, `${source.name}: artifact creature blocks intimidate`);
      if (source.colors.length) {
        const shared = permanent(MTG, game, b, fixtureDefinition('Oracle Shared Color Blocker', ['Creature'], {
          colorsOverride: [source.colors[0]], power: '2', toughness: '2',
        }));
        assert.equal(game.canBlock(shared, source), true, `${source.name}: shared-color creature blocks intimidate`);
      }
      break;
    }
    case 'skulk': {
      const stronger = permanent(MTG, game, b, fixtureDefinition('Oracle Stronger Blocker', ['Creature'], {
        power: String(source.power + 1), toughness: '20',
      }));
      const equal = permanent(MTG, game, b, fixtureDefinition('Oracle Equal Blocker', ['Creature'], {
        power: String(source.power), toughness: '20',
      }));
      assert.equal(game.canBlock(stronger, source), false, `${source.name}: greater-power creature cannot block skulk`);
      assert.equal(game.canBlock(equal, source), true, `${source.name}: equal-power creature can block skulk`);
      break;
    }
    case 'shadow': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const shadow = permanent(MTG, game, b, fixtureDefinition('Oracle Shadow Blocker', ['Creature'], {
        kws: ['shadow'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: non-shadow creature cannot block shadow`);
      assert.equal(game.canBlock(shadow, source), true, `${source.name}: shadow creature blocks shadow`);
      break;
    }
    case 'horsemanship': {
      const normal = permanent(MTG, game, b, 'Elite Vanguard');
      const mounted = permanent(MTG, game, b, fixtureDefinition('Oracle Horsemanship Blocker', ['Creature'], {
        kws: ['horsemanship'], power: '2', toughness: '2',
      }));
      assert.equal(game.canBlock(normal, source), false, `${source.name}: creature without horsemanship cannot block`);
      assert.equal(game.canBlock(mounted, source), true, `${source.name}: horsemanship creature can block`);
      break;
    }
    case 'menace': {
      attacker = source;
      blocker = permanent(MTG, game, b, 'Arachnoid');
      if (source.power < 1) game.addCounters(source, '+1/+1', 2, false, a);
      const life = b.life;
      await game.combatPhase(a);
      assert.ok(b.life < life, `${source.name}: a single blocker is rejected by menace`);
      break;
    }
    case 'first strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, a);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first-strike damage`);
      source.meta._dealtFirstStrike = true;
      if (!source.kw('double strike')) assert.equal(game.dmgAmount(source, 'normal'), 0, `${source.name}: no normal damage`);
      break;
    }
    case 'double strike': {
      if (source.power < 1) game.addCounters(source, '+1/+1', 1 - source.power, false, a);
      assert.ok(game.dmgAmount(source, 'first') > 0, `${source.name}: first damage step`);
      source.meta._dealtFirstStrike = true;
      assert.ok(game.dmgAmount(source, 'normal') > 0, `${source.name}: normal damage step`);
      break;
    }
    case 'deathtouch': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.zone, 'graveyard', `${source.name}: one damage is lethal`);
      break;
    }
    case 'lifelink': {
      const life = a.life;
      await game.damagePlayer(source, b, 1);
      assert.equal(a.life, life + 1, `${source.name}: controller gains dealt damage`);
      break;
    }
    case 'trample': {
      const victim = permanent(MTG, game, b, 'Elite Vanguard');
      game.addCounters(source, '+1/+1', 5, false, a);
      source.attacking = b;
      source.blockedBy = [victim];
      source.wasBlocked = true;
      victim.blocking = source.iid;
      game.combat = { attackers: [source], defenders: new Map() };
      const life = b.life;
      await game.combatDamage(a, 'normal');
      assert.ok(b.life < life, `${source.name}: excess combat damage tramples over`);
      break;
    }
    case 'wither': {
      const victim = permanent(MTG, game, b, 'Aegis Turtle');
      await game.damageCreature(source, victim, 1);
      assert.equal(victim.counters['-1/-1'], 1, `${source.name}: creature damage becomes -1/-1 counter`);
      break;
    }
    case 'haste': {
      attacker = source;
      source.sick = true;
      if (source.power < 1) game.addCounters(source, '+1/+1', 2, false, a);
      await game.combatPhase(a);
      assert.equal(a.turnState.attacked, true, `${source.name}: attacks through summoning sickness`);
      break;
    }
    case 'vigilance': {
      attacker = source;
      await game.combatPhase(a);
      assert.equal(source.tapped, false, `${source.name}: does not tap to attack`);
      break;
    }
    case 'defender':
      assert.equal(game.canAttackAtAll(source), false, `${source.name}: defender attack restriction`);
      break;
    case 'indestructible':
      await game.destroy(source);
      assert.equal(source.zone, 'battlefield', `${source.name}: survives destroy`);
      break;
    case 'hexproof': {
      const hostile = permanent(MTG, game, b, 'Elite Vanguard');
      assert.equal(game.legalTargets({ what: 'creature' }, hostile, b).includes(source), false, `${source.name}: opponent cannot target`);
      break;
    }
    case 'shroud':
      assert.equal(game.legalTargets({ what: 'creature' }, source, a).includes(source), false, `${source.name}: no player can target`);
      break;
    case 'ward': {
      const hostileCard = zoneCard(MTG, b, 'Murder', 'exile');
      const spell = { kind: 'spell', name: 'Murder', card: hostileCard, ctrl: b, targets: [source] };
      game.stack.push(spell);
      game.queueWardTriggers(spell, { wardTargets: [{ target: source, ward: source.cur.wardCost }] });
      const ward = game.pendingTriggers.find(trigger => trigger.src === source);
      assert.ok(ward, `${source.name}: targeting creates a Ward trigger`);
      await ward.run({ g: game, src: source, you: a, data: ward.data, targets: [] });
      assert.equal(spell.countered, true, `${source.name}: unpaid Ward counters the spell`);
      break;
    }
    case 'flash': {
      const card = new MTG.CardInst(source.def, a);
      card.zone = 'hand';
      a.hand.push(card);
      game.turnPlayer = b;
      game.phase = 'main1';
      assert.equal(game.canCastTiming(a, card), true, `${source.name}: casts outside sorcery timing`);
      break;
    }
    case 'prowess': {
      const before = source.power;
      const instances = (source.def.triggers || []).filter(trigger => trigger.desc === 'Prowess').length;
      assert.ok(instances > 0, `${source.name}: compiled prowess trigger instances`);
      const spell = zoneCard(MTG, a, 'Murder', 'exile');
      await game.emit('castNonCreature', { player: a, card: spell, mv: 3, so: { card: spell, ctrl: a } });
      await resolveAll(game);
      assert.equal(source.power, before + instances, `${source.name}: noncreature cast resolves every printed prowess instance`);
      break;
    }
    default:
      assert.fail(`${entry.raw.name}: no executable proof for declared keyword ${rawKeyword}`);
  }
  return 1;
}

test('svaki Oracle report je učitan u runtime i nightly minimum je eksplicitno podesiv', (t) => {
  const MTG = loadEngine();
  const reportNames = fs.readdirSync(path.join(root, 'reports', 'oracle-import'))
    .filter(name => /^batch-\d{4}\.json$/.test(name)).sort();
  const reports = reportNames.map(name => JSON.parse(fs.readFileSync(path.join(root, 'reports', 'oracle-import', name), 'utf8')));
  const runtime = new Map(genericBatches(MTG).map(batch => [batch.id, batch]));
  let reportCards = 0;
  for (const report of reports) {
    const batch = report.batch && Array.isArray(report.batch.cards) ? report.batch : report;
    reportCards += batch.cards.length;
    assert.ok(runtime.has(batch.id), `${batch.id}: report exists but runtime batch is not loaded`);
    assert.equal(runtime.get(batch.id).cards.length, batch.cards.length, `${batch.id}: report/runtime card count`);
    const modulePath = path.join(root, 'src', 'oracle-batches', `batch-${String(batch.sequence).padStart(4, '0')}.js`);
    assert.equal(fs.existsSync(modulePath), true, `${batch.id}: generated runtime module exists`);
  }
  const runtimeCards = [...runtime.values()].reduce((sum, batch) => sum + batch.cards.length, 0);
  const baselineCards = [...runtime.values()]
    .filter(batch => Number(batch.sequence) <= 3)
    .reduce((sum, batch) => sum + batch.cards.length, 0);
  const newCards = runtimeCards - baselineCards;
  assert.equal(runtimeCards, reportCards, 'every generic runtime card has exactly one report row');
  const nightlyMinimum = Number(process.env.ORACLE_MIN_CARDS || 0);
  const nightlyNewMinimum = Number(process.env.ORACLE_MIN_NEW_CARDS || 0);
  if (nightlyMinimum) assert.ok(runtimeCards >= nightlyMinimum, `nightly Oracle target ${nightlyMinimum}, found ${runtimeCards}`);
  if (nightlyNewMinimum) assert.ok(newCards >= nightlyNewMinimum, `nightly new-card target ${nightlyNewMinimum}, found ${newCards} above baseline ${baselineCards}`);
  t.diagnostic(`ORACLE_BATCH_COVERAGE batches=${runtime.size} cards=${runtimeCards} baseline=${baselineCards} new=${newCards} totalTarget=${nightlyMinimum || 'not-enforced'} newTarget=${nightlyNewMinimum || 'not-enforced'}`);
});

test('svaka generička Oracle karta i svaki deklarisani keyword imaju izvršni dokaz', async (t) => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG);
  let cardExecutions = 0;
  let keywordExecutions = 0;
  let operationExecutions = 0;
  const keywordCounts = {};
  const operationCounts = {};
  const templateCounts = {};

  for (const { batch, entry } of rows) {
    const audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: entry.raw.name }] }, MTG.DEFS);
    assert.equal(audit.ready, true, `${batch.id}/${entry.raw.name}: ${JSON.stringify(audit.unsupported)}`);
    const cardContract = baseContract(entry);
    assert.ok(cardContract, `${entry.raw.name}: known runtime card type`);
    assert.ok(audit.contracts.some(contract => contract.id === cardContract), `${entry.raw.name}: ${cardContract} contract`);
    const operations = entry.implementation || [];
    if (operations.length) {
      for (const operation of operations) {
        operationExecutions += await operationProof(MTG, entry, operation);
        operationCounts[operation.kind] = (operationCounts[operation.kind] || 0) + 1;
      }
      cardExecutions += 1;
    } else {
      cardExecutions += await cardProof(MTG, entry);
    }
    templateCounts[entry.semanticClass] = (templateCounts[entry.semanticClass] || 0) + 1;
    for (const declared of declaredKeywordOccurrences(MTG, entry)) {
      const key = mechanic(declared);
      const contract = MTG.ORACLE_KEYWORD_CONTRACTS[key];
      assert.ok(contract, `${entry.raw.name}: declared ${declared} has a contract`);
      assert.ok(audit.contracts.some(item => item.id === contract), `${entry.raw.name}: audit exposes ${contract}`);
      keywordExecutions += await keywordProof(MTG, entry, declared);
      keywordCounts[key] = (keywordCounts[key] || 0) + 1;
    }
  }

  const declaredKeywordTotal = rows.reduce((sum, row) => sum + declaredKeywordOccurrences(MTG, row.entry).length, 0);
  const declaredOperationTotal = rows.reduce((sum, row) => sum + (row.entry.implementation || []).length, 0);
  assert.equal(cardExecutions, rows.length, 'one real land-play/cast/resolution proof per Oracle card');
  assert.equal(keywordExecutions, declaredKeywordTotal, 'one executed proof per declared keyword occurrence');
  assert.equal(operationExecutions, declaredOperationTotal, 'one executed proof per compiled operation occurrence');
  t.diagnostic(`ORACLE_INTERACTION_COVERAGE cards=${cardExecutions}/${rows.length} keywords=${keywordExecutions}/${declaredKeywordTotal} operations=${operationExecutions}/${declaredOperationTotal} pct=100`);
  t.diagnostic(`ORACLE_TEMPLATE_COVERAGE ${JSON.stringify(Object.fromEntries(Object.entries(templateCounts).sort()))}`);
  t.diagnostic(`ORACLE_INTERACTION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(keywordCounts).sort()))}`);
  t.diagnostic(`ORACLE_OPERATION_MATRIX ${JSON.stringify(Object.fromEntries(Object.entries(operationCounts).sort()))}`);
});

test('interaction gate odbija lažni marker, nepoznat keyword i nevažeće manual/template contracte', () => {
  const MTG = loadEngine();
  const generic = genericEntries(MTG)[0].entry.raw.name;
  const genericScript = MTG.SCRIPTS[generic];
  const genericCatalog = MTG.CARD_CATALOG[generic];
  const originalMarker = genericScript.oracleImplemented;
  const originalKeywords = genericCatalog.implementedKeywords;
  try {
    genericScript.oracleImplemented = false;
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-oracle-implementation-marker'));

    genericScript.oracleImplemented = true;
    genericCatalog.implementedKeywords = ['future-unsupported-keyword'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: generic }] }, MTG.DEFS);
    assert.equal(audit.ready, false);
    assert.ok(audit.unsupported.some(item => item.reason === 'no-interaction-contract:future-unsupported-keyword'));
  } finally {
    genericScript.oracleImplemented = originalMarker;
    genericCatalog.implementedKeywords = originalKeywords;
  }

  const manual = 'Sauron, the Dark Lord';
  const manualScript = MTG.SCRIPTS[manual];
  const originalContracts = manualScript.oracleContracts;
  try {
    manualScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-manual-interaction-contracts'));
    manualScript.oracleContracts = ['not-a-real-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: manual }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-manual-contract:not-a-real-contract'));
  } finally {
    manualScript.oracleContracts = originalContracts;
  }

  const template = genericEntries(MTG).find(row => (row.entry.implementation || []).length).entry.raw.name;
  const templateScript = MTG.SCRIPTS[template];
  const templateContracts = templateScript.oracleContracts;
  const templateImplementation = templateScript.oracleImplementation;
  try {
    templateScript.oracleContracts = [];
    let audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'missing-template-interaction-contracts'));

    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation.slice(0, -1);
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'compiled-template-mismatch'));

    templateScript.oracleImplementation = templateImplementation;
    templateScript.oracleContracts = ['not-a-real-template-contract'];
    audit = MTG.auditImportedDeckInteractions({ cards: [{ n: 1, name: template }] }, MTG.DEFS);
    assert.ok(audit.unsupported.some(item => item.reason === 'unknown-template-contract:not-a-real-template-contract'));
  } finally {
    templateScript.oracleContracts = templateContracts;
    templateScript.oracleImplementation = templateImplementation;
  }
});

test('Tunnel Surveyor pravi 1/1 bijeli Enchantment Creature — Glimmer token', async () => {
  const MTG = loadEngine();
  const context = gameFor(MTG);
  fillLibrary(MTG, context.a, 5);
  await enterPermanentProof(MTG, context, genericEntries(MTG).find(row => row.entry.raw.name === 'Tunnel Surveyor').entry);
  const tokens = context.game.battlefield.filter(card => card.isToken && card.ctrl === context.a && card.hasSub('Glimmer'));
  assert.equal(tokens.length, 1);
  const token = tokens[0];
  assert.equal(token.is('Enchantment'), true);
  assert.equal(token.is('Creature'), true);
  assert.deepEqual(Array.from(token.def.subtypes), ['Glimmer']);
  assert.deepEqual(Array.from(token.colors), ['W']);
  assert.equal(token.power, 1);
  assert.equal(token.toughness, 1);
});

test('Thor Odinson ima dvije odvojene prowess instance i dobija +2/+2 po noncreature castu', async () => {
  const MTG = loadEngine();
  const { game, a } = gameFor(MTG);
  fillLibrary(MTG, a, 5);
  const thor = permanent(MTG, game, a, 'Thor Odinson');
  const prowess = thor.def.triggers.filter(trigger => trigger.desc === 'Prowess');
  assert.equal(prowess.length, 2, 'printed prowess, prowess creates two trigger instances');
  const beforePower = thor.power;
  const beforeToughness = thor.toughness;
  const spell = zoneCard(MTG, a, 'Brilliant Plan', 'hand');
  assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
  await resolveAll(game);
  assert.equal(thor.power, beforePower + 2);
  assert.equal(thor.toughness, beforeToughness + 2);
});

test('ukradeni Oracle dies-draw crta LKI kontroloru, a ne owneru', async () => {
  const MTG = loadEngine();
  const { game, a: owner, b: controller } = gameFor(MTG);
  fillLibrary(MTG, owner, 5);
  fillLibrary(MTG, controller, 5);
  const stolen = permanent(MTG, game, owner, 'Buzz Bots');
  stolen.ctrl = controller;
  game.recalc();
  const ownerLibrary = owner.library.length;
  const controllerLibrary = controller.library.length;
  await game.destroy(stolen);
  await resolveAll(game);
  assert.equal(stolen.owner, owner);
  assert.equal(stolen.zone, 'graveyard');
  assert.equal(owner.library.length, ownerLibrary, 'owner does not draw');
  assert.equal(controller.library.length, controllerLibrary - 1, 'last known controller draws');
});

test('two-brid plaćanje pokriva krajnje, miješane i normal-plus-two-brid kombinacije', async () => {
  const MTG = loadEngine();
  const printedCost = '{2/R}{2/R}{2/R}';
  assert.equal(MTG.mv(printedCost), 6);
  assert.equal(MTG.costStr(MTG.parseCost(printedCost)), printedCost, 'public mana-cost text never leaks the internal TWO marker');
  const definition = MTG.DEFS['Flame Javelin'];
  const probe = new MTG.CardInst(definition, null);
  assert.equal(probe.mv, 6);

  const castWith = async pool => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = b;
    Object.assign(a.pool, pool);
    const before = b.life;
    const spell = zoneCard(MTG, a, 'Flame Javelin', 'hand');
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true, `cast with ${JSON.stringify(pool)}`);
    assert.equal(spell.zone, 'stack');
    await resolveAll(game);
    assert.equal(spell.zone, 'graveyard');
    assert.equal(b.life, before - 4);
    assert.equal(poolTotal(a), 0, 'all supplied mana is paid');
  };

  await castWith({ R: 3 });
  await castWith({ R: 2, C: 2 });
  await castWith({ R: 1, C: 4 });
  await castWith({ C: 6 });

  const castMixedCost = async (pool, expected) => {
    const { game, a } = gameFor(MTG);
    Object.assign(a.pool, pool);
    const definition = fixtureDefinition('Oracle Normal Plus Two-Brid', ['Instant'], {
      cost: '{1}{U}{2/R}',
    });
    const spell = new MTG.CardInst(definition, a);
    spell.zone = 'hand';
    a.hand.push(spell);
    const beforePool = poolTotal(a);
    assert.equal(await game.castSpell(a, spell, { from: 'hand' }), expected,
      `normal plus two-brid with ${JSON.stringify(pool)}`);
    if (expected) {
      assert.equal(spell.zone, 'stack');
      await resolveAll(game);
      assert.equal(spell.zone, 'graveyard');
      assert.equal(poolTotal(a), 0);
    } else {
      assert.equal(spell.zone, 'hand');
      assert.equal(poolTotal(a), beforePool, 'rejected mixed payment spends no mana');
    }
  };

  await castMixedCost({ U: 1, R: 1, C: 1 }, true);
  await castMixedCost({ U: 1, C: 3 }, true);
  await castMixedCost({ U: 1, C: 2 }, false);
});

test('Oracle any-target burn vidi Battle, stvarni handleETB postavlja defense i damage ga skida', async () => {
  const MTG = loadEngine();

  const castAtBattle = async (name, amount, castOptions, pool = {}) => {
    let battle = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(battle) ? [battle] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    Object.assign(a.pool, pool);
    battle = new MTG.CardInst(fixtureDefinition('Oracle Battle Target', ['Battle'], { defense: '10' }), b);
    battle.zone = 'hand';
    b.hand.push(battle);
    await game.move(battle, 'battlefield');
    assert.equal(battle.counters.defense, 10, `${name}: handleETB initializes printed defense`);
    const spell = zoneCard(MTG, a, name, 'hand');
    const specs = game.spellTargetSpecs(spell, castOptions.alt || {}, a);
    assert.ok(specs && specs.length, `${name}: any-target spec`);
    assert.equal(game.legalTargets(specs[0], spell, a).includes(battle), true, `${name}: Battle is a legal any target`);
    assert.equal(await game.castSpell(a, spell, castOptions), true, `${name}: casts targeting Battle`);
    assert.equal(game.stack.at(-1).targets[0], battle, `${name}: Battle target is locked on Stack`);
    await resolveAll(game);
    assert.equal(battle.counters.defense, 10 - amount, `${name}: damage removes defense counters`);
    assert.equal(battle.damage, 0, `${name}: Battle does not receive creature marked damage`);
    assert.equal(battle.zone, 'battlefield');
  };

  await castAtBattle('Lightning Bolt', 3, { from: 'hand', alt: { free: true } });
  await castAtBattle('Blaze', 3, { from: 'hand', xVal: 3 }, { R: 1, C: 3 });
});

test('Oracle composite targeti izvršavaju svaku alternativu i permanent/nonland filtere', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG);
  const find = (kind, what) => {
    for (const { entry } of rows) {
      const operation = (entry.implementation || []).find(candidate =>
        candidate.kind === kind && candidate.what === what && candidate.n !== 'X');
      if (operation) return { entry, operation };
    }
    assert.fail(`missing Oracle fixture for ${kind}/${what}`);
  };

  const castAt = async ({ entry, operation }, buildTarget, verify, verifyCandidates) => {
    let target = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(target) ? [target] : [],
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    target = buildTarget(game, a, b);
    game.recalc();
    const spell = zoneCard(MTG, a, entry.raw.name, 'hand');
    const spec = MTG.SCRIPTS[entry.raw.name].targets[0];
    const candidates = game.legalTargets(spec, spell, a);
    assert.ok(candidates.includes(target), `${entry.raw.name}: alternate ${operation.what} target is legal`);
    if (verifyCandidates) verifyCandidates({ game, a, b, spell, candidates });
    const before = {
      loyalty: target.counters.loyalty || 0,
      life: target.life,
    };
    assert.equal(await game.castSpell(a, spell, { from: 'hand', alt: { free: true } }), true);
    await resolveAll(game);
    await verify({ game, a, b, target, before, operation });
  };

  await castAt(find('spell-exile', 'artifact or enchantment'),
    (game, a, b) => permanent(MTG, game, b, fixtureDefinition('Oracle Enchantment Alternative', ['Enchantment'])),
    async ({ target }) => assert.equal(target.zone, 'exile'));

  await castAt(find('spell-destroy', 'creature or planeswalker'),
    (game, a, b) => {
      const target = permanent(MTG, game, b, fixtureDefinition('Oracle Planeswalker Alternative', ['Planeswalker'], { loyalty: '8' }));
      target.counters.loyalty = 8;
      return target;
    },
    async ({ target }) => assert.equal(target.zone, 'graveyard'));

  for (const what of ['target creature or planeswalker', 'target player or planeswalker']) {
    await castAt(find('spell-damage', what),
      (game, a, b) => {
        const target = permanent(MTG, game, b, fixtureDefinition(`Oracle ${what} Alternative`, ['Planeswalker'], { loyalty: '20' }));
        target.counters.loyalty = 20;
        return target;
      },
      async ({ target, before, operation }) => {
        assert.equal(target.counters.loyalty, before.loyalty - operation.n,
          `${operation.what}: Planeswalker loses loyalty`);
      });
  }

  let excludedLand = null;
  await castAt(find('spell-bounce', 'nonland permanent'),
    (game, a, b) => {
      excludedLand = permanent(MTG, game, b, 'Forest');
      return permanent(MTG, game, b, fixtureDefinition('Oracle Nonland Alternative', ['Enchantment']));
    },
    async ({ target }) => assert.equal(target.zone, 'hand'),
    ({ candidates }) => assert.equal(candidates.includes(excludedLand), false, 'nonland filter excludes a land'));

  await castAt(find('spell-destroy', 'permanent'),
    (game, a, b) => permanent(MTG, game, b, 'Forest'),
    async ({ target }) => assert.equal(target.zone, 'graveyard'));
});

test('Oracle spell resolver guardovi su sigurni za stale/uncounterable/empty target stanja', async () => {
  const MTG = loadEngine();
  const rows = genericEntries(MTG).map(row => row.entry);
  const scriptFor = kind => {
    const entry = rows.find(candidate => (candidate.implementation || []).some(operation => operation.kind === kind));
    assert.ok(entry, `fixture for ${kind}`);
    return MTG.SCRIPTS[entry.raw.name];
  };
  let chooseCardsCalled = false;
  const { game, a, b } = gameFor(MTG, [decision(), decision({
    chooseCards: () => {
      chooseCardsCalled = true;
      throw new Error('empty discard guard should not ask for cards');
    },
  })]);
  const source = zoneCard(MTG, a, 'Forest', 'exile');

  const counter = scriptFor('spell-counter');
  await counter.resolve({ g: game, src: source, you: a, targets: [] });
  const staleCard = zoneCard(MTG, b, 'Brilliant Plan', 'exile');
  const stale = { kind: 'spell', card: staleCard, ctrl: b, targets: [] };
  await counter.resolve({ g: game, src: source, you: a, targets: [stale] });
  assert.equal(staleCard.zone, 'exile', 'stale stack target is untouched');

  const uncounterableCard = new MTG.CardInst(fixtureDefinition('Oracle Uncounterable Guard', ['Instant'], {
    uncounterable: true,
  }), b);
  uncounterableCard.zone = 'stack';
  const uncounterable = { kind: 'spell', card: uncounterableCard, ctrl: b, targets: [] };
  game.stack.push(uncounterable);
  await counter.resolve({ g: game, src: source, you: a, targets: [uncounterable] });
  assert.ok(game.stack.includes(uncounterable), 'uncounterable target remains on Stack');

  for (const kind of ['spell-destroy', 'spell-exile', 'spell-damage', 'spell-bounce', 'spell-mill']) {
    await scriptFor(kind).resolve({ g: game, src: source, you: a, targets: [] });
  }
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [] });
  await scriptFor('spell-discard').resolve({ g: game, src: source, you: a, targets: [b] });
  assert.equal(chooseCardsCalled, false, 'empty hand exits before discard choice');
});

test('svih devet Oracle Phyrexian-cost karata traži dva života po neplaćenom PHY pipu', async () => {
  const MTG = loadEngine();
  const entries = genericEntries(MTG).map(row => row.entry)
    .filter(entry => /\{[WUBRG]\/P\}/.test(entry.raw.cost || ''));
  assert.equal(entries.length, 9);

  const attempt = async (entry, { life, pool, expected, resolve = true }) => {
    let wantedTarget = null;
    const chooser = decision({
      chooseTargets: (game, query) => query.candidates.includes(wantedTarget)
        ? [wantedTarget] : query.candidates.slice(0, query.min || 0),
    });
    const { game, a, b } = gameFor(MTG, [chooser, decision()]);
    a.life = life;
    Object.assign(a.pool, pool);
    if (entry.raw.name === 'Dismember') wantedTarget = targetPermanent(MTG, game, b, 'creature');
    else if (entry.raw.name === 'Mutagenic Growth') wantedTarget = targetPermanent(MTG, game, a, 'creature');
    else if (entry.raw.name === 'Gut Shot') wantedTarget = b;
    const card = zoneCard(MTG, a, entry.raw.name, 'hand');
    const lifeBefore = a.life;
    const poolBefore = poolTotal(a);
    const cast = await game.castSpell(a, card, { from: 'hand' });
    assert.equal(cast, expected, `${entry.raw.name}: payment ${JSON.stringify({ life, pool })}`);
    if (!expected) {
      assert.equal(card.zone, 'hand', `${entry.raw.name}: rejected cast leaves card in hand`);
      assert.equal(a.life, lifeBefore, `${entry.raw.name}: rejected cast pays no life`);
      assert.equal(poolTotal(a), poolBefore, `${entry.raw.name}: rejected cast pays no mana`);
      return { game, a, card };
    }
    assert.equal(card.zone, 'stack', `${entry.raw.name}: accepted payment puts spell on Stack`);
    if (resolve) {
      await resolveAll(game);
      const destination = entry.raw.types.includes('Creature') ? 'battlefield' : 'graveyard';
      assert.equal(card.zone, destination, `${entry.raw.name}: resolves through its real card-type path`);
    }
    return { game, a, card };
  };

  for (const entry of entries) {
    const parsed = MTG.parseCost(entry.raw.cost);
    const phy = parsed.pips.filter(pip => pip.includes('PHY'));
    assert.ok(phy.length > 0, `${entry.raw.name}: parsed PHY pips`);
    const genericPool = parsed.generic ? { C: parsed.generic } : {};

    await attempt(entry, {
      life: phy.length * 2 - 1,
      pool: genericPool,
      expected: false,
    });

    const lifePayment = await attempt(entry, {
      life: phy.length * 2 + 5,
      pool: genericPool,
      expected: true,
    });
    assert.equal(lifePayment.a.life, 5, `${entry.raw.name}: exactly two life per PHY pip`);

    const manaPool = { C: parsed.generic };
    for (const pip of phy) {
      const color = pip.find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      manaPool[color] = (manaPool[color] || 0) + 1;
    }
    const manaPayment = await attempt(entry, { life: 9, pool: manaPool, expected: true });
    assert.equal(manaPayment.a.life, 9, `${entry.raw.name}: colored mana pays PHY without life`);

    if (phy.length > 1) {
      const mixedPool = { C: parsed.generic };
      const color = phy[0].find(symbol => ['W', 'U', 'B', 'R', 'G'].includes(symbol));
      mixedPool[color] = 1;
      const mixed = await attempt(entry, { life: 7, pool: mixedPool, expected: true });
      assert.equal(mixed.a.life, 5, `${entry.raw.name}: mixed mana plus life payment`);
    }
  }

  const gutShot = entries.find(entry => entry.raw.name === 'Gut Shot');
  await attempt(gutShot, { life: 1, pool: {}, expected: false, resolve: false });
  const exactBoundary = await attempt(gutShot, { life: 2, pool: {}, expected: true, resolve: false });
  assert.equal(exactBoundary.a.life, 0, 'Gut Shot may pay exactly two life down to zero');
});
