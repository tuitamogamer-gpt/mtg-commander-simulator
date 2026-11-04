import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual Live decoder, event dispatcher and replay controller.
// Only browser layout, artwork and time are replaced; no replay deduplication
// or history behavior is implemented by this fixture.
function presentation({reducedMotion = true} = {}) {
  const document = {hidden: false, addEventListener() {}, removeEventListener() {}};
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attributes = new Map();
      this.style = {}; this.dataset = {}; this.className = ''; this.inert = false;
      this.classList = {
        contains: name => this.className.split(' ').includes(name),
        add: (...names) => {this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...names])].join(' ');},
        remove: name => {this.className = this.className.split(' ').filter(value => value !== name).join(' ');},
        toggle: (name, on) => on ? this.classList.add(name) : this.classList.remove(name),
      };
    }
    append(...children) {for (const child of children) {child.remove(); child.parentNode = this; this.children.push(child);}}
    replaceChildren(...children) {for (const child of [...this.children]) child.remove(); this.append(...children);}
    remove() {if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null;}
    get firstChild() {return this.children[0];}
    get isConnected() {return this === document.body || !!this.parentNode?.isConnected;}
    get textContent() {return (this._text || '') + this.children.map(child => child.textContent).join('');}
    set textContent(value) {this._text = String(value); this.replaceChildren();}
    setAttribute(key, value) {this.attributes.set(key, String(value));}
    getAttribute(key) {return this.attributes.get(key) ?? null;}
    removeAttribute(key) {this.attributes.delete(key);}
    contains(node) {return node === this || this.children.some(child => child.contains(node));}
    closest(selector) {for (let node = this; node; node = node.parentNode) if (selector === '[inert]' && node.inert) return node; return null;}
    querySelectorAll(selector) {
      const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.tagName === selector.toUpperCase();
      return this.children.flatMap(child => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) {return this.querySelectorAll(selector)[0] || null;}
    focus() {document.activeElement = this;}
    click() {this.onclick?.();}
  }
  document.body = new Element('body'); document.body.classList.add('game-active');
  const gameRoot = new Element('main'), setup = new Element('section'); document.body.append(gameRoot, setup);
  document.activeElement = document.body;
  document.createElement = tag => new Element(tag);
  document.createTextNode = text => {const node = new Element('text'); node.textContent = text; return node;};
  document.getElementById = id => id === 'game' ? gameRoot : id === 'setup' ? setup : null;
  document.querySelector = selector => document.getElementById(selector.slice(1));
  class UI {
    render() {} resolvePending() {} resolvePendingEntry() {} skipReactWindow() {} queueRender() {}
    showGameEffect() {} showActionEffect() {} showBanner() {}
  }
  const MTG = {UI, Player: class {}, CardInst: class {}, Game: class {}};
  const timers = new Map(), delays = new Map(); let serial = 0;
  const context = {MTG, document, window: {matchMedia: () => ({matches: reducedMotion, addEventListener() {}})},
    location: {href: 'http://localhost/'}, MutationObserver: class {observe() {}}, console,
    setTimeout: (callback, ms) => {timers.set(++serial, callback); delays.set(serial, ms); return serial;},
    clearTimeout: id => {timers.delete(id); delays.delete(id);}};
  for (const file of ['multiplayer-presentation', 'combat-replay', 'multiplayer-arena']) {
    vm.runInNewContext(readFileSync(new URL(`../src/modules/${file}.js`, import.meta.url), 'utf8'), context, {filename: `${file}.js`});
  }
  const ui = new UI(); ui.pending = {q: {type: 'main'}};
  const arena = MTG.createOnlineArena({ui, client: {current: () => ({you: 1}), subscribe: () => () => {}}});
  const overlay = () => document.body.querySelector('.combat-replay-overlay');
  const button = name => overlay()?.querySelectorAll('button').find(node => node.textContent === name);
  const count = () => Number(overlay()?.querySelector('.combat-replay-progress').getAttribute('aria-valuemax') || 0);
  const step = () => overlay()?.querySelector('.combat-replay-step').querySelector('strong').textContent;
  return {arena, ui, document, gameRoot, timers, delays, overlay, button, count, step, MTG};
}

