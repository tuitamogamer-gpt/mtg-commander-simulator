import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'declareAttackers' || q.type === 'declareBlockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
  if (q.type === 'chooseX') return q.min || 0;
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(overrides = {}, count = 3) {
  const game = new MTG.Game({ seed: 616, paced: false, maxTurns: 30 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => index === 0 && overrides[q.type]
      ? overrides[q.type](g, q)
      : defaultDecision(g, q),
  }));
  const players = controllers.map((controller, index) =>
    game.addPlayer(index ? `Opponent ${index}` : 'Doom', { name: index ? `Opp ${index}` : 'Doom Prevails' }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 4;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
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

function synthetic(player, def, zone = 'battlefield') {
  const card = new MTG.CardInst(Object.assign({
    cost: null, super: [], types: [], subtypes: [], kws: [], oracle: '',
  }, def), player);
  card.ctrl = player;
  card.zone = zone;
  return card;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 100) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 100, 'trigger/stack petlja se nije smirila');
}

test('Doom Prevails ima tačno 100 karata, 88 jedinstvenih i puni AI profil', () => {
  const deck = MTG.DECKS['Doom Prevails'];
  assert.equal(deck.commander, 'Doctor Doom, King of Latveria');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 88);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Doom Prevails').archetype, 'Villain connive control');
});

test('Doctor Doom stvarno cilja Villaina, daje menace, connive i jedan drain za land batch', async () => {
  let discardLand;
  const { game, players: [doomPlayer, oppA, oppB] } = rulesGame({
    chooseCards: (g, q) => /Connive/.test(q.prompt) ? [discardLand] : q.from.slice(0, q.min || 0),
  });
  const doom = permanent(game, doomPlayer, 'Doctor Doom, King of Latveria');
  const villain = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  const nonVillain = permanent(game, doomPlayer, 'Awesome Android');
  discardLand = inZone(doomPlayer, 'Swamp', 'hand');
  inZone(doomPlayer, 'Night\'s Whisper', 'library');
  game.recalc();

  const trigger = doom.def.triggers.find(entry => entry.on === 'beginCombat');
  const legal = game.legalTargets(trigger.targets[0], doom, doomPlayer);
  assert.equal(legal.map(card => card.iid).join(','), [doom.iid, villain.iid].join(','));
  assert.equal(legal.includes(nonVillain), false);

  await trigger.run({ g: game, src: doom, you: doomPlayer, targets: [villain], data: { player: doomPlayer } });
  await resolveAll(game);
  assert.equal(villain.kw('menace'), true);
  assert.equal(oppA.life, 38);
  assert.equal(oppB.life, 38);
  assert.equal(villain.counters['+1/+1'] || 0, 0, 'land discard ne daje connive counter');
});

test('Batroc koristi sva multikicker plaćanja i može pogoditi playera i creature metu', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({}, 2);
  const batroc = permanent(game, doomPlayer, 'Batroc the Leaper');
  const victim = permanent(game, opponent, 'Stalwart Pathlighter');
  batroc.meta.paidTimes = 2;
  game.addCounters(batroc, '+1/+1', 2, true);
  const trigger = batroc.def.triggers[0];
  const specs = trigger.targets(game, batroc, { card: batroc });
  assert.equal(specs[0].count, 2);
  await trigger.run({ g: game, src: batroc, you: doomPlayer, targets: [[opponent, victim]] });
  assert.equal(opponent.life, 36);
  assert.equal(victim.zone, 'graveyard');
});

test('Chameleon kopira ljudski izabrano stvorenje kao as-enters efekat i zadržava svoje ime', async () => {
  let wanted;
  const { game, players: [doomPlayer] } = rulesGame({
    chooseCards: (g, q) => q.aiHint?.kind === 'copyPermanent' ? [wanted] : defaultDecision(g, q),
  }, 2);
  permanent(game, doomPlayer, 'Abomination, World Ravager');
  wanted = permanent(game, doomPlayer, 'Red Ghost, Intangible Genius');
  const chameleon = new MTG.CardInst(MTG.DEFS['Chameleon, Master of Disguise'], doomPlayer);
  chameleon.zone = 'hand'; doomPlayer.hand.push(chameleon);
  await game.move(chameleon, 'battlefield', { ctrl: doomPlayer });
  assert.equal(chameleon.name, 'Chameleon, Master of Disguise');
  assert.equal(chameleon.power, wanted.power);
  assert.equal(chameleon.def.ward.mana, '{2}');
});

