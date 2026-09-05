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
  const game = new MTG.Game({ seed: 814500, paced: false, maxTurns: 100 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q),
  }));
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Wakanda',
    { name: index ? `Opp ${index}` : 'Wakanda Forever' },
    controllers[index], index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 20;
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

function synthetic(game, player, def) {
  const card = new MTG.CardInst(Object.assign({
    cost: null, super: [], types: ['Creature'], subtypes: [], kws: [], oracle: '', power: '2', toughness: '2',
  }, def), player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
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
  assert.ok(guard < 500, 'Wakanda trigger/stack loop did not settle');
}

test('Wakanda Forever has the official 100 cards, 78 unique cards, and its artifact-monarch AI profile', () => {
  const deck = MTG.DECKS['Wakanda Forever'];
  assert.equal(deck.commander, "T'Challa, the Black Panther");
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 78);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  const profile = MTG.getDeckAIProfile('Wakanda Forever');
  assert.match(profile.archetype, /artifact monarch/i);
  assert.ok(profile.primarySynergies.includes('equipment'));
});

test("T'Challa makes tapped Vibranium on entry and attack, and its mana only pays for artifact spells", async () => {
  const { game, players: [wakanda] } = rulesGame([], 2);
  const tchalla = permanent(game, wakanda, "T'Challa, the Black Panther", { commander: true });
  await game.emit('etb', { card: tchalla, ctrl: wakanda });
  await resolveAll(game);
  await game.emit('attacks', { card: tchalla, player: wakanda, defender: game.players[1] });
  await resolveAll(game);
  const vibranium = game.bf().filter(card => card.name === 'Vibranium Token');
  assert.equal(vibranium.length, 2);
  assert.equal(vibranium.every(card => card.tapped && card.kw('indestructible')), true);
  vibranium[0].tapped = false;
  vibranium[1].tapped = true;
  const genericOne = { generic: 1, x: 0, pips: [] };
  assert.equal(game.canPayMana(wakanda, genericOne, { card: new MTG.CardInst(MTG.DEFS['Sol Ring'], wakanda) }), true);
  assert.equal(game.canPayMana(wakanda, genericOne, { card: new MTG.CardInst(MTG.DEFS['Harmonize'], wakanda) }), false);
  const expensiveArtifact = new MTG.CardInst(MTG.DEFS['Shuri\'s Fabricator'], wakanda);
  await game.emit('cast', { player: wakanda, card: expensiveArtifact, mv: expensiveArtifact.mv });
  await resolveAll(game);
  assert.equal(tchalla.counters['+1/+1'], 2);
});

test('Bast locks the chosen attacker and calculates X from the creature count on resolution', async () => {
  let wanted;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  permanent(game, wakanda, 'Bast, Panther Goddess');
  wanted = permanent(game, wakanda, 'Birds of Paradise');
  const other = permanent(game, wakanda, 'Dora Milaje Elite');
  wanted.attacking = opponent;
  other.attacking = opponent;
  await game.emit('attackersDeclared', { player: wakanda, attackers: [wanted, other] });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  permanent(game, wakanda, 'Loyal Retainers');
  await resolveAll(game);
  assert.equal(wanted.power, 4);
  assert.equal(other.power, 2);
});

test('Loyal Retainers uses an actual graveyard target and only the pre-attack main window', async () => {
  let wanted;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const retainers = permanent(game, wakanda, 'Loyal Retainers');
  wanted = inZone(wakanda, 'Storm, Queen of Wakanda', 'graveyard');
  const decoy = inZone(wakanda, 'Bast, Panther Goddess', 'graveyard');
  game.phase = 'main2';
  assert.equal(game.activatableList(wakanda).some(entry => entry.card === retainers), false);
  game.phase = 'main1';
  const entry = game.activatableList(wakanda).find(action => action.card === retainers);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(retainers.zone, 'graveyard');
  assert.equal(wanted.zone, 'battlefield');
  assert.equal(decoy.zone, 'graveyard');
});

