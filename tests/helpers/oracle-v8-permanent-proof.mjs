import assert from 'node:assert/strict';
import { stageCondition } from './oracle-v5-proof.mjs';

const asCard = value => Array.isArray(value) ? value[0] : value;
const sameOperation = (left, right) => left === right || JSON.stringify(left) === JSON.stringify(right);
const definitionOf = (MTG, value) => typeof value === 'string' ? MTG.TOKENS[value] : value;

function arithmeticExpected(n, transform) {
  if (transform.multiply !== undefined) return n * transform.multiply;
  if (transform.add !== undefined) return Math.max(0, n + transform.add);
  if (transform.set !== undefined) return transform.set;
  assert.equal(transform.round, 'down');
  return Math.floor(n / transform.divide);
}

// The original imported definition is never rewritten. A wrapper observes
// each selected replacement; pure applicability probes do not execute it.
function observeReplacement(game, source, operation, journal) {
  const replacers = game.replacers.bind(game);
  game.replacers = event => replacers(event).map(replacement => {
    if (replacement.src !== source || !sameOperation(replacement.oracleOperation, operation)) return replacement;
    return {...replacement, run: async (...args) => {
      const value = args[1];
      const before = event === 'damage' ? {n: value.n, target: value.target, src: value.src, combat: value.combat}
        : event === 'createToken' ? value.slice() : value;
      const counterCard = operation.counterEffect?.subject === 'self' ? source : operation.counterEffect ? value.target : null;
      if (counterCard) before.counterValue = counterCard.counters[operation.counterEffect.counter] || 0;
      const result = await replacement.run(...args);
      journal.push({event, before, after: Array.isArray(result) ? result.slice() : result,
        ...(counterCard ? {afterCounterValue: counterCard.counters[operation.counterEffect.counter] || 0} : {})});
      return result;
    }};
  });
}

function recordControllers(MTG, context, role) {
  const choices = [];
  for (const player of [context.a, context.b]) {
    if (role === 'ai' && !(player.controller instanceof MTG.AIController)) player.controller = new MTG.AIController(player, {difficulty: 'hard', style: 'balanced'});
    const decide = player.controller.decide.bind(player.controller);
    player.controller.decide = async (game, query) => {
      const result = await decide(game, query);
      if (game === context.game && ['replacementOrder', 'tokenReplacementOrder'].includes(query.aiHint?.kind)) choices.push({player, query, result});
      return result;
    };
  }
  return choices;
}

function assertTokenTransform(MTG, operation, row, label) {
  const matching = row.before.filter(spec => !operation.tokenType || definitionOf(MTG, spec).types.includes(operation.tokenType));
  if (operation.factor) {
    assert.equal(row.after.length, row.before.length + matching.length * (operation.factor - 1), label + ': exact token multiplication');
    for (const spec of new Set(row.before)) {
      const before = row.before.filter(value => value === spec).length;
      const multiplier = matching.includes(spec) ? operation.factor : 1;
      assert.equal(row.after.filter(value => value === spec).length, before * multiplier, label + ': each proposed token keeps its definition');
    }
  } else {
    assert.equal(row.after.length, row.before.length + 1, label + ': one additional token per batch');
    for (const spec of new Set(row.before)) assert.ok(row.after.filter(value => value === spec).length >= row.before.filter(value => value === spec).length, label + ': proposed tokens are retained');
    const printed = operation.token || MTG.TOKENS[operation.tokenKey];
    const added = definitionOf(MTG, row.after.at(-1));
    assert.equal(added.name, printed.name, label + ': correct additional token name');
    assert.deepEqual(Array.from(added.types), Array.from(printed.types), label + ': correct additional token types');
    for (const subtype of printed.subtypes || []) assert.ok(added.subtypes.includes(subtype), label + ': correct token subtype');
    if (printed.power !== undefined) assert.equal(String(added.power), String(printed.power));
    if (printed.toughness !== undefined) assert.equal(String(added.toughness), String(printed.toughness));
  }
}

