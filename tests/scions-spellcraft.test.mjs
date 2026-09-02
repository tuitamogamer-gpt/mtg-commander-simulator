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
  const game = new MTG.Game({ seed: 814310, paced: false, maxTurns: 100 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q),
  }));
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Scions',
    { name: index ? `Opp ${index}` : 'Scions & Spellcraft' },
    controllers[index], index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 12;
  game.phase = 'main1';
  game.step = 'main';
  game.priorityRound = async () => {};
  return { game, players, controllers };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
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

function tokenCount(game, player, subtype) {
  return game.bf().filter(card => card.ctrl === player && card.isToken && (!subtype || card.hasSub(subtype))).length;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 500) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 500, 'Scions trigger/stack petlja se nije smirila');
}

test('Scions & Spellcraft ima službenih 100 karata, 92 jedinstvene i kompletan AI profil', () => {
  const deck = MTG.DECKS['Scions & Spellcraft'];
  assert.equal(deck.commander, "Y'shtola, Night's Blessed");
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 92);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  const profile = MTG.getDeckAIProfile('Scions & Spellcraft');
  assert.match(profile.archetype, /spell/i);
  assert.ok(profile.primarySynergies.includes('spellslinger'));
});

test("Y'shtola nanosi damage svakom protivniku, dobija život i vuče na 4+ izgubljena života", async () => {
  const { game, players: [scions, one, two] } = rulesGame([], 3);
  const yshtola = permanent(game, scions, "Y'shtola, Night's Blessed", { commander: true });
  const calls = [];
  const damagePlayer = game.damagePlayer.bind(game);
  game.damagePlayer = async (source, player, amount, opts) => {
    calls.push({ source, player, amount });
    return damagePlayer(source, player, amount, opts);
  };
  const spell = inZone(scions, 'Vindicate', 'hand');
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 3 });
  await resolveAll(game);
  assert.deepEqual(calls.map(call => [call.source, call.player, call.amount]), [[yshtola, one, 2], [yshtola, two, 2]]);
  assert.equal(scions.life, 42);
  one.turnState.lifeLost = 4;
  inZone(scions, 'Island', 'library');
  await game.emit('endStep', { player: scions });
  await resolveAll(game);
  assert.equal(scions.hand.some(card => card.name === 'Island'), true);
});

test("G'raha jednom po potezu plaća tačan MV i pravi Hero token sa X countera", async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  permanent(game, scions, "G'raha Tia, Scion Reborn");
  const spell = inZone(scions, 'Vindicate', 'hand');
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 3 });
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 3 });
  await resolveAll(game);
  const heroes = game.creatures(scions).filter(card => card.isToken && card.hasSub('Hero'));
  assert.equal(heroes.length, 1);
  assert.equal(heroes[0].counters['+1/+1'], 3);
  assert.equal(scions.life, 37);
});

test('Papalymo tjera samo pogođene protivnike da žrtvuju stvorenje najveće snage', async () => {
  const { game, players: [scions, hit, safe] } = rulesGame([], 3);
  const papalymo = permanent(game, scions, 'Papalymo Totolymo');
  permanent(game, hit, 'Baleful Strix');
  const greatest = permanent(game, hit, 'Torrential Gearhulk');
  const survivor = permanent(game, safe, 'Torrential Gearhulk');
  hit.turnState.lifeLost = 1;
  await papalymo.def.abilities[0].run({ g: game, src: papalymo, you: scions });
  assert.equal(greatest.zone, 'graveyard');
  assert.equal(survivor.zone, 'battlefield');
});

