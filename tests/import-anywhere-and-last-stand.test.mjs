import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Two features that both hinge on the same idea: a deck the player pasted in is
// a real deck. It can be handed to a bot, it can travel to a live room, and it
// survives a checkpoint. Plus the last stand — the only diplomacy that opens
// when a player is about to be eliminated.

const MTG = loadEngine();

function batchNames() {
  return MTG.ORACLE_BATCHES.flatMap(batch => batch.cards)
    .filter(entry => entry.semanticClass !== 'manual-deck-semantic')
    .map(entry => entry.raw.name);
}

function deckText(commander, extras, basics = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest']) {
  const remaining = 99 - extras.length;
  const counts = basics.map((name, index) => ({
    name, n: Math.floor(remaining / basics.length) + (index < remaining % basics.length ? 1 : 0),
  })).filter(entry => entry.n > 0);
  return ['Commander', `1 ${commander} *CMDR*`, '', 'Deck',
    ...extras.map(name => `1 ${name}`),
    ...counts.map(entry => `${entry.n} ${entry.name}`)].join('\n');
}

function importDeck(name) {
  const imported = MTG.importCommanderDeck(deckText('Ashling, the Limitless', batchNames().slice(0, 59)), { name });
  assert.ok(imported.ok, `fixture deck must import: ${(imported.errors || []).map(item => item.message).join(', ')}`);
  return MTG.createImportedDeckRecord(imported, { id: `deck-${name.toLowerCase().replace(/\W+/g, '-')}` });
}

async function withLibrary(records, run) {
  const library = MTG.getImportedDeckLibrary();
  const before = library.entries.map(entry => entry.record).filter(Boolean);
  try {
    MTG.hydrateImportedDeckLibrary(records, { source: 'guest' });
    return await run();
  } finally {
    MTG.hydrateImportedDeckLibrary(before, { source: library.source });
  }
}

// ---------------------------------------------------------------- bot matches

test('an imported deck can be handed to a bot seat, but never lands there at random', async () => {
  const record = importDeck('Bot Pilot Lab');
  await withLibrary([record], () => {
    assert.equal(MTG.DECKS['Bot Pilot Lab'].custom, true, 'the library registers the deck');
    const chosen = MTG.selectAIDecks('Abzan Armor', 3, ['Bot Pilot Lab', '', ''], () => 0.5);
    assert.equal(chosen[0], 'Bot Pilot Lab', 'an explicit selection reaches the AI seat');
    assert.equal(chosen.length, 3);
    assert.equal(new Set(chosen).size, 3, 'AI decks stay unique');

    for (let seed = 0; seed < 40; seed++) {
      const random = MTG.selectAIDecks('Abzan Armor', 3, [], MTG.mulberry32(seed));
      assert.equal(random.some(name => MTG.DECKS[name].custom), false,
        'a random pod never deals an imported deck by itself');
    }
  });
});

test('a bot actually plays the imported deck through a real game', { timeout: 120_000 }, async () => {
  const record = importDeck('Bot Pilot Match');
  await withLibrary([record], async () => {
    const game = MTG.newGame({
      humanDeck: 'Abzan Armor', aiDecks: ['Bot Pilot Match', 'Elven Council'],
      aiStyles: ['balanced', 'balanced'], difficulty: 'normal', seed: 4242, maxTurns: 12, paced: false,
    });
    await game.start();
    const pilot = game.players.find(player => player.deckName === 'Bot Pilot Match');
    assert.ok(pilot, 'the imported deck is seated');
    assert.equal(pilot.isAI, true);
    assert.ok(game.turnNo > 4, 'the match runs past the opening turns');
    const allowed = new Set([...record.cards.map(entry => entry.name), ...record.commanders]);
    const owned = [...pilot.library, ...pilot.hand, ...pilot.graveyard, ...pilot.exile, ...pilot.command,
      ...game.bf().filter(card => card.owner === pilot)];
    assert.equal(owned.length >= 90, true, `the bot holds its whole deck (${owned.length})`);
    const foreign = owned.filter(card => !allowed.has(card.name) && !card.token);
    assert.deepEqual(foreign.map(card => card.name).slice(0, 5), [],
      'every card the bot plays with comes from the imported list');
  });
});

