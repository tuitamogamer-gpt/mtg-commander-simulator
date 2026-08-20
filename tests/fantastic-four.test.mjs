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
  const game = new MTG.Game({ seed: 814420, paced: false, maxTurns: 100 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q),
  }));
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Fantastic Four',
    { name: index ? `Opp ${index}` : 'The Fantastic Four' },
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
  assert.ok(guard < 500, 'Fantastic Four trigger/stack loop did not settle');
}

test('The Fantastic Four has the official 100 cards, 87 unique cards, and a noncreature AI profile', () => {
  const deck = MTG.DECKS['The Fantastic Four'];
  assert.equal(deck.commander, 'Invisible Woman');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 87);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  const profile = MTG.getDeckAIProfile('The Fantastic Four');
  assert.match(profile.archetype, /noncreature/i);
  assert.ok(profile.primarySynergies.includes('spellslinger'));
});

test('Invisible Woman pays first, then creates a target trigger for the exact chosen creature', async () => {
  let wanted;
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'fantasticPay') return 'yes';
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, fantastic, 'Invisible Woman', { commander: true });
  const attacker = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  wanted = permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  attacker.attacking = opponent;
  fantastic.pool = { W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 };
  await game.emit('attackersDeclared', { player: fantastic, attackers: [attacker] });
  await resolveAll(game);
  assert.equal(wanted.power, 5);
  assert.equal(wanted.cur.unblockable, true);
  assert.equal(attacker.power, 1);
});

test('Black Bolt sees every noncreature spell and locks the opponent nonland target on the trigger', async () => {
  let wanted;
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const bolt = permanent(game, fantastic, 'Black Bolt, Inhuman King');
  const artifactSpell = inZone(fantastic, 'Arcane Signet', 'hand');
  await game.emit('castNonCreature', { player: fantastic, card: artifactSpell, so: { card: artifactSpell } });
  await resolveAll(game);
  assert.equal(bolt.power, 5);
  wanted = permanent(game, opponent, 'Monologue Tax');
  const decoy = permanent(game, opponent, 'Sol Ring');
  await game.emit('targeted', { card: bolt, byPlayer: opponent, src: decoy, isSpell: false });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'graveyard');
  assert.equal(decoy.zone, 'battlefield');
});

test('Lockjaw chooses up to one other creature and makes only Lockjaw and that target unblockable', async () => {
  let wanted;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const lockjaw = permanent(game, fantastic, 'Lockjaw, Slobbering Teleporter');
  wanted = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  const other = permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  fantastic.turnState.spellsCastList.push({ card: inZone(fantastic, 'Arcane Signet', 'graveyard') });
  await game.emit('beginCombat', { player: fantastic });
  await resolveAll(game);
  assert.equal(lockjaw.counters['+1/+1'], 1);
  assert.equal(lockjaw.cur.unblockable, true);
  assert.equal(wanted.cur.unblockable, true);
  assert.equal(other.cur.unblockable, false);
});

test('Reed Richards draws once for every separate batch of one or more tokens', async () => {
  const { game, players: [fantastic] } = rulesGame([], 2);
  permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  inZone(fantastic, 'Forest', 'library');
  inZone(fantastic, 'Island', 'library');
  await game.makeTokens('treasure', fantastic);
  await resolveAll(game);
  await game.makeTokens('treasure', fantastic, { n: 2 });
  await resolveAll(game);
  assert.equal(fantastic.hand.length, 2);
});

test('Galactus may exile a friendly permanent and is forced toward highest life only without Silver Surfer', async () => {
  let wanted;
  const { game, players: [fantastic, one, two] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 3);
  wanted = permanent(game, fantastic, 'Sol Ring');
  const galactus = permanent(game, fantastic, 'Galactus, Devourer of Worlds');
  await game.emit('etb', { card: galactus, ctrl: fantastic });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'exile');
  one.life = 31;
  two.life = 39;
  game.recalc();
  assert.equal(game.isForcedToAttack(galactus), true);
  const restrictedTargets = game.legalAttackTargets(galactus);
  assert.equal(restrictedTargets.length, 1);
  assert.equal(restrictedTargets[0], two);
  permanent(game, fantastic, "Silver Surfer, Galactus's Herald");
  game.recalc();
  assert.equal(game.isForcedToAttack(galactus), false);
  assert.ok(game.legalAttackTargets(galactus).includes(one));
});

