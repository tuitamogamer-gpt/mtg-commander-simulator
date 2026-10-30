// Card effects beside their cards. A routine resolution recap and the short
// activity notices sit next to the permanent (or board) they changed instead
// of a fixed corner. Presentation only: decisions, focus and rules state are
// untouched, and phones keep their original sheets and notice stack.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const desktop = window.matchMedia('(min-width: 901px)');
const GAP = 16, MARGIN = 12, NOTICE_MS = 4200;
const node = (tag, cls) => { const el = document.createElement(tag); el.className = cls; return el; };

// A card counts as visible only where it is actually painted: inside the
// viewport and not clipped by its lane. Covering layers are ignored while
// measuring (the recap overlay itself covers the whole table).
function cardRect(iid, ignore) {
  const el = iid == null ? null : document.querySelector(`#game .mini[data-iid="${iid}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null;
  const restore = ignore?.style.pointerEvents;
  if (ignore) ignore.style.pointerEvents = 'none';
  const hit = document.elementFromPoint(Math.max(1, Math.min(innerWidth - 1, r.x + r.width / 2)),
    Math.max(1, Math.min(innerHeight - 1, r.y + r.height / 2)));
  if (ignore) ignore.style.pointerEvents = restore;
  return hit && (el.contains(hit) || hit.contains(el)) ? r : null;
}
const scaled = (r, z) => r && {left: r.left / z, top: r.top / z, right: r.right / z, bottom: r.bottom / z, width: r.width / z, height: r.height / z};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Beside the card when it fits (right, then left), otherwise above/below it.
function besideCard(r, w, h, vw, vh) {
  if (r.right + GAP + w <= vw - MARGIN) return {left: r.right + GAP, top: r.top + r.height / 2 - h / 2, side: 'right'};
  if (r.left - GAP - w >= MARGIN) return {left: r.left - GAP - w, top: r.top + r.height / 2 - h / 2, side: 'left'};
  const left = r.left + r.width / 2 - w / 2;
  return r.top > vh / 2 ? {left, top: r.top - GAP - h, side: 'above'} : {left, top: r.bottom + GAP, side: 'below'};
}

function placeLine(line, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy);
  line.hidden = length < 6;
  Object.assign(line.style, {left: `${from.x}px`, top: `${from.y}px`, width: `${length}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)`});
}
function link(parent, from, to) {
  let line = parent.querySelector(':scope > .effectanchorlink');
  if (!line) { line = node('div', 'effectanchorlink'); line.setAttribute('aria-hidden', 'true'); parent.prepend(line); }
  placeLine(line, from, to);
}

U.UI.prototype.placeAnchoredRecap = function () {
  const overlay = document.querySelector('#game .overlay.resolutionrecapoverlay.recapminor');
  const modal = overlay?.querySelector('.modal.resolutionrecap');
  if (!overlay || !modal) return;
  const reset = () => {
    overlay.classList.remove('effectanchored');
    modal.style.removeProperty('left'); modal.style.removeProperty('top'); delete modal.dataset.anchorSide;
    overlay.querySelectorAll(':scope > .effectanchorring, :scope > .effectanchorlink').forEach(el => el.remove());
  };
  if (!desktop.matches || !('anchorIids' in modal.dataset || 'anchorPlayer' in modal.dataset)) { reset(); return; }
  const z = this.viewportZoom(overlay), vw = innerWidth / z, vh = innerHeight / z;
  let card = null;
  for (const iid of (modal.dataset.anchorIids || '').split(',').filter(Boolean)) if ((card = cardRect(iid, overlay))) break;
  let board = null;
  if (!card && modal.dataset.anchorPlayer != null) {
    const idx = modal.dataset.anchorPlayer;
    const el = this.me && String(this.me.idx) === idx ? document.querySelector('#game .myboard')
      : document.querySelector(`#game .opprow[data-player-id="${idx}"]`);
    const r = el?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) board = r;
  }
  if (!card && !board) { reset(); return; }
  overlay.classList.add('effectanchored');
  const w = modal.offsetWidth, h = modal.offsetHeight;
  let place;
  if (card) place = besideCard(scaled(card, z), w, h, vw, vh);
  else {
    // The player's own board: the panel sits inside it, under its heading.
    const r = scaled(board, z);
    place = {left: r.right - w - MARGIN, top: r.top + 52, side: 'board'};
  }
  // Keep the turn tracker and menu in view above the panel.
  const header = document.querySelector('#game .arenaheader')?.getBoundingClientRect();
  const minTop = Math.max(MARGIN, header && header.height ? header.bottom / z + 6 : MARGIN);
  const left = clamp(place.left, MARGIN, vw - MARGIN - w), top = clamp(place.top, minTop, Math.max(minTop, vh - MARGIN - h));
  modal.style.left = `${left}px`; modal.style.top = `${top}px`;
  modal.dataset.anchorSide = place.side;
  let ring = overlay.querySelector(':scope > .effectanchorring');
  if (!card) { ring?.remove(); overlay.querySelector(':scope > .effectanchorlink')?.remove(); return; }
  const r = scaled(card, z);
  if (!ring) { ring = node('div', 'effectanchorring'); ring.setAttribute('aria-hidden', 'true'); overlay.prepend(ring); }
  Object.assign(ring.style, {left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`});
  // Connect the card edge to the nearest point of the panel.
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const px = clamp(cx, left, left + w), py = clamp(cy, top, top + h);
  const from = {x: clamp(px, r.left - 4, r.right + 4), y: clamp(py, r.top - 4, r.bottom + 4)};
  link(overlay, from, {x: px, y: py});
};

// The decision rail stays put (a stable surface), but an opponent's object on
// the Stack points at its source on the table: the permanent of an ability or
// trigger, else its caster's board heading, is outlined and linked to the
// rail. Your own objects and target choices draw nothing.
U.UI.prototype.placeAnchoredStackReview = function () {
  const root = document.querySelector('#game.command-table');
  const rail = root?.querySelector(':scope > .ct-decision-rail');
  root?.querySelectorAll(':scope > .stackanchor').forEach(el => el.remove());
  const so = this.game?.stack?.at(-1);
  const ctrl = so?.ctrl, mine = !ctrl || ctrl === this.me || ctrl.idx === this.me?.idx;
  if (!rail || !desktop.matches || !so || mine || !root.classList.contains('ct-expanded-decision') ||
    !rail.classList.contains('has-stack') || rail.classList.contains('has-targets')) return;
  const source = so.kind === 'spell' ? null : so.srcCard || so.card;
  const card = source && !source.faceDown ? cardRect(source.iid, rail) : null;
  const head = !card ? root.querySelector(`:scope .opprow[data-player-id="${ctrl.idx}"] .opphead`)?.getBoundingClientRect() : null;
  const target = card || (head && head.width > 0 ? head : null);
  if (!target) return;
  const parent = rail.offsetParent || root, origin = parent.getBoundingClientRect(), z = this.viewportZoom(root);
  const local = r => ({left: (r.left - origin.left) / z, top: (r.top - origin.top) / z, right: (r.right - origin.left) / z,
    bottom: (r.bottom - origin.top) / z, width: r.width / z, height: r.height / z});
  const r = local(target), panel = local(rail.getBoundingClientRect());
  const outline = node('div', 'effectanchorring stackanchor'); outline.setAttribute('aria-hidden', 'true');
  Object.assign(outline.style, {left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px`});
  root.append(outline);
  // Nothing to link when the outline sits under the rail itself.
  if (r.right + 4 >= panel.left && r.left - 4 <= panel.right && r.bottom + 4 >= panel.top && r.top - 4 <= panel.bottom) return;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const px = clamp(cx, panel.left, panel.right), py = clamp(cy, panel.top + 24, panel.bottom - 24);
  const from = {x: clamp(px, r.left - 4, r.right + 4), y: clamp(py, r.top - 4, r.bottom + 4)};
  // A distant source keeps only its outline; a line across the table is noise.
  if (Math.hypot(px - from.x, py - from.y) > 420) return;
  const line = node('div', 'effectanchorlink stackanchor'); line.setAttribute('aria-hidden', 'true');
  root.append(line);
  placeLine(line, from, {x: px, y: py});
};

