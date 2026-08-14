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
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 4) {
  const game = new MTG.Game({ seed: 81460, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Most Wanted',
    { name: index ? `Opp ${index}` : 'Most Wanted' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 11;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
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
  return game.bf().filter(card => card.ctrl === player && card.isToken && card.hasSub(subtype)).length;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 220) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 220, 'Most Wanted trigger/stack petlja se nije smirila');
}

test('Most Wanted ima službenih 100 karata, 95 jedinstvenih i Outlaw Treasure AI profil', () => {
  const deck = MTG.DECKS['Most Wanted'];
  assert.equal(deck.commander, 'Olivia, Opulent Outlaw');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 95);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Most Wanted').archetype, 'Outlaw Treasure tempo');
});

test('Olivia grupiše simultane outlaw pogotke, ali ponavlja trigger u double-strike koraku', async () => {
  const { game, players: [most, victim] } = rulesGame([], 2);
  permanent(game, most, 'Olivia, Opulent Outlaw');
  const first = permanent(game, most, 'Changeling Outcast');
  const second = permanent(game, most, 'Captain Lannery Storm');

  await game.emit('combatDamageGroupToPlayer', { player: victim, cards: [first, second], hits: 2, step: 'first' });
  await resolveAll(game);
  assert.equal(tokenCount(game, most, 'Treasure'), 1, 'dva simultana outlawa daju jedan Treasure');

  await game.emit('combatDamageGroupToPlayer', { player: victim, cards: [first], hits: 1, step: 'normal' });
  await resolveAll(game);
  assert.equal(tokenCount(game, most, 'Treasure'), 2, 'novi combat-damage korak daje novi trigger');
});

test('Breena pravi odvojen trigger za svakog napadnutog igrača i ponovo provjerava life na rezoluciji', async () => {
  const { game, players: [most, high, middle, low] } = rulesGame();
  const breena = permanent(game, most, 'Breena, the Demagogue');
  high.life = 40; middle.life = 30; low.life = 20;
  inZone(most, 'Plains', 'library');
  inZone(most, 'Swamp', 'library');

  await game.emit('attackedPlayer', { player: most, defender: high, attackers: [breena] });
  await game.emit('attackedPlayer', { player: most, defender: middle, attackers: [breena] });
  await game.flushTriggers();
  assert.equal(game.stack.filter(item => item.srcCard === breena).length, 2);

  middle.life = 20;
  await resolveAll(game);
  assert.equal(most.hand.length, 1, 'trigger čiji defender više nema više života ne daje kartu');
  assert.equal(breena.counters['+1/+1'], 2);
});

test('Aetherborn Marauder poštuje ljudski izbor izvora i djelimičan broj countera', async () => {
  let first;
  const { game, players: [most] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'aetherbornSources') return [first];
      if (q.type === 'chooseX' && q.aiHint?.kind === 'moveCounters') return 1;
      return defaultDecision(g, q);
    },
  ], 2);
  first = permanent(game, most, 'Humble Defector');
  const second = permanent(game, most, 'Queen Marchesa');
  game.addCounters(first, '+1/+1', 2);
  game.addCounters(second, '+1/+1', 3);
  const marauder = permanent(game, most, 'Aetherborn Marauder');

  await game.emit('etb', { card: marauder });
  await resolveAll(game);
  assert.equal(marauder.counters['+1/+1'], 1);
  assert.equal(first.counters['+1/+1'], 1);
  assert.equal(second.counters['+1/+1'], 3);
});

test('Dire Fleet Daredevil zaključava graveyard metu, počini crime i daje jednokratni off-color cast', async () => {
  let stolen;
  const { game, players: [most, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(stolen)) return [stolen];
      return defaultDecision(g, q);
    },
  ], 2);
  const haul = permanent(game, most, "Bandit's Haul");
  const daredevil = permanent(game, most, 'Dire Fleet Daredevil');
  stolen = inZone(opponent, 'Painful Truths', 'graveyard');
  for (let i = 0; i < 4; i++) inZone(most, 'Plains', 'library');

  await game.emit('etb', { card: daredevil });
  await resolveAll(game);
  assert.equal(stolen.zone, 'exile');
  assert.equal(stolen.meta.playableBy, most);
  assert.equal(haul.counters.loot, 1, 'targetiranje protivničkog groblja je crime');

  most.pool.C = 3;
  const offer = game.castableList(most).find(entry => entry.card === stolen);
  assert.ok(offer?.alt?.asThoughAnyColor, 'bezbojna mana smije platiti crni pip');
  assert.equal(await game.castSpell(most, stolen, { from: 'exile', alt: offer.alt }), true);
  assert.equal(stolen.zone, 'exile', 'Daredevil replacement vraća spell u egzil');
  assert.equal(game.castableList(most).some(entry => entry.card === stolen), false, 'dozvola je potrošena nakon castanja');
});

