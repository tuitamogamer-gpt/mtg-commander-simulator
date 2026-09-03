import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Conformance against the official Magic: The Gathering Comprehensive Rules,
// effective 7 August 2026 (published as MagicCompRules 20260819).
// Every assertion below names the rule it is proving, so a future engine change
// that breaks a printed rule fails here with the rule number in hand.

export const COMPREHENSIVE_RULES_VERSION = '2026-08-07';

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];

function defaultAnswer(question, player) {
  switch (question.type) {
    case 'chooseCards': return (question.from || []).slice(0, question.min || 0);
    case 'chooseTargets': return (question.candidates || []).slice(0, question.min || 0);
    case 'chooseOption': return (question.options[0] || {}).key;
    case 'chooseMulti': return (question.options || []).slice(0, question.min || 1).map(option => option.key);
    case 'chooseX': return question.max ?? 0;
    case 'scry': return { top: (question.cards || []).slice(), bottom: [] };
    case 'orderTriggers': return question.triggers;
    case 'bottomCards': return (question.player || player).hand.slice(0, question.n || 0);
    case 'priority': return { kind: 'pass' };
    case 'main': return { kind: 'done' };
    case 'attackers': case 'blockers': case 'combatReview': return [];
    default: return null;
  }
}

function table({ seats = 2, seed = 30, answer } = {}) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 100 });
  const players = [];
  for (let index = 0; index < seats; index++) {
    players.push(game.addPlayer(String.fromCharCode(65 + index), { name: String.fromCharCode(65 + index) }, {
      decide: async (currentGame, question) => (answer ? answer(question, players[index], currentGame)
        : defaultAnswer(question, players[index])),
    }, index > 0));
  }
  game.turnPlayer = players[0];
  game.turnNo = 5;
  game.phase = 'main1';
  game.step = 'main';
  const permanent = (player, name, options = {}) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.ctrl = options.ctrl || player;
    card.zone = 'battlefield';
    card.sick = options.sick ?? false;
    card.tapped = !!options.tapped;
    if (options.commander) card.commander = true;
    game.battlefield.push(card);
    game.recalc();
    return card;
  };
  const zoneCard = (player, name, zone) => {
    const card = new MTG.CardInst(MTG.DEFS[name], player);
    card.zone = zone;
    player[zone].push(card);
    return card;
  };
  for (const player of players) {
    for (let index = 0; index < 20; index++) zoneCard(player, 'Forest', 'library');
    for (const color of COLORS) player.pool[color] = 30;
  }
  game.recalc();
  return { game, players, a: players[0], b: players[1], permanent, zoneCard };
}

async function settle(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 40) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
    await game.checkSBA();
  }
}

const find = predicate => Object.entries(MTG.DEFS).find(([, def]) => predicate(def));
const creatureWith = keyword => find(def => def.types.includes('Creature') && (def.kws || []).includes(keyword));

