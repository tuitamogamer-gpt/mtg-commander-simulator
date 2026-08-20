import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers' || q.type === 'combatReview') return [];
  if (q.type === 'chooseOption') {
    if (q.aiHint?.kind === 'commanderZone') return 'cz';
    return q.options[0]?.key;
  }
  if (q.type === 'chooseTargets') return q.candidates.slice();
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseX') return q.max;
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 0).map(option => option.key);
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 20260820, paced: false, maxTurns: 60 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'Hero',
    { name: index ? `Opponent deck ${index}` : 'Hero deck' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 20;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function synthetic(name, opts = {}) {
  return {
    name,
    cost: opts.cost ?? '{2}',
    super: opts.super || [],
    types: opts.types || ['Creature'],
    subtypes: opts.subtypes || [],
    oracle: opts.oracle || '',
    power: String(opts.power ?? 2),
    toughness: String(opts.toughness ?? 2),
    kws: opts.kws || [],
    abilities: opts.abilities || [],
    statics: opts.statics || [],
    mana: opts.mana || null,
    colorsOverride: opts.colorsOverride,
  };
}

function permanent(game, player, defOrName, opts = {}) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.timestamp = opts.timestamp ?? card.iid * 10;
  card.sick = opts.sick ?? false;
  card.commander = opts.commander ?? false;
  game.battlefield.push(card);
  if (opts.loyalty !== undefined) card.counters.loyalty = opts.loyalty;
  game.recalc();
  return card;
}

function inZone(player, defOrName, zone) {
  const def = typeof defOrName === 'string' ? MTG.DEFS[defOrName] : defOrName;
  const card = new MTG.CardInst(def, player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function pwAbility(name, loyalty) {
  return MTG.DEFS[name].abilities.find(ability => ability.loyalty === loyalty);
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 240) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 240, 'stack/trigger petlja se nije smirila');
}

test('svih sedam aktivnih planeswalkera ima svih 20 loyalty sposobnosti', () => {
  const inventory = [];
  for (const [deckName, deck] of Object.entries(MTG.DECKS)) {
    for (const entry of deck.cards) {
      const def = MTG.DEFS[entry.name];
      if (def?.types?.includes('Planeswalker')) inventory.push([deckName, entry.name]);
    }
  }
  assert.deepEqual(inventory, [
    ['Animated Army', 'Domri, Anarch of Bolas'],
    ['Blight Curse', 'Liliana, Death Wielder'],
    ['Blight Curse', "Vraska, Betrayal's Sting"],
    ['Deep Clue Sea', 'Tezzeret, Betrayer of Flesh'],
    ['Family Matters', "Elspeth, Sun's Champion"],
    ['Mardu Surge', 'Kaya, Geist Hunter'],
    ['Squirreled Away', 'Garruk, Cursed Huntsman'],
  ]);
  assert.equal(inventory.reduce((sum, [, name]) => sum + MTG.DEFS[name].abilities.filter(a => a.loyalty !== undefined).length, 0), 20);
  for (const [, name] of inventory) {
    assert.ok(MTG.DEFS[name].abilities.every(ability => ability.loyalty !== undefined && ability.sorcery), `${name}: neispravna loyalty putanja`);
  }
});

test('minus loyalty nije ponuđen bez countera i neuspjeh ne troši Vraska aktivaciju', async () => {
  const { game, players: [hero] } = rulesGame();
  const vraska = permanent(game, hero, "Vraska, Betrayal's Sting", { loyalty: 6 });
  permanent(game, game.players[1], synthetic('Vraska Target'));
  const offered = game.activatableList(hero).filter(entry => entry.card === vraska).map(entry => entry.ability.loyalty);
  assert.deepEqual(Array.from(offered), [0, -2]);

  const invalid = { card: vraska, ability: pwAbility("Vraska, Betrayal's Sting", -9), idx: 2 };
  assert.equal(await game.activateAbility(hero, invalid, [game.players[1]]), false);
  assert.notEqual(vraska.meta._loyUsed, game.turnNo);
  const zero = game.activatableList(hero).find(entry => entry.card === vraska && entry.ability.loyalty === 0);
  assert.ok(zero, 'Vraska 0 mora ostati dostupna nakon odbijene -9');
});

