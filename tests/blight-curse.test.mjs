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

function rulesGame(overrides = [], count = 2) {
  const game = new MTG.Game({ seed: 81450, paced: false, maxTurns: 40 });
  const players = Array.from({ length: count }, (_, index) => {
    const controller = {
      decide: async (g, q) => overrides[index]?.[q.type]
        ? overrides[index][q.type](g, q)
        : defaultDecision(g, q),
    };
    return game.addPlayer(index ? `Opponent ${index}` : 'Blight', {
      name: index ? `Opp ${index}` : 'Blight Curse',
    }, controller, index > 0);
  });
  game.turnPlayer = players[0];
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
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
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 180) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 180, 'Blight trigger/stack petlja se nije smirila');
}

test('Blight Curse ima službenih 100 karata, 85 jedinstvenih i puni AI profil', () => {
  const deck = MTG.DECKS['Blight Curse'];
  assert.equal(deck.commander, 'Auntie Ool, Cursewretch');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 85);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Blight Curse').archetype, 'Wither and -1/-1 counters');
});

test('enters-with -1/-1 counteri okidaju Ool, Hapatru, Tools, Defenses i Lasting Tarfire tačno jednom po događaju', async () => {
  const { game, players: [blight, opponent] } = rulesGame();
  permanent(game, blight, 'Auntie Ool, Cursewretch');
  permanent(game, blight, 'Hapatra, Vizier of Poisons');
  const tools = permanent(game, blight, "Wickersmith's Tools");
  permanent(game, blight, 'Flourishing Defenses');
  permanent(game, blight, 'Lasting Tarfire');
  for (let i = 0; i < 4; i++) inZone(blight, 'Forest', 'library');
  const poppet = inZone(blight, 'Grim Poppet', 'hand');

  await game.move(poppet, 'battlefield', { ctrl: blight });
  await resolveAll(game);

  assert.equal(poppet.counters['-1/-1'], 3);
  assert.equal(blight.hand.length, 1, 'Ool vuče jednom za jednu grupu od tri countera');
  assert.equal(tools.counters.charge, 1, 'Tools dobija jedan charge za one-or-more događaj');
  assert.equal(game.creatures(blight).filter(card => card.isToken && card.hasSub('Snake')).length, 1);
  assert.equal(game.creatures(blight).filter(card => card.isToken && card.hasSub('Elf')).length, 3);
  assert.equal(blight.turnState._putCounterThisTurn, 3);

  await game.emit('endStep', { player: blight });
  await resolveAll(game);
  assert.equal(opponent.life, 38);
});

test('persist koristi stack, vraća pod owner kontrolom sa counterom pri ulasku i tek tada okida Blight engine', async () => {
  const { game, players: [blight, opponent] } = rulesGame();
  permanent(game, blight, 'Auntie Ool, Cursewretch');
  for (let i = 0; i < 3; i++) inZone(blight, 'Forest', 'library');
  const clique = permanent(game, blight, 'Puppeteer Clique');
  const titan = inZone(opponent, 'Grave Titan', 'graveyard');

  await game.sacrifice(blight, clique);
  assert.equal(clique.zone, 'graveyard', 'persist nije trenutni replacement');
  await game.flushTriggers();
  assert.ok(game.stack.some(item => /Persist/.test(item.name)));
  await resolveAll(game);

  assert.equal(clique.zone, 'battlefield');
  assert.equal(clique.ctrl, blight);
  assert.equal(clique.counters['-1/-1'], 1);
  assert.equal(blight.hand.length, 1, 'Ool vidi persist counter pri ulasku');
  assert.equal(titan.zone, 'battlefield');
  assert.equal(titan.ctrl, blight, 'Puppeteer meta je zaključana dok trigger ide na stack');
});

