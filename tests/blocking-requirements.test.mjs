import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEngine } from './helpers/load-engine.mjs';

// CR 509.1c: a block declaration must fulfil the maximum possible number of
// printed requirements without breaking any restriction. These tests drive the
// engine's real combat phase and read the declaration the engine settled on.

function fixture(name, extra = {}) {
  return {
    name, cost: '{2}', super: [], types: ['Creature'], subtypes: ['Beast'],
    power: '0', toughness: '9', kws: [], oracle: '', ...extra,
  };
}

// The printed requirements are continuous effects, so they are declared the
// same way the compiled cards declare them and survive every recalculation.
const requires = (name, field, extra = {}) => fixture(name,
  { ...extra, statics: [{ apply: (game, self) => { self.cur[field] = true; } }] });

function permanent(MTG, game, player, def) {
  const card = new MTG.CardInst(def, player);
  card.zone = 'battlefield';
  card.sick = false;
  game.battlefield.push(card);
  return card;
}

// The declaration is only observable while combat is running: the engine
// clears `blockedBy` when combat ends, so it is snapshotted at the moment the
// engine publishes the finished declaration.
async function runCombat(MTG, seed, build, declareBlocks) {
  const game = new MTG.Game({ seed, paced: false, maxTurns: 4 });
  const attackerSide = game.addPlayer('A', { name: 'A' }, { decide: async () => ({ kind: 'pass' }) }, false);
  const defender = game.addPlayer('D', { name: 'D' }, { decide: async () => ({ kind: 'pass' }) }, false);
  game.turnPlayer = attackerSide;
  game.turnNo = 4;
  const board = build(game, attackerSide, defender, name => permanent(MTG, game, name.player, name.def));
  game.recalc();
  board.prepare();

  const snapshots = [];
  const note = game.note.bind(game);
  game.note = (kind, data) => {
    if (kind === 'combat') {
      snapshots.push({ step: game.step, rows: (game.combat.attackers || []).map(attacker =>
        ({ name: attacker.name, blockers: attacker.blockedBy.map(card => card.name).sort() })) });
    }
    return note(kind, data);
  };
  attackerSide.controller = { decide: async (g, q) => (q.type === 'attackers'
    ? board.attackers.map(card => ({ card, target: defender })) : { kind: 'pass' }) };
  defender.controller = { decide: async (g, q) => (q.type === 'blockers' ? declareBlocks(board) : { kind: 'pass' }) };

  await game.combatPhase(attackerSide);
  const declared = snapshots.filter(row => row.step === 'blockers');
  assert.ok(declared.length, 'the engine published a finished block declaration');
  // The engine runs in its own vm realm, so the declaration is compared as
  // plain values rather than as objects carrying that realm's prototypes.
  return JSON.parse(JSON.stringify(declared.at(-1).rows));
}

test('a legal split between two lure attackers is left alone', async () => {
  const MTG = loadEngine();
  const declaration = await runCombat(MTG, 31, (game, attackerSide, defender) => {
    const first = permanent(MTG, game, attackerSide, requires('Lure One', 'lure'));
    const second = permanent(MTG, game, attackerSide, requires('Lure Two', 'lure'));
    const blockerX = permanent(MTG, game, defender, fixture('Blocker X'));
    const blockerY = permanent(MTG, game, defender, fixture('Blocker Y'));
    return {
      attackers: [first, second], first, second, blockerX, blockerY,
      prepare: () => {},
    };
  }, board => ([{ blocker: board.blockerX, attacker: board.first },
    { blocker: board.blockerY, attacker: board.second }]));

  assert.deepEqual(declaration, [
    { name: 'Lure One', blockers: ['Blocker X'] },
    { name: 'Lure Two', blockers: ['Blocker Y'] },
  ], 'a declaration that already fulfils both requirements is never rewritten');
});

test('a lure attacker takes every creature that is free to block it', async () => {
  const MTG = loadEngine();
  const declaration = await runCombat(MTG, 32, (game, attackerSide, defender) => {
    const plain = permanent(MTG, game, attackerSide, fixture('Plain Attacker'));
    const lure = permanent(MTG, game, attackerSide, requires('Lure Attacker', 'lure'));
    const blocker = permanent(MTG, game, defender, fixture('Blocker'));
    return {
      attackers: [plain, lure], plain, lure, blocker,
      prepare: () => {},
    };
  }, board => ([{ blocker: board.blocker, attacker: board.plain }]));

  assert.deepEqual(declaration, [
    { name: 'Plain Attacker', blockers: [] },
    { name: 'Lure Attacker', blockers: ['Blocker'] },
  ], 'the lure takes the creature away from the attacker with no requirement');
});

test('a must-be-blocked attacker with menace is blocked by two creatures, not one', async () => {
  const MTG = loadEngine();
  const declaration = await runCombat(MTG, 33, (game, attackerSide, defender) => {
    const attacker = permanent(MTG, game, attackerSide,
      requires('Menacing Bait', 'mustBeBlocked', { kws: ['menace'] }));
    const blockerX = permanent(MTG, game, defender, fixture('Blocker X'));
    const blockerY = permanent(MTG, game, defender, fixture('Blocker Y'));
    return { attackers: [attacker], attacker, blockerX, blockerY, prepare: () => {} };
  }, () => []);

  assert.deepEqual(declaration, [{ name: 'Menacing Bait', blockers: ['Blocker X', 'Blocker Y'] }],
    'menace makes a single forced blocker illegal, so both able creatures block');
});

test('a must-be-blocked attacker with menace and one able blocker stays unblocked', async () => {
  const MTG = loadEngine();
  const declaration = await runCombat(MTG, 34, (game, attackerSide, defender) => {
    const attacker = permanent(MTG, game, attackerSide,
      requires('Menacing Bait', 'mustBeBlocked', { kws: ['menace'] }));
    const blocker = permanent(MTG, game, defender, fixture('Only Blocker'));
    return { attackers: [attacker], attacker, blocker, prepare: () => {} };
  }, () => []);

  assert.deepEqual(declaration, [{ name: 'Menacing Bait', blockers: [] }],
    'a requirement is never fulfilled by breaking a restriction');
});

test('trample assigns nothing to a blocker that is already lethally damaged', async () => {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 35, paced: false, maxTurns: 4 });
  const attackerSide = game.addPlayer('A', { name: 'A' }, { decide: async () => ({ kind: 'pass' }) }, false);
  const defender = game.addPlayer('D', { name: 'D' }, { decide: async () => ({ kind: 'pass' }) }, false);
  game.turnPlayer = attackerSide;
  game.turnNo = 4;
  const attacker = permanent(MTG, game, attackerSide,
    fixture('Trampling Striker', { power: '6', toughness: '6', kws: ['trample', 'double strike'] }));
  const blocker = permanent(MTG, game, defender,
    fixture('Indestructible Wall', { power: '0', toughness: '2', kws: ['indestructible'] }));
  game.recalc();
  const life = defender.life;
  attackerSide.controller = { decide: async (g, q) => (q.type === 'attackers'
    ? [{ card: attacker, target: defender }] : { kind: 'pass' }) };
  defender.controller = { decide: async (g, q) => (q.type === 'blockers'
    ? [{ blocker, attacker }] : { kind: 'pass' }) };

  await game.combatPhase(attackerSide);

  // First strike marks 2 on the blocker (lethal) and tramples 4 over; in the
  // normal step the blocker already has lethal damage, so all 6 trample over.
  assert.equal(life - defender.life, 10, 'no trample damage is wasted on an already-lethally-damaged blocker');
});
