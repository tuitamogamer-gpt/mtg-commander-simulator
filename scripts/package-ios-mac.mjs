import { access, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repository } from './build-ios-web.mjs';

await access(join(repository, 'ios/App/App/public/ios-bundle.json'));
const roots = ['ios/App/App', 'ios/App/CapApp-SPM', 'ios/App/App.xcodeproj', 'ios/debug.xcconfig', 'docs/ios.md', 'scripts/verify-ios-mac.sh'];
const paths = [];
async function collect(path) {
  const name = path.split(/[\\/]/).at(-1);
  if (name.startsWith('.') || ['xcuserdata', 'build', 'DerivedData'].includes(name) || name.endsWith('.xcuserstate')) return;
  const info = await stat(path);
  if (info.isDirectory()) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Refusing to archive symlink: ${entry.name}`);
      await collect(join(path, entry.name));
    }
  } else { paths.push(relative(repository, path).replaceAll('\\', '/')); }
}
for (const root of roots) await collect(join(repository, root));
const archive = join(repository, 'dist/commander-ios-mac.zip');
const result = spawnSync('tar', ['-a', '-c', '-f', archive, '-T', '-'], {
  cwd: repository, input: paths.sort().join('\n') + '\n', encoding: 'utf8', maxBuffer: 1024 * 1024,
});
if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'Archive failed');
const listing = spawnSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (listing.status !== 0) throw new Error(listing.stderr || 'Archive verification failed');
const archived = new Set(listing.stdout.trim().split(/\r?\n/));
for (const path of paths) if (!archived.has(path)) throw new Error(`Missing archive file: ${path}`);
console.log(`Mac handoff ready: ${relative(repository, archive)} (${((await stat(archive)).size / 1024 / 1024).toFixed(1)} MB, ${paths.length} files)`);
console.log('Source project with bundled game. Signing and native compilation still require Xcode on a Mac.');
