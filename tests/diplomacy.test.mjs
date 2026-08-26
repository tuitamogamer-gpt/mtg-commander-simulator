import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function makeGame({ enabled = true, unlocked = true } = {}) {
  const game = new MTG.Game({ seed: 37, paced: false, maxTurns: 40 });
  const players = ['You', 'AI Dragon', 'AI Wolf', 'AI Raven'].map((name, index) => {
    const p = game.addPlayer(name, { name: `${name} deck` }, null, index > 0);
    p.isAI = index > 0;
    p.controller = p.isAI ? new MTG.AIController(p, { difficulty: 'normal', style: 'balanced' }) : { decide: async () => null };
    p.turnsStarted = unlocked ? 3 : 0;
    return p;
  });
  game.turnPlayer = players[0];
  MTG.initDiplomacy(game, enabled);
  return { game, players };
}

function addCreature(game, owner, name = 'Stormcatch Mentor') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  card.tapped = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function addLand(game, owner, name = 'Forest') {
  const card = new MTG.CardInst(MTG.DEFS[name], owner);
  card.ctrl = owner;
  card.zone = 'battlefield';
  card.sick = false;
  card.tapped = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function makeOfferState(spec) {
  const state = makeGame();
  const [human, bot, third, fourth] = state.players;
  human.life = spec.humanLife;
  bot.life = spec.botLife;
  third.life = spec.thirdLife;
  for (let i = 0; i < spec.humanCreatures; i++) addCreature(state.game, human);
  for (let i = 0; i < spec.botCreatures; i++) addCreature(state.game, bot);
  addCreature(state.game, third);
  addCreature(state.game, fourth);
  state.game.recalc();
  return state;
}

function activeClause(game, type, actor, beneficiary) {
  return game.diplomacy.contracts.flatMap(contract => contract.clauses)
    .find(clause => clause.type === type && clause.actorId === actor.idx && clause.beneficiaryId === beneficiary.idx);
}

test('diplomacy is optional, defaults to inert state, and unlocks only after three full table rounds', () => {
  const off = makeGame({ enabled: false });
  const offStatus = off.game.diplomacyStatus();
  assert.equal(offStatus.enabled, false);
  assert.equal(offStatus.unlocked, false);
  assert.equal(offStatus.reason, 'Diplomacy & Politics is disabled for this game.');
  assert.equal(offStatus.rounds, 0);
  assert.equal(offStatus.unlockRounds, 3);

  const { game, players } = makeGame({ unlocked: false });
  players[0].turnsStarted = 8;
  players[1].turnsStarted = 3;
  players[2].turnsStarted = 3;
  players[3].turnsStarted = 2;
  assert.equal(game.diplomacyStatus().unlocked, false);
  assert.equal(game.diplomacyStatus().rounds, 2);
  players[3].turnsStarted = 3;
  assert.equal(game.diplomacyStatus().unlocked, true);
  assert.equal(game.diplomacyStatus().rounds, 3);
});

test('a materially favorable reciprocal combat truce is accepted and filters voluntary attacks', () => {
  const { game, players: [human, bot, third] } = makeGame();
  const humanCreature = addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');
  const botCreature = addCreature(game, bot);

  const result = game.proposeDiplomacy(
    human, bot,
    `no_attack:${human.idx}`,
    `no_attack:${bot.idx}`,
  );

  assert.equal(result.status, 'accepted');
  assert.equal(game.diplomacyAttackBlocked(bot, human), true);
  assert.deepEqual(game.diplomacyAttackTargetsFor(botCreature, [human, third], false), [third]);
  assert.deepEqual(game.diplomacyAttackTargetsFor(humanCreature, [bot, third], false), [third]);
});

test('forced attacks override an impossible truce without recording a betrayal', () => {
  const { game, players: [human, bot] } = makeGame();
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');
  const attacker = addCreature(game, bot);
  const result = game.proposeDiplomacy(human, bot, `no_attack:${human.idx}`, `no_attack:${bot.idx}`);
  assert.equal(result.status, 'accepted');

  assert.deepEqual(game.diplomacyAttackTargetsFor(attacker, [human], true), [human]);
  game.diplomacyVoidAttackPromise(bot, human, 'a forced attack had no compliant defender');
  const clause = activeClause(game, 'no_attack', bot, human);
  assert.equal(clause.state, 'void');
  assert.match(clause.completionReason, /forced attack/);
  assert.equal(game.diplomacy.contracts[0].status, 'active', 'the reciprocal promise still remains');
});

test('harmful targeting is filtered while a mandatory Magic target voids only that clause', () => {
  const { game, players: [human, bot, third] } = makeGame();
  addCreature(game, human);
  addCreature(game, bot, 'Inferno Titan');
  const result = game.proposeDiplomacy(
    human, bot,
    `no_target_player:${human.idx}`,
    `no_target_player:${bot.idx}`,
  );
  assert.equal(result.status, 'accepted');

  const source = new MTG.CardInst(MTG.DEFS['Inferno Titan'], bot);
  const spec = { what: 'opponent', prompt: 'Deal damage to target opponent' };
  const voluntary = game.legalTargets(spec, source, bot);
  assert.equal(voluntary.includes(human), false);
  assert.equal(voluntary.includes(third), true);
  const mandatory = game.legalTargets(spec, source, bot, { allowForced: true });
  assert.equal(mandatory.includes(human), true);
  assert.equal(mandatory.includes(third), true);

  game.diplomacyHandleForcedTarget(bot, human, source, spec);
  const clause = activeClause(game, 'no_target_player', bot, human);
  assert.equal(clause.state, 'void');
  assert.match(clause.completionReason, /mandatory Magic target/);
});

test('anti-abuse rules stop multi-bot combat shields and runaway-leader protection', () => {
  const { game, players: [human, botA, botB] } = makeGame();
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, botA);
  addCreature(game, botB);

  const first = game.proposeDiplomacy(human, botA, `no_attack:${human.idx}`, `no_attack:${botA.idx}`);
  assert.equal(first.status, 'accepted');
  const second = game.proposeDiplomacy(human, botB, `no_attack:${human.idx}`, `no_target_player:${botB.idx}`);
  assert.equal(second.status, 'rejected');
  assert.match(second.reason, /only one combat-immunity/i);

  const lead = makeGame();
  const [leader, bot] = lead.players;
  addCreature(lead.game, leader);
  addCreature(lead.game, bot);
  leader.life = 500;
  const leaderDeal = lead.game.proposeDiplomacy(leader, bot, `no_attack:${leader.idx}`, `no_attack:${bot.idx}`);
  assert.equal(leaderDeal.status, 'rejected');
  assert.match(leaderDeal.reason, /leading threat/i);
});

