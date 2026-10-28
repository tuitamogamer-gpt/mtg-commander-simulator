import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadEngine} from './helpers/load-engine.mjs';
import {aiIsolationFingerprint} from './helpers/run-ai-adversarial-games.mjs';
import {assertGameStateInvariants} from './helpers/game-state-invariants.mjs';

const M = loadEngine();
const uiSource = fs.readFileSync(new URL('../src/modules/ui.js', import.meta.url), 'utf8');

// A small DOM for the independent recovery surface. Native card casting,
// payments, human-controller promises and priority are not replaced.
function harness() {
  const listeners = new Map(), frames = [], downloads = [];
  const document = {activeElement: null, addEventListener(type, fn) {listeners.set(type, fn);}};
  class Node {
    constructor(tag) {this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map(); this.listeners = new Map(); this.inert = false;}
    appendChild(child) {child.remove(); this.children.push(child); child.parentNode = this; return child;}
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = document.body;
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    get isConnected() {return this === document.body || !!this.parentNode?.isConnected;}
    setAttribute(key, value) {this.attributes.set(key, String(value));}
    getAttribute(key) {return this.attributes.get(key) ?? null;}
    removeAttribute(key) {this.attributes.delete(key);}
    addEventListener(type, fn) {this.listeners.set(type, fn);}
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    matches(selector) {
      if (selector.includes(':not(:disabled)') && this.disabled) return false;
      selector = selector.replace(':not(:disabled)', '');
      if (selector.startsWith('[')) {
        const match = /^\[([^=]+)="([^"]+)"\]$/.exec(selector);
        return !!match && this.getAttribute(match[1]) === match[2];
      }
      const parts = selector.split('.'), tag = parts.shift();
      return (!tag || tag.toUpperCase() === this.tagName) && parts.every(cls => String(this.className || '').split(' ').includes(cls));
    }
    descendants() {return this.children.flatMap(child => [child, ...child.descendants()]);}
    querySelectorAll(selector) {
      return this.descendants().filter(node => selector.split(',').some(part => {
        const chain = part.trim().split(' ').reverse();
        if (!node.matches(chain.shift())) return false;
        let parent = node.parentNode;
        return chain.every(ancestor => {
          while (parent && !parent.matches(ancestor)) parent = parent.parentNode;
          if (!parent) return false;
          parent = parent.parentNode; return true;
        });
      }));
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {
      for (let node = this; node; node = node.parentNode) if (node.inert) return;
      document.activeElement = this;
    }
    click() {return this.onclick?.();}
  }
  document.body = new Node('body');
  document.activeElement = document.body;
  const arena = document.body.appendChild(new Node('div'));
  document.createElement = tag => new Node(tag);
  document.querySelector = selector => selector === '#game' ? arena : null;
  const UI = {...M};
  vm.runInNewContext(uiSource, {MTG: UI, document, Error, console, setTimeout, clearTimeout, Blob,
    URL: {createObjectURL(blob) {downloads.push(blob); return 'blob:local-test';}, revokeObjectURL() {}},
    requestAnimationFrame: fn => {frames.push(fn);}});
  const ui = Object.assign(Object.create(UI.UI.prototype), {pendings: [], prioMode: 'off', renderArena() {}});
  return {ui, arena, document, frames, downloads, lib: UI, keydown: event => listeners.get('keydown')?.(event)};
}

function table() {
  const h = harness();
  const game = new M.Game({seed: 131025, paced: false});
  const me = game.addPlayer('You', {name: 'Decision recovery'}, null, false);
  const rival = game.addPlayer('Opponent', {name: 'Decision recovery'}, {decide: async (_g, q) => {
    if (q.type === 'priority') return {kind: 'pass'};
    if (q.type === 'orderTriggers') return q.triggers;
    throw Error(`Unexpected opponent decision: ${q.type}`);
  }}, true);
  game.turnPlayer = me; game.turnNo = 7; game.phase = 'main1'; game.step = 'main'; game.speedFactor = 0;
  Object.assign(h.ui, {game, me});
  me.controller = h.ui.controllerFor(me);
  const put = (name, zone = 'battlefield', owner = me) => {
    const card = new M.CardInst(M.DEFS[name], owner);
    card.zone = zone; card.sick = false;
    (zone === 'battlefield' ? game.battlefield : owner[zone]).push(card);
    game.recalc(); return card;
  };
  return {...h, game, me, rival, put};
}