test('Human Torch reflects each combat-damage event to every other opponent after the real payment', async () => {
  const { game, players: [fantastic, one, two] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'fantasticPay' ? 'yes' : defaultDecision(g, q),
  ], 3);
  const torch = permanent(game, fantastic, 'Human Torch');
  torch.attacking = one;
  fantastic.pool = { W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 };
  await game.emit('attacks', { card: torch, player: fantastic, defender: one });
  await resolveAll(game);
  await game.emit('combatDamageToPlayer', { card: torch, player: one, n: 3 });
  await resolveAll(game);
  assert.equal(one.life, 40);
  assert.equal(two.life, 37);
});

test('Power Pack offers the actual random graveyard card next upkeep and exiles it after the real cast', async () => {
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'freeCast' ? 'yes' : defaultDecision(g, q),
  ], 2);
  const pack = permanent(game, fantastic, 'Power Pack');
  const iteration = inZone(fantastic, 'Galvanic Iteration', 'graveyard');
  await game.emit('combatDamageToPlayer', { card: pack, player: opponent, n: 4 });
  await resolveAll(game);
  assert.equal(iteration.zone, 'exile');
  await game.emit('upkeep', { player: fantastic });
  await resolveAll(game);
  assert.equal(iteration.zone, 'exile');
  assert.ok(fantastic.exile.includes(iteration));
  assert.notEqual(iteration.isCopySpell, true);
});

test('Silver Surfer locks a chosen creature to the damaged player through the correct next-turn window', async () => {
  let forced;
  const { game, players: [fantastic, victim, third] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(forced) ? [forced] : defaultDecision(g, q),
  ], 3);
  const surfer = permanent(game, fantastic, "Silver Surfer, Galactus's Herald");
  forced = permanent(game, third, 'Mister Fantastic, Reed Richards');
  await game.emit('combatDamageToPlayer', { card: surfer, player: victim, n: 4 });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).targets[0], forced);
  await resolveAll(game);
  assert.equal(game.isForcedToAttack(forced), true);
  const restrictedTargets = game.legalAttackTargets(forced);
  assert.equal(restrictedTargets.length, 1);
  assert.equal(restrictedTargets[0], victim);
  fantastic.turnsStarted = 4;
  victim.turnsStarted = 4;
  third.turnsStarted = 4;
  const effect = game.untilEffects.find(entry => entry.kind === 'mustAttackPlayerCard' && entry.iid === forced.iid);
  effect.afterTurnsStarted = fantastic.turnsStarted + 1;
  for (const player of game.players) {
    for (let index = 0; index < 20; index++) inZone(player, 'Forest', 'library');
  }
  game.turnPlayer = victim;
  await game.runTurn();
  assert.equal(game.untilEffects.includes(effect), true);
  game.turnPlayer = fantastic;
  await game.runTurn();
  assert.equal(game.untilEffects.includes(effect), false);
});

test('The Thing pays before choosing any number of permanents and doubles every counter kind only on chosen targets', async () => {
  let wanted;
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'fantasticPay') return 'yes';
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  const thing = permanent(game, fantastic, 'The Thing');
  wanted = permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  const other = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  game.addCounters(wanted, '+1/+1', 2, true, fantastic);
  game.addCounters(wanted, 'shield', 1, true, fantastic);
  game.addCounters(other, '+1/+1', 3, true, fantastic);
  thing.attacking = opponent;
  fantastic.pool = { W: 1, U: 1, B: 0, R: 1, G: 1, C: 0 };
  await game.emit('attacks', { card: thing, player: fantastic, defender: opponent });
  await resolveAll(game);
  assert.equal(wanted.counters['+1/+1'], 4);
  assert.equal(wanted.counters.shield, 2);
  assert.equal(other.counters['+1/+1'], 3);
});

