import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function makePod({ enabled = true, decideHuman, allAI = false } = {}) {
  const events = [];
  const game = new MTG.Game({ seed: 8282026, paced: false, maxTurns: 20, onEvent: event => events.push(event) });
  const names = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'];
  const players = names.map((name, index) => {
    const isAI = allAI || index > 0;
    const player = game.addPlayer(name, { name: `${name} deck` }, null, isAI);
    player.isAI = isAI;
    player.turnsStarted = 0;
    player.controller = isAI
      ? new MTG.AIController(player, { difficulty: 'normal', style: 'balanced' })
      : { decide: async (g, q) => decideHuman ? decideHuman(g, q, player) : q.options?.[0]?.key ?? null };
    return player;
  });
  game.turnPlayer = players[0];
  game.turnNo = 5;
  game.phase = 'combat';
  MTG.initDiplomacy(game, enabled);
  return { game, players, events };
}

function sourceCard(game, owner, name = 'Galadriel, Elven-Queen') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

const COUNCIL = [
  { key: 'dominion', label: 'Dominion' },
  { key: 'guidance', label: 'Guidance' },
];

test('enabled public council lets the human ballot plus one promised vote win a 2-2 Dominion tie before normal diplomacy unlock', async () => {
  const { game, players: [human, dragon, wolf, raven] } = makePod({
    decideHuman: (g, q) => {
      if (q.type === 'diplomacyReview') return null;
      if (q.diplomacyCampaign?.stage === 'choice') return 'dominion';
      if (q.diplomacyCampaign?.stage === 'target') return String(dragon.idx);
      if (q.diplomacyCampaign?.stage === 'promise') return `no_target_player:${q.diplomacyCampaign.voter.idx}`;
      if (q.aiHint?.kind === 'vote') return 'dominion';
      return q.options?.[0]?.key ?? null;
    },
  });
  const galadriel = sourceCard(game, human);

  assert.equal(game.diplomacyStatus().unlocked, false, 'ordinary offer builder should still be turn-three locked');
  const votes = await MTG.E7.vote(game, human, galadriel, COUNCIL,
    voter => voter === human ? 'dominion' : 'guidance');

  assert.equal(votes.get('dominion'), 2);
  assert.equal(votes.get('guidance'), 2);
  assert.equal(MTG.E7.voteBeats(votes, 'dominion', 'guidance'), true);
  assert.equal(game.diplomacy.contracts.length, 1);
  assert.deepEqual(Array.from(game.diplomacy.contracts, contract => contract.kind), ['choice-bargain']);
  assert.ok(game.diplomacy.contracts.every(contract =>
    contract.clauses.some(clause => clause.type === 'choice_vote' && clause.state === 'fulfilled') &&
    contract.clauses.some(clause => clause.type === 'no_target_player' && clause.state === 'active')));
  assert.ok(game.log.some(entry => /vote bargain fulfilled/.test(entry.msg)));

  const hostile = { what: 'opponent', prompt: 'Deal damage to target opponent', diplomacyHostile: true };
  const legal = game.legalTargets(hostile, galadriel, human);
  assert.equal(legal.includes(dragon), false, 'accepted promise must bind targeting even before the ordinary round-three unlock');
  assert.equal(legal.includes(wolf), true);
  assert.equal(legal.includes(raven), true);
});

test('public choice campaign is inert when Diplomacy is disabled and secret ballots never expose bargains', async () => {
  const off = makePod({ enabled: false });
  const source = sourceCard(off.game, off.players[0]);
  const publicVotes = await MTG.E7.vote(off.game, off.players[0], source, COUNCIL,
    voter => voter === off.players[0] ? 'dominion' : 'guidance');
  assert.equal(publicVotes.get('dominion'), 1);
  assert.equal(publicVotes.get('guidance'), 3);
  assert.equal(off.game.diplomacy.contracts.length, 0);
  assert.equal(off.game.diplomacy.proposals.length, 0);

  let campaignPrompted = false;
  const secret = makePod({
    enabled: true,
    decideHuman: (g, q) => {
      if (q.diplomacyCampaign) campaignPrompted = true;
      return q.options?.[0]?.key ?? null;
    },
  });
  const secretSource = sourceCard(secret.game, secret.players[0]);
  await MTG.E7.secretVote(secret.game, secret.players[0], secretSource, COUNCIL);
  assert.equal(campaignPrompted, false);
  assert.equal(secret.game.diplomacy.contracts.length, 0);
  assert.equal(secret.game.diplomacy.proposals.length, 0);
});

