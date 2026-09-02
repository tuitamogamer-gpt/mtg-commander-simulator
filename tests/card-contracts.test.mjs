import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function cardOnBattlefield(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

function deterministicController(overrides = {}) {
  return {
    decide: async (game, q) => {
      if (overrides[q.type]) return overrides[q.type](game, q);
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'chooseOption') return q.options[0]?.key;
      if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(o => o.key);
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
      if (q.type === 'chooseX') return q.min || 0;
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  };
}

function rulesGame(MTG, count = 4, firstController = deterministicController()) {
  const game = new MTG.Game({ seed: 41, paced: false, maxTurns: 20 });
  const players = [];
  for (let i = 0; i < count; i++) {
    players.push(game.addPlayer(`P${i + 1}`, { name: 'Test' }, i === 0 ? firstController : deterministicController(), i > 0));
  }
  game.turnPlayer = players[0];
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function cardInZone(MTG, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

test('Scavenger Grounds žrtvuje bilo koji Desert, ne nužno sebe', () => {
  const MTG = loadEngine();
  const ability = MTG.DEFS['Scavenger Grounds'].abilities[0];
  assert.equal(ability.cost.sacSelf, undefined);
  assert.equal(typeof ability.cost.sac, 'function');

  const desert = { hasSub: subtype => subtype === 'Desert' };
  const plains = { hasSub: subtype => subtype === 'Plains' };
  assert.equal(ability.cost.sac(null, desert), true);
  assert.equal(ability.cost.sac(null, plains), false);
});

test('Lyse Hext smanjuje noncreature spellove i dobija double strike poslije drugog', () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 9, paced: false });
  const player = game.addPlayer('Lyse', { name: 'Test' }, null, false);
  const lyse = cardOnBattlefield(MTG, game, player, 'Lyse Hext');
  const instant = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], player);
  const creature = new MTG.CardInst(MTG.DEFS['Riders of Gavony'], player);
  const modifier = lyse.def.costMods[0];

  assert.equal(modifier(game, lyse, { player, card: instant }), -1);
  assert.equal(modifier(game, lyse, { player, card: creature }), 0);
  player.turnState.nonCreatureSpells = 1;
  game.recalc();
  assert.equal(lyse.kw('double strike'), false);
  player.turnState.nonCreatureSpells = 2;
  game.recalc();
  assert.equal(lyse.kw('double strike'), true);
});

test('Riders of Gavony protection sprječava target, damage i block', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 10, paced: false });
  const human = game.addPlayer('Humans', { name: 'Test' }, null, false);
  const opponent = game.addPlayer('Opponent', { name: 'Test' }, null, true);
  const riders = cardOnBattlefield(MTG, game, human, 'Riders of Gavony');
  const protectedHuman = cardOnBattlefield(MTG, game, human, 'Stalwart Pathlighter');
  const warrior = cardOnBattlefield(MTG, game, opponent, 'Ainok Strike Leader');
  riders.meta.chosenType = 'Warrior';
  game.recalc();

  assert.equal(typeof riders.def.asEnters, 'function');
  assert.equal(game.isProtectedFrom(protectedHuman, warrior), true);
  assert.equal(game.canBlock(warrior, protectedHuman), false);
  assert.equal(game.legalTargets({ what: 'creature' }, warrior, opponent).includes(protectedHuman), false);
  const before = protectedHuman.damage;
  assert.equal(await game.damageCreature(warrior, protectedHuman, 3, { deferSBA: true }), 0);
  assert.equal(protectedHuman.damage, before);
});

test('Oft-Nabbed Goat sposobnost se nudi samo protivnicima i mijenja kontrolu', async () => {
  const MTG = loadEngine();
  const { game, players: [activator, owner] } = rulesGame(MTG, 2);
  const goat = cardOnBattlefield(MTG, game, owner, 'Oft-Nabbed Goat');
  cardInZone(MTG, activator, 'Plains', 'library');
  activator.pool.C = 1;
  game.recalc();

  assert.equal(game.activatableList(owner).some(e => e.card === goat && e.opponentAbility), false);
  const entry = game.activatableList(activator).find(e => e.card === goat && e.opponentAbility);
  assert.ok(entry, 'protivnik mora dobiti Goat aktivaciju');
  assert.equal(await game.activateAbility(activator, entry), true);
  assert.equal(goat.ctrl, activator);
  assert.equal(goat.counters['-1/-1'], 1);
  assert.equal(activator.hand.length, 1);
});

