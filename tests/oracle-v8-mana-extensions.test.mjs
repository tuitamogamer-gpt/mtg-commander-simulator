import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureEngine, context, put, settle} from './helpers/oracle-v8-fixtures.mjs';
import {manaCombinations, extensionEffect} from '../scripts/oracle-v8-mana-extensions.mjs';

const M = fixtureEngine([
 ['Split mana source', '{T}, Sacrifice a Forest: Add three mana in any combination of {R} and/or {G}.'],
 ['Different mana source', '{1}, {T}: Add two mana of different colors. Spend this mana only to cast planeswalker spells.', 'Land', ''],
 ['Artifact mana source', '{T}: Add {C}{C}. Spend this mana only to cast artifact spells or activate abilities of artifacts.'],
 ['Restricted walker', '+1: Add two mana in any combination of colors. Spend this mana only to cast Dragon spells.', 'Planeswalker — Sarkhan', '{1}{R}{R}', {loyalty:'3'}],
 ['Mana Dragon', 'Flying', 'Creature — Dragon', '{1}{R}'],
 ['Graveyard mana source', '{T}: Add two mana of any one color. Spend this mana only to cast spells from your graveyard.'],
 ['Power mana source', '{T}: Add an amount of {G} equal to this creature\'s power.'],
 ['Sacrifice mana spell', 'As an additional cost to cast this spell, sacrifice a creature.\nAdd an amount of {B} equal to the sacrificed creature\'s mana value.', 'Instant', '{B}'],
]);