async function until(predicate) {
  for (let n = 0; n < 100; n++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), 'expected native engine decision');
}

function retry(ui) {
  return ui.renderRecoveryOverlay.querySelectorAll('button').find(button => button.getAttribute('data-testid') === 'retry-view').click();
}

test('a failed paid Throne choice render keeps its exact decision alive through repeated view retries', async () => {
  const f = table();
  const mana = Array.from({length: 4}, () => f.put('Wastes'));
  const throne = f.put('Roaming Throne', 'hand');
  const failure = Error('Injected type chooser render failure');
  let fail = true, status = 'pending', entries = 0, search;
  f.ui.renderArena = function () {
    if (this.pending?.q.type !== 'chooseOption') return;
    if (fail) throw failure;
    if (!search) {
      const overlay = f.document.createElement('div'); overlay.className = 'overlay';
      const modal = f.document.createElement('section'); modal.className = 'modal';
      search = f.document.createElement('input'); search.type = 'search';
      f.arena.appendChild(overlay).appendChild(modal).appendChild(search);
    }
    search.focus(); // Matches a dialog focus attempt before inert is restored.
  };
  const emit = f.game.emit;
  f.game.emit = function (event, data, ...rest) {
    if (event === 'etb' && data.card === throne) entries++;
    return emit.call(this, event, data, ...rest);
  };
  const cast = f.game.castSpell(f.me, throne, {from: 'hand'}).then(value => {status = 'resolved'; return value;}, error => {status = 'rejected'; throw error;});
  await until(() => f.ui.renderError);
  const pending = f.ui.pending, overlay = f.ui.renderRecoveryOverlay;
  assert.equal(status, 'pending', 'presentation failure does not reject the native cast continuation');
  assert.equal(pending.q.aiHint.kind, 'chooseType');
  assert.equal(throne.zone, 'battlefield');
  assert.equal(throne.meta.cslType, undefined);
  assert.ok(mana.every(card => card.tapped));
  assert.equal(entries, 0, 'the incomplete as-enters choice has not emitted an ETB');
  assert.equal(f.arena.inert, true);
  assert.equal(f.arena.getAttribute('aria-hidden'), 'true');
  assert.equal(overlay.parentNode, f.document.body, 'recovery renders independently of the failed arena');
  assert.equal(overlay.children[0].getAttribute('role'), 'alertdialog');
  assert.equal(f.document.activeElement.getAttribute('data-testid'), 'retry-view');
  const before = aiIsolationFingerprint(f.game);
  assert.equal(retry(f.ui), false);
  assert.equal(f.ui.pending, pending);
  assert.equal(f.ui.renderRecoveryOverlay, overlay);
  assert.equal(aiIsolationFingerprint(f.game), before, 'Retry view does not repeat an engine action or payment');
  fail = false;
  assert.equal(retry(f.ui), true);
  assert.equal(f.ui.pending, pending, 'the same decision is still unanswered after its view recovers');
  assert.equal(status, 'pending');
  assert.equal(overlay.isConnected, false);
  assert.equal(f.arena.inert, false);
  assert.equal(f.arena.getAttribute('aria-hidden'), null);
  assert.equal(f.document.activeElement, search, 'Retry returns focus to the actual waiting type search after restoring inert');
  f.ui.resolvePending('Ninja');
  assert.equal(await cast, true);
  assert.equal(throne.meta.cslType, 'Ninja');
  assert.equal(entries, 1);
  assert.equal(throne.castMeta.manaSpent, 4);
  assert.equal(f.ui.pending, null);
  assert.equal(f.game.stack.length, 0);
  assertGameStateInvariants(f.game, 'one completed paid Throne entry after presentation recovery');
});

