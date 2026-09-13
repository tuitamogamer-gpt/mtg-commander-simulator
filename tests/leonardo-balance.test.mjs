import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
const offers = f => f.trace.filter(row => row.q.aiHint?.kind === 'optTrigger');
const counters = card => card.counters['+1/+1'] || 0;

for (const role of ['human', 'ai']) {
  test(`${role}: Leonardo applies counters only once across queued batches of five tokens`, async () => {
    const f = context(M, role), { game, a, b } = f;
    const leonardo = put(M, game, a, 'Leonardo, the Balance');
    const opponent = put(M, game, b, 'Grizzly Bears');
    const tokens = [];
    for (let batch = 0; batch < 3; batch++) tokens.push(...await game.makeTokens('ninjaB', a, { n: 5 }));
    await game.flushTriggers();
    assert.equal(offers(f).length, 0, 'the optional effect waits for resolution');
    await settle(game);
    assert.equal(counters(leonardo), 1);
    assert.equal(offers(f).length, 1, 'remaining queued triggers do not offer an already used effect');
    assert.ok(tokens.every(card => counters(card) === 1));
    assert.equal(counters(opponent), 0);

    const later = await game.makeTokens('ninjaB', a, { n: 5 });
    await settle(game);
    assert.equal(offers(f).length, 1, 'later token entries cannot reuse the effect this turn');
    assert.equal(counters(leonardo), 1);
    assert.ok(later.every(card => counters(card) === 0));
  });

  test(`${role}: Leonardo can be used again on each player's turn, including for artifact tokens`, async () => {
    const f = context(M, role, 2), { game, a, b } = f;
    const leonardo = put(M, game, a, 'Leonardo, the Balance');
    await game.makeTokens('food', b, { n: 5 });
    const nontoken = put(M, game, a, 'Grizzly Bears', 'hand');
    await game.move(nontoken, 'battlefield', { ctrl: a });
    await settle(game);
    assert.equal(offers(f).length, 0, 'opponent tokens and your nontoken entries do not qualify');

    for (const [index, active] of game.players.entries()) {
      game.turnNo++;
      game.turnPlayer = active;
      await game.makeTokens('food', a, { n: 5 });
      await settle(game);
      assert.equal(counters(leonardo), index + 1);
      assert.equal(offers(f).length, index + 1);
      await game.makeTokens('ninjaB', a, { n: 5 });
      await settle(game);
      assert.equal(offers(f).length, index + 1);
    }
  });

  test(`${role}: copied Leonardo triggers share the same once-per-turn use`, async () => {
    const f = context(M, role), { game, a } = f;
    const leonardo = put(M, game, a, 'Leonardo, the Balance');
    await game.makeTokens('food', a);
    await game.flushTriggers();
    assert.equal(game.stack.length, 1);
    await game.copyStackAbility(game.stack[0], a);
    await settle(game);
    assert.equal(counters(leonardo), 1);
    assert.equal(offers(f).length, 1);
  });

  test(`${role}: countering Leonardo's trigger does not consume its optional effect`, async () => {
    const f = context(M, role), { game, a } = f;
    const leonardo = put(M, game, a, 'Leonardo, the Balance');
    await game.makeTokens('food', a);
    await game.flushTriggers();
    assert.equal(await game.counterStackObject(game.stack[0]), true);
    assert.equal(offers(f).length, 0);
    await game.makeTokens('ninjaB', a, { n: 5 });
    await settle(game);
    assert.equal(counters(leonardo), 1);
    assert.equal(offers(f).length, 1);
  });

  for (const returns of [false, true]) {
    test(`${role}: Leonardo's queued triggers retain their use limit when its source ${returns ? 'blinks' : 'leaves'}`, async () => {
      const f = context(M, role), { game, a } = f;
      const leonardo = put(M, game, a, 'Leonardo, the Balance');
      const tokens = await game.makeTokens('ninjaB', a, { n: 5 });
      await game.flushTriggers();
      await game.move(leonardo, 'exile');
      if (returns) {
        await game.move(leonardo, 'battlefield', { ctrl: a });
        tokens.push(...await game.makeTokens('ninjaB', a, { n: 5 }));
      }
      await settle(game);
      const uses = returns ? 2 : 1;
      assert.equal(offers(f).length, uses);
      assert.ok(tokens.every(card => counters(card) === uses));
      assert.equal(counters(leonardo), returns ? 2 : 0);
      await game.makeTokens('food', a);
      await settle(game);
      assert.equal(offers(f).length, uses, 'an old trigger cannot reset the returned source or reuse its own effect');
    });
  }

  test(`${role}: Leonardo sees the token entering from a copied permanent spell`, async () => {
    const f = context(M, role), { game, a } = f;
    const leonardo = put(M, game, a, 'Leonardo, the Balance');
    const bears = put(M, game, a, 'Grizzly Bears', 'hand');
    a.pool.G = 1;
    a.pool.C = 1;
    assert.equal(await game.castSpell(a, bears, { from: 'hand' }), true);
    await game.copySpell(game.stack.find(so => so.card === bears), a);
    await settle(game);
    assert.equal(a.turnState.tokensCreated, 0, 'a resolving spell copy is not token creation');
    assert.equal(game.creatures(a).filter(card => card.isToken).length, 1);
    assert.equal(counters(leonardo), 1, 'Leonardo cares about token entry');
    assert.equal(offers(f).length, 1);
  });
}

test('Leonardo lets a player decline one token entry and use another from the same batch', async () => {
  const f = context(M), { game, a } = f;
  const leonardo = put(M, game, a, 'Leonardo, the Balance');
  let offered = 0;
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = (g, q) => {
    if (q.aiHint?.kind === 'optTrigger') return ++offered === 1 ? 'no' : 'yes';
    return decide(g, q);
  };
  const tokens = await game.makeTokens('ninjaB', a, { n: 5 });
  await game.flushTriggers();
  assert.equal(game.stack.length, 5, 'each entering token triggers separately');
  assert.equal(offered, 0);
  await settle(game);
  assert.equal(offered, 2, 'declining does not use the effect; accepting stops further prompts');
  assert.equal(counters(leonardo), 1);
  assert.ok(tokens.every(card => counters(card) === 1));
});
