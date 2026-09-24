import assert from 'node:assert/strict';

// A native precon may have been released after the pinned bulk snapshot.
// Imported Oracle batches must still belong to their pinned source.
export function matchCatalogSource(entry, {byId, universeNames, universeFaces, allNames}) {
  if (entry.oracleId) {
    const card = byId.get(entry.oracleId);
    if (card) return {card, match: 'oracle-id'};
    assert.ok(!entry.engineBatch, `Imported Oracle ID absent from pinned source: ${entry.name}`);
    return {card: null, match: 'not-found-in-pinned-source'};
  }
  for (const [entries, match] of [
    [universeNames.get(entry.name), 'canonical-name'],
    [universeFaces.get(entry.name), 'face-name'],
    [allNames.get(entry.name), 'canonical-name-outside-universe'],
  ]) {
    if (!entries?.length) continue;
    assert.equal(entries.length, 1, `Ambiguous ${match} in pinned source: ${entry.name}`);
    return {card: entries[0], match};
  }
  return {card: null, match: 'not-found-in-pinned-source'};
}
