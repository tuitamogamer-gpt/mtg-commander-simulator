import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const styles = Object.keys(MTG.AI_STYLES).filter(style => style !== 'random');

function fixture(style = 'balanced', difficulty = 'hard') {
  const game = new MTG.Game({ seed: 83077, paced: false, maxTurns: 100 });
  const players = ['Survivor', 'Weak rival', 'Strong rival', 'Fourth'].map(name =>
    game.addPlayer(name, Object.values(MTG.DECKS)[0], null, true));
  players[3].lost = true;
  const bot = players[0];
  bot.controller = new MTG.AIController(bot, { style, difficulty });
  game.turnPlayer = bot;
  game.turnNo = 35;
  game.phase = 'combat';
  game.step = 'attackers';
  return { game, bot, weak: players[1], strong: players[2] };
}

function creature(game, owner, name, power, toughness = power, kws = [], oracle = '') {
  const card = new MTG.CardInst({ name, types: ['Creature'], super: [], subtypes: [],
    cost: '{3}', power: String(power), toughness: String(toughness), kws, oracle, abilities: [] }, owner);
  card.zone = 'battlefield'; card.ctrl = owner; card.sick = false;
  game.battlefield.push(card);
  return card;
}

async function attack(game, bot, forced = []) {
  game.recalc();
  return bot.controller.decide(game, { type: 'attackers', player: bot,
    eligible: game.creatures(bot).filter(card => !card.tapped && (!card.sick || card.kw('haste')) &&
      !card.cur.cantAttack && game.canAttackAtAll(card)), opponents: bot.opponents(game), forced });
}

async function block(game, bot, attackers) {
  game.turnPlayer = attackers[0].ctrl;
  game.step = 'blockers';
  for (const card of attackers) { card.attacking = bot; card.tapped = true; }
  game.combat = { attackers };
  game.recalc();
  const assignments = await bot.controller.decide(game, { type: 'blockers', player: bot,
    attackers, potential: game.creatures(bot).filter(card => !card.tapped && !card.cur.cantBlock) });
  for (const { blocker, attacker } of assignments) {
    assert.ok(game.canBlock(blocker, attacker));
    blocker.blocking = attacker.iid;
    attacker.blockedBy.push(blocker); attacker.wasBlocked = true;
  }
  if ([...attackers, ...game.creatures(bot)].some(card => card.kw('first strike') || card.kw('double strike'))) {
    await game.combatDamage(game.turnPlayer, 'first');
  }
  await game.combatDamage(game.turnPlayer, 'normal');
  assert.equal(game.aiDecisionLog.at(-1).fallback, false);
  return assignments;
}

for (const style of styles) for (const difficulty of ['easy', 'normal', 'hard']) {
  test(`${style}/${difficulty}: keeps defense against a third player's next turn instead of a suicidal elimination`, async () => {
    const { game, bot, weak, strong } = fixture(style, difficulty);
    bot.life = 4; weak.life = 3;
    creature(game, bot, 'Only shield', 4, 6);
    const threat = creature(game, strong, 'Next turn threat', 5);
    threat.tapped = true; // It untaps before our next turn.
    const assignments = await attack(game, bot);
    assert.equal(assignments.length, 0);
    assert.equal(game.aiDecisionLog.at(-1).fallback, false);
  });

  test(`${style}/${difficulty}: sacrifices an engine to survive combined nonlethal hits`, async () => {
    const { game, bot, weak } = fixture(style, difficulty);
    bot.life = 6;
    creature(game, bot, 'Precious draw engine', 1, 1, [], 'Whenever you cast a spell, draw a card.');
    const attackers = [creature(game, weak, 'First 3/3', 3), creature(game, weak, 'Second 3/3', 3)];
    const assignments = await block(game, bot, attackers);
    assert.equal(assignments.length, 1);
    assert.equal(bot.lost, false);
    assert.equal(bot.life, 3);
  });
}

test('last opponent lethal takes priority over preserving blockers even at one life', async () => {
  for (const style of styles) {
    const { game, bot, weak, strong } = fixture(style);
    strong.lost = true; bot.life = 1; weak.life = 4;
    const attacker = creature(game, bot, 'Finisher', 4, 4, ['flying']);
    creature(game, weak, 'Ground crackback', 10);
    const assignments = await attack(game, bot);
    assert.ok(assignments.some(item => item.card === attacker && item.target === weak), style);
    attacker.attacking = weak;
    game.combat = { attackers: [attacker] };
    await game.combatDamage(bot, 'normal');
    assert.equal(game.gameOver, true);
    assert.equal(game.winner, bot);
  }
});