test('Vraska compleated, 0, -2 i -9 imaju pune Oracle ishode', async () => {
  const { game, players: [hero, opponent] } = rulesGame();
  const paidLife = inZone(hero, "Vraska, Betrayal's Sting", 'hand');
  paidLife.castMeta = { phyrexianLifePaid: 1 };
  await game.move(paidLife, 'battlefield', { ctrl: hero });
  assert.equal(paidLife.counters.loyalty, 4, 'compleated life payment ulazi sa dva loyalty manje');
  const paidMana = inZone(hero, "Vraska, Betrayal's Sting", 'hand');
  paidMana.castMeta = { phyrexianLifePaid: 0 };
  await game.move(paidMana, 'battlefield', { ctrl: hero });
  assert.equal(paidMana.counters.loyalty, 6);

  inZone(hero, synthetic('Draw for Vraska', { types: ['Land'] }), 'library');
  opponent.poison = 2;
  const life = hero.life;
  await pwAbility("Vraska, Betrayal's Sting", 0).run({ g: game, src: paidMana, you: hero, targets: [] });
  assert.equal(hero.life, life - 1);
  assert.equal(hero.hand.length, 1);
  assert.equal(paidMana.counters.loyalty, 7, 'proliferate povećava izabrani loyalty');
  assert.equal(opponent.poison, 3, 'proliferate povećava izabrani poison');

  const target = permanent(game, opponent, 'Riders of Gavony');
  const original = target.def;
  const originalMv = target.mv;
  const originalColors = target.colors.slice();
  await pwAbility("Vraska, Betrayal's Sting", -2).run({ g: game, src: paidMana, you: hero, targets: [target] });
  assert.equal(target.name, original.name);
  assert.equal(target.mv, originalMv);
  assert.deepEqual(Array.from(target.colors), Array.from(originalColors));
  assert.deepEqual(Array.from(target.def.super), Array.from(original.super));
  assert.equal(target.is('Artifact'), true);
  assert.equal(target.hasSub('Treasure'), true);
  assert.equal(target.is('Creature'), false);
  assert.ok(target.def.mana);
  await game.move(target, 'graveyard');
  assert.equal(target.def, original, 'promjena zone vraća originalne karakteristike');

  opponent.poison = 3;
  await pwAbility("Vraska, Betrayal's Sting", -9).run({ g: game, src: paidMana, you: hero, targets: [opponent] });
  assert.equal(opponent.poison, 9);
  opponent.poison = 10;
  await pwAbility("Vraska, Betrayal's Sting", -9).run({ g: game, src: paidMana, you: hero, targets: [opponent] });
  assert.equal(opponent.poison, 10, 'Vraska ne smanjuje veću poison vrijednost');
});

test('Domri statik, +1 i simultani fight rade zajedno', async () => {
  const { game, players: [hero, opponent] } = rulesGame();
  const domri = permanent(game, hero, 'Domri, Anarch of Bolas', { loyalty: 3 });
  const mine = permanent(game, hero, synthetic('Domri Fighter', { power: 2, toughness: 3 }));
  game.recalc();
  assert.equal(mine.power, 3, 'Domri statik daje +1/+0');
  await pwAbility('Domri, Anarch of Bolas', 1).run({ g: game, src: domri, you: hero, targets: [] });
  assert.equal(hero.pool.R, 1);
  assert.equal(hero.turnState.uncounterableCreatureSpells, true);

  const lord = permanent(game, opponent, synthetic('Self Anthem', {
    power: 2, toughness: 3,
    statics: [{ apply: (g, self) => { self.cur.power += 1; } }],
  }));
  game.recalc();
  assert.equal(lord.power, 3);
  await pwAbility('Domri, Anarch of Bolas', -2).run({ g: game, src: domri, you: hero, targets: [mine, lord] });
  assert.equal(mine.zone, 'graveyard');
  assert.equal(lord.zone, 'graveyard', 'fight koristi obje zaključane snage simultano');
});

