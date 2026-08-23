import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

const ACTIVE_X_SPELLS = [
  'Aggro Amalgam',
  'Altered Ego',
  "Animist's Awakening",
  'Astral Cornucopia',
  'Back in Town',
  'Benevolent Hydra',
  'Biomass Mutation',
  "Black Sun's Zenith",
  'Champions from Beyond',
  "Commander's Insight",
  'Curse of the Swine',
  'Disorder in the Court',
  'Electrodominance',
  'Entrancing Melody',
  'Epic Experiment',
  'Expansion Algorithm',
  'Exsanguinate',
  'Finale of Promise',
  'Finale of Revelation',
  'Fractal Harness',
  'Gaze of Granite',
  'Genesis Wave',
  'Goldvein Hydra',
  'Grand Crescendo',
  'Haldir, Lórien Lieutenant',
  'Hangarback Walker',
  "Heliod's Intervention",
  'Here Comes a New Hero!',
  'Hydroid Krasis',
  'Ingenious Prodigy',
  'Jacked Rabbit',
  'Kinetic Ooze',
  'Kurbis, Harvest Celebrant',
  'Lattice Library',
  'Lifeblood Hydra',
  'Mana Bloom',
  'Martial Coup',
  'Mikaeus, the Lunarch',
  'Nova Flame',
  'Open the Way',
  'Pest Infestation',
  'Primal Might',
  'Primo, the Unbounded',
  'Primordial Hydra',
  'Pull from Tomorrow',
  'Royal Talon Fighter Jet',
  'Shellshock',
  'Silkguard',
  'Slash Clone',
  'Springleaf Parade',
  'Starstorm',
  'Steelbane Hydra',
  'Stolen by the Fae',
  'Stonecoil Serpent',
  'Stroke of Genius',
  'Sylvan Offering',
  'Tempt with Vengeance',
  'The Goose Mother',
  "Tyvar's Stand",
  'Universal Surveillance',
  'West Coast Expansion',
  "Worldsoul's Rage",
  'Zenith Festival',
].sort();

function defaultDecision(game, q) {
  if (q.type === 'priority') return { kind: 'pass' };
  if (q.type === 'main') return { kind: 'done' };
  if (q.type === 'attackers' || q.type === 'blockers') return [];
  if (q.type === 'chooseOption') return q.options[0]?.key;
  if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
  if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
  if (q.type === 'chooseMulti') return q.options.slice(0, q.min ?? 1).map(option => option.key);
  if (q.type === 'chooseX') return q.values?.at(-1) ?? q.max;
  if (q.type === 'orderTriggers') return q.triggers;
  if (q.type === 'scry') return { top: q.cards.slice(), bottom: [] };
  return null;
}

function rulesGame(deciders = [], count = 3) {
  const game = new MTG.Game({ seed: 82026, paced: false, maxTurns: 40 });
  const players = Array.from({ length: count }, (_, index) => game.addPlayer(
    index ? `Opponent ${index}` : 'X Player',
    { name: index ? `Opp ${index}` : 'Elven Council' },
    { decide: async (g, q) => deciders[index] ? deciders[index](g, q) : defaultDecision(g, q) },
    index > 0,
  ));
  game.turnPlayer = players[0];
  game.turnNo = 8;
  game.phase = 'main1';
  game.step = 'main';
  return { game, players };
}

function inZone(player, name, zone) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone;
  player[zone].push(card);
  return card;
}

function permanent(game, player, name, opts = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = opts.sick ?? false;
  card.tapped = opts.tapped ?? false;
  game.battlefield.push(card);
  game.recalc();
  return card;
}

function addAnthem(game, player) {
  const def = {
    name: 'X Safety Anthem', cost: '{1}{W}', super: [], types: ['Enchantment'], subtypes: [], kws: [], oracle: '',
    statics: [{ apply: (g, self, battlefield) => {
      for (const card of battlefield) {
        if (card !== self && card.ctrl === self.ctrl && card.is('Creature')) {
          card.cur.power += 1;
          card.cur.toughness += 1;
        }
      }
    } }],
  };
  const anthem = new MTG.CardInst(def, player);
  anthem.ctrl = player;
  anthem.zone = 'battlefield';
  game.battlefield.push(anthem);
  game.recalc();
  return anthem;
}

async function resolveAll(game) {
  let guard = 0;
  while ((game.pendingTriggers.length || game.stack.length) && guard++ < 180) {
    await game.flushTriggers();
    if (game.stack.length) await game.resolveTop();
  }
  assert.ok(guard < 180, 'X trigger/stack petlja se nije smirila');
}

