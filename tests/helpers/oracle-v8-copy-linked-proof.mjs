import assert from 'node:assert/strict';
import {matchesTarget, stageCondition} from './oracle-v5-proof.mjs';
import {installLibraryProof, stageLibraryEffect, assertLibraryEffect} from './oracle-v8-library-proof.mjs';

const installed = new WeakSet(), worlds = new WeakMap();
const linkedActions = new Set(['linked-exile-until', 'linked-exile', 'linked-return']);
const ownActions = new Set([...linkedActions, 'copy-token-v8', 'become-copy-v8']);
const flatten = effects => (effects || []).flatMap(effect => [effect, ...flatten(effect.effects), ...flatten(effect.elseEffects)]);
const flat = value => [value].flat().filter(Boolean);
const definition = card => card && (card.isCopyOf || card.def);
const state = card => ({card, zone: card.zone, version: card.zoneVersion, controller: card.ctrl, owner: card.owner,
  definition: definition(card), power: card.power, toughness: card.toughness, tapped: card.tapped,
  damage: card.damage, counters: {...card.counters}, sick: card.sick, attacking: card.attacking,
  keywords: [...(card.cur?.kw || card.def?.kws || [])]});
const links = game => (game.oracleLinkedExiles || []).map(record => ({...record, cards: record.cards.map(entry => ({...entry}))}));
const durationLinks = game => (game.oracleExileDurations || []).map(record => ({...record, cards: record.cards.map(entry => ({...entry}))}));

function expectedSources(engine, effect, context) {
  const {g: game, src: source, you} = engine;
  const relative = {...context, game, a: you, b: game.players.find(player => player !== you)};
  if (effect.filters || effect.filter) return game.bf().filter(card => (effect.filters || [effect.filter]).some(filter => matchesTarget(card, filter, relative, source))).map(state);
  const reference = effect.target;
  if (reference?.kind === 'paid-card') {
    const saved = engine.oraclePaymentCapture?.cards?.[reference.index];
    return saved?.card && saved.card.zoneVersion === saved.zoneVersionAfter ? [state(saved.card)] : [];
  }
  if (reference === 'self' || reference === 'copy-source') {
    if (source.zone === 'battlefield' && source.zoneVersion === engine.sourceZoneVersion || engine.sourceZoneVersion === undefined) return [state(source)];
    const def = (engine.data?.card === source && engine.data.snap?.def) || source.battlefieldLKI?.get(engine.sourceZoneVersion)?.def || engine.oracleSourceCapture?.copiableDef;
    return def ? [{...state(source), definition: def}] : [];
  }
  if (reference === 'event-card' || reference === 'copy-reference') {
    const card = engine.oracleSourceCapture?.eventCard || engine.data?.card;
    if (!card) return [];
    const def = (engine.data?.card === card && engine.data.snap?.def) ||
      (card.zoneVersion === engine.eventCardZoneVersion ? definition(card) : card.battlefieldLKI?.get(engine.eventCardZoneVersion)?.def);
    return [{...state(card), definition: def || definition(card)}];
  }
  if (reference === 'attached-host') return flat(game.byIid(source.attachedTo)).map(state);
  if (reference?.kind === 'resolved-target') return flat(engine.targets?.[reference.index]).map(state);
  if (typeof reference === 'number') return flat(engine.targets?.[reference]).map(state);
  return [];
}

