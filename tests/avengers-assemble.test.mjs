import test from 'node:test';
import assert from 'node:assert/strict';
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
  const game = new MTG.Game({ seed: 814410, paced: false, maxTurns: 100 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q),
  }));
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Avengers',
    { name: index ? `Opp ${index}` : 'Avengers Assemble' },
    controllers[index], index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 16;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players, controllers };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = opts.ctrl || player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 500) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 500, 'Avengers trigger/stack loop did not settle');
}

test('Avengers Assemble has the official 100 cards, 87 unique cards, and a Hero AI profile', () => {
  const deck = MTG.DECKS['Avengers Assemble'];
  assert.equal(deck.commander, 'Captain America, Team Leader');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 87);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  const profile = MTG.getDeckAIProfile('Avengers Assemble');
  assert.match(profile.archetype, /Hero/i);
  assert.ok(profile.primarySynergies.includes('tribal'));
  assert.ok(profile.primarySynergies.includes('counters'));
});

test('Captain Marvel copies the same number and kind of counters put on another non-Kree creature', async () => {
  const { game, players: [avengers] } = rulesGame([], 2);
  const marvel = permanent(game, avengers, 'Captain Marvel, Apex Avenger');
  const hero = permanent(game, avengers, 'Captain America, Living Legend');
  game.addCounters(hero, 'shield', 2, false, avengers);
  await resolveAll(game);
  assert.equal(marvel.counters.shield, 2);
});

test('Captain Marvel follows the player who put the counters, even when the other creature is controlled by an opponent', async () => {
  const { game, players: [avengers, opponent] } = rulesGame([], 2);
  const marvel = permanent(game, avengers, 'Captain Marvel, Apex Avenger');
  const target = permanent(game, opponent, 'Bastion Protector');
  game.addCounters(target, 'charge', 1, false, avengers);
  await resolveAll(game);
  assert.equal(marvel.counters.charge, 1);
});

test('Photon lets its controller choose one color and the mana survives only through that turn', async () => {
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'photonMana' ? 'U' : defaultDecision(g, q),
  ], 2);
  const photon = permanent(game, avengers, 'Photon, Mighty Marvel');
  await photon.def.triggers[0].run({ g: game, src: photon, you: avengers, data: { n: 3 } });
  assert.equal(avengers.pool.U, 3);
  assert.equal(avengers.persistMana.U, 3);
  game.emptyPool();
  assert.equal(avengers.pool.U, 3);
  game.expirePersistentMana();
  game.emptyPool();
  assert.equal(avengers.pool.U, 0);
});

test('Rescue targets any other friendly artifact or creature and locks the target before resolution', async () => {
  let wanted;
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  wanted = permanent(game, avengers, 'Arcane Signet');
  const rescue = permanent(game, avengers, 'Rescue, Pepper Potts');
  await game.emit('etb', { card: rescue, ctrl: avengers });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'hand');
  assert.equal(rescue.counters['+1/+1'], 1);
});

test('Jocasta triggers from the graveyard and enters tapped and attacking a chosen defender', async () => {
  const { game, players: [avengers, one, two] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'attackDestination'
      ? q.options.find(option => option.target === two)?.key
      : defaultDecision(g, q),
  ], 3);
  const commander = permanent(game, avengers, 'Captain America, Team Leader', { commander: true });
  commander.attacking = one;
  const jocasta = inZone(avengers, 'Jocasta, Automaton Avenger', 'graveyard');
  game.combat = { attackers: [commander], defenders: new Map() };
  await game.emit('attackersDeclared', { player: avengers, attackers: [commander] });
  await resolveAll(game);
  assert.equal(jocasta.zone, 'battlefield');
  assert.equal(jocasta.tapped, true);
  assert.equal(jocasta.attacking, two);
  assert.ok(game.combat.attackers.includes(jocasta));
});

test('Metallic Mimic honors the creature-type choice and becomes that type itself', async () => {
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'chooseType' && q.options.some(option => option.key === 'Human')
      ? 'Human' : defaultDecision(g, q),
  ], 2);
  permanent(game, avengers, 'Captain America, Team Leader');
  permanent(game, avengers, 'Captain Marvel, Apex Avenger');
  const mimic = inZone(avengers, 'Metallic Mimic', 'hand');
  await game.move(mimic, 'battlefield', { ctrl: avengers });
  assert.equal(mimic.meta.chosenType, 'Human');
  assert.equal(mimic.hasSub('Human'), true);
});

test('Patriot can target another friendly creature but never itself', () => {
  const { game, players: [avengers] } = rulesGame([], 2);
  const patriot = permanent(game, avengers, 'Patriot, Shield Wielder');
  const hero = permanent(game, avengers, 'Captain America, Living Legend');
  const legal = game.legalTargets(patriot.def.abilities[0].targets[0], patriot, avengers);
  assert.ok(legal.includes(hero));
  assert.equal(legal.includes(patriot), false);
});

