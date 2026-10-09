// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright index.mjs.
// The API, credentials, library records and browser profiles are isolated locally.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createAccountHandler, MemoryAccountStore } from '../../api/account.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = `${root}output/custom-deck-name-2026-10-09`;
mkdirSync(output, { recursive: true });
const commander = "Yuriko, the Tiger's Shadow";
const defaultName = `Imported — ${commander}`;
const explicitName = 'Yuriko cEDH';
const rawText = readFileSync(new URL('../fixtures/yuriko-custom-deck.txt', import.meta.url), 'utf8');
const deckText = rawText.trimEnd().replace(/1 Yuriko, the Tiger's Shadow$/, `1 ${commander} *CMDR*`);
assert.notEqual(deckText, rawText.trimEnd(), 'the screenshot marks its final Yuriko line as commander');

const app = express();
app.use('/api/account', createAccountHandler({ store: new MemoryAccountStore(), limiter: null }));
app.use(express.static(root));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
});
const errors = [];
let currentPage;
const proof = { viewport: { width: 390, height: 844 }, inputCards: 100, commander, guest: {}, account: {} };

async function pageFor(context) {
  const page = await context.newPage();
  await page.setViewportSize(proof.viewport);
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

const library = page => page.evaluate(() => MTG.getImportedDeckLibrary().entries.map(entry => entry.record));

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile page has no horizontal overflow');
  assert.equal(await page.evaluate(() => {
    const panel = document.querySelector('.mainmenu-deckimport-panel, .deckspotlight');
    return !panel || panel.scrollWidth <= panel.clientWidth;
  }), true, 'mobile dialog has no horizontal overflow');
}

async function importer(page) {
  if (await page.locator('.deckspotlightclose').count()) await page.locator('.deckspotlightclose').click();
  if (await page.locator('.setuphome').count()) await page.locator('.setuphome').click();
  await page.locator('[data-menu-action="import"]').first().click();
  await page.waitForSelector('.mainmenu-deckimport-panel');
  await page.waitForFunction(() => !MTGAccount.loading && document.querySelector('.mainmenu-deckimport')?.dataset.librarySource !== 'loading');
}

async function checkedImport(page, preferredName, expectedName, screenshot) {
  await importer(page);
  await page.locator('.mainmenu-deckimport-name').fill(preferredName || '');
  await page.locator('.mainmenu-deckimport-text').fill(deckText);
  await page.locator('.mainmenu-deckimport-check').click();
  assert.equal(await page.evaluate(() => JSON.parse(render_game_to_text()).deckImport.state), 'ready');
  const status = page.locator('.mainmenu-deckimport-result');
  assert.match(await status.innerText(), /100 cards/);
  assert.match(await status.innerText(), /100 engine-certified/);
  assert.equal(await status.locator('b').innerText(), expectedName, 'Ready preview names the new record');
  await noOverflow(page);
  if (screenshot) {
    await status.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    await page.screenshot({ path: `${output}/${screenshot}` });
  }
  await page.locator('.mainmenu-deckimport-start').click();
  await page.waitForSelector('.deckspotlight');
  assert.equal(await page.locator('.deckspotlight h2').innerText(), expectedName, 'spotlight shows the saved name');
  assert.equal(await page.evaluate(() => JSON.parse(render_game_to_text()).selectedDeck), expectedName);
  assert.equal(await page.evaluate(() => !!window._game), false, 'saving does not start a game');
  await noOverflow(page);
  const records = await library(page);
  const record = records.find(row => row.name === expectedName);
  assert.ok(record, 'saved deck is present in My Library');
  assert.deepEqual(record.commanders, [commander]);
  assert.equal(record.cards.reduce((count, row) => count + row.n, 0), 100);
  return record;
}

