import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();

function add(game, player, name, zone = 'battlefield') {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.zone = zone; card.sick = false;
  if (zone === 'battlefield') game.battlefield.push(card);
  else player[zone].push(card);
  game.recalc();
  return card;
}

for (const sourceFirst of [true, false]) {
  test(`Living Death preserves a copied replacement source when it is sacrificed ${sourceFirst ? 'first' : 'last'}`, async () => {
    const game = new MTG.Game({ seed: 10108, paced: false });
    const controller = { decide: async (_, q) => q.type === 'priority' ? { kind: 'pass' }
      : q.type === 'chooseOption' ? q.options[0]?.key
      : q.type === 'orderTriggers' ? q.triggers : [] };
    const caster = game.addPlayer('Caster', { name: 'Test' }, controller, false);
    const opponent = game.addPlayer('Opponent', { name: 'Test' }, controller, false);
    game.turnPlayer = caster; game.turnNo = 8; game.phase = 'main1'; game.step = 'main';
    game.priorityRound = async () => {};
    caster.pool.B = 5;

    const carrier = add(game, caster, 'Air Elemental');
    MTG.OracleV8Copies.applyCopy(game, carrier, MTG.DEFS['Dauthi Voidwalker'], { controller: caster });
    game.recalc();
    assert.equal(carrier.name, 'Dauthi Voidwalker');
    const victim = add(game, opponent, 'Colossal Dreadmaw');
    const ownVictim = add(game, caster, 'Serra Angel');
    if (!sourceFirst) game.battlefield = [victim, ownVictim, carrier];
    const returningOwn = add(game, caster, 'Gravecrawler', 'graveyard');
    const returningEnemy = add(game, opponent, 'Air Elemental', 'graveyard');
    const retained = add(game, caster, 'Sol Ring', 'graveyard');
    const spell = add(game, caster, 'Living Death', 'hand');
    const previousBatch = game._simultaneousLeaveSources;
    const sacrificed = [];
    const emit = game.emit.bind(game);
    game.emit = async (name, data, ...args) => {
      if (name === 'sacrificed') sacrificed.push(data);
      return emit(name, data, ...args);
    };

    assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);
    assert.equal(caster.pool.B, 0, 'Living Death pays its five mana');
    for (let n = 0; n < 30 && (game.stack.length || game.pendingTriggers.length); n++) {
      await game.flushTriggers();
      if (game.stack.length) await game.resolveTop();
    }
    assert.equal(game.stack.length, 0);
    assert.equal(game.pendingTriggers.length, 0);
    assert.equal(game._simultaneousLeaveSources, previousBatch);
    assert.equal(carrier.zone, 'graveyard');
    assert.equal(carrier.name, 'Air Elemental', 'the physical card loses its copied characteristics');
    assert.equal(victim.zone, 'exile', 'the simultaneous replacement survives the copied source leaving');
    assert.equal(victim.counters.void, 1);
    assert.equal(ownVictim.zone, 'graveyard');
    assert.equal(returningOwn.zone, 'battlefield');
    assert.equal(returningEnemy.zone, 'battlefield');
    assert.equal(retained.zone, 'graveyard');
    assert.equal(spell.zone, 'graveyard');
    assert.equal(sacrificed.length, 3);
    assert.equal(sacrificed.find(row => row.card === carrier).snap.def.name, 'Dauthi Voidwalker');
    assert.equal(sacrificed.find(row => row.card === victim).player, opponent);
  });
}
