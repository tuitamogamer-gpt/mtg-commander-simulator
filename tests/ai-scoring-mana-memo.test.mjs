import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const game = new M.Game({seed: 102911, paced: false});
  const bot = game.addPlayer('Bot', M.DECKS['Federation Fleet'], null, true);
  const opponent = game.addPlayer('Opponent', M.DECKS['Landing Party'], null, true);
  bot.deckName = 'Federation Fleet'; bot.aiStyle = 'balanced';
  opponent.deckName = 'Landing Party'; opponent.aiStyle = 'balanced';
  game.turnPlayer = bot; game.turnNo = 10; game.phase = 'main1'; game.step = 'main';
  const add = (name, owner = bot, zone = 'battlefield') => {
    const c = new M.CardInst(M.DEFS[name], owner); c.zone = zone; c.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(c); return c;
  };
  const lands = Array.from({length: 4}, () => add('Island'));
  const source = add('Sol Ring');
  // Scoring callbacks are read-only. Several alternatives deliberately ask
  // the same resource question, as reserve and personality policies do.
  const observations = [];
  const abilities = Array.from({length: 8}, (_, index) => ({
    label: 'Resource choice ' + index, cost: {},
    aiScore(g, c, p) {const n = M.botAvailableManaEstimate(g, p); observations.push(n); return n + index * 0.01;},
    run() {},
  }));
  source.def = {...source.def, abilities};
  game.recalc();
  const q = {type: 'main', player: bot, casts: [], lands: [], phase: game.phase,
    acts: abilities.map((ability, idx) => ({card: source, ability, idx}))};
  const decide = () => M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
    difficulty: 'normal', actionWindow: q, forceSearch: false, seed: 117, budgetMs: 0});
  return {game, bot, opponent, lands, source, abilities, observations, q, decide, add};
}

test('a synchronous ranking preserves every score while avoiding repeated mana-source scans', async t => {
  const f = fixture(), view = M.createBotPlayerView(f.game, f.bot.idx, f.q);
  const profile = M.getBotEvaluationProfile(f.bot), actions = M.generateLegalActions(view);
  let scans = 0; const manaSources = f.game.manaSources;
  f.game.manaSources = function(player, forSpell, ...args) {
    if (forSpell == null && !args.length) scans++;
    return manaSources.call(this, player, forSpell, ...args);
  };
  const expected = actions.map(action => ({action, quick: M.quickScoreBotAction(view, action, profile, f.q)}))
    .sort((a, b) => b.quick.total - a.quick.total || M.botActionKey(a.action).localeCompare(M.botActionKey(b.action)));
  const uncachedScans = scans; scans = 0;
  const before = plain({pool: f.bot.pool, cards: f.game.bf().map(c => [c.iid, c.ctrl.idx, c.tapped, c.zone])});
  f.game.rnd = () => {throw Error('Ranking must not consume gameplay RNG');};
  const actual = await f.decide();
  assert.equal(actual.consideredActions.length, 5);
  assert.deepEqual(plain(actual.consideredActions.map(row => ({score: row.score, breakdown: row.scoreBreakdown}))),
    plain(expected.slice(0, 5).map(row => ({score: row.quick.total, breakdown: row.quick.breakdown}))));
  assert.ok(scans < uncachedScans, `${scans} cached scans vs ${uncachedScans} uncached`);
  t.diagnostic(`${scans} mana-source scans with ranking memo vs ${uncachedScans} uncached`);
  assert.ok(scans <= f.game.players.length + 2, 'only view creation and one ranking estimate per player');
  assert.deepEqual(plain({pool: f.bot.pool, cards: f.game.bf().map(c => [c.iid, c.ctrl.idx, c.tapped, c.zone])}), before);
  assert.equal(M.botActionKey((await f.decide()).action), M.botActionKey(actual.action), 'seeded choice stays deterministic');
});

test('completed rankings do not retain mana after tapping, control changes or pool changes', async () => {
  const f = fixture();
  for (const change of [() => {}, () => {f.lands[0].tapped = true;},
    () => {M.OracleV8Control.gain(f.game, f.lands[1], f.opponent); f.game.recalc();},
    () => {f.bot.pool.U = 7;}]) {
    change();
    const expected = M.botAvailableManaEstimate(f.game, f.bot);
    f.observations.length = 0;
    await f.decide();
    assert.ok(f.observations.length >= 8);
    assert.ok(f.observations.every(value => value === expected), `${f.observations} vs fresh ${expected}`);
  }
});

test('throwing out of a ranking clears its resource memo before the next query', async () => {
  const f = fixture();
  f.abilities[1].aiScore = (g, c, p) => {M.botAvailableManaEstimate(g, p); throw Error('Injected scoring failure');};
  await assert.rejects(f.decide(), /Injected scoring failure/);
  for (const c of f.game.bf()) c.tapped = true;
  assert.equal(M.botAvailableManaEstimate(f.game, f.bot), 0);
  f.bot.pool.C = 3;
  assert.equal(M.botAvailableManaEstimate(f.game, f.bot), 3);
});

test('a real ritual preview gets its temporary mana without contaminating later scores', async () => {
  const f = fixture();
  f.add('Mountain');
  const bear = f.add('Myr Retriever', f.bot, 'hand'), ritual = f.add('Pyretic Ritual', f.bot, 'hand');
  f.game.recalc();
  f.q.acts = []; f.q.casts = [{card: bear, from: 'hand'}, {card: ritual, from: 'hand'}];
  const base = M.botAvailableManaEstimate(f.game, f.bot), preview = [], before = plain(f.bot.pool);
  const castable = f.game.castableList;
  f.game.castableList = function(player, ...args) {
    if (player === f.bot && player.pool.R > 0) preview.push(M.botAvailableManaEstimate(this, player));
    return castable.call(this, player, ...args);
  };
  await f.decide();
  assert.ok(preview.length > 0, 'native Pyretic Ritual scoring probes its follow-up spells');
  assert.ok(preview.every(value => value === base + 3), `${preview} vs ${base + 3}`);
  assert.deepEqual(plain(f.bot.pool), before);
  assert.equal(M.botAvailableManaEstimate(f.game, f.bot), base);
});