// The wrappers only observe the public engine action. Each runtime is wrapped
// once; the WeakMap keeps speculative AI game clones out of fixture evidence.
export function installCopyLinkedProof(MTG, context) {
  installLibraryProof(MTG, context);
  if (!context.copyLinkedProof) {
    context.copyLinkedProof = {rows: [], choices: [], grants: new Set(), pending: [], resolved: [], entries: []};
    const controller = context.a.controller, decide = controller.decide.bind(controller);
    controller.decide = async (game, query) => {
      const result = await decide(game, query);
      if (game === context.game) context.copyLinkedProof.choices.push({query, result});
      return result;
    };
    const resolve = context.game.resolveTop.bind(context.game);
    context.game.resolveTop = async () => {
      const object = context.game.stack.at(-1), helpers = context.copyLinkedProof.helpers;
      const tracked = [object?.srcCard || object?.card, ...flat(object?.targets).flat()].filter(Boolean);
      const row = {object, before: helpers?.genericProofSnapshot?.(context, tracked)};
      context.copyLinkedProof.resolved.push(row);
      return resolve();
    };
    const emit = context.game.emit.bind(context.game);
    context.game.emit = async (event, data) => {
      if (event === 'etb') context.copyLinkedProof.entries.push(data.card);
      return emit(event, data);
    };
  }
  worlds.set(context.game, context);
  if (installed.has(MTG)) return;
  installed.add(MTG);
  for (const module of [MTG.OracleV8Copies, MTG.OracleV8Linked]) {
    const run = module.run;
    module.run = async (engine, effect, helpers) => {
      const current = worlds.get(engine.g);
      if (!current) return run(engine, effect, helpers);
      const row = {effect, source: engine.src, sourceVersion: engine.data?.card === engine.src && engine.data.snap
        ? engine.data.snap.zoneVersion : engine.sourceZoneVersion ?? engine.src.zoneVersion,
      you: engine.you, sources: expectedSources(engine, effect, current), beforeLinks: links(engine.g),
      beforeDurations: durationLinks(engine.g), beforeBattlefield: engine.g.bf().slice(),
      n: effect.n === undefined ? 0 : helpers.amount(effect.n, engine), context: engine,
      choicesStart: current.copyLinkedProof.choices.length, entriesStart: current.copyLinkedProof.entries.length,
      beforeCopyClock: engine.g.oracleCopyClock || 0,
      models: effect.action === 'become-copy-v8' ? expectedSources(engine, effect.chooseModel ? {filter: effect.chooseModel} : {target: effect.otherTarget}, current) : null};
      current.copyLinkedProof.rows.push(row);
      const result = await run(engine, effect, helpers);
      row.afterLinks = links(engine.g); row.afterDurations = durationLinks(engine.g);
      row.afterSources = row.sources.map(({card}) => state(card));
      row.made = engine.g.bf().filter(card => card.isToken && !row.beforeBattlefield.includes(card)).map(state);
      row.choices = current.copyLinkedProof.choices.slice(row.choicesStart);
      row.entries = current.copyLinkedProof.entries.slice(row.entriesStart);
      row.copyLayers = engine.g.untilEffects.filter(layer => layer.oracleCopyLayer && layer.timestamp > row.beforeCopyClock).map(layer => ({...layer}));
      return result;
    };
  }
}

export function stageCopyLinkedEffect(MTG, context, effect, helpers) {
  if (stageLibraryEffect(MTG, context, effect, helpers)) return true;
  if (effect.action === 'resolution-cost') {
    let staged = false;
    for (const child of [...(effect.effects || []), ...(effect.elseEffects || [])]) {
      staged = stageCopyLinkedEffect(MTG, context, child, helpers) || staged;
    }
    return staged;
  }
  if (!ownActions.has(effect.action)) return false;
  installCopyLinkedProof(MTG, context); context.copyLinkedProof.helpers = helpers;
  const filters = effect.filters || (effect.filter ? [effect.filter] : []), cards = [];
  for (const filter of filters) for (let n = 0; n < (effect.choose ? 1 : 2); n++) {
    cards.push(...flat(helpers.stageGenericTarget(MTG, context, filter, 'v8-copy-linked-' + n, effect)));
  }
  if (effect.chooseModel) helpers.stageGenericTarget(MTG, context, effect.chooseModel, 'v8-chosen-copy-model');
  if (filters.length) {
    context.groupFixtures ||= new Map(); context.groupFixtures.set(effect, cards);
  }
  for (const operation of effect.modifications?.operations || []) {
    for (const [index, target] of (operation.targets || []).entries()) helpers.stageGenericTarget(MTG, context, target, 'copied-rule-target-' + index);
  }
  return true;
}