try {
  const guestContext = await browser.newContext();
  const guest = await pageFor(guestContext);
  const firstGuest = await checkedImport(guest, undefined, defaultName);
  const firstGuestSnapshot = JSON.stringify(firstGuest);
  const secondGuest = await checkedImport(guest, undefined, `${defaultName} (2)`, '01-guest-duplicate-ready.png');
  assert.notEqual(secondGuest.id, firstGuest.id);
  assert.deepEqual(secondGuest.cards, firstGuest.cards);
  assert.equal(JSON.stringify((await library(guest)).find(row => row.id === firstGuest.id)), firstGuestSnapshot);
  assert.match(await guest.locator('.deckspotlight').innerText(), /Saved in this browser/);
  await guest.screenshot({ path: `${output}/02-guest-suffix-spotlight.png` });
  await guest.reload();
  await importer(guest);
  const guestReloaded = await library(guest);
  assert.deepEqual(guestReloaded.map(row => row.name), [defaultName, `${defaultName} (2)`]);
  assert.equal(JSON.stringify(guestReloaded.find(row => row.id === firstGuest.id)), firstGuestSnapshot);
  assert.equal(await guest.locator('.mainmenu-decklibrary-card').count(), 2);
  await noOverflow(guest);
  proof.guest = { names: guestReloaded.map(row => row.name), distinctIds: true, originalUnchanged: true, persistedAfterReload: true };
  console.log('PASS mobile guest: repeated unnamed exact Yuriko list saves (2); original and IDs preserved after reload');

  const accountContext = await browser.newContext();
  const registration = await accountContext.request.post(`${base}/api/account`, {
    data: { action: 'register', displayName: 'Yuriko local QA', email: 'yuriko-local-qa@example.test', password: 'Local-only-Yuriko-934800!' },
  });
  const registered = await registration.json();
  assert.equal(registered.ok, true, registered.error);
  const account = await pageFor(accountContext);
  const firstAccount = await checkedImport(account, undefined, defaultName);
  const firstAccountSnapshot = JSON.stringify(firstAccount);
  const secondAccount = await checkedImport(account, undefined, `${defaultName} (2)`, '03-account-duplicate-ready.png');
  assert.notEqual(secondAccount.id, firstAccount.id);
  const firstNamed = await checkedImport(account, explicitName, explicitName);
  const firstNamedSnapshot = JSON.stringify(firstNamed);
  const secondNamed = await checkedImport(account, explicitName, `${explicitName} (2)`, '04-account-explicit-duplicate-ready.png');
  assert.notEqual(secondNamed.id, firstNamed.id);
  assert.match(await account.locator('.deckspotlight').innerText(), /Saved to your account/);
  assert.equal(await account.evaluate(() => localStorage.getItem(MTG.IMPORTED_LIBRARY_KEY)), null, 'account saves never enter guest storage');
  assert.deepEqual(secondAccount.cards, firstAccount.cards);
  assert.deepEqual(secondNamed.cards, firstNamed.cards);
  await account.reload();
  await importer(account);
  const accountReloaded = await library(account);
  const expectedNames = [defaultName, `${defaultName} (2)`, explicitName, `${explicitName} (2)`];
  assert.deepEqual(accountReloaded.map(row => row.name).sort(), expectedNames.slice().sort());
  assert.equal(new Set(accountReloaded.map(row => row.id)).size, 4, 'each import keeps a fresh ID');
  assert.equal(JSON.stringify(accountReloaded.find(row => row.id === firstAccount.id)), firstAccountSnapshot);
  assert.equal(JSON.stringify(accountReloaded.find(row => row.id === firstNamed.id)), firstNamedSnapshot);
  assert.equal(await account.locator('.mainmenu-decklibrary-card').count(), 4);
  await noOverflow(account);
  await account.screenshot({ path: `${output}/05-account-library-reloaded.png` });
  assert.equal(await account.evaluate(() => !!window._game), false);
  proof.account = { names: accountReloaded.map(row => row.name), distinctIds: true, originalsUnchanged: true, persistedAfterReload: true, guestStorageUnused: true };
  console.log('PASS mobile account: repeated default and explicit names save unique suffixes; all four records survive reload unchanged');
  assert.deepEqual(errors, [], 'browser emits no console or page errors');
  proof.browserErrors = errors;
  proof.gameStarted = false;
  writeFileSync(`${output}/result.json`, JSON.stringify(proof, null, 2) + '\n');
  console.log('PASS Ready preview, spotlight names, mobile layout and no browser errors; no game started');
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
