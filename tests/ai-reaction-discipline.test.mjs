import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';

const M = loadEngine();
function table(difficulty = 'normal', style = 'balanced') {
  const game = new M.Game({seed: 181026, paced: false});
  game.speedFactor = 0;
  game.priorityRound = async () => {};
  const bot = game.addPlayer('Zurgo', {name: 'Mardu Surge'}, null, true);
  const opponent = game.addPlayer('Opponent', {name: 'Quick Draw'}, null, true);
  bot.controller = new M.AIController(bot, {difficulty, style});
  opponent.controller = {decide: async (g, q) => q.type === 'priority' ? {kind: 'pass'} :
    q.type === 'chooseOption' ? 'no' : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0) : []};
  game.turnPlayer = opponent; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  function add(name, owner = bot, zone = 'battlefield') {
    const def = typeof name === 'string' ? M.DEFS[name] : name;
    assert.ok(def, name);
    const card = new M.CardInst(def, owner);
    card.zone = zone; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else owner[zone].push(card);
    game.recalc(); return card;
  }
  const token = () => {
    const card = add({name: 'Goblin', types: ['Creature'], subtypes: ['Goblin'], power: '1', toughness: '1', cost: '', oracle: '', kws: []});
    card.isToken = true; return card;
  };
  function query(type = 'priority') {
    return {type, player: bot, phase: game.phase, stack: game.stack, lands: [],
      casts: game.castableList(bot), acts: game.activatableList(bot, type === 'priority')};
  }
  async function decide(q = query(), forceSearch = false) {
    const before = aiIsolationFingerprint(game);
    const answer = await M.chooseBotAction({gameState: game, botPlayerId: bot.idx,
      difficulty, seed: 17, budgetMs: 0, forceSearch, actionWindow: q});
    assert.equal(aiIsolationFingerprint(game), before, 'planning does not mutate the real game');
    assert.equal(answer.log.fallback, false);
    return answer.action;
  }
  function threat(name, targets = [], owner = opponent) {
    const card = new M.CardInst(M.DEFS[name], owner); card.zone = 'stack';
    const object = {kind: 'spell', card, srcCard: card, ctrl: owner, name, targets};
    game.stack.push(object); return object;
  }
  function combat(attacker, defender = bot, blockers = []) {
    game.phase = 'combat'; game.step = 'blockers';
    attacker.attacking = defender; attacker.tapped = true;
    attacker.blockedBy = blockers; attacker.wasBlocked = blockers.length > 0;
    for (const blocker of blockers) blocker.blocking = attacker.iid;
    game.combat = {attackers: [attacker], blockersDeclared: true};
  }
  function mana() {Object.assign(bot.pool, {W: 10, U: 10, B: 10, R: 10, G: 10, C: 10});}
  return {game, bot, opponent, add, token, query, decide, threat, combat, mana};
}

for (const difficulty of ['easy', 'normal', 'hard']) for (const style of ['balanced', 'aggressive', 'passive']) {
  test(`${difficulty}/${style}: Zurgo keeps Ainok and its tokens without a threat`, async () => {
    const f = table(difficulty, style);
    f.add('Zurgo Stormrender').commander = true;
    const ainok = f.add('Ainok Strike Leader');
    for (let i = 0; i < 8; i++) f.token();
    const q = f.query();
    const entry = q.acts.find(row => row.card === ainok);
    assert.ok(entry, 'humans can still activate it');
    assert.equal((await f.decide(q)).kind, 'pass');
    assert.ok(f.bot.controller.activationScore(f.game, entry) < 0);
    f.game.turnPlayer = f.bot;
    assert.equal((await f.decide(f.query('main'))).kind, 'done');
  });
}

