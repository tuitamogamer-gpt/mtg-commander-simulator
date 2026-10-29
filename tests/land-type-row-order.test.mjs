import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The dependency scheduler can be exercised without loading the card catalog.
const sandbox = {MTG: {}};
vm.runInNewContext(fs.readFileSync(new URL('../src/modules/oracle-v8-land-types.js', import.meta.url), 'utf8'), sandbox);
const rows = values => [...sandbox.MTG.OracleV8LandTypes.typeRows({}, values, values)];
const ordinary = (name, timestamp) => ({name, timestamp, def: {statics: []}});
const landSource = (name, timestamp, affected, retain = false) => ({name, timestamp,
  def: {statics: [{oracleBasicLandTypes: true, oracleOperation: {retain}, affects: (g, source, target) => affected.has(target)}]}});

test('250 ordinary permanents retain timestamp order with linear dependency inspections', t => {
  let inspections = 0;
  const input = Array.from({length: 250}, (_, i) => ({timestamp: 250 - i, iid: i + 1,
    get def() {inspections++; return {statics: []};}}));
  assert.deepEqual(rows(input), [...input].reverse());
  assert.equal(inspections, 250);
  t.diagnostic(`250 permanents: ${inspections} dependency inspections (previous full scans: 31,375)`);
});

test('Land-type dependencies outrank timestamps while unrelated rows keep their order', () => {
  const affected = new Set(), urborg = landSource('Urborg', 1, new Set(), true);
  const unrelated = ordinary('Creature', 2), moon = landSource('Blood Moon', 3, affected);
  affected.add(urborg);
  assert.deepEqual(rows([moon, unrelated, urborg]), [unrelated, moon, urborg]);
});

test('Dependency cycles fall back to timestamp order and preserve equal-timestamp order', () => {
  const firstAffected = new Set(), secondAffected = new Set();
  const first = landSource('First type setter', 1, firstAffected), second = landSource('Second type setter', 1, secondAffected);
  firstAffected.add(second); secondAffected.add(first);
  assert.deepEqual(rows([second, first]), [second, first]);
});

test('Dependencies are recomputed after every yielded type effect', () => {
  const affected = new Set(), dependent = landSource('Conditional source', 1, new Set(), true);
  const intermediate = ordinary('Earlier applicable effect', 2), remover = landSource('Conditional remover', 3, affected);
  affected.add(dependent);
  const iterator = sandbox.MTG.OracleV8LandTypes.typeRows({}, [dependent, intermediate, remover], []);
  assert.equal(iterator.next().value, intermediate);
  affected.clear();
  assert.equal(iterator.next().value, dependent);
  assert.equal(iterator.next().value, remover);
  assert.equal(iterator.next().done, true);
});

test('Object-bound land-type removal depends on exact zone identity', () => {
  const source = {...landSource('Land static', 1, new Set(), true), iid: 7, zoneVersion: 2};
  const current = {kind: 'oracleLandTypes', iid: 7, zoneVersion: 2, timestamp: 3, retain: false};
  const stale = {...current, zoneVersion: 1};
  assert.deepEqual(rows([source, current]), [current, source]);
  assert.deepEqual(rows([source, stale]), [source, stale]);
});
