import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function gameFixture(seed = 71) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 40 });
  const decks = Object.values(MTG.DECKS).slice(0, 4);
  const players = ['Bot A', 'Human', 'Bot B', 'Bot C'].map((name, index) => {
    const player = game.addPlayer(name, decks[index], null, index !== 1);
    player.deckName = decks[index].name;
    player.colorIdentity = (MTG.DECK_META[player.deckName]?.colors || []).slice();
    return player;
  });
  game.turnPlayer = players[0];
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function syntheticDef(name, { types = ['Creature'], subtypes = [], cost = '{2}', oracle = '', power = 2, toughness = 2, kws = [] } = {}) {
  return {
    name, super: [], types, subtypes, cost, oracle, power: String(power), toughness: String(toughness),
    kws, abilities: [], mana: null,
  };
}

function addCard(game, owner, def, zone = 'battlefield') {
  const card = new MTG.CardInst(def, owner);
  card.ctrl = owner;
  card.zone = zone;
  card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else owner[zone].push(card);
  return card;
}

function addPlains(game, owner, zone = 'battlefield') {
  return addCard(game, owner, MTG.DEFS.Plains, zone);
}

function actionWindow(game, player) {
  return {
    type: 'main', player,
    casts: game.castableList(player),
    acts: game.activatableList(player),
    lands: game.playableLands(player),
    phase: game.phase,
  };
}

test('svih 20 aktivnih precona ima popunjen stvarni AI profil', () => {
  const profiles = MTG.DECK_AI_PROFILES;
  assert.equal(Object.keys(profiles).length, 20);
  assert.deepEqual(Object.keys(profiles).sort(), Object.keys(MTG.DECKS).sort());
  for (const [deckId, profile] of Object.entries(profiles)) {
    assert.equal(profile.deckId, deckId);
    assert.ok(profile.archetype && !/placeholder/i.test(profile.archetype));
    assert.ok(['short', 'medium', 'long'].includes(profile.preferredGameLength));
    assert.ok(profile.primarySynergies.length > 0);
    assert.ok(profile.importantEngines.length > 0, `${deckId}: nema engine komada`);
    assert.ok(profile.finishers.length > 0, `${deckId}: nema finishere`);
    assert.ok(profile.protectedPieces.includes(MTG.DECKS[deckId].commander));
    assert.equal(Object.keys(profile.weights).length, 10);
  }
});

test('BotPlayerView skriva protivničku ruku, biblioteku i face-down identitet', () => {
  const { game, players: [bot, human] } = gameFixture();
  addCard(game, bot, syntheticDef('Moja karta'), 'hand');
  addCard(game, human, syntheticDef('Tajni bomb spell'), 'hand');
  addCard(game, human, syntheticDef('Tajni vrh'), 'library');
  const hidden = addCard(game, human, syntheticDef('Skriveni permanent'));
  hidden.faceDown = true;
  game.recalc();

  const view = MTG.createBotPlayerView(game, bot.idx);
  const me = view.players.find(player => player.id === bot.idx);
  const opponent = view.players.find(player => player.id === human.idx);
  assert.equal(me.hand[0].name, 'Moja karta');
  assert.equal('hand' in opponent, false);
  assert.equal('library' in opponent, false);
  assert.equal(opponent.handCount, 1);
  assert.equal(opponent.libraryCount, 1);
  assert.equal(view.battlefield.find(card => card.id === hidden.iid).name, 'Face-down card');
});

test('promjena nepoznate protivničke karte ne mijenja odluku', async () => {
  const { game, players: [bot, human] } = gameFixture();
  const land = addPlains(game, bot, 'hand');
  const secret = addCard(game, human, syntheticDef('Slaba tajna', { cost: '{1}' }), 'hand');
  game.recalc();
  const q = { type: 'main', player: bot, casts: [], acts: [], lands: [land], phase: game.phase };
  const first = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 811, actionWindow: q });
  secret.def = syntheticDef('Moćna tajna', { cost: '{9}', oracle: 'You win the game.', power: 12, toughness: 12 });
  const second = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 811, actionWindow: q });
  assert.equal(MTG.botActionKey(first.action), MTG.botActionKey(second.action));
  assert.equal(first.score, second.score);
});