test('Nakia can target a Vehicle, and Okoye grants the delayed double strike only against the monarch', async () => {
  let wanted;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const nakia = permanent(game, wakanda, 'Nakia, Wakandan Operative');
  wanted = permanent(game, wakanda, "N'Yami-Class Mother Ship");
  wakanda.pool.C = 2;
  const nakiaEntry = game.activatableList(wakanda).find(entry => entry.card === nakia);
  assert.ok(nakiaEntry);
  assert.equal(await game.activateAbility(wakanda, nakiaEntry), true);
  await resolveAll(game);
  assert.equal(wanted.counters['+1/+1'], 2);

  const okoye = permanent(game, wakanda, 'Okoye, Mighty and Adored');
  const attacker = permanent(game, wakanda, 'Birds of Paradise');
  wanted = attacker;
  await game.emit('etb', { card: okoye, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
  await game.emit('beginCombat', { player: wakanda });
  await resolveAll(game);
  await game.becomeMonarch(opponent);
  attacker.attacking = opponent;
  await game.emit('attacks', { card: attacker, player: wakanda, defender: opponent });
  await resolveAll(game);
  assert.equal(attacker.counters['+1/+1'], 1);
  assert.equal(attacker.kw('double strike'), true);
  assert.equal(attacker.kw('trample'), true);
});

test('Palace Jailer must exile a creature and returns it when a real monarchChanged event fires', async () => {
  let prisoner;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(prisoner) ? [prisoner] : defaultDecision(g, q),
  ], 2);
  prisoner = permanent(game, opponent, 'Storm, Queen of Wakanda');
  const jailer = permanent(game, wakanda, 'Palace Jailer');
  await game.emit('etb', { card: jailer, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
  assert.equal(prisoner.zone, 'exile');
  await game.becomeMonarch(opponent);
  await resolveAll(game);
  assert.equal(prisoner.zone, 'battlefield');
  assert.equal(prisoner.ctrl, opponent);
});

test('Storm locks her friendly attack target and separately damages every flying attacker', async () => {
  let wanted;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const storm = permanent(game, wakanda, 'Storm, Queen of Wakanda');
  wanted = permanent(game, wakanda, 'Birds of Paradise');
  const other = permanent(game, wakanda, 'Dora Milaje Elite');
  storm.attacking = opponent;
  wanted.attacking = opponent;
  other.attacking = opponent;
  await game.emit('attacks', { card: storm, player: wakanda, defender: opponent });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.power, 4);
  assert.equal(wanted.kw('flying'), true);
  assert.equal(other.power, 2);
  const flierOne = synthetic(game, opponent, { name: 'Flying attacker one', kws: ['flying'], toughness: '4' });
  const flierTwo = synthetic(game, opponent, { name: 'Flying attacker two', kws: ['flying'], toughness: '4' });
  for (const flier of [flierOne, flierTwo]) {
    flier.attacking = wakanda;
    await game.emit('attacks', { card: flier, player: opponent, defender: wakanda });
  }
  await resolveAll(game);
  assert.equal(flierOne.zone, 'graveyard');
  assert.equal(flierTwo.zone, 'graveyard');
});

test("T'Chaka chooses only from the milled artifact/lands and exiles itself to crown its commander", async () => {
  let wanted;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.from.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const spell = inZone(wakanda, 'Harmonize', 'library');
  wanted = inZone(wakanda, 'Sol Ring', 'library');
  const land = inZone(wakanda, 'Forest', 'library');
  const tchaka = permanent(game, wakanda, "T'Chaka, Venerable King");
  await game.emit('etb', { card: tchaka, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(wanted.zone, 'hand');
  assert.equal(spell.zone, 'graveyard');
  assert.equal(land.zone, 'graveyard');
  await game.move(tchaka, 'graveyard');
  permanent(game, wakanda, "T'Challa, the Black Panther", { commander: true });
  wakanda.pool.C = 3;
  const entry = game.activatableList(wakanda).find(action => action.card === tchaka && action.gyAbility);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(tchaka.zone, 'exile');
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
});

test('Fight for the Throne watches its exact target for the rest of the turn and crowns only with a commander', async () => {
  const { game, players: [wakanda, opponent] } = rulesGame([], 2);
  permanent(game, wakanda, "T'Challa, the Black Panther", { commander: true });
  const mine = synthetic(game, wakanda, { name: 'Wakandan fighter', power: '1', toughness: '5' });
  const target = synthetic(game, opponent, { name: 'Delayed victim', power: '1', toughness: '5' });
  const fight = inZone(wakanda, 'Fight for the Throne', 'graveyard');
  await fight.def.resolve({ g: game, src: fight, you: wakanda, targets: [mine, target], so: { card: fight } });
  assert.equal(target.zone, 'battlefield');
  assert.equal(game.monarch, undefined);
  await game.destroy(target);
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
});

test('Wakanda Forever! makes two separate choices, includes lands, and puts a working indestructible counter on any permanent', async () => {
  let battlefieldChoice;
  let handChoice;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => {
      if (/onto the battlefield/.test(q.prompt || '')) return [battlefieldChoice];
      if (/into your hand/.test(q.prompt || '')) return [handChoice];
      return defaultDecision(g, q);
    },
  ], 2);
  const cards = [
    inZone(wakanda, 'Harmonize', 'library'),
    inZone(wakanda, 'Fight for the Throne', 'library'),
    inZone(wakanda, 'Birds of Paradise', 'library'),
    inZone(wakanda, 'Sol Ring', 'library'),
    inZone(wakanda, 'Forest', 'library'),
    inZone(wakanda, 'Canopy Vista', 'library'),
  ];
  battlefieldChoice = cards[5];
  handChoice = cards[3];
  const spell = inZone(wakanda, 'Wakanda Forever!', 'graveyard');
  await spell.def.resolve({ g: game, src: spell, you: wakanda, targets: [], so: { card: spell } });
  assert.equal(battlefieldChoice.zone, 'battlefield');
  assert.equal(battlefieldChoice.counters.indestructible, 1);
  assert.equal(battlefieldChoice.kw('indestructible'), true);
  assert.equal(handChoice.zone, 'hand');
  assert.equal(cards.filter(card => card.zone === 'graveyard').length, 4);
});

test('Conduit targets a chosen nonland permanent and prevents every additional spell after the cast', async () => {
  let wanted;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      if (q.aiHint?.kind === 'conduitCast') return 'yes';
      return defaultDecision(g, q);
    },
  ], 2);
  const conduit = permanent(game, wakanda, 'Conduit of Worlds');
  wanted = inZone(wakanda, 'Arcane Signet', 'graveyard');
  const decoy = inZone(wakanda, 'Black Panther\'s Claws', 'graveyard');
  wakanda.pool.C = 2;
  const entry = game.activatableList(wakanda).find(action => action.card === conduit);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'battlefield');
  assert.equal(decoy.zone, 'graveyard');
  assert.equal(wakanda.turnState.cantCastAdditional, true);
  const extra = inZone(wakanda, 'Sol Ring', 'hand');
  wakanda.pool.C = 20;
  assert.equal(game.castableList(wakanda).some(action => action.card === extra), false);
  assert.equal(await game.castSpell(wakanda, extra), false);
});

