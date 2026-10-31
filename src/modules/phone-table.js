// Phone table polish. Short notices float just above the prompt bar instead of
// over the board heading with your life total, and the prompt says "tap" on
// touch screens. Presentation only: decisions and rules state are untouched.
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
  const items = FLOATERS.flatMap(cls => [...document.querySelectorAll(`body > .${cls}`)]);
  if (!items.length) return;
  const reset = () => items.forEach(item => { item.style.removeProperty('top'); item.style.removeProperty('bottom'); });
  if (!phone.matches || !document.body.classList.contains('game-active') || document.querySelector('#game .overlay')) return reset();
  const anchor = ['#game .promptbar', '#game .mobileviewtabs'].map(sel => document.querySelector(sel)?.getBoundingClientRect())
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
    .some(item => item.nodeType === 1 && FLOATERS.some(cls => item.classList.contains(cls))))) placeFloaters();
}).observe(document.body, {childList: true});
window.addEventListener('resize', placeFloaters);
phone.addEventListener?.('change', placeFloaters);
})();