test('revealovana karta postaje poznata, a redoslijed protivničke biblioteke ostaje nevidljiv', () => {
  const { game, players: [bot, human] } = gameFixture();
  const revealed = addCard(game, human, syntheticDef('Revealovana prijetnja'));
  revealed.faceDown = true;
  revealed.meta.revealedTo = [bot.idx];
  const topA = addCard(game, human, syntheticDef('Top A'), 'library');
  const topB = addCard(game, human, syntheticDef('Top B'), 'library');
  game.recalc();
  const before = MTG.createBotPlayerView(game, bot.idx);
  human.library.reverse();
  const after = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(before.battlefield.find(card => card.id === revealed.iid).name, 'Revealovana prijetnja');
  assert.equal(MTG.hashBotPlayerView(before), MTG.hashBotPlayerView(after));
  assert.ok(topA && topB);
});

test('legal generator i odluka koriste samo rules-engine legalne akcije', async () => {
  const { game, players: [bot] } = gameFixture();
  addPlains(game, bot);
  const land = addPlains(game, bot, 'hand');
  const spell = addCard(game, bot, syntheticDef('Legalni spell', { types: ['Sorcery'], cost: '{1}', oracle: 'Draw a card.' }), 'hand');
  game.recalc();
  const q = actionWindow(game, bot);
  assert.ok(q.casts.some(entry => entry.card === spell));
  const view = MTG.createBotPlayerView(game, bot.idx, q);
  const legal = MTG.generateLegalActions(view);
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 3, actionWindow: q });
  assert.ok(legal.some(action => MTG.botActionKey(action) === MTG.botActionKey(decision.action)));
  assert.ok(q.lands.includes(land));
});

test('engine 2/2 je bolja removal meta od običnog 9/9', async () => {
  const { game, players: [bot, human, enemy] } = gameFixture();
  const source = addCard(game, bot, syntheticDef('Removal', { types: ['Instant'], oracle: 'Destroy target creature.' }), 'hand');
  const engine = addCard(game, human, MTG.DEFS['Blood Artist'] || syntheticDef('Blood Artist', { oracle: 'Whenever another creature dies, target player loses 1 life.' }));
  const vanilla = addCard(game, enemy, syntheticDef('Vanilla 9/9', { cost: '{9}', power: 9, toughness: 9 }));
  game.recalc();
  const q = { type: 'chooseTargets', player: bot, src: source, candidates: [vanilla, engine], min: 1, max: 1, aiHint: { goal: 'removal' } };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 12, actionWindow: q });
  const picked = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(picked.length, 1);
  assert.equal(picked[0], engine);
});

test('bot čuva removal kada nema značajne mete', async () => {
  const { game, players: [bot, human] } = gameFixture();
  const removal = addCard(game, bot, syntheticDef('Skupi removal', { types: ['Instant'], cost: '{3}', oracle: 'Destroy target creature.' }), 'hand');
  addCard(game, human, syntheticDef('Bezopasni 1/1', { cost: '{1}', power: 1, toughness: 1 }));
  for (let i = 0; i < 3; i++) addPlains(game, bot);
  game.recalc();
  const q = { type: 'main', player: bot, casts: [{ card: removal, from: 'hand', alt: null }], acts: [], lands: [], phase: game.phase };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 14, actionWindow: q });
  assert.equal(decision.action.kind, 'done');
});

function wipeDecision(botLeading) {
  const { game, players: [bot, enemy] } = gameFixture(botLeading ? 91 : 92);
  const wipe = addCard(game, bot, syntheticDef('Test Wipe', { types: ['Sorcery'], cost: '{4}', oracle: 'Destroy all creatures.' }), 'hand');
  for (let i = 0; i < 4; i++) addPlains(game, bot);
  const strongOwner = botLeading ? bot : enemy;
  const weakOwner = botLeading ? enemy : bot;
  for (let i = 0; i < 4; i++) addCard(game, strongOwner, syntheticDef(`Veliki ${i}`, { cost: '{6}', power: 6, toughness: 6 }));
  addCard(game, weakOwner, syntheticDef('Mali', { cost: '{1}', power: 1, toughness: 1 }));
  game.recalc();
  return { game, bot, q: { type: 'main', player: bot, casts: [{ card: wipe, from: 'hand', alt: null }], acts: [], lands: [], phase: game.phase } };
}

test('board wipe se igra kad protivnici gube mnogo više, a čuva kad bot vodi', async () => {
  const behind = wipeDecision(false);
  const behindDecision = await MTG.chooseBotAction({ gameState: behind.game, botPlayerId: behind.bot.idx, seed: 19, actionWindow: behind.q });
  assert.equal(behindDecision.action.kind, 'cast');
  const ahead = wipeDecision(true);
  const aheadDecision = await MTG.chooseBotAction({ gameState: ahead.game, botPlayerId: ahead.bot.idx, seed: 19, actionWindow: ahead.q });
  assert.equal(aheadDecision.action.kind, 'done');
});

