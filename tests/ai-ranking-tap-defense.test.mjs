// A ranking scores every action against one unchanged board. The forecast of
// which blockers a mana payment taps down is built once per ranking, not once
// for each action and again inside every mana plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));

// A bot with mana creatures that are also its blockers, several routine
// spells to rank, and two opponents with creatures able to attack it.
function fixture() {
  const game = new M.Game({seed: 110611, paced: false});
  const bot = game.addPlayer('Bot', M.DECKS['Elven Council'], null, true);
  const left = game.addPlayer('Left', M.DECKS['Quick Draw'], null, true);
  const right = game.addPlayer('Right', M.DECKS['Eternal Might'], null, true);
  for (const [player, deck] of [[bot, 'Elven Council'], [left, 'Quick Draw'], [right, 'Eternal Might']]) {
    player.deckName = deck; player.aiStyle = 'balanced';
  }
  game.turnPlayer = bot; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  const add = (name, owner = bot, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); return card;
  };
  const lands = Array.from({length: 2}, () => add('Forest'));
  const elves = ['Llanowar Elves', 'Elvish Mystic', 'Fyndhorn Elves', 'Llanowar Elves', 'Elvish Mystic'].map(name => add(name));
  const spells = ['Harmonize', 'Rampant Growth', 'Cultivate', 'Explore', "Kodama's Reach"].map(name => add(name, bot, 'hand'));
  for (const name of ['Grizzly Bears', 'Grizzly Bears', 'Shivan Dragon']) add(name, left);
  for (const name of ['Serra Angel', 'Grizzly Bears', 'Grizzly Bears']) add(name, right);
  bot.life = 14;
  game.recalc();
  const window = () => ({type: 'main', player: bot, phase: game.phase, lands: [], acts: [],
    casts: game.castableList(bot).filter(entry => spells.includes(entry.card))});
  const decide = q => M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
    difficulty: 'normal', actionWindow: q, forceSearch: false, seed: 117, budgetMs: 0});
  return {game, bot, left, right, lands, elves, spells, window, decide, add};
}

// Counts the engine's damage lookups: one per creature in each new forecast.
function countDamageLookups(game) {
  const counter = {calls: 0}, original = game.dmgAmount;
  game.dmgAmount = function (...args) { counter.calls++; return original.apply(this, args); };
  return counter;
}

// The same scores without a ranking: each action is scored on its own.
function scoredAlone(f, q) {
  const view = M.createBotPlayerView(f.game, f.bot.idx, q), profile = M.getBotEvaluationProfile(f.bot);
  return M.generateLegalActions(view).map(action => ({action, quick: M.quickScoreBotAction(view, action, profile, q)}))
    .sort((a, b) => b.quick.total - a.quick.total || M.botActionKey(a.action).localeCompare(M.botActionKey(b.action)));
}

test('one ranking builds the tap forecast once and keeps every score', async t => {
  const f = fixture(), q = f.window();
  assert.ok(q.casts.length >= 4, `several castable routine spells: ${q.casts.map(entry => entry.card.name)}`);
  const counter = countDamageLookups(f.game);
  const expected = scoredAlone(f, q);
  const alone = counter.calls; counter.calls = 0;
  assert.ok(alone > 0, 'scoring these spells forecasts the attacks the tapped elves would not block');
  const before = plain(f.game.bf().map(card => [card.iid, card.ctrl.idx, card.tapped, card.zone]));
  const actual = await f.decide(q);
  const ranked = counter.calls;
  assert.deepEqual(plain(actual.consideredActions.map(row => ({score: row.score, breakdown: row.scoreBreakdown}))),
    plain(expected.slice(0, actual.consideredActions.length).map(row => ({score: row.quick.total, breakdown: row.quick.breakdown}))),
    'sharing the forecast changes no score');
  assert.ok(ranked * 2 <= alone, `${ranked} damage lookups in one ranking vs ${alone} scored alone`);
  t.diagnostic(`${ranked} damage lookups in one ranking vs ${alone} when each action is scored alone`);
  assert.deepEqual(plain(f.game.bf().map(card => [card.iid, card.ctrl.idx, card.tapped, card.zone])), before, 'ranking changes nothing on the table');
});

test('the forecast is not kept after the ranking: a changed board is read again', async () => {
  const f = fixture();
  const changes = [
    () => {},
    // A blocker is tapped, an attacker arrives, life drops: each changes the forecast.
    () => { f.elves[0].tapped = true; },
    () => { f.add('Shivan Dragon', f.right); f.game.recalc(); },
    () => { f.bot.life = 5; },
  ];
  for (const change of changes) {
    change();
    const q = f.window(), expected = scoredAlone(f, q), actual = await f.decide(q);
    assert.deepEqual(plain(actual.consideredActions.map(row => ({score: row.score, breakdown: row.scoreBreakdown}))),
      plain(expected.slice(0, actual.consideredActions.length).map(row => ({score: row.quick.total, breakdown: row.quick.breakdown}))));
  }
});

test('an actual mana payment outside a ranking still orders the blockers afresh', () => {
  const f = fixture();
  const order = () => M.botManaTapOrder(f.game, f.bot, f.elves).map(card => card.iid);
  const first = order();
  assert.equal(first.length, f.elves.length);
  // No ranking is open: nothing may be remembered from the first call.
  const counter = countDamageLookups(f.game);
  f.add('Shivan Dragon', f.left); f.game.recalc();
  order();
  assert.ok(counter.calls > 0, 'the changed board is forecast again');
});