test('Fain uklanja counter kao cijenu prije priorityja, a Treasure nastaje tek na rezoluciji', async () => {
  let source;
  let sawPaidCost = false;
  const { game, players: [most] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'fainCounterCost') return [source];
      if (q.type === 'priority') {
        sawPaidCost ||= (source.counters['+1/+1'] || 0) === 0 && tokenCount(g, most, 'Treasure') === 0;
        return { kind: 'pass' };
      }
      return defaultDecision(g, q);
    },
  ], 2);
  const fain = permanent(game, most, 'Fain, the Broker');
  source = permanent(game, most, 'Humble Defector');
  game.addCounters(source, '+1/+1', 1);
  const entry = game.activatableList(most).find(action =>
    action.card === fain && action.ability?.cost?.removeCounterFromCreature);

  assert.ok(entry);
  assert.equal(await game.activateAbility(most, entry), true);
  assert.equal(sawPaidCost, true);
  assert.equal(tokenCount(game, most, 'Treasure'), 1);
});

test('Encore tokeni su prisiljeni napasti tačno svoje protivnike', async () => {
  const { game, players: [most, a, b, c] } = rulesGame();
  permanent(game, most, "Graywater's Fixer");
  const outlaw = inZone(most, 'Humble Defector', 'graveyard');
  most.pool.C = outlaw.mv;
  const entry = game.activatableList(most).find(action => action.card === outlaw && action.gyAbility);
  assert.equal(await game.activateAbility(most, entry), true);

  const tokens = game.creatures(most).filter(card => card.isToken && card.name === outlaw.name);
  assert.equal(tokens.length, 3);
  assert.deepEqual(new Set(tokens.map(card => card.meta.mustAttackPlayer)), new Set([a, b, c]));
  for (const token of tokens) {
    const legal = game.legalAttackTargets(token);
    assert.equal(legal.length, 1);
    assert.equal(legal[0], token.meta.mustAttackPlayer);
    assert.equal(game.isForcedToAttack(token), true);
  }
});

test('Kamber Partner with cilja bilo kojeg igrača i taj igrač odlučuje o pretrazi', async () => {
  let recipient;
  const { game, players: [most, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(recipient) ? [recipient] : defaultDecision(g, q),
    (g, q) => q.type === 'chooseOption' && q.aiHint?.kind === 'partnerSearch' ? 'yes' : defaultDecision(g, q),
  ], 2);
  recipient = opponent;
  const laurine = inZone(opponent, 'Laurine, the Diversion', 'library');
  const kamber = permanent(game, most, 'Kamber, the Plunderer');
  await game.emit('etb', { card: kamber });
  await resolveAll(game);
  assert.equal(laurine.zone, 'hand');
  assert.ok(opponent.hand.includes(laurine));
});

test('Mari hit nagrada je stvarni may izbor i može izabrati konkretan hit counter', async () => {
  let useHit = false;
  let marked;
  const { game, players: [most, victim] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseCards' && q.aiHint?.kind === 'mariHit') return useHit ? [marked] : [];
      return defaultDecision(g, q);
    },
  ], 2);
  const mari = permanent(game, most, 'Mari, the Killing Quill');
  const rogue = permanent(game, most, 'Changeling Outcast');
  marked = inZone(victim, 'Grave Titan', 'exile');
  marked.counters.hit = 1;
  inZone(most, 'Plains', 'library');

  await game.emit('combatDamageToPlayer', { card: rogue, player: victim, n: 1 });
  await resolveAll(game);
  assert.equal(marked.counters.hit, 1);
  assert.equal(tokenCount(game, most, 'Treasure'), 0);

  useHit = true;
  await game.emit('combatDamageToPlayer', { card: rogue, player: victim, n: 1 });
  await resolveAll(game);
  assert.equal(marked.counters.hit || 0, 0);
  assert.equal(most.hand.length, 1);
  assert.equal(tokenCount(game, most, 'Treasure'), 2);
  assert.ok(mari);
});

test('Hex, Curtains Call i Back in Town zaključavaju tačan broj različitih meta', async () => {
  const { game, players: [most, opponent] } = rulesGame([], 2);
  const hex = inZone(most, 'Hex', 'hand');
  for (let i = 0; i < 5; i++) permanent(game, opponent, 'Ignoble Hierarch');
  most.pool.C = 4; most.pool.B = 2;
  assert.equal(game.castableList(most).some(entry => entry.card === hex), false);
  permanent(game, most, 'Humble Defector');
  assert.equal(game.castableList(most).some(entry => entry.card === hex), true, 'vlastito stvorenje je legalna šesta meta');

  const curtains = MTG.DEFS["Curtains' Call"].targets;
  assert.equal(curtains[1].differentFromAllPrevious, true);
  const backTargets = MTG.DEFS['Back in Town'].targets(game, null, { xVal: 2 });
  assert.equal(backTargets[0].count, 2);
  assert.equal(backTargets[0].upTo, undefined);
  const zeroTargets = MTG.DEFS['Back in Town'].targets(game, null, { xVal: 0 });
  const zeroCtx = {};
  assert.equal(await game.pickTargets(zeroCtx, zeroTargets, hex, most), true);
  assert.equal(zeroCtx.targets.length, 1);
  assert.equal(zeroCtx.targets[0].length, 0, 'X=0 ima tačno nula meta, ne implicitnu jednu');
});

