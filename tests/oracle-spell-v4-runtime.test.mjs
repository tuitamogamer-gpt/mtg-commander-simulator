import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOracleSpellV4 } from '../scripts/oracle-spell-v4.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
globalThis.MTG = MTG;
await import('../src/modules/oracle-spell-v4.js');

function defaultDecision(game, query) {
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min ?? 1).map(option => option.key);
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min ?? 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min ?? 0);
  if (query.type === 'chooseX') return query.max ?? query.min ?? 0;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'cardReveal' || query.type === 'manualResolve' || query.type === 'threatAlert') return 'ok';
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  return [];
}

function decisionController(state = {}) {
  return {
    decide: async (game, query) => {
      state.trace = state.trace || [];
      state.trace.push(query);
      if (typeof state.decide === 'function') {
        const decision = state.decide(game, query);
        if (decision !== undefined) return await decision;
      }
      return defaultDecision(game, query);
    },
  };
}

function gameContext(options = {}) {
  const humanState = options.humanState || {};
  const opponentState = options.opponentState || {};
  const game = new MTG.Game({ seed: options.seed || 7404, paced: false, maxTurns: 8 });
  const player = game.addPlayer(options.ai ? 'V4 local bot' : 'V4 human', { name: 'V4 deck' }, null, !!options.ai);
  const opponent = game.addPlayer('V4 opponent', { name: 'Opponent deck' }, decisionController(opponentState), false);
  player.controller = options.ai
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : decisionController(humanState);
  game.turnPlayer = player;
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  game.revealToHuman = async () => {};
  game.reviewGlobalEffectWithHuman = async () => {};
  return { game, player, opponent, humanState, opponentState };
}

function syntheticDefinition(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: types.includes('Land') ? null : '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    kws: [],
    power: types.includes('Creature') ? '3' : undefined,
    toughness: types.includes('Creature') ? '3' : undefined,
  }, extras);
}

function zoneCard(player, definition, zone) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  assert.ok(def, `definition exists: ${definition}`);
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, definition, options = {}) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield';
  card.ctrl = options.ctrl || player;
  card.sick = false;
  card.tapped = !!options.tapped;
  game._oracleV4Timestamp = (game._oracleV4Timestamp || 0) + 1;
  card.timestamp = game._oracleV4Timestamp;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function fillLibrary(player, count, prefix = 'Library card') {
  for (let index = 0; index < count; index += 1) {
    zoneCard(player, syntheticDefinition(`${prefix} ${index + 1}`, ['Land']), 'library');
  }
}

function legacyCard(name) {
  const card = MTG.RAW_DATA.cards[name];
  assert.ok(card, `${name}: real local named-card fixture exists`);
  return card;
}

function wrapperFromAst(ast) {
  assert.equal(ast.ok, true, ast.error?.code || 'spell parses');
  return {
    kind: 'spell-v4',
    parserVersion: ast.parserVersion,
    additionalCosts: ast.additionalCosts,
    targets: ast.targets,
    effects: ast.effects,
    operations: ast.operations,
  };
}

function compileCard(cardOrText) {
  const ast = parseOracleSpellV4(cardOrText);
  const operation = wrapperFromAst(ast);
  return { ast, operation, fragment: MTG.compileOracleSpellV4(operation) };
}

function spellDefinition(raw, fragment, extras = {}) {
  return Object.assign({
    name: raw.name,
    cost: raw.cost || '{1}',
    super: (raw.super || []).slice(),
    types: raw.types?.length ? raw.types.slice() : ['Instant'],
    subtypes: (raw.subtypes || []).slice(),
    oracle: raw.oracle || '',
    kws: [],
  }, fragment, extras);
}

async function castFree(context, raw, fragment) {
  const card = zoneCard(context.player, spellDefinition(raw, fragment), 'hand');
  const cast = await context.game.castSpell(context.player, card, { from: 'hand', alt: { free: true } });
  return { card, cast };
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'v4 spell stack settles');
}

test('runtime manifest exactly covers every closed parser effect/cost/operation kind and rejects unknown nodes', () => {
  assert.deepEqual(Array.from(MTG.ORACLE_SPELL_V4_RUNTIME.effectKinds), [
    'becomeMonarch', 'counterSpell', 'createToken', 'dealDamage', 'destroy', 'destroyAll',
    'discard', 'draw', 'exile', 'exileAllGraveyards', 'exileGraveyard', 'gainLife',
    'investigate', 'mill', 'modifyPowerToughness', 'modifyPowerToughnessAll', 'proliferate',
    'putCounters', 'returnToBattlefield', 'returnToHand', 'scry', 'surveil', 'tap',
    'tapOrUntap', 'untap',
  ]);
  assert.deepEqual(Array.from(MTG.ORACLE_SPELL_V4_RUNTIME.costKinds),
    ['choice', 'discard', 'payLife', 'sacrifice', 'sequence']);
  assert.deepEqual(Array.from(MTG.ORACLE_SPELL_V4_RUNTIME.operationKinds), ['modal', 'sequence']);

  const valid = compileCard('Draw a card.').operation;
  assert.throws(() => MTG.compileOracleSpellV4({ ...valid, parserVersion: 3 }), /unsupported parser version/);
  assert.throws(() => MTG.compileOracleSpellV4({
    ...valid,
    effects: [{ ...valid.effects[0], kind: 'arbitraryFallback' }],
  }), /unsupported effect kind/);
  assert.throws(() => MTG.compileOracleSpellV4({
    ...valid,
    operations: [{ ...valid.operations[0], effectIds: ['missing-effect'] }],
  }), /missing effect/);
});

