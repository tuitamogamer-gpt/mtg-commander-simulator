import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const fallback = q => q.type === 'priority' ? { kind: 'pass' }
  : q.type === 'main' ? { kind: 'done' }
    : q.type === 'chooseManaSources' ? { cards: q.suggested }
      : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
        : q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 0)
          : q.type === 'chooseOption' ? q.options[0]?.key : null;

function fixture(role = 'human') {
  const game = new MTG.Game({ seed: 914, paced: false });
  const player = game.addPlayer('Actor', { name: 'Manifest regression' }, null, role === 'ai');
  const opponent = game.addPlayer('Opponent', { name: 'Test' }, { decide: async (g, q) => fallback(q) }, false);
  player.controller = role === 'ai' ? new MTG.AIController(player, { difficulty: 'hard', style: 'balanced' })
    : { decide: async (g, q) => fallback(q) };
  game.turnPlayer = player; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
  const put = (name, zone = 'battlefield') => {
    const card = new MTG.CardInst(typeof name === 'string' ? MTG.DEFS[name] : name, player);
    card.zone = zone; card.ctrl = player; card.sick = false;
    if (zone === 'battlefield') game.battlefield.push(card); else player[zone].push(card);
    game.recalc(); return card;
  };
  const window = () => ({ type: 'main', player, casts: game.castableList(player), lands: [], acts: game.activatableList(player) });
  const manifest = async name => { const card = put(name, 'hand'); await game.manifestCard(player, card); return card; };
  return { game, player, opponent, put, window, manifest };
}

for (const role of ['human', 'ai']) {
  test(`${role}: Overgrown Zealot alone pays to turn a manifested creature face up`, async () => {
    const f = fixture(role), zealot = f.put('Overgrown Zealot'), bear = await f.manifest('Grizzly Bears');
    f.player.manualMana = role === 'human';
    const q = f.window();
    const action = role === 'ai' ? await f.player.controller.decide(f.game, q)
      : { kind: 'activate', entry: q.acts.find(entry => entry.card === bear && entry.turnFaceUp) };
    assert.ok(action.entry?.turnFaceUp, 'the special two-mana source must make the action available');
    assert.equal(await f.game.performAction(f.player, action), true);
    assert.equal(bear.name, 'Grizzly Bears'); assert.equal(bear.faceDown, false);
    assert.equal(zealot.tapped, true); assert.equal(f.game.stack.length, 0);
    assert.equal(Object.values(f.player.pool).reduce((a, b) => a + b, 0), 0);
  });
}

test('Zealot floating mana is available only for turning face up; spell-only mana remains excluded', async () => {
  const f = fixture(), zealot = f.put('Overgrown Zealot'), bear = await f.manifest('Grizzly Bears');
  const handBear = f.put('Grizzly Bears', 'hand');
  assert.equal(f.game.castableList(f.player).some(entry => entry.card === handBear), false);
  const source = f.game.manaSources(f.player, null).find(source => source.card === zealot && source.m.restrict);
  assert.equal(await f.game.activateManaSource(f.player, source, { G: 2 }), true);
  assert.equal(f.game.canPayMana(f.player, MTG.parseCost('{1}{G}'), { card: handBear }), false);
  assert.equal(f.game.canPayMana(f.player, MTG.parseCost('{1}{G}'), { card: bear, isAbility: true }), false);
  assert.equal(await f.game.turnFaceUp(f.player, bear), true);

  const sage = f.put('Somberwald Sage'), second = await f.manifest('Grizzly Bears');
  assert.equal(f.game.activatableList(f.player).some(entry => entry.card === second && entry.turnFaceUp), false);
  assert.equal(await f.game.turnFaceUp(f.player, second), false);
  assert.equal(sage.tapped, false);
});

test('local AI develops a large manifested creature even while holding interaction', async () => {
  const f = fixture('ai'), angel = await f.manifest('Serra Angel');
  f.put('Counterspell', 'hand');
  for (const name of ['Plains', 'Plains', 'Forest', 'Forest', 'Forest', 'Island', 'Island']) f.put(name);
  await f.game.mainPhase(f.player);
  assert.equal(angel.faceDown, false);
  assert.equal(angel.power, 4); assert.equal(angel.kw('flying'), true);
  assert.equal(f.game.stack.length, 0);
  assert.equal(f.game.aiDecisionLog.some(row => row.fallback), false);
});

for (const search of [false, true]) test(`AI ${search ? 'with search' : 'without search'} turns up the stronger manifest when it can afford only one`, async () => {
  const f = fixture('ai'), bear = await f.manifest('Grizzly Bears'), angel = await f.manifest('Serra Angel');
  for (const name of ['Plains', 'Plains', 'Forest', 'Forest', 'Forest']) f.put(name);
  f.game.paced = search; f.game.pace = async () => {};
  const action = await f.player.controller.decide(f.game, f.window());
  assert.equal(action.entry?.card, angel);
  assert.equal(await f.game.performAction(f.player, action), true);
  assert.equal(bear.faceDown, true); assert.equal(angel.faceDown, false);
  assert.doesNotMatch(JSON.stringify(f.game.aiDecisionLog), /Grizzly Bears|Serra Angel/,
    'private alternatives stay hidden in the public AI decision log');
});

test('AI does not pay to turn a manifest into a creature that immediately dies', async () => {
  const f = fixture('ai'), walker = await f.manifest('Hangarback Walker');
  const action = await f.player.controller.decide(f.game, f.window());
  assert.equal(action.kind, 'done');
  assert.equal(walker.faceDown, true); assert.equal(walker.toughness, 2);
});

test('AI accounts for Hooded Hydra gaining counters as it turns face up', async () => {
  const f = fixture('ai'), hydra = await f.manifest('Hooded Hydra');
  f.put('Forest'); f.put('Forest');
  const action = await f.player.controller.decide(f.game, f.window());
  assert.equal(action.entry?.card, hydra);
  assert.equal(await f.game.performAction(f.player, action), true);
  assert.equal(hydra.faceDown, false); assert.equal(hydra.zone, 'battlefield');
  assert.equal(hydra.power, 5); assert.equal(hydra.counters['+1/+1'], 5);
});

test('AI simulation preserves the chosen morph cost when manifest offers two payments', async () => {
  const f = fixture('ai'), card = await f.manifest('Abzan Guide');
  for (const color of ['W', 'B', 'G', 'C']) f.player.pool[color] = 10;
  const acts = f.game.activatableList(f.player).filter(entry => entry.card === card && entry.turnFaceUp);
  assert.equal(acts.length, 2);
  const entry = acts.find(entry => entry.faceUpKind === 'morph');
  assert.ok(entry);
  const simulation = await MTG.simulateAction(f.game, { kind: 'activate', entry }, { playerId: f.player.idx, seed: 914 });
  assert.equal(simulation.applied, true);
  const spent = 40 - Object.values(simulation.state.players[f.player.idx].pool).reduce((a, b) => a + b, 0);
  assert.equal(spent, MTG.mv(entry.faceUpCost));
  assert.equal(card.faceDown, true, 'simulation leaves the real battlefield unchanged');
});