// Short activity notices with a public card on the table appear as a callout
// beside that card; others keep the corner stack.
const showEffectNotice = U.UI.prototype.showEffectNotice;
U.UI.prototype.showEffectNotice = function (text, kind, event = {}) {
  const card = event?.card;
  const r = text && kind !== 'spellCopy' && desktop.matches && card && !card.faceDown && !document.querySelector('#game .overlay')
    ? cardRect(card.iid) : null;
  if (!r) return showEffectNotice.call(this, text, kind, event);
  let layer = document.querySelector('.effectcalloutlayer');
  if (!layer) { layer = node('div', 'effectcalloutlayer'); layer.setAttribute('aria-hidden', 'true'); document.body.append(layer); }
  layer.querySelector(`.effectcallout[data-iid="${card.iid}"]`)?.remove();
  while (layer.children.length >= 3) layer.firstElementChild.remove();
  const callout = node('div', `effectcallout ${kind || 'effect'}`);
  callout.dataset.iid = String(card.iid);
  const label = node('small', ''), copy = node('span', '');
  label.textContent = 'EFFECT'; copy.textContent = text;
  callout.append(label, copy);
  layer.append(callout);
  const z = this.viewportZoom(layer), vw = innerWidth / z, vh = innerHeight / z;
  const w = callout.offsetWidth, h = callout.offsetHeight;
  const place = besideCard(scaled(r, z), w, h, vw, vh);
  let top = clamp(place.top, MARGIN, vh - MARGIN - h);
  const left = clamp(place.left, MARGIN, vw - MARGIN - w);
  // Several notices for neighbouring cards stack instead of overlapping.
  for (const other of layer.querySelectorAll('.effectcallout')) {
    if (other === callout) continue;
    const o = {left: parseFloat(other.style.left), top: parseFloat(other.style.top), w: other.offsetWidth, h: other.offsetHeight};
    if (left < o.left + o.w && o.left < left + w && top < o.top + o.h && o.top < top + h) top = clamp(o.top + o.h + 6, MARGIN, vh - MARGIN - h);
  }
  callout.style.left = `${left}px`; callout.style.top = `${top}px`;
  callout.dataset.side = place.side;
  setTimeout(() => {
    callout.classList.add('leaving');
    setTimeout(() => { callout.remove(); if (!layer.children.length) layer.remove(); }, 220);
  }, NOTICE_MS);
};

// Re-place after every arena render: the table may reflow under a retained recap.
const render = U.UI.prototype.render;
U.UI.prototype.render = function (...args) {
  const result = render.apply(this, args);
  if (document.querySelector('#game .overlay.resolutionrecapoverlay.recapminor')) {
    this.placeAnchoredRecap();
    requestAnimationFrame(() => this.placeAnchoredRecap());
  } else if (!document.body.classList.contains('game-active')) document.querySelector('.effectcalloutlayer')?.remove();
  if (document.querySelector('#game.command-table > .ct-decision-rail')) {
    this.placeAnchoredStackReview();
    requestAnimationFrame(() => { if (this === window._ui || !window._ui) this.placeAnchoredStackReview(); });
  }
  return result;
};
window.addEventListener('resize', () => { window._ui?.placeAnchoredRecap?.(); window._ui?.placeAnchoredStackReview?.(); });
})();
