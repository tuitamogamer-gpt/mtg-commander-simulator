import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(overrides = {}, count = 3) {
  const game = new MTG.Game({ seed: 140814, paced: false, maxTurns: 30 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => index === 0 && overrides[q.type]
      ? overrides[q.type](g, q)
      : defaultDecision(g, q),
  }));
  const players = controllers.map((controller, index) =>
    game.addPlayer(index ? `Opponent ${index}` : 'Counter', {
      name: index ? `Opp ${index}` : 'Counter Intelligence',
    }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players, controllers };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false;
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
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 120) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 120, 'trigger/stack petlja se nije smirila');
}

test('Counter Intelligence ima tačno 100 karata, 94 jedinstvene i puni AI profil', () => {
  const deck = MTG.DECKS['Counter Intelligence'];
  assert.equal(deck.commander, 'Inspirit, Flagship Vessel');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 94);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Counter Intelligence').archetype, 'Charge-counter artifacts');
});

test('Kilo proliferira kad ga Station tapuje i njegov trigger povećava power prije Station rezolucije', async () => {
  const { game, players: [counter] } = rulesGame({
    chooseTargets: (g, q) => q.aiHint?.goal === 'proliferate' ? q.candidates.slice() : q.candidates.slice(0, q.min || 0),
  }, 2);
  const inspirit = permanent(game, counter, 'Inspirit, Flagship Vessel');
  const kilo = permanent(game, counter, 'Kilo, Apogee Mind');
  inspirit.counters.charge = 1;
  kilo.counters['+1/+1'] = 1;
  game.recalc();
  const beforePower = kilo.power;
  const entry = game.activatableList(counter).find(action => action.card === inspirit);
  assert.ok(entry);
  assert.equal(await game.activateAbility(counter, entry), true);
  assert.equal(kilo.counters['+1/+1'], 2);
  assert.equal(inspirit.counters.charge, 2 + beforePower + 1,
    'proliferate je prvo dodao charge i povećao Kilo power, pa Station koristi novi power');
  assert.equal((kilo.def.abilities || []).length, 0, 'Kilo nema izmišljenu ručnu tap sposobnost');
});

test('Station koristi power na rezoluciji, a LKI ako tapnuto stvorenje napusti battlefield', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const inspirit = permanent(game, counter, 'Inspirit, Flagship Vessel');
  const kilo = permanent(game, counter, 'Kilo, Apogee Mind');
  const station = inspirit.def.abilities[0];
  const initial = kilo.power;
  kilo.counters['+1/+1'] = 2;
  game.recalc();
  await station.run({ g: game, src: inspirit, you: counter, tappedCre: kilo, stationPower: initial });
  assert.equal(inspirit.counters.charge, initial + 2);
  const lki = kilo.power;
  await game.move(kilo, 'graveyard');
  await station.run({ g: game, src: inspirit, you: counter, tappedCre: kilo, stationPower: lki });
  assert.equal(inspirit.counters.charge, initial + 2 + lki);
});

test('proliferate poštuje ljudski izbor, poison igrače i Tekuthalov zaseban drugi izbor', async () => {
  let calls = 0;
  let reactor;
  let walker;
  const { game, players: [counter, opponent] } = rulesGame({
    chooseTargets: (g, q) => {
      if (q.aiHint?.goal !== 'proliferate') return q.candidates.slice(0, q.min || 0);
      calls++;
      return calls === 1 ? [reactor, opponent] : [walker];
    },
  }, 2);
  permanent(game, counter, 'Tekuthal, Inquiry Dominus');
  reactor = permanent(game, counter, 'Darksteel Reactor');
  walker = permanent(game, counter, 'Hangarback Walker');
  reactor.counters.charge = 3;
  walker.counters['+1/+1'] = 2;
  opponent.poison = 4;
  await MTG.E.proliferate(game, counter);
  assert.equal(calls, 2);
  assert.equal(reactor.counters.charge, 4);
  assert.equal(walker.counters['+1/+1'], 3);
  assert.equal(opponent.poison, 5);
});