test('app wiring compiles and resolves an actual batch-0027 spell-v4 card', async () => {
  let blocker;
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseTargets' && blocker && query.candidates.includes(blocker)) return [blocker];
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  fillLibrary(context.player, 8, 'Aang defense draw');
  blocker = permanent(context.game, context.player,
    syntheticDefinition('Aang defense blocker', ['Creature'], { power: '2', toughness: '2' }));
  const attacker = permanent(context.game, context.opponent,
    syntheticDefinition('Aang defense attacker', ['Creature'], { power: '2', toughness: '2' }));
  blocker.blocking = attacker;
  attacker.attacking = context.player;
  const card = zoneCard(context.player, "Aang's Defense", 'hand');
  const script = MTG.SCRIPTS["Aang's Defense"];
  assert.equal(script.oracleBatch, 'oracle-0027');
  assert.equal(script.oracleSpellV4, true);
  assert.equal(await context.game.castSpell(context.player, card, { from: 'hand', alt: { free: true } }), true);
  const libraryBefore = context.player.library.length;
  await settle(context.game);
  assert.equal(card.zone, 'graveyard');
  assert.equal(blocker.power, 4);
  assert.equal(blocker.toughness, 4);
  assert.equal(context.player.library.length, libraryBefore - 1);
});

test('actual batch-0041 Reprieve returns a Stack spell for both a human and local deterministic AI', async t => {
  for (const ai of [false, true]) await t.test(ai ? 'local AI' : 'human', async () => {
    const context = gameContext({ ai, seed: ai ? 7442 : 7441 });
    fillLibrary(context.player, 5, `${ai ? 'AI' : 'human'} Reprieve draw`);
    const baitDefinition = syntheticDefinition(`${ai ? 'AI' : 'human'} Reprieve bait`, ['Instant'], {
      resolved: false,
      resolve: async () => { baitDefinition.resolved = true; },
    });
    const bait = zoneCard(context.opponent, baitDefinition, 'hand');
    assert.equal(await context.game.castSpell(context.opponent, bait, { from: 'hand', alt: { free: true } }), true);
    assert.equal(context.game.stack.length, 1);

    const reprieve = zoneCard(context.player, 'Reprieve', 'hand');
    assert.equal(MTG.SCRIPTS.Reprieve.oracleSpellV4, true);
    const libraryBefore = context.player.library.length;
    assert.equal(await context.game.castSpell(context.player, reprieve, { from: 'hand', alt: { free: true } }), true);
    assert.equal(context.game.stack.length, 2);
    assert.equal(context.game.stack.at(-1).targets[0], bait && context.game.stack[0],
      'Reprieve locks the opposing spell object as its Stack target');
    await settle(context.game);

    assert.equal(baitDefinition.resolved, false);
    assert.equal(bait.zone, 'hand');
    assert.equal(context.opponent.hand.includes(bait), true);
    assert.equal(reprieve.zone, 'graveyard');
    assert.equal(context.player.library.length, libraryBefore - 1);
  });
});

test('actual batch-0031 Double Negative counters every selected spell for human and local AI', async t => {
  for (const ai of [false, true]) await t.test(ai ? 'local AI' : 'human', async () => {
    const context = gameContext({
      ai,
      seed: ai ? 7452 : 7451,
      humanState: { decide: (game, query) => query.type === 'chooseTargets'
        ? query.candidates.slice(0, query.max) : undefined },
    });
    const bait = [];
    for (let index = 0; index < 2; index += 1) {
      const card = zoneCard(context.opponent,
        syntheticDefinition(`Double Negative opposing threat ${index + 1}`, ['Creature'], {
          cost: '{7}', power: '8', toughness: '8', kws: ['flying'],
        }), 'hand');
      assert.equal(await context.game.castSpell(context.opponent, card,
        { from: 'hand', alt: { free: true } }), true);
      bait.push(card);
    }
    const opposingSpells = context.game.stack.slice();
    const spell = zoneCard(context.player, 'Double Negative', 'hand');
    assert.equal(MTG.SCRIPTS['Double Negative'].oracleBatch, 'oracle-0031');
    assert.equal(await context.game.castSpell(context.player, spell,
      { from: 'hand', alt: { free: true } }), true);
    assert.deepEqual(new Set(context.game.stack.at(-1).targets.flat().map(target => target.card.iid)),
      new Set(opposingSpells.map(target => target.card.iid)),
      'the real controller chose both threatening enemy spells');

    await context.game.resolveTop();
    assert.equal(context.game.stack.length, 0, 'both selected spells left the Stack');
    for (const card of bait) assert.equal(card.zone, 'graveyard', `${card.name} was countered`);
    assert.equal(spell.zone, 'graveyard');
    assert.equal(context.game.pendingTriggers.length, 0);
    if (ai) {
      const decisions = (context.game.aiDecisionLog || []).filter(entry => entry.playerId === context.player.idx);
      assert.ok(decisions.length > 0, 'actual local AI made the target decision');
      assert.equal(decisions.some(entry => entry.fallback), false, 'no AI fallback');
    }
  });
});