test('704.5 — state-based actions', async () => {
  {
    const { game, a } = table();
    a.life = 0;
    await game.checkSBA();
    assert.ok(a.lost, '704.5a: a player at 0 life loses');
  }
  {
    const { game, a } = table();
    a.poison = 10;
    await game.checkSBA();
    assert.ok(a.lost, '704.5c: ten poison counters lose the game');
  }
  {
    const { game, a } = table();
    a.poison = 9;
    await game.checkSBA();
    assert.ok(!a.lost, '704.5c: nine poison counters do not');
  }
  {
    const { game, a } = table();
    const [token] = await game.makeTokens('humanSoldier', a, { n: 1 });
    await game.move(token, 'graveyard');
    await game.checkSBA();
    assert.ok(!a.graveyard.includes(token), '704.5d: a token outside the battlefield ceases to exist');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addCounters(bear, '-1/-1', 2);
    game.recalc();
    await game.checkSBA();
    assert.equal(bear.zone, 'graveyard', '704.5f: 0 toughness goes to the graveyard');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    bear.damage = 2;
    await game.checkSBA();
    assert.equal(bear.zone, 'graveyard', '704.5g: lethal marked damage destroys');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    bear.damage = 1;
    await game.checkSBA();
    assert.equal(bear.zone, 'battlefield', '704.5g: damage below toughness does not');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    bear.damage = 1;
    bear.deathtouched = true;
    await game.checkSBA();
    assert.equal(bear.zone, 'graveyard', '704.5h: any damage from a deathtouch source destroys');
  }
  {
    const walker = find(def => def.types.includes('Planeswalker'));
    const { game, a, permanent } = table();
    const card = permanent(a, walker[0]);
    card.counters.loyalty = 0;
    game.recalc();
    await game.checkSBA();
    assert.equal(card.zone, 'graveyard', '704.5i: a planeswalker at 0 loyalty is put into the graveyard');
  }
  {
    const legend = find(def => (def.super || []).includes('Legendary') && def.types.includes('Creature'));
    const { game, a, b, permanent } = table();
    const mine = [permanent(a, legend[0]), permanent(a, legend[0])];
    const theirs = permanent(b, legend[0]);
    game.recalc();
    await game.checkSBA();
    assert.equal(mine.filter(card => card.zone === 'battlefield').length, 1, '704.5j: the legend rule keeps one');
    assert.equal(theirs.zone, 'battlefield', '704.5j: the legend rule is per player');
  }
  {
    const equipment = find(def => (def.subtypes || []).includes('Equipment'));
    const { game, a, permanent } = table();
    const host = permanent(a, 'Grizzly Bears');
    const gear = permanent(a, equipment[0]);
    gear.attachedTo = host.iid;
    host.attachments.push(gear.iid);
    game.recalc();
    await game.move(host, 'graveyard');
    await game.checkSBA();
    assert.equal(gear.zone, 'battlefield', '704.5n: equipment stays on the battlefield');
    assert.ok(!gear.attachedTo, '704.5n: and becomes unattached');
  }
  {
    const aura = find(def => (def.subtypes || []).includes('Aura') && def.types.includes('Enchantment'));
    const { game, a, permanent } = table();
    const host = permanent(a, 'Grizzly Bears');
    const spell = permanent(a, aura[0]);
    spell.attachedTo = host.iid;
    host.attachments.push(spell.iid);
    game.recalc();
    await game.move(host, 'graveyard');
    await game.checkSBA();
    assert.equal(spell.zone, 'graveyard', '704.5m: an aura with no legal host is put into the graveyard');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addCounters(bear, '+1/+1', 3);
    game.addCounters(bear, '-1/-1', 2);
    game.recalc();
    await game.checkSBA();
    assert.equal(bear.counters['+1/+1'] || 0, 1, '704.5q: counters annihilate in pairs');
    assert.equal(bear.counters['-1/-1'] || 0, 0, '704.5q: counters annihilate in pairs');
  }
  {
    const { game, a, permanent } = table();
    const one = permanent(a, 'Grizzly Bears');
    const two = permanent(a, 'Grizzly Bears');
    one.damage = 2;
    two.damage = 2;
    await game.checkSBA();
    assert.ok(one.zone === 'graveyard' && two.zone === 'graveyard',
      '704.3: every applicable state-based action happens in one check');
  }
});

