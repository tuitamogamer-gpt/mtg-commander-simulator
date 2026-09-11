import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
function fixture(difficulty = null, style = 'balanced') {
  const f = context(M);
  f.put = (name, zone = 'battlefield', player = f.a) => put(M, f.game, player, name, zone);
  for (const player of f.game.players) {
    const decide = player.controller.decide.bind(player.controller);
    player.controller = {decide: (g, q) => q.type === 'chooseTargets' && q.quickTarget ? [q.quickTarget] : decide(g, q)};
  }
  if (difficulty) {
    f.a.isAI = true;
    f.a.controller = new M.AIController(f.a, {difficulty, style});
  }
  return f;
}
function window(f, type = 'main') {
  return {type, player: f.a, casts: [], lands: [], acts: f.game.activatableList(f.a, type === 'priority'), phase: f.game.phase};
}
async function protect(f, target) {
  const source = f.source || (f.source = f.put('Together Forever'));
  f.a.pool.C = 1;
  const entry = f.game.activatableList(f.a, true).find(row => row.card === source);
  assert.ok(entry, 'a payable ability with a counter-bearing target is offered');
  assert.equal(await f.game.activateAbility(f.a, entry, [target]), true);
  assert.equal(f.a.pool.C, 0);
  await settle(f.game);
  return source;
}

test('Together Forever supports up to two different creatures when it enters', async () => {
  const f = fixture(), first = f.put('Grizzly Bears'), second = f.put('Grizzly Bears');
  const decide = f.a.controller.decide;
  f.a.controller.decide = (g, q) => q.type === 'chooseTargets' ? [first, second] : decide(g, q);
  const source = f.put('Together Forever', 'hand');
  f.a.pool.W = 2;
  assert.equal(await f.game.castSpell(f.a, source, {from: 'hand'}), true);
  await settle(f.game);
  assert.equal(first.counters['+1/+1'], 1);
  assert.equal(second.counters['+1/+1'], 1);
});

test('Together Forever availability follows mana, any counter, targeting and combat priority', () => {
  const f = fixture(), source = f.put('Together Forever'), target = f.put('Grizzly Bears');
  const offered = () => window(f, 'priority').acts.some(row => row.card === source);
  f.game.phase = 'combat'; f.game.step = 'blockers'; f.a.pool.C = 1;
  assert.equal(offered(), false);
  f.game.addCounters(target, 'flying', 1);
  assert.equal(offered(), true, 'the Oracle text permits any kind of counter');
  assert.equal(M.autoPassPolicy('end', f.game, window(f, 'priority'), f.a), false);
  f.a.pool.C = 0;
  assert.equal(offered(), false);
});

test('Together Forever returns through the normal zone-change engine after its source leaves', async () => {
  const f = fixture(), target = f.put('Grizzly Bears');
  f.game.addCounters(target, '+1/+1', 1);
  const source = await protect(f, target);
  f.game.removeCounters(target, '+1/+1', 1);
  await f.game.move(source, 'graveyard');
  await f.game.sacrifice(f.a, target);
  const graveyardVersion = target.zoneVersion;
  assert.equal(target.zone, 'graveyard');
  await settle(f.game);
  assert.equal(target.zone, 'hand');
  assert.equal(target.zoneVersion, graveyardVersion + 1);
  assertGameStateInvariants(f.game);
});

test('Together Forever does not follow a blinked creature into a later death', async () => {
  const f = fixture(), target = f.put('Grizzly Bears');
  f.game.addCounters(target, '+1/+1', 1);
  await protect(f, target);
  await f.game.move(target, 'exile');
  await f.game.putPermanentOntoBattlefield(target, f.a);
  await f.game.sacrifice(f.a, target);
  await settle(f.game);
  assert.equal(target.zone, 'graveyard');
});

test('Together Forever cannot return a different graveyard incarnation of its target', async () => {
  const f = fixture(), target = f.put('Grizzly Bears');
  f.game.addCounters(target, '+1/+1', 1);
  await protect(f, target);
  await f.game.sacrifice(f.a, target);
  await f.game.flushTriggers();
  await f.game.move(target, 'exile');
  await f.game.move(target, 'graveyard');
  await settle(f.game);
  assert.equal(target.zone, 'graveyard');
});