for (const name of ['Selfless Spirit', 'Dauntless Escort', 'Hajar, Loyal Bodyguard', 'Jirina, Dauntless General',
  'Dora Milaje Elite', 'Resolute Watchdog', 'Yahenni, Undying Partisan', 'Pitiless Pontiff', 'Boromir, Warden of the Tower']) {
  test(`${name} does not spend protection on a safe board`, async () => {
    const f = table(); f.mana();
    f.add(name); f.add('Zurgo Stormrender'); f.add('Esper Sentinel'); f.token();
    assert.equal((await f.decide()).kind, 'pass');
  });
}

for (const name of ['Heroic Intervention', "Tamiyo's Safekeeping", 'Giant Growth', 'Fog', 'Rootborn Defenses']) {
  test(`${name} is held without a relevant effect, even with a hostile stack object`, async () => {
    const f = table(); f.mana();
    const bear = f.add('Grizzly Bears'); const spell = f.add(name, f.bot, 'hand');
    assert.equal((await f.decide()).kind, 'pass');
    f.threat('Giant Growth', [bear]);
    assert.equal((await f.decide()).kind, 'pass', 'an opposing buff is not a removal emergency');
    assert.equal(f.bot.controller.castScore(f.game, {card: spell, from: 'hand'}), -1);
  });
}

test('deep search and death synergies cannot turn a pointless sacrifice into a good reaction', async () => {
  const f = table('hard', 'josh');
  f.add('Ainok Strike Leader'); f.add('Zurgo Stormrender'); f.add('Blood Artist'); f.token();
  assert.equal((await f.decide(f.query(), true)).kind, 'pass');
});

for (const name of ['Wrath of God', 'Blasphemous Act']) {
  test(`Ainok saves tokens from ${name} but never grants protection to Zurgo by mistake`, async () => {
    const f = table();
    const ainok = f.add('Ainok Strike Leader'); const zurgo = f.add('Zurgo Stormrender');
    const tokens = Array.from({length: 3}, f.token);
    f.threat(name);
    const action = await f.decide();
    assert.equal(action.kind, 'activate'); assert.equal(action.entry.card, ainok);
    assert.equal(f.bot.controller.priorityAction(f.game, f.query()).entry.card, ainok);
    assert.equal(await f.game.activateAbility(f.bot, action.entry), true);
    await f.game.resolveTop();
    assert.equal(ainok.zone, 'graveyard');
    assert.ok(tokens.every(card => card.kw('indestructible')));
    assert.equal(zurgo.kw('indestructible'), false);
  });
}

for (const name of ['Swords to Plowshares', 'Unsummon', 'Tragic Slip']) {
  test(`indestructible is held against ${name}`, async () => {
    const f = table(); f.add('Ainok Strike Leader');
    const token = f.token(); f.threat(name, [token]);
    assert.equal((await f.decide()).kind, 'pass');
  });
}

test('a sacrifice is not worth losing the token engine to save a single 1/1', async () => {
  const f = table(); f.add('Ainok Strike Leader'); const token = f.token();
  f.threat('Lightning Bolt', [token]);
  assert.equal((await f.decide()).kind, 'pass');
});

test('hexproof saves the targeted permanent from exile and chooses that target', async () => {
  const f = table('hard'); f.mana();
  const bear = f.add('Grizzly Bears'); f.add('Zurgo Stormrender').commander = true;
  const spell = f.add("Tamiyo's Safekeeping", f.bot, 'hand');
  const removal = f.add('Swords to Plowshares', f.opponent, 'hand');
  assert.equal(await f.game.castSpell(f.opponent, removal, {from: 'hand', alt: {free: true}, targets: [bear]}), true);
  assert.equal((await f.decide()).card, spell);
  const spec = spell.def.targets[0];
  const q = {type: 'chooseTargets', player: f.bot, src: spell, spec, aiHint: spec.aiHint,
    candidates: f.game.legalTargets(spec, spell, f.bot), min: 1, max: 1};
  assert.deepEqual(Array.from((await f.decide(q)).picks, card => card.iid), [bear.iid]);
  assert.equal(await f.game.castSpell(f.bot, spell, {from: 'hand'}), true);
  assert.equal(f.game.stack.at(-1).targets[0], bear, JSON.stringify(f.game.aiDecisionLog?.map(row => ({chosen: row.chosen, alternatives: row.alternatives}))));
  await f.game.resolveTop();
  assert.ok(bear.kw('hexproof') || bear.cur.hexproof);
  await f.game.resolveTop();
  assert.equal(bear.zone, 'battlefield', 'the exile fizzles against hexproof');
});

