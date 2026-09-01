import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function controller(overrides = {}) {
  return {
    decide: async (game, q) => {
      if (overrides[q.type]) return overrides[q.type](game, q);
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'chooseOption') return q.options[0]?.key;
      if (q.type === 'chooseMulti') return q.options.slice(0, q.min || 1).map(option => option.key);
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'chooseX') return q.max || 0;
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
      return null;
    },
  };
}

function makeGame(MTG, firstController = controller(), count = 2) {
  const game = new MTG.Game({ seed: 812, paced: false, maxTurns: 10 });
  const players = [];
  for (let i = 0; i < count; i++) players.push(game.addPlayer(`P${i + 1}`, { name: 'Audit' }, i ? controller() : firstController, i > 0));
  game.turnPlayer = players[0];
  game.phase = 'main1';
  return { game, players };
}

function battlefield(MTG, game, player, name) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player; card.zone = 'battlefield'; card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function zoneCard(MTG, player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone; player[zone].push(card);
  return card;
}

function tokenOnBattlefield(MTG, game, player, tokenName) {
  const card = new MTG.CardInst(MTG.TOKENS[tokenName], player);
  card.ctrl = player; card.zone = 'battlefield'; card.isToken = true; card.sick = false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

test('svaka legacy i Oracle batch karta ima eksplicitnu nepojednostavljenu putanju', () => {
  const MTG = loadEngine();
  const active = new Set(Object.values(MTG.DECKS).flatMap(deck => deck.cards.map(entry => entry.name)));
  const raw = new Set(Object.keys(MTG.RAW_DATA.cards));
  const oracleBatchCards = new Set((MTG.ORACLE_BATCHES || []).flatMap(batch => batch.cards.map(entry => entry.raw.name)));
  assert.equal(active.size, 1580);
  assert.equal(raw.size, 1626 + oracleBatchCards.size);

  for (const name of raw) {
    const def = MTG.DEFS[name];
    const script = MTG.SCRIPTS[name];
    assert.ok(def, `${name}: nema definiciju`);
    assert.ok(script, `${name}: nema eksplicitnu skriptu`);
    assert.equal(!!def.autoScripted, false, `${name}: heuristički autoscript`);
    assert.equal(!!def.simplified, false, `${name}: simplified`);
    assert.equal((script.statics || []).some(entry => entry.apply && /=>\s*\{\s*\}/.test(String(entry.apply))), false, `${name}: no-op static`);

    // Quoted text belongs to a created token, not to this card's own paths.
    const oracle = String(def.oracle || '').replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ')
      .replace(/"[^"]*"/g, ' ');
    const activated = oracle.split('\n').filter(line => {
      const value = line.trim();
      return /^(?:\{[^}]+\}(?:,\s*)?)+[^:]*:/.test(value) || /^(?:Sacrifice|Discard|Tap)\b[^:]*:/.test(value);
    }).length;
    const mana = Array.isArray(def.mana) ? def.mana.length : def.mana ? 1 : 0;
    const paths = mana + (def.abilities || []).length + (def.opponentAbilities || []).length +
      (def.handAbility ? 1 : 0) + (def.gyAbility ? 1 : 0) + (def.cycling ? 1 : 0) +
      (def.equip !== undefined ? 1 : 0) + (def.grantMana ? 1 : 0);
    assert.ok(paths >= activated, `${name}: Oracle aktivacije ${activated}, putanje ${paths}`);
  }
});