test('Speed pays the real cost, locks a chosen haste target, and only haste creatures can block it', async () => {
  let wanted;
  const { game, players: [avengers, opponent] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, avengers, 'Speed, Young Avenger');
  wanted = permanent(game, avengers, 'Quicksilver, Speedster');
  permanent(game, avengers, 'Captain America, Team Leader');
  const slowBlocker = permanent(game, opponent, 'Bastion Protector');
  const hasteBlocker = permanent(game, opponent, 'Quicksilver, Speedster');
  avengers.pool.C = 1;
  const spell = inZone(avengers, 'Arcane Signet', 'hand');
  await game.emit('cast', { player: avengers, card: spell, isInstantSorcery: false });
  await resolveAll(game);
  assert.equal(avengers.pool.C, 0);
  assert.equal(wanted.cur.cantBeBlockedBy(game, slowBlocker), true);
  assert.equal(wanted.cur.cantBeBlockedBy(game, hasteBlocker), false);
});

test('Winter Soldier targets in the graveyard on the stack and Heroes enter with the extra counter', async () => {
  let wanted;
  const { game, players: [avengers, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const winter = permanent(game, avengers, 'Winter Soldier, Reborn Avenger');
  winter.attacking = opponent;
  wanted = inZone(avengers, 'Ant-Man, Elusive Avenger', 'graveyard');
  inZone(avengers, 'Bastion Protector', 'graveyard');
  await game.emit('attacks', { card: winter, player: avengers, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'battlefield');
  assert.equal(wanted.counters['+1/+1'], 1);
});

test('Heroic Sacrifice redirects creature damage and moves every counter kind to the chosen target', async () => {
  let recipient;
  const { game, players: [avengers, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(recipient) ? [recipient] : defaultDecision(g, q),
  ], 2);
  const shield = permanent(game, avengers, 'Black Widow, Agile Avenger');
  recipient = permanent(game, avengers, 'Captain America, Living Legend');
  const other = permanent(game, avengers, 'Bastion Protector');
  const source = permanent(game, opponent, 'Professor Hulk');
  game.addCounters(shield, '+1/+1', 2, true, avengers);
  game.addCounters(shield, 'charge', 3, true, avengers);
  inZone(avengers, 'Island', 'library');
  await MTG.DEFS['Heroic Sacrifice'].resolve({ g: game, src: inZone(avengers, 'Heroic Sacrifice', 'graveyard'), you: avengers, targets: [shield] });
  await game.damageCreature(source, other, 6);
  await resolveAll(game);
  assert.equal(other.damage, 0);
  assert.equal(shield.zone, 'graveyard');
  assert.equal(recipient.counters['+1/+1'], 2);
  assert.equal(recipient.counters.charge, 3);
  assert.equal(avengers.hand.some(card => card.name === 'Island'), true);
});

test('Dismantling Wave locks up to one artifact or enchantment target for each opponent', async () => {
  let desiredOne;
  let desiredTwo;
  const { game, players: [avengers, one, two] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(desiredOne)) return [desiredOne];
      if (q.type === 'chooseTargets' && q.candidates.includes(desiredTwo)) return [desiredTwo];
      return defaultDecision(g, q);
    },
  ], 3);
  desiredOne = permanent(game, one, 'Sol Ring');
  permanent(game, one, 'Door of Destinies');
  desiredTwo = permanent(game, two, 'Folk Hero');
  const wave = inZone(avengers, 'Dismantling Wave', 'hand');
  avengers.pool.W = 1;
  avengers.pool.C = 2;
  assert.equal(await game.castSpell(avengers, wave), true);
  const spell = game.stack.find(item => item.card === wave);
  assert.deepEqual(Array.from(spell.targets, target => target?.name), [desiredOne.name, desiredTwo.name]);
  await resolveAll(game);
  assert.equal(desiredOne.zone, 'graveyard');
  assert.equal(desiredTwo.zone, 'graveyard');
});

test('West Coast Expansion lets the player choose which Hero to cast for free', async () => {
  let wanted;
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.from.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  wanted = inZone(avengers, 'Ant-Man, Elusive Avenger', 'hand');
  const other = inZone(avengers, 'Professor Hulk', 'hand');
  for (let i = 0; i < 5; i++) inZone(avengers, 'Island', 'library');
  const expansion = inZone(avengers, 'West Coast Expansion', 'graveyard');
  await expansion.def.resolve({ g: game, src: expansion, you: avengers, x: 5, so: { card: expansion } });
  assert.ok(game.stack.some(item => item.card === wanted));
  assert.equal(other.zone, 'hand');
});

