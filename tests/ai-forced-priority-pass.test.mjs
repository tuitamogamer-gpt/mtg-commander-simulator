import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(isAI = true, swarm = 0) {
  const events = [];
  const game = new M.Game({seed: 102911, paced: false, onEvent: event => events.push(event)});
  const player = game.addPlayer('Bot', M.DECKS['Federation Fleet'], null, isAI);
  const opponent = game.addPlayer('Opponent', M.DECKS['Landing Party'], {decide: async () => ({kind: 'pass'})}, true);
  player.deckName = 'Federation Fleet'; opponent.deckName = 'Landing Party';
  const ai = new M.AIController(player, {difficulty: 'normal', style: 'balanced'});
  player.controller = ai;
  game.turnPlayer = player; game.turnNo = 33; game.phase = 'main1'; game.step = 'main';
  const add = (name, owner = player, zone = 'battlefield') => {
    const c = new M.CardInst(M.DEFS[name], owner); assert.ok(c.def, name);
    c.zone = zone; c.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(c); return c;
  };
  add('Llanowar Elves');
  for (let i = 0; i < 4; i++) add('Island');
  for (let i = 0; i < swarm; i++) add('Scute Swarm', opponent).isToken = true;
  game.recalc();
  const priority = () => ({type: 'priority', player, casts: game.castableList(player),
    acts: game.activatableList(player, true), stack: game.stack, phase: game.phase});
  return {game, player, opponent, ai, add, events, priority};
}
const state = f => plain({pool: f.player.pool, life: f.player.life,
  cards: f.game.bf().map(c => [c.iid, c.zoneVersion, c.ctrl.idx, c.tapped, c.damage, c.counters]),
  stack: f.game.stack.map(row => row.name)});

for (const isAI of [true, false]) {
  test(`mana-only priority avoids board evaluation for an AI controller (isAI=${isAI})`, async () => {
    const f = fixture(isAI, 250), q = f.priority(), before = state(f);
    assert.ok(q.acts.length > 0 && q.acts.every(entry => entry.manaAbility));
    assert.equal(q.casts.length, 0);
    const choose = M.chooseBotAction;
    let fullDecisions = 0;
    M.chooseBotAction = async () => {fullDecisions++; throw Error('Forced pass must not evaluate the board');};
    f.game.rnd = () => {throw Error('Forced pass consumed gameplay RNG');};
    try {
      assert.deepEqual(plain(await f.player.controller.decide(f.game, q)), {kind: 'pass'});
      assert.equal(fullDecisions, 0);
      assert.deepEqual(state(f), before);
      const log = f.game.aiDecisionLog.at(-1);
      assert.equal(log.chosen, 'Pass priority'); assert.equal(log.forcedPass, true); assert.equal(log.fallback, false);
      assert.equal(f.events.filter(event => event.type === 'aiDecision').length, 1);
      const record = M.recordSaveDecision(q, f.player, {kind: 'pass'});
      assert.deepEqual(plain(M.restoreSaveDecision(q, f.player, plain(record))), {kind: 'pass'});
    } finally {M.chooseBotAction = choose;}
  });
}

