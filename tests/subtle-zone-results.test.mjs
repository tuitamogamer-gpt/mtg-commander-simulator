import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
const roles = ['human', 'easy', 'normal', 'hard'];

function context(role) {
  const trace = [];
  const game = new M.Game({ seed: 904610, paced: false, maxTurns: 10 });
  const controller = { decide: async (_game, query) => {
    if (query.type === 'priority') return { kind: 'pass' };
    if (query.type === 'main') return { kind: 'done' };
    if (query.type === 'chooseTargets') return [...query.candidates]
      .sort((a, b) => Number((a.ctrl || a) === query.src?.ctrl) - Number((b.ctrl || b) === query.src?.ctrl))
      .slice(0, query.min || 0);
    if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
    if (query.type === 'chooseOption') return query.options.find(option => option.key === 'yes')?.key ?? query.options[0]?.key;
    if (query.type === 'chooseX') return query.min || 0;
    if (query.type === 'orderTriggers') return query.triggers;
    if (query.type === 'attackers') return query.eligible.map(card => ({ card, target: query.opponents[0] }));
    if (query.type === 'blockers') return [];
    return null;
  } };
  const a = game.addPlayer('Caster', { name: 'Zone results' }, controller, role !== 'human');
  const b = game.addPlayer('Opponent', { name: 'Opponent' }, controller, false);
  if (role !== 'human') a.controller = new M.AIController(a, { difficulty: role, style: 'balanced' });
  const decide = a.controller.decide.bind(a.controller);
  a.controller.decide = async (g, query) => {
    const answer = await decide(g, query);
    trace.push({ query, answer });
    return answer;
  };
  game.turnPlayer = a; game.turnNo = 6; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  return { game, a, b, role, trace };
}

function put(ctx, owner, name, zone = 'battlefield', extra = {}) {
  const card = new M.CardInst(typeof name === 'string' ? M.DEFS[name] : {
    name: 'Zone result creature', cost: '{1}{G}', types: ['Creature'], subtypes: [], super: [],
    power: '2', toughness: '2', kws: [], oracle: '', ...name,
  }, owner);
  card.zone = zone; card.ctrl = owner; card.sick = false;
  Object.assign(card, extra);
  if (zone === 'battlefield') { ctx.game.battlefield.push(card); ctx.game.recalc(); }
  else owner[zone].push(card);
  return card;
}