test('Lady Loki okida i na Villain spell, egzilira original i nudi stvarni free cast', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({
    chooseOption: (g, q) => /Lady Loki/.test(q.prompt) ? 'no' : q.options[0]?.key,
  }, 2);
  const lady = permanent(game, doomPlayer, 'Lady Loki, Agent of Chaos');
  const original = new MTG.CardInst(MTG.DEFS['Doctor Doom, King of Latveria'], doomPlayer);
  original.zone = 'stack';
  const spell = { kind: 'spell', card: original, ctrl: doomPlayer, name: original.name, targets: [], castOpts: {}, from: 'hand' };
  game.stack.push(spell);
  inZone(doomPlayer, 'Sol Ring', 'library');
  const trigger = lady.def.triggers[0];
  assert.equal(trigger.on, 'cast');
  assert.equal(trigger.filter(game, lady, { player: doomPlayer, card: original, so: spell }), true);
  await trigger.run({ g: game, src: lady, you: doomPlayer, data: { player: doomPlayer, card: original, so: spell, mv: 4 } });
  assert.equal(original.zone, 'exile');
  assert.equal(game.stack.includes(spell), false);
  assert.equal(opponent.life, 37);
});

test('Living Laser pravi sve kopije kao nonlegendary i egzilira ih tek na sljedećem end stepu', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({}, 2);
  const laser = permanent(game, doomPlayer, 'Living Laser');
  laser.attacking = opponent;
  game.combat = { attackers: [laser], defenders: new Map() };
  doomPlayer.turnState.discardedN = 5;
  await laser.def.triggers[0].run({ g: game, src: laser, you: doomPlayer, data: { card: laser } });
  const copies = game.creatures(doomPlayer).filter(card => card.isToken && card.name === 'Living Laser');
  assert.equal(copies.length, 5);
  assert.equal(copies.every(card => card.attacking === opponent && !card.cur.super.includes('Legendary')), true);
  await game.checkSBA();
  assert.equal(copies.every(card => card.zone === 'battlefield'), true, 'legend rule ne uklanja kopije');
  await game.emit('endStep', { player: opponent });
  await resolveAll(game);
  assert.equal(copies.every(card => card.zone !== 'battlefield'), true);
});

test('Moonstone drži land i spell igrivim kroz cijeli sljedeći Doomov potez u Commander podu', async () => {
  const { game, players: [doomPlayer] } = rulesGame({}, 2);
  const android = permanent(game, doomPlayer, 'Awesome Android');
  const moonstone = permanent(game, doomPlayer, 'Moonstone, Harsh Mistress');
  const swamp = inZone(doomPlayer, 'Swamp', 'graveyard');
  const island = inZone(doomPlayer, 'Island', 'graveyard');
  const spell = inZone(doomPlayer, "Night's Whisper", 'graveyard');
  doomPlayer.turnsStarted = 5;
  game.turnNo = 20;
  await android.def.triggers[0].run({ g: game, src: android, you: doomPlayer, data: { player: doomPlayer, card: swamp } });
  await moonstone.def.triggers[0].run({ g: game, src: moonstone, you: doomPlayer, data: { player: doomPlayer, card: island } });
  await moonstone.def.triggers[0].run({ g: game, src: moonstone, you: doomPlayer, data: { player: doomPlayer, card: spell } });
  assert.equal(swamp.zone, 'exile');
  assert.equal(island.zone, 'exile');
  assert.equal(game.playableLands(doomPlayer).includes(swamp), true, 'Awesome Android važi u trenutnom potezu');
  assert.equal(spell.meta.playableUntilOwnTurn, 6);

  // Tri protivnička poteza su prošla. Globalni turnNo je +4, ali tek sada
  // počinje Doomov stvarni sljedeći potez i dozvola mora još važiti.
  game.turnNo = 24;
  doomPlayer.turnsStarted = 6;
  game.turnPlayer = doomPlayer;
  game.phase = 'main1';
  doomPlayer.pool.B = 1;
  doomPlayer.pool.C = 1;
  const playable = game.playableLands(doomPlayer);
  assert.equal(playable.includes(swamp), false, 'Awesome Android dozvola je istekla');
  assert.equal(playable.includes(island), true);
  assert.equal(game.castableList(doomPlayer).some(entry => entry.card === spell && entry.from === 'exile'), true);

  game.expireOwnTurnExilePermissions(doomPlayer);
  assert.equal(game.playableLands(doomPlayer).includes(island), false);
  assert.equal(game.castableList(doomPlayer).some(entry => entry.card === spell), false);
});