test('903 — the Commander variant', async () => {
  const legend = find(def => (def.super || []).includes('Legendary') && def.types.includes('Creature') && def.cost)[0];
  {
    const { a } = table();
    assert.equal(a.life, 40, '903.7: the starting life total is 40');
  }
  {
    const { game, a, b, permanent } = table();
    const commander = permanent(a, legend, { commander: true });
    b.commanderDamage[commander.iid] = 21;
    await game.checkSBA();
    assert.ok(b.lost, '903.10a: 21 combat damage from one commander loses the game');
  }
  {
    const { game, a, b, permanent } = table();
    const commander = permanent(a, legend, { commander: true });
    b.commanderDamage[commander.iid] = 20;
    await game.checkSBA();
    assert.ok(!b.lost, '903.10a: 20 is not enough');
  }
  {
    const { game, a, b, permanent } = table();
    const first = permanent(a, legend, { commander: true });
    const second = permanent(a, legend, { commander: true });
    b.commanderDamage[first.iid] = 12;
    b.commanderDamage[second.iid] = 12;
    await game.checkSBA();
    assert.ok(!b.lost, '903.10a: damage from two commanders is tracked separately');
  }
  {
    const { game, a, zoneCard } = table();
    const commander = zoneCard(a, legend, 'command');
    commander.commander = true;
    a.commanders.push(commander);
    game.recalc();
    const printed = MTG.parseCost(MTG.DEFS[legend].cost);
    assert.equal(game.spellCost(a, commander, { from: 'command' }).generic, printed.generic,
      '903.8: the first cast from the command zone has no tax');
    commander.cmdCasts = 1;
    assert.equal(game.spellCost(a, commander, { from: 'command' }).generic, printed.generic + 2,
      '903.8: each previous cast adds {2}');
    commander.cmdCasts = 2;
    const taxed = game.spellCost(a, commander, { from: 'command' });
    assert.equal(taxed.generic, printed.generic + 4, '903.8: the tax accumulates');
    assert.deepEqual(taxed.pips, printed.pips, '903.8: the tax never changes the colored requirement');
  }
  for (const zone of ['graveyard', 'exile', 'hand', 'library']) {
    const { game, a, permanent } = table({ answer: question => (question.type === 'chooseOption' ? 'cmd' : null) });
    const commander = permanent(a, legend, { commander: true });
    a.commanders.push(commander);
    await game.move(commander, zone);
    await game.checkSBA();
    assert.ok(['command', zone].includes(commander.zone),
      `903.9: a commander heading to the ${zone} may go to the command zone instead`);
  }
});

test('500-514 — turn structure', async () => {
  {
    const { game, a } = table();
    a.library.length = 0;
    await game.draw(a, 1);
    await game.checkSBA();
    assert.ok(a.lost, '104.3b/704.5b: drawing from an empty library loses the game');
  }
  {
    const { game, a } = table();
    const order = [];
    for (const name of ['first', 'second']) {
      game.stack.push({ kind: 'ability', name, ctrl: a, run: async () => order.push(name), targets: [] });
    }
    await game.resolveTop();
    await game.resolveTop();
    assert.deepEqual(order, ['second', 'first'], '405.5: the stack resolves last in, first out');
  }
  {
    const { game, a, zoneCard } = table();
    const first = zoneCard(a, 'Forest', 'hand');
    const second = zoneCard(a, 'Forest', 'hand');
    a.landsPlayed = 0;
    assert.equal(await game.playLand(a, first), true, '505.5b: the first land play is legal');
    assert.equal(await game.playLand(a, second), false, '505.5b: only one land per turn');
  }
  {
    let priorityInUntap = false;
    const { game, a, b, permanent, zoneCard } = table({
      answer: (question, player, currentGame) => {
        if (question.type === 'priority' && currentGame.phase === 'untap') priorityInUntap = true;
        return defaultAnswer(question, player);
      },
    });
    const mine = permanent(a, 'Forest', { tapped: true });
    const theirs = permanent(b, 'Forest', { tapped: true });
    const bear = permanent(a, 'Grizzly Bears');
    bear.damage = 1;
    MTG.E.pumpUntilEOT(game, bear, 3, 3);
    game.recalc();
    const boosted = bear.power;
    for (let index = 0; index < 10; index++) zoneCard(a, 'Forest', 'hand');
    await game.runTurn();
    assert.ok(!mine.tapped, '502.2: the untap step untaps the active player');
    assert.ok(theirs.tapped, '502.2: and nobody else');
    assert.ok(!priorityInUntap, '502.3: no player receives priority during the untap step');
    assert.ok(a.hand.length <= 7, '514.1: the active player discards down to the maximum hand size');
    assert.equal(bear.damage, 0, '514.2: marked damage is removed during cleanup');
    assert.equal(boosted, 5, '514.2: the pump applied while the turn ran');
    assert.equal(bear.power, 2, '514.2: until-end-of-turn effects end during cleanup');
  }
  {
    const { game, a } = table();
    a.pool.G = 5;
    game.emptyPool();
    assert.ok(Object.values(a.pool).every(value => value === 0), '500.4: the mana pool empties between steps');
  }
  {
    const { game, a, b, permanent, zoneCard } = table();
    const bolt = zoneCard(a, 'Lightning Bolt', 'hand');
    const victim = permanent(b, 'Grizzly Bears');
    const before = b.life;
    game.stack.push({
      kind: 'spell', name: bolt.name, card: bolt, srcCard: bolt, ctrl: a, targets: [victim],
      targetSpecs: MTG.DEFS['Lightning Bolt'].targets || [], castOpts: {}, from: 'hand',
      ctx: { g: game, you: a, src: bolt, targets: [victim] }, run: MTG.DEFS['Lightning Bolt'].resolve,
    });
    await game.move(victim, 'graveyard');
    await game.resolveTop();
    assert.equal(b.life, before, '608.2b: a spell whose only target is illegal does not resolve');
  }
  {
    const casts = [];
    const { game, a, zoneCard } = table({
      answer: (question, player) => {
        if (question.type === 'priority') {
          const bolt = player.hand.find(card => card.name === 'Lightning Bolt');
          if (bolt && casts.length < 2 && player === a) { casts.push(bolt); return { kind: 'cast', card: bolt, from: 'hand' }; }
          return { kind: 'pass' };
        }
        if (question.type === 'chooseTargets') return (question.candidates || []).slice(0, Math.max(question.min || 0, 1));
        return defaultAnswer(question, player);
      },
    });
    zoneCard(a, 'Lightning Bolt', 'hand');
    zoneCard(a, 'Lightning Bolt', 'hand');
    game.recalc();
    await game.priorityRound(a);
    assert.equal(casts.length, 2, '117.3c: the player who took an action keeps priority');
  }
});

