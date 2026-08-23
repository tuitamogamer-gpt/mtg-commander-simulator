import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const intake = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-intake.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(fs.readFileSync(new URL('../reports/new-deck-oracle.json', import.meta.url), 'utf8'));
const deckIntake = intake.decks.find(deck => deck.name === 'Jeskai Striker');
const newNames = deckIntake.missingNames;

function defaultDecision(game, query) {
  if (query.type === 'priority') return { kind: 'pass' };
  if (query.type === 'main') return { kind: 'done' };
  if (query.type === 'attackers' || query.type === 'blockers') return [];
  if (query.type === 'chooseOption') return query.options[0]?.key;
  if (query.type === 'chooseTargets') return query.candidates.slice(0, query.min || 0);
  if (query.type === 'chooseCards') return query.search || query.aiHint?.kind === 'searchBasic'
    ? query.from.slice(0, 1) : query.from.slice(0, query.min || 0);
  if (query.type === 'chooseX') return query.max;
  if (query.type === 'chooseMulti') return query.options.slice(0, query.min || 1).map(option => option.key);
  if (query.type === 'orderTriggers') return query.triggers;
  if (query.type === 'scry') return { top: query.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 2) {
  const game = new MTG.Game({ seed: 230823, paced: false, maxTurns: 40 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Jeskai',
    { name: index ? `Opponent ${index}` : 'Jeskai Striker' },
    { decide: async (g, query) => deciders[index] ? deciders[index](g, query) : defaultDecision(g, query) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.tapped = opts.tapped ?? false;
  card.commander = !!opts.commander;
  game.battlefield.push(card);
  if (card.commander) player.commanders.push(card);
  game.recalc();
  return card;
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function fillLibrary(player, names) {
  return names.map(name => inZone(player, name, 'library'));
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 300) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 300, 'Jeskai stack and trigger queue did not settle');
}

test('Jeskai Striker is a 100-card Shiko deck and all 23 cards use exact Oracle data and executable scripts', () => {
  const deck = MTG.DECKS['Jeskai Striker'];
  assert.equal(deck.commander, 'Shiko and Narset, Unified');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 89);
  assert.equal(newNames.length, 23);
  assert.equal(new Set(newNames).size, 23);
  assert.deepEqual(newNames.filter(name => !MTG.SCRIPTS[name]), []);
  assert.deepEqual(newNames.filter(name => !MTG.DEFS[name]), []);

  const reported = oracle.cards.filter(card => newNames.includes(card.requestedName));
  assert.equal(reported.length, 23);
  for (const card of reported) {
    assert.equal(MTG.DEFS[card.requestedName].oracle, card.raw.oracle, `${card.requestedName} Oracle text drifted`);
    assert.equal(MTG.DEFS[card.requestedName].simplified, undefined);
    assert.equal(MTG.DEFS[card.requestedName].engineGap, undefined);
  }
  assert.equal(reported.some(card => card.keywords.includes('Flurry')), true);
  assert.equal(reported.some(card => card.keywords.includes('Demonstrate')), true);
  assert.equal(reported.some(card => card.keywords.includes('Storm')), true);
  assert.equal(reported.some(card => card.keywords.includes('Suspend')), true);

  const source = fs.readFileSync(new URL('../src/modules/scripts-jeskai.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fallback|simplified|TODO|engineGap/i);
});

test('Shiko grants no extra land play, and Jeskai fetch lands put rather than play their replacement land', async () => {
  const { game, players: [jeskai, opponent] } = rulesGame();
  const first = inZone(jeskai, 'Island', 'hand');
  const second = inZone(jeskai, 'Mountain', 'hand');
  const libraryLand = inZone(jeskai, 'Plains', 'library');
  const unauthorizedExileLand = inZone(jeskai, 'Temple of Enlightenment', 'exile');
  const opponentsLand = inZone(opponent, 'Mountain', 'hand');
  permanent(game, jeskai, 'Shiko and Narset, Unified', { commander: true });

  assert.equal(game.landPlayLimit(jeskai), 1, 'Shiko has no additional-land permission');
  assert.deepEqual(Array.from(game.playableLands(jeskai), card => card.iid), [first.iid, second.iid]);
  assert.equal(await game.playLand(jeskai, libraryLand), false, 'a direct call cannot play a nonpermitted library land');
  assert.equal(await game.playLand(jeskai, unauthorizedExileLand), false, 'a direct call cannot play an unpermitted exile land');
  assert.equal(await game.playLand(jeskai, opponentsLand), false, 'a direct call cannot play a land from an opponent hand');
  assert.equal(jeskai.landsPlayed, 0, 'rejected direct calls do not spend the normal land drop');
  assert.equal(await game.playLand(jeskai, first), true);
  game.phase = 'main2';
  assert.equal(game.playableLands(jeskai).length, 0, 'the normal land drop stays spent across both main phases');
  assert.equal(await game.playLand(jeskai, second), false, 'the authoritative path rejects a second played land');
  assert.equal(jeskai.landsPlayed, 1);

  const actionWindow = {
    type: 'main', player: jeskai, casts: game.castableList(jeskai), acts: game.activatableList(jeskai),
    lands: game.playableLands(jeskai), phase: game.phase,
  };
  const view = MTG.createBotPlayerView(game, jeskai.idx, actionWindow);
  assert.equal(MTG.generateLegalActions(view).some(action => action.kind === 'land'), false,
    'the local AI receives no second-land action either');
  const decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: jeskai.idx, seed: 3054, actionWindow });
  assert.equal(decision.action.kind, 'done');
  assert.equal(decision.log.fallback, false);

  const fetchedGame = rulesGame();
  const [fetchPlayer] = fetchedGame.players;
  const landscape = inZone(fetchPlayer, 'Perilous Landscape', 'hand');
  const basic = inZone(fetchPlayer, 'Plains', 'library');
  const laterDrop = inZone(fetchPlayer, 'Island', 'hand');
  assert.equal(await fetchedGame.game.playLand(fetchPlayer, landscape), true);
  const fetchAbility = fetchedGame.game.activatableList(fetchPlayer)
    .find(entry => entry.card === landscape && entry.ability);
  assert.ok(fetchAbility);
  assert.equal(await fetchedGame.game.activateAbility(fetchPlayer, fetchAbility), true);
  await resolveAll(fetchedGame.game);
  assert.equal(landscape.zone, 'graveyard');
  assert.equal(basic.zone, 'battlefield');
  assert.equal(basic.tapped, true);
  assert.equal(fetchPlayer.landsPlayed, 1, 'searching a land onto the battlefield is not another land play');
  assert.equal(await fetchedGame.game.playLand(fetchPlayer, laterDrop), false);
});

test('Shiko flurry copies a targeted second spell, retargets legally, and draws for an untargeted second spell', async () => {
  let firstTarget;
  let secondTarget;
  let shikoTargetPick = 0;
  const { game, players: [jeskai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'yes';
      if (query.type === 'chooseTargets' && query.candidates.includes(firstTarget) && query.candidates.includes(secondTarget)) {
        return [shikoTargetPick++ === 0 ? firstTarget : secondTarget];
      }
      return defaultDecision(g, query);
    },
  ]);
  permanent(game, jeskai, 'Shiko and Narset, Unified', { commander: true });
  firstTarget = permanent(game, opponent, 'Goblin Electromancer');
  secondTarget = permanent(game, opponent, 'Young Pyromancer');
  const first = inZone(jeskai, 'Opt', 'hand');
  const second = inZone(jeskai, 'Swords to Plowshares', 'hand');
  fillLibrary(jeskai, ['Island', 'Plains', 'Mountain', 'Consider']);

  assert.equal(await game.castSpell(jeskai, first, { from: 'hand', free: true }), true);
  await resolveAll(game);
  assert.equal(await game.castSpell(jeskai, second, { from: 'hand', free: true }), true);
  await game.resolveTop();
  const copy = game.stack.find(item => item.isCopy && item.card === second);
  assert.ok(copy);
  assert.equal(copy.targets[0], secondTarget);
  await resolveAll(game);
  assert.equal(secondTarget.zone, 'exile');
  assert.equal(firstTarget.zone, 'exile');

  let victim;
  const otherGame = rulesGame([
    (g, query) => query.type === 'chooseTargets' && query.candidates.includes(victim)
      ? [victim] : defaultDecision(g, query),
  ]);
  const [otherJeskai, otherOpponent] = otherGame.players;
  permanent(otherGame.game, otherJeskai, 'Shiko and Narset, Unified', { commander: true });
  victim = permanent(otherGame.game, otherOpponent, 'Lier, Disciple of the Drowned');
  const targetedFirst = inZone(otherJeskai, 'Swords to Plowshares', 'hand');
  const targetlessSecond = inZone(otherJeskai, 'Consider', 'hand');
  fillLibrary(otherJeskai, ['Island', 'Plains', 'Mountain']);
  assert.equal(await otherGame.game.castSpell(otherJeskai, targetedFirst, { from: 'hand', free: true }), true);
  assert.equal(otherGame.game.stack.at(-1).targets[0], victim);
  await resolveAll(otherGame.game);
  assert.equal(await otherGame.game.castSpell(otherJeskai, targetlessSecond, { from: 'hand', free: true }), true);
  await otherGame.game.resolveTop();
  assert.equal(otherJeskai.hand.length, 1, 'untargeted second spell draws before Consider resolves');
  await resolveAll(otherGame.game);
});

test('Aligned Heart accumulates rally counters and its created Monk tokens have working prowess', async () => {
  const { game, players: [jeskai] } = rulesGame();
  const heart = permanent(game, jeskai, 'Aligned Heart');
  await game.emit('castSecond', { player: jeskai, isInstantSorcery: true, so: { targets: [] } });
  await resolveAll(game);
  game.turnNo++;
  await game.emit('castSecond', { player: jeskai, isInstantSorcery: true, so: { targets: [] } });
  await resolveAll(game);
  assert.equal(heart.counters.rally, 2);
  const monks = game.creatures(jeskai).filter(card => card.isToken && card.name === 'Monk');
  assert.equal(monks.length, 3);
  await game.emit('castNonCreature', { player: jeskai, isInstantSorcery: true });
  await resolveAll(game);
  assert.ok(monks.every(monk => monk.power === 2 && monk.toughness === 2));
});

test('Tempest Technique creates attached Aura-token storm copies and each Aura counts every controlled enchantment', async () => {
  let host;
  const { game, players: [jeskai] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseTargets' && query.candidates.includes(host)) return [host];
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'no';
      return defaultDecision(g, query);
    },
  ]);
  host = permanent(game, jeskai, 'Goblin Electromancer');
  const setup = inZone(jeskai, 'Opt', 'hand');
  const aura = inZone(jeskai, 'Tempest Technique', 'hand');
  fillLibrary(jeskai, ['Island']);
  jeskai.pool.U = 1;
  jeskai.pool.W = 1;
  jeskai.pool.C = 3;
  assert.equal(await game.castSpell(jeskai, setup, { from: 'hand' }), true);
  await resolveAll(game);
  assert.equal(await game.castSpell(jeskai, aura, { from: 'hand' }), true);
  assert.equal(game.stack.filter(item => item.card === aura).length, 2);
  await resolveAll(game);
  const attached = game.bf().filter(card => card.name === 'Tempest Technique' && card.attachedTo === host.iid);
  assert.equal(attached.length, 2);
  assert.ok(attached.some(card => card.isToken));
  assert.equal(host.power, 6);
  assert.equal(host.toughness, 6);
});