test('Heliod Intervention bira mod prije meta, a Boros Charm cilja igrača ili planeswalkera', async () => {
  const { game, players: [most, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'heliodIntervention') return '1';
      if (q.type === 'chooseTargets' && q.candidates.includes(opponent)) return [opponent];
      if (q.type === 'chooseX') return 3;
      return defaultDecision(g, q);
    },
  ], 2);
  const intervention = inZone(most, "Heliod's Intervention", 'hand');
  most.pool.C = 3; most.pool.W = 2;
  const before = opponent.life;
  assert.equal(await game.castSpell(most, intervention, { from: 'hand', xVal: 3 }), true);
  assert.equal(opponent.life, before + 6);

  const charm = new MTG.CardInst(MTG.DEFS['Boros Charm'], most);
  const damageSpec = charm.def.modes.list[0].targets[0];
  const creature = permanent(game, opponent, 'Grave Titan');
  const walker = permanent(game, opponent, "Kaya, Geist Hunter");
  const legal = game.legalTargets(damageSpec, charm, most);
  assert.ok(legal.includes(most) && legal.includes(opponent) && legal.includes(walker));
  assert.equal(legal.includes(creature), false);
});

test('Bounty Board, Shiny Impetus i Rogues Passage smiju birati vlastito ili tuđe stvorenje', async () => {
  const { game, players: [most, a, b, c] } = rulesGame();
  const board = permanent(game, most, 'Bounty Board');
  const own = permanent(game, most, 'Humble Defector');
  const enemy = permanent(game, a, 'Grave Titan');
  for (const player of [a, b, c]) inZone(player, 'Plains', 'library');

  assert.ok(game.legalTargets(board.def.abilities[0].targets[0], board, most).includes(own));
  game.addCounters(own, 'bounty', 1);
  await game.destroy(own);
  await resolveAll(game);
  assert.equal(most.hand.length, 0);
  assert.deepEqual([a, b, c].map(player => player.hand.length), [1, 1, 1]);
  assert.deepEqual([a, b, c].map(player => player.life), [42, 42, 42]);

  const shiny = new MTG.CardInst(MTG.DEFS['Shiny Impetus'], most);
  const passage = permanent(game, most, "Rogue's Passage");
  assert.ok(game.legalTargets(shiny.def.auraTarget[0], shiny, most).includes(own) === false, 'mrtva karta nije legalna');
  assert.ok(game.legalTargets(shiny.def.auraTarget[0], shiny, most).includes(enemy));
  assert.ok(game.legalTargets(passage.def.abilities[0].targets[0], passage, most).includes(enemy));
});

test('Life Insurance traži bijelu ili crnu manu, a svaka Rain of Riches prati vlastiti prvi Treasure spell', () => {
  const { game, players: [most] } = rulesGame([], 2);
  const insurance = permanent(game, most, 'Life Insurance');
  const extort = insurance.def.triggers[0];
  most.pool.C = 1;
  assert.equal(game.canPayMana(most, MTG.parseCost('{W/B}')), false);
  most.pool.C = 0; most.pool.W = 1;
  assert.equal(game.canPayMana(most, MTG.parseCost('{W/B}')), true);
  assert.ok(extort);

  const rainA = permanent(game, most, 'Rain of Riches');
  const rainB = permanent(game, most, 'Rain of Riches');
  const spell = new MTG.CardInst(MTG.DEFS['Painful Truths'], most);
  const so = { treasureUsed: true };
  assert.equal(rainA.def.grantsCascade(game, rainA, spell, {}, so), true);
  assert.equal(rainB.def.grantsCascade(game, rainB, spell, {}, so), true);
  assert.equal(rainA.def.grantsCascade(game, rainA, spell, {}, so), false);
  assert.equal(rainB.def.grantsCascade(game, rainB, spell, {}, so), false);
});

