import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G'];

function table(role = 'human', color = 'G') {
  const questions = [];
  const game = new M.Game({ seed: 92426, paced: false });
  const player = game.addPlayer('Mana player', { name: 'Test' }, {
    decide: async (g, q) => {
      questions.push(q);
      if (q.type === 'chooseOption') return q.options.find(o => o.mana?.[color] || o.key === color)?.key ?? q.options[0]?.key;
      if (q.type === 'chooseManaSources') return { cards: q.suggested };
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
      if (q.type === 'orderTriggers') return q.triggers;
      if (q.type === 'priority') return { kind: 'pass' };
      return null;
    },
  }, role === 'ai');
  game.addPlayer('Opponent', { name: 'Test' }, { decide: async () => ({ kind: 'pass' }) }, true);
  if (role === 'ai') player.controller = new M.AIController(player, { difficulty: 'hard', style: 'balanced' });
  player.colorIdentity = COLORS.slice();
  game.turnPlayer = player; game.turnNo = 4; game.phase = 'main1'; game.step = 'main';
  game.priorityRound = async () => {};
  const put = (name, zone = 'battlefield') => {
    assert.ok(M.DEFS[name], name);
    const card = new M.CardInst(M.DEFS[name], player);
    card.zone = zone; card.ctrl = player; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : player[zone]).push(card);
    game.recalc();
    return card;
  };
  const actions = card => game.activatableList(player).filter(entry => entry.card === card && entry.manaAbility);
  const canPay = (cost, card, extra = {}) => game.canPayMana(player, M.parseCost(cost), { card, ...extra });
  return { game, player, put, actions, canPay, questions };
}

for (const color of COLORS) {
  test(`Somberwald Sage exposes a manual action producing three ${color} with one choice and no stack`, async () => {
    const f = table('human', color), sage = f.put('Somberwald Sage');
    const [action] = f.actions(sage);
    assert.ok(action, 'the creature must offer its mana ability in its card sheet');
    assert.match(action.label, /only.*creature spells/i);
    assert.equal(await f.game.activateAbility(f.player, action), true);
    assert.equal(sage.tapped, true);
    assert.equal(f.game.stack.length, 0);
    assert.equal(f.questions.length, 1);
    assert.equal(f.questions[0].options.length, 5);
    for (const other of [...COLORS, 'C']) assert.equal(f.player.pool[other], other === color ? 3 : 0);
    assert.equal(f.player.poolMeta.reduce((sum, entry) => sum + entry.n, 0), 3);
    assert.equal(await f.game.activateAbility(f.player, action), false, 'a retained entry cannot tap the source twice');
  });
}

for (const role of ['human', 'ai']) {
  test(`${role}: automatic payment uses Somberwald Sage for a real creature cast`, async () => {
    const f = table(role), sage = f.put('Somberwald Sage'), witness = f.put('Eternal Witness', 'hand');
    const casts = f.game.castableList(f.player);
    assert.ok(casts.some(entry => entry.card === witness));
    if (role === 'ai') {
      const choice = await f.player.controller.decide(f.game, {
        type: 'main', player: f.player, casts, acts: f.game.activatableList(f.player), lands: [], phase: 'main1',
      });
      assert.equal(choice.kind, 'cast'); assert.equal(choice.card, witness);
    }
    assert.equal(await f.game.castSpell(f.player, witness, { from: 'hand' }), true);
    assert.equal(sage.tapped, true);
    assert.equal(Object.values(f.player.pool).reduce((sum, n) => sum + n, 0), 0);
    assert.equal(f.player.poolMeta.length, 0);
  });
}

test('manual source selection can pay a creature spell with Somberwald Sage', async () => {
  const f = table(), sage = f.put('Somberwald Sage'), witness = f.put('Eternal Witness', 'hand');
  f.player.manualMana = true;
  assert.equal(await f.game.castSpell(f.player, witness, { from: 'hand' }), true);
  const payment = f.questions.find(q => q.type === 'chooseManaSources');
  assert.ok(payment);
  assert.deepEqual(Array.from(payment.suggested), [sage]);
  assert.equal(sage.tapped, true);
});

test('Sage cannot split its three mana between colors or produce colorless mana', async () => {
  const f = table(), sage = f.put('Somberwald Sage'), creature = f.put('Grizzly Bears', 'hand');
  for (const cost of ['{W}{U}', '{C}', '{4}']) {
    assert.equal(f.canPay(cost, creature), false, cost);
    assert.equal(await f.game.payMana(f.player, M.parseCost(cost), { card: creature }), false);
    assert.equal(sage.tapped, false);
  }
  assert.equal(f.canPay('{2}{G}', creature), true);
});

