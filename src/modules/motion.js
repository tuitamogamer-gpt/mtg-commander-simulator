// Table continuity. The arena is rebuilt on every render, so without this a
// card that taps, moves, arrives or leaves simply jumps to its new state.
// Each render is compared with what the table showed just before it:
//   - a card still in the same zone travels from where it was drawn to where
//     it is drawn now, turning as it taps or untaps;
//   - a card that came from another place on screen (your hand, the Stack, a
//     player's zone) flies from there to its place;
//   - a card that is new on the table is set down in its place.
// Nothing here reads or changes game state: it animates the nodes the render
// produced, or disposable copies of them in a click-through layer.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const P = U.UI.prototype;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
// Cards of the table itself. Dialogs, sheets and browsers draw their own
// copies of a card with the same id; those never move.
const TABLE = '.oppsouter, .myboard, .handwrap';
const CARD = '.mini[data-iid], .hcard[data-iid]';
const STACK = '[data-stack-iid]';

let tokens = null;
const design = () => {
  if (tokens) return tokens;
  const css = getComputedStyle(document.documentElement);
  const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const ms = (name, fallback) => { const value = parseFloat(read(name, '')); return Number.isFinite(value) ? value : fallback; };
  tokens = {
    out: read('--ds-ease-out', 'cubic-bezier(.16, 1, .3, 1)'),
    standard: read('--ds-ease', 'cubic-bezier(.22, .61, .36, 1)'),
    exit: read('--ds-ease-in', 'cubic-bezier(.5, 0, .84, .4)'),
    travel: read('--ds-ease-travel', 'cubic-bezier(.6, .04, .3, 1)'),
    spring: read('--ds-ease-spring', 'cubic-bezier(.34, 1.36, .64, 1)'),
    fast: ms('--ds-t-fast', 140), base: ms('--ds-t-base', 220), slow: ms('--ds-t-slow', 360), flight: ms('--ds-t-travel', 440),
  };
  return tokens;
};

// The table keeps still for reduced motion, a hidden tab, a restored save
// (its replayed actions are not drawn, see main.js), bot simulations and
// instant games.
const still = ui => !ui?.game || ui.game._simulation || ui.accountReplay || ui.reducedMotion || reduce.matches || document.hidden ||
  document.body.classList.contains('reduced-motion') || !document.body.classList.contains('game-active') || ui.game.speedFactor === 0;

const zoomOf = (ui, node) => ui.viewportZoom ? ui.viewportZoom(node) : 1;
const matrix = transform => {
  if (!transform || transform === 'none') return null;
  try { const m = new DOMMatrixReadOnly(transform); return m.is2D ? m : null; } catch { return null; }
};
const linear = m => m ? `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, 0, 0)` : '';
const sameLinear = (a, b) => {
  if (!a && !b) return true;
  const [x, y] = [a || {a: 1, b: 0, c: 0, d: 1}, b || {a: 1, b: 0, c: 0, d: 1}];
  return Math.abs(x.a - y.a) < .002 && Math.abs(x.b - y.b) < .002 && Math.abs(x.c - y.c) < .002 && Math.abs(x.d - y.d) < .002;
};
const onScreen = box => box.y + box.rh / 2 > 0 && box.y - box.rh / 2 < innerHeight && box.x + box.rw / 2 > 0 && box.x - box.rw / 2 < innerWidth;

// What decides where everything sits. When it changes (another phone view,
// Table/Focus, a resized window) the table is redrawn somewhere else and
// nothing travels.
const layoutKey = (ui, root) => [ui.game && ui.game.turnNo !== undefined ? 'g' : '', root.dataset.mobileView || '', ui.commandTableView || '',
  ui.commandMobileBoard ?? '', ui.commandFocusPlayer ?? '', root.dataset.handSize || '', root.classList.contains('ct-target-room') ? 'room' : '',
  innerWidth, innerHeight, zoomOf(ui, root)].join('|');