test('Expansion copies only legal low-MV stack spells, while Explosion pays X and has two independently revalidated targets', async () => {
  let originalTarget;
  let copyTarget;
  const { game, players: [jeskai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseOption' && query.prompt?.startsWith('Abrade:')) return '0';
      if (query.type === 'chooseTargets' && query.candidates.some(candidate => candidate.kind === 'spell')) {
        return [query.candidates.find(candidate => candidate.kind === 'spell')];
      }
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'yes';
      if (query.type === 'chooseTargets' && query.prompt?.includes('Explosion') && query.candidates.includes(opponent)) return [opponent];
      if (query.type === 'chooseTargets' && query.candidates.includes(copyTarget) && query.candidates.includes(originalTarget)) {
        return [copyTarget];
      }
      return defaultDecision(g, query);
    },
  ]);
  originalTarget = permanent(game, opponent, 'Lier, Disciple of the Drowned');
  copyTarget = permanent(game, opponent, 'Transcendent Dragon');
  const abrade = inZone(opponent, 'Abrade', 'hand');
  const expansion = inZone(jeskai, 'Expansion // Explosion', 'hand');
  assert.equal(await game.castSpell(opponent, abrade, { from: 'hand', free: true }), true);
  assert.equal(await game.castSpell(jeskai, expansion, { from: 'hand', free: true }), true);
  await game.resolveTop();
  const copiedAbrade = game.stack.find(item => item.isCopy && item.card === abrade);
  assert.ok(copiedAbrade);
  assert.equal(copiedAbrade.targets[0], copyTarget);
  await resolveAll(game);

  const explosion = inZone(jeskai, 'Expansion // Explosion', 'hand');
  fillLibrary(jeskai, ['Island', 'Plains', 'Mountain', 'Consider']);
  jeskai.pool.U = 2; jeskai.pool.R = 2; jeskai.pool.C = 3;
  const alt = explosion.def.altCosts.find(entry => entry.splitHalf === 'explosion');
  const life = opponent.life;
  assert.equal(await game.castSpell(jeskai, explosion, { from: 'hand', alt, xVal: 3 }), true);
  const stackObject = game.stack.find(item => item.card === explosion);
  assert.equal(stackObject.name, 'Explosion');
  assert.equal(stackObject.x, 3);
  await resolveAll(game);
  assert.equal(opponent.life, life - 3);
  assert.equal(jeskai.hand.length, 3);
});

