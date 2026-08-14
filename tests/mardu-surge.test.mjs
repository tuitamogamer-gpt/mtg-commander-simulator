import test from 'node:test';
import assert from 'node:assert/strict';
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

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 81490, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Mardu',
    { name: index ? `Opp ${index}` : 'Mardu Surge' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 12;
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

function tokenCount(game, player, subtype) {
  return game.bf().filter(card => card.ctrl === player && card.isToken && (!subtype || card.hasSub(subtype))).length;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 240) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 240, 'Mardu trigger/stack petlja se nije smirila');
}

test('Mardu Surge ima službenih 100 karata, 88 jedinstvenih i puni token-aggro AI profil', () => {
  const deck = MTG.DECKS['Mardu Surge'];
  assert.equal(deck.commander, 'Zurgo Stormrender');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 88);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Mardu Surge').archetype, 'Go-wide token aggro');
});

test('Mobilize bira odredište svakog tokena, a token ulazi kao tapovan napadač prije ETB događaja', async () => {
  let wanted;
  let enteredAttacking = false;
  const { game, players: [mardu, first, second] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'attackDestination') {
        return q.options.find(option => option.target === wanted)?.key;
      }
      return defaultDecision(g, q);
    },
  ], 3);
  const zurgo = permanent(game, mardu, 'Zurgo Stormrender', { commander: true });
  wanted = second;
  game.combat = { attackers: [zurgo], defenders: new Map() };
  zurgo.attacking = first;
  game.delayed.push({
    on: 'tokensCreated', once: true, ctrl: mardu,
    run: async ctx => { enteredAttacking = ctx.data.tokens.every(token => token.attacking === second && token.tapped); },
  });

  await game.emit('attacks', { card: zurgo, player: mardu, defender: first });
  await resolveAll(game);
  const warrior = game.creatures(mardu).find(card => card.isToken && card.hasSub('Warrior'));
  assert.ok(warrior);
  assert.equal(warrior.attacking, second);
  assert.equal(enteredAttacking, true);
});

test('Redoubled Stormsinger nema vještački limit, kopije biraju različite branioce i žrtvuju se simultano', async () => {
  let destinationIndex = 0;
  const { game, players: [mardu, first, second, third] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'attackDestination') {
        const destinations = [second, third, first];
        const wanted = destinations[destinationIndex++ % destinations.length];
        return q.options.find(option => option.target === wanted)?.key || q.options[0]?.key;
      }
      return defaultDecision(g, q);
    },
  ]);
  const zurgo = permanent(game, mardu, 'Zurgo Stormrender', { commander: true });
  const storm = permanent(game, mardu, 'Redoubled Stormsinger');
  for (let i = 0; i < 10; i++) inZone(mardu, 'Plains', 'library');
  await game.makeTokens('servo', mardu, { n: 7 });
  game.combat = { attackers: [storm], defenders: new Map() };
  storm.attacking = first;

  await game.emit('attacks', { card: storm, player: mardu, defender: first });
  await resolveAll(game);
  const all = game.creatures(mardu).filter(card => card.isToken && card.hasSub('Servo'));
  assert.equal(all.length, 14, 'svih sedam novih tokena dobija kopiju');
  const copies = all.filter(card => card.attacking);
  assert.equal(copies.length, 7);
  assert.deepEqual(new Set(copies.map(card => card.attacking)), new Set([first, second, third]));

  const stolen = copies[0];
  stolen.ctrl = second;
  for (const card of game.bf()) card.attacking = null;
  game.combat = null;
  const opponentLife = [first.life, second.life, third.life];
  await game.emit('endStep', { player: first });
  await resolveAll(game);
  assert.equal(stolen.zone, 'battlefield', 'kontrolor delayed triggera ne može žrtvovati ukradeni token');
  assert.equal(tokenCount(game, mardu, 'Servo'), 7, 'ostaje sedam originala; šest kontrolisanih kopija je žrtvovano');
  assert.deepEqual([first.life, second.life, third.life], opponentLife.map(life => life - 6),
    'nakon kraja combata žrtvovane kopije više ne napadaju, pa svaki Zurgo trigger skida život');
  assert.equal(mardu.hand.length, 0);
  assert.equal(zurgo.zone, 'battlefield');
});