test('local bot campaign buys exactly one vote and uses the public 2-2 campaign tie-break for Dominion', async () => {
  const { game, players } = makePod({ enabled: true, allAI: true });
  const sponsor = players[0];
  const galadriel = sourceCard(game, sponsor);
  const votes = await MTG.E7.vote(game, sponsor, galadriel, COUNCIL,
    voter => voter === sponsor ? 'dominion' : 'guidance');

  assert.equal(votes.get('dominion'), 2);
  assert.equal(votes.get('guidance'), 2);
  assert.equal(MTG.E7.voteBeats(votes, 'dominion', 'guidance'), true);
  assert.equal(game.diplomacy.contracts.length, 1, 'the campaign package allows exactly one secured vote');
  assert.ok(game.diplomacy.contracts.every(contract => contract.fromId === sponsor.idx));
});

test('central game-effect channel covers every applied damage and a battlefield-to-hand transfer', async () => {
  const { game, players: [human, opponent], events } = makePod({ enabled: false });
  const source = sourceCard(game, human, 'Stormcatch Mentor');
  const victim = sourceCard(game, opponent, 'Academy Manufactor');

  await game.damagePlayer(source, opponent, 2, { combat: true });
  await game.damageCreature(source, victim, 1);
  await game.move(victim, 'hand');

  const effects = events.filter(event => event.type === 'gameEffect');
  assert.ok(effects.some(event => event.kind === 'damage' && event.targetKind === 'player' && event.target === opponent && event.amount === 2 && event.combat));
  assert.ok(effects.some(event => event.kind === 'damage' && event.targetKind === 'permanent' && event.target === victim && event.amount === 1));
  assert.ok(effects.some(event => event.kind === 'zoneMove' && event.card === victim && event.fromZone === 'battlefield' && event.toZone === 'hand'));
});

test('destroy/exile batches and shared-source lethal damage emit one storm board-wipe event', async () => {
  for (const mode of ['destroy', 'exile', 'damage']) {
    const { game, players, events } = makePod({ enabled: false });
    const source = sourceCard(game, players[0], 'Stormcatch Mentor');
    const victims = [0, 1, 2, 3].map((index) => sourceCard(game, players[index], 'Academy Manufactor'));
    events.splice(0);
    if (mode === 'destroy') await game.destroyMany(victims, { source });
    else if (mode === 'exile') await game.exileMany(victims);
    else {
      for (const victim of victims) await game.damageCreature(source, victim, 4, { deferSBA: true });
      await game.checkSBA();
    }
    const wipes = events.filter(event => event.type === 'gameEffect' && event.kind === 'boardWipe');
    assert.equal(wipes.length, 1, `${mode} should emit one board-wipe visual batch`);
    assert.equal(wipes[0].mode, mode);
    assert.equal(wipes[0].count, 4);
    assert.equal(events.filter(event => event.type === 'gameEffect' && event.kind === 'zoneMove').length, 0,
      `${mode} batch should not also spam individual zone-transfer animations`);
    if (mode === 'destroy') {
      const returned = victims[0];
      await game.move(returned, 'battlefield', { ctrl: returned.owner });
      events.splice(0);
      await game.move(returned, 'hand');
      assert.equal(events.filter(event => event.type === 'gameEffect' && event.kind === 'zoneMove').length, 1,
        'a permanent that returns later in the same turn must not retain the old board-wipe suppression marker');
    }
  }
});
