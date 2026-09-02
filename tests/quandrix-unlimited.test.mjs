import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 2) {
  const game = new MTG.Game({ seed: 8232601, paced: false, maxTurns: 100 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Quandrix', { name: index ? `Opp ${index}` : 'Quandrix Unlimited' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) }, index > 0,
  ));
  game.turnPlayer = players[0]; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false; game.battlefield.push(card); game.recalc(); return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; player[zone].push(card); return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 500) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 500, 'Quandrix stack/trigger petlja se nije smirila');
}

test('Quandrix Unlimited ima 100 karata, 89 unique, 60 novih skripti i 29 reuse veza', () => {
  const deck = MTG.DECKS['Quandrix Unlimited'];
  const intake = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-intake.json', import.meta.url)));
  const report = intake.decks.find(entry => entry.name === 'Quandrix Unlimited');
  assert.equal(deck.commander, 'Zimone, Infinite Analyst');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 89);
  assert.equal(report.missingNames.length, 60);
  assert.equal(deck.cards.length - report.missingNames.length, 29);
  assert.deepEqual(report.missingNames.filter(name => !MTG.SCRIPTS[name]), []);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
});

test('Zimone smanjuje samo prvi X spell i dobija tačno dva countera', async () => {
  const { game, players: [quandrix] } = rulesGame();
  const zimone = permanent(game, quandrix, 'Zimone, Infinite Analyst', { commander: true });
  game.addCounters(zimone, '+1/+1', 3, true, quandrix);
  quandrix.pool.U = 1;
  const stroke = inZone(quandrix, 'Stroke of Genius', 'hand');
  assert.equal(await game.castSpell(quandrix, stroke, { from: 'hand', xVal: 1 }), true,
    'tri Zimone countera pokrivaju {2}+X=1, ostaje samo {U}');
  await resolveAll(game);
  assert.equal(zimone.counters['+1/+1'], 5);

  const second = inZone(quandrix, "Tyvar's Stand", 'hand');
  quandrix.pool.G = 1;
  assert.equal(await game.castSpell(quandrix, second, { from: 'hand', xVal: 1 }), false,
    'drugi X spell nema Zimone popust');
});

test('active Zimone and Hangarback gameplay messages stay in English', async () => {
  const { game, players: [quandrix] } = rulesGame();
  quandrix.name = 'You';
  const zimone = permanent(game, quandrix, 'Zimone, Infinite Analyst', { commander: true });
  const walker = inZone(quandrix, 'Hangarback Walker', 'hand');
  assert.equal(await game.castSpell(quandrix, walker, { from: 'hand', xVal: 0 }), true);
  await resolveAll(game);

  assert.equal(zimone.counters['+1/+1'], 2, 'X=0 still triggers Zimone');
  assert.equal(walker.zone, 'graveyard', 'Hangarback Walker dies as a 0/0');
  assert.ok(game.log.some(entry => entry.msg.endsWith(': First X spell: two counters.')),
    game.log.map(entry => entry.msg).join('\n'));
  assert.ok(game.log.some(entry => entry.msg.endsWith(': Create Thopters.')),
    game.log.map(entry => entry.msg).join('\n'));
  assert.equal(
    Array.from(MTG.SCRIPTS['Zimone, Quandrix Prodigy'].abilities, ability => ability.label).join('|'),
    'Land from hand tapped|Draw (two with 8+ lands)',
  );
});

test('human basic-land search log uses first-person grammar', async () => {
  const { game, players: [quandrix] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseCards' && q.search) return q.from.slice(0, 1);
    return defaultDecision(g, q);
  } ]);
  quandrix.name = 'You';
  inZone(quandrix, 'Forest', 'library');
  const [forest] = await MTG.E.searchBasic(game, quandrix, { tapped: true, prompt: 'Search for basic land' });
  assert.equal(forest.name, 'Forest');
  assert.equal(forest.zone, 'battlefield');
  assert.equal(forest.tapped, true);
  assert.equal(game.log.at(-1).msg, 'You put Forest onto the battlefield (tapped).');
});

test('četiri Quandrix +1/+1 replacementa slažu se i Benevolent ne mijenja sebe', () => {
  const { game, players: [quandrix] } = rulesGame();
  permanent(game, quandrix, 'Hardened Scales');
  permanent(game, quandrix, 'Ozolith, the Shattered Spire');
  permanent(game, quandrix, 'Kami of Whispered Hopes');
  const benevolent = permanent(game, quandrix, 'Benevolent Hydra');
  const target = permanent(game, quandrix, 'Quandrix Apprentice');
  game.addCounters(target, '+1/+1', 1, false, quandrix);
  assert.equal(target.counters['+1/+1'], 5, '1 + Hardened + Ozolith + Kami + Benevolent');
  game.addCounters(benevolent, '+1/+1', 1, false, quandrix);
  assert.equal(benevolent.counters['+1/+1'], 4, 'Benevolent izuzima sebe, ostala tri replacementa rade');
});