test('bot-bot negotiations use the same public rules and create visible contracts only when a runaway threat exists', async () => {
  const { game, players: [human, botA, botB] } = makeGame();
  human.life = 500;
  addCreature(game, botA, 'Inferno Titan');
  addCreature(game, botB, 'Stormcatch Mentor');
  const result = await game.processDiplomacyCheckpoint(botA);

  assert.equal(result.status, 'accepted');
  assert.equal(result.contract.fromId, botA.idx);
  assert.notEqual(result.contract.toId, human.idx);
  assert.notEqual(result.contract.toId, botA.idx);
  assert.ok(result.contract.clauses.some(clause => clause.type === 'pressure_player' && clause.targetPlayerId === human.idx));
  assert.ok(result.contract.clauses.some(clause => ['no_attack', 'no_target_player', 'protect_permanent'].includes(clause.type)));
  assert.match(game.log.at(-1).msg, /Agreement #/);
});

test('bot-bot negotiation also occurs around a meaningful shared threat before it becomes runaway', async () => {
  const { game, players: [thirdParty, botA, botB] } = makeGame();
  addCreature(game, thirdParty, 'Inferno Titan');
  addCreature(game, botA);
  addCreature(game, botB);
  assert.equal(game.diplomacyRunawayThreat(), null);

  const result = await game.processDiplomacyCheckpoint(botA);
  assert.equal(result.status, 'accepted');
  assert.ok(result.contract);
  assert.ok(game.diplomacy.proposals.length >= 1);
  assert.ok(game.diplomacy.history.some(entry => entry.kind === 'accepted'));
  assert.ok(game.log.some(entry => /offered a short agreement/.test(entry.msg)));
});

test('a bot addresses the human directly when they share a meaningful public enemy', async () => {
  const { game, players: [human, botA, leader, botB] } = makeGame();
  leader.life = 500;
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, botA, 'Inferno Titan');
  addCreature(game, leader, 'Inferno Titan');
  addCreature(game, botB);

  const result = await game.processDiplomacyCheckpoint(botA);
  assert.equal(result.status, 'pending-human');
  assert.equal(result.proposal.toId, human.idx);
  assert.ok(result.proposal.publicBalance.to.net >= 0);
  assert.ok(result.proposal.publicBalance.to.cost <= result.proposal.publicBalance.to.benefit * 1.15 + 0.1);
  assert.ok(result.proposal.publicBalance.to.scopeNet >= -0.1);
  assert.ok(result.proposal.publicBalance.to.scopeCost <= result.proposal.publicBalance.to.scopeBenefit * 1.25 + 0.1);
  assert.equal(game.diplomacyView(human).incoming[0].fromId, botA.idx);
  assert.ok(game.diplomacyView(human).incoming[0].publicBalance.net >= 0);
  assert.ok(game.log.some(entry => /sent You a diplomacy proposal/.test(entry.msg)));
});

