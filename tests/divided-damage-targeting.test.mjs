import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function rulesGame(selectionSize, amounts) {
  const allocationPrompts = [];
  let selected = [];
  const game = new MTG.Game({ seed: 814603, paced: false, maxTurns: 20 });
  const human = game.addPlayer('Human', { name: 'Family Matters' }, {
    decide: async (g, q) => {
      if (q.type === 'chooseTargets') return selected.slice(0, selectionSize);
      if (q.type === 'chooseX' && q.allocation?.kind === 'damage') {
        allocationPrompts.push(q);
        return amounts[q.allocation.index];
      }
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  }, false);
  const opponent = game.addPlayer('Opponent', { name: 'Target deck' }, {
    decide: async (g, q) => q.type === 'priority' ? { kind: 'pass' } : null,
  }, true);
  game.turnPlayer = human;
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';

  const titan = new MTG.CardInst(MTG.DEFS['Inferno Titan'], human);
  titan.ctrl = human; titan.zone = 'battlefield'; titan.sick = false;
  game.battlefield.push(titan);
  const first = new MTG.CardInst(MTG.DEFS['Stormcatch Mentor'], opponent);
  first.ctrl = opponent; first.zone = 'battlefield'; first.sick = false;
  const second = new MTG.CardInst(MTG.DEFS['Ignoble Hierarch'], opponent);
  second.ctrl = opponent; second.zone = 'battlefield'; second.sick = false;
  game.battlefield.push(first, second);
  game.recalc();
  selected = [first, second, opponent];
  return { game, human, opponent, titan, first, second, allocationPrompts };
}

test('Inferno Titan bira jednu, dvije ili tri različite mete i zaključava tačno tri damage-a', async () => {
  const trigger = MTG.DEFS['Inferno Titan'].triggers.find(entry => entry.on === 'etb');
  assert.equal(trigger.targets[0].min, 1);
  assert.equal(trigger.targets[0].count, 3);

  for (const scenario of [
    { size: 1, amounts: [3], expected: [3] },
    { size: 2, amounts: [2, 1], expected: [2, 1] },
    { size: 3, amounts: [1, 1, 1], expected: [1, 1, 1] },
  ]) {
    const { game, titan, allocationPrompts } = rulesGame(scenario.size, scenario.amounts);
    await game.emit('etb', { card: titan });
    await game.flushTriggers();
    const stacked = game.stack.at(-1);
    assert.ok(stacked, `Inferno Titan trigger mora biti na stacku za ${scenario.size} mete`);
    assert.deepEqual(Array.from(stacked.damageDivision, entry => entry.n), scenario.expected);
    assert.equal(stacked.damageDivision.reduce((sum, entry) => sum + entry.n, 0), 3);
    assert.equal(allocationPrompts.length, scenario.size, 'i zadnja, prisilna raspodjela mora imati vizuelni review');
    assert.equal(allocationPrompts.at(-1).min, allocationPrompts.at(-1).max);
    assert.deepEqual(allocationPrompts.map(q => q.allocation.assigned.length),
      Array.from({ length: scenario.size }, (_, index) => index));
    assert.equal(allocationPrompts.every(q => q.allocation.total === 3 && q.allocation.targets.length === scenario.size), true);
  }
});

test('Inferno Titan primjenjuje podijeljenu štetu svim legalnim metama pa tek onda radi SBA', async () => {
  const { game, opponent, titan, first, second } = rulesGame(3, [1, 1, 1]);
  const lifeBefore = opponent.life;
  first.damage = Math.max(0, first.toughness - 1);
  second.damage = Math.max(0, second.toughness - 1);
  await game.emit('etb', { card: titan });
  await game.flushTriggers();
  await game.resolveTop();

  assert.equal(first.zone, 'graveyard');
  assert.equal(second.zone, 'graveyard');
  assert.equal(opponent.life, lifeBefore - 1);
});

test('targeting UI sadrži numerisane target markere, reverzibilan review i damage-allocation panel', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const ui = fs.readFileSync(`${root}/src/modules/ui.js`, 'utf8');
  const css = fs.readFileSync(`${root}/src/styles.css`, 'utf8');

  assert.match(ui, /dataset\.testid = 'target-selection'/);
  assert.match(ui, /markSelectedTarget\(node, target\)/);
  assert.match(ui, /dataset\.testid = 'damage-allocation'/);
  assert.match(ui, /Lock complete split/);
  assert.match(css, /\.target-selected/);
  assert.match(css, /\.damageallocationmodal/);
  assert.match(css, /\.actionstagedamagetarget/);
});