test('Scarlet Witch can choose an older card exiled with the same battlefield object and casts it through the real stack', async () => {
  let wanted;
  const { game, players: [avengers, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.from.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const witch = permanent(game, avengers, 'Scarlet Witch, Chaotic Avenger');
  witch.timestamp = 814412;
  wanted = inZone(avengers, 'Ant-Man, Elusive Avenger', 'exile');
  wanted.meta.exiledWithScarletWitch = witch.timestamp;
  wanted.meta.faceDownExile = true;
  inZone(avengers, 'Island', 'library');
  inZone(avengers, 'Mountain', 'library');
  await witch.def.triggers[0].run({ g: game, src: witch, you: avengers, data: { n: 2, player: opponent } });
  assert.ok(game.stack.some(item => item.card === wanted));
  assert.equal(wanted.meta.faceDownExile, undefined);
});

test('Avengers Quinjet exposes its mode and locks a graveyard target', async () => {
  let wanted;
  const { game, players: [avengers] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'quinjetMode') return '1';
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  const handHero = inZone(avengers, 'Professor Hulk', 'hand');
  wanted = inZone(avengers, 'Ant-Man, Elusive Avenger', 'graveyard');
  const quinjet = permanent(game, avengers, 'Avengers Quinjet');
  await game.emit('etb', { card: quinjet, ctrl: avengers });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).mode, 1);
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'hand');
  assert.equal(handHero.zone, 'hand');
});

test('Door, Horn, and Kindred Discovery honor a visible player creature-type choice', async () => {
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'chooseType' && q.options.some(option => option.key === 'Human')
      ? 'Human' : defaultDecision(g, q),
  ], 2);
  permanent(game, avengers, 'Captain America, Team Leader');
  permanent(game, avengers, 'Captain Marvel, Apex Avenger');
  permanent(game, avengers, "Thor, Asgard's Avenger");
  for (const name of ['Door of Destinies', "Herald's Horn", 'Kindred Discovery']) {
    const card = inZone(avengers, name, 'hand');
    await game.move(card, 'battlefield', { ctrl: avengers });
    assert.equal(card.meta.chosenType, 'Human', name);
  }
});

test("Herald's Horn asks before revealing and leaves a declined Hero on top", async () => {
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'heraldReveal' ? 'no' : defaultDecision(g, q),
  ], 2);
  const horn = permanent(game, avengers, "Herald's Horn");
  horn.meta.chosenType = 'Hero';
  const top = inZone(avengers, 'Ant-Man, Elusive Avenger', 'library');
  await game.emit('upkeep', { player: avengers });
  await resolveAll(game);
  assert.equal(top.zone, 'library');
  assert.equal(avengers.library.at(-1), top);
});

test('Hulkbuster Armor uses Equip Hero {3} and attaches through the authoritative equip path', async () => {
  const { game, players: [avengers] } = rulesGame([], 2);
  const armor = permanent(game, avengers, 'Hulkbuster Armor');
  const hero = permanent(game, avengers, 'Ant-Man, Elusive Avenger');
  avengers.pool.C = 3;
  const equip = game.activatableList(avengers).find(entry => entry.card === armor && entry.equip);
  assert.ok(equip);
  assert.equal(await game.activateAbility(avengers, equip, [hero]), true);
  await resolveAll(game);
  assert.equal(armor.attachedTo, hero.iid);
});

test('Iron Man and War Machine use the real modified definition for Auras and Equipment', async () => {
  const { game, players: [avengers, opponent] } = rulesGame([], 2);
  const ironMan = permanent(game, avengers, 'Iron Man, Armored Avenger');
  const warMachine = permanent(game, avengers, 'War Machine, Avenging Arsenal');
  const attacker = permanent(game, avengers, 'Captain America, Living Legend');
  const hostileAura = permanent(game, opponent, 'Gift of Immortality');
  await game.attach(hostileAura, attacker);
  ironMan.attacking = opponent;
  warMachine.attacking = opponent;
  attacker.attacking = opponent;
  await game.emit('attacks', { card: ironMan, player: avengers, defender: opponent });
  await resolveAll(game);
  assert.equal(attacker.kw('flying'), false, 'an Aura controlled by an opponent does not modify the creature');

  const equipment = permanent(game, opponent, "Hero's Blade");
  await game.attach(equipment, attacker);
  await game.emit('attacks', { card: warMachine, player: avengers, defender: opponent });
  await resolveAll(game);
  assert.equal(attacker.kw('double strike'), true, 'being equipped counts regardless of Equipment controller');
});

