import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function decide(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'chooseOption') return query.aiHint?.kind === 'aggroAmalgam' ? '1' : query.options[0]?.key;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min ?? 1).map(option => option.key);
  if (query.type === 'chooseX') return query.min || 0;
  if (query.type === 'orderTriggers') return query.triggers;
  return null;
}

function context(role = 'human') {
  const game = new MTG.Game({ seed: 90426, paced: false, maxTurns: 10 });
  const player = game.addPlayer('Fight player', { name: 'Fight deck' }, null, role !== 'human');
  const opponent = game.addPlayer('Fight opponent', { name: 'Opponent' }, { decide: async (_g, q) => decide(q) }, false);
  player.controller = role === 'human' ? { decide: async (_g, q) => decide(q) }
    : new MTG.AIController(player, { difficulty: role, style: 'balanced' });
  const questions = [];
  const original = player.controller.decide.bind(player.controller);
  player.controller.decide = async (g, q) => { questions.push(q); return original(g, q); };
  game.turnPlayer = player;
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent, questions };
}

function put(ctx, owner, definition, zone = 'battlefield') {
  const def = typeof definition === 'string' ? MTG.DEFS[definition] : {
    name: 'Fight fixture', cost: null, types: ['Creature'], subtypes: [], super: [],
    power: '1', toughness: '1', kws: [], oracle: '', ...definition,
  };
  assert.ok(def, 'uses a loaded card definition');
  const card = new MTG.CardInst(def, owner);
  card.zone = zone;
  card.ctrl = owner;
  card.sick = false;
  (zone === 'battlefield' ? ctx.game.battlefield : owner[zone]).push(card);
  ctx.game.recalc();
  return card;
}

async function settle(ctx) {
  let turns = 0;
  while ((ctx.game.stack.length || ctx.game.pendingTriggers.length) && turns++ < 30) {
    await ctx.game.flushTriggers();
    if (ctx.game.stack.length) await ctx.game.resolveTop();
  }
  assert.ok(turns < 30, 'all fight and damage triggers settle');
}

async function activateTaunter(ctx) {
  const source = put(ctx, ctx.player, 'Brash Taunter');
  const target = put(ctx, ctx.opponent, { name: 'Fight target', power: '4', toughness: '4' });
  ctx.player.pool.C = 2;
  ctx.player.pool.R = 1;
  const entry = ctx.game.activatableList(ctx.player).find(action => action.card === source && action.ability);
  assert.ok(entry, 'the real fight ability is offered');
  assert.equal(await ctx.game.activateAbility(ctx.player, entry), true);
  assert.equal(source.tapped, true);
  assert.equal(ctx.player.pool.C + ctx.player.pool.R, 0, 'pays the real {2}{R}, {T} cost');
  assert.equal(ctx.game.stack.at(-1).ctx.targets[0], target, 'controller announces the fight target');
  return { source, target };
}

for (const role of ['human', 'hard']) {
  test(`Brash Taunter ${role}: wither does not reduce simultaneous retaliation or the damage trigger`, async () => {
    const ctx = context(role);
    const { source, target } = await activateTaunter(ctx);
    MTG.E.pumpUntilEOT(ctx.game, source, 0, 0, ['wither']);
    const before = ctx.opponent.life;
    await settle(ctx);
    assert.equal(source.damage, 4, '4/4 deals four damage even though wither reduces it to 3/3');
    assert.equal(target.counters['-1/-1'], 1);
    assert.equal(source.zone, 'battlefield', 'indestructible survives the fight');
    assert.equal(ctx.opponent.life, before - 4, 'the announced damage trigger deals the full four damage');
    assert.equal(ctx.questions.filter(q => q.type === 'chooseTargets').length, 2);
  });

  test(`Grothama ${role}: wither cannot shrink retaliation before its damage and leave-the-battlefield draw`, async () => {
    const ctx = context(role);
    const gro = put(ctx, ctx.opponent, 'Grothama, All-Devouring');
    const attacker = put(ctx, ctx.player, { name: 'Large attacker', power: '12', toughness: '15' });
    for (let i = 0; i < 15; i++) put(ctx, ctx.player, 'Forest', 'library');
    MTG.E.pumpUntilEOT(ctx.game, gro, 0, 0, ['wither']);
    await ctx.game.emit('attacks', { card: attacker, player: ctx.player, defender: ctx.opponent });
    await ctx.game.flushTriggers();
    assert.ok(ctx.game.stack.some(item => item.name.includes('Fight Grothama')), 'attacker controller accepts the real fight trigger');
    assert.equal(ctx.game.stack.at(-1).ctrl, ctx.player);
    await settle(ctx);
    assert.equal(attacker.counters['-1/-1'], 10);
    assert.equal(attacker.zone, 'battlefield');
    assert.equal(gro.zone, 'graveyard', 'the attacker deals its original twelve power');
    assert.equal(ctx.player.hand.length, 12, 'Grothama tracks all twelve damage for its leave trigger');
  });
}