test('protection can answer our own wipe, and a second copy waits for the first to resolve', async () => {
  const f = table(); f.mana(); f.add('Colossal Dreadmaw');
  const first = f.add('Heroic Intervention', f.bot, 'hand');
  const second = f.add('Heroic Intervention', f.bot, 'hand');
  f.threat('Wrath of God', [], f.bot);
  assert.equal((await f.decide()).kind, 'cast');
  const old = f.game.priorityRound; f.game.priorityRound = async () => {};
  assert.equal(await f.game.castSpell(f.bot, first, {from: 'hand'}), true);
  f.game.priorityRound = old;
  const q = f.query(); q.casts = q.casts.filter(row => row.card === second);
  assert.equal((await f.decide(q)).kind, 'pass');
});

test('Ainok waits for blocks and saves a token army in combat when the trade is worthwhile', async () => {
  const f = table(); const ainok = f.add('Ainok Strike Leader');
  const tokens = Array.from({length: 10}, f.token);
  const attackers = tokens.map(token => {
    const attacker = f.add('Grizzly Bears', f.opponent);
    attacker.attacking = f.bot; attacker.blockedBy = [token]; attacker.wasBlocked = true; token.blocking = attacker.iid;
    return attacker;
  });
  f.game.phase = 'combat'; f.game.step = 'attackers';
  f.game.combat = {attackers, blockersDeclared: false};
  assert.equal((await f.decide()).kind, 'pass');
  f.game.step = 'blockers'; f.game.combat.blockersDeclared = true;
  const action = await f.decide();
  assert.equal(action.entry?.card, ainok);
  f.game.step = 'damage';
  assert.equal((await f.decide()).kind, 'pass', 'damage has already happened');
});

test('Giant Growth is held before blocks, used to win a trade, and held after damage', async () => {
  const f = table(); f.mana();
  const bear = f.add('Grizzly Bears'); const enemy = f.add('Grizzly Bears', f.opponent);
  const spell = f.add('Giant Growth', f.bot, 'hand');
  f.game.turnPlayer = f.bot;
  assert.equal((await f.decide(f.query('main'))).kind, 'done');
  f.combat(bear, f.opponent, [enemy]);
  assert.equal((await f.decide()).card, spell);
  f.game.step = 'damage'; assert.equal((await f.decide()).kind, 'pass');
});

test('Fog stops a lethal attack, not an empty or already prevented combat', async () => {
  const f = table(); f.mana(); f.bot.life = 4;
  const fog = f.add('Fog', f.bot, 'hand');
  f.combat(f.add('Colossal Dreadmaw', f.opponent));
  assert.equal((await f.decide()).card, fog);
  f.game.untilEffects.push({kind: 'preventAllCombat', expires: 'eot'});
  assert.equal((await f.decide()).kind, 'pass');
});

test('manual empty protection remains legal and actually pays the sacrifice', async () => {
  const f = table(); const source = f.add('Ainok Strike Leader');
  const entry = f.query().acts.find(row => row.card === source);
  assert.ok(entry); assert.equal(await f.game.activateAbility(f.bot, entry), true);
  await f.game.resolveTop(); assert.equal(source.zone, 'graveyard');
});

test('a death payoff that wins the game may justify spending otherwise idle protection', async () => {
  const f = table(); const source = f.add('Ainok Strike Leader'); f.add('Blood Artist'); f.token();
  f.opponent.life = 1;
  assert.equal((await f.decide()).entry?.card, source);
});