test("Grove's Bounty bira X, mete i raspodjelu pa ostavlja Ottera u Adventure egzilu", async () => {
  let creatures;
  const { game, players: [quandrix] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseTargets' && q.prompt?.includes("Grove's Bounty")) return creatures;
    return defaultDecision(g, q);
  } ]);
  creatures = [permanent(game, quandrix, 'Quandrix Apprentice'), permanent(game, quandrix, 'Guardian Augmenter')];
  quandrix.pool.G = 1; quandrix.pool.C = 2;
  const otter = inZone(quandrix, 'Elusive Otter', 'hand');
  assert.equal(await game.castSpell(quandrix, otter, { from: 'hand', alt: { adventure: true, ...otter.def.adventure }, xVal: 2 }), true);
  await resolveAll(game);
  assert.deepEqual(creatures.map(card => card.counters['+1/+1'] || 0), [1, 1]);
  assert.equal(otter.zone, 'exile');
  assert.equal(otter.meta.adventureExiled, true);
});

test('Prepare pravi stvarne Run the Play i Channel kopije i gasi ih odlaskom izvora', async () => {
  let attacker;
  const { game, players: [quandrix, opponent] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseTargets' && q.prompt?.includes('Creature for the counter') && q.candidates.includes(attacker)) return [attacker];
    return defaultDecision(g, q);
  } ]);
  const shotcaller = permanent(game, quandrix, 'Striding Shotcaller');
  attacker = permanent(game, quandrix, 'Quandrix Apprentice');
  await game.emit('combatDamageGroupToPlayer', { player: opponent, cards: [attacker], hits: [{ card: attacker, n: 2 }], step: 'normal' });
  await resolveAll(game);
  const run = quandrix.exile.find(card => card.meta?.preparedBy === shotcaller.iid);
  assert.equal(run?.name, 'Run the Play');
  quandrix.pool.G = 1; quandrix.pool.U = 1; quandrix.pool.C = 1;
  inZone(quandrix, 'Island', 'library');
  assert.equal(await game.castSpell(quandrix, run, { from: 'exile', xVal: 1 }), true);
  await resolveAll(game);
  assert.equal(shotcaller.meta.prepared, false);
  assert.equal(quandrix.hand.length, 1, 'Run the Play vuče kartu');

  const bloomsage = permanent(game, quandrix, 'Yavimaya Bloomsage');
  game.addCounters(attacker, '+1/+1', 4, true, quandrix);
  await game.emit('endStep', { player: quandrix }); await resolveAll(game);
  const channel = quandrix.exile.find(card => card.meta?.preparedBy === bloomsage.iid);
  assert.equal(channel?.name, 'Channel');
  quandrix.pool.G = 2;
  assert.equal(await game.castSpell(quandrix, channel, { from: 'exile' }), true);
  await resolveAll(game);
  const channelAction = game.activatableList(quandrix).find(entry => entry.channelMana);
  assert.ok(channelAction, 'Channel ostaje ponovljiva mana-akcija do kraja poteza');
  const life = quandrix.life;
  assert.equal(await game.activateAbility(quandrix, channelAction), true);
  assert.equal(await game.activateAbility(quandrix, channelAction), true);
  assert.equal(quandrix.life, life - 2);
  assert.equal(quandrix.pool.C, 2);

  quandrix.pool.C = 0;
  const serpent = inZone(quandrix, 'Stonecoil Serpent', 'hand');
  assert.equal(await game.castSpell(quandrix, serpent, { from: 'hand', xVal: 3 }), true,
    'mana solver koristi Channel tokom plaćanja spella');
  assert.equal(quandrix.life, life - 5);
});