function replay(step, combatId = 'combat:7:1') {
  const attacker = {id: 'card:1', name: 'Public attacker', power: 2, toughness: 2, keywords: ['double strike'],
    dealtDamage: 2, receivedDamage: 0, countersBefore: {}, countersAfter: {}, controllerIdx: 0};
  const defender = {id: 'player:1', kind: 'player', name: 'Guest'};
  const damage = [{sourceId: attacker.id, targetId: defender.id, amount: 2, keywords: []}];
  return {id: `${combatId}:${step}`, combatId, turn: 7, step, attackerPlayer: {idx: 0, name: 'Host'},
    clashes: [{attacker, defender, blockers: [], blocked: false, damage, effects: []}], damage, effects: [], players: []};
}
const event = (id, replay) => ({id, event: {type: 'combatReplay', replay}});
function snapshot(combatReplays = [], events = []) {
  return JSON.parse(JSON.stringify({schema: 'commander-arena/v1', turn: 7, phase: 'main1', step: 'main',
    players: [0, 1].map(seat => ({seat, idx: seat, name: seat ? 'Guest' : 'Host', life: 40, hand: [], libraryCount: 0})),
    battlefield: [], stack: [], objects: [], combat: {attackers: []}, events, combatReplays}));
}

test('joining and reconnecting hydrate Replay without automatically playing past combat', () => {
  const f = presentation(), first = replay('first'), normal = replay('normal');
  const wire = snapshot([first, normal], [event(10, first), event(11, normal)]);
  f.arena.updateSnapshot(wire);
  assert.equal(f.ui.hasCombatReplay(), true);
  assert.equal(f.overlay(), null);
  f.ui.replayLastCombat();
  assert.equal(f.count(), 2); assert.equal(f.step(), 'First-strike damage');
  f.button('Next strike').click(); assert.equal(f.step(), 'Combat damage');
  f.button('Finish').click(); assert.equal(f.overlay(), null);
  f.arena.updateSnapshot(wire); f.arena.eventCursor = null; f.arena.updateSnapshot(wire);
  assert.equal(f.overlay(), null, 'refresh and same-session reconnect do not replay seen outcomes');
  const reconnect = presentation(); reconnect.arena.updateSnapshot(wire);
  assert.equal(reconnect.overlay(), null); assert.equal(reconnect.ui.hasCombatReplay(), true);
});

test('event and snapshot copies produce one ordered Replay and preserve the waiting decision', () => {
  const f = presentation(), pending = f.ui.pending, first = replay('first'), normal = replay('normal');
  f.arena.updateSnapshot(snapshot());
  f.arena.updateSnapshot(snapshot([first], [event(1, first)]));
  assert.equal(f.overlay(), null, 'combat plays on the table; the window never opens itself');
  const wire = snapshot([first, normal], [event(1, first), event(2, normal)]);
  f.arena.updateSnapshot(wire); f.arena.updateSnapshot(wire);
  f.ui.replayLastCombat();
  assert.equal(f.count(), 2, 'the transport event and retained history share replay identity');
  assert.equal(f.step(), 'First-strike damage');
  f.button('Next strike').click(); assert.equal(f.step(), 'Combat damage');
  f.button('Finish').click(); f.arena.updateSnapshot(wire);
  assert.equal(f.overlay(), null); assert.equal(f.ui.pending, pending); assert.equal(f.gameRoot.inert, false);
});