test('Together Forever requires the counter at resolution and expires during cleanup', async () => {
  const f = fixture(), target = f.put('Grizzly Bears'), source = f.put('Together Forever');
  f.source = source;
  f.game.addCounters(target, '+1/+1', 1); f.a.pool.C = 1;
  const entry = window(f).acts.find(row => row.card === source);
  assert.equal(await f.game.activateAbility(f.a, entry, [target]), true);
  f.game.removeCounters(target, '+1/+1', 1);
  await settle(f.game);
  assert.equal(target.meta.togetherForeverTurn, undefined);
  assert.equal(f.game.delayed.length, 0);
  f.game.addCounters(target, '+1/+1', 1);
  await protect(f, target);
  assert.equal(target.meta.togetherForeverTurn, f.game.turnNo);
  f.game.runBeginningPhase = async () => {};
  f.game.combatPhase = async () => {};
  f.game.mainPhase = async () => { if (f.game.phase === 'main2') await protect(f, target); };
  await f.game.runTurn();
  assert.equal(target.meta.togetherForeverTurn, undefined);
  await f.game.sacrifice(f.a, target); await settle(f.game);
  assert.equal(target.zone, 'graveyard');
});

test('Together Forever shows its active effect on the creature, including the Live projection', async () => {
  const f = fixture(), target = f.put('Grizzly Bears');
  f.game.addCounters(target, '+1/+1', 1); await protect(f, target);
  const UI = {...M};
  runInNewContext(readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8'), {
    MTG: UI, document: {readyState: 'loading', addEventListener() {}}, window: {addEventListener() {}},
  });
  const ui = Object.assign(Object.create(UI.UI.prototype), {game: f.game});
  assert.match(ui.keywordBadgesHTML(target), /data-effect="together-forever"/);
  assert.match(ui.deathReturnState(target), /dies this turn/);
  const projected = M.onlineCardPresentation(target, f.b);
  assert.equal(projected.meta.togetherForeverTurn, f.game.turnNo);
  await f.game.move(target, 'exile');
  await f.game.putPermanentOntoBattlefield(target, f.a);
  assert.doesNotMatch(ui.keywordBadgesHTML(target), /together-forever/);
});

test('Together Forever protects the threatened creature and does not spend mana on redundant protection', async () => {
  const f = fixture('hard'), target = f.put('Grizzly Bears'), safe = f.put('Ghalta, Primal Hunger');
  const source = f.put('Together Forever');
  f.game.addCounters(target, '+1/+1', 1); f.game.addCounters(safe, '+1/+1', 1); f.a.pool.C = 3;
  assert.equal((await f.a.controller.decide(f.game, window(f))).kind, 'done');
  const removal = f.put('Murder', 'hand', f.b); f.b.pool.B = 2; f.b.pool.C = 1;
  assert.equal(await f.game.castSpell(f.b, removal, {from: 'hand', quickTargets: [target]}), true);
  const action = await f.a.controller.decide(f.game, window(f, 'priority'));
  assert.equal(action.kind, 'activate'); assert.equal(action.entry.card, source);
  assert.equal(await f.game.performAction(f.a, action), true);
  assert.equal(f.game.stack.at(-1).targets[0], target);
  await f.game.resolveTop();
  assert.ok(M.deathReturnTargetValue(f.game, f.a, target) < 0);
  await settle(f.game);
  assert.equal(target.zone, 'hand'); assert.equal(safe.zone, 'battlefield');
});

