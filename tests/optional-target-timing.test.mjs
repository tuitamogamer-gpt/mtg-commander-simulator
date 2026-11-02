import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function table(role = 'human') {
  const trace = [], game = new M.Game({seed: 903, paced: false});
  const f = {game, trace, choice: null, target: null};
  const human = {decide: async (g, q) => {
    const selected = await f.choice?.(q);
    if (selected !== undefined) return selected;
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'main') return {kind: 'done'};
    if (q.type === 'chooseTargets') return f.target && q.candidates.includes(f.target) ? [f.target] : q.candidates.slice(0, q.min || 0);
    if (q.type === 'chooseOption') return q.aiHint?.kind === 'optTrigger' ? 'no' : q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'chooseX') return q.min || 0;
    if (q.type === 'orderTriggers') return q.triggers;
    return null;
  }};
  f.a = game.addPlayer('You', {name: 'Your deck'}, human, role === 'ai');
  f.b = game.addPlayer('Opponent', {name: 'Their deck'}, human, false);
  if (role === 'ai') f.a.controller = new M.AIController(f.a, {difficulty: 'hard', style: 'balanced'});
  const decide = f.a.controller.decide.bind(f.a.controller);
  f.a.controller.decide = async (g, q) => {
    const row = {q}; trace.push(row); row.answer = await decide(g, q); return row.answer;
  };
  game.turnPlayer = f.a; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.pace = async () => {}; game.priorityRound = async () => {}; game.revealToHuman = async () => {};
  f.put = (name, owner = f.a, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], name);
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); game.recalc(); return card;
  };
  for (const p of game.players) for (let i = 0; i < 8; i++) f.put('Island', p, 'library');
  f.cast = async (name = 'Phyrexian Ingester') => {
    const card = f.put(name, f.a, 'hand'); f.a.pool.U = 20; f.a.pool.C = 20;
    assert.equal(await game.castSpell(f.a, card, {from: 'hand'}), true);
    assert.ok(Object.values(f.a.pool).reduce((a, b) => a + b, 0) < 40, 'the actual cast pays mana');
    await game.resolveTop(); return card;
  };
  return f;
}
const targetChoices = f => f.trace.filter(row => row.q.type === 'chooseTargets');
const optionalChoices = f => f.trace.filter(row => row.q.aiHint?.kind === 'optTrigger');

test('Ingester explains its required target before a separate optional resolution and waits for No', async () => {
  const f = table(), victim = f.put('Grizzly Bears', f.b); f.target = victim;
  const ingester = await f.cast();
  const q = targetChoices(f)[0].q;
  assert.equal(q.min, 1); assert.equal(q.max, 1);
  assert.equal(q.optionalEffect.choiceTiming, 'resolution');
  assert.equal(q.optionalEffect.name, 'Exile a nontoken creature');
  assert.equal(q.cancelable, false, 'the required target is not converted to an optional target');
  const wire = value => JSON.parse(JSON.stringify(value));
  const descriptor = wire(M.onlineDecisionDescriptor(f.game, q, f.a, 'optional-target'));
  const model = new M.OnlineArenaView();
  model.update(wire(M.onlineGameViewFor(f.game, f.a)), f.a.idx);
  const remote = model.decision(descriptor);
  assert.equal(remote.min, 1); assert.equal(remote.max, 1);
  assert.deepEqual(wire(remote.optionalEffect), {name: 'Exile a nontoken creature', choiceTiming: 'resolution'});
  assert.equal(optionalChoices(f).length, 0, 'may is not decided while putting the trigger on the stack');
  assert.equal(f.game.stack.at(-1).targets[0], victim);
  assert.equal(victim.zone, 'battlefield', 'announcing a target does not exile it');
  let answer, resolved = false;
  f.choice = query => query.aiHint?.kind === 'optTrigger' ? new Promise(resolve => {answer = resolve;}) : undefined;
  const resolving = f.game.resolveTop().then(() => {resolved = true;});
  for (let i = 0; i < 20 && !answer; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof answer, 'function'); assert.equal(resolved, false);
  assert.equal(victim.zone, 'battlefield'); assert.equal(ingester.zone, 'battlefield');
  assert.deepEqual(Array.from(optionalChoices(f)[0].q.options, option => option.key), ['yes', 'no']);
  answer('no'); await resolving;
  assert.equal(victim.zone, 'battlefield'); assert.equal(ingester.power, 3);
  assert.equal(optionalChoices(f).length, 1); assert.equal(f.game.stack.length, 0);
});