test('a bot cannot send the human a publicly one-sided exchange', () => {
  const { game, players: [human, bot, leader] } = makeGame();
  leader.life = 500;
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');

  const result = game.proposeDiplomacy(
    bot, human,
    `no_attack:${bot.idx}`,
    `no_target_player:${human.idx}`,
  );

  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /one-sided/i);
  assert.ok(result.proposal.publicBalance.to.net < -0.2);
});

test('a bot cannot buy a full no-attack promise by protecting one cheap artifact', () => {
  const { game, players: [human, bot, leader] } = makeGame();
  leader.life = 500;
  addCreature(game, human, 'Stormcatch Mentor');
  addCreature(game, bot, 'Stormcatch Mentor');
  const ring = new MTG.CardInst(MTG.DEFS['Sol Ring'], human);
  ring.ctrl = human; ring.zone = 'battlefield'; ring.sick = false; ring.tapped = false;
  game.battlefield.push(ring);
  game.recalc();

  const result = game.proposeDiplomacy(
    bot, human,
    `no_attack:${bot.idx}`,
    `protect_permanent:${ring.iid}`,
  );

  assert.equal(result.status, 'rejected');
  assert.match(result.reason, /one-sided/i);
  assert.ok(result.proposal.publicBalance.to.net > 0,
    'the old value-only gate incorrectly considered this positive');
  assert.ok(result.proposal.publicBalance.to.scopeCost > result.proposal.publicBalance.to.scopeBenefit * 1.25 + 0.1,
    'commitment breadth must expose why the exchange is disproportionate');
});

test('pressure clauses require a meaningful attack and void if a free block appears later', () => {
  const { game, players: [human, bot, leader] } = makeGame();
  leader.life = 500;
  addCreature(game, human, 'Stormcatch Mentor');
  const blocker = addCreature(game, leader, 'Inferno Titan');

  let options = game.diplomacyClauseOptions(human, bot);
  assert.equal(options.some(option => option.key === `pressure_player:${leader.idx}`), false,
    'a legal suicide attack into a free block is not a diplomacy option');

  blocker.tapped = true;
  game.recalc();
  options = game.diplomacyClauseOptions(human, bot);
  assert.equal(options.some(option => option.key === `pressure_player:${leader.idx}`), true,
    'the pressure option appears when combat is tactically sound');

  const offered = game.proposeDiplomacy(
    bot, human,
    `pressure_player:${leader.idx}`,
    `no_target_player:${human.idx}`,
  );
  assert.equal(offered.status, 'pending-human');
  assert.equal(game.respondToDiplomacyProposal(offered.proposal.id, true, human).status, 'accepted');

  blocker.tapped = false;
  game.recalc();
  assert.equal(game.diplomacyRequiredAttackTarget(human), null,
    'the agreement must not force the now-losing attack');
  const clause = activeClause(game, 'pressure_player', human, bot);
  assert.equal(clause.state, 'void');
  assert.match(clause.completionReason, /free block did not count as able/i);
});