function measure(node) {
  const r = node.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const style = getComputedStyle(node);
  return {node, x: r.left + r.width / 2, y: r.top + r.height / 2, rw: r.width, rh: r.height,
    w: node.offsetWidth, h: node.offsetHeight, transform: style.transform, opacity: Number(style.opacity)};
}

function snapshot(ui, root) {
  const cards = new Map();
  for (const node of root.querySelectorAll(CARD)) {
    if (!node.closest(TABLE)) continue;
    const key = (node.classList.contains('hcard') ? 'h' : 'b') + node.dataset.iid;
    if (cards.has(key)) continue;
    const box = measure(node);
    if (box) cards.set(key, box);
  }
  // Where a spell is shown while it is on the Stack: the place its permanent
  // comes from when it resolves, and the place a cast card goes to.
  for (const node of root.querySelectorAll(STACK)) {
    const key = 's' + node.dataset.stackIid;
    if (cards.has(key)) continue;
    const art = node.matches('img') ? node : node.querySelector('img') || node;
    const box = measure(art);
    if (box) cards.set(key, box);
  }
  return cards;
}

// The numbers and marks of the table's chrome: the current step, each life
// total and each zone count.
const LIFE = '.opplife b, .melife';
const lifeText = node => (node.matches('.melife') ? node.firstChild?.nodeValue : node.textContent) || '';
function chrome(root) {
  const on = root.querySelector('.arenaheader .stepper .step.on');
  const life = new Map(), counts = new Map();
  for (const seat of root.querySelectorAll('[data-player-id]')) {
    const id = seat.dataset.playerId;
    const total = seat.querySelector(LIFE);
    const value = total && Number(lifeText(total).trim());
    if (total && Number.isFinite(value) && !life.has(id)) life.set(id, value);
    for (const counter of seat.querySelectorAll('.zonecounter[data-z]')) {
      const key = `${id}|${counter.dataset.z}`;
      if (!counts.has(key)) counts.set(key, counter.querySelector('b')?.textContent || '');
    }
  }
  return {step: on ? on.dataset.step : null, stepIndex: on ? [...on.parentNode.children].indexOf(on) : -1, life, counts};
}

// The dialogs on top of the table: their plates, for the moment they close.
function surfaces(root) {
  const list = [];
  for (const overlay of root.querySelectorAll(':scope > .overlay, :scope > .quickmenuov')) {
    const dialog = overlay.querySelector('.modal, .sheet, .quickmenu');
    const r = dialog?.getBoundingClientRect();
    if (!r || !r.width || !r.height) continue;
    const style = getComputedStyle(dialog), veil = getComputedStyle(overlay);
    list.push({overlay, x: r.left, y: r.top, w: r.width, h: r.height, radius: style.borderRadius, background: style.background,
      border: style.border, shadow: style.boxShadow, veil: veil.backgroundColor});
  }
  return list;
}

// Called by the render just before the new arena is committed: what the table
// shows now, flights in mid-air included.
P.captureMotion = function (root) {
  if (still(this) || !root) { this._motion = null; return; }
  this._motion = {game: this.game, layout: layoutKey(this, root), cards: snapshot(this, root), zones: this._zoneSnapshot || null,
    chrome: chrome(root), surfaces: surfaces(root)};
};

// The layer is a child of the arena, so a flying copy is drawn by the same
// rules as the card it copies. It belongs to no render: the commit keeps it
// (arena-render.js).
const layer = () => {
  let node = document.querySelector('#game > .motionlayer');
  if (!node) {
    node = document.createElement('div');
    node.className = 'motionlayer';
    node.setAttribute('aria-hidden', 'true');
    document.querySelector('#game')?.appendChild(node);
  }
  return node;
};
const tidy = () => { const node = document.querySelector('.motionlayer'); if (node && !node.childElementCount) node.remove(); };

