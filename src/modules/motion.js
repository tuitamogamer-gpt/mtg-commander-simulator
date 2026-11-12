// Table continuity. The arena is rebuilt on every render, so without this a
// card that taps, moves, arrives or leaves simply jumps to its new state.
// Each render is compared with what the table showed just before it:
//   - a card still in its place travels from where it was drawn to where it is
//     drawn now, turning as it taps or untaps;
//   - a card that was shown somewhere else flies from there: your hand card to
//     the Stack or the table, a spell from where the Stack shows it to its
//     place, your commander from and to its dock;
//   - a card that came from a zone the table shows as a count (a library, an
//     opponent's hand, a graveyard) flies from that player's counter, and a
//     spell that resolved flies to its owner's graveyard counter;
//   - a card with no place to come from (a token) is set down in its place.
// The header's current step, life totals, zone counts and closing dialogs
// change the same way: from what was shown to what is shown.
// Nothing here reads or changes game state: it animates the nodes the render
// produced, or disposable copies of them in a click-through layer.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const P = U.UI.prototype;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

// Durations and easings are the design system's (design-system.css).
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
// (its replayed actions are not drawn: main.js runs them at speed 0), bot
// simulations and instant games.
const still = ui => !ui?.game || ui.game._simulation || ui.accountReplay || ui.reducedMotion || reduce.matches || document.hidden ||
  document.body.classList.contains('reduced-motion') || !document.body.classList.contains('game-active') || ui.game.speedFactor === 0;

const zoomOf = (ui, node) => ui.viewportZoom ? ui.viewportZoom(node) : 1;
const matrix = transform => {
  if (!transform || transform === 'none') return null;
  try { const m = new DOMMatrixReadOnly(transform); return m.is2D ? m : null; } catch { return null; }
};
const linear = m => m ? `matrix(${m.a}, ${m.b}, ${m.c}, ${m.d}, 0, 0)` : '';
const sameLinear = (a, b) => {
  const [x, y] = [a || {a: 1, b: 0, c: 0, d: 1}, b || {a: 1, b: 0, c: 0, d: 1}];
  return Math.abs(x.a - y.a) < .002 && Math.abs(x.b - y.b) < .002 && Math.abs(x.c - y.c) < .002 && Math.abs(x.d - y.d) < .002;
};
const onScreen = box => box.y + box.rh / 2 > 0 && box.y - box.rh / 2 < innerHeight && box.x + box.rw / 2 > 0 && box.x - box.rw / 2 < innerWidth;

// What decides where everything sits. When it changes (another phone view or
// board, another focused opponent, Table/Focus, another hand size, a resized
// window) the table is redrawn somewhere else and nothing travels.
// It is read from the arena as it is drawn, never from the UI's state: a
// render has already changed that state when it captures the table it is
// about to replace. A phone follows the active player to their board on
// every new turn; read from the state, that board's cards all "arrived".
const layoutKey = (ui, root) => {
  // A desktop that shows every lane (Table, or Focus while you choose targets
  // or declare combat) keeps its lanes whichever opponent is focused.
  const grid = root.classList.contains('ct-grid-view');
  return [root.dataset.mobileView || '', root.dataset.mobileBoard || '', grid ? 'grid' : root.classList.contains('ct-show-all') ? 'all' : 'one',
    grid ? '' : root.querySelector('.opprow.ct-focused')?.dataset.playerId || '', root.dataset.handSize || '',
    innerWidth, innerHeight, zoomOf(ui, root)].join('|');
};

// A node's box: its centre and painted size in viewport pixels, its layout
// size, and the transform and opacity it is drawn with.
function measure(node) {
  const r = node.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const style = getComputedStyle(node);
  return {node, x: r.left + r.width / 2, y: r.top + r.height / 2, rw: r.width, rh: r.height,
    w: node.offsetWidth || r.width, h: node.offsetHeight || r.height, transform: style.transform, opacity: Number(style.opacity)};
}

