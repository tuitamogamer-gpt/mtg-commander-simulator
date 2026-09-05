import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

const NEW_CARDS = [
  'Ashling, the Limitless', 'Flamebraider', 'Smokebraider', 'Eclipsed Flamekin', 'Endurance',
  'Incandescent Soulstoke', 'Realmwalker', 'Risen Reef', 'Selvala, Heart of the Wilds',
  'Foundation Breaker', 'Omnath, Locus of the Roil', 'Slithermuse', 'Cavalier of Thorns', 'Fury',
  'Horde of Notions', 'Ingot Chewer', 'Jegantha, the Wellspring', 'Mass of Mysteries', 'Mulldrifter',
  'Shimmercreep', 'Shriekmaw', 'Subterfuge', 'Yarok, the Desecrated', 'Bane of Progress',
  'Belonging', 'Greenwarden of Murasa', 'Jubilation', 'Lamentation', 'Muldrotha, the Gravetide',
  'Vernal Sovereign', 'Avenger of Zendikar', 'Impulsivity', 'Omnath, Locus of Rage',
  'Titan of Industry', 'Maelstrom Wanderer', 'Crib Swap', 'Return of the Wildspeaker',
  'Kindred Summons', "Kodama's Reach", 'Distant Melody', 'Shatter the Sky', 'Elemental Spectacle',
  'Haunting Voyage', 'Timeless Lotus', 'Abundant Growth', 'Cream of the Crop', 'Fertile Ground',
  'Hoofprints of the Stag', 'Springleaf Parade', "Descendants' Fury", 'Abundant Countryside',
  'Ancient Ziggurat', 'Flamekin Village', 'Frontier Bivouac', 'Jungle Shrine', 'Opal Palace',
  'Opulent Palace', 'Primal Beyond',
];

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 906301, paced: false, maxTurns: 100 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Elements',
    { name: index ? `Opponent deck ${index}` : 'Dance of the Elements' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0]; game.turnNo = 20; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = opts.ctrl || player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card); game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone; player[zone].push(card); return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 600) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 600, 'Dance of the Elements stack did not settle');
}

test('Dance of the Elements has the exact 100-card shell and explicit scripts for all 58 new cards', () => {
  const deck = MTG.DECKS['Dance of the Elements'];
  assert.equal(deck.commander, 'Ashling, the Limitless');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 89);
  assert.equal(NEW_CARDS.length, 58);
  for (const name of NEW_CARDS) {
    assert.ok(MTG.SCRIPTS[name], `${name} needs an explicit Elements script`);
    assert.ok(MTG.DEFS[name], `${name} needs a card definition`);
    assert.equal(MTG.DEFS[name].simplified, undefined, `${name} may not use fallback simplification`);
  }
  assert.equal(MTG.DEFS.Realmwalker.revealOwnTop, true, 'Realmwalker privately reveals the library top to its controller');
});

test('Ashling exposes granted evoke to human/AI cast lists and echoes a sacrificed nontoken Elemental', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  permanent(game, elements, 'Ashling, the Limitless');
  const drifter = inZone(elements, 'Mulldrifter', 'hand');
  elements.pool.C = 4;
  const option = game.castableList(elements).find(entry => entry.card === drifter && entry.alt?.ashlingEvoke);
  assert.ok(option, 'Ashling-granted evoke is a real cast option');

  const reef = permanent(game, elements, 'Risen Reef');
  await game.sacrifice(elements, reef);
  await resolveAll(game);
  const echo = game.creatures(elements).find(card => card.isToken && card.name === 'Risen Reef');
  assert.ok(echo);
  assert.equal(echo.kw('haste'), true);
  await game.emit('endStep', { player: elements });
  await resolveAll(game);
  assert.notEqual(echo.zone, 'battlefield', 'unpaid Ashling echo is sacrificed at the next end step');
});

