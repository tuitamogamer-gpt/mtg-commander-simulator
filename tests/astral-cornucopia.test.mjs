import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
const COLORS = ['W', 'U', 'B', 'R', 'G'];

function table(decide = () => undefined, isAI = false) {
  const game = new MTG.Game({ seed: 91026, paced: false, maxTurns: 5 });
  const player = game.addPlayer('Cornucopia player', { name: 'Test' }, {
    decide: async (g, q) => {
      const answer = decide(g, q);
      if (answer !== undefined) return answer;
      if (q.type === 'chooseX') return 2;
      if (q.type === 'chooseOption') return q.options[0]?.key;
      if (q.type === 'chooseManaSources') return { auto: true };
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  }, isAI);
  game.addPlayer('Opponent', { name: 'Test' }, { decide: async () => ({ kind: 'pass' }) }, true);
  game.turnPlayer = player;
  game.turnNo = 3;
  game.phase = 'main1';
  game.step = 'main';
  const card = (name, zone = 'battlefield') => {
    const permanent = new MTG.CardInst(MTG.DEFS[name], player);
    permanent.zone = zone;
    permanent.sick = false;
    (zone === 'battlefield' ? game.battlefield : player[zone]).push(permanent);
    game.recalc();
    return permanent;
  };
  return { game, player, card };
}

test('Cornucopia chooses X once, then lets a human choose the colored sources for all three X symbols', async () => {
  const questions = [];
  let selected;
  const { game, player, card } = table((g, q) => {
    questions.push(q);
    if (q.type === 'chooseManaSources') return { cards: selected };
  });
  selected = ['Plains', 'Plains', 'Island', 'Island', 'Mountain', 'Mountain'].map(name => card(name));
  const spare = card('Forest');
  const cornucopia = card('Astral Cornucopia', 'hand');
  player.manualMana = false;

  assert.equal(await game.castSpell(player, cornucopia, { from: 'hand' }), true);
  const xs = questions.filter(q => q.type === 'chooseX');
  assert.equal(xs.length, 1);
  assert.equal(xs[0].cost.x, 3);
  assert.equal(xs[0].max, 2);
  assert.match(xs[0].reason, /charge counters/);
  const payments = questions.filter(q => q.type === 'chooseManaSources');
  assert.equal(payments.length, 1, 'this card offers a source choice even with the global automatic preference');
  assert.equal(payments[0].opts.xVal, 2);
  assert.equal(cornucopia.zone, 'battlefield');
  assert.equal(cornucopia.castMeta.x, 2);
  assert.equal(cornucopia.castMeta.manaSpent, 6);
  assert.equal(cornucopia.counters.charge, 2);
  assert.deepEqual({ ...cornucopia.castMeta.paymentColorCounts }, { W: 2, U: 2, R: 2 });
  assert.ok(selected.every(source => source.tapped));
  assert.equal(spare.tapped, false);
  assert.equal(player.manualMana, false, 'the per-card choice preserves the saved mana preference');
});

for (const color of COLORS) {
  test(`Cornucopia manually taps for all its counters in ${color} with one color choice and no stack`, async () => {
    const questions = [];
    const { game, player, card } = table((g, q) => {
      questions.push(q);
      if (q.type === 'chooseOption') return String(COLORS.indexOf(color));
    });
    player.pool.C = 6;
    const cornucopia = card('Astral Cornucopia', 'hand');
    await game.castSpell(player, cornucopia, { from: 'hand', xVal: 2 });
    const entry = game.activatableList(player).find(action => action.card === cornucopia && action.manaAbility);
    assert.ok(entry, 'a mana-only Cornucopia must expose its manual action');
    assert.equal(await game.activateAbility(player, entry), true);
    const choices = questions.filter(q => q.type === 'chooseOption');
    assert.equal(choices.length, 1);
    assert.equal(choices[0].options.length, 5);
    assert.ok(choices[0].options.every(option => option.n === 2));
    for (const other of [...COLORS, 'C']) assert.equal(player.pool[other], other === color ? 2 : 0);
    assert.equal(cornucopia.tapped, true);
    assert.equal(cornucopia.counters.charge, 2, 'producing mana does not spend charge counters');
    assert.equal(game.stack.length, 0);
    assert.equal(await game.activateAbility(player, entry), false, 'a retained action cannot tap the card twice');
  });
}

test('Cornucopia can choose another color after untapping and uses the current charge count', async () => {
  let color = 'U';
  const { game, player, card } = table((g, q) => {
    if (q.type === 'chooseOption') return String(COLORS.indexOf(color));
  });
  const cornucopia = card('Astral Cornucopia');
  game.addCounters(cornucopia, 'charge', 2);
  const action = () => game.activatableList(player).find(entry => entry.card === cornucopia && entry.manaAbility);
  assert.equal(await game.activateAbility(player, action()), true);
  cornucopia.tapped = false;
  game.addCounters(cornucopia, 'charge', 1);
  color = 'G';
  assert.equal(await game.activateAbility(player, action()), true);
  assert.equal(player.pool.U, 2);
  assert.equal(player.pool.G, 3);
  assert.equal(cornucopia.counters.charge, 3);
});

test('Cornucopia rejects too few selected sources before tapping or spending any mana', async () => {
  let selected;
  const { game, player, card } = table((g, q) => {
    if (q.type === 'chooseManaSources') return { cards: selected.slice(0, 5) };
  });
  selected = Array.from({ length: 6 }, () => card('Forest'));
  const cornucopia = card('Astral Cornucopia', 'hand');
  assert.equal(await game.castSpell(player, cornucopia, { from: 'hand', xVal: 2 }), false);
  assert.equal(cornucopia.zone, 'hand');
  assert.ok(selected.every(source => !source.tapped));
  assert.ok(Object.values(player.pool).every(amount => amount === 0));
});

test('Cornucopia applies a cost reduction once to the total and can use automatic payment for this cast', async () => {
  let payment;
  const { game, player, card } = table((g, q) => {
    if (q.type === 'chooseManaSources') { payment = q; return { auto: true }; }
  });
  card('Etherium Sculptor');
  const sources = Array.from({ length: 5 }, () => card('Island'));
  const cornucopia = card('Astral Cornucopia', 'hand');
  assert.equal(game.maxAffordableX(player, game.spellCost(player, cornucopia), cornucopia), 2);
  assert.equal(await game.castSpell(player, cornucopia, { from: 'hand' }), true);
  assert.equal(payment.cost.xReduction, 1);
  assert.equal(cornucopia.castMeta.manaSpent, 5);
  assert.equal(cornucopia.counters.charge, 2);
  assert.ok(sources.every(source => source.tapped));
});

test('Cornucopia does not interrupt AI payment or change automatic same-color mana production', async () => {
  const questions = [];
  const { game, player, card } = table((g, q) => { questions.push(q); }, true);
  const lands = Array.from({ length: 6 }, () => card('Forest'));
  const cornucopia = card('Astral Cornucopia', 'hand');
  assert.equal(await game.castSpell(player, cornucopia, { from: 'hand' }), true);
  assert.equal(questions.some(q => q.type === 'chooseManaSources'), false);
  assert.ok(lands.every(source => source.tapped));
  assert.equal(game.canPayMana(player, MTG.parseCost('{U}{G}')), false, 'one activation cannot split the counters across colors');
  assert.equal(await game.payMana(player, MTG.parseCost('{U}{U}')), true);
  assert.equal(cornucopia.tapped, true);
});

test('Cornucopia with X=0 or a free cast has no counters and produces no mana', async () => {
  for (const opts of [{ xVal: 0 }, { free: true, xVal: 5 }]) {
    const questions = [];
    const { game, player, card } = table((g, q) => { questions.push(q); });
    const cornucopia = card('Astral Cornucopia', 'hand');
    assert.equal(await game.castSpell(player, cornucopia, { from: 'hand', ...opts }), true);
    assert.equal(cornucopia.castMeta.x, 0);
    assert.equal(cornucopia.counters.charge || 0, 0);
    assert.equal(game.canPayMana(player, MTG.parseCost('{1}')), false);
    assert.equal(questions.some(q => q.type === 'chooseManaSources'), false);
  }
});

test('Live preserves the X cost preview, selected payment sources and the mana color decision', async () => {
  const plain = value => JSON.parse(JSON.stringify(value));
  const decisions = [];
  let player, selected;
  const state = table((game, q) => {
    const descriptor = MTG.onlineDecisionDescriptor(game, q, player, `cornucopia-${decisions.length}`);
    const model = new MTG.OnlineArenaView();
    model.update(plain(MTG.onlineGameViewFor(game, player)), player.idx);
    decisions.push(model.decision(plain(descriptor)));
    if (q.type === 'chooseManaSources') {
      assert.equal(MTG.onlineDecisionPreview(game, q, descriptor,
        { cards: selected.map(card => `c:${card.iid}`) }).valid, true);
      return { cards: selected };
    }
    if (q.type === 'chooseOption') return '4';
  });
  player = state.player;
  selected = Array.from({ length: 6 }, () => state.card('Forest'));
  const cornucopia = state.card('Astral Cornucopia', 'hand');
  assert.equal(await state.game.castSpell(player, cornucopia, { from: 'hand' }), true);
  assert.equal(decisions[0].cost.x, 3);
  assert.match(decisions[0].reason, /charge counters/);
  const payment = decisions.find(q => q.type === 'chooseManaSources');
  assert.equal(payment.opts.xVal, 2);
  const entry = state.game.activatableList(player).find(action => action.card === cornucopia && action.manaAbility);
  assert.equal(await state.game.activateAbility(player, entry), true);
  const color = decisions.find(q => q.type === 'chooseOption');
  assert.equal(color.options.length, 5);
  assert.ok(color.options.every(option => option.n === 2));
  assert.deepEqual(plain(color.options[4].mana), { G: 2 });
  assert.equal(player.pool.G, 2);
});
