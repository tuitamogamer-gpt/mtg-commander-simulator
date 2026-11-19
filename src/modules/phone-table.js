// Phone table polish. Short notices float just above the prompt bar instead of
// over the board heading with your life total, and the prompt says "tap" on
// touch screens. The second half marks the composed table for the phone
// layout (src/phone-experience.css). Presentation only: decisions and rules
// state are untouched.
'use strict';
(() => {
const U = globalThis.MTG;
if (typeof document === 'undefined' || !U?.UI) return;
const phone = window.matchMedia('(max-width: 767px)');
const touch = window.matchMedia('(hover: none) and (pointer: coarse)');
// Nearest the prompt first: a spell copy, then the activity line, then a toast.
const FLOATERS = ['spellcopynoticestack', 'effectnoticestack', 'toastmsg'];
const GAP = 8, STACK_GAP = 6;

// The phone stylesheet parks these under the opponent seats, which covers your
// board heading (and the hand heading in the hand view). While a sheet or
// modal is open they keep that place: the sheet owns the bottom of the screen.
function placeFloaters() {
  // A powerhouse's arrival plate joins them, farthest from the prompt.
  const items = [...FLOATERS.flatMap(cls => [...document.querySelectorAll(`body > .${cls}`)]),
    ...document.querySelectorAll('body > .battlefieldarrival:not(.commander)')];
  if (!items.length) return;
  const reset = () => items.forEach(item => { item.style.removeProperty('top'); item.style.removeProperty('bottom'); });
  if (!phone.matches || !document.body.classList.contains('game-active') || document.querySelector('#game .overlay')) return reset();
  // Your portrait and life sit on the prompt (phone-experience.css): notices
  // stand on them, not over them. Views without them stand on the prompt.
  const anchor = ['#game.ct-phone .myboard > .ct-hero', '#game .promptbar', '#game .mobileviewtabs'].map(sel => document.querySelector(sel)?.getBoundingClientRect())
    .find(r => r && r.height > 0 && r.top > 0 && r.top <= innerHeight);
  if (!anchor) return reset();
  const z = window._ui?.viewportZoom?.(document.body) || 1;
  let bottom = (innerHeight - anchor.top) / z + GAP;
  for (const item of items) {
    item.style.top = 'auto'; item.style.bottom = `${Math.round(bottom)}px`;
    bottom += item.offsetHeight + STACK_GAP;
  }
}

// "click" reads wrong under a finger. Whole words only, so a card name that
// merely starts with the letters keeps its spelling.
const TAP = {click: 'tap', clicks: 'taps', clicked: 'tapped', clicking: 'tapping'};
const tapWords = text => text.replace(/\b([Cc])lick(s|ed|ing)?\b/g, (word, initial) => {
  const tap = TAP[word.toLowerCase()];
  return initial === 'C' ? tap[0].toUpperCase() + tap.slice(1) : tap;
});
function touchCopy(root) {
  if (!touch.matches || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (/\b[Cc]lick/.test(text.nodeValue)) text.nodeValue = tapWords(text.nodeValue);
  }
}

const renderPromptBar = U.UI.prototype.renderPromptBar;
U.UI.prototype.renderPromptBar = function (...args) {
  const bar = renderPromptBar.apply(this, args);
  touchCopy(bar);
  return bar;
};
const toast = U.UI.prototype.toast;
U.UI.prototype.toast = function (msg, ...rest) {
  return toast.call(this, touch.matches && typeof msg === 'string' ? tapWords(msg) : msg, ...rest);
};
const showEffectNotice = U.UI.prototype.showEffectNotice;
U.UI.prototype.showEffectNotice = function (...args) {
  const result = showEffectNotice.apply(this, args);
  placeFloaters();
  return result;
};
// The prompt grows and shrinks with each decision.
const render = U.UI.prototype.render;
U.UI.prototype.render = function (...args) {
  const result = render.apply(this, args);
  placeFloaters();
  return result;
};
// Notices and toasts are added to and removed from <body> directly.
new MutationObserver(records => {
  if (records.some(record => [...record.addedNodes, ...record.removedNodes]
    .some(item => item.nodeType === 1 && [...FLOATERS, 'battlefieldarrival'].some(cls => item.classList.contains(cls))))) placeFloaters();
}).observe(document.body, {childList: true});
window.addEventListener('resize', placeFloaters);
phone.addEventListener?.('change', placeFloaters);

// The phone table (src/phone-experience.css). The board is the screen: the
// front line of the opponent across the table stands above your own board,
// your portrait and life sit beside your hand, the hand is a fan with every
// card in view, and the prompt is one line with its action under the thumb.
// The stylesheet does the work; this marks what it needs on the table as it
// is composed, before it reaches the screen, so motion measures the layout
// the player sees. Every control keeps its handler.
const table = window.matchMedia('(max-width: 900px)');
// A short landscape screen keeps its side-by-side layout (command-table.css).
const shortLandscape = window.matchMedia('(min-width: 600px) and (max-width: 900px) and (max-height: 500px)');
const say = text => U.uiText ? U.uiText(String(text)) : String(text);
const renderCommandTable = U.UI.prototype.renderCommandTable;
U.UI.prototype.renderCommandTable = function (game, root) {
  renderCommandTable.call(this, game, root);
  const on = table.matches && !shortLandscape.matches;
  root.classList.toggle('ct-phone', on);
  if (!on) return;
  const mine = this.mobileView === 'mine' && (root.dataset.mobileBoard || 'mine') === 'mine';

  // Your portrait, life and zones: one bar between the board and the hand.
  const hero = root.querySelector('.myboard > .ct-player-head');
  if (hero) {
    hero.classList.add('ct-hero');
    hero.classList.toggle('is-active', game.turnPlayer === this.me);
    // The Hand counter opens the whole hand: the hand row has no heading.
    const counter = hero.querySelector('.zbtns > .zone-hand'), expand = root.querySelector('.handwrap .handexpand');
    if (counter && expand && this.mobileView === 'mine') {
      counter.replaceWith(expand);
      expand.classList.add('ct-hero-hand');
      expand.replaceChildren(counter);
    }
  }

  // The opponent across the table: the focused one, whose front line is shown.
  const across = mine ? root.querySelector('.opprow.ct-focused') : null;
  root.classList.toggle('ct-across', !!across);
  if (across) {
    const player = game.players.find(item => String(item.idx) === across.dataset.playerId);
    root.querySelector(`.ct-seat[data-focus-player="${across.dataset.playerId}"]`)?.classList.add('across');
    const strip = across.querySelector('.oppstrip');
    if (strip && player) {
      strip.dataset.acrossName = say(player.name);
      // Lands and mana rocks are on the opponent's own board, a seat away.
      if (!strip.querySelector('.oppboardmain .mini')) strip.dataset.acrossNote = say('No creatures');
    }
  }

  // With an opponent's board open, your own front line stands below it.
  const front = root.querySelector('.myboard > .mybattlefieldmain');
  if (front) front.dataset.acrossName = say('You');

  // The fan: how many cards share the row decides how far they overlap.
  const hand = root.querySelector('.handwrap .hand');
  if (hand) hand.style.setProperty('--ph-hand-count', String(Math.max(2, hand.querySelectorAll(':scope > .hcard').length)));

  // One action: the instruction and its button share a line.
  const prompt = root.querySelector('.ct-decision-rail > .promptbar');
  if (prompt) {
    const rows = [...prompt.querySelectorAll(':scope > .btnrow')], loose = prompt.querySelectorAll(':scope > .pbtn').length;
    const buttons = rows.reduce((sum, row) => sum + row.querySelectorAll('.pbtn').length, 0) + loose;
    prompt.classList.toggle('ct-one-action', rows.length === 1 && !loose && buttons === 1 && !!prompt.querySelector(':scope > .ptext'));
    prompt.classList.toggle('ct-no-action', buttons === 0);
  }
};
table.addEventListener?.('change', () => { if (document.body.classList.contains('game-active')) window._ui?.render?.(); });
shortLandscape.addEventListener?.('change', () => { if (document.body.classList.contains('game-active')) window._ui?.render?.(); });
})();