test('a failed native reaction view preserves the original reaction and priority continuation', async () => {
  const f = table();
  f.game.turnPlayer = f.rival;
  f.rival.pool.G = 2;
  const spell = f.put('Grizzly Bears', 'hand', f.rival);
  f.ui.prioMode = 'auto';
  let fail = true, status = 'pending', proceed;
  f.ui.renderArena = function () {
    if (!this.react) return;
    if (fail) throw Error('Injected reaction view failure');
    if (!proceed) {
      const bar = f.document.createElement('div'); bar.className = 'promptbar reacting';
      proceed = f.document.createElement('button');
      f.arena.appendChild(bar).appendChild(proceed);
    }
    proceed.focus();
  };
  const cast = f.game.castSpell(f.rival, spell, {from: 'hand'}).then(value => {status = 'resolved'; return value;}, error => {status = 'rejected'; throw error;});
  await until(() => f.ui.renderError);
  const reaction = f.ui.react, before = aiIsolationFingerprint(f.game);
  assert.equal(status, 'pending');
  assert.equal(spell.zone, 'stack');
  assert.equal(retry(f.ui), false);
  assert.equal(f.ui.react, reaction);
  assert.equal(aiIsolationFingerprint(f.game), before);
  fail = false;
  assert.equal(retry(f.ui), true);
  assert.equal(f.ui.react, reaction);
  assert.equal(status, 'pending');
  assert.equal(f.document.activeElement, proceed, 'Retry restores focus to the original reaction controls');
  f.ui.prioMode = 'off';
  f.ui.skipReactWindow();
  assert.equal(await cast, true);
  assert.equal(spell.zone, 'battlefield');
  assert.equal(f.ui.react, null);
  assertGameStateInvariants(f.game, 'native opposing spell after recovered reaction view');
});

test('queued render failures display recovery and block arena shortcuts without answering a decision', async () => {
  const f = table();
  const q = {type: 'chooseOption', options: [{key: 'Ninja', label: 'Ninja'}]};
  let answered = false;
  const decision = f.me.controller.decide(f.game, q).then(value => {answered = true; return value;});
  const pending = f.ui.pending;
  f.ui.renderArena = () => {throw Error('Injected animation-frame render failure');};
  f.ui.queueRender();
  // The immediate decision render can consume an earlier notification. The
  // queued callback is harmless, but this small RAF double still holds it.
  assert.ok(f.frames.length >= 1);
  while (f.frames.length) assert.doesNotThrow(() => f.frames.shift()());
  assert.equal(f.ui.renderQueued, false);
  assert.equal(f.ui.pending, pending);
  assert.equal(answered, false);
  f.ui.initKeys();
  f.keydown({key: 'Enter', target: f.document.body, defaultPrevented: false});
  assert.equal(answered, false);
  assert.equal(f.ui.pending, pending);
  const dialog = f.ui.renderRecoveryOverlay.children[0];
  const summary = dialog.querySelectorAll('summary')[0];
  summary.focus();
  let prevented = false, stopped = false;
  f.ui.renderRecoveryOverlay.listeners.get('keydown')({key: 'Tab', shiftKey: false,
    preventDefault() {prevented = true;}, stopPropagation() {stopped = true;}});
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(f.document.activeElement.getAttribute('data-testid'), 'retry-view');
  f.ui.renderArena = () => {};
  retry(f.ui);
  f.ui.resolvePending('Ninja');
  assert.equal(await decision, 'Ninja');
});

