import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const intake = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-intake.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-oracle.json', import.meta.url), 'utf8'));
const deckIntake = intake.decks.find(deck => deck.name === 'Sultai Arisen');
const newNames = deckIntake.missingNames;
const sharedNames = ['Satyr Wayfinder', 'Springbloom Druid', 'Multani, Yavimaya\'s Avatar', 'Harrow'];

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

function rulesGame(deciders = [], count = 2) {
  const game = new MTG.Game({ seed: 230823, paced: false, maxTurns: 30 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Sultai',
    { name: index ? `Opponent ${index}` : 'Sultai Arisen' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
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
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 240) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 240, 'Sultai stack and trigger queue did not settle');
}

test('Sultai Arisen is a 100-card Teval deck and all 57 intake cards use exact Oracle data and executable definitions', () => {
  const deck = MTG.DECKS['Sultai Arisen'];
  assert.equal(deck.commander, 'Teval, the Balanced Scale');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 88);
  assert.equal(newNames.length, 57);
  assert.equal(new Set(newNames).size, 57);
  assert.deepEqual(newNames.filter(name => !MTG.SCRIPTS[name]), []);
  assert.deepEqual(newNames.filter(name => !MTG.DEFS[name]), []);

  const reported = oracle.cards.filter(card => newNames.includes(card.requestedName));
  assert.equal(reported.length, 57);
  for (const card of reported) {
    assert.equal(MTG.DEFS[card.requestedName].oracle, card.raw.oracle, `${card.requestedName} Oracle text drifted`);
    assert.equal(MTG.DEFS[card.requestedName].simplified, undefined);
    assert.equal(MTG.DEFS[card.requestedName].engineGap, undefined);
  }
  assert.equal(reported.some(card => card.keywords.includes('Dredge')), true);
  assert.equal(reported.some(card => card.keywords.includes('Eternalize')), true);
  assert.equal(reported.some(card => card.keywords.includes('Delve')), true);
  assert.equal(reported.some(card => card.keywords.includes('Landfall')), true);
  assert.equal(reported.some(card => card.keywords.includes('Encore')), true);

  const source = fs.readFileSync(new URL('../src/modules/scripts-sultai.js', import.meta.url), 'utf8');
  for (const name of sharedNames) assert.equal(source.includes(`SC['${name}'] =`), false, `${name} must be reused, not redefined`);
  assert.doesNotMatch(source, /fallback|simplified|TODO|engineGap/i);
});