test('Willie Lumpkin lets the damaged opponent decline or accept the draw and attack restriction', async () => {
  for (const answer of ['no', 'yes']) {
    const { game, players: [fantastic, opponent] } = rulesGame([
      undefined,
      (g, q) => q.aiHint?.kind === 'willieDraw' ? answer : defaultDecision(g, q),
    ], 2);
    const willie = permanent(game, fantastic, 'Willie Lumpkin, Postman');
    const attacker = permanent(game, opponent, 'Mister Fantastic, Reed Richards');
    inZone(fantastic, 'Forest', 'library');
    inZone(opponent, 'Island', 'library');
    await game.emit('combatDamageToPlayer', { card: willie, player: opponent, n: 1 });
    await resolveAll(game);
    assert.equal(opponent.hand.length, answer === 'yes' ? 1 : 0);
    assert.equal(game.canAttackTarget(attacker, fantastic), answer !== 'yes');
  }
});

test('Invisible Force Field locks up to four chosen permanents including lands', async () => {
  let chosen;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && chosen && chosen.every(card => q.candidates.includes(card))
      ? chosen : defaultDecision(g, q),
  ], 2);
  const land = permanent(game, fantastic, 'Forest');
  const creature = permanent(game, fantastic, 'Invisible Woman');
  permanent(game, fantastic, 'Sol Ring');
  chosen = [land, creature];
  const field = inZone(fantastic, 'Invisible Force Field', 'hand');
  fantastic.pool.W = 1;
  fantastic.pool.C = 1;
  assert.equal(await game.castSpell(fantastic, field), true);
  const lockedTargets = game.stack.find(item => item.card === field).targets[0];
  assert.equal(lockedTargets.length, 2);
  assert.equal(lockedTargets[0], land);
  assert.equal(lockedTargets[1], creature);
  await resolveAll(game);
  assert.equal(land.kw('indestructible'), true);
  assert.equal(creature.kw('indestructible'), true);
});

test('Collective Effort locks every mode target and taps creatures as a real escalate cost', async () => {
  let threat;
  let tapper;
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'collectiveEffort') return ['0', '2'];
      if (q.type === 'chooseTargets' && q.candidates.includes(threat)) return [threat];
      if (q.type === 'chooseTargets' && q.candidates.includes(fantastic)) return [fantastic];
      if (q.aiHint?.kind === 'addlTap') return [tapper];
      return defaultDecision(g, q);
    },
  ], 2);
  tapper = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  const other = permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  threat = permanent(game, opponent, "Silver Surfer, Galactus's Herald");
  const effort = inZone(fantastic, 'Collective Effort', 'hand');
  fantastic.pool.W = 3;
  assert.equal(await game.castSpell(fantastic, effort), true);
  const spell = game.stack.find(item => item.card === effort);
  assert.equal(Array.from(spell.mode).join(','), '0,2');
  assert.equal(spell.targets.length, 2);
  assert.equal(spell.targets[0], threat);
  assert.equal(spell.targets[1], fantastic);
  assert.equal(tapper.tapped, true);
  await resolveAll(game);
  assert.equal(threat.zone, 'graveyard');
  assert.equal(tapper.counters['+1/+1'], 1);
  assert.equal(other.counters['+1/+1'], 1);
});