test('Erestor nagrađuje iste glasove Treasureom, scryja razlike i vuče kartu', async () => {
  const MTG = loadEngine();
  const { game, players: [erestorPlayer, sameVote, differentVote] } = rulesGame(MTG, 3);
  const erestor = cardOnBattlefield(MTG, game, erestorPlayer, 'Erestor of the Council');
  cardInZone(MTG, erestorPlayer, 'Plains', 'library');
  cardInZone(MTG, erestorPlayer, 'Forest', 'library');
  const votes = new Map();
  votes['_by_' + erestorPlayer.idx] = 'A';
  votes['_by_' + sameVote.idx] = 'A';
  votes['_by_' + differentVote.idx] = 'B';
  const trigger = erestor.def.triggers.find(t => t.on === 'voteEnd');

  await trigger.run({ g: game, src: erestor, you: erestorPlayer, data: { votes }, targets: [] });
  assert.equal(game.bf().filter(c => c.ctrl === sameVote && c.hasSub('Treasure')).length, 1);
  assert.equal(game.bf().filter(c => c.ctrl === differentVote && c.hasSub('Treasure')).length, 0);
  assert.equal(erestorPlayer.hand.length, 1);
});

test("Graywater's Fixer daje zasebnu Encore aktivaciju svakom outlawu u groblju", async () => {
  const MTG = loadEngine();
  const { game, players } = rulesGame(MTG, 4);
  const caster = players[0];
  cardOnBattlefield(MTG, game, caster, "Graywater's Fixer");
  const outlaw = cardInZone(MTG, caster, 'Humble Defector', 'graveyard');
  caster.pool.C = outlaw.mv;
  game.recalc();

  const entry = game.activatableList(caster).find(e => e.card === outlaw && e.gyAbilityOverride);
  assert.ok(entry, 'outlaw karta mora imati dinamički Encore');
  assert.equal(await game.activateAbility(caster, entry), true);
  assert.equal(outlaw.zone, 'exile');
  assert.equal(game.creatures(caster).filter(c => c.isToken && c.name === outlaw.name).length, 3);
});

test('Marshland Bloodcaster nudi stvarni life alternativni trošak i troši ga jednom', async () => {
  const MTG = loadEngine();
  const { game, players: [caster] } = rulesGame(MTG, 2);
  const spell = cardInZone(MTG, caster, 'Riders of Gavony', 'hand');
  caster.bloodcasterAlternative = { turn: game.turnNo, source: 999 };
  game.recalc();

  const entry = game.castableList(caster).find(e => e.card === spell && e.alt?.bloodcaster);
  assert.ok(entry, 'spell bez dostupne mane mora biti ponuđen za život');
  const lifeBefore = caster.life;
  assert.equal(await game.castSpell(caster, spell, { alt: entry.alt, from: 'hand' }), true);
  assert.equal(caster.life, lifeBefore - spell.mv);
  assert.equal(caster.bloodcasterAlternative, null);
  assert.equal(spell.zone, 'battlefield');
});

test('Dead Before Sunrise do kraja poteza daje outlawima tap-za-štetu sposobnost', async () => {
  const MTG = loadEngine();
  const { game, players: [caster, opponent] } = rulesGame(MTG, 2);
  const outlaw = cardOnBattlefield(MTG, game, caster, 'Impulsive Pilferer');
  cardOnBattlefield(MTG, game, opponent, 'Riders of Gavony');
  game.recalc();
  await MTG.DEFS['Dead Before Sunrise'].resolve({ g: game, you: caster });
  game.recalc();

  const entry = game.activatableList(caster).find(e => e.card === outlaw && /nanesi štetu jednaku/.test(e.ability.label));
  assert.ok(entry);
  assert.equal(outlaw.power, 2);
});