test('Double Negative keeps processing later targets after an uncounterable or invalid first target', async t => {
  for (const firstTarget of ['uncounterable', 'already removed']) await t.test(firstTarget, async () => {
    let chosen = [];
    const context = gameContext({ humanState: {
      decide: (game, query) => query.type === 'chooseTargets'
        ? chosen.filter(target => query.candidates.includes(target)) : undefined,
    } });
    const bait = [];
    for (let index = 0; index < 2; index += 1) {
      const card = zoneCard(context.opponent,
        syntheticDefinition(`Double Negative ${firstTarget} threat ${index}`, ['Creature'], {
          cost: '{7}', power: '7', toughness: '7',
          uncounterable: index === 0 && firstTarget === 'uncounterable',
        }), 'hand');
      assert.equal(await context.game.castSpell(context.opponent, card,
        { from: 'hand', alt: { free: true } }), true);
      bait.push(card);
    }
    chosen = context.game.stack.slice();
    const spell = zoneCard(context.player, 'Double Negative', 'hand');
    assert.equal(await context.game.castSpell(context.player, spell,
      { from: 'hand', alt: { free: true } }), true);
    assert.deepEqual(Array.from(context.game.stack.at(-1).targets).flat().map(target => target.card.iid),
      Array.from(chosen, target => target.card.iid));
    if (firstTarget === 'already removed') {
      assert.equal(await context.game.counterStackObject(chosen[0]), true,
        'an earlier response removes exactly the first target');
    }

    await context.game.resolveTop();
    assert.equal(bait[1].zone, 'graveyard', 'the still-legal second spell is countered');
    assert.equal(context.game.stack.includes(chosen[1]), false);
    if (firstTarget === 'uncounterable') {
      assert.equal(context.game.stack.includes(chosen[0]), true, 'uncounterable first spell remains');
      await settle(context.game);
      assert.equal(bait[0].zone, 'battlefield', 'uncounterable spell resolves normally');
    } else assert.equal(context.game.stack.length, 0);
  });
});

test('optional graveyard return spells select useful own cards for human and actual local AI', async t => {
  for (const name of ['Dutiful Return', 'Soul Salvage', 'Regenesis', 'Urborg Uprising']) {
    for (const ai of [false, true]) await t.test(`${name}: ${ai ? 'local AI' : 'human'}`, async () => {
      const context = gameContext({
        ai, seed: ai ? 7462 : 7461,
        humanState: { decide: (game, query) => query.type === 'chooseTargets'
          ? query.candidates.slice(0, query.max) : undefined },
      });
      fillLibrary(context.player, 5, `${name} cantrip`);
      const recovered = [1, 2].map(index => zoneCard(context.player,
        syntheticDefinition(`${name} valuable own creature ${index}`, ['Creature'], {
          cost: '{7}', power: '8', toughness: '8', kws: ['flying'],
        }), 'graveyard'));
      const spell = zoneCard(context.player, name, 'hand');
      assert.equal(spell.def.oracleSpellV4, true, 'actual imported spell-v4 definition');
      assert.equal(await context.game.castSpell(context.player, spell,
        { from: 'hand', alt: { free: true } }), true);
      assert.deepEqual(new Set(context.game.stack.at(-1).targets.flat().map(card => card.iid)),
        new Set(recovered.map(card => card.iid)), 'optional selection is useful, not a vacuous zero-target pass');
      await settle(context.game);
      for (const card of recovered) {
        assert.equal(card.zone, 'hand');
        assert.equal(context.player.hand.includes(card), true);
      }
      assert.equal(spell.zone, 'graveyard');
      if (ai) {
        const decisions = (context.game.aiDecisionLog || []).filter(entry => entry.playerId === context.player.idx);
        assert.ok(decisions.length > 0);
        assert.equal(decisions.some(entry => entry.fallback), false);
      }
    });
  }
});