test('Ward—Blight se plaća tek dok su spell i ward trigger na stacku; odbijanje counteruje spell, plaćanje ga propušta', async () => {
  let ool;
  let trophy;
  let sawOriginalOnStack = false;
  const decline = rulesGame([
    {},
    {
      chooseTargets: (g, q) => q.candidates.includes(ool) ? [ool] : q.candidates.slice(0, q.min || 0),
      chooseOption: (g, q) => {
        if (q.aiHint?.kind === 'ward') {
          sawOriginalOnStack = g.stack.some(item => item.card === trophy);
          return 'no';
        }
        return q.options.find(option => option.key === 'no')?.key || q.options[0]?.key;
      },
    },
  ]);
  const [blight, caster] = decline.players;
  ool = permanent(decline.game, blight, 'Auntie Ool, Cursewretch');
  permanent(decline.game, caster, 'Grave Titan');
  trophy = inZone(caster, "Assassin's Trophy", 'hand');
  caster.pool.B = 1; caster.pool.G = 1;
  assert.equal(await decline.game.castSpell(caster, trophy, { from: 'hand' }), true);
  assert.equal(sawOriginalOnStack, true);
  assert.equal(ool.zone, 'battlefield');
  assert.equal(trophy.zone, 'graveyard');

  let ool2;
  let trophy2;
  let recipient;
  const pay = rulesGame([
    {},
    {
      chooseTargets: (g, q) => q.candidates.includes(ool2) ? [ool2] : q.candidates.slice(0, q.min || 0),
      chooseOption: (g, q) => q.aiHint?.kind === 'ward' ? 'yes' : (q.options.find(option => option.key === 'no')?.key || q.options[0]?.key),
      chooseCards: (g, q) => q.aiHint?.kind === 'blight' ? [recipient] : q.from.slice(0, q.min || 0),
    },
  ]);
  const [blight2, caster2] = pay.players;
  ool2 = permanent(pay.game, blight2, 'Auntie Ool, Cursewretch');
  recipient = permanent(pay.game, caster2, 'Grave Titan');
  trophy2 = inZone(caster2, "Assassin's Trophy", 'hand');
  caster2.pool.B = 1; caster2.pool.G = 1;
  assert.equal(await pay.game.castSpell(caster2, trophy2, { from: 'hand' }), true);
  assert.equal(recipient.counters['-1/-1'], 2);
  assert.equal(caster2.life, 39, 'Ool kažnjava protivnički Blight događaj prije nego što bude uništena');
  assert.equal(ool2.zone, 'graveyard');
});

test('Channeler cilja pri ETB triggeru, Dusk Urchins okida na block i Devoted Druid ne duplira m1Added', async () => {
  let target;
  const { game, players: [blight] } = rulesGame([{
    chooseTargets: (g, q) => q.candidates.includes(target) ? [target] : q.candidates.slice(0, q.min || 0),
  }]);
  permanent(game, blight, 'Auntie Ool, Cursewretch');
  for (let i = 0; i < 5; i++) inZone(blight, 'Forest', 'library');
  target = permanent(game, blight, 'Oft-Nabbed Goat');
  const channeler = inZone(blight, 'Channeler Initiate', 'hand');
  await game.move(channeler, 'battlefield', { ctrl: blight });
  await resolveAll(game);
  assert.equal(target.counters['-1/-1'], 3);
  assert.equal(channeler.counters['-1/-1'] || 0, 0);

  const urchins = permanent(game, blight, 'Dusk Urchins');
  await game.emit('blocks', { blocker: urchins, attacker: permanent(game, game.players[1], 'Ignoble Hierarch') });
  await resolveAll(game);
  assert.equal(urchins.counters['-1/-1'], 1);

  const druid = permanent(game, blight, 'Devoted Druid');
  druid.tapped = true;
  const before = blight.hand.length;
  const entry = game.activatableList(blight).find(action => action.card === druid && action.ability);
  assert.ok(entry);
  assert.equal(await game.activateAbility(blight, entry), true);
  assert.equal(druid.counters['-1/-1'], 1);
  assert.equal(blight.hand.length, before + 1, 'jedan counter proizvodi samo jedan Ool draw trigger');
});

