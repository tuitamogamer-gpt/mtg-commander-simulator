// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright index.mjs,
// or install Playwright locally. All accounts and writes use an isolated local store.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/web-game/imported-pod-flow`;
mkdirSync(output, { recursive: true });
const manifest = JSON.parse(readFileSync(new URL('../../reports/oracle-import/sauron-dark-lord-moxfield.json', import.meta.url), 'utf8'));
const deckText = Object.entries(manifest.sections).flatMap(([section, rows]) => [
  section === 'Commander' ? 'Commander' : 'Deck',
  ...rows.map(row => `${row.quantity} ${row.name}${section === 'Commander' ? ' *CMDR*' : ''}`),
  '',
]).join('\n');

const app = express();
const store = new MemoryAccountStore();
app.use('/api/account', createAccountHandler({ store, limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
let currentPage;

async function pageFor(context, viewport = { width: 1440, height: 1000 }) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('mtgOnboardingComplete', '1');
    localStorage.setItem('mtgReducedMotion', '1');
  });
  await page.goto(base);
  currentPage = page;
  return page;
}
const state = page => page.evaluate(() => JSON.parse(window.render_game_to_text()));
const reviewPod = page => page.locator('.podstage .pbtn.start:visible, .podstage .setupnext:visible').click();
async function spotlightArt(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.deckspotlight img')].every(img => img.complete && img.naturalWidth > 1), null, { timeout: 60000 });
}
async function importer(page) {
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForSelector('.mainmenu-deckimport-panel');
  await page.waitForFunction(() => !window.MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource !== 'loading');
}
async function register(context, suffix) {
  const response = await context.request.post(`${base}/api/account`, {
    data: { action: 'register', displayName: `Pod QA ${suffix}`, email: `pod-${suffix}@example.test`, password: 'Local-QA-only-829300!' },
  });
  const payload = await response.json();
  assert.equal(payload.ok, true, payload.error);
}
async function importDeck(page, name) {
  await importer(page);
  await page.locator('.mainmenu-deckimport-name').fill(name);
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  assert.equal((await state(page)).deckImport.state, 'ready');
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForSelector('.deckspotlight');
  assert.equal((await state(page)).selectedDeck, name);
  assert.equal(await page.evaluate(() => !!window._game), false, 'save does not start a game');
  assert.equal(await page.locator('.deckspotlightcontinue').textContent(), 'Build this pod →');
}
async function configure(page) {
  await page.locator('.deckspotlightcontinue').click();
  assert.equal((await state(page)).stage, 'pod');
  assert.equal(await page.locator('[data-mode="online"]').isDisabled(), true, 'custom decks stay in supported Solo flow');
  await page.locator('[data-ai-count="2"]').click();
  const deckSelects = page.locator('.botfields .deckselect');
  await deckSelects.nth(0).selectOption('Quick Draw');
  await deckSelects.nth(1).selectOption('Elven Council');
  const styleSelects = page.locator('.botfields .styleselect:not(.deckselect)');
  await styleSelects.nth(0).selectOption('aggressive');
  await styleSelects.nth(1).selectOption('passive');
  await page.locator('.advancedrules summary').click();
  await page.locator('[data-difficulty="hard"]').click();
  await reviewPod(page);
  assert.equal((await state(page)).stage, 'review');
  const review = await page.locator('.reviewstage').innerText();
  assert.match(review, /Quick Draw/);
  assert.match(review, /Elven Council/);
  assert.match(review, /hard/i);
  assert.equal(await page.evaluate(() => !!window._game), false, 'review does not start a game');
  await page.locator('.reviewback').click();
  assert.deepEqual(await deckSelects.evaluateAll(selects => selects.map(select => select.value)), ['Quick Draw', 'Elven Council']);
  await reviewPod(page);
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal overflow');
}

