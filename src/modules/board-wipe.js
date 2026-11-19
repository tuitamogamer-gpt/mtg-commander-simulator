// A board wipe, staged on the table. Three or more permanents leaving at once
// used to be one second of everything at the same time, under the highlight
// that followed it. Now the engine waits (engine.js stageBoardWipe) and the
// table plays three beats on the cards themselves:
//   1. build-up: what is happening, who did it, and a frame on every doomed card;
//   2. impact;
//   3. the cards go one after another, board by board, each with the hit of
//      its kind (the blade, the closing ring, the rising streak of a single
//      removal), while the plate counts them and each board shows its loss.
// The cards are still on the battlefield while this plays, so nothing is
// cloned: the real cards are marked and fade where they stand, and they leave
// the table together when the engine moves them. Decoration only: no control
// is covered for a click, and no rule or decision reads any of it.
//
// When each card goes is an animation delay from the impact, not a timer per
// card: a busy frame (the arena renders in the middle of this) cannot bunch
// several cards together, and a late one shows each card where it should be
// by then. Script only keeps the words in step: the count, the pips and each
// board's loss follow the same clock.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const P = U.UI.prototype;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const phone = window.matchMedia('(max-width: 900px)');
const say = text => U.uiText ? U.uiText(String(text)) : String(text);
const node = (tag, cls, parent, text) => {
  const el = document.createElement(tag); el.className = cls;
  if (text != null) el.textContent = say(text);
  parent?.append(el); return el;
};
// kicker: what the table calls it; done: what happened to the cards;
// hit: which of the three hits of a removal each card takes.
const KINDS = {
  destroy: {kicker: 'Board wipe', done: 'destroyed', hit: 'cut'},
  wither: {kicker: 'Board wipe', done: 'died', hit: 'cut'},
  damage: {kicker: 'Damage storm', done: 'destroyed', hit: 'cut'},
  exile: {kicker: 'Void sweep', done: 'exiled', hit: 'void'},
  bounce: {kicker: 'Mass return', done: 'returned to hand', hit: 'lift'},
};
const HITS = ['wipe-cut', 'wipe-void', 'wipe-lift'];
const MAX_PIPS = 24;
let active = null;
// The clock the animations run on: a frame's time, the same for everything
// drawn in it. A busy page reaches a frame late; the script's own clock would
// then count cards that the table has not shown going yet.
const clock = () => document.timeline?.currentTime ?? performance.now();

const calm = ui => ui.reducedMotion || reduced.matches || document.body.classList.contains('reduced-motion');
const isCreature = card => typeof card.is === 'function' ? card.is('Creature') : (card.types || []).includes('Creature');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pictures = (ui, card) => card?.iid == null ? [] :
  [...document.querySelectorAll(`.mini[data-iid="${card.iid}"], .ct-mobile-combat-card[data-iid="${card.iid}"]`)].map(el => ui.gameEffectCardArt(el));
const anchor = (ui, unit) => unit.cards.map(card => ui.gameEffectCardArt(ui.gameEffectCardAnchor(card))).find(Boolean) || null;

// Ends the effect at once and gives every card back its ordinary look. A
// card that is still on the battlefield (a replaced move) is shown again.
function finish() {
  const state = active;
  if (!state) return;
  active = null;
  for (const timer of state.timers) clearTimeout(timer);
  cancelAnimationFrame(state.frame);
  document.querySelectorAll('.wipe-doomed, .wipe-dead').forEach(card => {
    card.classList.remove('wipe-doomed', 'wipe-dead', ...HITS);
    card.style.removeProperty('--wipe-since'); card.style.removeProperty('--wipe-death');
  });
  document.querySelector('#game')?.classList.remove('fx-boardwipe-camera');
  state.root.remove();
  if (state.layer && !state.layer.children.length) state.layer.remove();
}
const later = (state, fn, ms) => {
  const timer = setTimeout(() => { if (active === state) fn(); }, Math.max(0, ms));
  state.timers.push(timer);
};

