import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

const MTG = loadEngine();
// Damage remains damage when represented by counters (CR 120.3d, 702.2b).
const fallback = q => q.type === 'chooseTargets' ? q.candidates.slice(0, q.min || 1)
  : q.type === 'chooseOption' ? q.options[0]?.key
  : q.type === 'chooseCards' ? q.from.slice(0, q.min || 0)
  : q.type === 'priority' ? { kind: 'pass' }
  : q.type === 'main' ? { kind: 'done' }
  : q.type === 'orderTriggers' ? q.triggers : [];

function table(role, { infect = false, wither = false, victim = 'Colossal Dreadmaw' } = {}) {
  const g = new MTG.Game({ seed: 90471, paced: false });
  const player = g.addPlayer('Caster', { name: 'Elven Council' }, null, role !== 'human');
  const opponent = g.addPlayer('Opponent', { name: 'Blight Curse' }, { decide: async (_g, q) => fallback(q) }, false);
  player.controller = role === 'human' ? { decide: async (_g, q) => fallback(q) }
    : new MTG.AIController(player, { difficulty: 'hard' });
  g.turnPlayer = player; g.turnNo = 9; g.phase = 'main1'; g.step = 'main';
  g.priorityRound = async () => {};
  const permanent = (name, owner = player) => {
    assert.ok(MTG.DEFS[name], name);
    const c = new MTG.CardInst(MTG.DEFS[name], owner);
    c.zone = 'battlefield'; c.sick = false; g.battlefield.push(c); g.recalc(); return c;
  };
  const source = permanent(infect ? 'Flensermite' : 'Sedge Scorpion');
  const target = permanent(victim, opponent);
  if (infect) g.attach(permanent('Basilisk Collar'), source);
  if (wither) permanent('Everlasting Torment');
  const events = [];
  const emit = g.emit.bind(g);
  g.emit = async (name, data) => {
    if (name === 'dealtDamage' && data.src === source) events.push({ zone: data.target.zone, damage: data.target.damage, counters: data.target.counters['-1/-1'] || 0, n: data.n });
    return emit(name, data);
  };
  async function slice() {
    player.pool.G = 1; player.pool.C = 2;
    const card = new MTG.CardInst(MTG.DEFS['Windswift Slice'], player);
    card.zone = 'hand'; player.hand.push(card);
    assert.equal(await g.castSpell(player, card, { from: 'hand' }), true);
    assert.deepEqual(Array.from(g.stack.at(-1).targets), [source, target]);
    assert.equal(player.pool.G + player.pool.C, 0);
    await g.resolveTop();
    assert.equal(card.zone, 'graveyard');
  }
  return { g, player, opponent, source, target, permanent, events, slice };
}

test('an immediate wither damage instruction emits damage before checking lethal toughness', async () => {
  const f = table('human', { wither: true, victim: 'Elvish Mystic' });
  await f.g.damageCreature(f.source, f.target, 1);
  assert.deepEqual(f.events, [{ zone: 'battlefield', damage: 0, counters: 1, n: 1 }]);
  assert.equal(f.target.zone, 'graveyard');
});

for (const role of ['human', 'hard']) {
  for (const keyword of ['wither', 'infect']) {
    test(`${role}: ${keyword} plus deathtouch destroys a creature even with no marked damage`, async () => {
      const f = table(role, { [keyword]: true });
      assert.equal(f.source.kw('deathtouch'), true);
      await f.slice();
      assert.equal(f.target.zone, 'graveyard');
      assert.deepEqual(f.events, [{ zone: 'battlefield', damage: 0, counters: 1, n: 1 }]);
      assert.equal(f.player.life, keyword === 'infect' ? 41 : 40, 'lifelink applies once unless Torment forbids life gain');
    });
  }

  for (const wither of [false, true]) {
    test(`${role}: old ${wither ? 'wither ' : ''}deathtouch does not kill a survivor after indestructible is removed`, async () => {
      const f = table(role, { wither });
      const plate = f.permanent('Darksteel Plate', f.opponent);
      f.g.attach(plate, f.target); f.g.recalc();
      assert.equal(f.target.kw('indestructible'), true);
      await f.slice();
      assert.equal(f.target.zone, 'battlefield');
      assert.equal(f.target.deathtouched, false, 'CR 704.5h remembers damage only until the next SBA check');
      await f.g.move(plate, 'graveyard');
      await f.g.checkSBA();
      assert.equal(f.target.kw('indestructible'), false);
      assert.equal(f.target.zone, 'battlefield', 'one old damage is not lethal to this creature');
      assert.equal(f.target.damage, wither ? 0 : 1);
      assert.equal(f.target.counters['-1/-1'] || 0, wither ? 1 : 0);
    });
  }

  test(`${role}: regeneration replaces wither/deathtouch destruction and leaves its counters`, async () => {
    const f = table(role, { wither: true });
    f.target.regenShield = 1;
    await f.slice();
    assert.equal(f.target.zone, 'battlefield');
    assert.equal(f.target.regenShield, 0);
    assert.equal(f.target.tapped, true);
    assert.equal(f.target.counters['-1/-1'], 1);
    assert.equal(f.target.deathtouched, false);
  });

  test(`${role}: lethal wither emits its damage event before the victim leaves`, async () => {
    const f = table(role, { wither: true, victim: 'Elvish Mystic' });
    await f.slice();
    assert.deepEqual(f.events, [{ zone: 'battlefield', damage: 0, counters: 1, n: 1 }]);
    assert.equal(f.target.zone, 'graveyard');
  });
}
