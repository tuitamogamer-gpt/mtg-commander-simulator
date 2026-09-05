import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const intake = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-intake.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-oracle.json', import.meta.url), 'utf8'));
const worldShaperIntake = intake.decks.find(deck => deck.name === 'World Shaper');
const newNames = worldShaperIntake.missingNames;

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.search || query.aiHint?.kind === 'searchBasic'
    ? query.from.slice(0, 1) : query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(overrides = {}, count = 2) {
  const game = new MTG.Game({ seed: 230823, paced: false, maxTurns: 30 });
  const players = Array.from({ length: count }, (_, index) => {
    const controller = {
      decide: async (g, query) => overrides[index]?.[query.type]
        ? overrides[index][query.type](g, query)
        : defaultDecision(g, query),
    };
    return game.addPlayer(index ? `Opponent ${index}` : 'World', {
      name: index ? `Opponent ${index}` : 'World Shaper',
    }, controller, index > 0);
  });
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.tapped = opts.tapped ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 160) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 160, 'World Shaper trigger/stack petlja se nije smirila');
}

test('World Shaper deck and all 47 new Oracle cards are explicitly wired without duplicate legacy scripts', () => {
  const deck = MTG.DECKS['World Shaper'];
  assert.equal(deck.commander, 'Hearthhull, the Worldseed');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 87);
  assert.equal(newNames.length, 47);
  assert.equal(new Set(newNames).size, 47);
  assert.deepEqual(newNames.filter(name => !MTG.SCRIPTS[name]), []);
  assert.deepEqual(newNames.filter(name => !MTG.DEFS[name] || MTG.DEFS[name].simplified), []);

  const reported = oracle.cards.filter(card => newNames.includes(card.requestedName));
  assert.equal(reported.length, 47);
  assert.deepEqual([...new Set(reported.map(card => card.layout))], ['normal']);
  assert.equal(reported.some(card => card.keywords.includes('Station')), true);
  assert.equal(reported.some(card => card.keywords.includes('Dredge')), true);
  assert.equal(reported.some(card => card.keywords.includes('Retrace')), true);
  assert.equal(reported.some(card => card.keywords.includes('Landfall')), true);
  assert.deepEqual(newNames.filter(name => MTG.DEFS[name].engineGap), []);
  assert.equal(MTG.WORLD_SHAPER_ENGINE_GAPS, undefined);
});

test('Hearthhull stations by LKI, becomes a flying vigilant hasty creature, then pays a real land-sacrifice ability cost', async () => {
  const { game, players: [world, opponent] } = rulesGame();
  const hearthhull = permanent(game, world, 'Hearthhull, the Worldseed');
  const stationCreature = permanent(game, world, 'Titania, Protector of Argoth');
  const station = hearthhull.def.abilities[0];

  await station.run({ g: game, src: hearthhull, you: world, tappedCre: stationCreature, stationPower: stationCreature.power });
  assert.equal(hearthhull.counters.charge, stationCreature.power);
  await game.move(stationCreature, 'graveyard');
  await station.run({ g: game, src: hearthhull, you: world, tappedCre: stationCreature, stationPower: 4 });
  game.recalc();
  assert.equal(hearthhull.counters.charge, 9);
  assert.equal(hearthhull.is('Creature'), true);
  assert.equal(hearthhull.kw('flying'), true);
  assert.equal(hearthhull.kw('vigilance'), true);
  assert.equal(hearthhull.kw('haste'), true);

  permanent(game, world, 'Wastes');
  permanent(game, world, 'Wastes');
  inZone(world, 'Forest', 'library');
  inZone(world, 'Mountain', 'library');
  const handBefore = world.hand.length;
  const ability = game.activatableList(world).find(entry => entry.card === hearthhull && entry.ability === hearthhull.def.abilities[1]);
  assert.ok(ability);
  assert.equal(await game.activateAbility(world, ability), true);
  await resolveAll(game);
  assert.equal(world.graveyard.filter(card => card.name === 'Wastes').length, 1);
  assert.equal(world.hand.length, handBefore + 2);
  assert.equal(world.maxLands, 2);
  assert.equal(opponent.life, 38);
});