test('Ancestral Vision cannot be normally cast, suspends for four, then free-casts and draws three', async () => {
  const { game, players: [jeskai] } = rulesGame();
  // Suspend now uses its two real, respondable trigger windows; this scenario
  // must not use rulesGame's generic no-priority shortcut.
  game.priorityRound = MTG.Game.prototype.priorityRound.bind(game);
  const vision = inZone(jeskai, 'Ancestral Vision', 'hand');
  fillLibrary(jeskai, Array(16).fill('Island'));
  jeskai.pool.U = 1;
  assert.equal(game.castableList(jeskai).some(entry => entry.card === vision), false);
  const suspend = game.activatableList(jeskai).find(entry => entry.card === vision && entry.suspend);
  assert.ok(suspend);
  assert.equal(await game.activateAbility(jeskai, suspend), true);
  assert.equal(vision.zone, 'exile');
  assert.equal(vision.meta.suspended, 4);

  for (const expected of [3, 2, 1, 0]) {
    game.turnPlayer = jeskai;
    await game.runTurn();
    assert.equal(vision.meta.suspended, expected);
    if (expected > 0) assert.equal(vision.zone, 'exile');
  }
  await resolveAll(game);
  assert.equal(vision.zone, 'graveyard');
  assert.equal(vision.castMeta.alt.free, true);
  assert.ok(jeskai.hand.length >= 3);
});

