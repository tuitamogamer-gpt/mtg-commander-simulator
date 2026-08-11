import fs from 'node:fs';
import vm from 'node:vm';
import { extractMainScript } from './source-audit.mjs';

const script = extractMainScript();
new vm.Script(script, { filename: 'index.inline.js' });
const dataUrl = new URL('../src/data.js', import.meta.url);
if (fs.existsSync(dataUrl)) {
  new vm.Script(fs.readFileSync(dataUrl, 'utf8'), { filename: 'src/data.js' });
}
console.log('JavaScript sintaksa: PASS');