test('one sacrificed land drives Gitrog, Titania, Scouring Swarm, Juri, Mazirek and Hearthhull through central events', async () => {
  const { game, players: [world, opponent] } = rulesGame();
  const hearthhull = permanent(game, world, 'Hearthhull, the Worldseed');
  const gitrog = permanent(game, world, 'The Gitrog Monster');
  permanent(game, world, 'Titania, Protector of Argoth');
  permanent(game, world, 'Scouring Swarm');
  const juri = permanent(game, world, 'Juri, Master of the Revue');
  permanent(game, world, 'Mazirek, Kraul Death Priest');
  const land = permanent(game, world, 'Wastes');
  inZone(world, 'Forest', 'library');
  const handBefore = world.hand.length;

  assert.equal(await game.sacrifice(world, land), true);
  await resolveAll(game);

  assert.equal(opponent.life, 38);
  assert.equal(world.hand.length, handBefore + 1, 'Gitrog draws once for the single land event');
  assert.ok(juri.counters['+1/+1'] >= 2, 'Juri and Mazirek both add a counter to Juri');
  assert.equal(game.bf().some(card => card.isToken && card.name === 'Elemental Token' && card.power >= 5), true);
  assert.equal(game.bf().some(card => card.isToken && card.name === 'Insect Token' && card.tapped && card.kw('flying')), true);
  assert.equal(gitrog.zone, 'battlefield');
  assert.equal(hearthhull.zone, 'battlefield');
});

test('extra-land permissions, top play, graveyard lands and retrace are live engine permissions', () => {
  const { game, players: [world] } = rulesGame();
  permanent(game, world, 'Oracle of Mul Daya');
  const broodship = permanent(game, world, 'Exploration Broodship');
  broodship.counters.charge = 3;
  permanent(game, world, 'Szarel, Genesis Shepherd');
  const augur = permanent(game, world, 'Augur of Autumn');
  permanent(game, world, 'Aftermath Analyst');
  permanent(game, world, 'Titania, Protector of Argoth');
  const graveLand = inZone(world, 'Wastes', 'graveyard');
  const topCreature = inZone(world, 'Springbloom Druid', 'library');
  game.recalc();

  assert.equal(game.landPlayLimit(world), 3, 'Oracle plus Broodship each grant one additional land play');
  assert.equal(game.playableLands(world).includes(graveLand), true);
  assert.equal(augur.def.revealOwnTop, true, 'Augur privately reveals the library top to its controller');
  assert.equal(augur.def.playTop(game, augur, topCreature, world), true, 'Coven permits the top creature with three powers');
  assert.equal(MTG.DEFS['Formless Genesis'].retrace.altCostStr, '{2}{G}');
});

test('Dredge 2 executable replacement mills exactly two and returns Dakmor Salvage', async () => {
  const { game, players: [world] } = rulesGame();
  const dakmor = inZone(world, 'Dakmor Salvage', 'graveyard');
  inZone(world, 'Forest', 'library');
  inZone(world, 'Mountain', 'library');
  inZone(world, 'Wastes', 'library');

  assert.equal(await dakmor.def.dredge.replaceDraw(game, world, dakmor), true);
  assert.equal(dakmor.zone, 'hand');
  assert.equal(world.library.length, 1);
  assert.equal(world.graveyard.filter(card => card !== dakmor).length, 2);
  assert.equal(dakmor.def.engineGap, undefined);
});

test('X effects create exact tokens, move selected lands across zones, and preserve Formless Genesis characteristics', async () => {
  const overrides = {
    0: {
      chooseCards: (game, query) => query.prompt.startsWith('Put up to') ? query.from.slice(0, query.max) : defaultDecision(game, query),
    },
  };
  const { game, players: [world, opponent] } = rulesGame(overrides);
  const ring = permanent(game, opponent, 'Sol Ring');
  const hammer = permanent(game, opponent, 'Hammer of Purphoros');
  await MTG.DEFS['Pest Infestation'].resolve({
    g: game, src: null, you: world, x: 2, targets: [[ring, hammer]],
  });
  assert.equal(ring.zone, 'graveyard');
  assert.equal(hammer.zone, 'graveyard');
  assert.equal(game.bf().filter(card => card.isToken && card.name === 'Pest Token').length, 4);

  const handLand = inZone(world, 'Forest', 'hand');
  const graveLand = inZone(world, 'Mountain', 'graveyard');
  await MTG.DEFS["Worldsoul's Rage"].resolve({
    g: game, src: null, you: world, x: 2, targets: [opponent],
  });
  assert.equal(opponent.life, 38);
  assert.equal(handLand.zone, 'battlefield');
  assert.equal(graveLand.zone, 'battlefield');
  assert.equal(handLand.tapped && graveLand.tapped, true);

  inZone(world, 'Wastes', 'graveyard');
  inZone(world, 'Forest', 'graveyard');
  inZone(world, 'Mountain', 'graveyard');
  await MTG.DEFS['Formless Genesis'].resolve({ g: game, src: null, you: world });
  const shapeshifter = game.bf().find(card => card.isToken && card.name === 'Shapeshifter Token');
  assert.ok(shapeshifter);
  assert.equal(shapeshifter.power, world.graveyard.filter(card => card.is('Land')).length);
  assert.equal(shapeshifter.kw('deathtouch'), true);
  assert.equal(shapeshifter.cur.allCreatureTypes, true);
});