test('Fire Covenant zaključava mete, plaća izabrani X kao dodatnu cijenu i dijeli svu štetu simultano', async () => {
  let first;
  let second;
  const { game, players: [blight, opponent] } = rulesGame([{
    chooseTargets: (g, q) => q.src?.name === 'Fire Covenant' ? [first, second] : q.candidates.slice(0, q.min || 0),
    chooseX: (g, q) => {
      if (q.aiHint?.kind === 'fireCovenant') return 4;
      if (q.aiHint?.kind === 'fireCovenantDamage') return q.aiHint.target === first ? 3 : 1;
      return q.max;
    },
  }]);
  first = permanent(game, opponent, 'Dusk Urchins');
  second = permanent(game, opponent, 'Ignoble Hierarch');
  const covenant = inZone(blight, 'Fire Covenant', 'hand');
  blight.pool.C = 1; blight.pool.B = 1; blight.pool.R = 1;

  assert.equal(await game.castSpell(blight, covenant, { from: 'hand' }), true);
  assert.equal(blight.life, 36);
  assert.equal(first.zone, 'graveyard');
  assert.equal(second.zone, 'graveyard');
  assert.equal(covenant.zone, 'graveyard');
});

test('Aberrant Return cilja 1–3 grave karte i svaka ulazi sa dodatnim counterom koji Ool vidi', async () => {
  let targets;
  const { game, players: [blight, opponent] } = rulesGame([{
    chooseTargets: (g, q) => q.src?.name === 'Aberrant Return' ? targets : q.candidates.slice(0, q.min || 0),
  }]);
  permanent(game, blight, 'Auntie Ool, Cursewretch');
  for (let i = 0; i < 5; i++) inZone(blight, 'Forest', 'library');
  targets = [
    inZone(blight, 'Dusk Urchins', 'graveyard'),
    inZone(opponent, 'Oft-Nabbed Goat', 'graveyard'),
    inZone(opponent, 'Grave Titan', 'graveyard'),
  ];
  const spell = inZone(blight, 'Aberrant Return', 'hand');
  blight.pool.C = 4; blight.pool.B = 2;

  assert.equal(await game.castSpell(blight, spell, { from: 'hand' }), true);
  for (const card of targets) {
    assert.equal(card.zone, 'battlefield');
    assert.equal(card.ctrl, blight);
    assert.equal(card.counters['-1/-1'], 1);
  }
  assert.equal(blight.hand.length, 3);
});

test('Burning Curiosity plaća opcionalni Blight pri castu i dozvola traje do kraja casterovog sljedećeg poteza', async () => {
  let goat;
  const { game, players: [blight] } = rulesGame([{
    chooseOption: (g, q) => q.aiHint?.kind === 'burningCuriosity' ? 'yes' : q.options[0]?.key,
    chooseCards: (g, q) => q.aiHint?.kind === 'blight' ? [goat] : q.from.slice(0, q.min || 0),
  }]);
  blight.turnsStarted = 2;
  goat = permanent(game, blight, 'Oft-Nabbed Goat');
  for (const name of ['Forest', 'Swamp', 'Mountain']) inZone(blight, name, 'library');
  const curiosity = inZone(blight, 'Burning Curiosity', 'hand');
  blight.pool.C = 2; blight.pool.R = 1;

  assert.equal(await game.castSpell(blight, curiosity, { from: 'hand' }), true);
  assert.equal(goat.counters['-1/-1'], 1);
  assert.equal(blight.exile.length, 3);
  assert.equal(blight.exile.every(card => card.meta.playableUntilOwnTurn === 3), true);
  game.turnNo += 3;
  assert.equal(blight.exile.every(card => game.hasExilePlayPermission(blight, card)), true, 'tuđi potezi ne gase dozvolu');
  blight.turnsStarted = 3;
  game.expireOwnTurnExilePermissions(blight);
  assert.equal(blight.exile.every(card => !game.hasExilePlayPermission(blight, card)), true);
});

