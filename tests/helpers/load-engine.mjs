import fs from 'node:fs';
import vm from 'node:vm';
import { extractMainScript, readSource } from '../../scripts/source-audit.mjs';

let cached;

export function loadEngine() {
  if (cached) return cached;
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
  new vm.Script(extractMainScript(readSource()), { filename: 'src/app.js' }).runInContext(sandbox);
  const dataUrl = new URL('../../src/data.js', import.meta.url);
  if (fs.existsSync(dataUrl)) {
    new vm.Script(fs.readFileSync(dataUrl, 'utf8'), { filename: 'src/data.js' }).runInContext(sandbox);
  }
  sandbox.MTG.initData(sandbox.MTG.RAW_DATA);
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
