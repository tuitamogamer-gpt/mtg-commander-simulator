import assert from 'node:assert/strict';
import { stageCount, countValue, matchesTarget } from './oracle-v5-proof.mjs';

const actions = new Set(['player-counter', 'group-sequence', 'delayed-object', 'remove-from-combat', 'skip-next-untap', 'change-characteristics-v8', 'sacrifice-target-v8']);
const worlds = new WeakMap(), installed = new WeakSet();
const flat = value => [value].flat().filter(Boolean);
const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
const attackingToken = effect => effect.action === 'token-inline' && effect.attacking === true;

function install(MTG, context, h) {
  let state = worlds.get(context.game);
  if (!state) {
    state = { context, h, rows: [], frozen: [], tokenRows: [], sacrifices: [], resolving: null }; worlds.set(context.game, state);
    const emit = context.game.emit;
    context.game.emit = async function(event, data, ...rest) {
      if (event === 'sacrificed') state.sacrifices.push({ card: data.card, player: data.player, snap: data.snap });
      return emit.call(this, event, data, ...rest);
    };
    const resolve = context.game.resolveTop;
    context.game.resolveTop = async function(...args) {
      const object = this.stack.at(-1);
      for (const row of state.rows) if (row.delayed && object && row.delayed.entry.run === object.run) row.delayed.stackObject = object;
      const previous = state.resolving; state.resolving = object;
      try { return await resolve.apply(this, args); } finally { state.resolving = previous; }
    };
    const makeTokens = context.game.makeTokens;
    context.game.makeTokens = async function(spec, player, options = {}) {
      const row = { source: state.resolving?.srcCard || state.resolving?.card, spec, player, options,
        combat: !!this.combat, attackingPlayer: this.turnPlayer === player, destinations: [...this.players.filter(other => other !== player && !other.lost),
          ...this.bf().filter(card => card.is('Planeswalker') && card.ctrl !== player && !card.ctrl.lost)] };
      const made = await makeTokens.call(this, spec, player, options);
      row.made = made.map(card => ({ card, version: card.zoneVersion, attacking: card.attacking, tapped: card.tapped,
        sick: card.sick, creature: card.is('Creature'), inCombat: !!this.combat?.attackers.includes(card) }));
      state.tokenRows.push(row); return made;
    };
  }
  context.v8EffectWitnesses = state.rows;
  context.v8FrozenObjects = state.frozen;
  state.h = h;
  if (installed.has(MTG.OracleV8Effects)) return;
  installed.add(MTG.OracleV8Effects);
  const original = MTG.OracleV8Effects.run;
  MTG.OracleV8Effects.run = async function(ctx, effect, helpers) {
    const state = worlds.get(ctx.g);
    if (!state || !actions.has(effect.action)) return original.call(this, ctx, effect, helpers);
    const knownCards = new Set();
    const snapshot = () => {
      for (const card of [ctx.src, ...ctx.g.bf(), ...ctx.g.players.flatMap(player => ['hand', 'graveyard', 'exile', 'library'].flatMap(zone => player[zone]))]) knownCards.add(card);
      const value = state.h.genericProofSnapshot(state.context, [...knownCards]);
      value.untilEffects = ctx.g.untilEffects.slice(); value.oracleX = ctx.x || 0;
      value.delayed = ctx.g.delayed.slice(); value.attackers = ctx.g.combat?.attackers.slice() || [];
      for (const [player, row] of value.players) { row.lost = player.lost; row.turnState = { ...player.turnState }; row.exileCards = player.exile.slice(); }
      for (const [card, row] of value.cards) {
        row.super = (card.cur?.super || card.def?.super || []).slice();
        row.unblockable = !!card.cur?.unblockable; row.cantBlock = !!card.cur?.cantBlock;
        row.blockedBy = (card.blockedBy || []).slice(); row.wasBlocked = !!card.wasBlocked; row.regenShield = card.regenShield || 0;
        row.isToken = !!card.isToken; row.owner = card.owner;
        row.noUntapOnce = !!card.meta?.noUntapOnce;
        row.cantSacrifice = !!card.cur?.cantSacrifice;
      }
      return value;
    };
    const row = { effect, ctx, source: ctx.src, targets: (ctx.targets || []).slice(), createdTokens: (ctx._oracleCreatedTokens || []).map(item => ({...item})), before: snapshot(), children: [] };
    if (effect.action === 'sacrifice-target-v8') {
      row.targetLocks = (ctx._oracleTargetControllers?.[effect.target] || []).map(entry => ({ ...entry }));
      row.sacrificeStart = state.sacrifices.length;
    }
    state.rows.push(row);
    try {
      return await original.call(this, ctx, effect, { ...helpers, effects: async (childCtx, effects) => {
        const child = { ctx: childCtx, effects, before: snapshot(), targets: childCtx.targets.slice() };
        row.children.push(child); const result = await helpers.effects(childCtx, effects); child.after = snapshot(); return result;
      } });
    } finally {
      row.after = snapshot();
      if (effect.action === 'sacrifice-target-v8') row.sacrifices = state.sacrifices.slice(row.sacrificeStart);
      if (effect.action === 'delayed-object') {
        const added = row.after.delayed.filter(entry => !row.before.delayed.includes(entry));
        row.delayedEntries = added;
        if (added.length === 1) {
          const entry = added[0], run = entry.run;
          row.delayed = { entry, count: 0 };
          entry.run = async function(later) {
            row.delayed.count++; row.delayed.ctx = later; row.delayed.before = snapshot();
            try { return await run.call(this, later); } finally { row.delayed.after = snapshot(); }
          };
        }
      }
    }
  };
}