test('Badlands Revival preserves the targeted graveyard incarnation across both effects for human and local AI', async t => {
  for (const scenario of ['human same target', 'human distinct targets', 'local AI']) await t.test(scenario, async () => {
    const ai = scenario === 'local AI';
    let targetIndex = 0;
    let creatures = [];
    const context = gameContext({ ai, seed: 7493, humanState: {
      decide: (game, query) => {
        if (query.type !== 'chooseTargets') return undefined;
        const target = scenario === 'human distinct targets' ? creatures[targetIndex++] : creatures[0];
        assert.ok(query.candidates.includes(target), 'the exact graveyard object is a legal target');
        return [target];
      },
    } });
    creatures = [1, 2].map(index => zoneCard(context.player,
      syntheticDefinition(`Badlands valuable creature ${index}`, ['Creature'], {
        cost: index === 1 ? '{8}' : '{5}', power: index === 1 ? '9' : '5', toughness: '8', kws: ['flying'],
      }), 'graveyard'));
    const spell = zoneCard(context.player, 'Badlands Revival', 'hand');
    assert.equal(MTG.SCRIPTS['Badlands Revival'].oracleBatch, 'oracle-0028');
    assert.equal(await context.game.castSpell(context.player, spell,
      { from: 'hand', alt: { free: true } }), true);
    const selected = Array.from(context.game.stack.at(-1).targets, value => Array.isArray(value) ? value[0] : value);
    assert.equal(selected.length, 2, 'both legal target clauses are selected');
    assert.ok(selected.every(card => creatures.includes(card)), 'both selections are useful own graveyard creatures');
    if (scenario === 'human same target') assert.equal(selected[0], selected[1], 'same-object choice remains legal');
    if (scenario === 'human distinct targets') assert.notEqual(selected[0], selected[1]);
    const versions = selected.map(card => card.zoneVersion);

    await settle(context.game);
    assert.equal(selected[0].zone, 'battlefield', 'the reanimated creature is not returned to hand by the next effect');
    assert.equal(selected[0].zoneVersion, versions[0] + 1, 'only the actual graveyard-to-battlefield move occurred');
    assert.equal(context.game.bf().includes(selected[0]), true);
    if (selected[1] !== selected[0]) {
      assert.equal(selected[1].zone, 'hand', 'a distinct second target is recovered normally');
      assert.equal(selected[1].zoneVersion, versions[1] + 1);
    } else {
      assert.equal(context.player.hand.includes(selected[1]), false, 'a stale reference cannot move the new object');
    }
    assert.equal(spell.zone, 'graveyard');
    assert.equal(context.game.stack.length, 0);
    assert.equal(context.game.pendingTriggers.length, 0);
    if (ai) {
      const decisions = (context.game.aiDecisionLog || []).filter(entry => entry.playerId === context.player.idx);
      assert.ok(decisions.length >= 2, 'actual local AI made both target decisions');
      assert.equal(decisions.some(entry => entry.fallback), false);
    }
  });
});

test('multi-mode v4 resolution never refreshes a target identity between modes', async () => {
  let target;
  const context = gameContext({ humanState: { decide: (game, query) => {
    if (query.type === 'chooseMulti') return ['0', '1'];
    if (query.type === 'chooseTargets') return [target];
    return undefined;
  } } });
  target = zoneCard(context.player, syntheticDefinition('Modal incarnation creature'), 'graveyard');
  const raw = {
    name: 'Closed modal identity regression', cost: '{3}{B}{G}', types: ['Sorcery'],
    oracle: 'Choose two —\n• Return target creature card from your graveyard to the battlefield.\n• Return target creature card from your graveyard to your hand.',
  };
  const { fragment } = compileCard(raw);
  const version = target.zoneVersion;
  const { cast } = await castFree(context, raw, fragment);
  assert.equal(cast, true);
  await settle(context.game);
  assert.equal(target.zone, 'battlefield');
  assert.equal(target.zoneVersion, version + 1);
  assert.equal(context.player.hand.includes(target), false);
});

test('human Abrade chooses exactly one real mode, chooses its target, and resolves that mode only', async () => {
  let victim;
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseOption' && query.prompt.startsWith('Abrade:')) return '0';
      if (query.type === 'chooseTargets' && victim && query.candidates.includes(victim)) return [victim];
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  victim = permanent(context.game, context.opponent,
    syntheticDefinition('Abrade victim', ['Creature'], { power: '2', toughness: '2' }));
  const artifact = permanent(context.game, context.opponent,
    syntheticDefinition('Abrade artifact', ['Artifact']));
  const raw = legacyCard('Abrade');
  const { fragment } = compileCard(raw);

  const { card, cast } = await castFree(context, raw, fragment);
  assert.equal(cast, true);
  assert.deepEqual(Array.from(context.game.stack[0].mode), [0]);
  await settle(context.game);

  assert.equal(victim.zone, 'graveyard', 'damage mode killed the chosen creature');
  assert.equal(artifact.zone, 'battlefield', 'unchosen destroy-artifact mode did not run');
  assert.equal(card.zone, 'graveyard');
  assert.equal(state.trace.filter(query => query.type === 'chooseOption' && query.prompt.startsWith('Abrade:')).length, 1);
  assert.equal(state.trace.filter(query => query.type === 'chooseTargets').length, 1);
});