test('Zurgo vidi napadajući token koji ode simultano s njim i koristi LKI kontrolora', async () => {
  const { game, players: [mardu, opponent] } = rulesGame([], 2);
  const zurgo = permanent(game, mardu, 'Zurgo Stormrender', { commander: true });
  inZone(mardu, 'Plains', 'library');
  game.combat = { attackers: [], defenders: new Map() };
  const [warrior] = await game.makeTokens('warriorR', mardu, { tapped: true, attacking: opponent });
  const before = mardu.hand.length;

  await game.destroyMany([zurgo, warrior]);
  await resolveAll(game);
  assert.equal(zurgo.zone, 'command');
  assert.equal(warrior.zone, 'ceased');
  assert.equal(mardu.hand.length, before + 1);
});

test('Hero of Bladehold stavlja Battle cry i stvaranje tokena kao odvojene triggere koje igrač može poredati', async () => {
  let tokenDefender;
  const { game, players: [mardu, opponent, other] } = rulesGame([
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'attackDestination'
      ? q.options.find(option => option.target === tokenDefender)?.key
      : defaultDecision(g, q),
  ], 3);
  const hero = permanent(game, mardu, 'Hero of Bladehold');
  tokenDefender = other;
  hero.attacking = opponent;
  game.combat = { attackers: [hero], defenders: new Map() };

  await game.emit('attacks', { card: hero, player: mardu, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.filter(item => item.srcCard === hero).length, 2);
  await resolveAll(game);
  const soldiers = game.creatures(mardu).filter(card => card.isToken && card.hasSub('Soldier'));
  assert.equal(soldiers.length, 2);
  assert.equal(soldiers.every(card => card.power === 2), true, 'tokeni-first redoslijed dopušta Battle cry pump');
  assert.equal(soldiers.every(card => card.attacking === other), true);
});

test('Legion Warboss zaključava izabranu Mentor metu na stacku i ne prebacuje counter nakon fizzle-a', async () => {
  let chosen;
  const { game, players: [mardu, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(chosen) ? [chosen] : defaultDecision(g, q),
  ], 2);
  const warboss = permanent(game, mardu, 'Legion Warboss');
  await warboss.def.triggers.find(trigger => trigger.on === 'beginCombat').run({ g: game, src: warboss, you: mardu });
  const forced = game.creatures(mardu).find(card => card.isToken && card.hasSub('Goblin'));
  assert.equal(forced.kw('haste'), true);
  assert.equal(game.isForcedToAttack(forced), true);
  const [first, second] = await game.makeTokens('goblin', mardu, { n: 2 });
  chosen = second;
  for (const card of [warboss, first, chosen]) card.attacking = opponent;
  game.combat = { attackers: [warboss, first, chosen], defenders: new Map() };

  await game.emit('attacks', { card: warboss, player: mardu, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], chosen);
  await game.move(chosen, 'graveyard');
  await resolveAll(game);
  assert.equal(first.counters['+1/+1'] || 0, 0);
});

test('Ophiomancer okida na svakom upkeepu i ponovo provjerava intervening-if na rezoluciji', async () => {
  const { game, players: [mardu, first, second] } = rulesGame([], 3);
  permanent(game, mardu, 'Ophiomancer');
  await game.emit('upkeep', { player: first });
  await game.flushTriggers();
  assert.equal(game.stack.length, 1);
  await game.makeTokens('snakeB', mardu);
  await resolveAll(game);
  assert.equal(tokenCount(game, mardu, 'Snake'), 1, 'postojeća Snake sprečava token pri rezoluciji');

  const snake = game.creatures(mardu).find(card => card.hasSub('Snake'));
  await game.move(snake, 'graveyard');
  await game.emit('upkeep', { player: second });
  await resolveAll(game);
  assert.equal(tokenCount(game, mardu, 'Snake'), 1, 'tuđi upkeep pravi Snake kada je nema');
});

test('Mindblade Render okida jednom po oštećenom protivniku u istom combat-damage koraku', async () => {
  const { game, players: [mardu, first, second] } = rulesGame([], 3);
  permanent(game, mardu, 'Mindblade Render');
  const warriorA = permanent(game, mardu, 'Zurgo Stormrender');
  const warriorB = permanent(game, mardu, 'Ainok Strike Leader');
  for (let i = 0; i < 3; i++) inZone(mardu, 'Plains', 'library');
  const life = mardu.life;

  await game.emit('combatDamageGroupToPlayer', { player: first, cards: [warriorA, warriorB], hits: 2, step: 'normal' });
  await game.emit('combatDamageGroupToPlayer', { player: second, cards: [warriorA], hits: 1, step: 'normal' });
  await resolveAll(game);
  assert.equal(mardu.hand.length, 2);
  assert.equal(mardu.life, life - 2);
});

test('Will of the Mardu zaključava oba moda i obje mete pri castu, pa koristi stanje na rezoluciji', async () => {
  let tokenPlayer;
  let damageTarget;
  let commander;
  const { game, players: [mardu, first, second] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseMulti') return ['0', '1'];
      if (q.type === 'chooseTargets') {
        if (q.candidates.includes(tokenPlayer)) return [tokenPlayer];
        if (q.candidates.includes(damageTarget)) return [damageTarget];
      }
      return defaultDecision(g, q);
    },
  ], 3);
  commander = permanent(game, mardu, 'Zurgo Stormrender', { commander: true });
  permanent(game, mardu, 'Ophiomancer');
  tokenPlayer = second;
  permanent(game, second, 'Ophiomancer');
  permanent(game, second, 'Loyal Apprentice');
  damageTarget = permanent(game, first, 'Mindblade Render');
  const will = inZone(mardu, 'Will of the Mardu', 'hand');
  game.priorityRound = async () => {};

  assert.equal(await game.castSpell(mardu, will, { from: 'hand', alt: { free: true } }), true);
  const spell = game.stack.find(item => item.card?.name === 'Will of the Mardu');
  assert.equal(spell.mode.length, 2);
  assert.equal(spell.targets.length, 2);
  assert.equal(spell.targets[0], tokenPlayer);
  assert.equal(spell.targets[1], damageTarget);
  await game.move(commander, 'graveyard');
  await resolveAll(game);
  assert.equal(tokenCount(game, mardu, 'Warrior'), 2);
  assert.equal(damageTarget.zone, 'graveyard');
});