export async function prepareCopyLinkedSource(MTG, context, entry, operation, source, helpers) {
  installCopyLinkedProof(MTG, context);
  context.copyLinkedProof.helpers = helpers;
  const effects = flatten(operation.effects);
  if (effects.some(effect => ['copy-token-v8', 'become-copy-v8'].includes(effect.action) && [effect.target, effect.otherTarget].includes('attached-host')) && !source.attachedTo) {
    const aura = entry.implementation.find(op => op.kind === 'aura-target');
    const host = helpers.stageGenericTarget(MTG, context, {what: (aura?.what || 'creature').replace(/ you control$/, ''), controller: 'you'}, 'v8-copy-host');
    await context.game.attach(source, host);
  }
  const returns = effects.filter(effect => effect.action === 'linked-return');
  if (!returns.length) return;
  const {game, a} = context;
  const acquisitions = entry.implementation.filter(op => flatten(op.effects).some(effect => effect.action === 'linked-exile' && returns.some(back => back.link === effect.link)));
  assert.ok(acquisitions.length, entry.raw.name + ': return has a printed acquisition');
  for (const acquire of acquisitions) {
    for (const [index, filter] of (acquire.targets || []).entries()) helpers.stageGenericTarget(MTG, context, filter, 'v8-linked-acquire-' + index);
    for (const effect of flatten(acquire.effects)) stageCopyLinkedEffect(MTG, context, effect, helpers);
  }
  // Cast the original printed source so entry counters, ETBs, and all its
  // ordinary costs happen. No fabricated exile record is accepted by a return.
  if (source.zone === 'battlefield') {await game.move(source, 'hand'); await helpers.resolveAll(game);}
  assert.equal(source.zone, 'hand'); game.turnPlayer = a; game.phase = 'main1';
  helpers.fund(a, 100); helpers.stageCardCosts?.(MTG, context, entry);
  if (source.is('Land')) {a.landsPlayed = 0; assert.equal(await game.playLand(a, source), true);}
  else assert.equal(await game.castSpell(a, source, {from: 'hand', xVal: 3}), true, entry.raw.name + ': acquisition source is a paid cast');
  await helpers.resolveAll(game);
  for (const acquire of acquisitions) {
    if (acquire.kind === 'generic-trigger' && acquire.event === 'etb' && ['self', 'self-card', undefined].includes(acquire.eventFilter)) continue;
    assert.equal(source.zone, 'battlefield', entry.raw.name + ': acquisition source remains');
    helpers.fund(a, 100); source.sick = false; source.tapped = false;
    stageCondition(MTG, context, acquire.activationCondition || acquire.condition, source, helpers);
    if (acquire.kind === 'generic-ability') {
      const ordinal = entry.implementation.filter(op => op.kind === 'generic-ability' && !op.from).indexOf(acquire);
      const compiled = (source.def.abilities || []).filter(ability => ability.oracleCompiled)[ordinal];
      const action = game.activatableList(a).find(candidate => candidate.card === source && candidate.ability === compiled);
      assert.ok(action, entry.raw.name + ': paid linked acquisition is offered');
      assert.equal(await game.activateAbility(a, action), true);
    } else await helpers.fireGenericEvent(MTG, context, source, acquire);
    await helpers.resolveAll(game);
  }
  const acquired = context.copyLinkedProof.rows.filter(row => row.source === source && row.sourceVersion === source.zoneVersion && row.effect.action === 'linked-exile');
  assert.ok(acquired.length, entry.raw.name + ': actual acquisition ran on the same battlefield incarnation (' + source.zone + '@' + source.zoneVersion + '; ' +
    context.copyLinkedProof.rows.filter(row => row.effect.action === 'linked-exile').map(row => row.source.name + '@' + row.sourceVersion + ' exiled ' + row.sources.map(model => model.card.name).join(', ')).join('; ') + ')');
  assert.ok((game.oracleLinkedExiles || []).some(record => record.source === source && record.sourceZoneVersion === source.zoneVersion &&
    record.cards.some(({card, zoneVersion}) => card.zone === 'exile' && card.zoneVersion === zoneVersion)), entry.raw.name + ': linked return starts with a genuinely exiled card');
  source.tapped = false; source.sick = false; helpers.fund(a, 100); game.recalc();
}