test("Eventide's Shadow poštuje tačan ljudski izbor permanenata, vrsta i broja countera", async () => {
  let ownBad;
  let enemyGood;
  const { game, players: [blight, opponent] } = rulesGame([{
    chooseCards: (g, q) => q.aiHint?.kind === 'eventidePermanents' ? [ownBad, enemyGood] : q.from.slice(0, q.min || 0),
    chooseX: (g, q) => {
      if (q.aiHint?.kind !== 'eventideCounter') return q.max;
      if (q.aiHint.target === ownBad && q.aiHint.counterKind === '-1/-1') return 1;
      if (q.aiHint.target === enemyGood && q.aiHint.counterKind === 'charge') return 2;
      return 0;
    },
  }]);
  ownBad = permanent(game, blight, 'Grim Poppet');
  ownBad.counters['-1/-1'] = 2;
  ownBad.counters.charge = 1;
  enemyGood = permanent(game, opponent, 'Chimil, the Inner Sun');
  enemyGood.counters.charge = 3;
  const enemyBad = permanent(game, opponent, 'Dusk Urchins');
  enemyBad.counters['-1/-1'] = 1;
  for (let i = 0; i < 4; i++) inZone(blight, 'Forest', 'library');
  const life = blight.life;

  await MTG.DEFS["Eventide's Shadow"].resolve({ g: game, src: null, you: blight, targets: [] });
  assert.equal(ownBad.counters['-1/-1'], 1);
  assert.equal(ownBad.counters.charge, 1);
  assert.equal(enemyGood.counters.charge, 1);
  assert.equal(enemyBad.counters['-1/-1'], 1);
  assert.equal(blight.hand.length, 3);
  assert.equal(blight.life, life - 3);
});

test('Glissa bira legalan mod i metu pri stavljanju triggera na stack bez fallback efekta', async () => {
  let enchantment;
  const { game, players: [blight, opponent] } = rulesGame([{
    chooseOption: (g, q) => q.aiHint?.kind === 'glissaMode' ? '1' : q.options[0]?.key,
    chooseTargets: (g, q) => q.candidates.includes(enchantment) ? [enchantment] : q.candidates.slice(0, q.min || 0),
  }]);
  const glissa = permanent(game, blight, 'Glissa Sunslayer');
  enchantment = permanent(game, opponent, 'Lasting Tarfire');
  inZone(blight, 'Forest', 'library');
  const life = blight.life;

  await game.emit('combatDamageToPlayer', { card: glissa, player: opponent, n: 3, combat: true });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).mode, 1);
  assert.equal(game.stack.at(-1).targets[0], enchantment);
  await game.move(enchantment, 'hand');
  await game.resolveTop();
  assert.equal(blight.hand.length, 0);
  assert.equal(blight.life, life, 'nelegalna enchantment meta ne pretvara se u draw mod');
});

test('Nesting Grounds bira vrstu countera, Binding nalazi nonbasic Forest, a Overlook ne nagrađuje neuspjelu žrtvu', async () => {
  const { game, players: [blight, opponent] } = rulesGame([{
    chooseOption: (g, q) => q.aiHint?.kind === 'moveCounterKind' ? '-1/-1' : q.options[0]?.key,
    chooseCards: (g, q) => q.search ? [q.from.find(card => card.name === 'Cinder Glade') || q.from[0]] : q.from.slice(0, q.min || 0),
  }]);
  const grounds = permanent(game, blight, 'Nesting Grounds');
  const from = permanent(game, blight, 'Grim Poppet');
  from.counters['-1/-1'] = 1; from.counters.charge = 1;
  const to = permanent(game, opponent, 'Grave Titan');
  await grounds.def.abilities[0].run({ g: game, src: grounds, you: blight, targets: [from, to] });
  assert.equal(from.counters['-1/-1'] || 0, 0);
  assert.equal(from.counters.charge, 1);
  assert.equal(to.counters['-1/-1'], 1);

  assert.equal(MTG.DEFS['Binding the Old Gods'].saga[0].targets[0].upTo, undefined);
  const glade = inZone(blight, 'Cinder Glade', 'library');
  await MTG.DEFS['Binding the Old Gods'].saga[1].run({ g: game, src: null, you: blight });
  assert.equal(glade.zone, 'battlefield');
  assert.equal(glade.tapped, true);

  const overlook = permanent(game, blight, 'Riveteers Overlook');
  overlook.cur.cantSacrifice = true;
  const life = blight.life;
  const libraryBefore = blight.library.length;
  await overlook.def.triggers[0].run({ g: game, src: overlook, you: blight });
  assert.equal(overlook.zone, 'battlefield');
  assert.equal(blight.life, life);
  assert.equal(blight.library.length, libraryBefore);
});