test('Klaw dozvoljava land iz tuđeg face-down exilea i dobija indestructible', async () => {
  const { game, players: [doomPlayer, victim] } = rulesGame({}, 2);
  const klaw = permanent(game, doomPlayer, 'Klaw, Master of Sound');
  const stolenLand = inZone(victim, 'Island', 'library');
  await klaw.def.triggers[0].run({ g: game, src: klaw, you: doomPlayer, data: { player: victim } });
  assert.equal(game.playableLands(doomPlayer).includes(stolenLand), true);
  assert.equal(await game.playLand(doomPlayer, stolenLand), true);
  await resolveAll(game);
  assert.equal(stolenLand.ctrl, doomPlayer);
  assert.equal(stolenLand.faceDown, false);
  assert.equal(klaw.kw('indestructible'), true);
});

test('Loki i Puppet Master grupišu simultanu štetu više Villaina u po jedan trigger', async () => {
  const { game, players: [doomPlayer, victim, goader] } = rulesGame({}, 3);
  permanent(game, doomPlayer, 'Loki, the Deceiver');
  permanent(game, doomPlayer, 'Puppet Master, String Puller');
  const first = permanent(game, doomPlayer, 'Doctor Doom, King of Latveria');
  const second = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  first.attacking = victim; second.attacking = victim;
  MTG.E.goad(game, first, goader); MTG.E.goad(game, second, goader);
  game.combat = { attackers: [first, second], defenders: new Map() };
  inZone(doomPlayer, 'Swamp', 'library');
  await game.combatDamage(doomPlayer, 'normal');
  await resolveAll(game);
  assert.equal(doomPlayer.hand.length, 1, 'Loki vuče jednom za istog pogođenog igrača');
  assert.equal(game.bf().filter(card => card.ctrl === doomPlayer && card.hasSub('Treasure')).length, 1,
    'Puppet Master pravi jedan Treasure za grupu goadovanih stvorenja');
});

test('Stilt-Man koristi metu, zabranjuje sacrifice i vraća permanent tek na kraju sljedećeg tvog poteza', async () => {
  let stolen;
  const { game, players: [doomPlayer, victim] } = rulesGame({
    chooseTargets: (g, q) => q.candidates.includes(stolen) ? [stolen] : q.candidates.slice(0, q.min || 0),
  }, 2);
  const stilt = permanent(game, doomPlayer, 'Stilt-Man, Towering Terror');
  const villain = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  stolen = permanent(game, victim, 'Sol Ring');
  await game.emit('combatDamageGroupToPlayer', { player: victim, cards: [villain], hits: [{ card: villain, n: 2 }], step: 'normal' });
  await resolveAll(game);
  assert.equal(stolen.ctrl, doomPlayer);
  assert.equal(game.canSacrifice(stolen), false);

  await game.emit('endStep', { player: doomPlayer });
  await resolveAll(game);
  assert.equal(stolen.ctrl, doomPlayer, 'ne vraća se na istom end stepu');
  game.turnNo++;
  await game.emit('endStep', { player: doomPlayer });
  await resolveAll(game);
  assert.equal(stolen.ctrl, victim);
  assert.equal(game.canSacrifice(stolen), true);
  assert.equal(stilt.zone, 'battlefield');
});

test('Tri-Sentinel unearth egzilira permanent na end stepu i pri ranijem odlasku', async () => {
  const { game, players: [doomPlayer] } = rulesGame({}, 2);
  const sentinel = inZone(doomPlayer, 'Tri-Sentinel, Act of Vengeance', 'graveyard');
  sentinel.zone = 'exile'; doomPlayer.graveyard.splice(doomPlayer.graveyard.indexOf(sentinel), 1); doomPlayer.exile.push(sentinel);
  await sentinel.def.gyAbility.run({ g: game, src: sentinel, you: doomPlayer });
  assert.equal(sentinel.zone, 'battlefield');
  assert.equal(sentinel.meta.unearth, true);
  await game.destroy(sentinel);
  assert.equal(sentinel.zone, 'exile', 'unearth replacement radi i prije end stepa');
});