test('Living Death exiles graveyard creatures in batches, sacrifices the battlefield as one event, then returns only its exiled set', async () => {
  const { game, players: [sultai, opponent] } = rulesGame([undefined, (g,q) =>
    q.aiHint?.kind === 'optTrigger' && q.aiHint.src.name === 'Noxious Gearhulk' ? 'no' : defaultDecision(g,q)]);
  const teval = permanent(game, sultai, 'Teval, the Balanced Scale');
  const ownBoard = permanent(game, sultai, 'Skull Prophet');
  const enemyBoard = permanent(game, opponent, 'Hedron Crab');
  const ownOne = inZone(sultai, 'Gravecrawler', 'graveyard');
  const ownTwo = inZone(sultai, 'Timeless Witness', 'graveyard');
  const enemyOne = inZone(opponent, 'Noxious Gearhulk', 'graveyard');
  const nonCreature = inZone(sultai, 'Life from the Loam', 'graveyard');

  const observations = [];
  const originalBatch = game.moveGraveyardBatch.bind(game);
  game.moveGraveyardBatch = async (cards, zone, opts) => {
    observations.push({ kind: 'exile', names: cards.map(card => card.name), zone,
      battlefield: game.creatures().map(card => card.name) });
    return originalBatch(cards, zone, opts);
  };
  const originalMove = game.move.bind(game);
  game.move = async (card, zone, opts) => {
    if (zone === 'battlefield' && card.zone === 'exile') observations.push({ kind: 'return', name: card.name,
      battlefield: game.creatures().map(creature => creature.name) });
    return originalMove(card, zone, opts);
  };

  await MTG.DEFS['Living Death'].resolve({ g: game, src: null, you: sultai });
  assert.equal(nonCreature.zone, 'graveyard', 'Living Death itself must not move noncreature cards');
  await resolveAll(game);

  assert.deepEqual(observations.filter(entry => entry.kind === 'exile').map(entry => Array.from(entry.names)),
    [['Gravecrawler', 'Timeless Witness'], ['Noxious Gearhulk']]);
  assert.ok(observations.filter(entry => entry.kind === 'exile').every(entry => entry.battlefield.includes('Skull Prophet')),
    'all graveyard exiles must happen before any sacrifice');
  assert.ok(observations.find(entry => entry.kind === 'return').battlefield.every(name => !['Skull Prophet', 'Hedron Crab', 'Teval, the Balanced Scale'].includes(name)),
    'all battlefield creatures must be sacrificed before the first return');
  assert.equal(ownOne.zone, 'battlefield');
  assert.equal(ownTwo.zone, 'battlefield');
  assert.equal(enemyOne.zone, 'battlefield');
  assert.equal(ownBoard.zone, 'graveyard');
  assert.equal(enemyBoard.zone, 'graveyard');
  assert.equal(teval.zone, 'graveyard');
  assert.equal(nonCreature.zone, 'hand', 'the returned Timeless Witness may recur it after Living Death has finished');
  assert.equal(game.bf().filter(card => card.isToken && card.name === 'Zombie Druid Token').length, 1,
    'two own creatures leaving together are one Teval trigger');
});

test('Dauthi replaces opponent graveyard movement and its activated ability grants a real zero-mana exile cast', async () => {
  let voidCard;
  const { game, players: [sultai, opponent] } = rulesGame([
    (g, query) => query.type === 'chooseCards' && query.from.includes(voidCard) ? [voidCard] : defaultDecision(g, query),
  ]);
  const dauthi = permanent(game, sultai, 'Dauthi Voidwalker');
  voidCard = inZone(opponent, 'Noxious Gearhulk', 'library');
  await game.mill(opponent, 1);
  assert.equal(voidCard.zone, 'exile');
  assert.equal(voidCard.counters.void, 1);

  const action = game.activatableList(sultai).find(entry => entry.card === dauthi && entry.ability);
  assert.ok(action);
  assert.equal(await game.activateAbility(sultai, action), true);
  await resolveAll(game);
  assert.equal(dauthi.zone, 'graveyard');
  const cast = game.castableList(sultai).find(entry => entry.card === voidCard && entry.from === 'exile' && entry.alt?.free);
  assert.ok(cast, 'the selected opponent-owned void card must be offered as a free cast');
  assert.equal(await game.castSpell(sultai, voidCard, { from: cast.from, alt: cast.alt }), true);
  assert.equal(voidCard.zone, 'stack');
  assert.equal(voidCard.castMeta.alt.free, true);
  await resolveAll(game);
  assert.equal(voidCard.zone, 'battlefield');
  assert.equal(voidCard.ctrl, sultai);
});