test('a checkpoint carries the imported list, so Continue works on a browser that never saw it', { timeout: 120_000 }, async () => {
  const record = importDeck('Checkpoint Lab');
  const save = await withLibrary([record], async () => {
    const setup = {
      humanDeck: 'Abzan Armor', aiDecks: ['Checkpoint Lab', 'Elven Council'],
      aiStyles: ['balanced', 'balanced'], difficulty: 'normal', seed: 88, maxTurns: 10, paced: false,
    };
    const game = MTG.newGame(setup);
    await game.start();
    return MTG.buildAccountSave(game, {
      deck: 'Abzan Armor', commanders: [], ai: 2, aiDecks: setup.aiDecks, aiStyles: setup.aiStyles,
      difficulty: 'normal', manaMode: 'auto', prioMode: 'end', seed: '88', createdAt: new Date().toISOString(),
    }, [], 'match-import-checkpoint', null);
  });

  assert.equal(save.setup.importedDecks.length, 1, 'the checkpoint carries exactly the custom decks in play');
  assert.equal(save.setup.importedDecks[0].name, 'Checkpoint Lab');
  assert.ok(JSON.stringify(save).length < 400_000, 'and stays small enough to store');

  // The library is empty here: this is a different browser opening the save.
  assert.equal(MTG.DECKS['Checkpoint Lab'], undefined);
  const restored = MTG.validateAccountSave(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.setup.aiDecks.includes('Checkpoint Lab'), true);
  assert.ok(MTG.DECKS['Checkpoint Lab'], 'validating the save registers the carried list');
  delete MTG.DECKS['Checkpoint Lab'];
  delete MTG.DECK_META['Checkpoint Lab'];
});

test('a checkpoint whose imported list is gone says so instead of loading a broken match', async () => {
  const record = importDeck('Missing Lab');
  const save = await withLibrary([record], () => MTG.buildAccountSave(
    { turnNo: 4 },
    {
      deck: 'Missing Lab', commanders: [], ai: 1, aiDecks: ['Elven Council'], aiStyles: ['balanced'],
      difficulty: 'normal', manaMode: 'auto', prioMode: 'end', seed: '9', createdAt: new Date().toISOString(),
    }, [], 'match-missing', null));
  save.setup.importedDecks = [];
  assert.throws(() => MTG.validateAccountSave(save), /human deck is unavailable/);
});

// ----------------------------------------------------------------- live rooms

test('a live seat carries its imported list to the host and to nobody else', () => {
  const record = importDeck('Live Room Lab');
  let state = MTG.onlineGameLogic.setup(['host-id', 'guest-id'], { playerCount: 2 });
  state = MTG.onlineGameLogic.applyAction(state, {
    type: 'configure', deckId: 'Abzan Armor', commanderNames: ['Felothar the Steadfast'], ready: true,
  }, 'host-id');
  state = MTG.onlineGameLogic.applyAction(state, {
    type: 'configure', deckId: 'Live Room Lab', deckRecord: record,
    commanderNames: ['Ashling, the Limitless'], ready: true,
  }, 'guest-id');

  const guestSeat = state.seats[1];
  assert.equal(guestSeat.deckId, 'Live Room Lab');
  assert.equal(guestSeat.deckRecord.cards.length > 0, true, 'the room stores the list itself');

  const hostView = MTG.onlineGameLogic.viewFor(state, 'host-id');
  const guestView = MTG.onlineGameLogic.viewFor(state, 'guest-id');
  assert.ok(hostView.seats[1].deckRecord, 'the host receives the list it has to build');
  assert.ok(guestView.seats[1].deckRecord, 'a player always sees their own list');
  assert.equal(guestView.seats[0].deckRecord, null, 'and never another seat’s list');
  assert.equal(guestView.seats[1].deckImported, true, 'the table still sees that the seat is imported');

  // The host builds from what the room carried, not from the original object.
  const adopted = MTG.adoptImportedDeckRecord(hostView.seats[1].deckRecord);
  assert.equal(adopted.ok, true, adopted.error);
  assert.ok(MTG.DECKS['Live Room Lab'], 'and the deck exists on the host');
  delete MTG.DECKS['Live Room Lab'];
  delete MTG.DECK_META['Live Room Lab'];
});

