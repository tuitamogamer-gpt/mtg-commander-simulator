import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function fixture(style = 'balanced') {
  const game = new M.Game({seed: 8233, paced: false}); game.pace = async () => {};
  // Keep the announced spell on the Stack for inspection, then resolve it
  // explicitly. The initial askPriorityAction and target decisions stay native.
  game.priorityRound = async () => {};
  const pass = {decide: async (_game, q) => q.type === 'priority' ? {kind: 'pass'}
    : q.type === 'orderTriggers' ? q.triggers : q.type === 'chooseOption' ? q.options[0]?.key : []};
  const player = game.addPlayer('AI Raven', {name: 'Peer Through Time'}, null, true);
  const opponent = game.addPlayer('Attacker', {name: 'Opponent'}, pass, false);
  const other = game.addPlayer('AI Dragon', {name: 'Other opponent'}, pass, false);
  const ai = player.controller = new M.AIController(player, {difficulty: 'normal', style});
  player.aiStyle = style;
  game.turnNo = 8; game.turnPlayer = opponent; game.phase = 'combat'; game.step = 'attackers';
  game.combat = {attackers: [], blockersDeclared: false};
  const add = (name, owner = player, zone = 'battlefield') => {
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card); game.recalc(); return card;
  };
  const spell = add('Domineering Will', player, 'hand');
  for (let i = 0; i < 4; i++) add('Island');
  const attack = (name = 'Colossal Dreadmaw', defender = player) => {
    const card = add(name, opponent); card.attacking = defender; card.tapped = true;
    game.combat.attackers.push(card); return card;
  };
  const question = type => ({type, player, casts: game.castableList(player), acts: [], lands: [], stack: game.stack, phase: game.phase});
  return {game, player, opponent, other, ai, spell, add, attack, question};
}
const rules = f => plain({life: f.game.players.map(p => p.life), pool: f.player.pool,
  board: f.game.bf().map(card => [card.iid, card.ctrl.idx, card.zone, card.tapped, card.damage]),
  hand: f.player.hand.map(card => card.iid), effects: f.game.untilEffects.length, stack: f.game.stack.length});

test('AI holds the legally castable zero-creature spell in early main and combat priority windows', async () => {
  for (const style of ['balanced', 'josh', 'jimmy']) for (const phase of ['main1', 'combat']) {
    const f = fixture(style); f.game.phase = phase;
    if (phase === 'main1') {f.game.turnPlayer = f.player; f.game.step = 'main';}
    const type = phase === 'main1' ? 'main' : 'priority', q = f.question(type);
    assert.ok(q.casts.some(entry => entry.card === f.spell), 'rules keep zero-creature casts legal');
    const before = rules(f), action = type === 'priority' ? await f.game.askPriorityAction(f.player) : await f.ai.decide(f.game, q);
    assert.equal(action.kind, type === 'main' ? 'done' : 'pass', `${style}/${phase}`);
    assert.deepEqual(rules(f), before, 'AI evaluation neither spends mana nor changes the battlefield');
    assert.ok(f.ai.castScore(f.game, q.casts.find(entry => entry.card === f.spell)) < 0);
    assert.equal(f.ai.priorityAction(f.game, {...q, type: 'priority'}).kind, 'pass', 'legacy fallback also holds');
  }
});

test('existing targets do not justify spending the card when they cannot improve defense', async () => {
  for (const scenario of ['no attackers', 'other defender', 'cannot block flying', 'already defended', 'blocks already declared']) {
    const f = fixture(); f.player.life = 4;
    f.add('Grizzly Bears', f.other);
    if (scenario === 'other defender') f.attack('Colossal Dreadmaw', f.other);
    else if (scenario === 'cannot block flying') f.attack('Serra Angel');
    else if (scenario === 'already defended') {f.attack('Grizzly Bears'); f.add('Darksteel Colossus');}
    else if (scenario === 'blocks already declared') {f.attack(); f.game.combat.blockersDeclared = true; f.game.step = 'blockers';}
    const before = rules(f);
    assert.equal((await f.game.askPriorityAction(f.player)).kind, 'pass', scenario);
    assert.deepEqual(rules(f), before, scenario);
  }
});

test('AI casts to borrow real blockers for itself, then survives native combat damage', async () => {
  const f = fixture('josh'); f.player.life = 4;
  const attacker = f.attack(), angel = f.add('Serra Angel', f.other), bear = f.add('Grizzly Bears', f.other);
  angel.tapped = true; bear.tapped = true;
  const before = rules(f), action = await f.game.askPriorityAction(f.player);
  assert.equal(action.kind, 'cast'); assert.equal(action.card, f.spell); assert.deepEqual(rules(f), before);
  assert.equal(await f.game.performAction(f.player, action), true);
  const spell = f.game.stack.find(row => row.card === f.spell);
  assert.equal(spell.targets[0], f.player, 'beneficiary is the defending bot, not another opponent');
  assert.ok(spell.targets[1].length > 0 && spell.targets[1].length <= 3);
  assert.ok(spell.targets[1].every(card => card === angel || card === bear));
  const borrowed = spell.targets[1].slice();
  await f.game.resolveTop();
  for (const card of borrowed) {
    assert.equal(card.ctrl, f.player); assert.equal(card.tapped, false); assert.equal(card.cur.mustBlock, true);
  }
  f.game.step = 'blockers';
  const blocks = await f.ai.decide(f.game, {type: 'blockers', player: f.player,
    attackers: [attacker], potential: f.game.creatures(f.player), phase: 'combat'});
  assert.ok(f.game.blockDeclarationLegal([attacker], blocks));
  attacker.blockedBy = blocks.map(pair => pair.blocker); attacker.wasBlocked = blocks.length > 0;
  for (const {blocker} of blocks) blocker.blocking = attacker.iid;
  f.game.combat.blockersDeclared = true;
  await f.game.combatDamage(f.opponent, 'normal');
  assert.ok(f.player.life > 0 && !f.player.lost, 'the useful defensive cast actually prevents lethal damage');
});

test('AI may untap its own exhausted blocker when that prevents a lethal attack', async () => {
  const f = fixture(); f.player.life = 2; f.attack('Grizzly Bears');
  const blocker = f.add('Serra Angel'); blocker.tapped = true;
  const action = await f.game.askPriorityAction(f.player);
  assert.equal(action.kind, 'cast'); assert.equal(await f.game.performAction(f.player, action), true);
  const spell = f.game.stack.find(row => row.card === f.spell);
  assert.equal(spell.targets[0], f.player); assert.deepEqual(Array.from(spell.targets[1]), [blocker]);
  await f.game.resolveTop(); assert.equal(blocker.ctrl, f.player); assert.equal(blocker.tapped, false);
});

test('human player-only casting with zero creatures remains legal and pays the normal cost', async () => {
  const f = fixture(); f.player.isAI = false;
  f.player.controller = {decide: async (_game, q) => {
    return q.type === 'chooseTargets' ? q.candidates.includes(f.other) ? [f.other] : []
      : q.type === 'chooseManaSources' ? {auto: true}
      : q.type === 'chooseOption' ? q.options[0]?.key : [];
  }};
  assert.equal(await f.game.castSpell(f.player, f.spell, {from: 'hand'}), true);
  const spell = f.game.stack.find(row => row.card === f.spell);
  assert.equal(spell.targets[0], f.other); assert.deepEqual(Array.from(spell.targets[1]), []);
  assert.ok(f.game.lands(f.player).every(card => card.tapped));
  await f.game.resolveTop(); assert.equal(f.spell.zone, 'graveyard');
  assert.equal(f.game.creatures(f.player).length, 0);
});