test('evoke resolves ETB interaction then sacrifices Foundation Breaker', async () => {
  const { game, players: [elements, opponent] } = rulesGame([], 2);
  const target = permanent(game, opponent, 'Arcane Signet');
  const breaker = inZone(elements, 'Foundation Breaker', 'hand');
  elements.pool.G = 1; elements.pool.C = 1;
  const alt = breaker.def.altCosts.find(option => option.evoke);
  assert.equal(await game.castSpell(elements, breaker, { alt, from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(target.zone, 'graveyard');
  assert.equal(breaker.zone, 'graveyard');
});

test('pitch evoke exiles the chosen colored card through the shared cast path', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const endurance = inZone(elements, 'Endurance', 'hand');
  const pitch = inZone(elements, 'Rampant Growth', 'hand');
  const alt = endurance.def.altCosts.find(option => option.pitchColor === 'G');
  assert.equal(await game.castSpell(elements, endurance, { alt, from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(pitch.zone, 'exile');
  assert.equal(endurance.zone, 'library', 'Endurance can shuffle itself in after its evoke sacrifice resolves first');
});

test('encore makes one forced-attacking copy per opponent and schedules sacrifice', async () => {
  const { game, players: [elements, one, two] } = rulesGame([], 3);
  const belonging = inZone(elements, 'Belonging', 'graveyard');
  await belonging.def.gyAbility.run({ g: game, src: belonging, you: elements, targets: [] });
  await resolveAll(game);
  const copies = game.creatures(elements).filter(card => card.isToken && card.name === 'Belonging');
  assert.equal(copies.length, 2);
  assert.deepEqual(new Set(copies.map(card => card.meta.mustAttackPlayer)), new Set([one, two]));
  assert.equal(game.creatures(elements).filter(card => card.isToken && card.hasSub('Shapeshifter')).length, 6);
});

test('vivid counts five colors and Elemental Spectacle makes five 5/5 tokens', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  for (const name of ['Belonging', 'Mulldrifter', 'Lamentation', 'Impulsivity', 'Avenger of Zendikar']) {
    permanent(game, elements, name);
  }
  const spectacle = new MTG.CardInst(MTG.DEFS['Elemental Spectacle'], elements);
  await spectacle.def.resolve({ g: game, src: spectacle, you: elements, targets: [], so: { castOpts: {} } });
  assert.equal(game.creatures(elements).filter(card => card.isToken && card.name === 'Elemental Token' && card.power === 5).length, 5);
});

test('Haunting Voyage uses the real face-down foretell lifecycle and returns every chosen-type creature', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const one = inZone(elements, 'Risen Reef', 'graveyard');
  const two = inZone(elements, 'Mulldrifter', 'graveyard');
  for (let index = 0; index < 8; index++) inZone(elements, 'Forest', 'library');
  const voyage = inZone(elements, 'Haunting Voyage', 'hand');
  elements.pool.C = 7;
  const action = game.activatableList(elements).find(entry => entry.card === voyage && entry.foretell);
  assert.ok(action);
  assert.equal(await game.activateAbility(elements, action), true);
  assert.equal(voyage.zone, 'exile');
  assert.equal(voyage.faceDown, true);
  assert.equal(game.castableList(elements).some(entry => entry.card === voyage && entry.alt?.foretell), false);

  game.turnNo++;
  elements.pool.B = 2;
  const cast = game.castableList(elements).find(entry => entry.card === voyage && entry.alt?.foretell);
  assert.ok(cast);
  assert.equal(cast.alt.altCostStr, '{5}{B}{B}');
  assert.equal(await game.castSpell(elements, voyage, { from: 'exile', alt: cast.alt }), true);
  await resolveAll(game);
  assert.equal(voyage.faceDown, false);
  assert.equal(one.zone, 'battlefield');
  assert.equal(two.zone, 'battlefield');
});

test('Jegantha mana pays WUBRG pips but cannot pay generic costs', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const jegantha = permanent(game, elements, 'Jegantha, the Wellspring');
  assert.equal(jegantha.def.mana.coloredOnly, true);
  const source = game.manaSources(elements, null).find(entry => entry.card === jegantha);
  assert.ok(source);
  await game.activateManaSource(elements, source, source.produce[0], null, []);
  assert.equal(game.canPayMana(elements, MTG.parseCost('{5}')), false);
  assert.equal(game.canPayMana(elements, MTG.parseCost('{W}{U}{B}{R}{G}')), true);
});

test('Muldrotha uses one shared graveyard spell permission per chosen permanent type', async () => {
  const { game, players: [elements] } = rulesGame([
    (g, query) => query.aiHint?.kind === 'muldrothaType' ? 'Artifact' : defaultDecision(g, query),
  ], 2);
  permanent(game, elements, 'Muldrotha, the Gravetide');
  for (let index = 0; index < 6; index++) inZone(elements, 'Forest', 'library');
  const multiType = inZone(elements, 'Academy Manufactor', 'graveyard');
  const secondArtifact = inZone(elements, 'Arcane Signet', 'graveyard');
  const creature = inZone(elements, 'Risen Reef', 'graveyard');
  elements.pool.C = 12; elements.pool.G = 3; elements.pool.U = 3;

  const first = game.castableList(elements).find(entry => entry.card === multiType && entry.alt?.muldrotha);
  assert.equal(first.alt.muldrothaTypes.join(','), 'Artifact,Creature');
  assert.equal(await game.castSpell(elements, multiType, { from: 'graveyard', alt: first.alt }), true);
  await resolveAll(game);
  assert.equal(elements.turnState.gravePermanentTypesUsed.join(','), 'Artifact');
  assert.equal(game.castableList(elements).some(entry => entry.card === secondArtifact && entry.alt?.muldrotha), false);

  const differentType = game.castableList(elements).find(entry => entry.card === creature && entry.alt?.muldrotha);
  assert.ok(differentType);
  assert.equal(differentType.alt.muldrothaTypes.join(','), 'Creature');
  assert.equal(await game.castSpell(elements, creature, { from: 'graveyard', alt: differentType.alt }), true);
  await resolveAll(game);
  assert.equal(elements.turnState.gravePermanentTypesUsed.join(','), 'Artifact,Creature');
});

test('Muldrotha permits only one graveyard land even with an additional land play', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  permanent(game, elements, 'Muldrotha, the Gravetide');
  permanent(game, elements, 'Oracle of Mul Daya');
  const first = inZone(elements, 'Forest', 'graveyard');
  const second = inZone(elements, 'Island', 'graveyard');
  assert.equal(game.landPlayLimit(elements), 2);
  assert.ok(game.playableLands(elements).includes(first));
  assert.ok(game.playableLands(elements).includes(second));
  assert.equal(await game.playLand(elements, first), true);
  assert.ok(elements.turnState.gravePermanentTypesUsed.includes('Land'));
  assert.equal(game.playableLands(elements).includes(second), false);
  assert.equal(await game.playLand(elements, second), false);
  assert.equal(second.zone, 'graveyard');
});

test('Maelstrom Wanderer uses numeric double cascade and grants team haste', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const wanderer = inZone(elements, 'Maelstrom Wanderer', 'hand');
  assert.equal(wanderer.def.cascade, 2);
  assert.equal((wanderer.def.triggers || []).some(trigger => trigger.desc === 'Second cascade'), false);
  for (const color of ['G', 'U', 'R']) elements.pool[color] = 1;
  elements.pool.C = 5;
  let cascades = 0;
  game.doCascade = async () => { cascades++; };
  assert.equal(await game.castSpell(elements, wanderer, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(cascades, 2);
  assert.equal(wanderer.kw('haste'), true);
});

test('Fury locks a visible 1/3 damage split before its ETB trigger resolves', async () => {
  let first;
  let second;
  const { game, players: [elements, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseTargets' && query.candidates.includes(first) && query.candidates.includes(second)) return [first, second];
      if (query.type === 'chooseX' && query.allocation?.kind === 'damage') return query.allocation.index === 0 ? 1 : 3;
      return defaultDecision(g, query);
    },
  ], 2);
  const fury = permanent(game, elements, 'Fury');
  first = permanent(game, opponent, 'Bastion Protector');
  second = permanent(game, opponent, 'Bane of Progress');
  await game.emit('etb', { card: fury, ctrl: elements });
  await resolveAll(game);
  assert.equal(first.damage, 1);
  assert.equal(second.zone, 'graveyard', 'the three-damage share destroys the 2/2 target');
});

test('Titan of Industry makes both ETB choices and targets before the trigger resolves', async () => {
  let shieldTarget;
  const { game, players: [elements] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseMulti' && query.prompt.includes('Titan of Industry')) return ['2', '3'];
      if (query.type === 'chooseTargets' && query.candidates.includes(shieldTarget)) return [shieldTarget];
      return defaultDecision(g, query);
    },
  ], 2);
  shieldTarget = permanent(game, elements, 'Risen Reef');
  const titan = permanent(game, elements, 'Titan of Industry');
  await game.emit('etb', { card: titan, ctrl: elements });
  await resolveAll(game);
  assert.equal(shieldTarget.counters.shield, 1);
  assert.equal(game.creatures(elements).filter(card => card.isToken && card.hasSub('Rhino')).length, 1);
});