test('a live room refuses a decklist that does not match the seat or does not parse', () => {
  const record = importDeck('Mismatch Lab');
  const state = MTG.onlineGameLogic.setup(['host-id', 'guest-id'], { playerCount: 2 });
  const wrongName = MTG.onlineGameLogic.validateAction(state, {
    type: 'configure', deckId: 'Abzan Armor', deckRecord: record, ready: true,
  }, 'guest-id');
  assert.equal(wrongName.ok, false);
  assert.match(wrongName.error, /does not match/i);

  const empty = MTG.onlineGameLogic.validateAction(state, {
    type: 'configure', deckId: 'Nothing', deckRecord: { name: 'Nothing', cards: [] }, ready: true,
  }, 'guest-id');
  assert.equal(empty.ok, false);
  assert.match(empty.error, /could not be read/i);

  const oversized = MTG.onlineGameLogic.validateAction(state, {
    type: 'configure', deckId: 'Huge',
    deckRecord: { name: 'Huge', cards: Array.from({ length: 100 }, () => ({ name: 'x'.repeat(150), n: 1 })) },
    ready: true,
  }, 'guest-id');
  assert.equal(oversized.ok, false, 'an oversized list never enters the room state');

  // …while a real list of the same length passes.
  const roomy = MTG.onlineGameLogic.validateAction(state, {
    type: 'configure', deckId: record.name, deckRecord: record, ready: true,
  }, 'guest-id');
  assert.equal(roomy.ok, true, roomy.error);
});

test('the host can build a guest’s imported deck from what the room carried', () => {
  const record = importDeck('Adopted Lab');
  assert.equal(MTG.DECKS['Adopted Lab'], undefined, 'the host has never seen this deck');
  const adopted = MTG.adoptImportedDeckRecord(record);
  assert.equal(adopted.ok, true, adopted.error);
  const game = new MTG.Game({ seed: 5, paced: false });
  const player = game.addPlayer('Guest', MTG.DECKS['Adopted Lab'], { decide: async () => null }, false);
  player.chosenCommanders = ['Ashling, the Limitless'];
  game.buildDeck(player, player.deck, MTG.DEFS);
  assert.equal(player.library.length + player.command.length, 100, 'the host builds the same 100 cards');
  delete MTG.DECKS['Adopted Lab'];
  delete MTG.DECK_META['Adopted Lab'];
});

// ------------------------------------------------------------------ last stand

function makeTable({ unlocked = true } = {}) {
  const game = new MTG.Game({ seed: 11, paced: false, maxTurns: 40 });
  const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const player = game.addPlayer(name, { name: `${name} deck` }, null, index > 0);
    player.isAI = index > 0;
    player.controller = player.isAI
      ? new MTG.AIController(player, { difficulty: 'normal', style: 'balanced' })
      : { decide: async () => null };
    player.turnsStarted = unlocked ? 3 : 0;
    return player;
  });
  game.turnPlayer = players[0];
  MTG.initDiplomacy(game, true);
  return { game, players };
}

function addCreature(game, owner, name = 'Inferno Titan') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  card.tapped = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('a last stand stays locked while the player is healthy', () => {
  const { game, players: [human, bot] } = makeTable();
  addCreature(game, bot);
  game.recalc();
  const gate = game.diplomacyLastStandStatus(human);
  assert.equal(gate.eligible, false);
  assert.match(gate.reason, /about to be eliminated/i);
  assert.equal(game.diplomacyLastStandOptions(human, bot).eligible, false);
});

test('each public death signal opens the last stand on its own', () => {
  const lowLife = makeTable();
  lowLife.players[0].life = 5;
  lowLife.game.recalc();
  assert.equal(lowLife.game.diplomacyLastStandStatus(lowLife.players[0]).eligible, true);

  const lethalBoard = makeTable();
  lethalBoard.players[0].life = 9;
  for (let index = 0; index < 3; index++) addCreature(lethalBoard.game, lethalBoard.players[1]);
  lethalBoard.game.recalc();
  const lethal = lethalBoard.game.diplomacyLastStandStatus(lethalBoard.players[0]);
  assert.equal(lethal.eligible, true);
  assert.ok(lethal.signals.some(signal => /push \d+ damage/.test(signal)), lethal.signals.join(' · '));

  const commanderDamage = makeTable();
  commanderDamage.players[0].commanderDamage[999] = 17;
  assert.equal(commanderDamage.game.diplomacyLastStandStatus(commanderDamage.players[0]).eligible, true);

  const poisoned = makeTable();
  poisoned.players[0].poison = 8;
  assert.equal(poisoned.game.diplomacyLastStandStatus(poisoned.players[0]).eligible, true);
});

