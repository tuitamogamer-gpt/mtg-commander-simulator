import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function definition(name, extra = {}) {
  return Object.assign({
    name, cost: '{0}', super: [], types: ['Creature'], subtypes: [],
    oracle: '', power: '2', toughness: '2', kws: [], abilities: [],
  }, extra);
}

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, Math.max(1, query.min || 0));
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(decider) {
  const game = new MTG.Game({ seed: 240826, paced: false, maxTurns: 20 });
  const player = game.addPlayer('Player', { name: 'Player deck' }, {
    decide: async (g, query) => decider ? decider(g, query) : defaultDecision(g, query),
  }, false);
  const opponent = game.addPlayer('Opponent', { name: 'Opponent deck' }, {
    decide: async (g, query) => defaultDecision(g, query),
  }, true);
  game.turnPlayer = player;
  game.turnNo = 7;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, player, opponent };
}

function permanent(game, player, defOrName) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function cardIn(player, defOrName, zone) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

test('resolution rechecks a target relationship after one target changes controller', async () => {
  let first;
  let second;
  let resolvedTargets;
  const { game, player, opponent } = rulesGame((g, query) => {
    if (query.type === 'chooseTargets' && query.prompt === 'First creature') return [first];
    if (query.type === 'chooseTargets' && query.prompt === 'Creature controlled by a different player') return [second];
    return defaultDecision(g, query);
  });
  first = permanent(game, player, definition('First Target'));
  second = permanent(game, opponent, definition('Dependent Target'));
  const spell = cardIn(player, definition('Relational Target Probe', {
    types: ['Instant'], power: undefined, toughness: undefined,
    targets: [
      {
        what: 'creature', prompt: 'First creature',
        filter: (g, card) => card.zone === 'battlefield' && card.is('Creature'),
      },
      {
        what: 'creature', prompt: 'Creature controlled by a different player',
        filter: (g, card) => card.zone === 'battlefield' && card.is('Creature'),
        dependentFilter: (g, candidate, previousTargets) => {
          const prior = previousTargets.flat().find(target => target instanceof MTG.CardInst);
          return !!prior && candidate !== prior && candidate.ctrl !== prior.ctrl;
        },
      },
    ],
    resolve: async ctx => {
      resolvedTargets = ctx.targets.slice();
      for (const target of ctx.targets) if (target) ctx.g.addCounters(target, '+1/+1', 1, false, ctx.you);
    },
  }), 'hand');

  assert.equal(await game.castSpell(player, spell), true);
  assert.equal(game.stack.at(-1).targets[1], second);
  second.ctrl = player;
  game.recalc();
  await game.resolveTop();

  assert.equal(resolvedTargets[0], first);
  assert.equal(resolvedTargets[1], null, 'changed control breaks the different-controller target requirement');
  assert.equal(first.counters['+1/+1'], 1, 'the remaining legal target is still affected');
  assert.equal(second.counters['+1/+1'] || 0, 0, 'the now-illegal dependent target is not affected');
});

function ninjutsuFixture() {
  let attacker;
  const fixture = rulesGame((g, query) => {
    if (query.type === 'chooseCards' && query.aiHint?.kind === 'ninjutsuReturn') return [attacker];
    return defaultDecision(g, query);
  });
  const { game, player, opponent } = fixture;
  attacker = permanent(game, player, definition('Unblocked Attacker'));
  attacker.attacking = opponent;
  attacker.wasBlocked = false;
  const ninja = cardIn(player, definition('Hidden Ninja', { ninjutsu: { cost: '{0}' } }), 'hand');
  game.phase = 'combat';
  game.step = 'blockers';
  game.combat = { attackers: [attacker], defenders: new Map() };
  return Object.assign(fixture, { attacker, ninja });
}

test('Ninjutsu cost stays paid but does nothing if its source card leaves hand before resolution', async () => {
  const { game, player, attacker, ninja } = ninjutsuFixture();
  const action = game.activatableList(player).find(entry => entry.card === ninja && entry.ninjutsu);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(attacker.zone, 'hand', 'returning the attacker is an activation cost and is not undone');

  await game.move(ninja, 'graveyard');
  await game.resolveTop();

  assert.equal(ninja.zone, 'graveyard');
  assert.equal(game.combat.attackers.includes(ninja), false);
});

test('Ninjutsu cannot find a new hand object after its source leaves and returns before resolution', async () => {
  const { game, player, attacker, ninja } = ninjutsuFixture();
  const action = game.activatableList(player).find(entry => entry.card === ninja && entry.ninjutsu);
  assert.ok(action);
  assert.equal(await game.activateAbility(player, action), true);
  assert.equal(attacker.zone, 'hand');

  await game.move(ninja, 'graveyard');
  await game.move(ninja, 'hand');
  await game.resolveTop();

  assert.equal(ninja.zone, 'hand', 'CR 400.7 makes the returned card a new object');
  assert.equal(game.combat.attackers.includes(ninja), false);
});
