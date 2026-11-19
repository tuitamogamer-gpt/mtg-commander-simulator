// A bot with a board wipe in hand used to cast it in its first main phase and
// then pass a combat with nothing left to attack with. A sweep that takes the
// bot's own attackers is now held for the second main phase: they attack
// first, for whatever they deal, and nothing before the sweep spends its mana.
// A sweep that spares the bot's attackers still goes first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function add(game, player, def, zone = 'battlefield') {
  const card = new MTG.CardInst(typeof def === 'string' ? MTG.DEFS[def] : def, player);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
  return card;
}
let bodies = 0;
function body(game, player, power, toughness = power, kws = [], cost = '{4}') {
  return add(game, player, { name: `Body ${++bodies}`, types: ['Creature'], super: [], subtypes: [], cost, oracle: '',
    power: String(power), toughness: String(toughness), kws, abilities: [] });
}
// The bot's first main phase with a sweep in hand and the lands to cast it.
function fixture(name = 'Day of Judgment', { style = 'balanced', lands = 4, phase = 'main1' } = {}) {
  const game = new MTG.Game({ seed: 811, paced: false });
  const players = Array.from({ length: 4 }, (_, i) => {
    const player = game.addPlayer(`Seat ${i}`, MTG.DECKS['Quick Draw'], null, true);
    player.controller = new MTG.AIController(player, { style, difficulty: 'normal' });
    return player;
  });
  const bot = players[0];
  game.turnPlayer = bot; game.turnNo = 20; game.phase = phase; game.step = 'main';
  for (let i = 0; i < lands; i++) add(game, bot, ['Plains', 'Swamp'][i % 2]);
  const wipe = add(game, bot, name, 'hand');
  return { game, players, bot, wipe };
}
// Three opponents with real boards: the sweep is worth casting this turn.
function armies(game, players, power = 5, each = 2) {
  for (const opponent of players.slice(1)) for (let i = 0; i < each; i++) body(game, opponent, power);
}
function mainWindow(game, bot) {
  game.recalc();
  return { type: 'main', player: bot, casts: game.castableList(bot), acts: game.activatableList(bot), lands: [], phase: game.phase };
}
const decide = (game, bot, q, forceSearch = false) => MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, actionWindow: q,
  difficulty: 'normal', seed: 22, forceSearch, budgetMs: 0 });
function attackWindow(game, bot) {
  game.phase = 'combat'; game.step = 'attackers'; game.recalc();
  const eligible = game.creatures(bot).filter(card => !card.tapped && (!card.sick || card.kw('haste')) && !card.cur.cantAttack && game.canAttackAtAll(card));
  const opponents = bot.opponents(game);
  return { type: 'attackers', player: bot, eligible, opponents, attackTargets: opponents, forced: [] };
}

test('a sweep that takes the bot\'s own attackers waits: the first main phase ends without it', async () => {
  const { game, players, bot, wipe } = fixture();
  const mine = [body(game, bot, 2), body(game, bot, 3)];
  armies(game, players);
  const q = mainWindow(game, bot);
  assert.ok(q.casts.some(entry => entry.card === wipe), 'the engine offers the sweep');
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.deepEqual(Array.from(MTG.botAttackersLostToSweep(game, bot, impact), card => card.iid), mine.map(card => card.iid));
  const result = await decide(game, bot, q);
  assert.equal(result.action.kind, 'done', JSON.stringify(result.consideredActions));
  const held = result.consideredActions.find(row => row.action.includes(wipe.name));
  assert.ok(held && held.scoreBreakdown.attackFirst < 0 && held.score <= -80, `the sweep is held, not forgotten: ${JSON.stringify(held)}`);
  // The search over the real engine agrees.
  assert.equal((await decide(game, bot, mainWindow(game, bot), true)).action.kind, 'done');
  // And so does the fallback controller.
  assert.equal(bot.controller.mainAction(game, q).kind, 'done');
});

