import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { aiIsolationFingerprint } from './helpers/run-ai-adversarial-games.mjs';

const MTG = loadEngine();
const styles = Object.keys(MTG.AI_STYLES).filter(style => style !== 'random');

function fixture(style = 'balanced', difficulty = 'normal') {
  const game = new MTG.Game({ seed: 83077, paced: false, maxTurns: 100 });
  const deck = MTG.DECKS['Quick Draw'];
  const bot = game.addPlayer('Attacker', deck, null, true);
  const rival = game.addPlayer('Defender', deck, null, true);
  bot.controller = new MTG.AIController(bot, { style, difficulty });
  rival.controller = new MTG.AIController(rival, { style: 'balanced', difficulty });
  game.turnPlayer = bot; game.turnNo = 25; game.phase = 'combat'; game.step = 'attackers';
  return { game, bot, rival };
}

function creature(game, owner, name, power, toughness = power, kws = []) {
  const card = new MTG.CardInst({ name, types: ['Creature'], super: [], subtypes: [],
    cost: '{3}', power: String(power), toughness: String(toughness), kws, oracle: '', abilities: [] }, owner);
  card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card);
  return card;
}

function tokens(game, owner, n) {
  return Array.from({ length: n }, (_, i) => {
    const card = creature(game, owner, `Token ${i}`, 1);
    card.isToken = true;
    return card;
  });
}

async function attack(game, bot, forced = []) {
  game.recalc();
  const difficulty = bot.controller.difficulty;
  const before = aiIsolationFingerprint(game);
  const q = { type: 'attackers', player: bot,
    eligible: game.creatures(bot).filter(card => !card.tapped && !card.sick && game.canAttackAtAll(card)),
    opponents: bot.opponents(game), forced };
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx,
    difficulty, seed: 5, actionWindow: q, forceSearch: false });
  assert.equal(aiIsolationFingerprint(game), before, 'planning preserves the live board');
  assert.equal(decision.log.fallback, false);
  return decision.action.assignments;
}

async function resolveBlocks(game, bot, rival, attacker, blockers) {
  attacker.attacking = rival; attacker.tapped = true;
  attacker.blockedBy = blockers.slice(); attacker.wasBlocked = blockers.length > 0;
  for (const blocker of blockers) blocker.blocking = attacker.iid;
  game.combat = { attackers: [attacker], blockersDeclared: true };
  if ([attacker, ...blockers].some(card => card.kw('first strike') || card.kw('double strike'))) {
    await game.combatDamage(bot, 'first');
  }
  await game.combatDamage(bot, 'normal');
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of styles) {
  for (const threshold of ['life', 'commander']) test(`${style}/${difficulty}: no false ${threshold} lethal through a deathtouch chump`, async () => {
    const { game, bot, rival } = fixture(style, difficulty);
    const big = creature(game, bot, 'Large commander', 10);
    big.commander = true;
    creature(game, rival, 'Deathtouch defender', 1, 1, ['deathtouch']);
    if (threshold === 'life') rival.life = 2;
    else rival.commanderDamage[big.iid] = 20;
    const assignments = await attack(game, bot);
    assert.equal(assignments.length, 0);
    const assessment = MTG.assessAttackAssignment(game, bot, big, rival);
    assert.equal(assessment.expectedDamage, 0);
    assert.equal(assessment.lethal || assessment.commanderLethal, false);
  });

  for (const marked of [false, true]) test(`${style}/${difficulty}: preserves a commander against ${marked ? 'three tokens plus marked damage' : 'four tokens'}`, async () => {
    const { game, bot, rival } = fixture(style, difficulty);
    const commander = creature(game, bot, '3/4 commander', 3, 4);
    commander.commander = true; commander.damage = marked ? 1 : 0;
    tokens(game, rival, marked ? 3 : 4);
    assert.equal((await attack(game, bot)).length, 0);
    assert.ok(MTG.assessAttackAssignment(game, bot, commander, rival).bestTradeLoss > 0);
  });
}

test('three ordinary 1/1s do not kill an undamaged 3/4; a useful attack remains available', async () => {
  const { game, bot, rival } = fixture('aggressive');
  const commander = creature(game, bot, 'Healthy commander', 3, 4); commander.commander = true;
  const blockers = tokens(game, rival, 3);
  assert.equal((await attack(game, bot)).length, 1);
  assert.equal(MTG.assessAttackAssignment(game, bot, commander, rival).bestTradeLoss, 0);
  await resolveBlocks(game, bot, rival, commander, blockers);
  assert.equal(commander.zone, 'battlefield');
  assert.equal(commander.damage, 3);
  assert.ok(blockers.every(card => card.zone !== 'battlefield'));
});

for (const marked of [false, true]) test(`AI can find and execute a profitable ${marked ? 'triple' : 'quadruple'} block`, async () => {
  const { game, bot, rival } = fixture();
  const commander = creature(game, bot, 'Enemy commander', 3, 4); commander.commander = true;
  commander.damage = marked ? 1 : 0;
  const potential = tokens(game, rival, marked ? 3 : 4);
  game.recalc(); commander.attacking = rival; game.step = 'blockers'; game.combat = { attackers: [commander] };
  const assignments = await rival.controller.decide(game, { type: 'blockers', player: rival, attackers: [commander], potential });
  assert.equal(assignments.length, potential.length);
  assert.ok(game.blockDeclarationLegal([commander], assignments));
  await resolveBlocks(game, bot, rival, commander, assignments.map(item => item.blocker));
  assert.notEqual(commander.zone, 'battlefield');
  assert.equal(rival.life, 40);
});

