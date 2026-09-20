import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const M = loadEngine();
function table(name = 'Prossh, Skyraider of Kher', difficulty = 'normal', style = 'balanced') {
  const game = new M.Game({seed: 260920, paced: false});
  game.speedFactor = 0;
  const bot = game.addPlayer('Bot', M.DECKS['Power Hungry'], null, true);
  const opponent = game.addPlayer('Opponent', {name: 'Test'}, null, true);
  bot.controller = new M.AIController(bot, {difficulty, style});
  opponent.controller = new M.AIController(opponent, {difficulty: 'normal'});
  game.turnPlayer = bot; game.turnNo = 26; game.phase = 'main1'; game.step = '';
  function add(def, owner = bot) {
    const card = new M.CardInst(typeof def === 'string' ? M.DEFS[def] : def, owner);
    card.zone = 'battlefield'; card.sick = false;
    game.battlefield.push(card); game.recalc();
    return card;
  }
  const source = add(name);
  source.commander = name === 'Prossh, Skyraider of Kher';
  const tokens = Array.from({length: 10}, (_, n) => {
    const card = add({name: `Kobold ${n}`, types: ['Creature'], subtypes: ['Kobold'],
      power: '0', toughness: '1', cost: '', oracle: '', abilities: [], kws: []});
    card.isToken = true;
    return card;
  });
  const entries = () => game.activatableList(bot, game.phase === 'combat').filter(entry => entry.card === source);
  const query = () => ({type: ['main1', 'main2'].includes(game.phase) && game.turnPlayer === bot ? 'main' : 'priority',
    player: bot, phase: game.phase, casts: [], lands: [], acts: entries(), stack: game.stack});
  const decide = async (extra = {}) => {
    const before = aiIsolationFingerprint(game);
    const answer = await M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
      difficulty, actionWindow: query(), forceSearch: false, ...extra});
    assert.equal(aiIsolationFingerprint(game), before, 'planning leaves the live board unchanged');
    assert.equal(answer.log.fallback, false);
    return answer.action;
  };
  const attack = (blockers = []) => {
    game.phase = 'combat'; game.step = 'blockers';
    source.attacking = opponent; source.tapped = true;
    source.blockedBy = blockers; source.wasBlocked = !!blockers.length;
    for (const blocker of blockers) blocker.blocking = source.iid;
    game.combat = {attackers: [source], blockersDeclared: true};
  };
  const resolve = async entry => {
    assert.equal(await game.activateAbility(bot, entry), true);
    for (let i = 0; i < 30 && (game.stack.length || game.pendingTriggers.length); i++) {
      await game.flushTriggers();
      if (game.stack.length) await game.resolveTop();
    }
    assert.equal(game.stack.length + game.pendingTriggers.length, 0);
  };
  return {game, bot, opponent, source, tokens, add, entries, query, decide, attack, resolve};
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of ['balanced', 'aggressive', 'passive']) {
  test(`${style}/${difficulty}: a summoning-sick Prossh keeps all ten creatures`, async () => {
    const f = table(undefined, difficulty, style);
    f.source.sick = true;
    assert.ok(f.entries().length, 'the activation remains legal under the rules');
    assert.equal((await f.decide()).kind, 'done');
    assert.ok(f.bot.controller.activationScore(f.game, f.entries()[0]) <= 0, 'fallback also declines');
    assert.equal(f.source.power, 5);
    assert.ok(f.tokens.every(card => card.zone === 'battlefield'));
  });
}

for (const state of ['tapped', 'postcombat', 'opponent turn', 'begin', 'not attacking', 'damage', 'endCombat']) {
  test(`Prossh does not spend creatures on an unused pump: ${state}`, async () => {
    const f = table();
    if (state === 'tapped') f.source.tapped = true;
    if (state === 'postcombat') f.game.phase = 'main2';
    if (state === 'opponent turn') f.game.turnPlayer = f.opponent;
    if (['begin', 'not attacking'].includes(state)) {
      f.game.phase = 'combat'; f.game.step = state === 'begin' ? 'begin' : 'attackers';
    }
    if (['damage', 'endCombat'].includes(state)) { f.attack(); f.game.step = state; }
    assert.match((await f.decide()).kind, /^(done|pass)$/);
  });
}

for (const name of ['Bloodthrone Vampire', 'Nantuko Husk', 'Fallen Angel', 'Devouring Swarm']) {
  test(`${name} follows the same temporary sacrifice-pump policy`, async () => {
    const f = table(name);
    f.source.sick = true;
    assert.ok(f.entries().length);
    assert.equal((await f.decide()).kind, 'done');
    f.source.sick = false; f.game.phase = 'main2';
    assert.equal((await f.decide()).kind, 'done');
  });
}

