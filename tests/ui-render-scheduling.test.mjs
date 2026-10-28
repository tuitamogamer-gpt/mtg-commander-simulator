import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');
function view() {
  const frames = [], paints = [], window = {}, MTG = {};
  vm.runInNewContext(source, {MTG, document: {}, window, console,
    requestAnimationFrame: callback => frames.push(callback)});
  const ui = Object.assign(Object.create(MTG.UI.prototype), {
    game: {revision: 0}, bindDecisionWaits() {}, clearRenderRecovery() {},
    renderArena() {paints.push(this.game.revision);},
  });
  window._ui = ui;
  return {ui, frames, paints, window};
}

test('a burst of notifications paints the latest state once', () => {
  const {ui, frames, paints} = view();
  ui.queueRender(); ui.game.revision = 1; ui.queueRender();
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(paints, [1]);
  assert.equal(ui.renderQueued, false);
});

test('an immediate interaction consumes earlier work without cancelling a later update', () => {
  const {ui, frames, paints} = view();
  ui.queueRender();
  ui.game.revision = 1; ui.render();
  ui.game.revision = 2; ui.queueRender();
  frames.shift()();
  assert.deepEqual(paints, [1], 'The stale frame cannot paint or consume the newer frame');
  assert.equal(ui.renderQueued, true);
  frames.shift()();
  assert.deepEqual(paints, [1, 2]);
  assert.equal(ui.renderQueued, false);
});

test('a queued render cannot repaint a replacement game or a rematched UI', () => {
  for (const replaceUI of [false, true]) {
    const {ui, frames, paints, window} = view();
    ui.queueRender();
    if (replaceUI) window._ui = {};
    else ui.game = {revision: 2};
    frames.shift()();
    assert.deepEqual(paints, []);
    assert.equal(ui.renderQueued, false);
  }
});
