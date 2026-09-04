import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function fallback(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function fixture(role) {
  const game = new MTG.Game({ seed: 90427, paced: false, maxTurns: 10 });
  const player = game.addPlayer('Caster', { name: 'Identity audit' }, null, role === 'ai');
  const opponent = game.addPlayer('Opponent', { name: 'Identity opponent' }, null, false);
  const context = { game, player, opponent, target: null, targetChoices: [] };
  player.controller = role === 'ai' ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (_game, query) => query.type === 'chooseTargets' && query.candidates.includes(context.target)
      ? [context.target] : fallback(query) };
  opponent.controller = { decide: async (_game, query) => fallback(query) };
  const decide = player.controller.decide.bind(player.controller);
  player.controller.decide = async (currentGame, query) => {
    const result = await decide(currentGame, query);
    if (query.type === 'chooseTargets') context.targetChoices.push(result);
    return result;
  };
  game.turnPlayer = player;
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  for (const owner of [player, opponent]) for (let i = 0; i < 20; i++) card(context, owner, 'Island', 'library');
  return context;
}

function card(context, owner, definition, zone = 'battlefield') {
  const permanent = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : {
    name: 'Identity creature', cost: null, super: [], types: ['Creature'], subtypes: [],
    power: '3', toughness: '5', kws: [], oracle: '', ...definition,
  }, owner);
  permanent.zone = zone;
  permanent.ctrl = owner;
  permanent.sick = false;
  (zone === 'battlefield' ? context.game.battlefield : owner[zone]).push(permanent);
  context.game.recalc();
  return permanent;
}

async function settle(context) {
  let iterations = 0;
  while ((context.game.stack.length || context.game.pendingTriggers.length) && iterations++ < 30) {
    await context.game.flushTriggers();
    if (context.game.stack.length) await context.game.resolveTop();
  }
  assert.ok(iterations < 30, 'announced spell and triggered abilities finish resolving');
}

async function cast(context, name) {
  const spell = card(context, context.player, name, 'hand');
  const pool = name === 'Subterfuge' ? { U: 1, C: 4 }
    : name === 'Heroic Intervention' ? { G: 1, C: 1 } : { W: 1, C: 1 };
  Object.assign(context.player.pool, pool);
  assert.equal(await context.game.castSpell(context.player, spell, { from: 'hand' }), true);
  assert.equal(spell.zone, 'stack');
  assert.equal(Object.values(context.player.pool).reduce((sum, value) => sum + value, 0), 0, 'pays the printed mana cost');
  await settle(context);
  return spell;
}

async function blink(context, permanent) {
  const version = permanent.zoneVersion;
  await context.game.move(permanent, 'exile');
  await context.game.move(permanent, 'battlefield', { ctrl: permanent.owner });
  assert.notEqual(permanent.zoneVersion, version);
}

async function cleanup(context) {
  context.game.mainPhase = async () => {};
  context.game.combatPhase = async () => {};
  await context.game.runTurn();
  assert.equal(context.game.phase, 'cleanup', 'the real turn reaches ordinary cleanup');
  await settle(context);
}

async function combat(context, attacker, defender, resolve = true) {
  attacker.attacking = defender;
  attacker.sick = false;
  context.game.combat = { attackers: [attacker], defenders: new Map() };
  await context.game.combatDamage(attacker.ctrl, 'normal');
  if (resolve) await settle(context);
}

