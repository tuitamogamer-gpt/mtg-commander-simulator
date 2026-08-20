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

test('a balanced reciprocal combat truce is accepted and filters voluntary attacks', () => {
  const { game, players: [human, bot, third] } = makeGame();
  const humanCreature = addCreature(game, human);
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
  addCreature(game, human);
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
  addCreature(game, human);
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

test('bot-bot negotiations use the same public rules and create visible contracts only when a runaway threat exists', () => {
  const { game, players: [human, botA, botB] } = makeGame();
  human.life = 500;
  addCreature(game, botA, 'Inferno Titan');
  addCreature(game, botB, 'Stormcatch Mentor');
  const result = game.processDiplomacyCheckpoint(botA);

  assert.equal(result.status, 'accepted');
  assert.equal(result.contract.fromId, botA.idx);
  assert.equal(result.contract.toId, botB.idx);
  assert.ok(result.contract.clauses.some(clause => clause.type === 'pressure_player' && clause.targetPlayerId === human.idx));
  assert.ok(result.contract.clauses.some(clause => clause.type === 'no_attack'));
  assert.match(game.log.at(-1).msg, /Agreement #/);
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

test('agreements complete at their exact combat or turn boundary and diplomacy closes at heads-up', () => {
  const { game, players: [human, bot, third, fourth] } = makeGame();
  addCreature(game, human);
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
