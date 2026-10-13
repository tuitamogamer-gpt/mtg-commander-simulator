import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTable, until, button} from './helpers/ui-decision-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

function priorityTable() {
  const f = decisionTable();
  f.ui.renderArena = function () {
    f.root.replaceChildren();
    const modal = this.renderDecisionModal(f.game);
    f.root.appendChild(modal || this.renderPromptBar(f.game));
  };
  return f;
}

test('a stale priority ninjutsu button preserves the native attacker choice and its one paid activation', async () => {
  const f = priorityTable();
  f.ui.prioMode = 'full';
  const attacker = f.put('Grizzly Bears'), ninja = f.put('Ninja of the Deep Hours', 'hand');
  const lands = [f.put('Island'), f.put('Island')];
  f.game.phase = 'combat'; f.game.step = 'blockers';
  f.game.combat = {attackers: [attacker], blockersDeclared: true};
  attacker.attacking = f.rival; f.game.recordCombatDestination(attacker);
  const round = f.game.priorityRound(f.me);
  await until(() => f.ui.pending?.q.type === 'priority');
  assert.ok(f.ui.pending.q.acts.some(entry => entry.card === ninja && entry.ninjutsu));
  const old = button(f, /Ninja of the Deep Hours.*Ninjutsu/);
  old.click();
  await until(() => f.ui.pending?.q.aiHint?.kind === 'ninjutsuReturn');
  const choice = f.ui.pending;
  old.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.ui.pending === choice, 'the old activation cannot answer the next attacker-choice question');
  assert.equal(ninja.zone, 'hand'); assert.equal(attacker.zone, 'battlefield');
  assert.ok(lands.every(card => !card.tapped));
  f.ui.prioMode = 'off';
  f.root.querySelector('.cardgrid .bigcard').click();
  button(f, /^Confirm/).click();
  await round;
  assert.equal(attacker.zone, 'hand');
  assert.equal(ninja.zone, 'battlefield');
  assert.equal(ninja.tapped, true); assert.equal(ninja.attacking, f.rival);
  assert.ok(f.game.combat.attackers.includes(ninja));
  assert.ok(lands.every(card => card.tapped), 'one printed {1}{U} ninjutsu payment');
  assert.equal(f.game.stack.length, 0); assert.equal(f.ui.pending, null);
  assert.equal(f.game.log.filter(row => row.msg.includes('Ninja of the Deep Hours — Ninjutsu (')).length, 1);
  assertGameStateInvariants(f.game, 'one native ninjutsu after stale priority callback');
});

test('an old full-control Proceed does not pass the next native priority question', async () => {
  const f = priorityTable();
  f.ui.prioMode = 'full';
  f.put('Opt', 'hand'); f.put('Island');
  const first = f.game.askPriorityAction(f.me);
  const old = button(f, /^Proceed/); old.click();
  assert.equal((await first).kind, 'pass');
  let resolved = false;
  const second = f.game.askPriorityAction(f.me).then(value => {resolved = true; return value;});
  const entry = f.ui.pending;
  old.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.ui.pending === entry); assert.equal(resolved, false);
  button(f, /^Proceed/).click(); assert.equal((await second).kind, 'pass');
});

test('old reaction Proceed and Respond controls cannot pass or take a newer native response window', async () => {
  const f = priorityTable();
  f.ui.prioMode = 'auto';
  f.game.turnPlayer = f.rival; f.game.phase = 'combat'; f.game.step = 'blockers';
  const opt = f.put('Opt', 'hand'); f.put('Island');
  const first = f.game.askPriorityAction(f.me);
  assert.ok(f.ui.react?.q.casts.some(entry => entry.card === opt));
  const oldProceed = button(f, /^Proceed/), oldRespond = button(f, /RESPOND/);
  oldProceed.click(); assert.equal((await first).kind, 'pass');
  let resolved = false;
  const second = f.game.askPriorityAction(f.me).then(value => {resolved = true; return value;});
  const reaction = f.ui.react;
  oldRespond.click(); oldProceed.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.ui.react === reaction); assert.equal(f.ui.pending, null); assert.equal(resolved, false);
  button(f, /RESPOND/).click();
  assert.equal(f.ui.react, null); assert.ok(f.ui.pending.q === reaction.q);
  button(f, /^Proceed/).click(); assert.equal((await second).kind, 'pass');
});

test('an old visible action stage cannot pass or take responses to a second paid opposing spell', async () => {
  const f = priorityTable();
  f.ui.prioMode = 'auto'; f.ui.actionStageDismissed = new WeakSet();
  f.game.turnPlayer = f.rival;
  const opt = f.put('Opt', 'hand'), island = f.put('Island');
  const lands = Array.from({length: 4}, () => f.put('Forest', 'battlefield', f.rival));
  const one = f.put('Grizzly Bears', 'hand', f.rival), two = f.put('Grizzly Bears', 'hand', f.rival);
  const first = f.game.castSpell(f.rival, one, {from: 'hand'});
  await until(() => !!f.ui.react);
  const oldStage = f.ui.renderActionStage(f.game);
  const oldProceed = oldStage.querySelector('button.primary'), oldRespond = oldStage.querySelector('button.actionrespond');
  oldProceed.click(); assert.equal(await first, true);
  const second = f.game.castSpell(f.rival, two, {from: 'hand'});
  await until(() => !!f.ui.react);
  const reaction = f.ui.react;
  assert.ok(reaction.q.casts.some(entry => entry.card === opt));
  oldProceed.click(); oldRespond.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.ui.react === reaction, 'the second paid spell still awaits its own response');
  assert.equal(f.ui.pending, null); assert.equal(two.zone, 'stack');
  f.ui.renderActionStage(f.game).querySelector('button.actionrespond').click();
  assert.ok(f.ui.pending.q === reaction.q); assert.equal(f.ui.react, null);
  button(f, /^Proceed/).click(); assert.equal(await second, true);
  assert.equal(one.zone, 'battlefield'); assert.equal(two.zone, 'battlefield');
  assert.ok(lands.every(card => card.tapped), 'both opposing creature spells paid their native two mana');
  assert.equal(opt.zone, 'hand'); assert.equal(island.tapped, false);
  assert.equal(f.game.stack.length, 0); assert.equal(f.ui.pending, null);
  assertGameStateInvariants(f.game, 'two independently acknowledged native opposing spells');
});