test('Bitter Triumph i Eliminate the Competition plaćaju dodatne cijene prije priorityja', async () => {
  let discard;
  let bitterTarget;
  let eliminateTargets;
  let fodder;
  const { game, players: [mardu, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'bitterTriumphCost') return 'discard';
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'addlDiscard') return [discard];
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'eliminateSacrifice') return fodder.slice();
      if (q.type === 'chooseTargets') {
        if (q.candidates.includes(bitterTarget)) return [bitterTarget];
        if (eliminateTargets?.every(card => q.candidates.includes(card))) return eliminateTargets.slice();
      }
      return defaultDecision(g, q);
    },
  ], 2);
  discard = inZone(mardu, 'Plains', 'hand');
  bitterTarget = permanent(game, opponent, 'Mindblade Render');
  const bitter = inZone(mardu, 'Bitter Triumph', 'hand');
  game.priorityRound = async () => {};
  assert.equal(await game.castSpell(mardu, bitter, { from: 'hand', alt: { free: true } }), true);
  assert.equal(discard.zone, 'graveyard');
  assert.equal(bitterTarget.zone, 'battlefield');
  await resolveAll(game);
  assert.equal(bitterTarget.zone, 'graveyard');

  fodder = [
    permanent(game, mardu, 'Loyal Apprentice'),
    permanent(game, mardu, 'Ophiomancer'),
  ];
  eliminateTargets = [
    permanent(game, opponent, 'Mindblade Render'),
    permanent(game, opponent, 'Legion Warboss'),
  ];
  const eliminate = inZone(mardu, 'Eliminate the Competition', 'hand');
  assert.equal(await game.castSpell(mardu, eliminate, { from: 'hand', alt: { free: true } }), true);
  assert.equal(fodder.every(card => card.zone !== 'battlefield'), true);
  assert.equal(eliminateTargets.every(card => card.zone === 'battlefield'), true);
  await resolveAll(game);
  assert.equal(eliminateTargets.every(card => card.zone === 'graveyard'), true);

  permanent(game, mardu, 'Ophiomancer');
  permanent(game, opponent, 'Mindblade Render');
  permanent(game, opponent, 'Legion Warboss');
  const stolenSpec = game.spellTargetSpecs(eliminate, {}, opponent)[0];
  assert.equal(stolenSpec.count, 2, 'ukradeni Eliminate računa stvorenja stvarnog castera, ne ownera karte');
});