test('the table leader can never beg, however low their life is', () => {
  const { game, players: [human, bot] } = makeTable();
  human.life = 4;
  bot.life = 40;
  game.players[2].life = 40;
  game.players[3].life = 40;
  for (let index = 0; index < 6; index++) addCreature(game, human);
  game.recalc();
  const runaway = game.diplomacyRunawayThreat();
  assert.ok(runaway && runaway.p === human, 'the fixture must make the dying player the public leader');
  assert.equal(game.diplomacyLastStandStatus(human).eligible, false);
  assert.match(game.diplomacyLastStandStatus(human).reason, /leading threat/i);
});

test('only the exclusive shapes are accepted, and normal offers stay untouched', () => {
  const { game, players: [human, bot] } = makeTable();
  human.life = 5;
  addCreature(game, human);
  addCreature(game, bot);
  game.recalc();
  const options = game.diplomacyLastStandOptions(human, bot);
  assert.equal(options.eligible, true);
  assert.equal(options.requests.length, 1);
  assert.equal(options.requests[0].type, 'amnesty');
  assert.ok(options.offers.some(option => option.type === 'vassal_pledge'));
  assert.ok(options.offers.some(option => option.type === 'tribute_permanent'));

  const wrongShape = game.proposeLastStandDiplomacy(human, bot, `no_attack:${human.idx}`, `no_attack:${bot.idx}`);
  assert.equal(wrongShape.status, 'rejected');
  assert.match(wrongShape.reason, /amnesty/i);

  const swapped = game.proposeLastStandDiplomacy(human, bot,
    options.offers[0].key, options.requests[0].key);
  assert.equal(swapped.status, 'rejected');
});

test('an accepted last stand binds both sides, and a vassal pledge lasts two full turns', () => {
  const { game, players: [human, bot] } = makeTable();
  human.life = 4;
  const attacker = addCreature(game, bot);
  addCreature(game, human);
  game.recalc();
  const options = game.diplomacyLastStandOptions(human, bot);
  const vassal = options.offers.find(option => option.type === 'vassal_pledge');
  const result = game.proposeLastStandDiplomacy(human, bot, options.requests[0].key, vassal.key);
  assert.equal(result.status, 'accepted', result.reason);

  assert.equal(game.diplomacyAttackBlocked(bot, human), true, 'amnesty stops the bot attacking');
  assert.equal(game.diplomacyAttackBlocked(human, bot), true, 'the vassal pledge stops the player attacking');
  assert.equal(game.diplomacyFilterTargets([human], { prompt: 'Destroy target' }, attacker, bot).length, 0,
    'amnesty also stops the bot targeting the player');

  bot.turnsStarted += 1;
  game.diplomacyEndTurn(bot);
  assert.equal(game.diplomacyAttackBlocked(bot, human), false, 'amnesty ends after the bot’s next turn');

  human.turnsStarted += 1;
  game.diplomacyEndTurn(human);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true, 'the pledge survives the first turn');
  human.turnsStarted += 1;
  game.diplomacyEndTurn(human);
  assert.equal(game.diplomacyAttackBlocked(human, bot), false, 'and ends after the second');
});

test('a promised tribute is really sacrificed at the promising player’s next end step', async () => {
  const { game, players: [human, bot] } = makeTable();
  // Low life opens the last stand; the bot has no kill on the board, so a real
  // permanent is enough to buy one turn of amnesty.
  human.life = 5;
  addCreature(game, bot, 'Stormcatch Mentor');
  const promised = addCreature(game, human, 'Inferno Titan');
  game.recalc();
  const options = game.diplomacyLastStandOptions(human, bot);
  const tribute = options.offers.find(option => option.type === 'tribute_permanent' && option.targetCardId === promised.iid);
  assert.ok(tribute, 'the biggest permanent is offerable as a tribute');
  const result = game.proposeLastStandDiplomacy(human, bot, options.requests[0].key, tribute.key);
  assert.equal(result.status, 'accepted', result.reason);
  const card = game.byIid(result.contract.clauses.find(clause => clause.type === 'tribute_permanent').targetCardId);

  await game.diplomacyEndStep(human);
  assert.equal(card.zone, 'battlefield', 'nothing is owed on the turn the promise is made');

  human.turnsStarted += 1;
  await game.diplomacyEndStep(human);
  assert.equal(card.zone, 'graveyard', 'the tribute is paid on the next end step');
  const clause = result.contract.clauses.find(item => item.type === 'tribute_permanent');
  assert.equal(clause.state, 'fulfilled');
  assert.match(game.log.map(entry => entry.msg).join('\n'), /pays the promised tribute/);
});

