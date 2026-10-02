import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { loadEngine } from './helpers/load-engine.mjs';

const M = loadEngine();

function setup() {
  const game = new M.Game({ seed: 93017, paced: false });
  const player = game.addPlayer('You', { name: 'Stall probe' }, { decide: async () => null }, false);
  game.addPlayer('Opponent', { name: 'Opponent' }, { decide: async () => null }, true);
  game.turnPlayer = player; game.turnNo = 9; game.phase = 'main1';
  const put = (name, extra) => {
    const def = extra ? { name, cost: '', super: [], types: ['Artifact'], subtypes: [], kws: [], oracle: '', ...extra } : M.DEFS[name];
    assert.ok(def, name);
    const card = new M.CardInst(def, player);
    card.zone = 'battlefield'; card.ctrl = player; card.sick = false;
    game.battlefield.push(card);
    return card;
  };
  // Mirrors the Vibranium token: colorless mana spendable only on artifact spells.
  const artifactSpellMana = () => put('Artifact-spell mana rock', {
    mana: { cost: { tap: true }, produce: [{ C: 1 }], restrict: (g, spend) => !!(spend && spend.card && spend.card.is('Artifact') && !spend.isAbility) },
  });
  return { game, player, put, artifactSpellMana };
}

test('restricted mana that cannot pay an ability or feed a filter is not searched for an impossible equip cost', () => {
  const f = setup();
  for (let index = 0; index < 12; index++) f.artifactSpellMana();
  f.put('Birds of Paradise');
  f.put('Sungrass Prairie');
  const equipment = f.put('Bonesplitter');
  f.game.recalc();
  const started = performance.now();
  const payable = f.game.canPayMana(f.player, M.parseCost('{3}'), { card: equipment, isAbility: true }, { artifactAbilityAlreadyUsed: true });
  const elapsed = performance.now() - started;
  assert.equal(payable, false, 'Birds of Paradise and Sungrass Prairie make at most two mana for an ability');
  // The previous search took about 2.5 s here; the pruned probe takes milliseconds.
  assert.ok(elapsed < 1000, `impossible probe finished in ${elapsed.toFixed(0)}ms`);
  // The same sources still pay what they legally can.
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{2}'), { card: equipment, isAbility: true }, { artifactAbilityAlreadyUsed: true }), true);
});

test('restricted mana stays available for the spells it is allowed to pay', () => {
  const f = setup();
  for (let index = 0; index < 3; index++) f.artifactSpellMana();
  f.game.recalc();
  const artifactSpell = new M.CardInst(M.DEFS['Bonesplitter'], f.player);
  artifactSpell.zone = 'hand'; f.player.hand.push(artifactSpell);
  const creatureSpell = new M.CardInst(M.DEFS['Birds of Paradise'], f.player);
  creatureSpell.zone = 'hand'; f.player.hand.push(creatureSpell);
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{3}'), { card: artifactSpell }), true);
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{1}'), { card: creatureSpell }), false);
});

test('equip targets are offered with the same spending context as the equip payment', () => {
  const f = setup();
  // Mana that may pay activated abilities, but not a context-free probe.
  f.put('Ability-only mana rock', {
    mana: { cost: { tap: true }, produce: [{ C: 1 }], restrictAbilities: true, restrict: (g, spend) => !!(spend && spend.isAbility) },
  });
  const equipment = f.put('Bonesplitter');
  const creature = f.put('Birds of Paradise');
  creature.tapped = true;
  f.game.recalc();
  const equip = f.game.activatableList(f.player).find(entry => entry.card === equipment && entry.equip !== undefined);
  assert.ok(equip, 'Equip {1} is offered when ability-only mana can pay it');
});

test('restricted mana that can fund a filter is kept for the converter', () => {
  const f = setup();
  // Ability-only mana cannot pay a spell directly, but can activate Sungrass Prairie.
  f.put('Ability-only mana rock', {
    mana: { cost: { tap: true }, produce: [{ C: 1 }], restrictAbilities: true, restrict: (g, spend) => !!(spend && spend.isAbility) },
  });
  f.put('Sungrass Prairie');
  f.game.recalc();
  const creature = new M.CardInst(M.DEFS['Birds of Paradise'], f.player);
  creature.zone = 'hand'; f.player.hand.push(creature);
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{G}{W}'), { card: creature }), true);
});

test('a converter that nothing can fund is dropped, and a funded one still pays', () => {
  const f = setup();
  f.put('Cascading Cataracts');
  const mountains = [f.put('Mountain'), f.put('Mountain'), f.put('Mountain'), f.put('Mountain')];
  f.game.recalc();
  const spell = new M.CardInst(M.DEFS['Birds of Paradise'], f.player);
  spell.zone = 'hand'; f.player.hand.push(spell);
  const started = performance.now();
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{W}{U}{B}{R}{G}'), { card: spell }), false,
    'four Mountains cannot fund the {5} activation');
  assert.ok(performance.now() - started < 1000);
  mountains.push(f.put('Mountain'));
  f.game.recalc();
  assert.equal(f.game.canPayMana(f.player, M.parseCost('{W}{U}{B}{R}{G}'), { card: spell }), true,
    'five Mountains fund Cascading Cataracts for five mana of any colors');
});