test('Fandaniel AI bira manju štetu između nontoken žrtve i gubitka života', async () => {
  const { game, players: [scions, bot] } = rulesGame([], 2);
  bot.isAI = true;
  const cheap = permanent(game, bot, 'Baleful Strix');
  let choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814311,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'sac', label: 'Žrtvuj' }, { key: 'life', label: 'Izgubi život' }],
      aiHint: { kind: 'fandanielChoice', lifeLoss: 12, candidates: [cheap] },
    },
  });
  assert.equal(choice.action.value, 'sac');
  choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814312,
    actionWindow: {
      type: 'chooseOption', options: [{ key: 'sac', label: 'Žrtvuj' }, { key: 'life', label: 'Izgubi život' }],
      aiHint: { kind: 'fandanielChoice', lifeLoss: 2, candidates: [cheap] },
    },
  });
  assert.equal(choice.action.value, 'life');
  assert.ok(scions);
});

test('Thancred i Hraesvelgr efekti ne vraćaju se na novi permanent poslije zone changea', async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  const legend = permanent(game, scions, 'Alisaie Leveilleur');
  const thancred = permanent(game, scions, 'Thancred Waters');
  await thancred.def.triggers[0].run({ g: game, src: thancred, you: scions, targets: [legend] });
  assert.equal(legend.kw('indestructible'), true);
  await game.move(legend, 'hand');
  await game.move(legend, 'battlefield', { ctrl: scions });
  assert.equal(legend.kw('indestructible'), false);

  const hraesvelgr = permanent(game, scions, 'Hraesvelgr of the First Brood');
  await hraesvelgr.def.triggers[0].run({ g: game, src: hraesvelgr, you: scions, targets: [legend] });
  assert.equal(legend.cur.unblockable, true);
  await game.move(legend, 'hand');
  await game.move(legend, 'battlefield', { ctrl: scions });
  assert.equal(legend.cur.unblockable, false);
});

test('Torrential Gearhulk cilja i baca stvarnu instant kartu besplatno te je egzilira i kod countera', async () => {
  const { game, players: [scions, opponent] } = rulesGame([], 2);
  const target = permanent(game, opponent, 'Baleful Strix');
  const instant = inZone(scions, 'Swords to Plowshares', 'graveyard');
  const gearhulk = permanent(game, scions, 'Torrential Gearhulk');
  await game.emit('etb', { card: gearhulk, ctrl: scions });
  await game.flushTriggers();
  await game.resolveTop();
  const spell = game.stack.find(item => item.card === instant);
  assert.ok(spell);
  assert.equal(spell.targets[0], target);
  game.stack.splice(game.stack.indexOf(spell), 1);
  await game.move(instant, 'graveyard');
  assert.equal(instant.zone, 'exile');
});

test('Emet-Selch zaključava graveyard metu, daje {2} popusta i egzilira stvarni spell', async () => {
  let wanted;
  const { game, players: [scions, opponent] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  permanent(game, scions, 'Emet-Selch of the Third Seat');
  const spell = inZone(scions, 'Vindicate', 'graveyard');
  const target = permanent(game, opponent, 'Arcane Signet');
  wanted = target;
  scions.pool.W = 1; scions.pool.B = 1;
  assert.equal(game.spellCost(scions, spell, { from: 'graveyard' }).generic, 0);
  await game.emit('lifeLost', { player: opponent, n: 1 });
  await game.flushTriggers();
  await game.resolveTop();
  const stackSpell = game.stack.find(item => item.card === spell);
  assert.ok(stackSpell);
  assert.equal(stackSpell.targets[0], target);
  await resolveAll(game);
  assert.equal(spell.zone, 'exile');
  assert.equal(target.zone, 'graveyard');
});

test('Krile bira target pri triggeru i vraća samo creature istog mana valuea', async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  permanent(game, scions, 'Krile Baldesion');
  const creature = inZone(scions, 'Baleful Strix', 'graveyard');
  inZone(scions, 'Torrential Gearhulk', 'graveyard');
  const spell = inZone(scions, 'Arcane Signet', 'hand');
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 2 });
  await resolveAll(game);
  assert.equal(creature.zone, 'hand');
});