test('a human can still sacrifice to Prossh while it has summoning sickness', async () => {
  const f = table(); f.source.sick = true;
  await f.resolve(f.entries()[0]);
  assert.equal(f.source.power, 6);
  assert.equal(f.tokens.filter(card => card.zone === 'battlefield').length, 9);
});

test('deep search also preserves a summoning-sick Prossh army', async () => {
  const f = table(undefined, 'hard'); f.source.sick = true;
  assert.equal((await f.decide({forceSearch: true, budgetMs: 2000})).kind, 'done');
});

test('Prossh waits for blocks, then pays only the two creatures needed for lethal', async () => {
  const f = table(); f.opponent.life = 7;
  assert.equal((await f.decide()).kind, 'done', 'wait for a committed attack');
  f.attack();
  await f.game.priorityRound(f.bot);
  assert.equal(f.source.power, 7);
  assert.equal(f.tokens.filter(card => card.zone === 'battlefield').length, 8);
  assert.equal((await f.decide()).kind, 'pass', 'no more pumping after lethal is reached');
  await f.game.combatDamage(f.bot, 'normal');
  assert.equal(f.opponent.life, 0);
});

test('haste allows a newly cast Prossh to use its pump in a committed attack', async () => {
  const f = table(); f.source.sick = true;
  f.add('Fervor'); f.game.recalc();
  assert.ok(f.source.kw('haste'));
  f.opponent.commanderDamage[f.source.iid] = 15;
  f.attack();
  assert.equal((await f.decide()).kind, 'activate');
  await f.resolve(f.entries()[0]);
  assert.equal(f.source.power, 6);
  assert.equal((await f.decide()).kind, 'pass');
});

test('a blocked Prossh refuses extra power that changes neither damage nor trades', async () => {
  const f = table();
  f.opponent.life = 1;
  f.attack([f.add('Serra Angel', f.opponent)]);
  assert.equal((await f.decide()).kind, 'pass', 'no false lethal through a flying chump');
});

test('the pump can turn a losing block into a trade', async () => {
  const f = table();
  const blocker = f.add('Serra Angel', f.opponent);
  f.game.addCounters(blocker, '+1/+1', 2);
  assert.ok(f.game.canBlock(blocker, f.source));
  f.attack([blocker]);
  assert.equal((await f.decide()).kind, 'activate');
  await f.resolve(f.entries()[0]);
  assert.equal(f.source.power, 6);
  assert.equal((await f.decide()).kind, 'pass');
  await f.game.combatDamage(f.bot, 'normal');
  assert.notEqual(blocker.zone, 'battlefield');
});

test('a sacrifice pump can save a blocker even with summoning sickness', async () => {
  const f = table('Bloodthrone Vampire');
  const attacker = f.add('Grizzly Bears', f.opponent);
  f.source.sick = true; f.source.blocking = attacker.iid;
  attacker.attacking = f.bot; attacker.blockedBy = [f.source]; attacker.wasBlocked = true;
  f.game.turnPlayer = f.opponent; f.game.phase = 'combat'; f.game.step = 'blockers';
  f.game.combat = {attackers: [attacker], blockersDeclared: true};
  assert.equal((await f.decide()).kind, 'activate');
  await f.resolve(f.entries()[0]);
  assert.equal((await f.decide()).kind, 'pass');
  await f.game.combatDamage(f.opponent, 'normal');
  assert.equal(f.source.zone, 'battlefield');
  assert.notEqual(attacker.zone, 'battlefield');
});

test('ordinary extra damage does not justify feeding valuable creatures to Prossh', async () => {
  const f = table();
  for (const card of f.tokens) f.game.battlefield.splice(f.game.battlefield.indexOf(card), 1);
  const engine = f.add('Blood Artist'), body = f.add('Colossal Dreadmaw');
  f.attack();
  assert.equal((await f.decide()).kind, 'pass');
  assert.equal(engine.zone, 'battlefield'); assert.equal(body.zone, 'battlefield');
});

test('Prossh does not sacrifice into a resolved Fog', async () => {
  const f = table(); f.opponent.life = 6; f.attack();
  f.game.untilEffects.push({kind: 'preventAllCombat', expires: 'eot'});
  assert.equal((await f.decide()).kind, 'pass');
});

test('first-strike damage already dealt cannot justify more power', async () => {
  const f = table(); f.opponent.life = 6;
  f.add('Knighthood'); f.game.recalc();
  assert.ok(f.source.kw('first strike'));
  f.attack();
  await f.game.combatDamage(f.bot, 'first');
  assert.equal(f.opponent.life, 1);
  assert.equal((await f.decide()).kind, 'pass');
});

