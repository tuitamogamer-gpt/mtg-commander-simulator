import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function table({ beforeResolve } = {}) {
  const game = new MTG.Game({ seed: 904, paced: false, maxTurns: 30 });
  let intercepted = false;
  const controller = { decide: async (g, q) => {
    if (q.type === 'priority') return { kind: 'pass' };
    if (q.type === 'main') return { kind: 'done' };
    if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 1);
    if (q.type === 'chooseOption') return q.options[0]?.key;
    if (q.type === 'chooseCards') return q.from.slice(0, q.min || 0);
    if (q.type === 'orderTriggers') return q.triggers;
    return [];
  } };
  const owner = game.addPlayer('Tree owner', { name: 'Blight Curse' }, controller, false);
  const opponent = game.addPlayer('Opponent', { name: 'Diagnostic' }, controller, true);
  game.turnPlayer = owner;
  game.turnNo = 9;
  game.phase = 'main1';
  game.step = 'main';
  function permanent(name, player = owner, overrides = {}) {
    const card = new MTG.CardInst({ ...MTG.DEFS[name], ...overrides }, player);
    card.zone = 'battlefield';
    card.ctrl = player;
    card.sick = false;
    game.battlefield.push(card);
    game.recalc();
    return card;
  }
  const tree = permanent('Tree of Perdition');
  for (const player of [owner, opponent]) for (let n = 0; n < 50; n++) {
    const card = new MTG.CardInst(MTG.DEFS.Forest, player);
    card.zone = 'library';
    player.library.push(card);
  }
  const events = [];
  const emit = game.emit;
  game.emit = async function (name, data) {
    if (name === 'lifeLost' || name === 'lifeGain') events.push({
      name, player: data.player, amount: data.n, treeToughness: tree.toughness, life: data.player.life,
    });
    return emit.call(this, name, data);
  };
  async function settle() {
    let count = 0;
    while ((game.stack.length || game.pendingTriggers.length) && count++ < 100) {
      await game.flushTriggers();
      if (game.stack.length) await game.resolveTop();
    }
    assert.ok(count < 100, 'stack settles');
  }
  async function exchange() {
    tree.tapped = false;
    tree.sick = false;
    game.recalc();
    const entry = game.activatableList(owner).find(row => row.card === tree && row.ability);
    assert.ok(entry, 'Tree activation is offered');
    assert.equal(await game.activateAbility(owner, entry), true);
    await settle();
  }
  async function block(power, keywords = []) {
    tree.tapped = false;
    const attacker = permanent('Grizzly Bears', opponent, { power: String(power), toughness: '50', kws: keywords });
    game.turnPlayer = opponent;
    game.phase = 'combat';
    attacker.attacking = owner;
    attacker.blockedBy = [tree];
    attacker.wasBlocked = true;
    tree.blocking = attacker.iid;
    assert.equal(game.canBlock(tree, attacker), true);
    game.combat = { attackers: [attacker], blockers: [tree] };
    await game.combatDamage(opponent, 'normal');
  }
  const state = { game, owner, opponent, tree, permanent, events, exchange, settle, block };
  const resolveTop = game.resolveTop;
  game.resolveTop = async function () {
    // Even a no-actions priority window auto-passes. Intercept the exact
    // resolving stack object instead of depending on an optional UI question.
    if (beforeResolve && !intercepted && this.stack.at(-1)?.kind === 'ability') {
      intercepted = true;
      await beforeResolve(state);
    }
    return resolveTop.call(this);
  };
  return state;
}

test('Tree 13↔40 exchange marks normal combat damage and dies at 40 damage, not 13', async () => {
  const { game, owner, opponent, tree, exchange, block } = table();
  await exchange();
  assert.equal(opponent.life, 13);
  assert.equal(tree.toughness, 40);
  await block(6);
  assert.equal(tree.damage, 6);
  assert.equal(tree.toughness, 40, 'marked damage is not reduced toughness');
  assert.equal(owner.life, 40, 'blocked damage does not reach the defender');
  await game.damageCreature(null, tree, 33);
  assert.equal(tree.damage, 39);
  assert.equal(tree.zone, 'battlefield');
  await game.damageCreature(null, tree, 1);
  assert.equal(tree.zone, 'graveyard');
});

