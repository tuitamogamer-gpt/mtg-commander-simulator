// Local: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/browser/commander-live-mixed.mjs
// Remote: append --url https://your-game.example (creates one temporary guest room; no account writes).
// Use --output output/playwright/live-production or GAME_QA_OUTPUT to keep evidence separate.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createCommanderLiveServer, createMemoryRoomStore } from '../../api/ws.js';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const botSeats = (process.env.BOT_SEATS || '').split(',').filter(Boolean).map(Number);
const browserName = process.env.BROWSER || 'chromium';
const root = fileURLToPath(new URL('../../', import.meta.url));
const outputIndex = process.argv.indexOf('--output');
const out = (outputIndex >= 0 ? process.argv[outputIndex + 1] : process.env.GAME_QA_OUTPUT) || `${root}output/playwright/commander-live-mixed`;
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
const browser = await pw[browserName].launch({ headless: true });
const pages = [], contexts = [], checks = [], errors = [], controls = [];
const frames = new Map();
const latest = name => frames.get(name)?.filter(message => message.type === 'state').at(-1)?.view;
const check = name => { checks.push(name); console.log(`PASS ${name}`); };
async function pageFor(name) {
  const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, reducedMotion: 'reduce' });
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
  await host.locator('[data-menu-action="live"]').first().click();
  await host.locator('.deckentry[data-deck="Abzan Armor"] .deckcard').click();
  await host.locator('.deckspotlightcontinue').click();
  await host.locator('[data-live-players="2"]').click();
  await host.locator('.setupnext:visible').click();
  await host.locator('.reviewstart').click();
  await host.locator('.online-invite b').waitFor();
  const invite = await host.locator('.online-invite b').innerText();
  // Expand an existing invitation, then configure interleaved seats.
  for (const count of [3, 4]) {
    await host.getByRole('button', { name: 'Add seat', exact: true }).click();
    await until(() => latest('host')?.seats.length === count, `resize to ${count}`);
  }
  const botDecks = ['Elven Council', 'Doom Prevails', 'Turtle Power'];
  for (const seat of botSeats) {
    await host.getByLabel(`Seat ${seat + 1} type`).selectOption('bot');
    await until(() => latest('host')?.seats[seat]?.kind === 'bot', `bot seat ${seat}`);
    await host.getByLabel(`Bot ${seat + 1} deck`, { exact: true }).selectOption(botDecks[seat - 1]);
    await until(() => latest('host')?.seats[seat]?.ready, `bot ${seat} ready`);
  }
  const guests = [];
  for (const seat of [1, 2, 3].filter(seat => !botSeats.includes(seat))) {
    const name = `guest-${seat}`;
    const guest = await pageFor(name);
    // Every remote human has an actual saved private list that starts with lands.
    const deck = `Live Forests Seat ${seat}`;
    await guest.locator('[data-menu-action="import"]').first().click();
    await guest.waitForFunction(() => document.querySelector('.mainmenu-deckimport')?.dataset.librarySource === 'guest');
    await guest.locator('.mainmenu-deckimport-name').fill(deck);
    await guest.locator('.mainmenu-deckimport-text').fill('Commander\n1 Dwynen, Gilt-Leaf Daen\n\nDeck\n1 Sol Ring\n98 Forest');
    await guest.locator('.mainmenu-deckimport-check').click();
    await guest.locator('.mainmenu-deckimport-start').click();
    await guest.locator('.deckspotlight').waitFor();
    await guest.goto(invite, { waitUntil: 'domcontentloaded' });
    await guest.locator('.online-deck-select').selectOption(deck);
    await until(() => latest(name)?.you === seat && latest('host')?.seats[seat]?.ready, `human assigned seat ${seat}`);
    guests.push({ name, page: guest, seat });
  }
  const clipped = await host.locator('.onlineseat').evaluateAll(cards => cards.flatMap(card => {
    const box = card.getBoundingClientRect();
    return [...card.querySelectorAll('select')].filter(select => select.getBoundingClientRect().bottom > box.bottom).map(select => select.getAttribute('aria-label'));
  }));
  assert.deepEqual(clipped, [], 'lobby artwork must not clip human/bot selectors');
  await host.screenshot({ path: `${out}/01-mixed-lobby.png`, fullPage: true, mask: [host.locator('.online-invite b')] });
  check(`${4 - botSeats.length} humans + ${botSeats.length} bots configured through lobby and old invite`);
  await host.locator('.online-start').click();
  await host.waitForFunction(() => !!window._game);
  await host.evaluate(() => { _game.speedFactor = 0; });
  const kept = new Set();
  await until(async () => {
    if (!kept.has('host') && await clickVisible(host, /^Keep ✓$/)) kept.add('host');
    for (const guest of guests) if (!kept.has(guest.name) && latest(guest.name)?.pendingDecision?.type === 'mulligan') {
      // No Playwright auto-scroll: prove the user can see the controls on arrival.
      const box = await guest.page.getByRole('button', { name: 'Keep ✓', exact: true }).boundingBox();
      assert.ok(box.y >= 0 && box.y + box.height <= 768, `${guest.name} Keep outside MacBook viewport: ${JSON.stringify(box)}`);
      await guest.page.screenshot({ path: `${out}/02-${guest.name}-keep.png` });
      if (await clickVisible(guest.page, /^Keep ✓$/)) kept.add(guest.name);
    }
    return kept.size === guests.length + 1;
  }, 'all human opening decisions', 60000);
  assert.deepEqual(await host.evaluate(() => _game.players.filter(p => p.isAI).map(p => p.onlineSeat).sort()), botSeats);
  check('all opening controls visible at 1365×768 and correct local AI seats instantiated');

  // Compare the controls every human actually receives, then exercise each
  // browser's independent settings. Imported decks may additionally expose Judge.
  for (const [name, page] of pages) {
    await page.locator('.ct-decision-rail').waitFor();
    const toolbar = await page.locator('.topbtns button').evaluateAll(buttons => buttons.map(button => ({
      label: button.querySelector('span:last-of-type')?.textContent.trim(), disabled: button.disabled,
    })));
    await page.locator('.menubutton').click();
    const menu = await page.locator('.quickmenuitem > span').allTextContents();
    if (controls.length) {
      assert.deepEqual(toolbar, controls[0].toolbar, `${name} must receive the host toolbar`);
      for (const command of controls[0].menu) assert.ok(menu.includes(command), `${name} is missing host command: ${command}`);
    }
    controls.push({ name, toolbar, menu });
    await page.getByRole('button', { name: /^Priority stops/ }).click();
    assert.equal(await page.evaluate(() => _ui.showStops), true, `${name} can open priority settings`);
    await page.keyboard.press('Escape');
    await page.locator('.manamode').click();
    assert.equal(await page.evaluate(() => _ui.manaMode === 'manual' && _ui.me.manualMana), true, `${name} can choose manual mana`);
    for (const [otherName, other] of pages) if (other !== page) {
      assert.equal(await other.evaluate(() => _ui.manaMode), 'auto', `${name} must not change ${otherName}'s mana preference`);
    }
    await page.locator('.manamode').click();
    await page.getByRole('button', { name: 'HOLD', exact: true }).click();
    assert.equal(await page.evaluate(() => _ui.holdNext), true, `${name} can arm HOLD`);
    await page.getByRole('button', { name: 'HOLD', exact: true }).click();
    assert.equal(await page.evaluate(() => _ui.holdNext), false, `${name} can cancel HOLD`);
  }
  check('every human has the host toolbar and menu commands, working priority settings, independent MANA and HOLD');

  const advance = async (hold = null, holdPhase = null) => {
    const hostChoice = await host.evaluate(() => ({ type: _ui.pending?.q.type, min: _ui.pending?.q.min, selected: _ui.pending?.sel.length }));
    if (hostChoice.type === 'chooseCards') {
      if (hostChoice.selected < hostChoice.min) await host.locator('.modal .cardgrid > :not(.selected)').first().click();
      await clickVisible(host, /^Confirm/, 'body');
    }
    await clickVisible(host, /^(Continue|End turn|Proceed|No attacks|No blocks)/);
    for (const guest of guests) {
      const decision = await guest.page.evaluate(() => _ui.pending?.q && { type: _ui.pending.q.type, phase: _ui.game.phase });
      if (guest === hold && decision?.type === 'main' && (!holdPhase || decision.phase === holdPhase)) continue;
      if (decision?.type === 'chooseCards' || decision?.type === 'bottomCards') {
        const count = await guest.page.evaluate(() => Math.max(0, (_ui.pending.q.min ?? _ui.pending.q.n ?? 0) - _ui.pending.sel.length));
        for (let index = 0; index < count; index++) await guest.page.locator('.modal .cardgrid > :not(.selected)').first().click();
        await clickVisible(guest.page, /^Confirm/);
      }
      await clickVisible(guest.page, /^(Continue|End turn|Proceed|No attacks|No blocks)/);
    }
  };
  for (const guest of guests) {
    await until(async () => {
      if (await guest.page.evaluate(() => _ui.pending?.q.type === 'main')) return true;
      await advance(guest);
      return false;
    }, `${guest.name} main decision`, 90000);
    const view = latest(guest.name);
    assert.ok(view.gameView.players.filter(p => p.seat !== guest.seat).every(p => !('hand' in p)));
    await guest.page.evaluate(() => window.scrollTo(0, 0));
    await guest.page.locator('.hcard[data-cname="Forest"]').first().click();
    const land = guest.page.locator('.sheetacts').getByRole('button', { name: /Play land/ }).first();
    const box = await land.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 768, 'land action immediately visible');
    // Ensure this action is not replaced by a public sync while focused.
    await land.focus();
    await guest.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await guest.page.mouse.down();
    const handle = await land.elementHandle();
    await guest.page.evaluate(() => { window.__liveFocusedControl = document.activeElement; });
    const previousRevision = latest(guest.name).revision;
    await host.evaluate(() => _game.note('render', {}));
    await until(() => latest(guest.name).revision > previousRevision, 'public sync while action is focused');
    await new Promise(resolve => setTimeout(resolve, 350));
    assert.equal(await handle.evaluate(node => node.isConnected && document.activeElement === window.__liveFocusedControl), true);
    await guest.page.mouse.up();
    await until(() => latest(guest.name)?.gameView?.battlefield.some(c => c.controllerSeat === guest.seat && c.name === 'Forest'), `${guest.name} paid land action`);
    check(`${guest.name} private controls retain focus across sync and play Forest`);
  }
  if (guests.length) {
    const guest = guests[0];
    await until(async () => {
      if (await guest.page.evaluate(() => _ui.pending?.q.type === 'main' && _ui.game.phase === 'main1')) return true;
      await advance(guest, 'main1'); return false;
    }, 'guest main for paid cast', 90000);
    // Controlled fixture: expose the existing Sol Ring, then refresh through the next real decision.
    await host.evaluate(async seat => {
      const p = _game.players.find(p => p.onlineSeat === seat);
      const ring = p.library.find(c => c.name === 'Sol Ring');
      if (ring) await _game.move(ring, 'hand');
    }, guest.seat);
    await clickVisible(guest.page, /^(Continue|End turn)/);
    await until(async () => {
      if (await guest.page.evaluate(() => _ui.pending?.q.type === 'main' && _ui.pending.q.casts.some(c => c.card.name === 'Sol Ring'))) return true;
      await advance(guest); return false;
    }, 'guest legal Sol Ring cast', 90000);
    await guest.page.locator('.hcard[data-cname="Sol Ring"]').click();
    await guest.page.locator('.sheetacts').getByRole('button', { name: /^Cast/ }).click();
    await until(() => latest(guest.name)?.gameView?.stack.some(c => c.name === 'Sol Ring'), 'Sol Ring on shared Stack');
    await until(async () => {
      if (latest(guest.name)?.gameView?.battlefield.some(c => c.controllerSeat === guest.seat && c.name === 'Sol Ring')) return true;
      await advance(); return false;
    }, 'paid Sol Ring resolves', 60000);
    check('guest pays mana, casts Sol Ring onto shared Stack, all humans pass and resolution reaches battlefield');
    await guest.page.evaluate(() => window.scrollTo(0, 0));
    await guest.page.screenshot({ path: `${out}/03-guest-cast.png` });
    await guest.page.setViewportSize({ width: 390, height: 844 });
    await guest.page.evaluate(() => window.scrollTo(0, 0));
    const fit = await guest.page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(fit.document <= fit.width, `mobile overflow: ${JSON.stringify(fit)}`);
    await guest.page.screenshot({ path: `${out}/04-guest-mobile.png` });
    await guest.page.setViewportSize({ width: 1365, height: 768 });
    const rev = latest(guest.name).revision;
    await guest.page.reload({ waitUntil: 'domcontentloaded' });
    await until(async () => {
      if (latest(guest.name)?.revision > rev && latest(guest.name)?.phase === 'running') return true;
      await clickVisible(host, /^Resume live game$/, 'body'); return false;
    }, 'same mixed guest seat reconnects and resumes', 30000);
    assert.equal(latest(guest.name).you, guest.seat);
    check('mixed-table guest reload and host resume preserve the human seat');
  }
  await until(async () => {
    const developed = await host.evaluate(() => _game.players.filter(p => p.isAI).every(p => _game.battlefield.some(c => c.ctrl === p && c.is('Land'))));
    if (developed) return true;
    await advance(); return false;
  }, 'all local bots play their turns and develop mana', 90000);
  check('every configured local bot independently plays a land');
  assert.deepEqual(errors, []);
  check('no browser page or console errors');
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: true, browserName, botSeats, checks, controls, errors }, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, output: out }));
} catch (error) {
  for (const [name, page] of pages) {
    await page.screenshot({ path: `${out}/failure-${name}.png`, mask: [page.locator('.online-invite b')] }).catch(() => {});
    const visibleText = await page.locator('body').innerText().catch(() => 'Page unavailable');
    writeFileSync(`${out}/failure-${name}.txt`, visibleText.replace(/https?:\/\/\S+\?\S*/g, '[private room URL]'));
  }
  writeFileSync(`${out}/result.json`, JSON.stringify({ ok: false, base, checks, controls, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await browser.close();
  if (server) {
    for (const client of server.commanderLive.clients) client.ws.terminate();
    await new Promise(resolve => server.close(resolve));
  }
}