test('karte sa faznim, kopirajućim i pravilskim tekstom koriste odgovarajuće engine događaje', () => {
  const MTG = loadEngine();
  assert.ok(MTG.DEFS['Black Market Connections'].triggers.some(trigger => trigger.on === 'precombatMain'));
  assert.ok(MTG.DEFS['Cosmic Crucible'].triggers.some(trigger => trigger.on === 'precombatMain'));
  assert.ok(MTG.DEFS['Estinien Varlineau'].triggers.some(trigger => trigger.on === 'postcombatMain'));
  assert.equal(MTG.DEFS['Council of Reeds'].ignoreLegendRuleCreatures, true);
  assert.equal(MTG.DEFS["Fortune Teller's Talent"].revealOwnTop, true);
  assert.equal(MTG.DEFS['Tezzeret, Betrayer of Flesh'].firstArtifactAbilityDiscount, true);
  assert.ok(MTG.DEFS['Ancestral Communion'].triggers.some(trigger => trigger.zone === 'stack' && trigger.on === 'cast'));
  assert.equal(MTG.DEFS['Aether Channeler'].modes, undefined);
});

test('Tezzeret snizi samo prvu artifact aktivaciju i emblem prati svako novo tapovanje', async () => {
  const MTG = loadEngine();
  const { game, players: [player] } = makeGame(MTG);
  const tezzeret = battlefield(MTG, game, player, 'Tezzeret, Betrayer of Flesh');
  const firstFood = tokenOnBattlefield(MTG, game, player, 'food');
  const secondFood = tokenOnBattlefield(MTG, game, player, 'food');

  const first = game.activatableList(player).find(entry => entry.card === firstFood && entry.ability);
  assert.ok(first, 'prvi Food mora biti aktivan za {0} nakon popusta');
  assert.equal(await game.activateAbility(player, first), true);
  assert.equal(player.life, 43);
  assert.equal(game.activatableList(player).some(entry => entry.card === secondFood && entry.ability), false, 'drugi Food opet košta {2}');

  tezzeret.counters.loyalty = 6;
  await tezzeret.def.abilities.find(ability => ability.loyalty === -6).run({ g: game, src: tezzeret, you: player, targets: [] });
  zoneCard(MTG, player, 'Plains', 'library');
  game.tap(secondFood);
  await Promise.resolve();
  await game.flushTriggers();
  while (game.stack.length) await game.resolveTop();
  assert.equal(player.hand.length, 1);
});

test('više Tezzereta kumulativno snižava prvu artifact sposobnost i ne troši popust na neuspjelu aktivaciju', async () => {
  const MTG = loadEngine();
  const { game, players: [player] } = makeGame(MTG);
  battlefield(MTG, game, player, 'Tezzeret, Betrayer of Flesh');
  battlefield(MTG, game, player, 'Tezzeret, Betrayer of Flesh');
  const food = tokenOnBattlefield(MTG, game, player, 'food');
  assert.equal(game.abilityManaCost(player, food, '{5}').generic, 1);

  const before = player.turnState.artifactAbilitiesActivated;
  const failed = await game.activateAbility(player, {
    card: food,
    ability: { label: 'Neuspjela proba', cost: { mana: '{9}' }, run: async () => {} },
    idx: 99,
  });
  assert.equal(failed, false);
  assert.equal(player.turnState.artifactAbilitiesActivated, before);
});

test('Magma Opus aktivacija iz ruke i Metalwork Colossus aktivacija iz groblja plaćaju prave cijene', async () => {
  const MTG = loadEngine();
  const { game, players: [player] } = makeGame(MTG);
  const opus = zoneCard(MTG, player, 'Magma Opus', 'hand');
  player.pool.U = 1; player.pool.R = 1;
  const handAbility = game.activatableList(player).find(entry => entry.card === opus && entry.handAbility);
  assert.ok(handAbility);
  await game.activateAbility(player, handAbility);
  assert.equal(opus.zone, 'graveyard');
  assert.equal(game.bf().filter(card => card.hasSub('Treasure')).length, 1);

  const colossus = zoneCard(MTG, player, 'Metalwork Colossus', 'graveyard');
  tokenOnBattlefield(MTG, game, player, 'clue');
  tokenOnBattlefield(MTG, game, player, 'treasure');
  const graveAbility = game.activatableList(player).find(entry => entry.card === colossus && entry.gyAbility);
  assert.ok(graveAbility);
  await game.activateAbility(player, graveAbility);
  assert.equal(colossus.zone, 'hand');
});