function assertCopyValues(actual, model, mod, label) {
  const def = actual.definition, original = model.definition;
  assert.ok(def && original, label + ': both copiable definitions exist');
  assert.equal(def.name, mod.name || original.name, label + ': copied name');
  assert.equal(def.cost, original.cost, label + ': copied mana cost');
  if (mod.power !== undefined) {assert.equal(Number(def.power), mod.power, label + ': power exception'); assert.equal(def.cdaPower, undefined, label + ': replaced power CDA omitted');}
  else assert.equal(def.power, original.power, label + ': copied printed power');
  if (mod.toughness !== undefined) {assert.equal(Number(def.toughness), mod.toughness); assert.equal(def.cdaToughness, undefined);}
  else assert.equal(def.toughness, original.toughness);
  if (mod.nonlegendary) assert.equal((def.super || []).includes('Legendary'), false);
  for (const supertype of mod.addSuper || []) assert.ok(def.super.includes(supertype), label + ': added supertype ' + supertype);
  for (const type of mod.types || [...(original.types || []), ...(mod.addTypes || [])]) assert.ok(def.types.includes(type), label + ': copied or added type ' + type);
  if (mod.types) assert.deepEqual(Array.from(def.types), Array.from(mod.types), label + ': replacement card types');
  for (const subtype of [...(mod.addSubtypes || []), ...(mod.creatureSubtypes || [])]) assert.ok(def.subtypes.includes(subtype), label + ': copy subtype exception');
  if (mod.colors) assert.deepEqual(Array.from(def.colorsOverride), Array.from(mod.colors), label + ': color exception');
  for (const keyword of [...(original.kws || []), ...(mod.keywords || [])]) assert.ok(def.kws.includes(keyword), label + ': copied or added keyword ' + keyword);
  for (const operation of mod.operations || []) {
    if (operation.kind === 'mana-source') assert.ok(def.mana?.length, label + ': copiable mana ability');
    else if (operation.kind === 'generic-ability') assert.ok(def.abilities?.length, label + ': copiable activated ability');
    else if (operation.kind === 'generic-trigger') assert.ok(def.triggers?.length, label + ': copiable trigger');
    else if (operation.kind === 'mechanic-changeling') assert.equal(def.changeling, true);
    else if (operation.kind === 'mechanic-myriad') assert.ok(def.kws.includes('myriad'));
    else if (operation.kind === 'mechanic-dethrone') assert.ok(def.triggers?.length);
    else assert.fail(label + ': unknown copied rule ' + operation.kind);
  }
}

