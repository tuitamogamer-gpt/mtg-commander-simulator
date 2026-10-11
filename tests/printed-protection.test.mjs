import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function huntedCentaurs() {
  const f = nativeFixture('human', 10112051);
  const horror = await f.cast('Hunted Horror', ['Swamp', 'Swamp']);
  const centaurs = f.game.bf().filter(card => card.isToken && card.hasSub('Centaur'));
  assert.equal(centaurs.length, 2);
  assert.ok(centaurs.every(card => card.ctrl === f.rival));
  return Object.assign(f, {horror, centaurs});
}

test('paid Hunted Horror creates Centaurs protected from black targeting but still vulnerable to white exile', async () => {
  const f = await huntedCentaurs();
  const murder = f.put('Murder', 'hand');
  assert.ok(f.centaurs.every(card => !f.game.legalTargets(murder.def.targets[0], murder, f.me).includes(card)),
    'the printed protection excludes black spells from the actual target menu');
  f.targets = q => q.candidates.includes(f.centaurs[0]) ? [f.centaurs[0]] : undefined;
  await f.cast('Swords to Plowshares', ['Plains']);
  assert.equal(f.centaurs[0].zone, 'ceased');
  assert.equal(f.centaurs[1].zone, 'battlefield');
  assert.equal(f.rival.life, 43);
});

test('native Pestilence damage is prevented by token protection, which Dress Down removes and restores', async () => {
  const f = await huntedCentaurs();
  const pestilence = await f.cast('Pestilence', ['Swamp', 'Swamp', 'Wastes', 'Wastes']);
  for (let n = 0; n < 3; n++) await f.activate(pestilence, ['Swamp']);
  assert.ok(f.centaurs.every(card => card.zone === 'battlefield' && card.damage === 0));
  assert.equal(f.horror.damage, 3, 'the black source still damages an unprotected creature');
  const dress = await f.cast('Dress Down', ['Island', 'Wastes']);
  await f.activate(pestilence, ['Swamp']);
  assert.ok(f.centaurs.every(card => card.damage === 1));
  f.targets = q => q.candidates.includes(dress) ? [dress] : undefined;
  await f.cast('Disenchant', ['Plains', 'Wastes']);
  await f.activate(pestilence, ['Swamp']);
  assert.ok(f.centaurs.every(card => card.zone === 'battlefield' && card.damage === 1),
    'the printed protection returns after the ability-removing enchantment leaves');
});

test('Cybernetica Datasmith retains its printed protection from damage by its native Robot token', async () => {
  const f = nativeFixture('human', 10112052);
  const smith = await f.cast('Cybernetica Datasmith', ['Island', 'Swamp', 'Wastes']);
  await f.game.runBeginningPhase(f.me);
  f.game.phase = 'main1'; f.game.step = 'main';
  f.targets = q => q.candidates.includes(f.me) ? [f.me] : q.candidates.includes(f.rival) ? [f.rival] : undefined;
  await f.activate(smith, ['Island']);
  const robot = f.game.bf().find(card => card.isToken && card.hasSub('Robot'));
  assert.ok(robot);
  assert.equal(robot.ctrl, f.rival);
  await f.game.damageAny(robot, smith, robot.power, {combat: true});
  await f.game.checkSBA();
  assert.equal(smith.zone, 'battlefield');
  assert.equal(smith.damage, 0);
});

test('Reaver Titan protection rejects low mana value removal while a paid four-mana spell can exile it', async () => {
  const f = nativeFixture('human', 10112053);
  const titan = await f.cast('Reaver Titan', Array(7).fill('Wastes'));
  const disenchant = f.put('Disenchant', 'hand');
  assert.equal(f.game.legalTargets(disenchant.def.targets[0], disenchant, f.me).includes(titan), false);
  f.targets = q => q.candidates.includes(titan) ? [titan] : undefined;
  await f.cast('Return to Dust', ['Plains', 'Plains', 'Wastes', 'Wastes']);
  assert.equal(titan.zone, 'exile');
});