test('AI proliferate bira vlastite korisne, protivničke štetne i protivnički poison, ali ne vlastiti poison', () => {
  const { game, players: [counter, opponent] } = rulesGame({}, 2);
  const ai = new MTG.AIController(counter, { difficulty: 'tough' });
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  const poisonedMine = permanent(game, counter, 'Kilo, Apogee Mind');
  const weakenedEnemy = permanent(game, opponent, 'Kilo, Apogee Mind');
  reactor.counters.charge = 2;
  poisonedMine.counters['-1/-1'] = 1;
  weakenedEnemy.counters['-1/-1'] = 1;
  counter.poison = 2;
  opponent.poison = 3;
  const picked = ai.chooseTargets(game, {
    candidates: [reactor, poisonedMine, weakenedEnemy, counter, opponent], min: 0, max: 5,
    aiHint: { goal: 'proliferate' },
  });
  assert.deepEqual(new Set(picked), new Set([reactor, weakenedEnemy, opponent]));
});

test('Chaos Warp nudi commander replacement za biblioteku i ne gubi Inspirit u decku', async () => {
  const { game, players: [counter] } = rulesGame({
    chooseOption: (g, q) => q.options.some(option => option.key === 'cz') ? 'cz' : q.options[0]?.key,
  }, 2);
  const inspirit = permanent(game, counter, 'Inspirit, Flagship Vessel', { commander: true });
  inZone(counter, 'Island', 'library');
  await MTG.DEFS['Chaos Warp'].resolve({ g: game, src: null, you: counter, targets: [inspirit] });
  assert.equal(inspirit.zone, 'command');
  assert.equal(counter.command.includes(inspirit), true);
  assert.equal(counter.library.includes(inspirit), false);
});

test('Emry daje ciljanoj artifact karti normalnu cast dozvolu do kraja poteza bez instantnog castanja', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const emry = permanent(game, counter, 'Emry, Lurker of the Loch');
  const prism = inZone(counter, 'Pentad Prism', 'graveyard');
  counter.pool.C = 2;
  await emry.def.abilities[0].run({ g: game, src: emry, you: counter, targets: [prism] });
  assert.equal(prism.zone, 'graveyard');
  assert.equal(game.castableList(counter).some(entry => entry.card === prism && entry.from === 'graveyard'), true);
  game.turnNo++;
  assert.equal(game.castableList(counter).some(entry => entry.card === prism), false);
});

test('Metamorph kopira kao as-enters, okida kopirani ETB i vraća originalni identitet nakon odlaska', async () => {
  let titan;
  const { game, players: [counter] } = rulesGame({
    chooseCards: (g, q) => q.aiHint?.kind === 'mirrorCopy' ? [titan] : q.from.slice(0, q.min || 0),
  }, 2);
  titan = permanent(game, counter, 'Threefold Thunderhulk');
  const metamorph = inZone(counter, 'Phyrexian Metamorph', 'hand');
  await game.move(metamorph, 'battlefield', { ctrl: counter });
  await resolveAll(game);
  assert.equal(metamorph.name, 'Threefold Thunderhulk');
  assert.equal(game.bf().filter(card => card.isToken && card.hasSub('Gnome')).length, metamorph.power);
  await game.move(metamorph, 'graveyard');
  assert.equal(metamorph.name, 'Phyrexian Metamorph');
});

test('Tekuthal plaća phyrexian manu i tačno tri izabrana countera kao stvarnu cijenu', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const tekuthal = permanent(game, counter, 'Tekuthal, Inquiry Dominus');
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  reactor.counters.charge = 3;
  counter.pool.C = 1;
  const life = counter.life;
  const entry = game.activatableList(counter).find(action => action.card === tekuthal);
  assert.ok(entry);
  assert.equal(await game.activateAbility(counter, entry), true);
  assert.equal(reactor.counters.charge || 0, 0);
  assert.equal(tekuthal.counters.indestructible, 1);
  assert.equal(counter.life, life - 4);
});

test('Gavel se može equipovati uklanjanjem countera bez tri mane', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const gavel = permanent(game, counter, 'Gavel of the Righteous');
  const host = permanent(game, counter, 'Kilo, Apogee Mind');
  gavel.counters.charge = 1;
  const entry = game.activatableList(counter).find(action => action.card === gavel && action.equip);
  assert.ok(entry);
  assert.equal(await game.activateAbility(counter, entry, [host]), true);
  assert.equal(gavel.counters.charge || 0, 0);
  assert.equal(gavel.attachedTo, host.iid);
});