// A picture of a card for the layer: no ids, focus, controls or state marks.
function picture(node) {
  const copy = node.cloneNode(true);
  for (const el of [copy, ...copy.querySelectorAll('[id], [tabindex], [role], [aria-label]')]) {
    el.removeAttribute('id'); el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-label');
  }
  copy.querySelectorAll('button, a[href], input, select, textarea').forEach(el => el.replaceWith(...el.childNodes));
  copy.classList.remove('targetable', 'target-selected', 'selected', 'castable', 'actable', 'arrival-highlight', 'fx-charging', 'tapped', 'sick');
  // The copy fills the flight's box whatever lane its original stood in.
  for (const [name, value] of [['position', 'relative'], ['inset', 'auto'], ['display', 'block'], ['width', '100%'], ['height', '100%'],
    ['min-width', '0'], ['max-width', 'none'], ['min-height', '0'], ['max-height', 'none'], ['margin', '0'], ['transform', 'none'],
    ['translate', 'none'], ['rotate', 'none'], ['scale', 'none'], ['opacity', '1'], ['filter', 'none'], ['animation', 'none'], ['transition', 'none']]) {
    copy.style.setProperty(name, value, 'important');
  }
  return copy;
}

// Where a card that is new on the table came from, as the zones of the last
// render knew it. A card that was in no zone (a token, a copy) is new.
function origin(zones, iid) {
  if (!zones) return null;
  if (zones.stack?.has(iid)) return {zone: 'stack'};
  for (const [player, was] of zones.players || []) {
    for (const zone of ['hand', 'graveyard', 'exile', 'library']) if (was[zone]?.has(iid)) return {zone, player};
  }
  return null;
}

// What the last renders moved and why (inspectable in tests), newest last.
const record = U.motionLog = [];
const note = (kind, key, detail) => { record.push({kind, key, ...detail}); if (record.length > 80) record.splice(0, record.length - 80); };

// Flights in mid-air, by card key. A render that arrives during a flight
// replaces the card it is flying to; the new node stays hidden until landing.
const flights = new Map();
// A card can be between two places for a render or two: gone from your hand
// and not yet on the table while its land drop or spell is applied. Where it
// was last drawn is remembered briefly, so its arrival still starts there.
const left = new Map();
const LEFT_FOR = 900;
const hide = (node, remaining, opacity) => node.animate([{opacity: 0}, {opacity: 0, offset: .72}, {opacity}],
  {duration: Math.max(60, remaining), easing: 'linear'});

function fly(ui, key, from, to, {delay = 0, shrink = false} = {}) {
  const t = design(), host = layer(), z = zoomOf(ui, host);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = Math.round(Math.min(640, Math.max(t.slow + 20, t.flight * .7 + distance * .32)));
  // The larger of the two is the picture that flies, so nothing is drawn
  // enlarged: your hand card shrinks to its place on the table, a spell on
  // the Stack grows from its thumbnail.
  const large = from.w * from.h >= to.w * to.h ? from : to;
  const ghost = document.createElement('div'), lift = document.createElement('div');
  ghost.className = 'motion-flight';
  lift.className = 'motion-lift';
  Object.assign(ghost.style, {left: `${large.x / z - large.w / 2}px`, top: `${large.y / z - large.h / 2}px`, width: `${large.w}px`, height: `${large.h}px`});
  lift.append(picture(large.node));
  ghost.append(lift);
  host.append(ghost);
  // A box's pose as seen from the flying picture: its place, its turn (a card
  // that enters tapped lands tapped) and its size.
  const pose = box => `translate(${(box.x - large.x) / z}px, ${(box.y - large.y) / z}px) ${linear(matrix(box.transform)) || 'matrix(1, 0, 0, 1, 0, 0)'} scale(${box.h / large.h})`;
  const flight = ghost.animate([
    {transform: pose(from), opacity: shrink ? 1 : 0, offset: 0},
    {opacity: 1, offset: .14},
    {transform: pose(to), opacity: 1, offset: .88},
    {transform: pose(to), opacity: 0, offset: 1},
  ], {duration, delay, easing: t.travel, fill: 'both'});
  // The card rises off the table on the way and is set down.
  const rise = Math.min(22, 6 + distance * .04);
  lift.animate([{transform: 'none'}, {transform: `translateY(${-rise}px) scale(1.07)`, offset: .45}, {transform: 'none', offset: .9}, {transform: 'none'}],
    {duration, delay, easing: 'ease-in-out', fill: 'both'});
  const entry = {end: performance.now() + delay + duration, duration: delay + duration, opacity: to.opacity};
  flights.set(key, entry);
  if (to.node.isConnected) hide(to.node, entry.duration, to.opacity);
  const done = () => { ghost.remove(); if (flights.get(key) === entry) flights.delete(key); tidy(); };
  flight.onfinish = done; flight.oncancel = done;
}