test('Puca broji sve vrste countera, zaključava target i ne troši once-per-turn na fizzlan povratak', async () => {
  let target;
  const { game, players: [blight] } = rulesGame([{
    chooseOption: (g, q) => q.aiHint?.kind === 'optTrigger' ? 'yes' : q.options[0]?.key,
    chooseTargets: (g, q) => q.candidates.includes(target) ? [target] : q.candidates.slice(0, q.min || 0),
  }]);
  const puca = permanent(game, blight, "Puca's Covenant");
  target = inZone(blight, 'Sol Ring', 'graveyard');
  const first = permanent(game, blight, 'Dusk Urchins');
  first.counters.charge = 2;
  await game.destroy(first);
  await game.flushTriggers();
  const firstPucaTrigger = game.stack.find(item => item.srcCard === puca);
  assert.equal(firstPucaTrigger.targets[0], target);
  await game.move(target, 'exile');
  await resolveAll(game);
  assert.notEqual(puca.meta._pucaReturnTurn, game.turnNo);

  target = inZone(blight, 'Arcane Signet', 'graveyard');
  const second = permanent(game, blight, 'Dusk Urchins');
  second.counters.charge = 2;
  await game.destroy(second);
  await resolveAll(game);
  assert.equal(target.zone, 'hand');
  assert.equal(puca.meta._pucaReturnTurn, game.turnNo);
});

test('Blight AI bira preživljavajućeg jeftinog primaoca, korisne Eventide countere i smislen Glissa mod', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  const goat = permanent(game, bot, 'Oft-Nabbed Goat');
  const hapatra = permanent(game, bot, 'Hapatra, Vizier of Poisons');
  const legacy = new MTG.AIController(bot, { difficulty: 'tough' });
  assert.equal(legacy.chooseCards(game, {
    from: [hapatra, goat], min: 1, max: 1, aiHint: { kind: 'blight', n: 2 },
  })[0], goat);

  goat.counters['-1/-1'] = 1;
  const reactor = permanent(game, opponent, 'Darksteel Reactor');
  reactor.counters.charge = 5;
  const eventide = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81451,
    actionWindow: { type: 'chooseCards', from: [goat, reactor], min: 0, max: 2, aiHint: { kind: 'eventidePermanents' } },
  });
  assert.deepEqual(new Set(eventide.action.picks), new Set([goat, reactor]));

  const enchantment = permanent(game, opponent, 'Flourishing Defenses');
  const glissa = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81452,
    actionWindow: {
      type: 'chooseOption', options: [{ key: '0', label: 'Vuci' }, { key: '1', label: 'Uništi enchantment' }, { key: '2', label: 'Counteri' }],
      aiHint: { kind: 'glissaMode' },
    },
  });
  assert.equal(glissa.action.value, '1');
  assert.ok(enchantment);
});

test('Blight Curse završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Blight Curse', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 81453 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Blight Curse', 'Turtle Power', 'Elven Council'], seed: 81454 },
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
    const logs = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Blight Curse'));
    assert.equal(logs.some(entry => entry.fallback), false);
  }
});