export function stageV8Effect(MTG, context, effect, h) {
  if (!actions.has(effect.action) && !attackingToken(effect)) return false;
  install(MTG, context, h);
  if (effect.action === 'remove-from-combat') {
    const attackers = context.game.bf().filter(card => card.attacking);
    if (attackers.length) context.game.combat = { attackers, defenders: new Map() };
  }
  if (effect.action === 'group-sequence') {
    for (const [index, filter] of effect.filters.entries()) {
      for (let n = 0; n < 2; n++) h.stageGenericTarget(MTG, context, filter, 'retained-group-' + index + '-' + n,
        effect.effects[0].action === 'untap' ? { action: 'untap' } : undefined);
    }
    for (const child of effect.effects) for (const key of ['n', 'power', 'toughness', 'multiplier']) {
      if (child[key] && typeof child[key] === 'object') stageCount(MTG, context, child[key], h);
    }
  }
  return true;
}

function objectSubjects(row) {
  const reference = row.effect.target, initial = row.before;
  const valid = (card, version) => card && initial.cards.get(card)?.zone === 'battlefield' && (version === undefined || version === null || initial.cards.get(card).zoneVersion === version);
  if (typeof reference === 'number') return flat(row.targets[reference]).filter(card => valid(card));
  if (reference === 'self') return valid(row.source, row.ctx.sourceZoneVersion) ? [row.source] : [];
  if (reference === 'event-card') {
    const card = row.ctx.oracleSourceCapture?.eventCard || row.ctx.data?.card;
    return valid(card, row.ctx.eventCardZoneVersion) ? [card] : [];
  }
  if (reference === 'created-tokens') return row.createdTokens.filter(entry => valid(entry.card, entry.zoneVersion)).map(entry => entry.card);
  if (reference === 'attached-host') {
    const source = initial.cards.get(row.source);
    return valid(row.source,row.ctx.sourceZoneVersion) ? initial.battlefield.filter(card => card.iid === row.source.attachedTo) : [];
  }
  assert.fail('Missing independent object-effect subject proof: ' + JSON.stringify(reference));
}