test('Fantastic Elasticity targets the exact graveyard card instead of auto-selecting by mana value', async () => {
  let wanted;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => {
      if (/Fantastic Elasticity/.test(q.prompt || '') && q.type === 'chooseOption') return '1';
      if (q.type === 'chooseTargets' && q.candidates.includes(wanted)) return [wanted];
      return defaultDecision(g, q);
    },
  ], 2);
  wanted = inZone(fantastic, 'Path to Exile', 'graveyard');
  const expensive = inZone(fantastic, 'Recurring Insight', 'graveyard');
  const elasticity = inZone(fantastic, 'Fantastic Elasticity', 'hand');
  fantastic.pool.U = 1;
  fantastic.pool.C = 2;
  assert.equal(await game.castSpell(fantastic, elasticity), true);
  assert.equal(game.stack.find(item => item.card === elasticity).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.zone, 'hand');
  assert.equal(expensive.zone, 'graveyard');
});

test('The Five Arrive lets the player keep unchosen permanents in hand', async () => {
  let battlefieldChoice;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'genesisWave' ? [battlefieldChoice] : defaultDecision(g, q),
  ], 2);
  battlefieldChoice = inZone(fantastic, 'Invisible Woman', 'library');
  const handPermanent = inZone(fantastic, 'Sol Ring', 'library');
  const spell = inZone(fantastic, 'Path to Exile', 'library');
  const source = inZone(fantastic, 'The Five Arrive', 'graveyard');
  await source.def.resolve({ g: game, src: source, you: fantastic, targets: [], so: { card: source } });
  assert.equal(battlefieldChoice.zone, 'battlefield');
  assert.equal(handPermanent.zone, 'hand');
  assert.equal(spell.zone, 'hand');
});

test('Quantum Misalignment makes a nonlegendary copy and Nova Flame damages simultaneously', async () => {
  const { game, players: [fantastic, opponent] } = rulesGame([], 2);
  const legend = permanent(game, fantastic, 'Invisible Woman');
  const quantum = inZone(fantastic, 'Quantum Misalignment', 'graveyard');
  await quantum.def.resolve({ g: game, src: quantum, you: fantastic, targets: [legend], so: { card: quantum } });
  const copy = game.creatures(fantastic).find(card => card.isToken && card.name === legend.name);
  assert.ok(copy);
  assert.equal(copy.cur.super.includes('Legendary'), false);
  const source = permanent(game, fantastic, 'The Thing');
  const one = permanent(game, opponent, 'Willie Lumpkin, Postman');
  const two = permanent(game, opponent, 'Mister Fantastic, Reed Richards');
  const nova = inZone(fantastic, 'Nova Flame', 'graveyard');
  await nova.def.resolve({ g: game, src: nova, you: fantastic, targets: [source], x: 1, so: { card: nova } });
  assert.equal(one.zone, 'graveyard');
  assert.equal(two.zone, 'graveyard');
});

test('Seize the Day has a real target and untaps exactly the chosen creature', async () => {
  let wanted;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  wanted = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  const other = permanent(game, fantastic, 'Mister Fantastic, Reed Richards');
  wanted.tapped = true;
  other.tapped = true;
  const seize = inZone(fantastic, 'Seize the Day', 'hand');
  fantastic.pool.R = 1;
  fantastic.pool.C = 3;
  assert.equal(await game.castSpell(fantastic, seize), true);
  assert.equal(game.stack.find(item => item.card === seize).targets[0], wanted);
  await resolveAll(game);
  assert.equal(wanted.tapped, false);
  assert.equal(other.tapped, true);
  assert.equal(game._extraCombats, 1);
  assert.equal(game._additionalPhases.map(entry => entry.kind).join(','), 'combat,main');
});

test('Seize the Day inserts combat then main before the normal combat and postcombat main', async () => {
  const { game, players: [fantastic] } = rulesGame([], 2);
  const target = permanent(game, fantastic, 'Willie Lumpkin, Postman');
  const seize = inZone(fantastic, 'Seize the Day', 'graveyard');
  for (let index = 0; index < 4; index++) inZone(fantastic, 'Forest', 'library');

  const phases = [];
  let cast = false;
  game.mainPhase = async () => {
    phases.push(game.phase);
    if (!cast && game.phase === 'main1') {
      cast = true;
      await seize.def.resolve({ g: game, src: seize, you: fantastic, targets: [target], so: { card: seize } });
    }
  };
  game.combatPhase = async () => { phases.push('combat'); };

  await game.runTurn();
  assert.deepEqual(phases, ['main1', 'combat', 'main2', 'combat', 'main2']);
  assert.equal(game._extraCombats, 0);
});

