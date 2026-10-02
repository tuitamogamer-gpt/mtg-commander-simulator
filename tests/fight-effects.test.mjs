import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

// Both scripts called a helper that does not exist (E.fight); resolving them
// threw and ended the whole game.
const M = loadEngine();

function fixture() {
  const game = new M.Game({ seed: 20930, paced: false });
  const you = game.addPlayer('You', { name: 'Fight' }, { decide: async () => null }, false);
  const them = game.addPlayer('Opponent', { name: 'Fight' }, { decide: async () => null }, true);
  game.turnPlayer = you; game.turnNo = 5; game.phase = 'main1';
  const put = (name, owner) => {
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = 'battlefield'; card.ctrl = owner; card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  return { game, you, them, put };
}

test("Tovolar's Packleader makes another Wolf fight an opposing creature", async () => {
  const f = fixture();
  const packleader = f.put("Tovolar's Huntmaster", f.you);
  assert.ok(M.OracleV8Faces.setFace(packleader, 'back'));
  const wolf = f.put('Grizzly Bears', f.you);
  wolf.def = { ...wolf.def, subtypes: ['Wolf'] };
  const victim = f.put('Llanowar Elves', f.them);
  f.game.recalc();
  const ability = packleader.def.abilities.find(entry => /fights an opposing creature/.test(entry.label));
  assert.ok(ability);
  await ability.run({ g: f.game, you: f.you, src: packleader, targets: [wolf, victim] });
  assert.equal(victim.zone, 'graveyard', 'the 2-power Wolf destroys the 1/1 Elves');
  assert.equal(wolf.damage, 1, 'the Elves deal their power back');
});

test("Dromoka's Command lets your creature fight a creature you do not control", async () => {
  const f = fixture();
  const mine = f.put('Grizzly Bears', f.you);
  const theirs = f.put('Llanowar Elves', f.them);
  f.game.recalc();
  const mode = M.DEFS["Dromoka's Command"].modes.list.find(entry => /fights/.test(entry.label));
  assert.ok(mode);
  await mode.run({ g: f.game, you: f.you, targets: [mine, theirs] });
  assert.equal(theirs.zone, 'graveyard');
  assert.equal(mine.damage, 1);
});