test('human Prismari Command chooses exactly two modes and shares the chosen player across draw/discard atoms', async () => {
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseMulti' && query.prompt.startsWith('Prismari Command:')) return ['1', '2'];
      if (query.type === 'chooseTargets' && query.candidates.includes(game.players[0])) return [game.players[0]];
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  fillLibrary(context.player, 8, 'Prismari draw');
  zoneCard(context.player, syntheticDefinition('Prismari discard fodder', ['Land']), 'hand');
  const raw = legacyCard('Prismari Command');
  const { fragment } = compileCard(raw);
  const tokensBefore = context.player.turnState.tokensCreated;

  const { cast } = await castFree(context, raw, fragment);
  assert.equal(cast, true);
  assert.deepEqual(Array.from(context.game.stack[0].mode), [1, 2]);
  assert.equal(context.game.stack[0].targets[0], context.player);
  assert.equal(context.game.stack[0].targets[1], context.player);
  await settle(context.game);

  assert.equal(context.player.turnState.tokensCreated, tokensBefore + 1);
  assert.ok(context.game.bf().some(card => card.ctrl === context.player && card.hasSub('Treasure')));
  const multi = state.trace.find(query => query.type === 'chooseMulti');
  assert.equal(multi.min, 2);
  assert.equal(multi.max, 2);
  assert.equal(state.trace.filter(query => query.type === 'chooseTargets').length, 2,
    'each selected mode contributes only its own target contract');
});

test('Choose one or both can execute both Crush Contraband modes with correctly sliced targets', async () => {
  let artifact;
  let enchantment;
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseMulti' && query.prompt.startsWith('Crush Contraband:')) return ['0', '1'];
      if (query.type === 'chooseTargets') {
        if (artifact && query.candidates.includes(artifact)) return [artifact];
        if (enchantment && query.candidates.includes(enchantment)) return [enchantment];
      }
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  artifact = permanent(context.game, context.opponent, syntheticDefinition('Contraband artifact', ['Artifact']));
  enchantment = permanent(context.game, context.opponent, syntheticDefinition('Contraband enchantment', ['Enchantment']));
  const raw = {
    name: 'Crush Contraband', cost: '{3}{W}', super: [], types: ['Instant'], subtypes: [],
    oracle: 'Choose one or both —\n• Exile target artifact.\n• Exile target enchantment.',
  };
  const { fragment } = compileCard(raw);
  assert.equal(fragment.modes.pick, 'any');
  assert.equal(fragment.modes.min, 1);

  assert.equal((await castFree(context, raw, fragment)).cast, true);
  await settle(context.game);
  assert.equal(artifact.zone, 'exile');
  assert.equal(enchantment.zone, 'exile');
});