export async function replacementProof(MTG, entry, operation, role, h) {
  assert.equal(operation.kind, 'v8-replacement');
  const label = entry.raw.name + '/' + role + '/replacement';
  const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'});
  const {game, a, b} = ctx;
  h.assertControllerRole(MTG, ctx, label);
  const choices = recordControllers(MTG, ctx, role);
  for (const player of [a, b]) { h.fund(player, 100); h.fillLibrary(MTG, player, 40); }
  h.stageCardCosts(MTG, ctx, entry);
  const aura = entry.implementation.find(item => item.kind === 'aura-target');
  if (aura) h.stageGenericTarget(MTG, ctx, {what: aura.what.replace(/ you control$/, ''), controller: 'you'}, 'replacement-aura');
  for (const other of entry.implementation) for (const [index, target] of (other.targets || []).entries()) {
    if (target.zone !== 'stack') h.stageGenericTarget(MTG, ctx, target, 'replacement-entry-' + index);
  }
  const source = h.zoneCard(MTG, a, entry.raw.name, 'hand');
  if (source.is('Land')) assert.equal(await game.playLand(a, source), true, label + ': actual land play');
  else assert.equal(await game.castSpell(a, source, {from: 'hand', xVal: 3}), true, label + ': actual paid cast');
  await h.resolveAll(game);
  assert.equal(source.zone, 'battlefield', label + ': original permanent resolves');
  if ((operation.source?.subject === 'attached' || operation.recipient?.subject === 'attached') && !source.attachedTo) {
    h.stageGenericTarget(MTG, ctx, {what: 'creature', controller: 'you'}, 'replacement-equipment-host');
    const action = game.activatableList(a).find(row => row.card === source && row.equip);
    assert.ok(action, label + ': legal equip action');
    assert.equal(await game.activateAbility(a, action), true, label + ': pay the real equip cost');
    await h.resolveAll(game);
  }
  const replacement = game.replacers(operation.event).find(row => row.src === source && sameOperation(row.oracleOperation, operation));
  assert.ok(replacement?.applies, label + ': compiled pure applicability predicate');
  const journal = [];
  observeReplacement(game, source, operation, journal);
  let checks = 3;

  if (operation.event === 'damage') {
    let origin;
    const from = operation.source;
    if (from.subject === 'self') origin = source;
    else if (from.subject === 'attached') origin = game.byIid(source.attachedTo);
    else {
      origin = asCard(h.stageGenericTarget(MTG, ctx, {...from.filter, controller: from.controller === 'opponent' ? 'opponent' : 'you'}, 'replacement-origin'));
      if (!origin.is('Instant') && !origin.is('Sorcery') && origin.zone !== 'battlefield') await game.move(origin, 'battlefield', {ctrl: origin.ctrl});
    }
    const to = operation.recipient;
    const target = to.subject === 'self' ? source : to.subject === 'attached' ? game.byIid(source.attachedTo)
      : to.players ? to.players === 'opponent' ? b : a : asCard(h.stageGenericTarget(MTG, ctx, to.permanents, 'replacement-recipient'));
    assert.ok(origin && target, label + ': damage objects');
    const n = Math.max(1, Math.min(operation.maxAmount === undefined ? Infinity : Math.max(1, operation.maxAmount - 1), Math.max(5, operation.minAmount || 0, (operation.transform.set || 0) + 2, -(operation.transform.add || 0) + 2)));
    const data = {src: origin, target, n, combat: operation.combat === true, noncombat: operation.combat !== true};
    if (operation.requiresCounter && !source.counters[operation.requiresCounter]) {
      assert.equal(replacement.applies(game, data, source), false, label + ': the counter condition can be false');
      game.addCounters(source, operation.requiresCounter, 3);
    }
    assert.equal(replacement.applies(game, data, source), true, label + ': matching damage event');
    assert.equal(replacement.applies(game, {...data, n: 0}, source), false, label + ': no replacement of zero damage');
    if (operation.combat !== undefined) assert.equal(replacement.applies(game, {...data, combat: !data.combat, noncombat: data.combat}, source), false, label + ': wrong combat kind');
    if (operation.minAmount > 1) assert.equal(replacement.applies(game, {...data, n: operation.minAmount - 1}, source), false, label + ': below threshold');
    if (operation.maxAmount) assert.equal(replacement.applies(game, {...data, n: operation.maxAmount + 1}, source), false, label + ': above threshold');
    if (from.subject || from.controller && from.controller !== 'any') {
      const wrong = new MTG.CardInst(origin.def, origin.ctrl === a ? b : a);
      assert.equal(replacement.applies(game, {...data, src: wrong}, source), false, label + ': wrong source identity or controller');
    }
    if (to.subject || !to.players || to.players !== 'any') {
      const wrong = to.players === 'you' ? b : a;
      assert.equal(replacement.applies(game, {...data, target: wrong}, source), false, label + ': wrong recipient');
    }
    assert.equal(await game.damageAny(origin, target, 0), 0, label + ': zero damage engine path');
    assert.equal(journal.length, 0, label + ': no zero-damage execution');
    const ordering = operation.maxAmount !== 1;
    if (ordering) h.permanent(MTG, game, a, h.fixtureDefinition('Oracle replacement ordering probe', ['Enchantment'], {replace: [{
      event: 'damage', applies: (g, event) => event.src === origin && event.target === target && event.n > 0,
      run: (g, event) => event.n + 1,
    }]}));
    const events = [], emit = game.emit.bind(game);
    game.emit = async (event, payload) => { if (['damageToPlayer', 'dealtDamage'].includes(event) && payload.src === origin) events.push(payload); return emit(event, payload); };
    const dealt = await game.damageAny(origin, target, n, {combat: data.combat, deferSBA: true});
    assert.equal(journal.length, 1, label + ': original replacement selected once');
    assert.equal(journal[0].after, arithmeticExpected(journal[0].before.n, operation.transform), label + ': independent damage arithmetic');
    if (operation.counterEffect) {
      const effect = operation.counterEffect, row = journal[0];
      const amount = effect.n === 'damage' ? row.before.n : effect.n === 'prevented' ? row.before.n - row.after : effect.n;
      assert.equal(row.afterCounterValue, effect.operation === 'remove' ? Math.max(0, row.before.counterValue - amount) : row.before.counterValue + amount, label + ': exact separate counter instruction');
    }
    const affected = target instanceof MTG.Player ? target : target.ctrl;
    if (ordering) assert.ok(choices.some(row => row.player === affected && row.query.aiHint?.event === 'damage'), label + ': affected controller selects ordering');
    if (dealt > 0) assert.ok(events.some(event => event.n === dealt && (event.target || event.player) === target), label + ': final amount reaches the actual damage event');
    else assert.equal(events.length, 0, label + ': zero resulting damage emits no damage event');
    checks += 8;
  } else if (operation.event === 'lifegain') {
    assert.equal(replacement.applies(game, 3, a, source), true, label + ': own gain applies');
    assert.equal(replacement.applies(game, 3, b, source), false, label + ': other player does not apply');
    assert.equal(replacement.applies(game, 0, a, source), false, label + ': zero gain does not apply');
    assert.equal(await game.gainLife(a, 0, source), 0);
    assert.equal(journal.length, 0);
    h.permanent(MTG, game, a, h.fixtureDefinition('Oracle life ordering probe', ['Enchantment'], {replace: [{event: 'lifegain', applies: (g, n, player) => n > 0 && player === a, run: (g, n) => n + 1}]}));
    const before = a.life, amount = await game.gainLife(a, 3, source);
    assert.equal(journal.length, 1, label + ': original life replacement selected once');
    assert.equal(journal[0].after, arithmeticExpected(journal[0].before, operation.transform), label + ': independent life arithmetic');
    assert.equal(a.life - before, amount, label + ': actual gain');
    assert.ok(choices.some(row => row.player === a && row.query.aiHint?.event === 'lifegain'), label + ': gaining player chooses');
    checks += 8;
  } else if (operation.event === 'createToken') {
    const key = operation.tokenType === 'Artifact' ? 'food' : 'beast33';
    assert.equal(replacement.applies(game, [key], a, source), true, label + ': qualifying token event');
    assert.equal(replacement.applies(game, [key], b, source), false, label + ': other controller');
    assert.equal(replacement.applies(game, [], a, source), false, label + ': empty batch');
    if (operation.tokenType) assert.equal(replacement.applies(game, [operation.tokenType === 'Artifact' ? 'beast33' : 'food'], a, source), false, label + ': wrong token type');
    assert.equal((await game.makeTokens(key, a, {n: 0})).length, 0);
    assert.equal(journal.length, 0);
    h.permanent(MTG, game, a, h.fixtureDefinition('Oracle token ordering probe', ['Enchantment'], {replace: [{event: 'createToken', applies: (g, defs) => defs.length > 0, run: (g, defs) => [...defs, 'treasure']}]}));
    const made = await game.makeTokens(key, a, {n: 2});
    assert.equal(journal.length, 1, label + ': original token replacement selected once');
    assertTokenTransform(MTG, operation, journal[0], label);
    assert.ok(made.length >= 2 && made.every(card => card.isToken && card.ctrl === a && card.zone === 'battlefield'), label + ': actual controlled token permanents');
    assert.ok(choices.some(row => row.player === a && row.query.aiHint?.kind === 'tokenReplacementOrder'), label + ': token controller chooses');
    checks += 8;
  } else assert.fail(label + ': unsupported replacement event');

  await h.resolveAll(game);
  assert.equal(game.pendingTriggers.length, 0, label + ': triggers settle');
  assert.equal(game.stack.length, 0, label + ': stack settles');
  assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false, label + ': no AI fallback');
  if (role === 'ai') for (const row of choices) assert.ok(row.player.controller instanceof MTG.AIController, label + ': ordering used the real local AI');
  return checks + 3;
}