// A place on screen that stands for a zone the table does not draw as cards:
// the player's zone counter, or the stand-in the card flights use.
function zoneBox(ui, player, zone) {
  const counter = document.querySelector(`#game [data-player-id="${player.idx}"] .zonecounter.zone-${zone}`);
  const box = counter && measure(counter);
  if (box && onScreen(box)) return box;
  const node = ui.zoneFlightAnchor?.(player, zone);
  return node ? measure(node) : null;
}

// Life totals count to their new value instead of switching. A render during
// the count replaces the number's node; the count continues on the new one.
const counting = new Map();
let ticking = false;
const lifeNodes = id => document.querySelectorAll(`#game [data-player-id="${id}"] :is(.opplife b, .melife)`);
const showLife = (id, value) => {
  for (const node of lifeNodes(id)) {
    if (!node.matches('.melife')) node.textContent = String(value);
    else if (node.firstChild?.nodeType === 3) node.firstChild.nodeValue = String(value);
  }
};
function countLife() {
  const clock = performance.now();
  for (const [id, count] of counting) {
    const progress = Math.min(1, (clock - count.start) / count.duration);
    showLife(id, progress >= 1 ? count.to : Math.round(count.from + (count.to - count.from) * (1 - Math.pow(1 - progress, 3))));
    if (progress >= 1) counting.delete(id);
  }
  if (counting.size) requestAnimationFrame(countLife); else ticking = false;
}

function playChrome(ui, root, before) {
  const t = design(), now = chrome(root);
  // The current step's pill wipes in from the side of the step before it.
  if (before.step && now.step && before.step !== now.step) {
    const pill = root.querySelector('.arenaheader .stepper .step.on');
    const back = now.stepIndex < before.stepIndex && before.stepIndex - now.stepIndex < 4;
    const closed = back ? 'inset(-12px -12px -12px 100% round 7px)' : 'inset(-12px 100% -12px -12px round 7px)';
    pill?.animate([{clipPath: closed}, {clipPath: 'inset(-12px -12px -12px -12px round 7px)'}], {duration: t.base + 40, easing: t.out});
  }
  for (const [id, value] of now.life) {
    const was = before.life.get(id);
    if (was === undefined || was === value) continue;
    counting.set(id, {from: was, to: value, start: performance.now(), duration: Math.min(900, 320 + Math.abs(value - was) * 28)});
    const gained = value > was;
    for (const node of lifeNodes(id)) {
      const tone = getComputedStyle(document.documentElement).getPropertyValue(gained ? '--ds-good' : '--ds-danger').trim() || (gained ? '#7fcaa4' : '#ef8b7b');
      node.animate([{color: tone}, {color: tone, offset: .45}, {color: getComputedStyle(node).color}], {duration: 720, easing: 'ease-out'});
    }
  }
  if (counting.size) { for (const [id, count] of counting) showLife(id, count.from); if (!ticking) { ticking = true; requestAnimationFrame(countLife); } }
  // A zone count that changed gives a small nod.
  for (const [key, value] of now.counts) {
    const was = before.counts.get(key);
    if (was === undefined || was === value) continue;
    const [id, zone] = key.split('|');
    const counter = root.querySelector(`[data-player-id="${id}"] .zonecounter[data-z="${zone}"]`);
    counter?.animate([{transform: 'scale(1)'}, {transform: 'scale(1.16)', offset: .35}, {transform: 'scale(1)'}], {duration: t.slow, easing: t.out});
  }
}