test('bot-to-bot politics hard-pauses the checkpoint until the human clicks Proceed', async () => {
  const { game, players: [human, botA, botB] } = makeGame();
  human.life = 500;
  addCreature(game, botA, 'Inferno Titan');
  addCreature(game, botB, 'Stormcatch Mentor');

  let review = null;
  let release = null;
  human.controller = {
    decide(_game, q) {
      review = q;
      return new Promise(resolve => { release = resolve; });
    },
  };
  let settled = false;
  const checkpoint = game.processDiplomacyCheckpoint(botA).then(result => {
    settled = true;
    return result;
  });
  await Promise.resolve();

  assert.equal(review.type, 'diplomacyReview');
  assert.equal(review.source, 'bot-checkpoint');
  assert.equal(review.proposal.fromId, botA.idx);
  assert.notEqual(review.proposal.toId, human.idx);
  assert.notEqual(review.proposal.toId, botA.idx);
  assert.equal(settled, false, 'the active bot must not continue before Proceed');
  release({ status: 'proceeded' });
  const result = await checkpoint;
  assert.equal(result.status, 'accepted');
  assert.equal(settled, true);
});

test('bot-to-human offer hard-pauses until the human accepts or declines', async () => {
  const { game, players: [human, botA, leader, botB] } = makeGame();
  leader.life = 500;
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, botA, 'Inferno Titan');
  addCreature(game, leader, 'Inferno Titan');
  addCreature(game, botB);

  let review = null;
  let release = null;
  human.controller = {
    decide(_game, q) {
      review = q;
      return new Promise(resolve => { release = resolve; });
    },
  };
  let settled = false;
  const checkpoint = game.processDiplomacyCheckpoint(botA).then(result => {
    settled = true;
    return result;
  });
  await Promise.resolve();

  assert.equal(review.type, 'diplomacyReview');
  assert.equal(review.proposal.status, 'pending-human');
  assert.equal(review.proposal.toId, human.idx);
  assert.equal(settled, false);
  const decision = game.respondToDiplomacyProposal(review.proposal.id, true, human);
  assert.equal(decision.status, 'accepted');
  release(decision);
  await checkpoint;
  assert.equal(settled, true);
  assert.equal(game.diplomacy.contracts.length, 1);
});

test('a human-initiated offer result waits for an explicit Proceed review', async () => {
  const { game, players: [human, bot] } = makeGame();
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, bot);
  const result = game.proposeDiplomacy(human, bot, `no_attack:${human.idx}`, `no_attack:${bot.idx}`);
  assert.equal(result.status, 'accepted');

  let review = null;
  let release = null;
  human.controller = {
    decide(_game, q) {
      review = q;
      return new Promise(resolve => { release = resolve; });
    },
  };
  let settled = false;
  const wait = game.reviewDiplomacyWithHuman({
    source: 'human-offer', status: result.status, proposal: result.proposal, contract: result.contract,
  }).then(value => {
    settled = true;
    return value;
  });
  await Promise.resolve();

  assert.equal(review.type, 'diplomacyReview');
  assert.equal(review.source, 'human-offer');
  assert.equal(settled, false);
  release({ status: 'proceeded' });
  await wait;
  assert.equal(settled, true);
});

test('a three-player table deal binds an announced removal spell to its public target and records the attempt', () => {
  const { game, players: [human, leader, supporterA, supporterB] } = makeGame();
  game.turnPlayer = human;
  game.phase = 'main1';
  game.step = 'main';
  leader.life = 500;
  const threat = addCreature(game, leader, 'Inferno Titan');
  addCreature(game, supporterA);
  addCreature(game, supporterB);
  addCreature(game, human);
  addLand(game, human); addLand(game, human); addLand(game, human);
  const removal = new MTG.CardInst(MTG.DEFS['Beast Within'], human);
  removal.zone = 'hand'; human.hand.push(removal);
  game.recalc();

  const options = game.diplomacyGroupRemovalOptions(human);
  assert.ok(options.length > 0);
  assert.equal(options[0].targetCardId, threat.iid);
  assert.equal(options[0].participantIds.length, 3);
  const result = game.proposeGroupRemovalDiplomacy(human, options[0].key);
  assert.equal(result.status, 'accepted');
  assert.equal(result.contract.kind, 'group-removal');
  assert.equal(result.contract.clauses.filter(clause => clause.type === 'no_attack').length, 1,
    'the table deal must preserve the one-combat-shield anti-abuse rule');

  const spec = game.spellTargetSpecs(removal, { from: 'hand' }, human)[0];
  const legal = game.legalTargets(spec, removal, human);
  assert.equal(legal.length, 1);
  assert.equal(legal[0], threat);
  game.diplomacyRecordRemovalAttempt(human, removal, [[threat]]);
  const promise = result.contract.clauses.find(clause => clause.type === 'remove_permanent');
  assert.equal(promise.state, 'fulfilled');
  assert.match(promise.completionReason, /cast targeting/);
});

