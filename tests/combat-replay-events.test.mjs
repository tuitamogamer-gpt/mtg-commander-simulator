import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
const plain = value => JSON.parse(JSON.stringify(value));
function table() {
  const events = [];
  const game = new M.Game({seed: 519, paced: false, onEvent: event => events.push(event)});
  game.pace = async () => {};
  const decide = async (g, q) => q.type === 'chooseOption' ? q.options[0]?.key
    : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
    : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
    : q.type === 'chooseX' ? q.min || 0 : q.type === 'orderTriggers' ? q.triggers : null;
  const a = game.addPlayer('You', {name: 'Your deck'}, {decide}, false);
  const b = game.addPlayer('Defender', {name: 'Their deck'}, {decide}, false);
  a.onlineSeat = 0; b.onlineSeat = 1;
  game.turnPlayer = a; game.turnNo = 7; game.phase = 'combat';
  const creature = (owner, name, power = 3, toughness = 3, keywords = [], extra = {}) => {
    const card = new M.CardInst({name, types: ['Creature'], subtypes: [], super: [], colors: [],
      cost: '', oracle: '', power: String(power), toughness: String(toughness), kws: keywords, ...extra}, owner);
    card.zone = 'battlefield'; card.sick = false; game.battlefield.push(card); game.recalc();
    return card;
  };
  const attack = (card, blockers = [], defender = b) => {
    card.attacking = defender; card.blockedBy = blockers; card.wasBlocked = blockers.length > 0;
    for (const blocker of blockers) blocker.blocking = card.iid;
    (game.combat ||= {attackers: []}).attackers.push(card);
    return card;
  };
  return {game, a, b, events, creature, attack,
    replay: () => events.filter(event => event.type === 'combatReplay').at(-1)?.replay};
}

test('multiple attackers and blockers retain actual allocation, simultaneous returns and public step totals', async () => {
  const f = table();
  const big = f.creature(f.a, 'Many-blocker attacker', 8, 8, ['trample', 'deathtouch', 'lifelink']);
  const direct = f.creature(f.a, 'Unblocked attacker', 3, 4, ['flying']);
  const guards = Array.from({length: 3}, (_, i) => f.creature(f.b, `Guard ${i}`, 2, 2));
  f.attack(big, guards); f.attack(direct);
  await f.game.combatDamage(f.a, 'normal');
  const replay = f.replay();
  assert.equal(replay.clashes.length, 2);
  assert.equal(replay.clashes[0].attacker.receivedDamage, 6);
  assert.equal(replay.clashes[0].attacker.lifeGain, 8);
  assert.deepEqual(Array.from(replay.clashes[0].blockers, card => card.receivedDamage), [1, 1, 1]);
  assert.ok(replay.clashes[0].blockers.every(card => card.died && card.zoneAfter === 'graveyard'));
  assert.ok(replay.clashes[0].blockers.every(card => card.countersAfter === null && card.damageAfter === null),
    'departed objects retain actual received damage without inventing a post-combat battlefield state');
  assert.equal(replay.clashes[0].damage.filter(hit => hit.targetId === 'player:1').reduce((n, hit) => n + hit.amount, 0), 5);
  assert.equal(replay.clashes[1].damage.filter(hit => hit.targetId === 'player:1').reduce((n, hit) => n + hit.amount, 0), 3);
  assert.deepEqual(Array.from(replay.players, row => [row.lifeBefore, row.lifeAfter]), [[40, 48], [40, 32]]);
  assert.equal(big.damage, 6);
  assert.equal(replay.clashes[1].blocked, false);
  assert.ok(replay.clashes[0].attacker.keywords.includes('deathtouch'));
  assert.ok(Object.isFrozen(replay) && Object.isFrozen(replay.clashes[0].attacker.keywords));
  const preserved = JSON.stringify(replay);
  big.cur.kw.clear(); big.counters.changed = 9; direct.def.name = 'Renamed later';
  assert.equal(JSON.stringify(replay), preserved, 'later mutable card changes cannot rewrite the replay');
  assert.equal(Object.keys(f.game).some(key => /replay/i.test(key)), false, 'history is not rules or save state');
});

