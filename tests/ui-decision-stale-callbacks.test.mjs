import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTable, until, button} from './helpers/ui-decision-fixtures.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

test('a detached ordinary option callback cannot answer the next human decision', async () => {
  const f = decisionTable();
  const first = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'first', label: 'First'}]});
  const old = button(f, 'First'); old.click(); assert.equal(await first, 'first');
  let answered = false;
  const second = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'second', label: 'Second'}]})
    .then(value => {answered = true; return value;});
  const pending = f.ui.pending;
  old.click(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.ui.pending, pending, 'an earlier callback must not consume the new question');
  assert.equal(answered, false);
  button(f, 'Second').click(); assert.equal(await second, 'second');
});

test('a stale modal selection or Confirm callback cannot mutate or resolve the next chosen modes', async () => {
  const f = decisionTable();
  const q = {type: 'chooseMulti', min: 1, max: 2, options: [{key: 'draw', label: 'Draw a card'}]};
  const first = f.me.controller.decide(f.game, q);
  const oldPick = button(f, 'Draw a card'); oldPick.click();
  const oldConfirm = button(f, /^Confirm/); oldConfirm.click(); assert.deepEqual([...await first], ['draw']);
  const second = f.me.controller.decide(f.game, {...q, options: [{key: 'bounce', label: 'Return a creature'}]});
  button(f, 'Return a creature').click();
  const pending = f.ui.pending;
  oldPick.click(); oldConfirm.click();
  assert.equal(f.ui.pending, pending);
  assert.deepEqual([...pending.sel], ['bounce']);
  button(f, /^Confirm/).click(); assert.deepEqual([...await second], ['bounce']);
});

test('a stale Rolling Thunder split callback leaves the next allocation awaiting its own answer', async () => {
  const f = decisionTable();
  const lands = ['Mountain', 'Mountain', ...Array(5).fill('Wastes')].map(name => f.put(name));
  const left = f.put('Colossal Dreadmaw', 'battlefield', f.rival), right = f.put('Colossal Dreadmaw', 'battlefield', f.rival);
  const spell = f.put('Rolling Thunder', 'hand');
  const cast = f.game.castSpell(f.me, spell, {from: 'hand'});
  await until(() => f.ui.pending?.q.type === 'chooseX');
  f.ui.pending.xVal = 5; f.ui.render(); button(f, /^Confirm X=5/).click();
  await until(() => f.ui.pending?.q.type === 'chooseTargets');
  f.ui.pending.sel = [left, right, f.rival]; f.ui.render(); button(f, /^Lock/).click();
  await until(() => f.ui.pending?.q.allocation?.index === 0);
  const oldConfirm = button(f, /^Assign 1 to target 1/); oldConfirm.click();
  await until(() => f.ui.pending?.q.allocation?.index === 1);
  const pending = f.ui.pending;
  oldConfirm.click(); await new Promise(resolve => setImmediate(resolve));
  assert.ok(f.ui.pending === pending, 'the first target cannot silently assign damage to the second target');
  f.ui.pending.xVal = 3; f.ui.render(); button(f, /^Assign 3 to target 2/).click();
  await until(() => f.ui.pending?.q.allocation?.index === 2);
  button(f, /^Lock complete split/).click();
  assert.equal(await cast, true);
  assert.deepEqual([left.damage, right.damage], [1, 3]);
  assert.equal(f.rival.life, 39);
  assert.equal(spell.zone, 'graveyard');
  assert.ok(lands.every(card => card.tapped), 'the native spell pays its actual five generic and two red mana');
  assert.equal(spell.castMeta.manaSpent, 7);
  assert.equal(f.ui.pending, null);
  assertGameStateInvariants(f.game, 'native paid Rolling Thunder with three independently confirmed allocations');
});

test('stale target chips and confirmation leave the current selected target intact', async () => {
  const f = decisionTable(), target = f.put('Colossal Dreadmaw', 'battlefield', f.rival);
  const q = {type: 'chooseTargets', candidates: [target], min: 1, max: 1, prompt: 'First target'};
  const first = f.me.controller.decide(f.game, q);
  f.ui.pending.sel = [target]; f.ui.render();
  const oldChip = f.root.querySelector('.targetpickchip'), oldConfirm = button(f, /^Lock/);
  oldConfirm.click(); assert.deepEqual((await first).map(card => card.iid), [target.iid]);
  const second = f.me.controller.decide(f.game, {...q, prompt: 'Second target'});
  f.ui.pending.sel = [target]; f.ui.render();
  const pending = f.ui.pending;
  oldChip.click(); oldConfirm.click();
  assert.ok(f.ui.pending === pending);
  assert.deepEqual(pending.sel.map(card => card.iid), [target.iid], 'the old remove chip must not edit a new target selection');
  button(f, /^Lock/).click(); assert.deepEqual((await second).map(card => card.iid), [target.iid]);
});

test('a delegated visual option still belongs to its original pending question', async () => {
  const f = decisionTable(), card = f.put('Grizzly Bears');
  const first = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'first', label: 'First card', card}]});
  const old = f.root.querySelector('[data-choice-key="first"]');
  old.click(); assert.equal(await first, 'first');
  const second = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'second', label: 'Second card', card}]});
  const pending = f.ui.pending;
  old.click(); assert.ok(f.ui.pending === pending);
  f.root.querySelector('[data-choice-key="second"]').click(); assert.equal(await second, 'second');
});

test('an already removed explicit entry cannot clear the current sheet or redraw another decision', async () => {
  const f = decisionTable();
  const first = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'first', label: 'First'}]});
  const removed = f.ui.pending;
  button(f, 'First').click(); await first;
  const second = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'second', label: 'Second'}]});
  const pending = f.ui.pending, sheet = {card: 'current sheet'};
  f.ui.sheet = sheet;
  let redraws = 0;
  const render = f.ui.render;
  f.ui.render = function (...args) {redraws++; return render.apply(this, args);};
  f.ui.resolvePendingEntry(removed, 'first');
  assert.ok(f.ui.pending === pending);
  assert.equal(f.ui.sheet, sheet);
  assert.equal(redraws, 0);
  button(f, 'Second').click(); assert.equal(await second, 'second');
});
