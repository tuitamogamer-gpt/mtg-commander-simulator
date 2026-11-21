// Commander Live as a process of its own: an always-on host (a VPS, a
// container) runs this file. Vercel imports api/ws.js directly and never
// reaches it. The same room server, storage rules and limits apply.
//
//   PORT, HOST              where to listen (8787 on every interface)
//   REDIS_URL               room storage; or DATABASE_URL for PostgreSQL
//   LIVE_ALLOWED_ORIGINS    the game's page origins, comma separated
//   LIVE_MAX_CONNECTIONS    optional cap on open connections
import { pathToFileURL } from 'node:url';

export async function startLiveServer({ server, env = process.env, log = console } = {}) {
  const { store, allowedOrigins, shutdown } = server.commanderLive;
  // Rooms never fall back to this process's memory: a restart would lose them.
  if (store.kind === 'missing') throw new Error('Room storage is not configured. Set REDIS_URL (or DATABASE_URL).');
  await store.ping();
  const port = Number(env.PORT) || 8787;
  const host = env.HOST || '0.0.0.0';
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const listening = server.address();
  log.log(`Commander Live is listening on ${host}:${listening.port} (storage: ${store.kind}; `
    + `page origins: ${allowedOrigins.length ? allowedOrigins.join(', ') : 'this host only'}).`);
  let stopping = null;
  const stop = signal => stopping ||= (async () => {
    log.log(`${signal}: closing ${server.commanderLive.clients.size} connection(s) and stopping.`);
    await shutdown();
  })();
  return { port: listening.port, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { default: server } = await import('../api/ws.js');
    const running = await startLiveServer({ server });
    for (const signal of ['SIGTERM', 'SIGINT']) {
      process.once(signal, () => {
        running.stop(signal).then(() => process.exit(0), error => {
          console.error('Commander Live did not stop cleanly:', error.message);
          process.exit(1);
        });
      });
    }
  } catch (error) {
    console.error('Commander Live did not start:', error.message);
    process.exit(1);
  }
}