test('floating Sage mana keeps its restriction after the source leaves and empties at the phase boundary', async () => {
  const f = table(), sage = f.put('Somberwald Sage'), bear = f.put('Grizzly Bears', 'hand');
  const sorcery = f.put('Cultivate', 'hand');
  assert.equal(await f.game.activateAbility(f.player, f.actions(sage)[0]), true);
  await f.game.move(sage, 'graveyard');
  assert.equal(f.canPay('{G}', sorcery), false);
  assert.equal(f.canPay('{G}', bear, { isAbility: true }), false);
  assert.equal(f.canPay('{G}', bear, { isAbility: true, turnFaceUp: true }), false);
  assert.equal(f.canPay('{1}{G}', bear), true);
  assert.equal(await f.game.payMana(f.player, M.parseCost('{1}{G}'), { card: bear }), true);
  assert.equal(f.player.pool.G, 1);
  assert.equal(f.canPay('{G}', sorcery), false, 'the remaining mana is still restricted');
  f.game.emptyPool();
  assert.equal(f.player.pool.G, 0); assert.equal(f.player.poolMeta.length, 0);
});

test('Sage respects summoning sickness, haste, tap state and ability loss', () => {
  const f = table(), sage = f.put('Somberwald Sage');
  sage.sick = true;
  assert.equal(f.actions(sage).length, 0);
  sage.cur.kw.add('haste');
  assert.equal(f.actions(sage).length, 1);
  sage.tapped = true;
  assert.equal(f.actions(sage).length, 0);
  sage.tapped = false; sage.sick = false; sage.cur.abilitiesDisabled = true;
  assert.equal(f.actions(sage).length, 0);
});

// Adventure uses the spell's alternative characteristics. Face-down spells
// are creatures even when the printed card is a land (Zoetic Cavern).
// https://magic.wizards.com/en/news/feature/throne-eldraine-release-notes-2019-09-20
for (const name of ['Somberwald Sage', 'Ancient Ziggurat', 'Abundant Countryside']) {
  test(`${name} checks the spell being cast for both fresh and floating restricted mana`, async () => {
    const f = table(), source = f.put(name), adventurer = f.put('Lovestruck Beast', 'hand');
    const cavern = f.put('Zoetic Cavern', 'hand'), bestow = f.put('Boon Satyr', 'hand');
    const check = () => {
      assert.equal(f.canPay('{G}', adventurer), true);
      assert.equal(f.canPay('{G}', adventurer, { castOpts: { adventure: true } }), false);
      assert.equal(f.canPay('{G}', bestow, { castOpts: { bestow: true } }), false);
      assert.equal(f.canPay('{G}', cavern, { castOpts: { faceDownCast: true } }), true);
    };
    check();
    const action = f.actions(source).find(entry => entry.manaSource.m.restrict);
    assert.ok(action);
    assert.equal(await f.game.activateAbility(f.player, action), true);
    check();
  });
}

test('Sage pays for casting Zoetic Cavern face down through the real cast flow', async () => {
  const f = table(), sage = f.put('Somberwald Sage'), cavern = f.put('Zoetic Cavern', 'hand');
  const cast = f.game.castableList(f.player).find(entry => entry.card === cavern && entry.alt?.faceDownCast);
  assert.ok(cast, 'a face-down creature spell is a legal use of Sage mana');
  assert.equal(await f.game.castSpell(f.player, cavern, { from: cast.from, alt: cast.alt }), true);
  assert.equal(sage.tapped, true);
});

const formerlyHidden = [
  'Avengers Tower', 'Plaza of Heroes', 'Séance Board', 'Secluded Courtyard', 'Turtle Lair',
  'Unclaimed Territory', 'Villainous Hideout', 'Somberwald Sage', 'Abundant Countryside',
  'Ancient Ziggurat', "Elementalist's Palette", 'Flamebraider', 'Haven of the Spirit Dragon',
  'Opal Palace', 'Primal Beyond', 'Smokebraider', 'Biophagus', 'Pillar of Origins',
  'Nardole, Resourceful Cyborg', 'Codsworth, Handy Helper', 'Corrupted Crossroads',
  'James, Wandering Dad', 'Thieving Varmint', 'Overgrown Zealot', 'Throne of Eldraine',
];
for (const name of [...formerlyHidden, 'Llanowar Elves', 'Birds of Paradise', "Avacyn's Pilgrim"]) {
  test(`${name} offers every available mana ability without a per-card manual flag`, () => {
    const f = table(), source = f.put(name);
    Object.assign(source.counters, { soul: 2, charge: 2 });
    source.meta.cslColor = 'G';
    f.player.pool.C = 10;
    f.game.recalc();
    const sources = f.game.manaSources(f.player).filter(row => row.card === source);
    assert.ok(sources.length);
    const actions = f.actions(source);
    for (const row of sources) assert.ok(actions.some(entry => entry.manaSource.m === row.m),
      `${name}: ${JSON.stringify(row.produce)}`);
  });
}