test('an AI remover prioritizes the exact spell it publicly promised in a table deal', async () => {
  const { game, players: [human, leader, remover, supporter] } = makeGame();
  game.turnPlayer = remover;
  game.phase = 'main1';
  game.step = 'main';
  leader.life = 500;
  addCreature(game, leader, 'Inferno Titan');
  addCreature(game, human);
  addCreature(game, remover);
  addCreature(game, supporter);
  addLand(game, remover); addLand(game, remover); addLand(game, remover);
  const removal = new MTG.CardInst(MTG.DEFS['Beast Within'], remover);
  removal.zone = 'hand'; remover.hand.push(removal);
  game.recalc();

  const option = game.diplomacyGroupRemovalOptions(remover)[0];
  const proposal = game.proposeGroupRemovalDiplomacy(remover, option.key);
  assert.equal(proposal.status, 'pending-human');
  const accepted = game.respondToDiplomacyProposal(proposal.proposal.id, true, human);
  assert.equal(accepted.status, 'accepted');

  const action = await remover.controller.decide(game, {
    type: 'main', player: remover, casts: game.castableList(remover), acts: [], lands: [], phase: game.phase,
  });
  assert.equal(action.kind, 'cast');
  assert.equal(action.card, removal);
});

test('the response model accepts, counters, and rejects across a broad offer matrix instead of auto-accepting', () => {
  const counts = { accepted: 0, countered: 0, rejected: 0, total: 0 };
  for (let sample = 1; sample <= 12; sample++) {
    const spec = {
      humanLife: 28 + (sample % 4) * 6,
      botLife: 25 + (sample % 5) * 5,
      thirdLife: 32 + (sample % 3) * 4,
      humanCreatures: 1 + (sample % 4),
      botCreatures: 1 + ((sample * 3) % 4),
    };
    const template = makeOfferState(spec);
    const requestCount = template.game.diplomacyClauseOptions(template.players[1], template.players[0]).length;
    const offerCount = template.game.diplomacyClauseOptions(template.players[0], template.players[1]).length;
    for (let requestIndex = 0; requestIndex < requestCount; requestIndex++) {
      for (let offerIndex = 0; offerIndex < offerCount; offerIndex++) {
        const { game, players: [human, bot] } = makeOfferState(spec);
        const requests = game.diplomacyClauseOptions(bot, human);
        const offers = game.diplomacyClauseOptions(human, bot);
        const result = game.proposeDiplomacy(human, bot, requests[requestIndex].key, offers[offerIndex].key);
        counts[result.status]++;
        counts.total++;
      }
    }
  }
  const acceptanceRate = counts.accepted / counts.total;
  assert.ok(acceptanceRate >= 0.2 && acceptanceRate <= 0.55, `unexpected acceptance rate ${acceptanceRate}`);
  assert.ok(counts.countered > 0, 'matrix should produce counteroffers');
  assert.ok(counts.rejected > 0, 'matrix should produce direct rejections');
});