test('Toxic Deluge pita stvarni X, plaća ga pri castu i koristi isti X na rezoluciji', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({
    chooseX: (g, q) => q.aiHint?.kind === 'toxicDeluge' ? 3 : (q.min || 0),
  }, 2);
  const deluge = inZone(doomPlayer, 'Toxic Deluge', 'hand');
  const mine = synthetic(doomPlayer, { name: 'My 5/5', types: ['Creature'], power: '5', toughness: '5' });
  const theirs = synthetic(opponent, { name: 'Their 3/3', types: ['Creature'], power: '3', toughness: '3' });
  game.battlefield.push(mine, theirs);
  doomPlayer.pool.B = 1; doomPlayer.pool.C = 2;
  game.recalc();
  assert.equal(await game.castSpell(doomPlayer, deluge, { from: 'hand' }), true);
  assert.equal(doomPlayer.life, 37);
  assert.equal(theirs.zone, 'graveyard');
  assert.equal(mine.zone, 'battlefield');
});

test('Kang Dynasty cilja po jednog protivničkog creaturea i vuče za njegov combat damage do sljedećeg poteza', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({}, 2);
  const dynasty = permanent(game, doomPlayer, 'Kang Dynasty');
  const creature = permanent(game, opponent, 'Stalwart Pathlighter');
  const chapter = dynasty.def.saga[0];
  const specs = chapter.targets(game, dynasty);
  assert.equal(specs.length, 1);
  await chapter.run({ g: game, src: dynasty, you: doomPlayer, targets: [creature] });
  assert.equal(creature.tapped, true);
  assert.equal(game.isGoaded(creature), true);
  inZone(doomPlayer, 'Swamp', 'library');
  await game.emit('combatDamageToPlayer', { card: creature, player: doomPlayer, n: 2, step: 'normal' });
  await resolveAll(game);
  assert.equal(doomPlayer.hand.length, 1);
  doomPlayer.turnsStarted++;
  inZone(doomPlayer, 'Island', 'library');
  await game.emit('combatDamageToPlayer', { card: creature, player: doomPlayer, n: 2, step: 'normal' });
  await resolveAll(game);
  assert.equal(doomPlayer.hand.length, 1, 'draw dozvola prestaje kada počne sljedeći Doom potez');
});

test('Klaw i Extract Power drže face-down identitete skrivene osim od Doom igrača', async () => {
  const { game, players: [doomPlayer, victim, observer] } = rulesGame({}, 3);
  const klaw = permanent(game, doomPlayer, 'Klaw, Master of Sound');
  const secret = inZone(victim, 'Sol Ring', 'library');
  await klaw.def.triggers[0].run({ g: game, src: klaw, you: doomPlayer, data: { player: victim } });
  assert.equal(secret.faceDown, true);
  assert.equal(secret.meta.revealedTo.join(','), String(doomPlayer.idx));
  const doomView = MTG.createBotPlayerView(game, doomPlayer.idx);
  const victimView = MTG.createBotPlayerView(game, victim.idx);
  const observerView = MTG.createBotPlayerView(game, observer.idx);
  assert.equal(doomView.players[victim.idx].exile[0].name, 'Sol Ring');
  assert.equal(victimView.players[victim.idx].exile[0].name, 'Face-down card');
  assert.equal(observerView.players[victim.idx].exile[0].name, 'Face-down card');
});

test('Loki\'s Scepter daje privremeni Villain tip i haste pa vraća kontrolu na end stepu', async () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({}, 2);
  const scepter = permanent(game, doomPlayer, 'Loki\'s Scepter');
  const target = permanent(game, opponent, 'Stalwart Pathlighter', { sick: true });
  const trigger = scepter.def.triggers[0];
  await trigger.run({ g: game, src: scepter, you: doomPlayer, targets: [target] });
  assert.equal(target.ctrl, doomPlayer);
  assert.equal(target.hasSub('Villain'), true);
  assert.equal(target.kw('haste'), true);
  await game.emit('endStep', { player: doomPlayer });
  await resolveAll(game);
  assert.equal(target.ctrl, opponent);
  assert.equal(target.hasSub('Villain'), false);
});