test('Adventure X kontekst radi za dinamičke mete i ograničenu Troyan/Palette manu', async () => {
  let creatures;
  const { game, players: [quandrix] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseTargets' && q.src?.name === 'Elusive Otter') return q.candidates.slice(0, q.max);
    return defaultDecision(g, q);
  } ]);
  const troyan = permanent(game, quandrix, 'Troyan, Gutsy Explorer');
  creatures = [
    permanent(game, quandrix, 'Quandrix Apprentice'),
    permanent(game, quandrix, 'Guardian Augmenter'),
    permanent(game, quandrix, 'Benevolent Hydra'),
  ];
  const otter = inZone(quandrix, 'Elusive Otter', 'hand');
  assert.equal(await game.castSpell(quandrix, otter, {
    from: 'hand', alt: { adventure: true, ...otter.def.adventure }, xVal: 1,
  }), true);
  assert.equal(troyan.tapped, true, 'Troyan prepoznaje X na Adventure polovini');
  const firstGrove = game.stack.find(item => item.card === otter);
  assert.equal(firstGrove.targetSpecs[0].count, 1);
  assert.equal(Array.isArray(firstGrove.targets[0]) ? firstGrove.targets[0].length : (firstGrove.targets[0] ? 1 : 0), 1,
    'Grove može ciljati najviše X stvorenja');
  await resolveAll(game);

  const palette = permanent(game, quandrix, "Elementalist's Palette");
  palette.counters.charge = 2;
  const second = inZone(quandrix, 'Elusive Otter', 'hand');
  quandrix.pool.G = 1;
  assert.equal(await game.castSpell(quandrix, second, {
    from: 'hand', alt: { adventure: true, ...second.def.adventure }, xVal: 2,
  }), true);
  assert.equal(palette.tapped, true, 'Palette restricted mana prepoznaje Adventure X kontekst');
});

test('Quandrix Command cilja samo karte iz prethodno ciljanog groblja', async () => {
  let seenCards = [];
  const { game, players: [quandrix, opponent] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseTargets' && q.prompt === 'Whose graveyard?') return [opponent];
    if (q.type === 'chooseTargets' && q.prompt?.includes('Up to three target')) {
      seenCards = q.candidates.slice();
      return q.candidates.slice(0, q.max);
    }
    return defaultDecision(g, q);
  } ]);
  const own = inZone(quandrix, 'Forest', 'graveyard');
  const theirsA = inZone(opponent, 'Mountain', 'graveyard');
  const theirsB = inZone(opponent, 'Wastes', 'graveyard');
  const command = new MTG.CardInst(MTG.DEFS['Quandrix Command'], quandrix);
  const ctx = { g: game, src: command, you: quandrix, targets: [] };
  assert.equal(await game.pickTargets(ctx, command.def.modes.list[3].targets, command, quandrix), true);
  assert.equal(seenCards.length, 2);
  assert.equal(seenCards.some(card => card.iid === theirsA.iid), true);
  assert.equal(seenCards.some(card => card.iid === theirsB.iid), true);
  assert.equal(seenCards.includes(own), false);
  assert.equal(game.revalidateTargets(ctx.targets, command.def.modes.list[3].targets, command, quandrix).anyLegal, true);
});

test('Unbound Flourishing kopira baš aktiviranu X sposobnost preko njenog stack objekta', async () => {
  const { game, players: [quandrix] } = rulesGame();
  permanent(game, quandrix, 'Unbound Flourishing');
  let total = 0;
  const activatorDef = {
    name: 'X Ability Probe', cost: '{0}', types: ['Artifact'], subtypes: [], super: [], kws: [], oracle: '',
    abilities: [{
      label: 'X probe', xCost: true, cost: { mana: '{X}' },
      run: async ctx => { total += ctx.x || 0; },
    }],
  };
  const activator = new MTG.CardInst(activatorDef, quandrix);
  activator.ctrl = quandrix; activator.zone = 'battlefield'; game.battlefield.push(activator); game.recalc();
  quandrix.pool.C = 2;
  const action = game.activatableList(quandrix).find(entry => entry.card === activator && entry.ability);
  assert.ok(action);
  assert.equal(await game.activateAbility(quandrix, action), true);
  await resolveAll(game);
  assert.equal(total, 4, 'original X=2 i jedna kopija X=2 se obje rezolviraju');
});