test('double strike records separate real steps and keeps them in one combat history', async () => {
  const f = table();
  const striker = f.creature(f.a, 'Double striker', 6, 8, ['double strike', 'trample', 'lifelink']);
  f.attack(striker, Array.from({length: 3}, (_, i) => f.creature(f.b, `Block ${i}`, 2, 2)));
  await f.game.combatDamage(f.a, 'first');
  const early = f.replay();
  assert.equal(early.step, 'first');
  assert.equal(early.clashes[0].attacker.receivedDamage, 0);
  assert.equal(early.clashes[0].blockers.length, 3);
  await f.game.combatDamage(f.a, 'normal');
  const late = f.replay();
  assert.equal(late.step, 'normal');
  assert.equal(late.clashes[0].blockers.length, 0);
  assert.equal(late.clashes[0].blocked, true, 'destroyed blockers do not turn a blocked attack into unblocked');
  assert.equal(late.clashes[0].defender.lifeBefore, 40);
  assert.equal(late.clashes[0].defender.lifeAfter, 34);
  assert.equal(early.combatId, late.combatId);
  assert.notEqual(early.id, late.id);
  assert.equal(M.combatReplaysFor(f.game).length, 2);
  assert.deepEqual([f.a.life, f.b.life], [52, 34]);
  f.game.combat = {attackers: []};
  f.attack(f.creature(f.a, 'Zero-power attacker', 0, 2));
  await f.game.combatDamage(f.a, 'normal');
  assert.equal(M.combatReplaysFor(f.game)[0].id, early.id, 'a step without results preserves the last completed combat');
  f.game.combat = {attackers: [striker]};
  await f.game.combatDamage(f.a, 'normal');
  assert.equal(M.combatReplaysFor(f.game).length, 1, 'an extra combat replaces the previous combat history');
  assert.notEqual(f.replay().combatId, early.combatId);
});

test('a blocker shared by two attackers retains one actual damage allocation', async () => {
  const f = table();
  const one = f.creature(f.a, 'First attacker', 2, 4);
  const two = f.creature(f.a, 'Second attacker', 2, 4);
  const guard = f.creature(f.b, 'Multi-blocker', 3, 20);
  f.attack(one, [guard]); f.attack(two, [guard]);
  await f.game.combatDamage(f.a, 'normal');
  const replay = f.replay();
  assert.equal(replay.clashes.length, 2);
  assert.equal(replay.damage.filter(hit => hit.sourceId === `card:${guard.iid}`).reduce((n, hit) => n + hit.amount, 0), 3);
  assert.equal(replay.clashes[0].blockers[0].receivedDamage, 4, 'repeated card stats are explicitly whole-step totals');
  assert.equal(replay.clashes[1].blockers[0].receivedDamage, 4);
  assert.equal(one.damage + two.damage, 3, 'replay observation cannot multiply shared-blocker damage');
});

test('infect and wither report actual counters without fabricating life loss or marked damage', async () => {
  const f = table();
  const infector = f.creature(f.a, 'Infect attacker', 2, 4, ['infect', 'lifelink']);
  const witherer = f.creature(f.a, 'Wither attacker', 2, 8, ['wither']);
  const guard = f.creature(f.b, 'Withered guard', 1, 6);
  f.attack(infector); f.attack(witherer, [guard]);
  await f.game.combatDamage(f.a, 'normal');
  const replay = f.replay();
  assert.deepEqual([f.a.life, f.b.life, f.b.poison], [42, 40, 2]);
  assert.equal(replay.players[1].lifeBefore, replay.players[1].lifeAfter);
  assert.equal(replay.players[1].poisonAfter - replay.players[1].poisonBefore, 2);
  assert.equal(replay.clashes[0].damage[0].infect, true);
  assert.equal(replay.clashes[1].blockers[0].damageAfter, 0);
  assert.equal(replay.clashes[1].blockers[0].countersAfter['-1/-1'], 2);
  assert.equal(replay.clashes[0].attacker.lifeGain, 2);
  assert.ok(replay.effects.some(effect => effect.counterKind === 'poison' && effect.amount === 2));
  assert.ok(replay.effects.some(effect => effect.counterKind === '-1/-1' && effect.amount === 2));
});