test('Loki\'s Double kopira planeswalkera, nije legendary i dobija dodatni loyalty', async () => {
  let planeswalker;
  const { game, players: [doomPlayer] } = rulesGame({
    chooseCards: (g, q) => q.aiHint?.kind === 'copyPermanent' ? [planeswalker] : defaultDecision(g, q),
  }, 2);
  planeswalker = permanent(game, doomPlayer, 'Tezzeret, Betrayer of Flesh');
  const double = inZone(doomPlayer, 'Loki\'s Double', 'hand');
  await game.move(double, 'battlefield', { ctrl: doomPlayer });
  assert.equal(double.name, 'Tezzeret, Betrayer of Flesh');
  assert.equal(double.is('Planeswalker'), true);
  assert.equal(double.cur.super.includes('Legendary'), false);
  assert.equal(double.counters.loyalty, 5);
});

test('Kindred/type izbor vidi i protivničke tipove, a Banner i Hideout koriste izabranu metu', async () => {
  let chosenVillain;
  const { game, players: [doomPlayer, opponent] } = rulesGame({
    chooseOption: (g, q) => /creature type/.test(q.prompt) ? 'Elf' : q.options[0]?.key,
    chooseTargets: (g, q) => chosenVillain && q.candidates.includes(chosenVillain) ? [chosenVillain] : q.candidates.slice(0, q.min || 0),
  }, 2);
  chosenVillain = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  const otherVillain = permanent(game, doomPlayer, 'Doctor Doom, King of Latveria');
  const elf = synthetic(opponent, { name: 'Opponent Elf', types: ['Creature'], subtypes: ['Elf'], power: '2', toughness: '2' });
  game.battlefield.push(elf); game.recalc();

  const banner = inZone(doomPlayer, 'Patchwork Banner', 'hand');
  await game.move(banner, 'battlefield', { ctrl: doomPlayer });
  assert.equal(banner.meta.chosenType, 'Elf');

  const dominance = new MTG.CardInst(MTG.DEFS['Kindred Dominance'], doomPlayer);
  await dominance.def.resolve({ g: game, src: dominance, you: doomPlayer, so: { card: dominance } });
  assert.equal(elf.zone, 'battlefield');
  assert.equal(chosenVillain.zone, 'graveyard');
  assert.equal(otherVillain.zone, 'graveyard');

  const freshVillain = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  const hideout = permanent(game, doomPlayer, 'Villainous Hideout');
  const ability = hideout.def.abilities[0];
  assert.equal(game.legalTargets(ability.targets[0], hideout, doomPlayer).includes(freshVillain), true);
});

test('Age of Ultron i Kang III primjenjuju sva poglavlja sa stvarnim targetima i punim +X/+X', async () => {
  const { game, players: [doomPlayer, oppA, oppB] } = rulesGame({}, 3);
  const age = permanent(game, doomPlayer, 'Age of Ultron');
  const targetA = permanent(game, oppA, 'Stalwart Pathlighter');
  const targetB = permanent(game, oppB, 'Prowler, Clawed Thief');
  await age.def.saga[0].run({ g: game, src: age, you: doomPlayer, targets: [targetA, targetB] });
  assert.equal(targetA.zone, 'graveyard');
  assert.equal(targetB.zone, 'graveyard');
  await age.def.saga[1].run({ g: game, src: age, you: doomPlayer, targets: [] });
  const robots = game.creatures(doomPlayer).filter(card => card.hasSub('Robot') && card.hasSub('Villain'));
  assert.equal(robots.length, 2);
  await age.def.saga[2].run({ g: game, src: age, you: doomPlayer, targets: [] });
  assert.equal(robots.every(card => card.kw('deathtouch') && card.counters['+1/+1'] === 1), true);

  const dynasty = permanent(game, doomPlayer, 'Kang Dynasty');
  const boosted = permanent(game, doomPlayer, 'Doctor Doom, King of Latveria');
  inZone(doomPlayer, 'Swamp', 'hand'); inZone(doomPlayer, 'Island', 'hand');
  const before = [boosted.power, boosted.toughness];
  await dynasty.def.saga[2].run({ g: game, src: dynasty, you: doomPlayer, targets: [boosted] });
  assert.equal(boosted.power, before[0] + 2);
  assert.equal(boosted.toughness, before[1] + 2);
  assert.equal(boosted.cur.unblockable, true);
});