test('Elspeth i Garruk pokrivaju tokene, masovno uništenje, draw i embleme', async () => {
  const { game, players: [hero, opponent] } = rulesGame();
  const elspeth = permanent(game, hero, "Elspeth, Sun's Champion", { loyalty: 7 });
  await pwAbility("Elspeth, Sun's Champion", 1).run({ g: game, src: elspeth, you: hero, targets: [] });
  assert.equal(game.creatures(hero).filter(card => card.isToken && card.hasSub('Soldier')).length, 3);
  const bigMine = permanent(game, hero, synthetic('Big Mine', { power: 4, toughness: 4 }));
  const bigTheirs = permanent(game, opponent, synthetic('Big Theirs', { power: 6, toughness: 6 }));
  const small = permanent(game, opponent, synthetic('Small', { power: 3, toughness: 3 }));
  await pwAbility("Elspeth, Sun's Champion", -3).run({ g: game, src: elspeth, you: hero, targets: [] });
  assert.equal(bigMine.zone, 'graveyard');
  assert.equal(bigTheirs.zone, 'graveyard');
  assert.equal(small.zone, 'battlefield');
  await pwAbility("Elspeth, Sun's Champion", -7).run({ g: game, src: elspeth, you: hero, targets: [] });
  game.recalc();
  assert.equal(game.creatures(hero)[0].kw('flying'), true);

  const garruk = permanent(game, hero, 'Garruk, Cursed Huntsman', { loyalty: 6 });
  await pwAbility('Garruk, Cursed Huntsman', 0).run({ g: game, src: garruk, you: hero, targets: [] });
  const wolves = game.creatures(hero).filter(card => card.isToken && card.hasSub('Wolf'));
  assert.equal(wolves.length, 2);
  await game.destroy(wolves[0]);
  await resolveAll(game);
  assert.equal(garruk.counters.loyalty, 7, 'Garruk wolf death dodaje loyalty svakom Garruku');
  inZone(hero, synthetic('Garruk draw', { types: ['Land'] }), 'library');
  const victim = permanent(game, opponent, synthetic('Garruk Victim'));
  await pwAbility('Garruk, Cursed Huntsman', -3).run({ g: game, src: garruk, you: hero, targets: [victim] });
  assert.equal(victim.zone, 'graveyard');
  assert.equal(hero.hand.length, 1);
  await pwAbility('Garruk, Cursed Huntsman', -6).run({ g: game, src: garruk, you: hero, targets: [] });
  game.recalc();
  assert.equal(game.creatures(hero)[0].kw('trample'), true);
});

test('Kaya +1, složeni -2 i -6 poštuju tokene i commander replacement', async () => {
  const { game, players: [hero, opponent] } = rulesGame();
  const kaya = permanent(game, hero, 'Kaya, Geist Hunter', { loyalty: 8 });
  const [token] = await game.makeTokens('spiritW', hero, { noReplace: true });
  const nontoken = permanent(game, hero, synthetic('Kaya Ally'));
  await pwAbility('Kaya, Geist Hunter', 1).run({ g: game, src: kaya, you: hero, targets: [token] });
  game.recalc();
  assert.equal(token.counters['+1/+1'], 1);
  assert.equal(token.kw('deathtouch'), true);
  assert.equal(nontoken.kw('deathtouch'), true);

  await pwAbility('Kaya, Geist Hunter', -2).run({ g: game, src: kaya, you: hero, targets: [] });
  await pwAbility('Kaya, Geist Hunter', -2).run({ g: game, src: kaya, you: hero, targets: [] });
  const before = game.bf().length;
  await game.makeTokens('spiritW', hero);
  assert.equal(game.bf().length - before, 4, 'dvije Kaya -2 daju četiri tokena');

  const commander = inZone(opponent, synthetic('Grave Commander'), 'graveyard');
  commander.commander = true;
  opponent.commanders.push(commander);
  const normal = inZone(opponent, synthetic('Ordinary Dead'), 'graveyard');
  const spiritBefore = game.creatures(hero).filter(card => card.isToken && card.hasSub('Spirit')).length;
  await pwAbility('Kaya, Geist Hunter', -6).run({ g: game, src: kaya, you: hero, targets: [] });
  const spiritAfter = game.creatures(hero).filter(card => card.isToken && card.hasSub('Spirit')).length;
  assert.equal(commander.zone, 'command');
  assert.equal(normal.zone, 'exile');
  assert.equal(spiritAfter - spiritBefore, 4, 'samo jedna karta je egzilana, zatim je dvije Kaya -2 udvostruče x4');
});

test('Liliana sva tri loyalty moda ispravno barataju -1/-1 counterima i grobljem', async () => {
  const { game, players: [hero, opponent] } = rulesGame();
  const liliana = permanent(game, hero, 'Liliana, Death Wielder', { loyalty: 10 });
  const marked = permanent(game, opponent, synthetic('Marked Creature', { toughness: 3 }));
  await pwAbility('Liliana, Death Wielder', 2).run({ g: game, src: liliana, you: hero, targets: [marked] });
  assert.equal(marked.counters['-1/-1'], 1);
  await pwAbility('Liliana, Death Wielder', -3).run({ g: game, src: liliana, you: hero, targets: [marked] });
  assert.equal(marked.zone, 'graveyard');
  const deadA = inZone(hero, synthetic('Dead A'), 'graveyard');
  const deadB = inZone(hero, synthetic('Dead B'), 'graveyard');
  const deadLand = inZone(hero, synthetic('Dead Land', { types: ['Land'] }), 'graveyard');
  await pwAbility('Liliana, Death Wielder', -10).run({ g: game, src: liliana, you: hero, targets: [] });
  assert.equal(deadA.zone, 'battlefield');
  assert.equal(deadB.zone, 'battlefield');
  assert.equal(deadLand.zone, 'graveyard');
});

