import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const uiSource = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/modules/main.js', import.meta.url), 'utf8');
const loaderSource = readFileSync(new URL('../src/modules/loader.js', import.meta.url), 'utf8');
const clientCss = readFileSync(new URL('../src/client-v3.css', import.meta.url), 'utf8');

test('debug bundle records an exact reproduction checkpoint without hidden card identities', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({
    seed: 26082637,
    paced: false,
    difficulty: 'hard',
    humanDeck: 'Doom Prevails',
    aiRandomCommanders: true,
  });
  const you = game.addPlayer('You', MTG.DECKS['Doom Prevails'], null, false);
  const dragon = game.addPlayer('AI Dragon', MTG.DECKS['Counter Intelligence'], null, true);
  const wolf = game.addPlayer('AI Wolf', MTG.DECKS['Quick Draw'], null, true);
  you.deckName = 'Doom Prevails';
  dragon.deckName = 'Counter Intelligence';
  dragon.aiStyle = 'passive';
  dragon.requestedAIStyle = 'random';
  wolf.deckName = 'Quick Draw';
  wolf.aiStyle = 'aggressive';
  wolf.requestedAIStyle = 'aggressive';
  you.onlineSeat = 0;
  dragon.onlineSeat = 1;
  wolf.onlineSeat = 2;
  you.commanders = [{ name: 'Doctor Doom, King of Latveria' }];
  dragon.commanders = [{ name: 'Inspirit, Flagship Vessel' }];
  wolf.commanders = [{ name: 'Stella Lee, Wild Card' }];
  game.players = [wolf, you, dragon];
  game.turnPlayer = dragon;
  game.turnNo = 23;
  game.phase = 'main1';
  game.step = 'main';
  game.log.push({ t: 23, cls: 'ai', msg: 'AI Dragon casts a public spell.' });
  game.aiDecisionLog = [{
    turn: 23,
    playerName: 'AI Dragon',
    chosen: 'Cast Inspirit, Flagship Vessel',
    score: 12.5,
    scoreBreakdown: { synergy: 8 },
    analyzedNodes: 14,
    reachedDepth: 3,
    tieBreak: false,
    fallback: false,
  }];

  const state = {
    mode: 'game',
    players: [
      {
        name: 'You',
        handCount: 1,
        exileCount: 1,
        hand: [{ name: 'Secret Human Card', hiddenIdentity: 'Secret Human Card' }],
        exile: [{ name: 'Face-down card', hiddenIdentity: 'Secret Exile Card' }],
        battlefield: [{ name: 'Doctor Doom, King of Latveria' }],
      },
      { name: 'AI Dragon', handCount: 7, battlefield: [] },
    ],
    recentLog: [{ msg: 'duplicate short log' }],
    aiDecisions: [{ chosen: 'duplicate short trace' }],
  };
  const bundle = MTG.buildDebugBundle(game, state, '2026-08-26T20:00:00.000Z');
  const serialized = JSON.stringify(bundle);

  assert.equal(bundle.schema, 'mtg-commander-debug/v1');
  assert.equal(bundle.createdAt, '2026-08-26T20:00:00.000Z');
  assert.equal(bundle.reproduction.seed, 26082637);
  assert.equal(bundle.reproduction.difficulty, 'hard');
  assert.equal(bundle.reproduction.mode, 'solo');
  assert.equal(bundle.reproduction.humanDeck, 'Doom Prevails');
  assert.equal(bundle.reproduction.aiRandomCommanders, true);
  assert.deepEqual(
    JSON.parse(JSON.stringify(bundle.reproduction.bots.map(bot => [bot.deck, bot.style, bot.requestedStyle]))),
    [['Counter Intelligence', 'passive', 'random'], ['Quick Draw', 'aggressive', 'aggressive']],
  );
  assert.deepEqual(Array.from(bundle.reproduction.turnOrder), ['AI Wolf', 'You', 'AI Dragon']);
  assert.deepEqual(
    JSON.parse(JSON.stringify(bundle.checkpoint)),
    { turn: 23, activePlayer: 'AI Dragon', phase: 'main1', step: 'main' },
  );
  assert.equal(bundle.publicState.players[0].hand, undefined);
  assert.equal(bundle.publicState.players[0].exile, undefined);
  assert.equal(bundle.publicState.players[0].handCount, 1);
  assert.equal(bundle.publicState.players[0].battlefield[0].name, 'Doctor Doom, King of Latveria');
  assert.equal(bundle.publicState.recentLog, undefined);
  assert.equal(bundle.publicState.aiDecisions, undefined);
  assert.doesNotMatch(serialized, /Secret Human Card|Secret Exile Card|hiddenIdentity/);
  assert.equal(bundle.publicLog[0].message, 'AI Dragon casts a public spell.');
  assert.equal(bundle.aiTrace[0].chosen, 'Cast Inspirit, Flagship Vessel');
  assert.equal(MTG.debugBundleFilename(game), 'commander-debug-seed-26082637-turn-23.json');

  const replay = MTG.parseDebugBundle(bundle);
  assert.equal(replay.deck, 'Doom Prevails');
  assert.deepEqual(Array.from(replay.commanders), ['Doctor Doom, King of Latveria']);
  assert.equal(replay.ai, 2);
  assert.deepEqual(Array.from(replay.aiDecks), ['Counter Intelligence', 'Quick Draw']);
  assert.deepEqual(Array.from(replay.aiStyles), ['random', 'aggressive']);
  assert.equal(replay.aiRandomCommanders, true);
  assert.equal(replay.difficulty, 'hard');
  assert.equal(replay.seed, 26082637);
  assert.deepEqual(Array.from(replay.expectedTurnOrder), ['AI Wolf', 'You', 'AI Dragon']);
  assert.equal(replay.checkpoint.turn, 23);

  assert.throws(() => MTG.parseDebugBundle('{nope'), /not valid JSON/);
  assert.throws(() => MTG.parseDebugBundle({ schema: 'mtg-commander-debug/v2' }), /only mtg-commander-debug\/v1/);
  const unavailableDeck = JSON.parse(JSON.stringify(bundle));
  unavailableDeck.reproduction.humanDeck = 'Missing Deck';
  assert.throws(() => MTG.parseDebugBundle(unavailableDeck), /human deck is not available/);
  const online = JSON.parse(JSON.stringify(bundle));
  online.reproduction.mode = 'online';
  assert.throws(() => MTG.parseDebugBundle(online), /online-room snapshots cannot yet be replayed/);
  const renamedSeat = JSON.parse(JSON.stringify(bundle));
  renamedSeat.reproduction.bots[1].seat = 'AI Quartz';
  renamedSeat.reproduction.turnOrder[0] = 'AI Quartz';
  assert.throws(() => MTG.parseDebugBundle(renamedSeat), /AI seat names do not match/);
});