test("Kodama's Reach puts one chosen basic tapped onto the battlefield and another into hand", async () => {
  const { game, players: [elements] } = rulesGame([
    (g, query) => query.search && query.type === 'chooseCards' ? query.from.slice(0, 1) : defaultDecision(g, query),
  ], 2);
  const forest = inZone(elements, 'Forest', 'library');
  const island = inZone(elements, 'Island', 'library');
  const reach = new MTG.CardInst(MTG.DEFS["Kodama's Reach"], elements);
  await reach.def.resolve({ g: game, src: reach, you: elements, targets: [], so: { castOpts: {} } });
  assert.equal([forest, island].filter(card => card.zone === 'battlefield').length, 1);
  assert.equal([forest, island].filter(card => card.zone === 'hand').length, 1);
  assert.equal([forest, island].find(card => card.zone === 'battlefield').tapped, true);
});

test('Risen Reef, landfall, and restricted tribal mana execute without fallback paths', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const reef = permanent(game, elements, 'Risen Reef');
  const top = inZone(elements, 'Forest', 'library');
  await game.emit('etb', { card: reef, ctrl: elements });
  await resolveAll(game);
  assert.equal(top.zone, 'battlefield');
  assert.equal(top.tapped, true);

  const ziggurat = permanent(game, elements, 'Ancient Ziggurat');
  const mana = ziggurat.def.mana;
  assert.equal(mana.restrict(game, { card: new MTG.CardInst(MTG.DEFS.Mulldrifter, elements) }), true);
  assert.equal(mana.restrict(game, { card: new MTG.CardInst(MTG.DEFS['Distant Melody'], elements) }), false);
});