async function reachUntapBoundary(game, player) {
  const boundary = new Error('completed actual untap step');
  const emit = game.emit.bind(game);
  game.emit = async (event, data) => {
    if (event === 'upkeep' && data.player === player) throw boundary;
    return emit(event, data);
  };
  game.turnPlayer = player;
  try { await assert.rejects(game.runTurn(), error => error === boundary); }
  finally { game.emit = emit; }
  assert.equal(game.phase, 'upkeep');
}

// Additional behavior proof for static untap flags. The same original card
// is paid, resolved and left intact while runTurn performs the real turn
// action. The helper never changes an imported definition or its statics.
export async function untapProof(MTG, entry, operation, role, h) {
  assert.ok(operation.kind === 'generic-static' && (operation.cantUntap || operation.optionalUntap) || operation.kind === 'attachment-grant' && operation.skipUntap);
  const label = entry.raw.name + '/' + role + '/untap';
  const variants = operation.optionalUntap && role === 'human' ? ['yes', 'no'] : [null];
  let checks = 0;
  for (const choice of variants) {
    const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'});
    const {game, a, b} = ctx;
    h.assertControllerRole(MTG, ctx, label);
    const decisions = [];
    for (const player of [a, b]) {
      if (role === 'ai' && !(player.controller instanceof MTG.AIController)) player.controller = new MTG.AIController(player, {difficulty: 'hard', style: 'balanced'});
      const decide = player.controller.decide.bind(player.controller);
      player.controller.decide = async (g, query) => {
        const answer = choice && query.aiHint?.kind === 'optionalUntap' ? choice : await decide(g, query);
        if (g === game && query.aiHint?.kind === 'optionalUntap') decisions.push({player, query, answer});
        return answer;
      };
      h.fund(player, 100); h.fillLibrary(MTG, player, 40);
    }
    h.stageCardCosts(MTG, ctx, entry);
    const aura = entry.implementation.find(item => item.kind === 'aura-target');
    if (aura) h.stageGenericTarget(MTG, ctx, {what: aura.what.replace(/ you control$/, ''), controller: 'you'}, 'untap-aura-host');
    for (const other of entry.implementation) for (const [index, target] of (other.targets || []).entries()) if (target.zone !== 'stack') h.stageGenericTarget(MTG, ctx, target, 'untap-entry-' + index);
    const source = h.zoneCard(MTG, a, entry.raw.name, 'hand');
    if (source.is('Land')) assert.equal(await game.playLand(a, source), true, label + ': real land play');
    else assert.equal(await game.castSpell(a, source, {from: 'hand', xVal: 3}), true, label + ': real paid cast');
    await h.resolveAll(game);
    assert.equal(source.zone, 'battlefield');
    let targets;
    if (operation.kind === 'attachment-grant') {
      if (!source.attachedTo) {
        h.stageGenericTarget(MTG, ctx, {what: 'creature', controller: 'you'}, 'untap-equipment-host');
        const action = game.activatableList(a).find(row => row.card === source && row.equip);
        assert.ok(action, label + ': legal equip');
        assert.equal(await game.activateAbility(a, action), true);
        await h.resolveAll(game);
      }
      targets = [game.byIid(source.attachedTo)];
    } else if (operation.scope === 'self') targets = [source];
    else if (operation.scope === 'filtered-permanents') {
      targets = operation.filters.map((filter, index) => asCard(h.stageGenericTarget(MTG, ctx, {...filter, controller: filter.controller === 'any' ? 'you' : filter.controller}, 'untap-filter-' + index)));
    } else {
      const owner = operation.scope === 'opponent-creatures' ? b : a;
      targets = [h.permanent(MTG, game, owner, h.fixtureDefinition('Ordinary affected creature', ['Creature'], {power: '3', toughness: '20'}))];
    }
    assert.ok(targets.length && targets.every(Boolean), label + ': controlled affected permanents');
    ctx.proofLockedTargets = targets;
    for (const target of targets) {
      if (operation.condition) stageCondition(MTG, ctx, operation.condition, operation.conditionSubject === 'affected' ? target : source, h);
      game.tap(target);
      game.recalc();
      const optional = !!operation.optionalUntap;
      assert.equal(!!target.cur[optional ? 'optionalUntap' : 'cantUntap'], true, label + ': exact static flag applies to the staged permanent');
      if (optional) assert.equal(target.cur.cantUntap, false, label + ': permission fixture has no independent prohibition');
      const controller = target.ctrl;
      const before = decisions.length;
      await reachUntapBoundary(game, controller);
      const selected = decisions.slice(before).filter(row => row.query.aiHint.card === target);
      if (optional) {
        assert.equal(selected.length, 1, label + ': one untap choice');
        assert.equal(selected[0].player, controller, label + ': actual controller chooses');
        assert.ok(['yes', 'no'].includes(selected[0].answer));
        assert.equal(target.tapped, selected[0].answer === 'no', label + ': real untap action follows the chosen answer');
        if (role === 'ai') assert.ok(controller.controller instanceof MTG.AIController, label + ': real local AI made the choice');
      } else {
        assert.equal(target.tapped, true, label + ': prohibition prevents the actual turn untap');
        assert.equal(selected.length, 0, label + ': forbidden untap produces no optional choice');
        assert.equal(game.untap(target), true, label + ': an ordinary untap effect remains legal outside the restricted turn action');
      }
      // Stun replaces only an attempted untap. A prohibition or a voluntary
      // decline must leave the counter untouched.
      game.tap(target);
      game.addCounters(target, 'stun', 1);
      await h.resolveAll(game);
      const offset = decisions.length;
      await reachUntapBoundary(game, controller);
      const answer = decisions.slice(offset).find(row => row.query.aiHint.card === target)?.answer;
      assert.equal(target.tapped, true, label + ': the second attempt cannot untap through a stun counter');
      assert.equal(target.counters.stun, optional && answer === 'yes' ? 0 : 1, label + ': exact stun replacement or preserved counter');
      checks += 9;
    }
    await h.resolveAll(game);
    assert.equal(game.stack.length, 0);
    assert.equal(game.pendingTriggers.length, 0);
    assert.equal((game.aiDecisionLog || []).some(row => row.fallback), false, label + ': no AI fallback');
    checks += 5;
  }
  return checks;
}