for (const keyword of ['first strike', 'double strike', 'indestructible', 'flying']) test(`${keyword} prevents a false deathtouch threat`, async () => {
  const { game, bot, rival } = fixture('aggressive');
  const big = creature(game, bot, 'Safe attacker', 6, 6, [keyword]);
  creature(game, rival, 'Deathtouch defender', 1, 1, ['deathtouch']);
  game.recalc();
  assert.equal(MTG.assessAttackAssignment(game, bot, big, rival).bestTradeLoss, 0);
  assert.ok((await attack(game, bot)).some(item => item.card === big));
});

test('trample lethal is still taken even when a deathtouch blocker kills the attacker', async () => {
  const { game, bot, rival } = fixture(); rival.life = 5;
  const big = creature(game, bot, 'Trampler', 6, 6, ['trample']);
  const blocker = creature(game, rival, 'Deathtouch defender', 1, 1, ['deathtouch']);
  assert.equal((await attack(game, bot)).length, 1);
  await resolveBlocks(game, bot, rival, big, [blocker]);
  assert.equal(game.winner, bot);
});

test('mandatory attacks remain available through a bad trade', async () => {
  const { game, bot, rival } = fixture();
  const big = creature(game, bot, 'Forced attacker', 6);
  creature(game, rival, 'Deathtouch defender', 1, 1, ['deathtouch']);
  assert.ok((await attack(game, bot, [big])).some(item => item.card === big));
});

test('the fallback controller also preserves commanders against joint blocks', () => {
  for (const style of styles) {
    const { game, bot, rival } = fixture(style);
    const commander = creature(game, bot, 'Commander', 3, 4); commander.commander = true;
    tokens(game, rival, 4); game.recalc();
    const assignments = bot.controller.attackers(game, { eligible: [commander], opponents: [rival], forced: [] });
    assert.equal(assignments.length, 0, style);
  }
});

for (const kind of ['tapped', 'zero power', 'menace']) test(`${kind} prevents an inapplicable deathtouch block`, async () => {
  const { game, bot, rival } = fixture('aggressive');
  const big = creature(game, bot, 'Attacker', 6, 6, kind === 'menace' ? ['menace'] : []);
  const blocker = creature(game, rival, 'Deathtouch defender', kind === 'zero power' ? 0 : 1, 1, ['deathtouch']);
  blocker.tapped = kind === 'tapped'; game.recalc();
  assert.equal(MTG.assessAttackAssignment(game, bot, big, rival).bestTradeLoss, 0);
  assert.equal((await attack(game, bot)).length, 1);
});

test('first strike deathtouch stops trample before any player damage', async () => {
  const { game, bot, rival } = fixture('aggressive'); rival.life = 1;
  const big = creature(game, bot, 'Trampler', 8, 8, ['trample']);
  const blocker = creature(game, rival, 'First strike deathtouch', 1, 1, ['first strike', 'deathtouch']);
  assert.equal((await attack(game, bot)).length, 0);
  assert.equal(MTG.assessAttackAssignment(game, bot, big, rival).expectedDamage, 0);
  await resolveBlocks(game, bot, rival, big, [blocker]);
  assert.equal(big.zone, 'graveyard');
  assert.equal(rival.life, 1);
});

test('a first striking commander survives four ordinary tokens', async () => {
  const { game, bot, rival } = fixture('aggressive');
  const commander = creature(game, bot, 'First strike commander', 3, 4, ['first strike']); commander.commander = true;
  const blockers = tokens(game, rival, 4);
  assert.equal((await attack(game, bot)).length, 1);
  assert.equal(MTG.assessAttackAssignment(game, bot, commander, rival).bestTradeLoss, 0);
  await resolveBlocks(game, bot, rival, commander, blockers);
  assert.equal(commander.zone, 'battlefield');
  assert.equal(commander.damage, 1);
});

test('deathtouch remains visible behind a wide board and earlier fodder attackers', async () => {
  const { game, bot, rival } = fixture('aggressive');
  bot.life = 400;
  const big = creature(game, bot, 'Large commander', 12); big.commander = true;
  const fodder = tokens(game, bot, 5);
  for (let i = 0; i < 24; i++) creature(game, rival, `Other defender ${i}`, 0, 2);
  creature(game, rival, 'Small deathtouch defender', 1, 1, ['deathtouch']);
  game.recalc();
  const assessment = MTG.assessAttackAssignment(game, bot, big, rival, fodder.length);
  assert.equal(assessment.expectedDamage, 0);
  assert.ok(assessment.bestTradeLoss > 0);
  assert.ok(!(await attack(game, bot)).some(item => item.card === big));
});

test('pressure on a strong opponent does not reward donating a commander', async () => {
  for (const style of styles) {
    const { game, bot, rival } = fixture(style); bot.life = 400;
    const big = creature(game, bot, 'Large commander', 10); big.commander = true;
    creature(game, rival, 'Deathtouch defender', 1, 1, ['deathtouch']);
    for (let i = 0; i < 10; i++) creature(game, rival, `Tapped threat ${i}`, 10).tapped = true;
    assert.equal((await attack(game, bot)).length, 0, style);
  }
});

test('an even exchange remains a meaningful attack against the leader', () => {
  const { game, bot, rival } = fixture(); rival.life = 500;
  const attacker = creature(game, bot, 'Equal attacker', 6);
  creature(game, rival, 'Equal blocker', 6); game.recalc();
  const assessment = MTG.assessAttackAssignment(game, bot, attacker, rival);
  assert.equal(assessment.bestTradeLoss, 0);
  assert.equal(assessment.freeBlock, false);
  assert.ok(assessment.dealsDamage);
});
