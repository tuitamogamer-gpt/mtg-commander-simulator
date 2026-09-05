import test from 'node:test';
import assert from 'node:assert/strict';
import { extensionTarget } from '../scripts/oracle-extensions-v8.mjs';
import { fixtureEngine, context, put, settle } from './helpers/oracle-v8-fixtures.mjs';

const M = fixtureEngine([
  ['Subtype Lord Decoy', '', 'Creature — Lord', '{G}'],
  ['Subtype Time Decoy', '', 'Creature — Time', '{G}'],
  ['Subtype Alien', '', 'Creature — Alien', '{G}'],
  ['Subtype Angel', '', 'Creature — Angel', '{G}'],
]);

test('closed target grammar preserves the one multiword Time Lord subtype through unions', () => {
  const target = extensionTarget('target Time Lord or Alien spell');
  assert.deepEqual(target.spellFilter.alternatives.map(filter => filter.subtype), ['Time Lord', 'Alien']);
  assert.equal(extensionTarget('target Time Lord you control').subtype, 'Time Lord');
  assert.equal(extensionTarget('target Time Lord creature card from your graveyard').subtype, 'Time Lord');
  assert.equal(extensionTarget('target non-Time Lord creature').notSubtype, 'Time Lord');
  assert.equal(extensionTarget('target Time Lord creature while dreaming'), null);
});

test('historic Regeneration source descriptors remain frozen while runtime uses the complete subtype', () => {
  const entry = M.ORACLE_BATCHES.flatMap(batch => batch.cards).find(row => row.raw.name === 'Time Lord Regeneration');
  assert.equal(entry.implementation[0].targets[0].subtype, 'Lord');
  const normalized = M.normalizeOracleTimeLordEntry(entry);
  assert.equal(normalized.implementation[0].targets[0].subtype, 'Time Lord');
  const reveal = normalized.implementation[0].effects[0].operation.effects[0];
  assert.equal(reveal.until.filter.subtype, 'Time Lord');
  assert.equal(reveal.selections[0].filter.subtype, 'Time Lord');
  assert.equal(entry.implementation[0].targets[0].subtype, 'Lord');
});

for (const role of ['human', 'ai']) test(`${role}: paid Time Lord Regeneration targets and reveals only the complete subtype`, async () => {
  const ctx = context(M, role), { game, a, b } = ctx;
  const target = put(M, game, a, 'Jenny, Generated Anomaly');
  const lord = put(M, game, a, 'Subtype Lord Decoy'), time = put(M, game, a, 'Subtype Time Decoy');
  const alien = put(M, game, a, 'Subtype Alien'), enemy = put(M, game, b, 'Romana II');
  const spell = put(M, game, a, 'Time Lord Regeneration', 'hand');
  const original = a.controller.decide.bind(a.controller);
  let targetPrompt = false;
  a.controller.decide = async (g, q) => {
    if (q.type === 'chooseTargets') {
      targetPrompt = true;
      assert.equal(q.candidates.includes(target), true);
      for (const decoy of [lord, time, alien, enemy]) assert.equal(q.candidates.includes(decoy), false, decoy.name);
      return [target];
    }
    return original(g, q);
  };
  a.pool.U = 1;
  assert.equal(await game.castSpell(a, spell, { from: 'hand' }), true);
  assert.equal(a.pool.U, 0); assert.equal(targetPrompt, true);
  await settle(game);
  const replacement = put(M, game, a, 'Romana II', 'library');
  const unrelated = put(M, game, a, 'Subtype Alien', 'library');
  const partial = put(M, game, a, 'Subtype Lord Decoy', 'library');
  const bottom = a.library[0];
  await game.destroy(target); await settle(game);
  assert.equal(target.zone, 'graveyard');
  assert.equal(replacement.zone, 'battlefield');
  assert.equal(unrelated.zone, 'library'); assert.equal(partial.zone, 'library');
  assert.equal(bottom.zone, 'library');
  assert.equal(a.library.slice(0, 2).includes(unrelated), true);
  assert.equal(a.library.slice(0, 2).includes(partial), true);
});