test('Mycosynth Gardens plaća mana value mete, kopira je i vraća originalni identitet pri promjeni zone', async () => {
  const MTG = loadEngine();
  const { game, players: [player] } = makeGame(MTG);
  const gardens = battlefield(MTG, game, player, 'The Mycosynth Gardens');
  const post = battlefield(MTG, game, player, 'Trading Post');
  player.pool.C = 4;
  const entry = game.activatableList(player).find(item => item.card === gardens && item.ability);
  assert.ok(entry);
  await game.activateAbility(player, entry, [post]);
  assert.equal(gardens.name, 'Trading Post');
  assert.equal(player.pool.C, 0);
  await game.move(gardens, 'graveyard');
  assert.equal(gardens.name, 'The Mycosynth Gardens');
});

test('ispravljene višedijelne karte imaju sve Oracle putanje', () => {
  const MTG = loadEngine();
  assert.equal(MTG.DEFS['Trading Post'].abilities.length, 4);
  assert.equal(MTG.DEFS['Tezzeret, Betrayer of Flesh'].abilities.length, 3);
  assert.equal(MTG.DEFS['Escape Tunnel'].abilities.length, 2);
  assert.equal(MTG.DEFS['Plaza of Heroes'].mana.length, 3);
  assert.ok(MTG.DEFS['Gix, Yawgmoth Praetor'].abilities.some(ability => ability.cost.discardX));
  assert.ok(MTG.DEFS['The Wasp, Winsome Avenger'].triggers.some(trigger => trigger.on === 'etb'));
  assert.ok(MTG.DEFS['Shang-Chi and the Ten Rings'].triggers.some(trigger => trigger.on === 'plusAdded'));
  assert.equal(MTG.DEFS['Ardbert, Warrior of Darkness'].triggers.filter(trigger => trigger.on === 'cast').length, 2);
  assert.ok(MTG.DEFS['Fandaniel, Telophoroi Ascian'].triggers.some(trigger => trigger.on === 'endStep'));
  assert.ok(MTG.DEFS['Thancred Waters'].triggers.some(trigger => trigger.on === 'etb'));
  assert.ok(MTG.DEFS['Papalymo Totolymo'].abilities.length);
  assert.ok(MTG.DEFS['Hildibrand Manderville'].triggers.some(trigger => trigger.on === 'dies'));
  assert.ok(MTG.DEFS['Innocuous Researcher'].triggers.some(trigger => trigger.on === 'endStep'));
  assert.equal(typeof MTG.DEFS['Quicksilver, Speedster'].grantsFlash, 'function');
  assert.equal(typeof MTG.DEFS['Dearly Departed'].graveyardEtbCounters, 'function');
  assert.ok(MTG.DEFS['Merchant of Truth'].triggers.some(trigger => trigger.desc === 'Clue exalted'));
  assert.ok(MTG.DEFS['The Odd Acorn Gang'].statics.length);
});

test('Everlasting Torment zaobilazi prevenciju, uklanja shield counter i pretvara štetu stvorenju u wither', async () => {
  const MTG = loadEngine();
  const { game, players: [owner, opponent] } = makeGame(MTG);
  battlefield(MTG, game, owner, 'Everlasting Torment');
  const source = battlefield(MTG, game, owner, 'Stalwart Pathlighter');
  const target = battlefield(MTG, game, opponent, 'Wall of Omens');
  target.counters.shield = 1;
  game.untilEffects.push({ expires: 'eot', kind: 'preventToCreature', iid: target.iid });
  game.untilEffects.push({ expires: 'eot', kind: 'preventToPlayer', who: opponent });

  assert.equal(await game.damageCreature(source, target, 2, { deferSBA: true }), 2);
  assert.equal(target.counters.shield, 0, 'CR 615.12: unpreventable damage still removes a shield counter');
  assert.equal(target.counters['-1/-1'], 2);
  assert.equal(await game.damagePlayer(source, opponent, 3, { deferSBA: true }), 3);
  assert.equal(opponent.life, 37);
});