test('506-511 — combat', async () => {
  async function combatTable() {
    const setup = table({ seed: 31 });
    setup.game.phase = 'combat';
    setup.game.step = 'damage';
    return setup;
  }
  async function runDeclaration(make, declare) {
    const game = new MTG.Game({ seed: 32, paced: false, maxTurns: 100 });
    const players = [];
    let offered = null;
    for (let index = 0; index < 2; index++) {
      players.push(game.addPlayer(index ? 'B' : 'A', { name: index ? 'B' : 'A' }, {
        decide: async (currentGame, question) => {
          if (question.type === 'attackers') { offered = question; return declare(question, players[0], players[1]); }
          return defaultAnswer(question, players[index]);
        },
      }, index > 0));
    }
    const [a, b] = players;
    game.turnPlayer = a;
    game.turnNo = 5;
    const permanent = (player, name, options = {}) => {
      const card = new MTG.CardInst(MTG.DEFS[name], player);
      card.ctrl = player;
      card.zone = 'battlefield';
      card.sick = options.sick ?? false;
      card.tapped = !!options.tapped;
      game.battlefield.push(card);
      game.recalc();
      return card;
    };
    for (const player of players) for (let index = 0; index < 20; index++) {
      const card = new MTG.CardInst(MTG.DEFS.Forest, player);
      card.zone = 'library';
      player.library.push(card);
    }
    const card = make(permanent, a, b);
    game.recalc();
    await game.combatPhase(a);
    return { game, a, b, card, offered };
  }

  {
    const { card, offered } = await runDeclaration(
      (permanent, a) => permanent(a, 'Grizzly Bears', { tapped: true }),
      (question, a, b) => (question.eligible[0] ? [{ card: question.eligible[0], target: b }] : []));
    // with no legal attacker the engine skips the declaration entirely, which
    // is the same guarantee: the tapped creature is never offered
    assert.ok(!offered || !offered.eligible.includes(card), '508.1a: a tapped creature is not an eligible attacker');
    assert.ok(!card.attacking, '508.1a: and it does not attack');
  }
  {
    const { card, offered } = await runDeclaration(
      (permanent, a) => permanent(a, 'Grizzly Bears', { sick: true }),
      (question, a, b) => (question.eligible[0] ? [{ card: question.eligible[0], target: b }] : []));
    assert.ok(!offered || !offered.eligible.includes(card), '508.1a: a summoning-sick creature is not eligible');
    assert.ok(!card.attacking, '508.1a: and it does not attack');
  }
  {
    let forced = null;
    const { card } = await runDeclaration(
      (permanent, a) => { forced = permanent(a, 'Grizzly Bears', { tapped: true }); return forced; },
      (question, a, b) => [{ card: forced, target: b }]);
    assert.ok(!card.attacking, '508.1a: an illegal declaration forced past the offer is rejected');
  }
  {
    const hasty = creatureWith('haste');
    const { game, a, permanent } = await combatTable();
    const card = permanent(a, hasty[0], { sick: true });
    assert.ok(game.canAttackAtAll(card), `508.1a: haste lets a new creature attack (${hasty[0]})`);
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    const blocker = permanent(b, 'Grizzly Bears', { tapped: true });
    assert.ok(!game.canBlock(blocker, attacker), '509.1a: a tapped creature cannot block');
  }
  {
    const flyer = creatureWith('flying');
    const reach = creatureWith('reach');
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, flyer[0]);
    assert.ok(!game.canBlock(permanent(b, 'Grizzly Bears'), attacker), '702.9b: ground creatures cannot block a flyer');
    assert.ok(game.canBlock(permanent(b, flyer[0]), attacker), '702.9b: flying can block flying');
    if (reach) assert.ok(game.canBlock(permanent(b, reach[0]), attacker), '702.17b: reach can block a flyer');
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    attacker.attacking = b;
    game.combat = { attackers: [attacker], blockers: [] };
    const before = b.life;
    await game.combatDamage(a, 'normal');
    assert.equal(b.life, before - 2, '510.1a: an unblocked attacker damages the defending player');
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    const blocker = permanent(b, 'Grizzly Bears');
    attacker.attacking = b;
    blocker.blocking = attacker.iid;
    attacker.blockedBy = [blocker];
    attacker.wasBlocked = true;
    game.combat = { attackers: [attacker], blockers: [blocker] };
    const before = b.life;
    await game.combatDamage(a, 'normal');
    await game.checkSBA();
    assert.equal(b.life, before, '510.1a: a blocked creature deals no damage to the player');
    assert.ok(attacker.zone === 'graveyard' && blocker.zone === 'graveyard', '510.2: equal bodies trade');
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    const blocker = permanent(b, 'Grizzly Bears');
    attacker.attacking = b;
    blocker.blocking = attacker.iid;
    attacker.blockedBy = [blocker];
    attacker.wasBlocked = true;
    game.combat = { attackers: [attacker], blockers: [blocker] };
    await game.move(blocker, 'graveyard');
    const before = b.life;
    await game.combatDamage(a, 'normal');
    assert.equal(b.life, before, '509.1h: a blocked creature stays blocked when its blocker leaves');
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    attacker.attacking = b;
    game.combat = { attackers: [attacker], blockers: [] };
    attacker.tapped = true;
    const before = b.life;
    await game.combatDamage(a, 'normal');
    assert.equal(b.life, before - 2, '506.4b: tapping a declared attacker does not stop its damage');
  }
  {
    const trampler = find(def => def.types.includes('Creature') && (def.kws || []).includes('trample') && Number(def.power) >= 4);
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, trampler[0]);
    const blocker = permanent(b, 'Grizzly Bears');
    attacker.attacking = b;
    blocker.blocking = attacker.iid;
    attacker.blockedBy = [blocker];
    attacker.wasBlocked = true;
    game.combat = { attackers: [attacker], blockers: [blocker] };
    const before = b.life;
    const power = attacker.power;
    await game.combatDamage(a, 'normal');
    assert.equal(b.life, before - (power - 2), `702.19b: trample carries the excess past the blocker (${trampler[0]})`);
  }
  {
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, 'Grizzly Bears');
    const blocker = permanent(b, 'Grizzly Bears');
    const iid = attacker.iid;
    game.untilEffects.push({
      expires: 'eot', kind: 'grant',
      apply: (currentGame, battlefield) => {
        const card = battlefield.find(candidate => candidate.iid === iid);
        if (card) { card.cur.kw.add('trample'); card.cur.kw.add('deathtouch'); }
      },
    });
    MTG.E.pumpUntilEOT(game, attacker, 3, 0);
    game.recalc();
    assert.ok(attacker.kw('trample') && attacker.kw('deathtouch'), 'fixture grants both keywords');
    attacker.attacking = b;
    blocker.blocking = attacker.iid;
    attacker.blockedBy = [blocker];
    attacker.wasBlocked = true;
    game.combat = { attackers: [attacker], blockers: [blocker] };
    const before = b.life;
    const power = attacker.power;
    await game.combatDamage(a, 'normal');
    await game.checkSBA();
    assert.equal(b.life, before - (power - 1),
      '702.2c: with deathtouch, one damage is lethal, so the rest tramples over');
    assert.equal(blocker.zone, 'graveyard', '702.2c: and the blocker still dies');
  }
  {
    const walker = find(def => def.types.includes('Planeswalker'));
    const { game, a, b, permanent } = await combatTable();
    const target = permanent(b, walker[0]);
    const attacker = permanent(a, 'Grizzly Bears');
    attacker.attacking = target;
    game.combat = { attackers: [attacker], blockers: [] };
    await game.move(target, 'graveyard');
    const before = b.life;
    await game.combatDamage(a, 'normal');
    assert.equal(b.life, before, '506.4c: an attacker whose planeswalker left deals no damage instead');
  }
  {
    const striker = creatureWith('first strike');
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, striker[0]);
    attacker.attacking = b;
    game.combat = { attackers: [attacker], blockers: [] };
    const before = b.life;
    await game.combatDamage(a, 'first');
    const afterFirst = b.life;
    await game.combatDamage(a, 'normal');
    assert.ok(afterFirst < before, '702.2b: a first striker deals damage in the first-strike step');
    assert.equal(b.life, afterFirst, '702.2b: and not again in the normal step');
  }
  {
    const striker = creatureWith('double strike');
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, striker[0]);
    attacker.attacking = b;
    game.combat = { attackers: [attacker], blockers: [] };
    const before = b.life;
    await game.combatDamage(a, 'first');
    const afterFirst = b.life;
    await game.combatDamage(a, 'normal');
    assert.ok(afterFirst < before && b.life < afterFirst, '702.4b: a double striker deals damage in both steps');
  }
  {
    const linked = creatureWith('lifelink');
    const { game, a, b, permanent } = await combatTable();
    const attacker = permanent(a, linked[0]);
    attacker.attacking = b;
    game.combat = { attackers: [attacker], blockers: [] };
    const before = a.life;
    const power = attacker.power;
    await game.combatDamage(a, 'normal');
    assert.equal(a.life, before + power, '702.15b: lifelink gains that much life');
  }
  {
    const infected = creatureWith('infect');
    if (infected) {
      const { game, a, b, permanent } = await combatTable();
      const attacker = permanent(a, infected[0]);
      attacker.attacking = b;
      game.combat = { attackers: [attacker], blockers: [] };
      const before = b.life;
      const power = attacker.power;
      await game.combatDamage(a, 'normal');
      assert.equal(b.life, before, '702.90b: infect deals no life loss');
      assert.equal(b.poison, power, '702.90b: it gives that many poison counters instead');
    }
  }
});

