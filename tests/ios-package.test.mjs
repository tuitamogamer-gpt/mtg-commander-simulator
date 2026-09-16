import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import vm from 'node:vm';
import { makeOfflineHTML, repository } from '../scripts/build-ios-web.mjs';

test('iOS HTML removes remote fonts and marks only the generated copy as offline', async () => {
  const original = await readFile(join(repository, 'index.html'), 'utf8');
  const bundled = makeOfflineHTML(original);
  assert.doesNotMatch(original, /name="mtg-build"/);
  assert.match(bundled, /name="mtg-build" content="ios-offline"/);
  assert.doesNotMatch(bundled, /<link[^>]+fonts\.(googleapis|gstatic)\.com/);
  assert.ok(bundled.indexOf('./mobile/offline.js') < bundled.indexOf('./src/public-entry.js'));
  assert.match(bundled, /viewport-fit=cover/);
});

test('offline bundle contains runtime modules and assets, without server or workstation files', async context => {
  const root = join(repository, 'dist/ios-web');
  // The bundle test is also part of npm test. A clean checkout can test its pure
  // transforms without copying 448 MB; run ios:bundle to check the actual files.
  try { await access(root); } catch {
    if (process.env.REQUIRE_IOS_BUNDLE === '1') throw new Error('Run npm run ios:bundle before ios:test.');
    context.skip('Generated bundle absent; run npm run ios:bundle to validate its contents.');
    return;
  }
  for (const path of ['index.html', 'logic.js', 'src/app.js', 'src/data.js', 'mobile/offline.js', 'assets/audio/manifest.json']) {
    await access(join(root, path));
  }
  const names = await readdir(root);
  for (const name of ['api', '.env', '.git', 'node_modules', '.local', 'tests', 'ios']) assert.ok(!names.includes(name), name);
  const files = await readdir(join(root, 'src'), { recursive: true, withFileTypes: true });
  let imports = 0;
  for (const file of files.filter(file => file.isFile() && file.name.endsWith('.js'))) {
    const path = join(file.parentPath, file.name);
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/(?:\bimport\s*(?:\(\s*)?|\bfrom\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
      await access(join(dirname(path), match[1].split('?')[0]));
      imports++;
    }
  }
  assert.ok(imports > 100, `Expected complete engine module graph, got ${imports}`);
});

test('native exports intercept detached blob downloads and preserve ordinary links', async () => {
  const source = await readFile(join(repository, 'ios/App/App/NativeExports.js'), 'utf8');
  const messages = [];
  const alerts = [];
  let normalClicks = 0;
  class Anchor { click() { normalClicks++; } }
  const sandbox = {
    window: { webkit: { messageHandlers: { commanderExport: { postMessage: async value => messages.push(value) } } } },
    HTMLAnchorElement: Anchor, Element: Anchor,
    document: { addEventListener() {} },
    fetch: async () => ({ blob: async () => ({ size: 10, text: async () => '{"deck":"test"}' }) }),
    alert: value => alerts.push(value),
  };
  vm.runInNewContext(source, sandbox);
  const ordinary = new Anchor(); ordinary.href = 'https://example.com'; ordinary.click();
  const exportLink = new Anchor(); exportLink.href = 'blob:local'; exportLink.download = 'game.json'; exportLink.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(normalClicks, 1);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].filename, 'game.json');
  assert.equal(messages[0].text, '{"deck":"test"}');
  assert.deepEqual(alerts, []);
});

test('native export errors are visible and oversized blobs never cross the bridge', async () => {
  const source = await readFile(join(repository, 'ios/App/App/NativeExports.js'), 'utf8');
  let sends = 0;
  const alerts = [];
  class Anchor { click() {} }
  vm.runInNewContext(source, {
    window: { webkit: { messageHandlers: { commanderExport: { postMessage: async () => { sends++; } } } } },
    HTMLAnchorElement: Anchor, Element: Anchor, document: { addEventListener() {} },
    fetch: async () => ({ blob: async () => ({ size: 9 * 1024 * 1024 }) }),
    alert: value => alerts.push(value),
  });
  const link = new Anchor(); link.href = 'blob:large'; link.download = 'game.json'; link.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sends, 0);
  assert.match(alerts[0], /larger than 8 MB/);
});
