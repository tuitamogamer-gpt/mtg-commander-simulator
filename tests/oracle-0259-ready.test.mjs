import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFixturePlan, registerCanonicalFixturePlan} from './helpers/oracle-fixture-plan.mjs';
import {loadEngine} from './helpers/load-engine.mjs';
import {names, proveReady0259} from './helpers/oracle-0259-ready-proof.mjs';
const rows = JSON.parse(fs.readFileSync(new URL('./fixtures/oracle-0259-ready.json', import.meta.url)));
const plan = createFixturePlan(rows, 69, 9959), M = loadEngine();
registerCanonicalFixturePlan(M, plan);
test('remaining supported sources reject additional unknown rules on every face', () => {
  for (const row of rows) {
    if (row.card_faces) for (const face of [0, 1]) {
      const changed = structuredClone(row);
      changed.card_faces[face].oracle_text += '\nPerform an unsupported action.';
      assert.equal(plan.classify(changed).semanticClass, undefined);
    } else assert.equal(plan.classify({...row, oracle_text: row.oracle_text + '\nPerform an unsupported action.'}).semanticClass, undefined);
  }
});
for (const role of ['human', 'ai']) for (const name of names) for (const positive of [true, false]) {
  test(`${role}: ${name} paid complete rules ${positive}`, () => proveReady0259(M, name, role, positive));
}