test('Will of the Abzan nudi oba moda samo kada kontrolor ima komandera', async () => {
  const MTG = loadEngine();
  let requestedModes = null;
  const choose = controller({
    chooseMulti: (game, q) => { requestedModes = q; return q.options.slice(0, q.min).map(option => option.key); },
  });
  const { game, players: [player] } = makeGame(MTG, choose);
  const commander = battlefield(MTG, game, player, 'Felothar the Steadfast');
  commander.commander = true;
  const spell = zoneCard(MTG, player, 'Will of the Abzan', 'hand');
  zoneCard(MTG, player, 'Stalwart Pathlighter', 'graveyard');
  player.pool.B = 1; player.pool.C = 3;
  await game.castSpell(player, spell, { from: 'hand' });
  assert.equal(requestedModes.min, 2);
  assert.equal(requestedModes.max, 2);
});

test('isključene damage-prevention karte imaju pune source, redirect i counter putanje', async () => {
  const MTG = loadEngine();
  let palmSource = null;
  const chooser = controller({
    chooseCards: (game, q) => q.prompt.startsWith('Deflecting Palm') ? [palmSource] : q.from.slice(0, q.min || 0),
  });
  const { game, players: [owner, opponent] } = makeGame(MTG, chooser);
  palmSource = battlefield(MTG, game, opponent, 'Indomitable Ancients');
  const otherSource = battlefield(MTG, game, opponent, 'Wall of Omens');
  const palm = new MTG.CardInst(MTG.DEFS['Deflecting Palm'], owner);
  palm.ctrl = owner; palm.zone = 'stack';
  await palm.def.resolve({ g: game, src: palm, you: owner, targets: [] });

  assert.equal(await game.damagePlayer(otherSource, owner, 2, { deferSBA: true }), 2);
  assert.equal(await game.damagePlayer(palmSource, owner, 5, { deferSBA: true }), 0);
  assert.equal(owner.life, 38);
  assert.equal(opponent.life, 35);

  game.untilEffects.length = 0;
  const sacrifice = new MTG.CardInst(MTG.DEFS["Gideon's Sacrifice"], owner);
  sacrifice.ctrl = owner;
  const chosen = battlefield(MTG, game, owner, 'Indomitable Ancients');
  const other = battlefield(MTG, game, owner, 'Wall of Omens');
  await sacrifice.def.resolve({ g: game, src: sacrifice, you: owner, targets: [chosen] });
  await game.damagePlayer(palmSource, owner, 3, { deferSBA: true });
  await game.damageCreature(palmSource, other, 2, { deferSBA: true });
  assert.equal(owner.life, 38);
  assert.equal(other.damage, 0);
  assert.equal(chosen.damage, 5);

  const chosenSecond = battlefield(MTG, game, owner, 'Wall of Mourning');
  await sacrifice.def.resolve({ g: game, src: sacrifice, you: owner, targets: [chosenSecond] });
  await game.damagePlayer(palmSource, owner, 1, { deferSBA: true });
  assert.equal(chosenSecond.damage, 1, 'više redirect efekata mora primijeniti svaki najviše jednom');

  game.untilEffects.length = 0;
  const squire = battlefield(MTG, game, owner, 'Selfless Squire');
  game.untilEffects.push({ kind: 'preventToPlayer', who: owner, expires: 'eot', srcIid: squire.iid });
  assert.equal(await game.damagePlayer(palmSource, owner, 4, { deferSBA: true }), 0);
  await game.flushTriggers();
  while (game.stack.length) await game.resolveTop();
  assert.equal(squire.counters['+1/+1'], 4);
});