test('optional effects compare costs and outcomes instead of always answering yes', async () => {
  const f = table(); const source = f.add('Colossal Dreadmaw');
  f.add('Forest', f.bot, 'library');
  const q = (effects, payment = {}) => ({type: 'chooseOption', player: f.bot,
    options: [{key: 'yes', label: 'Pay'}, {key: 'no', label: 'Decline'}],
    aiHint: {kind: 'optTrigger', src: source, effects, payment}});
  const draw = [{action: 'draw', who: 'you', n: 1}];
  assert.equal((await f.decide(q(draw, {sacSelf: true}))).value, 'no');
  assert.equal((await f.decide(q(draw, {mana: '{1}'}))).value, 'yes');
  assert.equal((await f.decide(q(draw, {life: 40}))).value, 'no');
  f.bot.library.length = 0;
  assert.equal((await f.decide(q(draw))).value, 'no', 'optional draw must not deck the bot');
  assert.equal(f.bot.controller.chooseOption(f.game, q(draw)), 'no', 'fallback uses the same optional policy');
});

for (const name of ['Lightning Bolt', 'Swords to Plowshares']) {
  test(`${name} waits for a meaningful target and still answers a dangerous creature`, async () => {
    const f = table(); f.mana(); f.add(name, f.bot, 'hand');
    f.add('Grizzly Bears', f.opponent);
    assert.equal((await f.decide()).kind, 'pass');
    f.add('Esper Sentinel', f.opponent);
    // An opposing main phase with nothing on the stack is the earliest moment;
    // the answer comes at the end step before the bot's own untap.
    assert.equal((await f.decide()).kind, 'pass');
    f.game.phase = 'end'; f.game.step = 'end';
    assert.equal((await f.decide()).kind, 'cast');
  });
}

test('Lightning Bolt is held instead of spending a card on three irrelevant player damage', async () => {
  const f = table(); f.mana(); const spell = f.add('Lightning Bolt', f.bot, 'hand');
  assert.equal((await f.decide()).kind, 'pass');
  f.opponent.life = 3;
  assert.equal((await f.decide()).card, spell);
});

test('counterspell waits through a minor creature but counters removal and a major threat', async () => {
  const f = table(); f.mana(); const counter = f.add('Counterspell', f.bot, 'hand');
  f.threat('Grizzly Bears'); assert.equal((await f.decide()).kind, 'pass');
  f.game.stack.length = 0;
  const bear = f.add('Grizzly Bears'); f.threat('Swords to Plowshares', [bear]);
  assert.equal((await f.decide()).card, counter);
  f.game.stack.length = 0; f.threat('Avenger of Zendikar');
  assert.equal((await f.decide()).card, counter);
});

test('Boros Charm preserves its modes until protection, a combat swing or lethal damage is useful', async () => {
  const f = table(); f.mana(); f.add('Colossal Dreadmaw');
  const charm = f.add('Boros Charm', f.bot, 'hand');
  assert.equal((await f.decide()).kind, 'pass');
  f.threat('Wrath of God');
  assert.equal((await f.decide()).card, charm);
  assert.equal(await f.game.castSpell(f.bot, charm, {from: 'hand'}), true);
  assert.equal(f.game.stack.at(-1).mode?.[0], 1);
  await f.game.resolveTop();
  assert.ok(f.game.creatures(f.bot).every(card => card.kw('indestructible')));
  f.game.stack.length = 0;
  const second = f.add('Boros Charm', f.bot, 'hand'); f.opponent.life = 4;
  assert.equal((await f.decide()).card, second);
});

test('an optional sacrifice for a card is declined through the real trigger/payment path', async () => {
  const f = table();
  const trigger = M.OracleV20.helpers.compileGenericTrigger({kind: 'generic-trigger', event: 'upkeep', eventFilter: 'your-upkeep',
    targets: [], effects: [{action: 'optional-payment', payment: {sacSelf: true}, effects: [{action: 'draw', who: 'you', n: 1}]}]});
  const source = f.add({name: 'Costly optional draw', types: ['Creature'], subtypes: ['Bear'], cost: '{3}{G}',
    power: '4', toughness: '4', oracle: '', kws: [], triggers: [trigger]});
  f.add('Forest', f.bot, 'library');
  await f.game.emit('upkeep', {player: f.bot}); await f.game.flushTriggers();
  assert.equal(f.game.stack.length, 1);
  await f.game.resolveTop();
  assert.equal(source.zone, 'battlefield'); assert.equal(f.bot.library.length, 1);
});

