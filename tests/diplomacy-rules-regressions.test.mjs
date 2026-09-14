import assert from 'node:assert/strict';
import test from 'node:test';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();

function table() {
  const game = new M.Game({seed: 11, paced: false, maxTurns: 20});
  const players = ['You', 'Bot', 'Wolf', 'Raven'].map((name, index) => {
    const p = game.addPlayer(name, {name}, null, index > 0);
    p.isAI = index > 0;
    p.turnsStarted = 3;
    p.controller = new M.AIController(p, {difficulty: 'normal', style: 'balanced'});
    return p;
  });
  game.turnPlayer = players[0]; game.phase = 'main1'; game.step = 'main';
  M.initDiplomacy(game, true);
  return {game, players};
}

function put(game, owner, name = 'Inferno Titan', zone = 'battlefield') {
  const card = new M.CardInst(M.DEFS[name], owner);
  card.ctrl = owner; card.zone = zone; card.sick = false; card.tapped = false;
  (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
  game.recalc();
  return card;
}

function contract(game, actor, beneficiary, type, fields = {}) {
  const clause = {type, actorId: actor.idx, beneficiaryId: beneficiary.idx,
    state: 'active', createdActorTurns: actor.turnsStarted, ...fields};
  const agreement = {id: game.diplomacy.nextContractId++, fromId: actor.idx, toId: beneficiary.idx,
    participantIds: [actor.idx, beneficiary.idx], status: 'active', clauses: [clause]};
  game.diplomacy.contracts.push(agreement);
  return clause;
}

function desperateBot() {
  const f = table(), [human, bot] = f.players;
  bot.life = 4;
  put(f.game, human); put(f.game, human); put(f.game, bot);
  return f;
}

test('a saved pending tribute cannot be accepted, and expires without spending or moving cards', () => {
  const {game, players: [human, bot]} = desperateBot();
  const card = game.creatures(bot)[0];
  const old = {id: 77, fromId: bot.idx, toId: human.idx, lastStand: true, status: 'pending-human',
    request: {type: 'amnesty', actorId: human.idx, beneficiaryId: bot.idx},
    offer: {type: 'tribute_permanent', actorId: bot.idx, beneficiaryId: human.idx, targetCardId: card.iid}};
  game.diplomacy.proposals.push(old);
  assert.equal(game.diplomacyView(human).incoming.length, 0);
  assert.equal(game.respondToDiplomacyProposal(77, true, human).status, 'rejected');
  assert.equal(old.status, 'expired');
  assert.equal(card.zone, 'battlefield');
  assert.equal(game.diplomacy.contracts.length, 0);
});

test('Politics leaves a real sacrifice activation payable and its effect on the normal stack', async () => {
  const {game, players: [human]} = table();
  game.priorityRound = async () => {};
  const seer = put(game, human, 'Viscera Seer');
  const fodder = put(game, human, 'Grizzly Bears');
  put(game, human, 'Forest', 'library');
  let scries = 0;
  human.controller = {decide: async (g, q) => {
    if (q.type === 'chooseCards' && q.aiHint?.kind === 'sacCost') return [fodder];
    if (q.type === 'scry') { scries++; return {top: q.cards, bottom: []}; }
    return null;
  }};
  const entry = game.activatableList(human, true).find(row => row.card === seer);
  assert.ok(entry);
  assert.equal(await game.activateAbility(human, entry), true);
  assert.equal(fodder.zone, 'graveyard');
  assert.equal(seer.zone, 'battlefield');
  assert.equal(scries, 0);
  assert.equal(game.stack.length, 1);
  await game.resolveTop();
  assert.equal(scries, 1);
});

test('low life alone does not make a bot interrupt players who cannot threaten it', async () => {
  const {game, players: [, bot]} = table();
  bot.life = 4;
  assert.equal(game.diplomacyLastStandStatus(bot).eligible, true, 'the manual emergency composer remains available');
  assert.equal(await game.processDiplomacyCheckpoint(bot), null);
  assert.equal(game.diplomacy.proposals.length, 0);
});

test('bots do not offer truces against summoning-sick attackers', async () => {
  const {game, players: [human, bot]} = table();
  bot.life = 4;
  const threat = put(game, human, 'Grizzly Bears'); threat.sick = true;
  assert.equal(game.diplomacyClauseOptions(human, bot).some(option => option.type === 'no_attack'), false);
  await game.processDiplomacyCheckpoint(bot);
  assert.equal(game.diplomacy.proposals.some(proposal => proposal.lastStand), false);
});

test('declining a last stand prevents an unchanged offer in the next round, including after a save', async () => {
  const {game, players: [human, bot]} = desperateBot();
  const opening = await game.processDiplomacyCheckpoint(bot);
  assert.equal(opening.status, 'pending-human');
  game.respondToDiplomacyProposal(opening.proposal.id, false, human);
  for (const p of game.players) p.turnsStarted++;
  const snapshot = M.captureGameState(game);
  assert.ok(snapshot);
  const restored = table().game;
  M.restoreGameState(restored, JSON.parse(JSON.stringify(snapshot)));
  const [savedHuman, savedBot] = restored.players;
  const closed = restored.diplomacyLastStandOptions(savedBot, savedHuman);
  assert.equal(closed.eligible, false);
  assert.match(closed.reason, /not meaningfully changed/);
  await restored.processDiplomacyCheckpoint(savedBot);
  assert.equal(restored.diplomacy.proposals.filter(proposal => proposal.lastStand).length, 1);
  savedBot.life = 2;
  assert.equal(restored.diplomacyLastStandOptions(savedBot, savedHuman).eligible, true);
});

test('only one unsolicited last stand interrupts a table round across all bots', async () => {
  const {game, players: [human, bot, wolf]} = desperateBot();
  wolf.life = 4; put(game, wolf);
  const first = await game.processDiplomacyCheckpoint(bot);
  assert.equal(first.status, 'pending-human');
  game.respondToDiplomacyProposal(first.proposal.id, false, human);
  await game.processDiplomacyCheckpoint(wolf);
  assert.equal(game.diplomacy.proposals.filter(proposal => proposal.lastStand).length, 1);
});

test('the bot last-stand budget is independent of ordinary checkpoint negotiations', async () => {
  const {game, players: [, bot]} = desperateBot();
  game.diplomacy.botRoundCounts['3'] = 1;
  const result = await game.processDiplomacyCheckpoint(bot);
  assert.equal(result.status, 'pending-human');
  assert.equal(result.proposal.lastStand, true);
});

test('an unanswered offer prevents another ordinary or last-stand proposal', () => {
  const {game, players: [human, bot, wolf]} = desperateBot();
  wolf.life = 4;
  const first = game.proposeLastStandDiplomacy(bot, human, `amnesty:${bot.idx}`, `vassal_pledge:${human.idx}`);
  assert.equal(first.status, 'pending-human');
  const second = game.proposeLastStandDiplomacy(wolf, human, `amnesty:${wolf.idx}`, `vassal_pledge:${human.idx}`);
  assert.equal(second.status, 'rejected');
  assert.match(second.reason, /unanswered/);
  const ordinary = game.proposeDiplomacy(human, wolf, `no_target_player:${human.idx}`, `no_target_player:${wolf.idx}`);
  assert.equal(ordinary.status, 'rejected');
  assert.match(ordinary.reason, /unanswered/);
  assert.equal(game.diplomacy.proposals.length, 1);
});

test('an emergency offer expires if its proposer recovers before acceptance', () => {
  const {game, players: [human, bot]} = desperateBot();
  const first = game.proposeLastStandDiplomacy(bot, human, `amnesty:${bot.idx}`, `vassal_pledge:${human.idx}`);
  bot.life = 40;
  const result = game.respondToDiplomacyProposal(first.proposal.id, true, human);
  assert.equal(result.status, 'rejected');
  assert.equal(first.proposal.status, 'expired');
  assert.equal(game.diplomacy.contracts.length, 0);
});

test('a player leaving expires an unanswered offer while three players remain', () => {
  const {game, players: [human, bot]} = desperateBot();
  const first = game.proposeLastStandDiplomacy(bot, human, `amnesty:${bot.idx}`, `vassal_pledge:${human.idx}`);
  bot.lost = true;
  assert.equal(game.diplomacyView(human).incoming.length, 0);
  assert.equal(first.proposal.status, 'expired');
});

for (const type of ['no_target_player', 'amnesty', 'vassal_pledge']) {
  test(`${type} protects the named player and permanents without shielding spells or graveyards`, () => {
    const {game, players: [human, bot]} = table();
    const body = put(game, human, 'Grizzly Bears');
    const grave = put(game, human, 'Grizzly Bears', 'graveyard');
    const spell = {kind: 'spell', name: 'Grizzly Bears', card: body, ctrl: human};
    game.stack.push(spell);
    contract(game, bot, human, type);
    const allowed = game.diplomacyFilterTargets([human, body, grave, spell], {diplomacyHostile: true}, null, bot);
    assert.deepEqual(Array.from(allowed), [grave, spell]);
    contract(game, bot, human, 'let_resolve', {stackId: game.diplomacyStackKey(spell)});
    assert.equal(game.diplomacyFilterTargets([spell], {diplomacyHostile: true}, null, bot).length, 0);
  });
}

test('helpful untaps and chosen helpful modes remain available through targeting restraint', () => {
  const {game, players: [human, bot]} = table();
  const body = put(game, human, 'Grizzly Bears');
  const source = put(game, bot, 'Cryptic Command', 'hand');
  contract(game, bot, human, 'no_target_player');
  for (const prompt of ['Untap target creature', 'Target player draws a card', 'Target creature gains indestructible']) {
    assert.equal(game.diplomacyFilterTargets([body], {prompt}, source, bot)[0], body, prompt);
  }
  for (const prompt of ['Tap target creature', 'Gain control of target creature', 'Return target creature to its owner’s hand']) {
    assert.equal(game.diplomacyFilterTargets([body], {prompt}, source, bot).length, 0, prompt);
  }
});

test('an accepted protection promise does not attach to a blinked incarnation of the same card', async () => {
  const {game, players: [human, bot]} = table();
  const body = put(game, human, 'Grizzly Bears');
  const other = put(game, bot, 'Grizzly Bears');
  const first = game.proposeDiplomacy(bot, human, `protect_permanent:${other.iid}`, `protect_permanent:${body.iid}`);
  assert.equal(first.status, 'pending-human');
  const accepted = game.respondToDiplomacyProposal(first.proposal.id, true, human);
  assert.equal(accepted.status, 'accepted');
  const promise = accepted.contract.clauses.find(clause => clause.type === 'protect_permanent' && clause.actorId === bot.idx);
  await game.move(body, 'exile');
  await game.move(body, 'battlefield');
  game.recalc();
  assert.equal(game.diplomacyFilterTargets([body], {diplomacyHostile: true}, null, bot)[0], body);
  assert.equal(promise.state, 'void');
});

test('a protection proposal cannot be accepted for a blinked permanent', async () => {
  const {game, players: [human, bot]} = table();
  const body = put(game, human, 'Grizzly Bears');
  const other = put(game, bot, 'Grizzly Bears');
  const first = game.proposeDiplomacy(bot, human, `protect_permanent:${other.iid}`, `protect_permanent:${body.iid}`);
  assert.equal(first.status, 'pending-human');
  await game.move(body, 'exile'); await game.move(body, 'battlefield'); game.recalc();
  const accepted = game.respondToDiplomacyProposal(first.proposal.id, true, human);
  assert.equal(accepted.status, 'rejected');
  assert.equal(first.proposal.status, 'expired');
});

test('a two-combat pledge skips an unsafe first combat and still binds the second', () => {
  const {game, players: [human, bot, leader]} = table();
  leader.life = 500;
  put(game, human, 'Stormcatch Mentor');
  const blocker = put(game, leader);
  const promise = contract(game, human, bot, 'crusade_pledge', {targetPlayerId: leader.idx, combatsRemaining: 2});
  assert.equal(game.diplomacyRequiredAttackTarget(human), null);
  assert.equal(promise.state, 'active');
  game.diplomacyAfterCombat(human);
  blocker.tapped = true;
  assert.equal(game.diplomacyRequiredAttackTarget(human), leader);
  game.diplomacyAfterCombat(human);
  assert.equal(promise.state, 'fulfilled');
});

for (const type of ['pressure_player', 'crusade_pledge']) {
  test(`${type} stops binding attacks when the named opponent is no longer the runaway threat`, () => {
    const {game, players: [human, bot, leader]} = table();
    leader.life = 500; put(game, human, 'Stormcatch Mentor');
    const promise = contract(game, human, bot, type, {targetPlayerId: leader.idx, combatsRemaining: 2});
    assert.equal(game.diplomacyRequiredAttackTarget(human), leader);
    leader.life = 40;
    assert.equal(game.diplomacyRequiredAttackTarget(human), null);
    assert.equal(promise.state, 'void');
    assert.match(promise.completionReason, /no longer the runaway/);
  });
}

test('the table-removal API enforces proposal limits without relying on a disabled UI button', () => {
  const {game, players: [human, leader, wolf, raven]} = table();
  leader.life = 500; put(game, leader); put(game, wolf); put(game, raven);
  put(game, human, 'Beast Within', 'hand');
  human.pool.G = 3;
  const option = game.diplomacyGroupRemovalOptions(human)[0];
  assert.ok(option);
  game.diplomacy.proposalCounts['3:0'] = 2;
  const refused = game.proposeGroupRemovalDiplomacy(human, option.key);
  assert.equal(refused.status, 'rejected');
  assert.match(refused.reason, /both proposals/);
  assert.equal(game.diplomacy.contracts.length, 0);
});

test('pending table removal cannot retarget a threat that left and returned', async () => {
  const {game, players: [human, leader, remover, raven]} = table();
  leader.life = 500;
  const target = put(game, leader, 'Grizzly Bears');
  put(game, human); put(game, remover); put(game, raven);
  put(game, remover, 'Beast Within', 'hand'); remover.pool.G = 3;
  game.turnPlayer = remover;
  const option = game.diplomacyGroupRemovalOptions(remover)[0];
  const first = game.proposeGroupRemovalDiplomacy(remover, option.key);
  assert.equal(first.status, 'pending-human');
  await game.move(target, 'exile'); await game.move(target, 'battlefield'); game.recalc();
  const answer = game.respondToDiplomacyProposal(first.proposal.id, true, human);
  assert.equal(answer.status, 'rejected');
  assert.equal(first.proposal.status, 'expired');
});