test('a counteroffer is explicitly linked to the human original proposal', () => {
  let found = null;
  for (let sample = 1; sample <= 12 && !found; sample++) {
    const spec = { humanLife: 34, botLife: 40, thirdLife: 36, humanCreatures: sample % 3 + 1, botCreatures: 2 };
    const template = makeOfferState(spec);
    const requestCount = template.game.diplomacyClauseOptions(template.players[1], template.players[0]).length;
    const offerCount = template.game.diplomacyClauseOptions(template.players[0], template.players[1]).length;
    for (let requestIndex = 0; requestIndex < requestCount && !found; requestIndex++) {
      for (let offerIndex = 0; offerIndex < offerCount && !found; offerIndex++) {
        const { game, players: [human, bot] } = makeOfferState(spec);
        const requests = game.diplomacyClauseOptions(bot, human);
        const offers = game.diplomacyClauseOptions(human, bot);
        const originalId = game.diplomacy.nextProposalId;
        const result = game.proposeDiplomacy(human, bot, requests[requestIndex].key, offers[offerIndex].key);
        if (result.status === 'countered') found = { game, human, originalId, result };
      }
    }
  }
  assert.ok(found, 'expected at least one counteroffer in the search space');
  assert.equal(found.result.proposal.isCounteroffer, true);
  assert.equal(found.result.proposal.originalProposalId, found.originalId);
  const incoming = found.game.diplomacyView(found.human).incoming[0];
  assert.equal(incoming.isCounteroffer, true);
  assert.equal(incoming.originalProposalId, found.originalId);
});

test('bot response does not change when only the human hidden hand changes', () => {
  const run = withHiddenCard => {
    const { game, players: [human, bot] } = makeGame();
    if (withHiddenCard) {
      const hidden = new MTG.CardInst(MTG.DEFS['Beast Within'], human);
      hidden.zone = 'hand'; human.hand.push(hidden);
    }
    const result = game.proposeDiplomacy(
      human, bot,
      `no_target_player:${human.idx}`,
      `no_target_player:${bot.idx}`,
    );
    return { status: result.status, reason: result.reason };
  };
  assert.deepEqual(run(false), run(true));
});

test('a bot never evaluates another bot hidden hand while considering its promise', () => {
  const run = withHiddenCard => {
    const { game, players: [, proposer, recipient] } = makeGame();
    addCreature(game, proposer);
    addCreature(game, recipient);
    if (withHiddenCard) {
      const hidden = new MTG.CardInst(MTG.DEFS['Beast Within'], proposer);
      hidden.zone = 'hand'; proposer.hand.push(hidden);
    }
    const result = game.proposeDiplomacy(
      proposer, recipient,
      `no_target_player:${proposer.idx}`,
      `no_target_player:${recipient.idx}`,
    );
    return { status: result.status, reason: result.reason };
  };
  assert.deepEqual(run(false), run(true));
});

test('agreements complete at their exact combat or turn boundary and diplomacy closes at heads-up', () => {
  const { game, players: [human, bot, third, fourth] } = makeGame();
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, human, 'Inferno Titan');
  addCreature(game, bot);
  const result = game.proposeDiplomacy(human, bot, `no_attack:${human.idx}`, `no_attack:${bot.idx}`);
  assert.equal(result.status, 'accepted');
  game.diplomacyAfterCombat(bot);
  assert.equal(activeClause(game, 'no_attack', bot, human).state, 'fulfilled');
  game.diplomacyAfterCombat(human);
  assert.equal(game.diplomacy.contracts[0].status, 'completed');

  third.lost = true;
  fourth.lost = true;
  assert.equal(game.diplomacyStatus().unlocked, false);
  assert.match(game.diplomacyStatus().reason, /only two players/);
});

test('a targeting promise made during the actor turn survives that cleanup and ends after their following turn', () => {
  const { game, players: [human, bot] } = makeGame();
  game.turnPlayer = human;
  addCreature(game, human);
  addCreature(game, bot, 'Inferno Titan');
  const result = game.proposeDiplomacy(
    human, bot,
    `no_target_player:${human.idx}`,
    `no_target_player:${bot.idx}`,
  );
  assert.equal(result.status, 'accepted');

  game.diplomacyEndTurn(human);
  assert.equal(activeClause(game, 'no_target_player', human, bot).state, 'active');
  human.turnsStarted++;
  game.diplomacyEndTurn(human);
  assert.equal(activeClause(game, 'no_target_player', human, bot).state, 'fulfilled');
  assert.equal(activeClause(game, 'no_target_player', bot, human).state, 'active');
});