test('the only legal target can be Ingester itself and declining keeps it on the battlefield', async () => {
  const f = table(), ingester = await f.cast();
  assert.deepEqual(Array.from(targetChoices(f)[0].q.candidates), [ingester]);
  assert.equal(f.game.stack.at(-1).targets[0], ingester);
  await f.game.resolveTop();
  assert.equal(optionalChoices(f)[0].answer, 'no');
  assert.equal(ingester.zone, 'battlefield'); assert.equal(ingester.power, 3);
  assert.equal(f.a.exile.length, 0); assert.equal(f.game.pendingTriggers.length, 0);
});

test('accepting Ingester after target selection exiles that target and grants its actual stats', async () => {
  const f = table(), victim = f.put('Grizzly Bears', f.b); f.target = victim;
  f.choice = q => q.aiHint?.kind === 'optTrigger' ? 'yes' : undefined;
  const ingester = await f.cast();
  assert.equal(victim.zone, 'battlefield');
  await f.game.resolveTop();
  assert.equal(victim.zone, 'exile'); assert.equal(ingester.power, 5); assert.equal(ingester.toughness, 5);
  assert.equal(optionalChoices(f).length, 1);
});

test('Ingester with no legal target is removed from the stack without an impossible choice', async () => {
  const f = table();
  const norn = f.put('Elesh Norn, Grand Cenobite', f.b);
  const boots = f.put('Lightning Greaves', f.b); await f.game.attach(boots, norn);
  f.put("Night of Souls' Betrayal", f.b);
  const ingester = await f.cast();
  assert.equal(norn.kw('shroud'), true);
  assert.equal(ingester.zone, 'graveyard', 'the entered 3/3 has zero toughness after the existing static effects');
  assert.equal(targetChoices(f).length, 0); assert.equal(optionalChoices(f).length, 0);
  assert.equal(f.game.stack.length, 0); assert.equal(f.game.pendingTriggers.length, 0);
});

test('a target that leaves before resolution makes Ingester fizzle without asking Yes or No', async () => {
  const f = table(), victim = f.put('Grizzly Bears', f.b); f.target = victim;
  const ingester = await f.cast();
  await f.game.move(victim, 'hand');
  await f.game.resolveTop();
  assert.equal(victim.zone, 'hand'); assert.equal(ingester.zone, 'battlefield');
  assert.equal(optionalChoices(f).length, 0); assert.equal(f.game.stack.length, 0);
});

test('mandatory targeted triggers receive no optional-effect metadata or decline prompt', async () => {
  const f = table(), source = await f.cast("Man-o'-War");
  assert.equal(targetChoices(f)[0].q.min, 1);
  assert.equal(targetChoices(f)[0].q.optionalEffect, undefined);
  await f.game.resolveTop();
  assert.equal(source.zone, 'hand'); assert.equal(optionalChoices(f).length, 0);
});

for (const opposingTarget of [false, true]) test(`AI Ingester ${opposingTarget ? 'accepts an opposing target' : 'declines its only self target'}`, async () => {
  const f = table('ai');
  const victim = opposingTarget ? f.put('Colossal Dreadmaw', f.b) : null;
  const ingester = await f.cast();
  assert.equal(f.game.stack.at(-1).targets[0], victim || ingester);
  await f.game.resolveTop();
  assert.equal(optionalChoices(f)[0].answer, opposingTarget ? 'yes' : 'no');
  assert.equal(ingester.zone, 'battlefield');
  assert.equal(ingester.power, opposingTarget ? 9 : 3);
  if (victim) assert.equal(victim.zone, 'exile');
  assert.equal(f.game.stack.length, 0); assert.equal(f.game.pendingTriggers.length, 0);
  assert.equal((f.game.aiDecisionLog || []).some(row => row.fallback), false);
});
