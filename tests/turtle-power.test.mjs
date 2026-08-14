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

function rulesGame(overrides = {}, count = 4) {
  const game = new MTG.Game({ seed: 140826, paced: false, maxTurns: 30 });
  const controllers = Array.from({ length: count }, (_, index) => ({
    decide: async (g, q) => index === 0 && overrides[q.type]
      ? overrides[q.type](g, q)
      : defaultDecision(g, q),
  }));
  const players = controllers.map((controller, index) =>
    game.addPlayer(index ? `Opponent ${index}` : 'TMNT', { name: index ? `Opp ${index}` : 'Turtle Power' }, controller, index > 0));
  game.turnPlayer = players[0];
  game.turnNo = 6;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players, controllers };
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
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 120) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 120, 'trigger/stack petlja se nije smirila');
}

test('Turtle Power ima tačno 100 karata, 93 jedinstvene i puni AI profil', () => {
  const deck = MTG.DECKS['Turtle Power'];
  assert.equal(deck.commander, 'Heroes in a Half Shell');
  assert.equal(deck.cards.reduce((sum, entry) => sum + entry.n, 0), 100);
  assert.equal(deck.cards.length, 93);
  assert.equal(deck.cards.every(entry => MTG.DEFS[entry.name] && !MTG.DEFS[entry.name].simplified), true);
  assert.equal(MTG.getDeckAIProfile('Turtle Power').archetype, 'Five-color counters and tokens');
});

test('Heroes grupiše simultane pogotke, counteruje svaku TMNT kartu i ponavlja se u double-strike koraku', async () => {
  const { game, players: [tmnt, victim] } = rulesGame({}, 2);
  permanent(game, tmnt, 'Heroes in a Half Shell');
  const leo = permanent(game, tmnt, 'Leonardo, the Balance');
  const raphael = permanent(game, tmnt, 'Raphael, the Muscle');
  inZone(tmnt, 'Forest', 'library');
  inZone(tmnt, 'Island', 'library');

  for (const step of ['first', 'normal']) {
    await game.emit('combatDamageGroupToPlayer', {
      player: victim, cards: [leo, raphael], hits: [{ card: leo, n: 4 }, { card: raphael, n: 5 }], step,
    });
    await resolveAll(game);
  }
  assert.equal(leo.counters['+1/+1'], 2);
  assert.equal(raphael.counters['+1/+1'], 2);
  assert.equal(tmnt.hand.length, 2, 'vuče jednom po damage koraku, ne jednom po stvorenju ili potezu');
});

test('Partner with cilja bilo kojeg igrača i taj igrač odlučuje da li traži imenovanog partnera', async () => {
  const { game, players: [tmnt, recipient], controllers } = rulesGame({}, 2);
  const bebop = permanent(game, tmnt, 'Bebop, Skull & Crossbones');
  const rocksteady = inZone(recipient, 'Rocksteady, Mutant Marauder', 'library');
  let askedRecipient = false;
  controllers[1].decide = async (g, q) => {
    if (q.aiHint?.kind === 'partnerSearch') { askedRecipient = true; return 'yes'; }
    return defaultDecision(g, q);
  };
  const trigger = bebop.def.triggers[0];
  assert.equal(game.legalTargets(trigger.targets[0], bebop, tmnt).map(player => player.idx).join(','), '0,1');
  await trigger.run({ g: game, src: bebop, you: tmnt, targets: [recipient] });
  assert.equal(askedRecipient, true);
  assert.equal(recipient.hand.includes(rocksteady), true);
  assert.equal(tmnt.hand.includes(rocksteady), false);
});

test('Dimension X Pizzasaur pravi zaseban target trigger i smije uništiti vlastito stvorenje', async () => {
  let wanted;
  const { game, players: [tmnt] } = rulesGame({
    chooseTargets: (g, q) => q.candidates.includes(wanted) ? [wanted] : q.candidates.slice(0, q.min || 0),
  }, 2);
  const pizzasaur = permanent(game, tmnt, 'Dimension X Pizzasaur');
  const buffed = permanent(game, tmnt, 'Lita, Little Orphan Amphibian');
  wanted = permanent(game, tmnt, 'Bebop, Skull & Crossbones');
  await pizzasaur.def.triggers[0].run({ g: game, src: pizzasaur, you: tmnt, targets: [buffed] });
  assert.equal(game.pendingTriggers.length, 1, 'reflexive "when you do" ide kao zaseban trigger');
  await resolveAll(game);
  assert.equal(wanted.zone, 'graveyard');
});