test('forced passes preserve history eviction and the next real decision seed/action', async () => {
  const f = fixture();
  const card = f.add('Opt', f.player, 'hand');
  for (let i = 0; i < 10; i++) f.add('Island', f.player, 'library');
  const islands = f.game.lands(f.player).filter(c => c.name === 'Island');
  for (const c of islands) c.tapped = true;
  f.game.recalc();
  const q = f.priority(); assert.equal(q.casts.length, 0);
  const next = () => {
    islands[0].tapped = false; f.game.phase = 'end'; f.game.turnPlayer = f.opponent;
    return f.priority();
  };
  const originalHistory = Array.from({length: 160}, (_, i) => ({turn: f.game.turnNo, playerId: f.player.idx,
    playerName: f.player.name, chosen: 'Old action ' + i, ordinal: i}));
  const select = query => M.chooseBotAction({gameState: f.game, botPlayerId: f.player.idx,
    difficulty: 'normal', actionWindow: query});
  f.game.aiDecisionLog = plain(originalHistory);
  f.game.rnd = () => {throw Error('Priority scoring consumed gameplay RNG');};
  for (let i = 0; i < 165; i++) assert.equal((await select(q)).action.kind, 'pass');
  const baselineSlots = f.game.aiDecisionLog.map(row => [row.turn, row.playerId, row.chosen]);
  const baseline = await select(next());
  assert.equal(baseline.action.kind, 'cast'); assert.equal(baseline.action.card, card);
  islands[0].tapped = true; f.game.phase = 'main1'; f.game.turnPlayer = f.player;
  f.game.aiDecisionLog = plain(originalHistory);
  for (let i = 0; i < 165; i++) assert.equal((await f.player.controller.decide(f.game, q)).kind, 'pass');
  assert.deepEqual(plain(f.game.aiDecisionLog.map(row => [row.turn, row.playerId, row.chosen])), plain(baselineSlots));
  const answer = await f.player.controller.decide(f.game, next()), optimized = f.ai.lastV2Decision;
  assert.equal(M.botActionKey(answer), M.botActionKey(baseline.action));
  assert.equal(optimized.log.seed, baseline.log.seed);
  assert.equal(optimized.log.tieBreak, baseline.log.tieBreak);
  assert.equal(optimized.score, baseline.score);
  assert.deepEqual(plain(optimized.consideredActions), plain(baseline.consideredActions));
});

test('session-used forced passes retain the previous no-log bypass', async () => {
  const f = fixture(), q = f.priority();
  f.game._prioritySessionId = 19;
  f.ai._v2PrioritySessionUsed = `19|${f.player.idx}`;
  f.game.aiDecisionLog = [{chosen: 'Earlier activation'}];
  assert.equal((await f.player.controller.decide(f.game, q)).kind, 'pass');
  assert.equal(f.game.aiDecisionLog.length, 1);
  assert.equal(f.events.filter(event => event.type === 'aiDecision').length, 0);
});

for (const [name, kind] of [['Commander William Riker', 'paid'], ['Viscera Seer', 'sacrifice'], ['Shuko', 'zero-cost']]) {
  test(`${kind} nonmana responses still reach the full AI decision`, async () => {
    const f = fixture(), source = f.add(name); f.game.recalc();
    const q = f.priority(), entry = q.acts.find(row => row.card === source && !row.manaAbility);
    assert.ok(entry, name + ' has a real legal response');
    const choose = M.chooseBotAction; let visited = 0;
    M.chooseBotAction = async params => {visited++; assert.equal(params.actionWindow, q); return {action: {kind: 'activate', entry}};};
    try {assert.equal((await f.player.controller.decide(f.game, q)).entry, entry); assert.equal(visited, 1);}
    finally {M.chooseBotAction = choose;}
  });
}

test('castable instants still reach the full AI decision beside mana-only activations', async () => {
  const f = fixture(), card = f.add('Opt', f.player, 'hand'); f.game.recalc();
  const q = f.priority(); assert.ok(q.casts.some(row => row.card === card));
  const choose = M.chooseBotAction; let visited = 0;
  M.chooseBotAction = async () => {visited++; return {action: {kind: 'cast', card, from: 'hand'}};};
  try {assert.equal((await f.player.controller.decide(f.game, q)).card, card); assert.equal(visited, 1);}
  finally {M.chooseBotAction = choose;}
});

test('human and custom controllers still receive their unchanged mana-only priority question', async () => {
  const f = fixture(false), received = [];
  f.player.controller = {decide: async (g, q) => {received.push(q); return {kind: 'pass'};}};
  await f.game.askPriorityAction(f.player);
  assert.equal(received.length, 1);
  assert.ok(received[0].acts.length > 0 && received[0].acts.every(entry => entry.manaAbility));
});

for (const style of ['josh', 'jimmy', 'rachel', 'post', 'olivia']) {
  test(style + ': forced passes retain the actual signature skill and mode', async () => {
    const f = fixture(); f.player.aiStyle = style;
    const expectedMode = M.getAIStyleMode(f.game, f.player);
    const expectedSkill = M.getAIStyleSkill(style).id;
    await f.player.controller.decide(f.game, f.priority());
    assert.equal(f.game.aiDecisionLog.at(-1).skill, expectedSkill);
    assert.equal(f.game.aiDecisionLog.at(-1).mode, expectedMode);
    assert.equal(f.game.aiDecisionLog.at(-1).forcedPass, true);
  });
}