test('Job select poštuje token replacement i Planisphere vidi noncreature cast i treći draw', async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  permanent(game, scions, 'Adrix and Nev, Twincasters');
  const planisphere = inZone(scions, "Astrologian's Planisphere", 'hand');
  await game.move(planisphere, 'battlefield', { ctrl: scions });
  await resolveAll(game);
  const heroes = game.creatures(scions).filter(card => card.isToken && card.hasSub('Hero'));
  assert.equal(heroes.length, 2);
  const host = game.byIid(planisphere.attachedTo);
  assert.ok(heroes.includes(host));
  const otherHero = heroes.find(card => card !== host);
  const spell = inZone(scions, 'Arcane Signet', 'hand');
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 2 });
  await game.flushTriggers();
  await game.attach(planisphere, otherHero);
  await resolveAll(game);
  assert.equal(host.counters['+1/+1'], 1);
  assert.equal(otherHero.counters['+1/+1'] || 0, 0);
  await game.attach(planisphere, host);
  scions.turnState.drewThisTurn = 2;
  inZone(scions, 'Island', 'library');
  await game.draw(scions, 1);
  await resolveAll(game);
  assert.equal(host.counters['+1/+1'], 2);
});

test("Blue Mage's Cane cilja groblje branioca, egzilira original i kopiju baca za {3}", async () => {
  let wanted;
  const { game, players: [scions, defender] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const cane = permanent(game, scions, "Blue Mage's Cane");
  const attacker = permanent(game, scions, 'Baleful Strix');
  await game.attach(cane, attacker);
  attacker.attacking = defender;
  const original = inZone(defender, 'Cut a Deal', 'graveyard');
  wanted = original;
  scions.pool.C = 3;
  await game.emit('attacks', { card: attacker });
  await game.flushTriggers();
  await game.resolveTop();
  assert.equal(original.zone, 'exile');
  const copySpell = game.stack.find(item => item.card?.isCopySpell && item.name === 'Cut a Deal');
  assert.ok(copySpell);
  await resolveAll(game);
  assert.equal(copySpell.card.zone, 'ceased');
});

test("Sage's Nouliths bira target attacking creature umjesto automatskog prvog", async () => {
  let wanted;
  const { game, players: [scions, defender] } = rulesGame([
    (g, q) => q.type === 'chooseTargets' && q.candidates.includes(wanted) ? [wanted] : defaultDecision(g, q),
  ], 2);
  const nouliths = permanent(game, scions, "Sage's Nouliths");
  const equipped = permanent(game, scions, 'Baleful Strix');
  wanted = permanent(game, scions, 'Alisaie Leveilleur');
  await game.attach(nouliths, equipped);
  equipped.attacking = defender; equipped.tapped = true;
  wanted.attacking = defender; wanted.tapped = true;
  game.combat = { attackers: [equipped, wanted] };
  await game.emit('attacks', { card: equipped });
  await resolveAll(game);
  assert.equal(wanted.tapped, false);
  assert.equal(equipped.tapped, true);
});

test('oba Scions Partner with ETB-a ciljaju bilo kojeg igrača, taj igrač bira pretragu i shuffle', async () => {
  for (const [sourceName, partnerName] of [
    ['Alisaie Leveilleur', 'Alphinaud Leveilleur'],
    ['Alphinaud Leveilleur', 'Alisaie Leveilleur'],
  ]) {
    let recipient;
    let asked = false;
    const { game, players: [scions, other], controllers } = rulesGame([
      (g, q) => q.type === 'chooseTargets' && q.prompt?.includes('Who may search for') ? [recipient] : defaultDecision(g, q),
      (g, q) => {
        if (q.aiHint?.kind === 'partnerSearch') { asked = true; return 'yes'; }
        return defaultDecision(g, q);
      },
    ], 2);
    recipient = other;
    const partner = inZone(other, partnerName, 'library');
    const source = inZone(scions, sourceName, 'hand');
    controllers[0].decide = async (g, q) => q.type === 'chooseTargets' && q.prompt?.includes('Who may search for')
      ? [recipient] : defaultDecision(g, q);
    await game.move(source, 'battlefield', { ctrl: scions });
    await resolveAll(game);
    assert.equal(asked, true, `${sourceName} pita ciljanog igrača`);
    assert.equal(other.hand.includes(partner), true, `${partnerName} ide u ruku ciljanog igrača`);
    assert.equal(scions.hand.includes(partner), false);
  }
});

test("Archaeomancer's Map stavlja oba pronađena Plainsa u ruku", async () => {
  const { game, players: [scions] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.search ? [q.from[0]] : defaultDecision(g, q),
  ], 2);
  inZone(scions, 'Plains', 'library');
  inZone(scions, 'Plains', 'library');
  const map = permanent(game, scions, "Archaeomancer's Map");
  await game.emit('etb', { card: map, ctrl: scions });
  await resolveAll(game);
  assert.equal(scions.hand.filter(card => card.hasSub('Plains')).length, 2);
  assert.equal(game.lands(scions).length, 0);
});

