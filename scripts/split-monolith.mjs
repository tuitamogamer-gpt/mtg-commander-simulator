import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const srcDir = path.join(root, 'src');
const html = fs.readFileSync(indexPath, 'utf8');

if (html.includes('/src/app.js')) {
  console.log('index.html je već razdvojen.');
  process.exit(0);
}

const style = html.match(/<style>([\s\S]*?)<\/style>/);
const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!style || !script) throw new Error('Monolitni style/script blok nije pronađen.');

const dataMarker = 'MTG.RAW_DATA = ';
const dataStart = script[1].indexOf(dataMarker);
if (dataStart < 0) throw new Error('MTG.RAW_DATA marker nije pronađen.');

const appSource = script[1].slice(0, dataStart).trimEnd() + '\n';
const dataSource = [
  "'use strict';",
  'var MTG = globalThis.MTG || (globalThis.MTG = {});',
  script[1].slice(dataStart).trim(),
  '',
].join('\n');

let shell = html.replace(style[0], '<link rel="stylesheet" href="/src/styles.css">');
shell = shell.replace(script[0], [
  '<script type="module" src="/src/app.js"></script>',
  '<script type="module" src="/src/data.js"></script>',
  '</body>',
].join('\n'));

fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, 'styles.css'), style[1].trimStart());
fs.writeFileSync(path.join(srcDir, 'app.js'), appSource);
fs.writeFileSync(path.join(srcDir, 'data.js'), dataSource);
fs.writeFileSync(indexPath, shell);
console.log('Razdvojeno: index.html, src/styles.css, src/app.js, src/data.js');
