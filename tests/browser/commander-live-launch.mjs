// Local: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/commander-live-launch.mjs
// Remote: append --url https://your-game.example (creates one temporary guest room; no account writes).
// Use --output output/playwright/live-production or GAME_QA_OUTPUT to keep evidence separate.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCommanderLiveServer, createMemoryRoomStore } from '../../api/ws.js';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const outputIndex = process.argv.indexOf('--output');
const out = (outputIndex >= 0 ? process.argv[outputIndex + 1] : process.env.GAME_QA_OUTPUT) || `${root}output/playwright/commander-live-launch`;
mkdirSync(out, { recursive: true });
const urlIndex = process.argv.indexOf('--url');
const externalURL = urlIndex >= 0 ? process.argv[urlIndex + 1] : process.env.GAME_URL;
const server = externalURL ? null : createCommanderLiveServer({ store: createMemoryRoomStore() });
if (server) {
  const app = server.listeners('request')[0];
  app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
  app.use(express.static(root));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
}
const base = externalURL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const pages = [], contexts = [], checks = [], errors = [];
const frames = new Map();
const latest = name => frames.get(name)?.filter(message => message.type === 'state').at(-1)?.view;
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
async function pageFor(name) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(context);
  await context.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  const page = await context.newPage();
  pages.push([name, page]); frames.set(name, []);
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
  page.on('websocket', socket => socket.on('framereceived', event => {
    try { frames.get(name).push(JSON.parse(String(event.payload))); } catch {}
  }));
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  return page;
}
async function until(predicate, description, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${description}`);
}
async function clickVisible(page, pattern, scope = '#game') {
  const buttons = page.locator(scope).getByRole('button', { name: pattern, disabled: false }).filter({ visible: true });
  if (!await buttons.count()) return false;
  await buttons.last().click({ timeout: 5000 });
  return true;
}

try {
  const host = await pageFor('host');
  const guest = await pageFor('guest');
  const guestDeck = 'Live Launch Guest Forests';
  await guest.locator('[data-menu-action="import"]').first().click();
  await guest.waitForFunction(() => document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
  await guest.locator('.mainmenu-deckimport-name').fill(guestDeck);
  await guest.locator('.mainmenu-deckimport-text').fill('Commander\n1 Dwynen, Gilt-Leaf Daen\n\nDeck\n1 Sol Ring\n98 Forest');
  await guest.locator('.mainmenu-deckimport-check').click();
  await guest.locator('.mainmenu-deckimport-start').click();
  await guest.locator('.deckspotlight').waitFor();
  assert.equal(await host.evaluate(name => !!MTG.DECKS?.[name], guestDeck), false);
  check('guest imports a supported 100-card list through My Library; host has no copy');

  await host.locator('[data-menu-action="live"]').first().click();
  await host.locator('.deckentry[data-deck="Abzan Armor"] .deckcard').click();
  await host.locator('.deckspotlightcontinue').click();
  await host.locator('[data-live-players="2"]').click();
  await host.locator('.setupnext:visible').click();
  await host.locator('.reviewstart').click();
  await host.locator('.online-invite b').waitFor();
  const invite = await host.locator('.online-invite b').innerText();
  assert.equal(new URL(invite).origin, new URL(base).origin);
  await guest.goto(invite, { waitUntil: 'domcontentloaded' });
  await guest.locator('.online-deck-select').selectOption(guestDeck);
  await until(() => latest('host')?.seats.every(seat => seat.connected && seat.ready), 'both human seats ready');
  assert.equal(latest('host').seats[1].deckRecord.name, guestDeck);
  assert.equal(latest('guest').seats[0].deckRecord, null);
  await host.screenshot({ path: `${out}/01-host-lobby.png`, mask: [host.locator('.online-invite b')] });
  await guest.screenshot({ path: `${out}/02-guest-lobby.png` });
  check('same-origin WebSocket lobby receives guest imported selection and readies two isolated browsers');

  await host.locator('.online-start').click();
  let hostKept = false, guestKept = false;
  await until(async () => {
    if (!hostKept) hostKept = await clickVisible(host, /^Keep ✓$/);
    if (!guestKept) guestKept = await clickVisible(guest, /^Keep$/, '.online-decision-stage');
    return hostKept && guestKept;
  }, 'host and guest opening-hand Keep actions', 60000);
  assert.equal(await host.evaluate(name => _game.players.some(player => player.deckName === name && !player.isAI), guestDeck), true);
  assert.equal(await host.evaluate(() => _game.players.filter(player => player.isAI).length), 0);
  check('host starts the actual imported-deck engine and both humans keep opening hands');

  await until(async () => {
    if (latest('guest')?.pendingDecision?.type === 'main') return true;
    await clickVisible(host, /^(Continue|End turn|Proceed|No attacks|No blocks)/);
    await clickVisible(guest, /^(Pass priority|Proceed|Declare none)$/, '.online-decision-stage');
    return false;
  }, 'guest receives a real main-phase decision', 60000);
  const guestView = latest('guest');
  assert.equal(guestView.gameView.players.find(player => player.seat === guestView.you).hand.length > 0, true);
  assert.equal(guestView.gameView.players.filter(player => player.seat !== guestView.you).every(player => !('hand' in player)), true);
  for (const name of ['host', 'guest']) for (const message of frames.get(name)) {
    if (message.type !== 'state') continue;
    assert.equal('seats' in message, false, 'no outer seat credentials');
    assert.equal(message.view.seats.some(seat => 'playerId' in seat || 'connectionId' in seat), false);
  }
  const landsBefore = guestView.gameView.battlefield.filter(card => card.controllerSeat === guestView.you && card.types.includes('Land')).length;
  await guest.locator('.online-decision-stage').getByRole('button', { name: /^Play Forest/ }).first().click();
  await until(() => (latest('guest')?.gameView?.battlefield || []).filter(card => card.controllerSeat === guestView.you && card.types.includes('Land')).length === landsBefore + 1, 'guest Forest resolves to the shared battlefield');
  await guest.screenshot({ path: `${out}/03-guest-played-land.png` });
  check('private guest decision crosses WebSockets and plays an imported Forest on the host battlefield');

  const originalSeat = latest('guest').you;
  const revision = latest('guest').revision;
  await guest.reload({ waitUntil: 'domcontentloaded' });
  await until(() => latest('guest')?.revision > revision && latest('guest')?.you === originalSeat && latest('guest')?.seats[originalSeat]?.connected, 'guest reconnects into the same seat');
  await until(async () => {
    if (latest('guest')?.phase === 'running') return true;
    if (await host.locator('.online-reconnect-dialog').isVisible()) {
      await host.screenshot({ path: `${out}/04-host-resume.png`, mask: [host.locator('.online-invite b')] });
    }
    return clickVisible(host, /^Resume live game$/, 'body');
  }, 'host can resume after guest reconnects', 10000);
  await until(() => latest('guest')?.phase === 'running', 'room resumes after reconnect');
  assert.equal(latest('guest').seats[originalSeat].deckRecord.name, guestDeck);
  await until(async () => {
    if (latest('guest')?.pendingDecision) return true;
    await clickVisible(host, /^(Continue|End turn|Proceed|No attacks|No blocks)/);
    return false;
  }, 'guest pending decision is available after resume');
  const resumedDecision = latest('guest').pendingDecision.id;
  assert.equal(await clickVisible(guest, /^(Continue|Pass priority|Proceed|Declare none)$/, '.online-decision-stage'), true);
  await until(() => frames.get('host').some(message => message.view?.lastDecision?.id === resumedDecision), 'host accepts guest response after reconnect');
  await guest.screenshot({ path: `${out}/04-guest-reconnected.png` });
  check('guest reload restores the same private seat and imported deck; host resumes and accepts the next decision');
  assert.deepEqual(errors, []);
  check('no uncaught browser errors');
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: true, base, checks, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, output: out }));
} catch (error) {
  for (const [name, page] of pages) {
    await page.screenshot({ path: `${out}/failure-${name}.png`, mask: [page.locator('.online-invite b')] }).catch(() => {});
    const visibleText = await page.locator('body').innerText().catch(() => 'Page unavailable');
    writeFileSync(`${out}/failure-${name}.txt`, visibleText.replace(/https?:\/\/\S+\?\S*/g, '[private room URL]'));
  }
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: false, base, checks, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await browser.close();
  if (server) {
    for (const client of server.commanderLive.clients) client.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  }
}