test('a crusade pledge forces the attack for two combats and then completes', () => {
  const { game, players: [human, bot, wolf, raven] } = makeTable();
  human.life = 6;
  wolf.life = 300;
  raven.life = 12;
  addCreature(game, human);
  addCreature(game, bot);
  game.recalc();
  const options = game.diplomacyLastStandOptions(human, bot);
  const crusade = options.offers.find(option => option.type === 'crusade_pledge');
  assert.ok(crusade, `a crusade needs a public leader: ${options.offers.map(option => option.type).join(', ')}`);
  const result = game.proposeLastStandDiplomacy(human, bot, options.requests[0].key, crusade.key);
  assert.equal(result.status, 'accepted', result.reason);

  assert.equal(game.diplomacyRequiredAttackTarget(human), wolf, 'the player must go at the leader');
  game.diplomacyAfterCombat(human);
  assert.equal(game.diplomacyRequiredAttackTarget(human), wolf, 'one combat is not enough');
  game.diplomacyAfterCombat(human);
  const clause = result.contract.clauses.find(item => item.type === 'crusade_pledge');
  assert.equal(clause.state, 'fulfilled');
  assert.equal(game.diplomacyRequiredAttackTarget(human), null);
});

test('a last stand does not spend the normal offers, but is rationed on its own', () => {
  const { game, players: [human, bot, wolf] } = makeTable();
  // Both bots can already kill the player, so neither has any reason to take a
  // small promise: the begging itself is what this test measures.
  human.life = 4;
  for (let index = 0; index < 2; index++) { addCreature(game, bot); addCreature(game, wolf); }
  addCreature(game, human, 'Stormcatch Mentor');
  game.recalc();

  let first = null;
  const cheapest = target => {
    const options = game.diplomacyLastStandOptions(human, target);
    assert.equal(options.eligible, true, options.reason);
    first = first || options;
    const offer = options.offers.find(option => option.type === 'tribute_permanent') || options.offers[0];
    return game.proposeLastStandDiplomacy(human, target, options.requests[0].key, offer.key);
  };

  const opening = cheapest(bot);
  assert.equal(opening.status, 'rejected', 'a bot holding lethal does not sell amnesty cheaply');
  assert.equal(game.diplomacyView(human).offersRemaining, 2, 'the two normal offers are untouched');
  assert.equal(game.diplomacyLastStandStatus(human).used, 1);

  const closed = game.diplomacyLastStandOptions(human, bot);
  assert.equal(closed.eligible, false, 'the same bot is not offered a second time');
  assert.match(closed.reason, /already begged/i);
  const repeat = game.proposeLastStandDiplomacy(human, bot, first.requests[0].key, first.offers[0].key);
  assert.equal(repeat.status, 'rejected');
  assert.match(repeat.reason, /already begged/i);

  cheapest(wolf);
  const exhausted = game.diplomacyLastStandStatus(human);
  assert.equal(exhausted.remaining, 0, 'two last stands per table round');
  assert.equal(exhausted.eligible, false);
  assert.match(exhausted.reason, /last stand at this table round/i);
});

test('a bot one turn from elimination begs before it bargains', async () => {
  const { game, players: [human, bot, wolf] } = makeTable();
  bot.life = 4;
  human.life = 500;
  for (let index = 0; index < 2; index++) addCreature(game, wolf);
  addCreature(game, bot);
  game.recalc();
  assert.equal(game.diplomacyLastStandStatus(bot).eligible, true, 'the fixture must have the bot dying');

  const result = await game.processDiplomacyCheckpoint(bot);
  assert.ok(result, 'the bot must act on its checkpoint');
  assert.ok(result.proposal && result.proposal.lastStand, 'and the action is a last stand');
  assert.equal(result.proposal.fromId, bot.idx);
  assert.match(game.log.map(entry => entry.msg).join('\n'), /makes a last stand/);
});