test('613 — the layer system', () => {
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addCounters(bear, '+1/+1', 1);
    game.recalc();
    game.addOracleBasePT(bear, { power: 1, toughness: 1, temporary: true });
    game.recalc();
    assert.equal(`${bear.power}/${bear.toughness}`, '2/2', '613.4b before 613.4c: a set base applies before an existing counter');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addOracleBasePT(bear, { power: 1, toughness: 1, temporary: true });
    game.recalc();
    game.addCounters(bear, '+1/+1', 1);
    game.recalc();
    assert.equal(`${bear.power}/${bear.toughness}`, '2/2', '613.4b before 613.4c: and before a later counter');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addOracleBasePT(bear, { power: 1, toughness: 1, temporary: true });
    game.recalc();
    game.addOracleBasePT(bear, { power: 5, toughness: 5, temporary: true });
    game.recalc();
    assert.equal(`${bear.power}/${bear.toughness}`, '5/5', '613.7: the later effect wins inside a layer');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addCounters(bear, '+1/+1', 2);
    MTG.E.pumpUntilEOT(game, bear, 3, 3);
    game.recalc();
    assert.equal(`${bear.power}/${bear.toughness}`, '7/7', '613.4c: counters and pump effects add up');
  }
  {
    const { game, a, permanent } = table();
    const land = permanent(a, 'Forest');
    game.addOracleAnimation(land, {
      types: ['Creature'], subtypes: ['Elemental'], power: 3, toughness: 3,
      retainTypes: true, temporary: true, colors: null, keywords: [],
    });
    game.addOracleBasePT(land, { power: 3, toughness: 3, temporary: true });
    game.recalc();
    assert.ok(land.is('Creature') && land.is('Land'), '613.1: layer 4 makes it a creature land');
    assert.equal(`${land.power}/${land.toughness}`, '3/3', '613.1: and layer 7 gives it the granted power and toughness');
  }
});