test('shared dredge, eternalize, cards-left batch, and graveyard-entry batch paths drive Sultai rewards', async () => {
  let loam;
  const { game, players: [sultai] } = rulesGame([
    (g, query) => query.aiHint?.kind === 'dredge' ? `dredge:${loam.iid}` : defaultDecision(g, query),
  ]);
  loam = inZone(sultai, 'Life from the Loam', 'graveyard');
  for (let i = 0; i < 5; i++) inZone(sultai, i % 2 ? 'Forest' : 'Swamp', 'library');
  assert.equal(await game.draw(sultai, 1), 0);
  assert.equal(loam.zone, 'hand');
  assert.equal(sultai.library.length, 2);

  const witness = inZone(sultai, 'Timeless Witness', 'graveyard');
  sultai.pool.G = 2; sultai.pool.C = 5;
  const eternalize = game.activatableList(sultai).find(entry => entry.card === witness && entry.gyAbility);
  assert.ok(eternalize);
  assert.equal(await game.activateAbility(sultai, eternalize), true);
  await resolveAll(game);
  const token = game.bf().find(card => card.isToken && card.name === 'Timeless Witness');
  assert.ok(token);
  assert.equal(token.power, 4);
  assert.equal(token.toughness, 4);
  assert.equal(token.hasSub('Zombie'), true);
  assert.deepEqual([...token.cur.colors], ['B']);

  const teval = permanent(game, sultai, 'Teval, the Balanced Scale');
  const judgment = permanent(game, sultai, "Teval's Judgment");
  const first = inZone(sultai, 'Forest', 'graveyard');
  const second = inZone(sultai, 'Swamp', 'graveyard');
  await game.moveGraveyardBatch([first, second], 'hand');
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.isToken && card.name === 'Zombie Druid Token').length, 1);
  assert.equal(sultai.hand.length >= 3, true, 'Judgment draw mode resolves once for the batch');
  assert.equal(teval.zone, 'battlefield');
  assert.equal(judgment.zone, 'battlefield');
});

test('Kotis pays three other graveyard cards and casts one real creature spell only once during the turn', async () => {
  const { game, players: [sultai] } = rulesGame([(g,q) =>
    q.aiHint?.kind === 'optTrigger' && q.aiHint.src.name === 'Noxious Gearhulk' ? 'no' : defaultDecision(g,q)]);
  const kotis = permanent(game, sultai, 'Kotis, Sibsig Champion');
  const creature = inZone(sultai, 'Noxious Gearhulk', 'graveyard');
  const fodder = [inZone(sultai, 'Forest', 'graveyard'), inZone(sultai, 'Swamp', 'graveyard'), inZone(sultai, 'Life from the Loam', 'graveyard')];
  for (let i = 0; i < 6; i++) permanent(game, sultai, i % 2 ? 'Forest' : 'Swamp');
  game.recalc();

  const cast = game.castableList(sultai).find(entry => entry.card === creature && entry.from === 'graveyard' && entry.alt?.kotis);
  assert.ok(cast);
  assert.equal(await game.castSpell(sultai, creature, { from: cast.from, alt: cast.alt }), true);
  assert.deepEqual(fodder.map(card => card.zone), ['exile', 'exile', 'exile']);
  await resolveAll(game);
  assert.equal(creature.zone, 'battlefield');
  assert.equal(creature.castMeta.from, 'graveyard');
  assert.equal(kotis.counters['+1/+1'], 2);
  assert.equal(game.castableList(sultai).some(entry => entry.from === 'graveyard' && entry.alt?.kotis), false);
});

test('Sultai Arisen completes deterministic full games in both seats without AI fallback', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Sultai Arisen', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 260823 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Sultai Arisen', 'Turtle Power', 'Elven Council'], seed: 260824 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Sultai Arisen'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});

