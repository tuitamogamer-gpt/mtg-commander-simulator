// Short, non-blocking accents for committed attacks, blocks, the clash before
// combat damage and spells entering the Stack.
// Timelines animate disposable decoration, never the live controls or engine state.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
let active = null;
let currentUI = null;
const history = new WeakMap();
const node = (cls, parent) => {
  const el = document.createElement('div'); el.className = cls; parent?.append(el); return el;
};
const suppressed = ui => !ui.game || ui.game.gameOver || ui.game._simulation || ui.accountReplay ||
  ui.reducedMotion || motion.matches || document.hidden || document.body.classList.contains('reduced-motion') ||
  !document.body.classList.contains('game-active');
const clear = () => {
  if (!active) return;
  const state = active; active = null;
  for (const effect of [...state.effects]) effect.remove();
  for (const frame of state.frames) cancelAnimationFrame(frame);
  state.layer.remove();
};
const prune = () => { if (active && (active.game !== active.ui.game || suppressed(active.ui))) clear(); };
new MutationObserver(prune).observe(document.body, {attributes: true, attributeFilter: ['class']});
document.addEventListener('visibilitychange', clear);
window.addEventListener('resize', clear);
// Fixed effects should not linger at obsolete positions when a lane scrolls.
window.addEventListener('scroll', clear, true);
motion.addEventListener('change', clear);
const visible = el => {
  if (!el || el.closest('[hidden], [inert], [aria-hidden="true"]')) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return null;
  // A card inside a scroller may have a rectangle but be completely clipped.
  const x = Math.max(1, Math.min(innerWidth - 1, r.x + r.width / 2));
  const y = Math.max(1, Math.min(innerHeight - 1, r.y + r.height / 2));
  const top = document.elementFromPoint(x, y);
  return top && (el.contains(top) || top.contains(el)) ? r : null;
};
const rect = selectors => {
  for (const el of document.querySelectorAll(selectors)) { const r = visible(el); if (r) return r; }
  return null;
};
const playerRect = (ui, player) => {
  if (!player) return null;
  return rect(player === ui.me ? '.ct-player-head, .mobileviewtab[data-view="mine"]'
    : `.ct-seat[data-focus-player="${player.idx}"], .opprow[data-player-id="${player.idx}"] .opphead`);
};
const cardRect = card => card?.iid == null ? null : rect(`.mini[data-iid="${card.iid}"], .ct-mobile-combat-card[data-iid="${card.iid}"], .hcard[data-iid="${card.iid}"]`);
const center = (r, z) => r && ({x: (r.x + r.width / 2) / z, y: (r.y + r.height / 2) / z});
const timeline = (effect, el, keyframes, duration, delay = 0, easing = 'cubic-bezier(.22,.61,.36,1)') => {
  const animation = el.animate(keyframes, {duration, delay, easing, fill: 'both'});
  effect.animations.push(animation);
};
const ring = (effect, point, kind, delay) => {
  const anchor = node(`actionfx-ring ${kind}`, effect.element);
  anchor.style.left = `${point.x}px`; anchor.style.top = `${point.y}px`;
  const disc = node('actionfx-disc', anchor);
  timeline(effect, disc, [{opacity: 0, transform: 'scale(.45) rotate(-25deg)'},
    {opacity: .8, offset: .2}, {opacity: 0, transform: 'scale(1.35) rotate(35deg)'}], 560, delay);
};
// Two crossed blades and a flash where an attacker and its blocker meet.
const clash = (effect, point, delay) => {
  const anchor = node('actionfx-collision', effect.element);
  anchor.style.left = `${point.x}px`; anchor.style.top = `${point.y}px`;
  for (const turn of [45, -45]) {
    const blade = node('actionfx-blade', anchor);
    timeline(effect, blade, [{opacity: 0, transform: `rotate(${turn}deg) scaleX(.2)`},
      {opacity: 1, transform: `rotate(${turn}deg) scaleX(1.15)`, offset: .3},
      {opacity: 0, transform: `rotate(${turn}deg) scaleX(.9)`}], 620, delay);
  }
  const flash = node('actionfx-flash', anchor);
  timeline(effect, flash, [{opacity: 0, transform: 'scale(.3)'}, {opacity: .9, transform: 'scale(1)', offset: .25},
    {opacity: 0, transform: 'scale(1.6)'}], 620, delay + 60);
};
// A glowing frame drawn over a fighting creature (layer-owned, so renders
// that replace the card underneath cannot cut it short).
const frame = (effect, r, z, kind, delay) => {
  if (!r) return;
  const box = node(`actionfx-frame ${kind}`, effect.element);
  Object.assign(box.style, {left: `${r.x / z}px`, top: `${r.y / z}px`, width: `${r.width / z}px`, height: `${r.height / z}px`});
  timeline(effect, box, [{opacity: 0, transform: 'scale(.92)'}, {opacity: 1, transform: 'scale(1.05)', offset: .25},
    {opacity: .9, transform: 'scale(1.02)', offset: .75}, {opacity: 0, transform: 'scale(1)'}], 980, delay);
};
const banner = (effect, point, icon, title, detail) => {
  const copy = node('actionfx-banner', effect.element);
  copy.style.left = `${point.x}px`; copy.style.top = `${point.y}px`;
  copy.innerHTML = `${U.icon(icon)}<span><b></b><small></small></span>`;
  copy.querySelector('b').textContent = title; copy.querySelector('small').textContent = detail;
  timeline(effect, copy, [{opacity: 0, transform: 'translate(-50%, -50%) scale(.9)'},
    {opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .16}, {opacity: 1, offset: .8},
    {opacity: 0, transform: 'translate(-50%, -50%) scale(1.03)'}], 1040, 20);
};
const route = (effect, start, end, delay) => {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (length < 12) return;
  const line = node('actionfx-route', effect.element);
  Object.assign(line.style, {left: `${start.x}px`, top: `${start.y}px`, width: `${length}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)`});
  const trace = node('actionfx-trace', line), spark = node('actionfx-spark', line);
  timeline(effect, trace, [{opacity: 0, transform: 'scaleX(0)'}, {opacity: .65, offset: .35, transform: 'scaleX(1)'},
    {opacity: 0, transform: 'scaleX(1)'}], 490, delay);
  timeline(effect, spark, [{opacity: 0, transform: 'translateX(0) scaleX(.5)'}, {opacity: 1, offset: .15},
    {opacity: 0, transform: `translateX(${Math.max(0, length - 18)}px) scaleX(1.5)`}], 360, delay + 45, 'cubic-bezier(.65,0,.35,1)');
};
const label = (effect, point, title, detail, width, height) => {
  const copy = node('actionfx-label', effect.element);
  copy.style.left = `${Math.max(94, Math.min(width - 94, point.x))}px`;
  const preferredY = point.y > height - 140 ? point.y - 80 : point.y + 40;
  copy.style.top = `${Math.max(24, Math.min(height - 60, preferredY))}px`;
  const strong = document.createElement('b'); strong.textContent = title;
  const small = document.createElement('span'); small.textContent = detail;
  copy.append(strong, small);
  timeline(effect, copy, [{opacity: 0, transform: 'translate(-50%, 6px)'},
    {opacity: 1, transform: 'translate(-50%, 0)', offset: .2}, {opacity: 1, offset: .7},
    {opacity: 0, transform: 'translate(-50%, -5px)'}], 760, 80);
};
function paint(state, event, kind) {
  if (active !== state || state.game !== state.ui.game || suppressed(state.ui)) { prune(); return; }
  const ui = state.ui, z = ui.viewportZoom(state.layer), width = innerWidth / z, height = innerHeight / z;
  if (state.effects.size >= 6) state.effects.values().next().value.remove();
  const element = node(`actionfx-${kind}`, state.layer);
  const effect = {element, animations: [], timer: null, remove() {
    clearTimeout(this.timer); this.animations.forEach(animation => animation.cancel()); this.element.remove(); state.effects.delete(this);
    if (!state.effects.size && !state.frames.size) { state.layer.remove(); if (active === state) active = null; }
  }};
  state.effects.add(effect);
  const player = event.player || event.card?.ctrl;
  if (kind === 'attack') {
    let drawn = 0;
    for (const {card, target} of (event.attacks || []).slice(0, 8)) {
      const start = center(cardRect(card) || playerRect(ui, player), z);
      const end = center(cardRect(target) || playerRect(ui, target?.idx != null ? target : target?.protector || target?.ctrl), z);
      if (!start || !end) continue;
      const delay = drawn++ * 26;
      ring(effect, start, 'commit', delay); route(effect, start, end, delay);
    }
    const origin = center(playerRect(ui, player), z);
    if (origin) label(effect, origin, `${event.count} ATTACKERS`, 'Attack declared', width, height);
  } else if (kind === 'block') {
    // Each blocker raises a guard and meets its attacker.
    let drawn = 0;
    for (const {card, target} of (event.blocks || []).slice(0, 8)) {
      const blockerRect = cardRect(card), attackerRect = cardRect(target);
      const start = center(blockerRect, z), end = center(attackerRect, z);
      if (!start || !end) continue;
      const delay = Math.min(drawn++, 6) * 40;
      frame(effect, blockerRect, z, 'blocker', delay); frame(effect, attackerRect, z, 'attacker', delay + 200);
      ring(effect, start, 'guard', delay); route(effect, start, end, delay); ring(effect, end, 'meet', delay + 260);
    }
    const blocker = event.blocks?.[0]?.card;
    const origin = center(cardRect(blocker) || playerRect(ui, blocker?.ctrl), z);
    const n = event.blocks?.length || 0;
    if (origin) label(effect, origin, `${n} BLOCKER${n === 1 ? '' : 'S'}`, 'Blocks declared', width, height);
  } else if (kind === 'clash') {
    // The moment before simultaneous combat damage: every fight is framed and
    // marked between its creatures, every unblocked attacker gathers itself.
    let blocked = 0, open = 0, drawn = 0;
    for (const {card, targets = [], target} of (event.pairs || []).slice(0, 10)) {
      const attackerRect = cardRect(card), attacker = center(attackerRect, z);
      const delay = Math.min(drawn++, 6) * 50;
      frame(effect, attackerRect, z, 'attacker', delay);
      if (!targets.length) {
        open++;
        const defender = center(cardRect(target) || playerRect(ui, target?.idx != null ? target : target?.ctrl), z);
        if (attacker) ring(effect, attacker, 'commit', delay);
        if (attacker && defender) route(effect, attacker, defender, delay + 120);
        continue;
      }
      blocked++;
      for (const blocker of targets.slice(0, 3)) {
        const guardRect = cardRect(blocker), guard = center(guardRect, z);
        frame(effect, guardRect, z, 'blocker', delay + 40);
        if (!attacker || !guard) continue;
        clash(effect, {x: (attacker.x + guard.x) / 2, y: (attacker.y + guard.y) / 2}, delay + 80);
        route(effect, attacker, guard, delay);
      }
    }
    const step = event.combatStep === 'first' ? 'FIRST STRIKE' : 'COMBAT DAMAGE';
    const detail = [blocked && `${blocked} blocked`, open && `${open} unblocked`].filter(Boolean).join(' · ') || 'Damage is dealt';
    banner(effect, {x: width / 2, y: height * .45}, event.combatStep === 'first' ? 'first-strike' : 'attack', step, detail);
  } else {
    const start = center(cardRect(event.card) || playerRect(ui, player), z);
    // Review/Stack surfaces can be absent on a phone: its Stack tab is the
    // destination. Never move to a guessed target or announce spell success.
    const end = center(rect('.actionstageart, .stackpop:not(.reveal), .center .stackitem, .mobileviewtab[data-view="stack"], .ct-decision-heading'), z)
      || {x: width * .5, y: Math.max(80, height * .45)};
    if (start) route(effect, start, end, 0);
    ring(effect, end, 'spell', 140); ring(effect, end, 'echo', 230);
    label(effect, end, 'INSTANT CAST', event.name || event.card?.name || 'Instant spell', width, height);
  }
  effect.timer = setTimeout(() => effect.remove(), kind === 'clash' || kind === 'block' ? 1180 : 960);
}
U.UI.prototype.showActionEffect = function(event, {replay = false} = {}) {
  prune();
  if (replay || suppressed(this) || currentUI && currentUI !== this || !event) return;
  const kind = event.type === 'combat' && event.kind === 'attackersDeclared' && event.count > 0 ? 'attack'
    : event.type === 'combat' && event.kind === 'blockersDeclared' && event.blocks?.length ? 'block'
    : event.type === 'gameEffect' && event.kind === 'combatClash' && event.pairs?.length ? 'clash'
    : event.type === 'cardPlayed' && event.kind === 'spell' && event.spellTypes?.includes('Instant') &&
      event.card && !event.card.faceDown && !event.card.hidden ? 'instant' : null;
  if (!kind) return;
  if (history.get(this)?.game !== this.game) history.set(this, {game: this.game, seen: new WeakSet()});
  const seen = history.get(this).seen;
  if (seen.has(event)) return;
  if (active && (active.ui !== this || active.game !== this.game)) clear();
  if (!active) {
    const layer = node('actionfx-layer', document.body);
    layer.setAttribute('aria-hidden', 'true'); layer.inert = true;
    active = {ui: this, game: this.game, layer, effects: new Set(), frames: new Set()};
  }
  const state = active;
  if (state.frames.size >= 6) return;
  seen.add(event);
  // Wait for the event's ordinary arena render before measuring destinations.
  const schedule = callback => {
    const id = requestAnimationFrame(() => { state.frames.delete(id); callback(); }); state.frames.add(id);
  };
  schedule(() => { if (active === state) schedule(() => paint(state, event, kind)); });
};
// A new game can replace the UI without another event arriving. Clear old
// decorations at that render, and also when preferences change mid-effect.
const render = U.UI.prototype.render;
U.UI.prototype.render = function(...args) {
  if (active && (active.ui !== this || active.game !== this.game || suppressed(this))) clear();
  currentUI = this;
  return render.apply(this, args);
};
})();