test('vigilance preserves a useful blocker, but cannot be trusted after a losing attack', async () => {
  const { game, bot, weak, strong } = fixture();
  bot.life = 4; weak.life = 3;
  const shield = creature(game, bot, 'Vigilant shield', 4, 6, ['vigilance']);
  creature(game, strong, 'Crackback', 5);
  const assignments = await attack(game, bot);
  assert.ok(assignments.some(item => item.card === shield && item.target === weak));
});

test('two small attackers jointly finish the duel instead of each being evaluated as nonlethal', async () => {
  const { game, bot, weak, strong } = fixture('josh');
  strong.lost = true; bot.life = 2; weak.life = 6;
  creature(game, bot, 'Finisher A', 3, 3, ['flying']);
  creature(game, bot, 'Finisher B', 3, 3, ['flying']);
  creature(game, weak, 'Ground threat', 8);
  assert.equal((await attack(game, bot)).length, 2);
});

test('mandatory attacks remain legal at low life', async () => {
  const { game, bot, strong } = fixture();
  bot.life = 2;
  const forced = creature(game, bot, 'Must attack', 2);
  creature(game, strong, 'Threat', 8);
  assert.ok((await attack(game, bot, [forced])).some(item => item.card === forced));
});

test('menace requires two blockers to prevent aggregate lethal', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 5;
  creature(game, bot, 'Chump A', 1);
  creature(game, bot, 'Chump B', 1);
  const menace = creature(game, weak, 'Menace', 5, 5, ['menace']);
  const assignments = await block(game, bot, [menace]);
  assert.equal(assignments.length, 2);
  assert.equal(bot.lost, false);
});

test('blocks commander damage lethal while ordinary life is still high', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 40;
  creature(game, bot, 'Engine blocker', 1, 1, [], 'Whenever you cast a spell, draw a card.');
  const commander = creature(game, weak, 'Commander', 3);
  commander.commander = true; bot.commanderDamage[commander.iid] = 18;
  await block(game, bot, [commander]);
  assert.equal(bot.lost, false);
  assert.equal(bot.commanderDamage[commander.iid], 18);
});

test('double strike and trample require enough toughness rather than a cosmetic chump', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 4;
  creature(game, bot, 'Small chump', 1, 1);
  creature(game, bot, 'Big shield', 1, 7);
  const attacker = creature(game, weak, 'Double trampler', 5, 5, ['double strike', 'trample']);
  await block(game, bot, [attacker]);
  assert.equal(bot.lost, false);
  assert.ok(bot.life > 0);
});

test('keeps the flying blocker and attacks with the expendable ground creature', async () => {
  const { game, bot, weak, strong } = fixture('aggressive');
  bot.life = 4; weak.life = 3;
  const flyer = creature(game, bot, 'Only flying shield', 4, 6, ['flying']);
  const ground = creature(game, bot, 'Ground finisher', 3);
  creature(game, strong, 'Flying threat', 5, 5, ['flying']);
  const assignments = await attack(game, bot);
  assert.ok(assignments.some(item => item.card === ground && item.target === weak));
  assert.ok(assignments.every(item => item.card !== flyer));
});

test('reserves defense for cumulative attacks from multiple surviving opponents', async () => {
  const { game, bot, weak, strong } = fixture('jimmy');
  bot.life = 7;
  creature(game, bot, 'Last shield', 4, 6);
  creature(game, weak, 'First crackback', 4);
  creature(game, strong, 'Second crackback', 4);
  assert.equal((await attack(game, bot)).length, 0);
});

test('does not use a vigilance creature as future defense if combat kills it', async () => {
  const { game, bot, weak, strong } = fixture('jimmy');
  bot.life = 3;
  creature(game, bot, 'Fragile vigilant blocker', 3, 3, ['vigilance']);
  creature(game, weak, 'Free blocker', 6, 6);
  creature(game, strong, 'Crackback', 4, 4);
  assert.equal((await attack(game, bot)).length, 0);
});

