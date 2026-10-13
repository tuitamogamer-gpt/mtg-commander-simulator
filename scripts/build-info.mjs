import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const revisionPattern = /^[0-9a-f]{40}$/i;

export function createBuildInfo({ version, env = process.env, cwd = repository } = {}) {
  if (typeof version !== 'string' || !/^[0-9][0-9A-Za-z.+-]{0,99}$/.test(version)) {
    throw new Error('Build identity requires a package version.');
  }
  const deployedRevision = env.VERCEL_GIT_COMMIT_SHA;
  if (deployedRevision) {
    if (!revisionPattern.test(deployedRevision)) throw new Error('Invalid deployment source revision.');
    return { version, revision: deployedRevision.toLowerCase(), source: 'vercel', dirty: false };
  }
  if (env.VERCEL === '1') throw new Error('Vercel builds require VERCEL_GIT_COMMIT_SHA.');
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (!revisionPattern.test(revision)) throw new Error('Invalid Git source revision.');
    // A previous generated identity is not a source edit. Other tracked and
    // untracked changes must not be presented as an exact clean Git build.
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal', '--', '.', ':(exclude)src/build-info.js'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { version, revision: revision.toLowerCase(), source: 'git', dirty: status.length > 0 };
  } catch {
    return { version, revision: null, source: 'archive', dirty: null };
  }
}

export function renderBuildInfo(info) {
  return `// Generated at packaging time; loaded once with the game's module graph.\n'use strict';\nvar MTG = globalThis.MTG || (globalThis.MTG = {});\nif (!Object.prototype.hasOwnProperty.call(MTG, 'BUILD_INFO')) {\n  Object.defineProperty(MTG, 'BUILD_INFO', {\n    value: Object.freeze(${JSON.stringify(info)}),\n    enumerable: true,\n  });\n}\n`;
}

export async function writeBuildInfo(destination = join(repository, 'src/build-info.js'), options = {}) {
  const { version } = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'));
  const info = createBuildInfo({ version, ...options });
  await writeFile(destination, renderBuildInfo(info));
  return info;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const info = await writeBuildInfo();
  console.log(`Build identity: ${info.version} / ${info.revision || 'unversioned archive'}${info.dirty ? ' (modified source)' : ''}`);
}