export async function assertCopyLinkedEffect(MTG, context, entry, effect, label, helpers) {
  if (assertLibraryEffect(MTG, context, entry, effect, label, helpers)) return true;
  if (!ownActions.has(effect.action)) return false;
  const proof = context.copyLinkedProof;
  const rows = (proof?.rows || []).filter(row => row.effect === effect || JSON.stringify(row.effect) === JSON.stringify(effect));
  assert.ok(rows.length, label + ': closed descriptor executed through its normal engine route');
  const row = rows.at(-1), {game} = context;
  if (effect.action === 'become-copy-v8') {
    const models = effect.chooseModel ? row.models.filter(model => row.choices.some(choice => choice.query.type === 'chooseCards' && flat(choice.result).includes(model.card))) : row.models;
    assert.equal(models.length, 1, label + ': one actual copiable model');
    const model = models[0], recipients = row.sources.filter(subject => !effect.excludeModel || subject.card !== model.card);
    assert.ok(recipients.length, label + ': positive live recipients');
    assert.equal(row.entries.length, 0, label + ': copying existing objects causes no battlefield entry');
    const made = [];
    for (const before of recipients) {
      const after = row.afterSources.find(subject => subject.card === before.card);
      assert.ok(after, label + ': recipient after copy'); assertCopyValues(after, model, effect.modifications || {}, label);
      assert.equal(after.version, before.version, label + ': same battlefield incarnation');
      assert.equal(after.owner, before.owner, label + ': ownership preserved'); assert.equal(after.controller, before.controller, label + ': controller preserved');
      assert.equal(after.tapped, before.tapped, label + ': tapped status preserved'); assert.equal(after.damage, before.damage, label + ': damage preserved');
      assert.deepEqual(after.counters, before.counters, label + ': counters preserved');
      assert.equal(after.sick, before.sick, label + ': control duration preserved'); assert.equal(after.attacking, before.attacking, label + ': combat status preserved');
      const layer = row.copyLayers.find(layer => layer.iid === before.card.iid && layer.zoneVersion === before.version);
      assert.ok(layer, label + ': copy effect is tied to the actual battlefield incarnation');
      assert.equal(layer.expires, effect.duration === 'eot' ? 'eot' : effect.duration === 'next-turn' ? 'untilTurnOf' : 'object');
      if (effect.duration === 'next-turn') assert.equal(layer.whoTurn, row.you);
      if (effect.modifications?.retainAbility) {
        const ability = row.context.ability || row.context.oracleOriginTrigger;
        assert.ok(ability, label + ': retained originating ability is captured');
        assert.ok((after.definition[row.context.ability ? 'abilities' : 'triggers'] || []).includes(ability), label + ': originating ability is part of copiable values');
      }
      made.push(after);
    }
    if (!proof.pending.some(item => item.row === row)) proof.pending.push({row, effect, made, models, recipients, label});
    return true;
  }
  if (effect.action === 'copy-token-v8') {
    const models = effect.choose ? row.sources.filter(model => row.choices.some(choice => choice.query.type === 'chooseCards' && flat(choice.result).includes(model.card))) : row.sources;
    const controllers = effect.who === 'each-player' ? game.players : effect.who === 'each-opponent' ? game.players.filter(player => player !== row.you) :
      effect.who === 'event-card-controller' ? [row.context.oracleSourceCapture.eventController] : typeof effect.who === 'number' ? flat(row.context.targets[effect.who]) : [row.you];
    const made = row.made.filter(snapshot => snapshot.card.isCopyOf);
    assert.equal(made.length, models.length * row.n * controllers.length, label + ': exact copy count');
    if (row.n) assert.ok(models.length, label + ': a positive copiable subject was present');
    const assigned = new Set();
    for (const model of models) for (const controller of controllers) {
      const copies = made.filter(snapshot => !assigned.has(snapshot) && snapshot.definition.name === model.definition.name && snapshot.controller === controller).slice(0, row.n);
      assert.equal(copies.length, row.n, label + ': copies of each source for each controller');
      for (const copy of copies) {
        assigned.add(copy);
        assertCopyValues(copy, model, effect.modifications || {}, label);
        assert.equal(copy.owner, controller, label + ': creating player owns the token');
        if (effect.tapped) assert.equal(copy.tapped, true);
        if (effect.haste) assert.ok(copy.keywords.includes('haste'));
      }
    }
    if (!proof.pending.some(item => item.row === row)) proof.pending.push({row, effect, made, models, label});
    return true;
  }
  if (effect.action === 'linked-return') {
    const records = row.beforeLinks.filter(record => record.source === row.source && record.sourceZoneVersion === row.sourceVersion && record.link === effect.link);
    const cards = records.flatMap(record => record.cards).filter(({card, zoneVersion}) =>
      (!effect.what || card.is('Creature')) && context.copyLinkedProof.rows.some(acquire => acquire.effect.action === 'linked-exile' && acquire.source === row.source &&
        acquire.afterLinks?.some(link => link.cards.some(saved => saved.card === card && saved.zoneVersion === zoneVersion))));
    assert.ok(cards.length, label + ': linked return follows actual prior acquisition');
    for (const {card, zoneVersion} of cards) {
      assert.equal(card.zone, effect.to, label + ': exact linked card returns to its printed destination');
      assert.ok(card.zoneVersion > zoneVersion, label + ': returning creates a new zone object');
      if (effect.to === 'battlefield') {assert.equal(card.ctrl, effect.controller === 'owner' ? card.owner : row.you); if (effect.tapped) assert.equal(card.tapped, true);}
    }
    return true;
  }
  const records = (effect.action === 'linked-exile' ? row.afterLinks : row.afterDurations)
    .filter(record => record.source === row.source && record.sourceZoneVersion === row.sourceVersion);
  const entries = records.flatMap(record => record.cards).filter(saved => row.sources.some(before => before.card === saved.card && before.version + 1 === saved.zoneVersion));
  if (!entries.length && (effect.chooseAny || effect.chooseCount)) {
    assert.ok(row.choices.some(choice => choice.query.type === 'chooseCards' && Array.isArray(choice.result) && choice.result.length === 0 && choice.query.min === 0), label + ': real optional zero-card branch');
    return true;
  }
  assert.ok(entries.length, label + ': actual linked exile record and positive victim');
  for (const {card, zoneVersion} of entries) {assert.equal(card.zone, 'exile', label + ': victim exiled'); assert.equal(card.zoneVersion, zoneVersion);}
  if (effect.action === 'linked-exile-until') {
    await game.move(row.source, 'exile');
    for (const {card} of entries) {assert.equal(card.zone, 'battlefield', label + ': immediate duration return'); assert.equal(card.ctrl, card.owner);}
  }
  return true;
}