test('Electric Seaweed zadržava LKI izvor i nakon odlaska sa battlefielda', async () => {
  const { game, players: [tmnt, opponent] } = rulesGame({}, 2);
  const seaweed = permanent(game, tmnt, 'Electric Seaweed');
  const victim = permanent(game, opponent, 'Lita, Little Orphan Amphibian');
  const survivor = synthetic(opponent, { name: 'Seaweed survivor', types: ['Creature'], power: '2', toughness: '3' });
  game.battlefield.push(survivor); game.recalc();
  await seaweed.def.triggers[0].run({ g: game, src: seaweed, you: tmnt });
  await game.destroy(victim);
  await game.destroy(seaweed);
  await resolveAll(game);
  assert.equal(survivor.damage, 1);
});

test('Irma ne može ciljati samu sebe, kopira drugo stvorenje i zadržava svoj identitet', async () => {
  const { game, players: [tmnt] } = rulesGame({}, 2);
  const irma = permanent(game, tmnt, 'Irma, Part-Time Mutant');
  const target = permanent(game, tmnt, 'Leatherhead, Iron Gator');
  const trigger = irma.def.triggers[0];
  const specs = trigger.targets(game, irma, { player: tmnt });
  assert.equal(game.legalTargets(specs[0], irma, tmnt).map(card => card.iid).join(','), String(target.iid));
  await trigger.run({ g: game, src: irma, you: tmnt, targets: [target] });
  assert.equal(irma.name, 'Irma, Part-Time Mutant');
  assert.equal(irma.power, target.power + 1);
  assert.equal(irma.kw('trample'), true);
});

test('Leonardo može odbiti prvi token trigger i iskoristiti kasniji u istom potezu', async () => {
  let offers = 0;
  const { game, players: [tmnt] } = rulesGame({
    chooseOption: (g, q) => q.aiHint?.kind === 'optTrigger' ? (++offers === 1 ? 'no' : 'yes') : q.options[0]?.key,
  }, 2);
  const leonardo = permanent(game, tmnt, 'Leonardo, the Balance');
  await game.emit('tokensCreated', { ctrl: tmnt, tokens: [] });
  await resolveAll(game);
  assert.equal(leonardo.counters['+1/+1'] || 0, 0);
  await game.emit('tokensCreated', { ctrl: tmnt, tokens: [] });
  await resolveAll(game);
  assert.equal(leonardo.counters['+1/+1'], 1);
  assert.equal(offers, 2);
});

test('Evolve ponovo provjerava veću snagu/izdržljivost pri rezoluciji', async () => {
  const { game, players: [tmnt] } = rulesGame({}, 2);
  const ray = permanent(game, tmnt, 'Ray Fillet, Wave Warrior');
  const entrant = permanent(game, tmnt, 'Leatherhead, Iron Gator');
  await game.emit('etb', { card: entrant });
  ray.counters['+1/+1'] = 8;
  game.recalc();
  await resolveAll(game);
  assert.equal(ray.counters['+1/+1'], 8, 'intervening-if je postao netačan prije rezolucije');
});

test('Shredder pravi nonlegendary kopije i žrtvuje ih na kraju combata umjesto egzila', async () => {
  const { game, players: [tmnt, firstVictim] } = rulesGame({}, 4);
  const shredder = permanent(game, tmnt, 'Shredder, Shadow Master');
  shredder.attacking = firstVictim;
  await shredder.def.triggers[0].run({ g: game, src: shredder, you: tmnt });
  const copies = game.bf().filter(card => card.isToken && card.name === shredder.name);
  assert.equal(copies.length, 2);
  assert.equal(copies.every(card => !card.def.super.includes('Legendary')), true);
  await game.checkSBA();
  assert.equal(copies.every(card => card.zone === 'battlefield'), true);
  await game.endCombatStep(tmnt);
  assert.equal(copies.every(card => card.zone === 'ceased'), true);
  assert.equal(copies.every(card => !card.meta.exileEndCombat), true);
});

test('Heralds of the Shredder se miješa u biblioteku i nakon milla i nakon discarda', async () => {
  const { game, players: [tmnt] } = rulesGame({}, 2);
  const milled = inZone(tmnt, 'Heralds of the Shredder', 'library');
  await game.mill(tmnt, 1);
  await resolveAll(game);
  assert.equal(milled.zone, 'library');
  const discarded = inZone(tmnt, 'Heralds of the Shredder', 'hand');
  await game.discard(tmnt, [discarded]);
  await resolveAll(game);
  assert.equal(discarded.zone, 'library');
});