test('Courtyard, Hatchery and typed fetch lands execute their full token/life/search paths', async () => {
  const { game, players: [world] } = rulesGame();
  const forest = inZone(world, 'Forest', 'library');
  const courtyard = new MTG.CardInst(MTG.DEFS['Cabaretti Courtyard'], world);
  courtyard.zone = 'nowhere';
  await game.move(courtyard, 'battlefield', { ctrl: world });
  await resolveAll(game);
  assert.equal(courtyard.zone, 'graveyard');
  assert.equal(forest.zone, 'battlefield');
  assert.equal(forest.tapped, true);
  assert.equal(world.life, 41);

  const hatchery = permanent(game, world, 'Eumidian Hatchery');
  const manaEntry = game.activatableList(world).find(entry => entry.card === hatchery && entry.manaAbility);
  assert.ok(manaEntry);
  assert.equal(await game.activateAbility(world, manaEntry), true);
  assert.equal(world.life, 40);
  assert.equal(hatchery.counters.hatchling, 1);
  assert.equal(world.pool.B, 1);
  await game.sacrifice(world, hatchery);
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.isToken && card.name === 'Insect Token' && card.kw('flying')).length, 1);

  const valley = permanent(game, world, 'Mountain Valley');
  const mountain = inZone(world, 'Mountain', 'library');
  const fetch = game.activatableList(world).find(entry => entry.card === valley && entry.ability);
  assert.ok(fetch);
  assert.equal(await game.activateAbility(world, fetch), true);
  await resolveAll(game);
  assert.equal(valley.zone, 'graveyard');
  assert.equal(mountain.zone, 'battlefield');
  assert.equal(mountain.tapped, false);
});

test('Moraug schedules the next combat, untaps at its beginning, and tracks per-creature attack bonuses', async () => {
  const { game, players: [world] } = rulesGame();
  const moraug = permanent(game, world, 'Moraug, Fury of Akoum');
  const attacker = permanent(game, world, 'Springbloom Druid');
  attacker.tapped = true;
  const landfall = moraug.def.triggers.find(trigger => trigger.on === 'landfall');
  await landfall.run({ g: game, src: moraug, you: world, data: { card: permanent(game, world, 'Wastes') } });
  assert.equal(game._extraCombats, 1);
  await game.emit('beginCombat', { player: world });
  await resolveAll(game);
  assert.equal(attacker.tapped, false);

  const attacks = moraug.def.triggers.find(trigger => trigger.on === 'attacks');
  const before = attacker.power;
  await attacks.run({ g: game, src: moraug, you: world, data: { card: attacker } });
  assert.equal(attacker.power, before + 1);
  await attacks.run({ g: game, src: moraug, you: world, data: { card: attacker } });
  assert.equal(attacker.power, before + 2);
});

test('Exploration Broodship casts one real permanent spell from the graveyard at 8+ charge', async () => {
  const { game, players: [world] } = rulesGame();
  const broodship = permanent(game, world, 'Exploration Broodship');
  broodship.counters.charge = 8;
  permanent(game, world, 'Forest');
  permanent(game, world, 'Forest');
  permanent(game, world, 'Forest');
  const groundskeeper = inZone(world, 'Groundskeeper', 'graveyard');
  game.recalc();

  const entry = game.castableList(world).find(action => action.card === groundskeeper && action.from === 'graveyard' && action.alt?.broodship);
  assert.ok(entry);
  assert.equal(await game.castSpell(world, groundskeeper, { alt: entry.alt, from: entry.from }), true);
  await resolveAll(game);
  assert.equal(groundskeeper.zone, 'battlefield');
  assert.equal(world.graveyard.filter(card => card.name === 'Forest').length, 1);
  assert.equal(broodship.meta._broodshipCastTurn, game.turnNo);
  assert.equal(world.turnState.spellsCast, 1);
  assert.equal(groundskeeper.castMeta.from, 'graveyard');
  assert.equal(groundskeeper.castMeta.alt.broodship, true);
});

test('World Shaper completes deterministic full games in both seats without AI fallback', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'World Shaper', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 240823 },
    { humanDeck: 'Doom Prevails', aiDecks: ['World Shaper', 'Turtle Power', 'Elven Council'], seed: 240824 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({
      ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 200, paced: false,
    });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'World Shaper'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