test('Transforming Flourish demonstrate copies use their own controllers, revalidate targets, and reveal through a nonland free-cast choice', async () => {
  let originalTarget;
  let opposingCopyTarget;
  const { game, players: [jeskai, opponent, third] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'demonstrate') return 'yes';
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'chooseOpponent') {
        return query.options.find(option => option.player === opponent)?.key;
      }
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'no';
      if (query.type === 'chooseTargets' && query.candidates.includes(originalTarget)) return [originalTarget];
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'freeCast') return 'no';
      return defaultDecision(g, query);
    },
    (g, query) => {
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'yes';
      if (query.type === 'chooseTargets' && query.candidates.includes(opposingCopyTarget)) return [opposingCopyTarget];
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'freeCast') return 'no';
      return defaultDecision(g, query);
    },
  ], 3);
  originalTarget = permanent(game, opponent, 'Sol Ring');
  opposingCopyTarget = permanent(game, jeskai, 'Arcane Signet');
  fillLibrary(jeskai, ['Consider', 'Island']);
  fillLibrary(opponent, ['Opt', 'Mountain']);
  fillLibrary(third, ['Plains']);
  const flourish = inZone(jeskai, 'Transforming Flourish', 'hand');
  assert.equal(await game.castSpell(jeskai, flourish, { from: 'hand', free: true }), true,
    'demonstrate must also trigger on a free cast');
  await game.resolveTop();
  const copies = game.stack.filter(item => item.isCopy && item.card === flourish);
  assert.equal(copies.length, 2);
  assert.equal(copies.find(copy => copy.ctrl === opponent).targets[0], opposingCopyTarget);
  await resolveAll(game);
  assert.equal(opposingCopyTarget.zone, 'graveyard');
  assert.equal(originalTarget.zone, 'graveyard');
  assert.equal(flourish.zone, 'graveyard');
  assert.ok(jeskai.exile.some(card => card.name === 'Consider'));
  assert.ok(opponent.exile.some(card => card.name === 'Opt'));
});