test('Aggro Amalgam bira mod i fight metu dok trigger ide na stack', async () => {
  let target;
  const { game, players: [tmnt, opponent] } = rulesGame({
    chooseOption: (g, q) => q.aiHint?.kind === 'aggroAmalgam' ? '1' : q.options[0]?.key,
    chooseTargets: (g, q) => q.candidates.includes(target) ? [target] : q.candidates.slice(0, q.min || 0),
  }, 2);
  const hydra = permanent(game, tmnt, 'Aggro Amalgam');
  hydra.counters['+1/+1'] = 3;
  target = synthetic(opponent, { name: 'Target 2/2', types: ['Creature'], power: '2', toughness: '2' });
  game.battlefield.push(target); game.recalc();
  await game.emit('etb', { card: hydra });
  await game.flushTriggers();
  assert.equal(game.stack.at(-1).mode, 1);
  assert.equal(game.stack.at(-1).ctx.targets[0], target);
  await game.resolveTop();
  assert.equal(target.zone, 'graveyard');
  assert.equal(hydra.zone, 'battlefield');
});

test('Aggro Amalgam ne nudi fight mod bez legalne mete', async () => {
  let offered;
  const { game, players: [tmnt] } = rulesGame({
    chooseOption: (g, q) => {
      if (q.aiHint?.kind === 'aggroAmalgam') offered = q.options.map(option => option.key);
      return q.options[0]?.key;
    },
  }, 2);
  const hydra = permanent(game, tmnt, 'Aggro Amalgam');
  await game.emit('etb', { card: hydra });
  await game.flushTriggers();
  assert.equal(offered.join(','), '0');
  assert.equal(game.stack.at(-1).mode, 0);
});

test('Continue? cilja samo konkretne creature karte koje su umrle ovaj potez', async () => {
  const { game, players: [tmnt] } = rulesGame({}, 2);
  const oldCopy = inZone(tmnt, 'Lita, Little Orphan Amphibian', 'graveyard');
  const died = permanent(game, tmnt, 'Lita, Little Orphan Amphibian');
  await game.destroy(died);
  const spell = inZone(tmnt, 'Continue?', 'hand');
  const specs = spell.def.targets(game, spell);
  assert.equal(game.legalTargets(specs[0], spell, tmnt).map(card => card.iid).join(','), String(died.iid));
  await spell.def.resolve({ g: game, src: spell, you: tmnt, targets: [[died]] });
  assert.equal(died.zone, 'battlefield');
  assert.equal(oldCopy.zone, 'graveyard');
});

test('Double Jump nudi lijevu polovinu, Flying Kick i Fuse kao tri legalna cast izbora', () => {
  const { game, players: [tmnt, opponent] } = rulesGame({}, 2);
  const card = inZone(tmnt, 'Double Jump', 'hand');
  permanent(game, tmnt, 'Lita, Little Orphan Amphibian');
  permanent(game, opponent, 'Stalwart Pathlighter');
  tmnt.pool.U = 1; tmnt.pool.R = 1; tmnt.pool.C = 2;
  game.recalc();
  const entries = game.castableList(tmnt).filter(entry => entry.card === card);
  assert.equal(entries.length, 3);
  assert.equal(entries.map(entry => entry.alt?.name || 'Double Jump').join('|'),
    'Double Jump|Flying Kick|Double Jump // Flying Kick');
});