test('Resourceful Defense prenosi sve vrste countera pri odlasku i dopušta djelimično pomjeranje', async () => {
  let destination;
  const { game, players: [counter] } = rulesGame({
    chooseTargets: (g, q) => q.candidates.includes(destination) ? [destination] : q.candidates.slice(0, q.min || 0),
    chooseX: (g, q) => q.aiHint?.kind === 'moveCounters' ? 1 : q.max,
  }, 2);
  permanent(game, counter, 'Resourceful Defense');
  const leaving = permanent(game, counter, 'Darksteel Reactor');
  destination = permanent(game, counter, 'Kilo, Apogee Mind');
  leaving.counters.charge = 2;
  leaving.counters.shield = 1;
  await game.move(leaving, 'graveyard');
  await resolveAll(game);
  assert.equal(destination.counters.charge, 2);
  assert.equal(destination.counters.shield, 1);

  const source = permanent(game, counter, 'Hangarback Walker');
  source.counters['+1/+1'] = 3;
  const ability = MTG.DEFS['Resourceful Defense'].abilities[0];
  await ability.run({ g: game, src: null, you: counter, targets: [source, destination] });
  assert.equal(source.counters['+1/+1'], 2);
  assert.equal(destination.counters['+1/+1'], 1);
});

test('Seedshark okida na svaki noncreature spell, a sunburst bez obojene mane daje nula countera', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  permanent(game, counter, 'Chrome Host Seedshark');
  const key = inZone(counter, 'Cloud Key', 'hand');
  const fakeSpell = { kind: 'spell', card: key, ctrl: counter, targets: [] };
  await game.emit('castNonCreature', { player: counter, card: key, so: fakeSpell, mv: key.mv });
  await resolveAll(game);
  const incubator = game.bf().find(card => card.isToken && card.hasSub('Incubator'));
  assert.ok(incubator);
  assert.equal(incubator.counters['+1/+1'], key.mv);

  for (const name of ['Crystalline Crawler', 'Etched Oracle', 'Pentad Prism']) {
    const card = new MTG.CardInst(MTG.DEFS[name], counter);
    card.meta._payColors = [];
    assert.equal(card.def.etbCounters.n(game, card), 0, name);
  }
});

test('Deepglow duplira samo izabrane permanente, uključujući protivnički', async () => {
  const { game, players: [counter, opponent] } = rulesGame({}, 2);
  const skate = permanent(game, counter, 'Deepglow Skate');
  const mine = permanent(game, counter, 'Darksteel Reactor');
  const enemy = permanent(game, opponent, 'Kilo, Apogee Mind');
  mine.counters.charge = 4;
  enemy.counters['-1/-1'] = 2;
  await skate.def.triggers[0].run({ g: game, src: skate, you: counter, targets: [[enemy]] });
  assert.equal(mine.counters.charge, 4);
  assert.equal(enemy.counters['-1/-1'], 4);
});

test('Soul-Guide Lantern može ciljati vlastito groblje, a Alibou scryja puni X', async () => {
  let scryCount = 0;
  const { game, players: [counter] } = rulesGame({
    scry: (g, q) => { scryCount = q.cards.length; return { top: q.cards.slice(), bottom: [] }; },
  }, 2);
  const lantern = permanent(game, counter, 'Soul-Guide Lantern');
  const ownCard = inZone(counter, 'Island', 'graveyard');
  await lantern.def.triggers[0].run({ g: game, src: lantern, you: counter, targets: [ownCard] });
  assert.equal(ownCard.zone, 'exile');

  const alibou = permanent(game, counter, 'Alibou, Ancient Witness');
  for (let i = 0; i < 6; i++) {
    const artifact = permanent(game, counter, 'Sol Ring');
    artifact.tapped = true;
    inZone(counter, 'Island', 'library');
  }
  await alibou.def.triggers[0].run({ g: game, src: alibou, you: counter, targets: [counter] });
  assert.equal(scryCount, 6);
});

