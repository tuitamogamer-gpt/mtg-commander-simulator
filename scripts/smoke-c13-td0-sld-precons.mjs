import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {auditNativeCatalog} from '../tests/helpers/native-execution-audit.mjs';
import {sourceDir} from './import-c13-td0-sld-precons.mjs';
import assert from 'node:assert/strict';
import {setup,card,event} from '../tests/helpers/c21-fixtures.mjs';
const names=JSON.parse(fs.readFileSync(sourceDir+'/intake.json')).newNames;
const report=await auditNativeCatalog(loadEngine(),names.filter(n=>n!=='Brisela, Voice of Nightmares'));
for(const role of ['human','ai']){
 const f=setup(role),a=card(f,'Gisela, the Broken Blade'),b=card(f,'Bruna, the Fading Light');
 await event(f,'endStep',{player:f.a});assert.equal(a.name,'Brisela, Voice of Nightmares');assert.equal(b.zone,'merged');assert.equal(a.mv,11);
 report.results.push({name:'Brisela, Voice of Nightmares',role,status:'runtime-smoke-pass',method:'Resolved Gisela end-step meld with both actual component cards; never cast a meld result.'});report.counts['runtime-smoke-pass']++;
}
report.cards=names.length;
fs.writeFileSync(sourceDir+'/runtime-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(report.counts);console.log(report.results.filter(r=>r.status!=='runtime-smoke-pass'));
if(report.counts['runtime-smoke-pass']!==names.length*2)process.exitCode=1;