test('Flying Kick se baca samostalno, a Fuse prvo napravi 5/5 pa tom snagom udara', async () => {
  const first = rulesGame({
    chooseTargets: (g, q) => [q.candidates[0]],
  }, 2);
  const [tmnt, opponent] = first.players;
  const kick = inZone(tmnt, 'Double Jump', 'hand');
  const kicker = permanent(first.game, tmnt, 'Lita, Little Orphan Amphibian');
  const target = synthetic(opponent, { name: 'Kick target', types: ['Creature'], power: '4', toughness: '4' });
  first.game.battlefield.push(target); tmnt.pool.R = 1; tmnt.pool.C = 1; first.game.recalc();
  const kickAlt = first.game.castableList(tmnt).find(entry => entry.card === kick && entry.alt?.splitHalf);
  assert.equal(await first.game.castSpell(tmnt, kick, { from: 'hand', alt: kickAlt.alt }), true);
  assert.equal(target.damage, kicker.power);

  const second = rulesGame({ chooseTargets: (g, q) => [q.candidates[0]] }, 2);
  const [fuser, fuseOpponent] = second.players;
  const fused = inZone(fuser, 'Double Jump', 'hand');
  const source = permanent(second.game, fuser, 'Lita, Little Orphan Amphibian');
  const fuseTarget = synthetic(fuseOpponent, { name: 'Fuse target', types: ['Creature'], power: '1', toughness: '5' });
  second.game.battlefield.push(fuseTarget);
  fuser.pool.U = 1; fuser.pool.R = 1; fuser.pool.C = 2; second.game.recalc();
  const fuseAlt = second.game.castableList(fuser).find(entry => entry.card === fused && entry.alt?.splitFuse);
  assert.equal(await second.game.castSpell(fuser, fused, { from: 'hand', alt: fuseAlt.alt }), true);
  assert.equal(source.power, 5);
  assert.equal(source.counters.flying, 1);
  assert.equal(fuseTarget.zone, 'graveyard');
});

test('Shellshock cilja do jedno stvorenje svakog protivnika i pravi Mutagen samo za stvarno nanesenu štetu', async () => {
  const { game, players: [tmnt, ...opponents] } = rulesGame({}, 4);
  const shellshock = inZone(tmnt, 'Shellshock', 'hand');
  const targets = opponents.map((opponent, index) => {
    const card = synthetic(opponent, { name: `Shell target ${index}`, types: ['Creature'], power: '2', toughness: '3' });
    game.battlefield.push(card); return card;
  });
  game.recalc();
  const specs = shellshock.def.targets(game, shellshock);
  assert.equal(specs.length, 3);
  specs.forEach((spec, index) => {
    const legal = game.legalTargets(spec, shellshock, tmnt);
    assert.equal(legal.length, 1);
    assert.equal(legal[0], targets[index]);
  });
  await shellshock.def.resolve({ g: game, src: shellshock, you: tmnt, x: 2, targets });
  assert.equal(game.bf().filter(card => card.ctrl === tmnt && card.hasSub('Mutagen')).length, 3);
});

test('Special Move Foot Toss prisiljava drugu metu različitu od bacača', async () => {
  let wanted;
  const { game, players: [tmnt, opponent] } = rulesGame({
    chooseTargets: (g, q) => [q.candidates.includes(wanted) ? wanted : q.candidates[0]],
  }, 2);
  const spell = inZone(tmnt, 'Special Move', 'hand');
  const thrower = permanent(game, tmnt, 'Lita, Little Orphan Amphibian');
  const target = permanent(game, opponent, 'Stalwart Pathlighter');
  wanted = target;
  const specs = spell.def.modes.list[2].targets;
  const ctx = { g: game, src: spell, you: tmnt, targets: [], so: { kind: 'spell' } };
  assert.equal(await game.pickTargets(ctx, specs, spell, tmnt), true);
  assert.equal(ctx.targets[0], thrower);
  assert.equal(ctx.targets[1], target);
});

test('Here Comes a New Hero cilja draw igrača i kopirano stvorenje odvojeno', async () => {
  const { game, players: [tmnt, recipient] } = rulesGame({}, 2);
  const spell = inZone(tmnt, 'Here Comes a New Hero!', 'hand');
  const creature = permanent(game, recipient, 'Bebop, Skull & Crossbones');
  inZone(recipient, 'Forest', 'library');
  inZone(recipient, 'Island', 'library');
  const specs = spell.def.targets(game, spell, { xVal: 2 });
  assert.equal(game.legalTargets(specs[0], spell, tmnt).includes(recipient), true);
  assert.equal(game.legalTargets(specs[1], spell, tmnt).includes(creature), true);
  await spell.def.resolve({ g: game, src: spell, you: tmnt, x: 2, targets: [recipient, creature] });
  assert.equal(recipient.hand.length, 2);
  assert.equal(game.bf().some(card => card.ctrl === tmnt && card.isToken && card.name === creature.name), true);
});

