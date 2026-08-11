import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'src', 'app.js');
const modulesDir = path.join(root, 'src', 'modules');
const source = fs.readFileSync(appPath, 'utf8');

if (/^import '\.\/modules\//m.test(source)) {
  console.log('src/app.js je već razdvojen na module.');
  process.exit(0);
}

const marker = /^\/\/ ===== ([^\n]+\.js) =====$/gm;
const matches = [...source.matchAll(marker)];
if (!matches.length) throw new Error('Virtualni module markeri nisu pronađeni.');

fs.mkdirSync(modulesDir, { recursive: true });
const imports = [];
for (let index = 0; index < matches.length; index++) {
  const match = matches[index];
  const end = matches[index + 1]?.index ?? source.length;
  let body = source.slice(match.index, end).trimEnd() + '\n';
  if (!/var MTG = globalThis\.MTG/.test(body)) {
    body = body.replace("'use strict';", "'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});");
  }
  const filename = match[1];
  fs.writeFileSync(path.join(modulesDir, filename), body);
  imports.push(`import './modules/${filename}';`);
}

fs.writeFileSync(appPath, imports.join('\n') + '\n');
console.log(`Razdvojeno ${matches.length} aplikacijskih modula.`);