test('a double striker can still pump for its remaining normal damage', async () => {
  const f = table(); f.opponent.life = 11;
  f.add("Berserkers' Onslaught"); f.attack(); f.game.recalc();
  assert.ok(f.source.kw('double strike'));
  await f.game.combatDamage(f.bot, 'first');
  assert.equal(f.opponent.life, 6);
  assert.equal((await f.decide()).kind, 'activate');
});

test('sacrificing a creature cannot remove a required blocker to fund the pump', async () => {
  const f = table('Bloodthrone Vampire');
  const first = f.add('Grizzly Bears', f.opponent), second = f.add('Grizzly Bears', f.opponent);
  for (const card of f.tokens.slice(1)) await f.game.move(card, 'graveyard');
  first.attacking = f.bot; first.blockedBy = [f.source]; first.wasBlocked = true;
  second.attacking = f.bot; second.blockedBy = [f.tokens[0]]; second.wasBlocked = true;
  f.source.blocking = first.iid; f.tokens[0].blocking = second.iid;
  f.bot.life = 1; f.game.turnPlayer = f.opponent; f.game.phase = 'combat'; f.game.step = 'blockers';
  f.game.combat = {attackers: [first, second], blockersDeclared: true};
  assert.equal((await f.decide()).kind, 'pass');
});

test('removing a chump does not make an already blocked Prossh deal player damage', async () => {
  const f = table(); f.opponent.life = 6;
  const blocker = f.add('Serra Angel', f.opponent); f.attack([blocker]);
  await f.game.move(blocker, 'graveyard');
  assert.equal((await f.decide()).kind, 'pass');
});

test('a sacrifice ability that grants haste can enable a real attack this turn', async () => {
  const f = table('Oxidda Daredevil'); f.source.sick = true; f.opponent.life = 2;
  const artifact = f.add('Darksteel Relic');
  const choice = await f.decide();
  assert.equal(choice.kind, 'activate');
  await f.resolve(choice.entry);
  assert.equal(artifact.zone, 'graveyard');
  assert.ok(f.source.kw('haste'));
  assert.equal((await f.decide()).kind, 'done');
});

test('a once-per-turn pump cannot budget an unavailable second activation', async () => {
  const f = table('Akki Avalanchers'); f.opponent.life = 4;
  f.add('Forest'); f.add('Forest'); f.attack();
  assert.equal((await f.decide()).kind, 'pass');
  f.opponent.life = 3;
  const choice = await f.decide();
  assert.equal(choice.kind, 'activate');
  await f.resolve(choice.entry);
  assert.equal(f.source.power, 3);
  assert.equal((await f.decide()).kind, 'pass');
});

test('temporary toughness can save a creature from an announced burn spell', async () => {
  const f = table('Bloodthrone Vampire'); f.source.sick = true;
  f.game.turnPlayer = f.opponent;
  const bolt = new M.CardInst(M.DEFS['Lightning Bolt'], f.opponent);
  bolt.zone = 'stack';
  f.game.stack.push({kind: 'spell', card: bolt, ctrl: f.opponent, targets: [f.source]});
  const choice = await f.decide();
  assert.equal(choice.kind, 'activate');
  assert.equal(M.sacrificePumpPlan(f.game, f.bot, choice.entry).count, 2, 'one +2/+2 is insufficient against three damage');
});

test('fallback uses the same useful combat pump and sacrifice choice', async () => {
  const f = table(); f.opponent.life = 6; f.attack();
  const query = f.query();
  const choice = f.bot.controller.priorityAction(f.game, query);
  assert.equal(choice.kind, 'activate');
  const picks = f.bot.controller.chooseCards(f.game, {type: 'chooseCards', from: [...f.tokens, f.source],
    min: 1, max: 1, prompt: 'Sacrifice', aiHint: {kind: 'sacCost', src: f.source, ability: choice.entry.ability}});
  assert.equal(picks.length, 1);
  assert.ok(f.tokens.includes(picks[0]));
});

test('Butcher of Malakir with no opposing creatures does not justify sacrificing the army', async () => {
  const f = table(); f.source.sick = true; f.add('Butcher of Malakir');
  assert.equal((await f.decide()).kind, 'done');
});

test('a real death payoff can justify sacrificing without attacking', async () => {
  const f = table(); f.source.sick = true; f.add('Blood Artist'); f.opponent.life = 1;
  assert.equal((await f.decide()).kind, 'activate');
  await f.resolve(f.entries()[0]);
  assert.equal(f.opponent.life, 0);
  assert.equal(f.tokens.filter(card => card.zone === 'battlefield').length, 9);
});

test('permanent +1/+1 counters are not classified as temporary pumps', () => {
  const f = table('Carrion Feeder'); f.source.sick = true;
  const view = M.createBotPlayerView(f.game, f.bot.idx, f.query());
  assert.ok(M.generateLegalActions(view).some(action => action.kind === 'activate'));
});