test('real additional costs are selected and paid during casting, before resolution', async t => {
  await t.test('Deadly Dispute sacrifices an artifact even if the spell is then countered', async () => {
    let sacrifice;
    const state = {
      decide: (game, query) => {
        if (query.type === 'chooseCards' && sacrifice && query.from.includes(sacrifice)) return [sacrifice];
        return undefined;
      },
    };
    const context = gameContext({ humanState: state });
    fillLibrary(context.player, 6, 'Dispute draw');
    sacrifice = permanent(context.game, context.player, syntheticDefinition('Dispute bauble', ['Artifact']));
    const raw = legacyCard('Deadly Dispute');
    const { fragment } = compileCard(raw);
    const { card, cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(sacrifice.zone, 'graveyard', 'sacrifice is paid as part of casting');
    assert.equal(context.game.stack[0].oracleV4AdditionalCost.sacrifices[0].iid, sacrifice.iid);
    context.game.stack[0].countered = true;
    await settle(context.game);
    assert.equal(card.zone, 'graveyard');
    assert.equal(sacrifice.zone, 'graveyard', 'countering does not refund an additional cost');
    assert.equal(context.game.bf().some(card => card.hasSub('Treasure')), false,
      'countered effect did not create the Treasure');
  });

  await t.test('Big Score discards exactly one non-source card and then makes two Treasures', async () => {
    let fodder;
    const state = {
      decide: (game, query) => {
        if (query.type === 'chooseCards' && fodder && query.from.includes(fodder)) return [fodder];
        return undefined;
      },
    };
    const context = gameContext({ humanState: state });
    fillLibrary(context.player, 6, 'Big Score draw');
    fodder = zoneCard(context.player, syntheticDefinition('Big Score fodder', ['Land']), 'hand');
    const raw = legacyCard('Big Score');
    const { fragment } = compileCard(raw);
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(fodder.zone, 'graveyard');
    assert.deepEqual(context.game.stack[0].oracleV4AdditionalCost.discards, [fodder.iid]);
    await settle(context.game);
    assert.equal(context.game.bf().filter(card => card.ctrl === context.player && card.hasSub('Treasure')).length, 2);
  });

  await t.test('Bitter Triumph human explicitly pays life instead of discarding', async () => {
    let victim;
    const state = {
      decide: (game, query) => {
        if (query.type === 'chooseOption' && query.aiHint?.kind === 'bitterTriumphCost') return 'life';
        if (query.type === 'chooseTargets' && victim && query.candidates.includes(victim)) return [victim];
        return undefined;
      },
    };
    const context = gameContext({ humanState: state });
    zoneCard(context.player, syntheticDefinition('Triumph discard alternative', ['Land']), 'hand');
    victim = permanent(context.game, context.opponent,
      syntheticDefinition('Triumph victim', ['Creature'], { power: '5', toughness: '5' }));
    const raw = legacyCard('Bitter Triumph');
    const { fragment } = compileCard(raw);
    const lifeBefore = context.player.life;
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(context.player.life, lifeBefore - 3);
    assert.equal(context.game.stack[0].oracleV4AdditionalCost.life, 3);
    assert.equal(context.game.stack[0].oracleV4AdditionalCost.discards.length, 0);
    await settle(context.game);
    assert.equal(victim.zone, 'graveyard');
  });

  await t.test('a closed cost sequence reserves and commits sacrifice plus discard exactly once', async () => {
    let sacrifice;
    let fodder;
    const state = {
      decide: (game, query) => {
        if (query.type === 'chooseCards' && sacrifice && query.from.includes(sacrifice)) return [sacrifice];
        if (query.type === 'chooseCards' && fodder && query.from.includes(fodder)) return [fodder];
        return undefined;
      },
    };
    const context = gameContext({ humanState: state });
    fillLibrary(context.player, 3, 'Combined-cost draw');
    sacrifice = permanent(context.game, context.player, syntheticDefinition('Combined-cost creature'));
    fodder = zoneCard(context.player, syntheticDefinition('Combined-cost fodder', ['Land']), 'hand');
    const raw = {
      name: 'Combined Cost', cost: '{1}{B}', super: [], types: ['Sorcery'], subtypes: [],
      oracle: 'As an additional cost to cast this spell, sacrifice a creature and discard a card.\nDraw a card.',
    };
    const { ast, fragment } = compileCard(raw);
    assert.equal(ast.additionalCosts[0].kind, 'sequence');
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(sacrifice.zone, 'graveyard');
    assert.equal(fodder.zone, 'graveyard');
    assert.equal(context.game.stack[0].oracleV4AdditionalCost.sacrifices.length, 1);
    assert.deepEqual(Array.from(context.game.stack[0].oracleV4AdditionalCost.discards), [fodder.iid]);
    await settle(context.game);
  });

  await t.test('a direct pay-life row is charged during casting', async () => {
    const context = gameContext();
    fillLibrary(context.player, 2, 'Pay-life draw');
    const raw = {
      name: 'Life Cost', cost: '{B}', super: [], types: ['Sorcery'], subtypes: [],
      oracle: 'As an additional cost to cast this spell, pay 2 life.\nDraw a card.',
    };
    const { fragment } = compileCard(raw);
    const lifeBefore = context.player.life;
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(context.player.life, lifeBefore - 2);
    assert.equal(context.game.stack[0].oracleV4AdditionalCost.life, 2);
    await settle(context.game);
  });
});

test('compound targeted effect matrix mutates every target family emitted by the parser', async () => {
  const picks = [];
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseTargets' && picks.length) {
        const requested = picks.shift();
        const list = (Array.isArray(requested) ? requested : [requested]).filter(candidate => query.candidates.includes(candidate));
        return list;
      }
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  fillLibrary(context.player, 6, 'Matrix caster library');
  fillLibrary(context.opponent, 8, 'Matrix opponent library');
  zoneCard(context.opponent, syntheticDefinition('Matrix opponent hand', ['Land']), 'hand');

  const damageTarget = permanent(context.game, context.opponent,
    syntheticDefinition('Matrix damage target', ['Creature'], { power: '4', toughness: '4' }));
  const tapA = permanent(context.game, context.opponent, syntheticDefinition('Matrix tap A'));
  const tapB = permanent(context.game, context.opponent, syntheticDefinition('Matrix tap B'));
  const untapTarget = permanent(context.game, context.player, syntheticDefinition('Matrix untap'), { tapped: true });
  const toggleTarget = permanent(context.game, context.opponent, syntheticDefinition('Matrix toggle'));
  const debuffTarget = permanent(context.game, context.opponent,
    syntheticDefinition('Matrix debuff', ['Creature'], { power: '4', toughness: '4' }));
  const counterTarget = permanent(context.game, context.player, syntheticDefinition('Matrix counters'));
  const destroyTarget = permanent(context.game, context.opponent, syntheticDefinition('Matrix destroy', ['Artifact']));
  const exileTarget = permanent(context.game, context.opponent, syntheticDefinition('Matrix exile', ['Enchantment']));
  const bounceTarget = permanent(context.game, context.opponent, syntheticDefinition('Matrix bounce', ['Artifact']));
  const returnTarget = zoneCard(context.player,
    syntheticDefinition('Matrix return', ['Creature'], { power: '2', toughness: '2' }), 'graveyard');
  const graveExileTarget = zoneCard(context.player, syntheticDefinition('Matrix grave exile', ['Land']), 'graveyard');

  picks.push(
    context.opponent,
    context.opponent,
    context.opponent,
    context.opponent,
    damageTarget,
    [tapA, tapB],
    untapTarget,
    toggleTarget,
    debuffTarget,
    counterTarget,
    context.opponent,
    destroyTarget,
    exileTarget,
    bounceTarget,
    returnTarget,
    graveExileTarget,
    context.opponent,
  );

  const raw = {
    name: 'Matrix', cost: '{5}{U}{B}{R}', super: [], types: ['Sorcery'], subtypes: [],
    oracle: "Target player gains 2 life. Target player draws a card. Target player discards a card. " +
      "Target player mills two cards. Matrix deals 2 damage to target creature. " +
      "Tap up to two target creatures. Untap target creature. Tap or untap target permanent. " +
      "Target creature gets -1/-1 until end of turn. Put two +1/+1 counters on target creature. " +
      "Target player creates a Treasure token. Destroy target artifact. Exile target enchantment. " +
      "Return target permanent to its owner's hand. " +
      "Return target creature card from your graveyard to the battlefield tapped under your control. " +
      "Exile target card from a graveyard. Exile all cards from target player's graveyard.",
  };
  const { fragment } = compileCard(raw);
  const opponentLife = context.opponent.life;
  const { cast } = await castFree(context, raw, fragment);
  assert.equal(cast, true);
  assert.equal(picks.length, 0, 'all 17 closed target contracts were presented');
  await settle(context.game);

  assert.equal(context.opponent.life, opponentLife + 2);
  assert.equal(damageTarget.damage, 2);
  assert.equal(tapA.tapped, true);
  assert.equal(tapB.tapped, true);
  assert.equal(untapTarget.tapped, false);
  assert.equal(toggleTarget.tapped, true);
  assert.equal(debuffTarget.power, 3);
  assert.equal(debuffTarget.toughness, 3);
  assert.equal(counterTarget.counters['+1/+1'], 2);
  assert.equal(destroyTarget.zone, 'exile', 'destroyed card was later swept from the target player graveyard');
  assert.equal(exileTarget.zone, 'exile');
  assert.equal(bounceTarget.zone, 'hand');
  assert.equal(returnTarget.zone, 'battlefield');
  assert.equal(returnTarget.ctrl, context.player);
  assert.equal(returnTarget.tapped, true);
  assert.equal(graveExileTarget.zone, 'exile');
  assert.equal(context.opponent.graveyard.length, 0);
  assert.ok(context.game.bf().some(card => card.ctrl === context.opponent && card.hasSub('Treasure')));
});