test('Aggro Amalgam: cast X, modal fight target and simultaneous retaliation survive wither', async () => {
  const ctx = context();
  const target = put(ctx, ctx.opponent, { name: 'Hydra target', power: '2', toughness: '5' });
  const source = put(ctx, ctx.player, 'Aggro Amalgam', 'hand');
  ctx.player.pool.C = 4;
  ctx.player.pool.G = 2;
  assert.equal(await ctx.game.castSpell(ctx.player, source, { from: 'hand', xVal: 4 }), true);
  assert.equal(ctx.player.pool.C + ctx.player.pool.G, 0);
  await ctx.game.resolveTop();
  assert.equal(source.counters['+1/+1'], 4);
  assert.equal(ctx.game.stack.at(-1).mode, 1);
  assert.equal(ctx.game.stack.at(-1).ctx.targets[0], target);
  MTG.E.pumpUntilEOT(ctx.game, source, 0, 0, ['wither']);
  await settle(ctx);
  assert.equal(source.damage, 2, 'wither does not turn the other creature\'s retaliation into zero');
  assert.equal(target.counters['-1/-1'], 4);
  assert.equal(target.zone, 'battlefield');
});

for (const invalid of ['removed', 'blinked', 'phased']) {
  test(`Brash Taunter: ${invalid} source cannot fight from an old activated ability`, async () => {
    const ctx = context();
    const { source, target } = await activateTaunter(ctx);
    if (invalid === 'phased') source.phasedOut = true;
    else {
      await ctx.game.move(source, 'exile');
      if (invalid === 'blinked') await ctx.game.move(source, 'battlefield', { ctrl: ctx.player });
    }
    await settle(ctx);
    assert.equal(target.damage, 0, 'neither creature deals damage without the original participating source');
    assert.equal(ctx.opponent.life, 40);
  });
}

test('Aggro Amalgam: removing the source in response to its announced fight stops both hits', async () => {
  const ctx = context();
  const target = put(ctx, ctx.opponent, { name: 'Hydra survivor', power: '2', toughness: '8' });
  const source = put(ctx, ctx.player, 'Aggro Amalgam', 'hand');
  ctx.player.pool.C = 4;
  ctx.player.pool.G = 2;
  assert.equal(await ctx.game.castSpell(ctx.player, source, { from: 'hand', xVal: 4 }), true);
  await ctx.game.resolveTop();
  assert.equal(ctx.game.stack.at(-1).ctx.targets[0], target);
  await ctx.game.move(source, 'exile');
  await settle(ctx);
  assert.equal(target.damage, 0);
});

for (const blinked of ['attacker', 'Grothama']) {
  test(`Grothama: blinking ${blinked} in response cannot make the new object fight`, async () => {
    const ctx = context();
    const gro = put(ctx, ctx.opponent, 'Grothama, All-Devouring');
    const attacker = put(ctx, ctx.player, { name: 'Returning attacker', power: '3', toughness: '15' });
    await ctx.game.emit('attacks', { card: attacker, player: ctx.player, defender: ctx.opponent });
    await ctx.game.flushTriggers();
    assert.ok(ctx.game.stack.some(item => item.name.includes('Fight Grothama')));
    const participant = blinked === 'attacker' ? attacker : gro;
    await ctx.game.move(participant, 'exile');
    await ctx.game.move(participant, 'battlefield', { ctrl: participant.owner });
    await settle(ctx);
    assert.equal(attacker.damage, 0);
    assert.equal(gro.damage, 0);
  });
}