test('Transpose draw-discarduje, gubi 1 i pravi Wizard samo kada je castan iz ruke', async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  inZone(scions, 'Island', 'library');
  const discard = inZone(scions, 'Swamp', 'hand');
  const transpose = new MTG.CardInst(MTG.DEFS.Transpose, scions);
  await transpose.def.resolve({ g: game, src: transpose, you: scions, so: { from: 'hand' } });
  assert.equal(scions.life, 39);
  assert.equal(scions.graveyard.includes(discard), true);
  assert.equal(tokenCount(game, scions, 'Wizard'), 1);
  inZone(scions, 'Island', 'library');
  inZone(scions, 'Swamp', 'hand');
  await transpose.def.resolve({ g: game, src: transpose, you: scions, so: { from: 'exile' } });
  assert.equal(tokenCount(game, scions, 'Wizard'), 1);
});

test('Tataru pravi tapped Treasure kada protivnik vuče van svog poteza i samo jednom po potezu', async () => {
  const { game, players: [scions, opponent] } = rulesGame([], 2);
  permanent(game, scions, 'Tataru Taru');
  inZone(opponent, 'Island', 'library');
  inZone(opponent, 'Swamp', 'library');
  await game.draw(opponent, 2);
  await resolveAll(game);
  const treasures = game.bf().filter(card => card.ctrl === scions && card.hasSub('Treasure'));
  assert.equal(treasures.length, 1);
  assert.equal(treasures[0].tapped, true);
});

test('Eye of Nidhogg kontinuirano pravi crnog 4/2 Dragona, a Observed Stasis gasi sve sposobnosti', async () => {
  const { game, players: [scions, opponent] } = rulesGame([], 2);
  const eye = permanent(game, scions, 'Eye of Nidhogg');
  const target = permanent(game, opponent, 'Papalymo Totolymo');
  await game.attach(eye, target);
  assert.equal(target.power, 4); assert.equal(target.toughness, 2);
  assert.deepEqual([...target.colors], ['B']);
  assert.deepEqual([...target.cur.subtypes], ['Dragon']);
  assert.equal(target.kw('flying'), true); assert.equal(target.kw('deathtouch'), true);
  assert.equal(game.goadersOf(target).includes(scions), true);

  const stasis = permanent(game, scions, 'Observed Stasis');
  await game.attach(stasis, target);
  assert.equal(target.cur.abilitiesDisabled, true);
  assert.equal(target.cur.activationDisabled, true);
  const before = scions.life;
  const spell = inZone(opponent, 'Arcane Signet', 'hand');
  await game.emit('castNonCreature', { player: opponent, card: spell, mv: 2 });
  await resolveAll(game);
  assert.equal(scions.life, before, 'Papalymov trigger je ugašen');
});