test('Everything Pizza poštuje sva tri targeta i svaki protivnik bira svoj discard', async () => {
  const { game, players: [tmnt, recipient, other] } = rulesGame({}, 3);
  const pizza = permanent(game, tmnt, 'Everything Pizza');
  const damageTarget = permanent(game, recipient, 'Bebop, Skull & Crossbones');
  const buffTarget = permanent(game, tmnt, 'Lita, Little Orphan Amphibian');
  inZone(recipient, 'Forest', 'library');
  inZone(recipient, 'Island', 'hand');
  inZone(other, 'Swamp', 'hand');
  const ability = pizza.def.abilities[0];
  await ability.run({ g: game, src: pizza, you: tmnt, targets: [recipient, damageTarget, buffTarget] });
  assert.equal(recipient.life, 43);
  assert.equal(recipient.hand.length, 1, 'vuče jednu pa odbacuje jednu');
  assert.equal(other.hand.length, 0);
  assert.equal(damageTarget.zone, 'graveyard');
  assert.equal(buffTarget.counters['+1/+1'], 3);
});

test('Foot Chopper trigger kontroliše kontrolor equipped creaturea i vuče samo poslije uspješne žrtve', async () => {
  const { game, players: [tmnt, opponent] } = rulesGame({}, 2);
  const chopper = permanent(game, tmnt, 'Foot Chopper');
  const enemyHost = permanent(game, opponent, 'Stalwart Pathlighter');
  chopper.attachedTo = enemyHost.iid;
  const trigger = chopper.def.triggers[1];
  inZone(opponent, 'Forest', 'library');
  inZone(opponent, 'Island', 'library');
  inZone(opponent, 'Swamp', 'library');
  assert.equal(trigger.filter(game, chopper, { card: enemyHost }), true);
  assert.equal(trigger.controller(game, chopper, { card: enemyHost }), opponent);
  await trigger.run({ g: game, src: chopper, you: opponent, data: { card: enemyHost } });
  assert.equal(enemyHost.zone, 'graveyard');
  assert.equal(opponent.hand.length, 3);

  const ownHost = permanent(game, tmnt, 'Bebop, Skull & Crossbones');
  chopper.attachedTo = ownHost.iid;
  inZone(tmnt, 'Forest', 'library');
  inZone(tmnt, 'Island', 'library');
  assert.equal(trigger.filter(game, chopper, { card: ownHost }), true);
  await trigger.run({ g: game, src: chopper, you: tmnt, data: { card: ownHost } });
  assert.equal(ownHost.zone, 'graveyard');
  assert.equal(tmnt.hand.length, 2);
});

test('Level Up trigger kontroliše kontrolor enchanted creaturea i njemu daje draw', async () => {
  const { game, players: [auraOwner, creatureOwner] } = rulesGame({}, 2);
  const aura = permanent(game, auraOwner, 'Level Up');
  const host = permanent(game, creatureOwner, 'Leatherhead, Iron Gator');
  host.counters['+1/+1'] = 3;
  aura.attachedTo = host.iid;
  host.attachments.push(aura.iid);
  inZone(creatureOwner, 'Forest', 'library');
  game.recalc();
  await game.emit('attacks', { card: host, player: creatureOwner, defender: auraOwner });
  await resolveAll(game);
  assert.equal(creatureOwner.hand.length, 1);
  assert.equal(auraOwner.hand.length, 0);
});

test("Assassin's Trophy nudi stvarni izbor i stavlja pronađeni basic untapped", async () => {
  const { game, players: [tmnt, opponent], controllers } = rulesGame({}, 2);
  controllers[1].decide = async (g, q) => {
    if (q.aiHint?.kind === 'rampChoice') return 'yes';
    if (q.type === 'chooseCards' && q.aiHint?.kind === 'searchBasic') return q.from.slice(0, 1);
    return defaultDecision(g, q);
  };
  const trophy = inZone(tmnt, "Assassin's Trophy", 'hand');
  const target = permanent(game, opponent, 'Sol Ring');
  const basic = inZone(opponent, 'Forest', 'library');
  await trophy.def.resolve({ g: game, src: trophy, you: tmnt, targets: [target] });
  assert.equal(target.zone, 'graveyard');
  assert.equal(basic.zone, 'battlefield');
  assert.equal(basic.tapped, false);
});