// Every place the table shows a card, by kind and card id:
//   b  a permanent on a battlefield     h  a card in your hand
//   s  a spell where the Stack shows it c  your commander in its dock
// A phone shows lands as one count per name ("Swamp 4/6"): that chip is the
// place of each of its lands (a shared box). Dialogs, sheets and zone browsers
// draw their own copies of a card with the same id; those never move.
const TABLE = '.oppsouter, .myboard, .handwrap';
const KINDS = ['b', 'h', 's', 'c'];
function snapshot(root) {
  const cards = new Map();
  const add = (key, node) => { if (cards.has(key) || !node) return; const box = measure(node); if (box) cards.set(key, box); };
  for (const node of root.querySelectorAll('.mini[data-iid], .hcard[data-iid]')) {
    if (node.closest(TABLE)) add((node.classList.contains('hcard') ? 'h' : 'b') + node.dataset.iid, node);
  }
  for (const node of root.querySelectorAll('.landstack[data-land-iids], .oppLands[data-land-iids]')) {
    const box = node.closest(TABLE) && measure(node);
    if (!box) continue;
    box.shared = true;
    for (const iid of node.dataset.landIids.split(' ')) if (iid && !cards.has('b' + iid)) cards.set('b' + iid, box);
  }
  for (const node of root.querySelectorAll('[data-stack-iid]')) add('s' + node.dataset.stackIid, node.matches('img') ? node : node.querySelector('img') || node);
  for (const node of root.querySelectorAll('.ct-commander-card[data-command-state="command"][data-iid]')) add('c' + node.dataset.iid, node.querySelector('img') || node);
  return cards;
}
// Where a phone shows the Stack while its own view is closed: its tab.
function stackTab() {
  const tab = document.querySelector('#game .mobileviewtab[data-view="stack"]');
  const box = tab && measure(tab);
  return box && onScreen(box) ? box : null;
}

// The numbers and marks of the table's chrome: the current step, each life
// total and each zone count.
const lifeText = node => (node.matches('.melife') ? node.firstChild?.nodeValue : node.textContent) || '';
function chrome(root) {
  const on = root.querySelector('.arenaheader .stepper .step.on');
  const life = new Map(), counts = new Map();
  for (const seat of root.querySelectorAll('[data-player-id]')) {
    const id = seat.dataset.playerId;
    const total = seat.querySelector('.opplife b, .melife');
    const value = total && Number(lifeText(total).trim());
    if (total && Number.isFinite(value) && !life.has(id)) life.set(id, value);
    for (const counter of seat.querySelectorAll('.zonecounter[data-z]')) {
      const key = `${id}|${counter.dataset.z}`;
      if (!counts.has(key)) counts.set(key, counter.querySelector('b')?.textContent || '');
    }
  }
  // A phone's Stack tab carries the Stack's count.
  const tab = root.querySelector('.mobileviewtab[data-view="stack"]');
  if (tab) counts.set('tab|stack', tab.textContent.trim());
  // The decision panel: a strip under the table, or a panel over its right
  // edge while a review, the Stack or a choice of targets is open.
  const rail = root.querySelector(':scope > .ct-decision-rail');
  return {step: on ? on.dataset.step : null, stepIndex: on ? [...on.parentNode.children].indexOf(on) : -1, life, counts,
    rail: rail ? {open: root.classList.contains('ct-expanded-decision'), plate: plateOf(rail)} : null};
}

// What a surface looks like without its content: its box and its material.
function plateOf(node) {
  const r = node.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const style = getComputedStyle(node);
  return {x: r.left, y: r.top, w: r.width, h: r.height, radius: style.borderRadius, background: style.background, border: style.border, shadow: style.boxShadow};
}

// The surfaces on top of the table, for the moment they close: dialogs with
// their dim, and the Stack's window.
function surfaces(root) {
  const list = [];
  for (const overlay of root.querySelectorAll(':scope > .overlay, :scope > .quickmenuov, :scope > .stackpopwrap')) {
    const dialog = overlay.querySelector('.modal, .sheet, .quickmenu, .stackpop');
    const plate = dialog && plateOf(dialog);
    if (!plate) continue;
    const floating = overlay.matches('.stackpopwrap');
    list.push({overlay, plate, floating, veil: floating ? null : getComputedStyle(overlay).backgroundColor});
  }
  return list;
}

// Motion is decoration. A failure here must never reach the render, whose
// own failure is a recovery dialog over the table: it is reported once to
// the console and the table simply does not move for that render.
let reported = false;
const guarded = (ui, run) => {
  try { return run(); } catch (error) {
    ui._motion = null;
    clear();
    if (!reported) { reported = true; console.error('Table motion skipped', error); }
    return undefined;
  }
};