test("Black Panther's Claws, Gauntlets, and the Spear lock the player's chosen targets", async () => {
  let wanted;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const claws = permanent(game, wakanda, "Black Panther's Claws");
  wanted = permanent(game, wakanda, 'Birds of Paradise');
  const other = permanent(game, wakanda, 'Dora Milaje Elite');
  await game.emit('etb', { card: claws, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(claws.attachedTo, wanted.iid);
  assert.equal(wanted.kw('indestructible'), true);
  assert.equal(other.kw('indestructible'), false);

  const gauntlets = permanent(game, wakanda, 'Vibranium Strike Gauntlets');
  wanted = other;
  await game.emit('etb', { card: gauntlets, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(gauntlets.attachedTo, other.iid);

  const spear = permanent(game, wakanda, 'The Spear of Bashenga');
  spear.attachedTo = other.iid;
  await game.emit('etb', { card: spear, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
  const victim = permanent(game, opponent, 'Conduit of Worlds');
  victim.tapped = true;
  wanted = victim;
  await game.becomeMonarch(opponent);
  other.attacking = opponent;
  await game.emit('attacks', { card: other, player: wakanda, defender: opponent });
  await resolveAll(game);
  assert.equal(victim.zone, 'graveyard');
});

test('Heart-Shaped Herb crowns only after a sacrifice, while Helm creates a nonlegendary hasty copy', async () => {
  let wanted;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && wanted && q.from.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const herb = permanent(game, wakanda, 'Heart-Shaped Herb');
  wanted = permanent(game, wakanda, 'Storm, Queen of Wakanda');
  wakanda.pool.C = 2;
  const herbEntry = game.activatableList(wakanda).find(entry => entry.card === herb);
  assert.ok(herbEntry);
  assert.equal(await game.activateAbility(wakanda, herbEntry), true);
  await resolveAll(game);
  assert.equal(herb.zone, 'graveyard');
  assert.equal(wanted.zone, 'battlefield');
  assert.equal(wanted.counters['+1/+1'], 3);
  assert.equal(game.monarch, wakanda);

  const helm = permanent(game, wakanda, 'Helm of the Host');
  helm.attachedTo = wanted.iid;
  await game.emit('beginCombat', { player: wakanda });
  await resolveAll(game);
  const copy = game.creatures(wakanda).find(card => card.isToken && card.name === wanted.name);
  assert.ok(copy);
  assert.equal(copy.cur.super.includes('Legendary'), false);
  assert.equal(copy.kw('haste'), true);
});

test('Kimoyo Prime resets its choices, Frogs only exile after a cast, and their activation exiles as a cost', async () => {
  let wanted;
  const { game, players: [wakanda, opponent] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'wakandaBead') return 'prime';
      if (q.type === 'chooseTargets' && wanted && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  const beads = permanent(game, wakanda, 'Kimoyo Beads');
  const oldTimestamp = beads.timestamp;
  wakanda.life = 20;
  await game.emit('endStep', { player: wakanda });
  await resolveAll(game);
  assert.equal(wakanda.life, 23);
  assert.ok(beads.timestamp > oldTimestamp);
  assert.deepEqual(beads.meta._beads, undefined);

  const frogs = permanent(game, wakanda, "King Solomon's Frogs");
  const victim = permanent(game, opponent, 'Conduit of Worlds');
  wanted = victim;
  await game.emit('etb', { card: frogs, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(victim.zone, 'battlefield', 'putting Frogs onto the battlefield is not casting it');
  frogs.meta._enteredFromZone = 'stack';
  inZone(opponent, 'Forest', 'library');
  await game.emit('etb', { card: frogs, ctrl: wakanda });
  await resolveAll(game);
  assert.equal(victim.zone, 'exile');
  assert.equal(opponent.hand.length, 1);
  wakanda.pool.C = 3;
  frogs.tapped = false;
  const entry = game.activatableList(wakanda).find(action => action.card === frogs);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(frogs.zone, 'exile');
  await resolveAll(game);
  assert.equal(game.monarch, wakanda);
});

test("N'Yami honors the permanent may choice and otherwise puts the top card into hand", async () => {
  for (const answer of ['no', 'yes']) {
    const { game, players: [wakanda, opponent] } = rulesGame([
      (g, q) => q.aiHint?.kind === 'nyamiTop' ? answer : defaultDecision(g, q),
    ], 2);
    const ship = permanent(game, wakanda, "N'Yami-Class Mother Ship");
    const top = inZone(wakanda, 'Sol Ring', 'library');
    await game.emit('combatDamageToPlayer', { card: ship, player: opponent, n: 6 });
    await resolveAll(game);
    assert.equal(top.zone, answer === 'yes' ? 'battlefield' : 'hand');
  }
});

test('Orbital Bomb is upkeep-only, preserves artifacts and lands, and destroys nonartifact creatures simultaneously', async () => {
  const { game, players: [wakanda, opponent] } = rulesGame([], 2);
  const bomb = permanent(game, wakanda, 'Orbital Vibranium Bomb');
  const artifactCreature = permanent(game, opponent, 'Solemn Simulacrum');
  const land = permanent(game, opponent, 'Forest');
  const ordinaryOne = permanent(game, wakanda, 'Birds of Paradise');
  const ordinaryTwo = permanent(game, opponent, 'Storm, Queen of Wakanda');
  assert.equal(game.activatableList(wakanda).some(entry => entry.card === bomb), false);
  game.phase = 'upkeep';
  const entry = game.activatableList(wakanda).find(action => action.card === bomb);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(bomb.zone, 'graveyard');
  await resolveAll(game);
  assert.equal(artifactCreature.zone, 'battlefield');
  assert.equal(land.zone, 'battlefield');
  assert.equal(ordinaryOne.zone, 'graveyard');
  assert.equal(ordinaryTwo.zone, 'graveyard');
});

test("Shuri's Fabricator returns the exact artifact with finality and finality replaces the next graveyard move", async () => {
  let wanted;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const fabricator = permanent(game, wakanda, "Shuri's Fabricator");
  wanted = inZone(wakanda, 'Arcane Signet', 'graveyard');
  const decoy = inZone(wakanda, 'Sol Ring', 'graveyard');
  wakanda.pool.C = 6;
  const entry = game.activatableList(wakanda).find(action => action.card === fabricator);
  assert.ok(entry);
  assert.equal(await game.activateAbility(wakanda, entry), true);
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'battlefield');
  assert.equal(wanted.counters.finality, 1);
  assert.equal(decoy.zone, 'graveyard');
  await game.destroy(wanted);
  assert.equal(wanted.zone, 'exile');
});

test("Nature's Lore can find a nonbasic Forest card and puts it onto the battlefield untapped", async () => {
  let chosen;
  const { game, players: [wakanda] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.from.includes(chosen) ? [chosen] : defaultDecision(g, q),
  ], 2);
  permanent(game, wakanda, 'Forest');
  permanent(game, wakanda, 'Plains');
  inZone(wakanda, 'Forest', 'library');
  chosen = inZone(wakanda, 'Canopy Vista', 'library');
  const lore = inZone(wakanda, "Nature's Lore", 'graveyard');
  await lore.def.resolve({ g: game, src: lore, you: wakanda, targets: [], so: { card: lore } });
  assert.equal(chosen.zone, 'battlefield');
  assert.equal(chosen.tapped, false);
});

test('Wakanda AI chooses a useful battlefield permanent, casts through Conduit, and makes a tactical Bead choice', async () => {
  const { game, players: [wakanda] } = rulesGame([], 2);
  wakanda.isAI = true;
  const land = new MTG.CardInst(MTG.DEFS['Forest'], wakanda);
  const ring = new MTG.CardInst(MTG.DEFS['Sol Ring'], wakanda);
  const battlefield = await MTG.chooseBotAction({
    gameState: game, botPlayerId: wakanda.idx, seed: 814501,
    actionWindow: { type: 'chooseCards', from: [land, ring], min: 0, max: 1, aiHint: { kind: 'wakandaBattlefield' } },
  });
  assert.equal(battlefield.action.picks.length, 1);
  const conduit = await MTG.chooseBotAction({
    gameState: game, botPlayerId: wakanda.idx, seed: 814502,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'yes', label: 'Cast' }, { key: 'no', label: 'No' }],
      aiHint: { kind: 'conduitCast', card: ring },
    },
  });
  assert.equal(conduit.action.value, 'yes');
  wakanda.life = 8;
  const beads = permanent(game, wakanda, 'Kimoyo Beads');
  const bead = await MTG.chooseBotAction({
    gameState: game, botPlayerId: wakanda.idx, seed: 814503,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'av', label: 'Draw' }, { key: 'comm', label: 'Soldiers' }, { key: 'prime', label: 'Life' }],
      aiHint: { kind: 'wakandaBead', source: beads },
    },
  });
  assert.equal(bead.action.value, 'prime');
});

test('Wakanda Forever completes deterministic full games in both seats without AI fallback', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Wakanda Forever', aiDecks: ['Doom Prevails', 'The Fantastic Four', 'Turtle Power'], seed: 814504 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Wakanda Forever', 'The Fantastic Four', 'Turtle Power'], seed: 814505 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Wakanda Forever'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
