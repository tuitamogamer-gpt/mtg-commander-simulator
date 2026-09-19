import fs from 'node:fs';
import {loadEngine} from '../tests/helpers/load-engine.mjs';
import {auditNativeCatalog} from '../tests/helpers/native-execution-audit.mjs';

const M = loadEngine();
const names = Array.from(M.DECKS['Blame Game'].cards, c => c.name);
const report = await auditNativeCatalog(M, names);
const output = new URL('../output/blame-game-2026-09-19/', import.meta.url);
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(new URL('runtime-smoke.json', output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.counts));
console.log(JSON.stringify(report.results.filter(r => r.status !== 'runtime-smoke-pass')));
if (report.counts['runtime-smoke-pass'] !== names.length * 2) process.exitCode = 1;