function value(context, row, node, snapshot) {
  if (node === undefined) return 0;
  if (typeof node === 'number') return node;
  if (node === 'X') return snapshot.oracleX;
  if (['source-stat', 'explicit-source-stat'].includes(node.kind)) {
    const capture = row.ctx.oracleSourceCapture;
    const state = snapshot.cards.get(row.source);
    return Math.max(0, capture && (state.zone !== 'battlefield' || state.zoneVersion !== capture.zoneVersion)
      ? capture.stats[node.stat] : state[node.stat]) * (node.multiply ?? 1);
  }
  if (node.kind === 'event-amount') return row.ctx.data?.n || 0;
  if (node.kind === 'turn-count') return (snapshot.players.get(row.ctx.you).turnState[node.field] || 0) * (node.multiply ?? 1);
  return countValue({ ...context, a: row.ctx.you }, row.source, node, snapshot) * (node.multiply ?? 1);
}

function playerSubjects(MTG, context, effect, row, initial) {
  const who = effect.who, targets = row.targets, you = row.ctx.you;
  if (who === 'each-player' || who === 'each-opponent') return context.game.players.filter(player => !row.before.players.get(player).lost && (who === 'each-player' || player !== you));
  if (who === 'you') return [you];
  if (typeof who === 'number') return flat(targets[who]);
  if (who === 'event-player') return flat(row.ctx.oracleSourceCapture?.eventPlayer || context.eventPlayer);
  if (who === 'event-card-controller') return flat(row.ctx.oracleSourceCapture?.eventController || context.eventController);
  if (who === 'event-card-owner') return flat((row.ctx.oracleSourceCapture?.eventCard || context.eventCard)?.owner);
  if (who?.kind === 'locked-player') return flat(targets[who.index]);
  if (who?.kind === 'target-owner') return [...new Set(flat(targets[who.index]).map(card => card.owner))];
  if (who?.kind === 'target-controller') return [...new Set(flat(targets[who.index]).map(card => {
    const old = initial.cards.get(card), current = row.before.cards.get(card);
    return old && old.zoneVersion !== current?.zoneVersion ? old.ctrl : current?.ctrl;
  }))];
  assert.fail('Missing independent player-counter subject proof: ' + JSON.stringify(who));
}

function retainFreeze(context, cards, label) {
  // Nested payment/grant proof contexts are shallow copies. Keep their future
  // untap obligations in the game witness rather than on an ephemeral copy.
  context.v8FrozenObjects = worlds.get(context.game)?.frozen || (context.v8FrozenObjects ||= []);
  for (const card of cards) if (!context.v8FrozenObjects.some(row => row.card === card && row.version === card.zoneVersion)) context.v8FrozenObjects.push({ card, version: card.zoneVersion, label });
}

