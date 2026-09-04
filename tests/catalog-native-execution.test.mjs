import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadEngine } from './helpers/load-engine.mjs';
import { auditNativeCatalog, nativeCatalogNames } from './helpers/native-execution-audit.mjs';

test('all native/manual cards receive explicit real-action smoke results or prerequisite gaps', { timeout: 180_000 }, async t => {
  const MTG = loadEngine();
  const names = nativeCatalogNames(MTG).filter(name => !process.env.NATIVE_AUDIT_FILTER || name.toLowerCase().includes(process.env.NATIVE_AUDIT_FILTER.toLowerCase()));
  assert.ok(names.length > 0);
  const report = await auditNativeCatalog(MTG, names);
  if (process.env.NATIVE_EXECUTION_REPORT) fs.writeFileSync(process.env.NATIVE_EXECUTION_REPORT, JSON.stringify(report, null, 2) + '\n');
  t.diagnostic(JSON.stringify({ cards: report.cards, ...report.counts }));
  const errors = report.results.filter(row => row.status === 'error');
  assert.deepEqual(errors, [], 'Every runtime exception or state invariant violation must be investigated; prerequisite gaps are separately reported.');
  assert.equal(report.results.length, names.length * 2);
});
