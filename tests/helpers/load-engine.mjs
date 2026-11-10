import fs from 'node:fs';
import vm from 'node:vm';
import { extractMainScript, readModuleList } from '../../scripts/source-audit.mjs';

let cached;

function createSandbox() {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    fetch: globalThis.fetch,
    URL,
    URLSearchParams,
    structuredClone,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

function runData(sandbox) {
  const dataUrl = new URL('../../src/data.js', import.meta.url);
  if (fs.existsSync(dataUrl)) {
    new vm.Script(fs.readFileSync(dataUrl, 'utf8'), { filename: 'src/data.js' }).runInContext(sandbox);
  }
  sandbox.MTG.initData(sandbox.MTG.RAW_DATA);
}

// The engine as the page starts it: src/app-startup.js, with only the cards
// of built-in decks. Each call builds a new engine; nothing is shared with
// loadEngine(). `complete()` then registers every Oracle batch, as
// MTG.ensureFullCatalog does in the page when an imported deck needs them.
export function loadStartupEngine() {
  const sandbox = createSandbox();
  new vm.Script(readModuleList('app-startup.js'), { filename: 'src/app-startup.js' }).runInContext(sandbox);
  runData(sandbox);
  const MTG = sandbox.MTG;
  const complete = () => {
    if (MTG.oracleCatalogComplete()) return false;
    MTG.beginOracleCatalogCompletion();
    new vm.Script(readModuleList('oracle-catalog-full.js'), { filename: 'src/oracle-catalog-full.js' }).runInContext(sandbox);
    MTG.finishOracleCatalogCompletion();
    return true;
  };
  return { MTG, sandbox, complete };
}

// MTG_ENGINE_LOAD selects how every test of a run gets its engine:
//   (unset)     src/app.js, every batch in its original place;
//   two-part    the startup engine, then every batch, as a page that needed
//               the complete catalog;
//   startup     the startup engine alone, for games with built-in decks.
export function loadEngine() {
  if (cached) return cached;
  const mode = process.env.MTG_ENGINE_LOAD || '';
  if (mode === 'two-part' || mode === 'startup') {
    const engine = loadStartupEngine();
    if (mode === 'two-part') engine.complete();
    cached = engine.MTG;
    return cached;
  }
  if (mode) throw new Error('Unknown MTG_ENGINE_LOAD: ' + mode);
  const sandbox = createSandbox();
  new vm.Script(extractMainScript(), { filename: 'src/app.js' }).runInContext(sandbox);
  runData(sandbox);
  cached = sandbox.MTG;
  return cached;
}

export function priorityGame(names = ['A', 'B', 'C', 'D']) {
  const MTG = loadEngine();
  const game = new MTG.Game({ seed: 7, paced: false, maxTurns: 20 });
  const players = names.map(name => game.addPlayer(name, { name: `${name} deck` }, null, false));
  game.turnPlayer = players[0];
  return { MTG, game, players };
}
