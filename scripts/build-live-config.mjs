// Writes src/live-config.js: where the game's page finds Commander Live.
// With COMMANDER_LIVE_ORIGIN unset the page uses its own origin (/api/ws), as
// it always has. Setting it (for example https://live.example.com) moves room
// connections to a server on another host; removing it moves them back.
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function liveOriginFromEnv(env = process.env) {
  const value = String(env.COMMANDER_LIVE_ORIGIN || '').trim();
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error(`COMMANDER_LIVE_ORIGIN is not an address: ${value}`); }
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  // A page on HTTPS can only open a secure socket; plain HTTP is for a local rehearsal.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('COMMANDER_LIVE_ORIGIN must start with https://');
  }
  if (!/^[a-z0-9.-]+$/.test(url.hostname) || url.origin !== value.replace(/\/$/, '').toLowerCase()) {
    throw new Error(`COMMANDER_LIVE_ORIGIN must be a plain origin such as https://live.example.com, not: ${value}`);
  }
  return url.origin;
}

export function renderLiveConfig(origin = '') {
  return `// Where Commander Live rooms are served. Empty: this page's own origin
// (/api/ws). \`npm run build\` writes the address from COMMANDER_LIVE_ORIGIN.
'use strict';
var MTG = globalThis.MTG || (globalThis.MTG = {});
MTG.LIVE_ORIGIN = ${JSON.stringify(origin)};
// '' or an origin such as https://live.example.com; anything else is ignored.
MTG.liveOrigin = () => /^https:\\/\\/[a-z0-9.-]+(?::\\d+)?$|^http:\\/\\/(?:localhost|127\\.0\\.0\\.1)(?::\\d+)?$/.test(MTG.LIVE_ORIGIN)
  ? MTG.LIVE_ORIGIN : '';
`;
}

export async function writeLiveConfig(destination = join(repository, 'src/live-config.js'), { env = process.env } = {}) {
  const origin = liveOriginFromEnv(env);
  await writeFile(destination, renderLiveConfig(origin));
  return origin;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const origin = await writeLiveConfig();
  console.log(`Commander Live: ${origin || "this page's own origin"}`);
}
