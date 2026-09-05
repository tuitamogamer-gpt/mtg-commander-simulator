import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';
import { context, put, settle } from './helpers/oracle-v8-fixtures.mjs';
import { untapStep } from './helpers/oracle-phasing-proof.mjs';
const M = loadEngine(), source = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-phasing-source.json', import.meta.url)));
const entries = source.map((card, i) => {
  const semantic = semanticClass(card), words = card.type_line.split(' — ')[0].split(' '); assert.ok(semantic.semanticClass, card.name);
  return { position: i + 1, oracleId: card.oracle_id, scryfallId: card.id, ...semantic,
    raw: { name: card.name, cost: card.mana_cost, oracle: card.oracle_text, types: words.filter(word => !['Legendary', 'Basic', 'Snow', 'World'].includes(word)), super: words.filter(word => ['Legendary', 'Basic', 'Snow', 'World'].includes(word)), subtypes: card.type_line.split(' — ')[1]?.split(' ') || [], power: card.power, toughness: card.toughness, _ci: card.color_identity }, catalog: { typeLine: card.type_line, commanderLegality: 'legal' } };
});
M.registerOracleBatch({ id: 'oracle-phasing-source-tests', sequence: 9993, cards: entries.filter(entry => !M.DEFS[entry.raw.name]) }); M.initData(M.RAW_DATA);
const fund = player => { for (const color of ['W', 'U', 'B', 'R', 'G', 'C']) player.pool[color] = 20; };
function testContext(role) {
  const ctx = context(M, role);
  if (role !== 'ai') {
    const decide = ctx.a.controller.decide.bind(ctx.a.controller);
    ctx.a.controller.decide = async (g, q) => q.type === 'chooseTargets' && q.min === 0 ? q.candidates.slice(0, 1) : decide(g, q);
  }
  return ctx;
}
async function cast(ctx, name) {
  fund(ctx.a); const card = put(M, ctx.game, ctx.a, name, 'hand');
  if (card.is('Land')) assert.equal(await ctx.game.playLand(ctx.a, card), true);
  else { assert.equal(await ctx.game.castSpell(ctx.a, card, { from: 'hand' }), true, name + ': actual paid cast'); await settle(ctx.game); }
  return card;
}
const direct = entries.filter(entry => entry.implementedKeywords.includes('phasing') || entry.implementation.some(operation => ['attachment-grant', 'generic-static'].includes(operation.kind) && operation.keywords?.includes('phasing')));
for (const role of ['human', 'ai']) {
  test(`${role}: Vaporous Djinn phases when its upkeep payment is unavailable and stays when the actual controller pays`, async () => {
    const ctx = testContext(role), { game, a } = ctx, card = await cast(ctx, 'Vaporous Djinn');
    for (const color of Object.keys(a.pool)) a.pool[color] = 0;
    await game.emit('upkeep', { player: a }); await settle(game); assert.equal(card.phasedOut, true);
    await untapStep(game, a); a.pool.U = 2;
    await game.emit('upkeep', { player: a }); await settle(game); assert.equal(card.phasedOut, false); assert.equal(a.pool.U, 0);
  });
  for (const won of [true, false]) test(`${role}: Frenetic Efreet's real coin ability ${won ? 'phases on a win' : 'sacrifices on a loss'}`, async () => {
    const ctx = testContext(role), { game, a } = ctx, card = await cast(ctx, 'Frenetic Efreet');
    const decide = a.controller.decide.bind(a.controller);
    a.controller.decide = async (g, q) => {
      const result = await decide(g, q);
      if (q.aiHint?.kind === 'coinCall') game.rnd = () => (result === 'heads') === won ? 0 : 0.9;
      return result;
    };
    const ability = game.activatableList(a).find(row => row.card === card && row.ability?.label.includes('Flip a coin'));
    assert.ok(ability); assert.equal(await game.activateAbility(a, ability), true); await settle(game);
    assert.equal(card.zone, won ? 'battlefield' : 'graveyard'); assert.equal(card.phasedOut, won);
  });
  for (const entry of direct) test(`${role}: ${entry.raw.name} alternates through real untap steps with attachments, counters and source identity intact`, async () => {
    const ctx = testContext(role), { game, a, b } = ctx, attached = entry.implementation.some(operation => operation.kind === 'attachment-grant');
    const host = attached ? put(M, game, a, 'Grizzly Bears') : null, card = await cast(ctx, entry.raw.name), permanent = host || card;
    if (attached) assert.equal(card.attachedTo, host.iid);
    assert.equal(permanent.kw('phasing'), true); permanent.tapped = true; game.addCounters(permanent, 'charge', 2);
    const version = permanent.zoneVersion;
    await untapStep(game, a); assert.equal(permanent.phasedOut, true); assert.equal(permanent.tapped, true); assert.equal(game.bf().includes(permanent), false);
    await untapStep(game, b); assert.equal(permanent.phasedOut, true);
    a.skipUntapOnce = true; await untapStep(game, a); assert.equal(permanent.phasedOut, true);
    await untapStep(game, a); assert.equal(permanent.phasedOut, false); assert.equal(permanent.tapped, false); assert.equal(permanent.zoneVersion, version); assert.equal(permanent.counters.charge, 2);
    if (attached) { assert.equal(card.phasedOut, false); assert.equal(card.attachedTo, host.iid); }
    if (card.is('Land')) {
      for (const color of Object.keys(a.pool)) a.pool[color] = 0;
      assert.equal(await game.payMana(a, M.parseCost('{U}{U}')), true); assert.equal(card.tapped, true);
    }
    await untapStep(game, a); assert.equal(permanent.phasedOut, true, 'the following own untap phases it out again');
  });
  for (const name of ['Blink Dog', 'Rainbow Efreet', "Teferi's Honor Guard", 'Robe of Stars', 'Vanishing', 'Vodalian Illusionist', 'Haystack']) test(`${role}: paid ${name} activation phases the precise self, attached host or selected creature until its controller untaps`, async () => {
    const ctx = testContext(role), { game, a, b } = ctx, attached = ['Robe of Stars', 'Vanishing'].includes(name), targeted = ['Vodalian Illusionist', 'Haystack'].includes(name);
    const host = attached || name === 'Haystack' ? put(M, game, a, 'Grizzly Bears') : null;
    const enemy = name === 'Vodalian Illusionist' ? put(M, game, b, 'Shivan Dragon') : null;
    const card = await cast(ctx, name); card.sick = false;
    if (name === 'Robe of Stars') { const equip = game.activatableList(a).find(row => row.card === card && row.equip); assert.ok(equip); assert.equal(await game.activateAbility(a, equip), true); await settle(game); assert.equal(card.attachedTo, host.iid); }
    fund(a); const ability = game.activatableList(a).find(row => row.card === card && row.ability?.label.includes('phases out')); assert.ok(ability);
    assert.equal(await game.activateAbility(a, ability), true); await settle(game);
    const target = attached || name === 'Haystack' ? host : enemy || card;
    assert.equal(target.phasedOut, true); assert.equal(game.bf().includes(target), false);
    const controller = target.ctrl; game.phaseInFor(controller === a ? b : a); assert.equal(target.phasedOut, true);
    await untapStep(game, controller); assert.equal(target.phasedOut, false);
    if (attached) assert.equal(card.attachedTo, target.iid);
    if (targeted) assert.ok(ctx.trace.some(row => row.q.type === 'chooseTargets' && row.result.includes(target)));
  });
  for (const name of ['Reality Ripple', 'Slip Out the Back']) test(`${role}: ${name} binds one chosen target and preserves counter-before-phasing order`, async () => {
    const ctx = testContext(role), { game, a, b } = ctx, target = put(M, game, name === 'Slip Out the Back' ? a : b, 'Grizzly Bears');
    await cast(ctx, name); assert.equal(target.phasedOut, true); assert.equal(target.counters['+1/+1'] || 0, name === 'Slip Out the Back' ? 1 : 0);
    await untapStep(game, target.ctrl); assert.equal(target.phasedOut, false);
  });
  test(`${role}: Guardian of Faith's actual ETB selects other creatures and leaves itself present`, async () => {
    const ctx = testContext(role), host = put(M, ctx.game, ctx.a, 'Shivan Dragon');
    const guardian = await cast(ctx, 'Guardian of Faith'); assert.equal(guardian.phasedOut, false); assert.equal(host.phasedOut, true);
  });
  for (const name of ['Crystal Golem', 'Renegade Silent']) test(`${role}: ${name} phases from its real end-step trigger`, async () => {
    const ctx = testContext(role), { game, a, b } = ctx, enemy = put(M, game, b, 'Grizzly Bears'), card = await cast(ctx, name);
    await game.emit('endStep', { player: a }); await settle(game); assert.equal(card.phasedOut, true);
    if (name === 'Renegade Silent') { assert.equal(card.counters['+1/+1'], 1); assert.equal(game.goadersOf(enemy).includes(a), true); }
    await untapStep(game, a); assert.equal(card.phasedOut, false);
  });
}

