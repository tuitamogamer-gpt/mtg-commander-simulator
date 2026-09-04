import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const roles = ['human', 'easy', 'normal', 'hard'];

function fallback(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min ?? 1).map(option => option.key);
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function fixture(role) {
  const game = new MTG.Game({ seed: 90426, paced: false, maxTurns: 10 });
  const player = game.addPlayer('Slice caster', { name: 'Elven Council' }, null, role !== 'human');
  const opponent = game.addPlayer('Slice opponent', { name: 'Opponent' }, { decide: async (_game, query) => fallback(query) }, false);
  player.controller = role === 'human'
    ? { decide: async (_game, query) => fallback(query) }
    : new MTG.AIController(player, { difficulty: role, style: 'balanced' });
  const targetQuestions = [];
  const decide = player.controller.decide.bind(player.controller);
  player.controller.decide = async (currentGame, query) => {
    if (query.type === 'chooseTargets') targetQuestions.push(query);
    return decide(currentGame, query);
  };
  game.turnPlayer = player;
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  // Pause automatic priority progression so a real announced stack object
  // can receive responses before the normal resolveTop path runs.
  game.priorityRound = async () => {};
  player.pool.G = 1;
  player.pool.C = 2;
  const spell = new MTG.CardInst(MTG.DEFS['Windswift Slice'], player);
  spell.zone = 'hand';
  player.hand.push(spell);
  return { game, player, opponent, spell, targetQuestions };
}

function permanent(ctx, owner, definition) {
  const card = new MTG.CardInst(typeof definition === 'string' ? MTG.DEFS[definition] : {
    name: 'Slice fixture', cost: null, types: ['Creature'], subtypes: [],
    super: [], power: '1', toughness: '1', kws: [], oracle: '', ...definition,
  }, owner);
  card.zone = 'battlefield';
  card.ctrl = owner;
  card.sick = false;
  ctx.game.battlefield.push(card);
  ctx.game.recalc();
  return card;
}

function creatures(ctx, sourceOverrides = {}, targetOverrides = {}) {
  const source = permanent(ctx, ctx.player, {
    name: 'Slice source Elf', power: '5', toughness: '5', subtypes: ['Elf'], colorsOverride: ['G'], ...sourceOverrides,
  });
  const target = permanent(ctx, ctx.opponent, {
    name: 'Slice target', power: '1', toughness: '3', ...targetOverrides,
  });
  return { source, target };
}

function elfTokens(ctx) {
  return ctx.game.creatures(ctx.player).filter(card => card.isToken && card.hasSub('Elf'));
}

function assertTokens(ctx, count) {
  const tokens = elfTokens(ctx);
  assert.equal(tokens.length, count, 'creates exactly one Elf Warrior for each point of excess damage');
  for (const token of tokens) {
    assert.equal(token.owner, ctx.player);
    assert.equal(token.ctrl, ctx.player);
    assert.equal(token.is('Creature'), true);
    assert.equal(token.hasSub('Warrior'), true);
    assert.deepEqual(Array.from(token.colors), ['G'], 'the tokens are green');
    assert.equal(token.power, 1);
    assert.equal(token.toughness, 1);
  }
}

async function cast(ctx, source, target, { chooseAction = false } = {}) {
  let action = { from: 'hand' };
  if (chooseAction) {
    action = await ctx.player.controller.decide(ctx.game, {
      type: 'main', player: ctx.player, phase: ctx.game.phase,
      casts: ctx.game.castableList(ctx.player), acts: [], lands: [],
    });
    assert.equal(action?.kind, 'cast', 'the real local AI chooses to cast Windswift Slice');
    assert.equal(action.card, ctx.spell);
  }
  assert.equal(await ctx.game.castSpell(ctx.player, ctx.spell, action), true);
  assert.equal(ctx.spell.zone, 'stack');
  assert.equal(ctx.targetQuestions.length, 2, 'the controller chooses both announced targets');
  assert.equal(ctx.game.stack.at(-1).card, ctx.spell);
  assert.deepEqual(Array.from(ctx.game.stack.at(-1).targets), [source, target]);
  assert.equal(ctx.player.pool.G + ctx.player.pool.C, 0, 'the spell pays its real {2}{G} cost');
}

