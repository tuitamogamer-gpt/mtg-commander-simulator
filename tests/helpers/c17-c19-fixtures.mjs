// Candidate-only source injection lets behavior tests run before fail-closed intake.
import fs from 'node:fs';
import {sourceDir} from '../../scripts/import-c17-c19-precons.mjs';
import {M} from './c21-fixtures.mjs';
export * from './c21-fixtures.mjs';
const oracle=JSON.parse(fs.readFileSync(sourceDir+'/oracle.json'));
const cards={...M.RAW_DATA.cards};
for(const row of oracle.cards)if(!M.DEFS[row.requestedName]&&M.SCRIPTS[row.requestedName])cards[row.requestedName]={...row.raw,_oracleId:row.oracleId,_scryfallId:row.scryfallId,_layout:row.layout};
M.initData({...M.RAW_DATA,cards});
export const target=(f,...chosen)=>{f.decide=(p,q)=>q.type==='chooseTargets'?q.candidates.filter(c=>chosen.includes(c)).slice(0,q.max):undefined;};
export const tokens=(f,p=f.a)=>f.game.creatures(p).filter(c=>c.isToken);