function pairingDefinition(name, options = {}) {
  return {
    name, cost: options.cost ?? null, super: options.super || ['Legendary'],
    types: options.types || ['Creature'], subtypes: options.subtypes || ['Human'],
    oracle: options.oracle || '', kws: [], power: options.power || '2', toughness: options.toughness || '2',
  };
}

function pairingMate(source, operation) {
  if (operation.variant === 'background') return pairingDefinition('Oracle Proof Background', {types: ['Enchantment'], subtypes: ['Background']});
  if (operation.variant === 'doctorsCompanion') return pairingDefinition('Oracle Proof Doctor', {subtypes: ['Time', 'Lord', 'Doctor']});
  if (operation.variant === 'named') return pairingDefinition('Oracle Proof Named Partner', {oracle: operation.label === 'Friends forever' ? 'Friends forever' : 'Partner—' + operation.label});
  if (operation.variant === 'with') return pairingDefinition(operation.partnerName, {oracle: 'Partner with ' + source.name});
  return pairingDefinition('Oracle Proof Partner', {oracle: 'Partner'});
}

// Pairing markers have no battlefield effect except Partner with. Their
// executable authority is the same loader used by deck setup: prove the
// exact tag, legal pair, invalid mate and physical two-command-zone build.
export async function commanderPairingProof(MTG, entry, operation, role, h) {
  assert.equal(operation.kind, 'commander-pairing');
  const label = entry.raw.name + '/' + role + '/commander-pairing';
  const source = MTG.DEFS[entry.raw.name];
  assert.ok(source, label + ': original imported definition');
  const tag = MTG.cmdTag(source);
  assert.equal(tag.kind, operation.variant, label + ': loader recognizes the exact compiled variant');
  if (operation.variant === 'named') assert.equal(tag.label, operation.label, label + ': exact shared label');
  if (operation.variant === 'with') assert.equal(tag.with, operation.partnerName, label + ': exact printed partner name');
  const metadata = MTG.SCRIPTS[entry.raw.name]?.oracleCommanderPairing;
  assert.equal(JSON.stringify(metadata), JSON.stringify({variant: operation.variant, ...(operation.label ? {label: operation.label} : {}), ...(operation.partnerName ? {partnerName: operation.partnerName} : {})}), label + ': runtime descriptor metadata');

  const mate = pairingMate(source, operation);
  const wrong = pairingDefinition('Oracle Proof Wrong Mate');
  const defs = {...MTG.DEFS, [mate.name]: mate, [wrong.name]: wrong};
  assert.equal(MTG.canPartner(source, mate), true, label + ': exact loader pairing');
  assert.equal(MTG.canPartner(source, wrong), false, label + ': unrelated legendary creature is rejected');
  assert.equal(MTG.canPartner(source, source), false, label + ': one physical name cannot pair with itself');
  if (operation.variant === 'named') {
    const mismatch = pairingDefinition('Oracle Proof Label Mismatch', {oracle: 'Partner—' + operation.label + ' mismatch'});
    assert.equal(MTG.canPartner(source, mismatch), false, label + ': named partner labels are exact');
  }
  if (operation.variant === 'with') {
    const mismatch = pairingDefinition(operation.partnerName + ' mismatch');
    assert.equal(MTG.canPartner(source, mismatch), false, label + ': Partner with name is exact');
  }
  if (operation.variant === 'background') {
    const malformed = pairingDefinition('Oracle Proof Nonlegendary Background', {super: [], types: ['Enchantment'], subtypes: ['Background']});
    assert.equal(MTG.canPartner(source, malformed), false, label + ': Background mate must be a legendary enchantment');
  }
  if (operation.variant === 'doctorsCompanion') {
    const changelingDoctor = pairingDefinition('Oracle Proof Extra Doctor', {subtypes: ['Time', 'Lord', 'Doctor', 'Alien']});
    assert.equal(MTG.canPartner(source, changelingDoctor), false, label + ': the Doctor has no extra creature types');
  }

  const eligible = MTG.canBeCommander(source, {commander: '', trustedFaceCommander: false});
  const singleDeck = {name: label + '/single', commander: source.name, trustedFaceCommander: false, cards: [{n: 1, name: source.name}]};
  assert.equal(MTG.validateCommanders(singleDeck, [source.name], defs).ok, eligible, label + ': single commander follows ordinary eligibility');
  const pairDeck = {name: label + '/pair', commander: source.name, trustedFaceCommander: false, cards: [{n: 1, name: source.name}, {n: 1, name: mate.name}]};
  const pair = MTG.validateCommanders(pairDeck, [source.name, mate.name], defs);
  assert.equal(pair.ok, eligible, label + ': pairing never bypasses source commander eligibility');
  let checks = 12;
  if (eligible) {
    const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'});
    h.assertControllerRole(MTG, ctx, label);
    const selected = role === 'ai' ? MTG.randomCommanders(pairDeck, () => 0, defs) : [source.name, mate.name];
    assert.deepEqual(new Set(selected), new Set([source.name, mate.name]), label + ': real commander selection chooses the legal pair');
    const game = new MTG.Game({seed: 88021, paced: false});
    const player = game.addPlayer('Pair proof', pairDeck, ctx.a.controller, role === 'ai');
    game.buildDeck(player, pairDeck, defs, selected);
    assert.deepEqual(new Set(player.commanders.map(card => card.name)), new Set([source.name, mate.name]), label + ': both physical cards start as commanders');
    assert.equal(player.command.length, 2, label + ': both commanders are in the command zone');
    assert.ok(player.commanders.every(card => card.commander && card.cmdCasts === 0), label + ': independent commander state');
    checks += 5;
  }

  if (operation.variant === 'with') {
    const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'});
    h.assertControllerRole(MTG, ctx, label + '/search');
    const {game, a} = ctx;
    const sourceCard = h.permanent(MTG, game, a, entry.raw.name);
    const searched = new MTG.CardInst(mate, a); searched.zone = 'library'; a.library.push(searched);
    for (let index = 0; index < 3; index++) h.zoneCard(MTG, a, 'Forest', 'library');
    const trigger = sourceCard.def.triggers.find(candidate => candidate.desc === 'Partner with ' + operation.partnerName);
    assert.ok(trigger, label + ': compiled Partner with ETB trigger');
    assert.deepEqual(new Set(game.legalTargets(trigger.targets[0], sourceCard, a)), new Set(game.alivePlayers()), label + ': any player is a legal search recipient');
    const decisions = [];
    const decide = a.controller.decide.bind(a.controller);
    a.controller.decide = async (currentGame, query) => {const answer = await decide(currentGame, query); if (query.aiHint?.kind === 'partnerSearch') decisions.push({query, answer}); return answer;};
    await trigger.run({g: game, src: sourceCard, you: a, targets: [a]});
    assert.equal(searched.zone, 'hand', label + ': exact named card moves from the chosen player library');
    assert.ok(a.hand.includes(searched), label + ': chosen player receives the card');
    assert.equal(decisions.length, 1, label + ': chosen player receives one optional search decision');
    assert.equal(decisions[0].answer, 'yes', label + ': controlled proof accepts the exact available partner');
    if (role === 'ai') assert.ok(a.controller instanceof MTG.AIController, label + ': real local AI made the Partner with choice');
    checks += 7;
  }
  return checks;
}