test('then everything the sweep would take attacks, into blockers it cannot beat', async () => {
  const { game, players, bot } = fixture();
  const mine = [body(game, bot, 2), body(game, bot, 3)];
  armies(game, players);
  // Without a sweep to follow, these two stay home: every defender blocks and kills them for free.
  const before = await decide(game, bot, attackWindow(game, bot));
  assert.equal(before.action.assignments.length, 0, 'a 2/2 and a 3/3 do not attack into 5/5s on their own');
  game.phase = 'main1'; game.step = 'main';
  assert.equal((await decide(game, bot, mainWindow(game, bot))).action.kind, 'done');
  assert.ok(MTG.botSweepAfterCombat(game, bot), 'the bot remembers the sweep it held');
  const attack = await decide(game, bot, attackWindow(game, bot));
  assert.equal(attack.action.kind, 'declareAttackers');
  assert.deepEqual(Array.from(attack.action.assignments, item => item.card.iid).sort((a, b) => a - b), mine.map(card => card.iid),
    JSON.stringify(attack.consideredActions.slice(0, 3).map(row => [row.action, row.score])));
  assert.ok(attack.action.assignments.every(item => players.slice(1).includes(item.target)));
});

test('and the sweep is cast in the second main phase', async () => {
  const { game, players, bot, wipe } = fixture();
  body(game, bot, 2); body(game, bot, 3);
  armies(game, players);
  assert.equal((await decide(game, bot, mainWindow(game, bot))).action.kind, 'done');
  game.phase = 'main2'; game.step = 'main';
  // Combat is over: its attackers are tapped, or dead.
  for (const card of game.creatures(bot)) card.tapped = true;
  const after = await decide(game, bot, mainWindow(game, bot));
  assert.equal(after.action.card, wipe, JSON.stringify(after.consideredActions));
  assert.equal(bot.controller.mainAction(game, mainWindow(game, bot)).card, wipe);
});

test('a whole turn through the engine: attack, then sweep', async () => {
  const { game, players, bot, wipe } = fixture('Wrath of God');
  const mine = [body(game, bot, 2), body(game, bot, 3)];
  armies(game, players);
  players[1].life = 40;
  const order = [];
  game.onEvent = event => {
    if (event.type === 'attackersDeclared' || event.type === 'declareAttackers') order.push('attack');
  };
  const lifeBefore = players.slice(1).reduce((sum, player) => sum + player.life, 0);
  game.recalc();
  await game.mainPhase(bot);
  assert.equal(wipe.zone, 'hand', 'the first main phase keeps the sweep in hand');
  assert.equal(game.creatures(bot).length, 2);
  await game.combatPhase(bot);
  const attacked = mine.filter(card => card.tapped || card.zone !== 'battlefield');
  assert.equal(attacked.length, 2, 'both of its creatures attacked');
  game.phase = 'main2'; game.step = '';
  await game.mainPhase(bot);
  for (let i = 0; i < 20 && (game.stack.length || game.pendingTriggers.length); i++) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.equal(wipe.zone, 'graveyard', 'the sweep was cast after combat');
  assert.equal(game.bf().filter(card => card.is('Creature')).length, 0, 'and took every creature');
  const lifeAfter = players.slice(1).reduce((sum, player) => sum + player.life, 0);
  assert.ok(lifeAfter <= lifeBefore, 'no opponent gained from the attack');
});

test('a sweep that spares the bot\'s creatures goes first, to clear the way', async () => {
  const { game, players, bot, wipe } = fixture('Plague Wind', { lands: 9 });
  body(game, bot, 2); body(game, bot, 3);
  armies(game, players);
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(impact.mineLoss, 0);
  assert.equal(MTG.botAttackersLostToSweep(game, bot, impact).length, 0);
  const result = await decide(game, bot, mainWindow(game, bot));
  assert.equal(result.action.card, wipe, JSON.stringify(result.consideredActions));
});

test('creatures that cannot attack this turn do not hold the sweep back', async () => {
  const { game, players, bot, wipe } = fixture();
  for (const card of [body(game, bot, 2), body(game, bot, 3)]) card.sick = true;
  armies(game, players);
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(MTG.botAttackersLostToSweep(game, bot, impact).length, 0);
  assert.equal((await decide(game, bot, mainWindow(game, bot))).action.card, wipe);
  // Tapped ones neither.
  for (const card of game.creatures(bot)) { card.sick = false; card.tapped = true; }
  game.recalc();
  assert.equal(MTG.botAttackersLostToSweep(game, bot, MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe })).length, 0);
});