test('a granted unrestricted mana ability stays separate from the land’s restricted ability', async () => {
  const f = table(), land = f.put('Ancient Ziggurat');
  f.put('Chromatic Lantern');
  const actions = f.actions(land);
  assert.equal(actions.length, 2);
  assert.ok(actions.some(entry => entry.manaSource.m.restrict));
  const unrestricted = actions.find(entry => !entry.manaSource.m.restrict);
  assert.ok(unrestricted);
  assert.equal(await f.game.activateAbility(f.player, unrestricted), true);
  assert.equal(f.canPay('{G}', f.put('Cultivate', 'hand')), true);
  assert.equal(f.player.poolMeta.length, 0);
});

test('AI does not float restricted mana when it has nothing to cast', async () => {
  const f = table('ai'); f.put('Somberwald Sage'); f.put('Flamebraider');
  const choice = await f.player.controller.decide(f.game, {
    type: 'main', player: f.player, casts: [], acts: f.game.activatableList(f.player), lands: [], phase: 'main1',
  });
  assert.equal(choice.kind, 'done');
});

for (const [name, eligible] of [
  ['Avengers Tower', 'Captain America, Team Leader'],
  ['Villainous Hideout', 'Doctor Doom, King of Latveria'],
]) {
  test(`${name} mana pays matching abilities as well as spells, including changelings`, async () => {
    const f = table('human', 'U'), source = f.put(name), target = f.put(eligible);
    const changeling = f.put('Chameleon Colossus'), other = f.put('Grizzly Bears');
    const check = () => {
      for (const card of [target, changeling]) {
        assert.equal(f.canPay('{U}', card), true);
        assert.equal(f.canPay('{U}', card, { isAbility: true }), true);
        assert.equal(f.canPay('{U}', card, { castOpts: { faceDownCast: true } }), false);
      }
      assert.equal(f.canPay('{U}', other, { isAbility: true }), false);
    };
    check();
    const action = f.actions(source).find(entry => entry.manaSource.m.restrict);
    assert.equal(await f.game.activateAbility(f.player, action), true);
    check();
    assert.equal(await f.game.payMana(f.player, M.parseCost('{U}'), { card: target, isAbility: true }), true);
    assert.equal(f.player.pool.U, 0);
  });
}

for (const [name, color] of [['Biophagus', 'G'], ["Pyromancer's Goggles", 'R']]) {
  for (const floating of [false, true]) {
    test(`${name} mana can pay ordinary abilities (${floating ? 'floating' : 'automatic'})`, async () => {
      const f = table('human', color), source = f.put(name), creature = f.put('Grizzly Bears');
      if (floating) assert.equal(await f.game.activateAbility(f.player, f.actions(source)[0]), true);
      const payment = { card: creature, isAbility: true };
      assert.equal(await f.game.payMana(f.player, M.parseCost(`{${color}}`), payment), true);
      assert.equal(f.player.pool[color], 0);
      assert.equal(payment.cdkBiophagus, undefined, 'ability payments do not grant creature-spell bonuses');
      assert.equal(payment.c21Goggles, undefined, 'ability payments do not copy spells');
    });
  }
}

for (const floating of [false, true]) {
  test(`Elementalist's Palette pays X ability costs, not other abilities of X-cost cards (${floating ? 'floating' : 'automatic'})`, async () => {
    const f = table(), palette = f.put("Elementalist's Palette"); palette.counters.charge = 4;
    const hydra = f.put('Hydra Broodmaster'), ballista = f.put('Walking Ballista');
    ballista.counters['+1/+1'] = 1; f.game.recalc();
    if (floating) {
      const action = f.actions(palette).find(entry => entry.manaSource.m.restrict);
      assert.equal(await f.game.activateAbility(f.player, action), true);
    }
    assert.equal(f.canPay('{4}', ballista, { isAbility: true }), false);
    assert.equal(f.canPay('{4}', hydra, { isAbility: true, cdkCostHasX: true }), true);
    assert.equal(await f.game.payMana(f.player, M.parseCost('{4}'), { card: hydra, isAbility: true, cdkCostHasX: true }), true);
    assert.equal(f.player.pool.C, 0);
  });
}

