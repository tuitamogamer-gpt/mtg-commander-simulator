import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createBuildInfo, renderBuildInfo, writeBuildInfo } from '../scripts/build-info.mjs';

const revision = 'abcdef0123'.repeat(4);

test('deployed build publishes only its validated source revision and package version', () => {
  const info = createBuildInfo({ version: '0.1.0', cwd: '/absent-build-checkout', env: {
    VERCEL: '1', VERCEL_GIT_COMMIT_SHA: revision.toUpperCase(),
    ACCOUNT_SECRET: 'never-public', VERCEL_URL: 'private-deployment-host',
  } });
  assert.deepEqual(info, { version: '0.1.0', revision, source: 'vercel', dirty: false });
  assert.doesNotMatch(renderBuildInfo(info), /never-public|private-deployment-host|ACCOUNT_SECRET|VERCEL_URL/);
  assert.throws(() => createBuildInfo({ version: '0.1.0', env: { VERCEL: '1' } }), /require VERCEL_GIT_COMMIT_SHA/);
  assert.throws(() => createBuildInfo({ version: '0.1.0', env: { VERCEL_GIT_COMMIT_SHA: 'main' } }), /Invalid deployment source revision/);
});

test('loaded identity stays immutable when another build module is evaluated later', () => {
  const context = vm.createContext({});
  const info = { version: '0.1.0', revision, source: 'vercel', dirty: false };
  vm.runInContext(renderBuildInfo(info), context);
  const loaded = context.MTG.BUILD_INFO;
  assert.equal(Object.isFrozen(loaded), true);
  assert.throws(() => vm.runInContext("'use strict'; MTG.BUILD_INFO.revision = 'changed'", context), /read only/);
  assert.throws(() => vm.runInContext("'use strict'; MTG.BUILD_INFO = {}", context), /read only/);
  vm.runInContext(renderBuildInfo({ ...info, revision: '1'.repeat(40) }), context);
  assert.equal(context.MTG.BUILD_INFO, loaded);
  assert.equal(loaded.revision, revision);
});

test('local Git packages distinguish committed, modified, and untracked source', async context => {
  const cwd = await mkdtemp(join(tmpdir(), 'mtg-build-info-'));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init');
  await mkdir(join(cwd, 'src'));
  await writeFile(join(cwd, 'src/build-info.js'), 'fallback');
  await writeFile(join(cwd, 'game.js'), 'committed');
  git('add', '.');
  git('-c', 'user.name=Build Test', '-c', 'user.email=build@example.invalid', 'commit', '-m', 'test fixture');
  const clean = createBuildInfo({ version: '0.1.0', cwd, env: {} });
  assert.equal(clean.revision, git('rev-parse', 'HEAD').trim());
  assert.equal(clean.source, 'git');
  assert.equal(clean.dirty, false);
  await writeFile(join(cwd, 'src/build-info.js'), 'generated');
  assert.equal(createBuildInfo({ version: '0.1.0', cwd, env: {} }).dirty, false);
  await writeFile(join(cwd, 'game.js'), 'modified');
  assert.equal(createBuildInfo({ version: '0.1.0', cwd, env: {} }).dirty, true);
  git('restore', 'game.js');
  await writeFile(join(cwd, 'new-rules.js'), 'untracked');
  assert.equal(createBuildInfo({ version: '0.1.0', cwd, env: {} }).dirty, true);
});

test('source archives remain usable without inventing a source revision', async context => {
  const cwd = await mkdtemp(join(tmpdir(), 'mtg-build-archive-'));
  context.after(() => rm(cwd, { recursive: true, force: true }));
  assert.deepEqual(createBuildInfo({ version: '0.1.0', cwd, env: {} }), {
    version: '0.1.0', revision: null, source: 'archive', dirty: null,
  });
  const destination = join(cwd, 'build-info.js');
  await writeBuildInfo(destination, { cwd, env: {} });
  const sandbox = {};
  vm.runInNewContext(await readFile(destination, 'utf8'), sandbox);
  assert.equal(sandbox.MTG.BUILD_INFO.revision, null);
  assert.equal(sandbox.MTG.BUILD_INFO.source, 'archive');
});

test('unbuilt checkout identity loads without networking and matches the package version', async () => {
  const source = await readFile(new URL('../src/build-info.js', import.meta.url), 'utf8');
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  assert.equal(sandbox.MTG.BUILD_INFO.version, version);
  assert.equal(Object.isFrozen(sandbox.MTG.BUILD_INFO), true);
});