test('Sun Titan zaključava graveyard metu na triggeru i ne bira fallback pri rezoluciji', async () => {
  let target;
  const { game, players: [mardu, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(target) ? [target] : defaultDecision(g, q),
  ], 2);
  const titan = permanent(game, mardu, 'Sun Titan');
  target = inZone(mardu, 'Sol Ring', 'graveyard');
  const fallback = inZone(mardu, 'Infantry Shield', 'graveyard');
  titan.attacking = opponent;
  game.combat = { attackers: [titan], defenders: new Map() };

  await game.emit('attacks', { card: titan, player: mardu, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], target);
  await game.move(target, 'exile');
  await resolveAll(game);
  assert.equal(fallback.zone, 'graveyard');
  assert.equal(target.zone, 'exile');
});

test('Myriad pita za svakog protivnika, kopija može napasti njegov planeswalker i egzilira se na kraju combata', async () => {
  let source;
  let walker;
  let sawCopies = false;
  const { game, players: [mardu, attacked, walkerOwner, other] } = rulesGame([
    (g, q) => {
      if (q.type === 'attackers') return [{ card: source, target: attacked }];
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'myriadCopy') return 'yes';
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'attackDestination' && q.aiHint.restrictedDefender === walkerOwner) {
        return q.options.find(option => option.target === walker)?.key;
      }
      return defaultDecision(g, q);
    },
  ]);
  source = permanent(game, mardu, 'Goldlust Triad');
  walker = permanent(game, walkerOwner, 'Kaya, Geist Hunter');
  walker.counters.loyalty = 8;
  const realPriority = game.priorityRound.bind(game);
  game.priorityRound = async afterPlayer => {
    const copies = game.bf().filter(card => card.isToken && card.name === source.name);
    if (copies.length === 2) {
      sawCopies ||= copies.some(card => card.attacking === walker) && copies.some(card => card.attacking === other);
    }
    return realPriority(afterPlayer);
  };

  await game.combatPhase(mardu);
  assert.equal(sawCopies, true);
  assert.equal(game.bf().some(card => card.isToken && card.name === source.name), false);
  assert.equal(game.players.length, 4);
});

test('Myr Battlesphere može pogoditi planeswalkera, a Lieutenant sposobnosti ponovo provjeravaju commandera', async () => {
  const { game, players: [mardu, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'myrBattlesphere' ? q.from.slice() : defaultDecision(g, q),
  ], 2);
  const sphere = permanent(game, mardu, 'Myr Battlesphere');
  const walker = permanent(game, opponent, 'Kaya, Geist Hunter');
  walker.counters.loyalty = 8;
  const myrs = [];
  for (let i = 0; i < 3; i++) myrs.push((await game.makeTokens('myr', mardu))[0]);
  sphere.attacking = walker;
  await sphere.def.triggers.find(trigger => trigger.on === 'attacks').run({ g: game, src: sphere, you: mardu });
  assert.equal(walker.counters.loyalty, 5);
  assert.equal(myrs.every(card => card.tapped), true);

  const commander = permanent(game, mardu, 'Zurgo Stormrender', { commander: true });
  const forger = permanent(game, mardu, 'Ironwill Forger');
  permanent(game, mardu, 'Loyal Apprentice');
  await game.emit('beginCombat', { player: mardu });
  await game.flushTriggers();
  await game.move(commander, 'graveyard');
  await resolveAll(game);
  assert.equal(forger.kw('myriad'), false);
  assert.equal(tokenCount(game, mardu, 'Thopter'), 0);
});