test('human/bot oznaka ne mijenja threat score niti javni state hash', () => {
  const { game, players: [bot, human] } = gameFixture();
  addCard(game, human, syntheticDef('Javni engine', { oracle: 'Whenever you draw a card, create a token.' }));
  game.recalc();
  const first = MTG.createBotPlayerView(game, bot.idx);
  const threat = MTG.assessPlayerThreat(first, bot.idx, human.idx).totalScore;
  human.isAI = true;
  const second = MTG.createBotPlayerView(game, bot.idx);
  assert.equal(MTG.assessPlayerThreat(second, bot.idx, human.idx).totalScore, threat);
  assert.equal(MTG.hashBotPlayerView(first), MTG.hashBotPlayerView(second));
});

test('combat planner napada najveću prijetnju, ne automatski najmanji life', async () => {
  const { game, players: [bot, lowLife, threat, unused] } = gameFixture();
  lowLife.life = 14;
  threat.life = 35;
  unused.lost = true;
  const attacker = addCard(game, bot, syntheticDef('Napadač', { power: 4, toughness: 4 }));
  for (let i = 0; i < 4; i++) addCard(game, threat, syntheticDef(`Threat engine ${i}`, { types: ['Enchantment'], cost: '{5}', oracle: 'Whenever you cast a spell, draw a card.' }));
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [attacker], opponents: [lowLife, threat], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 22, actionWindow: q });
  const attacks = MTG.unwrapBotDecisionAction(decision.action);
  assert.equal(attacks[0].target, threat);
});

test('combat planner koristi commander-damage lethal', async () => {
  const { game, players: [bot, target, other] } = gameFixture();
  const commander = addCard(game, bot, syntheticDef('Test Commander', { cost: '{5}', power: 5, toughness: 5 }));
  commander.commander = true;
  target.commanderDamage[commander.iid] = 17;
  game.recalc();
  const q = { type: 'attackers', player: bot, eligible: [commander], opponents: [target, other], forced: [] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 23, actionWindow: q });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0].target, target);
});

test('block planner bira razmjenu koja ubija relevantnog napadača', async () => {
  const { game, players: [bot, enemy] } = gameFixture();
  const blocker = addCard(game, bot, syntheticDef('Bloker', { power: 3, toughness: 4 }));
  const dangerous = addCard(game, enemy, syntheticDef('Opasni', { power: 5, toughness: 3 }));
  const harmless = addCard(game, enemy, syntheticDef('Bezopasni', { power: 1, toughness: 6 }));
  dangerous.attacking = bot;
  harmless.attacking = bot;
  game.phase = 'combat'; game.step = 'blockers'; game.recalc();
  const q = { type: 'blockers', player: bot, attackers: [dangerous, harmless], potential: [blocker] };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 31, actionWindow: q });
  assert.equal(MTG.unwrapBotDecisionAction(decision.action)[0].attacker, dangerous);
});

test('isti state i seed daju istu odluku; seed utiče samo na izjednačene akcije', async () => {
  const { game, players: [bot] } = gameFixture();
  const landA = addPlains(game, bot, 'hand');
  const landB = addPlains(game, bot, 'hand');
  game.recalc();
  const q = { type: 'main', player: bot, casts: [], acts: [], lands: [landA, landB], phase: game.phase };
  const first = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'easy', seed: 44, actionWindow: q });
  const repeat = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'easy', seed: 44, actionWindow: q });
  assert.equal(MTG.botActionKey(first.action), MTG.botActionKey(repeat.action));
  const results = [];
  for (let seed = 1; seed <= 16; seed++) results.push(await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'easy', seed, actionWindow: q }));
  assert.ok(results.every(result => result.action.kind === 'land'));
  assert.ok(Math.max(...results.map(result => result.score)) - Math.min(...results.map(result => result.score)) <= MTG.AI_SEARCH_CONFIG.easy.tieTolerance);
});

test('simulateAction koristi rules engine i ne mutira live state', async () => {
  const { game, players: [bot] } = gameFixture();
  const land = addPlains(game, bot, 'hand');
  game.recalc();
  const before = JSON.stringify({ hand: bot.hand.map(card => card.iid), battlefield: game.battlefield.map(card => card.iid), landsPlayed: bot.landsPlayed });
  const result = await MTG.simulateAction(game, { kind: 'land', card: land }, { playerId: bot.idx, seed: 55 });
  const after = JSON.stringify({ hand: bot.hand.map(card => card.iid), battlefield: game.battlefield.map(card => card.iid), landsPlayed: bot.landsPlayed });
  assert.equal(after, before);
  assert.equal(result.applied, true);
  assert.equal(result.usedRulesEngine, true);
  const clonedBot = result.state.players.find(player => player.idx === bot.idx);
  assert.equal(clonedBot.hand.some(card => card.iid === land.iid), false);
  assert.equal(result.state.battlefield.some(card => card.iid === land.iid), true);
});