async function castThrone(ctx) {
  const source = put(ctx, ctx.player, { name: 'Throne fighter', power: '3', toughness: '3' });
  const target = put(ctx, ctx.opponent, { name: 'Throne target', power: '2', toughness: '2' });
  const spell = put(ctx, ctx.player, 'Fight for the Throne', 'hand');
  ctx.player.pool.C = 1;
  ctx.player.pool.G = 1;
  assert.equal(await ctx.game.castSpell(ctx.player, spell, { from: 'hand' }), true);
  assert.equal(ctx.player.pool.C + ctx.player.pool.G, 0, 'pays the real {1}{G} cost');
  assert.deepEqual(Array.from(ctx.game.stack.at(-1).targets), [source, target]);
  return { source, target, spell };
}

for (const role of ['human', 'hard']) {
  for (const invalid of ['removed', 'blinked']) {
    test(`Fight for the Throne ${role}: ${invalid} opponent target preserves the legal own target's counter`, async () => {
      const ctx = context(role);
      const { source, target, spell } = await castThrone(ctx);
      await ctx.game.move(target, 'exile');
      if (invalid === 'blinked') await ctx.game.move(target, 'battlefield', { ctrl: ctx.opponent });
      await settle(ctx);
      assert.equal(source.counters['+1/+1'], 1, 'the spell still puts its counter on the remaining legal target');
      assert.equal(source.damage, 0, 'one illegal participant prevents the fight');
      assert.equal(target.damage, 0, 'a returned target is a new object');
      assert.equal(spell.zone, 'graveyard');
    });
  }
}

test('Fight for the Throne: an invalid own target preserves the legal enemy target death watch', async () => {
  const ctx = context();
  const { source, target } = await castThrone(ctx);
  await ctx.game.move(source, 'exile');
  const commander = put(ctx, ctx.player, { name: 'Throne commander', power: '2', toughness: '3' });
  commander.commander = true;
  await settle(ctx);
  assert.equal(target.damage, 0, 'no fight happens without the own target');
  assert.equal(ctx.game.monarch, undefined);
  await ctx.game.destroy(target);
  await settle(ctx);
  assert.equal(ctx.game.monarch?.idx, ctx.player.idx, 'the remaining legal target is still watched for death this turn');
});

test('Fight for the Throne: simultaneous retaliation keeps lifelink that wither counters remove', async () => {
  const ctx = context();
  const source = put(ctx, ctx.player, { name: 'Throne wither fighter', power: '3', toughness: '7', kws: ['wither'] });
  const target = put(ctx, ctx.opponent, {
    name: 'Conditional lifelinker', power: '3', toughness: '6',
    oracle: 'As long as this creature has no -1/-1 counters on it, it has lifelink.',
    statics: [{ apply: (_g, self) => { if (!(self.counters['-1/-1'] > 0)) self.cur.kw.add('lifelink'); } }],
  });
  const spell = put(ctx, ctx.player, 'Fight for the Throne', 'hand');
  ctx.player.pool.C = 1;
  ctx.player.pool.G = 1;
  assert.equal(target.kw('lifelink'), true);
  assert.equal(await ctx.game.castSpell(ctx.player, spell, { from: 'hand' }), true);
  assert.deepEqual(Array.from(ctx.game.stack.at(-1).targets), [source, target]);
  await settle(ctx);
  assert.equal(source.damage, 3, 'retaliation uses the pre-fight power');
  assert.equal(target.counters['-1/-1'], 4);
  assert.equal(target.kw('lifelink'), false, 'wither removed the conditional keyword');
  assert.equal(ctx.opponent.life, 43, 'simultaneous retaliation still uses the pre-fight lifelink');
});
