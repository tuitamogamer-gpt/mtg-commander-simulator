import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticClass } from '../scripts/import-oracle-batch.mjs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function scriptedDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'chooseOption') {
    if (query.options.some(option => option.key === 'yes')) return 'yes';
    return query.options[0]?.key;
  }
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 1);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'orderTriggers') return query.triggers.slice();
  if (query.type === 'cardReveal' || query.type === 'threatAlert') return 'ok';
  return null;
}

function makeGame(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 5, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Oracle local bot' : 'Oracle scripted human',
    { name: `${role} combination regression` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer(
    'Oracle opponent',
    { name: 'opponent regression' },
    { decide: async (currentGame, query) => scriptedDecision(query) },
    false,
  );
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => scriptedDecision(query) };
  game.turnPlayer = player;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function putCard(game, player, name, zone) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual definition exists: ${name}`);
  const instance = new MTG.CardInst(definition, player);
  instance.zone = zone;
  if (zone === 'battlefield') {
    instance.ctrl = player;
    instance.sick = false;
    game.battlefield.push(instance);
    game.recalc();
  } else player[zone].push(instance);
  return instance;
}

function clowningAroundSource() {
  const oracle = 'Create two 1/1 white Clown Robot artifact creature tokens, then roll a six-sided die. ' +
    'If the result is equal to or less than the number of Robots you control, create a 1/1 white Clown Robot artifact creature token.';
  return {
    id: '859428e7-0795-423b-b16f-fdb4335de2b8',
    oracle_id: '9ae778b4-f8dd-4dec-b949-5b8c29120512',
    name: 'Clowning Around',
    layout: 'normal',
    mana_cost: '{1}{W}',
    type_line: 'Sorcery',
    oracle_text: oracle,
    color_identity: ['W'],
    colors: ['W'],
    keywords: [],
    games: ['paper'],
    legalities: { commander: 'legal' },
    set: 'unf',
    set_name: 'Unfinity',
    collector_number: '6',
    rarity: 'common',
    released_at: '2022-10-07',
    scryfall_uri: 'https://scryfall.com/card/unf/6/clowning-around',
  };
}

test('Clowning Around parser is closed over the full compound sentence', () => {
  const semantics = semanticClass(clowningAroundSource());
  assert.equal(semantics.reason, undefined);
  assert.equal(semantics.implementation.length, 1);
  assert.deepEqual(semantics.implementation[0], {
    kind: 'spell-token-roll-threshold',
    n: 2,
    bonusN: 1,
    dieSides: 6,
    compareSubtype: 'Robot',
    token: {
      name: 'Clown Robot',
      super: [],
      types: ['Artifact', 'Creature'],
      subtypes: ['Clown', 'Robot'],
      power: '1',
      toughness: '1',
      colors: ['W'],
      keywords: [],
    },
    contract: 'spell-token-roll-threshold',
  });
  assert.deepEqual(semantics.oracleContracts, ['spell-token-roll-threshold']);
});

test('actual Clowning Around resolves exact tokens and d6 threshold for human and local AI', async () => {
  for (const [roleIndex, role] of ['human', 'ai'].entries()) {
    for (const [rollIndex, roll] of [0, 0.999999].entries()) {
      const { game, player } = makeGame(role, 7420 + roleIndex * 10 + rollIndex);
      if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
      game.rnd = () => roll;
      const spell = putCard(game, player, 'Clowning Around', 'hand');
      assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true);
      await game.resolveTop();

      const clowns = game.creatures(player).filter(card => card.isToken && card.name === 'Clown Robot');
      assert.equal(clowns.length, roll === 0 ? 3 : 2, `${role}: threshold result creates the exact count`);
      for (const token of clowns) {
        assert.equal(token.is('Artifact'), true);
        assert.equal(token.is('Creature'), true);
        assert.equal(token.hasSub('Clown'), true);
        assert.equal(token.hasSub('Robot'), true);
        assert.deepEqual(Array.from(token.colors), ['W']);
        assert.equal(token.power, 1);
        assert.equal(token.toughness, 1);
      }
    }
  }
});

test('actual free hand-cast Ojutai Summons still Rebounds for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player } = makeGame(role, 7440 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const spell = putCard(game, player, "Ojutai's Summons", 'hand');
    assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();

    assert.equal(spell.zone, 'exile', `${role}: a free cast from hand still satisfies Rebound`);
    assert.equal(game.creatures(player).filter(card => card.isToken && card.hasSub('Djinn')).length, 1);
    assert.ok(game.delayed.some(entry => entry.name === `Rebound: ${spell.name}`));

    await game.emit('upkeep', { player });
    await game.flushTriggers();
    assert.equal(game.stack.at(-1)?.name, `Rebound: ${spell.name}`);
    await game.resolveTop();
    assert.equal(game.stack.at(-1)?.card, spell, `${role}: controller accepts the valuable Rebound offer`);
    await game.resolveTop();

    assert.equal(spell.zone, 'graveyard', 'the exile cast does not Rebound a second time');
    assert.equal(game.creatures(player).filter(card => card.isToken && card.hasSub('Djinn')).length, 2);
  }
});

test('actual Ojutai Summons Rebound ignores a new exile object for human and local AI', async () => {
  for (const [roleIndex, role] of ['human', 'ai'].entries()) {
    for (const [timingIndex, timing] of ['before-upkeep', 'on-stack'].entries()) {
      const { game, player } = makeGame(role, 7450 + roleIndex * 10 + timingIndex);
      if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
      const spell = putCard(game, player, "Ojutai's Summons", 'hand');
      assert.equal(await game.castSpell(player, spell, { from: 'hand', alt: { free: true } }), true);
      await game.resolveTop();

      assert.equal(spell.zone, 'exile');
      const reboundObjectVersion = spell.zoneVersion;
      if (timing === 'before-upkeep') {
        await game.move(spell, 'graveyard');
        await game.move(spell, 'exile');
      }

      await game.emit('upkeep', { player });
      await game.flushTriggers();
      assert.equal(game.stack.at(-1)?.name, `Rebound: ${spell.name}`);

      if (timing === 'on-stack') {
        await game.move(spell, 'graveyard');
        await game.move(spell, 'exile');
      }
      assert.notEqual(spell.zoneVersion, reboundObjectVersion);
      await game.resolveTop();

      assert.equal(game.stack.length, 0, `${role}/${timing}: stale Rebound does not cast the new exile object`);
      assert.equal(spell.zone, 'exile');
      assert.equal(game.creatures(player).filter(card => card.isToken && card.hasSub('Djinn')).length, 1);
    }
  }
});

test('actual Charmed Sleep ETB uses Aura LKI after removal for human and local AI', async () => {
  for (const [index, role] of ['human', 'ai'].entries()) {
    const { game, player, opponent } = makeGame(role, 7460 + index);
    if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController);
    const host = putCard(game, opponent, 'Grizzly Bears', 'battlefield');
    const aura = putCard(game, player, 'Charmed Sleep', 'hand');
    assert.equal(await game.castSpell(player, aura, { from: 'hand', alt: { free: true } }), true);
    await game.resolveTop();

    const trigger = game.stack.at(-1);
    assert.equal(trigger?.kind, 'trigger');
    assert.match(trigger?.name || '', /Tap enchanted creature$/);
    assert.equal(trigger.ctx.sourceAttachedTo, host.iid);
    assert.equal(host.tapped, false);

    await game.move(aura, 'graveyard');
    assert.equal(aura.zone, 'graveyard');
    await game.resolveTop();
    assert.equal(host.tapped, true, `${role}: ETB taps the same enchanted object using LKI`);
  }
});