test('Opal Palace restricted mana applies the linked commander counters on entry', async () => {
  const { game, players: [elements] } = rulesGame([], 2);
  const palace = permanent(game, elements, 'Opal Palace');
  const ability = palace.def.mana[1];
  const commander = inZone(elements, 'Ashling, the Limitless', 'command');
  commander.commander = true;
  commander.cmdCasts = 1;
  const ordinary = new MTG.CardInst(MTG.DEFS.Mulldrifter, elements);
  assert.equal(ability.restrict(game, { card: ordinary }), false);
  assert.equal(ability.restrict(game, { card: commander }), true);
  await ability.onProduce(game, palace, elements, { U: 1 }, { card: commander });
  await game.move(commander, 'battlefield', { ctrl: elements });
  await resolveAll(game);
  assert.equal(commander.counters['+1/+1'], 2, 'the second command-zone cast enters with two counters');
});

test('Dance of the Elements completes deterministic full games in both seats without AI fallback', { timeout: 80_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Dance of the Elements', aiDecks: ['Turtle Power', 'Elven Council', 'Most Wanted'], seed: 906311 },
    { humanDeck: 'Turtle Power', aiDecks: ['Dance of the Elements', 'Elven Council', 'Most Wanted'], seed: 906312 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({ ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 220, paced: false });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Dance of the Elements'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
