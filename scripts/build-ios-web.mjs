import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedExtensions = new Set(['.html', '.js', '.css', '.json', '.svg', '.webp', '.jpg', '.jpeg', '.png', '.mp3', '.mp4', '.wav', '.ogg', '.woff', '.woff2']);

export function makeOfflineHTML(html) {
  if (!html.includes('</head>')) throw new Error('The game entry point has no closing head.');
  return html
    .replace(/<link\b[^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*/g, '')
    .replace('</head>', `<!-- Generated iOS bundle; edit the source game and rebuild. -->
<meta name="mtg-build" content="ios-offline">
<link rel="stylesheet" href="./mobile/offline.css">
<script src="./mobile/offline.js"></script>
</head>`);
}

async function copyRuntimeTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isSymbolicLink()) throw new Error(`Refusing to bundle symlink: ${join(source, entry.name)}`);
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyRuntimeTree(from, to);
    else if (allowedExtensions.has(extname(entry.name))) await cp(from, to);
  }
}

export async function buildIOSWeb() {
  // Only this fixed generated directory may be removed, never a caller-supplied path.
  const output = resolve(repository, 'dist', 'ios-web');
  if (relative(repository, output) !== join('dist', 'ios-web')) throw new Error('Unsafe iOS output path');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const directory of ['src', 'assets', 'mobile']) {
    await copyRuntimeTree(join(repository, directory), join(output, directory));
  }
  await cp(join(repository, 'logic.js'), join(output, 'logic.js'));
  await writeFile(join(output, 'index.html'), makeOfflineHTML(await readFile(join(repository, 'index.html'), 'utf8')));

  const files = (await readdir(output, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile());
  let bytes = 0;
  for (const entry of files) bytes += (await stat(join(entry.parentPath, entry.name))).size;
  const packageInfo = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  await writeFile(join(output, 'ios-bundle.json'), JSON.stringify({
    schema: 'commander-ios-bundle/v1', version: packageInfo.version, files: files.length, bytes,
    mode: 'offline-solo', onlineURL: 'https://mtg-commander-simulator.vercel.app/'
  }, null, 2) + '\n');
  console.log(`iOS game bundle: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB (${relative(repository, output)})`);
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildIOSWeb();