// The doomed cards as the table shows them: one unit per card in view (a pile
// of equal permanents is one picture and one unit), in the order they will
// go: board by board, row by row, left to right. Cards that are not in view
// (another phone view, a board that is not shown) follow as one silent unit
// per player, so the count and each player's loss stay true.
function unitsOf(ui, cards) {
  const seen = new Map(), units = [], unseen = [];
  for (const card of cards) {
    const el = ui.gameEffectCardArt(ui.gameEffectCardAnchor(card));
    if (!el) { unseen.push(card); continue; }
    let unit = seen.get(el);
    if (!unit) {
      const r = el.getBoundingClientRect(), board = el.closest('.opprow, .myboard, .ct-mobile-combat-pane') || el.parentElement;
      const b = board.getBoundingClientRect();
      unit = {cards: [], player: card.ctrl, shown: true, stacked: el.classList.contains('stacked'),
        order: [Math.round(b.top), Math.round(b.left), Math.round(r.top / Math.max(1, r.height * .6)), Math.round(r.left)]};
      seen.set(el, unit); units.push(unit);
    }
    unit.cards.push(card);
  }
  units.sort((a, b) => { for (let i = 0; i < 4; i++) if (a.order[i] !== b.order[i]) return a.order[i] - b.order[i]; return 0; });
  for (const card of unseen) {
    // A pile shows its first card; the others have no picture of their own.
    const pile = units.find(unit => unit.shown && unit.stacked && unit.player === card.ctrl && unit.cards[0].name === card.name);
    if (pile) { pile.cards.push(card); continue; }
    let unit = units.find(item => !item.shown && item.player === card.ctrl);
    if (!unit) units.push(unit = {cards: [], player: card.ctrl, shown: false});
    unit.cards.push(card);
  }
  return units;
}

function plate(state, event, ui) {
  const kind = KINDS[state.mode];
  state.noun = state.cards.every(isCreature) ? 'creature' : 'permanent';
  const el = node('div', `wipefx-plate${state.staged && !state.calm && !phone.matches ? ' stage' : ''}`, state.root);
  const source = event.src || event.source;
  if (source && !source.faceDown && source.name && U.cardArtHTML) node('span', 'wipefx-art', el).innerHTML = U.cardArtHTML(source);
  const copy = node('span', 'wipefx-copy', el);
  const who = event.player ? event.player === ui.me ? 'You' : event.player.name : '';
  // With a name: what it is, by whom, then the name. Without one, the kind is the title.
  node('small', 'wipefx-kicker', copy, event.name ? [kind.kicker, who].filter(Boolean).join(' · ') : who || 'The whole table');
  node('b', 'wipefx-name', copy, event.name || kind.kicker);
  state.line = node('span', 'wipefx-line', copy);
  state.pips = node('span', 'wipefx-pips', copy);
  if (state.count <= MAX_PIPS) for (let i = 0; i < state.count; i++) node('i', '', state.pips);
  else { state.pips.classList.add('bar'); state.bar = node('i', '', state.pips); }
  state.losses = node('span', 'wipefx-losses', copy);
  state.losses.hidden = true;
  state.plate = el;
  count(state, 0);
}
// The line under the name: how many have gone so far. A pip is a card still
// standing; a long list is a bar of what is left.
function count(state, gone) {
  state.gone = gone;
  state.line.replaceChildren();
  node('strong', '', state.line, gone ? `${gone}` : `${state.count}`);
  state.line.append(say(gone ? ` of ${plural(state.count, state.noun)} ${KINDS[state.mode].done}` : ` ${state.noun}${state.count === 1 ? '' : 's'}`));
  if (state.bar) state.bar.style.width = `${100 - Math.round(100 * gone / state.count)}%`;
  else [...state.pips.children].forEach((pip, index) => pip.classList.toggle('gone', index < gone));
}