test('prevention and indestructible show completed outcomes instead of presumed damage or death', async () => {
  const f = table();
  const attacker = f.creature(f.a, 'Prevented attacker', 4, 9);
  const fog = f.creature(f.b, 'Fog Bank', 0, 2, [], M.DEFS['Fog Bank']);
  const second = f.creature(f.a, 'Lethal attacker', 7, 9);
  const immortal = f.creature(f.b, 'Immortal blocker', 1, 2, ['indestructible']);
  f.attack(attacker, [fog]); f.attack(second, [immortal]);
  await f.game.combatDamage(f.a, 'normal');
  const [prevented, survived] = f.replay().clashes;
  assert.equal(prevented.attacker.dealtDamage, 0);
  assert.equal(prevented.blockers[0].receivedDamage, 0);
  assert.equal(prevented.blockers[0].preventedDamage, 4);
  assert.equal(prevented.blockers[0].died, false);
  assert.equal(survived.blockers[0].receivedDamage, 7);
  assert.equal(survived.blockers[0].damageAfter, 7);
  assert.equal(survived.blockers[0].died, false);
  assert.equal(f.b.life, 40);
});

test('planeswalker and battle targets retain their counter outcomes without imaginary face damage', async () => {
  const f = table();
  const walker = f.creature(f.b, 'Public walker', 0, 0, [], {types: ['Planeswalker'], loyalty: 5});
  walker.counters.loyalty = 5;
  const battle = f.creature(f.b, 'Public battle', 0, 0, [], {types: ['Battle'], defense: 6});
  battle.counters.defense = 6; battle.protector = f.b;
  f.game.recalc();
  f.attack(f.creature(f.a, 'Walker attacker', 2, 5), [], walker);
  f.attack(f.creature(f.a, 'Battle attacker', 3, 5), [], battle);
  await f.game.combatDamage(f.a, 'normal');
  const [first, second] = f.replay().clashes;
  assert.equal(first.defender.kind, 'permanent');
  assert.equal(first.defender.countersBefore.loyalty, 5);
  assert.equal(first.defender.countersAfter.loyalty, 3);
  assert.equal(second.defender.countersBefore.defense, 6);
  assert.equal(second.defender.countersAfter.defense, 3);
  assert.equal(f.b.life, 40);
});

test('Live retains public replay after the short event queue rolls over and reconnect decodes it', async () => {
  const f = table();
  const secret = f.creature(f.a, 'Secret card identity', 7, 7, ['infect']);
  secret.faceDown = true; secret.meta.faceDownDef = secret.def;
  secret.def = {...secret.def, name: 'Secret card identity', kws: [], power: '2', toughness: '2'};
  f.game.recalc();
  // Face-down creatures may have public granted abilities. They are frozen
  // without publishing the original printed face or its artwork.
  secret.cur.kw.add('flying');
  f.attack(secret);
  await f.game.combatDamage(f.a, 'normal');
  for (let i = 0; i < 30; i++) f.game.note('gameEffect', {kind: 'lifeGain', player: f.b, amount: 1});
  f.game._onlinePublicEvents = f.events.slice(-24).map((event, index) => ({id: index + 1, event}));
  assert.equal(f.game._onlinePublicEvents.some(row => row.event.type === 'combatReplay'), false);
  const wire = plain(M.onlineGameViewFor(f.game, f.b));
  assert.equal(wire.combatReplays.length, 1);
  const text = JSON.stringify(wire.combatReplays);
  assert.doesNotMatch(text, /Secret card identity/);
  assert.equal(wire.combatReplays[0].clashes[0].attacker.image, null);
  assert.equal(wire.combatReplays[0].clashes[0].attacker.name, 'Face-down creature');
  assert.ok(wire.combatReplays[0].clashes[0].attacker.keywords.includes('flying'));
  const model = new M.OnlineArenaView();
  model.update(wire, f.b.onlineSeat);
  const decoded = model.decode(wire.combatReplays);
  assert.equal(decoded[0].clashes[0].attacker.controllerName, 'You');
  assert.equal(decoded[0].clashes[0].attacker.iid, secret.iid);
  assert.equal(decoded[0].players[1].lifeAfter, f.b.life);
});

test('AI simulations produce the same rules outcome without replay events or retained presentation state', async () => {
  const f = table();
  f.attack(f.creature(f.a, 'Simulation attacker', 3, 4));
  f.game._simulation = true;
  await f.game.combatDamage(f.a, 'normal');
  assert.equal(f.b.life, 37);
  assert.equal(f.replay(), undefined);
  assert.equal(M.combatReplaysFor(f.game).length, 0);
});