test('simultaneous untap returns a directly phased Aura while its same host phases out, without phasing that Aura out again', async () => {
  const ctx = context(M), { game, a } = ctx, host = put(M, game, a, 'Breezekeeper'), aura = await cast(ctx, 'Rancor');
  game.phaseOut(aura, a); await untapStep(game, a);
  assert.equal(host.phasedOut, true); assert.equal(aura.phasedOut, false); assert.equal(aura.attachedTo, host.iid);
  const power = host.power; game.recalc(); game.recalc(); assert.equal(host.power, power, 'active Aura cannot modify the absent host across recalculations');
  await untapStep(game, a); assert.equal(host.phasedOut, false); assert.equal(aura.phasedOut, false); assert.equal(host.power, Number(host.def.power) + 2);
});

test('losing phasing before untap stops the phase-out, while a formerly granted phased object still returns after the grant expires', async () => {
  const ctx = context(M), { game, a, b } = ctx, host = put(M, game, a, 'Breezekeeper');
  const frog = put(M, game, b, 'Turn to Frog', 'hand'); fund(b);
  assert.equal(await game.castSpell(b, frog, { from: 'hand', targets: [host] }), true); await settle(game);
  assert.equal(host.kw('phasing'), false); await untapStep(game, a); assert.equal(host.phasedOut, false);
  const bear = put(M, game, a, 'Grizzly Bears'); M.E.pumpUntilEOT(game, bear, 0, 0, ['phasing']); await untapStep(game, a); assert.equal(bear.phasedOut, true);
  game.untilEffects = game.untilEffects.filter(effect => effect.expires !== 'eot'); game.recalc(); await untapStep(game, a); assert.equal(bear.phasedOut, false); assert.equal(bear.kw('phasing'), false);
});
