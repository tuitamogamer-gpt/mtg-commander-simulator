import test from 'node:test';
import assert from 'node:assert/strict';
import {matchCatalogSource} from '../scripts/catalog-source-match.mjs';
const source = () => ({byId: new Map(), universeNames: new Map(), universeFaces: new Map(), allNames: new Map()});

test('native identities newer than the pinned source remain explicitly unmatched', () => {
  const indexes = source();
  indexes.universeNames.set('New native card', [{oracle_id: 'another-id'}]);
  const entry = {name: 'New native card', oracleId: 'new-id', engineBatch: null};
  assert.deepEqual(matchCatalogSource(entry, indexes), {card: null, match: 'not-found-in-pinned-source'});
  assert.equal(entry.oracleId, 'new-id');
});
test('a missing Oracle batch identity still fails rather than hiding a source mismatch', () => {
  assert.throws(() => matchCatalogSource({name: 'Imported card', oracleId: 'missing', engineBatch: 'oracle-0001'}, source()), /Imported Oracle ID absent/);
});
test('known Oracle IDs take precedence and ambiguous native names fail', () => {
  const indexes = source(), card = {oracle_id: 'known', name: 'Known'};
  indexes.byId.set('known', card);
  assert.deepEqual(matchCatalogSource({oracleId: 'known', engineBatch: 'oracle-0001'}, indexes), {card, match: 'oracle-id'});
  indexes.universeNames.set('Ambiguous', [card, {oracle_id: 'other'}]);
  assert.throws(() => matchCatalogSource({name: 'Ambiguous'}, indexes), /Ambiguous canonical-name/);
});
