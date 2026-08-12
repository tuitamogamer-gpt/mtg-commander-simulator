import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './helpers/load-engine.mjs';

function controller(overrides = {}) {
  return {
    decide: async (game, q) => {
      if (overrides[q.type]) return overrides[q.type](game, q);
      if (q.type === 'priority') return { kind: 'pass' };
      if (q.type === 'chooseTargets') return q.candidates.slice(0, q.min || 0);
      if (q.type === 'chooseOption') return q.options[0]?.key;
      if (q.type === 'orderTriggers') return q.triggers;
      return null;
    },
  };
}

function rulesGame(MTG, firstController = controller()) {
  const game = new MTG.Game({ seed: 71, paced: false, maxTurns: 10 });
  const first = game.addPlayer('First', { name: 'Test' }, firstController, false);
  const second = game.addPlayer('Second', { name: 'Test' }, controller(), true);
  game.turnPlayer = first;
  game.phase = 'main1';
  game.step = 'main';
  return { game, first, second };
}

function permanent(MTG, game, player, name, { sick = false } = {}) {
  const card = new MTG.CardInst(MTG.DEFS[name], player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = sick;
  game.battlefield.push(card);
  return card;
}

function testCreature(MTG, game, player, name, kws = []) {
  const card = new MTG.CardInst({
    name, cost: '{1}', super: [], types: ['Creature'], subtypes: ['Human'], kws,
    power: '2', toughness: '2', oracle: kws.join(', '),
    abilities: [{ label: 'Tap test', cost: { tap: true }, run: async () => {} }],
  }, player);
  card.ctrl = player;
  card.zone = 'battlefield';
  card.sick = true;
  game.battlefield.push(card);
  return card;
}

test('hexproof blokira protivnika ali ne i kontrolora; shroud blokira oboje', async () => {
  const MTG = loadEngine();
  const { game, first, second } = rulesGame(MTG);
  const host = permanent(MTG, game, first, 'Stalwart Pathlighter');
  const boots = permanent(MTG, game, first, 'Swiftfoot Boots');
  const greaves = permanent(MTG, game, first, 'Lightning Greaves');
  const targetSpec = { what: 'creature' };

  await game.attach(boots, host);
  assert.equal(host.kw('hexproof'), true);
  assert.equal(host.kw('haste'), true);
  assert.equal(game.legalTargets(targetSpec, boots, first).includes(host), true);
  assert.equal(game.legalTargets(targetSpec, boots, second).includes(host), false);

  await game.attach(greaves, host);
  assert.equal(host.kw('shroud'), true);
  assert.equal(host.kw('haste'), true);
  assert.equal(game.legalTargets(targetSpec, greaves, first).includes(host), false);
  assert.equal(game.legalTargets(targetSpec, greaves, second).includes(host), false);
});

test('meta koja dobije hexproof prije rezolucije postaje nelegalna i spell fizzla', async () => {
  const MTG = loadEngine();
  const { game, first: targetController, second: caster } = rulesGame(MTG);
  const target = permanent(MTG, game, targetController, 'Stalwart Pathlighter');
  const boots = permanent(MTG, game, targetController, 'Swiftfoot Boots');
  const spell = new MTG.CardInst(MTG.DEFS['Swords to Plowshares'], caster);
  spell.zone = 'hand';
  caster.hand.push(spell);
  caster.pool.W = 1;
  game.recalc();
  game.priorityRound = async () => {
    assert.deepEqual(game.stack.at(-1).targetSpecs, spell.def.targets);
    await game.attach(boots, target);
    await game.resolveTop();
  };

  assert.equal(await game.castSpell(caster, spell, { from: 'hand' }), true);

  assert.equal(target.zone, 'battlefield');
  assert.equal(spell.zone, 'graveyard');
});

test('equip ne može ciljati shroud, ali može vlastiti hexproof', async () => {
  const MTG = loadEngine();
  const { game, first } = rulesGame(MTG);
  const shrouded = permanent(MTG, game, first, 'Stalwart Pathlighter');
  const greaves = permanent(MTG, game, first, 'Lightning Greaves');
  const boots = permanent(MTG, game, first, 'Swiftfoot Boots');
  first.pool.C = 4;
  await game.attach(greaves, shrouded);

  assert.equal(game.activatableList(first).some(entry => entry.card === boots && entry.equip), false);

  const hexproof = permanent(MTG, game, first, 'Riders of Gavony');
  await game.attach(boots, hexproof);
  const cloak = permanent(MTG, game, first, 'Whispersilk Cloak');
  game.recalc();

  assert.equal(hexproof.kw('hexproof'), true);
  assert.equal(game.activatableList(first).some(entry => entry.card === cloak && entry.equip), true);
});

test('equip koristi stack i nakon priority kruga fizički veže obje karte', async () => {
  const MTG = loadEngine();
  const { game, first } = rulesGame(MTG);
  const host = permanent(MTG, game, first, 'Stalwart Pathlighter', { sick: true });
  const boots = permanent(MTG, game, first, 'Swiftfoot Boots');
  first.pool.C = 1;
  game.recalc();
  const entry = game.activatableList(first).find(candidate => candidate.card === boots && candidate.equip);

  assert.ok(entry);
  assert.equal(await game.activateAbility(first, entry, [host]), true);
  assert.equal(game.stack.length, 0);
  assert.equal(boots.attachedTo, host.iid);
  assert.deepEqual(Array.from(host.attachments), [boots.iid]);
  assert.equal(host.kw('haste'), true);
  assert.equal(host.kw('hexproof'), true);
});

test('haste preskače summoning sickness za napad i tap sposobnosti', async () => {
  const MTG = loadEngine();
  let eligible = [];
  const firstController = controller({
    attackers: async (game, q) => { eligible = q.eligible.slice(); return []; },
  });
  const { game, first } = rulesGame(MTG, firstController);
  const slow = testCreature(MTG, game, first, 'Slow Test Creature');
  const fast = testCreature(MTG, game, first, 'Hasty Test Creature', ['haste']);
  game.recalc();

  const acts = game.activatableList(first);
  assert.equal(acts.some(entry => entry.card === slow), false);
  assert.equal(acts.some(entry => entry.card === fast), true);

  await game.combatPhase(first);
  assert.equal(eligible.includes(slow), false);
  assert.equal(eligible.includes(fast), true);
});