test('inventar pokriva sva 63 aktivna X spella i sve dodatne X-mana putanje', () => {
  const active = [...new Set(Object.values(MTG.DECKS).flatMap(deck => deck.cards.map(entry => entry.name)))]
    .filter(name => MTG.parseCost(MTG.DEFS[name].cost || '').x > 0)
    .sort();
  assert.deepEqual(active, ACTIVE_X_SPELLS);

  for (const name of active) {
    const def = MTG.DEFS[name];
    assert.ok(MTG.parseCost(def.cost).x > 0, `${name}: mana cijena mora zadržati X`);
    if (def.types.includes('Instant') || def.types.includes('Sorcery')) {
      assert.equal(typeof def.resolve, 'function', `${name}: X spell mora imati resolver`);
    } else {
      assert.ok(
        def.etbCounters || def.triggers?.length || typeof def.asEnters === 'function',
        `${name}: X permanent mora koristiti X pri ulasku/triggeru`,
      );
    }
  }

  assert.equal(MTG.DEFS['Mirror Entity'].abilities.some(ability => ability.xCost && ability.cost.mana === '{X}'), true);
  assert.equal(MTG.DEFS['Shark Typhoon'].cycling.xCycling, true);
  assert.equal(MTG.DEFS['Rose Room Treasurer'].triggers.length > 0, true);
  assert.equal(MTG.DEFS['The Mycosynth Gardens'].abilities.some(ability => ability.cost.manaFromTarget), true);
});

test('Haldir sa jednim Forestom bira X=0, ulazi 0/0 i odmah umire; sa X=3 ostaje 3/3', async () => {
  {
    const { game, players: [elven] } = rulesGame([], 2);
    permanent(game, elven, 'Forest');
    const haldir = inZone(elven, 'Haldir, Lórien Lieutenant', 'hand');
    assert.equal(game.maxAffordableX(elven, game.spellCost(elven, haldir), haldir), 0);
    assert.equal(await game.castSpell(elven, haldir, { from: 'hand', xVal: 0 }), true);
    assert.equal(haldir.zone, 'graveyard');
    assert.equal(haldir.counters['+1/+1'] || 0, 0);
    assert.match(game.log.map(entry => entry.msg).join('\n'), /Haldir, Lórien Lieutenant dies/);
  }

  {
    const { game, players: [elven] } = rulesGame([], 2);
    for (let i = 0; i < 4; i++) permanent(game, elven, 'Forest');
    const haldir = inZone(elven, 'Haldir, Lórien Lieutenant', 'hand');
    assert.equal(await game.castSpell(elven, haldir, { from: 'hand', xVal: 3 }), true);
    assert.equal(haldir.zone, 'battlefield');
    assert.equal(haldir.counters['+1/+1'], 3);
    assert.equal(haldir.power, 3);
    assert.equal(haldir.toughness, 3);
    assert.equal(haldir.castMeta.manaSpent, 4);
    assert.equal(haldir.mv, 1, 'X je 0 izvan stacka');

    const stackCopy = new MTG.CardInst(MTG.DEFS['Haldir, Lórien Lieutenant'], elven);
    stackCopy.zone = 'stack';
    stackCopy.castMeta = { x: 3 };
    assert.equal(stackCopy.mv, 4, 'X ima odabranu vrijednost na stacku');
  }
});

test('free-cast uvijek postavlja X=0 i ne prihvata spoljašnji nenulti xVal', async () => {
  const { game, players: [caster] } = rulesGame([], 2);
  const ally = permanent(game, caster, 'Elvish Mystic');
  const crescendo = inZone(caster, 'Grand Crescendo', 'hand');
  assert.equal(await game.castSpell(caster, crescendo, { from: 'hand', free: true, xVal: 5 }), true);
  assert.equal(crescendo.castMeta.x, 0);
  assert.equal(game.bf().filter(card => card.ctrl === caster && card.hasSub('Citizen')).length, 0);
  assert.equal(ally.kw('indestructible'), true, 'nenumerički dio spella se i dalje razrješava');
});