test('Palette supports the real X choice and payment for Hydra Broodmaster monstrosity', async () => {
  const f = table(), palette = f.put("Elementalist's Palette"), forest = f.put('Forest'), hydra = f.put('Hydra Broodmaster');
  palette.counters.charge = 4; f.game.recalc();
  const decide = f.player.controller.decide;
  let maximum;
  f.player.controller.decide = async (g, q) => {
    if (q.type === 'chooseX') { maximum = q.max; return 2; }
    return decide(g, q);
  };
  const action = f.game.activatableList(f.player).find(entry => entry.card === hydra && entry.ability);
  assert.ok(action);
  assert.equal(await f.game.activateAbility(f.player, action), true);
  assert.equal(maximum, 2);
  assert.equal(palette.tapped, true); assert.equal(forest.tapped, true);
  await f.game.resolveTop();
  assert.equal(hydra.counters['+1/+1'], 2);
});

test('Opal Palace colored mana can pay noncommander spells and abilities', async () => {
  const f = table(), palace = f.put('Opal Palace'), bear = f.put('Grizzly Bears', 'hand');
  f.player.pool.C = 2;
  assert.equal(await f.game.castSpell(f.player, bear, { from: 'hand' }), true);
  assert.equal(palace.tapped, true);
  assert.equal(bear.castMeta.opalPalaceMana, 0);
  palace.tapped = false; f.player.pool.C = 1;
  const action = f.actions(palace).find(entry => entry.manaSource.m.opalPalace);
  assert.equal(await f.game.activateAbility(f.player, action), true);
  assert.equal(f.canPay('{G}', f.put('Cultivate', 'hand')), true);
  assert.equal(await f.game.payMana(f.player, M.parseCost('{G}'), { card: bear, isAbility: true }), true);
});

for (const [from, previousCasts, expected] of [['command', 0, 1], ['command', 2, 3], ['hand', 2, 2]]) {
  test(`floating Opal Palace mana grants entry counters after the source leaves (${from}, ${previousCasts} prior command casts)`, async () => {
    const f = table('human', 'W'), palace = f.put('Opal Palace'), commander = f.put('Mikaeus, the Lunarch', from);
    commander.commander = true; commander.cmdCasts = previousCasts;
    f.player.pool.C = 1;
    assert.equal(await f.game.activateAbility(f.player, f.actions(palace).find(entry => entry.manaSource.m.opalPalace)), true);
    await f.game.move(palace, 'graveyard');
    f.player.pool.C = from === 'command' ? previousCasts * 2 : 0;
    assert.equal(await f.game.castSpell(f.player, commander, { from, xVal: 0 }), true);
    assert.equal(commander.castMeta.opalPalaceMana, 1);
    let countersAtEntry;
    const emit = f.game.emit;
    f.game.emit = async function (name, data) {
      if (name === 'etb' && data.card === commander) countersAtEntry = commander.counters['+1/+1'];
      return emit.call(this, name, data);
    };
    await f.game.resolveTop();
    assert.equal(commander.zone, 'battlefield', 'a 0/0 commander survives with its entry counters');
    assert.equal(countersAtEntry, expected, 'counters exist before ETB triggers observe the commander');
    assert.equal(commander.counters['+1/+1'], expected);
  });
}

test('an unspent Opal Palace activation cannot grant counters to a commander', async () => {
  const f = table('human', 'W'), palace = f.put('Opal Palace'), commander = f.put('Mikaeus, the Lunarch', 'command');
  commander.commander = true; f.player.pool.C = 1;
  assert.equal(await f.game.activateAbility(f.player, f.actions(palace).find(entry => entry.manaSource.m.opalPalace)), true);
  f.game.emptyPool(); f.player.pool.W = 1;
  assert.equal(await f.game.castSpell(f.player, commander, { from: 'command', xVal: 0 }), true);
  assert.equal(commander.castMeta.opalPalaceMana, 0);
  await f.game.resolveTop();
  assert.notEqual(commander.zone, 'battlefield');
});

test('each spent unit of doubled Opal Palace mana adds its commander entry bonus', async () => {
  const f = table('human', 'W'), palace = f.put('Opal Palace'), commander = f.put('Mikaeus, the Lunarch', 'command');
  f.put('Mana Reflection'); commander.commander = true; f.player.pool.C = 1;
  assert.equal(await f.game.activateAbility(f.player, f.actions(palace).find(entry => entry.manaSource.m.opalPalace)), true);
  assert.equal(f.player.pool.W, 2);
  assert.equal(await f.game.castSpell(f.player, commander, { from: 'command', xVal: 1 }), true);
  assert.equal(commander.castMeta.opalPalaceMana, 2);
  await f.game.resolveTop();
  assert.equal(commander.counters['+1/+1'], 3, 'one counter for X and two from the spent Palace mana');
});