test('when its hardest hitter survives the sweep, the sweep goes first', async () => {
  const { game, players, bot, wipe } = fixture();
  body(game, bot, 1);
  body(game, bot, 7, 7, ['indestructible']);
  armies(game, players);
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(MTG.botAttackersLostToSweep(game, bot, impact).length, 0, 'seven damage into an empty table beats one damage now');
  assert.equal((await decide(game, bot, mainWindow(game, bot))).action.card, wipe);
});

test('a creature that taps for mana pays for the sweep instead of attacking', async () => {
  const { game, players, bot, wipe } = fixture('Day of Judgment', { lands: 3 });
  const elf = add(game, bot, 'Llanowar Elves');
  armies(game, players);
  game.recalc();
  const impact = MTG.botBoardWipeImpact(game, bot, { kind: 'cast', card: wipe });
  assert.equal(MTG.botAttackersLostToSweep(game, bot, impact).length, 0);
  const q = mainWindow(game, bot);
  if (q.casts.some(entry => entry.card === wipe)) assert.equal((await decide(game, bot, q)).action.card, wipe);
  assert.equal(elf.zone, 'battlefield');
});

test('nothing before the held sweep may spend its mana', async () => {
  const { game, players, bot, wipe } = fixture('Day of Judgment', { lands: 5 });
  body(game, bot, 2); body(game, bot, 3);
  armies(game, players);
  const draw = add(game, bot, 'Read the Bones', 'hand');
  const q = mainWindow(game, bot);
  assert.ok(q.casts.some(entry => entry.card === draw) && q.casts.some(entry => entry.card === wipe));
  const result = await decide(game, bot, q);
  assert.equal(result.action.kind, 'done', JSON.stringify(result.consideredActions));
  const row = result.consideredActions.find(item => item.action.includes(draw.name));
  assert.ok(row && row.scoreBreakdown.attackFirst === -40, `three of five mana would leave two for a four-mana sweep: ${JSON.stringify(row)}`);
  // With mana to spare it is free to cast it.
  for (let i = 0; i < 3; i++) add(game, bot, 'Swamp');
  const roomy = await decide(game, bot, mainWindow(game, bot));
  const free = roomy.consideredActions.find(item => item.action.includes(draw.name));
  assert.ok(free && free.scoreBreakdown.attackFirst === undefined, JSON.stringify(roomy.consideredActions));
});

test('a sweep whose cost the table is reducing waits only with mana to spare', async () => {
  // Blasphemous Act costs one less for each creature: eight creatures, one mana.
  const tight = fixture('Blasphemous Act', { lands: 3 });
  add(tight.game, tight.bot, 'Mountain');
  body(tight.game, tight.bot, 2); body(tight.game, tight.bot, 3);
  armies(tight.game, tight.players);
  const q = mainWindow(tight.game, tight.bot);
  assert.ok(q.casts.some(entry => entry.card === tight.wipe));
  // Four lands: if both attackers and a blocker each die, it costs five. Cast it while it is cheap.
  assert.equal((await decide(tight.game, tight.bot, q)).action.card, tight.wipe);
  // Six lands pay for it whatever dies in combat: the attackers go first.
  const roomy = fixture('Blasphemous Act', { lands: 5 });
  add(roomy.game, roomy.bot, 'Mountain');
  body(roomy.game, roomy.bot, 2); body(roomy.game, roomy.bot, 3);
  armies(roomy.game, roomy.players);
  const result = await decide(roomy.game, roomy.bot, mainWindow(roomy.game, roomy.bot));
  assert.equal(result.action.kind, 'done', JSON.stringify(result.consideredActions));
});

