import test from 'node:test';
import assert from 'node:assert/strict';
import {decisionTable, button} from './helpers/ui-decision-fixtures.mjs';

function table() {
  const f = decisionTable();
  f.ui.renderArena = function () {
    f.root.replaceChildren();
    if (this.pending) f.root.appendChild(this.renderPromptBar(f.game));
    const popup = this.renderRevealPopup(f.game);
    if (popup) f.root.appendChild(popup);
  };
  return f;
}
function question(f, extra = {}) {
  return {type: 'cardReveal', kind: 'reveal', libraryReveal: true, revealStage: 'start',
    revealAction: 'exile', title: 'Cascade', ctrl: f.me, libraryOwner: f.me, cards: [], ...extra};
}
function html(f) { return [f.root, ...f.root.descendants()].map(node => node.innerHTML || '').join('\n'); }

test('the first library checkpoint renders a card back and waits without exposing the top card', async () => {
  const f = table(), secret = f.put('Sol Ring', 'library');
  let answered = false;
  const pending = f.me.controller.decide(f.game, question(f)).then(result => { answered = true; return result; });
  assert.ok(f.root.querySelector('.libraryrevealback'));
  assert.equal(f.root.querySelector('.libraryrevealcard'), null);
  assert.equal(html(f).includes(secret.name), false, 'even image markup cannot preload the hidden card');
  assert.match(f.root.textContent, /Ready to reveal/);
  f.ui.render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(answered, false);
  button(f, 'Exile top card').click();
  assert.equal(await pending, null);
});

test('reveal-only checkpoints use their own action and never inherit accept-all for the turn', async () => {
  const f = table();
  f.ui.acceptAllReveals = f.game.turnNo;
  const pending = f.me.controller.decide(f.game, question(f, {revealAction: 'reveal'}));
  assert.ok(f.ui.pending, 'library reveals require explicit confirmation even after accepting tokens');
  assert.equal(f.root.querySelector('.revealacceptall'), null);
  assert.equal(f.ui.autoAnswer(f.game, {type: 'cardReveal', cards: []}), null, 'normal reveal preference still works');
  assert.equal(f.root.querySelector('.libraryrevealback').getAttribute('aria-label'), 'Unrevealed card');
  assert.match(f.root.querySelector('.libraryrevealowner').textContent, /Ready to reveal/);
  assert.doesNotMatch(f.root.textContent, /top card/i, 'a selected public reveal does not claim to reveal the top card');
  button(f, 'Reveal cards').click();
  assert.equal(await pending, null);
});

test('history keeps every revealed card in order, including duplicates and their owners', async () => {
  const f = table(), first = f.put('Mountain', 'exile'), second = f.put('Mountain', 'exile', f.rival), hit = f.put('Sol Ring', 'exile');
  const pending = f.me.controller.decide(f.game, question(f, {revealStage: 'card', cards: [first, second, hit], card: hit,
    prompt: 'A spell with lower mana value was found.'}));
  const history = f.root.querySelectorAll('.libraryrevealhistorycard');
  assert.deepEqual(history.map(node => node.getAttribute('aria-label')), ['1. Mountain — You', '2. Mountain — Opponent', '3. Sol Ring — You']);
  assert.equal(history.length, 3, 'identical names must not be grouped');
  assert.equal(history[2].classList.contains('is-current'), true);
  assert.match(f.root.querySelector('.libraryrevealcaption').textContent, /Sol Ring.*lower mana value/);
  history[1].click();
  assert.equal(f.ui.sheet.card, second, 'history inspection refers to the actual card instance');
  assert.ok(f.ui.pending, 'inspecting a card never answers the reveal');
  button(f, 'Continue ▶').click();
  assert.equal(await pending, null);
});

test('rerenders retain animation progress and cannot restart a completed card entrance', async () => {
  const f = table(), card = f.put('Sol Ring', 'exile');
  const pending = f.me.controller.decide(f.game, question(f, {revealStage: 'card', cards: [card], card}));
  const pd = f.ui.pending;
  assert.ok(f.root.querySelector('.libraryrevealcard').classList.contains('is-revealing'));
  pd.libraryRevealStartedAt = Date.now() - 200;
  const started = pd.libraryRevealStartedAt;
  f.ui.render();
  assert.equal(pd.libraryRevealStartedAt, started);
  assert.ok(parseFloat(f.root.querySelector('.libraryrevealcard').style.animationDelay) <= -200);
  pd.libraryRevealStartedAt = Date.now() - 1000;
  f.ui.render();
  assert.equal(f.root.querySelector('.libraryrevealcard').classList.contains('is-revealing'), false);
  assert.equal(f.ui.pending, pd);
  button(f, 'Continue ▶').click();
  await pending;
});

test('stale reveal continue and inspection controls cannot consume or alter a later checkpoint', async () => {
  const f = table(), card = f.put('Sol Ring', 'exile');
  const first = f.me.controller.decide(f.game, question(f, {revealStage: 'card', cards: [card], card}));
  const oldNext = button(f, 'Continue ▶'), oldInspect = f.root.querySelector('.libraryrevealcard');
  oldNext.click(); await first;
  const second = f.me.controller.decide(f.game, question(f));
  const current = f.ui.pending;
  oldNext.click(); oldInspect.click();
  assert.equal(f.ui.pending, current);
  assert.equal(f.ui.sheet, null);
  button(f, 'Exile top card').click(); await second;
});

test('accept-all can acknowledge normal reveals without flushing a waiting library checkpoint', async () => {
  const f = table(), card = f.put('Sol Ring');
  const library = f.me.controller.decide(f.game, question(f));
  const libraryPending = f.ui.pending;
  const normal = f.me.controller.decide(f.game, {type: 'cardReveal', kind: 'tokens', cards: [card], ctrl: f.rival});
  const accept = button(f, 'Accept all this turn ⏩');
  accept.click(); await normal;
  assert.equal(f.ui.pending, libraryPending);
  assert.equal(f.ui.acceptAllReveals, f.game.turnNo);
  delete f.ui.acceptAllReveals;
  const nextNormal = f.me.controller.decide(f.game, {type: 'cardReveal', kind: 'tokens', cards: [card], ctrl: f.rival});
  const nextPending = f.ui.pending;
  accept.click();
  assert.equal(f.ui.pending, nextPending, 'a stale accept-all callback cannot flush new questions');
  button(f, 'Proceed ▶').click(); await nextNormal;
  button(f, 'Exile top card').click(); await library;
});

test('holding Enter does not advance several library checkpoints', async () => {
  const f = table();
  let keydown;
  f.document.addEventListener = (type, listener) => { if (type === 'keydown') keydown = listener; };
  f.document.querySelector = selector => selector === '#game' ? f.root : f.root.querySelector(selector);
  f.ui.initKeys();
  const event = repeat => ({key: 'Enter', repeat, target: f.document.body, preventDefault() { this.defaultPrevented = true; }});
  const first = f.me.controller.decide(f.game, question(f));
  const pd = f.ui.pending;
  const held = event(true); keydown(held);
  assert.equal(f.ui.pending, pd);
  assert.equal(held.defaultPrevented, true);
  keydown(event(false)); await first;
  const second = f.me.controller.decide(f.game, question(f));
  const next = f.ui.pending;
  keydown(event(true));
  assert.equal(f.ui.pending, next);
  keydown(event(false)); await second;
});