async function settle(ctx) {
  let rounds = 0;
  while ((ctx.game.stack.length || ctx.game.pendingTriggers.length) && rounds++ < 50) {
    await ctx.game.flushTriggers();
    if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.ok(rounds < 50, 'stack settles without a trigger loop');
  assert.equal((ctx.game.aiDecisionLog || []).some(row => row.fallback), false, 'local AI does not fall back');
}

async function cast(ctx, name, pool, { pilot = false, resolve = true } = {}) {
  const spell = put(ctx, ctx.a, name, 'hand');
  Object.assign(ctx.a.pool, pool);
  let action = { from: 'hand' };
  if (pilot && ctx.role !== 'human') {
    action = await ctx.a.controller.decide(ctx.game, {
      type: 'main', player: ctx.a, phase: ctx.game.phase,
      casts: ctx.game.castableList(ctx.a), acts: [], lands: [],
    });
    assert.equal(action.kind, 'cast', 'the real local AI chooses this cast: ' + JSON.stringify(ctx.game.aiDecisionLog?.at(-1)));
    assert.equal(action.card, spell);
  }
  assert.equal(await ctx.game.castSpell(ctx.a, spell, action), true);
  assert.equal(spell.zone, 'stack');
  assert.equal(ctx.game.stack.at(-1).card, spell);
  assert.equal(Object.values(ctx.a.pool).reduce((sum, n) => sum + n, 0), 0, 'printed mana cost is paid');
  if (resolve) await settle(ctx);
  return spell;
}

async function whaleAttack(ctx, response) {
  const whale = await cast(ctx, 'Colossal Whale', { U: 2, C: 5 });
  whale.sick = false;
  const victim = put(ctx, ctx.b, { name: 'Whale victim', power: '1', toughness: '1' });
  let announced = false;
  ctx.game.priorityRound = async () => {
    const ability = ctx.game.stack.at(-1);
    if (!announced && ability?.ctx?.src === whale) {
      announced = true;
      assert.deepEqual(Array.from(ability.targets), [victim], 'attack trigger announces the defending player creature');
      if (response) await response({ whale, victim, ability });
    }
    await settle(ctx);
  };
  await ctx.game.combatPhase(ctx.a);
  assert.equal(announced, true, 'normal combat declaration puts the Whale trigger on the stack');
  assert.ok(ctx.trace.some(entry => entry.query.type === 'attackers' && entry.answer.some(attack => attack.card === whale)),
    'the human/local AI controller declares the Whale attack');
  return { whale, victim };
}

for (const role of roles) {
  test(`Decree of Pain ${role}: a dying Blood Artist sees every simultaneous death before the draw resolves`, async () => {
    const ctx = context(role);
    const artist = put(ctx, ctx.a, 'Blood Artist');
    put(ctx, ctx.b, 'Grave Titan');
    put(ctx, ctx.b, 'Sun Titan');
    put(ctx, ctx.b, 'Inferno Titan');
    for (let n = 0; n < 8; n++) put(ctx, ctx.a, 'Forest', 'library');
    await cast(ctx, 'Decree of Pain', { B: 2, C: 6 }, { pilot: true, resolve: false });
    await ctx.game.resolveTop();
    assert.equal(artist.zone, 'graveyard');
    assert.equal(ctx.a.hand.length, 4, 'draws once per destroyed creature');
    const deaths = ctx.game.stack.filter(trigger => trigger.ctx?.src === artist);
    assert.equal(deaths.length, 4, 'Blood Artist triggers for itself and all three other simultaneous deaths');
    assert.equal(ctx.a.life, 40, 'death triggers resolve only after the spell has finished drawing');
    await settle(ctx);
    assert.equal(ctx.a.life, 44);
    assert.equal(ctx.b.life, 36);
  });

  test(`Decree of Pain ${role}: indestructible and shield protection do not increase the number drawn`, async () => {
    const ctx = context(role);
    const safe = put(ctx, ctx.b, { name: 'Indestructible victim', kws: ['indestructible'] });
    const shielded = put(ctx, ctx.b, { name: 'Shielded victim' });
    ctx.game.addCounters(shielded, 'shield', 1);
    const regenerated = put(ctx, ctx.b, { name: 'Regeneration cannot prevent this destruction' });
    regenerated.regenShield = 1;
    const doomed = put(ctx, ctx.b, { name: 'Unprotected victim' });
    for (let n = 0; n < 8; n++) put(ctx, ctx.a, 'Forest', 'library');
    await cast(ctx, 'Decree of Pain', { B: 2, C: 6 });
    assert.equal(ctx.a.hand.length, 2);
    assert.equal(safe.zone, 'battlefield');
    assert.equal(shielded.zone, 'battlefield');
    assert.equal(shielded.counters.shield || 0, 0);
    assert.equal(regenerated.zone, 'graveyard');
    assert.equal(doomed.zone, 'graveyard');
  });

  if (role === 'easy') continue;

  for (const blink of [false, true]) {
    test(`Colossal Whale ${role}: source ${blink ? 'blink' : 'removal'} in response never exiles its target`, async () => {
      const ctx = context(role);
      const { whale, victim } = await whaleAttack(ctx, async ({ whale }) => {
        await ctx.game.move(whale, blink ? 'exile' : 'graveyard');
        if (blink) await ctx.game.move(whale, 'battlefield', { ctrl: ctx.a });
      });
      assert.equal(victim.zone, 'battlefield', 'CR 610.3b: an already-ended duration cannot begin');
      assert.equal(whale.zone, blink ? 'battlefield' : 'graveyard');
    });
  }

  test(`Colossal Whale ${role}: leaving returns the exiled creature immediately without a stack window`, async () => {
    const ctx = context(role);
    const { whale, victim } = await whaleAttack(ctx);
    assert.equal(victim.zone, 'exile');
    await ctx.game.move(whale, 'graveyard');
    assert.equal(victim.zone, 'battlefield', 'CR 610.3: return is an immediate one-shot effect');
    assert.equal(victim.ctrl, victim.owner);
    assert.equal(ctx.game.pendingTriggers.some(trigger => /Whale releases/.test(trigger.name)), false);
  });

  test(`Colossal Whale ${role}: it cannot return a card that left and reentered exile`, async () => {
    const ctx = context(role);
    const { whale, victim } = await whaleAttack(ctx);
    assert.equal(victim.zone, 'exile');
    const exiledVersion = victim.zoneVersion;
    await ctx.game.move(victim, 'hand');
    await ctx.game.move(victim, 'exile');
    assert.notEqual(victim.zoneVersion, exiledVersion);
    await ctx.game.move(whale, 'graveyard');
    await settle(ctx);
    assert.equal(victim.zone, 'exile', 'CR 400.7: the later exile is a different object');
  });
}