try {
  const context = await browser.newContext();
  await register(context, 'owner');
  const page = await pageFor(context);
  await importDeck(page, 'Sauron Pod QA');
  assert.match(await page.locator('.deckspotlight').innerText(), /Saved to your account/);
  const saved = await page.evaluate(() => window.MTGAccount.decks[0]);
  assert.equal(saved.schema, 'commander-deck/v1');
  assert.equal(await page.evaluate(() => localStorage.getItem(MTG.IMPORTED_LIBRARY_KEY)), null, 'account deck is not stored as guest');
  await spotlightArt(page);
  await page.screenshot({ path: `${output}/01-account-spotlight.png` });
  await noOverflow(page);
  console.log('PASS account save → spotlight; no auto-start');

  await page.reload();
  await importer(page);
  assert.equal(await page.locator('.mainmenu-decklibrary-card').count(), 1);
  assert.equal(await page.locator('.mainmenu-deckimport-text').inputValue(), '');
  await page.locator('.mainmenu-decklibrary-play').click();
  await page.waitForSelector('.deckspotlight');
  await configure(page);
  await page.screenshot({ path: `${output}/02-custom-pod-review.png` });
  await noOverflow(page);
  console.log('PASS reload → select → Build this pod → chosen opponents/styles → Review');

  await page.locator('.reviewstart').click();
  await page.waitForFunction(() => !!window._game && JSON.parse(render_game_to_text()).pending?.type === 'mulligan');
  const players = await page.evaluate(() => window._game.players.map(player => ({ deck: player.deckName, ai: player.isAI, style: player.aiStyle, difficulty: player.controller.difficulty })));
  assert.equal(players.length, 3);
  assert.deepEqual(players.filter(player => player.ai).map(player => player.deck).sort(), ['Elven Council', 'Quick Draw']);
  assert.equal(players.find(player => player.deck === 'Quick Draw').style, 'aggressive');
  assert.equal(players.find(player => player.deck === 'Elven Council').style, 'passive');
  // The mulligan modal covers MENU; test its unavailable action without
  // bypassing that modal in the real UI flow below.
  const unavailableJudge = await page.evaluate(() => {
    const ui = window._ui;
    ui.quickMenuOpen = true;
    try {
      const menu = ui.renderQuickMenu(window._game);
      const judge = [...menu.querySelectorAll('.quickmenuitem')].find(button => button.textContent.startsWith('Judge'));
      judge.onclick();
      return { disabled: judge.disabled, opened: !!ui.showJudge };
    } finally { ui.quickMenuOpen = false; }
  });
  assert.deepEqual(unavailableJudge, { disabled: true, opened: false }, 'Judge requires a safe checkpoint, even if a stale click callback fires');
  await page.getByRole('button', { name: /Keep/ }).click();
  for (let step = 0; step < 300; step++) {
    if ((await state(page)).pending?.type === 'main') break;
    const proceed = page.getByRole('button', { name: /Proceed|Continue to my turn|Got it|No attacks|No blocks/ });
    if (await proceed.count()) await proceed.last().click();
    await page.evaluate(() => window.advanceTime(500));
    await page.waitForTimeout(30);
  }
  assert.equal((await state(page)).pending.type, 'main');
  assert.equal(await page.locator('.promptbar').getByRole('button', { name: /Judge/ }).count(), 0);
  await page.locator('.menubutton').click();
  await page.locator('.quickmenuitem').filter({ hasText: /^Judge/ }).click();
  await page.getByText('⚒️ Judge panel: manual actions', { exact: true }).waitFor();
  assert.equal(await page.locator('.quickmenu').count(), 0, 'menu closes before Judge opens');
  await page.screenshot({ path: `${output}/03-judge-from-menu.png` });
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  const human = (await state(page)).players.find(player => !player.isAI);
  const land = human.hand.find(card => card.types.includes('Land'));
  assert.ok(land, 'opening hand has a land to exercise real gameplay');
  await page.locator(`.hcard[data-cname="${land.name}"]`).first().click();
  await page.getByRole('button', { name: 'Play land', exact: true }).click();
  await page.waitForFunction(name => JSON.parse(render_game_to_text()).players.find(player => !player.isAI).battlefield.some(card => card.name === name), land.name);
  await page.screenshot({ path: `${output}/04-human-land-play.png` });
  console.log('PASS chosen pod starts; Judge in MENU only; real human land play');

  const secondDevice = await browser.newContext();
  const login = await secondDevice.request.post(`${base}/api/account`, { data: { action: 'login', email: 'pod-owner@example.test', password: 'Local-QA-only-829300!' } });
  assert.equal((await login.json()).ok, true);
  const mobile = await pageFor(secondDevice, { width: 390, height: 844 });
  await importer(mobile);
  assert.equal(await mobile.locator('.mainmenu-decklibrary-card').count(), 1, 'same account sees deck in a fresh browser');
  await mobile.locator('.mainmenu-decklibrary-play').click();
  await mobile.waitForSelector('.deckspotlight');
  await spotlightArt(mobile);
  await noOverflow(mobile);
  await mobile.screenshot({ path: `${output}/05-fresh-device-spotlight.png` });
  await mobile.locator('.deckspotlightcontinue').click();
  await reviewPod(mobile);
  await noOverflow(mobile);
  await mobile.screenshot({ path: `${output}/06-mobile-review.png` });
  await mobile.evaluate(() => MTGAccount.logout());
  await mobile.waitForFunction(() => !document.querySelector('[data-imported-deck-id]'));
  assert.equal(await mobile.evaluate(() => !!window._game), false);
  console.log('PASS fresh-device account library; mobile pod; logout hides custom deck');

  const other = await browser.newContext();
  await register(other, 'other');
  const otherPage = await pageFor(other);
  await importer(otherPage);
  assert.equal(await otherPage.locator('.mainmenu-decklibrary-card').count(), 0, 'another account cannot see the deck');

  const guest = await browser.newContext();
  const guestPage = await pageFor(guest);
  const guestName = 'Sauron " data-injected="yes';
  await importDeck(guestPage, guestName);
  assert.match(await guestPage.locator('.deckspotlight').innerText(), /Saved in this browser/);
  await guestPage.reload();
  await importer(guestPage);
  assert.equal(await guestPage.locator('.mainmenu-decklibrary-card').count(), 1);
  await guestPage.locator('.mainmenu-decklibrary-play').click();
  await guestPage.locator('.deckspotlightclose').click();
  await guestPage.locator('[data-imported-deck-id] .deckfavorite').click();
  await guestPage.locator('.decktools input').fill('sauron unmatched-qa');
  const alternatives = guestPage.locator('.deckemptyalternatives [data-alt-deck]');
  assert.ok((await alternatives.evaluateAll(buttons => buttons.map(button => button.dataset.altDeck))).includes(guestName), 'a quoted custom name survives recommendation markup');
  assert.equal(await guestPage.locator('.deckemptyalternatives [data-injected]').count(), 0, 'custom names cannot inject HTML attributes');
  await alternatives.filter({ hasText: guestName }).click();
  assert.equal(await guestPage.evaluate(() => document.activeElement?.closest('[data-deck]')?.dataset.deck), guestName, 'fallback action focuses the exact quoted deck');
  await guestPage.locator('[data-imported-deck-id] .deckcard').click();
  await guestPage.locator('.deckspotlightcontinue').click();
  await reviewPod(guestPage);
  await guestPage.evaluate(() => { MTG.CARD_CATALOG['Sol Ring'].deckImportEligible = false; });
  await guestPage.locator('.reviewstart').click();
  await guestPage.waitForSelector('.debugimportstatus.error');
  assert.equal(await guestPage.evaluate(() => !!window._game), false, 'changed semantic support blocks final start');
  assert.match(await guestPage.locator('.debugimportstatus.error').innerText(), /Sol Ring.*not semantically certified/);
  console.log('PASS account isolation; guest persistence; quoted-name fallback; final-start semantic revalidation');
  assert.deepEqual(errors, []);
  console.log('PASS no browser console/page errors');
} catch (error) {
  if (currentPage) {
    await currentPage.screenshot({ path: `${output}/failure.png` });
    console.error((await currentPage.locator('body').innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