for (const role of ['human', 'ai']) {
  test(`${role}: Heroic Intervention protects its original permanents but not a blinked object`, async () => {
    const context = fixture(role);
    const original = card(context, context.player, { name: 'Blink subject' });
    const unchanged = card(context, context.player, { name: 'Unchanged subject' });
    await cast(context, 'Heroic Intervention');
    assert.equal(original.kw('hexproof'), true);
    assert.equal(original.kw('indestructible'), true);
    const removal = new MTG.CardInst(MTG.DEFS.Terminate, context.opponent);
    const targets = () => context.game.legalTargets(MTG.DEFS.Terminate.targets[0], removal, context.opponent);
    assert.equal(targets().includes(original), false);
    await blink(context, original);
    assert.equal(original.kw('hexproof'), false, 'CR 400.7: the returned creature has no old hexproof');
    assert.equal(original.kw('indestructible'), false);
    assert.equal(targets().includes(original), true, 'opponents can target the returned creature');
    assert.equal(unchanged.kw('hexproof'), true);
    assert.equal(unchanged.kw('indestructible'), true);
    const newcomer = card(context, context.player, { name: 'New arrival' });
    assert.equal(newcomer.kw('hexproof'), false);
    await cleanup(context);
    assert.equal(unchanged.kw('hexproof'), false);
    assert.equal(unchanged.kw('indestructible'), false);
  });

  test(`${role}: Heroic Sacrifice redirects lethal damage and transfers the dying object's counters`, async () => {
    const context = fixture(role);
    context.target = card(context, context.player, { name: 'Shield', toughness: '3' });
    const shield = context.target;
    context.game.addCounters(shield, '+1/+1', 2);
    context.game.addCounters(shield, 'charge', 3);
    await cast(context, 'Heroic Sacrifice');
    assert.equal(context.targetChoices[0][0]?.iid, shield.iid);
    const recipient = context.target = card(context, context.player, { name: 'Counter recipient' });
    const source = card(context, context.opponent, { name: 'Damage source' });
    await context.game.damagePlayer(source, context.player, 6);
    await settle(context);
    assert.equal(context.player.life, 40);
    assert.equal(shield.zone, 'graveyard');
    assert.equal(recipient.counters['+1/+1'], 2);
    assert.equal(recipient.counters.charge, 3);
    assert.equal(context.player.hand.length, 1);
  });

  test(`${role}: Heroic Sacrifice neither redirects to nor rewards the death of a blinked new object`, async () => {
    const context = fixture(role);
    const shield = context.target = card(context, context.player, { name: 'Blink shield' });
    await cast(context, 'Heroic Sacrifice');
    await blink(context, shield);
    const recipient = context.target = card(context, context.player, { name: 'Counter recipient' });
    const source = card(context, context.opponent, { name: 'Damage source' });
    context.game.addCounters(shield, 'charge', 3);
    await context.game.damagePlayer(source, context.player, 2);
    assert.equal(context.player.life, 38, 'the old shield cannot redirect damage after returning');
    assert.equal(shield.damage, 0);
    await context.game.sacrifice(context.player, shield);
    await settle(context);
    assert.equal(recipient.counters.charge || 0, 0, 'the new object has no old death reward');
    assert.equal(context.player.hand.length, 0);
  });

  test(`${role}: Heroic Sacrifice expires in ordinary cleanup`, async () => {
    const context = fixture(role);
    const shield = context.target = card(context, context.player, { name: 'Cleanup shield' });
    await cast(context, 'Heroic Sacrifice');
    await cleanup(context);
    const handCount = context.player.hand.length;
    const source = card(context, context.opponent, { name: 'Damage source' });
    await context.game.damagePlayer(source, context.player, 2);
    await context.game.sacrifice(context.player, shield);
    await settle(context);
    assert.equal(context.player.life, 38);
    assert.equal(context.player.hand.length, handCount);
  });

  test(`${role}: Subterfuge grants combat draw only to the original creature until cleanup`, async () => {
    const context = fixture(role);
    context.target = card(context, context.player, { name: 'Combat subject', cost: '{8}{G}{G}', power: '6', toughness: '9' });
    await cast(context, 'Subterfuge');
    const subject = context.targetChoices[0][0];
    const damage = subject.power;
    assert.equal(subject.kw('flying'), true);
    await combat(context, subject, context.opponent);
    assert.equal(context.player.hand.length, damage, 'ordinary combat draws the actual damage dealt');
    await blink(context, subject);
    assert.equal(subject.kw('flying'), false);
    await combat(context, subject, context.opponent);
    assert.equal(context.player.hand.length, damage, 'blinking removes the granted draw ability');
  });

  test(`${role}: Subterfuge's granted ability belongs to the creature's controller when damage happens`, async () => {
    const context = fixture(role);
    context.target = card(context, context.player, { name: 'Stolen subject', cost: '{8}{G}{G}', power: '6', toughness: '9' });
    await cast(context, 'Subterfuge');
    const subject = context.targetChoices[0][0];
    const damage = subject.power;
    subject.ctrl = context.opponent;
    context.game.recalc();
    await combat(context, subject, context.player, false);
    await context.game.flushTriggers();
    assert.equal(context.game.stack.length, 1);
    assert.equal(context.game.stack[0].ctrl.idx, context.opponent.idx, 'CR 603.3a: the creature controller controls its granted trigger');
    subject.ctrl = context.player;
    context.game.recalc();
    await settle(context);
    assert.equal(context.opponent.hand.length, damage, 'changing control after triggering does not change who draws');
    assert.equal(context.player.hand.length, 0);
  });

  test(`${role}: Subterfuge's flying and combat draw both end in ordinary cleanup`, async () => {
    const context = fixture(role);
    const subject = context.target = card(context, context.player, { name: 'Cleanup combat subject', cost: '{8}{G}{G}', power: '6', toughness: '9' });
    await cast(context, 'Subterfuge');
    await cleanup(context);
    const handCount = context.player.hand.length;
    assert.equal(subject.kw('flying'), false);
    await combat(context, subject, context.opponent);
    assert.equal(context.player.hand.length, handCount);
  });

  for (const name of ['Patriot, Shield Wielder', 'Plaza of Heroes']) {
    test(`${role}: ${name} pays its activation cost and does not protect a blinked new object`, async () => {
      const context = fixture(role);
      const source = card(context, context.player, name);
      const target = context.target = card(context, context.player, { name: 'Protected legend', super: ['Legendary'] });
      context.player.pool.C = name === 'Plaza of Heroes' ? 3 : 2;
      let sacrificedSource = 0;
      const emit = context.game.emit.bind(context.game);
      context.game.emit = async (event, data) => {
        if (event === 'sacrificed' && data.card === source) sacrificedSource++;
        return emit(event, data);
      };
      const ability = source.def.abilities[0];
      assert.equal(await context.game.activateAbility(context.player, { card: source, ability }), true);
      assert.equal(context.player.pool.C, 0);
      if (name === 'Plaza of Heroes') {
        assert.equal(source.zone, 'exile', 'Plaza exiles itself as a cost');
        assert.equal(sacrificedSource, 0, 'exiling Plaza is not a sacrifice');
      } else assert.equal(source.tapped, true);
      await settle(context);
      assert.equal(target.kw('hexproof'), true);
      if (name === 'Plaza of Heroes') assert.equal(target.kw('indestructible'), true);
      else assert.equal(target.power, 5);
      await blink(context, target);
      assert.equal(target.kw('hexproof'), false, 'the returned new object has no old protection');
      assert.equal(target.kw('indestructible'), false);
      assert.equal(target.power, 3);
    });
  }
}