test('Requisition Raid naplaćuje po jedan generički mana za svaki Spree mod', async () => {
  const MTG = loadEngine();
  const controller = deterministicController({
    chooseMulti: async () => ['0', '1'],
  });
  const { game, players: [caster, opponent] } = rulesGame(MTG, 2, controller);
  const raid = cardInZone(MTG, caster, 'Requisition Raid', 'hand');
  cardOnBattlefield(MTG, game, opponent, 'Sol Ring');
  cardOnBattlefield(MTG, game, opponent, 'Authority of the Consuls');
  caster.pool.W = 1;
  caster.pool.C = 2;
  game.recalc();

  assert.equal(await game.castSpell(caster, raid, { from: 'hand' }), true);
  assert.equal(caster.pool.W + caster.pool.C, 0);
  assert.equal(game.bf().some(c => c.ctrl === opponent && c.name === 'Sol Ring'), false);
  assert.equal(game.bf().some(c => c.ctrl === opponent && c.name === 'Authority of the Consuls'), false);
});

test("Forger's Foundry obilježi plaćeni mali spell, pohrani ga i ponudi masovni free-cast", async () => {
  const MTG = loadEngine();
  const controller = deterministicController({ chooseOption: async (game, q) =>
    q.prompt.startsWith("Forger's Foundry") ? 'yes' : q.options[0]?.key });
  const { game, players: [caster] } = rulesGame(MTG, 2, controller);
  const foundry = cardOnBattlefield(MTG, game, caster, "Forger's Foundry");
  const spell = new MTG.CardInst({
    name: 'Foundry Test Spell', cost: '{2}{U}', super: [], types: ['Instant'], subtypes: [], kws: [], oracle: '',
    resolve: async () => {},
  }, caster);
  const payment = { card: spell };
  await foundry.def.mana.onProduce(game, foundry, caster, { U: 1 }, payment);
  assert.equal(payment.foundrySource, foundry.iid);

  spell.zone = 'stack';
  game.stack.push({
    kind: 'spell', card: spell, ctrl: caster, name: spell.name, targets: [], x: 0,
    mode: null, castOpts: {}, kicked: false, from: 'hand', foundrySource: foundry.iid,
  });
  await game.resolveTop();
  assert.equal(spell.zone, 'exile');
  assert.deepEqual(Array.from(foundry.meta.foundryCards), [spell.iid]);
  caster.pool.C = 3;
  caster.pool.U = 2;
  game.recalc();
  assert.ok(game.activatableList(caster).some(e => e.card === foundry && /stored spells/.test(e.ability.label)));
});

test("Hazel's Brewmaster pamti ciljanu egziliranu creature kartu i kopira njene aktivacije na Food", async () => {
  const MTG = loadEngine();
  const { game, players: [caster, opponent] } = rulesGame(MTG, 2);
  const brewmaster = cardOnBattlefield(MTG, game, caster, "Hazel's Brewmaster");
  const creature = cardInZone(MTG, opponent, 'Humble Defector', 'graveyard');
  game.recalc();
  const trigger = brewmaster.def.triggers.find(t => t.on === 'etb');
  await trigger.run({ g: game, src: brewmaster, you: caster, data: {}, targets: [creature] });
  game.recalc();

  assert.equal(creature.zone, 'exile');
  assert.deepEqual(Array.from(brewmaster.meta.brewedCards), [creature.iid]);
  const food = game.bf().find(c => c.ctrl === caster && c.hasSub('Food'));
  assert.ok(food);
  assert.ok(food.cur.extraAbilities.some(a => /Draw 2/.test(a.label)));
});

test("Vraska stvarno pretvara isto stvorenje u Treasure i povratkom zone vraća originalnu kartu", async () => {
  const MTG = loadEngine();
  const { game, players: [vraskaPlayer, opponent] } = rulesGame(MTG, 2);
  const target = cardOnBattlefield(MTG, game, opponent, 'Riders of Gavony');
  const original = target.def;
  game.recalc();
  const ability = MTG.DEFS["Vraska, Betrayal's Sting"].abilities.find(a => a.loyalty === -2);

  await ability.run({ g: game, src: null, you: vraskaPlayer, targets: [target] });
  assert.equal(target.is('Creature'), false);
  assert.equal(target.is('Artifact'), true);
  assert.equal(target.hasSub('Treasure'), true);
  assert.ok(target.def.mana, 'pretvoreni permanent mora imati Treasure mana sposobnost');
  await game.move(target, 'graveyard');
  assert.equal(target.def, original, 'zone change vraća originalne karakteristike karte');
});