export async function assertV8Effect(MTG, context, entry, effect, source, targets, damaged, before, trace, label, h) {
  if (attackingToken(effect)) {
    const row = worlds.get(context.game)?.tokenRows.find(row => !row.verified && row.source === source && row.spec?.name === effect.token.name);
    assert.ok(row, label + ': real attacking token creation is witnessed'); row.verified = true;
    for (const made of row.made) {
      if (effect.tapped) assert.equal(made.tapped, true, label + ': token enters tapped as printed');
      assert.equal(made.sick, true, label + ': entering attacking does not remove summoning sickness');
      if (!row.combat || !row.attackingPlayer || !made.creature) {
        assert.ok(!made.attacking && !made.inCombat, label + ': outside combat, a nonattacking controller, or a noncreature cannot enter attacking');
      } else {
        assert.ok(row.destinations.includes(made.attacking), label + ': each token attacks a legal player or planeswalker');
        assert.equal(made.inCombat, true, label + ': actual combat includes the new attacker');
        if (row.destinations.length > 1) {
          const choice = trace.find(item => item.query.aiHint?.kind === 'attackDestination' && item.query.aiHint.token === made.card);
          assert.ok(choice, label + ': each attacking token reaches the actual controller defender choice');
          assert.ok(choice.query.options.find(option => option.key === String(choice.result))?.target === made.attacking, label + ': actual attack destination uses the controller choice');
        }
      }
    }
    // The common token proof still checks quantity, controller, types, colors,
    // power, toughness and every printed keyword after these combat checks.
    return false;
  }
  if (!actions.has(effect.action)) return false;
  if (effect.action === 'skip-next-untap') {
    const selected = typeof effect.target === 'number' ? flat(targets[effect.target]) : effect.target === 'self' ? [source]
      : effect.target === 'event-card' ? flat(context.eventCard) : effect.target === 'attached-host' ? flat(context.game.byIid(source.attachedTo)) : [];
    assert.ok(selected.length, label + ': a printed untap restriction has an actual object');
    for (const card of selected) assert.equal(card.meta.noUntapOnce, true, label + ': the real effect installs its one-step restriction');
    retainFreeze(context, selected, label); return true;
  }
  const row = context.v8EffectWitnesses?.find(row => !row.verified && row.source === source && same(row.effect, effect));
  assert.ok(row, label + ': effect executes through the real v8 runtime'); row.verified = true;
  if (effect.action === 'sacrifice-target-v8') {
    const selected = flat(row.targets[effect.target]);
    const expected = [...new Set(row.targetLocks.filter(lock => {
      const old = row.before.cards.get(lock.subject);
      return selected.includes(lock.subject) && old?.zone === 'battlefield' && old.zoneVersion === lock.zoneVersion && old.ctrl === row.ctx.you && !old.cantSacrifice;
    }).map(lock => lock.subject))];
    assert.deepEqual(row.sacrifices.map(event => event.card), expected, label + ': only the originally selected legal incarnation is sacrificed');
    for (const card of expected) {
      assert.ok(row.sacrifices.some(event => event.card === card && event.player === row.ctx.you), label + ': the controlling player actually sacrifices it');
      const old = row.before.cards.get(card), after = row.after.cards.get(card);
      assert.ok(after.zone !== 'battlefield' || after.zoneVersion !== old.zoneVersion, label + ': sacrifice moves the selected incarnation off the battlefield');
    }
    return true;
  }
  if(effect.action==='change-characteristics-v8'){
    const affected=objectSubjects(row),records=row.after.untilEffects.filter(record=>!row.before.untilEffects.includes(record)&&record.kind==='oracleCharacteristics');
    assert.ok(affected.length,label+': actual characteristic-change subject');
    assert.equal(records.length,affected.length,label+': exactly the selected incarnations change');
    for(const card of affected){
      const old=row.before.cards.get(card),after=row.after.cards.get(card),record=records.find(record=>record.iid===card.iid);
      assert.ok(record,label+': each selected object receives the effect');
      assert.equal(record.zoneVersion,old.zoneVersion);assert.equal(record.expires,'eot');
      assert.equal(record.power,undefined);assert.equal(record.toughness,undefined);
      assert.deepEqual(after.types,old.types,label+': card types are preserved');
      if(effect.characteristic==='color'){
        const color=effect.choose?record.colors[0]:null;
        if(effect.choose)assert.ok(trace.some(item=>item.query.aiHint?.kind==='oracleColorChange'&&item.result===color&&item.query.options.some(option=>option.key===color)),label+': actual controller chooses a legal color');
        const expected=[...new Set([...(effect.retain?old.colors:[]),...(effect.choose?[color]:effect.colors)])].sort();
        assert.deepEqual([...after.colors].sort(),expected,label+': exact replacement or added colors');
        assert.deepEqual(after.subtypes,old.subtypes,label+': a color change preserves subtypes');
      }else{
        const subtype=record.creatureType;
        assert.ok(MTG.CREATURE_SUBTYPES.has(subtype));
        assert.ok(trace.some(item=>item.query.aiHint?.kind==='chooseType'&&item.result===subtype&&item.query.options.some(option=>option.key===subtype)),label+': actual controller chooses a legal creature type');
        const expected=[...new Set([...old.subtypes.filter(type=>effect.retain||!MTG.CREATURE_SUBTYPES.has(type)),subtype])].sort();
        assert.deepEqual([...after.subtypes].sort(),expected,label+': exact replacement or added creature type');
        assert.deepEqual(after.colors,old.colors,label+': a subtype change preserves colors');
      }
    }
    return true;
  }
  if (effect.action === 'delayed-object') {
    assert.equal(row.delayedEntries.length, 1, label + ': one printed delayed trigger is installed');
    const delayed = row.delayed.entry; row.delayed.label = label; row.delayed.subjects = objectSubjects(row);
    assert.equal(delayed.on, effect.on, label + ': exact future step'); assert.ok(delayed.src === source, label + ': original source'); assert.ok(delayed.ctrl === row.ctx.you, label + ': original controller');
    assert.equal(delayed.targets, undefined, label + ': delayed object reference is not a new target');
    for (const card of row.delayed.subjects) {
      assert.equal(row.after.cards.get(card).zone, row.before.cards.get(card).zone, label + ': delayed instruction does not move an object immediately');
      assert.deepEqual(row.after.cards.get(card).counters, row.before.cards.get(card).counters, label + ': delayed counters wait for their step');
    }
    return true;
  }
  if (effect.action === 'remove-from-combat') {
    const affected = objectSubjects(row).filter(card => row.before.cards.get(card).types.includes('Creature'));
    assert.ok(affected.length, label + ': an actual creature is affected');
    for (const card of affected) {
      const old = row.before.cards.get(card), current = row.after.cards.get(card);
      assert.ok(old.attacking || old.blocking, label + ': actual combat participant was staged');
      assert.equal(current.attacking === null, true, label + ': creature stops attacking'); assert.equal(current.blocking === null, true, label + ': creature stops blocking');
      assert.equal(row.after.attackers.includes(card), false, label + ': creature leaves the combat attacker list');
      assert.equal(current.tapped, old.tapped, label + ': removal alone does not change tap state');
      for (const attacker of row.after.attackers) {
        assert.equal(row.after.cards.get(attacker).blockedBy.includes(card), false, label + ': creature no longer blocks another attacker');
        assert.equal(row.after.cards.get(attacker).wasBlocked, row.before.cards.get(attacker).wasBlocked, label + ': removing blockers never makes an attacker unblocked');
      }
    }
    return true;
  }
  if (effect.action === 'player-counter') {
    const expected = new Set(playerSubjects(MTG, context, effect, row, before)), n = value(context, row, effect.n, row.before);
    assert.equal(effect.counter, 'poison'); assert.ok(expected.size, label + ': poison has an actual affected player');
    for (const player of context.game.players) {
      const old = row.before.players.get(player), current = row.after.players.get(player);
      assert.equal(current.poison || 0, (old.poison || 0) + (expected.has(player) ? n : 0), label + ': exact poison counters affect only the printed players');
      assert.equal(current.life, old.life, label + ': poison does not deal damage or change life');
    }
    return true;
  }
  const initial = row.before, sourceState = initial.cards.get(source), sameSource = sourceState?.zone === 'battlefield' && sourceState.zoneVersion === row.ctx.sourceZoneVersion;
  const affected = initial.battlefield.filter(card => {
    const old = initial.cards.get(card);
    const view = { ...card, ...old, name: card.name, cur: { ...card.cur, super: old.super }, is: type => old.types.includes(type), hasSub: type => old.subtypes.includes(type), kw: keyword => old.keywords.includes(keyword) };
    return effect.filters.some(filter => !(filter.excludeSelf && sameSource && card === source) && matchesTarget(view, { ...filter, excludeSelf: false }, { ...context, a: row.ctx.you }, source));
  });
  assert.ok(affected.length, label + ': group has actual eligible objects');
  assert.equal(row.children.length, effect.effects.length, label + ': every printed group instruction executes');
  for (const [index, printed] of effect.effects.entries()) {
    const child = row.children[index], actual = child.effects[0];
    assert.equal(child.effects.length, 1); assert.equal(actual.action, printed.action);
    const expectedCards = affected.filter(card => child.before.cards.get(card)?.zone === 'battlefield' && child.before.cards.get(card).zoneVersion === initial.cards.get(card).zoneVersion);
    const selected = flat(child.targets[actual.target]);
    assert.equal(selected.length, expectedCards.length, label + ': group retains exact cardinality');
    assert.ok(selected.every(card => expectedCards.includes(card)), label + ': group retains original incarnations and never selects new objects');
    const expected = { ...printed };
    for (const key of ['n', 'power', 'toughness', 'multiplier']) if (expected[key] && typeof expected[key] === 'object') expected[key] = value(context, row, expected[key], child.before);
    for (const key of ['n', 'power', 'toughness', 'multiplier', 'counter', 'duration', 'keywords']) assert.equal(JSON.stringify(actual[key]), JSON.stringify(expected[key]), label + ': exact printed group ' + key);
    for (const card of selected) {
      const old = child.before.cards.get(card), after = child.after.cards.get(card);
      if (printed.action === 'tap' || printed.action === 'untap') assert.equal(after.tapped, printed.action === 'tap', label + ': group changes the printed tap state');
      else if (printed.action === 'pump') {
        const multiplier = expected.multiplier ?? 1;
        assert.equal(after.power - old.power, (expected.power || 0) * multiplier, label + ': group applies exact power');
        assert.equal(after.toughness - old.toughness, (expected.toughness || 0) * multiplier, label + ': group applies exact toughness');
        for (const keyword of expected.keywords || []) assert.ok(after.keywords.includes(keyword), label + ': group grants every printed keyword');
      } else if (printed.action === 'counter') assert.ok((after.counters[printed.counter] || 0) >= (old.counters[printed.counter] || 0) + value(context, row, printed.n, child.before), label + ': printed counters are actually placed');
      else if (printed.action === 'linked-untap-v8')assert.ok(child.after.untilEffects.some(effect=>effect.kind==='oracleUntapLock'&&effect.iid===card.iid&&effect.zoneVersion===card.zoneVersion&&effect.sourceIid===row.source.iid&&effect.mode===printed.mode),label+': original group object retains the exact linked duration');
      else if (printed.action === 'skip-next-untap') { assert.equal(after.noUntapOnce, true, label + ': every retained group object receives its next-untap restriction'); retainFreeze(context, [card], label); }
      else if (printed.action === 'cant-block-until-eot') assert.equal(after.cantBlock, true, label + ': retained object cannot block');
      else if (printed.action === 'unblockable-until-eot') assert.equal(after.unblockable, true, label + ': retained object cannot be blocked');
      else if (printed.action === 'base-pt') {
        const replacement = child.after.untilEffects.find(node => !child.before.untilEffects.includes(node) && node.kind === 'oracleBasePT' && node.iid === card.iid && node.zoneVersion === old.zoneVersion);
        assert.ok(replacement, label + ': real base characteristics change'); assert.equal(replacement.power, value(context, row, printed.power, child.before)); assert.equal(replacement.toughness, value(context, row, printed.toughness, child.before));
      } else assert.fail(label + ': missing retained group behavior proof');
    }
  }
  return true;
}