test('preserves the blocker that survives first strike instead of a lethal fake trade', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 3;
  creature(game, bot, 'Dies before hitting', 5, 2);
  creature(game, bot, 'Safe wall', 1, 6);
  const attacker = creature(game, weak, 'First striker', 4, 4, ['first strike']);
  const assignments = await block(game, bot, [attacker]);
  assert.equal(bot.lost, false);
  assert.ok(assignments.some(item => item.blocker.name === 'Safe wall'));
});

test('does not count a first-strike lifelink hit twice', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 2;
  creature(game, bot, 'Lifelink wall', 3, 5, ['first strike', 'lifelink']);
  const first = creature(game, weak, 'Blocked 2/2', 2);
  const second = creature(game, weak, 'Unblocked 4/4', 4);
  await block(game, bot, [first, second]);
  assert.equal(bot.lost, false);
});

test('does not overblock a single attacker while a second lethal hit goes through', async () => {
  const { game, bot, weak } = fixture();
  bot.life = 3;
  creature(game, bot, 'Chump 1', 1);
  creature(game, bot, 'Chump 2', 1);
  const attackers = [creature(game, weak, 'Lethal A', 4), creature(game, weak, 'Lethal B', 4)];
  const assignments = await block(game, bot, attackers);
  assert.equal(new Set(assignments.map(item => item.attacker)).size, 2);
  assert.equal(bot.lost, false);
});

test('a summoning sick creature may defend even though it cannot attack', async () => {
  const { game, bot, weak, strong } = fixture('jimmy');
  bot.life = 3; weak.life = 4;
  creature(game, bot, 'Attacker', 4);
  const blocker = creature(game, bot, 'Fresh shield', 1, 6); blocker.sick = true;
  creature(game, strong, 'Threat', 5);
  assert.ok((await attack(game, bot)).some(item => item.target === weak));
});

test('healthy aggressive bot still applies safe pressure', async () => {
  const { game, bot, weak, strong } = fixture('aggressive');
  bot.life = 40;
  creature(game, bot, 'Pressure', 4);
  creature(game, strong, 'Small crackback', 2);
  assert.ok((await attack(game, bot)).some(item => item.target === weak));
});

test('combat planning is deterministic, immutable and independent of hidden hands', async () => {
  const { game, bot, weak, strong } = fixture();
  bot.life = 5; weak.life = 3;
  creature(game, bot, 'Shield', 4, 6);
  creature(game, strong, 'Threat', 5);
  game.recalc();
  const before = MTG.hashBotPlayerView(MTG.createBotPlayerView(game, bot.idx));
  const a = await attack(game, bot);
  assert.equal(MTG.hashBotPlayerView(MTG.createBotPlayerView(game, bot.idx)), before);
  const hidden = new MTG.CardInst(MTG.DEFS.Forest, strong); hidden.zone = 'hand'; strong.hand.push(hidden);
  const b = await attack(game, bot);
  hidden.def = MTG.DEFS['Swords to Plowshares'];
  const c = await attack(game, bot);
  const key = list => list.map(item => `${item.card.iid}:${item.target.idx}`).join('|');
  assert.equal(key(a), key(b)); assert.equal(key(b), key(c));
});

test('large mandatory cleanup completes without exploring impossible subsets', { timeout: 2000 }, async () => {
  const { game, bot } = fixture();
  for (let i = 0; i < 37; i++) {
    const card = new MTG.CardInst(MTG.DEFS.Forest, bot); card.zone = 'hand'; bot.hand.push(card);
  }
  game.recalc();
  const chosen = await bot.controller.decide(game, { type: 'chooseCards', player: bot,
    from: bot.hand, min: 30, max: 30, aiHint: { kind: 'cleanupDiscard' } });
  assert.equal(chosen.length, 30);
  assert.equal(new Set(chosen).size, 30);
});

test('the state evaluator distinguishes eliminating one opponent from winning the table', () => {
  const { game, bot, weak, strong } = fixture();
  weak.life = 3;
  creature(game, bot, 'Potential finisher', 4);
  game.recalc();
  const pod = MTG.evaluateState(MTG.createBotPlayerView(game, bot.idx), bot.idx);
  strong.lost = true;
  const duel = MTG.evaluateState(MTG.createBotPlayerView(game, bot.idx), bot.idx);
  assert.ok(duel.immediateWinPotential > pod.immediateWinPotential);
});