test('maxAffordableX nema limit 20, a {X}{X}/{X}{X}{X} plaćaju svaku kopiju X', async () => {
  {
    const { game, players: [caster] } = rulesGame([], 2);
    for (let i = 0; i < 25; i++) permanent(game, caster, 'Forest');
    const haldir = inZone(caster, 'Haldir, Lórien Lieutenant', 'hand');
    assert.equal(game.maxAffordableX(caster, game.spellCost(caster, haldir), haldir), 24);
  }

  {
    const { game, players: [caster] } = rulesGame([], 2);
    caster.pool.C = 7;
    const cornucopia = inZone(caster, 'Astral Cornucopia', 'hand');
    assert.equal(game.maxAffordableX(caster, game.spellCost(caster, cornucopia), cornucopia), 2);
    assert.equal(await game.castSpell(caster, cornucopia, { from: 'hand', xVal: 2 }), true);
    assert.equal(cornucopia.castMeta.manaSpent, 6);
    assert.equal(cornucopia.counters.charge, 2);
    assert.equal(caster.pool.C, 1);
  }

  {
    const { game, players: [caster] } = rulesGame([], 2);
    permanent(game, caster, 'Etherium Sculptor');
    caster.pool.C = 5;
    const walker = inZone(caster, 'Hangarback Walker', 'hand');
    assert.equal(await game.castSpell(caster, walker, { from: 'hand', xVal: 3 }), true);
    assert.equal(walker.castMeta.manaSpent, 5, 'jedan generic reduction smanjuje ukupnih 2X sa 6 na 5');
    assert.equal(walker.counters['+1/+1'], 3);
    assert.equal(walker.mv, 0, 'Hangarback na battlefieldu ima printed mana value 0');
  }
});

test('necastovani X permanenti ne nasljeđuju stari X, manaSpent ni sunburst podatke', async () => {
  const { game, players: [caster] } = rulesGame([], 2);
  addAnthem(game, caster);
  const names = [
    'Aggro Amalgam', 'Astral Cornucopia', 'Haldir, Lórien Lieutenant', 'Hangarback Walker',
    'Hydroid Krasis', 'Jacked Rabbit', 'Kurbis, Harvest Celebrant', 'Mikaeus, the Lunarch',
    'Royal Talon Fighter Jet', 'Slash Clone',
  ];
  for (const name of names) {
    const card = inZone(caster, name, 'graveyard');
    card.castMeta = { x: 7, manaSpent: 9, grantedSunburstColors: 5, phyrexianLifePaid: 2 };
    await game.move(card, 'battlefield', { ctrl: caster });
    await resolveAll(game);
    assert.equal(card.zone, 'battlefield', `${name}: anthem drži 0/0 stvorenje u životu`);
    assert.equal(card.castMeta, null, `${name}: novi necastovani objekat nema castMeta`);
    const kind = card.def.etbCounters?.kind;
    if (kind) assert.equal(card.counters[kind] || 0, 0, `${name}: ne dobija stari X/manaSpent`);
  }

  const champions = inZone(caster, 'Champions from Beyond', 'graveyard');
  champions.castMeta = { x: 6 };
  await game.move(champions, 'battlefield', { ctrl: caster });
  await resolveAll(game);
  assert.equal(champions.castMeta, null);
  assert.equal(game.bf().filter(card => card.ctrl === caster && card.hasSub('Hero') && card.isToken).length, 0);
});

test('Back in Town ograničava X brojem Outlawa, a Stolen by the Fae nudi samo legalne mana value vrijednosti', async () => {
  {
    const { game, players: [caster] } = rulesGame([], 2);
    inZone(caster, 'Prowler, Clawed Thief', 'graveyard');
    inZone(caster, 'Humble Defector', 'graveyard');
    inZone(caster, 'Forest', 'graveyard');
    const back = inZone(caster, 'Back in Town', 'hand');
    assert.equal(back.def.xMax(game, back, caster), 2);
  }

  {
    const { game, players: [caster, opponent] } = rulesGame([], 2);
    caster.pool.U = 2;
    caster.pool.C = 4;
    const stolen = inZone(caster, 'Stolen by the Fae', 'hand');
    const target = permanent(game, opponent, 'Aether Channeler'); // MV 3
    const maxX = game.maxAffordableX(caster, game.spellCost(caster, stolen), stolen);
    const values = game.legalXValues(caster, stolen, {}, maxX);
    assert.equal(Array.from(values).join(','), '3');

    const decision = await MTG.chooseBotAction({
      gameState: game, botPlayerId: caster.idx, seed: 9,
      actionWindow: { type: 'chooseX', player: caster, min: 3, max: 3, values, card: stolen, aiHint: { kind: 'chooseX', card: stolen } },
    });
    assert.equal(MTG.unwrapBotDecisionAction(decision.action), 3);

    assert.equal(await game.castSpell(caster, stolen, { from: 'hand', xVal: 4 }), false);
    assert.equal(stolen.zone, 'hand');
    assert.equal(caster.pool.C, 4);
    assert.equal(await game.castSpell(caster, stolen, { from: 'hand', xVal: 3 }), true);
    assert.equal(target.zone, 'hand');
    assert.equal(game.bf().filter(card => card.ctrl === caster && card.hasSub('Faerie')).length, 3);
  }

  {
    const { game, players: [caster, opponent] } = rulesGame([], 2);
    caster.pool.U = 2;
    caster.pool.C = 2; // max X=2
    const stolen = inZone(caster, 'Stolen by the Fae', 'hand');
    permanent(game, opponent, 'Aether Channeler'); // jedina meta ima MV 3
    assert.equal(game.castableList(caster).some(entry => entry.card === stolen), false);
  }
});