test('Support & diagnostics exposes a share-safe JSON debug download', () => {
  assert.match(uiSource, /action\('Support & diagnostics', 'Download share-safe debug snapshot'/);
  assert.match(uiSource, /MTG\.buildDebugBundle\(g, MTG\.renderGameState\(\)\)/);
  assert.match(uiSource, /new Blob\(\[JSON\.stringify\(bundle, null, 2\) \+ '\\n'\]/);
  assert.match(uiSource, /link\.download = MTG\.debugBundleFilename\(g\)/);
  assert.match(uiSource, /URL\.revokeObjectURL\(href\)/);
  assert.match(clientCss, /body:has\(#game \.quickmenuov\) > \.effectnoticestack/);
  assert.match(clientCss, /body:has\(#game \.quickmenuov\) > \.spellcopynoticestack/);
  assert.match(clientCss, /body:has\(#game \.quickmenuov\) > \.toastmsg/);
});

test('Main Page imports a validated v1 snapshot into an explicit replay review', () => {
  assert.match(mainSource, /class="debugimportbtn">↺ Import debug snapshot/);
  assert.match(mainSource, /MTG\.parseDebugBundle\(await file\.text\(\)\)/);
  assert.match(mainSource, /state\.seed = String\(replay\.seed\)/);
  assert.match(mainSource, /state\.aiDecks = Array\.from/);
  assert.match(mainSource, /state\.aiStyles = Array\.from/);
  assert.match(mainSource, /Start begins from turn 1 with these selections/);
  assert.match(loaderSource, /difficulty: opts\.difficulty \|\| 'normal', humanDeck: opts\.humanDeck/);
  assert.match(loaderSource, /q\.requestedAIStyle = st/);
  assert.match(clientCss, /#setup \.debugimportbtn/);
  assert.match(clientCss, /#setup \.debugreplaynotice/);
});

test('replay settings preserve the complete seeded setup including random AI choices', () => {
  const MTG = loadEngine();
  const humanController = () => ({ decide: async () => ({}) });
  const original = MTG.newGame({
    humanDeck: 'Doom Prevails',
    aiDecks: ['Counter Intelligence', 'Quick Draw', 'Deep Clue Sea'],
    aiStyles: ['random', 'random', 'aggressive'],
    humanCommanders: ['Doctor Doom, King of Latveria'],
    aiRandomCommanders: true,
    sumPartnerDamage: true,
    diplomacyEnabled: true,
    difficulty: 'hard',
    seed: 26082637,
    paced: false,
    maxTurns: 20,
    humanController,
  });
  const bundle = MTG.buildDebugBundle(original, { mode: 'game', players: [] }, '2026-08-27T08:00:00.000Z');
  const replay = MTG.parseDebugBundle(bundle);
  const repeated = MTG.newGame({
    humanDeck: replay.deck,
    aiDecks: replay.aiDecks,
    aiStyles: replay.aiStyles,
    humanCommanders: replay.commanders,
    aiRandomCommanders: replay.aiRandomCommanders,
    sumPartnerDamage: replay.sumPartnerDamage,
    diplomacyEnabled: replay.diplomacyEnabled,
    difficulty: replay.difficulty,
    seed: replay.seed,
    paced: false,
    maxTurns: 20,
    humanController,
  });
  const summarize = game => JSON.parse(JSON.stringify({
    turnOrder: game.players.map(player => player.name),
    seats: game.players.slice().sort((a, b) => a.onlineSeat - b.onlineSeat).map(player => ({
      name: player.name,
      deck: player.deckName,
      style: player.aiStyle || null,
      requestedStyle: player.requestedAIStyle || null,
      commanders: player.commanders.map(card => card.name),
      library: player.library.map(card => card.name),
    })),
  }));

  assert.deepEqual(summarize(repeated), summarize(original));
  assert.equal(repeated.opts.difficulty, 'hard');
  assert.equal(repeated.diplomacy.enabled, true);
  assert.equal(repeated.houseRules.sumPartnerDamage, true);

  const zeroSeedGame = new MTG.Game({ seed: 0, paced: false, maxTurns: 1 });
  const zeroSeedRandom = MTG.mulberry32(0);
  assert.equal(zeroSeedGame.rnd(), zeroSeedRandom());
});
