import test from 'node:test';
import assert from 'node:assert/strict';
import {M, setup, card} from './helpers/c21-fixtures.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const rawSource = c => ({card: c, extraCost: {tap: true}, m: c.def.mana});
const plan = (f, c) => M.oracleManaReplacementPlanV66(f.game, c.ctrl, c, [{G: 1}], {source: rawSource(c)});
const virtue = f => card(f, M.resolveDeckCardName('Virtue of Strength'));

test('Virtue and Contamination retain replacement order, excluded sources and native mana production', async () => {
  const f = setup(), forest = card(f, 'Forest'), triple = virtue(f), black = card(f, 'Contamination');
  const options = plan(f, forest);
  assert.deepEqual(plain(options.produce), [{B: 1}, {B: 3}]);
  assert.deepEqual(plain(options.maps.map(row => row.path.map(step => step.key))), [
    [`v66-mana:${triple.iid}:${triple.zoneVersion}:triple`, `v66-mana:${black.iid}:${black.zoneVersion}:contamination`],
    [`v66-mana:${black.iid}:${black.zoneVersion}:contamination`, `v66-mana:${triple.iid}:${triple.zoneVersion}:triple`],
  ]);
  const source = f.game.manaSources(f.a).find(row => row.card === forest);
  assert.ok(source.oracleManaPlanV66);
  for (const [excluded, expected] of [[[black], {G: 3}], [[triple], {B: 1}], [[black, triple], {G: 1}]]) {
    const selected = await M.oraclePrepareManaReplacementV66(f.game, f.a, source, {B: 3}, {excludedReplacementCards: excluded});
    assert.deepEqual(plain(selected.production), expected);
    assert.equal(selected.valid(), true);
  }
  assert.equal(await f.game.activateManaSource(f.a, source, {B: 3}), true);
  assert.equal(forest.tapped, true);
  assert.equal(f.a.pool.B, 3);
});

test('Mana replacement membership follows native copies, control, phasing and ability loss', async () => {
  const f = setup(), forest = card(f, 'Forest'), triple = virtue(f), original = card(f, 'Contamination'),
    copy = card(f, 'Grizzly Bears', 'hand');
  await f.game.putPermanentOntoBattlefield(copy, f.a);
  assert.equal(plan(f, forest).produce.some(row => row.B === 3), true);
  M.OracleV8Copies.applyCopy(f.game, copy, original.def); f.game.recalc();
  await f.game.move(original, 'exile');
  assert.equal(plan(f, forest).produce.some(row => row.B === 3), true, 'the copied replacement remains');
  M.OracleV8Control.gain(f.game, triple, f.b); f.game.recalc();
  assert.deepEqual(plain(plan(f, forest).produce), [{B: 1}], 'the opponent virtue does not triple our land');
  copy.phasedOut = true;
  assert.equal(plan(f, forest), undefined);
  copy.phasedOut = false;
  assert.deepEqual(plain(plan(f, forest).produce), [{B: 1}]);
  M.OracleV8AbilityLoss.add(f.game, [copy], {});
  assert.equal(plan(f, forest), undefined);
  f.game.untilEffects = f.game.untilEffects.filter(row => row.kind !== 'oracleAbilityLoss');
  f.game.recalc();
  assert.deepEqual(plain(plan(f, forest).produce), [{B: 1}]);
  M.OracleV8Copies.applyCopy(f.game, copy, M.DEFS['Grizzly Bears']); f.game.recalc();
  assert.equal(plan(f, forest), undefined);
});

test('Pulse and Reality Twist keep basic-land, controller and land-subtype scope', () => {
  const f = setup(), own = card(f, 'Forest'), enemy = card(f, 'Forest', 'battlefield', f.b),
    nonbasic = card(f, 'Command Tower'), pulse = card(f, 'Pulse of Llanowar');
  assert.deepEqual(plain(plan(f, own).produce), ['W', 'U', 'B', 'R', 'G'].map(color => ({[color]: 1})));
  assert.equal(plan(f, enemy), undefined);
  assert.equal(plan(f, nonbasic), undefined);
  pulse.phasedOut = true;
  const twist = card(f, 'Reality Twist');
  assert.deepEqual(plain(plan(f, own).produce), [{B: 1}]);
  assert.deepEqual(plain(plan(f, enemy).produce), [{B: 1}], 'Reality Twist also changes opposing lands');
  assert.equal(plan(f, nonbasic), undefined, 'a land without one of its named subtypes is unaffected');
  twist.phasedOut = true;
  assert.equal(plan(f, own), undefined);
});

test('Mana replacement scans inspect candidate flags once per stable board and skip nonlands', t => {
  const f = setup(), forest = card(f, 'Forest'), ring = card(f, 'Sol Ring');
  for (let i = 0; i < 250; i++) {
    const c = new M.CardInst(M.DEFS['Scute Swarm'], f.a);
    c.zone = 'battlefield'; f.game.battlefield.push(c);
  }
  f.game.recalc();
  let tripleReads = 0, modeReads = 0;
  for (const c of f.game.battlefield) {
    const def = {...c.def};
    Object.defineProperty(def, 'v59TripleBasic', {get() {tripleReads++; return false;}});
    Object.defineProperty(def, 'v66ManaMode', {get() {modeReads++; return undefined;}});
    c.def = def;
  }
  M.boardChanged();
  for (let i = 0; i < 20; i++) assert.equal(plan(f, ring), undefined);
  assert.equal(tripleReads, 0); assert.equal(modeReads, 0);
  for (let i = 0; i < 20; i++) assert.equal(plan(f, forest), undefined);
  assert.equal(tripleReads, f.game.battlefield.length);
  assert.equal(modeReads, f.game.battlefield.length);
  t.diagnostic(`252 permanents, 20 land queries: ${tripleReads} triple-flag reads and ${modeReads} mode reads; nonland queries: zero`);
});