test('Counter AI bira Reactor za Inspirit charge, Artifact za Cloud Key i vlastiti draw za Oracle', () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const ai = new MTG.AIController(counter, { difficulty: 'tough' });
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  const keyTarget = permanent(game, counter, 'Sol Ring');
  const picked = ai.chooseTargets(game, {
    candidates: [keyTarget, reactor], min: 0, max: 1, aiHint: { goal: 'chargeCounter' },
  });
  assert.equal(picked[0], reactor);
  assert.equal(ai.chooseOption(game, {
    options: ['Artifact', 'Creature', 'Enchantment'].map(key => ({ key })), aiHint: { kind: 'cloudKey' },
  }), 'Artifact');
  assert.equal(ai.chooseOption(game, {
    options: [{ key: 'p' }, { key: 'c' }], aiHint: { kind: 'inspiritCounter', target: reactor },
  }), 'c');
});

test('Inspirit prag tačno uključuje Spacecraft i štiti samo druge artefakte', () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const inspirit = permanent(game, counter, 'Inspirit, Flagship Vessel');
  const artifact = permanent(game, counter, 'Sol Ring');
  inspirit.counters.charge = 7;
  game.recalc();
  assert.equal(inspirit.is('Creature'), false);
  assert.equal(artifact.kw('indestructible'), false);
  inspirit.counters.charge = 8;
  game.recalc();
  assert.equal(inspirit.is('Creature'), true);
  assert.equal(inspirit.kw('flying'), true);
  assert.equal(artifact.kw('indestructible'), true);
  assert.equal(artifact.cur.hexproof, true);
  assert.equal(inspirit.kw('indestructible'), false);
  assert.equal(inspirit.cur.hexproof, false);
  const trigger = inspirit.def.triggers[0];
  assert.equal(game.legalTargets(trigger.targets[0], inspirit, counter).includes(inspirit), false);
});

test('Peacemaker proliferira za bilo koji protivnikov crime, i kad žrtva nije njegov kontrolor', async () => {
  let reactor;
  const { game, players: [counter, criminal, victim] } = rulesGame({
    chooseTargets: (g, q) => q.aiHint?.goal === 'proliferate' ? [reactor] : q.candidates.slice(0, q.min || 0),
  }, 3);
  permanent(game, counter, 'Patrolling Peacemaker');
  reactor = permanent(game, counter, 'Darksteel Reactor');
  reactor.counters.charge = 2;
  await game.emit('crime', { player: criminal, victims: [victim] });
  await resolveAll(game);
  assert.equal(reactor.counters.charge, 3);
});

test('Lux Artillery daje sunburst samo castanom artifact creature spellu', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  permanent(game, counter, 'Lux Artillery');
  const castCreature = new MTG.CardInst(MTG.DEFS['Steel Overseer'], counter);
  castCreature.zone = 'stack';
  castCreature.castMeta = { grantedSunburstColors: 0 };
  castCreature.meta._payColors = ['W', 'U', 'R'];
  await game.emit('castCreature', { player: counter, card: castCreature, so: { card: castCreature }, mv: 2 });
  await resolveAll(game);
  assert.equal(castCreature.castMeta.grantedSunburstColors, 3);
  await game.move(castCreature, 'battlefield', { ctrl: counter });
  assert.equal(castCreature.counters['+1/+1'], 3);

  const reanimated = inZone(counter, 'Steel Overseer', 'graveyard');
  reanimated.meta._payColors = ['W', 'U', 'R'];
  await game.move(reanimated, 'battlefield', { ctrl: counter });
  assert.equal(reanimated.counters['+1/+1'] || 0, 0);
});

test('Moxite plaća X uklanjanjem izabranih countera i stavlja isti X na cilj', async () => {
  let source;
  let target;
  const { game, players: [counter] } = rulesGame({
    chooseCards: (g, q) => q.aiHint?.kind === 'counterCost' ? [source] : q.from.slice(0, q.min || 0),
    chooseTargets: (g, q) => q.candidates.includes(target) ? [target] : q.candidates.slice(0, q.min || 0),
    chooseX: (g, q) => q.aiHint?.kind === 'moveCounters' ? 1 : q.max,
  }, 2);
  const moxite = permanent(game, counter, 'Moxite Refinery');
  source = permanent(game, counter, 'Kilo, Apogee Mind');
  target = permanent(game, counter, 'Darksteel Reactor');
  source.counters['+1/+1'] = 2;
  source.counters.shield = 1;
  counter.pool.C = 2;
  const entry = game.activatableList(counter).find(action => action.card === moxite && /charge/.test(action.ability.label));
  assert.ok(entry);
  assert.equal(await game.activateAbility(counter, entry, [target]), true);
  assert.equal(source.counters['+1/+1'], 1);
  assert.equal(source.counters.shield || 0, 0);
  assert.equal(target.counters.charge, 2);
});

