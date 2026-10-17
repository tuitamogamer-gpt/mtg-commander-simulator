import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';
import { aiIsolationFingerprint } from './helpers/run-ai-adversarial-games.mjs';

const MTG = loadEngine();

function fixture(difficulty = 'normal', style = 'balanced') {
  const game = new MTG.Game({ seed: 171026, paced: false });
  const players = ['Raven', 'Dragon', 'Other'].map(name => {
    const player = game.addPlayer(name, { name: 'Quick Draw' }, null, true);
    player.controller = new MTG.AIController(player, { difficulty, style });
    return player;
  });
  const [bot, opponent, other] = players;
  game.turnPlayer = opponent;
  game.turnNo = 39;
  game.phase = 'combat';
  game.step = 'begin';
  game.combat = { attackers: [], defenders: new Map(), blockersDeclared: false };
  bot.life = 9;
  opponent.life = 1;
  const put = (name, player = bot, zone = 'battlefield') => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = zone;
    card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card);
    else player[zone].push(card);
    game.recalc();
    return card;
  };
  for (let i = 0; i < 4; i++) put('Island');
  const spell = put('Aetherize', bot, 'hand');
  const window = () => {
    game.recalc();
    const casts = game.castableList(bot).filter(entry => entry.card === spell);
    assert.equal(casts.length, 1, 'Aetherize remains legal without targets');
    return { type: 'priority', player: bot, casts, acts: [], stack: game.stack, phase: game.phase };
  };
  const decide = (forceSearch = false) => MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, actionWindow: window(), difficulty,
    seed: 17, forceSearch, budgetMs: 0,
  });
  return { game, bot, opponent, other, spell, put, window, decide };
}

for (const difficulty of ['easy', 'normal', 'hard']) {
  for (const state of ['before attackers', 'no combat', 'removed attacker', 'stale attacker']) {
    test(`${difficulty}: Aetherize is held with ${state}`, async () => {
      const f = fixture(difficulty);
      // A large opposing board must not be mistaken for declared attackers.
      f.put('Colossal Dreadmaw', f.opponent);
      if (state === 'no combat') {
        f.game.phase = 'main1'; f.game.combat = null;
      } else if (state === 'removed attacker') {
        const attacker = f.put('Colossal Dreadmaw', f.opponent);
        attacker.attacking = f.bot;
        f.game.combat.attackers.push(attacker);
        await f.game.move(attacker, 'hand');
      } else if (state === 'stale attacker') {
        const stale = f.put('Colossal Dreadmaw', f.opponent);
        f.game.combat.attackers.push(stale);
        assert.equal(stale.attacking, null);
      }
      const before = aiIsolationFingerprint(f.game);
      const result = await f.decide();
      assert.equal(result.action.kind, 'pass', JSON.stringify(result.consideredActions));
      assert.equal(aiIsolationFingerprint(f.game), before);
      assert.equal(f.bot.controller.castScore(f.game, { card: f.spell, from: 'hand' }), -1);
    });
  }
}

test('paced search and spell payoffs do not turn empty Aetherize into a useful cast', async () => {
  const f = fixture('hard', 'josh');
  f.put('Young Pyromancer');
  f.put('Archmage Emeritus');
  for (let i = 0; i < 8; i++) f.put('Island', f.bot, 'library');
  f.put('Colossal Dreadmaw', f.opponent);
  const before = aiIsolationFingerprint(f.game);
  const result = await f.decide(true);
  assert.equal(result.action.kind, 'pass', JSON.stringify(result.consideredActions));
  assert.equal(aiIsolationFingerprint(f.game), before);
});

for (const againstCaster of [true, false]) {
  test(`Aetherize evaluates only attackers, including an attack on ${againstCaster ? 'the caster' : 'another player'}`, async () => {
    const f = fixture('hard');
    const attacker = f.put('Colossal Dreadmaw', f.opponent);
    const bystander = f.put('Colossal Dreadmaw', f.other);
    const own = f.put('Colossal Dreadmaw');
    attacker.attacking = againstCaster ? f.bot : f.other;
    f.game.combat.attackers.push(attacker);
    f.game.step = 'attackers';
    f.game.recalc();
    const impact = MTG.botBoardWipeImpact(f.game, f.bot, { kind: 'cast', card: f.spell });
    assert.ok(impact);
    assert.equal(impact.removes(attacker), true);
    assert.equal(impact.removes(bystander), false);
    assert.equal(impact.removes(own), false);
    const decision = await f.decide();
    assert.equal(decision.action.card, f.spell, JSON.stringify(decision.consideredActions));
    // Resolve the real paid cast without further responses from fixture bots.
    for (const player of f.game.players) player.controller = { decide: async () => ({ kind: 'pass' }) };
    assert.equal(await f.game.castSpell(f.bot, f.spell, { from: 'hand' }), true);
    while (f.game.stack.length) await f.game.resolveTop();
    assert.equal(f.spell.castMeta.manaSpent, 4);
    assert.equal(attacker.zone, 'hand');
    assert.equal(bystander.zone, 'battlefield');
    assert.equal(own.zone, 'battlefield');
  });
}

test('Aetherize is held when only our own creatures are attacking', async () => {
  const f = fixture();
  const attacker = f.put('Colossal Dreadmaw');
  attacker.attacking = f.opponent;
  f.game.turnPlayer = f.bot;
  f.game.step = 'attackers';
  f.game.combat.attackers.push(attacker);
  assert.equal((await f.decide()).action.kind, 'pass');
});

test('empty Aetherize remains a legal human cast', async () => {
  const f = fixture();
  for (const player of f.game.players) player.controller = { decide: async () => ({ kind: 'pass' }) };
  f.window();
  assert.equal(await f.game.castSpell(f.bot, f.spell, { from: 'hand' }), true);
  while (f.game.stack.length) await f.game.resolveTop();
  assert.equal(f.spell.zone, 'graveyard');
  assert.equal(f.spell.castMeta.manaSpent, 4);
});

test('free casting does not make an empty Aetherize useful', async () => {
  const f = fixture();
  const q = { type: 'chooseOption', player: f.bot,
    options: [{ key: 'yes', label: 'Cast' }, { key: 'no', label: 'Skip' }],
    aiHint: { kind: 'freeCast', card: f.spell } };
  const result = await MTG.chooseBotAction({ gameState: f.game, botPlayerId: f.bot.idx,
    actionWindow: q, difficulty: 'hard', seed: 17 });
  assert.equal(result.action.value, 'no');
  assert.equal(f.bot.controller.chooseOption(f.game, q), 'no');
});
