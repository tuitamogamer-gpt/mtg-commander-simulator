import test from 'node:test';
import assert from 'node:assert/strict';
import {M, nativeFixture} from './helpers/second-trigger-fixtures.mjs';

async function councilWithTwins(role) {
  const f = nativeFixture(role, 10112026);
  const council = await f.cast('Council of Reeds', ['Island', 'Wastes', 'Wastes']);
  const first = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  const second = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  assert.equal(first.zone, 'battlefield');
  assert.equal(second.zone, 'battlefield', 'the active Council really suspends the legend rule');
  f.cards = q => q.aiHint?.kind === 'legendKeep' && q.from.includes(second) ? [second] : undefined;
  return Object.assign(f, {council, twins: [first, second]});
}

for (const role of ['human', 'ai']) {
  for (const [spell, lands] of [
    ['Dress Down', ['Island', 'Wastes']],
    ['Humility', ['Plains', 'Plains', 'Wastes', 'Wastes']],
  ]) {
    test(`${role}: paid ${spell} removes Council of Reeds' legend-rule exemption`, async () => {
      const f = await councilWithTwins(role);
      await f.cast(spell, lands);
      assert.equal(f.council.cur.abilitiesDisabled, true);
      assert.equal(f.twins.filter(c => c.zone === 'battlefield').length, 1,
        'the legend rule applies as soon as Council loses its static ability');
      assert.equal(f.twins.filter(c => c.zone === 'graveyard').length, 1);
      if (role === 'human') assert.equal(f.twins[1].zone, 'battlefield', 'the player keeps the selected legend');
    });
  }

  test(`${role}: paid Song of the Dryads removes the Council exemption and removal restores it`, async () => {
    const f = await councilWithTwins(role);
    f.targets = q => q.candidates.includes(f.council) ? [f.council] : undefined;
    const song = await f.cast('Song of the Dryads', ['Forest', 'Wastes', 'Wastes']);
    assert.equal(f.council.is('Land'), true);
    assert.equal(f.council.cur.abilitiesDisabled, true);
    assert.equal(f.twins.filter(c => c.zone === 'battlefield').length, 1);
    f.targets = q => q.candidates.includes(song) ? [song] : undefined;
    await f.cast('Disenchant', ['Plains', 'Wastes']);
    assert.equal(song.zone, 'graveyard');
    assert.equal(!!f.council.cur.abilitiesDisabled, false);
    const third = await f.cast('Isamaru, Hound of Konda', ['Plains']);
    assert.equal(third.zone, 'battlefield');
    assert.equal(f.game.creatures(f.me).filter(c => c.name === third.name).length, 2,
      'restoring Council restores its actual printed exception');
  });
}

test('Dress Down leaves the active Mirror Box legend-rule exception intact', async () => {
  const f = nativeFixture('human', 10112027);
  await f.cast('Mirror Box', ['Wastes', 'Wastes', 'Wastes']);
  const first = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  const second = await f.cast('Isamaru, Hound of Konda', ['Plains']);
  await f.cast('Dress Down', ['Island', 'Wastes']);
  assert.equal(first.zone, 'battlefield');
  assert.equal(second.zone, 'battlefield', 'the noncreature source keeps its ability');
});

test('native AI does not spend Twinflame on a legend after Council loses its ability', async () => {
  const f = nativeFixture('human', 10112028);
  const council = await f.cast('Council of Reeds', ['Island', 'Wastes', 'Wastes']);
  const rootha = await f.cast('Rootha, Mastering the Moment', ['Island', 'Mountain', 'Wastes', 'Wastes']);
  f.targets = q => q.candidates.includes(council) ? [council] : undefined;
  await f.cast('Song of the Dryads', ['Forest', 'Wastes', 'Wastes']);
  const spell = f.put('Twinflame', 'hand');
  f.put('Mountain'); f.put('Mountain');
  f.me.isAI = true;
  f.me.controller = new M.AIController(f.me, {difficulty: 'normal', style: 'balanced'});
  const casts = f.game.castableList(f.me);
  assert.ok(casts.some(entry => entry.card === spell), 'the cast is legal and affordable');
  const decision = await f.me.controller.decide(f.game, {
    type: 'main', player: f.me, casts, acts: [], lands: [], phase: f.game.phase,
  });
  assert.equal(decision.kind, 'done', 'copying Rootha would immediately lose a copy to the legend rule');
  assert.equal(spell.zone, 'hand');
  assert.equal(rootha.zone, 'battlefield');
});