test('Snuff Out nudi Swamp alternativu, plaća 4 života i onemogućava regeneraciju', async () => {
  const { game, players: [scions, opponent] } = rulesGame([], 2);
  permanent(game, scions, 'Swamp');
  const target = permanent(game, opponent, 'Alisaie Leveilleur');
  target.regenShield = 1;
  const snuff = inZone(scions, 'Snuff Out', 'hand');
  const action = game.castableList(scions).find(entry => entry.card === snuff && entry.alt?.lifeCost === 4);
  assert.ok(action);
  assert.equal(await game.castSpell(scions, snuff, { from: 'hand', alt: action.alt }), true);
  await resolveAll(game);
  assert.equal(scions.life, 36);
  assert.equal(target.zone, 'graveyard');
});

test('Crux/Cleansing AI biraju board-aware wipe mod, a Final Judgment egzilira simultano', async () => {
  const { game, players: [bot, opponent] } = rulesGame([], 2);
  bot.isAI = true;
  permanent(game, bot, 'Hraesvelgr of the First Brood');
  permanent(game, opponent, 'Baleful Strix');
  permanent(game, opponent, 'Alisaie Leveilleur');
  let choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814313,
    actionWindow: {
      type: 'chooseOption', options: [
        { key: '0', label: 'Zmajevi', destroyKind: 'dragons' },
        { key: '1', label: 'Ne-Zmajevi', destroyKind: 'nondragons' },
      ], aiHint: { kind: 'scionsWipe' },
    },
  });
  assert.equal(choice.action.value, '1');
  permanent(game, opponent, 'Arcane Signet');
  permanent(game, opponent, 'Authority of the Consuls');
  choice = await MTG.chooseBotAction({
    gameState: game, botPlayerId: bot.idx, seed: 814314,
    actionWindow: {
      type: 'chooseOption', options: [
        { key: '0', label: 'Stvorenja', destroyKind: 'creatures' },
        { key: '1', label: 'Artefakti/enchantmenti', destroyKind: 'artifactsEnchantments' },
      ], aiHint: { kind: 'scionsWipe' },
    },
  });
  assert.ok(['0', '1'].includes(choice.action.value));
  const judgment = new MTG.CardInst(MTG.DEFS['Final Judgment'], bot);
  await judgment.def.resolve({ g: game, src: judgment, you: bot });
  assert.equal(game.bf().some(card => card.is('Creature')), false);
  assert.ok(bot.exile.concat(opponent.exile).some(card => card.name === 'Hraesvelgr of the First Brood'));
});

test('Good King Mog kopira izabrani token samo tokom II/III turna', async () => {
  let wanted;
  const { game, players: [scions] } = rulesGame([
    (g, q) => q.type === 'chooseCards' && q.aiHint?.kind === 'scionsCopyToken' ? [wanted] : defaultDecision(g, q),
  ], 2);
  const mog = permanent(game, scions, 'Summon: Good King Mog XII');
  const moogle = (await game.makeTokens('moogle12', scions))[0];
  wanted = (await game.makeTokens('treasure', scions))[0];
  scions.turnsStarted = 4;
  await mog.def.saga[1].run({ g: game, src: mog, you: scions });
  const spell = inZone(scions, 'Arcane Signet', 'hand');
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 2 });
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.ctrl === scions && card.hasSub('Treasure')).length, 2);
  scions.turnsStarted = 5;
  await game.emit('castNonCreature', { player: scions, card: spell, mv: 2 });
  await resolveAll(game);
  assert.equal(game.bf().filter(card => card.ctrl === scions && card.hasSub('Treasure')).length, 2);
  assert.ok(moogle);
});

test('Urianger opcionalno skriva vrh, kasnije dozvoljava land/spell uz {2} popusta i gain iz egzila', async () => {
  const { game, players: [scions] } = rulesGame([], 2);
  const urianger = permanent(game, scions, 'Urianger Augurelt');
  const land = inZone(scions, 'Island', 'library');
  await urianger.def.abilities[0].run({ g: game, src: urianger, you: scions });
  assert.equal(land.zone, 'exile'); assert.equal(land.faceDown, true);
  await urianger.def.abilities[1].run({ g: game, src: urianger, you: scions });
  assert.equal(game.playableLands(scions).includes(land), true);
  const life = scions.life;
  await game.playLand(scions, land);
  await resolveAll(game);
  assert.equal(scions.life, life + 2);

  const spell = inZone(scions, 'Vindicate', 'exile');
  spell.faceDown = true; spell.meta.revealedTo = [scions.idx];
  urianger.meta.arc.push(spell.iid);
  urianger.tapped = false;
  await urianger.def.abilities[1].run({ g: game, src: urianger, you: scions });
  assert.equal(game.spellCost(scions, spell, { from: 'exile' }).generic, 0);
});