test('Tezzeret +1, -2 i -6 ne ostavljaju 4/4 efekt nakon promjene zone', async () => {
  const decider = (g, q) => {
    if (q.type === 'chooseOption' && /Tezzeret/.test(q.prompt || '')) return 'artifact';
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    return defaultDecision(g, q);
  };
  const { game, players: [hero] } = rulesGame([decider]);
  const tezzeret = permanent(game, hero, 'Tezzeret, Betrayer of Flesh', { loyalty: 6 });
  const artifactInHand = inZone(hero, 'Sol Ring', 'hand');
  inZone(hero, synthetic('Tezz Draw A', { types: ['Land'] }), 'library');
  inZone(hero, synthetic('Tezz Draw B', { types: ['Land'] }), 'library');
  await pwAbility('Tezzeret, Betrayer of Flesh', 1).run({ g: game, src: tezzeret, you: hero, targets: [] });
  assert.equal(artifactInHand.zone, 'graveyard');
  assert.equal(hero.hand.length, 2);

  const target = permanent(game, hero, 'Sol Ring');
  const oldTimestamp = target.timestamp;
  await pwAbility('Tezzeret, Betrayer of Flesh', -2).run({ g: game, src: tezzeret, you: hero, targets: [target] });
  game.recalc();
  assert.equal(target.is('Creature'), true);
  assert.equal(target.power, 4);
  await game.move(target, 'graveyard');
  await game.move(target, 'battlefield', { ctrl: hero });
  game.recalc();
  assert.notEqual(target.timestamp, oldTimestamp);
  assert.equal(target.is('Creature'), false, 'novi battlefield objekat ne pamti Tezzeret -2');

  await pwAbility('Tezzeret, Betrayer of Flesh', -6).run({ g: game, src: tezzeret, you: hero, targets: [] });
  inZone(hero, synthetic('Emblem Draw', { types: ['Land'] }), 'library');
  const handBefore = hero.hand.length;
  target.tapped = true;
  await game.emit('becameTapped', { card: target, player: hero, firstThisTurn: true });
  await resolveAll(game);
  assert.equal(hero.hand.length, handBefore + 1);
});

test('combat bira planeswalkera, skida loyalty umjesto HP-a i ne naplaćuje player-only tax', async () => {
  let attackerQuestion = null;
  let walker = null;
  const attackerDecision = (g, q) => {
    if (q.type === 'attackers') {
      attackerQuestion = q;
      return [{ card: q.eligible[0], target: walker }];
    }
    return defaultDecision(g, q);
  };
  const { game, players: [hero, opponent] } = rulesGame([attackerDecision], 2);
  const attacker = permanent(game, hero, synthetic('Walker Hunter', { power: 3, toughness: 3 }));
  permanent(game, opponent, 'Windborn Muse');
  walker = permanent(game, opponent, "Vraska, Betrayal's Sting", { loyalty: 6 });
  const life = opponent.life;
  await game.combatPhase(hero);
  assert.ok(attackerQuestion.attackTargets.includes(walker), 'attack pitanje mora izložiti planeswalkera UI-u');
  assert.equal(opponent.life, life);
  assert.equal(walker.counters.loyalty, 3, 'unblocked combat damage skida loyalty');
  assert.equal(attacker.tapped, true, 'Windborn Muse tax se ne naplaćuje za napad na planeswalkera');

  walker.counters.loyalty = 2;
  attacker.tapped = false;
  attacker.attacking = walker;
  attacker.blockedBy = [];
  attacker.wasBlocked = false;
  game.combat = { attackers: [attacker], defenders: new Map() };
  await game.combatDamage(hero, 'normal');
  assert.equal(walker.zone, 'graveyard', 'planeswalker sa nula loyalty odlazi kroz SBA');
});

test('player-only attack restrikcija i goad ne skrivaju ili zloupotrebljavaju planeswalker lane', () => {
  const { game, players: [hero, goader, other] } = rulesGame([], 3);
  const attacker = permanent(game, hero, synthetic('Small Attacker', { power: 2, toughness: 2 }));
  permanent(game, goader, 'Queen Mother Ramonda');
  const walker = permanent(game, goader, "Vraska, Betrayal's Sting", { loyalty: 6 });
  game.monarch = goader;
  game.recalc();
  assert.equal(game.canAttackTarget(attacker, goader), false, 'Queen Mother štiti igrača');
  assert.equal(game.canAttackTarget(attacker, walker), true, 'Queen Mother ne štiti njegov planeswalker');

  attacker.meta.goadedBy = [goader];
  game.recalc();
  const legal = game.legalDeclarationAttackTargets(attacker);
  assert.deepEqual(Array.from(legal), [other], 'goad mora napasti drugog igrača kada je moguće');
});