test('sweeps the exact model does not read are held too, when their text is plain', async () => {
  // Destroy all nontoken creatures: the bot's own nontoken attackers go first.
  const hour = fixture('Hour of Reckoning', { lands: 7 });
  body(hour.game, hour.bot, 2); body(hour.game, hour.bot, 3);
  armies(hour.game, hour.players);
  const q = mainWindow(hour.game, hour.bot);
  assert.ok(q.casts.some(entry => entry.card === hour.wipe), 'the engine offers it');
  assert.equal(MTG.botBoardWipeImpact(hour.game, hour.bot, { kind: 'cast', card: hour.wipe }), null, 'not read by the exact model');
  const reach = MTG.botSweepReach(hour.game, hour.bot, { kind: 'cast', card: hour.wipe });
  assert.ok(reach && hour.game.creatures(hour.bot).every(card => reach(card)));
  const first = await decide(hour.game, hour.bot, q);
  // Held only if the bot would have cast it this turn at all.
  if (first.consideredActions.some(row => row.scoreBreakdown.attackFirst <= -80 || row.score <= -80)) assert.equal(first.action.kind, 'done');
  // A token of its own is not taken, and not sent to die for nothing.
  const token = body(hour.game, hour.bot, 4); token.isToken = true; hour.game.recalc();
  assert.equal(reach(token), false);

  // Return all creatures to their owners' hands: attack first, then pick them up.
  const evac = fixture('Evacuation', { lands: 5 });
  for (const land of evac.game.lands(evac.bot)) land.zone = 'battlefield';
  for (let i = 0; i < 3; i++) add(evac.game, evac.bot, 'Island');
  body(evac.game, evac.bot, 2); body(evac.game, evac.bot, 3);
  armies(evac.game, evac.players);
  evac.game.recalc();
  const bounce = MTG.botSweepReach(evac.game, evac.bot, { kind: 'cast', card: evac.wipe });
  assert.ok(bounce && evac.game.creatures(evac.bot).every(card => bounce(card)));
});

test('nothing is assumed about a sweep that is one-sided, targeted, or spares what is tapped', async () => {
  const { game, players, bot } = fixture('Day of Judgment');
  body(game, bot, 2); armies(game, players); game.recalc();
  const reach = name => MTG.botSweepReach(game, bot, { kind: 'cast', card: add(game, bot, name, 'hand') });
  // Six damage to each untapped creature: an attacker is tapped by then.
  assert.equal(reach('Calamity of Cinders'), null);
  // One-sided, read exactly: it takes nothing of the bot's.
  const wind = reach('Plague Wind');
  assert.ok(wind && game.creatures(bot).every(card => !wind(card)));
  // A choice made on resolution.
  assert.equal(reach('Kindred Dominance'), null);
  // Not a sweep at all.
  assert.equal(reach('Read the Bones'), null);
});

test('with two sweeps in hand, neither is cast before combat', async () => {
  // Found in a whole game: the better sweep was held and the bot cast the other one instead.
  const { game, players, bot, wipe } = fixture('Day of Judgment', { lands: 6 });
  const second = add(game, bot, 'Wrath of God', 'hand');
  body(game, bot, 2); body(game, bot, 3);
  armies(game, players);
  const q = mainWindow(game, bot);
  assert.ok(q.casts.some(entry => entry.card === wipe) && q.casts.some(entry => entry.card === second));
  const result = await decide(game, bot, q);
  assert.equal(result.action.kind, 'done', JSON.stringify(result.consideredActions.map(row => [row.action, row.score])));
  const plan = MTG.botAttackFirstPlan(MTG.createBotPlayerView(game, bot.idx, q), MTG.getDeckAIProfile(bot.deckName), q);
  assert.ok(plan.held.has(wipe) && plan.held.has(second), 'both are held');
  // One of them is cast after combat.
  game.phase = 'main2'; game.step = 'main';
  for (const card of game.creatures(bot)) card.tapped = true;
  const after = await decide(game, bot, mainWindow(game, bot));
  assert.ok(after.action.card === wipe || after.action.card === second, JSON.stringify(after.consideredActions.map(row => [row.action, row.score])));
});

test('the held sweep is forgotten on another turn and in a simulation', async () => {
  const { game, players, bot } = fixture();
  body(game, bot, 2); body(game, bot, 3);
  armies(game, players);
  assert.equal((await decide(game, bot, mainWindow(game, bot))).action.kind, 'done');
  assert.ok(MTG.botSweepAfterCombat(game, bot));
  assert.equal(MTG.botSweepAfterCombat(game, players[1]), null, 'only for the player who held it');
  game.turnNo++;
  assert.equal(MTG.botSweepAfterCombat(game, bot), null, 'only on that turn');
});
