import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card, body} from './helpers/c21-fixtures.mjs';

// Exercise every supported restriction shape independently of the Oracle text
// importer. These are normalized rules consumed by the targeting engine.
const restriction = (f, kind, player = f.a) => {
  const rules = {
    self: {self: true, actionType: 'spell', opponentsOnly: true},
    aura: {attached: true, actionType: 'any', opponentsOnly: true, colors: ['R']},
    team: {filter: {what: 'creature', zone: 'battlefield', controller: 'you', min: 1, max: 1}, actionType: 'spell', opponentsOnly: true},
    grave: {filter: {what: 'card', zone: 'graveyard', controller: 'any'}, actionType: 'any'},
  };
  const c = body(f, player);
  c.def = {...c.def, name: 'Target Scan ' + kind, types: [kind === 'self' ? 'Creature' : 'Enchantment'],
    subtypes: kind === 'aura' ? ['Aura'] : [], oracleTargetRestrictionsV20: [rules[kind]],
    ...(kind === 'aura' ? {auraTarget: [M.T.creature()]} : {})};
  f.game.recalc();
  return c;
};

const targets = (f, source, player = f.a, action = 'spell', extra = {}) =>
  [...f.game.legalTargets({...M.T.creature(), oracleTargetActionV20: action, ...extra}, source, player)];

test('Shielding Plax follows the Aura controller, preserving candidate order after control, phasing and attachment changes', async () => {
  const f = setup(), a = body(f), b = body(f, f.b), c = body(f);
  const plax = card(f, 'Shielding Plax', 'battlefield', f.b), bolt = card(f, 'Lightning Bolt', 'hand');
  await f.game.attach(plax, a);
  assert.deepEqual(targets(f, bolt), [b, c]);
  assert.deepEqual(targets(f, bolt, f.b), [a, b, c]);
  M.OracleV8Control.gain(f.game, plax, f.a); f.game.recalc();
  assert.deepEqual(targets(f, bolt), [a, b, c]);
  assert.deepEqual(targets(f, bolt, f.b), [b, c]);
  plax.phasedOut = true;
  assert.deepEqual(targets(f, bolt, f.b), [a, b, c]);
  plax.phasedOut = false;
  M.OracleV8AbilityLoss.add(f.game, [plax], {});
  assert.deepEqual(targets(f, bolt, f.b), [a, b, c]);
  await f.game.move(plax, 'exile');
  await f.game.putPermanentOntoBattlefield(plax, f.b, {attachTo: c});
  assert.deepEqual(targets(f, bolt), [a, b]);
});

test('Self, attached and team restrictions keep exact controller, color and action scope', async () => {
  const f = setup(), self = restriction(f, 'self', f.b), own = body(f), enemy = body(f, f.b);
  const red = card(f, 'Lightning Bolt', 'hand'), blue = card(f, 'Opt', 'hand');
  assert.deepEqual(targets(f, red), [own, enemy]);
  assert.deepEqual(targets(f, red, f.b), [self, own, enemy]);
  assert.deepEqual(targets(f, red, f.a, 'ability'), [self, own, enemy]);
  const aura = restriction(f, 'aura', f.b);
  await f.game.attach(aura, own);
  assert.deepEqual(targets(f, red), [enemy]);
  assert.deepEqual(targets(f, blue), [own, enemy]);
  assert.deepEqual(targets(f, red, f.a, 'ability'), [self, enemy]);
  const team = restriction(f, 'team', f.b);
  assert.deepEqual(targets(f, blue), [own]);
  M.OracleV8Control.gain(f.game, team, f.a); f.game.recalc();
  assert.deepEqual(targets(f, blue), [own, enemy]);
  assert.deepEqual(targets(f, blue, f.b), [self, enemy]);
  self.phasedOut = true;
  aura.phasedOut = true;
  team.phasedOut = true;
  assert.deepEqual(targets(f, red), [own, enemy]);
  self.phasedOut = false; aura.phasedOut = false; team.phasedOut = false;
  for (const source of [self, aura, team]) M.OracleV8AbilityLoss.add(f.game, [source], {});
  assert.deepEqual(targets(f, red), [self, own, enemy]);
});

test('Graveyard restrictions and temporary object restrictions preserve zone identity and source-color overrides', async () => {
  const f = setup(), seal = restriction(f, 'grave'), first = card(f, 'Grizzly Bears', 'graveyard'), second = card(f, 'Grizzly Bears', 'graveyard', f.b);
  const red = card(f, 'Lightning Bolt', 'hand');
  const grave = {...M.T.creature(), zone: 'graveyard', anyGraveyard: true, filter: (g, c) => c.is('Creature')};
  assert.deepEqual(targets(f, red, f.a, 'spell', grave), []);
  seal.phasedOut = true;
  assert.deepEqual(targets(f, red, f.a, 'ability', grave), [first, second]);
  const protectedCreature = body(f), other = body(f);
  f.game.untilEffects.push({kind: 'oracleTargetRestrictionV20', source: seal, seat: f.b.idx,
    rule: {target: 0, objectIid: protectedCreature.iid, objectVersion: protectedCreature.zoneVersion,
      actionType: 'spell', opponentsOnly: true, colors: ['R']}});
  assert.deepEqual(targets(f, red), [other]);
  assert.deepEqual(targets(f, red, f.a, 'spell', {oracleTargetColorsV20: ['U']}), [protectedCreature, other]);
  assert.deepEqual(targets(f, red, f.a, 'ability'), [protectedCreature, other]);
  await f.game.move(protectedCreature, 'exile');
  await f.game.putPermanentOntoBattlefield(protectedCreature, f.a);
  assert.deepEqual(targets(f, red), [other, protectedCreature]);
});

test('A large creature board inspects Shielding Plax and permanent restriction eligibility only once per source', t => {
  const f = setup(), creatures = Array.from({length: 120}, () => body(f));
  const bolt = card(f, 'Lightning Bolt', 'hand');
  let plaxReads = 0, restrictionReads = 0;
  for (const creature of creatures) {
    const definition = {...creature.def};
    Object.defineProperty(definition, 'afcPlax', {get: () => {plaxReads++; return false;}});
    Object.defineProperty(definition, 'oracleTargetRestrictionsV20', {get: () => {restrictionReads++; return undefined;}});
    creature.def = definition;
  }
  assert.deepEqual(targets(f, bolt), creatures);
  assert.ok(plaxReads <= creatures.length * 2, `Shielding Plax source inspections: ${plaxReads}`);
  assert.ok(restrictionReads <= creatures.length * 2, `Restriction source inspections: ${restrictionReads}`);
  t.diagnostic(`120 candidates: ${plaxReads} Shielding Plax source inspections, ${restrictionReads} restriction source inspections`);
  plaxReads = 0; restrictionReads = 0;
  assert.deepEqual(targets(f, bolt, f.a, 'spell', {filter: () => false}), []);
  assert.equal(plaxReads, 0);
  assert.equal(restrictionReads, 0);
});
