import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body} from './helpers/c21-fixtures.mjs';

const sources = (f, player = null) => [...M.POM.sources(f.game, player, 'pomConstrictor')];

test('POM sources preserve battlefield order and follow live control, phasing and ability loss', () => {
  const f = setup(), first = card(f, 'Winding Constrictor'), other = body(f),
    enemy = card(f, 'Winding Constrictor', 'battlefield', f.b), last = card(f, 'Winding Constrictor');
  assert.deepEqual(sources(f), [first, enemy, last]);
  assert.deepEqual(sources(f, f.a), [first, last]);
  assert.deepEqual(sources(f, f.b), [enemy]);
  M.OracleV8Control.gain(f.game, enemy, f.a); f.game.recalc();
  assert.deepEqual(sources(f, f.a), [first, enemy, last]);
  first.phasedOut = true;
  assert.deepEqual(sources(f), [enemy, last]);
  first.phasedOut = false;
  assert.deepEqual(sources(f), [first, enemy, last]);
  M.OracleV8AbilityLoss.add(f.game, [enemy], {});
  assert.deepEqual(sources(f), [first, last]);
  f.game.untilEffects = f.game.untilEffects.filter(e => e.kind !== 'oracleAbilityLoss');
  f.game.recalc();
  assert.deepEqual(sources(f), [first, enemy, last]);
  assert.equal(sources(f).includes(other), false);
});

test('POM source membership refreshes for native copies and entry-replacement views', async () => {
  const f = setup(), original = card(f, 'Winding Constrictor'), copy = card(f, 'Grizzly Bears', 'hand');
  await f.game.putPermanentOntoBattlefield(copy, f.a);
  assert.deepEqual(sources(f), [original]);
  M.OracleV8Copies.applyCopy(f.game, copy, original.def); f.game.recalc();
  assert.deepEqual(sources(f), [original, copy]);
  const previous = f.game._battlefieldEntryReplacementSnapshot;
  f.game._battlefieldEntryReplacementSnapshot = [original];
  f.game._entryReplacementPhase = 1;
  try { assert.deepEqual(sources(f), [original]); }
  finally {
    delete f.game._entryReplacementPhase;
    f.game._battlefieldEntryReplacementSnapshot = previous;
  }
  assert.deepEqual(sources(f), [original, copy]);
  M.OracleV8Copies.applyCopy(f.game, copy, M.DEFS['Grizzly Bears']); f.game.recalc();
  assert.deepEqual(sources(f), [original]);
  await f.game.move(original, 'exile');
  assert.deepEqual(sources(f), []);
});

test('Become the Pilot restricts only its current host and keeps the owner exception live', async () => {
  const f = setup(), third = f.others[1], attacker = body(f, f.b),
    other = body(f), ownerBlocker = body(f, f.b), thirdBlocker = body(f, third),
    pilot = card(f, 'Become the Pilot');
  await f.game.attach(pilot, attacker);
  assert.equal(attacker.ctrl, f.a);
  attacker.attacking = f.b;
  assert.equal(f.game.canBlock(ownerBlocker, attacker), true, 'the owner can block');
  attacker.attacking = third;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), false);
  other.attacking = third;
  assert.equal(f.game.canBlock(thirdBlocker, other), true, 'an unrelated attacker is unaffected');
  pilot.phasedOut = true;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), true);
  pilot.phasedOut = false;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), false);
  M.OracleV8AbilityLoss.add(f.game, [pilot], {});
  attacker.attacking = third;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), true);
  f.game.untilEffects = f.game.untilEffects.filter(e => e.kind !== 'oracleAbilityLoss');
  f.game.recalc(); attacker.attacking = third;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), false);
  await f.game.attach(pilot, other);
  attacker.attacking = third; other.attacking = third;
  assert.equal(f.game.canBlock(thirdBlocker, attacker), true, 'the former host can be blocked');
  assert.equal(f.game.canBlock(thirdBlocker, other), false, 'the new host gets the restriction');
});

test('Repeated POM queries and block checks inspect printed source keys once per stable board', t => {
  const f = setup(), cards = Array.from({length: 250}, (_, i) => {
    const c = new M.CardInst(M.DEFS['Grizzly Bears'], i ? f.a : f.b);
    c.zone = 'battlefield'; c.sick = false; f.game.battlefield.push(c); return c;
  });
  f.game.recalc();
  let constrictorReads = 0, pilotReads = 0;
  for (const c of cards) {
    const def = {...c.def};
    Object.defineProperty(def, 'pomConstrictor', {get() {constrictorReads++; return false;}});
    Object.defineProperty(def, 'wlmPilot', {get() {pilotReads++; return false;}});
    c.def = def;
  }
  M.boardChanged();
  cards[1].attacking = f.b;
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(sources(f), []);
    assert.equal(f.game.canBlock(cards[0], cards[1]), true);
  }
  assert.equal(constrictorReads, cards.length);
  assert.equal(pilotReads, cards.length);
  t.diagnostic(`250 permanents, 20 queries each: ${constrictorReads} POM source reads and ${pilotReads} Pilot source reads`);
});
