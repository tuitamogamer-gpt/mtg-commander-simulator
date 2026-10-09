import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {createHash} from 'node:crypto';
import {createGunzip} from 'node:zlib';

export const PAPER_AVAILABILITY_FILTER = "any default_cards printing.games includes 'paper'; use oracle_id or card_faces[].oracle_id";

// Oracle bulk rows select one representative printing. Its games field cannot
// establish whether another printing of the same Oracle identity is paper.
export function addPaperPrintingOracleIds(printing, oracleIds) {
  if (!printing.games?.includes('paper')) return oracleIds;
  if (printing.oracle_id) oracleIds.add(printing.oracle_id);
  else for (const face of printing.card_faces || []) if (face.oracle_id) oracleIds.add(face.oracle_id);
  return oracleIds;
}

export function paperOracleIdsFromPrintings(printings) {
  const ids = new Set();
  for (const printing of printings || []) addPaperPrintingOracleIds(printing, ids);
  return ids;
}

export function hasPaperPrinting(card, paperOracleIds) {
  return paperOracleIds === undefined ? !!card.games?.includes('paper') : paperOracleIds.has(card.oracle_id);
}

export function inPaperCommanderUniverse(card, paperOracleIds) {
  return hasPaperPrinting(card, paperOracleIds) && card.legalities?.commander === 'legal';
}

export function validatePaperAvailability(paperOracleIds, paperSource, requiredSource) {
  if (paperOracleIds === undefined && paperSource === undefined) {
    if (requiredSource) throw new Error('Current import state requires its pinned default_cards paper-availability source; supply --paper-source-file.');
    return;
  }
  if (!(paperOracleIds instanceof Set) || !paperSource || paperSource.bulkType !== 'default_cards' ||
      !paperSource.bulkId || !paperSource.bulkUpdatedAt || !/^[a-f0-9]{64}$/i.test(paperSource.bulkSha256 || '') ||
      paperSource.oracleIdCount !== paperOracleIds.size || paperSource.filter !== PAPER_AVAILABILITY_FILTER) {
    throw new Error('Paper eligibility requires validated default_cards source metadata and its complete paper Oracle ID set.');
  }
}

export async function loadPaperAvailabilityFromGzip(sourceFile, bulk, expectedSha256 = '') {
  const absolute = path.resolve(String(sourceFile || ''));
  if (!sourceFile || !fs.existsSync(absolute)) throw new Error(`Pinned paper-availability source file does not exist: ${absolute}`);
  if (bulk?.type !== 'default_cards' || !bulk.id || !bulk.updated_at) {
    throw new Error('Pinned paper-availability source requires default_cards type, bulk ID, and updated timestamp.');
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) throw new Error('Pinned paper-availability source requires --paper-source-sha256 with exactly 64 hexadecimal characters.');
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(absolute)) hash.update(chunk);
  const actualSha256 = hash.digest('hex');
  if (actualSha256 !== expectedSha256.toLowerCase()) {
    throw new Error(`Pinned paper-availability source SHA-256 mismatch: got ${actualSha256}, expected ${expectedSha256.toLowerCase()}.`);
  }
  const paperOracleIds = new Set();
  let sourceRows = 0, paperRows = 0;
  const lines = readline.createInterface({input: fs.createReadStream(absolute).pipe(createGunzip()), crlfDelay: Infinity});
  for await (const line of lines) {
    if (!line.trim()) continue;
    const printing = JSON.parse(line);
    sourceRows += 1;
    if (printing.games?.includes('paper')) paperRows += 1;
    addPaperPrintingOracleIds(printing, paperOracleIds);
  }
  const paperSource = {
    provider: 'Scryfall', endpoint: 'https://api.scryfall.com/bulk-data',
    bulkType: bulk.type, bulkId: bulk.id, bulkUpdatedAt: bulk.updated_at,
    bulkSha256: actualSha256, oracleIdCount: paperOracleIds.size,
    sourceRows, paperRows, filter: PAPER_AVAILABILITY_FILTER,
  };
  return {paperOracleIds, paperSource};
}