test('700-702 — keywords, zones and abilities', async () => {
  {
    const ind = creatureWith('indestructible');
    const { game, a, permanent } = table();
    const card = permanent(a, ind[0]);
    await game.destroy(card);
    await game.checkSBA();
    assert.equal(card.zone, 'battlefield', '702.12b: destroy does not destroy an indestructible creature');
    card.damage = 99;
    await game.checkSBA();
    assert.equal(card.zone, 'battlefield', '702.12b: nor does lethal damage');
    game.addOracleBasePT(card, { power: 0, toughness: 0, temporary: true });
    game.recalc();
    await game.checkSBA();
    assert.equal(card.zone, 'graveyard', '704.5f: but 0 toughness still puts it into the graveyard');
  }
  {
    const hex = creatureWith('hexproof');
    const { game, a, b, permanent } = table();
    const card = permanent(b, hex[0]);
    const spec = (MTG.DEFS['Lightning Bolt'].targets || [])[0];
    assert.ok(!game.legalTargets(spec, new MTG.CardInst(MTG.DEFS['Lightning Bolt'], a), a).includes(card),
      '702.11b: an opponent cannot target a hexproof creature');
    assert.ok(game.legalTargets(spec, new MTG.CardInst(MTG.DEFS['Lightning Bolt'], b), b).includes(card),
      '702.11b: its controller still can');
  }
  {
    const shrouded = creatureWith('shroud');
    if (shrouded) {
      const { game, a, b, permanent } = table();
      const card = permanent(b, shrouded[0]);
      const spec = (MTG.DEFS['Lightning Bolt'].targets || [])[0];
      assert.ok(!game.legalTargets(spec, new MTG.CardInst(MTG.DEFS['Lightning Bolt'], a), a).includes(card),
        '702.18b: nobody can target a creature with shroud');
      assert.ok(!game.legalTargets(spec, new MTG.CardInst(MTG.DEFS['Lightning Bolt'], b), b).includes(card),
        '702.18b: not even its controller');
    }
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    game.addCounters(bear, '+1/+1', 3);
    bear.damage = 1;
    game.recalc();
    await game.move(bear, 'graveyard');
    await game.move(bear, 'battlefield', { ctrl: a });
    game.recalc();
    assert.equal(bear.counters['+1/+1'] || 0, 0, '400.7: a card that changes zones is a new object');
    assert.equal(bear.damage || 0, 0, '400.7: marked damage does not follow it either');
  }
  {
    const tapper = find(def => def.types.includes('Creature') && !(def.kws || []).includes('haste') &&
      (def.abilities || []).some(ability => ability.cost && ability.cost.tap &&
        Object.keys(ability.cost).length === 1 && !ability.cond && !ability.targets && !ability.sorcery));
    const { game, a, permanent } = table();
    const sick = permanent(a, tapper[0], { sick: true });
    const ready = permanent(a, tapper[0], { sick: false });
    game.recalc();
    const offered = game.activatableList(a);
    const hasTapAbility = card => offered.some(entry => entry.card === card &&
      entry.ability && entry.ability.cost && entry.ability.cost.tap);
    assert.ok(!hasTapAbility(sick), '302.6: a summoning-sick creature cannot use a tap ability');
    assert.ok(hasTapAbility(ready), '302.6: one controlled since the turn began can');
  }
  {
    const { game, a, permanent } = table();
    const bear = permanent(a, 'Grizzly Bears');
    bear.regenShield = 1;
    bear.damage = 2;
    await game.checkSBA();
    assert.equal(bear.zone, 'battlefield', '701.19: regeneration replaces destruction');
    assert.ok(bear.tapped, '701.19: the creature becomes tapped');
    assert.equal(bear.damage, 0, '701.19: and its damage is removed');
  }
  {
    let ran = 0;
    const { game, a } = table();
    game.queueTrigger({ src: null, ctrl: a, name: 'intervening if', onlyIf: () => a.life >= 40, run: async () => { ran++; } });
    a.life = 10;
    await settle(game);
    assert.equal(ran, 0, '603.4: an intervening-if trigger does nothing when its condition fails on resolution');
  }
  {
    let ran = 0;
    const { game, a } = table();
    game.queueTrigger({ src: null, ctrl: a, name: 'intervening if', onlyIf: () => a.life >= 40, run: async () => { ran++; } });
    await settle(game);
    assert.equal(ran, 1, '603.4: and resolves when the condition still holds');
  }
});

