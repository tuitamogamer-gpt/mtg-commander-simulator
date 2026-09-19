import test from 'node:test';
import assert from 'node:assert/strict';
import {setup, card, play, settle} from './helpers/c21-fixtures.mjs';

for (const role of ['human', 'ai']) {
  test(`${role}: Cayth's granted Fabricate resolves on the entering creature`, async () => {
    const f = setup(role);
    card(f, 'Cayth, Famed Mechanist');
    f.decide = (p, q) => q.type === 'chooseOption' && /^Fabricate/.test(q.prompt) ? 'c' : undefined;
    const dragon = await play(f, 'Goldspan Dragon');
    assert.equal(dragon.counters['+1/+1'], 1);
    assert.equal(dragon.power, 5);
    assert.equal(f.game.pendingTriggers.length, 0);
  });

  test(`${role}: granted Fabricate creates a Servo when its entering object has left`, async () => {
    const f = setup(role);
    card(f, 'Cayth, Famed Mechanist');
    const bear = card(f, 'Grizzly Bears', 'hand');
    await f.game.putPermanentOntoBattlefield(bear, f.a);
    await f.game.flushTriggers();
    assert.equal(f.game.stack.length, 1);
    await f.game.move(bear, 'hand');
    await settle(f.game);
    assert.equal(bear.zone, 'hand');
    assert.equal(bear.counters['+1/+1'] || 0, 0);
    assert.equal(f.game.creatures(f.a).filter(c => c.isToken && c.hasSub('Servo')).length, 1);
  });
}