export async function copyEntryProof(MTG, entry, operation, role, helpers) {
  assert.equal(operation.kind, 'copy-as-enters-v8');
  const context = helpers.gameFor(MTG, [helpers.decision({chooseCards: (game, query) => query.from.slice(0, 1), chooseOption: (game, query) => query.options.find(option => option.key === 'yes')?.key || query.options[0]?.key}), helpers.decision()], {ai: role === 'ai'});
  installCopyLinkedProof(MTG, context); helpers.assertControllerRole?.(MTG, context, entry.raw.name + '/' + role);
  helpers.installEffectEvidence?.(context);
  context.copyLinkedProof.helpers = helpers;
  const {game, a, b} = context;
  const model = helpers.stageGenericTarget(MTG, context, operation.filter, 'v8-copy-entry'), original = state(model);
  helpers.fund(a, 100); helpers.fillLibrary(MTG, a, 30); helpers.fillLibrary(MTG, b, 30); helpers.stageCardCosts?.(MTG, context, entry);
  const source = helpers.zoneCard(MTG, a, entry.raw.name, 'hand');
  if (entry.raw.types.includes('Land')) assert.equal(await game.playLand(a, source), true, entry.raw.name + ': ordinary land play');
  else assert.equal(await game.castSpell(a, source, {from: 'hand'}), true, entry.raw.name + ': paid entry copy cast');
  await helpers.resolveAll(game);
  assert.equal(source.zone, 'battlefield'); assert.ok(source.isCopyOf, entry.raw.name + ': optional copy actually chosen');
  assertCopyValues(state(source), original, operation.modifications, entry.raw.name + '/' + role);
  if (operation.tapped) assert.equal(source.tapped, true);
  const again = (await game.copyPermanentToken(source, a))[0]; assert.ok(again);
  assertCopyValues(state(again), original, operation.modifications, entry.raw.name + ': copy of copy');
  if (operation.tapped && !original.definition.entersTapped) assert.equal(again.tapped, false, entry.raw.name + ': added tapped-entry instruction is not copiable');
  assert.equal(model.zone, operation.filter.zone, entry.raw.name + ': copying does not move model');
  context.copyLinkedProof.pending.push({row: {you: a}, effect: {modifications: operation.modifications}, made: [state(source), state(again)], models: [original], label: entry.raw.name + '/' + role});
  await finishCopyLinkedProof(MTG, context, entry, helpers);
  await game.move(source, 'hand');
  assert.equal(source.name, source.oracleFaces?.faces?.[0]?.def?.name || entry.raw.name);
  assert.equal(source.isCopyOf, null);
  return 6 + (operation.modifications.operations?.length || 0);
}