test('800 — multiplayer', async () => {
  {
    const { game, players, permanent, zoneCard } = table({ seats: 3, seed: 33 });
    const [a, b] = players;
    const onBoard = permanent(b, 'Grizzly Bears');
    zoneCard(b, 'Forest', 'hand');
    zoneCard(b, 'Lightning Bolt', 'graveyard');
    const stolen = permanent(a, 'Grizzly Bears', { ctrl: b });
    b.life = 0;
    await game.checkSBA();
    assert.ok(b.lost, '704.5a: the player leaves the game');
    assert.notEqual(onBoard.zone, 'battlefield', '800.4a: their permanents leave the battlefield');
    assert.equal(b.hand.length, 0, '800.4a: their hand leaves the game');
    assert.equal(b.graveyard.length, 0, '800.4a: so does their graveyard');
    assert.ok(stolen.zone !== 'battlefield' || stolen.ctrl === a,
      '800.4a: a card they controlled but did not own does not stay under their control');
  }
  {
    const { game, players } = table({ seats: 3, seed: 34 });
    const [, b] = players;
    b.life = 0;
    await game.checkSBA();
    const before = game.battlefield.length;
    await game.makeTokens('humanSoldier', b, { n: 3 });
    assert.equal(game.battlefield.length, before, '800.4b: no token is created for a player who has left');
  }
  {
    const { game, players } = table({ seats: 3, seed: 35 });
    const [a, b, c] = players;
    b.life = 0;
    c.life = 0;
    await game.checkSBA();
    assert.ok(game.gameOver, '104.2a: the game ends');
    assert.equal(game.winner, a, '104.2a: the last player in the game wins');
  }
  {
    let asked = null;
    const order = [];
    const { game, a } = table({
      seats: 2, seed: 36,
      answer: (question, player) => {
        if (question.type === 'orderTriggers') { asked = question.triggers.slice(); return question.triggers.slice().reverse(); }
        return defaultAnswer(question, player);
      },
    });
    for (const name of ['one', 'two']) {
      game.queueTrigger({ src: null, ctrl: a, name, run: async () => order.push(name) });
    }
    await settle(game);
    assert.equal(asked && asked.length, 2, '603.3b: the controller orders their simultaneous triggers');
    assert.deepEqual(order, ['one', 'two'], '603.3b: the chosen order decides which resolves first');
  }
});