// A card of the table takes the state of its unit. The arena is rebuilt on
// every render, so this runs again after each one: a card drawn again goes on
// from where the card it replaces was, and a frame follows its card.
function placeUnit(state, unit) {
  const ui = state.ui, elapsed = state.cascading ? clock() - state.cascadeAt : 0;
  // Reduced motion has no animation to wait in: a card is hidden when its turn comes.
  const going = state.cascading && (!state.calm || elapsed >= unit.wait);
  for (const card of unit.cards) for (const picture of pictures(ui, card)) {
    picture.classList.toggle('wipe-doomed', !going);
    if (!going || picture.classList.contains('wipe-dead')) continue;
    // Its turn is a delay from the impact (pin sets the start to the impact).
    picture.style.setProperty('--wipe-death', `${state.timing.death}ms`);
    picture.style.setProperty('--wipe-since', `${unit.wait}ms`);
    picture.classList.add('wipe-dead', `wipe-${KINDS[state.mode].hit}`);
  }
  const el = anchor(ui, unit), r = el && ui.fxRect(el);
  if (r) unit.rect = r;
  if (!unit.mark) return;
  unit.mark.hidden = !r;
  if (r) Object.assign(unit.mark.style, {left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`});
}
function place(state) {
  for (const unit of state.units) placeUnit(state, unit);
  for (const [player, chip] of state.chips) seat(state, player, chip);
  if (state.cascading && !state.calm) pin(state);
}
// The browser starts an animation when it is ready to draw it, which on a
// busy page is some frames after it was asked to; every card would then go
// that much late, and the last ones would still be fading when the engine
// moves them. Every animation of the cascade is set to start at the impact
// itself, so a late frame shows a card where it should be by then. A card
// drawn again by a render is set the same way and goes on from where the one
// it replaces was.
function pin(state) {
  const cascade = /^(wipeDead|wipeFrameOut|wipeCardFlash|wipeSpark|removalSweep|removalVoid|removalLift)/;
  for (const unit of state.units) {
    const parts = [...unit.cards.flatMap(card => pictures(state.ui, card)), unit.mark].filter(Boolean);
    for (const part of parts) for (const animation of part.getAnimations?.({subtree: true}) || []) {
      if (animation.startTime === state.cascadeAt || !cascade.test(String(animation.animationName))) continue;
      try { animation.startTime = state.cascadeAt; } catch { /* It starts when the browser is ready. */ }
    }
  }
}
// A board's loss stands where its cards were; a player who is not in view
// has it on their seat.
function seat(state, player, chip) {
  const rects = state.units.filter(unit => unit.player === player && unit.rect).map(unit => unit.rect);
  let x, y;
  if (rects.length) {
    const left = Math.min(...rects.map(r => r.left)), right = Math.max(...rects.map(r => r.left + r.width));
    const top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.top + r.height));
    x = (left + right) / 2; y = (top + bottom) / 2;
  } else {
    const el = state.ui.gameEffectPlayerAnchor(player), r = el && state.ui.fxShown(el) ? state.ui.fxRect(el) : null;
    if (r) { x = r.left + r.width / 2; y = r.top + r.height + 16; }
  }
  chip.hidden = x == null;
  if (x != null) Object.assign(chip.style, {left: `${x}px`, top: `${y}px`});
}
function loss(state, player) {
  if (!player || state.chips.has(player)) return;
  const chip = node('div', 'wipefx-loss', state.root, `−${state.cards.filter(card => card.ctrl === player).length}`);
  state.chips.set(player, chip);
  seat(state, player, chip);
}

// The impact, then the cards one after another. Started by the engine's own
// event, so the table follows the game and not a clock of its own.
function cascade(state) {
  if (state.cascading) return;
  const {timing, units} = state, span = timing.stagger * (state.count - 1);
  state.cascading = true; state.cascadeAt = performance.now();
  state.plate.classList.remove('stage');
  units.forEach((unit, index) => { unit.wait = Math.round(timing.lead + (units.length > 1 ? span * index / (units.length - 1) : 0)); });
  if (!state.calm) {
    node('div', 'wipefx-flash', state.root);
    const shock = node('div', 'wipefx-shock', state.root);
    node('i', '', shock); if (!phone.matches) node('i', '', shock);
    const game = document.querySelector('#game');
    if (game) { game.classList.remove('fx-boardwipe-camera'); void game.offsetWidth; game.classList.add('fx-boardwipe-camera'); }
    later(state, () => game?.classList.remove('fx-boardwipe-camera'), 1200);
    for (const unit of units) if (unit.mark) {
      // Each frame carries its card's hit, waiting for its turn.
      unit.mark.style.setProperty('--wipe-wait', `${unit.wait}ms`);
      unit.mark.classList.add('hit');
      node('i', 'wipefx-strike', unit.mark);
      if (KINDS[state.mode].hit === 'cut' && !phone.matches) for (let i = 0; i < 5; i++) {
        const spark = node('i', 'wipefx-spark', unit.mark), angle = ((i * 72 + (unit.cards[0].iid || 0) * 37) % 360) * Math.PI / 180;
        spark.style.setProperty('--spark-x', `${Math.round(Math.cos(angle) * 46)}px`);
        spark.style.setProperty('--spark-y', `${Math.round(Math.sin(angle) * 46)}px`);
      }
    }
  }
  place(state);
  follow(state);
  later(state, () => settle(state), timing.lead + span + timing.death);
}
// The words follow the cards: how many have gone by now, and whose last card it was.
function follow(state) {
  if (active !== state || state.settled) return;
  // By the clock the animations run on: what is counted is what is drawn.
  const elapsed = clock() - state.cascadeAt;
  let gone = 0;
  for (const unit of state.units) if (elapsed >= unit.wait) {
    gone += unit.cards.length;
    if (!unit.dead) { unit.dead = true; if (state.calm) placeUnit(state, unit); }
  }
  if (gone !== state.gone) count(state, gone);
  // A board shows its loss when its last card has gone, not over the card.
  const left = state.timing.death * .8;
  for (const player of new Set(state.units.map(unit => unit.player)))
    if (state.units.every(unit => unit.player !== player || elapsed >= unit.wait + left)) loss(state, player);
  if (state.chips.size < new Set(state.units.map(unit => unit.player)).size) state.frame = requestAnimationFrame(() => follow(state));
}

// The result, in words: how many went and whose they were.
function settle(state) {
  const kind = KINDS[state.mode], ui = state.ui;
  state.settled = true;
  cancelAnimationFrame(state.frame);
  state.root.classList.add('settled');
  state.plate.classList.remove('stage');
  const gone = state.resolved ?? state.count;
  state.line.replaceChildren();
  node('strong', '', state.line, `${gone}`);
  state.line.append(say(` ${state.noun}${gone === 1 ? '' : 's'} ${kind.done}${gone < state.count ? ` · ${state.count - gone} remained` : ''}`));
  const players = [...new Set(state.cards.map(card => card.ctrl).filter(Boolean))];
  if (players.length > 1 || players[0] !== ui.me) {
    state.pips.hidden = true; state.losses.hidden = false;
    state.losses.replaceChildren();
    for (const player of players) {
      const row = node('span', player === ui.me ? 'mine' : '', state.losses);
      node('b', '', row, player === ui.me ? 'You' : player.name);
      row.append(` ${state.cards.filter(card => card.ctrl === player).length}`);
    }
  } else if (!state.bar) [...state.pips.children].forEach(pip => pip.classList.add('gone'));
  // It leaves on its own if the engine's last word never comes.
  later(state, () => leave(state), (state.timing?.settle ?? 600) + 1500);
}
function leave(state) {
  if (state.leaving) return;
  state.leaving = true;
  state.root.classList.add('leaving');
  later(state, finish, 260);
}

P.showBoardWipeEffect = function (event) {
  const cards = (event.cards || []).filter(Boolean);
  finish();
  if (!cards.length || document.hidden || !document.body.classList.contains('game-active')) return;
  const layer = this.gameEffectLayer();
  const mode = KINDS[event.mode] ? event.mode : 'destroy';
  const state = active = {ui: this, game: this.game, layer, mode, cards, count: event.count ?? cards.length,
    timing: event.timing || null, staged: !!event.timing, calm: calm(this), timers: [], chips: new Map(), units: [], gone: 0};
  state.root = node('div', `wipefx mode-${mode} hit-${KINDS[mode].hit}${state.calm ? ' calm' : ''}${state.staged ? '' : ' unstaged'}`, layer);
  if (state.timing) state.root.style.setProperty('--wipe-death', `${state.timing.death}ms`);
  if (state.staged && !state.calm) node('div', 'wipefx-veil', state.root);
  plate(state, event, this);
  // An instant game has already moved the cards: say what happened and go.
  if (!state.staged) { settle(state); return; }
  state.units = unitsOf(this, cards);
  // The frames close on the cards in the order the cards will go.
  const step = Math.min(46, state.timing.build * .55 / Math.max(1, state.units.length));
  state.units.forEach((unit, index) => {
    if (!unit.shown || state.calm) return;
    unit.mark = node('div', 'wipefx-mark', state.root);
    unit.mark.style.setProperty('--wipe-mark', `${Math.round(120 + index * step)}ms`);
    node('i', 'wipefx-frame', unit.mark);
  });
  place(state);
  // The engine says when the impact lands; this is for a table that never hears it.
  later(state, () => cascade(state), state.timing.build + 400);
};

// The engine's later words about the same wipe: the impact, then how many
// cards really left.
P.showBoardWipeBeat = function (event) {
  const state = active;
  if (!state || state.ui !== this) return;
  if (event.kind === 'boardWipeImpact') { if (state.staged) cascade(state); return; }
  if (event.kind !== 'boardWipeResolved') return;
  if (typeof event.count === 'number') state.resolved = event.count;
  if (!state.staged || state.leaving) return;
  // The cards have left the table: whatever was still to play is said now,
  // and the plate goes as the engine moves on.
  for (const timer of state.timers.splice(0)) clearTimeout(timer);
  state.root.querySelectorAll('.wipefx-mark').forEach(mark => mark.remove());
  for (const unit of state.units) { unit.mark = null; unit.dead = true; }
  for (const player of new Set(state.units.map(unit => unit.player))) loss(state, player);
  count(state, state.count);
  settle(state);
  for (const timer of state.timers.splice(0)) clearTimeout(timer);
  // Gone before the engine moves on: the highlight that follows is not drawn under it.
  later(state, () => leave(state), Math.max(200, state.timing.settle - 300));
};

const render = P.render;
P.render = function (...args) {
  if (active && (active.ui !== this || active.game !== this.game || this.game?.gameOver)) finish();
  const result = render.apply(this, args);
  if (active?.ui === this && active.staged) place(active);
  return result;
};
window.addEventListener('resize', () => { if (active?.staged) place(active); });
window.addEventListener('scroll', () => { if (active?.staged) place(active); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
// What the staged wipe is doing, for the browser suites.
U.boardWipeState = () => active && {mode: active.mode, count: active.count, gone: active.gone, staged: active.staged,
  calm: active.calm, cascading: !!active.cascading, cascadeAt: active.cascadeAt ?? null, settled: !!active.settled, leaving: !!active.leaving,
  units: active.units.map(unit => ({cards: unit.cards.length, shown: unit.shown, wait: unit.wait ?? null, player: unit.player?.idx ?? null}))};
})();