// Bestow has two resolution paths that ordinary Aura and creature proofs do
// not exercise. Every imported card is cast with its own printed alternative
// cost and a physical target; a second fresh game removes that target before
// resolution and proves that the same spell continues as its creature form.
export async function bestowProof(MTG, entry, operation, role, h) {
  assert.equal(operation.kind, 'mechanic-bestow');
  assert.equal(operation.contract, 'mechanic-bestow');
  const label = entry.raw.name + '/' + role + '/bestow';

  const prepare = () => {
    const ctx = h.gameFor(MTG, [h.decision(), h.decision()], {ai: role === 'ai'});
    const {game, a, b} = ctx;
    h.assertControllerRole(MTG, ctx, label);
    game.priorityRound = async () => {};
    for (const player of [a, b]) { h.fund(player, 100); h.fillLibrary(MTG, player, 40); }
    h.stageCardCosts(MTG, ctx, entry);
    const host = asCard(h.stageGenericTarget(MTG, ctx, {what: 'creature', controller: 'you'}, 'bestow-host'));
    assert.ok(host instanceof MTG.CardInst && host.zone === 'battlefield' && host.is('Creature'), label + ': controlled legal creature host');
    const decisions = [];
    const decide = a.controller.decide.bind(a.controller);
    a.controller.decide = async (currentGame, query) => {
      const answer = await decide(currentGame, query);
      if (currentGame === game && query.type === 'chooseTargets') decisions.push({query, answer});
      return answer;
    };
    return {...ctx, host, decisions};
  };

  const paid = prepare(), source = h.zoneCard(MTG, paid.a, entry.raw.name, 'hand');
  const actions = paid.game.castableList(paid.a).filter(candidate => candidate.card === source);
  assert.ok(actions.some(candidate => !candidate.alt), label + ': ordinary creature cast remains available');
  const action = actions.find(candidate => candidate.alt?.bestow && candidate.alt.altCostStr === operation.cost);
  assert.ok(action, label + ': exact Bestow alternative is generated');
  const manaBefore = Object.values(paid.a.pool).reduce((sum, n) => sum + n, 0);
  assert.equal(await paid.game.castSpell(paid.a, source, {from: action.from, alt: action.alt, xVal: 3}), true, label + ': actual paid Bestow cast');
  const spell = paid.game.stack.find(candidate => candidate.kind === 'spell' && candidate.card === source);
  assert.ok(spell, label + ': physical spell remains on Stack');
  assert.equal(spell.targets.length, 1); const chosenHost = spell.targets[0];
  assert.ok(chosenHost instanceof MTG.CardInst && chosenHost.zone === 'battlefield' && chosenHost.is('Creature'), label + ': actual legal creature target');
  assert.equal(source.is('Creature'), false, label + ': bestowed spell is not a creature spell');
  assert.equal(source.is('Enchantment'), true); assert.equal(source.hasSub('Aura'), true);
  assert.equal(paid.game.isCreatureSpell(spell), false);
  assert.equal(paid.game.stackSpellManaValue(spell), MTG.mv(entry.raw.cost || '', spell.x || 0), label + ': printed mana value survives the alternative cost');
  assert.ok(Object.values(paid.a.pool).reduce((sum, n) => sum + n, 0) < manaBefore, label + ': mana was actually paid');
  assert.ok(paid.decisions.some(row => row.answer?.flat?.().includes(chosenHost) || row.answer?.includes?.(chosenHost)), label + ': seat controller selected the physical host');
  await h.resolveAll(paid.game);
  assert.equal(source.zone, 'battlefield'); assert.equal(source.is('Creature'), false); assert.equal(source.hasSub('Aura'), true);
  assert.equal(source.attachedTo, chosenHost.iid); assert.ok(chosenHost.attachments.includes(source.iid));
  assert.equal((paid.game.aiDecisionLog || []).some(row => row.fallback), false, label + ': no fallback decision');
  if (role === 'ai') assert.ok(paid.a.controller instanceof MTG.AIController, label + ': real local AI made the target decision');

  const failed = prepare(), failedSource = h.zoneCard(MTG, failed.a, entry.raw.name, 'hand');
  const failedAction = failed.game.castableList(failed.a).find(candidate => candidate.card === failedSource && candidate.alt?.bestow && candidate.alt.altCostStr === operation.cost);
  assert.ok(failedAction, label + ': second exact Bestow action');
  assert.equal(await failed.game.castSpell(failed.a, failedSource, {from: failedAction.from, alt: failedAction.alt, xVal: 3}), true);
  const failedSpell = failed.game.stack.find(candidate => candidate.kind === 'spell' && candidate.card === failedSource);
  assert.ok(failedSpell && failedSpell.targets[0] instanceof MTG.CardInst);
  await failed.game.move(failedSpell.targets[0], 'graveyard');
  await h.resolveAll(failed.game);
  assert.equal(failedSource.zone, 'battlefield', label + ': spell does not fizzle');
  assert.equal(failedSource.is('Creature'), true); assert.equal(failedSource.hasSub('Aura'), false); assert.equal(failedSource.attachedTo, null);
  assert.equal(failedSource.meta?.oracleBestowed, undefined);
  assert.equal((failed.game.aiDecisionLog || []).some(row => row.fallback), false);
  return 27;
}