test('White Auracite ima obaveznu metu i vraća samo permanent vezan za isti battlefield objekat', async () => {
  const { game, players: [scions, opponent] } = rulesGame([], 2);
  const target = permanent(game, opponent, 'Arcane Signet');
  const auracite = inZone(scions, 'White Auracite', 'hand');
  assert.equal(auracite.def.triggers[0].targets[0].upTo, undefined);
  await game.move(auracite, 'battlefield', { ctrl: scions });
  await resolveAll(game);
  assert.equal(target.zone, 'exile');
  const oldTimestamp = auracite.timestamp;
  await game.move(auracite, 'graveyard');
  await resolveAll(game);
  assert.equal(target.zone, 'battlefield');
  assert.notEqual(auracite.timestamp, undefined);
  assert.equal(oldTimestamp, game.snapshot(auracite).timestamp);

  // Ako Auracite napusti pa se vrati prije nego što njegov stari ETB trigger
  // riješi, taj trigger pripada starom objektu i ne smije ništa egzilirati.
  const blinkAuracite = permanent(game, scions, 'White Auracite');
  const trigger = blinkAuracite.def.triggers[0];
  const ctx = { g: game, src: blinkAuracite, you: scions, targets: [target] };
  await trigger.prepareTargets(ctx);
  const triggerTimestamp = ctx.sourceTimestamp;
  await game.move(blinkAuracite, 'hand');
  await game.move(blinkAuracite, 'battlefield', { ctrl: scions });
  assert.notEqual(blinkAuracite.timestamp, triggerTimestamp);
  await trigger.run(ctx);
  assert.equal(target.zone, 'battlefield');
});

test('Choked Estuary i Port Town poštuju ljudsku reveal odluku', async () => {
  for (const [landName, revealName] of [['Choked Estuary', 'Island'], ['Port Town', 'Plains']]) {
    const tappedGame = rulesGame([
      (g, q) => q.aiHint?.kind === 'revealLand' ? [] : defaultDecision(g, q),
    ], 2);
    inZone(tappedGame.players[0], revealName, 'hand');
    const tapped = inZone(tappedGame.players[0], landName, 'hand');
    await tappedGame.game.move(tapped, 'battlefield', { ctrl: tappedGame.players[0] });
    assert.equal(tapped.tapped, true);

    const openGame = rulesGame([
      (g, q) => q.aiHint?.kind === 'revealLand' ? [q.from[0]] : defaultDecision(g, q),
    ], 2);
    inZone(openGame.players[0], revealName, 'hand');
    const untapped = inZone(openGame.players[0], landName, 'hand');
    await openGame.game.move(untapped, 'battlefield', { ctrl: openGame.players[0] });
    assert.equal(untapped.tapped, false);
  }
});

test('Scions završava pune determinističke partije kao prvi deck i kao AI protivnik bez fallbacka', { timeout: 70_000 }, async () => {
  const scenarios = [
    { humanDeck: 'Scions & Spellcraft', aiDecks: ['Doom Prevails', 'Turtle Power', 'Elven Council'], seed: 814315 },
    { humanDeck: 'Doom Prevails', aiDecks: ['Scions & Spellcraft', 'Turtle Power', 'Elven Council'], seed: 814316 },
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
      game.players.some(player => player.name === entry.playerName && player.deckName === 'Scions & Spellcraft'));
    assert.equal(decisions.some(entry => entry.fallback), false);
  }
});