test('Gift of Immortality sees the enchanted creature die, returns it, then returns attached at end step', async () => {
  const { game, players: [avengers] } = rulesGame([], 2);
  const creature = permanent(game, avengers, 'Black Widow, Agile Avenger');
  const gift = permanent(game, avengers, 'Gift of Immortality');
  await game.attach(gift, creature);
  await game.destroy(creature);
  await resolveAll(game);
  assert.equal(creature.zone, 'battlefield');
  assert.equal(gift.zone, 'graveyard');
  await game.emit('endStep', { player: avengers });
  await resolveAll(game);
  assert.equal(gift.zone, 'battlefield');
  assert.equal(gift.attachedTo, creature.iid);
});

test('Avengers Tower lets the player choose any revealed Hero instead of auto-taking the first', async () => {
  let wanted;
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.from.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const tower = permanent(game, avengers, 'Avengers Tower');
  inZone(avengers, 'Island', 'library');
  wanted = inZone(avengers, 'Ant-Man, Elusive Avenger', 'library');
  inZone(avengers, 'Professor Hulk', 'library');
  await tower.def.abilities[0].run({ g: game, src: tower, you: avengers });
  assert.equal(wanted.zone, 'hand');
  assert.ok(avengers.hand.includes(wanted));
});

test('Furycalm Snarl allows declining the reveal and enters tapped when declined', async () => {
  const { game, players: [avengers] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'revealLand' ? [] : defaultDecision(g, q),
  ], 2);
  inZone(avengers, 'Plains', 'hand');
  const snarl = inZone(avengers, 'Furycalm Snarl', 'hand');
  await game.move(snarl, 'battlefield', { ctrl: avengers });
  assert.equal(snarl.tapped, true);
});

test('Avenge discount checks attacks during the relevant previous turn, not permanent AI grudges', () => {
  const { game, players: [avengers, opponent] } = rulesGame([], 2);
  const adjust = MTG.DEFS.Avenge.selfCostAdjust;
  avengers.grudges = { [opponent.idx]: 9 };
  avengers.prevAttackers = new Set();
  assert.equal(adjust(game, {}, avengers), 0);
  avengers.prevAttackers.add(opponent);
  assert.equal(adjust(game, {}, avengers), -2);
});

test('Thor increases only damage from another source currently controlled by Thor controller', async () => {
  const { game, players: [avengers, opponent] } = rulesGame([], 2);
  permanent(game, avengers, "Thor, Asgard's Avenger");
  const stolen = permanent(game, avengers, 'Hawkeye, Avenging Archer', { ctrl: opponent });
  const opposingPermanent = permanent(game, opponent, 'Bastion Protector');
  assert.equal(await game.applyDamageReplacements(stolen, opposingPermanent, 1, {}), 1);
  stolen.ctrl = avengers;
  assert.equal(await game.applyDamageReplacements(stolen, opposingPermanent, 1, {}), 2);
});

test('Love on the Battlefield delayed combat-damage permission expires at end of that combat', async () => {
  const { game, players: [avengers, opponent] } = rulesGame([], 2);
  const love = permanent(game, avengers, 'Love on the Battlefield');
  // The mandatory attack-trigger draw must not eliminate this fixture's
  // player before the combat-duration permission can be observed.
  const draw = inZone(avengers, 'Plains', 'library');
  const one = permanent(game, avengers, 'Ant-Man, Elusive Avenger');
  const two = permanent(game, avengers, 'Black Widow, Agile Avenger');
  one.attacking = opponent;
  two.attacking = opponent;
  game.combat = { attackers: [one, two], defenders: new Map() };
  await game.emit('attackersDeclared', { player: avengers, attackers: [one, two] });
  await resolveAll(game);
  assert.equal(draw.zone, 'hand');
  assert.equal(avengers.lost, false);
  assert.ok(game.delayed.some(entry => entry.name === 'Love on the Battlefield'));
  await game.endCombatStep(avengers);
  assert.equal(game.delayed.some(entry => entry.name === 'Love on the Battlefield'), false);
  assert.ok(love);
});

test('Avengers AI chooses Hero as the relevant creature type', async () => {
  const { game, players: [avengers] } = rulesGame([], 2);
  avengers.isAI = true;
  const result = await MTG.chooseBotAction({
    gameState: game,
    botPlayerId: avengers.idx,
    seed: 814411,
    actionWindow: {
      type: 'chooseOption',
      options: [{ key: 'Human', label: 'Human' }, { key: 'Hero', label: 'Hero' }],
      aiHint: { kind: 'chooseType', counts: { Human: 4, Hero: 26 } },
    },
  });
  assert.equal(result.action.value, 'Hero');
});

test('Avengers Assemble completes deterministic full games in both seats without AI fallback', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Avengers Assemble', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 814413 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Avengers Assemble', 'Turtle Power', 'Elven Council'], seed: 814414 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({
      ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 220, paced: false,
    });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Avengers Assemble'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