for (const role of ['human', 'ai']) {
 test(`${role}: power-based mana uses current power and floors negative power at zero`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Power mana source');
  ctx.game.addCounters(source, '+1/+1', 3); ctx.game.recalc();
  assert.equal(source.power, 5);
  assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{G}{G}{G}{G}{G}')), true);
  assert.equal(source.tapped, true); assert.equal(ctx.a.pool.G, 0);
  ctx.game.untap(source); ctx.game.addOracleBasePT(source, {power:-5,toughness:10,temporary:true});
  assert.equal(source.power,-2);
  assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{G}')),false);
 });
 test(`${role}: sacrificed mana value is captured when its additional cost is paid`, async () => {
  const ctx = context(M, role), creature = put(M, ctx.game, ctx.a, 'Colossal Dreadmaw');
  const spell = put(M, ctx.game, ctx.a, 'Sacrifice mana spell', 'hand'); ctx.a.pool.B = 1;
  assert.equal(await ctx.game.castSpell(ctx.a,spell,{from:'hand'}),true);
  assert.equal(creature.zone,'graveyard'); assert.equal(ctx.a.pool.B,0);
  await ctx.game.move(creature,'exile'); await settle(ctx.game);
  assert.equal(ctx.a.pool.B,6,'mana uses the sacrificed object despite later zone change');
 });
 test(`${role}: divided mana pays a real mixed-color cost and consumes its Forest exactly once`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Split mana source'), forest = put(M, ctx.game, ctx.a, 'Forest');
  forest.tapped = true;
  const descriptor = ctx.game.manaSources(ctx.a).find(s => s.card === source);
  assert.deepEqual(JSON.parse(JSON.stringify(descriptor.produce)), [{R:3},{R:2,G:1},{R:1,G:2},{G:3}]);
  assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{R}{R}{G}')), true);
  assert.equal(forest.zone, 'graveyard'); assert.equal(source.tapped, true);
  assert.equal(ctx.game.stack.length, 0); assert.equal(Object.values(ctx.a.pool).reduce((n,v)=>n+v,0),0);
 });
 test(`${role}: artifact-only mana rejects a creature ability and pays an artifact ability`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Artifact mana source');
  const artifact = put(M, ctx.game, ctx.a, 'Sol Ring'), creature = put(M, ctx.game, ctx.a, 'Grizzly Bears');
  artifact.tapped = true;
  const descriptor = ctx.game.manaSources(ctx.a).find(s => s.card === source);
  assert.equal(await ctx.game.activateManaSource(ctx.a, descriptor, {C:2}, null, []), true);
  assert.equal(ctx.game.canPayMana(ctx.a, M.parseCost('{2}'), {card:creature,isAbility:true}), false);
  assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{2}'), {card:artifact,isAbility:true}), true);
  assert.equal(ctx.a.pool.C, 0);
 });
 test(`${role}: two different colors cannot pay two identical colored pips`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Different mana source');
  const walker = put(M, ctx.game, ctx.a, Object.values(M.DEFS).find(d => d.types.includes('Planeswalker')).name, 'hand');
  ctx.a.pool.C = 1;
  assert.equal(ctx.game.canPayMana(ctx.a, M.parseCost('{U}{U}'), {card:walker}), false);
  assert.equal(await ctx.game.payMana(ctx.a, M.parseCost('{U}{R}'), {card:walker}), true);
  assert.equal(source.tapped, true); assert.equal(Object.values(ctx.a.pool).reduce((n,v)=>n+v,0),0);
 });
 test(`${role}: a mana-producing loyalty ability uses the Stack and keeps the Dragon spending restriction`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Restricted walker'); source.counters.loyalty = 3;
  const dragon = put(M, ctx.game, ctx.a, 'Mana Dragon', 'hand'), bear = put(M, ctx.game, ctx.a, 'Grizzly Bears', 'hand'); ctx.game.recalc();
  const entry = ctx.game.activatableList(ctx.a).find(r => r.card === source);
  assert.ok(entry); assert.equal(await ctx.game.activateAbility(ctx.a, entry), true);
  assert.equal(source.counters.loyalty, 4); assert.equal(ctx.game.stack.length, 1);
  assert.equal(Object.values(ctx.a.pool).reduce((n,v)=>n+v,0),0);
  await settle(ctx.game);
  assert.equal(Object.values(ctx.a.pool).reduce((n,v)=>n+v,0),2);
  assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{1}'),{card:bear}),false);
  assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{1}'),{card:source,isAbility:true}),false);
  assert.equal(await ctx.game.payMana(ctx.a,M.parseCost('{1}'),{card:dragon}),true);
 });
 test(`${role}: restricted graveyard mana distinguishes spell origins and ownership`, async () => {
  const ctx = context(M, role), source = put(M, ctx.game, ctx.a, 'Graveyard mana source');
  const own = put(M, ctx.game, ctx.a, 'Mana Dragon', 'graveyard'), foreign = put(M, ctx.game, ctx.b, 'Mana Dragon', 'graveyard');
  const descriptor = ctx.game.manaSources(ctx.a).find(s => s.card === source);
  assert.equal(await ctx.game.activateManaSource(ctx.a,descriptor,descriptor.produce[0],null,[]),true);
  assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{1}'),{card:own,from:'hand'}),false);
  assert.equal(ctx.game.canPayMana(ctx.a,M.parseCost('{1}'),{card:foreign,from:'graveyard'}),false);
  assert.equal(await ctx.game.payMana(ctx.a,M.parseCost('{1}'),{card:own,from:'graveyard'}),true);
 });
}

test('countering a mana-producing loyalty ability preserves its paid loyalty but adds no mana', async () => {
 const ctx = context(M), source = put(M,ctx.game,ctx.a,'Restricted walker'); source.counters.loyalty = 3; ctx.game.recalc();
 assert.equal(await ctx.game.activateAbility(ctx.a,ctx.game.activatableList(ctx.a).find(r=>r.card===source)),true);
 const ability = ctx.game.stack.at(-1); assert.equal(ability.kind,'ability');
 assert.equal(await ctx.game.counterStackObject(ability),true); await settle(ctx.game);
 assert.equal(source.counters.loyalty,4); assert.equal(Object.values(ctx.a.pool).reduce((n,v)=>n+v,0),0);
});

test('mana grammar rejects unsupported numbers, colors and trailing effects', () => {
 assert.equal(manaCombinations(11,['R','G']), null);
 assert.equal(manaCombinations(2,['C','G']), null);
 assert.equal(manaCombinations(2,['R','R']), null);
 assert.deepEqual(manaCombinations(6,['W','U','B','R','G'],true), []);
 assert.equal(extensionEffect({},'Add two mana of different colors. Then something magical.',{}), null);
 assert.equal(extensionEffect({},'Add any number of mana in any combination of colors.',{}), null);
});