test('Killmonger i melee pravilno računaju artifacts/opp protiv planeswalkera', async () => {
  const { game, players: [doomPlayer, oppA, oppB] } = rulesGame({}, 3);
  const killmonger = permanent(game, doomPlayer, 'Killmonger, Ruthless Usurper');
  permanent(game, oppA, 'Sol Ring');
  const walker = permanent(game, oppA, 'Tezzeret, Betrayer of Flesh');
  const killTrigger = killmonger.def.triggers[0];
  assert.equal(killTrigger.filter(game, killmonger, { card: killmonger, defender: walker }), true);
  await killTrigger.run({ g: game, src: killmonger, you: doomPlayer, data: { card: killmonger, defender: walker } });
  assert.equal(killmonger.power, 4);

  const titania = permanent(game, doomPlayer, 'Titania, Proud Pummeler');
  const ally = permanent(game, doomPlayer, 'Prowler, Clawed Thief');
  titania.attacking = walker; ally.attacking = oppB;
  game.combat = { attackers: [titania, ally], defenders: new Map() };
  const before = [ally.power, ally.toughness];
  await titania.def.triggers[0].run({ g: game, src: titania, you: doomPlayer, data: { card: ally } });
  assert.equal(ally.power, before[0] + 2);
  assert.equal(ally.toughness, before[1] + 2);
});

test('Frightful Four prati prvog noncreature spella svakog protivnika, a Madame Hydra svaki Villain spell', async () => {
  const { game, players: [doomPlayer, oppA, oppB] } = rulesGame({}, 3);
  const four = permanent(game, doomPlayer, 'The Frightful Four');
  const instant = synthetic(oppA, { name: 'Five-mana instant', cost: '{5}', types: ['Instant'] }, 'stack');
  const trigger = four.def.triggers[0];
  for (const player of [oppA, oppB]) {
    assert.equal(trigger.filter(game, four, { player, card: instant, mv: 5, nthNonCreature: 1 }), true);
    await trigger.run({ g: game, src: four, you: doomPlayer, data: { player, card: instant, mv: 5, nthNonCreature: 1 } });
  }
  assert.equal(trigger.filter(game, four, { player: oppA, card: instant, mv: 5, nthNonCreature: 2 }), false);
  assert.equal(oppA.life, 35); assert.equal(oppB.life, 35);

  const hydra = permanent(game, doomPlayer, 'Madame Hydra');
  const villainSorcery = synthetic(doomPlayer, { name: 'Villain Scheme', types: ['Sorcery'], subtypes: ['Villain'] }, 'stack');
  assert.equal(hydra.def.triggers[0].filter(game, hydra, { player: doomPlayer, card: villainSorcery }), true);
});

test('Tombstone i Time Platform koriste legalne graveyard mete, a suspend stvarno free-casta na upkeepu', async () => {
  let graveSpell;
  const { game, players: [doomPlayer] } = rulesGame({
    chooseTargets: (g, q) => graveSpell && q.candidates.includes(graveSpell) ? [graveSpell] : q.candidates.slice(0, q.min || 0),
  }, 2);
  const tombstone = permanent(game, doomPlayer, 'Tombstone, Career Criminal');
  const villain = inZone(doomPlayer, 'Prowler, Clawed Thief', 'graveyard');
  const tombTarget = tombstone.def.triggers[0].targets[0];
  assert.equal(game.legalTargets(tombTarget, tombstone, doomPlayer).includes(villain), true);
  await tombstone.def.triggers[0].run({ g: game, src: tombstone, you: doomPlayer, targets: [villain] });
  assert.equal(villain.zone, 'hand');

  const platform = permanent(game, doomPlayer, 'Doom\'s Time Platform');
  graveSpell = inZone(doomPlayer, 'Night\'s Whisper', 'graveyard');
  const platformTrigger = platform.def.triggers[0];
  assert.equal(game.legalTargets(platformTrigger.targets[0], platform, doomPlayer).includes(graveSpell), true);
  await platformTrigger.run({ g: game, src: platform, you: doomPlayer, targets: [graveSpell] });
  assert.equal(graveSpell.zone, 'exile');
  graveSpell.meta.suspended = 1;
  inZone(doomPlayer, 'Swamp', 'library'); inZone(doomPlayer, 'Island', 'library'); inZone(doomPlayer, 'Mountain', 'library');
  const lifeBefore = doomPlayer.life;
  await game.runTurn();
  assert.equal(graveSpell.zone, 'graveyard');
  assert.equal(doomPlayer.life, lifeBefore - 2);
});