test('Tragic Arrogance follows the caster choices and permits one multitype permanent to fill two categories', async () => {
  let ownOverlap;
  let enemyArtifact;
  let enemyCreature;
  const { game, players: [fantastic, opponent] } = rulesGame([
    (g, q) => {
      if (/Artifact controlled by Fantastic Four/.test(q.prompt || '')) return [ownOverlap];
      if (/Creature controlled by Fantastic Four/.test(q.prompt || '')) return [ownOverlap];
      if (/Artifact controlled by Opponent 1/.test(q.prompt || '')) return [enemyArtifact];
      if (/Creature controlled by Opponent 1/.test(q.prompt || '')) return [enemyCreature];
      return defaultDecision(g, q);
    },
  ], 2);
  ownOverlap = permanent(game, fantastic, 'H.E.R.B.I.E., Lovable Robot');
  const ownArtifact = permanent(game, fantastic, 'Sol Ring');
  enemyArtifact = permanent(game, opponent, 'Arcane Signet');
  enemyCreature = permanent(game, opponent, 'Willie Lumpkin, Postman');
  const enemyExtra = permanent(game, opponent, 'Mister Fantastic, Reed Richards');
  const arrogance = inZone(fantastic, 'Tragic Arrogance', 'graveyard');
  await arrogance.def.resolve({ g: game, src: arrogance, you: fantastic, targets: [], so: { card: arrogance } });
  assert.equal(ownOverlap.zone, 'battlefield');
  assert.equal(ownArtifact.zone, 'graveyard');
  assert.equal(enemyArtifact.zone, 'battlefield');
  assert.equal(enemyCreature.zone, 'battlefield');
  assert.equal(enemyExtra.zone, 'graveyard');
});

test('Ultimate Nullification requires and sacrifices a legendary creature as the actual additional cost', async () => {
  const { game, players: [fantastic, opponent] } = rulesGame([], 2);
  const ordinary = permanent(game, fantastic, 'Bastion Protector');
  const nullification = inZone(fantastic, 'Ultimate Nullification', 'hand');
  fantastic.pool.W = 1;
  fantastic.pool.C = 4;
  assert.equal(game.castableList(fantastic).some(entry => entry.card === nullification), false);
  const legendary = permanent(game, fantastic, 'Galactus, Devourer of Worlds');
  permanent(game, opponent, 'Mister Fantastic, Reed Richards');
  assert.equal(game.castableList(fantastic).some(entry => entry.card === nullification), true);
  assert.equal(await game.castSpell(fantastic, nullification), true);
  await resolveAll(game);
  assert.equal(legendary.zone, 'exile');
  assert.equal(ordinary.zone, 'exile');
  assert.equal(nullification.zone, 'library');
  assert.equal(fantastic.library[0], nullification);
});

test('Mirage Mirror locks a target and copies its complete definition until cleanup', async () => {
  let wanted;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const mirror = permanent(game, fantastic, 'Mirage Mirror');
  wanted = permanent(game, fantastic, 'Cosmic Crucible');
  fantastic.pool.C = 2;
  const entry = game.activatableList(fantastic).find(action => action.card === mirror && action.ability);
  assert.ok(entry);
  assert.equal(await game.activateAbility(fantastic, entry), true);
  assert.equal(game.stack.at(-1).targets[0], wanted);
  await resolveAll(game);
  assert.equal(mirror.def.name, 'Cosmic Crucible');
  assert.equal(mirror.def.triggers.length, 2);
  assert.equal(mirror.meta.characteristicOriginalDef.name, 'Mirage Mirror');
});

