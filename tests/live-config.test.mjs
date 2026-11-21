// Where the page finds Commander Live (src/live-config.js, written by the build).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { liveOriginFromEnv, renderLiveConfig } from '../scripts/build-live-config.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const load = source => { const context = vm.createContext({}); vm.runInContext(source, context); return context.MTG; };

test('the tracked config keeps rooms on the page\'s own origin', async () => {
  const tracked = await read('../src/live-config.js');
  assert.equal(tracked, renderLiveConfig(''), 'the checkout matches what a build without the setting writes');
  assert.equal(load(tracked).liveOrigin(), '');
});

test('the build accepts one plain HTTPS origin and fails loudly on anything else', () => {
  assert.equal(liveOriginFromEnv({}), '');
  assert.equal(liveOriginFromEnv({ COMMANDER_LIVE_ORIGIN: '  ' }), '');
  assert.equal(liveOriginFromEnv({ COMMANDER_LIVE_ORIGIN: 'https://live.game.example/' }), 'https://live.game.example');
  assert.equal(liveOriginFromEnv({ COMMANDER_LIVE_ORIGIN: 'https://live.game.example:8443' }), 'https://live.game.example:8443');
  assert.equal(liveOriginFromEnv({ COMMANDER_LIVE_ORIGIN: 'http://127.0.0.1:8787' }), 'http://127.0.0.1:8787');
  for (const wrong of ['live.game.example', 'http://live.game.example', 'wss://live.game.example',
    'https://live.game.example/api/ws', 'https://user:secret@live.game.example', 'https://*.game.example']) {
    assert.throws(() => liveOriginFromEnv({ COMMANDER_LIVE_ORIGIN: wrong }), /COMMANDER_LIVE_ORIGIN/, wrong);
  }
});

test('the page ignores a config value that is not an origin', () => {
  assert.equal(load(renderLiveConfig('https://live.game.example')).liveOrigin(), 'https://live.game.example');
  for (const wrong of ['javascript:alert(1)', 'https://live.game.example/path', '//live.game.example', 'http://live.game.example']) {
    const MTG = load(renderLiveConfig(''));
    MTG.LIVE_ORIGIN = wrong;
    assert.equal(MTG.liveOrigin(), '', wrong);
  }
});

test('the room socket, the landing check and the build all read the same setting', async () => {
  const [multiplayer, entry, main, pkg, index] = await Promise.all([
    read('../src/modules/multiplayer.js'), read('../src/public-entry.js'), read('../src/modules/main.js'),
    read('../package.json'), read('../index.html'),
  ]);
  assert.match(entry, /^import '\.\/live-config\.js';/m, 'the page loads the setting before anything asks for it');
  assert.match(multiplayer, /const liveOrigin = MTG\.liveOrigin\?\.\(\) \|\| '';/);
  assert.match(multiplayer, /liveOrigin \? liveOrigin\.replace\(\/\^http\/, 'ws'\) : websocketOrigin/);
  for (const source of [entry, main]) assert.match(source, /fetch\(`\$\{liveOrigin \|\| '\.'\}\/api\/ws`/);
  assert.match(JSON.parse(pkg).scripts.build, /build-info\.mjs && node scripts\/build-live-config\.mjs/);
  // No policy on the page restricts where a socket may connect.
  assert.doesNotMatch(index, /Content-Security-Policy/i);
});