test('Tree after exchange still dies to deathtouch and receives wither counters', async () => {
  const lethal = table();
  await lethal.exchange();
  await lethal.block(1, ['deathtouch']);
  assert.equal(lethal.tree.zone, 'graveyard');
  const wither = table();
  await wither.exchange();
  await wither.block(5, ['wither']);
  assert.equal(wither.tree.toughness, 35);
  assert.equal(wither.tree.counters['-1/-1'], 5);
  assert.equal(wither.tree.damage, 0);
});

test('Tree marked damage clears at cleanup while exchanged toughness persists', async () => {
  const { game, tree, exchange, block } = table();
  await exchange();
  await block(6);
  await game.runTurn();
  assert.equal(tree.damage, 0);
  assert.equal(tree.toughness, 40);
});

for (const mode of ['graveyard', 'blink', 'phase out', 'not a creature']) {
  test(`Tree exchange fails if its source is ${mode} before resolution`, async () => {
    const state = table({ beforeResolve: async ({ game, tree }) => {
      if (mode === 'phase out') { tree.phasedOut = true; game.recalc(); }
      else if (mode === 'not a creature') { tree.def = { ...tree.def, types: ['Enchantment'] }; game.recalc(); }
      else {
        await game.move(tree, mode === 'blink' ? 'exile' : 'graveyard');
        if (mode === 'blink') await game.move(tree, 'battlefield');
      }
    } });
    await state.exchange();
    assert.equal(state.opponent.life, 40, 'no partial exchange or last-known toughness');
    assert.equal(state.events.length, 0);
    if (mode === 'blink') assert.equal(state.tree.toughness, 13, 'new object is unchanged');
  });
}

test('Tree exchange emits actual life loss and triggers Vilis after the complete exchange', async () => {
  const { opponent, tree, permanent, exchange, events } = table();
  permanent('Vilis, Broker of Blood', opponent);
  const beforeHand = opponent.hand.length;
  await exchange();
  assert.equal(opponent.turnState.lifeLost, 27);
  assert.equal(opponent.turnState.lifeLossEvents, 1);
  assert.equal(opponent.hand.length, beforeHand + 27);
  assert.deepEqual(events.map(({ name, amount, treeToughness, life }) => ({ name, amount, treeToughness, life })),
    [{ name: 'lifeLost', amount: 27, treeToughness: 40, life: 13 }]);
  assert.equal(tree.toughness, 40);
});

test('Tree exchange emits life gain, and replacement effects modify only the life change', async () => {
  const { game, opponent, tree, permanent, exchange, events } = table();
  opponent.life = 5;
  permanent('Rhox Faithmender', opponent);
  await exchange();
  assert.equal(opponent.life, 21, 'gain eight is doubled to sixteen');
  assert.equal(opponent.turnState.lifeGained, 16);
  assert.equal(tree.toughness, 5, 'Tree gets the original life total, not the modified gain');
  assert.equal(events[0]?.name, 'lifeGain');
  assert.equal(events[0]?.treeToughness, 5);
  assert.equal(game.stack.length, 0);
});

test('Tree cannot exchange if the opponent would gain life but cannot gain life', async () => {
  const { opponent, tree, permanent, exchange, events } = table();
  opponent.life = 5;
  permanent('Everlasting Torment');
  await exchange();
  assert.equal(opponent.life, 5);
  assert.equal(tree.toughness, 13, 'neither half of an impossible exchange happens');
  assert.equal(events.length, 0);
});

test('Tree exchange ignores marked damage, reapplies counters, and uses layer 7b timestamp order', async () => {
  const { game, opponent, tree, exchange } = table();
  game.addOracleBasePT(tree, { power: 2, toughness: 8 });
  await game.addM1(tree, 2);
  await game.damageCreature(null, tree, 3);
  await exchange();
  assert.equal(opponent.life, 6, 'current toughness, not remaining damage capacity');
  assert.equal(tree.power, 0, 'exchange does not set power');
  assert.equal(tree.toughness, 38, 'new base forty, minus two counters');
  assert.equal(tree.damage, 3, 'exchange does not heal damage');
  game.addOracleBasePT(tree, { power: 5, toughness: 10 });
  assert.equal(tree.toughness, 8, 'a later base-setting effect wins');
  await game.move(tree, 'exile');
  await game.move(tree, 'battlefield');
  assert.equal(tree.toughness, 13, 'old continuous effects do not affect a new zone object');
});
