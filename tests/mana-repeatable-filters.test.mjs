import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {context, put, settle} from './helpers/oracle-v8-fixtures.mjs';

const M = loadEngine();
M.initData(M.RAW_DATA);

for (const role of ['human', 'ai']) {
  test(`${role}: Prismite repeatedly converts floating mana and preserves an unaffordable pool`, async () => {
    for (const [cost, available, expected] of [
      ['{G}{G}', 4, true], ['{G}{G}', 3, false],
      ['{W}{U}{B}{R}{G}', 10, true], ['{W}{U}{B}{R}{G}', 9, false],
    ]) {
      const ctx = context(M, role), filter = put(M, ctx.game, ctx.a, 'Prismite');
      filter.sick = true;
      ctx.a.pool.C = available;
      assert.equal(ctx.game.canPayMana(ctx.a, M.parseCost(cost)), expected);
      assert.equal(ctx.a.pool.C, available, 'affordability probes do not spend mana');
      assert.equal(await ctx.game.payMana(ctx.a, M.parseCost(cost)), expected);
      assert.equal(Object.values(ctx.a.pool).reduce((sum, value) => sum + value, 0), expected ? 0 : available);
      assert.equal(filter.tapped, false, 'Prismite has no tap cost');
    }
  });

  test(`${role}: a real main-phase cast pays two activations of the same Prismite`, async () => {
    const ctx = context(M, role), filter = put(M, ctx.game, ctx.a, 'Prismite');
    const spell = put(M, ctx.game, ctx.a, 'Kalonian Tusker', 'hand');
    filter.sick = true;
    ctx.a.pool.C = 4;
    const casts = ctx.game.castableList(ctx.a);
    assert.ok(casts.some(row => row.card === spell));
    if (role === 'ai') {
      const decision = await ctx.a.controller.decide(ctx.game, {
        type:'main', player:ctx.a, casts, acts:[], lands:[], phase:'main1',
      });
      assert.equal(decision.kind, 'cast');
      assert.equal(decision.card, spell);
    }
    assert.equal(await ctx.game.castSpell(ctx.a, spell, {from:'hand'}), true);
    await settle(ctx.game);
    assert.equal(spell.zone, 'battlefield');
    assert.equal(ctx.a.pool.C, 0);
    assert.equal(filter.tapped, false);
  });

  test(`${role}: a tapped converter still activates only once per payment`, async () => {
    const ctx = context(M, role), signet = put(M, ctx.game, ctx.a, 'Azorius Signet');
    ctx.a.pool.C = 3;
    assert.equal(ctx.game.canPayMana(ctx.a, M.parseCost('{W}{W}{U}{U}')), false);
    assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{W}{W}{U}{U}')), false);
    assert.equal(ctx.a.pool.C, 3);
    assert.equal(signet.tapped, false);
    assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{W}{U}')), true);
    assert.equal(ctx.a.pool.C, 2);
    assert.equal(signet.tapped, true);
  });
}