test('Sylvan Offering sa X=0 ipak pravi oba izbora i pokušava napraviti oba 0/0 Treefolka', async () => {
  let opponentChoices = 0;
  const { game, players: [caster] } = rulesGame([
    (g, q) => {
      if (q.type === 'chooseOption' && q.aiHint?.kind === 'chooseOpponent') {
        opponentChoices++;
        return q.options[0].key;
      }
      return defaultDecision(g, q);
    },
  ], 3);
  const calls = [];
  const makeTokens = game.makeTokens.bind(game);
  game.makeTokens = async (def, player, opts) => {
    calls.push({ name: typeof def === 'string' ? def : def.name, player: player.name, n: opts?.n });
    return makeTokens(def, player, opts);
  };
  const offering = new MTG.CardInst(MTG.DEFS['Sylvan Offering'], caster);
  await offering.def.resolve({ g: game, src: offering, you: caster, x: 0, targets: [] });
  await game.checkSBA();
  assert.equal(opponentChoices, 2);
  assert.equal(calls.filter(call => call.name === 'Treefolk').length, 2);
  assert.equal(calls.filter(call => call.name === 'elfWarrior' && call.n === 0).length, 2);
  assert.equal(game.bf().some(card => card.name === 'Treefolk'), false, '0/0 Treefolk umiru kroz SBA');
});

test('Shark cycling, Rose Room pay X i Mycosynth Gardens target-MV X koriste isti legalni mana sloj', async () => {
  {
    const { game, players: [caster] } = rulesGame([], 2);
    caster.pool.U = 1;
    caster.pool.C = 4;
    inZone(caster, 'Island', 'library');
    const typhoon = inZone(caster, 'Shark Typhoon', 'hand');
    const entry = game.activatableList(caster).find(item => item.card === typhoon && item.cycling);
    assert.ok(entry);
    assert.equal(await game.activateAbility(caster, entry), true);
    const shark = game.bf().find(card => card.ctrl === caster && card.name === 'Shark');
    assert.ok(shark);
    assert.equal(shark.power, 3);
    assert.equal(shark.toughness, 3);
    assert.equal(typhoon.zone, 'graveyard');
  }

  {
    const { game, players: [caster, opponent] } = rulesGame([
      (g, q) => q.type === 'chooseTargets' ? [opponent] : defaultDecision(g, q),
    ], 2);
    const treasurer = permanent(game, caster, 'Rose Room Treasurer');
    treasurer.meta._rrTurn = game.turnNo;
    treasurer.meta._rr = 2;
    caster.pool.C = 3;
    await treasurer.def.triggers[0].run({ g: game, src: treasurer, you: caster, data: {} });
    assert.equal(opponent.life, 37);
    assert.equal(caster.pool.C, 0);
  }

  {
    const { game, players: [caster] } = rulesGame([], 2);
    addAnthem(game, caster);
    const gardens = permanent(game, caster, 'The Mycosynth Gardens');
    const walker = permanent(game, caster, 'Hangarback Walker');
    walker.castMeta = { x: 3, manaSpent: 6 };
    walker.counters['+1/+1'] = 3;
    game.recalc();
    assert.equal(walker.mv, 0);
    const entry = game.activatableList(caster).find(item => item.card === gardens && item.ability);
    assert.ok(entry);
    assert.equal(await game.activateAbility(caster, entry, [walker]), true);
    assert.equal(gardens.name, 'Hangarback Walker');
  }
});