test('Feed, Painful Truths, Veinwitch i Mass Mutiny poštuju nezavisne efekte i cast-time mete', async () => {
  let graveTarget;
  const { game, players: [most, a, b, c] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(graveTarget)) return [graveTarget];
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'veinwitchPay') return 'yes';
      return defaultDecision(g, q);
    },
  ]);
  const feedTarget = permanent(game, a, 'Grave Titan');
  feedTarget.cur.kw.add('indestructible');
  const feed = new MTG.CardInst(MTG.DEFS['Feed the Swarm'], most);
  const lifeBefore = most.life;
  await feed.def.resolve({ g: game, src: feed, you: most, targets: [feedTarget] });
  assert.equal(feedTarget.zone, 'battlefield');
  assert.equal(most.life, lifeBefore - feedTarget.mv, 'life loss ne zavisi od uspješnog uništenja');

  const truths = new MTG.CardInst(MTG.DEFS['Painful Truths'], most);
  truths.meta._payColors = [];
  const truthLife = most.life;
  await truths.def.resolve({ g: game, src: truths, you: most, targets: [] });
  assert.equal(most.life, truthLife, 'nula stvarno potrošenih boja znači X=0');

  const coven = permanent(game, most, 'Veinwitch Coven');
  graveTarget = inZone(most, 'Humble Defector', 'graveyard');
  most.pool.B = 1;
  await game.emit('lifeGain', { player: most, n: 1, first: true });
  await game.flushTriggers();
  const trigger = game.stack.find(item => item.srcCard === coven);
  assert.equal(trigger.targets[0], graveTarget);
  await game.move(graveTarget, 'exile');
  await resolveAll(game);
  assert.equal(most.pool.B, 1, 'fizzlana zaključana meta ne traži payment');

  permanent(game, a, 'Ignoble Hierarch');
  permanent(game, b, 'Queen Marchesa');
  permanent(game, c, 'Impulsive Pilferer');
  const mutiny = new MTG.CardInst(MTG.DEFS['Mass Mutiny'], most);
  const specs = game.spellTargetSpecs(mutiny, {});
  assert.equal(specs.length, 3);
  assert.equal(specs.every(spec => spec.upTo && spec.count === 1), true);
  const controllers = specs.map(spec => game.legalTargets(spec, mutiny, most)[0].ctrl);
  assert.equal(controllers[0], a);
  assert.equal(controllers[1], b);
  assert.equal(controllers[2], c);
});

test('Most Wanted AI bira Seize, Grenzo, Heliod, Fain i Rankle prema stvarnoj poziciji', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  const small = permanent(game, opponent, 'Ignoble Hierarch');
  let decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: opponent.idx, seed: 81461,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'fame', label: 'Fame' }, { key: 'fortune', label: 'Fortune' }],
      aiHint: { kind: 'fameFortune', forWhom: bot },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 'fame', 'malo stvorenje je jeftinije dati privremeno nego kartu+Treasure');

  const giant = permanent(game, opponent, 'Grave Titan');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: opponent.idx, seed: 81462,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'fame', label: 'Fame' }, { key: 'fortune', label: 'Fortune' }],
      aiHint: { kind: 'fameFortune', forWhom: bot },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), 'fortune', 'vrijedno stvorenje ostaje kod vlasnika');

  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81463,
    actionWindow: {
      type: 'chooseOption', options: [{ key: '0', label: 'Goad' }, { key: '1', label: 'Exile top' }],
      data: { player: opponent }, aiHint: { kind: 'grenzoMode' },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), '0');

  bot.life = 6;
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81464,
    actionWindow: {
      type: 'chooseOption', options: [{ key: '0', label: 'Destroy' }, { key: '1', label: 'Gain life' }],
      aiHint: { kind: 'heliodIntervention', x: 4 },
    },
  });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action), '1');

  small.counters.stun = 1;
  giant.counters['+1/+1'] = 2;
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: opponent.idx, seed: 81465,
    actionWindow: { type: 'chooseCards', from: [small, giant], min: 1, max: 1, aiHint: { kind: 'fainCounterCost' } },
  });
  assert.equal(decision.action.picks[0], small);

  await game.move(small, 'graveyard');
  const fodder = permanent(game, bot, 'Impulsive Pilferer');
  permanent(game, opponent, 'Queen Marchesa');
  decision = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 81466,
    actionWindow: {
      type: 'chooseMulti', min: 0, max: 3,
      options: [{ key: 'disc', label: 'Discard' }, { key: 'draw', label: 'Draw' }, { key: 'sac', label: 'Sacrifice' }],
      aiHint: { kind: 'rankleModes' },
    },
  });
  assert.ok(MTG.unwrapBotDecisionAction(decision.action).includes('sac'));
  assert.ok(fodder);
});

test('Most Wanted završava pune partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Most Wanted', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 81467 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Most Wanted', 'Turtle Power', 'Elven Council'], seed: 81468 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Most Wanted'));
    assert.equal(logs.some(entry => entry.fallback), false);
  }
});