test("Narset's Reversal copies before returning the original and Transcendent Dragon exiles then offers the real card for free cast", async () => {
  let originalTarget;
  let copyTarget;
  const { game, players: [jeskai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseOption' && query.prompt?.startsWith('Abrade:')) return '0';
      if (query.type === 'chooseTargets' && query.candidates.some(candidate => candidate.kind === 'spell')) {
        return [query.candidates.find(candidate => candidate.kind === 'spell')];
      }
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'yes';
      if (query.type === 'chooseTargets' && query.candidates.includes(copyTarget) && query.candidates.includes(originalTarget)) {
        return [copyTarget];
      }
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'freeCast') return 'yes';
      return defaultDecision(g, query);
    },
  ]);
  originalTarget = permanent(game, opponent, 'Lier, Disciple of the Drowned');
  copyTarget = permanent(game, opponent, 'Transcendent Dragon');
  const abrade = inZone(opponent, 'Abrade', 'hand');
  const reversal = inZone(jeskai, "Narset's Reversal", 'hand');
  assert.equal(await game.castSpell(opponent, abrade, { from: 'hand', free: true }), true);
  assert.equal(await game.castSpell(jeskai, reversal, { from: 'hand', free: true }), true);
  await game.resolveTop();
  assert.equal(abrade.zone, 'hand');
  const copy = game.stack.find(item => item.isCopy && item.card === abrade);
  assert.ok(copy);
  assert.equal(copy.targets[0], copyTarget);
  await resolveAll(game);
  assert.equal(copyTarget.zone, 'graveyard');
  assert.equal(originalTarget.zone, 'battlefield');

  // Keep the Dragon half independent: Lier correctly makes its controller's
  // spells uncounterable in the shared engine, so remove it before presenting
  // the counterable spell that Dragon is supposed to exile and recast.
  await game.move(originalTarget, 'graveyard');

  const targetSpell = inZone(opponent, 'Monastery Mentor', 'hand');
  assert.equal(await game.castSpell(opponent, targetSpell, { from: 'hand', free: true }), true);
  const dragon = permanent(game, jeskai, 'Transcendent Dragon');
  dragon.meta._enteredFromZone = 'stack';
  await game.emit('etb', { card: dragon, ctrl: jeskai });
  await resolveAll(game);
  assert.equal(targetSpell.zone, 'battlefield');
  assert.equal(targetSpell.ctrl, jeskai);
  assert.equal(targetSpell.castMeta.alt.free, true);
});