async function settle(ctx) {
  let iterations = 0;
  while ((ctx.game.stack.length || ctx.game.pendingTriggers.length) && iterations++ < 30) {
    await ctx.game.flushTriggers();
    if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.ok(iterations < 30, 'spell and triggered abilities settle');
  assert.equal(ctx.spell.zone, 'graveyard');
}

for (const role of roles) {
  test(`Windswift Slice ${role}: announced 5 damage to a 3/3 creates two green 1/1 Elf Warriors`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    await cast(ctx, source, target, { chooseAction: role !== 'human' });
    await settle(ctx);
    assert.equal(target.zone, 'graveyard');
    assertTokens(ctx, 2);
  });

  test(`Windswift Slice ${role}: prior marked damage reduces the amount needed for lethal damage`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx, {}, { toughness: '6' });
    target.damage = 3;
    await cast(ctx, source, target);
    await settle(ctx);
    assertTokens(ctx, 2);
  });

  test(`Windswift Slice ${role}: deathtouch needs one damage and the other four damage is excess`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx, { kws: ['deathtouch'] }, { toughness: '8' });
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'graveyard');
    assertTokens(ctx, 4);
  });

  test(`Windswift Slice ${role}: exactly lethal damage creates no token`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx, {}, { toughness: '5' });
    await cast(ctx, source, target);
    await settle(ctx);
    assertTokens(ctx, 0);
  });

  test(`Windswift Slice ${role}: fully prevented damage creates no token`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    ctx.game.untilEffects.push({ kind: 'preventToCreature', iid: target.iid, zoneVersion: target.zoneVersion, expires: 'eot' });
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'battlefield');
    assert.equal(target.damage, 0);
    assertTokens(ctx, 0);
  });

  test(`Windswift Slice ${role}: partial prevention subtracts from damage before excess is counted`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    ctx.game.untilEffects.push({ kind: 'oraclePreventNextAmount', target, zoneVersion: target.zoneVersion, remaining: 1, expires: 'eot' });
    await cast(ctx, source, target);
    await settle(ctx);
    assertTokens(ctx, 1);
  });

  test(`Windswift Slice ${role}: Fiery Emancipation counts all damage actually dealt`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    permanent(ctx, ctx.player, 'Fiery Emancipation');
    await cast(ctx, source, target);
    await settle(ctx);
    assertTokens(ctx, 12);
  });

  test(`Windswift Slice ${role}: wither uses toughness before the damage counters lower it`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx, { kws: ['wither'] });
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'graveyard');
    assertTokens(ctx, 2);
  });

  for (const invalid of ['source', 'target']) {
    test(`Windswift Slice ${role}: a blinked ${invalid} is a new object and no damage or tokens happen`, async () => {
      const ctx = fixture(role);
      const { source, target } = creatures(ctx);
      await cast(ctx, source, target);
      const blinked = invalid === 'source' ? source : target;
      const oldVersion = blinked.zoneVersion;
      await ctx.game.move(blinked, 'exile');
      await ctx.game.move(blinked, 'battlefield', { ctrl: blinked.owner });
      assert.notEqual(blinked.zoneVersion, oldVersion);
      await settle(ctx);
      assert.equal(target.zone, 'battlefield');
      assert.equal(target.damage, 0);
      assertTokens(ctx, 0);
    });
  }

  test(`Windswift Slice ${role}: redirected damage uses the actual creature recipient's lethal threshold`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    const recipient = permanent(ctx, ctx.player, { name: 'Redirect recipient', power: '1', toughness: '1' });
    ctx.game.untilEffects.push({ kind: 'redirectAllDamage', who: ctx.opponent, iid: recipient.iid, zoneVersion: recipient.zoneVersion, expires: 'eot' });
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'battlefield');
    assert.equal(target.damage, 0);
    assert.equal(recipient.zone, 'graveyard');
    assertTokens(ctx, 4);
  });

  test(`Windswift Slice ${role}: damage redirected to a player has no excess damage for Elf tokens`, async () => {
    const ctx = fixture(role);
    const { source, target } = creatures(ctx);
    permanent(ctx, ctx.opponent, {
      name: 'Redirect to player', types: ['Enchantment'],
      replace: [{
        event: 'damage', applies: (_game, data) => data.target === target,
        run: (_game, data) => { data.target = ctx.opponent; return data.n; },
      }],
    });
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'battlefield');
    assert.equal(target.damage, 0);
    assert.equal(ctx.opponent.life, 35);
    assertTokens(ctx, 0);
  });

  test(`Windswift Slice ${role}: lethally damaged Soul Warden sees the tokens before state-based death`, async () => {
    const ctx = fixture(role);
    const source = permanent(ctx, ctx.player, { name: 'Slice source Elf', power: '5', toughness: '5', subtypes: ['Elf'] });
    const target = permanent(ctx, ctx.opponent, 'Soul Warden');
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'graveyard');
    assertTokens(ctx, 4);
    assert.equal(ctx.opponent.life, 44, 'Soul Warden triggers for all four tokens before dying after the spell resolves');
  });

  test(`Windswift Slice ${role}: an opposing Elf lord remains until every token enters`, async () => {
    const ctx = fixture(role);
    const source = permanent(ctx, ctx.player, { name: 'Slice source Elf', power: '4', toughness: '4', subtypes: ['Elf'] });
    const target = permanent(ctx, ctx.opponent, 'Elvish Champion');
    assert.equal(source.power, 5);
    const entered = [];
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (name, data) => {
      if (name === 'etb' && data.card?.isToken && data.card.hasSub('Elf')) {
        entered.push({ lordZone: target.zone, power: data.card.power, toughness: data.card.toughness });
      }
      return emit(name, data);
    };
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.zone, 'graveyard');
    assertTokens(ctx, 3);
    assert.deepEqual(entered, Array.from({ length: 3 }, () => ({ lordZone: 'battlefield', power: 2, toughness: 2 })),
      'the lord still applies when the Elf tokens enter, then leaves after the spell finishes');
  });
}