test('a dropped first-strike event is restored before the surviving normal-damage event', () => {
  const f = presentation(), first = replay('first'), normal = replay('normal');
  f.arena.updateSnapshot(snapshot());
  f.arena.updateSnapshot(snapshot([first, normal], [event(30, normal)]));
  assert.equal(f.overlay(), null);
  f.ui.replayLastCombat();
  assert.equal(f.count(), 2);
  assert.equal(f.step(), 'First-strike damage', 'retained step order wins when the public event buffer loses first strike');
  f.button('Next strike').click(); assert.equal(f.step(), 'Combat damage'); f.button('Finish').click();
  f.arena.updateSnapshot(snapshot([first, normal], [event(31, normal)]));
  assert.equal(f.overlay(), null, 'a newer transport record never opens the window');
});

test('full event rollover recovers combat, while older event-only combat cannot replace latest Replay history', () => {
  const f = presentation(), old = replay('normal', 'combat:6:1'), first = replay('first'), normal = replay('normal');
  f.arena.updateSnapshot(snapshot());
  f.arena.updateSnapshot(snapshot([first, normal], [event(5, old)]));
  assert.equal(f.overlay(), null);
  f.ui.replayLastCombat(); assert.equal(f.count(), 2); assert.equal(f.step(), 'First-strike damage'); f.button('Skip').click();
  const onlyFallback = presentation(); onlyFallback.arena.updateSnapshot(snapshot());
  onlyFallback.arena.updateSnapshot(snapshot([first, normal]));
  onlyFallback.ui.replayLastCombat();
  assert.equal(onlyFallback.count(), 2); assert.equal(onlyFallback.step(), 'First-strike damage');
});

test('event-only delivery is supported and changing games clears prior combat presentation', () => {
  const f = presentation(), normal = replay('normal'); f.arena.updateSnapshot(snapshot());
  const wire = snapshot([], [event(1, normal)]);
  f.arena.updateSnapshot(wire); f.arena.updateSnapshot(wire);
  assert.equal(f.overlay(), null);
  f.ui.replayLastCombat(); assert.equal(f.count(), 1);
  f.ui.game = {}; assert.equal(f.ui.hasCombatReplay(), false); assert.equal(f.overlay(), null);
  assert.equal(f.timers.size, 0); assert.equal(f.gameRoot.inert, false);
});

test('turning off automatic combat animation keeps outcomes available for manual Replay', () => {
  const f = presentation(), first = replay('first'), normal = replay('normal'), pending = f.ui.pending;
  f.ui.combatAnimationEnabled = false;
  f.arena.updateSnapshot(snapshot());
  const wire = snapshot([first, normal], [event(1, first), event(2, normal)]);
  f.arena.updateSnapshot(wire);
  assert.equal(f.overlay(), null);
  assert.equal(f.timers.size, 0);
  assert.equal(f.gameRoot.inert, false);
  assert.equal(f.ui.pending, pending);
  assert.equal(f.ui.hasCombatReplay(), true);
  f.ui.replayLastCombat();
  assert.equal(f.count(), 2);
  assert.equal(f.step(), 'First-strike damage');
  f.button('Next strike').click();
  assert.equal(f.step(), 'Combat damage');
  f.button('Finish').click();
  f.arena.updateSnapshot(wire);
  assert.equal(f.overlay(), null);
  assert.equal(f.ui.pending, pending);
});

test('the Combat animation setting never opens the window; Replay stays available', () => {
  const f = presentation();
  f.arena.updateSnapshot(snapshot());
  for (const [index, enabled] of [[1, false], [2, true]]) {
    f.ui.combatAnimationEnabled = enabled;
    const next = replay('normal', `combat:8:${index}`);
    f.arena.updateSnapshot(snapshot([next], [event(index, next)]));
    assert.equal(f.overlay(), null);
    assert.equal(f.ui.hasCombatReplay(), true);
  }
  f.ui.replayLastCombat(); assert.equal(f.count(), 1);
  f.button('Finish').click();
  assert.equal(f.gameRoot.inert, false);
});

