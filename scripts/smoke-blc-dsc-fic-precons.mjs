import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {auditNativeCatalog} from '../tests/helpers/native-execution-audit.mjs';
import {sourceDir} from './import-blc-dsc-sld-drc-fic-precons.mjs';
const names=JSON.parse(fs.readFileSync(sourceDir+'/intake.json')).newNames;
const report=await auditNativeCatalog(loadEngine(),names);
fs.writeFileSync(sourceDir+'/runtime-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(report.counts);console.log(report.results.filter(r=>r.status!=='runtime-smoke-pass'));
if(report.counts['runtime-smoke-pass']!==names.length*2)process.exitCode=1;