// Follow-up abilities run after sibling effects have been checked, so a copied
// draw/sacrifice trigger cannot pollute their original before/after snapshots.
export async function finishCopyLinkedProof(MTG, context, entry, helpers) {
  const proof = context.copyLinkedProof;
  if (!proof) return;
  proof.helpers = helpers;
  const pending = proof.pending.splice(0);
  for (const item of pending) {
    const {row, effect, made, models, label} = item;
    for (const [operationIndex, operation] of (effect.modifications?.operations || []).entries()) {
      if (operation.kind.startsWith('mechanic-')) continue; // same shared keyword engine, verified by the copy's keyword above
      const priorTrigger = operation.kind === 'generic-trigger' && proof.resolved.find(record => made.some(copy => {
        const original = models.find(model => (effect.modifications?.name || model.definition.name) === copy.definition.name)?.definition;
        return record.object?.srcCard === copy.card && (copy.definition.triggers || []).slice(original?.triggers?.length || 0)
          .some(trigger => trigger.run === record.object.run && (Array.isArray(operation.event) ? operation.event.includes(trigger.on) : operation.event === trigger.on));
      }));
      const representative = priorTrigger ? made.find(copy => copy.card === priorTrigger.object.srcCard) : made.find(copy => copy.card.zone === 'battlefield') || made[0];
      assert.ok(representative, label + ': a created object carries its quoted ability');
      const card = representative.card, a = representative.controller, b = context.game.players.find(player => player !== a), game = context.game;
      const relative = {...context, a, b};
      helpers.fund(a, 100); game.turnPlayer = a; game.phase = 'main1';
      const previous = (effect.modifications.operations || []).slice(0, operationIndex);
      const original = models.find(model => (effect.modifications?.name || model.definition.name) === representative.definition.name)?.definition;
      if (operation.kind === 'mana-source') {
        card.sick = false; card.tapped = false;
        const index = (original?.mana?.length || 0) + previous.filter(op => op.kind === 'mana-source').length;
        const ability = representative.definition.mana[index];
        const source = game.manaSources(a).find(candidate => candidate.card === card && candidate.m === ability);
        assert.ok(source, label + ': copied quoted mana ability is offered');
        const before = {...a.pool}, produce = source.produce[0];
        assert.equal(await game.activateManaSource(a, source, produce, null, []), true);
        if (operation.activationCost?.tap) assert.equal(card.tapped, true, label + ': quoted mana tap cost paid');
        for (const [color, n] of Object.entries(produce)) if ('WUBRGC'.includes(color)) assert.equal(a.pool[color], before[color] + n, label + ': copied mana production');
        continue;
      }
      let run, record;
      if (operation.kind === 'generic-ability') {
        for (const [index, target] of (operation.targets || []).entries()) helpers.stageGenericTarget(MTG, relative, target, 'copied-grant-' + index);
        stageCondition(MTG, relative, operation.activationCondition, card, helpers);
        card.sick = false; card.tapped = false;
        const index = (original?.abilities?.length || 0) + previous.filter(op => op.kind === 'generic-ability').length;
        const ability = representative.definition.abilities[index]; run = ability?.run;
        const action = game.activatableList(a).find(candidate => candidate.card === card && candidate.ability === ability);
        assert.ok(action, label + ': copied quoted activated ability is offered');
        assert.equal(await game.activateAbility(a, action), true);
      } else {
        const triggers = representative.definition.triggers.slice(original?.triggers?.length || 0);
        const trigger = triggers.find(candidate => Array.isArray(operation.event) ? operation.event.includes(candidate.on) : candidate.on === operation.event);
        assert.ok(trigger, label + ': copied quoted trigger exists'); run = trigger.run;
        record = proof.resolved.find(candidate => candidate.object?.srcCard === card && candidate.object.run === run);
        if (!record) {
          assert.equal(card.zone, 'battlefield', label + ': quoted trigger source is available');
          for (const [index, target] of (operation.targets || []).entries()) helpers.stageGenericTarget(MTG, relative, target, 'copied-trigger-' + index);
          await helpers.fireGenericEvent(MTG, relative, card, operation);
        }
      }
      await helpers.resolveAll(game);
      record ||= proof.resolved.find(candidate => candidate.object?.srcCard === card && candidate.object.run === run);
      assert.ok(record?.before, label + ': copied quoted rule resolved from the real Stack');
      const object = record.object, data = object.ctx?.data || {}, capture = object.ctx?.oracleSourceCapture || {};
      relative.eventCard = capture.eventCard || data.card; relative.eventPlayer = capture.eventPlayer || data.player;
      relative.eventController = capture.eventController || data.snap?.ctrl || relative.eventCard?.ctrl;
      relative.eventAmount = data.n;
      relative.eventCardStats = data.snap || relative.eventCard;
      relative.eventCardBefore = relative.eventCard && helpers.cardState?.(relative.eventCard);
      record.before.oracleX = object.ctx?.x ?? object.x ?? 0;
      for (const child of operation.effects || []) await helpers.assertGenericEffectEvidence(MTG, relative, entry, child, card,
        object.targets || [], b, record.before, proof.choices, label + '/copied-rule');
    }
    if (effect.delayed) {
      const {game} = context;
      if (effect.delayed.your) {await game.emit(effect.delayed.on, {player: context.b}); await helpers.resolveAll(game); for (const copy of made) assert.equal(copy.card.zone, 'battlefield');}
      await game.emit(effect.delayed.on, {player: row.you}); await helpers.resolveAll(game);
      for (const copy of made) assert.ok(['exile', 'graveyard', 'ceased'].includes(copy.card.zone), label + ': actual delayed departure');
    }
  }
  const became = pending.filter(item => item.effect.action === 'become-copy-v8');
  if (became.length) {
    const {game, b} = context;
    const watch = became.flatMap(item => item.row.copyLayers.map(layer => ({layer, item,
      card: item.made.find(copy => copy.card.iid === layer.iid)?.card})));
    const advance = async player => {
      for (const p of game.players) helpers.fillLibrary(MTG, p, 5);
      game.mainPhase = async () => {}; game.combatPhase = async () => {};
      game.turnPlayer = player;
      await game.runTurn(); await helpers.resolveAll(game);
    };
    await advance(b);
    for (const {layer, item, card} of watch) {
      const exists = game.untilEffects.some(effect => effect.oracleCopyLayer && effect.timestamp === layer.timestamp);
      if (layer.expires === 'eot' || card?.zone !== 'battlefield' || card.zoneVersion !== layer.zoneVersion) assert.equal(exists, false, item.label + ': copy lifetime ends through ordinary cleanup or departure');
      else assert.equal(exists, true, item.label + ': copy survives the opponent turn');
    }
    for (const player of new Set(watch.filter(row => row.layer.expires === 'untilTurnOf').map(row => row.layer.whoTurn))) {
      await advance(player);
      for (const {layer, item} of watch.filter(row => row.layer.whoTurn === player)) assert.equal(game.untilEffects.some(effect => effect.oracleCopyLayer && effect.timestamp === layer.timestamp), false, item.label + ': next-own-turn duration expires through the real turn engine');
    }
  }
}
