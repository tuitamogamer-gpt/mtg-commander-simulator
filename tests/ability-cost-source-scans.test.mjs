import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body} from './helpers/c21-fixtures.mjs';

test('artifact discounts and Tithe Taker taxes keep their live controller, turn and ability scope', async () => {
  const f = setup(), source = card(f, 'Mind Stone'), tezzeret = card(f, 'Tezzeret, Betrayer of Flesh'),
    tithe = card(f, 'Tithe Taker', 'battlefield', f.b);
  const cost = () => f.game.abilityManaCost(f.a, source, '{5}').generic;
  f.game.turnPlayer = f.a;
  assert.equal(cost(), 3);
  f.game.turnPlayer = f.b;
  assert.equal(cost(), 4);
  tezzeret.phasedOut = true;
  assert.equal(cost(), 6);
  tezzeret.phasedOut = false;
  f.a.turnState.artifactAbilitiesActivated = 1;
  assert.equal(cost(), 6, 'the first-activation discount is spent');
  f.a.turnState.artifactAbilitiesActivated = 0;
  tezzeret.cur.abilitiesDisabled = true;
  assert.equal(cost(), 6);
  tezzeret.cur.abilitiesDisabled = false;
  tithe.cur.abilitiesDisabled = true;
  assert.equal(cost(), 3);
  tithe.cur.abilitiesDisabled = false;
  tezzeret.ctrl = f.b;
  assert.equal(cost(), 6);
  tithe.ctrl = f.a;
  assert.equal(cost(), 5);
  await f.game.move(tezzeret, 'exile');
  assert.equal(cost(), 5);
});

test('printed Food reducers follow native copies, control, phasing and removal', async () => {
  const f = setup(), sam = card(f, 'Sam, Loyal Attendant');
  const food = new M.CardInst(M.TOKENS.food, f.a); food.zone = 'battlefield';
  f.game.battlefield.push(food); f.game.recalc();
  const cost = () => f.game.abilityManaCost(f.a, food, '{2}').generic;
  assert.equal(cost(), 1);
  sam.phasedOut = true; assert.equal(cost(), 2);
  sam.phasedOut = false; sam.cur.abilitiesDisabled = true; assert.equal(cost(), 2);
  sam.cur.abilitiesDisabled = false; sam.ctrl = f.b; assert.equal(cost(), 2);
  sam.ctrl = f.a;
  const copy = card(f, 'Grizzly Bears', 'hand');
  await f.game.putPermanentOntoBattlefield(copy, f.a);
  M.OracleV8Copies.applyCopy(f.game, copy, sam.def); f.game.recalc();
  assert.equal(cost(), 0);
  await f.game.move(sam, 'exile'); assert.equal(cost(), 1);
  await f.game.move(copy, 'exile'); assert.equal(cost(), 2);
});

test('twenty ability cost queries on 250 ordinary permanents inspect each modifier key once', t => {
  const f = setup(), source = card(f, 'Mind Stone');
  const keys = ['firstArtifactAbilityDiscount', 'oracleAbilityCostV18', 'abilityCostReduction',
    'oracleAbilityFloorV20', 'cwwTithe'];
  const reads = Object.fromEntries(keys.map(key => [key, 0]));
  for (let i = 0; i < 250; i++) {
    const c = new M.CardInst(M.DEFS['Scute Swarm'], f.a); c.zone = 'battlefield';
    const definition = {...c.def};
    for (const key of keys) Object.defineProperty(definition, key, {get() {reads[key]++; return undefined;}});
    c.def = definition; f.game.battlefield.push(c);
  }
  f.game.recalc(); M.boardChanged();
  for (const key of keys) reads[key] = 0;
  for (let i = 0; i < 20; i++) assert.equal(f.game.abilityManaCost(f.a, source, '{5}').generic, 5);
  for (const key of keys) assert.equal(reads[key], 250, key);
  t.diagnostic(JSON.stringify(reads));
});