// Called by the render just before the new arena is committed: what the table
// shows now.
P.captureMotion = function (root) {
  if (still(this) || !root) { this._motion = null; return; }
  guarded(this, () => {
    this._motion = {game: this.game, layout: layoutKey(this, root), cards: snapshot(root), zones: this._zoneSnapshot || null,
      chrome: chrome(root), surfaces: surfaces(root)};
  });
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
const tidy = () => { const node = document.querySelector('#game > .motionlayer'); if (node && !node.childElementCount) node.remove(); };

// A picture of a card for the layer: no ids, focus, controls or state marks.
function picture(node) {
  const copy = node.cloneNode(true);
  for (const el of [copy, ...copy.querySelectorAll('*')]) {
    for (const name of ['id', 'tabindex', 'role', 'aria-label', 'title', 'data-iid', 'data-stack-iid', 'data-cname']) el.removeAttribute(name);
    if (el.tagName === 'IMG') { el.loading = 'eager'; el.decoding = 'sync'; }
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

// What the last renders moved and why (inspectable in tests), newest last.
const record = U.motionLog = [];
const note = (kind, key, from) => { record.push(from ? {kind, key, from} : {kind, key}); if (record.length > 120) record.splice(0, record.length - 120); };

// Flights in the air, by the key of the card they fly to. A render that
// arrives during a flight replaces that card; the new node stays hidden until
// the flight lands.
const flights = new Map();
function hideUntilLanding(node, entry, opacity) {
  const wait = entry.land - performance.now();
  if (wait <= 0 || !node.isConnected) return;
  node.animate([{opacity: 0}, {opacity: 0, offset: wait / (wait + 70)}, {opacity}], {duration: wait + 70, easing: 'linear'});
}

// A card flies from one box to another. The larger of the two is the picture
// that flies, so nothing is drawn enlarged: your hand card shrinks to its
// place on the table, a spell grows from its thumbnail on the Stack. It lands
// in the pose of its destination: a land that enters tapped lands tapped.
// Between two small places (an opponent's hand counter and a Stack thumbnail)
// the card comes forward on the way, large enough to be recognised.
const SHOWN = 62;
function fly(ui, key, from, to, {delay = 0, appear = false, face = null} = {}) {
  const t = design(), host = layer(), z = zoomOf(ui, host);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const large = from.w * from.h >= to.w * to.h ? from : to;
  const forward = large.w < SHOWN ? SHOWN / large.w : 1;
  const travel = Math.round(Math.min(560, Math.max(t.slow - 40, t.flight * .62 + distance * .28)) * (forward > 1 ? 1.25 : 1));
  const total = travel + 110;
  const width = large.w * forward, height = large.h * forward;
  const ghost = document.createElement('div'), lift = document.createElement('div');
  ghost.className = 'motion-flight';
  lift.className = 'motion-lift';
  Object.assign(ghost.style, {left: `${large.x / z - width / 2}px`, top: `${large.y / z - height / 2}px`, width: `${width}px`, height: `${height}px`});
  lift.append(picture(face || large.node));
  ghost.append(lift);
  host.append(ghost);
  const pose = box => `translate(${(box.x - large.x) / z}px, ${(box.y - large.y) / z}px) ${linear(matrix(box.transform)) || 'matrix(1, 0, 0, 1, 0, 0)'} scale(${box.h / height})`;
  ghost.animate([{transform: pose(from)}, {transform: pose(to)}], {duration: travel, delay, easing: t.travel, fill: 'both'});
  // The real card appears under the copy as it lands; the copy then fades.
  const fade = ghost.animate([{opacity: appear ? 0 : 1}, {opacity: 1, offset: appear ? .16 : 0}, {opacity: 1, offset: (travel + 40) / total}, {opacity: 0}],
    {duration: total, delay, easing: 'linear', fill: 'both'});
  // The card rises off the table on the way and is set down.
  const rise = Math.min(20, 5 + distance * .035);
  lift.animate([{transform: 'none'}, {transform: `translateY(${-rise}px) scale(${forward > 1 ? forward * .92 : 1.06})`, offset: forward > 1 ? .5 : .46}, {transform: 'none'}],
    {duration: travel, delay, easing: 'ease-in-out', fill: 'both'});
  const entry = {land: performance.now() + delay + travel, end: performance.now() + delay + total, shared: !!to.shared};
  flights.set(key, entry);
  // A count that stands for several lands stays; the card is taken into it.
  if (!to.shared) hideUntilLanding(to.node, entry, to.opacity);
  const done = () => { ghost.remove(); if (flights.get(key) === entry) flights.delete(key); tidy(); };
  fade.onfinish = done; fade.oncancel = done;
}

// A card flies away to a place that shows no card (a zone counter): it shrinks
// into it and is gone.
function flyAway(ui, from, to) {
  const t = design(), host = layer(), z = zoomOf(ui, host);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = Math.round(Math.min(520, Math.max(t.slow - 40, t.flight * .6 + distance * .26)));
  const ghost = document.createElement('div');
  ghost.className = 'motion-flight';
  Object.assign(ghost.style, {left: `${from.x / z - from.w / 2}px`, top: `${from.y / z - from.h / 2}px`, width: `${from.w}px`, height: `${from.h}px`});
  const lift = document.createElement('div');
  lift.className = 'motion-lift';
  lift.append(picture(from.node));
  ghost.append(lift);
  host.append(ghost);
  const scale = Math.max(.3, Math.min(1, Math.min(to.rw, to.rh) / z / Math.max(from.w, 1)));
  const leave = ghost.animate([
    {transform: `${linear(matrix(from.transform)) || 'none'}`, opacity: 1},
    {opacity: 1, offset: .7},
    {transform: `translate(${(to.x - from.x) / z}px, ${(to.y - from.y) / z}px) scale(${scale})`, opacity: 0},
  ], {duration, easing: t.travel, fill: 'both'});
  leave.onfinish = leave.oncancel = () => { ghost.remove(); tidy(); };
}

// A card can be shown nowhere for a render or two: gone from your hand and not
// yet on the table while its land drop is applied, off the Stack and not yet
// in play while its spell resolves. Where it was last shown is remembered
// briefly, so its next appearance still starts there.
const left = new Map();
const LEFT_FOR = 1100;
// Where a card that is new in a place was shown before, as another kind:
// at the last render, or else the most recent place that is remembered.
function shownBefore(before, kind, iid) {
  let found = null;
  for (const other of KINDS) {
    if (other === kind) continue;
    const box = before.cards.get(other + iid);
    if (box) return {box, kind: other};
    const entry = left.get(other + iid);
    if (entry && (!found || entry.at > found.at)) found = {box: entry.box, kind: other, at: entry.at};
  }
  return found;
}

// The zone a card was in at the last render, when the table shows that zone
// as a count: a hand, a library, a graveyard, exile. A commander that was in
// no such zone came from the command zone.
function zoneBefore(ui, zones, iid) {
  for (const [player, was] of zones?.players || []) {
    for (const zone of ['hand', 'graveyard', 'exile', 'library']) if (was[zone]?.has(iid)) return {zone, player};
  }
  const card = cardOf(ui, iid);
  return card?.commander && card.owner && !zones?.battlefield?.has(iid) && !zones?.stack?.has(iid) ? {zone: 'command', player: card.owner} : null;
}
// A card by its id, wherever it is: in a zone or on the Stack.
function cardOf(ui, iid) {
  return ui.game.byIid?.(iid) || ui.game.stack?.find(spell => spell.card && spell.card.iid === iid)?.card || null;
}
// The place on screen that stands for a player's zone: its counter, the
// command-zone mark, or the stand-in the card flights use (ui.js).
function zoneBox(ui, player, zone) {
  const seat = `#game [data-player-id="${player.idx}"]`;
  const mark = document.querySelector(zone === 'command' ? `${seat} .oppcmd` : `${seat} .zonecounter.zone-${zone}`);
  const box = mark && measure(mark);
  if (box && onScreen(box)) return box;
  const node = zone === 'command' ? null : ui.zoneFlightAnchor?.(player, zone);
  const standIn = node && measure(node);
  return standIn && onScreen(standIn) ? standIn : null;
}

// A life total that changed rolls over: the old number leaves upward as a
// disposable copy, the new one arrives from below in the colour of the change.
// The number the table shows is the true one at every moment.
// A player's life is shown in their lane head and, on a phone, on their seat.
const lifeNodes = id => document.querySelectorAll(`#game [data-player-id="${id}"] :is(.opplife b, .melife), #game .ct-seat[data-focus-player="${id}"] .ct-seat-life`);
function rollLife(ui, id, was, value) {
  const t = design();
  const tone = getComputedStyle(document.documentElement).getPropertyValue(value > was ? '--ds-good' : '--ds-danger').trim() || (value > was ? '#7fcaa4' : '#ef8b7b');
  for (const node of lifeNodes(id)) {
    const text = node.firstChild?.nodeType === 3 ? node.firstChild : null;
    if (!text) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    const r = range.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
    const style = getComputedStyle(node), host = layer(), z = zoomOf(ui, host);
    const ghost = document.createElement('span');
    ghost.className = 'motion-number';
    ghost.textContent = text.nodeValue.replace(/-?\d+/, String(was));
    Object.assign(ghost.style, {left: `${r.left / z}px`, top: `${r.top / z}px`, height: `${r.height / z}px`, lineHeight: `${r.height / z}px`,
      fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight, fontVariantNumeric: style.fontVariantNumeric,
      letterSpacing: style.letterSpacing, color: style.color});
    host.append(ghost);
    const leave = ghost.animate([{transform: 'none', opacity: 1}, {transform: 'translateY(-80%)', opacity: 0}], {duration: t.fast + 30, easing: 'ease-in', fill: 'forwards'});
    leave.onfinish = leave.oncancel = () => { ghost.remove(); tidy(); };
    // The new number waits a moment, so the two are never read on top of each other.
    node.animate([{transform: 'translateY(60%)', opacity: 0, color: tone}, {transform: 'none', opacity: 1, color: tone, offset: .4},
      {color: tone, offset: .68}, {color: style.color}], {duration: 640, delay: 70, easing: t.out, fill: 'backwards'});
  }
}

function playChrome(ui, root, before) {
  const t = design(), now = chrome(root);
  // The current step's pill wipes in from the side of the step before it.
  if (before.step && now.step && before.step !== now.step) {
    const pill = root.querySelector('.arenaheader .stepper .step.on');
    const back = now.stepIndex < before.stepIndex && before.stepIndex - now.stepIndex < 4;
    const closed = back ? 'inset(-12px -12px -12px 100% round 7px)' : 'inset(-12px 100% -12px -12px round 7px)';
    pill?.animate([{clipPath: closed}, {clipPath: 'inset(-12px -12px -12px -12px round 7px)'}], {duration: t.base, easing: t.out});
  }
  for (const [id, value] of now.life) {
    const was = before.life.get(id);
    if (was !== undefined && was !== value) rollLife(ui, id, was, value);
  }
  // A zone count that changed gives a small nod.
  for (const [key, value] of now.counts) {
    const was = before.counts.get(key);
    if (was === undefined || was === value) continue;
    const [id, zone] = key.split('|');
    (id === 'tab' ? root.querySelector(`.mobileviewtab[data-view="${zone}"] > :first-child`) : root.querySelector(`[data-player-id="${id}"] .zonecounter[data-z="${zone}"]`))
      ?.animate([{transform: 'scale(1)'}, {transform: 'scale(1.16)', offset: .35}, {transform: 'scale(1)'}], {duration: t.slow, easing: t.out});
  }
}

// A surface that closed leaves no hole: an empty plate of its material stands
// in its place and fades away. It carries no content and none of the
// surface's class names.
function fadePlate(ui, plate, frames) {
  const t = design(), host = layer(), z = zoomOf(ui, host);
  const node = document.createElement('div');
  node.className = 'motion-plate';
  Object.assign(node.style, {left: `${plate.x / z}px`, top: `${plate.y / z}px`, width: `${plate.w / z}px`, height: `${plate.h / z}px`,
    borderRadius: plate.radius, background: plate.background, border: plate.border, boxShadow: plate.shadow});
  host.append(node);
  const leave = node.animate(frames, {duration: t.fast + 20, easing: t.exit, fill: 'forwards'});
  leave.onfinish = leave.oncancel = () => { node.remove(); tidy(); };
}
const SINK = [{opacity: .92, transform: 'none'}, {opacity: 0, transform: 'translateY(8px) scale(.975)'}];

// A dialog that closed: its dim and its plate fade away instead of cutting.
function playClosed(ui, root, before) {
  const t = design();
  const dialogOpen = root.querySelector(':scope > .overlay, :scope > .quickmenuov');
  const stackOpen = root.querySelector(':scope > .stackpopwrap');
  for (const surface of before) {
    if (surface.overlay.isConnected || surface.overlay._dialogReplaced || surface.floating && stackOpen) continue;
    fadePlate(ui, surface.plate, SINK);
    if (surface.floating || dialogOpen) continue;
    const veil = document.createElement('div');
    veil.className = 'motion-veil';
    veil.style.background = surface.veil;
    layer().prepend(veil);
    const lift = veil.animate([{opacity: 1}, {opacity: 0}], {duration: t.base, easing: t.standard, fill: 'forwards'});
    lift.onfinish = lift.oncancel = () => { veil.remove(); tidy(); };
  }
}

// The decision panel opens over the table's edge and closes back into its
// strip. It is one node across renders; only its place changes.
function playRail(ui, root, before) {
  const t = design(), rail = root.querySelector(':scope > .ct-decision-rail');
  if (!before || !before.plate || !rail) return;
  const open = root.classList.contains('ct-expanded-decision');
  if (open === before.open) return;
  // A phone keeps the panel where it is (a tray above the hand): nothing to show.
  const r = rail.getBoundingClientRect(), was = before.plate;
  if (Math.abs(r.left - was.x) < 40 && Math.abs(r.top - was.y) < 40 && Math.abs(r.width - was.w) < 40) return;
  if (open) rail.animate([{opacity: 0, transform: 'translateX(18px)'}, {opacity: 1, transform: 'none'}], {duration: t.base + 40, easing: t.out});
  else {
    fadePlate(ui, was, [{opacity: .92, transform: 'none'}, {opacity: 0, transform: 'translateX(14px)'}]);
    rail.animate([{opacity: 0}, {opacity: 1}], {duration: t.base, easing: t.standard});
  }
}

// A count that took a card in gives a small nod, once per render.
const nodded = new WeakSet();
function nod(node) {
  if (nodded.has(node)) return;
  nodded.add(node);
  node.animate([{transform: 'scale(1)'}, {transform: 'scale(1.07)', offset: .4}, {transform: 'scale(1)'}], {duration: design().slow, easing: design().out});
}
// A picture of a card that the table shows only as part of a count.
function cardFace(ui, iid) {
  const card = ui.game.byIid?.(iid);
  if (!card || card.faceDown || !card.name || !U.cardImageURL) return null;
  const face = document.createElement('img');
  face.alt = '';
  face.src = U.cardImageURL(card.name);
  return face;
}

// A card you dragged and dropped (ui.js) continues from where you let go,
// not from the place in your hand it was picked up from.
const drops = new Map();
U.noteCardDrop = (iid, x, y) => { drops.set(String(iid), {x, y, at: performance.now()}); };

// Equal permanents are drawn as one pile, as its first card. When that card
// leaves, the next one stands for the pile in the same place: nothing arrived.
function standsIn(before, now, next) {
  const name = next.node.dataset?.cname;
  if (!name) return false;
  for (const [key, prev] of before.cards) {
    if (key[0] !== 'b' || now.has(key) || prev.node.dataset?.cname !== name) continue;
    if (Math.abs(prev.x - next.x) < 6 && Math.abs(prev.y - next.y) < 6) return true;
  }
  return false;
}

// A card that is drawn where it was not drawn before.
function arrive(ui, before, now, key, next, order) {
  const t = design(), kind = key[0], iid = Number(key.slice(1));
  const shown = shownBefore(before, kind, key.slice(1));
  const drop = drops.get(key.slice(1));
  drops.delete(key.slice(1));
  if (shown && drop && performance.now() - drop.at < 1500) shown.box = {...shown.box, x: drop.x, y: drop.y};
  for (const other of KINDS) left.delete(other + key.slice(1));
  // A card that left a battlefield is carried away by the engine's own
  // zone-move effect (ui.js showZoneMoveEffect): no second copy flies.
  const leftPlay = shown?.kind === 'b';
  if (shown && !leftPlay && onScreen(shown.box)) {
    note('fly', key, shown.kind);
    fly(ui, key, shown.box, next);
    return;
  }
  if (!onScreen(next)) return;
  // A spell that was on the Stack with nowhere to show it (a phone, where the
  // Stack is a tab) comes from that tab; any other card from its zone's mark.
  const resolved = !leftPlay && before.zones?.stack?.has(iid) ? stackTab() : null;
  const came = leftPlay || resolved ? null : zoneBefore(ui, before.zones, iid);
  const source = resolved || came && zoneBox(ui, came.player, came.zone);
  const delay = Math.min(order, 8) * 45;
  // A land that joins a count is drawn as a card on its way there.
  const face = next.shared ? cardFace(ui, iid) : null;
  if (source && (face || !next.shared) && Math.hypot(source.x - next.x, source.y - next.y) > 60) {
    // The card grows out of the mark and travels to its place.
    note('fly', key, resolved ? 'stack' : came.zone);
    if (face) fly(ui, key, {x: source.x, y: source.y, w: 22, h: 31, transform: 'none'}, {...next, w: 36, h: 50}, {delay, appear: true, face});
    else fly(ui, key, {x: source.x, y: source.y, w: next.w * .36, h: next.h * .36, transform: 'none', node: next.node}, next, {delay, appear: true});
    return;
  }
  // The Stack's own window and the dock present their cards themselves.
  if (kind === 's' || kind === 'c') return;
  if (kind === 'b' && !next.shared && standsIn(before, now, next)) return;
  note('set', key);
  if (next.shared) { nod(next.node); return; }
  // Set down in place: a card rises into your hand, a permanent lands on the
  // table. A card returned from play waits for the copy that carries it.
  const wait = leftPlay ? 260 : 0;
  const own = next.transform === 'none' ? '' : next.transform;
  const frames = kind === 'h'
    ? [{transform: `translateY(22px) scale(.94) ${own}`.trim(), opacity: 0}, {opacity: next.opacity, offset: .6}, {transform: own || 'none', opacity: next.opacity}]
    : [{transform: `translateY(-12px) scale(1.14) ${own}`.trim(), opacity: 0}, {opacity: next.opacity, offset: .4},
      {transform: `scale(.985) ${own}`.trim(), offset: .78}, {transform: own || 'none', opacity: next.opacity}];
  next.node.animate(frames, {duration: kind === 'h' ? t.slow - 60 : t.slow - 20, delay: delay + wait, easing: t.out, fill: 'backwards'});
}

// A card that is drawn where it was drawn before, in another place or pose.
function settle(ui, key, prev, next, z, count) {
  const t = design();
  const from = matrix(prev.transform), to = matrix(next.transform);
  // The card's own place, without what its transform adds (a hover lift).
  const homeX = next.x - (to ? to.e * z : 0), homeY = next.y - (to ? to.f * z : 0);
  const dx = (prev.x - homeX) / z, dy = (prev.y - homeY) / z;
  const sx = prev.w / next.w, sy = prev.h / next.h;
  const turned = !sameLinear(from, to), resized = Math.abs(sx - 1) > .01 || Math.abs(sy - 1) > .01;
  const shifted = Math.hypot(dx - (to ? to.e : 0), dy - (to ? to.f : 0)) > 1;
  const faded = Math.abs(prev.opacity - next.opacity) > .02;
  if (!turned && !resized && !shifted && !faded) return false;
  if (!onScreen(prev) && !onScreen(next)) return false;
  const own = next.transform === 'none' ? '' : next.transform;
  // A turn in place is a tap: short, with a little weight at the end.
  const tap = turned && !shifted && !resized;
  next.node.animate([
    {transform: `translate(${dx}px, ${dy}px) ${linear(from)}${resized ? ` scale(${sx}, ${sy})` : ''}`.trim(), opacity: prev.opacity},
    {transform: own || 'none', opacity: next.opacity},
  ], {duration: tap ? t.base + 40 : Math.round(Math.min(t.flight, Math.max(t.base, t.fast + Math.hypot(dx, dy) * .5))), easing: tap ? t.spring : t.out});
  if (count <= 12) note(tap ? 'turn' : 'move', key);
  return true;
}

// Another view, board or focus: the boards now shown come up softly instead
// of cutting in. Their contents fade, not the lanes themselves: a transparent
// lane would show the playmat behind it, a bright flash between two dark
// views. Opacity only, so nothing is measured in a place it will not keep.
function showBoards(root) {
  const t = design();
  for (const lane of root.querySelectorAll('.opprow, .myboard')) {
    if (!lane.getClientRects().length) continue;
    for (const part of lane.children) part.animate([{opacity: 0}, {opacity: 1}], {duration: t.fast + 40, easing: t.standard});
  }
}

// Called by the render after the arena is committed and the lanes are fitted.
P.playMotion = function (root) {
  const before = this._motion;
  this._motion = null;
  if (!before || !root || still(this) || before.game !== this.game) { left.clear(); return; }
  guarded(this, () => play(this, root, before));
};
function play(ui, root, before) {
  playChrome(ui, root, before.chrome);
  playRail(ui, root, before.chrome.rail);
  playClosed(ui, root, before.surfaces);
  const now = snapshot(root), clock = performance.now();
  // Keep a card hidden while its flight from an earlier render is in the air.
  for (const [key, entry] of flights) {
    const box = now.get(key);
    if (box && !entry.shared) hideUntilLanding(box.node, entry, box.opacity);
  }
  for (const [key, entry] of left) if (clock - entry.at > LEFT_FOR) left.delete(key);
  if (before.layout !== layoutKey(ui, root)) { left.clear(); showBoards(root); return; }
  const z = zoomOf(ui, root), settled = new Set();
  let arrivals = 0, moved = 0;
  for (const [key, next] of now) {
    if (flights.has(key)) continue;
    const prev = before.cards.get(key);
    if (!prev) arrive(ui, before, now, key, next, arrivals++);
    else if (key[0] === 'b' || key[0] === 'h') {
      // A count is one node for several lands: it moves once.
      if (next.shared) { if (settled.has(next.node)) continue; settled.add(next.node); }
      if (moved < 90 && settle(ui, key, prev, next, z, moved + 1)) moved++;
    }
    // The Stack's rows and the dock are not cards on the table: they keep
    // still. A spell that comes forward for your response (from its thumbnail
    // to the review's art) or goes back is the same card: it travels.
    else if (key[0] === 's' && (prev.w / next.w < .6 || prev.w / next.w > 1.6) && onScreen(prev) && onScreen(next)) settle(ui, key, prev, next, z, 99);
  }
  // What is shown nowhere any more is remembered for its next appearance.
  const tab = stackTab();
  for (const [key, prev] of before.cards) {
    if (now.has(key) || prev.shared || !onScreen(prev) || KINDS.some(kind => now.has(kind + key.slice(1)))) continue;
    // Your card went on the Stack and a phone shows the Stack as a tab: the
    // card flies into the tab.
    if (key[0] === 'h' && tab && ui.game.stack?.some(spell => spell.card && String(spell.card.iid) === key.slice(1))) {
      note('away', key, 'stack');
      flyAway(ui, prev, tab);
      continue;
    }
    left.set(key, {box: prev, at: clock});
  }
  // A spell that left the Stack for its owner's graveyard or exile flies to
  // that counter. A permanent spell is met on the table instead (arrive).
  for (const [key, entry] of left) {
    if (key[0] !== 's') continue;
    const card = ui.game.byIid?.(Number(key.slice(1)));
    if (!card || card.zone !== 'graveyard' && card.zone !== 'exile' || !card.owner) continue;
    left.delete(key);
    const target = zoneBox(ui, card.owner, card.zone);
    if (!target) continue;
    note('away', key, card.zone);
    flyAway(ui, entry.box, target);
  }
}

// Tests and tools: what is in the air.
U.motionState = () => ({flights: flights.size, remembered: left.size, layer: !!document.querySelector('#game > .motionlayer')});
function clear() { document.querySelector('#game > .motionlayer')?.remove(); flights.clear(); left.clear(); drops.clear(); }
document.addEventListener('visibilitychange', clear);
window.addEventListener('resize', clear);
reduce.addEventListener?.('change', clear);
})();