test('untargeted effect matrix executes token, investigation, proliferation, monarch, selection, wipe, and graveyard contracts', async () => {
  let counterPermanent;
  const state = {
    decide: (game, query) => {
      if (query.type === 'chooseTargets' && query.spec?.what === 'proliferate' &&
          counterPermanent && query.candidates.includes(counterPermanent)) return [counterPermanent];
      return undefined;
    },
  };
  const context = gameContext({ humanState: state });
  fillLibrary(context.player, 8, 'Omnibus library');
  counterPermanent = permanent(context.game, context.player,
    syntheticDefinition('Omnibus counter creature', ['Creature'], { power: '4', toughness: '4' }));
  context.game.addCounters(counterPermanent, '+1/+1', 1, false, context.player);
  const doomedArtifact = permanent(context.game, context.opponent,
    syntheticDefinition('Omnibus doomed artifact', ['Artifact']));
  zoneCard(context.opponent, syntheticDefinition('Omnibus old grave card', ['Land']), 'graveyard');
  const raw = {
    name: 'Omnibus', cost: '{7}{W}{U}{B}', super: [], types: ['Sorcery'], subtypes: [],
    oracle: 'You gain 3 life. Draw a card. Create a Treasure token. Investigate. Proliferate. ' +
      'You become the monarch. All creatures get -1/-1 until end of turn. Scry 1. Surveil 1. ' +
      'Destroy all artifacts. Exile all cards from all graveyards.',
  };
  const { fragment } = compileCard(raw);
  const lifeBefore = context.player.life;
  const handBefore = context.player.hand.length;
  const tokensBefore = context.player.turnState.tokensCreated;
  assert.equal((await castFree(context, raw, fragment)).cast, true);
  await settle(context.game);

  assert.equal(context.player.life, lifeBefore + 3);
  assert.equal(context.player.hand.length, handBefore + 1);
  assert.equal(context.player.turnState.tokensCreated, tokensBefore + 2, 'Treasure plus investigate Clue were created');
  assert.equal(context.game.monarch, context.player);
  assert.equal(counterPermanent.counters['+1/+1'], 2, 'proliferate added the existing counter kind');
  assert.equal(counterPermanent.power, 5, '+2/+2 counters and -1/-1 global modifier both apply');
  assert.equal(doomedArtifact.zone, 'exile', 'destroy-all then exile-all-graveyards both executed');
  assert.equal(context.game.bf().some(card => card.is('Artifact')), false);
  assert.ok(state.trace.some(query => query.type === 'scry' && !query.surveil));
  assert.ok(state.trace.some(query => query.type === 'scry' && query.surveil));
});

