import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function rulesGame(decider = defaultDecision) {
  const game = new MTG.Game({ seed: 8242601, paced: false, maxTurns: 20 });
  const player = game.addPlayer('Caster', { name: 'Cast Decisions' }, {
    decide: async (g, query) => decider(g, query),
  }, false);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent' }, {
    decide: async (g, query) => defaultDecision(g, query),
  }, true);
  game.turnPlayer = player;
  game.turnNo = 7;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function definition(name, extra = {}) {
  return Object.assign({
    name, cost: '{0}', super: [], types: ['Sorcery'], subtypes: [], kws: [], oracle: '',
  }, extra);
}

function inZone(player, cardDefinition, zone = 'hand') {
  const card = new MTG.CardInst(cardDefinition, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, cardDefinition) {
  const card = new MTG.CardInst(cardDefinition, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('free cast keeps X at zero while printed Storm and Cascade still trigger', async () => {
  const { game, player } = rulesGame();
  const spell = inZone(player, definition('Free Tempest', {
    cost: '{X}{5}{R}', storm: true, cascade: true, xCost: true,
    resolve: async () => {},
  }));
  player.turnState.spellsCast = 2;
  let cascades = 0;
  game.doCascade = async () => { cascades++; };

  assert.equal(await game.castSpell(player, spell, { from: 'hand', free: true, xVal: 9 }), true);

  const originals = game.stack.filter(item => item.card === spell && !item.isCopy);
  const copies = game.stack.filter(item => item.card === spell && item.isCopy);
  assert.equal(originals.length, 1);
  assert.equal(originals[0].x, 0, 'CR 107.3b still forces X=0');
  assert.equal(copies.length, 2, 'Storm counts both spells cast before the free spell');
  assert.equal(cascades, 1, 'printed Cascade triggers even when the mana cost was not paid');
});

test('free creature spell may pay kicker, squad, and offspring as real additional mana costs', async () => {
  const { game, player } = rulesGame((g, query) => {
    if (query.type === 'chooseOption' && ['kicker', 'offspring'].includes(query.aiHint?.kind)) return 'yes';
    if (query.type === 'chooseX' && query.aiHint?.kind === 'squad') return 1;
    return defaultDecision(g, query);
  });
  const creature = inZone(player, definition('Free Reinforcements', {
    cost: '{X}{7}{W}', types: ['Creature'], power: '3', toughness: '3', xCost: true,
    kicker: { cost: '{1}' }, squad: '{1}', offspring: '{1}',
  }));
  player.pool.C = 3;

  assert.equal(await game.castSpell(player, creature, { from: 'hand', free: true, xVal: 6 }), true);

  const spell = game.stack.find(item => item.card === creature && !item.isCopy);
  assert.ok(spell);
  assert.equal(spell.x, 0);
  assert.equal(spell.kicked, true);
  assert.equal(spell.squadN, 1);
  assert.equal(spell.offspring, true);
  assert.equal(spell.manaSpent, 3, 'only the three optional additional costs are paid');
  assert.equal(Object.values(player.pool).reduce((sum, value) => sum + value, 0), 0);
});

test('free modal spell must afford its tier and pays Strive for every target after the first', async () => {
  let selectedTargets = [];
  const decider = (g, query) => {
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'mode') return '0';
    if (query.type === 'chooseTargets') return selectedTargets;
    return defaultDecision(g, query);
  };
  const tieredStrive = definition('Free Tiered Strive', {
    cost: '{X}{8}{R}', xCost: true, strive: '{2}{R}',
    modes: { pick: 1, list: [{
      label: 'Focused tier — {2}', tierCost: '{2}',
      targets: [{
        what: 'creature', count: 2, min: 1, upTo: true,
        filter: (g, card, controller) => card.zone === 'battlefield' && card.is('Creature') && card.ctrl === controller,
        prompt: 'One or two creatures',
      }],
    }] },
    resolve: async () => {},
  });

  {
    const { game, player } = rulesGame(decider);
    selectedTargets = [
      permanent(game, player, definition('First target', { types: ['Creature'], power: '2', toughness: '2' })),
      permanent(game, player, definition('Second target', { types: ['Creature'], power: '2', toughness: '2' })),
    ];
    player.pool.C = 4;
    player.pool.R = 1;
    const spellCard = inZone(player, tieredStrive);

    assert.equal(await game.castSpell(player, spellCard, { from: 'hand', free: true, xVal: 4 }), true);
    const spell = game.stack.find(item => item.card === spellCard);
    assert.equal(spell.x, 0);
    assert.deepEqual(Array.from(spell.mode), [0]);
    assert.equal(spell.striveTargets, 2);
    assert.equal(spell.manaSpent, 5, '{2} tier plus {2}{R} for the second Strive target');
  }

  {
    const { game, player } = rulesGame(decider);
    selectedTargets = [permanent(game, player, definition('Only target', {
      types: ['Creature'], power: '2', toughness: '2',
    }))];
    player.pool.C = 1;
    const spellCard = inZone(player, tieredStrive);
    assert.equal(await game.castSpell(player, spellCard, { from: 'hand', free: true }), false,
      'without paying the mandatory tier additional cost, the free cast is illegal');
  }
});

test("spell copy keeps Zimone's odd/even cast choice but not later runtime bookkeeping", async () => {
  const { game, player } = rulesGame((g, query) => {
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'oddEvenBounce') return 'odd';
    if (query.type === 'chooseTargets') return [];
    return defaultDecision(g, query);
  });
  const odd = permanent(game, player, definition('Odd creature', {
    types: ['Creature'], power: '3', toughness: '3',
  }));
  const even = permanent(game, player, definition('Even creature', {
    types: ['Creature'], power: '4', toughness: '4',
  }));
  const hypothesis = inZone(player, MTG.DEFS["Zimone's Hypothesis"]);
  assert.equal(await game.castSpell(player, hypothesis, { from: 'hand', free: true }), true);
  const original = game.stack.find(item => item.card === hypothesis && !item.isCopy);
  assert.equal(original.quality, 'odd');

  original.manaSpent = 99;
  original.treasureUsed = true;
  original.convokedCards = [odd];
  original.countered = true;
  const copy = await game.copySpell(original, player, { mayNewTargets: false });

  assert.equal(copy.quality, 'odd');
  assert.equal(copy.manaSpent, undefined);
  assert.equal(copy.treasureUsed, undefined);
  assert.equal(copy.convokedCards, undefined);
  assert.equal(copy.countered, undefined);

  await game.resolveTop();
  assert.equal(odd.zone, 'hand');
  assert.equal(even.zone, 'battlefield');
});

test('Toxic Deluge copy reuses the life value paid for the original without paying life again', async () => {
  const { game, player } = rulesGame((g, query) => {
    if (query.type === 'chooseX' && query.aiHint?.kind === 'toxicDeluge') return 3;
    return defaultDecision(g, query);
  });
  const small = permanent(game, player, definition('Small creature', {
    types: ['Creature'], power: '2', toughness: '2',
  }));
  const large = permanent(game, player, definition('Large creature', {
    types: ['Creature'], power: '5', toughness: '5',
  }));
  const deluge = inZone(player, MTG.DEFS['Toxic Deluge']);
  player.pool.C = 2;
  player.pool.B = 1;

  assert.equal(await game.castSpell(player, deluge, { from: 'hand' }), true);
  const original = game.stack.find(item => item.card === deluge && !item.isCopy);
  assert.equal(original.additionalLifePaid, 3);
  assert.equal(player.life, 37);

  const copy = await game.copySpell(original, player, { mayNewTargets: false });
  assert.equal(copy.additionalLifePaid, 3);
  assert.equal(copy.manaSpent, undefined, 'mana-payment bookkeeping is not a copiable spell choice');
  assert.equal(player.life, 37, 'copying does not pay the additional cost again');

  await game.resolveTop();
  assert.equal(small.zone, 'graveyard');
  assert.equal(large.zone, 'battlefield');
  assert.equal(large.toughness, 2);
  assert.equal(player.life, 37);
});

test('copied permanent spell retains kicker/X/offspring/squad decisions without runtime payment state', async () => {
  const { game, player } = rulesGame((g, query) => {
    if (query.type === 'chooseOption' && ['kicker', 'offspring'].includes(query.aiHint?.kind)) return 'yes';
    if (query.type === 'chooseX' && query.aiHint?.kind === 'squad') return 1;
    return defaultDecision(g, query);
  });
  const creature = inZone(player, definition('Copied Progeny', {
    cost: '{X}{6}{G}', types: ['Creature'], power: '2', toughness: '2', xCost: true,
    kicker: { cost: '{1}' }, offspring: '{1}', squad: '{1}',
    etbCounters: {
      kind: '+1/+1',
      n: (g, card) => card.castMeta?.kicked ? card.castMeta.x + 2 : 0,
    },
    triggers: [{
      on: 'etb',
      filter: (g, self, data) => data.card === self,
      run: async ctx => {
        const n = ctx.src.meta.paidTimes || 0;
        if (n > 0) await ctx.g.copyPermanentToken(ctx.src, ctx.you, { n });
      },
    }],
  }));
  player.pool.C = 3;

  assert.equal(await game.castSpell(player, creature, { from: 'hand', free: true, xVal: 8 }), true);
  const original = game.stack.find(item => item.card === creature && !item.isCopy);
  assert.equal(original.x, 0);
  assert.equal(original.manaSpent, 3, 'only kicker, offspring, and one squad payment were paid');

  const copy = await game.copySpell(original, player, { mayNewTargets: false });
  await game.resolveTop();
  while (game.stack.at(-1)?.kind === 'trigger') await game.resolveTop();

  const resolvedTokens = game.creatures(player).filter(card => card.name === creature.name && card.isToken);
  assert.equal(resolvedTokens.length, 3, 'copied permanent plus its paid offspring and squad tokens');
  const mainCopy = resolvedTokens.find(card => card.castMeta);
  const derivedCopies = resolvedTokens.filter(card => !card.castMeta);
  assert.ok(mainCopy);
  assert.equal(derivedCopies.length, 2);
  assert.equal(mainCopy.castMeta.x, 0);
  assert.equal(mainCopy.castMeta.kicked, true);
  assert.equal(mainCopy.castMeta.manaSpent, undefined);
  assert.equal(mainCopy.counters['+1/+1'], 2, 'kicker/X ETB observes the copied cast decisions');
  assert.equal(derivedCopies.some(card => card.power === 1 && card.toughness === 1), true, 'offspring is the 1/1 copy');
  assert.equal(derivedCopies.some(card => card.power === 2 && card.toughness === 2), true, 'squad is an unmodified copy');
  assert.equal(Object.values(player.pool).reduce((sum, value) => sum + value, 0), 0,
    'copy and offspring trigger never pay the costs a second time');

  await game.resolveTop();
  while (game.stack.at(-1)?.kind === 'trigger') await game.resolveTop();
  assert.equal(creature.zone, 'battlefield');
  assert.equal(creature.meta.paidTimes, 1, 'fresh battlefield object retains only the Squad paid-count choice');
  assert.equal(game.creatures(player).filter(card => card.name === creature.name).length, 6,
    'physical original also creates exactly one offspring and one squad token');
});

test('legacy AI accepts and pays optional additional costs on a free cast with an unaffordable printed cost', async () => {
  const { game, player } = rulesGame();
  player.isAI = true;
  player.controller = new MTG.AIController(player, { difficulty: 'tough' });
  const creature = inZone(player, definition('AI Free Progeny', {
    cost: '{9}{W}', types: ['Creature'], power: '2', toughness: '2',
    kicker: { cost: '{1}' }, offspring: '{1}',
  }));
  player.pool.C = 2;

  assert.equal(await game.castSpell(player, creature, { from: 'hand', free: true }), true);
  const spell = game.stack.find(item => item.card === creature);
  assert.equal(spell.kicked, true);
  assert.equal(spell.offspring, true);
  assert.equal(spell.manaSpent, 2);
  assert.equal(Object.values(player.pool).reduce((sum, value) => sum + value, 0), 0);
});

test('physical multikicker permanent retains paidTimes through entry and supports exactly one chosen target', async () => {
  let opponent;
  const { game, player, opponent: other } = rulesGame((g, query) => {
    if (query.type === 'chooseX' && query.aiHint?.kind === 'squad') return 1;
    if (query.type === 'chooseTargets' && query.candidates.includes(opponent)) return [opponent];
    return defaultDecision(g, query);
  });
  opponent = other;
  const batroc = inZone(player, MTG.DEFS['Batroc the Leaper']);
  player.pool.C = 3;
  player.pool.R = 1;

  assert.equal(await game.castSpell(player, batroc, { from: 'hand' }), true);
  await game.resolveTop();
  while (game.stack.at(-1)?.kind === 'trigger') await game.resolveTop();

  assert.equal(batroc.zone, 'battlefield');
  assert.equal(batroc.meta.paidTimes, 1);
  assert.equal(batroc.counters['+1/+1'], 1);
  assert.equal(opponent.life, 37, 'single target receives Batroc current power without scalar-iteration failure');
});

test('free cast applies total-cost reductions after optional generic costs while still dropping the printed base', async () => {
  const { game, player } = rulesGame((g, query) => {
    if (query.type === 'chooseOption' && query.aiHint?.kind === 'kicker') return 'yes';
    return defaultDecision(g, query);
  });
  permanent(game, player, definition('One-Mana Reducer', {
    types: ['Creature'], power: '1', toughness: '1',
    costMods: [() => -1],
  }));
  const spellCard = inZone(player, definition('Reduced Free Kicker', {
    cost: '{8}{U}', kicker: { cost: '{2}' }, resolve: async () => {},
  }));
  player.pool.C = 1;

  assert.equal(await game.castSpell(player, spellCard, { from: 'hand', free: true }), true);
  const spell = game.stack.find(item => item.card === spellCard);
  assert.equal(spell.kicked, true);
  assert.equal(spell.manaSpent, 1, 'printed {8}{U} is zero; the -1 reducer applies to kicker {2}');
  assert.equal(Object.values(player.pool).reduce((sum, value) => sum + value, 0), 0);
});

test('successful zero-mana free cast consumes an applicable one-shot cost reduction', async () => {
  const { game, player } = rulesGame();
  const spellCard = inZone(player, definition('Free Reduction Consumer', {
    cost: '{5}{U}', resolve: async () => {},
  }));
  player.tempReductions = [{ once: true, delta: -2, filter: (g, card) => card === spellCard }];

  assert.equal(await game.castSpell(player, spellCard, { from: 'hand', free: true }), true);
  assert.equal(game.stack.find(item => item.card === spellCard).manaSpent, 0);
  assert.deepEqual(player.tempReductions, []);
});