test('a shared blocker shows each clash hit once while retaining labeled damage-step totals', () => {
  const f = presentation(), outcome = replay('normal');
  const blocker = {id: 'card:3', name: 'Shared blocker', power: 0, toughness: 8, keywords: [],
    dealtDamage: 0, receivedDamage: 5, countersBefore: {}, countersAfter: {}};
  const defender = outcome.clashes[0].defender;
  outcome.clashes = [2, 3].map((amount, index) => {
    const attacker = {...outcome.clashes[0].attacker, id: `card:${index + 1}`, dealtDamage: amount};
    return {attacker, defender, blockers: [blocker], blocked: true, effects: [],
      damage: [{sourceId: attacker.id, targetId: blocker.id, amount, keywords: []}]};
  });
  f.arena.updateSnapshot(snapshot());
  f.arena.updateSnapshot(snapshot([outcome], [event(1, outcome)]));
  f.ui.replayLastCombat();
  const visibleBlocker = () => f.overlay().querySelector('.fighter-blocker');
  assert.equal(visibleBlocker().querySelector('.combat-replay-hit').textContent, '−2');
  assert.match(visibleBlocker().querySelector('.combat-replay-stats').textContent, /5 taken this step/);
  f.button('Next strike').click();
  assert.equal(visibleBlocker().querySelector('.combat-replay-hit').textContent, '−3');
  assert.match(visibleBlocker().querySelector('.combat-replay-stats').textContent, /5 taken this step/);
  f.button('Finish').click();
});

test('stepping while paused reveals the result and keeps automatic playback stopped', () => {
  const f = presentation({reducedMotion: false}), first = replay('first'), normal = replay('normal');
  f.arena.updateSnapshot(snapshot());
  f.arena.updateSnapshot(snapshot([first, normal], [event(1, first), event(2, normal)]));
  f.ui.replayLastCombat();
  f.button('Pause').click();
  assert.equal(f.timers.size, 0);
  f.button('Next strike').click();
  assert.equal(f.step(), 'Combat damage');
  assert.equal(f.overlay().querySelector('.combat-replay-stage').dataset.impact, 'true');
  assert.ok(f.button('Resume'), 'manual stepping does not silently resume the replay');
  assert.equal(f.timers.size, 0);
  f.button('Resume').click();
  assert.equal(f.timers.size, 1, 'the revealed strike only needs its next-step timer');
  f.button('Finish').click();
  assert.equal(f.timers.size, 0);
  assert.equal(f.gameRoot.inert, false);
});

// Replay last combat follows the game speed after each hit.
function solo(speedFactor = 1.5625) {
  const f = presentation();
  f.MTG.SPEEDS = {normal: ['', 1.5625, ''], fast: ['', .9375, ''], slow: ['', 4.0625, '']};
  f.ui.game = {players: [], speedFactor};
  return f;
}

test('combat is animated on the table: a recorded step never opens the window by itself', () => {
  const f = solo(), first = replay('first'), normal = replay('normal'), pending = f.ui.pending;
  f.ui.showCombatReplay(first); f.ui.showCombatReplay(normal);
  assert.equal(f.overlay(), null);
  assert.equal(f.gameRoot.inert, false);
  assert.equal(f.ui.pending, pending);
  assert.equal(f.ui.hasCombatReplay(), true);
  f.ui.replayLastCombat();
  assert.equal(f.count(), 2);
  assert.equal(f.step(), 'First-strike damage');
  f.button('Skip').click();
  assert.equal(f.overlay(), null);
});

test('time after each hit follows the game speed', () => {
  const longest = f => Math.max(...[...f.delays.values()].filter(Number.isFinite));
  const timing = speed => { const f = solo(speed); f.ui.reducedMotion = false; f.ui.showCombatReplay(replay('normal')); f.ui.replayLastCombat(); return longest(f); };
  assert.equal(timing(1.5625), 3300, 'Normal keeps the authored timing');
  assert.ok(timing(.9375) < 3300, 'Fast is quicker');
  assert.ok(timing(4.0625) > 3300 && timing(4.0625) <= 650 + 2650 * 1.6, 'Slow is slower, within a limit');
});