test('beam search razmatra nastavak poslije landa', async () => {
  const { game, players: [bot] } = gameFixture();
  addPlains(game, bot);
  const land = addPlains(game, bot, 'hand');
  addCard(game, bot, syntheticDef('Poslije landa', { types: ['Creature'], cost: '{2}', oracle: 'When this enters, draw a card.', power: 2, toughness: 2 }), 'hand');
  game.recalc();
  const q = actionWindow(game, bot);
  assert.equal(q.casts.length, 0);
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, difficulty: 'normal', seed: 61, actionWindow: q, forceSearch: true });
  assert.equal(decision.action.kind, 'land');
  assert.ok(decision.log.reachedDepth >= 2);
  assert.ok(decision.log.analyzedNodes >= 2);
  assert.equal(decision.action.card, land);
});

test('decision log sadrži alternative, prijetnje, seed, dubinu i fallback status', async () => {
  const { game, players: [bot] } = gameFixture();
  const land = addPlains(game, bot, 'hand');
  game.recalc();
  const q = { type: 'main', player: bot, casts: [], acts: [], lands: [land], phase: game.phase };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 77, actionWindow: q });
  assert.ok(decision.reason);
  assert.ok(decision.consideredActions.length >= 1);
  assert.equal(decision.log.seed, 77);
  assert.equal(typeof decision.log.analyzedNodes, 'number');
  assert.equal(typeof decision.log.reachedDepth, 'number');
  assert.equal(decision.log.fallback, false);
  assert.equal(game.aiDecisionLog.at(-1).chosen, decision.log.chosen);
  assert.equal(Object.keys(decision.log.threatScores).sort().join(','), [...game.players].map(player => String(player.idx)).sort().join(','));
});

test('Elven Council protivnici taktički umanjuju korist vlasnika vote efekta', async () => {
  const { game, players: [bot, human] } = gameFixture(181);
  human.deck = MTG.DECKS['Elven Council'];
  human.deckName = 'Elven Council';
  const galadriel = addCard(game, human, MTG.DEFS['Galadriel, Elven-Queen']);
  addCard(game, human, MTG.DEFS['Elvish Visionary']);
  game.recalc();

  const galadrielVote = {
    type: 'chooseOption', prompt: 'Galadriel: glasaj',
    options: [
      { key: 'dominion', label: 'Dominion (Ring + counter)' },
      { key: 'guidance', label: 'Guidance (karta)' },
    ],
    aiHint: { kind: 'vote', src: galadriel, voter: bot, forWhom: human, secret: false, revealedVotes: [] },
  };
  const galadrielDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 182, actionWindow: galadrielVote });
  assert.equal(MTG.unwrapBotDecisionAction(galadrielDecision.action), 'guidance');

  const plea = addCard(game, human, MTG.DEFS['Plea for Power'], 'graveyard');
  const pleaVote = {
    type: 'chooseOption', prompt: 'Plea for Power: glasaj',
    options: [
      { key: 'time', label: 'Time (ekstra potez)' },
      { key: 'knowledge', label: 'Knowledge (3 karte)' },
    ],
    aiHint: { kind: 'vote', src: plea, voter: bot, forWhom: human, secret: false, revealedVotes: [] },
  };
  const pleaDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 183, actionWindow: pleaVote });
  assert.equal(MTG.unwrapBotDecisionAction(pleaDecision.action), 'knowledge');
});

test('Elrond glas zavisi od stvarne cijene Fellowshipa', async () => {
  const { game, players: [bot, human] } = gameFixture(184);
  const elrond = addCard(game, human, MTG.DEFS['Elrond of the White Council']);
  const vote = () => ({
    type: 'chooseOption', prompt: 'Elrond: tajno glasaj',
    options: [
      { key: 'fellowship', label: 'Fellowship (daš stvorenje)' },
      { key: 'aid', label: 'Aid (counteri Elrondu)' },
    ],
    aiHint: { kind: 'vote', src: elrond, voter: bot, forWhom: human, secret: true },
  });
  game.recalc();
  const noCreature = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 185, actionWindow: vote() });
  assert.equal(MTG.unwrapBotDecisionAction(noCreature.action), 'fellowship');

  addCard(game, bot, MTG.DEFS['Blood Artist']);
  game.recalc();
  const withCreature = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 186, actionWindow: vote() });
  assert.equal(MTG.unwrapBotDecisionAction(withCreature.action), 'aid');
});