test('Comeuppance štiti igrača i planeswalkera samo od tuđih izvora i vraća pravoj strani', async () => {
  const MTG = loadEngine();
  const { game, players: [owner, opponent] } = makeGame(MTG);
  const creatureSource = battlefield(MTG, game, opponent, 'Indomitable Ancients');
  const planeswalker = battlefield(MTG, game, owner, 'Tezzeret, Betrayer of Flesh');
  planeswalker.counters.loyalty = 5;
  const spellSource = new MTG.CardInst(MTG.DEFS['Abrade'], opponent);
  spellSource.ctrl = opponent; spellSource.zone = 'stack';
  const comeuppance = new MTG.CardInst(MTG.DEFS['Comeuppance'], owner);
  comeuppance.ctrl = owner;
  await comeuppance.def.resolve({ g: game, src: comeuppance, you: owner, targets: [] });

  assert.equal(await game.damagePlayer(creatureSource, owner, 4, { deferSBA: true }), 0);
  assert.equal(await game.damageCreature(creatureSource, planeswalker, 3, { deferSBA: true }), 0);
  assert.equal(await game.damagePlayer(spellSource, owner, 2, { deferSBA: true }), 0);
  assert.equal(owner.life, 40);
  assert.equal(planeswalker.counters.loyalty, 5);
  assert.equal(creatureSource.damage, 7);
  assert.equal(opponent.life, 38);

  const ownSource = battlefield(MTG, game, owner, 'Wall of Omens');
  assert.equal(await game.damagePlayer(ownSource, owner, 1, { deferSBA: true }), 1);
});

test('Feather kopira spell za svako dodatno legalno stvorenje tek nakon plaćanja', async () => {
  const MTG = loadEngine();
  let extra = null;
  const chooser = controller({ chooseCards: () => [extra] });
  const { game, players: [owner] } = makeGame(MTG, chooser);
  const feather = battlefield(MTG, game, owner, 'Feather, Radiant Arbiter');
  extra = battlefield(MTG, game, owner, 'Wall of Omens');
  const spell = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], owner);
  spell.ctrl = owner; spell.zone = 'stack';
  const so = {
    kind: 'spell', card: spell, ctrl: owner, name: spell.name, targets: [feather],
    targetSpecs: game.spellTargetSpecs(spell, {}), castOpts: {},
  };
  game.stack.push(so);
  owner.pool.C = 2;
  const trigger = feather.def.triggers.find(entry => entry.on === 'cast');
  const data = { player: owner, card: spell, so };
  assert.equal(trigger.filter(game, feather, data), true);
  await trigger.run({ g: game, src: feather, you: owner, data, targets: [] });
  const copy = game.stack.find(item => item.isCopy);
  assert.ok(copy);
  assert.equal(copy.targets[0], extra);
  assert.equal(owner.pool.C, 0);
});

test('Hot Pursuit vezuje trajni goad za enchantment i preuzima sve goadovane/suspected nakon dva ispadanja', async () => {
  const MTG = loadEngine();
  const { game, players } = makeGame(MTG, controller(), 4);
  const [owner, opponent, lostA, lostB] = players;
  lostA.lost = true; lostB.lost = true;
  const pursuit = battlefield(MTG, game, owner, 'Hot Pursuit');
  const target = battlefield(MTG, game, opponent, 'Indomitable Ancients');
  target.meta.suspected = true;
  pursuit.meta.pursuitTargetIid = target.iid;
  game.recalc();
  assert.equal(game.isGoaded(target), true);

  const trigger = pursuit.def.triggers.find(entry => entry.on === 'beginCombat');
  assert.equal(trigger.filter(game, pursuit, { player: owner }), true);
  await trigger.run({ g: game, src: pursuit, you: owner, data: { player: owner }, targets: [] });
  assert.equal(target.ctrl, owner);
  assert.equal(target.tapped, false);
  assert.equal(target.meta.tempHaste, true);
  assert.ok(game.untilEffects.some(effect => effect.kind === 'temporaryControl' && effect.iid === target.iid));
});
