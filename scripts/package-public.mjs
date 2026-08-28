import { mkdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(repo, 'dist');
const output = join(dist, 'commander-simulator-public.zip');
const include = [
  'index.html',
  'logic.js',
  'package.json',
  'package-lock.json',
  'vercel.json',
  'README.md',
  'PUBLIC_RELEASE.md',
  'DESIGN.md',
  'api',
  'assets',
  'docs',
  'reports',
  'scripts',
  'src',
  'tests',
];

mkdirSync(dist, { recursive: true });
rmSync(output, { force: true });

const zipped = spawnSync('zip', ['-r', '-q', output, ...include, '-x', '*/.DS_Store'], {
  cwd: repo,
  encoding: 'utf8',
});

if (zipped.status !== 0) {
  throw new Error(`Public package failed: ${zipped.stderr || zipped.stdout || `zip exit ${zipped.status}`}`);
}

const verified = spawnSync('unzip', ['-tq', output], { cwd: repo, encoding: 'utf8' });
if (verified.status !== 0) {
  throw new Error(`Public package verification failed: ${verified.stderr || verified.stdout}`);
}

const mb = (statSync(output).size / (1024 * 1024)).toFixed(1);
console.log(`Public package ready: ${relative(repo, output)} (${mb} MB)`);
console.log('Archive integrity: PASS');