// Future-step instructions execute only after all immediate sibling effects
// have been checked. The witness comes from the real delayed Stack ability.
export async function finishV8EffectProof(MTG, context, entry, h) {
  const game = context.game;
  for (const row of context.v8EffectWitnesses || []) {
    const delayed = row.delayed, effect = row.effect;
    if (!row.verified || !delayed || delayed.verified) continue;
    const label = delayed.label || entry.raw.name;
    if (!delayed.count && effect.your) {
      const other = game.players.find(player => player !== row.ctx.you && !player.lost);
      assert.ok(other, label + ': another player end step is available');
      await game.emit(effect.on, { player: other }); await h.resolveAll(game);
      assert.equal(delayed.count, 0, label + ': your next end step does not trigger on another player turn');
      assert.ok(game.delayed.includes(delayed.entry), label + ': delayed instruction waits for the correct player');
    }
    if (!delayed.count) { await game.emit(effect.on, { player: row.ctx.you }); await h.resolveAll(game); }
    assert.equal(delayed.count, 1, label + ': one actual delayed trigger resolves');
    assert.ok(delayed.stackObject?.kind === 'trigger', label + ': future instruction resolves through the real Stack');
    assert.ok(delayed.stackObject.ctrl === row.ctx.you && delayed.stackObject.srcCard === row.source, label + ': delayed controller and source are retained');
    assert.equal((delayed.stackObject.targets || []).length, 0, label + ': delayed resolution selects no new targets');
    const before = delayed.before, after = delayed.after;
    for (const card of delayed.subjects) {
      const old = before.cards.get(card), current = after.cards.get(card), initial = row.before.cards.get(card);
      if (old?.zone !== 'battlefield' || old.zoneVersion !== initial.zoneVersion) { assert.equal(current?.zone, old?.zone, label + ': a different object is unaffected'); continue; }
      if (effect.operation === 'counter') assert.ok((current.counters[effect.counter] || 0) >= (old.counters[effect.counter] || 0) + effect.n, label + ': delayed printed counters placed');
      else if (effect.operation === 'remove-counter') assert.equal(current.counters[effect.counter] || 0, Math.max(0, (old.counters[effect.counter] || 0) - effect.n), label + ': delayed printed counters removed');
      else if (effect.operation === 'sacrifice' && (old.ctrl !== row.ctx.you || old.keywords.includes('unsacrificable'))) assert.equal(current.zone, 'battlefield', label + ': a player cannot sacrifice another controller permanent');
      else if (effect.operation === 'destroy' && (old.keywords.includes('indestructible') || old.counters.shield || old.regenShield && !effect.noRegen)) {
        assert.equal(current.zone, 'battlefield', label + ': current destruction protection is applied');
        if (!old.keywords.includes('indestructible') && old.counters.shield) assert.equal(current.counters.shield || 0, old.counters.shield - 1);
        else if (!old.keywords.includes('indestructible') && old.regenShield && !effect.noRegen) { assert.equal(current.regenShield, old.regenShield - 1); assert.equal(current.tapped, true); }
      } else {
        const destination = effect.operation === 'bounce' ? 'hand' : effect.operation === 'exile' ? 'exile' : 'graveyard';
        assert.ok(current.zone === destination || old.isToken && current.zone === 'ceased', label + ': actual delayed ' + effect.operation + ' moves the captured object');
        if (current.zone !== 'ceased') assert.ok(after.players.get(old.owner)[destination + 'Cards'].includes(card), label + ': delayed departure uses the owner zone');
      }
    }
    assert.equal(game.delayed.includes(delayed.entry), false, label + ': one-shot delayed trigger is removed'); delayed.verified = true;
  }
  const frozen = (worlds.get(game)?.frozen || context.v8FrozenObjects || []).filter(row => !row.verified && row.card.zone === 'battlefield' && row.card.zoneVersion === row.version);
  if (!frozen.length) return;
  // Stop the ordinary turn exactly when its completed untap step reaches
  // upkeep. No untap algorithm is copied into this proof.
  const realUntapStep = async player => {
    const stop = Symbol('completed real untap step'), emit = game.emit;
    game.turnPlayer = player;
    game.emit = async function(event, data) { if (event === 'upkeep') throw stop; return emit.call(this, event, data); };
    try { await game.runTurn(); assert.fail('real untap proof must reach upkeep'); }
    catch (error) { if (error !== stop) throw error; }
    finally { game.emit = emit; }
  };
  for (const player of [...new Set(frozen.map(row => row.card.ctrl))]) {
    const owned = frozen.filter(row => row.card.ctrl === player && !row.verified);
    for (const row of owned) game.tap(row.card);
    await h.resolveAll(game);
    await realUntapStep(player);
    for (const row of owned) { assert.equal(row.card.tapped, true, row.label + ': real next controller untap leaves the affected object tapped'); assert.equal(!!row.card.meta.noUntapOnce, false, row.label + ': restriction is consumed at that step'); }
    const shouldUntap = owned.filter(row => !row.card.def.doesntUntap && !row.card.cur?.cantUntap && !row.card.cur?.optionalUntap && !(row.card.counters.stun > 0));
    await realUntapStep(player);
    for (const row of shouldUntap) assert.equal(row.card.tapped, false, row.label + ': a following untap step is no longer prohibited');
    for (const row of owned) row.verified = true;
  }
}