// A dialog that closed: its dim and its plate fade away instead of cutting.
// The copies carry no content and none of the dialog's class names.
function playClosed(ui, root, before) {
  const t = design(), host = layer(), z = zoomOf(ui, host);
  const open = root.querySelector(':scope > .overlay, :scope > .quickmenuov');
  for (const surface of before) {
    if (surface.overlay.isConnected || surface.overlay._dialogReplaced) continue;
    const plate = document.createElement('div');
    plate.className = 'motion-plate';
    Object.assign(plate.style, {left: `${surface.x / z}px`, top: `${surface.y / z}px`, width: `${surface.w / z}px`, height: `${surface.h / z}px`,
      borderRadius: surface.radius, background: surface.background, border: surface.border, boxShadow: surface.shadow});
    host.append(plate);
    const leave = plate.animate([{opacity: .92, transform: 'none'}, {opacity: 0, transform: 'translateY(8px) scale(.975)'}],
      {duration: t.fast + 20, easing: t.exit, fill: 'forwards'});
    leave.onfinish = leave.oncancel = () => { plate.remove(); tidy(); };
    if (open) continue;
    const veil = document.createElement('div');
    veil.className = 'motion-veil';
    veil.style.background = surface.veil;
    host.prepend(veil);
    const lift = veil.animate([{opacity: 1}, {opacity: 0}], {duration: t.base, easing: t.standard, fill: 'forwards'});
    lift.onfinish = lift.oncancel = () => { veil.remove(); tidy(); };
  }
  tidy();
}