test('Windswift Slice human: redirected planeswalker and battle damage use loyalty or defense for excess', async () => {
  for (const [type, counter] of [['Planeswalker', 'loyalty'], ['Battle', 'defense']]) {
    const ctx = fixture('human');
    const { source, target } = creatures(ctx);
    const recipient = permanent(ctx, ctx.opponent, { name: `Redirect ${type}`, types: [type] });
    recipient.counters[counter] = 2;
    ctx.game.untilEffects.push({ kind: 'redirectAllDamage', who: ctx.opponent, iid: recipient.iid, zoneVersion: recipient.zoneVersion, expires: 'eot' });
    const hits = [];
    const emit = ctx.game.emit.bind(ctx.game);
    ctx.game.emit = async (name, data) => {
      if (name === 'dealtDamage' && data.target === recipient) hits.push({ amount: data.n, counters: recipient.counters[counter] || 0 });
      return emit(name, data);
    };
    await cast(ctx, source, target);
    await settle(ctx);
    assert.equal(target.damage, 0, `${type}: the original creature was not damaged`);
    assert.deepEqual(hits, [{ amount: 5, counters: 0 }], `${type}: five damage removes its two counters`);
    assertTokens(ctx, 3);
  }
});

test('Windswift Slice human: all damage is excess against an already lethally damaged indestructible creature', async () => {
  const ctx = fixture('human');
  const { source, target } = creatures(ctx, { kws: ['deathtouch'] }, { kws: ['indestructible'] });
  target.damage = 3;
  await ctx.game.checkSBA();
  assert.equal(target.zone, 'battlefield', 'indestructible keeps the already lethally damaged creature on the battlefield');
  await cast(ctx, source, target);
  await settle(ctx);
  assert.equal(target.zone, 'battlefield');
  assert.equal(target.damage, 8);
  assertTokens(ctx, 5);
});

test('Windswift Slice human: a zero-power source deals no damage and creates no token', async () => {
  const ctx = fixture('human');
  const { source, target } = creatures(ctx, { power: '0', kws: ['deathtouch'] });
  let damageEvents = 0;
  const emit = ctx.game.emit.bind(ctx.game);
  ctx.game.emit = async (name, data) => {
    if (name === 'dealtDamage' && data.src === source) damageEvents++;
    return emit(name, data);
  };
  await cast(ctx, source, target);
  await settle(ctx);
  assert.equal(target.zone, 'battlefield');
  assert.equal(target.damage, 0);
  assert.equal(target.deathtouched, false);
  assert.equal(damageEvents, 0, 'zero damage does not happen, including its deathtouch effects');
  assertTokens(ctx, 0);
});

test('Windswift Slice human: a response changing source power is reflected when the spell resolves', async () => {
  const ctx = fixture('human');
  const { source, target } = creatures(ctx);
  await cast(ctx, source, target);
  ctx.game.addCounters(source, '+1/+1', 3);
  ctx.game.recalc();
  assert.equal(source.power, 8);
  await settle(ctx);
  assert.equal(target.zone, 'graveyard');
  assertTokens(ctx, 5);
});