for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${difficulty}: Viscera Seer keeps valuable creatures instead of paying them for scry`, async () => {
    const f = fixture(difficulty);
    const seer = f.put('Viscera Seer'), large = f.put('Ghalta, Primal Hunger');
    for (const phase of ['main1', 'main2']) {
      f.game.phase = phase;
      const result = await f.a.controller.decide(f.game, window(f));
      assert.equal(result.kind, 'done', `${phase}: no useful sacrifice`);
    }
    assert.equal(seer.zone, 'battlefield');
    assert.equal(large.zone, 'battlefield');
  });
}

test('Viscera Seer sacrifices exactly the selected creature as cost and scries only on resolution', async () => {
  const f = fixture(), seer = f.put('Viscera Seer'), large = f.put('Ghalta, Primal Hunger');
  let scries = 0;
  const top = f.a.library.at(-1), decide = f.a.controller.decide;
  f.a.controller.decide = (g, q) => {
    if (q.type === 'chooseCards' && q.aiHint?.kind === 'sacCost') return [seer];
    if (q.type === 'scry') { scries++; return {top: [], bottom: q.cards}; }
    return decide(g, q);
  };
  const entry = window(f).acts.find(row => row.card === seer);
  assert.equal(await f.game.activateAbility(f.a, entry), true);
  assert.equal(seer.zone, 'graveyard');
  assert.equal(large.zone, 'battlefield');
  assert.equal(scries, 0);
  await settle(f.game);
  assert.equal(scries, 1);
  assert.equal(f.a.library[0], top);
  assertGameStateInvariants(f.game);
});

test('Viscera Seer chooses the doomed creature over a healthy, cheaper body', async () => {
  const f = fixture('hard'), seer = f.put('Viscera Seer'), large = f.put('Ghalta, Primal Hunger'), small = f.put('Grizzly Bears');
  const removal = f.put('Murder', 'hand', f.b); f.b.pool.B = 2; f.b.pool.C = 1;
  assert.equal(await f.game.castSpell(f.b, removal, {from: 'hand', quickTargets: [large]}), true);
  const action = await f.a.controller.decide(f.game, window(f, 'priority'));
  assert.equal(action.kind, 'activate'); assert.equal(action.entry.card, seer);
  assert.equal(await f.game.performAction(f.a, action), true);
  assert.equal(large.zone, 'graveyard'); assert.equal(small.zone, 'battlefield');
  await settle(f.game);
  assert.equal(seer.zone, 'battlefield'); assertGameStateInvariants(f.game);
});

test('Viscera Seer can use cheap fodder for actual death payoffs, then stops', async () => {
  const f = fixture('hard'), seer = f.put('Viscera Seer'), large = f.put('Ghalta, Primal Hunger');
  f.put('Blood Artist');
  const token = new M.CardInst({...M.DEFS['Grizzly Bears'], name: 'Soldier token', cost: '', power: '1', toughness: '1'}, f.a);
  token.zone = 'battlefield'; token.isToken = true; f.game.battlefield.push(token); f.game.recalc();
  const action = await f.a.controller.decide(f.game, window(f));
  assert.equal(action.kind, 'activate'); assert.equal(action.entry.card, seer);
  assert.equal(await f.game.performAction(f.a, action), true);
  await settle(f.game);
  assert.notEqual(token.zone, 'battlefield');
  assert.ok(f.b.life < 40, 'the sacrifice earns a real death-trigger payoff');
  assert.equal(large.zone, 'battlefield'); assert.equal(seer.zone, 'battlefield');
  assert.equal((await f.a.controller.decide(f.game, window(f))).kind, 'done');
  assertGameStateInvariants(f.game);
});

test('Viscera Seer does not assume every creature dies to a modal or qualified sweeper', () => {
  const f = fixture(), seer = f.put('Viscera Seer'), large = f.put('Ghalta, Primal Hunger');
  for (const name of ['Austere Command', 'Solar Tide']) {
    const card = f.put(name, 'hand', f.b);
    f.game.stack.push({kind: 'spell', card, ctrl: f.b, targets: []});
    assert.ok(M.sacrificeScryPlan(f.game, f.a).score < 0, name);
    f.game.stack.pop();
  }
  const wipe = f.put('Wrath of God', 'hand', f.b);
  f.game.stack.push({kind: 'spell', card: wipe, ctrl: f.b, targets: []});
  assert.ok(M.sacrificeScryValue(f.game, f.a, large) > 0, 'unconditional destroy-all is a real threat');
  assert.equal(seer.zone, 'battlefield');
});