test('Darksteel Reactor upkeep je opcionalan, ali 20 charge odmah završava partiju', async () => {
  let offers = 0;
  const { game, players: [counter] } = rulesGame({
    chooseOption: (g, q) => q.aiHint?.kind === 'optTrigger' ? (++offers === 1 ? 'no' : 'yes') : q.options[0]?.key,
  }, 2);
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  reactor.counters.charge = 19;
  await game.emit('upkeep', { player: counter });
  await resolveAll(game);
  assert.equal(reactor.counters.charge, 19);
  await game.emit('upkeep', { player: counter });
  await resolveAll(game);
  assert.equal(offers, 2);
  assert.equal(game.gameOver, true);
  assert.equal(game.winner, counter);
});

test('Scry čuva izabrani redoslijed vrha i dna, a Augury pita redoslijed ostatka', async () => {
  let auguryPick;
  const { game, players: [counter], controllers } = rulesGame({
    scry: (g, q) => ({ top: [q.cards[1]], bottom: [q.cards[2], q.cards[0]] }),
  }, 2);
  const a = inZone(counter, 'Island', 'library');
  const b = inZone(counter, 'Mountain', 'library');
  const c = inZone(counter, 'Plains', 'library');
  await MTG.E.scry(game, counter, 3);
  assert.equal(counter.library.slice(0, 3).map(card => card.iid).join(','), [a, c, b].map(card => card.iid).join(','),
    'dno je A pa C, a B je sljedeća karta za vući');

  const x = inZone(counter, 'Island', 'library');
  const y = inZone(counter, 'Mountain', 'library');
  const z = inZone(counter, 'Plains', 'library');
  auguryPick = z;
  const bottomOrder = [y, x];
  controllers[0].decide = async (g, q) => {
    if (q.prompt === 'U ruku:') return [auguryPick];
    if (q.aiHint?.kind === 'bottomOrder') return [bottomOrder.shift()];
    if (q.aiHint?.goal === 'proliferate') return [];
    return defaultDecision(g, q);
  };
  await MTG.DEFS['Experimental Augury'].resolve({ g: game, you: counter });
  assert.equal(counter.hand.includes(z), true);
  assert.equal(counter.library.slice(0, 2).map(card => card.iid).join(','), [y, x].map(card => card.iid).join(','));
});

test('AI V2 donosi Counter odluke na stvarnim choice prozorima', async () => {
  const { game, players: [counter, opponent] } = rulesGame({}, 2);
  counter.deckName = 'Counter Intelligence';
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  const ownBad = permanent(game, counter, 'Kilo, Apogee Mind');
  const enemyBad = permanent(game, opponent, 'Kilo, Apogee Mind');
  const enemyGood = permanent(game, opponent, 'Darksteel Reactor');
  reactor.counters.charge = 3;
  ownBad.counters['-1/-1'] = 1;
  enemyBad.counters['-1/-1'] = 1;
  enemyGood.counters.charge = 8;
  opponent.poison = 2;
  const proliferation = await MTG.chooseBotAction({
    gameState: game, botPlayerId: counter.idx, difficulty: 'hard', seed: 11,
    actionWindow: {
      type: 'chooseTargets', candidates: [reactor, ownBad, enemyBad, enemyGood, opponent], min: 0, max: 5,
      aiHint: { goal: 'proliferate' },
    },
  });
  assert.deepEqual(new Set(proliferation.action.picks), new Set([reactor, enemyBad, opponent]));

  const charge = await MTG.chooseBotAction({
    gameState: game, botPlayerId: counter.idx, difficulty: 'hard', seed: 12,
    actionWindow: { type: 'chooseTargets', candidates: [reactor, enemyGood], min: 0, max: 1, aiHint: { goal: 'chargeCounter' } },
  });
  assert.equal(charge.action.picks[0], reactor);
  const zone = await MTG.chooseBotAction({
    gameState: game, botPlayerId: counter.idx, difficulty: 'hard', seed: 13,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'cz', label: 'Command zona' }, { key: 'stay', label: 'Biblioteka' }],
      aiHint: { kind: 'commanderZone', card: reactor, toZone: 'library' },
    },
  });
  assert.equal(zone.action.value, 'cz');
});

