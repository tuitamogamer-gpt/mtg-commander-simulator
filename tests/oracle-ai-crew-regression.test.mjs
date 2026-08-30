import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallbackDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function synthetic(name, types = ['Creature'], extras = {}) {
  return Object.assign({
    name,
    cost: '{1}',
    super: [],
    types,
    subtypes: [],
    oracle: '',
    power: types.includes('Creature') ? '1' : undefined,
    toughness: types.includes('Creature') ? '1' : undefined,
  }, extras);
}

function permanent(game, player, definition) {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : definition;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function aiGame(seed = 9201) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const bot = game.addPlayer('Crew bot', { name: 'Crew regression' }, null, true);
  const opponent = game.addPlayer(
    'Crew opponent',
    { name: 'Crew opponent' },
    { decide: async (currentGame, query) => fallbackDecision(query) },
    false,
  );
  bot.controller = new MTG.AIController(bot, { difficulty: 'hard', style: 'balanced' });
  bot.life = 40;
  opponent.life = 3;
  game.turnNo = 7;
  game.turnPlayer = bot;
  game.phase = 'main1';
  game.step = 'main';
  game.recalc();
  return { game, bot, opponent };
}

test('lokalni AI crewuje relevantan Air Response Unit jednom, ali čuva naredni creature resurs', async () => {
  const { game, bot } = aiGame();
  const vehicle = permanent(game, bot, 'Air Response Unit');
  const firstPilot = permanent(game, bot, synthetic('First Crew Pilot'));
  const reservePilot = permanent(game, bot, synthetic('Reserve Crew Pilot'));

  assert.equal(vehicle.is('Creature'), false, 'Vehicle starts nonanimated');
  assert.ok(game.activatableList(bot).some(entry => entry.card === vehicle && entry.crew),
    'rules engine offers Crew for the nonanimated Vehicle');

  await game.mainPhase(bot);
  assert.equal(firstPilot.tapped, true, 'real AI pays the tactically relevant first Crew cost');
  assert.equal(reservePilot.tapped, false, 'AI pays Crew 1 with exactly one 1/1 instead of tapping every candidate');
  assert.equal([firstPilot, reservePilot].filter(card => card.tapped).length, 1,
    'first Crew activation uses the minimum sufficient pilot set');
  assert.equal(vehicle.is('Creature'), true, 'resolved Crew animates the Vehicle');
  assert.equal(vehicle.meta.crewedTurn, game.turnNo, 'Crew duration is tied to this turn');
  assert.ok((game.aiDecisionLog || []).some(decision => decision.playerId === bot.idx &&
    decision.chosen === 'Activate Air Response Unit'), 'real AIController selected the first Crew action');

  assert.ok(game.activatableList(bot).some(entry => entry.card === vehicle && entry.crew),
    'rules engine intentionally keeps repeated Crew legal after animation');
  const decisionsBefore = game.aiDecisionLog.length;

  await game.mainPhase(bot);
  assert.equal(reservePilot.tapped, false,
    'AI does not waste an additional creature on an already-crewed Vehicle');
  const laterDecisions = game.aiDecisionLog.slice(decisionsBefore).filter(decision => decision.playerId === bot.idx);
  assert.equal(laterDecisions.some(decision => decision.chosen === 'Activate Air Response Unit'), false,
    'repeated Crew never reaches the real AI choice');
  assert.ok(laterDecisions.some(decision => decision.chosen === 'End action window'),
    'AI ends the action window when repeated Crew is its only engine-legal action');
});

test('lokalni AI preskače Crew i kada je Vehicle animiran drugim efektom', async () => {
  const { game, bot } = aiGame(9202);
  const vehicle = permanent(game, bot, synthetic('Already Animated Test Vehicle', ['Artifact'], {
    subtypes: ['Vehicle'],
    crew: 1,
    power: '4',
    toughness: '4',
    dynTypes: () => ['Creature'],
  }));
  const pilot = permanent(game, bot, synthetic('Animated Vehicle Pilot'));

  assert.equal(vehicle.is('Creature'), true, 'separate type-changing effect already animates the Vehicle');
  assert.equal(vehicle.meta.crewedTurn, undefined, 'this animation did not come from Crew');
  assert.ok(game.activatableList(bot).some(entry => entry.card === vehicle && entry.crew),
    'rules engine still exposes the legal Crew activation');

  await game.mainPhase(bot);
  assert.equal(pilot.tapped, false, 'AI preserves the pilot when animation already exists');
  assert.equal((game.aiDecisionLog || []).some(decision => decision.playerId === bot.idx &&
    decision.chosen === 'Activate Already Animated Test Vehicle'), false,
    'AI does not select redundant Crew for an otherwise-animated Vehicle');
});

test('lokalni AI uvijek vidi minimalni Crew singleton iza mnogo 0-power kandidata', async () => {
  const { game, bot } = aiGame(9203);
  const vehicle = permanent(game, bot, 'Air Response Unit');
  const zeroPilots = Array.from({ length: 5 }, (_, index) => permanent(game, bot,
    synthetic(`Zero-power pilot ${index}`, ['Creature'], { power: '0', toughness: '1' })));
  const onlyPower = permanent(game, bot,
    synthetic('Only useful Crew pilot', ['Creature'], { power: '1', toughness: '1' }));

  await game.mainPhase(bot);
  assert.equal(vehicle.is('Creature'), true);
  assert.equal(onlyPower.tapped, true, 'the one sufficient 1/1 pays Crew 1');
  assert.ok(zeroPilots.every(card => !card.tapped), 'no 0-power creature is wasted on the Crew payment');
  assert.ok((game.aiDecisionLog || []).some(decision => decision.playerId === bot.idx &&
    decision.chosen === 'Cards: Only useful Crew pilot'),
  'real AI decision evidence contains the minimal singleton');
});
