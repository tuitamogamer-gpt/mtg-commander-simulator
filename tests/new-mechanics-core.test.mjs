import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'orderTriggers') return q.triggers;
  return [];
}

function rulesGame(decide = defaultDecision) {
  const game = new MTG.Game({ seed: 230826, paced: false, maxTurns: 20 });
  const controller = { decide: async (g, q) => decide(g, q) };
  const player = game.addPlayer('Mechanics', { name: 'Mechanics' }, controller, false);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent' }, { decide: async (g, q) => defaultDecision(g, q) }, true);
  game.turnPlayer = player;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function def(name, extra = {}) {
  return Object.assign({
    name, cost: '{0}', types: ['Creature'], subtypes: [], super: [], kws: [],
    oracle: '', power: '1', toughness: '1', colors: [],
  }, extra);
}

function cardIn(player, definition, zone) {
  const card = new MTG.CardInst(definition, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, definition) {
  const card = new MTG.CardInst(definition, player);
  card.zone = 'battlefield';
  card.ctrl = player;
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('Dredge replaces one draw, mills the exact amount, and returns the selected card', async () => {
  let dredger;
  const { game, player } = rulesGame((g, q) => {
    if (q.aiHint?.kind === 'dredge') return `dredge:${dredger.iid}`;
    return defaultDecision(g, q);
  });
  dredger = cardIn(player, def('Grave Dredger', { dredge: 3 }), 'graveyard');
  for (let i = 0; i < 5; i++) cardIn(player, def(`Library ${i}`), 'library');

  const drawn = await game.draw(player, 1);

  assert.equal(drawn, 0);
  assert.equal(dredger.zone, 'hand');
  assert.equal(player.library.length, 2);
  assert.equal(player.graveyard.length, 3);
  assert.equal(player.turnState.drewThisTurn, 0);
});

test('Foretell pays two face down and permits the alternate-cost cast only on a later turn', async () => {
  const { game, player } = rulesGame();
  const foretold = cardIn(player, def('Future Answer', {
    types: ['Instant'], power: undefined, toughness: undefined,
    cost: '{4}{U}', foretell: { cost: '{1}{U}' },
  }), 'hand');
  player.pool.C = 6;
  const action = game.activatableList(player).find(entry => entry.card === foretold && entry.foretell);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(foretold.zone, 'exile');
  assert.equal(foretold.faceDown, true);
  assert.equal(game.castableList(player).some(entry => entry.card === foretold && entry.alt?.foretell), false);

  game.turnNo++;
  player.pool.U = 1;
  const cast = game.castableList(player).find(entry => entry.card === foretold && entry.alt?.foretell);
  assert.ok(cast);
  player.pool.C = 1;
  assert.equal(await game.castSpell(player, foretold, { from: 'exile', alt: cast.alt }), true);
  assert.equal(foretold.zone, 'stack');
  assert.equal(foretold.faceDown, false);
});

test('numeric cascade executes once per printed cascade instance', async () => {
  const { game, player } = rulesGame();
  const spell = cardIn(player, def('Double Cascade', {
    types: ['Sorcery'], power: undefined, toughness: undefined, cascade: 2,
    resolve: async () => {},
  }), 'hand');
  let cascades = 0;
  game.doCascade = async () => { cascades++; };
  assert.equal(await game.castSpell(player, spell), true);
  assert.equal(cascades, 2);
});

test('Tiered mode selection charges the chosen additional cost while keeping unaffordable tiers hidden', async () => {
  let chosenMode = -1;
  const { game, player } = rulesGame((g, q) => {
    if (q.aiHint?.kind === 'mode') return q.options.at(-1).key;
    return defaultDecision(g, q);
  });
  const spell = cardIn(player, def('Tiered Test', {
    types: ['Sorcery'], power: undefined, toughness: undefined, cost: '{1}',
    modes: { pick: 1, list: [
      { label: 'Small — {0}', tierCost: '{0}' },
      { label: 'Large — {3}', tierCost: '{3}' },
      { label: 'Impossible — {8}', tierCost: '{8}' },
    ] },
    resolve: async ctx => { chosenMode = ctx.mode[0]; },
  }), 'hand');
  player.pool.C = 4;
  assert.equal(await game.castSpell(player, spell), true);
  assert.equal(player.pool.C, 0);
  await game.resolveTop();
  assert.equal(chosenMode, 1);
});

test('Storm copies of Aura permanent spells resolve as attached Aura tokens', async () => {
  let host;
  const { game, player } = rulesGame((g, q) => {
    if (q.type === 'chooseTargets' && q.candidates.includes(host)) return [host];
    return defaultDecision(g, q);
  });
  host = permanent(game, player, def('Aura Host'));
  const setup = cardIn(player, def('Setup Spell', {
    types: ['Instant'], power: undefined, toughness: undefined, resolve: async () => {},
  }), 'hand');
  const aura = cardIn(player, def('Storm Aura', {
    types: ['Enchantment'], subtypes: ['Aura'], power: undefined, toughness: undefined,
    storm: true,
    targets: [{ what: 'creature', filter: (g, target) => target.zone === 'battlefield' && target.ctrl === player }],
  }), 'hand');
  assert.equal(await game.castSpell(player, setup), true);
  assert.equal(await game.castSpell(player, aura), true);
  assert.equal(game.stack.filter(item => item.card === aura).length, 2);
  await game.resolveTop();
  await game.resolveTop();
  const attached = game.bf().filter(card => card.name === 'Storm Aura' && card.attachedTo === host.iid);
  assert.equal(attached.length, 2);
  assert.ok(attached.some(card => card.isToken));
});

test('a battlefield flashback grant uses printed mana costs, exiles on resolution, and makes spells uncounterable', async () => {
  let resolved = false;
  const { game, player } = rulesGame();
  permanent(game, player, def('Flashback Master', { grantsFlashback: true, uncounterableSpells: true }));
  const spell = cardIn(player, def('Granted Flashback', {
    types: ['Instant'], power: undefined, toughness: undefined, cost: '{U}',
    resolve: async () => { resolved = true; },
  }), 'graveyard');
  const noCost = cardIn(player, def('No Mana Cost', {
    types: ['Sorcery'], power: undefined, toughness: undefined, cost: '',
  }), 'graveyard');
  player.pool.U = 1;
  const cast = game.castableList(player).find(entry => entry.card === spell && entry.alt?.flashback);
  assert.ok(cast);
  assert.equal(game.castableList(player).some(entry => entry.card === noCost && entry.alt?.flashback), false);
  assert.equal(await game.castSpell(player, spell, { from: 'graveyard', alt: cast.alt }), true);
  assert.equal(MTG.isUncounterable(game, game.stack.at(-1)), true);
  await game.resolveTop();
  assert.equal(resolved, true);
  assert.equal(spell.zone, 'exile');
});

test('colored-only mana can pay colored pips but never generic costs, including after it floats', async () => {
  const { game, player } = rulesGame();
  const source = permanent(game, player, def('Colored Wellspring', {
    mana: {
      cost: { tap: true }, coloredOnly: true,
      produce: [{ W: 1, U: 1, B: 1, R: 1, G: 1 }],
    },
  }));
  const manaSource = game.manaSources(player, null).find(entry => entry.card === source);
  await game.activateManaSource(player, manaSource, manaSource.produce[0], null, []);
  assert.equal(Object.values(player.coloredOnlyPool).reduce((sum, n) => sum + n, 0), 5);
  assert.equal(game.canPayMana(player, MTG.parseCost('{5}')), false);
  assert.equal(game.canPayMana(player, MTG.parseCost('{W}{U}{B}{R}{G}')), true);
  assert.equal(await game.payMana(player, MTG.parseCost('{W}{U}{B}{R}{G}')), true);
  assert.equal(Object.values(player.pool).reduce((sum, n) => sum + n, 0), 0);
  assert.equal(Object.values(player.coloredOnlyPool).reduce((sum, n) => sum + n, 0), 0);
});

test('Muldrotha-style permissions track the chosen permanent type and only one graveyard land despite extra drops', async () => {
  const { game, player } = rulesGame((g, q) => {
    if (q.aiHint?.kind === 'muldrothaType') return 'Artifact';
    return defaultDecision(g, q);
  });
  permanent(game, player, def('Grave Permission', { grantsGraveyardPermanentTypes: true }));
  permanent(game, player, def('Extra Land Permission', { additionalLandPlays: 2 }));
  const first = cardIn(player, def('First Artifact Creature', { types: ['Artifact', 'Creature'] }), 'graveyard');
  const second = cardIn(player, def('Second Artifact Creature', { types: ['Artifact', 'Creature'] }), 'graveyard');
  const landOne = cardIn(player, def('Grave Land One', { types: ['Land'], cost: null, power: undefined, toughness: undefined }), 'graveyard');
  const landTwo = cardIn(player, def('Grave Land Two', { types: ['Land'], cost: null, power: undefined, toughness: undefined }), 'graveyard');

  let cast = game.castableList(player).find(entry => entry.card === first && entry.alt?.muldrotha);
  assert.deepEqual([...cast.alt.muldrothaTypes], ['Artifact', 'Creature']);
  assert.equal(await game.castSpell(player, first, { from: 'graveyard', alt: cast.alt }), true);
  await game.resolveTop();
  assert.deepEqual(Array.from(player.turnState.gravePermanentTypesUsed), ['Artifact']);
  cast = game.castableList(player).find(entry => entry.card === second && entry.alt?.muldrotha);
  assert.deepEqual([...cast.alt.muldrothaTypes], ['Creature']);
  assert.equal(await game.castSpell(player, second, { from: 'graveyard', alt: cast.alt }), true);
  await game.resolveTop();
  assert.deepEqual(Array.from(player.turnState.gravePermanentTypesUsed), ['Artifact', 'Creature']);

  assert.ok(game.playableLands(player).includes(landOne));
  assert.equal(await game.playLand(player, landOne), true);
  assert.equal(game.playableLands(player).includes(landTwo), false);
  assert.equal(await game.playLand(player, landTwo), false);
  assert.equal(player.landsPlayed, 1);
});

test('Harmonize casts from the graveyard, uses one creature power for X, taps it, and exiles the spell', async () => {
  let helper;
  let resolvedX = -1;
  const { game, player } = rulesGame((g, q) => {
    if (q.aiHint?.kind === 'harmonize') return [helper];
    if (q.type === 'chooseX') return q.max;
    return defaultDecision(g, q);
  });
  helper = permanent(game, player, def('Power Helper', { power: '5', toughness: '5' }));
  const spell = cardIn(player, def('Grave Festival', {
    types: ['Sorcery'], power: undefined, toughness: undefined,
    cost: '{3}{R}', harmonize: { cost: '{X}{R}{R}' },
    resolve: async ctx => { resolvedX = ctx.x; },
  }), 'graveyard');
  player.pool.R = 2;
  const cast = game.castableList(player).find(entry => entry.card === spell && entry.alt?.harmonize);
  assert.ok(cast);
  assert.equal(await game.castSpell(player, spell, { from: 'graveyard', alt: cast.alt }), true);
  assert.equal(helper.tapped, true);
  await game.resolveTop();
  assert.equal(resolvedX, 5);
  assert.equal(spell.zone, 'exile');
});

test('an Omen uses the spell half and shuffles the card into its owner library after resolution', async () => {
  let resolved = false;
  const { game, player } = rulesGame();
  const omen = cardIn(player, def('Omen Dragon', {
    cost: '{5}{R}', power: '4', toughness: '4',
    adventure: {
      adventure: true, omen: true, name: 'Read the Omen', altCostStr: '{0}', types: 'Sorcery',
      resolve: async () => { resolved = true; },
    },
  }), 'hand');
  const cast = game.castableList(player).find(entry => entry.card === omen && entry.alt?.omen);
  assert.ok(cast);
  assert.equal(await game.castSpell(player, omen, { from: 'hand', alt: cast.alt }), true);
  await game.resolveTop();
  assert.equal(resolved, true);
  assert.equal(omen.zone, 'library');
  assert.ok(player.library.includes(omen));
  assert.equal(player.exile.includes(omen), false);
});

test('Ninjutsu returns an unblocked attacker as a cost and resolves tapped and attacking through the stack', async () => {
  let attacker;
  const { game, player, opponent } = rulesGame((g, q) => {
    if (q.aiHint?.kind === 'ninjutsuReturn') return [attacker];
    return defaultDecision(g, q);
  });
  attacker = permanent(game, player, def('Small Attacker'));
  attacker.attacking = opponent;
  const ninja = cardIn(player, def('Hidden Ninja', { ninjutsu: { cost: '{0}' } }), 'hand');
  game.phase = 'combat';
  game.step = 'blockers';
  game.combat = { attackers: [attacker], defenders: new Map() };

  const action = game.activatableList(player).find(entry => entry.card === ninja && entry.ninjutsu);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(attacker.zone, 'hand');
  assert.equal(ninja.zone, 'hand');
  assert.ok(game.stack.some(item => /Ninjutsu/.test(item.name)));
  await game.resolveTop();
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(ninja.tapped, true);
  assert.equal(ninja.attacking, opponent);
  assert.ok(game.combat.attackers.includes(ninja));
});

test('Shadow and fear use their exact blocker restrictions', () => {
  const { game, player, opponent } = rulesGame();
  const shadow = permanent(game, player, def('Shadow Attacker', { kws: ['shadow'] }));
  const normal = permanent(game, opponent, def('Normal Blocker'));
  const otherShadow = permanent(game, opponent, def('Shadow Blocker', { kws: ['shadow'] }));
  assert.equal(game.canBlock(normal, shadow), false);
  assert.equal(game.canBlock(otherShadow, shadow), true);
  assert.equal(game.canBlock(otherShadow, normal), false);

  const feared = permanent(game, player, def('Fear Attacker', { kws: ['fear'] }));
  const black = permanent(game, opponent, def('Black Blocker', { cost: '{B}' }));
  const artifact = permanent(game, opponent, def('Artifact Blocker', { types: ['Artifact', 'Creature'] }));
  assert.equal(game.canBlock(normal, feared), false);
  assert.equal(game.canBlock(black, feared), true);
  assert.equal(game.canBlock(artifact, feared), true);
});

test('Dauthi-style graveyard replacement exiles opponent cards with void counters from every zone', async () => {
  const { game, player, opponent } = rulesGame();
  permanent(game, player, def('Void Source', { opponentGraveyardVoid: true, kws: ['shadow'] }));
  const milled = cardIn(opponent, def('Milled Card'), 'library');
  await game.mill(opponent, 1);
  assert.equal(milled.zone, 'exile');
  assert.equal(milled.counters.void, 1);
  assert.equal(opponent.graveyard.includes(milled), false);

  const dying = permanent(game, opponent, def('Dying Card'));
  await game.destroy(dying);
  assert.equal(dying.zone, 'exile');
  assert.equal(dying.counters.void, 1);
  assert.equal(game.diedThisTurn.length, 0, 'replacement means the creature never dies');
});

test('a batch graveyard move preserves per-card events and emits one one-or-more event', async () => {
  const { game, player } = rulesGame();
  const watcher = permanent(game, player, def('Grave Watcher', {
    triggers: [
      { on: 'cardLeftGraveyard', run: async ctx => { ctx.src.meta.single = (ctx.src.meta.single || 0) + 1; } },
      { on: 'cardsLeftGraveyard', run: async ctx => { ctx.src.meta.batch = ctx.data.cards.length; } },
    ],
  }));
  const first = cardIn(player, def('Grave One'), 'graveyard');
  const second = cardIn(player, def('Grave Two'), 'graveyard');
  await game.moveGraveyardBatch([first, second], 'exile');
  while (game.pendingTriggers.length || game.stack.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(watcher.meta.single, 2);
  assert.equal(watcher.meta.batch, 2);
});

test('simultaneous discards emit one cards-to-graveyard event and Gitrog-style watchers draw only once', async () => {
  const { game, player } = rulesGame();
  const watcher = permanent(game, player, def('Gitrog Watcher', {
    triggers: [
      {
        on: 'cardToGraveyard',
        run: async ctx => { ctx.src.meta.single = (ctx.src.meta.single || 0) + 1; },
      },
      {
        on: 'cardsToGraveyard',
        filter: (g, source, data) => data.cards.some(card => card.owner === source.ctrl && card.is('Land')),
        run: async ctx => {
          ctx.src.meta.batchEvents = (ctx.src.meta.batchEvents || 0) + 1;
          ctx.src.meta.batchSize = ctx.data.cards.length;
        },
      },
    ],
  }));
  const landDef = name => def(name, { types: ['Land'], cost: null, power: undefined, toughness: undefined });
  const first = cardIn(player, landDef('Discard Land One'), 'hand');
  const second = cardIn(player, landDef('Discard Land Two'), 'hand');
  await game.discard(player, [first, second]);
  while (game.pendingTriggers.length || game.stack.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.equal(watcher.meta.single, 2);
  assert.equal(watcher.meta.batchEvents, 1);
  assert.equal(watcher.meta.batchSize, 2);
});

test('land entry replacement and filtered land costs are paid before effects without using the stack for mana', async () => {
  const { game, player } = rulesGame();
  permanent(game, player, def('Untapped Explorer', { landsEnterUntapped: true }));
  const tappedLand = cardIn(player, def('Normally Tapped Land', {
    types: ['Land'], cost: null, power: undefined, toughness: undefined, entersTapped: true,
  }), 'hand');
  await game.move(tappedLand, 'battlefield', { ctrl: player, tapped: true });
  assert.equal(tappedLand.tapped, false);

  const manaCreature = permanent(game, player, def('Land Furnace', {
    mana: {
      manual: true,
      cost: { tap: true, sac: (g, card) => card.is('Land') },
      produce: [{ R: 2 }],
    },
  }));
  const manaAction = game.activatableList(player).find(entry => entry.card === manaCreature && entry.manaAbility);
  assert.ok(manaAction);
  assert.equal(await game.activateAbility(player, manaAction), true);
  assert.equal(tappedLand.zone, 'graveyard');
  assert.equal(player.pool.R, 2);
  assert.equal(game.stack.some(item => item.srcCard === manaCreature || item.card === manaCreature), false);

  const soul = permanent(game, player, def('Filtered Discarder', {
    abilities: [{
      label: 'Discard land: gain 3',
      cost: { discard: { n: 1, filter: (g, card) => card.is('Land') } },
      run: async ctx => { await ctx.g.gainLife(ctx.you, 3); },
    }],
  }));
  const costLand = cardIn(player, def('Cost Land', {
    types: ['Land'], cost: null, power: undefined, toughness: undefined,
  }), 'hand');
  cardIn(player, def('Not A Land'), 'hand');
  const ability = game.activatableList(player).find(entry => entry.card === soul && entry.ability);
  assert.ok(ability);
  assert.equal(await game.activateAbility(player, ability), true);
  assert.equal(costLand.zone, 'graveyard');
  await game.resolveTop();
  assert.equal(player.life, 43);
});

test('spell and graveyard abilities pay selected land costs before their stack objects resolve', async () => {
  const { game, player } = rulesGame();
  const landDef = name => def(name, {
    types: ['Land'], cost: null, power: undefined, toughness: undefined,
    mana: { cost: { tap: true }, produce: [{ C: 1 }] },
  });
  const spellLand = permanent(game, player, landDef('Spell Cost Land'));
  const spell = cardIn(player, def('Land Cost Spell', {
    types: ['Sorcery'], power: undefined, toughness: undefined,
    addlCost: { sacLand: 1 }, resolve: async ctx => { ctx.src.meta.resolved = true; },
  }), 'hand');
  assert.equal(await game.castSpell(player, spell), true);
  assert.equal(spellLand.zone, 'graveyard');
  assert.equal(spell.zone, 'stack');
  assert.equal(spell.meta.resolved, undefined);
  await game.resolveTop();
  assert.equal(spell.meta.resolved, true);

  const returnOne = permanent(game, player, landDef('Return Land One'));
  const returnTwo = permanent(game, player, landDef('Return Land Two'));
  const graveSource = cardIn(player, def('Return From Grave', {
    gyAbility: {
      label: 'Return two lands', cost: '{0}', exileSelf: false,
      extraCost: { return: (g, card) => card.is('Land'), returnN: 2, allowMana: true },
      run: async ctx => { if (ctx.src.zone === 'graveyard') await ctx.g.move(ctx.src, 'hand'); },
    },
  }), 'graveyard');
  const gyAction = game.activatableList(player).find(entry => entry.card === graveSource && entry.gyAbility);
  assert.ok(gyAction);
  assert.equal(await game.activateAbility(player, gyAction), true);
  assert.equal(returnOne.zone, 'hand');
  assert.equal(returnTwo.zone, 'hand');
  assert.equal(graveSource.zone, 'graveyard');
  await game.resolveTop();
  assert.equal(graveSource.zone, 'hand');
});

test('targeted activated-ability reducers apply once, expose ability identity, and do not match trigger targets', async () => {
  const seen = [];
  let target;
  const { game, player } = rulesGame((g, q) => {
    if (q.type === 'chooseTargets' && q.candidates.includes(target)) return [target];
    return defaultDecision(g, q);
  });
  permanent(game, player, def('First Target Reducer', {
    abilityCostReduction: (g, source, context) =>
      source.ctrl.turnState.targetedAbilitiesActivated === 0 &&
      context.targets.some(card => card instanceof MTG.CardInst && card.is('Creature')) ? 2 : 0,
    triggers: [{
      on: 'targeted',
      filter: (g, source, data) => data.byPlayer === source.ctrl && data.isActivatedAbility,
      run: async ctx => { seen.push(ctx.data.ability?.label || 'equip'); },
    }],
  }));
  target = permanent(game, player, def('Ability Target'));
  const source = permanent(game, player, def('Targeted Activator', {
    abilities: [{
      label: 'Target a creature', cost: { mana: '{2}' },
      targets: [{ what: 'creature', filter: (g, card) => card.zone === 'battlefield' }],
      run: async () => {},
    }],
  }));
  const first = game.activatableList(player).find(entry => entry.card === source && entry.ability);
  assert.ok(first, 'the first targeted ability is reduced from {2} to {0}');
  assert.equal(await game.activateAbility(player, first), true);
  while (game.pendingTriggers.length || game.stack.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.deepEqual(seen, ['Target a creature']);
  assert.equal(player.turnState.targetedAbilitiesActivated, 1);
  assert.equal(game.activatableList(player).some(entry => entry.card === source && entry.ability), false,
    'the second targeted activation no longer receives the first-ability reduction');

  game.queueTrigger({
    src: source, ctrl: player, name: 'Triggered target',
    targets: [{ what: 'creature', filter: (g, card) => card === target }], run: async () => {},
  });
  while (game.pendingTriggers.length || game.stack.length) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.deepEqual(seen, ['Target a creature'], 'triggered abilities are not reported as activated abilities');
});

test('granted equip zero overrides printed alternatives, attached locks are conditional, and modified is exact', async () => {
  let equipTarget;
  const { game, player, opponent } = rulesGame((g, q) => {
    if (q.type === 'chooseTargets' && q.candidates.includes(equipTarget)) return [equipTarget];
    return defaultDecision(g, q);
  });
  equipTarget = permanent(game, player, def('Legendary Equip Target', { super: ['Legendary'] }));
  const equipment = permanent(game, player, def('Alternative Equipment', {
    types: ['Artifact'], subtypes: ['Equipment'], power: undefined, toughness: undefined,
    equip: '{5}', equipAlt: { cost: '{3}', filter: card => (card.def.super || []).includes('Legendary') },
  }));
  equipment.cur.equipCost = '{0}';
  const equip = game.activatableList(player).find(entry => entry.card === equipment && entry.equip);
  assert.ok(equip);
  assert.equal(await game.activateAbility(player, equip), true);
  await game.resolveTop();
  assert.equal(equipment.attachedTo, equipTarget.iid);
  assert.equal(game.isModifiedCreature(equipTarget), true);

  const lock = permanent(game, player, def('Attached Spell Lock', {
    types: ['Artifact'], subtypes: ['Equipment'], power: undefined, toughness: undefined,
    oppCantCastYourTurn: (g, source) => !!source.attachedTo,
  }));
  const opposingInstant = cardIn(opponent, def('Opposing Instant', {
    types: ['Instant'], power: undefined, toughness: undefined,
  }), 'hand');
  assert.equal(game.canCastTiming(opponent, opposingInstant), true);
  await game.attach(lock, equipTarget);
  assert.equal(game.canCastTiming(opponent, opposingInstant), false);

  const countered = permanent(game, player, def('Counter Modified'));
  game.addCounters(countered, 'shield', 1);
  assert.equal(game.isModifiedCreature(countered), true);
  const plain = permanent(game, player, def('Plain Creature'));
  assert.equal(game.isModifiedCreature(plain), false);
});

test('Evoke sacrifice is a respondable trigger and does not sacrifice during permanent resolution', async () => {
  const { game, player } = rulesGame();
  const creature = cardIn(player, def('Evoke Witness', {
    evoke: { cost: '{0}' },
    triggers: [{
      on: 'etb', desc: 'ETB marker',
      filter: (g, self, data) => data.card === self,
      run: async ctx => { ctx.src.meta.etbResolved = true; },
    }],
  }), 'hand');
  assert.equal(await game.castSpell(player, creature, { alt: { evoke: true, altCostStr: '{0}' } }), true);
  await game.resolveTop();

  assert.equal(creature.zone, 'battlefield');
  assert.ok(game.stack.some(item => /Evoke sacrifice/.test(item.name)));
  while (game.stack.length) await game.resolveTop();
  assert.equal(creature.meta.etbResolved, true);
  assert.equal(creature.zone, 'graveyard');
});

test('additional land plays stack across permanents and Eternalize makes a black 4/4 Zombie copy', async () => {
  const { game, player } = rulesGame();
  permanent(game, player, def('Explorer One', { additionalLandPlays: 1 }));
  permanent(game, player, def('Explorer Two', { additionalLandPlays: () => 1 }));
  const lands = Array.from({ length: 4 }, (_, i) => cardIn(player, def(`Test Land ${i}`, {
    types: ['Land'], cost: null, power: undefined, toughness: undefined,
  }), 'hand'));
  assert.equal(game.landPlayLimit(player), 3);
  assert.equal(await game.playLand(player, lands[0]), true);
  assert.equal(await game.playLand(player, lands[1]), true);
  assert.equal(await game.playLand(player, lands[2]), true);
  assert.equal(await game.playLand(player, lands[3]), false);

  const eternal = cardIn(player, def('Remembered Hero', {
    cost: '{3}{U}', eternalize: { cost: '{2}{U}' }, power: '2', toughness: '3',
  }), 'graveyard');
  player.pool.C = 2;
  player.pool.U = 1;
  const action = game.activatableList(player).find(entry => entry.card === eternal && entry.gyAbility);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  await game.resolveTop();
  const token = game.creatures(player).find(card => card.isToken && card.name === 'Remembered Hero');
  assert.ok(token);
  assert.equal(token.power, 4);
  assert.equal(token.toughness, 4);
  assert.ok(token.hasSub('Zombie'));
  assert.deepEqual([...token.cur.colors], ['B']);
  assert.equal(token.def.cost, '');
});
