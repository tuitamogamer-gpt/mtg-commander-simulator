import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 8232611, paced: false, maxTurns: 100 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Limit', { name: index ? `Opp ${index}` : 'Limit Break' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) }, index > 0,
  ));
  game.turnPlayer = players[0]; game.turnNo = 12; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false; game.battlefield.push(card); game.recalc(); return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player); card.zone = zone; player[zone].push(card); return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 500) {
    await game.flushTriggers(); if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 500, 'Limit Break stack/trigger loop did not settle');
}

test('Limit Break has 100 cards, 94 unique, and reuses the batch-shared Jungle Shrine script', () => {
  const deck = MTG.DECKS['Limit Break'];
  const intake = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-intake.json', import.meta.url)));
  const report = intake.decks.find(entry => entry.name === 'Limit Break');
  const source = fs.readFileSync(new URL('../src/modules/scripts-limit-break.js', import.meta.url), 'utf8');
  const assignments = [...source.matchAll(/^\s*SC(?:\['([^']+)'\]|\["([^"]+)"\]|\.([A-Za-z][A-Za-z0-9]*))\s*=/gm)]
    .map(match => match[1] || match[2] || match[3]);
  assert.equal(deck.commander, 'Cloud, Ex-SOLDIER');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 94); assert.equal(report.missingNames.length, 48);
  const batchShared = ['Jungle Shrine'];
  const localExpected = report.missingNames.filter(name => !batchShared.includes(name));
  assert.equal(localExpected.length, 47);
  assert.deepEqual([...new Set(assignments)].sort(), localExpected.slice().sort());
  assert.equal(batchShared.every(name => MTG.SCRIPTS[name] && !source.includes(`SC['${name}'] =`)), true);
  assert.deepEqual(report.missingNames.filter(name => !MTG.SCRIPTS[name]), []);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.doesNotMatch(source, /fallback|simplified|TODO|engineGap/i);
});

test('Cloud attaches Equipment, draws per equipped attacker and creates two Treasures at power seven', async () => {
  let hammer;
  const { game, players: [limit, opponent] } = rulesGame([(g, q) => {
    if (q.type === 'chooseTargets' && q.prompt?.includes('Cloud') && q.candidates.includes(hammer)) return [hammer];
    return defaultDecision(g, q);
  }]);
  const cloud = permanent(game, limit, 'Cloud, Ex-SOLDIER', { commander: true });
  hammer = permanent(game, limit, 'Colossus Hammer');
  const ally = permanent(game, limit, 'Helitrooper');
  const sword = permanent(game, limit, 'Sword of the Animist');
  await game.emit('etb', { card: cloud }); await resolveAll(game);
  assert.equal(hammer.attachedTo, cloud.iid); assert.equal(cloud.power, 14);
  await game.attach(sword, ally); cloud.attacking = opponent; ally.attacking = opponent;
  inZone(limit, 'Forest', 'library'); inZone(limit, 'Mountain', 'library');
  await game.emit('attacks', { card: cloud, player: limit, defender: opponent }); await resolveAll(game);
  assert.equal(limit.hand.length, 2);
  assert.equal(game.bf().filter(card => card.ctrl === limit && card.hasSub('Treasure')).length, 2);
});

test('Zack moves counters and an attached Equipment while Hojo and Helitrooper use exact first-target reducers', async () => {
  let legacyTarget;
  const { game, players: [limit] } = rulesGame([(g, q) => {
    if (q.type === 'chooseTargets' && q.candidates.includes(legacyTarget)) return [legacyTarget];
    if (q.type === 'chooseCards' && q.prompt?.includes('Equipment to inherit')) return [q.from[0]];
    return defaultDecision(g, q);
  }], 1);
  const zack = permanent(game, limit, 'Zack Fair'); game.addCounters(zack, '+1/+1', 1, true, limit);
  game.addCounters(zack, 'shield', 1, true, limit);
  const plate = permanent(game, limit, 'Darksteel Plate'); await game.attach(plate, zack);
  legacyTarget = permanent(game, limit, 'Helitrooper'); limit.pool.C = 1;
  const action = game.activatableList(limit).find(entry => entry.card === zack && entry.ability);
  assert.ok(action); assert.equal(await game.activateAbility(limit, action), true); await resolveAll(game);
  assert.equal(zack.zone, 'graveyard'); assert.equal(plate.attachedTo, legacyTarget.iid);
  assert.equal(legacyTarget.counters['+1/+1'], 1); assert.equal(legacyTarget.counters.shield, 1);
  assert.equal(legacyTarget.kw('indestructible'), true);

  const hojo = permanent(game, limit, 'Professor Hojo');
  const equipment = permanent(game, limit, "Explorer's Scope");
  let cost = game.abilityManaCost(limit, equipment, '{2}', { kind: 'equip', targets: [legacyTarget], ability: { equip: true } });
  assert.equal(cost.generic, 0, 'Helitrooper and Hojo reductions reduce the first equip by four, floored at zero');
  game.markAbilityActivated(limit, equipment, false, { targets: [legacyTarget] });
  cost = game.abilityManaCost(limit, equipment, '{4}', { kind: 'equip', targets: [legacyTarget], ability: { equip: true } });
  assert.equal(cost.generic, 2, 'Hojo expires after the first targeted ability while Helitrooper still reduces equip by two');
  assert.ok(hojo);
});

test('Puresteel equip zero overrides Wrecking Ball Arm alternate cost and Conqueror lock exists only while attached', () => {
  const { game, players: [limit, opponent] } = rulesGame();
  permanent(game, limit, 'Puresteel Paladin');
  const arm = permanent(game, limit, 'Wrecking Ball Arm');
  permanent(game, limit, 'Sol Ring');
  const flail = permanent(game, limit, "Conqueror's Flail");
  const cloud = permanent(game, limit, 'Cloud, Ex-SOLDIER', { commander: true });
  game.recalc(); assert.equal(arm.cur.equipCost, '{0}');
  const reduced = game.abilityManaCost(limit, arm, arm.cur.equipCost, { kind: 'equip', targets: [cloud], ability: { equip: true } });
  assert.equal(reduced.generic, 0);
  const instant = inZone(opponent, 'Chaos Warp', 'hand'); game.turnPlayer = limit; game.phase = 'main1';
  assert.equal(game.canCastTiming(opponent, instant, null), true);
  flail.attachedTo = cloud.iid; cloud.attachments.push(flail.iid); game.recalc();
  assert.equal(game.canCastTiming(opponent, instant, null), false);
});

test('Yuffie uses shared ninjutsu, steals a noncreature artifact, equips, and restores control when she leaves', async () => {
  let ring, sword;
  const { game, players: [limit, opponent] } = rulesGame([(g, q) => {
    if (q.type === 'chooseTargets' && q.prompt?.includes('Noncreature artifact')) return [ring];
    if (q.type === 'chooseCards' && q.aiHint?.kind === 'ninjutsuReturn') return [attacker];
    if (q.type === 'chooseCards' && q.prompt?.startsWith('Yuffie: attach')) return [sword];
    return defaultDecision(g, q);
  }]);
  const attacker = permanent(game, limit, 'Helitrooper'); attacker.attacking = opponent; attacker.wasBlocked = false;
  ring = permanent(game, opponent, 'Sol Ring'); sword = permanent(game, limit, 'Sword of the Animist');
  const yuffie = inZone(limit, 'Yuffie, Materia Hunter', 'hand');
  game.combat = { attackers: [attacker], defenders: new Map() }; game.phase = 'combat'; game.step = 'blockers';
  limit.pool.C = 1; limit.pool.R = 1;
  const action = game.activatableList(limit).find(entry => entry.card === yuffie && entry.ninjutsu);
  assert.ok(action); assert.equal(await game.activateAbility(limit, action), true); await resolveAll(game);
  assert.equal(attacker.zone, 'hand'); assert.equal(yuffie.zone, 'battlefield'); assert.equal(yuffie.tapped, true);
  assert.equal(ring.ctrl, limit); assert.equal(sword.attachedTo, yuffie.iid);
  await game.move(yuffie, 'graveyard'); await resolveAll(game); assert.equal(ring.ctrl, opponent);
});

test('Vincent chains group damage and Chaos while Tifa grants exactly one first-combat extra phase', async () => {
  const { game, players: [limit, first, second] } = rulesGame();
  const vincent = permanent(game, limit, 'Vincent, Vengeful Atoner'); game.addCounters(vincent, '+1/+1', 3, true, limit);
  await game.emit('combatDamageGroupToPlayer', { player: first, cards: [vincent], hits: [{ card: vincent, n: 7 }], step: 'normal' });
  await resolveAll(game); assert.equal(vincent.power, 7);
  await game.emit('combatDamageToPlayer', { card: vincent, player: first, n: 7, step: 'normal' }); await resolveAll(game);
  assert.equal(second.life, 33);

  const tifa = permanent(game, limit, 'Tifa, Martial Artist');
  const bruiser = permanent(game, limit, 'Cloud, Ex-SOLDIER'); game.addCounters(bruiser, '+1/+1', 3, true, limit); bruiser.tapped = true;
  await game.emit('beginCombat', { player: limit }); await resolveAll(game);
  await game.emit('combatDamageGroupToPlayer', { player: first, cards: [bruiser], hits: [{ card: bruiser, n: 7 }], step: 'normal' });
  await resolveAll(game); assert.equal(bruiser.tapped, false); assert.equal(game._extraCombats, 1);
  await game.emit('combatDamageGroupToPlayer', { player: second, cards: [bruiser], hits: [{ card: bruiser, n: 7 }], step: 'normal' });
  await resolveAll(game); assert.equal(game._extraCombats, 1, 'same combat cannot schedule another phase'); assert.ok(tifa);
});

test('Cait creates a reflexive target after exile and Sephiroth applies 7/5 even when no cell counter is chosen', async () => {
  let lucky;
  const { game, players: [limit, opponent] } = rulesGame([(g, q) => {
    if (q.type === 'chooseTargets' && q.prompt?.includes('Creature gets +')) return [lucky];
    if (q.type === 'chooseTargets' && q.prompt?.includes('cell counter')) return [];
    return defaultDecision(g, q);
  }]);
  permanent(game, limit, 'Cait Sith, Fortune Teller'); lucky = permanent(game, limit, 'Helitrooper');
  const top = inZone(limit, 'Cloud, Ex-SOLDIER', 'library');
  await game.emit('beginCombat', { player: limit }); await resolveAll(game);
  assert.equal(top.zone, 'exile'); assert.equal(lucky.power, 6, 'Cait uses the exiled card mana value in its reflexive trigger');

  const sephiroth = permanent(game, limit, 'Sephiroth, Fallen Hero');
  const modified = permanent(game, limit, 'Bugenhagen, Wise Elder');
  const scope = permanent(game, limit, "Explorer's Scope"); await game.attach(scope, modified);
  sephiroth.attacking = opponent;
  await game.emit('attacks', { card: sephiroth, player: limit, defender: opponent }); await resolveAll(game);
  assert.equal(modified.power, 7); assert.equal(modified.toughness, 5);
  assert.equal(Object.values(modified.counters).reduce((sum, n) => sum + n, 0), 0, 'declining the optional cell does not skip the base P/T effect');
});

test('Foretell spells distinguish exile casts, lock Lifestream X, prevent damage, and choose Meteor permanents', async () => {
  const { game, players: [limit, opponent] } = rulesGame();
  const creature = permanent(game, limit, 'Cloud, Ex-SOLDIER'); game.addCounters(creature, '+1/+1', 3, true, limit);
  const draws = Array.from({ length: 7 }, (_, index) => inZone(limit, index % 2 ? 'Forest' : 'Mountain', 'library'));
  const blessing = new MTG.CardInst(MTG.DEFS["Lifestream's Blessing"], limit);
  const so = { from: 'exile' }; await blessing.def.prepareTargets({ g: game, src: blessing, you: limit, so, targets: [] });
  game.removeCounters(creature, '+1/+1', 3); game.recalc();
  const life = limit.life; await blessing.def.resolve({ g: game, src: blessing, you: limit, targets: [], so });
  assert.equal(limit.hand.length, 7); assert.equal(limit.life, life + 14); assert.ok(draws.every(card => limit.hand.includes(card)));

  const holy = new MTG.CardInst(MTG.DEFS['Ultimate Magic: Holy'], limit);
  await holy.def.resolve({ g: game, src: holy, you: limit, targets: [], so: { from: 'exile' } });
  assert.equal(creature.kw('indestructible'), true);
  await game.damagePlayer(creature, limit, 9); assert.equal(limit.life, life + 14, 'Holy prevents all damage to its player');

  const victim = permanent(game, opponent, 'Bugenhagen, Wise Elder');
  const land = permanent(game, opponent, 'Forest');
  const meteor = new MTG.CardInst(MTG.DEFS['Ultimate Magic: Meteor'], limit);
  await meteor.def.resolve({ g: game, src: meteor, you: limit, targets: [], so: { from: 'exile' } });
  assert.equal(victim.zone, 'graveyard'); assert.equal(land.zone, 'graveyard');
});

test("Cloud's Limit Break charges tierCost and each Oracle tier destroys only its legal tapped set", async () => {
  const { game, players: [limit, first, second] } = rulesGame([(g, q) => {
    if (q.type === 'chooseOption' && q.prompt?.includes("Cloud's Limit Break")) return q.options.at(-1).key;
    return defaultDecision(g, q);
  }]);
  const mine = permanent(game, limit, 'Helitrooper'); const theirs = permanent(game, first, 'Bugenhagen, Wise Elder');
  const third = permanent(game, second, 'Professor Hojo'); mine.tapped = theirs.tapped = third.tapped = true;
  const spell = inZone(limit, "Cloud's Limit Break", 'hand'); limit.pool.C = 4; limit.pool.W = 2;
  assert.equal(await game.castSpell(limit, spell, { from: 'hand' }), true);
  assert.equal(limit.pool.C, 0); assert.equal(limit.pool.W, 0);
  assert.deepEqual([...game.stack.find(entry => entry.card === spell).mode], [2]); await resolveAll(game);
  assert.equal(mine.zone, 'graveyard'); assert.equal(theirs.zone, 'graveyard'); assert.equal(third.zone, 'graveyard');
});

test('Unfinished Business attaches legal Equipment but leaves an Aura that cannot enchant the returned creature', async () => {
  const { game, players: [limit] } = rulesGame([], 1);
  const creature = inZone(limit, 'Cloud, Ex-SOLDIER', 'graveyard');
  const plate = inZone(limit, 'Darksteel Plate', 'graveyard');
  const invalidAura = inZone(limit, 'Fertile Ground', 'graveyard');
  const spell = new MTG.CardInst(MTG.DEFS['Unfinished Business'], limit);
  await spell.def.resolve({ g: game, src: spell, you: limit, targets: [creature, [plate, invalidAura]], so: {} });
  assert.equal(creature.zone, 'battlefield'); assert.equal(plate.zone, 'battlefield'); assert.equal(plate.attachedTo, creature.iid);
  assert.equal(invalidAura.zone, 'graveyard'); assert.equal(creature.kw('indestructible'), true);
});

test('Kujata chapters, SOLDIER commander choice, Furious Rise duration, and Limit lands execute player choices', async () => {
  let soldiers = [], kujataTarget;
  const { game, players: [limit, opponent] } = rulesGame([(g, q) => {
    if (q.type === 'chooseMulti' && q.prompt?.includes('SOLDIER Military Program')) return ['token', 'counters'];
    if (q.type === 'chooseCards' && q.prompt?.includes('up to two Soldiers')) return soldiers;
    if (q.type === 'chooseTargets' && q.prompt?.includes('cannot block')) return [kujataTarget];
    return defaultDecision(g, q);
  }]);
  permanent(game, limit, 'Cloud, Ex-SOLDIER', { commander: true });
  soldiers = [permanent(game, limit, 'Helitrooper'), permanent(game, limit, 'Sephiroth, Fallen Hero')];
  permanent(game, limit, 'SOLDIER Military Program');
  await game.emit('beginCombat', { player: limit }); await resolveAll(game);
  assert.deepEqual(soldiers.map(card => card.counters['+1/+1']), [1, 1]);
  assert.equal(game.creatures(limit).filter(card => card.isToken && card.hasSub('Soldier')).length, 1);

  const rise = permanent(game, limit, 'Furious Rise'); const firstTop = inZone(limit, 'Forest', 'library');
  await game.emit('endStep', { player: limit }); await resolveAll(game); assert.equal(firstTop.zone, 'exile');
  const secondTop = inZone(limit, 'Mountain', 'library'); await game.emit('endStep', { player: limit }); await resolveAll(game);
  assert.equal(secondTop.zone, 'exile'); assert.equal(game.hasExilePlayPermission(limit, firstTop), false);
  assert.equal(game.hasExilePlayPermission(limit, secondTop), true); assert.ok(rise);

  const kujata = permanent(game, limit, 'Summon: Kujata');
  kujataTarget = permanent(game, opponent, 'Bugenhagen, Wise Elder'); kujata.counters.lore = 1;
  await game.sagaChapter(kujata); await resolveAll(game);
  assert.equal(kujataTarget.cur.cantBlock, true, 'chapter II prevents blocking');
  inZone(limit, 'Colossus Hammer', 'hand'); inZone(limit, 'Forest', 'library'); inZone(limit, 'Mountain', 'library');
  const beforeFire = opponent.life;
  await kujata.def.saga[2].run({ g: game, src: kujata, you: limit, targets: [] });
  assert.equal(opponent.life, beforeFire, 'chapter III discard damage is a separate triggered ability');
  assert.ok(game.pendingTriggers.some(trigger => trigger.name.includes('Fire damage'))); await resolveAll(game);
  assert.equal(opponent.life, beforeFire - 1);

  const brush = permanent(game, limit, 'Brushland');
  const colored = game.manaSources(limit, null).find(source => source.card === brush && source.produce.some(option => option.G));
  const before = limit.life; await colored.m.onProduce(game, brush, limit, { G: 1 }); assert.equal(limit.life, before - 1);
  const shrine = new MTG.CardInst(MTG.DEFS['Jungle Shrine'], limit); shrine.zone = 'nowhere';
  await game.move(shrine, 'battlefield', { ctrl: limit }); assert.equal(shrine.tapped, true);
});

test('Limit Break bot handles Equipment targets and commander modal choice without AI fallback', async () => {
  const { game, players: [bot] } = rulesGame([], 1); bot.isAI = true;
  const cloud = permanent(game, bot, 'Cloud, Ex-SOLDIER', { commander: true });
  const hammer = permanent(game, bot, 'Colossus Hammer');
  let decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 8232612,
    actionWindow: { type: 'chooseTargets', candidates: [cloud, hammer], min: 1, max: 1, aiHint: { goal: 'equipBest' } } });
  assert.equal(decision.log.fallback, false); assert.ok(MTG.unwrapBotDecisionAction(decision.action).length === 1);
  decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 8232613,
    actionWindow: { type: 'chooseMulti', options: [{ key: 'token', label: 'Token' }, { key: 'counters', label: 'Counters' }],
      min: 1, max: 2, aiHint: { kind: 'modes', card: new MTG.CardInst(MTG.DEFS['SOLDIER Military Program'], bot) } } });
  assert.equal(decision.log.fallback, false); assert.ok(MTG.unwrapBotDecisionAction(decision.action).length >= 1);
});

test('Limit Break completes deterministic full games in both seats without AI fallback', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Limit Break', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 8232614 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Limit Break', 'Turtle Power', 'Elven Council'], seed: 8232615 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({ ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 220, paced: false });
    await game.start();
    assert.equal(game.gameOver, true); assert.ok(game.winner); assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName && game.players.some(player =>
      player.name === entry.playerName && player.deckName === 'Limit Break'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
