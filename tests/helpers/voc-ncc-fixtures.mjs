import fs from 'node:fs';
import {sourceDir} from '../../scripts/import-voc-ncc-precons.mjs';
import {M} from './c21-fixtures.mjs';
export * from './c21-fixtures.mjs';
const records=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json')).cards;
const cards={...M.RAW_DATA.cards};
for(const r of records)if(!M.resolveDeckCardName(r.requestedName)&&M.SCRIPTS[r.requestedName])cards[r.requestedName]={...r.raw,_oracleId:r.oracleId,_scryfallId:r.scryfallId,_layout:r.layout,_commanderLegality:r.commanderLegality};
M.initData({...M.RAW_DATA,cards});