test('Goose, Lattice, Deekah i Primo prave Oracle Fractale/Food sa stvarnim counterima', async () => {
  const { game, players: [quandrix, opponent] } = rulesGame();
  const goose = permanent(game, quandrix, 'The Goose Mother'); goose.castMeta = { x: 3 };
  await game.emit('etb', { card: goose }); await resolveAll(game);
  assert.equal(game.bf().filter(card => card.ctrl === quandrix && card.hasSub('Food')).length, 2);

  const library = permanent(game, quandrix, 'Lattice Library'); library.counters.study = 4;
  await game.emit('etb', { card: library }); await resolveAll(game);
  assert.ok(game.creatures(quandrix).some(card => card.isToken && card.hasSub('Fractal') && card.power === 4));

  permanent(game, quandrix, 'Deekah, Fractal Theorist');
  const stroke = inZone(quandrix, 'Stroke of Genius', 'exile');
  await game.emit('castIS', { player: quandrix, card: stroke, mv: 5, so: { x: 2 } }); await resolveAll(game);
  assert.ok(game.creatures(quandrix).some(card => card.isToken && card.hasSub('Fractal') && card.power === 5));

  permanent(game, quandrix, 'Primo, the Unbounded');
  const baseZero = game.creatures(quandrix).find(card => card.isToken && card.hasSub('Fractal'));
  await game.emit('combatDamageGroupToPlayer', { player: opponent, cards: [baseZero], hits: [{ card: baseZero, n: 4 }], step: 'normal' });
  await resolveAll(game);
  assert.ok(game.creatures(quandrix).filter(card => card.isToken && card.hasSub('Fractal')).some(card => card.power === 4));
});

test('modalni counteri poštuju porez, uncounterable i dvije Command putanje', async () => {
  const { game, players: [quandrix, opponent] } = rulesGame();
  const victim = inZone(opponent, 'Beast Within', 'hand');
  const so = { kind: 'spell', card: victim, ctrl: opponent, name: victim.name, targets: [], targetSpecs: [], castOpts: {} };
  victim.zone = 'stack'; opponent.hand.splice(opponent.hand.indexOf(victim), 1); game.stack.push(so);
  const charm = new MTG.CardInst(MTG.DEFS['Quandrix Charm'], quandrix);
  await charm.def.resolve({ g: game, src: charm, you: quandrix, targets: [so], mode: [0], so: {} });
  assert.equal(victim.zone, 'graveyard');

  const altered = inZone(opponent, 'Altered Ego', 'hand'); altered.zone = 'stack'; opponent.hand.splice(opponent.hand.indexOf(altered), 1);
  const uncounterable = { kind: 'spell', card: altered, ctrl: opponent, name: altered.name, targets: [], targetSpecs: [], castOpts: {} };
  game.stack.push(uncounterable);
  await charm.def.resolve({ g: game, src: charm, you: quandrix, targets: [uncounterable], mode: [0], so: {} });
  assert.ok(game.stack.includes(uncounterable));

  const creature = permanent(game, opponent, 'Quandrix Apprentice');
  const command = new MTG.CardInst(MTG.DEFS['Quandrix Command'], quandrix);
  await command.def.resolve({ g: game, src: command, you: quandrix, targets: [creature, creature], mode: [0, 2], so: {} });
  assert.equal(creature.zone, 'hand');
});

test('Silkguard stavlja po jedan counter, a Nexus sa commanderom dopušta jedan ili oba moda', async () => {
  let modeChoice = ['1'];
  const { game, players: [quandrix] } = rulesGame([ (g, q) => {
    if (q.type === 'chooseMulti' && q.prompt?.includes('Nexus Mentality')) return modeChoice;
    return defaultDecision(g, q);
  } ]);
  permanent(game, quandrix, 'Zimone, Infinite Analyst', { commander: true });
  const first = permanent(game, quandrix, 'Quandrix Apprentice');
  const second = permanent(game, quandrix, 'Guardian Augmenter');
  const silkguard = new MTG.CardInst(MTG.DEFS.Silkguard, quandrix);
  await silkguard.def.resolve({ g: game, src: silkguard, you: quandrix, targets: [[first, second]], so: { x: 5 } });
  assert.equal(first.counters['+1/+1'], 1);
  assert.equal(second.counters['+1/+1'], 1, 'Silkguard ne raspodjeljuje pet countera nego stavlja po jedan');
  game.recalc();
  assert.equal(first.kw('hexproof'), true, 'counter je modified pa Silkguard daje hexproof');

  game.addCounters(first, '+1/+1', 2, true, quandrix);
  const nexusOne = inZone(quandrix, 'Nexus Mentality', 'hand');
  quandrix.pool.U = 1; quandrix.pool.C = 3;
  assert.equal(await game.castSpell(quandrix, nexusOne, { from: 'hand' }), true);
  assert.deepEqual(game.stack.find(item => item.card === nexusOne)?.mode, [1], 'commander ne prisiljava igrača da izabere oba moda');
  await resolveAll(game);

  modeChoice = ['0', '1'];
  const nexusBoth = inZone(quandrix, 'Nexus Mentality', 'hand');
  quandrix.pool.U = 1; quandrix.pool.C = 3;
  assert.equal(await game.castSpell(quandrix, nexusBoth, { from: 'hand' }), true);
  assert.deepEqual(game.stack.find(item => item.card === nexusBoth)?.mode, [0, 1], 'sa commanderom oba moda ostaju dostupna');
});