test('Fumigate zaključava simultani indestructible i broji samo stvarno uništene', async () => {
  const { game, players: [counter, opponent] } = rulesGame({}, 2);
  const inspirit = permanent(game, counter, 'Inspirit, Flagship Vessel');
  const overseer = permanent(game, counter, 'Steel Overseer');
  const enemy = permanent(game, opponent, 'Kilo, Apogee Mind');
  inspirit.counters.charge = 8;
  game.recalc();
  assert.equal(overseer.kw('indestructible'), true);
  const life = counter.life;
  await MTG.DEFS.Fumigate.resolve({ g: game, src: null, you: counter });
  assert.equal(inspirit.zone, 'graveyard');
  assert.equal(enemy.zone, 'graveyard');
  assert.equal(overseer.zone, 'battlefield');
  assert.equal(counter.life, life + 2);
});

test('Depthshaker cilja tačno izabrane artefakte, broji planeswalker lane i žrtvuje na sljedećem end stepu', async () => {
  const { game, players: [counter, opponent, other] } = rulesGame({}, 3);
  const titan = permanent(game, counter, 'Depthshaker Titan');
  const reactor = permanent(game, counter, 'Darksteel Reactor');
  const ring = permanent(game, counter, 'Sol Ring');
  const walker = permanent(game, other, 'Tezzeret, Betrayer of Flesh');
  const trigger = titan.def.triggers[0];
  await trigger.run({ g: game, src: titan, you: counter, targets: [[reactor]] });
  assert.equal(reactor.is('Creature'), true);
  assert.equal(ring.is('Creature'), false);
  reactor.attacking = opponent;
  titan.attacking = walker;
  game.combat = { attackers: [reactor, titan], blockers: [] };
  const before = reactor.power;
  await titan.def.triggers[1].run({ g: game, src: titan, you: counter, data: { card: reactor } });
  assert.equal(reactor.power, before + 2, 'napadnuti player i planeswalker drugog igrača daju melee +2/+2');
  await game.emit('endStep', { player: other });
  await resolveAll(game);
  assert.equal(reactor.zone, 'graveyard');
});

test('Etched Oracle stvarno cilja igrača koji vuče tri, a Buried Ruin zaključava graveyard metu', async () => {
  const { game, players: [counter, opponent] } = rulesGame({}, 2);
  const oracle = permanent(game, counter, 'Etched Oracle');
  for (let i = 0; i < 3; i++) inZone(opponent, 'Island', 'library');
  await oracle.def.abilities[0].run({ g: game, src: oracle, you: counter, targets: [opponent] });
  assert.equal(opponent.hand.length, 3);

  const ruin = permanent(game, counter, 'Buried Ruin');
  const artifact = inZone(counter, 'Sol Ring', 'graveyard');
  const ability = ruin.def.abilities[0];
  assert.equal(game.legalTargets(ability.targets[0], ruin, counter).includes(artifact), true);
  await ability.run({ g: game, src: ruin, you: counter, targets: [artifact] });
  assert.equal(artifact.zone, 'hand');
});

test('Solar Array grant se potroši na spell za koji je mana stvarno korištena', async () => {
  const { game, players: [counter] } = rulesGame({}, 2);
  const solar = permanent(game, counter, 'Solar Array');
  permanent(game, counter, 'Island');
  const augury = inZone(counter, 'Experimental Augury', 'hand');
  inZone(counter, 'Island', 'library');
  inZone(counter, 'Mountain', 'library');
  inZone(counter, 'Plains', 'library');
  assert.equal(await game.castSpell(counter, augury, { from: 'hand' }), true);
  assert.equal(solar.tapped, true);
  assert.equal(counter.sunburstGrant, null, 'nonartifact spell ne ostavlja grant za neki budući artifact');
});

test('Counter Intelligence završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Counter Intelligence', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 140818 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Counter Intelligence', 'Turtle Power', 'Elven Council'], seed: 140819 },
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
    const counterLogs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Counter Intelligence'));
    assert.equal(counterLogs.some(entry => entry.fallback), false);
  }
});