test('Fantasticar sacrifice is optional and creates four flying hasty Constructs only after a successful sacrifice', async () => {
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'fantasticarSacrifice' ? 'yes' : q.type === 'chooseOption' ? 'no' : defaultDecision(g, q),
  ], 2);
  const car = permanent(game, fantastic, 'The Fantasticar');
  const spells = ['Sol Ring', 'Arcane Signet', 'Monologue Tax', 'Whirlwind of Thought']
    .map(name => new MTG.CardInst(MTG.DEFS[name], fantastic));
  fantastic.turnState.spellsCastList = spells.map(card => ({ card }));
  await game.emit('cast', { player: fantastic, card: spells[3], nthNonCreature: 4 });
  await resolveAll(game);
  assert.equal(car.zone, 'graveyard');
  const constructs = game.creatures(fantastic).filter(card => card.isToken && card.name === 'Construct');
  assert.equal(constructs.length, 4);
  assert.equal(constructs.every(card => card.kw('flying') && card.kw('haste')), true);
});

test('Unstable Molecule Suit uses Equip commander {2} through the authoritative equip path', async () => {
  const { game, players: [fantastic] } = rulesGame([], 2);
  const suit = permanent(game, fantastic, 'Unstable Molecule Suit');
  const commander = permanent(game, fantastic, 'Invisible Woman', { commander: true });
  permanent(game, fantastic, 'Willie Lumpkin, Postman');
  fantastic.pool.C = 2;
  const equip = game.activatableList(fantastic).find(entry => entry.card === suit && entry.equip);
  assert.ok(equip);
  assert.equal(await game.activateAbility(fantastic, equip, [commander]), true);
  await resolveAll(game);
  assert.equal(suit.attachedTo, commander.iid);
  assert.equal(fantastic.pool.C, 0);
});

test('Cosmic Crucible makes a chosen four-mana combination and copies a noncreature permanent spell', async () => {
  const colors = ['R', 'R', 'U', 'G'];
  let colorIndex = 0;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => {
      if (q.aiHint?.kind === 'manaColor') return colors[colorIndex++ % colors.length];
      if (q.aiHint?.kind === 'cosmicCopy') return 'yes';
      return defaultDecision(g, q);
    },
  ], 2);
  permanent(game, fantastic, 'Cosmic Crucible');
  await game.emit('precombatMain', { player: fantastic });
  await resolveAll(game);
  assert.equal(fantastic.pool.R, 2);
  assert.equal(fantastic.pool.U, 1);
  assert.equal(fantastic.pool.G, 1);
  fantastic.pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
  const signet = inZone(fantastic, 'Arcane Signet', 'hand');
  assert.equal(await game.castSpell(fantastic, signet), true);
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.name === 'Arcane Signet').length, 2);
  assert.equal(game.bf().filter(card => card.name === 'Arcane Signet' && card.isToken).length, 1);
});

test("The Watcher's Warning triggers for each opponent's first spell, not only the first opponent overall", async () => {
  const { game, players: [fantastic, one, two] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'freeCast' ? 'no' : defaultDecision(g, q),
  ], 3);
  permanent(game, fantastic, "The Watcher's Warning");
  const topOne = inZone(one, 'Sol Ring', 'library');
  const topTwo = inZone(two, 'Arcane Signet', 'library');
  const spellOne = new MTG.CardInst(MTG.DEFS['Forest'], one);
  const spellTwo = new MTG.CardInst(MTG.DEFS['Island'], two);
  await game.emit('cast', { player: one, card: spellOne, nthThisTurn: 1 });
  await resolveAll(game);
  await game.emit('cast', { player: two, card: spellTwo, nthThisTurn: 1 });
  await resolveAll(game);
  assert.equal(topOne.zone, 'exile');
  assert.equal(topTwo.zone, 'exile');
});