test('Baral and Kari Zev casts a legal lesser shared-type spell or creates a hasty legendary First Mate', async () => {
  let consider;
  const { game, players: [jeskai] } = rulesGame([
    (g, query) => query.type === 'chooseCards' && query.from.includes(consider) ? [consider] : defaultDecision(g, query),
  ]);
  permanent(game, jeskai, 'Baral and Kari Zev');
  consider = inZone(jeskai, 'Consider', 'hand');
  const search = inZone(jeskai, 'Frantic Search', 'hand');
  fillLibrary(jeskai, ['Island', 'Plains', 'Mountain', 'Opt', 'Ponder']);
  assert.equal(await game.castSpell(jeskai, search, { from: 'hand', free: true }), true);
  await resolveAll(game);
  assert.equal(consider.zone, 'graveyard');
  assert.equal(game.creatures(jeskai).some(card => card.name === 'First Mate Ragavan'), false);

  const second = rulesGame();
  const [otherJeskai] = second.players;
  permanent(second.game, otherJeskai, 'Baral and Kari Zev');
  const opt = inZone(otherJeskai, 'Opt', 'hand');
  fillLibrary(otherJeskai, ['Island']);
  assert.equal(await second.game.castSpell(otherJeskai, opt, { from: 'hand', free: true }), true);
  await resolveAll(second.game);
  const ragavan = second.game.creatures(otherJeskai).find(card => card.name === 'First Mate Ragavan');
  assert.ok(ragavan);
  assert.equal(ragavan.kw('haste'), true);
  assert.ok(ragavan.cur.super.includes('Legendary'));
});

test('creature triggers cover Elsha, Mentor, Mangara, Bibliophile, and Caldera Pyremaw semantics', async () => {
  const { game, players: [jeskai, opponent] } = rulesGame();
  const elsha = permanent(game, jeskai, 'Elsha, Threefold Master');
  permanent(game, jeskai, 'Monastery Mentor');
  permanent(game, jeskai, 'Mangara, the Diplomat');
  permanent(game, jeskai, 'Voracious Bibliophile');
  const pyremaw = permanent(game, jeskai, 'Caldera Pyremaw');
  fillLibrary(jeskai, Array(12).fill('Island'));

  await game.emit('combatDamageToPlayer', { card: elsha, player: opponent, n: 3 });
  await resolveAll(game);
  assert.equal(game.creatures(jeskai).filter(card => card.name === 'Monk').length, 3);

  const handBefore = jeskai.hand.length;
  await game.emit('castNonCreature', { player: jeskai, isInstantSorcery: true });
  await game.emit('cast', { player: jeskai, isInstantSorcery: true, so: { targets: [opponent, pyremaw] } });
  await game.emit('castIS', { player: jeskai, isInstantSorcery: true, so: { targets: [] } });
  await resolveAll(game);
  assert.equal(game.creatures(jeskai).filter(card => card.name === 'Monk').length, 4);
  assert.equal(jeskai.hand.length, handBefore + 2);
  assert.equal(pyremaw.counters['+1/+1'], 1);
  assert.equal(opponent.life, 36);

  const attackers = [permanent(game, opponent, 'Goblin Electromancer'), permanent(game, opponent, 'Young Pyromancer')];
  for (const attacker of attackers) attacker.attacking = jeskai;
  const mangaraHand = jeskai.hand.length;
  await game.emit('attackersDeclared', { player: opponent, attackers });
  await game.emit('castSecond', { player: opponent, isInstantSorcery: false, so: { targets: [] } });
  await resolveAll(game);
  assert.equal(jeskai.hand.length, mangaraHand + 2);
});

