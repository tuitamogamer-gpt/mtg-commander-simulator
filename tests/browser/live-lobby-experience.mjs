// Presentation regression checks use the real lobby renderer with a controlled
// room adapter. Transport and authorization remain covered by Live suites.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs [CHROMIUM_PATH=/path/to/chromium]
// node tests/browser/live-lobby-experience.mjs
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.GAME_QA_OUTPUT || `${root}output/playwright/live-lobby-experience`;
mkdirSync(out, { recursive: true });
const app = express();
app.get('/_live-fixture', (_request, response) => response.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/src/design-system.css"><link rel="stylesheet" href="/src/styles.css">
<link rel="stylesheet" href="/src/client-v3.css"><link rel="stylesheet" href="/src/frontend-overhaul.css">
<link rel="stylesheet" href="/src/live-experience.css"></head><body><main id="lobby-root"></main>
<script src="/src/modules/multiplayer-ui.js"></script></body></html>`));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const errors = [], checks = [];
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
const url = `http://127.0.0.1:${server.address().port}/_live-fixture`;
async function mount(page, { guest = false, failedJoin = false } = {}) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ guest, failedJoin }) => {
    MTG.DECKS = {
      'Primal Power': { commander: 'Etali, Primal Storm' },
      'Elven Council': { commander: 'Dwynen, Gilt-Leaf Daen' },
      'Animated Army': { commander: 'Bello, Bard of the Brambles' },
      'Armory': { commander: 'Sram, Senior Edificer' },
    };
    const paths = {
      'Etali, Primal Storm': 'etali-primal-storm-0e0d19c74e',
      'Dwynen, Gilt-Leaf Daen': 'dwynen-gilt-leaf-daen-18c7e834be',
      'Bello, Bard of the Brambles': 'bello-bard-of-the-brambles-bf2dde9163',
      'Sram, Senior Edificer': 'sram-senior-edificer-27c916a7cf',
    };
    MTG.cardImageURL = name => `/assets/cards/${paths[name]}.webp`;
    MTG.defaultCommanders = deck => [deck.commander];
    MTG.imgFail = () => {};
    MTG.icon = () => '<svg class="gameicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="M12 7v6m0 3v1"></path></svg>';
    window.calls = []; window.backCalls = 0; window.hostStarts = 0;
    const seats = [
      { seat: 0, kind: 'human', role: 'host', name: 'You', occupied: true, connected: true, ready: true, deckId: 'Primal Power', commanderNames: ['Etali, Primal Storm'] },
      { seat: 1, kind: 'human', role: 'player', name: 'Raven', occupied: guest, connected: guest, ready: false, deckId: null, commanderNames: [] },
      { seat: 2, kind: 'bot', role: 'bot', name: 'Dragon', occupied: false, connected: true, ready: true, deckId: 'Animated Army', commanderNames: ['Bello, Bard of the Brambles'] },
      { seat: 3, kind: 'bot', role: 'bot', name: 'Wolf', occupied: false, connected: true, ready: true, deckId: 'Armory', commanderNames: ['Sram, Senior Edificer'] },
    ];
    window.room = failedJoin ? null : { phase: 'lobby', revision: 1, you: guest ? 1 : 0, settings: { playerCount: 4 }, seats };
    const client = window.roomClient = {
      isHost: !guest, platformAutoJoin: !failedJoin,
      shareUrl: `${location.origin}/?room=qa-invite&players=4`,
      current: () => window.room,
      subscribe(callback) { window.publish = () => callback(window.room); return () => {}; },
      async dispatch(action) {
        window.calls.push(action);
        if (failedJoin) throw Error('The room is no longer available.');
        if (window.pauseDispatch) await new Promise(resolve => { window.releaseDispatch = resolve; });
        if (window.rejectDispatch) { window.rejectDispatch = false; throw Error('Connection interrupted. Try again.'); }
        if (action.type === 'configure') Object.assign(window.room.seats[action.seat ?? window.room.you], { deckId: action.deckId, commanderNames: action.commanderNames, ready: action.ready });
        if (action.type === 'configureSeat') Object.assign(window.room.seats[action.seat], { kind: action.kind, connected: action.kind === 'bot' });
        if (action.type === 'resume') window.room.phase = 'running';
        window.room.revision += 1;
        return window.room;
      },
    };
    window.lobby = await MTG.mountOnlineLobby({ root: document.querySelector('#lobby-root'), client,
      onHostStart() { window.hostStarts += 1; }, onBack() { window.backCalls += 1; } });
  }, { guest, failedJoin });
}
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  await mount(page);
  assert.equal(await page.locator('.online-start').isDisabled(), true);
  assert.match(await page.locator('.online-ready-summary').innerText(), /3 of 4 seats ready/);
  assert.match(await page.locator('.onlineseat[data-seat="1"]').getAttribute('aria-label'), /Open seat/);
  assert.match(await page.locator('.onlineseat[data-seat="0"] img').getAttribute('alt'), /Etali/);
  check('host sees readiness, open seats, actual commanders and a disabled start until ready');
  await page.screenshot({ path: `${out}/desktop-lobby.png`, fullPage: true, mask: [page.locator('.online-invite b')], maskColor: '#1a222b' });

  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText(value) { window.copiedInvite = value; } } }));
  await page.locator('.online-copy').click();
  await page.getByText('Invite copied. Send it to your friends.').waitFor();
  assert.equal(await page.evaluate(() => window.copiedInvite), await page.locator('.online-invite b').innerText());
  assert.equal(await page.evaluate(() => document.activeElement.dataset.liveFocus), 'invite-copy');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { async writeText() { throw Error('Blocked'); } } }));
  await page.locator('.online-copy').click();
  await page.locator('.online-invite-manual input').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.matches('.online-invite-manual input')), true);
  assert.equal(await page.locator('.online-invite-manual input').inputValue(), await page.locator('.online-invite b').innerText());
  assert.equal(await page.evaluate(() => document.activeElement.selectionEnd - document.activeElement.selectionStart), (await page.locator('.online-invite-manual input').inputValue()).length);
  check('copy invite confirms success and clipboard rejection offers a focused, selected manual link');

  await page.evaluate(() => { window.pauseDispatch = true; });
  await page.locator('.onlineseat[data-seat="0"] .online-deck-select').focus();
  await page.locator('.onlineseat[data-seat="0"] .online-deck-select').selectOption('Elven Council');
  assert.match(await page.locator('.online-ready-summary').innerText(), /Saving deck selection/);
  assert.equal(await page.locator('.online-lobby').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.onlineseat[data-seat="0"] .online-deck-select').isDisabled(), true);
  await page.evaluate(() => { window.pauseDispatch = false; window.releaseDispatch(); });
  await page.waitForFunction(() => !window.lobby.busy);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.liveFocus), 'seat-deck-0');
  assert.equal(await page.locator('.onlineseat[data-seat="0"] .online-deck-select').inputValue(), 'Elven Council');
  const dispatched = await page.evaluate(() => window.calls.at(-1));
  assert.equal(dispatched.type, 'configure'); assert.equal(dispatched.ready, true); assert.equal(dispatched.seat, 0);
  check('deck configuration retains original dispatch semantics, announces busy state and restores keyboard focus');

  await page.evaluate(() => { window.rejectDispatch = true; });
  await page.locator('.onlineseat[data-seat="0"] .online-deck-select').selectOption('Primal Power');
  await page.locator('.online-error[role="alert"]').waitFor();
  assert.equal(await page.locator('.onlineseat[data-seat="0"] .online-deck-select').inputValue(), 'Elven Council');
  assert.match(await page.locator('.online-error').innerText(), /Connection interrupted/);
  check('failed changes remain visible beside the lobby and preserve the confirmed deck');

  await page.evaluate(() => {
    Object.assign(window.room.seats[1], { occupied: true, connected: true, ready: true, deckId: 'Primal Power', commanderNames: ['Etali, Primal Storm'] });
    window.publish();
  });
  assert.equal(await page.locator('.online-start').isDisabled(), false);
  assert.match(await page.locator('.online-ready-summary').innerText(), /Your pod is ready/);
  await page.evaluate(() => { window.pauseDispatch = true; });
  await page.locator('.online-start').click();
  await page.evaluate(() => window.lobby.perform({ type: 'start', seed: 4 }));
  assert.equal(await page.evaluate(() => window.calls.filter(action => action.type === 'start').length), 1);
  await page.evaluate(() => { window.pauseDispatch = false; window.releaseDispatch(); });
  await page.waitForFunction(() => !window.lobby.busy);
  check('ready game starts once while an action is pending');

  for (const width of [360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px has no horizontal overflow`);
    const targets = await page.locator('.online-lobby button, .online-lobby select').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => ({ name: node.textContent, height: node.getBoundingClientRect().height })));
    assert.equal(targets.every(target => target.height >= 44), true, `${width}px primary controls are touch sized`);
    if (width <= 390) {
      const tallestSeat = await page.locator('.onlineseat').evaluateAll(nodes => Math.max(...nodes.map(node => node.getBoundingClientRect().height)));
      assert.ok(tallestSeat <= 330, `${width}px seats stay compact rather than inheriting desktop grid rows`);
    }
    if (width === 390) await page.screenshot({ path: `${out}/mobile-lobby.png`, fullPage: true, mask: [page.locator('.online-invite b')], maskColor: '#1a222b' });
  }
  check('360px, 390px and tablet lobby fit the viewport with accessible touch targets');

  await mount(page, { guest: true });
  assert.equal(await page.locator('.online-copy').count(), 0);
  assert.equal(await page.locator('.online-start').count(), 0);
  assert.equal(await page.locator('.online-deck-select').count(), 1);
  await page.locator('.online-deck-select').selectOption('Elven Council');
  assert.match(await page.locator('.onlineseat.mine .onlineseatstatus').innerText(), /Ready to play/);
  check('guest can configure only their own seat and sees their ready status');

  await mount(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText() { return new Promise(resolve => { window.releaseCopy = resolve; }); } } }));
  await page.locator('.online-copy').click();
  await page.evaluate(() => { document.querySelector('#lobby-root').textContent = 'Back at setup'; window.releaseCopy(); });
  await page.waitForFunction(() => !window.lobby.copyingInvite);
  assert.equal(await page.locator('.online-lobby').count(), 0);
  assert.equal(await page.locator('#lobby-root').innerText(), 'Back at setup');
  check('late clipboard completion cannot replace a screen opened after leaving the lobby');

  await mount(page, { failedJoin: true });
  assert.match(await page.locator('[role="alert"]').innerText(), /no longer available/);
  await page.locator('.online-back').click();
  assert.equal(await page.evaluate(() => window.backCalls), 1);
  check('failed initial join displays a useful error and a working route back');

  await mount(page);
  await page.evaluate(() => { window.room.protocolMismatch = true; window.publish(); });
  await page.locator('[role="alert"]').waitFor();
  assert.match(await page.locator('h1').innerText(), /versions differ/);
  await page.locator('.online-back').click();
  assert.equal(await page.evaluate(() => window.backCalls), 1);
  check('version mismatch has readable recovery guidance and a working Back action');

  await mount(page);
  await page.evaluate(() => {
    window._game = {};
    window.lobby.started = true;
    window.room.phase = 'paused';
    Object.assign(window.room.seats[1], { occupied: true, connected: false });
    window.publish();
  });
  await page.locator('.online-reconnect-dialog').waitFor();
  assert.equal(await page.locator('.online-resume').isDisabled(), true);
  assert.equal(await page.evaluate(() => document.querySelector('.online-reconnect-dialog').contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.online-reconnect-dialog').isVisible(), true);
  await page.evaluate(() => { window.room.seats[1].connected = true; window.publish(); });
  assert.equal(await page.locator('.online-resume').isDisabled(), false);
  await page.locator('.online-resume').click();
  await page.waitForFunction(() => !document.querySelector('.online-reconnect-dialog'));
  assert.equal(await page.evaluate(() => window.calls.at(-1).type), 'resume');
  check('reconnect dialog contains focus, cannot dismiss the required pause, and resumes only when connected');

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/report.json`, JSON.stringify({ checks, errors }, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