test('Glorious Purpose stavlja neuspješan pokušaj free-casta u ruku', async () => {
  const { game, players: [doomPlayer] } = rulesGame({
    chooseOption: (g, q) => /Cast for free/.test(q.prompt) ? 'yes' : q.options[0]?.key,
  }, 2);
  const purpose = permanent(game, doomPlayer, 'Glorious Purpose');
  purpose.counters.plan = 5;
  const terminate = inZone(doomPlayer, 'Terminate', 'library');
  const trigger = purpose.def.triggers[0];
  await trigger.run({ g: game, src: purpose, you: doomPlayer, data: { ctrl: doomPlayer, card: null } });
  assert.equal(purpose.zone, 'graveyard');
  assert.equal(terminate.zone, 'hand');
  assert.equal(doomPlayer.hand.includes(terminate), true);
});

test('Endless Ranks prati vlasnikovog commandera i kad ga kontroliše protivnik', () => {
  const { game, players: [doomPlayer, opponent] } = rulesGame({}, 2);
  const ranks = inZone(doomPlayer, 'Endless Ranks of HYDRA', 'graveyard');
  const commander = permanent(game, doomPlayer, 'Doctor Doom, King of Latveria');
  commander.commander = true;
  commander.ctrl = opponent;
  assert.equal(ranks.def.triggers[0].filter(game, ranks, { card: commander }), true);
  assert.equal(ranks.def.triggers[1].filter(game, ranks, { card: commander }), true);
});

test('Doom AI bira nelethalan Black Market paket, taktički Deluge X i kartu kad mu je ruka prazna', async () => {
  const { game, players: [bot, opponent] } = rulesGame({}, 2);
  bot.isAI = true;
  bot.life = 3;
  let q = {
    type: 'chooseMulti', player: bot, min: 1, max: 3,
    options: [
      { key: 't', label: 'Treasure', lifeCost: 1, benefit: 'treasure' },
      { key: 'c', label: 'Karta', lifeCost: 2, benefit: 'draw' },
      { key: 's', label: 'Shapeshifter', lifeCost: 3, benefit: 'creature' },
    ],
    aiHint: { kind: 'blackMarketConnections' },
  };
  let decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, actionWindow: q, seed: 77 });
  const selected = q.options.filter(option => decision.action.value.includes(option.key));
  assert.ok(selected.reduce((sum, option) => sum + option.lifeCost, 0) < bot.life);

  bot.life = 12;
  const mine = synthetic(bot, { name: 'Doom 6/6', types: ['Creature'], power: '6', toughness: '6' });
  const theirs = synthetic(opponent, { name: 'Threat 3/3', types: ['Creature'], power: '3', toughness: '3' });
  game.battlefield.push(mine, theirs); game.recalc();
  q = { type: 'chooseX', player: bot, min: 0, max: 12, thresholds: [3, 6], src: new MTG.CardInst(MTG.DEFS['Toxic Deluge'], bot), aiHint: { kind: 'toxicDeluge' } };
  decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, actionWindow: q, seed: 77 });
  assert.equal(decision.action.value, 3);

  q = {
    type: 'chooseOption', player: bot,
    options: [{ key: 't', label: 'Treasure' }, { key: 'd', label: 'Karta' }, { key: 'b', label: 'Drain 2' }],
    aiHint: { kind: 'typhoidMary' },
  };
  decision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, actionWindow: q, seed: 77 });
  assert.equal(decision.action.value, 'd');
});
