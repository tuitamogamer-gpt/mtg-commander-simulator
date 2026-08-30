import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function passDecision(query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers' || query.type === 'combatReview') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.from.slice(0, query.min || 0);
  if (query.type === 'orderTriggers') return query.triggers.slice();
  return null;
}

function makeGame(role, seed) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4, difficulty: 'hard' });
  const player = game.addPlayer(
    role === 'ai' ? 'Death-mechanic local bot' : 'Death-mechanic human',
    { name: `${role} death-mechanic fixture` },
    null,
    role === 'ai',
  );
  const opponent = game.addPlayer(
    'Passing opponent',
    { name: 'Passing opponent fixture' },
    { decide: async (currentGame, query) => passDecision(query) },
    false,
  );
  player.controller = role === 'ai'
    ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (currentGame, query) => passDecision(query) };
  game.turnPlayer = opponent;
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, player, opponent };
}

function actualPermanent(game, player, name) {
  const definition = MTG.DEFS[name];
  assert.ok(definition, `actual imported definition exists: ${name}`);
  const card = new MTG.CardInst(definition, player);
  card.zone = 'battlefield';
  card.ctrl = player;
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

const cases = [
  { name: 'Butcher Ghoul', trigger: 'Undying', counter: '+1/+1' },
  { name: 'Safehold Elite', trigger: 'Persist', counter: '-1/-1' },
];

test('actual Persist and Undying return their unchanged graveyard objects for human and local AI', async () => {
  for (const [roleIndex, role] of ['human', 'ai'].entries()) {
    for (const [cardIndex, fixture] of cases.entries()) {
      const { game, player, opponent } = makeGame(role, 7610 + roleIndex * 10 + cardIndex);
      if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController, `${fixture.name}: genuine local AI controller`);
      const card = actualPermanent(game, player, fixture.name);

      assert.equal(await game.destroy(card), true);
      const deathZoneVersion = card.zoneVersion;
      const pending = game.pendingTriggers.find(candidate => candidate.name === fixture.trigger);
      assert.ok(pending, `${fixture.name}/${role}: actual ${fixture.trigger} trigger is pending`);
      assert.equal(pending.data.graveyardZoneVersion, deathZoneVersion,
        `${fixture.name}/${role}: trigger snapshots the death graveyard object`);

      await game.flushTriggers();
      assert.ok(game.stack.some(object => object.kind === 'trigger' && object.name.includes(fixture.trigger)));
      await game.priorityRound(opponent);

      assert.equal(card.zone, 'battlefield', `${fixture.name}/${role}: unchanged graveyard object returns`);
      assert.equal(card.counters[fixture.counter], 1, `${fixture.name}/${role}: returned object gets its exact counter`);
      assert.equal(game.stack.length, 0);
    }
  }
});

test('old actual Persist and Undying triggers ignore graveyard objects that left and returned', async () => {
  for (const [roleIndex, role] of ['human', 'ai'].entries()) {
    for (const [cardIndex, fixture] of cases.entries()) {
      const { game, player, opponent } = makeGame(role, 7630 + roleIndex * 10 + cardIndex);
      if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController, `${fixture.name}: genuine local AI controller`);
      const card = actualPermanent(game, player, fixture.name);

      assert.equal(await game.destroy(card), true);
      const pending = game.pendingTriggers.find(candidate => candidate.name === fixture.trigger);
      assert.ok(pending, `${fixture.name}/${role}: actual ${fixture.trigger} trigger is pending`);
      const deathZoneVersion = card.zoneVersion;
      assert.equal(pending.data.graveyardZoneVersion, deathZoneVersion,
        `${fixture.name}/${role}: pending trigger stores the original graveyard identity`);
      await game.flushTriggers();

      await game.move(card, 'exile');
      await game.move(card, 'graveyard');
      assert.equal(card.zone, 'graveyard');
      assert.notEqual(card.zoneVersion, deathZoneVersion, `${fixture.name}/${role}: same CardInst is now a new zone object`);

      await game.priorityRound(opponent);

      assert.equal(card.zone, 'graveyard', `${fixture.name}/${role}: stale ${fixture.trigger} does not return the new graveyard object`);
      assert.equal(card.counters[fixture.counter] || 0, 0, `${fixture.name}/${role}: stale trigger adds no counter`);
      assert.equal(game.stack.length, 0);
    }
  }
});

test('actual Lignify prevents printed Persist and Undying from triggering for human and local AI', async () => {
  for (const [roleIndex, role] of ['human', 'ai'].entries()) {
    for (const [cardIndex, fixture] of cases.entries()) {
      const { game, player, opponent } = makeGame(role, 7650 + roleIndex * 10 + cardIndex);
      if (role === 'ai') assert.ok(player.controller instanceof MTG.AIController, `${fixture.name}: genuine local AI controller`);
      const card = actualPermanent(game, player, fixture.name);
      const lignify = actualPermanent(game, opponent, 'Lignify');
      assert.equal(await game.attach(lignify, card), true);
      assert.equal(card.cur.abilitiesDisabled, true, `${fixture.name}/${role}: actual Lignify removes abilities before death`);

      assert.equal(await game.destroy(card), true);
      assert.equal(game.pendingTriggers.some(candidate => candidate.name === fixture.trigger), false,
        `${fixture.name}/${role}: the removed ${fixture.trigger} ability does not trigger`);
      await game.flushTriggers();
      await game.priorityRound(opponent);

      assert.equal(card.zone, 'graveyard');
      assert.equal(card.counters[fixture.counter] || 0, 0);
      assert.equal(game.stack.some(object => object.name.includes(fixture.trigger)), false);
    }
  }
});