test('Mirror Entity bira stvarni X i postavlja sva kontrolisana stvorenja na X/X', async () => {
  const MTG = loadEngine();
  const controller = deterministicController({ chooseX: async () => 4 });
  const { game, players: [caster] } = rulesGame(MTG, 2, controller);
  const entity = cardOnBattlefield(MTG, game, caster, 'Mirror Entity');
  const ally = cardOnBattlefield(MTG, game, caster, 'Humble Defector');
  caster.pool.C = 4;
  game.recalc();
  const entry = game.activatableList(caster).find(e => e.card === entity && e.ability.xCost);

  assert.ok(entry);
  assert.equal(await game.activateAbility(caster, entry), true);
  assert.equal(entity.power, 4);
  assert.equal(ally.power, 4);
  assert.equal(ally.toughness, 4);
  assert.equal(ally.cur.allCreatureTypes, true);
});

test('Celeborn dobija +1/+1 za svaku kartu pogledanu tokom scryja', async () => {
  const MTG = loadEngine();
  const { game, players: [caster] } = rulesGame(MTG, 2);
  const celeborn = cardOnBattlefield(MTG, game, caster, 'Celeborn the Wise');
  cardInZone(MTG, caster, 'Plains', 'library');
  cardInZone(MTG, caster, 'Forest', 'library');
  game.recalc();
  const before = [celeborn.power, celeborn.toughness];

  await MTG.E.scry(game, caster, 2);
  await game.flushTriggers();
  await game.priorityRound(caster);
  assert.equal(celeborn.power, before[0] + 2);
  assert.equal(celeborn.toughness, before[1] + 2);
});

test('Galadhrim Ambush sprječava svu combat štetu non-Elf izvora, ne samo štetu igraču', async () => {
  const MTG = loadEngine();
  const { game, players: [caster, opponent] } = rulesGame(MTG, 2);
  const nonElf = cardOnBattlefield(MTG, game, opponent, 'Riders of Gavony');
  const elf = cardOnBattlefield(MTG, game, opponent, 'Elvish Visionary');
  const victim = cardOnBattlefield(MTG, game, caster, 'Humble Defector');
  game.combat = { attackers: [nonElf, elf] };
  game.recalc();
  await MTG.DEFS['Galadhrim Ambush'].resolve({ g: game, src: null, you: caster });

  assert.equal(await game.damagePlayer(nonElf, caster, 3, { combat: true }), 0);
  assert.equal(await game.damageCreature(nonElf, victim, 3, { combat: true, deferSBA: true }), 0);
  assert.equal(await game.damagePlayer(elf, caster, 1, { combat: true }), 1);
});

test('Lethal Scheme bilježi svako stvorenje koje ga je convokovalo i svako conniveuje', async () => {
  const MTG = loadEngine();
  const controller = deterministicController({
    chooseTargets: async (game, q) => [q.candidates.find(c => c.ctrl !== q.src.ctrl) || q.candidates[0]],
  });
  const { game, players: [caster, opponent] } = rulesGame(MTG, 2, controller);
  const first = cardOnBattlefield(MTG, game, caster, 'Humble Defector');
  const second = cardOnBattlefield(MTG, game, caster, 'Riders of Gavony');
  const target = cardOnBattlefield(MTG, game, opponent, 'Elvish Visionary');
  const scheme = cardInZone(MTG, caster, 'Lethal Scheme', 'hand');
  caster.pool.B = 2;
  const connived = [];
  game.connive = async card => { connived.push(card); };
  game.recalc();

  assert.equal(await game.castSpell(caster, scheme, { from: 'hand' }), true);
  assert.equal(first.tapped, true);
  assert.equal(second.tapped, true);
  assert.deepEqual(new Set(connived), new Set([first, second]));
  assert.notEqual(target.zone, 'battlefield');
});