test('Velomachus, Electrodominance, Frantic Search, and Compulsive Research perform their full ordered choices', async () => {
  let velomachusChoice;
  let electroChoice;
  let landDiscard;
  const { game, players: [jeskai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseCards' && query.from.includes(velomachusChoice)) return [velomachusChoice];
      if (query.type === 'chooseCards' && query.from.includes(electroChoice)) return [electroChoice];
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'discardChoice') return 'land';
      if (query.type === 'chooseCards' && query.from.includes(landDiscard)) return [landDiscard];
      if (query.type === 'chooseCards' && query.aiHint?.kind === 'untapLands') return query.from.slice(0, 3);
      return defaultDecision(g, query);
    },
  ]);
  const velomachus = permanent(game, jeskai, 'Velomachus Lorehold');
  const seen = fillLibrary(jeskai, ['Island', 'Plains', 'Mountain', 'Sol Ring', 'Monastery Mentor', 'Consider', 'Frantic Search']);
  velomachusChoice = seen.find(card => card.name === 'Consider');
  await game.emit('attacks', { card: velomachus, player: jeskai, defender: opponent });
  await resolveAll(game);
  assert.equal(velomachusChoice.zone, 'graveyard');
  assert.equal(seen.filter(card => card !== velomachusChoice).every(card => ['library', 'hand'].includes(card.zone)), true,
    'the six cards go to the bottom before the chosen Consider later draws one of them');

  electroChoice = inZone(jeskai, 'Monastery Mentor', 'hand');
  const electro = new MTG.CardInst(MTG.DEFS.Electrodominance, jeskai);
  const life = opponent.life;
  await electro.def.resolve({ g: game, src: electro, you: jeskai, targets: [opponent], x: 3, so: {} });
  assert.equal(opponent.life, life - 3);
  assert.equal(electroChoice.zone, 'stack');
  await resolveAll(game);
  assert.equal(electroChoice.zone, 'battlefield');

  const tapped = [permanent(game, jeskai, 'Island', { tapped: true }), permanent(game, jeskai, 'Mountain', { tapped: true }), permanent(game, jeskai, 'Plains', { tapped: true })];
  inZone(jeskai, 'Opt', 'hand');
  inZone(jeskai, 'Ponder', 'hand');
  fillLibrary(jeskai, ['Island', 'Mountain']);
  const frantic = new MTG.CardInst(MTG.DEFS['Frantic Search'], jeskai);
  await frantic.def.resolve({ g: game, src: frantic, you: jeskai, targets: [], so: {} });
  assert.ok(tapped.every(land => !land.tapped));

  landDiscard = inZone(opponent, 'Mountain', 'hand');
  inZone(opponent, 'Opt', 'hand');
  fillLibrary(opponent, ['Island', 'Plains', 'Consider']);
  const research = new MTG.CardInst(MTG.DEFS['Compulsive Research'], jeskai);
  const before = opponent.hand.length;
  await research.def.resolve({ g: game, src: research, you: jeskai, targets: [opponent], so: {} });
  assert.equal(landDiscard.zone, 'graveyard');
  assert.equal(opponent.hand.length, before + 2);
});