test('Kaya +1 cilja do jedan tačno izabrani vlastiti token', async () => {
  const { game, players: [mardu] } = rulesGame([], 2);
  const kaya = permanent(game, mardu, 'Kaya, Geist Hunter');
  const [first, chosen] = await game.makeTokens('servo', mardu, { n: 2 });
  const ability = kaya.def.abilities[0];
  assert.equal(ability.targets[0].upTo, true);
  const legal = game.legalTargets(ability.targets[0], kaya, mardu);
  assert.equal(legal.length, 2);
  assert.equal(legal.includes(first) && legal.includes(chosen), true);

  await ability.run({ g: game, src: kaya, you: mardu, targets: [chosen] });
  assert.equal(first.counters['+1/+1'] || 0, 0);
  assert.equal(chosen.counters['+1/+1'], 1);
  assert.equal(first.kw('deathtouch'), true);
  assert.equal(chosen.kw('deathtouch'), true);
});

test('Grenzo dopušta samo cast iz egzila, dok Gix dopušta i land play', async () => {
  const { game, players: [mardu, opponent] } = rulesGame([], 2);
  const grenzo = permanent(game, mardu, 'Grenzo, Havoc Raiser');
  const grenzoLand = inZone(opponent, 'Plains', 'library');
  const grenzoTrigger = grenzo.def.triggers[0];
  await grenzoTrigger.run({ g: game, src: grenzo, you: mardu, data: { player: opponent }, mode: 1, targets: [] });
  assert.equal(grenzoLand.zone, 'exile');
  assert.equal(game.playableLands(mardu).includes(grenzoLand), false);

  const gix = permanent(game, mardu, 'Gix, Yawgmoth Praetor');
  const gixLand = inZone(opponent, 'Swamp', 'library');
  await gix.def.abilities[0].run({ g: game, src: gix, you: mardu, targets: [opponent], x: 1 });
  assert.equal(gixLand.zone, 'exile');
  assert.equal(game.playableLands(mardu).includes(gixLand), true);
});

test('Mardu AI bira token sinergiju, dobru attack metu, siguran Bitter trošak i koristan Will mod', async () => {
  const { game, players: [bot, first, second] } = rulesGame([], 3);
  bot.isAI = true;
  permanent(game, bot, 'Bastion of Remembrance');
  let decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81491,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'c', label: 'Counters' }, { key: 't', label: 'Servos' }],
      aiHint: { kind: 'fabricate' },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 't');

  first.life = 30;
  second.life = 1;
  const attackOptions = [
    { key: '0', label: first.name, target: first },
    { key: '1', label: second.name, target: second },
  ];
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81492,
    actionWindow: { type: 'chooseOption', options: attackOptions, aiHint: { kind: 'attackDestination', token: { power: 1 } } },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), '1');

  bot.life = 7;
  const discard = inZone(bot, 'Plains', 'hand');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81493,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'discard', label: 'Discard' }, { key: 'life', label: 'Life' }],
      aiHint: { kind: 'bitterTriumphCost', life: 3 },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 'discard');
  assert.ok(discard);

  for (let i = 0; i < 4; i++) permanent(game, first, i % 2 ? 'Loyal Apprentice' : 'Ophiomancer');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81494,
    actionWindow: {
      type: 'chooseOption', options: [{ key: '0', label: 'Warriors' }, { key: '1', label: 'Damage' }],
      aiHint: { kind: 'willMardu' },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), '0');
});

test('Mardu Surge završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Mardu Surge', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 81495 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Mardu Surge', 'Turtle Power', 'Elven Council'], seed: 81496 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Mardu Surge'));
    assert.equal(logs.some(entry => entry.fallback), false);
  }
});