test('Big Apple zaključava izabranu boju, a Fabled Passage provjerava četiri landa poslije pretrage', async () => {
  const { game, players: [tmnt] } = rulesGame({
    chooseOption: (g, q) => /Big Apple/.test(q.prompt) ? 'R' : q.options[0]?.key,
    chooseCards: (g, q) => q.from.slice(0, q.min || 1),
  }, 2);
  const apple = inZone(tmnt, 'Big Apple, 3 a.m.', 'hand');
  await game.move(apple, 'battlefield', { ctrl: tmnt });
  assert.equal(apple.meta.chosenColor, 'R');
  const produced = apple.def.mana.produce(game, apple);
  assert.equal(produced.length, 1);
  assert.equal(produced[0].R, 1);

  const passage = permanent(game, tmnt, 'Fabled Passage');
  permanent(game, tmnt, 'Forest');
  permanent(game, tmnt, 'Island');
  permanent(game, tmnt, 'Swamp');
  const found = inZone(tmnt, 'Mountain', 'library');
  await game.sacrifice(tmnt, passage);
  await passage.def.abilities[0].run({ g: game, src: passage, you: tmnt });
  assert.equal(found.zone, 'battlefield');
  assert.equal(found.tapped, false);
});

test('Krang udvostručuje Baxterov draw trigger, a Donatello dodaje samo jedan Mutagen po token batchu', async () => {
  const { game, players: [tmnt] } = rulesGame({}, 2);
  permanent(game, tmnt, 'Krang, the All-Powerful');
  const baxter = permanent(game, tmnt, 'Baxter, Fly in the Ointment');
  permanent(game, tmnt, 'Donatello, the Brains');
  inZone(tmnt, 'Forest', 'library');
  await game.draw(tmnt, 1);
  await resolveAll(game);
  assert.equal(baxter.counters['+1/+1'], 2);
  await game.makeTokens('food', tmnt, { n: 3 });
  assert.equal(game.bf().filter(card => card.ctrl === tmnt && card.hasSub('Food')).length, 3);
  assert.equal(game.bf().filter(card => card.ctrl === tmnt && card.hasSub('Mutagen')).length, 1);
});

test('TMNT AI bira Food uz Food/token engine i fight samo kada je profitabilan', async () => {
  const { game, players: [bot, opponent] } = rulesGame({}, 2);
  bot.isAI = true;
  bot.deckName = 'Turtle Power';
  const lita = permanent(game, bot, 'Lita, Little Orphan Amphibian');
  permanent(game, bot, 'Ninja Pizza');
  const alliance = {
    type: 'chooseOption', prompt: 'Lita — Alliance',
    options: [
      { key: 'counter', label: '+1/+1 na Litu', benefit: 'counter' },
      { key: 'food', label: 'Food token', benefit: 'food' },
      { key: 'scry', label: 'Scry 1', benefit: 'scry' },
    ],
    aiHint: { kind: 'tmntAlliance', src: lita, used: [] },
  };
  const foodDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 41, actionWindow: alliance });
  assert.equal(MTG.unwrapBotDecisionAction(foodDecision.action), 'food');

  const hydra = permanent(game, bot, 'Aggro Amalgam');
  hydra.counters['+1/+1'] = 3;
  const weak = synthetic(opponent, { name: 'Profitabilna meta', types: ['Creature'], cost: '{4}', power: '2', toughness: '3', oracle: 'Whenever you draw a card, draw a card.' });
  game.battlefield.push(weak); game.recalc();
  const mode = {
    type: 'chooseOption', prompt: 'Aggro Amalgam: izaberi mod',
    options: [
      { key: '0', label: 'Dupliraj +1/+1 countere', benefit: 'doubleCounters' },
      { key: '1', label: 'Fight', benefit: 'fight' },
    ],
    aiHint: { kind: 'aggroAmalgam', src: hydra },
  };
  const fightDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 42, actionWindow: mode });
  assert.equal(MTG.unwrapBotDecisionAction(fightDecision.action), '1');

  weak.def = Object.assign({}, weak.def, { power: '12', toughness: '12' });
  game.recalc();
  const doubleDecision = await MTG.chooseBotAction({ gameState: game, botPlayerId: bot.idx, seed: 43, actionWindow: mode });
  assert.equal(MTG.unwrapBotDecisionAction(doubleDecision.action), '0');
});

test('TMNT AI combat ostaje legalan kada prisiljeni napadač nema legalnu metu', async () => {
  const { game, players: [bot] } = rulesGame({}, 2);
  bot.isAI = true;
  bot.deckName = 'Turtle Power';
  const forced = permanent(game, bot, 'Shredder, Shadow Master');
  game.legalAttackTargets = () => [];
  const decision = await MTG.chooseBotAction({
    gameState: game,
    botPlayerId: bot.idx,
    seed: 44,
    actionWindow: { type: 'attackers', eligible: [forced], opponents: bot.opponents(game), forced: [forced] },
  });
  assert.equal(decision.action.kind, 'declareAttackers');
  assert.equal(decision.action.assignments.length, 0);
});