test('Cirdan, Sail i Travel glasovi koriste vlastite i javne resurse', async () => {
  const { game, players: [bot, human, other] } = gameFixture(189);
  const cirdan = addCard(game, human, MTG.DEFS['Círdan the Shipwright']);
  game.recalc();
  const cirdanVote = {
    type: 'chooseOption', prompt: 'Cirdan: tajno glasaj',
    options: game.players.map(player => ({ key: String(player.idx), label: player.name })),
    aiHint: { kind: 'vote', src: cirdan, voter: bot, forWhom: human, secret: true },
  };
  const cirdanDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 190, actionWindow: cirdanVote });
  assert.equal(MTG.unwrapBotDecisionAction(cirdanDecision.action), String(bot.idx), 'bez bombe bot osigurava sebi kartu');

  const sail = addCard(game, human, MTG.DEFS['Sail into the West'], 'graveyard');
  const sailVote = () => ({
    type: 'chooseOption', prompt: 'Sail into the West: glasaj',
    options: [{ key: 'return', label: 'Return' }, { key: 'embark', label: 'Embark' }],
    aiHint: { kind: 'vote', src: sail, voter: bot, forWhom: human, secret: false, revealedVotes: [] },
  });
  const emptyBot = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 191, actionWindow: sailVote() });
  assert.equal(MTG.unwrapBotDecisionAction(emptyBot.action), 'embark', 'prazna ruka želi novu ruku');
  addCard(game, bot, MTG.DEFS['Blood Artist'], 'graveyard');
  addCard(game, bot, MTG.DEFS['Darksteel Reactor'], 'graveyard');
  for (let i = 0; i < 7; i++) addCard(game, bot, syntheticDef(`Solidna ruka ${i}`, { cost: '{4}', oracle: 'Draw a card.' }), 'hand');
  const graveBot = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 192, actionWindow: sailVote() });
  assert.equal(MTG.unwrapBotDecisionAction(graveBot.action), 'return', 'puna ruka i jako groblje žele povrat');

  const travel = addCard(game, human, MTG.DEFS['Travel Through Caradhras'], 'graveyard');
  const travelVote = () => ({
    type: 'chooseOption', prompt: 'Travel Through Caradhras: glasaj',
    options: [{ key: 'pass', label: 'Redhorn Pass' }, { key: 'mines', label: 'Mines of Moria' }],
    aiHint: { kind: 'vote', src: travel, voter: bot, forWhom: human, secret: false, revealedVotes: [] },
  });
  const noHumanGrave = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 193, actionWindow: travelVote() });
  assert.equal(MTG.unwrapBotDecisionAction(noHumanGrave.action), 'mines', 'prazno protivničko groblje čini Mines praznim glasom');
  addCard(game, human, MTG.DEFS['Blood Artist'], 'graveyard');
  for (let i = 0; i < 8; i++) addPlains(game, human);
  game.recalc();
  const valuableHumanGrave = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 194, actionWindow: travelVote() });
  assert.equal(MTG.unwrapBotDecisionAction(valuableHumanGrave.action), 'pass', 'kasni basic je manja pomoć od vraćanja jakog enginea');
  assert.ok(other);
});

test('AI ne floata beskorisnu manu iz utility landa', async () => {
  const { game, players: [bot] } = gameFixture(187);
  const tunnel = addCard(game, bot, MTG.DEFS['Access Tunnel']);
  game.turnPlayer = bot;
  game.turnNo = 2;
  game.phase = 'main1';
  game.step = 'main';
  game.recalc();
  const acts = game.activatableList(bot);
  assert.ok(acts.some(entry => entry.card === tunnel && entry.manaAbility), 'ljudski manual-mana izbor mora ostati dostupan');
  const q = { type: 'main', player: bot, casts: [], acts, lands: [], phase: game.phase };
  const view = MTG.createBotPlayerView(game, bot.idx, q);
  assert.equal(MTG.generateLegalActions(view).some(action => action.kind === 'activate' && action.entry.manaAbility), false);
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 188, actionWindow: q, forceSearch: true });
  assert.equal(decision.action.kind, 'done');
  assert.equal(tunnel.tapped, false);
});

test('AI V2 nema mrežne/model/auth zavisnosti', () => {
  const source = fs.readFileSync(new URL('../src/modules/ai-v2.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /WebSocket|XMLHttpRequest|navigator\.gpu|onnx|embedding|api[_-]?key|authorization\s*:/i);
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
});