test('Sultai pays Channel X, filtered discard, stack-based mill mana, exile-X, and distinct Jarad land costs exactly', async () => {
  let preferredTarget = null;
  const { game, players: [sultai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseTargets' && preferredTarget && query.candidates.includes(preferredTarget)) {
        return query.max > 1
          ? [preferredTarget, ...query.candidates.filter(card => card !== preferredTarget)].slice(0, query.min)
          : [preferredTarget];
      }
      return defaultDecision(g, query);
    },
  ]);

  const shigeki = inZone(sultai, 'Shigeki, Jukai Visionary', 'hand');
  const channelOne = inZone(sultai, 'Forest', 'graveyard');
  const channelTwo = inZone(sultai, 'Swamp', 'graveyard');
  const legendary = inZone(sultai, 'Teval, the Balanced Scale', 'graveyard');
  sultai.pool.G = 2;
  sultai.pool.C = 2;
  const channel = game.activatableList(sultai).find(entry => entry.card === shigeki && entry.handAbility);
  assert.ok(channel);
  assert.equal(await game.activateAbility(sultai, channel), true);
  assert.equal(shigeki.zone, 'graveyard', 'discarding Shigeki is part of the Channel cost');
  assert.equal(game.stack.at(-1).ctx.x, 2);
  assert.deepEqual(new Set(game.stack.at(-1).targets[0]), new Set([channelOne, channelTwo]));
  await resolveAll(game);
  assert.equal(channelOne.zone, 'hand');
  assert.equal(channelTwo.zone, 'hand');
  assert.equal(legendary.zone, 'graveyard', 'Channel cannot target a legendary card');

  const floral = permanent(game, sultai, 'Floral Evoker');
  const discardedCreature = inZone(sultai, 'Skull Prophet', 'hand');
  const protectedNoncreature = inZone(sultai, 'Life from the Loam', 'hand');
  const returnedLand = inZone(sultai, 'Forest', 'graveyard');
  preferredTarget = returnedLand;
  sultai.pool.G = 1;
  const floralAction = game.activatableList(sultai).find(entry => entry.card === floral && entry.ability);
  assert.ok(floralAction);
  assert.equal(await game.activateAbility(sultai, floralAction), true);
  assert.equal(discardedCreature.zone, 'graveyard');
  assert.equal(protectedNoncreature.zone, 'hand', 'the filtered discard cost cannot take a noncreature');
  await resolveAll(game);
  assert.equal(returnedLand.zone, 'battlefield');
  assert.equal(returnedLand.tapped, true);

  const millikin = permanent(game, sultai, 'Millikin');
  const milled = inZone(sultai, 'Island', 'library');
  const beforeColorless = sultai.pool.C;
  const manaAction = game.activatableList(sultai).find(entry => entry.card === millikin && entry.ability);
  assert.ok(manaAction);
  assert.equal(await game.activateAbility(sultai, manaAction), true);
  assert.equal(milled.zone, 'graveyard');
  assert.equal(sultai.pool.C, beforeColorless, 'milling is a cost but mana waits for resolution');
  await resolveAll(game);
  assert.equal(sultai.pool.C, beforeColorless + 1);

  const fiend = permanent(game, sultai, 'Necropolis Fiend');
  const victim = permanent(game, opponent, 'Hedron Crab');
  const exileCards = [
    inZone(sultai, 'Grapple with the Past', 'graveyard'),
    inZone(sultai, 'Grisly Salvage', 'graveyard'),
    inZone(sultai, 'Victimize', 'graveyard'),
  ];
  preferredTarget = victim;
  const fiendAction = game.activatableList(sultai).find(entry => entry.card === fiend && entry.ability);
  assert.ok(fiendAction);
  assert.equal(await game.activateAbility(sultai, fiendAction), true);
  assert.equal(game.stack.at(-1).ctx.x >= 3, true);
  assert.equal(exileCards.every(card => card.zone === 'exile'), true);
  await resolveAll(game);
  assert.equal(victim.zone, 'graveyard', 'the chosen X reduction is applied on resolution');

  const customPermanent = definition => {
    const card = new MTG.CardInst(definition, sultai);
    card.ctrl = sultai;
    card.zone = 'battlefield';
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  await game.move(returnedLand, 'hand');
  const jarad = inZone(sultai, 'Jarad, Golgari Lich Lord', 'graveyard');
  const dual = customPermanent({
    name: 'Bayou Test', cost: null, types: ['Land'], subtypes: ['Swamp', 'Forest'], super: [], kws: [], oracle: '',
  });
  assert.equal(game.activatableList(sultai).some(entry => entry.card === jarad && entry.gyAbility), false,
    'one dual land cannot pay two distinct sacrifice components');
  const secondForest = customPermanent({
    name: 'Forest Test', cost: null, types: ['Land'], subtypes: ['Forest'], super: ['Basic'], kws: [], oracle: '',
  });
  const jaradAction = game.activatableList(sultai).find(entry => entry.card === jarad && entry.gyAbility);
  assert.ok(jaradAction);
  assert.equal(await game.activateAbility(sultai, jaradAction), true);
  assert.equal(dual.zone, 'graveyard');
  assert.equal(secondForest.zone, 'graveyard');
  await resolveAll(game);
  assert.equal(jarad.zone, 'hand');
});

