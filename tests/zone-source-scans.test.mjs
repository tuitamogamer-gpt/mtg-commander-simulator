import test from 'node:test';
import assert from 'node:assert/strict';
import {loadEngine} from './helpers/load-engine.mjs';

const M = loadEngine();
function fixture() {
  const game = new M.Game({seed: 102911, paced: false});
  const you = game.addPlayer('You', {name: 'You'}, null, false);
  const other = game.addPlayer('Other', {name: 'Other'}, null, false);
  const put = (name, zone = 'battlefield', owner = you) => {
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
    return card;
  };
  game.turnPlayer = you;
  return {game, you, other, put};
}
const colors = card => [...card.colors];

test('outside color sources preserve timestamp order and live control, suppression and phasing', async () => {
  const {game, you, other, put} = fixture();
  const bear = put('Grizzly Bears', 'hand'), foreign = put('Grizzly Bears', 'hand', other);
  const lattice = put('Mycosynth Lattice'), dawn = put('Celestial Dawn');
  lattice.timestamp = 1; dawn.timestamp = 2;
  game.recalc();
  assert.deepEqual(colors(bear), ['W']); assert.deepEqual(colors(foreign), []);
  dawn.ctrl = other;
  assert.deepEqual(colors(bear), []); assert.deepEqual(colors(foreign), ['W']);
  dawn.ctrl = you; dawn.phasedOut = true;
  assert.deepEqual(colors(bear), []);
  dawn.phasedOut = false; dawn.cur.abilitiesDisabled = true;
  assert.deepEqual(colors(bear), []);
  dawn.cur.abilitiesDisabled = false; lattice.timestamp = 3;
  assert.deepEqual(colors(bear), [], 'later Lattice removes the earlier Dawn color');
  await game.move(lattice, 'exile');
  assert.deepEqual(colors(bear), ['W']);
  await game.move(dawn, 'exile');
  assert.deepEqual(colors(bear), ['G']);
});

test('indexed creature grants retain live chosen type, controller and suppression checks', async () => {
  const {game, you, other, put} = fixture();
  const bear = put('Grizzly Bears', 'hand'), foreign = put('Grizzly Bears', 'graveyard', other);
  assert.equal(bear.hasSub('Goblin'), false); // Prime an empty source index.
  const adaptation = put('Arcane Adaptation'); adaptation.meta.bdfType = 'Goblin';
  game.recalc();
  assert.equal(bear.hasSub('Goblin'), true);
  adaptation.meta.bdfType = 'Elf';
  assert.equal(bear.hasSub('Goblin'), false); assert.equal(bear.hasSub('Elf'), true);
  adaptation.ctrl = other;
  assert.equal(bear.hasSub('Elf'), false); assert.equal(foreign.hasSub('Elf'), true);
  adaptation.phasedOut = true; assert.equal(foreign.hasSub('Elf'), false);
  adaptation.phasedOut = false; adaptation.cur.abilitiesDisabled = true;
  assert.equal(foreign.hasSub('Elf'), false);
  adaptation.cur.abilitiesDisabled = false; adaptation.ctrl = you;
  assert.equal(bear.hasSub('Elf'), true);
  await game.move(adaptation, 'exile');
  assert.equal(bear.hasSub('Elf'), false);
});

test('Swirl spell definitions follow source appearance, chosen color, phasing and removal', async () => {
  const {game, put} = fixture();
  const knight = put('White Knight', 'hand');
  const protection = definition => definition.oracleImplementation.find(row => row.kind === 'protection-from').from;
  const original = game.castDefinition(knight);
  assert.equal(protection(original), 'black');
  const swirl = put('Swirl the Mists'); swirl.meta.swirlColorV87 = 'red';
  game.recalc();
  const changed = game.castDefinition(knight);
  assert.ok(changed.c1719TextBase, 'the spell receives a rewritten rules definition');
  assert.equal(protection(changed), 'red', 'protection color changes');
  swirl.phasedOut = true;
  assert.equal(protection(game.castDefinition(knight)), 'black');
  swirl.phasedOut = false; swirl.cur.abilitiesDisabled = true;
  assert.equal(protection(game.castDefinition(knight)), 'black');
  swirl.cur.abilitiesDisabled = false; swirl.meta.swirlColorV87 = 'green';
  assert.equal(protection(game.castDefinition(knight)), 'green');
  await game.move(swirl, 'exile');
  assert.equal(protection(game.castDefinition(knight)), 'black');
});

test('repeated spell and off-board queries do not rescan 250 unrelated sources', t => {
  const {game, put} = fixture();
  const keys = ['oracleAllCreatureTypesV28', 'bdfAdaptation', 'oracleChosenCreatureTypesV28',
    'v83Lattice', 'v83Dawn', 'oracleSwirlV87', 'wlmFourth', 'wlmReturnPast'];
  const reads = Object.fromEntries(keys.map(key => [key, 0]));
  for (let i = 0; i < 250; i++) {
    const card = put('Scute Swarm'), definition = {...card.def};
    for (const key of keys) Object.defineProperty(definition, key, {get() {reads[key]++; return undefined;}});
    card.def = definition;
  }
  const bear = put('Grizzly Bears', 'hand');
  game.recalc();
  for (const key of keys) reads[key] = 0;
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(colors(bear), ['G']);
    assert.equal(bear.hasSub('Goblin'), false);
    assert.ok(game.castDefinition(bear).types.includes('Creature'));
    assert.deepEqual([...M.WLM.sources(game, bear.owner, 'wlmFourth')], []);
    assert.deepEqual([...M.WLM.sources(game, null, 'wlmReturnPast')], []);
  }
  for (const key of keys) assert.ok(reads[key] <= 500, `${key}: ${reads[key]} source inspections`);
  t.diagnostic(JSON.stringify(reads));
});

test('WHO sources retain board order and current controller, phasing, ability loss and definition changes', async () => {
  const {game, you, other, put} = fixture();
  const first = put('The Fourth Doctor'), second = put('The Fourth Doctor', 'battlefield', other);
  game.recalc();
  const sources = player => [...M.WLM.sources(game, player, 'wlmFourth')];
  assert.deepEqual(sources(null), [first, second]);
  assert.deepEqual(sources(you), [first]);
  second.ctrl = you;
  assert.deepEqual(sources(you), [first, second]);
  first.phasedOut = true;
  assert.deepEqual(sources(you), [second]);
  first.phasedOut = false; first.cur.abilitiesDisabled = true;
  assert.deepEqual(sources(you), [second]);
  first.cur.abilitiesDisabled = false;
  await game.move(first, 'exile');
  assert.deepEqual(sources(you), [second]);
  // Native zone entry installs the definition setter used by copy effects.
  const copy = put('Grizzly Bears', 'hand');
  await game.move(copy, 'battlefield');
  assert.deepEqual(sources(you), [second]);
  copy.def = {...M.DEFS['The Fourth Doctor']};
  assert.deepEqual(sources(you), [second, copy]);
  copy.def = {...M.DEFS['Grizzly Bears']};
  assert.deepEqual(sources(you), [second]);
});
