import assert from 'node:assert/strict';
import { put, settle } from './oracle-v8-fixtures.mjs';
const colors = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
function context(M, role, h) {
  const ctx = h.gameFor(M, [h.decision(), h.decision()], { ai: role === 'ai' });
  h.assertControllerRole(M, ctx, 'land-types/' + role);
  for (const player of [ctx.a, ctx.b]) h.fillLibrary(M, player, 30);
  return ctx;
}
async function enter(M, ctx, name) {
  const source = put(M, ctx.game, ctx.a, name, 'hand');
  for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) ctx.a.pool[color] = 20;
  if (source.is('Land')) assert.equal(await ctx.game.playLand(ctx.a, source), true);
  else { assert.equal(await ctx.game.castSpell(ctx.a, source, { from: 'hand' }), true); await settle(ctx.game); }
  assert.equal(source.zone, 'battlefield');
  for (const color of Object.keys(ctx.a.pool)) ctx.a.pool[color] = 0;
  return source;
}
export async function landTypesProof(M, entry, operation, role, h) {
  const ctx = context(M, role, h), { game, a, b } = ctx, label = entry.raw.name + '/' + role;
  const host = put(M, game, a, "Mishra's Factory"), source = await enter(M, ctx, entry.raw.name);
  if (operation.attached) assert.equal(source.attachedTo, host.iid, label + ': actual Aura cast chose the land');
  assert.equal(host.cur.super.includes('Basic'), false, label + ': subtype change does not make a basic land');
  for (const type of operation.types) {
    assert.equal(host.hasSub(type), true, label + ': live subtype ' + type);
    for (const permanent of game.bf()) if (permanent.ctrl === a) permanent.tapped = permanent !== host;
    const color = colors[type], cost = M.parseCost('{' + color + '}');
    assert.equal(game.canPayMana(a, cost), true, label + ': exact new color can be paid');
    assert.equal(await game.payMana(a, cost), true); assert.equal(host.tapped, true); assert.equal(a.pool[color], 0);
    assert.equal(game.stack.length, 0, label + ': intrinsic mana does not use Stack');
  }
  host.tapped = false; a.pool.C = 1;
  assert.ok(game.activatableList(a).some(row => row.card === host && row.ability?.label.includes('2/2')), label + ': printed animation remains available');
  const enemy = put(M, game, b, 'Wastes');
  for (const type of operation.types) assert.equal(enemy.hasSub(type), !operation.attached && operation.filters[0].controller === 'any', label + ': exact controller scope');
  await game.move(source, 'exile');
  for (const type of operation.types) assert.equal(host.hasSub(type), false, label + ': source removal restores old types');
  assert.equal(game.manaSources(a).some(row => row.card === host && row.produce.some(output => Object.keys(output).some(color => color !== 'C'))), false, label + ': intrinsic colors expire with source');
  return operation.types.length * 6 + 6;
}
export async function attackKeywordsProof(M, entry, operation, role, h) {
  const ctx = context(M, role, h), { game, a } = ctx, host = put(M, game, a, 'Grizzly Bears');
  const source = await enter(M, ctx, entry.raw.name); assert.equal(game.canAttackAtAll(host), false);
  for (const keyword of operation.attackRequiresKeywords) {
    M.E.pumpUntilEOT(game, host, 0, 0, [keyword]); assert.equal(game.canAttackAtAll(host), true);
    game.untilEffects = game.untilEffects.filter(effect => effect.expires !== 'eot'); game.recalc(); assert.equal(game.canAttackAtAll(host), false);
  }
  await game.move(source, 'exile'); assert.equal(game.canAttackAtAll(host), true);
  return 6;
}