// Called by the render after the arena is committed and the lanes are fitted.
P.playMotion = function (root) {
  const before = this._motion;
  this._motion = null;
  if (!before || !root || still(this) || before.game !== this.game) return;
  playChrome(this, root, before.chrome);
  playClosed(this, root, before.surfaces);
  const now = snapshot(this, root);
  // Keep a card hidden while its flight from the previous render is in the air.
  const clock = performance.now();
  for (const [key, entry] of flights) {
    const box = now.get(key);
    if (!box || entry.end <= clock) continue;
    hide(box.node, entry.end - clock, box.opacity);
  }
  if (before.layout !== layoutKey(this, root)) return;
  const t = design(), z = zoomOf(this, root);
  let arrivals = 0, moved = 0;
  for (const [key, next] of now) {
    const kind = key[0], iid = key.slice(1);
    if (kind === 's' || flights.has(key)) continue;
    const prev = before.cards.get(key);
    const to = matrix(next.transform);
    // The card's own place, without what its transform adds (a hover lift).
    const homeX = next.x - (to ? to.e * z : 0), homeY = next.y - (to ? to.f * z : 0);
    const own = next.transform === 'none' ? '' : next.transform;
    if (prev) {
      const from = matrix(prev.transform);
      const dx = (prev.x - homeX) / z, dy = (prev.y - homeY) / z;
      const sx = prev.w / next.w, sy = prev.h / next.h;
      const turned = !sameLinear(from, to), resized = Math.abs(sx - 1) > .01 || Math.abs(sy - 1) > .01;
      const shifted = Math.hypot(dx - (to ? to.e : 0), dy - (to ? to.f : 0)) > 1;
      const faded = Math.abs(prev.opacity - next.opacity) > .02;
      if (!turned && !resized && !shifted && !faded) continue;
      if (!onScreen(prev) && !onScreen(next)) continue;
      if (++moved > 90) continue;
      const frames = [{transform: `translate(${dx}px, ${dy}px) ${linear(from)}${resized ? ` scale(${sx}, ${sy})` : ''}`.trim(), opacity: prev.opacity},
        {transform: own || 'none', opacity: next.opacity}];
      const distance = Math.hypot(dx, dy);
      // A turn in place is a tap: short, with a little weight at the end.
      const tap = turned && !shifted && !resized;
      next.node.animate(frames, {duration: tap ? t.base + 40 : Math.round(Math.min(t.flight, Math.max(t.base, t.fast + distance * .5))),
        easing: tap ? t.spring : t.out});
      if (moved <= 12) note(tap ? 'turn' : 'move', key, {});
      continue;
    }
    // New in this zone. Did it come from another place on screen?
    const recall = name => { const box = before.cards.get(name) || left.get(name)?.box; left.delete(name); return box; };
    const other = recall((kind === 'h' ? 'b' : 'h') + iid) || (kind === 'b' ? recall('s' + iid) : null);
    if (other && onScreen(other)) { note('fly', key, {from: 'card'}); fly(this, key, other, next, {shrink: true}); continue; }
    if (!onScreen(next)) continue;
    const came = origin(before.zones, Number(iid));
    const card = this.game.byIid?.(Number(iid));
    const owner = came?.player || card?.owner;
    const source = came && owner && came.zone !== 'stack' ? zoneBox(this, owner, came.zone) : null;
    const delay = Math.min(arrivals++, 8) * 45;
    if (source && Math.hypot(source.x - next.x, source.y - next.y) > 60) {
      // From a zone that is not drawn as cards: the card grows out of the
      // player's zone marker and travels to its place.
      note('fly', key, {from: came.zone});
      fly(this, key, {x: source.x, y: source.y, w: next.w * .36, h: next.h * .36, transform: 'none', node: next.node}, next, {delay});
      continue;
    }
    note('set', key, {});
    // Set down in place: your drawn card rises into the hand, a permanent
    // lands on the table.
    const frames = kind === 'h'
      ? [{transform: `translateY(${22}px) scale(.94) ${own}`.trim(), opacity: 0}, {opacity: next.opacity, offset: .6}, {transform: own || 'none', opacity: next.opacity}]
      : [{transform: `translateY(-12px) scale(1.14) ${own}`.trim(), opacity: 0}, {opacity: next.opacity, offset: .4},
        {transform: `scale(.985) ${own}`.trim(), offset: .78}, {transform: own || 'none', opacity: next.opacity}];
    next.node.animate(frames, {duration: kind === 'h' ? t.slow - 60 : t.slow - 20, delay, easing: t.out, fill: 'backwards'});
  }
  for (const [key, entry] of left) if (clock - entry.at > LEFT_FOR) left.delete(key);
  for (const [key, prev] of before.cards) {
    if (now.has(key) || !onScreen(prev)) continue;
    const iid = key.slice(1);
    if (key[0] === 'h') {
      if (now.has('b' + iid)) continue;
      // A card that left your hand for the Stack travels to where the spell is shown.
      const spell = now.get('s' + iid);
      if (spell && onScreen(spell) && !flights.has('s' + iid)) { note('fly', 's' + iid, {from: 'hand'}); fly(this, 's' + iid, prev, spell, {shrink: true}); continue; }
      left.set(key, {box: prev, at: clock});
    } else if (key[0] === 's' && !now.has('b' + iid)) left.set(key, {box: prev, at: clock});
  }
};

// Tests and tools: how many flights are in the air.
U.motionState = () => ({flights: flights.size, layer: !!document.querySelector('.motionlayer')});
const clear = () => { document.querySelector('.motionlayer')?.remove(); flights.clear(); counting.clear(); left.clear(); };
document.addEventListener('visibilitychange', clear);
window.addEventListener('resize', clear);
reduce.addEventListener?.('change', clear);
})();