test('Oversimplify broji samo stvarno egziliranu snagu, a prime Zimone pravi legendary Primo', async () => {
  const { game, players: [quandrix, opponent] } = rulesGame();
  permanent(game, quandrix, 'Tanazir Quandrix');
  permanent(game, opponent, 'Quandrix Apprentice');
  const spell = new MTG.CardInst(MTG.DEFS.Oversimplify, quandrix);
  await spell.def.resolve({ g: game, src: spell, you: quandrix, targets: [], so: {} });
  const mine = game.creatures(quandrix).find(card => card.isToken && card.hasSub('Fractal'));
  const theirs = game.creatures(opponent).find(card => card.isToken && card.hasSub('Fractal'));
  assert.equal(mine.power, 4); assert.equal(theirs.power, 2);

  for (let i = 0; i < 3; i++) permanent(game, quandrix, 'Forest');
  const allQuestioning = permanent(game, quandrix, 'Zimone, All-Questioning');
  quandrix.turnState.landsEntered = 1;
  await game.emit('endStep', { player: quandrix }); await resolveAll(game);
  const primo = game.creatures(quandrix).find(card => card.name === 'Primo, the Indivisible');
  assert.ok(primo); assert.equal(primo.power, 3); assert.ok(primo.def.super.includes('Legendary')); assert.ok(allQuestioning);
});

test('Quandrix utility lands nude tačne mana i player-choice putanje', async () => {
  const { game, players: [quandrix, opponent] } = rulesGame();
  const coast = permanent(game, quandrix, 'Yavimaya Coast');
  const colored = game.manaSources(quandrix, null).find(source => source.card === coast && source.produce.some(option => option.G));
  await colored.m.onProduce(game, coast, quandrix, { G: 1 });
  assert.equal(quandrix.life, 39);
  const turbulent = new MTG.CardInst(MTG.DEFS['Turbulent Wilderness'], quandrix); turbulent.zone = 'nowhere';
  await game.move(turbulent, 'battlefield', { ctrl: quandrix });
  assert.equal(turbulent.tapped, true);
  for (let i = 0; i < 8; i++) permanent(game, opponent, 'Forest');
  const second = new MTG.CardInst(MTG.DEFS['Turbulent Wilderness'], quandrix); second.zone = 'nowhere';
  await game.move(second, 'battlefield', { ctrl: quandrix });
  assert.equal(second.tapped, false);
  const refuge = permanent(game, quandrix, "Alchemist's Refuge");
  await refuge.def.abilities[0].run({ g: game, src: refuge, you: quandrix, targets: [] });
  game.turnPlayer = opponent; game.phase = 'main1';
  const sorcery = inZone(quandrix, 'Oversimplify', 'hand');
  assert.equal(game.canCastTiming(quandrix, sorcery, null), true);
});

test('Quandrix bot bira X i modalne mete bez fallback odluke', async () => {
  const { game, players: [bot, opponent] } = rulesGame(); bot.isAI = true;
  const own = permanent(game, bot, 'Quandrix Apprentice');
  const enemy = permanent(game, opponent, 'Guardian Augmenter');
  let decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 8232602,
    actionWindow: { type: 'chooseTargets', candidates: [own, enemy], min: 1, max: 1, aiHint: { goal: 'buff' } } });
  assert.equal(decision.log.fallback, false);
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0], own);
  decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 8232603,
    actionWindow: { type: 'chooseX', min: 0, max: 7, card: new MTG.CardInst(MTG.DEFS['Stroke of Genius'], bot), aiHint: { kind: 'chooseX' } } });
  assert.equal(decision.log.fallback, false);
  assert.ok(MTG.unwrapBotDecisionAction(decision.action) >= 0);
});

test('Quandrix Unlimited završava determinističke pune partije u oba sjedala bez AI fallbacka', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Quandrix Unlimited', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 8232604 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Quandrix Unlimited', 'Turtle Power', 'Elven Council'], seed: 8232605 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({ ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 220, paced: false });
    await game.start();
    assert.equal(game.gameOver, true); assert.ok(game.winner); assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName && game.players.some(player =>
      player.name === entry.playerName && player.deckName === 'Quandrix Unlimited'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