test('Lier flashback, Will both modes, Adaptive Training Post, and Perilous Landscape use real shared engine paths', async () => {
  let flashbackSpell;
  let adaptiveTarget;
  const { game, players: [jeskai, opponent] } = rulesGame([
    (g, query) => {
      if (query.type === 'chooseMulti') return query.options.map(option => option.key);
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'wheelChoice') return 'yes';
      if (query.type === 'chooseOption' && query.aiHint?.kind === 'newTargets') return 'no';
      if (query.type === 'chooseTargets' && query.candidates.includes(adaptiveTarget)) return [adaptiveTarget];
      return defaultDecision(g, query);
    },
  ]);
  permanent(game, jeskai, 'Lier, Disciple of the Drowned');
  const commander = permanent(game, jeskai, 'Shiko and Narset, Unified', { commander: true });
  flashbackSpell = inZone(jeskai, 'Consider', 'graveyard');
  fillLibrary(jeskai, Array(16).fill('Island'));
  fillLibrary(opponent, Array(8).fill('Mountain'));
  jeskai.pool.U = 1;
  const flashback = game.castableList(jeskai).find(entry => entry.card === flashbackSpell && entry.alt?.flashback);
  assert.ok(flashback);
  assert.equal(await game.castSpell(jeskai, flashbackSpell, { from: 'graveyard', alt: flashback.alt }), true);
  assert.equal(MTG.isUncounterable(game, game.stack.find(item => item.card === flashbackSpell)), true);
  await resolveAll(game);
  assert.equal(flashbackSpell.zone, 'exile');

  const opposingSpell = inZone(opponent, 'Opt', 'hand');
  assert.equal(await game.castSpell(opponent, opposingSpell, { from: 'hand', free: true }), true);
  assert.equal(MTG.isUncounterable(game, game.stack.find(item => item.card === opposingSpell)), true,
    "Lier's countering restriction applies to every player's spells");
  await resolveAll(game);

  const will = inZone(jeskai, 'Will of the Jeskai', 'hand');
  const graveSpell = inZone(jeskai, 'Opt', 'graveyard');
  inZone(jeskai, 'Ponder', 'hand');
  inZone(opponent, 'Sol Ring', 'hand');
  assert.equal(await game.castSpell(jeskai, will, { from: 'hand', free: true }), true);
  const willObject = game.stack.find(item => item.card === will);
  assert.deepEqual(Array.from(willObject.mode), [0, 1]);
  await resolveAll(game);
  assert.equal(graveSpell.meta.flashbackUntil, game.turnNo);
  assert.equal(jeskai.hand.length >= 5, true);
  assert.equal(opponent.hand.length, 5);
  assert.equal(commander.zone, 'battlefield');

  const post = permanent(game, jeskai, 'Adaptive Training Post');
  post.counters.charge = 3;
  const ability = game.activatableList(jeskai).find(entry => entry.card === post && entry.ability);
  assert.ok(ability);
  assert.equal(await game.activateAbility(jeskai, ability), true);
  await resolveAll(game);
  adaptiveTarget = permanent(game, opponent, 'Lier, Disciple of the Drowned');
  const swords = inZone(jeskai, 'Swords to Plowshares', 'hand');
  assert.equal(await game.castSpell(jeskai, swords, { from: 'hand', free: true }), true);
  await game.resolveTop();
  assert.ok(game.stack.some(item => item.isCopy && item.card === swords));
  await resolveAll(game);
  assert.equal(adaptiveTarget.zone, 'exile');
  assert.equal(post.counters.charge, 1, 'next spell also starts rebuilding charge counters after the activation cost');

  const landscape = permanent(game, jeskai, 'Perilous Landscape');
  const basic = inZone(jeskai, 'Plains', 'library');
  const landsBefore = new Set(game.lands(jeskai));
  const landAbility = game.activatableList(jeskai).find(entry => entry.card === landscape && entry.ability);
  assert.ok(landAbility);
  assert.equal(await game.activateAbility(jeskai, landAbility), true);
  await resolveAll(game);
  assert.equal(landscape.zone, 'graveyard');
  const fetched = game.lands(jeskai).find(land => !landsBefore.has(land));
  assert.ok(fetched);
  assert.ok(['Island', 'Mountain', 'Plains'].some(type => fetched.hasSub(type)));
  assert.equal(fetched.tapped, true);
  assert.ok(['library', 'battlefield'].includes(basic.zone));
});

test('Jeskai Striker completes deterministic full games in both seats without AI fallback', { timeout: 60_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Jeskai Striker', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 270823 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Jeskai Striker', 'Turtle Power', 'Elven Council'], seed: 270824 },
  ];
  for (const scenario of scenarios) {
    const game = MTG.newGame({
      ...scenario, aiStyles: ['balanced', 'balanced', 'balanced'], difficulty: 'normal', maxTurns: 200, paced: false,
    });
    await game.start();
    assert.equal(game.gameOver, true);
    assert.ok(game.winner);
    assert.ok(game.turnNo < game.maxTurns);
    assert.equal(game.pendingTriggers.length, 0);
    const decisions = (game.aiDecisionLog || []).filter(entry => entry.playerName &&
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Jeskai Striker'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