test('mandatory Ainok attack triggers still create their tokens', async () => {
  const f = table(); const ainok = f.add('Ainok Strike Leader');
  f.combat(ainok, f.opponent);
  await f.game.emit('attackersDeclared', {player: f.bot, attackers: [ainok]});
  await f.game.flushTriggers(); assert.equal(f.game.stack.length, 1);
  await f.game.resolveTop();
  assert.equal(f.game.creatures(f.bot).filter(card => card.isToken).length, 1);
  assert.equal(ainok.zone, 'battlefield');
});

for (const name of ['Gods Willing', "Teferi's Protection"]) {
  test(`${name} is saved until there is a real threat`, async () => {
    const f = table(); f.mana();
    const bear = f.add('Grizzly Bears'); const spell = f.add(name, f.bot, 'hand');
    assert.equal((await f.decide()).kind, 'pass');
    f.threat('Swords to Plowshares', [bear]);
    assert.equal((await f.decide()).card, spell);
  });
}

test('Gods Willing chooses the color of the removal, not the unrelated large creature', async () => {
  const f = table('hard'); f.mana();
  const bear = f.add('Grizzly Bears'); f.add('Ghalta, Primal Hunger', f.opponent);
  const spell = f.add('Gods Willing', f.bot, 'hand');
  f.threat('Swords to Plowshares', [bear]);
  assert.equal(await f.game.castSpell(f.bot, spell, {from: 'hand'}), true);
  await f.game.resolveTop();
  const swords = new M.CardInst(M.DEFS['Swords to Plowshares'], f.opponent);
  assert.equal(f.game.isProtectedFrom(bear, swords), true);
});

test('a dying sacrifice source is not mistaken for a creature saved by its own ability', async () => {
  const f = table(); const ainok = f.add('Ainok Strike Leader');
  f.combat(f.add('Colossal Dreadmaw', f.opponent), f.bot, [ainok]);
  assert.equal((await f.decide()).kind, 'pass');
});

test('Ainok cannot abandon a necessary trample block to save other tokens', async () => {
  const f = table(); f.bot.life = 5;
  const ainok = f.add('Ainok Strike Leader');
  const trample = f.add('Colossal Dreadmaw', f.opponent);
  f.combat(trample, f.bot, [ainok]);
  for (let i = 0; i < 10; i++) {
    const token = f.token(), attacker = f.add('Grizzly Bears', f.opponent);
    attacker.attacking = f.bot; attacker.blockedBy = [token]; attacker.wasBlocked = true; token.blocking = attacker.iid;
    f.game.combat.attackers.push(attacker);
  }
  assert.equal((await f.decide()).kind, 'pass', 'keeping the required blocker outranks saving expendable tokens');
});

test('a useful trick cannot justify paying the last two life in Phyrexian mana', async () => {
  const f = table(); f.bot.life = 2;
  const bear = f.add('Grizzly Bears'); const spell = f.add('Mutagenic Growth', f.bot, 'hand');
  f.threat('Lightning Bolt', [bear]);
  assert.equal((await f.decide()).kind, 'pass');
  assert.equal(f.bot.controller.castScore(f.game, {card: spell, from: 'hand'}), -1);
});

test('a pending counterspell already answering the removal does not need another protection spell', async () => {
  const f = table(); f.mana(); const bear = f.add('Grizzly Bears');
  f.add("Tamiyo's Safekeeping", f.bot, 'hand');
  const removal = f.threat('Swords to Plowshares', [bear]);
  f.threat('Counterspell', [removal], f.bot);
  assert.equal((await f.decide()).kind, 'pass');
});