test('Sultai history, graveyard-cast batches, and Wonder static continuously follow rules state', async () => {
  const { game, players: [sultai] } = rulesGame();
  permanent(game, sultai, 'Teval, the Balanced Scale');
  const wonder = inZone(sultai, 'Wonder', 'graveyard');
  const island = permanent(game, sultai, 'Island');
  const creature = permanent(game, sultai, 'Skull Prophet');
  assert.equal(creature.kw('flying'), true);
  await game.move(island, 'hand');
  assert.equal(creature.kw('flying'), false, 'Wonder immediately stops applying without an Island');
  await game.move(island, 'battlefield', { ctrl: sultai });
  assert.equal(creature.kw('flying'), true);
  await game.move(wonder, 'exile');
  assert.equal(creature.kw('flying'), false, 'Wonder immediately stops applying after leaving the graveyard');
  await resolveAll(game);

  const priorHand = inZone(sultai, 'Grapple with the Past', 'hand');
  const priorLibrary = inZone(sultai, 'Grisly Salvage', 'library');
  await game.discard(sultai, [priorHand]);
  await game.mill(sultai, 1);
  assert.equal(priorLibrary.zone, 'graveyard');
  assert.equal(sultai.turnState.cardsFromHandLibraryToGraveyard, 2);

  inZone(sultai, 'Forest', 'library');
  inZone(sultai, 'Swamp', 'library');
  const welcome = inZone(sultai, 'Welcome the Dead', 'hand');
  const zombiesBeforeWelcome = game.creatures(sultai).filter(card => card.isToken && card.name === 'Zombie Druid Token').length;
  sultai.pool.B = 1;
  sultai.pool.C = 8;
  assert.equal(await game.castSpell(sultai, welcome), true);
  await resolveAll(game);
  assert.equal(game.creatures(sultai).filter(card => card.isToken && card.name === 'Zombie Druid Token').length - zombiesBeforeWelcome, 3,
    'Welcome counts two earlier cards plus its own resolution discard');

  const spell = inZone(sultai, 'Life from the Loam', 'graveyard');
  const grantDef = {
    name: 'Test Flashback Grant', cost: '{0}', types: ['Creature'], subtypes: [], super: [], kws: [], oracle: '',
    power: '1', toughness: '1', grantsFlashback: true,
  };
  const grant = new MTG.CardInst(grantDef, sultai);
  grant.ctrl = sultai;
  grant.zone = 'battlefield';
  game.battlefield.push(grant);
  game.recalc();
  sultai.pool.G = 1;
  let batches = 0;
  const emit = game.emit.bind(game);
  game.emit = async (type, data) => {
    if (type === 'cardsLeftGraveyard' && data.cards.includes(spell) && data.to === 'stack') batches++;
    return emit(type, data);
  };
  const cast = game.castableList(sultai).find(entry => entry.card === spell && entry.from === 'graveyard');
  assert.ok(cast);
  const zombiesBeforeCast = game.creatures(sultai).filter(card => card.isToken && card.name === 'Zombie Druid Token').length;
  assert.equal(await game.castSpell(sultai, spell, { from: cast.from, alt: cast.alt }), true);
  assert.equal(batches, 1, 'a graveyard spell emits one cardsLeftGraveyard batch');
  await resolveAll(game);
  assert.equal(game.creatures(sultai).filter(card => card.isToken && card.name === 'Zombie Druid Token').length - zombiesBeforeCast, 1,
    'Teval triggers once for the single graveyard-leave event');
});