test('an unpaid tribute survives a real save', { timeout: 120_000 }, async () => {
  const setup = {
    humanDeck: 'Abzan Armor', aiDecks: ['Elven Council', 'Doom Prevails'],
    aiStyles: ['balanced', 'balanced'], difficulty: 'normal', seed: 77, maxTurns: 12,
    paced: false, diplomacyEnabled: true,
  };
  const game = MTG.newGame(setup);
  let snapshot = null;
  game.onTurnCheckpoint = () => {
    if (snapshot || game.turnNo < 6) return;
    const [me, bot] = game.players;
    me.life = 5;
    const promised = game.bf().find(card => card.ctrl === me && !card.is('Land'))
      || addCreature(game, me, 'Inferno Titan');
    game.recalc();
    const options = game.diplomacyLastStandOptions(me, bot);
    if (!options.eligible) return;
    const tribute = options.offers.find(option => option.type === 'tribute_permanent'
      && option.targetCardId === promised.iid);
    if (!tribute) return;
    // The verdict does not matter here; the contract is written by hand so the
    // save has something owed to carry.
    game.proposeLastStandDiplomacy(me, bot, options.requests[0].key, tribute.key);
    if (!game.diplomacy.contracts.length) {
      game.diplomacy.contracts.push({
        id: 99, fromId: me.idx, toId: bot.idx, kind: 'bilateral', status: 'active',
        participantIds: [me.idx, bot.idx], createdTurn: game.turnNo,
        clauses: [{
          type: 'tribute_permanent', actorId: me.idx, beneficiaryId: bot.idx, state: 'active',
          targetCardId: promised.iid, targetName: promised.name, targetControllerId: me.idx,
          turnsSpan: 1, createdActorTurns: me.turnsStarted,
        }],
      });
    }
    snapshot = MTG.captureGameState(game);
  };
  await game.start();
  assert.ok(snapshot, 'the fixture must reach a saveable turn boundary with an agreement in place');
  assert.ok(snapshot.diplomacy, 'the save writes the diplomacy state down');

  const resumed = MTG.newGame(setup);
  MTG.restoreGameState(resumed, JSON.parse(JSON.stringify(snapshot)));
  const owed = resumed.diplomacy.contracts.flatMap(contract => contract.clauses)
    .find(clause => clause.type === 'tribute_permanent' && clause.state === 'active');
  assert.ok(owed, 'the restored game still knows a tribute is owed');
  assert.ok(resumed.byIid(owed.targetCardId), 'and the promised permanent is the same card');
});

test('a bot begging the human arrives marked as a last stand', async () => {
  const { game, players: [human, bot] } = makeTable();
  // A bot begs whoever is doing the most to kill it, so the player holds the
  // only board that threatens this bot.
  bot.life = 4;
  for (let index = 0; index < 2; index++) addCreature(game, human);
  addCreature(game, bot);
  game.recalc();
  const result = await game.processDiplomacyCheckpoint(bot);
  assert.ok(result && result.proposal && result.proposal.lastStand, 'the bot makes a last stand');
  assert.equal(result.status, 'pending-human', 'and sends it to the player');
  const incoming = game.diplomacyView(human).incoming.find(item => item.id === result.proposal.id);
  assert.ok(incoming, 'the offer reaches the player');
  assert.equal(incoming.lastStand, true, 'and is marked as a last stand');
  assert.ok(incoming.signals.length, 'with the public reason the bot is dying');

  const accepted = game.respondToDiplomacyProposal(result.proposal.id, true, human);
  assert.equal(accepted.status, 'accepted', accepted.reason);
  assert.equal(game.diplomacyAttackBlocked(human, bot), true, 'accepting really binds the player');
});

test('the diplomacy view tells the player the last stand is open and why', () => {
  const { game, players: [human, bot] } = makeTable();
  human.life = 5;
  addCreature(game, bot);
  addCreature(game, human);
  game.recalc();
  const view = game.diplomacyView(human);
  assert.equal(view.lastStand.eligible, true);
  assert.ok(view.lastStand.signals.length, 'the reason is public and readable');
  assert.ok(view.lastStand.opponents.length, 'and names who can be begged');
  assert.equal(view.lastStand.remaining, 2);

  const healthy = makeTable();
  assert.equal(healthy.game.diplomacyView(healthy.players[0]).lastStand.eligible, false);
});