test('fatal engine errors remain fatal when their presentation also fails', () => {
  const f = table();
  const engineError = Error('Native engine action failed');
  f.ui.renderArena = () => {throw Error('Fatal recovery renderer failed');};
  assert.doesNotThrow(() => f.ui.handleFatal(engineError));
  assert.equal(f.ui.fatalError, engineError);
  assert.ok(f.ui.renderRecoveryOverlay.isConnected);
  assert.equal(f.ui.renderRecoveryCopy.textContent.includes('decision is still waiting'), false);
  assert.equal(retry(f.ui), false);
  assert.equal(f.ui.fatalError, engineError, 'Retry view never clears or retries a failed engine action');
  f.ui.renderArena = () => {};
  assert.equal(retry(f.ui), true);
  assert.equal(f.ui.fatalError, engineError);
  assert.equal(f.ui.renderError, null);
});

test('recovery retains the connected field and ordinary redraws do not move keyboard focus', async () => {
  const f = table();
  const overlay = f.document.createElement('div'); overlay.className = 'overlay';
  const modal = f.document.createElement('section'); modal.className = 'modal';
  const first = f.document.createElement('input'), retained = f.document.createElement('input');
  f.arena.appendChild(overlay).appendChild(modal);
  modal.appendChild(first); modal.appendChild(retained);
  const decision = f.me.controller.decide(f.game, {type: 'chooseOption', options: [{key: 'Ninja', label: 'Ninja'}]});
  retained.focus();
  f.ui.renderArena = () => {throw Error('Retained field render failure');};
  f.ui.render();
  f.ui.renderArena = () => {};
  retry(f.ui);
  assert.equal(f.document.activeElement, retained, 'the same connected field wins over the first input');
  first.focus();
  f.ui.render();
  assert.equal(f.document.activeElement, first, 'ordinary redraws do not steal focus');
  f.ui.resolvePending('Ninja');
  await decision;
});

test('recovery preserves an already inert arena and restores its outer dialog focus', () => {
  const f = harness();
  f.arena.inert = true;
  f.arena.setAttribute('aria-hidden', 'true');
  const external = f.document.body.appendChild(f.document.createElement('input'));
  external.focus();
  f.ui.renderArena = () => {throw Error('View failed under an outer dialog');};
  f.ui.render();
  f.ui.renderArena = () => {};
  retry(f.ui);
  assert.equal(f.arena.inert, true);
  assert.equal(f.arena.getAttribute('aria-hidden'), 'true');
  assert.equal(f.document.activeElement, external);
});

test('optional local debug download includes the presentation failure with private card identities redacted', async () => {
  const f = table();
  f.put('Counterspell', 'hand');
  f.put('Demonic Tutor', 'library');
  f.put('Lightning Bolt', 'hand', f.rival);
  f.put('Bloodline Keeper // Lord of Lineage', 'hand');
  f.lib.renderGameState = () => ({mode: 'game', pending: {type: 'chooseOption', prompt: 'Private choices'}, players: []});
  f.ui.toast = () => {};
  const engineError = Error('Independent engine error');
  f.ui.fatalError = engineError;
  f.ui.renderError = new TypeError('Cannot display Counterspell, Demonic Tutor, Lightning Bolt, Bloodline Keeper or Lord of Lineage');
  f.ui.showRenderRecovery(f.ui.renderError);
  assert.doesNotMatch(f.ui.renderRecoveryDetails.textContent, /Counterspell|Demonic Tutor|Lightning Bolt|Bloodline Keeper|Lord of Lineage/);
  f.ui.downloadDebugSnapshot(f.game);
  const bundle = JSON.parse(await f.downloads[0].text());
  assert.equal(bundle.presentationError.kind, 'presentation');
  assert.equal(bundle.presentationError.name, 'TypeError');
  assert.match(bundle.presentationError.message, /Cannot display \[private card\]/);
  assert.doesNotMatch(JSON.stringify(bundle), /Counterspell|Demonic Tutor|Lightning Bolt|Bloodline Keeper|Lord of Lineage|Private choices/);
  assert.equal(f.ui.fatalError, engineError);
  assert.equal(f.game.renderError, undefined, 'the diagnostic belongs only to the explicitly downloaded local file');
});