test('Baxter Building adds four mana in the exact combination chosen by its controller', async () => {
  const colors = ['R', 'R', 'U', 'G'];
  let colorIndex = 0;
  const { game, players: [fantastic] } = rulesGame([
    (g, q) => q.aiHint?.kind === 'manaColor' ? colors[colorIndex++] : defaultDecision(g, q),
  ], 2);
  const baxter = permanent(game, fantastic, 'Baxter Building');
  fantastic.pool.C = 4;
  const mana = game.activatableList(fantastic).find(entry => entry.card === baxter && entry.manaAbility &&
    entry.manaSource.produce.some(option => option.ANY && option.n === 4));
  assert.ok(mana);
  assert.equal(await game.activateAbility(fantastic, mana), true);
  assert.equal(baxter.tapped, true);
  assert.equal(fantastic.pool.R, 2);
  assert.equal(fantastic.pool.U, 1);
  assert.equal(fantastic.pool.G, 1);
  assert.equal(fantastic.pool.C, 0);
});

test('Path to Exile gives the target controller a real may-search choice', async () => {
  const { game, players: [fantastic, opponent] } = rulesGame([
    undefined,
    (g, q) => q.aiHint?.kind === 'rampChoice' ? 'no' : defaultDecision(g, q),
  ], 2);
  const target = permanent(game, opponent, 'Willie Lumpkin, Postman');
  const basic = inZone(opponent, 'Forest', 'library');
  const path = inZone(fantastic, 'Path to Exile', 'hand');
  fantastic.pool.W = 1;
  assert.equal(await game.castSpell(fantastic, path), true);
  await resolveAll(game);
  assert.equal(target.zone, 'exile');
  assert.equal(basic.zone, 'library');
});

test('Promise of Loyalty attack restriction ends as soon as the vow counter is removed', async () => {
  const { game, players: [fantastic, opponent] } = rulesGame([], 2);
  permanent(game, fantastic, 'Invisible Woman');
  const kept = permanent(game, opponent, 'Mister Fantastic, Reed Richards');
  permanent(game, opponent, 'Willie Lumpkin, Postman');
  const promise = inZone(fantastic, 'Promise of Loyalty', 'graveyard');
  await promise.def.resolve({ g: game, src: promise, you: fantastic, targets: [], so: { card: promise } });
  assert.equal(kept.counters.vow, 1);
  assert.equal(game.canAttackTarget(kept, fantastic), false);
  game.removeCounters(kept, 'vow', 1);
  assert.equal(game.canAttackTarget(kept, fantastic), true);
});

test('Fantastic Four AI declines empty Thing payment and directs Silver Surfer through a third-party creature', async () => {
  const { game, players: [fantastic, victim, third] } = rulesGame([], 3);
  fantastic.isAI = true;
  const thing = permanent(game, fantastic, 'The Thing');
  const emptyPay = await MTG.chooseBotAction({
    gameState: game, botPlayerId: fantastic.idx, seed: 814421,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'yes', label: 'Yes' }, { key: 'no', label: 'No' }],
      aiHint: { kind: 'fantasticPay', effect: 'thing', src: thing },
    },
  });
  assert.equal(emptyPay.action.value, 'no');
  const victimCreature = permanent(game, victim, 'Galactus, Devourer of Worlds');
  const thirdCreature = permanent(game, third, 'Mister Fantastic, Reed Richards');
  const forced = await MTG.chooseBotAction({
    gameState: game, botPlayerId: fantastic.idx, seed: 814422,
    actionWindow: {
      type: 'chooseTargets', candidates: [victimCreature, thirdCreature], min: 1, max: 1,
      aiHint: { goal: 'forceAttack', victim },
    },
  });
  assert.equal(forced.action.picks.length, 1);
  assert.equal(forced.action.picks[0], thirdCreature);
});

test('The Fantastic Four completes deterministic full games in both seats without AI fallback', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'The Fantastic Four', aiDecks: ['Doom Prevails', 'Avengers Assemble', 'Turtle Power'], seed: 814423 },
    { humanDeck: 'Doom Prevails', aiDecks: ['The Fantastic Four', 'Avengers Assemble', 'Turtle Power'], seed: 814424 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'The Fantastic Four'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