test('Mana Leak counter-unless contract counters an unpaid real stack spell', async () => {
  const context = gameContext();
  const baitDefinition = syntheticDefinition('Counter bait', ['Instant'], {
    resolved: false,
    resolve: async ctx => { ctx.src.def.resolved = true; },
  });
  const bait = zoneCard(context.opponent, baitDefinition, 'hand');
  assert.equal(await context.game.castSpell(context.opponent, bait, { from: 'hand', alt: { free: true } }), true);
  assert.equal(context.game.stack.length, 1);

  const raw = {
    name: 'Mana Leak', cost: '{1}{U}', super: [], types: ['Instant'], subtypes: [],
    oracle: 'Counter target spell unless its controller pays {3}.',
  };
  const { fragment } = compileCard(raw);
  assert.equal((await castFree(context, raw, fragment)).cast, true);
  assert.equal(context.game.stack.length, 2);
  await settle(context.game);

  assert.equal(baitDefinition.resolved, false);
  assert.equal(bait.zone, 'graveyard');
});

test('Mana Leak leaves the target spell intact when its controller pays the exact tax', async () => {
  const context = gameContext({
    opponentState: {
      decide: (game, query) => query.type === 'chooseOption' && query.aiHint?.kind === 'taxCounter'
        ? 'yes' : undefined,
    },
  });
  context.opponent.pool.C = 3;
  const baitDefinition = syntheticDefinition('Paid counter bait', ['Instant'], {
    resolved: false,
    resolve: async ctx => { ctx.src.def.resolved = true; },
  });
  const bait = zoneCard(context.opponent, baitDefinition, 'hand');
  assert.equal(await context.game.castSpell(context.opponent, bait, { from: 'hand', alt: { free: true } }), true);

  const raw = {
    name: 'Mana Leak', cost: '{1}{U}', super: [], types: ['Instant'], subtypes: [],
    oracle: 'Counter target spell unless its controller pays {3}.',
  };
  const { fragment } = compileCard(raw);
  assert.equal((await castFree(context, raw, fragment)).cast, true);
  await settle(context.game);

  assert.equal(baitDefinition.resolved, true);
  assert.equal(context.opponent.pool.C, 0);
  assert.equal(bait.zone, 'graveyard', 'the saved spell later resolved normally');
});

test('counter-unless offers a legal tax payment even for an uncounterable spell', async () => {
  const context = gameContext({ opponentState: {
    decide: (game, query) => query.type === 'chooseOption' && query.aiHint?.kind === 'taxCounter'
      ? 'yes' : undefined,
  } });
  context.opponent.pool.C = 3;
  const bait = zoneCard(context.opponent,
    syntheticDefinition('Uncounterable tax choice', ['Creature'], { uncounterable: true }), 'hand');
  assert.equal(await context.game.castSpell(context.opponent, bait,
    { from: 'hand', alt: { free: true } }), true);
  const raw = {
    name: 'Mana Leak', cost: '{1}{U}', types: ['Instant'],
    oracle: 'Counter target spell unless its controller pays {3}.',
  };
  const { fragment } = compileCard(raw);
  assert.equal((await castFree(context, raw, fragment)).cast, true);
  await settle(context.game);
  assert.equal(context.opponentState.trace.filter(query => query.aiHint?.kind === 'taxCounter').length, 1);
  assert.equal(context.opponent.pool.C, 0, 'the chosen payment is still a real cost');
  assert.equal(bait.zone, 'battlefield');
});

test('local deterministic AI casts and resolves real Abrade and Deadly Dispute v4 fixtures', async t => {
  await t.test('AI selects Abrade mode and a legal opposing target', async () => {
    const context = gameContext({ ai: true, seed: 7411 });
    const victim = permanent(context.game, context.opponent,
      syntheticDefinition('AI Abrade victim', ['Creature'], { power: '2', toughness: '2' }));
    const raw = legacyCard('Abrade');
    const { fragment } = compileCard(raw);
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(context.game.stack[0].targets.length, 1);
    await settle(context.game);
    assert.equal(victim.zone, 'graveyard');
  });

  await t.test('AI pays Deadly Dispute sacrifice and receives both card and Treasure effects', async () => {
    const context = gameContext({ ai: true, seed: 7412 });
    fillLibrary(context.player, 6, 'AI Dispute draw');
    const sacrifice = permanent(context.game, context.player,
      syntheticDefinition('AI Dispute bauble', ['Artifact']));
    const raw = legacyCard('Deadly Dispute');
    const { fragment } = compileCard(raw);
    const handBefore = context.player.hand.length;
    const { cast } = await castFree(context, raw, fragment);
    assert.equal(cast, true);
    assert.equal(sacrifice.zone, 'graveyard');
    await settle(context.game);
    assert.equal(context.player.hand.length, handBefore + 2);
    assert.ok(context.game.bf().some(card => card.ctrl === context.player && card.hasSub('Treasure')));
  });
});
